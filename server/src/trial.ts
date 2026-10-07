// POST /v1/trial (spec 2026-10-07 §3.1): đăng ký dùng thử Free theo máy. Mỗi máy (device_id_hash) có đúng một dòng,
// giữ mãi, nên cài lại app, xóa dữ liệu hay xóa kho khóa đều không mở lại được dùng thử.
import type { Hono } from "hono";
import type { AppEnv } from "./app";
import { clientIp, fail, parseDeviceIdHash, readJson, tooMany } from "./http";
import { DAY_SECONDS } from "./plans";
import { hit } from "./ratelimit";
import { signTrialToken } from "./token";

/** Đọc biến TRIAL_DAYS: số nguyên 1–366. Thiếu hay sai thì null (route trả 503 trial_not_configured). */
export function parseTrialDays(raw: unknown): number | null {
  return Number.isSafeInteger(raw) && (raw as number) >= 1 && (raw as number) <= 366 ? (raw as number) : null;
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
    const key = await deps.signingKey();
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
  });
}
