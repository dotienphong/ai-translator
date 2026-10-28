import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LiveLine, SpeakerVoice } from "../../lib/ipc";
import { LiveLineView, type LiveLineViewProps } from "./LiveLineView";

const live = (patch: Partial<LiveLine> = {}): LiveLine => ({
  id: 7,
  extends: null,
  src_lang: "en",
  src_stable: "Can you share",
  src_tail: " the budget",
  tgt_stable: "Bạn có thể gửi",
  tgt_tail: " ngân sách",
  tgt_src_units: 3,
  speaker: null,
  ...patch,
});

const html = (props: LiveLineViewProps) => renderToStaticMarkup(createElement(LiveLineView, props));

describe("LiveLineView (spec 2026-10-10 §6.1)", () => {
  it("câu gốc và bản dịch đều hai tầng: phần tạm trong span.tail", () => {
    expect(html({ live: live(), showSource: true })).toBe(
      '<div class="line live"><div class="source">Can you share<span class="tail"> the budget</span></div>' +
        '<div class="main">Bạn có thể gửi<span class="tail"> ngân sách</span></div></div>',
    );
    expect(html({ live: live(), showSource: false })).toBe(
      '<div class="line live"><div class="main">Bạn có thể gửi<span class="tail"> ngân sách</span></div></div>',
    );
  });

  it("chưa có phần ổn định thì cả dòng là phần tạm; không có phần tạm thì không có span", () => {
    expect(html({ live: live({ tgt_stable: "", tgt_tail: "Bạn" }), showSource: false })).toBe(
      '<div class="line live"><div class="main"><span class="tail">Bạn</span></div></div>',
    );
    expect(html({ live: live({ tgt_tail: "" }), showSource: false })).toBe(
      '<div class="line live"><div class="main">Bạn có thể gửi</div></div>',
    );
  });

  it("chưa có chữ dịch: dòng chính là câu gốc hai tầng, không có dòng câu gốc nhỏ", () => {
    expect(html({ live: live({ tgt_stable: "", tgt_tail: "" }), showSource: true })).toBe(
      '<div class="line live"><div class="main">Can you share<span class="tail"> the budget</span></div></div>',
    );
  });

  // Như `OverlayLine` (kế hoạch 01 Task 8): mỗi `subtitle://live` chỉ thay đối tượng của đúng một dòng.
  it("là component memo so nông", () => {
    const m = LiveLineView as unknown as { $$typeof: symbol; compare: unknown };
    expect(m.$$typeof).toBe(Symbol.for("react.memo"));
    expect(m.compare).toBeNull();
  });

  // QĐ 5 của kế hoạch 03 phân biệt người nói: dòng nối tiếp mang giọng của câu nó nối tiếp, vẽ như phụ đề; lượt mới thì như cũ.
  it("dòng nối tiếp mang vạch và tên của câu nó nối tiếp", () => {
    const voice: SpeakerVoice = { id: 1, label: "Lan", color: 0, source: "name", room: false, mergedInto: null };
    expect(html({ live: live({ extends: 6, speaker: 1 }), showSource: false, voice, turnStart: true })).toBe(
      '<div class="line live spk" style="--spk:var(--spk-0)"><div class="spk-label">Lan</div><div class="spk-body">' +
        '<div class="main">Bạn có thể gửi<span class="tail"> ngân sách</span></div></div></div>',
    );
    expect(html({ live: live(), showSource: false })).toBe(
      '<div class="line live"><div class="main">Bạn có thể gửi<span class="tail"> ngân sách</span></div></div>',
    );
  });
});
