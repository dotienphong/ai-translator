import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi as viText } from "../../../i18n";
import type { Notes, NotesView, StoredNotes } from "../../../lib/ipc";
import type { Gate, NotesSource } from "../../../lib/notes";
import type { NotesPack } from "../../../lib/models";
import { NotesScreenView, type NotesScreenViewProps } from "./NotesScreen";

const NOTES: Notes = {
  summary: "Chốt kế hoạch quý.",
  decisions: [{ text: "Chốt ngân sách", refs: [1] }],
  actionItems: [],
  openQuestions: [],
  raw: false,
};
const STORED: StoredNotes = {
  createdAt: 1_700_000_000_000,
  source: "deepseek",
  model: "deepseek-flash",
  lang: "vi",
  template: "meeting",
  body: NOTES,
  edited: false,
};
const view = (patch: Partial<NotesView> = {}): NotesView => ({
  target: { kind: "current" },
  status: "idle",
  progress: null,
  error: null,
  notes: STORED,
  persisted: true,
  freeLeft: null,
  ...patch,
});
const PACK: NotesPack = { state: "installed", bytes: 2_740_937_888, done: 2_740_937_888, minRamMib: 8192 };
const DEEPSEEK: NotesSource = { kind: "cloud", provider: "deepseek", model: "deepseek-flash" };

const props = (patch: Partial<NotesScreenViewProps> = {}): NotesScreenViewProps => ({
  lang: "vi",
  targets: [
    { ref: { kind: "current" }, startedAt: null, hasNotes: true },
    { ref: { kind: "history", id: 5 }, startedAt: Date.UTC(2026, 10, 2, 9, 30), hasNotes: false },
  ],
  selected: { kind: "current" },
  view: view(),
  draft: null,
  dialog: null,
  sourcePanel: null,
  notice: null,
  error: null,
  source: DEEPSEEK,
  gate: { kind: "go" },
  template: "meeting",
  pack: PACK,
  freeDiskBytes: 50_000_000_000,
  auto: false,
  pro: true,
  localUsable: false,
  confirmDiscard: false,
  staleDraft: false,
  onSelect: () => {},
  onTemplate: () => {},
  onGenerate: () => {},
  onCancel: () => {},
  onEdit: () => {},
  onSave: () => {},
  onDiscard: () => {},
  onOpenSource: () => {},
  onCloseSource: () => {},
  onCopy: () => {},
  onExport: () => {},
  onDialogConfirm: () => {},
  onDialogDismiss: () => {},
  onOpenModelSettings: () => {},
  onUpgrade: () => {},
  onUseLocal: () => {},
  onDownloadPack: () => {},
  onCancelPack: () => {},
  onDeletePack: () => {},
  onAuto: () => {},
  onDismissError: () => {},
  onConfirmDiscard: () => {},
  onCancelDiscard: () => {},
  ...patch,
});
const html = (p: NotesScreenViewProps) => renderToStaticMarkup(createElement(NotesScreenView, p));
const buttons = (markup: string) => markup.match(/<button [^>]*>[\s\S]*?<\/button>/g) ?? [];
const text = (button: string) => button.replace(/<[^>]+>/g, "");
const labelled = (markup: string, label: string) => buttons(markup).filter((b) => text(b) === label);

describe("NotesScreen", () => {
  it("shows_the_model_in_use_with_a_link_to_model_settings", () => {
    const markup = html(props());
    expect(markup).toContain("Đang dùng: DeepSeek · deepseek-flash");
    expect(labelled(markup, "Đổi ở Cài đặt &gt; Model")).toHaveLength(1);
  });

  it("local_source_never_shows_a_model_file_name", () => {
    const markup = html(props({ source: { kind: "local" }, view: view({ notes: { ...STORED, source: "local", model: "" } }) }));
    expect(markup).toContain(viText["notes.source.local"]);
    expect(markup).not.toMatch(/gguf|qwen/i);
  });

  it("a_blocked_gate_disables_generate_and_says_why", () => {
    const cases: [Extract<Gate, { kind: "blocked" }>["reason"], string][] = [
      ["empty", viText["error.notesEmpty"]],
      ["sessionRunning", viText["notes.blocked.sessionRunning"]],
      ["localSessionActive", viText["error.notesLocalSessionActive"]],
      ["freeUsedUp", viText["notes.free.usedUp"]],
      ["localUnavailable", viText["error.notesLocalUnavailable"]],
      ["packMissing", viText["error.notesLocalPackMissing"]],
      ["packDownloading", viText["notes.blocked.packDownloading"]],
      ["keyMissing", viText["notes.blocked.keyMissing"].replace("{provider}", "DeepSeek")],
    ];
    expect(cases).toHaveLength(8);
    for (const [reason, sentence] of cases) {
      const markup = html(props({ gate: { kind: "blocked", reason }, pro: reason !== "freeUsedUp" }));
      const generate = buttons(markup).filter((b) => /^(Tạo lại|Tạo ghi chú)$/.test(text(b)));
      expect(generate, reason).toHaveLength(1);
      expect(generate[0], reason).toContain("disabled");
      expect(markup, reason).toContain(sentence.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
    }
    // Không bị chặn: nút bấm được.
    const open = buttons(html(props())).filter((b) => /^(Tạo lại|Tạo ghi chú)$/.test(text(b)));
    expect(open[0]).not.toContain("disabled");
  });

  it("generate_says_regenerate_when_notes_exist", () => {
    expect(labelled(html(props()), viText["notes.regenerate"])).toHaveLength(1);
    expect(labelled(html(props({ view: view({ notes: null }) })), viText["notes.generate"])).toHaveLength(1);
  });

  it("free_used_up_offers_the_upgrade_screen", () => {
    const markup = html(props({ pro: false, gate: { kind: "blocked", reason: "freeUsedUp" }, view: view({ freeLeft: 0 }) }));
    expect(labelled(markup, viText["pro.upgrade"])).toHaveLength(1);
    expect(markup).toContain(viText["notes.free.usedUp"]);
    // Pro không có nút nâng cấp ở thanh tạo.
    expect(labelled(html(props()), viText["pro.upgrade"])).toHaveLength(0);
  });

  it("free_users_only_see_the_current_session", () => {
    const sessions = (markup: string) => (markup.match(/class="notes-session[ "]/g) ?? []).length;
    expect(sessions(html(props({ pro: false })))).toBe(1);
    expect(sessions(html(props({ pro: true })))).toBe(2);
    expect(html(props({ pro: false }))).toContain(viText["notes.session.current"]);
  });

  it("free_with_remaining_uses_says_how_many", () => {
    expect(html(props({ pro: false, view: view({ freeLeft: 2 }) }))).toContain("Còn 2 lần tạo ghi chú");
    expect(html(props({ pro: true }))).not.toContain("Còn ");
  });

  it("running_shows_progress_and_cancel_instead_of_generate", () => {
    const markup = html(props({ view: view({ status: "running", progress: [2, 5] }) }));
    expect(markup).toContain("Đang tạo ghi chú… 2/5");
    expect(labelled(markup, viText["notes.cancel"])).toHaveLength(1);
    expect(labelled(markup, viText["notes.regenerate"])).toHaveLength(0);
    expect(labelled(markup, viText["notes.generate"])).toHaveLength(0);
  });

  it("a_cloud_failure_offers_retry_and_local_only_when_the_pack_is_installed", () => {
    const failed = (localUsable: boolean) =>
      html(props({ localUsable, view: view({ status: "failed", error: "notesRateLimited" }) }));
    const withLocal = failed(true);
    expect(withLocal).toContain(viText["error.notesRateLimited"]);
    expect(labelled(withLocal, viText["notes.error.retry"])).toHaveLength(1);
    expect(labelled(withLocal, viText["notes.error.useLocal"])).toHaveLength(1);
    const withoutLocal = failed(false);
    expect(labelled(withoutLocal, viText["notes.error.retry"])).toHaveLength(1);
    expect(labelled(withoutLocal, viText["notes.error.useLocal"])).toHaveLength(0);
  });

  it("a_pause_for_session_failure_offers_only_regenerate", () => {
    const markup = html(props({ localUsable: true, view: view({ status: "failed", error: "notesPausedForSession" }) }));
    expect(markup).toContain(viText["error.notesPausedForSession"]);
    expect(labelled(markup, viText["notes.error.retry"])).toHaveLength(0);
    expect(labelled(markup, viText["notes.error.useLocal"])).toHaveLength(0);
    expect(labelled(markup, viText["notes.regenerate"])).toHaveLength(1);
  });

  it("unsaved_session_notes_carry_the_warning", () => {
    expect(html(props({ view: view({ persisted: false }) }))).toContain(viText["notes.unsaved"]);
    expect(html(props({ view: view({ persisted: true }) }))).not.toContain(viText["notes.unsaved"]);
    // Chưa có ghi chú thì không có gì để cảnh báo.
    expect(html(props({ view: view({ persisted: false, notes: null }) }))).not.toContain(viText["notes.unsaved"]);
  });

  it("file_export_is_pro_and_copy_is_not", () => {
    const free = html(props({ pro: false }));
    expect(labelled(free, viText["notes.copy"])).toHaveLength(1);
    expect(labelled(free, viText["notes.export.md"])).toHaveLength(0);
    expect(labelled(free, viText["notes.export.txt"])).toHaveLength(0);
    expect(free).toContain(viText["notes.export.pro"]);
    const pro = html(props({ pro: true }));
    expect(labelled(pro, viText["notes.copy"])).toHaveLength(1);
    expect(labelled(pro, viText["notes.export.md"])).toHaveLength(1);
    expect(labelled(pro, viText["notes.export.txt"])).toHaveLength(1);
  });

  it("the_source_panel_renders_beside_the_result_when_open", () => {
    const sourcePanel = { ref: { kind: "current" } as const, lines: [], speakers: [], refs: [1] };
    const open = html(props({ sourcePanel }));
    expect(open).toContain('class="notes-source"');
    expect(open.indexOf('class="notes-result"')).toBeLessThan(open.indexOf('class="notes-source"'));
    expect(html(props())).not.toContain('class="notes-source"');
  });

  it("editing_shows_save_and_discard_instead_of_edit", () => {
    const reading = html(props());
    expect(labelled(reading, viText["notes.edit"])).toHaveLength(1);
    expect(labelled(reading, viText["notes.edit.save"])).toHaveLength(0);
    const editing = html(props({ draft: NOTES }));
    expect(labelled(editing, viText["notes.edit"])).toHaveLength(0);
    expect(labelled(editing, viText["notes.edit.save"])).toHaveLength(1);
    expect(labelled(editing, viText["notes.edit.discard"])).toHaveLength(1);
    // Đang sửa thì không tạo lại và không xuất: tránh ghi đè hay xuất bản chưa lưu.
    expect(labelled(editing, viText["notes.regenerate"])[0] ?? "disabled").toContain("disabled");
  });

  it("switching_session_with_a_draft_asks_before_discarding", () => {
    const markup = html(props({ draft: NOTES, confirmDiscard: true }));
    expect(markup).toContain(viText["notes.discard.ask"]);
    expect(labelled(markup, viText["notes.edit.discard"]).length).toBeGreaterThanOrEqual(1);
    expect(html(props({ draft: NOTES }))).not.toContain(viText["notes.discard.ask"]);
  });

  it("newer_notes_arriving_during_an_edit_warn_instead_of_replacing_the_draft", () => {
    const stale = html(props({ draft: NOTES, staleDraft: true }));
    expect(stale).toContain(viText["notes.draft.stale"]);
    // Bản sửa vẫn nguyên: các ô nhập vẫn mang chữ của bản đang sửa.
    expect(stale).toContain("Chốt ngân sách");
    expect(html(props({ draft: NOTES }))).not.toContain(viText["notes.draft.stale"]);
    expect(html(props({ staleDraft: true }))).not.toContain(viText["notes.draft.stale"]);
  });

  it("a_missing_pack_opens_the_setup_block", () => {
    const missing = html(
      props({ source: { kind: "local" }, pack: { ...PACK, state: "missing" }, gate: { kind: "blocked", reason: "packMissing" } }),
    );
    expect(missing).toMatch(/<details[^>]*open/);
    expect(html(props())).not.toMatch(/<details[^>]*open/);
  });

  it("the_setup_block_has_the_auto_switch_and_the_pack", () => {
    const markup = html(props({ pack: { ...PACK, state: "installed" }, auto: true }));
    expect(markup).toContain(viText["notes.settings.title"]);
    expect(markup).toContain(viText["notes.auto"]);
    expect(markup).toMatch(/type="checkbox"[^>]*checked/);
    expect(markup).toContain(viText["notes.pack.delete"]);
  });

  it("no_session_shows_the_empty_state", () => {
    const markup = html(props({ targets: [], selected: null, view: null }));
    expect(markup).toContain(viText["notes.empty"]);
    expect(markup).not.toContain(viText["notes.generate"]);
  });

  it("a_store_error_shows_its_message_with_a_dismiss_button", () => {
    const markup = html(props({ error: { code: "notesBusy", field: null } }));
    expect(markup).toContain(viText["error.notesBusy"]);
    expect(labelled(markup, viText["common.dismiss"])).toHaveLength(1);
  });

  it("the_copied_and_exported_notices_show_up", () => {
    expect(html(props({ notice: { kind: "copied" } }))).toContain(viText["notes.copied"]);
    expect(html(props({ notice: { kind: "exported", path: "C:\\x\\notes.md" } }))).toContain("C:\\x\\notes.md");
  });
});
