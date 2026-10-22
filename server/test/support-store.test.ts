import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto";
import {
  addCustomerMessage,
  addOwnerMessage,
  conversationByCode,
  conversationByToken,
  createConversation,
  deleteConversation,
  getSetting,
  isEnabled,
  messagesAfter,
  openWithCustomerSince,
  recentConversations,
  setEmail,
  setSetting,
  setStatus,
} from "../src/support/store";
import { newToken } from "../src/support/text";
import { resetDb } from "./db";
import { T0 } from "./world";

beforeEach(resetDb);

const db = env.DB;
const web = { source: "web", lang: "vi", page: "/", context: null } as const;

async function conv(code?: string, now = T0) {
  const token = newToken();
  const makeCode = code === undefined ? undefined : (): string => code;
  return { token, c: await createConversation(db, await sha256Hex(token), web, now, makeCode) };
}

describe("D1 của chat hỗ trợ (migration 0005)", () => {
  it("createConversation: mã 3 ký tự, chỉ lưu mã băm của token; conversationByToken tìm lại, token lạ hay sai dạng thì null", async () => {
    const { token, c } = await conv();
    expect(c).toMatchObject({
      code: expect.stringMatching(/^[2-9A-HJ-NP-Z]{3}$/),
      source: "web",
      lang: "vi",
      page: "/",
      context: null,
      email: null,
      status: "open",
      created_at: T0,
      last_customer_at: null,
      last_owner_at: null,
      last_activity_at: T0,
      delivered_owner_id: 0,
      emailed_owner_id: 0,
      emailed_at: null,
    });
    expect(await db.prepare("SELECT token_hash FROM support_conversations").first()).toEqual({ token_hash: await sha256Hex(token) });
    expect((await conversationByToken(db, token))?.id).toBe(c.id);
    expect(await conversationByToken(db, newToken())).toBeNull();
    expect(await conversationByToken(db, "ngắn")).toBeNull();
  });

  it("createConversation: mã trùng thì sinh lại; trùng mãi thì báo lỗi", async () => {
    await conv("AAA");
    const codes = ["AAA", "BBB"];
    const second = await createConversation(db, await sha256Hex(newToken()), web, T0, () => codes.shift() ?? "ZZZ");
    expect(second.code).toBe("BBB");
    await expect(createConversation(db, await sha256Hex(newToken()), web, T0, () => "AAA")).rejects.toThrow(/mã cuộc chat/);
  });

  it("addCustomerMessage: cập nhật mốc của cuộc chat; messagesAfter trả tin sau con trỏ, tăng dần", async () => {
    const { c } = await conv();
    const m1 = await addCustomerMessage(db, c.id, "một", T0 + 10);
    const m2 = await addCustomerMessage(db, c.id, "hai", T0 + 20);
    expect(m1).toEqual({ id: m1.id, sender: "customer", text: "một", created_at: T0 + 10 });
    expect(m2.id).toBeGreaterThan(m1.id);
    expect(await db.prepare("SELECT last_customer_at, last_activity_at FROM support_conversations WHERE id = ?").bind(c.id).first()).toEqual({
      last_customer_at: T0 + 20,
      last_activity_at: T0 + 20,
    });
    expect((await messagesAfter(db, c.id, 0)).map((m) => m.text)).toEqual(["một", "hai"]);
    expect((await messagesAfter(db, c.id, m1.id)).map((m) => m.text)).toEqual(["hai"]);
  });

  it("addOwnerMessage: cùng message_id của Zalo thì chỉ ghi một lần và chỉ cập nhật mốc một lần", async () => {
    const { c } = await conv();
    expect(await addOwnerMessage(db, c.id, "Chào bạn", "zm-1", T0 + 5)).toBe(true);
    expect(await addOwnerMessage(db, c.id, "Chào bạn", "zm-1", T0 + 6)).toBe(false);
    expect((await messagesAfter(db, c.id, 0)).map((m) => [m.sender, m.text])).toEqual([["owner", "Chào bạn"]]);
    expect(await db.prepare("SELECT last_owner_at, last_activity_at FROM support_conversations WHERE id = ?").bind(c.id).first()).toEqual({
      last_owner_at: T0 + 5,
      last_activity_at: T0 + 5,
    });
  });

  it("conversationByCode không phân biệt hoa thường; setStatus, setEmail ghi đúng", async () => {
    const { c } = await conv("K7Q");
    expect((await conversationByCode(db, "k7q"))?.id).toBe(c.id);
    expect(await conversationByCode(db, "ZZZ")).toBeNull();
    await setStatus(db, c.id, "blocked");
    await setEmail(db, c.id, "khach@example.com", T0 + 9);
    expect(await conversationByCode(db, "K7Q")).toMatchObject({ status: "blocked", email: "khach@example.com", last_activity_at: T0 + 9 });
  });

  it("deleteConversation xóa cả tin của cuộc chat", async () => {
    const { c } = await conv();
    await addCustomerMessage(db, c.id, "x", T0);
    await deleteConversation(db, c.id);
    expect(await db.prepare("SELECT (SELECT COUNT(*) FROM support_conversations) AS c, (SELECT COUNT(*) FROM support_messages) AS m").first()).toEqual({
      c: 0,
      m: 0,
    });
  });

  it("openWithCustomerSince: chỉ cuộc chat đang mở có tin khách từ mốc trở đi, mới nhất trước", async () => {
    const a = (await conv("AAA")).c;
    const b = (await conv("BBB")).c;
    const old = (await conv("CCC")).c;
    const blocked = (await conv("DDD")).c;
    await addCustomerMessage(db, a.id, "a", T0 + 100);
    await addCustomerMessage(db, b.id, "b", T0 + 200);
    await addCustomerMessage(db, old.id, "c", T0 - 5000);
    await addCustomerMessage(db, blocked.id, "d", T0 + 300);
    await setStatus(db, blocked.id, "blocked");
    expect(await openWithCustomerSince(db, T0)).toEqual([
      { id: b.id, code: "BBB" },
      { id: a.id, code: "AAA" },
    ]);
  });

  it("recentConversations: nguồn, trạng thái, có email, tin cuối; mới nhất trước", async () => {
    const a = (await conv("AAA")).c;
    const b = (await conv("BBB")).c;
    await addCustomerMessage(db, a.id, "tin cũ", T0 + 1);
    await addOwnerMessage(db, a.id, "trả lời", "zm-a", T0 + 2);
    await addCustomerMessage(db, b.id, "tin b", T0 + 3);
    await setEmail(db, b.id, "b@example.com", T0 + 4);
    await setStatus(db, a.id, "blocked");
    expect(await recentConversations(db, T0)).toEqual([
      { code: "BBB", source: "web", status: "open", has_email: 1, last_activity_at: T0 + 4, last_text: "tin b" },
      { code: "AAA", source: "web", status: "blocked", has_email: 0, last_activity_at: T0 + 2, last_text: "trả lời" },
    ]);
  });

  it("support_settings: thiếu dòng thì chat tắt; setSetting ghi đè", async () => {
    expect(await isEnabled(db)).toBe(false);
    await setSetting(db, "enabled", "1");
    expect(await isEnabled(db)).toBe(true);
    await setSetting(db, "enabled", "0");
    expect(await getSetting(db, "enabled")).toBe("0");
    expect(await isEnabled(db)).toBe(false);
  });
});
