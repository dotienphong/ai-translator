// Bộ phát hiện dữ liệu nhạy cảm còn sót trong báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §2, §3). App đã che trước
// khi gửi; server KHÔNG tin điều đó: mọi chuỗi của báo cáo qua đây một lần nữa, khớp thì từ chối (422), không lưu.
// Bộ mẫu dùng chung với app (Rust) qua test/vectors/scrub-v1.json: sửa mẫu ở đây thì sửa vector và bản Rust cùng lúc.
// Chỉ dùng cấu trúc regex có ở cả JavaScript và crate `regex` của Rust (không lookahead, lookbehind, backreference), và mọi lượng
// từ có cận trên để chuỗi dài (một dòng log 24 KiB) không làm regex chạy theo cấp bình phương.

export type SensitiveRule = "license_key" | "token" | "bearer" | "authorization" | "email" | "home_path";

/** License key: 28 ký tự Crockford base32, hiển thị 7 nhóm 4 ký tự nối bằng "-" (src/license-key.ts). */
const KEY_GROUPED = /\b(?:[0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}\b/;
const KEY_PLAIN = /\b[0-9A-HJKMNP-TV-Z]{28}\b/;
/** Token bản quyền: `v1.<base64url>.<base64url>` (src/token.ts). */
const TOKEN = /\bv1\.[A-Za-z0-9_-]{16,2048}\.[A-Za-z0-9_-]{16,2048}/;
const BEARER = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,2048}/i;
/** Giá trị đã che bắt đầu bằng "<", nên `Authorization: <redacted>` không khớp. */
const AUTHORIZATION = /\bauthorization\s*[:=]\s*[^\s<]/i;
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/;
/** Nhóm bắt là tên thư mục người dùng: `/Users/<tên>/…` hay `/home/<tên>/…`. */
const UNIX_HOME = /(?:^|[^A-Za-z0-9_])\/(?:Users|home)\/([^/\s"'<>:*?|\\]{1,128})/g;
const WINDOWS_HOME = /[A-Za-z]:[\\/]{1,4}Users[\\/]{1,4}([^\\/\s"'<>:*?|]{1,128})/gi;
/** Thư mục không phải của một người (so không phân biệt hoa thường; `All Users` bị cắt ở khoảng trắng nên là `all`). */
const NEUTRAL_HOME_NAMES = new Set(["shared", "public", "default", "all"]);

function hasPersonalHome(text: string): boolean {
  for (const pattern of [UNIX_HOME, WINDOWS_HOME]) {
    for (const m of text.matchAll(pattern)) {
      if (!NEUTRAL_HOME_NAMES.has((m[1] ?? "").toLowerCase())) return true;
    }
  }
  return false;
}

/** Quy tắc đầu tiên khớp (thứ tự: key, token, Bearer, Authorization, email, đường dẫn home), hoặc null nếu sạch. */
export function findSensitive(text: string): SensitiveRule | null {
  if (KEY_GROUPED.test(text) || KEY_PLAIN.test(text)) return "license_key";
  if (TOKEN.test(text)) return "token";
  if (BEARER.test(text)) return "bearer";
  if (AUTHORIZATION.test(text)) return "authorization";
  if (EMAIL.test(text)) return "email";
  if (hasPersonalHome(text)) return "home_path";
  return null;
}
