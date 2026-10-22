import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  isTokenShape,
  MAX_TEXT,
  newCode,
  newToken,
  parseContext,
  parseLang,
  parsePage,
  parseSource,
  parseText,
  truncate,
} from "../src/support/text";

describe("chuẩn hóa input của chat hỗ trợ (spec 2026-10-22 §2.2)", () => {
  it("parseText: xuống dòng về \\n, tab thành dấu cách, bỏ ký tự điều khiển, bỏ khoảng trắng hai đầu", () => {
    expect(parseText("  Xin\r\nchào\rbạn\tơi\u0000\u0007\u007f  ")).toBe("Xin\nchào\nbạn ơi");
  });

  it("parseText: 1–1000 ký tự tính theo code point; rỗng, chỉ khoảng trắng hay không phải chuỗi thì null", () => {
    expect(parseText("😀".repeat(MAX_TEXT))).toBe("😀".repeat(MAX_TEXT));
    expect(parseText("😀".repeat(MAX_TEXT + 1))).toBeNull();
    expect(parseText("   \n\t ")).toBeNull();
    expect(parseText("")).toBeNull();
    expect(parseText(42)).toBeNull();
    expect(parseText(null)).toBeNull();
  });

  it("parseLang, parseSource: chỉ giá trị đã biết, phân biệt hoa thường", () => {
    expect(["vi", "en", "ja", "zh", "ko"].map((v) => parseLang(v))).toEqual(["vi", "en", "ja", "zh", "ko"]);
    expect(parseLang("fr")).toBeNull();
    expect(parseLang("VI")).toBeNull();
    expect(["web", "app", "app-debug"].map((v) => parseSource(v))).toEqual(["web", "app", "app-debug"]);
    expect(parseSource("admin")).toBeNull();
    expect(parseSource(undefined)).toBeNull();
  });

  it("parsePage: chỉ đường dẫn bắt đầu bằng đúng một dấu /, bỏ query và hash, tối đa 200 ký tự", () => {
    expect(parsePage("/bang-gia/?utm=x#goi")).toBe("/bang-gia/");
    expect(parsePage("/en/pricing/")).toBe("/en/pricing/");
    expect(parsePage(`/${"a".repeat(300)}`)).toBe(`/${"a".repeat(199)}`);
    expect(parsePage("https://evil.example/")).toBeNull();
    expect(parsePage("//evil.example/")).toBeNull();
    expect(parsePage("bang-gia")).toBeNull();
    expect(parsePage(null)).toBeNull();
  });

  it("parseContext: ký tự điều khiển thành dấu cách, gộp khoảng trắng, tối đa 300 ký tự; rỗng thì null", () => {
    expect(parseContext("AI Translator 0.2.4\n·  macOS 15.6\u0000")).toBe("AI Translator 0.2.4 · macOS 15.6");
    expect(parseContext("x".repeat(400))).toBe("x".repeat(300));
    expect(parseContext("  \n ")).toBeNull();
    expect(parseContext(7)).toBeNull();
  });

  it("truncate: giữ nguyên khi vừa, cắt theo code point và kết thúc bằng …", () => {
    expect(truncate("abc", 3)).toBe("abc");
    expect(truncate("abcd", 3)).toBe("ab…");
    expect(truncate("😀😀😀😀", 3)).toBe("😀😀…");
  });

  it("newToken: 43 ký tự base64url, mỗi lần khác nhau; isTokenShape chỉ nhận đúng dạng đó", () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
    expect(isTokenShape(a)).toBe(true);
    expect(isTokenShape(`${a}x`)).toBe(false);
    expect(isTokenShape(`${"a".repeat(42)}=`)).toBe(false);
  });

  it("newCode: 3 ký tự trong bảng chữ 32 ký tự không có 0, 1, I, O", () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(CODE_ALPHABET).not.toMatch(/[01IO]/);
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^[2-9A-HJ-NP-Z]{3}$/);
  });
});
