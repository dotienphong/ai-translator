//! Trạng thái bản quyền và hạn mức của máy này (spec §6.8, §9, §10.2), không phụ thuộc Tauri: nơi gọi truyền giờ máy và
//! thời gian đơn điệu, nên test chạy được với server giả ([`LicenseApi`]), kho khóa giả ([`Vault`]) và đồng hồ giả.
//!
//! - **Gói hiệu lực:** gói trả phí khi có token đã kiểm chữ ký, đúng máy này, còn trước `expires_at` và `refresh_before`
//!   theo giờ máy, giờ máy không bị chỉnh lùi (§10.2), license chưa bị thu hồi, và bản cài là chính hãng (§10.2). Ngoài
//!   ra là Free. Token đọc lại từ kho khóa luôn coi `quota_fresh = false`.
//! - **Hạn mức:** mỗi phút dịch cộng vào bộ đếm Free của ngày, và vào bộ đếm của gói trả phí nếu đang có gói. Hết hạn
//!   mức gói trả phí thì Free của ngày cũng hết. Kho khóa lỗi thì áp luật chặt: coi như đã hết.
//! - **Lịch `validate`** ([`License::validate_due`]): khi lần thành công gần nhất đã quá 24 giờ (thử lại mỗi giờ); khi
//!   giờ máy qua mốc đầu chu kỳ kế tiếp (token mới mà `issued_at` vẫn trước mốc thì hẹn lại sau (mốc − `issued_at`) + 1
//!   phút); khi qua `expires_at` (có thể đã gia hạn từ máy khác); khi giờ máy bị chỉnh lùi; khi token đã lưu không đọc
//!   được. Ba việc sau thử lại mỗi 5 phút. `429` thì chờ đúng `Retry-After`.
//! - **Kết quả của server:** máy bị gỡ (`activation_not_found`) hay key không còn (`invalid_key`): xóa bản ghi license,
//!   về Free. Thu hồi, hết hạn: giữ key để gia hạn, về Free. Lỗi mạng: giữ token tới `refresh_before` (§9).
//! - **Mỗi key một máy** (spec 2026-10-07 §4.2): `409 key_in_use` khi kích hoạt thì trả danh sách máy đang giữ key;
//!   "Vẫn kích hoạt" ([`License::activate_anyway`]), `activate` hay `validate` nhận `409 license_conflict` thì key vào
//!   trạng thái xung đột: bỏ token, giữ key và `activation_id` (của `activate`: trường `activation_id` của response), máy
//!   chạy theo Free, `validate` mỗi 15 phút tới khi một máy gỡ key.
//!   Bắt đầu phiên trả phí mà lần `validate` thành công gần nhất đã quá 1 giờ thì app kiểm lại chạy nền
//!   ([`License::quick_check_due`]).
//! - **Free là dùng thử 10 ngày** (spec 2026-10-07 §3.2): dùng được khi không có gói trả phí hiệu lực, có token dùng thử
//!   của máy này ([`super::trial`]), giờ tin được còn trước `ends_at` và giờ máy không bị chỉnh lùi, và bộ đếm của ngày
//!   chưa hết. Bấm Bắt đầu ở Free mà chưa có token thì đăng ký ngay ([`License::start_block`]); ngoài ra ticker đăng ký chạy
//!   nền sau khi người dùng đồng ý điều khoản ([`License::trial_due`]). Phiên đang chạy mà qua `ends_at` thì chạy hết.

use std::ops::ControlFlow;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU8, Ordering};

use chrono::{FixedOffset, Local};
use serde::Serialize;

use super::client::{ApiError, Device, Granted, LicenseApi, Reply};
use super::key;
use super::keys::PublicKeys;
use super::quota::{self, FreeCounter, PaidCounter, Seen};
use super::store::{self, LicenseRecord, TrialRecord, Vault, Verdict};
use super::token::{self, Claims, Plan};
use super::trial::{self, TrialClaims};

/// Lần `validate` thành công gần nhất quá chừng này thì gọi lại (§6.8, "Kiểm tra định kỳ").
pub const VALIDATE_EVERY_SECS: i64 = 24 * 3600;
/// Nhắc gia hạn trước chừng này (§6.8, "Gia hạn").
pub const RENEW_WARNING_SECS: i64 = 7 * 86_400;
const ROUTINE_RETRY_SECS: i64 = 3600;
const URGENT_RETRY_SECS: i64 = 300;
const CYCLE_RETRY_SLACK_SECS: i64 = 60;
/// Đang xung đột: `validate` lại mỗi chừng này (spec 2026-10-07 §4.2).
pub const CONFLICT_RETRY_SECS: i64 = 15 * 60;
/// Bắt đầu phiên trả phí mà lần `validate` thành công gần nhất đã quá chừng này thì kiểm lại chạy nền (spec 2026-10-07
/// §4.2).
pub const QUICK_CHECK_SECS: i64 = 3600;
/// Tới `expires_at`, gói còn dùng được trong lúc chờ lần `validate` đầu sau mốc (có thể đã gia hạn ở máy khác), tối đa
/// chừng này (N4 của review 06 lần 1).
pub const EXPIRY_GRACE_SECS: i64 = 300;
const GENUINE_UNKNOWN: u8 = 0;
const GENUINE_YES: u8 = 1;
const GENUINE_NO: u8 = 2;

/// Múi giờ cho "ngày" của Free: giờ máy, hay múi giờ cố định trong test.
#[derive(Clone, Copy, Debug)]
pub enum Zone {
    Local,
    Fixed(FixedOffset),
}

impl Zone {
    fn resolve_free(&self, stored: Option<FreeCounter>, prior: bool, now: i64, seen: &Seen) -> (FreeCounter, bool) {
        match self {
            Self::Local => quota::resolve_free(&Local, stored, prior, now, seen),
            Self::Fixed(z) => quota::resolve_free(z, stored, prior, now, seen),
        }
    }

    fn local_day(&self, t: i64) -> chrono::NaiveDate {
        match self {
            Self::Local => quota::local_day(&Local, t),
            Self::Fixed(z) => quota::local_day(z, t),
        }
    }

    fn free_reset_time(&self, counter: &FreeCounter) -> i64 {
        match self {
            Self::Local => quota::free_reset_time(&Local, counter),
            Self::Fixed(z) => quota::free_reset_time(z, counter),
        }
    }
}

/// Máy này, gửi cho server khi kích hoạt.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Machine {
    pub id_hash: String,
    pub label: Option<String>,
}

/// Tình trạng bản quyền mà giao diện hiện.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Standing {
    /// Chưa kích hoạt key nào.
    Free,
    Active,
    /// Quá `expires_at` (server xác nhận chưa gia hạn, hay đang offline).
    Expired,
    Revoked,
    /// Quá `refresh_before` mà chưa làm mới được token (offline lâu).
    RefreshNeeded,
    /// Giờ máy nhỏ hơn mốc lớn nhất từng thấy quá 10 phút: chỉnh giờ rồi kết nối mạng để kiểm lại (§10.2).
    ClockRolledBack,
    /// Token đã lưu không đọc được (khóa công khai đã đổi, token hỏng): chờ `validate`.
    Unverified,
    /// Bản cài không chính hãng (§10.2): chỉ chạy Free.
    NotGenuine,
    /// Key đang kích hoạt trên từ 2 máy: tạm khóa cho tới khi một máy gỡ key; máy chạy theo Free (spec 2026-10-07 §4.2).
    Conflict,
}

/// Trạng thái xung đột cho giao diện.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictView {
    /// Các máy đang kích hoạt key (gồm cả máy này).
    pub devices: Vec<Device>,
    /// Activation của máy này trong `devices`.
    pub this_activation_id: String,
}

/// Tình trạng dùng thử của Free (spec 2026-10-07 §3.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TrialStatus {
    /// Chưa có token dùng thử của máy này (chưa đăng ký được).
    None,
    Active,
    /// Giờ tin được đã tới `ends_at`.
    Ended,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialView {
    pub status: TrialStatus,
    pub ends_at: Option<i64>,
    /// Số ngày còn lại, ceil((`ends_at` − giờ tin được) / 1 ngày); 0 khi đã hết hay chưa có.
    pub days_left: i64,
}

/// Vì sao chưa bắt đầu được phiên ([`License::start_block`]).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartBlock {
    /// Hạn mức còn 0 (§6.8, "Khi chạm hạn mức").
    QuotaExhausted,
    /// Free mà chưa có token dùng thử, và đăng ký không được (thường là không có mạng).
    TrialMissing,
    /// Free mà đã hết 10 ngày dùng thử.
    TrialEnded,
    /// Giờ máy bị coi là chỉnh lùi: chỉnh giờ rồi thử lại.
    ClockRolledBack,
    /// Free mà chưa có token dùng thử, và server từ chối hay lỗi (không phải mất mạng): mã lỗi của lần đăng ký
    /// ([`LicenseError::code`]), ví dụ `licenseRateLimited`, `licenseServer`, `licenseNoMachineId`.
    TrialUnavailable(&'static str),
    /// Dùng thử đã hết (hay chưa có) mà khách có license không dùng được ở lúc này: nêu lý do của gói trả phí, không báo
    /// "hết dùng thử, mua gói" (review cuối 02a, Quan trọng 1). Key đang xung đột.
    LicenseConflict,
    /// Quá 14 ngày chưa làm mới được token, hay token lưu chưa kiểm được (`RefreshNeeded`, `Unverified`): cần mạng.
    LicenseNeedsRefresh,
    /// License đã bị thu hồi.
    LicenseRevoked,
    /// License đã hết hạn.
    LicenseExpired,
}

/// Mốc reset hạn mức hiển thị (§4.2 bước 2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ResetKind {
    /// Free: max(00:00 hôm sau, lần reset trước + 20 giờ).
    Daily,
    /// Gói trả phí: mốc đầu chu kỳ kế tiếp, cần có mạng để mở hạn mức mới.
    Cycle,
    /// `expires_at` đến trước mốc chu kỳ kế tiếp: báo ngày hết hạn.
    Expiry,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaView {
    /// Gói không giới hạn (Yearly) hay bản debug không giới hạn.
    pub unlimited: bool,
    pub limit_ms: u64,
    pub used_ms: u64,
    pub remaining_ms: u64,
    pub reset_at: Option<i64>,
    pub reset_kind: ResetKind,
    /// Giờ máy đã qua mốc chu kỳ kế tiếp mà chưa có token mới (offline): cần mạng để mở hạn mức mới (§9).
    pub needs_network: bool,
    /// Bộ đếm mất bản ghi, coi như đã dùng hết (§9): hướng dẫn liên hệ hỗ trợ.
    pub lost: bool,
    /// Kho khóa không đọc ghi được: coi như đã hết.
    pub storage_error: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseView {
    pub standing: Standing,
    /// `free`, `monthly`, `yearly`: gói đang có hiệu lực.
    pub plan: String,
    /// Gói ghi trong token đã lưu (kể cả khi đã hết hạn), để hiện "Monthly đã hết hạn".
    pub licensed_plan: Option<Plan>,
    /// Key đã che, chỉ còn 4 ký tự cuối (`••••-…-RST5`): sự kiện không phải ranh giới quyền, nên không gửi key đầy đủ
    /// (01 QĐ6). Key đầy đủ nằm trong email mua hàng.
    pub key: Option<String>,
    pub expires_at: Option<i64>,
    pub refresh_before: Option<i64>,
    pub validated_at: Option<i64>,
    /// Còn dưới 7 ngày tới `expires_at`, hay đã hết hạn: nhắc gia hạn.
    pub renew_soon: bool,
    pub quota: QuotaView,
    /// Bản build có địa chỉ license server.
    pub server_configured: bool,
    /// Công tắc dev (`AI_TRANSLATOR_DEV_PRO=true`, chỉ bản debug) đang bật: Pro không giới hạn (`DevGate`).
    pub dev_override: bool,
    /// Giờ máy bị coi là chỉnh lùi (cả ở gói Free): giao diện nhắc chỉnh giờ.
    pub clock_rolled_back: bool,
    /// Dùng thử của Free trên máy này.
    pub trial: TrialView,
    /// Đang xung đột (`Standing::Conflict`): danh sách máy và máy này.
    pub conflict: Option<ConflictView>,
}

/// Lỗi của một thao tác bản quyền; giao diện chọn câu theo [`LicenseError::code`].
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum LicenseError {
    #[error("key sai định dạng hay sai ký tự kiểm tra")]
    InvalidKey,
    #[error("chưa có key nào được kích hoạt")]
    NotActivated,
    #[error("chưa cấu hình license server")]
    NotConfigured,
    #[error("lỗi mạng")]
    Network,
    #[error("server bảo thử lại sau")]
    RateLimited(Option<u64>),
    #[error("key đang dùng ở máy khác")]
    KeyInUse(Vec<Device>),
    #[error("key đang kích hoạt trên từ 2 máy, đã tạm khóa")]
    Conflict(Vec<Device>),
    #[error("key đang bị khóa tạm")]
    Locked,
    #[error("license đã bị thu hồi")]
    Revoked,
    #[error("license đã hết hạn")]
    Expired(Option<i64>),
    #[error("máy này đã bị gỡ khỏi key")]
    Deactivated,
    #[error("token server trả không hợp lệ: {0}")]
    BadToken(String),
    #[error("không ghi được kho khóa: {0}")]
    Storage(String),
    #[error("server trả lỗi {0}")]
    Server(String),
    #[error("chưa đồng ý xử lý email")]
    ConsentRequired,
    #[error("email không hợp lệ")]
    EmailInvalid,
    #[error("không đọc được mã máy")]
    NoMachineId,
}

/// Mọi mã lỗi của bản quyền (test của `errors.rs` kiểm đủ câu báo lỗi).
pub const ERROR_CODES: &[&str] = &[
    "licenseInvalidKey",
    "licenseNotActivated",
    "licenseNotConfigured",
    "licenseNetwork",
    "licenseRateLimited",
    "licenseKeyInUse",
    "licenseConflict",
    "licenseLocked",
    "licenseRevoked",
    "licenseExpired",
    "licenseDeactivated",
    "licenseBadToken",
    "licenseStorage",
    "licenseServer",
    "licenseConsentRequired",
    "licenseEmailInvalid",
    "licenseNoMachineId",
];

impl LicenseError {
    /// Mã lỗi cho giao diện (`error.<mã>` trong i18n).
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidKey => "licenseInvalidKey",
            Self::NotActivated => "licenseNotActivated",
            Self::NotConfigured => "licenseNotConfigured",
            Self::Network => "licenseNetwork",
            Self::RateLimited(_) => "licenseRateLimited",
            Self::KeyInUse(_) => "licenseKeyInUse",
            Self::Conflict(_) => "licenseConflict",
            Self::Locked => "licenseLocked",
            Self::Revoked => "licenseRevoked",
            Self::Expired(_) => "licenseExpired",
            Self::Deactivated => "licenseDeactivated",
            Self::BadToken(_) => "licenseBadToken",
            Self::Storage(_) => "licenseStorage",
            Self::Server(_) => "licenseServer",
            Self::ConsentRequired => "licenseConsentRequired",
            Self::EmailInvalid => "licenseEmailInvalid",
            Self::NoMachineId => "licenseNoMachineId",
        }
    }
}

pub(crate) fn map_api(e: ApiError) -> LicenseError {
    match e {
        ApiError::NotConfigured => LicenseError::NotConfigured,
        ApiError::Network(_) => LicenseError::Network,
        ApiError::Decode(m) => LicenseError::Server(m),
        ApiError::Server(s) => match (s.status, s.code.as_str()) {
            (_, "key_in_use") => LicenseError::KeyInUse(s.devices),
            (_, "license_conflict") => LicenseError::Conflict(s.devices),
            (_, "license_locked") => LicenseError::Locked,
            (_, "license_revoked") => LicenseError::Revoked,
            (_, "license_expired") => LicenseError::Expired(s.expires_at),
            (_, "activation_not_found") => LicenseError::Deactivated,
            (_, "invalid_key") => LicenseError::InvalidKey,
            (429, _) => LicenseError::RateLimited(s.retry_after),
            _ => LicenseError::Server(s.code),
        },
    }
}

#[derive(Default)]
struct Inner {
    record: Option<LicenseRecord>,
    /// Claims của token đã lưu: đã kiểm chữ ký, đúng máy và đúng activation. `None` nếu không đọc được.
    claims: Option<Claims>,
    paid: Option<PaidCounter>,
    paid_error: bool,
    free: Option<FreeCounter>,
    free_error: bool,
    seen: Seen,
    /// Token mới nhất vẫn trước mốc chu kỳ mà giờ máy đã qua: hẹn `validate` lại lúc này.
    cycle_retry_at: Option<i64>,
    /// `429`: không gọi lại trước lúc này.
    blocked_until: Option<i64>,
    last_attempt: Option<i64>,
    /// Đã nhắc "còn 5 phút" cho bộ đếm nào (tên mục kho khóa), để chỉ nhắc một lần.
    warned: Option<String>,
    has_prior_data: bool,
    /// Lần hỏi giờ của server gần nhất khi giờ máy bị coi là chỉnh lùi mà chưa có license ([`License::refresh_clock`]).
    clock_check_at: Option<i64>,
    /// Token dùng thử đã kiểm chữ ký, đúng máy này.
    trial: Option<TrialClaims>,
    /// Người dùng đã đồng ý điều khoản: ticker được đăng ký dùng thử chạy nền ([`License::allow_trial`]).
    trial_allowed: bool,
    /// Lần gọi `POST /v1/trial` gần nhất.
    trial_attempt: Option<i64>,
    /// `429` của `/v1/trial`: không gọi lại trước lúc này.
    trial_blocked_until: Option<i64>,
    /// Đã log cảnh báo "không đọc được mã máy" (chỉ log một lần).
    warned_no_machine: bool,
}

/// Dùng thử lúc `now`, theo giờ tin được.
enum TrialState {
    Missing,
    Active,
    Ended,
    RolledBack,
}

pub struct License {
    api: Box<dyn LicenseApi>,
    vault: Box<dyn Vault>,
    keys: PublicKeys,
    machine: Machine,
    zone: Zone,
    server_configured: bool,
    /// Công tắc dev bật (chỉ bản debug): Pro không giới hạn (`DevGate`).
    dev_unlimited: bool,
    /// Kết quả kiểm chữ ký bản cài: chưa kiểm xong thì chưa mở Pro, nhưng chưa báo "không chính hãng" (N5 của review 06).
    genuine: AtomicU8,
    /// Mỗi lúc chỉ một lần gọi `POST /v1/trial` (ticker, bước Điều khoản và nút Bắt đầu có thể chạy cùng lúc): lần sau chờ
    /// rồi dùng kết quả của lần trước.
    trial_gate: Mutex<()>,
    inner: Mutex<Inner>,
}

/// Các bản ghi cần ghi xuống kho khóa sau một thay đổi.
fn save_free(vault: &dyn Vault, inner: &mut Inner) {
    if let Some(free) = &inner.free {
        inner.free_error = store::write(vault, store::FREE, free).is_err();
    }
}

impl License {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        api: Box<dyn LicenseApi>,
        vault: Box<dyn Vault>,
        keys: PublicKeys,
        machine: Machine,
        zone: Zone,
        server_configured: bool,
        dev_unlimited: bool,
        has_prior_data: bool,
        now: i64,
    ) -> Self {
        let license = Self {
            api,
            vault,
            keys,
            machine,
            zone,
            server_configured,
            dev_unlimited,
            genuine: AtomicU8::new(GENUINE_UNKNOWN),
            trial_gate: Mutex::new(()),
            inner: Mutex::new(Inner {
                has_prior_data,
                ..Inner::default()
            }),
        };
        license.load(now);
        license
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Đọc kho khóa lúc khởi động.
    fn load(&self, now: i64) {
        let vault = self.vault.as_ref();
        let mut inner = self.lock();
        let seen = store::read::<Seen>(vault, store::SEEN);
        // Đã có mốc thời gian từ lần chạy trước: app đã có dữ liệu, nên thiếu bộ đếm Free là mất bản ghi.
        inner.has_prior_data |= !matches!(seen, Ok(None));
        inner.seen = seen.ok().flatten().unwrap_or_default();
        inner.seen.observe_machine(now);
        let _ = store::write(vault, store::SEEN, &inner.seen);
        match store::read::<LicenseRecord>(vault, store::LICENSE) {
            Ok(record) => inner.record = record,
            Err(e) => log::warn!("không đọc được bản ghi license: {e}"),
        }
        // Có bản ghi license nghĩa là app đã có dữ liệu từ trước, dù file cài đặt có còn hay không.
        inner.has_prior_data |= inner.record.is_some();
        // Bản ghi xung đột không có token (token rỗng theo thiết kế): không đọc, không log.
        inner.claims = inner
            .record
            .as_ref()
            .filter(|r| r.verdict != Some(Verdict::Conflict))
            .and_then(|r| self.read_token(&r.token, &r.activation_id));
        if let Some(issued_at) = inner.claims.as_ref().map(|c| c.issued_at) {
            inner.seen.observe_signed(issued_at);
        }
        inner.trial = match store::read::<TrialRecord>(vault, store::TRIAL) {
            Ok(Some(r)) => trial::verify(&r.token, &self.keys, &self.machine.id_hash)
                .inspect_err(|e| log::warn!("token dùng thử đã lưu không dùng được: {e}"))
                .ok(),
            Ok(None) => None,
            Err(e) => {
                log::warn!("không đọc được token dùng thử: {e}");
                None
            }
        };
        if let Some(issued_at) = inner.trial.as_ref().map(|t| t.issued_at) {
            inner.seen.observe_signed(issued_at);
        }
        self.resolve_free_locked(&mut inner, now);
        if let Some(claims) = inner.claims.clone() {
            self.resolve_paid_locked(&mut inner, &claims, false);
        }
    }

    /// Token đã kiểm chữ ký, đúng máy này và đúng activation; không kiểm thời hạn.
    fn read_token(&self, token: &str, activation_id: &str) -> Option<Claims> {
        match token::decode(token, &self.keys) {
            Ok(c) if c.device_id_hash == self.machine.id_hash && c.activation_id == activation_id => Some(c),
            Ok(_) => {
                log::warn!("token đã lưu là của máy hay activation khác");
                None
            }
            Err(e) => {
                log::warn!("token đã lưu không đọc được: {e}");
                None
            }
        }
    }

    fn resolve_free_locked(&self, inner: &mut Inner, now: i64) {
        let vault = self.vault.as_ref();
        let stored = match store::read_free(vault) {
            Ok(c) => c,
            Err(e) => {
                log::warn!("không đọc được bộ đếm Free: {e}");
                inner.free_error = true;
                return;
            }
        };
        let (counter, write) = self.zone.resolve_free(stored, inner.has_prior_data, now, &inner.seen);
        inner.free = Some(counter);
        inner.free_error = false;
        if write {
            save_free(vault, inner);
        }
        inner.has_prior_data = true;
    }

    fn resolve_paid_locked(&self, inner: &mut Inner, claims: &Claims, fresh: bool) {
        let vault = self.vault.as_ref();
        let key = quota::PaidKey::of(claims);
        let existing = store::read_paid(vault, &key);
        let marker = store::read_marker(vault, &claims.license_id, &claims.activation_id);
        let (Ok(existing), Ok(marker)) = (existing, marker) else {
            inner.paid = None;
            inner.paid_error = true;
            return;
        };
        let mut state = quota::resolve_paid(claims, fresh, existing, marker.as_ref());
        // Lần ghi trước bị kho khóa từ chối: phút đã cộng trong bộ nhớ không mất (N1 của review 06 lần 1).
        if let Some(mem) = inner
            .paid
            .as_ref()
            .filter(|m| m.key == state.counter.key && m.used_ms > state.counter.used_ms)
        {
            state.counter.used_ms = mem.used_ms;
            state.write_counter = true;
        }
        if state.resolution == quota::Resolution::Lost {
            log::warn!("mất bản ghi bộ đếm hạn mức của chu kỳ này: coi như đã dùng hết");
        }
        inner.paid_error = store::write_paid(vault, &state).is_err() && state.write_counter;
        inner.paid = Some(state.counter);
    }

    /// Kết quả kiểm chữ ký bản cài (§10.2). Không chính hãng thì chỉ chạy Free.
    pub fn set_genuine(&self, genuine: bool) {
        self.genuine
            .store(if genuine { GENUINE_YES } else { GENUINE_NO }, Ordering::SeqCst);
    }

    pub fn dev_unlimited(&self) -> bool {
        self.dev_unlimited
    }

    fn standing_locked(&self, inner: &Inner, now: i64) -> Standing {
        if self.genuine.load(Ordering::SeqCst) == GENUINE_NO {
            return Standing::NotGenuine;
        }
        let Some(record) = &inner.record else {
            return Standing::Free;
        };
        match record.verdict {
            Some(Verdict::Revoked) => return Standing::Revoked,
            Some(Verdict::Expired) => return Standing::Expired,
            Some(Verdict::Conflict) => return Standing::Conflict,
            None => {}
        }
        let Some(claims) = &inner.claims else {
            return Standing::Unverified;
        };
        if inner.seen.rolled_back(now) {
            return Standing::ClockRolledBack;
        }
        // So thời hạn theo giờ tin được: giờ máy chậm hơn server không kéo dài được gói (Q1 của review 06 lần 1).
        let trusted = inner.seen.trusted_now(now);
        match token::check(claims, trusted, &self.machine.id_hash) {
            Ok(()) => Standing::Active,
            Err(token::VerifyError::LicenseExpired) if self.in_expiry_grace(inner, claims, trusted) => Standing::Active,
            Err(token::VerifyError::LicenseExpired) => Standing::Expired,
            Err(_) => Standing::RefreshNeeded,
        }
    }

    /// Vừa qua `expires_at`, có server, và chưa thử `validate` nào từ sau mốc: chờ lần thử đó (tối đa
    /// [`EXPIRY_GRACE_SECS`]) rồi mới về Free, vì có thể đã gia hạn ở máy khác (N4 của review 06 lần 1).
    fn in_expiry_grace(&self, inner: &Inner, claims: &Claims, trusted: i64) -> bool {
        self.server_configured
            && trusted < claims.expires_at + EXPIRY_GRACE_SECS
            && inner.last_attempt.is_none_or(|t| t < claims.expires_at)
    }

    /// Hạn mức đang theo gói trả phí (kể cả lúc chưa kiểm xong chữ ký bản cài).
    pub fn has_paid_plan(&self, now: i64) -> bool {
        self.quota_claims(&self.lock(), now).is_some()
    }

    /// Đang có gói trả phí hiệu lực không (xem đầu module). Bản debug không giới hạn thì luôn có.
    pub fn is_pro(&self, now: i64) -> bool {
        self.dev_unlimited || self.active_claims(&self.lock(), now).is_some()
    }

    /// Claims dùng cho hạn mức: `Active`, và bản cài chưa bị kiểm là không chính hãng. Trong lúc đang kiểm, hạn mức vẫn theo
    /// gói trả phí, chỉ tính năng Pro chờ (N2 của review 06 lần 2).
    fn quota_claims(&self, inner: &Inner, now: i64) -> Option<Claims> {
        (self.standing_locked(inner, now) == Standing::Active)
            .then(|| inner.claims.clone())
            .flatten()
    }

    /// Claims của gói đang hiệu lực: `Active` và bản cài đã kiểm là chính hãng.
    fn active_claims(&self, inner: &Inner, now: i64) -> Option<Claims> {
        (self.standing_locked(inner, now) == Standing::Active && self.genuine.load(Ordering::SeqCst) == GENUINE_YES)
            .then(|| inner.claims.clone())
            .flatten()
    }

    /// Ghi nhận header `Date` của một response.
    fn observe<T>(&self, reply: &Reply<T>) {
        if let Some(date) = reply.date {
            let mut inner = self.lock();
            inner.seen.observe_server(date);
            let _ = store::write(self.vault.as_ref(), store::SEEN, &inner.seen);
            // Bộ đếm Free vừa kéo về mà chưa có mốc `Date`: lấy `Date` đầu tiên làm mốc, để hiệu `Date` tính được (QB).
            if let Some(free) = inner
                .free
                .as_mut()
                .filter(|f| f.clock_pulled && f.server_date_at_reset.is_none())
            {
                free.server_date_at_reset = Some(date);
                save_free(self.vault.as_ref(), &mut inner);
            }
        }
    }

    /// Nhận token server vừa cấp: kiểm, lưu bản ghi license, chọn bộ đếm với `quota_fresh` của response này.
    fn accept(&self, granted: Granted, key: String, now: i64) -> Result<(), LicenseError> {
        let claims = token::decode(&granted.token, &self.keys).map_err(|e| LicenseError::BadToken(e.to_string()))?;
        if claims.device_id_hash != self.machine.id_hash || claims.activation_id != granted.activation_id {
            return Err(LicenseError::BadToken("token không khớp máy này".into()));
        }
        let record = LicenseRecord {
            key,
            activation_id: granted.activation_id.clone(),
            token: granted.token,
            validated_at: now,
            verdict: None,
            devices: Vec::new(),
        };
        store::write(self.vault.as_ref(), store::LICENSE, &record).map_err(|e| LicenseError::Storage(e.to_string()))?;
        let mut inner = self.lock();
        inner.record = Some(record);
        inner.seen.observe_signed(claims.issued_at);
        // Lần thử này thành công; lần thử gấp kế tiếp (giờ máy vẫn bị coi là lùi…) cách nó 5 phút (N1 của review 06 lần 2).
        inner.last_attempt = Some(now);
        inner.blocked_until = None;
        // Giờ máy đã qua mốc chu kỳ kế tiếp mà token mới vẫn trước mốc (giờ máy nhanh): hẹn lại.
        let cycle = quota::cycle(&claims);
        inner.cycle_retry_at =
            (now >= cycle.next_start).then_some(now + (cycle.next_start - claims.issued_at) + CYCLE_RETRY_SLACK_SECS);
        inner.claims = Some(claims.clone());
        self.resolve_paid_locked(&mut inner, &claims, granted.quota_fresh);
        Ok(())
    }

    /// Kích hoạt key người dùng gõ trên máy này. `409 key_in_use`: [`LicenseError::KeyInUse`], không đổi gì. Máy này đã
    /// kích hoạt key mà key đang xung đột: vào trạng thái xung đột ([`LicenseError::Conflict`]).
    pub fn activate(&self, input: &str, now: i64) -> Result<(), LicenseError> {
        let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
        self.activate_with(key, false, now)
    }

    /// "Vẫn kích hoạt trên máy này" (spec 2026-10-07 §4.2): kích hoạt với `allow_conflict`. Máy kia đã gỡ key trong lúc
    /// người dùng đọc hộp thoại thì nhận token như kích hoạt bình thường; còn lại server trả `409 license_conflict` và key
    /// vào trạng thái xung đột.
    pub fn activate_anyway(&self, input: &str, now: i64) -> Result<(), LicenseError> {
        let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
        self.activate_with(key, true, now)
    }

    /// Gọi `activate`.
    /// - `409 license_conflict` mang `activation_id` của chính máy này (hợp đồng của kế hoạch 00): vào trạng thái xung đột
    ///   với activation đó. Thiếu trường này, rỗng hay không phải UUID là response sai hợp đồng: báo lỗi server, không lưu gì.
    /// - `409 key_in_use` mà danh sách máy rỗng (máy kia vừa gỡ key, race của server): gọi lại một lần, không `allow_conflict`;
    ///   lần hai vẫn rỗng thì báo lỗi server bình thường.
    fn activate_with(&self, key: String, mut allow_conflict: bool, now: i64) -> Result<(), LicenseError> {
        let mut retried = false;
        loop {
            let reply = self.api.activate(
                &key,
                &self.machine.id_hash,
                self.machine.label.as_deref(),
                allow_conflict,
            );
            self.observe(&reply);
            match reply.result {
                Ok(granted) => return self.accept(granted, key, now),
                Err(ApiError::Server(s)) if s.code == "license_conflict" => {
                    let Some(activation_id) = s.activation_id.filter(|id| is_uuid(id)) else {
                        return Err(LicenseError::Server(
                            "license_conflict không có activation_id hợp lệ".into(),
                        ));
                    };
                    return Err(self.enter_conflict(key, activation_id, s.devices, now));
                }
                Err(ApiError::Server(s)) if s.code == "key_in_use" && s.devices.is_empty() => {
                    if retried {
                        return Err(LicenseError::Server(s.code));
                    }
                    retried = true;
                    allow_conflict = false;
                }
                Err(e) => return Err(map_api(e)),
            }
        }
    }

    /// Vào trạng thái xung đột: lưu key, `activation_id` của máy này và danh sách máy, bỏ token. Trả lỗi
    /// [`LicenseError::Conflict`] để nơi gọi báo.
    fn enter_conflict(&self, key: String, activation_id: String, devices: Vec<Device>, now: i64) -> LicenseError {
        let mut inner = self.lock();
        let validated_at = inner
            .record
            .as_ref()
            .filter(|r| r.key == key)
            .map_or(now, |r| r.validated_at);
        let record = LicenseRecord {
            key,
            activation_id,
            token: String::new(),
            validated_at,
            verdict: Some(Verdict::Conflict),
            devices: devices.clone(),
        };
        if let Err(e) = store::write(self.vault.as_ref(), store::LICENSE, &record) {
            log::warn!("không ghi được trạng thái xung đột: {e}");
        }
        inner.record = Some(record);
        inner.claims = None;
        inner.paid = None;
        inner.last_attempt = Some(now);
        LicenseError::Conflict(devices)
    }

    /// Làm mới token của key đã kích hoạt.
    pub fn validate(&self, now: i64) -> Result<(), LicenseError> {
        let Some(record) = self.lock().record.clone() else {
            return Err(LicenseError::NotActivated);
        };
        self.lock().last_attempt = Some(now);
        let reply = self.api.validate(&record.key, &record.activation_id);
        self.observe(&reply);
        match reply.result.map_err(map_api) {
            Ok(granted) => self.accept(granted, record.key, now),
            Err(LicenseError::Conflict(devices)) => {
                Err(self.enter_conflict(record.key, record.activation_id, devices, now))
            }
            Err(e) => {
                let mut inner = self.lock();
                match &e {
                    LicenseError::Deactivated | LicenseError::InvalidKey => {
                        let _ = store::delete(self.vault.as_ref(), store::LICENSE);
                        inner.record = None;
                        inner.claims = None;
                        inner.paid = None;
                    }
                    LicenseError::Revoked => self.keep_verdict(&mut inner, Verdict::Revoked),
                    LicenseError::Expired(_) => self.keep_verdict(&mut inner, Verdict::Expired),
                    LicenseError::RateLimited(after) => {
                        inner.blocked_until = Some(now + after.map_or(ROUTINE_RETRY_SECS, |s| s as i64));
                    }
                    _ => {}
                }
                Err(e)
            }
        }
    }

    /// Nhớ kết luận của server vào bản ghi license, để mở lại app khi offline không quay về `Active`.
    fn keep_verdict(&self, inner: &mut Inner, verdict: Verdict) {
        if let Some(record) = inner.record.as_mut() {
            record.verdict = Some(verdict);
            if let Err(e) = store::write(self.vault.as_ref(), store::LICENSE, record) {
                log::warn!("không ghi được kết luận của server: {e}");
            }
        }
    }

    /// Gỡ một máy khác của key đã lưu (đang xung đột: "Gỡ máy kia"). Nơi gọi `validate` ngay sau đó để nhận token lại.
    pub fn deactivate_saved_other(&self, activation_id: &str) -> Result<(), LicenseError> {
        let key = self.license_key().ok_or(LicenseError::NotActivated)?;
        let reply = self.api.deactivate(&key, activation_id);
        self.observe(&reply);
        reply.result.map_err(map_api)
    }

    /// Gỡ kích hoạt. `remote`: gỡ máy khác của key (từ danh sách `409 key_in_use`), với key người dùng vừa gõ.
    pub fn deactivate(&self, remote: Option<(&str, &str)>) -> Result<(), LicenseError> {
        if let Some((input, activation_id)) = remote {
            let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
            let reply = self.api.deactivate(&key, activation_id);
            self.observe(&reply);
            return reply.result.map_err(map_api);
        }
        let Some(record) = self.lock().record.clone() else {
            return Err(LicenseError::NotActivated);
        };
        let reply = self.api.deactivate(&record.key, &record.activation_id);
        self.observe(&reply);
        match reply.result.map_err(map_api) {
            Ok(()) | Err(LicenseError::Deactivated) => {
                store::delete(self.vault.as_ref(), store::LICENSE).map_err(|e| LicenseError::Storage(e.to_string()))?;
                let mut inner = self.lock();
                inner.record = None;
                inner.claims = None;
                inner.paid = None;
                Ok(())
            }
            Err(e) => Err(e),
        }
    }

    /// Có nên gọi `validate` lúc `now` không (xem đầu module).
    pub fn validate_due(&self, now: i64) -> bool {
        let inner = self.lock();
        let Some(record) = &inner.record else {
            return false;
        };
        if !self.server_configured || inner.blocked_until.is_some_and(|t| now < t) {
            return false;
        }
        let since_attempt = inner.last_attempt.map_or(i64::MAX, |t| now - t);
        if record.verdict == Some(Verdict::Conflict) {
            return !(0..CONFLICT_RETRY_SECS).contains(&since_attempt);
        }
        let trusted = inner.seen.trusted_now(now);
        let urgent = inner.claims.as_ref().is_none_or(|c| {
            trusted >= c.expires_at
                || (now >= quota::cycle(c).next_start && inner.cycle_retry_at.is_none_or(|t| now >= t))
        }) || record.verdict == Some(Verdict::Expired)
            || inner.seen.rolled_back(now);
        let routine = now - record.validated_at >= VALIDATE_EVERY_SECS || now < record.validated_at;
        (urgent && since_attempt >= URGENT_RETRY_SECS) || (routine && since_attempt >= ROUTINE_RETRY_SECS)
    }

    /// Bắt đầu phiên trả phí lúc `now`: có nên `validate` chạy nền không (lần thành công gần nhất đã quá 1 giờ).
    pub fn quick_check_due(&self, now: i64) -> bool {
        let inner = self.lock();
        let Some(record) = &inner.record else {
            return false;
        };
        self.server_configured
            && !self.dev_unlimited
            && inner.blocked_until.is_none_or(|t| now >= t)
            && self.quota_claims(&inner, now).is_some()
            && (now - record.validated_at >= QUICK_CHECK_SECS || now < record.validated_at)
    }

    /// Gọi định kỳ (mỗi phút): cộng thời gian đơn điệu, reset Free khi sang ngày, ghi giờ máy lớn nhất.
    pub fn tick(&self, now: i64, elapsed_ms: u64) {
        let mut inner = self.lock();
        if let Some(free) = inner.free.as_mut() {
            free.monotonic_ms = free.monotonic_ms.saturating_add(elapsed_ms);
        }
        inner.seen.observe_machine(now);
        let _ = store::write(self.vault.as_ref(), store::SEEN, &inner.seen);
        // Lần ghi trước bị từ chối thì bộ đếm trong bộ nhớ vẫn đúng: ghi lại, không đọc bản cũ trong kho khóa (N1 của review 06
        // lần 1). Chỉ đọc lại khi chưa có bộ đếm (đọc lỗi lúc khởi động).
        let stored = inner.free.clone();
        if stored.is_none() {
            self.resolve_free_locked(&mut inner, now);
        } else {
            let (counter, reset) = self.zone.resolve_free(stored, true, now, &inner.seen);
            if reset {
                inner.warned = None;
            }
            inner.free = Some(counter);
            save_free(self.vault.as_ref(), &mut inner);
        }
        if inner.paid_error
            && let Some(counter) = inner.paid.clone()
        {
            inner.paid_error = store::save_paid(self.vault.as_ref(), &counter).is_err();
        }
    }

    /// Còn bao nhiêu mili giây (`None`: không giới hạn) theo gói hiệu lực.
    fn remaining_locked(&self, inner: &Inner, now: i64) -> Option<u64> {
        if self.dev_unlimited {
            return None;
        }
        if let Some(claims) = self.quota_claims(inner, now) {
            if inner.paid_error {
                return Some(0);
            }
            return inner
                .paid
                .as_ref()
                .map_or(Some(0), |c| quota::paid_remaining(&claims, c));
        }
        if inner.free_error {
            return Some(0);
        }
        Some(inner.free.as_ref().map_or(0, quota::free_remaining))
    }

    fn trial_state_locked(&self, inner: &Inner, now: i64) -> TrialState {
        let Some(trial) = &inner.trial else {
            return TrialState::Missing;
        };
        if inner.seen.trusted_now(now) >= trial.ends_at {
            TrialState::Ended
        } else if inner.seen.rolled_back(now) {
            TrialState::RolledBack
        } else {
            TrialState::Active
        }
    }

    /// Người dùng đã đồng ý điều khoản (bước 1b, hay đã xong các bước lần đầu mở ở lần chạy trước): từ giờ ticker được
    /// đăng ký dùng thử chạy nền, vì request gửi `device_id_hash` (spec 2026-10-07 §3.2).
    pub fn allow_trial(&self) {
        self.lock().trial_allowed = true;
    }

    /// Ticker có nên gọi `POST /v1/trial` lúc `now` không: đã được phép, có server, chưa có token dùng thử, lần thử trước
    /// đã quá 1 giờ, và không đang chờ `Retry-After`.
    pub fn trial_due(&self, now: i64) -> bool {
        let inner = self.lock();
        self.server_configured
            && !self.machine.id_hash.is_empty()
            && inner.trial_allowed
            && inner.trial.is_none()
            && inner.trial_blocked_until.is_none_or(|t| now >= t)
            && inner
                .trial_attempt
                .is_none_or(|t| now - t >= ROUTINE_RETRY_SECS || now < t)
    }

    /// Đăng ký dùng thử của máy này (hay lấy lại token của lần trước, server giữ đúng `started_at` cũ): kiểm token, lưu
    /// kho khóa.
    /// - Không đọc được mã máy: không gọi server, log cảnh báo một lần, trả [`LicenseError::NoMachineId`].
    /// - Mỗi lúc chỉ một lần gọi server (`trial_gate`); đã có token (do lần gọi trước) thì xong ngay; đang chờ `Retry-After`
    ///   của `429` thì trả [`LicenseError::RateLimited`] với số giây còn lại, không gọi server.
    /// - Kho khóa không ghi được token: token vẫn nằm trong bộ nhớ (lần Bắt đầu sau không gọi server lại) và trả
    ///   [`LicenseError::Storage`]; mở lại app thì đăng ký lại, server trả đúng `started_at` cũ.
    pub fn register_trial(&self, now: i64) -> Result<(), LicenseError> {
        if self.machine.id_hash.is_empty() {
            if !std::mem::replace(&mut self.lock().warned_no_machine, true) {
                log::error!("không đọc được mã máy: không đăng ký được dùng thử");
            }
            return Err(LicenseError::NoMachineId);
        }
        let _one_at_a_time = self.trial_gate.lock().unwrap_or_else(|e| e.into_inner());
        {
            let mut inner = self.lock();
            if inner.trial.is_some() {
                return Ok(());
            }
            if let Some(until) = inner.trial_blocked_until.filter(|&t| now < t) {
                return Err(LicenseError::RateLimited(Some((until - now) as u64)));
            }
            inner.trial_attempt = Some(now);
        }
        let reply = self.api.trial(&self.machine.id_hash);
        self.observe(&reply);
        let grant = reply.result.map_err(map_api).inspect_err(|e| {
            if let LicenseError::RateLimited(after) = e {
                self.lock().trial_blocked_until = Some(now + after.map_or(ROUTINE_RETRY_SECS, |s| s as i64));
            }
        })?;
        let claims = trial::verify(&grant.token, &self.keys, &self.machine.id_hash)
            .map_err(|e| LicenseError::BadToken(e.to_string()))?;
        let saved = store::write(self.vault.as_ref(), store::TRIAL, &TrialRecord { token: grant.token });
        let mut inner = self.lock();
        inner.seen.observe_signed(claims.issued_at);
        inner.trial = Some(claims);
        saved.map_err(|e| {
            log::warn!("không lưu được token dùng thử: {e}");
            LicenseError::Storage(e.to_string())
        })
    }

    /// Lý do của gói trả phí khiến máy phải chạy Free, khi khách đã có license mà gói không dùng được lúc này; `None` khi
    /// chưa từng có license (hay bản cài không chính hãng: chỉ chạy Free).
    fn license_block_locked(&self, inner: &Inner, now: i64) -> Option<StartBlock> {
        match self.standing_locked(inner, now) {
            Standing::ClockRolledBack => Some(StartBlock::ClockRolledBack),
            Standing::Conflict => Some(StartBlock::LicenseConflict),
            Standing::RefreshNeeded | Standing::Unverified => Some(StartBlock::LicenseNeedsRefresh),
            Standing::Revoked => Some(StartBlock::LicenseRevoked),
            Standing::Expired => Some(StartBlock::LicenseExpired),
            Standing::Free | Standing::Active | Standing::NotGenuine => None,
        }
    }

    /// Vì sao chưa bắt đầu được phiên lúc `now`; `None` là bắt đầu được (spec 2026-10-07 §3.2, §6). Ở Free mà chưa có token
    /// dùng thử thì đăng ký ngay: có gọi server, nên nơi gọi chạy trên luồng nền.
    ///
    /// Máy không chạy theo gói trả phí thì chạy Free theo dùng thử. Dùng thử còn hiệu lực thì Free chạy. Không còn dùng thử mà
    /// khách có license không dùng được (xung đột, cần làm mới, giờ máy lùi, bị thu hồi, hết hạn) thì nêu lý do của gói trả
    /// phí, không báo "hết dùng thử, mua gói"; chỉ khách Free thật sự mới nhận lý do của dùng thử.
    pub fn start_block(&self, now: i64) -> Option<StartBlock> {
        if self.dev_unlimited {
            return None;
        }
        let free = {
            let inner = self.lock();
            self.quota_claims(&inner, now).is_none()
        };
        if free {
            let mut registration = None;
            let missing = self.lock().trial.is_none();
            if missing
                && self.server_configured
                && let Err(e) = self.register_trial(now)
            {
                log::info!("chưa đăng ký được dùng thử: {}", e.code());
                registration = Some(e);
            }
            let inner = self.lock();
            let trial = self.trial_state_locked(&inner, now);
            if !matches!(trial, TrialState::Active) {
                if let Some(block) = self.license_block_locked(&inner, now) {
                    return Some(block);
                }
                return Some(match (trial, registration) {
                    (TrialState::Ended, _) => StartBlock::TrialEnded,
                    (TrialState::RolledBack, _) => StartBlock::ClockRolledBack,
                    (_, Some(LicenseError::Network | LicenseError::NotConfigured) | None) => StartBlock::TrialMissing,
                    (_, Some(e)) => StartBlock::TrialUnavailable(e.code()),
                });
            }
        }
        (self.remaining_locked(&self.lock(), now) == Some(0)).then_some(StartBlock::QuotaExhausted)
    }

    /// Có bắt đầu được phiên không ([`License::start_block`]).
    pub fn can_start(&self, now: i64) -> bool {
        self.start_block(now).is_none()
    }

    /// Cộng `speech_ms` vừa dịch xong. Trả `Break` khi đã chạm hạn mức: engine dừng phiên (`quota_exhausted`).
    pub fn add_usage(&self, speech_ms: u64, now: i64) -> ControlFlow<()> {
        if self.dev_unlimited {
            return ControlFlow::Continue(());
        }
        let vault = self.vault.as_ref();
        let mut inner = self.lock();
        let paid_claims = self.quota_claims(&inner, now);
        if let Some(free) = inner.free.as_mut() {
            free.used_ms = free.used_ms.saturating_add(speech_ms);
        }
        if let Some(claims) = &paid_claims
            && let Some(counter) = inner.paid.as_mut()
        {
            counter.used_ms = counter.used_ms.saturating_add(speech_ms);
            let counter = counter.clone();
            inner.paid_error = store::save_paid(vault, &counter).is_err();
            // Hết hạn mức gói trả phí thì Free của ngày đó cũng hết (§6.8).
            if quota::paid_remaining(claims, &counter) == Some(0)
                && let Some(free) = inner.free.as_mut()
            {
                free.used_ms = free.used_ms.max(quota::FREE_DAILY_MS);
            }
        }
        save_free(vault, &mut inner);
        if self.remaining_locked(&inner, now) == Some(0) {
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    }

    /// `true` đúng một lần cho mỗi bộ đếm khi hạn mức còn từ 5 phút trở xuống (§4.2 bước 2).
    pub fn take_warning(&self, now: i64) -> bool {
        let mut inner = self.lock();
        let Some(remaining) = self.remaining_locked(&inner, now) else {
            return false;
        };
        if remaining == 0 || remaining > quota::WARN_REMAINING_MS {
            return false;
        }
        let which = match (&self.quota_claims(&inner, now), &inner.paid) {
            (Some(_), Some(c)) => store::paid_name(&c.key),
            _ => format!("free-{}", inner.free.as_ref().map_or(0, |f| f.reset_at)),
        };
        if inner.warned.as_deref() == Some(which.as_str()) {
            return false;
        }
        inner.warned = Some(which);
        true
    }

    pub fn view(&self, now: i64) -> LicenseView {
        let inner = self.lock();
        let standing = self.standing_locked(&inner, now);
        let active = self.active_claims(&inner, now);
        let remaining = self.remaining_locked(&inner, now);
        let quota = match (&self.quota_claims(&inner, now), &inner.paid) {
            _ if self.dev_unlimited => QuotaView {
                unlimited: true,
                limit_ms: 0,
                used_ms: 0,
                remaining_ms: 0,
                reset_at: None,
                reset_kind: ResetKind::Cycle,
                needs_network: false,
                lost: false,
                storage_error: false,
            },
            (Some(claims), counter) => {
                let cycle = quota::cycle(claims);
                let (reset_at, reset_kind) = if claims.expires_at < cycle.next_start {
                    (claims.expires_at, ResetKind::Expiry)
                } else {
                    (cycle.next_start, ResetKind::Cycle)
                };
                QuotaView {
                    unlimited: cycle.limit_ms.is_none(),
                    limit_ms: cycle.limit_ms.unwrap_or(0),
                    used_ms: counter.as_ref().map_or(0, |c| c.used_ms),
                    remaining_ms: remaining.unwrap_or(0),
                    reset_at: Some(reset_at),
                    reset_kind,
                    needs_network: now >= cycle.next_start,
                    lost: counter.as_ref().is_some_and(|c| c.lost),
                    storage_error: inner.paid_error,
                }
            }
            (None, _) => QuotaView {
                unlimited: false,
                limit_ms: quota::FREE_DAILY_MS,
                used_ms: inner.free.as_ref().map_or(0, |f| f.used_ms),
                remaining_ms: remaining.unwrap_or(0),
                reset_at: inner.free.as_ref().map(|f| self.zone.free_reset_time(f)),
                reset_kind: ResetKind::Daily,
                needs_network: false,
                lost: inner.free.as_ref().is_some_and(|f| f.lost),
                storage_error: inner.free_error,
            },
        };
        let stored = inner.claims.as_ref();
        let trusted = inner.seen.trusted_now(now);
        let trial = TrialView {
            status: match self.trial_state_locked(&inner, now) {
                TrialState::Missing => TrialStatus::None,
                TrialState::Ended => TrialStatus::Ended,
                TrialState::Active | TrialState::RolledBack => TrialStatus::Active,
            },
            ends_at: inner.trial.as_ref().map(|t| t.ends_at),
            days_left: inner.trial.as_ref().map_or(0, |t| {
                ((t.ends_at - trusted).max(0) as u64).div_ceil(quota::DAY_SECS as u64) as i64
            }),
        };
        LicenseView {
            standing,
            plan: match (&active, self.dev_unlimited) {
                (_, true) => "yearly".into(),
                (Some(c), _) => plan_code(c.plan).into(),
                (None, _) => "free".into(),
            },
            licensed_plan: stored.map(|c| c.plan),
            key: inner.record.as_ref().map(|r| key::masked(&r.key)),
            expires_at: stored.map(|c| c.expires_at),
            refresh_before: stored.map(|c| c.refresh_before),
            validated_at: inner.record.as_ref().map(|r| r.validated_at),
            renew_soon: stored.is_some_and(|c| c.expires_at - now <= RENEW_WARNING_SECS),
            quota,
            server_configured: self.server_configured,
            dev_override: self.dev_unlimited,
            clock_rolled_back: inner.seen.rolled_back(now),
            trial,
            conflict: inner
                .record
                .as_ref()
                .filter(|r| r.verdict == Some(Verdict::Conflict))
                .map(|r| ConflictView {
                    devices: r.devices.clone(),
                    this_activation_id: r.activation_id.clone(),
                }),
        }
    }

    /// Chưa có license mà giờ máy bị coi là chỉnh lùi (thường là giờ máy từng đặt nhầm tới trước rồi chỉnh lại): hỏi giờ
    /// của server bằng một request nhẹ (`GET /v1/plans`), tối đa 5 phút một lần, để header `Date` hạ mốc về giờ thật (Q2 của
    /// review 06 lần 1). Có license thì việc này là của `validate`.
    pub fn refresh_clock(&self, now: i64) {
        {
            let mut inner = self.lock();
            // Bộ đếm Free vừa kéo về mà đã sang ngày mới: cần `Date` để reset (QB của review 06 lần 2).
            let pulled_new_day = inner
                .free
                .as_ref()
                .is_some_and(|f| f.clock_pulled && self.zone.local_day(now) > f.day);
            if !self.server_configured
                || inner.record.is_some()
                || !(inner.seen.rolled_back(now) || pulled_new_day)
                || inner.clock_check_at.is_some_and(|t| now - t < URGENT_RETRY_SECS)
            {
                return;
            }
            inner.clock_check_at = Some(now);
        }
        let reply = self.api.plans();
        self.observe(&reply);
    }

    pub fn api(&self) -> &dyn LicenseApi {
        self.api.as_ref()
    }

    /// Key đã kích hoạt (dạng lưu trữ), cho đơn gia hạn hay đổi gói.
    pub fn license_key(&self) -> Option<String> {
        self.lock().record.as_ref().map(|r| r.key.clone())
    }

    pub fn vault(&self) -> &dyn Vault {
        self.vault.as_ref()
    }

    pub fn observe_reply<T>(&self, reply: &Reply<T>) {
        self.observe(reply);
    }
}

/// `activation_id` do server cấp là UUID (36 ký tự, gạch nối ở vị trí 8, 13, 18, 23, còn lại là chữ số hex).
fn is_uuid(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => b == b'-',
            _ => b.is_ascii_hexdigit(),
        })
}

pub fn plan_code(plan: Plan) -> &'static str {
    match plan {
        Plan::Monthly => "monthly",
        Plan::Yearly => "yearly",
    }
}

#[cfg(test)]
pub mod tests {
    use std::collections::VecDeque;
    use std::sync::Arc;
    use std::sync::atomic::AtomicUsize;

    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::{Value, json};

    use super::*;
    use crate::license::client::{Checkout, OrderStatus, PlanOffer, ServerError, TrialGrant};
    use crate::license::store::tests::FakeVault;

    /// 2026-10-01 00:00:00 UTC.
    pub const T0: i64 = 1_790_812_800;
    pub const DAY: i64 = 86_400;
    pub const KEY: &str = "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5";
    pub const DEVICE: &str = "19a1a8158951ecebddefb479e098dbc84c018c897ea6d4b8c5fc024051306b4f";
    const MIN: u64 = 60_000;

    fn vectors() -> Value {
        serde_json::from_str(include_str!("../../../server/test/vectors/token-v1.json")).unwrap()
    }

    pub fn test_keys() -> PublicKeys {
        let v = vectors();
        let pairs = v["public_keys"].as_object().unwrap().clone();
        PublicKeys::from_pairs(pairs.iter().map(|(k, x)| (k.as_str(), x.as_str().unwrap()))).unwrap()
    }

    /// Ký token như server (khóa `test-1` của bộ vector).
    pub fn sign(claims: &Value) -> String {
        let v = vectors();
        let seed: [u8; 32] = URL_SAFE_NO_PAD
            .decode(v["test_keys"][0]["seed_b64url"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap();
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(claims).unwrap());
        let input = format!("v1.{payload}");
        let sig = SigningKey::from_bytes(&seed).sign(input.as_bytes());
        format!("{input}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes()))
    }

    /// Claims của một license Monthly (hạn mức 1800 phút cho gọn số), kích hoạt lúc `T0`, cấp lúc `issued_at`.
    pub fn claims(issued_at: i64) -> Value {
        json!({
            "kid": "test-1", "license_id": "lic", "activation_id": "act", "activation_created_at": T0,
            "device_id_hash": DEVICE, "plan": "monthly", "expires_at": T0 + 30 * DAY, "cycle_anchor": T0,
            "quota_minutes_per_cycle": 1800, "quota_epoch": 0, "quota_fresh": false,
            "issued_at": issued_at, "refresh_before": issued_at + 14 * DAY,
        })
    }

    pub fn granted(c: &Value, fresh: bool) -> Result<Granted, ApiError> {
        Ok(Granted {
            token: sign(c),
            activation_id: c["activation_id"].as_str().unwrap().into(),
            quota_fresh: fresh,
        })
    }

    /// Token dùng thử như server cấp cho `device`.
    pub fn trial_grant(device: &str, started_at: i64, ends_at: i64, issued_at: i64) -> Result<TrialGrant, ApiError> {
        let claims = json!({
            "typ": "trial", "kid": "test-1", "device_id_hash": device,
            "started_at": started_at, "ends_at": ends_at, "issued_at": issued_at,
        });
        Ok(TrialGrant {
            token: sign(&claims),
            started_at,
            ends_at,
            issued_at,
        })
    }

    /// Dùng thử mặc định của server giả khi test không xếp kết quả nào: còn hiệu lực rất lâu, cấp từ trước mọi mốc giờ của
    /// test, để các test không nói về dùng thử chạy như trước (kể cả test của app dùng giờ thật).
    pub const TRIAL_FOREVER_START: i64 = T0 - 400 * DAY;
    pub const TRIAL_FOREVER_END: i64 = T0 + 3650 * DAY;

    pub fn server(status: u16, code: &str) -> ApiError {
        ApiError::Server(Box::new(ServerError {
            status,
            code: code.into(),
            ..ServerError::default()
        }))
    }

    /// Server giả: trả lần lượt các kết quả đã xếp cho `activate`, `validate`, `deactivate`, `trial`; ghi lại các lần gọi.
    /// Chưa xếp kết quả `trial` nào thì trả dùng thử mặc định ([`TRIAL_FOREVER_START`]).
    #[derive(Default)]
    pub struct FakeApi {
        pub replies: Mutex<VecDeque<Result<Granted, ApiError>>>,
        pub trials: Mutex<VecDeque<Result<TrialGrant, ApiError>>>,
        pub deactivations: Mutex<VecDeque<Result<(), ApiError>>>,
        pub checkouts: Mutex<VecDeque<Result<Checkout, ApiError>>>,
        pub orders: Mutex<VecDeque<Result<OrderStatus, ApiError>>>,
        pub calls: Mutex<Vec<String>>,
        pub date: Mutex<Option<i64>>,
        /// Có thì lần `validate` kế tiếp chờ tới khi nhận tín hiệu: test mô phỏng response tới muộn.
        pub validate_hold: Mutex<Option<std::sync::mpsc::Receiver<()>>>,
        /// Số lần `validate` đã trả kết quả (sau khi hết chờ).
        pub validate_returned: AtomicUsize,
        /// Như `validate_hold`, cho lần `trial` kế tiếp.
        pub trial_hold: Mutex<Option<std::sync::mpsc::Receiver<()>>>,
    }

    impl FakeApi {
        fn next(&self, call: String) -> Reply<Granted> {
            self.calls.lock().unwrap().push(call);
            self.reply()
        }

        fn reply(&self) -> Reply<Granted> {
            Reply {
                result: self
                    .replies
                    .lock()
                    .unwrap()
                    .pop_front()
                    .unwrap_or(Err(ApiError::Network("hết".into()))),
                date: *self.date.lock().unwrap(),
            }
        }
    }

    impl LicenseApi for Arc<FakeApi> {
        fn plans(&self) -> Reply<Vec<PlanOffer>> {
            self.calls.lock().unwrap().push("plans".into());
            Reply {
                result: Ok(Vec::new()),
                date: *self.date.lock().unwrap(),
            }
        }
        fn checkout(&self, plan: &str, email: &str, key: Option<&str>) -> Reply<Checkout> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("checkout {plan} {email} {}", key.unwrap_or("-")));
            Reply {
                result: self
                    .checkouts
                    .lock()
                    .unwrap()
                    .pop_front()
                    .unwrap_or(Err(ApiError::NotConfigured)),
                date: None,
            }
        }
        fn order(&self, code: i64, token: &str) -> Reply<OrderStatus> {
            self.calls.lock().unwrap().push(format!("order {code} {token}"));
            Reply {
                result: self
                    .orders
                    .lock()
                    .unwrap()
                    .pop_front()
                    .unwrap_or(Err(ApiError::NotConfigured)),
                date: None,
            }
        }
        fn activate(&self, key: &str, device: &str, label: Option<&str>, allow_conflict: bool) -> Reply<Granted> {
            let anyway = if allow_conflict { " allow_conflict" } else { "" };
            self.next(format!("activate {key} {device} {}{anyway}", label.unwrap_or("-")))
        }
        fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("validate {key} {activation_id}"));
            let hold = self.validate_hold.lock().unwrap().take();
            if let Some(release) = hold {
                let _ = release.recv();
            }
            let reply = self.reply();
            self.validate_returned.fetch_add(1, Ordering::SeqCst);
            reply
        }
        fn deactivate(&self, key: &str, activation_id: &str) -> Reply<()> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("deactivate {key} {activation_id}"));
            Reply {
                result: self.deactivations.lock().unwrap().pop_front().unwrap_or(Ok(())),
                date: None,
            }
        }
        fn recover(&self, _: &str) -> Reply<()> {
            Reply {
                result: Ok(()),
                date: None,
            }
        }
        fn trial(&self, device: &str) -> Reply<TrialGrant> {
            self.calls.lock().unwrap().push(format!("trial {device}"));
            let hold = self.trial_hold.lock().unwrap().take();
            if let Some(release) = hold {
                let _ = release.recv();
            }
            Reply {
                result: self.trials.lock().unwrap().pop_front().unwrap_or_else(|| {
                    trial_grant(device, TRIAL_FOREVER_START, TRIAL_FOREVER_END, TRIAL_FOREVER_START)
                }),
                date: *self.date.lock().unwrap(),
            }
        }
    }

    impl Vault for Arc<FakeVault> {
        fn get(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
            self.as_ref().get(name)
        }
        fn set(&self, name: &str, value: &[u8]) -> Result<(), String> {
            self.as_ref().set(name, value)
        }
        fn delete(&self, name: &str) -> Result<(), String> {
            self.as_ref().delete(name)
        }
    }

    pub fn vn() -> Zone {
        Zone::Fixed(FixedOffset::east_opt(7 * 3600).unwrap())
    }

    /// `License` vừa tạo, chưa có kết quả kiểm chữ ký bản cài.
    pub fn license_unchecked(api: &Arc<FakeApi>, vault: &Arc<FakeVault>, now: i64) -> License {
        License::new(
            Box::new(api.clone()),
            Box::new(vault.clone()),
            test_keys(),
            Machine {
                id_hash: DEVICE.into(),
                label: Some("Mac".into()),
            },
            vn(),
            true,
            false,
            false,
            now,
        )
    }

    /// `License` của bản cài đã kiểm chữ ký xong (chính hãng).
    pub fn license(api: &Arc<FakeApi>, vault: &Arc<FakeVault>, now: i64) -> License {
        let l = license_unchecked(api, vault, now);
        l.set_genuine(true);
        l
    }

    fn activated(now: i64, fresh: bool) -> (Arc<FakeApi>, Arc<FakeVault>, License) {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, now);
        api.replies.lock().unwrap().push_back(granted(&claims(now), fresh));
        l.activate(KEY, now).unwrap();
        (api, vault, l)
    }

    #[test]
    fn a_first_run_is_free_with_thirty_minutes_that_stop_the_session_when_used_up() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        let v = l.view(T0);
        assert_eq!(
            (v.standing, v.plan.as_str(), v.quota.remaining_ms),
            (Standing::Free, "free", 30 * MIN)
        );
        assert!(l.can_start(T0) && !l.is_pro(T0));
        assert!(l.add_usage(29 * MIN, T0).is_continue());
        assert!(l.add_usage(MIN, T0).is_break(), "chạm hạn mức thì engine dừng phiên");
        assert!(!l.can_start(T0), "hạn mức còn 0 thì không bắt đầu phiên");
        // Mở lại app cùng ngày: bộ đếm còn nguyên.
        assert!(!license(&api, &vault, T0 + 60).can_start(T0 + 60));
        // Hôm sau, đủ 20 giờ: mở lại.
        let next = T0 + 21 * 3600;
        let l = license(&api, &vault, next);
        assert!(l.can_start(next));
        assert_eq!(l.view(next).quota.reset_kind, ResetKind::Daily);
    }

    #[test]
    fn a_missing_free_counter_after_earlier_runs_counts_as_used_up() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        license(&api, &vault, T0);
        vault.items.lock().unwrap().remove(store::FREE);
        let l = license(&api, &vault, T0 + 60);
        let v = l.view(T0 + 60);
        assert!(!l.can_start(T0 + 60));
        assert!(v.quota.lost, "báo mất bản ghi, hướng dẫn liên hệ hỗ trợ");
    }

    #[test]
    fn activating_checks_the_key_locally_then_uses_the_fresh_flag_of_the_reply() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        assert_eq!(
            l.activate("0123-4567-89AB-CDEF-GHJK-MNPQ-RST0", T0),
            Err(LicenseError::InvalidKey)
        );
        assert!(api.calls.lock().unwrap().is_empty(), "gõ sai thì không gọi server");
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0).unwrap();
        assert_eq!(
            api.calls.lock().unwrap()[0],
            format!("activate 0123456789ABCDEFGHJKMNPQRST5 {DEVICE} Mac")
        );
        let v = l.view(T0);
        assert_eq!(
            (v.standing, v.plan.as_str(), v.key.as_deref()),
            (Standing::Active, "monthly", Some("••••-••••-••••-••••-••••-••••-RST5"))
        );
        assert_eq!(
            (v.quota.limit_ms, v.quota.remaining_ms, v.quota.lost),
            (1800 * MIN, 1800 * MIN, false)
        );
        assert!(l.is_pro(T0));
    }

    #[test]
    fn server_refusals_are_reported_with_their_details() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        let devices = vec![Device {
            activation_id: "a1".into(),
            device_label: None,
            last_validated_at: Some(T0),
        }];
        api.replies.lock().unwrap().extend([
            Err(conflict_error("key_in_use", &["a1"])),
            Err(server(423, "license_locked")),
            Err(ApiError::Server(Box::new(ServerError {
                status: 429,
                code: "rate_limited".into(),
                retry_after: Some(60),
                ..ServerError::default()
            }))),
        ]);
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::KeyInUse(devices)));
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::Locked));
        assert_eq!(
            l.activate(KEY, T0),
            Err(LicenseError::RateLimited(Some(60))),
            "429 không có nghĩa là key sai"
        );
        assert_eq!(l.view(T0).standing, Standing::Free);
    }

    /// Token đọc lại từ kho khóa không bao giờ là `fresh`: mở lại app dùng tiếp bộ đếm đã có.
    #[test]
    fn a_relaunch_keeps_the_paid_counter() {
        let (api, vault, l) = activated(T0, true);
        assert!(l.add_usage(100 * MIN, T0).is_continue());
        let l = license(&api, &vault, T0 + 60);
        assert_eq!(l.view(T0 + 60).quota.used_ms, 100 * MIN);
        // Xóa bộ đếm (còn bản ghi đánh dấu): mất bản ghi, đã dùng hết chu kỳ.
        let names: Vec<String> = vault
            .items
            .lock()
            .unwrap()
            .keys()
            .filter(|k| k.starts_with("quota-paid-"))
            .cloned()
            .collect();
        for n in names {
            vault.items.lock().unwrap().remove(&n);
        }
        let l = license(&api, &vault, T0 + 120);
        let v = l.view(T0 + 120);
        assert!((v.quota.lost, v.quota.remaining_ms) == (true, 0) && !l.can_start(T0 + 120));
    }

    #[test]
    fn paid_minutes_also_count_for_free_and_a_used_up_plan_uses_up_free_for_the_day() {
        let mut c = claims(T0);
        c["quota_minutes_per_cycle"] = json!(15);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        assert!(l.add_usage(4 * MIN, T0).is_continue());
        assert!(l.add_usage(11 * MIN, T0).is_break());
        // Gỡ kích hoạt cùng ngày: Free hôm đó cũng đã hết.
        l.deactivate(None).unwrap();
        let v = l.view(T0);
        assert_eq!((v.plan.as_str(), v.quota.remaining_ms), ("free", 0));
    }

    #[test]
    fn validate_results_move_the_machine_to_the_right_standing() {
        // Máy bị gỡ từ xa: về Free, xóa bản ghi license.
        let (api, vault, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(404, "activation_not_found")));
        assert_eq!(l.validate(T0 + DAY), Err(LicenseError::Deactivated));
        assert_eq!(l.view(T0 + DAY).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
        // Thu hồi: giữ key, không còn Pro.
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(403, "license_revoked")));
        assert_eq!(l.validate(T0 + DAY), Err(LicenseError::Revoked));
        assert_eq!(l.view(T0 + DAY).standing, Standing::Revoked);
        assert!(!l.is_pro(T0 + DAY));
        // Lỗi mạng: giữ gói tới `refresh_before` (14 ngày), rồi về Free.
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        assert_eq!(l.validate(T0 + 2 * DAY), Err(LicenseError::Network));
        assert!(l.is_pro(T0 + 14 * DAY - 1));
        assert_eq!(l.view(T0 + 14 * DAY).standing, Standing::RefreshNeeded);
        // Quá `expires_at`: hết hạn.
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 2 * DAY);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        // Chờ lần `validate` đầu sau mốc tối đa 5 phút (N4 của review 06 lần 1), rồi hết hạn.
        assert_eq!(l.view(T0 + 2 * DAY).standing, Standing::Active);
        assert_eq!(l.view(T0 + 2 * DAY + EXPIRY_GRACE_SECS).standing, Standing::Expired);
        assert!(l.view(T0 + DAY).renew_soon);
    }

    /// Giờ máy chỉnh lùi quá 10 phút so với mốc lớn nhất từng thấy: không tin token tới khi `validate` lại (§10.2).
    #[test]
    fn a_clock_moved_back_needs_an_online_check() {
        let (_, _, l) = activated(T0, true);
        l.tick(T0 + 3600, 0);
        assert!(l.is_pro(T0 + 3600 - 600));
        let back = T0 + 3600 - 601;
        assert_eq!(l.view(back).standing, Standing::ClockRolledBack);
        assert!(!l.is_pro(back));
        assert!(l.validate_due(back));
        // Giờ máy từng đặt tới trước một năm rồi chỉnh lại đúng: `validate` thành công, header `Date` của server hạ mốc
        // về giờ thật, gói dùng lại được (không bị coi là chỉnh lùi mãi).
        let (api, _, ahead) = activated(T0, true);
        ahead.tick(T0 + 365 * DAY, 0);
        assert_eq!(ahead.view(T0 + DAY).standing, Standing::ClockRolledBack);
        *api.date.lock().unwrap() = Some(T0 + DAY);
        api.replies.lock().unwrap().push_back(granted(&claims(T0 + DAY), false));
        ahead.validate(T0 + DAY).unwrap();
        assert_eq!(ahead.view(T0 + DAY).standing, Standing::Active);
    }

    /// Token server trả phải đúng activation trong response (§6.8): sai thì không lưu, vẫn Free.
    #[test]
    fn a_token_for_another_activation_is_refused() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        let mut reply = granted(&claims(T0), true);
        if let Ok(g) = reply.as_mut() {
            g.activation_id = "act-khac".into();
        }
        api.replies.lock().unwrap().push_back(reply);
        assert!(matches!(l.activate(KEY, T0), Err(LicenseError::BadToken(_))));
        assert_eq!(l.view(T0).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
    }

    /// Phút dịch lúc ở gói trả phí cũng cộng vào Free của ngày; hết hạn mức gói trả phí thì Free của ngày cũng hết
    /// (§6.8).
    #[test]
    fn paid_minutes_also_count_against_free_and_a_used_up_plan_ends_free_for_the_day() {
        let after = T0 + 3600 + EXPIRY_GRACE_SECS;
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 3600);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        assert!(l.add_usage(3 * 60_000, T0 + 60).is_continue());
        assert_eq!(l.view(after).standing, Standing::Expired);
        assert_eq!(l.view(after).quota.used_ms, 3 * 60_000, "Free của ngày đã cộng 3 phút");
        // Gói 1 phút mỗi chu kỳ: dùng hết thì Free của ngày cũng hết.
        c["quota_minutes_per_cycle"] = json!(1);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        assert!(l.add_usage(60_000, T0 + 60).is_break());
        assert_eq!(l.view(after).quota.remaining_ms, 0);
        assert!(!l.can_start(after));
    }

    /// Kho khóa lỗi thì coi như đã hết hạn mức (QĐ13 của 06): khi ghi bộ đếm gói trả phí, và khi đọc bộ đếm Free.
    #[test]
    fn a_failing_keystore_counts_as_a_used_up_quota() {
        let (_, vault, l) = activated(T0, true);
        *vault.fail_writes_of.lock().unwrap() = Some("quota-paid-".into());
        let _ = l.add_usage(1000, T0 + 60);
        assert!(!l.can_start(T0 + 60));
        assert!(l.view(T0 + 60).quota.storage_error);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        *vault.fail_reads.lock().unwrap() = true;
        let l = license(&api, &vault, T0);
        assert!(!l.can_start(T0));
        assert!(l.view(T0).quota.storage_error);
    }

    /// Qua `expires_at` thì gọi `validate` ngay (có thể đã gia hạn ở máy khác), không chờ đủ 24 giờ (§6.8).
    #[test]
    fn expiry_triggers_a_validate_right_away() {
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 3600);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        assert!(!l.validate_due(T0 + 3599));
        assert!(l.validate_due(T0 + 3600));
    }

    /// Giờ máy chậm từ trước lần mở app đầu (Q1 của review 06 lần 1): header `Date` của server cho thấy giờ máy lùi, gói
    /// trả phí không được tin tới khi giờ máy về đúng.
    #[test]
    fn a_machine_clock_behind_the_server_from_the_start_is_caught() {
        let year = 365 * DAY;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0 - year);
        *api.date.lock().unwrap() = Some(T0);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0 - year).unwrap();
        assert_eq!(l.view(T0 - year + 60).standing, Standing::ClockRolledBack);
        assert!(!l.is_pro(T0 - year + 60));
        assert!(
            !l.validate_due(T0 - year + 60),
            "vừa validate xong: lần thử gấp sau là sau 5 phút"
        );
        assert!(l.validate_due(T0 - year + 300));
        assert!(l.is_pro(T0 + 60), "giờ máy về đúng: dùng được");
        // Giờ máy chậm dưới 10 phút (chưa là chỉnh lùi) nhưng theo giờ server thì token đã hết hạn quá 5 phút: hết hạn.
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 3600);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        *api.date.lock().unwrap() = Some(T0 + 4000);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("chậm".into())));
        let _ = l.validate(T0 + 3500);
        assert_eq!(l.view(T0 + 3500).standing, Standing::Expired);
    }

    /// `license_expired`, `license_revoked` từ server đổi trạng thái ngay và được nhớ qua lần mở app sau, kể cả khi
    /// offline (QĐ14; Q1 của review 06 lần 1). Token mới từ server xóa trạng thái đó.
    #[test]
    fn expired_and_revoked_from_the_server_are_kept_across_restarts() {
        let (api, vault, l) = activated(T0, true);
        let t = T0 + 10 * DAY;
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(403, "license_expired")));
        assert!(matches!(l.validate(t), Err(LicenseError::Expired(_))));
        assert_eq!(l.view(t).standing, Standing::Expired);
        assert!(!l.is_pro(t));
        let reopened = license(&api, &vault, t + 60);
        assert_eq!(
            reopened.view(t + 60).standing,
            Standing::Expired,
            "mở lại app vẫn hết hạn"
        );
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(403, "license_revoked")));
        let _ = reopened.validate(t + 120);
        let reopened = license(&api, &vault, t + 180);
        assert_eq!(reopened.view(t + 180).standing, Standing::Revoked);
        // Gia hạn ở máy khác rồi `validate`: token mới, về Active.
        api.replies.lock().unwrap().push_back(granted(&claims(t + 240), false));
        reopened.validate(t + 240).unwrap();
        assert_eq!(reopened.view(t + 240).standing, Standing::Active);
    }

    /// Tới `expires_at` (có thể đã gia hạn ở máy khác): còn dùng được trong lúc chờ lần `validate` đầu sau mốc, tối đa 5
    /// phút, rồi mới về Free (N4 của review 06 lần 1). Lần thử đó lỗi mạng thì về Free ngay.
    #[test]
    fn at_expiry_the_plan_waits_for_one_validate_before_going_free() {
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 3600);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        let at = T0 + 3600;
        assert!(l.is_pro(at), "chưa validate sau mốc: còn dùng được");
        assert!(!l.is_pro(at + 301), "quá 5 phút: về Free");
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        let _ = l.validate(at + 30);
        assert!(!l.is_pro(at + 31), "lỗi mạng sau mốc: về Free");
        let mut renewed = claims(at + 60);
        renewed["expires_at"] = json!(at + 30 * DAY);
        api.replies.lock().unwrap().push_back(granted(&renewed, false));
        l.validate(at + 60).unwrap();
        assert!(l.is_pro(at + 61), "đã gia hạn ở máy khác: dùng tiếp");
    }

    /// Kho khóa từ chối ghi mà vẫn đọc được (N1 của review 06 lần 1): luật chặt giữ tới khi ghi lại được, và không đọc
    /// lại bộ đếm cũ (phút đã dùng không mất). Gói trả phí cũng vậy ở lần `validate` sau.
    #[test]
    fn a_keystore_that_refuses_writes_never_gives_minutes_back() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        *vault.fail_writes_of.lock().unwrap() = Some("quota-free".into());
        assert!(l.add_usage(3 * 60_000, T0 + 60).is_break());
        l.tick(T0 + 120, 60_000);
        assert!(!l.can_start(T0 + 120), "vẫn chặn khi chưa ghi được");
        *vault.fail_writes_of.lock().unwrap() = None;
        l.tick(T0 + 180, 60_000);
        assert!(l.can_start(T0 + 180));
        assert_eq!(l.view(T0 + 180).quota.used_ms, 3 * 60_000, "phút đã dùng không mất");
        let (api, vault, l) = activated(T0, true);
        *vault.fail_writes_of.lock().unwrap() = Some("quota-paid-".into());
        let _ = l.add_usage(3 * 60_000, T0 + 60);
        *vault.fail_writes_of.lock().unwrap() = None;
        api.replies.lock().unwrap().push_back(granted(&claims(T0 + 120), false));
        l.validate(T0 + 120).unwrap();
        assert_eq!(l.view(T0 + 120).quota.used_ms, 3 * 60_000);
        assert!(l.can_start(T0 + 120));
        // Không có `validate` nào: ticker ghi lại bộ đếm gói trả phí khi kho khóa nhận ghi trở lại.
        let (_, vault, l) = activated(T0, true);
        *vault.fail_writes_of.lock().unwrap() = Some("quota-paid-".into());
        let _ = l.add_usage(3 * 60_000, T0 + 60);
        assert!(!l.can_start(T0 + 60));
        *vault.fail_writes_of.lock().unwrap() = None;
        l.tick(T0 + 120, 60_000);
        assert!(l.can_start(T0 + 120));
    }

    /// Chưa kiểm xong chữ ký bản cài (vài giây đầu sau khi mở app): chưa mở Pro, nhưng cũng chưa báo "không chính hãng"
    /// (N5 của review 06 lần 1).
    #[test]
    fn pro_waits_for_the_build_check() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license_unchecked(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0).unwrap();
        assert!(!l.is_pro(T0));
        assert_eq!(l.view(T0).standing, Standing::Active);
        l.set_genuine(true);
        assert!(l.is_pro(T0));
        l.set_genuine(false);
        assert_eq!(l.view(T0).standing, Standing::NotGenuine);
    }

    /// Người dùng Free có giờ máy từng đặt tới trước rồi chỉnh lại (Q2 của review 06 lần 1): giao diện nhắc, và app hỏi giờ
    /// của server bằng một request nhẹ (`GET /v1/plans`), tối đa 5 phút một lần, tới khi giờ máy được tin lại.
    #[test]
    fn a_free_user_with_a_clock_set_ahead_gets_the_time_from_the_server() {
        let year = 365 * DAY;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0 + year);
        l.tick(T0, 60_000);
        assert!(l.view(T0).clock_rolled_back);
        l.refresh_clock(T0);
        l.refresh_clock(T0 + 60);
        assert_eq!(api.calls.lock().unwrap().len(), 1, "offline: tối đa 5 phút một lần");
        *api.date.lock().unwrap() = Some(T0 + 301);
        l.refresh_clock(T0 + 301);
        assert!(!l.view(T0 + 301).clock_rolled_back);
        l.refresh_clock(T0 + 700);
        assert_eq!(api.calls.lock().unwrap().len(), 2, "giờ máy đã được tin: không hỏi nữa");
    }

    /// Giờ máy lùi trước lần mở đầu mà response không có header `Date` (proxy TLS của người dùng xóa header, hay sửa mục
    /// `license-seen`; QA của review 06 lần 2): `issued_at` đã ký của token cho thấy giờ máy chậm, cả sau khi mở lại app.
    #[test]
    fn a_slow_clock_is_caught_by_the_signed_issue_time_without_any_date_header() {
        let year = 365 * DAY;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0 - year);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0 - year).unwrap();
        assert_eq!(l.view(T0 - year + 60).standing, Standing::ClockRolledBack);
        assert!(
            !l.is_pro(T0 - year + 300 * DAY),
            "300 ngày theo giờ giả: vẫn không dùng được"
        );
        vault.items.lock().unwrap().remove(store::SEEN);
        let reopened = license(&api, &vault, T0 - year + 120);
        assert_eq!(reopened.view(T0 - year + 120).standing, Standing::ClockRolledBack);
    }

    /// Giờ máy chậm 1 giờ (N1 của review 06 lần 2): `validate` thành công mà giờ máy vẫn bị coi là lùi thì lần thử sau là
    /// sau 5 phút (QĐ15), không phải mỗi phút.
    #[test]
    fn a_slow_clock_retries_validate_every_five_minutes() {
        let t = T0 - 3600;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, t);
        *api.date.lock().unwrap() = Some(T0);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, t).unwrap();
        assert!(!l.validate_due(t + 60));
        assert!(l.validate_due(t + 300));
        api.replies.lock().unwrap().push_back(granted(&claims(T0 + 300), false));
        l.validate(t + 300).unwrap();
        assert!(!l.validate_due(t + 360));
        assert!(l.validate_due(t + 600));
    }

    /// Chưa kiểm xong chữ ký bản cài: hạn mức vẫn theo gói trả phí, chỉ tính năng Pro chờ (N2 của review 06 lần 2), nên bấm
    /// Bắt đầu ngay sau khi mở app không bị từ chối vì Free của ngày đã hết.
    #[test]
    fn the_quota_follows_the_plan_while_the_build_check_runs() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license_unchecked(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0).unwrap();
        assert!(l.add_usage(quota::FREE_DAILY_MS, T0 + 60).is_continue());
        assert!(l.can_start(T0 + 60));
        assert_eq!(l.view(T0 + 60).quota.limit_ms, 1800 * 60_000);
        assert!(!l.is_pro(T0 + 60));
    }

    /// Bộ đếm Free vừa kéo về (giờ máy từng đặt tới trước): sang ngày mới thì app hỏi giờ của server, và reset bằng hiệu
    /// `Date` tính từ lần `Date` đầu sau khi kéo về, không cần 20 giờ app chạy (QB của review 06 lần 2).
    #[test]
    fn a_pulled_back_free_counter_resets_with_the_server_clock() {
        let year = 365 * DAY;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0 + year);
        let _ = l.add_usage(quota::FREE_DAILY_MS, T0 + year + 60);
        l.tick(T0, 60_000);
        assert!(!l.can_start(T0));
        *api.date.lock().unwrap() = Some(T0);
        l.refresh_clock(T0);
        assert!(!l.view(T0).clock_rolled_back);
        let next_day = T0 + 21 * 3600;
        *api.date.lock().unwrap() = Some(next_day);
        l.refresh_clock(next_day);
        l.tick(next_day, 60_000);
        assert!(l.can_start(next_day));
    }

    /// Có một `Date` cũ (từ 20 giờ trước) rồi tiến giờ, lùi về, tiến lại (N1 của review 06 lần 3): bộ đếm kéo về không lấy
    /// `Date` cũ làm mốc mà lấy `Date` đầu tiên sau khi kéo về, nên lần tiến thứ hai không mở thêm phút nào.
    #[test]
    fn an_old_date_does_not_open_minutes_after_a_pull_back() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let yesterday = T0 - 21 * 3600;
        let l = license(&api, &vault, yesterday);
        *api.date.lock().unwrap() = Some(yesterday);
        l.observe_reply(&api.plans());
        l.tick(T0, 60_000);
        let _ = l.add_usage(quota::FREE_DAILY_MS, T0 + 30);
        l.tick(T0 + DAY, 60_000);
        assert!(l.can_start(T0 + DAY), "lần tiến đầu: rủi ro đã chấp nhận");
        let _ = l.add_usage(quota::FREE_DAILY_MS, T0 + DAY + 30);
        l.tick(T0 + 60, 60_000);
        *api.date.lock().unwrap() = Some(T0 + 60);
        l.refresh_clock(T0 + 60);
        l.tick(T0 + DAY + 120, 60_000);
        assert!(!l.can_start(T0 + DAY + 120), "lần tiến thứ hai: không mở phút nào");
    }

    #[test]
    fn validate_runs_daily_at_cycle_boundaries_and_at_expiry_but_not_in_a_loop() {
        let (api, _, l) = activated(T0, true);
        assert!(!l.validate_due(T0 + 23 * 3600));
        assert!(l.validate_due(T0 + VALIDATE_EVERY_SECS));
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        let _ = l.validate(T0 + VALIDATE_EVERY_SECS);
        assert!(
            !l.validate_due(T0 + VALIDATE_EVERY_SECS + 600),
            "lỗi mạng: thử lại sau một giờ"
        );
        assert!(l.validate_due(T0 + VALIDATE_EVERY_SECS + 3600));
        // 429: chờ đúng `Retry-After`.
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Server(Box::new(ServerError {
                status: 429,
                code: "rate_limited".into(),
                retry_after: Some(7200),
                ..ServerError::default()
            }))));
        let t = T0 + 2 * DAY;
        let _ = l.validate(t);
        assert!(!l.validate_due(t + 3600));
        assert!(l.validate_due(t + 7200));
    }

    /// Giờ máy qua mốc chu kỳ kế tiếp thì gọi `validate`; token mới mà `issued_at` vẫn trước mốc (giờ máy nhanh) thì hẹn
    /// lại sau (mốc − `issued_at`) + 1 phút (§6.8).
    #[test]
    fn a_fast_machine_clock_at_the_cycle_boundary_retries_later() {
        let (api, _, l) = activated(T0 + DAY, true);
        let boundary = T0 + 30 * DAY;
        let mut c = claims(T0 + DAY);
        c["expires_at"] = json!(T0 + 90 * DAY);
        api.replies.lock().unwrap().push_back(granted(&c, false));
        l.validate(T0 + DAY + 10).unwrap();
        assert!(l.validate_due(boundary), "qua mốc chu kỳ thì gọi ngay");
        // Server cấp token lúc mốc − 2 giờ (giờ máy nhanh 2 giờ).
        let mut early = c.clone();
        early["issued_at"] = json!(boundary - 7200);
        early["refresh_before"] = json!(boundary - 7200 + 14 * DAY);
        api.replies.lock().unwrap().push_back(granted(&early, false));
        l.validate(boundary).unwrap();
        assert!(l.view(boundary).quota.needs_network, "vẫn là chu kỳ cũ");
        assert!(!l.validate_due(boundary + 7200));
        assert!(l.validate_due(boundary + 7200 + 60));
    }

    #[test]
    fn a_debug_override_is_pro_without_limits() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = License::new(
            Box::new(api.clone()),
            Box::new(vault.clone()),
            test_keys(),
            Machine {
                id_hash: DEVICE.into(),
                label: None,
            },
            vn(),
            false,
            true,
            false,
            T0,
        );
        assert!(l.is_pro(T0) && l.add_usage(999 * MIN, T0).is_continue() && l.can_start(T0));
        let v = l.view(T0);
        assert!(v.quota.unlimited && v.dev_override);
    }

    #[test]
    fn an_unreadable_keystore_counts_as_used_up_and_a_fake_build_is_free() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        *vault.fail_reads.lock().unwrap() = true;
        let l = license(&api, &vault, T0);
        assert!(!l.can_start(T0));
        assert!(l.view(T0).quota.storage_error);
        let (_, _, l) = activated(T0, true);
        l.set_genuine(false);
        assert_eq!(l.view(T0).standing, Standing::NotGenuine);
        assert!(!l.is_pro(T0));
    }

    #[test]
    fn the_five_minute_warning_fires_once_per_counter() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        assert!(!l.take_warning(T0));
        let _ = l.add_usage(25 * MIN, T0);
        assert!(l.take_warning(T0));
        assert!(!l.take_warning(T0));
        let _ = l.add_usage(5 * MIN, T0);
        assert!(!l.take_warning(T0), "đã hết thì không nhắc còn 5 phút");
    }

    #[test]
    fn deactivating_this_machine_or_another_one() {
        let (api, vault, l) = activated(T0, true);
        l.deactivate(Some((KEY, "other"))).unwrap();
        assert_eq!(
            api.calls.lock().unwrap().last().unwrap(),
            "deactivate 0123456789ABCDEFGHJKMNPQRST5 other"
        );
        assert!(l.is_pro(T0), "gỡ máy khác không đụng máy này");
        api.deactivations
            .lock()
            .unwrap()
            .push_back(Err(server(404, "activation_not_found")));
        l.deactivate(None).unwrap();
        assert_eq!(l.view(T0).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
        assert_eq!(l.deactivate(None), Err(LicenseError::NotActivated));
    }

    /// Header `Date` của mọi response được ghi làm mốc cho "đồng hồ thật" của Free.
    #[test]
    fn server_dates_are_recorded() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        *api.date.lock().unwrap() = Some(T0 + 5);
        let l = license(&api, &vault, T0);
        let _ = l.activate(KEY, T0);
        let seen: Seen = store::read(vault.as_ref(), store::SEEN).unwrap().unwrap();
        assert_eq!(seen.latest_server_date, Some(T0 + 5));
    }

    // ---- Free dùng thử 10 ngày (spec 2026-10-07 §3.2) ----

    const TRIAL_END: i64 = T0 + 10 * DAY;

    /// Server giả trả dùng thử bắt đầu `T0`, hết `TRIAL_END`.
    fn with_trial(api: &Arc<FakeApi>) {
        api.trials
            .lock()
            .unwrap()
            .push_back(trial_grant(DEVICE, T0, TRIAL_END, T0));
    }

    /// Bấm Bắt đầu ở Free mà chưa có token dùng thử: đăng ký với server, lưu kho khóa; mở lại app thì đọc lại, không gọi
    /// server nữa. Số ngày còn lại làm tròn lên.
    #[test]
    fn free_registers_the_trial_once_and_keeps_it() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        with_trial(&api);
        let l = license(&api, &vault, T0);
        assert_eq!(l.view(T0).trial.status, TrialStatus::None);
        assert_eq!(l.start_block(T0), None);
        assert_eq!(*api.calls.lock().unwrap(), [format!("trial {DEVICE}")]);
        assert!(vault.items.lock().unwrap().contains_key(store::TRIAL));
        let reopened = license(&api, &vault, T0 + DAY + 1);
        let v = reopened.view(T0 + DAY + 1);
        assert_eq!(
            (v.trial.status, v.trial.ends_at, v.trial.days_left),
            (TrialStatus::Active, Some(TRIAL_END), 9)
        );
        assert_eq!(reopened.start_block(T0 + DAY + 1), None);
        assert_eq!(api.calls.lock().unwrap().len(), 1, "đã có token: không gọi server");
    }

    /// Hết 10 ngày: không bắt đầu được phiên ở Free; phiên đang chạy vẫn cộng phút bình thường (chạy hết phiên).
    #[test]
    fn an_ended_trial_blocks_the_next_free_session_only() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        with_trial(&api);
        let l = license(&api, &vault, TRIAL_END - 60);
        assert_eq!(l.start_block(TRIAL_END - 60), None);
        assert!(
            l.add_usage(MIN, TRIAL_END + 60).is_continue(),
            "phiên đang chạy chạy tiếp"
        );
        assert_eq!(l.start_block(TRIAL_END), Some(StartBlock::TrialEnded));
        let v = l.view(TRIAL_END);
        assert_eq!((v.trial.status, v.trial.days_left), (TrialStatus::Ended, 0));
        assert!(!l.can_start(TRIAL_END));
    }

    /// Chưa có token và không có mạng: không bắt đầu được ở Free; có mạng lại thì đăng ký được.
    #[test]
    fn without_a_trial_and_without_network_free_cannot_start() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        api.trials
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        let l = license(&api, &vault, T0);
        assert_eq!(l.start_block(T0), Some(StartBlock::TrialMissing));
        assert_eq!(l.view(T0).trial.status, TrialStatus::None);
        with_trial(&api);
        assert_eq!(l.start_block(T0 + 60), None);
    }

    /// Token dùng thử của máy khác, hay token bản quyền đưa vào chỗ token dùng thử: không nhận. Mục kho khóa hỏng thì bỏ qua
    /// và đăng ký lại.
    #[test]
    fn a_trial_token_for_another_machine_is_refused() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        api.trials
            .lock()
            .unwrap()
            .push_back(trial_grant("khac", T0, TRIAL_END, T0));
        let l = license(&api, &vault, T0);
        assert!(matches!(l.register_trial(T0), Err(LicenseError::BadToken(_))));
        let license_token = granted(&claims(T0), false).unwrap().token;
        api.trials.lock().unwrap().push_back(Ok(TrialGrant {
            token: license_token,
            started_at: T0,
            ends_at: TRIAL_END,
            issued_at: T0,
        }));
        assert!(matches!(l.register_trial(T0), Err(LicenseError::BadToken(_))));
        assert!(!vault.items.lock().unwrap().contains_key(store::TRIAL));
        vault
            .items
            .lock()
            .unwrap()
            .insert(store::TRIAL.into(), br#"{"token":"v1.x.y"}"#.to_vec());
        with_trial(&api);
        let l = license(&api, &vault, T0);
        assert_eq!(l.view(T0).trial.status, TrialStatus::None);
        assert_eq!(l.start_block(T0), None);
    }

    /// Giờ máy chỉnh lùi: Free không bắt đầu được, báo chỉnh giờ. Giờ server (header `Date`) đã qua `ends_at` thì hết dùng
    /// thử, dù giờ máy còn trước.
    #[test]
    fn the_trial_follows_the_trusted_clock() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        with_trial(&api);
        let l = license(&api, &vault, T0);
        assert_eq!(l.start_block(T0), None);
        l.tick(T0 + 5 * DAY, 0);
        assert_eq!(l.start_block(T0 + 2 * DAY), Some(StartBlock::ClockRolledBack));
        *api.date.lock().unwrap() = Some(TRIAL_END + 60);
        l.observe_reply(&api.plans());
        assert_eq!(l.start_block(TRIAL_END - 300), Some(StartBlock::TrialEnded));
    }

    /// Đăng ký chạy nền (ticker) chỉ sau khi người dùng đồng ý điều khoản, khi chưa có token, mỗi giờ một lần; `429` thì
    /// chờ đúng `Retry-After`.
    #[test]
    fn background_registration_waits_for_consent_and_retries_hourly() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        assert!(!l.trial_due(T0), "chưa đồng ý điều khoản");
        l.allow_trial();
        assert!(l.trial_due(T0));
        api.trials
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        assert_eq!(l.register_trial(T0), Err(LicenseError::Network));
        assert!(!l.trial_due(T0 + 600));
        assert!(l.trial_due(T0 + 3600));
        api.trials
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Server(Box::new(ServerError {
                status: 429,
                code: "rate_limited".into(),
                retry_after: Some(7200),
                ..ServerError::default()
            }))));
        let _ = l.register_trial(T0 + 3600);
        assert!(!l.trial_due(T0 + 2 * 3600));
        assert!(l.trial_due(T0 + 3 * 3600));
        with_trial(&api);
        l.register_trial(T0 + 3 * 3600).unwrap();
        assert!(!l.trial_due(T0 + 5 * 3600), "đã có token");
    }

    /// Gói trả phí hết hạn thì về Free theo dùng thử: còn trong 10 ngày thì dùng được, hết thì không.
    #[test]
    fn an_expired_plan_falls_back_to_the_trial() {
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 3600);
        let after = T0 + 3600 + EXPIRY_GRACE_SECS;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        with_trial(&api);
        assert_eq!(l.start_block(after), None);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        api.trials
            .lock()
            .unwrap()
            .push_back(trial_grant(DEVICE, T0 - 20 * DAY, T0 - 10 * DAY, T0));
        assert_eq!(
            l.start_block(after),
            Some(StartBlock::LicenseExpired),
            "gói đã hết hạn, dùng thử cũng hết: nêu lý do của gói để gia hạn"
        );
        assert_eq!(l.start_block(T0 + 60), None, "gói trả phí còn hạn: không cần dùng thử");
    }

    // ---- Mỗi key một máy (spec 2026-10-07 §4.2) ----

    /// Lỗi `409 key_in_use` hay `409 license_conflict` với các máy `ids`.
    fn conflict_error(code: &str, ids: &[&str]) -> ApiError {
        ApiError::Server(Box::new(ServerError {
            status: 409,
            code: code.into(),
            devices: ids
                .iter()
                .map(|id| Device {
                    activation_id: (*id).into(),
                    device_label: None,
                    last_validated_at: Some(T0),
                })
                .collect(),
            ..ServerError::default()
        }))
    }

    /// `409 license_conflict` của `activate`: các máy `ids`, máy vừa gọi là `own`.
    fn conflict_reply(ids: &[&str], own: &str) -> ApiError {
        let ApiError::Server(mut e) = conflict_error("license_conflict", ids) else {
            unreachable!()
        };
        e.activation_id = Some(own.into());
        ApiError::Server(e)
    }

    /// Activation của hai máy trong các test xung đột (UUID như server cấp).
    const ACT_1: &str = "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60";
    const ACT_2: &str = "9b1f2c3d-4e5a-4b6c-8d7e-0f1a2b3c4d5e";

    /// Token của activation `id`.
    fn granted_for(id: &str, issued_at: i64) -> Result<Granted, ApiError> {
        let mut c = claims(issued_at);
        c["activation_id"] = json!(id);
        granted(&c, false)
    }

    fn ids(v: &LicenseView) -> Vec<String> {
        v.conflict
            .as_ref()
            .map(|c| c.devices.iter().map(|d| d.activation_id.clone()).collect())
            .unwrap_or_default()
    }

    /// "Vẫn kích hoạt": kích hoạt với `allow_conflict`. Key vào trạng thái xung đột: không còn gói trả phí, máy chạy theo
    /// Free; activation của máy này lấy từ `activation_id` của response. Mở lại app vẫn xung đột; `validate` mỗi 15 phút,
    /// nhận token thì về bình thường.
    #[test]
    fn activating_anyway_puts_the_key_in_conflict() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_reply(&[ACT_1, ACT_2], ACT_2)));
        assert!(matches!(l.activate_anyway(KEY, T0), Err(LicenseError::Conflict(d)) if d.len() == 2));
        assert_eq!(
            *api.calls.lock().unwrap(),
            [format!(
                "activate 0123456789ABCDEFGHJKMNPQRST5 {DEVICE} Mac allow_conflict"
            )]
        );
        let v = l.view(T0);
        assert_eq!((v.standing, v.plan.as_str()), (Standing::Conflict, "free"));
        assert_eq!(ids(&v), [ACT_1, ACT_2]);
        assert_eq!(v.conflict.unwrap().this_activation_id, ACT_2);
        assert!(!l.is_pro(T0) && l.can_start(T0), "Free theo dùng thử");
        let l = license(&api, &vault, T0 + 60);
        assert_eq!(l.view(T0 + 60).standing, Standing::Conflict, "mở lại app vẫn xung đột");
        assert!(l.validate_due(T0 + 60), "mở lại app: thử ngay");
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        let _ = l.validate(T0 + 60);
        assert_eq!(l.view(T0 + 60).standing, Standing::Conflict, "lỗi mạng: vẫn xung đột");
        assert!(!l.validate_due(T0 + 60 + 899));
        assert!(l.validate_due(T0 + 60 + 900));
        api.replies.lock().unwrap().push_back(granted_for(ACT_2, T0 + 960));
        l.validate(T0 + 960).unwrap();
        assert_eq!(
            api.calls.lock().unwrap().last().unwrap(),
            &format!("validate 0123456789ABCDEFGHJKMNPQRST5 {ACT_2}")
        );
        assert_eq!(l.view(T0 + 960).standing, Standing::Active);
    }

    /// Máy kia đã gỡ key trong lúc người dùng đọc hộp thoại: "Vẫn kích hoạt" nhận token như kích hoạt bình thường.
    #[test]
    fn activating_anyway_after_the_other_machine_left_gets_a_token() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate_anyway(KEY, T0).unwrap();
        assert_eq!(api.calls.lock().unwrap().len(), 1);
        assert_eq!(l.view(T0).standing, Standing::Active);
    }

    /// `validate` trả `license_conflict`: bỏ token, giữ key và `activation_id`; gỡ máy kia bằng key đã lưu, rồi `validate`
    /// nhận token lại.
    #[test]
    fn a_conflict_found_by_validate_drops_the_token_and_keeps_the_key() {
        let (api, vault, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "other"])));
        assert!(matches!(l.validate(T0 + 60), Err(LicenseError::Conflict(_))));
        let v = l.view(T0 + 60);
        assert_eq!(v.standing, Standing::Conflict);
        assert_eq!(v.conflict.unwrap().this_activation_id, "act");
        assert!(!l.is_pro(T0 + 60));
        let record: LicenseRecord = store::read(vault.as_ref(), store::LICENSE).unwrap().unwrap();
        assert_eq!((record.token.as_str(), record.activation_id.as_str()), ("", "act"));
        l.deactivate_saved_other("other").unwrap();
        assert_eq!(
            api.calls.lock().unwrap().last().unwrap(),
            "deactivate 0123456789ABCDEFGHJKMNPQRST5 other"
        );
        api.replies.lock().unwrap().push_back(granted_for("act", T0 + 120));
        l.validate(T0 + 120).unwrap();
        assert_eq!(l.view(T0 + 120).standing, Standing::Active);
        assert!(l.view(T0 + 120).conflict.is_none());
    }

    /// "Gỡ key khỏi máy này" lúc xung đột: gỡ activation của máy này, về Free.
    #[test]
    fn leaving_a_conflict_from_this_machine() {
        let (api, vault, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "other"])));
        let _ = l.validate(T0 + 60);
        l.deactivate(None).unwrap();
        assert_eq!(
            api.calls.lock().unwrap().last().unwrap(),
            "deactivate 0123456789ABCDEFGHJKMNPQRST5 act"
        );
        assert_eq!(l.view(T0 + 60).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
    }

    /// Máy này đã kích hoạt key mà key đang xung đột: `activate` (không `allow_conflict`) cũng vào trạng thái xung đột với
    /// activation của máy này trong response. Response `license_conflict` không có `activation_id` (sai hợp đồng): báo lỗi
    /// server, không lưu gì.
    #[test]
    fn a_conflict_reply_must_name_this_machine() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_reply(&[ACT_1, ACT_2], ACT_1)));
        assert!(matches!(l.activate(KEY, T0), Err(LicenseError::Conflict(_))));
        assert_eq!(l.view(T0).conflict.unwrap().this_activation_id, ACT_1);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &[ACT_1, ACT_2])));
        assert!(matches!(l.activate_anyway(KEY, T0), Err(LicenseError::Server(_))));
        assert_eq!(l.view(T0).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
    }

    /// `activation_id` của `409 license_conflict` phải là UUID: rỗng hay không phải UUID thì coi như thiếu (review cuối 02a,
    /// mục 3): báo lỗi server, không lưu gì.
    #[test]
    fn a_conflict_activation_id_must_be_a_uuid() {
        for bad in [
            "",
            "a2",
            "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f6",
            "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f6g",
            " 5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60",
        ] {
            let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
            let l = license(&api, &vault, T0);
            api.replies
                .lock()
                .unwrap()
                .push_back(Err(conflict_reply(&[ACT_1, ACT_2], bad)));
            let got = l.activate_anyway(KEY, T0);
            assert!(matches!(&got, Err(LicenseError::Server(_))), "{bad:?}: {got:?}");
            assert_eq!(got.unwrap_err().code(), "licenseServer");
            assert_eq!(l.view(T0).standing, Standing::Free, "{bad:?}");
            assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE), "{bad:?}");
        }
        // UUID chữ hoa cũng là UUID.
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        let upper = ACT_2.to_uppercase();
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_reply(&[ACT_1, &upper], &upper)));
        assert!(matches!(l.activate_anyway(KEY, T0), Err(LicenseError::Conflict(_))));
    }

    /// Kiểm nhanh lúc bắt đầu phiên trả phí: chỉ khi lần `validate` thành công gần nhất đã quá 1 giờ (spec 2026-10-07 §4.2).
    #[test]
    fn a_paid_session_start_checks_the_key_when_the_last_check_is_over_an_hour_old() {
        let (api, _, l) = activated(T0, true);
        assert!(!l.quick_check_due(T0 + 3599));
        assert!(l.quick_check_due(T0 + 3600));
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "b"])));
        let _ = l.validate(T0 + 3600);
        assert!(!l.quick_check_due(T0 + 7200), "đang xung đột: không phải phiên trả phí");
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let free = license(&api, &vault, T0);
        assert!(!free.quick_check_due(T0 + 7200));
    }

    // ---- Sửa sau review cuối 02a (Task 8) ----

    /// Khách Monthly còn hạn mà dùng thử đã hết, và gói đang không dùng được: lý do của gói trả phí, không phải "hết dùng thử,
    /// mua gói" (review cuối 02a, Quan trọng 1).
    fn ended_trial(api: &Arc<FakeApi>) {
        api.trials
            .lock()
            .unwrap()
            .push_back(trial_grant(DEVICE, T0 - 20 * DAY, T0 - 10 * DAY, T0));
    }

    #[test]
    fn a_paid_customer_with_an_ended_trial_and_a_clock_set_back_hears_about_the_clock() {
        let (api, _, l) = activated(T0, true);
        ended_trial(&api);
        l.tick(T0 + 3600, 0);
        let back = T0 + 3600 - 601;
        assert_eq!(l.view(back).standing, Standing::ClockRolledBack);
        assert_eq!(l.start_block(back), Some(StartBlock::ClockRolledBack));
    }

    #[test]
    fn a_paid_customer_with_an_ended_trial_and_a_conflict_hears_about_the_conflict() {
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "other"])));
        let _ = l.validate(T0 + 60);
        ended_trial(&api);
        assert_eq!(l.start_block(T0 + 60), Some(StartBlock::LicenseConflict));
    }

    /// Quá 14 ngày offline (`refresh_before`), và token lưu không đọc được (`Unverified`): cần mạng để làm mới bản quyền.
    #[test]
    fn a_paid_customer_with_an_ended_trial_who_needs_a_refresh_hears_about_the_network() {
        let (api, _, l) = activated(T0, true);
        ended_trial(&api);
        let late = T0 + 14 * DAY;
        assert_eq!(l.view(late).standing, Standing::RefreshNeeded);
        assert_eq!(l.start_block(late), Some(StartBlock::LicenseNeedsRefresh));
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let record = LicenseRecord {
            key: "0123456789ABCDEFGHJKMNPQRST5".into(),
            activation_id: "act".into(),
            token: "v1.x.y".into(),
            validated_at: T0,
            verdict: None,
            devices: Vec::new(),
        };
        store::write(vault.as_ref(), store::LICENSE, &record).unwrap();
        let l = license(&api, &vault, T0);
        ended_trial(&api);
        assert_eq!(l.view(T0).standing, Standing::Unverified);
        assert_eq!(l.start_block(T0), Some(StartBlock::LicenseNeedsRefresh));
    }

    #[test]
    fn a_paid_customer_with_an_ended_trial_whose_license_ended_hears_about_the_license() {
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(403, "license_revoked")));
        let _ = l.validate(T0 + 60);
        ended_trial(&api);
        assert_eq!(l.start_block(T0 + 60), Some(StartBlock::LicenseRevoked));
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(403, "license_expired")));
        let _ = l.validate(T0 + 60);
        ended_trial(&api);
        assert_eq!(l.start_block(T0 + 60), Some(StartBlock::LicenseExpired));
    }

    /// Còn dùng thử thì Free chạy như trước, dù gói không dùng được. Khách Free thật sự hết dùng thử (chưa từng có license,
    /// hay đã gỡ key) vẫn nhận `TrialEnded`.
    #[test]
    fn the_trial_still_runs_free_for_a_customer_in_trouble_and_ended_free_gets_trial_ended() {
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "other"])));
        let _ = l.validate(T0 + 60);
        with_trial(&api);
        assert_eq!(l.start_block(T0 + 60), None);
        assert!(l.can_start(T0 + 60));
        let (api, _, l) = activated(T0, true);
        ended_trial(&api);
        l.deactivate(None).unwrap();
        assert_eq!(l.start_block(T0 + 60), Some(StartBlock::TrialEnded));
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        ended_trial(&api);
        assert_eq!(l.start_block(T0), Some(StartBlock::TrialEnded));
    }

    // ---- `key_in_use` không có máy nào (race của server) ----

    /// `409 key_in_use` mà danh sách máy rỗng (máy kia vừa gỡ key): gọi lại `activate` một lần, không `allow_conflict`.
    #[test]
    fn an_empty_key_in_use_list_is_retried_once_without_allow_conflict() {
        let key = "0123456789ABCDEFGHJKMNPQRST5";
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies
            .lock()
            .unwrap()
            .extend([Err(conflict_error("key_in_use", &[])), granted(&claims(T0), true)]);
        l.activate_anyway(KEY, T0).unwrap();
        assert_eq!(
            *api.calls.lock().unwrap(),
            [
                format!("activate {key} {DEVICE} Mac allow_conflict"),
                format!("activate {key} {DEVICE} Mac")
            ]
        );
        assert_eq!(l.view(T0).standing, Standing::Active);
        // Hai lần liền đều rỗng: lỗi server bình thường, không thử lần ba.
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().extend([
            Err(conflict_error("key_in_use", &[])),
            Err(conflict_error("key_in_use", &[])),
        ]);
        let got = l.activate(KEY, T0);
        assert!(matches!(&got, Err(LicenseError::Server(_))), "{got:?}");
        assert_eq!(got.unwrap_err().code(), "licenseServer");
        assert_eq!(api.calls.lock().unwrap().len(), 2);
        // Lần hai có danh sách máy: báo như bình thường.
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().extend([
            Err(conflict_error("key_in_use", &[])),
            Err(conflict_error("key_in_use", &[ACT_1])),
        ]);
        assert!(matches!(l.activate(KEY, T0), Err(LicenseError::KeyInUse(d)) if d.len() == 1));
    }

    // ---- Đăng ký dùng thử khi bắt đầu phiên (Free) ----

    fn rate_limited(after: u64) -> ApiError {
        ApiError::Server(Box::new(ServerError {
            status: 429,
            code: "rate_limited".into(),
            retry_after: Some(after),
            ..ServerError::default()
        }))
    }

    fn trial_calls(api: &Arc<FakeApi>) -> usize {
        api.calls
            .lock()
            .unwrap()
            .iter()
            .filter(|c| c.starts_with("trial "))
            .count()
    }

    /// Chưa có token dùng thử: mất mạng thì "cần mạng"; `503` thì "thử lại sau"; `429` thì chờ đúng `Retry-After`, không gọi
    /// server trong lúc chờ.
    #[test]
    fn start_block_names_why_the_trial_could_not_be_registered_and_waits_out_retry_after() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.trials
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        assert_eq!(l.start_block(T0), Some(StartBlock::TrialMissing));
        api.trials
            .lock()
            .unwrap()
            .push_back(Err(server(503, "trial_not_configured")));
        assert_eq!(
            l.start_block(T0 + 1),
            Some(StartBlock::TrialUnavailable("licenseServer"))
        );
        api.trials.lock().unwrap().push_back(Err(rate_limited(7200)));
        assert_eq!(
            l.start_block(T0 + 2),
            Some(StartBlock::TrialUnavailable("licenseRateLimited"))
        );
        assert_eq!(trial_calls(&api), 3);
        assert_eq!(
            l.start_block(T0 + 600),
            Some(StartBlock::TrialUnavailable("licenseRateLimited")),
            "đang chờ Retry-After"
        );
        assert_eq!(trial_calls(&api), 3, "không gọi server trong lúc chờ");
        with_trial(&api);
        assert_eq!(l.start_block(T0 + 2 + 7200), None);
        assert_eq!(trial_calls(&api), 4);
    }

    /// Kho khóa không ghi được token dùng thử: token vẫn nằm trong bộ nhớ, lần Bắt đầu sau không gọi server lại.
    #[test]
    fn a_failing_keystore_keeps_the_new_trial_in_memory() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        *vault.fail_writes_of.lock().unwrap() = Some("license-trial".into());
        with_trial(&api);
        let l = license(&api, &vault, T0);
        assert_eq!(l.start_block(T0), None);
        assert!(!vault.items.lock().unwrap().contains_key(store::TRIAL));
        assert_eq!(l.view(T0).trial.status, TrialStatus::Active);
        assert_eq!(l.start_block(T0 + 60), None);
        assert_eq!(trial_calls(&api), 1);
    }

    /// Hai nơi cùng đăng ký dùng thử (ticker, bước Điều khoản, nút Bắt đầu): chỉ một lần gọi server, nơi sau chờ rồi dùng kết
    /// quả của nơi trước.
    #[test]
    fn two_trial_registrations_never_overlap() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = Arc::new(license(&api, &vault, T0));
        let (release, hold) = std::sync::mpsc::channel();
        *api.trial_hold.lock().unwrap() = Some(hold);
        with_trial(&api);
        let first = {
            let l = l.clone();
            std::thread::spawn(move || l.register_trial(T0))
        };
        while trial_calls(&api) == 0 {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        let second = {
            let l = l.clone();
            std::thread::spawn(move || l.register_trial(T0 + 1))
        };
        std::thread::sleep(std::time::Duration::from_millis(150));
        release.send(()).unwrap();
        assert_eq!(first.join().unwrap(), Ok(()));
        assert_eq!(second.join().unwrap(), Ok(()));
        assert_eq!(trial_calls(&api), 1);
    }

    /// Không đọc được mã máy: không gọi `/v1/trial`, báo đúng lý do (không phải "cần mạng"), log cảnh báo một lần.
    #[test]
    fn without_a_machine_id_the_trial_is_not_requested() {
        capture_logs();
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = License::new(
            Box::new(api.clone()),
            Box::new(vault.clone()),
            test_keys(),
            Machine {
                id_hash: String::new(),
                label: None,
            },
            vn(),
            true,
            false,
            false,
            T0,
        );
        l.allow_trial();
        assert!(!l.trial_due(T0), "ticker không gọi");
        for t in [T0, T0 + 1, T0 + 2] {
            assert_eq!(l.register_trial(t), Err(LicenseError::NoMachineId));
        }
        assert_eq!(
            l.start_block(T0 + 3),
            Some(StartBlock::TrialUnavailable("licenseNoMachineId"))
        );
        assert!(api.calls.lock().unwrap().is_empty());
        let warnings = logs_of_this_thread().iter().filter(|m| m.contains("mã máy")).count();
        assert_eq!(warnings, 1, "cảnh báo đúng một lần");
    }

    // ---- Mở app khi đang xung đột ----

    /// Bắt log của mọi luồng, kèm luồng ghi: test chỉ đọc phần của luồng mình.
    static CAPTURED: Mutex<Vec<(std::thread::ThreadId, String)>> = Mutex::new(Vec::new());

    struct Capture;

    impl log::Log for Capture {
        fn enabled(&self, _: &log::Metadata) -> bool {
            true
        }

        fn log(&self, record: &log::Record) {
            CAPTURED
                .lock()
                .unwrap()
                .push((std::thread::current().id(), record.args().to_string()));
        }

        fn flush(&self) {}
    }

    fn capture_logs() {
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            let _ = log::set_logger(&Capture);
            log::set_max_level(log::LevelFilter::Warn);
        });
    }

    fn logs_of_this_thread() -> Vec<String> {
        let me = std::thread::current().id();
        CAPTURED
            .lock()
            .unwrap()
            .iter()
            .filter(|(thread, _)| *thread == me)
            .map(|(_, m)| m.clone())
            .collect()
    }

    /// Bản ghi xung đột có token rỗng theo thiết kế: mở lại app không được log "token đã lưu không đọc được" mỗi lần. Đối
    /// chứng: token hỏng thật vẫn được log.
    #[test]
    fn opening_the_app_in_conflict_does_not_warn_about_an_unreadable_token() {
        capture_logs();
        let (api, vault, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(conflict_error("license_conflict", &["act", "other"])));
        let _ = l.validate(T0 + 60);
        let before = logs_of_this_thread().len();
        let reopened = license(&api, &vault, T0 + 120);
        assert_eq!(reopened.view(T0 + 120).standing, Standing::Conflict);
        let new = logs_of_this_thread().split_off(before);
        assert!(new.iter().all(|m| !m.contains("token đã lưu")), "{new:?}");
        // Đối chứng.
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let record = LicenseRecord {
            key: "0123456789ABCDEFGHJKMNPQRST5".into(),
            activation_id: "act".into(),
            token: "v1.x.y".into(),
            validated_at: T0,
            verdict: None,
            devices: Vec::new(),
        };
        store::write(vault.as_ref(), store::LICENSE, &record).unwrap();
        let before = logs_of_this_thread().len();
        let _ = license(&api, &vault, T0);
        let new = logs_of_this_thread().split_off(before);
        assert!(new.iter().any(|m| m.contains("token đã lưu không đọc được")), "{new:?}");
    }
}
