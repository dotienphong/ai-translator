// Kiểm chữ ký và đọc webhook của Creem (spec 2026-10-14-creem-international-payment-design §4.2).
// https://docs.creem.io/code/webhooks: header `creem-signature` là HMAC-SHA256 dạng hex của THÂN THÔ, khóa là secret của
// endpoint; không có timestamp hay phiên bản. Webhook thanh toán chỉ là cái cò: server luôn hỏi lại API Creem trước khi cấp
// license (orders.ts, fulfilOrder), nên một webhook thanh toán bị phát lại hay bị chặn giữa đường không cấp được gì. Hoàn tiền
// và tranh chấp thì tin payload đã ký (không hỏi lại API: đo ở sandbox ngày 2026-10-16, sau khi hoàn đủ GET vẫn báo phiên
// `completed` và đơn `paid`): server ghi nhật ký và cảnh báo, hoàn đủ (một lần, hay cộng dồn nhiều lần từng phần) thì đơn thành
// `refunded`; một sự kiện gửi lại (cùng `id`) không ghi lần hai (orders.ts, handleRefund). Sự kiện
// đúng chữ ký mà không chỉ ra đơn nào (khách trả qua link công khai hay Storefront, sản phẩm khác của tài khoản) là `unmatched`:
// route trả 200, ghi nhật ký và cảnh báo (orders.ts, recordUnmatched), không im lặng trả 400 cho tới khi Creem bỏ.
import { hmacSha256Hex, timingSafeEqual } from "../crypto";
import type { SubscriptionRef, SubscriptionStatus, SubscriptionTransaction, WebhookEvent, WebhookRequest } from "./provider";

export const CREEM_SIGNATURE_HEADER = "creem-signature";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `request_id` do ta đặt là `String(order_code)`: chỉ nhận số nguyên dương viết bằng chữ số, không có số 0 đầu. */
function orderCodeOf(requestId: unknown): number | null {
  if (typeof requestId !== "string" || !/^[1-9][0-9]{0,15}$/.test(requestId)) return null;
  const n = Number(requestId);
  return Number.isSafeInteger(n) ? n : null;
}

/** Mã sự kiện của cổng trong payload: chuỗi 1 tới 128 ký tự, khác thì null. */
function idOf(v: unknown): string | null {
  return typeof v === "string" && v.length >= 1 && v.length <= 128 ? v : null;
}

/** `id` phiên Creem (vào `orders.provider_ref` và URL hỏi trạng thái, creem.ts): chuỗi 1 tới 128 ký tự, chỉ chữ, số, `_`, `-`. */
export const CHECKOUT_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Mã của đối tượng trong payload (mã phiên, mã lần hoàn, mã tranh chấp): đúng mẫu CHECKOUT_ID, khác thì null (M-10). Mã phiên
 * sai mẫu không bao giờ thành `providerRef`: server không hỏi Creem theo nó, không lưu nó vào đơn, không tra đơn theo nó.
 */
function refOf(v: unknown): string | null {
  return typeof v === "string" && CHECKOUT_ID.test(v) ? v : null;
}


/** Khoảng giờ hợp lý (giây Unix): từ 2020-01-01 tới trước 2100-01-01. Ngoài khoảng là dữ liệu lạ, không dùng. */
const TIME_MIN = 1_577_836_800;
const TIME_MAX = 4_102_444_800;

/**
 * Mốc giờ trong payload thuê bao ra giây Unix (làm tròn xuống), hay null nếu thiếu, sai dạng hay ngoài khoảng hợp lý. Creem ghi
 * `created_at` của sự kiện bằng mili giây (tài liệu webhook) và ngày của đối tượng bằng chuỗi ISO 8601; dạng của các trường
 * `current_period_*` chưa đo (spec 2026-11-05 mục 9, U3) nên nhận cả chuỗi ISO có múi giờ, số giây và số mili giây.
 */
export function timeOf(v: unknown): number | null {
  let seconds: number;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    seconds = Math.floor(v >= 100_000_000_000 ? v / 1000 : v);
  } else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)) {
    const ms = Date.parse(v);
    if (!Number.isFinite(ms)) return null;
    seconds = Math.floor(ms / 1000);
  } else {
    return null;
  }
  return seconds >= TIME_MIN && seconds < TIME_MAX ? seconds : null;
}

/** Thuê bao trong payload: đối tượng có `id` hợp lệ, hay chính mã dạng chuỗi. Khác thì null. `customer` là đối tượng có `id` hay chuỗi. */
export function subscriptionRefOf(v: unknown): SubscriptionRef | null {
  if (typeof v === "string") return refOf(v) === null ? null : { ref: v, customerRef: null, periodEnd: null };
  if (!isRecord(v)) return null;
  const ref = refOf(v.id);
  if (ref === null) return null;
  return { ref, customerRef: customerRefOf(v.customer), periodEnd: timeOf(v.current_period_end_date) };
}

function customerRefOf(v: unknown): string | null {
  return typeof v === "string" ? refOf(v) : isRecord(v) ? refOf(v.id) : null;
}

/** Loại sự kiện thuê bao ta xử lý và trạng thái thuê bao tương ứng (spec 2026-11-05 D6). `update` lấy trạng thái trong payload. */
const SUBSCRIPTION_STATUS: Record<string, SubscriptionStatus | "payload"> = {
  "subscription.paid": "active",
  "subscription.active": "active",
  "subscription.update": "payload",
  "subscription.trialing": "trialing",
  "subscription.scheduled_cancel": "scheduled_cancel",
  "subscription.canceled": "canceled",
  "subscription.expired": "expired",
  "subscription.past_due": "past_due",
  "subscription.unpaid": "unpaid",
  "subscription.paused": "paused",
};
const STATUSES: readonly string[] = ["active", "scheduled_cancel", "canceled", "past_due", "unpaid", "paused", "expired", "trialing"];

/** Giao dịch của kỳ vừa thu (`last_transaction`); trường sai kiểu là null. null nếu payload không có giao dịch. */
function transactionOf(object: Record<string, unknown>): SubscriptionTransaction | null {
  const t = object.last_transaction;
  if (!isRecord(t)) return null;
  const status = typeof t.status === "string" ? t.status.slice(0, 64) : null;
  const currency = typeof t.currency === "string" ? t.currency.toUpperCase().slice(0, 8) : null;
  const d = object.discount;
  const hasDiscount = (d !== undefined && d !== null && d !== "") || (t.discount_amount !== undefined && t.discount_amount !== null && t.discount_amount !== 0);
  return { ref: refOf(t.id), status, currency, amountPaid: centsOf(t.amount_paid), taxAmount: centsOf(t.tax_amount), hasDiscount, paidAt: timeOf(t.created_at) };
}

/** Số tiền (cent) trong payload: số nguyên an toàn ≥ 0, khác (thiếu, null, chuỗi, âm, lẻ) thì null. */
function centsOf(v: unknown): number | null {
  return Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : null;
}

/**
 * null: thiếu hay sai chữ ký, hay chưa có secret (route trả 400 và tạo cảnh báo). "malformed": đúng chữ ký (đúng là Creem gửi)
 * nhưng thân không phải JSON. Thân JSON mà không phải object hay thiếu `eventType` dạng chuỗi là `{ kind: "unmatched" }` với
 * `eventType` null. Xét `eventType` trước, chỉ đòi `object` ở nhánh có dùng: sự kiện server không dùng thì `{ kind: "ignore" }`
 * dù thiếu `object`; sự kiện thanh toán, hoàn tiền hay tranh chấp mà không chỉ ra đơn nào thì `{ kind: "unmatched" }`. Cò cấp
 * mang `reportUnknownOrder`: mã đơn không có trong D1 cũng được ghi như `unmatched`.
 */
export async function verifyCreemWebhook(secret: string, req: WebhookRequest): Promise<WebhookEvent | "malformed" | null> {
  // Web Crypto không nhận khóa HMAC rỗng (ném DataError): cấu hình hỏng thì coi như không kiểm được chữ ký.
  if (secret === "") return null;
  const signature = req.headers.get(CREEM_SIGNATURE_HEADER);
  if (signature === null) return null;
  const expected = await hmacSha256Hex(secret, req.rawBody);
  if (!timingSafeEqual(expected, signature.trim().toLowerCase())) return null;
  let body: unknown;
  try {
    body = JSON.parse(req.rawBody);
  } catch {
    return "malformed";
  }
  const event = isRecord(body) ? body : {};
  const object = isRecord(event.object) ? event.object : {};
  const eventId = idOf(event.id);
  // Mã của đối tượng trong payload: id phiên với checkout.completed, id lần hoàn hay vụ tranh chấp với hai loại kia.
  const objectId = refOf(object.id);
  const eventType = event.eventType;
  // Thân đã ký (chắc chắn từ Creem) mà không đọc được thành sự kiện, ví dụ Creem đổi tên trường: không im lặng trả 400.
  if (typeof eventType !== "string") return { kind: "unmatched", eventType: null, providerRef: objectId, eventId };
  if (Object.hasOwn(SUBSCRIPTION_STATUS, eventType)) {
    const ref = refOf(object.id);
    if (ref === null) return { kind: "unmatched", eventType, providerRef: objectId, eventId };
    const mapped = SUBSCRIPTION_STATUS[eventType] ?? "payload";
    const fromPayload = typeof object.status === "string" && STATUSES.includes(object.status) ? (object.status as SubscriptionStatus) : "active";
    return {
      kind: "subscription",
      eventType,
      eventId,
      eventAt: timeOf(event.created_at),
      subscriptionRef: ref,
      customerRef: customerRefOf(object.customer),
      status: mapped === "payload" ? fromPayload : mapped,
      periodEnd: timeOf(object.current_period_end_date),
      transaction: eventType === "subscription.paid" ? transactionOf(object) : null,
    };
  }
  if (eventType !== "checkout.completed" && eventType !== "refund.created" && eventType !== "dispute.created") {
    // Sự kiện bỏ qua vẫn để lại một dòng log: thấy được khi Creem gửi loại sự kiện mới mà server chưa xử lý. Log ở đây vì kiểu
    // `ignore` không mang loại sự kiện tới route.
    console.warn(JSON.stringify({ event: "webhook_ignored", provider: "creem", event_type: eventType.slice(0, 64) }));
    return { kind: "ignore" };
  }
  const unmatched = { kind: "unmatched", eventType, providerRef: objectId, eventId } as const;
  if (eventType === "checkout.completed") {
    const orderCode = orderCodeOf(object.request_id);
    if (orderCode === null) return unmatched;
    const subscription = subscriptionRefOf(object.subscription);
    return { kind: "payment", orderCode, providerRef: objectId, ...(subscription ? { subscription } : {}), reportUnknownOrder: { eventType, eventId } };
  }
  // Tra đơn theo id phiên (orders.provider_ref); payload của tranh chấp không có request_id (mẫu trong tài liệu). `checkout` là
  // object có `id` (mẫu của Creem) hay chính mã phiên dạng chuỗi (dạng rút gọn kiểu `product: "prod_…"` trong cùng payload):
  // cả hai nằm trong thân đã ký nên tin như nhau. Thiếu hay kiểu khác thì không tra được đơn.
  const { checkout } = object;
  const providerRef = typeof checkout === "string" ? refOf(checkout) : isRecord(checkout) ? refOf(checkout.id) : null;
  if (providerRef === null) return unmatched;
  const dispute = eventType === "dispute.created";
  // Số của lần hoàn này. Payload thật của `refund.created` (đo ở Creem sandbox ngày 2026-10-16, test/fixtures/creem/) mang nó ở
  // `object.refund_amount` (cent, kèm `refund_currency`); `object.transaction` là ảnh chụp giao dịch lúc phát sự kiện, CHƯA cập
  // nhật (`refunded_amount` null, `status` "paid") nên mẫu tài liệu (`transaction.refunded_amount`) chỉ còn là dự phòng khi
  // `refund_amount` thiếu hay sai kiểu. Tranh chấp chưa đo được (sandbox không tạo được): giữ cách đọc theo mẫu tài liệu
  // (`transaction.refunded_amount`). Mỗi payload chỉ mang số của MỘT lần hoàn: hoàn nhiều lần từng phần thì handleRefund
  // (orders.ts) cộng dồn từ nhật ký của đơn.
  const transaction = isRecord(object.transaction) ? object.transaction : {};
  const order = isRecord(object.order) ? object.order : {};
  const refunded = (dispute ? null : centsOf(object.refund_amount)) ?? centsOf(transaction.refunded_amount);
  // Số khách đã trả: ở giao dịch, thiếu thì ở đơn (cả hai đều có trong payload thật).
  const paid = centsOf(transaction.amount_paid) ?? centsOf(order.amount_paid);
  const { status, reason } = object;
  // "Hoàn đủ" (riêng lần này) chỉ khi hoàn tiền đã thành công và số hoàn ≥ số khách đã trả (> 0). Thiếu số nào thì không coi là
  // đủ: chỉ cảnh báo. Đối tượng tranh chấp không có `status`: tranh chấp coi như tiền đã bị lấy lại.
  const succeeded = dispute || status === "succeeded";
  const full = succeeded && refunded !== null && paid !== null && paid > 0 && refunded >= paid;
  return {
    kind: "refund",
    eventType,
    providerRef,
    reason: dispute ? "dispute" : "refund",
    full,
    eventId,
    refundedAmount: refunded,
    providerAmountPaid: paid,
    refundStatus: !dispute && typeof status === "string" ? status.slice(0, 64) : null,
    providerReason: typeof reason === "string" ? reason.slice(0, 64) : null,
  };
}
