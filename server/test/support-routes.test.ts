import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex, sha256Hex } from "../src/crypto";
import { LIMITS } from "../src/ratelimit";
import { setSetting } from "../src/support/store";
import { resetDb, wrapDb } from "./db";
import { auth, enableChat, firstMessage, startChat } from "./support-helpers";
import { makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

type World = ReturnType<typeof makeWorld>;
const post = (w: World, body: unknown, headers: Record<string, string> = {}) => w.call("POST", "/v1/support/messages", body, headers);
const conversation = (id: number) =>
  env.DB.prepare("SELECT code, source, lang, page, context, email, status FROM support_conversations WHERE id = ?").bind(id).first();
const countConversations = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM support_conversations").first<{ n: number }>())?.n;

describe("POST /v1/support/messages và GET /v1/support/status (spec 2026-10-22 §2.2)", () => {
  it("status: chat tắt cho tới khi chủ dự án bật", async () => {
    const w = makeWorld();
    expect(await w.call("GET", "/v1/support/status")).toMatchObject({ status: 200, body: { enabled: false } });
    await enableChat();
    expect(await w.call("GET", "/v1/support/status")).toMatchObject({ status: 200, body: { enabled: true } });
  });

  it("chat tắt: 503 support_disabled, không lưu gì", async () => {
    const w = makeWorld();
    expect(await post(w, firstMessage())).toMatchObject({ status: 503, body: { error: "support_disabled" } });
    expect(await countConversations()).toBe(0);
  });

  it("tin đầu từ website: 201 kèm token và tin; lưu nguồn, ngôn ngữ, trang (bỏ query); Zalo nhận tin có dòng 🆕", async () => {
    const w = makeWorld();
    await enableChat();
    const r = await post(w, firstMessage({ page: "/bang-gia/?utm=fb", context: "không được lưu với web" }));
    expect(r.status).toBe(201);
    expect(r.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.body.message).toEqual({ id: expect.any(Number), sender: "customer", text: "Gói Monthly dùng được trên 2 máy không?", created_at: T0 });
    const row = await env.DB.prepare("SELECT code, source, lang, page, context, email, status, token_hash FROM support_conversations").first<{
      code: string;
    }>();
    expect(row).toMatchObject({
      source: "web",
      lang: "vi",
      page: "/bang-gia/",
      context: null,
      email: null,
      status: "open",
      token_hash: await sha256Hex(r.body.token as string),
    });
    expect(w.zalo.texts()).toEqual([`🆕 #${row?.code} · web · vi · /bang-gia/\nGói Monthly dùng được trên 2 máy không?`]);
  });

  it("tin đầu từ app: lưu thông tin máy, bỏ trang; bản debug ghi app (debug)", async () => {
    const w = makeWorld();
    await enableChat();
    const a = await startChat(w, { source: "app", page: "/x", context: "AI Translator 0.2.4 · macOS 15.6" });
    expect(await conversation(a.id)).toMatchObject({ source: "app", page: null, context: "AI Translator 0.2.4 · macOS 15.6" });
    const d = await startChat(w, { source: "app-debug", lang: "en", context: null });
    expect(await conversation(d.id)).toMatchObject({ source: "app-debug", lang: "en", page: null, context: null });
    expect(w.zalo.texts()[1]).toBe(`🆕 #${d.code} · app (debug) · en\nGói Monthly dùng được trên 2 máy không?`);
  });

  it("tin sau kèm token: 201 không có token mới, bỏ qua lang và source; Zalo nhận tin chỉ có mã", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    const r = await post(w, { text: "  Cảm ơn\r\nbạn  ", lang: "khác", source: "khác" }, auth(chat.token));
    expect(r).toMatchObject({ status: 201, body: { message: { sender: "customer", text: "Cảm ơn\nbạn" } } });
    expect("token" in r.body).toBe(false);
    expect(w.zalo.texts()[1]).toBe(`#${chat.code} Cảm ơn\nbạn`);
  });

  it("thân sai: 400 kèm field; thiếu Content-Type JSON: 415", async () => {
    const w = makeWorld();
    await enableChat();
    expect(await post(w, "không phải json")).toMatchObject({ status: 400, body: { error: "invalid_request", field: "body" } });
    expect(await post(w, firstMessage({ text: "   " }))).toMatchObject({ status: 400, body: { field: "text" } });
    expect(await post(w, firstMessage({ text: "x".repeat(1001) }))).toMatchObject({ status: 400, body: { field: "text" } });
    expect(await post(w, firstMessage({ lang: "fr" }))).toMatchObject({ status: 400, body: { field: "lang" } });
    expect(await post(w, firstMessage({ source: "admin" }))).toMatchObject({ status: 400, body: { field: "source" } });
    expect(await post(w, JSON.stringify(firstMessage()), { "content-type": "text/plain" })).toMatchObject({ status: 415 });
    expect(await countConversations()).toBe(0);
  });

  it("token sai: 401 invalid_token và tính là thất bại của IP; IP đã chạm ngưỡng thì 429", async () => {
    const w = makeWorld();
    await enableChat();
    const bad = { authorization: `Bearer ${"A".repeat(43)}` };
    expect(await post(w, { text: "x" }, bad)).toMatchObject({ status: 401, body: { error: "invalid_token" } });
    const bucket = `failure_ip:${await hmacSha256Hex("test-pepper", "203.0.113.10")}`;
    expect(await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket = ?").bind(bucket).first()).toEqual({ count: 1 });
    await env.DB.prepare("UPDATE rate_limits SET count = ? WHERE bucket = ?").bind(LIMITS.failure_ip, bucket).run();
    const r = await post(w, { text: "x" }, bad);
    expect(r).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("cuộc chat bị chủ dự án chặn: 403 conversation_closed", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await env.DB.prepare("UPDATE support_conversations SET status = 'blocked' WHERE id = ?").bind(chat.id).run();
    expect(await post(w, { text: "x" }, auth(chat.token))).toMatchObject({ status: 403, body: { error: "conversation_closed" } });
  });

  it("giới hạn theo giờ: 5 cuộc chat mới mỗi IP, 20 tin tiếp theo mỗi cuộc chat", async () => {
    const w = makeWorld();
    await enableChat();
    for (let i = 0; i < LIMITS.support_new_ip; i++) await startChat(w);
    const sixth = await post(w, firstMessage());
    expect(sixth).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(sixth.headers.get("retry-after")).toBe("3600");
    const ip2 = { "cf-connecting-ip": "203.0.113.20" };
    const chat = await startChat(w, {}, ip2);
    for (let i = 0; i < LIMITS.support_msg_conv; i++) {
      expect((await post(w, { text: `tin ${i}` }, { ...auth(chat.token), ...ip2 })).status).toBe(201);
    }
    expect(await post(w, { text: "thêm" }, { ...auth(chat.token), ...ip2 })).toMatchObject({ status: 429, body: { error: "rate_limited" } });
  });

  it("trần toàn hệ thống: support_busy kèm Retry-After, một cảnh báo support_flood cho giờ đó, không lưu gì", async () => {
    const w = makeWorld();
    await enableChat();
    const bucket = `support_global:${await hmacSha256Hex("test-pepper", "all")}`;
    await env.DB.prepare("INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, ?)").bind(bucket, T0, LIMITS.support_global).run();
    const r = await post(w, firstMessage());
    expect(r).toMatchObject({ status: 429, body: { error: "support_busy" } });
    expect(r.headers.get("retry-after")).toBe("3600");
    expect((await post(w, firstMessage())).body.error).toBe("support_busy");
    expect((await env.DB.prepare("SELECT kind, count FROM ops_alerts").all()).results).toEqual([{ kind: "support_flood", count: 1 }]);
    expect(await countConversations()).toBe(0);
  });

  it("CORS: preflight từ website được phép; lỗi vẫn có header cho website; origin khác và route khác không có header CORS", async () => {
    const w = makeWorld();
    const origin = { origin: "https://aitranslator.io.vn" };
    const pre = await w.call("OPTIONS", "/v1/support/messages", undefined, {
      ...origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,authorization",
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://aitranslator.io.vn");
    expect(pre.headers.get("access-control-allow-methods")).toBe("GET,POST,PUT,DELETE,OPTIONS");
    expect(pre.headers.get("access-control-allow-headers")).toBe("Content-Type,Authorization");
    expect(pre.headers.get("access-control-max-age")).toBe("86400");
    const off = await post(w, firstMessage(), origin);
    expect(off.status).toBe(503);
    expect(off.headers.get("access-control-allow-origin")).toBe("https://aitranslator.io.vn");
    expect(off.headers.get("access-control-expose-headers")).toBe("Retry-After");
    const evil = await w.call("GET", "/v1/support/status", undefined, { origin: "https://evil.example" });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    expect((await w.call("GET", "/v1/health", undefined, origin)).headers.get("access-control-allow-origin")).toBeNull();
  });

  it("Zalo lỗi lúc khách gửi: vẫn 201, tin nằm chờ để cron gửi lại", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.failStatus = 502;
    expect((await post(w, firstMessage())).status).toBe(201);
    expect(await env.DB.prepare("SELECT forwarded_at, forward_attempts FROM support_messages").first()).toEqual({ forwarded_at: null, forward_attempts: 1 });
  });
});

describe("GET /v1/support/messages, PUT /v1/support/email, DELETE /v1/support/conversation (spec 2026-10-22 §2.2)", () => {
  const get = (w: World, token: string, after: string | number = 0) =>
    w.call("GET", `/v1/support/messages?after=${after}`, undefined, auth(token));

  it("GET: tin sau con trỏ theo thứ tự, kèm enabled và status; đánh dấu khách đã nhận câu trả lời", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await env.DB.prepare("INSERT INTO support_messages (conversation_id, sender, text, created_at, zalo_message_id) VALUES (?, 'owner', 'Chào bạn', ?, 'zm-1')")
      .bind(chat.id, T0 + 5)
      .run();
    const r = await get(w, chat.token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      enabled: true,
      status: "open",
      messages: [
        { id: chat.message.id, sender: "customer", text: "Gói Monthly dùng được trên 2 máy không?", created_at: T0 },
        { id: expect.any(Number), sender: "owner", text: "Chào bạn", created_at: T0 + 5 },
      ],
    });
    const ownerId = (r.body.messages as { id: number }[])[1]?.id;
    expect(await env.DB.prepare("SELECT delivered_owner_id FROM support_conversations").first()).toEqual({ delivered_owner_id: ownerId });
    expect((await get(w, chat.token, ownerId ?? 0)).body.messages).toEqual([]);
  });

  it("GET không có tin mới: không ghi gì vào D1", async () => {
    const w0 = makeWorld();
    await enableChat();
    const chat = await startChat(w0);
    const { db, sql } = wrapDb(env.DB);
    const w = makeWorld({ DB: db });
    expect((await get(w, chat.token, chat.message.id)).status).toBe(200);
    expect(sql.filter((q) => /^\s*(INSERT|UPDATE|DELETE)/i.test(q))).toEqual([]);
  });

  it("GET: after sai thì 400; thiếu after là 0; bị chặn thì status closed; chat tắt thì enabled false", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    expect(await get(w, chat.token, "-1")).toMatchObject({ status: 400, body: { field: "after" } });
    expect(await get(w, chat.token, "abc")).toMatchObject({ status: 400, body: { field: "after" } });
    const noAfter = await w.call("GET", "/v1/support/messages", undefined, auth(chat.token));
    expect(noAfter.body.messages).toHaveLength(1);
    await env.DB.prepare("UPDATE support_conversations SET status = 'blocked'").run();
    await setSetting(env.DB, "enabled", "0");
    expect((await get(w, chat.token)).body).toMatchObject({ enabled: false, status: "closed" });
  });

  it("GET hỏi quá nhanh (binding Rate Limiting từ chối): 429 kèm Retry-After 60", async () => {
    const w0 = makeWorld();
    await enableChat();
    const chat = await startChat(w0);
    const w = makeWorld({ SUPPORT_POLL_LIMITER: { limit: async () => ({ success: false }) } });
    const r = await get(w, chat.token);
    expect(r).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(r.headers.get("retry-after")).toBe("60");
  });

  it("PUT email: lưu chữ thường, báo Zalo không kèm địa chỉ, cùng email thì không báo lại; null thì bỏ; sai 400; quá 5 lần mỗi giờ 429; bị chặn 403", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    const put = (email: unknown) => w.call("PUT", "/v1/support/email", { email }, auth(chat.token));
    expect(await put("Khach@Example.com")).toMatchObject({ status: 200, body: { ok: true } });
    expect(await conversation(chat.id)).toMatchObject({ email: "khach@example.com" });
    expect(w.zalo.texts()[1]).toBe(`#${chat.code} ✉️ khách đã để lại email`);
    expect(w.zalo.texts().join("\n")).not.toContain("khach@example.com");
    expect(await put("khach@example.com")).toMatchObject({ status: 200 });
    expect(w.zalo.sent).toHaveLength(2);
    expect(await put(null)).toMatchObject({ status: 200 });
    expect(await conversation(chat.id)).toMatchObject({ email: null });
    expect(await put("không-phải-email")).toMatchObject({ status: 400, body: { field: "email" } });
    expect(await put(undefined)).toMatchObject({ status: 400, body: { field: "email" } });
    expect(await put("x@example.com")).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    const other = await startChat(w);
    await env.DB.prepare("UPDATE support_conversations SET status = 'blocked' WHERE id = ?").bind(other.id).run();
    expect(await w.call("PUT", "/v1/support/email", { email: "a@example.com" }, auth(other.token))).toMatchObject({
      status: 403,
      body: { error: "conversation_closed" },
    });
  });

  it("DELETE: xóa cuộc chat và mọi tin, báo Zalo; token cũ thành 401", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    expect(await w.call("DELETE", "/v1/support/conversation", {}, auth(chat.token))).toMatchObject({ status: 200, body: { ok: true } });
    expect(await env.DB.prepare("SELECT (SELECT COUNT(*) FROM support_conversations) AS c, (SELECT COUNT(*) FROM support_messages) AS m").first()).toEqual({
      c: 0,
      m: 0,
    });
    expect(w.zalo.texts().at(-1)).toBe(`#${chat.code} 🗑 khách đã xóa cuộc chat`);
    expect((await get(w, chat.token)).body).toEqual({ error: "invalid_token" });
  });
});
