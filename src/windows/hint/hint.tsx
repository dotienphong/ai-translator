import "../../styles/tokens.css";
import "./hint.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useStore } from "zustand";
import { Icon } from "../../components/Icon";
import { htmlLang, translate } from "../../i18n";
import { HINT_APP_NAMES, tauriIpc as ipc } from "../../lib/ipc";
import { createHintStore } from "../../store/hint";

const store = createHintStore(ipc);
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

// Cửa sổ gợi ý bật dịch khi có cuộc họp (spec 2026-11-01-goi-y-bat-dich-khi-hop §5): thẻ nhỏ cạnh khay hệ thống, mũi tên chỉ xuống
// khay. "Bật dịch" bắt đầu phiên; "Bỏ qua" (hay ✕) đóng, cuộc họp này không hỏi lại; "Không hỏi lại với <app>" tắt gợi ý cho app đó.
// Cửa sổ không lấy focus của app họp nên không nhận phím; chỉ bấm chuột. Chỉ biết tên app, không biết tiêu đề cuộc họp.
function Hint() {
  const view = useStore(store, (s) => s.view);
  const accept = useStore(store, (s) => s.accept);
  const dismiss = useStore(store, (s) => s.dismiss);
  if (!view?.app) return null;
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
    translate(view.uiLanguage, key, params);
  const name = HINT_APP_NAMES[view.app];
  return (
    <div className="hint" role="alertdialog" aria-labelledby="hint-title" aria-describedby="hint-body">
      <button className="close" aria-label={t("hint.close")} title={t("hint.close")} onClick={() => dismiss(false)}>
        <Icon name="x" size={14} />
      </button>
      <h1 id="hint-title">
        <Icon name="captions" size={16} />
        {t("hint.title", { app: name })}
      </h1>
      <p id="hint-body">{t("hint.body")}</p>
      <div className="actions">
        <button className="primary" onClick={accept}>
          {t("hint.accept")}
        </button>
        <button onClick={() => dismiss(false)}>{t("hint.dismiss")}</button>
      </div>
      <button className="ignore" onClick={() => dismiss(true)}>
        {t("hint.ignore", { app: name })}
      </button>
      <i className="arrow" aria-hidden="true" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Hint />
  </StrictMode>,
);
