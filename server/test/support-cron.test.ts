import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcile } from "../src/reconcile";
import { forwardPendingSupport, MAX_PER_RUN, pruneSupport, sendSupportEmails } from "../src/support/cron";
import { MAX_ATTEMPTS } from "../src/support/forward";
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

  it("không còn tin chờ nào thì đặt lại chuỗi lỗi", async () => {
    const w = makeWorld();
    await enableChat();
    await startChat(w);
    await setSetting(env.DB, "zalo_fail_streak", "2");
    await forwardPendingSupport(env.DB, w.deps, T0 + 300);
    expect(await getSetting(env.DB, "zalo_fail_streak")).toBe("0");
  });

  it("tin độc: Zalo từ chối nội dung (400) 5 lần thì không gửi nữa và không chặn tin sau của cuộc chat", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.failWhenTextIncludes = "ZZZ";
    const chat = await startChat(w, { text: "ZZZ nội dung bị từ chối" });
    for (const n of [1, 2, 3, 4]) {
      w.clock.now = T0 + 300 * n;
      await forwardPendingSupport(env.DB, w.deps, w.clock.now);
    }
    expect(await env.DB.prepare("SELECT forward_attempts FROM support_messages WHERE id = ?").bind(chat.message.id).first()).toEqual({ forward_attempts: MAX_ATTEMPTS });
    await w.call("POST", "/v1/support/messages", { text: "Tin sau" }, auth(chat.token));
    w.zalo.failWhenTextIncludes = null;
    w.clock.now = T0 + 1800;
    await forwardPendingSupport(env.DB, w.deps, w.clock.now);
    // Chưa tin nào của cuộc chat tới Zalo nên tin sau mang dòng 🆕.
    expect(w.zalo.texts()).toEqual([`🆕 #${chat.code} · web · vi · /bang-gia/\nTin sau`]);
    expect(await env.DB.prepare("SELECT forwarded_at FROM support_messages WHERE id = ?").bind(chat.message.id).first()).toEqual({ forwarded_at: null });
    w.clock.now = T0 + 2100;
    await forwardPendingSupport(env.DB, w.deps, w.clock.now);
    expect(w.zalo.texts()).toHaveLength(1);
  });

  for (const status of [500, 401]) {
    it(`Zalo lỗi ${status} suốt 10 lần cron: tin vẫn chờ (không bị bỏ), có cảnh báo support_zalo_failed; Zalo hoạt động lại thì tin tới`, async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const w = makeWorld();
      await enableChat();
      w.zalo.failStatus = status;
      const chat = await startChat(w);
      for (let n = 1; n <= 10; n++) {
        w.clock.now = T0 + 300 * n;
        await forwardPendingSupport(env.DB, w.deps, w.clock.now);
      }
      expect(await env.DB.prepare("SELECT forwarded_at, forward_attempts FROM support_messages").first()).toEqual({ forwarded_at: null, forward_attempts: 0 });
      expect(await getSetting(env.DB, "zalo_fail_streak")).toBe("10");
      expect((await env.DB.prepare("SELECT kind FROM ops_alerts").all()).results).toEqual([{ kind: "support_zalo_failed" }]);
      w.zalo.failStatus = null;
      w.clock.now = T0 + 3300;
      await forwardPendingSupport(env.DB, w.deps, w.clock.now);
      expect(w.zalo.texts()).toEqual([FIRST(chat.code)]);
      expect(await getSetting(env.DB, "zalo_fail_streak")).toBe("0");
    });
  }

  it("cuộc chat bị chặn không được gửi lại tin chờ", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.failStatus = 500;
    await startChat(w);
    w.zalo.failStatus = null;
    await env.DB.prepare("UPDATE support_conversations SET status = 'blocked'").run();
    await forwardPendingSupport(env.DB, w.deps, T0 + 300);
    expect(w.zalo.sent).toEqual([]);
  });

  it("một cuộc chat lỗi (Zalo từ chối nội dung) không chặn cuộc chat khác; có tin gửi được thì chuỗi lỗi về 0", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.failStatus = 400;
    const a = await startChat(w, { text: "ZZZ nội dung bị từ chối" });
    const b = await startChat(w, {}, { "cf-connecting-ip": "203.0.113.31" });
    w.zalo.failStatus = null;
    w.zalo.failWhenTextIncludes = "ZZZ";
    await setSetting(env.DB, "zalo_fail_streak", "2");
    w.clock.now = T0 + 300;
    await forwardPendingSupport(env.DB, w.deps, w.clock.now);
    expect(w.zalo.texts()).toEqual([FIRST(b.code)]);
    expect(await getSetting(env.DB, "zalo_fail_streak")).toBe("0");
    expect(await env.DB.prepare("SELECT forward_attempts FROM support_messages WHERE id = ?").bind(a.message.id).first()).toEqual({ forward_attempts: 2 });
  });

  it("Zalo lỗi chung: một lần chạy dừng sau 3 lần gửi lỗi, không thử hết các cuộc chat", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.failStatus = 500;
    for (let i = 0; i < 5; i++) await startChat(w, {}, { "cf-connecting-ip": `203.0.113.${40 + i}` });
    const before = w.zalo.urls.length;
    await forwardPendingSupport(env.DB, w.deps, T0 + 300);
    expect(w.zalo.urls.length - before).toBe(3);
    expect(await getSetting(env.DB, "zalo_fail_streak")).toBe("1");
  });

  it("tối đa 100 tin mỗi lần chạy; phần còn lại đi ở lần sau", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.down = true;
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) ids.push((await startChat(w, {}, { "cf-connecting-ip": `203.0.113.${50 + i}` })).id);
    await env.DB.batch(
      ids.flatMap((id) =>
        Array.from({ length: 29 }, (_, i) =>
          env.DB.prepare("INSERT INTO support_messages (conversation_id, sender, text, created_at) VALUES (?, 'customer', ?, ?)").bind(id, `tin ${i}`, T0 + 1),
        ),
      ),
    );
    w.zalo.down = false;
    await forwardPendingSupport(env.DB, w.deps, T0 + 300);
    expect(w.zalo.sent.length).toBe(MAX_PER_RUN);
    await forwardPendingSupport(env.DB, w.deps, T0 + 600);
    expect(w.zalo.sent.length).toBe(145); // lần 2: 4 cuộc chat còn 5 tin + cuộc thứ 5 được 25 tin = 45
    await forwardPendingSupport(env.DB, w.deps, T0 + 900);
    expect(w.zalo.sent.length).toBe(150);
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

  it("cuộc chat bị chặn không nhận email câu trả lời", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await leaveEmail(w, chat.token, "khach@example.com");
    await webhook(w, ownerSays(`#${chat.code} Trả lời`));
    await env.DB.prepare("UPDATE support_conversations SET status = 'blocked'").run();
    expect(await sendSupportEmails(env.DB, w.deps, T0 + 600)).toBe(0);
    expect(w.resend.attempts).toBe(0);
  });

  it("email lỗi tạm rồi gửi lại: cùng Idempotency-Key ở hai lần", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await leaveEmail(w, chat.token, "khach@example.com");
    await webhook(w, ownerSays(`#${chat.code} Trả lời`));
    w.resend.down = true;
    await sendSupportEmails(env.DB, w.deps, T0 + 300);
    w.resend.down = false;
    expect(await sendSupportEmails(env.DB, w.deps, T0 + 600)).toBe(1);
    expect(w.resend.attemptKeys).toHaveLength(2);
    expect(w.resend.attemptKeys[0]).toMatch(/^support-\d+-\d+$/);
    expect(w.resend.attemptKeys[1]).toBe(w.resend.attemptKeys[0]);
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

  it("xóa dòng sự kiện Zalo đã xử lý sau 2 ngày", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO support_zalo_updates (message_id, received_at) VALUES ('cu', ?)").bind(T0),
      env.DB.prepare("INSERT INTO support_zalo_updates (message_id, received_at) VALUES ('moi', ?)").bind(T0 + DAY),
    ]);
    await pruneSupport(env.DB, T0 + 2 * DAY + 1);
    expect((await env.DB.prepare("SELECT message_id FROM support_zalo_updates").all()).results).toEqual([{ message_id: "moi" }]);
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
