// Phụ thuộc bên ngoài của route: đồng hồ, cổng thanh toán, email, khóa ký. Test thay bằng bản giả.
import { raiseAlert } from "./alerts";
import { type EmailProvider, EmailProviderError, maskEmail } from "./email/provider";
import { ResendEmailProvider } from "./email/resend";
import { type LicenseEmailEntry, type LicenseEmailKind, licenseEmail } from "./email/templates";
import type { ApiEnv } from "./env";
import { PayOSProvider } from "./payment/payos";
import type { PaymentProvider } from "./payment/provider";
import { importSigningKey, type KeyCheck, type SigningKey, signToken } from "./token";

export interface Deps {
  now(): number;
  /** Cổng thanh toán theo tên (orders.provider). Thêm cổng mới chỉ cần thêm vào map này (§6.8). */
  payments: Record<string, PaymentProvider>;
  email: EmailProvider;
  signingKey(): Promise<SigningKey>;
}

export type DepsFactory = (env: ApiEnv) => Deps;

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

type KeyEnv = Pick<ApiEnv, "TOKEN_SIGNING_SLOT" | "TOKEN_SIGNING_KEY_A" | "TOKEN_SIGNING_KEY_B" | "ENVIRONMENT">;

/**
 * Hai ô khóa ký (QĐ29): TOKEN_SIGNING_SLOT chọn ô đang ký ("active"), ô còn lại là khóa dự phòng ("next").
 * Tên theo ô, không theo vai (spec §10.2): đổi khóa là đổi TOKEN_SIGNING_SLOT, không chép khóa giữa hai secret.
 */
export function signingSlots(env: Pick<ApiEnv, "TOKEN_SIGNING_SLOT">): { active: "a" | "b"; next: "a" | "b" } {
  if (env.TOKEN_SIGNING_SLOT === "a") return { active: "a", next: "b" };
  if (env.TOKEN_SIGNING_SLOT === "b") return { active: "b", next: "a" };
  throw new Error('TOKEN_SIGNING_SLOT phải là "a" hoặc "b"');
}

export async function loadSigningKey(env: KeyEnv, role: "active" | "next" = "active"): Promise<SigningKey & { slot: string }> {
  const slot = signingSlots(env)[role];
  const key = await importSigningKey(slot === "a" ? env.TOKEN_SIGNING_KEY_A : env.TOKEN_SIGNING_KEY_B);
  if (env.ENVIRONMENT !== "test" && key.kid.startsWith("test-")) {
    throw new Error("khóa test-* chỉ dùng được khi ENVIRONMENT=test");
  }
  return { ...key, slot };
}

/** Mã băm máy toàn số 0: không máy thật nào có, nên token ký thử không kích hoạt được máy nào. */
const NO_DEVICE = "0".repeat(64);
const NO_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Ký thử một token bằng khóa dự phòng (spec §6.8, §10.2; QĐ31), để người vận hành kiểm khóa công khai
 * trong keys/public-keys.json khớp khóa riêng mà không cần đọc secret. Token không dùng được làm bản quyền:
 * hết hạn ngay lúc ký (expires_at = refresh_before = issued_at) và gắn với máy không tồn tại.
 */
export async function signKeyCheck(env: KeyEnv, now: number): Promise<KeyCheck> {
  const [active, next] = await Promise.all([loadSigningKey(env, "active"), loadSigningKey(env, "next")]);
  if (active.kid === next.kid) throw new Error(`hai ô khóa có cùng kid ${next.kid}`);
  const token = await signToken(next, {
    kid: next.kid,
    license_id: NO_ID,
    activation_id: NO_ID,
    activation_created_at: now,
    device_id_hash: NO_DEVICE,
    plan: "monthly",
    expires_at: now,
    cycle_anchor: now,
    quota_minutes_per_cycle: 1,
    quota_epoch: 0,
    quota_fresh: false,
    issued_at: now,
    refresh_before: now,
  });
  return { slot: next.slot, kid: next.kid, token };
}

export function payosFromEnv(env: Pick<ApiEnv, "PAYOS_BASE_URL" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY">) {
  return new PayOSProvider({
    baseUrl: env.PAYOS_BASE_URL,
    clientId: env.PAYOS_CLIENT_ID,
    apiKey: env.PAYOS_API_KEY,
    checksumKey: env.PAYOS_CHECKSUM_KEY,
  });
}

export function realDeps(env: ApiEnv): Deps {
  let key: Promise<SigningKey> | undefined;
  return {
    now: nowSeconds,
    payments: { payos: payosFromEnv(env) },
    email: new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO }),
    signingKey: () => (key ??= loadSigningKey(env)),
  };
}

export interface MailResult {
  ok: boolean;
  /** Lỗi vĩnh viễn (Resend trả 400 hoặc 422): không gửi lại. */
  permanent: boolean;
}

/**
 * Gửi email chứa key. Resend báo idempotency key đã dùng (409 invalid_idempotent_request) thì coi là đã gửi.
 * Lỗi thì ghi log và (nếu `alert`) tạo cảnh báo email_failed; key vẫn lấy được qua
 * GET /v1/orders, recover hay admin, và cron gửi lại thư mua hàng gặp lỗi tạm (orders.ts, retryUnsentEmails).
 */
export async function sendLicenseMail(
  db: D1Database,
  deps: Pick<Deps, "email" | "now">,
  to: string,
  kind: LicenseEmailKind,
  entries: LicenseEmailEntry[],
  opts: { idempotencyKey?: string; alert?: boolean } = {},
): Promise<MailResult> {
  const { subject, text } = licenseEmail(kind, entries);
  try {
    const key = opts.idempotencyKey;
    await deps.email.send(key ? { to, subject, text, idempotencyKey: key } : { to, subject, text });
    return { ok: true, permanent: false };
  } catch (err) {
    if (err instanceof EmailProviderError && err.alreadySent) {
      console.warn(JSON.stringify({ event: "email_already_sent", kind, to: maskEmail(to) }));
      return { ok: true, permanent: false };
    }
    const permanent = err instanceof EmailProviderError && err.permanent;
    console.error(JSON.stringify({ event: "email_failed", kind, to: maskEmail(to), permanent, error: String(err) }));
    if (opts.alert ?? true) await raiseAlert(db, "email_failed", deps.now());
    return { ok: false, permanent };
  }
}
