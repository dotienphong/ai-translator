import { type ReactNode, useState } from "react";
import { Icon } from "../../../components/Icon";
import { errorKey, type MessageKey, type Params, translate, type UiLanguage } from "../../../i18n";
import type { CheckoutView, LicenseView, OrderOutcome, PlanOffer } from "../../../lib/ipc";
import {
  cardOrderLate,
  chosenCurrency,
  defaultPlan,
  formatPrice,
  isBrowserOrder,
  isRenewal,
  lockedCurrency,
  offeredCurrencies,
  orderFinished,
  orderMessageKey,
  type PayCurrency,
  priceOf,
} from "../../../lib/license";
import type { UiError } from "../../../store/app";
import { LegalDetails } from "../LegalDocument";
import { when } from "../LicenseText";

// Phần hiển thị của màn hình Nâng cấp (kế hoạch hardening 06 C2): chỉ nhận props, không đọc store, để test vẽ được trong
// Node bằng `react-dom/server` (UpgradeView.test.ts). `UpgradeScreen` nối store vào đây. Ba bước đánh số (spec 2026-10-22):
// 1 Cách thanh toán, 2 Chọn gói, 3 Thanh toán; chưa có bảng gói thì chưa có bước nào.
export interface UpgradeViewProps {
  // Ngôn ngữ giao diện: chọn chữ, và chọn sẵn cách trả (tiếng Việt là VietQR, ngôn ngữ khác là thẻ quốc tế). Truyền vào thay
  // vì đọc store để test không phụ thuộc locale của máy chạy test.
  lang: UiLanguage;
  view: LicenseView | null;
  plans: PlanOffer[] | null;
  checkout: CheckoutView | null;
  order: OrderOutcome | null;
  error: UiError | null;
  busy: boolean;
  // Giờ hiện tại (giây Unix): đơn thẻ quá `checkout.expiresAt` mà còn chờ thì báo "đã quá giờ hẹn trả".
  now: number;
  onStart(plan: string, email: string, consent: boolean, renew: boolean, currency: PayCurrency): void;
  onOpenPage(): void;
  onCancel(): void;
}

export function UpgradeView({
  lang,
  view,
  plans,
  checkout,
  order,
  error,
  busy,
  now,
  onStart,
  onOpenPage,
  onCancel,
}: UpgradeViewProps) {
  const t = (key: MessageKey, params?: Params) => translate(lang, key, params);
  // Chưa chọn thì theo `defaultPlan(view)` (view nạp bất đồng bộ); đã bấm chọn thì giữ lựa chọn đó.
  const [picked, setPicked] = useState<PlanOffer["code"] | null>(null);
  // Cách trả: theo ngôn ngữ giao diện tới khi người dùng chọn; chọn xong mà bảng gói đổi (hết bán USD) thì quay về mặc định.
  const [pickedCurrency, setPickedCurrency] = useState<PayCurrency | null>(null);
  const [email, setEmail] = useState("");
  // Ô đồng ý gắn với loại tiền lúc tick: câu đồng ý của thẻ khác câu của VietQR (email gửi cho Creem), nên đổi cách trả thì
  // phải tick lại cho đúng câu đang hiện.
  const [consentFor, setConsentFor] = useState<PayCurrency | null>(null);
  const renew = isRenewal(view);
  const current = view?.plan ?? "free";
  // Đang có đơn chờ trả: gói và cách trả là của đơn đó và bị khóa (không theo lựa chọn cục bộ hay ngôn ngữ giao diện: đổi màn
  // hình hay mở lại app thì lựa chọn cục bộ mất). Đang tạo đơn (`busy`) cũng khóa, để đơn không tạo theo lựa chọn cũ trong
  // khi nút hiện lựa chọn mới.
  const pending = checkout !== null && !orderFinished(order) ? checkout : null;
  const locked = pending !== null;
  const plan: string = pending?.plan ?? picked ?? defaultPlan(view);
  const currencies = offeredCurrencies(plans);
  const currency = pending !== null ? lockedCurrency(pending) : chosenCurrency(pickedCurrency, plans, lang);
  const card = currency === "USD";
  const consent = consentFor === currency;
  const browser = checkout !== null && isBrowserOrder(checkout);
  const planList = (
    <ul className="plans">
      <li className="plan">
        <span className="plan-name">{t("plan.free")}</span>
        <span className="plan-price">{formatPrice(0, currency)}</span>
        <span className="plan-quota">{t("upgrade.free.quota")}</span>
        {current === "free" && <span className="badge active">{t("upgrade.current")}</span>}
      </li>
      {plans?.map((p) => (
        <li key={p.code} className="plan">
          <label>
            <input
              type="radio"
              name="plan"
              value={p.code}
              checked={plan === p.code}
              disabled={locked || busy}
              onChange={() => setPicked(p.code)}
            />
            <span className="plan-name">{p.name}</span>
          </label>
          {priceOf(p, currency) !== null && (
            <span className="plan-price">
              {formatPrice(priceOf(p, currency) ?? 0, currency)} <small>{t("upgrade.perDays", { days: p.days_per_order })}</small>
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
  );
  // Ghi chú của cách trả đang chọn: ở bước 1, ngay dưới hai nút.
  const methodNotes = (
    <div className="method-notes">
      <p className="hint">{t(card ? "upgrade.cardNote" : "upgrade.bankOnly")}</p>
      {/* Điều khoản Creem 3.7: Creem là bên bán lại (merchant of record) của đơn thẻ. */}
      {card && <p className="hint">{t("upgrade.cardMor")}</p>}
    </div>
  );
  const alert = (
    <div role="alert">
      {error && (
        <div className="notice error">
          <Icon name="alert" />
          <span>{t(errorKey(error.code))}</span>
        </div>
      )}
    </div>
  );
  const checkoutCard = checkout && (
    <div className={browser ? "card checkout browser" : "card checkout"}>
      {/* SVG do phía Rust vẽ (license::purchase::qr_svg), không lấy từ server hay người dùng. Đơn thẻ không có mã QR. */}
      {checkout.qrSvg != null && (
        <div className="qr" role="img" aria-label={t("upgrade.qr")} dangerouslySetInnerHTML={{ __html: checkout.qrSvg }} />
      )}
      <div>
        <h3 className="card-title">{t(browser ? "upgrade.browser.title" : "upgrade.scan")}</h3>
        <p className="order-code">
          {t("upgrade.order", { code: checkout.orderCode })}
          {checkout.amount > 0 && ` · ${formatPrice(checkout.amount, checkout.currency)}`}
        </p>
        {checkout.licenseExpiresAt !== null && (
          <p className="hint">
            {t("upgrade.newExpiry", { time: when(checkout.licenseExpiresAt) })}
            {(checkout.convertedDays ?? 0) > 0 && ` ${t("upgrade.converted", { days: checkout.convertedDays ?? 0 })}`}
            {checkout.convertedDays !== null && ` ${t("upgrade.noRefund")}`}
          </p>
        )}
        {/* Đơn thẻ: giờ hẹn trả và lời dặn "trình duyệt sẽ mở trang" chỉ khi đơn còn chờ. Đã xong thì câu trạng thái dặn
            đừng trả lại; quá giờ hẹn thì không hiện một giờ đã qua (câu trạng thái nói đã quá giờ). */}
        {!(browser && (pending === null || now > checkout.expiresAt)) && (
          <p className="hint">{t(browser ? "upgrade.linkExpiresPage" : "upgrade.linkExpires", { time: when(checkout.expiresAt) })}</p>
        )}
        {browser && pending !== null && <p className="hint">{t("upgrade.browser.note")}</p>}
        <p className={order?.state === "paid" ? "note order-status ok" : "note order-status"} role="status">
          <Icon name={order?.state === "paid" ? "check" : "info"} size={16} />
          <span>{t(orderMessageKey(order, browser, cardOrderLate(checkout, order, now)), { code: checkout.orderCode })}</span>
        </p>
        <div className="actions">
          <button onClick={onOpenPage} disabled={orderFinished(order)}>
            <Icon name="external" size={16} />
            {t(browser ? "upgrade.reopen" : "upgrade.openPage")}
          </button>
          <button onClick={onCancel}>{t(orderFinished(order) ? "upgrade.newOrder" : "common.cancel")}</button>
        </div>
        {/* Đơn thẻ còn chờ: trang Creem vẫn nhận tiền sau khi hủy đơn ở app (Q3; nút "Hủy" giữ theo spec §5). */}
        {browser && pending !== null && <p className="hint">{t("upgrade.browser.cancelNote")}</p>}
      </div>
    </div>
  );

  // Chưa có bảng gói (đang tải, không có mạng): chưa biết server bán loại tiền nào nên chưa vẽ bước nào và nút cách trả
  // (tránh vừa hiện VietQR lại nhảy sang thẻ); ghi chú cách trả chỉ khi có đơn chờ, vì loại tiền biết chắc từ đơn.
  if (plans === null) {
    return (
      <>
        {planList}
        {!error && <p className="hint">{t("upgrade.loading")}</p>}
        {pending !== null && methodNotes}
        {alert}
        {checkoutCard}
      </>
    );
  }
  return (
    <>
      <div className="upgrade-step">
        <StepTitle no={1} id="upgrade-method-label">
          {t("upgrade.method")}
        </StepTitle>
        <div className="step-body">
          <div className="pay-methods" role="radiogroup" aria-labelledby="upgrade-method-label">
            {currencies.map((c) => (
              <label key={c} className="pay-method">
                <input
                  type="radio"
                  name="method"
                  value={c}
                  checked={currency === c}
                  disabled={locked || busy}
                  onChange={() => setPickedCurrency(c)}
                />
                <Icon name={c === "USD" ? "card" : "qr"} size={16} />
                <span>{t(c === "USD" ? "upgrade.method.usd" : "upgrade.method.vnd")}</span>
              </label>
            ))}
          </div>
          {methodNotes}
        </div>
      </div>
      <div className="upgrade-step">
        <StepTitle no={2} id="upgrade-plan-label">
          {t("upgrade.step.plan")}
        </StepTitle>
        <div className="step-body">{planList}</div>
      </div>
      <div className="upgrade-step">
        <StepTitle no={3} id="upgrade-pay-label">
          {t("upgrade.step.pay")}
        </StepTitle>
        <div className="step-body">
          {alert}
          {pending === null && (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                onStart(plan, email, consent, renew, currency);
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
                <input type="checkbox" checked={consent} onChange={(e) => setConsentFor(e.target.checked ? currency : null)} />
                <span>{t(card ? "upgrade.consentCard" : "upgrade.consent")}</span>
              </label>
              <LegalDetails kind="privacy" />
              {/* Đơn thẻ: điều khoản bán hàng (EULA) ngay cạnh, cho người dùng bản cũ chưa thấy EULA mới (điều khoản Creem 3.7). */}
              {card && <LegalDetails kind="eula" />}
              <div className="actions">
                <button className="primary lg" type="submit" disabled={busy || !consent || email.trim() === ""}>
                  {t(card ? "upgrade.payCard" : "upgrade.pay")}
                </button>
              </div>
            </form>
          )}
          {checkoutCard}
        </div>
      </div>
    </>
  );
}

// Tiêu đề một bước: số thứ tự chỉ để nhìn (`aria-hidden`; các tiêu đề đã theo thứ tự), `id` đặt ở phần chữ để nhóm radio của
// bước 1 lấy đúng chữ đó làm nhãn.
function StepTitle({ no, id, children }: { no: number; id: string; children: ReactNode }) {
  return (
    <h2 className="step-title">
      <span className="step-no" aria-hidden="true">
        {no}
      </span>
      <span id={id}>{children}</span>
    </h2>
  );
}
