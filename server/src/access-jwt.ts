// Xác thực JWT của Cloudflare Access trong Worker (header `Cf-Access-Jwt-Assertion`).
// Cần vì Worker có Static Assets chạy sau một router nội bộ của Cloudflare, router này không chuyển `ctx.access` cho Worker
// của mình (developers.cloudflare.com/workers/configuration/cloudflare-access). Header JWT vẫn đến nơi, và chữ ký của nó
// chống giả mạo: request không qua Access không thể có JWT hợp lệ, kể cả khi tự đặt header.
//
// Chấp nhận khi và chỉ khi: RS256, ký bằng khóa trong JWKS của team (`https://<team>/cdn-cgi/access/certs`), `iss` đúng
// team, `aud` chứa audience tag của ứng dụng, chưa hết hạn, và có `email` (service token không có email thì bị từ chối,
// vì nhật ký phải ghi được người vận hành).

export interface AccessJwk {
  kty: string;
  kid: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

/** Nguồn khóa công khai của team. `get` ném lỗi khi không lấy được JWKS (lỗi mạng, trả lời hỏng): người gọi phải từ chối. */
export interface AccessKeyProvider {
  get(kid: string): Promise<AccessJwk | undefined>;
}

export type AccessJwtFailure =
  | "jwt_malformed"
  | "jwt_alg"
  | "jwt_kid_unknown"
  | "jwks_unavailable"
  | "jwt_signature"
  | "jwt_iss"
  | "jwt_aud"
  | "jwt_expired"
  | "jwt_not_yet"
  | "no_email";

export type AccessJwtResult = { ok: true; email: string } | { ok: false; reason: AccessJwtFailure };

/** JWT của Access dài khoảng 1 KiB; chặn sớm chuỗi quá lớn trước khi giải mã. */
const MAX_TOKEN_LENGTH = 8192;
/** Cho phép đồng hồ lệch tối đa ngần này giây với `nbf`. `exp` không có độ lệch: hết hạn là hết. */
const NBF_SKEW_SECONDS = 30;
const KEY_TTL_MS = 60 * 60 * 1000;
const REFETCH_MIN_MS = 60 * 1000;

const SEGMENT = /^[A-Za-z0-9_-]+$/;

function decodeSegment(segment: string): Uint8Array | null {
  if (!SEGMENT.test(segment)) return null;
  try {
    const std = segment.replaceAll("-", "+").replaceAll("_", "/");
    const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeJson(segment: string): Record<string, unknown> | null {
  const bytes = decodeSegment(segment);
  if (!bytes) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const fail = (reason: AccessJwtFailure): AccessJwtResult => ({ ok: false, reason });

export async function verifyAccessJwt(
  token: string,
  opts: { teamDomain: string; aud: string; keys: AccessKeyProvider; nowSeconds: number },
): Promise<AccessJwtResult> {
  if (token.length > MAX_TOKEN_LENGTH) return fail("jwt_malformed");
  const parts = token.split(".");
  if (parts.length !== 3) return fail("jwt_malformed");
  const [headSeg, payloadSeg, sigSeg] = parts as [string, string, string];
  const header = decodeJson(headSeg);
  const payload = decodeJson(payloadSeg);
  const signature = decodeSegment(sigSeg);
  if (!header || !payload || !signature) return fail("jwt_malformed");
  if (header.alg !== "RS256") return fail("jwt_alg");
  if (typeof header.kid !== "string" || header.kid === "") return fail("jwt_kid_unknown");

  let jwk: AccessJwk | undefined;
  try {
    jwk = await opts.keys.get(header.kid);
  } catch {
    return fail("jwks_unavailable");
  }
  if (!jwk) return fail("jwt_kid_unknown");

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(`${headSeg}.${payloadSeg}`));
  } catch {
    valid = false;
  }
  if (!valid) return fail("jwt_signature");

  // Chữ ký đúng từ đây: các claim là do Access phát hành, kiểm xem token có dành cho ứng dụng này không.
  if (payload.iss !== `https://${opts.teamDomain}`) return fail("jwt_iss");
  const aud = payload.aud;
  const audList = typeof aud === "string" ? [aud] : Array.isArray(aud) ? aud : [];
  if (opts.aud === "" || !audList.includes(opts.aud)) return fail("jwt_aud");
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return fail("jwt_malformed");
  if (opts.nowSeconds >= payload.exp) return fail("jwt_expired");
  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf)) return fail("jwt_malformed");
    if (opts.nowSeconds + NBF_SKEW_SECONDS < payload.nbf) return fail("jwt_not_yet");
  }
  const email = payload.email;
  if (typeof email !== "string" || email === "") return fail("no_email");
  return { ok: true, email };
}

function usableKeys(body: unknown): AccessJwk[] {
  const list = (body as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (k): k is AccessJwk =>
      k !== null &&
      typeof k === "object" &&
      (k as AccessJwk).kty === "RSA" &&
      typeof (k as AccessJwk).kid === "string" &&
      (k as AccessJwk).kid !== "" &&
      typeof (k as AccessJwk).n === "string" &&
      typeof (k as AccessJwk).e === "string",
  );
}

/**
 * Nguồn khóa công khai của một team Access: tải `https://<team>/cdn-cgi/access/certs`, nhớ trong 1 giờ (Access xoay khóa
 * chậm, có thời gian chồng lấn). Gặp `kid` lạ thì tải lại để thử, nhưng không quá một lần mỗi phút (chặn kẻ gửi token kid
 * ngẫu nhiên bắt Worker tải liên tục). Hết hạn mà tải lại lỗi thì không dùng khóa cũ: ném lỗi, người gọi từ chối request.
 */
export function createAccessKeyProvider(
  teamDomain: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): AccessKeyProvider {
  let keys: AccessJwk[] = [];
  let fetchedAt = Number.NEGATIVE_INFINITY;
  let lastAttempt = Number.NEGATIVE_INFINITY;
  let inflight: Promise<void> | null = null;

  async function load(): Promise<void> {
    const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`access_certs_${res.status}`);
    const fresh = usableKeys(await res.json());
    if (fresh.length === 0) throw new Error("access_certs_empty");
    keys = fresh;
    fetchedAt = now();
  }

  function refresh(): Promise<void> {
    lastAttempt = now();
    inflight ??= load().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  const find = (kid: string) => (now() - fetchedAt < KEY_TTL_MS ? keys.find((k) => k.kid === kid) : undefined);

  return {
    async get(kid) {
      const hit = find(kid);
      if (hit) return hit;
      if (inflight) await inflight;
      else if (now() - lastAttempt >= REFETCH_MIN_MS) await refresh();
      return find(kid);
    },
  };
}

const sharedProviders = new Map<string, AccessKeyProvider>();

/** Nguồn khóa dùng chung trong isolate cho một team (mặc định của Worker admin). */
export function sharedAccessKeys(teamDomain: string): AccessKeyProvider {
  let provider = sharedProviders.get(teamDomain);
  if (!provider) {
    provider = createAccessKeyProvider(teamDomain);
    sharedProviders.set(teamDomain, provider);
  }
  return provider;
}
