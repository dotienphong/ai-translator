//! Mua, gia hạn, đổi gói ngay trong app (spec §6.8 "Mua ngay trong app", §4.3 "Nâng cấp", §10.1; hợp đồng ở mục "App hiện
//! gì theo `status`" của kế hoạch 05):
//! 1. bảng gói lấy từ server (`GET /v1/plans`);
//! 2. tạo đơn với email và ô đồng ý (`consent`), kèm key đang có khi gia hạn hay đổi gói;
//! 3. vẽ mã VietQR từ chuỗi `qr_code` (SVG, phía Rust), kèm nút mở trang thanh toán của PayOS;
//! 4. hỏi trạng thái đơn mỗi 3 giây tới khi link hết hạn; đơn đã trả tiền thì tự kích hoạt key mới (`grant_kind: new`,
//!    kể cả đơn gia hạn được hỗ trợ cấp key mới), hay `validate` để lấy token có gói và hạn mới (`extend`, `change`);
//! 5. đơn đang chờ lưu trong kho khóa (`license-order`), mở lại app thì hỏi tiếp.

use qrcode::QrCode;
use qrcode::render::svg;
use serde::Serialize;

use super::client::{Checkout, OrderStatus, PlanOffer};
use super::manager::{License, LicenseError};
use super::store::{self, PendingOrder};

/// Mã gói được bán (spec 2026-10-07 §1).
pub const PLANS: [&str; 2] = ["monthly", "yearly"];
/// App hỏi trạng thái đơn mỗi chừng này (§6.8 bước 4).
pub const POLL_EVERY_SECS: u64 = 3;
/// Đơn đang chờ giữ thêm chừng này sau khi link hết hạn (webhook đến chậm, mở lại app vẫn hỏi lại một lần), rồi bỏ.
const KEEP_AFTER_EXPIRY_SECS: i64 = 24 * 3600;
const MAX_EMAIL_LEN: usize = 254;

/// Đơn vừa tạo, cho màn hình Nâng cấp. Không có `order_token` (chỉ phía Rust giữ).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutView {
    pub order_code: i64,
    pub plan: String,
    pub amount: i64,
    pub currency: String,
    pub expires_at: i64,
    /// Mã VietQR đã vẽ (SVG).
    pub qr_svg: String,
    pub license_expires_at: Option<i64>,
    pub converted_days: Option<i64>,
}

/// Kết quả một lần hỏi đơn, theo bảng "App hiện gì theo `status`".
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum OrderOutcome {
    /// `pending`, `processing`: hỏi tiếp.
    Waiting { order_code: i64, expires_at: i64 },
    /// `paid`: đã kích hoạt hay làm mới token; thôi hỏi.
    Paid { order_code: i64, plan: String },
    /// `underpaid`: chuyển bù cho đúng đơn trong 24 giờ, hay liên hệ hỗ trợ.
    Underpaid { order_code: i64 },
    /// `paid_needs_review`: đã nhận tiền, chờ hỗ trợ xử lý; thôi hỏi.
    NeedsReview { order_code: i64 },
    /// `refunded`: đơn đã được hoàn tiền, không có key; thôi hỏi.
    Refunded { order_code: i64 },
    /// `cancelled`, `expired`, `failed`, hay link đã hết hạn: cho tạo đơn mới; thôi hỏi.
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

fn checkout_view(c: &Checkout) -> Result<CheckoutView, LicenseError> {
    Ok(CheckoutView {
        order_code: c.order_code,
        plan: c.plan.clone(),
        amount: c.amount,
        currency: c.currency.clone(),
        expires_at: c.expires_at,
        qr_svg: qr_svg(&c.qr_code)?,
        license_expires_at: c.license_expires_at,
        converted_days: c.converted_days,
    })
}

/// Bảng gói đang bán.
pub fn plans(license: &License) -> Result<Vec<PlanOffer>, LicenseError> {
    let reply = license.api().plans();
    license.observe_reply(&reply);
    reply.result.map_err(super::manager::map_api)
}

/// Tạo đơn. `renew`: gia hạn hay đổi gói key đang có (cần đã kích hoạt). Thiếu ô đồng ý thì từ chối, không gọi server
/// (§10.1).
pub fn start(
    license: &License,
    plan: &str,
    email: &str,
    consent: bool,
    renew: bool,
) -> Result<CheckoutView, LicenseError> {
    if !consent {
        return Err(LicenseError::ConsentRequired);
    }
    if !PLANS.contains(&plan) {
        return Err(LicenseError::Server("plan".into()));
    }
    let email = check_email(email)?;
    let key = if renew {
        Some(license.license_key().ok_or(LicenseError::NotActivated)?)
    } else {
        None
    };
    let reply = license.api().checkout(plan, &email, key.as_deref());
    license.observe_reply(&reply);
    let checkout = reply.result.map_err(super::manager::map_api)?;
    let view = checkout_view(&checkout)?;
    let pending = PendingOrder {
        order_code: checkout.order_code,
        order_token: checkout.order_token,
        plan: checkout.plan,
        expires_at: checkout.expires_at,
        renewal: renew,
        checkout_url: checkout.checkout_url,
        qr_code: checkout.qr_code,
    };
    store::write(license.vault(), store::ORDER, &pending).map_err(|e| LicenseError::Storage(e.to_string()))?;
    Ok(view)
}

/// Đơn đang chờ (nếu có).
pub fn pending(license: &License) -> Option<PendingOrder> {
    store::read(license.vault(), store::ORDER).ok().flatten()
}

/// Bỏ đơn đang chờ (người dùng đóng màn hình thanh toán, hay đơn đã xong).
pub fn forget(license: &License) {
    let _ = store::delete(license.vault(), store::ORDER);
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
        forget(license);
    }
    Some(outcome)
}

fn apply(license: &License, order: &PendingOrder, status: &OrderStatus, now: i64) -> OrderOutcome {
    let code = order.order_code;
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
        "underpaid" => OrderOutcome::Underpaid { order_code: code },
        "paid_needs_review" => OrderOutcome::NeedsReview { order_code: code },
        "refunded" => OrderOutcome::Refunded { order_code: code },
        "pending" | "processing" if now <= order.expires_at => OrderOutcome::Waiting {
            order_code: code,
            expires_at: order.expires_at,
        },
        _ => OrderOutcome::Failed { order_code: code },
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::license::client::ApiError;
    use crate::license::manager::tests::{FakeApi, KEY, T0, claims, granted, license};
    use crate::license::store::tests::FakeVault;

    fn checkout(code: i64) -> Checkout {
        Checkout {
            order_code: code,
            order_token: "tok".into(),
            checkout_url: "https://pay.payos.vn/web/abc".into(),
            qr_code: "00020101021238570010A000000727012700069704220113VQRQAA".into(),
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
            start(&l, "monthly", "a@b.vn", false, false),
            Err(LicenseError::ConsentRequired)
        );
        assert_eq!(
            start(&l, "monthly", "khong-co-a-cong", true, false),
            Err(LicenseError::EmailInvalid)
        );
        assert_eq!(
            start(&l, "monthly", "a b@c.vn", true, false),
            Err(LicenseError::EmailInvalid)
        );
        assert!(start(&l, "free", "a@b.vn", true, false).is_err());
        assert_eq!(
            start(&l, "monthly", "a@b.vn", true, true),
            Err(LicenseError::NotActivated),
            "gia hạn cần key đã kích hoạt"
        );
        assert!(api.calls.lock().unwrap().is_empty(), "không gọi server");
    }

    #[test]
    fn a_new_order_draws_the_qr_and_is_kept_for_polling() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        let view = start(&l, "monthly", " a@b.vn ", true, false).unwrap();
        assert_eq!(api.calls.lock().unwrap()[0], "checkout monthly a@b.vn -");
        assert!(view.qr_svg.contains("<svg") && view.qr_svg.contains("</svg>"));
        let kept = pending(&l).unwrap();
        assert_eq!(
            (kept.order_code, kept.order_token.as_str(), kept.renewal),
            (7, "tok", false)
        );
        let json = serde_json::to_string(&view).unwrap();
        assert!(!json.contains("tok"), "order_token không ra giao diện");
    }

    #[test]
    fn a_paid_new_order_activates_its_key_on_this_machine() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false).unwrap();
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
            start(&l, "yearly", "a@b.vn", true, true).unwrap();
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
            start(&l, "monthly", "a@b.vn", true, false).unwrap();
            api.orders.lock().unwrap().push_back(Ok(order(status, None, None)));
            assert_eq!(poll(&l, T0 + 3), Some(outcome), "{status}");
            assert_eq!(pending(&l).is_none(), done, "{status}");
        }
        // Link đã hết hạn mà server vẫn báo `pending`: đơn không thành.
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false).unwrap();
        api.orders.lock().unwrap().push_back(Ok(order("pending", None, None)));
        assert_eq!(poll(&l, T0 + 901), Some(OrderOutcome::Failed { order_code: 7 }));
        // Lỗi mạng: hỏi tiếp, tới 24 giờ sau khi link hết hạn.
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false).unwrap();
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
        start(&l, "monthly", "a@b.vn", true, false).unwrap();
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
