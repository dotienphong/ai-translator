import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto";
import { verifyTrialToken } from "../src/token";
import { parseTrialDays } from "../src/trial";
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
