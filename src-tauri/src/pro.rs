//! Điểm kiểm tra Pro duy nhất (Đ6 của kế hoạch 00; spec §2 "Pro", F4, F5). Mọi tính năng Pro (xem và lưu lịch sử, xuất
//! bản chép lời ra file, từ điển thuật ngữ) chỉ hỏi qua module này:
//! - [`require`] cho lệnh của giao diện: không phải Pro thì trả lỗi `proRequired`;
//! - [`is_pro`] cho việc chạy ngầm: lưu lịch sử khi phiên dừng, đưa thuật ngữ vào prompt.
//!
//! Kế hoạch 03 chỉ có bản tạm `DevGate`, **chỉ có trong bản debug** (`cfg(debug_assertions)`): luôn là Pro, trừ khi chạy
//! app với biến môi trường `AI_TRANSLATOR_DEV_FREE=1` (để thử bằng tay giao diện khi bị khóa Pro). Bản release không cài
//! gate nào, tức là Free, cho tới khi kế hoạch 06 cài trạng thái bản quyền thật bằng [`install_gate`] (một lần, ở đúng chỗ
//! của [`install_default_gate`]: `app.manage` không thay được state đã có), gọi [`refresh`] mỗi khi trạng thái bản quyền
//! đổi, và thêm kiểm tra ở nhiều chỗ theo §10.2.
//!
//! Chưa cài `ProGate` nào thì coi là Free: quên cài thì khóa tính năng, không mở cho không.
//! Xóa toàn bộ dữ liệu (§4.3, Quyền riêng tư) không đi qua đây: người đã về Free vẫn xóa được lịch sử và từ điển cũ.

use tauri::{AppHandle, Manager, Runtime};

use crate::actions;
use crate::errors::{self, CommandError};
use crate::state::AppState;

/// Biến môi trường của bản tạm: `1` thì app chạy như gói Free. Chỉ bản debug đọc biến này.
#[cfg(debug_assertions)]
pub const DEV_FREE_ENV: &str = "AI_TRANSLATOR_DEV_FREE";

/// Nguồn sự thật "đang có gói trả phí còn hạn" (spec §2). Kế hoạch 06 cài bằng trạng thái bản quyền.
pub trait ProGate: Send + Sync + 'static {
    fn is_pro(&self) -> bool;
}

/// `ProGate` đang dùng, quản lý bằng `app.manage`.
pub struct Entitlement(pub Box<dyn ProGate>);

/// Bản tạm của kế hoạch 03, chỉ có trong bản debug: Pro, trừ khi `AI_TRANSLATOR_DEV_FREE=1`.
#[cfg(debug_assertions)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DevGate {
    pro: bool,
}

#[cfg(debug_assertions)]
impl DevGate {
    /// Theo giá trị của biến `AI_TRANSLATOR_DEV_FREE` (không có thì `None`).
    pub fn from_value(value: Option<&str>) -> Self {
        Self {
            pro: value != Some("1"),
        }
    }

    pub fn from_env() -> Self {
        Self::from_value(std::env::var(DEV_FREE_ENV).ok().as_deref())
    }
}

#[cfg(debug_assertions)]
impl ProGate for DevGate {
    fn is_pro(&self) -> bool {
        self.pro
    }
}

/// Gate lúc khởi động: bản debug là `DevGate`; bản release không có gate nào (Free) cho tới khi kế hoạch 06 cài trạng thái
/// bản quyền thật.
pub fn default_gate() -> Option<Box<dyn ProGate>> {
    #[cfg(debug_assertions)]
    {
        Some(Box::new(DevGate::from_env()))
    }
    #[cfg(not(debug_assertions))]
    {
        None
    }
}

/// Cài [`default_gate`] (nếu có). Gọi một lần ở `setup`, sau khi đã có `AppState`.
pub fn install_default_gate<R: Runtime>(app: &AppHandle<R>) {
    if let Some(gate) = default_gate() {
        install_gate(app, gate);
    }
}

/// Cài `gate` rồi báo trạng thái mới cho giao diện. Gọi ở `setup`, sau khi đã có `AppState`.
pub fn install_gate<R: Runtime>(app: &AppHandle<R>, gate: Box<dyn ProGate>) {
    app.manage(Entitlement(gate));
    refresh(app);
}

/// Đang là Pro không. Chưa cài `ProGate` thì `false`.
pub fn is_pro<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<Entitlement>().is_some_and(|e| e.0.is_pro())
}

/// Cho lệnh Pro đi tiếp, hoặc trả lỗi `proRequired` để giao diện mời nâng cấp.
pub fn require<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    if is_pro(app) {
        Ok(())
    } else {
        Err(CommandError::new(
            errors::PRO_REQUIRED,
            None,
            "tính năng chỉ có ở gói trả phí",
        ))
    }
}

/// Đọc lại `ProGate` vào `AppStatus.pro` và báo giao diện nếu đổi. Kế hoạch 06 gọi sau mỗi lần trạng thái bản quyền đổi.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let pro = is_pro(app);
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if state.status().pro == pro {
        return;
    }
    state.update_status(|s| s.pro = pro);
    actions::status_changed(app);
    // Về Free giữa phiên (06: hết hạn, bị thu hồi): thuật ngữ thôi vào prompt ngay (N11 của review 03). Lên Pro thì
    // không đọc DB ở đây (lúc khởi động không mở DB, QĐ4): phiên sau nạp từ điển lúc bắt đầu.
    if !pro {
        crate::glossary::forget(app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{mock_app, set_pro};

    /// Q1 của review 03 lần 1: bản release không có `DevGate`, nên mặc định là Free. Chạy cả với `--release` ở 03b
    /// Task 7.
    #[test]
    fn the_dev_gate_exists_only_in_debug_builds() {
        assert_eq!(default_gate().is_some(), cfg!(debug_assertions));
        let app = tauri::test::mock_app();
        app.manage(AppState::new(
            crate::settings::Settings::defaults(crate::settings::UiLanguage::Vi),
            crate::settings::migrate::FileMeta::current(),
            false,
        ));
        install_default_gate(app.handle());
        assert_eq!(is_pro(app.handle()), cfg!(debug_assertions));
        assert_eq!(app.state::<AppState>().status().pro, cfg!(debug_assertions));
    }

    #[cfg(debug_assertions)]
    #[test]
    fn the_dev_gate_is_pro_unless_asked_to_be_free() {
        assert!(DevGate::from_value(None).is_pro());
        assert!(DevGate::from_value(Some("0")).is_pro());
        assert!(DevGate::from_value(Some("")).is_pro());
        assert!(!DevGate::from_value(Some("1")).is_pro());
    }

    #[test]
    fn without_a_gate_the_app_is_free() {
        let app = tauri::test::mock_app();
        assert!(!is_pro(app.handle()));
        let e = require(app.handle()).unwrap_err();
        assert_eq!(e.code, errors::PRO_REQUIRED);
    }

    #[test]
    fn require_follows_the_gate_and_the_status_follows_refresh() {
        let app = mock_app();
        let state = app.state::<AppState>();
        assert!(require(app.handle()).is_ok());
        assert!(state.status().pro, "app giả mặc định là Pro");
        let rev = state.status().rev;
        set_pro(&app, false);
        assert_eq!(require(app.handle()).unwrap_err().code, errors::PRO_REQUIRED);
        assert!(!state.status().pro);
        assert!(state.status().rev > rev, "đổi gói thì giao diện nhận trạng thái mới");
        let rev = state.status().rev;
        refresh(app.handle());
        assert_eq!(state.status().rev, rev, "không đổi thì không báo lại");
    }
}
