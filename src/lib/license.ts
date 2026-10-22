import type { UiLanguage } from "../i18n";
import type { CheckoutView, ConflictView, Device, LicenseView, OrderOutcome, PlanOffer, QuotaView, Standing } from "./ipc";

// Hiển thị bản quyền và hạn mức (kế hoạch 06; spec §4.2 bước 2, §4.3 "Bản quyền", "Nâng cấp"). Chỉ đọc kết quả phía Rust
// trả về; không tự tính gói hay hạn mức.

// Số phút còn lại, làm tròn xuống (không hứa nhiều hơn số thật).
export function minutesLeft(quota: QuotaView): number {
  return Math.floor(quota.remainingMs / 60_000);
}

// Giờ đã dùng của chu kỳ (gói trả phí), một chữ số thập phân.
export function hoursUsed(quota: QuotaView): number {
  return Math.round(quota.usedMs / 360_000) / 10;
}

// Khóa câu tóm tắt hạn mức ở màn hình chính và nhóm Bản quyền.
export type QuotaKey =
  | "quota.unlimited"
  | "quota.storageError"
  | "quota.lost"
  | "quota.needsNetwork"
  | "quota.used"
  | "quota.daily"
  | "quota.cycle";

export function quotaKey(quota: QuotaView): QuotaKey {
  if (quota.unlimited) return "quota.unlimited";
  if (quota.storageError) return "quota.storageError";
  if (quota.lost) return "quota.lost";
  if (quota.needsNetwork) return "quota.needsNetwork";
  if (quota.remainingMs === 0) return "quota.used";
  return quota.resetKind === "daily" ? "quota.daily" : "quota.cycle";
}

// Có lời nhắc nào cần hiện ở thanh báo của cửa sổ chính (thứ tự ưu tiên): bản không chính hãng, đồng hồ bị chỉnh lùi,
// lâu không làm mới được token, license hết hạn hay sắp hết hạn, bị thu hồi, key đang xung đột, Free đã hết dùng thử.
export type LicenseNoticeKey =
  | "license.notice.notGenuine"
  | "license.notice.clockRolledBack"
  | "license.notice.refreshNeeded"
  | "license.notice.expired"
  | "license.notice.revoked"
  | "license.notice.conflict"
  | "license.notice.trialEnded"
  | "license.notice.renewSoon";

export function licenseNotice(view: LicenseView | null): LicenseNoticeKey | null {
  if (!view) return null;
  const byStanding: Partial<Record<Standing, LicenseNoticeKey>> = {
    notGenuine: "license.notice.notGenuine",
    clockRolledBack: "license.notice.clockRolledBack",
    refreshNeeded: "license.notice.refreshNeeded",
    expired: "license.notice.expired",
    revoked: "license.notice.revoked",
    conflict: "license.notice.conflict",
  };
  const key = byStanding[view.standing];
  if (key) return key;
  if (view.clockRolledBack) return "license.notice.clockRolledBack";
  if (trialKey(view) === "trial.ended") return "license.notice.trialEnded";
  return view.standing === "active" && view.renewSoon ? "license.notice.renewSoon" : null;
}

// Dòng dùng thử ở màn hình chính, chỉ khi đang ở gói Free (spec 2026-10-07 §3.2): còn N ngày, đã hết, hay chưa đăng ký
// được (cần mạng).
export type TrialKey = "trial.active" | "trial.ended" | "trial.none";

export function trialKey(view: LicenseView): TrialKey | null {
  if (view.plan !== "free" || view.devOverride) return null;
  return `trial.${view.trial.status}`;
}

// Mua mới hay gia hạn / đổi gói key đang có. License đã thu hồi thì mua mới (server từ chối gia hạn key đã thu hồi).
export function isRenewal(view: LicenseView | null): boolean {
  return view?.key != null && view.standing !== "revoked";
}

// Gói chọn sẵn ở màn hình Nâng cấp: gia hạn được thì chọn đúng gói đang dùng (mặc định là gia hạn, không phải hạ gói), còn lại là Monthly.
export function defaultPlan(view: LicenseView | null): PlanOffer["code"] {
  return isRenewal(view) && view !== null && view.plan !== "free" ? view.plan : "monthly";
}

// Loại tiền khách chọn ở màn hình Nâng cấp (spec 2026-10-14 D4): VND trả bằng VietQR (PayOS), USD trả bằng thẻ quốc tế
// (Creem). Cũng là giá trị `currency` gửi khi tạo đơn.
export type PayCurrency = "VND" | "USD";

// Các loại tiền mua được lúc này. VND luôn có (server cũ chỉ bán VND); USD chỉ khi MỌI gói đều có giá USD: server chưa bật
// Creem thì không trả giá USD nào, và một bảng giá thiếu USD ở vài gói là cấu hình lỗi, không chào bán nửa vời.
export function offeredCurrencies(plans: readonly PlanOffer[] | null): PayCurrency[] {
  const usd = plans !== null && plans.length > 0 && plans.every((p) => p.prices.USD !== undefined);
  return usd ? ["VND", "USD"] : ["VND"];
}

// Loại tiền chọn sẵn theo ngôn ngữ giao diện (spec 2026-10-22 §3): tiếng Việt là VND (VietQR), ngôn ngữ khác là USD (thẻ
// quốc tế) nếu bán được USD, không thì VND. Người dùng đổi được.
export function defaultCurrency(plans: readonly PlanOffer[] | null, lang: UiLanguage): PayCurrency {
  return lang !== "vi" && offeredCurrencies(plans).includes("USD") ? "USD" : "VND";
}

// Loại tiền đang chọn khi chưa có đơn chờ: khách đã bấm chọn và loại đó còn bán thì giữ; chưa chọn, hay bảng gói mới không
// còn bán loại đã chọn (tắt bán thẻ), thì theo mặc định (ngôn ngữ giao diện).
export function chosenCurrency(
  picked: PayCurrency | null,
  plans: readonly PlanOffer[] | null,
  lang: UiLanguage,
): PayCurrency {
  return picked !== null && offeredCurrencies(plans).includes(picked) ? picked : defaultCurrency(plans, lang);
}

// Loại tiền của đơn đang chờ (nhóm cách trả khóa ở đúng loại này, không theo lựa chọn cục bộ hay gợi ý của server): `currency`
// của đơn nếu là VND hay USD; đơn do bản app cũ lưu (đọc lại khi mở app: số tiền 0, loại tiền rỗng) thì suy theo mã QR.
export function lockedCurrency(checkout: CheckoutView): PayCurrency {
  if (checkout.currency === "VND" || checkout.currency === "USD") return checkout.currency;
  return isBrowserOrder(checkout) ? "USD" : "VND";
}

// Giá một gói theo loại tiền (đồng hay cent), hay `null` nếu server không bán gói đó bằng loại tiền này.
export function priceOf(plan: PlanOffer, currency: PayCurrency): number | null {
  return plan.prices[currency] ?? null;
}

// Giá hiển thị: VND "50.000 đ" (dấu chấm ngăn nghìn, như trước); USD đổi từ cent, "$3.99" (cố định kiểu en-US, không theo
// ngôn ngữ giao diện, để "$" và dấu thập phân luôn như trên trang thanh toán). Loại tiền khác: số và mã tiền như nhận được
// (không đoán đơn vị).
export function formatPrice(amount: number, currency: string): string {
  if (currency === "USD") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount / 100);
  if (currency === "VND") return `${amount.toLocaleString("vi-VN")} đ`;
  return `${amount} ${currency}`.trim();
}

// Đơn không có mã QR (thẻ quốc tế): khách trả ở trang thanh toán mở bằng trình duyệt, không quét mã trong app. `== null`:
// khóa `qrSvg` vắng cũng là không có mã QR.
export function isBrowserOrder(checkout: CheckoutView): boolean {
  return checkout.qrSvg == null;
}

// Đơn thẻ đã quá giờ hẹn trả (`expiresAt`, giây Unix) mà chưa có kết quả hỏi nào (vừa mở lại app: luồng hỏi nền chạy trước
// khi màn hình nghe, sự kiện kế tiếp có thể 30 giây sau) hay server còn báo chờ. Trang của Creem vẫn nhận tiền sau giờ này và
// app hỏi tiếp tới 24 giờ sau hạn (Q3), nên đây không phải thất bại. Đơn VietQR không có khái niệm này.
export function cardOrderLate(checkout: CheckoutView, order: OrderOutcome | null, now: number): boolean {
  return isBrowserOrder(checkout) && (order === null || order.state === "waiting") && now > checkout.expiresAt;
}

// Tên hiển thị của một máy trong danh sách `409 key_in_use` hay `409 license_conflict`; `device_label` là `null` thì dùng
// tên thay thế.
export function deviceName(device: Device, fallback: string): string {
  return device.device_label?.trim() || fallback;
}

// Máy trong danh sách xung đột có phải máy này không.
export function isThisMachine(conflict: ConflictView, device: Device): boolean {
  return device.activation_id === conflict.thisActivationId;
}

// Câu báo theo trạng thái đơn (bảng "App hiện gì theo `status`" của kế hoạch 05). `outcome` null: chưa có kết quả hỏi nào,
// coi như đang chờ. `browser`: đơn thẻ mở bằng trình duyệt, đang chờ là "chờ xác nhận thanh toán" (không phải "chờ chuyển
// khoản"), quá giờ hẹn trả (`late`, xem `cardOrderLate`) là "đã quá giờ hẹn trả… đừng trả lại", không thành cũng dặn đừng trả
// lại (khách có thể đã trả ở trang của Creem; Q3), chưa đủ tiền thì không hứa chuyển bù; các trạng thái khác như nhau.
export function orderMessageKey(outcome: OrderOutcome | null, browser = false, late = false) {
  switch (outcome?.state ?? "waiting") {
    case "waiting":
      if (!browser) return "upgrade.order.waiting" as const;
      return late ? ("upgrade.order.waitingCardLate" as const) : ("upgrade.order.waitingCard" as const);
    case "paid":
      return "upgrade.order.paid" as const;
    case "underpaid":
      // Chuyển bù chỉ có ở đơn VietQR; đơn thẻ không chuyển bù được (Creem trả đủ hay không trả), nên là "hỗ trợ đang xử lý".
      return browser ? ("upgrade.order.needsReview" as const) : ("upgrade.order.underpaid" as const);
    case "needsReview":
      return "upgrade.order.needsReview" as const;
    case "refunded":
      return "upgrade.order.refunded" as const;
    case "failed":
      return browser ? ("upgrade.order.failedCard" as const) : ("upgrade.order.failed" as const);
    case "paidButNotApplied":
      return "upgrade.order.paidButNotApplied" as const;
  }
}

// Đơn đã xong (thôi hỏi): cho tạo đơn mới. `underpaid` vẫn chờ chuyển bù.
export function orderFinished(outcome: OrderOutcome | null): boolean {
  return outcome !== null && outcome.state !== "waiting" && outcome.state !== "underpaid";
}
