// Tiện ích HTTP: đọc và kiểm input (§10.2 "kiểm tra mọi input"), trả lỗi theo một dạng chung.
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "invalid_request"
  | "invalid_key"
  | "license_revoked"
  | "license_expired"
  | "license_locked"
  | "device_limit"
  | "activation_not_found"
  | "order_not_found"
  | "invalid_signature"
  | "rate_limited"
  | "pricing_not_configured"
  | "trial_not_configured"
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

export function clientIp(c: Context): string {
  return c.req.header("cf-connecting-ip") ?? "unknown";
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
