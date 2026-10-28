import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../src/crypto";
import { reconcile } from "../src/reconcile";
import { HEALTH_RETENTION_SECONDS } from "../src/speaker-health";
import { lastAudit, makeAdmin } from "./admin-harness";
import { resetDb } from "./db";
import { DAY0, device, seed } from "./speaker-health-fixture";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

const rows = () => env.DB.prepare("SELECT * FROM speaker_health ORDER BY day, meeting_app, meeting_version").all().then((r) => r.results);

describe("Web Admin: GET /admin/speaker-health và xóa theo email", () => {
  it("bảng theo app họp, phiên bản, hệ điều hành; bỏ báo cáo debug và canary; canary và mẫu chỉ báo ở mục riêng; ghi nhật ký xem", async () => {
    const { adminCall } = makeAdmin();
    await seed({ state: "ok", device_id_hash: await device(1) }, T0 - 100);
    await seed({ state: "no_names", device_id_hash: await device(2), learned: 1, patterns: [{ role: "AXGroup", path: [1], states: [{ subrole: "", classes: ["x"] }] }] }, T0 - 50);
    await seed({ state: "blocked", build: "debug", device_id_hash: await device(3) }, T0 - 40);
    await seed({ canary: true, state: "ok", day: "2026-10-01", device_id_hash: await device(4) }, T0 - 30);
    const res = await adminCall("/admin/speaker-health");
    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([
      {
        meeting_app: "teams",
        meeting_version: "26032.1100",
        os_name: "macos",
        reports: 2,
        devices: 2,
        broken_devices: 1,
        ok: 1,
        no_names: 1,
        no_speaking: 0,
        no_permission: 0,
        blocked: 0,
        minutes_ok: 80,
        minutes_total: 90,
        recipe_version: 2,
        last_at: T0 - 50,
      },
    ]);
    expect(res.body.canary).toEqual([
      { meeting_app: "teams", meeting_version: "26032.1100", os_name: "macos", day: "2026-10-01", state: "ok", recipe_version: 2, app_version: "0.3.2" },
    ]);
    expect(res.body.patterns).toEqual([
      { meeting_app: "teams", meeting_version: "26032.1100", day: DAY0, recipe_version: 2, patterns: [{ role: "AXGroup", path: [1], states: [{ subrole: "", classes: ["x"] }] }] },
    ]);
    expect(await lastAudit()).toMatchObject({ action: "list_viewed" });
    const detail = JSON.parse(String((await lastAudit() as { detail: string }).detail));
    expect(detail).toEqual({ resource: "speaker_health", filters: { days: "7" }, count: 1 });
  });

  it("days ngoài 1–30 hay không phải số thì 400; không qua Access, cross-site hay sai aud thì 403", async () => {
    const { adminCall } = makeAdmin();
    for (const days of ["0", "31", "abc", "-1", "1.5"]) {
      expect((await adminCall(`/admin/speaker-health?days=${days}`)).status, days).toBe(400);
    }
    expect((await adminCall("/admin/speaker-health", { operator: null })).status).toBe(403);
    expect(await adminCall("/admin/speaker-health", { headers: { "sec-fetch-site": "cross-site" } })).toMatchObject({ status: 403, body: { error: "forbidden" } });
    const strict = makeAdmin({ ACCESS_AUD: "aud-1" });
    expect(await strict.adminCall("/admin/speaker-health", { aud: "aud-khac" })).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first()).toEqual({ n: 0 });
  });

  it("xóa theo email xóa luôn báo cáo tình trạng của máy đã kích hoạt license của email đó; máy khác giữ nguyên", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ email: "erase@example.com" });
    const mine = await sha256Hex("d-mine");
    await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: mine, device_label: "MacBook" });
    await seed({ device_id_hash: mine }, T0);
    await seed({ device_id_hash: await device(9) }, T0);
    const res = await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa" } });
    expect(res.status).toBe(200);
    expect((await rows()).map((r) => r.device_id_hash)).toEqual([await device(9)]);
    const detail = JSON.parse(String((await lastAudit() as { detail: string }).detail));
    expect(detail.speaker_health).toBe(1);
  });
});

describe("cron reconcile: nối evaluateSpeakerHealth và pruneSpeakerHealth", () => {
  it("phiên bản app họp hỏng: một lần cron gửi luôn email cảnh báo (không có app hay phiên bản), lần sau không gửi lại", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld({ OPERATOR_EMAIL: "ops@example.com" });
    for (const [i, state] of ["no_names", "no_names", "blocked", "ok", "ok"].entries()) {
      await seed({ meeting: { app: "zoom", version: "7.77.1" }, state, device_id_hash: await device(50 + i) }, T0 - 3600);
    }
    expect(await reconcile(w.env, w.deps)).toMatchObject({ alerts_sent: 1, errors: 0 });
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]!.subject).toContain("speaker_health_degraded");
    // Thân thư là văn bản tĩnh (nêu chung "Teams, Meet hay Zoom"); phiên bản và app của báo cáo không được lọt vào.
    expect(JSON.stringify(w.resend.sent[0])).not.toContain("7.77");
    expect(w.resend.sent[0]!.subject).not.toMatch(/zoom/i);
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ alerts_sent: 0 });
    expect(w.resend.sent).toHaveLength(1);
  });

  it("canary im lặng 3 ngày: cron gửi cảnh báo speaker_canary_failed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld({ OPERATOR_EMAIL: "ops@example.com" });
    await seed({ canary: true, day: "2026-09-27", state: "ok", device_id_hash: await device(60) }, T0 - 4 * DAY);
    expect(await reconcile(w.env, w.deps)).toMatchObject({ alerts_sent: 1 });
    expect(w.resend.sent[0]!.subject).toContain("speaker_canary_failed");
  });

  it("cron dọn báo cáo tình trạng quá hạn, giữ báo cáo mới", async () => {
    const w = makeWorld();
    await seed({ meeting: { app: "teams", version: "old" } }, T0 - HEALTH_RETENTION_SECONDS - 10);
    await seed({ meeting: { app: "teams", version: "new" } }, T0 - 10);
    await reconcile(w.env, w.deps);
    expect((await rows()).map((r) => r.meeting_version)).toEqual(["new"]);
  });

  it("bước đánh giá lỗi thì ghi log, các bước sau vẫn chạy (gửi cảnh báo, dọn)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const w = makeWorld();
    await seed({ meeting: { app: "teams", version: "old" } }, T0 - HEALTH_RETENTION_SECONDS - 10);
    const realPrepare = env.DB.prepare.bind(env.DB);
    vi.spyOn(env.DB, "prepare").mockImplementation((sql: string) => {
      if (sql.includes("FROM speaker_health") && sql.includes("canary = 0")) throw new Error("boom");
      return realPrepare(sql);
    });
    await reconcile(w.env, w.deps);
    vi.restoreAllMocks();
    expect(err.mock.calls.flat().join("\n")).toContain("speaker_health_alerts");
    expect(await rows()).toEqual([]);
  });
});
