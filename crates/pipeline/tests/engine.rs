//! Pipeline từ âm thanh tới phụ đề (spec §11, "Test tích hợp": chạy pipeline từ file âm thanh, không thu âm thật, kiểm
//! phụ đề có xuất hiện, đúng thứ tự, đúng thời gian). Âm thanh tổng hợp có ranh giới biết trước; VAD theo năng lượng;
//! tiến trình phụ giả chạy qua đúng `SidecarManager` của app.

use pipeline::config::{AsrConfig, MtConfig, PipelineConfig, SupervisorConfig};
use pipeline::engine::{
    EnergyVad, Engine, EngineConfig, EventSink, Fatal, Indicators, SampleSource, Usage, VadFactory,
};
use pipeline::prompt::Lang;
use pipeline::subtitle::{Delta, Status, Subtitle};
use pipeline::supervisor::{AsrSpec, Clock, FakeClock, LlamaSpec, NoEvents, SidecarManager, SidecarSpec, SystemClock};
use std::collections::BTreeMap;
use std::ops::ControlFlow;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, Once};
use std::time::{Duration, Instant};

const FAKE_ASR: &str = env!("CARGO_BIN_EXE_fake_asr_worker");
const FAKE_LLAMA: &str = env!("CARGO_BIN_EXE_fake_llama_server");
const RATE: usize = 16_000;

/// Log của cả tiến trình test, để kiểm log không chứa nội dung chép lời (§11, "Bảo mật").
struct CaptureLog(Mutex<Vec<String>>);

impl log::Log for CaptureLog {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &log::Record) {
        self.0.lock().unwrap().push(format!("{}", record.args()));
    }

    fn flush(&self) {}
}

static LOG: CaptureLog = CaptureLog(Mutex::new(Vec::new()));

fn capture_log() {
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        log::set_logger(&LOG).unwrap();
        log::set_max_level(log::LevelFilter::Trace);
    });
}

#[derive(Debug, Clone)]
enum Ev {
    Upsert(Subtitle),
    Delta(Delta),
    Indicators(Indicators),
    Fatal(Fatal, String),
}

#[derive(Default)]
struct Recorder {
    events: Mutex<Vec<Ev>>,
    levels: Mutex<Vec<f32>>,
    usage: Mutex<Vec<Usage>>,
}

impl EventSink for Recorder {
    fn subtitle(&self, s: &Subtitle) {
        self.events.lock().unwrap().push(Ev::Upsert(s.clone()));
    }
    fn delta(&self, d: &Delta) {
        self.events.lock().unwrap().push(Ev::Delta(d.clone()));
    }
    fn level(&self, rms: f32) {
        self.levels.lock().unwrap().push(rms);
    }
    fn indicators(&self, i: &Indicators) {
        self.events.lock().unwrap().push(Ev::Indicators(i.clone()));
    }
    fn fatal(&self, kind: Fatal, reason: &str) {
        self.events.lock().unwrap().push(Ev::Fatal(kind, reason.to_string()));
    }
    fn usage(&self, u: &Usage) -> ControlFlow<()> {
        self.usage.lock().unwrap().push(*u);
        ControlFlow::Continue(())
    }
}

impl Recorder {
    fn events(&self) -> Vec<Ev> {
        self.events.lock().unwrap().clone()
    }

    /// Áp các sự kiện như giao diện làm (upsert thay cả phụ đề, delta nối chữ dịch, `replaces` xóa phụ đề đã gộp).
    /// Trả trạng thái cuối theo id, và thứ tự id xuất hiện lần đầu.
    fn replay(&self) -> (BTreeMap<u64, Subtitle>, Vec<u64>) {
        let (mut ui, mut order) = (BTreeMap::new(), Vec::new());
        for ev in self.events() {
            match ev {
                Ev::Upsert(s) => {
                    for id in &s.replaces {
                        ui.remove(id);
                    }
                    if !order.contains(&s.id) {
                        order.push(s.id);
                    }
                    ui.insert(s.id, s);
                }
                Ev::Delta(d) => ui
                    .get_mut(&d.id)
                    .expect("delta của phụ đề đã có")
                    .tgt_text
                    .push_str(&d.text),
                _ => {}
            }
        }
        (ui, order)
    }
}

struct Temp(PathBuf);

impl Temp {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("pipeline-engine-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Âm thanh tổng hợp: (có tiếng hay không, ms). Tiếng là sóng sin 440 Hz biên độ 0,3.
fn audio(parts: &[(bool, usize)]) -> Vec<f32> {
    let mut out = Vec::new();
    for &(tone, ms) in parts {
        for _ in 0..ms * RATE / 1000 {
            let t = out.len() as f32 / RATE as f32;
            out.push(if tone {
                0.3 * (2.0 * std::f32::consts::PI * 440.0 * t).sin()
            } else {
                0.0
            });
        }
    }
    out
}

fn manager(t: &Temp, texts: &[&str], asr_plan: &[&str], clock: Arc<dyn Clock>) -> Arc<SidecarManager> {
    std::fs::write(t.path("texts"), texts.join("\n")).unwrap();
    std::fs::write(t.path("asr-plan"), asr_plan.join("\n")).unwrap();
    let spec = SidecarSpec {
        asr: AsrSpec {
            exe_gpu: Some(PathBuf::from(FAKE_ASR)),
            exe_cpu: PathBuf::from(FAKE_ASR),
            model: PathBuf::from("/models/asr.bin"),
            log: t.path("logs/asr-worker.log"),
            first_run: false,
            require_shared: true,
            env: vec![
                ("FAKE_ASR_TEXTS".into(), t.path("texts").display().to_string()),
                ("FAKE_ASR_PLAN".into(), t.path("asr-plan").display().to_string()),
            ],
        },
        llama: LlamaSpec {
            exe: PathBuf::from(FAKE_LLAMA),
            model: PathBuf::from("/models/mt.gguf"),
            log: t.path("logs/llama-server.log"),
            extra_args: Vec::new(),
            first_run: false,
            env: Vec::new(),
        },
        supervisor: SupervisorConfig {
            ready_timeout_ms: 10_000,
            shutdown_grace_ms: 1_000,
            ..SupervisorConfig::default()
        },
        asr_config: AsrConfig::default(),
        mt_config: MtConfig::default(),
    };
    SidecarManager::new(spec, clock, Arc::new(NoEvents))
}

fn energy_vad() -> VadFactory {
    Box::new(|| Ok(Box::new(EnergyVad { threshold_rms: 0.01 }) as _))
}

/// Các test này phát âm thanh nhanh gấp 20 lần thời gian thực, nên ngưỡng trễ 6 giây chỉ còn 300 ms thật: đặt các ngưỡng
/// trễ rất lớn để máy bận không làm test đỏ. Luật trễ có test riêng, tất định, trong `engine.rs` (Q3 của review 02b).
fn config(languages: &[&str]) -> EngineConfig {
    let mut pipeline = PipelineConfig::default();
    pipeline.queue.lag_warn_ms = 600_000;
    pipeline.queue.asr_drop_after_ms = 600_000;
    pipeline.queue.mt_skip_after_ms = 600_000;
    EngineConfig {
        pipeline,
        languages: languages.iter().map(|l| l.to_string()).collect(),
        target: Lang::Vi,
        translation_context: false,
        id_base: 1_000,
    }
}

/// Phát nhanh gấp 20 lần thời gian thực: khối 100 ms mỗi 5 ms.
fn source(samples: Vec<f32>) -> Box<SampleSource> {
    Box::new(SampleSource::new(samples, RATE / 10, Duration::from_millis(5)))
}

#[test]
fn subtitles_appear_in_order_with_the_right_times() {
    capture_log();
    let t = Temp::new("order");
    let texts = [
        "en\tso we went to",
        "en\tthe market yesterday",
        "en\tThen we ate.",
        "vi\txin chào mọi người",
        "en\tThank you for coming\t!nospeech",
    ];
    let manager = manager(&t, &texts, &[], Arc::new(SystemClock::default()));
    manager.ensure_started().unwrap();
    let samples = audio(&[
        (false, 1_000),
        (true, 2_000), // đoạn 0: 1,0–3,0 giây
        (false, 400),  // nghỉ 0,4 giây, trong cửa sổ ghép 0,7 giây
        (true, 1_500), // đoạn 1: ghép vào câu của đoạn 0
        (false, 1_500),
        (true, 1_200), // đoạn 2: có dấu chấm, câu chốt ngay
        (false, 1_500),
        (true, 1_000), // đoạn 3: tiếng Việt, trùng ngôn ngữ đích
        (false, 1_000),
        (true, 800), // đoạn 4: không có tiếng nói theo luật no_speech
        (false, 1_500),
    ]);
    let sink = Arc::new(Recorder::default());
    let engine = Engine::start(
        config(&["en", "vi"]),
        source(samples),
        energy_vad(),
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        sink.clone(),
    )
    .unwrap();
    let metrics = engine.join();

    let (ui, order) = sink.replay();
    assert_eq!(order, [1_000, 1_002, 1_003], "đoạn 1 ghép vào đoạn 0, đoạn 4 bị lọc");
    let row = |id: u64| {
        let s = &ui[&id];
        (
            s.start_ms,
            s.end_ms,
            s.src_text.as_str(),
            s.tgt_text.as_str(),
            s.status,
            s.provisional,
        )
    };
    // Khung 32 ms: tiếng bắt đầu ở 1 000 ms rơi vào khung 992–1 024 ms.
    assert_eq!(
        row(1_000),
        (
            992,
            4_928,
            "so we went to the market yesterday",
            "VI: so we went to the market yesterday",
            Status::Done,
            false
        )
    );
    assert_eq!(
        row(1_002),
        (6_400, 7_616, "Then we ate.", "VI: Then we ate.", Status::Done, false)
    );
    assert_eq!(
        row(1_003),
        (9_088, 10_112, "xin chào mọi người", "", Status::SameLang, false)
    );
    assert_eq!(
        (
            metrics.segments,
            metrics.filtered,
            metrics.same_lang,
            metrics.merges,
            metrics.dropped
        ),
        (5, 1, 1, 1, 0)
    );
    // Phút cho hạn mức (§6.8): tiếng nói của các câu đã dịch xong, không gồm đệm; câu ghép cộng từng đoạn, không tính
    // khoảng nghỉ 3 008–3 392 ms; câu tiếng Việt (`same_lang`) và đoạn bị lọc không tính.
    assert_eq!(
        metrics.translated_speech_ms,
        (3_008 - 992) + (4_928 - 3_392) + (7_616 - 6_400)
    );
    let usage: u64 = sink.usage.lock().unwrap().iter().map(|u| u.speech_ms).sum();
    assert_eq!(usage, metrics.translated_speech_ms, "mỗi đoạn được báo đúng một lần");
    assert!(!sink.levels.lock().unwrap().is_empty(), "có mức âm lượng cho giao diện");
    assert!(
        !sink
            .events()
            .iter()
            .any(|e| matches!(e, Ev::Indicators(i) if i.lagging || i.no_audio)),
        "không trễ, và 1,5 giây im lặng chưa phải \"không có âm thanh\""
    );
    assert!(!sink.events().iter().any(|e| matches!(e, Ev::Fatal(..))));

    // Log của cả phiên không có chữ chép lời hay bản dịch nào.
    let log = LOG.0.lock().unwrap().join("\n");
    for secret in ["market", "we ate", "xin chào", "Thank you"] {
        assert!(!log.contains(secret), "log lộ \"{secret}\":\n{log}");
    }
}

#[test]
fn a_segment_that_keeps_crashing_the_worker_is_shown_as_dropped() {
    let t = Temp::new("dropped");
    let clock = Arc::new(FakeClock::default());
    let manager = manager(&t, &["en\tHello there."], &["crash_on:1", "crash_on:1", "ok"], clock);
    let samples = audio(&[
        (false, 500),
        (true, 1_000),
        (false, 1_500),
        (true, 1_000),
        (false, 1_500),
    ]);
    let sink = Arc::new(Recorder::default());
    let engine = Engine::start(
        config(&["en"]),
        source(samples),
        energy_vad(),
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        sink.clone(),
    )
    .unwrap();
    let metrics = engine.join();
    let (ui, order) = sink.replay();
    assert_eq!(order, [1_000, 1_001]);
    assert_eq!(ui[&1_000].status, Status::Dropped);
    assert_eq!(ui[&1_001].status, Status::Done);
    assert_eq!(metrics.dropped, 1);
}

#[test]
fn a_worker_that_keeps_crashing_stops_the_session_with_an_error() {
    let t = Temp::new("fatal");
    let clock = Arc::new(FakeClock::default());
    let manager = manager(&t, &["en\tHello."], &["crash_on:1"; 7], clock);
    let samples = audio(&[
        (false, 500),
        (true, 1_000),
        (false, 1_500),
        (true, 1_000),
        (false, 1_500),
        (true, 1_000),
        (false, 1_500),
    ]);
    let sink = Arc::new(Recorder::default());
    let engine = Engine::start(
        config(&["en"]),
        source(samples),
        energy_vad(),
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        sink.clone(),
    )
    .unwrap();
    engine.join();
    let fatal: Vec<String> = sink
        .events()
        .into_iter()
        .filter_map(|e| match e {
            Ev::Fatal(Fatal::Asr, r) => Some(r),
            Ev::Fatal(kind, r) => panic!("{kind:?}: {r}"),
            _ => None,
        })
        .collect();
    assert_eq!(fatal.len(), 1, "{fatal:?}");
    assert!(fatal[0].contains("quá 5 lần"), "{}", fatal[0]);
}

#[test]
fn stop_ends_a_live_session_quickly() {
    let t = Temp::new("stop");
    let manager = manager(&t, &["en\tstill talking"], &[], Arc::new(SystemClock::default()));
    // Nguồn chạy đúng thời gian thực, dài 60 giây: chỉ dừng được bằng `stop`.
    let samples = audio(&[(true, 30_000), (false, 30_000)]);
    let live = Box::new(SampleSource::new(samples, 512, Duration::from_millis(32)));
    let sink = Arc::new(Recorder::default());
    let engine = Engine::start(
        config(&["en"]),
        live,
        energy_vad(),
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        sink.clone(),
    )
    .unwrap();
    std::thread::sleep(Duration::from_millis(500));
    let started = Instant::now();
    let metrics = engine.stop();
    assert!(started.elapsed() < Duration::from_secs(5), "{:?}", started.elapsed());
    // Đoạn đang nói dở được chốt khi dừng và vẫn có phụ đề.
    assert_eq!(metrics.segments, 1);
    let (ui, _) = sink.replay();
    assert_eq!(ui.len(), 1);
}
