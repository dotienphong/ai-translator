// Trang pháp lý sinh từ docs/legal/*.md (nguồn duy nhất: app đóng gói chính các file đó). Sửa văn bản ở đó rồi dựng lại.
import { readFileSync } from "node:fs";
import { renderMarkdown, slugify, esc } from "../build/markdown.mjs";
import { pageHero, docLayout, callout } from "../build/components.mjs";

const read = (name) => readFileSync(new URL(`../../../docs/legal/${name}`, import.meta.url), "utf8");

export function legalPage({ id, lang, path, file, title, description, crumbs, heroLead, inAppNote, versionLabel, llm }) {
  const source = read(file);
  const { html, headings } = renderMarkdown(source.replace(/^# .*\n+/, ""), { slug: slugify });
  const versionMatch = /\*\*(Phiên bản|Version) ([0-9.]+)[^*]*\*\*/.exec(source);
  const toc = headings.filter((h) => h.level === 2).map((h) => ({ level: 2, id: h.id, text: h.text }));
  return {
    id,
    lang,
    path,
    title,
    description,
    breadcrumbs: crumbs,
    modified: "2026-10-08",
    published: "2026-10-07",
    type: "article",
    schemaType: "WebPage",
    llm,
    full: false,
    body: () => `
${pageHero({ crumbs, title: source.match(/^# (.*)$/m)[1], lead: heroLead, meta: versionMatch ? `<span>${esc(versionLabel)} ${esc(versionMatch[2])}</span>` : "" })}
<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: lang === "vi" ? "Mục lục" : "Contents",
  body: `${callout({ title: inAppNote.title, text: inAppNote.text })}<div class="legal">${html}</div>`,
})}
</div></section>`,
  };
}
