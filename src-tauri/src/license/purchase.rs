//! Mua, gia hạn, đổi gói ngay trong app (spec §6.8 "Mua ngay trong app", §4.3 "Nâng cấp", §10.1; hợp đồng ở mục "App hiện
//! gì theo `status`" của kế hoạch 05):
//! 1. bảng gói lấy từ server (`GET /v1/plans`), kèm loại tiền server gợi ý;
//! 2. tạo đơn với email, ô đồng ý (`consent`) và loại tiền (VND qua VietQR/PayOS, USD qua thẻ/Creem; spec 2026-10-14 D4),
//!    kèm key đang có khi gia hạn hay đổi gói;
//! 3. đơn VietQR: vẽ mã từ chuỗi `qr_code` (SVG, phía Rust), kèm nút mở trang thanh toán của PayOS. Đơn thẻ không có mã QR:
//!    khách trả ở trang của Creem (mở bằng trình duyệt, spec 2026-10-14 §3);
//! 4. hỏi trạng thái đơn mỗi 3 giây tới khi link hết hạn (đơn VietQR); đơn thẻ mỗi 5 giây, quá hạn thì mỗi 30 giây trong giờ
//!    đầu rồi mỗi 120 giây, tới 24 giờ sau hạn, vì trang của Creem vẫn nhận tiền và server vẫn cấp key (Q3 của chủ dự án);
//!    luồng hỏi nền chuyển sang đơn mới nếu người dùng hủy đơn đang hỏi và tạo đơn khác; đơn đã trả tiền thì tự kích hoạt
//!    key mới (`grant_kind: new`, kể cả đơn gia hạn được hỗ trợ cấp key mới), hay `validate` để lấy token có gói và hạn mới
//!    (`extend`, `change`);
//! 5. đơn đang chờ lưu trong kho khóa (`license-order`, kèm số tiền và loại tiền), mở lại app thì hỏi tiếp.

use qrcode::QrCode;
use qrcode::render::svg;
use serde::Serialize;

use super::client::{Checkout, OrderStatus, PlanOffer, PlansReply};
use super::manager::{License, LicenseError};
use super::store::{self, PendingOrder};

/// Mã gói được bán (spec 2026-10-07 §1; `six_months` thêm ở spec 2026-10-13). Cũng là danh sách app khai báo với server khi
/// hỏi bảng gói (`GET /v1/plans?plans=`, spec 2026-10-13 §2.3): server chỉ đưa cho app những gói mới mà app khai báo ở đây.
pub const PLANS: [&str; 3] = ["monthly", "six_months", "yearly"];
/// Loại tiền khách chọn được ở màn hình Nâng cấp, và là giá trị `currency` gửi ở `POST /v1/checkout`: VND (VietQR qua
/// PayOS) hay USD (thẻ quốc tế qua Creem), spec 2026-10-14 D4.
pub const CURRENCIES: [&str; 2] = ["VND", "USD"];
/// App hỏi trạng thái đơn VietQR mỗi chừng này (§6.8 bước 4).
pub const POLL_EVERY_SECS: u64 = 3;
/// Đơn thẻ (không mã QR) hỏi thưa hơn (spec 2026-10-14 D7): khách trả ở trang của cổng, server giữ đơn 30 phút nên chừng này
/// là 360 lần, nằm trong hạn mức `order_poll` (600 lần mỗi giờ).
pub const POLL_EVERY_CARD_SECS: u64 = 5;
/// Đơn thẻ đã quá `expires_at` hỏi thưa hơn: khách vẫn trả được ở trang của cổng (phiên của Creem sống lâu hơn đơn của ta)
/// nên app hỏi tiếp tới [`KEEP_AFTER_EXPIRY_SECS`]; giờ đầu sau hạn (khách trả muộn hay gặp nhất) mỗi chừng này.
pub const POLL_LATE_CARD_SECS: u64 = 30;
/// Đơn thẻ hỏi mỗi [`POLL_LATE_CARD_SECS`] trong chừng này sau hạn, rồi mỗi [`POLL_STALE_CARD_SECS`].
pub const LATE_CARD_FAST_WINDOW_SECS: i64 = 3600;
/// Đơn thẻ quá hạn hơn [`LATE_CARD_FAST_WINDOW_SECS`] (thường là đơn bỏ dở) hỏi mỗi chừng này tới hết
/// [`KEEP_AFTER_EXPIRY_SECS`]. Hạn mức `order_poll` của server là 600 lần mỗi cửa sổ giờ cố định theo giờ đồng hồ, tính theo
/// IP và mã đơn: một đơn thẻ nhiều nhất 360 lần trong hạn + 60 lần sau hạn = 420 lần trong một giờ, các giờ sau hạn một giờ
/// chừng 30 lần; cả ngày chừng 1 170 lần.
pub const POLL_STALE_CARD_SECS: u64 = 120;
/// Đơn đang chờ giữ thêm chừng này sau khi link hết hạn (webhook đến chậm, mở lại app vẫn hỏi lại một lần), rồi bỏ. Đơn thẻ
/// mà server còn báo `pending`/`processing` cũng chờ tới mốc này (server đối soát và vẫn cấp key tới 24 giờ).
const KEEP_AFTER_EXPIRY_SECS: i64 = 24 * 3600;
const MAX_EMAIL_LEN: usize = 254;

/// Bảng gói đang bán và loại tiền server gợi ý, cho màn hình Nâng cấp.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlansView {
    pub plans: Vec<PlanOffer>,
    /// `VND` hay `USD`; `None` khi server không gợi ý.
    pub suggested_currency: Option<String>,
}

/// Đơn vừa tạo, cho màn hình Nâng cấp. Không có `order_token` (chỉ phía Rust giữ).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutView {
    pub order_code: i64,
    pub plan: String,
    pub amount: i64,
    pub currency: String,
    pub expires_at: i64,
    /// Cổng thanh toán của đơn: `payos` hay `creem`.
    pub provider: String,
    /// Mã VietQR đã vẽ (SVG). `None`: đơn không có mã QR (Creem), khách trả ở trang của cổng mở bằng trình duyệt.
    pub qr_svg: Option<String>,
    pub license_expires_at: Option<i64>,
    pub converted_days: Option<i64>,
}

/// Kết quả một lần hỏi đơn, theo bảng "App hiện gì theo `status`".
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum OrderOutcome {
    /// `pending`, `processing`: hỏi tiếp. Đơn thẻ có thể đã quá `expires_at` (khách vẫn trả được ở trang của cổng, tới 24
    /// giờ sau hạn): giao diện so `expires_at` với giờ hiện tại để biết.
    Waiting { order_code: i64, expires_at: i64 },
    /// `paid`: đã kích hoạt hay làm mới token; thôi hỏi.
    Paid { order_code: i64, plan: String },
    /// `underpaid` của đơn VietQR: chuyển bù cho đúng đơn trong 24 giờ, hay liên hệ hỗ trợ.
    Underpaid { order_code: i64 },
    /// `paid_needs_review`, hay `underpaid` của đơn thẻ: đã nhận tiền, chờ hỗ trợ xử lý; thôi hỏi.
    NeedsReview { order_code: i64 },
    /// `refunded`: đơn đã được hoàn tiền, không có key; thôi hỏi.
    Refunded { order_code: i64 },
    /// `cancelled`, `expired`, `failed`, hay đã quá mốc chờ (đơn VietQR: link hết hạn; đơn thẻ: 24 giờ sau hạn): cho tạo đơn
    /// mới; thôi hỏi.
    Failed { order_code: i64 },
    /// Đã trả tiền nhưng kích hoạt hay làm mới trên máy này lỗi (ví dụ key đang dùng ở máy khác): báo lỗi, key vẫn có trong
    /// email.
    PaidButNotApplied { order_code: i64, code: String },
}

impl OrderOutcome {
    /// Thôi hỏi đơn này.
    pub fn is_final(&self) -> bool {
        !matches!(self, Self::Waiting { .. } | Self::Underpaid { .. })
    }

    /// Mã của đơn vừa hỏi.
    pub fn order_code(&self) -> i64 {
        match self {
            Self::Waiting { order_code, .. }
            | Self::Paid { order_code, .. }
            | Self::Underpaid { order_code }
            | Self::NeedsReview { order_code }
            | Self::Refunded { order_code }
            | Self::Failed { order_code }
            | Self::PaidButNotApplied { order_code, .. } => *order_code,
        }
    }
}

fn check_email(email: &str) -> Result<String, LicenseError> {
    let email = email.trim();
    let (local, domain) = email.split_once('@').ok_or(LicenseError::EmailInvalid)?;
    let ok = !local.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && email.len() <= MAX_EMAIL_LEN
        && !email.chars().any(|c| c.is_whitespace() || c.is_control());
    if ok {
        Ok(email.to_string())
    } else {
        Err(LicenseError::EmailInvalid)
    }
}

/// Mã VietQR (chuỗi EMVCo thô của PayOS) thành SVG.
pub fn qr_svg(data: &str) -> Result<String, LicenseError> {
    let code = QrCode::new(data.as_bytes()).map_err(|e| LicenseError::Server(format!("qr: {e}")))?;
    Ok(code
        .render::<svg::Color<'_>>()
        .min_dimensions(240, 240)
        .quiet_zone(true)
        .build())
}

/// Chuỗi VietQR của đơn vừa tạo; chuỗi rỗng coi như không có mã QR (vẽ ra mã QR rỗng thì ngân hàng báo lỗi khi quét).
fn qr_of(c: &Checkout) -> Option<&str> {
    c.qr_code.as_deref().filter(|code| !code.is_empty())
}

fn checkout_view(c: &Checkout) -> Result<CheckoutView, LicenseError> {
    let qr = qr_of(c);
    Ok(CheckoutView {
        order_code: c.order_code,
        plan: c.plan.clone(),
        amount: c.amount,
        currency: c.currency.clone(),
        expires_at: c.expires_at,
        provider: provider_of(c.provider.as_deref(), qr.is_some()),
        qr_svg: qr.map(qr_svg).transpose()?,
        license_expires_at: c.license_expires_at,
        converted_days: c.converted_days,
    })
}

/// Cổng của đơn, chỉ để giao diện tham khảo: mọi quyết định (vẽ mã QR, tự mở trình duyệt, nhịp hỏi, chờ sau hạn) theo có
/// hay không mã QR. Server nói `payos` hay `creem` thì lấy; không nói (server cũ, khi PayOS là cổng duy nhất) hay nói giá
/// trị khác thì suy theo mã QR: có mã QR là PayOS, không có là Creem.
fn provider_of(provider: Option<&str>, has_qr: bool) -> String {
    match provider {
        Some(known @ ("payos" | "creem")) => known.to_string(),
        _ if has_qr => "payos".into(),
        _ => "creem".into(),
    }
}

/// Bảng gói đang bán, kèm loại tiền server gợi ý.
pub fn plans(license: &License) -> Result<PlansView, LicenseError> {
    let reply = license.api().plans();
    license.observe_reply(&reply);
    let PlansReply {
        plans,
        suggested_currency,
    } = reply.result.map_err(super::manager::map_api)?;
    Ok(PlansView {
        plans,
        suggested_currency,
    })
}

/// Tạo đơn bằng loại tiền `currency` (`VND` hay `USD`). `renew`: gia hạn hay đổi gói key đang có (cần đã kích hoạt). Thiếu ô
/// đồng ý thì từ chối, không gọi server (§10.1).
pub fn start(
    license: &License,
    plan: &str,
    email: &str,
    consent: bool,
    renew: bool,
    currency: &str,
) -> Result<CheckoutView, LicenseError> {
    if !consent {
        return Err(LicenseError::ConsentRequired);
    }
    if !PLANS.contains(&plan) {
        return Err(LicenseError::Server("plan".into()));
    }
    if !CURRENCIES.contains(&currency) {
        return Err(LicenseError::Server("currency".into()));
    }
    let email = check_email(email)?;
    let key = if renew {
        Some(license.license_key().ok_or(LicenseError::NotActivated)?)
    } else {
        None
    };
    let reply = license.api().checkout(plan, &email, key.as_deref(), currency);
    license.observe_reply(&reply);
    let checkout = reply.result.map_err(super::manager::map_api)?;
    let view = checkout_view(&checkout)?;
    let pending = PendingOrder {
        order_code: checkout.order_code,
        qr_code: qr_of(&checkout).map(String::from),
        order_token: checkout.order_token,
        plan: checkout.plan,
        expires_at: checkout.expires_at,
        renewal: renew,
        checkout_url: checkout.checkout_url,
        provider: view.provider.clone(),
        amount: checkout.amount,
        currency: checkout.currency,
    };
    let _gate = license.order_gate();
    store::write(license.vault(), store::ORDER, &pending).map_err(|e| LicenseError::Storage(e.to_string()))?;
    Ok(view)
}

/// Nhịp hỏi trạng thái của một đơn lúc `now`: đơn có mã QR 3 giây; đơn thẻ 5 giây tới `expires_at`, 30 giây trong giờ đầu
/// sau hạn, rồi 120 giây.
pub fn poll_secs(order: &PendingOrder, now: i64) -> u64 {
    if order.qr().is_some() {
        POLL_EVERY_SECS
    } else if now <= order.expires_at {
        POLL_EVERY_CARD_SECS
    } else if now <= order.expires_at + LATE_CARD_FAST_WINDOW_SECS {
        POLL_LATE_CARD_SECS
    } else {
        POLL_STALE_CARD_SECS
    }
}

/// Luồng hỏi nền chờ chừng này trước lần hỏi kế tiếp: theo đơn đang chờ ([`poll_secs`]). Không còn đơn (vừa hủy) thì nhịp
/// của đơn VietQR; lần hỏi sau thấy không còn đơn và dừng.
pub fn poll_delay(license: &License, now: i64) -> std::time::Duration {
    std::time::Duration::from_secs(pending(license).map_or(POLL_EVERY_SECS, |o| poll_secs(&o, now)))
}

/// Mốc cuối app còn chờ một đơn mà server báo `pending`/`processing`: đơn VietQR tới khi link hết hạn; đơn thẻ thêm 24 giờ
/// (trang của Creem vẫn nhận tiền sau hạn của đơn, server đối soát và vẫn cấp key tới 24 giờ; Q3 của chủ dự án).
fn wait_until(order: &PendingOrder) -> i64 {
    if order.qr().is_some() {
        order.expires_at
    } else {
        order.expires_at + KEEP_AFTER_EXPIRY_SECS
    }
}

/// Đơn đang chờ (nếu có).
pub fn pending(license: &License) -> Option<PendingOrder> {
    store::read(license.vault(), store::ORDER).ok().flatten()
}

/// Kho đang giữ một đơn khác đơn `order_code`: người dùng đã hủy đơn đó và tạo đơn mới trong lúc luồng hỏi nền chờ server.
/// Kho không còn đơn, hay còn đúng đơn này (xóa lỗi), thì `false`.
pub fn another_order_pending(license: &License, order_code: i64) -> bool {
    pending(license).is_some_and(|o| o.order_code != order_code)
}

/// Bỏ đơn đang chờ (người dùng đóng màn hình thanh toán).
pub fn forget(license: &License) {
    let _gate = license.order_gate();
    let _ = store::delete(license.vault(), store::ORDER);
}

/// Bỏ đơn `order_code` (đã xong) nếu đó vẫn là đơn đang chờ: trong lúc hỏi server, người dùng có thể đã hủy đơn này và tạo
/// đơn khác; đơn mới không được bị xóa. Giữ `order_gate` từ lúc đọc tới lúc xóa, nên lần ghi đơn mới không chen vào giữa.
fn forget_order(license: &License, order_code: i64) {
    let _gate = license.order_gate();
    let _ = store::delete_if::<PendingOrder>(license.vault(), store::ORDER, |o| o.order_code == order_code);
}

/// Hỏi đơn đang chờ một lần, áp kết quả. `None`: không có đơn nào.
pub fn poll(license: &License, now: i64) -> Option<OrderOutcome> {
    let order = pending(license)?;
    let code = order.order_code;
    let reply = license.api().order(code, &order.order_token);
    license.observe_reply(&reply);
    let outcome = match reply.result {
        Ok(status) => apply(license, &order, &status, now),
        Err(e) => {
            log::info!("chưa hỏi được đơn: {e}");
            if now > order.expires_at + KEEP_AFTER_EXPIRY_SECS {
                OrderOutcome::Failed { order_code: code }
            } else {
                OrderOutcome::Waiting {
                    order_code: code,
                    expires_at: order.expires_at,
                }
            }
        }
    };
    if outcome.is_final() {
        forget_order(license, code);
    }
    Some(outcome)
}

fn apply(license: &License, order: &PendingOrder, status: &OrderStatus, now: i64) -> OrderOutcome {
    let code = order.order_code;
    let card = order.qr().is_none();
    match status.status.as_str() {
        "paid" => {
            let result = match (status.grant_kind.as_deref(), &status.license_key) {
                // Key mới (đơn mới, hay hỗ trợ cấp key mới cho đơn gia hạn của license đã thu hồi): kích hoạt key này.
                (Some("new"), Some(key)) => license.activate(key, now),
                (_, _) if order.renewal => license.validate(now),
                (_, Some(key)) => license.activate(key, now),
                _ => Err(LicenseError::Server("paid_without_key".into())),
            };
            match result {
                Ok(()) => OrderOutcome::Paid {
                    order_code: code,
                    plan: status.license_plan.clone().unwrap_or_else(|| status.plan.clone()),
                },
                Err(e) => OrderOutcome::PaidButNotApplied {
                    order_code: code,
                    code: e.code().into(),
                },
            }
        }
        // Thẻ không trả thiếu: đơn thẻ `underpaid` là đơn server giữ lại cho hỗ trợ xem (giảm giá, trả thấp hơn giá; A4/Q4),
        // không có chuyện "chuyển bù". Đã nhận tiền, chờ hỗ trợ xử lý; thôi hỏi.
        "underpaid" if card => OrderOutcome::NeedsReview { order_code: code },
        "underpaid" => OrderOutcome::Underpaid { order_code: code },
        "paid_needs_review" => OrderOutcome::NeedsReview { order_code: code },
        "refunded" => OrderOutcome::Refunded { order_code: code },
        "pending" | "processing" if now <= wait_until(order) => OrderOutcome::Waiting {
            order_code: code,
            expires_at: order.expires_at,
        },
        // `cancelled`, `expired`, `failed` (cả đơn thẻ: server đã khép đơn), trạng thái lạ, hay đã quá mốc chờ.
        _ => OrderOutcome::Failed { order_code: code },
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::license::client::{ApiError, PlansReply};
    use crate::license::manager::tests::{FakeApi, KEY, T0, claims, granted, license};
    use crate::license::store::tests::FakeVault;

    fn checkout(code: i64) -> Checkout {
        Checkout {
            order_code: code,
            order_token: "tok".into(),
            checkout_url: "https://pay.payos.vn/web/abc".into(),
            qr_code: Some("00020101021238570010A000000727012700069704220113VQRQAA".into()),
            provider: None,
            plan: "monthly".into(),
            amount: 50_000,
            currency: "VND".into(),
            expires_at: T0 + 900,
            license_expires_at: None,
            converted_days: None,
        }
    }

    fn order(status: &str, kind: Option<&str>, key: Option<&str>) -> OrderStatus {
        OrderStatus {
            order_code: 7,
            status: status.into(),
            plan: "monthly".into(),
            expires_at: T0 + 900,
            license_key: key.map(String::from),
            license_plan: Some("monthly".into()),
            license_expires_at: Some(T0 + 30 * 86_400),
            grant_kind: kind.map(String::from),
        }
    }

    fn setup() -> (Arc<FakeApi>, Arc<FakeVault>, License) {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        (api, vault, l)
    }

    #[test]
    fn a_checkout_needs_consent_a_valid_email_and_a_paid_plan() {
        let (api, _, l) = setup();
        assert_eq!(
            start(&l, "monthly", "a@b.vn", false, false, "VND"),
            Err(LicenseError::ConsentRequired)
        );
        assert_eq!(
            start(&l, "monthly", "khong-co-a-cong", true, false, "VND"),
            Err(LicenseError::EmailInvalid)
        );
        assert_eq!(
            start(&l, "monthly", "a b@c.vn", true, false, "VND"),
            Err(LicenseError::EmailInvalid)
        );
        assert!(start(&l, "free", "a@b.vn", true, false, "VND").is_err());
        assert_eq!(
            start(&l, "monthly", "a@b.vn", true, true, "VND"),
            Err(LicenseError::NotActivated),
            "gia hạn cần key đã kích hoạt"
        );
        assert!(api.calls.lock().unwrap().is_empty(), "không gọi server");
    }

    /// Gói 6 Months (spec 2026-10-13): app bán được `six_months` và vẫn từ chối mọi mã không có trong danh sách.
    #[test]
    fn the_six_months_plan_can_be_bought_and_unknown_codes_still_cannot() {
        assert_eq!(PLANS, ["monthly", "six_months", "yearly"]);
        let (api, _, l) = setup();
        for code in ["pro", "six-months", "SIX_MONTHS", ""] {
            assert!(start(&l, code, "a@b.vn", true, false, "VND").is_err(), "{code}");
        }
        assert!(api.calls.lock().unwrap().is_empty(), "mã lạ thì không gọi server");
        let mut c = checkout(9);
        c.plan = "six_months".into();
        c.amount = 269_000;
        api.checkouts.lock().unwrap().push_back(Ok(c));
        let view = start(&l, "six_months", "a@b.vn", true, false, "VND").unwrap();
        assert_eq!(api.calls.lock().unwrap()[0], "checkout six_months a@b.vn -");
        assert_eq!((view.plan.as_str(), view.amount), ("six_months", 269_000));
        assert_eq!(pending(&l).unwrap().plan, "six_months");
    }

    #[test]
    fn a_new_order_draws_the_qr_and_is_kept_for_polling() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        let view = start(&l, "monthly", " a@b.vn ", true, false, "VND").unwrap();
        assert_eq!(api.calls.lock().unwrap()[0], "checkout monthly a@b.vn -");
        assert!(
            view.qr_svg
                .as_deref()
                .is_some_and(|s| s.contains("<svg") && s.contains("</svg>"))
        );
        let kept = pending(&l).unwrap();
        assert_eq!(
            (kept.order_code, kept.order_token.as_str(), kept.renewal),
            (7, "tok", false)
        );
        assert_eq!(
            kept.qr_code.as_deref(),
            Some("00020101021238570010A000000727012700069704220113VQRQAA"),
            "đúng chuỗi server trả, để vẽ lại mã QR khi mở lại app"
        );
        assert_eq!(
            (kept.amount, kept.currency.as_str()),
            (50_000, "VND"),
            "mở lại app vẫn biết số tiền và loại tiền của đơn"
        );
        let json = serde_json::to_string(&view).unwrap();
        assert!(!json.contains("tok"), "order_token không ra giao diện");
    }

    /// Loại tiền (spec 2026-10-14 D4): chỉ VND (VietQR) hay USD (thẻ); loại khác thì từ chối, không gọi server.
    #[test]
    fn only_vnd_and_usd_can_be_chosen() {
        assert_eq!(CURRENCIES, ["VND", "USD"]);
        let (api, _, l) = setup();
        for currency in ["EUR", "usd", "", "VND,USD"] {
            assert!(
                start(&l, "monthly", "a@b.vn", true, false, currency).is_err(),
                "{currency}"
            );
        }
        assert!(
            api.calls.lock().unwrap().is_empty(),
            "loại tiền lạ thì không gọi server"
        );
    }

    fn card_checkout(code: i64) -> Checkout {
        Checkout {
            order_code: code,
            order_token: "tok".into(),
            checkout_url: "https://checkout.creem.io/ch_abc".into(),
            qr_code: None,
            provider: Some("creem".into()),
            plan: "monthly".into(),
            amount: 399,
            currency: "USD".into(),
            expires_at: T0 + 1800,
            license_expires_at: None,
            converted_days: None,
        }
    }

    /// Đơn thẻ (Creem): không có mã QR để vẽ, vẫn lưu để hỏi tiếp, và khi đã trả thì kích hoạt như đơn PayOS.
    #[test]
    fn a_card_order_has_no_qr_is_kept_for_polling_and_activates_when_paid() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(card_checkout(8)));
        let view = start(&l, "monthly", "a@b.vn", true, false, "USD").unwrap();
        assert_eq!(api.calls.lock().unwrap()[0], "checkout monthly a@b.vn - USD");
        assert_eq!(
            (view.qr_svg, view.provider.as_str(), view.amount, view.currency.as_str()),
            (None, "creem", 399, "USD")
        );
        let kept = pending(&l).unwrap();
        assert_eq!((kept.amount, kept.currency.as_str()), (399, "USD"));
        assert_eq!((kept.qr_code, kept.provider.as_str()), (None, "creem"));
        api.orders.lock().unwrap().extend([
            Ok(order("pending", None, None)),
            Ok(order("paid", Some("new"), Some(KEY))),
        ]);
        assert!(matches!(poll(&l, T0 + 5), Some(OrderOutcome::Waiting { .. })));
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        assert!(matches!(poll(&l, T0 + 10), Some(OrderOutcome::Paid { .. })));
        assert!(l.is_pro(T0 + 10));
        assert_eq!(pending(&l), None, "thôi hỏi");
    }

    /// Nhịp hỏi trạng thái đơn (spec 2026-10-14 D7): 3 giây với đơn VietQR, 5 giây với đơn thẻ (không mã QR; 360 lần trong
    /// 30 phút, nằm trong hạn mức `order_poll` của server).
    #[test]
    fn a_card_order_is_polled_every_5_seconds_and_a_vietqr_order_every_3() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false, "VND").unwrap();
        assert_eq!(poll_secs(&pending(&l).unwrap(), T0), 3);
        assert_eq!(POLL_EVERY_SECS, 3);
        api.checkouts.lock().unwrap().push_back(Ok(card_checkout(8)));
        start(&l, "monthly", "a@b.vn", true, false, "USD").unwrap();
        assert_eq!(poll_secs(&pending(&l).unwrap(), T0), 5);
    }

    fn pending_order(qr_code: Option<&str>, provider: &str) -> PendingOrder {
        PendingOrder {
            order_code: 8,
            order_token: "tok".into(),
            plan: "monthly".into(),
            expires_at: T0 + 1800,
            renewal: false,
            checkout_url: "https://checkout.creem.io/ch_abc".into(),
            qr_code: qr_code.map(String::from),
            provider: provider.into(),
            amount: 399,
            currency: "USD".into(),
        }
    }

    /// Nhịp hỏi theo loại đơn và hạn (Q3 của chủ dự án; M1 của review C1): đơn VietQR 3 giây; đơn thẻ 5 giây tới
    /// `expires_at`, 30 giây trong giờ đầu sau hạn, rồi 120 giây tới hết 24 giờ sau hạn. Đơn do app cũ lưu (có QR, không
    /// `provider`) là đơn VietQR; chuỗi QR rỗng là đơn không có mã QR.
    #[test]
    fn the_poll_interval_follows_the_kind_of_order_and_its_expiry() {
        assert_eq!(
            (
                POLL_EVERY_SECS,
                POLL_EVERY_CARD_SECS,
                POLL_LATE_CARD_SECS,
                POLL_STALE_CARD_SECS
            ),
            (3, 5, 30, 120)
        );
        assert_eq!(LATE_CARD_FAST_WINDOW_SECS, 3600);
        let old: PendingOrder = serde_json::from_value(serde_json::json!({
            "order_code": 7, "order_token": "tok", "plan": "monthly", "expires_at": T0 + 1800, "renewal": false,
            "checkout_url": "https://pay.payos.vn/web/abc", "qr_code": "000201",
        }))
        .unwrap();
        let qr = pending_order(Some("000201"), "payos");
        let card = pending_order(None, "creem");
        let blank = pending_order(Some(""), "payos");
        let cases = [
            ("VietQR trong hạn", &qr, T0 + 1800, 3),
            ("VietQR sau hạn", &qr, T0 + 1801, 3),
            ("đơn app cũ lưu", &old, T0, 3),
            ("thẻ trong hạn", &card, T0 + 1800, 5),
            ("thẻ vừa quá hạn", &card, T0 + 1801, 30),
            ("thẻ tròn 1 giờ sau hạn", &card, T0 + 1800 + 3600, 30),
            ("thẻ quá 1 giờ sau hạn", &card, T0 + 1800 + 3601, 120),
            ("thẻ tròn 24 giờ sau hạn", &card, T0 + 1800 + 86_400, 120),
            ("thẻ quá 24 giờ sau hạn", &card, T0 + 1800 + 86_401, 120),
            ("QR rỗng trong hạn", &blank, T0, 5),
            ("QR rỗng sau hạn", &blank, T0 + 1801, 30),
            ("QR rỗng quá 1 giờ sau hạn", &blank, T0 + 1800 + 3601, 120),
        ];
        for (what, order, now, secs) in cases {
            assert_eq!(poll_secs(order, now), secs, "{what}");
        }
    }

    /// Hạn mức `order_poll` của server (`server/src/ratelimit.ts`): 600 lần mỗi cửa sổ giờ cố định theo giờ đồng hồ, tính
    /// theo IP và mã đơn. Một đơn thẻ bỏ dở, hỏi theo `poll_secs` tới hết 24 giờ sau hạn, dưới hạn mức ở mọi giờ dù tạo lúc
    /// nào trong giờ (nhiều nhất 360 lần trong hạn + 60 lần sau hạn); cả ngày chừng 1 170 lần (M1: trước là chừng 3 240).
    #[test]
    fn an_abandoned_card_order_stays_under_the_server_poll_limit_every_clock_hour() {
        const WINDOW: i64 = 3600;
        assert_eq!(T0 % WINDOW, 0, "T0 là đầu một giờ đồng hồ");
        for offset in (0..WINDOW).step_by(150) {
            let created = T0 + offset;
            let mut order = pending_order(None, "creem");
            order.expires_at = created + 1800;
            let mut per_hour = std::collections::BTreeMap::<i64, u32>::new();
            let mut t = created;
            while t <= order.expires_at + KEEP_AFTER_EXPIRY_SECS {
                *per_hour.entry(t - t % WINDOW).or_default() += 1;
                t += poll_secs(&order, t) as i64;
            }
            let busiest = per_hour.values().max().copied().unwrap_or(0);
            let total: u32 = per_hour.values().sum();
            assert!(busiest <= 421, "tạo lúc +{offset} giây: {busiest} lần trong một giờ");
            assert!(
                (1_100..1_250).contains(&total),
                "tạo lúc +{offset} giây: {total} lần cả ngày"
            );
        }
    }

    /// Kết quả nào cũng mang mã đơn vừa hỏi; luồng hỏi nền chỉ chuyển sang đơn khác khi kho đang giữ đơn có mã khác (I1 của
    /// review C1).
    #[test]
    fn every_outcome_names_its_order_and_only_a_different_pending_order_counts_as_another() {
        let outcomes = [
            OrderOutcome::Waiting {
                order_code: 7,
                expires_at: T0,
            },
            OrderOutcome::Paid {
                order_code: 7,
                plan: "monthly".into(),
            },
            OrderOutcome::Underpaid { order_code: 7 },
            OrderOutcome::NeedsReview { order_code: 7 },
            OrderOutcome::Refunded { order_code: 7 },
            OrderOutcome::Failed { order_code: 7 },
            OrderOutcome::PaidButNotApplied {
                order_code: 7,
                code: "licenseLocked".into(),
            },
        ];
        for outcome in &outcomes {
            assert_eq!(outcome.order_code(), 7, "{outcome:?}");
        }
        let (api, _, l) = setup();
        assert!(!another_order_pending(&l, 7), "không có đơn nào");
        api.checkouts.lock().unwrap().push_back(Ok(card_checkout(8)));
        start(&l, "monthly", "a@b.vn", true, false, "USD").unwrap();
        assert!(!another_order_pending(&l, 8), "vẫn là đơn vừa hỏi");
        assert!(another_order_pending(&l, 7), "đơn mới tạo sau đơn 7");
    }

    /// Quên đơn vừa xong ("đọc, đúng đơn thì xóa") và ghi đơn mới không chen nhau (M3 của review C1): lần ghi đơn mới tới
    /// đúng lúc giữa đọc và xóa thì chờ, nên đơn mới không bị xóa nhầm.
    #[test]
    fn a_new_order_is_not_written_between_the_check_and_the_delete_of_the_old_one() {
        use std::time::{Duration, Instant};
        let (api, vault, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(card_checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false, "USD").unwrap();
        let (reached_tx, reached) = std::sync::mpsc::channel();
        let (release, release_rx) = std::sync::mpsc::channel();
        *vault.hold_after_get.lock().unwrap() = Some((store::ORDER.into(), reached_tx, release_rx));
        api.checkouts.lock().unwrap().push_back(Ok(card_checkout(9)));
        std::thread::scope(|s| {
            // Đọc đơn 7 xong thì dừng, chưa xóa.
            let finishing = s.spawn(|| forget_order(&l, 7));
            reached.recv().unwrap();
            let creating = s.spawn(|| start(&l, "yearly", "a@b.vn", true, false, "USD"));
            // Không có khóa thì đơn 9 được ghi ngay; có khóa thì lần ghi chờ việc quên đơn 7 xong.
            let deadline = Instant::now() + Duration::from_millis(300);
            while Instant::now() < deadline && pending(&l).map(|o| o.order_code) != Some(9) {
                std::thread::sleep(Duration::from_millis(5));
            }
            release.send(()).unwrap();
            finishing.join().unwrap();
            creating.join().unwrap().unwrap();
        });
        assert_eq!(pending(&l).map(|o| o.order_code), Some(9), "đơn mới còn");
    }

    /// Luồng hỏi nền chờ theo đơn đang chờ, đọc lại sau mỗi lần hỏi (KH03-T4-a); không còn đơn (vừa hủy) thì chờ 3 giây rồi
    /// lần hỏi sau thấy không còn đơn và dừng.
    #[test]
    fn the_poller_waits_according_to_the_pending_order() {
        use std::time::Duration;
        let (api, _, l) = setup();
        assert_eq!(poll_delay(&l, T0), Duration::from_secs(3), "không có đơn");
        api.checkouts.lock().unwrap().push_back(Ok(card_checkout(8)));
        start(&l, "monthly", "a@b.vn", true, false, "USD").unwrap();
        assert_eq!(poll_delay(&l, T0 + 1800), Duration::from_secs(5));
        assert_eq!(poll_delay(&l, T0 + 1801), Duration::from_secs(30));
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false, "VND").unwrap();
        assert_eq!(poll_delay(&l, T0 + 5), Duration::from_secs(3));
    }

    /// Đơn thẻ (Q3 của chủ dự án; K1-KH03T3): trang của Creem vẫn nhận tiền sau `expires_at` của đơn và server vẫn cấp key
    /// tới 24 giờ, nên server còn báo `pending`/`processing` thì app chờ tiếp tới `expires_at` + 24 giờ, không báo "không
    /// thành" sớm (khách sẽ trả lần hai). Đơn VietQR giữ luật cũ (`other_order_states_end_or_continue_polling_…`).
    #[test]
    fn a_card_order_keeps_waiting_up_to_24_hours_after_its_expiry() {
        for status in ["pending", "processing"] {
            let (api, _, l) = setup();
            api.checkouts.lock().unwrap().push_back(Ok(card_checkout(8)));
            start(&l, "monthly", "a@b.vn", true, false, "USD").unwrap();
            api.orders
                .lock()
                .unwrap()
                .extend([(); 3].map(|()| Ok(order(status, None, None))));
            let waiting = Some(OrderOutcome::Waiting {
                order_code: 8,
                expires_at: T0 + 1800,
            });
            assert_eq!(poll(&l, T0 + 1801), waiting, "{status}: vừa quá hạn");
            assert_eq!(poll(&l, T0 + 1800 + 86_400), waiting, "{status}: tròn 24 giờ sau hạn");
            assert_eq!(
                poll(&l, T0 + 1800 + 86_401),
                Some(OrderOutcome::Failed { order_code: 8 }),
                "{status}: quá 24 giờ sau hạn"
            );
            assert_eq!(pending(&l), None, "{status}: thôi hỏi");
        }
    }

    /// Đơn thẻ mà server báo đã khép (`expired`, `failed`, `cancelled`): không thành ngay, kể cả còn trong hạn. `underpaid`
    /// (thẻ không trả thiếu: server giữ lại đơn có giảm giá hay trả thấp hơn giá để hỗ trợ xem, A4/Q4) là "đã nhận tiền, hỗ
    /// trợ đang xử lý", không phải "chuyển bù". Mọi trường hợp đều thôi hỏi và quên đơn.
    #[test]
    fn a_card_order_the_server_closed_or_held_ends_polling_at_once() {
        let cases = [
            ("expired", OrderOutcome::Failed { order_code: 8 }),
            ("failed", OrderOutcome::Failed { order_code: 8 }),
            ("cancelled", OrderOutcome::Failed { order_code: 8 }),
            ("underpaid", OrderOutcome::NeedsReview { order_code: 8 }),
            ("paid_needs_review", OrderOutcome::NeedsReview { order_code: 8 }),
            ("refunded", OrderOutcome::Refunded { order_code: 8 }),
        ];
        for (status, outcome) in cases {
            let (api, _, l) = setup();
            api.checkouts.lock().unwrap().push_back(Ok(card_checkout(8)));
            start(&l, "monthly", "a@b.vn", true, false, "USD").unwrap();
            api.orders.lock().unwrap().push_back(Ok(order(status, None, None)));
            assert_eq!(poll(&l, T0 + 5), Some(outcome), "{status}");
            assert_eq!(pending(&l), None, "{status}: thôi hỏi");
        }
    }

    /// Người dùng hủy đơn A rồi tạo đơn B trong lúc lần hỏi A còn chờ server (L294a): kết quả cuối của A không xóa đơn B.
    #[test]
    fn a_late_final_answer_for_a_cancelled_order_keeps_the_new_one() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(card_checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false, "USD").unwrap();
        let (release, hold) = std::sync::mpsc::channel();
        *api.order_hold.lock().unwrap() = Some(hold);
        api.orders.lock().unwrap().push_back(Ok(order("expired", None, None)));
        std::thread::scope(|s| {
            let asking = s.spawn(|| poll(&l, T0 + 5));
            while !api.calls.lock().unwrap().iter().any(|c| c == "order 7 tok") {
                std::thread::yield_now();
            }
            forget(&l);
            api.checkouts.lock().unwrap().push_back(Ok(card_checkout(9)));
            start(&l, "yearly", "a@b.vn", true, false, "USD").unwrap();
            release.send(()).unwrap();
            assert_eq!(asking.join().unwrap(), Some(OrderOutcome::Failed { order_code: 7 }));
        });
        assert_eq!(pending(&l).map(|o| o.order_code), Some(9), "đơn B còn");
    }

    /// `provider` chỉ để tham khảo (mọi quyết định theo mã QR; P2-KH03T1, KH03-T1-d): nhận `payos`, `creem`; giá trị khác
    /// hay không có thì suy theo mã QR (có QR là PayOS, không QR là Creem).
    #[test]
    fn an_unknown_provider_is_inferred_from_the_qr_code() {
        let cases = [
            (Some("creem"), false, "creem"),
            (Some("payos"), true, "payos"),
            (Some("stripe"), true, "payos"),
            (Some("stripe"), false, "creem"),
            (Some(""), false, "creem"),
            (None, true, "payos"),
            (None, false, "creem"),
        ];
        for (provider, qr, expect) in cases {
            let (api, _, l) = setup();
            let mut c = if qr { checkout(7) } else { card_checkout(7) };
            c.provider = provider.map(String::from);
            api.checkouts.lock().unwrap().push_back(Ok(c));
            let currency = if qr { "VND" } else { "USD" };
            let view = start(&l, "monthly", "a@b.vn", true, false, currency).unwrap();
            assert_eq!(
                (view.provider.as_str(), pending(&l).unwrap().provider.as_str()),
                (expect, expect),
                "{provider:?}, QR: {qr}"
            );
        }
    }

    /// Chuỗi QR rỗng là đơn không có mã QR (KH03-T1-a): không vẽ mã QR rỗng (ngân hàng báo lỗi khi quét), không lưu chuỗi rỗng.
    #[test]
    fn an_empty_qr_string_is_an_order_without_a_qr_code() {
        let (api, _, l) = setup();
        let mut c = card_checkout(8);
        c.qr_code = Some(String::new());
        api.checkouts.lock().unwrap().push_back(Ok(c));
        let view = start(&l, "monthly", "a@b.vn", true, false, "USD").unwrap();
        assert_eq!(view.qr_svg, None);
        assert_eq!(pending(&l).unwrap().qr_code, None);
    }

    /// Server cũ không nói `provider`: đơn có mã QR là đơn PayOS.
    #[test]
    fn an_order_without_a_provider_is_a_payos_order() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        let view = start(&l, "monthly", "a@b.vn", true, false, "VND").unwrap();
        assert_eq!(view.provider, "payos");
        assert_eq!(pending(&l).unwrap().provider, "payos");
    }

    /// Bảng gói trả cho giao diện kèm loại tiền gợi ý của server (tên trường camelCase).
    #[test]
    fn the_plans_view_carries_the_suggested_currency() {
        let (api, _, l) = setup();
        *api.plans.lock().unwrap() = Some(PlansReply {
            plans: vec![],
            suggested_currency: Some("USD".into()),
        });
        let view = plans(&l).unwrap();
        assert_eq!(view.suggested_currency.as_deref(), Some("USD"));
        assert_eq!(serde_json::to_value(&view).unwrap()["suggestedCurrency"], "USD");
    }

    #[test]
    fn a_paid_new_order_activates_its_key_on_this_machine() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false, "VND").unwrap();
        api.orders.lock().unwrap().extend([
            Ok(order("pending", None, None)),
            Ok(order("paid", Some("new"), Some(KEY))),
        ]);
        assert_eq!(
            poll(&l, T0 + 3),
            Some(OrderOutcome::Waiting {
                order_code: 7,
                expires_at: T0 + 900
            })
        );
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        assert_eq!(
            poll(&l, T0 + 6),
            Some(OrderOutcome::Paid {
                order_code: 7,
                plan: "monthly".into()
            })
        );
        assert!(l.is_pro(T0 + 6));
        assert!(
            api.calls
                .lock()
                .unwrap()
                .iter()
                .any(|c| c.starts_with("activate 0123456789ABCDEFGHJKMNPQRST5"))
        );
        assert_eq!(pending(&l), None, "thôi hỏi");
        assert_eq!(poll(&l, T0 + 9), None);
    }

    /// Gia hạn, đổi gói: `validate` để lấy token có gói và hạn mới. Hỗ trợ cấp key mới cho đơn của license đã thu hồi
    /// (`grant_kind: new`): kích hoạt key mới, không `validate` key cũ.
    #[test]
    fn a_paid_renewal_validates_unless_support_granted_a_new_key() {
        let (api, _, l) = setup();
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0).unwrap();
        for (kind, expect) in [
            ("extend", "validate"),
            ("change", "validate"),
            ("new", "activate 1111111111111111111111111Z0V"),
        ] {
            api.checkouts.lock().unwrap().push_back(Ok(checkout(8)));
            start(&l, "yearly", "a@b.vn", true, true, "VND").unwrap();
            assert!(
                api.calls
                    .lock()
                    .unwrap()
                    .last()
                    .unwrap()
                    .ends_with("0123456789ABCDEFGHJKMNPQRST5")
            );
            let key = (kind == "new").then_some("1111-1111-1111-1111-1111-1111-1Z0V");
            api.orders
                .lock()
                .unwrap()
                .push_back(Ok(order("paid", Some(kind), key.or(Some(KEY)))));
            api.replies.lock().unwrap().push_back(granted(&claims(T0 + 10), false));
            assert!(matches!(poll(&l, T0 + 10), Some(OrderOutcome::Paid { .. })), "{kind}");
            let calls = api.calls.lock().unwrap();
            assert!(calls[calls.len() - 1].starts_with(expect), "{kind}: {:?}", calls.last());
        }
    }

    #[test]
    fn other_order_states_end_or_continue_polling_as_the_contract_says() {
        let cases = [
            ("underpaid", OrderOutcome::Underpaid { order_code: 7 }, false),
            ("paid_needs_review", OrderOutcome::NeedsReview { order_code: 7 }, true),
            ("refunded", OrderOutcome::Refunded { order_code: 7 }, true),
            ("cancelled", OrderOutcome::Failed { order_code: 7 }, true),
            ("expired", OrderOutcome::Failed { order_code: 7 }, true),
            ("failed", OrderOutcome::Failed { order_code: 7 }, true),
        ];
        for (status, outcome, done) in cases {
            let (api, _, l) = setup();
            api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
            start(&l, "monthly", "a@b.vn", true, false, "VND").unwrap();
            api.orders.lock().unwrap().push_back(Ok(order(status, None, None)));
            assert_eq!(poll(&l, T0 + 3), Some(outcome), "{status}");
            assert_eq!(pending(&l).is_none(), done, "{status}");
        }
        // Link đã hết hạn mà server vẫn báo `pending`: đơn không thành.
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false, "VND").unwrap();
        api.orders.lock().unwrap().push_back(Ok(order("pending", None, None)));
        assert_eq!(poll(&l, T0 + 901), Some(OrderOutcome::Failed { order_code: 7 }));
        // Lỗi mạng: hỏi tiếp, tới 24 giờ sau khi link hết hạn.
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false, "VND").unwrap();
        api.orders.lock().unwrap().push_back(Err(ApiError::Network("x".into())));
        assert!(matches!(poll(&l, T0 + 3600), Some(OrderOutcome::Waiting { .. })));
        api.orders.lock().unwrap().push_back(Err(ApiError::Network("x".into())));
        assert_eq!(
            poll(&l, T0 + 900 + 86_401),
            Some(OrderOutcome::Failed { order_code: 7 })
        );
    }

    #[test]
    fn a_paid_order_whose_key_cannot_be_activated_here_reports_why() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false, "VND").unwrap();
        api.orders
            .lock()
            .unwrap()
            .push_back(Ok(order("paid", Some("new"), Some(KEY))));
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(crate::license::manager::tests::server(423, "license_locked")));
        assert_eq!(
            poll(&l, T0 + 3),
            Some(OrderOutcome::PaidButNotApplied {
                order_code: 7,
                code: "licenseLocked".into()
            })
        );
    }
}
