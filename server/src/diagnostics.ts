// POST /v1/diagnostics (spec 2026-10-17-diagnostics-reports-design.md §3): app gửi báo cáo lỗi đã che dữ liệu cá nhân. Không cần
// token (app có thể chưa có, ví dụ chết lúc onboarding); chống lạm dụng bằng kích thước, schema và ba hạn mức theo giờ.
// Server không tin app đã che: mọi chuỗi qua bộ phát hiện (diagnostics-scan.ts), còn dữ liệu nhạy cảm thì 422 và không lưu.
import type { Hono } from "hono";
import { raiseAlert } from "./alerts";
import type { AppEnv } from "./app";
import { findReportSensitive, insertReportStatements, parseReport } from "./error-reports";
import { clientIp, fail, readJson, tooMany } from "./http";
import { hit, LIMITS } from "./ratelimit";

export const DIAGNOSTICS_PATH = "/v1/diagnostics";

export function registerDiagnostics(app: Hono<AppEnv>) {
  app.post(DIAGNOSTICS_PATH, async (c) => {
    const db = c.env.DB;
    const now = c.get("deps").now();
    // Đếm trước khi đọc thân: request sai cũng tốn hạn mức của IP, nên không dò schema vô hạn được.
    const ip = await hit(c.env, "diag_ip", clientIp(c), now);
    if (!ip.allowed) return tooMany(c, ip.retryAfter);
    const global = await hit(c.env, "diag_global", "all", now);
    if (!global.allowed) {
      // Đúng lần từ chối đầu tiên của giờ này: một cảnh báo, không phải mỗi request.
      if (global.count === LIMITS.diag_global + 1) await raiseAlert(db, "diagnostics_flood", now);
      return tooMany(c, global.retryAfter);
    }
    const parsed = parseReport(await readJson(c), now);
    if (!parsed.ok) return fail(c, 400, "invalid_request", { field: parsed.field });
    const report = parsed.report;
    const device = await hit(c.env, "diag_device", report.device_id_hash, now);
    if (!device.allowed) return tooMany(c, device.retryAfter);
    const rule = findReportSensitive(report);
    if (rule !== null) {
      // Chỉ ghi tên quy tắc và loại báo cáo: không ghi nội dung, vì đó chính là thứ không được lưu.
      console.warn(JSON.stringify({ event: "diagnostics_rejected_sensitive", rule, kind: report.kind }));
      return fail(c, 422, "rejected_sensitive", { rule });
    }
    const seen =
      report.kind === "manual" ||
      (await db.prepare("SELECT 1 AS seen FROM error_reports WHERE fingerprint = ? LIMIT 1").bind(report.fingerprint).first()) !== null;
    const [inserted] = await db.batch(insertReportStatements(db, report, now));
    const isNew = inserted?.meta.changes === 1;
    if (isNew && !seen) await raiseAlert(db, "error_report_new", now);
    console.log(JSON.stringify({ event: "diagnostics_stored", kind: report.kind, code: report.code, fingerprint: report.fingerprint, duplicate: !isNew }));
    return c.json({ id: report.id }, 202);
  });
}
