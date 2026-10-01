import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { raiseAlert } from "../src/alerts";
import worker from "../src/index";
import { reconcile } from "../src/reconcile";
import { resetDb, wrapDb } from "./db";
import { FakeGateway } from "./fakes";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

async function newOrder(w: ReturnType<typeof makeWorld>) {
  const res = await w.call("POST", "/v1/checkout", { plan: "pro", email: "buyer@example.com", consent: true });
  return res.body.order_code as number;
}

const status = async (orderCode: number) =>
  (await env.DB.prepare("SELECT status FROM orders WHERE order_code = ?").bind(orderCode).first<{ status: string }>())?.status;

describe("đối soát mỗi 5 phút", () => {
  it("webhook bị mất: đối soát thấy PAID thì cấp license và gửi email", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toEqual({ checked: 1, granted: 1, errors: 0, emails_retried: 0, alerts_sent: 0 });
    expect(await status(orderCode)).toBe("paid");
    expect(w.resend.sent).toHaveLength(1);
  });

  it("webhook gửi trùng và đối soát chạy cùng lúc: chỉ cấp một lần, một email", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    const [r1, r2, rec] = await Promise.all([
      w.call("POST", "/v1/webhooks/payos", body),
      w.call("POST", "/v1/webhooks/payos", body),
      reconcile(w.env, w.deps),
    ]);
    const byWebhook = [r1, r2].filter((r) => r.body.result === "granted").length;
    expect(byWebhook + rec.granted).toBe(1);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses").first<{ n: number }>();
    expect(n?.n).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
  });

  it("trong giờ đầu hỏi lại sau mỗi 4 phút; sau đó mỗi giờ", async () => {
    const w = makeWorld();
    await newOrder(w);
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).checked).toBe(1);
    w.clock.now = T0 + 360;
    expect((await reconcile(w.env, w.deps)).checked).toBe(0);
    w.clock.now = T0 + 600;
    expect((await reconcile(w.env, w.deps)).checked).toBe(1);
    w.clock.now = T0 + 2 * 3600;
    expect((await reconcile(w.env, w.deps)).checked).toBe(1);
    w.clock.now = T0 + 2 * 3600 + 1800;
    expect((await reconcile(w.env, w.deps)).checked).toBe(0);
  });

  it("PayOS báo EXPIRED hay CANCELLED thì ghi nhận và thôi hỏi", async () => {
    const w = makeWorld();
    const a = await newOrder(w);
    const b = await newOrder(w);
    w.payos.setStatus(a, "EXPIRED");
    w.payos.setStatus(b, "CANCELLED");
    w.clock.now = T0 + 1000;
    await reconcile(w.env, w.deps);
    expect([await status(a), await status(b)]).toEqual(["expired", "cancelled"]);
    w.clock.now = T0 + 2000;
    expect((await reconcile(w.env, w.deps)).checked).toBe(0);
  });

  it("license đã thu hồi: đối soát chuyển đơn sang paid_needs_review một lần, rồi không hỏi lại, không gửi thư", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    w.resend.sent.length = 0;
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0).run();
    const res = await w.call("POST", "/v1/checkout", { plan: "pro", email: "buyer@example.com", consent: true, license_key: licenseKey });
    expect(res.status).toBe(403); // checkout từ chối license đã thu hồi
    // Đơn tạo trước lúc thu hồi.
    await env.DB.prepare("UPDATE licenses SET revoked_at = NULL").run();
    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "buyer@example.com", consent: true, license_key: licenseKey });
    const orderCode = co.body.order_code as number;
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0 + 60).run();
    w.payos.pay(orderCode);
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 0, errors: 0 });
    expect(await status(orderCode)).toBe("paid_needs_review");
    const asked = w.payos.requests.filter((r) => r.method === "GET").length;
    w.clock.now = T0 + 900;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 0 });
    expect(w.payos.requests.filter((r) => r.method === "GET").length).toBe(asked);
    expect(w.resend.sent.filter((m) => m.to.includes("buyer@example.com"))).toHaveLength(0);
  });

  it("chuyển thiếu rồi chuyển bù trong 24 giờ: đối soát thấy PAID thì cấp", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode, 1500);
    w.clock.now = T0 + 300;
    await reconcile(w.env, w.deps);
    expect(await status(orderCode)).toBe("underpaid");
    w.payos.pay(orderCode, 48500);
    w.clock.now = T0 + 5 * 3600;
    expect((await reconcile(w.env, w.deps)).granted).toBe(1);
    expect(await status(orderCode)).toBe("paid");
  });

  it("đơn chờ quá 24 giờ thì coi là hết hạn; đơn chuyển thiếu giữ nguyên để hỗ trợ xử lý", async () => {
    const w = makeWorld();
    const pending = await newOrder(w);
    const under = await newOrder(w);
    w.payos.pay(under, 100);
    w.clock.now = T0 + 300;
    await reconcile(w.env, w.deps);
    w.clock.now = T0 + DAY + 1;
    await reconcile(w.env, w.deps);
    expect([await status(pending), await status(under)]).toEqual(["expired", "underpaid"]);
  });

  it("đối soát hỏi đúng cổng ghi ở orders.provider", async () => {
    const w = makeWorld();
    const gw = new FakeGateway();
    w.deps.payments.fakepay = gw;
    const orderCode = await newOrder(w);
    await env.DB.prepare("UPDATE orders SET provider = 'fakepay' WHERE order_code = ?").bind(orderCode).run();
    gw.paid.add(orderCode);
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).granted).toBe(1);
    expect(gw.statusCalls).toEqual([orderCode]);
    expect(w.payos.requests.filter((r) => r.method === "GET")).toHaveLength(0);
  });

  it("PayOS lỗi thì đếm lỗi, lần sau vẫn hỏi lại", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.down = true;
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 0, errors: 1 });
    w.payos.down = false;
    w.payos.pay(orderCode);
    w.clock.now = T0 + 600;
    expect((await reconcile(w.env, w.deps)).granted).toBe(1);
  });

  it("email lỗi tạm (5xx): gửi lại sau 5 phút, 15 phút, rồi 1 giờ; cùng idempotency key; cảnh báo một lần", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.down = true;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(w.resend.attempts).toBe(1);
    const retried = async (now: number) => {
      w.clock.now = now;
      return (await reconcile(w.env, w.deps)).emails_retried;
    };
    expect(await retried(T0 + 299)).toBe(0);
    expect(await retried(T0 + 300)).toBe(1); // lần 2, lỗi: hẹn +15 phút
    expect(await retried(T0 + 300 + 899)).toBe(0);
    expect(await retried(T0 + 300 + 900)).toBe(1); // lần 3, lỗi: hẹn +1 giờ
    expect(await retried(T0 + 1200 + 3599)).toBe(0);
    w.resend.down = false;
    expect(await retried(T0 + 1200 + 3600)).toBe(1); // lần 4, thành công
    expect(w.resend.attempts).toBe(4);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]!.idempotencyKey).toBe(`dev-order-${orderCode}`);
    expect(await retried(T0 + 6 * 3600)).toBe(0);
    const alert = await env.DB.prepare("SELECT SUM(count) AS n FROM ops_alerts WHERE kind = 'email_failed'").first();
    expect(alert).toEqual({ n: 1 });
  });

  it("sau lần thứ 3 thì gửi lại mỗi 6 giờ", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.failStatus = 429;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    for (const t of [300, 1200, 4800]) {
      w.clock.now = T0 + t;
      await reconcile(w.env, w.deps);
    }
    const row = await env.DB.prepare("SELECT email_attempts, email_retry_at FROM orders").first();
    expect(row).toEqual({ email_attempts: 4, email_retry_at: T0 + 4800 + 6 * 3600 });
  });

  it.each([
    [403, "validation_error"],
    [409, "concurrent_idempotent_requests"],
  ])("email lỗi %i %s (cấu hình sai, hay hai lượt gửi chồng nhau) là lỗi tạm: được gửi lại", async (status, name) => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.failStatus = status;
    w.resend.failName = name;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    const row = await env.DB.prepare("SELECT email_attempts, email_gave_up_at, email_retry_at FROM orders").first();
    expect(row).toEqual({ email_attempts: 1, email_gave_up_at: null, email_retry_at: T0 + 300 });
    w.resend.failStatus = null;
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]!.idempotencyKey).toBe(`dev-order-${orderCode}`);
  });

  it("Resend trả 409 invalid_idempotent_request (khóa đã dùng với nội dung khác): coi là thư đã gửi, thôi gửi lại", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.down = true;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    // Lần đầu Resend đã nhận thư nhưng trả lỗi; lần gửi lại mang hạn mới của license nên body khác.
    w.resend.down = false;
    w.resend.failStatus = 409;
    w.resend.failName = "invalid_idempotent_request";
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(1);
    const row = await env.DB.prepare("SELECT email_attempts, email_sent_at, email_retry_at, email_gave_up_at FROM orders").first();
    expect(row).toEqual({ email_attempts: 2, email_sent_at: T0 + 300, email_retry_at: null, email_gave_up_at: null });
    w.clock.now = T0 + 6 * 3600;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(0);
    expect(w.resend.attempts).toBe(2);
    const alert = await env.DB.prepare("SELECT SUM(count) AS n FROM ops_alerts WHERE kind = 'email_failed'").first();
    expect(alert).toEqual({ n: 1 });
  });

  it("email lỗi vĩnh viễn (422): thôi gửi lại, cảnh báo một lần", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.failStatus = 422;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    const row = await env.DB.prepare("SELECT email_attempts, email_gave_up_at, email_retry_at FROM orders").first();
    expect(row).toEqual({ email_attempts: 1, email_gave_up_at: T0, email_retry_at: null });
    w.resend.failStatus = null;
    w.clock.now = T0 + 3600;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(0);
    expect(w.resend.attempts).toBe(1);
    const alert = await env.DB.prepare("SELECT SUM(count) AS n FROM ops_alerts WHERE kind = 'email_failed'").first();
    expect(alert).toEqual({ n: 1 });
  });

  it("đơn đã cấp mà chưa thử gửi thư lần nào (Worker dừng giữa chừng): cron gửi sau 5 phút", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    await env.DB.prepare("UPDATE orders SET email_sent_at = NULL, email_attempts = 0").run();
    w.resend.sent.length = 0;
    w.clock.now = T0 + 299;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(0);
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
  });

  it("email chưa gửi được quá 24 giờ thì thôi gửi lại", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.down = true;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    w.resend.down = false;
    w.clock.now = T0 + DAY + 1;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(0);
  });

  it("không gửi lại thư cho license đã bị thu hồi", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.down = true;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    w.resend.down = false;
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0 + 60).run();
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(0);
    expect(w.resend.sent).toHaveLength(0);
  });

  it("gửi lại thư lỗi ở một đơn thì các đơn sau vẫn được gửi, và các bước sau vẫn chạy", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld({ OPERATOR_EMAIL: "ops@example.com" });
    const a = await newOrder(w);
    const b = await newOrder(w);
    w.resend.down = true;
    for (const n of [a, b]) {
      w.payos.pay(n);
      await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(n));
    }
    w.resend.down = false;
    let first = true;
    const { db } = wrapDb(env.DB, (sql) => {
      if (!sql.includes("SELECT email_attempts") || !first) return false;
      first = false;
      return true;
    });
    w.clock.now = T0 + 300;
    const res = await reconcile({ ...w.env, DB: db }, w.deps);
    expect(res).toMatchObject({ emails_retried: 2, alerts_sent: 1 });
    expect(w.resend.sent.filter((m) => m.to.includes("buyer@example.com"))).toHaveLength(1);
    const logged = error.mock.calls.map((c) => JSON.parse(c[0] as string) as Record<string, unknown>);
    expect(logged).toContainEqual(expect.objectContaining({ event: "email_retry_failed", order_code: a }));
    vi.restoreAllMocks();
  });

  it("một bước lỗi (kể cả câu ghi trong catch) thì các bước sau vẫn chạy: cảnh báo, dọn bộ đếm", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld({ OPERATOR_EMAIL: "ops@example.com" });
    await newOrder(w);
    await raiseAlert(env.DB, "license_locked", T0);
    await env.DB.prepare("INSERT INTO rate_limits (bucket, window_start, count) VALUES ('cu', ?, 1)").bind(T0 - 3 * 3600).run();
    w.payos.down = true;
    const { db } = wrapDb(
      env.DB,
      (sql) => sql.includes("SET last_checked_at") || sql.includes("SET status = 'expired'") || sql.includes("FROM orders o JOIN licenses"),
    );
    w.clock.now = T0 + 300;
    expect(await reconcile({ ...w.env, DB: db }, w.deps)).toMatchObject({ checked: 1, errors: 1, emails_retried: 0, alerts_sent: 1 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE bucket = 'cu'").first()).toEqual({ n: 0 });
    const events = error.mock.calls.map((c) => (JSON.parse(c[0] as string) as { event: string }).event);
    expect(events).toEqual(["reconcile_failed", "reconcile_mark_failed", "reconcile_step_failed", "reconcile_step_failed"]);
    vi.restoreAllMocks();
  });

  it("PayOS trả 429: dừng cả đợt, các bước sau vẫn chạy", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = makeWorld();
    for (let i = 0; i < 4; i++) await newOrder(w);
    w.payos.statusFailures = [429];
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, errors: 1 });
    expect(w.payos.requests.filter((r) => r.method === "GET")).toHaveLength(1);
    expect(warn.mock.calls.map((c) => JSON.parse(c[0] as string))).toContainEqual({ event: "reconcile_stopped_early", reason: "rate_limited", skipped: 3 });
    vi.restoreAllMocks();
  });

  it("PayOS trả 5xx 3 lần liên tiếp: dừng cả đợt; 5xx xen kẽ lần trả lời bình thường thì không dừng", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = makeWorld();
    for (let i = 0; i < 5; i++) await newOrder(w);
    w.payos.statusFailures = [503, 502, 500, 503];
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 3, errors: 3 });
    expect(w.payos.requests.filter((r) => r.method === "GET")).toHaveLength(3);
    expect(warn.mock.calls.map((c) => JSON.parse(c[0] as string))).toContainEqual({ event: "reconcile_stopped_early", reason: "server_errors", skipped: 2 });
    await resetDb();
    const w2 = makeWorld();
    for (let i = 0; i < 5; i++) await newOrder(w2);
    w2.payos.statusFailures = [503, 503, 200, 503, 503];
    w2.clock.now = T0 + 300;
    expect(await reconcile(w2.env, w2.deps)).toMatchObject({ checked: 5, errors: 4 });
    vi.restoreAllMocks();
  });

  it("gửi cảnh báo cho OPERATOR_EMAIL", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld({ OPERATOR_EMAIL: "ops@example.com" });
    await raiseAlert(env.DB, "license_locked", T0);
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).alerts_sent).toBe(1);
    expect(w.resend.sent[0]).toMatchObject({ to: ["ops@example.com"], subject: "[license dev] Cảnh báo: license_locked (1)" });
    vi.restoreAllMocks();
  });

  it("Cron Trigger của Worker gọi đối soát (không có đơn nào thì không gọi mạng)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "*/5 * * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({ event: "reconcile", checked: 0, granted: 0, errors: 0, emails_retried: 0, alerts_sent: 0 }),
    );
    log.mockRestore();
  });

  it("Cron Trigger: đối soát lỗi ngoài dự kiến (ví dụ không dựng được deps) thì ghi log, không để promise bị từ chối", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = new Proxy(env, {
      get(target, prop) {
        if (prop === "PAYOS_BASE_URL") throw new Error("env hỏng");
        return Reflect.get(target, prop);
      },
    });
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "*/5 * * * *" }), broken, ctx);
    await waitOnExecutionContext(ctx);
    expect(error).toHaveBeenCalledWith(JSON.stringify({ event: "reconcile_crashed", error: "Error: env hỏng" }));
    error.mockRestore();
  });
});
