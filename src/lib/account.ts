import type { AccountView } from "./ipc";

// Tài khoản Google ở phía giao diện (spec 2026-11-05-dang-nhap-google). Chỉ nhận dạng và ánh xạ mã lỗi; không có logic đăng nhập.

// Mã lỗi của các lệnh `account_*` (`account::flow::AccountError::code`) và của lệnh bắt đầu dịch khi cổng đang chặn
// (`errors::LOGIN_REQUIRED`). Phải khớp phía Rust.
export const ACCOUNT_ERROR_CODES = [
  "accountNetwork",
  "accountDenied",
  "accountFailed",
  "accountExpired",
  "accountCancelled",
  "accountBusy",
  "accountUnavailable",
  "accountStorage",
  "loginRequired",
] as const;

export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[number];
export type AccountErrorKey = `error.${AccountErrorCode}` | "error.unknown";

// Khóa câu báo lỗi (`error.<mã>`) của một mã lỗi tài khoản; mã lạ thì dùng câu chung. Chữ của các khóa ở từ điển i18n.
export function accountErrorKey(code: string): AccountErrorKey {
  return (ACCOUNT_ERROR_CODES as readonly string[]).includes(code) ? (`error.${code}` as AccountErrorKey) : "error.unknown";
}

// Dữ liệu từ ngoài (kết quả lệnh, payload sự kiện) có đúng hình dạng `AccountView` không; sai thì bỏ, không để làm hỏng store.
export function isAccountView(value: unknown): value is AccountView {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.state === "anonymous" || v.state === "signingIn" || v.state === "signedIn") &&
    (v.email === null || typeof v.email === "string") &&
    typeof v.gate === "boolean"
  );
}
