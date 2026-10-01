// Ghi và hiển thị phím tắt ở nhóm Cài đặt "Phím tắt" (F10). Phía Rust đọc lại, chuẩn hóa về dạng
// "Ctrl+Alt+T" và kiểm hợp lệ, trùng, đăng ký được hay không (`src-tauri/src/hotkeys.rs`).

export interface KeyInput {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

// Chuỗi phím tắt từ một lần bấm phím, theo `KeyboardEvent.code` (không phụ thuộc bố cục bàn phím).
// Trả `null` khi mới chỉ bấm phím bổ trợ.
export function acceleratorFromEvent(e: KeyInput): string | null {
  if (MODIFIER_CODES.has(e.code) || e.code === "") return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  parts.push(e.code);
  return parts.join("+");
}

export type RecorderStep = { kind: "cancel" } | { kind: "ignore" } | { kind: "submit"; accelerator: string };

// Việc cần làm với một lần bấm phím lúc đang ghi phím tắt mới. Giữ phím (lặp phím) thì bỏ qua, kể cả Esc; Esc thì
// hủy, kể cả khi đang chờ; đang chờ phía Rust kiểm phím vừa gửi thì bỏ qua phím khác, để không gửi hai lệnh chồng nhau.
export function recorderStep(e: KeyInput & { repeat: boolean }, sending: boolean): RecorderStep {
  if (e.repeat) return { kind: "ignore" };
  if (e.code === "Escape") return { kind: "cancel" };
  if (sending) return { kind: "ignore" };
  const accelerator = acceleratorFromEvent(e);
  return accelerator ? { kind: "submit", accelerator } : { kind: "ignore" };
}

const MAC_SYMBOLS: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Super: "⌘" };
const WINDOWS_NAMES: Record<string, string> = { Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Super: "Win" };

// Tên hiển thị của phím chính. Cài đặt vẫn lưu tên W3C (`ArrowUp`, `Backquote`); chỉ phần hiện ra đổi.
// Phím không có trong bảng (`F1`…`F24`, `Space`, `Tab`, chữ, số) hiện đúng tên đã lưu.
const KEY_NAMES: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Backquote: "`",
  Equal: "=",
  Minus: "-",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Escape: "Esc",
};

// Hiển thị phím tắt dạng chuẩn: macOS "⌃⌥T", Windows "Ctrl+Alt+T".
export function formatAccelerator(accelerator: string, platform: "macos" | "windows"): string {
  const parts = accelerator.split("+");
  const code = parts.pop() ?? "";
  const key = KEY_NAMES[code] ?? code;
  if (platform === "macos") return parts.map((m) => MAC_SYMBOLS[m] ?? m).join("") + key;
  return [...parts.map((m) => WINDOWS_NAMES[m] ?? m), key].join("+");
}
