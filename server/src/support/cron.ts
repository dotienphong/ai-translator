// Việc định kỳ của chat hỗ trợ trong cron */5 (spec 2026-10-22 §2.6): gửi lại tin chưa tới Zalo, gửi email câu trả lời cho
// khách đã rời khung chat, xóa cuộc chat quá 90 ngày.
import { raiseAlert } from "../alerts";
import type { Deps } from "../deps";
import { EmailProviderError, maskEmail } from "../email/provider";
import { supportReplyEmail } from "../email/templates";
import type { Lang } from "../lang";
import { FORWARD_WINDOW, forwardBatch, MAX_ATTEMPTS } from "./forward";
import { getSetting, setSetting } from "./store";

/** Cuộc chat không có hoạt động trong 90 ngày thì bị xóa. */
export const KEEP_SECONDS = 90 * 86400;
/** Câu trả lời khách chưa nhận sau 2 phút thì gửi email (nếu khách để lại email). */
const EMAIL_AFTER = 120;
/** Tối đa một thư mỗi giờ cho mỗi cuộc chat. */
const EMAIL_EVERY = 3600;
const FAIL_STREAK_ALERT = 3;
const BATCH = 50;
/** Trần tổng số tin gửi lại trong một lần chạy cron. */
export const MAX_PER_RUN = 100;
/** Dòng `support_zalo_updates` giữ 2 ngày: Zalo chỉ gửi lại sự kiện trong thời gian ngắn. */
const ZALO_UPDATES_KEEP = 2 * 86400;
const EMAIL_BATCH = 20;

/**
 * Gửi lại tin chờ của tối đa 50 cuộc chat đang mở (tin bị Zalo từ chối 5 lần thì bỏ qua), tổng tối đa 100 tin mỗi lần chạy.
 * Lỗi ở một cuộc chat thì đi tiếp cuộc chat khác (lỗi có thể do nội dung riêng của cuộc chat đó); đủ 3 lần gửi lỗi trong một lần chạy
 * thì dừng, vì Zalo đang lỗi chung. Chuỗi lỗi: về 0 khi gửi được ít nhất một tin hay không còn tin chờ; tăng khi lần chạy có lỗi mà
 * không gửi được tin nào, tới 3 thì cảnh báo support_zalo_failed (gộp theo giờ như mọi cảnh báo).
 */
export async function forwardPendingSupport(db: D1Database, deps: Pick<Deps, "zalo">, now: number): Promise<void> {
  if (!deps.zalo) return;
  const { results } = await db
    .prepare(
      `SELECT DISTINCT m.conversation_id AS id FROM support_messages m
       JOIN support_conversations c ON c.id = m.conversation_id
       WHERE c.status = 'open' AND m.sender = 'customer' AND m.forwarded_at IS NULL AND m.created_at >= ? AND m.forward_attempts < ?
       ORDER BY m.conversation_id LIMIT ?`,
    )
    .bind(now - FORWARD_WINDOW, MAX_ATTEMPTS, BATCH)
    .all<{ id: number }>();
  let sent = 0;
  let failures = 0;
  for (const { id } of results) {
    if (sent >= MAX_PER_RUN) break;
    const batch = await forwardBatch(db, deps.zalo, id, now, MAX_PER_RUN - sent);
    sent += batch.sent;
    if (batch.result === "failed" && ++failures >= FAIL_STREAK_ALERT) break;
  }
  if (sent > 0 || results.length === 0) {
    await setSetting(db, "zalo_fail_streak", "0");
  } else if (failures > 0) {
    const streak = Number((await getSetting(db, "zalo_fail_streak")) ?? "0") + 1;
    await setSetting(db, "zalo_fail_streak", String(streak));
    if (streak >= FAIL_STREAK_ALERT) await raiseAlert(db, "support_zalo_failed", now);
  }
}

/** Gửi email câu trả lời chưa nhận cho khách có email. Trả số thư đã gửi. */
export async function sendSupportEmails(db: D1Database, deps: Pick<Deps, "email">, now: number): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.email, c.lang, MAX(c.delivered_owner_id, c.emailed_owner_id) AS seen
       FROM support_conversations c
       WHERE c.email IS NOT NULL AND c.status = 'open'
         AND (c.emailed_at IS NULL OR c.emailed_at <= ?1 - ?3)
         AND EXISTS (SELECT 1 FROM support_messages m
                     WHERE m.conversation_id = c.id AND m.sender = 'owner'
                       AND m.id > MAX(c.delivered_owner_id, c.emailed_owner_id) AND m.created_at <= ?1 - ?2)
       ORDER BY c.id LIMIT ?4`,
    )
    .bind(now, EMAIL_AFTER, EMAIL_EVERY, EMAIL_BATCH)
    .all<{ id: number; email: string; lang: Lang; seen: number }>();
  let sent = 0;
  for (const conv of results) {
    const { results: replies } = await db
      .prepare("SELECT id, text FROM support_messages WHERE conversation_id = ? AND sender = 'owner' AND id > ? ORDER BY id LIMIT 50")
      .bind(conv.id, conv.seen)
      .all<{ id: number; text: string }>();
    const last = replies.at(-1);
    if (!last) continue;
    // Thư viết bằng ngôn ngữ của cuộc chat (app gửi ngôn ngữ giao diện, website gửi ngôn ngữ trang), tiếng Anh ở dưới (spec 2026-10-23).
    const { subject, html, text } = supportReplyEmail(conv.lang, replies.map((r) => r.text));
    const markSent = () =>
      db.prepare("UPDATE support_conversations SET emailed_at = ?2, emailed_owner_id = ?3 WHERE id = ?1").bind(conv.id, now, last.id).run();
    try {
      await deps.email.send({ to: conv.email, subject, text, html, idempotencyKey: `support-${conv.id}-${last.id}` });
      await markSent();
      sent++;
    } catch (err) {
      const permanent = err instanceof EmailProviderError && err.permanent;
      const alreadySent = err instanceof EmailProviderError && err.alreadySent;
      console.error(JSON.stringify({ event: "support_email_failed", to: maskEmail(conv.email), permanent, already_sent: alreadySent, error: String(err) }));
      // Lỗi vĩnh viễn (địa chỉ sai) hay đã gửi rồi: đánh dấu để không thử lại mãi. Lỗi tạm: để lần cron sau.
      if (permanent || alreadySent) await markSent();
    }
  }
  return sent;
}

export async function pruneSupport(db: D1Database, now: number): Promise<void> {
  const cutoff = now - KEEP_SECONDS;
  await db.batch([
    db.prepare("DELETE FROM support_messages WHERE conversation_id IN (SELECT id FROM support_conversations WHERE last_activity_at < ?)").bind(cutoff),
    db.prepare("DELETE FROM support_conversations WHERE last_activity_at < ?").bind(cutoff),
    db.prepare("DELETE FROM support_zalo_updates WHERE received_at < ?").bind(now - ZALO_UPDATES_KEEP),
  ]);
}
