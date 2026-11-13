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
const count = (markup: string, needle: string) => markup.split(needle).length - 1;
const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

describe("NotesScreen", () => {
  it("shows_the_source_in_use_as_a_chip_with_a_link_to_model_settings", () => {
    const markup = html(props());
    expect(markup).toContain("Nguồn: DeepSeek · deepseek-flash");
    expect(labelled(markup, viText["notes.source.changeShort"])).toHaveLength(1);
  });

  it("local_source_never_shows_a_model_file_name", () => {
    const markup = html(props({ source: { kind: "local" }, view: view({ notes: { ...STORED, source: "local", model: "" } }) }));
    expect(markup).toContain(viText["notes.source.local"]);
    expect(markup).not.toMatch(/gguf|qwen/i);
  });

  it("the_template_and_the_source_sit_in_one_toolbar_with_the_primary_action", () => {
    const markup = html(props());
    const bar = markup.slice(markup.indexOf('class="notes-toolbar"'));
    expect(bar).toContain('id="notes-template"');
    expect(count(bar.slice(0, bar.indexOf("</select>")), "<option")).toBe(3);
    expect(bar.indexOf("Nguồn:")).toBeLessThan(bar.indexOf(viText["notes.regenerate"]));
    // Đúng một nút nổi (primary) trên cả màn hình.
    expect(count(markup, 'class="primary"')).toBe(1);
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
      expect(markup, reason).toContain(escape(sentence));
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

  it("free_users_are_told_older_meetings_come_with_pro", () => {
    expect(html(props({ pro: false }))).toContain(viText["notes.sessions.proOnly"]);
    expect(html(props({ pro: true }))).not.toContain(viText["notes.sessions.proOnly"]);
  });

  it("the_meeting_list_shows_which_sessions_already_have_notes", () => {
    const markup = html(props());
    expect(markup).toContain(viText["notes.sessions.title"]);
    expect(count(markup, viText["notes.session.withNotes"])).toBe(1);
    expect(count(markup, viText["notes.session.noNotes"])).toBe(1);
  });

  it("on_narrow_windows_the_list_is_a_select_with_one_option_per_meeting", () => {
    const select = (markup: string) => markup.match(/<select class="notes-session-select"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? "";
    const pro = select(html(props({ pro: true })));
    expect(pro).toContain(`aria-label="${viText["notes.sessions.title"]}"`);
    expect(count(pro, "<option")).toBe(2);
    expect(pro).toMatch(/<option value="current" selected/);
    expect(count(select(html(props({ pro: false }))), "<option")).toBe(1);
  });

  it("the_header_says_which_session_and_when_the_notes_were_made", () => {
    const markup = html(props());
    const head = markup.slice(markup.indexOf('class="notes-head"'), markup.indexOf('class="notes-toolbar"'));
    expect(head).toContain(viText["notes.session.current"]);
    expect(head).toContain(viText["notes.meta.created"].replace("{time}", ""));
    // Chưa có ghi chú thì không có giờ tạo.
    expect(html(props({ view: view({ notes: null }) }))).not.toContain(viText["notes.meta.created"].replace("{time}", ""));
  });

  it("free_with_remaining_uses_says_how_many", () => {
    expect(html(props({ pro: false, view: view({ freeLeft: 2 }) }))).toContain("Còn 2 lần tạo ghi chú");
    expect(html(props({ pro: true }))).not.toContain("Còn ");
  });

  it("running_shows_progress_a_skeleton_and_cancel_instead_of_generate", () => {
    const markup = html(props({ view: view({ status: "running", progress: [2, 5], notes: null }) }));
    expect(markup).toContain("Đang tạo ghi chú… 2/5");
    expect(markup).toMatch(/<progress [^>]*max="5"[^>]*value="2"|<progress [^>]*value="2"[^>]*max="5"/);
    expect(markup).toContain('class="notes-skeleton"');
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

  it("only_one_banner_shows_at_a_time_most_urgent_first", () => {
    const markup = html(
      props({
        error: { code: "notesBusy", field: null },
        notice: { kind: "copied" },
        view: view({ status: "failed", error: "notesRateLimited", persisted: false }),
      }),
    );
    expect(markup).toContain(viText["error.notesBusy"]);
    expect(markup).not.toContain(viText["error.notesRateLimited"]);
    expect(markup).not.toContain(viText["notes.copied"]);
    expect(markup).not.toContain(viText["notes.unsaved"]);
    expect(count(markup, 'class="notice')).toBe(1);
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

  it("the_export_choices_live_in_one_menu_in_the_header", () => {
    const pro = html(props({ pro: true }));
    const menu = pro.match(/<details class="notes-menu">[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(menu).toContain(`>${viText["notes.export.menu"]}<`);
    expect(menu).toContain(viText["notes.export.md"]);
    expect(menu).toContain(viText["notes.export.txt"]);
    expect(pro.indexOf('class="notes-menu"')).toBeLessThan(pro.indexOf('class="notes-toolbar"'));
    expect(html(props({ pro: false }))).not.toContain('class="notes-menu"');
  });

  it("no_notes_yet_shows_the_start_card_and_stored_notes_hide_it", () => {
    const empty = html(props({ view: view({ notes: null }) }));
    expect(empty).toContain('class="notes-start"');
    expect(empty).toContain(viText["notes.start.title"]);
    expect(empty).not.toContain('class="notes-result"');
    // Chưa có ghi chú thì chưa có gì để sửa, sao chép hay xuất.
    expect(labelled(empty, viText["notes.copy"])).toHaveLength(0);
    expect(labelled(empty, viText["notes.edit"])).toHaveLength(0);
    const stored = html(props());
    expect(stored).not.toContain('class="notes-start"');
    expect(stored).toContain('class="notes-result"');
  });

  it("the_start_card_is_not_shown_while_notes_are_being_made", () => {
    expect(html(props({ view: view({ notes: null, status: "running", progress: [0, 3] }) }))).not.toContain('class="notes-start"');
  });

  it("a_missing_pack_is_set_up_inside_the_start_card_when_there_are_no_notes_yet", () => {
    const markup = html(
      props({
        source: { kind: "local" },
        pack: { ...PACK, state: "missing" },
        gate: { kind: "blocked", reason: "packMissing" },
        view: view({ notes: null }),
      }),
    );
    expect(labelled(markup, viText["notes.pack.download"])).toHaveLength(1);
    expect(count(markup, viText["notes.pack.title"])).toBe(1);
    const start = markup.indexOf('class="notes-start"');
    // Câu lý do bị chặn cũng nhắc "Tải gói": định vị nút thật, không phải chữ.
    expect(markup.indexOf(`>${viText["notes.pack.download"]}</button>`)).toBeGreaterThan(start);
    // Khối Thiết lập vẫn có công tắc tự tạo nhưng không lặp lại gói.
    expect(markup).toContain(viText["notes.auto"]);
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

  it("a_missing_pack_opens_the_setup_block_when_notes_exist", () => {
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
