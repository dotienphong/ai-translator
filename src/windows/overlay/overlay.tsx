import "./overlay.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useStore } from "zustand";
import { translate } from "../../i18n";
import { tauriIpc } from "../../lib/ipc";
import { createOverlayStore } from "../../store/overlay";

const store = createOverlayStore(tauriIpc);
// Thuộc tính `lang` của trang theo ngôn ngữ giao diện (chữ chờ, sau này là nhãn), để trình đọc màn hình đọc đúng giọng.
store.subscribe((state) => {
  if (state.view) document.documentElement.lang = state.view.uiLanguage;
});
void store.getState().init();

// Thanh phụ đề (§4.4): N dòng gần nhất, phụ đề tạm màu nhạt hơn. Khi chưa khóa thì kéo được cả thanh
// (`data-tauri-drag-region="deep"`, như spike S5); khi khóa thì click xuyên qua, do phía Rust đặt.
// Kế hoạch 03 làm đủ phần hiển thị (hiện dần từng chữ, chỉ báo, kéo cạnh đổi kích thước).
function Overlay() {
  const view = useStore(store, (s) => s.view);
  const lines = useStore(store, (s) => s.lines);
  if (!view) return null;
  return (
    <div
      className={view.locked ? "overlay" : "overlay unlocked"}
      data-tauri-drag-region={view.locked ? undefined : "deep"}
      style={{ fontSize: view.fontSize, background: `rgba(0, 0, 0, ${view.opacity})` }}
    >
      {lines.length === 0 && <div className="waiting">{translate(view.uiLanguage, "overlay.waiting")}</div>}
      {lines.map((l) => (
        <div key={l.id} className={l.provisional ? "provisional" : undefined}>
          {view.showSource && <div className="source">{l.src_text}</div>}
          <div>{l.tgt_text}</div>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
