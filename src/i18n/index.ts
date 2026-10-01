import { en, type MessageKey } from "./en";
import { vi } from "./vi";

export type { MessageKey };
export type UiLanguage = "en" | "vi";
export type Params = Record<string, string | number>;

const dictionaries: Record<UiLanguage, Record<MessageKey, string>> = { en, vi };

// Đổi ngôn ngữ có tác dụng ngay (§4.5): giao diện gọi hàm này mỗi lần vẽ, với ngôn ngữ đang chọn.
export function translate(lang: UiLanguage, key: MessageKey, params?: Params): string {
  const template = dictionaries[lang][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

// Ngôn ngữ giao diện trước khi đọc được cài đặt: tiếng Việt nếu locale đầu tiên là tiếng Việt,
// còn lại English (§4.1, bước 1). Sau đó phía Rust quyết định theo locale của hệ điều hành.
export function detectUiLanguage(locales: readonly string[]): UiLanguage {
  const primary = (locales[0] ?? "").split(/[-_]/)[0]?.toLowerCase();
  return primary === "vi" ? "vi" : "en";
}

// Khóa câu báo lỗi cho mã lỗi của phía Rust (`CommandError.code`); mã lạ thì dùng câu chung.
export function errorKey(code: string): MessageKey {
  const key = `error.${code}`;
  return key in en ? (key as MessageKey) : "error.unknown";
}

export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
}

export { en, vi };
