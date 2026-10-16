import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type MessageKey, type Params, translate } from "../../../i18n";
import type { CheckoutView, OrderOutcome, PlanOffer } from "../../../lib/ipc";
import { fallbackLanguage } from "../appStore";
import { UpgradeView, type UpgradeViewProps } from "./UpgradeView";

// Màn hình Nâng cấp vẽ bằng `react-dom/server` trong Node (như LiveLineView.test.ts): loại tiền và gói khóa theo đơn đang
// chờ, nhãn "Cách thanh toán" nhìn thấy, chữ của đơn thẻ (merchant of record, trễ, không thành) (kế hoạch hardening 06 C2).

const T = 1_800_000_000;

const offer = (code: PlanOffer["code"], vnd: number, usd?: number): PlanOffer => ({
  code,
  name: code,
  quota_minutes_per_cycle: 3000,
  days_per_order: 30,
  prices: usd === undefined ? { VND: vnd } : { VND: vnd, USD: usd },
});
const BOTH = [offer("monthly", 50_000, 399), offer("six_months", 269_000, 2199), offer("yearly", 500_000, 3999)];
const VND_ONLY = [offer("monthly", 50_000), offer("six_months", 269_000), offer("yearly", 500_000)];

const card: CheckoutView = {
  orderCode: 1000429,
  plan: "monthly",
  amount: 399,
  currency: "USD",
  expiresAt: T,
  provider: "creem",
  qrSvg: null,
  licenseExpiresAt: null,
  convertedDays: null,
};
// Đơn do bản app cũ lưu, đọc lại khi mở app: không có số tiền và loại tiền.
const oldCard: CheckoutView = { ...card, amount: 0, currency: "" };
const qr: CheckoutView = { ...card, orderCode: 1000428, amount: 50_000, currency: "VND", provider: "payos", qrSvg: "<svg></svg>" };

const props = (patch: Partial<UpgradeViewProps> = {}): UpgradeViewProps => ({
  lang: "vi",
  view: null,
  plans: BOTH,
  suggestedCurrency: "VND",
  checkout: null,
  order: null,
  error: null,
  busy: false,
  now: T - 60,
  onStart: () => {},
  onOpenPage: () => {},
  onCancel: () => {},
  ...patch,
});

const html = (patch: Partial<UpgradeViewProps> = {}) => renderToStaticMarkup(createElement(UpgradeView, props(patch)));

// Chữ của từ điển như trong HTML (React thoát các ký tự đặc biệt).
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const text = (key: MessageKey, params?: Params) => esc(translate("vi", key, params));

const inputs = (markup: string, name: string) => markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`, "g")) ?? [];
const input = (markup: string, name: string, value: string) => {
  const tag = inputs(markup, name).find((t) => t.includes(`value="${value}"`));
  if (tag === undefined) throw new Error(`không có input ${name}=${value}`);
  return tag;
};
const checked = (tag: string) => tag.includes('checked=""');
const disabled = (tag: string) => tag.includes('disabled=""');
const count = (markup: string, needle: string) => markup.split(needle).length - 1;
// Tiêu đề các mục gập (văn bản pháp lý), theo thứ tự trên màn hình. `LegalDetails` đọc ngôn ngữ từ app store (trong Node là
// `fallbackLanguage`, theo locale của máy chạy test), nên so với từ điển của đúng ngôn ngữ đó.
const summaries = (markup: string) => [...markup.matchAll(/<summary>(.*?)<\/summary>/g)].map((m) => m[1]);
const legalTitle = (key: "legal.privacy" | "legal.eula") => esc(translate(fallbackLanguage, key));

describe("UpgradeView: cách trả và bảng giá", () => {
  it("server chưa bán USD: không có nhóm cách trả, giá VND, câu VietQR, không nhắc Creem", () => {
    const markup = html({ plans: VND_ONLY, suggestedCurrency: "USD" });
    expect(inputs(markup, "method")).toHaveLength(0);
    expect(markup).not.toContain("upgrade-method-label");
    expect(markup).toContain("50.000 đ");
    expect(markup).toContain(text("upgrade.bankOnly"));
    expect(markup).not.toContain("Creem");
    expect(inputs(markup, "plan")).toHaveLength(3);
  });

  it("bán cả hai: nhãn \"Cách thanh toán\" là chữ nhìn thấy và nhóm radio trỏ tới nhãn; chọn sẵn theo gợi ý của server", () => {
    const markup = html({ suggestedCurrency: "USD" });
    expect(markup).toContain(`id="upgrade-method-label">${text("upgrade.method")}</p>`);
    expect(markup).toContain('role="radiogroup" aria-labelledby="upgrade-method-label"');
    expect(markup).not.toContain(`aria-label="${text("upgrade.method")}"`);
    expect(checked(input(markup, "method", "USD"))).toBe(true);
    expect(checked(input(markup, "method", "VND"))).toBe(false);
    expect(checked(input(html(), "method", "VND"))).toBe(true);
    // Không có đơn chờ, không bận: chọn được.
    for (const tag of [...inputs(markup, "method"), ...inputs(markup, "plan")]) expect(disabled(tag), tag).toBe(false);
  });

  it("thẻ được chọn: câu Creem, câu merchant of record, câu đồng ý nêu Creem, thêm mục EULA; nút trả trong trình duyệt", () => {
    const markup = html({ suggestedCurrency: "USD" });
    expect(markup).toContain("$3.99");
    expect(markup).toContain(text("upgrade.cardNote"));
    expect(markup).toContain(text("upgrade.cardMor"));
    expect(markup).toContain("merchant of record");
    expect(markup).not.toContain(text("upgrade.bankOnly"));
    expect(markup).toContain(text("upgrade.consentCard"));
    expect(markup).not.toContain(text("upgrade.consent"));
    expect(count(markup, 'class="legal-details"')).toBe(2);
    // Mục thứ hai là điều khoản bán hàng (EULA), không phải lần nữa chính sách quyền riêng tư.
    expect(summaries(markup)).toEqual([legalTitle("legal.privacy"), legalTitle("legal.eula")]);
    // Câu merchant of record nằm dưới câu cardNote (đặc tả), không đảo thứ tự.
    const note = markup.indexOf(text("upgrade.cardNote"));
    const mor = markup.indexOf(text("upgrade.cardMor"));
    expect(note).toBeGreaterThan(-1);
    expect(mor).toBeGreaterThan(note);
    expect(markup).toContain(text("upgrade.payCard"));
  });

  it("VietQR được chọn: câu VietQR, câu đồng ý thường, chỉ mục chính sách; không nhắc Creem", () => {
    const markup = html({ suggestedCurrency: "VND" });
    expect(markup).toContain("50.000 đ");
    expect(markup).toContain(text("upgrade.bankOnly"));
    expect(markup).not.toContain(text("upgrade.cardMor"));
    expect(markup).not.toContain("Creem");
    expect(markup).toContain(text("upgrade.consent"));
    expect(count(markup, 'class="legal-details"')).toBe(1);
    expect(summaries(markup)).toEqual([legalTitle("legal.privacy")]);
    expect(markup).toContain(text("upgrade.pay"));
  });

  it("đang tạo đơn (busy): cả hai nhóm radio khóa, không đổi được giữa chừng", () => {
    const markup = html({ busy: true, suggestedCurrency: "USD" });
    const all = [...inputs(markup, "method"), ...inputs(markup, "plan")];
    expect(all).toHaveLength(5);
    for (const tag of all) expect(disabled(tag), tag).toBe(true);
  });
});

describe("UpgradeView: có đơn đang chờ", () => {
  it("đơn thẻ, gợi ý VND (khách VN mở lại app, đơn do bản cũ lưu): ô thẻ được chọn và khóa, giá USD, câu thẻ; gói theo đơn", () => {
    const markup = html({ checkout: { ...oldCard, plan: "six_months" }, suggestedCurrency: "VND" });
    const usd = input(markup, "method", "USD");
    const vnd = input(markup, "method", "VND");
    expect(checked(usd) && disabled(usd)).toBe(true);
    expect(checked(vnd)).toBe(false);
    expect(disabled(vnd)).toBe(true);
    expect(markup).toContain("$3.99");
    expect(markup).not.toContain("50.000 đ");
    expect(markup).toContain(text("upgrade.cardNote"));
    expect(markup).toContain("merchant of record");
    expect(markup).not.toContain(text("upgrade.bankOnly"));
    // Gói của đơn, không phải gói chọn sẵn (Monthly).
    expect(checked(input(markup, "plan", "six_months"))).toBe(true);
    expect(checked(input(markup, "plan", "monthly"))).toBe(false);
    for (const tag of inputs(markup, "plan")) expect(disabled(tag), tag).toBe(true);
    // Không có form tạo đơn; đơn cũ không có số tiền thì không ghi giá cạnh mã đơn.
    expect(markup).not.toContain("upgrade-email");
    expect(markup).toContain(`${text("upgrade.order", { code: card.orderCode })}</p>`);
  });

  it("đơn thẻ mới: mã đơn kèm số tiền thật", () => {
    expect(html({ checkout: card })).toContain(`${text("upgrade.order", { code: card.orderCode })} · $3.99</p>`);
  });

  it("đơn VietQR, gợi ý USD: ô VietQR được chọn và khóa, giá VND, câu VietQR", () => {
    const markup = html({ checkout: qr, suggestedCurrency: "USD" });
    const vnd = input(markup, "method", "VND");
    expect(checked(vnd) && disabled(vnd)).toBe(true);
    expect(checked(input(markup, "method", "USD"))).toBe(false);
    expect(markup).toContain("50.000 đ");
    expect(markup).not.toContain("$3.99");
    expect(markup).toContain(text("upgrade.bankOnly"));
    expect(markup).not.toContain(text("upgrade.cardMor"));
  });

  it("đơn VietQR: không có lời dặn của đơn thẻ", () => {
    const markup = html({ checkout: qr, now: T + 60 });
    expect(markup).toContain(text("upgrade.order.waiting"));
    expect(markup).not.toContain(text("upgrade.browser.cancelNote"));
    expect(markup).not.toContain(text("upgrade.order.waitingCardLate"));
  });

  it("đơn thẻ trong hạn: dòng \"Trả trước\", câu chờ xác nhận, lời dặn dưới hai nút", () => {
    const waiting: OrderOutcome = { state: "waiting", order_code: card.orderCode, expires_at: T };
    for (const order of [null, waiting]) {
      const markup = html({ checkout: card, order });
      expect(markup).toContain(text("upgrade.linkExpiresPage", { time: "" }).replace(/\.$/, ""));
      expect(markup).toContain(text("upgrade.order.waitingCard"));
      expect(markup).not.toContain(text("upgrade.order.waitingCardLate"));
      expect(markup).toContain(text("upgrade.browser.note"));
      expect(markup).toContain(text("upgrade.browser.cancelNote"));
    }
  });

  it("đơn thẻ quá giờ hẹn trả mà còn chờ (kể cả chưa có kết quả hỏi nào): câu trễ, không hiện giờ hẹn đã qua", () => {
    const waiting: OrderOutcome = { state: "waiting", order_code: card.orderCode, expires_at: T };
    for (const order of [null, waiting]) {
      const markup = html({ checkout: card, order, now: T + 1 });
      expect(markup).toContain(text("upgrade.order.waitingCardLate"));
      expect(markup).not.toContain(text("upgrade.order.waitingCard"));
      expect(markup).not.toContain(text("upgrade.linkExpiresPage", { time: "" }).replace(/\.$/, ""));
      expect(markup).toContain(text("upgrade.browser.cancelNote"));
    }
  });

  it("đơn thẻ đã xong (trả xong, không thành, cần xem xét, hoàn tiền, trả rồi mà chưa kích hoạt) trong hạn: không còn \"Trả trước\" và lời dặn mở trình duyệt, vì câu trạng thái đã dặn đừng trả lại", () => {
    const finished: OrderOutcome[] = [
      { state: "paid", order_code: card.orderCode, plan: "monthly" },
      { state: "failed", order_code: card.orderCode },
      { state: "needsReview", order_code: card.orderCode },
      { state: "refunded", order_code: card.orderCode },
      { state: "paidButNotApplied", order_code: card.orderCode, code: "licenseLocked" },
    ];
    for (const order of finished) {
      const markup = html({ checkout: card, order, now: T - 60 });
      expect(markup, order.state).not.toContain(text("upgrade.linkExpiresPage", { time: "" }).replace(/\.$/, ""));
      expect(markup, order.state).not.toContain(text("upgrade.browser.note"));
      // Nút tạo đơn mới có, lời dặn của đơn còn chờ không (đã đúng từ trước).
      expect(markup, order.state).toContain(text("upgrade.newOrder"));
      expect(markup, order.state).not.toContain(text("upgrade.browser.cancelNote"));
    }
  });

  it("đơn thẻ chưa đủ tiền (underpaid): không hứa chuyển bù, dùng câu \"hỗ trợ đang xử lý\"; đơn VietQR vẫn nói chuyển bù", () => {
    const underpaid = (order_code: number): OrderOutcome => ({ state: "underpaid", order_code });
    const cardMarkup = html({ checkout: card, order: underpaid(card.orderCode) });
    expect(cardMarkup).toContain(text("upgrade.order.needsReview", { code: card.orderCode }));
    expect(cardMarkup).not.toContain(text("upgrade.order.underpaid", { code: card.orderCode }));
    const qrMarkup = html({ checkout: qr, order: underpaid(qr.orderCode) });
    expect(qrMarkup).toContain(text("upgrade.order.underpaid", { code: qr.orderCode }));
    expect(qrMarkup).not.toContain(text("upgrade.order.needsReview", { code: qr.orderCode }));
  });

  it("đơn thẻ không thành: \"đừng trả lại\" kèm mã đơn; nút tạo đơn mới", () => {
    const markup = html({ checkout: card, order: { state: "failed", order_code: card.orderCode }, now: T + 3600 });
    expect(markup).toContain(text("upgrade.order.failedCard", { code: card.orderCode }));
    expect(markup).toContain("đừng trả lại");
    expect(markup).toContain(text("upgrade.newOrder"));
    expect(markup).not.toContain(text("upgrade.browser.cancelNote"));
  });
});
