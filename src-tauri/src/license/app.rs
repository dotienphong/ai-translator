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
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};

use super::client::{Device, HttpApi};
use super::device;
use super::keys::PublicKeys;
use super::manager::{License, LicenseError, LicenseView, Machine, StartBlock, TrialAttach, Zone};
use super::purchase::{self, CheckoutView, OrderOutcome, PlansView, SubscriptionView};
use super::store::Vault;
use crate::account::client::HttpAccountApi;
use crate::account::{AccountError, AccountService, AccountState, AccountView, LinkOutcome, Timing};
use crate::errors::{self, CommandError};
use crate::pro::{self, ProGate};
use crate::security::keystore::Keystore;
use crate::settings::UiLanguage;
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
    let id_hash = device::hardware_id()
        .map(|id| device::hash_id(&id))
        .unwrap_or_else(|e| {
            log::error!("không đọc được ID máy: {e}");
            String::new()
        });
    let account = account_service(app, &id_hash);
    let machine = Machine {
        id_hash,
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
    install_with_account(app, license, account);
    spawn_ticker(app);
    // Đơn còn chờ từ lần chạy trước (§6.8 bước 5): hỏi tiếp.
    spawn_order_poller(app);
}

/// Cài một [`License`] đã dựng (test dùng server và kho khóa giả). Không chạy ticker.
pub fn install_with<R: Runtime>(app: &AppHandle<R>, license: License) {
    install_with_account(app, license, None);
}

/// Dịch vụ tài khoản Google của app thật (spec 2026-11-05-dang-nhap-google §6.1). Không dựng được (không đọc được mã máy, bản build
/// chưa có server, kho khóa không mở được) thì `None`: không cài hook, cổng đăng nhập mở, app chạy y như trước. Không gọi mạng; chỉ
/// đọc phiên đã lưu trong kho khóa (như `License::new`).
fn account_service<R: Runtime>(app: &AppHandle<R>, device_id_hash: &str) -> Option<AccountService> {
    if device_id_hash.is_empty() {
        log::warn!("không có mã máy: không bật đăng nhập tài khoản");
        return None;
    }
    let api = HttpAccountApi::for_this_build();
    if !api.configured() {
        log::warn!("bản build chưa có license server: không bật đăng nhập tài khoản");
        return None;
    }
    let vault: Arc<dyn Vault> = match Keystore::os(&app.config().identifier) {
        Ok(ks) => Arc::new(ks),
        Err(_) => {
            log::warn!("không mở được kho khóa cho tài khoản: không bật đăng nhập tài khoản");
            return None;
        }
    };
    Some(AccountService::new(
        Box::new(api),
        vault,
        PublicKeys::embedded(),
        device_id_hash.to_string(),
        Timing::default(),
    ))
}

/// Như [`install_with`], kèm dịch vụ tài khoản: có thì đặt làm hook của `License` (cổng đăng nhập, Bearer khi đăng ký dùng
/// thử) và quản lý bằng `app.manage`; `None` thì không hook (cổng mở, như trước).
pub fn install_with_account<R: Runtime>(app: &AppHandle<R>, license: License, account: Option<AccountService>) {
    let license = Arc::new(license);
    if let Some(account) = account {
        let account = Arc::new(account);
        license.set_account_hook(account.clone());
        let signed_in = account.view().state == AccountState::SignedIn;
        let accounts = Accounts::new(account);
        // Đã đăng nhập từ lần chạy trước: gắn lại license đang lưu ở nhịp đầu của ticker (idempotent ở server). Bù cho bản cũ chỉ
        // gắn ngay sau đăng nhập, nên khách đăng nhập trước rồi mới nhập key thì license chưa từng gắn vào tài khoản.
        accounts.pending_link.store(signed_in, Ordering::SeqCst);
        app.manage(accounts);
    }
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
        StartBlock::LoginRequired => (errors::LOGIN_REQUIRED, "chưa đăng nhập tài khoản"),
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
        // Công tắc đăng nhập của server (spec 2026-11-05 §5.4b): hỏi ngay ở nền, rồi mỗi giờ khi chưa đăng nhập; trước khi đăng
        // ký dùng thử, vì cổng đóng thì không đăng ký.
        let mut account_ticker = AccountTicker::default();
        account_tick(&app, &mut account_ticker, Instant::now());
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
            account_tick(&app, &mut account_ticker, Instant::now());
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
    if matches!(result, Ok(()) | Err(LicenseError::Conflict(_))) {
        link_after_activation(app);
    }
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

/// Mã ngôn ngữ giao diện lúc khách bấm (`vi`, `en`, `ja`, `zh`, `ko`), gửi kèm tạo đơn và lấy lại key để server viết thư gửi key
/// bằng ngôn ngữ đó (spec 2026-10-23-email-theo-ngon-ngu-design.md §4). Cùng mã app gửi ở chat hỗ trợ.
fn ui_lang<R: Runtime>(app: &AppHandle<R>) -> &'static str {
    crate::support::lang_code(
        app.try_state::<AppState>()
            .map_or(UiLanguage::En, |state| state.settings().ui_language),
    )
}

pub fn start_checkout<R: Runtime>(
    app: &AppHandle<R>,
    plan: &str,
    email: &str,
    consent: bool,
    renew: bool,
    currency: &str,
    auto_renew: bool,
) -> Result<CheckoutView, CommandError> {
    let view = purchase::start_with(
        &*license_or_error(app)?,
        plan,
        email,
        consent,
        renew,
        currency,
        ui_lang(app),
        auto_renew,
    )
    .map_err(command_error)?;
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

/// Trạng thái tự động gia hạn của key đang dùng (màn hình Bản quyền). Chưa kích hoạt thì `None`.
pub fn subscription<R: Runtime>(app: &AppHandle<R>) -> Result<Option<SubscriptionView>, CommandError> {
    purchase::subscription(&*license_or_error(app)?).map_err(command_error)
}

/// Nút "Quản lý": xin link cổng khách hàng ở server rồi mở bằng trình duyệt. Link chỉ đi qua đây, không trả ra giao diện;
/// `navigation::open_external` chỉ mở host trong danh sách cho phép.
pub fn manage_subscription<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    let url = purchase::manage_url(&*license_or_error(app)?).map_err(command_error)?;
    navigation::open_external(app, &url).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e.label()))
}

pub fn recover<R: Runtime>(app: &AppHandle<R>, email: &str) -> Result<(), CommandError> {
    let license = license_or_error(app)?;
    let reply = license.api().recover(email.trim(), ui_lang(app));
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

// ---- Tài khoản Google (spec 2026-11-05-dang-nhap-google §6.1, §6.2). Chỉ cửa sổ `main`. Đăng nhập, xóa tài khoản, gắn
// license và hỏi công tắc đăng nhập gọi server: chạy trên luồng nền (lệnh `async` + `blocking`, hay luồng riêng), không bao giờ
// trên đường bắt đầu phiên dịch, và không chạy khi đang dịch (A7). Sau mỗi lệnh (kể cả lỗi) báo `account://changed`. ----

/// Dịch vụ tài khoản của app, chỉ có khi dựng được ([`account_service`]).
pub struct Accounts {
    service: Arc<AccountService>,
    /// Còn phải gắn dùng thử sẵn có vào tài khoản ([`License::attach_trial_to_account`]).
    pending_attach: AtomicBool,
    /// Còn phải gắn license đang lưu vào tài khoản (`link_license`).
    pending_link: AtomicBool,
    /// Đang chạy việc gắn (luồng sau đăng nhập hay ticker): mỗi lúc một lần.
    followups_running: AtomicBool,
    /// Số lần luồng nền sau đăng nhập đã chạy xong (test chờ).
    after_sign_in_done: AtomicUsize,
    /// Tăng mỗi lần có phiên tài khoản mới (đăng nhập xong, đăng xuất, xóa tài khoản): ticker đưa lịch hỏi lại về đầu.
    session_epoch: AtomicUsize,
}

impl Accounts {
    fn new(service: Arc<AccountService>) -> Self {
        Self {
            service,
            pending_attach: AtomicBool::new(false),
            pending_link: AtomicBool::new(false),
            followups_running: AtomicBool::new(false),
            after_sign_in_done: AtomicUsize::new(0),
            session_epoch: AtomicUsize::new(0),
        }
    }
}

/// Lịch hỏi lại của một việc nền (công tắc đăng nhập, gắn dùng thử và license): có câu trả lời thật thì một giờ sau; lỗi tạm thời
/// thì 60 giây, rồi 5 phút, rồi mỗi giờ. Giữ trên luồng của ticker, không khóa.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RetrySchedule {
    next: Option<Instant>,
    failures: usize,
}

/// Chờ sau lỗi tạm thời thứ 1, thứ 2; từ lần thứ 3 là [`ACCOUNT_STATUS_EVERY`].
const RETRY_AFTER: [Duration; 2] = [Duration::from_secs(60), Duration::from_secs(300)];

impl RetrySchedule {
    /// Chưa lên lịch, hay đã tới lịch.
    fn due(&self, now: Instant) -> bool {
        self.next.is_none_or(|t| now >= t)
    }

    /// Có câu trả lời thật: hỏi lại sau một giờ.
    fn answered(&mut self, now: Instant) {
        self.failures = 0;
        self.next = now.checked_add(ACCOUNT_STATUS_EVERY);
    }

    /// Lỗi tạm thời: hỏi lại sớm, giãn dần.
    fn failed(&mut self, now: Instant) {
        let wait = RETRY_AFTER.get(self.failures).copied().unwrap_or(ACCOUNT_STATUS_EVERY);
        self.failures = self.failures.saturating_add(1);
        self.next = now.checked_add(wait);
    }
}

/// Hỏi lại công tắc đăng nhập của server mỗi giờ khi chưa đăng nhập.
const ACCOUNT_STATUS_EVERY: Duration = Duration::from_secs(3600);

fn accounts<R: Runtime>(app: &AppHandle<R>) -> Option<Arc<AccountService>> {
    app.try_state::<Accounts>().map(|a| a.service.clone())
}

fn account_error(e: AccountError) -> CommandError {
    CommandError::new(e.code(), None, e.to_string())
}

/// Trạng thái tài khoản cho giao diện. Không có dịch vụ: chưa đăng nhập, cổng mở. Cổng (`gate`) chỉ đóng khi hook đã đặt và
/// đang đóng, và `License` thật sự chặn máy này: không phải bản dev Pro, máy chưa có bản ghi license (khách đã mua không bao giờ
/// bị đòi đăng nhập, như `License::login_block`). Chỉ đọc bộ nhớ.
pub fn account_view<R: Runtime>(app: &AppHandle<R>) -> AccountView {
    let Some(account) = accounts(app) else {
        return AccountView {
            state: AccountState::Anonymous,
            email: None,
            gate: false,
        };
    };
    let mut view = account.view();
    view.gate = view.gate
        && licensing(app).is_some_and(|license| !license.dev_unlimited() && license.saved_activation().is_none());
    view
}

/// Báo giao diện trạng thái tài khoản hiện tại (gửi lỗi thì chỉ ghi log).
fn account_changed<R: Runtime>(app: &AppHandle<R>) {
    crate::events::account_changed(app, &account_view(app));
}

/// Đang dịch (phiên đang bắt đầu hay chạy): cùng cách kiểm với báo cáo lỗi tự động.
fn translating<R: Runtime>(app: &AppHandle<R>) -> bool {
    !crate::diagnostics::translation_idle(app)
}

/// Nút "Đăng nhập bằng Google": chặn tới khi xong, hết hạn hay bị hủy (tối đa 10 phút), nên chỉ gọi trên luồng nền. Đang dịch
/// thì `accountBusy`, không gọi server. Trang Google mở bằng trình duyệt qua `navigation::open_external` (host trong
/// `EXTERNAL_HOSTS`), sau khi `AccountService` đã kiểm đúng trang đăng nhập Google.
pub fn account_sign_in<R: Runtime>(app: &AppHandle<R>, lang: &str) -> Result<AccountView, CommandError> {
    let result = sign_in(app, lang);
    account_changed(app);
    result
}

fn sign_in<R: Runtime>(app: &AppHandle<R>, lang: &str) -> Result<AccountView, CommandError> {
    let account = accounts(app).ok_or_else(|| account_error(AccountError::Unavailable))?;
    if translating(app) {
        return Err(account_error(AccountError::Busy));
    }
    let signed_in_before = account.view().state == AccountState::SignedIn;
    let open_url = |url: &str| -> Result<(), String> {
        // Lúc này phiên đã là `SigningIn`: giao diện hiện "Đang chờ bạn đăng nhập trên trình duyệt".
        account_changed(app);
        navigation::open_external(app, url).map_err(|e| e.label().to_string())
    };
    let result = account.sign_in(lang, &open_url);
    // Kể cả `Err(Storage)`: phiên đã là `SignedIn` trong bộ nhớ.
    if !signed_in_before && account.view().state == AccountState::SignedIn {
        new_account_session(app);
        after_sign_in(app);
    }
    result.map(|_| account_view(app)).map_err(account_error)
}

/// Sau lần đăng nhập thành công, trên luồng riêng (lỗi chỉ ghi mã vào log, không bao giờ thành lỗi đăng nhập): cho phép và
/// đăng ký dùng thử (kèm Bearer của tài khoản), rồi đánh dấu và chạy việc gắn còn chờ ([`run_account_followups`]): gắn dùng thử
/// sẵn có và license đang lưu vào tài khoản. Đang dịch hay lỗi tạm thời thì việc còn chờ, ticker chạy lại.
fn after_sign_in<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("account-after-sign-in".into())
        .spawn(move || {
            if let (Some(license), Some(state)) = (licensing(&app), app.try_state::<Accounts>()) {
                license.allow_trial();
                register_trial_if_due(&app);
                // Luôn gắn dùng thử (không có dùng thử thì là việc rỗng): ticker có thể vừa đăng ký không Bearer ngay trước khi
                // đăng nhập xong, và server chỉ đặt `account_id` khi đang trống, nên gọi thêm vô hại.
                state.pending_attach.store(true, Ordering::SeqCst);
                state.pending_link.store(true, Ordering::SeqCst);
                run_account_followups(&app, &mut RetrySchedule::default(), Instant::now());
            }
            refresh(&app);
            account_changed(&app);
            if let Some(state) = app.try_state::<Accounts>() {
                state.after_sign_in_done.fetch_add(1, Ordering::SeqCst);
            }
        });
    if spawned.is_err() {
        log::warn!("không tạo được luồng nền sau đăng nhập");
    }
}

/// Vừa kích hoạt key: đang đăng nhập thì gắn license vào tài khoản ở nền (spec 2026-11-05 §6.2), trên luồng riêng để không làm
/// chậm câu trả lời của lệnh kích hoạt. Đang dịch hay lỗi tạm thời thì cờ còn chờ, ticker chạy lại. Chưa đăng nhập thì thôi:
/// đăng nhập sau sẽ gắn ([`after_sign_in`]).
fn link_after_activation<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<Accounts>() else {
        return;
    };
    if state.service.view().state != AccountState::SignedIn {
        return;
    }
    state.pending_link.store(true, Ordering::SeqCst);
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("account-link-license".into())
        .spawn(move || {
            run_account_followups(&app, &mut RetrySchedule::default(), Instant::now());
            account_changed(&app);
        });
    if spawned.is_err() {
        log::warn!("không tạo được luồng gắn license");
    }
}

/// Việc gắn còn chờ sau đăng nhập (spec 2026-11-05 §6.2): gắn dùng thử sẵn có ([`License::attach_trial_to_account`]) và license
/// đang lưu (`link_license`) vào tài khoản. Chỉ khi đã đăng nhập, không đang dịch (A7) và tới lịch `schedule`; xong, hay lỗi
/// cuối (`4xx`, kể cả `409 license_linked_other_account`), thì bỏ cờ; lỗi tạm thời thì giữ cờ và lùi lịch. Đã đăng xuất thì bỏ
/// cờ. Mỗi lúc một lần chạy; không giữ khóa nào qua lần gọi server.
pub fn run_account_followups<R: Runtime>(app: &AppHandle<R>, schedule: &mut RetrySchedule, now_at: Instant) {
    let Some(state) = app.try_state::<Accounts>() else {
        return;
    };
    if !state.pending_attach.load(Ordering::SeqCst) && !state.pending_link.load(Ordering::SeqCst) {
        return;
    }
    match state.service.view().state {
        AccountState::SignedIn => {}
        AccountState::Anonymous => {
            state.pending_attach.store(false, Ordering::SeqCst);
            state.pending_link.store(false, Ordering::SeqCst);
            return;
        }
        AccountState::SigningIn => return,
    }
    if translating(app) || !schedule.due(now_at) || state.followups_running.swap(true, Ordering::SeqCst) {
        return;
    }
    let license = licensing(app);
    let mut retry = false;
    if state.pending_attach.load(Ordering::SeqCst) {
        let outcome = license
            .as_ref()
            .map_or(TrialAttach::Skipped, |l| l.attach_trial_to_account(now()));
        if outcome == TrialAttach::Retry {
            retry = true;
        } else {
            state.pending_attach.store(false, Ordering::SeqCst);
        }
    }
    if state.pending_link.load(Ordering::SeqCst) {
        let done = match license.as_ref().and_then(|l| l.saved_activation()) {
            None => true,
            // Phân loại từ lỗi gốc: mạng, `429`, mọi `5xx` thử lại; `4xx` khác (kể cả `409 license_linked_other_account`) thôi.
            Some((key, activation_id)) => {
                state.service.link_license_outcome(&key, &activation_id) != LinkOutcome::Retry
            }
        };
        if done {
            state.pending_link.store(false, Ordering::SeqCst);
        } else {
            retry = true;
        }
    }
    state.followups_running.store(false, Ordering::SeqCst);
    if retry {
        schedule.failed(now_at);
    } else {
        *schedule = RetrySchedule::default();
    }
}

/// Lịch của ticker cho việc nền của tài khoản: hỏi công tắc đăng nhập và việc gắn còn chờ. Có phiên tài khoản mới thì cả hai về
/// đầu (chạy ngay ở nhịp kế tiếp).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AccountTicker {
    status: RetrySchedule,
    followups: RetrySchedule,
    epoch: usize,
}

/// Một nhịp của ticker cho tài khoản ([`refresh_account_status`], [`run_account_followups`]).
pub fn account_tick<R: Runtime>(app: &AppHandle<R>, ticker: &mut AccountTicker, now_at: Instant) {
    if let Some(state) = app.try_state::<Accounts>() {
        let epoch = state.session_epoch.load(Ordering::SeqCst);
        if epoch != ticker.epoch {
            *ticker = AccountTicker {
                epoch,
                ..AccountTicker::default()
            };
        }
    }
    refresh_account_status(app, &mut ticker.status, now_at);
    run_account_followups(app, &mut ticker.followups, now_at);
}

/// Có phiên tài khoản mới: lịch hỏi lại của ticker về đầu.
fn new_account_session<R: Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<Accounts>() {
        state.session_epoch.fetch_add(1, Ordering::SeqCst);
    }
}

/// Cờ còn chờ (gắn dùng thử, gắn license) và số lần luồng sau đăng nhập đã xong.
#[cfg(test)]
pub fn account_followups_state<R: Runtime>(app: &AppHandle<R>) -> (bool, bool, usize) {
    app.try_state::<Accounts>().map_or((false, false, 0), |s| {
        (
            s.pending_attach.load(Ordering::SeqCst),
            s.pending_link.load(Ordering::SeqCst),
            s.after_sign_in_done.load(Ordering::SeqCst),
        )
    })
}

/// Nút "Hủy" khi đang chờ đăng nhập: lượt đang chạy dừng ở lần xem cờ kế tiếp. Không chặn.
pub fn account_cancel<R: Runtime>(app: &AppHandle<R>) {
    if let Some(account) = accounts(app) {
        account.cancel();
    }
    account_changed(app);
}

/// Đăng xuất: xóa token khỏi kho khóa (không gọi server). Không có dịch vụ: trạng thái mặc định.
pub fn account_sign_out<R: Runtime>(app: &AppHandle<R>) -> Result<AccountView, CommandError> {
    let result = match accounts(app) {
        Some(account) => {
            let signed_in = account.view().state == AccountState::SignedIn;
            let result = account.sign_out().map(|_| account_view(app)).map_err(account_error);
            if signed_in && account.view().state == AccountState::Anonymous {
                new_account_session(app);
            }
            result
        }
        None => Ok(account_view(app)),
    };
    refresh(app);
    account_changed(app);
    result
}

/// Xóa tài khoản (gọi server, `POST /v1/account/delete`). Đang dịch thì `accountBusy`, không gọi server.
pub fn account_delete<R: Runtime>(app: &AppHandle<R>) -> Result<AccountView, CommandError> {
    let result = delete_account(app);
    refresh(app);
    account_changed(app);
    result
}

fn delete_account<R: Runtime>(app: &AppHandle<R>) -> Result<AccountView, CommandError> {
    let account = accounts(app).ok_or_else(|| account_error(AccountError::Unavailable))?;
    if translating(app) {
        return Err(account_error(AccountError::Busy));
    }
    let result = account.delete().map(|_| account_view(app)).map_err(account_error);
    if account.view().state == AccountState::Anonymous {
        new_account_session(app);
    }
    result
}

/// Hỏi công tắc đăng nhập (`GET /v1/auth/status`) khi chưa đăng nhập, không đang dịch, máy chưa có license (máy có license không
/// bao giờ bị đòi đăng nhập) và tới lịch `schedule`: có câu trả lời thật thì một giờ sau, lỗi thì hỏi lại sớm. Cổng đổi thì báo
/// giao diện. Chỉ gọi từ luồng của ticker, không bao giờ trên đường bắt đầu phiên.
pub fn refresh_account_status<R: Runtime>(app: &AppHandle<R>, schedule: &mut RetrySchedule, now_at: Instant) {
    let Some(account) = accounts(app) else {
        return;
    };
    if account.view().state != AccountState::Anonymous
        || translating(app)
        || licensing(app).is_some_and(|l| l.saved_activation().is_some())
        || !schedule.due(now_at)
    {
        return;
    }
    let before = account_view(app);
    if account.refresh_status() {
        schedule.answered(now_at);
    } else {
        schedule.failed(now_at);
    }
    if account_view(app) != before {
        refresh(app);
        account_changed(app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cổng đăng nhập (spec 2026-11-05 §6.2): `LoginRequired` thành mã `loginRequired` cho giao diện.
    #[test]
    fn block_error_maps_login_required_to_its_code() {
        assert_eq!(block_error(StartBlock::LoginRequired).code, errors::LOGIN_REQUIRED);
    }

    /// Lịch hỏi lại: chưa lên lịch thì tới ngay; lỗi tạm thời 60 giây, 5 phút, rồi mỗi giờ; có câu trả lời thật thì một giờ.
    #[test]
    fn the_retry_schedule_backs_off_after_errors_and_waits_an_hour_after_an_answer() {
        let t0 = Instant::now();
        let s = Duration::from_secs;
        let mut r = RetrySchedule::default();
        assert!(r.due(t0), "lần đầu: ngay");
        r.failed(t0);
        assert!(!r.due(t0 + s(59)) && r.due(t0 + s(60)));
        r.failed(t0);
        assert!(!r.due(t0 + s(299)) && r.due(t0 + s(300)));
        r.failed(t0);
        assert!(!r.due(t0 + s(3599)) && r.due(t0 + s(3600)));
        r.failed(t0);
        assert!(!r.due(t0 + s(3599)) && r.due(t0 + s(3600)), "từ lần thứ ba: mỗi giờ");
        r.answered(t0);
        assert!(!r.due(t0 + s(3599)) && r.due(t0 + s(3600)));
        r.failed(t0);
        assert!(r.due(t0 + s(60)), "trả lời xong thì đếm lỗi lại từ đầu");
    }
}
