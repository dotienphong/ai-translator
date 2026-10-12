import { describe, expect, it } from "vitest";
import { detectUiLanguage, en, errorKey, htmlLang, placeholders, translate, UI_LANGUAGES, type UiLanguage, vi } from "./index";

describe("từ điển giao diện", () => {
  it("vi có đúng các khóa của en, không thiếu không thừa", () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });

  it("không chuỗi nào rỗng hay thừa khoảng trắng", () => {
    for (const dict of [en, vi]) {
      for (const [key, text] of Object.entries(dict)) {
        expect(text.trim(), key).not.toBe("");
        expect(text, key).toBe(text.trim());
      }
    }
  });

  it("hai ngôn ngữ có cùng tham số ở mỗi khóa", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(vi[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("tiếng Việt gọi icon là \"biểu tượng\", một từ thống nhất", () => {
    for (const [key, text] of Object.entries(vi)) expect(text, key).not.toMatch(/\bicon\b/i);
  });

  it("chuỗi tiếng Việt đã được dịch, trừ tên riêng và tên ngôn ngữ", () => {
    const same = (Object.keys(en) as (keyof typeof en)[]).filter((key) => en[key] === vi[key]);
    expect(same.sort()).toEqual(
      [
        "app.name",
        "channel.beta",
        "lang.en",
        "lang.ja",
        "lang.ko",
        "lang.vi",
        "lang.zh",
        "settings.group.model",
        // Tên gói là tên riêng (spec §2).
        "plan.free",
        "plan.monthly",
        "plan.yearly",
        "license.standing.free",
      ].sort(),
    );
  });
});

describe("translate", () => {
  it("chọn đúng ngôn ngữ", () => {
    expect(translate("vi", "home.start")).toBe("Bắt đầu");
    expect(translate("en", "home.start")).toBe("Start");
  });

  it("chọn đúng từ điển của ja, zh, ko", () => {
    expect(translate("ja", "nav.settings")).toBe("設定");
    expect(translate("zh", "nav.settings")).toBe("设置");
    expect(translate("ko", "nav.settings")).toBe("설정");
    for (const lang of ["ja", "zh", "ko"] as const) {
      const step = translate(lang, "onboarding.step", { n: 2, total: 8 });
      expect(step, lang).toContain("2");
      expect(step, lang).toContain("8");
    }
  });

  it("điền tham số, giữ nguyên chỗ không có tham số", () => {
    expect(translate("vi", "onboarding.step", { n: 2, total: 8 })).toBe("Bước 2/8");
    expect(translate("en", "about.version", {})).toBe("Version {version}");
  });
});

// Cùng bảng với test `default_ui_language_from_os_locale` của src-tauri/src/i18n.rs: sửa một nơi thì sửa nơi kia.
const LOCALE_CASES: [string, UiLanguage][] = [
  ["vi-VN", "vi"],
  ["vi_VN", "vi"],
  ["vi", "vi"],
  ["VI-vn", "vi"],
  ["ja-JP", "ja"],
  ["ja", "ja"],
  ["ko-KR", "ko"],
  ["ko_KR", "ko"],
  ["zh-CN", "zh"],
  ["zh-Hans-CN", "zh"],
  ["zh-Hant-TW", "zh"],
  ["zh_TW", "zh"],
  ["zh-HK", "zh"],
  ["zh", "zh"],
  ["yue-Hant-HK", "zh"],
  ["en-US", "en"],
  ["fr-FR", "en"],
  ["video", "en"],
  ["jam", "en"],
  ["korean", "en"],
  ["", "en"],
];

describe("detectUiLanguage", () => {
  it.each(LOCALE_CASES)("locale %s ra giao diện %s", (locale, expected) => {
    expect(detectUiLanguage([locale])).toBe(expected);
  });

  it("chỉ xét locale đầu tiên; không có locale thì English", () => {
    expect(detectUiLanguage(["en-US", "ja-JP"])).toBe("en");
    expect(detectUiLanguage(["ja-JP", "en-US"])).toBe("ja");
    expect(detectUiLanguage([])).toBe("en");
  });
});

describe("htmlLang", () => {
  it("tiếng Trung là zh-Hans (chữ giản thể), còn lại là chính mã", () => {
    expect(htmlLang("zh")).toBe("zh-Hans");
    expect(htmlLang("ja")).toBe("ja");
    expect(htmlLang("ko")).toBe("ko");
    expect(htmlLang("vi")).toBe("vi");
    expect(htmlLang("en")).toBe("en");
  });
});

describe("UI_LANGUAGES", () => {
  it("đủ năm ngôn ngữ, mỗi ngôn ngữ có từ điển và nhãn là tên viết bằng chính nó", () => {
    expect([...UI_LANGUAGES].sort()).toEqual(["en", "ja", "ko", "vi", "zh"]);
    const endonym: Record<UiLanguage, string> = { vi: "Tiếng Việt", en: "English", ja: "日本語", zh: "中文", ko: "한국어" };
    for (const lang of UI_LANGUAGES) {
      for (const shown of UI_LANGUAGES) expect(translate(lang, `lang.${shown}`), `${lang}/${shown}`).toBe(endonym[shown]);
    }
  });
});

describe("errorKey", () => {
  it("mã lỗi của Rust ra khóa error.<mã>, mã lạ ra câu chung", () => {
    expect(errorKey("outOfRange")).toBe("error.outOfRange");
    expect(errorKey("hotkeyDuplicate")).toBe("error.hotkeyDuplicate");
    expect(errorKey("khongCo")).toBe("error.unknown");
  });
});
