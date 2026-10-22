// Chuyển tin của khách sang Zalo của chủ dự án (spec 2026-10-22 §2.3). Gọi ngay sau khi khách gửi (waitUntil) và từ cron (tin còn chờ).
import { customerText } from "./format";
import { conversationById } from "./store";
import type { OwnerBot } from "./zalo";

/** Tin chờ quá 24 giờ thì thôi chuyển; tin vẫn còn trong cuộc chat của khách. */
export const FORWARD_WINDOW = 86400;
/** Giữ chỗ hết hạn sau ngần này giây: Worker có thể bị dừng giữa chừng (`waitUntil` tối đa 30 giây), khi đó cron giữ chỗ lại. */
export const CLAIM_TTL = 60;
/** Trần số tin chuyển trong một lần gọi, để một cuộc chat không giữ request hay cron quá lâu. */
const MAX_PER_CALL = 25;

export type ForwardResult = "sent" | "failed" | "idle";

/**
 * Chuyển các tin khách còn chờ của một cuộc chat theo thứ tự id. Trước khi gửi, mỗi tin được giữ chỗ (đặt `claimed_at`); giữ chỗ hết hạn
 * sau 60 giây (Worker có thể bị dừng giữa chừng, `waitUntil` tối đa 30 giây; cron giữ chỗ lại). Thứ tự được giữ: bên khác thấy tin cũ nhất
 * đang được giữ chỗ còn hạn thì dừng, bên đang gửi sẽ gửi tiếp các tin sau. Gửi lỗi thì bỏ giữ chỗ, tăng `forward_attempts` và dừng,
 * để tin sau không đi trước tin lỗi. Gửi **ít nhất một lần**: Zalo đã nhận mà hết thời gian chờ thì tin có thể tới hai lần. Dòng 🆕 đi với
 * tin đầu tiên tới Zalo của cuộc chat (kể cả khi tin đầu của khách đã bị bỏ vì quá 24 giờ).
 */
export async function forwardConversation(db: D1Database, zalo: OwnerBot | null, conversationId: number, now: number): Promise<ForwardResult> {
  if (!zalo) return "idle";
  const conv = await conversationById(db, conversationId);
  if (!conv || conv.status !== "open") return "idle";
  const already = await db
    .prepare("SELECT 1 AS x FROM support_messages WHERE conversation_id = ? AND sender = 'customer' AND forwarded_at IS NOT NULL LIMIT 1")
    .bind(conversationId)
    .first();
  let header = already === null;
  let result: ForwardResult = "idle";
  for (let i = 0; i < MAX_PER_CALL; i++) {
    const msg = await db
      .prepare(
        `SELECT id, text, claimed_at FROM support_messages
         WHERE conversation_id = ? AND sender = 'customer' AND forwarded_at IS NULL AND created_at >= ?
         ORDER BY id LIMIT 1`,
      )
      .bind(conversationId, now - FORWARD_WINDOW)
      .first<{ id: number; text: string; claimed_at: number | null }>();
    if (!msg) break;
    if (msg.claimed_at !== null && msg.claimed_at > now - CLAIM_TTL) break;
    const claim = await db
      .prepare("UPDATE support_messages SET claimed_at = ?1 WHERE id = ?2 AND forwarded_at IS NULL AND (claimed_at IS NULL OR claimed_at <= ?1 - ?3)")
      .bind(now, msg.id, CLAIM_TTL)
      .run();
    if (claim.meta.changes !== 1) break;
    try {
      await zalo.send(customerText(conv, msg.text, header));
    } catch (err) {
      await db
        .prepare("UPDATE support_messages SET claimed_at = NULL, forward_attempts = forward_attempts + 1 WHERE id = ?")
        .bind(msg.id)
        .run();
      console.warn(JSON.stringify({ event: "support_forward_failed", conversation: conv.code, error: String(err) }));
      return "failed";
    }
    await db.prepare("UPDATE support_messages SET forwarded_at = ?, claimed_at = NULL WHERE id = ?").bind(now, msg.id).run();
    header = false;
    result = "sent";
  }
  return result;
}
