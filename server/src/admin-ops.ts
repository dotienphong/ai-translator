// Trang Hệ thống của Web Admin (spec 2026-10-08-web-admin-he-thong-design.md). Chỉ đọc.
import type { Hono } from "hono";
import { type AdminAppEnv, crossSite } from "./admin-auth";
import { audit } from "./audit";
import { fail } from "./http";

/** Số dòng cảnh báo tối đa trong một phản hồi (`total` và `pending` vẫn tính trên toàn bảng). */
const ALERTS_LIMIT = 200;

export interface AlertItem {
  kind: string;
  window_start: number;
  count: number;
  notified_count: number;
  notified_at: number | null;
}

export function registerAdminOps(app: Hono<AdminAppEnv>): void {
  app.get("/admin/alerts", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const db = c.env.DB;
    const now = c.get("deps").now();
    // Hai truy vấn trong MỘT batch: danh sách và hai con số nhất quán với nhau.
    const [list, sums] = await db.batch([
      db
        .prepare(
          `SELECT kind, window_start, count, notified_count, notified_at FROM ops_alerts ORDER BY window_start DESC, kind LIMIT ${ALERTS_LIMIT}`,
        ),
      db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN count > notified_count THEN 1 ELSE 0 END), 0) AS pending FROM ops_alerts"),
    ]);
    const s = (sums?.results?.[0] ?? {}) as { total?: number; pending?: number };
    const body = { items: (list?.results ?? []) as unknown as AlertItem[], total: s.total ?? 0, pending: s.pending ?? 0 };
    await audit(db, { at: now, actor: c.get("actor"), action: "alerts_viewed" });
    return c.json(body);
  });
}
