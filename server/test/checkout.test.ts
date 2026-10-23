import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PayOSProvider } from "../src/payment/payos";
import { resetDb, withFailingInsert } from "./db";
import { TEST_CHECKSUM_KEY } from "./fakes";
import vectors from "./vectors/token-v1.json";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

const valid = { plan: "monthly", email: " Buyer@Example.com ", consent: true };

/** Đúng câu lệnh giữ chỗ số đơn ở Task 21, Step 4 (`wrangler d1 execute … --command`), QĐ18. */
const reserveSql = (n: number) =>
  `INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES (${n}, 'reserved', 'none', 'monthly', 0, 'VND', 0, 'failed', 0, 0); DELETE FROM orders WHERE order_code = ${n};`;

describe("GET /v1/plans", () => {
  it("trả hai gói trả phí với tên, hạn mức, số ngày mỗi đơn và giá; không có Free", async () => {
    const res = await makeWorld().call("GET", "/v1/plans");
    expect(res).toEqual({
      status: 200,
      headers: expect.anything(),
      body: {
        suggested_currency: "VND",
        plans: [
          { code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000, USD: 399 } },
          { code: "yearly", name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000, USD: 3999 } },
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

  // Gói 6 Months (spec 2026-10-13 §2.3): app cũ không gửi `?plans=` nên nhận đúng response ở test đầu của mục này.
  const monthly = { code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000, USD: 399 } };
  const sixMonths = { code: "six_months", name: "6 Months", quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000, USD: 2199 } };
  const yearly = { code: "yearly", name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000, USD: 3999 } };

  it("app khai báo ?plans=monthly,six_months,yearly thì nhận ba gói theo thứ tự thời hạn", async () => {
    const res = await makeWorld().call("GET", "/v1/plans?plans=monthly,six_months,yearly");
    expect(res).toEqual({ status: 200, headers: expect.anything(), body: { suggested_currency: "VND", plans: [monthly, sixMonths, yearly] } });
  });

  it.each([
    ["chỉ khai báo gói mới: gói cũ vẫn có", "plans=six_months", [monthly, sixMonths, yearly]],
    ["tham số rỗng", "plans=", [monthly, yearly]],
    ["mã lạ bị bỏ qua", "plans=pro,free", [monthly, yearly]],
    ["tham số khác tên", "supports=six_months", [monthly, yearly]],
  ])("%s", async (_why, query, expected) => {
    const res = await makeWorld().call("GET", `/v1/plans?${query}`);
    expect(res).toMatchObject({ status: 200, body: { plans: expected } });
  });

  it("có ?plans= mà bảng gói thiếu thì vẫn 503 pricing_not_configured", async () => {
    expect(await makeWorld({ PLANS: undefined }).call("GET", "/v1/plans?plans=six_months")).toMatchObject({
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
      plan: "monthly",
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
    ["monthly", 50000],
    ["six_months", 269000],
    ["yearly", 500000],
  ])("gói %s: giá %i đ lấy từ biến PLANS", async (plan, amount) => {
    const res = await makeWorld().call("POST", "/v1/checkout", { ...valid, plan });
    expect(res).toMatchObject({ status: 201, body: { plan, amount, currency: "VND" } });
    expect(res.body).not.toHaveProperty("license_expires_at");
  });

  it("đổi giá trong PLANS là đổi giá bán, không cần sửa code", async () => {
    const plans = structuredClone(env.PLANS) as Record<string, { prices: Record<string, number> }>;
    plans.yearly!.prices.VND = 450000;
    const res = await makeWorld({ PLANS: plans }).call("POST", "/v1/checkout", { ...valid, plan: "yearly" });
    expect(res.body.amount).toBe(450000);
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
    // Mã gói cũ (trước spec 2026-10-07) không còn bán.
    [{ ...valid, plan: "pro" }, "plan"],
    [{ ...valid, plan: "pro_x5" }, "plan"],
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

  it("số đơn 1.000.000 tạo được ở production và test, không có trần riêng theo ENVIRONMENT", async () => {
    await env.DB.exec(reserveSql(999_999));
    // Hai lần tạo đơn liên tiếp trên cùng bộ đếm: đơn đầu là 1.000.000, đơn sau 1.000.001.
    for (const [index, ENVIRONMENT] of ["production", "test"].entries()) {
      const w = makeWorld({ ENVIRONMENT });
      const res = await w.call("POST", "/v1/checkout", valid);
      expect(res.status).toBe(201);
      expect(res.body.order_code).toBe(1_000_000 + index);
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
        detail: JSON.stringify({ plan: "monthly", amount: 50000, currency: "VND" }),
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

  describe("PayOS từ chối khóa API (hardening A6): cảnh báo payos_auth_failed", () => {
    type World = ReturnType<typeof makeWorld>;
    const payosWith = (w: World, fetchFn: (url: string, init?: RequestInit) => Promise<Response>) => {
      w.deps.payments.payos = new PayOSProvider(
        { baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: TEST_CHECKSUM_KEY },
        fetchFn,
      );
    };
    const reply = (status: number, code = String(status)) =>
      async () => new Response(JSON.stringify({ code, desc: "lỗi giả", data: null }), { status, headers: { "content-type": "application/json" } });
    const alerts = () => env.DB.prepare("SELECT kind, count FROM ops_alerts ORDER BY kind").all().then((r) => r.results);
    const failedOrders = () => env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'failed'").first<{ n: number }>();

    it.each([[401], [403]])("HTTP %i có thân JSON của PayOS: 502, đơn failed, cảnh báo payos_auth_failed (không phải creem_auth_failed)", async (status) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const w = makeWorld();
      payosWith(w, reply(status));
      expect(await w.call("POST", "/v1/checkout", valid)).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
      expect(await failedOrders()).toEqual({ n: 1 });
      expect(await alerts()).toEqual([{ kind: "payos_auth_failed", count: 1 }]);
    });

    it("403 HTML của tường lửa: 502, đơn failed, KHÔNG có cảnh báo khóa", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const w = makeWorld();
      payosWith(w, async () => new Response("<html>Access denied</html>", { status: 403, headers: { "content-type": "text/html" } }));
      expect((await w.call("POST", "/v1/checkout", valid)).status).toBe(502);
      expect(await failedOrders()).toEqual({ n: 1 });
      expect(await alerts()).toEqual([]);
    });

    it.each([[500], [502], [429], [400], [404]])("HTTP %i có thân JSON của PayOS: 502, KHÔNG có cảnh báo khóa", async (status) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const w = makeWorld();
      payosWith(w, reply(status));
      expect((await w.call("POST", "/v1/checkout", valid)).status).toBe(502);
      expect(await alerts()).toEqual([]);
    });

    it("lỗi nghiệp vụ HTTP 200 kèm code khác 00, và PayOS không trả lời: 502, không có cảnh báo khóa", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const w = makeWorld();
      payosWith(w, reply(200, "201"));
      expect((await w.call("POST", "/v1/checkout", valid)).status).toBe(502);
      w.payos.down = true;
      payosWith(w, w.payos.fetch);
      expect((await w.call("POST", "/v1/checkout", valid)).status).toBe(502);
      expect(await alerts()).toEqual([]);
    });

    it("tạo cảnh báo lỗi D1: cảnh báo không bao giờ đổi phản hồi trả khách (vẫn 502 payment_provider_error), đơn failed, ghi log checkout_alert_failed", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const w = makeWorld();
      payosWith(w, reply(401));
      const res = await withFailingInsert("ops_alerts", "NEW.kind = 'payos_auth_failed'", () => w.call("POST", "/v1/checkout", valid));
      expect(res).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
      expect(await failedOrders()).toEqual({ n: 1 });
      expect(await alerts()).toEqual([]);
      expect(error.mock.calls.map((c) => (JSON.parse(String(c[0])) as { event: string }).event)).toEqual(["checkout_failed", "checkout_alert_failed"]);
    });
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
    // License Monthly còn 20 ngày (spec 2026-10-07 §2.3, ví dụ lên gói).
    await env.DB.prepare(
      `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at)
       VALUES ('L1', ?, 'a@example.com', 'monthly', ?, ?3, ?3, ?3)`,
    )
      .bind(vectors.license_keys[0]!.normalized, T0 + 20 * DAY, T0 - 10 * DAY)
      .run();
    const w = makeWorld();
    const key = vectors.license_keys[0]!.input;
    const up = await w.call("POST", "/v1/checkout", { ...valid, plan: "yearly", license_key: key });
    expect(up).toMatchObject({ status: 201, body: { plan: "yearly", amount: 500000, license_expires_at: T0 + 389 * DAY, converted_days: 24 } });
    const same = await w.call("POST", "/v1/checkout", { ...valid, plan: "monthly", license_key: key });
    expect(same.body).toMatchObject({ license_expires_at: T0 + 50 * DAY, converted_days: 0 });
    // Ước tính không đổi license.
    expect(await env.DB.prepare("SELECT plan, expires_at FROM licenses").first()).toEqual({ plan: "monthly", expires_at: T0 + 20 * DAY });
    const row = await env.DB.prepare("SELECT renew_license_id FROM orders WHERE order_code = ?").bind(up.body.order_code).first();
    expect(row).toEqual({ renew_license_id: "L1" });
  });

  it("gói six_months: gọi PayOS đúng 269.000 đ, đơn lưu đúng gói và số tiền", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", { ...valid, plan: "six_months" });
    expect(res).toMatchObject({ status: 201, body: { order_code: 1, plan: "six_months", amount: 269000, currency: "VND" } });
    expect(w.payos.requests[0]).toMatchObject({ method: "POST", path: "/v2/payment-requests", body: { orderCode: 1, amount: 269000, description: "AT1" } });
    expect(await env.DB.prepare("SELECT plan, amount, status FROM orders WHERE order_code = 1").first()).toEqual({
      plan: "six_months",
      amount: 269000,
      status: "pending",
    });
  });

  it("gia hạn hay đổi gói sang six_months: ước tính theo spec 2026-10-13 §1 (Monthly còn 20 ngày → 22 ngày quy đổi, chạy 202 ngày)", async () => {
    await env.DB.prepare(
      `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at)
       VALUES ('L1', ?, 'a@example.com', 'monthly', ?, ?3, ?3, ?3)`,
    )
      .bind(vectors.license_keys[0]!.normalized, T0 + 20 * DAY, T0 - 10 * DAY)
      .run();
    const w = makeWorld();
    const key = vectors.license_keys[0]!.input;
    const up = await w.call("POST", "/v1/checkout", { ...valid, plan: "six_months", license_key: key });
    expect(up).toMatchObject({ status: 201, body: { plan: "six_months", amount: 269000, license_expires_at: T0 + 202 * DAY, converted_days: 22 } });
    // Ước tính không đổi license.
    expect(await env.DB.prepare("SELECT plan, expires_at FROM licenses").first()).toEqual({ plan: "monthly", expires_at: T0 + 20 * DAY });
  });

  it("trang return và cancel trả HTML", async () => {
    const w = makeWorld();
    const res = await w.app.fetch(new Request("https://license.test/v1/pay/return"), w.env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Thanh toán thành công");
    expect(html).toContain("Payment successful");
    expect(html).toContain("<title>AI Translator</title>");
    const cancel = await w.app.fetch(new Request("https://license.test/v1/pay/cancel"), w.env);
    expect(cancel.status).toBe(200);
    expect(cancel.headers.get("content-type")).toContain("text/html");
    const cancelHtml = await cancel.text();
    expect(cancelHtml).toContain("Đã hủy thanh toán");
    expect(cancelHtml).toContain("Payment cancelled");
  });

  it("lưu ngôn ngữ giao diện app (spec 2026-10-23): mã hợp lệ thì lưu; thiếu, sai kiểu hay mã lạ thì NULL mà vẫn tạo đơn", async () => {
    const w = makeWorld();
    const cases: [unknown, string | null][] = [
      ["ja", "ja"],
      ["vi", "vi"],
      [undefined, null],
      ["fr", null],
      ["VI", null],
      [5, null],
      [null, null],
    ];
    for (const [lang, stored] of cases) {
      const res = await w.call("POST", "/v1/checkout", lang === undefined ? valid : { ...valid, lang });
      expect(res.status, String(lang)).toBe(201);
      const row = await env.DB.prepare("SELECT lang FROM orders WHERE order_code = ?").bind(res.body.order_code as number).first();
      expect(row, String(lang)).toEqual({ lang: stored });
    }
  });
});
