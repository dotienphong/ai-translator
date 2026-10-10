// Tiện ích HTTP: đọc và kiểm input (§10.2 "kiểm tra mọi input"), trả lỗi theo một dạng chung.
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "invalid_request"
  | "invalid_key"
  | "license_revoked"
  | "license_expired"
  | "license_locked"
  | "key_in_use"
  | "license_conflict"
  | "activation_not_found"
  | "order_not_found"
  | "invalid_signature"
  | "rate_limited"
  | "pricing_not_configured"
  | "trial_not_configured"
  | "releases_not_configured"
  | "payment_provider_error"
  | "temporarily_unavailable"
  | "order_code_exhausted"
  | "unsupported_media_type"
  | "key_check_failed"
  | "forbidden"
  | "not_found"
  | "internal";

export function fail(c: Context, status: ContentfulStatusCode, error: ErrorCode, extra: Record<string, unknown> = {}) {
  return c.json({ error, ...extra }, status);
}

export function tooMany(c: Context, retryAfter: number) {
  c.header("retry-after", String(retryAfter));
  return fail(c, 429, "rate_limited");
}

/**
 * Chủ thể của giới hạn tần suất theo IP. IPv4 giữ nguyên địa chỉ; IPv6 gộp về prefix /64, vì một máy (VPS, mạng nhà)
 * thường có cả dải /64 và đổi địa chỉ trong dải là vượt được mọi giới hạn đếm theo địa chỉ đầy đủ (kiểm toán bảo mật
 * 2026-10-09). `CF-Connecting-IP` do Cloudflare ghi, client không giả được.
 */
export function clientIp(c: Context): string {
  const ip = c.req.header("cf-connecting-ip");
  return ip === undefined ? "unknown" : ipBucket(ip);
}

/** IPv6 → `xxxx:xxxx:xxxx:xxxx::/64` (chữ thường, bỏ số 0 đầu); IPv4 hay chuỗi không đọc được thì giữ nguyên. */
export function ipBucket(ip: string): string {
  if (!ip.includes(":") || ip.includes(".")) return ip;
  const halves = ip.toLowerCase().split("::");
  if (halves.length > 2) return ip;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return ip;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}

/**
 * Request ghi của API công khai phải là `application/json` (cho phép `; charset=…`). Không bắt buộc thì một trang web bất
 * kỳ gửi được "simple request" (`text/plain`, không preflight) từ trình duyệt của người truy cập: làm IP của họ bị chặn
 * vì sai key, hay mượn IP của họ để spam (kiểm toán bảo mật 2026-10-09). App gửi `application/json` từ bản đầu tiên.
 */
export function isJsonContentType(value: string | undefined): boolean {
  return /^application\/json\s*(;|$)/i.test(value ?? "");
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Body phải là object JSON; sai thì null (route trả 400). Giới hạn kích thước do bodyLimit ở app.ts. */
export async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export function parseEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const email = v.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export function parseDeviceIdHash(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? v : null;
}

/** Tên máy: bỏ ký tự điều khiển, cắt còn 64 ký tự. Rỗng thì null. */
export function parseDeviceLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const label = Array.from(v.replace(/[\u0000-\u001f\u007f]/g, "").trim()).slice(0, 64).join("");
  return label.length > 0 ? label : null;
}

export function parseUuid(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) ? v : null;
}
