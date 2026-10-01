// Interface cổng thanh toán (spec §6.8). Thêm cổng mới chỉ cần một cài đặt của interface này
// và một endpoint webhook; license, token và app không phải sửa.
// Tên hàm theo spec: create_checkout, verify_webhook, get_payment_status.

export type PaymentStatus = "pending" | "processing" | "paid" | "underpaid" | "cancelled" | "expired" | "failed";

export interface CheckoutRequest {
  orderCode: number;
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  /** Giây Unix; link thanh toán hết hạn lúc này. */
  expiresAt: number;
}

export interface CheckoutResult {
  providerRef: string;
  checkoutUrl: string;
  /** Chuỗi VietQR thô; app tự vẽ thành mã QR. */
  qrCode: string;
}

export interface PaymentStatusResult {
  orderCode: number;
  status: PaymentStatus;
  amount: number;
  amountPaid: number;
  /** Thời điểm của giao dịch gần nhất do cổng báo (giây Unix); null nếu cổng không báo hoặc không đọc được. */
  paidAt: number | null;
}

export interface WebhookEvent {
  orderCode: number;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Trả về null nếu body sai định dạng hoặc sai chữ ký. */
  verifyWebhook(body: unknown): Promise<WebhookEvent | null>;
  getPaymentStatus(orderCode: number): Promise<PaymentStatusResult>;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    /** Mã HTTP cổng trả về; không có nếu lỗi mạng, quá thời gian chờ hay lỗi dữ liệu. Đối soát dùng để dừng sớm (429, 5xx). */
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
