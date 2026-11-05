import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatLicenseKey, generateLicenseKey } from "../src/license-key";
import { CreemProvider } from "../src/payment/creem";
import { enqueueExpiryReminders } from "../src/reminders";
import { resetDb } from "./db";
import { TEST_CREEM_API_KEY, TEST_CREEM_SUBSCRIPTION_PRODUCTS, TEST_CREEM_WEBHOOK_SECRET, TEST_CREEM_PRODUCTS } from "./fakes";
import { DAY, makeWorld, T0 } from "./world";

// Tự động gia hạn Creem (spec 2026-11-05-creem-tu-dong-gia-han-design.md). Creem giả ở mức HTTP (test/fakes.ts); hình dạng payload
// thuê bao CHƯA đo ở Creem thật (spec mục 9, U1 tới U7), nên test dùng hình dạng theo tài liệu và thử cả ba dạng của hạn kỳ.

beforeEach(resetDb);

type World = ReturnType<typeof makeWorld>;

/** Thế giới có bán thuê bao: cổng Creem có thêm ba mã sản phẩm thuê bao (như khi CREEM_AUTO_RENEW bật và đủ mã, deps.ts). */
function subWorld(envOverride: Parameters<typeof makeWorld>[0] = {}) {
  const w = makeWorld(envOverride);
  w.deps.payments.creem = new CreemProvider(
    {
      baseUrl: "https://creem.test",
      apiKey: TEST_CREEM_API_KEY,
      webhookSecret: TEST_CREEM_WEBHOOK_SECRET,
      productIds: { ...TEST_CREEM_PRODUCTS },
      subscriptionProductIds: { ...TEST_CREEM_SUBSCRIPTION_PRODUCTS },
    },
    w.creem.fetch,
  );
  return w;
}

/** 2026-11-01, 2026-12-01, 2027-01-01: hết kỳ thật của thuê bao tháng bắt đầu 2026-10-01 (T0). Kỳ dài 31, 30, 31 ngày, không phải 30. */
const P1 = T0 + 31 * DAY;
const P2 = T0 + 61 * DAY;
const P3 = T0 + 92 * DAY;

const usd = { plan: "monthly", email: "buyer@example.com", consent: true, currency: "USD" };

/** Mua kỳ đầu của một thuê bao: checkout `auto_renew`, khách trả, Creem gửi `checkout.completed`. */
async function subscribe(w: World, o: { plan?: string; email?: string; periodEnd?: number; licenseKey?: string } = {}) {
  const co = await w.call("POST", "/v1/checkout", {
    ...usd,
    plan: o.plan ?? "monthly",
    email: o.email ?? usd.email,
    auto_renew: true,
    ...(o.licenseKey ? { license_key: o.licenseKey } : {}),
  });
  if (co.status !== 201) throw new Error(`checkout ${co.status} ${JSON.stringify(co.body)}`);
  const orderCode = co.body.order_code as number;
  const token = co.body.order_token as string;
  const checkoutId = w.creem.checkoutIdOf(orderCode);
  const subId = w.creem.paySubscription(checkoutId, o.periodEnd ?? P1);
  const hook = await w.creem.completedWebhook(checkoutId);
  const wh = await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
  if (wh.status !== 200 || wh.body.result !== "granted") throw new Error(`webhook ${wh.status} ${JSON.stringify(wh.body)}`);
  const order = await w.getOrder(orderCode, token);
  const licenseKey = order.body.license_key as string;
  const licenseId = (await env.DB.prepare("SELECT license_id FROM orders WHERE order_code = ?").bind(orderCode).first<{ license_id: string }>())!.license_id;
  return { orderCode, token, checkoutId, subId, licenseKey, licenseId };
}

/** Creem gửi một sự kiện thuê bao đã ký; trả phản hồi của route. */
async function sendSub(w: World, subId: string, eventType: string, opts: Parameters<World["creem"]["subscriptionWebhook"]>[2] = {}) {
  const hook = await w.creem.subscriptionWebhook(subId, eventType, { createdAt: w.clock.now, ...opts });
  return w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
}

const sub = (subId: string) =>
  env.DB.prepare("SELECT provider_ref, license_id, plan, customer_ref, status, paid_through, last_event_at FROM subscriptions WHERE provider_ref = ?")
    .bind(subId)
    .first<{ provider_ref: string; license_id: string; plan: string; customer_ref: string | null; status: string; paid_through: number; last_event_at: number }>();
const licenseExpiry = (licenseId: string) => env.DB.prepare("SELECT expires_at FROM licenses WHERE id = ?").bind(licenseId).first<{ expires_at: number }>().then((r) => r?.expires_at);
const ordersOf = (licenseId: string) =>
  env.DB.prepare("SELECT provider_ref, plan, amount, amount_paid, currency, status, auto_renew FROM orders WHERE license_id = ? OR renew_license_id = ? ORDER BY order_code")
    .bind(licenseId, licenseId)
    .all<{ provider_ref: string | null; plan: string; amount: number; amount_paid: number | null; currency: string; status: string; auto_renew: number }>()
    .then((r) => r.results);
const alertKinds = () => env.DB.prepare("SELECT kind FROM ops_alerts ORDER BY kind").all<{ kind: string }>().then((r) => r.results.map((x) => x.kind));
const auditActions = (action: string) =>
  env.DB.prepare("SELECT detail FROM audit_log WHERE action = ? ORDER BY id")
    .bind(action)
    .all<{ detail: string }>()
    .then((r) => r.results.map((x) => JSON.parse(x.detail) as Record<string, unknown>));

describe("tạo đơn thuê bao: GET /v1/plans và POST /v1/checkout", () => {
  it("auto_renew_available: false khi cổng không có sản phẩm thuê bao, true khi có", async () => {
    expect((await makeWorld().call("GET", "/v1/plans")).body.auto_renew_available).toBe(false);
    expect((await subWorld().call("GET", "/v1/plans")).body.auto_renew_available).toBe(true);
  });

  it("auto_renew_available: false khi USD không bán được (PLANS thiếu giá USD), dù có sản phẩm thuê bao", async () => {
    const plans = JSON.stringify({
      monthly: { name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } },
      six_months: { name: "6 Months", quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000 } },
      yearly: { name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } },
    });
    expect((await subWorld({ PLANS: JSON.parse(plans) }).call("GET", "/v1/plans")).body.auto_renew_available).toBe(false);
  });

  it("auto_renew: true dùng sản phẩm thuê bao, không gửi custom_price, ghi auto_renew vào đơn, nhật ký và phản hồi", async () => {
    const w = subWorld();
    const res = await w.call("POST", "/v1/checkout", { ...usd, auto_renew: true });
    expect(res).toMatchObject({ status: 201, body: { auto_renew: true } });
    const create = w.creem.requests.find((r) => r.path === "/v1/checkouts" && r.method === "POST")!;
    expect(create.body).toMatchObject({ product_id: TEST_CREEM_SUBSCRIPTION_PRODUCTS.monthly, metadata: { plan: "monthly", auto_renew: "1" } });
    expect(create.body).not.toHaveProperty("custom_price");
    const code = res.body.order_code as number;
    expect(await env.DB.prepare("SELECT auto_renew FROM orders WHERE order_code = ?").bind(code).first()).toEqual({ auto_renew: 1 });
    expect(await auditActions("order_created")).toMatchObject([{ plan: "monthly", amount: 399, currency: "USD", auto_renew: true }]);
  });

  it("không gửi auto_renew (app cũ): đơn một lần với sản phẩm cũ và custom_price, auto_renew 0, phản hồi auto_renew false", async () => {
    const w = subWorld();
    const res = await w.call("POST", "/v1/checkout", usd);
    expect(res).toMatchObject({ status: 201, body: { auto_renew: false } });
    const create = w.creem.requests.find((r) => r.method === "POST")!;
    expect(create.body).toMatchObject({ product_id: TEST_CREEM_PRODUCTS.monthly, custom_price: 399 });
    expect(create.body).not.toHaveProperty("metadata.auto_renew");
    expect(await env.DB.prepare("SELECT auto_renew FROM orders").first()).toEqual({ auto_renew: 0 });
  });

  it("auto_renew: false rõ ràng cũng là đơn một lần", async () => {
    const w = subWorld();
    expect((await w.call("POST", "/v1/checkout", { ...usd, auto_renew: false })).status).toBe(201);
    expect(await env.DB.prepare("SELECT auto_renew FROM orders").first()).toEqual({ auto_renew: 0 });
  });

  it("auto_renew không phải boolean: 400 invalid_request, không tạo đơn", async () => {
    const w = subWorld();
    for (const bad of ["true", 1, null, {}]) {
      expect(await w.call("POST", "/v1/checkout", { ...usd, auto_renew: bad })).toMatchObject({ status: 400, body: { error: "invalid_request", field: "auto_renew" } });
    }
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first<{ n: number }>())?.n).toBe(0);
  });

  it("auto_renew với VND (PayOS trả trước một lần): 400, không tạo đơn", async () => {
    const w = subWorld();
    const res = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "a@example.com", consent: true, currency: "VND", auto_renew: true });
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_request", field: "auto_renew" } });
    expect(w.payos.requests).toHaveLength(0);
  });

  it("server chưa bật thuê bao: auto_renew true thì 409 auto_renew_unavailable, không tạo đơn, không gọi Creem", async () => {
    const w = makeWorld();
    expect(await w.call("POST", "/v1/checkout", { ...usd, auto_renew: true })).toMatchObject({ status: 409, body: { error: "auto_renew_unavailable" } });
    expect(w.creem.requests).toHaveLength(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first<{ n: number }>())?.n).toBe(0);
  });

  it("Creem không nhận sản phẩm thuê bao (lỗi cấu hình): 502, đơn failed, không đưa link", async () => {
    const w = subWorld();
    w.creem.createFailures = [400];
    const res = await w.call("POST", "/v1/checkout", { ...usd, auto_renew: true });
    expect(res.status).toBe(502);
    expect(await env.DB.prepare("SELECT status, auto_renew FROM orders").first()).toEqual({ status: "failed", auto_renew: 1 });
  });

  it("license đang có thuê bao còn hiệu lực: mua thêm bị chặn 409 subscription_active (tránh trả hai lần), kể cả mua gói khác", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    for (const extra of [{}, { auto_renew: true }, { plan: "yearly" }]) {
      const res = await w.call("POST", "/v1/checkout", { ...usd, license_key: s.licenseKey, ...extra });
      expect(res).toMatchObject({ status: 409, body: { error: "subscription_active" } });
    }
    // VND qua PayOS cũng bị chặn: cùng license đang được Creem tự trừ tiền.
    expect(
      await w.call("POST", "/v1/checkout", { plan: "monthly", email: "buyer@example.com", consent: true, currency: "VND", license_key: s.licenseKey }),
    ).toMatchObject({ status: 409, body: { error: "subscription_active" } });
  });

  it.each(["canceled", "expired"])("thuê bao đã %s thì license mua lại được", async (status) => {
    const w = subWorld();
    const s = await subscribe(w);
    await env.DB.prepare("UPDATE subscriptions SET status = ? WHERE provider_ref = ?").bind(status, s.subId).run();
    expect((await w.call("POST", "/v1/checkout", { ...usd, license_key: s.licenseKey })).status).toBe(201);
  });

  it("thuê bao đang hủy cuối kỳ (scheduled_cancel) vẫn cho mua lại: khách đã chọn dừng tự gia hạn", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    await env.DB.prepare("UPDATE subscriptions SET status = 'scheduled_cancel' WHERE provider_ref = ?").bind(s.subId).run();
    expect((await w.call("POST", "/v1/checkout", { ...usd, license_key: s.licenseKey })).status).toBe(201);
  });
});

describe("kỳ đầu: đơn đầu cấp license rồi gắn thuê bao", () => {
  it("khách trả kỳ đầu: license 30 ngày như mọi đơn, thuê bao ghi đúng mã, gói, mã khách, hết kỳ; nhật ký subscription_linked", async () => {
    const w = subWorld();
    w.clock.now = T0 + 120;
    const s = await subscribe(w);
    expect(await licenseExpiry(s.licenseId)).toBe(T0 + 120 + 30 * DAY);
    expect(await sub(s.subId)).toMatchObject({ license_id: s.licenseId, plan: "monthly", customer_ref: "cust_fake", status: "active", paid_through: P1 });
    expect(await auditActions("subscription_linked")).toMatchObject([{ subscription: s.subId, plan: "monthly", period_end: P1, period_end_estimated: false }]);
    expect(await ordersOf(s.licenseId)).toEqual([{ provider_ref: s.checkoutId, plan: "monthly", amount: 399, amount_paid: 399, currency: "USD", status: "paid", auto_renew: 1 }]);
    expect(w.resend.sent).toHaveLength(1);
  });

  it("đối soát (không có webhook) cũng ghi thuê bao: GET phiên mang đối tượng subscription", async () => {
    const w = subWorld();
    const co = await w.call("POST", "/v1/checkout", { ...usd, auto_renew: true });
    const orderCode = co.body.order_code as number;
    const subId = w.creem.paySubscription(w.creem.checkoutIdOf(orderCode), P1);
    w.clock.now = T0 + 3600;
    const { reconcile } = await import("../src/reconcile");
    await reconcile(w.env, w.deps);
    expect(await env.DB.prepare("SELECT status FROM orders WHERE order_code = ?").bind(orderCode).first()).toEqual({ status: "paid" });
    expect(await sub(subId)).toMatchObject({ status: "active", paid_through: P1 });
  });

  it("webhook checkout.completed gửi lại: không tạo thuê bao thứ hai, không đổi gì", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    const hook = await w.creem.completedWebhook(s.checkoutId);
    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { result: "already_paid" } });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions").first<{ n: number }>())?.n).toBe(1);
    expect(await auditActions("subscription_linked")).toHaveLength(1);
  });

  it("giá catalog của sản phẩm thuê bao lệch giá PLANS: đơn đầu không được cấp (underpaid/failed), không có thuê bao", async () => {
    const w = subWorld();
    const co = await w.call("POST", "/v1/checkout", { ...usd, auto_renew: true });
    const orderCode = co.body.order_code as number;
    const checkoutId = w.creem.checkoutIdOf(orderCode);
    w.creem.paySubscription(checkoutId, P1);
    w.creem.setOrderAmount(checkoutId, 299); // catalog Creem rẻ hơn PLANS
    const hook = await w.creem.completedWebhook(checkoutId);
    const wh = await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
    expect(wh.body.result).not.toBe("granted");
    expect((await env.DB.prepare("SELECT status FROM orders WHERE order_code = ?").bind(orderCode).first<{ status: string }>())?.status).not.toBe("paid");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions").first<{ n: number }>())?.n).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses").first<{ n: number }>())?.n).toBe(0);
  });
});

describe("subscription.paid: gia hạn từng kỳ", () => {
  it("lần subscription.paid của kỳ đầu (cùng hạn kỳ): không cấp thêm, không đơn mới, không thêm email", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    const before = await licenseExpiry(s.licenseId);
    expect(await sendSub(w, s.subId, "subscription.paid", { periodEnd: P1 })).toMatchObject({ status: 200, body: { ok: true, result: "same_period" } });
    expect(await licenseExpiry(s.licenseId)).toBe(before);
    expect(await ordersOf(s.licenseId)).toHaveLength(1);
    expect(w.resend.sent).toHaveLength(1);
  });

  it("kỳ thứ hai: license hết hạn = hết kỳ + 3 ngày gia hạn (không cộng 30 ngày), đơn gia hạn paid, một email, paid_through tiến", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    w.clock.now = P1 + 60;
    const res = await sendSub(w, s.subId, "subscription.paid", { periodEnd: P2 });
    expect(res).toMatchObject({ status: 200, body: { ok: true, result: "renewed" } });
    expect(await licenseExpiry(s.licenseId)).toBe(P2 + 3 * DAY);
    expect(await ordersOf(s.licenseId)).toEqual([
      { provider_ref: s.checkoutId, plan: "monthly", amount: 399, amount_paid: 399, currency: "USD", status: "paid", auto_renew: 1 },
      { provider_ref: `${s.subId}@${P2}`, plan: "monthly", amount: 399, amount_paid: 399, currency: "USD", status: "paid", auto_renew: 1 },
    ]);
    expect((await sub(s.subId))?.paid_through).toBe(P2);
    expect(await auditActions("subscription_renewed")).toMatchObject([{ subscription: s.subId, period_end: P2, expires_at: P2 + 3 * DAY }]);
    expect(w.resend.sent).toHaveLength(2);
    expect(w.resend.sent[1]!.to).toEqual(["buyer@example.com"]);
    expect(await alertKinds()).toEqual([]);
  });

  it("ba kỳ liên tiếp: hạn luôn bằng hết kỳ + 3 ngày, không trôi theo độ dài tháng (31, 30, 31 ngày)", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    w.clock.now = P1;
    await sendSub(w, s.subId, "subscription.paid", { periodEnd: P2 });
    w.clock.now = P2;
    await sendSub(w, s.subId, "subscription.paid", { periodEnd: P3 });
    expect(await licenseExpiry(s.licenseId)).toBe(P3 + 3 * DAY);
    expect((await ordersOf(s.licenseId)).map((o) => o.provider_ref)).toEqual([s.checkoutId, `${s.subId}@${P2}`, `${s.subId}@${P3}`]);
  });

  it("Creem gửi lại cùng sự kiện (cùng mã, cùng kỳ): chỉ một đơn gia hạn, một email, hạn không đổi", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    w.clock.now = P1 + 60;
    const hook = await w.creem.subscriptionWebhook(s.subId, "subscription.paid", { periodEnd: P2, createdAt: w.clock.now, eventId: "evt_renew_1" });
    const first = await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
    const expires = await licenseExpiry(s.licenseId);
    w.clock.now = P1 + 3600;
    const again = await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
    expect(first.body.result).toBe("renewed");
    expect(again).toMatchObject({ status: 200, body: { result: "same_period" } });
    expect(await ordersOf(s.licenseId)).toHaveLength(2);
    expect(await licenseExpiry(s.licenseId)).toBe(expires);
    expect(w.resend.sent).toHaveLength(2);
  });

  it("hai lần giao chạy chồng nhau cho cùng một kỳ: vẫn đúng một đơn gia hạn và một lần cấp", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    w.clock.now = P1 + 60;
    const a = await w.creem.subscriptionWebhook(s.subId, "subscription.paid", { periodEnd: P2, createdAt: w.clock.now });
    const b = await w.creem.subscriptionWebhook(s.subId, "subscription.paid", { periodEnd: P2, createdAt: w.clock.now });
    const [ra, rb] = await Promise.all([
      w.call("POST", "/v1/webhooks/creem", a.raw, a.headers),
      w.call("POST", "/v1/webhooks/creem", b.raw, b.headers),
    ]);
    expect([ra.status, rb.status]).toEqual([200, 200]);
    const renewals = (await ordersOf(s.licenseId)).filter((o) => o.provider_ref === `${s.subId}@${P2}`);
    expect(renewals).toHaveLength(1);
    expect(renewals[0]!.status).toBe("paid");
    expect(await licenseExpiry(s.licenseId)).toBe(P2 + 3 * DAY);
  });

  it("sự kiện kỳ cũ tới sau kỳ mới (sai thứ tự): không cấp, không lùi hạn", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    w.clock.now = P2;
    await sendSub(w, s.subId, "subscription.paid", { periodEnd: P3 });
    const expires = await licenseExpiry(s.licenseId);
    expect(await sendSub(w, s.subId, "subscription.paid", { periodEnd: P2 })).toMatchObject({ body: { result: "same_period" } });
    expect(await licenseExpiry(s.licenseId)).toBe(expires);
    expect((await sub(s.subId))?.paid_through).toBe(P3);
    expect(await ordersOf(s.licenseId)).toHaveLength(2);
  });

  it("khách vừa mua tay gia hạn sớm hơn hạn kỳ + 3 ngày: hạn mới là lớn hơn của hai, không bao giờ rút ngắn", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    await env.DB.prepare("UPDATE licenses SET expires_at = ? WHERE id = ?").bind(P2 + 20 * DAY, s.licenseId).run();
    w.clock.now = P1;
    await sendSub(w, s.subId, "subscription.paid", { periodEnd: P2 });
    expect(await licenseExpiry(s.licenseId)).toBe(P2 + 20 * DAY);
  });

  it.each([
    ["chuỗi ISO 8601", "iso"],
    ["số giây Unix", "seconds"],
    ["số mili giây", "millis"],
  ] as const)("hạn kỳ trong payload là %s: đọc ra cùng một kỳ (dạng thật chưa đo, U3)", async (_why, format) => {
    const w = subWorld();
    w.creem.periodFormat = format;
    const s = await subscribe(w);
    expect((await sub(s.subId))?.paid_through).toBe(P1);
    w.clock.now = P1;
    expect((await sendSub(w, s.subId, "subscription.paid", { periodEnd: P2 })).body.result).toBe("renewed");
    expect(await licenseExpiry(s.licenseId)).toBe(P2 + 3 * DAY);
  });

  it("payload không có hạn kỳ: không đoán, không cấp; nhật ký + cảnh báo subscription_review; 200 cho Creem", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    const expires = await licenseExpiry(s.licenseId);
    w.clock.now = P1;
    expect(await sendSub(w, s.subId, "subscription.paid", { periodEnd: null })).toMatchObject({ status: 200, body: { result: "held" } });
    expect(await licenseExpiry(s.licenseId)).toBe(expires);
    expect(await ordersOf(s.licenseId)).toHaveLength(1);
    expect(await alertKinds()).toEqual(["subscription_review"]);
    expect(await auditActions("subscription_period_unreadable")).toMatchObject([{ subscription: s.subId, reason: "period_unreadable" }]);
  });

  it.each([
    ["trả thiếu", { amount_paid: 300 }, "underpaid"],
    ["có giảm giá", { amount_paid: 399 }, "discount"],
    ["giao dịch chưa paid", { status: "pending" }, "transaction_status"],
    ["sai loại tiền", { currency: "EUR" }, "currency"],
  ] as const)("kỳ mới nhưng %s: giữ đơn underpaid, KHÔNG cấp, cảnh báo order_payment_review, kỳ ghi nhận (gửi lại không tạo thêm việc)", async (_why, tx, reason) => {
    const w = subWorld();
    const s = await subscribe(w);
    const expires = await licenseExpiry(s.licenseId);
    w.clock.now = P1;
    const opts = { periodEnd: P2, transaction: tx, ...(reason === "discount" ? { discount: "dis_x" } : {}) };
    expect(await sendSub(w, s.subId, "subscription.paid", opts)).toMatchObject({ body: { result: "held" } });
    const renewal = (await ordersOf(s.licenseId)).find((o) => o.provider_ref === `${s.subId}@${P2}`);
    expect(renewal).toMatchObject({ status: "underpaid", auto_renew: 1 });
    expect(await licenseExpiry(s.licenseId)).toBe(expires);
    expect(await alertKinds()).toEqual(["order_payment_review"]);
    expect(await auditActions("order_underpaid")).toMatchObject([{ reason, subscription: s.subId, period_end: P2 }]);
    expect(w.resend.sent).toHaveLength(1);
    // Gửi lại: không đơn mới, không cảnh báo mới.
    await sendSub(w, s.subId, "subscription.paid", opts);
    expect((await ordersOf(s.licenseId)).filter((o) => o.provider_ref === `${s.subId}@${P2}`)).toHaveLength(1);
    expect(await auditActions("order_underpaid")).toHaveLength(1);
  });

  it("thuế Creem cộng ngoài giá không bị coi là trả thiếu", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    w.clock.now = P1;
    const res = await sendSub(w, s.subId, "subscription.paid", { periodEnd: P2, transaction: { amount_paid: 479, tax_amount: 80 } });
    expect(res.body.result).toBe("renewed");
  });

  it("license đã thu hồi: không cấp, không gửi email; kết quả needs_review", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    await env.DB.prepare("UPDATE licenses SET revoked_at = ? WHERE id = ?").bind(T0 + 1, s.licenseId).run();
    w.clock.now = P1;
    const res = await sendSub(w, s.subId, "subscription.paid", { periodEnd: P2 });
    expect(res.body.result).toBe("needs_review");
    expect(w.resend.sent).toHaveLength(1);
  });

  it("thuê bao chưa ghi (subscription.paid tới trước đơn đầu): 503 để Creem gửi lại; sau khi đơn đầu cấp xong thì xử lý được", async () => {
    const w = subWorld();
    const co = await w.call("POST", "/v1/checkout", { ...usd, auto_renew: true });
    const orderCode = co.body.order_code as number;
    const checkoutId = w.creem.checkoutIdOf(orderCode);
    const subId = w.creem.paySubscription(checkoutId, P1);
    const early = await w.creem.subscriptionWebhook(subId, "subscription.paid", { periodEnd: P1, createdAt: w.clock.now, eventId: "evt_early" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await w.call("POST", "/v1/webhooks/creem", early.raw, early.headers)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
    } finally {
      warn.mockRestore();
    }
    // Sự kiện còn mới: chưa cần báo người vận hành.
    expect(await alertKinds()).toEqual([]);
    const hook = await w.creem.completedWebhook(checkoutId);
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body.result).toBe("granted");
    expect(await w.call("POST", "/v1/webhooks/creem", early.raw, early.headers)).toMatchObject({ status: 200, body: { result: "same_period" } });
  });

  it("thuê bao lạ mà sự kiện đã cũ hơn 3 giờ (gần hết lần gửi lại): vẫn 503, thêm nhật ký + cảnh báo subscription_review", async () => {
    const w = subWorld();
    w.clock.now = T0 + 4 * 3600;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await sendSub(w, "sub_nobody", "subscription.paid", { periodEnd: P1, createdAt: T0 });
      expect(res.status).toBe(503);
    } finally {
      warn.mockRestore();
    }
    expect(await alertKinds()).toEqual(["subscription_review"]);
    expect(await auditActions("subscription_unlinked")).toHaveLength(1);
  });
});

describe("trạng thái thuê bao", () => {
  it.each([
    ["subscription.scheduled_cancel", "scheduled_cancel"],
    ["subscription.canceled", "canceled"],
    ["subscription.expired", "expired"],
    ["subscription.past_due", "past_due"],
    ["subscription.unpaid", "unpaid"],
    ["subscription.paused", "paused"],
  ] as const)("%s đổi trạng thái thành %s, ghi nhật ký, KHÔNG đụng tới hạn license", async (eventType, status) => {
    const w = subWorld();
    const s = await subscribe(w);
    const expires = await licenseExpiry(s.licenseId);
    w.clock.now = P1 - DAY;
    expect(await sendSub(w, s.subId, eventType, { periodEnd: P1, status, transaction: null })).toMatchObject({ status: 200, body: { result: "status" } });
    expect((await sub(s.subId))?.status).toBe(status);
    expect(await licenseExpiry(s.licenseId)).toBe(expires);
    expect(await auditActions("subscription_status")).toMatchObject([{ subscription: s.subId, from: "active", to: status, event_type: eventType }]);
    expect(await ordersOf(s.licenseId)).toHaveLength(1);
  });

  it("subscription.update lấy trạng thái trong payload", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    await sendSub(w, s.subId, "subscription.update", { status: "paused", transaction: null });
    expect((await sub(s.subId))?.status).toBe("paused");
  });

  it("sự kiện cũ tới sau sự kiện mới không đảo lại trạng thái (canceled đến trước, active cũ đến sau)", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    w.clock.now = P1;
    await sendSub(w, s.subId, "subscription.canceled", { createdAt: T0 + 20 * DAY, transaction: null });
    await sendSub(w, s.subId, "subscription.active", { createdAt: T0 + 10 * DAY, transaction: null });
    expect((await sub(s.subId))?.status).toBe("canceled");
  });

  it("gửi lại sự kiện trạng thái không ghi thêm nhật ký", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    const hook = await w.creem.subscriptionWebhook(s.subId, "subscription.canceled", { createdAt: T0 + DAY, transaction: null, eventId: "evt_c" });
    await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
    await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
    expect(await auditActions("subscription_status")).toHaveLength(1);
  });

  it("sau khi hủy, subscription.paid muộn của kỳ đã trả vẫn được cấp một lần (khách đã bị trừ tiền)", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    w.clock.now = P1;
    await sendSub(w, s.subId, "subscription.canceled", { createdAt: P1, transaction: null });
    expect((await sendSub(w, s.subId, "subscription.paid", { periodEnd: P2, createdAt: P1 + 1 })).body.result).toBe("renewed");
    expect(await licenseExpiry(s.licenseId)).toBe(P2 + 3 * DAY);
  });

  it("sự kiện thuê bao có object.id sai mẫu: unmatched (200), không đụng D1 thuê bao", async () => {
    const w = subWorld();
    const hook = await w.creem.signedEvent("subscription.paid", { id: "sub bad id!" });
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions").first<{ n: number }>())?.n).toBe(0);
  });
});

describe("POST /v1/subscription", () => {
  it("license không có thuê bao: auto_renew false, mọi trường khác null", async () => {
    const w = subWorld();
    const { licenseKey } = await w.buyCreem();
    expect(await w.call("POST", "/v1/subscription", { license_key: licenseKey })).toMatchObject({
      status: 200,
      body: { auto_renew: false, status: null, plan: null, renews_at: null },
    });
  });

  it("license có thuê bao active: auto_renew true kèm gói và ngày thu kỳ sau; không có portal_url nếu không xin", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    const res = await w.call("POST", "/v1/subscription", { license_key: s.licenseKey });
    expect(res).toMatchObject({ status: 200, body: { auto_renew: true, status: "active", plan: "monthly", renews_at: P1 } });
    expect(res.body).not.toHaveProperty("portal_url");
    expect(w.creem.requests.some((r) => r.path === "/v1/customers/billing")).toBe(false);
  });

  it.each(["canceled", "expired", "scheduled_cancel"])("thuê bao %s: auto_renew false nhưng vẫn báo trạng thái", async (status) => {
    const w = subWorld();
    const s = await subscribe(w);
    await env.DB.prepare("UPDATE subscriptions SET status = ? WHERE provider_ref = ?").bind(status, s.subId).run();
    expect((await w.call("POST", "/v1/subscription", { license_key: s.licenseKey })).body).toMatchObject({ auto_renew: false, status });
  });

  it("manage: true trả link cổng khách hàng Creem của đúng khách", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    const res = await w.call("POST", "/v1/subscription", { license_key: s.licenseKey, manage: true });
    expect(res).toMatchObject({ status: 200, body: { auto_renew: true, portal_url: "https://creem.io/my-orders/login/fakeportal" } });
    expect(w.creem.requests.at(-1)).toMatchObject({ method: "POST", path: "/v1/customers/billing", body: { customer_id: "cust_fake" }, apiKey: TEST_CREEM_API_KEY });
  });

  it.each([
    ["link ngoài tên miền cổng", "https://evil.example/my-orders/login/x"],
    ["link http", "http://creem.io/my-orders/login/x"],
    ["link sai đường dẫn", "https://creem.io/other/x"],
    ["link có userinfo", "https://creem.io@evil.example/my-orders/login/x"],
    ["thiếu link", null],
  ])("Creem trả %s: 502, không đưa link lạ cho khách", async (_why, link) => {
    const w = subWorld();
    const s = await subscribe(w);
    w.creem.portalLink = link;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await w.call("POST", "/v1/subscription", { license_key: s.licenseKey, manage: true });
      expect(res).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
      expect(JSON.stringify(res.body)).not.toContain("evil");
    } finally {
      err.mockRestore();
    }
  });

  it("Creem lỗi mạng khi xin link: 502", async () => {
    const w = subWorld();
    const s = await subscribe(w);
    w.creem.portalFailures = ["network"];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await w.call("POST", "/v1/subscription", { license_key: s.licenseKey, manage: true })).status).toBe(502);
    } finally {
      err.mockRestore();
    }
  });

  it("manage: true khi license không có thuê bao: 404 no_subscription", async () => {
    const w = subWorld();
    const { licenseKey } = await w.buyCreem();
    expect(await w.call("POST", "/v1/subscription", { license_key: licenseKey, manage: true })).toMatchObject({ status: 404, body: { error: "no_subscription" } });
  });

  it("key sai hay không đúng dạng: 404 invalid_key / 400 invalid_request, tính vào bộ đếm thất bại", async () => {
    const w = subWorld();
    expect(await w.call("POST", "/v1/subscription", { license_key: formatLicenseKey(generateLicenseKey()) })).toMatchObject({ status: 404, body: { error: "invalid_key" } });
    expect(await w.call("POST", "/v1/subscription", { license_key: 5 })).toMatchObject({ status: 400, body: { error: "invalid_request", field: "license_key" } });
    expect(await w.call("POST", "/v1/subscription", {})).toMatchObject({ status: 400 });
  });

  it("không lộ thuê bao của license khác: mỗi key chỉ thấy thuê bao của chính nó", async () => {
    const w = subWorld();
    const a = await subscribe(w, { email: "a@example.com" });
    const b = await w.buyCreem({ email: "b@example.com" });
    expect((await w.call("POST", "/v1/subscription", { license_key: b.licenseKey })).body.auto_renew).toBe(false);
    expect((await w.call("POST", "/v1/subscription", { license_key: a.licenseKey })).body.auto_renew).toBe(true);
  });
});

describe("thư nhắc gia hạn", () => {
  it("license có thuê bao active hay past_due: không xếp lịch thư nhắc; hủy hay hết hạn thì nhắc như thường", async () => {
    const w = subWorld({ EXPIRY_REMINDERS: "on" });
    const s = await subscribe(w, { plan: "yearly" });
    const now = T0 + 363 * DAY; // còn 2 ngày
    await env.DB.prepare("UPDATE licenses SET expires_at = ? WHERE id = ?").bind(now + 2 * DAY, s.licenseId).run();
    for (const status of ["active", "past_due"]) {
      await env.DB.prepare("UPDATE subscriptions SET status = ? WHERE provider_ref = ?").bind(status, s.subId).run();
      expect(await enqueueExpiryReminders(env.DB, now)).toBe(0);
    }
    for (const status of ["canceled", "expired", "scheduled_cancel"]) {
      await env.DB.prepare("DELETE FROM expiry_reminders").run();
      await env.DB.prepare("UPDATE subscriptions SET status = ? WHERE provider_ref = ?").bind(status, s.subId).run();
      expect(await enqueueExpiryReminders(env.DB, now)).toBe(1);
    }
  });

  it("thư đã xếp lịch rồi mới có thuê bao active: bỏ qua lúc gửi (skip_reason auto_renew), không gửi", async () => {
    const w = subWorld({ EXPIRY_REMINDERS: "on" });
    const s = await subscribe(w, { plan: "yearly" });
    const now = T0 + 363 * DAY;
    await env.DB.prepare("UPDATE licenses SET expires_at = ? WHERE id = ?").bind(now + 2 * DAY, s.licenseId).run();
    await env.DB.prepare("UPDATE subscriptions SET status = 'canceled' WHERE provider_ref = ?").bind(s.subId).run();
    expect(await enqueueExpiryReminders(env.DB, now)).toBe(1);
    await env.DB.prepare("UPDATE subscriptions SET status = 'active' WHERE provider_ref = ?").bind(s.subId).run();
    w.resend.sent.length = 0;
    w.clock.now = now + 3 * 3600; // trong khung giờ gửi (10:00 giờ Việt Nam là +3h so với 07:00)
    const { reconcile } = await import("../src/reconcile");
    await reconcile(w.env, w.deps);
    expect(w.resend.sent).toHaveLength(0);
    expect(await env.DB.prepare("SELECT status, skip_reason FROM expiry_reminders").first()).toEqual({ status: "skipped", skip_reason: "auto_renew" });
  });
});
