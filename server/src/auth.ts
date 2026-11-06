// Đăng nhập bằng Google (spec 2026-11-05 §3, §5.1, §5.4b): Worker là bên đăng nhập, app chỉ mở trình duyệt hệ thống rồi hỏi kết quả.
//   POST /v1/auth/google/start    app xin login_url (ghi login_attempts, sinh state, nonce, PKCE)
//   GET  /v1/auth/google/callback Google chuyển trình duyệt về đây; đổi code, kiểm id_token, ghi accounts, trả trang HTML ngắn
//   POST /v1/auth/poll            app hỏi kết quả mỗi 3 giây; token tài khoản trả đúng MỘT lần
//   GET  /v1/auth/status          công tắc khẩn cấp: app chỉ mở cổng đăng nhập khi server nói rõ "off"
// Không bao giờ ghi vào log hay trang HTML: code, state, nonce, verifier, token, id_token, email (chỉ mã lý do và tên lỗi).
import type { Context, Hono } from "hono";
import type { AppEnv } from "./app";
import { b64urlDecode, b64urlEncode, randomBytes, sha256, sha256Hex, timingSafeEqual } from "./crypto";
import { GoogleAuthError } from "./google-auth";
import { clientIp, fail, parseDeviceIdHash, parseUuid, readJson, tooMany } from "./http";
import { type Lang, parseLang } from "./lang";
import { raiseAlert } from "./alerts";
import { hit, LIMITS } from "./ratelimit";
import { signAccountToken } from "./token";

/** Một lần đăng nhập sống 10 phút (hết hạn tính từ lúc start). */
const LOGIN_TTL_SECONDS = 600;
/** login_attempts dọn sau 1 ngày (spec §4). */
const PRUNE_AFTER_SECONDS = 86_400;
/** Gợi ý thời gian chờ khi AUTH_POLL_LIMITER từ chối: cửa sổ của binding là 60 giây. */
const POLL_RETRY_AFTER = 60;
/** `state` do Worker sinh (32 byte → 43 ký tự); chặn trên rộng hơn một chút để mọi giá trị lạ bị loại trước khi chạm D1. */
const STATE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
/** `code` của Google dài khoảng vài chục tới vài trăm ký tự; trần này chỉ để không đẩy chuỗi khổng lồ sang Google. */
const MAX_CODE_LENGTH = 2048;
/** verifier PKCE của app: 32 byte → 43 ký tự base64url; RFC 7636 cho 43–128. */
const VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

/** Dọn login_attempts quá 1 ngày, mọi trạng thái (bản `claimed` không chứa thông tin cá nhân nhưng vẫn dọn cùng). */
export async function pruneLoginAttempts(db: D1Database, now: number): Promise<void> {
  await db.prepare("DELETE FROM login_attempts WHERE created_at < ?").bind(now - PRUNE_AFTER_SECONDS).run();
}

// --- Trang HTML của callback -------------------------------------------------------------------------------------------------------
// Trang tĩnh: chỉ chữ cố định theo ngôn ngữ, không có chỗ nào chèn dữ liệu của người dùng (không email, token, code, state).

type PageKind = "done" | "denied" | "failed" | "invalid";

const PAGE_TEXT: Record<Lang, Record<PageKind, { title: string; body: string }>> = {
  vi: {
    done: { title: "Đăng nhập thành công", body: "Bạn có thể đóng tab này và quay lại ứng dụng AI Translator." },
    denied: {
      title: "Đã hủy đăng nhập",
      body: "Bạn đã từ chối cấp quyền nên chưa đăng nhập. Hãy đóng tab này, quay lại ứng dụng và thử lại nếu muốn.",
    },
    failed: {
      title: "Không đăng nhập được",
      body: "Đã xảy ra lỗi nên chưa đăng nhập. Hãy đóng tab này, quay lại ứng dụng và thử lại. Nếu lỗi lặp lại, hãy liên hệ hỗ trợ.",
    },
    invalid: {
      title: "Liên kết không còn hiệu lực",
      body: "Phiên đăng nhập này đã hết hạn hoặc đã được dùng. Hãy quay lại ứng dụng và bấm Đăng nhập để bắt đầu lại.",
    },
  },
  en: {
    done: { title: "Signed in", body: "You can close this tab and return to the AI Translator app." },
    denied: {
      title: "Sign-in cancelled",
      body: "You declined access, so you were not signed in. Close this tab and return to the app to try again.",
    },
    failed: {
      title: "Couldn't sign in",
      body: "Something went wrong, so you were not signed in. Close this tab, return to the app and try again. If it keeps happening, contact support.",
    },
    invalid: {
      title: "Link no longer valid",
      body: "This sign-in has expired or was already used. Return to the app and click Sign in to start again.",
    },
  },
  ja: {
    done: { title: "ログインしました", body: "このタブを閉じて、AI Translator アプリに戻ってください。" },
    denied: {
      title: "ログインをキャンセルしました",
      body: "アクセスを許可しなかったため、ログインしていません。このタブを閉じてアプリに戻り、必要であればもう一度お試しください。",
    },
    failed: {
      title: "ログインできませんでした",
      body: "問題が発生したため、ログインできませんでした。このタブを閉じてアプリに戻り、もう一度お試しください。繰り返し発生する場合はサポートにご連絡ください。",
    },
    invalid: {
      title: "リンクは無効です",
      body: "このログインは期限切れか、すでに使用されています。アプリに戻り、「ログイン」をもう一度押してください。",
    },
  },
  zh: {
    done: { title: "登录成功", body: "您可以关闭此标签页，返回 AI Translator 应用。" },
    denied: { title: "已取消登录", body: "您拒绝了授权，因此尚未登录。请关闭此标签页，返回应用后可重新尝试。" },
    failed: { title: "无法登录", body: "出现问题，未能登录。请关闭此标签页，返回应用后重试。如果问题持续，请联系支持。" },
    invalid: { title: "链接已失效", body: "此次登录已过期或已被使用。请返回应用，重新点击“登录”。" },
  },
  ko: {
    done: { title: "로그인되었습니다", body: "이 탭을 닫고 AI Translator 앱으로 돌아가세요." },
    denied: {
      title: "로그인이 취소되었습니다",
      body: "접근 권한을 허용하지 않아 로그인되지 않았습니다. 이 탭을 닫고 앱으로 돌아가 다시 시도하세요.",
    },
    failed: {
      title: "로그인할 수 없습니다",
      body: "문제가 발생하여 로그인되지 않았습니다. 이 탭을 닫고 앱으로 돌아가 다시 시도하세요. 문제가 계속되면 지원팀에 문의하세요.",
    },
    invalid: {
      title: "링크가 더 이상 유효하지 않습니다",
      body: "이 로그인은 만료되었거나 이미 사용되었습니다. 앱으로 돌아가 '로그인'을 눌러 다시 시작하세요.",
    },
  },
};

/**
 * Câu dặn riêng của trang thành công. Chống lừa đăng nhập: kẻ tấn công gửi login_url cho nạn nhân; nạn nhân không tự bắt đầu phải thấy
 * ngay rằng mình nên đóng trang (và không làm gì thêm) thay vì tưởng là xong việc của mình.
 */
const DONE_NOTE: Record<Lang, string> = {
  vi: "Nếu bạn không bắt đầu lần đăng nhập này từ ứng dụng AI Translator, hãy đóng trang này và đừng làm gì thêm.",
  en: "If you did not start this sign-in from the AI Translator app, close this page and do nothing else.",
  ja: "このログインを AI Translator アプリから開始していない場合は、このページを閉じて、何も操作しないでください。",
  zh: "如果此次登录不是您在 AI Translator 应用中发起的，请关闭此页面，不要进行任何其他操作。",
  ko: "이 로그인을 AI Translator 앱에서 시작하지 않았다면 이 페이지를 닫고 아무것도 하지 마세요.",
};

const PAGE_STYLE =
  "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:16px/1.5 system-ui,sans-serif;background:#f6f7f9;color:#1f2328}" +
  "main{max-width:28rem;margin:1.5rem;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.12);text-align:center}" +
  "h1{margin:0 0 .75rem;font-size:1.25rem}p{margin:0}.note{margin-top:1rem;font-size:.875rem;opacity:.8}@media(prefers-color-scheme:dark){body{background:#16181c;color:#e6e8eb}main{background:#22252a}}";

/** Ngôn ngữ của trang khi chưa biết lần đăng nhập nào (state lạ): lấy từ Accept-Language, không có thì tiếng Anh. */
function langFromHeader(header: string | undefined): Lang {
  for (const part of (header ?? "").split(",")) {
    const primary = part.split(";")[0]?.trim().toLowerCase().split("-")[0];
    const lang = parseLang(primary);
    if (lang) return lang;
  }
  return "en";
}

function page(kind: PageKind, lang: Lang, status: 200 | 400 | 429, extra: Record<string, string> = {}): Response {
  const t = PAGE_TEXT[lang][kind];
  const body =
    `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>AI Translator</title><style>${PAGE_STYLE}</style></head>` +
    `<body><main><h1>${t.title}</h1><p>${t.body}</p>${kind === "done" ? `<p class="note">${DONE_NOTE[lang]}</p>` : ""}</main></body></html>`;
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      ...extra,
    },
  });
}

// --- Route -------------------------------------------------------------------------------------------------------------------------

/** Khóa đăng nhập đang bật: có cổng Google (đủ client id và secret) và công tắc khẩn cấp không tắt (spec §5.4b). */
export function loginEnabled(c: Context<AppEnv>): boolean {
  return c.get("deps").google !== null && c.env.LOGIN_GATE !== "off";
}

/** challenge của app: base64url không padding của một SHA-256 (đúng 32 byte). */
function parseChallenge(v: unknown): string | null {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(v)) return null;
  try {
    return b64urlDecode(v).byteLength === 32 ? v : null;
  } catch {
    return null;
  }
}

async function challengeOf(verifier: string): Promise<string> {
  return b64urlEncode(await sha256(verifier));
}

/** Đưa một lần đăng nhập đang `pending` sang trạng thái kết thúc và xóa verifier PKCE (không còn dùng được). */
async function settle(db: D1Database, loginId: string, status: "denied" | "failed"): Promise<void> {
  await db.prepare("UPDATE login_attempts SET status = ?2, code_verifier = '' WHERE id = ?1 AND status = 'pending'").bind(loginId, status).run();
}

interface AttemptRow {
  id: string;
  status: string;
  expires_at: number;
  lang: string | null;
  code_verifier: string;
  nonce_hash: string;
  consent_at: number;
}

export function registerAuth(app: Hono<AppEnv>) {
  app.post("/v1/auth/google/start", async (c) => {
    const deps = c.get("deps");
    const google = deps.google;
    // Đăng nhập tắt (thiếu cấu hình Google hay LOGIN_GATE=off): không ghi gì; app đã được /v1/auth/status báo mở cổng.
    if (!google || !loginEnabled(c)) return fail(c, 503, "login_unavailable");
    const now = deps.now();
    const rl = await hit(c.env, "auth_start_ip", clientIp(c), now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    // Trần toàn hệ thống, đếm sau giới hạn theo IP (IP đã bị chặn không tiêu bộ đếm chung) và trước khi đọc thân hay ghi login_attempts.
    const global = await hit(c.env, "auth_start_global", "all", now);
    if (!global.allowed) {
      // Đúng lần từ chối đầu tiên của giờ này: một cảnh báo, không phải mỗi request. Lỗi ghi cảnh báo chỉ vào log, không đổi phản hồi.
      if (global.count === LIMITS.auth_start_global + 1) {
        try {
          await raiseAlert(c.env.DB, "auth_flood", now);
        } catch (err) {
          console.error(JSON.stringify({ event: "auth_alert_failed", kind: "auth_flood", name: err instanceof Error ? err.name : "unknown" }));
        }
      }
      return tooMany(c, global.retryAfter);
    }
    const body = await readJson(c);
    const deviceIdHash = parseDeviceIdHash(body?.device_id_hash);
    if (!deviceIdHash) return fail(c, 400, "invalid_request", { field: "device_id_hash" });
    const challenge = parseChallenge(body?.challenge);
    if (!challenge) return fail(c, 400, "invalid_request", { field: "challenge" });
    // Ô đồng ý bắt buộc đúng `true` (spec §5.1): thiếu hay kiểu khác là 400, không lưu gì.
    if (body?.consent !== true) return fail(c, 400, "invalid_request", { field: "consent" });
    // lang chỉ để chọn ngôn ngữ trang kết quả và thư sau này: lạ hay thiếu thì NULL, không chặn đăng nhập vì chuyện giao diện.
    const lang = parseLang(body?.lang);

    const loginId = crypto.randomUUID();
    const state = b64urlEncode(randomBytes(32));
    const nonce = b64urlEncode(randomBytes(32));
    const codeVerifier = b64urlEncode(randomBytes(32));
    const loginUrl = google.authUrl({ state, nonce, codeChallenge: await challengeOf(codeVerifier) });
    const expiresAt = now + LOGIN_TTL_SECONDS;
    // Chỉ lưu băm của state và nonce; verifier PKCE Worker↔Google lưu nguyên trong lúc pending và bị xóa khi status rời pending.
    await c.env.DB.prepare(
      `INSERT INTO login_attempts (id, state_hash, nonce_hash, challenge, code_verifier, device_id_hash, consent_at, lang, status, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?7, ?9)`,
    )
      .bind(loginId, await sha256Hex(state), await sha256Hex(nonce), challenge, codeVerifier, deviceIdHash, now, lang, expiresAt)
      .run();
    c.header("cache-control", "no-store");
    return c.json({ login_id: loginId, login_url: loginUrl, expires_at: expiresAt });
  });

  // Callback không bao giờ trả 500: mọi lỗi thành trang HTML (người dùng đang nhìn trình duyệt, không phải app).
  app.get("/v1/auth/google/callback", async (c) => {
    let loginId: string | null = null;
    let lang: Lang = langFromHeader(c.req.header("accept-language"));
    try {
      return await handleCallback(c, (id, l) => {
        loginId = id;
        lang = l;
      });
    } catch (err) {
      // Chỉ tên lỗi và (với GoogleAuthError) mã lý do; thông điệp lỗi khác có thể mang dữ liệu nên không ghi.
      console.error(JSON.stringify({ event: "auth_callback_error", name: err instanceof Error ? err.name : "unknown", reason: err instanceof GoogleAuthError ? err.reason : undefined }));
      if (loginId !== null) {
        try {
          await settle(c.env.DB, loginId, "failed");
        } catch {
          // Không làm được thì thôi: bản ghi hết hạn sau 10 phút và bị dọn sau 1 ngày.
        }
      }
      return page("failed", lang, 400);
    }
  });

  app.post("/v1/auth/poll", async (c) => {
    const deps = c.get("deps");
    const body = await readJson(c);
    const loginId = parseUuid(body?.login_id);
    if (!loginId) return fail(c, 400, "invalid_request", { field: "login_id" });
    const verifier = body?.verifier;
    if (typeof verifier !== "string" || !VERIFIER_PATTERN.test(verifier)) return fail(c, 400, "invalid_request", { field: "verifier" });
    // Hỏi kết quả đếm bằng binding Rate Limiting (không ghi D1 mỗi lần hỏi), theo login_id (spec §5.6).
    const limiter = c.env.AUTH_POLL_LIMITER;
    if (limiter && !(await limiter.limit({ key: loginId })).success) return tooMany(c, POLL_RETRY_AFTER);
    c.header("cache-control", "no-store");
    const db = c.env.DB;
    const now = deps.now();
    const row = await db
      .prepare(
        `SELECT la.status, la.challenge, la.expires_at, la.account_id, la.device_id_hash, a.email, a.deleted_at
         FROM login_attempts la LEFT JOIN accounts a ON a.id = la.account_id WHERE la.id = ?`,
      )
      .bind(loginId)
      .first<{
        status: string;
        challenge: string;
        expires_at: number;
        account_id: string | null;
        device_id_hash: string;
        email: string | null;
        deleted_at: number | null;
      }>();
    // Sai verifier cũng 404 như không tồn tại: người chỉ biết login_id không biết được trạng thái.
    if (!row || !timingSafeEqual(await challengeOf(verifier), row.challenge)) return fail(c, 404, "not_found");

    switch (row.status) {
      case "pending":
        return c.json({ status: now >= row.expires_at ? "expired" : "pending" });
      case "denied":
      case "failed":
        return c.json({ status: row.status });
      case "done":
        break;
      default:
        // claimed: token đã giao một lần.
        return fail(c, 404, "not_found");
    }
    // Tài khoản bị xóa ngay sau khi đăng nhập: không phát token cho tài khoản không còn.
    if (row.account_id === null || row.email === null || row.deleted_at !== null) return c.json({ status: "failed" });
    // Ký trước khi nhận: ký lỗi thì chưa đốt lần nhận duy nhất.
    const key = await deps.signingKey();
    const token = await signAccountToken(key, {
      typ: "account",
      kid: key.kid,
      account_id: row.account_id,
      device_id_hash: row.device_id_hash,
      issued_at: now,
    });
    // Nhận nguyên tử: một câu UPDATE đổi done → claimed; hai request cùng lúc thì chỉ một request thấy dòng trả về.
    const claimed = await db
      .prepare("UPDATE login_attempts SET status = 'claimed' WHERE id = ?1 AND status = 'done' RETURNING id")
      .bind(loginId)
      .first<{ id: string }>();
    if (!claimed) return fail(c, 404, "not_found");
    return c.json({ status: "done", token, email: row.email });
  });

  // Công tắc khẩn cấp (spec §5.4b): không token, không D1, không giới hạn theo D1. "off" khi LOGIN_GATE="off" hay thiếu cấu hình Google.
  app.get("/v1/auth/status", (c) => {
    c.header("cache-control", "no-store");
    return c.json({ login: loginEnabled(c) ? "on" : "off" });
  });
}

/** Thân của callback; mọi lỗi ném ra ngoài được route bắt và đổi thành trang lỗi. `track` báo lần đăng nhập đã tìm thấy để route đóng nó lại khi lỗi. */
async function handleCallback(c: Context<AppEnv>, track: (loginId: string, lang: Lang) => void): Promise<Response> {
  const deps = c.get("deps");
  const db = c.env.DB;
  const now = deps.now();
  const fallbackLang = langFromHeader(c.req.header("accept-language"));
  const rl = await hit(c.env, "auth_callback_ip", clientIp(c), now);
  if (!rl.allowed) return page("failed", fallbackLang, 429, { "retry-after": String(rl.retryAfter) });

  const state = c.req.query("state");
  if (state === undefined || !STATE_PATTERN.test(state)) return page("invalid", fallbackLang, 400);
  const row = await db
    .prepare("SELECT id, status, expires_at, lang, code_verifier, nonce_hash, consent_at FROM login_attempts WHERE state_hash = ?")
    .bind(await sha256Hex(state))
    .first<AttemptRow>();
  if (!row) return page("invalid", fallbackLang, 400);
  const lang = parseLang(row.lang) ?? fallbackLang;
  track(row.id, lang);
  // Đã dùng, đã kết thúc hay hết hạn: trang lỗi, không gọi Google.
  if (row.status !== "pending") return page("invalid", lang, 400);
  if (now >= row.expires_at) {
    // Hết hạn mà vẫn pending (status giữ nguyên để poll báo expired): xóa luôn verifier PKCE, không giữ tới lúc cron dọn.
    await db.prepare("UPDATE login_attempts SET code_verifier = '' WHERE id = ?1 AND status = 'pending'").bind(row.id).run();
    return page("invalid", lang, 400);
  }

  // Google chuyển về kèm lỗi (người dùng bấm Từ chối, tổ chức Workspace chặn app...): không đổi code.
  if (c.req.query("error") !== undefined) {
    const denied = c.req.query("error") === "access_denied";
    await settle(db, row.id, denied ? "denied" : "failed");
    return denied ? page("denied", lang, 200) : page("failed", lang, 400);
  }

  const code = c.req.query("code");
  const google = deps.google;
  if (!code || code.length > MAX_CODE_LENGTH || !google) {
    await settle(db, row.id, "failed");
    return page("failed", lang, 400);
  }

  // Nhận lần đổi code nguyên tử: chỉ request xóa được verifier (đổi từ giá trị đã đọc sang '') mới được gọi Google. Hai callback cùng
  // lúc, hay callback chạy lại sau khi bản ghi đã bị nhận, đều thấy 0 dòng thay đổi.
  if (row.code_verifier === "") return page("invalid", lang, 400);
  const claim = await db
    .prepare("UPDATE login_attempts SET code_verifier = '' WHERE id = ?1 AND status = 'pending' AND code_verifier = ?2 AND expires_at > ?3")
    .bind(row.id, row.code_verifier, now)
    .run();
  if (claim.meta.changes !== 1) return page("invalid", lang, 400);

  let identity: { sub: string; email: string };
  try {
    identity = await google.exchange({ code, codeVerifier: row.code_verifier, nonceHash: row.nonce_hash });
  } catch (err) {
    console.warn(JSON.stringify({ event: "auth_login_failed", reason: err instanceof GoogleAuthError ? err.reason : "unexpected", name: err instanceof Error ? err.name : "unknown" }));
    await settle(db, row.id, "failed");
    return page("failed", lang, 400);
  }

  // Tạo hay cập nhật tài khoản theo google_sub (không dùng email làm khóa) và đóng lần đăng nhập trong cùng một batch (một giao dịch D1).
  // Chỉ khi lần đăng nhập còn pending: callback `error=` của cùng state chen vào giữa (đã đóng thành denied/failed) thì không tạo hay khôi phục tài khoản. Tài khoản đã xóa
  // (deleted_at) thì khôi phục dòng cũ: giữ created_at và mốc dùng thử, đặt lại email và consent_at (spec §5.5).
  const email = identity.email.trim().toLowerCase();
  const [, done] = await db.batch([
    db
      .prepare(
        `INSERT INTO accounts (id, google_sub, email, email_verified, consent_at, lang, created_at, last_login_at)
         SELECT ?1, ?2, ?3, 1, ?4, ?5, ?6, ?6
         WHERE EXISTS (SELECT 1 FROM login_attempts WHERE id = ?7 AND status = 'pending')
         ON CONFLICT (google_sub) DO UPDATE SET
           email = excluded.email,
           last_login_at = excluded.last_login_at,
           lang = COALESCE(excluded.lang, accounts.lang),
           consent_at = CASE WHEN accounts.deleted_at IS NULL THEN accounts.consent_at ELSE excluded.consent_at END,
           deleted_at = NULL`,
      )
      .bind(crypto.randomUUID(), identity.sub, email, row.consent_at, parseLang(row.lang), now, row.id),
    db
      .prepare(
        `UPDATE login_attempts SET status = 'done', code_verifier = '', account_id = (SELECT id FROM accounts WHERE google_sub = ?2)
         WHERE id = ?1 AND status = 'pending'`,
      )
      .bind(row.id, identity.sub),
  ]);
  // Lần đăng nhập bị đóng trước (vd. callback lỗi khác của cùng state chen vào): app đã nhận kết quả khác.
  if (done?.meta.changes !== 1) return page("invalid", lang, 400);
  return page("done", lang, 200);
}

