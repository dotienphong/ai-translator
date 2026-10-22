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
  fitUtf16,
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

  it("parseText: bỏ ký tự điều khiển hướng chữ, U+2028 và U+2029 thành xuống dòng, giữ ZWJ của emoji ghép", () => {
    expect(parseText("a\u202Eb\u202Ac\u202Dd\u2066e\u2069f")).toBe("abcdef");
    expect(parseText("một\u2028hai\u2029ba")).toBe("một\nhai\nba");
    expect(parseText("👨\u200D👩")).toBe("👨\u200D👩");
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
    // Khoảng trắng, ký tự điều khiển hay dấu gạch ngược chen giữa không được lách luật "một dấu /": trình duyệt hiểu là URL ngoài.
    expect(parsePage("/\t/evil.example/")).toBeNull();
    expect(parsePage("/ /evil.example/")).toBeNull();
    expect(parsePage("/\\evil.example/")).toBeNull();
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

  it("fitUtf16: chuỗi ngắn giữ nguyên; dài thì cắt theo code point còn .length <= max, không cắt đôi cặp surrogate, kết thúc bằng …", () => {
    expect(fitUtf16("xin chào", 2000)).toBe("xin chào");
    const long = "😀".repeat(1000) + "x".repeat(1000);
    const cut = fitUtf16(long, 2000);
    expect(cut.length).toBeLessThanOrEqual(2000);
    expect(cut.endsWith("…")).toBe(true);
    // 1000 emoji đã chiếm 2000 đơn vị: còn chỗ cho 999 emoji (1998) và dấu …
    expect(cut).toBe(`${"😀".repeat(999)}…`);
    expect(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(cut)).toBe(false);
    expect(fitUtf16("😀".repeat(5), 6)).toBe("😀😀…");
  });
});
