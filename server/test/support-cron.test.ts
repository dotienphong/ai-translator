import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcile } from "../src/reconcile";
import { forwardPendingSupport, pruneSupport, sendSupportEmails } from "../src/support/cron";
import { getSetting, setSetting } from "../src/support/store";
import { resetDb } from "./db";
import { auth, enableChat, ownerSays, startChat, webhook } from "./support-helpers";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

type World = ReturnType<typeof makeWorld>;
const FIRST = (code: string) => `🆕 #${code} · web · vi · /bang-gia/\nGói Monthly dùng được trên 2 máy không?`;
const leaveEmail = (w: World, token: string, email: string, headers: Record<string, string> = {}) =>
  w.call("PUT", "/v1/support/email", { email }, { ...auth(token), ...headers });

describe("việc định kỳ của chat hỗ trợ (spec 2026-10-22 §2.6)", () => {
  it("gửi lại tin chưa tới Zalo; gửi được thì đặt lại chuỗi lỗi", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.failStatus = 500;
    const chat = await startChat(w);
    await setSetting(env.DB, "zalo_fail_streak", "2");
    w.zalo.failStatus = null;
    w.clock.now = T0 + 300;
    await forwardPendingSupport(env.DB, w.deps, w.clock.now);
    expect(w.zalo.texts()).toEqual([FIRST(chat.code)]);
    expect(await getSetting(env.DB, "zalo_fail_streak")).toBe("0");
  });

  it("Zalo lỗi ở 3 lần cron liền thì có cảnh báo support_zalo_failed; 2 lần thì chưa", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.failStatus = 401;
    await startChat(w);
    for (const n of [1, 2]) {
      w.clock.now = T0 + 300 * n;
      await forwardPendingSupport(env.DB, w.deps, w.clock.now);
    }
    expect(await getSetting(env.DB, "zalo_fail_streak")).toBe("2");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM ops_alerts").first()).toEqual({ n: 0 });
    w.clock.now = T0 + 900;
    await forwardPendingSupport(env.DB, w.deps, w.clock.now);
    expect((await env.DB.prepare("SELECT kind, count FROM ops_alerts").all()).results).toEqual([{ kind: "support_zalo_failed", count: 1 }]);
  });

  it("email câu trả lời: sau 2 phút khách chưa nhận thì một thư gộp; trong 1 giờ không gửi thư nữa; thư sau chỉ có tin mới; khách đã nhận qua khung chat thì không gửi", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await leaveEmail(w, chat.token, "khach@example.com");
    await webhook(w, ownerSays(`#${chat.code} Câu một`));
    await webhook(w, ownerSays(`#${chat.code} Câu hai`));
    w.clock.now = T0 + 119;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
    w.clock.now = T0 + 120;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]).toMatchObject({ to: ["khach@example.com"], subject: "Trả lời từ hỗ trợ AI Translator / Reply from AI Translator support" });
    expect(w.resend.sent[0]?.text).toContain("Câu một\n\nCâu hai");
    expect(w.resend.sent[0]?.idempotencyKey).toMatch(/^support-\d+-\d+$/);
    await webhook(w, ownerSays(`#${chat.code} Câu ba`));
    w.clock.now = T0 + 120 + 3599;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
    w.clock.now = T0 + 120 + 3600;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(1);
    expect(w.resend.sent[1]?.text).toContain("Câu ba");
    expect(w.resend.sent[1]?.text).not.toContain("Câu một");
    await webhook(w, ownerSays(`#${chat.code} Câu bốn`));
    await w.call("GET", "/v1/support/messages?after=0", undefined, auth(chat.token));
    w.clock.now = T0 + 120 + 3600 * 3;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
  });

  it("email lỗi tạm thì lần cron sau gửi lại; lỗi vĩnh viễn thì thôi, không gửi lại mãi", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await leaveEmail(w, chat.token, "khach@example.com");
    await webhook(w, ownerSays(`#${chat.code} Trả lời`));
    w.clock.now = T0 + 300;
    w.resend.down = true;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
    w.resend.down = false;
    w.clock.now = T0 + 600;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(1);
    const ip = { "cf-connecting-ip": "203.0.113.30" };
    const other = await startChat(w, {}, ip);
    await leaveEmail(w, other.token, "sai@example.com", ip);
    await webhook(w, ownerSays(`#${other.code} Trả lời`));
    w.resend.failStatus = 422;
    w.clock.now = T0 + 900;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
    w.resend.failStatus = null;
    w.clock.now = T0 + 900 + 7200;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
    expect(w.resend.sent.map((m) => m.to)).toEqual([["khach@example.com"]]);
  });

  it("xóa cuộc chat không có hoạt động trong 90 ngày, giữ cuộc chat còn mới", async () => {
    const w = makeWorld();
    await enableChat();
    await startChat(w);
    w.clock.now = T0 + 10 * DAY;
    const fresh = await startChat(w);
    await pruneSupport(env.DB, T0 + 90 * DAY + 1);
    expect((await env.DB.prepare("SELECT id FROM support_conversations").all()).results).toEqual([{ id: fresh.id }]);
    expect((await env.DB.prepare("SELECT DISTINCT conversation_id AS id FROM support_messages").all()).results).toEqual([{ id: fresh.id }]);
  });

  it("cron */5 (reconcile) chạy các việc của chat: tin chờ được gửi lại", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.down = true;
    const chat = await startChat(w);
    w.zalo.down = false;
    w.clock.now = T0 + 300;
    await reconcile(w.env, w.deps);
    expect(w.zalo.texts()).toEqual([FIRST(chat.code)]);
  });
});
