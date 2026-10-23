import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRpc } from "../src/admin-rpc";
import { sha256Hex } from "../src/crypto";
import { signKeyCheck } from "../src/deps";
import { insertReportStatements } from "../src/error-reports";
import { formatLicenseKey, generateLicenseKey } from "../src/license-key";
import { verifyToken } from "../src/token";
import { AUD, corruptSignature, type Issuer, makeIssuer, TEAM } from "./access-jwt-helper";
import { ADMIN, type AdminCall, API_ORIGIN, apiKeyEnv, auditCount, lastAudit, licenseRow, makeAdmin } from "./admin-harness";
import { resetDb, withFailingInsert } from "./db";
import { TEST_CREEM_API_KEY } from "./fakes";
import { makeReport } from "./report-fixture";
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

  it("xem trạng thái đơn Creem: hỏi phiên của đơn bằng khóa API của Worker admin, số tiền là cent USD, có ghi nhật ký", async () => {
    const { w, adminCall } = makeAdmin();
    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true, currency: "USD" });
    const orderCode = co.body.order_code as number;
    const path = `/admin/orders/${orderCode}/payment-status`;
    expect((await adminCall(path)).body).toEqual({ orderCode, status: "pending", amount: 399, amountPaid: 0, paidAt: null });
    expect(w.creem.requests.at(-1)).toMatchObject({ method: "GET", apiKey: TEST_CREEM_API_KEY });
    expect(await lastAudit()).toMatchObject({ action: "payment_status_viewed", order_code: orderCode });
    // Khách trả (Creem cộng thuế ngoài giá): số đã nhận là giá niêm yết, không gồm thuế.
    w.creem.pay(w.creem.checkoutIdOf(orderCode), 80);
    expect((await adminCall(path)).body).toEqual({ orderCode, status: "paid", amount: 399, amountPaid: 399, paidAt: null });
    // Lớp phòng thủ của cổng: nếu Creem có báo đơn `refunded` thì trang hiện đúng như vậy. Nhưng Creem thật KHÔNG báo thế: sau hoàn
    // tiền `order.status` vẫn là "paid" (hoàn tiền nằm ở giao dịch), nên cổng GET vẫn báo `paid`. `refunded` đến từ webhook (orders.status),
    // không từ payment-status: đừng dựa vào nó để biết đơn Creem đã hoàn tiền (fakes.ts: refundWebhook không đổi `order.status`).
    w.creem.setOrderStatus(w.creem.checkoutIdOf(orderCode), "refunded");
    expect((await adminCall(path)).body).toMatchObject({ status: "refunded" });
  });

  it("đơn Creem mà Creem từ chối khóa API: 502 payment_provider_error kèm trace_id để hỏi hỗ trợ, không lộ khóa", async () => {
    const { w, adminCall } = makeAdmin({}, { creemApiKey: "ck_sai" });
    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true, currency: "USD" });
    const res = await adminCall(`/admin/orders/${co.body.order_code as number}/payment-status`);
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: "payment_provider_error" });
    expect(String(res.body.message)).toContain("HTTP 403");
    expect(String(res.body.message)).toContain("trace-auth");
    expect(JSON.stringify(res.body)).not.toContain("ck_sai");
  });

  it("Worker admin không dựng được cổng creem (khóa API rỗng: secret bị xóa hay đặt rỗng sau deploy; thiếu hẳn thì secrets.required chặn deploy): đơn Creem trả 502 không có cổng creem, ghi log admin_no_gateway, không hỏi Creem; đơn PayOS vẫn xem được", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { w, adminCall } = makeAdmin({}, { creemApiKey: null });
      const creem = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true, currency: "USD" });
      const res = await adminCall(`/admin/orders/${creem.body.order_code as number}/payment-status`);
      expect(res).toMatchObject({ status: 502, body: { error: "payment_provider_error", message: "không có cổng creem" } });
      const logged = warn.mock.calls.map(([line]) => JSON.parse(String(line))).filter((l) => l.event === "admin_no_gateway");
      expect(logged).toEqual([{ event: "admin_no_gateway", provider: "creem" }]);
      expect(w.creem.requests.filter((r) => r.method === "GET")).toHaveLength(0);
      const payos = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "c@example.com", consent: true });
      expect((await adminCall(`/admin/orders/${payos.body.order_code as number}/payment-status`)).status).toBe(200);
      // Đơn PayOS có cổng nên không thêm dòng log nào.
      expect(warn.mock.calls.map(([line]) => JSON.parse(String(line))).filter((l) => l.event === "admin_no_gateway")).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("điểm vào thật (admin-entry.ts): đơn Creem hỏi Creem bằng khóa API của Worker admin qua fetch thật; khóa API rỗng thì không có cổng creem", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { w, adminCall } = makeAdmin({ CREEM_BASE_URL: "https://api.creem.io", CREEM_API_KEY: "ck" }, { entry: true });
      const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true, currency: "USD" });
      const orderCode = co.body.order_code as number;
      const path = `/admin/orders/${orderCode}/payment-status`;
      // Chỉ spy sau khi đã tạo đơn: Worker API của world dùng fetch giả riêng; từ đây mọi fetch toàn cục là của Worker admin.
      const spy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () => new Response(JSON.stringify({ id: "ch_fake1", request_id: String(orderCode), status: "pending", custom_price: 399 })));
      try {
        expect(await adminCall(path)).toEqual({ status: 200, body: { orderCode, status: "pending", amount: 399, amountPaid: 0, paidAt: null } });
        expect(spy).toHaveBeenCalledTimes(1);
        const [url, init] = spy.mock.calls[0] ?? [];
        expect(url).toBe("https://api.creem.io/v1/checkouts?checkout_id=ch_fake1");
        expect(new Headers(init?.headers).get("x-api-key")).toBe("ck");
        expect(init?.redirect).toBe("manual");
        // Khóa API rỗng (secret bị xóa hay đặt rỗng): không dựng cổng creem, không hỏi Creem.
        const noKey = makeAdmin({ CREEM_BASE_URL: "https://api.creem.io", CREEM_API_KEY: "" }, { entry: true });
        expect(await noKey.adminCall(path)).toMatchObject({ status: 502, body: { error: "payment_provider_error", message: "không có cổng creem" } });
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    } finally {
      warn.mockRestore();
    }
  });

  it("xem trạng thái đơn có tác dụng phụ (nhật ký, gọi cổng PayOS hay Creem): Sec-Fetch-Site khác cùng origin thì 403", async () => {
    const { w, adminCall } = makeAdmin();
    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true });
    const path = `/admin/orders/${co.body.order_code as number}/payment-status`;
    const asked = () => w.payos.requests.filter((r) => r.method === "GET").length;
    const creem = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "c@example.com", consent: true, currency: "USD" });
    const creemPath = `/admin/orders/${creem.body.order_code as number}/payment-status`;
    const askedCreem = () => w.creem.requests.filter((r) => r.method === "GET").length;
    for (const site of ["cross-site", "same-site"]) {
      for (const p of [path, creemPath]) {
        expect(await adminCall(p, { headers: { "sec-fetch-site": site } })).toMatchObject({ status: 403, body: { error: "forbidden" } });
      }
    }
    expect(asked()).toBe(0);
    expect(askedCreem()).toBe(0);
    expect(await auditCount("payment_status_viewed")).toBe(0);
    for (const headers of [{ "sec-fetch-site": "same-origin" }, { "sec-fetch-site": "none" }, {}]) {
      expect((await adminCall(path, { headers })).status).toBe(200);
    }
    expect(asked()).toBe(3);
    expect((await adminCall(creemPath, { headers: { "sec-fetch-site": "same-origin" } })).status).toBe(200);
    expect(askedCreem()).toBe(1);
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
    expect(w.resend.sent[0]!.text).toContain("Gói Yearly · Hết hạn");
    const id = created.body.license_id as string;
    w.clock.now = T0 + DAY;
    const ext = await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 7, note: "bù sự cố" } });
    // Còn hạn: cộng vào hạn cũ, giữ cycle_anchor.
    expect(ext.body).toEqual({ license_id: id, expires_at: T0 + 372 * DAY, cycle_anchor: T0 });
    expect((await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 0, note: "x" } })).status).toBe(400);
  });

  it("cấp tay gói six_months: 180 ngày từ lúc cấp, thư nêu tên gói 6 Months, gia hạn tay vẫn cộng đúng số ngày", async () => {
    const { w, adminCall } = makeAdmin();
    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "six_months", note: "tặng" } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ plan: "six_months", expires_at: T0 + 180 * DAY });
    expect(await licenseRow()).toMatchObject({ plan: "six_months", expires_at: T0 + 180 * DAY, cycle_anchor: T0, anchor_applied_at: T0 });
    expect(w.resend.sent[0]!.text).toContain("Gói 6 Months · Hết hạn");
    const id = created.body.license_id as string;
    w.clock.now = T0 + DAY;
    const ext = await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 7, note: "bù sự cố" } });
    expect(ext.body).toEqual({ license_id: id, expires_at: T0 + 187 * DAY, cycle_anchor: T0 });
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

describe("rút ngắn hạn license (Q2, C1-T7): trừ đúng số ngày của một đơn bị hoàn, không lấy phần khách đã trả ở đơn khác", () => {
  const shortened = () =>
    env.DB.prepare("SELECT actor, license_id, order_code, detail FROM audit_log WHERE action = 'license_shortened_manually' ORDER BY id")
      .all<{ actor: string; license_id: string; order_code: number | null; detail: string }>()
      .then((r) => r.results.map((x) => ({ ...x, detail: JSON.parse(x.detail) as Record<string, unknown> })));
  const adminAudits = () => env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor LIKE 'admin:%'").first<{ n: number }>();
  const licenseOf = (email: string) => env.DB.prepare("SELECT * FROM licenses WHERE email = ?").bind(email).first<Record<string, unknown>>();

  /** Khách mua Monthly lúc T0 (đơn A, hạn T0 + 30 ngày), kích hoạt một máy, rồi gia hạn sớm lúc T0 + 2 ngày (đơn B, hạn T0 + 60 ngày). */
  async function renewed() {
    const admin = makeAdmin();
    const { w } = admin;
    const { orderCode: orderA, licenseKey } = await w.buy();
    const act = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "M1" });
    w.clock.now = T0 + 2 * DAY;
    const { orderCode: orderB } = await w.buy({ licenseKey });
    const lic = (await licenseRow())!;
    expect(lic.expires_at).toBe(T0 + 60 * DAY);
    return { ...admin, id: lic.id as string, licenseKey, orderA, orderB, activationId: act.body.activation_id as string };
  }

  it("trừ đúng days × 86400 giây, version + 1; gói, cycle_anchor, anchor_applied_at và máy giữ nguyên; một dòng nhật ký có mã đơn", async () => {
    const { w, adminCall, id, licenseKey, orderB, activationId } = await renewed();
    w.clock.now = T0 + 5 * DAY;
    const before = (await licenseRow())!;
    const acts = (await env.DB.prepare("SELECT * FROM activations").all()).results;
    const note = "khách được hoàn đơn gia hạn";
    const res = await adminCall(`/admin/licenses/${id}/shorten`, { body: { days: 30, note, order_code: orderB, expected_expires_at: T0 + 60 * DAY } });
    // T0 + 60 ngày − 30 × 86400 giây = T0 + 30 ngày: đúng phần đơn A đã trả còn lại.
    expect(res).toEqual({ status: 200, body: { license_id: id, expires_at: T0 + 30 * DAY } });
    expect(await licenseRow()).toEqual({ ...before, expires_at: T0 + 60 * DAY - 30 * 86400, version: (before.version as number) + 1 });
    expect((await env.DB.prepare("SELECT * FROM activations").all()).results).toEqual(acts);
    expect(await shortened()).toEqual([
      {
        actor: "admin:ops@example.com",
        license_id: id,
        order_code: orderB,
        detail: { days: 30, from_expires_at: T0 + 60 * DAY, expires_at: T0 + 30 * DAY, order_code: orderB, note },
      },
    ]);
    // Lần làm mới token kế tiếp mang hạn mới (token đang có giữ hạn cũ tới lúc đó, như Thu hồi).
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: activationId });
    expect(v).toMatchObject({ status: 200, body: { expires_at: T0 + 30 * DAY } });
  });

  it.each([0, 3651, 1.5, "3", -1, undefined])("days = %j: 400 invalid_request (field days), không đổi gì, không ghi nhật ký", async (days) => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const before = await licenseRow();
    const path = `/admin/licenses/${before!.id as string}/shorten`;
    const res = await adminCall(path, { body: { days, note: "x", expected_expires_at: before!.expires_at } });
    expect(res).toEqual({ status: 400, body: { error: "invalid_request", field: "days" } });
    // Thiếu luôn expected_expires_at: lỗi của days vẫn đứng trước.
    expect(await adminCall(path, { body: { days, note: "x" } })).toEqual({ status: 400, body: { error: "invalid_request", field: "days" } });
    expect(await licenseRow()).toEqual(before);
    expect(await adminAudits()).toEqual({ n: 0 });
  });

  it("thiếu note, note rỗng hay dài quá 500 ký tự: 400 invalid_request (field note)", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const before = await licenseRow();
    const path = `/admin/licenses/${before!.id as string}/shorten`;
    const expected_expires_at = before!.expires_at;
    // Cả body thiếu luôn expected_expires_at: lỗi của note vẫn đứng trước.
    for (const body of [{ days: 1, expected_expires_at }, { days: 1, note: "   ", expected_expires_at }, { days: 1, note: "x".repeat(501), expected_expires_at }, { days: 1 }]) {
      expect(await adminCall(path, { body }), JSON.stringify(body).slice(0, 30)).toEqual({ status: 400, body: { error: "invalid_request", field: "note" } });
    }
    expect(await licenseRow()).toEqual(before);
    expect(await adminAudits()).toEqual({ n: 0 });
  });

  it("order_code phải là đơn đã áp hay đang áp vào chính license này (license_id hay renew_license_id); sai thì 400 (field order_code)", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode: mine, licenseKey } = await w.buy({ email: "a@example.com" });
    const { orderCode: other } = await w.buy({ email: "b@example.com" });
    // Đơn gia hạn chưa trả: chỉ có renew_license_id trỏ license này.
    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "a@example.com", consent: true, license_key: licenseKey });
    const pending = co.body.order_code as number;
    const id = (await licenseOf("a@example.com"))!.id as string;
    const path = `/admin/licenses/${id}/shorten`;
    for (const order_code of [other, 999_999, 0, -1, 1.5, String(mine)]) {
      expect(await adminCall(path, { body: { days: 1, note: "x", order_code, expected_expires_at: T0 + 30 * DAY } }), String(order_code)).toEqual({
        status: 400,
        body: { error: "invalid_request", field: "order_code" },
      });
    }
    expect(await adminAudits()).toEqual({ n: 0 });
    expect((await licenseOf("a@example.com"))!.expires_at).toBe(T0 + 30 * DAY);
    // Đơn của license (đã áp, hay đơn gia hạn đang chờ); không kèm mã đơn (bỏ trống hay null) cũng được.
    let expected = T0 + 30 * DAY;
    for (const order_code of [mine, pending, undefined, null]) {
      expect((await adminCall(path, { body: { days: 1, note: "x", order_code, expected_expires_at: expected } })).status, String(order_code)).toBe(200);
      expected -= DAY;
    }
    expect((await shortened()).map((r) => [r.order_code, r.detail.order_code])).toEqual([[mine, mine], [pending, pending], [null, null], [null, null]]);
    expect((await licenseOf("a@example.com"))!.expires_at).toBe(T0 + 26 * DAY);
    expect((await licenseOf("b@example.com"))!.expires_at).toBe(T0 + 30 * DAY);
  });

  it("quá xa (hạn mới bằng hay trước bây giờ): 409 too_far kèm max_days, không đổi gì, không ghi nhật ký; đúng max_days thì được", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy(); // hạn T0 + 30 ngày
    const before = (await licenseRow())!;
    const id = before.id as string;
    const path = `/admin/licenses/${id}/shorten`;
    w.clock.now = T0 + 5 * DAY; // còn đúng 25 ngày
    // 25 ngày: hạn mới đúng bằng bây giờ; 26 và 3650 ngày: trước bây giờ. Rút được nhiều nhất 24 ngày.
    for (const days of [25, 26, 3650]) {
      expect(await adminCall(path, { body: { days, note: "x", expected_expires_at: T0 + 30 * DAY } }), String(days)).toEqual({
        status: 409,
        body: { error: "too_far", max_days: 24, expires_at: T0 + 30 * DAY },
      });
    }
    expect(await licenseRow()).toEqual(before);
    expect(await adminAudits()).toEqual({ n: 0 });
    expect(await adminCall(path, { body: { days: 24, note: "x", expected_expires_at: T0 + 30 * DAY } })).toEqual({ status: 200, body: { license_id: id, expires_at: T0 + 6 * DAY } });
    // Còn đúng 1 ngày: rút 1 ngày thì hạn mới bằng bây giờ, nên không rút được ngày nào nữa.
    expect(await adminCall(path, { body: { days: 1, note: "x", expected_expires_at: T0 + 6 * DAY } })).toEqual({
      status: 409,
      body: { error: "too_far", max_days: 0, expires_at: T0 + 6 * DAY },
    });
    // License đã hết hạn: không rút được.
    w.clock.now = T0 + 40 * DAY;
    expect(await adminCall(path, { body: { days: 1, note: "x", expected_expires_at: T0 + 6 * DAY } })).toEqual({
      status: 409,
      body: { error: "too_far", max_days: 0, expires_at: T0 + 6 * DAY },
    });
    expect(await licenseRow()).toMatchObject({ expires_at: T0 + 6 * DAY, version: (before.version as number) + 1 });
    expect(await auditCount("license_shortened_manually")).toBe(1);
  });

  it("license đã thu hồi: 409 license_revoked, không đổi gì, không ghi nhật ký", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "hoàn tiền" } })).status).toBe(200);
    const before = await licenseRow();
    expect(await adminCall(`/admin/licenses/${id}/shorten`, { body: { days: 1, note: "x", expected_expires_at: before!.expires_at } })).toEqual({ status: 409, body: { error: "license_revoked" } });
    expect(await licenseRow()).toEqual(before);
    expect(await auditCount("license_shortened_manually")).toBe(0);
  });

  it("license đã thu hồi và còn quá xa (hay expected_expires_at lệch): license_revoked đứng trước too_far và conflict", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy(); // hạn T0 + 30 ngày
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "hoàn tiền" } })).status).toBe(200);
    const before = await licenseRow();
    w.clock.now = T0 + 5 * DAY; // còn 25 ngày: rút 3650 ngày là quá xa
    const path = `/admin/licenses/${id}/shorten`;
    for (const expected_expires_at of [T0 + 30 * DAY, T0 + 10 * DAY]) {
      expect(await adminCall(path, { body: { days: 3650, note: "x", expected_expires_at } }), String(expected_expires_at)).toEqual({ status: 409, body: { error: "license_revoked" } });
    }
    expect(await licenseRow()).toEqual(before);
    expect(await auditCount("license_shortened_manually")).toBe(0);
  });

  it("license không tồn tại: 404 not_found (kể cả khi kèm order_code), không ghi nhật ký", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode } = await w.buy();
    const path = `/admin/licenses/${crypto.randomUUID()}/shorten`;
    const expected_expires_at = T0 + 30 * DAY;
    expect(await adminCall(path, { body: { days: 1, note: "x", expected_expires_at } })).toEqual({ status: 404, body: { error: "not_found" } });
    expect(await adminCall(path, { body: { days: 1, note: "x", order_code: orderCode, expected_expires_at } })).toEqual({ status: 404, body: { error: "not_found" } });
    // Input sai hình dạng (thiếu expected_expires_at) bị từ chối trước khi tra license: 400, không phải 404.
    expect(await adminCall(path, { body: { days: 1, note: "x" } })).toEqual({ status: 400, body: { error: "invalid_request", field: "expected_expires_at" } });
    expect(await adminAudits()).toEqual({ n: 0 });
  });

  /** D1 bọc lại: ngay trước batch đầu tiên của Worker admin (sau khi route đã đọc license), một thao tác khác chạy `sql`. */
  function racingDb(sql: string) {
    const state = { raced: false };
    const db = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "batch") {
          return async (stmts: D1PreparedStatement[]) => {
            if (!state.raced) {
              state.raced = true;
              await target.prepare(sql).run();
            }
            return target.batch(stmts);
          };
        }
        const v: unknown = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    return { db, state };
  }

  it("license đổi giữa lúc đọc và lúc ghi (như gia hạn 7 ngày): 409 conflict, không rút, không ghi nhật ký; thử lại với hạn mới thì trừ từ hạn mới", async () => {
    const { db, state } = racingDb(`UPDATE licenses SET expires_at = expires_at + ${7 * DAY}, version = version + 1`);
    const { w, adminCall } = makeAdmin({ DB: db });
    await w.buy();
    const before = (await licenseRow())!;
    const path = `/admin/licenses/${before.id as string}/shorten`;
    expect(await adminCall(path, { body: { days: 1, note: "x", expected_expires_at: T0 + 30 * DAY } })).toEqual({ status: 409, body: { error: "conflict" } });
    expect(state.raced).toBe(true);
    expect(await licenseRow()).toEqual({ ...before, expires_at: T0 + 37 * DAY, version: (before.version as number) + 1 });
    expect(await auditCount("license_shortened_manually")).toBe(0);
    // Giao diện tải lại, thấy hạn mới, gửi lại với hạn đó.
    expect(await adminCall(path, { body: { days: 1, note: "x", expected_expires_at: T0 + 37 * DAY } })).toEqual({ status: 200, body: { license_id: before.id, expires_at: T0 + 36 * DAY } });
  });

  it("license đổi giữa lúc đọc và lúc ghi mà hạn vẫn giữ nguyên (version tăng, như đổi gói cùng hạn): 409 conflict, không rút, không ghi nhật ký", async () => {
    const { db, state } = racingDb("UPDATE licenses SET version = version + 1");
    const { w, adminCall } = makeAdmin({ DB: db });
    await w.buy();
    const before = (await licenseRow())!;
    const path = `/admin/licenses/${before.id as string}/shorten`;
    expect(await adminCall(path, { body: { days: 1, note: "x", expected_expires_at: before.expires_at } })).toEqual({ status: 409, body: { error: "conflict" } });
    expect(state.raced).toBe(true);
    expect(await licenseRow()).toEqual({ ...before, version: (before.version as number) + 1 });
    expect(await auditCount("license_shortened_manually")).toBe(0);
  });

  it("thu hồi chen vào giữa lúc đọc và lúc ghi: 409 conflict, không rút, không ghi nhật ký (giao diện tải lại rồi thấy license đã thu hồi)", async () => {
    // Thu hồi không tăng version và không đổi expires_at: chỉ điều kiện `revoked_at IS NULL` của câu UPDATE chặn được.
    const { db, state } = racingDb(`UPDATE licenses SET revoked_at = ${T0 + DAY}`);
    const { w, adminCall } = makeAdmin({ DB: db });
    await w.buy();
    const before = (await licenseRow())!;
    const path = `/admin/licenses/${before.id as string}/shorten`;
    expect(await adminCall(path, { body: { days: 1, note: "x", expected_expires_at: before.expires_at } })).toEqual({ status: 409, body: { error: "conflict" } });
    expect(state.raced).toBe(true);
    expect(await licenseRow()).toEqual({ ...before, revoked_at: T0 + DAY });
    expect(await auditCount("license_shortened_manually")).toBe(0);
    // Tải lại: license đã thu hồi.
    expect(await adminCall(path, { body: { days: 1, note: "x", expected_expires_at: before.expires_at } })).toEqual({ status: 409, body: { error: "license_revoked" } });
  });

  it.each([[undefined], [null], ["123"], [1.5], [-1], [0], [true], [[]], [{}], [2 ** 60]])(
    "expected_expires_at = %j (thiếu hay không phải số nguyên dương an toàn): 400 invalid_request (field expected_expires_at), không đổi gì, không ghi nhật ký",
    async (expected_expires_at) => {
      const { w, adminCall } = makeAdmin();
      await w.buy();
      const before = await licenseRow();
      const res = await adminCall(`/admin/licenses/${before!.id as string}/shorten`, { body: { days: 1, note: "x", expected_expires_at } });
      expect(res).toEqual({ status: 400, body: { error: "invalid_request", field: "expected_expires_at" } });
      expect(await licenseRow()).toEqual(before);
      expect(await adminAudits()).toEqual({ n: 0 });
    },
  );

  it("expected_expires_at khác hạn hiện tại (giao diện đã cũ): 409 conflict, hạn và version không đổi, không ghi nhật ký; order_code sai vẫn là 400 trước", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy(); // hạn T0 + 30 ngày
    const before = (await licenseRow())!;
    const path = `/admin/licenses/${before.id as string}/shorten`;
    for (const expected_expires_at of [T0 + 30 * DAY + 1, T0 + 30 * DAY - 1, T0 + 60 * DAY, T0]) {
      expect(await adminCall(path, { body: { days: 1, note: "x", expected_expires_at } }), String(expected_expires_at)).toEqual({ status: 409, body: { error: "conflict" } });
    }
    expect(await adminCall(path, { body: { days: 1, note: "x", order_code: 999_999, expected_expires_at: T0 + 60 * DAY } })).toEqual({
      status: 400,
      body: { error: "invalid_request", field: "order_code" },
    });
    expect(await licenseRow()).toEqual(before);
    expect(await auditCount("license_shortened_manually")).toBe(0);
    expect(await adminAudits()).toEqual({ n: 0 });
  });

  it("giao diện đã cũ và số ngày quá xa so với hạn thật: conflict đứng trước too_far, không lộ max_days tính từ dữ liệu khách chưa thấy", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy(); // hạn thật T0 + 30 ngày
    const before = (await licenseRow())!;
    const path = `/admin/licenses/${before.id as string}/shorten`;
    w.clock.now = T0 + 5 * DAY; // còn 25 ngày: 3650 ngày là quá xa so với hạn thật lẫn hạn cũ
    expect(await adminCall(path, { body: { days: 3650, note: "x", expected_expires_at: T0 + 10 * DAY } })).toEqual({ status: 409, body: { error: "conflict" } });
    // Cũng quá xa với hạn thật nhưng không quá xa với hạn giao diện đang thấy (T0 + 3700 ngày): vẫn conflict, không rút.
    expect(await adminCall(path, { body: { days: 26, note: "x", expected_expires_at: T0 + 3700 * DAY } })).toEqual({ status: 409, body: { error: "conflict" } });
    expect(await licenseRow()).toEqual(before);
    expect(await auditCount("license_shortened_manually")).toBe(0);
    // Hạn đúng thì mới thấy too_far kèm max_days.
    expect(await adminCall(path, { body: { days: 3650, note: "x", expected_expires_at: T0 + 30 * DAY } })).toEqual({
      status: 409,
      body: { error: "too_far", max_days: 24, expires_at: T0 + 30 * DAY },
    });
  });

  it("gửi hai lần cùng một yêu cầu (mạng lỗi rồi bấm lại): lần một 200, lần hai 409 conflict; hạn chỉ bị trừ một lần, một dòng nhật ký", async () => {
    const { w, adminCall, id, orderB } = await renewed();
    w.clock.now = T0 + 5 * DAY;
    const before = (await licenseRow())!; // hạn T0 + 60 ngày
    const path = `/admin/licenses/${id}/shorten`;
    // Rút 10 ngày (còn thừa chỗ): nếu lần hai được áp thì hạn mất thêm 10 ngày khách đã trả.
    const body = { days: 10, note: "hoàn một phần đơn B", order_code: orderB, expected_expires_at: T0 + 60 * DAY };
    expect(await adminCall(path, { body })).toEqual({ status: 200, body: { license_id: id, expires_at: T0 + 50 * DAY } });
    expect(await adminCall(path, { body })).toEqual({ status: 409, body: { error: "conflict" } });
    expect(await licenseRow()).toEqual({ ...before, expires_at: T0 + 50 * DAY, version: (before.version as number) + 1 });
    const logs = await shortened();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ order_code: orderB, detail: { days: 10, from_expires_at: T0 + 60 * DAY, expires_at: T0 + 50 * DAY } });
  });

  it("hạn trả về và hạn trong nhật ký đúng bằng expected_expires_at − days × 86400 (giá trị đã ghi vào license)", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy(); // hạn T0 + 30 ngày
    const id = (await licenseRow())!.id as string;
    const path = `/admin/licenses/${id}/shorten`;
    let expected = T0 + 30 * DAY;
    for (const days of [1, 7, 3]) {
      const res = await adminCall(path, { body: { days, note: "x", expected_expires_at: expected } });
      const written = expected - days * 86400;
      expect(res, `days ${days}`).toEqual({ status: 200, body: { license_id: id, expires_at: written } });
      expect(await licenseRow()).toMatchObject({ expires_at: written });
      expect((await shortened()).at(-1)!.detail).toMatchObject({ days, from_expires_at: expected, expires_at: written });
      expected = written;
    }
    expect(await auditCount("license_shortened_manually")).toBe(3);
  });

  it("sau khi rút, tra cứu license thấy hạn mới và dòng nhật ký rút ngắn hạn", async () => {
    const { w, adminCall, id, orderB } = await renewed();
    w.clock.now = T0 + 5 * DAY;
    expect((await adminCall(`/admin/licenses/${id}/shorten`, { body: { days: 30, note: "hoàn đơn B", order_code: orderB, expected_expires_at: T0 + 60 * DAY } })).status).toBe(200);
    const res = await adminCall("/admin/lookup", { body: { license_id: id } });
    const lic = (res.body.licenses as Record<string, unknown>[])[0]!;
    expect(lic.expires_at).toBe(T0 + 30 * DAY);
    expect((lic.audit as Record<string, unknown>[])[0]).toMatchObject({ action: "license_shortened_manually", order_code: orderB });
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
      error_reports: 0,
      support_conversations: 0,
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

  it("xóa luôn báo cáo lỗi của các máy thuộc email đó; giữ báo cáo của máy khác và của máy chỉ dùng thử", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ email: "erase@example.com" });
    const mine = await sha256Hex("d1");
    await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: mine, device_label: "MacBook của An" });
    const seed = async (id: string, device: string) => {
      await env.DB.batch(insertReportStatements(env.DB, await makeReport({ id, device_id_hash: device }), T0));
    };
    await seed("R-0000-0001", mine);
    await seed("R-0000-0002", mine);
    await seed("R-0000-0003", await sha256Hex("trial-only"));
    const res = await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa" } });
    expect(res.body).toEqual({ activations: 1, licenses: 1, orders: 1 });
    expect((await env.DB.prepare("SELECT id FROM error_reports ORDER BY id").all<{ id: string }>()).results).toEqual([{ id: "R-0000-0003" }]);
    expect((await env.DB.prepare("SELECT id FROM error_report_logs ORDER BY id").all<{ id: string }>()).results).toEqual([{ id: "R-0000-0003" }]);
    expect(JSON.parse(((await lastAudit()) as { detail: string }).detail)).toMatchObject({ error_reports: 2 });
  });

  it("xóa luôn cuộc chat hỗ trợ có email đó (cả tin nhắn); giữ cuộc chat của email khác và cuộc chat không để email", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy({ email: "erase@example.com" });
    const chat = async (code: string, email: string | null, messages: number) => {
      const r = await env.DB.prepare(
        `INSERT INTO support_conversations (code, token_hash, source, lang, email, created_at, last_activity_at) VALUES (?1, ?2, 'web', 'vi', ?3, ?4, ?4) RETURNING id`,
      )
        .bind(code, `hash-${code}`, email, T0)
        .first<{ id: number }>();
      for (let i = 0; i < messages; i++) {
        await env.DB.prepare("INSERT INTO support_messages (conversation_id, sender, text, created_at) VALUES (?, 'customer', ?, ?)")
          .bind(r?.id ?? 0, `tin ${i}`, T0)
          .run();
      }
    };
    await chat("AAA", "erase@example.com", 2);
    await chat("BBB", "erase@example.com", 1);
    await chat("CCC", "keep@example.com", 1);
    await chat("DDD", null, 1);
    const res = await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa" } });
    expect(res.body).toEqual({ activations: 0, licenses: 1, orders: 1 });
    expect((await env.DB.prepare("SELECT code FROM support_conversations ORDER BY code").all<{ code: string }>()).results).toEqual([
      { code: "CCC" },
      { code: "DDD" },
    ]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM support_messages").first()).toEqual({ n: 2 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM support_messages WHERE conversation_id NOT IN (SELECT id FROM support_conversations)").first()).toEqual({ n: 0 });
    expect(JSON.parse(((await lastAudit()) as { detail: string }).detail)).toMatchObject({ support_conversations: 2 });
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
