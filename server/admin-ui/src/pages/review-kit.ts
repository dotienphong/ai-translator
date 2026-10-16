// Đơn bị giữ để xem số tiền ở cổng không phải PayOS (Creem): chữ của thẻ việc cần làm trang đơn (OrderPage). Server ghi dữ kiện của
// cổng vào `detail` của nhật ký `order_underpaid` (đã thu tiền mà thấp hơn giá, có mã giảm giá, hay dữ liệu tiền hỏng) và
// `order_amount_mismatch` (giá cổng báo khác giá đơn; đơn thành failed): `has_discount`, `provider_discount_amount`,
// `provider_amount_paid` (khách trả, GỒM thuế), `provider_tax_amount`, `provider_malformed_fields` (tên các trường tiền sai kiểu),
// cạnh `amount`, `provider_amount` (giá cổng báo, không gồm thuế), `amount_paid` (server/src/payment/provider.ts: ReviewDetail,
// orders.ts: fulfilOrder). PayOS không có các khóa mới: đơn PayOS giữ chữ chuyển khoản (OrderPage), không qua file này. Giao diện
// đọc lỏng: khóa lạ hay sai kiểu thì bỏ qua, không văng.
import type { AuditRow, OrderRow } from "../api/types";
import { fmtMoney } from "../format";

/** Dữ kiện của cổng cho một đơn bị giữ. Các số theo đơn vị nhỏ nhất của loại tiền của đơn (cent với USD). */
export interface Review {
  hasDiscount: boolean;
  /** Số giảm giá; số khách trả (gồm thuế); thuế; giá cổng báo (không gồm thuế): chỉ có khi cổng đọc được. */
  discount?: number;
  paid?: number;
  tax?: number;
  providerAmount?: number;
  /** Tên các trường tiền cổng báo mà sai kiểu: cổng đã thu tiền mà không đọc được bao nhiêu. */
  malformed: string[];
}

const REVIEW_ACTIONS: readonly string[] = ["order_underpaid", "order_amount_mismatch"];

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Dữ kiện từ dòng nhật ký MỚI NHẤT của đơn (`rows` mới nhất trước, như /admin/audit) ghi lúc giữ đơn. Dòng của đơn khác, dòng
 * không phải JSON object hay thiếu `detail` thì bỏ qua; không có dòng nào thì null (nhật ký chưa tải, hay đơn bị giữ từ trước khi
 * server ghi dữ kiện này).
 */
export function reviewOf(code: number, rows: readonly AuditRow[]): Review | null {
  for (const r of rows) {
    if (r.order_code !== code || !REVIEW_ACTIONS.includes(r.action) || !r.detail) continue;
    let d: unknown;
    try {
      d = JSON.parse(r.detail);
    } catch {
      continue;
    }
    if (d === null || typeof d !== "object" || Array.isArray(d)) continue;
    const o = d as Record<string, unknown>;
    const fields = Array.isArray(o.provider_malformed_fields) ? o.provider_malformed_fields.filter((x): x is string => typeof x === "string") : [];
    return {
      hasDiscount: o.has_discount === true,
      discount: num(o.provider_discount_amount),
      paid: num(o.provider_amount_paid),
      tax: num(o.provider_tax_amount),
      providerAmount: num(o.provider_amount),
      malformed: fields,
    };
  }
  return null;
}

/** "Số liệu Creem ghi: khách trả $33,00 (gồm thuế); thuế $3,00; giảm $9,99." (chuỗi rỗng khi cổng không ghi số nào). */
function figures(order: OrderRow, gateway: string, r: Review): string {
  const m = (n: number) => fmtMoney(n, order.currency);
  const parts = [
    r.paid !== undefined && `khách trả ${m(r.paid)} (gồm thuế)`,
    r.tax !== undefined && `thuế ${m(r.tax)}`,
    r.discount !== undefined && r.discount !== 0 && `giảm ${m(r.discount)}`,
  ].filter((p): p is string => p !== false);
  return parts.length > 0 ? `Số liệu ${gateway} ghi: ${parts.join("; ")}.` : "";
}

export interface StepText {
  title: string;
  text: string;
}

/**
 * Thẻ việc của đơn `underpaid` ở cổng không phải PayOS: cổng báo đã thu tiền nhưng thấp hơn giá (mã giảm giá, hay trả thấp hơn),
 * hay đã thu mà không đọc được số tiền. Không nói "chuyển thiếu" hay "chuyển bù": thẻ không chuyển bù được. `r` null (nhật ký
 * chưa có dữ kiện) thì lời dẫn chung, không khẳng định có mã giảm giá. `order.amount_paid` là phần thuộc về giá, không gồm thuế.
 */
export function heldStep(order: OrderRow, gateway: string, r: Review | null): StepText {
  const m = (n: number) => fmtMoney(n, order.currency);
  const figs = r ? figures(order, gateway, r) : "";
  if (r && r.malformed.length > 0) {
    return {
      title: `${gateway} báo đã thu tiền nhưng không đọc được số tiền`,
      text: [
        `${gateway} báo đã thu tiền nhưng không đọc được dữ liệu tiền (trường: ${r.malformed.join(", ")}). Mở đơn trên dashboard ${gateway}: khách trả đủ thì Cấp tay, không thì hoàn tiền trên ${gateway}.`,
        figs,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  const received = r?.hasDiscount
    ? `Khách dùng mã giảm giá; đã nhận ${m(order.amount_paid)} (không gồm thuế) trên giá ${m(order.amount)}.`
    : `Đã nhận ${m(order.amount_paid)} (không gồm thuế) trên giá ${m(order.amount)}.`;
  const next = r?.hasDiscount
    ? `Xem trạng thái trên ${gateway}: chấp nhận giá đã giảm thì Cấp tay, không thì hoàn tiền ở ${gateway}.`
    : `Xem trạng thái trên ${gateway} rồi Cấp tay hay hoàn tiền ở ${gateway}.`;
  return {
    // Nhật ký nói có mã giảm giá thì nói thẳng (số đã thu có thể bằng giá: không gọi là "thấp hơn giá"); chưa biết thì để câu hỏi.
    title: r?.hasDiscount ? `${gateway} báo đã trả, có dùng mã giảm giá` : `${gateway} báo đã trả nhưng thấp hơn giá đơn (có mã giảm giá?)`,
    text: [received, figs, next].filter(Boolean).join(" "),
  };
}

/**
 * Câu chính của hộp Cấp tay cho đơn bị giữ vì số tiền (underpaid, failed lệch giá) ở cổng không phải PayOS: Cấp tay là chấp nhận
 * số cổng đã thu (`amount_paid`, không gồm thuế), doanh thu ghi đúng số đó; không chấp nhận thì hoàn tiền ở cổng (webhook hoàn
 * đủ làm đơn thành refunded). Dữ liệu tiền hỏng thì nói không đọc được số đã thu.
 */
export function acceptText(order: OrderRow, gateway: string, r: Review | null): string {
  const m = (n: number) => fmtMoney(n, order.currency);
  const head =
    r && r.malformed.length > 0
      ? `Cấp tay là chấp nhận khoản ${gateway} đã thu (không đọc được số đã thu) trên giá ${m(order.amount)}; doanh thu ghi ${m(order.amount_paid)}.`
      : `Cấp tay là chấp nhận số ${gateway} đã thu ${m(order.amount_paid)} (không gồm thuế) trên giá ${m(order.amount)}; doanh thu ghi ${m(order.amount_paid)}.`;
  return `${head} Không chấp nhận thì hoàn tiền ở dashboard ${gateway}: đơn tự thành Đã hoàn tiền khi ${gateway} báo.`;
}

/**
 * Câu của thẻ Số tiền khi nhật ký có dữ kiện của cổng (p2, p3 của rà B6): không đọc được số đã thu (thay "Chưa nhận khoản nào"),
 * hay có mã giảm giá (thay "Đã nhận đủ", kể cả khi số đã thu bằng giá). null: thẻ Số tiền giữ câu thường.
 */
export function heldMoneyNote(order: OrderRow, gateway: string, r: Review | null): string | null {
  if (!r) return null;
  if (r.malformed.length > 0) return `Không đọc được số tiền ${gateway} đã thu.`;
  if (r.hasDiscount) return `${gateway} đã thu ${fmtMoney(order.amount_paid, order.currency)} không gồm thuế (có giảm giá).`;
  return null;
}

/**
 * Câu đầu của lời dẫn đơn `failed` ở cổng không phải PayOS (kèm khoảng trắng cuối; rỗng khi không có gì để nói thêm): cổng báo
 * giá mà giao diện không đọc được, hay giá cổng báo khác giá đơn. Đơn failed không qua `order_amount_mismatch` (cổng báo thẳng
 * trạng thái lỗi) thì không có câu này.
 */
export function failedLead(order: OrderRow, gateway: string, r: Review | null): string {
  if (!r) return "";
  if (r.malformed.length > 0) return `Không đọc được giá từ ${gateway} (trường: ${r.malformed.join(", ")}). `;
  if (r.providerAmount !== undefined && r.providerAmount !== order.amount) {
    const m = (n: number) => fmtMoney(n, order.currency);
    return `Giá ${gateway} báo (không gồm thuế) là ${m(r.providerAmount)}, khác giá của đơn ${m(order.amount)}. `;
  }
  return "";
}
