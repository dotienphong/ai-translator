import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendAlerts } from "../src/alerts";
import { hit, LIMITS } from "../src/ratelimit";
import {
  ALERT_EVERY_SECONDS,
  evaluateSpeakerHealth,
  findCanaryFailing,
  findCanarySilent,
  findDegraded,
  HEALTH_RETENTION_SECONDS,
  parseSpeakerHealth,
  pruneSpeakerHealth,
} from "../src/speaker-health";
import { resetDb } from "./db";
import { validReport } from "./report-fixture";
import { DAY0, device, health, seed } from "./speaker-health-fixture";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

type World = ReturnType<typeof makeWorld>;
const send = (w: World, body: unknown, headers?: Record<string, string>) => w.call("POST", "/v1/diagnostics", body, headers);
const rows = () => env.DB.prepare("SELECT * FROM speaker_health ORDER BY day, meeting_app, meeting_version").all().then((r) => r.results);
const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;

describe("parseSpeakerHealth: danh sách cho phép, không có chữ tự do", () => {
  it("báo cáo hợp lệ; phiên bản app họp thiếu thì lưu '?'", async () => {
    const ok = parseSpeakerHealth(await health(), T0);
    expect(ok).toMatchObject({ ok: true, report: { day: DAY0, meeting_app: "teams", meeting_version: "26032.1100", state: "ok", patterns: "[]" } });
    const none = parseSpeakerHealth(await health({ meeting: { app: "zoom", version: null } }), T0);
    expect(none).toMatchObject({ ok: true, report: { meeting_app: "zoom", meeting_version: "?" } });
  });

  it("khóa lạ ở mọi cấp bị từ chối (nơi tên người có thể lọt vào)", async () => {
    const bad = async (overrides: Record<string, unknown>, field: string) =>
      expect(parseSpeakerHealth(await health(overrides), T0)).toEqual({ ok: false, field });
    await bad({ participants: ["Lan"] }, "body");
    await bad({ app: { version: "0.3.2", user: "lan" } }, "app");
    await bad({ os: { name: "macos", version: "15", arch: "arm64", host: "lan-mbp" } }, "os");
    await bad({ meeting: { app: "teams", version: "1", title: "Họp với Lan" } }, "meeting");
    await bad({ minutes: { ok: 1, total: 2, who: "Lan" } }, "minutes");
  });

  it("từng trường sai trả đúng tên trường", async () => {
    const bad = async (overrides: Record<string, unknown>, field: string) =>
      expect(parseSpeakerHealth(await health(overrides), T0)).toEqual({ ok: false, field });
    await bad({ v: 2 }, "v");
    await bad({ kind: "crash" }, "kind");
    await bad({ day: "2026-02-30" }, "day");
    await bad({ day: "2026-10-05" }, "day");
    await bad({ day: "2026-09-01" }, "day");
    await bad({ day: "hôm qua" }, "day");
    await bad({ canary: "yes" }, "canary");
    await bad({ build: "staging" }, "build");
    await bad({ app: { version: "0.3" } }, "app");
    await bad({ os: { name: "macos", version: "15 /usr/local", arch: "arm64" } }, "os");
    await bad({ meeting: { app: "webex", version: "1" } }, "meeting");
    await bad({ meeting: { app: "teams", version: "a b" } }, "meeting");
    await bad({ meeting: { app: "teams", version: "?" } }, "meeting");
    await bad({ recipe_version: -1 }, "recipe_version");
    await bad({ state: "broken" }, "state");
    await bad({ minutes: { ok: 5, total: 4 } }, "minutes");
    await bad({ minutes: { ok: 0, total: 1501 } }, "minutes");
    await bad({ learned: 65 }, "learned");
    await bad({ device_id_hash: "abc" }, "device_id_hash");
    expect(parseSpeakerHealth(null, T0)).toEqual({ ok: false, field: "body" });
  });

  it("mẫu chỉ báo: chỉ vai trò, đường đi, lớp an toàn; tên người, email, mã số dài đều bị từ chối", async () => {
    const pattern = (classes: unknown[], role = "AXGroup") => [{ role, path: [2, 0], states: [{ subrole: "", classes }] }];
    const ok = parseSpeakerHealth(await health({ learned: 1, patterns: pattern(["vdi-frame-occlusion", "oZRSLe"]) }), T0);
    expect(ok).toMatchObject({ ok: true });
    const bad = async (patterns: unknown) => expect(parseSpeakerHealth(await health({ patterns }), T0)).toEqual({ ok: false, field: "patterns" });
    await bad(pattern(["Lan Nguyễn"]));
    await bad(pattern(["lan@example.com"]));
    await bad(pattern(["roster-avatar-img-12345678"]));
    await bad(pattern(["x".repeat(33)]));
    await bad(pattern(Array(7).fill("x")));
    await bad(pattern(["x"], "AX Group"));
    await bad([{ role: "AXGroup", path: Array(9).fill(0), states: [] }]);
    await bad(Array(5).fill(pattern(["x"])[0]));
    await bad([{ role: "AXGroup", path: [0], states: [{ subrole: "", classes: [], name: "Lan" }] }]);
    await bad("không phải mảng");
  });
});

describe("POST /v1/diagnostics với kind speaker_health", () => {
  it("202, lưu theo giờ server; gửi lại cùng khóa thì không tạo bản trùng", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    const body = await health({ learned: 1, patterns: [{ role: "AXGroup", path: [2, 0], states: [{ subrole: "", classes: ["x"] }] }] });
    expect(await send(w, body)).toMatchObject({ status: 202, body: { ok: true } });
    expect(await send(w, body)).toMatchObject({ status: 202 });
    expect(await rows()).toEqual([
      {
        device_id_hash: body.device_id_hash,
        day: DAY0,
        meeting_app: "teams",
        meeting_version: "26032.1100",
        canary: 0,
        received_at: T0,
        build: "release",
        app_version: "0.3.2",
        os_name: "macos",
        os_version: "15.6.1",
        arch: "aarch64",
        recipe_version: 2,
        state: "ok",
        minutes_ok: 40,
        minutes_total: 45,
        learned: 1,
        patterns: '[{"role":"AXGroup","path":[2,0],"states":[{"subrole":"","classes":["x"]}]}]',
      },
    ]);
    expect(await count("error_reports")).toBe(0);
  });

  it("báo cáo hỏng thì 400 kèm tên trường và không lưu gì; thân không phải JSON object thì 400", async () => {
    const w = makeWorld();
    expect(await send(w, await health({ state: "x" }))).toMatchObject({ status: 400, body: { error: "invalid_request", field: "state" } });
    expect(await send(w, await health({ extra: 1 }))).toMatchObject({ status: 400, body: { field: "body" } });
    expect(await count("speaker_health")).toBe(0);
  });

  /** Chuỗi qua được danh sách cho phép mà vẫn giống một key bản quyền (28 ký tự Crockford): bộ phát hiện của báo cáo lỗi chặn nốt. */
  it("chuỗi giống key bản quyền thì 422 và không lưu", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    const res = await send(w, await health({ meeting: { app: "teams", version: "ABCDEFGHJKMNPQRSTVWXYZ012345" } }));
    expect(res).toMatchObject({ status: 422, body: { error: "rejected_sensitive", rule: "license_key" } });
    expect(await count("speaker_health")).toBe(0);
  });

  it("đếm hạn mức riêng: hết hạn mức của máy thì 429, không ăn vào hạn mức báo cáo lỗi", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    for (let i = 0; i < LIMITS.speaker_device; i++) {
      expect((await send(w, await health({ meeting: { app: "teams", version: `1.${i}` } }))).status).toBe(202);
    }
    const over = await send(w, await health({ meeting: { app: "teams", version: "9.9" } }));
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBeTruthy();
    // Báo cáo lỗi của cùng máy vẫn nhận (hạn mức diag_device chưa bị dùng).
    expect((await send(w, await validReport({ device_id_hash: await device(1) }))).status).toBe(202);
    // Máy khác vẫn gửi được tình trạng.
    expect((await send(w, await health({ device_id_hash: await device(2) }))).status).toBe(202);
  });

  it("chạm hạn mức toàn hệ thống: 429 và đúng lần đầu có cảnh báo speaker_flood", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    for (let i = 0; i < LIMITS.speaker_global; i++) await hit(env, "speaker_global", "all", T0);
    expect((await send(w, await health())).status).toBe(429);
    expect((await send(w, await health())).status).toBe(429);
    const alerts = await env.DB.prepare("SELECT kind, count FROM ops_alerts").all();
    expect(alerts.results).toEqual([{ kind: "speaker_flood", count: 1 }]);
  });

  it("cảnh báo tràn của báo cáo tình trạng nêu đúng loại và đúng số (600), không phải '120 báo cáo lỗi'", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    for (let i = 0; i < LIMITS.speaker_global; i++) await hit(env, "speaker_global", "all", T0);
    expect((await send(w, await health())).status).toBe(429);
    expect(await sendAlerts({ DB: env.DB, ENVIRONMENT: "test", OPERATOR_EMAIL: "ops@example.com" }, w.deps.email, T0 + 3700)).toBe(1);
    const mail = JSON.stringify(w.resend.sent[0]);
    expect(mail).toContain("speaker_flood");
    expect(mail).toContain(String(LIMITS.speaker_global));
    expect(mail).not.toContain("120");
  });

  it("hạn mức IP riêng: gửi tình trạng từ 30+ máy cùng IP không ăn hạn mức IP của báo cáo lỗi; hết hạn mức IP tình trạng thì 429 mà báo cáo lỗi vẫn nhận", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    for (let n = 1; n <= LIMITS.diag_ip + 1; n++) {
      expect((await send(w, await health({ device_id_hash: await device(1000 + n) }))).status).toBe(202);
    }
    expect((await send(w, await validReport({ device_id_hash: await device(1) }))).status).toBe(202);
    for (let i = 0; i < LIMITS.speaker_ip; i++) await hit(env, "speaker_ip", "203.0.113.9", T0);
    expect((await send(w, await health({ device_id_hash: await device(2000) }), { "cf-connecting-ip": "203.0.113.9" })).status).toBe(429);
    expect((await send(w, await validReport({ id: "R-0000-0002", device_id_hash: await device(3) }), { "cf-connecting-ip": "203.0.113.9" })).status).toBe(202);
  });

  it("báo cáo lỗi thường vẫn đi đường cũ (kind khác)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    expect((await send(w, await validReport())).status).toBe(202);
    expect(await count("error_reports")).toBe(1);
    expect(await count("speaker_health")).toBe(0);
  });
});

describe("cron: cảnh báo bộ đọc tên (spec §7.2)", () => {
  /** n báo cáo của n máy khác nhau cho cùng một app và phiên bản, với `states`. */
  async function reports(version: string, states: string[], extra: Record<string, unknown> = {}) {
    for (const [i, state] of states.entries()) {
      await seed({ meeting: { app: "teams", version }, state, device_id_hash: await device(100 + i), ...extra }, T0 - 3600);
    }
  }

  it("từ 5 báo cáo và ≥ 30% hỏng: cảnh báo; dưới 5 báo cáo hay dưới 30% thì không", async () => {
    await reports("1.0", ["ok", "ok", "no_names", "no_names", "blocked"]); // 3/5 hỏng
    await reports("2.0", ["no_names", "no_names", "no_names", "no_names"]); // 4 báo cáo: chưa đủ
    await reports("3.0", ["ok", "ok", "ok", "ok", "no_speaking"]); // 1/5 = 20%
    await reports("4.0", ["no_permission", "no_permission", "no_permission", "no_permission", "no_permission"]); // việc của người dùng
    expect((await findDegraded(env.DB, T0)).map((d) => [d.meeting_version, d.reports, d.broken])).toEqual([["1.0", 5, 3]]);
  });

  it("ngưỡng đếm MÁY, không đếm báo cáo: 2 máy hỏng liền 3 ngày (6 báo cáo) không báo; 3 máy hỏng thì báo", async () => {
    for (const [i, day] of [DAY0, "2026-09-29", "2026-09-28"].entries()) {
      for (const n of [500, 501]) await seed({ meeting: { app: "teams", version: "1.0" }, day, state: "blocked", device_id_hash: await device(n) }, T0 - 3600 - i);
    }
    expect(await findDegraded(env.DB, T0)).toEqual([]);
    expect(await evaluateSpeakerHealth(env.DB, T0)).toEqual({ degraded: 0, canary: 0 });
    await seed({ meeting: { app: "teams", version: "1.0" }, state: "no_names", device_id_hash: await device(502) }, T0 - 3600);
    expect((await findDegraded(env.DB, T0)).map((d) => [d.meeting_version, d.reports, d.devices, d.broken_devices])).toEqual([["1.0", 7, 3, 3]]);
  });

  it("tỉ lệ tính theo máy: một máy gửi nhiều báo cáo ok không che được 3 máy hỏng trong 5 máy", async () => {
    await reports("1.0", ["no_names", "no_names", "no_names", "ok", "ok"]); // 3/5 máy hỏng
    for (const day of [DAY0, "2026-09-29", "2026-09-28"]) await seed({ meeting: { app: "teams", version: "1.0" }, day, state: "ok", device_id_hash: await device(103) }, T0 - 3600);
    expect((await findDegraded(env.DB, T0)).map((d) => d.meeting_version)).toEqual(["1.0"]);
  });

  it("không tính báo cáo debug, canary, hay quá 3 ngày", async () => {
    await reports("1.0", ["no_names", "no_names", "no_names", "no_names", "no_names"], { build: "debug" });
    await reports("2.0", ["no_names", "no_names", "no_names", "no_names", "no_names"], { canary: true });
    for (let i = 0; i < 5; i++) await seed({ meeting: { app: "teams", version: "3.0" }, state: "blocked", device_id_hash: await device(200 + i) }, T0 - 4 * DAY);
    expect(await findDegraded(env.DB, T0)).toEqual([]);
  });

  it("mỗi chủ thể cảnh báo một lần mỗi ngày; email chỉ có số lượng, không có tên app hay phiên bản", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await reports("7.77", ["no_names", "no_names", "no_names", "ok", "ok"]);
    expect(await evaluateSpeakerHealth(env.DB, T0)).toEqual({ degraded: 1, canary: 0 });
    expect(await evaluateSpeakerHealth(env.DB, T0 + 600)).toEqual({ degraded: 0, canary: 0 });
    expect(await sendAlerts({ DB: env.DB, ENVIRONMENT: "test", OPERATOR_EMAIL: "ops@example.com" }, w.deps.email, T0 + 700)).toBe(1);
    const mail = w.resend.sent[0]!;
    expect(mail.subject).toContain("speaker_health_degraded");
    expect(JSON.stringify(mail)).not.toContain("7.77");
    expect(mail.subject).not.toMatch(/teams/i);
    expect(await evaluateSpeakerHealth(env.DB, T0 + ALERT_EVERY_SECONDS + 10)).toEqual({ degraded: 1, canary: 0 });
  });

  it("kiểm tra tự động hỏng hai ngày liền (cùng app, cùng hệ điều hành) thì cảnh báo; một ngày, hay có lượt ok thì không", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const canary = (day: string, state: string, os = "macos", app = "teams", n = 1) =>
      seed({ canary: true, day, state, meeting: { app, version: "1.0" }, os: { name: os, version: "15", arch: "arm64" }, device_id_hash: device(300 + n) as unknown as string }, T0);
    const d1 = "2026-10-01"; // ngày của T0
    const d0 = "2026-09-30";
    await seed({ canary: true, day: d1, state: "no_names", device_id_hash: await device(301) }, T0);
    expect(await findCanaryFailing(env.DB, T0)).toEqual([]);
    await seed({ canary: true, day: d0, state: "no_speaking", device_id_hash: await device(301) }, T0 - DAY);
    expect(await findCanaryFailing(env.DB, T0)).toEqual([{ meeting_app: "teams", os_name: "macos" }]);
    // Windows: hôm nay hỏng, hôm qua ok.
    await seed({ canary: true, day: d1, state: "blocked", os: { name: "windows", version: "11", arch: "x86_64" }, device_id_hash: await device(302) }, T0);
    await seed({ canary: true, day: d0, state: "ok", os: { name: "windows", version: "11", arch: "x86_64" }, device_id_hash: await device(302) }, T0 - DAY);
    expect(await findCanaryFailing(env.DB, T0)).toEqual([{ meeting_app: "teams", os_name: "macos" }]);
    void canary;
    expect(await evaluateSpeakerHealth(env.DB, T0)).toEqual({ degraded: 0, canary: 1 });
    expect(await evaluateSpeakerHealth(env.DB, T0 + 300)).toEqual({ degraded: 0, canary: 0 });
  });

  it("kiểm tra tự động im lặng 3 ngày (đã từng có kết quả) thì cảnh báo; còn kết quả gần đây hay chưa từng có thì không", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seed({ canary: true, day: "2026-09-27", state: "ok", device_id_hash: await device(400) }, T0 - 4 * DAY);
    await seed({ canary: true, day: "2026-09-30", state: "ok", meeting: { app: "zoom", version: "7.1" }, device_id_hash: await device(401) }, T0 - DAY);
    await seed({ canary: true, day: "2026-09-24", state: "ok", meeting: { app: "meet_edge", version: "1" }, device_id_hash: await device(402) }, T0 - 20 * DAY);
    expect(await findCanarySilent(env.DB, T0)).toEqual([{ meeting_app: "teams", os_name: "macos" }]);
    expect(await evaluateSpeakerHealth(env.DB, T0)).toEqual({ degraded: 0, canary: 1 });
    expect(await evaluateSpeakerHealth(env.DB, T0 + 300)).toEqual({ degraded: 0, canary: 0 });
  });

  it("dọn báo cáo quá 60 ngày", async () => {
    await seed({}, T0 - HEALTH_RETENTION_SECONDS - 10);
    await seed({ meeting: { app: "zoom", version: "7.1" } }, T0 - 10);
    await pruneSpeakerHealth(env.DB, T0);
    expect((await rows()).map((r) => r.meeting_app)).toEqual(["zoom"]);
  });
});
