// Đọc và ghi D1 của chat hỗ trợ (migration 0005; spec 2026-10-22 §2.1). Mọi câu đều có tham số, không ghép chuỗi từ input.
import { sha256Hex } from "../crypto";
import { isTokenShape, type Lang, newCode, type Source } from "./text";

export interface Conversation {
  id: number;
  code: string;
  source: Source;
  lang: Lang;
  page: string | null;
  context: string | null;
  email: string | null;
  status: "open" | "blocked";
  created_at: number;
  last_customer_at: number | null;
  last_owner_at: number | null;
  last_activity_at: number;
  delivered_owner_id: number;
  emailed_owner_id: number;
  emailed_at: number | null;
}

export interface SupportMessage {
  id: number;
  sender: "customer" | "owner";
  text: string;
  created_at: number;
}

export interface NewConversation {
  source: Source;
  lang: Lang;
  page: string | null;
  context: string | null;
}

/** Một dòng của lệnh /ds. `has_email` là 0 hay 1 (SQLite không có kiểu boolean). */
export interface RecentConversation {
  code: string;
  source: Source;
  status: "open" | "blocked";
  has_email: number;
  last_activity_at: number;
  last_text: string | null;
}

const COLUMNS =
  "id, code, source, lang, page, context, email, status, created_at, last_customer_at, last_owner_at, last_activity_at, delivered_owner_id, emailed_owner_id, emailed_at";
const CODE_ATTEMPTS = 8;

export async function conversationByToken(db: D1Database, token: string): Promise<Conversation | null> {
  if (!isTokenShape(token)) return null;
  return db.prepare(`SELECT ${COLUMNS} FROM support_conversations WHERE token_hash = ?`).bind(await sha256Hex(token)).first<Conversation>();
}

export function conversationById(db: D1Database, id: number): Promise<Conversation | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM support_conversations WHERE id = ?`).bind(id).first<Conversation>();
}

/** Tìm theo mã chủ dự án gõ, không phân biệt hoa thường. */
export function conversationByCode(db: D1Database, code: string): Promise<Conversation | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM support_conversations WHERE code = ?`).bind(code.toUpperCase()).first<Conversation>();
}

/** Tạo cuộc chat với mã chưa ai dùng: trùng thì sinh lại, tối đa 8 lần (32.768 mã, nên trùng mãi nghĩa là có lỗi). */
export async function createConversation(
  db: D1Database,
  tokenHash: string,
  input: NewConversation,
  now: number,
  makeCode: () => string = newCode,
): Promise<Conversation> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const row = await db
      .prepare(
        `INSERT INTO support_conversations (code, token_hash, source, lang, page, context, created_at, last_activity_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT (code) DO NOTHING
         RETURNING ${COLUMNS}`,
      )
      .bind(makeCode(), tokenHash, input.source, input.lang, input.page, input.context, now)
      .first<Conversation>();
    if (row) return row;
  }
  throw new Error("không sinh được mã cuộc chat chưa dùng");
}

export async function addCustomerMessage(db: D1Database, conversationId: number, text: string, now: number): Promise<SupportMessage> {
  const [inserted] = await db.batch([
    db
      .prepare("INSERT INTO support_messages (conversation_id, sender, text, created_at) VALUES (?1, 'customer', ?2, ?3) RETURNING id, sender, text, created_at")
      .bind(conversationId, text, now),
    db.prepare("UPDATE support_conversations SET last_customer_at = ?2, last_activity_at = ?2 WHERE id = ?1").bind(conversationId, now),
  ]);
  const row = inserted?.results[0] as SupportMessage | undefined;
  if (!row) throw new Error("không ghi được tin của khách");
  return row;
}

/** Tin của chủ dự án. `zaloMessageId` đã có (Zalo gửi lại webhook) thì không ghi gì và trả false. */
export async function addOwnerMessage(db: D1Database, conversationId: number, text: string, zaloMessageId: string, now: number): Promise<boolean> {
  const [inserted] = await db.batch([
    db
      .prepare(
        `INSERT INTO support_messages (conversation_id, sender, text, created_at, zalo_message_id) VALUES (?1, 'owner', ?2, ?3, ?4)
         ON CONFLICT (zalo_message_id) DO NOTHING`,
      )
      .bind(conversationId, text, now, zaloMessageId),
    // Chỉ khi câu trên vừa ghi một dòng (cùng cách với alertIfChanged ở alerts.ts).
    db.prepare("UPDATE support_conversations SET last_owner_at = ?2, last_activity_at = ?2 WHERE id = ?1 AND changes() = 1").bind(conversationId, now),
  ]);
  return inserted?.meta.changes === 1;
}

/** Tin có id lớn hơn `after`, tăng dần, tối đa `limit`. */
export async function messagesAfter(db: D1Database, conversationId: number, after: number, limit = 200): Promise<SupportMessage[]> {
  const { results } = await db
    .prepare("SELECT id, sender, text, created_at FROM support_messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT ?")
    .bind(conversationId, after, limit)
    .all<SupportMessage>();
  return results;
}

/** Khách đã nhận tới tin chủ dự án có id này (qua khung chat): cron không gửi email cho các tin đó nữa. */
export async function markDelivered(db: D1Database, conversationId: number, ownerMessageId: number): Promise<void> {
  await db
    .prepare("UPDATE support_conversations SET delivered_owner_id = MAX(delivered_owner_id, ?2) WHERE id = ?1")
    .bind(conversationId, ownerMessageId)
    .run();
}

// Không đụng `last_activity_at`: mốc 90 ngày tính từ tin cuối (chính sách mục 11), đặt email không phải là tin.
export async function setEmail(db: D1Database, conversationId: number, email: string | null): Promise<void> {
  await db.prepare("UPDATE support_conversations SET email = ?2 WHERE id = ?1").bind(conversationId, email).run();
}

export async function setStatus(db: D1Database, conversationId: number, status: "open" | "blocked"): Promise<void> {
  await db.prepare("UPDATE support_conversations SET status = ?2 WHERE id = ?1").bind(conversationId, status).run();
}

export async function deleteConversation(db: D1Database, conversationId: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM support_messages WHERE conversation_id = ?").bind(conversationId),
    db.prepare("DELETE FROM support_conversations WHERE id = ?").bind(conversationId),
  ]);
}

/** Cuộc chat đang mở có tin khách từ `since` trở đi, mới nhất trước (định tuyến câu trả lời không ghi mã). */
export async function openWithCustomerSince(db: D1Database, since: number): Promise<{ id: number; code: string }[]> {
  const { results } = await db
    .prepare("SELECT id, code FROM support_conversations WHERE status = 'open' AND last_customer_at >= ? ORDER BY last_customer_at DESC, id DESC")
    .bind(since)
    .all<{ id: number; code: string }>();
  return results;
}

/** Cuộc chat có hoạt động từ `since` trở đi, mới nhất trước, kèm tin cuối (lệnh /ds). */
export async function recentConversations(db: D1Database, since: number, limit = 20): Promise<RecentConversation[]> {
  const { results } = await db
    .prepare(
      `SELECT c.code, c.source, c.status, c.email IS NOT NULL AS has_email, c.last_activity_at,
              (SELECT m.text FROM support_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_text
       FROM support_conversations c
       WHERE c.last_activity_at >= ?
       ORDER BY c.last_activity_at DESC, c.id DESC
       LIMIT ?`,
    )
    .bind(since, limit)
    .all<RecentConversation>();
  return results;
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM support_settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO support_settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

/** Chat có đang bật không. Thiếu dòng (D1 trống trong test) thì coi là tắt, như mặc định của migration. */
export async function isEnabled(db: D1Database): Promise<boolean> {
  return (await getSetting(db, "enabled")) === "1";
}
