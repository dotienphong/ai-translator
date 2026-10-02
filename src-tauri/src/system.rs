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

use tauri::{AppHandle, Manager, Runtime, Url};
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
    /// macOS: System Settings › Privacy & Security, trang quyền ghi âm thanh hệ thống (kế hoạch 02, §4.1 bước 4, §9).
    fn open_audio_permission_settings(&self) -> Result<(), String>;
}

/// macOS: trang "Screen & System Audio Recording" của System Settings, phần "System Audio Recording Only" (quyền mà
/// Core Audio tap cần). Cần người kiểm trên máy thật (kế hoạch 02c, Task 8).
pub const AUDIO_PERMISSION_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture";

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
        let url = https_only(url)?;
        self.0
            .opener()
            .open_url(url.as_str(), None::<&str>)
            .map_err(|e| e.to_string())
    }

    fn open_audio_permission_settings(&self) -> Result<(), String> {
        if !cfg!(target_os = "macos") {
            return Err("chỉ có trên macOS".into());
        }
        self.0
            .opener()
            .open_url(AUDIO_PERMISSION_URL, None::<&str>)
            .map_err(|e| e.to_string())
    }
}

/// Lớp chặn thứ hai sau `navigation`: bản thật chỉ mở URL `https` có tên máy chủ, kể cả khi một lời gọi
/// sau này lỡ bỏ qua bước kiểm của `navigation`. Không ghi URL vào lỗi (có thể chứa tham số riêng tư).
fn https_only(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url).map_err(|_| "URL không hợp lệ".to_string())?;
    if parsed.scheme() != "https" || parsed.host_str().is_none_or(str::is_empty) {
        return Err(format!("chỉ mở URL https, không mở URL {}:", parsed.scheme()));
    }
    Ok(parsed)
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

pub fn open_audio_permission_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    with(app, |s| s.open_audio_permission_settings())
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
        fn open_audio_permission_settings(&self) -> Result<(), String> {
            self.push("open_audio_permission_settings")
        }
    }

    #[test]
    fn native_opener_only_takes_https_urls() {
        assert_eq!(
            https_only("https://pay.payos.vn/web/1?x=2").unwrap().as_str(),
            "https://pay.payos.vn/web/1?x=2"
        );
        for url in [
            "http://pay.payos.vn/",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "ms-settings:taskbar",
            "tauri://localhost/",
            "x-apple.systempreferences:com.apple.LoginItems-Settings.extension",
            "pay.payos.vn/web/1",
            "",
        ] {
            assert!(https_only(url).is_err(), "{url}");
        }
    }

    /// Trang quyền ghi âm thanh hệ thống mở thẳng một hằng cố định của app, không đi qua `https_only` (chỉ cho link
    /// ngoài nhận từ giao diện): kiểm hằng đó đúng là một trang của System Settings, không phải URL lấy từ bên ngoài.
    #[test]
    fn the_audio_permission_page_is_a_fixed_system_settings_url() {
        let url = Url::parse(AUDIO_PERMISSION_URL).unwrap();
        assert_eq!(url.scheme(), "x-apple.systempreferences");
        assert!(url.as_str().ends_with("?Privacy_AudioCapture"));
        assert!(
            https_only(AUDIO_PERMISSION_URL).is_err(),
            "link ngoài không mở được trang này"
        );
    }

    #[test]
    fn nothing_opens_until_an_opener_is_installed() {
        let app = tauri::test::mock_app();
        let app = app.handle();
        assert!(open_log_dir(app).is_err());
        assert!(open_taskbar_settings(app).is_err());
        assert!(open_login_items_settings(app).is_err());
        assert!(open_external_url(app, "https://pay.payos.vn/").is_err());
        assert!(open_audio_permission_settings(app).is_err());
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
        open_audio_permission_settings(app).unwrap();
        assert_eq!(
            *recorder.0.lock().unwrap(),
            [
                "open_log_dir",
                "open_taskbar_settings",
                "open_login_items_settings",
                "open_external_url https://pay.payos.vn/web/1",
                "open_audio_permission_settings",
            ]
        );
    }
}
