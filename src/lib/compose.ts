import type { ComposeMainScreen, ComposeOutcome } from "./ipc";

// Phần thuần của ô soạn Gõ dịch (spec 2026-10-17-go-dich §1.2, §1.3, §5): phím nào làm gì, bản dịch nào đang hiện, nút nào của
// hộp lỗi mở màn hình nào.

export interface ComposeKey {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  // Bộ gõ đang chọn chữ (tiếng Nhật, Trung, Hàn…): Enter chỉ chốt chữ của bộ gõ. Safari báo `keyCode` 229 thay cho cờ này.
  isComposing: boolean;
  keyCode: number;
}

// Việc của một lần bấm phím trong ô gõ: Enter (không kèm phím bổ trợ) là dán hay dịch lại, Esc là đóng; Shift+Enter để ô gõ
// tự xuống dòng; mọi phím khi bộ gõ đang chọn chữ thuộc về bộ gõ (spec §1.3).
export function keyAction(e: ComposeKey): "enter" | "escape" | null {
  if (e.isComposing || e.keyCode === 229) return null;
  if (e.key === "Escape") return "escape";
  if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) return "enter";
  return null;
}

export interface Shown {
  text: string;
  // Chưa khớp chữ đang có (đang chờ hay đang dịch): hiện mờ.
  stale: boolean;
}

// Bản dịch đang hiện (spec §1.2): kết quả của đúng chữ đang có thì hiện rõ (đã là ngôn ngữ đích thì là chính chữ đó); đang dịch
// thì hiện phần đã về theo từng dòng (dòng trống của chữ đã gửi giữ nguyên); chưa về gì thì hiện bản dịch đủ gần nhất, mờ.
export function shownTranslation(s: {
  text: string;
  request: { id: number; text: string } | null;
  lines: readonly string[];
  outcome: ComposeOutcome | null;
  previous: string;
}): Shown {
  const current = s.request !== null && s.request.text === s.text;
  if (current && s.outcome?.kind === "translated") return { text: s.outcome.text, stale: false };
  if (current && s.outcome?.kind === "sameLanguage") return { text: s.text, stale: false };
  if (s.request && s.lines.length > 0) {
    const text = s.request.text
      .split("\n")
      .map((line, i) => (line.trim() === "" ? line : (s.lines[i] ?? "")))
      .join("\n");
    return { text, stale: true };
  }
  return { text: s.previous, stale: true };
}

// Nút của hộp lỗi (spec §5): lỗi về model mở Cài đặt › Model; hết dùng thử mở Nâng cấp; lỗi của key mở Cài đặt › Bản quyền; lỗi
// của bộ dịch mở cửa sổ chính; dòng quá dài hay dịch hỏng thì không có nút (sửa chữ hay Enter dịch lại).
export function errorScreen(code: string): ComposeMainScreen | null {
  if (code.startsWith("model")) return "models";
  if (code === "trialEnded") return "upgrade";
  if (code.startsWith("license")) return "license";
  if (code.startsWith("sidecar") || code === "composeUnavailable") return "home";
  return null;
}

// Tổ hợp dán của hệ điều hành, để ghi trong lời nhắc.
export function pasteKeys(platform: "macos" | "windows"): string {
  return platform === "macos" ? "⌘V" : "Ctrl+V";
}
