import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { b64urlDecode, sha256Hex } from "../src/crypto";
import { verifyTrialToken } from "../src/token";
import { parseTrialDays } from "../src/trial";
import { accountRow, makeAccount, makeAccountToken } from "./account-helpers";
import { resetDb } from "./db";
import vectors from "./vectors/token-v1.json";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

const device = async (n: number) => sha256Hex(`trial-device-${n}`);
const register = async (w: ReturnType<typeof makeWorld>, deviceIdHash: unknown, ip = "203.0.113.10") =>
  w.call("POST", "/v1/trial", { device_id_hash: deviceIdHash }, { "cf-connecting-ip": ip });
const trialRow = (deviceIdHash: string) =>
  env.DB.prepare("SELECT started_at, ends_at, last_seen_at FROM trials WHERE device_id_hash = ?").bind(deviceIdHash).first();

describe("POST /v1/trial (spec 2026-10-07 §3.1)", () => {
  it("máy mới: ghi ngày bắt đầu theo giờ server, hết hạn sau TRIAL_DAYS (10) ngày, trả token dùng thử đã ký", async () => {
    const w = makeWorld();
    const d = await device(1);
    const res = await register(w, d);
    expect(res).toMatchObject({
      status: 200,
      body: { token: expect.stringMatching(/^v1\./), started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 },
    });
    expect(await trialRow(d)).toEqual({ started_at: T0, ends_at: T0 + 10 * DAY, last_seen_at: T0 });
    expect(await verifyTrialToken(res.body.token as string, vectors.public_keys, { deviceIdHash: d })).toEqual({
      ok: true,
      claims: { typ: "trial", kid: "test-1", device_id_hash: d, started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 },
    });
  });

  it("gọi lại (cài lại app): giữ started_at và ends_at, chỉ cập nhật last_seen_at; token mới có issued_at mới", async () => {
    const w = makeWorld();
    const d = await device(1);
    await register(w, d);
    w.clock.now = T0 + 3 * DAY;
    const again = await register(w, d);
    expect(again.body).toMatchObject({ started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 + 3 * DAY });
    expect(await trialRow(d)).toEqual({ started_at: T0, ends_at: T0 + 10 * DAY, last_seen_at: T0 + 3 * DAY });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM trials").first()).toEqual({ n: 1 });
  });

  it("dùng thử đã hết vẫn trả 200 với ends_at cũ (app cần ends_at để báo)", async () => {
    const w = makeWorld();
    const d = await device(1);
    await register(w, d);
    w.clock.now = T0 + 40 * DAY;
    expect(await register(w, d)).toMatchObject({ status: 200, body: { started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 + 40 * DAY } });
  });

  it("máy khác có dùng thử riêng", async () => {
    const w = makeWorld();
    await register(w, await device(1));
    w.clock.now = T0 + DAY;
    expect((await register(w, await device(2))).body).toMatchObject({ started_at: T0 + DAY, ends_at: T0 + 11 * DAY });
  });

  it("nhiều request cùng lúc của một máy: một dòng, cùng started_at", async () => {
    const w = makeWorld();
    const d = await device(1);
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => register(w, d, `198.51.100.${n}`)));
    expect(new Set(results.map((r) => r.body.started_at))).toEqual(new Set([T0]));
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM trials").first()).toEqual({ n: 1 });
  });

  it("đổi TRIAL_DAYS chỉ áp cho máy đăng ký sau đó", async () => {
    const d1 = await device(1);
    await register(makeWorld(), d1);
    const w = makeWorld({ TRIAL_DAYS: 30 });
    expect((await register(w, d1)).body).toMatchObject({ ends_at: T0 + 10 * DAY });
    expect((await register(w, await device(2))).body).toMatchObject({ ends_at: T0 + 30 * DAY });
  });

  it.each([
    ["thiếu", undefined],
    ["chữ hoa", "A".repeat(64)],
    ["ngắn", "a".repeat(63)],
    ["không phải chuỗi", 123],
  ])("device_id_hash sai (%s) thì 400, không ghi gì", async (_why, value) => {
    const res = await register(makeWorld(), value);
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_request", field: "device_id_hash" } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM trials").first()).toEqual({ n: 0 });
  });

  it("body không phải JSON thì 400", async () => {
    const res = await makeWorld().call("POST", "/v1/trial", "không phải json");
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_request" } });
  });

  it.each([
    ["thiếu", undefined],
    ["bằng 0", 0],
    ["quá 366", 367],
    ["số lẻ", 10.5],
    ["chuỗi", "10"],
  ])("TRIAL_DAYS sai (%s) thì 503 trial_not_configured, không ghi gì", async (_why, value) => {
    const res = await register(makeWorld({ TRIAL_DAYS: value }), await device(1));
    expect(res).toMatchObject({ status: 503, body: { error: "trial_not_configured" } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM trials").first()).toEqual({ n: 0 });
  });

  it("tối đa 10 lần mỗi giờ mỗi IP, kể cả request sai; IP khác không bị ảnh hưởng; không tính vào bộ đếm thất bại", async () => {
    const w = makeWorld();
    const d = await device(1);
    for (let i = 0; i < 5; i++) expect((await register(w, d)).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await register(w, "sai")).status).toBe(400);
    const res = await register(w, d);
    expect(res).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(res.headers.get("retry-after")).toBe("3600");
    expect((await register(w, d, "198.51.100.7")).status).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE bucket LIKE 'failure_ip:%'").first()).toEqual({ n: 0 });
  });
});

describe("parseTrialDays", () => {
  it("nhận số nguyên 1–366", () => {
    expect([1, 10, 366].map(parseTrialDays)).toEqual([1, 10, 366]);
    expect([0, 367, -1, 1.5, "10", null, undefined].map(parseTrialDays)).toEqual([null, null, null, null, null, null, null]);
  });
});

// --- Dùng thử theo tài khoản (spec 2026-11-05 §5.3, §5.4) ---------------------------------------------------------------------------

const registerAs = (w: ReturnType<typeof makeWorld>, deviceIdHash: string, bearer: Record<string, string>, ip = "203.0.113.10") =>
  w.call("POST", "/v1/trial", { device_id_hash: deviceIdHash }, { "cf-connecting-ip": ip, ...bearer });
const trialFull = (deviceIdHash: string) =>
  env.DB.prepare("SELECT started_at, ends_at, last_seen_at, account_id FROM trials WHERE device_id_hash = ?").bind(deviceIdHash).first();
const countTrials = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM trials").first<{ n: number }>())?.n;

describe("POST /v1/trial không Authorization và ACCOUNT_REQUIRED (spec 2026-11-05 §5.3 nhánh 1, §5.4)", () => {
  it("không Bearer, ACCOUNT_REQUIRED off → như cũ", async () => {
    const w = makeWorld({ ACCOUNT_REQUIRED: "off" });
    const d = await device(1);
    expect(await register(w, d)).toMatchObject({ status: 200, body: { started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 } });
    expect(await trialFull(d)).toEqual({ started_at: T0, ends_at: T0 + 10 * DAY, last_seen_at: T0, account_id: null });
  });

  it("ACCOUNT_REQUIRED thiếu hay giá trị khác 'on' → như cũ", async () => {
    for (const value of [undefined, "", "ON", "true", "1"]) {
      const w = makeWorld(value === undefined ? {} : { ACCOUNT_REQUIRED: value });
      expect((await register(w, await device(value === undefined ? 90 : value.length + 91))).status).toBe(200);
    }
  });

  it("không Bearer, ACCOUNT_REQUIRED on, máy đã có dòng → vẫn nhận token (y hệt cũ)", async () => {
    const d = await device(1);
    await register(makeWorld(), d);
    const w = makeWorld({ ACCOUNT_REQUIRED: "on" });
    w.clock.now = T0 + 3 * DAY;
    const res = await register(w, d);
    expect(res).toMatchObject({ status: 200, body: { started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 + 3 * DAY } });
    expect(await verifyTrialToken(res.body.token as string, vectors.public_keys, { deviceIdHash: d })).toMatchObject({ ok: true });
    expect(await trialFull(d)).toEqual({ started_at: T0, ends_at: T0 + 10 * DAY, last_seen_at: T0 + 3 * DAY, account_id: null });
  });

  it("không Bearer, on, máy mới → 401 account_required, không ghi gì", async () => {
    const w = makeWorld({ ACCOUNT_REQUIRED: "on" });
    const res = await register(w, await device(1));
    expect(res).toMatchObject({ status: 401, body: { error: "account_required" } });
    expect(res.body.token).toBeUndefined();
    expect(await countTrials()).toBe(0);
  });

  it("on nhưng đăng nhập không dùng được (LOGIN_GATE=off) → máy mới vẫn nhận dùng thử như cũ, không ai bị khóa", async () => {
    const w = makeWorld({ ACCOUNT_REQUIRED: "on", LOGIN_GATE: "off" });
    expect(await register(w, await device(1))).toMatchObject({ status: 200, body: { started_at: T0 } });
    expect(await countTrials()).toBe(1);
  });

  it("on nhưng thiếu cấu hình Google (Deps.google null) → máy mới vẫn nhận dùng thử như cũ", async () => {
    const w = makeWorld({ ACCOUNT_REQUIRED: "on" });
    w.deps.google = null;
    expect(await register(w, await device(1))).toMatchObject({ status: 200, body: { started_at: T0 } });
    expect(await countTrials()).toBe(1);
  });

  it("trial_not_configured và device_id_hash sai vẫn đi trước account_required", async () => {
    expect(await register(makeWorld({ ACCOUNT_REQUIRED: "on", TRIAL_DAYS: 0 }), await device(1))).toMatchObject({ status: 503, body: { error: "trial_not_configured" } });
    expect(await register(makeWorld({ ACCOUNT_REQUIRED: "on" }), "sai")).toMatchObject({ status: 400, body: { error: "invalid_request" } });
  });
});

describe("POST /v1/trial có Bearer token tài khoản (spec 2026-11-05 §5.3 nhánh 2, 3, 4)", () => {
  it("Bearer, máy đã có dòng → trials.account_id được đặt, started_at và ends_at không đổi, accounts.trial_* được ghi nếu NULL", async () => {
    const w = makeWorld();
    const d = await device(1);
    await register(w, d);
    w.clock.now = T0 + 2 * DAY;
    const acc = await makeAccount(w, d);
    const res = await registerAs(w, d, acc.bearer);
    expect(res).toMatchObject({ status: 200, body: { started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 + 2 * DAY } });
    expect(await trialFull(d)).toEqual({ started_at: T0, ends_at: T0 + 10 * DAY, last_seen_at: T0 + 2 * DAY, account_id: acc.accountId });
    expect(await accountRow(acc.accountId)).toMatchObject({ trial_started_at: T0, trial_ends_at: T0 + 10 * DAY });
  });

  it("Bearer, máy đã có dòng, tài khoản đã có mốc dùng thử → giữ mốc cũ của tài khoản (không bao giờ dời)", async () => {
    const w = makeWorld();
    const d = await device(1);
    await register(w, d);
    const acc = await makeAccount(w, d, { trialStartedAt: T0 - 20 * DAY, trialEndsAt: T0 - 10 * DAY });
    const res = await registerAs(w, d, acc.bearer);
    expect(res.body).toMatchObject({ started_at: T0, ends_at: T0 + 10 * DAY });
    expect(await accountRow(acc.accountId)).toMatchObject({ trial_started_at: T0 - 20 * DAY, trial_ends_at: T0 - 10 * DAY });
    expect(await trialFull(d)).toMatchObject({ account_id: acc.accountId });
  });

  it("Bearer, máy đã có dòng gắn tài khoản khác → giữ nguyên", async () => {
    const w = makeWorld();
    const d = await device(1);
    await register(w, d);
    const a = await makeAccount(w, d, { sub: "sub-a" });
    await registerAs(w, d, a.bearer);
    w.clock.now = T0 + DAY;
    const b = await makeAccount(w, d, { sub: "sub-b", email: "b@example.com" });
    const res = await registerAs(w, d, b.bearer);
    expect(res).toMatchObject({ status: 200, body: { started_at: T0, ends_at: T0 + 10 * DAY } });
    expect(await trialFull(d)).toEqual({ started_at: T0, ends_at: T0 + 10 * DAY, last_seen_at: T0 + DAY, account_id: a.accountId });
    expect(await countTrials()).toBe(1);
  });

  it("Bearer, máy mới, tài khoản chưa dùng thử → tạo dòng TRIAL_DAYS và ghi mốc vào accounts", async () => {
    const w = makeWorld({ TRIAL_DAYS: 7 });
    const d = await device(1);
    const acc = await makeAccount(w, d);
    const res = await registerAs(w, d, acc.bearer);
    expect(res).toMatchObject({ status: 200, body: { started_at: T0, ends_at: T0 + 7 * DAY, issued_at: T0 } });
    expect(await trialFull(d)).toEqual({ started_at: T0, ends_at: T0 + 7 * DAY, last_seen_at: T0, account_id: acc.accountId });
    expect(await accountRow(acc.accountId)).toMatchObject({ trial_started_at: T0, trial_ends_at: T0 + 7 * DAY });
  });

  it("Bearer, máy mới, tài khoản đã dùng thử ở máy khác → dòng mới dùng đúng started_at và ends_at của tài khoản", async () => {
    const w = makeWorld();
    const d1 = await device(1);
    const acc = await makeAccount(w, d1);
    await registerAs(w, d1, acc.bearer);
    w.clock.now = T0 + 4 * DAY;
    const d2 = await device(2);
    const onD2 = await makeAccountToken(w, acc.accountId, d2);
    const res = await registerAs(w, d2, onD2);
    expect(res).toMatchObject({ status: 200, body: { started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 + 4 * DAY } });
    expect(await trialFull(d2)).toEqual({ started_at: T0, ends_at: T0 + 10 * DAY, last_seen_at: T0 + 4 * DAY, account_id: acc.accountId });
    expect(await accountRow(acc.accountId)).toMatchObject({ trial_started_at: T0, trial_ends_at: T0 + 10 * DAY });
  });

  it("Bearer, máy mới, tài khoản đã dùng thử và đã hết hạn → máy mới nhận dòng đã hết hạn, không có thêm 10 ngày", async () => {
    const w = makeWorld();
    const acc = await makeAccount(w, await device(1), { trialStartedAt: T0 - 30 * DAY, trialEndsAt: T0 - 20 * DAY });
    const res = await registerAs(w, await device(1), acc.bearer);
    expect(res).toMatchObject({ status: 200, body: { started_at: T0 - 30 * DAY, ends_at: T0 - 20 * DAY, issued_at: T0 } });
    expect(await accountRow(acc.accountId)).toMatchObject({ trial_started_at: T0 - 30 * DAY, trial_ends_at: T0 - 20 * DAY });
  });

  it("xóa tài khoản rồi đăng nhập lại cùng google_sub trên máy mới → không có thêm 10 ngày", async () => {
    const w = makeWorld();
    const d1 = await device(1);
    const acc = await makeAccount(w, d1);
    await registerAs(w, d1, acc.bearer);
    expect((await w.call("POST", "/v1/account/delete", {}, acc.bearer)).status).toBe(200);
    // Đăng nhập lại: khôi phục đúng dòng cũ (giữ id và mốc), token mới trên máy khác.
    await env.DB.prepare("UPDATE accounts SET deleted_at = NULL, email = 'nguoi.dung@example.com' WHERE id = ?").bind(acc.accountId).run();
    w.clock.now = T0 + 15 * DAY;
    const d2 = await device(2);
    const res = await registerAs(w, d2, await makeAccountToken(w, acc.accountId, d2));
    expect(res.body).toMatchObject({ started_at: T0, ends_at: T0 + 10 * DAY });
  });

  it("token dùng thử trả về vẫn đúng 5 trường, typ trial", async () => {
    const w = makeWorld();
    const d = await device(1);
    const acc = await makeAccount(w, d);
    const res = await registerAs(w, d, acc.bearer);
    const token = res.body.token as string;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(token.split(".")[1]!))) as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["typ", "kid", "device_id_hash", "started_at", "ends_at", "issued_at"]);
    expect(payload.typ).toBe("trial");
    expect(await verifyTrialToken(token, vectors.public_keys, { deviceIdHash: d })).toMatchObject({ ok: true });
    expect(Object.keys(res.body).sort()).toEqual(["ends_at", "issued_at", "started_at", "token"]);
  });

  it("Bearer hợp lệ, ACCOUNT_REQUIRED on, máy mới → 200 (đây là đường được phép)", async () => {
    const w = makeWorld({ ACCOUNT_REQUIRED: "on" });
    const d = await device(1);
    const acc = await makeAccount(w, d);
    expect((await registerAs(w, d, acc.bearer)).status).toBe(200);
    expect(await countTrials()).toBe(1);
  });

  it("máy đã có dòng do Bearer, rồi bản cũ gọi không Bearer → nhận lại đúng dòng đó, giữ account_id", async () => {
    const w = makeWorld({ ACCOUNT_REQUIRED: "on" });
    const d = await device(1);
    const acc = await makeAccount(w, d);
    await registerAs(w, d, acc.bearer);
    w.clock.now = T0 + DAY;
    expect(await register(w, d)).toMatchObject({ status: 200, body: { started_at: T0, ends_at: T0 + 10 * DAY } });
    expect(await trialFull(d)).toMatchObject({ account_id: acc.accountId, last_seen_at: T0 + DAY });
  });

  it("Bearer sai → 401 invalid_token, không ghi gì (kể cả máy đã có dòng)", async () => {
    const w = makeWorld();
    const d = await device(1);
    await register(w, d);
    const acc = await makeAccount(w, d);
    const dNew = await device(2);
    const cases: Record<string, string>[] = [
      { authorization: "Bearer rac" },
      { authorization: "Basic abc" },
      { authorization: "Bearer " },
      { authorization: `Bearer ${acc.token.slice(0, -4)}AAAA` },
    ];
    for (const h of cases) {
      expect(await registerAs(w, d, h)).toMatchObject({ status: 401, body: { error: "invalid_token" } });
      expect(await registerAs(w, dNew, h)).toMatchObject({ status: 401, body: { error: "invalid_token" } });
    }
    expect(await countTrials()).toBe(1);
    expect(await trialFull(d)).toMatchObject({ account_id: null, last_seen_at: T0 });
    expect(await accountRow(acc.accountId)).toMatchObject({ trial_started_at: null });
  });

  it("token của máy khác → 401 invalid_token (wrong_device), không ghi gì", async () => {
    const w = makeWorld();
    const acc = await makeAccount(w, await device(1));
    const res = await registerAs(w, await device(2), acc.bearer);
    expect(res).toMatchObject({ status: 401, body: { error: "invalid_token", reason: "wrong_device" } });
    expect(await countTrials()).toBe(0);
  });

  it("tài khoản đã xóa → 401 invalid_token", async () => {
    const w = makeWorld();
    const d = await device(1);
    const acc = await makeAccount(w, d);
    await env.DB.prepare("UPDATE accounts SET deleted_at = ?, email = NULL WHERE id = ?").bind(T0, acc.accountId).run();
    expect(await registerAs(w, d, acc.bearer)).toMatchObject({ status: 401, body: { error: "invalid_token" } });
    expect(await countTrials()).toBe(0);
  });

  it("thứ tự kiểm: device_id_hash sai (400) và trial_not_configured (503) đi trước token", async () => {
    const w = makeWorld();
    const acc = await makeAccount(w, await device(1));
    expect(await registerAs(w, "sai", acc.bearer)).toMatchObject({ status: 400, body: { field: "device_id_hash" } });
    expect(await registerAs(makeWorld({ TRIAL_DAYS: 0 }), await device(1), acc.bearer)).toMatchObject({ status: 503, body: { error: "trial_not_configured" } });
  });

  it("nhiều request cùng lúc của cùng tài khoản trên hai máy mới → hai dòng, cùng mốc của tài khoản", async () => {
    const w = makeWorld();
    const acc = await makeAccount(w, await device(1));
    const d2 = await device(2);
    const results = await Promise.all([registerAs(w, await device(1), acc.bearer), registerAs(w, d2, await makeAccountToken(w, acc.accountId, d2), "198.51.100.2")]);
    expect(new Set(results.map((r) => `${r.body.started_at}-${r.body.ends_at}`))).toEqual(new Set([`${T0}-${T0 + 10 * DAY}`]));
    expect(await countTrials()).toBe(2);
  });
});
