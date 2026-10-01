import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./db";
import vectors from "./vectors/token-v1.json";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

const valid = { plan: "pro", email: " Buyer@Example.com ", consent: true };

/** Đúng câu lệnh giữ chỗ số đơn ở Task 21, Step 4 (`wrangler d1 execute … --command`), QĐ18. */
const reserveSql = (n: number) =>
  `INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES (${n}, 'reserved', 'none', 'pro', 0, 'VND', 0, 'failed', 0, 0); DELETE FROM orders WHERE order_code = ${n};`;

describe("GET /v1/plans", () => {
  it("trả ba gói trả phí với tên, hạn mức, số ngày mỗi đơn và giá; không có Free", async () => {
    const res = await makeWorld().call("GET", "/v1/plans");
    expect(res).toEqual({
      status: 200,
      headers: expect.anything(),
      body: {
        plans: [
          { code: "pro", name: "Professional", quota_minutes_per_cycle: 1800, days_per_order: 30, prices: { VND: 50000 } },
          { code: "pro_x2", name: "Professional X2", quota_minutes_per_cycle: 6000, days_per_order: 30, prices: { VND: 150000 } },
          { code: "pro_x5", name: "Professional X5", quota_minutes_per_cycle: null, days_per_order: 30, prices: { VND: 500000 } },
        ],
      },
    });
  });

  it("bảng gói thiếu thì 503 pricing_not_configured", async () => {
    expect(await makeWorld({ PLANS: undefined }).call("GET", "/v1/plans")).toMatchObject({
      status: 503,
      body: { error: "pricing_not_configured" },
    });
  });
});

describe("POST /v1/checkout", () => {
  it("tạo đơn, gọi PayOS với mô tả AT<orderCode>, hạn 15 phút, trả link và VietQR", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      order_code: 1,
      checkout_url: "https://pay.payos.test/web/plink1",
      qr_code: "00020101021238570010A0000007270127QR16304ABCD",
      amount: 50000,
      currency: "VND",
      expires_at: T0 + 900,
    });
    expect(res.body.order_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.payos.requests[0]).toMatchObject({
      method: "POST",
      path: "/v2/payment-requests",
      body: {
        orderCode: 1,
        amount: 50000,
        description: "AT1",
        returnUrl: "https://license.test/v1/pay/return",
        cancelUrl: "https://license.test/v1/pay/cancel",
        expiredAt: T0 + 900,
      },
    });
    const row = await env.DB.prepare("SELECT * FROM orders WHERE order_code = 1").first<Record<string, unknown>>();
    expect(row).toMatchObject({
      provider: "payos",
      provider_ref: "plink1",
      plan: "pro",
      amount: 50000,
      currency: "VND",
      email: "buyer@example.com",
      email_consent_at: T0,
      status: "pending",
      renew_license_id: null,
    });
    // Chỉ lưu mã băm của order_token.
    expect(row?.order_token_hash).not.toBe(res.body.order_token);
  });

  it.each([
    ["pro", 50000],
    ["pro_x2", 150000],
    ["pro_x5", 500000],
  ])("gói %s: giá %i đ lấy từ biến PLANS", async (plan, amount) => {
    const res = await makeWorld().call("POST", "/v1/checkout", { ...valid, plan });
    expect(res).toMatchObject({ status: 201, body: { plan, amount, currency: "VND" } });
    expect(res.body).not.toHaveProperty("license_expires_at");
  });

  it("đổi giá trong PLANS là đổi giá bán, không cần sửa code", async () => {
    const plans = structuredClone(env.PLANS) as Record<string, { prices: Record<string, number> }>;
    plans.pro_x2!.prices.VND = 120000;
    const res = await makeWorld({ PLANS: plans }).call("POST", "/v1/checkout", { ...valid, plan: "pro_x2" });
    expect(res.body.amount).toBe(120000);
  });

  it.each([
    ["thiếu", undefined],
    ["sai", { pro: { prices: { VND: 1 } } }],
  ])("bảng gói %s thì 503, không tạo đơn", async (_why, plans) => {
    const w = makeWorld({ PLANS: plans });
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
    expect(w.payos.requests).toHaveLength(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first()).toEqual({ n: 0 });
  });

  it.each([
    [{ ...valid, consent: false }, "consent"],
    [{ ...valid, consent: undefined }, "consent"],
    // consent phải đúng là true: chuỗi "true" hay số 1 cũng là 400 (review cuối, N7).
    [{ ...valid, consent: "true" }, "consent"],
    [{ ...valid, consent: 1 }, "consent"],
    // Email dài 255 ký tự (quá 254, RFC 5321) là 400.
    [{ ...valid, email: `${"a".repeat(243)}@example.com` }, "email"],
    [{ ...valid, email: "không-phải-email" }, "email"],
    [{ ...valid, plan: "pro_forever" }, "plan"],
    [{ ...valid, plan: "free" }, "plan"],
    [{ ...valid, plan: "pro_1m" }, "plan"],
    [{ ...valid, license_key: "SAI-KEY" }, "license_key"],
  ])("input sai (%j) thì 400", async (body, field) => {
    const res = await makeWorld().call("POST", "/v1/checkout", body);
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_request", field } });
  });

  it("email dài đúng 254 ký tự vẫn nhận (biên của giới hạn 254)", async () => {
    const email = `${"a".repeat(242)}@example.com`;
    expect(email).toHaveLength(254);
    const res = await makeWorld().call("POST", "/v1/checkout", { ...valid, email });
    expect(res.status).toBe(201);
    expect(await env.DB.prepare("SELECT email FROM orders").first()).toEqual({ email });
  });

  it("body không phải JSON object thì 400", async () => {
    const w = makeWorld();
    expect((await w.call("POST", "/v1/checkout", "[1,2]")).status).toBe(400);
    expect((await w.call("POST", "/v1/checkout", "{")).status).toBe(400);
  });

  it("đặt số đơn bắt đầu (QĐ18): đơn kế tiếp là 1000001, mô tả AT1000001 đủ 9 ký tự", async () => {
    // Chèn rồi xóa một dòng giữ chỗ: AUTOINCREMENT nhớ số lớn nhất đã dùng.
    await env.DB.exec(reserveSql(1_000_000));
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'orders'").first()).toEqual({ seq: 1_000_000 });
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res.body.order_code).toBe(1_000_001);
    expect(w.payos.requests[0]!.body).toMatchObject({ orderCode: 1_000_001, description: "AT1000001" });
  });

  it("vượt 9.999.999 đơn thì 503 order_code_exhausted, không gọi PayOS", async () => {
    await env.DB.exec(reserveSql(9_999_999));
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res).toMatchObject({ status: 503, body: { error: "order_code_exhausted" } });
    expect(w.payos.requests).toHaveLength(0);
    const row = await env.DB.prepare("SELECT status FROM orders WHERE order_code = 10000000").first();
    expect(row).toEqual({ status: "failed" });
  });

  it("staging chỉ dùng số đơn tới 999.999 (QĐ18): vượt thì 503 order_code_exhausted, không đụng dải của production", async () => {
    await env.DB.exec(reserveSql(999_998));
    const w = makeWorld({ ENVIRONMENT: "staging" });
    const last = await w.call("POST", "/v1/checkout", valid);
    expect(last).toMatchObject({ status: 201, body: { order_code: 999_999 } });
    const over = await w.call("POST", "/v1/checkout", valid);
    expect(over).toMatchObject({ status: 503, body: { error: "order_code_exhausted" } });
    expect(w.payos.requests.filter((r) => r.method === "POST")).toHaveLength(1);
    expect(await env.DB.prepare("SELECT status FROM orders WHERE order_code = 1000000").first()).toEqual({ status: "failed" });
  });

  it("production (và dev) không bị trần của staging: số 1.000.000 vẫn tạo đơn được", async () => {
    await env.DB.exec(reserveSql(999_999));
    for (const ENVIRONMENT of ["production", "dev"]) {
      const w = makeWorld({ ENVIRONMENT });
      const res = await w.call("POST", "/v1/checkout", valid);
      expect(res.status).toBe(201);
    }
  });

  it("tạo đơn ghi nhật ký order_created kèm gói và số tiền, không có email", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", valid);
    const log = await env.DB.prepare("SELECT actor, action, license_id, order_code, detail FROM audit_log").all();
    expect(log.results).toEqual([
      {
        actor: "api",
        action: "order_created",
        license_id: null,
        order_code: res.body.order_code,
        detail: JSON.stringify({ plan: "pro", amount: 50000, currency: "VND" }),
      },
    ]);
  });

  it("key sai định dạng hay không tồn tại: tính một lần thất bại của IP; checkout không kèm key thì không tính", async () => {
    const w = makeWorld();
    const failures = () => env.DB.prepare("SELECT SUM(count) AS n FROM rate_limits WHERE bucket LIKE 'failure_ip:%'").first();
    expect((await w.call("POST", "/v1/checkout", valid)).status).toBe(201);
    expect(await failures()).toEqual({ n: null });
    expect(await w.call("POST", "/v1/checkout", { ...valid, license_key: "abc" })).toMatchObject({ status: 400, body: { field: "license_key" } });
    expect(await failures()).toEqual({ n: 1 });
    expect(await w.call("POST", "/v1/checkout", { ...valid, license_key: 42 })).toMatchObject({ status: 400, body: { field: "license_key" } });
    expect(await failures()).toEqual({ n: 2 });
    expect(await w.call("POST", "/v1/checkout", { ...valid, license_key: vectors.license_keys[0]!.input })).toMatchObject({
      status: 404,
      body: { error: "invalid_key" },
    });
    expect(await failures()).toEqual({ n: 3 });
  });

  it("IP đã chạm ngưỡng thất bại: checkout kèm license_key thì 429; checkout mới không kèm key vẫn tạo được (spec §10.2)", async () => {
    const w = makeWorld();
    const ip = { "cf-connecting-ip": "203.0.113.66" };
    for (let i = 0; i < 60; i++) await w.call("POST", "/v1/licenses/validate", { key: `SAI-${i}`, activation_id: crypto.randomUUID() }, ip);
    const withKey = await w.call("POST", "/v1/checkout", { ...valid, license_key: vectors.license_keys[0]!.input }, ip);
    expect(withKey).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(withKey.headers.get("retry-after")).toBe("3600");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first()).toEqual({ n: 0 });
    expect((await w.call("POST", "/v1/checkout", valid, ip)).status).toBe(201);
  });

  it("PayOS lỗi thì 502 và đơn chuyển failed", async () => {
    const w = makeWorld();
    w.payos.down = true;
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
    const row = await env.DB.prepare("SELECT status FROM orders WHERE order_code = 1").first<{ status: string }>();
    expect(row?.status).toBe("failed");
  });

  it("quá 10 lần mỗi giờ từ một IP thì 429 kèm Retry-After", async () => {
    const w = makeWorld();
    for (let i = 0; i < 10; i++) expect((await w.call("POST", "/v1/checkout", valid)).status).toBe(201);
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(res.headers.get("retry-after")).toBe("3600");
    const other = await w.call("POST", "/v1/checkout", valid, { "cf-connecting-ip": "198.51.100.2" });
    expect(other.status).toBe(201);
  });

  it("gia hạn hay đổi gói: trả ước tính license_expires_at và số ngày quy đổi, tính lúc tạo đơn", async () => {
    // License Professional còn 20 ngày (spec §6.8, ví dụ lên gói).
    await env.DB.prepare(
      `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at)
       VALUES ('L1', ?, 'a@example.com', 'pro', ?, ?3, ?3, ?3)`,
    )
      .bind(vectors.license_keys[0]!.normalized, T0 + 20 * DAY, T0 - 10 * DAY)
      .run();
    const w = makeWorld();
    const key = vectors.license_keys[0]!.input;
    const up = await w.call("POST", "/v1/checkout", { ...valid, plan: "pro_x2", license_key: key });
    expect(up).toMatchObject({ status: 201, body: { plan: "pro_x2", amount: 150000, license_expires_at: T0 + 36 * DAY, converted_days: 6 } });
    const same = await w.call("POST", "/v1/checkout", { ...valid, plan: "pro", license_key: key });
    expect(same.body).toMatchObject({ license_expires_at: T0 + 50 * DAY, converted_days: 0 });
    // Ước tính không đổi license.
    expect(await env.DB.prepare("SELECT plan, expires_at FROM licenses").first()).toEqual({ plan: "pro", expires_at: T0 + 20 * DAY });
    const row = await env.DB.prepare("SELECT renew_license_id FROM orders WHERE order_code = ?").bind(up.body.order_code).first();
    expect(row).toEqual({ renew_license_id: "L1" });
  });

  it("trang return và cancel trả HTML", async () => {
    const w = makeWorld();
    const res = await w.app.fetch(new Request("https://license.test/v1/pay/return"), w.env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("quay lại app");
    expect(html).toContain("<title>AI Translator</title>");
  });
});
