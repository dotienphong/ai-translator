// Kiểm và chuẩn hóa input của chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo-design.md §2.2; hợp đồng ở kế hoạch 00).
import { b64urlEncode, randomBytes } from "../crypto";

export { type Lang, parseLang } from "../lang";
export type Source = "web" | "app" | "app-debug";

const SOURCES: readonly string[] = ["web", "app", "app-debug"];

/** Độ dài tối đa một tin của khách (ký tự, đếm theo code point). */
export const MAX_TEXT = 1000;
/** Độ dài tối đa một tin gửi qua Zalo Bot (`sendMessage` nhận 1–2000 ký tự), cũng là trần một câu trả lời của chủ dự án. */
export const ZALO_MAX_TEXT = 2000;
/** Bảng chữ của mã cuộc chat: 32 ký tự, bỏ 0, 1, I, O để đọc không nhầm. 256 chia hết cho 32 nên `byte & 31` không lệch. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 3;
const MAX_PAGE = 200;
const MAX_CONTEXT = 300;

/** Giữ tối đa `max` ký tự đầu (code point). */
function clip(text: string, max: number): string {
  return Array.from(text).slice(0, max).join("");
}

/** Cắt còn tối đa `max` ký tự (code point); bị cắt thì ký tự cuối là `…`. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

/**
 * Cắt còn tối đa `max` đơn vị UTF-16 (`.length`), theo code point nên không cắt đôi cặp surrogate; bị cắt thì ký tự cuối là `…`.
 * Dùng cho tin gửi Zalo: chưa biết Zalo đếm 2000 ký tự theo code point hay theo UTF-16, nên giữ an toàn theo cách chặt hơn.
 */
export function fitUtf16(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = "";
  for (const ch of text) {
    if (out.length + ch.length > max - 1) break;
    out += ch;
  }
  return `${out}…`;
}

/**
 * Nội dung một tin: đổi xuống dòng về `\n`, tab thành dấu cách, bỏ ký tự điều khiển khác, bỏ khoảng trắng hai đầu. Rỗng hay dài
 * hơn `max` ký tự thì null.
 */
export function parseText(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== "string") return null;
  const text = v
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    // Ký tự điều khiển hướng chữ (đổi chiều hiển thị để giả nội dung). Không đụng U+200D: ZWJ nối emoji ghép.
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
    .trim();
  const length = Array.from(text).length;
  return length >= 1 && length <= max ? text : null;
}

export function parseSource(v: unknown): Source | null {
  return typeof v === "string" && SOURCES.includes(v) ? (v as Source) : null;
}

/**
 * Trang lúc mở chat (chỉ web): phải bắt đầu bằng đúng một `/`; bỏ `?…`, `#…`, khoảng trắng và ký tự điều khiển; tối đa 200 ký tự.
 * Kiểm SAU khi bỏ ký tự: "/\t/x" thành "//x" và "/\\x" (trình duyệt hiểu là `//x`) là URL ngoài, không phải đường dẫn.
 */
export function parsePage(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith("/")) return null;
  const path = (v.split(/[?#]/, 1)[0] ?? "").replace(/[\u0000- \u007f-\u009f]/g, "");
  return /^\/(?![/\\])/.test(path) ? clip(path, MAX_PAGE) : null;
}

/** Dòng thông tin máy (chỉ app): ký tự điều khiển thành dấu cách, gộp khoảng trắng, tối đa 300 ký tự. Rỗng thì null. */
export function parseContext(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = clip(v.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim(), MAX_CONTEXT).trim();
  return text.length > 0 ? text : null;
}

/** Token mới của cuộc chat: 32 byte ngẫu nhiên, base64url (43 ký tự). */
export function newToken(): string {
  return b64urlEncode(randomBytes(32));
}

export function isTokenShape(v: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(v);
}

/** Mã cuộc chat ngẫu nhiên (có thể trùng: store.ts sinh lại khi trùng). */
export function newCode(): string {
  return Array.from(randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET.charAt(b & 31)).join("");
}
