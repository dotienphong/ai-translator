import { createStore } from "zustand/vanilla";
import type { GlossaryEntry, ImportReport, Ipc, SessionSummary, Transcript } from "../lib/ipc";
import { type AppStore, type UiError, toUiError } from "./app";

// Lịch sử (F4) và từ điển thuật ngữ (F5) trong cửa sổ chính: cả hai là tính năng Pro, phía Rust kiểm Pro ở mọi lệnh
// (`pro::require`) và trả `proRequired` khi đang ở gói Free. Store chỉ giữ kết quả phía Rust trả về, không tự đoán.

export interface HistoryStoreState {
  sessions: SessionSummary[] | null;
  // Phiên đang mở để xem lại.
  open: { id: number; transcript: Transcript } | null;
  error: UiError | null;
  load(): Promise<void>;
  openSession(id: number): Promise<void>;
  close(): void;
  remove(id: number): Promise<void>;
  clearAll(): Promise<void>;
  reset(): void;
}

export function createHistoryStore(ipc: Ipc) {
  return createStore<HistoryStoreState>()((set, get) => {
    async function run(call: () => Promise<void>) {
      try {
        await call();
        set({ error: null });
      } catch (e) {
        set({ error: toUiError(e) });
      }
    }
    return {
      sessions: null,
      open: null,
      error: null,
      async load() {
        await run(async () => set({ sessions: await ipc.invoke("list_history") }));
      },
      async openSession(id) {
        await run(async () => set({ open: { id, transcript: await ipc.invoke("get_history_session", { id }) } }));
      },
      close() {
        set({ open: null });
      },
      async remove(id) {
        await run(async () => {
          await ipc.invoke("delete_history_session", { id });
          set({
            sessions: (get().sessions ?? []).filter((s) => s.id !== id),
            open: get().open?.id === id ? null : get().open,
          });
        });
      },
      async clearAll() {
        await run(async () => {
          await ipc.invoke("clear_history");
          set({ sessions: [], open: null });
        });
      },
      reset() {
        set({ sessions: [], open: null, error: null });
      },
    };
  });
}

export type HistoryStore = ReturnType<typeof createHistoryStore>;

// Tối đa 500 cặp (F5); phía Rust cũng từ chối khi đã đủ.
export const MAX_GLOSSARY = 500;

export interface GlossaryStoreState {
  entries: GlossaryEntry[] | null;
  // Lỗi của lệnh không gắn với ô nào (nhập, xuất, đọc danh sách, xóa).
  error: UiError | null;
  report: ImportReport | null;
  exported: string | null;
  load(): Promise<void>;
  // Lỗi của ô nhập (chữ nguồn trùng, rỗng, quá dài) trả về cho dòng đang sửa, không lên thanh lỗi chung.
  add(source: string, target: string): Promise<UiError | null>;
  update(id: number, source: string, target: string): Promise<UiError | null>;
  remove(id: number): Promise<void>;
  importCsv(): Promise<void>;
  exportCsv(): Promise<void>;
  dismiss(): void;
  reset(): void;
}

export function createGlossaryStore(ipc: Ipc) {
  return createStore<GlossaryStoreState>()((set, get) => {
    async function run(call: () => Promise<void>) {
      try {
        await call();
        set({ error: null });
      } catch (e) {
        set({ error: toUiError(e) });
      }
    }
    async function edit(call: () => Promise<GlossaryEntry>): Promise<UiError | null> {
      try {
        const entry = await call();
        const rest = (get().entries ?? []).filter((e) => e.id !== entry.id);
        set({ entries: [...rest, entry].sort((a, b) => a.id - b.id), error: null });
        return null;
      } catch (e) {
        return toUiError(e);
      }
    }
    return {
      entries: null,
      error: null,
      report: null,
      exported: null,
      async load() {
        await run(async () => set({ entries: await ipc.invoke("list_glossary") }));
      },
      add(source, target) {
        return edit(() => ipc.invoke("add_glossary_entry", { source, target }));
      },
      update(id, source, target) {
        return edit(() => ipc.invoke("update_glossary_entry", { id, source, target }));
      },
      async remove(id) {
        await run(async () => {
          await ipc.invoke("delete_glossary_entry", { id });
          set({ entries: (get().entries ?? []).filter((e) => e.id !== id) });
        });
      },
      async importCsv() {
        await run(async () => {
          const report = await ipc.invoke("import_glossary_csv");
          if (report === null) return;
          set({ report, exported: null, entries: await ipc.invoke("list_glossary") });
        });
      },
      async exportCsv() {
        await run(async () => {
          const path = await ipc.invoke("export_glossary_csv");
          if (path !== null) set({ exported: path, report: null });
        });
      },
      dismiss() {
        set({ error: null, report: null, exported: null });
      },
      reset() {
        set({ entries: [], error: null, report: null, exported: null });
      },
    };
  });
}

export type GlossaryStore = ReturnType<typeof createGlossaryStore>;

// "Xóa toàn bộ dữ liệu" xong (`dataCleared` của store app bật lên): phía Rust đã xóa, nên cửa sổ chính cũng bỏ bản chép
// lời, lịch sử và từ điển đang hiện (N2 của review 03). Trả hàm hủy đăng ký.
export function resetWhenDataCleared(app: AppStore, stores: readonly { getState(): { reset(): void } }[]): () => void {
  return app.subscribe((state, previous) => {
    if (state.dataCleared && !previous.dataCleared) stores.forEach((s) => s.getState().reset());
  });
}
