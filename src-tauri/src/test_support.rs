//! Dụng cụ cho các test chạy app bằng `MockRuntime`: đúng `tauri.conf.json`, `capabilities/` và app
//! manifest của `build.rs`, nhưng không mở cửa sổ thật.

use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

use crate::commands;
use crate::login_item::{AgentStatus, LoginItem, LoginItems};
use crate::overlay::{OverlaySurface, Surface};
use crate::settings::migrate::FileMeta;
use crate::settings::persist::{SettingsFile, Writer};
use crate::settings::{Settings, UiLanguage};
use crate::state::AppState;
use crate::system::{System, SystemOpener};

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

pub fn mock_app() -> tauri::App<MockRuntime> {
    let builder = mock_builder();
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    let surface = FakeSurface::default();
    let system = FakeSystem::default();
    let login = FakeLoginItem::default();
    let file = FakeSettingsFile::default();
    builder
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
        .invoke_handler(commands::handler())
        .build(tauri::generate_context!(test = true))
        .expect("dựng được app giả")
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
