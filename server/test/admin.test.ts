import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRpc } from "../src/admin-rpc";
import { sha256Hex } from "../src/crypto";
import { signKeyCheck } from "../src/deps";
import { formatLicenseKey, generateLicenseKey } from "../src/license-key";
import { verifyToken } from "../src/token";
import { AUD, corruptSignature, type Issuer, makeIssuer, TEAM } from "./access-jwt-helper";
import { ADMIN, type AdminCall, API_ORIGIN, apiKeyEnv, auditCount, lastAudit, licenseRow, makeAdmin } from "./admin-harness";
import { resetDb, withFailingInsert } from "./db";
import vectors from "./vectors/token-v1.json";
import { DAY, T0 } from "./world";

beforeEach(resetDb);

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

  it("ở production, ACCESS_AUD trống thì mọi request bị 403 (fail closed)", async () => {
    const { adminCall } = makeAdmin({ ENVIRONMENT: "production", ACCESS_AUD: "" });
    expect(await adminCall("/admin/whoami")).toMatchObject({ status: 403, body: { error: "forbidden" } });
    const ok = makeAdmin({ ENVIRONMENT: "production", ACCESS_AUD: "aud-1", ADMIN_EMAILS: "ops@example.com" });
    expect((await ok.adminCall("/admin/whoami")).status).toBe(200);
  });

  it("ở production, ADMIN_EMAILS trống thì mọi request bị 403 (fail closed), dù đã qua Access", async () => {
    for (const ADMIN_EMAILS of [undefined, "", " , "]) {
      const { adminCall } = makeAdmin({ ENVIRONMENT: "production", ACCESS_AUD: "aud-1", ...(ADMIN_EMAILS === undefined ? {} : { ADMIN_EMAILS }) });
      expect(await adminCall("/admin/whoami"), String(ADMIN_EMAILS)).toMatchObject({ status: 403, body: { error: "forbidden" } });
    }
  });

  it("ADMIN_EMAILS: chỉ email trong danh sách vào được (không phân biệt hoa thường, bỏ khoảng trắng); email khác bị 403", async () => {
    const { adminCall } = makeAdmin({ ENVIRONMENT: "production", ACCESS_AUD: "aud-1", ADMIN_EMAILS: " Ops@Example.com , boss@example.com" });
    expect((await adminCall("/admin/whoami")).status).toBe(200);
    expect((await adminCall("/admin/whoami", { operator: "BOSS@example.com" })).status).toBe(200);
    for (const operator of ["ke-la@example.com", "ops@example.com.evil.test", "x-ops@example.com", "ops@example.co"]) {
      expect(await adminCall("/admin/whoami", { operator }), operator).toMatchObject({ status: 403, body: { error: "forbidden" } });
    }
    // Thao tác ghi cũng bị chặn, không đổi gì.
    const write = await adminCall("/admin/lookup", { operator: "ke-la@example.com", body: { email: "a@example.com" } });
    expect(write.status).toBe(403);
  });
});

describe("log lý do từ chối (chẩn đoán Access, không lộ ra phản hồi)", () => {
  afterEach(() => vi.restoreAllMocks());

  /** Gọi rồi trả các dòng `admin_denied` đã ghi (đã parse). */
  async function denied(adminEnv: Parameters<typeof makeAdmin>[0], call: AdminCall = {}) {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { adminCall } = makeAdmin(adminEnv);
    const res = await adminCall("/admin/whoami", call);
    const lines = warn.mock.calls.map(([line]) => JSON.parse(String(line))).filter((l) => l.event === "admin_denied");
    warn.mockRestore();
    return { res, lines };
  }

  it("request không qua Access: no_access", async () => {
    const { res, lines } = await denied({}, { operator: null });
    expect(res).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect(lines).toEqual([{ event: "admin_denied", reason: "no_access" }]);
  });

  it("production chưa đặt ACCESS_AUD: aud_unset", async () => {
    const { lines } = await denied({ ENVIRONMENT: "production", ACCESS_AUD: "" });
    expect(lines).toEqual([{ event: "admin_denied", reason: "aud_unset" }]);
  });

  it("production chưa đặt ADMIN_EMAILS: admins_unset; email không trong danh sách: not_admin, không ghi email", async () => {
    expect((await denied({ ENVIRONMENT: "production", ACCESS_AUD: "aud-1" })).lines).toEqual([{ event: "admin_denied", reason: "admins_unset" }]);
    const other = await denied({ ACCESS_AUD: "aud-1", ADMIN_EMAILS: "boss@example.com" });
    expect(other.lines).toEqual([{ event: "admin_denied", reason: "not_admin" }]);
  });

  it("aud khác: aud_mismatch, chỉ ghi 8 ký tự đầu của hai aud", async () => {
    const { lines } = await denied({ ACCESS_AUD: "11111111-cau-hinh" }, { aud: "22222222-thuc-te" });
    expect(lines).toEqual([{ event: "admin_denied", reason: "aud_mismatch", got: "22222222", want: "11111111" }]);
  });

  it("danh tính không có email: no_email, ghi tên các trường, không ghi giá trị", async () => {
    const { res, lines } = await denied({}, { getIdentity: async () => ({ name: "Ops Rieng Tu", id: "x" }) });
    expect(res.status).toBe(403);
    expect(lines).toEqual([{ event: "admin_denied", reason: "no_email", identity_keys: ["name", "id"] }]);
    expect(JSON.stringify(lines)).not.toContain("Ops Rieng Tu");
  });

  it("getIdentity ném lỗi: no_email kèm tên lỗi", async () => {
    const { lines } = await denied({}, { getIdentity: () => Promise.reject(new Error("Access không trả lời")) });
    expect(lines).toEqual([{ event: "admin_denied", reason: "no_email", identity_error: "Error: Access không trả lời" }]);
  });

  it("ENVIRONMENT nào khác 'test' (production, tên lạ, trống) mà thiếu ACCESS_AUD: aud_unset (chỉ 'test' mới được nới)", async () => {
    for (const environment of ["production", "staging", ""]) {
      const { lines } = await denied({ ENVIRONMENT: environment, ACCESS_AUD: "" });
      expect(lines, environment).toEqual([{ event: "admin_denied", reason: "aud_unset" }]);
    }
  });

  it("getIdentity ném lỗi dài: log chỉ giữ 200 ký tự đầu", async () => {
    const { lines } = await denied({}, { getIdentity: () => Promise.reject(new Error("x".repeat(5000))) });
    expect(lines).toHaveLength(1);
    expect(String(lines[0].identity_error).length).toBe(200);
  });

  it("request hợp lệ không ghi gì; ghi thay đổi từ trang khác: cross_site", async () => {
    expect((await denied({})).lines).toEqual([]);
    const { lines } = await denied({}, { method: "POST", body: {}, headers: { "sec-fetch-site": "cross-site" } });
    expect(lines).toEqual([{ event: "admin_denied", reason: "cross_site" }]);
  });
});

describe("JWT của Access khi Worker không nhận ctx.access (Worker có Static Assets)", () => {
  let issuer: Issuer;
  beforeAll(async () => {
    issuer = await makeIssuer();
  });
  afterEach(() => vi.restoreAllMocks());

  const ENV = { ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: TEAM };
  const JWT = "cf-access-jwt-assertion";

  /** Gọi /admin/whoami không có ctx.access, chỉ có header JWT; trả kết quả và các dòng admin_denied. */
  async function viaJwt(token: string | undefined, adminEnv: Parameters<typeof makeAdmin>[0] = ENV, opts: AdminCall = {}) {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { adminCall } = makeAdmin(adminEnv, { accessKeys: issuer.provider() });
    const res = await adminCall("/admin/whoami", { operator: null, headers: token === undefined ? {} : { [JWT]: token }, ...opts });
    const lines = warn.mock.calls.map(([l]) => JSON.parse(String(l))).filter((l) => l.event === "admin_denied");
    warn.mockRestore();
    return { res, lines };
  }

  it("JWT hợp lệ: vào được, người vận hành là email trong token", async () => {
    const { res, lines } = await viaJwt(await issuer.sign({ email: "ops@example.com" }));
    expect(res).toEqual({ status: 200, body: { operator: "ops@example.com" } });
    expect(lines).toEqual([]);
  });

  it("thao tác ghi qua JWT: qua kiểm CSRF và ghi nhật ký với actor admin:<email trong token>", async () => {
    const { adminCall } = makeAdmin(ENV, { accessKeys: issuer.provider() });
    const token = await issuer.sign({ email: "ops@example.com" });
    const res = await adminCall("/admin/lookup", { body: { email: "buyer@example.com" }, operator: null, headers: { [JWT]: token } });
    expect(res.status).toBe(200);
    expect(await lastAudit()).toMatchObject({ actor: "admin:ops@example.com", action: "lookup" });
    // thay đổi dữ liệu từ trang khác vẫn bị chặn dù JWT hợp lệ
    const cross = await adminCall("/admin/lookup", {
      body: { email: "buyer@example.com" },
      operator: null,
      headers: { [JWT]: token, "sec-fetch-site": "cross-site" },
    });
    expect(cross.status).toBe(403);
  });

  it("email trong nhật ký luôn chữ thường, ở cả đường JWT lẫn ctx.access", async () => {
    const viaToken = await viaJwt(await issuer.sign({ email: "Ops@Example.COM" }));
    expect(viaToken.res).toEqual({ status: 200, body: { operator: "ops@example.com" } });
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/whoami", { operator: "Ops@Example.COM" })).toEqual({ status: 200, body: { operator: "ops@example.com" } });
    expect(await adminCall("/admin/lookup", { body: { email: "x@example.com" }, operator: "Ops@Example.COM" })).toMatchObject({ status: 200 });
    expect(await lastAudit()).toMatchObject({ actor: "admin:ops@example.com" });
  });

  it("không có header JWT và không có ctx.access: no_access", async () => {
    const { res, lines } = await viaJwt(undefined);
    expect(res).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect(lines).toEqual([{ event: "admin_denied", reason: "no_access" }]);
  });

  it("thiếu ACCESS_AUD hay ACCESS_TEAM_DOMAIN thì không tin JWT nào (đóng)", async () => {
    const token = await issuer.sign();
    expect((await viaJwt(token, { ACCESS_TEAM_DOMAIN: TEAM })).lines).toEqual([{ event: "admin_denied", reason: "aud_unset" }]);
    expect((await viaJwt(token, { ACCESS_AUD: AUD })).lines).toEqual([{ event: "admin_denied", reason: "team_unset" }]);
    expect((await viaJwt(token, { ACCESS_AUD: "", ACCESS_TEAM_DOMAIN: "" })).res.status).toBe(403);
    expect((await viaJwt(token, { ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: "" })).res.status).toBe(403);
  });

  it.each([
    ["aud của ứng dụng khác", () => issuer.sign({ aud: ["app-khac"] }), "jwt_aud"],
    ["đã hết hạn", () => issuer.sign({ exp: Math.floor(Date.now() / 1000) - 5 }), "jwt_expired"],
    ["team khác", () => issuer.sign({ iss: "https://team-khac.cloudflareaccess.com" }), "jwt_iss"],
    ["chữ ký bị sửa", async () => corruptSignature(await issuer.sign()), "jwt_signature"],
    ["service token, không có email", () => issuer.sign({ email: undefined, common_name: "svc" }), "no_email"],
    ["alg none", () => issuer.sign({}, { alg: "none" }), "jwt_alg"],
    ["token org (phiên toàn team, không dành cho ứng dụng)", () => issuer.sign({ type: "org" }), "jwt_type"],
    ["không phải JWT", async () => "khong-phai-jwt", "jwt_malformed"],
  ])("JWT %s: 403 forbidden, log đúng lý do, không ghi nhật ký, log không chứa token hay email", async (_why, make, reason) => {
    const token = await make();
    const { res, lines } = await viaJwt(token);
    expect(res).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect(lines).toEqual([{ event: "admin_denied", reason }]);
    expect(JSON.stringify(lines)).not.toContain(token);
    expect(await auditCount("lookup")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor LIKE 'admin:%'").first()).toEqual({ n: 0 });
  });

  it("không lấy được khóa công khai của team: 403 jwks_unavailable (đóng)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const keys = {
      get: async () => {
        throw new Error("mạng lỗi");
      },
    };
    const { adminCall } = makeAdmin(ENV, { accessKeys: keys });
    const res = await adminCall("/admin/whoami", { operator: null, headers: { [JWT]: await issuer.sign() } });
    expect(res.status).toBe(403);
    expect(warn.mock.calls.map(([l]) => JSON.parse(String(l)))).toEqual([{ event: "admin_denied", reason: "jwks_unavailable" }]);
  });

  it("có ctx.access thì ctx.access quyết định, JWT hợp lệ không cứu được aud sai của ctx.access", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { adminCall } = makeAdmin(ENV, { accessKeys: issuer.provider() });
    const res = await adminCall("/admin/whoami", { aud: "aud-khac", headers: { [JWT]: await issuer.sign() } });
    expect(res.status).toBe(403);
    expect(warn.mock.calls.map(([l]) => JSON.parse(String(l)).reason)).toEqual(["aud_mismatch"]);
  });

  it("header JWT tự đặt bởi kẻ gọi (không do Access ký) không vào được", async () => {
    const forger = await makeIssuer(); // cùng kid mặc định, khóa khác
    const { res } = await viaJwt(await forger.sign({ email: "ke-xau@example.com" }));
    expect(res.status).toBe(403);
  });
});

describe("danh tính Access không đọc được (review cuối, N5)", () => {
  it.each([
    ["getIdentity trả undefined", async () => undefined],
    ["danh tính không có email", async () => ({ name: "Ops" })],
    ["email rỗng", async () => ({ email: "" })],
    ["email không phải chuỗi", async () => ({ email: 42 })],
    ["getIdentity ném lỗi", async () => Promise.reject(new Error("Access không trả lời"))],
  ])("%s: 403, không ghi admin:unknown, không đổi gì", async (_why, getIdentity) => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const id = (await licenseRow())!.id as string;
    const logged = (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first<{ n: number }>())!.n;
    expect(await adminCall("/admin/whoami", { getIdentity })).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect(await adminCall("/admin/lookup", { body: { email: "buyer@example.com" }, getIdentity })).toMatchObject({ status: 403 });
    expect(await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "x" }, getIdentity })).toMatchObject({ status: 403 });
    expect((await licenseRow())!.revoked_at).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first()).toEqual({ n: logged });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor LIKE 'admin:%'").first()).toEqual({ n: 0 });
  });

  it("có email thì actor là admin:<email>", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "x" }, getIdentity: async () => ({ email: "ops2@example.com" }) })).status).toBe(200);
    expect(await lastAudit()).toMatchObject({ actor: "admin:ops2@example.com", action: "license_revoked" });
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

  it("content-type gần giống application/json (jsonx, +json, text/json, json đứng sau) thì 415; có charset thì được", async () => {
    for (const type of ["application/jsonx", "application/json-patch+json", "application/merge-patch+json", "text/json", "text/plain; application/json"]) {
      const { res, revoked } = await revokeWith({ headers: { "content-type": type }, rawBody: '{"note":"x"}' });
      expect(res.status, type).toBe(415);
      expect(revoked).toBeNull();
    }
    for (const type of ["application/json; charset=utf-8", "Application/JSON"]) {
      const { res } = await revokeWith({ headers: { "content-type": type }, rawBody: '{"note":"x"}' });
      expect(res.status, type).toBe(200);
    }
  });

  it("Origin khác origin của Worker admin thì 403", async () => {
    const { res, revoked } = await revokeWith({ headers: { origin: "https://evil.example" } });
    expect(res).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect(revoked).toBeNull();
  });

  it("Origin chỉ giống phần đầu (admin.test.evil.com, admin.test:8443) hay khác scheme thì 403", async () => {
    for (const origin of ["https://admin.test.evil.com", "https://admin.test:8443", "http://admin.test", "null"]) {
      const { res, revoked } = await revokeWith({ headers: { origin } });
      expect(res.status, origin).toBe(403);
      expect(revoked).toBeNull();
    }
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

  it("tra theo máy (device_id_hash): dùng thử của máy và các license từng kích hoạt trên máy, kèm trạng thái xung đột", async () => {
    const { w, adminCall } = makeAdmin();
    const d1 = await sha256Hex("tra-may-1");
    const d2 = await sha256Hex("tra-may-2");
    await w.call("POST", "/v1/trial", { device_id_hash: d1 });
    const { licenseKey } = await w.buy({ email: "buyer@example.com" });
    const activate = (d: string, extra: Record<string, unknown> = {}) =>
      w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: d, device_label: "Máy", ...extra });
    expect((await activate(d1)).status).toBe(200);
    const res = await adminCall("/admin/lookup", { body: { device_id_hash: d1 } });
    expect(res.status).toBe(200);
    expect(res.body.trial).toEqual({ started_at: T0, ends_at: T0 + 10 * DAY, last_seen_at: T0 });
    expect(res.body.orders).toEqual([]);
    const lics = res.body.licenses as Record<string, unknown>[];
    expect(lics.map((l) => [l.license_key, l.conflict])).toEqual([[licenseKey, false]]);
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({ by: "device", licenses: 1, trial: true });

    // Máy 2 xác nhận "Vẫn kích hoạt": tra theo email hay theo máy đều thấy xung đột.
    expect((await activate(d2, { allow_conflict: true })).body.error).toBe("license_conflict");
    const byEmail = await adminCall("/admin/lookup", { body: { email: "buyer@example.com" } });
    expect((byEmail.body.licenses as Record<string, unknown>[])[0]).toMatchObject({ conflict: true });
    expect(byEmail.body).not.toHaveProperty("trial");
    const byDevice2 = await adminCall("/admin/lookup", { body: { device_id_hash: d2 } });
    expect(byDevice2.body).toMatchObject({ trial: null, licenses: [{ conflict: true }] });
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({ by: "device", licenses: 1, trial: false });

    const unknown = await adminCall("/admin/lookup", { body: { device_id_hash: await sha256Hex("không-có") } });
    expect(unknown.body).toEqual({ licenses: [], orders: [], trial: null });
    expect(await adminCall("/admin/lookup", { body: { device_id_hash: "SAI" } })).toMatchObject({
      status: 400,
      body: { field: "device_id_hash" },
    });
  });

  it("tra theo license key (có/không gạch nối, chữ thường) và theo license id; nhật ký không có key", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode, licenseKey } = await w.buy({ email: "buyer@example.com" });
    const raw = licenseKey.replace(/-/g, "");
    for (const key of [licenseKey, raw, licenseKey.toLowerCase()]) {
      const res = await adminCall("/admin/lookup", { body: { license_key: key } });
      expect(res.status, key).toBe(200);
      expect((res.body.licenses as Record<string, unknown>[]).map((l) => l.license_key)).toEqual([licenseKey]);
      expect((res.body.orders as Record<string, unknown>[]).map((o) => o.order_code)).toEqual([orderCode]);
      const log = await lastAudit();
      expect(log).toMatchObject({ action: "lookup", order_code: null });
      expect(JSON.parse((log as { detail: string }).detail)).toEqual({ by: "license_key", licenses: 1, orders: 1 });
      expect((log as { detail: string }).detail).not.toContain(raw.slice(4, -4));
    }
    const id = (await licenseRow())!.id as string;
    const byId = await adminCall("/admin/lookup", { body: { license_id: id } });
    expect(byId.body).toMatchObject({ licenses: [{ id, license_key: licenseKey }], orders: [{ order_code: orderCode }] });
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({ by: "license_id", licenses: 1, orders: 1 });
  });

  it("tra theo license: có cả đơn gia hạn (renew_license_id); key hay id không có thì rỗng; sai định dạng thì 400", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ email: "buyer@example.com" });
    const renew = await w.call("POST", "/v1/checkout", { plan: "yearly", email: "buyer@example.com", consent: true, license_key: licenseKey });
    const res = await adminCall("/admin/lookup", { body: { license_key: licenseKey } });
    expect((res.body.orders as Record<string, unknown>[]).map((o) => o.order_code)).toEqual([1, renew.body.order_code]);
    expect(await adminCall("/admin/lookup", { body: { license_key: formatLicenseKey(generateLicenseKey()) } })).toEqual({
      status: 200,
      body: { licenses: [], orders: [] },
    });
    expect((await adminCall("/admin/lookup", { body: { license_id: crypto.randomUUID() } })).body).toEqual({ licenses: [], orders: [] });
    expect(await adminCall("/admin/lookup", { body: { license_key: "ABCD-1234" } })).toMatchObject({ status: 400, body: { field: "license_key" } });
    expect(await adminCall("/admin/lookup", { body: { license_key: 42 } })).toMatchObject({ status: 400, body: { field: "license_key" } });
    expect(await adminCall("/admin/lookup", { body: { license_id: "khong-phai-uuid" } })).toMatchObject({ status: 400, body: { field: "license_id" } });
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
    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true });
    const res = await adminCall(`/admin/orders/${co.body.order_code as number}/payment-status`);
    expect(res.body).toEqual({ orderCode: 1, status: "pending", amount: 50000, amountPaid: 0, paidAt: null });
    expect(await lastAudit()).toMatchObject({ action: "payment_status_viewed", order_code: 1 });
    expect((await adminCall("/admin/orders/999/payment-status")).status).toBe(404);
  });

  it("xem trạng thái đơn có tác dụng phụ (nhật ký, gọi PayOS): Sec-Fetch-Site khác cùng origin thì 403", async () => {
    const { w, adminCall } = makeAdmin();
    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true });
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
    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true });
    const orderCode = co.body.order_code as number;
    w.payos.pay(orderCode, 1500);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 1500));
    const res = await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "khách chuyển bù 48.500đ, mã GD FT2" } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ plan: "monthly", expires_at: T0 + 30 * DAY, grant_kind: "new" });
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
    const { licenseKey } = await w.buy(); // Monthly, hết hạn T0 + 30 ngày
    w.clock.now = T0 + 10 * DAY;
    const co = await w.call("POST", "/v1/checkout", { plan: "yearly", email: "b@example.com", consent: true, license_key: licenseKey });
    const orderCode = co.body.order_code as number;
    w.payos.pay(orderCode, 450000);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 450000));
    w.clock.now = T0 + 12 * DAY; // hai ngày sau khách mới chuyển bù, người vận hành cấp tay
    const res = await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "khách chuyển bù 50.000đ, mã GD FT2" } });
    // Lúc thao tác còn 18 ngày Monthly: floor(18 × 365 × 50.000 / (30 × 500.000)) = floor(21,9) = 21.
    expect(res.body).toMatchObject({ plan: "yearly", grant_kind: "change", converted_days: 21, expires_at: T0 + 398 * DAY });
    expect(await licenseRow()).toMatchObject({ plan: "yearly", cycle_anchor: T0 + 12 * DAY, anchor_applied_at: T0 + 12 * DAY });
    const granted = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'license_plan_changed'").first<{ detail: string }>();
    expect(JSON.parse(granted!.detail)).toMatchObject({ paid_at: T0 + 12 * DAY, converted_days: 21 });
  });

  it("cấp tay khi không lấy được bảng gói từ Worker API thì 503, không đổi gì", async () => {
    const { w, adminCall } = makeAdmin({}, { plans: async () => null });
    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true });
    const orderCode = co.body.order_code as number;
    const res = await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "x" } });
    expect(res).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
    expect(await env.DB.prepare("SELECT status FROM orders").first()).toEqual({ status: "pending" });
    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "monthly", note: "tặng" } });
    expect(created.status).toBe(503);
  });

  it("cấp license mới theo mã gói, rồi gia hạn tay", async () => {
    const { w, adminCall } = makeAdmin();
    for (const plan of ["pro_1m", "free", "pro_12m", "pro", "pro_x5"]) {
      expect((await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan, note: "tặng" } })).status).toBe(400);
    }
    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "yearly", note: "tặng" } });
    expect(created.status).toBe(201);
    // Số ngày theo gói (days_per_order), không cố định 30 ngày.
    expect(created.body).toMatchObject({ plan: "yearly", expires_at: T0 + 365 * DAY });
    expect(await licenseRow()).toMatchObject({ plan: "yearly", cycle_anchor: T0, anchor_applied_at: T0 });
    expect(w.resend.sent[0]!.to).toEqual(["gift@example.com"]);
    expect(w.resend.sent[0]!.text).toContain("Yearly, hết hạn");
    const id = created.body.license_id as string;
    w.clock.now = T0 + DAY;
    const ext = await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 7, note: "bù sự cố" } });
    // Còn hạn: cộng vào hạn cũ, giữ cycle_anchor.
    expect(ext.body).toEqual({ license_id: id, expires_at: T0 + 372 * DAY, cycle_anchor: T0 });
    expect((await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 0, note: "x" } })).status).toBe(400);
  });

  it("mở khóa key không bị khóa: 404, không đặt lại lock_cleared_at, không ghi nhật ký; mở khóa lần hai cũng vậy", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const id = (await licenseRow())!.id as string;
    // Key chưa bị khóa: không có gì để gỡ.
    expect((await adminCall(`/admin/licenses/${id}/unlock`, { body: { note: "nhầm" } })).status).toBe(404);
    expect(await licenseRow()).toMatchObject({ locked_at: null, lock_cleared_at: null });
    expect(await auditCount("license_unlocked")).toBe(0);
    // Khóa thật rồi mở: lần đầu được.
    const activate = async (n: number) =>
      w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex(`d${n}`), device_label: `M${n}` }, { "cf-connecting-ip": `198.51.100.${n}` });
    for (let i = 1; i <= 3; i++) {
      const r = await activate(i);
      await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: r.body.activation_id });
    }
    expect((await activate(4)).status).toBe(423);
    w.clock.now = T0 + 5;
    expect((await adminCall(`/admin/licenses/${id}/unlock`, { body: { note: "đã xác minh" } })).status).toBe(200);
    expect(await licenseRow()).toMatchObject({ locked_at: null, lock_cleared_at: T0 + 5 });
    // Lần hai: key đã mở, mốc lock_cleared_at giữ nguyên, không thêm nhật ký.
    w.clock.now = T0 + 99;
    expect((await adminCall(`/admin/licenses/${id}/unlock`, { body: { note: "lần hai" } })).status).toBe(404);
    expect(await licenseRow()).toMatchObject({ locked_at: null, lock_cleared_at: T0 + 5 });
    expect(await auditCount("license_unlocked")).toBe(1);
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

  it("gia hạn tay đúng giây license hết hạn: coi là đã hết hạn, như computeGrant (review cuối, N7)", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const id = (await licenseRow())!.id as string;
    w.clock.now = T0 + 30 * DAY; // expires_at = T0 + 30 ngày
    const ext = await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 7, note: "bù" } });
    expect(ext.body).toEqual({ license_id: id, expires_at: T0 + 37 * DAY, cycle_anchor: T0 + 30 * DAY });
    expect(await licenseRow()).toMatchObject({ anchor_applied_at: T0 + 30 * DAY });
    // Còn 1 giây thì vẫn còn hạn: giữ chu kỳ.
    await resetDb();
    const again = makeAdmin();
    await again.w.buy();
    const id2 = (await licenseRow())!.id as string;
    again.w.clock.now = T0 + 30 * DAY - 1;
    const ext2 = await again.adminCall(`/admin/licenses/${id2}/extend`, { body: { days: 7, note: "bù" } });
    expect(ext2.body).toEqual({ license_id: id2, expires_at: T0 + 37 * DAY, cycle_anchor: T0 });
    expect(await licenseRow()).toMatchObject({ anchor_applied_at: T0 });
  });

  it("mở khóa key bị khóa tạm: lần gỡ trước đó không còn tính", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const activate = async (n: number) =>
      w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex(`d${n}`), device_label: `M${n}` }, { "cf-connecting-ip": `198.51.100.${n}` });
    for (let i = 1; i <= 3; i++) {
      const r = await activate(i);
      await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: r.body.activation_id });
    }
    expect((await activate(4)).status).toBe(423);
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/unlock`, { body: { note: "khách đổi máy nhiều, đã xác minh" } })).status).toBe(200);
    w.clock.now = T0 + 1;
    expect((await activate(4)).status).toBe(200);
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
    await w.call("POST", "/v1/trial", { device_id_hash: await sha256Hex("d1") });
    const res = await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa qua email hỗ trợ ngày 2026-10-01" } });
    expect(res.body).toEqual({ activations: 1, licenses: 1, orders: 1 });
    // Bảng trials không có email, nên xóa theo email không chạm tới (spec 2026-10-07 §7, §10.1).
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM trials").first()).toEqual({ n: 1 });
    const orders = await env.DB.prepare("SELECT email, amount, plan, status FROM orders ORDER BY order_code").all();
    expect(orders.results).toEqual([
      { email: null, amount: 50000, plan: "monthly", status: "paid" },
      { email: "keep@example.com", amount: 50000, plan: "monthly", status: "paid" },
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

  it("giữ device_id_hash (đã băm): máy đó kích hoạt lại thì dùng lại đúng activation cũ, không tốn suất mới", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ email: "erase@example.com" });
    const hash = await sha256Hex("d1");
    const first = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: hash, device_label: "MacBook của An" });
    await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: first.body.activation_id });
    await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa" } });
    expect((await env.DB.prepare("SELECT id, device_id_hash, device_label FROM activations").all()).results).toEqual([
      { id: first.body.activation_id, device_id_hash: hash, device_label: null },
    ]);
    w.clock.now = T0 + 3600;
    const again = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: hash, device_label: "Máy mới đặt tên" });
    expect(again).toMatchObject({
      status: 200,
      body: { activation_id: first.body.activation_id, activation_created_at: first.body.activation_created_at },
    });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first()).toEqual({ n: 1 });
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
    const co = await w.call("POST", "/v1/checkout", { plan: "yearly", email: "b@example.com", consent: true, license_key: licenseKey });
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
    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true, license_key: licenseKey });
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
    // Gói của đơn (Yearly), số ngày của gói tính từ lúc thao tác.
    expect(res).toMatchObject({ status: 200, body: { order_code: orderCode, status: "paid", plan: "yearly", expires_at: T0 + 366 * DAY } });
    const lics = await env.DB.prepare("SELECT plan, revoked_at FROM licenses ORDER BY created_at").all();
    expect(lics.results).toEqual([
      { plan: "monthly", revoked_at: T0 },
      { plan: "yearly", revoked_at: null },
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
      `${API_ORIGIN}/v1/webhooks/payos#x`,
      "https://mt-license.example.workers.dev.evil.com/v1/webhooks/payos",
      "https://evil.com/mt-license.example.workers.dev/v1/webhooks/payos",
      `${API_ORIGIN}:8443/v1/webhooks/payos`,
      "https://user:pass@mt-license.example.workers.dev/v1/webhooks/payos",
      "https://user@mt-license.example.workers.dev/v1/webhooks/payos",
      `${API_ORIGIN}/khac`,
      "http://mt-license.example.workers.dev/v1/webhooks/payos",
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

describe("hai khách: tra cứu và xóa dữ liệu chỉ đụng đúng email (review cuối, Q1)", () => {
  it("tra theo email của A không trả đơn hay license của B", async () => {
    const { w, adminCall } = makeAdmin();
    const a = await w.buy({ email: "buyer@example.com" });
    const b = await w.customerB();
    const res = await adminCall("/admin/lookup", { body: { email: "buyer@example.com" } });
    expect(res.status).toBe(200);
    expect((res.body.orders as { order_code: number }[]).map((o) => o.order_code)).toEqual([a.orderCode]);
    expect((res.body.licenses as { license_key: string }[]).map((l) => l.license_key)).toEqual([a.licenseKey]);
    expect(JSON.stringify(res.body)).not.toContain(b.email);
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({ by: "email", licenses: 1, orders: 1 });
  });

  it("xóa dữ liệu của A giữ nguyên device_label và email của B", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ email: "erase@example.com" });
    await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "MacBook của An" });
    const b = await w.customerB();
    const labelsOfB = () =>
      env.DB.prepare("SELECT device_label FROM activations WHERE license_id = ? ORDER BY device_label")
        .bind(b.licenseId)
        .all()
        .then((r) => r.results.map((x) => x.device_label));
    const before = await labelsOfB();
    expect(before).toEqual(["Máy B1", "Máy B2", "Máy B3", "Máy B4"]);
    const res = await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa" } });
    expect(res.body).toEqual({ activations: 1, licenses: 1, orders: 1 });
    expect(await labelsOfB()).toEqual(before);
    expect(await env.DB.prepare("SELECT email FROM licenses WHERE id = ?").bind(b.licenseId).first()).toEqual({ email: b.email });
  });
});

describe("nhật ký cho thao tác thất bại có ý nghĩa (review cuối, N6)", () => {
  const rows = (action: string) =>
    env.DB.prepare("SELECT actor, order_code, detail FROM audit_log WHERE action = ? ORDER BY id")
      .bind(action)
      .all<{ actor: string; order_code: number | null; detail: string | null }>()
      .then((r) => r.results.map((x) => ({ ...x, detail: x.detail === null ? null : JSON.parse(x.detail) })));

  it("cấp tay bị 409 (đơn đã cấp, đơn chờ xử lý): ghi order_grant_rejected kèm lý do và note", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode } = await w.buy();
    expect((await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "lần hai" } })).status).toBe(409);
    expect(await rows("order_grant_rejected")).toEqual([
      { actor: "admin:ops@example.com", order_code: orderCode, detail: { error: "already_paid", status: "paid", note: "lần hai" } },
    ]);
  });

  it("cấp tay đơn gia hạn mà license đã thu hồi (409 needs_review): ghi order_grant_rejected", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true, license_key: licenseKey });
    const orderCode = co.body.order_code as number;
    w.payos.pay(orderCode, 1000);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 1000));
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0).run();
    expect((await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "chuyển bù" } })).status).toBe(409);
    expect(await rows("order_grant_rejected")).toEqual([
      { actor: "admin:ops@example.com", order_code: orderCode, detail: { error: "needs_review", status: "paid_needs_review", note: "chuyển bù" } },
    ]);
  });

  it("resolve bị 409 (đơn không chờ xử lý, hay đã xử lý ở lần chạy cùng lúc): ghi order_resolve_rejected", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode } = await w.buy();
    expect((await adminCall(`/admin/orders/${orderCode}/resolve`, { body: { action: "refunded", note: "x" } })).status).toBe(409);
    expect(await rows("order_resolve_rejected")).toEqual([
      { actor: "admin:ops@example.com", order_code: orderCode, detail: { action: "refunded", error: "not_needs_review", status: "paid", note: "x" } },
    ]);
  });

  it("ba lần ghi hoàn tiền cùng lúc: một dòng order_refunded_outside, hai dòng order_resolve_rejected", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ email: "b@example.com" });
    const co = await w.call("POST", "/v1/checkout", { plan: "yearly", email: "b@example.com", consent: true, license_key: licenseKey });
    const orderCode = co.body.order_code as number;
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0).run();
    w.payos.pay(orderCode);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    const body = { action: "refunded", note: "đã hoàn" };
    const results = await Promise.all([1, 2, 3].map(() => adminCall(`/admin/orders/${orderCode}/resolve`, { body })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await auditCount("order_refunded_outside")).toBe(1);
    expect((await rows("order_resolve_rejected")).map((r) => r.detail.error)).toEqual(["not_needs_review", "not_needs_review"]);
  });

  it("ký thử lỗi: ghi key_check_failed, không chép câu lỗi (có thể chứa một phần secret) vào nhật ký", async () => {
    const { adminCall } = makeAdmin({}, { keyCheck: async () => Promise.reject(new SyntaxError('Unexpected token, "{"kty":"OKP","d":"BI-MAT"" is not valid JSON')) });
    expect((await adminCall("/admin/keys/test-sign", { body: {} })).status).toBe(503);
    const logged = await rows("key_check_failed");
    expect(logged).toEqual([{ actor: "admin:ops@example.com", order_code: null, detail: null }]);
    expect(JSON.stringify(await env.DB.prepare("SELECT * FROM audit_log").all())).not.toContain("BI-MAT");
  });

  it("confirm-webhook lỗi: PayOS lỗi thì ghi url và mã lỗi; URL bị từ chối thì ghi lý do, không ghi URL", async () => {
    const { w, adminCall } = makeAdmin();
    const url = `${API_ORIGIN}/v1/webhooks/payos`;
    w.payos.down = true;
    expect((await adminCall("/admin/payos/confirm-webhook", { body: { webhook_url: url } })).status).toBe(502);
    expect(await adminCall("/admin/payos/confirm-webhook", { body: { webhook_url: "https://user:pass@evil.example/v1/webhooks/payos" } })).toMatchObject({ status: 400 });
    expect(await rows("payos_webhook_confirm_failed")).toEqual([
      { actor: "admin:ops@example.com", order_code: null, detail: { reason: "payment_provider_error", url } },
      { actor: "admin:ops@example.com", order_code: null, detail: { reason: "invalid_webhook_url" } },
    ]);
    expect(JSON.stringify(await env.DB.prepare("SELECT * FROM audit_log").all())).not.toContain("pass");
    expect(await auditCount("payos_webhook_confirmed")).toBe(0);
  });

  it("whoami chỉ đọc email của chính người vận hành: không ghi nhật ký", async () => {
    const { adminCall } = makeAdmin();
    expect((await adminCall("/admin/whoami")).status).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first()).toEqual({ n: 0 });
  });
});
