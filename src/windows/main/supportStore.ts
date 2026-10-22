import { useStore } from "zustand";
import { tauriIpc } from "../../lib/ipc";
import { type SupportStoreState, createSupportStore } from "../../store/support";

// Store chat hỗ trợ của cửa sổ chính, nối với lõi Rust thật. Nghe sự kiện từ lúc mở cửa sổ (`main.tsx`), để chấm đỏ ở mục Hỗ trợ
// hiện cả khi màn hình Hỗ trợ chưa mở.
export const supportStore = createSupportStore(tauriIpc);

export function useSupport<T>(selector: (state: SupportStoreState) => T): T {
  return useStore(supportStore, selector);
}
