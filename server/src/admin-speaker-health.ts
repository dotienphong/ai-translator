// Route admin cho tình trạng bộ đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.2): bảng theo app họp, phiên bản app họp và
// hệ điều hành; kết quả kiểm tra tự động hằng ngày; mẫu chỉ báo tự học mới nhất. Chỉ đọc, không có tên người trong dữ liệu. Mỗi lần
// xem ghi một dòng list_viewed (như danh sách của admin-read.ts), nhật ký chỉ có số ngày và số dòng.
import type { Hono } from "hono";
import { type AdminAppEnv, crossSite } from "./admin-auth";
import { audit } from "./audit";
import { fail } from "./http";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;
const MAX_ROWS = 200;
const MAX_PATTERN_ROWS = 20;
const CANARY_DAYS = 14;

export function registerAdminSpeakerHealth(app: Hono<AdminAppEnv>): void {
  app.get("/admin/speaker-health", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const raw = c.req.query("days");
    const days = raw === undefined ? DEFAULT_DAYS : /^\d{1,2}$/.test(raw) ? Number(raw) : 0;
    if (days < 1 || days > MAX_DAYS) return fail(c, 400, "invalid_request", { field: "days" });
    const db = c.env.DB;
    const now = c.get("deps").now();
    const [rows, canary, patterns] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `SELECT meeting_app, meeting_version, os_name, COUNT(*) AS reports, COUNT(DISTINCT device_id_hash) AS devices,
                  COUNT(DISTINCT CASE WHEN state IN ('no_names', 'no_speaking', 'blocked') THEN device_id_hash END) AS broken_devices,
                  SUM(state = 'ok') AS ok, SUM(state = 'no_names') AS no_names, SUM(state = 'no_speaking') AS no_speaking,
                  SUM(state = 'no_permission') AS no_permission, SUM(state = 'blocked') AS blocked,
                  SUM(minutes_ok) AS minutes_ok, SUM(minutes_total) AS minutes_total,
                  MAX(recipe_version) AS recipe_version, MAX(received_at) AS last_at
           FROM speaker_health WHERE canary = 0 AND build = 'release' AND received_at >= ?1
           GROUP BY meeting_app, meeting_version, os_name
           ORDER BY meeting_app, meeting_version DESC, os_name LIMIT ?2`,
        )
        .bind(now - days * 86400, MAX_ROWS),
      db
        .prepare(
          `SELECT meeting_app, meeting_version, os_name, day, state, recipe_version, app_version
           FROM speaker_health WHERE canary = 1 AND received_at >= ?1
           ORDER BY day DESC, meeting_app, os_name LIMIT ?2`,
        )
        .bind(now - CANARY_DAYS * 86400, MAX_ROWS),
      db
        .prepare(
          `SELECT meeting_app, meeting_version, day, recipe_version, patterns
           FROM speaker_health WHERE build = 'release' AND patterns <> '[]' AND received_at >= ?1
           ORDER BY received_at DESC LIMIT ?2`,
        )
        .bind(now - days * 86400, MAX_PATTERN_ROWS),
    ]);
    const body = {
      generated_at: now,
      days,
      rows: rows?.results ?? [],
      canary: canary?.results ?? [],
      // `patterns` là JSON do server tự dựng từ dữ liệu đã kiểm; trả dạng đối tượng, không phải chuỗi.
      patterns: (patterns?.results ?? []).map((r) => ({ ...r, patterns: JSON.parse(String(r.patterns)) as unknown })),
    };
    await audit(db, {
      at: now,
      actor: c.get("actor"),
      action: "list_viewed",
      detail: { resource: "speaker_health", filters: { days: String(days) }, count: body.rows.length },
    });
    return c.json(body);
  });
}
