import { describe, expect, it } from "vitest";
import type { AuditRow, OrderRow } from "../api/types";
import { failedLead, heldStep, reviewOf } from "./review-kit";

const CODE = 1000012;
const row = (action: string, detail: unknown, over: Partial<AuditRow> = {}): AuditRow => ({
  id: 1,
  at: 1_790_813_000,
  actor: "webhook",
  action,
  license_id: null,
  order_code: CODE,
  detail: typeof detail === "string" || detail === null ? detail : JSON.stringify(detail),
  ...over,
});
const order = {
  order_code: CODE,
  provider: "creem",
  plan: "yearly",
  amount: 3999,
  amount_paid: 3000,
  currency: "USD",
  status: "underpaid",
} as OrderRow;

describe("reviewOf: đọc dữ kiện của cổng từ nhật ký của đơn", () => {
  it("không có dòng order_underpaid hay order_amount_mismatch của đơn: null", () => {
    expect(reviewOf(CODE, [])).toBeNull();
    expect(reviewOf(CODE, [row("order_created", { amount: 3999 })])).toBeNull();
    expect(reviewOf(CODE, [row("order_underpaid", { has_discount: true }, { order_code: CODE + 1 })])).toBeNull();
    expect(reviewOf(CODE, [row("order_underpaid", null)])).toBeNull();
  });

  it("đọc mọi khóa của đơn Creem bị giữ; số lạ kiểu thì bỏ qua, không văng", () => {
    const r = reviewOf(CODE, [
      row("order_underpaid", {
        amount: 3999,
        provider_amount: 3999,
        has_discount: true,
        provider_discount_amount: 999,
        provider_amount_paid: 3300,
        provider_tax_amount: "300",
        provider_malformed_fields: ["order.discount", 7, null, "checkout.status"],
      }),
    ]);
    expect(r).toEqual({ hasDiscount: true, discount: 999, paid: 3300, tax: undefined, providerAmount: 3999, malformed: ["order.discount", "checkout.status"] });
  });

  it("has_discount chỉ đúng khi là boolean true; thiếu khóa (đơn PayOS) là false và không có trường hỏng", () => {
    expect(reviewOf(CODE, [row("order_underpaid", { has_discount: "true" })])?.hasDiscount).toBe(false);
    expect(reviewOf(CODE, [row("order_underpaid", { amount: 50000, amount_paid: 20000 })])).toEqual({
      hasDiscount: false,
      discount: undefined,
      paid: undefined,
      tax: undefined,
      providerAmount: undefined,
      malformed: [],
    });
  });

  it("bỏ qua dòng detail không phải JSON object (chuỗi, mảng, số) và lấy dòng đọc được kế tiếp; dòng mới nhất (đầu danh sách) thắng", () => {
    const rows = [
      row("order_underpaid", "khong-phai-json"),
      row("order_underpaid", [1, 2]),
      row("order_amount_mismatch", 5),
      row("order_amount_mismatch", { has_discount: true, provider_amount: 2199 }),
      row("order_underpaid", { has_discount: false, provider_amount: 3999 }),
    ];
    expect(reviewOf(CODE, rows)).toMatchObject({ hasDiscount: true, providerAmount: 2199 });
  });
});

describe("heldStep: đơn không phải PayOS bị giữ để xem số tiền", () => {
  it("không có dữ kiện: tiêu đề chung nêu mã giảm giá như câu hỏi, lời dẫn không khẳng định gì thêm", () => {
    const s = heldStep(order, "Creem", null);
    expect(s.title).toBe("Creem báo đã trả nhưng thấp hơn giá đơn (có mã giảm giá?)");
    expect(s.text).toBe("Đã nhận $30,00 (không gồm thuế) trên giá $39,99. Xem trạng thái trên Creem rồi Cấp tay hay hoàn tiền ở Creem.");
  });

  it("có mã giảm giá: tiêu đề nói thẳng có mã giảm giá (kể cả khi số đã thu bằng giá) (p2 của rà B6)", () => {
    const r = reviewOf(CODE, [row("order_underpaid", { has_discount: true, provider_discount_amount: 999 })]);
    expect(heldStep(order, "Creem", r).title).toBe("Creem báo đã trả, có dùng mã giảm giá");
    expect(heldStep({ ...order, amount_paid: order.amount }, "Creem", r).title).toBe("Creem báo đã trả, có dùng mã giảm giá");
  });

  it("số giảm bằng 0 không được ghi là giảm; thiếu số nào thì bỏ số đó", () => {
    const r = reviewOf(CODE, [row("order_underpaid", { has_discount: true, provider_discount_amount: 0, provider_amount_paid: 3000 })]);
    const text = heldStep(order, "Creem", r).text;
    expect(text).toContain("Số liệu Creem ghi: khách trả $30,00 (gồm thuế).");
    expect(text).not.toContain("giảm $");
    expect(text).not.toContain("thuế $");
  });

  it("trường hỏng thắng mã giảm giá: tiêu đề và lời dẫn nói không đọc được dữ liệu tiền", () => {
    const r = reviewOf(CODE, [row("order_underpaid", { has_discount: true, provider_malformed_fields: ["order.currency"] })]);
    const s = heldStep(order, "Creem", r);
    expect(s.title).toBe("Creem báo đã thu tiền nhưng không đọc được số tiền");
    expect(s.text).toContain("(trường: order.currency)");
    expect(s.text).not.toContain("Khách dùng mã giảm giá");
  });

  it("nói đúng tên cổng được truyền vào (cổng lạ hiện nguyên mã), không có chữ chuyển thiếu hay chuyển bù", () => {
    const text = heldStep(order, "zalopay", null);
    expect(`${text.title} ${text.text}`).toContain("zalopay");
    expect(`${text.title} ${text.text}`).not.toMatch(/Creem|chuyển thiếu|chuyển bù/i);
  });
});

describe("failedLead: câu đầu lời dẫn của đơn failed", () => {
  it("không có dữ kiện hay giá cổng báo bằng giá đơn: không có câu nào", () => {
    expect(failedLead(order, "Creem", null)).toBe("");
    expect(failedLead(order, "Creem", reviewOf(CODE, [row("order_amount_mismatch", { provider_amount: 3999 })]))).toBe("");
    expect(failedLead(order, "Creem", reviewOf(CODE, [row("order_amount_mismatch", { amount: 3999 })]))).toBe("");
  });

  it("giá cổng báo khác giá đơn, hay trường hỏng", () => {
    expect(failedLead(order, "Creem", reviewOf(CODE, [row("order_amount_mismatch", { provider_amount: 2199 })]))).toBe(
      "Giá Creem báo (không gồm thuế) là $21,99, khác giá của đơn $39,99. ",
    );
    expect(failedLead(order, "Creem", reviewOf(CODE, [row("order_amount_mismatch", { provider_amount: 0, provider_malformed_fields: ["order.amount"] })]))).toBe(
      "Không đọc được giá từ Creem (trường: order.amount). ",
    );
  });
});
