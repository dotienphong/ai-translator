//! Mọi việc app mở ra ngoài chính nó: thư mục log trong Finder/Explorer, trang của System Settings
//! hay Settings của Windows, link ngoài trong trình duyệt (QĐ28 của kế hoạch 01).
//!
//! Tất cả đi qua trait `SystemOpener`, quản lý bằng `app.manage(System(..))`:
//! - app thật cài bản thật ở `setup` (`install`);
//! - app giả của test cài bản giả ghi lại từng lần gọi (`test_support::FakeSystem`). Vì vậy kể cả khi
//!   ACL lỡ cấp thừa một lệnh, test chạy tới handler cũng không mở gì trên màn hình người dùng.
//! - Chưa cài thì mọi lời gọi trả lỗi, không mở gì.
//!
//! Kế hoạch sau thêm việc mở ra ngoài (ví dụ 02: trang quyền ghi âm thanh của System Settings) thì thêm
//! một phương thức vào trait này, không gọi `tauri-plugin-opener` hay API hệ thống ở chỗ khác.

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt as _;

pub trait SystemOpener: Send + Sync + 'static {
    /// Mở thư mục log bằng trình quản lý file (tạo thư mục nếu chưa có).
    fn open_log_dir(&self) -> Result<(), String>;
    /// Windows: Settings › Personalization › Taskbar.
    fn open_taskbar_settings(&self) -> Result<(), String>;
    /// macOS: System Settings › General › Login Items.
    fn open_login_items_settings(&self) -> Result<(), String>;
    /// Mở một URL mà `navigation` đã cho phép bằng trình duyệt của hệ thống.
    fn open_external_url(&self, url: &str) -> Result<(), String>;
}

/// `SystemOpener` đang dùng.
pub struct System(pub Box<dyn SystemOpener>);

struct Native<R: Runtime>(AppHandle<R>);

impl<R: Runtime> SystemOpener for Native<R> {
    fn open_log_dir(&self) -> Result<(), String> {
        let dir = self.0.path().app_log_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        self.0
            .opener()
            .open_path(dir.to_string_lossy(), None::<&str>)
            .map_err(|e| e.to_string())
    }

    fn open_taskbar_settings(&self) -> Result<(), String> {
        if !cfg!(windows) {
            return Err("chỉ có trên Windows".into());
        }
        self.0
            .opener()
            .open_url("ms-settings:taskbar", None::<&str>)
            .map_err(|e| e.to_string())
    }

    fn open_login_items_settings(&self) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            use objc2_service_management::SMAppService;
            // SAFETY: phương thức lớp, không tham số; có từ macOS 13, app yêu cầu 14.2 trở lên (spec D3).
            unsafe { SMAppService::openSystemSettingsLoginItems() };
            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        Err("chỉ có trên macOS".into())
    }

    fn open_external_url(&self, url: &str) -> Result<(), String> {
        self.0.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
}

/// Cài bản thật. Gọi một lần ở đầu `setup`, trước khi tạo cửa sổ.
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    app.manage(System(Box::new(Native(app.clone()))));
}

fn with<R: Runtime>(
    app: &AppHandle<R>,
    call: impl FnOnce(&dyn SystemOpener) -> Result<(), String>,
) -> Result<(), String> {
    match app.try_state::<System>() {
        Some(system) => call(system.0.as_ref()),
        None => Err("chưa cài SystemOpener".into()),
    }
}

pub fn open_log_dir<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    with(app, |s| s.open_log_dir())
}

pub fn open_taskbar_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    with(app, |s| s.open_taskbar_settings())
}

pub fn open_login_items_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    with(app, |s| s.open_login_items_settings())
}

pub fn open_external_url<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<(), String> {
    with(app, |s| s.open_external_url(url))
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;

    #[derive(Clone, Default)]
    struct Recorder(Arc<Mutex<Vec<String>>>);

    impl Recorder {
        fn push(&self, call: &str) -> Result<(), String> {
            self.0.lock().unwrap().push(call.into());
            Ok(())
        }
    }

    impl SystemOpener for Recorder {
        fn open_log_dir(&self) -> Result<(), String> {
            self.push("open_log_dir")
        }
        fn open_taskbar_settings(&self) -> Result<(), String> {
            self.push("open_taskbar_settings")
        }
        fn open_login_items_settings(&self) -> Result<(), String> {
            self.push("open_login_items_settings")
        }
        fn open_external_url(&self, url: &str) -> Result<(), String> {
            self.push(&format!("open_external_url {url}"))
        }
    }

    #[test]
    fn nothing_opens_until_an_opener_is_installed() {
        let app = tauri::test::mock_app();
        let app = app.handle();
        assert!(open_log_dir(app).is_err());
        assert!(open_taskbar_settings(app).is_err());
        assert!(open_login_items_settings(app).is_err());
        assert!(open_external_url(app, "https://pay.payos.vn/").is_err());
    }

    #[test]
    fn calls_go_to_the_installed_opener() {
        let app = tauri::test::mock_app();
        let recorder = Recorder::default();
        app.manage(System(Box::new(recorder.clone())));
        let app = app.handle();
        open_log_dir(app).unwrap();
        open_taskbar_settings(app).unwrap();
        open_login_items_settings(app).unwrap();
        open_external_url(app, "https://pay.payos.vn/web/1").unwrap();
        assert_eq!(
            *recorder.0.lock().unwrap(),
            [
                "open_log_dir",
                "open_taskbar_settings",
                "open_login_items_settings",
                "open_external_url https://pay.payos.vn/web/1",
            ]
        );
    }
}
