//! Cửa sổ chính: bấm X chỉ ẩn xuống khay (spec §4.3); icon ở Dock theo cửa sổ chính (§4.4).

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};

use crate::{navigation, overlay};

pub const MAIN: &str = "main";

/// Tạo cửa sổ chính, ẩn. Tạo bằng code (không khai trong `tauri.conf.json`) để gắn được
/// `on_new_window`: link mở cửa sổ mới không bao giờ mở webview mới (`navigation.rs`).
pub fn create_main<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title(app.package_info().name.clone())
        .inner_size(960.0, 640.0)
        .min_inner_size(720.0, 480.0)
        .center()
        .visible(false)
        // ⌘+ / Ctrl+ phóng to chữ (§6.10). Trên macOS cần quyền `core:webview:allow-set-webview-zoom`.
        .zoom_hotkeys_enabled(true)
        .on_new_window(navigation::new_window_handler(app.clone()))
        .build()?;
    Ok(())
}

/// Hiện cửa sổ chính. Trên Mac, app hiện icon ở Dock (activation policy `regular`).
/// Kế hoạch 02 chạy hai tiến trình phụ khi cửa sổ chính mở (§5), từ chỗ gọi hàm này.
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(target_os = "macos")]
    if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Regular) {
        log::warn!("không đổi được activation policy: {e}");
    }
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Ẩn cửa sổ chính xuống khay. Trên Mac, app bỏ icon ở Dock (activation policy `accessory`).
pub fn hide_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.hide();
    }
    #[cfg(target_os = "macos")]
    if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Accessory) {
        log::warn!("không đổi được activation policy: {e}");
    }
}

pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    match (window.label(), event) {
        // X, ⌘W, Alt+F4: chỉ ẩn. App, phím tắt và phiên dịch vẫn chạy.
        (MAIN, WindowEvent::CloseRequested { api, .. }) => {
            api.prevent_close();
            hide_main(window.app_handle());
        }
        (overlay::LABEL, WindowEvent::Moved(_) | WindowEvent::Resized(_)) => {
            overlay::remember_position(window.app_handle());
        }
        _ => {}
    }
}

/// Menu của app trên Mac, gần như menu mặc định của Tauri. Mục Quit (`⌘Q`) vẫn còn, nhưng mọi yêu cầu
/// thoát đi qua `quit_guard`: không phải do hệ thống gửi thì bị hủy, và app hiện lời nhắc thoát ở menu
/// bar (§4.3).
#[cfg(target_os = "macos")]
pub fn app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{AboutMetadata, Menu, PredefinedMenuItem as P, Submenu};
    let name = app.package_info().name.clone();
    let about = AboutMetadata {
        name: Some(name.clone()),
        version: Some(app.package_info().version.to_string()),
        ..Default::default()
    };
    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                &name,
                true,
                &[
                    &P::about(app, None, Some(about))?,
                    &P::separator(app)?,
                    &P::services(app, None)?,
                    &P::separator(app)?,
                    &P::hide(app, None)?,
                    &P::hide_others(app, None)?,
                    &P::show_all(app, None)?,
                    &P::separator(app)?,
                    &P::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &P::undo(app, None)?,
                    &P::redo(app, None)?,
                    &P::separator(app)?,
                    &P::cut(app, None)?,
                    &P::copy(app, None)?,
                    &P::paste(app, None)?,
                    &P::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &P::minimize(app, None)?,
                    &P::maximize(app, None)?,
                    &P::separator(app)?,
                    &P::close_window(app, None)?,
                ],
            )?,
        ],
    )
}
