//! Các việc dùng chung cho lệnh `invoke`, menu khay và phím tắt. Mỗi việc đổi trạng thái rồi báo
//! lại cho giao diện, menu khay và thanh phụ đề, để ba nơi luôn khớp nhau.

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::hotkeys::HotkeyAction;
use crate::login_item::LoginItems;
use crate::settings::{self, Settings, persist};
use crate::state::{AppState, AppStatus, OverlayView, SessionStatus};
use crate::{events, hotkey_registry, login_item, overlay, session_stub, system, tray, window};

/// Lưu cài đặt mới rồi báo mọi nơi cần biết.
fn commit_settings<R: Runtime>(app: &AppHandle<R>, next: Settings) -> Settings {
    let state = app.state::<AppState>();
    let previous = state.replace_settings(next.clone());
    if let Err(e) = persist::save(app, &next, state.file_meta()) {
        log::error!("không lưu được cài đặt: {e}");
    }
    events::settings_changed(app, &next);
    let view = OverlayView::from_settings(&next);
    if view != OverlayView::from_settings(&previous) {
        events::overlay_view(app, &view);
    }
    if previous.ui_language != next.ui_language || previous.overlay.locked != next.overlay.locked {
        tray::refresh(app);
    }
    next
}

fn status_changed<R: Runtime>(app: &AppHandle<R>) -> AppStatus {
    let status = app.state::<AppState>().status();
    events::status_changed(app, &status);
    tray::refresh(app);
    status
}

pub fn update_settings<R: Runtime>(app: &AppHandle<R>, patch: &Value) -> Result<Settings, CommandError> {
    let current = app.state::<AppState>().settings();
    let next = settings::patch::apply(&current, patch)?;
    let enabling = next.launch_at_login && !current.launch_at_login;
    if next.launch_at_login != current.launch_at_login {
        set_launch_at_login(app, next.launch_at_login)?;
    }
    // macOS: mục đã bị tắt ở Login Items thì bật lại trong app chưa đủ; nhắc người dùng (QĐ16). Hỏi trước
    // khi lưu, để không có lỗi nào xảy ra sau khi cài đặt đã được lưu.
    let needs_approval = enabling && login_item::needs_approval(login_items(app)?.0.system_status());
    let next = commit_settings(app, next);
    if needs_approval {
        events::notice(app, events::Notice::LoginItemsApproval);
    }
    Ok(next)
}

pub fn set_hotkey<R: Runtime>(
    app: &AppHandle<R>,
    action: HotkeyAction,
    accelerator: &str,
) -> Result<Settings, CommandError> {
    let state = app.state::<AppState>();
    let mut next = state.settings();
    match hotkey_registry::rebind(app, &next.hotkeys, action, accelerator) {
        Ok(hotkeys) => {
            next.hotkeys = hotkeys;
            state.update_status(|s| s.hotkey_failures.retain(|a| *a != action));
            status_changed(app);
            Ok(commit_settings(app, next))
        }
        Err(e) => {
            if !e.old_active {
                // Phím cũ cũng không đăng ký lại được: việc này đang không có phím tắt, báo như lỗi lúc khởi động.
                state.update_status(|s| {
                    if !s.hotkey_failures.contains(&action) {
                        s.hotkey_failures.push(action);
                        s.hotkey_failures.sort();
                    }
                });
                status_changed(app);
            }
            Err(CommandError::hotkey(action, e.error))
        }
    }
}

/// Bắt đầu hoặc dừng phiên. Bắt đầu thì hiện thanh phụ đề (§4.2); dừng thì thanh giữ nguyên, để
/// người dùng còn đọc được các dòng cuối.
pub fn toggle_session<R: Runtime>(app: &AppHandle<R>) -> Result<AppStatus, CommandError> {
    match app.state::<AppState>().status().session {
        SessionStatus::Idle => {
            session_stub::start(app).map_err(|e| CommandError::new(errors::OVERLAY_FAILED, None, e.to_string()))?
        }
        SessionStatus::Running => session_stub::stop(app),
    }
    Ok(status_changed(app))
}

pub fn set_overlay_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> Result<AppStatus, CommandError> {
    overlay::set_visible(app, visible).map_err(|e| CommandError::new(errors::OVERLAY_FAILED, None, e.to_string()))?;
    app.state::<AppState>().update_status(|s| s.overlay_visible = visible);
    Ok(status_changed(app))
}

pub fn set_overlay_locked<R: Runtime>(app: &AppHandle<R>, locked: bool) -> Result<Settings, CommandError> {
    overlay::set_locked(app, locked).map_err(|e| CommandError::new(errors::OVERLAY_FAILED, None, e.to_string()))?;
    let mut next = app.state::<AppState>().settings();
    next.overlay.locked = locked;
    Ok(commit_settings(app, next))
}

/// Chạy việc của một phím tắt toàn cục hoặc một mục của menu khay.
pub fn run_hotkey<R: Runtime>(app: &AppHandle<R>, action: HotkeyAction) {
    let state = app.state::<AppState>();
    let result = match action {
        HotkeyAction::ToggleSession => toggle_session(app).map(drop),
        HotkeyAction::ToggleOverlay => set_overlay_visible(app, !state.status().overlay_visible).map(drop),
        HotkeyAction::ToggleLock => set_overlay_locked(app, !state.settings().overlay.locked).map(drop),
    };
    if let Err(e) = result {
        log::warn!("phím tắt {action:?} lỗi: {e:?}");
    }
}

fn login_items<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::State<'_, LoginItems>, CommandError> {
    app.try_state::<LoginItems>()
        .ok_or_else(|| CommandError::new(errors::AUTOSTART_FAILED, Some("launchAtLogin"), "chưa cài LoginItem"))
}

fn set_launch_at_login<R: Runtime>(app: &AppHandle<R>, enabled: bool) -> Result<(), CommandError> {
    let items = login_items(app)?;
    let result = if enabled { items.0.enable() } else { items.0.disable() };
    result.map_err(|e| CommandError::new(errors::AUTOSTART_FAILED, Some("launchAtLogin"), e))?;
    // Windows: `disable()` không xóa được mục ở `HKLM` nếu không có quyền admin (QĐ16).
    if !enabled && items.0.is_registered().unwrap_or(false) {
        return Err(CommandError::new(
            errors::AUTOSTART_STILL_ENABLED,
            Some("launchAtLogin"),
            "đã tắt nhưng hệ thống vẫn báo đang bật",
        ));
    }
    Ok(())
}

/// Lúc khởi động: người dùng có thể đã tắt mục khởi động cùng hệ thống trong System Settings hay
/// Task Manager, nên trạng thái thật của hệ điều hành là đúng (QĐ16). Trả về `true` nếu cài đặt phải sửa.
pub fn sync_launch_at_login<R: Runtime>(app: &AppHandle<R>, settings: &mut Settings) -> bool {
    let Ok(items) = login_items(app) else {
        return false;
    };
    let registered = match items.0.is_registered() {
        Ok(registered) => registered,
        Err(e) => {
            log::warn!("không đọc được trạng thái khởi động cùng hệ thống: {e}");
            return false;
        }
    };
    let status = items.0.system_status();
    let enabled = login_item::effective(registered, status);
    if registered && !enabled {
        log::info!("mục khởi động cùng hệ thống đang bị tắt ở System Settings: {status:?}");
    }
    if enabled == settings.launch_at_login {
        return false;
    }
    settings.launch_at_login = enabled;
    true
}

/// macOS: mở System Settings › General › Login Items, từ nút ở lời nhắc `LoginItemsApproval`.
pub fn open_login_items_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    if !cfg!(target_os = "macos") {
        return Err(CommandError::new(errors::UNSUPPORTED, None, "chỉ có trên macOS"));
    }
    system::open_login_items_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
}

/// Mở thư mục log bằng trình quản lý file của hệ điều hành (Đ10), để người dùng tự gửi log khi cần hỗ trợ.
pub fn open_log_dir<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    system::open_log_dir(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
}

/// Windows: mở trang cài đặt Taskbar để người dùng bật icon của app (§4.1, bước 8).
pub fn open_taskbar_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    if !cfg!(windows) {
        return Err(CommandError::new(errors::UNSUPPORTED, None, "chỉ có trên Windows"));
    }
    system::open_taskbar_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
}

/// Thoát hẳn, chỉ gọi từ menu khay (§4.3). Kế hoạch 02 dừng phiên và tắt hai tiến trình phụ ở đây.
pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    session_stub::stop(app);
    overlay::remember_position(app);
    log::info!("thoát theo yêu cầu từ menu khay");
    app.exit(0);
}

/// macOS: vừa bỏ qua một yêu cầu thoát không đến từ menu khay (`⌘Q`, mục Quit ở menu app, Quit ở
/// Dock). Hiện cửa sổ chính kèm lời nhắc, để người dùng biết vì sao app không thoát.
pub fn quit_blocked<R: Runtime>(app: &AppHandle<R>) {
    window::show_main(app);
    events::notice(app, events::Notice::QuitFromTray);
}

/// Mở cửa sổ chính ở một màn hình, dùng cho các dòng báo lỗi ở menu khay.
pub fn open_main_at<R: Runtime>(app: &AppHandle<R>, target: events::Navigate) {
    window::show_main(app);
    events::navigate(app, target);
}
