import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi as viText } from "../../../i18n";
import type { NotesPack } from "../../../lib/models";
import { NotesPackPanel, type NotesPackPanelProps } from "./NotesPackPanel";

const pack = (patch: Partial<NotesPack> = {}): NotesPack => ({
  state: "missing",
  bytes: 2_740_937_888,
  done: 0,
  minRamMib: 8192,
  ...patch,
});

const props = (patch: Partial<NotesPack> = {}, handlers: Partial<NotesPackPanelProps> = {}): NotesPackPanelProps => ({
  lang: "vi",
  pack: pack(patch),
  onDownload: () => {},
  onCancel: () => {},
  onDelete: () => {},
  ...handlers,
});
const html = (p: NotesPackPanelProps) => renderToStaticMarkup(createElement(NotesPackPanel, p));
const buttons = (markup: string) => (markup.match(/<button [^>]*>[\s\S]*?<\/button>/g) ?? []).map((b) => b.replace(/<[^>]+>/g, ""));

describe("NotesPackPanel", () => {
  it("a_failed_download_shows_why_and_still_offers_the_download", () => {
    const markup = html(props({ state: "missing", error: "modelsDownloadFailed" }));
    expect(markup).toContain(viText["error.modelsDownloadFailed"]);
    expect(buttons(markup)).toEqual([viText["notes.pack.download"]]);
    expect(html(props({ state: "missing" }))).not.toContain(viText["error.modelsDownloadFailed"]);
  });

  it("unavailable_renders_nothing", () => {
    expect(html(props({ state: "unavailable" }))).toBe("");
  });

  it("ram_too_low_says_how_much_ram_is_needed_and_offers_no_download", () => {
    const markup = html(props({ state: "ramTooLow", minRamMib: 15360 }));
    expect(markup).toContain("15 GB");
    expect(buttons(markup)).toEqual([]);
    // Làm tròn lên: 8200 MiB cần 9 GB.
    expect(html(props({ state: "ramTooLow", minRamMib: 8200 }))).toContain("9 GB");
  });

  it("missing_shows_the_size_and_a_download_button", () => {
    const markup = html(props());
    expect(markup).toContain(viText["notes.pack.title"]);
    expect(markup).toContain("Dung lượng: 2,7 GB");
    expect(buttons(markup)).toEqual([viText["notes.pack.download"]]);
    expect(markup).not.toContain("<progress");
  });

  it("downloading_shows_a_progress_bar_and_a_cancel_button", () => {
    const markup = html(props({ state: "downloading", done: 1_370_468_944 }));
    expect(markup).toMatch(/<progress [^>]*value="50"/);
    expect(buttons(markup)).toEqual([viText["notes.pack.cancel"]]);
  });

  it("installed_shows_the_size_and_a_delete_button", () => {
    const markup = html(props({ state: "installed", done: 2_740_937_888 }));
    expect(markup).toContain("Dung lượng: 2,7 GB");
    expect(buttons(markup)).toEqual([viText["notes.pack.delete"]]);
  });

  it("never_names_a_model_file", () => {
    for (const state of ["missing", "downloading", "installed", "ramTooLow"] as const) {
      const markup = html(props({ state, done: 1 }));
      expect(markup, state).not.toMatch(/gguf|qwen/i);
    }
  });
});
