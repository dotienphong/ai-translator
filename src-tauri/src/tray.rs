//! Icon ở khay hệ thống (menu bar trên Mac) và menu của nó (F10, spec §4.2, §4.3).
//! Menu dựng lại mỗi khi trạng thái hay ngôn ngữ giao diện đổi, nên chữ luôn theo ngôn ngữ đang chọn.
//! Nội dung menu (dòng nào, chữ gì) nằm ở `tray_menu.rs`, có test.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Runtime};

use crate::hotkeys::HotkeyAction;
use crate::i18n;
use crate::state::{AppState, SessionStatus};
use crate::tray_menu::{TrayItem, TrayModel, accelerator, menu_lines};
use crate::{actions, compose, events, updater, window};

pub const TRAY_ID: &str = "main";

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<(Menu<R>, String)> {
    let state = app.state::<AppState>();
    let (settings, status) = (state.settings(), state.status());
    let model = TrayModel {
        running: matches!(status.session, SessionStatus::Starting | SessionStatus::Running),
        overlay_visible: status.overlay_visible,
        locked: settings.overlay.locked,
        hotkeys_failed: !status.hotkey_failures.is_empty(),
        update_ready: status.update_ready.is_some(),
        compose_enabled: settings.compose.enabled,
    };
    let strings = i18n::strings(settings.ui_language);
    let menu = Menu::new(app)?;
    for line in menu_lines(strings, model) {
        match line {
            Some((item, text)) => {
                let key = accelerator(item, &settings.hotkeys, &status.hotkey_failures);
                append_item(app, &menu, item, text, key)?;
            }
            None => menu.append(&PredefinedMenuItem::separator(app)?)?,
        }
    }
    Ok((menu, strings.tooltip(&app.package_info().name, model.running)))
}

/// Thêm một mục vào menu, kèm phím tắt nếu có (spec 2026-10-20 §3). `muda` không nhận vài phím mà plugin phím tắt nhận (phím
/// numpad, media trên macOS; phím Win trên Windows) và báo lỗi lúc thêm mục, trước khi mục vào menu: thử lại không kèm phím,
/// để menu khay không bao giờ thiếu mục.
fn append_item<R: Runtime>(
    app: &AppHandle<R>,
    menu: &Menu<R>,
    item: TrayItem,
    text: &str,
    key: Option<&str>,
) -> tauri::Result<()> {
    if let Some(key) = key {
        match MenuItem::with_id(app, item.id(), text, true, Some(key)).and_then(|with_key| menu.append(&with_key)) {
            Ok(()) => return Ok(()),
            Err(e) => log::warn!("không gắn được phím {key} vào mục {} của menu khay: {e}", item.id()),
        }
    }
    menu.append(&MenuItem::with_id(app, item.id(), text, true, None::<&str>)?)
}

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let (menu, tooltip) = build_menu(app)?;
    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(tooltip)
        .on_menu_event(|app, event| on_menu_event(app, event.id().as_ref()));
    // macOS: icon đơn sắc dạng template, hệ thống tự đổi màu theo menu bar sáng hay tối; bấm chuột
    // trái mở menu như mọi icon menu bar. Windows: icon màu của app; bấm chuột trái mở cửa sổ chính,
    // chuột phải mở menu.
    #[cfg(target_os = "macos")]
    let builder = builder
        .icon(tauri::include_image!("icons/tray-template.png"))
        .icon_as_template(true);
    #[cfg(not(target_os = "macos"))]
    let builder = {
        use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
        let builder = builder
            .show_menu_on_left_click(false)
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    window::show_main(tray.app_handle());
                }
            });
        match app.default_window_icon() {
            Some(icon) => builder.icon(icon.clone()),
            None => builder,
        }
    };
    builder.build(app)?;
    Ok(())
}

/// Dựng lại menu và chú thích theo trạng thái hiện tại.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    match build_menu(app) {
        Ok((menu, tooltip)) => {
            let _ = tray.set_menu(Some(menu));
            let _ = tray.set_tooltip(Some(tooltip));
        }
        Err(e) => log::warn!("không dựng lại được menu khay: {e}"),
    }
}

fn on_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match TrayItem::from_id(id) {
        Some(TrayItem::HotkeyWarning) => actions::open_main_at(
            app,
            events::Navigate {
                screen: "settings",
                settings_group: Some("hotkeys"),
            },
        ),
        Some(TrayItem::Session) => actions::run_hotkey(app, HotkeyAction::ToggleSession),
        Some(TrayItem::Overlay) => actions::run_hotkey(app, HotkeyAction::ToggleOverlay),
        Some(TrayItem::Lock) => actions::run_hotkey(app, HotkeyAction::ToggleLock),
        Some(TrayItem::Compose) => compose::toggle_from_tray(app),
        Some(TrayItem::OpenMain) => window::show_main(app),
        // Mở Cài đặt › Chung, nơi hiện kết quả, rồi kiểm trên luồng riêng (có thể phải tải bản mới).
        Some(TrayItem::CheckForUpdates) => {
            actions::open_main_at(
                app,
                events::Navigate {
                    screen: "settings",
                    settings_group: Some("general"),
                },
            );
            let app = app.clone();
            std::thread::spawn(move || {
                updater::check_now(&app);
            });
        }
        Some(TrayItem::RestartToUpdate) => {
            if let Err(e) = updater::restart_to_update(app, |app| app.request_restart()) {
                log::warn!("không khởi động lại để cập nhật được: {}", e.message);
            }
        }
        Some(TrayItem::Quit) => actions::quit(app),
        None => log::warn!("mục menu khay lạ: {id}"),
    }
}

#[cfg(test)]
mod tests {
    use tauri::menu::MenuItem;

    use crate::hotkeys::{self, HotkeyAction};
    use crate::settings::Settings;

    /// Phím app lưu (dạng chuẩn của `hotkeys::parse`) đều là chuỗi mà `muda` đọc được, nên `MenuItem` nhận làm accelerator.
    /// Chỉ kiểm bước đọc chuỗi: `Menu` của macOS chỉ dựng được trên luồng chính, test không thêm mục vào menu được.
    #[test]
    fn stored_hotkeys_are_readable_as_menu_accelerators() {
        let app = crate::test_support::mock_app();
        let defaults = Settings::defaults(crate::settings::UiLanguage::Vi).hotkeys;
        let mut keys: Vec<String> = HotkeyAction::ALL
            .map(|action| defaults.get(action).to_string())
            .to_vec();
        for typed in [
            "control+alt+KeyT",
            "Ctrl+Alt+Digit1",
            "Ctrl+Alt+Backquote",
            "Ctrl+Shift+Alt+F10",
            "Super+Alt+Space",
            "Ctrl+Alt+ArrowUp",
        ] {
            keys.push(hotkeys::parse(typed).unwrap().1);
        }
        for key in keys {
            MenuItem::with_id(app.handle(), "x", "X", true, Some(key.as_str()))
                .unwrap_or_else(|e| panic!("{key}: {e}"));
        }
    }
}
