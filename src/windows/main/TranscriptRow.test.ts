import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SpeakerVoice, Subtitle } from "../../lib/ipc";
import { TranscriptRow, type TranscriptRowProps } from "./TranscriptRow";

const sub = (patch: Partial<Subtitle> = {}): Subtitle => ({
  id: 7,
  start_ms: 0,
  end_ms: 900,
  src_lang: "en",
  src_text: "Hello",
  tgt_text: "Xin chào",
  status: "done",
  provisional: false,
  replaces: [],
  speaker: null,
  ...patch,
});

const voice: SpeakerVoice = { id: 3, label: "Người 3", color: 2, source: "voice", room: false, mergedInto: null };

const html = (patch: Partial<TranscriptRowProps> = {}) =>
  renderToStaticMarkup(
    createElement(TranscriptRow, {
      line: sub(),
      lang: "vi",
      time: "10:28:03",
      voice: null,
      turnStart: false,
      menu: null,
      ...patch,
    }),
  );

// Spec 2026-10-26-phan-biet-nguoi-noi §8.2: nhãn dạng chip có chấm màu ở câu đầu mỗi lượt, vạch màu bên trái; Lịch sử chỉ đọc.
describe("TranscriptRow", () => {
  it("không có giọng: vẽ như trước khi có người nói", () => {
    expect(html()).toBe(
      '<li class="translated"><time>10:28:03</time><div><div class="src" lang="en">Hello</div>' +
        '<div class="tgt">Xin chào</div></div></li>',
    );
  });

  it("câu đầu lượt: chip bấm được có tên; câu sau cùng người: chỉ vạch, không lặp tên", () => {
    const first = html({ voice, turnStart: true, onSpeaker: () => {} });
    expect(first).toContain('<li class="translated spk" style="--spk:var(--spk-2)">');
    expect(first).toContain(
      '<button type="button" class="spk-chip" aria-haspopup="dialog" aria-expanded="false" ' +
        'aria-label="Người nói ⁨Người 3⁩: đổi tên hoặc gộp"><span class="label">Người 3</span>' +
        '<span class="caret" aria-hidden="true">▾</span></button>',
    );
    const next = html({ voice, turnStart: false, onSpeaker: () => {} });
    expect(next).toContain('<li class="translated spk spk-cont" style="--spk:var(--spk-2)">');
    expect(next).not.toContain("spk-chip");
  });

  it("Lịch sử, phiên đã dừng: nhãn chỉ để đọc", () => {
    const markup = html({ voice, turnStart: true });
    expect(markup).toContain('<span class="spk-chip"><span class="label">Người 3</span></span>');
    expect(markup).not.toContain("<button");
  });

  it("là component memo so nông", () => {
    const memo = TranscriptRow as unknown as { $$typeof: symbol; compare: unknown };
    expect(memo.$$typeof).toBe(Symbol.for("react.memo"));
    expect(memo.compare).toBeNull();
  });
});
