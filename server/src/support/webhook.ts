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

const KIND_MAX_KEYS = 20;
const KIND_MAX_KEY_LENGTH = 40;

function kindOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/** Tên khóa và kiểu dữ liệu của một object (không có giá trị): đủ để sửa `parseUpdate` mà không lộ nội dung tin. */
function keyKinds(o: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(o).slice(0, KIND_MAX_KEYS)) out[key.slice(0, KIND_MAX_KEY_LENGTH)] = kindOf(o[key]);
  return out;
}

/** Dạng của thân webhook không đọc được, để ghi log: khóa cấp 1, và của `result`, `message`, `chat` nếu là object. */
export function bodyShape(body: Record<string, unknown> | null): unknown {
  if (!body) return "not_object";
  const event = isRecord(body.result) ? body.result : body;
  const message = isRecord(event.message) ? event.message : null;
  const chat = message && isRecord(message.chat) ? message.chat : null;
  return {
    top: keyKinds(body),
    ...(event !== body ? { result: keyKinds(event) } : {}),
    ...(message ? { message: keyKinds(message) } : {}),
    ...(chat ? { chat: keyKinds(chat) } : {}),
  };
}

/** Sự kiện nhận tin (`message.text.received`, `message.image.received`...): chỉ loại này mới đáng báo "Chỉ gửi được chữ". */
const RECEIVED_EVENT = /^message\.[^.]+\.received$/;

/** Các câu bot sẽ trả lời chủ dự án. Gửi sau khi đã trả 200 cho Zalo (`sendOutbox`), nên xử lý không gọi Zalo trực tiếp. */
type Outbox = string[];

async function reply(db: D1Database, outbox: Outbox, code: string | null, text: string, messageId: string, now: number): Promise<void> {
  const body = truncate(text, ZALO_MAX_TEXT);
  if (code !== null) {
    const conv = await conversationByCode(db, code);
    if (!conv) return void outbox.push(BOT_TEXT.noSuchCode(code));
    if (conv.status === "blocked") return void outbox.push(BOT_TEXT.blocked(conv.code));
    if (body === "") return void outbox.push(BOT_TEXT.emptyReply);
    await addOwnerMessage(db, conv.id, body, messageId, now);
    return;
  }
  if (body === "") return;
  const recent = await openWithCustomerSince(db, now - RECENT_REPLY_WINDOW);
  const [only] = recent;
  if (!only) return void outbox.push(BOT_TEXT.noneRecent);
  // Từ hai cuộc chat trở lên: không đoán, để không gửi nhầm khách.
  if (recent.length > 1) return void outbox.push(BOT_TEXT.ambiguous(recent.map((r) => r.code)));
  if (await addOwnerMessage(db, only.id, body, messageId, now)) outbox.push(BOT_TEXT.delivered(only.code));
}

/** Xử lý một sự kiện của chủ dự án: mọi việc D1 làm ở đây; trả các câu bot cần gửi lại (chưa gửi). */
export async function handleOwnerUpdate(db: D1Database, deps: Deps, update: ZaloUpdate): Promise<string[]> {
  const outbox: Outbox = [];
  await handleAction(db, deps.now(), update, outbox);
  return outbox.map((text) => truncate(text, ZALO_MAX_TEXT));
}

async function handleAction(db: D1Database, now: number, update: ZaloUpdate, outbox: Outbox): Promise<void> {
  const tell = (text: string) => void outbox.push(text);
  // Sự kiện không phải tin nhận (báo trạng thái, tin của chính bot...): bỏ qua im lặng.
  if (!RECEIVED_EVENT.test(update.eventName)) return;
  if (update.eventName !== "message.text.received" || update.text === null) return tell(BOT_TEXT.textOnly);
  const action = parseOwnerText(update.text);
  switch (action.kind) {
    case "help":
      return tell(HELP_TEXT);
    case "list":
      return tell(listText(await recentConversations(db, now - LIST_WINDOW), now));
    case "on":
    case "off": {
      const on = action.kind === "on";
      await setSetting(db, "enabled", on ? "1" : "0");
      console.log(JSON.stringify({ event: "support_toggled", enabled: on }));
      return tell(on ? BOT_TEXT.turnedOn : BOT_TEXT.turnedOff);
    }
    case "block":
    case "unblock": {
      const block = action.kind === "block";
      if (action.code === null) return tell(BOT_TEXT.needCode(block ? "/chan" : "/mo"));
      const conv = await conversationByCode(db, action.code);
      if (!conv) return tell(BOT_TEXT.noSuchCode(action.code));
      await setStatus(db, conv.id, block ? "blocked" : "open");
      return tell(block ? BOT_TEXT.blockedOk(conv.code) : BOT_TEXT.unblockedOk(conv.code));
    }
    case "badCode":
      return tell(BOT_TEXT.badCode);
    case "reply":
      return reply(db, outbox, action.code, action.text, update.messageId, now);
  }
}

/** Gửi lần lượt các câu của bot. Lỗi chỉ ghi log: câu trả lời của bot không quan trọng bằng việc đã xử lý xong. */
async function sendOutbox(deps: Deps, outbox: string[]): Promise<void> {
  const zalo = deps.zalo;
  if (!zalo) return;
  for (const text of outbox) {
    try {
      await zalo.send(text);
    } catch (err) {
      console.warn(JSON.stringify({ event: "support_bot_reply_failed", error: String(err) }));
    }
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
    const body = await readJson(c);
    const update = parseUpdate(body);
    // Trả 200 cả khi không đọc được: trả lỗi thì Zalo có thể gửi lại mãi một thân hỏng. Log nêu dạng của thân (không có giá trị) để sửa `parseUpdate`.
    if (!update) {
      console.warn(JSON.stringify({ event: "zalo_webhook_unreadable", shape: bodyShape(body) }));
      return c.json({ ok: true });
    }
    if (update.chatId !== c.env.ZALO_OWNER_CHAT_ID) {
      console.warn(JSON.stringify({ event: "zalo_webhook_stranger", event_name: update.eventName }));
      return c.json({ ok: true });
    }
    const db = c.env.DB;
    const deps = c.get("deps");
    // Zalo gửi lại sự kiện (hết thời gian chờ, lỗi mạng): đã xử lý xong thì bỏ qua, không làm lại lệnh, không báo lại.
    const seen = await db.prepare("SELECT 1 AS x FROM support_zalo_updates WHERE message_id = ?").bind(update.messageId).first();
    if (seen) return c.json({ ok: true });
    const outbox = await handleOwnerUpdate(db, deps, update);
    // Đánh dấu SAU khi xử lý xong: D1 lỗi giữa chừng thì Zalo gửi lại vẫn được xử lý (câu trả lời có zalo_message_id UNIQUE nên không ghi trùng).
    await db
      .prepare("INSERT INTO support_zalo_updates (message_id, received_at) VALUES (?1, ?2) ON CONFLICT (message_id) DO NOTHING")
      .bind(update.messageId, deps.now())
      .run();
    // Bot trả lời sau khi đã trả 200: Zalo chậm không làm webhook quá hạn.
    if (outbox.length > 0) c.executionCtx.waitUntil(sendOutbox(deps, outbox));
    return c.json({ ok: true });
  });
}
