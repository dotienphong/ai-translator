import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpeakerAsk } from "./SpeakerAsk";

// Spec 2026-10-26-phan-biet-nguoi-noi §6.7, §8.1: dòng mời cấp quyền: chữ nhỏ, nút "Mở Cài đặt" và ✕ (ẩn tới hết phiên); không phải
// vùng kéo thanh.
describe("SpeakerAsk", () => {
  it("có chữ mời, nút Mở Cài đặt và nút ✕ có nhãn cho trình đọc màn hình", () => {
    const markup = renderToStaticMarkup(
      createElement(SpeakerAsk, { uiLanguage: "vi", onOpen: () => {}, onDismiss: () => {} }),
    );
    expect(markup).toContain('<div class="ask" role="status" data-tauri-drag-region="false">');
    expect(markup).toContain('<span class="ask-text">Cho phép quyền Trợ năng để hiện tên người nói</span>');
    expect(markup).toContain('class="ask-open" data-tauri-drag-region="false">Mở cài đặt</button>');
    expect(markup).toContain('aria-label="Ẩn tới hết phiên"');
  });
});
