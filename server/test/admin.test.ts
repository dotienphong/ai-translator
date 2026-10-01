import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createAdminApp } from "../src/admin";
import { AdminRpc } from "../src/admin-rpc";
import { sha256Hex } from "../src/crypto";
import { signKeyCheck } from "../src/deps";
import type { AdminEnv, ApiEnv } from "../src/env";
import { PayOSProvider } from "../src/payment/payos";
import type { KeyCheck } from "../src/token";
import { verifyToken } from "../src/token";
import { resetDb, withFailingInsert } from "./db";
import { TEST_CHECKSUM_KEY } from "./fakes";
import { testSigningJwk } from "./keys";
import vectors from "./vectors/token-v1.json";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

const ADMIN = "https://admin.test";
const API_ORIGIN = "https://mt-license-staging.example.workers.dev";

interface AdminCall {
  method?: string;
  body?: unknown;
  /** null: request không đi qua Access (không có ctx.access). */
  operator?: string | null;
  aud?: string;
  headers?: Record<string, string>;
  rawBody?: string;
}

/** Môi trường của Worker API với hai khóa test của vector: ô A (test-1) đang ký, ô B (test-2) dự phòng. */
async function apiKeyEnv(): Promise<ApiEnv> {
  return { ...env, TOKEN_SIGNING_KEY_A: await testSigningJwk("test-1"), TOKEN_SIGNING_KEY_B: await testSigningJwk("test-2") };
}

interface AdminOpts {
  /** Thay cho service binding API.plans() (mặc định: biến PLANS của Worker API trong test). */
  plans?: () => Promise<unknown>;
  keyCheck?: () => Promise<KeyCheck>;
}

function makeAdmin(adminEnv: Partial<AdminEnv> = {}, opts: AdminOpts = {}) {
  const w = makeWorld();
  const payos = new PayOSProvider(
    { baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: TEST_CHECKSUM_KEY },
    w.payos.fetch,
  );
  const admin = createAdminApp(() => ({
    now: () => w.clock.now,
    payments: { payos },
    payos,
    email: w.deps.email,
    plans: opts.plans ?? (async () => env.PLANS),
    keyCheck: opts.keyCheck ?? (async () => signKeyCheck(await apiKeyEnv(), w.clock.now)),
  }));
  const fullEnv = { ...env, API_ORIGIN, ...adminEnv } as AdminEnv;
  async function adminCall(path: string, opts: AdminCall = {}) {
    const { method = opts.body === undefined && opts.rawBody === undefined ? "GET" : "POST", operator = "ops@example.com", aud = "aud-1" } = opts;
    const ctx = createExecutionContext();
    if (operator !== null) {
      Object.defineProperty(ctx, "access", { value: { aud, getIdentity: async () => ({ email: operator }) } });
    }
    const headers: Record<string, string> = method === "GET" ? {} : { "content-type": "application/json" };
    const init: RequestInit = { method, headers: { ...headers, ...opts.headers } };
    if (opts.rawBody !== undefined) init.body = opts.rawBody;
    else if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    const res = await admin.fetch(new Request(`${ADMIN}${path}`, init), fullEnv, ctx);
    await waitOnExecutionContext(ctx);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }
  return { w, adminCall };
}

const licenseRow = () => env.DB.prepare("SELECT * FROM licenses").first<Record<string, unknown>>();
const auditCount = async (action: string) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = ?").bind(action).first<{ n: number }>())?.n;
const lastAudit = () => env.DB.prepare("SELECT actor, action, order_code, detail FROM audit_log ORDER BY id DESC LIMIT 1").first();

describe("Access", () => {
  it("không qua Access thì mọi route 403", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/whoami", { operator: null })).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect((await adminCall("/admin/erase", { body: {}, operator: null })).status).toBe(403);
    expect((await adminCall("/khong-co", { operator: null })).status).toBe(403);
  });

  it("qua Access: whoami trả email người vận hành", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/whoami")).toEqual({ status: 200, body: { operator: "ops@example.com" } });
  });

  it("ACCESS_AUD đã đặt thì aud phải khớp", async () => {
    const { adminCall } = makeAdmin({ ACCESS_AUD: "aud-1" });
    expect((await adminCall("/admin/whoami")).status).toBe(200);
    expect((await adminCall("/admin/whoami", { aud: "aud-khac" })).status).toBe(403);
  });

  it("ngoài dev, ACCESS_AUD trống thì mọi request bị 403 (fail closed)", async () => {
    const { adminCall } = makeAdmin({ ENVIRONMENT: "staging", ACCESS_AUD: "" });
    expect(await adminCall("/admin/whoami")).toMatchObject({ status: 403, body: { error: "forbidden" } });
    const ok = makeAdmin({ ENVIRONMENT: "staging", ACCESS_AUD: "aud-1" });
    expect((await ok.adminCall("/admin/whoami")).status).toBe(200);
  });
});

describe("chống CSRF", () => {
  async function revokeWith(opts: AdminCall) {
    await resetDb();
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const id = (await licenseRow())!.id as string;
    const res = await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "thử" }, ...opts });
    return { res, revoked: (await licenseRow())!.revoked_at };
  }

  it("POST không phải application/json thì 415, không đổi gì", async () => {
    const { res, revoked } = await revokeWith({ headers: { "content-type": "text/plain" }, rawBody: '{"note":"x"}' });
    expect(res).toMatchObject({ status: 415, body: { error: "unsupported_media_type" } });
    expect(revoked).toBeNull();
  });

  it("Origin khác origin của Worker admin thì 403", async () => {
    const { res, revoked } = await revokeWith({ headers: { origin: "https://evil.example" } });
    expect(res).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect(revoked).toBeNull();
  });

  it("Sec-Fetch-Site cross-site hay same-site thì 403", async () => {
    for (const site of ["cross-site", "same-site"]) {
      const { res, revoked } = await revokeWith({ headers: { "sec-fetch-site": site } });
      expect(res.status).toBe(403);
      expect(revoked).toBeNull();
    }
  });

  it("cùng origin, Sec-Fetch-Site same-origin hoặc none, hoặc không có hai header (cloudflared) thì được", async () => {
    for (const headers of [{ origin: ADMIN, "sec-fetch-site": "same-origin" }, { "sec-fetch-site": "none" }, {}]) {
      const { res, revoked } = await revokeWith({ headers });
      expect(res.status).toBe(200);
      expect(revoked).toBe(T0);
    }
  });

  it("body quá 16 KiB thì 413", async () => {
    const { adminCall } = makeAdmin();
    const res = await adminCall("/admin/lookup", { body: { email: "a@example.com", pad: "x".repeat(20_000) } });
    expect(res.status).toBe(413);
  });
});

describe("tra cứu, gửi lại key", () => {
  it("tra theo email và theo orderCode bằng POST; không trả order_token_hash; ghi nhật ký không có email", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode, licenseKey } = await w.buy({ email: "buyer@example.com" });
    const byEmail = await adminCall("/admin/lookup", { body: { email: "buyer@example.com" } });
    expect(byEmail.status).toBe(200);
    const lic = (byEmail.body.licenses as Record<string, unknown>[])[0]!;
    expect(lic).toMatchObject({ license_key: licenseKey, email: "buyer@example.com", activations: [] });
    expect((lic.audit as { action: string }[]).map((a) => a.action)).toEqual(["license_issued"]);
    const orders = byEmail.body.orders as Record<string, unknown>[];
    expect(orders[0]).toMatchObject({ order_code: orderCode, status: "paid" });
    expect(orders[0]).not.toHaveProperty("order_token_hash");
    const log = await lastAudit();
    expect(log).toMatchObject({ actor: "admin:ops@example.com", action: "lookup", order_code: null });
    expect(JSON.parse((log as { detail: string }).detail)).toEqual({ by: "email", licenses: 1, orders: 1 });
    const byOrder = await adminCall("/admin/lookup", { body: { order_code: orderCode } });
    expect((byOrder.body.licenses as unknown[]).length).toBe(1);
    expect(await lastAudit()).toMatchObject({ action: "lookup", order_code: orderCode });
    expect((await adminCall("/admin/lookup", { body: {} })).status).toBe(400);
  });

  it("gửi lại key vào email của license và ghi nhật ký", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    w.resend.sent.length = 0;
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/resend`, { body: {} })).body).toEqual({ ok: true });
    expect(w.resend.sent[0]!.text).toContain(licenseKey);
    expect(await lastAudit()).toMatchObject({ actor: "admin:ops@example.com", action: "key_resent" });
  });

  it("xem trạng thái đơn trực tiếp từ cổng thanh toán của đơn, có ghi nhật ký", async () => {
    const { w, adminCall } = makeAdmin();
    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "b@example.com", consent: true });
    const res = await adminCall(`/admin/orders/${co.body.order_code as number}/payment-status`);
    expect(res.body).toEqual({ orderCode: 1, status: "pending", amount: 50000, amountPaid: 0, paidAt: null });
    expect(await lastAudit()).toMatchObject({ action: "payment_status_viewed", order_code: 1 });
    expect((await adminCall("/admin/orders/999/payment-status")).status).toBe(404);
  });

  it("xem trạng thái đơn có tác dụng phụ (nhật ký, gọi PayOS): Sec-Fetch-Site khác cùng origin thì 403", async () => {
    const { w, adminCall } = makeAdmin();
    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "b@example.com", consent: true });
    const path = `/admin/orders/${co.body.order_code as number}/payment-status`;
    const asked = () => w.payos.requests.filter((r) => r.method === "GET").length;
    for (const site of ["cross-site", "same-site"]) {
      expect(await adminCall(path, { headers: { "sec-fetch-site": site } })).toMatchObject({ status: 403, body: { error: "forbidden" } });
    }
    expect(asked()).toBe(0);
    expect(await auditCount("payment_status_viewed")).toBe(0);
    for (const headers of [{ "sec-fetch-site": "same-origin" }, { "sec-fetch-site": "none" }, {}]) {
      expect((await adminCall(path, { headers })).status).toBe(200);
    }
    expect(asked()).toBe(3);
  });
});

describe("thay đổi license", () => {
  it("thu hồi lần hai: 404, không đổi revoked_at, không ghi thêm nhật ký", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "hoàn tiền" } })).status).toBe(200);
    w.clock.now = T0 + DAY;
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "lần hai" } })).status).toBe(404);
    expect((await licenseRow())!.revoked_at).toBe(T0);
    expect(await auditCount("license_revoked")).toBe(1);
  });

  it("revoke, unlock, extend với license không tồn tại: 404, không ghi nhật ký", async () => {
    const { adminCall } = makeAdmin();
    const id = crypto.randomUUID();
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "x" } })).status).toBe(404);
    expect((await adminCall(`/admin/licenses/${id}/unlock`, { body: { note: "x" } })).status).toBe(404);
    expect((await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 7, note: "x" } })).status).toBe(404);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first()).toEqual({ n: 0 });
  });

  it("admin gỡ cùng một máy hai lần cùng lúc: một dòng deactivations, một dòng nhật ký", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const a = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "M1" });
    const path = `/admin/activations/${a.body.activation_id as string}/deactivate`;
    await Promise.all([adminCall(path, { body: { note: "a" } }), adminCall(path, { body: { note: "b" } })]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations").first()).toEqual({ n: 1 });
    expect(await auditCount("deactivated_by_admin")).toBe(1);
  });

  it("mọi thao tác thay đổi đều cần note", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: {} })).status).toBe(400);
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "  " } })).status).toBe(400);
  });

  it("chuyển thiếu rồi chuyển bù: cấp tay cho đơn, gửi email, đơn thành paid", async () => {
    const { w, adminCall } = makeAdmin();
    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "b@example.com", consent: true });
    const orderCode = co.body.order_code as number;
    w.payos.pay(orderCode, 1500);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 1500));
    const res = await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "khách chuyển bù 48.500đ, mã GD FT2" } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ plan: "pro", expires_at: T0 + 30 * DAY, grant_kind: "new" });
    const order = await env.DB.prepare("SELECT status, amount_paid FROM orders").first();
    expect(order).toEqual({ status: "paid", amount_paid: 1500 });
    expect(w.resend.sent).toHaveLength(1);
    expect(await lastAudit()).toMatchObject({ action: "order_granted_manually" });
    expect(await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "lần hai" } })).toEqual({
      status: 409,
      body: { error: "already_paid", status: "paid" },
    });
  });

  it("cấp tay đơn gia hạn đổi gói: cùng luật với webhook, tính từ lúc thao tác", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy(); // Professional, hết hạn T0 + 30 ngày
    w.clock.now = T0 + 10 * DAY;
    const co = await w.call("POST", "/v1/checkout", { plan: "pro_x2", email: "b@example.com", consent: true, license_key: licenseKey });
    const orderCode = co.body.order_code as number;
    w.payos.pay(orderCode, 100000);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 100000));
    w.clock.now = T0 + 12 * DAY; // hai ngày sau khách mới chuyển bù, người vận hành cấp tay
    const res = await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "khách chuyển bù 50.000đ, mã GD FT2" } });
    // Lúc thao tác còn 18 ngày Professional: floor(18 × 50.000 / 150.000) = 6.
    expect(res.body).toMatchObject({ plan: "pro_x2", grant_kind: "change", converted_days: 6, expires_at: T0 + 48 * DAY });
    expect(await licenseRow()).toMatchObject({ plan: "pro_x2", cycle_anchor: T0 + 12 * DAY, anchor_applied_at: T0 + 12 * DAY });
    const granted = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'license_plan_changed'").first<{ detail: string }>();
    expect(JSON.parse(granted!.detail)).toMatchObject({ paid_at: T0 + 12 * DAY, converted_days: 6 });
  });

  it("cấp tay khi không lấy được bảng gói từ Worker API thì 503, không đổi gì", async () => {
    const { w, adminCall } = makeAdmin({}, { plans: async () => null });
    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "b@example.com", consent: true });
    const orderCode = co.body.order_code as number;
    const res = await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "x" } });
    expect(res).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
    expect(await env.DB.prepare("SELECT status FROM orders").first()).toEqual({ status: "pending" });
    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "pro", note: "tặng" } });
    expect(created.status).toBe(503);
  });

  it("cấp license mới theo mã gói, rồi gia hạn tay", async () => {
    const { w, adminCall } = makeAdmin();
    for (const plan of ["pro_1m", "free", "pro_12m"]) {
      expect((await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan, note: "tặng" } })).status).toBe(400);
    }
    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "pro_x5", note: "tặng" } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ plan: "pro_x5", expires_at: T0 + 30 * DAY });
    expect(await licenseRow()).toMatchObject({ plan: "pro_x5", cycle_anchor: T0, anchor_applied_at: T0 });
    expect(w.resend.sent[0]!.to).toEqual(["gift@example.com"]);
    expect(w.resend.sent[0]!.text).toContain("Professional X5, hết hạn");
    const id = created.body.license_id as string;
    w.clock.now = T0 + DAY;
    const ext = await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 7, note: "bù sự cố" } });
    // Còn hạn: cộng vào hạn cũ, giữ cycle_anchor.
    expect(ext.body).toEqual({ license_id: id, expires_at: T0 + 37 * DAY, cycle_anchor: T0 });
    expect((await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 0, note: "x" } })).status).toBe(400);
  });

  it("gia hạn tay license đã hết hạn: cộng từ bây giờ và đặt lại cycle_anchor", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const id = (await licenseRow())!.id as string;
    w.clock.now = T0 + 40 * DAY;
    const ext = await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 30, note: "bù" } });
    expect(ext.body).toEqual({ license_id: id, expires_at: T0 + 70 * DAY, cycle_anchor: T0 + 40 * DAY });
    expect(await licenseRow()).toMatchObject({ anchor_applied_at: T0 + 40 * DAY, version: 1 });
  });

  it("mở khóa key bị khóa tạm: lần gỡ trước đó không còn tính", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const activate = async (n: number) =>
      w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex(`d${n}`), device_label: `M${n}` }, { "cf-connecting-ip": `198.51.100.${n}` });
    for (let i = 1; i <= 4; i++) {
      const r = await activate(i);
      await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: r.body.activation_id });
    }
    expect((await activate(5)).status).toBe(423);
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/unlock`, { body: { note: "khách đổi máy nhiều, đã xác minh" } })).status).toBe(200);
    w.clock.now = T0 + 1;
    expect((await activate(5)).status).toBe(200);
  });

  it("admin gỡ 4 máy liền rồi kích hoạt máy khác vẫn được: lần admin gỡ không tính vào luật khóa tạm", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const activate = async (n: number) =>
      w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex(`d${n}`), device_label: `M${n}` }, { "cf-connecting-ip": `198.51.100.${n}` });
    for (let i = 1; i <= 4; i++) {
      const r = await activate(i);
      expect((await adminCall(`/admin/activations/${r.body.activation_id as string}/deactivate`, { body: { note: "hỗ trợ" } })).status).toBe(200);
    }
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations WHERE by = 'admin'").first())).toEqual({ n: 4 });
    expect((await activate(5)).status).toBe(200);
  });

  it("gỡ activation: chỉ đánh dấu, không xóa dòng, không tính vào ngưỡng khóa; rồi thu hồi key", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const a = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "M1" });
    w.clock.now = T0 + 60;
    const off = await adminCall(`/admin/activations/${a.body.activation_id as string}/deactivate`, { body: { note: "khách mất máy" } });
    expect(off.status).toBe(200);
    const row = await env.DB.prepare("SELECT id, device_label, deactivated_at, deactivated_by FROM activations").all();
    expect(row.results).toEqual([{ id: a.body.activation_id, device_label: "M1", deactivated_at: T0 + 60, deactivated_by: "admin" }]);
    expect((await env.DB.prepare("SELECT by FROM deactivations").all()).results).toEqual([{ by: "admin" }]);
    // Gỡ lần nữa thì 404, không ghi thêm.
    expect((await adminCall(`/admin/activations/${a.body.activation_id as string}/deactivate`, { body: { note: "x" } })).status).toBe(404);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations").first()).toEqual({ n: 1 });
    // Máy đó kích hoạt lại thì dùng lại đúng dòng cũ.
    const again = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "M1" });
    expect(again.body.activation_id).toBe(a.body.activation_id);
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "hoàn tiền" } })).status).toBe(200);
    const v = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d2"), device_label: "M2" });
    expect(v.body.error).toBe("license_revoked");
  });
});

describe("Q9: xóa dữ liệu cá nhân theo email", () => {
  it("bỏ email và device_label, giữ số liệu kế toán, key vẫn dùng được", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ email: "erase@example.com" });
    await w.buy({ email: "keep@example.com" });
    await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "MacBook của An" });
    const res = await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa qua email hỗ trợ ngày 2026-10-01" } });
    expect(res.body).toEqual({ activations: 1, licenses: 1, orders: 1 });
    const orders = await env.DB.prepare("SELECT email, amount, plan, status FROM orders ORDER BY order_code").all();
    expect(orders.results).toEqual([
      { email: null, amount: 50000, plan: "pro", status: "paid" },
      { email: "keep@example.com", amount: 50000, plan: "pro", status: "paid" },
    ]);
    const act = await env.DB.prepare("SELECT device_label FROM activations").first();
    expect(act).toEqual({ device_label: null });
    const log = await lastAudit();
    expect(log).toMatchObject({ action: "personal_data_erased" });
    expect(String((log as { detail: string }).detail)).not.toContain("erase@example.com");
    expect(JSON.parse((log as { detail: string }).detail)).toEqual({
      activations: 1,
      licenses: 1,
      orders: 1,
      note: "yêu cầu xóa qua email hỗ trợ ngày 2026-10-01",
    });
    const again = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "M" });
    expect(again.status).toBe(200);
  });

  it("nhật ký cùng batch với lệnh xóa: ghi nhật ký lỗi thì không xóa gì", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy({ email: "erase@example.com" });
    const res = await withFailingInsert("audit_log", "NEW.action = 'personal_data_erased'", () =>
      adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa" } }),
    );
    expect(res.status).toBe(500);
    expect(await env.DB.prepare("SELECT email FROM licenses").first()).toEqual({ email: "erase@example.com" });
    expect(await env.DB.prepare("SELECT email FROM orders").first()).toEqual({ email: "erase@example.com" });
  });
});

describe("đơn paid_needs_review: license đã thu hồi mà nhận được tiền (QĐ37)", () => {
  async function needsReview() {
    const ctx = makeAdmin();
    const { w } = ctx;
    const { licenseKey } = await w.buy({ email: "b@example.com" });
    const co = await w.call("POST", "/v1/checkout", { plan: "pro_x2", email: "b@example.com", consent: true, license_key: licenseKey });
    const orderCode = co.body.order_code as number;
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0).run();
    w.payos.pay(orderCode);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    w.resend.sent.length = 0;
    return { ...ctx, orderCode, token: co.body.order_token as string };
  }
  const orderStatus = (n: number) => env.DB.prepare("SELECT status FROM orders WHERE order_code = ?").bind(n).first();

  it("cấp tay thường không áp được đơn này (409), không đổi gì", async () => {
    const { adminCall, orderCode } = await needsReview();
    expect(await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "x" } })).toEqual({
      status: 409,
      body: { error: "needs_review", status: "paid_needs_review" },
    });
    expect(await orderStatus(orderCode)).toEqual({ status: "paid_needs_review" });
  });

  it("cấp tay một đơn gia hạn mà license đã thu hồi: đơn chuyển sang paid_needs_review, trả 409", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "b@example.com", consent: true, license_key: licenseKey });
    const orderCode = co.body.order_code as number;
    w.payos.pay(orderCode, 1000);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 1000));
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0).run();
    // Cùng nhãn với lần cấp tay sau đó và với kết quả của webhook (FulfilResult): needs_review.
    expect(await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "chuyển bù" } })).toEqual({
      status: 409,
      body: { error: "needs_review", status: "paid_needs_review" },
    });
    expect(await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "chuyển bù" } })).toEqual({
      status: 409,
      body: { error: "needs_review", status: "paid_needs_review" },
    });
    expect(await orderStatus(orderCode)).toEqual({ status: "paid_needs_review" });
  });

  it("xử lý bằng cách cấp license mới: key mới, gói của đơn, gửi thư; license đã thu hồi giữ nguyên", async () => {
    const { w, adminCall, orderCode, token } = await needsReview();
    w.clock.now = T0 + DAY;
    expect((await adminCall(`/admin/orders/${orderCode}/resolve`, { body: { action: "grant_new_license" } })).status).toBe(400);
    expect((await adminCall(`/admin/orders/${orderCode}/resolve`, { body: { action: "x", note: "y" } })).status).toBe(400);
    const res = await adminCall(`/admin/orders/${orderCode}/resolve`, { body: { action: "grant_new_license", note: "khách đã xác minh" } });
    expect(res).toMatchObject({ status: 200, body: { order_code: orderCode, status: "paid", plan: "pro_x2", expires_at: T0 + 31 * DAY } });
    const lics = await env.DB.prepare("SELECT plan, revoked_at FROM licenses ORDER BY created_at").all();
    expect(lics.results).toEqual([
      { plan: "pro", revoked_at: T0 },
      { plan: "pro_x2", revoked_at: null },
    ]);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]!.text).toContain(res.body.license_key as string);
    expect((await w.getOrder(orderCode, token)).body).toMatchObject({ status: "paid", grant_kind: "new", license_key: res.body.license_key });
    expect(await lastAudit()).toMatchObject({ action: "order_review_granted", order_code: orderCode });
    // paid_at vẫn là lúc server xác nhận khách trả tiền, không phải lúc người vận hành xử lý.
    expect(await env.DB.prepare("SELECT paid_at FROM orders WHERE order_code = ?").bind(orderCode).first()).toEqual({ paid_at: T0 });
    // Làm lại lần hai thì 409.
    expect((await adminCall(`/admin/orders/${orderCode}/resolve`, { body: { action: "refunded", note: "x" } })).status).toBe(409);
  });

  it("xử lý bằng cách ghi đã hoàn tiền ngoài hệ thống: đơn thành refunded, không cấp gì, không gửi thư", async () => {
    const { w, adminCall, orderCode, token } = await needsReview();
    const res = await adminCall(`/admin/orders/${orderCode}/resolve`, { body: { action: "refunded", note: "đã hoàn 150.000đ qua ngân hàng, mã GD FT9" } });
    expect(res).toEqual({ status: 200, body: { order_code: orderCode, status: "refunded" } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses").first()).toEqual({ n: 1 });
    expect(w.resend.sent).toHaveLength(0);
    expect((await w.getOrder(orderCode, token)).body).toMatchObject({ status: "refunded" });
    expect(await lastAudit()).toMatchObject({ action: "order_refunded_outside", order_code: orderCode });
    // Đơn đã hoàn tiền thì webhook gửi lại cũng không áp, và không bị gọi là "đã trả".
    expect((await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode))).body).toEqual({ ok: true, result: "already_settled" });
    expect(await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "x" } })).toEqual({
      status: 409,
      body: { error: "already_settled", status: "refunded" },
    });
    expect((await adminCall(`/admin/orders/${orderCode}/resolve`, { body: { action: "grant_new_license", note: "x" } })).status).toBe(409);
  });

  it("hai lần ghi hoàn tiền chạy cùng lúc: một lần 200, một lần 409, một dòng nhật ký", async () => {
    const { adminCall, orderCode } = await needsReview();
    const body = { action: "refunded", note: "đã hoàn 150.000đ" };
    const results = await Promise.all([1, 2, 3].map(() => adminCall(`/admin/orders/${orderCode}/resolve`, { body })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await auditCount("order_refunded_outside")).toBe(1);
  });

  it("đơn không ở trạng thái chờ xử lý thì resolve trả 409", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode } = await w.buy();
    expect(await adminCall(`/admin/orders/${orderCode}/resolve`, { body: { action: "refunded", note: "x" } })).toMatchObject({
      status: 409,
      body: { error: "not_needs_review", status: "paid" },
    });
    expect((await adminCall("/admin/orders/999/resolve", { body: { action: "refunded", note: "x" } })).status).toBe(404);
  });
});

describe("reset hạn mức của máy (QĐ35)", () => {
  it("tăng quota_epoch, ghi nhật ký; token đầu tiên sau đó (dù 2 giờ sau) mang epoch mới và quota_fresh", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const a = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "M1" });
    const id = a.body.activation_id as string;
    w.clock.now = T0 + 3 * DAY;
    expect((await adminCall(`/admin/activations/${id}/reset-quota`, { body: {} })).status).toBe(400);
    const res = await adminCall(`/admin/activations/${id}/reset-quota`, { body: { note: "khách mất bộ đếm sau khi cài lại máy" } });
    expect(res.body).toEqual({ activation_id: id, quota_epoch: 1 });
    expect(await lastAudit()).toMatchObject({ actor: "admin:ops@example.com", action: "quota_reset" });
    const validate = () => w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: id });
    w.clock.now = T0 + 3 * DAY + 2 * 3600;
    expect((await validate()).body).toMatchObject({ quota_epoch: 1, quota_fresh: true });
    w.clock.now = T0 + 3 * DAY + 2 * 3600 + 16 * 60;
    expect((await validate()).body).toMatchObject({ quota_epoch: 1, quota_fresh: false });
    expect((await adminCall(`/admin/activations/${crypto.randomUUID()}/reset-quota`, { body: { note: "x" } })).status).toBe(404);
  });

  it("nhật ký cùng batch với lệnh reset: ghi nhật ký lỗi thì quota_epoch giữ nguyên", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const a = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "M1" });
    const id = a.body.activation_id as string;
    const res = await withFailingInsert("audit_log", "NEW.action = 'quota_reset'", () =>
      adminCall(`/admin/activations/${id}/reset-quota`, { body: { note: "x" } }),
    );
    expect(res.status).toBe(500);
    expect(await env.DB.prepare("SELECT quota_epoch, epoch_pending FROM activations").first()).toEqual({ quota_epoch: 0, epoch_pending: 0 });
    // Nhật ký ghi đủ license_id, activation_id, quota_epoch mới và note.
    expect((await adminCall(`/admin/activations/${id}/reset-quota`, { body: { note: "khách mất bộ đếm" } })).body).toEqual({ activation_id: id, quota_epoch: 1 });
    const log = await env.DB.prepare("SELECT license_id, detail FROM audit_log WHERE action = 'quota_reset'").first<{ license_id: string; detail: string }>();
    expect(log!.license_id).toBe((await licenseRow())!.id);
    expect(JSON.parse(log!.detail)).toEqual({ activation_id: id, quota_epoch: 1, note: "khách mất bộ đếm" });
  });

  it("chống CSRF như mọi thao tác thay đổi", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const a = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "M1" });
    const path = `/admin/activations/${a.body.activation_id as string}/reset-quota`;
    expect((await adminCall(path, { body: { note: "x" }, headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await adminCall(path, { rawBody: '{"note":"x"}', headers: { "content-type": "text/plain" } })).status).toBe(415);
    expect(await env.DB.prepare("SELECT quota_epoch FROM activations").first()).toEqual({ quota_epoch: 0 });
  });
});

describe("ký thử bằng khóa dự phòng (QĐ31)", () => {
  it("trả token ký bằng khóa dự phòng, kiểm được bằng khóa công khai; ghi nhật ký", async () => {
    const { adminCall } = makeAdmin();
    const res = await adminCall("/admin/keys/test-sign", { body: {} });
    expect(res.body).toMatchObject({ slot: "b", kid: "test-2" });
    const verified = await verifyToken(res.body.token as string, vectors.public_keys, { now: T0 - 1, deviceIdHash: "0".repeat(64) });
    expect(verified).toMatchObject({ ok: true, claims: { kid: "test-2", expires_at: T0 } });
    expect(await lastAudit()).toMatchObject({ action: "key_check_signed" });
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({ slot: "b", kid: "test-2" });
    // GET không được (thao tác có ghi nhật ký), CSRF như các route khác.
    expect((await adminCall("/admin/keys/test-sign")).status).toBe(404);
    expect((await adminCall("/admin/keys/test-sign", { body: {}, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
  });

  it("Worker API ký không được (thiếu khóa dự phòng, trùng kid) thì 503 key_check_failed", async () => {
    const { adminCall } = makeAdmin({}, { keyCheck: async () => Promise.reject(new Error("hai ô khóa có cùng kid test-1")) });
    expect(await adminCall("/admin/keys/test-sign", { body: {} })).toMatchObject({
      status: 503,
      body: { error: "key_check_failed", message: "Error: hai ô khóa có cùng kid test-1" },
    });
  });

  it("entrypoint AdminRpc của Worker API: trả biến PLANS và ký thử bằng ô dự phòng", async () => {
    const rpc = new AdminRpc(createExecutionContext(), await apiKeyEnv());
    expect(await rpc.plans()).toEqual(env.PLANS);
    const check = await rpc.signKeyCheck();
    expect(check).toMatchObject({ slot: "b", kid: "test-2" });
    const swapped = new AdminRpc(createExecutionContext(), { ...(await apiKeyEnv()), TOKEN_SIGNING_SLOT: "b" });
    expect(await swapped.signKeyCheck()).toMatchObject({ slot: "a", kid: "test-1" });
  });
});

describe("đăng ký webhook với PayOS", () => {
  it("chỉ nhận URL webhook trên đúng API_ORIGIN", async () => {
    const { w, adminCall } = makeAdmin();
    const url = `${API_ORIGIN}/v1/webhooks/payos`;
    expect((await adminCall("/admin/payos/confirm-webhook", { body: { webhook_url: url } })).body).toEqual({ ok: true, webhook_url: url });
    expect(w.payos.confirmedWebhook).toBe(url);
    for (const bad of [
      "https://evil.example/v1/webhooks/payos",
      `${API_ORIGIN}/v1/webhooks/payos?x=1`,
      "https://user:pass@mt-license-staging.example.workers.dev/v1/webhooks/payos",
      "https://user@mt-license-staging.example.workers.dev/v1/webhooks/payos",
      `${API_ORIGIN}/khac`,
      "http://mt-license-staging.example.workers.dev/v1/webhooks/payos",
      "không phải url",
    ]) {
      expect(await adminCall("/admin/payos/confirm-webhook", { body: { webhook_url: bad } })).toMatchObject({
        status: 400,
        body: { field: "webhook_url" },
      });
    }
    expect(w.payos.confirmedWebhook).toBe(url);
  });

  it("API_ORIGIN trống thì không đăng ký được URL nào", async () => {
    const { adminCall } = makeAdmin({ API_ORIGIN: "" });
    const res = await adminCall("/admin/payos/confirm-webhook", { body: { webhook_url: `${API_ORIGIN}/v1/webhooks/payos` } });
    expect(res.status).toBe(400);
  });
});
