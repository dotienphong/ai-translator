//! Dụng cụ cho các test chạy app bằng `MockRuntime`: đúng `tauri.conf.json`, `capabilities/` và app
//! manifest của `build.rs`, nhưng không mở cửa sổ thật. Phiên dịch chạy đúng `session.rs` và `pipeline::engine`, với
//! phần bên ngoài giả (`FakeDeps`): không chạy tiến trình phụ, không thu âm thật.

use std::collections::VecDeque;
use std::ops::ControlFlow;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
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

use crate::capture::{CapturePlan, OnEvent};
use crate::commands;
use crate::db::DataStore;
use crate::errors::{self, CommandError};
use crate::files::{FilePicker, FileType, Picker};
use crate::glossary::ActiveGlossary;
use crate::login_item::{AgentStatus, LoginItem, LoginItems};
use crate::models::download::Retry;
use crate::models::machine::Machine;
use crate::models::manifest::Os;
use crate::models::service::{Config as ModelsConfig, ModelService};
use crate::overlay::placement::{Edge, Frame, Screen};
use crate::overlay::{OverlaySurface, Surface};
use crate::pro::{Entitlement, ProGate};
use crate::security::keystore::Keystore;
use crate::session::{Session, SessionDeps};
use crate::settings::migrate::FileMeta;
use crate::settings::persist::{SettingsFile, Writer};
use crate::settings::{AudioSource, Settings, UiLanguage};
use crate::state::AppState;
use crate::support::api::{ApiError, Batch, Opening, Sender, Started, SupportApi, SupportMessage};
use crate::system::{System, SystemOpener};
use crate::transcript::store::TranscriptStore;
use audio_capture::MicPermission;

/// Bản giả của thanh phụ đề: ghi lại từng lần gọi, dạng `show`, `hide`, `click_through on`, `frame 1 2 300x80`,
/// `system resize west`. Khung cửa sổ (pixel), màn hình và con trỏ (điểm logic, như `Surface::cursor`) do test đặt; mặc
/// định chưa có khung (như chưa có cửa sổ).
#[derive(Clone, Default)]
pub struct FakeSurface {
    calls: Arc<Mutex<Vec<String>>>,
    pub frame: Arc<Mutex<Option<(Frame, Screen)>>>,
    pub cursor: Arc<Mutex<(f64, f64)>>,
    /// Hệ điều hành tự đổi kích thước (như Windows); mặc định không (như macOS).
    pub system_resize: Arc<AtomicBool>,
}

impl FakeSurface {
    fn push(&self, call: String) {
        self.calls.lock().unwrap().push(call);
    }
}

impl Surface for FakeSurface {
    fn set_visible(&self, visible: bool) -> tauri::Result<()> {
        self.push(if visible { "show" } else { "hide" }.into());
        Ok(())
    }

    fn set_click_through(&self, on: bool) -> tauri::Result<()> {
        self.push(if on { "click_through on" } else { "click_through off" }.into());
        Ok(())
    }

    fn frame(&self) -> Option<(Frame, Screen)> {
        self.frame.lock().unwrap().clone()
    }

    fn set_frame(&self, frame: Frame) -> tauri::Result<()> {
        self.push(format!(
            "frame {} {} {}x{}",
            frame.x, frame.y, frame.width, frame.height
        ));
        if let Some((current, _)) = self.frame.lock().unwrap().as_mut() {
            *current = frame;
        }
        Ok(())
    }

    fn cursor(&self) -> Option<(f64, f64)> {
        Some(*self.cursor.lock().unwrap())
    }

    fn system_resize(&self, edge: Edge) -> bool {
        if !self.system_resize.load(Ordering::SeqCst) {
            return false;
        }
        self.push(format!("system resize {}", edge.direction()));
        true
    }
}

/// Bản giả của `SystemOpener`: ghi lại từng lần gọi, không mở gì (QĐ28). Mọi test chạy app giả đều dùng
/// bản này, nên kể cả khi ACL lỡ cấp thừa, lệnh tới handler cũng không mở Finder hay System Settings.
/// Trường thứ hai: bật thì mở link ngoài báo lỗi giống `open` của macOS (lỗi chứa nguyên URL).
#[derive(Clone, Default)]
pub struct FakeSystem(Arc<Mutex<Vec<String>>>, Arc<Mutex<bool>>);

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
        self.push(format!("open_external_url {url}"))?;
        if *self.1.lock().unwrap() {
            return Err(format!(
                "Launcher \"/usr/bin/open\" \"--\" \"{url}\" failed with exit status: 1"
            ));
        }
        Ok(())
    }
    fn open_audio_permission_settings(&self) -> Result<(), String> {
        self.push("open_audio_permission_settings".into())
    }
    fn open_accessibility_settings(&self) -> Result<(), String> {
        self.push("open_accessibility_settings".into())
    }
    fn open_mic_settings(&self) -> Result<(), String> {
        self.push("open_mic_settings".into())
    }
}

/// Bản giả của `compose::Native`: ghi lại từng lần gọi, dạng `show`, `hide`, `height 240`, `request_trust`,
/// `reset_stale_trust`, `clipboard <chữ>`, `paste`. Có quyền Trợ năng và dán được, trừ khi test đổi `trusted`, `paste_ok`.
#[derive(Clone)]
pub struct FakeNative {
    pub calls: Arc<Mutex<Vec<String>>>,
    pub visible: Arc<AtomicBool>,
    pub trusted: Arc<AtomicBool>,
    pub paste_ok: Arc<AtomicBool>,
}

impl Default for FakeNative {
    fn default() -> Self {
        Self {
            calls: Arc::default(),
            visible: Arc::default(),
            trusted: Arc::new(AtomicBool::new(true)),
            paste_ok: Arc::new(AtomicBool::new(true)),
        }
    }
}

impl FakeNative {
    fn push(&self, call: String) {
        self.calls.lock().unwrap().push(call);
    }
}

impl crate::compose::Native for FakeNative {
    fn show(&self) -> tauri::Result<()> {
        self.visible.store(true, Ordering::SeqCst);
        self.push("show".into());
        Ok(())
    }
    fn hide(&self) -> tauri::Result<()> {
        self.visible.store(false, Ordering::SeqCst);
        self.push("hide".into());
        Ok(())
    }
    fn visible(&self) -> bool {
        self.visible.load(Ordering::SeqCst)
    }
    fn set_height(&self, height: f64) -> tauri::Result<()> {
        self.push(format!("height {height}"));
        Ok(())
    }
    fn trusted(&self) -> bool {
        self.trusted.load(Ordering::SeqCst)
    }
    fn request_trust(&self) {
        self.push("request_trust".into());
    }
    fn reset_stale_trust(&self) {
        self.push("reset_stale_trust".into());
    }
    fn set_clipboard(&self, text: &str) -> Result<(), String> {
        self.push(format!("clipboard {text}"));
        Ok(())
    }
    fn paste(&self) -> bool {
        self.push("paste".into());
        self.paste_ok.load(Ordering::SeqCst)
    }
}

/// Các lần gọi tới ô soạn giả của app giả.
pub fn compose_calls(app: &tauri::App<MockRuntime>) -> Vec<String> {
    app.state::<FakeNative>().calls.lock().unwrap().clone()
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
    /// 3 giây tiếng, 1 giây im lặng, lặp lại; phát nhanh gấp 10 lần thời gian thật. Đoạn đủ dài cho lần chép từng phần
    /// theo nhịp (`streaming.min_partial_speech_ms` 1000, spec 2026-10-10 §4.1), với mọi ngưỡng ngắt câu của chế độ này.
    LongTone,
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
    /// Thứ tự gọi `allow_retry`, `prepare` (R3-1 của review 02 lần 3) và `streaming_supported` (QĐ1 của kế hoạch 03).
    pub calls: Arc<Mutex<Vec<&'static str>>>,
    /// Nguồn âm thanh báo lỗi có mã này ngay khi mở (ví dụ chưa cấp quyền).
    pub capture_error: Option<&'static str>,
    /// `asr-worker` không dùng được nữa (bỏ cuộc sau nhiều lần lỗi).
    pub asr_unavailable: bool,
    /// Giá trị `include_self` của từng lần mở nguồn âm thanh.
    pub captures: Arc<Mutex<Vec<bool>>>,
    /// Nguồn âm thanh của từng lần mở.
    pub capture_sources: Arc<Mutex<Vec<AudioSource>>>,
    /// Plan của từng lần mở nguồn, theo thứ tự.
    pub capture_plans: Arc<Mutex<Vec<CapturePlan>>>,
    /// Quyền micro mà `mic_permission` trả (`None`: `Granted`; `MicPermission` không có `Default`);
    /// `request_mic_permission` cũng trả giá trị này và đếm số lần gọi.
    pub mic_permission: Arc<Mutex<Option<MicPermission>>>,
    pub mic_requests: Arc<Mutex<usize>>,
    /// Nơi nhận việc của nguồn âm thanh của từng phiên, theo thứ tự: test gọi để giả lỗi tới muộn.
    pub capture_events: Arc<Mutex<Vec<OnEvent>>>,
    /// Số lần `release_models` được gọi (tắt tiến trình phụ rảnh trước khi xóa hay tải đè model, kế hoạch 04).
    pub releases: Arc<Mutex<usize>>,
    /// File model mà bộ tiến trình phụ giả đang giữ (`models_in_use`); test đặt.
    pub held: Arc<Mutex<Vec<PathBuf>>>,
    /// Số lần `shutdown` và `kill_all` được gọi.
    pub shutdowns: Arc<Mutex<Vec<&'static str>>>,
    /// Prompt của từng request dịch, kể cả lần làm nóng.
    pub prompts: Arc<Mutex<Vec<String>>>,
    /// Máy chưa đủ sức dịch trong lúc người nói chưa dừng (`streaming_supported` trả `false`, spec 2026-10-10 §5); test đổi
    /// được giữa hai phiên.
    pub slow_machine: Arc<AtomicBool>,
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
            let speaking = match self.audio {
                FakeAudio::Silence => false,
                FakeAudio::Tone => (self.pos / 16_000).is_multiple_of(2),
                FakeAudio::LongTone => self.pos % 64_000 < 48_000,
            };
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

    fn capture(&self, plan: &CapturePlan, on_event: OnEvent) -> Box<dyn FrameSource> {
        self.capture_plans.lock().unwrap().push(plan.clone());
        if let CapturePlan::Playback { source, include_self } = plan {
            self.captures.lock().unwrap().push(*include_self);
            self.capture_sources.lock().unwrap().push(source.clone());
        }
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

    fn mic_permission(&self) -> MicPermission {
        self.mic_permission.lock().unwrap().unwrap_or(MicPermission::Granted)
    }

    fn request_mic_permission(&self) -> MicPermission {
        *self.mic_requests.lock().unwrap() += 1;
        self.mic_permission.lock().unwrap().unwrap_or(MicPermission::Granted)
    }

    fn release_models(&self) {
        *self.releases.lock().unwrap() += 1;
    }

    fn models_in_use(&self) -> Vec<PathBuf> {
        self.held.lock().unwrap().clone()
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

    fn streaming_supported(&self) -> bool {
        self.calls.lock().unwrap().push("streaming_supported");
        !self.slow_machine.load(Ordering::SeqCst)
    }

    /// Tiến trình phụ giả "chạy" từ lần `prepare` thành công đầu tiên.
    fn sidecars_running(&self) -> bool {
        self.prepare_error.is_none() && *self.prepares.lock().unwrap() > 0
    }
}

pub fn mock_app() -> tauri::App<MockRuntime> {
    mock_app_with(FakeDeps::default())
}

/// Giờ giả mặc định của quản lý model trong app giả (giây Unix, 2026-09-21).
pub const MODELS_NOW: u64 = 1_790_000_000;

/// Quản lý model của app giả: thư mục tạm riêng cho mỗi app, khóa test của bộ vector, máy Mac 16 GB, ổ đĩa còn trống,
/// đồng hồ `clock`, không chờ thật trước khi thử lại. `source`: URL manifest (server giả), `None` là chưa có nguồn.
pub fn models_config(source: Option<reqwest::Url>, clock: Arc<AtomicU64>) -> ModelsConfig {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "mt-models-app-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    ModelsConfig {
        dir,
        source,
        keys: crate::models::signed::tests::test_keys(),
        app_version: "0.1.0".into(),
        retry: Retry {
            retries: 3,
            backoff: vec![Duration::ZERO],
        },
        machine: Box::new(|_| Machine {
            os: Os::Macos,
            ram_mib: 16_384,
            avx2: true,
            gpus: Vec::new(),
            gpu_known: true,
        }),
        free_disk: Box::new(|_| Some(1 << 40)),
        now: Box::new(move || clock.load(Ordering::SeqCst)),
    }
}

pub fn mock_app_with(deps: FakeDeps) -> tauri::App<MockRuntime> {
    mock_app_full(deps, models_config(None, Arc::new(AtomicU64::new(MODELS_NOW))))
}

pub fn mock_app_full(deps: FakeDeps, models: ModelsConfig) -> tauri::App<MockRuntime> {
    // Plugin cập nhật như app thật, để `acl_tests` thấy lệnh của nó bị chặn chứ không phải chưa đăng ký.
    let builder = mock_builder().plugin(crate::updater::plugin());
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    let surface = FakeSurface::default();
    let native = FakeNative::default();
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
        .manage(OverlaySurface::new(Box::new(surface.clone())))
        .manage(surface)
        .manage(crate::compose::Compose::new(Box::new(native.clone())))
        .manage(native)
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
        .manage(Arc::new(ModelService::new(models)))
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

/// Từ giờ, mở link ngoài trong app giả báo lỗi như trình mở của hệ điều hành (vẫn ghi lại lần gọi).
pub fn fail_opening_links(app: &tauri::App<MockRuntime>) {
    *app.state::<FakeSystem>().1.lock().unwrap() = true;
}

/// Các lần gọi tới thanh phụ đề từ lúc dựng app giả.
pub fn overlay_calls(app: &tauri::App<MockRuntime>) -> Vec<String> {
    app.state::<FakeSurface>().calls.lock().unwrap().clone()
}

pub fn window(app: &tauri::App<MockRuntime>, label: &str) -> WebviewWindow<MockRuntime> {
    app.get_webview_window(label).unwrap_or_else(|| {
        WebviewWindowBuilder::new(app, label, Default::default())
            .build()
            .expect("tạo được cửa sổ giả")
    })
}

/// Origin của giao diện đóng gói: ACL của Tauri chỉ coi là "local" đúng origin này (macOS `tauri://localhost`, Windows
/// `http://tauri.localhost`, xem `navigation.rs`). Dùng origin của hệ điều hành khác thì mọi lệnh bị chặn.
fn app_origin() -> &'static str {
    if cfg!(windows) {
        "http://tauri.localhost"
    } else {
        "tauri://localhost"
    }
}

/// Gọi một lệnh như giao diện gọi `invoke(cmd, args)` từ cửa sổ `window`.
pub fn invoke(window: &WebviewWindow<MockRuntime>, cmd: &str, args: Value) -> Result<Value, String> {
    let request = InvokeRequest {
        cmd: cmd.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: app_origin().parse().unwrap(),
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

// ---- Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md) ----

/// Log của cả tiến trình test, do một logger toàn cục ghi (như `tauri-plugin-log` ghi `app.log`), kèm luồng ghi từng dòng. Báo
/// cáo lỗi của một phiên giả đọc log này, nên test kiểm được báo cáo từ log thật của phiên; test bản quyền đọc phần của luồng mình
/// (`logs_of_this_thread`). Một logger chung vì `log::set_logger` chỉ cài được một lần mỗi tiến trình.
static CAPTURED_LOG: Mutex<Vec<(std::thread::ThreadId, String)>> = Mutex::new(Vec::new());

struct CapturedLog;

impl log::Log for CapturedLog {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &log::Record) {
        CAPTURED_LOG.lock().unwrap().push((
            std::thread::current().id(),
            format!("[{}][{}] {}", record.level(), record.target(), record.args()),
        ));
    }

    fn flush(&self) {}
}

/// Cài logger ghi lại, mức Info (một lần mỗi tiến trình test).
pub fn capture_logs() {
    static INIT: std::sync::Once = std::sync::Once::new();
    INIT.call_once(|| {
        let _ = log::set_logger(&CapturedLog);
        log::set_max_level(log::LevelFilter::Info);
    });
}

/// Các dòng log mà luồng đang chạy đã ghi, từ lúc cài logger.
pub fn logs_of_this_thread() -> Vec<String> {
    let me = std::thread::current().id();
    CAPTURED_LOG
        .lock()
        .unwrap()
        .iter()
        .filter(|(thread, _)| *thread == me)
        .map(|(_, line)| line.clone())
        .collect()
}

/// Mọi dòng log của cả tiến trình test (mọi luồng), từ lúc cài logger.
pub fn all_logs() -> Vec<String> {
    CAPTURED_LOG
        .lock()
        .unwrap()
        .iter()
        .map(|(_, line)| line.clone())
        .collect()
}

/// Nguồn log của báo cáo lỗi trong app giả: `app.log` là log đã ghi lại ở trên; hai log tiến trình phụ rỗng.
pub struct FakeReportLogs;

impl crate::diagnostics::logs::LogSource for FakeReportLogs {
    fn read(&self, file: crate::diagnostics::logs::LogFile) -> String {
        match file {
            crate::diagnostics::logs::LogFile::App => {
                let mut text = CAPTURED_LOG
                    .lock()
                    .unwrap()
                    .iter()
                    .map(|(_, line)| line.as_str())
                    .collect::<Vec<_>>()
                    .join("\n");
                text.push('\n');
                text
            }
            _ => String::new(),
        }
    }
}

/// Máy chủ báo cáo giả: trả lần lượt các kết quả đã đặt (hết thì `Ok`) và giữ lại thân đã nhận.
#[derive(Clone, Default)]
pub struct FakeReportApi {
    pub script: Arc<Mutex<Vec<Result<(), crate::diagnostics::send::SendError>>>>,
    pub bodies: Arc<Mutex<Vec<String>>>,
}

impl crate::diagnostics::send::ReportApi for FakeReportApi {
    fn send(&self, body: &str) -> Result<(), crate::diagnostics::send::SendError> {
        self.bodies.lock().unwrap().push(body.to_string());
        let mut script = self.script.lock().unwrap();
        if script.is_empty() { Ok(()) } else { script.remove(0) }
    }
}

/// `Reporter` đã cài vào app giả, cùng máy chủ giả của nó.
pub struct ReportRig {
    pub reporter: Arc<crate::diagnostics::reporter::Reporter>,
    pub api: FakeReportApi,
}

/// Cài báo cáo lỗi vào app giả (như `diagnostics::install` ở app thật): máy chủ giả, log ghi lại, thư mục hàng đợi tạm riêng, và
/// cho phép gửi tự động dù đang là bản debug. Cài đặt `sendErrorReports` của app giả vẫn mặc định tắt: test bật bằng
/// `update_settings`.
pub fn install_reports(app: &tauri::App<MockRuntime>) -> ReportRig {
    capture_logs();
    static DIRS: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "{APP_DIR_PREFIX}reports-{}-{}",
        std::process::id(),
        DIRS.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    let api = FakeReportApi::default();
    let reporter =
        crate::diagnostics::reporter_for_tests(app.handle(), Box::new(FakeReportLogs), Box::new(api.clone()), dir);
    app.manage(reporter.clone());
    app.manage(crate::diagnostics::AsrBackendNote::default());
    ReportRig { reporter, api }
}

/// Bật `sendErrorReports` trong app giả, như người dùng bật ở Cài đặt (không qua lệnh, nên không cần cửa sổ).
pub fn enable_error_reports(app: &tauri::App<MockRuntime>) {
    let state = app.state::<AppState>();
    let mut next = state.settings();
    next.send_error_reports = true;
    state.replace_settings(&mut next);
}

// ---- Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo-design.md §4) ----

/// Trạng thái của server chat giả: một cuộc chat, tin đánh số tăng dần từ 1 trong toàn server (như `id` thật).
#[derive(Default)]
struct FakeSupportServer {
    disabled: bool,
    closed: bool,
    next_id: i64,
    messages: Vec<SupportMessage>,
    calls: Vec<String>,
    openings: Vec<Opening>,
    /// Lỗi trả cho các lần gọi kế tiếp, lần lượt (lần gọi vẫn được ghi lại).
    errors: VecDeque<ApiError>,
}

impl FakeSupportServer {
    /// Ghi lần gọi; còn lỗi đã đặt thì trả lỗi đó.
    fn call(&mut self, call: String) -> Result<(), ApiError> {
        self.calls.push(call);
        self.errors.pop_front().map_or(Ok(()), Err)
    }

    fn add(&mut self, sender: Sender, text: &str, at: i64) -> SupportMessage {
        self.next_id += 1;
        let message = SupportMessage {
            id: self.next_id,
            sender,
            text: text.to_string(),
            created_at: at,
        };
        self.messages.push(message.clone());
        message
    }
}

/// Server chat giả cho test, không ra mạng. Ghi mỗi lần gọi dạng `start`, `send`, `messages <after>`, `email <địa chỉ|null>`,
/// `delete`.
#[derive(Clone, Default)]
pub struct FakeSupportApi(Arc<Mutex<FakeSupportServer>>);

impl FakeSupportApi {
    /// Token server giả cấp cho mọi cuộc chat mới (43 ký tự base64url).
    pub const TOKEN: &'static str = "FakeSupportToken0123456789abcdefghijklmnopq";

    fn server(&self) -> std::sync::MutexGuard<'_, FakeSupportServer> {
        self.0.lock().unwrap()
    }

    pub fn calls(&self) -> Vec<String> {
        self.server().calls.clone()
    }

    /// Tin đầu tiên của từng cuộc chat đã tạo.
    pub fn openings(&self) -> Vec<Opening> {
        self.server().openings.clone()
    }

    /// Lần gọi kế tiếp (chưa dùng lỗi nào đã đặt) trả lỗi này.
    pub fn fail_next(&self, e: ApiError) {
        self.server().errors.push_back(e);
    }

    /// Chủ dự án trả lời lúc `at`.
    pub fn owner_reply(&self, text: &str, at: i64) {
        self.server().add(Sender::Owner, text, at);
    }

    /// Chat bật hay tắt (`/tat`), cuộc chat bị chặn hay không (`/chan`).
    pub fn set_server(&self, enabled: bool, closed: bool) {
        let mut server = self.server();
        server.disabled = !enabled;
        server.closed = closed;
    }
}

impl SupportApi for FakeSupportApi {
    fn start(&self, opening: &Opening) -> Result<Started, ApiError> {
        let mut server = self.server();
        server.openings.push(opening.clone());
        server.call("start".into())?;
        server.messages.clear();
        let message = server.add(Sender::Customer, &opening.text, 0);
        Ok(Started {
            token: Self::TOKEN.into(),
            message,
        })
    }

    fn send(&self, _token: &str, text: &str) -> Result<SupportMessage, ApiError> {
        let mut server = self.server();
        server.call("send".into())?;
        Ok(server.add(Sender::Customer, text, 0))
    }

    fn messages(&self, _token: &str, after: i64) -> Result<Batch, ApiError> {
        let mut server = self.server();
        server.call(format!("messages {after}"))?;
        Ok(Batch {
            enabled: !server.disabled,
            status: if server.closed { "closed" } else { "open" }.into(),
            messages: server.messages.iter().filter(|m| m.id > after).cloned().collect(),
        })
    }

    fn set_email(&self, _token: &str, email: Option<&str>) -> Result<(), ApiError> {
        self.server().call(format!("email {}", email.unwrap_or("null")))
    }

    fn delete(&self, _token: &str) -> Result<(), ApiError> {
        let mut server = self.server();
        server.call("delete".into())?;
        server.messages.clear();
        Ok(())
    }
}

/// Chat hỗ trợ đã cài vào app giả: server giả của nó.
pub struct SupportRig {
    pub api: FakeSupportApi,
}

/// Cài chat hỗ trợ vào app giả (như `support::install` ở app thật) với server giả và `support.json` trong thư mục tạm riêng; không
/// có luồng hỏi nền.
pub fn install_support(app: &tauri::App<MockRuntime>) -> SupportRig {
    static DIRS: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "{APP_DIR_PREFIX}support-{}-{}",
        std::process::id(),
        DIRS.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    let api = FakeSupportApi::default();
    let chat = crate::support::chat_for_tests(app.handle(), Box::new(api.clone()), dir.join("support.json"));
    app.manage(chat);
    SupportRig { api }
}
