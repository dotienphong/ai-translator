import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto";
import { insertReportStatements } from "../src/error-reports";
import { lastAudit, makeAdmin } from "./admin-harness";
import { resetDb } from "./db";
import { makeReport } from "./report-fixture";
import { T0 } from "./world";

beforeEach(resetDb);

const FP_A = "aaaaaaaaaaaaaaaa";
const FP_B = "bbbbbbbbbbbbbbbb";
const rid = (n: number) => `R-0000-${String(n).padStart(4, "0")}`;

async function seed(overrides: Record<string, unknown>, receivedAt: number) {
  const report = await makeReport(overrides);
  await env.DB.batch(insertReportStatements(env.DB, report, receivedAt));
  return report;
}

/**
 * 1: nhóm A, máy d1, bản 0.1.9; 2: nhóm A, máy d2, bản 0.1.10; 3: nhóm B (crash, build debug); 4: báo cáo manual.
 */
async function seedBasic() {
  const d1 = await sha256Hex("admin-report-d1");
  const d2 = await sha256Hex("admin-report-d2");
  await seed({ id: rid(1), fingerprint: FP_A, device_id_hash: d1, app: { version: "0.1.9" } }, T0 - 100);
  await seed({ id: rid(2), fingerprint: FP_A, device_id_hash: d2, app: { version: "0.1.10" } }, T0 - 50);
  await seed({ id: rid(3), kind: "crash", code: "panic", fingerprint: FP_B, build: "debug", device_id_hash: d1 }, T0 - 10);
  await seed({ id: rid(4), kind: "manual", code: null, fingerprint: "0000000000000000", device_id_hash: d2 }, T0);
  return { d1, d2 };
}

const items = (body: Record<string, unknown>) => body.items as Record<string, unknown>[];

describe("GET /admin/error-groups", () => {
  it("nhóm theo dấu vân tay, bỏ báo cáo manual và nhóm chỉ có báo cáo debug; có số liệu và các phiên bản", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    const res = await adminCall("/admin/error-groups");
    expect(res.status).toBe(200);
    expect(res.body.next_cursor).toBeNull();
    expect(items(res.body)).toEqual([
      {
        fingerprint: FP_A,
        kind: "session_error",
        code: "sidecarFailed",
        reports: 2,
        devices: 2,
        release_reports: 2,
        debug_reports: 0,
        first_at: T0 - 100,
        last_at: T0 - 50,
        versions: ["0.1.10", "0.1.9"],
      },
    ]);
  });

  it("include_debug=1 hiện cả nhóm chỉ có báo cáo debug, mới nhất ở trên; lọc theo kind và app_version", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    expect(items((await adminCall("/admin/error-groups?include_debug=1")).body).map((g) => g.fingerprint)).toEqual([FP_B, FP_A]);
    expect(items((await adminCall("/admin/error-groups?include_debug=1&kind=crash")).body).map((g) => g.fingerprint)).toEqual([FP_B]);
    expect(items((await adminCall("/admin/error-groups?app_version=0.1.9")).body).map((g) => g.fingerprint)).toEqual([FP_A]);
    expect(items((await adminCall("/admin/error-groups?app_version=9.9.9")).body)).toEqual([]);
  });

  it("tham số sai: 400 kèm tên tham số", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/error-groups?kind=manual")).toMatchObject({ status: 400, body: { field: "kind" } });
    expect(await adminCall("/admin/error-groups?app_version=%24%24")).toMatchObject({ status: 400, body: { field: "app_version" } });
    expect(await adminCall("/admin/error-groups?cursor=abc")).toMatchObject({ status: 400, body: { field: "cursor" } });
  });

  it("phân trang theo con trỏ: 50 nhóm mỗi trang, trang sau không lặp", async () => {
    const { adminCall } = makeAdmin();
    for (let start = 1; start <= 51; start += 17) {
      const stmts: D1PreparedStatement[] = [];
      for (let i = start; i < start + 17 && i <= 51; i++) {
        const report = await makeReport({ id: `R-0001-${String(i).padStart(4, "0")}`, fingerprint: i.toString(16).padStart(16, "0") });
        stmts.push(...insertReportStatements(env.DB, report, T0 - i));
      }
      await env.DB.batch(stmts);
    }
    const first = await adminCall("/admin/error-groups");
    expect(items(first.body)).toHaveLength(50);
    expect(first.body.next_cursor).toEqual(expect.stringMatching(/^\d+_[0-9a-f]{16}$/));
    const second = await adminCall(`/admin/error-groups?cursor=${first.body.next_cursor as string}`);
    expect(items(second.body)).toHaveLength(1);
    expect(second.body.next_cursor).toBeNull();
    const all = [...items(first.body), ...items(second.body)].map((g) => g.fingerprint);
    expect(new Set(all).size).toBe(51);
  });
});

describe("GET /admin/error-reports", () => {
  it("mặc định hiện báo cáo release (kể cả manual), mới nhất trước, không có log", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    const res = await adminCall("/admin/error-reports");
    expect(items(res.body).map((r) => r.id)).toEqual([rid(4), rid(2), rid(1)]);
    expect(Object.keys(items(res.body)[1]!).sort()).toEqual(
      [
        "arch", "build", "chip", "code", "device_id_hash", "fingerprint", "gpu_backend", "id", "kind", "message", "model_pack", "occurred_at",
        "os_name", "os_version", "plan", "ram_mb", "received_at", "app_version", "ui_lang",
      ].sort(),
    );
    expect(items(res.body)[1]).toMatchObject({ id: rid(2), received_at: T0 - 50, occurred_at: T0 - 60, app_version: "0.1.10", kind: "session_error" });
  });

  it("lọc theo fingerprint, kind, mã báo cáo (chữ thường cũng được), máy; include_debug=1 hiện thêm báo cáo debug", async () => {
    const { adminCall } = makeAdmin();
    const { d1 } = await seedBasic();
    const ids = async (query: string) => items((await adminCall(`/admin/error-reports${query}`)).body).map((r) => r.id);
    expect(await ids(`?fingerprint=${FP_A}`)).toEqual([rid(2), rid(1)]);
    expect(await ids("?kind=manual")).toEqual([rid(4)]);
    expect(await ids(`?report=${rid(2).toLowerCase()}`)).toEqual([rid(2)]);
    expect(await ids(`?device=${d1}`)).toEqual([rid(1)]);
    expect(await ids(`?device=${d1}&include_debug=1`)).toEqual([rid(3), rid(1)]);
    expect(await ids("?include_debug=1")).toEqual([rid(4), rid(3), rid(2), rid(1)]);
  });

  it("tham số sai: 400 kèm tên tham số", async () => {
    const { adminCall } = makeAdmin();
    for (const [query, field] of [["kind=bad", "kind"], ["fingerprint=zz", "fingerprint"], ["device=short", "device"], ["report=abc", "report"]] as const) {
      expect(await adminCall(`/admin/error-reports?${query}`)).toMatchObject({ status: 400, body: { field } });
    }
  });

  it("nhật ký: mỗi lần xem ghi một dòng list_viewed không chứa mã máy", async () => {
    const { adminCall } = makeAdmin();
    const { d1 } = await seedBasic();
    await adminCall(`/admin/error-reports?device=${d1}&include_debug=1`);
    const log = (await lastAudit()) as { actor: string; action: string; detail: string };
    expect(log).toMatchObject({ actor: "admin:ops@example.com", action: "list_viewed" });
    expect(JSON.parse(log.detail)).toEqual({ resource: "error_reports", filters: { device: "1", include_debug: "1" }, count: 2 });
    expect(log.detail).not.toContain(d1);
  });
});

describe("GET /admin/error-reports/:id", () => {
  it("trả metadata và ba log, ghi nhật ký error_report_viewed chỉ có mã báo cáo", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    const res = await adminCall(`/admin/error-reports/${rid(1)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: rid(1),
      kind: "session_error",
      code: "sidecarFailed",
      fingerprint: FP_A,
      app_version: "0.1.9",
      chip: "Apple M4 Pro",
      logs: {
        app: "[2026-10-17][05:07:12][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr }\n",
        asr: "ggml_metal_init: error: failed to load\n",
        llama: "0.00.289.523 W load: special_eos_id is not in special_eog_ids\n",
      },
    });
    const log = (await lastAudit()) as { action: string; detail: string };
    expect(log.action).toBe("error_report_viewed");
    expect(JSON.parse(log.detail)).toEqual({ id: rid(1) });
  });

  it("không có báo cáo: 404; mã sai định dạng: 400", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    expect(await adminCall(`/admin/error-reports/${rid(99)}`)).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect(await adminCall("/admin/error-reports/abc")).toMatchObject({ status: 400, body: { field: "id" } });
  });
});

describe("POST /admin/error-reports/delete", () => {
  const remaining = async () => (await env.DB.prepare("SELECT id FROM error_reports ORDER BY id").all<{ id: string }>()).results.map((r) => r.id);
  const remainingLogs = async () => (await env.DB.prepare("SELECT id FROM error_report_logs ORDER BY id").all<{ id: string }>()).results.map((r) => r.id);

  it("xóa một báo cáo theo mã: cả hai bảng, có nhật ký với số lượng", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    expect(await adminCall("/admin/error-reports/delete", { body: { id: rid(1) } })).toEqual({ status: 200, body: { deleted: 1 } });
    expect(await remaining()).toEqual([rid(2), rid(3), rid(4)]);
    expect(await remainingLogs()).toEqual([rid(2), rid(3), rid(4)]);
    const log = (await lastAudit()) as { action: string; detail: string };
    expect(log.action).toBe("error_reports_deleted");
    expect(JSON.parse(log.detail)).toEqual({ id: rid(1), count: 1 });
  });

  it("xóa cả nhóm theo fingerprint (kể cả báo cáo debug của nhóm)", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    expect(await adminCall("/admin/error-reports/delete", { body: { fingerprint: FP_A } })).toEqual({ status: 200, body: { deleted: 2 } });
    expect(await remaining()).toEqual([rid(3), rid(4)]);
    expect(await remainingLogs()).toEqual([rid(3), rid(4)]);
    expect(JSON.parse(((await lastAudit()) as { detail: string }).detail)).toEqual({ fingerprint: FP_A, count: 2 });
  });

  it("không có gì để xóa: 404; thiếu hay thừa khóa, định dạng sai: 400", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    expect(await adminCall("/admin/error-reports/delete", { body: { id: rid(99) } })).toMatchObject({ status: 404 });
    expect(await adminCall("/admin/error-reports/delete", { body: {} })).toMatchObject({ status: 400 });
    expect(await adminCall("/admin/error-reports/delete", { body: { id: rid(1), fingerprint: FP_A } })).toMatchObject({ status: 400 });
    expect(await adminCall("/admin/error-reports/delete", { body: { id: "abc" } })).toMatchObject({ status: 400 });
    expect(await remaining()).toHaveLength(4);
  });
});

describe("Access và chống CSRF", () => {
  it("không qua Access: 403 ở mọi route; GET từ trang khác: 403; POST từ trang khác: 403", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    for (const path of ["/admin/error-groups", "/admin/error-reports", `/admin/error-reports/${rid(1)}`]) {
      expect((await adminCall(path, { operator: null })).status).toBe(403);
      expect((await adminCall(path, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    }
    expect((await adminCall("/admin/error-reports/delete", { body: { id: rid(1) }, operator: null })).status).toBe(403);
    expect((await adminCall("/admin/error-reports/delete", { body: { id: rid(1) }, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM error_reports").first()).toEqual({ n: 4 });
  });
});
