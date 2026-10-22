// Endpoint của khung chat hỗ trợ trên website và trong app (spec 2026-10-22 §2.2; hợp đồng ở kế hoạch 00).
import type { Context, Hono } from "hono";
import { cors } from "hono/cors";
import { raiseAlert } from "../alerts";
import type { AppEnv } from "../app";
import { sha256Hex } from "../crypto";
import { clientIp, fail, parseEmail, readJson, tooMany } from "../http";
import { failureBlock, hit, LIMITS, noteFailure } from "../ratelimit";
import { BOT_TEXT } from "./format";
import { forwardConversation } from "./forward";
import {
  addCustomerMessage,
  type Conversation,
  conversationByToken,
  createConversation,
  deleteConversation,
  isEnabled,
  markDelivered,
  messagesAfter,
  type NewConversation,
  setEmail,
} from "./store";
import { newToken, parseContext, parseLang, parsePage, parseSource, parseText } from "./text";

/** Origin duy nhất được gọi từ trình duyệt. App gọi qua Rust, không có header Origin. */
export const SUPPORT_ORIGIN = "https://aitranslator.io.vn";

/** CORS của `/v1/support/*`: chỉ origin của website; đặt trước mọi middleware có thể trả lỗi, để trình duyệt đọc được cả thân lỗi. */
export const supportCors = cors({
  origin: SUPPORT_ORIGIN,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Retry-After"],
  maxAge: 86400,
});

export type SupportContext = Context<AppEnv>;

export function bearer(c: SupportContext): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]+)$/.exec(c.req.header("authorization") ?? "");
  return m?.[1] ?? null;
}

/** Cuộc chat của token trong header. Sai thì trả response lỗi; token sai tính là một lần thất bại của IP (như key sai). */
export async function authed(c: SupportContext): Promise<Conversation | Response> {
  const token = bearer(c);
  const conv = token === null ? null : await conversationByToken(c.env.DB, token);
  if (conv) return conv;
  const now = c.get("deps").now();
  const ip = clientIp(c);
  await noteFailure(c.env, ip, now, "support_token");
  const wait = await failureBlock(c.env, ip, now);
  return wait > 0 ? tooMany(c, wait) : fail(c, 401, "invalid_token");
}

/** Số giây khách phải chờ khi hỏi tin mới quá nhanh (cửa sổ 60 giây của binding Rate Limiting). */
const POLL_RETRY_AFTER = 60;

/** Báo Zalo một việc của khách (đã để lại email, đã xóa cuộc chat). Không lưu, không gửi lại: lỗi thì chỉ ghi log. */
function notifyOwner(c: SupportContext, text: string): void {
  const zalo = c.get("deps").zalo;
  if (!zalo) return;
  c.executionCtx.waitUntil(
    zalo.send(text).catch((err: unknown) => console.warn(JSON.stringify({ event: "support_notify_failed", error: String(err) }))),
  );
}

function busy(c: SupportContext, retryAfter: number) {
  c.header("retry-after", String(retryAfter));
  return fail(c, 429, "support_busy");
}

type Target = { kind: "existing"; conv: Conversation } | { kind: "new"; input: NewConversation };

export function registerSupport(app: Hono<AppEnv>) {
  app.get("/v1/support/status", async (c) => c.json({ enabled: await isEnabled(c.env.DB) }));

  app.post("/v1/support/messages", async (c) => {
    const db = c.env.DB;
    const deps = c.get("deps");
    const now = deps.now();
    if (!(await isEnabled(db))) return fail(c, 503, "support_disabled");
    const ip = clientIp(c);
    // Đếm trước khi đọc thân, như /v1/diagnostics: request sai cũng tốn hạn mức của IP.
    const perIp = await hit(c.env, "support_msg_ip", ip, now);
    if (!perIp.allowed) return tooMany(c, perIp.retryAfter);
    const body = await readJson(c);
    if (!body) return fail(c, 400, "invalid_request", { field: "body" });
    const text = parseText(body.text);
    if (text === null) return fail(c, 400, "invalid_request", { field: "text" });

    let target: Target;
    if (c.req.header("authorization") !== undefined) {
      const found = await authed(c);
      if (found instanceof Response) return found;
      if (found.status === "blocked") return fail(c, 403, "conversation_closed");
      const perConv = await hit(c.env, "support_msg_conv", String(found.id), now);
      if (!perConv.allowed) return tooMany(c, perConv.retryAfter);
      target = { kind: "existing", conv: found };
    } else {
      const lang = parseLang(body.lang);
      if (!lang) return fail(c, 400, "invalid_request", { field: "lang" });
      const source = parseSource(body.source);
      if (!source) return fail(c, 400, "invalid_request", { field: "source" });
      const perIpNew = await hit(c.env, "support_new_ip", ip, now);
      if (!perIpNew.allowed) return tooMany(c, perIpNew.retryAfter);
      const web = source === "web";
      target = { kind: "new", input: { source, lang, page: web ? parsePage(body.page) : null, context: web ? null : parseContext(body.context) } };
    }

    const global = await hit(c.env, "support_global", "all", now);
    if (!global.allowed) {
      // Đúng lần từ chối đầu tiên của giờ này: một cảnh báo, không phải mỗi request.
      if (global.count === LIMITS.support_global + 1) await raiseAlert(db, "support_flood", now);
      return busy(c, global.retryAfter);
    }

    let token: string | null = null;
    let conv: Conversation;
    if (target.kind === "existing") {
      conv = target.conv;
    } else {
      const fresh = newToken();
      conv = await createConversation(db, await sha256Hex(fresh), target.input, now);
      token = fresh;
    }
    const message = await addCustomerMessage(db, conv.id, text, now);
    c.executionCtx.waitUntil(
      forwardConversation(db, deps.zalo, conv.id, now).catch((err: unknown) =>
        console.error(JSON.stringify({ event: "support_forward_crashed", error: String(err) })),
      ),
    );
    return c.json(token === null ? { message } : { token, message }, 201);
  });

  // Hỏi tin mới: không ghi D1 khi không có câu trả lời mới (spec 2026-10-22 §2.2), không đi qua bảng rate_limits.
  app.get("/v1/support/messages", async (c) => {
    const found = await authed(c);
    if (found instanceof Response) return found;
    const limiter = c.env.SUPPORT_POLL_LIMITER;
    if (limiter && !(await limiter.limit({ key: String(found.id) })).success) return tooMany(c, POLL_RETRY_AFTER);
    const rawAfter = c.req.query("after") ?? "0";
    if (!/^\d{1,15}$/.test(rawAfter)) return fail(c, 400, "invalid_request", { field: "after" });
    const db = c.env.DB;
    const messages = await messagesAfter(db, found.id, Number(rawAfter));
    const lastOwner = messages.reduce((max, m) => (m.sender === "owner" && m.id > max ? m.id : max), 0);
    if (lastOwner > found.delivered_owner_id) await markDelivered(db, found.id, lastOwner);
    return c.json({ enabled: await isEnabled(db), status: found.status === "blocked" ? "closed" : "open", messages });
  });

  app.put("/v1/support/email", async (c) => {
    const found = await authed(c);
    if (found instanceof Response) return found;
    if (found.status === "blocked") return fail(c, 403, "conversation_closed");
    const now = c.get("deps").now();
    const perConv = await hit(c.env, "support_email_conv", String(found.id), now);
    if (!perConv.allowed) return tooMany(c, perConv.retryAfter);
    const body = await readJson(c);
    if (!body || !("email" in body)) return fail(c, 400, "invalid_request", { field: "email" });
    const email = body.email === null ? null : parseEmail(body.email);
    if (body.email !== null && email === null) return fail(c, 400, "invalid_request", { field: "email" });
    await setEmail(c.env.DB, found.id, email, now);
    // Chỉ báo là có email; địa chỉ không bao giờ đi qua Zalo (spec 2026-10-22 §2.3).
    if (email !== null && email !== found.email) notifyOwner(c, BOT_TEXT.emailSaved(found.code));
    return c.json({ ok: true });
  });

  app.delete("/v1/support/conversation", async (c) => {
    const found = await authed(c);
    if (found instanceof Response) return found;
    await deleteConversation(c.env.DB, found.id);
    if (found.status === "open") notifyOwner(c, BOT_TEXT.deleted(found.code));
    return c.json({ ok: true });
  });
}
