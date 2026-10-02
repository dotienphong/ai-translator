import { describe, expect, it } from "vitest";

// Không có DOM trong vitest nên không đo được bố cục; test này giữ một dòng CSS đã gây lỗi thật: `.overlay` cao
// `100vh` mà cộng thêm `padding` (content-box mặc định) thì khung cao hơn cửa sổ, đáy bị cắt và dòng cuối mất nửa chữ.
// Đọc file bằng `node:fs` (dự án không cài kiểu của Node), vì vitest trả chuỗi rỗng cho `import "…css?raw"`.
type Fs = { readFileSync(path: URL, encoding: "utf8"): string };

describe("overlay.css", () => {
  it("khung phụ đề cao đúng bằng cửa sổ, đệm tính vào trong (border-box)", async () => {
    const fs = (await import("node:fs" as string)) as Fs;
    const css = fs.readFileSync(new URL("./overlay.css", import.meta.url), "utf8");
    const rule = /\.overlay\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("height: 100vh");
    expect(rule).toMatch(/box-sizing:\s*border-box/);
  });
});
