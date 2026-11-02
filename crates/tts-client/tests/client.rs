//! Test của `tts-client` với worker giả (`fake-tts-worker`): đọc, hủy, chết và chạy lại, tắt khi chết nhiều lần, lệch giao thức,
//! rảnh thì tắt, câu mới hủy câu cũ.

use std::process::{Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tts_client::{Config, Event, Failure, Language, Spawner, TtsClient};

fn spawner(envs: &'static [(&'static str, &'static str)]) -> (Spawner, Arc<Mutex<u32>>) {
    let count = Arc::new(Mutex::new(0u32));
    let c = count.clone();
    let sp: Spawner = Arc::new(move || {
        *c.lock().unwrap() += 1;
        let mut cmd = Command::new(env!("CARGO_BIN_EXE_fake-tts-worker"));
        for (k, v) in envs {
            cmd.env(k, v);
        }
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
    });
    (sp, count)
}

fn fast(sp: Spawner) -> Config {
    let mut cfg = Config::new(sp);
    cfg.restart_delays = vec![Duration::from_millis(20); 3];
    cfg.ready_timeout = Duration::from_secs(2);
    cfg
}

fn speak(c: &TtsClient, text: &str) -> (u64, Receiver<Event>) {
    let (tx, rx) = mpsc::channel();
    let id = c.speak(Language::Vi, text, None, move |e| {
        let _ = tx.send(e);
    });
    (id, rx)
}

fn drain(rx: &Receiver<Event>) -> Vec<Event> {
    let mut v = Vec::new();
    loop {
        let e = rx.recv_timeout(Duration::from_secs(5)).expect("hết hạn chờ sự kiện");
        let fin = matches!(e, Event::Done | Event::Failed(_));
        v.push(e);
        if fin {
            return v;
        }
    }
}

#[test]
fn speaks_and_is_lazy() {
    let (sp, count) = spawner(&[]);
    let c = TtsClient::new(fast(sp));
    assert!(!c.is_running(), "chưa có yêu cầu thì không có tiến trình");
    assert_eq!(*count.lock().unwrap(), 0);
    let (_, rx) = speak(&c, "xin chào");
    let ev = drain(&rx);
    assert_eq!(ev.len(), 4);
    assert!(matches!(ev[0], Event::Audio(ref p) if p.len() == "xin chào".len()));
    assert_eq!(ev[3], Event::Done);
    assert!(c.is_running());
    let (_, rx) = speak(&c, "lần hai");
    assert_eq!(drain(&rx).last(), Some(&Event::Done));
    assert_eq!(*count.lock().unwrap(), 1, "dùng lại cùng một worker");
}

#[test]
fn new_sentence_cancels_the_one_being_read() {
    let (sp, _) = spawner(&[]);
    let c = TtsClient::new(fast(sp));
    let (_, rx1) = speak(&c, "slow");
    assert!(matches!(
        rx1.recv_timeout(Duration::from_secs(5)).unwrap(),
        Event::Audio(_)
    ));
    let (_, rx2) = speak(&c, "câu mới");
    let ev1 = drain(&rx1);
    assert_eq!(ev1.last(), Some(&Event::Failed(Failure::Cancelled)));
    assert!(ev1.len() < 20, "phải dừng sớm, không đọc hết 20 đoạn");
    assert_eq!(drain(&rx2).last(), Some(&Event::Done));
}

#[test]
fn explicit_cancel_stops_a_slow_sentence() {
    let (sp, _) = spawner(&[]);
    let c = TtsClient::new(fast(sp));
    let (id, rx) = speak(&c, "slow");
    assert!(matches!(
        rx.recv_timeout(Duration::from_secs(5)).unwrap(),
        Event::Audio(_)
    ));
    c.cancel(id);
    assert_eq!(drain(&rx).last(), Some(&Event::Failed(Failure::Cancelled)));
    let (_, rx) = speak(&c, "vẫn dùng được");
    assert_eq!(drain(&rx).last(), Some(&Event::Done));
}

#[test]
fn worker_death_fails_pending_then_restarts() {
    let (sp, count) = spawner(&[]);
    let c = TtsClient::new(fast(sp));
    let (_, rx) = speak(&c, "crash");
    assert_eq!(drain(&rx).last(), Some(&Event::Failed(Failure::WorkerDied)));
    let (_, rx) = speak(&c, "sau khi chết");
    assert_eq!(drain(&rx).last(), Some(&Event::Done));
    assert_eq!(*count.lock().unwrap(), 2, "chạy lại một worker mới");
    assert!(c.disabled_reason().is_none());
}

#[test]
fn three_deaths_disable_until_restart() {
    let (sp, count) = spawner(&[]);
    let c = TtsClient::new(fast(sp));
    for _ in 0..3 {
        let (_, rx) = speak(&c, "crash");
        let last = drain(&rx).pop().unwrap();
        assert!(matches!(
            last,
            Event::Failed(Failure::WorkerDied) | Event::Failed(Failure::Disabled(_))
        ));
    }
    assert!(c.disabled_reason().is_some());
    let spawned = *count.lock().unwrap();
    let (_, rx) = speak(&c, "xin chào");
    assert!(matches!(drain(&rx).last(), Some(Event::Failed(Failure::Disabled(_)))));
    assert_eq!(*count.lock().unwrap(), spawned, "đã tắt thì không chạy thêm tiến trình");
}

#[test]
fn a_successful_read_resets_the_death_count() {
    let (sp, _) = spawner(&[]);
    let c = TtsClient::new(fast(sp));
    for _ in 0..4 {
        let (_, rx) = speak(&c, "crash");
        drain(&rx);
        let (_, rx) = speak(&c, "ổn");
        assert_eq!(drain(&rx).last(), Some(&Event::Done));
    }
    assert!(c.disabled_reason().is_none());
}

#[test]
fn protocol_mismatch_disables_immediately() {
    let (sp, count) = spawner(&[("FAKE_PROTOCOL", "99")]);
    let c = TtsClient::new(fast(sp));
    let (_, rx) = speak(&c, "xin chào");
    assert!(matches!(drain(&rx).last(), Some(Event::Failed(Failure::Disabled(r))) if r.contains("giao thức")));
    assert_eq!(*count.lock().unwrap(), 1, "không thử lại");
    assert!(c.disabled_reason().is_some());
}

#[test]
fn missing_model_disables_without_retry() {
    let (sp, count) = spawner(&[]);
    let c = TtsClient::new(fast(sp));
    let (_, rx) = speak(&c, "model");
    assert_eq!(drain(&rx).last(), Some(&Event::Failed(Failure::ModelMissing)));
    std::thread::sleep(Duration::from_millis(100));
    assert!(c.disabled_reason().is_some());
    assert_eq!(*count.lock().unwrap(), 1);
}

#[test]
fn spawn_failure_disables_with_reason() {
    let sp: Spawner = Arc::new(|| Err(std::io::Error::new(std::io::ErrorKind::NotFound, "không có binary")));
    let c = TtsClient::new(fast(sp));
    let (_, rx) = speak(&c, "xin chào");
    assert!(matches!(drain(&rx).last(), Some(Event::Failed(Failure::Disabled(r))) if r.contains("không chạy được")));
}

#[test]
fn missing_ready_times_out_as_death() {
    let (sp, _) = spawner(&[("FAKE_NO_READY", "1")]);
    let mut cfg = fast(sp);
    cfg.ready_timeout = Duration::from_millis(300);
    let c = TtsClient::new(cfg);
    let (_, rx) = speak(&c, "xin chào");
    assert!(matches!(
        drain(&rx).last(),
        Some(Event::Failed(Failure::WorkerDied)) | Some(Event::Failed(Failure::Disabled(_)))
    ));
}

#[test]
fn idle_worker_is_stopped_and_respawned_on_demand() {
    let (sp, count) = spawner(&[]);
    let mut cfg = fast(sp);
    cfg.idle_timeout = Duration::from_millis(250);
    let c = TtsClient::new(cfg);
    let (_, rx) = speak(&c, "xin chào");
    assert_eq!(drain(&rx).last(), Some(&Event::Done));
    assert!(c.is_running());
    std::thread::sleep(Duration::from_millis(1500));
    assert!(!c.is_running(), "rảnh quá hạn thì tắt");
    let (_, rx) = speak(&c, "lại");
    assert_eq!(drain(&rx).last(), Some(&Event::Done));
    assert_eq!(*count.lock().unwrap(), 2);
}

#[test]
fn warmup_loads_the_worker_and_reports() {
    let (sp, count) = spawner(&[]);
    let c = TtsClient::new(fast(sp));
    let (tx, rx) = mpsc::channel();
    c.warmup(move |r| {
        let _ = tx.send(r);
    });
    assert_eq!(rx.recv_timeout(Duration::from_secs(5)).unwrap(), Ok(()));
    assert_eq!(*count.lock().unwrap(), 1);
}

#[test]
fn shutdown_fails_pending_and_stops_the_worker() {
    let (sp, _) = spawner(&[]);
    let c = TtsClient::new(fast(sp));
    let (_, rx) = speak(&c, "slow");
    assert!(matches!(
        rx.recv_timeout(Duration::from_secs(5)).unwrap(),
        Event::Audio(_)
    ));
    c.shutdown();
    assert!(drain(&rx).last().is_some_and(|e| matches!(e, Event::Failed(_))));
    assert!(!c.is_running());
}
