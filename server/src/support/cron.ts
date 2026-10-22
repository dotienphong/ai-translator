// Việc định kỳ của chat hỗ trợ trong cron */5 (spec 2026-10-22 §2.6): gửi lại tin chưa tới Zalo, gửi email câu trả lời cho
// khách đã rời khung chat, xóa cuộc chat quá 90 ngày.
import { raiseAlert } from "../alerts";
import type { Deps } from "../deps";
import { EmailProviderError, maskEmail } from "../email/provider";
import { supportReplyEmail } from "../email/templates";
import { FORWARD_WINDOW, forwardConversation } from "./forward";
import { getSetting, setSetting } from "./store";

/** Cuộc chat không có hoạt động trong 90 ngày thì bị xóa. */
export const KEEP_SECONDS = 90 * 86400;
/** Câu trả lời khách chưa nhận sau 2 phút thì gửi email (nếu khách để lại email). */
const EMAIL_AFTER = 120;
/** Tối đa một thư mỗi giờ cho mỗi cuộc chat. */
const EMAIL_EVERY = 3600;
const FAIL_STREAK_ALERT = 3;
const BATCH = 50;
const EMAIL_BATCH = 20;

/**
 * Gửi lại tin chờ của tối đa 50 cuộc chat. Gửi được ít nhất một tin thì đặt lại chuỗi lỗi; cả lần chạy chỉ có lỗi thì tăng chuỗi,
 * tới 3 thì cảnh báo support_zalo_failed (gộp theo giờ như mọi cảnh báo). Gặp lỗi ở một cuộc chat thì dừng: Zalo đang lỗi.
 */
export async function forwardPendingSupport(db: D1Database, deps: Pick<Deps, "zalo">, now: number): Promise<void> {
  if (!deps.zalo) return;
  const { results } = await db
    .prepare(
      `SELECT DISTINCT conversation_id AS id FROM support_messages
       WHERE sender = 'customer' AND forwarded_at IS NULL AND created_at >= ?
       ORDER BY conversation_id LIMIT ?`,
    )
    .bind(now - FORWARD_WINDOW, BATCH)
    .all<{ id: number }>();
  let sent = 0;
  let failed = false;
  for (const { id } of results) {
    const result = await forwardConversation(db, deps.zalo, id, now);
    if (result === "sent") sent++;
    if (result === "failed") {
      failed = true;
      break;
    }
  }
  if (sent > 0) {
    await setSetting(db, "zalo_fail_streak", "0");
  } else if (failed) {
    const streak = Number((await getSetting(db, "zalo_fail_streak")) ?? "0") + 1;
    await setSetting(db, "zalo_fail_streak", String(streak));
    if (streak >= FAIL_STREAK_ALERT) await raiseAlert(db, "support_zalo_failed", now);
  }
}

/** Gửi email câu trả lời chưa nhận cho khách có email. Trả số thư đã gửi. */
export async function sendSupportEmails(db: D1Database, deps: Pick<Deps, "email">, now: number): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.email, MAX(c.delivered_owner_id, c.emailed_owner_id) AS seen
       FROM support_conversations c
       WHERE c.email IS NOT NULL AND c.status = 'open'
         AND (c.emailed_at IS NULL OR c.emailed_at <= ?1 - ?3)
         AND EXISTS (SELECT 1 FROM support_messages m
                     WHERE m.conversation_id = c.id AND m.sender = 'owner'
                       AND m.id > MAX(c.delivered_owner_id, c.emailed_owner_id) AND m.created_at <= ?1 - ?2)
       ORDER BY c.id LIMIT ?4`,
    )
    .bind(now, EMAIL_AFTER, EMAIL_EVERY, EMAIL_BATCH)
    .all<{ id: number; email: string; seen: number }>();
  let sent = 0;
  for (const conv of results) {
    const { results: replies } = await db
      .prepare("SELECT id, text FROM support_messages WHERE conversation_id = ? AND sender = 'owner' AND id > ? ORDER BY id LIMIT 50")
      .bind(conv.id, conv.seen)
      .all<{ id: number; text: string }>();
    const last = replies.at(-1);
    if (!last) continue;
    const { subject, text } = supportReplyEmail(replies.map((r) => r.text));
    const markSent = () =>
      db.prepare("UPDATE support_conversations SET emailed_at = ?2, emailed_owner_id = ?3 WHERE id = ?1").bind(conv.id, now, last.id).run();
    try {
      await deps.email.send({ to: conv.email, subject, text, idempotencyKey: `support-${conv.id}-${last.id}` });
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
  ]);
}
