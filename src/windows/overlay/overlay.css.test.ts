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

  // Thanh giữ mọi câu và cuộn được (§4.4). `.overlay` căn đáy bằng `justify-content: flex-end` thì phần tràn lên trên không
  // cuộn tới được, nên căn đáy làm trong vùng cuộn (`margin-top: auto` ở phần tử đầu), còn vùng cuộn phải tự cuộn dọc.
  it("vùng chữ cuộn dọc được và vẫn căn đáy khi ít câu", async () => {
    const fs = (await import("node:fs" as string)) as Fs;
    const css = fs.readFileSync(new URL("./overlay.css", import.meta.url), "utf8");
    const overlay = /\.overlay\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(overlay).not.toMatch(/justify-content:\s*flex-end/);
    const lines = /\.overlay\s+\.lines\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(lines).toMatch(/overflow-y:\s*auto/);
    expect(lines).toMatch(/min-height:\s*0/);
    expect(css).toMatch(/\.overlay\s+\.lines\s*>\s*:first-child\s*\{[^}]*margin-top:\s*auto/);
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
