// Cài đặt PaymentProvider cho PayOS. Tài liệu đã đọc (2026-10-01):
// - API: https://payos.vn/docs/api/  (POST /v2/payment-requests, GET /v2/payment-requests/{id}, POST /confirm-webhook)
// - Chữ ký: https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/
// - Không có sandbox: https://payos.vn/docs/moi-truong-test/
// Cách ký theo SDK chính thức @payos/node 2.0.5 (createSignatureOfPaymentRequest, createSignatureFromObj).
import { hmacSha256Hex, timingSafeEqual } from "../crypto";
import {
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentProvider,
  PaymentProviderError,
  type PaymentStatus,
  type PaymentStatusResult,
  type WebhookEvent,
} from "./provider";

export interface PayOSConfig {
  baseUrl: string;
  clientId: string;
  apiKey: string;
  checksumKey: string;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const USER_AGENT = "license-server/1.0";
const TIMEOUT_MS = 10_000;
const STATUS_MAP: Record<string, PaymentStatus> = {
  PENDING: "pending",
  PROCESSING: "processing",
  PAID: "paid",
  UNDERPAID: "underpaid",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  FAILED: "failed",
};

/** Chuỗi ký khi tạo link: 5 trường xếp theo chữ cái, không mã hóa URL. */
export function paymentRequestSignatureData(r: {
  amount: number;
  cancelUrl: string;
  description: string;
  orderCode: number;
  returnUrl: string;
}): string {
  return `amount=${r.amount}&cancelUrl=${r.cancelUrl}&description=${r.description}&orderCode=${r.orderCode}&returnUrl=${r.returnUrl}`;
}

/**
 * Chuỗi ký cho dữ liệu PayOS trả về (webhook, response): key xếp theo chữ cái, dạng key=value nối bằng "&";
 * null, undefined, "null", "undefined" thành chuỗi rỗng; mảng thành JSON với key của từng phần tử được xếp.
 */
export function objectSignatureData(data: Record<string, unknown>): string {
  const sortKeys = (o: unknown): unknown => {
    if (typeof o !== "object" || o === null || Array.isArray(o)) return o;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, (o as Record<string, unknown>)[k]]));
  };
  return Object.keys(data)
    .sort()
    .filter((k) => data[k] !== undefined)
    .map((k) => {
      let v = data[k];
      if (Array.isArray(v)) v = JSON.stringify(v.map(sortKeys));
      if (v === null || v === "null" || v === "undefined") v = "";
      return `${k}=${String(v)}`;
    })
    .join("&");
}

/**
 * Đọc `transactionDateTime` của PayOS. Tài liệu và SDK chỉ có ví dụ dạng "2023-02-04 18:25:00", không ghi múi giờ;
 * coi là giờ Việt Nam (UTC+7, không đổi theo mùa) và kiểm lại ở giao dịch thử trên staging (Task 20).
 * Dạng ISO 8601 có múi giờ cũng nhận. Không đọc được thì trả null.
 */
export function parsePayOSTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const local = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (local) {
    const [y, mo, d, h, mi, se] = local.slice(1).map(Number) as [number, number, number, number, number, number];
    const ms = Date.UTC(y, mo - 1, d, h - 7, mi, se);
    const back = new Date(ms + 7 * 3600 * 1000);
    // Từ chối ngày không có thật (ví dụ 2026-02-30), thay vì để Date.UTC tự cộng sang tháng sau.
    if (back.getUTCDate() !== d || back.getUTCMonth() !== mo - 1 || h > 23 || mi > 59 || se > 59) return null;
    return ms / 1000;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (iso) {
    const [y, mo, d, h, mi, se] = iso.slice(1, 7).map(Number) as [number, number, number, number, number, number];
    const day = new Date(Date.UTC(y, mo - 1, d));
    // Date.parse tự cộng ngày không có thật sang ngày sau (2026-02-30 thành 02/03, 24:00 thành 00:00 hôm sau): kiểm trước.
    // Múi giờ sai (+24:00, +07:60) thì Date.parse đã trả NaN.
    if (day.getUTCDate() !== d || day.getUTCMonth() !== mo - 1 || h > 23 || mi > 59 || se > 59) return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  }
  return null;
}

interface PayOSEnvelope {
  code?: unknown;
  desc?: unknown;
  data?: unknown;
  signature?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export class PayOSProvider implements PaymentProvider {
  readonly name = "payos";

  constructor(
    private readonly cfg: PayOSConfig,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    if (req.currency !== "VND") throw new PaymentProviderError(`PayOS không nhận ${req.currency}`);
    const signed = {
      amount: req.amount,
      cancelUrl: req.cancelUrl,
      description: req.description,
      orderCode: req.orderCode,
      returnUrl: req.returnUrl,
    };
    const signature = await hmacSha256Hex(this.cfg.checksumKey, paymentRequestSignatureData(signed));
    const data = await this.call("POST", "/v2/payment-requests", { ...signed, expiredAt: req.expiresAt, signature });
    const { paymentLinkId, checkoutUrl, qrCode } = data;
    if (typeof paymentLinkId !== "string" || typeof checkoutUrl !== "string" || typeof qrCode !== "string") {
      throw new PaymentProviderError("PayOS trả thiếu paymentLinkId, checkoutUrl hoặc qrCode");
    }
    return { providerRef: paymentLinkId, checkoutUrl, qrCode };
  }

  async verifyWebhook(body: unknown): Promise<WebhookEvent | null> {
    if (!isRecord(body) || !isRecord(body.data) || typeof body.signature !== "string") return null;
    const expected = await hmacSha256Hex(this.cfg.checksumKey, objectSignatureData(body.data));
    if (!timingSafeEqual(expected, body.signature)) return null;
    const orderCode = body.data.orderCode;
    return Number.isSafeInteger(orderCode) ? { orderCode: orderCode as number } : null;
  }

  async getPaymentStatus(orderCode: number): Promise<PaymentStatusResult> {
    const data = await this.call("GET", `/v2/payment-requests/${orderCode}`);
    const status = typeof data.status === "string" ? STATUS_MAP[data.status] : undefined;
    const { amount, amountPaid } = data;
    if (status === undefined || !Number.isSafeInteger(amount) || !Number.isSafeInteger(amountPaid)) {
      throw new PaymentProviderError("PayOS trả trạng thái đơn không đọc được");
    }
    if (data.orderCode !== orderCode) throw new PaymentProviderError("PayOS trả sai orderCode");
    // Thời điểm thanh toán là giao dịch muộn nhất: khách chuyển thiếu rồi chuyển bù thì lần bù mới làm đơn đủ tiền.
    const times = (Array.isArray(data.transactions) ? data.transactions : [])
      .map((t) => (isRecord(t) ? parsePayOSTime(t.transactionDateTime) : null))
      .filter((t): t is number => t !== null);
    const paidAt = times.length > 0 ? Math.max(...times) : null;
    return { orderCode, status, amount: amount as number, amountPaid: amountPaid as number, paidAt };
  }

  /** Đăng ký URL webhook cho kênh thanh toán; PayOS gửi thử một webhook mẫu tới URL này trước khi nhận. */
  async confirmWebhook(webhookUrl: string): Promise<void> {
    await this.call("POST", "/confirm-webhook", { webhookUrl }, false);
  }

  private async call(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    verifyResponse = true,
  ): Promise<Record<string, unknown>> {
    const init: RequestInit = {
      method,
      headers: {
        "x-client-id": this.cfg.clientId,
        "x-api-key": this.cfg.apiKey,
        "content-type": "application/json",
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.cfg.baseUrl}${path}`, init);
    } catch (err) {
      // Lỗi mạng hay quá thời gian chờ: bên gọi chỉ cần biết là lỗi của cổng thanh toán.
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new PaymentProviderError(`PayOS không trả lời sau ${TIMEOUT_MS / 1000} giây`);
      }
      throw new PaymentProviderError(`PayOS không trả lời (${String(err)})`);
    }
    let json: PayOSEnvelope;
    try {
      json = (await res.json()) as PayOSEnvelope;
    } catch {
      throw new PaymentProviderError(`PayOS trả HTTP ${res.status} không phải JSON`, undefined, res.status);
    }
    if (!res.ok || json.code !== "00" || !isRecord(json.data)) {
      throw new PaymentProviderError(
        `PayOS lỗi HTTP ${res.status}: ${String(json.desc ?? "")}`,
        typeof json.code === "string" ? json.code : undefined,
        res.status,
      );
    }
    // Như SDK chính thức: có chữ ký thì kiểm, sai thì từ chối.
    if (verifyResponse && typeof json.signature === "string") {
      const expected = await hmacSha256Hex(this.cfg.checksumKey, objectSignatureData(json.data));
      if (!timingSafeEqual(expected, json.signature)) throw new PaymentProviderError("chữ ký response của PayOS sai");
    }
    return json.data;
  }
}
