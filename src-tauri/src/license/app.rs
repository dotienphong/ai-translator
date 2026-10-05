//! Nối [`License`] vào app (spec §6.8, §4.2 bước 2): điểm kiểm tra Pro thật (`pro::ProGate`, thay `DevGate`
//! ở bản phát hành), kiểm hạn mức trước khi bắt đầu phiên, đếm phút từ `EventSink::usage`, lịch `validate` chạy nền,
//! và báo giao diện.
//!
//! - Giao diện nhận [`LicenseView`] qua sự kiện `license://changed` (chỉ cửa sổ chính) và lệnh `get_license`. View
//!   không có key đầy đủ hay token (01 QĐ6).
//! - `AppStatus.quota_warning` (còn từ 5 phút trở xuống) và `AppStatus.quota_reset_at` đi cùng `app://status`, để thanh
//!   phụ đề nhắc mà không cần lệnh mới.
//! - Mặc định, kể cả bản debug, dùng trạng thái bản quyền thật. Riêng bản debug đặt `AI_TRANSLATOR_DEV_PRO=true` thì chạy
//!   Pro không giới hạn (`DevGate`, `pro.rs`), vẫn nối production cho mọi thứ khác.

use std::ops::ControlFlow;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};

use super::client::{Device, HttpApi, PlanOffer};
use super::device;
use super::keys::PublicKeys;
use super::manager::{License, LicenseError, LicenseView, Machine, Zone};
use super::purchase::{self, CheckoutView, OrderOutcome};
use super::store::Vault;
use crate::errors::{self, CommandError};
use crate::pro::{self, ProGate};
use crate::security::keystore::Keystore;
use crate::state::AppState;
use crate::{actions, navigation, window};

pub const LICENSE_CHANGED: &str = "license://changed";
/// Kết quả mỗi lần hỏi đơn đang chờ ([`OrderOutcome`]), cho màn hình Nâng cấp.
pub const ORDER_CHANGED: &str = "license://order";
/// Ticker của bản quyền: cộng thời gian đơn điệu, reset Free, gọi `validate` khi tới lịch.
const TICK_EVERY: Duration = Duration::from_secs(60);

/// [`License`] của app, quản lý bằng `app.manage`.
pub struct Licensing(pub Arc<License>, AtomicBool);

impl Licensing {
    pub fn new(license: Arc<License>) -> Self {
        Self(license, AtomicBool::new(false))
    }
}

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
    #[cfg(debug_assertions)]
    if dev {
        log::warn!(
            "{}: bản debug giả lập Pro không giới hạn ({}=true); không dùng để đo hạn mức hay thử luồng mua",
            pro::DEV_GATE_CANARY,
            pro::DEV_PRO_ENV
        );
    }
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
    // Đơn còn chờ từ lần chạy trước (§6.8 bước 5): hỏi tiếp.
    spawn_order_poller(app);
}

/// Cài một [`License`] đã dựng (test dùng server và kho khóa giả). Không chạy ticker.
pub fn install_with<R: Runtime>(app: &AppHandle<R>, license: License) {
    let license = Arc::new(license);
    app.manage(Licensing::new(license.clone()));
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
        // Kiểm chữ ký của bản cài trước (§10.2); không chính hãng thì chỉ chạy Free.
        let genuine = super::genuine::check_this_build(&app.config().identifier);
        if let super::genuine::Genuineness::NotGenuine(why) = &genuine {
            log::error!("bản cài không chính hãng: {why}");
        }
        if let Some(license) = licensing(&app) {
            license.set_genuine(!matches!(genuine, super::genuine::Genuineness::NotGenuine(_)));
        }
        refresh(&app);
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

fn command_error(e: LicenseError) -> CommandError {
    CommandError::new(e.code(), None, e.to_string())
}

fn license_or_error<R: Runtime>(app: &AppHandle<R>) -> Result<Arc<License>, CommandError> {
    licensing(app).ok_or_else(|| command_error(LicenseError::NotConfigured))
}

/// Kết quả của lệnh kích hoạt: thành công, hay key đã đủ 2 máy (giao diện hiện danh sách để gỡ một máy).
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateOutcome {
    pub view: Option<LicenseView>,
    pub devices: Option<Vec<Device>>,
}

pub fn activate<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<ActivateOutcome, CommandError> {
    let license = license_or_error(app)?;
    let result = license.activate(key, now());
    refresh(app);
    match result {
        Ok(()) => Ok(ActivateOutcome {
            view: Some(license.view(now())),
            devices: None,
        }),
        Err(LicenseError::DeviceLimit(devices)) => Ok(ActivateOutcome {
            view: None,
            devices: Some(devices),
        }),
        Err(e) => Err(command_error(e)),
    }
}

pub fn deactivate<R: Runtime>(app: &AppHandle<R>) -> Result<Option<LicenseView>, CommandError> {
    let license = license_or_error(app)?;
    let result = license.deactivate(None);
    refresh(app);
    result.map(|()| Some(license.view(now()))).map_err(command_error)
}

pub fn deactivate_other<R: Runtime>(app: &AppHandle<R>, key: &str, activation_id: &str) -> Result<(), CommandError> {
    license_or_error(app)?
        .deactivate(Some((key, activation_id)))
        .map_err(command_error)
}

pub fn validate_now<R: Runtime>(app: &AppHandle<R>) -> Result<Option<LicenseView>, CommandError> {
    let license = license_or_error(app)?;
    let result = license.validate(now());
    refresh(app);
    result.map(|()| Some(license.view(now()))).map_err(command_error)
}

pub fn plans<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<PlanOffer>, CommandError> {
    purchase::plans(&*license_or_error(app)?).map_err(command_error)
}

pub fn start_checkout<R: Runtime>(
    app: &AppHandle<R>,
    plan: &str,
    email: &str,
    consent: bool,
    renew: bool,
) -> Result<CheckoutView, CommandError> {
    let view = purchase::start(&*license_or_error(app)?, plan, email, consent, renew).map_err(command_error)?;
    spawn_order_poller(app);
    Ok(view)
}

/// Đơn đang chờ, vẽ lại mã QR (mở lại màn hình Nâng cấp hay mở lại app).
pub fn pending_order<R: Runtime>(app: &AppHandle<R>) -> Option<CheckoutView> {
    let order = purchase::pending(&*licensing(app)?)?;
    Some(CheckoutView {
        order_code: order.order_code,
        plan: order.plan,
        amount: 0,
        currency: String::new(),
        expires_at: order.expires_at,
        qr_svg: purchase::qr_svg(&order.qr_code).ok()?,
        license_expires_at: None,
        converted_days: None,
    })
}

pub fn cancel_checkout<R: Runtime>(app: &AppHandle<R>) {
    if let Some(license) = licensing(app) {
        purchase::forget(&license);
    }
}

pub fn open_checkout_page<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    let order = licensing(app)
        .and_then(|l| purchase::pending(&l))
        .ok_or_else(|| CommandError::new(errors::OPEN_FAILED, None, "không có đơn đang chờ"))?;
    navigation::open_external(app, &order.checkout_url).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
}

pub fn recover<R: Runtime>(app: &AppHandle<R>, email: &str) -> Result<(), CommandError> {
    let license = license_or_error(app)?;
    let reply = license.api().recover(email.trim());
    license.observe_reply(&reply);
    reply.result.map_err(|e| command_error(super::manager::map_api(e)))
}

/// Hỏi đơn đang chờ mỗi 3 giây tới khi có kết quả cuối (§6.8 bước 4). Chỉ một luồng hỏi mỗi lúc.
pub fn spawn_order_poller<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<Licensing>() else {
        return;
    };
    if state.1.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        loop {
            let Some(license) = licensing(&app) else {
                break;
            };
            let Some(outcome) = purchase::poll(&license, now()) else {
                break;
            };
            let _ = app.emit_to(EventTarget::webview_window(window::MAIN), ORDER_CHANGED, &outcome);
            if matches!(
                outcome,
                OrderOutcome::Paid { .. } | OrderOutcome::PaidButNotApplied { .. }
            ) {
                refresh(&app);
            }
            if outcome.is_final() {
                break;
            }
            std::thread::sleep(Duration::from_secs(purchase::POLL_EVERY_SECS));
        }
        if let Some(state) = app.try_state::<Licensing>() {
            state.1.store(false, Ordering::SeqCst);
        }
    });
}
