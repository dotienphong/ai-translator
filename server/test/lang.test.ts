import { describe, expect, it } from "vitest";
import { LANGS, parseLang } from "../src/lang";
import { parseLang as parseSupportLang } from "../src/support/text";

describe("năm mã ngôn ngữ giao diện (src/lang.ts)", () => {
  it("parseLang chỉ nhận đúng một trong năm mã, chữ thường; còn lại null", () => {
    expect(LANGS).toEqual(["vi", "en", "ja", "zh", "ko"]);
    expect(LANGS.map((v) => parseLang(v))).toEqual(["vi", "en", "ja", "zh", "ko"]);
    for (const bad of ["fr", "VI", "", " vi", null, undefined, 5, {}]) expect(parseLang(bad)).toBeNull();
  });

  it("chat hỗ trợ dùng chính hàm này, không có danh sách mã thứ hai", () => {
    expect(parseSupportLang).toBe(parseLang);
  });
});
