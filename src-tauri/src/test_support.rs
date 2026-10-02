//! Dụng cụ cho các test chạy app bằng `MockRuntime`: đúng `tauri.conf.json`, `capabilities/` và app
//! manifest của `build.rs`, nhưng không mở cửa sổ thật. Phiên dịch chạy đúng `session.rs` và `pipeline::engine`, với
//! phần bên ngoài giả (`FakeDeps`): không chạy tiến trình phụ, không thu âm thật.

use std::ops::ControlFlow;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime};

use asr_protocol::{TranscribeRequest, TranscribeResult};
use pipeline::engine::{EnergyVad, FrameSource, VadFactory};
use pipeline::llama::{ChatRequest, StreamEnd};
use pipeline::supervisor::{Asr, AsrFailure};
use pipeline::translate::{Mt, MtError};
use serde_json::Value;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

use crate::capture::OnEvent;
use crate::commands;
use crate::db::DataStore;
use crate::errors::{self, CommandError};
use crate::files::{FilePicker, FileType, Picker};
use crate::glossary::ActiveGlossary;
use crate::login_item::{AgentStatus, LoginItem, LoginItems};
use crate::overlay::{OverlaySurface, Surface};
use crate::pro::{Entitlement, ProGate};
use crate::security::keystore::Keystore;
use crate::session::{Session, SessionDeps};
use crate::settings::migrate::FileMeta;
use crate::settings::persist::{SettingsFile, Writer};
use crate::settings::{AudioSource, Settings, UiLanguage};
use crate::state::AppState;
use crate::system::{System, SystemOpener};
use crate::transcript::store::TranscriptStore;

/// Bản giả của thanh phụ đề: ghi lại từng lần gọi, dạng `show`, `hide`, `click_through on`.
#[derive(Clone, Default)]
pub struct FakeSurface(Arc<Mutex<Vec<String>>>);

impl Surface for FakeSurface {
    fn set_visible(&self, visible: bool) -> tauri::Result<()> {
        self.0
            .lock()
            .unwrap()
            .push(if visible { "show" } else { "hide" }.into());
        Ok(())
    }

    fn set_click_through(&self, on: bool) -> tauri::Result<()> {
        self.0
            .lock()
            .unwrap()
            .push(if on { "click_through on" } else { "click_through off" }.into());
        Ok(())
    }
}

/// Bản giả của `SystemOpener`: ghi lại từng lần gọi, không mở gì (QĐ28). Mọi test chạy app giả đều dùng
/// bản này, nên kể cả khi ACL lỡ cấp thừa, lệnh tới handler cũng không mở Finder hay System Settings.
#[derive(Clone, Default)]
pub struct FakeSystem(Arc<Mutex<Vec<String>>>);

impl FakeSystem {
    fn push(&self, call: String) -> Result<(), String> {
        self.0.lock().unwrap().push(call);
        Ok(())
    }
}

impl SystemOpener for FakeSystem {
    fn open_log_dir(&self) -> Result<(), String> {
        self.push("open_log_dir".into())
    }
    fn open_taskbar_settings(&self) -> Result<(), String> {
        self.push("open_taskbar_settings".into())
    }
    fn open_login_items_settings(&self) -> Result<(), String> {
        self.push("open_login_items_settings".into())
    }
    fn open_external_url(&self, url: &str) -> Result<(), String> {
        self.push(format!("open_external_url {url}"))
    }
    fn open_audio_permission_settings(&self) -> Result<(), String> {
        self.push("open_audio_permission_settings".into())
    }
}

/// Trạng thái của bản giả `FakeLoginItem`.
#[derive(Default)]
pub struct FakeLogin {
    pub registered: bool,
    /// Windows: `disable()` không xóa được mục ở `HKLM` (không có quyền admin), nên vẫn còn bật.
    pub stuck_on: bool,
    pub status: Option<AgentStatus>,
}

/// Bản giả của `LoginItem`: không đụng LaunchAgent, Login Items hay registry thật.
#[derive(Clone, Default)]
pub struct FakeLoginItem(pub Arc<Mutex<FakeLogin>>);

impl LoginItem for FakeLoginItem {
    fn enable(&self) -> Result<(), String> {
        self.0.lock().unwrap().registered = true;
        Ok(())
    }
    fn disable(&self) -> Result<(), String> {
        let mut state = self.0.lock().unwrap();
        state.registered = state.stuck_on;
        Ok(())
    }
    fn is_registered(&self) -> Result<bool, String> {
        Ok(self.0.lock().unwrap().registered)
    }
    fn system_status(&self) -> Option<AgentStatus> {
        self.0.lock().unwrap().status
    }
}

/// Bản giả của `ProGate`: test bật tắt Pro bằng [`set_pro`]. App giả mặc định là Pro.
#[derive(Clone)]
pub struct FakePro(Arc<AtomicBool>);

impl ProGate for FakePro {
    fn is_pro(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// Bản giả của `FilePicker`: "lưu" vào thư mục tạm của app giả với tên gợi ý, "mở" file test đã đặt; hoặc như người
/// dùng bấm Hủy.
#[derive(Clone, Default)]
pub struct FakePicker {
    pub dir: Arc<Mutex<PathBuf>>,
    /// File trả về khi hỏi mở.
    pub to_open: Arc<Mutex<Option<PathBuf>>>,
    /// Người dùng bấm Hủy.
    pub cancel: Arc<AtomicBool>,
}

impl FilePicker for FakePicker {
    fn save(&self, file_name: &str, _kind: FileType) -> Option<PathBuf> {
        if self.cancel.load(Ordering::SeqCst) {
            return None;
        }
        let dir = self.dir.lock().unwrap().clone();
        std::fs::create_dir_all(&dir).unwrap();
        Some(dir.join(file_name))
    }

    fn open(&self, _kind: FileType) -> Option<PathBuf> {
        if self.cancel.load(Ordering::SeqCst) {
            return None;
        }
        self.to_open.lock().unwrap().clone()
    }
}

/// Các mục của một lần ghi file cài đặt.
type Entries = Vec<(String, Value)>;

/// Bản giả của `SettingsFile`: giữ lại các lần ghi, không đụng thư mục cài đặt thật.
#[derive(Clone, Default)]
pub struct FakeSettingsFile(Arc<Mutex<Vec<Entries>>>);

impl SettingsFile for FakeSettingsFile {
    fn write(&self, entries: Vec<(String, Value)>) -> Result<(), String> {
        self.0.lock().unwrap().push(entries);
        Ok(())
    }
}

/// Âm thanh giả của một phiên.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum FakeAudio {
    /// Chỉ im lặng: phiên chạy nhưng không có phụ đề.
    #[default]
    Silence,
    /// 1 giây tiếng, 1 giây im lặng, lặp lại; phát nhanh gấp 10 lần thời gian thật.
    Tone,
}

/// Cổng chặn `prepare` (như nạp model lâu): `prepare` chờ tới khi cổng mở, hoặc app thoát.
#[derive(Debug, Default)]
pub struct PrepareGate {
    /// (cổng đã mở, app đang thoát)
    state: Mutex<(bool, bool)>,
    changed: Condvar,
    /// Số lần `prepare` đang chờ ở cổng.
    waiting: Mutex<usize>,
}

impl PrepareGate {
    pub fn open(&self) {
        self.state.lock().unwrap().0 = true;
        self.changed.notify_all();
    }

    pub fn waiting(&self) -> usize {
        *self.waiting.lock().unwrap()
    }

    fn close_for_shutdown(&self) {
        self.state.lock().unwrap().1 = true;
        self.changed.notify_all();
    }

    /// `Ok` khi cổng mở; `Err` khi app thoát trong lúc chờ.
    fn pass(&self) -> Result<(), CommandError> {
        *self.waiting.lock().unwrap() += 1;
        let state = self.state.lock().unwrap();
        let state = self
            .changed
            .wait_while(state, |(open, closing)| !*open && !*closing)
            .unwrap();
        let closing = state.1;
        drop(state);
        *self.waiting.lock().unwrap() -= 1;
        if closing {
            return Err(CommandError::new(errors::SIDECAR_FAILED, None, "app đang thoát"));
        }
        Ok(())
    }
}

/// Phần bên ngoài giả của phiên dịch.
#[derive(Clone, Default)]
pub struct FakeDeps {
    pub audio: FakeAudio,
    /// `prepare` trả lỗi có mã này (ví dụ thiếu model).
    pub prepare_error: Option<&'static str>,
    /// `prepare` chờ ở cổng này (Q6 của review 02c).
    pub prepare_gate: Option<Arc<PrepareGate>>,
    /// Hạn mức đã hết: `check_quota` từ chối (chỗ nối của kế hoạch 06).
    pub quota_exhausted: bool,
    /// Số lần `prepare` được gọi.
    pub prepares: Arc<Mutex<usize>>,
    /// Thứ tự gọi `allow_retry` và `prepare` (R3-1 của review 02 lần 3).
    pub calls: Arc<Mutex<Vec<&'static str>>>,
    /// Nguồn âm thanh báo lỗi có mã này ngay khi mở (ví dụ chưa cấp quyền).
    pub capture_error: Option<&'static str>,
    /// `asr-worker` không dùng được nữa (bỏ cuộc sau nhiều lần lỗi).
    pub asr_unavailable: bool,
    /// Giá trị `include_self` của từng lần mở nguồn âm thanh.
    pub captures: Arc<Mutex<Vec<bool>>>,
    /// Nơi nhận việc của nguồn âm thanh của từng phiên, theo thứ tự: test gọi để giả lỗi tới muộn.
    pub capture_events: Arc<Mutex<Vec<OnEvent>>>,
    /// Số lần `shutdown` và `kill_all` được gọi.
    pub shutdowns: Arc<Mutex<Vec<&'static str>>>,
    /// Prompt của từng request dịch, kể cả lần làm nóng.
    pub prompts: Arc<Mutex<Vec<String>>>,
}

struct FakeCapture {
    audio: FakeAudio,
    pos: usize,
}

impl FrameSource for FakeCapture {
    fn read(&mut self, out: &mut Vec<f32>, _timeout: Duration) -> anyhow::Result<bool> {
        // 100 ms âm thanh mỗi 10 ms.
        std::thread::sleep(Duration::from_millis(10));
        for _ in 0..1_600 {
            let speaking = self.audio == FakeAudio::Tone && (self.pos / 16_000).is_multiple_of(2);
            let t = self.pos as f32 / 16_000.0;
            out.push(if speaking {
                0.3 * (2.0 * std::f32::consts::PI * 220.0 * t).sin()
            } else {
                0.0
            });
            self.pos += 1;
        }
        Ok(true)
    }
}

struct FakeAsr {
    unavailable: bool,
}

impl Asr for FakeAsr {
    fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
        if self.unavailable {
            return Err(AsrFailure::Unavailable("asr-worker giả bỏ cuộc".into()));
        }
        Ok(TranscribeResult {
            segment_id: req.segment_id,
            lang: "en".into(),
            lang_prob: 0.99,
            text: "Hello everyone.".into(),
            tokens: vec![15947, 1518, 13],
            no_speech_prob: 0.01,
            lid_ms: 1.0,
            asr_ms: 5.0,
            avg_logprob: -0.2,
        })
    }
}

struct FakeMt {
    prompts: Arc<Mutex<Vec<String>>>,
}

impl Mt for FakeMt {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
        Ok(text.split_whitespace().count())
    }

    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError> {
        self.prompts.lock().unwrap().push(req.prompt.to_string());
        let chunks = ["Xin", " chào", " mọi", " người."];
        for c in chunks {
            if on_delta(c).is_break() {
                break;
            }
        }
        Ok(StreamEnd {
            text: chunks.concat(),
            first_token_ms: 1.0,
            total_ms: 2.0,
            finish_reason: Some("stop".into()),
            completion_tokens: Some(chunks.len()),
            chunks: chunks.len(),
            cancelled: false,
        })
    }
}

impl SessionDeps for FakeDeps {
    fn check_quota(&self) -> Result<(), CommandError> {
        if self.quota_exhausted {
            return Err(CommandError::new(errors::QUOTA_EXHAUSTED, None, "hạn mức còn 0"));
        }
        Ok(())
    }

    fn allow_retry(&self) {
        self.calls.lock().unwrap().push("allow_retry");
    }

    fn prepare(&self, _settings: &Settings) -> Result<(), CommandError> {
        *self.prepares.lock().unwrap() += 1;
        self.calls.lock().unwrap().push("prepare");
        if let Some(gate) = &self.prepare_gate {
            gate.pass()?;
        }
        match self.prepare_error {
            Some(code) => Err(CommandError::new(code, None, "lỗi giả")),
            None => Ok(()),
        }
    }

    fn asr(&self) -> Box<dyn Asr> {
        Box::new(FakeAsr {
            unavailable: self.asr_unavailable,
        })
    }

    fn mt(&self) -> Box<dyn Mt> {
        Box::new(FakeMt {
            prompts: self.prompts.clone(),
        })
    }

    fn vad(&self) -> VadFactory {
        Box::new(|| Ok(Box::new(EnergyVad { threshold_rms: 0.05 }) as _))
    }

    fn capture(&self, _source: &AudioSource, include_self: bool, on_event: OnEvent) -> Box<dyn FrameSource> {
        self.captures.lock().unwrap().push(include_self);
        if let Some(code) = self.capture_error {
            on_event(crate::capture::CaptureEvent::Failed {
                code,
                message: "lỗi giả".into(),
            });
        }
        self.capture_events.lock().unwrap().push(on_event);
        Box::new(FakeCapture {
            audio: self.audio,
            pos: 0,
        })
    }

    fn shutdown(&self) {
        self.shutdowns.lock().unwrap().push("shutdown");
        if let Some(gate) = &self.prepare_gate {
            gate.close_for_shutdown();
        }
    }

    fn kill_all(&self) {
        self.shutdowns.lock().unwrap().push("kill_all");
    }
}

pub fn mock_app() -> tauri::App<MockRuntime> {
    mock_app_with(FakeDeps::default())
}

pub fn mock_app_with(deps: FakeDeps) -> tauri::App<MockRuntime> {
    let builder = mock_builder();
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    let surface = FakeSurface::default();
    let system = FakeSystem::default();
    let login = FakeLoginItem::default();
    let file = FakeSettingsFile::default();
    let pro = FakePro(Arc::new(AtomicBool::new(true)));
    // Mỗi app giả một thư mục DB riêng trong thư mục tạm, kho khóa trong bộ nhớ.
    static APPS: AtomicUsize = AtomicUsize::new(0);
    static CLEAN: std::sync::Once = std::sync::Once::new();
    CLEAN.call_once(|| {
        remove_stale_app_dirs(&std::env::temp_dir(), SystemTime::now());
    });
    let data_dir = std::env::temp_dir().join(format!(
        "{APP_DIR_PREFIX}{}-{}",
        std::process::id(),
        APPS.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = std::fs::remove_dir_all(&data_dir);
    let picker = FakePicker::default();
    *picker.dir.lock().unwrap() = data_dir.join("exports");
    let app = builder
        .manage(AppState::new(
            Settings::defaults(UiLanguage::Vi),
            FileMeta::current(),
            false,
        ))
        .manage(OverlaySurface(Box::new(surface.clone())))
        .manage(surface)
        .manage(System(Box::new(system.clone())))
        .manage(system)
        .manage(LoginItems(Box::new(login.clone())))
        .manage(login)
        .manage(Writer(Box::new(file.clone())))
        .manage(file)
        .manage(Entitlement(Box::new(pro.clone())))
        .manage(DataStore::new(
            data_dir,
            Ok(Keystore::mock("com.aitranslator.desktop.test")),
        ))
        .manage(ActiveGlossary::default())
        .manage(TranscriptStore::default())
        .manage(crate::debug::DebugLog::default())
        .manage(Picker(Box::new(picker.clone())))
        .manage(picker)
        .manage(pro)
        .manage(Session::new(Arc::new(deps)))
        .invoke_handler(commands::handler())
        .build(tauri::generate_context!(test = true))
        .expect("dựng được app giả");
    crate::pro::refresh(app.handle());
    app
}

const APP_DIR_PREFIX: &str = "mt-app-data-";

/// Thư mục tạm của app giả (DB, file xuất) không xóa được lúc app giả bị hủy: state của app giả không bao giờ được drop
/// (app giữ `AppHandle` trong chính state của nó), và tiến trình test thoát mà không chạy `Drop` của biến `static`. Nên lần
/// đầu dựng app giả trong một tiến trình test thì xóa thư mục của những lần chạy trước, cũ hơn một giờ tính tới `now` (để
/// không đụng thư mục của một lần `cargo test` khác đang chạy cùng lúc). Trả số thư mục đã xóa (N8 của review 03).
pub fn remove_stale_app_dirs(parent: &std::path::Path, now: SystemTime) -> usize {
    let Ok(entries) = std::fs::read_dir(parent) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|age| age >= Duration::from_secs(3600));
        if old
            && entry.file_name().to_string_lossy().starts_with(APP_DIR_PREFIX)
            && std::fs::remove_dir_all(entry.path()).is_ok()
        {
            removed += 1;
        }
    }
    removed
}

/// Đổi gói của app giả: `true` là Pro, `false` là Free.
pub fn set_pro(app: &tauri::App<MockRuntime>, pro: bool) {
    app.state::<FakePro>().0.store(pro, Ordering::SeqCst);
    crate::pro::refresh(app.handle());
}

/// Giá trị của `key` ở lần ghi file cài đặt gần nhất có khóa đó.
pub fn last_saved(app: &tauri::App<MockRuntime>, key: &str) -> Option<Value> {
    let writes = app.state::<FakeSettingsFile>().0.lock().unwrap().clone();
    writes
        .iter()
        .rev()
        .find_map(|entries| entries.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone()))
}

/// Đổi trạng thái của bản giả `FakeLoginItem` trong app giả.
pub fn login_state(app: &tauri::App<MockRuntime>, change: impl FnOnce(&mut FakeLogin)) {
    change(&mut app.state::<FakeLoginItem>().0.lock().unwrap());
}

/// Các lần gọi tới `SystemOpener` từ lúc dựng app giả.
pub fn system_calls(app: &tauri::App<MockRuntime>) -> Vec<String> {
    app.state::<FakeSystem>().0.lock().unwrap().clone()
}

/// Các lần gọi tới thanh phụ đề từ lúc dựng app giả.
pub fn overlay_calls(app: &tauri::App<MockRuntime>) -> Vec<String> {
    app.state::<FakeSurface>().0.lock().unwrap().clone()
}

pub fn window(app: &tauri::App<MockRuntime>, label: &str) -> WebviewWindow<MockRuntime> {
    app.get_webview_window(label).unwrap_or_else(|| {
        WebviewWindowBuilder::new(app, label, Default::default())
            .build()
            .expect("tạo được cửa sổ giả")
    })
}

/// Gọi một lệnh như giao diện gọi `invoke(cmd, args)` từ cửa sổ `window`.
pub fn invoke(window: &WebviewWindow<MockRuntime>, cmd: &str, args: Value) -> Result<Value, String> {
    let request = InvokeRequest {
        cmd: cmd.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body: InvokeBody::Json(args),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(window, request)
        .map(|body| body.deserialize::<Value>().unwrap())
        .map_err(|e| e.to_string())
}

/// Lệnh bị ACL chặn (chưa tới handler).
pub fn denied(result: &Result<Value, String>) -> bool {
    matches!(result, Err(message) if message.contains("not allowed"))
}
