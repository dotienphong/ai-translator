import { describe, expect, it } from "vitest";
import { HttpZaloBot, ZALO_API_BASE, ZaloBotError, zaloFromEnv } from "../src/support/zalo";
import { FakeZalo, TEST_ZALO_OWNER, TEST_ZALO_TOKEN } from "./fakes";

const bot = (zalo: FakeZalo) => new HttpZaloBot(TEST_ZALO_TOKEN, TEST_ZALO_OWNER, zalo.fetch);

describe("HttpZaloBot: gửi tin tới Zalo của chủ dự án (spec 2026-10-22 §2.3)", () => {
  it("gọi sendMessage của Zalo Bot với chat_id của chủ dự án, thân JSON văn bản thuần", async () => {
    const zalo = new FakeZalo();
    await bot(zalo).send("Xin chào 👋");
    expect(zalo.urls).toEqual([`${ZALO_API_BASE}/bot${TEST_ZALO_TOKEN}/sendMessage`]);
    expect(zalo.sent).toEqual([{ chatId: TEST_ZALO_OWNER, text: "Xin chào 👋" }]);
    expect(zalo.contentTypes).toEqual(["application/json"]);
  });

  it("Zalo trả mã lỗi HTTP: ZaloBotError có mã, thông điệp không chứa token", async () => {
    const zalo = new FakeZalo();
    zalo.failStatus = 401;
    const err = await bot(zalo)
      .send("x")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ZaloBotError);
    expect((err as ZaloBotError).status).toBe(401);
    expect(String(err)).not.toContain(TEST_ZALO_TOKEN);
  });

  it("HTTP 200 mà thân không có ok: true thì coi là lỗi", async () => {
    const zalo = new FakeZalo();
    zalo.okFalseWith200 = true;
    await expect(bot(zalo).send("x")).rejects.toThrow(ZaloBotError);
  });

  it("HTTP 200 mà thân là HTML (không phải JSON) thì ZaloBotError", async () => {
    const zalo = new FakeZalo();
    zalo.htmlWith200 = true;
    await expect(bot(zalo).send("x")).rejects.toThrow(ZaloBotError);
  });

  it("tin dài quá 2000 đơn vị UTF-16 được cắt trước khi gửi (Zalo có thể đếm theo UTF-16)", async () => {
    const zalo = new FakeZalo();
    await bot(zalo).send("😀".repeat(1000) + "x".repeat(1500));
    expect(zalo.sent).toHaveLength(1);
    expect(zalo.sent[0]?.text.length).toBeLessThanOrEqual(2000);
    expect(zalo.sent[0]?.text.endsWith("…")).toBe(true);
  });

  it("lỗi mạng: ZaloBotError không có mã, không chứa URL hay token", async () => {
    const zalo = new FakeZalo();
    zalo.down = true;
    const err = await bot(zalo)
      .send("x")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ZaloBotError);
    expect((err as ZaloBotError).status).toBeUndefined();
    expect(String(err)).not.toContain(TEST_ZALO_TOKEN);
    expect(String(err)).not.toContain("zaloplatforms");
  });

  it("zaloFromEnv: thiếu token hay chat_id thì không có bot", () => {
    expect(zaloFromEnv({ ZALO_BOT_TOKEN: "t", ZALO_OWNER_CHAT_ID: "c" })).toBeInstanceOf(HttpZaloBot);
    expect(zaloFromEnv({ ZALO_BOT_TOKEN: "", ZALO_OWNER_CHAT_ID: "c" })).toBeNull();
    expect(zaloFromEnv({ ZALO_BOT_TOKEN: "t", ZALO_OWNER_CHAT_ID: "" })).toBeNull();
  });
});
