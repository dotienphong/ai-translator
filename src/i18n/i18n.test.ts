import { describe, expect, it } from "vitest";
import { detectUiLanguage, en, errorKey, htmlLang, placeholders, translate, UI_LANGUAGES, type MessageKey, type UiLanguage, vi } from "./index";
import { ja } from "./ja";
import { ko } from "./ko";

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
        "plan.six_months",
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

// Chữ của màn hình Nâng cấp về cách trả bằng thẻ (Creem, kế hoạch hardening 06 task C3). Chữ phải nói đúng sự thật về đơn
// thẻ trễ/thất bại (trang Creem vẫn nhận tiền sau hạn của server) và có câu "merchant of record" (điều khoản Creem 3.7).
describe("chữ màn hình Nâng cấp: cách trả bằng thẻ", () => {
  const t = (lang: UiLanguage, key: MessageKey, params?: Record<string, string | number>) => translate(lang, key, params);
  const upgradeKeys = (Object.keys(en) as MessageKey[]).filter((key) => key.startsWith("upgrade."));

  // Câu cũ nói cửa hàng "chỉ nhận" VietQR: sai từ khi có thẻ quốc tế.
  const ONLY_VIETQR: Record<UiLanguage, RegExp> = {
    vi: /chỉ nhận/i,
    en: /\bonly\b/i,
    ja: /のみ/,
    zh: /仅/,
    ko: /로만/,
  };

  it("upgrade.bankOnly nói về cách trả VietQR, không nhắc Creem; upgrade.cardNote nói về Creem", () => {
    for (const lang of UI_LANGUAGES) {
      expect(t(lang, "upgrade.bankOnly"), lang).not.toMatch(/Creem/);
      expect(t(lang, "upgrade.bankOnly"), lang).toMatch(/VietQR/);
      expect(t(lang, "upgrade.cardNote"), lang).toMatch(/Creem/);
    }
  });

  it("không chuỗi upgrade.* nào còn nói cửa hàng chỉ nhận VietQR", () => {
    for (const lang of UI_LANGUAGES) {
      for (const key of upgradeKeys) expect(t(lang, key), `${lang}/${key}`).not.toMatch(ONLY_VIETQR[lang]);
    }
  });

  it("upgrade.cardMor giữ nguyên cụm \"merchant of record\" và ghi địa chỉ Buyer Terms dạng chữ, ở cả năm ngôn ngữ", () => {
    for (const lang of UI_LANGUAGES) {
      const text = t(lang, "upgrade.cardMor");
      expect(text, lang).toContain("Creem");
      expect(text, lang).toContain("merchant of record");
      expect(text, lang).toContain("creem.io/buyer-terms");
      // Bộ đọc Markdown trong app không có liên kết (src/lib/markdown.ts): địa chỉ chỉ là chữ, không phải URL đầy đủ.
      expect(text, lang).not.toMatch(/https?:\/\//);
      expect(text, lang).not.toContain("](");
    }
  });

  it("upgrade.browser.note nhắc đúng tên nút upgrade.reopen của cùng ngôn ngữ", () => {
    for (const lang of UI_LANGUAGES) expect(t(lang, "upgrade.browser.note"), lang).toContain(t(lang, "upgrade.reopen"));
  });

  it("upgrade.browser.note không khẳng định trang đã mở (app không biết chắc)", () => {
    const opened: Record<UiLanguage, RegExp> = {
      vi: /đã mở/i,
      en: /has opened|have opened|was opened/i,
      ja: /開きました/,
      zh: /已在你的浏览器中打开/,
      ko: /열렸습니다/,
    };
    for (const lang of UI_LANGUAGES) expect(t(lang, "upgrade.browser.note"), lang).not.toMatch(opened[lang]);
  });

  it("upgrade.linkExpiresPage là lời dặn có {time}, không khẳng định hạn của trang Creem", () => {
    const claim: Record<UiLanguage, RegExp> = {
      vi: /dùng được tới/i,
      en: /works until/i,
      ja: /まで有効/,
      zh: /有效期至/,
      ko: /까지 유효/,
    };
    for (const lang of UI_LANGUAGES) {
      expect(placeholders(t(lang, "upgrade.linkExpiresPage")), lang).toEqual(["time"]);
      expect(t(lang, "upgrade.linkExpiresPage"), lang).not.toMatch(claim[lang]);
    }
  });

  it("upgrade.order.failedCard có {code}; waitingCardLate, cancelNote và consentCard có đủ ý", () => {
    for (const lang of UI_LANGUAGES) {
      expect(placeholders(t(lang, "upgrade.order.failedCard")), lang).toEqual(["code"]);
      expect(placeholders(t(lang, "upgrade.order.waitingCardLate")), lang).toEqual([]);
      expect(placeholders(t(lang, "upgrade.browser.cancelNote")), lang).toEqual([]);
      expect(t(lang, "upgrade.order.waitingCardLate"), lang).toContain("Creem");
      // Email đi sang Creem để điền sẵn trang thanh toán: câu đồng ý của đơn thẻ phải nói tên Creem.
      expect(t(lang, "upgrade.consentCard"), lang).toContain("Creem");
      expect(t(lang, "upgrade.consentCard"), lang).not.toBe(t(lang, "upgrade.consent"));
    }
  });

  it("en: câu nhờ liên hệ hỗ trợ của đơn đều gọi \"this order number\" (không lẫn \"order code\")", () => {
    for (const key of upgradeKeys) expect(en[key], key).not.toMatch(/order code/i);
    expect(en["upgrade.order.failedCard"]).toContain("this order number");
  });

  it("upgrade.order.waitingCard chờ xác nhận thanh toán, không bảo khách \"đang chờ bạn trả\"", () => {
    const waitingYou: Record<UiLanguage, RegExp> = {
      vi: /^Đang chờ thanh toán/,
      en: /^Waiting for your payment/,
      ja: /^お支払いを待っています/,
      zh: /^正在等待你的付款/,
      ko: /^결제를 기다리는 중/,
    };
    for (const lang of UI_LANGUAGES) expect(t(lang, "upgrade.order.waitingCard"), lang).not.toMatch(waitingYou[lang]);
  });

  it("tiếng Nhật: ブラウザー (không bỏ ー), không dùng 開き直す, nhãn thẻ không nói 国際; tiếng Hàn: nhãn thẻ không nói 해외", () => {
    // Mọi chuỗi upgrade.* (kể cả `upgrade.payCard`, `upgrade.browser.title` có từ trước C3) cùng một cách viết.
    for (const key of upgradeKeys) expect(ja[key], `ja/${key}`).not.toMatch(/ブラウザ(?!ー)/);
    expect(ja["upgrade.cardNote"]).toContain("ブラウザー");
    expect(ja["upgrade.browser.note"]).toContain("ブラウザー");
    expect(ja["upgrade.payCard"]).toContain("ブラウザー");
    expect(ja["upgrade.browser.title"]).toContain("ブラウザー");
    expect(ja["upgrade.reopen"]).not.toMatch(/開き直/);
    expect(ja["upgrade.method.usd"]).not.toContain("国際");
    expect(ko["upgrade.method.usd"]).not.toContain("해외");
  });
});
