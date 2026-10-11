import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Subtitle } from "../../lib/ipc";
import { OverlayLine, type OverlayLineProps } from "./OverlayLine";

const sub = (patch: Partial<Subtitle>): Subtitle => ({
  id: 1,
  start_ms: 0,
  end_ms: 1000,
  src_lang: "en",
  src_text: "Hello",
  tgt_text: "",
  status: "done",
  provisional: false,
  replaces: [],
  ...patch,
});

const html = (props: OverlayLineProps) => renderToStaticMarkup(createElement(OverlayLine, props));

describe("OverlayLine", () => {
  it("vẽ đúng như thanh phụ đề trước khi tách component", () => {
    expect(html({ line: sub({ tgt_text: "Xin chào" }), showSource: true, uiLanguage: "vi" })).toBe(
      '<div class="line translated"><div class="source">Hello</div><div class="main">Xin chào</div></div>',
    );
    expect(
      html({ line: sub({ status: "translating", tgt_text: "Xin", provisional: true }), showSource: false, uiLanguage: "vi" }),
    ).toBe('<div class="line translating provisional"><div class="main">Xin</div></div>');
    expect(html({ line: sub({ status: "asr_done" }), showSource: true, uiLanguage: "vi" })).toBe(
      '<div class="line pending"><div class="main">Hello</div></div>',
    );
    expect(html({ line: sub({ status: "failed" }), showSource: true, uiLanguage: "en" })).toBe(
      '<div class="line failed"><div class="main">Hello<span class="tag">not translated</span></div></div>',
    );
    expect(html({ line: sub({ status: "dropped", src_text: "" }), showSource: true, uiLanguage: "vi" })).toBe(
      '<div class="line dropped"><div class="main">[bỏ qua đoạn]</div></div>',
    );
  });

  // React bỏ qua việc vẽ lại một component memo khi mọi prop bằng nhau theo `Object.is` (so nông, không có hàm so sánh
  // riêng): dòng không đổi giữ nguyên đối tượng phụ đề (test của store), nên không vẽ lại.
  it("là component memo so nông", () => {
    const memo = OverlayLine as unknown as { $$typeof: symbol; compare: unknown };
    expect(memo.$$typeof).toBe(Symbol.for("react.memo"));
    expect(memo.compare).toBeNull();
  });
});
