// Interface cổng thanh toán (spec §6.8). Thêm cổng mới chỉ cần một cài đặt của interface này
// và một endpoint webhook; license, token và app không phải sửa.
// Tên hàm theo spec: create_checkout, verify_webhook, get_payment_status.
import type { PlanCode } from "../plans";

/**
 * `refunded`: cổng báo đơn đã trả rồi hoàn đủ trước khi ta cấp license (khi đó không cấp). Chỉ là lớp phòng thủ: theo tài liệu
 * Creem, hỏi lại phiên sau khi hoàn tiền vẫn thấy `paid` (hoàn tiền nằm ở giao dịch); đường chính là webhook hoàn tiền
 * (`kind: "refund"`, orders.ts handleRefund) chuyển đơn sang `refunded` trước khi cấp.
 */
export type PaymentStatus = "pending" | "processing" | "paid" | "underpaid" | "cancelled" | "expired" | "failed" | "refunded";

export interface CheckoutRequest {
  orderCode: number;
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  /** Giây Unix; link thanh toán hết hạn lúc này. */
  expiresAt: number;
  /** Gói của đơn: cổng bán theo sản phẩm (Creem) cần biết để chọn sản phẩm. */
  plan: PlanCode;
  /** Email khách nhập trong app, để điền sẵn trang thanh toán nếu cổng cho phép. */
  email: string;
}

export interface CheckoutResult {
  providerRef: string;
  checkoutUrl: string;
  /** Chuỗi VietQR thô; app tự vẽ thành mã QR. null với cổng không có mã QR (Creem): app mở trang thanh toán bằng trình duyệt. */
  qrCode: string | null;
}

/**
 * Dữ kiện của cổng giải thích vì sao đơn phải xem lại, chép nguyên vào `detail` của nhật ký `order_underpaid` hay
 * `order_amount_mismatch` (cạnh `amount`, `provider_amount`, `amount_paid`). Creem đặt khi giữ đơn (payment/creem.ts); PayOS không
 * đặt. Chỉ số (cent của cổng) và cờ: không chép mã giảm giá, email hay chữ nào của cổng.
 */
export interface ReviewDetail {
  /** Cổng có dấu hiệu giảm giá (mã giảm giá của đơn hay của phiên, số giảm khác 0), kể cả ở dạng không đọc được. */
  has_discount: boolean;
  provider_discount_amount?: number;
  /** Số khách trả theo cổng, gồm thuế (Creem `amount_paid`). */
  provider_amount_paid?: number;
  provider_tax_amount?: number;
  /** Tên các trường tiền có mặt mà sai kiểu (`order.amount_paid`, `checkout.discount`…): cổng đã thu tiền mà không đọc được bao nhiêu. */
  provider_malformed_fields?: string[];
}

export interface PaymentStatusResult {
  orderCode: number;
  status: PaymentStatus;
  /**
   * Giá của đơn theo cổng, đơn vị nhỏ nhất của loại tiền; fulfilOrder so với `orders.amount` (khác thì đơn `failed`, không cấp).
   * Creem: `sub_total ?? amount`, tức giá niêm yết KHÔNG gồm thuế (thuế Creem cộng ngoài giá, `order.amount` có thể gồm hay không
   * gồm thuế tùy phản hồi); không phải số khách thực trả.
   */
  amount: number;
  /**
   * Phần tiền thuộc về giá, không gồm thuế (cổng không có thuế thì là số tiền đã nhận). Creem: số khách trả trừ thuế, kẹp trong
   * [0, `amount`]; fulfilOrder cấp khi `amountPaid >= amount`.
   */
  amountPaid: number;
  /** Thời điểm của giao dịch gần nhất do cổng báo (giây Unix); null nếu cổng không báo hoặc không đọc được. */
  paidAt: number | null;
  /** Dữ kiện của cổng cho nhật ký khi đơn bị giữ để xem lại (fulfilOrder chép vào `detail`); cổng không đặt (PayOS) thì vắng. */
  reviewDetail?: ReviewDetail;
}

/** Webhook thô: chữ ký của một số cổng nằm ở header và tính trên đúng thân thô (Creem), nên không parse trước khi kiểm. */
export interface WebhookRequest {
  rawBody: string;
  headers: Headers;
}

/** Điều route webhook cần biết sau khi đã kiểm chữ ký. */
export type WebhookEvent =
  /**
   * Cò kích hoạt: server hỏi lại cổng rồi cấp license cho đơn này. `providerRef`: mã của đơn ở cổng lấy từ payload đã ký
   * (Creem: `object.id`, id phiên); null nếu thiếu hay sai dạng; cổng không gửi (PayOS) thì không có. Chỉ dùng khi đơn chưa lưu
   * mã ở cổng (`orders.provider_ref` NULL: Worker dừng giữa lúc tạo phiên và lúc lưu): server hỏi cổng theo mã này, cổng xác nhận
   * đúng đơn (Creem: `request_id`) thì mới lưu. `reportUnknownOrder`: cổng đặt (Creem) thì mã đơn không có trong D1 được ghi
   * như `unmatched` (nhật ký, cảnh báo) với loại sự kiện và mã sự kiện này; cổng không đặt (PayOS: mẫu confirm-webhook mang
   * `orderCode` lạ mỗi lần đăng ký) thì `unknown_order` chỉ trả 200.
   */
  | {
      kind: "payment";
      orderCode: number;
      providerRef?: string | null;
      reportUnknownOrder?: { eventType: string; eventId: string | null };
    }
  /**
   * Cổng báo hoàn tiền hay tranh chấp (đã kiểm chữ ký). Tra đơn theo `orders.provider_ref`. `full`: đã hoàn đủ số khách đã trả
   * (hoàn tiền đã thành công, hay tranh chấp). Server ghi nhận và cảnh báo, hoàn đủ thì đơn thành `refunded` ở mọi trạng thái
   * (không bao giờ cấp nữa); không đụng license (spec 2026-10-14 D5, Q1 2026-10-15). Không đơn nào mang mã phiên này thì ghi
   * như `unmatched` (QĐ-7).
   */
  | {
      kind: "refund";
      /** Loại sự kiện của cổng (Creem: `refund.created`, `dispute.created`), để ghi nhật ký khi không khớp đơn nào. */
      eventType: string;
      providerRef: string;
      reason: "refund" | "dispute";
      full: boolean;
      /** Mã sự kiện của cổng (cùng mã khi cổng gửi lại): khử trùng nhật ký và cảnh báo. null nếu thiếu hay sai dạng. */
      eventId: string | null;
      /**
       * Số của lần hoàn này (Creem: `object.refund_amount`; tổng cộng dồn do `handleRefund` tính từ nhật ký), đơn vị nhỏ nhất của
       * loại tiền; null nếu thiếu.
       */
      refundedAmount: number | null;
      /** Số khách đã trả theo cổng (Creem: `transaction.amount_paid`, thiếu thì `order.amount_paid`); null nếu thiếu. */
      providerAmountPaid: number | null;
      /** Trạng thái lần hoàn do cổng báo (Creem: `succeeded`, …), tối đa 64 ký tự; null với tranh chấp hay khi thiếu. */
      refundStatus: string | null;
      /** Lý do do cổng báo (Creem: `requested_by_customer`, …), tối đa 64 ký tự; null nếu thiếu. */
      providerReason: string | null;
    }
  /**
   * Sự kiện đúng chữ ký mà không chỉ ra đơn nào của ta (Creem: `checkout.completed` thiếu hay sai `request_id`, khi khách trả qua
   * link công khai, Storefront hay sản phẩm khác của tài khoản; hoàn tiền hay tranh chấp thiếu `checkout`; thân JSON không đọc
   * được thành sự kiện, ví dụ cổng đổi định dạng). Route trả 200 (cổng không gửi lại vô ích), ghi nhật ký `payment_unmatched` và
   * cảnh báo người vận hành. `eventType`: null khi thân không có `eventType` dạng chuỗi. `providerRef`: mã của đối tượng trong
   * payload (Creem: `object.id`) để tra ở dashboard của cổng; `eventId` như của `refund`.
   */
  | { kind: "unmatched"; eventType: string | null; providerRef: string | null; eventId: string | null }
  /** Sự kiện đúng chữ ký nhưng server không dùng: trả 200. */
  | { kind: "ignore" };

export interface PaymentProvider {
  readonly name: string;
  /**
   * Cổng có tạo phiên thanh toán mới không. `false`: cổng chỉ XỬ LÝ đơn đã có (webhook, hỏi trạng thái, hoàn tiền và tranh
   * chấp) mà không BÁN: loại tiền của cổng không được chào ở GET /v1/plans, POST /v1/checkout trả 503 (checkout.ts,
   * sellableCurrencies). Creem chưa có đủ mã sản phẩm (hay tắt bán thẻ khẩn cấp) ở trạng thái này. Không khai báo là bán (PayOS).
   */
  readonly sells?: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /**
   * Trả về null nếu không kiểm được chữ ký (thiếu chữ ký, thiếu `data`, thiếu secret: không ném lỗi) hoặc sai chữ ký: route trả 400
   * `invalid_signature` và tạo cảnh báo. "malformed" là thân không đọc được (Creem: chỉ khi thân không phải JSON; PayOS: không
   * phải JSON, hay đúng chữ ký mà `orderCode` không phải số nguyên): route trả 400 `invalid_request`, chỉ ghi log, không cảnh
   * báo, không ghi D1. Sự kiện đúng chữ ký mà không chỉ ra đơn nào (kể cả JSON thiếu `eventType`) là `unmatched`, không phải
   * "malformed". Cổng kiểm được chữ ký trên thân thô (Creem) kiểm trước, nên "malformed" của cổng đó luôn là cổng gửi.
   * Cổng ký bên trong JSON (PayOS) phải parse trước, nên thân không phải JSON cũng là "malformed" dù chưa kiểm chữ ký: route
   * không được coi "malformed" là đã xác thực.
   */
  verifyWebhook(req: WebhookRequest): Promise<WebhookEvent | "malformed" | null>;
  /** `providerRef`: `orders.provider_ref` (null nếu cổng chưa trả lời lúc tạo đơn); cổng tra theo `orderCode` (PayOS) thì bỏ qua. */
  getPaymentStatus(ref: { orderCode: number; providerRef: string | null }): Promise<PaymentStatusResult>;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    /** Mã HTTP cổng trả về; không có nếu lỗi mạng, quá thời gian chờ hay lỗi dữ liệu. Đối soát dùng để dừng sớm (429, 5xx). */
    readonly httpStatus?: number,
    /**
     * Không liên lạc được với cổng: lỗi mạng hay quá thời gian chờ, chỉ đặt ở chỗ gọi fetch. Không suy ra từ việc thiếu
     * `httpStatus`, vì lỗi chữ ký hay dữ liệu cũng không có `httpStatus`. Đối soát tính chung chuỗi với 5xx.
     */
    readonly unreachable: boolean = false,
    /**
     * Thân phản hồi lỗi là JSON đúng kiểu của chính cổng (Creem: đối tượng có `trace_id` dạng chuỗi; PayOS: đối tượng có `code`
     * dạng chuỗi), chỉ đặt ở chỗ gọi API sau khi đã đọc được thân. Tường lửa hay CDN chặn trước khi tới cổng trả 401/403 bằng HTML
     * hay JSON lạ: `false`, nên không bị tính là "khóa API bị từ chối" (`isProviderAuthFailure`). Lỗi mạng, quá thời gian chờ,
     * 3xx, thân không phải JSON hay không phải đối tượng cũng `false`.
     */
    readonly jsonBody: boolean = false,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/**
 * Cổng từ chối khóa API: HTTP 401 hay 403 mà thân là JSON của chính cổng (`jsonBody`). Creem trả 401 khi thiếu khóa, 403 khi khóa
 * sai hay thiếu quyền; PayOS trả 401/403 kèm `code`. 401/403 không có thân của cổng (403 HTML của tường lửa hay CDN, chuyển
 * hướng, thân lạ) hay mọi lỗi khác (400, 404, 429, 5xx, 200 kèm mã lỗi nghiệp vụ, lỗi mạng) không phải lỗi khóa.
 */
export function isProviderAuthFailure(err: unknown): boolean {
  return err instanceof PaymentProviderError && err.jsonBody && (err.httpStatus === 401 || err.httpStatus === 403);
}
