// Bản giả lập PayOS và Resend ở mức HTTP: route chạy đúng code PayOSProvider và ResendEmailProvider,
// chỉ thay hàm fetch. Không test nào gọi mạng thật.
import { hmacSha256Hex } from "../src/crypto";
import { objectSignatureData, paymentRequestSignatureData } from "../src/payment/payos";
import type { CheckoutResult, PaymentProvider, PaymentStatusResult, WebhookEvent, WebhookRequest } from "../src/payment/provider";

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
  /**
   * Lỗi cho các lần hỏi trạng thái đơn kế tiếp, lần lượt: mã HTTP (200 là trả bình thường), "timeout" (fetch ném
   * TimeoutError như AbortSignal.timeout), "network" (fetch ném TypeError) hay "bad_signature" (trả lời nhưng sai chữ ký).
   * Hết hàng đợi thì trả bình thường.
   */
  statusFailures: (number | "timeout" | "network" | "bad_signature")[] = [];
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
      if (failure === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      if (failure === "network") throw new TypeError("fetch failed");
      if (failure === "bad_signature") return json({ code: "00", desc: "success", data: { orderCode: 0 }, signature: "0".repeat(64) });
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

export const TEST_CREEM_API_KEY = "ck_test_not_used_anywhere_else";
export const TEST_CREEM_WEBHOOK_SECRET = "whsec_test_creem_not_used_anywhere_else";
export const TEST_CREEM_PRODUCTS = { monthly: "prod_monthly", six_months: "prod_six_months", yearly: "prod_yearly" } as const;

/**
 * Thân lỗi của Creem theo tài liệu (https://docs.creem.io/api-reference/introduction): `{trace_id, status, error: "<loại>",
 * message: ["…"], timestamp}`. Provider chỉ đọc `trace_id`; `message` có thể chứa dữ liệu của khách nên không bao giờ được đưa vào lỗi.
 */
function creemError(status: number, traceId: string, error: string, message: string[]): Response {
  return json({ trace_id: traceId, status, error, message, timestamp: 1728734325927 }, status);
}

interface FakeCreemCheckout {
  id: string;
  productId: string;
  requestId: string;
  customPrice: number;
  email: string | null;
  successUrl: string;
  metadata: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "expired";
  /**
   * `amount`: giá của đơn (cent, chưa thuế, chưa giảm giá; là `sub_total`). `discountAmount`: số cent mã giảm giá trừ đi (0 nếu
   * không có); `discountId`: mã giảm giá (`order.discount`), null nếu không có. `checkoutDiscount`: phiên mang đối tượng giảm giá
   * (`discount` cấp phiên, CheckoutEntity). `raw`: trường của đơn ghi đè nguyên văn vào GET (giả lập Creem trả hình dạng lạ).
   */
  order: {
    id: string;
    status: string;
    amount: number;
    tax: number;
    discountAmount: number;
    discountId: string | null;
    checkoutDiscount: boolean;
    raw: Record<string, unknown>;
  } | null;
  /**
   * Chụp lúc khách trả (`pay`): đối tượng của webhook `checkout.completed` và `order.status` lúc đó. Creem gửi bản chụp lúc
   * hoàn tất, không theo trạng thái về sau; và theo tài liệu, hoàn tiền không đổi `order.status` (vẫn "paid").
   */
  paidSnapshot: { completed: Record<string, unknown>; orderStatus: string } | null;
}

/**
 * Creem giả ở mức HTTP: provider chạy đúng code thật, chỉ thay hàm fetch. Hình dạng response theo
 * https://docs.creem.io/api-reference/endpoint/create-checkout và get-checkout.
 */
export class FakeCreem {
  readonly checkouts = new Map<string, FakeCreemCheckout>();
  readonly requests: { method: string; path: string; apiKey: string | undefined; body: Record<string, unknown> | null }[] = [];
  down = false;
  /**
   * Lỗi cho các lần hỏi phiên kế tiếp, lần lượt: mã HTTP (200 là trả bình thường), "timeout" (fetch ném TimeoutError như
   * AbortSignal.timeout) hay "network" (fetch ném TypeError). Hết hàng đợi thì trả bình thường.
   */
  statusFailures: (number | "timeout" | "network")[] = [];
  /**
   * Như `statusFailures` nhưng cho các lần TẠO phiên kế tiếp (POST /v1/checkouts). Lần lỗi không tạo phiên và không tăng bộ đếm
   * `ch_fakeN` (mã phiên của các test khác không đổi).
   */
  createFailures: (number | "timeout" | "network")[] = [];
  /**
   * Hai cách hiểu `order.amount` của Creem (spike S1): false (mặc định) là giá chưa thuế (`amount` = `sub_total`); true là dạng của
   * mẫu OpenAPI (`amount` 2000 = `sub_total` 1800 + `tax_amount` 200). `amount_paid` và `sub_total` như nhau ở cả hai cách.
   */
  amountIncludesTax = false;
  /** Số thứ tự của mã phiên (`ch_fakeN`). Tách khỏi mã sự kiện: gọi `signedEvent` trước khi tạo phiên không làm lệch mã phiên (một số test ghi cứng `ch_fake1`). */
  private seq = 0;
  /** Số thứ tự của mã sự kiện (`evt_fakeN`), khi test không đặt mã. */
  private eventSeq = 0;

  /**
   * `secret`: secret ký webhook của kênh; mặc định là secret của Worker (TEST_CREEM_WEBHOOK_SECRET). Một FakeCreem khác secret đóng
   * vai kẻ tấn công ký được một thân hợp lệ mà server không chấp nhận (test sai chữ ký ở creem-orders.test.ts).
   */
  constructor(private readonly secret = TEST_CREEM_WEBHOOK_SECRET) {}

  private must(checkoutId: string): FakeCreemCheckout {
    const c = this.checkouts.get(checkoutId);
    if (!c) throw new Error(`không có phiên ${checkoutId}`);
    return c;
  }

  /** Mã phiên của đơn (theo request_id = mã đơn của ta). */
  checkoutIdOf(orderCode: number): string {
    const found = [...this.checkouts.values()].find((c) => c.requestId === String(orderCode));
    if (!found) throw new Error(`không có phiên cho đơn ${orderCode}`);
    return found.id;
  }

  /**
   * Khách trả cho phiên. `tax` là thuế Creem cộng ngoài giá (sản phẩm tax_mode exclusive): khách trả giá + thuế. `discountAmount`
   * và `discountId`: khách nhập mã giảm giá trên trang Creem (`order.discount_amount`, `order.discount`); khách trả giá + thuế −
   * giảm giá (`amount_paid`), như mẫu OrderEntity của Creem. Mặc định không giảm giá (`discount_amount` 0, `discount` null).
   * `checkoutDiscount`: phiên cũng mang đối tượng giảm giá (`discount` cấp phiên). Thuế và giảm giá độc lập với nhau.
   * Chụp lại payload `checkout.completed` và `order.status` lúc này (`paidSnapshot`).
   */
  pay(checkoutId: string, tax = 0, discount: { discountAmount?: number; discountId?: string | null; checkoutDiscount?: boolean } = {}): void {
    const c = this.must(checkoutId);
    c.status = "completed";
    c.order = {
      id: `ord_${c.id.slice(3)}`,
      status: "paid",
      amount: c.customPrice,
      tax,
      discountAmount: discount.discountAmount ?? 0,
      discountId: discount.discountId ?? null,
      checkoutDiscount: discount.checkoutDiscount ?? false,
      raw: {},
    };
    c.paidSnapshot = { completed: this.completedObject(c), orderStatus: c.order.status };
  }

  /**
   * Ghi đè nguyên văn các trường của `order` mà GET trả về (giả lập Creem trả hình dạng lạ: `discount` là đối tượng, `amount_paid`
   * là chuỗi…). `undefined` thì bỏ hẳn trường đó khỏi phản hồi.
   */
  patchOrder(checkoutId: string, fields: Record<string, unknown>): void {
    const c = this.must(checkoutId);
    if (!c.order) throw new Error(`phiên ${checkoutId} chưa có đơn`);
    Object.assign(c.order.raw, fields);
  }

  /** `order.amount` như Creem báo: giá chưa thuế, hay giá cộng thuế nếu `amountIncludesTax` (spike S1). */
  private reportedAmount(order: NonNullable<FakeCreemCheckout["order"]>): number {
    return this.amountIncludesTax ? order.amount + order.tax : order.amount;
  }

  setStatus(checkoutId: string, status: FakeCreemCheckout["status"]): void {
    this.must(checkoutId).status = status;
  }

  setOrderStatus(checkoutId: string, status: string): void {
    const c = this.must(checkoutId);
    if (!c.order) throw new Error(`phiên ${checkoutId} chưa có đơn`);
    c.order.status = status;
  }

  /** Giả lập Creem báo số tiền đơn khác giá ta đã gửi (bất thường). */
  setOrderAmount(checkoutId: string, amount: number): void {
    const c = this.must(checkoutId);
    if (!c.order) throw new Error(`phiên ${checkoutId} chưa có đơn`);
    c.order.amount = amount;
  }

  /**
   * Webhook thô như Creem gửi, ký bằng secret của kênh (HMAC-SHA256 hex của thân thô, header creem-signature). `eventId`: mã
   * sự kiện (`id`); thiếu thì mỗi lần một mã mới; `null` thì thân không có `id` (payload lạ, để thử khi không khử trùng được).
   */
  async signedEvent(
    eventType: string,
    object: Record<string, unknown>,
    eventId?: string | null,
  ): Promise<{ raw: string; headers: Record<string, string> }> {
    const id = eventId === undefined ? `evt_fake${++this.eventSeq}` : eventId;
    const raw = JSON.stringify({ ...(id === null ? {} : { id }), eventType, created_at: 1728734325927, object });
    return { raw, headers: { "creem-signature": await hmacSha256Hex(this.secret, raw) } };
  }

  /**
   * Webhook `refund.created` (hay `dispute.created` nếu `dispute`) của phiên đã trả. `amount`: số cent của lần hoàn này
   * (`refund_amount`, hay `amount` của tranh chấp), mặc định đủ tổng khách đã trả. `refundedTotal`: số đã hoàn của giao dịch
   * (`transaction.refunded_amount`), mặc định bằng `amount`; tài liệu chưa nói số này có cộng dồn qua nhiều lần hoàn không
   * (spike S4). Hình dạng theo mẫu ở https://docs.creem.io/code/webhooks: `order.status` là trạng thái lúc trả (mẫu hoàn đủ vẫn
   * "paid"); hoàn tiền nằm ở giao dịch (`refunded`, hoàn một phần `partialRefund`, tranh chấp `chargeback`); đối tượng tranh
   * chấp không có `status`, và phiên trong đó không có `request_id` hay `metadata`. `status` chỉ dùng cho `refund.created`
   * (mặc định "succeeded"). `eventId`: gửi lại cùng mã như khi Creem thử lại hay gửi tay ở dashboard (xem `signedEvent`).
   */
  refundWebhook(
    checkoutId: string,
    opts: { amount?: number; refundedTotal?: number; dispute?: boolean; status?: string; eventId?: string | null } = {},
  ) {
    const c = this.must(checkoutId);
    if (!c.order || !c.paidSnapshot) throw new Error(`phiên ${checkoutId} chưa trả`);
    const amountPaid = c.order.amount + c.order.tax - c.order.discountAmount;
    const amount = opts.amount ?? amountPaid;
    const refundedTotal = opts.refundedTotal ?? amount;
    const transaction = {
      id: "tran_fake",
      object: "transaction",
      amount: c.order.amount,
      amount_paid: amountPaid,
      currency: "USD",
      type: "payment",
      tax_amount: c.order.tax,
      status: opts.dispute ? "chargeback" : refundedTotal >= amountPaid ? "refunded" : "partialRefund",
      refunded_amount: refundedTotal,
      order: c.order.id,
      mode: "test",
    };
    const order = { id: c.order.id, object: "order", amount: this.reportedAmount(c.order), currency: "USD", status: c.paidSnapshot.orderStatus, mode: "test" };
    if (opts.dispute) {
      const checkout = { id: c.id, object: "checkout", product: c.productId, units: 1, status: "completed", mode: "test" };
      const dispute = { id: "disp_fake", object: "dispute", amount, currency: "USD", transaction, checkout, order, mode: "test" };
      return this.signedEvent("dispute.created", dispute, opts.eventId);
    }
    const checkout = { id: c.id, object: "checkout", request_id: c.requestId, status: "completed", metadata: c.metadata, mode: "test" };
    return this.signedEvent(
      "refund.created",
      {
        id: "ref_fake",
        object: "refund",
        status: opts.status ?? "succeeded",
        refund_amount: amount,
        refund_currency: "USD",
        reason: "requested_by_customer",
        transaction,
        checkout,
        order,
        mode: "test",
      },
      opts.eventId,
    );
  }

  /**
   * Webhook `checkout.completed` của phiên. Phiên đã trả: đúng bản chụp lúc trả (`paidSnapshot`), như Creem gửi. Phiên chưa
   * trả: MÔ PHỎNG cố ý, dựng từ trạng thái hiện tại (Creem thật không gửi sự kiện này khi phiên chưa hoàn tất), để thử rằng
   * webhook chỉ là cái cò: server luôn hỏi lại API trước khi cấp.
   */
  completedWebhook(checkoutId: string) {
    const c = this.must(checkoutId);
    return this.signedEvent("checkout.completed", c.paidSnapshot?.completed ?? this.completedObject(c));
  }

  /** Đối tượng của webhook `checkout.completed` dựng từ trạng thái hiện tại của phiên (hình dạng theo mẫu của Creem). */
  private completedObject(c: FakeCreemCheckout): Record<string, unknown> {
    return {
      id: c.id,
      object: "checkout",
      request_id: c.requestId,
      ...(c.order
        ? { order: { id: c.order.id, customer: "cust_fake", product: c.productId, amount: this.reportedAmount(c.order), currency: "USD", status: c.order.status, type: "onetime", mode: "test" } }
        : {}),
      product: { id: c.productId, name: "AI Translator", price: c.customPrice, currency: "USD", billing_type: "onetime", tax_mode: "exclusive", tax_category: "saas", status: "active", mode: "test" },
      customer: { id: "cust_fake", object: "customer", email: c.email, name: null, country: "NL", mode: "test" },
      status: "completed",
      metadata: c.metadata,
      mode: "test",
    };
  }

  private entity(c: FakeCreemCheckout) {
    return {
      id: c.id,
      object: "checkout",
      mode: "test",
      status: c.status,
      request_id: c.requestId,
      product: c.productId,
      units: 1,
      custom_price: c.customPrice,
      checkout_url: `https://checkout.creem.io/${c.id}`,
      success_url: c.successUrl,
      metadata: c.metadata,
      // `discount` cấp phiên là đối tượng DiscountEntity (CheckoutEntity của OpenAPI), không phải mã chuỗi như `order.discount`.
      ...(c.order?.checkoutDiscount
        ? { discount: { id: c.order.discountId ?? "dis_fake", discountCode: "FAKE", name: "Giảm giá giả", type: "fixed", amount: c.order.discountAmount, duration: "once" } }
        : {}),
      ...(c.order
        ? {
            order: {
              object: "order",
              id: c.order.id,
              customer: "cust_fake",
              product: c.productId,
              amount: this.reportedAmount(c.order),
              sub_total: c.order.amount,
              tax_amount: c.order.tax,
              discount: c.order.discountId,
              discount_amount: c.order.discountAmount,
              amount_due: c.order.amount + c.order.tax - c.order.discountAmount,
              amount_paid: c.order.amount + c.order.tax - c.order.discountAmount,
              currency: "USD",
              status: c.order.status,
              type: "onetime",
              mode: "test",
              ...c.order.raw,
            },
          }
        : {}),
    };
  }

  readonly fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(url);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
    this.requests.push({ method, path: u.pathname + u.search, apiKey: headers.get("x-api-key") ?? undefined, body });
    if (this.down) throw new TypeError("fetch failed");
    // Thiếu khóa API: 401 (tài liệu: "Invalid or missing API key"); có khóa mà sai (hay thiếu quyền): 403.
    const apiKey = headers.get("x-api-key");
    if (!apiKey) return creemError(401, "trace-401", "Unauthorized", ["Missing API key"]);
    if (apiKey !== TEST_CREEM_API_KEY) return creemError(403, "trace-auth", "Forbidden", ["Invalid API key"]);
    if (method === "POST" && u.pathname === "/v1/checkouts") {
      const failure = this.createFailures.shift();
      if (failure === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      if (failure === "network") throw new TypeError("fetch failed");
      if (failure !== undefined && failure !== 200) return creemError(failure, "trace-fail", "lỗi giả", ["lỗi giả"]);
      // Thân JSON mà không khai content-type: Creem không đọc được thân (400), như API thật.
      if (!headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return creemError(400, "trace-400", "Bad Request", ["Content-Type must be application/json"]);
      }
    }
    if (method === "POST" && u.pathname === "/v1/checkouts" && body) {
      const productId = body.product_id;
      const requestId = body.request_id;
      const customPrice = body.custom_price;
      const known = Object.values(TEST_CREEM_PRODUCTS) as string[];
      if (typeof productId !== "string" || !known.includes(productId)) return creemError(400, "trace-400", "Bad Request", ["product_id lạ"]);
      if (typeof requestId !== "string" || !Number.isInteger(customPrice) || (customPrice as number) < 100) {
        return creemError(400, "trace-400", "Bad Request", ["request_id hay custom_price sai"]);
      }
      const id = `ch_fake${++this.seq}`;
      const customer = body.customer as { email?: string } | undefined;
      const checkout: FakeCreemCheckout = {
        id,
        productId,
        requestId,
        customPrice: customPrice as number,
        email: customer?.email ?? null,
        successUrl: String(body.success_url ?? ""),
        metadata: (body.metadata ?? {}) as Record<string, unknown>,
        status: "pending",
        order: null,
        paidSnapshot: null,
      };
      this.checkouts.set(id, checkout);
      return json({
        id,
        object: "checkout",
        mode: "test",
        status: "pending",
        request_id: requestId,
        product: productId,
        units: 1,
        custom_price: customPrice,
        checkout_url: `https://checkout.creem.io/${id}`,
        success_url: checkout.successUrl,
        metadata: checkout.metadata,
      });
    }
    if (method === "GET" && u.pathname === "/v1/checkouts") {
      const failure = this.statusFailures.shift();
      if (failure === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      if (failure === "network") throw new TypeError("fetch failed");
      if (failure !== undefined && failure !== 200) return creemError(failure, "trace-fail", "lỗi giả", ["lỗi giả"]);
      const found = this.checkouts.get(u.searchParams.get("checkout_id") ?? "");
      return found ? json(this.entity(found)) : creemError(404, "trace-404", "Not Found", ["Checkout not found"]);
    }
    return creemError(404, "trace-404", "Not Found", [`Cannot ${method} ${u.pathname}`]);
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

  async verifyWebhook(req: WebhookRequest): Promise<WebhookEvent | "malformed" | null> {
    let b: { secret?: string; orderCode?: number };
    try {
      b = JSON.parse(req.rawBody) as { secret?: string; orderCode?: number };
    } catch {
      return "malformed";
    }
    return b.secret === "fakepay-ok" && typeof b.orderCode === "number" ? { kind: "payment", orderCode: b.orderCode } : null;
  }

  async getPaymentStatus(ref: { orderCode: number; providerRef: string | null }): Promise<PaymentStatusResult> {
    const { orderCode } = ref;
    this.statusCalls.push(orderCode);
    const paid = this.paid.has(orderCode);
    return { orderCode, status: paid ? "paid" : "pending", amount: 50000, amountPaid: paid ? 50000 : 0, paidAt: null };
  }
}
