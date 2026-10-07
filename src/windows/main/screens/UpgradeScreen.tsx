import { useEffect, useState } from "react";
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
      <div className="card">
        <ul className="plans">
          <li className={current === "free" ? "plan current" : "plan"}>
            <strong>
              <PlanName plan="free" />
            </strong>
            <span>{t("upgrade.free.quota")}</span>
            <span>{vnd(0)}</span>
            {current === "free" && <span className="badge active">{t("upgrade.current")}</span>}
          </li>
          {plans?.map((p) => (
            <li key={p.code} className={current === p.code ? "plan current" : "plan"}>
              <label>
                <input
                  type="radio"
                  name="plan"
                  checked={plan === p.code}
                  disabled={checkout !== null && !orderFinished(order)}
                  onChange={() => setPicked(p.code)}
                />
                <strong>{p.name}</strong>
              </label>
              <span>
                {p.quota_minutes_per_cycle === null
                  ? t("upgrade.unlimited")
                  : t("upgrade.hours", { hours: p.quota_minutes_per_cycle / 60 })}
              </span>
              <span>{priceVnd(p) === null ? "" : t("upgrade.price", { price: vnd(priceVnd(p) ?? 0), days: p.days_per_order })}</span>
              {current === p.code && <span className="badge active">{t("upgrade.current")}</span>}
            </li>
          ))}
        </ul>
        {plans === null && !error && <p className="hint">{t("upgrade.loading")}</p>}
        <p className="hint">{t("upgrade.bankOnly")}</p>
      </div>
      <div role="alert">{error && <p className="error-text">{t(errorKey(error.code))}</p>}</div>
      {plans && (checkout === null || orderFinished(order)) && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void start(plan, email, consent, renew);
          }}
        >
          {renew && <p>{t("upgrade.renewing")}</p>}
          <div className="row">
            <label htmlFor="upgrade-email">{t("upgrade.email")}</label>
            <input id="upgrade-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <label className="row">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t("upgrade.consent")}</span>
          </label>
          <LegalDetails kind="privacy" />
          <button className="primary" type="submit" disabled={busy || !consent || email.trim() === ""}>
            {t("upgrade.pay")}
          </button>
        </form>
      )}
      {checkout && (
        <div className="card">
          <h2>{t("upgrade.scan")}</h2>
          {/* SVG do phía Rust vẽ (license::purchase::qr_svg), không lấy từ server hay người dùng. */}
          <div className="qr" role="img" aria-label={t("upgrade.qr")} dangerouslySetInnerHTML={{ __html: checkout.qrSvg }} />
          <p>
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
          <p role="status">{order ? t(orderMessageKey(order), { code: checkout.orderCode }) : t("upgrade.order.waiting")}</p>
          <div className="row">
            <button onClick={() => void openPage()} disabled={orderFinished(order)}>
              {t("upgrade.openPage")}
            </button>
            <button onClick={() => void cancel()}>{t(orderFinished(order) ? "upgrade.newOrder" : "common.cancel")}</button>
          </div>
        </div>
      )}
    </>
  );
}
