//! Icon ở khay hệ thống (menu bar trên Mac) và menu của nó (F10, spec §4.2, §4.3).
//! Menu dựng lại mỗi khi trạng thái hay ngôn ngữ giao diện đổi, nên chữ luôn theo ngôn ngữ đang chọn.
//! Nội dung menu (dòng nào, chữ gì) nằm ở `tray_menu.rs`, có test.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Runtime};

use crate::hotkeys::HotkeyAction;
use crate::i18n::{self, Strings};
use crate::state::{AppState, SessionStatus};
use crate::tray_menu::{TrayItem, TrayModel, menu_lines};
use crate::{actions, events, window};

pub const TRAY_ID: &str = "main";

fn model<R: Runtime>(app: &AppHandle<R>) -> (TrayModel, &'static Strings) {
    let state = app.state::<AppState>();
    let settings = state.settings();
    let status = state.status();
    let model = TrayModel {
        running: status.session == SessionStatus::Running,
        overlay_visible: status.overlay_visible,
        locked: settings.overlay.locked,
        hotkeys_failed: !status.hotkey_failures.is_empty(),
    };
    (model, i18n::strings(settings.ui_language))
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<(Menu<R>, String)> {
    let (model, strings) = model(app);
    let menu = Menu::new(app)?;
    for line in menu_lines(strings, model) {
        match line {
            Some((item, text)) => menu.append(&MenuItem::with_id(app, item.id(), text, true, None::<&str>)?)?,
            None => menu.append(&PredefinedMenuItem::separator(app)?)?,
        }
    }
    Ok((menu, strings.tooltip(&app.package_info().name, model.running)))
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
        Some(TrayItem::OpenMain) => window::show_main(app),
        Some(TrayItem::Quit) => actions::quit(app),
        None => log::warn!("mục menu khay lạ: {id}"),
    }
}
