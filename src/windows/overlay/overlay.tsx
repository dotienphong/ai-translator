import "./overlay.css";
import { StrictMode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useStore } from "zustand";
import { translate } from "../../i18n";
import { type ResizeEdge, tauriIpc as ipc } from "../../lib/ipc";
import { atBottom, pagedScrollTop } from "../../lib/overlayScroll";
import {
  HEARING_RMS,
  TEXT_COLORS,
  dateTime,
  lineView,
  localOffsetMinutes,
  overlayBackground,
  overlayNotes,
} from "../../lib/subtitleView";
import { createOverlayStore, createResizeDrag } from "../../store/overlay";

const store = createOverlayStore(ipc);
// Thuộc tính `lang` của trang theo ngôn ngữ giao diện, để trình đọc màn hình đọc đúng giọng.
store.subscribe((state) => {
  if (state.view) document.documentElement.lang = state.view.uiLanguage;
});
void store.getState().init();

// Vùng kéo cạnh và góc để đổi kích thước (§4.4, cả macOS lẫn Windows), chỉ khi chưa khóa. Bấm giữ thì phía Rust đổi kích
// thước theo con trỏ (`createResizeDrag`). Vùng này không phải vùng kéo di chuyển (`data-tauri-drag-region="false"`).
const EDGES: readonly [string, ResizeEdge][] = [
  ["n", "north"],
  ["s", "south"],
  ["e", "east"],
  ["w", "west"],
  ["ne", "northEast"],
  ["nw", "northWest"],
  ["se", "southEast"],
  ["sw", "southWest"],
];

const drag = createResizeDrag(ipc);

function ResizeEdges() {
  return (
    <>
      {EDGES.map(([cls, edge]) => (
        <div
          key={cls}
          className={`edge ${cls}`}
          data-tauri-drag-region="false"
          aria-hidden="true"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.begin(edge);
          }}
          onPointerMove={() => drag.move()}
          onPointerUp={() => drag.end()}
          onPointerCancel={() => drag.end()}
          onLostPointerCapture={() => drag.end()}
        />
      ))}
    </>
  );
}

// Thanh phụ đề (§4.4): mọi câu của phiên (tối đa `MAX_LINES`) trong một vùng cuộn, bản dịch hiện dần, phụ đề tạm màu nhạt hơn,
// câu gốc chữ nhỏ ở trên nếu bật. Đang ở đáy thì tự theo câu mới; cuộn lên xem câu cũ thì dừng theo, hiện nút "Mới nhất" để
// về đáy. Cuộn bằng con lăn hay trackpad (chỉ khi chưa khóa, vì khóa thì chuột xuyên qua) hoặc bằng hai phím tắt cuộn lên
// xuống (`overlay://scroll`, dùng được cả khi khóa).
// Chỉ báo nhỏ ở góc trên: chấm "đang nghe" (sáng khi có tiếng), và các lời nhắc (đang nạp model, không có âm thanh,
// đang trễ, dịch không khả dụng, hết hạn mức, lỗi). Màu chữ, màu nền và độ mờ nền theo Cài đặt › Phụ đề (§4.3).
// Khi chưa khóa: kéo được cả thanh (`data-tauri-drag-region="deep"`), kéo cạnh để đổi kích thước, và rê chuột vào thì hiện
// nút ✕ ở góc trên bên phải (ẩn thanh như phím tắt, phiên dịch vẫn chạy). Khi khóa thì click xuyên qua (phía Rust đặt),
// không có nút nào (§4.4). Nâng gói, xem lỗi ở cửa sổ chính.
function Overlay() {
  const view = useStore(store, (s) => s.view);
  const lines = useStore(store, (s) => s.lines);
  const status = useStore(store, (s) => s.status);
  const level = useStore(store, (s) => s.level);
  const scroller = useRef<HTMLDivElement>(null);
  // `follow` (ref) để các hàm cuộn đọc ngay; `following` (state) để vẽ nút "Mới nhất".
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const syncFollow = () => {
    const el = scroller.current;
    if (!el) return;
    follow.current = atBottom(el);
    setFollowing(follow.current);
  };
  // Có câu mới hay cỡ chữ đổi mà đang theo thì giữ ở đáy. Ghi `scrollTop` đồng bộ trước khi vẽ, để không thấy giật.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [lines, view?.fontSize, view?.showSource]);
  // Kéo cạnh đổi chiều cao thanh: vẫn giữ ở đáy nếu đang theo.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (follow.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [view !== null]);
  // Phím tắt cuộn từ phía Rust.
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void ipc.listen("overlay://scroll", (direction) => {
      const el = scroller.current;
      if (el) el.scrollTo({ top: pagedScrollTop(el, direction), behavior: "smooth" });
    }).then((unlisten) => (cancelled ? unlisten() : (off = unlisten)));
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);
  if (!view) return null;
  const t = (key: Parameters<typeof translate>[1]) => translate(view.uiLanguage, key);
  const notes = overlayNotes(status);
  const running = status?.session === "running";
  const hearing = running && level >= HEARING_RMS;
  return (
    <div
      className={view.locked ? "overlay" : "overlay unlocked"}
      data-tauri-drag-region={view.locked ? undefined : "deep"}
      style={{
        fontSize: view.fontSize,
        color: TEXT_COLORS[view.textColor] ?? TEXT_COLORS.white,
        background: overlayBackground(view.background, view.opacity),
      }}
    >
      {!view.locked && (
        <button
          type="button"
          className="hide"
          data-tauri-drag-region="false"
          aria-label={t("overlay.hide")}
          title={t("overlay.hide")}
          onClick={() => void ipc.invoke("hide_overlay").catch(() => {})}
        >
          ✕
        </button>
      )}
      <div className="indicators" role="status">
        {running && (
          <span
            className={hearing ? "dot hearing" : "dot"}
            role="img"
            aria-label={t(hearing ? "overlay.hearing" : "overlay.listening")}
          />
        )}
        {notes.map((n) => (
          <span key={n} className={`note ${n}`}>
            {n === "quotaExhausted" && status?.quotaResetAt != null
              ? translate(view.uiLanguage, "overlay.note.quotaExhausted.reset", {
                  time: dateTime(status.quotaResetAt * 1000, localOffsetMinutes(status.quotaResetAt * 1000)),
                })
              : t(`overlay.note.${n}`)}
          </span>
        ))}
      </div>
      <div className="lines" ref={scroller} onScroll={syncFollow}>
        {lines.length === 0 && notes.length === 0 && <div className="waiting">{t("overlay.waiting")}</div>}
        {lines.map((l) => {
          const v = lineView(l, view.showSource);
          const classes = ["line", v.kind, v.provisional ? "provisional" : ""].filter(Boolean).join(" ");
          return (
            <div key={l.id} className={classes}>
              {v.source && <div className="source">{v.source}</div>}
              <div className="main">
                {v.kind === "dropped" ? t("subtitle.dropped") : v.main}
                {v.kind === "failed" && <span className="tag">{t("subtitle.failed")}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {!following && (
        <button
          type="button"
          className="latest"
          data-tauri-drag-region="false"
          onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })}
        >
          ↓ {t("overlay.latest")}
        </button>
      )}
      {!view.locked && <ResizeEdges />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
