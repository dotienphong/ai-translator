import "../../styles/tokens.css";
import "./compose.css";
import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useStore } from "zustand";
import { type MessageKey, type Params, errorKey, htmlLang, translate } from "../../i18n";
import { errorScreen, keyAction, pasteKeys, shownTranslation } from "../../lib/compose";
import { type ComposeMainScreen, tauriIpc as ipc } from "../../lib/ipc";
import { createComposeStore } from "../../store/compose";

const store = createComposeStore(ipc);
// Ngôn ngữ của trang (WebView chọn font CJK theo thuộc tính này) và giao diện sáng/tối theo Cài đặt › Chung; "system" thì theo
// hệ điều hành (`tokens.css`).
store.subscribe((state) => {
  if (!state.view) return;
  const root = document.documentElement;
  root.lang = htmlLang(state.view.uiLanguage);
  if (state.view.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = state.view.theme;
});
void store.getState().init();

// Ô gõ tự cao lên tối đa chừng này dòng rồi cuộn trong ô (spec 2026-10-17-go-dich §1.2).
const MAX_INPUT_LINES = 6;

function fit(el: HTMLTextAreaElement) {
  const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 22;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, line * MAX_INPUT_LINES)}px`;
}

// Nhãn nút của hộp lỗi theo màn hình nó mở (spec §5).
const OPEN_LABEL: Record<ComposeMainScreen, MessageKey> = {
  models: "compose.open.models",
  upgrade: "compose.open.upgrade",
  license: "compose.open.license",
  home: "compose.open.home",
};

// Ô soạn Gõ dịch (spec §1.2, §1.3): dòng đầu ghi ngôn ngữ đang dịch sang và trạng thái; ô gõ nhiều dòng; bản dịch (mờ khi chưa
// khớp chữ đang có); chân ô là gợi ý phím, hay hộp lỗi (kèm nút mở đúng màn hình), hay hộp quyền Trợ năng (macOS). Enter dán,
// Shift+Enter xuống dòng, Esc đóng; Enter khi bộ gõ đang chọn chữ thuộc về bộ gõ. Chiều cao cửa sổ theo nội dung.
function Compose() {
  const s = useStore(store);
  const input = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // Mỗi lần mở: con trỏ vào ô gõ, bản nháp chọn sẵn để gõ đè được ngay.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    fit(el);
    el.focus();
    el.select();
  }, [s.opened]);
  // Chiều cao cửa sổ theo nội dung, mỗi khung hình nhiều nhất một lần; phía Rust giữ trong khoảng 120–420 px.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = Math.ceil(el.getBoundingClientRect().height);
        void ipc.invoke("compose_resize", { height }).catch(() => {});
      });
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [s.view !== null]);
  // Esc ở bất kỳ đâu trong ô soạn, kể cả khi focus đang ở một nút.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      e.preventDefault();
      store.getState().escape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!s.view) return null;
  const view = s.view;
  const t = (key: MessageKey, params?: Params) => translate(view.uiLanguage, key, params);
  const lang = t(`lang.${view.target}`);
  const keys = pasteKeys(view.platform);
  const current = s.request?.text === s.text;
  const error = view.blocked ?? (current && s.outcome?.kind === "failed" ? s.outcome.code : null);
  const screen = error ? errorScreen(error) : null;
  const shown = shownTranslation(s);
  const status = s.loading
    ? t("compose.loading")
    : s.waiting || s.pendingSubmit
      ? t("compose.translating")
      : current && s.outcome?.kind === "sameLanguage"
        ? t("compose.sameLanguage", { lang })
        : "";
  return (
    <div ref={root} className="compose">
      <header>
        <span className="title">
          {t("compose.title")} · → {lang}
        </span>
        <span className="status" aria-live="polite">
          {status}
        </span>
      </header>
      <textarea
        ref={input}
        rows={1}
        maxLength={4000}
        value={s.text}
        placeholder={t("compose.placeholder")}
        aria-label={t("compose.title")}
        onChange={(e) => {
          fit(e.currentTarget);
          s.setText(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          const action = keyAction({
            key: e.key,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            isComposing: e.nativeEvent.isComposing,
            keyCode: e.keyCode,
          });
          // Esc do listener của cửa sổ lo.
          if (action !== "enter") return;
          e.preventDefault();
          s.enter();
        }}
      />
      {shown.text !== "" && (
        <div className={shown.stale ? "translation stale" : "translation"} aria-label={t("compose.translation")}>
          {shown.text}
        </div>
      )}
      {s.permission ? (
        <div className="box" role="status">
          <p>{t("compose.permission")}</p>
          <p className="hint">{t("compose.permission.next", { keys })}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={s.allowAutoPaste}>
              {t("compose.permission.allow")}
            </button>
            <button type="button" onClick={s.copyOnly}>
              {t("compose.permission.copyOnly")}
            </button>
          </div>
        </div>
      ) : error ? (
        <div className="box error" role="alert">
          <p>{t(errorKey(error))}</p>
          {screen && (
            <div className="actions">
              <button type="button" onClick={() => s.openMain(screen)}>
                {t(OPEN_LABEL[screen])}
              </button>
            </div>
          )}
        </div>
      ) : (
        <footer>{view.autoPaste ? t("compose.hint.paste") : t("compose.hint.copy", { keys })}</footer>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Compose />
  </StrictMode>,
);
