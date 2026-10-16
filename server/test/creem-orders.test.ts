import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex } from "../src/crypto";
import { fulfilOrder } from "../src/orders";
import { CREEM_CHECKOUT_HOST, CreemProvider } from "../src/payment/creem";
import { reconcile } from "../src/reconcile";
import { makeAdmin } from "./admin-harness";
import { resetDb, withFailingInsert } from "./db";
import { FakeCreem, TEST_CREEM_API_KEY, TEST_CREEM_PRODUCTS, TEST_CREEM_WEBHOOK_SECRET } from "./fakes";
import { DAY, makeWorld, T0 } from "./world";
// Thân thật của Creem sandbox ngày 2026-10-16 (test/fixtures/creem/README.md): đúng từng byte; test tự ký bằng secret của kênh.
import checkoutCompletedReal from "./fixtures/creem/checkout.completed.real.json?raw";
import createCheckoutReal from "./fixtures/creem/create-checkout.real.json?raw";
import getPaidReal from "./fixtures/creem/get-checkout.paid.real.json?raw";
import getPendingReal from "./fixtures/creem/get-checkout.pending.real.json?raw";
import refundCreatedReal from "./fixtures/creem/refund.created.real.json?raw";

beforeEach(resetDb);
// Gỡ mọi spy (console.warn, console.error...) kể cả khi test đỏ giữa chừng, để console của test sau không bị nuốt.
afterEach(() => {
  vi.restoreAllMocks();
});

const usd = { plan: "monthly", email: "buyer@example.com", consent: true, currency: "USD" };

type World = ReturnType<typeof makeWorld>;

/** Tạo đơn USD qua Creem; trả mã đơn, token và mã phiên của Creem. */
async function checkout(w: World, extra: Record<string, unknown> = {}) {
  const res = await w.call("POST", "/v1/checkout", { ...usd, ...extra });
  if (res.status !== 201) throw new Error(`checkout ${res.status} ${JSON.stringify(res.body)}`);
  const orderCode = res.body.order_code as number;
  return { orderCode, token: res.body.order_token as string, checkoutId: w.creem.checkoutIdOf(orderCode) };
}

const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;
/** Mã các đơn đã tạo, theo thứ tự: phản hồi 502 của checkout không mang mã đơn (đơn đã failed), nên test lấy mã từ D1, không ghi cứng. */
const orderCodes = () =>
  env.DB.prepare("SELECT order_code FROM orders ORDER BY order_code")
    .all<{ order_code: number }>()
    .then((r) => r.results.map((x) => x.order_code));
/** Mã của đơn duy nhất đã tạo (đòi đúng một đơn). */
async function onlyOrderCode(): Promise<number> {
  const codes = await orderCodes();
  expect(codes).toHaveLength(1);
  return codes[0]!;
}
const orderRow = (orderCode: number) =>
  env.DB.prepare("SELECT status, amount_paid, currency, provider FROM orders WHERE order_code = ?").bind(orderCode).first();
/** Các dòng log JSON mà spy (console.warn, console.error) đã bắt, theo thứ tự. */
const logged = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
const alertRows = () => env.DB.prepare("SELECT kind, count FROM ops_alerts ORDER BY kind").all().then((r) => r.results);
/** Nhật ký của một hành động, theo thứ tự ghi, `detail` đã parse. */
const auditLog = (action: string) =>
  env.DB.prepare("SELECT actor, order_code, detail FROM audit_log WHERE action = ? ORDER BY id")
    .bind(action)
    .all<{ actor: string; order_code: number | null; detail: string }>()
    .then((r) => r.results.map((x) => ({ ...x, detail: JSON.parse(x.detail) as Record<string, unknown> })));
/** Nhật ký `payment_unmatched` (webhook đúng chữ ký mà không khớp đơn nào), theo thứ tự ghi, `detail` đã parse. */
const unmatchedLogs = () =>
  env.DB.prepare("SELECT actor, license_id, order_code, detail FROM audit_log WHERE action = 'payment_unmatched' ORDER BY id")
    .all<{ actor: string; license_id: string | null; order_code: number | null; detail: string }>()
    .then((r) => r.results.map((x) => ({ ...x, detail: JSON.parse(x.detail) as Record<string, unknown> })));
/** Gọi webhook Creem với thân thô ký đúng bằng secret của kênh. */
async function signedRaw(w: World, raw: string) {
  return w.call("POST", "/v1/webhooks/creem", raw, { "creem-signature": await hmacSha256Hex(TEST_CREEM_WEBHOOK_SECRET, raw) });
}

describe("webhook Creem: checkout.completed", () => {
  it("khách trả đủ: server hỏi lại Creem rồi cấp license 30 ngày, gửi một email có key, app thấy key khi hỏi đơn", async () => {
    const w = makeWorld();
    const { orderCode, token, checkoutId } = await checkout(w);
    expect((await w.getOrder(orderCode, token)).body).toEqual({
      order_code: orderCode,
      status: "pending",
      plan: "monthly",
      amount: 399,
      currency: "USD",
      expires_at: T0 + 1800,
    });

    w.clock.now = T0 + 120;
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    const wh = await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
    expect(wh).toMatchObject({ status: 200, body: { ok: true, result: "granted" } });
    // Webhook chỉ là cái cò: server hỏi lại API của Creem trước khi cấp.
    expect(w.creem.requests.at(-1)).toMatchObject({ method: "GET", path: `/v1/checkouts?checkout_id=${checkoutId}` });
    expect(w.payos.requests).toHaveLength(0);

    const paid = await w.getOrder(orderCode, token);
    expect(paid.body).toMatchObject({ status: "paid", grant_kind: "new", license_plan: "monthly", license_expires_at: T0 + 120 + 30 * DAY });
    const key = paid.body.license_key as string;
    expect(key).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]).toMatchObject({ to: ["buyer@example.com"], idempotencyKey: `test-order-${orderCode}` });
    expect(w.resend.sent[0]!.text).toContain(key);
    expect(await orderRow(orderCode)).toEqual({ status: "paid", amount_paid: 399, currency: "USD", provider: "creem" });
  });

  it("khách trả thêm thuế ngoài giá: amount_paid vẫn là giá niêm yết (doanh thu không cộng thuế)", async () => {
    const w = makeWorld();
    const { orderCode } = await w.buyCreem({ tax: 80 });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid", amount_paid: 399 });
  });

  it.each([
    ["webhook tới 100 giây sau hạn link", "webhook", 1900],
    ["đối soát chạy 3 giờ sau hạn link", "reconcile", 3 * 3600],
  ] as const)(
    "khách trả sau expires_at của đơn (%s) nhưng còn trong thời gian giữ 24 giờ: vẫn cấp; paymentTime kẹp về expires_at nên gói tính từ hạn của link, không từ lúc xử lý",
    async (_why, via, offset) => {
      const w = makeWorld();
      const { orderCode, token, checkoutId } = await checkout(w);
      const linkExpires = T0 + 1800; // CREEM_CHECKOUT_TTL_SECONDS: 30 phút
      expect((await w.getOrder(orderCode, token)).body).toMatchObject({ status: "pending", expires_at: linkExpires });
      w.creem.pay(checkoutId);
      w.clock.now = T0 + offset;
      expect(w.clock.now).toBeGreaterThan(linkExpires);
      if (via === "webhook") {
        const hook = await w.creem.completedWebhook(checkoutId);
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "granted" } });
      } else {
        expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 1, errors: 0 });
      }
      // GHIM HÀNH VI HIỆN TẠI (orders.ts, paymentTime): Creem không báo giờ trả (paidAt null) nên giờ trả là lúc xử lý, nhưng kẹp về
      // expires_at của đơn (QĐ33, S6). Hệ quả cần biết: khách trả muộn mất đoạn từ hạn link tới lúc server xử lý (tối đa 24 giờ);
      // `paid_at` của đơn và `anchor_applied_at` vẫn là lúc xử lý thật.
      expect(await env.DB.prepare("SELECT plan, expires_at, cycle_anchor, anchor_applied_at FROM licenses").first()).toEqual({
        plan: "monthly",
        expires_at: linkExpires + 30 * DAY,
        cycle_anchor: linkExpires,
        anchor_applied_at: T0 + offset,
      });
      expect(await env.DB.prepare("SELECT status, paid_at FROM orders WHERE order_code = ?").bind(orderCode).first()).toEqual({ status: "paid", paid_at: T0 + offset });
      expect(await auditLog("license_issued")).toEqual([
        { actor: via === "webhook" ? "webhook" : "reconcile", order_code: orderCode, detail: expect.objectContaining({ paid_at: linkExpires, expires_at: linkExpires + 30 * DAY }) },
      ]);
      expect((await w.getOrder(orderCode, token)).body).toMatchObject({ status: "paid", license_expires_at: linkExpires + 30 * DAY });
      expect(w.resend.sent).toHaveLength(1);
    },
  );

  it("webhook gửi trùng cùng lúc: chỉ cấp một lần, một email", async () => {
    const w = makeWorld();
    const { checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    const results = await Promise.all([1, 2, 3].map(() => w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.filter((r) => r.body.result === "granted")).toHaveLength(1);
    expect(await count("licenses")).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
  });

  it("hai webhook chạy chồng THẬT (cả hai đọc đơn pending và hỏi Creem xong rồi mới ghi): một lần granted, lần thua already_paid; một license, đúng một nhật ký license_issued, đúng một email có key", async () => {
    const w = makeWorld();
    const { orderCode, token, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    // D1 chặn `batch` tới khi cả hai request đã tới đó: Promise.all trần có thể chạy lần lượt nên không chứng minh được gì.
    const barrier = batchBarrier(env.DB, 2);
    const gated = makeWorld({ DB: barrier.db });
    // Cùng Creem giả với đơn đã tạo (world mới có Creem giả riêng, không biết phiên này); thư đi qua Resend giả của world này.
    gated.deps.payments.creem = w.deps.payments.creem!;
    const results = await Promise.all([1, 2].map(() => gated.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)));
    expect(barrier.calls()).toBeGreaterThanOrEqual(2);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results.map((r) => r.body.result).sort()).toEqual(["already_paid", "granted"]);
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(await count("licenses")).toBe(1);
    expect(await auditLog("license_issued")).toHaveLength(1);
    expect(gated.resend.sent).toHaveLength(1);
    const key = (await gated.getOrder(orderCode, token)).body.license_key as string;
    expect(gated.resend.sent[0]!.text).toContain(key);
    expect(gated.resend.sent[0]).toMatchObject({ idempotencyKey: `test-order-${orderCode}` });
  });

  it("sai chữ ký (chuỗi hex giả, thân bị sửa, thiếu header; secret khác thật có test riêng bên dưới): 400 invalid_signature, không hỏi Creem, không cấp, có cảnh báo", async () => {
    const w = makeWorld();
    const { checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    const before = w.creem.requests.length;
    const bad = [
      { raw: hook.raw, headers: { "creem-signature": "f".repeat(64) } },
      { raw: hook.raw.replace('"request_id":"1"', '"request_id":"2"'), headers: hook.headers },
      { raw: hook.raw, headers: {} },
    ];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const b of bad) {
      expect(await w.call("POST", "/v1/webhooks/creem", b.raw, b.headers)).toMatchObject({ status: 400, body: { error: "invalid_signature" } });
    }
    expect(logged(warn)).toEqual(Array(3).fill({ event: "webhook_bad_signature", provider: "creem" }));
    expect(w.creem.requests.length).toBe(before);
    expect(await count("licenses")).toBe(0);
    // Mọi dòng của ops_alerts, theo loại (không `.first()`): một loại cảnh báo thừa cũng làm test đỏ.
    expect(await alertRows()).toEqual([{ kind: "webhook_bad_signature", count: 3 }]);
  });

  it("ký bằng một secret khác thật (kẻ tấn công ký sự kiện đã trả của đúng phiên này): 400 invalid_signature, không hỏi Creem, không cấp, cảnh báo webhook_bad_signature; cùng thân ký bằng secret của ta thì cấp (khác biệt duy nhất là secret)", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    // Phiên thật đã trả: nếu chữ ký giả lọt qua thì server sẽ hỏi Creem và cấp key.
    w.creem.pay(checkoutId);
    const attacker = new FakeCreem("whsec_ke_tan_cong_khong_phai_cua_ta");
    const forged = await attacker.signedEvent("checkout.completed", { id: checkoutId, request_id: String(orderCode) });
    // Chữ ký đúng dạng HMAC-SHA256 hex (không phải chuỗi giả như "f" lặp 64 lần), chỉ khác secret.
    expect(forged.headers["creem-signature"]).toMatch(/^[0-9a-f]{64}$/);
    const before = w.creem.requests.length;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await w.call("POST", "/v1/webhooks/creem", forged.raw, forged.headers)).toMatchObject({ status: 400, body: { error: "invalid_signature" } });
    expect(logged(warn)).toEqual([{ event: "webhook_bad_signature", provider: "creem" }]);
    expect(w.creem.requests.length).toBe(before);
    expect(await orderRow(orderCode)).toMatchObject({ status: "pending" });
    expect(await count("licenses")).toBe(0);
    expect(w.resend.sent).toHaveLength(0);
    expect(await alertRows()).toEqual([{ kind: "webhook_bad_signature", count: 1 }]);
    // Đối chứng: đúng thân đó, ký bằng secret của kênh, được chấp nhận và cấp.
    expect(await signedRaw(w, forged.raw)).toMatchObject({ status: 200, body: { ok: true, result: "granted" } });
    expect(await count("licenses")).toBe(1);
    expect(await alertRows()).toEqual([{ kind: "webhook_bad_signature", count: 1 }]);
  });

  it("(phòng thủ) cổng Creem không có secret webhook: webhook ký đúng vẫn là sai chữ ký (400 invalid_signature, cảnh báo), không 500, không hỏi Creem", async () => {
    const w = makeWorld();
    const { checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    // creemFromEnv không bao giờ dựng cổng thiếu secret (test/creem.test.ts); đây chỉ là lớp phòng thủ của CreemProvider.
    w.deps.payments.creem = new CreemProvider(
      { baseUrl: "https://creem.test", apiKey: TEST_CREEM_API_KEY, productIds: { ...TEST_CREEM_PRODUCTS } },
      w.creem.fetch,
    );
    const before = w.creem.requests.length;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 400, body: { error: "invalid_signature" } });
      expect(logged(warn)).toEqual([{ event: "webhook_bad_signature", provider: "creem" }]);
    } finally {
      warn.mockRestore();
    }
    expect(w.creem.requests.length).toBe(before);
    expect(await count("licenses")).toBe(0);
    expect(await alertRows()).toEqual([{ kind: "webhook_bad_signature", count: 1 }]);
  });

  it("đúng chữ ký mà Creem báo chưa trả tiền: không cấp (webhook không tự cấp, chỉ là cái cò)", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    const hook = await w.creem.completedWebhook(checkoutId);
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
    expect(await count("licenses")).toBe(0);
    expect(await orderRow(orderCode)).toMatchObject({ status: "pending" });
  });

  it("webhook ký đúng tự khai order.status \"paid\" trong payload mà API Creem báo chưa trả: không cấp, đơn vẫn pending, không license, không email (server hỏi lại API và chỉ tin API, không tin payload)", async () => {
    const w = makeWorld();
    const { orderCode, token, checkoutId } = await checkout(w);
    // Phiên chưa trả (GET báo pending, chưa có đơn), nhưng thân ký đúng lại khai đơn đã trả đủ.
    const claim = await w.creem.signedEvent("checkout.completed", {
      id: checkoutId,
      object: "checkout",
      request_id: String(orderCode),
      status: "completed",
      order: { id: "ord_tu_khai", amount: 399, currency: "USD", status: "paid", type: "onetime" },
    });
    expect(JSON.parse(claim.raw).object.order.status).toBe("paid");
    const before = w.creem.requests.length;
    expect(await w.call("POST", "/v1/webhooks/creem", claim.raw, claim.headers)).toMatchObject({ status: 200, body: { ok: true, result: "not_paid" } });
    // Server vẫn hỏi lại đúng phiên đó, và tin câu trả lời của API.
    expect(w.creem.requests.slice(before)).toMatchObject([{ method: "GET", path: `/v1/checkouts?checkout_id=${checkoutId}` }]);
    expect(await orderRow(orderCode)).toEqual({ status: "pending", amount_paid: 0, currency: "USD", provider: "creem" });
    expect(await count("licenses")).toBe(0);
    expect(w.resend.sent).toHaveLength(0);
    const polled = await w.getOrder(orderCode, token);
    expect(polled.body).toMatchObject({ status: "pending" });
    expect(polled.body).not.toHaveProperty("license_key");
    // Khi API báo đã trả thật thì cùng cái cò đó cấp.
    w.creem.pay(checkoutId);
    expect(await w.call("POST", "/v1/webhooks/creem", claim.raw, claim.headers)).toMatchObject({ status: 200, body: { ok: true, result: "granted" } });
    expect(await count("licenses")).toBe(1);
  });

  it("số tiền của Creem khác giá của đơn: không cấp, đơn thành failed, ghi nhật ký order_amount_mismatch và cảnh báo order_payment_review; gửi lại không ghi thêm", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    w.creem.setOrderAmount(checkoutId, 100);
    const hook = await w.creem.completedWebhook(checkoutId);
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
    expect(await orderRow(orderCode)).toMatchObject({ status: "failed" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'order_amount_mismatch'").first()).toEqual({ n: 1 });
    expect(await count("licenses")).toBe(0);
    // Lệch tiền (kể cả khi giả định về thuế của Creem sai) phải tới người vận hành qua thư, không chỉ nằm ở nhật ký.
    expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);
    // Đơn không đổi gì nữa: gửi lại webhook không thêm nhật ký hay cảnh báo.
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'order_amount_mismatch'").first()).toEqual({ n: 1 });
    expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);
  });

  it.each([
    ["nhỏ hơn", 100],
    ["LỚN hơn (kiểu hỏng nếu spike S1 đoán sai cách Creem tính amount)", 500],
  ])(
    "Creem báo số tiền %s giá của đơn (giá 399): không cấp, đơn failed với amount_paid đúng số Creem báo, nhật ký order_amount_mismatch có amount và provider_amount, cảnh báo order_payment_review, không email",
    async (_why, reported) => {
      const w = makeWorld();
      const { orderCode, token, checkoutId } = await checkout(w);
      w.creem.pay(checkoutId);
      w.creem.setOrderAmount(checkoutId, reported);
      const hook = await w.creem.completedWebhook(checkoutId);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "not_paid" } });
      expect(logged(warn)).toEqual([{ event: "order_amount_mismatch", order_code: orderCode }]);
      expect(await orderRow(orderCode)).toEqual({ status: "failed", amount_paid: reported, currency: "USD", provider: "creem" });
      // Chỉ các trường lõi (cổng có đặt thêm dữ kiện phụ tùy ca): giá của đơn, giá Creem báo, số khách đã trả.
      expect(await auditLog("order_amount_mismatch")).toEqual([
        { actor: "webhook", order_code: orderCode, detail: expect.objectContaining({ amount: 399, currency: "USD", provider_amount: reported, amount_paid: reported }) },
      ]);
      expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);
      expect(await count("licenses")).toBe(0);
      expect(w.resend.sent).toHaveLength(0);
      const polled = await w.getOrder(orderCode, token);
      expect(polled.body).toMatchObject({ status: "failed" });
      expect(polled.body).not.toHaveProperty("license_key");
      // Gửi lại webhook: không đổi gì thì không thêm nhật ký hay cảnh báo, vẫn không cấp.
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ body: { result: "not_paid" } });
      expect(await auditLog("order_amount_mismatch")).toHaveLength(1);
      expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);
      expect(await count("licenses")).toBe(0);
    },
  );

  it("mã giảm giá 100% (amount_paid 0): không cấp, đơn underpaid, nhật ký order_underpaid, cảnh báo order_payment_review, không email; gửi lại và đối soát không ghi thêm", async () => {
    const w = makeWorld();
    const { orderCode, token, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId, 0, { discountAmount: 399, discountId: "dis_full" });
    const hook = await w.creem.completedWebhook(checkoutId);
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
    expect(await orderRow(orderCode)).toEqual({ status: "underpaid", amount_paid: 0, currency: "USD", provider: "creem" });
    expect((await w.getOrder(orderCode, token)).body.license_key).toBeUndefined();
    const logs = await env.DB.prepare("SELECT actor, order_code, detail FROM audit_log WHERE action = 'order_underpaid'").all();
    // Dữ kiện của Creem đi kèm nhật ký (I-3): có giảm giá (chỉ có/không, không chép mã), số giảm, số khách trả, thuế.
    expect(logs.results.map((r) => ({ ...r, detail: JSON.parse(String(r.detail)) }))).toEqual([
      {
        actor: "webhook",
        order_code: orderCode,
        detail: {
          amount: 399,
          currency: "USD",
          provider_amount: 399,
          amount_paid: 0,
          has_discount: true,
          provider_discount_amount: 399,
          provider_amount_paid: 0,
          provider_tax_amount: 0,
        },
      },
    ]);
    expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);
    expect(await count("licenses")).toBe(0);
    expect(w.resend.sent).toHaveLength(0);
    // Đơn underpaid vẫn được đối soát hỏi lại trong 24 giờ: không đổi gì thì không thêm nhật ký hay cảnh báo.
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 0, errors: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'order_underpaid'").first()).toEqual({ n: 1 });
    expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);
    expect(await orderRow(orderCode)).toMatchObject({ status: "underpaid", amount_paid: 0 });
    expect(await count("licenses")).toBe(0);
    expect(w.resend.sent).toHaveLength(0);
  });

  it.each([false, true])(
    "giảm giá nhỏ ở nước có thuế (amount_paid 429 ≥ giá 399; order.amount gồm thuế: %s): vẫn không cấp, đơn underpaid với amount_paid 349 (429 − thuế 80, không ghi dư giá), nhật ký order_underpaid có dữ kiện của Creem, cảnh báo order_payment_review",
    async (includesTax) => {
      const w = makeWorld();
      w.creem.amountIncludesTax = includesTax;
      const { orderCode, checkoutId } = await checkout(w);
      w.creem.pay(checkoutId, 80, { discountAmount: 50, discountId: "dis_small" });
      const hook = await w.creem.completedWebhook(checkoutId);
      expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
      expect(await orderRow(orderCode)).toEqual({ status: "underpaid", amount_paid: 349, currency: "USD", provider: "creem" });
      const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'order_underpaid'").first<{ detail: string }>();
      expect(JSON.parse(log!.detail)).toEqual({
        amount: 399,
        currency: "USD",
        provider_amount: 399,
        amount_paid: 349,
        has_discount: true,
        provider_discount_amount: 50,
        provider_amount_paid: 429,
        provider_tax_amount: 80,
      });
      expect(log!.detail).not.toContain("dis_small");
      expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);
      expect(await count("licenses")).toBe(0);
      expect(w.resend.sent).toHaveLength(0);
    },
  );

  it.each([false, true])("khách trả đủ cộng thuế 84 (order.amount gồm thuế: %s): cấp như thường, amount_paid 399 (không gồm thuế)", async (includesTax) => {
    const w = makeWorld();
    w.creem.amountIncludesTax = includesTax;
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId, 84);
    const hook = await w.creem.completedWebhook(checkoutId);
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "granted" });
    expect(await orderRow(orderCode)).toEqual({ status: "paid", amount_paid: 399, currency: "USD", provider: "creem" });
    expect(await count("licenses")).toBe(1);
  });

  it.each([false, true])(
    "(I-1) giảm 50 ≤ thuế 84 mà Creem không ghi discount hay discount_amount (order.amount gồm thuế: %s): amount_paid 433 ≥ giá nhưng 433 − 84 = 349 < 399, không cấp, underpaid 349",
    async (includesTax) => {
      const w = makeWorld();
      w.creem.amountIncludesTax = includesTax;
      const { orderCode, checkoutId } = await checkout(w);
      w.creem.pay(checkoutId, 84, { discountAmount: 50 });
      w.creem.patchOrder(checkoutId, { discount: undefined, discount_amount: undefined });
      const hook = await w.creem.completedWebhook(checkoutId);
      expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
      expect(await orderRow(orderCode)).toEqual({ status: "underpaid", amount_paid: 349, currency: "USD", provider: "creem" });
      const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'order_underpaid'").first<{ detail: string }>();
      expect(JSON.parse(log!.detail)).toEqual({ amount: 399, currency: "USD", provider_amount: 399, amount_paid: 349, has_discount: false, provider_amount_paid: 433, provider_tax_amount: 84 });
      expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);
      expect(await count("licenses")).toBe(0);
    },
  );

  it("(I-2) chỉ phiên mang giảm giá (discount cấp phiên), đơn không có mã hay số giảm: không cấp, underpaid, nhật ký có has_discount", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId, 0, { checkoutDiscount: true });
    const hook = await w.creem.completedWebhook(checkoutId);
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
    expect(await orderRow(orderCode)).toEqual({ status: "underpaid", amount_paid: 399, currency: "USD", provider: "creem" });
    const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'order_underpaid'").first<{ detail: string }>();
    expect(JSON.parse(log!.detail)).toMatchObject({ has_discount: true, provider_discount_amount: 0 });
    expect(await count("licenses")).toBe(0);
  });

  it("(lớp phòng thủ, chờ S4) Creem GET báo đơn `refunded`: không cấp, đơn thành refunded, một nhật ký order_refunded (nguồn: trạng thái cổng báo), một cảnh báo, một dòng log; gửi lại không ghi thêm", async () => {
    // Tài liệu Creem không có `order.status = "refunded"` (sau hoàn tiền GET vẫn báo `paid`): đường chính là webhook hoàn tiền
    // (handleRefund). Test này chỉ giữ nhánh phòng thủ của getPaymentStatus, nếu spike S4 thấy API có báo. Đơn đổi sang refunded
    // ở nhánh này cũng phải để lại dấu như webhook hoàn tiền (Q1).
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    w.creem.setOrderStatus(checkoutId, "refunded");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
      expect(logged(warn)).toEqual([
        { event: "order_refund_event", order_code: orderCode, action: "order_refunded", prev_status: "pending", status_after: "refunded", source: "provider_status" },
      ]);
      // Đơn đã khép: webhook gửi lại hay đối soát không ghi thêm gì.
      expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "already_settled" });
      expect(logged(warn)).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect(await count("licenses")).toBe(0);
    const logs = await env.DB.prepare("SELECT actor, license_id, order_code, detail FROM audit_log WHERE action = 'order_refunded'").all();
    expect(logs.results.map((r) => ({ ...r, detail: JSON.parse(String(r.detail)) }))).toEqual([
      {
        actor: "webhook",
        license_id: null,
        order_code: orderCode,
        detail: {
          source: "provider_status",
          reason: "refund",
          full: true,
          prev_status: "pending",
          plan: "monthly",
          amount: 399,
          currency: "USD",
          amount_paid: 399,
          license_id: null,
        },
      },
    ]);
    expect(await alertRows()).toEqual([{ kind: "order_refunded", count: 1 }]);
  });

  it("request_id là số hợp lệ mà không có đơn đó (đúng chữ ký): 200 unknown_order, không hỏi Creem; nhật ký payment_unmatched, cảnh báo, log; gửi lại cùng mã không ghi thêm", async () => {
    const w = makeWorld();
    const hook = await w.creem.signedEvent("checkout.completed", { id: "ch_x", request_id: "777" }, "evt_don_la");
    const detail = { provider: "creem", event_type: "checkout.completed", provider_ref: "ch_x", event_id: "evt_don_la" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "unknown_order" } });
      expect(logged(warn)).toEqual([{ event: "payment_unmatched", ...detail }]);
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "unknown_order" } });
      expect(logged(warn)).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
    expect(w.creem.requests).toHaveLength(0);
    expect(await unmatchedLogs()).toEqual([{ actor: "webhook", license_id: null, order_code: null, detail }]);
    expect(await alertRows()).toEqual([{ kind: "payment_unmatched", count: 1 }]);
  });

  it.each([
    ["null", "null", null, null],
    ["mảng", "[]", null, null],
    ["object thiếu eventType", '{"object":{}}', null, null],
    ["Creem đổi tên trường eventType", '{"id":"evt_doi","event_type":"checkout.completed","object":{"id":"ch_doi","request_id":"1"}}', "ch_doi", "evt_doi"],
  ])(
    "đúng chữ ký mà thân JSON không phải sự kiện đọc được (%s): 200 unmatched, nhật ký payment_unmatched với loại sự kiện null, cảnh báo; gửi lại: có mã sự kiện thì không ghi thêm, không có thì mỗi lần một dòng",
    async (_why, raw, providerRef, eventId) => {
      const w = makeWorld();
      const detail = { provider: "creem", event_type: null, provider_ref: providerRef, event_id: eventId };
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        expect(await signedRaw(w, raw)).toMatchObject({ status: 200, body: { ok: true, result: "unmatched" } });
        expect(logged(warn)).toEqual([{ event: "payment_unmatched", ...detail }]);
        expect(await signedRaw(w, raw)).toMatchObject({ status: 200, body: { ok: true, result: eventId ? "duplicate" : "unmatched" } });
      } finally {
        warn.mockRestore();
      }
      const times = eventId ? 1 : 2;
      expect(await unmatchedLogs()).toEqual(Array(times).fill({ actor: "webhook", license_id: null, order_code: null, detail }));
      expect(await alertRows()).toEqual([{ kind: "payment_unmatched", count: times }]);
      expect(w.creem.requests).toHaveLength(0);
      expect(await count("licenses")).toBe(0);
    },
  );

  it.each([
    ["thiếu", undefined],
    ["null", null],
    ["là chữ (link công khai, Storefront, sản phẩm khác của tài khoản Creem)", "abc"],
    ["vượt số nguyên an toàn", "9007199254740992"],
  ])(
    "đúng chữ ký mà request_id %s (không khớp đơn nào): 200 unmatched, một nhật ký payment_unmatched, một cảnh báo, một dòng log; không hỏi Creem, không cấp",
    async (_why, requestId) => {
      const w = makeWorld();
      const hook = await w.creem.signedEvent("checkout.completed", { id: "ch_ngoai", request_id: requestId }, "evt_ngoai");
      const detail = { provider: "creem", event_type: "checkout.completed", provider_ref: "ch_ngoai", event_id: "evt_ngoai" };
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "unmatched" } });
        expect(logged(warn)).toEqual([{ event: "payment_unmatched", ...detail }]);
      } finally {
        warn.mockRestore();
      }
      expect(await unmatchedLogs()).toEqual([{ actor: "webhook", license_id: null, order_code: null, detail }]);
      expect(await alertRows()).toEqual([{ kind: "payment_unmatched", count: 1 }]);
      expect(w.creem.requests).toHaveLength(0);
      expect(await count("licenses")).toBe(0);
    },
  );

  it.each(["{", "", "không phải json"])(
    "đúng chữ ký mà thân %j không phải JSON: 400 invalid_request, chỉ một dòng log webhook_malformed; không báo sai chữ ký, không cảnh báo, không nhật ký",
    async (raw) => {
      const w = makeWorld();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        expect(await signedRaw(w, raw)).toMatchObject({ status: 400, body: { error: "invalid_request" } });
        expect(logged(warn)).toEqual([{ event: "webhook_malformed", provider: "creem" }]);
      } finally {
        warn.mockRestore();
      }
      expect(await count("ops_alerts")).toBe(0);
      expect(await count("audit_log")).toBe(0);
      expect(w.creem.requests).toHaveLength(0);
    },
  );

  it("sự kiện không khớp đơn gửi lại (ba lần chồng nhau, rồi thêm một lần): một nhật ký, một cảnh báo; sự kiện khác mã thì thêm; thiếu mã thì mỗi lần một dòng", async () => {
    const w = makeWorld();
    const hook = await w.creem.signedEvent("checkout.completed", { id: "ch_ngoai", request_id: "my-request-id" }, "evt_trung");
    const barrier = batchBarrier(env.DB, 3);
    const gated = makeWorld({ DB: barrier.db });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const results = await Promise.all([1, 2, 3].map(() => gated.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)));
      expect(barrier.calls()).toBe(3);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(results.map((r) => r.body.result).sort()).toEqual(["duplicate", "duplicate", "unmatched"]);
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "duplicate" } });
      expect(await unmatchedLogs()).toHaveLength(1);
      expect(await alertRows()).toEqual([{ kind: "payment_unmatched", count: 1 }]);
      expect(logged(warn).filter((l) => l.event === "payment_unmatched")).toHaveLength(1);

      const other = await w.creem.signedEvent("checkout.completed", { id: "ch_ngoai", request_id: "my-request-id" }, "evt_khac");
      expect(await w.call("POST", "/v1/webhooks/creem", other.raw, other.headers)).toMatchObject({ body: { result: "unmatched" } });
      const noId = await w.creem.signedEvent("checkout.completed", { id: "ch_ngoai" }, null);
      for (let i = 0; i < 2; i++) {
        expect(await w.call("POST", "/v1/webhooks/creem", noId.raw, noId.headers)).toMatchObject({ body: { result: "unmatched" } });
      }
    } finally {
      warn.mockRestore();
    }
    expect((await unmatchedLogs()).map((l) => l.detail.event_id)).toEqual(["evt_trung", "evt_khac", null, null]);
    expect(await alertRows()).toEqual([{ kind: "payment_unmatched", count: 4 }]);
  });

  it("ghi nhật ký payment_unmatched hỏng (D1 lỗi): 503 để Creem gửi lại, không cảnh báo; gửi lại thì ghi đủ", async () => {
    const w = makeWorld();
    const hook = await w.creem.signedEvent("checkout.completed", { id: "ch_ngoai" }, "evt_d1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await withFailingInsert("audit_log", "NEW.action = 'payment_unmatched'", async () => {
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
      });
      expect(logged(err)).toEqual([expect.objectContaining({ event: "webhook_unmatched_failed", provider: "creem" })]);
      expect(await alertRows()).toEqual([]);
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { result: "unmatched" } });
    } finally {
      warn.mockRestore();
      err.mockRestore();
    }
    expect(await unmatchedLogs()).toHaveLength(1);
    expect(await alertRows()).toEqual([{ kind: "payment_unmatched", count: 1 }]);
  });

  it.each(["pending", "failed"])(
    "đơn %s có provider_ref NULL (Worker dừng giữa lúc tạo phiên và lúc lưu mã phiên, hay mất phản hồi tạo phiên): webhook ký đúng mang request_id = mã đơn và mã phiên thì server hỏi Creem theo mã phiên đó, lưu lại rồi cấp như thường",
    async (status) => {
      const w = makeWorld();
      const { orderCode, token, checkoutId } = await checkout(w);
      await env.DB.prepare("UPDATE orders SET provider_ref = NULL, status = ? WHERE order_code = ?").bind(status, orderCode).run();
      w.creem.pay(checkoutId);
      const hook = await w.creem.completedWebhook(checkoutId);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "granted" } });
        expect(logged(warn)).toContainEqual({ event: "order_provider_ref_filled", order_code: orderCode, provider: "creem" });
      } finally {
        warn.mockRestore();
      }
      expect(w.creem.requests.at(-1)).toMatchObject({ method: "GET", path: `/v1/checkouts?checkout_id=${checkoutId}` });
      expect(await env.DB.prepare("SELECT provider_ref FROM orders WHERE order_code = ?").bind(orderCode).first()).toEqual({ provider_ref: checkoutId });
      expect((await w.getOrder(orderCode, token)).body).toMatchObject({ status: "paid", grant_kind: "new" });
      expect(w.resend.sent).toHaveLength(1);
    },
  );

  it("đơn có provider_ref NULL mà webhook ký đúng mang mã phiên của đơn KHÁC: Creem báo request_id khác nên không cấp nhầm (503), không lưu mã phiên đó", async () => {
    const w = makeWorld();
    const a = await checkout(w);
    const b = await checkout(w);
    await env.DB.prepare("UPDATE orders SET provider_ref = NULL WHERE order_code = ?").bind(a.orderCode).run();
    w.creem.pay(b.checkoutId);
    // Phiên của đơn B đã trả, nhưng thân ký nói request_id là mã đơn A.
    const hook = await w.creem.signedEvent("checkout.completed", { id: b.checkoutId, request_id: String(a.orderCode) });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
    } finally {
      err.mockRestore();
    }
    expect(await env.DB.prepare("SELECT provider_ref FROM orders WHERE order_code = ?").bind(a.orderCode).first()).toEqual({ provider_ref: null });
    expect(await orderRow(a.orderCode)).toMatchObject({ status: "pending" });
    expect(await count("licenses")).toBe(0);
  });

  it("đơn PayOS có provider_ref NULL nhận webhook Creem ký đúng mang request_id = mã đơn đó: không lưu mã phiên Creem vào đơn PayOS (mã phiên chỉ dùng cho đơn của cùng cổng), hỏi PayOS như thường", async () => {
    const w = makeWorld();
    const vnd = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "buyer@example.com", consent: true });
    const orderCode = vnd.body.order_code as number;
    await env.DB.prepare("UPDATE orders SET provider_ref = NULL WHERE order_code = ?").bind(orderCode).run();
    const hook = await w.creem.signedEvent("checkout.completed", { id: "ch_cong_khac", request_id: String(orderCode) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "not_paid" } });
      expect(logged(warn).map((l) => l.event)).not.toContain("order_provider_ref_filled");
    } finally {
      warn.mockRestore();
    }
    expect(await env.DB.prepare("SELECT provider, provider_ref FROM orders WHERE order_code = ?").bind(orderCode).first()).toEqual({
      provider: "payos",
      provider_ref: null,
    });
    expect(w.creem.requests).toHaveLength(0);
    expect(w.payos.requests.at(-1)).toMatchObject({ method: "GET", path: `/v2/payment-requests/${orderCode}` });
  });

  it("mã đơn Creem không có mà ghi nhật ký payment_unmatched hỏng (D1 lỗi): 503 để Creem gửi lại, không cảnh báo; gửi lại thì ghi đủ", async () => {
    const w = makeWorld();
    const hook = await w.creem.signedEvent("checkout.completed", { id: "ch_x", request_id: "777" }, "evt_la_d1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await withFailingInsert("audit_log", "NEW.action = 'payment_unmatched'", async () => {
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
      });
      expect(logged(err)).toEqual([expect.objectContaining({ event: "webhook_fulfil_failed", order_code: 777 })]);
      expect(await alertRows()).toEqual([]);
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "unknown_order" } });
    } finally {
      warn.mockRestore();
      err.mockRestore();
    }
    expect(await unmatchedLogs()).toHaveLength(1);
    expect(await alertRows()).toEqual([{ kind: "payment_unmatched", count: 1 }]);
  });

  it("thân đã ký in thụt dòng và có xuống dòng cuối: chữ ký tính trên đúng byte nhận được, server vẫn cấp (route không parse rồi stringify lại)", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    const pretty = `${JSON.stringify(JSON.parse(hook.raw), null, 2)}\n`;
    expect(pretty).not.toBe(hook.raw);
    expect(await signedRaw(w, pretty)).toMatchObject({ status: 200, body: { ok: true, result: "granted" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
  });

  it("đọc thân lỗi (client ngắt giữa chừng): 400 invalid_request, log webhook_body_unreadable, không 500, không cảnh báo", async () => {
    const w = makeWorld();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"eventType":"checkout.'));
      },
      pull(controller) {
        controller.error(new Error("client ngắt"));
      },
    });
    const req = new Request("https://license.test/v1/webhooks/creem", {
      method: "POST",
      body,
      headers: { "content-length": "200", "creem-signature": "0".repeat(64) },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const ctx = createExecutionContext();
      const res = await w.app.fetch(req, w.env, ctx);
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_request" });
      expect(logged(warn)).toEqual([expect.objectContaining({ event: "webhook_body_unreadable", provider: "creem" })]);
      expect(err).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      err.mockRestore();
    }
    expect(await count("ops_alerts")).toBe(0);
  });

  it("ghi cảnh báo sai chữ ký hỏng (D1 lỗi): vẫn 400 invalid_signature, log webhook_alert_failed, không 500", async () => {
    const w = makeWorld();
    const hook = await w.creem.signedEvent("checkout.completed", { id: "ch_x", request_id: "1" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await withFailingInsert("ops_alerts", "NEW.kind = 'webhook_bad_signature'", async () => {
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, { "creem-signature": "f".repeat(64) })).toMatchObject({
          status: 400,
          body: { error: "invalid_signature" },
        });
      });
      expect(logged(warn)).toEqual([{ event: "webhook_bad_signature", provider: "creem" }]);
      expect(logged(err)).toEqual([expect.objectContaining({ event: "webhook_alert_failed", provider: "creem", kind: "webhook_bad_signature" })]);
    } finally {
      warn.mockRestore();
      err.mockRestore();
    }
    expect(await count("ops_alerts")).toBe(0);
  });

  it("sự kiện server không dùng (subscription.paid): 200 ignored, không hỏi Creem, không ghi D1; để lại một dòng log webhook_ignored có loại sự kiện (cắt 64 ký tự)", async () => {
    const w = makeWorld();
    const hook = await w.creem.signedEvent("subscription.paid", { id: "sub_1" });
    const long = await w.creem.signedEvent(`x.${"y".repeat(100)}`, { id: "sub_2" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "ignored" } });
      expect(await w.call("POST", "/v1/webhooks/creem", long.raw, long.headers)).toMatchObject({ status: 200, body: { ok: true, result: "ignored" } });
      expect(logged(warn)).toEqual([
        { event: "webhook_ignored", provider: "creem", event_type: "subscription.paid" },
        { event: "webhook_ignored", provider: "creem", event_type: `x.${"y".repeat(62)}` },
      ]);
    } finally {
      warn.mockRestore();
    }
    expect(w.creem.requests).toHaveLength(0);
    expect(await count("audit_log")).toBe(0);
    expect(await count("ops_alerts")).toBe(0);
  });

  it("Creem không trả lời lúc cấp: 503 để Creem gửi lại; đối soát cấp sau, đúng một license", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    w.creem.statusFailures = ["network"];
    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
    expect(await count("licenses")).toBe(0);
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 1, errors: 0 });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(await count("licenses")).toBe(1);
  });
});

describe("(A5b) phiên Creem đã trả mà dữ liệu tiền hỏng: giữ đơn và cảnh báo người vận hành, không ném lỗi, không cấp", () => {
  /** Nhật ký của một hành động, theo thứ tự ghi, `detail` đã parse. */
  const audits = (action: string) =>
    env.DB.prepare("SELECT actor, order_code, detail FROM audit_log WHERE action = ? ORDER BY id")
      .bind(action)
      .all<{ actor: string; order_code: number; detail: string }>()
      .then((r) => r.results.map((x) => ({ ...x, detail: JSON.parse(x.detail) as Record<string, unknown> })));
  const malformedLogs = (spy: { mock: { calls: unknown[][] } }) => logged(spy).filter((l) => l.event === "creem_malformed_paid_session");

  /** Mỗi ca: sau khi khách trả (thuế 84), làm cho Creem trả dữ liệu lạ của phiên này. */
  type Spoil = (creem: World["creem"], checkoutId: string) => void;
  const paidReview = { has_discount: false, provider_discount_amount: 0, provider_amount_paid: 483, provider_tax_amount: 84 };
  it.each<[string, Spoil, Record<string, unknown> & { provider_malformed_fields: string[] }]>([
    [
      "order.discount là đối tượng (không phải mã chuỗi như OpenAPI ghi)",
      (c, id) => c.patchOrder(id, { discount: { id: "dis_1", code: "HOLIDAY" } }),
      { ...paidReview, has_discount: true, provider_malformed_fields: ["order.discount"] },
    ],
    [
      "amount_paid là chuỗi \"483\"",
      (c, id) => c.patchOrder(id, { amount_paid: "483" }),
      { has_discount: false, provider_discount_amount: 0, provider_tax_amount: 84, provider_malformed_fields: ["order.amount_paid"] },
    ],
    ["sub_total âm (-1)", (c, id) => c.patchOrder(id, { sub_total: -1 }), { ...paidReview, provider_malformed_fields: ["order.sub_total"] }],
    ["(A5c) đơn đã trả mà currency là \"usd\" (chữ thường)", (c, id) => c.patchOrder(id, { currency: "usd" }), { ...paidReview, provider_malformed_fields: ["order.currency"] }],
    [
      "(A5c) phiên hết hạn (expired) mà đơn đã trả (mâu thuẫn: tiền đã thu)",
      (c, id) => c.setStatus(id, "expired"),
      { ...paidReview, provider_malformed_fields: ["checkout.status"] },
    ],
    [
      "(A5c) phiên hết hạn mà đơn đã hoàn một phần (partially_refunded: vẫn còn tiền đã thu)",
      (c, id) => {
        c.setStatus(id, "expired");
        c.setOrderStatus(id, "partially_refunded");
      },
      { ...paidReview, provider_malformed_fields: ["checkout.status"] },
    ],
    ["(A5d) trạng thái đơn lạ (\"partialRefund\")", (c, id) => c.setOrderStatus(id, "partialRefund"), { ...paidReview, provider_malformed_fields: ["order.status"] }],
    [
      "(A5d) phiên hết hạn mà đơn thiếu trạng thái",
      (c, id) => {
        c.setStatus(id, "expired");
        c.patchOrder(id, { status: undefined });
      },
      { ...paidReview, provider_malformed_fields: ["checkout.status", "order.status"] },
    ],
    ["(A5d) phiên còn pending mà đơn đã trả (phiên chưa chuyển)", (c, id) => c.setStatus(id, "pending"), { ...paidReview, provider_malformed_fields: ["checkout.status"] }],
    ["(A5d) phiên processing mà đơn đã trả", (c, id) => c.setStatus(id, "processing"), { ...paidReview, provider_malformed_fields: ["checkout.status"] }],
  ])(
    "%s: webhook giữ đơn underpaid (amount_paid 0), không key, không email; đúng một nhật ký order_underpaid có tên trường hỏng và một cảnh báo; gửi lại và đối soát không ghi thêm; mỗi lần hỏi một dòng log; cấp tay sau đó vẫn được",
    async (_why, spoil, review) => {
      const { w, adminCall } = makeAdmin();
      const { orderCode, token, checkoutId } = await checkout(w);
      w.creem.pay(checkoutId, 84);
      spoil(w.creem, checkoutId);
      const hook = await w.creem.completedWebhook(checkoutId);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const fields = review.provider_malformed_fields;
      const line = { event: "creem_malformed_paid_session", order_code: orderCode, provider_ref: checkoutId, fields };
      try {
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "not_paid" } });
        expect(malformedLogs(warn)).toEqual([line]);
        expect(await orderRow(orderCode)).toEqual({ status: "underpaid", amount_paid: 0, currency: "USD", provider: "creem" });
        expect((await w.getOrder(orderCode, token)).body).toMatchObject({ status: "underpaid" });
        expect((await w.getOrder(orderCode, token)).body.license_key).toBeUndefined();
        expect(await count("licenses")).toBe(0);
        expect(w.resend.sent).toHaveLength(0);
        const expected = [{ actor: "webhook", order_code: orderCode, detail: { amount: 399, currency: "USD", provider_amount: 399, amount_paid: 0, ...review } }];
        expect(await audits("order_underpaid")).toEqual(expected);
        expect(await audits("order_amount_mismatch")).toEqual([]);
        expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);

        // Creem gửi lại webhook, rồi đối soát hỏi lại đơn underpaid: không đổi gì nên không thêm nhật ký hay cảnh báo (A4: chỉ khi đổi thật).
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "not_paid" } });
        w.clock.now = T0 + 300;
        expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 0, errors: 0 });
        expect(malformedLogs(warn)).toEqual([line, line, line]);
        expect(await audits("order_underpaid")).toEqual(expected);
        expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);
        expect(await orderRow(orderCode)).toMatchObject({ status: "underpaid", amount_paid: 0 });
        expect(await count("licenses")).toBe(0);
        expect(w.resend.sent).toHaveLength(0);
      } finally {
        warn.mockRestore();
      }

      // Người vận hành xem đơn trên Creem, thấy khách trả đủ, cấp tay: key và thư như thường. Cấp tay lấy amount_paid của dòng đơn
      // (0, vì không đọc được Creem đã thu bao nhiêu), không phải giá.
      const res = await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "đã xem trên Creem: khách trả đủ 3,99 USD + thuế" } });
      expect(res).toMatchObject({ status: 200, body: { plan: "monthly", grant_kind: "new" } });
      expect(await orderRow(orderCode)).toEqual({ status: "paid", amount_paid: 0, currency: "USD", provider: "creem" });
      expect(await count("licenses")).toBe(1);
      expect(w.resend.sent).toHaveLength(1);
      expect((await w.getOrder(orderCode, token)).body.license_key).toBe(res.body.license_key);
      expect(await audits("order_granted_manually")).toHaveLength(1);
    },
  );

  it("không còn giá nào đọc được (amount và sub_total đều là chuỗi): đơn failed (lệch tiền), một nhật ký order_amount_mismatch có tên trường hỏng, một cảnh báo, không cấp; gửi lại không ghi thêm; cấp tay vẫn được", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    w.creem.patchOrder(checkoutId, { amount: "399", sub_total: "399" });
    const hook = await w.creem.completedWebhook(checkoutId);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fields = ["order.amount", "order.sub_total"];
    try {
      for (let i = 0; i < 2; i++) {
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "not_paid" } });
      }
      const line = { event: "creem_malformed_paid_session", order_code: orderCode, provider_ref: checkoutId, fields };
      expect(logged(warn)).toEqual([line, { event: "order_amount_mismatch", order_code: orderCode }, line]);
    } finally {
      warn.mockRestore();
    }
    expect(await orderRow(orderCode)).toEqual({ status: "failed", amount_paid: 0, currency: "USD", provider: "creem" });
    expect(await audits("order_amount_mismatch")).toEqual([
      {
        actor: "webhook",
        order_code: orderCode,
        detail: {
          amount: 399,
          currency: "USD",
          provider_amount: 0,
          amount_paid: 0,
          has_discount: false,
          provider_discount_amount: 0,
          provider_amount_paid: 399,
          provider_tax_amount: 0,
          provider_malformed_fields: fields,
        },
      },
    ]);
    expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);
    expect(await count("licenses")).toBe(0);
    expect(w.resend.sent).toHaveLength(0);
    expect(await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "đã xem trên Creem" } })).toMatchObject({ status: 200 });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
  });

  it("ba webhook chồng nhau (cả ba hỏi Creem xong rồi mới ghi): đúng một lần đổi trạng thái, một nhật ký, một cảnh báo; mỗi lần hỏi một dòng log", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    w.creem.patchOrder(checkoutId, { discount: { id: "dis_1" } });
    const hook = await w.creem.completedWebhook(checkoutId);
    const barrier = batchBarrier(env.DB, 3);
    const gated = makeWorld({ DB: barrier.db });
    // Cùng Creem giả với đơn đã tạo (world mới có Creem giả riêng, không biết phiên này).
    gated.deps.payments.creem = w.deps.payments.creem!;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const results = await Promise.all([1, 2, 3].map(() => gated.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)));
      expect(barrier.calls()).toBe(3);
      expect(results.map((r) => [r.status, r.body.result])).toEqual([
        [200, "not_paid"],
        [200, "not_paid"],
        [200, "not_paid"],
      ]);
      expect(malformedLogs(warn)).toHaveLength(3);
    } finally {
      warn.mockRestore();
    }
    expect(await orderRow(orderCode)).toMatchObject({ status: "underpaid", amount_paid: 0 });
    expect(await audits("order_underpaid")).toHaveLength(1);
    expect(await alertRows()).toEqual([{ kind: "order_payment_review", count: 1 }]);
    expect(await count("licenses")).toBe(0);
  });

  it("(lớp phòng thủ, mọi cổng) cổng trả amountPaid âm: cột amount_paid và nhật ký kẹp về 0 (cột không có CHECK)", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    const real = w.deps.payments.creem!;
    w.deps.payments.creem = {
      name: "creem",
      createCheckout: (r) => real.createCheckout(r),
      verifyWebhook: (r) => real.verifyWebhook(r),
      getPaymentStatus: async () => ({ orderCode, status: "underpaid", amount: 399, amountPaid: -5, paidAt: null }),
    };
    expect(await fulfilOrder(w.env, w.deps, orderCode, "reconcile")).toBe("not_paid");
    expect(await orderRow(orderCode)).toMatchObject({ status: "underpaid", amount_paid: 0 });
    expect(await audits("order_underpaid")).toEqual([{ actor: "reconcile", order_code: orderCode, detail: { amount: 399, currency: "USD", provider_amount: 399, amount_paid: 0 } }]);
  });

  it("(M-3) Creem báo đơn refunded mà số tiền lệch giá: đơn thành refunded (không phải failed), một nhật ký order_refunded, cảnh báo order_refunded (không order_payment_review); cấp tay bị từ chối", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    w.creem.setOrderAmount(checkoutId, 100);
    w.creem.setOrderStatus(checkoutId, "refunded");
    const hook = await w.creem.completedWebhook(checkoutId);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (let i = 0; i < 2; i++) {
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200 });
      }
      expect(logged(warn).map((l) => l.event)).toEqual(["order_refund_event"]);
    } finally {
      warn.mockRestore();
    }
    expect(await orderRow(orderCode)).toEqual({ status: "refunded", amount_paid: 100, currency: "USD", provider: "creem" });
    expect(await audits("order_refunded")).toEqual([
      { actor: "webhook", order_code: orderCode, detail: expect.objectContaining({ source: "provider_status", amount: 399, amount_paid: 100 }) },
    ]);
    expect(await audits("order_amount_mismatch")).toEqual([]);
    expect(await alertRows()).toEqual([{ kind: "order_refunded", count: 1 }]);
    expect(await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "x" } })).toEqual({
      status: 409,
      body: { error: "already_settled", status: "refunded" },
    });
    expect(await count("licenses")).toBe(0);
  });

  it("(M-10) đơn chưa lưu mã phiên (provider_ref NULL) mà webhook ký đúng mang mã phiên sai mẫu: không hỏi Creem theo mã đó, không lưu vào đơn (503); đối soát chỉ log reconcile_failed, KHÔNG cảnh báo order_check_failed (đơn chưa có phiên để đọc, A5f)", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    await env.DB.prepare("UPDATE orders SET provider_ref = NULL WHERE order_code = ?").bind(orderCode).run();
    const hook = await w.creem.signedEvent("checkout.completed", { id: `${checkoutId}?x=1`, object: "checkout", request_id: String(orderCode), status: "completed" });
    const gets = () => w.creem.requests.filter((r) => r.method === "GET").length;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
      expect(gets()).toBe(0);
      expect(await env.DB.prepare("SELECT provider_ref FROM orders WHERE order_code = ?").bind(orderCode).first()).toEqual({ provider_ref: null });
      w.clock.now = T0 + 300;
      expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 0, errors: 1 });
      expect(gets()).toBe(0);
      expect(logged(error).map((l) => l.event)).toEqual(["webhook_fulfil_failed", "reconcile_failed"]);
    } finally {
      error.mockRestore();
    }
    expect(await alertRows()).toEqual([]);
    expect(await count("licenses")).toBe(0);
  });
});

describe("(A5d) đối soát không đọc được trạng thái đơn từ cổng (dữ liệu mâu thuẫn, 3xx, 404): cảnh báo order_check_failed, đếm theo đơn", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const events = (spy: { mock: { calls: unknown[][] } }) => logged(spy).map((l) => l.event);
  /** `n` đơn USD đang chờ; cổng creem trả lời mọi lần hỏi trạng thái bằng `reply` (hàm fetch của CreemProvider thật). */
  async function pendingOrders(n: number, reply: () => Response | Promise<Response>) {
    const w = makeWorld({ OPERATOR_EMAIL: "ops@example.com" });
    for (let i = 0; i < n; i++) await checkout(w);
    w.deps.payments.creem = new CreemProvider(
      { baseUrl: "https://creem.test", apiKey: TEST_CREEM_API_KEY, webhookSecret: TEST_CREEM_WEBHOOK_SECRET, productIds: { ...TEST_CREEM_PRODUCTS } },
      async () => reply(),
    );
    w.clock.now = T0 + 300;
    return w;
  }
  const creemError = (status: number) => new Response(JSON.stringify({ trace_id: `t-${status}`, status, error: "x", message: ["x"] }), { status });

  it.each<[string, () => Response]>([
    ["chuyển hướng 307", () => new Response(null, { status: 307, headers: { location: "https://elsewhere.example/" } })],
    ["chuyển hướng 302", () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } })],
    ["404 (Creem không thấy phiên)", () => creemError(404)],
    ["thân JSON là mảng (HTTP 200)", () => new Response("[]")],
    ["thân không phải JSON (HTTP 200)", () => new Response("<html></html>")],
    ["dữ liệu mâu thuẫn: phiên khác với phiên đã hỏi (không có mã HTTP)", () => new Response(JSON.stringify({ id: "ch_khac", status: "completed", request_id: "1" }))],
    ["dữ liệu mâu thuẫn: order không phải đối tượng", () => new Response(JSON.stringify({ id: "ch_fake1", status: "completed", request_id: "1", order: "ord_1" }))],
  ])("%s: mỗi đơn lỗi một cảnh báo order_check_failed (count bằng số đơn), không dừng sớm, đơn nào cũng được hỏi và đánh dấu", async (_why, reply) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let asked = 0;
    const w = await pendingOrders(3, () => {
      asked++;
      return reply();
    });
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 3, granted: 0, errors: 3, alerts_sent: 1 });
    expect(asked).toBe(3);
    expect(await alertRows()).toEqual([{ kind: "order_check_failed", count: 3 }]);
    expect(events(error)).toEqual(["reconcile_failed", "reconcile_failed", "reconcile_failed"]);
    expect(events(warn)).not.toContain("reconcile_stopped_early");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE last_checked_at = ? AND status = 'pending'").bind(T0 + 300).first()).toEqual({ n: 3 });
    // Thư cho người vận hành: loại order_check_failed, nói cách tìm đơn.
    expect(w.resend.sent.map((m) => m.subject)).toEqual(["[license test] Cảnh báo: order_check_failed (3)"]);
  });

  it.each<[string, () => Response | Promise<Response>, string | null]>([
    ["500", () => creemError(500), null],
    ["503", () => creemError(503), null],
    ["429", () => creemError(429), null],
    ["400", () => creemError(400), null],
    ["quá thời gian chờ", () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")), null],
    ["lỗi mạng", () => Promise.reject(new TypeError("fetch failed")), null],
    ["401 của Creem (lỗi khóa: cảnh báo riêng creem_auth_failed)", () => creemError(401), "creem_auth_failed"],
    ["403 của Creem (lỗi khóa)", () => creemError(403), "creem_auth_failed"],
  ])("lỗi tạm hay lỗi khóa (%s): KHÔNG có cảnh báo order_check_failed", async (_why, reply, other) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = await pendingOrders(1, reply);
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, errors: 1 });
    expect(await alertRows()).toEqual(other === null ? [] : [{ kind: other, count: 1 }]);
  });

  it("(A5f) đơn chưa có provider_ref (phiên Creem chưa tạo được: không có gì để đọc) không cảnh báo; đơn có provider_ref mà Creem trả 404 thì có: count chỉ đếm đơn có phiên", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let asked = 0;
    const w = await pendingOrders(3, () => {
      asked++;
      return creemError(404);
    });
    await env.DB.prepare("UPDATE orders SET provider_ref = NULL WHERE order_code IN (SELECT order_code FROM orders ORDER BY order_code LIMIT 2)").run();
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 3, granted: 0, errors: 3 });
    expect(asked).toBe(1);
    expect(events(error)).toEqual(["reconcile_failed", "reconcile_failed", "reconcile_failed"]);
    expect(await alertRows()).toEqual([{ kind: "order_check_failed", count: 1 }]);
  });

  it("tạo cảnh báo lỗi D1 (nhánh reconcile_alert_failed): ghi log có loại cảnh báo, đối soát vẫn hỏi mọi đơn và các bước sau vẫn chạy", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = await pendingOrders(2, () => creemError(404));
    const result = await withFailingInsert("ops_alerts", "NEW.kind = 'order_check_failed'", () => reconcile(w.env, w.deps));
    expect(result).toMatchObject({ checked: 2, granted: 0, errors: 2 });
    expect(events(error)).toEqual(["reconcile_failed", "reconcile_alert_failed", "reconcile_failed", "reconcile_alert_failed"]);
    expect(logged(error).filter((l) => l.event === "reconcile_alert_failed")).toEqual([
      expect.objectContaining({ provider: "creem", kind: "order_check_failed" }),
      expect.objectContaining({ provider: "creem", kind: "order_check_failed" }),
    ]);
    expect(await alertRows()).toEqual([]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE last_checked_at = ?").bind(T0 + 300).first()).toEqual({ n: 2 });
  });
});

describe("(A5e) nhật ký cấp, gia hạn, đổi gói và chờ xử lý của đơn Creem ghi currency \"USD\" cạnh amount_paid", () => {
  /** `detail` của nhật ký `action` (đúng một dòng), đã parse. */
  const detailOf = async (action: string) => {
    const { results } = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = ?").bind(action).all<{ detail: string }>();
    expect(results).toHaveLength(1);
    return JSON.parse(results[0]!.detail) as Record<string, unknown>;
  };
  /** Creem (USD): mua Monthly, gia hạn Monthly, đổi sang 6 Months, rồi một đơn gia hạn mà license bị thu hồi trước khi tiền về. */
  async function scenario() {
    const w = makeWorld();
    const { licenseKey } = await w.buyCreem({ plan: "monthly" });
    await w.buyCreem({ plan: "monthly", licenseKey });
    await w.buyCreem({ plan: "six_months", licenseKey });
    const { checkoutId } = await checkout(w, { plan: "yearly", license_key: licenseKey });
    w.creem.pay(checkoutId);
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(w.clock.now).run();
    const hook = await w.creem.completedWebhook(checkoutId);
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "needs_review" });
  }

  it.each(["license_issued", "license_extended", "license_plan_changed", "order_needs_review"])("%s của đơn Creem: detail có currency \"USD\"", async (action) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await scenario();
      expect(await detailOf(action)).toMatchObject({ currency: "USD", amount_paid: expect.any(Number) });
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("đối soát đơn Creem khi webhook bị mất", () => {
  it("khách đã trả mà không có webhook: đối soát 5 phút thấy completed thì cấp license và gửi email", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toEqual({ checked: 1, granted: 1, errors: 0, emails_retried: 0, alerts_sent: 0 });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(w.resend.sent).toHaveLength(1);
  });

  it("webhook tới lúc API Creem còn báo processing: đơn thành processing, không cấp; đối soát vẫn hỏi lại đơn processing (sau 240 giây) và cấp khi Creem báo đã trả", async () => {
    const w = makeWorld();
    const { orderCode, token, checkoutId } = await checkout(w);
    // Phiên hoàn tất ở phía Creem nhưng GET còn báo processing (chưa có đơn): webhook tới trước khi API kịp cập nhật (spike S5).
    w.creem.setStatus(checkoutId, "processing");
    const hook = await w.creem.completedWebhook(checkoutId);
    w.clock.now = T0 + 60;
    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "not_paid" } });
    expect(await orderRow(orderCode)).toEqual({ status: "processing", amount_paid: 0, currency: "USD", provider: "creem" });
    expect((await w.getOrder(orderCode, token)).body).toMatchObject({ status: "processing" });
    expect(await count("licenses")).toBe(0);
    // Chưa tới hạn hỏi lại (lần hỏi cuối ở T0 + 60, giờ đầu hỏi lại sau 240 giây): đối soát bỏ qua đơn.
    w.clock.now = T0 + 120;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 0, granted: 0, errors: 0 });
    // Creem xong: tới hạn thì đối soát hỏi lại đơn processing (không phải chỉ pending và underpaid) và cấp.
    w.creem.pay(checkoutId);
    w.clock.now = T0 + 400;
    expect(await reconcile(w.env, w.deps)).toEqual({ checked: 1, granted: 1, errors: 0, emails_retried: 0, alerts_sent: 0 });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid", amount_paid: 399 });
    expect(await count("licenses")).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
    expect((await w.getOrder(orderCode, token)).body).toMatchObject({ status: "paid", grant_kind: "new", license_expires_at: T0 + 400 + 30 * DAY });
  });

  it("khách chưa trả: đối soát hỏi Creem, đơn vẫn pending; phiên hết hạn thì đơn chuyển expired", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 0, errors: 0 });
    expect(await orderRow(orderCode)).toMatchObject({ status: "pending" });
    w.creem.setStatus(checkoutId, "expired");
    // 3900 giây (65 phút) = sau giờ đầu (3600 giây), nơi đối soát chuyển sang hỏi lại mỗi 3540 giây (RECHECK_LATER, reconcile.ts); lần
    // hỏi trước ở T0 + 300 nên tới hạn từ T0 + 3840. Cũng đã quá hạn link 30 phút của đơn (T0 + 1800): đơn hết hạn do Creem báo,
    // không phải do đồng hồ của ta.
    w.clock.now = T0 + 3900;
    expect(await reconcile(w.env, w.deps)).toEqual({ checked: 1, granted: 0, errors: 0, emails_retried: 0, alerts_sent: 0 });
    expect(await orderRow(orderCode)).toEqual({ status: "expired", amount_paid: 0, currency: "USD", provider: "creem" });
    expect(await count("licenses")).toBe(0);
    expect(w.resend.sent).toHaveLength(0);
  });
});

describe("mua và gia hạn bằng Creem", () => {
  it("mua thêm cùng gói bằng USD: cộng 30 ngày vào hạn cũ như PayOS", async () => {
    const w = makeWorld();
    const first = await w.buyCreem();
    w.clock.now = T0 + 10 * DAY;
    const again = await w.buyCreem({ licenseKey: first.licenseKey });
    const lic = await env.DB.prepare("SELECT plan, expires_at, cycle_anchor FROM licenses").first();
    expect(lic).toEqual({ plan: "monthly", expires_at: T0 + 30 * DAY + 30 * DAY, cycle_anchor: T0 });
    expect((await w.getOrder(again.orderCode, again.orderToken)).body).toMatchObject({ status: "paid", grant_kind: "extend" });
  });

  it("khách mua bằng VND rồi gia hạn bằng USD (và ngược lại) trên cùng một license", async () => {
    const w = makeWorld();
    const first = await w.buy({ plan: "monthly" });
    const second = await w.buyCreem({ plan: "monthly", licenseKey: first.licenseKey });
    expect((await w.getOrder(second.orderCode, second.orderToken)).body).toMatchObject({ status: "paid", grant_kind: "extend" });
    const third = await w.buy({ plan: "monthly", licenseKey: first.licenseKey });
    expect((await w.getOrder(third.orderCode, third.orderToken)).body).toMatchObject({ status: "paid", grant_kind: "extend" });
    expect(await count("licenses")).toBe(1);
    // Hạn cuối: ba lần mua cùng gói ở cùng một lúc cộng đủ 3 × 30 ngày, bất kể cổng và loại tiền của từng đơn.
    expect(await env.DB.prepare("SELECT plan, expires_at, cycle_anchor, version FROM licenses").first()).toEqual({
      plan: "monthly",
      expires_at: T0 + 90 * DAY,
      cycle_anchor: T0,
      version: 2,
    });
    expect(await env.DB.prepare("SELECT provider, currency FROM orders ORDER BY order_code").all().then((r) => r.results)).toEqual([
      { provider: "payos", currency: "VND" },
      { provider: "creem", currency: "USD" },
      { provider: "payos", currency: "VND" },
    ]);
  });

  it("mua Monthly bằng VND rồi đổi sang 6 Months bằng USD khi còn 20 ngày: quy đổi theo bảng giá USD lúc cấp (21 ngày; bảng VND sẽ cho 22)", async () => {
    const w = makeWorld();
    const first = await w.buy({ plan: "monthly" });
    w.clock.now = T0 + 10 * DAY;
    const change = await w.buyCreem({ plan: "six_months", licenseKey: first.licenseKey });
    const expires = T0 + 10 * DAY + 180 * DAY + 21 * DAY;
    expect((await w.getOrder(change.orderCode, change.orderToken)).body).toMatchObject({
      status: "paid",
      grant_kind: "change",
      license_expires_at: expires,
    });
    expect(await env.DB.prepare("SELECT plan, expires_at, cycle_anchor FROM licenses").first()).toEqual({
      plan: "six_months",
      expires_at: expires,
      cycle_anchor: T0 + 10 * DAY,
    });
    const changed = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'license_plan_changed' AND order_code = ?")
      .bind(change.orderCode)
      .first<{ detail: string }>();
    expect(JSON.parse(changed!.detail)).toMatchObject({ from_plan: "monthly", plan: "six_months", converted_days: 21 });
  });
});

/**
 * D1 bọc lại cho test: `batch` chờ tới khi đủ `n` lần gọi rồi mới chạy, để dựng đúng ca "mọi request đã đọc đơn xong rồi mới
 * ghi" (khử trùng phải nằm trong batch, không ở lần đọc trước đó).
 */
function batchBarrier(db: D1Database, n: number) {
  let calls = 0;
  let open!: () => void;
  const allIn = new Promise<void>((r) => (open = r));
  const wrapped = new Proxy(db, {
    get(target, prop) {
      if (prop === "batch") {
        return async (stmts: D1PreparedStatement[]) => {
          if (++calls === n) open();
          await allIn;
          return target.batch(stmts);
        };
      }
      const v: unknown = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { db: wrapped, calls: () => calls };
}

describe("webhook Creem: hoàn tiền và tranh chấp (Q1 2026-10-15: hoàn đủ thì đơn thành refunded ở mọi trạng thái, mọi sự kiện để lại dấu; D5: không đụng license)", () => {
  const alerts = () => env.DB.prepare("SELECT kind, count FROM ops_alerts ORDER BY kind").all().then((r) => r.results);
  const audits = (action: string) =>
    env.DB.prepare("SELECT actor, order_code, detail FROM audit_log WHERE action = ?").bind(action).all().then((r) => r.results);
  /** Nhật ký hoàn tiền và tranh chấp của một đơn, theo thứ tự ghi, `detail` đã parse. */
  const refundLogs = (orderCode: number) =>
    env.DB.prepare(
      `SELECT action, detail FROM audit_log WHERE order_code = ?
         AND action IN ('order_refunded', 'order_partially_refunded', 'order_disputed', 'order_refund_unconfirmed') ORDER BY id`,
    )
      .bind(orderCode)
      .all<{ action: string; detail: string }>()
      .then((r) => r.results.map((x) => ({ action: x.action, detail: JSON.parse(x.detail) as Record<string, unknown> })));
  const licenseRow = () => env.DB.prepare("SELECT plan, expires_at, revoked_at FROM licenses").first();
  /** Số lần server hỏi Creem về phiên này. */
  const creemGets = (w: World, checkoutId: string) => w.creem.requests.filter((r) => r.method === "GET" && r.path.includes(checkoutId)).length;

  async function refund(w: World, checkoutId: string, opts: Parameters<World["creem"]["refundWebhook"]>[1] = {}) {
    const hook = await w.creem.refundWebhook(checkoutId, opts);
    return w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
  }

  it("hoàn đủ một đơn đã trả: đơn thành refunded, một nhật ký đủ dữ kiện, một cảnh báo, một dòng log, license giữ nguyên, app thấy refunded", async () => {
    const w = makeWorld();
    const { orderCode, orderToken, checkoutId } = await w.buyCreem();
    const before = await licenseRow();
    const lic = await env.DB.prepare("SELECT id FROM licenses").first<{ id: string }>();
    w.clock.now = T0 + 3600;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await refund(w, checkoutId, { eventId: "evt_refund_1" })).toMatchObject({ status: 200, body: { ok: true, result: "refunded" } });
      expect(logged(warn)).toEqual([
        { event: "order_refund_event", order_code: orderCode, action: "order_refunded", prev_status: "paid", status_after: "refunded", event_id: "evt_refund_1" },
      ]);
    } finally {
      warn.mockRestore();
    }
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded", amount_paid: 399 });
    expect(await licenseRow()).toEqual(before);
    expect((await w.getOrder(orderCode, orderToken)).body).toMatchObject({ status: "refunded" });
    expect(await audits("order_refunded")).toEqual([{ actor: "webhook", order_code: orderCode, detail: expect.any(String) }]);
    expect(await refundLogs(orderCode)).toEqual([
      {
        action: "order_refunded",
        detail: {
          event_id: "evt_refund_1",
          reason: "refund",
          provider_reason: "requested_by_customer",
          refund_status: "succeeded",
          full: true,
          refunded_amount: 399,
          refunded_total: 399,
          provider_amount_paid: 399,
          prev_status: "paid",
          plan: "monthly",
          amount: 399,
          currency: "USD",
          license_id: lic!.id,
        },
      },
    ]);
    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 1 }]);
  });

  it("đầu-cuối bằng thân THẬT của Creem sandbox (tạo phiên, checkout.completed, GET đã trả, refund.created hoàn đủ): cấp đúng một lần; hoàn đủ thì đơn refunded, một nhật ký order_refunded, một cảnh báo, license giữ nguyên (D5); gửi lại thì duplicate", async () => {
    const w = makeWorld();
    const REAL_CHECKOUT = "ch_491X90hRbNHfL1fKCEZYCt";
    let code: string | null = null;
    let paid = false;
    /** Chỉ đổi mã đơn của lần đo (`request_id`, `metadata.order_code`: "9000001") thành mã đơn của test, trong bộ nhớ. */
    const ours = (raw: string) => {
      if (code === null) throw new Error("chưa tạo phiên");
      return raw.replaceAll('"9000001"', JSON.stringify(code));
    };
    const json = (raw: string) => new Response(raw, { status: 200, headers: { "content-type": "application/json" } });
    const asked: string[] = [];
    w.deps.payments.creem = new CreemProvider(
      { baseUrl: "https://creem.test", apiKey: TEST_CREEM_API_KEY, webhookSecret: TEST_CREEM_WEBHOOK_SECRET, productIds: { ...TEST_CREEM_PRODUCTS } },
      async (url, init) => {
        const u = new URL(url);
        const method = init?.method ?? "GET";
        asked.push(`${method} ${u.pathname}`);
        if (method === "POST" && u.pathname === "/v1/checkouts") {
          code = (JSON.parse(String(init?.body)) as { request_id: string }).request_id;
          // Host sandbox (creem.io/test/…) đổi sang host thanh toán production mà server chấp nhận (CREEM_CHECKOUT_HOST).
          return json(ours(createCheckoutReal).replace("https://creem.io/test/checkout/", `https://${CREEM_CHECKOUT_HOST}/test/checkout/`));
        }
        if (method === "GET" && u.pathname === "/v1/checkouts" && u.searchParams.get("checkout_id") === REAL_CHECKOUT) {
          return json(ours(paid ? getPaidReal : getPendingReal));
        }
        return new Response(JSON.stringify({ trace_id: "khong_co" }), { status: 404 });
      },
    );
    const { orderCode, token } = await (async () => {
      const res = await w.call("POST", "/v1/checkout", usd);
      expect(res.status).toBe(201);
      return { orderCode: res.body.order_code as number, token: res.body.order_token as string };
    })();
    expect(code).toBe(String(orderCode));
    expect(await env.DB.prepare("SELECT provider_ref FROM orders WHERE order_code = ?").bind(orderCode).first()).toEqual({ provider_ref: REAL_CHECKOUT });
    // Đối soát lúc khách chưa trả: GET thật (không có order) giữ đơn pending.
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ granted: 0, errors: 0 });
    expect(await orderRow(orderCode)).toMatchObject({ status: "pending" });
    paid = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await signedRaw(w, ours(checkoutCompletedReal))).toMatchObject({ status: 200, body: { ok: true, result: "granted" } });
      expect(await signedRaw(w, ours(checkoutCompletedReal))).toMatchObject({ status: 200, body: { ok: true, result: "already_paid" } });
      expect(logged(warn).filter((l) => l.event === "creem_malformed_paid_session")).toEqual([]);
    } finally {
      warn.mockRestore();
    }
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid", amount_paid: 399, currency: "USD", provider: "creem" });
    expect(await count("licenses")).toBe(1);
    expect(await auditLog("license_issued")).toHaveLength(1);
    expect(w.resend.sent).toHaveLength(1);
    const before = await licenseRow();
    const lic = await env.DB.prepare("SELECT id FROM licenses").first<{ id: string }>();
    // Sau khi hoàn đủ, GET của Creem vẫn báo phiên completed và order paid (đo ở sandbox): webhook là nguồn duy nhất.
    w.clock.now = T0 + 3600;
    expect(await signedRaw(w, ours(refundCreatedReal))).toMatchObject({ status: 200, body: { ok: true, result: "refunded" } });
    expect(await signedRaw(w, ours(refundCreatedReal))).toMatchObject({ status: 200, body: { ok: true, result: "duplicate" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded", amount_paid: 399 });
    expect((await w.getOrder(orderCode, token)).body).toMatchObject({ status: "refunded" });
    expect(await licenseRow()).toEqual(before);
    expect(await refundLogs(orderCode)).toEqual([
      {
        action: "order_refunded",
        detail: {
          event_id: "evt_6LprlBm83BiXo9APW4YxcY",
          reason: "refund",
          provider_reason: "requested_by_customer",
          refund_status: "succeeded",
          full: true,
          refunded_amount: 399,
          refunded_total: 399,
          provider_amount_paid: 399,
          prev_status: "paid",
          plan: "monthly",
          amount: 399,
          currency: "USD",
          license_id: lic!.id,
        },
      },
    ]);
    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 1 }]);
    expect(await unmatchedLogs()).toEqual([]);
    // Webhook thanh toán gửi lại sau khi hoàn: đơn đã khép, không hỏi Creem, không cấp lại.
    const gets = asked.filter((a) => a.startsWith("GET")).length;
    expect(await signedRaw(w, ours(checkoutCompletedReal))).toMatchObject({ status: 200, body: { ok: true, result: "already_settled" } });
    expect(asked.filter((a) => a.startsWith("GET")).length).toBe(gets);
    expect(await count("licenses")).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
  });

  it("cùng một sự kiện gửi ba lần chồng nhau (cả ba đọc đơn trước khi ghi): một lần đổi trạng thái, một nhật ký, một cảnh báo; gửi lại sau đó vẫn duplicate", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    const hook = await w.creem.refundWebhook(checkoutId, { eventId: "evt_dup" });
    const barrier = batchBarrier(env.DB, 3);
    const gated = makeWorld({ DB: barrier.db });
    const results = await Promise.all([1, 2, 3].map(() => gated.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)));
    expect(barrier.calls()).toBe(3);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.map((r) => r.body.result).sort()).toEqual(["duplicate", "duplicate", "refunded"]);
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect(await audits("order_refunded")).toHaveLength(1);
    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 1 }]);
    // Creem thử lại hay người vận hành gửi lại tay ở dashboard: cùng mã sự kiện, không ghi gì thêm.
    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "duplicate" } });
    expect(await refundLogs(orderCode)).toHaveLength(1);
    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 1 }]);
  });

  it("sự kiện thứ hai KHÁC mã trên đơn đã refunded: noted, thêm một nhật ký, cảnh báo tăng, đơn giữ refunded", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    expect(await refund(w, checkoutId, { eventId: "evt_a" })).toMatchObject({ body: { result: "refunded" } });
    expect(await refund(w, checkoutId, { eventId: "evt_b" })).toMatchObject({ status: 200, body: { ok: true, result: "noted" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect((await refundLogs(orderCode)).map((l) => [l.action, l.detail.event_id, l.detail.prev_status])).toEqual([
      ["order_refunded", "evt_a", "paid"],
      ["order_refunded", "evt_b", "refunded"],
    ]);
    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 2 }]);
  });

  it("kịch bản (a): hoàn đủ rồi khách mở tranh chấp: tranh chấp vẫn có nhật ký order_disputed và cảnh báo, đơn giữ refunded", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    expect(await refund(w, checkoutId)).toMatchObject({ body: { result: "refunded" } });
    expect(await refund(w, checkoutId, { dispute: true })).toMatchObject({ status: 200, body: { ok: true, result: "noted" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect((await refundLogs(orderCode)).map((l) => [l.action, l.detail.reason, l.detail.prev_status])).toEqual([
      ["order_refunded", "refund", "paid"],
      ["order_disputed", "dispute", "refunded"],
    ]);
    expect(await alerts()).toEqual([
      { kind: "order_disputed", count: 1 },
      { kind: "order_refunded", count: 1 },
    ]);
  });

  it.each(["pending", "processing", "underpaid", "failed", "expired", "cancelled", "paid_needs_review"])(
    "hoàn đủ một đơn đang %s: đơn thành refunded, nhật ký và cảnh báo; sau đó không bao giờ cấp (đối soát, webhook thanh toán tới muộn)",
    async (status) => {
      const w = makeWorld();
      const { orderCode, token, checkoutId } = await checkout(w);
      w.creem.pay(checkoutId);
      const paidHook = await w.creem.completedWebhook(checkoutId);
      await env.DB.prepare("UPDATE orders SET status = ? WHERE order_code = ?").bind(status, orderCode).run();
      expect(await refund(w, checkoutId)).toMatchObject({ status: 200, body: { ok: true, result: "refunded" } });
      expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
      expect((await refundLogs(orderCode)).map((l) => [l.action, l.detail.prev_status, l.detail.full])).toEqual([["order_refunded", status, true]]);
      expect(await alerts()).toEqual([{ kind: "order_refunded", count: 1 }]);
      // Creem vẫn báo phiên đã trả, nhưng đơn đã khép: đối soát không hỏi, webhook thanh toán tới muộn không cấp.
      w.clock.now = T0 + 300;
      expect(await reconcile(w.env, w.deps)).toMatchObject({ granted: 0, errors: 0 });
      expect(await w.call("POST", "/v1/webhooks/creem", paidHook.raw, paidHook.headers)).toMatchObject({
        status: 200,
        body: { ok: true, result: "already_settled" },
      });
      expect(creemGets(w, checkoutId)).toBe(0);
      expect(await count("licenses")).toBe(0);
      expect(w.resend.sent).toHaveLength(0);
      expect((await w.getOrder(orderCode, token)).body).toMatchObject({ status: "refunded" });
    },
  );

  it("theo tài liệu Creem: khách trả, webhook thanh toán mất, hoàn đủ tới trước khi cấp (GET vẫn paid): đơn refunded, đối soát KHÔNG cấp, app thấy refunded", async () => {
    const w = makeWorld();
    const { orderCode, token, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId); // webhook checkout.completed không bao giờ tới
    w.clock.now = T0 + 60;
    expect(await refund(w, checkoutId)).toMatchObject({ status: 200, body: { ok: true, result: "refunded" } });
    // Hoàn tiền nằm ở giao dịch, không ở đơn: hỏi Creem vẫn thấy phiên đã trả đủ.
    expect(await w.deps.payments.creem!.getPaymentStatus({ orderCode, providerRef: checkoutId })).toMatchObject({ status: "paid", amountPaid: 399 });
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 0, granted: 0, errors: 0 });
    expect(await count("licenses")).toBe(0);
    expect(w.resend.sent).toHaveLength(0);
    const polled = await w.getOrder(orderCode, token);
    expect(polled.body).toMatchObject({ status: "refunded" });
    expect(polled.body).not.toHaveProperty("license_key");
    expect(await refundLogs(orderCode)).toEqual([
      { action: "order_refunded", detail: expect.objectContaining({ prev_status: "pending", full: true, license_id: null }) },
    ]);
    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 1 }]);
  });

  it("hoàn một phần: đơn vẫn paid, nhật ký order_partially_refunded có số đã hoàn và số khách đã trả, cảnh báo", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    expect(await refund(w, checkoutId, { amount: 100 })).toMatchObject({ status: 200, body: { ok: true, result: "noted" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(await refundLogs(orderCode)).toEqual([
      {
        action: "order_partially_refunded",
        detail: expect.objectContaining({ full: false, refund_status: "succeeded", refunded_amount: 100, provider_amount_paid: 399, prev_status: "paid" }),
      },
    ]);
    expect(await alerts()).toEqual([{ kind: "order_partially_refunded", count: 1 }]);
  });

  it("hoàn một phần gửi lại cùng mã sự kiện: lần sau duplicate, không thêm nhật ký hay cảnh báo", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    expect(await refund(w, checkoutId, { amount: 100, eventId: "evt_part" })).toMatchObject({ body: { result: "noted" } });
    expect(await refund(w, checkoutId, { amount: 100, eventId: "evt_part" })).toMatchObject({ status: 200, body: { ok: true, result: "duplicate" } });
    expect(await refundLogs(orderCode)).toHaveLength(1);
    expect(await alerts()).toEqual([{ kind: "order_partially_refunded", count: 1 }]);
  });

  it.each(["failed", "pending"])("lần hoàn chưa thành công (status %s), dù đủ tiền: nhật ký và cảnh báo order_refund_unconfirmed, đơn giữ paid", async (status) => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    expect(await refund(w, checkoutId, { status })).toMatchObject({ status: 200, body: { ok: true, result: "noted" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(await refundLogs(orderCode)).toEqual([
      { action: "order_refund_unconfirmed", detail: expect.objectContaining({ refund_status: status, full: false, refunded_amount: 399 }) },
    ]);
    expect(await alerts()).toEqual([{ kind: "order_refund_unconfirmed", count: 1 }]);
  });

  it("tranh chấp (chargeback) lấy lại đủ tiền: đơn thành refunded, nhật ký order_disputed (full), cảnh báo order_disputed, license giữ nguyên", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem({ tax: 80 });
    const before = await licenseRow();
    w.clock.now = T0 + 3600;
    expect(await refund(w, checkoutId, { dispute: true })).toMatchObject({ status: 200, body: { result: "refunded" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect(await licenseRow()).toEqual(before);
    expect(await audits("order_refunded")).toEqual([]);
    expect(await refundLogs(orderCode)).toEqual([
      {
        action: "order_disputed",
        detail: expect.objectContaining({ reason: "dispute", full: true, refund_status: null, provider_reason: null, refunded_amount: 479, provider_amount_paid: 479 }),
      },
    ]);
    expect(await alerts()).toEqual([{ kind: "order_disputed", count: 1 }]);
  });

  it("tranh chấp một phần: chỉ ghi nhận, cảnh báo order_disputed", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    expect(await refund(w, checkoutId, { dispute: true, amount: 100 })).toMatchObject({ body: { result: "noted" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(await refundLogs(orderCode)).toEqual([{ action: "order_disputed", detail: expect.objectContaining({ full: false, refunded_amount: 100 }) }]);
    expect(await alerts()).toEqual([{ kind: "order_disputed", count: 1 }]);
  });

  it("phiên không thuộc đơn nào của ta (QĐ-7): 200 unknown_order, log refund_unknown_order và payment_unmatched, một nhật ký payment_unmatched không gắn đơn, một cảnh báo payment_unmatched; gửi lại cùng mã không ghi thêm", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    await env.DB.prepare("UPDATE orders SET provider_ref = 'ch_khac'").run();
    const detail = { provider: "creem", event_type: "refund.created", provider_ref: checkoutId, event_id: "evt_lac" };
    const unknown = { event: "refund_unknown_order", provider: "creem", reason: "refund", event_id: "evt_lac" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await refund(w, checkoutId, { eventId: "evt_lac" })).toMatchObject({ status: 200, body: { ok: true, result: "unknown_order" } });
      expect(logged(warn)).toEqual([unknown, { event: "payment_unmatched", ...detail }]);
      // Creem gửi lại cùng sự kiện: vẫn unknown_order, không thêm nhật ký hay cảnh báo.
      expect(await refund(w, checkoutId, { eventId: "evt_lac" })).toMatchObject({ status: 200, body: { ok: true, result: "unknown_order" } });
      expect(logged(warn)).toEqual([unknown, { event: "payment_unmatched", ...detail }, unknown]);
    } finally {
      warn.mockRestore();
    }
    expect(await refundLogs(orderCode)).toEqual([]);
    expect(await unmatchedLogs()).toEqual([{ actor: "webhook", license_id: null, order_code: null, detail }]);
    expect(await alerts()).toEqual([{ kind: "payment_unmatched", count: 1 }]);
  });

  it("tranh chấp của phiên không thuộc đơn nào: nhật ký payment_unmatched mang loại sự kiện dispute.created, cảnh báo", async () => {
    const w = makeWorld();
    const { checkoutId } = await w.buyCreem();
    await env.DB.prepare("UPDATE orders SET provider_ref = 'ch_khac'").run();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await refund(w, checkoutId, { dispute: true, eventId: "evt_tc" })).toMatchObject({ status: 200, body: { ok: true, result: "unknown_order" } });
    } finally {
      warn.mockRestore();
    }
    expect((await unmatchedLogs()).map((l) => l.detail)).toEqual([{ provider: "creem", event_type: "dispute.created", provider_ref: checkoutId, event_id: "evt_tc" }]);
    expect(await alerts()).toEqual([{ kind: "payment_unmatched", count: 1 }]);
  });

  it("lọc theo cổng: đơn PayOS mang provider_ref trùng mã phiên Creem không bị đụng", async () => {
    const w = makeWorld();
    const vnd = await w.buy();
    const usdOrder = await w.buyCreem();
    await env.DB.prepare("UPDATE orders SET provider_ref = ? WHERE order_code = ?").bind(usdOrder.checkoutId, vnd.orderCode).run();
    expect(await refund(w, usdOrder.checkoutId)).toMatchObject({ status: 200, body: { result: "refunded" } });
    expect(await orderRow(vnd.orderCode)).toMatchObject({ status: "paid", provider: "payos" });
    expect(await refundLogs(vnd.orderCode)).toEqual([]);
    expect(await orderRow(usdOrder.orderCode)).toMatchObject({ status: "refunded", provider: "creem" });
    expect(await refundLogs(usdOrder.orderCode)).toHaveLength(1);
  });

  it("nhật ký hoàn tiền mang cột license_id của đơn (đơn đã cấp: license đã cấp; đơn gia hạn chưa cấp: license được gia hạn; đơn mới chưa cấp: NULL), để trang license ở Web Admin thấy", async () => {
    const w = makeWorld();
    const granted = await w.buyCreem();
    const lic = await env.DB.prepare("SELECT id FROM licenses").first<{ id: string }>();
    const renewal = await checkout(w, { license_key: granted.licenseKey });
    w.creem.pay(renewal.checkoutId);
    const fresh = await checkout(w);
    w.creem.pay(fresh.checkoutId);
    for (const id of [granted.checkoutId, renewal.checkoutId, fresh.checkoutId]) {
      expect(await refund(w, id)).toMatchObject({ status: 200, body: { result: "refunded" } });
    }
    const column = (orderCode: number) =>
      env.DB.prepare("SELECT license_id, json_extract(detail, '$.license_id') AS in_detail FROM audit_log WHERE order_code = ? AND action = 'order_refunded'")
        .bind(orderCode)
        .first();
    expect(await column(granted.orderCode)).toEqual({ license_id: lic!.id, in_detail: lic!.id });
    expect(await column(renewal.orderCode)).toEqual({ license_id: lic!.id, in_detail: lic!.id });
    expect(await column(fresh.orderCode)).toEqual({ license_id: null, in_detail: null });
    // Như trang license ở Web Admin tra: theo cột license_id.
    const byLicense = await env.DB.prepare("SELECT order_code, action FROM audit_log WHERE license_id = ? AND action = 'order_refunded' ORDER BY id")
      .bind(lic!.id)
      .all()
      .then((r) => r.results);
    expect(byLicense).toEqual([
      { order_code: granted.orderCode, action: "order_refunded" },
      { order_code: renewal.orderCode, action: "order_refunded" },
    ]);
  });

  it.each([
    ["mua mới", false],
    ["gia hạn", true],
  ])(
    "hoàn đủ chen vào giữa lúc cấp đơn %s (đã đọc đơn pending và hỏi Creem thấy paid, chưa ghi): already_settled, không cấp, không email",
    async (_kind, renew) => {
      const w = makeWorld();
      const first = renew ? await w.buyCreem() : null;
      const licenseBefore = renew ? await licenseRow() : null;
      const sentBefore = w.resend.sent.length;
      const { orderCode, checkoutId } = await checkout(w, first ? { license_key: first.licenseKey } : {});
      w.creem.pay(checkoutId);
      const paidHook = await w.creem.completedWebhook(checkoutId);
      const refundHook = await w.creem.refundWebhook(checkoutId);
      // Webhook hoàn tiền tới đúng lúc fulfilOrder đang hỏi Creem: sau khi đọc đơn (pending), trước khi ghi cấp license.
      let refundResult: unknown;
      w.deps.payments.creem = new CreemProvider(
        { baseUrl: "https://creem.test", apiKey: TEST_CREEM_API_KEY, webhookSecret: TEST_CREEM_WEBHOOK_SECRET, productIds: { ...TEST_CREEM_PRODUCTS } },
        async (url, init) => {
          if ((init?.method ?? "GET") === "GET" && refundResult === undefined) {
            refundResult = (await w.call("POST", "/v1/webhooks/creem", refundHook.raw, refundHook.headers)).body.result;
          }
          return w.creem.fetch(url, init);
        },
      );
      expect(await w.call("POST", "/v1/webhooks/creem", paidHook.raw, paidHook.headers)).toMatchObject({
        status: 200,
        body: { ok: true, result: "already_settled" },
      });
      expect(refundResult).toBe("refunded");
      expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
      expect(await count("licenses")).toBe(renew ? 1 : 0);
      if (renew) expect(await licenseRow()).toEqual(licenseBefore);
      expect(w.resend.sent).toHaveLength(sentBefore);
      expect((await refundLogs(orderCode)).map((l) => [l.action, l.detail.prev_status])).toEqual([["order_refunded", "pending"]]);
    },
  );

  it("sự kiện thiếu mã (body.id) không khử trùng được: gửi lại hai lần thì trạng thái đổi một lần, nhưng mỗi lần thêm một nhật ký và một cảnh báo", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    const hook = await w.creem.refundWebhook(checkoutId, { eventId: null });
    expect(JSON.parse(hook.raw)).not.toHaveProperty("id");
    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { result: "refunded" } });
    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { result: "noted" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect((await refundLogs(orderCode)).map((l) => [l.action, l.detail.event_id, l.detail.prev_status])).toEqual([
      ["order_refunded", null, "paid"],
      ["order_refunded", null, "refunded"],
    ]);
    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 2 }]);
  });

  it("(S5) hai lần hoàn một phần (mã khác nhau), mỗi payload chỉ mang refund_amount của lần đó (giao dịch là ảnh chụp, refunded_amount null): cộng dồn từ nhật ký, lần sau đủ (200 + 199 = 399, đúng bằng số đã trả) nên đơn thành refunded", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    expect(await refund(w, checkoutId, { amount: 200, eventId: "evt_p1" })).toMatchObject({ status: 200, body: { result: "noted" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(await refund(w, checkoutId, { amount: 199, eventId: "evt_p2" })).toMatchObject({ status: 200, body: { result: "refunded" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect((await refundLogs(orderCode)).map((l) => [l.action, l.detail.event_id, l.detail.refunded_amount, l.detail.refunded_total, l.detail.full, l.detail.prev_status])).toEqual([
      ["order_partially_refunded", "evt_p1", 200, 200, false, "paid"],
      ["order_refunded", "evt_p2", 199, 399, true, "paid"],
    ]);
    expect(await alerts()).toEqual([
      { kind: "order_partially_refunded", count: 1 },
      { kind: "order_refunded", count: 1 },
    ]);
  });

  it("(S5) cộng dồn chưa tới số đã trả thì vẫn một phần (200 + 198 = 398 < 399); lần hoàn trùng mã sự kiện không cộng hai lần; lần đang chờ hay thất bại và tranh chấp không cộng; tới đủ (thêm 1 cent) thì refunded", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    expect(await refund(w, checkoutId, { amount: 200, eventId: "evt_a" })).toMatchObject({ body: { result: "noted" } });
    // Creem gửi lại cùng sự kiện: không ghi, không cộng (200 + 200 sẽ thành đủ nếu cộng hai lần).
    expect(await refund(w, checkoutId, { amount: 200, eventId: "evt_a" })).toMatchObject({ body: { result: "duplicate" } });
    expect(await refund(w, checkoutId, { amount: 199, status: "pending", eventId: "evt_cho" })).toMatchObject({ body: { result: "noted" } });
    expect(await refund(w, checkoutId, { amount: 199, status: "failed", eventId: "evt_hong" })).toMatchObject({ body: { result: "noted" } });
    expect(await refund(w, checkoutId, { dispute: true, amount: 199, eventId: "evt_tc" })).toMatchObject({ body: { result: "noted" } });
    expect(await refund(w, checkoutId, { amount: 198, eventId: "evt_b" })).toMatchObject({ body: { result: "noted" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(await refund(w, checkoutId, { amount: 1, eventId: "evt_c" })).toMatchObject({ body: { result: "refunded" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect((await refundLogs(orderCode)).map((l) => [l.action, l.detail.event_id, l.detail.refunded_amount, l.detail.refunded_total])).toEqual([
      ["order_partially_refunded", "evt_a", 200, 200],
      ["order_refund_unconfirmed", "evt_cho", 199, null],
      ["order_refund_unconfirmed", "evt_hong", 199, null],
      ["order_disputed", "evt_tc", 199, null],
      ["order_partially_refunded", "evt_b", 198, 398],
      ["order_refunded", "evt_c", 1, 399],
    ]);
    // Mọi nhật ký hoàn tiền và tranh chấp mang loại tiền của đơn: Web Admin in số tiền (kể cả refunded_total) bằng đô la.
    expect((await refundLogs(orderCode)).map((l) => l.detail.currency)).toEqual(["USD", "USD", "USD", "USD", "USD", "USD"]);
    // Đơn đã refunded: lần hoàn một phần nữa chỉ ghi nhận (noted), đơn giữ refunded.
    expect(await refund(w, checkoutId, { amount: 5, eventId: "evt_d" })).toMatchObject({ body: { result: "noted" } });
    expect((await refundLogs(orderCode)).at(-1)).toMatchObject({ action: "order_refunded", detail: { event_id: "evt_d", refunded_total: 404, prev_status: "refunded" } });
  });

  it("(S5) hai lần hoàn một phần KHÁC mã chạy chồng THẬT (cả hai đọc tổng đã hoàn = 0 trước khi ghi): lần ghi sau thấy tổng đã đổi nên đọc lại và cộng dồn: một noted, một refunded, đơn refunded", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    const first = await w.creem.refundWebhook(checkoutId, { amount: 200, eventId: "evt_x" });
    const second = await w.creem.refundWebhook(checkoutId, { amount: 199, eventId: "evt_y" });
    const barrier = batchBarrier(env.DB, 2);
    const gated = makeWorld({ DB: barrier.db });
    const results = await Promise.all([first, second].map((h) => gated.call("POST", "/v1/webhooks/creem", h.raw, h.headers)));
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results.map((r) => r.body.result).sort()).toEqual(["noted", "refunded"]);
    // Hai batch đầu chạy chồng, lần thua ghi lại một lần nữa sau khi đọc tổng mới.
    expect(barrier.calls()).toBe(3);
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect((await refundLogs(orderCode)).map((l) => [l.action, l.detail.refunded_total])).toEqual([
      ["order_partially_refunded", expect.any(Number)],
      ["order_refunded", 399],
    ]);
    expect(await alerts()).toEqual([
      { kind: "order_partially_refunded", count: 1 },
      { kind: "order_refunded", count: 1 },
    ]);
  });

  it("(S5) lần hoàn khác của đơn cứ được ghi chen vào giữa lúc đọc tổng và lúc ghi, quá 3 lần: 503 để Creem gửi lại, không ghi gì của sự kiện này, không cảnh báo; gửi lại thì cộng dồn đủ cả các lần đã chen", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    const hook = await w.creem.refundWebhook(checkoutId, { amount: 100, eventId: "evt_bi_chen" });
    let batches = 0;
    const db = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "batch") {
          return async (stmts: D1PreparedStatement[]) => {
            batches++;
            // Một lần hoàn 1 cent khác mã được ghi ngay trước batch của sự kiện này.
            await target
              .prepare("INSERT INTO audit_log (at, actor, action, order_code, detail) VALUES (?1, 'webhook', 'order_partially_refunded', ?2, ?3)")
              .bind(T0, orderCode, JSON.stringify({ event_id: `evt_chen_${batches}`, refunded_amount: 1 }))
              .run();
            return target.batch(stmts);
          };
        }
        const v: unknown = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const gated = makeWorld({ DB: db });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await gated.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
      expect(logged(err).map((l) => l.event)).toEqual(["webhook_refund_failed"]);
    } finally {
      err.mockRestore();
    }
    expect(batches).toBe(3);
    expect((await refundLogs(orderCode)).map((l) => l.detail.event_id)).toEqual(["evt_chen_1", "evt_chen_2", "evt_chen_3"]);
    expect(await alerts()).toEqual([]);
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { result: "noted" } });
    expect((await refundLogs(orderCode)).at(-1)).toMatchObject({ action: "order_partially_refunded", detail: { event_id: "evt_bi_chen", refunded_total: 103 } });
  });

  it("(S5) refund_amount thiếu hay sai kiểu: dùng dự phòng transaction.refunded_amount (đủ thì refunded); cả hai thiếu thì không biết số hoàn: chỉ ghi nhận một phần, không cộng dồn", async () => {
    const w = makeWorld();
    const a = await w.buyCreem();
    expect(await refund(w, a.checkoutId, { amount: null, refundedTotal: 399 })).toMatchObject({ body: { result: "refunded" } });
    expect((await refundLogs(a.orderCode)).map((l) => [l.action, l.detail.refunded_amount, l.detail.refunded_total])).toEqual([["order_refunded", 399, 399]]);
    const b = await w.buyCreem({ email: "b@example.com" });
    expect(await refund(w, b.checkoutId, { amount: null, eventId: "evt_null" })).toMatchObject({ body: { result: "noted" } });
    expect(await refund(w, b.checkoutId, { amount: 399, status: "pending", eventId: "evt_cho2" })).toMatchObject({ body: { result: "noted" } });
    expect(await orderRow(b.orderCode)).toMatchObject({ status: "paid" });
    expect((await refundLogs(b.orderCode)).map((l) => [l.action, l.detail.refunded_amount, l.detail.refunded_total])).toEqual([
      ["order_partially_refunded", null, null],
      ["order_refund_unconfirmed", 399, null],
    ]);
  });

  it("đúng chữ ký mà không có mã phiên để tra đơn (refund.created thiếu checkout hay checkout là số, dispute.created thiếu checkout): 200 unmatched, nhật ký và cảnh báo payment_unmatched, đơn không bị đụng; sai chữ ký: 400 invalid_signature và có cảnh báo", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    const events = [
      await w.creem.signedEvent("refund.created", { id: "ref_x", status: "succeeded" }, "evt_r1"),
      await w.creem.signedEvent("refund.created", { id: "ref_y", status: "succeeded", checkout: 7 }, "evt_r2"),
      await w.creem.signedEvent("dispute.created", { id: "disp_z", amount: 399 }, "evt_d1"),
    ];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (const e of events) {
        expect(await w.call("POST", "/v1/webhooks/creem", e.raw, e.headers)).toMatchObject({ status: 200, body: { ok: true, result: "unmatched" } });
      }
      const hook = await w.creem.refundWebhook(checkoutId);
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, { "creem-signature": "0".repeat(64) })).toMatchObject({
        status: 400,
        body: { error: "invalid_signature" },
      });
    } finally {
      warn.mockRestore();
    }
    expect((await unmatchedLogs()).map((l) => l.detail)).toEqual([
      { provider: "creem", event_type: "refund.created", provider_ref: "ref_x", event_id: "evt_r1" },
      { provider: "creem", event_type: "refund.created", provider_ref: "ref_y", event_id: "evt_r2" },
      { provider: "creem", event_type: "dispute.created", provider_ref: "disp_z", event_id: "evt_d1" },
    ]);
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(await refundLogs(orderCode)).toEqual([]);
    expect(await alerts()).toEqual([
      { kind: "payment_unmatched", count: 3 },
      { kind: "webhook_bad_signature", count: 1 },
    ]);
  });

  it("refund.created mà checkout là chuỗi mã phiên (không phải object): tin như checkout.id, tra được đơn, đơn thành refunded, nhật ký order_refunded", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    // Giao dịch là ảnh chụp lúc phát sự kiện như payload thật (refunded_amount null); số hoàn ở refund_amount.
    const transaction = { id: "tran_x", amount: 399, amount_paid: 399, status: "paid", refunded_amount: null };
    const hook = await w.creem.signedEvent(
      "refund.created",
      { id: "ref_s", status: "succeeded", refund_amount: 399, refund_currency: "USD", transaction, checkout: checkoutId },
      "evt_chuoi",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "refunded" } });
    } finally {
      warn.mockRestore();
    }
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect((await refundLogs(orderCode)).map((l) => [l.action, l.detail.event_id, l.detail.full])).toEqual([["order_refunded", "evt_chuoi", true]]);
    expect(await unmatchedLogs()).toEqual([]);
    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 1 }]);
  });

  it("cổng báo refunded khi hỏi lại (lớp phòng thủ) rồi webhook hoàn tiền tới sau: hai nhật ký order_refunded khác khóa (nguồn provider_status, rồi mã sự kiện), cảnh báo count 2, đơn giữ refunded (chấp nhận theo Q1); gửi lại sự kiện thì duplicate", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const paidHook = await w.creem.completedWebhook(checkoutId);
    const refundHook = await w.creem.refundWebhook(checkoutId, { eventId: "evt_sau" });
    w.creem.setOrderStatus(checkoutId, "refunded");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await w.call("POST", "/v1/webhooks/creem", paidHook.raw, paidHook.headers)).toMatchObject({ status: 200, body: { result: "not_paid" } });
      expect(await w.call("POST", "/v1/webhooks/creem", refundHook.raw, refundHook.headers)).toMatchObject({ status: 200, body: { result: "noted" } });
      expect(await w.call("POST", "/v1/webhooks/creem", refundHook.raw, refundHook.headers)).toMatchObject({ status: 200, body: { result: "duplicate" } });
    } finally {
      warn.mockRestore();
    }
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect((await refundLogs(orderCode)).map((l) => [l.action, l.detail.source, l.detail.event_id, l.detail.prev_status])).toEqual([
      ["order_refunded", "provider_status", undefined, "pending"],
      ["order_refunded", undefined, "evt_sau", "refunded"],
    ]);
    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 2 }]);
  });

  it("webhook hoàn tiền chen vào lúc fulfilOrder đang hỏi Creem và Creem báo refunded: chỉ nhật ký của webhook (một dòng, một cảnh báo); câu ghi của fulfilOrder không có tác dụng vì đơn đã khép", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const paidHook = await w.creem.completedWebhook(checkoutId);
    const refundHook = await w.creem.refundWebhook(checkoutId, { eventId: "evt_chen" });
    w.creem.setOrderStatus(checkoutId, "refunded");
    let refundResult: unknown;
    w.deps.payments.creem = new CreemProvider(
      { baseUrl: "https://creem.test", apiKey: TEST_CREEM_API_KEY, webhookSecret: TEST_CREEM_WEBHOOK_SECRET, productIds: { ...TEST_CREEM_PRODUCTS } },
      async (url, init) => {
        if ((init?.method ?? "GET") === "GET" && refundResult === undefined) {
          refundResult = (await w.call("POST", "/v1/webhooks/creem", refundHook.raw, refundHook.headers)).body.result;
        }
        return w.creem.fetch(url, init);
      },
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await w.call("POST", "/v1/webhooks/creem", paidHook.raw, paidHook.headers)).toMatchObject({ status: 200, body: { result: "not_paid" } });
      expect(logged(warn).filter((l) => l.source === "provider_status")).toEqual([]);
    } finally {
      warn.mockRestore();
    }
    expect(refundResult).toBe("refunded");
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect((await refundLogs(orderCode)).map((l) => [l.action, l.detail.event_id, l.detail.prev_status])).toEqual([["order_refunded", "evt_chen", "pending"]]);
    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 1 }]);
  });

  it("D1 lỗi giữa chừng (ghi nhật ký hỏng): 503 để Creem gửi lại, đơn giữ paid, không cảnh báo; gửi lại thì xử lý đủ", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    const hook = await w.creem.refundWebhook(checkoutId);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await withFailingInsert("audit_log", "NEW.action = 'order_refunded'", async () => {
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
      });
    } finally {
      err.mockRestore();
    }
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(await alerts()).toEqual([]);
    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { result: "refunded" } });
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect(await refundLogs(orderCode)).toHaveLength(1);
    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 1 }]);
  });

  it("ghi cảnh báo hỏng: nhật ký cùng batch quay lui (503), nên lần gửi lại không bị coi là trùng và vẫn có cảnh báo", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await w.buyCreem();
    const hook = await w.creem.refundWebhook(checkoutId, { amount: 100 });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await withFailingInsert("ops_alerts", "NEW.kind = 'order_partially_refunded'", async () => {
        expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
      });
    } finally {
      err.mockRestore();
    }
    expect(await refundLogs(orderCode)).toEqual([]);
    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { result: "noted" } });
    expect(await refundLogs(orderCode)).toHaveLength(1);
    expect(await alerts()).toEqual([{ kind: "order_partially_refunded", count: 1 }]);
  });
});

describe("cổng từ chối khóa API (HTTP 401, 403 có thân JSON của Creem): cảnh báo creem_auth_failed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
  /** Thay cổng Creem của world bằng bản dùng `apiKey` và `fetchFn` (mặc định FakeCreem). */
  const useCreem = (w: World, apiKey: string, fetchFn: FetchFn = w.creem.fetch) => {
    w.deps.payments.creem = new CreemProvider(
      { baseUrl: "https://creem.test", apiKey, webhookSecret: TEST_CREEM_WEBHOOK_SECRET, productIds: { ...TEST_CREEM_PRODUCTS } },
      fetchFn,
    );
  };
  /** Khóa API đã bị thu hồi: FakeCreem trả 403 (khóa có mà sai). */
  const revokeKey = (w: World) => useCreem(w, "ck_da_thu_hoi");
  /** Không có khóa: FakeCreem trả 401. */
  const missingKey = (w: World) => useCreem(w, "");
  /** Tường lửa hay CDN chặn trước khi tới Creem: 403 HTML, không phải thân của Creem. */
  const firewall = (w: World) => useCreem(w, TEST_CREEM_API_KEY, async () => new Response("<html><body>Access denied</body></html>", { status: 403, headers: { "content-type": "text/html" } }));
  const alerts = () => env.DB.prepare("SELECT kind, count FROM ops_alerts ORDER BY kind").all().then((r) => r.results);
  const quiet = () => ({ error: vi.spyOn(console, "error").mockImplementation(() => {}), warn: vi.spyOn(console, "warn").mockImplementation(() => {}) });
  const events = (spy: { mock: { calls: unknown[][] } }) => logged(spy).map((l) => l.event);

  describe("POST /v1/checkout", () => {
    it("khóa bị thu hồi (403): 502 như mọi lỗi cổng, đơn failed, cảnh báo creem_auth_failed (không phải payos_auth_failed)", async () => {
      const w = makeWorld();
      revokeKey(w);
      const { error } = quiet();
      expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
      const orderCode = await onlyOrderCode();
      expect(await orderRow(orderCode)).toMatchObject({ status: "failed" });
      expect(await alerts()).toEqual([{ kind: "creem_auth_failed", count: 1 }]);
      expect(logged(error)).toEqual([expect.objectContaining({ event: "checkout_failed", order_code: orderCode, provider: "creem" })]);
    });

    it("thiếu khóa (401): cũng là lỗi khóa", async () => {
      const w = makeWorld();
      missingKey(w);
      quiet();
      expect((await w.call("POST", "/v1/checkout", usd)).status).toBe(502);
      expect(await orderRow(await onlyOrderCode())).toMatchObject({ status: "failed" });
      expect(await alerts()).toEqual([{ kind: "creem_auth_failed", count: 1 }]);
    });

    it("mỗi lần tạo đơn gặp lỗi khóa tính một lần", async () => {
      const w = makeWorld();
      revokeKey(w);
      quiet();
      for (let i = 0; i < 3; i++) expect((await w.call("POST", "/v1/checkout", usd)).status).toBe(502);
      expect(await alerts()).toEqual([{ kind: "creem_auth_failed", count: 3 }]);
    });

    it("403 HTML của tường lửa (không phải thân của Creem): 502, đơn failed, KHÔNG có cảnh báo khóa", async () => {
      const w = makeWorld();
      firewall(w);
      quiet();
      expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
      expect(await orderRow(await onlyOrderCode())).toMatchObject({ status: "failed" });
      expect(await alerts()).toEqual([]);
    });

    it("Creem không trả lời (mạng, quá thời gian chờ): 502, không có cảnh báo khóa", async () => {
      const w = makeWorld();
      quiet();
      w.creem.down = true;
      expect((await w.call("POST", "/v1/checkout", usd)).status).toBe(502);
      w.creem.down = false;
      w.creem.createFailures = ["timeout", "network"];
      expect((await w.call("POST", "/v1/checkout", usd)).status).toBe(502);
      expect((await w.call("POST", "/v1/checkout", usd)).status).toBe(502);
      expect(await alerts()).toEqual([]);
    });

    it("Creem trả 500 hay 429 khi tạo phiên: 502, đơn failed, KHÔNG có cảnh báo khóa", async () => {
      const w = makeWorld();
      quiet();
      w.creem.createFailures = [500, 429, 503, 400, 404];
      for (let i = 1; i <= 5; i++) {
        expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
        const codes = await orderCodes();
        expect(codes).toHaveLength(i);
        expect(await orderRow(codes.at(-1)!)).toMatchObject({ status: "failed" });
      }
      expect(await alerts()).toEqual([]);
    });

    it("tạo cảnh báo lỗi D1: cảnh báo không bao giờ đổi phản hồi trả khách (vẫn 502 payment_provider_error), đơn failed, ghi log checkout_alert_failed", async () => {
      const w = makeWorld();
      revokeKey(w);
      const { error } = quiet();
      const res = await withFailingInsert("ops_alerts", "NEW.kind = 'creem_auth_failed'", () => w.call("POST", "/v1/checkout", usd));
      expect(res).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
      const orderCode = await onlyOrderCode();
      expect(await orderRow(orderCode)).toMatchObject({ status: "failed" });
      expect(await alerts()).toEqual([]);
      expect(logged(error).map((l) => [l.event, l.order_code, l.provider])).toEqual([
        ["checkout_failed", orderCode, "creem"],
        ["checkout_alert_failed", orderCode, "creem"],
      ]);
      expect(JSON.stringify(logged(error))).not.toContain("ck_da_thu_hoi");
    });
  });

  describe("đối soát", () => {
    it("403 ở đơn đang chờ: tính một lỗi, đơn giữ nguyên, có cảnh báo; lần sau khóa đúng thì cấp bình thường", async () => {
      const w = makeWorld();
      const { orderCode, checkoutId } = await checkout(w);
      w.creem.pay(checkoutId);
      const good = w.deps.payments.creem!;
      revokeKey(w);
      quiet();
      w.clock.now = T0 + 300;
      expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 0, errors: 1 });
      expect(await orderRow(orderCode)).toMatchObject({ status: "pending" });
      expect(await alerts()).toEqual([{ kind: "creem_auth_failed", count: 1 }]);
      w.deps.payments.creem = good;
      w.clock.now = T0 + 600;
      expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 1, errors: 0 });
    });

    it("401 (thiếu khóa) ở đơn đang chờ: cũng creem_auth_failed", async () => {
      const w = makeWorld();
      await checkout(w);
      w.creem.statusFailures = [401];
      quiet();
      w.clock.now = T0 + 300;
      expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, errors: 1 });
      expect(await alerts()).toEqual([{ kind: "creem_auth_failed", count: 1 }]);
    });

    it("403 HTML của tường lửa: một lỗi đối soát, đơn giữ nguyên, KHÔNG có cảnh báo khóa", async () => {
      const w = makeWorld();
      const { orderCode } = await checkout(w);
      firewall(w);
      quiet();
      w.clock.now = T0 + 300;
      expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, errors: 1 });
      expect(await orderRow(orderCode)).toMatchObject({ status: "pending" });
      expect(await alerts()).toEqual([]);
    });

    it.each([
      [500, null],
      [503, null],
      [429, null],
      [400, null],
      ["timeout", null],
      ["network", null],
      // Creem không thấy phiên: không đọc được trạng thái đơn, cảnh báo order_check_failed (A5d), không phải cảnh báo khóa.
      [404, "order_check_failed"],
    ] as const)("Creem trả lỗi %s khi hỏi phiên: một lỗi đối soát, KHÔNG có cảnh báo khóa (cảnh báo khác: %s)", async (failure, other) => {
      const w = makeWorld();
      await checkout(w);
      w.creem.statusFailures = [failure];
      quiet();
      w.clock.now = T0 + 300;
      expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, errors: 1 });
      expect(await alerts()).toEqual(other === null ? [] : [{ kind: other, count: 1 }]);
    });

    it("nhiều đơn cùng gặp lỗi khóa: mỗi đơn một lần (count bằng số đơn), không dừng sớm, đơn nào cũng được hỏi", async () => {
      const w = makeWorld();
      const codes: number[] = [];
      for (let i = 0; i < 4; i++) {
        w.clock.now = T0 + i;
        codes.push((await checkout(w)).orderCode);
      }
      revokeKey(w);
      const { warn } = quiet();
      w.clock.now = T0 + 300;
      expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 4, granted: 0, errors: 4 });
      expect(await alerts()).toEqual([{ kind: "creem_auth_failed", count: 4 }]);
      // Lỗi 4xx không phải cổng quá tải: không có "reconcile_stopped_early".
      expect(events(warn)).not.toContain("reconcile_stopped_early");
      for (const c of codes) expect(await env.DB.prepare("SELECT last_checked_at FROM orders WHERE order_code = ?").bind(c).first()).toEqual({ last_checked_at: T0 + 300 });
    });

    it("cảnh báo lỗi D1 (nhánh reconcile_alert_failed): ghi log, không dừng đối soát; đơn nào cũng được đánh dấu đã hỏi", async () => {
      const w = makeWorld();
      for (let i = 0; i < 2; i++) {
        w.clock.now = T0 + i;
        await checkout(w);
      }
      revokeKey(w);
      const { error } = quiet();
      w.clock.now = T0 + 300;
      const result = await withFailingInsert("ops_alerts", "NEW.kind = 'creem_auth_failed'", () => reconcile(w.env, w.deps));
      expect(result).toMatchObject({ checked: 2, granted: 0, errors: 2 });
      expect(await alerts()).toEqual([]);
      expect(events(error)).toEqual(["reconcile_failed", "reconcile_alert_failed", "reconcile_failed", "reconcile_alert_failed"]);
      expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE last_checked_at = ?").bind(T0 + 300).first()).toEqual({ n: 2 });
    });

    it("hai cổng cùng bị từ chối khóa: mỗi cổng có loại cảnh báo riêng (đơn VND cảnh báo PayOS, đơn USD cảnh báo Creem)", async () => {
      const w = makeWorld();
      const vnd = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "buyer@example.com", consent: true });
      expect(vnd.status).toBe(201);
      w.clock.now = T0 + 1;
      await checkout(w);
      revokeKey(w);
      w.payos.statusFailures = [401];
      quiet();
      w.clock.now = T0 + 300;
      expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 2, errors: 2 });
      expect(await alerts()).toEqual([
        { kind: "creem_auth_failed", count: 1 },
        { kind: "payos_auth_failed", count: 1 },
      ]);
    });
  });
});
