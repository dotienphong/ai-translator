// Giả "team" Cloudflare Access cho test: một cặp khóa RSA, JWKS tương ứng và hàm ký JWT như Access (RS256, aud là mảng).
import type { AccessJwk, AccessKeyProvider } from "../src/access-jwt";

export const TEAM = "team-test.cloudflareaccess.com";
export const AUD = "aud-app-1";

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

const text = (s: string) => new TextEncoder().encode(s);

export interface Issuer {
  kid: string;
  jwk: AccessJwk;
  /** Ký JWT. `claims` ghi đè phần mặc định (email, iss, aud, exp…); `header` ghi đè phần đầu (alg, kid). */
  sign(claims?: Record<string, unknown>, header?: Record<string, unknown>): Promise<string>;
  /** Ký đúng chuỗi JSON payload cho trước (để thử giá trị JSON.stringify không tạo ra được, như 1e400). */
  signRaw(payloadJson: string, header?: Record<string, unknown>): Promise<string>;
  /** Nguồn khóa công khai giả: chỉ biết các khóa đã nạp. */
  provider(extra?: AccessJwk[]): AccessKeyProvider;
}

export async function makeIssuer(kid = "kid-1"): Promise<Issuer> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const jwk: AccessJwk = { kty: "RSA", kid, n: pub.n as string, e: pub.e as string, alg: "RS256", use: "sig" };

  async function signRaw(payloadJson: string, header: Record<string, unknown> = {}) {
    const head = { alg: "RS256", kid, typ: "JWT", ...header };
    const input = `${b64url(text(JSON.stringify(head)))}.${b64url(text(payloadJson))}`;
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, text(input));
    return `${input}.${b64url(sig)}`;
  }

  async function sign(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    const payload = { email: "ops@example.com", iss: `https://${TEAM}`, aud: [AUD], iat: now, nbf: now, exp: now + 3600, type: "app", ...claims };
    return signRaw(JSON.stringify(payload), header);
  }

  return {
    kid,
    jwk,
    sign,
    signRaw,
    provider: (extra = []) => ({
      async get(k: string) {
        return [jwk, ...extra].find((key) => key.kid === k);
      },
    }),
  };
}

/** Đổi một ký tự trong chữ ký để làm hỏng nó mà vẫn là base64url hợp lệ. */
export function corruptSignature(token: string): string {
  const i = token.lastIndexOf(".") + 1;
  const swap = token[i] === "A" ? "B" : "A";
  return token.slice(0, i) + swap + token.slice(i + 1);
}

export { b64url, text };
