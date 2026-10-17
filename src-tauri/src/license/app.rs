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

use super::client::{Device, HttpApi};
use super::device;
use super::keys::PublicKeys;
use super::manager::{License, LicenseError, LicenseView, Machine, StartBlock, Zone};
use super::purchase::{self, CheckoutView, OrderOutcome, PlansView};
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

    /// Luồng hỏi đơn đang chờ đang chạy (test kiểm luồng đã bật rồi đã dừng).
    #[cfg(test)]
    pub fn polling(&self) -> bool {
        self.1.load(Ordering::SeqCst)
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
    // Đã xong các bước lần đầu mở (đã đồng ý điều khoản ở lần chạy trước): ticker được đăng ký dùng thử chạy nền.
    if app
        .try_state::<AppState>()
        .is_some_and(|s| s.settings().onboarding_done)
    {
        license.allow_trial();
    }
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

/// Trước khi bắt đầu phiên (§6.8 "Khi chạm hạn mức"; spec 2026-10-07 §3.2, §6): hạn mức còn 0, Free hết dùng thử, Free
/// chưa đăng ký được dùng thử (mất mạng, server từ chối, không đọc được mã máy), hay giờ máy chỉnh lùi thì từ chối với mã
/// tương ứng. Khách đã có license mà gói không dùng được (xung đột, cần làm mới, bị thu hồi, hết hạn) và dùng thử không còn
/// thì nhận lý do của gói, không phải "hết dùng thử". Ở Free mà chưa có token dùng thử thì đăng ký ngay (gọi server):
/// `session::start` chạy trên luồng nền.
pub fn check_start<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    let Some(license) = licensing(app) else {
        return Ok(());
    };
    let block = license.start_block(now());
    if block.is_some() {
        refresh(app);
    }
    block.map_or(Ok(()), |block| Err(block_error(block)))
}

/// Gõ dịch có dùng được không (spec 2026-10-17-go-dich §1.5): cùng mã lỗi như lúc bắt đầu phiên, trừ hạn mức phút
/// ([`License::compose_block`]). Không gọi server, nên gọi được từ bất kỳ luồng nào.
pub fn compose_check<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    let Some(license) = licensing(app) else {
        return Ok(());
    };
    license
        .compose_block(now())
        .map_or(Ok(()), |block| Err(block_error(block)))
}

/// Mã lỗi và chi tiết (cho log) của một lý do chặn.
fn block_error(block: StartBlock) -> CommandError {
    let (code, message) = match block {
        StartBlock::QuotaExhausted => (errors::QUOTA_EXHAUSTED, "hạn mức còn 0"),
        StartBlock::TrialEnded => (errors::TRIAL_ENDED, "đã hết dùng thử"),
        StartBlock::TrialMissing => (errors::TRIAL_NEEDS_NETWORK, "chưa đăng ký được dùng thử"),
        StartBlock::ClockRolledBack => (errors::CLOCK_ROLLED_BACK, "giờ máy bị chỉnh lùi"),
        StartBlock::TrialUnavailable(code) => (code, "không đăng ký được dùng thử"),
        StartBlock::LicenseConflict => (errors::LICENSE_CONFLICT, "key đang xung đột"),
        StartBlock::LicenseNeedsRefresh => (errors::LICENSE_NEEDS_REFRESH, "cần làm mới bản quyền"),
        StartBlock::LicenseRevoked => (LicenseError::Revoked.code(), "license đã bị thu hồi"),
        StartBlock::LicenseExpired => (LicenseError::Expired(None).code(), "license đã hết hạn"),
    };
    CommandError::new(code, None, message)
}

/// Mã dừng phiên khi `validate` cho thấy gói trả phí không còn dùng được trên máy này; `None` với lỗi khác (lỗi mạng…).
fn lost_code(e: &LicenseError) -> Option<&'static str> {
    match e {
        LicenseError::Conflict(_) => Some(errors::LICENSE_CONFLICT),
        LicenseError::Revoked | LicenseError::Deactivated | LicenseError::InvalidKey | LicenseError::KeyInUse(_) => {
            Some(errors::LICENSE_INVALID)
        }
        _ => None,
    }
}

/// `validate` khi đang có gói trả phí; gói không còn dùng được thì dừng phiên đang chạy (spec 2026-10-07 §4.2). `attempt`:
/// số của lần bắt đầu phiên lúc nhờ việc này ([`crate::session::attempt`]); kết quả tới muộn, khi phiên đó đã dừng và một
/// lần bắt đầu khác đã chạy, không được dừng phiên mới.
fn validate_paid<R: Runtime>(app: &AppHandle<R>, license: &License, t: i64, attempt: u64) {
    let paid = license.has_paid_plan(t);
    let result = license.validate(t);
    refresh(app);
    if let Err(e) = result {
        log::info!("validate chưa được: {}", e.code());
        if let Some(code) = lost_code(&e).filter(|_| paid) {
            crate::session::abort(app, attempt, code, &e.to_string());
        }
    }
}

/// Phiên vừa bắt đầu (`session::start_with`, lần bắt đầu số `attempt`): gói trả phí mà lần `validate` thành công gần nhất đã
/// quá 1 giờ thì kiểm lại chạy nền, không làm chậm lúc bắt đầu; lỗi mạng thì phiên chạy tiếp (spec 2026-10-07 §4.2).
pub fn quick_check<R: Runtime>(app: &AppHandle<R>, attempt: u64) {
    let Some(license) = licensing(app) else {
        return;
    };
    if !license.quick_check_due(now()) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || validate_paid(&app, &license, now(), attempt));
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
        validate_paid(app, &license, t, crate::session::attempt(app));
    }
}

/// Đăng ký dùng thử chạy nền nếu tới lịch ([`License::trial_due`]), rồi báo giao diện.
fn register_trial_if_due<R: Runtime>(app: &AppHandle<R>) {
    let Some(license) = licensing(app) else {
        return;
    };
    let t = now();
    if license.trial_due(t) {
        if let Err(e) = license.register_trial(t) {
            log::info!("chưa đăng ký được dùng thử: {}", e.code());
        }
        refresh(app);
    }
}

/// Bước Điều khoản vừa được đồng ý (§4.1 bước 1b): cho phép đăng ký dùng thử, và đăng ký ngay trên luồng nền (spec
/// 2026-10-07 §3.2). Lỗi mạng không chặn onboarding: ticker thử lại mỗi giờ.
pub fn start_trial<R: Runtime>(app: &AppHandle<R>) {
    let Some(license) = licensing(app) else {
        return;
    };
    license.allow_trial();
    let app = app.clone();
    std::thread::spawn(move || register_trial_if_due(&app));
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
        // Lúc khởi động: kiểm ngay (§6.8, "Kiểm tra định kỳ"), và đăng ký dùng thử nếu chưa có.
        validate_if_due(&app);
        register_trial_if_due(&app);
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
            register_trial_if_due(&app);
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

/// Kết quả của lệnh kích hoạt: thành công hay xung đột (`view`, `standing` cho biết), hay key đang dùng ở máy khác
/// (`devices`: giao diện hiện danh sách để gỡ máy kia hay "Vẫn kích hoạt").
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateOutcome {
    pub view: Option<LicenseView>,
    pub devices: Option<Vec<Device>>,
}

/// Kích hoạt key vừa gõ. `allow_conflict`: người dùng đã xác nhận "Vẫn kích hoạt trên máy này" (spec 2026-10-07 §4.2).
pub fn activate<R: Runtime>(
    app: &AppHandle<R>,
    key: &str,
    allow_conflict: bool,
) -> Result<ActivateOutcome, CommandError> {
    let license = license_or_error(app)?;
    let result = if allow_conflict {
        license.activate_anyway(key, now())
    } else {
        license.activate(key, now())
    };
    refresh(app);
    match result {
        Ok(()) | Err(LicenseError::Conflict(_)) => Ok(ActivateOutcome {
            view: Some(license.view(now())),
            devices: None,
        }),
        Err(LicenseError::KeyInUse(devices)) => Ok(ActivateOutcome {
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

/// Gỡ một máy khác của key. `key`: key người dùng vừa gõ (hộp thoại `key_in_use`); `None`: key đã lưu (đang xung đột,
/// "Gỡ máy kia"), khi đó `validate` ngay để nhận token lại.
pub fn deactivate_other<R: Runtime>(
    app: &AppHandle<R>,
    key: Option<&str>,
    activation_id: &str,
) -> Result<(), CommandError> {
    let license = license_or_error(app)?;
    let Some(key) = key else {
        license.deactivate_saved_other(activation_id).map_err(command_error)?;
        if let Err(e) = license.validate(now()) {
            log::info!("validate sau khi gỡ máy kia chưa được: {}", e.code());
        }
        refresh(app);
        return Ok(());
    };
    license.deactivate(Some((key, activation_id))).map_err(command_error)
}

pub fn validate_now<R: Runtime>(app: &AppHandle<R>) -> Result<Option<LicenseView>, CommandError> {
    let license = license_or_error(app)?;
    let result = license.validate(now());
    refresh(app);
    result.map(|()| Some(license.view(now()))).map_err(command_error)
}

pub fn plans<R: Runtime>(app: &AppHandle<R>) -> Result<PlansView, CommandError> {
    purchase::plans(&*license_or_error(app)?).map_err(command_error)
}

pub fn start_checkout<R: Runtime>(
    app: &AppHandle<R>,
    plan: &str,
    email: &str,
    consent: bool,
    renew: bool,
    currency: &str,
) -> Result<CheckoutView, CommandError> {
    let view =
        purchase::start(&*license_or_error(app)?, plan, email, consent, renew, currency).map_err(command_error)?;
    // Đơn thẻ không có mã QR để quét: mở ngay trang thanh toán của cổng bằng trình duyệt (spec 2026-10-14 §5). Mở không được
    // thì thôi (đơn đã tạo và đã lưu, luồng hỏi vẫn bật), giao diện vẫn có nút "Mở lại trang thanh toán". Log chỉ nhãn cố
    // định của nhánh lỗi (`open_failed:…`): lỗi thô của trình mở (macOS `open`) có thể chứa nguyên URL thanh toán.
    if view.qr_svg.is_none()
        && let Err(e) = open_checkout_page(app)
    {
        log::info!("chưa tự mở được trang thanh toán: {}", e.message);
    }
    spawn_order_poller(app);
    Ok(view)
}

/// Đơn đang chờ, vẽ lại mã QR (mở lại màn hình Nâng cấp hay mở lại app). Số tiền và loại tiền như lúc tạo đơn; đơn do bản app
/// cũ lưu không có: 0 và chuỗi rỗng.
pub fn pending_order<R: Runtime>(app: &AppHandle<R>) -> Option<CheckoutView> {
    let order = purchase::pending(&*licensing(app)?)?;
    // Chuỗi QR đã lưu mà vẽ không được thì coi như đơn hỏng; đơn không có QR (Creem) thì không vẽ gì.
    let qr_svg = match order.qr() {
        Some(code) => Some(purchase::qr_svg(code).ok()?),
        None => None,
    };
    Some(CheckoutView {
        order_code: order.order_code,
        plan: order.plan,
        amount: order.amount,
        currency: order.currency,
        expires_at: order.expires_at,
        provider: order.provider,
        qr_svg,
        license_expires_at: None,
        converted_days: None,
    })
}

pub fn cancel_checkout<R: Runtime>(app: &AppHandle<R>) {
    if let Some(license) = licensing(app) {
        purchase::forget(&license);
    }
}

/// Mở trang thanh toán của đơn đang chờ. Lỗi: mã `openFailed`, chi tiết là nhãn cố định của nhánh lỗi (`open_failed:…`),
/// không bao giờ có URL.
pub fn open_checkout_page<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    let order = licensing(app)
        .and_then(|l| purchase::pending(&l))
        .ok_or_else(|| CommandError::new(errors::OPEN_FAILED, None, "open_failed:no_order"))?;
    navigation::open_external(app, &order.checkout_url)
        .map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e.label()))
}

pub fn recover<R: Runtime>(app: &AppHandle<R>, email: &str) -> Result<(), CommandError> {
    let license = license_or_error(app)?;
    let reply = license.api().recover(email.trim());
    license.observe_reply(&reply);
    reply.result.map_err(|e| command_error(super::manager::map_api(e)))
}

/// Hỏi đơn đang chờ tới khi có kết quả cuối (§6.8 bước 4), nhịp theo `purchase::poll_delay`: 3 giây với đơn VietQR; đơn thẻ 5
/// giây, quá hạn thì 30 giây trong giờ đầu rồi 120 giây. Chỉ một luồng hỏi mỗi lúc: đơn tạo trong lúc luồng đang chạy (sau
/// khi hủy đơn đang hỏi) do chính luồng này hỏi tiếp.
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
                // Người dùng đã hủy đơn này và tạo đơn khác trong lúc chờ server (lệnh tạo đơn không bật được luồng mới vì
                // luồng này còn chạy): hỏi đơn mới ngay. Kho không còn đơn, hay còn đúng đơn này (xóa lỗi), thì dừng.
                if purchase::another_order_pending(&license, outcome.order_code()) {
                    continue;
                }
                break;
            }
            std::thread::sleep(purchase::poll_delay(&license, now()));
        }
        if let Some(state) = app.try_state::<Licensing>() {
            state.1.store(false, Ordering::SeqCst);
        }
    });
}
