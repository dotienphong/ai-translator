import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type MessageKey, type Params, translate, type UiLanguage } from "../../../i18n";
import type { CheckoutView, OrderOutcome, PlanOffer } from "../../../lib/ipc";
import { fallbackLanguage } from "../appStore";
import { UpgradeView, type UpgradeViewProps } from "./UpgradeView";

// Màn hình Nâng cấp vẽ bằng `react-dom/server` trong Node (như LiveLineView.test.ts): ba bước đánh số và cách trả chọn sẵn
// theo ngôn ngữ giao diện (spec 2026-10-22), loại tiền và gói khóa theo đơn đang chờ, chữ của đơn thẻ (merchant of record,
// trễ, không thành) (kế hoạch hardening 06 C2).

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

// Chữ của từ điển như trong HTML (React thoát các ký tự đặc biệt), theo ngôn ngữ của lần vẽ.
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const textIn = (lang: UiLanguage) => (key: MessageKey, params?: Params) => esc(translate(lang, key, params));
const text = textIn("vi");
const en = textIn("en");

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
// Tiêu đề bước `no`: số chỉ để nhìn, chữ mang `id`.
const stepTitle = (no: number, id: string, title: string) =>
  `<h2 class="step-title"><span class="step-no" aria-hidden="true">${no}</span><span id="${id}">${title}</span></h2>`;

describe("UpgradeView: ba bước", () => {
  it("có bảng gói: ba tiêu đề bước theo thứ tự (Cách thanh toán, Chọn gói, Thanh toán); bảng gói ở bước 2, form ở bước 3", () => {
    const markup = html();
    expect(count(markup, 'class="step-title"')).toBe(3);
    expect(markup).toContain(stepTitle(1, "upgrade-method-label", text("upgrade.method")));
    expect(markup).toContain(stepTitle(2, "upgrade-plan-label", text("upgrade.step.plan")));
    expect(markup).toContain(stepTitle(3, "upgrade-pay-label", text("upgrade.step.pay")));
    const method = markup.indexOf('id="upgrade-method-label"');
    const plan = markup.indexOf('id="upgrade-plan-label"');
    const pay = markup.indexOf('id="upgrade-pay-label"');
    expect(method).toBeGreaterThan(-1);
    expect(plan).toBeGreaterThan(method);
    expect(pay).toBeGreaterThan(plan);
    expect(markup.indexOf('class="plans"')).toBeGreaterThan(plan);
    expect(markup.indexOf('class="plans"')).toBeLessThan(pay);
    expect(markup.indexOf('id="upgrade-email"')).toBeGreaterThan(pay);
  });

  it("chưa có bảng gói (đang tải): chưa có bước nào, chỉ ô Free và câu đang tải; không ghi chú cách trả, không form", () => {
    const markup = html({ plans: null });
    expect(markup).not.toContain("step-title");
    expect(inputs(markup, "method")).toHaveLength(0);
    expect(markup).toContain(text("upgrade.loading"));
    expect(markup).toContain(text("upgrade.free.quota"));
    expect(markup).not.toContain(text("upgrade.bankOnly"));
    expect(markup).not.toContain("upgrade-email");
  });

  it("chưa có bảng gói, không có mạng: ô báo lỗi thay câu đang tải", () => {
    const markup = html({ plans: null, error: { code: "network", field: null } });
    expect(markup).not.toContain("step-title");
    expect(markup).toContain('class="notice error"');
    expect(markup).not.toContain(text("upgrade.loading"));
  });

  it("chưa có bảng gói mà có đơn thẻ chờ (mở lại app khi mất mạng): khung đơn, ghi chú của thẻ và câu bên bán lại", () => {
    const markup = html({ plans: null, checkout: card });
    expect(markup).not.toContain("step-title");
    expect(markup).toContain(text("upgrade.cardNote"));
    expect(markup).toContain(text("upgrade.cardMor"));
    expect(markup).toContain(`<h3 class="card-title">${text("upgrade.browser.title")}</h3>`);
  });

  it("lỗi tạo đơn nằm ở bước 3, trên form", () => {
    const markup = html({ error: { code: "network", field: null } });
    const alert = markup.indexOf('class="notice error"');
    expect(alert).toBeGreaterThan(markup.indexOf('id="upgrade-pay-label"'));
    expect(alert).toBeLessThan(markup.indexOf('id="upgrade-email"'));
  });

  it("khung đơn: tiêu đề là h3 (dưới tiêu đề bước h2) và nằm ở bước 3", () => {
    for (const [checkout, title] of [
      [qr, "upgrade.scan"],
      [card, "upgrade.browser.title"],
    ] as const) {
      const markup = html({ checkout });
      expect(markup, title).toContain(`<h3 class="card-title">${text(title)}</h3>`);
      expect(markup, title).not.toContain('<h2 class="card-title">');
      expect(markup.indexOf('class="card checkout'), title).toBeGreaterThan(markup.indexOf('id="upgrade-pay-label"'));
    }
  });
});

describe("UpgradeView: cách trả", () => {
  it("giao diện tiếng Việt chọn sẵn VietQR; en, ja, zh, ko chọn sẵn thẻ quốc tế", () => {
    const vi = html({ lang: "vi" });
    expect(checked(input(vi, "method", "VND"))).toBe(true);
    expect(checked(input(vi, "method", "USD"))).toBe(false);
    for (const lang of ["en", "ja", "zh", "ko"] as const) {
      const markup = html({ lang });
      expect(checked(input(markup, "method", "USD")), lang).toBe(true);
      expect(checked(input(markup, "method", "VND")), lang).toBe(false);
    }
  });

  it("nhóm cách trả: hai nút viên thuốc, nhãn là chữ của tiêu đề bước 1 (không aria-label); chưa có đơn chờ thì bấm được", () => {
    const markup = html();
    expect(markup).toContain('class="pay-methods" role="radiogroup" aria-labelledby="upgrade-method-label"');
    expect(markup).not.toContain(`aria-label="${text("upgrade.method")}"`);
    expect(count(markup, '<label class="pay-method">')).toBe(2);
    for (const tag of [...inputs(markup, "method"), ...inputs(markup, "plan")]) expect(disabled(tag), tag).toBe(false);
  });

  it("ghi chú cách trả nằm ở bước 1, ngay dưới hai nút, trước bảng gói", () => {
    const markup = html();
    const note = markup.indexOf(text("upgrade.bankOnly"));
    expect(note).toBeGreaterThan(markup.indexOf('class="pay-methods"'));
    expect(note).toBeLessThan(markup.indexOf('id="upgrade-plan-label"'));
  });

  it("server chưa bán USD: bước 1 vẫn có, đúng một ô VietQR đang chọn, giá VND, câu VietQR, không nhắc Creem (cả giao diện tiếng Anh)", () => {
    for (const lang of ["vi", "en"] as const) {
      const markup = html({ plans: VND_ONLY, lang });
      expect(markup, lang).toContain('id="upgrade-method-label"');
      expect(inputs(markup, "method"), lang).toHaveLength(1);
      expect(checked(input(markup, "method", "VND")), lang).toBe(true);
      expect(markup, lang).toContain("50.000 đ");
      expect(markup, lang).toContain(textIn(lang)("upgrade.bankOnly"));
      expect(markup, lang).not.toContain("Creem");
      expect(inputs(markup, "plan"), lang).toHaveLength(3);
    }
  });

  it("thẻ được chọn (giao diện tiếng Anh): câu Creem, câu merchant of record, câu đồng ý nêu Creem, thêm mục EULA; nút trả trong trình duyệt", () => {
    const markup = html({ lang: "en" });
    expect(markup).toContain("$3.99");
    expect(markup).toContain(en("upgrade.cardNote"));
    expect(markup).toContain(en("upgrade.cardMor"));
    expect(markup).toContain("merchant of record");
    expect(markup).not.toContain(en("upgrade.bankOnly"));
    expect(markup).toContain(en("upgrade.consentCard"));
    expect(markup).not.toContain(en("upgrade.consent"));
    expect(count(markup, 'class="legal-details"')).toBe(2);
    // Mục thứ hai là điều khoản bán hàng (EULA), không phải lần nữa chính sách quyền riêng tư.
    expect(summaries(markup)).toEqual([legalTitle("legal.privacy"), legalTitle("legal.eula")]);
    // Câu merchant of record nằm dưới câu cardNote (đặc tả), không đảo thứ tự.
    const note = markup.indexOf(en("upgrade.cardNote"));
    const mor = markup.indexOf(en("upgrade.cardMor"));
    expect(note).toBeGreaterThan(-1);
    expect(mor).toBeGreaterThan(note);
    expect(markup).toContain(en("upgrade.payCard"));
  });

  it("VietQR được chọn: câu VietQR, câu đồng ý thường, chỉ mục chính sách; không nhắc Creem", () => {
    const markup = html();
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
    const markup = html({ busy: true });
    const all = [...inputs(markup, "method"), ...inputs(markup, "plan")];
    expect(all).toHaveLength(5);
    for (const tag of all) expect(disabled(tag), tag).toBe(true);
  });
});

describe("UpgradeView: có đơn đang chờ", () => {
  it("đơn thẻ, giao diện tiếng Việt (đơn do bản cũ lưu): ô thẻ được chọn và khóa, giá USD, câu thẻ; gói theo đơn", () => {
    const markup = html({ checkout: { ...oldCard, plan: "six_months" } });
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

  it("đơn VietQR, giao diện tiếng Anh: ô VietQR được chọn và khóa, giá VND, câu VietQR", () => {
    const markup = html({ checkout: qr, lang: "en" });
    const vnd = input(markup, "method", "VND");
    expect(checked(vnd) && disabled(vnd)).toBe(true);
    expect(checked(input(markup, "method", "USD"))).toBe(false);
    expect(markup).toContain("50.000 đ");
    expect(markup).not.toContain("$3.99");
    expect(markup).toContain(en("upgrade.bankOnly"));
    expect(markup).not.toContain(en("upgrade.cardMor"));
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
