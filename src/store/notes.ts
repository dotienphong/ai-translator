import { type StoreApi, createStore } from "zustand/vanilla";
import {
  type ExportFormat,
  type Ipc,
  NOTES_CHANGED,
  type Notes,
  type NotesTemplate,
  type NotesView,
  type SessionSummary,
  type Subtitle,
  type TranscriptRef,
} from "../lib/ipc";
import { type AskDialog, type GateInput, gate } from "../lib/notes";
import { type UiError, toUiError } from "./app";

// Store của màn hình "Ghi chú cuộc họp" (spec 2026-11-11-ghi-chu-cuoc-hop-design.md mục 6, 7, 9): danh sách phiên để chọn, ghi chú của
// phiên đang chọn, bản đang sửa tay, các hộp hỏi trước khi tạo, và khung đối chiếu câu gốc. Quyết định "bấm Tạo thì làm gì" nằm ở
// `gate` (`lib/notes.ts`); store chỉ chạy nó và gọi lệnh.

export interface NotesTarget {
  ref: TranscriptRef;
  startedAt: number | null;
  hasNotes: boolean;
}

export type NotesDialog = AskDialog | "localWarning";

export type NotesNotice = { kind: "copied" } | { kind: "exported"; path: string };

export interface NotesStoreState {
  // Phiên hiện tại đứng đầu (nếu có câu), rồi Lịch sử mới nhất trước.
  targets: NotesTarget[];
  selected: TranscriptRef | null;
  // Của `selected`.
  view: NotesView | null;
  // Bản đang sửa tay; `null` khi không sửa.
  draft: Notes | null;
  dialog: NotesDialog | null;
  // Khung đối chiếu: các câu của bản chép lời và số thứ tự (từ 1) của các câu được tô.
  source: { ref: TranscriptRef; lines: Subtitle[]; refs: number[] } | null;
  notice: NotesNotice | null;
  error: UiError | null;
  // Nghe `notes://changed`, nạp danh sách phiên, chọn mục đầu.
  init(): Promise<void>;
  select(ref: TranscriptRef): Promise<void>;
  // Chạy `gate`: cần hỏi thì mở hộp, được đi thì tạo. `forceLocal`: người gọi truyền `input.source = { kind: "local" }` để `gate` áp
  // luật của Local; store gửi `forceLocal: true` cho `generate_notes`.
  request(input: GateInput, template: NotesTemplate, forceLocal?: boolean): Promise<void>;
  // Xác nhận hộp đang mở rồi chạy lại `request`. `remember` chỉ có nghĩa ở hộp cảnh báo của Local.
  confirm(input: GateInput, template: NotesTemplate, remember: boolean): Promise<void>;
  dismiss(): void;
  cancel(): Promise<void>;
  edit(next: Notes): void;
  saveEdit(): Promise<void>;
  discardEdit(): void;
  openSource(refs: number[]): Promise<void>;
  closeSource(): void;
  copy(): Promise<void>;
  exportFile(format: ExportFormat): Promise<void>;
  // "Xóa toàn bộ dữ liệu" xong: bỏ mọi thứ đang hiện (`resetWhenDataCleared`).
  reset(): void;
}

export interface NotesDeps {
  ipc: Ipc;
  writeClipboard(text: string): Promise<void>;
}

export const sameRef = (a: TranscriptRef | null, b: TranscriptRef | null): boolean =>
  a !== null && b !== null && a.kind === b.kind && (a.kind === "current" || (b.kind === "history" && a.id === b.id));

const CURRENT: TranscriptRef = { kind: "current" };

export function createNotesStore(deps: NotesDeps): StoreApi<NotesStoreState> {
  const { ipc } = deps;
  let watching = false;
  // Các hộp người dùng đã xác nhận trong lần bấm Tạo này; `gate` không hỏi lại chúng.
  let confirmed = new Set<AskDialog>();
  // `forceLocal` của lần bấm Tạo đang chờ xác nhận.
  let pendingForceLocal = false;

  return createStore<NotesStoreState>((set, get) => {
    const fail = (e: unknown) => set({ error: toUiError(e) });

    const setHasNotes = (ref: TranscriptRef, hasNotes: boolean) =>
      set({ targets: get().targets.map((t) => (sameRef(t.ref, ref) ? { ...t, hasNotes } : t)) });

    // Hỏi lại ghi chú của `ref`; chỉ đặt `view` khi `ref` vẫn là mục đang chọn lúc câu trả lời tới.
    const refresh = async (ref: TranscriptRef) => {
      try {
        const view = await ipc.invoke("get_notes", { target: ref });
        setHasNotes(ref, view.notes !== null);
        if (sameRef(get().selected, ref)) set({ view });
      } catch (e) {
        if (sameRef(get().selected, ref)) fail(e);
      }
    };

    const generate = async (template: NotesTemplate, forceLocal: boolean) => {
      const target = get().selected;
      if (target === null) return;
      set({ dialog: null, notice: null, error: null });
      try {
        const view = await ipc.invoke("generate_notes", { target, template, ...(forceLocal ? { forceLocal: true } : {}) });
        if (sameRef(get().selected, target)) set({ view });
      } catch (e) {
        // Lỗi `notes*` của lệnh: giữ ghi chú đang hiện, chỉ báo lỗi.
        fail(e);
      }
    };

    const run = async (input: GateInput, template: NotesTemplate, forceLocal: boolean) => {
      const next = gate(input, confirmed);
      if (next.kind === "ask") {
        pendingForceLocal = forceLocal;
        set({ dialog: next.dialog, error: null });
        return;
      }
      if (next.kind === "blocked") {
        // Nút Tạo đã tắt ở màn hình; tới đây chỉ khi trạng thái đổi giữa chừng.
        confirmed = new Set();
        set({ dialog: null });
        return;
      }
      confirmed = new Set();
      await generate(template, forceLocal);
    };

    const saveSetting = async (patch: { notesLocalAck: true } | { notesCloudConsent: true }): Promise<boolean> => {
      try {
        await ipc.invoke("update_settings", { patch });
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    };

    const loadTargets = async (): Promise<NotesTarget[]> => {
      const [transcript, history, noted] = await Promise.all([
        ipc.invoke("get_transcript").catch(() => null),
        ipc.invoke("list_history").catch((): SessionSummary[] => []),
        // Chỉ Pro: Free nhận lỗi, coi như chưa có phiên nào có ghi chú.
        ipc.invoke("list_notes_sessions").catch((): number[] => []),
      ]);
      const targets: NotesTarget[] = [];
      if (transcript && transcript.lines.length > 0) {
        targets.push({ ref: CURRENT, startedAt: transcript.startedAt, hasNotes: false });
      }
      const sorted = [...history].sort((a, b) => b.startedAt - a.startedAt || b.id - a.id);
      for (const s of sorted) {
        targets.push({ ref: { kind: "history", id: s.id }, startedAt: s.startedAt, hasNotes: noted.includes(s.id) });
      }
      return targets;
    };

    return {
      targets: [],
      selected: null,
      view: null,
      draft: null,
      dialog: null,
      source: null,
      notice: null,
      error: null,

      async init() {
        if (!watching) {
          watching = true;
          try {
            await ipc.listen(NOTES_CHANGED, (event) => {
              const current = get().selected;
              if (sameRef(current, event.target)) {
                // Kết quả mới về trong lúc người dùng đang sửa tay: `draft` giữ nguyên, chỉ `view` đổi.
                void refresh(event.target);
                return;
              }
              // Mục khác: không đụng tới `view`; việc xong thì hỏi xem mục đó có ghi chú không để cập nhật dấu trong danh sách.
              if (event.status === "idle") {
                void ipc
                  .invoke("get_notes", { target: event.target })
                  .then((v) => setHasNotes(event.target, v.notes !== null))
                  .catch(() => {});
              }
            });
          } catch {
            watching = false;
          }
        }
        let targets: NotesTarget[] = [];
        try {
          targets = await loadTargets();
        } catch (e) {
          fail(e);
        }
        set({ targets });
        const first = targets[0];
        if (first) await get().select(first.ref);
      },

      async select(ref) {
        set({ selected: ref, view: null, draft: null, source: null, dialog: null, notice: null, error: null });
        confirmed = new Set();
        await refresh(ref);
      },

      async request(input, template, forceLocal = false) {
        confirmed = new Set();
        await run(input, template, forceLocal);
      },

      async confirm(input, template, remember) {
        const dialog = get().dialog;
        if (dialog === null) return;
        if (dialog === "localSuggest") {
          // "Vẫn dùng model trên máy": chưa tạo, nêu cảnh báo trước.
          confirmed.add("localSuggest");
          set({ dialog: "localWarning" });
          return;
        }
        if (dialog === "localWarning") {
          if (remember && !(await saveSetting({ notesLocalAck: true }))) return;
        } else if (dialog === "cloudConsent") {
          if (!(await saveSetting({ notesCloudConsent: true }))) return;
          confirmed.add("cloudConsent");
        } else {
          confirmed.add(dialog);
        }
        await run(input, template, pendingForceLocal);
      },

      dismiss() {
        confirmed = new Set();
        set({ dialog: null });
      },

      async cancel() {
        try {
          await ipc.invoke("cancel_notes");
        } catch (e) {
          fail(e);
        }
        const selected = get().selected;
        if (selected) await refresh(selected);
      },

      edit(next) {
        set({ draft: next });
      },

      async saveEdit() {
        const { draft, selected } = get();
        if (draft === null || selected === null) return;
        try {
          const view = await ipc.invoke("save_notes", { target: selected, notes: draft });
          setHasNotes(selected, view.notes !== null);
          if (sameRef(get().selected, selected)) set({ view, draft: null, error: null });
        } catch (e) {
          fail(e);
        }
      },

      discardEdit() {
        set({ draft: null });
      },

      async openSource(refs) {
        const ref = get().selected;
        if (ref === null) return;
        const loaded = get().source;
        if (loaded && sameRef(loaded.ref, ref)) {
          set({ source: { ...loaded, refs } });
          return;
        }
        try {
          const transcript = ref.kind === "current" ? await ipc.invoke("get_transcript") : await ipc.invoke("get_history_session", { id: ref.id });
          if (sameRef(get().selected, ref)) set({ source: { ref, lines: transcript.lines, refs } });
        } catch (e) {
          fail(e);
        }
      },

      closeSource() {
        set({ source: null });
      },

      async copy() {
        const target = get().selected;
        if (target === null) return;
        try {
          const text = await ipc.invoke("notes_text", { target });
          await deps.writeClipboard(text);
          set({ notice: { kind: "copied" }, error: null });
        } catch (e) {
          fail(e);
        }
      },

      reset() {
        confirmed = new Set();
        pendingForceLocal = false;
        set({ targets: [], selected: null, view: null, draft: null, dialog: null, source: null, notice: null, error: null });
      },

      async exportFile(format) {
        const target = get().selected;
        if (target === null) return;
        try {
          const path = await ipc.invoke("export_notes", { target, format, utcOffsetMinutes: -new Date().getTimezoneOffset() });
          // `null`: người dùng đóng hộp lưu file, không có gì để báo.
          if (path !== null) set({ notice: { kind: "exported", path }, error: null });
        } catch (e) {
          fail(e);
        }
      },
    };
  });
}
