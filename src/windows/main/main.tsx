import { invoke } from "@tauri-apps/api/core";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

// Cửa sổ điều khiển cho spike S5: bật phụ đề mẫu, khóa click xuyên, đổi activation policy.
function App() {
  const [ticker, setTicker] = useState(false);
  const [locked, setLocked] = useState(false);
  const [accessory, setAccessory] = useState(false);

  return (
    <main style={{ fontFamily: "system-ui", padding: 16, lineHeight: 1.8 }}>
      <h3>Spike S5: thanh phụ đề nổi</h3>
      <button onClick={async () => setTicker(await invoke<boolean>("toggle_ticker"))}>
        {ticker ? "Dừng" : "Bắt đầu"} phụ đề mẫu (Ctrl+Alt+T)
      </button>{" "}
      <button
        onClick={async () => {
          await invoke("set_locked", { locked: !locked });
          setLocked(!locked);
        }}
      >
        {locked ? "Mở khóa" : "Khóa"} phụ đề (Ctrl+Alt+L)
      </button>
      <p>Ctrl+Alt+H: ẩn/hiện phụ đề.</p>
      <label>
        <input
          type="checkbox"
          checked={accessory}
          onChange={async (e) => {
            await invoke("set_accessory", { accessory: e.target.checked });
            setAccessory(e.target.checked);
          }}
        />{" "}
        macOS: chạy dạng accessory (không có icon ở Dock)
      </label>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
