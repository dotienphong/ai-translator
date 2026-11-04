import { describe, expect, it } from "vitest";
import { translate, UI_LANGUAGES } from "../../i18n";
import { ICONS, SCREENS, visibleScreens } from "./navigation";

describe("thanh điều hướng của cửa sổ chính", () => {
  it("Gõ dịch là mục riêng, ngay dưới Màn hình chính", () => {
    expect(SCREENS.slice(0, 2)).toEqual(["home", "compose"]);
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

  // Spec 2026-11-04-giong-doc §7: mục "Giọng đọc" ngay sau Gõ dịch, chỉ có trên Windows (giọng đọc chỉ có ở bản Windows).
  it("voice_follows_compose: Giọng đọc ngay sau Gõ dịch, biểu tượng loa", () => {
    expect(SCREENS.indexOf("voice")).toBe(SCREENS.indexOf("compose") + 1);
    expect(ICONS.voice).toBe("speaker");
    expect(translate("vi", "nav.voice")).toBe("Giọng đọc");
  });

  it("macos_hides_voice: macOS không có mục Giọng đọc, các mục khác giữ thứ tự", () => {
    const screens = visibleScreens("macos");
    expect(screens).not.toContain("voice");
    expect(screens).toEqual(SCREENS.filter((s) => s !== "voice"));
  });

  it("windows_shows_voice: Windows có đủ mọi mục", () => {
    expect(visibleScreens("windows")).toEqual(SCREENS);
  });

  it("Cài đặt không còn nhóm Gõ dịch (chữ nhóm đã bỏ khỏi từ điển cả năm ngôn ngữ)", () => {
    for (const lang of UI_LANGUAGES) expect(translate(lang, "settings.group.compose" as never), lang).toBeUndefined();
  });
});
