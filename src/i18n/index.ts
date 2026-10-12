import { en, type MessageKey } from "./en";
import { ja } from "./ja";
import { ko } from "./ko";
import { vi } from "./vi";
import { zh } from "./zh";

export type { MessageKey };
export type UiLanguage = "en" | "vi" | "ja" | "zh" | "ko";
export type Params = Record<string, string | number>;

// Thứ tự trong ô chọn ngôn ngữ giao diện (bước 1 onboarding và Cài đặt › Chung); nhãn là `lang.<mã>`, tên mỗi ngôn ngữ
// viết bằng chính nó.
export const UI_LANGUAGES: readonly UiLanguage[] = ["vi", "en", "ja", "zh", "ko"];

const dictionaries: Record<UiLanguage, Record<MessageKey, string>> = { en, vi, ja, zh, ko };

// Đổi ngôn ngữ có tác dụng ngay (§4.5): giao diện gọi hàm này mỗi lần vẽ, với ngôn ngữ đang chọn.
export function translate(lang: UiLanguage, key: MessageKey, params?: Params): string {
  const template = dictionaries[lang][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

// Phần ngôn ngữ chính của locale → ngôn ngữ giao diện. Mọi locale tiếng Trung (kể cả phồn thể) ra `zh`, giao diện chữ
// giản thể (spec 2026-10-12 Q1); `yue` là tiếng Quảng Đông mà macOS báo là `yue-Hant-HK`.
const UI_BY_LOCALE = new Map<string, UiLanguage>([
  ["vi", "vi"],
  ["ja", "ja"],
  ["ko", "ko"],
  ["zh", "zh"],
  ["yue", "zh"],
]);

// Ngôn ngữ giao diện trước khi đọc được cài đặt, theo locale đầu tiên (§4.1, bước 1); không khớp thì English. Sau đó phía
// Rust quyết định theo locale của hệ điều hành (`ui_language_from_locale`, cùng bảng ví dụ).
export function detectUiLanguage(locales: readonly string[]): UiLanguage {
  const primary = (locales[0] ?? "").split(/[-_]/)[0]?.toLowerCase() ?? "";
  return UI_BY_LOCALE.get(primary) ?? "en";
}

// Giá trị thuộc tính `lang` của trang theo ngôn ngữ giao diện. WebView chọn font CJK theo thuộc tính này (chữ Hán Nhật và
// Hán Trung có hình khác nhau) và trình đọc màn hình chọn giọng đọc.
export function htmlLang(lang: UiLanguage): string {
  return lang === "zh" ? "zh-Hans" : lang;
}

// Khóa câu báo lỗi cho mã lỗi của phía Rust (`CommandError.code`); mã lạ thì dùng câu chung.
export function errorKey(code: string): MessageKey {
  const key = `error.${code}`;
  return key in en ? (key as MessageKey) : "error.unknown";
}

export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
}

export { en, ja, ko, vi, zh };
