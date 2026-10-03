//! Nối [`License`] vào app (spec §6.8, §4.2 bước 2): điểm kiểm tra Pro thật (`pro::ProGate`, thay `DevGate` của kế hoạch
//! 03 ở bản phát hành), kiểm hạn mức trước khi bắt đầu phiên, đếm phút từ `EventSink::usage`, lịch `validate` chạy nền,
//! và báo giao diện.
//!
//! - Giao diện nhận [`LicenseView`] qua sự kiện `license://changed` (chỉ cửa sổ chính) và lệnh `get_license`. View
//!   không có key đầy đủ hay token (01 QĐ6).
//! - `AppStatus.quota_warning` (còn từ 5 phút trở xuống) và `AppStatus.quota_reset_at` đi cùng `app://status`, để thanh
//!   phụ đề nhắc mà không cần lệnh mới.
//! - Bản debug không đặt `AI_TRANSLATOR_DEV_FREE=1` thì chạy Pro không giới hạn (`DevGate`, kế hoạch 03); đặt biến này
//!   thì dùng trạng thái bản quyền thật, như bản phát hành.

use std::ops::ControlFlow;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};

use super::client::HttpApi;
use super::device;
use super::keys::PublicKeys;
use super::manager::{License, LicenseView, Machine, Zone};
use super::store::Vault;
use crate::errors::{self, CommandError};
use crate::pro::{self, ProGate};
use crate::security::keystore::Keystore;
use crate::state::AppState;
use crate::{actions, window};

pub const LICENSE_CHANGED: &str = "license://changed";
/// Ticker của bản quyền: cộng thời gian đơn điệu, reset Free, gọi `validate` khi tới lịch.
const TICK_EVERY: Duration = Duration::from_secs(60);

/// [`License`] của app, quản lý bằng `app.manage`.
pub struct Licensing(pub Arc<License>);

/// `ProGate` theo trạng thái bản quyền thật.
struct LicenseGate(Arc<License>);

impl ProGate for LicenseGate {
    fn is_pro(&self) -> bool {
        self.0.is_pro(now())
    }
}

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64)
}

/// Kho khóa không mở được: mọi lần đọc ghi đều lỗi, nên luật hạn mức áp luật chặt.
struct NoVault(String);

impl Vault for NoVault {
    fn get(&self, _: &str) -> Result<Option<Vec<u8>>, String> {
        Err(self.0.clone())
    }
    fn set(&self, _: &str, _: &[u8]) -> Result<(), String> {
        Err(self.0.clone())
    }
    fn delete(&self, _: &str) -> Result<(), String> {
        Err(self.0.clone())
    }
}

/// Cài bản quyền thật lúc khởi động. `has_prior_data`: file cài đặt đã có từ trước (không phải lần đầu chạy app).
pub fn install<R: Runtime>(app: &AppHandle<R>, has_prior_data: bool) {
    let api = HttpApi::for_this_build();
    let configured = api.configured();
    let vault: Box<dyn Vault> = match Keystore::os(&app.config().identifier) {
        Ok(ks) => Box::new(ks),
        Err(e) => {
            log::error!("không mở được kho khóa cho bản quyền: {e}");
            Box::new(NoVault(e.to_string()))
        }
    };
    let machine = Machine {
        id_hash: device::hardware_id()
            .map(|id| device::hash_id(&id))
            .unwrap_or_else(|e| {
                log::error!("không đọc được ID máy: {e}");
                String::new()
            }),
        label: device::label(),
    };
    let dev = pro::dev_override();
    let license = License::new(
        Box::new(api),
        vault,
        PublicKeys::embedded(),
        machine,
        Zone::Local,
        configured,
        dev,
        has_prior_data,
        now(),
    );
    install_with(app, license);
    spawn_ticker(app);
}

/// Cài một [`License`] đã dựng (test dùng server và kho khóa giả). Không chạy ticker.
pub fn install_with<R: Runtime>(app: &AppHandle<R>, license: License) {
    let license = Arc::new(license);
    app.manage(Licensing(license.clone()));
    if license.dev_unlimited() {
        pro::install_dev_gate(app);
    } else {
        pro::install_gate(app, Box::new(LicenseGate(license)));
    }
    refresh(app);
}

fn licensing<R: Runtime>(app: &AppHandle<R>) -> Option<Arc<License>> {
    app.try_state::<Licensing>().map(|l| l.0.clone())
}

/// Trạng thái bản quyền hiện tại.
pub fn view<R: Runtime>(app: &AppHandle<R>) -> Option<LicenseView> {
    licensing(app).map(|l| l.view(now()))
}

/// Đọc lại trạng thái bản quyền: Pro (`pro::refresh`), các trường hạn mức của `AppStatus`, và sự kiện cho cửa sổ chính.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let Some(license) = licensing(app) else {
        return;
    };
    let t = now();
    let view = license.view(t);
    pro::refresh(app);
    if let Some(state) = app.try_state::<AppState>() {
        let reset_at = (!view.quota.unlimited).then_some(view.quota.reset_at).flatten();
        let warning = !view.quota.unlimited
            && view.quota.remaining_ms > 0
            && view.quota.remaining_ms <= super::quota::WARN_REMAINING_MS;
        let changed = state.update_status(|s| {
            let changed = s.quota_reset_at != reset_at || s.quota_warning != warning;
            s.quota_reset_at = reset_at;
            s.quota_warning = warning;
            changed
        });
        if changed {
            actions::status_changed(app);
        }
    }
    let _ = app.emit_to(EventTarget::webview_window(window::MAIN), LICENSE_CHANGED, &view);
}

/// Trước khi bắt đầu phiên: hạn mức còn 0 thì từ chối với `quotaExhausted` (§6.8, "Khi chạm hạn mức").
pub fn check_start<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    match licensing(app) {
        Some(l) if !l.can_start(now()) => Err(CommandError::new(errors::QUOTA_EXHAUSTED, None, "hạn mức còn 0")),
        _ => Ok(()),
    }
}

/// Phút vừa dịch xong (`EventSink::usage`). `Break` khi đã chạm hạn mức.
pub fn add_usage<R: Runtime>(app: &AppHandle<R>, speech_ms: u64) -> ControlFlow<()> {
    let Some(license) = licensing(app) else {
        return ControlFlow::Continue(());
    };
    let t = now();
    let flow = license.add_usage(speech_ms, t);
    if license.take_warning(t) || flow.is_break() {
        refresh(app);
    }
    flow
}

/// Gọi `validate` nếu tới lịch, rồi báo giao diện. Chạy trên luồng nền.
pub fn validate_if_due<R: Runtime>(app: &AppHandle<R>) {
    let Some(license) = licensing(app) else {
        return;
    };
    let t = now();
    if license.validate_due(t) {
        if let Err(e) = license.validate(t) {
            log::info!("validate chưa được: {}", e.code());
        }
        refresh(app);
    }
}

fn spawn_ticker<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        // Lúc khởi động: kiểm ngay (§6.8, "Kiểm tra định kỳ").
        validate_if_due(&app);
        let mut last = Instant::now();
        loop {
            std::thread::sleep(TICK_EVERY);
            let elapsed = last.elapsed();
            last = Instant::now();
            if let Some(license) = licensing(&app) {
                let t = now();
                license.tick(t, elapsed.as_millis() as u64);
                license.refresh_clock(t);
            }
            validate_if_due(&app);
            refresh(&app);
        }
    });
}
