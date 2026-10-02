//! Lệnh `invoke` của giao diện. Mỗi lệnh phải có trong ba chỗ, test `acl_tests` giữ chúng khớp nhau:
//! 1. `handler()` bên dưới;
//! 2. `build.rs` (app manifest, để lệnh đi qua ACL);
//! 3. `capabilities/main.json` hoặc `capabilities/overlay.json` (quyền `allow-<tên-lệnh>`).
//!
//! Lệnh generic theo `R: Runtime` để test ACL chạy được với `MockRuntime`.
//! Dữ liệu từ giao diện luôn được kiểm kiểu (serde) và phạm vi (`Settings::validate`) trước khi dùng.

use serde_json::Value;
use tauri::{AppHandle, Runtime, State};

use crate::actions;
use crate::errors::{self, CommandError};
use crate::hotkeys::HotkeyAction;
use crate::settings::Settings;
use crate::state::{AppInfo, AppState, AppStatus, OverlayView};

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
pub fn update_settings<R: Runtime>(app: AppHandle<R>, patch: Value) -> Result<Settings, CommandError> {
    actions::update_settings(&app, &patch)
}

#[tauri::command]
pub fn set_hotkey<R: Runtime>(
    app: AppHandle<R>,
    action: HotkeyAction,
    accelerator: String,
) -> Result<Settings, CommandError> {
    actions::set_hotkey(&app, action, &accelerator)
}

#[tauri::command]
pub fn get_app_status(state: State<'_, AppState>) -> AppStatus {
    state.status()
}

/// Bắt đầu phiên thật (chạy tiến trình phụ, mở nguồn âm thanh) có thể chặn vài chục giây, nên không chạy trên luồng
/// chính: lệnh `async` chạy trên runtime của Tauri, việc chặn chạy trên luồng của `spawn_blocking`.
#[tauri::command]
pub async fn toggle_session<R: Runtime>(app: AppHandle<R>) -> Result<AppStatus, CommandError> {
    tauri::async_runtime::spawn_blocking(move || actions::toggle_session(&app))
        .await
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
}

#[tauri::command]
pub fn set_overlay_visible<R: Runtime>(app: AppHandle<R>, visible: bool) -> Result<AppStatus, CommandError> {
    actions::set_overlay_visible(&app, visible)
}

#[tauri::command]
pub fn set_overlay_locked<R: Runtime>(app: AppHandle<R>, locked: bool) -> Result<Settings, CommandError> {
    actions::set_overlay_locked(&app, locked)
}

#[tauri::command]
pub fn get_app_info<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        name: app.package_info().name.clone(),
        version: app.package_info().version.to_string(),
        identifier: app.config().identifier.clone(),
        platform: if cfg!(target_os = "macos") { "macos" } else { "windows" },
        launched_at_login: state.launched_at_login(),
    }
}

#[tauri::command]
pub fn open_log_dir<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    actions::open_log_dir(&app)
}

#[tauri::command]
pub fn open_taskbar_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    actions::open_taskbar_settings(&app)
}

#[tauri::command]
pub fn open_login_items_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    actions::open_login_items_settings(&app)
}

/// Lệnh duy nhất cửa sổ `overlay` gọi được, chỉ đọc (§10.2).
#[tauri::command]
pub fn get_overlay_view(state: State<'_, AppState>) -> OverlayView {
    OverlayView::from_settings(&state.settings())
}

/// Lệnh của cửa sổ `main`.
pub const MAIN_COMMANDS: &[&str] = &[
    "get_settings",
    "update_settings",
    "set_hotkey",
    "get_app_status",
    "toggle_session",
    "set_overlay_visible",
    "set_overlay_locked",
    "get_app_info",
    "open_log_dir",
    "open_taskbar_settings",
    "open_login_items_settings",
];

/// Lệnh của cửa sổ `overlay`.
pub const OVERLAY_COMMANDS: &[&str] = &["get_overlay_view"];

pub fn handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        get_settings,
        update_settings,
        set_hotkey,
        get_app_status,
        toggle_session,
        set_overlay_visible,
        set_overlay_locked,
        get_app_info,
        open_log_dir,
        open_taskbar_settings,
        open_login_items_settings,
        get_overlay_view,
    ]
}
