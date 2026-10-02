import { useStore } from "zustand";
import { tauriIpc } from "../../lib/ipc";
import { createModelsStore, type ModelsStoreState } from "../../store/models";
import { appStore } from "./appStore";

// Store quản lý model của cửa sổ chính, nối với lõi Rust thật (kế hoạch 04). "Xóa model và dữ liệu" xong thì bật
// `dataCleared` của store chính, như nút "Xóa toàn bộ dữ liệu": bản chép lời, lịch sử và từ điển đang hiện bị bỏ.
export const modelsStore = createModelsStore(tauriIpc, () => {
  appStore.setState({ dataCleared: false });
  appStore.setState({ dataCleared: true });
});

export function useModels<T>(selector: (state: ModelsStoreState) => T): T {
  return useStore(modelsStore, selector);
}
