import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { en, ja, ko, vi, zh } from "../../../i18n";
import { splitTail } from "../../../lib/subtitleView";
import { SubtitlePreview, type SubtitlePreviewProps } from "./SubtitlePreview";

const props = (patch: Partial<SubtitlePreviewProps> = {}): SubtitlePreviewProps => ({
  uiLanguage: "vi",
  fontSize: 20,
  opacity: 0.6,
  textColor: "white",
  background: "black",
  showSource: true,
  live: false,
  ...patch,
});

const html = (p: SubtitlePreviewProps) => renderToStaticMarkup(createElement(SubtitlePreview, p));

describe("SubtitlePreview", () => {
  it("chế độ thường: câu mẫu như trước, không có phần tạm", () => {
    const markup = html(props());
    expect(markup).toContain(
      '<div class="src">Can you share the budget estimate by Friday?</div>' +
        '<div class="main">Bạn có thể gửi bản dự toán ngân sách trước thứ Sáu không?</div>',
    );
    expect(markup).not.toContain('class="tail"');
    expect(markup).toContain('role="img" aria-label="Xem trước"');
  });

  it("đang dịch trong lúc người nói chưa dừng: mẫu hai tầng ở câu gốc và bản dịch (spec 2026-10-10 §6.3)", () => {
    expect(html(props({ live: true }))).toContain(
      '<div class="src">Can you share the budget <span class="tail">estimate by</span></div>' +
        '<div class="main">Bạn có thể gửi <span class="tail">bản dự toán ngân sách</span></div>',
    );
    expect(html(props({ live: true, uiLanguage: "en", showSource: false }))).toContain(
      '<div class="main">By Friday, can you <span class="tail">share the budget</span></div>',
    );
    expect(html(props({ live: true, showSource: false }))).not.toContain('class="src"');
  });

  it("cỡ chữ tối đa 34 px, màu chữ và nền theo cài đặt", () => {
    const markup = html(props({ fontSize: 48, textColor: "yellow", background: "navy", opacity: 0.8 }));
    expect(markup).toContain("font-size:34px");
    expect(markup).toContain("color:#ffd60a");
    expect(markup).toContain("background:rgba(12, 27, 58, 0.8)");
  });

  it("câu mẫu hai tầng của cả năm ngôn ngữ: phần tạm là đuôi thật của cả câu", () => {
    for (const dict of [en, vi, ja, zh, ko]) {
      const pairs = [
        [dict["settings.subtitles.preview.live.source"], dict["settings.subtitles.preview.live.sourceTail"]],
        [dict["settings.subtitles.preview.live.text"], dict["settings.subtitles.preview.live.textTail"]],
      ];
      for (const [full, tail] of pairs) {
        const split = splitTail(full ?? "", tail ?? "");
        expect(split.tail, full).toBe(tail);
        expect(split.stable.trim(), full).not.toBe("");
      }
    }
  });

  it("phần tạm nhạt 0,65 như trên thanh phụ đề; ghi chú màu cảnh báo", async () => {
    type Fs = { readFileSync(path: URL, encoding: "utf8"): string };
    const fs = (await import("node:fs" as string)) as Fs;
    const css = fs.readFileSync(new URL("../../../styles/main.css", import.meta.url), "utf8");
    expect(/\.subtitle-preview\s+\.tail\s*\{([^}]*)\}/.exec(css)?.[1] ?? "").toMatch(/opacity:\s*0\.65/);
    expect(/\.field-text\s+\.field-note\s*\{([^}]*)\}/.exec(css)?.[1] ?? "").toMatch(/color:\s*var\(--warning\)/);
  });
});
