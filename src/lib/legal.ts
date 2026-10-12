// Văn bản pháp lý đóng gói trong app (docs/legal/*.md; spec 2026-10-06 legal-in-app). Vite đóng mỗi file thành một
// chunk riêng, chỉ tải khi người dùng mở văn bản. Theo mẫu của notices.ts.
import type { UiLanguage } from "../i18n";

export type LegalKind = "eula" | "privacy";

/** Kết quả của `import.meta.glob(…, { query: "?raw", import: "default" })`: đường dẫn → hàm tải văn bản. */
export type LegalLoaders = Record<string, () => Promise<string>>;

/** Văn bản đã tải, kèm ngôn ngữ của chính văn bản (có thể khác ngôn ngữ giao diện). */
export interface LegalText {
  text: string;
  lang: UiLanguage;
}

const docs = import.meta.glob<string>("/docs/legal/{eula,privacy}.{vi,en}.md", { query: "?raw", import: "default" });

/**
 * Hàm tải văn bản đúng loại, kèm ngôn ngữ của file tìm được: bản đúng ngôn ngữ giao diện; không có thì bản English (ja, zh,
 * ko chưa có bản pháp lý riêng, spec 2026-10-12 Q2); không có nữa thì bản tiếng Việt (bản gốc); không có thì null.
 */
export function pickLegal(
  loaders: LegalLoaders,
  kind: LegalKind,
  lang: UiLanguage,
): { load: () => Promise<string>; lang: UiLanguage } | null {
  for (const candidate of [lang, "en", "vi"] as const) {
    const found = Object.entries(loaders).find(([path]) => path.endsWith(`/${kind}.${candidate}.md`));
    if (found) return { load: found[1], lang: candidate };
  }
  return null;
}

/** Văn bản và ngôn ngữ của nó, hoặc null khi không có (hay file rỗng, hay tải lỗi). */
export async function loadLegal(kind: LegalKind, lang: UiLanguage, loaders: LegalLoaders = docs): Promise<LegalText | null> {
  const picked = pickLegal(loaders, kind, lang);
  if (!picked) return null;
  try {
    const text = await picked.load();
    return text.trim() === "" ? null : { text, lang: picked.lang };
  } catch {
    return null;
  }
}
