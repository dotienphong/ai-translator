import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import {
  type ExportFormat,
  NOTES_CHANGED,
  type Notes,
  type NotesChanged,
  type NotesView,
  type SessionSummary,
  type Subtitle,
  type Transcript,
  type TranscriptRef,
} from "../lib/ipc";
import type { GateInput } from "../lib/notes";
import { createNotesStore } from "./notes";

const CUR: TranscriptRef = { kind: "current" };
const hist = (id: number): TranscriptRef => ({ kind: "history", id });

const line = (id: number): Subtitle => ({
  id,
  start_ms: id * 1000,
  end_ms: id * 1000 + 900,
  src_lang: "en",
  src_text: `src ${id}`,
  tgt_text: `tgt ${id}`,
  status: "done",
  provisional: false,
  replaces: [],
  speaker: null,
});

const transcript = (lines: Subtitle[], startedAt = 1_000): Transcript => ({
  session: 1,
  startedAt,
  endedAt: null,
  targetLang: "vi",
  lines,
  speakers: [],
  speakersRev: 0,
});

const session = (id: number, startedAt: number): SessionSummary => ({
  id,
  startedAt,
  endedAt: startedAt + 60,
  targetLang: "vi",
  lines: 3,
  preview: "",
});

const body = (summary = "tóm tắt"): Notes => ({
  summary,
  decisions: [{ text: "chốt", refs: [1] }],
  actionItems: [{ text: "việc", owner: "Lan", due: "", refs: [2] }],
  openQuestions: [],
  raw: false,
});

const view = (target: TranscriptRef, patch: Partial<NotesView> = {}): NotesView => ({
  target,
  status: "idle",
  progress: null,
  error: null,
  notes: null,
  persisted: false,
  freeLeft: null,
  ...patch,
});

const withNotes = (target: TranscriptRef, summary = "tóm tắt"): NotesView =>
  view(target, {
    notes: { createdAt: 1, source: "gemini", model: "m", lang: "vi", template: "meeting", body: body(summary), edited: false },
  });

const input = (patch: Partial<GateInput> = {}): GateInput => ({
  source: { kind: "cloud", provider: "gemini", model: "gemini-2.5-flash" },
  pack: "installed",
  localAck: true,
  cloudConsent: true,
  hasKey: true,
  sessionActive: false,
  isCurrent: true,
  lineCount: 3,
  pro: true,
  freeLeft: null,
  existing: "none",
  ...patch,
});

type Overrides = Parameters<typeof fakeIpc>[0];

function setup(overrides: Overrides = {}) {
  const clipboard: string[] = [];
  const f = fakeIpc({
    get_transcript: () => transcript([line(1), line(2), line(3)]),
    list_history: () => [],
    list_notes_sessions: () => [],
    get_notes: ({ target }) => view(target),
    generate_notes: ({ target }) => view(target, { status: "running", progress: [0, 1] }),
    update_settings: () => ({}) as never,
    ...overrides,
  });
  const store = createNotesStore({
    ipc: f.ipc,
    writeClipboard: async (text) => {
      clipboard.push(text);
    },
  });
  return { store, f, clipboard };
}

const calls = (f: ReturnType<typeof fakeIpc>, cmd: string) => f.calls.filter((c) => c.cmd === cmd);
const changed = (target: TranscriptRef, patch: Partial<NotesChanged> = {}): NotesChanged => ({
  target,
  status: "idle",
  progress: null,
  error: null,
  ...patch,
});

describe("createNotesStore", () => {
  it("init_lists_the_current_session_first_then_history_newest_first", async () => {
    const { store } = setup({
      list_history: () => [session(4, 500), session(7, 900), session(5, 700)],
      list_notes_sessions: () => [7],
    });
    await store.getState().init();
    const s = store.getState();
    expect(s.targets.map((t) => t.ref)).toEqual([CUR, hist(7), hist(5), hist(4)]);
    expect(s.targets.map((t) => t.hasNotes)).toEqual([false, true, false, false]);
    expect(s.selected).toEqual(CUR);
    expect(s.view?.target).toEqual(CUR);
  });

  it("init_skips_a_current_session_without_lines_and_survives_pro_only_failures", async () => {
    const { store } = setup({
      get_transcript: () => transcript([]),
      list_history: () => [session(2, 10)],
      list_notes_sessions: () => {
        throw { code: "proRequired", field: null, message: "x" };
      },
    });
    await store.getState().init();
    expect(store.getState().targets.map((t) => t.ref)).toEqual([hist(2)]);
    expect(store.getState().selected).toEqual(hist(2));
  });

  it("request_opens_the_dialog_the_gate_asks_for_and_does_not_generate", async () => {
    const { store, f } = setup();
    await store.getState().init();
    await store.getState().request(input({ cloudConsent: false }), "meeting");
    expect(store.getState().dialog).toBe("cloudConsent");
    expect(calls(f, "generate_notes")).toHaveLength(0);
    store.getState().dismiss();
    expect(store.getState().dialog).toBeNull();
    // Chặn hẳn thì không làm gì cả.
    await store.getState().request(input({ hasKey: false }), "meeting");
    expect(store.getState().dialog).toBeNull();
    expect(calls(f, "generate_notes")).toHaveLength(0);
  });

  it("request_generates_when_the_gate_says_go", async () => {
    const { store, f } = setup();
    await store.getState().init();
    await store.getState().request(input(), "lecture");
    expect(calls(f, "generate_notes").map((c) => c.args)).toEqual([{ target: CUR, template: "lecture" }]);
    expect(store.getState().view?.status).toBe("running");
  });

  it("confirming_the_local_suggestion_shows_the_warning_before_generating", async () => {
    const { store, f } = setup();
    await store.getState().init();
    const local = input({ source: { kind: "local" }, localAck: false });
    await store.getState().request(local, "meeting");
    expect(store.getState().dialog).toBe("localSuggest");
    await store.getState().confirm(local, "meeting", false);
    expect(store.getState().dialog).toBe("localWarning");
    expect(calls(f, "generate_notes")).toHaveLength(0);
    expect(calls(f, "update_settings")).toHaveLength(0);
  });

  it("confirming_the_warning_with_remember_saves_the_ack_then_generates", async () => {
    const { store, f } = setup();
    await store.getState().init();
    const local = input({ source: { kind: "local" }, localAck: false });
    await store.getState().request(local, "meeting");
    await store.getState().confirm(local, "meeting", false);
    await store.getState().confirm(local, "meeting", true);
    expect(f.calls.map((c) => c.cmd).filter((c) => c === "update_settings" || c === "generate_notes")).toEqual([
      "update_settings",
      "generate_notes",
    ]);
    expect(calls(f, "update_settings")[0]?.args).toEqual({ patch: { notesLocalAck: true } });
    expect(store.getState().dialog).toBeNull();
  });

  it("confirming_the_warning_without_remember_generates_without_saving", async () => {
    const { store, f } = setup();
    await store.getState().init();
    const local = input({ source: { kind: "local" }, localAck: false });
    await store.getState().request(local, "meeting");
    await store.getState().confirm(local, "meeting", false);
    await store.getState().confirm(local, "meeting", false);
    expect(calls(f, "update_settings")).toHaveLength(0);
    expect(calls(f, "generate_notes")).toHaveLength(1);
  });

  it("confirming_cloud_consent_saves_it_then_generates", async () => {
    const { store, f } = setup();
    await store.getState().init();
    const cloud = input({ cloudConsent: false });
    await store.getState().request(cloud, "meeting");
    await store.getState().confirm(cloud, "meeting", false);
    expect(calls(f, "update_settings")[0]?.args).toEqual({ patch: { notesCloudConsent: true } });
    expect(calls(f, "generate_notes")).toHaveLength(1);
  });

  it("a_failed_consent_save_does_not_generate", async () => {
    const { store, f } = setup({
      update_settings: () => {
        throw { code: "settingsFailed", field: null, message: "x" };
      },
    });
    await store.getState().init();
    const cloud = input({ cloudConsent: false });
    await store.getState().request(cloud, "meeting");
    await store.getState().confirm(cloud, "meeting", false);
    expect(calls(f, "generate_notes")).toHaveLength(0);
    expect(store.getState().error?.code).toBe("settingsFailed");
  });

  it("an_overwrite_confirmation_goes_straight_on_to_generate", async () => {
    const { store, f } = setup();
    await store.getState().init();
    const again = input({ existing: "edited" });
    await store.getState().request(again, "meeting");
    expect(store.getState().dialog).toBe("overwriteEdited");
    await store.getState().confirm(again, "meeting", false);
    expect(calls(f, "generate_notes")).toHaveLength(1);
  });

  it("force_local_is_passed_to_generate_notes", async () => {
    const { store, f } = setup();
    await store.getState().init();
    await store.getState().request(input({ source: { kind: "local" } }), "meeting", true);
    expect(calls(f, "generate_notes")[0]?.args).toEqual({ target: CUR, template: "meeting", forceLocal: true });
  });

  it("a_generate_error_keeps_the_old_view_and_reports_the_code", async () => {
    const { store } = setup({
      get_notes: ({ target }) => withNotes(target, "cũ"),
      generate_notes: () => {
        throw { code: "notesLocalPackMissing", field: null, message: "x" };
      },
    });
    await store.getState().init();
    await store.getState().request(input(), "meeting");
    expect(store.getState().error?.code).toBe("notesLocalPackMissing");
    expect(store.getState().view?.notes?.body.summary).toBe("cũ");
  });

  it("a_change_event_for_another_target_does_not_replace_the_view", async () => {
    const { store, f } = setup({
      list_history: () => [session(9, 100)],
      get_notes: ({ target }) => (target.kind === "history" ? withNotes(target, "lịch sử") : withNotes(target, "hiện tại")),
    });
    await store.getState().init();
    expect(store.getState().view?.notes?.body.summary).toBe("hiện tại");
    f.emit(NOTES_CHANGED, changed(hist(9)));
    await new Promise((r) => setTimeout(r, 0));
    const s = store.getState();
    expect(s.view?.notes?.body.summary).toBe("hiện tại");
    expect(s.view?.target).toEqual(CUR);
    expect(s.targets.find((t) => t.ref.kind === "history")?.hasNotes).toBe(true);
    // Đang chạy của mục tiêu khác: chưa đổi gì.
    f.emit(NOTES_CHANGED, changed(hist(9), { status: "running", progress: [1, 2] }));
    expect(store.getState().view?.target).toEqual(CUR);
  });

  it("a_change_event_for_the_selected_target_refetches_it", async () => {
    let summary = "một";
    const { store, f } = setup({ get_notes: ({ target }) => withNotes(target, summary) });
    await store.getState().init();
    summary = "hai";
    f.emit(NOTES_CHANGED, changed(CUR));
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().view?.notes?.body.summary).toBe("hai");
  });

  it("a_finished_job_does_not_replace_a_draft_being_edited", async () => {
    let summary = "một";
    const { store, f } = setup({ get_notes: ({ target }) => withNotes(target, summary) });
    await store.getState().init();
    const draft = body("bản sửa tay");
    store.getState().edit(draft);
    summary = "hai";
    f.emit(NOTES_CHANGED, changed(CUR));
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().draft).toBe(draft);
    expect(store.getState().view?.notes?.body.summary).toBe("hai");
  });

  it("select_drops_the_draft_and_loads_the_other_target", async () => {
    const { store } = setup({
      list_history: () => [session(3, 50)],
      get_notes: ({ target }) => (target.kind === "history" ? withNotes(target, "lịch sử") : view(target)),
    });
    await store.getState().init();
    store.getState().edit(body("sửa"));
    await store.getState().select(hist(3));
    const s = store.getState();
    expect(s.draft).toBeNull();
    expect(s.selected).toEqual(hist(3));
    expect(s.view?.notes?.body.summary).toBe("lịch sử");
  });

  it("save_edit_sends_the_draft_and_clears_it", async () => {
    const saved = body("đã lưu");
    const { store, f } = setup({
      save_notes: ({ target }) => ({ ...withNotes(target, "đã lưu"), persisted: true }),
    });
    await store.getState().init();
    store.getState().edit(saved);
    await store.getState().saveEdit();
    expect(calls(f, "save_notes")[0]?.args).toEqual({ target: CUR, notes: saved });
    expect(store.getState().draft).toBeNull();
    expect(store.getState().view?.notes?.body.summary).toBe("đã lưu");
    expect(store.getState().targets[0]?.hasNotes).toBe(true);
  });

  it("discard_edit_clears_the_draft", async () => {
    const { store } = setup();
    await store.getState().init();
    store.getState().edit(body());
    store.getState().discardEdit();
    expect(store.getState().draft).toBeNull();
  });

  it("open_source_loads_the_right_transcript_once", async () => {
    const { store, f } = setup({
      list_history: () => [session(8, 10)],
      get_history_session: () => transcript([line(1), line(2)], 10),
    });
    await store.getState().init();
    const before = calls(f, "get_transcript").length;
    await store.getState().openSource([2]);
    await store.getState().openSource([1, 2]);
    expect(calls(f, "get_transcript").length - before).toBe(1);
    expect(store.getState().source?.refs).toEqual([1, 2]);
    // Phiên Lịch sử: dùng `get_history_session`, và nạp lại khi đổi phiên.
    await store.getState().select(hist(8));
    await store.getState().openSource([1]);
    expect(calls(f, "get_history_session").map((c) => c.args)).toEqual([{ id: 8 }]);
    expect(store.getState().source?.lines).toHaveLength(2);
    store.getState().closeSource();
    expect(store.getState().source).toBeNull();
  });

  it("copy_writes_the_markdown_to_the_clipboard_and_sets_the_notice", async () => {
    const { store, clipboard } = setup({ notes_text: () => "# ghi chú" });
    await store.getState().init();
    await store.getState().copy();
    expect(clipboard).toEqual(["# ghi chú"]);
    expect(store.getState().notice).toEqual({ kind: "copied" });
  });

  it("export_sends_the_utc_offset_and_reports_the_path", async () => {
    const { store, f } = setup({ export_notes: () => "C:\\x\\notes.md" });
    await store.getState().init();
    await store.getState().exportFile("markdown" as ExportFormat);
    const args = calls(f, "export_notes")[0]?.args as { target: TranscriptRef; format: string; utcOffsetMinutes: number };
    expect(args.format).toBe("markdown");
    expect(args.utcOffsetMinutes).toBe(-new Date().getTimezoneOffset());
    expect(store.getState().notice).toEqual({ kind: "exported", path: "C:\\x\\notes.md" });
  });

  it("a_cancelled_save_dialog_sets_no_notice", async () => {
    const { store } = setup({ export_notes: () => null });
    await store.getState().init();
    await store.getState().exportFile("txt");
    expect(store.getState().notice).toBeNull();
    expect(store.getState().error).toBeNull();
  });

  it("reset_forgets_every_session_note_and_draft", async () => {
    const { store } = setup({ list_history: () => [session(3, 50)], get_notes: ({ target }) => withNotes(target) });
    await store.getState().init();
    store.getState().edit(body());
    store.getState().reset();
    const s = store.getState();
    expect([s.targets, s.selected, s.view, s.draft, s.dialog, s.source, s.notice, s.error]).toEqual([[], null, null, null, null, null, null, null]);
  });

  it("cancel_calls_cancel_notes_and_refetches", async () => {
    const { store, f } = setup({ cancel_notes: () => null });
    await store.getState().init();
    await store.getState().cancel();
    expect(calls(f, "cancel_notes")).toHaveLength(1);
  });
});
