//! Pipeline với tiến trình phụ và model thật, trên clip FLEURS ở `tests/fixtures/audio/` (Đ20 của kế hoạch 00). Cần model
//! và binary nên bị bỏ qua mặc định. Chạy từ gốc repo:
//!
//! ```text
//! MT_ASR_WORKER=<asr-worker build metal,shared-encode> MT_ASR_MODEL=models/ggml-small-q5_1.bin \
//! MT_LLAMA_SERVER=tools/llama-b11146/macos-arm64/llama-b11146/llama-server MT_MT_MODEL=models/Hy-MT2-1.8B-Q4_K_M.gguf \
//! MT_VAD_MODEL=models/silero_vad_v6.2.3.onnx cargo test -p pipeline --test real_sidecars -- --include-ignored --nocapture
//! ```
//!
//! Phát clip đúng thời gian thực (khoảng 19 giây), nên độ trễ và hàng đợi chạy như khi thu thật.

use pipeline::config::PipelineConfig;
use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, Indicators, SampleSource};
use pipeline::prompt::Lang;
use pipeline::subtitle::{Delta, Status, Subtitle};
use pipeline::supervisor::{AsrSpec, LlamaSpec, NoEvents, SidecarManager, SidecarSpec, SystemClock};
use pipeline::vad::SileroVad;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Default)]
struct Ui(Mutex<(BTreeMap<u64, Subtitle>, Vec<u64>)>);

impl EventSink for Ui {
    fn subtitle(&self, s: &Subtitle) {
        let mut ui = self.0.lock().unwrap();
        for id in &s.replaces {
            ui.0.remove(id);
        }
        if !ui.1.contains(&s.id) {
            ui.1.push(s.id);
        }
        ui.0.insert(s.id, s.clone());
    }
    fn delta(&self, d: &Delta) {
        if let Some(s) = self.0.lock().unwrap().0.get_mut(&d.id) {
            s.tgt_text.push_str(&d.text);
        }
    }
    fn level(&self, _: f32) {}
    fn indicators(&self, _: &Indicators) {}
    fn fatal(&self, kind: Fatal, reason: &str) {
        panic!("pipeline dừng ({kind:?}): {reason}");
    }
}

#[derive(serde::Deserialize)]
struct Truth {
    lang: String,
    start_ms: u64,
    end_ms: u64,
}

fn env(name: &str) -> PathBuf {
    PathBuf::from(std::env::var(name).unwrap_or_else(|_| panic!("đặt {name}")))
}

#[test]
#[ignore = "cần model và binary thật, xem đầu file"]
fn real_sidecars_translate_the_fixture_in_order() {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/audio");
    let truth: Vec<Truth> =
        serde_json::from_reader(std::fs::File::open(fixtures.join("fleurs-en-en-vi.json")).unwrap()).unwrap();
    let samples: Vec<f32> = hound::WavReader::open(fixtures.join("fleurs-en-en-vi.wav"))
        .unwrap()
        .samples::<i16>()
        .map(|s| s.unwrap() as f32 / 32768.0)
        .collect();
    let logs = std::env::temp_dir().join(format!("pipeline-real-{}", std::process::id()));
    let spec = SidecarSpec {
        asr: AsrSpec {
            exe_gpu: Some(env("MT_ASR_WORKER")),
            exe_cpu: env("MT_ASR_WORKER"),
            model: env("MT_ASR_MODEL"),
            log: logs.join("asr-worker.log"),
            first_run: false,
            require_shared: true,
            env: Vec::new(),
        },
        llama: LlamaSpec {
            exe: env("MT_LLAMA_SERVER"),
            model: env("MT_MT_MODEL"),
            log: logs.join("llama-server.log"),
            extra_args: Vec::new(),
            first_run: false,
            env: Vec::new(),
        },
        supervisor: Default::default(),
        asr_config: Default::default(),
        mt_config: Default::default(),
    };
    let manager = SidecarManager::new(spec, Arc::new(SystemClock::default()), Arc::new(NoEvents));
    manager.ensure_started().unwrap();
    let vad_model = env("MT_VAD_MODEL");
    let ui = Arc::new(Ui::default());
    let engine = Engine::start(
        EngineConfig {
            pipeline: PipelineConfig::default(),
            languages: ["en", "zh", "ja", "ko", "vi"].map(String::from).to_vec(),
            target: Lang::Vi,
            translation_context: false,
            id_base: 0,
        },
        Box::new(SampleSource::new(samples, 512, Duration::from_millis(32))),
        Box::new(move || Ok(Box::new(SileroVad::load(&vad_model)?) as _)),
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        ui.clone(),
    )
    .unwrap();
    let metrics = engine.join();
    println!("{}", metrics.summary());
    let (subs, order) = std::mem::take(&mut *ui.0.lock().unwrap());
    for s in subs.values() {
        println!(
            "{} {}–{} {:?} {} | {}",
            s.id, s.start_ms, s.end_ms, s.status, s.src_text, s.tgt_text
        );
    }
    // Thứ tự xuất hiện lần đầu là thứ tự thời gian.
    let starts: Vec<u64> = order.iter().filter_map(|id| subs.get(id)).map(|s| s.start_ms).collect();
    assert!(starts.windows(2).all(|w| w[0] < w[1]), "{starts:?}");
    // Mỗi câu thật có ít nhất một phụ đề nằm trong khoảng của nó (±0,5 giây), đúng trạng thái.
    for t in &truth {
        let inside: Vec<&Subtitle> = subs
            .values()
            .filter(|s| s.start_ms + 500 >= t.start_ms && s.end_ms <= t.end_ms + 500)
            .collect();
        assert!(
            !inside.is_empty(),
            "không có phụ đề cho câu {}–{}",
            t.start_ms,
            t.end_ms
        );
        for s in inside {
            assert_eq!(s.src_lang, t.lang);
            let expected = if t.lang == "vi" { Status::SameLang } else { Status::Done };
            assert_eq!(s.status, expected, "{s:?}");
            assert!(!s.provisional, "phụ đề cuối không còn là phụ đề tạm: {s:?}");
            if expected == Status::Done {
                assert!(!s.tgt_text.is_empty());
            }
        }
    }
    let _ = std::fs::remove_dir_all(&logs);
}
