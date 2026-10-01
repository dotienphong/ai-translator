//! Lõi Rust của app AI Translator (spec §5, §12). `main.rs` chỉ gọi `run()`.
//!
//! Tên sản phẩm và bundle identifier nằm ở `tauri.conf.json` (`productName`, `identifier`); tên crate,
//! tên binary (`meeting-translator`) và tên thư mục repo giữ nguyên (QĐ29).
//!
//! Kế hoạch 01 dựng khung: cài đặt, i18n phía Rust, khay, phím tắt, hai cửa sổ, quyền, kho khóa, log.
//! Kế hoạch 02 nối `audio-capture` và `pipeline` vào, thay `session_stub.rs` bằng `session.rs`.

pub mod actions;
pub mod commands;
pub mod errors;
pub mod events;
pub mod hotkey_registry;
pub mod hotkeys;
pub mod i18n;
pub mod logging;
pub mod login_item;
pub mod navigation;
pub mod overlay;
pub mod quit_guard;
pub mod security;
pub mod session_stub;
pub mod settings;
pub mod state;
pub mod system;
pub mod tray;
pub mod tray_menu;
pub mod window;

#[cfg(test)]
mod acl_tests;
#[cfg(test)]
mod app_tests;
#[cfg(test)]
mod test_support;

use tauri::{App, AppHandle, Manager, RunEvent};

use crate::hotkey_registry::HotkeyRegistry;
use crate::settings::{Settings, persist};
use crate::state::AppState;

/// Tham số hệ điều hành truyền khi mở app lúc đăng nhập (tauri-plugin-autostart).
pub const AUTOSTART_ARG: &str = "--autostart";

pub fn run() {
    let context = tauri::generate_context!();
    // QĐ29: tên mục khởi động cùng hệ thống theo một luật duy nhất (`login_item::autostart_name`): macOS
    // là bundle identifier (tên file LaunchAgent và `Label`), Windows là tên sản phẩm (tên giá trị trong `Run`).
    let autostart_name =
        login_item::autostart_name(&context.config().identifier, &context.package_info().name).to_string();
    let autostart = tauri_plugin_autostart::Builder::new()
        .app_name(autostart_name)
        .arg(AUTOSTART_ARG);
    // single-instance phải là plugin đầu tiên: bản thứ hai thoát ngay, bản đang chạy hiện cửa sổ chính (Q7).
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_main(app)
        }))
        .plugin(logging::plugin())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(autostart.build())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(hotkey_registry::plugin())
        .plugin(navigation::plugin());
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init()).menu(window::app_menu);
    builder
        .invoke_handler(commands::handler())
        .on_window_event(window::on_window_event)
        .setup(setup)
        .build(context)
        .expect("không dựng được app")
        .run(on_run_event);
}

fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    // Mọi việc mở ra ngoài app (Finder, System Settings, trình duyệt) đi qua đây (QĐ28).
    system::install(&handle);
    // Ghi file cài đặt và bật/tắt khởi động cùng hệ thống cũng qua trait, để test dùng bản giả.
    persist::install(&handle);
    login_item::install(&handle);
    let launched_at_login = std::env::args().any(|arg| arg == AUTOSTART_ARG);
    log::info!(
        "khởi động {} {}, lúc đăng nhập: {launched_at_login}",
        handle.package_info().name,
        handle.package_info().version
    );

    let loaded = persist::load(&handle, Settings::defaults(i18n::system_ui_language()))?;
    if !loaded.rejected.is_empty() {
        log::warn!(
            "bỏ các khóa cài đặt không hợp lệ, dùng giá trị mặc định: {:?}",
            loaded.rejected
        );
    }
    let needs_save = loaded.needs_save();
    let mut settings = loaded.settings;
    let launch_changed = actions::sync_launch_at_login(&handle, &mut settings);
    if needs_save || launch_changed {
        persist::save(&handle, &settings, &loaded.meta)?;
    }
    app.manage(AppState::new(settings.clone(), loaded.meta, launched_at_login));
    app.manage(HotkeyRegistry::default());

    #[cfg(target_os = "macos")]
    {
        let app = handle.clone();
        quit_guard::install(move || actions::quit_blocked(&app));
    }

    window::create_main(&handle)?;
    overlay::create(&handle)?;
    let failures = hotkey_registry::register_all(&handle, &settings.hotkeys);
    handle
        .state::<AppState>()
        .update_status(|s| s.hotkey_failures = failures);
    tray::create(&handle)?;

    // Đ19: mở lúc đăng nhập thì chỉ nằm ở khay; người dùng tự mở app thì hiện cửa sổ chính. Thanh phụ
    // đề ẩn trong cả hai trường hợp, tới khi bắt đầu phiên.
    if launched_at_login {
        window::hide_main(&handle)
    } else {
        window::show_main(&handle)
    }
    Ok(())
}

// `app` chỉ dùng trên macOS.
#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
fn on_run_event(app: &AppHandle, event: RunEvent) {
    match event {
        // Đóng hết cửa sổ không làm app thoát; chỉ Thoát ở menu khay mới thoát (`AppHandle::exit`,
        // lúc đó `code` có giá trị).
        RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
        // Bấm icon ở Dock khi cửa sổ chính đang ẩn.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => window::show_main(app),
        _ => {}
    }
}
