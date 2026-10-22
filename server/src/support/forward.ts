// Chuyển tin của khách sang Zalo của chủ dự án (spec 2026-10-22 §2.3). Gọi ngay sau khi khách gửi (waitUntil) và từ cron (tin còn chờ).
import { customerText } from "./format";
import { conversationById } from "./store";
import type { OwnerBot } from "./zalo";

/** Tin chờ quá 24 giờ thì thôi chuyển; tin vẫn còn trong cuộc chat của khách. */
export const FORWARD_WINDOW = 86400;
/** Trần số tin chuyển trong một lần gọi, để một cuộc chat không giữ request hay cron quá lâu. */
const MAX_PER_CALL = 25;

export type ForwardResult = "sent" | "failed" | "idle";

/**
 * Chuyển các tin khách còn chờ của một cuộc chat theo thứ tự id. Mỗi tin được giữ chỗ (đặt `forwarded_at`) trước khi gửi, nên
 * request và cron chạy chồng nhau không gửi trùng; gửi lỗi thì trả chỗ, tăng `forward_attempts` và dừng, để tin sau không đi
 * trước tin lỗi. Hai request của cùng một khách chen nhau từng mili giây vẫn có thể đảo thứ tự hai tin: chấp nhận.
 */
export async function forwardConversation(db: D1Database, zalo: OwnerBot | null, conversationId: number, now: number): Promise<ForwardResult> {
  if (!zalo) return "idle";
  const conv = await conversationById(db, conversationId);
  if (!conv || conv.status !== "open") return "idle";
  let result: ForwardResult = "idle";
  for (let i = 0; i < MAX_PER_CALL; i++) {
    const msg = await db
      .prepare(
        `SELECT id, text FROM support_messages
         WHERE conversation_id = ? AND sender = 'customer' AND forwarded_at IS NULL AND created_at >= ?
         ORDER BY id LIMIT 1`,
      )
      .bind(conversationId, now - FORWARD_WINDOW)
      .first<{ id: number; text: string }>();
    if (!msg) break;
    const claim = await db.prepare("UPDATE support_messages SET forwarded_at = ? WHERE id = ? AND forwarded_at IS NULL").bind(now, msg.id).run();
    if (claim.meta.changes !== 1) break;
    const first = await db
      .prepare("SELECT MIN(id) AS id FROM support_messages WHERE conversation_id = ? AND sender = 'customer'")
      .bind(conversationId)
      .first<{ id: number }>();
    try {
      await zalo.send(customerText(conv, msg.text, first?.id === msg.id));
      result = "sent";
    } catch (err) {
      await db
        .prepare("UPDATE support_messages SET forwarded_at = NULL, forward_attempts = forward_attempts + 1 WHERE id = ?")
        .bind(msg.id)
        .run();
      console.warn(JSON.stringify({ event: "support_forward_failed", conversation: conv.code, error: String(err) }));
      return "failed";
    }
  }
  return result;
}
