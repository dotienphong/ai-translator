import { describe, expect, it } from "vitest";
import { type Block, parseInline, parseMarkdown } from "./markdown";

const t = (text: string) => ({ type: "text" as const, text });

describe("parseInline", () => {
  it("tách chữ thường, in đậm và mã", () => {
    expect(parseInline("a **b** c `d` e")).toEqual([
      t("a "),
      { type: "strong", text: "b" },
      t(" c "),
      { type: "code", text: "d" },
      t(" e"),
    ]);
  });
  it("dấu * hay ` lẻ loi vẫn là chữ thường", () => {
    expect(parseInline("2 * 3 và `x")).toEqual([t("2 * 3 và `x")]);
  });
});

describe("parseMarkdown", () => {
  it("tiêu đề ba cấp, đoạn nhiều dòng nối bằng dấu cách", () => {
    expect(parseMarkdown("# A\n\n## B\n### C\n\nmột\nhai\n")).toEqual([
      { type: "heading", level: 1, content: [t("A")] },
      { type: "heading", level: 2, content: [t("B")] },
      { type: "heading", level: 3, content: [t("C")] },
      { type: "paragraph", content: [t("một hai")] },
    ]);
  });

  it("danh sách gạch đầu dòng và danh sách đánh số, có dòng nối của một mục", () => {
    expect(parseMarkdown("- x\n- y\n  tiếp\n\n1. một\n2. hai")).toEqual([
      { type: "list", ordered: false, items: [[t("x")], [t("y"), t(" "), t("tiếp")]] },
      { type: "list", ordered: true, items: [[t("một")], [t("hai")]] },
    ]);
  });

  it("trích dẫn gộp các dòng liên tiếp", () => {
    expect(parseMarkdown("> một\n> hai")).toEqual([{ type: "quote", content: [t("một hai")] }]);
  });

  it("bảng: dòng tiêu đề, dòng kẻ, các dòng dữ liệu; ô có in đậm", () => {
    const blocks = parseMarkdown("| Gói | Giá |\n|---|---|\n| Free | **0 đ** |\n| Pro | 50 |\n\nsau bảng");
    expect(blocks).toEqual([
      {
        type: "table",
        header: [[t("Gói")], [t("Giá")]],
        rows: [
          [[t("Free")], [{ type: "strong", text: "0 đ" }]],
          [[t("Pro")], [t("50")]],
        ],
      },
      { type: "paragraph", content: [t("sau bảng")] },
    ]);
  });

  it("dòng có dấu | nhưng không có dòng kẻ ngay sau thì là đoạn thường, không treo vòng lặp", () => {
    expect(parseMarkdown("| lẻ loi |")).toEqual([{ type: "paragraph", content: [t("| lẻ loi |")] }]);
  });

  it("chấp nhận xuống dòng kiểu Windows và văn bản rỗng", () => {
    expect(parseMarkdown("# A\r\n\r\nb\r\n")).toHaveLength(2);
    expect(parseMarkdown("")).toEqual([]);
  });
});

// Đọc file bằng `node:fs` nạp động (dự án không cài kiểu của Node), như overlay.css.test.ts.
type Fs = { readFileSync(path: URL, encoding: "utf8"): string };
const doc = async (name: string) => {
  const fs = (await import("node:fs" as string)) as Fs;
  return fs.readFileSync(new URL(`../../docs/legal/${name}`, import.meta.url), "utf8");
};

describe("bốn văn bản pháp lý thật", () => {
  const files: [string, number][] = [
    ["eula.vi.md", 15],
    ["eula.en.md", 15],
    ["privacy.vi.md", 10],
    ["privacy.en.md", 10],
  ];
  for (const [name, sections] of files) {
    it(`${name}: đủ mục, có bảng, không còn dấu Markdown thô, không còn dấu vết bản nháp`, async () => {
      const text = await doc(name);
      const blocks: Block[] = parseMarkdown(text);
      expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
      expect(blocks.filter((b) => b.type === "heading" && b.level === 2).length).toBeGreaterThanOrEqual(sections);
      expect(blocks.some((b) => b.type === "table")).toBe(true);
      const plain = JSON.stringify(blocks);
      expect(plain).not.toContain("**");
      expect(plain).not.toMatch(/"text":"#/);
      expect(text).not.toMatch(/BẢN NHÁP|DRAFT|\[ngày phát hành|\[date of|\[Địa chỉ|\[Contact|\[7\]/);
    });
  }
});
