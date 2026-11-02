import type { IconName } from "../../components/Icon";
import type { Screen } from "../../lib/ipc";

// Thứ tự các mục của thanh điều hướng bên trái (cửa sổ chính, §4.3) và biểu tượng của từng mục. "compose" (Gõ dịch) nằm ngay dưới
// Màn hình chính, ngang hàng Cài đặt (spec 2026-11-02-tach-go-dich-thanh-tab). Nhãn mỗi mục là khóa `nav.<mục>` của i18n.
export const SCREENS: readonly Screen[] = ["home", "compose", "transcript", "history", "glossary", "settings", "upgrade", "support", "about"];

export const ICONS: Record<Screen, IconName> = {
  home: "home",
  compose: "keyboard",
  transcript: "transcript",
  history: "history",
  glossary: "glossary",
  settings: "settings",
  upgrade: "upgrade",
  support: "support",
  about: "about",
};
