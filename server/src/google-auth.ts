// Đăng nhập bằng Google (spec 2026-11-05 §3, §5.1, §5.7): dựng URL xin quyền, đổi code lấy id_token, kiểm id_token (chữ ký RS256
// theo JWKS của Google, iss, aud, exp, nonce, email_verified). Chỉ dùng Web Crypto, không thêm thư viện.
// Secret (client secret, code, verifier) và id_token không bao giờ vào thông điệp lỗi hay log: GoogleAuthError chỉ mang mã lý do.

import { b64urlDecode, sha256Hex, timingSafeEqual } from "./crypto";
import type { ApiEnv } from "./env";

/** Redirect URI đăng ký ở Google Cloud: cố định, không dùng tên miền cũ aitranslator.io.vn (spec §5.7). */
export const GOOGLE_REDIRECT_URI = "https://api.aitranslator.vn/v1/auth/google/callback";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const TIMEOUT_MS = 10_000;
/** Không có Cache-Control thì giữ JWKS 5 phút; giới hạn max-age trong [60 giây, 24 giờ] để header lạ không làm cache vô nghĩa hay vĩnh viễn. */
const DEFAULT_JWKS_TTL = 300;
const MIN_JWKS_TTL = 60;
const MAX_JWKS_TTL = 86_400;

export interface GoogleIdentity {
  sub: string;
  email: string;
}

export type GoogleAuthFailure = "exchange_failed" | "bad_id_token" | "email_unverified" | "nonce_mismatch" | "jwks_unavailable";

export class GoogleAuthError extends Error {
  override name = "GoogleAuthError";

  constructor(readonly reason: GoogleAuthFailure) {
    // Thông điệp chỉ là mã lý do: không có chỗ nào để lọt code, verifier, secret hay id_token.
    super(`đăng nhập Google thất bại: ${reason}`);
  }
}

export interface GoogleAuth {
  /** URL trang xin quyền của Google (người dùng mở bằng trình duyệt hệ thống). */
  authUrl(p: { state: string; nonce: string; codeChallenge: string }): string;
  /**
   * Đổi code lấy id_token rồi kiểm; ném GoogleAuthError khi sai. `nonceHash` là sha256Hex của nonce đã đưa vào authUrl
   * (login_attempts chỉ lưu băm, spec §4): so với sha256Hex(nonce trong id_token).
   */
  exchange(p: { code: string; codeVerifier: string; nonceHash: string }): Promise<GoogleIdentity>;
}

/** Phần công khai RSA của một khóa trong JWKS (modulus và exponent, base64url). */
interface RsaPublicParts {
  n: string;
  e: string;
}

interface JwksCache {
  keys: Map<string, RsaPublicParts>;
  /** Giây Unix; trước mốc này thì dùng được, từ mốc này phải lấy lại. */
  expiresAt: number;
}

/**
 * Cache dùng chung của cả isolate: Deps dựng lại ở mỗi request nên cache theo từng RealGoogleAuth sẽ không bao giờ trúng.
 * Chỉ dùng khi không tiêm `fetch` (tức bản thật); test tiêm fetch giả thì mỗi đối tượng có cache riêng, không rò giữa các test.
 */
const sharedCache: { value: JwksCache | null } = { value: null };

export class RealGoogleAuth implements GoogleAuth {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly cache: { value: JwksCache | null };

  /** `now` trả giây Unix (cùng đơn vị với Deps.now). */
  constructor(o: { clientId: string; clientSecret: string; redirectUri: string; fetch?: typeof fetch; now?: () => number }) {
    this.clientId = o.clientId;
    this.clientSecret = o.clientSecret;
    this.redirectUri = o.redirectUri;
    this.fetchImpl = o.fetch ?? ((input, init) => fetch(input, init));
    this.now = o.now ?? (() => Math.floor(Date.now() / 1000));
    this.cache = o.fetch ? { value: null } : sharedCache;
  }

  authUrl(p: { state: string; nonce: string; codeChallenge: string }): string {
    const q = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "openid email",
      state: p.state,
      nonce: p.nonce,
      code_challenge: p.codeChallenge,
      code_challenge_method: "S256",
      // Luôn hiện màn hình chọn tài khoản: kẻ tấn công tự gọi start rồi gửi login_url thật cho nạn nhân; Google bỏ qua màn hình tương tác
      // (phiên đang mở, đã cấp quyền trước đó) thì một cú bấm là hoàn tất đăng nhập và kẻ tấn công hỏi poll lấy token và email của nạn nhân.
      prompt: "select_account",
    });
    return `${AUTH_URL}?${q.toString()}`;
  }

  async exchange(p: { code: string; codeVerifier: string; nonceHash: string }): Promise<GoogleIdentity> {
    const idToken = await this.fetchIdToken(p.code, p.codeVerifier);
    return this.verifyIdToken(idToken, p.nonceHash);
  }

  private async fetchIdToken(code: string, codeVerifier: string): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Không theo chuyển hướng: thân yêu cầu có client secret.
        redirect: "manual",
      });
    } catch {
      throw new GoogleAuthError("exchange_failed");
    }
    if (!res.ok) throw new GoogleAuthError("exchange_failed");
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new GoogleAuthError("exchange_failed");
    }
    const idToken = isRecord(body) ? body.id_token : undefined;
    if (typeof idToken !== "string" || idToken === "") throw new GoogleAuthError("exchange_failed");
    return idToken;
  }

  private async verifyIdToken(idToken: string, expectedNonceHash: string): Promise<GoogleIdentity> {
    const parts = idToken.split(".");
    if (parts.length !== 3) throw new GoogleAuthError("bad_id_token");
    const [headB64, payloadB64, sigB64] = parts as [string, string, string];

    let header: unknown;
    let payload: unknown;
    let signature: Uint8Array;
    try {
      header = JSON.parse(new TextDecoder().decode(b64urlDecode(headB64)));
      payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
      signature = b64urlDecode(sigB64);
    } catch {
      throw new GoogleAuthError("bad_id_token");
    }
    // Chỉ nhận RS256 (Google ký bằng RS256): alg "none" hay HS256 không bao giờ được bỏ qua hay đổi cách kiểm chữ ký.
    if (!isRecord(header) || header.alg !== "RS256" || typeof header.kid !== "string" || !isRecord(payload)) {
      throw new GoogleAuthError("bad_id_token");
    }

    const jwk = await this.findKey(header.kid);
    if (!jwk) throw new GoogleAuthError("bad_id_token");
    let valid = false;
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      valid = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        signature as Uint8Array<ArrayBuffer>,
        new TextEncoder().encode(`${headB64}.${payloadB64}`),
      );
    } catch {
      valid = false;
    }
    if (!valid) throw new GoogleAuthError("bad_id_token");

    // Chữ ký đúng mới tin các trường bên trong.
    if (typeof payload.iss !== "string" || !ISSUERS.includes(payload.iss)) throw new GoogleAuthError("bad_id_token");
    if (payload.aud !== this.clientId) throw new GoogleAuthError("bad_id_token");
    if (typeof payload.exp !== "number" || !(payload.exp > this.now())) throw new GoogleAuthError("bad_id_token");
    if (typeof payload.sub !== "string" || payload.sub === "") throw new GoogleAuthError("bad_id_token");
    // So băm với băm (cùng hàm sha256Hex route dùng khi lưu), thời gian không phụ thuộc nội dung; thiếu nonce cũng là nonce_mismatch.
    if (typeof payload.nonce !== "string" || !timingSafeEqual(await sha256Hex(payload.nonce), expectedNonceHash)) {
      throw new GoogleAuthError("nonce_mismatch");
    }
    if (typeof payload.email !== "string" || payload.email === "") throw new GoogleAuthError("bad_id_token");
    if (payload.email_verified !== true) throw new GoogleAuthError("email_unverified");
    return { sub: payload.sub, email: payload.email };
  }

  /**
   * Khóa công khai theo `kid`. Cache còn hạn mà không có kid thì lấy JWKS lại đúng một lần (Google xoay khóa) rồi mới coi là
   * không có; cache trống hay hết hạn thì lần lấy đầu đã là bản mới nên không lấy thêm.
   */
  private async findKey(kid: string): Promise<RsaPublicParts | undefined> {
    let cached = this.cache.value;
    if (cached && cached.expiresAt > this.now()) {
      const hit = cached.keys.get(kid);
      if (hit) return hit;
    }
    cached = await this.loadJwks();
    return cached.keys.get(kid);
  }

  private async loadJwks(): Promise<JwksCache> {
    let res: Response;
    try {
      res = await this.fetchImpl(JWKS_URL, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
    } catch {
      throw new GoogleAuthError("jwks_unavailable");
    }
    if (!res.ok) throw new GoogleAuthError("jwks_unavailable");
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new GoogleAuthError("jwks_unavailable");
    }
    const list = isRecord(body) && Array.isArray(body.keys) ? body.keys : [];
    const keys = new Map<string, RsaPublicParts>();
    for (const k of list) {
      if (isRecord(k) && k.kty === "RSA" && typeof k.kid === "string" && typeof k.n === "string" && typeof k.e === "string") {
        keys.set(k.kid, { n: k.n, e: k.e });
      }
    }
    if (keys.size === 0) throw new GoogleAuthError("jwks_unavailable");
    const entry: JwksCache = { keys, expiresAt: this.now() + jwksTtl(res.headers.get("cache-control")) };
    this.cache.value = entry;
    return entry;
  }
}

function jwksTtl(cacheControl: string | null): number {
  const m = /max-age=(\d+)/i.exec(cacheControl ?? "");
  const ttl = m?.[1] ? Number(m[1]) : DEFAULT_JWKS_TTL;
  return Math.min(MAX_JWKS_TTL, Math.max(MIN_JWKS_TTL, ttl));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Cổng Google thật của Worker API; thiếu client id hay secret thì null (đăng nhập tắt: server mở cổng, không ai bị khóa). */
export function googleFromEnv(env: Pick<ApiEnv, "GOOGLE_OAUTH_CLIENT_ID" | "GOOGLE_OAUTH_CLIENT_SECRET">): GoogleAuth | null {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) return null;
  return new RealGoogleAuth({
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: GOOGLE_REDIRECT_URI,
  });
}
