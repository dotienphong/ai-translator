import { describe, expect, it } from "vitest";
import { createLinkBannerStore } from "./linkBanner";

// Đọc file bằng `node:fs` nạp động (dự án không cài kiểu của Node), như overlay.css.test.ts.
type Fs = { readFileSync(path: URL, encoding: "utf8"): string };
const readSource = async (url: URL) => ((await import("node:fs" as string)) as Fs).readFileSync(url, "utf8");

// "Để sau" của banner liên kết (spec 2026-11-05-dang-nhap-google §6.3): ẩn trong phiên làm việc, KHÔNG lưu cài đặt.

describe("link banner store", () => {
  it("lúc đầu chưa ẩn; Để sau thì ẩn", () => {
    const store = createLinkBannerStore();
    expect(store.getState().dismissed).toBe(false);
    store.getState().dismiss();
    expect(store.getState().dismissed).toBe(true);
    // Gọi lại không sao.
    store.getState().dismiss();
    expect(store.getState().dismissed).toBe(true);
  });

  it("chỉ nằm trong bộ nhớ: phiên làm việc mới (store mới, như mở lại app) lại hiện banner", () => {
    const first = createLinkBannerStore();
    first.getState().dismiss();
    const second = createLinkBannerStore();
    expect(second.getState().dismissed).toBe(false);
  });

  it("không có chỗ nào lưu: không nối IPC, không đụng cài đặt hay localStorage", async () => {
    const source = await readSource(new URL("./linkBanner.ts", import.meta.url));
    for (const banned of ["ipc", "invoke", "update_settings", "localStorage", "sessionStorage", "indexedDB"]) {
      expect(source, banned).not.toContain(banned);
    }
  });
});
