// Route đăng nhập Google và công tắc khẩn cấp (spec 2026-11-05 §3, §5.1, §5.4b, §5.6). Google luôn là FakeGoogleAuth: không test nào gọi mạng.
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pruneLoginAttempts } from "../src/auth";
import { b64urlEncode, hmacSha256Hex, sha256, sha256Hex } from "../src/crypto";
import type { GoogleAuthFailure } from "../src/google-auth";
import { LIMITS } from "../src/ratelimit";
import { verifyAccountToken } from "../src/token";
import { gateDb, resetDb, withFailingInsert, wrapDb } from "./db";
import { TEST_GOOGLE_CLIENT_ID } from "./fakes";
import vectors from "./vectors/token-v1.json";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

type World = ReturnType<typeof makeWorld>;

const START = "/v1/auth/google/start";
const CALLBACK = "/v1/auth/google/callback";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
/** 32 byte → 43 ký tự base64url, như app sinh. */
const VERIFIER = b64urlEncode(new Uint8Array(32).fill(7));
const CODE = "4/0AQ-code-cua-google-khong-duoc-lo";

const challengeOf = async (verifier: string) => b64urlEncode(await sha256(verifier));

interface Login {
  loginId: string;
  verifier: string;
  deviceIdHash: string;
  state: string;
  nonce: string;
}

/** App gọi start (bước 1) và lấy state, nonce mà Worker đã đưa cho Google. */
async function begin(w: World, over: Record<string, unknown> = {}, n = 1): Promise<Login> {
  const deviceIdHash = await sha256Hex(`auth-device-${n}`);
  const res = await w.call("POST", START, {
    device_id_hash: deviceIdHash,
    challenge: await challengeOf(VERIFIER),
    consent: true,
    lang: "vi",
    ...over,
  });
  if (res.status !== 200) throw new Error(`start ${res.status} ${JSON.stringify(res.body)}`);
  const sent = w.google.authUrls.at(-1)!;
  return { loginId: res.body.login_id as string, verifier: VERIFIER, deviceIdHash, state: sent.state, nonce: sent.nonce };
}

const callback = (w: World, query: Record<string, string>) => w.call("GET", `${CALLBACK}?${new URLSearchParams(query)}`);
const poll = (w: World, loginId: string, verifier: string) => w.call("POST", "/v1/auth/poll", { login_id: loginId, verifier });
const attemptOf = (loginId: string) => env.DB.prepare("SELECT * FROM login_attempts WHERE id = ?").bind(loginId).first<Record<string, unknown>>();
const accounts = async () => (await env.DB.prepare("SELECT * FROM accounts ORDER BY created_at, id").all<Record<string, unknown>>()).results;
const html = (r: { body: Record<string, unknown> }) => String(r.body.text);

/** Mọi dòng log mà code ghi (console.log/info/warn/error) trong lúc chạy. */
function captureLogs() {
  const lines: string[] = [];
  for (const m of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
  }
  return lines;
}

describe("POST /v1/auth/google/start", () => {
  it.each([
    ["thiếu consent", undefined],
    ["consent false", false],
    ["consent là chuỗi 'true'", "true"],
    ["consent là 1", 1],
  ])("%s → 400 invalid_request, không ghi login_attempts", async (_name, consent) => {
    const w = makeWorld();
    const body: Record<string, unknown> = { device_id_hash: await sha256Hex("d"), challenge: await challengeOf(VERIFIER) };
    if (consent !== undefined) body.consent = consent;
    expect(await w.call("POST", START, body)).toMatchObject({ status: 400, body: { error: "invalid_request", field: "consent" } });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts").first<{ n: number }>())?.n).toBe(0);
    expect(w.google.authUrls).toHaveLength(0);
  });

  it.each([
    ["device_id_hash thiếu", { device_id_hash: undefined }, "device_id_hash"],
    ["device_id_hash chữ hoa", { device_id_hash: "A".repeat(64) }, "device_id_hash"],
    ["challenge thiếu", { challenge: undefined }, "challenge"],
    ["challenge không phải base64url", { challenge: "!".repeat(43) }, "challenge"],
    ["challenge sai độ dài (không phải SHA-256)", { challenge: "abcd" }, "challenge"],
    ["challenge có padding", { challenge: `${"A".repeat(43)}=` }, "challenge"],
  ])("%s → 400 invalid_request", async (_name, over, field) => {
    const w = makeWorld();
    const body = { device_id_hash: await sha256Hex("d"), challenge: await challengeOf(VERIFIER), consent: true, ...over };
    expect(await w.call("POST", START, body)).toMatchObject({ status: 400, body: { error: "invalid_request", field } });
  });

  it("thân không phải JSON object → 400", async () => {
    const w = makeWorld();
    expect(await w.call("POST", START, "không phải json")).toMatchObject({ status: 400, body: { error: "invalid_request" } });
    expect(await w.call("POST", START, "[]")).toMatchObject({ status: 400, body: { error: "invalid_request" } });
  });

  it("trả login_id và login_url bắt đầu bằng https://accounts.google.com/o/oauth2/v2/auth, đúng redirect_uri, scope và PKCE", async () => {
    const w = makeWorld();
    const res = await w.call("POST", START, {
      device_id_hash: await sha256Hex("d"),
      challenge: await challengeOf(VERIFIER),
      consent: true,
      lang: "ja",
    });
    expect(res.status).toBe(200);
    expect(res.body.login_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(res.body.expires_at).toBe(T0 + 600);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const url = res.body.login_url as string;
    expect(url.startsWith(GOOGLE_AUTH_URL)).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("client_id")).toBe(TEST_GOOGLE_CLIENT_ID);
    expect(q.get("redirect_uri")).toBe("https://api.aitranslator.vn/v1/auth/google/callback");
    expect(q.get("scope")).toBe("openid email");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("code_challenge_method")).toBe("S256");
    // PKCE Worker↔Google độc lập với challenge của app: verifier của app không bao giờ đi tới Google.
    expect(q.get("code_challenge")).not.toBe(await challengeOf(VERIFIER));
    expect(url).not.toContain(VERIFIER);
  });

  it("state, nonce và PKCE là 32 byte ngẫu nhiên; DB chỉ giữ băm của state và nonce, không giữ bản gốc", async () => {
    const w = makeWorld();
    const a = await begin(w);
    const b = await begin(w, {}, 2);
    expect(a.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set([a.state, b.state, a.nonce, b.nonce]).size).toBe(4);
    const row = (await attemptOf(a.loginId))!;
    expect(row).toMatchObject({
      state_hash: await sha256Hex(a.state),
      nonce_hash: await sha256Hex(a.nonce),
      challenge: await challengeOf(VERIFIER),
      device_id_hash: a.deviceIdHash,
      consent_at: T0,
      lang: "vi",
      status: "pending",
      account_id: null,
      created_at: T0,
      expires_at: T0 + 600,
    });
    // code_verifier của Worker↔Google lưu nguyên khi còn pending; challenge gửi Google là SHA-256 của nó.
    expect(row.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.google.authUrls[0]!.codeChallenge).toBe(await challengeOf(row.code_verifier as string));
    const dump = JSON.stringify(row);
    expect(dump).not.toContain(a.state);
    expect(dump).not.toContain(a.nonce);
  });

  it("lang không gửi hay lạ thì lưu NULL (không chặn đăng nhập vì chuyện giao diện)", async () => {
    const w = makeWorld();
    const none = await begin(w, { lang: undefined });
    const odd = await begin(w, { lang: "fr" }, 2);
    expect((await attemptOf(none.loginId))?.lang).toBeNull();
    expect((await attemptOf(odd.loginId))?.lang).toBeNull();
  });

  it("google null (thiếu client id hay secret) → 503 login_unavailable, không ghi gì", async () => {
    const w = makeWorld();
    w.deps.google = null;
    const res = await w.call("POST", START, { device_id_hash: await sha256Hex("d"), challenge: await challengeOf(VERIFIER), consent: true });
    expect(res).toMatchObject({ status: 503, body: { error: "login_unavailable" } });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts").first<{ n: number }>())?.n).toBe(0);
  });

  it("LOGIN_GATE=off (công tắc khẩn cấp) → 503 login_unavailable dù Google còn cấu hình", async () => {
    const w = makeWorld({ LOGIN_GATE: "off" });
    const res = await w.call("POST", START, { device_id_hash: await sha256Hex("d"), challenge: await challengeOf(VERIFIER), consent: true });
    expect(res).toMatchObject({ status: 503, body: { error: "login_unavailable" } });
    expect(w.google.authUrls).toHaveLength(0);
  });

  it("giới hạn auth_start_ip: lần thứ 21 trong giờ → 429 rate_limited kèm Retry-After; IP khác không bị ảnh hưởng", async () => {
    const w = makeWorld();
    const body = { device_id_hash: await sha256Hex("d"), challenge: await challengeOf(VERIFIER), consent: true };
    for (let i = 0; i < LIMITS.auth_start_ip; i++) expect((await w.call("POST", START, body)).status).toBe(200);
    const blocked = await w.call("POST", START, body);
    expect(blocked).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await w.call("POST", START, body, { "cf-connecting-ip": "198.51.100.77" })).status).toBe(200);
  });
});

describe("GET /v1/auth/google/callback", () => {
  it("state lạ → trang lỗi, không gọi Google", async () => {
    const w = makeWorld();
    await begin(w);
    const res = await callback(w, { code: CODE, state: "state-khong-ton-tai" });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(html(res)).toContain("<html");
    expect(w.google.exchanges).toHaveLength(0);
    expect(await accounts()).toHaveLength(0);
  });

  it.each([
    ["không có state", { code: CODE }],
    ["state rỗng", { code: CODE, state: "" }],
    ["state quá dài", { code: CODE, state: "x".repeat(5000) }],
    ["không có tham số nào", {}],
  ])("%s → trang lỗi, không gọi Google", async (_name, query) => {
    const w = makeWorld();
    const res = await callback(w, query);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(w.google.exchanges).toHaveLength(0);
  });

  it("hết hạn (>10 phút) → trang lỗi, không gọi Google, không tạo tài khoản", async () => {
    const w = makeWorld();
    const l = await begin(w);
    w.clock.now = T0 + 601;
    const res = await callback(w, { code: CODE, state: l.state });
    expect(res.status).toBe(400);
    expect(w.google.exchanges).toHaveLength(0);
    expect(await accounts()).toHaveLength(0);
    expect(await poll(w, l.loginId, l.verifier)).toMatchObject({ status: 200, body: { status: "expired" } });
  });

  it("callback đúng → accounts có 1 dòng (email, consent_at, lang, email_verified), login_attempts done kèm account_id, verifier đã xóa", async () => {
    const w = makeWorld();
    const l = await begin(w, { lang: "en" });
    const storedVerifier = (await attemptOf(l.loginId))!.code_verifier as string;
    w.clock.now = T0 + 30;
    const res = await callback(w, { code: CODE, state: l.state });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    const rows = await accounts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      google_sub: "google-sub-test-1",
      email: "nguoi.dung@example.com",
      email_verified: 1,
      consent_at: T0,
      lang: "en",
      created_at: T0 + 30,
      last_login_at: T0 + 30,
      trial_started_at: null,
      trial_ends_at: null,
      deleted_at: null,
    });
    expect(await attemptOf(l.loginId)).toMatchObject({ status: "done", account_id: rows[0]!.id, code_verifier: "" });
    // Google nhận đúng code, đúng PKCE verifier Worker↔Google, và băm của nonce (không phải nonce gốc).
    expect(w.google.exchanges).toEqual([{ code: CODE, codeVerifier: storedVerifier, nonceHash: await sha256Hex(l.nonce) }]);
  });

  it("callback dùng hai lần → lần hai là trang lỗi, không gọi Google thêm, không tạo thêm tài khoản", async () => {
    const w = makeWorld();
    const l = await begin(w);
    expect((await callback(w, { code: CODE, state: l.state })).status).toBe(200);
    const again = await callback(w, { code: CODE, state: l.state });
    expect(again.status).toBe(400);
    expect(w.google.exchanges).toHaveLength(1);
    expect(await accounts()).toHaveLength(1);
    expect((await attemptOf(l.loginId))?.status).toBe("done");
  });

  it("hai callback cùng lúc cho một state: chỉ một lần đổi code, một tài khoản (claim nguyên tử)", async () => {
    const gate = gateDb(env.DB, /SET code_verifier = ''/);
    const w = makeWorld({ DB: gate.db });
    const l = await begin(w);
    const first = callback(w, { code: CODE, state: l.state });
    const second = callback(w, { code: CODE, state: l.state });
    // Một request dừng ngay trước câu claim; request kia chạy xong hẳn rồi mới thả request bị giữ.
    await gate.reached;
    await vi.waitFor(async () => expect((await attemptOf(l.loginId))?.status).toBe("done"));
    gate.release();
    const statuses = (await Promise.all([first, second])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400]);
    expect(w.google.exchanges).toHaveLength(1);
    expect(await accounts()).toHaveLength(1);
  });

  it("email_unverified → failed, không tạo tài khoản, verifier đã xóa", async () => {
    const w = makeWorld();
    w.google.failure = "email_unverified";
    const l = await begin(w);
    const res = await callback(w, { code: CODE, state: l.state });
    expect(res.status).toBe(400);
    expect(await accounts()).toHaveLength(0);
    expect(await attemptOf(l.loginId)).toMatchObject({ status: "failed", account_id: null, code_verifier: "" });
  });

  it.each<GoogleAuthFailure>(["exchange_failed", "bad_id_token", "nonce_mismatch", "jwks_unavailable"])(
    "Google báo %s → failed, trang lỗi, không tạo tài khoản",
    async (failure) => {
      const w = makeWorld();
      w.google.failure = failure;
      const l = await begin(w);
      expect((await callback(w, { code: CODE, state: l.state })).status).toBe(400);
      expect(await accounts()).toHaveLength(0);
      expect(await attemptOf(l.loginId)).toMatchObject({ status: "failed", code_verifier: "" });
      expect(await poll(w, l.loginId, l.verifier)).toMatchObject({ status: 200, body: { status: "failed" } });
    },
  );

  it("callback error=access_denied → status denied, không gọi Google, verifier đã xóa", async () => {
    const w = makeWorld();
    const l = await begin(w);
    const res = await callback(w, { error: "access_denied", state: l.state });
    expect(res.status).toBe(200);
    expect(w.google.exchanges).toHaveLength(0);
    expect(await attemptOf(l.loginId)).toMatchObject({ status: "denied", code_verifier: "" });
    expect(await accounts()).toHaveLength(0);
    expect(await poll(w, l.loginId, l.verifier)).toMatchObject({ status: 200, body: { status: "denied" } });
  });

  it("callback có error khác (vd. admin_policy_enforced của Workspace) → failed; error kèm code vẫn không đổi code", async () => {
    const w = makeWorld();
    const l = await begin(w);
    expect((await callback(w, { error: "admin_policy_enforced", state: l.state })).status).toBe(400);
    expect((await attemptOf(l.loginId))?.status).toBe("failed");
    const l2 = await begin(w, {}, 2);
    await callback(w, { error: "access_denied", code: CODE, state: l2.state });
    expect((await attemptOf(l2.loginId))?.status).toBe("denied");
    expect(w.google.exchanges).toHaveLength(0);
  });

  it("callback error với state lạ → trang lỗi, không đổi trạng thái của ai", async () => {
    const w = makeWorld();
    const l = await begin(w);
    expect((await callback(w, { error: "access_denied", state: "la" })).status).toBe(400);
    expect((await attemptOf(l.loginId))?.status).toBe("pending");
  });

  it("callback có state đúng nhưng thiếu code và error → failed", async () => {
    const w = makeWorld();
    const l = await begin(w);
    expect((await callback(w, { state: l.state })).status).toBe(400);
    expect(await attemptOf(l.loginId)).toMatchObject({ status: "failed", code_verifier: "" });
    expect(w.google.exchanges).toHaveLength(0);
  });

  it("callback của login đã denied không sống lại được", async () => {
    const w = makeWorld();
    const l = await begin(w);
    await callback(w, { error: "access_denied", state: l.state });
    expect((await callback(w, { code: CODE, state: l.state })).status).toBe(400);
    expect(w.google.exchanges).toHaveLength(0);
    expect((await attemptOf(l.loginId))?.status).toBe("denied");
  });

  it("đăng nhập lại cùng google_sub → cập nhật email và last_login_at, không tạo dòng mới, giữ created_at và mốc dùng thử", async () => {
    const w = makeWorld();
    const l1 = await begin(w);
    await callback(w, { code: CODE, state: l1.state });
    await env.DB.prepare("UPDATE accounts SET trial_started_at = 5, trial_ends_at = 10").run();
    w.clock.now = T0 + 5 * DAY;
    w.google.identity = { sub: "google-sub-test-1", email: "Email.Moi@Example.com" };
    const l2 = await begin(w, { lang: "zh" }, 2);
    expect((await callback(w, { code: CODE, state: l2.state })).status).toBe(200);
    const rows = await accounts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "email.moi@example.com",
      created_at: T0,
      last_login_at: T0 + 5 * DAY,
      consent_at: T0,
      lang: "zh",
      trial_started_at: 5,
      trial_ends_at: 10,
    });
    expect((await attemptOf(l2.loginId))?.account_id).toBe(rows[0]!.id);
  });

  it("tài khoản đã xóa đăng nhập lại → khôi phục dòng cũ: giữ created_at và mốc dùng thử, đặt lại email và consent_at, xóa deleted_at", async () => {
    const w = makeWorld();
    await env.DB.prepare(
      `INSERT INTO accounts (id, google_sub, email, email_verified, consent_at, created_at, last_login_at, trial_started_at, trial_ends_at, deleted_at)
       VALUES ('acc-cu', 'google-sub-test-1', NULL, 1, 100, 100, 200, 300, 400, 500)`,
    ).run();
    w.clock.now = T0 + DAY;
    const l = await begin(w);
    expect((await callback(w, { code: CODE, state: l.state })).status).toBe(200);
    const rows = await accounts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "acc-cu",
      email: "nguoi.dung@example.com",
      created_at: 100,
      consent_at: T0 + DAY,
      last_login_at: T0 + DAY,
      trial_started_at: 300,
      trial_ends_at: 400,
      deleted_at: null,
    });
    expect((await attemptOf(l.loginId))?.account_id).toBe("acc-cu");
  });

  it("hai người dùng khác nhau có hai tài khoản", async () => {
    const w = makeWorld();
    w.google.byCode.set("code-a", { sub: "sub-a", email: "a@example.com" });
    w.google.byCode.set("code-b", { sub: "sub-b", email: "b@example.com" });
    const a = await begin(w);
    const b = await begin(w, {}, 2);
    await callback(w, { code: "code-a", state: a.state });
    await callback(w, { code: "code-b", state: b.state });
    expect((await accounts()).map((r) => r.email).sort()).toEqual(["a@example.com", "b@example.com"]);
  });

  it("trang callback không chứa email, token, code, state hay verifier; có Referrer-Policy no-referrer và Cache-Control no-store", async () => {
    const w = makeWorld();
    const ok = await begin(w);
    const okPage = await callback(w, { code: CODE, state: ok.state });
    const denied = await begin(w, {}, 2);
    const deniedPage = await callback(w, { error: "access_denied", state: denied.state });
    w.google.failure = "bad_id_token";
    const bad = await begin(w, {}, 3);
    const failedPage = await callback(w, { code: CODE, state: bad.state });
    const unknownPage = await callback(w, { code: CODE, state: "la" });
    for (const page of [okPage, deniedPage, failedPage, unknownPage]) {
      expect(page.headers.get("referrer-policy")).toBe("no-referrer");
      expect(page.headers.get("cache-control")).toBe("no-store");
      expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(page.headers.get("x-content-type-options")).toBe("nosniff");
      expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
      const text = html(page);
      for (const secret of ["nguoi.dung@example.com", "example.com", "v1.", CODE, ok.state, ok.verifier, "google-sub"]) {
        expect(text).not.toContain(secret);
      }
    }
    // Ba loại trang khác nhau (xong, từ chối, lỗi).
    expect(new Set([html(okPage), html(deniedPage), html(failedPage)]).size).toBe(3);
  });

  it("ngôn ngữ trang theo lang của lần đăng nhập (vi, en, ja, zh, ko): mỗi ngôn ngữ một nội dung riêng cho trang xong, từ chối và lỗi", async () => {
    const seen = new Set<string>();
    for (const lang of ["vi", "en", "ja", "zh", "ko"]) {
      for (const kind of ["ok", "denied", "failed"] as const) {
        const w = makeWorld();
        if (kind === "failed") w.google.failure = "bad_id_token";
        const l = await begin(w, { lang });
        const res = kind === "denied" ? await callback(w, { error: "access_denied", state: l.state }) : await callback(w, { code: CODE, state: l.state });
        const page = html(res);
        expect(page).toContain(`<html lang="${lang}">`);
        seen.add(page);
        await resetDb();
      }
    }
    expect(seen.size).toBe(15);
  });

  it("trang lỗi khi không biết lần đăng nhập nào (state lạ) vẫn là HTML hoàn chỉnh có lang", async () => {
    const w = makeWorld();
    expect(html(await callback(w, { code: CODE, state: "la" }))).toMatch(/<html lang="(vi|en|ja|zh|ko)">/);
  });

  it("không bao giờ 500: exchange ném lỗi lạ (không phải GoogleAuthError) → trang lỗi, failed, lỗi không lọt vào log", async () => {
    const logs = captureLogs();
    const w = makeWorld();
    const l = await begin(w);
    w.google.exchange = async () => {
      throw new TypeError(`lỗi lạ chứa bí mật ${CODE} ${l.state}`);
    };
    const res = await callback(w, { code: CODE, state: l.state });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await attemptOf(l.loginId)).toMatchObject({ status: "failed", code_verifier: "" });
    expect(logs.join("\n")).not.toContain(CODE);
    expect(logs.join("\n")).not.toContain(l.state);
  });

  it("không bao giờ 500: D1 hỏng ở bước ghi tài khoản → trang lỗi, login_attempts thành failed", async () => {
    const logs = captureLogs();
    const { db } = wrapDb(env.DB, (sql) => /INSERT INTO accounts/.test(sql));
    const w = makeWorld({ DB: db });
    const l = await begin(w);
    const res = await callback(w, { code: CODE, state: l.state });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await attemptOf(l.loginId)).toMatchObject({ status: "failed", code_verifier: "" });
    expect(await accounts()).toHaveLength(0);
    expect(logs.join("\n")).not.toContain("nguoi.dung@example.com");
  });

  it("không bao giờ 500: D1 hỏng ngay từ lúc tra state → vẫn là trang HTML", async () => {
    captureLogs();
    const { db } = wrapDb(env.DB, (sql) => /FROM login_attempts/.test(sql));
    const w = makeWorld({ DB: db });
    const res = await callback(w, { code: CODE, state: "bat-ky" });
    expect(res.status).toBeLessThan(500);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
  });

  it("log không chứa code, state, verifier hay email trên mọi nhánh thất bại", async () => {
    const logs = captureLogs();
    const w = makeWorld();
    const l = await begin(w);
    const stored = (await attemptOf(l.loginId))!.code_verifier as string;
    w.google.failure = "bad_id_token";
    await callback(w, { code: CODE, state: l.state });
    await callback(w, { code: CODE, state: l.state });
    await callback(w, { code: CODE, state: "state-la-khong-duoc-log" });
    const text = logs.join("\n");
    for (const secret of [CODE, l.state, l.nonce, l.verifier, stored, "state-la-khong-duoc-log", "nguoi.dung@example.com"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("giới hạn auth_callback_ip: lần thứ 61 trong giờ → 429 dạng trang HTML, không gọi Google", async () => {
    const w = makeWorld();
    for (let i = 0; i < LIMITS.auth_callback_ip; i++) await callback(w, { code: CODE, state: "la" });
    const blocked = await callback(w, { code: CODE, state: "la" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("content-type")).toMatch(/^text\/html/);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(w.google.exchanges).toHaveLength(0);
  });
});

describe("POST /v1/auth/poll", () => {
  /** Đăng nhập xong tới bước callback; trả login để app hỏi kết quả. */
  async function loggedIn(w: World, n = 1): Promise<Login> {
    const l = await begin(w, {}, n);
    expect((await callback(w, { code: CODE, state: l.state })).status).toBe(200);
    return l;
  }

  it("poll pending", async () => {
    const w = makeWorld();
    const l = await begin(w);
    const res = await poll(w, l.loginId, l.verifier);
    expect(res).toMatchObject({ status: 200, body: { status: "pending" } });
    expect(res.body.token).toBeUndefined();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("poll done trả token đúng định dạng account và email; lần hai trả 404", async () => {
    const w = makeWorld();
    const l = await loggedIn(w);
    const first = await poll(w, l.loginId, l.verifier);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.body).toEqual({
      status: "done",
      token: expect.stringMatching(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
      email: "nguoi.dung@example.com",
    });
    expect((await attemptOf(l.loginId))?.status).toBe("claimed");
    expect(await poll(w, l.loginId, l.verifier)).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect((await attemptOf(l.loginId))?.status).toBe("claimed");
  });

  it("token trong poll kiểm được bằng verifyAccountToken với device_id_hash của login; máy khác bị wrong_device", async () => {
    const w = makeWorld();
    const l = await loggedIn(w);
    const accountId = (await accounts())[0]!.id as string;
    w.clock.now = T0 + 42;
    const res = await poll(w, l.loginId, l.verifier);
    const token = res.body.token as string;
    expect(await verifyAccountToken(token, vectors.public_keys, { deviceIdHash: l.deviceIdHash })).toEqual({
      ok: true,
      claims: { typ: "account", kid: "test-1", account_id: accountId, device_id_hash: l.deviceIdHash, issued_at: T0 + 42 },
    });
    expect(await verifyAccountToken(token, vectors.public_keys, { deviceIdHash: await sha256Hex("may-khac") })).toEqual({
      ok: false,
      error: "wrong_device",
    });
  });

  it("sai verifier → 404 như không tồn tại, và không đổi trạng thái (verifier đúng sau đó vẫn lấy được)", async () => {
    const w = makeWorld();
    const l = await loggedIn(w);
    const wrong = b64urlEncode(new Uint8Array(32).fill(9));
    expect(await poll(w, l.loginId, wrong)).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect((await attemptOf(l.loginId))?.status).toBe("done");
    expect((await poll(w, l.loginId, l.verifier)).body.status).toBe("done");
  });

  it("sai verifier khi đang pending cũng 404 (không lộ trạng thái cho người không có verifier)", async () => {
    const w = makeWorld();
    const l = await begin(w);
    expect(await poll(w, l.loginId, b64urlEncode(new Uint8Array(32).fill(9)))).toMatchObject({ status: 404 });
  });

  it("login_id không tồn tại → 404", async () => {
    const w = makeWorld();
    expect(await poll(w, "00000000-0000-4000-8000-000000000000", VERIFIER)).toMatchObject({ status: 404, body: { error: "not_found" } });
  });

  it.each([
    ["login_id thiếu", { verifier: VERIFIER }, "login_id"],
    ["login_id không phải uuid", { login_id: "abc", verifier: VERIFIER }, "login_id"],
    ["verifier thiếu", { login_id: "00000000-0000-4000-8000-000000000000" }, "verifier"],
    ["verifier quá ngắn", { login_id: "00000000-0000-4000-8000-000000000000", verifier: "abc" }, "verifier"],
    ["verifier có ký tự lạ", { login_id: "00000000-0000-4000-8000-000000000000", verifier: `${VERIFIER}!` }, "verifier"],
    ["verifier quá dài", { login_id: "00000000-0000-4000-8000-000000000000", verifier: "a".repeat(129) }, "verifier"],
  ])("%s → 400 invalid_request", async (_name, body, field) => {
    const w = makeWorld();
    expect(await w.call("POST", "/v1/auth/poll", body)).toMatchObject({ status: 400, body: { error: "invalid_request", field } });
  });

  it("denied, failed, expired trả đúng mã trạng thái", async () => {
    const w = makeWorld();
    const denied = await begin(w);
    await callback(w, { error: "access_denied", state: denied.state });
    w.google.failure = "bad_id_token";
    const failed = await begin(w, {}, 2);
    await callback(w, { code: CODE, state: failed.state });
    const expired = await begin(w, {}, 3);
    expect((await poll(w, denied.loginId, denied.verifier)).body).toEqual({ status: "denied" });
    expect((await poll(w, failed.loginId, failed.verifier)).body).toEqual({ status: "failed" });
    expect((await poll(w, expired.loginId, expired.verifier)).body).toEqual({ status: "pending" });
    w.clock.now = T0 + 601;
    expect((await poll(w, expired.loginId, expired.verifier)).body).toEqual({ status: "expired" });
    // denied và failed ở lại nguyên trạng, không bị đổi thành expired.
    expect((await poll(w, denied.loginId, denied.verifier)).body).toEqual({ status: "denied" });
  });

  it("đăng nhập xong sát giờ hết hạn thì app vẫn lấy được token (done không hết hạn theo 10 phút)", async () => {
    const w = makeWorld();
    const l = await loggedIn(w);
    w.clock.now = T0 + 3600;
    expect((await poll(w, l.loginId, l.verifier)).body.status).toBe("done");
  });

  it("nhiều poll cùng lúc: đúng một request nhận token, các request còn lại 404", async () => {
    const w = makeWorld();
    const l = await loggedIn(w);
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => poll(w, l.loginId, l.verifier)));
    expect(results.filter((r) => r.status === 200).map((r) => r.body.status)).toEqual(["done"]);
    expect(results.filter((r) => r.status === 404)).toHaveLength(4);
  });

  it("claim nguyên tử: request bị giữ đúng trước câu UPDATE không lấy được token thứ hai", async () => {
    const gate = gateDb(env.DB, /SET status = 'claimed'/);
    const w = makeWorld({ DB: gate.db });
    const l = await loggedIn(w);
    const held = poll(w, l.loginId, l.verifier);
    await gate.reached;
    // Request thứ hai chạy trọn vòng trong lúc request đầu đang dừng ngay trước câu claim.
    const other = makeWorld();
    const winner = await poll(other, l.loginId, l.verifier);
    expect(winner).toMatchObject({ status: 200, body: { status: "done" } });
    gate.release();
    expect(await held).toMatchObject({ status: 404 });
  });

  it("tài khoản đã bị xóa giữa chừng → failed, không phát token", async () => {
    const w = makeWorld();
    const l = await loggedIn(w);
    await env.DB.prepare("UPDATE accounts SET email = NULL, deleted_at = ?").bind(T0 + 1).run();
    const res = await poll(w, l.loginId, l.verifier);
    expect(res).toMatchObject({ status: 200, body: { status: "failed" } });
    expect(res.body.token).toBeUndefined();
  });

  it("giới hạn AUTH_POLL_LIMITER theo login_id: bị chặn thì 429 rate_limited, không đụng D1", async () => {
    const limit = vi.fn(async (_o: { key: string }) => ({ success: false }));
    const { db, sql } = wrapDb(env.DB);
    const w = makeWorld({ DB: db, AUTH_POLL_LIMITER: { limit } });
    const id = "00000000-0000-4000-8000-000000000000";
    const res = await poll(w, id, VERIFIER);
    expect(res).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(limit).toHaveBeenCalledWith({ key: id });
    expect(sql).toEqual([]);
  });

  it("còn trong hạn mức của binding thì poll chạy bình thường (một lần gọi limiter mỗi request)", async () => {
    const limit = vi.fn(async (_o: { key: string }) => ({ success: true }));
    const w = makeWorld({ AUTH_POLL_LIMITER: { limit } });
    const l = await begin(w);
    expect((await poll(w, l.loginId, l.verifier)).body.status).toBe("pending");
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it("poll không ghi bảng rate_limits (không tốn một lần ghi D1 mỗi lần hỏi)", async () => {
    const w = makeWorld();
    const l = await begin(w);
    await env.DB.prepare("DELETE FROM rate_limits").run();
    await poll(w, l.loginId, l.verifier);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits").first<{ n: number }>())?.n).toBe(0);
  });
});

describe("GET /v1/auth/status (công tắc khẩn cấp, spec §5.4b)", () => {
  it("bình thường → {login: on}", async () => {
    const w = makeWorld();
    expect(await w.call("GET", "/v1/auth/status")).toMatchObject({ status: 200, body: { login: "on" } });
  });

  it("LOGIN_GATE=off → {login: off}", async () => {
    const w = makeWorld({ LOGIN_GATE: "off" });
    expect((await w.call("GET", "/v1/auth/status")).body).toEqual({ login: "off" });
  });

  it("thiếu google (thiếu client id hay secret) → {login: off}", async () => {
    const w = makeWorld();
    w.deps.google = null;
    expect((await w.call("GET", "/v1/auth/status")).body).toEqual({ login: "off" });
  });

  it.each(["ON", "", "no", "true"])("LOGIN_GATE=%j không phải 'off' đúng chữ → vẫn on", async (value) => {
    const w = makeWorld({ LOGIN_GATE: value });
    expect((await w.call("GET", "/v1/auth/status")).body).toEqual({ login: "on" });
  });

  it("không cần token, không đụng D1, không bị giới hạn tần suất, không cache", async () => {
    const { db, sql } = wrapDb(env.DB);
    const w = makeWorld({ DB: db });
    for (let i = 0; i < 200; i++) expect((await w.call("GET", "/v1/auth/status")).status).toBe(200);
    expect(sql).toEqual([]);
    expect((await w.call("GET", "/v1/auth/status")).headers.get("cache-control")).toBe("no-store");
  });

  it("D1 hỏng vẫn trả trạng thái (không phụ thuộc D1)", async () => {
    const { db } = wrapDb(env.DB, () => true);
    const w = makeWorld({ DB: db });
    expect((await w.call("GET", "/v1/auth/status")).body).toEqual({ login: "on" });
  });
});

describe("pruneLoginAttempts (cron)", () => {
  it("xóa bản ghi quá 1 ngày (mọi trạng thái), giữ bản mới hơn; không đụng accounts", async () => {
    const w = makeWorld();
    const old = await begin(w);
    await callback(w, { code: CODE, state: old.state });
    await poll(w, old.loginId, old.verifier); // claimed
    const denied = await begin(w, {}, 2);
    await callback(w, { error: "access_denied", state: denied.state });
    w.clock.now = T0 + DAY - 60;
    const fresh = await begin(w, {}, 3);
    await pruneLoginAttempts(env.DB, T0 + DAY + 1);
    const ids = (await env.DB.prepare("SELECT id FROM login_attempts").all<{ id: string }>()).results.map((r) => r.id);
    expect(ids).toEqual([fresh.loginId]);
    expect(await accounts()).toHaveLength(1);
  });

  it("đúng 1 ngày chưa xóa, quá 1 ngày mới xóa", async () => {
    const w = makeWorld();
    const l = await begin(w);
    await pruneLoginAttempts(env.DB, T0 + DAY);
    expect(await attemptOf(l.loginId)).not.toBeNull();
    await pruneLoginAttempts(env.DB, T0 + DAY + 1);
    expect(await attemptOf(l.loginId)).toBeNull();
  });
});

// --- Vòng sửa 1 ------------------------------------------------------------------------------------------------------------------

describe("lừa đăng nhập (login phishing): trang thành công dặn người không tự bắt đầu thì đóng trang", () => {
  const NOTE: Record<string, string> = {
    vi: "Nếu bạn không bắt đầu lần đăng nhập này từ ứng dụng AI Translator, hãy đóng trang này và đừng làm gì thêm.",
    en: "If you did not start this sign-in from the AI Translator app, close this page and do nothing else.",
    ja: "このログインを AI Translator アプリから開始していない場合は、このページを閉じて、何も操作しないでください。",
    zh: "如果此次登录不是您在 AI Translator 应用中发起的，请关闭此页面，不要进行任何其他操作。",
    ko: "이 로그인을 AI Translator 앱에서 시작하지 않았다면 이 페이지를 닫고 아무것도 하지 마세요.",
  };

  it.each(["vi", "en", "ja", "zh", "ko"])("trang xong (%s) có câu dặn", async (lang) => {
    const w = makeWorld();
    const l = await begin(w, { lang });
    const res = await callback(w, { code: CODE, state: l.state });
    expect(res.status).toBe(200);
    expect(html(res)).toContain(NOTE[lang]!);
  });

  it("câu dặn chỉ có ở trang xong (trang từ chối, lỗi và không hợp lệ không cần)", async () => {
    const w = makeWorld();
    const denied = await begin(w);
    const deniedPage = html(await callback(w, { error: "access_denied", state: denied.state }));
    const unknownPage = html(await callback(w, { code: CODE, state: "la" }));
    expect(deniedPage).not.toContain(NOTE.vi!);
    expect(unknownPage).not.toContain(NOTE.en!);
  });
});

describe("callback: tạo tài khoản chỉ khi lần đăng nhập còn pending (batch là một giao dịch)", () => {
  it.each([
    ["tài khoản mới", false],
    ["tài khoản đã xóa (không được khôi phục)", true],
  ])("callback error=access_denied chen vào giữa lúc đổi code: %s", async (_name, hadDeleted) => {
    const w = makeWorld();
    if (hadDeleted) {
      await env.DB.prepare(
        `INSERT INTO accounts (id, google_sub, email, email_verified, consent_at, created_at, last_login_at, trial_started_at, trial_ends_at, deleted_at)
         VALUES ('acc-cu', 'google-sub-test-1', NULL, 1, 100, 100, 200, 300, 400, 500)`,
      ).run();
    }
    const l = await begin(w);
    const real = w.google.exchange.bind(w.google);
    // Trong lúc Google đang trả lời, callback `error=` của cùng state tới và đóng lần đăng nhập (pending → denied).
    w.google.exchange = async (p) => {
      const identity = await real(p);
      expect((await callback(w, { error: "access_denied", state: l.state })).status).toBe(200);
      return identity;
    };
    const res = await callback(w, { code: CODE, state: l.state });
    expect(res.status).toBe(400);
    const rows = await accounts();
    if (hadDeleted) {
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: "acc-cu", email: null, deleted_at: 500, consent_at: 100, last_login_at: 200 });
    } else {
      expect(rows).toHaveLength(0);
    }
    expect(await attemptOf(l.loginId)).toMatchObject({ status: "denied", account_id: null, code_verifier: "" });
    expect((await poll(w, l.loginId, l.verifier)).body).toEqual({ status: "denied" });
  });
});

describe("callback: lần đăng nhập pending đã hết hạn thì xóa luôn verifier PKCE", () => {
  it("trang lỗi, không gọi Google, code_verifier về '' (status vẫn pending: poll báo expired)", async () => {
    const w = makeWorld();
    const l = await begin(w);
    expect(((await attemptOf(l.loginId))!.code_verifier as string).length).toBe(43);
    w.clock.now = T0 + 601;
    expect((await callback(w, { code: CODE, state: l.state })).status).toBe(400);
    expect(w.google.exchanges).toHaveLength(0);
    expect(await attemptOf(l.loginId)).toMatchObject({ status: "pending", code_verifier: "" });
    expect((await poll(w, l.loginId, l.verifier)).body).toEqual({ status: "expired" });
  });

  it("callback đã dùng (done) không bị đụng tới: không đổi trạng thái", async () => {
    const w = makeWorld();
    const l = await begin(w);
    await callback(w, { code: CODE, state: l.state });
    w.clock.now = T0 + 601;
    await callback(w, { code: CODE, state: l.state });
    expect((await attemptOf(l.loginId))?.status).toBe("done");
  });
});

describe("trần xin đăng nhập toàn hệ thống (auth_start_global → cảnh báo auth_flood)", () => {
  const bucketOf = async (name: string, subject: string) => `${name}:${await hmacSha256Hex(env.RATE_LIMIT_PEPPER, subject)}`;
  const setCount = async (name: string, subject: string, at: number, count: number) => {
    await env.DB.prepare(
      "INSERT INTO rate_limits (bucket, window_start, count) VALUES (?1, ?2, ?3) ON CONFLICT (bucket, window_start) DO UPDATE SET count = ?3",
    )
      .bind(await bucketOf(name, subject), at - (at % 3600), count)
      .run();
  };
  const getCount = async (name: string, subject: string, at: number) =>
    (
      await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?")
        .bind(await bucketOf(name, subject), at - (at % 3600))
        .first<{ count: number }>()
    )?.count ?? 0;
  const alerts = () => env.DB.prepare("SELECT kind, window_start, count FROM ops_alerts ORDER BY kind, window_start").all().then((r) => r.results);
  const attempts = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts").first<{ n: number }>())!.n;
  const startBody = async () => ({ device_id_hash: await sha256Hex("d"), challenge: await challengeOf(VERIFIER), consent: true });
  const ipOf = (i: number) => ({ "cf-connecting-ip": `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}` });

  it("hằng số: 600 mỗi giờ", () => {
    expect((LIMITS as Record<string, number>).auth_start_global).toBe(600);
  });

  it("request thứ 600 còn qua và chưa có cảnh báo; thứ 601 bị 429 kèm Retry-After, không ghi login_attempts, đúng một cảnh báo auth_flood", async () => {
    const w = makeWorld();
    await setCount("auth_start_global", "all", T0, 599);
    const last = await w.call("POST", START, await startBody(), ipOf(1));
    expect(last.status).toBe(200);
    expect(await alerts()).toEqual([]);
    expect(await attempts()).toBe(1);

    const blocked = await w.call("POST", START, await startBody(), ipOf(2));
    expect(blocked).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(blocked.headers.get("retry-after")).toBe("3600");
    expect(await attempts()).toBe(1);
    expect(await alerts()).toEqual([{ kind: "auth_flood", window_start: T0, count: 1 }]);

    // Các request bị từ chối tiếp theo trong giờ này (kể cả thân sai) cũng 429 và không báo thêm.
    w.clock.now = T0 + 1200;
    const again = await w.call("POST", START, await startBody(), ipOf(3));
    expect(again.status).toBe(429);
    expect(again.headers.get("retry-after")).toBe("2400");
    expect((await w.call("POST", START, "{", ipOf(4))).status).toBe(429);
    expect(await alerts()).toEqual([{ kind: "auth_flood", window_start: T0, count: 1 }]);
    expect(await attempts()).toBe(1);
  });

  it("giờ mới thì đăng nhập lại được; chạm trần ở giờ mới thì có cảnh báo mới của giờ đó", async () => {
    const w = makeWorld();
    await setCount("auth_start_global", "all", T0, 600);
    expect((await w.call("POST", START, await startBody(), ipOf(1))).status).toBe(429);
    w.clock.now = T0 + 3600;
    expect((await w.call("POST", START, await startBody(), ipOf(1))).status).toBe(200);
    expect(await getCount("auth_start_global", "all", T0 + 3600)).toBe(1);
    await setCount("auth_start_global", "all", T0 + 3600, 600);
    expect((await w.call("POST", START, await startBody(), ipOf(2))).status).toBe(429);
    expect(await alerts()).toEqual([
      { kind: "auth_flood", window_start: T0, count: 1 },
      { kind: "auth_flood", window_start: T0 + 3600, count: 1 },
    ]);
  });

  it("IP đã bị auth_start_ip chặn thì không tiêu bộ đếm toàn hệ thống", async () => {
    const w = makeWorld();
    const ip = { "cf-connecting-ip": "203.0.113.50" };
    for (let i = 0; i < LIMITS.auth_start_ip; i++) expect((await w.call("POST", START, await startBody(), ip)).status).toBe(200);
    expect(await getCount("auth_start_global", "all", T0)).toBe(LIMITS.auth_start_ip);
    for (let i = 0; i < 5; i++) expect((await w.call("POST", START, await startBody(), ip)).status).toBe(429);
    expect(await getCount("auth_start_global", "all", T0)).toBe(LIMITS.auth_start_ip);
  });

  it("đăng nhập tắt (503) không tiêu bộ đếm chung", async () => {
    const w = makeWorld({ LOGIN_GATE: "off" });
    await w.call("POST", START, await startBody(), ipOf(1));
    expect(await getCount("auth_start_global", "all", T0)).toBe(0);
  });

  it("lỗi ghi cảnh báo auth_flood không đổi phản hồi (vẫn 429 kèm Retry-After), chỉ ghi log auth_alert_failed không mang dữ liệu đăng nhập", async () => {
    const logs = captureLogs();
    const w = makeWorld();
    await setCount("auth_start_global", "all", T0, 600);
    const res = await withFailingInsert("ops_alerts", "NEW.kind = 'auth_flood'", async () =>
      w.call("POST", START, await startBody(), { "cf-connecting-ip": "203.0.113.77" }),
    );
    expect(res).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(res.headers.get("retry-after")).toBe("3600");
    expect(await alerts()).toEqual([]);
    const text = logs.join("\n");
    expect(text).toContain("auth_alert_failed");
    expect(text).not.toContain("203.0.113.77");
  });
});
