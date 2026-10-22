// Webhook của Zalo Bot (spec 2026-10-22 §2.4, §2.5): chủ dự án trả lời hay gõ lệnh cho bot; câu trả lời vào cuộc chat của khách.
// Chỉ xử lý khi header secret đúng VÀ người gửi là chủ dự án; bot có thể bị người lạ tìm thấy và nhắn vào.
import type { Hono } from "hono";
import type { AppEnv } from "../app";
import { timingSafeEqual } from "../crypto";
import type { Deps } from "../deps";
import { fail, isRecord, readJson } from "../http";
import { BOT_TEXT, HELP_TEXT, listText } from "./format";
import { parseOwnerText } from "./owner";
import { addOwnerMessage, conversationByCode, openWithCustomerSince, recentConversations, setSetting, setStatus } from "./store";
import { truncate, ZALO_MAX_TEXT } from "./text";

export const ZALO_WEBHOOK_PATH = "/v1/webhooks/zalo";
/** Câu trả lời không ghi mã chỉ tới cuộc chat có tin khách trong 30 phút qua. */
const RECENT_REPLY_WINDOW = 1800;
const LIST_WINDOW = 7 * 86400;

export interface ZaloUpdate {
  eventName: string;
  chatId: string;
  messageId: string;
  text: string | null;
}

function idOf(v: unknown): string | null {
  if (typeof v === "string" && v !== "") return v;
  return typeof v === "number" && Number.isFinite(v) ? String(v) : null;
}

/** Đọc thân webhook. Tài liệu Zalo bọc sự kiện trong `result`; nhận cả dạng không bọc, id dạng chuỗi lẫn số. Thiếu trường thì null. */
export function parseUpdate(body: Record<string, unknown> | null): ZaloUpdate | null {
  if (!body) return null;
  const event = isRecord(body.result) ? body.result : body;
  const message = isRecord(event.message) ? event.message : null;
  const chat = message && isRecord(message.chat) ? message.chat : null;
  const chatId = chat ? idOf(chat.id) : null;
  const messageId = message ? idOf(message.message_id) : null;
  if (typeof event.event_name !== "string" || chatId === null || messageId === null) return null;
  const text = message !== null && typeof message.text === "string" ? message.text : null;
  return { eventName: event.event_name, chatId, messageId, text };
}

/** Bot trả lời chủ dự án. Lỗi thì chỉ ghi log: câu trả lời của bot không quan trọng bằng việc trả 200 cho Zalo. */
async function tell(deps: Deps, text: string): Promise<void> {
  if (!deps.zalo) return;
  try {
    await deps.zalo.send(truncate(text, ZALO_MAX_TEXT));
  } catch (err) {
    console.warn(JSON.stringify({ event: "support_bot_reply_failed", error: String(err) }));
  }
}

async function reply(db: D1Database, deps: Deps, code: string | null, text: string, messageId: string, now: number): Promise<void> {
  const body = truncate(text, ZALO_MAX_TEXT);
  if (code !== null) {
    const conv = await conversationByCode(db, code);
    if (!conv) return tell(deps, BOT_TEXT.noSuchCode(code));
    if (conv.status === "blocked") return tell(deps, BOT_TEXT.blocked(conv.code));
    if (body === "") return tell(deps, BOT_TEXT.emptyReply);
    await addOwnerMessage(db, conv.id, body, messageId, now);
    return;
  }
  if (body === "") return;
  const recent = await openWithCustomerSince(db, now - RECENT_REPLY_WINDOW);
  const [only] = recent;
  if (!only) return tell(deps, BOT_TEXT.noneRecent);
  // Từ hai cuộc chat trở lên: không đoán, để không gửi nhầm khách.
  if (recent.length > 1) return tell(deps, BOT_TEXT.ambiguous(recent.map((r) => r.code)));
  if (await addOwnerMessage(db, only.id, body, messageId, now)) await tell(deps, BOT_TEXT.delivered(only.code));
}

export async function handleOwnerUpdate(db: D1Database, deps: Deps, update: ZaloUpdate): Promise<void> {
  const now = deps.now();
  if (update.eventName !== "message.text.received" || update.text === null) return tell(deps, BOT_TEXT.textOnly);
  const action = parseOwnerText(update.text);
  switch (action.kind) {
    case "help":
      return tell(deps, HELP_TEXT);
    case "list":
      return tell(deps, listText(await recentConversations(db, now - LIST_WINDOW), now));
    case "on":
    case "off": {
      const on = action.kind === "on";
      await setSetting(db, "enabled", on ? "1" : "0");
      console.log(JSON.stringify({ event: "support_toggled", enabled: on }));
      return tell(deps, on ? BOT_TEXT.turnedOn : BOT_TEXT.turnedOff);
    }
    case "block":
    case "unblock": {
      const block = action.kind === "block";
      if (action.code === null) return tell(deps, BOT_TEXT.needCode(block ? "/chan" : "/mo"));
      const conv = await conversationByCode(db, action.code);
      if (!conv) return tell(deps, BOT_TEXT.noSuchCode(action.code));
      await setStatus(db, conv.id, block ? "blocked" : "open");
      return tell(deps, block ? BOT_TEXT.blockedOk(conv.code) : BOT_TEXT.unblockedOk(conv.code));
    }
    case "badCode":
      return tell(deps, BOT_TEXT.badCode);
    case "reply":
      return reply(db, deps, action.code, action.text, update.messageId, now);
  }
}

export function registerZaloWebhook(app: Hono<AppEnv>) {
  app.post(ZALO_WEBHOOK_PATH, async (c) => {
    const expected = c.env.ZALO_WEBHOOK_SECRET;
    const got = c.req.header("x-bot-api-secret-token") ?? "";
    if (!expected || !timingSafeEqual(got, expected)) {
      console.warn(JSON.stringify({ event: "zalo_webhook_bad_secret" }));
      return fail(c, 403, "forbidden");
    }
    const update = parseUpdate(await readJson(c));
    // Trả 200 cả khi không đọc được: trả lỗi thì Zalo có thể gửi lại mãi một thân hỏng.
    if (!update) {
      console.warn(JSON.stringify({ event: "zalo_webhook_unreadable" }));
      return c.json({ ok: true });
    }
    if (update.chatId !== c.env.ZALO_OWNER_CHAT_ID) {
      console.warn(JSON.stringify({ event: "zalo_webhook_stranger", event_name: update.eventName }));
      return c.json({ ok: true });
    }
    await handleOwnerUpdate(c.env.DB, c.get("deps"), update);
    return c.json({ ok: true });
  });
}
