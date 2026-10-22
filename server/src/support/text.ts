// Kiểm và chuẩn hóa input của chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo-design.md §2.2; hợp đồng ở kế hoạch 00).
import { b64urlEncode, randomBytes } from "../crypto";

export type Lang = "vi" | "en" | "ja" | "zh" | "ko";
export type Source = "web" | "app" | "app-debug";

const LANGS: readonly string[] = ["vi", "en", "ja", "zh", "ko"];
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
 * Nội dung một tin: đổi xuống dòng về `\n`, tab thành dấu cách, bỏ ký tự điều khiển khác, bỏ khoảng trắng hai đầu. Rỗng hay dài
 * hơn `max` ký tự thì null.
 */
export function parseText(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== "string") return null;
  const text = v
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
    .trim();
  const length = Array.from(text).length;
  return length >= 1 && length <= max ? text : null;
}

export function parseLang(v: unknown): Lang | null {
  return typeof v === "string" && LANGS.includes(v) ? (v as Lang) : null;
}

export function parseSource(v: unknown): Source | null {
  return typeof v === "string" && SOURCES.includes(v) ? (v as Source) : null;
}

/** Trang lúc mở chat (chỉ web): phải bắt đầu bằng đúng một `/`; bỏ `?…`, `#…`, khoảng trắng và ký tự điều khiển; tối đa 200 ký tự. */
export function parsePage(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//")) return null;
  const path = (v.split(/[?#]/, 1)[0] ?? "").replace(/[\u0000- \u007f-\u009f]/g, "");
  return path.length > 0 ? clip(path, MAX_PAGE) : null;
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
