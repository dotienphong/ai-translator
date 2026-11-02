import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListenControls, type ListenControlsProps, listenDisabledReason } from "./ListenControls";

// "Nghe dịch" trên thanh phụ đề (spec 2026-11-02-nghe-dich-truc-tiep §8): nút bật/tắt, thanh mức tiếng họp, "còn N câu", Bỏ qua, lỗi.

const base: ListenControlsProps = {
  uiLanguage: "vi",
  supported: true,
  active: false,
  level: 10,
  pending: 0,
  error: null,
  unresolved: false,
  disabledReason: null,
  onToggle: () => {},
  onLevel: () => {},
  onSkip: () => {},
  onDismissError: () => {},
};

const render = (over: Partial<ListenControlsProps> = {}) =>
  renderToStaticMarkup(createElement(ListenControls, { ...base, ...over }));

describe("ListenControls", () => {
  it("không vẽ gì khi nền tảng không hỗ trợ", () => {
    expect(render({ supported: false })).toBe("");
  });

  it("tắt: có nút Nghe dịch chưa bấm, không có thanh mức", () => {
    const html = render();
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Nghe dịch");
    expect(html).not.toContain('type="range"');
  });

  it("không phải vùng kéo thanh", () => {
    expect(render()).toContain('data-tauri-drag-region="false"');
  });

  it("bật: nút đang bấm, có thanh mức 0–100 với giá trị hiện tại", () => {
    const html = render({ active: true, level: 35 });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('type="range"');
    expect(html).toContain('min="10"');
    expect(html).toContain('max="100"');
    expect(html).toContain('value="35"');
  });

  it("chỉ hiện 'còn N câu' và Bỏ qua khi có câu chờ", () => {
    expect(render({ active: true, pending: 0 })).not.toContain("listen-skip");
    const html = render({ active: true, pending: 3 });
    expect(html).toContain("còn 3 câu");
    expect(html).toContain("listen-skip");
  });

  it("mờ kèm lý do khi chưa bật mà không dùng được", () => {
    for (const [reason, text] of [
      ["noTts", "chưa cài giọng đọc"],
      ["unsupportedLang", "chỉ có tiếng Việt và tiếng Anh"],
      ["micOnly", "chỉ thu micro"],
    ] as const) {
      const html = render({ disabledReason: reason });
      expect(html).toContain("disabled");
      expect(html).toContain(text);
    }
  });

  it("đang bật thì vẫn tắt được dù lý do mờ vừa xuất hiện", () => {
    const html = render({ active: true, disabledReason: "noTts" });
    expect(html).not.toMatch(/listen-toggle[^>]*disabled/);
  });

  it("báo lỗi có role=alert và nút đóng", () => {
    const html = render({ error: "listenFailed" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("listen-error");
    expect(html).toContain("listen-dismiss");
  });

  it("ghi chú chưa phân biệt được lời của người dùng", () => {
    expect(render({ active: true, unresolved: true })).toContain("listen-note");
    expect(render({ active: true, unresolved: false })).not.toContain("listen-note");
  });

  it("5 ngôn ngữ đều có chữ nút", () => {
    for (const lang of ["en", "vi", "ja", "zh", "ko"] as const) {
      expect(render({ uiLanguage: lang }).length).toBeGreaterThan(50);
    }
  });
});

describe("listenDisabledReason", () => {
  const ok = { ttsAvailable: true, targetLanguage: "vi", captureMode: "playback" } as const;
  it("dùng được thì không có lý do", () => {
    expect(listenDisabledReason(ok)).toBeNull();
    expect(listenDisabledReason({ ...ok, targetLanguage: "en", captureMode: "both" })).toBeNull();
  });
  it("giọng đọc chưa sẵn sàng", () => {
    expect(listenDisabledReason({ ...ok, ttsAvailable: false })).toBe("noTts");
  });
  it("ngôn ngữ đích không có giọng", () => {
    expect(listenDisabledReason({ ...ok, targetLanguage: "ja" })).toBe("unsupportedLang");
  });
  it("chỉ thu micro", () => {
    expect(listenDisabledReason({ ...ok, captureMode: "mic" })).toBe("micOnly");
  });
});
