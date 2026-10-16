import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creemFromEnv } from "../src/deps";
import { CreemProvider } from "../src/payment/creem";
import { resetDb } from "./db";
import { TEST_CREEM_API_KEY, TEST_CREEM_PRODUCTS, TEST_CREEM_WEBHOOK_SECRET } from "./fakes";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

const usd = { plan: "monthly", email: " Buyer@Example.com ", consent: true, currency: "USD" };
const vnd = { plan: "monthly", email: "buyer@example.com", consent: true };

type World = ReturnType<typeof makeWorld>;

/**
 * Thay cổng creem của thế giới bằng cổng dựng từ biến môi trường như production (creemFromEnv: dây nối thật), có khóa API và
 * secret webhook, với mã sản phẩm `productIds` (patch trong bộ nhớ, không đọc hay sửa wrangler.jsonc). Cổng gọi FakeCreem của
 * thế giới qua fetch toàn cục.
 */
function creemFromVars(w: World, productIds: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => w.creem.fetch(String(input), init));
  const gate = creemFromEnv({
    CREEM_BASE_URL: "https://creem.test",
    CREEM_API_KEY: TEST_CREEM_API_KEY,
    CREEM_WEBHOOK_SECRET: TEST_CREEM_WEBHOOK_SECRET,
    CREEM_PRODUCT_IDS: productIds,
  });
  if (!gate) throw new Error("có khóa API và secret webhook thì phải có cổng creem");
  w.deps.payments.creem = gate;
  return gate;
}

const pricesOf = (body: Record<string, unknown>) => (body.plans as { code: string; prices: Record<string, number> }[]).map((p) => [p.code, p.prices]);

describe("POST /v1/checkout với currency USD (Creem)", () => {
  it("tạo đơn Creem: request_id là mã đơn, giá 399 cent, link của Creem, không có mã QR, hạn 30 phút", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", usd);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      order_code: 1,
      provider: "creem",
      checkout_url: "https://checkout.creem.io/ch_fake1",
      qr_code: null,
      plan: "monthly",
      amount: 399,
      currency: "USD",
      expires_at: T0 + 30 * 60,
    });
    expect(res.body.order_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.creem.requests[0]?.body).toEqual({
      product_id: "prod_monthly",
      request_id: "1",
      custom_price: 399,
      success_url: "https://license.test/v1/pay/return",
      customer: { email: "buyer@example.com" },
      metadata: { order_code: "1", plan: "monthly" },
    });
    expect(w.payos.requests).toHaveLength(0);
    const row = await env.DB.prepare("SELECT * FROM orders WHERE order_code = 1").first<Record<string, unknown>>();
    expect(row).toMatchObject({
      provider: "creem",
      provider_ref: "ch_fake1",
      plan: "monthly",
      amount: 399,
      currency: "USD",
      email: "buyer@example.com",
      email_consent_at: T0,
      status: "pending",
      expires_at: T0 + 30 * 60,
    });
  });

  it.each([
    ["monthly", 399],
    ["six_months", 2199],
    ["yearly", 3999],
  ])("gói %s: giá %i cent lấy từ biến PLANS", async (plan, amount) => {
    const res = await makeWorld().call("POST", "/v1/checkout", { ...usd, plan });
    expect(res).toMatchObject({ status: 201, body: { plan, amount, currency: "USD" } });
  });

  it("đổi giá USD trong PLANS là đổi giá bán và custom_price gửi Creem, không cần sửa code", async () => {
    const plans = structuredClone(env.PLANS) as Record<string, { prices: Record<string, number> }>;
    plans.yearly!.prices.USD = 3499;
    const w = makeWorld({ PLANS: plans });
    const res = await w.call("POST", "/v1/checkout", { ...usd, plan: "yearly" });
    expect(res).toMatchObject({ status: 201, body: { plan: "yearly", amount: 3499, currency: "USD" } });
    expect(w.creem.requests[0]?.body).toMatchObject({ product_id: "prod_yearly", custom_price: 3499 });
  });

  it("app cũ không gửi currency: vẫn PayOS và VND, có mã VietQR, Creem không bị gọi", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", vnd);
    expect(res.body).toMatchObject({ provider: "payos", currency: "VND", amount: 50000, expires_at: T0 + 900 });
    expect(typeof res.body.qr_code).toBe("string");
    expect(w.creem.requests).toHaveLength(0);
    expect((await w.call("POST", "/v1/checkout", { ...vnd, currency: "VND" })).body).toMatchObject({ provider: "payos", currency: "VND" });
  });

  it.each([["EUR"], ["usd"], [""], [5], [null], [["USD"]]])("currency %j sai: 400, không tạo đơn, không gọi cổng nào", async (currency) => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", { ...usd, currency });
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_request", field: "currency" } });
    expect(w.creem.requests).toHaveLength(0);
    expect(w.payos.requests).toHaveLength(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first()).toEqual({ n: 0 });
  });

  it("Creem chưa bật (không có cổng creem): 503 pricing_not_configured, không tạo đơn; PayOS vẫn bán bình thường", async () => {
    const w = makeWorld();
    delete w.deps.payments.creem;
    expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first()).toEqual({ n: 0 });
    expect((await w.call("POST", "/v1/checkout", vnd)).status).toBe(201);
  });

  it("Creem chỉ xử lý (CREEM_PRODUCT_IDS rỗng: tắt bán thẻ khẩn cấp): không chào USD, POST USD 503 không tạo đơn; đơn Creem đang chờ vẫn được cấp và hoàn tiền vẫn ghi nhận qua webhook", async () => {
    const w = makeWorld();
    // Hai đơn tạo lúc còn bán thẻ: một đơn đã cấp, một đơn khách chưa trả.
    const sold = await w.buyCreem();
    const open = await w.call("POST", "/v1/checkout", usd);
    expect(open.status).toBe(201);
    const openCode = open.body.order_code as number;
    const openCheckout = w.creem.checkoutIdOf(openCode);

    const gate = creemFromVars(w, { monthly: "", six_months: "", yearly: "" });
    const asked = w.creem.requests.length;
    expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
    expect(w.creem.requests).toHaveLength(asked);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first()).toEqual({ n: 2 });
    const plans = await w.call("GET", "/v1/plans?plans=monthly,six_months,yearly", undefined, { "cf-ipcountry": "DE" });
    expect(plans.body.suggested_currency).toBe("VND");
    expect(pricesOf(plans.body)).toEqual([
      ["monthly", { VND: 50000 }],
      ["six_months", { VND: 269000 }],
      ["yearly", { VND: 500000 }],
    ]);

    // Khách trả đơn đang chờ sau khi tắt bán: webhook (ký đúng) vẫn được kiểm và đơn vẫn được cấp.
    w.creem.pay(openCheckout);
    const paid = await w.creem.completedWebhook(openCheckout);
    expect((await w.call("POST", "/v1/webhooks/creem", paid.raw, paid.headers)).status).toBe(200);
    expect((await w.getOrder(openCode, open.body.order_token as string)).body).toMatchObject({ status: "paid" });
    // Hoàn tiền của đơn đã cấp vẫn ghi nhận (không 404 rồi mất sau năm lần Creem gửi lại).
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const refund = await w.creem.refundWebhook(sold.checkoutId);
    expect(await w.call("POST", "/v1/webhooks/creem", refund.raw, refund.headers)).toMatchObject({ status: 200, body: { result: "refunded" } });
    expect(await env.DB.prepare("SELECT status FROM orders WHERE order_code = ?").bind(sold.orderCode).first()).toEqual({ status: "refunded" });
    expect((await w.call("POST", "/v1/checkout", vnd)).status).toBe(201);
    expect(gate.sells).toBe(false);
  });

  it("Creem dựng từ biến môi trường với ba mã prod_… khác nhau (như khi điền mã thật): bán USD với mã sản phẩm của gói", async () => {
    const w = makeWorld();
    expect(creemFromVars(w, { ...TEST_CREEM_PRODUCTS }).sells).toBe(true);
    const plans = await w.call("GET", "/v1/plans?plans=monthly,six_months,yearly", undefined, { "cf-ipcountry": "DE" });
    expect(plans.body.suggested_currency).toBe("USD");
    expect(pricesOf(plans.body)).toEqual([
      ["monthly", { VND: 50000, USD: 399 }],
      ["six_months", { VND: 269000, USD: 2199 }],
      ["yearly", { VND: 500000, USD: 3999 }],
    ]);
    const res = await w.call("POST", "/v1/checkout", { ...usd, plan: "six_months" });
    expect(res).toMatchObject({ status: 201, body: { provider: "creem", amount: 2199, currency: "USD" } });
    expect(w.creem.requests.at(-1)?.body).toMatchObject({ product_id: TEST_CREEM_PRODUCTS.six_months, custom_price: 2199 });
  });

  it("bảng gói không có giá USD: 503 pricing_not_configured cho USD, VND vẫn bán", async () => {
    const plans = structuredClone(env.PLANS) as Record<string, { prices: Record<string, number> }>;
    for (const p of Object.values(plans)) delete p.prices.USD;
    const w = makeWorld({ PLANS: plans });
    expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
    expect((await w.call("POST", "/v1/checkout", vnd)).status).toBe(201);
  });

  it("Creem lỗi: 502 payment_provider_error và đơn chuyển failed", async () => {
    const w = makeWorld();
    w.creem.down = true;
    expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
    const row = await env.DB.prepare("SELECT status, provider FROM orders WHERE order_code = 1").first();
    expect(row).toEqual({ status: "failed", provider: "creem" });
  });

  it("(SP2) Creem tạo phiên mà trả lại custom_price khác giá đã gửi (999 thay 399): 502 payment_provider_error, đơn failed, phản hồi không có link thanh toán", async () => {
    const w = makeWorld();
    w.deps.payments.creem = new CreemProvider(
      { baseUrl: "https://creem.test", apiKey: TEST_CREEM_API_KEY, webhookSecret: TEST_CREEM_WEBHOOK_SECRET, productIds: { ...TEST_CREEM_PRODUCTS } },
      async (url, init) => {
        const res = await w.creem.fetch(url, init);
        if ((init?.method ?? "GET") !== "POST") return res;
        const body = (await res.json()) as Record<string, unknown>;
        return new Response(JSON.stringify({ ...body, custom_price: 999 }), { status: res.status, headers: { "content-type": "application/json" } });
      },
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await w.call("POST", "/v1/checkout", usd);
    expect(res).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
    expect(JSON.stringify(res.body)).not.toMatch(/checkout_url|creem\.io/);
    const row = await env.DB.prepare("SELECT status, provider FROM orders WHERE order_code = 1").first();
    expect(row).toEqual({ status: "failed", provider: "creem" });
  });

  it("đổi gói bằng USD: ước tính theo bảng giá USD (Monthly còn 20 ngày mua 6 Months: quy đổi 21 ngày; bảng VND sẽ cho 22)", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy({ plan: "monthly" });
    w.clock.now = T0 + 10 * DAY;
    const res = await w.call("POST", "/v1/checkout", { plan: "six_months", email: "buyer@example.com", consent: true, license_key: licenseKey, currency: "USD" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ provider: "creem", amount: 2199, currency: "USD", converted_days: 21 });
    expect(res.body.license_expires_at).toBe(T0 + 10 * DAY + 180 * DAY + 21 * DAY);
    const created = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'order_created' AND order_code = ?")
      .bind(res.body.order_code)
      .first<{ detail: string }>();
    expect(JSON.parse(created!.detail)).toEqual({ plan: "six_months", amount: 2199, currency: "USD" });
  });
});

describe("GET /v1/plans: loại tiền bán được", () => {
  const asVietnam = { "cf-ipcountry": "VN" };
  const asGermany = { "cf-ipcountry": "DE" };

  it("Creem bật: giá có cả VND và USD; gợi ý VND khi không biết nước hay ở Việt Nam, USD ở nước khác", async () => {
    const w = makeWorld();
    const unknown = await w.call("GET", "/v1/plans?plans=monthly,six_months,yearly");
    expect(unknown.body.suggested_currency).toBe("VND");
    const plans = unknown.body.plans as { code: string; prices: Record<string, number> }[];
    expect(plans.map((p) => [p.code, p.prices])).toEqual([
      ["monthly", { VND: 50000, USD: 399 }],
      ["six_months", { VND: 269000, USD: 2199 }],
      ["yearly", { VND: 500000, USD: 3999 }],
    ]);
    expect((await w.call("GET", "/v1/plans", undefined, asVietnam)).body.suggested_currency).toBe("VND");
    expect((await w.call("GET", "/v1/plans", undefined, asGermany)).body.suggested_currency).toBe("USD");
    expect((await w.call("GET", "/v1/plans", undefined, { "cf-ipcountry": "XX" })).body.suggested_currency).toBe("VND");
  });

  it("Creem chưa bật: không trả giá USD dù PLANS có, và luôn gợi ý VND", async () => {
    const w = makeWorld();
    delete w.deps.payments.creem;
    const res = await w.call("GET", "/v1/plans?plans=monthly,six_months,yearly", undefined, asGermany);
    expect(res.body.suggested_currency).toBe("VND");
    const plans = res.body.plans as { prices: Record<string, number> }[];
    expect(plans).toHaveLength(3);
    for (const p of plans) expect(Object.keys(p.prices)).toEqual(["VND"]);
  });

  it("Creem bán được mà PLANS không có giá USD: không chào USD, gợi ý VND cả ở nước khác; POST USD 503", async () => {
    const plans = structuredClone(env.PLANS) as Record<string, { prices: Record<string, number> }>;
    for (const p of Object.values(plans)) delete p.prices.USD;
    const w = makeWorld({ PLANS: plans });
    expect(w.deps.payments.creem?.sells).toBe(true);
    const res = await w.call("GET", "/v1/plans?plans=monthly,six_months,yearly", undefined, asGermany);
    expect(res.body.suggested_currency).toBe("VND");
    expect(pricesOf(res.body)).toEqual([
      ["monthly", { VND: 50000 }],
      ["six_months", { VND: 269000 }],
      ["yearly", { VND: 500000 }],
    ]);
    expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
    expect(w.creem.requests).toHaveLength(0);
  });

  it("nước lấy từ request.cf trước header cf-ipcountry (cf ở Đức, header ở Việt Nam: gợi ý USD)", async () => {
    const w = makeWorld();
    const ctx = createExecutionContext();
    const req = new Request("https://license.test/v1/plans", {
      cf: { country: "DE" } as unknown as IncomingRequestCfProperties,
      headers: { "cf-ipcountry": "VN", "cf-connecting-ip": "203.0.113.10" },
    });
    const res = await w.app.fetch(req, w.env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { suggested_currency: string }).suggested_currency).toBe("USD");
  });

  it("app cũ (không có ?plans=): vẫn hai gói cũ, giá VND đọc được như trước (có thêm USD mà app cũ không đọc)", async () => {
    const res = await makeWorld().call("GET", "/v1/plans");
    const plans = res.body.plans as { code: string; prices: Record<string, number> }[];
    expect(plans.map((p) => p.code)).toEqual(["monthly", "yearly"]);
    expect(plans.map((p) => p.prices.VND)).toEqual([50000, 500000]);
  });
});
