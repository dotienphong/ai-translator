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
 * Gửi các cảnh báo chưa báo, gộp theo loại. Loại nào đã báo trong 1 giờ qua thì để lần sau.
 * Gửi lỗi thì giữ nguyên để lần cron sau thử lại (không tạo cảnh báo email_failed mới, tránh vòng lặp).
 */
export async function sendAlerts(
  env: { DB: D1Database; ENVIRONMENT: string; OPERATOR_EMAIL?: string },
  email: EmailProvider,
  now: number,
): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT kind, SUM(count - notified_count) AS count, MIN(window_start) AS since FROM ops_alerts
     WHERE count > notified_count AND window_start >= ?1 - 86400
       AND kind NOT IN (SELECT kind FROM ops_alerts WHERE notified_at > ?1 - ?2)
     GROUP BY kind ORDER BY kind`,
  )
    .bind(now, HOUR)
    .all<{ kind: AlertKind; count: number; since: number }>();
  let sent = 0;
  for (const a of results) {
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
        continue;
      }
    }
    await env.DB.prepare(
      `UPDATE ops_alerts SET notified_count = count, notified_at = ?1
       WHERE kind = ?2 AND count > notified_count AND window_start >= ?1 - 86400`,
    )
      .bind(now, a.kind)
      .run();
  }
  return sent;
}
