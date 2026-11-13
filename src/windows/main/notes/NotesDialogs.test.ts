import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { en, ja, ko, vi as viText, zh } from "../../../i18n";
import type { NotesSource } from "../../../lib/notes";
import { NotesDialogs, type NotesDialogsProps } from "./NotesDialogs";

const GEMINI: NotesSource = { kind: "cloud", provider: "gemini", model: "gemini-2.5-flash" };

const props = (patch: Partial<NotesDialogsProps> = {}): NotesDialogsProps => ({
  lang: "vi",
  dialog: "cloudConsent",
  provider: GEMINI,
  onConfirm: () => {},
  onDismiss: () => {},
  onOpenModelSettings: () => {},
  ...patch,
});
const html = (p: NotesDialogsProps) => renderToStaticMarkup(createElement(NotesDialogs, p));
const buttons = (markup: string) => markup.match(/<button [^>]*>[\s\S]*?<\/button>/g) ?? [];

describe("NotesDialogs", () => {
  it("no_dialog_renders_nothing", () => {
    expect(html(props({ dialog: null }))).toBe("");
  });

  it("the_local_suggestion_offers_switch_first_and_keep_second", () => {
    const markup = html(props({ dialog: "localSuggest", provider: { kind: "local" } }));
    expect(markup).toContain(viText["notes.local.suggest.title"]);
    expect(markup).toContain(viText["notes.local.suggest.body"]);
    const labels = buttons(markup).map((b) => b.replace(/<[^>]+>/g, ""));
    expect(labels.indexOf(viText["notes.local.suggest.switch"])).toBe(0);
    expect(labels.indexOf(viText["notes.local.suggest.keep"])).toBe(1);
  });

  it("the_local_warning_states_resources_speed_and_errors_and_has_remember", () => {
    const markup = html(props({ dialog: "localWarning", provider: { kind: "local" } }));
    expect(markup).toContain(viText["notes.local.warning.title"]);
    expect(markup).toContain(viText["notes.local.warning.resources"]);
    expect(markup).toContain(viText["notes.local.warning.slow"]);
    expect(markup).toContain("hơn 20 phút");
    expect(markup).toContain(viText["notes.local.warning.errors"]);
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain(viText["notes.local.warning.remember"]);
    expect(buttons(markup).some((b) => b.includes(viText["notes.local.warning.go"]))).toBe(true);
  });

  it("the_consent_in_every_language_says_untranslated_lines_are_sent_in_their_original_wording", () => {
    // Câu chưa có bản dịch (cùng ngôn ngữ, dịch lỗi, bỏ qua) được gửi bằng câu gốc (notes::chunk::text_of): hộp đồng ý không được nói ngược lại.
    const old: Record<string, string> = {
      vi: "Âm thanh và câu gốc không được gửi",
      en: "Audio and the original sentences are not sent",
      ja: "音声と原文は送信されません",
      zh: "音频和原句不会被发送",
      ko: "오디오와 원문은 보내지 않습니다",
    };
    const marker: Record<string, string> = {
      vi: "chưa có bản dịch",
      en: "has no translation",
      ja: "翻訳がない文",
      zh: "没有译文的句子",
      ko: "번역이 없는 문장",
    };
    for (const [lang, dict] of Object.entries({ vi: viText, en, ja, zh, ko })) {
      const body = dict["notes.consent.body"];
      expect(body, lang).not.toContain(old[lang]);
      expect(body, lang).toContain(marker[lang]);
    }
  });

  it("the_consent_names_the_selected_provider", () => {
    const named = (provider: NotesSource["kind"] extends never ? never : NotesSource) => html(props({ provider }));
    const openai = named({ kind: "cloud", provider: "openai", model: "gpt-4o-mini" });
    expect(openai).toContain("OpenAI");
    expect(openai).not.toContain("Google");
    expect(openai).not.toContain("DeepSeek");
    const gemini = named(GEMINI);
    expect(gemini).toContain("Google");
    expect(gemini).not.toContain("OpenAI");
    expect(gemini).not.toContain("DeepSeek");
    const deepseek = named({ kind: "cloud", provider: "deepseek", model: "deepseek-flash" });
    expect(deepseek).toContain("DeepSeek");
    expect(deepseek).not.toContain("OpenAI");
    expect(deepseek).not.toContain("Google");
    expect(openai).toContain(viText["notes.consent.accept"]);
  });

  it("the_edited_overwrite_warns_about_losing_edits", () => {
    const edited = html(props({ dialog: "overwriteEdited" }));
    expect(edited).toContain(viText["notes.overwrite.title"]);
    expect(edited).toContain(viText["notes.overwrite.edited"]);
    expect(buttons(edited).some((b) => b.includes(viText["notes.overwrite.accept"]))).toBe(true);
    const plain = html(props({ dialog: "overwrite" }));
    expect(plain).toContain(viText["notes.overwrite.body"]);
    expect(plain).not.toContain(viText["notes.overwrite.edited"]);
  });

  it("every_dialog_is_a_modal_with_a_cancel_button", () => {
    for (const dialog of ["localSuggest", "localWarning", "cloudConsent", "overwrite", "overwriteEdited"] as const) {
      const markup = html(props({ dialog }));
      expect(markup, dialog).toContain('role="alertdialog"');
      expect(markup, dialog).toContain('aria-modal="true"');
      expect(buttons(markup).some((b) => b.includes(viText["notes.cancel"])), dialog).toBe(true);
    }
  });
});
