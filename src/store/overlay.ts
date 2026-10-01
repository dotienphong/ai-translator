import { createStore } from "zustand/vanilla";
import type { Ipc, OverlayView, Subtitle } from "../lib/ipc";

// Store của thanh phụ đề. Cửa sổ `overlay` chỉ đọc được phần cài đặt của nó (`get_overlay_view`)
// và nghe sự kiện; không gọi được lệnh nào khác (spec §10.2). Kế hoạch 03 làm đủ phần hiển thị.

// Giữ tối đa `max` phụ đề gần nhất. Phụ đề cùng `id` (phụ đề tạm được thay, §6.3) cập nhật tại chỗ.
export function upsertLine(lines: readonly Subtitle[], subtitle: Subtitle, max: number): Subtitle[] {
  const i = lines.findIndex((l) => l.id === subtitle.id);
  const next = i >= 0 ? lines.map((l, j) => (j === i ? subtitle : l)) : [...lines, subtitle];
  return next.slice(-Math.max(1, max));
}

export interface OverlayStoreState {
  view: OverlayView | null;
  lines: Subtitle[];
  init(): Promise<() => void>;
}

export function createOverlayStore(ipc: Ipc) {
  return createStore<OverlayStoreState>()((set, get) => ({
    view: null,
    lines: [],
    async init() {
      const offs = await Promise.all([
        ipc.listen("overlay://view", (view) => set({ view, lines: get().lines.slice(-view.lines) })),
        ipc.listen("subtitle://upsert", (subtitle) =>
          set({ lines: upsertLine(get().lines, subtitle, get().view?.lines ?? 3) }),
        ),
      ]);
      set({ view: await ipc.invoke("get_overlay_view") });
      return () => offs.forEach((off) => off());
    },
  }));
}
