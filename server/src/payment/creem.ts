// Cài đặt PaymentProvider cho Creem: Merchant of Record, bán bằng USD cho khách ngoài Việt Nam (spec
// 2026-10-14-creem-international-payment-design §4.2). Tài liệu đã đọc (2026-10-14):
// - API: https://docs.creem.io/api-reference/introduction (khóa trong header x-api-key; POST /v1/checkouts,
//   GET /v1/checkouts?checkout_id=)
// - Webhook: https://docs.creem.io/code/webhooks (creem-webhook.ts)
// Sandbox riêng (test-api.creem.io) KHÔNG bao giờ nối vào Worker: luật một môi trường (spec 2026-10-04). Test dùng
// FakeCreem (test/fakes.ts) thay hàm fetch.
import { PLAN_CODES, type PlanCode } from "../plans";
import { CHECKOUT_ID, verifyCreemWebhook } from "./creem-webhook";
import type { FetchFn } from "./payos";
import {
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentProvider,
  PaymentProviderError,
  type PaymentStatus,
  type PaymentStatusResult,
  type ReviewDetail,
  type WebhookEvent,
  type WebhookRequest,
} from "./provider";

export interface CreemConfig {
  /** Gốc API, không có `/v1` và không có `/` cuối. Production: https://api.creem.io. */
  baseUrl: string;
  apiKey: string;
  /** Secret của endpoint webhook. Chỉ Worker API cần (nhận webhook); Worker admin chỉ hỏi trạng thái phiên nên không giữ. */
  webhookSecret?: string;
  /**
   * Mã sản phẩm Creem của từng gói (sản phẩm trả một lần, USD, tax_mode exclusive). Chỉ Worker API cần (tạo phiên). Không có
   * thì cổng chỉ xử lý đơn đã có, không bán (`sells` false).
   */
  productIds?: Record<PlanCode, string>;
}

const USER_AGENT = "license-server/1.0";
const TIMEOUT_MS = 10_000;
/** Trang thanh toán của Creem. Chỉ tên miền này được trả cho app, và app cũng chỉ mở đúng tên miền này (navigation.rs). */
export const CREEM_CHECKOUT_HOST = "checkout.creem.io";
/** `trace_id` của Creem (ghi vào lỗi để hỏi hỗ trợ): chỉ nhận dạng mã thường, không bao giờ chép chữ lạ vào lỗi. */
const TRACE_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Giá một đơn (cent) ta gửi làm `custom_price`: từ 1,00 USD (mức tối thiểu của Creem) tới trần an toàn của ta (parsePlans chỉ đòi số nguyên dương). */
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 99_999_999;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Giá trị lạ của Creem để ghi vào thông điệp lỗi (log, thư cảnh báo). Chuỗi có "@" hay khoảng trắng (email, tên, câu chữ: có thể là
 * dữ liệu của khách) ghi `[đã che]`, không giữ chữ nào (M-7: "buyer?example.com" vẫn là email). Chuỗi khác cắt 32 ký tự, mọi ký tự
 * ngoài [A-Za-z0-9_.:-] thành "?". Đối tượng và mảng chỉ ghi loại. Khóa API không có trong phản hồi của Creem.
 */
function show(value: unknown): string {
  if (typeof value === "string") return /[@\s]/.test(value) ? "[đã che]" : `"${value.slice(0, 32).replace(/[^\w.:-]/g, "?")}"`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === undefined) return "thiếu";
  return value === null ? "null" : Array.isArray(value) ? "mảng" : typeof value;
}

/** Số tiền (cent) không bắt buộc: vắng hay null là chưa có (null); có mặt thì phải là số nguyên >= 0, sai kiểu là lỗi, không đoán. */
function optionalCents(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (v === undefined || v === null) return null;
  if (!Number.isSafeInteger(v) || (v as number) < 0) throw new PaymentProviderError(`Creem trả ${key} không đọc được (${show(v)})`);
  return v as number;
}

/**
 * Đọc biến CREEM_PRODUCT_IDS: đúng ba mã gói, mỗi gói một mã sản phẩm `prod_…`, ba mã khác nhau. Thiếu, sai dạng, còn chuỗi
 * rỗng (chưa bán thẻ, hay tắt bán thẻ khẩn cấp) hay hai gói trùng mã thì null: cổng creem (nếu có khóa API và secret webhook)
 * chỉ xử lý đơn đã có, không bán: GET /v1/plans không trả giá USD, POST /v1/checkout USD trả 503.
 */
export function parseProductIds(raw: unknown): Record<PlanCode, string> | null {
  if (!isRecord(raw) || Object.keys(raw).length !== PLAN_CODES.length) return null;
  const ids = {} as Record<PlanCode, string>;
  for (const code of PLAN_CODES) {
    const id = raw[code];
    if (typeof id !== "string" || !/^prod_[A-Za-z0-9_-]+$/.test(id)) return null;
    ids[code] = id;
  }
  // Hai gói cùng một sản phẩm: trang Creem và hóa đơn ghi sai gói. Không bán còn hơn bán nhầm.
  if (new Set(Object.values(ids)).size !== PLAN_CODES.length) return null;
  return ids;
}

/**
 * Địa chỉ trang thanh toán ở dạng chuẩn hóa (`href` của WHATWG URL, cách app phân tích lại: chữ hoa, cổng 443 và dấu `\` đều thành
 * một dạng), hay null nếu không đúng https://checkout.creem.io không userinfo, không cổng lạ.
 */
function creemCheckoutUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const ok = url.protocol === "https:" && url.hostname === CREEM_CHECKOUT_HOST && url.port === "" && url.username === "" && url.password === "";
  return ok ? url.href : null;
}

/** ISO 8601 đầy đủ: ngày, giờ tới giây, phần lẻ của giây nếu có, và múi giờ (`Z` hay `±hh:mm`). */
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
/** Khoảng giờ trả hợp lý (giây Unix): từ 2020-01-01 tới trước 2100-01-01. Ngoài khoảng là dữ liệu lạ, không dùng. */
const PAID_AT_MIN = 1_577_836_800;
const PAID_AT_MAX = 4_102_444_800;

/**
 * Giờ khách trả (giây Unix, làm tròn xuống) từ `order.updated_at` của Creem, hay null nếu thiếu, sai dạng (không phải chuỗi ISO
 * 8601 đầy đủ có múi giờ, ngày không có thật) hay ngoài khoảng hợp lý. Đo ở sandbox ngày 2026-10-16 (spike S6,
 * test/fixtures/creem/): `order.created_at` là lúc khách MỞ trang thanh toán, `order.updated_at` là lúc trả (trùng giờ của giao
 * dịch, webhook `checkout.completed` tới khoảng 2 giây sau), và không đổi khi hoàn tiền. paymentTime() (orders.ts) vẫn kẹp kết quả
 * trong [lúc tạo đơn, lúc xử lý].
 */
function paidAtOf(order: Record<string, unknown>): number | null {
  const v = order.updated_at;
  if (typeof v !== "string") return null;
  const m = ISO_DATE_TIME.exec(v);
  if (!m) return null;
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  // Date.parse tự dời ngày không có thật (30/02 thành 02/03): đòi ngày tháng trong chuỗi khớp ngày đã dựng (theo UTC, hay theo
  // múi giờ của chuỗi thì cùng ngày tháng với phần ngày của chính chuỗi đó).
  const [, y, mo, d] = m;
  const offset = v.endsWith("Z") ? 0 : (v.at(-6) === "-" ? -1 : 1) * (Number(v.slice(-5, -3)) * 60 + Number(v.slice(-2)));
  const local = new Date(ms + offset * 60_000);
  if (local.getUTCFullYear() !== Number(y) || local.getUTCMonth() + 1 !== Number(mo) || local.getUTCDate() !== Number(d)) return null;
  const seconds = Math.floor(ms / 1000);
  return seconds >= PAID_AT_MIN && seconds < PAID_AT_MAX ? seconds : null;
}

/** Có mặt (không vắng, không null, không chuỗi rỗng): một trường giảm giá có mặt ở kiểu nào cũng là dấu hiệu giảm giá. */
function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}

/**
 * Kết quả của đơn có thể đã thu tiền: `order.status` là paid hay partially_refunded, hay không đọc được (lạ, thiếu, null:
 * `order.status`, A5d), ở bất kỳ trạng thái phiên nào. Chỉ phiên `completed` mới cấp được; phiên `pending`, `processing` hay
 * `expired` mà đơn đã thu tiền là mâu thuẫn và luôn bị giữ (`checkout.status`, A5c và A5d). Đơn không phải USD (`order.currency`)
 * cũng là dữ liệu hỏng. Cấp tự động chỉ khi mọi trường tiền đọc được,
 * không có dấu hiệu giảm giá và khách trả đủ giá (Q4, D6). Không bao giờ ném lỗi vì dữ liệu tiền (A5b): khách đã trả tiền thật, ném
 * lỗi thì đơn giữ `pending` rồi hết hạn sau 24 giờ mà không ai được báo. Thay vào đó đơn bị giữ (`underpaid`): fulfilOrder ghi nhật
 * ký và cảnh báo người vận hành (order_payment_review), người vận hành xem trên Creem rồi cấp tay hay hoàn tiền. Tên trường theo
 * OrderEntity và CheckoutEntity của OpenAPI.
 * - Dữ liệu hỏng: trường tiền (cent) có mặt mà không phải số nguyên >= 0 (`order.amount` thì bắt buộc), `order.discount` không phải
 *   chuỗi, hay `discount` của phiên không phải đối tượng (DiscountEntity) hay chuỗi. Giữ đơn với `amountPaid` 0 (không biết đã thu
 *   bao nhiêu); `amount` là giá đọc được đầu tiên (`sub_total`, rồi `amount`; không còn thì 0, fulfilOrder thấy lệch tiền: đơn
 *   `failed`); một dòng log `creem_malformed_paid_session` chỉ có tên trường, không chép giá trị.
 * - Dấu hiệu giảm giá: mã giảm giá của đơn (`order.discount`) hay của phiên (`discount`), hay số giảm (`discount_amount`) khác 0.
 * - Trả thiếu: phần đã trả thuộc về giá (`amount_paid`, trừ `tax_amount` nếu có) nhỏ hơn giá mong đợi (`custom_price` ta gửi lúc
 *   tạo phiên, thiếu thì `sub_total`, thiếu nữa thì `amount`). Trừ thuế thì mã giảm giá nhỏ hơn thuế không lọt qua (I-1), và phép so
 *   đúng dù `amount` của Creem có gồm thuế hay không (spike S1). Thiếu `amount_paid` thì không có phép so này.
 * Đơn bị giữ mang `amountPaid` là phần đã nhận thuộc về giá, kẹp trong [0, giá] (thiếu `amount_paid` thì 0: không ghi giá cho
 * một số chưa biết, I-3), và `reviewDetail` (số và cờ của Creem cho nhật ký; không chép mã giảm giá hay chữ nào của Creem).
 */
function paidOrderStatus(
  orderCode: number,
  providerRef: string,
  session: Record<string, unknown>,
  order: Record<string, unknown>,
): PaymentStatusResult {
  const malformed: string[] = [];
  /** Số tiền (cent): vắng hay null là chưa có (null), trừ trường bắt buộc; có mặt mà không phải số nguyên >= 0 thì ghi tên vào `malformed`. */
  const cents = (obj: Record<string, unknown>, key: string, name: string, required = false): number | null => {
    const v = obj[key];
    if (!required && (v === undefined || v === null)) return null;
    if (Number.isSafeInteger(v) && (v as number) >= 0) return v as number;
    malformed.push(name);
    return null;
  };
  // Phiên chưa hoàn tất (pending, processing, expired) mà đơn đã thu tiền: phiên mâu thuẫn (A5c, A5d). Trạng thái đơn không đọc
  // được: có thể đã thu tiền (A5d). Đơn không phải USD (kể cả "usd", thiếu): số tiền không so được với giá USD của ta. Đều là dữ
  // liệu hỏng: giữ đơn.
  if (session.status !== "completed") malformed.push("checkout.status");
  if (order.status !== "paid" && order.status !== "partially_refunded") malformed.push("order.status");
  if (order.currency !== "USD") malformed.push("order.currency");
  const amount = cents(order, "amount", "order.amount", true);
  const subTotal = cents(order, "sub_total", "order.sub_total");
  const tax = cents(order, "tax_amount", "order.tax_amount");
  if (present(order.discount) && typeof order.discount !== "string") malformed.push("order.discount");
  const discountAmount = cents(order, "discount_amount", "order.discount_amount");
  const paid = cents(order, "amount_paid", "order.amount_paid");
  const customPrice = cents(session, "custom_price", "checkout.custom_price");
  if (present(session.discount) && typeof session.discount !== "string" && !isRecord(session.discount)) malformed.push("checkout.discount");
  const review: ReviewDetail = {
    has_discount: present(order.discount) || present(session.discount) || (present(order.discount_amount) && order.discount_amount !== 0),
    ...(discountAmount === null ? {} : { provider_discount_amount: discountAmount }),
    ...(paid === null ? {} : { provider_amount_paid: paid }),
    ...(tax === null ? {} : { provider_tax_amount: tax }),
  };
  // Giá của đơn không gồm thuế (Creem cộng thuế ngoài giá): sub_total, thiếu thì amount. Dùng cho cả phép so khớp với giá ta bán
  // (`amount`) lẫn số đã nhận (`amountPaid`). `net` null chỉ khi `order.amount` hỏng (đã ghi vào `malformed`).
  const net = subTotal ?? amount;
  if (malformed.length > 0 || net === null) {
    console.warn(JSON.stringify({ event: "creem_malformed_paid_session", order_code: orderCode, provider_ref: providerRef, fields: malformed }));
    return { orderCode, status: "underpaid", amount: net ?? 0, amountPaid: 0, paidAt: null, reviewDetail: { ...review, provider_malformed_fields: malformed } };
  }
  const paidForPrice = paid === null ? null : paid - (tax ?? 0);
  // Ngưỡng không bao giờ thấp hơn giá niêm yết (M-1): `custom_price` Creem trả lại thấp hơn giá (0) không nới phép so.
  // Giờ trả: `order.updated_at` (paidAtOf, spike S6); đọc không được thì null và paymentTime() dùng lúc xử lý (QĐ33). Đơn bị giữ
  // (underpaid) không mang giờ trả: người vận hành cấp tay theo lúc cấp.
  if (!review.has_discount && (paidForPrice === null || paidForPrice >= Math.max(customPrice ?? net, net))) {
    return { orderCode, status: "paid", amount: net, amountPaid: net, paidAt: paidAtOf(order) };
  }
  const amountPaid = paidForPrice === null ? 0 : Math.max(0, Math.min(net, paidForPrice));
  return { orderCode, status: "underpaid", amount: net, amountPaid, paidAt: null, reviewDetail: review };
}

export class CreemProvider implements PaymentProvider {
  readonly name = "creem";

  constructor(
    private readonly cfg: CreemConfig,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {}

  /** Bán (tạo phiên mới) chỉ khi có mã sản phẩm; không có thì chỉ xử lý webhook, trạng thái và hoàn tiền của đơn đã có. */
  get sells(): boolean {
    return this.cfg.productIds !== undefined;
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    if (req.currency !== "USD") throw new PaymentProviderError(`Creem không nhận ${req.currency}`);
    const productId = this.cfg.productIds?.[req.plan];
    if (!productId) throw new PaymentProviderError(`Creem chưa có sản phẩm cho gói ${req.plan}`);
    if (!Number.isSafeInteger(req.amount) || req.amount < MIN_AMOUNT || req.amount > MAX_AMOUNT) {
      throw new PaymentProviderError(`Creem không nhận số tiền ${show(req.amount)} cent (chỉ ${MIN_AMOUNT} tới ${MAX_AMOUNT})`);
    }
    // `custom_price` (cent, từ 100) ghi đè giá của sản phẩm một lần: giá bán nằm ở PLANS của server, không ở dashboard Creem.
    const data = await this.call("POST", "/v1/checkouts", {
      product_id: productId,
      request_id: String(req.orderCode),
      custom_price: req.amount,
      success_url: req.returnUrl,
      customer: { email: req.email },
      metadata: { order_code: String(req.orderCode), plan: req.plan },
    });
    const { id, checkout_url: checkoutUrl } = data;
    if (typeof id !== "string" || typeof checkoutUrl !== "string") {
      throw new PaymentProviderError("Creem trả thiếu id hoặc checkout_url");
    }
    if (!CHECKOUT_ID.test(id)) throw new PaymentProviderError(`Creem trả id phiên không hợp lệ (${show(id)})`);
    const href = creemCheckoutUrl(checkoutUrl);
    if (href === null) throw new PaymentProviderError("Creem trả checkout_url ngoài tên miền thanh toán");
    // Creem trả lại `custom_price` (đo ở sandbox ngày 2026-10-16: đúng số đã gửi). Có mà khác số đã gửi hay sai kiểu (kể cả null):
    // trang thanh toán có thể đòi sai giá (ví dụ giá mặc định của sản phẩm), nên không đưa link cho khách, đơn lỗi. Vắng: vẫn nhận,
    // vì server chỉ cấp theo GET (paidOrderStatus so số khách trả với giá), chỉ để lại một dòng log không có dữ liệu của khách.
    if (!("custom_price" in data)) {
      console.warn(JSON.stringify({ event: "creem_checkout_no_custom_price", order_code: req.orderCode }));
    } else if (data.custom_price !== req.amount) {
      throw new PaymentProviderError(`Creem trả custom_price ${show(data.custom_price)} khác giá đã gửi (${req.amount} cent)`);
    }
    return { providerRef: id, checkoutUrl: href, qrCode: null };
  }

  /**
   * Thiếu secret webhook (cổng chỉ đọc của Worker admin; creemFromEnv không bao giờ dựng cổng như vậy cho Worker API) thì null
   * như sai chữ ký (verifyCreemWebhook với secret rỗng): route trả 400 và cảnh báo, không ném lỗi thành 500.
   */
  async verifyWebhook(req: WebhookRequest): Promise<WebhookEvent | "malformed" | null> {
    return verifyCreemWebhook(this.cfg.webhookSecret ?? "", req);
  }

  /** Đơn bị giữ (`underpaid`) mang thêm `reviewDetail` cho nhật ký của fulfilOrder (paidOrderStatus). */
  async getPaymentStatus(ref: { orderCode: number; providerRef: string | null }): Promise<PaymentStatusResult> {
    const { orderCode, providerRef } = ref;
    // Chuỗi rỗng cũng là chưa có: không bao giờ hỏi `checkout_id=` (Creem sẽ trả phiên nào đó hay lỗi mơ hồ).
    if (!providerRef) throw new PaymentProviderError(`Đơn ${orderCode} chưa có mã phiên Creem`);
    const data = await this.call("GET", `/v1/checkouts?checkout_id=${encodeURIComponent(providerRef)}`);
    // Phiên trả về phải đúng cái ta hỏi, và là phiên của đơn này: không khớp thì không bao giờ cấp (đó là phiên của đơn khác).
    if (data.id !== providerRef) throw new PaymentProviderError(`Creem trả phiên khác với phiên đã hỏi (id ${show(data.id)})`);
    // request_id do ta đặt khi tạo phiên (mã đơn dạng chuỗi). Phiên không có request_id (khách trả qua link công khai) khác hẳn
    // phiên của đơn khác: hai câu khác nhau để người vận hành biết đang tra cái gì.
    if (data.request_id === undefined || data.request_id === null) throw new PaymentProviderError("Creem trả phiên thiếu request_id");
    if (data.request_id !== String(orderCode)) throw new PaymentProviderError(`Creem trả request_id của đơn khác (${show(data.request_id)})`);
    // `order` vắng hay null là chưa có đơn; có mặt mà không phải đối tượng là dữ liệu hỏng: lỗi, không coi là chưa có đơn.
    if (data.order !== undefined && data.order !== null && !isRecord(data.order)) {
      throw new PaymentProviderError(`Creem trả order không phải đối tượng (${show(data.order)})`);
    }
    const order = isRecord(data.order) ? data.order : null;
    const session = data.status;
    if (session !== "pending" && session !== "processing" && session !== "expired" && session !== "completed") {
      throw new PaymentProviderError(`Creem trả trạng thái phiên không đọc được (${show(session)})`);
    }
    // Đơn có thể đã thu tiền (`order.status` paid, partially_refunded, hay không đọc được), ở mọi trạng thái phiên: paidOrderStatus
    // cấp khi phiên completed và mọi thứ đúng, còn lại giữ đơn (underpaid, cảnh báo). Không bao giờ ném lỗi (đơn hết hạn im lặng) hay
    // trả pending/processing/expired (đối soát để đơn của khách đã trả hết hạn sau 24 giờ).
    if (order !== null && order.status !== "pending" && order.status !== "refunded") return paidOrderStatus(orderCode, providerRef, data, order);
    // Từ đây chưa có đơn, đơn chưa thu tiền (pending) hay đã hoàn đủ (refunded). Phiên completed: refunded, hay đang xử lý (hỏi lại sau).
    const status: PaymentStatus = session === "completed" ? (order?.status === "refunded" ? "refunded" : "processing") : session;
    if (order === null) {
      // Chưa có đơn: giá là custom_price ta đã gửi lúc tạo phiên, và chưa nhận đồng nào.
      const price = data.custom_price;
      if (!Number.isSafeInteger(price)) throw new PaymentProviderError("Creem trả phiên không có custom_price");
      return { orderCode, status, amount: price as number, amountPaid: 0, paidAt: null };
    }
    // Đơn chưa thu tiền hay đã hoàn (refunded): không cấp nên dữ liệu tiền hỏng là lỗi như trước.
    if (order.currency !== "USD") throw new PaymentProviderError(`Creem trả đơn không phải USD (${show(order.currency)})`);
    if (!Number.isSafeInteger(order.amount)) throw new PaymentProviderError(`Creem trả số tiền đơn không đọc được (${show(order.amount)})`);
    // Giá của đơn không gồm thuế: sub_total, thiếu thì amount (như paidOrderStatus). `sub_total` có mặt mà sai kiểu là lỗi, không
    // thay lặng lẽ bằng `amount`.
    const net = optionalCents(order, "sub_total") ?? (order.amount as number);
    return { orderCode, status, amount: net, amountPaid: status === "refunded" ? net : 0, paidAt: null };
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<Record<string, unknown>> {
    const init: RequestInit = {
      method,
      headers: { "x-api-key": this.cfg.apiKey, "content-type": "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Không theo chuyển hướng: fetch của Workers gửi tiếp `x-api-key` (và thân, với 307 và 308) tới origin khác. Mọi 3xx thành
      // lỗi HTTP ở dưới (cùng cách với admin-ops.ts).
      redirect: "manual",
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.cfg.baseUrl}${path}`, init);
    } catch (err) {
      // Lỗi mạng hay quá thời gian chờ: bên gọi chỉ cần biết là không liên lạc được với cổng.
      throw unreachable(err);
    }
    // Chuyển hướng: lỗi có mã HTTP, không đọc thân (thân là của một địa chỉ ta không hỏi). Không phải unreachable: Creem đã trả lời.
    if (res.status >= 300 && res.status < 400) {
      throw new PaymentProviderError(`Creem chuyển hướng (HTTP ${res.status})`, undefined, res.status);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      // Hết thời gian chờ lúc ĐỌC thân cũng là không liên lạc được (như lúc nối), không phải "thân không phải JSON".
      if (isTimeout(err)) throw unreachable(err);
      throw new PaymentProviderError(`Creem trả HTTP ${res.status} không phải JSON`, undefined, res.status);
    }
    if (!res.ok) {
      // Mọi lỗi của Creem có `trace_id`: ghi lại để hỏi hỗ trợ; không ghi nội dung lỗi gốc (`message` có thể chứa dữ liệu của khách).
      const trace = isRecord(json) && typeof json.trace_id === "string" && TRACE_ID.test(json.trace_id) ? ` (trace_id ${json.trace_id})` : "";
      // Chỉ thân JSON kiểu Creem (đối tượng có `trace_id` dạng chuỗi) mới là lời của Creem: 401/403 của tường lửa hay CDN (HTML, JSON lạ)
      // không được tính là "khóa API bị từ chối" (isProviderAuthFailure). Thân không phải JSON đã ném ở trên (jsonBody mặc định false).
      const fromCreem = isRecord(json) && typeof json.trace_id === "string";
      throw new PaymentProviderError(`Creem lỗi HTTP ${res.status}${trace}`, undefined, res.status, false, fromCreem);
    }
    if (!isRecord(json)) throw new PaymentProviderError(`Creem trả thân JSON không phải đối tượng (HTTP ${res.status})`, undefined, res.status);
    return json;
  }
}

function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && err.name === "TimeoutError";
}

/** Lỗi không liên lạc được với Creem (mạng, hay quá thời gian chờ lúc nối hoặc lúc đọc thân). */
function unreachable(err: unknown): PaymentProviderError {
  if (isTimeout(err)) return new PaymentProviderError(`Creem không trả lời sau ${TIMEOUT_MS / 1000} giây`, undefined, undefined, true);
  return new PaymentProviderError(`Creem không trả lời (${String(err)})`, undefined, undefined, true);
}
