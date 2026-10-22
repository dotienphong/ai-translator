// Hàm dùng chung cho test chat hỗ trợ: bật chat, mở cuộc chat như khách, giả tin chủ dự án gửi qua webhook Zalo.
import { env } from "cloudflare:workers";
import { sha256Hex } from "../src/crypto";
import { setSetting } from "../src/support/store";
import { TEST_ZALO_OWNER, TEST_ZALO_WEBHOOK_SECRET } from "./fakes";
import type { makeWorld } from "./world";

type World = ReturnType<typeof makeWorld>;

/** Chat mặc định tắt (migration 0005, và resetDb xóa cả bảng cài đặt): test cần gửi tin thì bật trước. */
export const enableChat = () => setSetting(env.DB, "enabled", "1");

export const firstMessage = (over: Record<string, unknown> = {}) => ({
  text: "Gói Monthly dùng được trên 2 máy không?",
  lang: "vi",
  source: "web",
  page: "/bang-gia/",
  ...over,
});

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Khách mở cuộc chat bằng tin đầu tiên. Ném lỗi nếu không phải 201, để test không chạy tiếp với token rỗng. */
export async function startChat(w: World, over: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const r = await w.call("POST", "/v1/support/messages", firstMessage(over), headers);
  if (r.status !== 201) throw new Error(`mở cuộc chat: ${r.status} ${JSON.stringify(r.body)}`);
  const token = r.body.token as string;
  const row = await env.DB.prepare("SELECT id, code FROM support_conversations WHERE token_hash = ?")
    .bind(await sha256Hex(token))
    .first<{ id: number; code: string }>();
  if (!row) throw new Error("không thấy cuộc chat vừa mở");
  return { token, id: row.id, code: row.code, message: r.body.message as { id: number; text: string } };
}

/** Sự kiện Zalo gửi tới webhook (dạng của tài liệu: bọc trong `result`). */
export function zaloUpdate(eventName: string, message: Record<string, unknown>, chatId: string = TEST_ZALO_OWNER) {
  return {
    ok: true,
    result: {
      event_name: eventName,
      message: {
        from: { id: chatId, display_name: "Chủ dự án", is_bot: false },
        chat: { id: chatId, chat_type: "PRIVATE" },
        message_id: crypto.randomUUID(),
        date: 1_790_812_800_000,
        ...message,
      },
    },
  };
}

export const ownerSays = (text: string, messageId: string = crypto.randomUUID(), chatId: string = TEST_ZALO_OWNER) =>
  zaloUpdate("message.text.received", { text, message_id: messageId }, chatId);

export const webhook = (w: World, body: unknown, secret: string = TEST_ZALO_WEBHOOK_SECRET) =>
  w.call("POST", "/v1/webhooks/zalo", body, { "x-bot-api-secret-token": secret });
