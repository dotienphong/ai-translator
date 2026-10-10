import { useEffect, useState } from "react";
import { Icon } from "../../../components/Icon";
import { errorKey } from "../../../i18n";
import type { PlanOffer } from "../../../lib/ipc";
import { defaultPlan, isRenewal, orderFinished, orderMessageKey, priceVnd } from "../../../lib/license";
import { useT } from "../appStore";
import { useLicense } from "../licenseStore";
import { LegalDetails } from "../LegalDocument";
import { PlanName, when } from "../LicenseText";

const vnd = (amount: number) => `${amount.toLocaleString("vi-VN")} đ`;

// Màn hình Nâng cấp (§4.3; spec 2026-10-07 §1): đủ 3 gói, Free dùng thử 10 ngày, Monthly 30 ngày, Yearly 365 ngày (giá
// và số ngày mỗi đơn lấy từ license server, không có mạng thì báo cần mạng), đánh dấu gói đang dùng.
// Chọn gói, nhập email, tick ô đồng ý xử lý email (§10.1), rồi quét mã VietQR vẽ ngay trong app (phía Rust vẽ SVG từ
// chuỗi `qr_code`), kèm nút mở trang thanh toán của PayOS. Đang có key thì đơn là gia hạn hay đổi gói; đổi gói thì hiện
// trước số ngày quy đổi và ngày hết hạn mới, ghi rõ không hoàn tiền. MVP chỉ nhận chuyển khoản từ ngân hàng Việt Nam.
export function UpgradeScreen() {
  const t = useT();
  const view = useLicense((s) => s.view);
  const plans = useLicense((s) => s.plans);
  const checkout = useLicense((s) => s.checkout);
  const order = useLicense((s) => s.order);
  const error = useLicense((s) => s.error);
  const busy = useLicense((s) => s.busy);
  const loadPlans = useLicense((s) => s.loadPlans);
  const start = useLicense((s) => s.startCheckout);
  const openPage = useLicense((s) => s.openCheckoutPage);
  const cancel = useLicense((s) => s.cancelCheckout);
  // Chưa chọn thì theo `defaultPlan(view)` (view nạp bất đồng bộ); đã bấm chọn thì giữ lựa chọn đó.
  const [picked, setPicked] = useState<PlanOffer["code"] | null>(null);
  const plan = picked ?? defaultPlan(view);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);
  const renew = isRenewal(view);
  const current = view?.plan ?? "free";
  return (
    <>
      <ul className="plans">
        <li className="plan">
          <span className="plan-name">
            <PlanName plan="free" />
          </span>
          <span className="plan-price">{vnd(0)}</span>
          <span className="plan-quota">{t("upgrade.free.quota")}</span>
          {current === "free" && <span className="badge active">{t("upgrade.current")}</span>}
        </li>
        {plans?.map((p) => (
          <li key={p.code} className="plan">
            <label>
              <input
                type="radio"
                name="plan"
                checked={plan === p.code}
                disabled={checkout !== null && !orderFinished(order)}
                onChange={() => setPicked(p.code)}
              />
              <span className="plan-name">{p.name}</span>
            </label>
            {priceVnd(p) !== null && (
              <span className="plan-price">
                {vnd(priceVnd(p) ?? 0)} <small>{t("upgrade.perDays", { days: p.days_per_order })}</small>
              </span>
            )}
            <span className="plan-quota">
              {p.quota_minutes_per_cycle === null
                ? t("upgrade.unlimited")
                : t("upgrade.hours", { hours: p.quota_minutes_per_cycle / 60 })}
            </span>
            {current === p.code && <span className="badge active">{t("upgrade.current")}</span>}
          </li>
        ))}
      </ul>
      {plans === null && !error && <p className="hint">{t("upgrade.loading")}</p>}
      <p className="hint">{t("upgrade.bankOnly")}</p>
      <div role="alert">
        {error && (
          <div className="notice error">
            <Icon name="alert" />
            <span>{t(errorKey(error.code))}</span>
          </div>
        )}
      </div>
      {plans && (checkout === null || orderFinished(order)) && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void start(plan, email, consent, renew);
          }}
        >
          {renew && (
            <p className="note">
              <Icon name="info" size={16} />
              <span>{t("upgrade.renewing")}</span>
            </p>
          )}
          <label className="field-label form-label" htmlFor="upgrade-email">
            {t("upgrade.email")}
          </label>
          <input id="upgrade-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t("upgrade.consent")}</span>
          </label>
          <LegalDetails kind="privacy" />
          <div className="actions">
            <button className="primary lg" type="submit" disabled={busy || !consent || email.trim() === ""}>
              {t("upgrade.pay")}
            </button>
          </div>
        </form>
      )}
      {checkout && (
        <div className="card checkout">
          {/* SVG do phía Rust vẽ (license::purchase::qr_svg), không lấy từ server hay người dùng. */}
          <div className="qr" role="img" aria-label={t("upgrade.qr")} dangerouslySetInnerHTML={{ __html: checkout.qrSvg }} />
          <div>
            <h2 className="card-title">{t("upgrade.scan")}</h2>
            <p className="order-code">
              {t("upgrade.order", { code: checkout.orderCode })}
              {checkout.amount > 0 && ` · ${vnd(checkout.amount)}`}
            </p>
            {checkout.licenseExpiresAt !== null && (
              <p className="hint">
                {t("upgrade.newExpiry", { time: when(checkout.licenseExpiresAt) })}
                {(checkout.convertedDays ?? 0) > 0 && ` ${t("upgrade.converted", { days: checkout.convertedDays ?? 0 })}`}
                {checkout.convertedDays !== null && ` ${t("upgrade.noRefund")}`}
              </p>
            )}
            <p className="hint">{t("upgrade.linkExpires", { time: when(checkout.expiresAt) })}</p>
            <p className={order && order.state === "paid" ? "note order-status ok" : "note order-status"} role="status">
              <Icon name={order && order.state === "paid" ? "check" : "info"} size={16} />
              <span>{order ? t(orderMessageKey(order), { code: checkout.orderCode }) : t("upgrade.order.waiting")}</span>
            </p>
            <div className="actions">
              <button onClick={() => void openPage()} disabled={orderFinished(order)}>
                <Icon name="external" size={16} />
                {t("upgrade.openPage")}
              </button>
              <button onClick={() => void cancel()}>{t(orderFinished(order) ? "upgrade.newOrder" : "common.cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
