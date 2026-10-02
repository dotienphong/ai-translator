//! Lõi Rust của app AI Translator (spec §5, §12). `main.rs` chỉ gọi `run()`.
//!
//! Tên sản phẩm và bundle identifier nằm ở `tauri.conf.json` (`productName`, `identifier`); tên crate,
//! tên binary (`meeting-translator`) và tên thư mục repo giữ nguyên (QĐ29).
//!
//! Kế hoạch 01 dựng khung: cài đặt, i18n phía Rust, khay, phím tắt, hai cửa sổ, quyền, kho khóa, log.
//! Kế hoạch 02 nối `audio-capture` và `pipeline` vào (`session.rs`, `capture.rs`, `sidecar/`).

pub mod actions;
pub mod capture;
pub mod commands;
pub mod data;
pub mod db;
pub mod debug;
pub mod errors;
pub mod events;
pub mod files;
pub mod glossary;
pub mod hotkey_registry;
pub mod hotkeys;
pub mod i18n;
pub mod license;
pub mod logging;
pub mod login_item;
pub mod models;
pub mod navigation;
pub mod overlay;
pub mod pro;
pub mod quit_guard;
pub mod security;
pub mod session;
pub mod settings;
pub mod sidecar;
pub mod state;
pub mod system;
pub mod transcript;
pub mod tray;
pub mod tray_menu;
pub mod window;

#[cfg(test)]
mod acl_tests;
#[cfg(test)]
mod app_tests;
#[cfg(test)]
mod test_support;

use std::sync::Arc;

use tauri::{App, AppHandle, Manager, RunEvent};

use crate::hotkey_registry::HotkeyRegistry;
use crate::settings::{Settings, persist};
use crate::state::AppState;

/// Tham số hệ điều hành truyền khi mở app lúc đăng nhập (tauri-plugin-autostart).
pub const AUTOSTART_ARG: &str = "--autostart";

pub fn run() {
    // App panic thì kill tiến trình phụ trước khi abort (Windows: Job Object lo việc này).
    pipeline::process::install_panic_hook();
    #[cfg(windows)]
    harden_dll_search();
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
        .plugin(tauri_plugin_dialog::init())
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
    // Điểm kiểm tra Pro duy nhất (Đ6): bản debug luôn Pro, bản release là Free; kế hoạch 06 cài trạng thái bản quyền.
    pro::install_default_gate(&handle);
    // DB mã hóa của lịch sử và từ điển: chưa mở, chưa đọc kho khóa ở đây (db.rs).
    db::install(&handle)?;
    app.manage(glossary::ActiveGlossary::default());
    app.manage(transcript::store::TranscriptStore::default());
    files::install(&handle);
    app.manage(debug::DebugLog::default());
    app.manage(HotkeyRegistry::default());
    // Tiến trình phụ mà lần chạy trước bỏ lại (Force Quit, app bị kill): kill trước khi chạy sẵn tiến trình mới, rồi từ
    // giờ ghi pidfile (Q8 của review 02c). Windows: Job Object đã lo, hàm không làm gì. Đọc pidfile ở đây chỉ đúng vì
    // plugin single-instance (đăng ký trước `setup`) bảo đảm không có bản app nào khác đang chạy: bản thứ hai thoát trước
    // khi tới đây, nên mọi mục trong file là của một lần chạy đã chết, không phải của bản đang dùng tiến trình phụ đó.
    let pidfile = handle.path().app_local_data_dir()?.join("sidecars-live.json");
    if let Ok(dir) = sidecar::paths::binaries_dir() {
        let reaped = pipeline::process::reap_orphans(&pidfile, &dir);
        if !reaped.is_empty() {
            log::warn!("đã kill {} tiến trình phụ còn sót từ lần chạy trước", reaped.len());
        }
    }
    pipeline::process::set_pidfile(&pidfile);
    app.manage(sidecar::GpuProbe::default());
    sidecar::start_gpu_probe(&handle);
    // Quản lý model (kế hoạch 04): đọc manifest đã lưu, kiểm bản mới tối đa mỗi ngày một lần.
    app.manage(Arc::new(models::service::ModelService::new(
        models::service::Config::live(&handle)?,
    )));
    models::service::check_on_startup(&handle);
    app.manage(session::Session::new(Arc::new(session::LiveDeps::new(handle.clone()))));
    session::spawn_ticker(&handle);

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

fn on_run_event(app: &AppHandle, event: RunEvent) {
    handle_run_event(app, event, pipeline::process::kill_all);
}

/// Xử lý sự kiện vòng lặp chính. Tổng quát theo `Runtime` và nhận hàm kill để test đưa thẳng `RunEvent::Exit` vào (N-2
/// của review cuối 03), không kill tiến trình của test khác.
// `app` chỉ dùng trên macOS và ở nhánh `Exit`.
#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
pub(crate) fn handle_run_event<R: tauri::Runtime>(app: &AppHandle<R>, event: RunEvent, kill_all: fn()) {
    match event {
        // Đóng hết cửa sổ không làm app thoát; chỉ Thoát ở menu khay mới thoát (`AppHandle::exit`,
        // lúc đó `code` có giá trị).
        RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
        // Bấm icon ở Dock khi cửa sổ chính đang ẩn.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => window::show_main(app),
        RunEvent::Exit => on_exit(app, kill_all),
        _ => {}
    }
}

/// App thoát (`RunEvent::Exit`): lưới an toàn kill tiến trình phụ còn sống (Thoát ở menu khay đã tắt chúng), rồi lưu lịch
/// sử của phiên còn chạy khi app thoát không qua menu khay: tắt máy, đăng xuất, cập nhật (Q3 của review 03). Tách riêng,
/// nhận hàm kill, để test gọi được mà không kill tiến trình của test khác (N-A của review 03 lần 2).
pub(crate) fn on_exit<R: tauri::Runtime>(app: &AppHandle<R>, kill_all: fn()) {
    kill_all();
    session::save_on_exit(app);
}

/// Windows: chỉ nạp DLL từ thư mục hệ thống và thư mục của app, không từ thư mục hiện hành hay `PATH` (chống DLL
/// hijacking, §10.2).
#[cfg(windows)]
fn harden_dll_search() {
    use windows::Win32::System::LibraryLoader::{
        LOAD_LIBRARY_SEARCH_APPLICATION_DIR, LOAD_LIBRARY_SEARCH_SYSTEM32, SetDefaultDllDirectories,
    };
    if let Err(e) =
        unsafe { SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32 | LOAD_LIBRARY_SEARCH_APPLICATION_DIR) }
    {
        log::warn!("không đặt được thư mục tìm DLL: {e}");
    }
}
