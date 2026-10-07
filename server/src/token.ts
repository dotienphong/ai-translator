// Token bản quyền ký Ed25519 (spec §6.8, §10.2). Định dạng v1, dùng chung với app (kế hoạch 06, Đ9):
//   v1.<base64url(JSON claims)>.<base64url(chữ ký Ed25519 trên chuỗi ASCII "v1.<payload>")>
// Chữ ký phủ đúng chuỗi payload đã mã hóa, nên bên kiểm không cần dựng lại JSON.
// Vector mẫu: test/vectors/token-v1.json (sinh bằng scripts/gen-token-vectors.mjs).
import { b64urlDecode, b64urlEncode } from "./crypto";

export const TOKEN_VERSION = "v1";
/** Mã gói trả phí (spec 2026-10-07 §1). Token bản quyền chỉ mang một trong hai mã này; Free có token dùng thử riêng. */
export const PLAN_CODES = ["monthly", "yearly"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export const REFRESH_WINDOW_SECONDS = 14 * 86400;
const KID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const encoder = new TextEncoder();
// fatal: UTF-8 hỏng là malformed. ignoreBOM: true giữ BOM lại trong chuỗi, để JSON.parse từ chối payload có BOM.
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export interface TokenClaims {
  kid: string;
  license_id: string;
  activation_id: string;
  /** Lúc tạo activation (giây Unix). App dùng để nhận ra activation cũ được dùng lại (QĐ35). */
  activation_created_at: number;
  device_id_hash: string;
  plan: PlanCode;
  expires_at: number;
  /** Mốc chu kỳ hạn mức 30 ngày (§6.8). */
  cycle_anchor: number;
  /** Hạn mức mỗi chu kỳ, tính bằng phút; null là không giới hạn (Yearly). */
  quota_minutes_per_cycle: number | null;
  /** Số của bộ đếm hạn mức trên máy; admin tăng để máy bắt đầu bộ đếm mới (QĐ35). */
  quota_epoch: number;
  /**
   * true khi token cấp trong 15 phút sau mốc muộn nhất của: lúc tạo activation, lúc cấp token đầu tiên sau khi
   * admin tăng quota_epoch, và anchor_applied_at của license (QĐ35). App dùng để phân biệt bộ đếm mới thật với
   * bộ đếm bị mất.
   */
  quota_fresh: boolean;
  issued_at: number;
  refresh_before: number;
}

export interface SigningKey {
  kid: string;
  key: CryptoKey;
}

/** Kết quả "ký thử bằng khóa dự phòng" (QĐ31): ô khóa, kid và token không dùng được làm bản quyền. */
export interface KeyCheck {
  slot: string;
  kid: string;
  token: string;
}

export type VerifyError =
  | "malformed"
  | "unknown_kid"
  | "bad_signature"
  | "wrong_device"
  | "license_expired"
  | "refresh_expired";

export type VerifyResult = { ok: true; claims: TokenClaims } | { ok: false; error: VerifyError };

/** Token dùng thử của Free (spec 2026-10-07 §3.1): gắn với máy, hiệu lực trong [started_at, ends_at). */
export interface TrialClaims {
  typ: "trial";
  kid: string;
  device_id_hash: string;
  started_at: number;
  ends_at: number;
  issued_at: number;
}

export type TrialVerifyError = "malformed" | "unknown_kid" | "bad_signature" | "wrong_device";
export type TrialVerifyResult = { ok: true; claims: TrialClaims } | { ok: false; error: TrialVerifyError };

/** Đọc secret TOKEN_SIGNING_KEY_A hoặc _B: JWK Ed25519 có `d`, `x` và `kid`. */
export async function importSigningKey(jwkJson: string): Promise<SigningKey> {
  let jwk: Record<string, unknown>;
  try {
    jwk = JSON.parse(jwkJson) as Record<string, unknown>;
  } catch {
    throw new Error("khóa ký không phải JSON");
  }
  const { kty, crv, d, x, kid } = jwk;
  if (kty !== "OKP" || crv !== "Ed25519" || typeof d !== "string" || typeof x !== "string") {
    throw new Error("khóa ký không phải khóa riêng Ed25519");
  }
  if (typeof kid !== "string" || !KID_PATTERN.test(kid)) throw new Error("khóa ký thiếu kid hợp lệ");
  const key = await crypto.subtle.importKey("jwk", { kty, crv, d, x }, { name: "Ed25519" }, false, ["sign"]);
  return { kid, key };
}

async function signClaims(signingKey: SigningKey, ordered: object): Promise<string> {
  const signingInput = `${TOKEN_VERSION}.${b64urlEncode(encoder.encode(JSON.stringify(ordered)))}`;
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, signingKey.key, encoder.encode(signingInput));
  return `${signingInput}.${b64urlEncode(new Uint8Array(signature))}`;
}

export async function signToken(signingKey: SigningKey, claims: TokenClaims): Promise<string> {
  // Thứ tự trường cố định để token sinh lại được y hệt vector.
  const ordered: TokenClaims = {
    kid: claims.kid,
    license_id: claims.license_id,
    activation_id: claims.activation_id,
    activation_created_at: claims.activation_created_at,
    device_id_hash: claims.device_id_hash,
    plan: claims.plan,
    expires_at: claims.expires_at,
    cycle_anchor: claims.cycle_anchor,
    quota_minutes_per_cycle: claims.quota_minutes_per_cycle,
    quota_epoch: claims.quota_epoch,
    quota_fresh: claims.quota_fresh,
    issued_at: claims.issued_at,
    refresh_before: claims.refresh_before,
  };
  return signClaims(signingKey, ordered);
}

export async function signTrialToken(signingKey: SigningKey, claims: TrialClaims): Promise<string> {
  // Thứ tự trường cố định, như signToken.
  const ordered: TrialClaims = {
    typ: "trial",
    kid: claims.kid,
    device_id_hash: claims.device_id_hash,
    started_at: claims.started_at,
    ends_at: claims.ends_at,
    issued_at: claims.issued_at,
  };
  return signClaims(signingKey, ordered);
}

function parseClaims(json: unknown): TokenClaims | null {
  if (typeof json !== "object" || json === null) return null;
  const c = json as Record<string, unknown>;
  // Token bản quyền không có `typ`; có `typ` (token dùng thử hay loại sau này) là sai loại.
  if (Object.hasOwn(c, "typ")) return null;
  const strings = ["kid", "license_id", "activation_id", "device_id_hash"] as const;
  const integers = ["activation_created_at", "expires_at", "cycle_anchor", "issued_at", "refresh_before"] as const;
  for (const k of strings) if (typeof c[k] !== "string") return null;
  for (const k of integers) if (!Number.isSafeInteger(c[k])) return null;
  if (!(PLAN_CODES as readonly unknown[]).includes(c.plan)) return null;
  const quota = c.quota_minutes_per_cycle;
  if (quota !== null && !(Number.isSafeInteger(quota) && (quota as number) > 0)) return null;
  if (!Number.isSafeInteger(c.quota_epoch) || (c.quota_epoch as number) < 0) return null;
  if (typeof c.quota_fresh !== "boolean") return null;
  return c as unknown as TokenClaims;
}

type Checked<T> = { ok: true; claims: T } | { ok: false; error: "malformed" | "unknown_kid" | "bad_signature" };

/** Phần chung của hai bộ kiểm: định dạng (theo `parse`), kid, rồi chữ ký. */
async function checkSigned<T extends { kid: string }>(
  token: string,
  publicKeys: Record<string, string>,
  parse: (json: unknown) => T | null,
): Promise<Checked<T>> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return { ok: false, error: "malformed" };
  const [, payload = "", sig = ""] = parts;
  let claims: T | null;
  let signature: Uint8Array;
  try {
    claims = parse(JSON.parse(decoder.decode(b64urlDecode(payload))));
    signature = b64urlDecode(sig);
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (!claims || signature.byteLength !== 64) return { ok: false, error: "malformed" };
  const publicKey = Object.hasOwn(publicKeys, claims.kid) ? publicKeys[claims.kid] : undefined;
  if (publicKey === undefined) return { ok: false, error: "unknown_kid" };
  const key = await crypto.subtle.importKey("raw", b64urlDecode(publicKey), { name: "Ed25519" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    signature,
    encoder.encode(`${TOKEN_VERSION}.${payload}`),
  );
  if (!valid) return { ok: false, error: "bad_signature" };
  return { ok: true, claims };
}

/**
 * Kiểm token như app sẽ kiểm (kế hoạch 06), theo thứ tự: định dạng (đủ trường, đúng kiểu, không có `typ`, `plan` là
 * một trong các mã gói, `quota_minutes_per_cycle` là null hoặc số nguyên dương, `quota_fresh` là boolean), kid, chữ ký,
 * máy, `expires_at`, rồi `refresh_before`. Hết hạn khi `now >= expires_at` hoặc `now >= refresh_before`.
 * `publicKeys` ánh xạ kid sang khóa công khai (32 byte, base64url).
 */
export async function verifyToken(
  token: string,
  publicKeys: Record<string, string>,
  opts: { now: number; deviceIdHash: string },
): Promise<VerifyResult> {
  const checked = await checkSigned(token, publicKeys, parseClaims);
  if (!checked.ok) return checked;
  const { claims } = checked;
  if (claims.device_id_hash !== opts.deviceIdHash) return { ok: false, error: "wrong_device" };
  if (opts.now >= claims.expires_at) return { ok: false, error: "license_expired" };
  if (opts.now >= claims.refresh_before) return { ok: false, error: "refresh_expired" };
  return { ok: true, claims };
}

function parseTrialClaims(json: unknown): TrialClaims | null {
  if (typeof json !== "object" || json === null) return null;
  const c = json as Record<string, unknown>;
  if (c.typ !== "trial") return null;
  if (typeof c.kid !== "string" || typeof c.device_id_hash !== "string") return null;
  for (const k of ["started_at", "ends_at", "issued_at"] as const) if (!Number.isSafeInteger(c[k])) return null;
  return c as unknown as TrialClaims;
}

/**
 * Kiểm token dùng thử, theo thứ tự: định dạng (`typ` là "trial", đủ trường, đúng kiểu), kid, chữ ký, máy.
 * Không kiểm thời hạn: app so `ends_at` với giờ tin được của nó (spec 2026-10-07 §3.2).
 */
export async function verifyTrialToken(
  token: string,
  publicKeys: Record<string, string>,
  opts: { deviceIdHash: string },
): Promise<TrialVerifyResult> {
  const checked = await checkSigned(token, publicKeys, parseTrialClaims);
  if (!checked.ok) return checked;
  if (checked.claims.device_id_hash !== opts.deviceIdHash) return { ok: false, error: "wrong_device" };
  return checked;
}
