import { describe, expect, it } from "vitest";
import { en, placeholders, vi, type MessageKey } from "./index";
import { ja } from "./ja";

// Từ điển của ba ngôn ngữ giao diện thêm ngày 2026-10-12 (spec 2026-10-12-ui-ja-zh-ko-design.md). Từ điển nào xong thì
// được thêm vào `DICTS` cùng dòng import của nó. Test của vi và en nằm ở i18n.test.ts.
type Dict = Record<MessageKey, string>;
type NewLang = "ja" | "zh" | "ko";

const DICTS: Partial<Record<NewLang, Dict>> = { ja };

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN = /\p{Script=Han}/u;
const HANGUL = /\p{Script=Hangul}/u;

// Hệ chữ mỗi ngôn ngữ phải có trong mỗi chuỗi (trừ danh sách trừ), và hệ chữ không được lẫn vào.
const SCRIPT: Record<NewLang, { has: RegExp; not: RegExp[] }> = {
  ja: { has: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u, not: [HANGUL] },
  zh: { has: HAN, not: [KANA, HANGUL] },
  ko: { has: HANGUL, not: [KANA] },
};

// Giống hệt en: tên riêng, tên gói và tên mỗi ngôn ngữ viết bằng chính nó (như vi.ts).
const SAME_AS_EN: MessageKey[] = [
  "app.name",
  "channel.beta",
  "plan.free",
  "plan.monthly",
  "plan.yearly",
  "license.standing.free",
  "lang.en",
  "lang.zh",
  "lang.ja",
  "lang.ko",
  "lang.vi",
];

// Câu mẫu xem trước phụ đề: câu gốc là English, giống hệt vi.ts (câu dịch mới là ngôn ngữ giao diện).
const ENGLISH_SAMPLE: MessageKey[] = [
  "settings.subtitles.preview.source",
  "settings.subtitles.preview.live.source",
  "settings.subtitles.preview.live.sourceTail",
];

// Bảng thuật ngữ của spec (§3): các khóa nhìn thấy nhiều nhất.
const GLOSSARY: Record<NewLang, Partial<Record<MessageKey, string>>> = {
  ja: {
    "nav.settings": "設定",
    "nav.glossary": "用語集",
    "nav.transcript": "文字起こし",
    "nav.upgrade": "Pro にアップグレード",
    "pro.upgrade": "Pro にアップグレード",
    "settings.group.hotkeys": "ショートカット",
    "settings.group.license": "ライセンス",
    "settings.group.model": "モデル",
    "home.overlay": "字幕バー",
    "transcript.export.translation": "翻訳",
    "transcript.export.source": "原文",
    "languages.lock": "音声の言語",
    "languages.target": "翻訳先の言語",
  },
  zh: {
    "nav.settings": "设置",
    "nav.glossary": "术语表",
    "nav.transcript": "转写记录",
    "nav.upgrade": "升级到 Pro",
    "pro.upgrade": "升级到 Pro",
    "settings.group.hotkeys": "快捷键",
    "settings.group.license": "许可证",
    "settings.group.model": "模型",
    "home.overlay": "字幕条",
    "transcript.export.translation": "翻译",
    "transcript.export.source": "原文",
    "languages.lock": "源语言",
    "languages.target": "目标语言",
  },
  ko: {
    "nav.settings": "설정",
    "nav.glossary": "용어집",
    "nav.transcript": "대본",
    "nav.upgrade": "Pro로 업그레이드",
    "pro.upgrade": "Pro로 업그레이드",
    "settings.group.hotkeys": "단축키",
    "settings.group.license": "라이선스",
    "settings.group.model": "모델",
    "home.overlay": "자막 바",
    "transcript.export.translation": "번역",
    "transcript.export.source": "원문",
    "languages.lock": "원본 언어",
    "languages.target": "번역 언어",
  },
};

// Chữ phồn thể không có trong chữ giản thể (zh phải là giản thể, spec Q1).
const TRADITIONAL_ONLY = /[設語體們這個點開關為時學說與會後務現動發應該對聽譯戶號碼檔錯誤連線網選項請確認測檢來還種於過]/;

describe.each(Object.entries(DICTS) as [NewLang, Dict][])("từ điển %s", (lang, dict) => {
  it("có đúng các khóa của en, không thiếu không thừa", () => {
    expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
  });

  it("cùng tham số {…} với en ở mỗi khóa", () => {
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(placeholders(dict[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("không chuỗi nào rỗng hay thừa khoảng trắng", () => {
    for (const [key, text] of Object.entries(dict)) {
      expect(text.trim(), key).not.toBe("");
      expect(text, key).toBe(text.trim());
    }
  });

  it("tên riêng, tên gói và tên ngôn ngữ giống hệt en", () => {
    for (const key of SAME_AS_EN) expect(dict[key], key).toBe(en[key]);
  });

  it("câu gốc của phần xem trước phụ đề là English, giống hệt vi", () => {
    for (const key of ENGLISH_SAMPLE) expect(dict[key], key).toBe(vi[key]);
  });

  it("mọi chuỗi còn lại có chữ của ngôn ngữ này và không lẫn hệ chữ khác", () => {
    const skip = new Set<string>([...SAME_AS_EN, ...ENGLISH_SAMPLE]);
    for (const [key, text] of Object.entries(dict)) {
      if (skip.has(key)) continue;
      expect(SCRIPT[lang].has.test(text), `${key}: ${text}`).toBe(true);
      for (const other of SCRIPT[lang].not) expect(other.test(text), `${key}: ${text}`).toBe(false);
    }
  });

  it("dùng đúng bảng thuật ngữ", () => {
    for (const [key, expected] of Object.entries(GLOSSARY[lang])) expect(dict[key as MessageKey], key).toBe(expected);
  });

  if (lang === "zh") {
    it("chữ giản thể: không có chữ phồn thể", () => {
      for (const [key, text] of Object.entries(dict)) {
        // `lang.ja` là tên tiếng Nhật viết bằng chính tiếng Nhật (có chữ 語, phồn thể): bỏ qua tên ngôn ngữ.
        if (key.startsWith("lang.")) continue;
        expect(TRADITIONAL_ONLY.test(text), `${key}: ${text}`).toBe(false);
      }
    });
  }
});
