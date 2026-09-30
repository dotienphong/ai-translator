import { listen } from "@tauri-apps/api/event";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

type Subtitle = { id: number; src_text: string; tgt_text: string; provisional: boolean };

// Thanh phụ đề: hiện 3 dòng gần nhất, phụ đề tạm màu nhạt hơn (spec §4.4).
function Overlay() {
  const [lines, setLines] = useState<Subtitle[]>([]);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const offSubtitle = listen<Subtitle>("subtitle://upsert", (e) =>
      setLines((prev) => [...prev.filter((l) => l.id !== e.payload.id), e.payload].slice(-3)),
    );
    const offLocked = listen<boolean>("overlay://locked", (e) => setLocked(e.payload));
    return () => {
      offSubtitle.then((f) => f());
      offLocked.then((f) => f());
    };
  }, []);

  return (
    <div
      data-tauri-drag-region={locked ? undefined : true}
      style={{
        height: "100vh",
        boxSizing: "border-box",
        padding: "8px 16px",
        borderRadius: 12,
        background: "rgba(0, 0, 0, 0.62)",
        color: "white",
        fontFamily: "system-ui",
        fontSize: 22,
        cursor: locked ? "default" : "move",
        outline: locked ? "none" : "1px dashed rgba(255,255,255,0.4)",
      }}
    >
      {lines.map((l) => (
        <div key={l.id} style={{ opacity: l.provisional ? 0.6 : 1 }}>
          <div style={{ fontSize: 13, opacity: 0.75 }}>{l.src_text}</div>
          <div>{l.tgt_text}</div>
        </div>
      ))}
    </div>
  );
}

document.body.style.margin = "0";
document.body.style.background = "transparent";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
