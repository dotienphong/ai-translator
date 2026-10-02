import { useStore } from "zustand";
import { tauriIpc } from "../../lib/ipc";
import {
  type GlossaryStoreState,
  type HistoryStoreState,
  createGlossaryStore,
  createHistoryStore,
  resetWhenDataCleared,
} from "../../store/library";
import { type TranscriptStoreState, createTranscriptStore } from "../../store/transcript";
import { appStore } from "./appStore";

// Sao chép vào clipboard. `navigator.clipboard` cần trang an toàn và thao tác của người dùng; webview cũ không có thì
// dùng cách cũ (`execCommand("copy")` trên một ô ẩn).
async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw { code: "copyFailed", field: null, message: "clipboard" };
  }
}

// Store dữ liệu của cửa sổ chính, nối với lõi Rust thật. Bản chép lời nghe sự kiện từ lúc mở cửa sổ (`main.tsx`), để
// không sót câu nào khi màn hình Bản chép lời chưa mở.
export const transcriptStore = createTranscriptStore({ ipc: tauriIpc, writeClipboard });
export const historyStore = createHistoryStore(tauriIpc);
export const glossaryStore = createGlossaryStore(tauriIpc);
// "Xóa toàn bộ dữ liệu" xong thì bỏ cả bản chép lời, lịch sử và từ điển đang hiện (N2 của review 03).
resetWhenDataCleared(appStore, [transcriptStore, historyStore, glossaryStore]);

export function useTranscript<T>(selector: (state: TranscriptStoreState) => T): T {
  return useStore(transcriptStore, selector);
}

export function useHistory<T>(selector: (state: HistoryStoreState) => T): T {
  return useStore(historyStore, selector);
}

export function useGlossary<T>(selector: (state: GlossaryStoreState) => T): T {
  return useStore(glossaryStore, selector);
}
