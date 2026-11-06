// Route tài khoản (spec 2026-11-05 §5.1, §5.5, §5.6): link-license và delete. Token tài khoản dựng thẳng trong D1 (account-helpers.ts).
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { b64urlEncode, sha256, sha256Hex } from "../src/crypto";
import { LIMITS } from "../src/ratelimit";
import { importSigningKey, signAccountToken } from "../src/token";
import { accountRow, makeAccount } from "./account-helpers";
import { resetDb } from "./db";
import { testSigningJwk } from "./keys";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

type World = ReturnType<typeof makeWorld>;
const LINK = "/v1/account/link-license";
const DELETE = "/v1/account/delete";
const device = (n: number) => sha256Hex(`account-device-${n}`);
const UNKNOWN_KEY = "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5";
const licenseOf = (key: string) =>
  env.DB.prepare("SELECT id, account_id FROM licenses WHERE license_key = ?").bind(key.replace(/-/g, "")).first<{ id: string; account_id: string | null }>();

/** Mua một license và kích hoạt trên máy `n`. */
async function licensed(w: World, n = 1) {
  const { licenseKey } = await w.buy();
  const deviceIdHash = await device(n);
  const res = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: deviceIdHash, device_label: `Máy ${n}` });
  if (res.status !== 200) throw new Error(`activate ${res.status} ${JSON.stringify(res.body)}`);
  return { licenseKey, deviceIdHash, activationId: res.body.activation_id as string };
}

describe("POST /v1/account/link-license", () => {
  it("link-license thành công đặt licenses.account_id", async () => {
    const w = makeWorld();
    const l = await licensed(w);
    const acc = await makeAccount(w, l.deviceIdHash);
    const res = await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, acc.bearer);
    expect(res).toMatchObject({ status: 200, body: { ok: true } });
    expect((await licenseOf(l.licenseKey))?.account_id).toBe(acc.accountId);
  });

  it("key gõ có gạch nối và chữ thường vẫn khớp (chuẩn hóa như các route license khác)", async () => {
    const w = makeWorld();
    const l = await licensed(w);
    const acc = await makeAccount(w, l.deviceIdHash);
    const res = await w.call("POST", LINK, { key: l.licenseKey.toLowerCase(), activation_id: l.activationId }, acc.bearer);
    expect(res.status).toBe(200);
    expect((await licenseOf(l.licenseKey))?.account_id).toBe(acc.accountId);
  });

  it("gắn lại cùng tài khoản idempotent", async () => {
    const w = makeWorld();
    const l = await licensed(w);
    const acc = await makeAccount(w, l.deviceIdHash);
    for (let i = 0; i < 2; i++) {
      expect(await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, acc.bearer)).toMatchObject({ status: 200, body: { ok: true } });
    }
    expect((await licenseOf(l.licenseKey))?.account_id).toBe(acc.accountId);
  });

  it("license đã gắn tài khoản khác → 409 license_linked_other_account, không đổi", async () => {
    const w = makeWorld();
    const l = await licensed(w);
    const a = await makeAccount(w, l.deviceIdHash, { sub: "sub-a" });
    const b = await makeAccount(w, l.deviceIdHash, { sub: "sub-b", email: "b@example.com" });
    expect((await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, a.bearer)).status).toBe(200);
    const res = await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, b.bearer);
    expect(res).toMatchObject({ status: 409, body: { error: "license_linked_other_account" } });
    expect((await licenseOf(l.licenseKey))?.account_id).toBe(a.accountId);
  });

  it("activation đã gỡ → activation_not_found, không gắn, không tính thất bại", async () => {
    const w = makeWorld();
    const l = await licensed(w);
    const acc = await makeAccount(w, l.deviceIdHash);
    await w.call("POST", "/v1/licenses/deactivate", { key: l.licenseKey, activation_id: l.activationId });
    const res = await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, acc.bearer);
    expect(res).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
    expect((await licenseOf(l.licenseKey))?.account_id).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE bucket LIKE 'failure_ip:%'").first()).toEqual({ n: 0 });
  });

  it("activation lạ (không có trong license) → 404 activation_not_found và tính vào ngưỡng thất bại", async () => {
    const w = makeWorld();
    const l = await licensed(w);
    const acc = await makeAccount(w, l.deviceIdHash);
    const res = await w.call("POST", LINK, { key: l.licenseKey, activation_id: crypto.randomUUID() }, acc.bearer);
    expect(res).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
    expect((await licenseOf(l.licenseKey))?.account_id).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE bucket LIKE 'failure_ip:%'").first()).toEqual({ n: 1 });
  });

  it("key không có trong D1 → 404 invalid_key; key sai định dạng → 400", async () => {
    const w = makeWorld();
    const l = await licensed(w);
    const acc = await makeAccount(w, l.deviceIdHash);
    expect(await w.call("POST", LINK, { key: UNKNOWN_KEY, activation_id: l.activationId }, acc.bearer)).toMatchObject({ status: 404, body: { error: "invalid_key" } });
    expect(await w.call("POST", LINK, { key: "abc", activation_id: l.activationId }, acc.bearer)).toMatchObject({
      status: 400,
      body: { error: "invalid_request", field: "key" },
    });
    expect(await w.call("POST", LINK, { key: l.licenseKey, activation_id: "không-phải-uuid" }, acc.bearer)).toMatchObject({
      status: 400,
      body: { error: "invalid_request", field: "activation_id" },
    });
  });

  it("activation của máy khác → 401 invalid_token (wrong_device), không gắn", async () => {
    const w = makeWorld();
    const l = await licensed(w, 1);
    const acc = await makeAccount(w, await device(2));
    const res = await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, acc.bearer);
    expect(res).toMatchObject({ status: 401, body: { error: "invalid_token", reason: "wrong_device" } });
    expect((await licenseOf(l.licenseKey))?.account_id).toBeNull();
  });

  it.each([
    ["thiếu header Authorization", undefined],
    ["không phải Bearer", "Basic abc"],
    ["token rác", "Bearer rac"],
    ["token cùng dạng nhưng chữ ký sai", "TAMPER"],
  ])("%s → 401 invalid_token", async (_why, header) => {
    const w = makeWorld();
    const l = await licensed(w);
    const acc = await makeAccount(w, l.deviceIdHash);
    const headers: Record<string, string> = {};
    if (header === "TAMPER") headers.authorization = `Bearer ${acc.token.slice(0, -4)}AAAA`;
    else if (header) headers.authorization = header;
    const res = await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, headers);
    expect(res).toMatchObject({ status: 401, body: { error: "invalid_token" } });
    expect((await licenseOf(l.licenseKey))?.account_id).toBeNull();
  });

  it("token loại khác (token bản quyền hay dùng thử) bị từ chối như token hỏng", async () => {
    const w = makeWorld();
    const l = await licensed(w);
    const trial = await w.call("POST", "/v1/trial", { device_id_hash: l.deviceIdHash });
    const res = await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, { authorization: `Bearer ${trial.body.token as string}` });
    expect(res).toMatchObject({ status: 401, body: { error: "invalid_token" } });
  });

  it(`tối đa ${LIMITS.account_ip} lần mỗi giờ mỗi IP (kể cả lần sai); IP khác không bị ảnh hưởng`, async () => {
    const w = makeWorld();
    const l = await licensed(w);
    const acc = await makeAccount(w, l.deviceIdHash);
    for (let i = 0; i < LIMITS.account_ip; i++) {
      expect((await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, acc.bearer)).status).toBe(200);
    }
    const res = await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, acc.bearer);
    expect(res).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(res.headers.get("retry-after")).toBe("3600");
    expect((await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, { ...acc.bearer, "cf-connecting-ip": "198.51.100.9" })).status).toBe(200);
  });
});

describe("khóa ký token tài khoản (token không hết hạn nên phải sống qua việc đổi khóa)", () => {
  const signedBy = async (w: World, kid: string, accountId: string, d: string) =>
    signAccountToken(await importSigningKey(await testSigningJwk(kid)), { typ: "account", kid, account_id: accountId, device_id_hash: d, issued_at: T0 });
  const slots = async () => ({ TOKEN_SIGNING_SLOT: "a", TOKEN_SIGNING_KEY_A: await testSigningJwk("test-1"), TOKEN_SIGNING_KEY_B: await testSigningJwk("test-2") });

  it("token ký bằng khóa ở ô còn lại (đã đổi TOKEN_SIGNING_SLOT sau khi cấp) vẫn được chấp nhận", async () => {
    const w = makeWorld(await slots());
    const d = await device(1);
    const acc = await makeAccount(w, d);
    const token = await signedBy(w, "test-2", acc.accountId, d);
    expect((await w.call("POST", DELETE, {}, { authorization: `Bearer ${token}` })).status).toBe(200);
    expect((await accountRow(acc.accountId))?.deleted_at).toBe(T0);
  });

  it("kid không thuộc ô nào → 401 invalid_token", async () => {
    const w = makeWorld(await slots());
    const d = await device(1);
    const acc = await makeAccount(w, d);
    const token = await signedBy(w, "test-1", acc.accountId, d);
    const [head, payload, sig] = token.split(".");
    const forged = JSON.stringify({ ...JSON.parse(atob(payload!.replace(/-/g, "+").replace(/_/g, "/"))), kid: "test-9" });
    const bad = `${head}.${btoa(forged).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.${sig}`;
    expect(await w.call("POST", DELETE, {}, { authorization: `Bearer ${bad}` })).toMatchObject({ status: 401, body: { error: "invalid_token" } });
    expect((await accountRow(acc.accountId))?.deleted_at).toBeNull();
  });
});

describe("POST /v1/account/delete", () => {
  it("delete đặt email NULL, deleted_at, account_id của trials và licenses về NULL, giữ google_sub và trial_started_at, trial_ends_at", async () => {
    const w = makeWorld();
    const l = await licensed(w);
    const other = await makeAccount(w, await device(9), { sub: "sub-khac" });
    const acc = await makeAccount(w, l.deviceIdHash, { sub: "sub-xoa", trialStartedAt: T0 - DAY, trialEndsAt: T0 + 9 * DAY });
    await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, acc.bearer);
    await env.DB.prepare("INSERT INTO trials (device_id_hash, started_at, ends_at, last_seen_at, account_id) VALUES (?1, ?2, ?3, ?2, ?4)")
      .bind(l.deviceIdHash, T0 - DAY, T0 + 9 * DAY, acc.accountId)
      .run();
    await env.DB.prepare("INSERT INTO trials (device_id_hash, started_at, ends_at, last_seen_at, account_id) VALUES (?1, ?2, ?3, ?2, ?4)")
      .bind(await device(9), T0, T0 + 10 * DAY, other.accountId)
      .run();
    w.clock.now = T0 + 5;

    const res = await w.call("POST", DELETE, {}, acc.bearer);
    expect(res).toMatchObject({ status: 200, body: { ok: true } });
    expect(await accountRow(acc.accountId)).toMatchObject({
      google_sub: "sub-xoa",
      email: null,
      deleted_at: T0 + 5,
      trial_started_at: T0 - DAY,
      trial_ends_at: T0 + 9 * DAY,
    });
    expect((await licenseOf(l.licenseKey))?.account_id).toBeNull();
    // Dòng trials giữ nguyên mốc, chỉ mất liên kết; tài khoản khác không bị đụng tới.
    expect(await env.DB.prepare("SELECT started_at, ends_at, account_id FROM trials WHERE device_id_hash = ?").bind(l.deviceIdHash).first()).toEqual({
      started_at: T0 - DAY,
      ends_at: T0 + 9 * DAY,
      account_id: null,
    });
    expect((await env.DB.prepare("SELECT account_id FROM trials WHERE device_id_hash = ?").bind(await device(9)).first<{ account_id: string }>())?.account_id).toBe(other.accountId);
    expect((await accountRow(other.accountId))?.deleted_at).toBeNull();
  });

  it("token của tài khoản đã xóa → 401 (delete lần hai, link-license, trial)", async () => {
    const w = makeWorld();
    const l = await licensed(w);
    const acc = await makeAccount(w, l.deviceIdHash);
    expect((await w.call("POST", DELETE, {}, acc.bearer)).status).toBe(200);
    expect(await w.call("POST", DELETE, {}, acc.bearer)).toMatchObject({ status: 401, body: { error: "invalid_token" } });
    expect(await w.call("POST", LINK, { key: l.licenseKey, activation_id: l.activationId }, acc.bearer)).toMatchObject({ status: 401, body: { error: "invalid_token" } });
    expect(await w.call("POST", "/v1/trial", { device_id_hash: l.deviceIdHash }, acc.bearer)).toMatchObject({ status: 401, body: { error: "invalid_token" } });
  });

  it("body không bắt buộc; có device_id_hash thì token phải gắn đúng máy đó", async () => {
    const w = makeWorld();
    const acc = await makeAccount(w, await device(1));
    expect(await w.call("POST", DELETE, { device_id_hash: await device(2) }, acc.bearer)).toMatchObject({ status: 401, body: { error: "invalid_token", reason: "wrong_device" } });
    expect(await w.call("POST", DELETE, { device_id_hash: "sai" }, acc.bearer)).toMatchObject({ status: 400, body: { field: "device_id_hash" } });
    expect((await accountRow(acc.accountId))?.deleted_at).toBeNull();
    expect((await w.call("POST", DELETE, { device_id_hash: await device(1) }, acc.bearer)).status).toBe(200);
  });

  it("thiếu Authorization → 401, không xóa gì", async () => {
    const w = makeWorld();
    const acc = await makeAccount(w, await device(1));
    expect(await w.call("POST", DELETE, {})).toMatchObject({ status: 401, body: { error: "invalid_token" } });
    expect((await accountRow(acc.accountId))?.deleted_at).toBeNull();
  });

  it("đăng nhập lại cùng google_sub sau khi xóa khôi phục dòng cũ, giữ created_at và mốc dùng thử", async () => {
    const w = makeWorld();
    const d = await device(1);
    const verifier = b64urlEncode(new Uint8Array(32).fill(7));
    const login = async () => {
      const start = await w.call("POST", "/v1/auth/google/start", {
        device_id_hash: d,
        challenge: b64urlEncode(await sha256(verifier)),
        consent: true,
        lang: "vi",
      });
      const state = w.google.authUrls.at(-1)!.state;
      expect((await w.call("GET", `/v1/auth/google/callback?${new URLSearchParams({ code: "code", state })}`)).status).toBe(200);
      const poll = await w.call("POST", "/v1/auth/poll", { login_id: start.body.login_id, verifier });
      return poll.body;
    };
    w.google.identity = { sub: "google-sub-xoa-roi-dang-nhap-lai", email: "Nguoi.Dung@Example.com" };
    const first = await login();
    expect(first.status).toBe("done");
    const before = (await env.DB.prepare("SELECT * FROM accounts").first<Record<string, unknown>>())!;
    await env.DB.prepare("UPDATE accounts SET trial_started_at = ?, trial_ends_at = ? WHERE id = ?").bind(T0, T0 + 10 * DAY, before.id).run();

    w.clock.now = T0 + 3 * DAY;
    expect((await w.call("POST", DELETE, {}, { authorization: `Bearer ${first.token as string}` })).status).toBe(200);
    expect(await accountRow(before.id as string)).toMatchObject({ email: null, deleted_at: T0 + 3 * DAY });

    w.clock.now = T0 + 4 * DAY;
    w.google.identity = { sub: "google-sub-xoa-roi-dang-nhap-lai", email: "moi@example.com" };
    const second = await login();
    expect(second).toMatchObject({ status: "done", email: "moi@example.com" });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM accounts").first<{ n: number }>())?.n).toBe(1);
    expect(await accountRow(before.id as string)).toMatchObject({
      id: before.id,
      google_sub: "google-sub-xoa-roi-dang-nhap-lai",
      email: "moi@example.com",
      deleted_at: null,
      created_at: before.created_at,
      trial_started_at: T0,
      trial_ends_at: T0 + 10 * DAY,
    });
  });
});
