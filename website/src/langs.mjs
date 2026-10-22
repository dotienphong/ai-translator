// Ngôn ngữ của website (spec 2026-10-22-website-ja-zh-ko-design §2). Khóa là mã nội bộ (tên thư mục ở src/content/). Mỗi ngôn ngữ:
// thẻ BCP 47 cho `lang`, hreflang, inLanguage (tiếng Trung là chữ giản thể: zh-Hans), tiền tố đường dẫn, og:locale, tên bản ngữ
// (menu ngôn ngữ), mã ngắn (menu trên điện thoại), locale của Intl. `published: false`: chưa dựng trang của ngôn ngữ đó (đang
// dịch); bật khi đủ trang (kế hoạch 2026-10-22-website-ja-zh-ko-04).
export const LANGS = {
  vi: { tag: "vi", prefix: "/", ogLocale: "vi_VN", name: "Tiếng Việt", short: "VI", intl: "vi-VN", published: true },
  en: { tag: "en", prefix: "/en/", ogLocale: "en_US", name: "English", short: "EN", intl: "en-GB", published: true },
  ja: { tag: "ja", prefix: "/ja/", ogLocale: "ja_JP", name: "日本語", short: "JA", intl: "ja-JP", published: false },
  zh: { tag: "zh-Hans", prefix: "/zh/", ogLocale: "zh_CN", name: "中文", short: "ZH", intl: "zh-CN", published: false },
  ko: { tag: "ko", prefix: "/ko/", ogLocale: "ko_KR", name: "한국어", short: "KO", intl: "ko-KR", published: false },
};
export const LANG_CODES = Object.keys(LANGS);
/** Ngôn ngữ đang dựng trang, theo thứ tự của LANGS. */
export const PUBLISHED = LANG_CODES.filter((l) => LANGS[l].published);
/** Ngôn ngữ chữ Hán, kana, Hangul: ngưỡng SEO riêng và phông có sẵn của máy (spec §3, §5). */
export const CJK = new Set(["ja", "zh", "ko"]);
/** Trang chỉ có bản vi và en: văn bản pháp lý (ja/zh/ko dẫn sang bản tiếng Anh, spec §2). */
export const VI_EN_ONLY = new Set(["terms", "privacy"]);

export const tagOf = (lang) => LANGS[lang].tag;
export const homeOf = (lang) => LANGS[lang].prefix;
export const isHome = (urlPath) => LANG_CODES.some((l) => LANGS[l].prefix === urlPath);

/** Đường dẫn bản ja/zh/ko suy từ bản en: "/en/guide/quick-start/" → "/ja/guide/quick-start/". */
export function fromEn(enPath, lang) {
  if (!enPath.startsWith("/en/")) throw new Error(`không phải đường dẫn tiếng Anh: ${enPath}`);
  return LANGS[lang].prefix + enPath.slice("/en/".length);
}

/** Ngày cho người đọc: vi 09/10/2026, en 9 October 2026, ja/zh 2026年10月9日, ko 2026년 10월 9일. */
export function formatDate(iso, lang) {
  if (lang === "vi") return iso.split("-").reverse().join("/");
  const date = new Date(`${iso}T00:00:00Z`);
  if (lang === "en") return date.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  return new Intl.DateTimeFormat(LANGS[lang].intl, { dateStyle: "long", timeZone: "UTC" }).format(date);
}
