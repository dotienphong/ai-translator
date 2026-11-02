import { describe, expect, it } from "vitest";
import { translate, UI_LANGUAGES } from "../../i18n";
import { ICONS, SCREENS } from "./navigation";

describe("thanh điều hướng của cửa sổ chính", () => {
  it("Gõ dịch là mục riêng, ngay dưới Màn hình chính", () => {
    expect(SCREENS.slice(0, 3)).toEqual(["home", "compose", "transcript"]);
    expect(SCREENS.indexOf("compose")).toBe(SCREENS.indexOf("home") + 1);
  });

  it("Gõ dịch ngang hàng Cài đặt: cả hai là mục của thanh điều hướng, mỗi mục có đúng một lần", () => {
    expect(SCREENS).toContain("settings");
    expect(SCREENS).toContain("compose");
    expect(new Set(SCREENS).size).toBe(SCREENS.length);
  });

  it("mọi mục có biểu tượng và có nhãn ở cả năm ngôn ngữ", () => {
    for (const screen of SCREENS) {
      expect(ICONS[screen], screen).toBeTruthy();
      for (const lang of UI_LANGUAGES) expect(translate(lang, `nav.${screen}`).trim(), `${lang} nav.${screen}`).not.toBe("");
    }
    expect(translate("vi", "nav.compose")).toBe("Gõ dịch");
    expect(translate("en", "nav.compose")).toBe("Type & Translate");
  });

  it("Cài đặt không còn nhóm Gõ dịch (chữ nhóm đã bỏ khỏi từ điển cả năm ngôn ngữ)", () => {
    for (const lang of UI_LANGUAGES) expect(translate(lang, "settings.group.compose" as never), lang).toBeUndefined();
  });
});
