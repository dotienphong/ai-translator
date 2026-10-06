// Văn bản pháp lý đóng gói trong app (docs/legal/*.md; spec 2026-10-06 legal-in-app). Vite đóng mỗi file thành một
// chunk riêng, chỉ tải khi người dùng mở văn bản. Theo mẫu của notices.ts.
import type { UiLanguage } from "../i18n";

export type LegalKind = "eula" | "privacy";

/** Kết quả của `import.meta.glob(…, { query: "?raw", import: "default" })`: đường dẫn → hàm tải văn bản. */
export type LegalLoaders = Record<string, () => Promise<string>>;

const docs = import.meta.glob<string>("/docs/legal/{eula,privacy}.{vi,en}.md", { query: "?raw", import: "default" });

/** Hàm tải văn bản đúng loại và ngôn ngữ; thiếu bản ngôn ngữ đó thì dùng tiếng Việt (bản gốc); không có thì null. */
export function pickLegal(loaders: LegalLoaders, kind: LegalKind, lang: UiLanguage): (() => Promise<string>) | null {
  const find = (l: string) => Object.entries(loaders).find(([path]) => path.endsWith(`/${kind}.${l}.md`))?.[1];
  return find(lang) ?? find("vi") ?? null;
}

/** Văn bản, hoặc null khi không có (hay file rỗng, hay tải lỗi). */
export async function loadLegal(kind: LegalKind, lang: UiLanguage, loaders: LegalLoaders = docs): Promise<string | null> {
  const load = pickLegal(loaders, kind, lang);
  if (!load) return null;
  try {
    const text = await load();
    return text.trim() === "" ? null : text;
  } catch {
    return null;
  }
}
