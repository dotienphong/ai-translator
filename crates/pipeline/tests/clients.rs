//! Client của hai tiến trình phụ (spec §6.4, §6.5), chạy với tiến trình phụ giả (`src/bin/fake_*.rs`): không cần model.

use asr_protocol::{Backend, DecodeMode, ErrorKind, TranscribeRequest};
use pipeline::asr_client::{AsrError, AsrLaunch, AsrWorker};
use pipeline::llama::{ChatRequest, LlamaLaunch, LlamaServer};
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once};
use std::time::Duration;

/// Logger của binary test này: giữ mọi bản ghi `log`, để test kiểm rằng API key không lọt vào log của app.
struct Capture;

static CAPTURED: Mutex<Vec<String>> = Mutex::new(Vec::new());

impl log::Log for Capture {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }
    fn log(&self, record: &log::Record) {
        CAPTURED
            .lock()
            .unwrap()
            .push(format!("{} {}", record.target(), record.args()));
    }
    fn flush(&self) {}
}

fn capture_logs() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        log::set_logger(&Capture).unwrap();
        log::set_max_level(log::LevelFilter::Trace);
    });
}

const FAKE_ASR: &str = env!("CARGO_BIN_EXE_fake_asr_worker");
const FAKE_LLAMA: &str = env!("CARGO_BIN_EXE_fake_llama_server");

/// Thư mục tạm riêng của một test, xóa khi xong.
struct Temp(PathBuf);

impl Temp {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("pipeline-clients-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }

    fn plan(&self, name: &str, lines: &[&str]) -> PathBuf {
        let path = self.path(name);
        std::fs::write(&path, lines.join("\n")).unwrap();
        path
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn asr_launch(t: &Temp, plan: &[&str]) -> AsrLaunch {
    AsrLaunch {
        env: vec![
            ("FAKE_ASR_PLAN".into(), t.plan("asr-plan", plan).display().to_string()),
            ("FAKE_ASR_LOG".into(), t.path("asr-events").display().to_string()),
        ],
        request_timeout: Duration::from_millis(500),
        ..AsrLaunch::new(
            Path::new(FAKE_ASR),
            Path::new("/model.bin"),
            &t.path("logs/asr-worker.log"),
        )
    }
}

fn request(id: u64) -> TranscribeRequest {
    TranscribeRequest {
        segment_id: id,
        pcm: vec![0; 16_000],
        languages: vec!["en".into(), "vi".into()],
        prompt_tokens: vec![1, 2, 3],
        audio_ctx: 512,
        prev_lang: Some("vi".into()),
    }
}

#[test]
fn asr_worker_transcribes_and_reports_the_real_backend() {
    let t = Temp::new("asr-ok");
    let (mut worker, ready) = AsrWorker::spawn(&asr_launch(&t, &["backend:cpu"])).unwrap();
    assert_eq!((ready.backend, ready.decode_mode), (Backend::Cpu, DecodeMode::Shared));
    assert_eq!(worker.warmup().unwrap(), 1.0);
    let r = worker.transcribe(request(7)).unwrap();
    assert_eq!((r.segment_id, r.lang.as_str(), r.text.as_str()), (7, "en", "đoạn 7"));
    drop(worker);
    let events = std::fs::read_to_string(t.path("asr-events")).unwrap();
    assert_eq!(events, "start use_gpu=true\nwarmup\ntranscribe 7 prev=vi prompt=3\n");
}

#[test]
fn a_worker_of_another_protocol_version_is_refused() {
    let t = Temp::new("asr-version");
    let err = AsrWorker::spawn(&asr_launch(&t, &["version:1"]))
        .map(|_| ())
        .unwrap_err();
    assert!(err.is_crash() && err.to_string().contains("phiên bản 1"), "{err}");
}

#[test]
fn load_errors_keep_their_kind() {
    let t = Temp::new("asr-oom");
    let err = AsrWorker::spawn(&asr_launch(&t, &["load_error:OutOfMemory"]))
        .map(|_| ())
        .unwrap_err();
    assert_eq!(err.kind(), Some(ErrorKind::OutOfMemory));
}

#[test]
fn a_crash_or_a_missing_dll_is_a_crash_with_the_exit_status() {
    let t = Temp::new("asr-crash");
    let (mut worker, _) = AsrWorker::spawn(&asr_launch(&t, &["crash_on:1"])).unwrap();
    let err = worker.transcribe(request(1)).unwrap_err();
    assert!(err.is_crash(), "{err}");
    assert!(err.to_string().contains("exit status: 3"), "{err}");
    // Windows thiếu vulkan-1.dll: tiến trình thoát trước khi nói gì (STATUS_DLL_NOT_FOUND). Mã giả ở đây là 135.
    let err = AsrWorker::spawn(&asr_launch(&t, &["exit_at_start:135"]))
        .map(|_| ())
        .unwrap_err();
    assert!(err.is_crash(), "{err}");
}

/// Kết quả mang id của đoạn khác: luồng giao thức đã lệch, phải coi như worker hỏng.
#[test]
fn a_result_for_another_segment_is_a_crash() {
    let t = Temp::new("asr-wrong-id");
    let (mut worker, _) = AsrWorker::spawn(&asr_launch(&t, &["wrong_id_on:2"])).unwrap();
    assert_eq!(worker.transcribe(request(1)).unwrap().segment_id, 1);
    let err = worker.transcribe(request(2)).unwrap_err();
    assert!(err.is_crash(), "{err}");
    assert!(
        err.to_string().contains("kết quả đoạn 1002 khi đang chờ đoạn 2"),
        "{err}"
    );
}

#[test]
fn a_hung_worker_is_killed_after_the_timeout() {
    let t = Temp::new("asr-hang");
    let (mut worker, _) = AsrWorker::spawn(&asr_launch(&t, &["hang_on:1"])).unwrap();
    let started = std::time::Instant::now();
    let err = worker.transcribe(request(1)).unwrap_err();
    assert!(
        matches!(&err, AsrError::Crashed(m) if m.contains("không trả lời")),
        "{err}"
    );
    assert!(started.elapsed() < Duration::from_secs(5));
}

fn llama_launch(t: &Temp, plan: &[&str]) -> LlamaLaunch {
    LlamaLaunch {
        env: vec![
            (
                "FAKE_LLAMA_PLAN".into(),
                t.plan("llama-plan", plan).display().to_string(),
            ),
            ("FAKE_LLAMA_LOG".into(), t.path("llama-events").display().to_string()),
        ],
        ready_timeout: Duration::from_secs(10),
        ..LlamaLaunch::new(
            Path::new(FAKE_LLAMA),
            Path::new("/mt.gguf"),
            &t.path("logs/llama-server.log"),
        )
    }
}

#[test]
fn llama_server_streams_deltas_with_the_key_from_the_environment() {
    let t = Temp::new("llama-ok");
    let server = LlamaServer::spawn(&llama_launch(&t, &["ok"])).unwrap();
    assert!(server.healthy());
    assert_eq!(server.count_tokens("xin chào các bạn").unwrap(), 4);
    let mut deltas = Vec::new();
    let req = ChatRequest {
        prompt: "Translate the following text into Vietnamese.\n\nGood morning everyone",
        max_tokens: 64,
        repeat_penalty: 1.05,
    };
    let end = server
        .stream(&req, &mut |d| {
            deltas.push(d.to_string());
            ControlFlow::Continue(())
        })
        .unwrap();
    assert_eq!(deltas, ["VI:", " Good", " morning", " everyone"]);
    assert_eq!(end.text, "VI: Good morning everyone");
    assert_eq!(
        (end.finish_reason.as_deref(), end.completion_tokens, end.chunks),
        (Some("stop"), Some(4), 4)
    );
    drop(server);
    let events = std::fs::read_to_string(t.path("llama-events")).unwrap();
    assert_eq!(events, "start ngl=auto extra=\nchat 1 repeat=1.05 max=64\n");
}

/// API key không lộ ra `Debug`, log của app, `llama-server.log` (kể cả khi server in key ra stderr) hay log sự kiện.
#[test]
fn the_api_key_never_reaches_a_log() {
    capture_logs();
    let t = Temp::new("llama-key");
    let mut launch = llama_launch(&t, &["leak_key"]);
    launch
        .env
        .push(("FAKE_LLAMA_KEY_FILE".into(), t.path("key").display().to_string()));
    let server = LlamaServer::spawn(&launch).unwrap();
    let key = std::fs::read_to_string(t.path("key")).unwrap();
    assert_eq!(key.len(), 32);
    server.translate("Translate.\n\nhello", 16).unwrap();
    let debug = format!("{server:?}");
    assert!(debug.contains("<ẩn>") && !debug.contains(&key), "{debug}");
    let tail = server.log_tail().join("\n");
    drop(server);
    let log = std::fs::read_to_string(t.path("logs/llama-server.log")).unwrap();
    assert!(log.contains("LLAMA_API_KEY=<ẩn>"), "server có in key, đã bị che: {log}");
    assert!(!log.contains(&key), "{log}");
    assert!(!tail.contains(&key), "{tail}");
    let events = std::fs::read_to_string(t.path("llama-events")).unwrap();
    assert!(!events.contains(&key), "{events}");
    let captured = CAPTURED.lock().unwrap().join("\n");
    assert!(!captured.contains(&key), "{captured}");
}

/// Server không đủ bộ nhớ để nạp model: lỗi mang các dòng cuối của log, để giám sát nhận ra hết bộ nhớ.
#[test]
fn a_server_that_runs_out_of_memory_reports_the_log_tail() {
    let t = Temp::new("llama-oom");
    let err = LlamaServer::spawn(&llama_launch(&t, &["oom_at_start"])).unwrap_err();
    let msg = format!("{err:#}");
    assert!(msg.contains("thoát sớm") && msg.contains("out of memory"), "{msg}");
}

/// Với `llama-server` b11146 thật: request không có key bị từ chối (401), có key thì được (200). Cần binary và model:
///
/// ```text
/// MT_LLAMA_SERVER=$PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
/// MT_LLAMA_MODEL=$PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf \
/// cargo test -p pipeline --test clients real_llama_server -- --include-ignored
/// ```
#[test]
#[ignore = "cần llama-server b11146 và model"]
fn real_llama_server_requires_the_api_key() {
    let exe = PathBuf::from(std::env::var("MT_LLAMA_SERVER").expect("MT_LLAMA_SERVER"));
    let model = PathBuf::from(std::env::var("MT_LLAMA_MODEL").expect("MT_LLAMA_MODEL"));
    let t = Temp::new("llama-real");
    let launch = LlamaLaunch {
        ready_timeout: Duration::from_secs(180),
        ..LlamaLaunch::new(&exe, &model, &t.path("llama-server.log"))
    };
    let server = LlamaServer::spawn(&launch).unwrap();
    let http = reqwest::blocking::Client::builder().no_proxy().build().unwrap();
    let url = format!("{}/tokenize", server.base_url());
    let status = http
        .post(&url)
        .json(&serde_json::json!({ "content": "hi" }))
        .send()
        .unwrap()
        .status();
    assert_eq!(status.as_u16(), 401, "không có key");
    assert!(server.count_tokens("xin chào").unwrap() > 0, "có key: 200");
}

#[test]
fn cpu_mode_passes_ngl_0_and_extra_args() {
    let t = Temp::new("llama-cpu");
    let launch = LlamaLaunch {
        use_gpu: false,
        extra_args: vec!["--no-repack".into()],
        ..llama_launch(&t, &["ok"])
    };
    drop(LlamaServer::spawn(&launch).unwrap());
    let events = std::fs::read_to_string(t.path("llama-events")).unwrap();
    assert_eq!(events.lines().next(), Some("start ngl=0 extra=--no-repack"));
}

#[test]
fn a_server_that_dies_at_start_is_reported() {
    let t = Temp::new("llama-dead");
    let err = LlamaServer::spawn(&llama_launch(&t, &["exit_at_start:1"])).unwrap_err();
    assert!(err.to_string().contains("thoát sớm"), "{err}");
}
