import { useStore } from "zustand";
import { detectUiLanguage, type MessageKey, type Params, translate } from "../../i18n";
import { tauriIpc } from "../../lib/ipc";
import { type AppStoreState, createAppStore } from "../../store/app";

// Store dùng chung của cửa sổ chính, nối với lõi Rust thật.
export const appStore = createAppStore(tauriIpc);

export function useApp<T>(selector: (state: AppStoreState) => T): T {
  return useStore(appStore, selector);
}

const fallbackLanguage = detectUiLanguage(navigator.languages);

// Hàm dịch theo ngôn ngữ giao diện đang chọn; đổi ngôn ngữ thì mọi màn hình vẽ lại ngay (§4.5).
export function useT(): (key: MessageKey, params?: Params) => string {
  const lang = useApp((s) => s.settings?.uiLanguage ?? fallbackLanguage);
  return (key, params) => translate(lang, key, params);
}
