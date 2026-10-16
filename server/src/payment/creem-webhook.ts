// Kiểm chữ ký và đọc webhook của Creem (spec 2026-10-14-creem-international-payment-design §4.2).
// https://docs.creem.io/code/webhooks: header `creem-signature` là HMAC-SHA256 dạng hex của THÂN THÔ, khóa là secret của
// endpoint; không có timestamp hay phiên bản. Webhook thanh toán chỉ là cái cò: server luôn hỏi lại API Creem trước khi cấp
// license (orders.ts, fulfilOrder), nên một webhook thanh toán bị phát lại hay bị chặn giữa đường không cấp được gì. Hoàn tiền
// và tranh chấp thì tin payload đã ký (không hỏi lại API, vì API vẫn báo đơn `paid` sau khi hoàn): server ghi nhật ký và cảnh
// báo, hoàn đủ thì đơn thành `refunded`; một sự kiện gửi lại (cùng `id`) không ghi lần hai (orders.ts, handleRefund). Sự kiện
// đúng chữ ký mà không chỉ ra đơn nào (khách trả qua link công khai hay Storefront, sản phẩm khác của tài khoản) là `unmatched`:
// route trả 200, ghi nhật ký và cảnh báo (orders.ts, recordUnmatched), không im lặng trả 400 cho tới khi Creem bỏ.
import { hmacSha256Hex, timingSafeEqual } from "../crypto";
import type { WebhookEvent, WebhookRequest } from "./provider";

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

/** Số tiền trong giao dịch của payload, chỉ để ghi nhật ký: số hữu hạn, khác thì null. */
function amountOf(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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
    return { kind: "payment", orderCode, providerRef: objectId, reportUnknownOrder: { eventType, eventId } };
  }
  // Tra đơn theo id phiên (orders.provider_ref); payload của tranh chấp không có request_id (mẫu trong tài liệu). `checkout` là
  // object có `id` (mẫu của Creem) hay chính mã phiên dạng chuỗi (dạng rút gọn kiểu `product: "prod_…"` trong cùng payload):
  // cả hai nằm trong thân đã ký nên tin như nhau. Thiếu hay kiểu khác thì không tra được đơn.
  const { checkout } = object;
  const providerRef = typeof checkout === "string" ? refOf(checkout) : isRecord(checkout) ? refOf(checkout.id) : null;
  if (providerRef === null) return unmatched;
  const dispute = eventType === "dispute.created";
  // "Hoàn đủ" chỉ khi hoàn tiền đã thành công và số đã hoàn ≥ số khách đã trả. Thiếu số nào thì không coi là đủ: chỉ cảnh báo.
  // Đối tượng tranh chấp không có `status`: tranh chấp coi như tiền đã bị lấy lại.
  const transaction = isRecord(object.transaction) ? object.transaction : {};
  const { refunded_amount: refunded, amount_paid: paid } = transaction;
  const { status, reason } = object;
  const succeeded = dispute || status === "succeeded";
  const full = succeeded && typeof refunded === "number" && typeof paid === "number" && paid > 0 && refunded >= paid;
  return {
    kind: "refund",
    eventType,
    providerRef,
    reason: dispute ? "dispute" : "refund",
    full,
    eventId,
    refundedAmount: amountOf(refunded),
    providerAmountPaid: amountOf(paid),
    refundStatus: !dispute && typeof status === "string" ? status.slice(0, 64) : null,
    providerReason: typeof reason === "string" ? reason.slice(0, 64) : null,
  };
}
