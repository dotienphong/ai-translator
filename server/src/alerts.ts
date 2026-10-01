// Cảnh báo cho người vận hành (§10.2 "cảnh báo khi có nhiều lần kiểm tra thất bại").
// Sự kiện được đếm theo loại và theo giờ trong D1; cron gửi email tới OPERATOR_EMAIL (secret, không nằm trong repo),
// tối đa một email mỗi loại mỗi giờ. Thiếu OPERATOR_EMAIL thì chỉ ghi log.
import type { EmailProvider } from "./email/provider";

export type AlertKind = "many_failures" | "webhook_bad_signature" | "email_failed" | "license_locked" | "order_needs_review";

const ALERT_TEXT: Record<AlertKind, string> = {
  many_failures: "Một IP có từ 60 lần kiểm key hoặc activation thất bại trong 1 giờ (có thể đang dò key)",
  webhook_bad_signature: "Webhook thanh toán sai chữ ký (có thể bị giả mạo, hoặc checksum key sai)",
  email_failed: "Gửi email chứa license key thất bại (cron sẽ gửi lại)",
  license_locked: "Key bị khóa tạm vì gỡ rồi kích hoạt máy khác quá ngưỡng",
  order_needs_review: "License đã thu hồi nhận được tiền của một đơn gia hạn hay đổi gói; xử lý tay ở /admin/orders/<n>/resolve",
};
const HOUR = 3600;

export async function raiseAlert(db: D1Database, kind: AlertKind, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ops_alerts (kind, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (kind, window_start) DO UPDATE SET count = count + 1`,
    )
    .bind(kind, now - (now % HOUR))
    .run();
}

/**
 * Câu tạo cảnh báo để đặt trong batch, chỉ có tác dụng khi câu đứng ngay trước đổi đúng một dòng (`changes() = 1`).
 * Đi cùng batch với lệnh ghi dữ liệu, nên không có trường hợp dữ liệu đã đổi mà cảnh báo bị mất.
 */
export function alertIfChanged(db: D1Database, kind: AlertKind, now: number): D1PreparedStatement {
  // "WHERE" trước "ON CONFLICT" là bắt buộc khi INSERT … SELECT có upsert (tài liệu SQLite, mục "Parsing Ambiguity").
  return db
    .prepare(
      `INSERT INTO ops_alerts (kind, window_start, count) SELECT ?1, ?2, 1 WHERE changes() = 1
       ON CONFLICT (kind, window_start) DO UPDATE SET count = count + 1`,
    )
    .bind(kind, now - (now % HOUR));
}

/** Cảnh báo chỉ được gửi trong 24 giờ kể từ giờ của sự kiện. */
const REPORT_WITHIN = 86400;

interface AlertRow {
  kind: AlertKind;
  window_start: number;
  count: number;
  notified_count: number;
}

/** Gộp các dòng theo loại: số sự kiện chưa báo và giờ sớm nhất. Thứ tự theo tên loại. */
function byKind(rows: AlertRow[]): { kind: AlertKind; count: number; since: number; rows: AlertRow[] }[] {
  const groups = new Map<AlertKind, AlertRow[]>();
  for (const r of rows) groups.set(r.kind, [...(groups.get(r.kind) ?? []), r]);
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([kind, rs]) => ({
      kind,
      count: rs.reduce((n, r) => n + r.count - r.notified_count, 0),
      since: Math.min(...rs.map((r) => r.window_start)),
      rows: rs,
    }));
}

/**
 * Sự kiện chưa báo mà đã quá 24 giờ (email lỗi suốt một ngày, cron không chạy): không gửi nữa, nhưng ghi log một lần
 * rồi đánh dấu đã báo. Câu đánh dấu có điều kiện `notified_count` vẫn như lúc đọc, nên hai lần cron chồng nhau chỉ ghi một lần.
 */
async function logExpired(db: D1Database, now: number): Promise<void> {
  const { results } = await db
    .prepare("SELECT kind, window_start, count, notified_count FROM ops_alerts WHERE count > notified_count AND window_start < ?1 - ?2")
    .bind(now, REPORT_WITHIN)
    .all<AlertRow>();
  if (results.length === 0) return;
  const marked = await db.batch(
    results.map((r) =>
      db
        .prepare("UPDATE ops_alerts SET notified_count = ?3 WHERE kind = ?1 AND window_start = ?2 AND notified_count = ?4")
        .bind(r.kind, r.window_start, r.count, r.notified_count),
    ),
  );
  for (const g of byKind(results.filter((_, i) => marked[i]?.meta.changes === 1))) {
    console.warn(JSON.stringify({ event: "alert_expired_unreported", kind: g.kind, count: g.count, since: g.since }));
  }
}

/**
 * Gửi các cảnh báo chưa báo, gộp theo loại. Loại nào đã báo trong 1 giờ qua thì để lần sau.
 * - Giữ chỗ trước khi gửi: một câu UPDATE đặt notified_at cho các dòng sẽ báo và trả lại chúng (RETURNING). Lần cron
 *   chạy chồng thấy notified_at mới nên không giữ được dòng nào, không gửi trùng.
 * - Gửi xong thì đánh dấu đúng số sự kiện đã báo (số đọc được lúc giữ chỗ). Sự kiện tới trong lúc gửi còn nguyên cho lần sau.
 * - Gửi lỗi thì trả chỗ (notified_at về NULL) để lần cron sau thử lại (không tạo cảnh báo email_failed mới, tránh vòng lặp).
 */
export async function sendAlerts(
  env: { DB: D1Database; ENVIRONMENT: string; OPERATOR_EMAIL?: string },
  email: EmailProvider,
  now: number,
): Promise<number> {
  const db = env.DB;
  await logExpired(db, now);
  const { results } = await db
    .prepare(
      `UPDATE ops_alerts SET notified_at = ?1
       WHERE count > notified_count AND window_start >= ?1 - ?3
         AND kind NOT IN (SELECT kind FROM ops_alerts WHERE notified_at > ?1 - ?2)
       RETURNING kind, window_start, count, notified_count`,
    )
    .bind(now, HOUR, REPORT_WITHIN)
    .all<AlertRow>();
  let sent = 0;
  for (const a of byKind(results)) {
    console.warn(JSON.stringify({ event: "alert", kind: a.kind, count: a.count, since: a.since }));
    if (env.OPERATOR_EMAIL) {
      try {
        await email.send({
          to: env.OPERATOR_EMAIL,
          subject: `[license ${env.ENVIRONMENT}] Cảnh báo: ${a.kind} (${a.count})`,
          text: [
            ALERT_TEXT[a.kind],
            "",
            `Số lần: ${a.count}, từ ${new Date(a.since * 1000).toISOString()}.`,
            "Chi tiết ở Workers Logs và bảng audit_log (Worker admin).",
          ].join("\n"),
        });
        sent++;
      } catch (err) {
        console.error(JSON.stringify({ event: "alert_email_failed", kind: a.kind, error: String(err) }));
        await db.prepare("UPDATE ops_alerts SET notified_at = NULL WHERE kind = ? AND notified_at = ?").bind(a.kind, now).run();
        continue;
      }
    }
    await db.batch(
      a.rows.map((r) =>
        db
          .prepare("UPDATE ops_alerts SET notified_count = MAX(notified_count, ?3) WHERE kind = ?1 AND window_start = ?2")
          .bind(r.kind, r.window_start, r.count),
      ),
    );
  }
  return sent;
}
