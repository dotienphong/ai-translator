//! Dịch trong lúc người nói chưa dừng (spec 2026-10-10 §11, "Engine"): engine đầy đủ qua đúng `SidecarManager` của app, với
//! `fake_asr_worker` (chữ dài dần theo âm thanh, `words_per_sec`) và `fake_llama_server` (stream lại phần prefill như
//! `llama-server` b11146). Kiểm: có lần chép từng phần; dòng đang nói có bản dịch và phần dịch ổn định; có bản tạm gửi kèm
//! prefill mà chữ hiện không lặp phần prefill; phụ đề cuối chốt rồi mới có `live_end`; log không có chữ nào.

use pipeline::config::{AsrConfig, MtConfig, PipelineConfig, SupervisorConfig};
use pipeline::engine::{EnergyVad, Engine, EngineConfig, EventSink, Fatal, Indicators, SampleSource, VadFactory};
use pipeline::prompt::Lang;
use pipeline::subtitle::{Delta, LiveEnd, LiveLine, Status, Subtitle};
use pipeline::supervisor::{AsrSpec, LlamaSpec, NoEvents, SidecarManager, SidecarSpec, SystemClock};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, Once};
use std::time::Duration;

const FAKE_ASR: &str = env!("CARGO_BIN_EXE_fake_asr_worker");
const FAKE_LLAMA: &str = env!("CARGO_BIN_EXE_fake_llama_server");
const RATE: usize = 16_000;

/// Log của cả tiến trình test, để kiểm log không chứa chữ chép hay chữ dịch, kể cả bản tạm.
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
    Live(LiveLine),
    End(u64),
    Indicators(Indicators),
    // Hai trường chỉ đọc qua `{:?}` khi assert thất bại (debug); `derive(Debug)` không được rustc tính là "đã đọc" cho
    // dead_code.
    #[allow(dead_code)]
    Fatal(Fatal, String),
}

#[derive(Default)]
struct Recorder {
    events: Mutex<Vec<Ev>>,
}

impl EventSink for Recorder {
    fn subtitle(&self, s: &Subtitle) {
        self.events.lock().unwrap().push(Ev::Upsert(s.clone()));
    }
    fn delta(&self, _: &Delta) {}
    fn level(&self, _: f32) {}
    fn indicators(&self, i: &Indicators) {
        self.events.lock().unwrap().push(Ev::Indicators(i.clone()));
    }
    fn fatal(&self, kind: Fatal, reason: &str) {
        self.events.lock().unwrap().push(Ev::Fatal(kind, reason.to_string()));
    }
    fn live(&self, l: &LiveLine) {
        self.events.lock().unwrap().push(Ev::Live(l.clone()));
    }
    fn live_end(&self, e: &LiveEnd) {
        self.events.lock().unwrap().push(Ev::End(e.id));
    }
}

struct Temp(PathBuf);

impl Temp {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("pipeline-streaming-{name}-{}", std::process::id()));
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

fn manager(t: &Temp) -> Arc<SidecarManager> {
    std::fs::write(
        t.path("texts"),
        "en\tone two three four five six seven eight nine ten eleven twelve",
    )
    .unwrap();
    std::fs::write(t.path("asr-plan"), "words_per_sec:2").unwrap();
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
                ("FAKE_ASR_LOG".into(), t.path("asr-events").display().to_string()),
            ],
        },
        llama: LlamaSpec {
            exe: PathBuf::from(FAKE_LLAMA),
            model: PathBuf::from("/models/mt.gguf"),
            log: t.path("logs/llama-server.log"),
            extra_args: Vec::new(),
            first_run: false,
            env: vec![("FAKE_LLAMA_LOG".into(), t.path("llama-events").display().to_string())],
        },
        supervisor: SupervisorConfig {
            ready_timeout_ms: 10_000,
            shutdown_grace_ms: 1_000,
            ..SupervisorConfig::default()
        },
        asr_config: AsrConfig::default(),
        mt_config: MtConfig::default(),
    };
    SidecarManager::new(spec, Arc::new(SystemClock::default()), Arc::new(NoEvents))
}

#[test]
fn partials_become_live_lines_with_a_prefill_and_the_final_replaces_them() {
    capture_log();
    let t = Temp::new("live");
    let manager = manager(&t);
    manager.ensure_started().unwrap();
    let mut pipeline = PipelineConfig::default();
    pipeline.segmenter.end_silence_ms = 50;
    // Đặt rõ, không dựa vào mặc định (Task 21 đổi mặc định theo quyết định ở cổng).
    pipeline.streaming.end_silence_ms = 400;
    pipeline.queue.lag_warn_ms = 600_000;
    let config = EngineConfig {
        pipeline,
        languages: vec!["en".into()],
        target: Lang::Vi,
        translation_context: false,
        id_base: 1_000,
        glossary: Default::default(),
        streaming_supported: true,
        streaming_enabled: true,
    };
    // 0,5 giây im lặng, 4,5 giây tiếng, 1,5 giây im lặng, phát đúng thời gian thực: một đoạn (id 0), ngưỡng đóng đoạn là
    // max(50, 400) = 400 ms.
    let samples = audio(&[(false, 500), (true, 4_500), (false, 1_500)]);
    let source = Box::new(SampleSource::new(samples, 512, Duration::from_millis(32)));
    let vad: VadFactory = Box::new(|| Ok(Box::new(EnergyVad { threshold_rms: 0.01 }) as _));
    let sink = Arc::new(Recorder::default());
    let engine = Engine::start(
        config,
        source,
        vad,
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        sink.clone(),
    )
    .unwrap();
    let metrics = engine.join();
    let events = sink.events.lock().unwrap().clone();
    assert!(!events.iter().any(|e| matches!(e, Ev::Fatal(..))), "{events:?}");
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, Ev::Indicators(i) if i.streaming_unavailable)),
        "máy đủ sức, không tự tắt"
    );
    assert!(metrics.partials >= 2, "{}", metrics.summary());
    let asr_events = std::fs::read_to_string(t.path("asr-events")).unwrap();
    assert!(
        asr_events.lines().filter(|l| l.starts_with("transcribe 0 ")).count() >= 3,
        "các lần chép từng phần và lượt cuối cùng mang id 0:\n{asr_events}"
    );

    let id = 1_000;
    let lives: Vec<&LiveLine> = events
        .iter()
        .filter_map(|e| match e {
            Ev::Live(l) if l.id == id => Some(l),
            _ => None,
        })
        .collect();
    assert!(
        lives.iter().any(|l| !l.tgt_stable.is_empty()),
        "có phần dịch ổn định: {lives:?}"
    );
    // Bản dịch giả là "VI: " rồi đúng các từ nguồn: chữ dịch đang hiện phải là tiền tố THEO TỪ của bản dịch đầy đủ (kể cả
    // "VI:" của gói SSE đầu khi chưa có prefill, QĐ7), và không bao giờ ngắn lại (QĐ7; chữ nguồn chỉ dài thêm).
    const SRC: &str = "one two three four five six seven eight nine ten eleven twelve";
    let tgt_full = format!("VI: {SRC}");
    let word_prefix = |full: &str, s: &str| s.is_empty() || full == s || full.starts_with(&format!("{s} "));
    let mut shown = 0;
    for l in &lives {
        let tgt = format!("{}{}", l.tgt_stable, l.tgt_tail);
        assert!(word_prefix(&tgt_full, &tgt), "{tgt:?}");
        assert!(tgt.chars().count() >= shown, "chữ dịch đang hiện ngắn lại: {tgt:?}");
        shown = tgt.chars().count();
        let src = format!("{}{}", l.src_stable, l.src_tail);
        assert!(!src.is_empty() && word_prefix(SRC, &src), "{l:?}");
    }
    let llama_events = std::fs::read_to_string(t.path("llama-events")).unwrap();
    assert!(
        llama_events.lines().any(|l| l.contains(" prefill=")),
        "có bản tạm gửi kèm prefill:\n{llama_events}"
    );

    // Phụ đề cuối chốt rồi mới gỡ dòng đang nói; sau đó không còn phát dòng đó.
    let done_at = events
        .iter()
        .position(|e| matches!(e, Ev::Upsert(s) if s.id == id && s.status == Status::Done))
        .expect("phụ đề cuối phải dịch xong");
    let end_at = events
        .iter()
        .position(|e| matches!(e, Ev::End(i) if *i == id))
        .expect("phải gỡ dòng đang nói");
    assert!(done_at < end_at, "{events:?}");
    assert!(!events[end_at..].iter().any(|e| matches!(e, Ev::Live(l) if l.id == id)));
    let Ev::Upsert(fin) = &events[done_at] else {
        unreachable!()
    };
    assert!(fin.tgt_text.starts_with("VI: one"), "{fin:?}");
    assert_eq!(fin.tgt_text, format!("VI: {}", fin.src_text), "{fin:?}");

    // Log của cả phiên không có chữ chép lời hay bản dịch nào, kể cả bản tạm.
    let log = LOG.0.lock().unwrap().join("\n");
    for secret in ["one two", "three", "seven", "VI:"] {
        assert!(!log.contains(secret), "log lộ \"{secret}\":\n{log}");
    }
}
