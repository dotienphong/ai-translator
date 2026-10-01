import { describe, expect, it } from "vitest";
import { detectUiLanguage, en, errorKey, placeholders, translate, vi } from "./index";

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

  it("chuỗi tiếng Việt đã được dịch, trừ tên riêng và tên ngôn ngữ", () => {
    const same = (Object.keys(en) as (keyof typeof en)[]).filter((key) => en[key] === vi[key]);
    expect(same.sort()).toEqual(
      ["app.name", "channel.beta", "lang.en", "lang.ja", "lang.ko", "lang.vi", "lang.zh", "settings.group.model"].sort(),
    );
  });
});

describe("translate", () => {
  it("chọn đúng ngôn ngữ", () => {
    expect(translate("vi", "home.start")).toBe("Bắt đầu");
    expect(translate("en", "home.start")).toBe("Start");
  });

  it("điền tham số, giữ nguyên chỗ không có tham số", () => {
    expect(translate("vi", "onboarding.step", { n: 2, total: 8 })).toBe("Bước 2/8");
    expect(translate("en", "about.version", {})).toBe("Version {version}");
  });
});

describe("detectUiLanguage", () => {
  it("tiếng Việt nếu locale đầu tiên là tiếng Việt, còn lại English", () => {
    expect(detectUiLanguage(["vi-VN", "en-US"])).toBe("vi");
    expect(detectUiLanguage(["vi"])).toBe("vi");
    expect(detectUiLanguage(["en-US", "vi-VN"])).toBe("en");
    expect(detectUiLanguage(["fr-FR"])).toBe("en");
    expect(detectUiLanguage([])).toBe("en");
  });
});

describe("errorKey", () => {
  it("mã lỗi của Rust ra khóa error.<mã>, mã lạ ra câu chung", () => {
    expect(errorKey("outOfRange")).toBe("error.outOfRange");
    expect(errorKey("hotkeyDuplicate")).toBe("error.hotkeyDuplicate");
    expect(errorKey("khongCo")).toBe("error.unknown");
  });
});
