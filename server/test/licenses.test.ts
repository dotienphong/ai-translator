import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto";
import { verifyToken } from "../src/token";
import { resetDb, wrapDb } from "./db";
import vectors from "./vectors/token-v1.json";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

const device = async (n: number) => sha256Hex(`device-${n}`);
/** Key đúng định dạng (ký tự kiểm tra đúng) nhưng không có trong D1. */
const UNKNOWN_KEY = "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5";

async function setup(plan = "pro") {
  const w = makeWorld();
  const { licenseKey } = await w.buy({ plan });
  const activate = async (n: number, ip = `198.51.100.${n}`) =>
    w.call(
      "POST",
      "/v1/licenses/activate",
      { key: licenseKey, device_id_hash: await device(n), device_label: `Máy ${n}` },
      { "cf-connecting-ip": ip },
    );
  const deactivate = (activationId: string) =>
    w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: activationId });
  return { w, licenseKey, activate, deactivate };
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
      plan: "pro",
      expires_at: lic!.expires_at,
      cycle_anchor: T0,
      quota_minutes_per_cycle: 1800,
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
    ["pro_x2", 6000],
    ["pro_x5", null],
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

  it("máy cũ kích hoạt lại vẫn chiếm suất: đủ 2 máy thì 409", async () => {
    const { activate, deactivate } = await setup();
    const a1 = await activate(1);
    await deactivate(a1.body.activation_id as string);
    await activate(2);
    await activate(3);
    expect(await activate(1)).toMatchObject({ status: 409, body: { error: "device_limit" } });
  });

  it("máy thứ 3 bị 409 kèm danh sách máy; gỡ từ xa một máy rồi kích hoạt được", async () => {
    const { w, activate, deactivate } = await setup();
    const a1 = await activate(1);
    w.clock.now = T0 + 100;
    await activate(2);
    const third = await activate(3);
    expect(third.status).toBe(409);
    expect(third.body).toEqual({
      error: "device_limit",
      activations: [
        { activation_id: a1.body.activation_id, device_label: "Máy 1", last_validated_at: T0 },
        { activation_id: expect.any(String), device_label: "Máy 2", last_validated_at: T0 + 100 },
      ],
    });
    expect((await deactivate(a1.body.activation_id as string)).body).toEqual({ ok: true });
    expect((await activate(3)).status).toBe(200);
  });

  it("hai máy mới kích hoạt cùng lúc khi còn một suất: chỉ một máy được", async () => {
    const { activate } = await setup();
    await activate(1);
    const [x, y] = await Promise.all([activate(2), activate(3)]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  it("gỡ hơn 3 máy trong 30 ngày rồi kích hoạt máy mới thì khóa tạm key (423) và có cảnh báo", async () => {
    const { w, activate, deactivate } = await setup();
    for (let i = 1; i <= 4; i++) {
      w.clock.now = T0 + i * DAY;
      const r = await activate(i);
      expect(r.status).toBe(200);
      await deactivate(r.body.activation_id as string);
    }
    w.clock.now = T0 + 5 * DAY;
    expect(await activate(5)).toMatchObject({ status: 423, body: { error: "license_locked" } });
    const lic = await env.DB.prepare("SELECT locked_at FROM licenses").first<{ locked_at: number }>();
    expect(lic?.locked_at).toBe(T0 + 5 * DAY);
    const log = await env.DB.prepare("SELECT action FROM audit_log WHERE action = 'license_locked'").first();
    expect(log).not.toBeNull();
    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
  });

  it("hai máy mới kích hoạt cùng lúc khi vừa quá ngưỡng: khóa một lần, một dòng nhật ký, một cảnh báo", async () => {
    const { w, activate, deactivate } = await setup();
    for (let i = 1; i <= 4; i++) {
      w.clock.now = T0 + i * DAY;
      const r = await activate(i);
      await deactivate(r.body.activation_id as string);
    }
    w.clock.now = T0 + 5 * DAY;
    const results = await Promise.all([activate(5), activate(6), activate(7)]);
    expect(results.map((r) => r.status)).toEqual([423, 423, 423]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'license_locked'").first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("SELECT SUM(count) AS n FROM ops_alerts WHERE kind = 'license_locked'").first()).toEqual({ n: 1 });
    // Đã khóa thì lần kích hoạt sau không khóa lại, không đổi locked_at.
    w.clock.now = T0 + 6 * DAY;
    expect((await activate(8)).status).toBe(423);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 5 * DAY });
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
    // Đúng chữ §10.2: hơn 3 lần gỡ rồi kích hoạt một máy khác thì bị khóa.
    expect((await activate(2)).status).toBe(423);
  });

  it("xoay vòng 2 suất giữa 5 máy: bị khóa sau vài lượt, rồi mọi máy không đang kích hoạt đều bị 423", async () => {
    const { w, activate, deactivate } = await setup();
    const active: { n: number; id: string }[] = [];
    for (const n of [1, 2]) active.push({ n, id: (await activate(n)).body.activation_id as string });
    const order = [3, 4, 5, 1, 2, 3, 4, 5];
    let lockedAt = -1;
    for (let i = 0; i < order.length; i++) {
      w.clock.now = T0 + (i + 1) * 3600;
      const out = active.shift()!;
      await deactivate(out.id);
      const r = await activate(order[i]!);
      if (r.status === 423) {
        lockedAt = i;
        break;
      }
      expect(r.status).toBe(200);
      active.push({ n: order[i]!, id: r.body.activation_id as string });
    }
    // Lượt 4 (máy 1 quay lại): đã gỡ máy 1, 2, 3, 4; trừ máy 1 còn 3 lần, chưa quá 3.
    // Lượt 5 (máy 2 quay lại): đã gỡ máy 1, 2, 3, 4, 5; trừ máy 2 còn 4 lần, nên khóa.
    expect(lockedAt).toBe(4);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 5 * 3600 });
    // Máy 1 đang kích hoạt vẫn dùng được; các máy khác (từng dùng hay mới) đều bị 423.
    expect((await activate(1)).status).toBe(200);
    for (const n of [2, 3, 5, 9]) expect((await activate(n)).status).toBe(423);
  });

  it("key đang bị khóa tạm: máy mới và máy từng kích hoạt đều bị 423; máy đang kích hoạt vẫn dùng được", async () => {
    const { w, licenseKey, activate, deactivate } = await setup();
    const a1 = await activate(1);
    const a2 = await activate(2);
    await deactivate(a2.body.activation_id as string);
    await env.DB.prepare("UPDATE licenses SET locked_at = ?").bind(T0).run();
    w.clock.now = T0 + 60;
    expect(await activate(3)).toMatchObject({ status: 423, body: { error: "license_locked" } });
    expect(await activate(2)).toMatchObject({ status: 423, body: { error: "license_locked" } });
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

  it("3 lần gỡ trong 30 ngày vẫn kích hoạt được; lần gỡ cũ hơn 30 ngày không tính", async () => {
    const { w, activate, deactivate } = await setup();
    await env.DB.prepare("UPDATE licenses SET expires_at = ?").bind(T0 + 90 * DAY).run();
    for (let i = 1; i <= 3; i++) {
      const r = await activate(i);
      await deactivate(r.body.activation_id as string);
    }
    const fourth = await activate(4);
    expect(fourth.status).toBe(200);
    w.clock.now = T0 + 10 * DAY;
    await deactivate(fourth.body.activation_id as string);
    // Lần gỡ thứ 4 ở T0 + 10 ngày; ba lần đầu (ở T0) đã quá 30 ngày.
    w.clock.now = T0 + 31 * DAY;
    expect((await activate(5)).status).toBe(200);
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
    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "buyer@example.com", consent: true, license_key: licenseKey });
    const orderCode = co.body.order_code as number;
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    w.clock.now = T0 + 35 * DAY + 3600;
    await w.call("POST", "/v1/webhooks/payos", body);
    w.clock.now = T0 + 35 * DAY + 3600 + 14 * 60;
    // Mua lại sau khi hết hạn đặt lại cycle_anchor (lúc trả tiền), nên mốc của cửa sổ là lúc server xử lý đơn.
    expect((await validate(w, licenseKey, a.body.activation_id)).body).toMatchObject({
      plan: "pro",
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
    await w.buy({ licenseKey, plan: "pro_x2" });
    w.clock.now = T0 + 10 * DAY + 14 * 60;
    const v = await validate(w, licenseKey, a.body.activation_id);
    expect(v.body).toMatchObject({ plan: "pro_x2", cycle_anchor: T0 + 10 * DAY, quota_minutes_per_cycle: 6000, quota_fresh: true });
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

  it("webhook đổi gói tới muộn 1 giờ: mốc là lúc server áp thay đổi, token ngay sau đó vẫn fresh", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 10 * DAY;
    const co = await w.call("POST", "/v1/checkout", { plan: "pro_x2", email: "buyer@example.com", consent: true, license_key: licenseKey });
    const orderCode = co.body.order_code as number;
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    w.clock.now = T0 + 10 * DAY + 3600;
    await w.call("POST", "/v1/webhooks/payos", body);
    w.clock.now = T0 + 10 * DAY + 3600 + 60;
    const v = await validate(w, licenseKey, a.body.activation_id);
    // cycle_anchor là lúc trả tiền (1 giờ trước), nhưng cửa sổ tính từ lúc xử lý webhook.
    expect(v.body).toMatchObject({ plan: "pro_x2", cycle_anchor: T0 + 10 * DAY, quota_fresh: true });
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

  it("đổi gói từ máy khác: máy này nhận gói, cycle_anchor và hạn mức mới ở lần validate kế tiếp", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 10 * DAY;
    await w.buy({ licenseKey, plan: "pro_x5" });
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
    expect(v.body).toMatchObject({
      plan: "pro_x5",
      cycle_anchor: T0 + 10 * DAY,
      expires_at: T0 + 42 * DAY,
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
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    const b = await activate(2);
    const ip = { "cf-connecting-ip": "203.0.113.77" };
    for (let i = 0; i < 60; i++) await w.call("POST", "/v1/licenses/validate", { key: `SAI-${i}`, activation_id: a.body.activation_id }, ip);
    expect((await w.call("POST", "/v1/licenses/validate", { key: "SAI", activation_id: a.body.activation_id }, ip)).status).toBe(429);
    const ok = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id }, ip);
    expect(ok.status).toBe(200);
    expect(ok.body.token).toMatch(/^v1\./);
    const off = await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: b.body.activation_id }, ip);
    expect(off).toMatchObject({ status: 200, body: { ok: true } });
    // Activation vừa gỡ không còn hoạt động: từ IP đang bị chặn thì 429.
    expect((await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: b.body.activation_id }, ip)).status).toBe(429);
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
    // Xoay 2 suất giữa 3 máy: mỗi máy quay lại dùng lại dòng của nó.
    const ids = new Map<number, string>();
    for (const n of [1, 2]) ids.set(n, (await activate(n)).body.activation_id as string);
    const rotation: [number, number][] = [[1, 3], [2, 1], [3, 2], [1, 3]];
    const statuses: number[] = [];
    for (const [i, [out, inn]] of rotation.entries()) {
      w.clock.now = T0 + (i + 1) * 3600;
      await deactivate(ids.get(out)!);
      const r = await activate(inn);
      statuses.push(r.status);
      if (r.status === 200) ids.set(inn, r.body.activation_id as string);
    }
    // Lượt 4 (máy 3 quay lại): đã gỡ máy 1, 2, 3, 1; trừ máy 3 còn 3 lần. Chưa quá 3 nên vẫn được.
    expect(statuses).toEqual([200, 200, 200, 200]);
    w.clock.now = T0 + 5 * 3600;
    await deactivate(ids.get(2)!);
    // Máy 1 quay lại: đã gỡ máy 1, 2, 3, 1, 2; trừ máy 1 còn 3. Máy 4 mới: 5 lần, nên khóa.
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

  it("B có 2 máy đang kích hoạt: A vẫn kích hoạt được 2 máy; máy thứ 3 của A bị 409 chỉ liệt kê máy của A", async () => {
    const { w, activate } = await setup();
    const b = await w.customerB();
    const a1 = await activate(1);
    const a2 = await activate(2);
    expect([a1.status, a2.status]).toEqual([200, 200]);
    const third = await activate(3);
    expect(third).toMatchObject({ status: 409, body: { error: "device_limit" } });
    const listed = (third.body.activations as { activation_id: string; device_label: string }[]).map((a) => [a.activation_id, a.device_label]);
    expect(listed).toEqual([
      [a1.body.activation_id, "Máy 1"],
      [a2.body.activation_id, "Máy 2"],
    ]);
    for (const act of [...b.active, ...b.deactivated]) expect(JSON.stringify(third.body)).not.toContain(act.id);
  });

  it("B có 4 lần tự gỡ trong 30 ngày: A kích hoạt máy mới không bị khóa", async () => {
    const { w, activate } = await setup();
    const b = await w.customerB();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations WHERE license_id = ? AND by = 'user'").bind(b.licenseId).first()).toEqual({ n: 4 });
    expect((await activate(1)).status).toBe(200);
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
