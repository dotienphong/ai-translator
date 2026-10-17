import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendAlerts } from "../src/alerts";
import { sha256Hex } from "../src/crypto";
import { hit, LIMITS } from "../src/ratelimit";
import { resetDb } from "./db";
import { validReport } from "./report-fixture";
import { makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

type World = ReturnType<typeof makeWorld>;
const send = (w: World, body: unknown, headers: Record<string, string> = {}) => w.call("POST", "/v1/diagnostics", body, headers);
const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;
const alertRows = () => env.DB.prepare("SELECT kind, count FROM ops_alerts ORDER BY kind").all().then((r) => r.results);
const rid = (n: number) => `R-0000-${String(n).padStart(4, "0")}`;
const device = (n: number) => sha256Hex(`diag-device-${n}`);

describe("POST /v1/diagnostics (spec 2026-10-17 §3)", () => {
  it("báo cáo hợp lệ: 202 kèm mã báo cáo, lưu metadata theo giờ server và log", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    const body = await validReport();
    expect(await send(w, body)).toMatchObject({ status: 202, body: { id: "R-7F3K-92QD" } });
    expect(
      await env.DB.prepare(
        "SELECT received_at, occurred_at, kind, code, fingerprint, build, app_version, os_name, os_version, arch, chip, ram_mb, gpu_backend, model_pack, plan, ui_lang, device_id_hash, message FROM error_reports",
      ).first(),
    ).toEqual({
      received_at: T0,
      occurred_at: T0 - 60,
      kind: "session_error",
      code: "sidecarFailed",
      fingerprint: "3fa1c09be2d47a55",
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
      device_id_hash: body.device_id_hash,
      message: "tiến trình phụ không khởi động được",
    });
    const logs = body.logs as { app: string; asr: string; llama: string };
    expect(await env.DB.prepare("SELECT id, app_log, asr_log, llama_log FROM error_report_logs").first()).toEqual({
      id: "R-7F3K-92QD",
      app_log: logs.app,
      asr_log: logs.asr,
      llama_log: logs.llama,
    });
  });

  it("gửi lại cùng mã báo cáo (app thử lại sau lỗi mạng): vẫn 202, không tạo bản trùng, không báo động lần hai", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    const body = await validReport();
    expect((await send(w, body)).status).toBe(202);
    expect((await send(w, body)).status).toBe(202);
    expect(await count("error_reports")).toBe(1);
    expect(await count("error_report_logs")).toBe(1);
    expect(await alertRows()).toEqual([{ kind: "error_report_new", count: 1 }]);
  });

  it("cảnh báo error_report_new mỗi dấu vân tay mới một lần; báo cáo manual không cảnh báo", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    await send(w, await validReport({ id: rid(1) }));
    await send(w, await validReport({ id: rid(2) }));
    expect(await alertRows()).toEqual([{ kind: "error_report_new", count: 1 }]);
    // Máy khác nhau cho hai báo cáo cuối: hạn mức 3 báo cáo mỗi giờ của một máy sẽ chặn báo cáo thứ 4 của cùng một máy.
    await send(w, await validReport({ id: rid(3), fingerprint: "aaaaaaaaaaaaaaaa", device_id_hash: await device(3) }));
    expect(await alertRows()).toEqual([{ kind: "error_report_new", count: 2 }]);
    await send(w, await validReport({ id: rid(4), kind: "manual", code: null, fingerprint: "0000000000000000", device_id_hash: await device(4) }));
    expect(await alertRows()).toEqual([{ kind: "error_report_new", count: 2 }]);
    expect(await count("error_reports")).toBe(4);
  });

  it("email cảnh báo chỉ có số lượng, không có nội dung log hay mã máy", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld({ OPERATOR_EMAIL: "ops@example.com" });
    const body = await validReport({ logs: { app: "dong-log-rieng-biet-123\n", asr: "", llama: "" } });
    await send(w, body);
    expect(await sendAlerts({ ...env, OPERATOR_EMAIL: "ops@example.com" }, w.deps.email, T0 + 300)).toBe(1);
    const mail = w.resend.sent.at(-1)!;
    expect(mail.subject).toBe("[license test] Cảnh báo: error_report_new (1)");
    expect(mail.text).not.toContain("dong-log-rieng-biet-123");
    expect(mail.text).not.toContain(String(body.device_id_hash));
  });

  it("Content-Type không phải JSON: 415", async () => {
    const w = makeWorld();
    const res = await send(w, JSON.stringify(await validReport()), { "content-type": "text/plain" });
    expect(res).toMatchObject({ status: 415, body: { error: "unsupported_media_type" } });
    expect(await count("error_reports")).toBe(0);
  });

  it("thân quá 80 KB: 413; route khác của /v1 vẫn giữ trần 16 KiB; báo cáo đầy log (khoảng 58 KB) vẫn nhận được", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    expect(await send(w, "x".repeat(81 * 1024))).toMatchObject({ status: 413, body: { error: "invalid_request" } });
    expect(await w.call("POST", "/v1/trial", "x".repeat(20 * 1024))).toMatchObject({ status: 413 });
    const full = await validReport({ logs: { app: "a ".repeat(12 * 1024), asr: "b ".repeat(8 * 1024), llama: "c ".repeat(8 * 1024) } });
    expect(await send(w, full)).toMatchObject({ status: 202 });
  });

  it("thân không phải object JSON: 400", async () => {
    const w = makeWorld();
    expect(await send(w, "[1,2]")).toMatchObject({ status: 400, body: { error: "invalid_request", field: "body" } });
    expect(await send(w, "không phải json")).toMatchObject({ status: 400, body: { error: "invalid_request", field: "body" } });
  });

  it.each([
    ["v", { v: 2 }],
    ["kind", { kind: "other" }],
    ["fingerprint", { fingerprint: "XYZ" }],
    ["at", { at: T0 - 8 * 86400 }],
    ["device_id_hash", { device_id_hash: "abc" }],
    ["logs", { logs: { app: "x".repeat(24 * 1024 + 1), asr: "", llama: "" } }],
  ])("%s sai: 400 kèm tên trường, không lưu gì", async (field, patch) => {
    const w = makeWorld();
    expect(await send(w, await validReport(patch))).toMatchObject({ status: 400, body: { error: "invalid_request", field } });
    expect(await count("error_reports")).toBe(0);
  });

  it("còn dữ liệu nhạy cảm sau khi app đã che: 422 kèm tên quy tắc, không lưu, log cảnh báo không chứa nội dung", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    const key = "7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF";
    const inLog = await validReport({ logs: { app: `dòng có key ${key}\n`, asr: "", llama: "" } });
    expect(await send(w, inLog)).toMatchObject({ status: 422, body: { error: "rejected_sensitive", rule: "license_key" } });
    const inMessage = await validReport({ id: rid(2), message: "lỗi ở /Users/bob/Library/x" });
    expect(await send(w, inMessage)).toMatchObject({ status: 422, body: { error: "rejected_sensitive", rule: "home_path" } });
    expect(await count("error_reports")).toBe(0);
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("diagnostics_rejected_sensitive");
    expect(logged).not.toContain(key);
    expect(logged).not.toContain("/Users/bob");
  });

  it("giới hạn theo máy: 3 báo cáo mỗi giờ, báo cáo thứ 4 bị 429 kèm Retry-After, giờ sau mở lại", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    for (let n = 1; n <= LIMITS.diag_device; n++) expect((await send(w, await validReport({ id: rid(n) }))).status).toBe(202);
    const blocked = await send(w, await validReport({ id: rid(9) }));
    expect(blocked).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(blocked.headers.get("retry-after")).toBe("3600");
    expect(await count("error_reports")).toBe(3);
    w.clock.now = T0 + 3600;
    expect((await send(w, await validReport({ id: rid(9), at: T0 + 3600 - 60 }))).status).toBe(202);
  });

  it("giới hạn theo IP: 30 báo cáo mỗi giờ (máy khác nhau), báo cáo thứ 31 bị 429; IP khác vẫn gửi được", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    for (let n = 1; n <= LIMITS.diag_ip; n++) {
      expect((await send(w, await validReport({ id: rid(n), device_id_hash: await device(n) }))).status).toBe(202);
    }
    expect((await send(w, await validReport({ id: rid(99), device_id_hash: await device(99) }))).status).toBe(429);
    const other = await send(w, await validReport({ id: rid(98), device_id_hash: await device(98) }), { "cf-connecting-ip": "198.51.100.7" });
    expect(other.status).toBe(202);
  });

  it("giới hạn toàn hệ thống: chạm ngưỡng thì 429 và đúng một cảnh báo diagnostics_flood mỗi giờ", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    for (let i = 0; i < LIMITS.diag_global; i++) await hit(env, "diag_global", "all", T0);
    expect((await send(w, await validReport())).status).toBe(429);
    expect((await send(w, await validReport({ id: rid(2) }))).status).toBe(429);
    expect(await alertRows()).toEqual([{ kind: "diagnostics_flood", count: 1 }]);
    expect(await count("error_reports")).toBe(0);
  });
});
