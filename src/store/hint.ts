import { createStore } from "zustand/vanilla";
import type { HintView, Ipc } from "../lib/ipc";

// Store của cửa sổ gợi ý bật dịch (spec 2026-11-01-goi-y-bat-dich-khi-hop §5). Cửa sổ `hint` chỉ gọi được ba lệnh của nó và nghe sự kiện
// `meeting-hint://changed`. Cửa sổ chỉ biết app đang gợi ý (Teams, Zoom, Meet), không biết tiêu đề cuộc họp hay tên người nào.

export interface HintStoreState {
  view: HintView | null;
  init(): Promise<() => void>;
  // "Bật dịch": phía Rust bắt đầu phiên và đóng cửa sổ.
  accept(): void;
  // "Bỏ qua" hay ✕ (`ignoreApp: false`), hay "Không hỏi lại với <app>" (`ignoreApp: true`).
  dismiss(ignoreApp: boolean): void;
}

export function createHintStore(ipc: Ipc) {
  return createStore<HintStoreState>()((set, get) => ({
    view: null,

    async init() {
      // Nghe trước rồi mới đọc: sự kiện tới giữa hai bước không bị mất.
      const unlisten = await ipc.listen("meeting-hint://changed", (view) => set({ view }));
      try {
        // Sự kiện đã tới trong lúc chờ lệnh thì sự kiện mới hơn, giữ nó.
        const view = await ipc.invoke("get_meeting_hint_view");
        if (get().view === null) set({ view });
      } catch (e) {
        unlisten();
        throw e;
      }
      return unlisten;
    },

    accept() {
      void ipc.invoke("meeting_hint_accept").catch(() => {});
    },

    dismiss(ignoreApp) {
      void ipc.invoke("meeting_hint_dismiss", { ignoreApp }).catch(() => {});
    },
  }));
}
