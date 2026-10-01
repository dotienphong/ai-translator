//! Trạng thái thật của "khởi động cùng hệ thống" (Đ19, QĐ16 và QĐ29 của kế hoạch 01).
//!
//! macOS: `tauri-plugin-autostart` 2.7.0 (`auto-launch` 0.6.0) ghi một LaunchAgent ở
//! `~/Library/LaunchAgents/<tên>.plist`, với `Label` cũng là `<tên>`; app đặt `<tên>` là bundle
//! identifier (`autostart_name`, QĐ29). `is_enabled()` chỉ xem file đó có tồn tại không. Người dùng tắt
//! app ở System Settings › General › Login Items thì file vẫn còn, nhưng launchd không chạy nó nữa. Vì
//! vậy app hỏi thêm `SMAppService statusForLegacyURL:` (macOS 13+): chỉ coi là bật khi trạng thái là
//! `Enabled`. Người dùng bật lại trong app mà mục vẫn bị tắt ở Login Items thì hệ thống báo
//! `RequiresApproval`; app hiện lời nhắc kèm nút mở đúng trang đó của System Settings
//! (`system::open_login_items_settings`).
//!
//! Windows: `auto-launch` 0.6.0 đọc cả giá trị trong `...\CurrentVersion\Run` lẫn khóa
//! `Explorer\StartupApproved\Run` mà Task Manager ghi khi người dùng tắt mục khởi động, ở cả `HKLM` và
//! `HKCU`, nên `is_enabled()` đã là trạng thái thật. `enable()` ghi `HKLM` trước (mọi người dùng), chỉ
//! khi không có quyền mới ghi `HKCU`; `disable()` xóa cả hai, nhưng không có quyền admin thì mục ở
//! `HKLM` còn nguyên. Vì vậy sau khi tắt, app hỏi lại và báo lỗi nếu vẫn còn bật.
//!
//! Việc bật/tắt và hỏi trạng thái đi qua trait `LoginItem`, để test dùng bản giả
//! (`test_support::FakeLoginItem`) mà không đụng LaunchAgent, Login Items hay registry thật.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt as _;

/// Tên mục khởi động cùng hệ thống mà app đăng ký (QĐ29). macOS: bundle identifier, dùng cho cả tên
/// file LaunchAgent lẫn `Label` (không có dấu cách, đúng kiểu reverse-DNS của launchd). Windows: tên sản
/// phẩm, là tên giá trị trong `Run` (mặc định của plugin).
pub fn autostart_name<'a>(identifier: &'a str, product_name: &'a str) -> &'a str {
    if cfg!(target_os = "macos") {
        identifier
    } else {
        product_name
    }
}

/// Đường dẫn LaunchAgent mà `auto-launch` (dùng bởi `tauri-plugin-autostart`) tạo cho app.
pub fn launch_agent_path(home: &Path, app_name: &str) -> PathBuf {
    home.join("Library/LaunchAgents").join(format!("{app_name}.plist"))
}

/// Trạng thái hệ thống báo cho một LaunchAgent cũ (không đăng ký qua `SMAppService`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgentStatus {
    Enabled,
    /// Người dùng đã tắt ở Login Items, hoặc chưa cho phép.
    RequiresApproval,
    NotRegistered,
    NotFound,
    Unknown(isize),
}

impl AgentStatus {
    pub fn from_raw(raw: isize) -> Self {
        match raw {
            0 => Self::NotRegistered,
            1 => Self::Enabled,
            2 => Self::RequiresApproval,
            3 => Self::NotFound,
            other => Self::Unknown(other),
        }
    }
}

/// Có đang khởi động cùng hệ thống thật không: plugin báo đã đăng ký, và (trên macOS) hệ thống báo
/// `Enabled`. Không đọc được trạng thái của hệ thống thì tin plugin.
pub fn effective(registered: bool, status: Option<AgentStatus>) -> bool {
    registered && status.is_none_or(|s| s == AgentStatus::Enabled)
}

/// Vừa bật trong app mà hệ thống vẫn báo cần cho phép: mục đang bị tắt ở Login Items, phải nhắc người
/// dùng bật lại ở System Settings (app không tự bật được).
pub fn needs_approval(status: Option<AgentStatus>) -> bool {
    status == Some(AgentStatus::RequiresApproval)
}

/// Hỏi hệ thống trạng thái của LaunchAgent ở `plist`. Không bật hộp thoại nào.
#[cfg(target_os = "macos")]
pub fn agent_status(plist: &Path) -> Option<AgentStatus> {
    use objc2_foundation::{NSString, NSURL};
    use objc2_service_management::SMAppService;
    let path = NSString::from_str(plist.to_str()?);
    let url = NSURL::fileURLWithPath(&path);
    // SAFETY: phương thức lớp, chỉ đọc; có từ macOS 13, app yêu cầu 14.2 trở lên (spec D3).
    let status = unsafe { SMAppService::statusForLegacyURL(&url) };
    Some(AgentStatus::from_raw(status.0))
}

#[cfg(not(target_os = "macos"))]
pub fn agent_status(_plist: &Path) -> Option<AgentStatus> {
    None
}

/// Bật/tắt và đọc trạng thái "khởi động cùng hệ thống". Bản thật dùng `tauri-plugin-autostart` và
/// `SMAppService`; test dùng bản giả.
pub trait LoginItem: Send + Sync + 'static {
    fn enable(&self) -> Result<(), String>;
    fn disable(&self) -> Result<(), String>;
    /// Plugin báo đã đăng ký chưa (macOS: có file LaunchAgent; Windows: có giá trị trong `Run` và Task
    /// Manager không tắt).
    fn is_registered(&self) -> Result<bool, String>;
    /// macOS: trạng thái hệ thống báo cho LaunchAgent của app; `None` trên Windows hay khi không đọc được.
    fn system_status(&self) -> Option<AgentStatus>;
}

/// `LoginItem` đang dùng, quản lý bằng `app.manage`.
pub struct LoginItems(pub Box<dyn LoginItem>);

struct Native<R: Runtime>(AppHandle<R>);

impl<R: Runtime> LoginItem for Native<R> {
    fn enable(&self) -> Result<(), String> {
        self.0.autolaunch().enable().map_err(|e| e.to_string())
    }

    fn disable(&self) -> Result<(), String> {
        self.0.autolaunch().disable().map_err(|e| e.to_string())
    }

    fn is_registered(&self) -> Result<bool, String> {
        self.0.autolaunch().is_enabled().map_err(|e| e.to_string())
    }

    fn system_status(&self) -> Option<AgentStatus> {
        let home = self.0.path().home_dir().ok()?;
        let name = autostart_name(&self.0.config().identifier, &self.0.package_info().name);
        agent_status(&launch_agent_path(&home, name))
    }
}

/// Cài bản thật. Gọi một lần ở đầu `setup`.
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    app.manage(LoginItems(Box::new(Native(app.clone()))));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_agent_is_named_after_the_bundle_identifier() {
        let name = autostart_name("com.aitranslator.desktop", "AI Translator");
        if cfg!(target_os = "macos") {
            assert_eq!(name, "com.aitranslator.desktop");
            assert_eq!(
                launch_agent_path(Path::new("/Users/a"), name),
                PathBuf::from("/Users/a/Library/LaunchAgents/com.aitranslator.desktop.plist")
            );
        } else {
            assert_eq!(name, "AI Translator", "Windows: tên giá trị trong `Run`");
        }
    }

    #[test]
    fn only_enabled_status_counts() {
        assert!(effective(true, Some(AgentStatus::Enabled)));
        assert!(effective(true, None), "không đọc được trạng thái thì tin plugin");
        assert!(
            !effective(true, Some(AgentStatus::RequiresApproval)),
            "đã tắt ở Login Items"
        );
        assert!(!effective(true, Some(AgentStatus::NotFound)));
        assert!(!effective(false, Some(AgentStatus::Enabled)), "plugin chưa đăng ký");
        assert_eq!(AgentStatus::from_raw(7), AgentStatus::Unknown(7));
        assert!(!effective(true, Some(AgentStatus::Unknown(7))));
    }

    #[test]
    fn approval_is_needed_only_when_the_system_asks_for_it() {
        assert!(needs_approval(Some(AgentStatus::RequiresApproval)));
        for status in [
            None,
            Some(AgentStatus::Enabled),
            Some(AgentStatus::NotRegistered),
            Some(AgentStatus::NotFound),
            Some(AgentStatus::Unknown(7)),
        ] {
            assert!(!needs_approval(status), "{status:?}");
        }
    }

    /// Bảng giá trị của `SMAppServiceStatus` trong SDK (SMAppService.h).
    #[test]
    #[cfg(target_os = "macos")]
    fn from_raw_matches_sm_app_service_status() {
        use objc2_service_management::SMAppServiceStatus;
        for (raw, expected) in [
            (SMAppServiceStatus::NotRegistered, AgentStatus::NotRegistered),
            (SMAppServiceStatus::Enabled, AgentStatus::Enabled),
            (SMAppServiceStatus::RequiresApproval, AgentStatus::RequiresApproval),
            (SMAppServiceStatus::NotFound, AgentStatus::NotFound),
        ] {
            assert_eq!(AgentStatus::from_raw(raw.0), expected, "{}", raw.0);
        }
        assert_eq!(AgentStatus::from_raw(-1), AgentStatus::Unknown(-1));
    }

    /// Chạy tay: `cargo test -p meeting-translator --lib login_item -- --ignored --nocapture`.
    /// Chỉ đọc trạng thái, không đăng ký gì, không bật hộp thoại.
    #[test]
    #[ignore = "hỏi dịch vụ Background Task Management của macOS"]
    #[cfg(target_os = "macos")]
    fn system_reports_missing_agent() {
        let status = agent_status(Path::new("/tmp/com.aitranslator.desktop.khong-co.plist"));
        println!("{status:?}");
        assert!(matches!(
            status,
            Some(AgentStatus::NotFound | AgentStatus::NotRegistered)
        ));
    }
}
