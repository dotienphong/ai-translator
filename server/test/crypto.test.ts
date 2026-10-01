import { describe, expect, it } from "vitest";
import { b64urlDecode, b64urlEncode, hmacSha256Hex, sha256Hex, timingSafeEqual } from "../src/crypto";

describe("crypto", () => {
  it("base64url đi và về, không padding", () => {
    const bytes = Uint8Array.from([0, 250, 251, 252, 253, 254, 255]);
    const text = b64urlEncode(bytes);
    expect(text).toBe("APr7_P3-_w");
    expect(Array.from(b64urlDecode(text))).toEqual(Array.from(bytes));
  });

  it("base64url sai định dạng thì ném lỗi", () => {
    expect(() => b64urlDecode("ab+c")).toThrow();
    expect(() => b64urlDecode("abcde")).toThrow();
  });

  it("base64url không ở dạng chuẩn (có padding, bit thừa khác 0) thì ném lỗi", () => {
    expect(Array.from(b64urlDecode("AA"))).toEqual([0]);
    expect(() => b64urlDecode("AA==")).toThrow();
    // "AB": ký tự cuối mang 4 bit thừa khác 0, giải lỏng lẻo vẫn ra byte 0.
    expect(() => b64urlDecode("AB")).toThrow(/dạng chuẩn/);
  });

  it("SHA-256 khớp giá trị chuẩn", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("HMAC-SHA256 khớp RFC 4231, trường hợp 2", async () => {
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("so sánh an toàn", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
