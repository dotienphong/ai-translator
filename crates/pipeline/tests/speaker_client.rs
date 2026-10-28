//! Client của `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.1–§4.3, §11) với worker giả
//! (`src/bin/fake_speaker_worker.rs`): không cần model.

use pipeline::speaker::{SpeakerLink, SpeakerUpdate, SpeechSpan, UPDATE_CHANNEL_CAP};
use pipeline::speaker_client::{self, BeforeSpawn, Disabled, SpeakerHandle, SpeakerLaunch};
use speaker_protocol::{MeetingApp, NamesSetup, ReaderStatus, SegmentAudio, Source, SpeakerConfig};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, TrySendError};
use std::time::{Duration, Instant};

const FAKE: &str = env!("CARGO_BIN_EXE_fake_speaker_worker");

struct Fixture {
    dir: PathBuf,
}

impl Fixture {
    fn new(name: &str, plan: &[&str]) -> Self {
        let dir = std::env::temp_dir().join(format!("speaker-client-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("plan.txt"), plan.join("\n")).unwrap();
        Self { dir }
    }

    fn launch(&self) -> SpeakerLaunch {
        let mut l = SpeakerLaunch::new(
            Path::new(FAKE),
            &self.dir.join("model.onnx"),
            &self.dir.join("worker.log"),
            SpeakerConfig::default(),
        );
        l.backoff = vec![
            Duration::from_millis(10),
            Duration::from_millis(20),
            Duration::from_millis(50),
        ];
        l.ready_timeout = Duration::from_secs(5);
        l.overload_after = Duration::from_secs(2);
        l.shutdown_grace = Duration::from_secs(1);
        l.env = vec![
            (
                "FAKE_SPEAKER_PLAN".into(),
                self.dir.join("plan.txt").display().to_string(),
            ),
            (
                "FAKE_SPEAKER_LOG".into(),
                self.dir.join("events.log").display().to_string(),
            ),
        ];
        l.model_sha256 = Some("ab".repeat(32));
        l
    }

    fn events(&self) -> String {
        std::fs::read_to_string(self.dir.join("events.log")).unwrap_or_default()
    }
}

fn allow() -> BeforeSpawn {
    Box::new(|_| Ok(()))
}

fn segment(id: u64, start_ms: u64, end_ms: u64) -> SegmentAudio {
    SegmentAudio {
        segment_id: id,
        start_ms,
        end_ms,
        source: Source::System,
        pcm: vec![100; 16_000],
    }
}

/// Chờ `Assign` của đoạn `id`, bỏ qua cập nhật khác.
fn wait_assign(updates: &Receiver<SpeakerUpdate>, id: u64) -> Option<u32> {
    loop {
        match updates.recv_timeout(Duration::from_secs(5)) {
            Ok(SpeakerUpdate::Assign { segment_id, voice, .. }) if segment_id == id => return voice,
            Ok(_) => continue,
            Err(e) => panic!("không có Assign của đoạn {id}: {e}"),
        }
    }
}

/// Chờ tới khi có cập nhật thỏa `want`; trả mọi cập nhật đã thấy, kể cả nó.
fn wait_for(
    updates: &Receiver<SpeakerUpdate>,
    what: &str,
    want: impl Fn(&SpeakerUpdate) -> bool,
) -> Vec<SpeakerUpdate> {
    let mut seen = Vec::new();
    loop {
        match updates.recv_timeout(Duration::from_secs(5)) {
            Ok(update) => {
                let done = want(&update);
                seen.push(update);
                if done {
                    return seen;
                }
            }
            Err(e) => panic!("không có {what}: {e}; đã thấy {seen:?}"),
        }
    }
}

fn unlabeled(id: u64) -> SpeakerUpdate {
    SpeakerUpdate::Unlabeled { segment_id: id }
}

fn is_assign(id: u64) -> impl Fn(&SpeakerUpdate) -> bool {
    move |u| matches!(u, SpeakerUpdate::Assign { segment_id, .. } if *segment_id == id)
}

fn wait_until(what: &str, done: impl Fn() -> bool) {
    let t0 = Instant::now();
    while !done() {
        assert!(t0.elapsed() < Duration::from_secs(10), "chờ quá lâu: {what}");
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn wait_disabled(h: &SpeakerHandle) -> Disabled {
    wait_until("client tắt", || h.disabled().is_some());
    h.disabled().unwrap()
}

#[test]
fn labels_come_back_and_the_worker_gets_two_threads() {
    let f = Fixture::new("labels", &["voices:2"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    assert_eq!(wait_assign(&link.updates, 0), Some(1));
    link.segments.send(segment(1, 1_500, 2_500)).unwrap();
    assert_eq!(wait_assign(&link.updates, 1), Some(2));
    let events = f.events();
    for line in [
        "start threads=2",
        "load model=model.onnx sha=có theta=0.35",
        "session",
        "segment 0 pcm=16000 dur=1000 source=System",
    ] {
        assert!(events.contains(line), "{line}: {events}");
    }
    // Thời gian khứ hồi của từng đoạn (gửi `Segment` → nhận `Assign`), cho 02b đo mốc 230 ms khi chạy cùng hai tiến trình phụ.
    wait_until("đo khứ hồi", || handle.round_trip_ms().len() == 2);
    assert!(handle.round_trip_ms().iter().all(|&ms| ms > 0.0 && ms < 5_000.0));
}

/// QĐ 14 của kế hoạch 02: worker gửi dồn cập nhật (hỏng hay bị chiếm). Kênh tới luồng phụ đề có giới hạn; đầy thì client coi
/// worker đã chết và chạy lại; không bao giờ chặn.
#[test]
fn a_worker_flooding_updates_is_treated_as_broken() {
    let f = Fixture::new("flood", &["flood_voices:10000", "ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_until("chạy lại", || handle.starts() == 2);
    assert!(link.updates.try_iter().count() <= UPDATE_CHANNEL_CAP);
    assert_eq!(handle.disabled(), None);
}

#[test]
fn a_crashed_worker_restarts_and_voice_ids_keep_growing() {
    let f = Fixture::new("restart", &["voices:2 crash_on:2", "voices:2"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    assert_eq!(wait_assign(&link.updates, 0), Some(1));
    link.segments.send(segment(1, 1_500, 2_500)).unwrap();
    wait_until("chạy lại", || {
        handle.starts() == 2 && handle.wait_ready(Duration::ZERO)
    });
    link.segments.send(segment(2, 3_000, 4_000)).unwrap();
    let seen = wait_for(&link.updates, "Assign của đoạn 2", is_assign(2));
    // Đoạn 1 còn chờ khi worker chết: không bao giờ có nhãn, báo luồng phụ đề (N1 của rà soát cuối).
    assert!(seen.contains(&unlabeled(1)), "{seen:?}");
    // Lần chạy sau: giọng 1 của worker thành giọng 2 của phiên (cộng mã lớn nhất đã thấy).
    assert!(
        matches!(seen.last(), Some(SpeakerUpdate::Assign { voice: Some(2), .. })),
        "{seen:?}"
    );
    assert_eq!(handle.disabled(), None);
}

/// N1 của rà soát cuối: đoạn tới trong lúc chờ chạy lại worker bị bỏ, và được báo là không bao giờ có nhãn.
#[test]
fn segments_dropped_while_the_worker_restarts_are_reported() {
    let f = Fixture::new("restart-drop", &["crash_on:1", "ok"]);
    let mut launch = f.launch();
    launch.backoff = vec![Duration::from_secs(1)];
    let (link, handle) = speaker_client::start(launch, allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_until("worker chết", || handle.starts() == 1 && handle.pid().is_none());
    link.segments.send(segment(1, 1_500, 2_500)).unwrap();
    let seen = wait_for(&link.updates, "Unlabeled của đoạn 1", |u| *u == unlabeled(1));
    assert!(seen.contains(&unlabeled(0)), "đoạn 0 còn chờ khi worker chết: {seen:?}");
    wait_until("chạy lại", || {
        handle.starts() == 2 && handle.wait_ready(Duration::ZERO)
    });
    link.segments.send(segment(2, 3_000, 4_000)).unwrap();
    assert_eq!(wait_assign(&link.updates, 2), Some(1));
}

/// N1 của rà soát cuối: worker báo lỗi cho một đoạn (`Error` có id) thì đoạn đó không bao giờ có nhãn; worker vẫn sống.
#[test]
fn an_error_for_a_segment_is_reported_as_unlabeled() {
    let f = Fixture::new("error-on", &["error_on:1"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_for(&link.updates, "Unlabeled của đoạn 0", |u| *u == unlabeled(0));
    link.segments.send(segment(1, 1_500, 2_500)).unwrap();
    assert_eq!(wait_assign(&link.updates, 1), Some(1));
    assert_eq!(handle.starts(), 1);
}

/// N5 của rà soát cuối: khung `Error` không có id đoạn (không đi qua kênh nhãn) gửi dồn, hay `Ready` lặp lại, cũng là worker hỏng:
/// chạy lại, không ghi log mỗi khung một dòng.
#[test]
fn a_worker_flooding_errors_or_repeating_ready_is_treated_as_broken() {
    let f = Fixture::new("errors", &["errors:1000", "ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_until("chạy lại", || handle.starts() == 2);
    let f = Fixture::new("ready-twice", &["ready_twice", "ok"]);
    let (_link, handle) = speaker_client::start(f.launch(), allow());
    wait_until("chạy lại", || handle.starts() == 2);
    assert_eq!(handle.disabled(), None);
}

/// N6 của rà soát cuối: mã giọng quá lớn (worker hỏng) là worker hỏng; không được đẩy khoảng bù của lần chạy sau lên gần
/// `u32::MAX` (mọi giọng sau sẽ dồn về một mã).
#[test]
fn a_huge_voice_id_counts_as_a_broken_worker_and_never_poisons_later_ids() {
    let f = Fixture::new("big-id", &["big_voice_id", "voices:1"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_until("chạy lại", || {
        handle.starts() == 2 && handle.wait_ready(Duration::ZERO)
    });
    link.segments.send(segment(1, 1_500, 2_500)).unwrap();
    let seen = wait_for(&link.updates, "Assign của đoạn 1", is_assign(1));
    assert!(
        !seen
            .iter()
            .any(|u| matches!(u, SpeakerUpdate::Assign { segment_id: 0, .. })),
        "{seen:?}"
    );
    assert!(seen.contains(&unlabeled(0)), "{seen:?}");
    assert!(
        matches!(seen.last(), Some(SpeakerUpdate::Assign { voice: Some(1), .. })),
        "{seen:?}"
    );
}

/// N7 của rà soát cuối: phiên dừng trong lúc app kiểm toàn vẹn (`before_spawn`, băm cả thư mục) thì không chạy worker.
#[test]
fn stopping_during_the_integrity_check_never_starts_the_worker() {
    let f = Fixture::new("stop-check", &["ok"]);
    let (entered_tx, entered) = std::sync::mpsc::channel();
    let slow: BeforeSpawn = Box::new(move |_| {
        let _ = entered_tx.send(());
        std::thread::sleep(Duration::from_millis(300));
        Ok(())
    });
    let (link, handle) = speaker_client::start(f.launch(), slow);
    entered.recv_timeout(Duration::from_secs(5)).unwrap();
    // Giữ kênh đoạn mở (như luồng VAD còn chạy): chỉ cờ dừng báo phiên đã dừng.
    let probe = link.segments.clone();
    drop::<SpeakerLink>(link);
    wait_until("client thoát", || {
        matches!(probe.try_send(segment(9, 0, 1_000)), Err(TrySendError::Disconnected(_)))
    });
    assert_eq!(handle.starts(), 0);
    assert!(!f.events().contains("start"), "{}", f.events());
}

/// N8 của rà soát cuối: luồng giám sát thức thưa (`TICK` ≥ 200 ms) mà không làm sai số đo khứ hồi (lấy lúc luồng đọc nhận trả
/// lời, không phải lúc luồng giám sát thức).
#[test]
fn round_trips_do_not_include_the_supervisor_tick() {
    let f = Fixture::new("round-trip", &["ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    // Năm lượt, lấy trung vị: một lượt chậm vì máy bận không làm test đỏ; còn nếu số đo gồm cả nhịp `TICK` (200 ms) thì
    // mọi lượt đều quanh mức đó và trung vị vượt xa 100 ms.
    for id in 0..5 {
        link.segments.send(segment(id, id * 1_000, id * 1_000 + 1_000)).unwrap();
        assert_eq!(wait_assign(&link.updates, id), Some(1));
    }
    wait_until("đo khứ hồi", || handle.round_trip_ms().len() == 5);
    let mut ms = handle.round_trip_ms();
    ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
    assert!(ms[2] < 100.0, "khứ hồi {ms:?} ms");
}

/// N8 của rà soát cuối: đoạn tới ngay sau `Ready`, trước khi luồng giám sát thức lần kế, không bị bỏ như đoạn tới trước `Ready`.
#[test]
fn a_segment_right_after_ready_is_not_dropped() {
    let f = Fixture::new("after-ready", &["ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    // Worker giả ghi `session` ngay sau khi đã gửi `Ready`.
    wait_until("worker sẵn sàng", || f.events().contains("session"));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    let seen = wait_for(&link.updates, "Assign của đoạn 0", |u| {
        is_assign(0)(u) || *u == unlabeled(0)
    });
    assert!(is_assign(0)(seen.last().unwrap()), "{seen:?}");
    assert!(handle.wait_ready(Duration::ZERO));
}

/// Rà soát lại sau N8: worker theo kịp mà đoạn tới dày, cách nhau dưới nhịp thức của luồng giám sát cộng thời gian trả lời, thì
/// không phải quá tải. Luồng giám sát thức thưa thường thấy đoạn mới trước khi thấy trả lời của đoạn cũ; hàng chờ trống giữa hai
/// đoạn phải được tính theo mốc luồng đọc nhận trả lời.
fn a_worker_keeping_up_with_dense_segments_is_not_overloaded(name: &str, plan: &str, gap_ms: u64) {
    let f = Fixture::new(name, &[plan]);
    let launch = f.launch();
    // Đoạn tới đều suốt quá mốc quá tải (2 s) một khoảng.
    let run_for = launch.overload_after + Duration::from_millis(1_500);
    let (link, handle) = speaker_client::start(launch, allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    let t0 = Instant::now();
    let mut sent = 0u64;
    while t0.elapsed() < run_for {
        let start = sent * gap_ms;
        // Client tắt thì kênh đoạn đóng.
        if link.segments.send(segment(sent, start, start + gap_ms - 50)).is_err() {
            break;
        }
        sent += 1;
        std::thread::sleep((t0 + Duration::from_millis(sent * gap_ms)).saturating_duration_since(Instant::now()));
    }
    assert_eq!(
        handle.disabled(),
        None,
        "đoạn mỗi {gap_ms} ms: thôi gửi sau {:?}, đã gửi {sent} đoạn, khứ hồi {:?} ms",
        t0.elapsed(),
        handle.round_trip_ms()
    );
    for id in 0..sent {
        assert_eq!(wait_assign(&link.updates, id), Some(1), "đoạn mỗi {gap_ms} ms");
    }
    assert_eq!(handle.disabled(), None, "đoạn mỗi {gap_ms} ms");
}

#[test]
fn a_worker_keeping_up_with_segments_every_150_ms_is_not_overloaded() {
    a_worker_keeping_up_with_dense_segments_is_not_overloaded("dense-150", "ok", 150);
}

#[test]
fn a_worker_keeping_up_with_segments_every_250_ms_is_not_overloaded() {
    a_worker_keeping_up_with_dense_segments_is_not_overloaded("dense-250", "ok", 250);
}

#[test]
fn a_worker_keeping_up_with_segments_every_300_ms_is_not_overloaded() {
    a_worker_keeping_up_with_dense_segments_is_not_overloaded("dense-300", "ok", 300);
}

#[test]
fn a_worker_keeping_up_with_segments_every_350_ms_is_not_overloaded() {
    a_worker_keeping_up_with_dense_segments_is_not_overloaded("dense-350", "ok", 350);
}

/// Như worker thật: mỗi đoạn xong trong 230 ms (spec §11), đoạn tới mỗi 400 ms. Trả lời tới sau nhịp thức của luồng giám sát.
#[test]
fn a_worker_taking_230_ms_with_segments_every_400_ms_is_not_overloaded() {
    a_worker_keeping_up_with_dense_segments_is_not_overloaded("dense-slow", "segment_delay_ms:230", 400);
}

/// Quá tải thật mà worker vẫn trả lời (§11): mỗi đoạn mất 400 ms, đoạn tới mỗi 250 ms. Lúc có trả lời luôn còn đoạn gửi trước
/// đó chưa xong, nên trả lời không làm mốc chậm bắt đầu lại: tắt đúng mốc.
#[test]
fn a_worker_slower_than_real_time_is_dropped_as_overloaded_even_though_it_answers() {
    let f = Fixture::new("slow", &["segment_delay_ms:400"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    let t0 = Instant::now();
    let mut id = 0u64;
    while handle.disabled().is_none() && t0.elapsed() < Duration::from_secs(8) {
        // Như luồng VAD: không chờ, kênh đầy thì bỏ; client tắt thì kênh đóng.
        if let Err(TrySendError::Disconnected(_)) = link.segments.try_send(segment(id, id * 250, id * 250 + 200)) {
            break;
        }
        id += 1;
        std::thread::sleep((t0 + Duration::from_millis(id * 250)).saturating_duration_since(Instant::now()));
    }
    assert_eq!(wait_disabled(&handle), Disabled::Overload);
    // Đoạn đầu gửi sau `t0`: chậm liền 2 s (`overload_after`) mới tắt; cộng nhịp xét và chờ worker thoát (`shutdown_grace` 1 s).
    let waited = t0.elapsed();
    assert!(
        waited >= Duration::from_secs(2) && waited < Duration::from_secs(5),
        "{waited:?}"
    );
    assert!(
        link.updates
            .try_iter()
            .any(|u| matches!(u, SpeakerUpdate::Assign { .. })),
        "worker phải vẫn trả lời"
    );
}

#[test]
fn three_deaths_turn_speaker_off_for_the_session() {
    let f = Fixture::new("deaths", &["exit_at_start:3", "exit_at_start:3", "exit_at_start:3"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert_eq!(wait_disabled(&handle), Disabled::Deaths(3));
    wait_until("kênh đóng", || {
        matches!(
            link.segments.try_send(segment(9, 0, 1_000)),
            Err(TrySendError::Disconnected(_))
        )
    });
}

#[test]
fn a_bad_model_turns_speaker_off_without_restarting() {
    let f = Fixture::new("model", &["model_bad", "ok"]);
    let (_link, handle) = speaker_client::start(f.launch(), allow());
    assert_eq!(wait_disabled(&handle), Disabled::ModelBad);
    assert_eq!(handle.starts(), 1);
}

#[test]
fn a_protocol_mismatch_turns_speaker_off() {
    let f = Fixture::new("version", &["version:99"]);
    let (_link, handle) = speaker_client::start(f.launch(), allow());
    assert_eq!(wait_disabled(&handle), Disabled::Version(99));
}

#[test]
fn a_refused_binary_never_runs() {
    let f = Fixture::new("refused", &["ok"]);
    let refuse: BeforeSpawn = Box::new(|_| Err("speaker-worker khác bản build sẵn".into()));
    let (_link, handle) = speaker_client::start(f.launch(), refuse);
    assert_eq!(
        wait_disabled(&handle),
        Disabled::Refused("speaker-worker khác bản build sẵn".into())
    );
    assert!(!f.events().contains("start"));
}

#[test]
fn too_many_voices_in_one_frame_count_as_a_broken_worker() {
    let f = Fixture::new("big", &["big_voices", "ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_until("chạy lại", || handle.starts() == 2);
}

/// Worker treo: không bao giờ chặn bên gửi; quá `overload_after` thì tắt tới hết phiên và kill worker.
#[test]
fn a_hung_worker_is_dropped_as_overloaded_and_never_blocks_the_sender() {
    let f = Fixture::new("hang", &["hang_on:1"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    let first_sent = Instant::now();
    let mut delivered = Vec::new();
    for id in 0..10 {
        let t0 = Instant::now();
        if link
            .segments
            .try_send(segment(id, id * 1_000, id * 1_000 + 900))
            .is_ok()
        {
            delivered.push(id);
        }
        assert!(t0.elapsed() < Duration::from_millis(50));
    }
    assert_eq!(wait_disabled(&handle), Disabled::Overload);
    // Đúng mốc: đoạn đầu chờ trả lời đủ `overload_after` (2 s) mới tắt; sau đó còn chờ worker thoát (`shutdown_grace` 1 s) rồi
    // mới báo tắt.
    let waited = first_sent.elapsed();
    assert!(
        waited >= Duration::from_secs(2) && waited < Duration::from_secs(5),
        "{waited:?}"
    );
    wait_until("worker bị kill", || handle.pid().is_none());
    // N1 của rà soát cuối: mọi đoạn đã tới client mà không có nhãn (bỏ vì kênh tới worker đầy, hay chưa có trả lời khi tắt) đều
    // được báo.
    let mut reported: Vec<u64> = link
        .updates
        .try_iter()
        .filter_map(|u| match u {
            SpeakerUpdate::Unlabeled { segment_id } => Some(segment_id),
            _ => None,
        })
        .collect();
    reported.sort_unstable();
    assert_eq!(reported, delivered);
}

#[test]
fn segments_before_ready_are_dropped() {
    let f = Fixture::new("early", &["load_delay_ms:500"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    link.segments.try_send(segment(0, 0, 1_000)).unwrap();
    assert!(handle.wait_ready(Duration::from_secs(5)));
    // N1 của rà soát cuối: đoạn bị bỏ được báo là không bao giờ có nhãn.
    wait_for(&link.updates, "Unlabeled của đoạn 0", |u| *u == unlabeled(0));
    link.segments.send(segment(1, 1_500, 2_500)).unwrap();
    assert_eq!(wait_assign(&link.updates, 1), Some(1));
    assert!(!f.events().contains("segment 0 "));
}

#[test]
fn dropping_the_link_shuts_the_worker_down() {
    let f = Fixture::new("stop", &["ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    let pid = handle.pid().unwrap();
    let t0 = Instant::now();
    drop::<SpeakerLink>(link);
    wait_until("worker thoát", || {
        f.events().contains("shutdown") && !pipeline::process::live().contains(&pid)
    });
    assert!(t0.elapsed() < Duration::from_secs(1), "{:?}", t0.elapsed());
}

/// N8 của rà soát cuối: luồng giám sát thức thưa nhưng phiên dừng (cờ dừng, kênh đoạn còn mở) vẫn tắt worker nhanh.
#[test]
fn the_stop_flag_shuts_the_worker_down_quickly() {
    let f = Fixture::new("stop-flag", &["ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    let pid = handle.pid().unwrap();
    let probe = link.segments.clone();
    let t0 = Instant::now();
    drop::<SpeakerLink>(link);
    wait_until("worker thoát", || {
        f.events().contains("shutdown") && !pipeline::process::live().contains(&pid)
    });
    assert!(t0.elapsed() < Duration::from_secs(1), "{:?}", t0.elapsed());
    drop(probe);
}

/// Kế hoạch 03 (QĐ 8): người dùng tắt "Phân biệt người nói" giữa phiên thì app dừng worker ngay qua `SpeakerHandle::stop`, như khi
/// phiên dừng: client thoát (luồng VAD thấy kênh đóng), worker không chạy lại, và đây không phải lỗi (`disabled` vẫn `None`).
#[test]
fn stop_from_the_handle_ends_the_worker_for_the_rest_of_the_session() {
    let f = Fixture::new("handle-stop", &["ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    assert!(!handle.is_stopped());
    let probe = link.segments.clone();
    handle.stop();
    assert!(handle.is_stopped());
    wait_until("client thoát", || {
        matches!(probe.try_send(segment(9, 0, 1_000)), Err(TrySendError::Disconnected(_)))
    });
    wait_until("worker thoát", || handle.pid().is_none());
    assert_eq!(handle.starts(), 1, "không chạy lại");
    assert_eq!(handle.disabled(), None, "dừng theo yêu cầu không phải lỗi");
    drop(link);
}

fn names_on(f: &Fixture) -> SpeakerLaunch {
    let mut l = f.launch();
    l.names = NamesSetup {
        enabled: true,
        recipe_json: "{\"schema\":1}".into(),
        eui_marker: None,
    };
    l
}

/// Kế hoạch 04: `Load` mang phần tên; `Speech` của luồng VAD và `SetNames` của app tới worker.
#[test]
fn names_setup_speech_and_set_names_reach_the_worker() {
    let f = Fixture::new("names", &["ok"]);
    let (link, handle) = speaker_client::start(names_on(&f), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    assert!(handle.names_wanted());
    link.speech
        .try_send(SpeechSpan {
            start_ms: 0,
            end_ms: 512,
        })
        .unwrap();
    handle.set_names(false);
    wait_until("worker nhận Speech và SetNames", || {
        let e = f.events();
        e.contains("speech 0-512") && e.contains("set_names false")
    });
    assert!(f.events().contains("names enabled=true recipe=12"), "{}", f.events());
    drop(link);
}

/// QĐ 12: mọi lần chạy worker trong một phiên nhận cùng mốc giờ của phiên.
#[test]
fn every_run_of_a_session_gets_the_same_session_clock() {
    let f = Fixture::new("clock", &["crash_on:1", "ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_until("chạy lại", || {
        handle.starts() == 2 && handle.wait_ready(Duration::from_millis(10))
    });
    let events = f.events();
    let clocks: Vec<&str> = events.lines().filter(|l| l.starts_with("session unix=")).collect();
    assert_eq!(clocks.len(), 2, "{events}");
    assert_eq!(clocks[0], clocks[1]);
}

#[test]
fn names_participants_and_reader_state_are_forwarded() {
    let f = Fixture::new("named", &["named"]);
    let (link, handle) = speaker_client::start(names_on(&f), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    let seen = wait_for(&link.updates, "Reader", |u| matches!(u, SpeakerUpdate::Reader(_)));
    assert!(
        seen.iter()
            .any(|u| matches!(u, SpeakerUpdate::Voices(v) if v[0].name.as_ref().map(|n| n.as_str()) == Some("Lan")))
    );
    assert!(
        seen.iter()
            .any(|u| matches!(u, SpeakerUpdate::Participants(p) if p.len() == 2))
    );
    assert!(matches!(
        seen.last(),
        Some(SpeakerUpdate::Reader(r)) if r.state == ReaderStatus::NoPermission && r.app == Some(MeetingApp::Teams)
    ));
    assert!(matches!(
        seen.last(),
        Some(SpeakerUpdate::Reader(r)) if r.learned == 1 && r.patterns.len() == 1 && r.patterns[0].role == "AXGroup"
    ));
}

/// App coi khung của worker là dữ liệu chưa tin: tên quá 160 byte là worker hỏng (chạy lại).
#[test]
fn an_oversized_name_counts_as_a_broken_worker() {
    let f = Fixture::new("long-name", &["long_name", "ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_until("chạy lại sau khung hỏng", || handle.starts() == 2);
}

/// Spec §11, QĐ 15: chậm hơn thời gian thực khi đang đọc tên thì trước hết tạm dừng đọc tên (`PauseNames`, giữ tên; không phải
/// `SetNames(false)`); vẫn chậm thì tắt.
#[test]
fn overload_first_pauses_the_names_then_turns_speaker_off() {
    let f = Fixture::new("slow-names", &["segment_delay_ms:400"]);
    let (link, handle) = speaker_client::start(names_on(&f), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    let t0 = Instant::now();
    let mut id = 0u64;
    while handle.disabled().is_none() && t0.elapsed() < Duration::from_secs(12) {
        if let Err(TrySendError::Disconnected(_)) = link.segments.try_send(segment(id, id * 250, id * 250 + 200)) {
            break;
        }
        id += 1;
        std::thread::sleep((t0 + Duration::from_millis(id * 250)).saturating_duration_since(Instant::now()));
    }
    assert_eq!(wait_disabled(&handle), Disabled::Overload);
    assert!(handle.names_paused(), "bậc 1: tạm dừng đọc tên");
    assert!(
        t0.elapsed() >= Duration::from_secs(4),
        "hai lần chậm 2 s: {:?}",
        t0.elapsed()
    );
    let events = f.events();
    assert!(events.contains("pause_names"), "{events}");
    assert!(!events.contains("set_names false"), "tạm dừng không xóa tên: {events}");
}
