import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi as viText } from "../../../i18n";
import type { SpeakerVoice, Subtitle } from "../../../lib/ipc";
import { NotesSourcePanel, type NotesSourcePanelProps } from "./NotesSourcePanel";

const line = (id: number, patch: Partial<Subtitle> = {}): Subtitle => ({
  id,
  start_ms: id * 1000,
  end_ms: id * 1000 + 900,
  src_lang: "en",
  src_text: `Original ${id}`,
  tgt_text: `Bản dịch ${id}`,
  status: "done",
  provisional: false,
  replaces: [],
  speaker: null,
  ...patch,
});

const LAN: SpeakerVoice = { id: 1, label: "Lan Nguyễn", color: 0, source: "name", room: false, mergedInto: null };

const props = (patch: Partial<NotesSourcePanelProps> = {}): NotesSourcePanelProps => ({
  lang: "vi",
  lines: [line(10, { speaker: 1 }), line(20), line(30), line(40)],
  speakers: [LAN],
  refs: [2, 3],
  onClose: () => {},
  ...patch,
});
const html = (p: NotesSourcePanelProps) => renderToStaticMarkup(createElement(NotesSourcePanel, p));
const count = (markup: string, needle: string) => markup.split(needle).length - 1;

describe("NotesSourcePanel", () => {
  it("only_the_referenced_lines_are_marked", () => {
    const markup = html(props());
    expect(count(markup, "is-ref")).toBe(2);
    expect(count(markup, 'aria-current="true"')).toBe(2);
    // Mọi câu đều có mặt, theo thứ tự.
    for (const n of [10, 20, 30, 40]) expect(markup).toContain(`Original ${n}`);
    expect(markup.indexOf("Original 10")).toBeLessThan(markup.indexOf("Original 40"));
    expect(markup).toContain(viText["notes.source.title"]);
    expect(markup).not.toContain(viText["notes.source.missing"]);
  });

  it("no_matching_line_shows_the_missing_note", () => {
    const markup = html(props({ refs: [99] }));
    expect(markup).toContain(viText["notes.source.missing"]);
    expect(count(markup, "is-ref")).toBe(0);
  });

  it("the_translation_is_hidden_when_it_equals_the_original", () => {
    const markup = html(props({ lines: [line(1, { src_text: "Giống nhau", tgt_text: "Giống nhau" }), line(2)], refs: [1] }));
    expect(count(markup, "Giống nhau")).toBe(1);
    expect(markup).toContain("Bản dịch 2");
  });

  it("shows_the_speaker_label_when_the_line_has_one", () => {
    const markup = html(props());
    expect(count(markup, "Lan Nguyễn")).toBe(1);
    // Giọng đã gộp vào giọng khác: hiện nhãn của giọng gốc.
    const merged: SpeakerVoice = { ...LAN, id: 2, label: "Người 2", mergedInto: 1 };
    const withMerged = html(props({ lines: [line(1, { speaker: 2 })], speakers: [LAN, merged], refs: [1] }));
    expect(withMerged).toContain("Lan Nguyễn");
    expect(withMerged).not.toContain("Người 2");
  });

  it("has_a_close_button", () => {
    expect(html(props())).toContain(`aria-label="${viText["common.dismiss"]}"`);
  });
});
