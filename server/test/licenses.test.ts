import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto";
import { verifyToken } from "../src/token";
import { gateDb, resetDb, wrapDb } from "./db";
import vectors from "./vectors/token-v1.json";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

const device = async (n: number) => sha256Hex(`device-${n}`);
/** Key đúng định dạng (ký tự kiểm tra đúng) nhưng không có trong D1. */
const UNKNOWN_KEY = "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5";

async function setup(plan = "monthly") {
  const w = makeWorld();
  const { licenseKey } = await w.buy({ plan });
  const activate = async (n: number, ip = `198.51.100.${n}`, extra: Record<string, unknown> = {}) =>
    w.call(
      "POST",
      "/v1/licenses/activate",
      { key: licenseKey, device_id_hash: await device(n), device_label: `Máy ${n}`, ...extra },
      { "cf-connecting-ip": ip },
    );
  /** Kích hoạt sau khi người dùng xác nhận "Vẫn kích hoạt trên máy này" (spec 2026-10-07 §4.2). */
  const activateAnyway = (n: number) => activate(n, `198.51.100.${n}`, { allow_conflict: true });
  const deactivate = (activationId: string) =>
    w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: activationId });
  return { w, licenseKey, activate, activateAnyway, deactivate };
}

describe("activate", () => {
  it("trả token Ed25519 kiểm được bằng khóa công khai, đúng các trường của §6.8", async () => {
    const { w, activate } = await setup();
    w.clock.now = T0 + 60;
    const res = await activate(1);
    expect(res.status).toBe(200);
    const lic = await env.DB.prepare("SELECT id, expires_at FROM licenses").first<{ id: string; expires_at: number }>();
    const fields = {
      activation_id: res.body.activation_id,
      activation_created_at: T0 + 60,
      plan: "monthly",
      expires_at: lic!.expires_at,
      cycle_anchor: T0,
      quota_minutes_per_cycle: 3000,
      quota_epoch: 0,
      quota_fresh: true,
      refresh_before: T0 + 60 + 14 * DAY,
    };
    expect(res.body).toEqual({ token: expect.stringMatching(/^v1\./), ...fields });
    const verified = await verifyToken(res.body.token as string, vectors.public_keys, {
      now: T0 + 120,
      deviceIdHash: await device(1),
    });
    expect(verified).toEqual({
      ok: true,
      claims: { kid: "test-1", license_id: lic!.id, device_id_hash: await device(1), issued_at: T0 + 60, ...fields },
    });
  });

  it.each([
    ["monthly", 3000],
    ["yearly", null],
  ])("gói %s: token mang hạn mức %s theo bảng gói", async (plan, quota) => {
    const { activate } = await setup(plan);
    expect((await activate(1)).body).toMatchObject({ plan, quota_minutes_per_cycle: quota });
  });

  it("bảng gói thiếu thì activate và validate trả 503, không tạo activation", async () => {
    const { w, licenseKey, activate } = await setup();
    const a = await activate(1);
    const broken = makeWorld({ PLANS: undefined });
    const body = { key: licenseKey, device_id_hash: await device(2), device_label: "Máy 2" };
    expect(await broken.call("POST", "/v1/licenses/activate", body)).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
    expect(await broken.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id })).toMatchObject({
      status: 503,
      body: { error: "pricing_not_configured" },
    });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first()).toEqual({ n: 1 });
    void w;
  });

  it("cùng máy kích hoạt lại (cài lại app) thì dùng lại activation, không tốn suất", async () => {
    const { activate } = await setup();
    const a = await activate(1);
    const b = await activate(1);
    expect(b.body.activation_id).toBe(a.body.activation_id);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("gỡ rồi kích hoạt lại cùng máy: dùng lại đúng dòng cũ, giữ activation_id, activation_created_at, quota_epoch", async () => {
    const { w, activate, deactivate } = await setup();
    w.clock.now = T0 + 60;
    const a = await activate(1);
    await env.DB.prepare("UPDATE activations SET quota_epoch = 3").run();
    await deactivate(a.body.activation_id as string);
    w.clock.now = T0 + 2 * DAY;
    const again = await activate(1);
    expect(again.body).toMatchObject({
      activation_id: a.body.activation_id,
      activation_created_at: T0 + 60,
      quota_epoch: 3,
      quota_fresh: false,
    });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n, MAX(deactivated_at) AS d FROM activations").first()).toEqual({ n: 1, d: null });
    const log = await env.DB.prepare("SELECT action FROM audit_log WHERE action IN ('activated', 'reactivated') ORDER BY id").all();
    expect(log.results).toEqual([{ action: "activated" }, { action: "reactivated" }]);
  });

  it("máy cũ kích hoạt lại khi máy khác đang giữ key: 409 key_in_use", async () => {
    const { activate, deactivate } = await setup();
    const a1 = await activate(1);
    await deactivate(a1.body.activation_id as string);
    expect((await activate(2)).status).toBe(200);
    expect(await activate(1)).toMatchObject({ status: 409, body: { error: "key_in_use" } });
  });

  it("máy thứ hai nhận 409 key_in_use kèm máy đang giữ key, không đổi gì; gỡ máy kia từ xa rồi kích hoạt được", async () => {
    const { w, activate, deactivate } = await setup();
    const a1 = await activate(1);
    w.clock.now = T0 + 100;
    const second = await activate(2);
    expect(second).toMatchObject({
      status: 409,
      body: { error: "key_in_use", devices: [{ activation_id: a1.body.activation_id, device_label: "Máy 1", last_validated_at: T0 }] },
    });
    expect(Object.keys(second.body).sort()).toEqual(["devices", "error"]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first()).toEqual({ n: 1 });
    expect((await deactivate(a1.body.activation_id as string)).body).toEqual({ ok: true });
    expect((await activate(2)).status).toBe(200);
  });

  it("hai máy mới kích hoạt cùng lúc khi chưa máy nào giữ key: chỉ một máy được, máy kia key_in_use", async () => {
    const { activate } = await setup();
    const [x, y] = await Promise.all([activate(2), activate(3)]);
    expect([x.body.error, y.body.error].sort()).toEqual(["key_in_use", undefined].sort());
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  it.each([
    ["chuỗi", "true"],
    ["null", null],
    ["số 1", 1],
    ["số 0", 0],
    ["mảng", []],
  ])("allow_conflict có mặt mà không phải boolean (%s) thì 400, không ghi gì", async (_why, value) => {
    const { activate } = await setup();
    expect(await activate(1, "198.51.100.1", { allow_conflict: value })).toMatchObject({
      status: 400,
      body: { error: "invalid_request", field: "allow_conflict" },
    });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first()).toEqual({ n: 0 });
  });

  it("allow_conflict thiếu hay false: như nhau, không xung đột", async () => {
    const { activate } = await setup();
    expect((await activate(1)).status).toBe(200);
    expect(await activate(2, "198.51.100.2", { allow_conflict: false })).toMatchObject({ status: 409, body: { error: "key_in_use" } });
  });

  it("gỡ hơn 2 máy trong 30 ngày rồi kích hoạt máy mới thì khóa tạm key (423) và có cảnh báo", async () => {
    const { w, activate, deactivate } = await setup();
    for (let i = 1; i <= 3; i++) {
      w.clock.now = T0 + i * DAY;
      // Máy thứ 3 vào khi 2 máy trước đã bị gỡ: còn trong ngưỡng.
      const r = await activate(i);
      expect(r.status).toBe(200);
      await deactivate(r.body.activation_id as string);
    }
    w.clock.now = T0 + 4 * DAY;
    expect(await activate(4)).toMatchObject({ status: 423, body: { error: "license_locked" } });
    const lic = await env.DB.prepare("SELECT locked_at FROM licenses").first<{ locked_at: number }>();
    expect(lic?.locked_at).toBe(T0 + 4 * DAY);
    const log = await env.DB.prepare("SELECT action FROM audit_log WHERE action = 'license_locked'").first();
    expect(log).not.toBeNull();
    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
  });

  it("hai máy mới kích hoạt cùng lúc khi vừa quá ngưỡng: khóa một lần, một dòng nhật ký, một cảnh báo", async () => {
    const { w, activate, deactivate } = await setup();
    for (let i = 1; i <= 3; i++) {
      w.clock.now = T0 + i * DAY;
      const r = await activate(i);
      await deactivate(r.body.activation_id as string);
    }
    w.clock.now = T0 + 4 * DAY;
    const results = await Promise.all([activate(4), activate(5), activate(6)]);
    expect(results.map((r) => r.status)).toEqual([423, 423, 423]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'license_locked'").first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("SELECT SUM(count) AS n FROM ops_alerts WHERE kind = 'license_locked'").first()).toEqual({ n: 1 });
    // Đã khóa thì lần kích hoạt sau không khóa lại, không đổi locked_at.
    w.clock.now = T0 + 5 * DAY;
    expect((await activate(7)).status).toBe(423);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 4 * DAY });
  });

  it("gỡ rồi kích hoạt lại cùng một máy nhiều lần: không bị khóa", async () => {
    const { w, activate, deactivate } = await setup();
    for (let i = 1; i <= 6; i++) {
      w.clock.now = T0 + i * 3600;
      const r = await activate(1);
      expect(r.status).toBe(200);
      await deactivate(r.body.activation_id as string);
    }
    w.clock.now = T0 + 7 * 3600;
    expect((await activate(1)).status).toBe(200);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: null });
    // Đúng chữ §10.2: hơn 2 lần gỡ rồi kích hoạt một máy khác thì bị khóa.
    expect((await activate(2)).status).toBe(423);
  });

  it("xoay vòng một suất giữa 5 máy: bị khóa ở lượt 2, rồi mọi máy không đang kích hoạt đều bị 423", async () => {
    const { w, activate, deactivate } = await setup();
    let active = { n: 1, id: (await activate(1)).body.activation_id as string };
    const order = [2, 3, 4, 5, 1, 2];
    let lockedAt = -1;
    for (let i = 0; i < order.length; i++) {
      w.clock.now = T0 + (i + 1) * 3600;
      await deactivate(active.id);
      const r = await activate(order[i]!);
      if (r.status === 423) {
        lockedAt = i;
        break;
      }
      expect(r.status).toBe(200);
      active = { n: order[i]!, id: r.body.activation_id as string };
    }
    // Lượt 1 (máy 3): đã gỡ máy 1, 2; trừ máy 3 còn 2 lần, chưa quá 2.
    // Lượt 2 (máy 4): đã gỡ máy 1, 2, 3; trừ máy 4 còn 3 lần, nên khóa.
    expect(lockedAt).toBe(2);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 3 * 3600 });
    // Không còn máy nào đang kích hoạt; mọi máy (từng dùng hay mới) đều bị 423.
    for (const n of [1, 2, 3, 4, 5, 9]) expect((await activate(n)).status).toBe(423);
  });

  it("key đang bị khóa tạm: máy mới và máy từng kích hoạt đều bị 423, kể cả khi xác nhận xung đột; máy đang kích hoạt vẫn dùng được", async () => {
    const { w, licenseKey, activate, activateAnyway, deactivate } = await setup();
    const a2 = await activate(2);
    await deactivate(a2.body.activation_id as string);
    const a1 = await activate(1);
    await env.DB.prepare("UPDATE licenses SET locked_at = ?").bind(T0).run();
    w.clock.now = T0 + 60;
    expect(await activate(3)).toMatchObject({ status: 423, body: { error: "license_locked" } });
    expect(await activate(2)).toMatchObject({ status: 423, body: { error: "license_locked" } });
    expect(await activateAnyway(3)).toMatchObject({ status: 423, body: { error: "license_locked" } });
    expect((await activate(1)).status).toBe(200);
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a1.body.activation_id });
    expect(v.status).toBe(200);
  });

  it("cùng một máy mới gửi hai activate cùng lúc: cả hai nhận cùng activation, không lỗi 500", async () => {
    const { activate } = await setup();
    const [x, y] = await Promise.all([activate(7), activate(7)]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect(x.body.activation_id).toBe(y.body.activation_id);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("2 lần gỡ trong 30 ngày vẫn kích hoạt được; lần gỡ cũ hơn 30 ngày không tính", async () => {
    const { w, activate, deactivate } = await setup();
    await env.DB.prepare("UPDATE licenses SET expires_at = ?").bind(T0 + 90 * DAY).run();
    for (let i = 1; i <= 2; i++) {
      const r = await activate(i);
      await deactivate(r.body.activation_id as string);
    }
    const third = await activate(3);
    expect(third.status).toBe(200);
    w.clock.now = T0 + 10 * DAY;
    await deactivate(third.body.activation_id as string);
    // Lần gỡ thứ 3 ở T0 + 10 ngày; hai lần đầu (ở T0) đã quá 30 ngày. Nếu còn tính thì máy 4 thấy 3 lần gỡ (> 2) và bị khóa.
    w.clock.now = T0 + 31 * DAY;
    expect((await activate(4)).status).toBe(200);
  });

  it("key sai định dạng 400, key không tồn tại 404, đã thu hồi 403, hết hạn 403 kèm expires_at", async () => {
    const { w, activate, licenseKey } = await setup();
    const body = { device_id_hash: await device(1), device_label: "Máy 1" };
    expect((await w.call("POST", "/v1/licenses/activate", { ...body, key: "abc" })).status).toBe(400);
    const unknown = await w.call("POST", "/v1/licenses/activate", { ...body, key: UNKNOWN_KEY });
    expect(unknown).toMatchObject({ status: 404, body: { error: "invalid_key" } });
    w.clock.now = T0 + 31 * DAY;
    const expired = await activate(1);
    expect(expired).toMatchObject({ status: 403, body: { error: "license_expired", expires_at: T0 + 30 * DAY } });
    await env.DB.prepare("UPDATE licenses SET revoked_at = 1").run();
    expect((await w.call("POST", "/v1/licenses/activate", { ...body, key: licenseKey })).body.error).toBe("license_revoked");
  });

  it("device_id_hash phải là SHA-256 hex; device_label bị cắt còn 64 ký tự, bỏ ký tự điều khiển", async () => {
    const { w, licenseKey } = await setup();
    const bad = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: "abc", device_label: "x" });
    expect(bad.status).toBe(400);
    const label = `Máy\u0000 ${"ư".repeat(100)}`;
    const ok = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await device(1), device_label: label });
    expect(ok.status).toBe(200);
    const row = await env.DB.prepare("SELECT device_label FROM activations").first<{ device_label: string }>();
    expect(Array.from(row!.device_label)).toHaveLength(64);
    expect(row!.device_label.startsWith("Máy ư")).toBe(true);
  });

  it("quá 10 lần mỗi giờ mỗi IP thì 429", async () => {
    const { activate } = await setup();
    for (let i = 0; i < 10; i++) await activate(1, "203.0.113.50");
    expect((await activate(1, "203.0.113.50")).status).toBe(429);
  });

  it("key sai định dạng hay không tồn tại: mỗi lần tính một lần thất bại của IP; key đúng thì không", async () => {
    const { w, activate } = await setup();
    const failures = () => env.DB.prepare("SELECT SUM(count) AS n FROM rate_limits WHERE bucket LIKE 'failure_ip:%'").first();
    const body = { device_id_hash: await device(1), device_label: "Máy 1" };
    expect((await w.call("POST", "/v1/licenses/activate", { ...body, key: "abc" })).status).toBe(400);
    expect(await failures()).toEqual({ n: 1 });
    expect((await w.call("POST", "/v1/licenses/activate", { ...body, key: UNKNOWN_KEY })).status).toBe(404);
    expect(await failures()).toEqual({ n: 2 });
    expect((await activate(1)).status).toBe(200);
    expect(await failures()).toEqual({ n: 2 });
  });
});

describe("mỗi key một máy, trùng máy thì xung đột (spec 2026-10-07 §4.1)", () => {
  const activeCount = () => env.DB.prepare("SELECT COUNT(*) AS n FROM activations WHERE deactivated_at IS NULL").first();
  const idOf = async (n: number) =>
    (await env.DB.prepare("SELECT id FROM activations WHERE device_id_hash = ?").bind(await device(n)).first<{ id: string }>())!.id;

  it("allow_conflict khi chưa máy nào giữ key: kích hoạt bình thường, có token", async () => {
    const { activateAnyway } = await setup();
    const res = await activateAnyway(1);
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^v1\./);
  });

  it("allow_conflict khi máy khác giữ key: máy này vào, 409 license_conflict liệt kê cả hai máy, không cấp token, ghi nhật ký", async () => {
    const { w, activate, activateAnyway } = await setup();
    const a1 = await activate(1);
    w.clock.now = T0 + 100;
    const res = await activateAnyway(2);
    expect(res).toEqual({
      status: 409,
      headers: expect.anything(),
      body: {
        error: "license_conflict",
        // activation của chính máy gọi, để app lưu và sau đó validate hay tự gỡ (hợp đồng 00).
        activation_id: await idOf(2),
        devices: [
          { activation_id: a1.body.activation_id, device_label: "Máy 1", last_validated_at: T0 },
          { activation_id: await idOf(2), device_label: "Máy 2", last_validated_at: T0 + 100 },
        ],
      },
    });
    expect(await activeCount()).toEqual({ n: 2 });
    const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'license_conflict'").all<{ detail: string }>();
    expect(log.results.map((r) => JSON.parse(r.detail))).toEqual([{ activation_id: await idOf(2), devices: 2 }]);
  });

  it("đang xung đột: validate của cả hai máy và kích hoạt lại máy đang kích hoạt đều 409 license_conflict; lần kiểm gần nhất vẫn được ghi", async () => {
    const { w, licenseKey, activate, activateAnyway } = await setup();
    const a1 = await activate(1);
    await activateAnyway(2);
    w.clock.now = T0 + DAY;
    for (const id of [a1.body.activation_id, await idOf(2)]) {
      const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: id });
      expect(v).toMatchObject({ status: 409, body: { error: "license_conflict" } });
      expect(v.body).not.toHaveProperty("token");
      // validate: máy đã biết activation_id của mình, response không lặp lại.
      expect(v.body).not.toHaveProperty("activation_id");
    }
    expect((await env.DB.prepare("SELECT last_validated_at FROM activations ORDER BY created_at").all()).results).toEqual([
      { last_validated_at: T0 + DAY },
      { last_validated_at: T0 + DAY },
    ]);
    // Máy đang kích hoạt gọi lại activate (cài lại app) khi đang xung đột: nhận lại đúng activation của mình.
    expect(await activate(1)).toMatchObject({
      status: 409,
      body: { error: "license_conflict", activation_id: a1.body.activation_id },
    });
    expect(await activateAnyway(2)).toMatchObject({ status: 409, body: { error: "license_conflict", activation_id: await idOf(2) } });
    expect(await activeCount()).toEqual({ n: 2 });
  });

  it("máy thứ ba khi đang xung đột: key_in_use liệt kê 2 máy, kể cả khi xác nhận; không tạo dòng nào", async () => {
    const { activate, activateAnyway } = await setup();
    await activate(1);
    await activateAnyway(2);
    for (const res of [await activate(3), await activateAnyway(3)]) {
      expect(res).toMatchObject({ status: 409, body: { error: "key_in_use" } });
      expect((res.body.devices as { device_label: string }[]).map((d) => d.device_label)).toEqual(["Máy 1", "Máy 2"]);
    }
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first()).toEqual({ n: 2 });
  });

  it("một máy tự gỡ thì hết xung đột: máy còn lại validate nhận token", async () => {
    const { w, licenseKey, activate, activateAnyway, deactivate } = await setup();
    const a1 = await activate(1);
    await activateAnyway(2);
    expect((await deactivate(await idOf(2))).body).toEqual({ ok: true });
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a1.body.activation_id });
    expect(v.status).toBe(200);
    expect(v.body.token).toMatch(/^v1\./);
  });

  it("máy mới gỡ máy cũ từ xa khi đang xung đột: máy mới validate nhận token, máy cũ về 404", async () => {
    const { w, licenseKey, activate, activateAnyway, deactivate } = await setup();
    const a1 = await activate(1);
    await activateAnyway(2);
    expect((await deactivate(a1.body.activation_id as string)).body).toEqual({ ok: true });
    expect((await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: await idOf(2) })).status).toBe(200);
    expect(await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a1.body.activation_id })).toMatchObject({
      status: 404,
      body: { error: "activation_not_found" },
    });
  });

  it("hai người dùng chung key đổi máy qua lại (gỡ máy kia rồi kích hoạt): lần gỡ thứ 4 chưa khóa, lần gỡ thứ 5 thì máy xin kích hoạt bị 423", async () => {
    const { w, activate, deactivate } = await setup();
    let holder = (await activate(1)).body.activation_id as string;
    // Mỗi lượt: máy `inn` gỡ máy đang giữ key (gỡ từ xa), rồi kích hoạt. Các lần gỡ lần lượt là máy 1, 2, 1, 2, 1.
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const inn = i % 2 === 0 ? 2 : 1;
      w.clock.now = T0 + (i + 1) * 3600;
      await deactivate(holder);
      const r = await activate(inn);
      statuses.push(r.status);
      if (r.status !== 200) break;
      holder = r.body.activation_id as string;
    }
    // Lần gỡ thứ 4 (máy 2): máy 1 vào lại, các lần gỡ máy 2 là 2 (không quá 2), nên chưa khóa.
    // Lần gỡ thứ 5 (máy 1): máy 2 xin kích hoạt, các lần gỡ máy 1 là 3 (quá 2), nên khóa.
    expect(statuses).toEqual([200, 200, 200, 200, 423]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations WHERE by = 'user'").first()).toEqual({ n: 5 });
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 5 * 3600 });
    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
    expect((await activate(1)).status).toBe(423);
  });

  it("hai người dùng chung key gỡ qua gỡ lại bằng xác nhận xung đột: khóa sau 3 lần gỡ (vào bằng allow_conflict thì mọi lần gỡ đều tính)", async () => {
    const { w, activate, activateAnyway, deactivate } = await setup();
    await activate(1);
    // Mỗi lượt: máy `inn` xác nhận xung đột rồi gỡ máy `out` từ xa.
    let removals = 0;
    let lockedAfter = -1;
    for (let i = 0; i < 10; i++) {
      const [inn, out] = i % 2 === 0 ? [2, 1] : [1, 2];
      w.clock.now = T0 + (i + 1) * 3600;
      const r = await activateAnyway(inn);
      if (r.status === 423) {
        lockedAfter = removals;
        break;
      }
      expect(r).toMatchObject({ status: 409, body: { error: "license_conflict" } });
      await deactivate(await idOf(out));
      removals++;
    }
    // Vào bằng allow_conflict thì luật khóa tạm đếm mọi lần gỡ, kể cả các lần gỡ chính máy xin (Task 9): lần vào thứ 4
    // thấy 3 lần gỡ (1, 2, 1) nên bị chặn. Đổi máy bằng "gỡ máy kia rồi kích hoạt" (test ở trên) vẫn trừ lần gỡ của
    // chính máy xin, nên cần 5 lần gỡ.
    expect(lockedAfter).toBe(3);
    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
  });

  it("máy lạ vào bằng allow_conflict, bị chủ key gỡ từ xa 3 lần: lần allow_conflict thứ 4 nhận 423 (tính cả lần gỡ chính máy xin); chủ key vẫn validate", async () => {
    const { w, licenseKey, activate, activateAnyway, deactivate } = await setup();
    const owner = await activate(1);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      w.clock.now = T0 + (i + 1) * 3600;
      const r = await activateAnyway(3);
      statuses.push(r.status);
      if (r.status === 423) {
        expect(r.body).toEqual({ error: "license_locked" });
        break;
      }
      expect(r.body.error).toBe("license_conflict");
      await deactivate(await idOf(3)); // chủ key gỡ máy lạ từ xa
    }
    // Lần vào thứ 4 thấy 3 lần gỡ (cùng của máy lạ), quá 2.
    expect(statuses).toEqual([409, 409, 409, 423]);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 4 * 3600 });
    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'license_locked'").first()).toEqual({ n: 1 });
    // Máy lạ không còn đang kích hoạt, nên không còn xung đột: chủ key validate bình thường, kể cả khi key đang bị khóa.
    expect(await activeCount()).toEqual({ n: 1 });
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: owner.body.activation_id });
    expect(v.status).toBe(200);
    expect(v.body.token).toMatch(/^v1\./);
  });

  it("cùng máy lạ nhưng KHÔNG dùng allow_conflict: các lần gỡ chính máy xin vẫn không tính (giữ cách đếm cũ)", async () => {
    const { w, activate, activateAnyway, deactivate } = await setup();
    const owner = await activate(1);
    // Key đang ở máy chủ: không allow_conflict thì chỉ nhận key_in_use, không có lần gỡ nào.
    for (let i = 0; i < 4; i++) expect((await activate(3)).status).toBe(409);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: null });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations").first()).toEqual({ n: 0 });
    // Máy lạ có 3 lần bị gỡ (từ allow_conflict, mỗi lần vẫn còn trong ngưỡng).
    for (let i = 0; i < 3; i++) {
      w.clock.now = T0 + (i + 1) * 3600;
      expect((await activateAnyway(3)).body.error).toBe("license_conflict");
      await deactivate(await idOf(3));
    }
    // Chủ key tự gỡ để nhường chỗ: máy lạ vào lại không allow_conflict. Lần gỡ của chính máy lạ (3) không tính, chỉ còn
    // lần gỡ của chủ key (1), nên vào được. Cùng trạng thái này mà vào bằng allow_conflict thì thấy 4 lần gỡ và bị 423.
    w.clock.now = T0 + 4 * 3600;
    await deactivate(owner.body.activation_id as string);
    const back = await activate(3);
    expect(back.status).toBe(200);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: null });
  });

  it("2 lần vào bằng allow_conflict kèm 2 lần bị gỡ: lần vào thứ 3 vẫn được (chưa quá 2)", async () => {
    const { w, activate, activateAnyway, deactivate } = await setup();
    await activate(1);
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      w.clock.now = T0 + (i + 1) * 3600;
      const r = await activateAnyway(3);
      statuses.push(r.status);
      if (i < 2) await deactivate(await idOf(3));
    }
    expect(statuses).toEqual([409, 409, 409]);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: null });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations WHERE by = 'user'").first()).toEqual({ n: 2 });
    expect(await activeCount()).toEqual({ n: 2 });
  });

  it("allow_conflict: lần gỡ cũ hơn 30 ngày không tính", async () => {
    const { w, activate, activateAnyway, deactivate } = await setup();
    await env.DB.prepare("UPDATE licenses SET expires_at = ?").bind(T0 + 90 * DAY).run();
    await activate(1);
    for (let i = 0; i < 3; i++) {
      expect((await activateAnyway(3)).body.error).toBe("license_conflict");
      await deactivate(await idOf(3));
    }
    // 3 lần gỡ ở T0, quá 30 ngày thì không tính nữa.
    w.clock.now = T0 + 31 * DAY;
    expect((await activateAnyway(3)).body.error).toBe("license_conflict");
  });

  it("hai máy cùng xác nhận xung đột một lúc khi key đang ở máy 1: tối đa 2 máy đang kích hoạt", async () => {
    const { activate, activateAnyway } = await setup();
    await activate(1);
    const results = await Promise.all([activateAnyway(2), activateAnyway(3)]);
    expect(results.map((r) => r.body.error).sort()).toEqual(["key_in_use", "license_conflict"]);
    expect(await activeCount()).toEqual({ n: 2 });
  });
});

describe("quota_fresh (QĐ35)", () => {
  const validate = (w: ReturnType<typeof makeWorld>, key: string, id: unknown) =>
    w.call("POST", "/v1/licenses/validate", { key, activation_id: id });

  it("biên của cửa sổ: giây 899 sau khi tạo activation còn true, giây 900 là false", async () => {
    const { w, activate, licenseKey } = await setup();
    w.clock.now = T0 + DAY;
    const a = await activate(1);
    w.clock.now = T0 + DAY + 899;
    expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(true);
    w.clock.now = T0 + DAY + 900;
    expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(false);
  });

  it("license đã hết hạn mua lại cùng gói, webhook tới muộn 1 giờ: token trong 15 phút sau lúc xử lý là true", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 35 * DAY; // hết hạn từ T0 + 30 ngày
    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "buyer@example.com", consent: true, license_key: licenseKey });
    const orderCode = co.body.order_code as number;
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    w.clock.now = T0 + 35 * DAY + 3600;
    await w.call("POST", "/v1/webhooks/payos", body);
    w.clock.now = T0 + 35 * DAY + 3600 + 14 * 60;
    // Mua lại sau khi hết hạn đặt lại cycle_anchor (lúc trả tiền), nên mốc của cửa sổ là lúc server xử lý đơn.
    expect((await validate(w, licenseKey, a.body.activation_id)).body).toMatchObject({
      plan: "monthly",
      cycle_anchor: T0 + 35 * DAY,
      quota_fresh: true,
    });
    w.clock.now = T0 + 35 * DAY + 3600 + 16 * 60;
    expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(false);
  });

  it("true trong 15 phút sau khi tạo activation: phút 14 còn true, phút 16 là false", async () => {
    const { w, activate, licenseKey } = await setup();
    w.clock.now = T0 + DAY;
    const a = await activate(1);
    expect(a.body.quota_fresh).toBe(true);
    w.clock.now = T0 + DAY + 14 * 60;
    expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(true);
    w.clock.now = T0 + DAY + 16 * 60;
    expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(false);
  });

  it("mốc cycle_anchor: đổi gói đặt lại chu kỳ thì token trong 15 phút sau đó là true", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 10 * DAY;
    expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(false);
    await w.buy({ licenseKey, plan: "yearly" });
    w.clock.now = T0 + 10 * DAY + 14 * 60;
    const v = await validate(w, licenseKey, a.body.activation_id);
    expect(v.body).toMatchObject({ plan: "yearly", cycle_anchor: T0 + 10 * DAY, quota_minutes_per_cycle: null, quota_fresh: true });
    w.clock.now = T0 + 10 * DAY + 16 * 60;
    expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(false);
  });

  it("mốc tăng quota_epoch: cửa sổ mở ở token đầu tiên sau khi tăng, kể cả khi 2 giờ sau mới validate", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 5 * DAY;
    // Như admin "reset hạn mức của máy" (Task 16): tăng epoch, đánh dấu đang chờ.
    await env.DB.prepare("UPDATE activations SET quota_epoch = 1, epoch_pending = 1, epoch_window_start = NULL").run();
    w.clock.now = T0 + 5 * DAY + 2 * 3600;
    expect((await validate(w, licenseKey, a.body.activation_id)).body).toMatchObject({ quota_epoch: 1, quota_fresh: true });
    w.clock.now = T0 + 5 * DAY + 2 * 3600 + 14 * 60;
    expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(true);
    w.clock.now = T0 + 5 * DAY + 2 * 3600 + 16 * 60;
    expect((await validate(w, licenseKey, a.body.activation_id)).body).toMatchObject({ quota_epoch: 1, quota_fresh: false });
    expect(await env.DB.prepare("SELECT epoch_pending, epoch_window_start FROM activations").first()).toEqual({
      epoch_pending: 0,
      epoch_window_start: T0 + 5 * DAY + 2 * 3600,
    });
  });

  it("không có lần tăng epoch đang chờ thì validate không ghi gì vào epoch_window_start (bớt một lần ghi)", async () => {
    const w0 = wrapDb(env.DB);
    const w = makeWorld({ DB: w0.db });
    const { licenseKey } = await w.buy();
    const a = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await device(1), device_label: "M1" });
    const epochWrites = () => w0.sql.filter((q) => /UPDATE activations SET epoch_window_start/.test(q)).length;
    w0.sql.length = 0;
    w.clock.now = T0 + DAY;
    expect((await validate(w, licenseKey, a.body.activation_id)).status).toBe(200);
    expect(epochWrites()).toBe(0);
    await env.DB.prepare("UPDATE activations SET quota_epoch = 1, epoch_pending = 1").run();
    expect((await validate(w, licenseKey, a.body.activation_id)).body).toMatchObject({ quota_epoch: 1, quota_fresh: true });
    expect(epochWrites()).toBe(1);
  });

  it("hai validate chạy cùng lúc ngay sau khi tăng epoch: cả hai thấy cùng một mốc, đều fresh", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 5 * DAY;
    await env.DB.prepare("UPDATE activations SET quota_epoch = 1, epoch_pending = 1, epoch_window_start = NULL").run();
    const [x, y] = await Promise.all([validate(w, licenseKey, a.body.activation_id), validate(w, licenseKey, a.body.activation_id)]);
    expect([x.body.quota_fresh, y.body.quota_fresh]).toEqual([true, true]);
  });

  it("hai validate chen nhau, đồng hồ khác nhau: request mở cửa sổ sau không ghi đè mốc của request mở trước (review cuối, N7)", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    await env.DB.prepare("UPDATE activations SET quota_epoch = 1, epoch_pending = 1, epoch_window_start = NULL").run();
    // Request chậm đọc activation (còn đang chờ) rồi dừng ngay trước câu mở cửa sổ.
    const g = gateDb(env.DB, /UPDATE activations SET epoch_window_start/);
    const slow = makeWorld({ DB: g.db });
    slow.clock.now = T0 + 5 * DAY + 1000;
    const late = slow.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
    await g.reached;
    // Trong lúc đó một request khác, lúc T0 + 5 ngày, mở cửa sổ.
    w.clock.now = T0 + 5 * DAY;
    expect((await validate(w, licenseKey, a.body.activation_id)).body).toMatchObject({ quota_epoch: 1, quota_fresh: true });
    g.release();
    // Request chậm không mở lại cửa sổ từ giờ của nó: mốc vẫn là T0 + 5 ngày, nên ở giây 1000 sau mốc đã hết fresh.
    expect((await late).body).toMatchObject({ quota_epoch: 1, quota_fresh: false });
    expect(await env.DB.prepare("SELECT epoch_pending, epoch_window_start FROM activations").first()).toEqual({
      epoch_pending: 0,
      epoch_window_start: T0 + 5 * DAY,
    });
  });

  it("webhook đổi gói tới muộn 1 giờ: mốc là lúc server áp thay đổi, token ngay sau đó vẫn fresh", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 10 * DAY;
    const co = await w.call("POST", "/v1/checkout", { plan: "yearly", email: "buyer@example.com", consent: true, license_key: licenseKey });
    const orderCode = co.body.order_code as number;
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    w.clock.now = T0 + 10 * DAY + 3600;
    await w.call("POST", "/v1/webhooks/payos", body);
    w.clock.now = T0 + 10 * DAY + 3600 + 60;
    const v = await validate(w, licenseKey, a.body.activation_id);
    // cycle_anchor là lúc trả tiền (1 giờ trước), nhưng cửa sổ tính từ lúc xử lý webhook.
    expect(v.body).toMatchObject({ plan: "yearly", cycle_anchor: T0 + 10 * DAY, quota_fresh: true });
    w.clock.now = T0 + 10 * DAY + 3600 + 16 * 60;
    expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(false);
  });

  it("gia hạn cùng gói khi còn hạn không đặt lại chu kỳ nên không làm token fresh", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 20 * DAY;
    await w.buy({ licenseKey });
    expect((await validate(w, licenseKey, a.body.activation_id)).body).toMatchObject({ cycle_anchor: T0, quota_fresh: false });
  });
});

describe("validate", () => {
  it("trả token mới và cập nhật lần kiểm gần nhất", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 2 * DAY;
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
    expect(v.status).toBe(200);
    expect(v.body.refresh_before).toBe(T0 + 16 * DAY);
    const row = await env.DB.prepare("SELECT last_validated_at FROM activations").first<{ last_validated_at: number }>();
    expect(row?.last_validated_at).toBe(T0 + 2 * DAY);
  });

  it("máy đã bị gỡ từ xa: 404 activation_not_found (app về Free)", async () => {
    const { w, activate, deactivate, licenseKey } = await setup();
    const a = await activate(1);
    await deactivate(a.body.activation_id as string);
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
    expect(v).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
  });

  it("activation đã gỡ (kể cả gỡ từ xa) không tính là thất bại của IP, như deactivate; activation lạ thì vẫn tính", async () => {
    const { w, activate, deactivate, licenseKey } = await setup();
    const a = await activate(1);
    await deactivate(a.body.activation_id as string);
    for (let i = 0; i < 3; i++) {
      const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
      expect(v).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
    }
    const failures = () => env.DB.prepare("SELECT SUM(count) AS n FROM rate_limits WHERE bucket LIKE 'failure_ip:%'").first();
    expect(await failures()).toEqual({ n: null });
    await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: crypto.randomUUID() });
    expect(await failures()).toEqual({ n: 1 });
  });

  it("đã gia hạn từ máy khác: token mới mang expires_at mới", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    await w.buy({ licenseKey });
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
    expect(v.body.expires_at).toBe(T0 + 60 * DAY);
  });

  it("đổi gói: máy đang kích hoạt nhận gói, cycle_anchor và hạn mức mới ở lần validate kế tiếp", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 10 * DAY;
    await w.buy({ licenseKey, plan: "yearly" });
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
    expect(v.body).toMatchObject({
      plan: "yearly",
      cycle_anchor: T0 + 10 * DAY,
      expires_at: T0 + 399 * DAY,
      quota_minutes_per_cycle: null,
    });
  });

  it("key bị khóa tạm vẫn validate được trên máy đã kích hoạt", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    await env.DB.prepare("UPDATE licenses SET locked_at = 1").run();
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
    expect(v.status).toBe(200);
  });

  it("license đã thu hồi hoặc hết hạn: validate trả 403", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    const body = { key: licenseKey, activation_id: a.body.activation_id };
    w.clock.now = T0 + 30 * DAY;
    expect(await w.call("POST", "/v1/licenses/validate", body)).toMatchObject({
      status: 403,
      body: { error: "license_expired", expires_at: T0 + 30 * DAY },
    });
    w.clock.now = T0 + DAY;
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0 + 3600).run();
    expect(await w.call("POST", "/v1/licenses/validate", body)).toMatchObject({ status: 403, body: { error: "license_revoked" } });
  });

  it("quá 30 lần mỗi giờ mỗi key thì 429, kể cả khi đổi 0↔O, 1↔I/L, chữ hoa thường, gạch nối", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    const variants = [
      licenseKey,
      licenseKey.toLowerCase(),
      licenseKey.replace(/-/g, " "),
      licenseKey.replace(/0/g, "O").replace(/1/g, "I"),
      licenseKey.replace(/1/g, "l"),
    ];
    for (let i = 0; i < 30; i++) {
      const res = await w.call("POST", "/v1/licenses/validate", { key: variants[i % variants.length], activation_id: a.body.activation_id });
      expect(res.status).toBe(200);
    }
    const blocked = await w.call("POST", "/v1/licenses/validate", { key: variants[3], activation_id: a.body.activation_id });
    expect(blocked.status).toBe(429);
  });

  it("dò key: 60 lần thất bại từ một IP thì IP đó bị chặn, và mọi key sai hay key thật kèm activation sai đều 429", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    const ip = { "cf-connecting-ip": "203.0.113.66" };
    const call = (key: string, activationId: unknown) =>
      w.call("POST", "/v1/licenses/validate", { key, activation_id: activationId }, ip);
    for (let i = 0; i < 20; i++) expect((await call(`SAI-${i}`, a.body.activation_id)).status).toBe(400);
    for (let i = 0; i < 20; i++) expect((await call(UNKNOWN_KEY, a.body.activation_id)).status).toBe(404);
    // Activation lạ của key đúng cũng tính là thất bại.
    for (let i = 0; i < 20; i++) {
      expect(await call(licenseKey, crypto.randomUUID())).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
    }
    // IP đã bị chặn: key giả, key sai định dạng, key thật kèm activation sai, và activate đều 429 như nhau.
    for (const res of [
      await call(UNKNOWN_KEY, a.body.activation_id),
      await call("SAI", a.body.activation_id),
      await call(licenseKey, crypto.randomUUID()),
      await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await device(2), device_label: "M" }, ip),
      await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: crypto.randomUUID() }, ip),
    ]) {
      expect(res).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    }
    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "many_failures" });
  });

  it("CGNAT: IP đang bị chặn vẫn validate và deactivate được với key hợp lệ kèm activation đang hoạt động", async () => {
    const { w, activate, activateAnyway, licenseKey } = await setup();
    const a = await activate(1);
    await activateAnyway(2);
    const b = (await env.DB.prepare("SELECT id FROM activations WHERE device_id_hash = ?").bind(await device(2)).first<{ id: string }>())!;
    const ip = { "cf-connecting-ip": "203.0.113.77" };
    for (let i = 0; i < 60; i++) await w.call("POST", "/v1/licenses/validate", { key: `SAI-${i}`, activation_id: a.body.activation_id }, ip);
    expect((await w.call("POST", "/v1/licenses/validate", { key: "SAI", activation_id: a.body.activation_id }, ip)).status).toBe(429);
    // Qua được lớp chặn IP; key đang xung đột nên 409, không phải 429.
    const conflicted = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id }, ip);
    expect(conflicted).toMatchObject({ status: 409, body: { error: "license_conflict" } });
    const off = await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: b.id }, ip);
    expect(off).toMatchObject({ status: 200, body: { ok: true } });
    const ok = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id }, ip);
    expect(ok.status).toBe(200);
    expect(ok.body.token).toMatch(/^v1\./);
    // Activation vừa gỡ không còn hoạt động: từ IP đang bị chặn thì 429.
    expect((await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: b.id }, ip)).status).toBe(429);
    // IP khác không bị ảnh hưởng.
    expect((await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id })).status).toBe(200);
  });
});

describe("deactivate", () => {
  it("gỡ máy chỉ đánh dấu dòng activation và ghi một dòng deactivations; gỡ trùng không ghi thêm", async () => {
    const { w, activate, deactivate } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 300;
    await Promise.all([deactivate(a.body.activation_id as string), deactivate(a.body.activation_id as string)]);
    expect(await env.DB.prepare("SELECT deactivated_at, deactivated_by FROM activations").first()).toEqual({
      deactivated_at: T0 + 300,
      deactivated_by: "user",
    });
    expect((await env.DB.prepare("SELECT at, by FROM deactivations").all()).results).toEqual([{ at: T0 + 300, by: "user" }]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'deactivated'").first()).toEqual({ n: 1 });
  });

  it("kích hoạt lại dùng lại dòng cũ nhưng các lần gỡ trước vẫn tính vào luật khóa tạm", async () => {
    const { w, activate, deactivate } = await setup();
    // Xoay một suất giữa 3 máy: mỗi máy quay lại dùng lại dòng của nó.
    const ids = new Map<number, string>();
    ids.set(1, (await activate(1)).body.activation_id as string);
    const rotation: [number, number][] = [[1, 2], [2, 3], [3, 1]];
    const statuses: number[] = [];
    for (const [i, [out, inn]] of rotation.entries()) {
      w.clock.now = T0 + (i + 1) * 3600;
      await deactivate(ids.get(out)!);
      const r = await activate(inn);
      statuses.push(r.status);
      if (r.status === 200) ids.set(inn, r.body.activation_id as string);
    }
    // Lượt 3 (máy 1 quay lại): đã gỡ máy 1, 2, 3; trừ máy 1 còn 2 lần. Chưa quá 2 nên vẫn được.
    expect(statuses).toEqual([200, 200, 200]);
    w.clock.now = T0 + 4 * 3600;
    await deactivate(ids.get(1)!);
    // Máy 1 quay lại lần nữa: đã gỡ máy 1, 2, 3, 1; trừ máy 1 còn 2. Máy 4 mới: 4 lần, nên khóa.
    expect((await activate(1)).status).toBe(200);
    expect((await activate(4)).status).toBe(423);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first()).toEqual({ n: 3 });
  });

  it("quá 10 lần mỗi giờ mỗi IP thì 429 (deactivate_ip), kể cả với key và activation hợp lệ; IP khác vẫn gỡ được", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    const ip = { "cf-connecting-ip": "203.0.113.51" };
    const call = (headers: Record<string, string>) =>
      w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: a.body.activation_id }, headers);
    for (let i = 0; i < 10; i++) expect((await call(ip)).status).toBe(200);
    const res = await call(ip);
    expect(res).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(res.headers.get("retry-after")).toBe("3600");
    expect((await call({ "cf-connecting-ip": "203.0.113.52" })).status).toBe(200);
  });

  it("gỡ lại activation đã gỡ vẫn 200; activation của key khác thì 404 và tính là thất bại", async () => {
    const { w, activate, deactivate } = await setup();
    const a = await activate(1);
    expect((await deactivate(a.body.activation_id as string)).status).toBe(200);
    expect((await deactivate(a.body.activation_id as string)).status).toBe(200);
    const other = await w.buy({ email: "other@example.com" });
    const res = await w.call("POST", "/v1/licenses/deactivate", { key: other.licenseKey, activation_id: a.body.activation_id });
    expect(res).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
    const failures = await env.DB.prepare("SELECT SUM(count) AS n FROM rate_limits WHERE bucket LIKE 'failure_ip:%'").first();
    expect(failures).toEqual({ n: 1 });
  });
});

// Review cuối, Q1: mọi test khác chỉ có một license, nên lỗi bỏ điều kiện license_id trong câu SQL không lộ ra.
describe("hai khách: không đụng license, máy hay bộ đếm của khách khác", () => {
  const failures = () => env.DB.prepare("SELECT SUM(count) AS n FROM rate_limits WHERE bucket LIKE 'failure_ip:%'").first();
  const rowsOf = (licenseId: string) =>
    env.DB.prepare("SELECT id, device_id_hash, device_label, deactivated_at, last_validated_at FROM activations WHERE license_id = ? ORDER BY id")
      .bind(licenseId)
      .all()
      .then((r) => r.results);

  it("B đang xung đột (2 máy): A vẫn kích hoạt được; máy thứ hai của A nhận key_in_use, rồi license_conflict, chỉ liệt kê máy của A", async () => {
    const { w, activate, activateAnyway } = await setup();
    const b = await w.customerB();
    const a1 = await activate(1);
    expect(a1.status).toBe(200);
    const second = await activate(2);
    expect(second).toMatchObject({ status: 409, body: { error: "key_in_use" } });
    const listed = (second.body.devices as { activation_id: string; device_label: string }[]).map((a) => [a.activation_id, a.device_label]);
    expect(listed).toEqual([[a1.body.activation_id, "Máy 1"]]);
    const anyway = await activateAnyway(2);
    expect(anyway).toMatchObject({ status: 409, body: { error: "license_conflict" } });
    expect((anyway.body.devices as { device_label: string }[]).map((d) => d.device_label)).toEqual(["Máy 1", "Máy 2"]);
    for (const res of [second, anyway]) {
      for (const act of [...b.active, ...b.deactivated]) expect(JSON.stringify(res.body)).not.toContain(act.id);
    }
  });

  it("B có 2 lần tự gỡ trong 30 ngày: A đã gỡ 2 lần vẫn kích hoạt được máy thứ 3, vì không cộng lần gỡ của B", async () => {
    const { w, activate, deactivate } = await setup();
    const b = await w.customerB();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations WHERE license_id = ? AND by = 'user'").bind(b.licenseId).first()).toEqual({ n: 2 });
    // Nếu lần gỡ của B lọt vào đếm của A thì máy thứ 3 của A thấy 2 + 2 = 4 lần gỡ và bị khóa.
    for (const n of [1, 2]) {
      const r = await activate(n);
      expect(r.status).toBe(200);
      await deactivate(r.body.activation_id as string);
    }
    expect((await activate(3)).status).toBe(200);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses WHERE id <> ?").bind(b.licenseId).first()).toEqual({ locked_at: null });
  });

  it("A kích hoạt trên máy mà B đang dùng hay đã gỡ: tạo activation mới của A, dòng của B giữ nguyên", async () => {
    const { w, licenseKey } = await setup();
    const b = await w.customerB();
    const before = await rowsOf(b.licenseId);
    const ids = new Set([...b.active, ...b.deactivated].map((a) => a.id));
    for (const hash of [b.active[0]!.deviceIdHash, b.deactivated[0]!.deviceIdHash]) {
      const res = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: hash, device_label: "Máy của A" });
      expect(res.status).toBe(200);
      expect(ids.has(res.body.activation_id as string)).toBe(false);
      const claims = await verifyToken(res.body.token as string, vectors.public_keys, { now: T0, deviceIdHash: hash });
      expect(claims).toMatchObject({ ok: true, claims: { activation_id: res.body.activation_id } });
      // Mỗi key một máy: gỡ máy này của A trước khi thử máy kế tiếp.
      await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: res.body.activation_id });
    }
    expect(await rowsOf(b.licenseId)).toEqual(before);
    const lic = await env.DB.prepare("SELECT id FROM licenses WHERE id <> ?").bind(b.licenseId).first<{ id: string }>();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activations WHERE license_id = ?").bind(lic!.id).first()).toEqual({ n: 2 });
  });

  it("validate và deactivate key A với activation đang hoạt động của B: 404, mỗi lần tính một thất bại, máy của B giữ nguyên", async () => {
    const { w, licenseKey } = await setup();
    const b = await w.customerB();
    const before = await rowsOf(b.licenseId);
    w.clock.now = T0 + 60;
    const body = { key: licenseKey, activation_id: b.active[0]!.id };
    expect(await w.call("POST", "/v1/licenses/validate", body)).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
    expect(await failures()).toEqual({ n: 1 });
    expect(await w.call("POST", "/v1/licenses/deactivate", body)).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
    expect(await failures()).toEqual({ n: 2 });
    expect(await rowsOf(b.licenseId)).toEqual(before);
  });

  it("validate key A với activation đã gỡ của B: 404 và vẫn tính là thất bại (chỉ activation đã gỡ của chính key A mới không tính)", async () => {
    const { w, licenseKey } = await setup();
    const b = await w.customerB();
    const res = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: b.deactivated[0]!.id });
    expect(res).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
    expect(await failures()).toEqual({ n: 1 });
  });
});
