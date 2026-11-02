//! `tts-client` với `tts-worker` thật và model thật. Biến môi trường: `TTS_WORKER_EXE` (binary tts-worker) cùng `TTS_ONNX_DIR`,
//! `TTS_CODEC_DIR`, `TTS_G2P_DICT`, `TTS_VOICES`, `TTS_ORT_LIB` (tùy chọn) như `tts-worker/tests/worker_e2e.rs`.
//! Chạy: `cargo test -p tts-client --release --test real_worker -- --ignored --nocapture`.

use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tts_client::{Config, Event, Failure, Language, Spawner, TtsClient};

fn env(k: &str) -> String {
    std::env::var(k).unwrap_or_else(|_| panic!("thiếu biến môi trường {k}"))
}

fn client(notes: Arc<Mutex<Vec<String>>>) -> TtsClient {
    let sp: Spawner = Arc::new(|| {
        let mut cmd = Command::new(env("TTS_WORKER_EXE"));
        cmd.args([
            "--model-dir",
            &env("TTS_ONNX_DIR"),
            "--codec-dir",
            &env("TTS_CODEC_DIR"),
        ])
        .args(["--g2p-dict", &env("TTS_G2P_DICT"), "--voices", &env("TTS_VOICES")]);
        if let Ok(lib) = std::env::var("TTS_ORT_LIB") {
            cmd.args(["--ort-lib", &lib]);
        }
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
    });
    let mut cfg = Config::new(sp);
    cfg.notice = Arc::new(move |m| notes.lock().unwrap().push(m.to_string()));
    TtsClient::new(cfg)
}

fn collect(rx: &mpsc::Receiver<Event>) -> (Vec<i16>, Option<Duration>, Event) {
    let t0 = Instant::now();
    let (mut pcm, mut first) = (Vec::new(), None);
    loop {
        match rx.recv_timeout(Duration::from_secs(60)).expect("hết hạn") {
            Event::Audio(p) => {
                first.get_or_insert_with(|| t0.elapsed());
                pcm.extend(p);
            }
            fin => return (pcm, first, fin),
        }
    }
}

#[test]
#[ignore = "cần model thật, xem đầu file"]
fn real_worker_through_the_client() {
    let notes = Arc::new(Mutex::new(Vec::new()));
    let c = client(notes.clone());
    let (wtx, wrx) = mpsc::channel();
    let t = Instant::now();
    c.warmup(move |r| {
        let _ = wtx.send(r);
    });
    assert_eq!(wrx.recv_timeout(Duration::from_secs(60)).unwrap(), Ok(()));
    println!("warmup: {:?}", t.elapsed());

    let (tx, rx) = mpsc::channel();
    let t = Instant::now();
    c.speak(
        Language::Vi,
        "Cuộc họp bắt đầu lúc ba giờ chiều. Vui lòng tham gia đúng giờ.",
        None,
        move |e| {
            let _ = tx.send(e);
        },
    );
    let (pcm, first, fin) = collect(&rx);
    println!(
        "đọc: {:.2}s âm thanh, khung đầu sau {:?}, tổng {:?}",
        pcm.len() as f32 / 48000.0,
        first,
        t.elapsed()
    );
    assert_eq!(fin, Event::Done);
    assert!(pcm.len() > 48000 * 2);

    // Bấm câu khác khi đang đọc: câu cũ hủy nhanh, câu mới đọc xong.
    let (tx1, rx1) = mpsc::channel();
    c.speak(
        Language::Vi,
        &"Đây là một đoạn dài để đọc lâu. ".repeat(6),
        None,
        move |e| {
            let _ = tx1.send(e);
        },
    );
    assert!(matches!(
        rx1.recv_timeout(Duration::from_secs(30)).unwrap(),
        Event::Audio(_)
    ));
    let t = Instant::now();
    let (tx2, rx2) = mpsc::channel();
    c.speak(Language::En, "Hello there.", None, move |e| {
        let _ = tx2.send(e);
    });
    let (_, _, fin1) = collect(&rx1);
    println!("câu cũ bị hủy sau {:?}", t.elapsed());
    assert_eq!(fin1, Event::Failed(Failure::Cancelled));
    let (pcm2, _, fin2) = collect(&rx2);
    println!("câu mới xong sau {:?}", t.elapsed());
    assert_eq!(fin2, Event::Done);
    assert!(!pcm2.is_empty());
    assert!(c.disabled_reason().is_none());
    c.shutdown();
    println!("ghi chú: {:?}", notes.lock().unwrap());
}
