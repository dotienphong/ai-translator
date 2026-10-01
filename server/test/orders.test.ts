import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { hmacSha256Hex } from "../src/crypto";
import { grantOrder, loadOrder } from "../src/orders";
import { objectSignatureData } from "../src/payment/payos";
import { parsePlans, type PlanTable } from "../src/plans";
import { resetDb } from "./db";
import { FakeGateway, TEST_CHECKSUM_KEY } from "./fakes";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

/** Key đúng định dạng (ký tự kiểm tra đúng) nhưng không có trong D1. */
const UNKNOWN_KEY = "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5";

async function checkout(w: ReturnType<typeof makeWorld>, extra: Record<string, unknown> = {}) {
  const res = await w.call("POST", "/v1/checkout", { plan: "pro", email: "buyer@example.com", consent: true, ...extra });
  return { orderCode: res.body.order_code as number, token: res.body.order_token as string };
}

const licenseCount = async () =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses").first<{ n: number }>())?.n;
const orderRow = (orderCode: number) =>
  env.DB.prepare("SELECT status, amount_paid FROM orders WHERE order_code = ?").bind(orderCode).first();

describe("webhook PayOS", () => {
  it("đơn đã trả đủ: cấp license 30 ngày, gửi email có key, app thấy key khi hỏi đơn", async () => {
    const w = makeWorld();
    const { orderCode, token } = await checkout(w);
    const pending = await w.getOrder(orderCode, token);
    expect(pending.body).toEqual({
      order_code: orderCode,
      status: "pending",
      plan: "pro",
      amount: 50000,
      currency: "VND",
      expires_at: T0 + 900,
    });

    w.clock.now = T0 + 120;
    w.payos.pay(orderCode);
    const wh = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(wh).toMatchObject({ status: 200, body: { ok: true, result: "granted" } });
    // Server hỏi lại PayOS trước khi cấp.
    expect(w.payos.requests.at(-1)).toMatchObject({ method: "GET", path: `/v2/payment-requests/${orderCode}` });

    const paid = await w.getOrder(orderCode, token);
    expect(paid.body).toMatchObject({
      status: "paid",
      grant_kind: "new",
      license_plan: "pro",
      license_expires_at: T0 + 120 + 30 * DAY,
    });
    const key = paid.body.license_key as string;
    expect(key).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/);

    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]).toMatchObject({ to: ["buyer@example.com"], idempotencyKey: `dev-order-${orderCode}` });
    expect(w.resend.sent[0]!.text).toContain(key);
    const order = await env.DB.prepare("SELECT email_sent_at, amount_paid FROM orders").first();
    expect(order).toEqual({ email_sent_at: T0 + 120, amount_paid: 50000 });
    const lic = await env.DB.prepare("SELECT plan, expires_at, cycle_anchor, version, last_order_code FROM licenses").first();
    expect(lic).toEqual({ plan: "pro", expires_at: T0 + 120 + 30 * DAY, cycle_anchor: T0 + 120, version: 0, last_order_code: orderCode });
  });

  it("webhook gửi trùng cùng lúc: chỉ cấp một lần, một email", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    const results = await Promise.all([1, 2, 3].map(() => w.call("POST", "/v1/webhooks/payos", body)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.filter((r) => r.body.result === "granted")).toHaveLength(1);
    expect(await licenseCount()).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
    const logs = await env.DB.prepare("SELECT action FROM audit_log WHERE action = 'license_issued'").all();
    expect(logs.results).toHaveLength(1);
  });

  it("sai chữ ký thì 400, không gọi PayOS, không cấp, có cảnh báo", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    const before = w.payos.requests.length;
    const res = await w.call("POST", "/v1/webhooks/payos", { ...body, signature: "f".repeat(64) });
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_signature" } });
    expect(w.payos.requests.length).toBe(before);
    expect(await licenseCount()).toBe(0);
    const alert = await env.DB.prepare("SELECT kind, count FROM ops_alerts").first();
    expect(alert).toEqual({ kind: "webhook_bad_signature", count: 1 });
  });

  it("webhook đúng chữ ký nhưng PayOS báo chưa trả thì không cấp (chặn webhook giả mạo số tiền)", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(res.body).toEqual({ ok: true, result: "not_paid" });
    expect(await licenseCount()).toBe(0);
  });

  it("webhook mẫu khi đăng ký confirm-webhook (orderCode lạ) vẫn trả 200", async () => {
    const w = makeWorld();
    const data = { orderCode: 123, amount: 3000, description: "VQRIO123", code: "00", desc: "Thành công" };
    const body = { code: "00", desc: "success", success: true, data, signature: await hmacSha256Hex(TEST_CHECKSUM_KEY, objectSignatureData(data)) };
    const res = await w.call("POST", "/v1/webhooks/payos", body);
    expect(res).toMatchObject({ status: 200, body: { ok: true, result: "unknown_order" } });
  });

  it("chuyển thiếu (PayOS báo UNDERPAID): không cấp, đơn thành underpaid, ghi nhật ký", async () => {
    const w = makeWorld();
    const { orderCode, token } = await checkout(w);
    w.payos.pay(orderCode, 1500);
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 1500));
    expect(res.body).toEqual({ ok: true, result: "not_paid" });
    const order = await w.getOrder(orderCode, token);
    expect(order.body.status).toBe("underpaid");
    expect(order.body.license_key).toBeUndefined();
    const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'order_underpaid'").first<{ detail: string }>();
    expect(JSON.parse(log!.detail)).toEqual({ amount: 50000, provider_amount: 50000, amount_paid: 1500 });
  });

  it("PayOS báo PAID nhưng amountPaid < amount: không cấp, đơn thành underpaid", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode, 49999);
    w.payos.setStatus(orderCode, "PAID");
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(res.body).toEqual({ ok: true, result: "not_paid" });
    expect(await licenseCount()).toBe(0);
    expect(await orderRow(orderCode)).toEqual({ status: "underpaid", amount_paid: 49999 });
  });

  it("amountPaid đủ nhưng status chưa phải PAID (PROCESSING): không cấp", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode);
    w.payos.setStatus(orderCode, "PROCESSING");
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(res.body).toEqual({ ok: true, result: "not_paid" });
    expect(await licenseCount()).toBe(0);
    expect(await orderRow(orderCode)).toEqual({ status: "processing", amount_paid: 50000 });
  });

  it("amount của PayOS khác amount của đơn: không cấp, đơn thành failed, ghi nhật ký", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.setAmount(orderCode, 1000);
    w.payos.pay(orderCode);
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(res.body).toEqual({ ok: true, result: "not_paid" });
    expect(await licenseCount()).toBe(0);
    expect(await orderRow(orderCode)).toEqual({ status: "failed", amount_paid: 1000 });
    const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'order_amount_mismatch'").first<{ detail: string }>();
    expect(JSON.parse(log!.detail)).toEqual({ amount: 50000, provider_amount: 1000, amount_paid: 1000 });
  });

  it("PayOS không trả lời thì 503 để PayOS gửi lại", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    w.payos.down = true;
    const res = await w.call("POST", "/v1/webhooks/payos", body);
    expect(res).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
    expect(await licenseCount()).toBe(0);
  });

  it("email lỗi vẫn cấp license; email_sent_at để trống; có cảnh báo email_failed", async () => {
    const w = makeWorld();
    w.resend.down = true;
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode);
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(res.body.result).toBe("granted");
    const row = await env.DB.prepare("SELECT email_sent_at FROM orders").first<{ email_sent_at: number | null }>();
    expect(row?.email_sent_at).toBeNull();
    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "email_failed" });
  });

  it("cổng lạ ở /v1/webhooks/{provider} thì 404", async () => {
    const w = makeWorld();
    expect((await w.call("POST", "/v1/webhooks/khongco", {})).status).toBe(404);
    expect((await w.call("POST", "/v1/webhooks/constructor", {})).status).toBe(404);
  });

  it("webhook chọn cổng theo URL; fulfil hỏi đúng cổng ghi ở orders.provider", async () => {
    const w = makeWorld();
    const gw = new FakeGateway();
    w.deps.payments.fakepay = gw;
    const { orderCode } = await checkout(w);
    await env.DB.prepare("UPDATE orders SET provider = 'fakepay' WHERE order_code = ?").bind(orderCode).run();
    gw.paid.add(orderCode);
    const res = await w.call("POST", "/v1/webhooks/fakepay", { secret: "fakepay-ok", orderCode });
    expect(res.body).toEqual({ ok: true, result: "granted" });
    expect(gw.statusCalls).toEqual([orderCode]);
    // PayOS không bị hỏi về đơn của cổng khác.
    expect(w.payos.requests.filter((r) => r.method === "GET")).toHaveLength(0);
  });
});

describe("checkout gia hạn", () => {
  const valid = { plan: "pro", email: "buyer@example.com", consent: true };

  it("gia hạn: gắn đơn với license đang có", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    const res = await w.call("POST", "/v1/checkout", { ...valid, license_key: licenseKey });
    expect(res.status).toBe(201);
    const row = await env.DB.prepare("SELECT renew_license_id FROM orders WHERE order_code = ?")
      .bind(res.body.order_code)
      .first<{ renew_license_id: string }>();
    const lic = await env.DB.prepare("SELECT id FROM licenses").first<{ id: string }>();
    expect(row?.renew_license_id).toBe(lic?.id);
  });

  it("gia hạn key không tồn tại thì 404, key đã thu hồi thì 403", async () => {
    const w = makeWorld();
    const unknown = await w.call("POST", "/v1/checkout", { ...valid, license_key: UNKNOWN_KEY });
    expect(unknown).toMatchObject({ status: 404, body: { error: "invalid_key" } });
    const { licenseKey } = await w.buy();
    await env.DB.prepare("UPDATE licenses SET revoked_at = 1").run();
    const revoked = await w.call("POST", "/v1/checkout", { ...valid, license_key: licenseKey });
    expect(revoked).toMatchObject({ status: 403, body: { error: "license_revoked" } });
  });
});

/** Mua thêm hay đổi gói cho `licenseKey` lúc này: checkout, khách trả, webhook tới. */
async function renew(w: ReturnType<typeof makeWorld>, licenseKey: string, plan: string) {
  const { orderCode, token } = await checkout(w, { plan, license_key: licenseKey });
  w.payos.pay(orderCode);
  await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
  return (await w.getOrder(orderCode, token)).body;
}
const license = () => env.DB.prepare("SELECT plan, expires_at, cycle_anchor, version FROM licenses").first();

describe("mua thêm cùng gói (§6.8)", () => {
  it("license còn hạn 10 ngày: cộng 30 ngày vào hạn cũ, giữ cycle_anchor, thư gia hạn", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    w.clock.now = T0 + 20 * DAY;
    const order = await renew(w, licenseKey, "pro");
    expect(order).toMatchObject({ status: "paid", grant_kind: "extend", license_key: licenseKey, license_plan: "pro" });
    expect(order.license_expires_at).toBe(T0 + 60 * DAY);
    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 60 * DAY, cycle_anchor: T0, version: 1 });
    expect(await licenseCount()).toBe(1);
    expect(w.resend.sent.at(-1)!.subject).toBe("Đã gia hạn AI Translator / AI Translator renewed");
  });

  it("license đã hết hạn 5 ngày: 30 ngày từ bây giờ, cycle_anchor đặt lại", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    w.clock.now = T0 + 35 * DAY;
    await renew(w, licenseKey, "pro");
    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 65 * DAY, cycle_anchor: T0 + 35 * DAY, version: 1 });
  });
});

describe("đổi gói (§6.8)", () => {
  it("lên gói: Professional còn 20 ngày mua X2, quy đổi 6 ngày, X2 chạy 36 ngày từ lúc trả tiền", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    w.clock.now = T0 + 10 * DAY;
    const order = await renew(w, licenseKey, "pro_x2");
    expect(order).toMatchObject({ grant_kind: "change", license_plan: "pro_x2", license_expires_at: T0 + 46 * DAY });
    expect(await license()).toEqual({ plan: "pro_x2", expires_at: T0 + 46 * DAY, cycle_anchor: T0 + 10 * DAY, version: 1 });
    expect(w.resend.sent.at(-1)!.subject).toBe("Đã đổi gói AI Translator / AI Translator plan changed");
    expect(w.resend.sent.at(-1)!.text).toContain("Professional X2, hết hạn");
    const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'license_plan_changed'").first<{ detail: string }>();
    expect(JSON.parse(log!.detail)).toMatchObject({
      plan: "pro_x2",
      from_plan: "pro",
      from_expires_at: T0 + 30 * DAY,
      converted_days: 6,
      paid_at: T0 + 10 * DAY,
    });
  });

  it("xuống gói: X2 còn 10 ngày mua Professional, quy đổi 30 ngày, chạy 60 ngày", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy({ plan: "pro_x2" });
    w.clock.now = T0 + 20 * DAY;
    await renew(w, licenseKey, "pro");
    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 80 * DAY, cycle_anchor: T0 + 20 * DAY, version: 1 });
  });

  it("license đã hết hạn mua gói khác: như license mới nhưng giữ key", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy({ plan: "pro_x5" });
    w.clock.now = T0 + 40 * DAY;
    const order = await renew(w, licenseKey, "pro");
    expect(order).toMatchObject({ grant_kind: "change", license_key: licenseKey });
    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 70 * DAY, cycle_anchor: T0 + 40 * DAY, version: 1 });
    expect(await licenseCount()).toBe(1);
  });
});

describe("thời điểm tính là lúc khách trả tiền (QĐ33)", () => {
  it("webhook tới muộn 24 giờ: đổi gói vẫn tính theo transactionDateTime của PayOS", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    w.clock.now = T0 + 10 * DAY;
    const { orderCode, token } = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
    w.clock.now = T0 + 10 * DAY + 60;
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    w.clock.now = T0 + 11 * DAY;
    await w.call("POST", "/v1/webhooks/payos", body);
    // Lúc trả tiền còn 20 ngày trừ 60 giây: floor(6,66…) = 6 ngày quy đổi. Gói mới bắt đầu lúc trả tiền.
    expect(await license()).toEqual({
      plan: "pro_x2",
      expires_at: T0 + 10 * DAY + 60 + 36 * DAY,
      cycle_anchor: T0 + 10 * DAY + 60,
      version: 1,
    });
    expect((await w.getOrder(orderCode, token)).body.license_expires_at).toBe(T0 + 46 * DAY + 60);
  });

  it("đơn license mới mà webhook tới muộn 24 giờ: 30 ngày tính từ lúc trả tiền", async () => {
    const w = makeWorld();
    const { orderCode, token } = await checkout(w);
    w.clock.now = T0 + 60;
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    w.clock.now = T0 + DAY;
    await w.call("POST", "/v1/webhooks/payos", body);
    expect((await w.getOrder(orderCode, token)).body.license_expires_at).toBe(T0 + 60 + 30 * DAY);
    expect(await env.DB.prepare("SELECT cycle_anchor, anchor_applied_at, created_at FROM licenses").first()).toEqual({
      cycle_anchor: T0 + 60,
      anchor_applied_at: T0 + DAY,
      created_at: T0 + DAY,
    });
  });

  it("license hết hạn giữa lúc trả tiền và lúc xử lý: vẫn tính như còn hạn", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    w.clock.now = T0 + 30 * DAY - 300;
    const { orderCode } = await checkout(w, { license_key: licenseKey });
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    w.clock.now = T0 + 31 * DAY;
    await w.call("POST", "/v1/webhooks/payos", body);
    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 60 * DAY, cycle_anchor: T0, version: 1 });
  });

  it("thời điểm PayOS báo bị kẹp trong thời hạn của link thanh toán", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    w.clock.now = T0 + 10 * DAY;
    const early = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
    w.payos.pay(early.orderCode, undefined, T0); // trước lúc tạo link: kẹp về lúc tạo link
    w.clock.now = T0 + 12 * DAY;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(early.orderCode));
    expect(await license()).toMatchObject({ cycle_anchor: T0 + 10 * DAY, expires_at: T0 + 46 * DAY });

    const late = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
    w.payos.pay(late.orderCode, undefined, T0 + 30 * DAY); // sau lúc link hết hạn: kẹp về hạn của link
    w.clock.now = T0 + 13 * DAY;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(late.orderCode));
    expect(await license()).toMatchObject({ plan: "pro_x2", cycle_anchor: T0 + 10 * DAY, expires_at: T0 + 76 * DAY });
  });
});

describe("hai đơn của cùng license xác nhận cùng lúc (QĐ32)", () => {
  async function twoOrders() {
    const w = makeWorld();
    const { licenseKey } = await w.buy(); // Professional, hết hạn T0 + 30 ngày
    w.clock.now = T0 + 10 * DAY; // còn 20 ngày
    const a = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
    const b = await checkout(w, { plan: "pro_x5", license_key: licenseKey });
    w.payos.pay(a.orderCode);
    w.payos.pay(b.orderCode);
    return { w, a: a.orderCode, b: b.orderCode };
  }
  const plans = () => parsePlans(env.PLANS) as PlanTable;
  const statuses = async () =>
    (await env.DB.prepare("SELECT status FROM orders WHERE renew_license_id IS NOT NULL ORDER BY order_code").all()).results;

  it("đơn B ghi chen giữa lúc A đọc và lúc A ghi: A đọc lại và tính trên kết quả của B", async () => {
    const { a, b } = await twoOrders();
    const now = T0 + 10 * DAY;
    let chen = true;
    const granted = await grantOrder(env.DB, plans(), (await loadOrder(env.DB, a))!, {
      now,
      paidAt: now,
      amountPaid: 150000,
      actor: "test",
      beforeCommit: async () => {
        if (!chen) return;
        chen = false;
        await grantOrder(env.DB, plans(), (await loadOrder(env.DB, b))!, { now, paidAt: now, amountPaid: 500000, actor: "test" });
      },
    });
    // B trước: Professional 20 ngày → X5, quy đổi floor(20 × 50.000 / 500.000) = 2, X5 chạy 32 ngày.
    // A sau: X5 32 ngày → X2, quy đổi floor(32 × 500.000 / 150.000) = 106, X2 chạy 136 ngày.
    expect(granted).toMatchObject({ plan: "pro_x2", expiresAt: now + 136 * DAY, convertedDays: 106 });
    expect(await license()).toEqual({ plan: "pro_x2", expires_at: now + 136 * DAY, cycle_anchor: now, version: 2 });
    expect(await statuses()).toEqual([{ status: "paid" }, { status: "paid" }]);
  });

  it("hai webhook chạy song song: kết quả bằng đúng việc áp lần lượt hai đơn", async () => {
    const { w, a, b } = await twoOrders();
    await Promise.all([a, b].map(async (n) => w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(n))));
    const now = T0 + 10 * DAY;
    // A rồi B: X2 36 ngày → X5 quy đổi floor(36 × 150.000 / 500.000) = 10, chạy 40 ngày. B rồi A: X2 136 ngày.
    expect([
      { plan: "pro_x5", expires_at: now + 40 * DAY, cycle_anchor: now, version: 2 },
      { plan: "pro_x2", expires_at: now + 136 * DAY, cycle_anchor: now, version: 2 },
    ]).toContainEqual(await license());
    expect(await statuses()).toEqual([{ status: "paid" }, { status: "paid" }]);
    expect(w.resend.sent.filter((m) => m.subject.startsWith("Đã đổi gói"))).toHaveLength(2);
  });

  it("đơn đã áp rồi thì grantOrder trả already_settled, không áp lần hai", async () => {
    const { w, a } = await twoOrders();
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(a));
    const again = await grantOrder(env.DB, plans(), (await loadOrder(env.DB, a))!, { now: T0 + 10 * DAY, amountPaid: 150000, actor: "test" });
    expect(again).toBe("already_settled");
    expect(await license()).toMatchObject({ version: 1 });
  });
});

describe("đơn của cùng license áp không theo thứ tự thanh toán", () => {
  it("đơn trả sớm hơn mà xử lý sau: tính tại cycle_anchor đang có, để cycle_anchor không lùi", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy(); // Professional, hết hạn T0 + 30 ngày
    w.clock.now = T0 + 10 * DAY;
    const a = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
    const b = await checkout(w, { plan: "pro_x5", license_key: licenseKey });
    const t1 = T0 + 10 * DAY;
    const t2 = T0 + 10 * DAY + 300;
    w.payos.pay(a.orderCode, undefined, t1);
    w.payos.pay(b.orderCode, undefined, t2);
    w.clock.now = T0 + 10 * DAY + 600;
    // Webhook của B (trả muộn hơn) tới trước.
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(b.orderCode));
    // B: Professional còn 20 ngày trừ 300 giây → X5, floor(1,99…) = 1 ngày quy đổi, chạy 31 ngày từ t2.
    expect(await license()).toMatchObject({ plan: "pro_x5", cycle_anchor: t2, expires_at: t2 + 31 * DAY });
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(a.orderCode));
    // A tính tại t2, không tại t1: X5 còn đúng 31 ngày → X2, floor(103,3) = 103, chạy 133 ngày từ t2.
    expect(await license()).toEqual({ plan: "pro_x2", expires_at: t2 + 133 * DAY, cycle_anchor: t2, version: 2 });
    const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'license_plan_changed' AND order_code = ?")
      .bind(a.orderCode)
      .first<{ detail: string }>();
    expect(JSON.parse(log!.detail)).toMatchObject({ paid_at: t2, converted_days: 103 });
  });
});

describe("license đã thu hồi mà nhận được tiền (QĐ37)", () => {
  async function revokedRenewal() {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    w.clock.now = T0 + 10 * DAY;
    const { orderCode, token } = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
    w.payos.pay(orderCode);
    w.resend.sent.length = 0;
    return { w, licenseKey, orderCode, token };
  }

  it("không áp đơn: đơn thành paid_needs_review, có cảnh báo và nhật ký, không gửi thư key", async () => {
    const { w, orderCode, token } = await revokedRenewal();
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0 + 10 * DAY).run();
    const wh = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(wh.body).toEqual({ ok: true, result: "needs_review" });
    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 30 * DAY, cycle_anchor: T0, version: 0 });
    expect(await env.DB.prepare("SELECT status, amount_paid, license_id, grant_kind FROM orders WHERE order_code = ?").bind(orderCode).first())
      .toEqual({ status: "paid_needs_review", amount_paid: 150000, license_id: null, grant_kind: null });
    expect(w.resend.sent).toHaveLength(0);
    expect(await env.DB.prepare("SELECT kind, count FROM ops_alerts").all()).toMatchObject({ results: [{ kind: "order_needs_review", count: 1 }] });
    const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'order_needs_review'").first<{ detail: string }>();
    expect(JSON.parse(log!.detail)).toMatchObject({ reason: "license_revoked", plan: "pro_x2", amount_paid: 150000 });
    // App thấy trạng thái này, không có key.
    const order = await w.getOrder(orderCode, token);
    expect(order.body).toMatchObject({ status: "paid_needs_review", plan: "pro_x2" });
    expect(order.body).not.toHaveProperty("license_key");
  });

  it("webhook gửi lại và grantOrder gọi lại không áp đơn, không tạo thêm cảnh báo", async () => {
    const { w, orderCode } = await revokedRenewal();
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0 + 10 * DAY).run();
    const body = await w.payos.webhookBody(orderCode);
    await w.call("POST", "/v1/webhooks/payos", body);
    const before = w.payos.requests.length;
    expect((await w.call("POST", "/v1/webhooks/payos", body)).body).toEqual({ ok: true, result: "needs_review" });
    // Không hỏi lại PayOS cho đơn đang chờ người vận hành.
    expect(w.payos.requests.length).toBe(before);
    // Gỡ thu hồi rồi gọi thẳng grantOrder: đơn vẫn không được áp lại.
    await env.DB.prepare("UPDATE licenses SET revoked_at = NULL").run();
    const again = await grantOrder(env.DB, parsePlans(env.PLANS) as PlanTable, (await loadOrder(env.DB, orderCode))!, {
      now: T0 + 11 * DAY,
      amountPaid: 150000,
      actor: "test",
    });
    expect(again).toBe("already_settled");
    expect(await license()).toMatchObject({ plan: "pro", version: 0 });
    expect(await env.DB.prepare("SELECT SUM(count) AS n FROM ops_alerts WHERE kind = 'order_needs_review'").first()).toEqual({ n: 1 });
    expect(w.resend.sent).toHaveLength(0);
  });

  it("thu hồi đúng lúc giữa lúc đọc và lúc ghi: câu ghi license kiểm revoked_at, đơn vẫn thành paid_needs_review", async () => {
    const { orderCode } = await revokedRenewal();
    const result = await grantOrder(env.DB, parsePlans(env.PLANS) as PlanTable, (await loadOrder(env.DB, orderCode))!, {
      now: T0 + 10 * DAY,
      amountPaid: 150000,
      actor: "test",
      beforeCommit: async () => {
        await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0 + 10 * DAY).run();
      },
    });
    expect(result).toBe("needs_review");
    expect(await license()).toMatchObject({ plan: "pro", version: 0 });
    expect(await env.DB.prepare("SELECT status FROM orders WHERE order_code = ?").bind(orderCode).first()).toEqual({ status: "paid_needs_review" });
  });

  it("đơn mua license mới không bị ảnh hưởng: license khác của cùng email bị thu hồi vẫn cấp bình thường", async () => {
    const w = makeWorld();
    await w.buy();
    await env.DB.prepare("UPDATE licenses SET revoked_at = 1").run();
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode);
    expect((await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode))).body).toEqual({ ok: true, result: "granted" });
  });
});

describe("GET /v1/orders/{order_code}", () => {
  it("scheme Bearer không phân biệt hoa thường", async () => {
    const w = makeWorld();
    const { orderCode, token } = await checkout(w);
    for (const scheme of ["Bearer", "bearer", "BEARER"]) {
      const res = await w.call("GET", `/v1/orders/${orderCode}`, undefined, { authorization: `${scheme} ${token}` });
      expect(res).toMatchObject({ status: 200, body: { order_code: orderCode, status: "pending" } });
    }
  });

  it("sai token, thiếu token, token trong query hay orderCode lạ đều trả 404 như nhau", async () => {
    const w = makeWorld();
    const { orderCode, token } = await checkout(w);
    const wrong = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    for (const res of [
      await w.getOrder(orderCode, wrong),
      await w.call("GET", `/v1/orders/${orderCode}`),
      await w.call("GET", `/v1/orders/${orderCode}?token=${token}`),
      await w.getOrder(999, token),
      await w.getOrder("abc", token),
    ]) {
      expect(res).toMatchObject({ status: 404, body: { error: "order_not_found" } });
    }
  });
});
