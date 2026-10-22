import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../src/crypto";
import { CLAIM_TTL, forwardConversation, isContentRejection } from "../src/support/forward";
import { addCustomerMessage, createConversation, type NewConversation, setStatus } from "../src/support/store";
import { newToken } from "../src/support/text";
import { HttpZaloBot, ZaloBotError } from "../src/support/zalo";
import { resetDb } from "./db";
import { FakeZalo, TEST_ZALO_OWNER, TEST_ZALO_TOKEN } from "./fakes";
import { T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

const db = env.DB;
const APP: NewConversation = { source: "app", lang: "vi", page: null, context: "AI Translator 0.2.4 · macOS 15.6" };
const HEADER = "🆕 #M2D · app · vi · AI Translator 0.2.4 · macOS 15.6";

async function setup() {
  const zalo = new FakeZalo();
  const bot = new HttpZaloBot(TEST_ZALO_TOKEN, TEST_ZALO_OWNER, zalo.fetch);
  const conv = await createConversation(db, await sha256Hex(newToken()), APP, T0, () => "M2D");
  return { zalo, bot, conv };
}

const rows = async () => (await db.prepare("SELECT text, forwarded_at, claimed_at, forward_attempts FROM support_messages ORDER BY id").all()).results;

describe("chuyển tin khách sang Zalo (spec 2026-10-22 §2.3)", () => {
  it("tin đầu có dòng 🆕 kèm thông tin máy, tin sau chỉ có mã; đánh dấu đã chuyển; gọi lại thì không gửi trùng", async () => {
    const { zalo, bot, conv } = await setup();
    await addCustomerMessage(db, conv.id, "Phụ đề không hiện", T0);
    await addCustomerMessage(db, conv.id, "Mình dùng Teams", T0 + 1);
    expect(await forwardConversation(db, bot, conv.id, T0 + 2)).toBe("sent");
    expect(zalo.texts()).toEqual([`${HEADER}\nPhụ đề không hiện`, "#M2D Mình dùng Teams"]);
    expect(await rows()).toEqual([
      { text: "Phụ đề không hiện", forwarded_at: T0 + 2, claimed_at: null, forward_attempts: 0 },
      { text: "Mình dùng Teams", forwarded_at: T0 + 2, claimed_at: null, forward_attempts: 0 },
    ]);
    expect(await forwardConversation(db, bot, conv.id, T0 + 3)).toBe("idle");
    expect(zalo.sent).toHaveLength(2);
  });

  it("lỗi không phải do nội dung (5xx, lỗi mạng, 401, 403, 404, 408, 429): tin trở lại hàng chờ, KHÔNG tính lần thử", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { zalo, bot, conv } = await setup();
    await addCustomerMessage(db, conv.id, "một", T0);
    for (const status of [500, 502, 401, 403, 404, 408, 429]) {
      zalo.failStatus = status;
      expect(await forwardConversation(db, bot, conv.id, T0 + 2)).toBe("failed");
    }
    zalo.failStatus = null;
    zalo.down = true;
    expect(await forwardConversation(db, bot, conv.id, T0 + 2)).toBe("failed");
    expect(await rows()).toEqual([{ text: "một", forwarded_at: null, claimed_at: null, forward_attempts: 0 }]);
  });

  it("isContentRejection: chỉ lỗi 4xx ngoài 401, 403, 404, 408, 429 là Zalo từ chối nội dung", () => {
    expect(isContentRejection(new ZaloBotError("x", 400))).toBe(true);
    expect(isContentRejection(new ZaloBotError("x", 422))).toBe(true);
    for (const status of [401, 403, 404, 408, 429, 500, 502, 503, 200, 302]) expect(isContentRejection(new ZaloBotError("x", status))).toBe(false);
    expect(isContentRejection(new ZaloBotError("lỗi mạng"))).toBe(false);
    expect(isContentRejection(new Error("lạ"))).toBe(false);
    expect(isContentRejection("400")).toBe(false);
  });

  it("Zalo lỗi: tin trở lại hàng chờ, đếm lần thử, tin sau không được gửi trước; lần sau gửi đúng thứ tự và tin đầu vẫn có dòng 🆕", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { zalo, bot, conv } = await setup();
    await addCustomerMessage(db, conv.id, "một", T0);
    await addCustomerMessage(db, conv.id, "hai", T0 + 1);
    zalo.failStatus = 400;
    expect(await forwardConversation(db, bot, conv.id, T0 + 2)).toBe("failed");
    expect(await rows()).toEqual([
      { text: "một", forwarded_at: null, claimed_at: null, forward_attempts: 1 },
      { text: "hai", forwarded_at: null, claimed_at: null, forward_attempts: 0 },
    ]);
    zalo.failStatus = null;
    expect(await forwardConversation(db, bot, conv.id, T0 + 300)).toBe("sent");
    expect(zalo.texts()).toEqual([`${HEADER}\nmột`, "#M2D hai"]);
  });

  it("cuộc chat bị chặn, hay không có bot (thiếu secret): không gửi gì", async () => {
    const { zalo, bot, conv } = await setup();
    await addCustomerMessage(db, conv.id, "spam", T0);
    expect(await forwardConversation(db, null, conv.id, T0)).toBe("idle");
    await setStatus(db, conv.id, "blocked");
    expect(await forwardConversation(db, bot, conv.id, T0)).toBe("idle");
    expect(zalo.sent).toEqual([]);
  });

  it("tin chờ quá 24 giờ thì không gửi nữa", async () => {
    const { zalo, bot, conv } = await setup();
    await addCustomerMessage(db, conv.id, "cũ", T0);
    expect(await forwardConversation(db, bot, conv.id, T0 + 86401)).toBe("idle");
    expect(zalo.sent).toEqual([]);
  });

  it("tin cũ nhất đang được giữ chỗ (còn hạn): dừng, tin sau không đi trước", async () => {
    const { zalo, bot, conv } = await setup();
    const m = await addCustomerMessage(db, conv.id, "một", T0);
    await addCustomerMessage(db, conv.id, "hai", T0 + 1);
    await db.prepare("UPDATE support_messages SET claimed_at = ? WHERE id = ?").bind(T0, m.id).run();
    expect(await forwardConversation(db, bot, conv.id, T0 + 1)).toBe("idle");
    expect(zalo.sent).toEqual([]);
  });

  it("giữ chỗ hết hạn sau 60 giây: giữ chỗ lại, gửi cả hai đúng thứ tự, tin đầu có 🆕, bỏ dấu giữ chỗ", async () => {
    const { zalo, bot, conv } = await setup();
    const m = await addCustomerMessage(db, conv.id, "một", T0);
    await addCustomerMessage(db, conv.id, "hai", T0 + 1);
    await db.prepare("UPDATE support_messages SET claimed_at = ? WHERE id = ?").bind(T0, m.id).run();
    expect(await forwardConversation(db, bot, conv.id, T0 + CLAIM_TTL + 1)).toBe("sent");
    expect(zalo.texts()).toEqual([`${HEADER}\nmột`, "#M2D hai"]);
    expect(await rows()).toEqual([
      { text: "một", forwarded_at: T0 + 61, claimed_at: null, forward_attempts: 0 },
      { text: "hai", forwarded_at: T0 + 61, claimed_at: null, forward_attempts: 0 },
    ]);
  });

  it("tin một gửi được, tin hai Zalo lỗi: failed, tin một đã chuyển, tin hai đếm một lần thử, không còn dấu giữ chỗ", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { zalo, conv } = await setup();
    await addCustomerMessage(db, conv.id, "một", T0);
    await addCustomerMessage(db, conv.id, "hai", T0 + 1);
    const realFetch = zalo.fetch;
    let calls = 0;
    const flaky = new HttpZaloBot(TEST_ZALO_TOKEN, TEST_ZALO_OWNER, (url, init) => {
      calls += 1;
      if (calls === 2) zalo.failStatus = 400;
      return realFetch(url, init);
    });
    expect(await forwardConversation(db, flaky, conv.id, T0 + 2)).toBe("failed");
    expect(await rows()).toEqual([
      { text: "một", forwarded_at: T0 + 2, claimed_at: null, forward_attempts: 0 },
      { text: "hai", forwarded_at: null, claimed_at: null, forward_attempts: 1 },
    ]);
  });

  it("tin đầu chờ quá 24 giờ bị bỏ: tin sau (mới hơn) tới Zalo đầu tiên vẫn có dòng 🆕", async () => {
    const { zalo, bot, conv } = await setup();
    await addCustomerMessage(db, conv.id, "cũ", T0);
    await addCustomerMessage(db, conv.id, "mới", T0 + 86000);
    expect(await forwardConversation(db, bot, conv.id, T0 + 86401)).toBe("sent");
    expect(zalo.texts()).toEqual([`${HEADER}\nmới`]);
  });
});
