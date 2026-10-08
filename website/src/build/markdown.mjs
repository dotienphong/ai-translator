// Bộ chuyển Markdown nhỏ cho trang điều khoản và chính sách (docs/legal/*.md là nguồn duy nhất; sửa file đó là sửa cả
// app lẫn website). Cùng tập cú pháp với src/lib/markdown.ts của app: tiêu đề `#`–`###`, đoạn, danh sách `-` và `1.`,
// bảng, trích dẫn `>`, **in đậm**, `mã` và liên kết [chữ](https://…). Mọi chữ đều được escape; không có HTML thô.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|mailto:[^\s)]+)/;
const LINK = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/;
const HEADING = /^(#{1,3}) +(.+)$/;
const BULLET = /^- +(.*)$/;
const ORDERED = /^\d+\. +(.*)$/;
const QUOTE = /^> ?(.*)$/;
const TABLE_ROW = /^\|.*\|\s*$/;
const TABLE_RULE = /^\|[\s:|-]+\|\s*$/;

export function inline(source) {
  let out = "";
  for (const part of source.split(INLINE)) {
    if (part === "") continue;
    const link = LINK.exec(part);
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) out += `<strong>${esc(part.slice(2, -2))}</strong>`;
    else if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) out += `<code>${esc(part.slice(1, -1))}</code>`;
    else if (link) out += `<a href="${esc(link[2])}" rel="noopener">${esc(link[1])}</a>`;
    else out += esc(part);
  }
  return out;
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Trả về { html, headings } với headings = [{ level, text, id }] (dùng làm mục lục). */
export function renderMarkdown(source, { slug = (t) => t } = {}) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const at = (n) => lines[n] ?? "";
  const isTable = (n) => TABLE_ROW.test(at(n)) && TABLE_RULE.test(at(n + 1));
  const startsBlock = (n) => HEADING.test(at(n)) || BULLET.test(at(n)) || ORDERED.test(at(n)) || QUOTE.test(at(n)) || isTable(n);
  const out = [];
  const headings = [];
  const usedIds = new Set();
  let i = 0;
  while (i < lines.length) {
    const line = at(i);
    if (line.trim() === "") {
      i++;
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      const level = h[1].length;
      let id = slug(h[2].replace(/[*`]/g, ""));
      while (usedIds.has(id)) id += "-";
      usedIds.add(id);
      headings.push({ level, text: h[2].replace(/[*`]/g, ""), id });
      out.push(`<h${level} id="${esc(id)}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (isTable(i)) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && TABLE_ROW.test(at(i))) rows.push(cells(at(i++)));
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line);
      const re = ordered ? ORDERED : BULLET;
      const items = [];
      while (i < lines.length && re.test(at(i))) {
        let text = re.exec(at(i++))[1];
        while (i < lines.length && at(i).trim() !== "" && /^ {2,}\S/.test(at(i)) && !startsBlock(i)) text += " " + at(i++).trim();
        items.push(text);
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (QUOTE.test(line)) {
      const parts = [];
      while (i < lines.length && QUOTE.test(at(i))) parts.push(QUOTE.exec(at(i++))[1]);
      out.push(`<blockquote><p>${inline(parts.join(" "))}</p></blockquote>`);
      continue;
    }
    const para = [];
    while (i < lines.length && at(i).trim() !== "" && !startsBlock(i)) para.push(at(i++).trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return { html: out.join("\n"), headings };
}
