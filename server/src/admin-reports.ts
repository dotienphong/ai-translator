// Route admin cho báo cáo lỗi của app (spec 2026-10-17-diagnostics-reports-design.md §4): nhóm theo dấu vân tay, danh sách báo cáo,
// chi tiết kèm log, xóa. Danh sách đi qua listRoute của admin-read.ts (mỗi lần xem một dòng list_viewed, bộ lọc ghi vào nhật ký
// không chứa mã máy); chi tiết ghi error_report_viewed; xóa ghi error_reports_deleted. Log trả về là văn bản thô (do app gửi, đã
// che): Web Admin phải hiện dạng văn bản, không bao giờ dựng HTML từ nó.
import type { Hono } from "hono";
import { type AdminAppEnv, crossSite } from "./admin-auth";
import { type Bind, listRoute } from "./admin-read";
import { audit, auditStatement } from "./audit";
import { FINGERPRINT, REPORT_ID, REPORT_KINDS } from "./error-reports";
import { fail, parseDeviceIdHash, readJson } from "./http";

/** Loại có nhóm: báo cáo `manual` không có dấu vân tay chung nên không nằm trong danh sách nhóm. */
const GROUP_KINDS = ["crash", "session_error", "sidecar_died"] as const;
const VERSION = /^[0-9A-Za-z.+-]{1,40}$/;

const REPORT_COLUMNS = [
  "id",
  "received_at",
  "occurred_at",
  "kind",
  "code",
  "fingerprint",
  "build",
  "app_version",
  "os_name",
  "os_version",
  "arch",
  "chip",
  "ram_mb",
  "gpu_backend",
  "model_pack",
  "plan",
  "ui_lang",
  "device_id_hash",
  "message",
] as const;

/** Mỗi nhóm một dòng; kind và code không đổi trong nhóm (dấu vân tay có cả hai). */
const GROUPS = `(
  SELECT fingerprint, MIN(kind) AS kind, MIN(code) AS code, COUNT(*) AS reports, COUNT(DISTINCT device_id_hash) AS devices,
         SUM(build = 'release') AS release_reports, SUM(build = 'debug') AS debug_reports,
         MIN(received_at) AS first_at, MAX(received_at) AS last_at, GROUP_CONCAT(DISTINCT app_version) AS versions
  FROM error_reports WHERE kind <> 'manual' GROUP BY fingerprint
) g`;

/** Con trỏ "<giây>_<khóa>" cho thứ tự (thời điểm giảm dần, khóa giảm dần); `key` là mẫu regex của khóa. */
function keyset(timeColumn: string, keyColumn: string, key: string) {
  const pattern = new RegExp(`^(\\d{1,15})_(${key})$`);
  return (raw: string): [string, ...Bind[]] | null => {
    const m = pattern.exec(raw);
    if (!m) return null;
    const t = Number(m[1]);
    return [`(${timeColumn} < ? OR (${timeColumn} = ? AND ${keyColumn} < ?))`, t, t, m[2]!];
  };
}

export function registerAdminReports(app: Hono<AdminAppEnv>): void {
  listRoute(app, "/admin/error-groups", {
    resource: "error_groups",
    filters(f) {
      if (!f.oneOf("kind", GROUP_KINDS, (k) => ["g.kind = ?", k])) return "kind";
      const version = f.get("app_version");
      if (version !== undefined) {
        if (!VERSION.test(version)) return "app_version";
        f.add("g.fingerprint IN (SELECT fingerprint FROM error_reports WHERE app_version = ?)", version);
        f.applied.app_version = version;
      }
      // Mặc định chỉ nhóm có báo cáo release: báo cáo debug là của máy dev (app debug mặc định không tự gửi).
      if (f.get("include_debug") === "1") f.applied.include_debug = "1";
      else f.add("g.release_reports > 0");
      return null;
    },
    select: `SELECT g.fingerprint, g.kind, g.code, g.reports, g.devices, g.release_reports, g.debug_reports, g.first_at, g.last_at, g.versions FROM ${GROUPS}`,
    order: "ORDER BY g.last_at DESC, g.fingerprint DESC",
    cursor: keyset("g.last_at", "g.fingerprint", "[0-9a-f]{16}"),
    next: (r) => `${r.last_at}_${r.fingerprint}`,
    map: (r) => ({ ...r, versions: String(r.versions ?? "").split(",").filter((v) => v !== "").sort() }),
  });

  listRoute(app, "/admin/error-reports", {
    resource: "error_reports",
    filters(f) {
      if (!f.oneOf("kind", REPORT_KINDS, (k) => ["kind = ?", k])) return "kind";
      const fingerprint = f.get("fingerprint");
      if (fingerprint !== undefined) {
        if (!FINGERPRINT.test(fingerprint)) return "fingerprint";
        f.add("fingerprint = ?", fingerprint);
        f.applied.fingerprint = fingerprint;
      }
      const device = f.get("device");
      if (device !== undefined) {
        const hash = parseDeviceIdHash(device);
        if (!hash) return "device";
        f.add("device_id_hash = ?", hash);
        // Mã máy không vào nhật ký: chỉ ghi là có lọc theo máy.
        f.applied.device = "1";
      }
      const report = f.get("report");
      if (report !== undefined) {
        const id = report.toUpperCase();
        if (!REPORT_ID.test(id)) return "report";
        f.add("id = ?", id);
        f.applied.report = id;
      }
      if (f.get("include_debug") === "1") f.applied.include_debug = "1";
      else f.add("build = 'release'");
      return null;
    },
    select: `SELECT ${REPORT_COLUMNS.join(", ")} FROM error_reports`,
    order: "ORDER BY received_at DESC, id DESC",
    cursor: keyset("received_at", "id", "R-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}"),
    next: (r) => `${r.received_at}_${r.id}`,
  });

  app.get("/admin/error-reports/:id", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const id = c.req.param("id");
    if (!REPORT_ID.test(id)) return fail(c, 400, "invalid_request", { field: "id" });
    const row = await c.env.DB.prepare(
      `SELECT ${REPORT_COLUMNS.map((col) => `r.${col}`).join(", ")}, l.app_log, l.asr_log, l.llama_log
       FROM error_reports r JOIN error_report_logs l ON l.id = r.id WHERE r.id = ?`,
    )
      .bind(id)
      .first<Record<string, unknown>>();
    if (!row) return fail(c, 404, "not_found");
    await audit(c.env.DB, { at: c.get("deps").now(), actor: c.get("actor"), action: "error_report_viewed", detail: { id } });
    const { app_log, asr_log, llama_log, ...meta } = row;
    return c.json({ ...meta, logs: { app: app_log, asr: asr_log, llama: llama_log } });
  });

  // Xóa một báo cáo (`id`) hay cả nhóm (`fingerprint`, kể cả báo cáo debug). Không đòi `note` như các thao tác trên license: dọn báo
  // cáo là việc thường ngày và nhật ký không chứa dữ liệu cá nhân. Bảng log xóa trước bảng cha.
  app.post("/admin/error-reports/delete", async (c) => {
    const body = await readJson(c);
    const id = typeof body?.id === "string" && REPORT_ID.test(body.id) ? body.id : null;
    const fingerprint = typeof body?.fingerprint === "string" && FINGERPRINT.test(body.fingerprint) ? body.fingerprint : null;
    if ((id === null) === (fingerprint === null)) return fail(c, 400, "invalid_request", { field: "id|fingerprint" });
    const where = id !== null ? "id = ?" : "fingerprint = ?";
    const value = (id ?? fingerprint) as string;
    const db = c.env.DB;
    const found = await db.prepare(`SELECT COUNT(*) AS n FROM error_reports WHERE ${where}`).bind(value).first<{ n: number }>();
    const n = found?.n ?? 0;
    if (n === 0) return fail(c, 404, "not_found");
    await db.batch([
      auditStatement(db, {
        at: c.get("deps").now(),
        actor: c.get("actor"),
        action: "error_reports_deleted",
        detail: id !== null ? { id, count: n } : { fingerprint, count: n },
      }),
      db.prepare(`DELETE FROM error_report_logs WHERE id IN (SELECT id FROM error_reports WHERE ${where})`).bind(value),
      db.prepare(`DELETE FROM error_reports WHERE ${where}`).bind(value),
    ]);
    return c.json({ deleted: n });
  });
}
