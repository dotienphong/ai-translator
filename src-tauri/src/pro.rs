//! Điểm kiểm tra Pro duy nhất (Đ6 của kế hoạch 00; spec §2 "Pro", F4, F5). Mọi tính năng Pro (xem và lưu lịch sử, xuất
//! bản chép lời ra file, từ điển thuật ngữ) chỉ hỏi qua module này:
//! - [`require`] cho lệnh của giao diện: không phải Pro thì trả lỗi `proRequired`;
//! - [`is_pro`] cho việc chạy ngầm: lưu lịch sử khi phiên dừng, đưa thuật ngữ vào prompt.
//!
//! Mặc định mọi bản build đi đường thật: Free cho tới khi có token bản quyền thật (`license::app::install` cài
//! `LicenseGate` bằng [`install_gate`] một lần; `app.manage` không thay được state đã có), và [`refresh`] chạy mỗi khi
//! trạng thái bản quyền đổi. Riêng **bản debug** có công tắc dev (spec 2026-10-04, §2.2): đặt biến môi trường
//! `AI_TRANSLATOR_DEV_PRO` đúng bằng `true` thì cài `DevGate`, Pro không giới hạn, vẫn nối production cho mọi thứ khác.
//! Mã đọc công tắc nằm sau `cfg(debug_assertions)`: bản phát hành không có code đó và không có cả chuỗi tên biến
//! (`release-check.mjs no-dev-gate` chặn nếu nó lọt vào, spec §3).
//!
//! Chưa cài `ProGate` nào thì coi là Free: quên cài thì khóa tính năng, không mở cho không.
//! Xóa toàn bộ dữ liệu (§4.3, Quyền riêng tư) không đi qua đây: người đã về Free vẫn xóa được lịch sử và từ điển cũ.

use tauri::{AppHandle, Manager, Runtime};

use crate::actions;
use crate::errors::{self, CommandError};
use crate::state::AppState;

/// Biến môi trường của công tắc dev: đúng `true` thì bản debug chạy như Pro không giới hạn. Chỉ bản debug có biến này.
#[cfg(debug_assertions)]
pub const DEV_PRO_ENV: &str = "AI_TRANSLATOR_DEV_PRO";

/// Chuỗi chim hoàng yến, nằm trong lời cảnh báo của `license::app::install`: chỉ có trong bản debug. Binary bản phát hành
/// mà có chuỗi này là mã dev đã lọt vào (`release-check.mjs no-dev-gate`).
#[cfg(debug_assertions)]
pub const DEV_GATE_CANARY: &str = "mt-dev-pro-gate-v1";

/// Nguồn sự thật "đang có gói trả phí còn hạn" (spec §2). Kế hoạch 06 cài bằng trạng thái bản quyền.
pub trait ProGate: Send + Sync + 'static {
    fn is_pro(&self) -> bool;
}

/// `ProGate` đang dùng, quản lý bằng `app.manage`.
pub struct Entitlement(pub Box<dyn ProGate>);

/// Công tắc dev bật khi nào: chỉ giá trị đúng `true` (phân biệt hoa thường). `1`, `TRUE`, `yes`, chuỗi rỗng, có khoảng
/// trắng thừa, hay không đặt biến đều là tắt.
#[cfg(debug_assertions)]
fn switch_on(value: Option<&str>) -> bool {
    value == Some("true")
}

/// Cổng Pro của bản debug khi công tắc dev bật: luôn là Pro.
#[cfg(debug_assertions)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DevGate;

#[cfg(debug_assertions)]
impl ProGate for DevGate {
    fn is_pro(&self) -> bool {
        true
    }
}

/// Gate dựng sẵn lúc khởi động: chỉ bản debug có công tắc dev bật mới có `DevGate`; còn lại không có gate nào (Free) cho
/// tới khi `license::app::install` cài trạng thái bản quyền thật.
pub fn default_gate() -> Option<Box<dyn ProGate>> {
    #[cfg(debug_assertions)]
    {
        dev_override().then(|| Box::new(DevGate) as Box<dyn ProGate>)
    }
    #[cfg(not(debug_assertions))]
    {
        None
    }
}

/// Công tắc dev đang bật: chỉ bản debug có `AI_TRANSLATOR_DEV_PRO=true`. Bản phát hành luôn `false`.
/// `license::app::install` dùng để chọn gate và bỏ hạn mức.
pub fn dev_override() -> bool {
    #[cfg(debug_assertions)]
    {
        switch_on(std::env::var(DEV_PRO_ENV).ok().as_deref())
    }
    #[cfg(not(debug_assertions))]
    {
        false
    }
}

/// Cài `DevGate` Pro (chỉ bản debug, khi [`dev_override`]). Bản phát hành không làm gì: không có `DevGate`.
pub fn install_dev_gate<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(debug_assertions)]
    install_gate(app, Box::new(DevGate));
    #[cfg(not(debug_assertions))]
    let _ = app;
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

    /// Bản phát hành không có `DevGate`, nên mặc định là Free; bản debug chỉ có khi công tắc dev bật (spec 2026-10-04,
    /// §2.2). Chạy cả với `--release` (CI: "Test bản quyền ở bản release").
    #[test]
    fn the_dev_gate_exists_only_in_a_debug_build_with_the_switch_on() {
        assert_eq!(default_gate().is_some(), dev_override());
        let app = tauri::test::mock_app();
        app.manage(AppState::new(
            crate::settings::Settings::defaults(crate::settings::UiLanguage::Vi),
            crate::settings::migrate::FileMeta::current(),
            false,
        ));
        install_default_gate(app.handle());
        assert_eq!(is_pro(app.handle()), dev_override());
        assert_eq!(app.state::<AppState>().status().pro, dev_override());
    }

    /// Bản phát hành không bao giờ chạy Pro không giới hạn nhờ biến môi trường (QĐ17 của 06); bản debug chỉ khi
    /// `AI_TRANSLATOR_DEV_PRO=true`. Chạy cả với `--release`.
    #[test]
    fn only_a_debug_build_with_the_switch_on_runs_unlimited() {
        let on = std::env::var("AI_TRANSLATOR_DEV_PRO").as_deref() == Ok("true");
        assert_eq!(dev_override(), cfg!(debug_assertions) && on);
    }

    #[cfg(debug_assertions)]
    #[test]
    fn the_switch_is_on_only_for_the_exact_value_true() {
        assert!(switch_on(Some("true")));
        for value in [
            None,
            Some(""),
            Some("1"),
            Some("TRUE"),
            Some("True"),
            Some("yes"),
            Some(" true"),
            Some("true "),
        ] {
            assert!(!switch_on(value), "{value:?}");
        }
        assert!(DevGate.is_pro());
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
