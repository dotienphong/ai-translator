import { describe, expect, it } from "vitest";
import type { CheckoutView, LicenseView, OrderOutcome, PlanOffer, QuotaView } from "./ipc";
import {
  cardOrderLate,
  chosenCurrency,
  defaultCurrency,
  defaultPlan,
  deviceName,
  formatPrice,
  hoursUsed,
  isBrowserOrder,
  isRenewal,
  isThisMachine,
  licenseNotice,
  lockedCurrency,
  minutesLeft,
  offeredCurrencies,
  orderFinished,
  orderMessageKey,
  priceOf,
  quotaKey,
  trialKey,
} from "./license";

const quota = (patch: Partial<QuotaView> = {}): QuotaView => ({
  unlimited: false,
  limitMs: 1_800_000,
  usedMs: 0,
  remainingMs: 1_800_000,
  resetAt: 1_790_900_000,
  resetKind: "daily",
  needsNetwork: false,
  lost: false,
  storageError: false,
  ...patch,
});

const licenseView = (patch: Partial<LicenseView> = {}): LicenseView => ({
  standing: "free",
  plan: "free",
  licensedPlan: null,
  key: null,
  expiresAt: null,
  refreshBefore: null,
  validatedAt: null,
  renewSoon: false,
  quota: quota(),
  serverConfigured: true,
  devOverride: false,
  clockRolledBack: false,
  trial: { status: "active", endsAt: 1_791_676_800, daysLeft: 10 },
  conflict: null,
  ...patch,
});

describe("hạn mức", () => {
  it("số phút làm tròn xuống, giờ đã dùng một chữ số thập phân", () => {
    expect(minutesLeft(quota({ remainingMs: 59_999 }))).toBe(0);
    expect(minutesLeft(quota({ remainingMs: 300_000 }))).toBe(5);
    expect(hoursUsed(quota({ usedMs: 5_400_000 }))).toBe(1.5);
  });

  it("câu tóm tắt theo thứ tự: không giới hạn, lỗi kho khóa, mất bản ghi, cần mạng, đã hết, còn", () => {
    expect(quotaKey(quota({ unlimited: true, storageError: true }))).toBe("quota.unlimited");
    expect(quotaKey(quota({ storageError: true, lost: true }))).toBe("quota.storageError");
    expect(quotaKey(quota({ lost: true, remainingMs: 0 }))).toBe("quota.lost");
    expect(quotaKey(quota({ needsNetwork: true, resetKind: "cycle" }))).toBe("quota.needsNetwork");
    expect(quotaKey(quota({ remainingMs: 0 }))).toBe("quota.used");
    expect(quotaKey(quota())).toBe("quota.daily");
    expect(quotaKey(quota({ resetKind: "expiry" }))).toBe("quota.cycle");
  });
});

describe("lời nhắc bản quyền", () => {
  it("theo tình trạng; sắp hết hạn chỉ khi đang có gói", () => {
    expect(licenseNotice(null)).toBeNull();
    expect(licenseNotice(licenseView())).toBeNull();
    expect(licenseNotice(licenseView({ standing: "notGenuine" }))).toBe("license.notice.notGenuine");
    expect(licenseNotice(licenseView({ standing: "clockRolledBack" }))).toBe("license.notice.clockRolledBack");
    expect(licenseNotice(licenseView({ standing: "refreshNeeded" }))).toBe("license.notice.refreshNeeded");
    expect(licenseNotice(licenseView({ standing: "expired", renewSoon: true }))).toBe("license.notice.expired");
    expect(licenseNotice(licenseView({ standing: "revoked" }))).toBe("license.notice.revoked");
    expect(licenseNotice(licenseView({ standing: "active", renewSoon: true }))).toBe("license.notice.renewSoon");
    expect(licenseNotice(licenseView({ standing: "active" }))).toBeNull();
    // Gói Free cũng nhắc chỉnh giờ máy (Q2 của review 06 lần 1).
    expect(licenseNotice(licenseView({ standing: "free", clockRolledBack: true }))).toBe("license.notice.clockRolledBack");
    // Mỗi key một máy và dùng thử 10 ngày (spec 2026-10-07 §3.2, §4.2).
    expect(licenseNotice(licenseView({ standing: "conflict" }))).toBe("license.notice.conflict");
    const ended = { status: "ended", endsAt: 1, daysLeft: 0 } as const;
    expect(licenseNotice(licenseView({ trial: ended }))).toBe("license.notice.trialEnded");
    expect(licenseNotice(licenseView({ standing: "expired", trial: ended }))).toBe("license.notice.expired");
    expect(licenseNotice(licenseView({ standing: "active", plan: "monthly", trial: ended }))).toBeNull();
    expect(licenseNotice(licenseView({ devOverride: true, plan: "yearly", trial: ended }))).toBeNull();
  });

  it("dòng dùng thử chỉ ở gói Free", () => {
    expect(trialKey(licenseView())).toBe("trial.active");
    expect(trialKey(licenseView({ trial: { status: "ended", endsAt: 1, daysLeft: 0 } }))).toBe("trial.ended");
    expect(trialKey(licenseView({ trial: { status: "none", endsAt: null, daysLeft: 0 } }))).toBe("trial.none");
    expect(trialKey(licenseView({ standing: "active", plan: "monthly" }))).toBeNull();
    expect(trialKey(licenseView({ devOverride: true, plan: "yearly" }))).toBeNull();
  });

  it("gia hạn khi đã có key chưa bị thu hồi", () => {
    expect(isRenewal(null)).toBe(false);
    expect(isRenewal(licenseView())).toBe(false);
    expect(isRenewal(licenseView({ key: "••••-RST5", standing: "expired" }))).toBe(true);
    expect(isRenewal(licenseView({ key: "••••-RST5", standing: "revoked" }))).toBe(false);
  });

  it("gói chọn sẵn ở màn hình Nâng cấp: gia hạn được thì đúng gói đang dùng, còn lại là Monthly", () => {
    const key = "••••-RST5";
    expect(defaultPlan(null)).toBe("monthly");
    expect(defaultPlan(licenseView())).toBe("monthly");
    expect(defaultPlan(licenseView({ key, standing: "active", plan: "monthly" }))).toBe("monthly");
    expect(defaultPlan(licenseView({ key, standing: "active", plan: "six_months" }))).toBe("six_months");
    expect(defaultPlan(licenseView({ key, standing: "active", plan: "yearly" }))).toBe("yearly");
    // License đã thu hồi thì mua mới, không gia hạn: về Monthly.
    expect(defaultPlan(licenseView({ key, standing: "revoked", plan: "yearly" }))).toBe("monthly");
    // Có key nhưng gói Free thì không có gói trả phí nào để gia hạn.
    expect(defaultPlan(licenseView({ key, standing: "free", plan: "free" }))).toBe("monthly");
  });
});

describe("đơn và máy", () => {
  it("máy không tên dùng tên thay thế", () => {
    expect(deviceName({ activation_id: "a", device_label: null, last_validated_at: null }, "Máy không tên")).toBe(
      "Máy không tên",
    );
    expect(deviceName({ activation_id: "a", device_label: " Mac ", last_validated_at: null }, "x")).toBe("Mac");
  });

  it("máy này trong danh sách xung đột", () => {
    const a = { activation_id: "a", device_label: null, last_validated_at: null };
    expect(isThisMachine({ devices: [a], thisActivationId: "a" }, a)).toBe(true);
    expect(isThisMachine({ devices: [a], thisActivationId: "b" }, a)).toBe(false);
  });

  it("đơn đã xong thì cho tạo đơn mới; thiếu tiền vẫn chờ chuyển bù", () => {
    const o = (state: OrderOutcome["state"]) => ({ state, order_code: 1, expires_at: 0, plan: "monthly", code: "x" }) as OrderOutcome;
    expect(orderFinished(null)).toBe(false);
    expect(orderFinished(o("waiting"))).toBe(false);
    expect(orderFinished(o("underpaid"))).toBe(false);
    for (const s of ["paid", "needsReview", "refunded", "failed", "paidButNotApplied"] as const) {
      expect(orderFinished(o(s)), s).toBe(true);
    }
    expect(orderMessageKey(o("refunded"))).toBe("upgrade.order.refunded");
  });
});

// Thanh toán quốc tế bằng thẻ (spec 2026-10-14): giá USD tính bằng cent, server gợi ý loại tiền theo nước của máy.
const offer = (code: PlanOffer["code"], prices: Record<string, number>): PlanOffer => ({
  code,
  name: code,
  quota_minutes_per_cycle: 3000,
  days_per_order: 30,
  prices,
});
const BOTH: PlanOffer[] = [
  offer("monthly", { VND: 50_000, USD: 399 }),
  offer("six_months", { VND: 269_000, USD: 2199 }),
  offer("yearly", { VND: 500_000, USD: 3999 }),
];
const VND_ONLY: PlanOffer[] = BOTH.map((p) => offer(p.code, { VND: p.prices.VND ?? 0 }));

describe("loại tiền khi mua", () => {
  it("VND luôn có; USD chỉ khi MỌI gói đều có giá USD (server chưa bật Creem thì không trả giá USD)", () => {
    expect(offeredCurrencies(null)).toEqual(["VND"]);
    expect(offeredCurrencies([])).toEqual(["VND"]);
    expect(offeredCurrencies(VND_ONLY)).toEqual(["VND"]);
    expect(offeredCurrencies(BOTH)).toEqual(["VND", "USD"]);
    expect(offeredCurrencies([BOTH[0] as PlanOffer, VND_ONLY[1] as PlanOffer, BOTH[2] as PlanOffer])).toEqual(["VND"]);
  });

  it("loại tiền chọn sẵn theo ngôn ngữ giao diện: tiếng Việt là VND, ngôn ngữ khác là USD nếu bán được USD", () => {
    expect(defaultCurrency(BOTH, "vi")).toBe("VND");
    for (const lang of ["en", "ja", "zh", "ko"] as const) {
      expect(defaultCurrency(BOTH, lang), lang).toBe("USD");
      // Server chưa bán USD, hay chưa có bảng gói: mọi ngôn ngữ đều VND.
      expect(defaultCurrency(VND_ONLY, lang), lang).toBe("VND");
      expect(defaultCurrency(null, lang), lang).toBe("VND");
    }
  });

  it("giá theo loại tiền; gói không có giá loại đó thì null", () => {
    expect(priceOf(BOTH[0] as PlanOffer, "VND")).toBe(50_000);
    expect(priceOf(BOTH[0] as PlanOffer, "USD")).toBe(399);
    expect(priceOf(VND_ONLY[0] as PlanOffer, "USD")).toBeNull();
  });

  it("giá hiển thị: VND như trước (dấu chấm ngăn nghìn), USD đổi từ cent và luôn hai chữ số lẻ", () => {
    expect(formatPrice(50_000, "VND")).toBe("50.000 đ");
    expect(formatPrice(0, "VND")).toBe("0 đ");
    expect(formatPrice(399, "USD")).toBe("$3.99");
    expect(formatPrice(2199, "USD")).toBe("$21.99");
    expect(formatPrice(3999, "USD")).toBe("$39.99");
    expect(formatPrice(0, "USD")).toBe("$0.00");
    expect(formatPrice(5, "USD")).toBe("$0.05");
    expect(formatPrice(100_000, "USD")).toBe("$1,000.00");
  });

  it("giá hiển thị: loại tiền lạ không bị coi là VND (số và mã tiền như nhận được)", () => {
    expect(formatPrice(399, "usd")).toBe("399 usd");
    expect(formatPrice(1_500, "EUR")).toBe("1500 EUR");
    expect(formatPrice(399, "")).toBe("399");
  });

  it("loại tiền đang chọn: theo lựa chọn của khách nếu còn bán, không thì theo ngôn ngữ giao diện", () => {
    expect(chosenCurrency(null, BOTH, "vi")).toBe("VND");
    expect(chosenCurrency(null, BOTH, "en")).toBe("USD");
    expect(chosenCurrency("USD", BOTH, "vi")).toBe("USD");
    expect(chosenCurrency("VND", BOTH, "en")).toBe("VND");
    // Đã chọn thẻ mà bảng gói mới không còn giá USD (tắt bán thẻ): về mặc định.
    expect(chosenCurrency("USD", VND_ONLY, "en")).toBe("VND");
    expect(chosenCurrency("USD", null, "en")).toBe("VND");
  });
});

describe("đơn không có mã QR (thẻ quốc tế)", () => {
  const view = (patch: Partial<CheckoutView> = {}): CheckoutView => ({
    orderCode: 7,
    plan: "monthly",
    amount: 399,
    currency: "USD",
    expiresAt: 1,
    provider: "creem",
    qrSvg: null,
    licenseExpiresAt: null,
    convertedDays: null,
    ...patch,
  });

  const qr = (patch: Partial<CheckoutView> = {}): CheckoutView =>
    view({ orderCode: 6, amount: 50_000, currency: "VND", provider: "payos", qrSvg: "<svg/>", ...patch });

  it("không có mã QR thì khách trả ở trang mở bằng trình duyệt", () => {
    expect(isBrowserOrder(view())).toBe(true);
    expect(isBrowserOrder(qr())).toBe(false);
    // Chỉ theo mã QR, không theo `provider` (phía Rust cũng quyết định theo mã QR).
    expect(isBrowserOrder(view({ provider: "payos" }))).toBe(true);
    expect(isBrowserOrder(qr({ provider: "creem" }))).toBe(false);
    // Khóa `qrSvg` vắng (phía Rust bỏ trường `null` khi tuần tự hóa) vẫn là đơn thẻ, không bị coi là đơn có mã QR.
    const absent: Partial<CheckoutView> = view();
    delete absent.qrSvg;
    expect("qrSvg" in absent).toBe(false);
    expect(isBrowserOrder(absent as CheckoutView)).toBe(true);
  });

  it("câu đang chờ của đơn thẻ nói chờ thanh toán (không phải chờ chuyển khoản); thất bại có câu riêng; các trạng thái khác như nhau", () => {
    const waiting: OrderOutcome = { state: "waiting", order_code: 7, expires_at: 2 };
    expect(orderMessageKey(waiting)).toBe("upgrade.order.waiting");
    expect(orderMessageKey(waiting, true)).toBe("upgrade.order.waitingCard");
    // Đơn thẻ không thành: khách có thể đã trả (trang Creem vẫn nhận tiền sau hạn): "đừng trả lại" (Q3).
    expect(orderMessageKey({ state: "failed", order_code: 7 })).toBe("upgrade.order.failed");
    expect(orderMessageKey({ state: "failed", order_code: 7 }, true)).toBe("upgrade.order.failedCard");
    // Chưa đủ tiền: đơn VietQR chuyển bù được; đơn thẻ không (Creem trả đủ hay không trả), nên rơi về "hỗ trợ đang xử lý".
    expect(orderMessageKey({ state: "underpaid", order_code: 7 })).toBe("upgrade.order.underpaid");
    expect(orderMessageKey({ state: "underpaid", order_code: 7 }, true)).toBe("upgrade.order.needsReview");
    expect(orderMessageKey({ state: "underpaid", order_code: 7 }, true, true)).toBe("upgrade.order.needsReview");
    const others: OrderOutcome[] = [
      { state: "paid", order_code: 7, plan: "monthly" },
      { state: "needsReview", order_code: 7 },
      { state: "refunded", order_code: 7 },
      { state: "paidButNotApplied", order_code: 7, code: "licenseLocked" },
    ];
    for (const outcome of others) {
      expect(orderMessageKey(outcome, true), outcome.state).toBe(orderMessageKey(outcome));
      // Quá hạn chỉ đổi câu của đơn thẻ còn chờ, không đổi câu của đơn đã có kết quả.
      expect(orderMessageKey(outcome, true, true), outcome.state).toBe(orderMessageKey(outcome));
    }
  });

  it("đơn thẻ quá giờ hẹn trả mà còn chờ: câu riêng, kể cả khi chưa có kết quả hỏi nào (vừa mở lại app)", () => {
    const waiting: OrderOutcome = { state: "waiting", order_code: 7, expires_at: 2 };
    expect(orderMessageKey(waiting, true, true)).toBe("upgrade.order.waitingCardLate");
    expect(orderMessageKey(null, true, true)).toBe("upgrade.order.waitingCardLate");
    expect(orderMessageKey(null, true, false)).toBe("upgrade.order.waitingCard");
    expect(orderMessageKey(null, false, false)).toBe("upgrade.order.waiting");
    // Đơn VietQR không có khái niệm "trễ" (hết hạn mã thì phía Rust báo thất bại).
    expect(orderMessageKey(waiting, false, true)).toBe("upgrade.order.waiting");
  });

  it("đơn thẻ trễ: quá `expiresAt` mà chưa có kết quả hay kết quả là còn chờ; đơn VietQR và đơn đã xong thì không", () => {
    const card = view({ expiresAt: 1_000 });
    const waiting: OrderOutcome = { state: "waiting", order_code: 7, expires_at: 1_000 };
    expect(cardOrderLate(card, null, 1_000)).toBe(false);
    expect(cardOrderLate(card, null, 1_001)).toBe(true);
    expect(cardOrderLate(card, waiting, 999)).toBe(false);
    expect(cardOrderLate(card, waiting, 1_001)).toBe(true);
    expect(cardOrderLate(card, { state: "paid", order_code: 7, plan: "monthly" }, 1_001)).toBe(false);
    expect(cardOrderLate(card, { state: "failed", order_code: 7 }, 1_001)).toBe(false);
    expect(cardOrderLate(qr({ expiresAt: 1_000 }), null, 1_001)).toBe(false);
  });

  it("loại tiền của đơn đang chờ: theo `currency` của đơn; đơn do bản app cũ lưu (0 và chuỗi rỗng) suy theo mã QR", () => {
    expect(lockedCurrency(view())).toBe("USD");
    expect(lockedCurrency(qr())).toBe("VND");
    expect(lockedCurrency(view({ amount: 0, currency: "" }))).toBe("USD");
    expect(lockedCurrency(qr({ amount: 0, currency: "" }))).toBe("VND");
    // `currency` của đơn đi trước phép suy.
    expect(lockedCurrency(view({ currency: "VND" }))).toBe("VND");
    expect(lockedCurrency(qr({ currency: "USD" }))).toBe("USD");
    // Loại tiền lạ: suy như đơn cũ.
    expect(lockedCurrency(view({ currency: "usd" }))).toBe("USD");
    expect(lockedCurrency(qr({ currency: "EUR" }))).toBe("VND");
  });
});
