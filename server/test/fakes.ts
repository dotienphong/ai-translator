// Bản giả lập PayOS và Resend ở mức HTTP: route chạy đúng code PayOSProvider và ResendEmailProvider,
// chỉ thay hàm fetch. Không test nào gọi mạng thật.
import { hmacSha256Hex } from "../src/crypto";
import { objectSignatureData, paymentRequestSignatureData } from "../src/payment/payos";
import type { CheckoutResult, PaymentProvider, PaymentStatusResult, WebhookEvent } from "../src/payment/provider";

export const TEST_CHECKSUM_KEY = "test-checksum-key-không-dùng-ở-đâu-khác";

interface FakeLink {
  orderCode: number;
  amount: number;
  amountPaid: number;
  status: string;
  description: string;
  transactions: { reference: string; amount: number; transactionDateTime: string }[];
}

/** Giờ Việt Nam dạng "YYYY-MM-DD HH:MM:SS", như transactionDateTime của PayOS. */
export function payosTime(epochSeconds: number): string {
  return new Date((epochSeconds + 7 * 3600) * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export class FakePayOS {
  readonly links = new Map<number, FakeLink>();
  readonly requests: { method: string; path: string; body: unknown }[] = [];
  down = false;
  /** Mã HTTP lỗi cho các lần hỏi trạng thái đơn kế tiếp, lần lượt; 200 là trả bình thường. Hết hàng đợi thì trả bình thường. */
  statusFailures: number[] = [];
  confirmedWebhook: string | null = null;

  constructor(
    private readonly checksumKey = TEST_CHECKSUM_KEY,
    /** Đồng hồ của test: giao dịch mang thời điểm khách chuyển khoản. */
    private readonly now: () => number = () => 0,
  ) {}

  readonly fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const path = new URL(url).pathname;
    const method = init.method ?? "GET";
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
    this.requests.push({ method, path, body });
    if (this.down) throw new TypeError("fetch failed");
    if (method === "POST" && path === "/v2/payment-requests" && body) {
      const signed = body as { amount: number; cancelUrl: string; description: string; orderCode: number; returnUrl: string };
      const expected = await hmacSha256Hex(this.checksumKey, paymentRequestSignatureData(signed));
      if (body.signature !== expected) return json({ code: "201", desc: "Mã kiểm tra(signature) không hợp lệ", data: null });
      if (this.links.has(signed.orderCode)) return json({ code: "231", desc: "Đơn thanh toán đã tồn tại", data: null });
      this.links.set(signed.orderCode, {
        orderCode: signed.orderCode,
        amount: signed.amount,
        amountPaid: 0,
        status: "PENDING",
        description: signed.description,
        transactions: [],
      });
      return this.signed({
        bin: "970422",
        accountNumber: "113366668888",
        accountName: "TEST",
        amount: signed.amount,
        description: signed.description,
        orderCode: signed.orderCode,
        currency: "VND",
        paymentLinkId: `plink${signed.orderCode}`,
        status: "PENDING",
        checkoutUrl: `https://pay.payos.test/web/plink${signed.orderCode}`,
        qrCode: `00020101021238570010A0000007270127QR${signed.orderCode}6304ABCD`,
      });
    }
    const m = path.match(/^\/v2\/payment-requests\/(\d+)$/);
    if (method === "GET" && m) {
      const failure = this.statusFailures.shift();
      if (failure !== undefined && failure !== 200) return json({ code: String(failure), desc: "lỗi giả", data: null }, failure);
      const link = this.links.get(Number(m[1]));
      if (!link) return json({ code: "101", desc: "Mã thanh toán không tồn tại", data: null });
      return this.signed({
        id: `plink${link.orderCode}`,
        orderCode: link.orderCode,
        amount: link.amount,
        amountPaid: link.amountPaid,
        amountRemaining: link.amount - link.amountPaid,
        status: link.status,
        createdAt: "2026-10-01T00:00:00.000Z",
        transactions: link.transactions.map((t) => ({ ...t, accountNumber: "113366668888", counterAccountName: null })),
        cancellationReason: null,
        canceledAt: null,
      });
    }
    if (method === "POST" && path === "/confirm-webhook" && body) {
      this.confirmedWebhook = String(body.webhookUrl);
      return json({ code: "00", desc: "success", data: { webhookUrl: body.webhookUrl, name: "Test", shortName: "T" } });
    }
    return json({ code: "404", desc: "not found", data: null }, 404);
  };

  /** Khách chuyển khoản `amount` đồng cho đơn (mặc định đủ tiền), lúc `at` (mặc định: bây giờ của test). */
  pay(orderCode: number, amount?: number, at?: number): void {
    const link = this.links.get(orderCode);
    if (!link) throw new Error(`không có link ${orderCode}`);
    const paid = amount ?? link.amount;
    link.transactions.push({ reference: `FT${link.transactions.length + 1}`, amount: paid, transactionDateTime: payosTime(at ?? this.now()) });
    link.amountPaid += paid;
    link.status = link.amountPaid >= link.amount ? "PAID" : "UNDERPAID";
  }

  setStatus(orderCode: number, status: string): void {
    const link = this.links.get(orderCode);
    if (!link) throw new Error(`không có link ${orderCode}`);
    link.status = status;
  }

  /** Giả lập PayOS trả số tiền khác số tiền của đơn (bất thường). */
  setAmount(orderCode: number, amount: number): void {
    const link = this.links.get(orderCode);
    if (!link) throw new Error(`không có link ${orderCode}`);
    link.amount = amount;
  }

  /** Body webhook PayOS gửi khi có giao dịch, ký bằng checksum key của kênh. */
  async webhookBody(orderCode: number, amount?: number): Promise<Record<string, unknown>> {
    const link = this.links.get(orderCode);
    const data = {
      orderCode,
      amount: amount ?? link?.amount ?? 0,
      description: link?.description ?? `AT${orderCode}`,
      accountNumber: "113366668888",
      reference: "FT1",
      transactionDateTime: link?.transactions.at(-1)?.transactionDateTime ?? payosTime(this.now()),
      currency: "VND",
      paymentLinkId: `plink${orderCode}`,
      code: "00",
      desc: "Thành công",
      counterAccountBankId: "",
      counterAccountBankName: "",
      counterAccountName: "",
      counterAccountNumber: "",
      virtualAccountName: "",
      virtualAccountNumber: "",
    };
    return { code: "00", desc: "success", success: true, data, signature: await this.sign(data) };
  }

  private async sign(data: Record<string, unknown>): Promise<string> {
    return hmacSha256Hex(this.checksumKey, objectSignatureData(data));
  }

  private async signed(data: Record<string, unknown>): Promise<Response> {
    return json({ code: "00", desc: "success", data, signature: await this.sign(data) });
  }
}

export interface SentEmail {
  to: string[];
  subject: string;
  text: string;
  idempotencyKey: string | null;
}

export class FakeResend {
  readonly sent: SentEmail[] = [];
  /** Resend trả 500 (lỗi tạm). */
  down = false;
  /** Resend trả mã này, ví dụ 422 (lỗi vĩnh viễn) hay 429 (lỗi tạm). */
  failStatus: number | null = null;
  /** Trường `name` trong body lỗi, ví dụ "invalid_idempotent_request" với 409. */
  failName = "error";
  attempts = 0;

  readonly fetch = async (_url: string, init: RequestInit = {}): Promise<Response> => {
    this.attempts++;
    if (this.failStatus !== null) return json({ statusCode: this.failStatus, message: "lỗi giả", name: this.failName }, this.failStatus);
    if (this.down) return json({ statusCode: 500, message: "down", name: "internal_server_error" }, 500);
    const body = JSON.parse(init.body as string) as { to: string[]; subject: string; text: string };
    const headers = init.headers as Record<string, string>;
    this.sent.push({ to: body.to, subject: body.subject, text: body.text, idempotencyKey: headers["idempotency-key"] ?? null });
    return json({ id: crypto.randomUUID() });
  };
}

/** Cổng thanh toán giả thứ hai, để kiểm webhook và đối soát chọn cổng theo orders.provider (QĐ28). */
export class FakeGateway implements PaymentProvider {
  readonly name = "fakepay";
  readonly statusCalls: number[] = [];
  paid = new Set<number>();

  async createCheckout(): Promise<CheckoutResult> {
    throw new Error("không dùng trong test");
  }

  async verifyWebhook(body: unknown): Promise<WebhookEvent | null> {
    const b = body as { secret?: string; orderCode?: number };
    return b.secret === "fakepay-ok" && typeof b.orderCode === "number" ? { orderCode: b.orderCode } : null;
  }

  async getPaymentStatus(orderCode: number): Promise<PaymentStatusResult> {
    this.statusCalls.push(orderCode);
    const paid = this.paid.has(orderCode);
    return { orderCode, status: paid ? "paid" : "pending", amount: 50000, amountPaid: paid ? 50000 : 0, paidAt: null };
  }
}
