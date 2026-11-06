// POST /v1/trial (spec 2026-10-07 §3.1): đăng ký dùng thử Free theo máy. Mỗi máy (device_id_hash) có đúng một dòng,
// giữ mãi, nên cài lại app, xóa dữ liệu hay xóa kho khóa đều không mở lại được dùng thử.
import type { Context, Hono } from "hono";
import { authenticateAccount } from "./account";
import type { AppEnv } from "./app";
import { loginEnabled } from "./auth";
import { clientIp, fail, parseDeviceIdHash, readJson, tooMany } from "./http";
import { DAY_SECONDS } from "./plans";
import { hit } from "./ratelimit";
import { signTrialToken } from "./token";

/** Đọc biến TRIAL_DAYS: số nguyên 1–366. Thiếu hay sai thì null (route trả 503 trial_not_configured). */
export function parseTrialDays(raw: unknown): number | null {
  return Number.isSafeInteger(raw) && (raw as number) >= 1 && (raw as number) <= 366 ? (raw as number) : null;
}

/** Ký token dùng thử và trả phản hồi. Dùng chung cho đường theo máy (không Bearer) và đường theo tài khoản (Bearer): định dạng giữ đúng 5 trường. */
async function respondTrial(c: Context<AppEnv>, deviceIdHash: string, row: { started_at: number; ends_at: number }, now: number) {
  const key = await c.get("deps").signingKey();
  const claims = {
    typ: "trial" as const,
    kid: key.kid,
    device_id_hash: deviceIdHash,
    started_at: row.started_at,
    ends_at: row.ends_at,
    issued_at: now,
  };
  const token = await signTrialToken(key, claims);
  return c.json({ token, started_at: claims.started_at, ends_at: claims.ends_at, issued_at: now });
}

/**
 * Có header Authorization (spec 2026-11-05 §5.3 nhánh 2 và 3): dùng thử theo tài khoản. Token tài khoản phải hợp lệ, gắn đúng máy này, và
 * tài khoản chưa bị xóa; sai thì 401 invalid_token, không ghi gì. Hai nhánh gộp trong một câu lệnh nguyên tử, nên hai máy của cùng một tài
 * khoản gọi cùng lúc vẫn cùng một mốc:
 * - Máy mới: dòng `trials` lấy mốc của tài khoản nếu tài khoản đã dùng thử (kể cả đã hết hạn: không mở thêm ngày), chưa thì tạo mới theo `days`.
 * - Máy đã có dòng: giữ started_at và ends_at của máy; chỉ đặt account_id nếu đang NULL (đang gắn tài khoản khác thì không gắn đè).
 * Câu thứ hai ghi mốc dùng thử vào tài khoản nếu chưa có (mốc của tài khoản không bao giờ dời).
 */
async function trialForAccount(c: Context<AppEnv>, deviceIdHash: string, days: number, now: number) {
  const auth = await authenticateAccount(c, deviceIdHash);
  if (auth instanceof Response) return auth;
  const db = c.env.DB;
  const [upsert] = await db.batch([
    db
      .prepare(
        `INSERT INTO trials (device_id_hash, started_at, ends_at, last_seen_at, account_id)
         SELECT ?1, COALESCE(a.trial_started_at, ?2), COALESCE(a.trial_ends_at, ?3), ?2, a.id
         FROM accounts a WHERE a.id = ?4 AND a.deleted_at IS NULL
         ON CONFLICT (device_id_hash) DO UPDATE SET last_seen_at = excluded.last_seen_at, account_id = COALESCE(trials.account_id, excluded.account_id)
         RETURNING started_at, ends_at`,
      )
      .bind(deviceIdHash, now, now + days * DAY_SECONDS, auth.accountId),
    db
      .prepare(
        `UPDATE accounts SET
           trial_started_at = (SELECT started_at FROM trials WHERE device_id_hash = ?1),
           trial_ends_at = (SELECT ends_at FROM trials WHERE device_id_hash = ?1)
         WHERE id = ?2 AND trial_started_at IS NULL AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM trials WHERE device_id_hash = ?1)`,
      )
      .bind(deviceIdHash, auth.accountId),
  ]);
  const row = upsert?.results[0] as { started_at: number; ends_at: number } | undefined;
  // Không có dòng: tài khoản bị xóa giữa lúc xác thực và lúc ghi.
  if (!row) return fail(c, 401, "invalid_token");
  return respondTrial(c, deviceIdHash, row, now);
}

export function registerTrial(app: Hono<AppEnv>) {
  app.post("/v1/trial", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const rl = await hit(c.env, "trial_ip", clientIp(c), now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    const body = await readJson(c);
    const deviceIdHash = parseDeviceIdHash(body?.device_id_hash);
    if (!deviceIdHash) return fail(c, 400, "invalid_request", { field: "device_id_hash" });
    const days = parseTrialDays(c.env.TRIAL_DAYS);
    if (days === null) return fail(c, 503, "trial_not_configured");
    // Có Authorization thì đi đường theo tài khoản (code riêng ở trên); không có thì giữ nguyên đường theo máy bên dưới.
    if (c.req.header("authorization") !== undefined) return trialForAccount(c, deviceIdHash, days, now);
    // ACCOUNT_REQUIRED=on (spec 2026-11-05 §5.4): máy MỚI phải đăng nhập; máy đã có dòng vẫn nhận token như cũ để app cũ ≤ 0.6.8 không gãy.
    // Chỉ áp khi đăng nhập dùng được (cùng điều kiện với /v1/auth/status): Google chưa cấu hình hay LOGIN_GATE=off thì không ai bị khóa vì
    // không đăng nhập nổi. Khi tắt, đường này không thêm câu lệnh nào.
    if (c.env.ACCOUNT_REQUIRED === "on" && loginEnabled(c)) {
      const known = await db.prepare("SELECT 1 AS x FROM trials WHERE device_id_hash = ?").bind(deviceIdHash).first();
      if (!known) return fail(c, 401, "account_required");
    }
    // Một câu lệnh: máy mới thì tạo dòng; máy đã có thì chỉ cập nhật last_seen_at, giữ started_at và ends_at. Hai request
    // cùng lúc của một máy vẫn ra đúng một dòng, và cả hai đọc được cùng started_at.
    const row = await db
      .prepare(
        `INSERT INTO trials (device_id_hash, started_at, ends_at, last_seen_at) VALUES (?1, ?2, ?3, ?2)
         ON CONFLICT (device_id_hash) DO UPDATE SET last_seen_at = excluded.last_seen_at
         RETURNING started_at, ends_at`,
      )
      .bind(deviceIdHash, now, now + days * DAY_SECONDS)
      .first<{ started_at: number; ends_at: number }>();
    if (!row) throw new Error("không ghi được dòng dùng thử");
    return respondTrial(c, deviceIdHash, row, now);
  });
}
