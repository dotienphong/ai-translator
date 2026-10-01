// Giới hạn tần suất theo cửa sổ cố định 1 giờ, đếm trong D1 (§10.2).
// Không dùng binding Rate Limiting của Workers: binding đó chỉ có chu kỳ 10 hoặc 60 giây và đếm riêng
// từng vị trí của Cloudflare (https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
// IP, key và email chỉ lưu dạng HMAC-SHA256 với secret RATE_LIMIT_PEPPER, nên bảng bị lộ cũng không dò ngược được.
import { raiseAlert } from "./alerts";
import { hmacSha256Hex } from "./crypto";

export const LIMITS = {
  checkout_ip: 10,
  activate_ip: 10,
  deactivate_ip: 10,
  validate_key: 30,
  recover_email: 3,
  recover_ip: 10,
  order_poll: 600,
  // Lần thất bại (key sai định dạng hay không tồn tại, activation lạ) của một IP, tính chung mọi endpoint.
  // Chạm ngưỡng thì IP đó bị chặn tới hết giờ, trừ request có key hợp lệ kèm activation đang hoạt động
  // và khớp (nhiều người dùng chung một IP qua CGNAT vẫn validate được), và có cảnh báo cho người vận hành.
  failure_ip: 60,
} as const;
export type LimitName = keyof typeof LIMITS;
export const WINDOW_SECONDS = 3600;

export interface RateEnv {
  DB: D1Database;
  RATE_LIMIT_PEPPER: string;
}

export interface HitResult {
  allowed: boolean;
  count: number;
  retryAfter: number;
}

async function bucketOf(env: RateEnv, name: LimitName, subject: string): Promise<string> {
  return `${name}:${await hmacSha256Hex(env.RATE_LIMIT_PEPPER, subject)}`;
}

/** Tăng bộ đếm của (tên, chủ thể) trong cửa sổ hiện tại. */
export async function hit(env: RateEnv, name: LimitName, subject: string, now: number): Promise<HitResult> {
  const windowStart = now - (now % WINDOW_SECONDS);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(await bucketOf(env, name, subject), windowStart)
    .first<{ count: number }>();
  const count = row?.count ?? 1;
  return { allowed: count <= LIMITS[name], count, retryAfter: windowStart + WINDOW_SECONDS - now };
}

/** IP đã chạm ngưỡng thất bại trong giờ này chưa (chỉ đọc, không đếm thêm). Trả số giây phải chờ, hoặc 0. */
export async function failureBlock(env: RateEnv, ip: string, now: number): Promise<number> {
  const windowStart = now - (now % WINDOW_SECONDS);
  const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?")
    .bind(await bucketOf(env, "failure_ip", ip), windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 0) >= LIMITS.failure_ip ? windowStart + WINDOW_SECONDS - now : 0;
}

/** Đếm một lần thất bại của IP; đúng lúc chạm ngưỡng thì ghi log và tạo cảnh báo many_failures. */
export async function noteFailure(env: RateEnv, ip: string, now: number, what: string): Promise<void> {
  const { count } = await hit(env, "failure_ip", ip, now);
  if (count === LIMITS.failure_ip) {
    console.warn(JSON.stringify({ event: "many_failures", what, count, window_seconds: WINDOW_SECONDS }));
    await raiseAlert(env.DB, "many_failures", now);
  }
}

/** Dọn bộ đếm cũ: mỗi dòng sống tối đa khoảng 3 giờ (cửa sổ 1 giờ, xóa khi đã cũ hơn 2 giờ). */
export async function pruneRateLimits(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now - 2 * WINDOW_SECONDS),
    db.prepare("DELETE FROM ops_alerts WHERE window_start < ?").bind(now - 7 * 86400),
  ]);
}
