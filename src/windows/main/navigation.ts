import type { IconName } from "../../components/Icon";
import type { Screen } from "../../lib/ipc";

// Thứ tự các mục của thanh điều hướng bên trái (cửa sổ chính, §4.3) và biểu tượng của từng mục. "compose" (Gõ dịch) nằm ngay dưới
// Màn hình chính, ngang hàng Cài đặt (spec 2026-11-02-tach-go-dich-thanh-tab); "voice" (Giọng đọc) ngay dưới Gõ dịch (spec
// 2026-11-04-giong-doc §7). Nhãn mỗi mục là khóa `nav.<mục>` của i18n.
export const SCREENS: readonly Screen[] = [
  "home",
  "compose",
  "voice",
  "transcript",
  "history",
  "glossary",
  "settings",
  "upgrade",
  "support",
  "about",
];

export const ICONS: Record<Screen, IconName> = {
  home: "home",
  compose: "keyboard",
  voice: "speaker",
  transcript: "transcript",
  history: "history",
  glossary: "glossary",
  settings: "settings",
  upgrade: "upgrade",
  support: "support",
  about: "about",
};

const WITHOUT_VOICE: readonly Screen[] = SCREENS.filter((s) => s !== "voice");

// Các mục hiện trên thanh điều hướng: giọng đọc bản dịch chỉ có ở bản Windows, nên macOS không có mục Giọng đọc.
export function visibleScreens(platform: "macos" | "windows"): readonly Screen[] {
  return platform === "windows" ? SCREENS : WITHOUT_VOICE;
}
