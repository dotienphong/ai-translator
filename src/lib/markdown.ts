// Bộ phân tích Markdown nhỏ cho EULA và chính sách quyền riêng tư (docs/legal/*.md; spec 2026-10-06 legal-in-app).
// Chỉ hỗ trợ tập cú pháp hai văn bản đó dùng: tiêu đề `#`–`###`, đoạn, danh sách `-` và `1.`, bảng, trích dẫn `>`,
// **in đậm** và `mã`. Không có HTML thô, liên kết hay ảnh: mọi thứ khác là chữ thường.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "code"; text: string };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "quote"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/;
const HEADING = /^(#{1,3}) +(.+)$/;
const BULLET = /^- +(.*)$/;
const ORDERED = /^\d+\. +(.*)$/;
const QUOTE = /^> ?(.*)$/;
const TABLE_ROW = /^\|.*\|\s*$/;
const TABLE_RULE = /^\|[\s:|-]+\|\s*$/;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  for (const part of source.split(INLINE)) {
    if (part === "") continue;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      out.push({ type: "strong", text: part.slice(2, -2) });
    } else if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      out.push({ type: "code", text: part.slice(1, -1) });
    } else {
      out.push({ type: "text", text: part });
    }
  }
  return out;
}

function cells(line: string): Inline[][] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => parseInline(cell.trim()));
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const at = (n: number) => lines[n] ?? "";
  const isTable = (n: number) => TABLE_ROW.test(at(n)) && TABLE_RULE.test(at(n + 1));
  const startsBlock = (n: number) =>
    HEADING.test(at(n)) || BULLET.test(at(n)) || ORDERED.test(at(n)) || QUOTE.test(at(n)) || isTable(n);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = at(i);
    if (line.trim() === "") {
      i++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: (heading[1] ?? "#").length as 1 | 2 | 3, content: parseInline((heading[2] ?? "").trim()) });
      i++;
      continue;
    }
    if (isTable(i)) {
      const header = cells(line);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && TABLE_ROW.test(at(i))) {
        rows.push(cells(at(i)));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }
    if (QUOTE.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && QUOTE.test(at(i))) {
        parts.push((QUOTE.exec(at(i))?.[1] ?? "").trim());
        i++;
      }
      blocks.push({ type: "quote", content: parseInline(parts.join(" ").trim()) });
      continue;
    }
    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      const marker = ordered ? ORDERED : BULLET;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = marker.exec(at(i));
        if (m) {
          items.push(parseInline((m[1] ?? "").trim()));
          i++;
        } else if (/^ {2,}\S/.test(at(i)) && items.length > 0) {
          const last = items.pop() ?? [];
          items.push([...last, { type: "text", text: " " }, ...parseInline(at(i).trim())]);
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const parts: string[] = [line.trim()];
    i++;
    while (i < lines.length && at(i).trim() !== "" && !startsBlock(i)) {
      parts.push(at(i).trim());
      i++;
    }
    blocks.push({ type: "paragraph", content: parseInline(parts.join(" ")) });
  }
  return blocks;
}
