// Thư nhắc gia hạn trước 3 ngày cho khách đã mua gói 6 tháng hay 1 năm và có email (spec 2026-11-02-nhac-gia-han-qua-email-design.md).
// Chạy trong cron */5 (reconcile.ts), hai pha, đều cô lập: lỗi ở đây chỉ ghi log, không chặn đối soát đơn hay việc gửi key.
// - enqueueExpiryReminders: license còn hạn ≤ 3 ngày thì thêm một dòng (license, mốc hạn) vào expiry_reminders; chạy lại bao nhiêu
//   lần cũng ra một dòng (khóa chính).
// - sendExpiryReminders: kiểm lại trạng thái license NGAY trước khi gửi (đã gia hạn, thu hồi, hết email, đã ngừng nhận thì bỏ qua),
//   chỉ gửi trong khung 08:00–20:00 giờ Việt Nam, tối đa BATCH thư mỗi lần, idempotency key theo (license, mốc hạn).
// Không đụng luồng thư key, đơn hàng hay license: chỉ đọc licenses và orders, chỉ ghi expiry_reminders.
import { hmacSha256Hex, sha256Hex, timingSafeEqual } from "./crypto";
import { type EmailProvider, EmailProviderError, maskEmail } from "./email/provider";
import { expiryReminderEmail } from "./email/reminder";
import { mailLang } from "./email/templates";
import type { Lang } from "./lang";
import { DAY_SECONDS, type PlanCode, parsePlans } from "./plans";

/** Gói được nhắc. Gói monthly không nhắc (chủ dự án chỉ chọn 6 tháng và 1 năm). */
export const REMINDER_PLANS: readonly PlanCode[] = ["six_months", "yearly"];
/** Nhắc khi còn tối đa từng này ngày. */
export const REMINDER_DAYS = 3;
/** Khung giờ gửi, giờ Việt Nam (UTC+7): từ 08:00 tới trước 20:00. */
export const SEND_FROM_HOUR = 8;
export const SEND_TO_HOUR = 20;
/** Trần số thư mỗi lần cron: dưới giới hạn 10 request mỗi giây của Resend và giới hạn subrequest của một lần chạy Worker. */
export const BATCH = 20;
export const MAX_ATTEMPTS = 5;
/** Đang gửi: không lần chạy nào khác lấy dòng này trong khoảng này (Worker chết giữa chừng thì sau đó thử lại, cùng idempotency key). */
const LEASE_SECONDS = 900;
/** Khoảng chờ sau lần lỗi tạm thứ n (n = 1, 2, 3…); từ lần thứ 4 trở đi là 12 giờ. */
const RETRY_DELAYS = [600, 3600, 6 * 3600];

/** Link ngừng nhận trỏ về Worker API (tên miền api.aitranslator.vn, spec 2026-10-23-ten-mien). */
const API_URL = "https://api.aitranslator.vn";
const UNSUBSCRIBE_PREFIX = "unsubscribe-reminders:v1:";

export interface ReminderEnv {
  DB: D1Database;
  /** "on" thì chạy; thiếu hay giá trị khác thì tắt (test cũ và môi trường chưa áp migration 0008 không bị ảnh hưởng). */
  EXPIRY_REMINDERS?: string | undefined;
  PLANS?: unknown;
  RATE_LIMIT_PEPPER?: string | undefined;
}

export const remindersEnabled = (env: Pick<ReminderEnv, "EXPIRY_REMINDERS">) => env.EXPIRY_REMINDERS === "on";

/** SHA-256 của email viết thường: khóa của danh sách ngừng nhận (không lưu email). */
export const emailHash = (email: string) => sha256Hex(email.trim().toLowerCase());

/** Mã trong link ngừng nhận: `<mã băm email>.<HMAC>`. HMAC khóa bằng RATE_LIMIT_PEPPER, nên không ai ngừng nhận thay người khác được. */
export async function unsubscribeToken(pepper: string, hash: string): Promise<string> {
  return `${hash}.${await hmacSha256Hex(pepper, UNSUBSCRIBE_PREFIX + hash)}`;
}

/** Trả mã băm email nếu mã hợp lệ, không thì null. */
export async function verifyUnsubscribeToken(pepper: string, token: string): Promise<string | null> {
  const m = /^([0-9a-f]{64})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return null;
  const [, hash, mac] = m as unknown as [string, string, string];
  const expected = await hmacSha256Hex(pepper, UNSUBSCRIBE_PREFIX + hash);
  return timingSafeEqual(mac, expected) ? hash : null;
}

export const unsubscribeUrl = async (pepper: string, hash: string) => `${API_URL}/email/unsubscribe?t=${await unsubscribeToken(pepper, hash)}`;

/** Giờ (0–23) theo giờ Việt Nam. */
export const vnHour = (now: number) => Math.floor(((now + 7 * 3600) % DAY_SECONDS) / 3600);
export const inSendWindow = (now: number) => vnHour(now) >= SEND_FROM_HOUR && vnHour(now) < SEND_TO_HOUR;

/** Xếp lịch: mỗi license đủ điều kiện và còn ≤ 3 ngày thì có đúng một dòng cho mốc hạn hiện tại. Trả số dòng mới. */
export async function enqueueExpiryReminders(db: D1Database, now: number): Promise<number> {
  const [a = "", b = ""] = REMINDER_PLANS;
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO expiry_reminders (license_id, cycle, created_at)
       SELECT id, expires_at, ?1 FROM licenses
       WHERE revoked_at IS NULL AND email IS NOT NULL AND plan IN (?2, ?3)
         AND expires_at > ?1 AND expires_at <= ?1 + ?4`,
    )
    .bind(now, a, b, REMINDER_DAYS * DAY_SECONDS)
    .run();
  return res.meta.changes ?? 0;
}

interface Candidate {
  license_id: string;
  cycle: number;
  attempts: number;
  license_key: string;
  email: string | null;
  plan: PlanCode;
  expires_at: number;
  revoked_at: number | null;
}

export interface SendResult {
  sent: number;
  skipped: number;
  failed: number;
}

async function mark(db: D1Database, r: Pick<Candidate, "license_id" | "cycle">, set: string, ...values: unknown[]): Promise<void> {
  await db
    .prepare(`UPDATE expiry_reminders SET ${set} WHERE license_id = ? AND cycle = ?`)
    .bind(...values, r.license_id, r.cycle)
    .run();
}

/** Gửi các thư tới hạn. `deps.email` là Resend (hay bản giả khi test). */
export async function sendExpiryReminders(env: ReminderEnv, deps: { email: EmailProvider; now: () => number }): Promise<SendResult> {
  const result: SendResult = { sent: 0, skipped: 0, failed: 0 };
  const now = deps.now();
  const pepper = env.RATE_LIMIT_PEPPER;
  if (!pepper) throw new Error("thiếu RATE_LIMIT_PEPPER");
  const plans = parsePlans(env.PLANS);
  if (!plans) {
    console.error(JSON.stringify({ event: "expiry_reminders_no_plans" }));
    return result;
  }
  const db = env.DB;
  const { results } = await db
    .prepare(
      `SELECT r.license_id, r.cycle, r.attempts, l.license_key, l.email, l.plan, l.expires_at, l.revoked_at
       FROM expiry_reminders r JOIN licenses l ON l.id = r.license_id
       WHERE r.status = 'pending' AND (r.retry_at IS NULL OR r.retry_at <= ?1)
       ORDER BY r.created_at LIMIT ?2`,
    )
    .bind(now, BATCH)
    .all<Candidate>();
  const inWindow = inSendWindow(now);

  for (const r of results) {
    // Lỗi ở một dòng (ví dụ D1 lỗi tạm) không chặn các dòng sau; dòng đó còn `pending` nên lần cron sau thử lại.
    try {
      const skip = async (reason: string) => {
        await mark(db, r, "status = 'skipped', skip_reason = ?", reason);
        result.skipped++;
      };
      // Kiểm lại trạng thái license ngay trước khi gửi, không tin vào lúc xếp lịch.
      if (r.revoked_at !== null) {
        await skip("revoked");
        continue;
      }
      if (r.email === null) {
        await skip("no_email");
        continue;
      }
      if (!REMINDER_PLANS.includes(r.plan)) {
        await skip("plan_not_eligible");
        continue;
      }
      if (r.expires_at !== r.cycle) {
        // Đã gia hạn (hay admin đổi hạn): mốc hạn mới sẽ có dòng riêng khi tới 3 ngày.
        await skip("changed");
        continue;
      }
      if (r.expires_at <= now) {
        await skip("expired_before_send");
        continue;
      }
      const hash = await emailHash(r.email);
      const optedOut = await db.prepare("SELECT 1 AS x FROM reminder_optouts WHERE email_hash = ?").bind(hash).first();
      if (optedOut) {
        await skip("opted_out");
        continue;
      }
      if (!inWindow) continue; // ngoài khung giờ gửi: để lại, sáng mai gửi

      // Giành quyền gửi: hai lần cron chồng nhau không cùng gửi một dòng.
      const claim = await db
        .prepare(
          `UPDATE expiry_reminders SET attempts = attempts + 1, retry_at = ?3
           WHERE license_id = ?1 AND cycle = ?2 AND status = 'pending' AND (retry_at IS NULL OR retry_at <= ?4)`,
        )
        .bind(r.license_id, r.cycle, now + LEASE_SECONDS, now)
        .run();
      if (claim.meta.changes !== 1) continue;
      const attempts = r.attempts + 1;

      // Ngôn ngữ và loại tiền theo đơn đã trả gần nhất của license; license cấp tay (không có đơn) thì đoán như thư key.
      const order = await db
        .prepare("SELECT lang, currency FROM orders WHERE license_id = ? AND status = 'paid' ORDER BY paid_at DESC, order_code DESC LIMIT 1")
        .bind(r.license_id)
        .first<{ lang: Lang | null; currency: string }>();
      const plan = plans[r.plan];
      const currency = order && order.currency in plan.prices ? order.currency : "VND";
      const price = plan.prices[currency];
      if (price === undefined) throw new Error(`thiếu giá ${currency} của gói ${r.plan}`);
      const msg = expiryReminderEmail({
        lang: mailLang(order?.lang ?? null, order?.currency ?? null),
        plan: r.plan,
        licenseKey: r.license_key,
        expiresAt: r.expires_at,
        daysLeft: Math.min(REMINDER_DAYS, Math.max(1, Math.ceil((r.expires_at - now) / DAY_SECONDS))),
        currency,
        price,
        addDays: plan.days_per_order,
        unsubscribeUrl: await unsubscribeUrl(pepper, hash),
      });

      let ok = false;
      let permanent = false;
      try {
        await deps.email.send({
          to: r.email,
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
          idempotencyKey: `expiry-reminder-${r.license_id}-${r.cycle}`,
        });
        ok = true;
      } catch (err) {
        if (err instanceof EmailProviderError && err.alreadySent) {
          ok = true; // lần gửi trước đã được Resend nhận
        } else {
          permanent = err instanceof EmailProviderError && err.permanent;
          console.error(
            JSON.stringify({ event: "expiry_reminder_failed", license_id: r.license_id, to: maskEmail(r.email), attempts, permanent, error: String(err) }),
          );
        }
      }
      if (ok) {
        await mark(db, r, "status = 'sent', sent_at = ?, retry_at = NULL", now);
        result.sent++;
      } else if (permanent || attempts >= MAX_ATTEMPTS) {
        await mark(db, r, "status = 'gave_up', retry_at = NULL");
        result.failed++;
      } else {
        await mark(db, r, "retry_at = ?", now + (RETRY_DELAYS[attempts - 1] ?? 12 * 3600));
        result.failed++;
      }
    } catch (err) {
      result.failed++;
      console.error(JSON.stringify({ event: "expiry_reminder_row_failed", license_id: r.license_id, error: String(err) }));
    }
  }
  return result;
}

/** Một bước cron: xếp lịch rồi gửi. Tắt (mặc định) thì không làm gì và không đụng D1. */
export async function runExpiryReminders(env: ReminderEnv, deps: { email: EmailProvider; now: () => number }): Promise<void> {
  if (!remindersEnabled(env)) return;
  const queued = await enqueueExpiryReminders(env.DB, deps.now());
  const r = await sendExpiryReminders(env, deps);
  if (queued > 0 || r.sent > 0 || r.skipped > 0 || r.failed > 0) {
    console.log(JSON.stringify({ event: "expiry_reminders", queued, sent: r.sent, skipped: r.skipped, failed: r.failed }));
  }
}
