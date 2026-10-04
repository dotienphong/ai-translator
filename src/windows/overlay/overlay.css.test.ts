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

  // Người dùng không thấy được nút ✕ bấm được, hay mép nào kéo được, nếu rê chuột vào mà không có gì đổi (§4.4): nút phải
  // đổi rõ (nền đỏ đậm, phóng to, viền sáng), và mép phải sáng lên. Con trỏ ở mép do phía Rust đặt (overlay/macos.rs).
  it("nút ✕ đổi rõ khi rê chuột vào, và mép sáng lên khi rê chuột vào", async () => {
    const fs = (await import("node:fs" as string)) as Fs;
    const css = fs.readFileSync(new URL("./overlay.css", import.meta.url), "utf8");
    const hide = /\.overlay\s+\.hide:hover\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(hide).toMatch(/transform:\s*scale\(/);
    expect(hide).toMatch(/box-shadow:/);
    const edge = /\.overlay\s+\.edge:hover\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(edge).toMatch(/background:/);
  });
});
