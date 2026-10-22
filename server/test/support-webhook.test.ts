import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEnabled } from "../src/support/store";
import { resetDb, withFailingInsert } from "./db";
import { auth, enableChat, ownerSays, startChat, webhook, zaloUpdate } from "./support-helpers";
import { makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

type World = ReturnType<typeof makeWorld>;
const customerSees = async (w: World, token: string) =>
  ((await w.call("GET", "/v1/support/messages?after=0", undefined, auth(token))).body.messages as { sender: string; text: string }[]).map(
    (m) => `${m.sender}: ${m.text}`,
  );
const ownerRows = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM support_messages WHERE sender = 'owner'").first<{ n: number }>())?.n;
const NONE_RECENT = "Không có cuộc chat nào nhắn trong 30 phút qua. Ghi mã ở đầu tin, ví dụ: #K7Q nội dung";

describe("webhook Zalo POST /v1/webhooks/zalo (spec 2026-10-22 §2.4, §2.5)", () => {
  it("sai hay thiếu header secret: 403, không làm gì", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    expect((await webhook(w, ownerSays("/bat"), "sai-secret")).status).toBe(403);
    expect((await w.call("POST", "/v1/webhooks/zalo", ownerSays("/bat"))).status).toBe(403);
    expect(await isEnabled(env.DB)).toBe(false);
    expect(w.zalo.sent).toEqual([]);
  });

  it("secret của server rỗng (chưa đặt): mọi tin bị từ chối, kể cả không header hay header rỗng", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld({ ZALO_WEBHOOK_SECRET: "" });
    expect((await w.call("POST", "/v1/webhooks/zalo", ownerSays("/bat"))).status).toBe(403);
    expect((await w.call("POST", "/v1/webhooks/zalo", ownerSays("/bat"), { "x-bot-api-secret-token": "" })).status).toBe(403);
    expect(await isEnabled(env.DB)).toBe(false);
    expect(w.zalo.sent).toEqual([]);
  });

  it("thân không đọc được, thiếu trường, hay tin của người lạ: 200, không ghi, không trả lời", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    expect(await webhook(w, "không phải json")).toMatchObject({ status: 200, body: { ok: true } });
    expect(await webhook(w, { ok: true, result: { event_name: "message.text.received" } })).toMatchObject({ status: 200 });
    expect(await webhook(w, ownerSays("/bat", "zm-1", "nguoi-la"))).toMatchObject({ status: 200 });
    expect(await isEnabled(env.DB)).toBe(false);
    expect(w.zalo.sent).toEqual([]);
  });

  it("trả lời có mã (viết thường cũng được): khách thấy câu trả lời; bot không báo lại", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    expect(await webhook(w, ownerSays(`#${chat.code.toLowerCase()} Mỗi key dùng trên một máy nhé.`))).toMatchObject({ status: 200, body: { ok: true } });
    expect(await customerSees(w, chat.token)).toEqual(["customer: Gói Monthly dùng được trên 2 máy không?", "owner: Mỗi key dùng trên một máy nhé."]);
    expect(w.zalo.sent).toHaveLength(1);
  });

  it("mã không có, thiếu nội dung, hay cuộc chat bị chặn: bot báo, không ghi", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await webhook(w, ownerSays("#Z0Z chào"));
    await webhook(w, ownerSays("#Z0ZX chào"));
    await webhook(w, ownerSays(`#${chat.code}`));
    await env.DB.prepare("UPDATE support_conversations SET status = 'blocked'").run();
    await webhook(w, ownerSays(`#${chat.code} chào`));
    expect(w.zalo.texts().slice(1)).toEqual([
      "Không có cuộc chat #Z0Z.",
      "Không đọc được mã. Ghi # và 3 ký tự của cuộc chat ở đầu tin, ví dụ: #K7Q nội dung (gõ /ds để xem mã). Tin này chưa được gửi.",
      "Thiếu nội dung sau mã.",
      `#${chat.code} đang bị chặn (gõ /mo #${chat.code} để mở).`,
    ]);
    expect(await ownerRows()).toBe(0);
  });

  it("không ghi mã: gửi tới cuộc chat duy nhất vừa nhắn trong 30 phút và báo ✓; không có cuộc nào hay có từ hai cuộc thì không đoán", async () => {
    const w = makeWorld();
    await enableChat();
    await webhook(w, ownerSays("Chào bạn"));
    expect(w.zalo.texts()).toEqual([NONE_RECENT]);
    const a = await startChat(w);
    w.clock.now = T0 + 60;
    await webhook(w, ownerSays("Chào bạn"));
    expect(w.zalo.texts().at(-1)).toBe(`✓ đã gửi tới #${a.code}`);
    expect(await customerSees(w, a.token)).toContain("owner: Chào bạn");
    w.clock.now = T0 + 120;
    const b = await startChat(w);
    await webhook(w, ownerSays("Bạn nào đấy?"));
    expect(w.zalo.texts().at(-1)).toBe(
      `⚠️ Có 2 cuộc chat vừa nhắn trong 30 phút qua (#${b.code}, #${a.code}). Ghi mã ở đầu tin, ví dụ: #${b.code} nội dung`,
    );
    expect(await ownerRows()).toBe(1);
    w.clock.now = T0 + 120 + 1801;
    await webhook(w, ownerSays("Còn ai không?"));
    expect(w.zalo.texts().at(-1)).toBe(NONE_RECENT);
  });

  it("Zalo gửi lại cùng message_id: chỉ ghi một lần, chỉ báo ✓ một lần", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    const update = ownerSays("Chào bạn", "zm-lap");
    await webhook(w, update);
    await webhook(w, update);
    expect(await ownerRows()).toBe(1);
    expect(w.zalo.texts().filter((t) => t.startsWith("✓"))).toEqual([`✓ đã gửi tới #${chat.code}`]);
  });

  it("Zalo gửi lại một lệnh đã xử lý: bỏ qua, không làm lại và bot không báo thêm (mọi loại tin của chủ dự án)", async () => {
    const w = makeWorld();
    const tat = ownerSays("/tat", "zm-tat");
    await webhook(w, ownerSays("/bat"));
    await webhook(w, tat);
    await webhook(w, ownerSays("/bat"));
    expect(await isEnabled(env.DB)).toBe(true);
    const before = w.zalo.texts().length;
    expect(await webhook(w, tat)).toMatchObject({ status: 200, body: { ok: true } });
    expect(await isEnabled(env.DB)).toBe(true);
    expect(w.zalo.texts()).toHaveLength(before);
    const ds = ownerSays("/ds", "zm-ds");
    await webhook(w, ds);
    await webhook(w, ds);
    const sticker = zaloUpdate("message.sticker.received", { sticker: "abc", message_id: "zm-st" });
    await webhook(w, sticker);
    await webhook(w, sticker);
    expect(w.zalo.texts().slice(before)).toEqual([expect.stringContaining("Không có cuộc chat nào trong 7 ngày qua"), "Chỉ gửi được chữ."]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM support_zalo_updates").first<{ n: number }>())?.n).toBe(5);
  });

  it("sự kiện chưa xử lý xong (D1 lỗi) không bị đánh dấu đã xử lý: Zalo gửi lại thì được xử lý", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = makeWorld();
    const bat = ownerSays("/bat", "zm-bat");
    await withFailingInsert("support_settings", "1", async () => {
      await webhook(w, bat);
    });
    expect(await isEnabled(env.DB)).toBe(false);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM support_zalo_updates").first()).toEqual({ n: 0 });
    await webhook(w, bat);
    expect(await isEnabled(env.DB)).toBe(true);
  });

  it("Zalo lỗi khi bot trả lời: webhook vẫn trả 200 và việc ghi D1 đã xong", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    w.zalo.down = true;
    expect(await webhook(w, ownerSays("/bat"))).toMatchObject({ status: 200, body: { ok: true } });
    expect(await isEnabled(env.DB)).toBe(true);
  });

  it("ảnh, sticker, tin thoại: bot báo chỉ gửi được chữ", async () => {
    const w = makeWorld();
    await webhook(w, zaloUpdate("message.sticker.received", { sticker: "abc", url: "https://zalo.example/sticker.png" }));
    await webhook(w, zaloUpdate("message.image.received", { photo: "https://zalo.example/a.jpg", caption: "#K7Q xem ảnh" }));
    expect(w.zalo.texts()).toEqual(["Chỉ gửi được chữ.", "Chỉ gửi được chữ."]);
    expect(await ownerRows()).toBe(0);
  });

  it("lệnh /bat, /chan, /mo, /ds, /tat và lệnh lạ", async () => {
    const w = makeWorld();
    await webhook(w, ownerSays("/bat"));
    expect(await isEnabled(env.DB)).toBe(true);
    const chat = await startChat(w);
    await webhook(w, ownerSays(`/chan #${chat.code}`));
    expect(await env.DB.prepare("SELECT status FROM support_conversations").first()).toEqual({ status: "blocked" });
    await webhook(w, ownerSays(`/mo ${chat.code}`));
    expect(await env.DB.prepare("SELECT status FROM support_conversations").first()).toEqual({ status: "open" });
    await webhook(w, ownerSays("/chan"));
    await webhook(w, ownerSays("/ds"));
    await webhook(w, ownerSays("/tat"));
    expect(await isEnabled(env.DB)).toBe(false);
    await webhook(w, ownerSays("/giupvoi"));
    const texts = w.zalo.texts();
    expect(texts[0]).toBe("Đã BẬT chat trên website và app.");
    expect(texts.slice(2, 6)).toEqual([
      `Đã chặn #${chat.code}: tin của khách này không chuyển tới nữa.`,
      `Đã bỏ chặn #${chat.code}.`,
      "Thiếu mã, ví dụ: /chan #K7Q",
      `Cuộc chat 7 ngày qua:\n#${chat.code} · web · vừa xong · "Gói Monthly dùng được trên 2 …"`,
    ]);
    expect(texts[6]).toBe("Đã TẮT chat trên website và app. Khách thấy email support@ thay ô nhập. Gõ /bat để bật lại.");
    expect(texts[7]).toContain("/ds: các cuộc chat 7 ngày qua");
  });

  it("thân không bọc trong result (phòng Zalo đổi dạng) và chat_id dạng số vẫn đọc được", async () => {
    const w = makeWorld({ ZALO_OWNER_CHAT_ID: "123456" });
    const update = ownerSays("/bat", "zm-so", "123456").result;
    await webhook(w, { ...update, message: { ...update.message, chat: { id: 123456, chat_type: "PRIVATE" } } });
    expect(await isEnabled(env.DB)).toBe(true);
  });

  it("email khách để lại không bao giờ được ghép vào tin gửi Zalo (tin sau, lời báo email, /ds)", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await w.call("PUT", "/v1/support/email", { email: "rieng-tu@example.com" }, auth(chat.token));
    await w.call("POST", "/v1/support/messages", { text: "Mình gửi thêm" }, auth(chat.token));
    await webhook(w, ownerSays("/ds"));
    expect(w.zalo.texts()).toHaveLength(4);
    expect(w.zalo.texts().join("\n")).not.toContain("rieng-tu");
  });
});
