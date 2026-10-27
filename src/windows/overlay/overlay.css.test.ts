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

  // Spec 2026-10-10 §6.1: phần tạm của dòng đang nói nhạt đúng như phụ đề tạm (0,65); phần ổn định và cả dòng giữ độ đậm
  // bình thường.
  it("phần tạm của dòng đang nói nhạt như phụ đề tạm, cả dòng thì không", async () => {
    const fs = (await import("node:fs" as string)) as Fs;
    const css = fs.readFileSync(new URL("./overlay.css", import.meta.url), "utf8");
    const tail = /\.overlay\s+\.live\s+\.tail\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(tail).toMatch(/opacity:\s*0\.65/);
    const provisional = /\.overlay\s+\.provisional,\s*\.overlay\s+\.pending\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(provisional).toMatch(/opacity:\s*0\.65/);
    expect(css).not.toMatch(/\.overlay\s+\.live\s*\{[^}]*opacity/);
  });

  // Các câu dính sát nhau thì khó đọc khi họp: giữa hai câu phải có khoảng cách theo cỡ chữ (em), và câu gốc tách khỏi
  // bản dịch bên dưới.
  it("các câu cách nhau một khoảng theo cỡ chữ, câu gốc tách khỏi bản dịch", async () => {
    const fs = (await import("node:fs" as string)) as Fs;
    const css = fs.readFileSync(new URL("./overlay.css", import.meta.url), "utf8");
    const gap = /\.overlay\s+\.line\s*\+\s*\.line\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(gap).toMatch(/margin-top:\s*[\d.]+em/);
    const source = /\.overlay\s+\.source\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(source).toMatch(/margin-bottom:\s*[\d.]+em/);
  });

  // Spec 2026-10-26-phan-biet-nguoi-noi §8.1: đúng bảng 8 màu của spec cho nền tối, tên 0,56 em đậm, vạch 0,16 em; câu không giọng
  // trong phiên có giọng chừa cùng lề (QĐ 7 của kế hoạch 03).
  it("người nói: bảng 8 màu của spec, tên 0,56 em đậm, vạch 0,16 em, cùng lề", async () => {
    const fs = (await import("node:fs" as string)) as Fs;
    const css = fs.readFileSync(new URL("./overlay.css", import.meta.url), "utf8");
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const colors = [...root.matchAll(/--spk-\d:\s*(#[0-9a-f]{6})/g)].map((m) => m[1]);
    expect(colors).toEqual(["#7cc4ff", "#ffb86b", "#9be38f", "#f59fd5", "#c7a6ff", "#ffe27a", "#6fe0d2", "#ff8f8f"]);
    const label = /\.overlay\s+\.spk-label\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(label).toMatch(/font-size:\s*0\.56em/);
    expect(label).toMatch(/font-weight:\s*700/);
    // Dòng `.sourceOnly`, `.failed`, `.dropped` nghiêng cả dòng; tên người nói không nghiêng theo (nghiệm thu bằng ảnh, Task 21).
    expect(label).toMatch(/font-style:\s*normal/);
    const body = /\.overlay\s+\.spk-body\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(body).toMatch(/border-left:\s*0\.16em solid var\(--spk\)/);
    expect(body).toMatch(/padding-left:\s*0\.45em/);
    const gutter = /\.overlay\s+\.lines\.has-speakers\s*>\s*\.line:not\(\.spk\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(gutter).toMatch(/padding-left:\s*0\.61em/);
  });
});
