//! Vòng đời hai tiến trình phụ (spec §11, "Test tích hợp"): khởi động đúng thứ tự, crash, tự khởi động lại, gửi lại đoạn
//! đang xử lý, chuyển sang CPU sau 2 lần crash khi dùng GPU, bỏ cuộc sau hơn 5 lần lỗi trong 10 phút, tắt sau 10 phút
//! không dịch, kiểm binary trước mỗi lần chạy, và app thoát không phải chờ tiến trình phụ. Tiến trình phụ là bản giả
//! (`src/bin/fake_*.rs`); mọi thời gian chờ của giám sát đi qua `FakeClock`, không chờ thật. Vài test về thời gian chờ
//! của chính tiến trình phụ (lần đầu chạy, app thoát giữa lúc nạp model) chờ thật dưới 1 giây.

use asr_protocol::TranscribeRequest;
use pipeline::config::{AsrConfig, MtConfig, SupervisorConfig};
use pipeline::prompt::Lang;
use pipeline::supervisor::{
    AsrFailure, AsrSpec, Clock, FakeClock, GiveUpCause, LlamaSpec, SidecarEvent, SidecarEvents, SidecarManager,
    SidecarSpec, Which,
};
use pipeline::translate::{Job, Outcome, translate};
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const FAKE_ASR: &str = env!("CARGO_BIN_EXE_fake_asr_worker");
const FAKE_LLAMA: &str = env!("CARGO_BIN_EXE_fake_llama_server");

struct Temp(PathBuf);

impl Temp {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("pipeline-lifecycle-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }

    fn read(&self, name: &str) -> String {
        std::fs::read_to_string(self.path(name)).unwrap_or_default()
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[derive(Default)]
struct Recorder {
    events: Mutex<Vec<SidecarEvent>>,
    /// Các lần app được hỏi trước khi chạy một binary.
    checked: Mutex<Vec<(Which, PathBuf)>>,
    /// Binary của bên này không qua bước kiểm (như sai SHA-256).
    reject: Mutex<Option<Which>>,
    /// Các binary chưa từng chạy tới `Ready` (lần đầu chạy).
    new_binaries: Mutex<Vec<PathBuf>>,
    /// Các lần giám sát hỏi `is_first_run`.
    asked: Mutex<Vec<PathBuf>>,
}

impl SidecarEvents for Recorder {
    fn on_event(&self, e: &SidecarEvent) {
        self.events.lock().unwrap().push(e.clone());
    }

    fn before_spawn(&self, which: Which, exe: &Path) -> Result<(), String> {
        self.checked.lock().unwrap().push((which, exe.to_path_buf()));
        match *self.reject.lock().unwrap() {
            Some(w) if w == which => Err(format!("{} có SHA-256 khác bảng của app", exe.display())),
            _ => Ok(()),
        }
    }

    fn is_first_run(&self, _which: Which, exe: &Path) -> bool {
        self.asked.lock().unwrap().push(exe.to_path_buf());
        self.new_binaries.lock().unwrap().iter().any(|p| p == exe)
    }
}

impl Recorder {
    fn events(&self) -> Vec<SidecarEvent> {
        self.events.lock().unwrap().clone()
    }

    fn checked(&self) -> Vec<Which> {
        self.checked.lock().unwrap().iter().map(|(w, _)| *w).collect()
    }

    /// Tên ngắn của từng sự kiện, theo thứ tự.
    fn names(&self) -> Vec<String> {
        self.events()
            .iter()
            .map(|e| match e {
                SidecarEvent::Starting { which, .. } => format!("start {which:?}"),
                SidecarEvent::Ready { which, use_gpu, .. } => format!("ready {which:?} gpu={use_gpu}"),
                SidecarEvent::Restarting { which, after_ms, .. } => format!("restart {which:?} {after_ms}"),
                SidecarEvent::CpuFallback { which } => format!("cpu {which:?}"),
                SidecarEvent::OutOfMemory { which } => format!("oom {which:?}"),
                SidecarEvent::GaveUp { which, cause, .. } => format!("gave-up {which:?} {cause:?}"),
                SidecarEvent::Stopped { which, idle } => format!("stopped {which:?} idle={idle}"),
            })
            .collect()
    }
}

struct Setup {
    t: Temp,
    clock: Arc<FakeClock>,
    events: Arc<Recorder>,
    manager: Arc<SidecarManager>,
}

/// `gpu`: có bản GPU (như macOS, hoặc Windows khi `--probe` thấy GPU dùng được).
fn setup(name: &str, gpu: bool, asr_plan: &[&str], llama_plan: &[&str]) -> Setup {
    setup_with(name, gpu, asr_plan, llama_plan, false)
}

/// `first_run`: lần đầu chạy hai binary này (sau khi cài hoặc cập nhật).
fn setup_with(name: &str, gpu: bool, asr_plan: &[&str], llama_plan: &[&str], first_run: bool) -> Setup {
    setup_spec(name, gpu, asr_plan, llama_plan, |spec| {
        spec.asr.first_run = first_run;
        spec.llama.first_run = first_run;
    })
}

/// Như `setup`, rồi `edit` sửa cấu hình trước khi dựng `SidecarManager`.
fn setup_spec(
    name: &str,
    gpu: bool,
    asr_plan: &[&str],
    llama_plan: &[&str],
    edit: impl FnOnce(&mut SidecarSpec),
) -> Setup {
    setup_clock(name, gpu, asr_plan, llama_plan, edit, None)
}

/// Như `setup_spec`; `clock` thay `FakeClock` (vài test cần lần chờ thật, ngắt được bằng `Wake`).
fn setup_clock(
    name: &str,
    gpu: bool,
    asr_plan: &[&str],
    llama_plan: &[&str],
    edit: impl FnOnce(&mut SidecarSpec),
    clock: Option<Arc<dyn Clock>>,
) -> Setup {
    let t = Temp::new(name);
    std::fs::write(t.path("asr-plan"), asr_plan.join("\n")).unwrap();
    std::fs::write(t.path("llama-plan"), llama_plan.join("\n")).unwrap();
    let asr_env = vec![
        ("FAKE_ASR_PLAN".into(), t.path("asr-plan").display().to_string()),
        ("FAKE_ASR_LOG".into(), t.path("asr-events").display().to_string()),
    ];
    let llama_env = vec![
        ("FAKE_LLAMA_PLAN".into(), t.path("llama-plan").display().to_string()),
        ("FAKE_LLAMA_LOG".into(), t.path("llama-events").display().to_string()),
    ];
    let mut spec = SidecarSpec {
        asr: AsrSpec {
            exe_gpu: gpu.then(|| PathBuf::from(FAKE_ASR)),
            exe_cpu: PathBuf::from(FAKE_ASR),
            model: PathBuf::from("/models/asr.bin"),
            log: t.path("logs/asr-worker.log"),
            first_run: false,
            require_shared: true,
            env: asr_env,
        },
        llama: LlamaSpec {
            exe: PathBuf::from(FAKE_LLAMA),
            model: PathBuf::from("/models/mt.gguf"),
            log: t.path("logs/llama-server.log"),
            extra_args: Vec::new(),
            first_run: false,
            env: llama_env,
        },
        supervisor: SupervisorConfig {
            ready_timeout_ms: 10_000,
            first_run_ready_timeout_ms: 30_000,
            shutdown_grace_ms: 1_000,
            ..SupervisorConfig::default()
        },
        asr_config: AsrConfig {
            timeout_ms: 10_000,
            ..AsrConfig::default()
        },
        mt_config: MtConfig::default(),
    };
    edit(&mut spec);
    let fake = Arc::new(FakeClock::default());
    let events = Arc::new(Recorder::default());
    let manager = SidecarManager::new(spec, clock.unwrap_or_else(|| fake.clone()), events.clone());
    let clock = fake;
    Setup {
        t,
        clock,
        events,
        manager,
    }
}

fn request(id: u64) -> TranscribeRequest {
    TranscribeRequest {
        segment_id: id,
        pcm: vec![0; 16_000],
        languages: vec!["en".into()],
        prompt_tokens: Vec::new(),
        audio_ctx: 512,
        prev_lang: Some("en".into()),
    }
}

#[test]
fn asr_worker_starts_first_and_llama_server_after_it_is_ready() {
    let s = setup("order", true, &[], &[]);
    s.manager.ensure_started().unwrap();
    assert_eq!(
        s.events.names(),
        ["start Asr", "ready Asr gpu=true", "start Llama", "ready Llama gpu=true"]
    );
    // Worker đã nạp model và làm nóng trước khi server dịch chạy.
    assert_eq!(s.t.read("asr-events"), "start use_gpu=true\nwarmup\n");
    assert_eq!(s.t.read("llama-events"), "start ngl=auto extra=\n");
    assert!(s.clock.sleeps().is_empty());
}

#[test]
fn the_first_run_of_new_binaries_is_reported_once() {
    let s = setup_with("first-run", true, &["crash_on:1", "ok"], &[], true);
    s.manager.ensure_started().unwrap();
    let firsts: Vec<(String, bool)> = s
        .events
        .events()
        .iter()
        .filter_map(|e| match e {
            SidecarEvent::Starting { which, first_run } => Some((format!("start {which:?}"), *first_run)),
            SidecarEvent::Ready { which, first_run, .. } => Some((format!("ready {which:?}"), *first_run)),
            _ => None,
        })
        .collect();
    let expect = |n: &str, f: bool| (n.to_string(), f);
    assert_eq!(
        firsts,
        [
            expect("start Asr", true),
            expect("ready Asr", true),
            expect("start Llama", true),
            expect("ready Llama", true)
        ]
    );
    // Khởi động lại sau đó không còn là lần đầu: chờ `Ready` theo thời gian thường.
    s.manager.transcribe(request(1)).unwrap();
    assert!(s.events.events().iter().any(|e| matches!(
        e,
        SidecarEvent::Starting {
            which: Which::Asr,
            first_run: false
        }
    )));
}

#[test]
fn a_crash_restarts_the_worker_after_1_second_and_resends_the_segment() {
    let s = setup("resend", true, &["crash_on:1", "ok"], &[]);
    let r = s.manager.transcribe(request(5)).unwrap();
    assert_eq!(r.segment_id, 5);
    assert_eq!(s.clock.sleeps(), [1_000]);
    let transcribes = s.t.read("asr-events").matches("transcribe 5 ").count();
    assert_eq!(transcribes, 2, "đoạn đang xử lý được gửi lại đúng một lần");
    assert!(s.events.names().contains(&"restart Asr 1000".to_string()));
}

#[test]
fn a_segment_that_fails_again_is_dropped_and_the_next_one_works() {
    let s = setup("drop", false, &["crash_on:1", "crash_on:1", "ok"], &[]);
    let err = s.manager.transcribe(request(1)).unwrap_err();
    assert!(matches!(err, AsrFailure::Dropped(_)), "{err:?}");
    assert_eq!(s.clock.sleeps(), [1_000, 2_000]);
    assert_eq!(s.manager.transcribe(request(2)).unwrap().segment_id, 2);
}

#[test]
fn two_crashes_in_a_row_on_the_gpu_switch_to_the_cpu() {
    let s = setup("cpu", true, &["crash_on:1", "crash_on:1", "ok"], &[]);
    assert!(s.manager.transcribe(request(1)).is_err());
    assert!(s.events.names().contains(&"cpu Asr".to_string()));
    s.manager.transcribe(request(2)).unwrap();
    let starts: Vec<&str> =
        s.t.read("asr-events")
            .leak()
            .lines()
            .filter(|l| l.starts_with("start"))
            .collect();
    assert_eq!(
        starts,
        ["start use_gpu=true", "start use_gpu=true", "start use_gpu=false"]
    );
}

#[test]
fn a_gpu_worker_that_cannot_start_falls_back_to_the_cpu_at_once() {
    // Windows: asr-worker-vulkan thoát ngay vì thiếu vulkan-1.dll (mã giả 135).
    let s = setup("no-vulkan", true, &["exit_at_start:135", "ok"], &[]);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    assert_eq!(names[..4], ["start Asr", "cpu Asr", "restart Asr 1000", "start Asr"]);
    assert_eq!(names[4], "ready Asr gpu=false");
    assert_eq!(s.t.read("asr-events").lines().next(), Some("start use_gpu=false"));
}

#[test]
fn a_worker_whose_real_device_is_the_cpu_switches_to_cpu_mode() {
    let s = setup("real-cpu", true, &["backend:cpu"], &[]);
    s.manager.ensure_started().unwrap();
    assert!(s.events.names().contains(&"cpu Asr".to_string()));
    assert_eq!(s.manager.asr_backend(), Some(asr_protocol::Backend::Cpu));
}

#[test]
fn out_of_memory_is_reported_and_the_gpu_is_dropped() {
    let s = setup("oom", true, &["load_error:OutOfMemory", "ok"], &[]);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    assert_eq!(names[1..3], ["oom Asr", "cpu Asr"]);
}

#[test]
fn a_worker_without_mode_b_is_refused() {
    let s = setup("split", false, &["mode:split"], &[]);
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Asr, GiveUpCause::NoSharedMode));
    assert!(s.events.names().contains(&"gave-up Asr NoSharedMode".to_string()));
}

#[test]
fn more_than_5_failures_in_10_minutes_stop_the_translation() {
    let plan = ["crash_on:1"; 7];
    let s = setup("give-up", false, &plan, &[]);
    assert!(matches!(s.manager.transcribe(request(1)), Err(AsrFailure::Dropped(_))));
    assert!(matches!(s.manager.transcribe(request(2)), Err(AsrFailure::Dropped(_))));
    let err = s.manager.transcribe(request(3)).unwrap_err();
    assert!(matches!(err, AsrFailure::Unavailable(_)), "{err:?}");
    assert_eq!(s.clock.sleeps(), [1_000, 2_000, 5_000, 5_000, 5_000]);
    // Đã bỏ cuộc thì không chạy lại nữa, cho tới khi người dùng bấm Bắt đầu (`allow_retry`), kể cả khi nguyên nhân đã
    // được sửa; một phiên bắt đầu (`begin_session`) không phải là thử lại (R3-1 của review 02 lần 3).
    assert!(matches!(
        s.manager.transcribe(request(4)),
        Err(AsrFailure::Unavailable(_))
    ));
    std::fs::write(s.t.path("asr-plan"), "ok").unwrap();
    s.manager.begin_session();
    assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Failures);
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    assert!(s.manager.transcribe(request(5)).is_ok());
}

#[test]
fn both_sidecars_stop_after_10_minutes_without_translating() {
    let s = setup("idle", true, &[], &[]);
    s.manager.ensure_started().unwrap();
    s.clock.advance(Duration::from_secs(9 * 60 + 59));
    assert!(!s.manager.tick());
    assert!(s.manager.running());
    s.clock.advance(Duration::from_secs(1));
    assert!(s.manager.tick());
    assert!(!s.manager.running());
    let names = s.events.names();
    assert_eq!(
        names[names.len() - 2..],
        ["stopped Llama idle=true", "stopped Asr idle=true"]
    );
}

#[test]
fn a_running_session_keeps_the_sidecars() {
    let s = setup("session", true, &[], &[]);
    s.manager.ensure_started().unwrap();
    s.manager.begin_session();
    s.clock.advance(Duration::from_secs(30 * 60));
    assert!(!s.manager.tick(), "đang dịch thì không tắt");
    s.manager.end_session();
    s.clock.advance(Duration::from_secs(10 * 60));
    assert!(s.manager.tick(), "10 phút sau khi dừng phiên thì tắt");
}

fn translate_hello(s: &Setup) -> Outcome {
    let job = Job {
        text: "Hello there",
        src: Lang::En,
        tgt: Lang::Vi,
        context: None,
    };
    let mut mt = s.manager.mt();
    translate(&mut mt, &job, &MtConfig::default(), &mut |_| ControlFlow::Continue(()))
}

#[test]
fn a_llama_server_crash_restarts_it_and_the_translation_is_retried() {
    let s = setup("llama-crash", true, &[], &["crash_on:1", "ok"]);
    s.manager.ensure_started().unwrap();
    match translate_hello(&s) {
        Outcome::Done(t) => assert_eq!((t.text.as_str(), t.attempts), ("VI: Hello there", 2)),
        other => panic!("{other:?}"),
    }
    assert_eq!(s.clock.sleeps(), [1_000]);
}

#[test]
fn after_more_than_5_server_failures_only_the_source_is_shown() {
    // Lần 1: server chết giữa request dịch. Năm lần sau: server thoát ngay khi chạy. Lỗi thứ 6 trong 10 phút: bỏ cuộc.
    let mut plan = vec!["crash_on:1"];
    plan.extend(["exit_at_start:1"; 5]);
    let s = setup("llama-give-up", true, &[], &plan);
    let outcome = translate_hello(&s);
    assert!(matches!(outcome, Outcome::Unavailable(_)), "{outcome:?}");
    assert_eq!(s.clock.sleeps(), [1_000, 2_000, 5_000, 5_000, 5_000]);
    assert!(s.events.names().contains(&"gave-up Llama Failures".to_string()));
}

/// S8 của review: worker trả `Error` cho một đoạn mà vẫn sống thì chỉ bỏ đoạn đó, không khởi động lại, không gửi lại.
#[test]
fn a_worker_error_for_one_segment_drops_it_without_a_restart() {
    let s = setup("worker-error", true, &["error_on:1"], &[]);
    let err = s.manager.transcribe(request(1)).unwrap_err();
    assert!(
        matches!(&err, AsrFailure::Dropped(m) if m.contains("lỗi giả khi chép lời")),
        "{err:?}"
    );
    assert_eq!(s.manager.transcribe(request(2)).unwrap().segment_id, 2);
    let log = s.t.read("asr-events");
    assert_eq!(log.matches("start ").count(), 1, "{log}");
    assert_eq!(log.matches("transcribe 1 ").count(), 1, "không gửi lại: {log}");
    assert!(s.clock.sleeps().is_empty());
    assert!(!s.events.names().iter().any(|n| n.starts_with("restart")));
}

/// Q1 của review 02 lần 2: worker báo `OutOfMemory` lúc chép lời (thường là hết bộ nhớ GPU). Không bỏ đoạn như lỗi
/// thường: báo app (§9: đề xuất gói Nhẹ), tính là một lần lỗi trên GPU, khởi động lại rồi gửi lại đoạn; hai lần liên tiếp
/// thì chuyển CPU.
#[test]
fn out_of_memory_while_transcribing_counts_as_a_gpu_failure() {
    let s = setup(
        "oom-transcribe",
        true,
        &["error_on:1:OutOfMemory", "error_on:1:OutOfMemory", "ok"],
        &[],
    );
    let err = s.manager.transcribe(request(1)).unwrap_err();
    assert!(
        matches!(&err, AsrFailure::Dropped(m) if m.contains("gửi lại")),
        "{err:?}"
    );
    assert_eq!(s.manager.transcribe(request(2)).unwrap().segment_id, 2);
    // Lần hết bộ nhớ đầu chỉ khởi động lại trên GPU; lần thứ hai liên tiếp mới chuyển CPU (§9; Q-1 của review 02 lần 3).
    let names = s.events.names();
    assert_eq!(
        names,
        [
            "start Asr",
            "ready Asr gpu=true",
            "oom Asr",
            "restart Asr 1000",
            "start Asr",
            "ready Asr gpu=true",
            "oom Asr",
            "cpu Asr",
            "restart Asr 2000",
            "start Asr",
            "ready Asr gpu=false",
        ]
    );
    let log = s.t.read("asr-events");
    assert_eq!(log.matches("transcribe 1 ").count(), 2, "gửi lại một lần: {log}");
}

/// O1 của review 02 lần 2: `llama-server` hết bộ nhớ lúc nạp model (dòng lỗi của ggml ở stderr): báo app, rồi chạy lại.
#[test]
fn llama_server_out_of_memory_at_start_is_reported() {
    let s = setup("oom-llama", true, &["ok"], &["oom_at_start", "ok"]);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    let oom = names
        .iter()
        .position(|n| n == "oom Llama")
        .expect("có sự kiện hết bộ nhớ");
    assert!(names[oom + 1].starts_with("restart Llama"), "{names:?}");
    assert_eq!(names.last().unwrap(), "ready Llama gpu=true", "{names:?}");
}

/// S12 của review: model không nạp được khi đã chạy bằng CPU là model hỏng: bỏ cuộc ngay, không thử lại.
#[test]
fn a_model_that_does_not_load_on_the_cpu_gives_up_at_once() {
    let s = setup("model-cpu", false, &["load_error:ModelLoad", "ok"], &[]);
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Asr, GiveUpCause::ModelLoad));
    assert_eq!(s.events.names(), ["start Asr", "gave-up Asr ModelLoad"]);
    assert!(s.clock.sleeps().is_empty());
    // Bản GPU nạp lỗi thì thử bằng CPU một lần trước, rồi mới bỏ cuộc.
    let s = setup(
        "model-gpu",
        true,
        &["load_error:ModelLoad", "load_error:ModelLoad"],
        &[],
    );
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!(err.cause, GiveUpCause::ModelLoad);
    assert_eq!(
        s.events.names(),
        [
            "start Asr",
            "cpu Asr",
            "restart Asr 1000",
            "start Asr",
            "gave-up Asr ModelLoad"
        ]
    );
}

/// Không dò thấy GPU dùng được (Windows, `--probe`): `llama-server` cũng chạy bằng CPU.
#[test]
fn without_a_gpu_both_sidecars_run_on_the_cpu() {
    let s = setup("no-gpu", false, &[], &[]);
    s.manager.ensure_started().unwrap();
    assert_eq!(s.t.read("asr-events").lines().next(), Some("start use_gpu=false"));
    assert_eq!(s.t.read("llama-events"), "start ngl=0 extra=\n");
    assert!(s.events.names().contains(&"ready Llama gpu=false".to_string()));
    // Dịch trước khi `asr-worker` chạy lần nào (chỉ `llama-server` được khởi động): vẫn bằng CPU. Chỉ một tiến trình
    // chạy thì `running()` vẫn là `true`, và tắt khi rảnh vẫn tắt được nó (N6 của review 02 lần 3).
    let s = setup("no-gpu-mt-first", false, &[], &[]);
    assert!(matches!(translate_hello(&s), Outcome::Done(_)));
    assert_eq!(s.t.read("asr-events"), "");
    assert_eq!(s.t.read("llama-events").lines().next(), Some("start ngl=0 extra="));
    assert!(s.manager.running());
    s.clock.advance(Duration::from_secs(10 * 60));
    assert!(s.manager.tick());
    assert!(!s.manager.running());
}

/// `asr-worker` chuyển sang CPU vì GPU lỗi: `llama-server` chạy sau đó cũng bằng CPU (§9).
#[test]
fn llama_server_follows_the_worker_to_the_cpu() {
    let s = setup("follow-cpu", true, &["exit_at_start:135", "ok"], &[]);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    assert_eq!(
        names[names.len() - 3..],
        ["cpu Llama", "start Llama", "ready Llama gpu=false"]
    );
    assert_eq!(s.t.read("llama-events"), "start ngl=0 extra=\n");
}

/// App kiểm binary (SHA-256) trước mọi lần chạy, kể cả lần khởi động lại bên trong giám sát (QĐ17).
#[test]
fn every_start_is_checked_first() {
    let s = setup("checked", true, &["crash_on:1", "ok"], &["crash_on:1", "ok"]);
    s.manager.ensure_started().unwrap();
    s.manager.transcribe(request(1)).unwrap();
    assert!(matches!(translate_hello(&s), Outcome::Done(_)));
    assert_eq!(s.events.checked(), [Which::Asr, Which::Llama, Which::Asr, Which::Llama]);
}

/// Binary không qua bước kiểm thì không bao giờ được chạy: bỏ cuộc ngay với `Tampered`.
#[test]
fn a_binary_that_fails_the_check_is_never_started() {
    let s = setup("tampered", true, &["crash_on:1", "ok"], &[]);
    s.manager.ensure_started().unwrap();
    *s.events.reject.lock().unwrap() = Some(Which::Asr);
    let err = s.manager.transcribe(request(1)).unwrap_err();
    assert!(
        matches!(&err, AsrFailure::Unavailable(m) if m.contains("SHA-256")),
        "{err:?}"
    );
    assert_eq!(
        s.t.read("asr-events").matches("start ").count(),
        1,
        "không chạy lại binary bị sửa"
    );
    assert!(s.events.names().contains(&"gave-up Asr Tampered".to_string()));
    let s = setup("tampered-llama", true, &[], &[]);
    *s.events.reject.lock().unwrap() = Some(Which::Llama);
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Llama, GiveUpCause::Tampered));
    assert_eq!(s.t.read("llama-events"), "");
}

/// Lần đầu chạy, quá thời gian chờ dài không bị tính là một lần lỗi và không chuyển sang CPU (§6.5).
#[test]
fn a_slow_first_start_is_not_counted_as_a_failure() {
    let s = setup_spec(
        "first-slow",
        true,
        &["load_delay_ms:3000", "ok"],
        &["health_delay_ms:3000", "ok"],
        |spec| {
            spec.asr.first_run = true;
            spec.llama.first_run = true;
            spec.supervisor.first_run_ready_timeout_ms = 300;
        },
    );
    s.manager.ensure_started().unwrap();
    let restarts: Vec<(Which, usize)> = s
        .events
        .events()
        .iter()
        .filter_map(|e| match e {
            SidecarEvent::Restarting { which, failures, .. } => Some((*which, *failures)),
            _ => None,
        })
        .collect();
    assert_eq!(restarts, [(Which::Asr, 0), (Which::Llama, 0)]);
    let names = s.events.names();
    assert!(!names.iter().any(|n| n.starts_with("cpu")), "{names:?}");
    assert!(names.contains(&"ready Asr gpu=true".to_string()));
    assert_eq!(
        s.t.read("llama-events"),
        "start ngl=auto extra=\nstart ngl=auto extra=\n"
    );
}

/// Sau khi app thoát, một request tới muộn không chạy lại tiến trình phụ nào.
#[test]
fn after_shutdown_a_late_request_starts_nothing() {
    let s = setup("late", true, &[], &[]);
    s.manager.ensure_started().unwrap();
    s.manager.stop(false);
    assert!(!s.manager.running());
    let err = s.manager.transcribe(request(1)).unwrap_err();
    assert!(matches!(err, AsrFailure::Unavailable(_)), "{err:?}");
    assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Closing);
    assert!(matches!(translate_hello(&s), Outcome::Unavailable(_)));
    assert_eq!(s.t.read("asr-events").matches("start ").count(), 1);
    assert_eq!(s.t.read("llama-events").matches("start ").count(), 1);
    // Không có lần khởi động nào sau khi thoát, kể cả lần bị kill ngay sau khi chạy (tiến trình giả có thể chưa kịp ghi
    // gì): giám sát báo `Starting` trước mỗi lần chạy.
    let names = s.events.names();
    assert_eq!(names.iter().filter(|n| n.starts_with("start ")).count(), 2, "{names:?}");
}

/// Chờ tới khi file sự kiện của tiến trình phụ giả có `needle`, tối đa 10 giây.
fn wait_for(s: &Setup, file: &str, needle: &str) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !s.t.read(file).contains(needle) {
        assert!(Instant::now() < deadline, "không thấy {needle:?} trong {file}");
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// App thoát khi worker đang treo giữa một đoạn: không phải chờ hết thời gian chờ của request.
#[test]
fn shutdown_does_not_wait_for_a_hung_request() {
    let s = setup_spec("hung", true, &["hang_on:1"], &[], |spec| {
        spec.asr_config.timeout_ms = 120_000;
    });
    s.manager.ensure_started().unwrap();
    let manager = s.manager.clone();
    let busy = std::thread::spawn(move || manager.transcribe(request(1)));
    wait_for(&s, "asr-events", "transcribe 1 ");
    let started = Instant::now();
    s.manager.stop(false);
    let result = busy.join().unwrap();
    assert!(started.elapsed() < Duration::from_secs(5), "{:?}", started.elapsed());
    assert!(matches!(result, Err(AsrFailure::Unavailable(_))), "{result:?}");
    assert!(!s.manager.running());
}

/// App thoát khi worker đang nạp model (lần đầu mở app, `prewarm`): trả về ngay, không chờ `Ready`.
#[test]
fn shutdown_does_not_wait_for_a_model_that_is_loading() {
    let s = setup_spec("loading", true, &["load_delay_ms:60000"], &[], |spec| {
        spec.supervisor.ready_timeout_ms = 120_000;
    });
    let manager = s.manager.clone();
    let starting = std::thread::spawn(move || manager.ensure_started());
    wait_for(&s, "asr-events", "start use_gpu=true");
    let started = Instant::now();
    s.manager.shutdown();
    let result = starting.join().unwrap();
    assert!(started.elapsed() < Duration::from_secs(5), "{:?}", started.elapsed());
    assert_eq!(result.unwrap_err().cause, GiveUpCause::Closing);
    assert!(!s.manager.running());
    assert_eq!(
        s.t.read("llama-events"),
        "",
        "không chạy llama-server sau khi app thoát"
    );
}

/// Key của `llama-server` không lọt vào sự kiện của giám sát, kể cả khi server in key ra stderr rồi chết.
#[test]
fn the_api_key_never_reaches_sidecar_events() {
    let s = setup_spec("key-events", true, &[], &["leak_key crash_on:1", "leak_key"], |spec| {
        // Thư mục tạm của test là thư mục cha của `logs/`.
        let key_file = spec.llama.log.parent().unwrap().with_file_name("key");
        spec.llama
            .env
            .push(("FAKE_LLAMA_KEY_FILE".into(), key_file.display().to_string()));
    });
    s.manager.ensure_started().unwrap();
    assert!(matches!(translate_hello(&s), Outcome::Done(_)));
    let key = s.t.read("key");
    assert_eq!(key.len(), 32);
    let events = format!("{:?}", s.events.events());
    assert!(events.contains("restart") || events.contains("Restarting"), "{events}");
    assert!(!events.contains(&key), "{events}");
    let log = s.t.read("logs/llama-server.log");
    assert!(log.contains("LLAMA_API_KEY=<ẩn>") && !log.contains(&key), "{log}");
}

/// Windows: `asr-worker-cpu` chỉ chạy sau khi chuyển sang CPU. Nếu nó là binary mới (vừa cài), lần chạy đó cũng được chờ
/// như lần đầu, và giám sát hỏi app đúng một lần cho mỗi binary.
#[test]
fn a_new_cpu_binary_gets_its_own_first_run() {
    let s = setup_spec("cpu-first-run", true, &["exit_at_start:135", "ok"], &[], |spec| {
        // Hai binary khác nhau như trên Windows; bản CPU là một bản sao của worker giả.
        let cpu = spec.asr.log.parent().unwrap().with_file_name("asr-worker-cpu");
        std::fs::copy(FAKE_ASR, &cpu).unwrap();
        spec.asr.exe_cpu = cpu;
    });
    let cpu = s.t.path("asr-worker-cpu");
    s.events.new_binaries.lock().unwrap().push(cpu.clone());
    s.manager.ensure_started().unwrap();
    let starts: Vec<bool> = s
        .events
        .events()
        .iter()
        .filter_map(|e| match e {
            SidecarEvent::Starting {
                which: Which::Asr,
                first_run,
            } => Some(*first_run),
            _ => None,
        })
        .collect();
    assert_eq!(starts, [false, true], "bản GPU đã từng chạy, bản CPU thì chưa");
    let asked = s.events.asked.lock().unwrap().clone();
    assert_eq!(asked, [PathBuf::from(FAKE_ASR), cpu, PathBuf::from(FAKE_LLAMA)]);
}

/// Q3 của review 02 lần 2: app thoát giữa lần chờ trước khi khởi động lại (backoff 60 giây, đồng hồ thật): `shutdown`
/// ngắt lần chờ, `ensure_started` trả lỗi ngay, không chạy thêm tiến trình nào.
#[test]
fn shutdown_interrupts_the_backoff_before_a_restart() {
    let s = setup_clock(
        "wake",
        false,
        &["exit_at_start:1", "ok"],
        &[],
        |spec| spec.supervisor.backoff_ms = vec![60_000],
        Some(Arc::new(pipeline::supervisor::SystemClock::default())),
    );
    let manager = s.manager.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || tx.send(manager.ensure_started()).unwrap());
    let started = Instant::now();
    while !s.events.names().iter().any(|n| n.starts_with("restart Asr")) {
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "không thấy lần chờ: {:?}",
            s.events.names()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    s.manager.shutdown();
    let err = rx
        .recv_timeout(Duration::from_secs(5))
        .expect("shutdown ngắt được lần chờ")
        .unwrap_err();
    assert_eq!(err.cause, GiveUpCause::Closing);
    assert_eq!(s.t.read("asr-plan"), "ok", "không chạy lại worker sau khi app thoát");
}

/// Q3 của review 02 lần 2: `running()` không chờ khóa của tiến trình phụ, kể cả khi một luồng đang giữ khóa đó suốt lúc
/// nạp model (ở đây 5 giây).
#[test]
fn running_does_not_wait_for_a_model_that_is_loading() {
    let s = setup("running", false, &["load_delay_ms:5000"], &[]);
    let manager = s.manager.clone();
    std::thread::spawn(move || {
        let _ = manager.ensure_started();
    });
    let started = Instant::now();
    while !s.events.names().iter().any(|n| n == "start Asr") {
        assert!(started.elapsed() < Duration::from_secs(10));
        std::thread::sleep(Duration::from_millis(10));
    }
    let manager = s.manager.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || tx.send(manager.running()).unwrap());
    let running = rx.recv_timeout(Duration::from_secs(2)).expect("running() trả về ngay");
    assert!(!running, "chưa có tiến trình nào tới Ready");
    s.manager.shutdown();
}

/// Q-3 của review 02 lần 3: như `shutdown_interrupts_the_backoff_before_a_restart`, với `llama-server`.
#[test]
fn shutdown_interrupts_the_backoff_of_llama_server() {
    let s = setup_clock(
        "wake-llama",
        false,
        &["ok"],
        &["exit_at_start:1", "ok"],
        |spec| spec.supervisor.backoff_ms = vec![60_000],
        Some(Arc::new(pipeline::supervisor::SystemClock::default())),
    );
    let manager = s.manager.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || tx.send(manager.ensure_started()).unwrap());
    let started = Instant::now();
    while !s.events.names().iter().any(|n| n.starts_with("restart Llama")) {
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "không thấy lần chờ: {:?}",
            s.events.names()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    s.manager.shutdown();
    let err = rx
        .recv_timeout(Duration::from_secs(5))
        .expect("shutdown ngắt được lần chờ")
        .unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Llama, GiveUpCause::Closing));
    assert_eq!(
        s.t.read("llama-plan"),
        "ok",
        "không chạy lại llama-server sau khi app thoát"
    );
}

/// Lần đầu chạy quá giờ cũng chờ trước khi chạy lại; app thoát lúc đó thì trả về ngay (C6 của review 02 lần 3).
#[test]
fn shutdown_interrupts_the_wait_after_a_slow_first_start() {
    let s = setup_clock(
        "wake-first",
        false,
        &["load_delay_ms:3000", "ok"],
        &[],
        |spec| {
            spec.asr.first_run = true;
            spec.supervisor.first_run_ready_timeout_ms = 300;
            spec.supervisor.backoff_ms = vec![60_000];
        },
        Some(Arc::new(pipeline::supervisor::SystemClock::default())),
    );
    let manager = s.manager.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || tx.send(manager.ensure_started()).unwrap());
    let started = Instant::now();
    while !s.events.names().iter().any(|n| n.starts_with("restart Asr")) {
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "không thấy lần chờ: {:?}",
            s.events.names()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    s.manager.shutdown();
    let err = rx
        .recv_timeout(Duration::from_secs(5))
        .expect("shutdown ngắt được lần chờ")
        .unwrap_err();
    assert_eq!(err.cause, GiveUpCause::Closing);
}

/// Q4-2 của review 02 lần 4: bản GPU nạp model lỗi thì chuyển CPU, rồi `ModelLoad` trên CPU thì bỏ cuộc (model hỏng).
/// Người dùng tải lại model rồi bấm Bắt đầu (`allow_retry`): cả hai tiến trình phụ chạy lại từ đầu bằng GPU, không giữ CPU
/// của lần bỏ cuộc.
#[test]
fn a_retry_after_giving_up_starts_again_on_the_gpu() {
    let s = setup(
        "retry-gpu",
        true,
        &["load_error:ModelLoad", "load_error:ModelLoad", "ok"],
        &[],
    );
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Asr, GiveUpCause::ModelLoad));
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    let after = names.iter().position(|n| n == "gave-up Asr ModelLoad").unwrap() + 1;
    assert_eq!(
        names[after..],
        ["start Asr", "ready Asr gpu=true", "start Llama", "ready Llama gpu=true"]
    );
    assert_eq!(s.t.read("llama-events").lines().next(), Some("start ngl=auto extra="));
    // Máy không có GPU dùng được (GP4, GP5 của review 02 lần 5): thử lại vẫn bằng CPU, và không báo chuyển CPU.
    let s = setup("retry-no-gpu", false, &["load_error:ModelLoad", "ok"], &[]);
    assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::ModelLoad);
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    let asr = s.t.read("asr-events");
    let starts: Vec<&str> = asr.lines().filter(|l| l.starts_with("start")).collect();
    assert_eq!(starts, ["start use_gpu=false", "start use_gpu=false"]);
    assert_eq!(s.t.read("llama-events"), "start ngl=0 extra=\n");
    assert!(
        !s.events.names().iter().any(|n| n.starts_with("cpu ")),
        "{:?}",
        s.events.names()
    );
}

/// Q4-1 của review 02 lần 4: `llama-server` bỏ cuộc (hơn 5 lần lỗi), rồi người dùng bấm Bắt đầu: chạy lại được, và từ
/// quyết định ban đầu (GPU), dù trước đó đã sang `-ngl 0` vì lỗi liên tiếp.
#[test]
fn llama_server_is_retried_after_giving_up() {
    let s = setup("retry-llama", true, &["ok"], &["exit_at_start:1"; 6]);
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Llama, GiveUpCause::Failures));
    assert!(s.events.names().contains(&"cpu Llama".to_string()));
    std::fs::write(s.t.path("llama-plan"), "ok").unwrap();
    s.manager.begin_session();
    assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Failures);
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    assert_eq!(s.events.names().last().unwrap(), "ready Llama gpu=true");
    assert_eq!(s.t.read("llama-events").lines().last(), Some("start ngl=auto extra="));
}

/// Q4-1 của review 02 lần 4: binary bị sửa thì bỏ cuộc (`Tampered`); cài lại rồi bấm Bắt đầu thì SHA-256 được kiểm lại
/// (`before_spawn`) và tiến trình phụ chạy.
#[test]
fn a_tampered_sidecar_is_checked_again_on_retry() {
    for which in [Which::Asr, Which::Llama] {
        let s = setup(&format!("retry-tampered-{which:?}"), true, &[], &[]);
        *s.events.reject.lock().unwrap() = Some(which);
        let err = s.manager.ensure_started().unwrap_err();
        assert_eq!((err.which, err.cause), (which, GiveUpCause::Tampered));
        let checked = s.events.checked().len();
        assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Tampered);
        assert_eq!(s.events.checked().len(), checked, "chưa bấm thử lại thì không kiểm lại");
        // Bấm thử lại mà binary vẫn bị sửa: kiểm lại đúng một lần, rồi lại bỏ cuộc; cờ thử lại chỉ dùng một lần, không
        // thành vòng lặp (RL1, RL2 của review 02 lần 5).
        s.manager.allow_retry();
        assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Tampered);
        assert_eq!(s.events.checked().len(), checked + 1);
        assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Tampered);
        assert_eq!(s.events.checked().len(), checked + 1);
        *s.events.reject.lock().unwrap() = None;
        s.manager.allow_retry();
        s.manager.ensure_started().unwrap();
        assert_eq!(s.events.checked().len(), checked + 2 + usize::from(which == Which::Asr));
    }
}

/// Q5-1 của review 02 lần 5, kịch bản 1: `llama-server` tự lỗi 2 lần liên tiếp trên GPU thì giữ CPU của riêng nó, kể cả
/// khi `asr-worker` chạy lại bằng GPU; mỗi lần nó tới `Ready` đều báo `gpu=false`, để app giữ chỉ báo CPU.
#[test]
fn llama_server_keeps_its_own_cpu_fallback_across_restarts() {
    let s = setup(
        "llama-own-cpu",
        true,
        &["ok", "ok"],
        &["exit_at_start:1", "exit_at_start:1", "ok", "ok"],
    );
    s.manager.ensure_started().unwrap();
    s.manager.stop(true);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    let restart = names.iter().position(|n| n == "stopped Asr idle=true").unwrap() + 1;
    assert_eq!(
        names[restart..],
        [
            "start Asr",
            "ready Asr gpu=true",
            "start Llama",
            "ready Llama gpu=false"
        ]
    );
    assert_eq!(
        s.t.read("llama-events")
            .lines()
            .filter_map(|l| l.split_whitespace().nth(1))
            .collect::<Vec<_>>(),
        ["ngl=auto", "ngl=auto", "ngl=0", "ngl=0"]
    );
}

/// Q5-1 của review 02 lần 5, kịch bản 2: `llama-server` chạy CPU chỉ vì đi theo `asr-worker`. `asr-worker` bỏ cuộc trên
/// CPU, người dùng bấm thử lại, `asr-worker` về GPU: lần chạy kế tiếp của `llama-server` cũng về GPU.
#[test]
fn llama_server_follows_the_worker_back_to_the_gpu() {
    // `llama-server` còn lỗi hai lần trong lúc chạy CPU theo `asr-worker`: hai lần đó không tính là lỗi GPU của nó.
    let s = setup(
        "follow-back",
        true,
        &["exit_at_start:1", "ok"],
        &["exit_at_start:1", "exit_at_start:1", "ok"],
    );
    s.manager.ensure_started().unwrap();
    assert!(s.events.names().contains(&"cpu Llama".to_string()));
    assert_eq!(s.t.read("llama-events").lines().last(), Some("start ngl=0 extra="));
    s.manager.stop(true);
    std::fs::write(s.t.path("asr-plan"), ["exit_at_start:1"; 6].join("\n")).unwrap();
    assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Failures);
    std::fs::write(s.t.path("asr-plan"), "ok").unwrap();
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    assert_eq!(names[names.len() - 2..], ["start Llama", "ready Llama gpu=true"]);
    assert_eq!(s.t.read("llama-events").lines().last(), Some("start ngl=auto extra="));
}

/// GP6 của review 02 lần 5: đã chuyển CPU vì lỗi mà chưa bỏ cuộc thì bấm Bắt đầu không đưa về GPU.
#[test]
fn a_retry_without_giving_up_keeps_the_cpu() {
    let s = setup("retry-keeps-cpu", true, &["crash_on:1", "crash_on:1", "ok"], &[]);
    assert!(matches!(s.manager.transcribe(request(1)), Err(AsrFailure::Dropped(_))));
    assert!(s.events.names().contains(&"cpu Asr".to_string()));
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    let cpu = names.iter().position(|n| n == "cpu Asr").unwrap();
    assert!(names[cpu..].contains(&"ready Asr gpu=false".to_string()), "{names:?}");
    assert!(
        !names[cpu..].contains(&"ready Asr gpu=true".to_string()),
        "vẫn CPU: {names:?}"
    );
}
