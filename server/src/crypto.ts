// Hàm mã hóa dùng chung, chỉ dựa vào Web Crypto của Workers (không cần thư viện ngoài).

const encoder = new TextEncoder();

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Giải base64url dạng chuẩn: không padding, bit thừa ở ký tự cuối phải bằng 0.
 * Chuỗi khác dạng chuẩn thì ném lỗi, khớp với crate `base64` của Rust (URL_SAFE_NO_PAD) mà app dùng (Đ9).
 */
export function b64urlDecode(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error("base64url không hợp lệ");
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  if (b64urlEncode(bytes) !== text) throw new Error("base64url không ở dạng chuẩn");
  return bytes;
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const input = typeof data === "string" ? encoder.encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  return bytesToHex(await sha256(data));
}

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message))));
}

/** So sánh hai chuỗi trong thời gian không phụ thuộc nội dung (dùng cho chữ ký và mã băm token). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.byteLength !== y.byteLength) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}
