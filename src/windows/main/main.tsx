import "../../styles/main.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { translate } from "../../i18n";
import { App } from "./App";
import { appStore, fallbackLanguage } from "./appStore";
import { transcriptStore } from "./dataStores";
import { modelsStore } from "./modelsStore";
import { licenseStore } from "./licenseStore";

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

// Bản chép lời nghe sự kiện phụ đề từ lúc mở cửa sổ, kể cả khi màn hình Bản chép lời chưa mở.
transcriptStore
  .getState()
  .init()
  .catch((e: unknown) => console.error("không đọc được bản chép lời", e));

// Quản lý model (kế hoạch 04): lỗi ở đây chỉ ghi log, phần còn lại của cửa sổ vẫn dùng được.
modelsStore
  .getState()
  .init()
  .catch((e: unknown) => console.error("không khởi tạo được quản lý model", e));
// Bản quyền và hạn mức nghe sự kiện từ lúc mở cửa sổ: màn hình chính, thanh báo và nhóm Bản quyền dùng chung.
licenseStore
  .getState()
  .init()
  .catch((e: unknown) => console.error("không đọc được bản quyền", e));

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
