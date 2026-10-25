// Trần tạo đơn toàn hệ thống (checkout_global) và cảnh báo mã đơn gần cạn (kiểm toán bảo mật 2026-10-25): mỗi đơn chèn vào orders
// dùng một order_code không hoàn lại được, nên kẻ tấn công đốt được mã mà không tốn tiền.
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ORDER_CODE, ORDER_CODE_WARN_AT } from "../src/checkout";
import { hmacSha256Hex } from "../src/crypto";
import { LIMITS } from "../src/ratelimit";
import { resetDb, withFailingInsert } from "./db";
import { makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

const valid = { plan: "monthly", email: "buyer@example.com", consent: true };

/** Giữ chỗ số đơn như test/checkout.test.ts (QĐ18): chèn rồi xóa một dòng, AUTOINCREMENT nhớ số lớn nhất đã dùng. */
const reserveSql = (n: number) =>
  `INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES (${n}, 'reserved', 'none', 'monthly', 0, 'VND', 0, 'failed', 0, 0); DELETE FROM orders WHERE order_code = ${n};`;

/** IPv4 riêng cho từng số thứ tự, để mỗi request đến từ một IP khác nhau (không chạm checkout_ip). */
const ipOf = (i: number) => ({ "cf-connecting-ip": `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}` });

const alerts = () => env.DB.prepare("SELECT kind, window_start, count FROM ops_alerts ORDER BY kind, window_start").all().then((r) => r.results);
const orderCount = () => env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first<{ n: number }>().then((r) => r!.n);

const bucketOf = async (name: string, subject: string) => `${name}:${await hmacSha256Hex(env.RATE_LIMIT_PEPPER, subject)}`;
/** Đặt thẳng bộ đếm của cửa sổ giờ chứa `at`, để khỏi gửi hàng trăm request chỉ để làm đầy. */
async function setCount(name: "checkout_ip" | "checkout_global", subject: string, at: number, count: number) {
  await env.DB.prepare(
    "INSERT INTO rate_limits (bucket, window_start, count) VALUES (?1, ?2, ?3) ON CONFLICT (bucket, window_start) DO UPDATE SET count = ?3",
  )
    .bind(await bucketOf(name, subject), at - (at % 3600), count)
    .run();
}
async function getCount(name: "checkout_ip" | "checkout_global", subject: string, at: number) {
  const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?")
    .bind(await bucketOf(name, subject), at - (at % 3600))
    .first<{ count: number }>();
  return row?.count ?? 0;
}
const errorEvents = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);

describe("trần tạo đơn toàn hệ thống (checkout_global)", () => {
  it("hằng số: 600 mỗi giờ; ngưỡng cảnh báo mã đơn là 80% của 9.999.999", () => {
    expect(LIMITS.checkout_global).toBe(600);
    expect(MAX_ORDER_CODE).toBe(9_999_999);
    expect(ORDER_CODE_WARN_AT).toBe(7_999_999);
  });

  it("600 đơn hợp lệ từ 600 IP khác nhau qua được; đơn thứ 601 bị 429 kèm Retry-After, không tạo đơn, không gọi PayOS, đúng một cảnh báo checkout_flood", async () => {
    const w = makeWorld();
    for (let i = 1; i <= LIMITS.checkout_global; i++) {
      const res = await w.call("POST", "/v1/checkout", valid, ipOf(i));
      if (res.status !== 201) throw new Error(`đơn ${i}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    expect(await orderCount()).toBe(600);
    expect(w.payos.requests).toHaveLength(600);
    // Đơn thứ 600 là đơn cuối còn qua: chưa có cảnh báo.
    expect(await alerts()).toEqual([]);

    const blocked = await w.call("POST", "/v1/checkout", valid, ipOf(601));
    expect(blocked).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(blocked.headers.get("retry-after")).toBe("3600");
    expect(await alerts()).toEqual([{ kind: "checkout_flood", window_start: T0, count: 1 }]);

    // Các request bị từ chối tiếp theo trong giờ này (IP khác, kể cả thân sai) cũng 429 và không báo thêm.
    w.clock.now = T0 + 1200;
    const again = await w.call("POST", "/v1/checkout", valid, ipOf(602));
    expect(again.status).toBe(429);
    expect(again.headers.get("retry-after")).toBe("2400");
    expect((await w.call("POST", "/v1/checkout", "{", ipOf(603))).status).toBe(429);
    expect(await alerts()).toEqual([{ kind: "checkout_flood", window_start: T0, count: 1 }]);
    expect(await orderCount()).toBe(600);
    expect(w.payos.requests).toHaveLength(600);
  }, 60_000);

  it("cửa sổ giờ mới thì tạo đơn lại được; chạm trần ở giờ mới thì có cảnh báo mới của giờ đó", async () => {
    const w = makeWorld();
    await setCount("checkout_global", "all", T0, LIMITS.checkout_global);
    expect((await w.call("POST", "/v1/checkout", valid, ipOf(1))).status).toBe(429);
    expect(await alerts()).toEqual([{ kind: "checkout_flood", window_start: T0, count: 1 }]);

    w.clock.now = T0 + 3600;
    expect((await w.call("POST", "/v1/checkout", valid, ipOf(1))).status).toBe(201);
    expect(await getCount("checkout_global", "all", T0 + 3600)).toBe(1);
    expect(await getCount("checkout_global", "all", T0)).toBe(LIMITS.checkout_global + 1);

    await setCount("checkout_global", "all", T0 + 3600, LIMITS.checkout_global);
    expect((await w.call("POST", "/v1/checkout", valid, ipOf(2))).status).toBe(429);
    expect(await alerts()).toEqual([
      { kind: "checkout_flood", window_start: T0, count: 1 },
      { kind: "checkout_flood", window_start: T0 + 3600, count: 1 },
    ]);
  });

  it("IP đã bị checkout_ip chặn thì không tiêu bộ đếm toàn hệ thống", async () => {
    const w = makeWorld();
    const ip = { "cf-connecting-ip": "203.0.113.50" };
    for (let i = 0; i < LIMITS.checkout_ip; i++) expect((await w.call("POST", "/v1/checkout", valid, ip)).status).toBe(201);
    expect(await getCount("checkout_global", "all", T0)).toBe(10);
    for (let i = 0; i < 5; i++) expect((await w.call("POST", "/v1/checkout", valid, ip)).status).toBe(429);
    expect(await getCount("checkout_global", "all", T0)).toBe(10);
    expect(await getCount("checkout_ip", "203.0.113.50", T0)).toBe(LIMITS.checkout_ip + 5);
  });

  it("thứ tự IP rồi toàn hệ thống: trần chung đã đầy mà IP đã bị chặn thì vẫn 429 do IP, bộ đếm chung không tăng và không có cảnh báo", async () => {
    const w = makeWorld();
    await setCount("checkout_global", "all", T0, LIMITS.checkout_global);
    await setCount("checkout_ip", "203.0.113.51", T0, LIMITS.checkout_ip);
    const res = await w.call("POST", "/v1/checkout", valid, { "cf-connecting-ip": "203.0.113.51" });
    expect(res.status).toBe(429);
    expect(await getCount("checkout_global", "all", T0)).toBe(LIMITS.checkout_global);
    expect(await alerts()).toEqual([]);
  });

  it("lỗi ghi cảnh báo checkout_flood không đổi phản hồi (vẫn 429 kèm Retry-After), chỉ ghi log checkout_alert_failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const w = makeWorld();
    await setCount("checkout_global", "all", T0, LIMITS.checkout_global);
    const res = await withFailingInsert("ops_alerts", "NEW.kind = 'checkout_flood'", () => w.call("POST", "/v1/checkout", valid, ipOf(1)));
    expect(res).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(res.headers.get("retry-after")).toBe("3600");
    expect(await alerts()).toEqual([]);
    expect(errorEvents(error).map((l) => [l.event, l.kind])).toEqual([["checkout_alert_failed", "checkout_flood"]]);
    expect(JSON.stringify(errorEvents(error))).not.toContain("buyer@example.com");
  });
});

describe("cảnh báo mã đơn gần cạn (order_code_near_limit)", () => {
  it("dưới ngưỡng: không có cảnh báo; từ ORDER_CODE_WARN_AT trở lên: mỗi đơn một lần đếm, phản hồi vẫn thành công như thường", async () => {
    // Đơn kế tiếp là ORDER_CODE_WARN_AT - 1.
    await env.DB.exec(reserveSql(ORDER_CODE_WARN_AT - 2));
    const w = makeWorld();
    const below = await w.call("POST", "/v1/checkout", valid);
    expect(below).toMatchObject({ status: 201, body: { order_code: ORDER_CODE_WARN_AT - 1 } });
    expect(await alerts()).toEqual([]);

    const at = await w.call("POST", "/v1/checkout", valid, ipOf(1));
    expect(at).toMatchObject({
      status: 201,
      body: { order_code: ORDER_CODE_WARN_AT, provider: "payos", plan: "monthly", amount: 50000, currency: "VND", expires_at: T0 + 900 },
    });
    expect(at.body.order_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await alerts()).toEqual([{ kind: "order_code_near_limit", window_start: T0, count: 1 }]);
    expect(w.payos.requests.at(-1)!.body).toMatchObject({ orderCode: ORDER_CODE_WARN_AT, description: `AT${ORDER_CODE_WARN_AT}` });

    expect((await w.call("POST", "/v1/checkout", valid, ipOf(2))).status).toBe(201);
    expect(await alerts()).toEqual([{ kind: "order_code_near_limit", window_start: T0, count: 2 }]);
  });

  it("đơn USD (Creem) cũng qua cùng cổng cảnh báo", async () => {
    await env.DB.exec(reserveSql(ORDER_CODE_WARN_AT - 1));
    const res = await makeWorld().call("POST", "/v1/checkout", { ...valid, currency: "USD" });
    expect(res).toMatchObject({ status: 201, body: { order_code: ORDER_CODE_WARN_AT, provider: "creem", currency: "USD" } });
    expect(await alerts()).toEqual([{ kind: "order_code_near_limit", window_start: T0, count: 1 }]);
  });

  it("đã cạn (vượt 9.999.999): vẫn 503 order_code_exhausted, đơn failed, không gọi PayOS, và có cảnh báo gần cạn (nhánh cạn chỉ có log)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await env.DB.exec(reserveSql(MAX_ORDER_CODE));
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res).toMatchObject({ status: 503, body: { error: "order_code_exhausted" } });
    expect(w.payos.requests).toHaveLength(0);
    expect(await env.DB.prepare("SELECT status FROM orders WHERE order_code = ?").bind(MAX_ORDER_CODE + 1).first()).toEqual({ status: "failed" });
    expect(await alerts()).toEqual([{ kind: "order_code_near_limit", window_start: T0, count: 1 }]);
  });

  it("lỗi ghi cảnh báo không đổi phản hồi: đơn vẫn 201 và gọi PayOS, chỉ ghi log checkout_alert_failed kèm mã đơn", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await env.DB.exec(reserveSql(ORDER_CODE_WARN_AT - 1));
    const w = makeWorld();
    const res = await withFailingInsert("ops_alerts", "NEW.kind = 'order_code_near_limit'", () => w.call("POST", "/v1/checkout", valid));
    expect(res).toMatchObject({ status: 201, body: { order_code: ORDER_CODE_WARN_AT, provider: "payos" } });
    expect(w.payos.requests).toHaveLength(1);
    expect(await env.DB.prepare("SELECT status, provider_ref FROM orders WHERE order_code = ?").bind(ORDER_CODE_WARN_AT).first()).toEqual({
      status: "pending",
      provider_ref: `plink${ORDER_CODE_WARN_AT}`,
    });
    expect(await alerts()).toEqual([]);
    expect(errorEvents(error).map((l) => [l.event, l.kind, l.order_code])).toEqual([["checkout_alert_failed", "order_code_near_limit", ORDER_CODE_WARN_AT]]);
  });

  it("lỗi ghi cảnh báo ở nhánh cạn: vẫn 503 order_code_exhausted như cũ (không thành 500)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await env.DB.exec(reserveSql(MAX_ORDER_CODE));
    const w = makeWorld();
    const res = await withFailingInsert("ops_alerts", "NEW.kind = 'order_code_near_limit'", () => w.call("POST", "/v1/checkout", valid));
    expect(res).toMatchObject({ status: 503, body: { error: "order_code_exhausted" } });
    expect(await env.DB.prepare("SELECT status FROM orders WHERE order_code = ?").bind(MAX_ORDER_CODE + 1).first()).toEqual({ status: "failed" });
    expect(errorEvents(error).map((l) => l.event)).toEqual(["checkout_alert_failed", "order_code_exhausted"]);
  });
});
