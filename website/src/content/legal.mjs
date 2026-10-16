// Trang pháp lý sinh từ docs/legal/*.md (nguồn duy nhất: app đóng gói chính các file đó). Sửa văn bản ở đó rồi dựng lại.
import { readFileSync } from "node:fs";
import { renderMarkdown, slugify, esc } from "../build/markdown.mjs";
import { pageHero, docLayout, callout } from "../build/components.mjs";

const read = (name) => readFileSync(new URL(`../../../docs/legal/${name}`, import.meta.url), "utf8");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Dòng đậm đầu mỗi văn bản (một regex chung cho cả hai ngôn ngữ, neo đầu dòng để không nhận nhầm một chuỗi giống ở giữa văn bản):
//   vi: **Phiên bản 1.3, hiệu lực từ 14/10/2026.**
//   en: **Version 1.3, effective 14 October 2026. If this English translation …**
// Nhóm: 1 = cả dòng phiên bản (không có dấu chấm cuối), 2 = số phiên bản, 3-5 = ngày/tháng/năm (vi), 6-8 = ngày/tên tháng/năm (en).
const LEGAL_HEADER = /^\*\*((?:Phiên bản|Version) (\d+(?:\.\d+)*), (?:hiệu lực từ (\d{2})\/(\d{2})\/(\d{4})|effective (\d{1,2}) ([A-Z][a-z]+) (\d{4})))\./m;

/**
 * Đọc dòng phiên bản ở đầu một văn bản pháp lý. Trả { label, version, iso }: label là dòng bỏ chấm cuối ("Phiên bản 1.3, hiệu
 * lực từ 14/10/2026"), iso là ngày hiệu lực (YYYY-MM-DD). Sai khuôn thì ném lỗi nêu tên file, để dựng site hỏng ngay thay vì
 * ghi sai phiên bản hay ngày lên trang.
 */
export function parseLegalHeader(source, file = "văn bản") {
  const fail = (why) => {
    throw new Error(
      `docs/legal/${file}: dòng phiên bản ở đầu văn bản ${why}; cần "**Phiên bản X.Y, hiệu lực từ dd/mm/yyyy.**" hoặc "**Version X.Y, effective d Month yyyy. …**" ở đầu một dòng`,
    );
  };
  const m = LEGAL_HEADER.exec(source);
  if (!m) fail("không đúng khuôn");
  const [, label, version, dd, mm, yyyy, d, monthName, y] = m;
  const year = Number(yyyy ?? y);
  const month = mm ? Number(mm) : MONTHS.indexOf(monthName) + 1;
  const day = Number(dd ?? d);
  if (!month) fail(`có tên tháng không hợp lệ "${monthName}"`);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) fail(`ghi một ngày không có thật ("${label}")`);
  return { label, version, iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}

/** Dòng phiên bản và ngày hiệu lực ở đầu văn bản, bỏ chấm cuối ("Phiên bản 1.3, hiệu lực từ 14/10/2026"), đã qua esc() để chèn thẳng vào HTML: Về chúng tôi và Dữ liệu và bảo mật lấy từ đây thay vì ghi tay. */
export function legalVersionLine(file) {
  return esc(parseLegalHeader(read(file), file).label);
}

/** `modified` của trang pháp lý là ngày hiệu lực trong dòng phiên bản (sitemap lastmod, dateModified, dòng "Cập nhật"), nên sửa văn bản thì ngày này đổi theo, không phải nhớ sửa tay. */
export function legalPage({ id, lang, path, file, title, description, crumbs, heroLead, inAppNote, versionLabel, llm }) {
  const source = read(file);
  const { html, headings } = renderMarkdown(source.replace(/^# .*\n+/, ""), { slug: slugify });
  const header = parseLegalHeader(source, file);
  const toc = headings.filter((h) => h.level === 2).map((h) => ({ level: 2, id: h.id, text: h.text }));
  return {
    id,
    lang,
    path,
    title,
    description,
    breadcrumbs: crumbs,
    modified: header.iso,
    published: "2026-10-07",
    type: "article",
    schemaType: "WebPage",
    llm,
    full: false,
    body: () => `
${pageHero({ crumbs, title: source.match(/^# (.*)$/m)[1], lead: heroLead, meta: `<span>${esc(versionLabel)} ${esc(header.version)}</span>` })}
<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: lang === "vi" ? "Mục lục" : "Contents",
  body: `${callout({ title: inAppNote.title, text: inAppNote.text })}<div class="legal">${html}</div>`,
})}
</div></section>`,
  };
}
