import { createStore } from "zustand/vanilla";
import type { AppStatus, Ipc, OverlayView, Subtitle, SubtitleDelta } from "../lib/ipc";

// Store của thanh phụ đề. Cửa sổ `overlay` chỉ đọc được phần cài đặt của nó (`get_overlay_view`)
// và nghe sự kiện; không gọi được lệnh nào khác (spec §10.2). Kế hoạch 03 làm đủ phần hiển thị.

// Giữ tối đa `max` phụ đề gần nhất, xếp theo `id` (id tăng theo thứ tự câu, và không trùng giữa các phiên nhờ `id_base`).
// Phụ đề cùng `id` (phụ đề tạm được thay, §6.3; bản dịch xong) cập nhật tại chỗ; phụ đề đã được gộp vào phụ đề mới
// (`replaces`, §7) thì bỏ. Phụ đề gộp mang id của câu đầu (nhỏ hơn câu mới đã hiện sau nó), nên nếu nó thay một dòng
// đang hiện thì vào đúng chỗ dòng đầu tiên bị thay (S1 của review 02 lần 2). Phụ đề khác không có trên thanh mà cũ hơn
// dòng đầu (bản dịch xong sau khi câu đó đã trôi khỏi thanh) thì bỏ qua; còn lại thì chèn đúng chỗ theo `id`.
export function upsertLine(lines: readonly Subtitle[], subtitle: Subtitle, max: number): Subtitle[] {
  const replaced = (l: Subtitle) => subtitle.replaces.includes(l.id);
  const kept = lines.filter((l) => !replaced(l));
  const i = kept.findIndex((l) => l.id === subtitle.id);
  const firstReplaced = lines.findIndex(replaced);
  let next: Subtitle[];
  if (i >= 0) {
    next = kept.map((l, j) => (j === i ? subtitle : l));
  } else if (firstReplaced >= 0) {
    const at = lines.slice(0, firstReplaced).filter((l) => !replaced(l)).length;
    next = [...kept.slice(0, at), subtitle, ...kept.slice(at)];
  } else {
    const first = kept[0];
    if (first && subtitle.id < first.id) return kept;
    const at = kept.findIndex((l) => l.id > subtitle.id);
    next = at < 0 ? [...kept, subtitle] : [...kept.slice(0, at), subtitle, ...kept.slice(at)];
  }
  return next.slice(-Math.max(1, max));
}

// Nối phần chữ dịch mới vào phụ đề cùng `id`. Phụ đề đã trôi khỏi thanh thì bỏ qua.
export function appendDelta(lines: readonly Subtitle[], delta: SubtitleDelta): Subtitle[] {
  return lines.map((l) => (l.id === delta.id ? { ...l, tgt_text: l.tgt_text + delta.text } : l));
}

export interface OverlayStoreState {
  view: OverlayView | null;
  status: AppStatus | null;
  lines: Subtitle[];
  init(): Promise<() => void>;
}

export function createOverlayStore(ipc: Ipc) {
  return createStore<OverlayStoreState>()((set, get) => ({
    view: null,
    status: null,
    lines: [],
    async init() {
      const offs = await Promise.all([
        ipc.listen("overlay://view", (view) => set({ view, lines: get().lines.slice(-view.lines) })),
        ipc.listen("subtitle://upsert", (subtitle) =>
          set({ lines: upsertLine(get().lines, subtitle, get().view?.lines ?? 3) }),
        ),
        ipc.listen("subtitle://delta", (delta) => set({ lines: appendDelta(get().lines, delta) })),
        // Trạng thái app (cùng `rev` như cửa sổ chính): bỏ trạng thái cũ tới muộn; phiên mới bắt đầu thì xóa phụ đề cũ.
        ipc.listen("app://status", (status) => {
          const prev = get().status;
          if (prev && status.rev < prev.rev) return;
          const fresh = status.session === "starting" && prev?.session !== "starting";
          set(fresh ? { status, lines: [] } : { status });
        }),
      ]);
      // Cài đặt mới hơn đã tới qua `overlay://view` trong lúc chờ thì giữ bản đó (N-3 của review 02 lần 2).
      const view = await ipc.invoke("get_overlay_view");
      if (!get().view) set({ view, lines: get().lines.slice(-view.lines) });
      return () => offs.forEach((off) => off());
    },
  }));
}
