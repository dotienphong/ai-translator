import "../../styles/main.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { translate } from "../../i18n";
import { App } from "./App";
import { appStore, fallbackLanguage } from "./appStore";

// Giao diện sáng/tối và thuộc tính `lang` theo cài đặt, đổi ngay khi cài đặt đổi.
appStore.subscribe((state) => {
  const settings = state.settings;
  if (!settings) return;
  const root = document.documentElement;
  if (settings.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  root.lang = settings.uiLanguage;
});

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Không đọc được cài đặt hay trạng thái (lệnh bị chặn, phía Rust lỗi) thì hiện câu báo theo ngôn ngữ của hệ
// điều hành, thay vì để cửa sổ trắng trơn.
appStore
  .getState()
  .init()
  .catch((e: unknown) => {
    console.error("không khởi tạo được cửa sổ chính", e);
    document.documentElement.lang = fallbackLanguage;
    root.render(
      <StrictMode>
        <main className="onboarding">
          <p role="alert">{translate(fallbackLanguage, "app.loadFailed")}</p>
        </main>
      </StrictMode>,
    );
  });
