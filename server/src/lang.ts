// Năm ngôn ngữ giao diện của app và website (spec 2026-10-12-ui-ja-zh-ko-design.md). Dùng chung cho chat hỗ trợ, ngôn ngữ lưu
// trên đơn và ngôn ngữ thư gửi khách (spec 2026-10-23-email-theo-ngon-ngu-design.md).
export type Lang = "vi" | "en" | "ja" | "zh" | "ko";

export const LANGS: readonly Lang[] = ["vi", "en", "ja", "zh", "ko"];

/** Đúng một trong năm mã (chữ thường); mọi giá trị khác là null. */
export function parseLang(v: unknown): Lang | null {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v) ? (v as Lang) : null;
}
