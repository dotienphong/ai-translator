import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { findReportSensitive, insertReportStatements, MAX_STORED_REPORTS, parseReport, pruneErrorReports, RETENTION_SECONDS } from "../src/error-reports";
import { resetDb } from "./db";
import { makeReport, validReport } from "./report-fixture";
import { DAY, T0 } from "./world";

beforeEach(resetDb);

describe("parseReport", () => {
  it("nhận báo cáo hợp lệ và dựng bản ghi phẳng", async () => {
    const parsed = parseReport(await validReport(), T0);
    expect(parsed).toMatchObject({
      ok: true,
      report: {
        id: "R-7F3K-92QD",
        kind: "session_error",
        code: "sidecarFailed",
        fingerprint: "3fa1c09be2d47a55",
        at: T0 - 60,
        build: "release",
        app_version: "0.1.10",
        os_name: "macos",
        os_version: "15.6.1",
        arch: "aarch64",
        chip: "Apple M4 Pro",
        ram_mb: 24576,
        gpu_backend: "metal",
        model_pack: "standard",
        plan: "monthly",
        ui_lang: "vi",
      },
    });
  });

  it("chip, ram, gpu, model_pack và plan có thể là null hoặc vắng", async () => {
    const parsed = parseReport(await validReport({ hw: {}, model_pack: null, plan: undefined }), T0);
    expect(parsed).toMatchObject({ ok: true, report: { chip: null, ram_mb: null, gpu_backend: null, model_pack: null, plan: null } });
  });

  it("báo cáo manual: code null, fingerprint toàn số 0", async () => {
    const ok = parseReport(await validReport({ kind: "manual", code: null, fingerprint: "0000000000000000" }), T0);
    expect(ok).toMatchObject({ ok: true, report: { kind: "manual", code: null } });
    expect(parseReport(await validReport({ kind: "manual", code: null }), T0)).toEqual({ ok: false, field: "fingerprint" });
    expect(parseReport(await validReport({ kind: "manual", fingerprint: "0000000000000000" }), T0)).toEqual({ ok: false, field: "code" });
    expect(parseReport(await validReport({ fingerprint: "0000000000000000" }), T0)).toEqual({ ok: false, field: "fingerprint" });
  });

  it("body không phải object", () => {
    expect(parseReport(null, T0)).toEqual({ ok: false, field: "body" });
  });

  it.each([
    ["v", { v: 2 }],
    ["id", { id: "R-7f3k-92qd" }],
    ["id", { id: "R-7F3I-92QD" }],
    ["kind", { kind: "other" }],
    ["code", { code: "" }],
    ["code", { code: "9bad" }],
    ["fingerprint", { fingerprint: "XYZ" }],
    ["at", { at: T0 - 8 * DAY }],
    ["at", { at: T0 + 8 * DAY }],
    ["at", { at: 1.5 }],
    ["message", { message: "x".repeat(501) }],
    ["build", { build: "beta" }],
    ["app", { app: { version: "x" } }],
    ["app", { app: null }],
    ["os", { os: { name: "", version: "1", arch: "a" } }],
    ["os", { os: { name: "macos\n", version: "1", arch: "a" } }],
    ["hw", { hw: { chip: null, ram_mb: -1, gpu_backend: null } }],
    ["hw", { hw: { chip: null, ram_mb: null, gpu_backend: "dx12" } }],
    ["hw", null],
    ["model_pack", { model_pack: "x".repeat(65) }],
    ["plan", { plan: "gold" }],
    ["ui_lang", { ui_lang: "fr" }],
    ["device_id_hash", { device_id_hash: "abc" }],
    ["logs", { logs: { app: "x".repeat(24 * 1024 + 1), asr: "", llama: "" } }],
    ["logs", { logs: { app: "", asr: "x".repeat(16 * 1024 + 1), llama: "" } }],
    ["logs", { logs: { app: "", asr: "", llama: "x".repeat(16 * 1024 + 1) } }],
    ["logs", { logs: { app: "", asr: "" } }],
  ])("%s sai thì trả đúng tên trường", async (field, patch) => {
    const body = patch === null ? await validReport({ [field]: null }) : await validReport(patch as Record<string, unknown>);
    expect(parseReport(body, T0)).toEqual({ ok: false, field });
  });

  it("trần log tính theo byte UTF-8, không theo số ký tự", async () => {
    // 8.193 ký tự "ế" là 24.579 byte: vượt trần 24 KiB dù chưa tới 24.576 ký tự.
    const body = await validReport({ logs: { app: "ế".repeat(8_193), asr: "", llama: "" } });
    expect(parseReport(body, T0)).toEqual({ ok: false, field: "logs" });
    const fits = await validReport({ logs: { app: "ế".repeat(8_192), asr: "", llama: "" } });
    expect(parseReport(fits, T0).ok).toBe(true);
  });
});

describe("findReportSensitive", () => {
  it("báo quy tắc khớp ở message, chip, model_pack hay một log; sạch thì null", async () => {
    expect(findReportSensitive(await makeReport())).toBeNull();
    const key = "7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF";
    expect(findReportSensitive(await makeReport({ message: `key ${key}` }))).toBe("license_key");
    expect(findReportSensitive(await makeReport({ hw: { chip: "a@b.co", ram_mb: null, gpu_backend: null } }))).toBe("email");
    expect(findReportSensitive(await makeReport({ model_pack: "/Users/bob/x" }))).toBe("home_path");
    expect(findReportSensitive(await makeReport({ logs: { app: "", asr: "Bearer abcdef0123456789", llama: "" } }))).toBe("bearer");
    expect(findReportSensitive(await makeReport({ logs: { app: "", asr: "", llama: "/home/carol/x" } }))).toBe("home_path");
  });
});

describe("lưu và dọn", () => {
  const ids = async () => (await env.DB.prepare("SELECT id FROM error_reports ORDER BY id").all<{ id: string }>()).results.map((r) => r.id);
  const logIds = async () => (await env.DB.prepare("SELECT id FROM error_report_logs ORDER BY id").all<{ id: string }>()).results.map((r) => r.id);
  const seed = async (id: string, receivedAt: number) => env.DB.batch(insertReportStatements(env.DB, await makeReport({ id }), receivedAt));

  it("insertReportStatements ghi metadata và log; ghi lại cùng id thì không đổi gì (một dòng mỗi bảng)", async () => {
    await seed("R-0000-0001", T0);
    await seed("R-0000-0001", T0 + 5);
    expect(await ids()).toEqual(["R-0000-0001"]);
    expect(await logIds()).toEqual(["R-0000-0001"]);
    expect(await env.DB.prepare("SELECT received_at, app_log FROM error_report_logs l JOIN error_reports r ON r.id = l.id").first()).toEqual({
      received_at: T0,
      app_log: "[2026-10-17][05:07:12][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr }\n",
    });
  });

  it("xóa báo cáo quá 30 ngày cả hai bảng, giữ báo cáo còn hạn", async () => {
    await seed("R-0000-0001", T0 - RETENTION_SECONDS - 1);
    await seed("R-0000-0002", T0 - RETENTION_SECONDS + 60);
    await pruneErrorReports(env.DB, T0);
    expect(await ids()).toEqual(["R-0000-0002"]);
    expect(await logIds()).toEqual(["R-0000-0002"]);
  });

  it("vượt trần thì xóa báo cáo cũ nhất, giữ đúng số mới nhất", async () => {
    for (let n = 1; n <= 6; n++) await seed(`R-0000-000${n}`, T0 - n * 60);
    await pruneErrorReports(env.DB, T0, 4);
    expect(await ids()).toEqual(["R-0000-0001", "R-0000-0002", "R-0000-0003", "R-0000-0004"]);
    expect(await logIds()).toEqual(["R-0000-0001", "R-0000-0002", "R-0000-0003", "R-0000-0004"]);
  });

  it("trần mặc định là 3.000 và hạn mặc định là 30 ngày", () => {
    expect(MAX_STORED_REPORTS).toBe(3000);
    expect(RETENTION_SECONDS).toBe(30 * 86400);
  });
});
