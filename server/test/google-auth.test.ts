// Đổi code và kiểm id_token Google (spec 2026-11-05 §3, §5.1, §5.7). Khóa RSA tự sinh bằng WebCrypto, fetch giả phục vụ
// endpoint token và JWKS: không test nào gọi mạng thật.
import { describe, expect, it } from "vitest";
import { b64urlEncode, sha256Hex } from "../src/crypto";
import { GOOGLE_REDIRECT_URI, GoogleAuthError, type GoogleAuthFailure, googleFromEnv, RealGoogleAuth } from "../src/google-auth";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const CLIENT_SECRET = "GOCSPX-test-secret-khong-dung-o-dau-khac";
const NOW = 1_790_812_800;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const NONCE = "nonce-cua-lan-dang-nhap";
const CODE = "4/0AQ-code-cua-google";
const VERIFIER = "verifier-pkce-cua-worker-0123456789abcdef";

const enc = new TextEncoder();
const jsonB64 = (v: unknown) => b64urlEncode(enc.encode(JSON.stringify(v)));

interface TestKey {
  kid: string;
  privateKey: CryptoKey;
  jwk: Record<string, unknown>;
}

async function genKey(kid: string): Promise<TestKey> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return { kid, privateKey: pair.privateKey, jwk: { ...pub, kid, alg: "RS256", use: "sig" } };
}

async function signJwt(
  key: TestKey,
  payload: Record<string, unknown>,
  header: Record<string, unknown> = {},
): Promise<string> {
  const head = jsonB64({ alg: "RS256", kid: key.kid, typ: "JWT", ...header });
  const input = `${head}.${jsonB64(payload)}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key.privateKey, enc.encode(input)));
  return `${input}.${b64urlEncode(sig)}`;
}

function goodClaims(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "110169484474386276334",
    email: "nguoi.dung@example.com",
    email_verified: true,
    nonce: NONCE,
    iat: NOW - 10,
    exp: NOW + 3000,
    ...over,
  };
}

/** Google giả ở mức HTTP: endpoint token và JWKS. Ghi lại từng yêu cầu để test kiểm nội dung gửi đi. */
class FakeGoogleHttp {
  readonly tokenRequests: { url: string; method: string; contentType: string | null; params: URLSearchParams }[] = [];
  jwksCalls = 0;
  tokenStatus = 200;
  jwksStatus = 200;
  jwksCacheControl: string | null = "public, max-age=3600, must-revalidate, no-transform";
  jwksDown = false;
  tokenDown = false;
  idToken: string | undefined;
  tokenBody: unknown;
  keys: TestKey[] = [];

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    if (url === TOKEN_URL) {
      if (this.tokenDown) throw new TypeError(`fetch failed: ${url}`);
      const headers = new Headers(init.headers);
      this.tokenRequests.push({
        url,
        method: init.method ?? "GET",
        contentType: headers.get("content-type"),
        params: new URLSearchParams(String(init.body ?? "")),
      });
      if (this.tokenStatus !== 200) return Response.json({ error: "invalid_grant" }, { status: this.tokenStatus });
      const body = this.tokenBody ?? { access_token: "ya29.khong-dung", token_type: "Bearer", id_token: this.idToken };
      return Response.json(body);
    }
    if (url === JWKS_URL) {
      this.jwksCalls++;
      if (this.jwksDown) throw new TypeError(`fetch failed: ${url}`);
      const headers: Record<string, string> = {};
      if (this.jwksCacheControl) headers["cache-control"] = this.jwksCacheControl;
      if (this.jwksStatus !== 200) return new Response("lỗi", { status: this.jwksStatus, headers });
      return Response.json({ keys: this.keys.map((k) => k.jwk) }, { headers });
    }
    throw new Error(`URL ngoài dự kiến: ${url}`);
  };
}

async function setup() {
  const http = new FakeGoogleHttp();
  const key = await genKey("kid-1");
  http.keys = [key];
  const clock = { now: NOW };
  const google = new RealGoogleAuth({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: GOOGLE_REDIRECT_URI,
    fetch: http.fetch,
    now: () => clock.now,
  });
  // Route chỉ giữ nonceHash (login_attempts.nonce_hash), không giữ nonce gốc.
  const exchange = async (nonce = NONCE) => google.exchange({ code: CODE, codeVerifier: VERIFIER, nonceHash: await sha256Hex(nonce) });
  return { http, key, clock, google, exchange };
}

async function reasonOf(p: Promise<unknown>): Promise<GoogleAuthFailure> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(GoogleAuthError);
  return (err as GoogleAuthError).reason;
}

describe("RealGoogleAuth.exchange: id_token hợp lệ", () => {
  it("trả sub và email", async () => {
    const { http, key, exchange } = await setup();
    http.idToken = await signJwt(key, goodClaims());
    expect(await exchange()).toEqual({ sub: "110169484474386276334", email: "nguoi.dung@example.com" });
  });

  it("iss chấp nhận cả accounts.google.com lẫn https://accounts.google.com", async () => {
    const { http, key, exchange } = await setup();
    for (const iss of ["accounts.google.com", "https://accounts.google.com"]) {
      http.idToken = await signJwt(key, goodClaims({ iss }));
      expect((await exchange()).sub).toBe("110169484474386276334");
    }
  });

  it("yêu cầu đổi code gửi client_secret, code_verifier, code, redirect_uri và grant_type tới endpoint token", async () => {
    const { http, key, exchange } = await setup();
    http.idToken = await signJwt(key, goodClaims());
    await exchange();
    expect(http.tokenRequests).toHaveLength(1);
    const req = http.tokenRequests[0]!;
    expect(req.method).toBe("POST");
    expect(req.contentType).toContain("application/x-www-form-urlencoded");
    expect(Object.fromEntries(req.params)).toEqual({
      code: CODE,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: "https://api.aitranslator.vn/v1/auth/google/callback",
      grant_type: "authorization_code",
      code_verifier: VERIFIER,
    });
  });
});

describe("RealGoogleAuth.exchange: id_token sai", () => {
  it("sai aud: bad_id_token", async () => {
    const { http, key, exchange } = await setup();
    http.idToken = await signJwt(key, goodClaims({ aud: "client-khac.apps.googleusercontent.com" }));
    expect(await reasonOf(exchange())).toBe("bad_id_token");
  });

  it("aud là mảng (không phải chuỗi): bad_id_token", async () => {
    const { http, key, exchange } = await setup();
    http.idToken = await signJwt(key, goodClaims({ aud: [CLIENT_ID, "client-khac"] }));
    expect(await reasonOf(exchange())).toBe("bad_id_token");
  });

  it("sai iss: bad_id_token", async () => {
    const { http, key, exchange } = await setup();
    for (const iss of ["https://evil.example.com", "http://accounts.google.com", "accounts.google.com.evil.com", undefined]) {
      http.idToken = await signJwt(key, goodClaims({ iss }));
      expect(await reasonOf(exchange())).toBe("bad_id_token");
    }
  });

  it("hết hạn exp (kể cả đúng lúc exp = now): bad_id_token", async () => {
    const { http, key, exchange } = await setup();
    for (const exp of [NOW - 1, NOW, undefined, "tuong-lai"]) {
      http.idToken = await signJwt(key, goodClaims({ exp }));
      expect(await reasonOf(exchange())).toBe("bad_id_token");
    }
  });

  it("còn hạn theo đồng hồ của now() thì qua, quá hạn theo now() thì hỏng", async () => {
    const { http, key, clock, exchange } = await setup();
    http.idToken = await signJwt(key, goodClaims({ exp: NOW + 100 }));
    await exchange();
    clock.now = NOW + 101;
    expect(await reasonOf(exchange())).toBe("bad_id_token");
  });

  it("sai nonce hay thiếu nonce: nonce_mismatch", async () => {
    const { http, key, exchange } = await setup();
    for (const nonce of ["nonce-khac", "", undefined]) {
      http.idToken = await signJwt(key, goodClaims({ nonce }));
      expect(await reasonOf(exchange())).toBe("nonce_mismatch");
    }
  });

  it("id_token không có trường nonce (hay nonce không phải chuỗi): nonce_mismatch", async () => {
    const { http, key, exchange } = await setup();
    for (const nonce of [undefined, null, 12345]) {
      http.idToken = await signJwt(key, goodClaims({ nonce }));
      expect(await reasonOf(exchange())).toBe("nonce_mismatch");
    }
  });

  it("so nonce theo băm: nonceHash khớp sha256Hex(nonce) thì qua, truyền nonce gốc thay cho băm thì nonce_mismatch", async () => {
    const { http, key, google } = await setup();
    http.idToken = await signJwt(key, goodClaims());
    const ok = await google.exchange({ code: CODE, codeVerifier: VERIFIER, nonceHash: await sha256Hex(NONCE) });
    expect(ok.sub).toBe("110169484474386276334");
    expect(await reasonOf(google.exchange({ code: CODE, codeVerifier: VERIFIER, nonceHash: NONCE }))).toBe("nonce_mismatch");
    expect(await reasonOf(google.exchange({ code: CODE, codeVerifier: VERIFIER, nonceHash: "" }))).toBe("nonce_mismatch");
  });

  it("email_verified không phải true (false, thiếu, chuỗi): email_unverified", async () => {
    const { http, key, exchange } = await setup();
    for (const email_verified of [false, undefined, "true", 1]) {
      http.idToken = await signJwt(key, goodClaims({ email_verified }));
      expect(await reasonOf(exchange())).toBe("email_unverified");
    }
  });

  it("thiếu email hay thiếu sub: bad_id_token", async () => {
    const { http, key, exchange } = await setup();
    for (const over of [{ email: undefined }, { email: "" }, { sub: undefined }, { sub: "" }]) {
      http.idToken = await signJwt(key, goodClaims(over));
      expect(await reasonOf(exchange())).toBe("bad_id_token");
    }
  });

  it("chữ ký sai (sửa thân hay ký bằng khóa khác cùng kid): bad_id_token", async () => {
    const { http, key, exchange } = await setup();
    const good = await signJwt(key, goodClaims());
    const [h, , s] = good.split(".");
    http.idToken = `${h}.${jsonB64(goodClaims({ email: "ke.tan.cong@example.com" }))}.${s}`;
    expect(await reasonOf(exchange())).toBe("bad_id_token");

    const other = await genKey("kid-1");
    http.idToken = await signJwt(other, goodClaims());
    expect(await reasonOf(exchange())).toBe("bad_id_token");
  });

  it("alg khác RS256 (none, HS256): bad_id_token, không bao giờ bỏ qua kiểm chữ ký", async () => {
    const { http, key, exchange } = await setup();
    http.idToken = `${jsonB64({ alg: "none", kid: key.kid })}.${jsonB64(goodClaims())}.`;
    expect(await reasonOf(exchange())).toBe("bad_id_token");
    http.idToken = await signJwt(key, goodClaims(), { alg: "HS256" });
    expect(await reasonOf(exchange())).toBe("bad_id_token");
  });

  it("id_token không đúng dạng JWT: bad_id_token", async () => {
    const { http, exchange } = await setup();
    for (const idToken of ["rac", "a.b", "a.b.c.d", "!!!.@@@.###"]) {
      http.idToken = idToken;
      expect(await reasonOf(exchange())).toBe("bad_id_token");
    }
  });
});

describe("RealGoogleAuth: JWKS", () => {
  it("kid lạ thì gọi JWKS lại đúng một lần rồi mới thất bại", async () => {
    const { http, key, exchange } = await setup();
    http.idToken = await signJwt(key, goodClaims());
    await exchange(); // nạp cache: 1 lần gọi JWKS
    expect(http.jwksCalls).toBe(1);

    const stranger = await genKey("kid-la");
    http.idToken = await signJwt(stranger, goodClaims());
    expect(await reasonOf(exchange())).toBe("bad_id_token");
    expect(http.jwksCalls).toBe(2);
  });

  it("kid lạ ngay lần đầu (cache trống) chỉ gọi JWKS một lần, không gọi thừa lần hai", async () => {
    const { http, exchange } = await setup();
    const stranger = await genKey("kid-la");
    http.idToken = await signJwt(stranger, goodClaims());
    expect(await reasonOf(exchange())).toBe("bad_id_token");
    expect(http.jwksCalls).toBe(1);
  });

  it("Google xoay khóa: kid mới có trong JWKS lấy lại thì kiểm thành công", async () => {
    const { http, key, exchange } = await setup();
    http.idToken = await signJwt(key, goodClaims());
    await exchange();
    const rotated = await genKey("kid-2");
    http.keys = [key, rotated];
    http.idToken = await signJwt(rotated, goodClaims());
    expect((await exchange()).email).toBe("nguoi.dung@example.com");
    expect(http.jwksCalls).toBe(2);
  });

  it("cache theo max-age: trong hạn không gọi lại, quá hạn thì gọi lại", async () => {
    const { http, key, clock, exchange } = await setup();
    http.jwksCacheControl = "public, max-age=3600";
    http.idToken = await signJwt(key, goodClaims({ exp: NOW + 10_000 }));
    await exchange();
    await exchange();
    clock.now = NOW + 3599;
    await exchange();
    expect(http.jwksCalls).toBe(1);
    clock.now = NOW + 3601;
    await exchange();
    expect(http.jwksCalls).toBe(2);
  });

  it("JWKS trả 500: jwks_unavailable", async () => {
    const { http, key, exchange } = await setup();
    http.idToken = await signJwt(key, goodClaims());
    http.jwksStatus = 500;
    expect(await reasonOf(exchange())).toBe("jwks_unavailable");
  });

  it("JWKS lỗi mạng hay thân không phải JWKS: jwks_unavailable", async () => {
    const { http, key, exchange } = await setup();
    http.idToken = await signJwt(key, goodClaims());
    http.jwksDown = true;
    expect(await reasonOf(exchange())).toBe("jwks_unavailable");
    http.jwksDown = false;
    http.keys = [];
    expect(await reasonOf(exchange())).toBe("jwks_unavailable");
  });

  it("cache hết hạn mà JWKS lỗi thì jwks_unavailable, không dùng khóa cũ để bỏ qua kiểm", async () => {
    const { http, key, clock, exchange } = await setup();
    http.idToken = await signJwt(key, goodClaims({ exp: NOW + 10_000 }));
    await exchange();
    clock.now = NOW + 4000;
    http.jwksStatus = 503;
    expect(await reasonOf(exchange())).toBe("jwks_unavailable");
  });
});

describe("RealGoogleAuth: endpoint token", () => {
  it("endpoint token trả 400: exchange_failed", async () => {
    const { http, exchange } = await setup();
    http.tokenStatus = 400;
    expect(await reasonOf(exchange())).toBe("exchange_failed");
    expect(http.jwksCalls).toBe(0);
  });

  it("endpoint token lỗi mạng: exchange_failed", async () => {
    const { http, exchange } = await setup();
    http.tokenDown = true;
    expect(await reasonOf(exchange())).toBe("exchange_failed");
  });

  it("phản hồi 200 mà thiếu id_token hay không phải JSON: exchange_failed", async () => {
    const { http, exchange } = await setup();
    http.tokenBody = { access_token: "ya29.khong-dung" };
    expect(await reasonOf(exchange())).toBe("exchange_failed");
    http.tokenBody = { id_token: 123 };
    expect(await reasonOf(exchange())).toBe("exchange_failed");
  });

  it("thông điệp lỗi không chứa code, verifier, client secret hay id_token", async () => {
    const { http, key, exchange } = await setup();
    const bad = await signJwt(key, goodClaims({ aud: "khac" }));
    http.idToken = bad;
    const err1 = (await exchange().catch((e: unknown) => e)) as GoogleAuthError;
    http.tokenStatus = 400;
    const err2 = (await exchange().catch((e: unknown) => e)) as GoogleAuthError;
    http.tokenStatus = 200;
    http.tokenDown = true;
    const err3 = (await exchange().catch((e: unknown) => e)) as GoogleAuthError;
    for (const err of [err1, err2, err3]) {
      expect(err).toBeInstanceOf(GoogleAuthError);
      const text = `${err.message} ${String(err)} ${err.stack ?? ""}`;
      for (const secret of [CODE, VERIFIER, CLIENT_SECRET, bad, NONCE]) expect(text).not.toContain(secret);
    }
  });
});

describe("RealGoogleAuth.authUrl", () => {
  const params = { state: "state-ngau-nhien", nonce: "nonce-ngau-nhien", codeChallenge: "challenge-S256" };
  const google = new RealGoogleAuth({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: GOOGLE_REDIRECT_URI });

  it("trỏ tới accounts.google.com và có đủ tham số OAuth/PKCE", () => {
    const raw = google.authUrl(params);
    const url = new URL(raw);
    expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-S256");
    expect(url.searchParams.get("state")).toBe("state-ngau-nhien");
    expect(url.searchParams.get("nonce")).toBe("nonce-ngau-nhien");
  });

  it("scope đúng `openid email` (không có profile), redirect_uri đúng tên miền mới", () => {
    const raw = google.authUrl(params);
    expect(raw).toContain("scope=openid+email");
    expect(raw).not.toContain("profile");
    const url = new URL(raw);
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("redirect_uri")).toBe("https://api.aitranslator.vn/v1/auth/google/callback");
    expect(raw).not.toContain("io.vn");
  });

  it("không đưa client secret vào URL", () => {
    expect(google.authUrl(params)).not.toContain(CLIENT_SECRET);
  });

  // Chống lừa đăng nhập (login phishing): kẻ tấn công tự gọi start rồi gửi login_url thật cho nạn nhân; nếu Google bỏ qua màn hình chọn
  // tài khoản (phiên Google đang mở, đã cấp quyền trước đó) thì chỉ một cú bấm là hoàn tất đăng nhập. `select_account` buộc Google luôn hiện màn hình.
  it("luôn có prompt=select_account (Google luôn hiện màn hình chọn tài khoản), vẫn giữ nguyên scope và redirect_uri", () => {
    const raw = google.authUrl(params);
    const url = new URL(raw);
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.getAll("prompt")).toEqual(["select_account"]);
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("redirect_uri")).toBe("https://api.aitranslator.vn/v1/auth/google/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("googleFromEnv", () => {
  it("thiếu client id hoặc secret thì null", () => {
    expect(googleFromEnv({})).toBeNull();
    expect(googleFromEnv({ GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID })).toBeNull();
    expect(googleFromEnv({ GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET })).toBeNull();
    expect(googleFromEnv({ GOOGLE_OAUTH_CLIENT_ID: "", GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET })).toBeNull();
    expect(googleFromEnv({ GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET: "" })).toBeNull();
  });

  it("có đủ cả hai thì trả cổng Google với redirect_uri cố định", () => {
    const g = googleFromEnv({ GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET });
    expect(g).not.toBeNull();
    const url = new URL(g!.authUrl({ state: "s", nonce: "n", codeChallenge: "c" }));
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe("https://api.aitranslator.vn/v1/auth/google/callback");
  });
});
