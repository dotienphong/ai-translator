// License key (§10.2): 27 ký tự ngẫu nhiên (135 bit) theo bảng Crockford base32, cộng 1 ký tự kiểm tra.
// Ký tự kiểm tra theo thuật toán Luhn mod 32 trên bảng này: bắt mọi lỗi thay một ký tự, và mọi lỗi
// đảo hai ký tự kề nhau trừ cặp 0↔Z. App (kế hoạch 06) tính lại y hệt để báo gõ sai trước khi gọi server;
// vector mẫu ở test/vectors/token-v1.json.
// Hiển thị: 7 nhóm 4 ký tự nối bằng "-". Lưu trong D1: 28 ký tự, không gạch nối.
import { randomBytes } from "./crypto";

export const KEY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BODY_LENGTH = 27;
const N = KEY_ALPHABET.length;

/** Luhn mod N: từ phải sang trái, nhân đôi ký tự thứ 1, 3, 5…, cộng các "chữ số" cơ số N của từng tích. */
export function luhnCheckChar(body: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    const product = factor * KEY_ALPHABET.indexOf(body.charAt(i));
    sum += Math.floor(product / N) + (product % N);
    factor = factor === 2 ? 1 : 2;
  }
  return KEY_ALPHABET.charAt((N - (sum % N)) % N);
}

export function generateLicenseKey(): string {
  // 256 chia hết cho 32 nên lấy 5 bit thấp của mỗi byte vẫn phân bố đều.
  const body = Array.from(randomBytes(BODY_LENGTH), (b) => KEY_ALPHABET.charAt(b & 31)).join("");
  return body + luhnCheckChar(body);
}

export function formatLicenseKey(key: string): string {
  return key.match(/.{1,4}/g)?.join("-") ?? key;
}

/**
 * Chuẩn hóa key người dùng gõ: bỏ khoảng trắng và gạch nối, viết hoa, đổi O→0, I và L→1.
 * Trả về 28 ký tự dạng lưu trữ, hoặc null nếu sai độ dài, sai ký tự hay sai ký tự kiểm tra.
 */
export function normalizeLicenseKey(input: string): string | null {
  if (input.length > 64) return null;
  const key = input.replace(/[\s-]/g, "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
  if (key.length !== BODY_LENGTH + 1) return null;
  for (const ch of key) if (!KEY_ALPHABET.includes(ch)) return null;
  return luhnCheckChar(key.slice(0, BODY_LENGTH)) === key.slice(BODY_LENGTH) ? key : null;
}
