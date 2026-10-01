// Việc định kỳ của Cron Trigger (mỗi 5 phút, §9):
// - hỏi cổng thanh toán các đơn chưa xác nhận, phòng khi webhook đến chậm hoặc mất;
// - gửi lại email mua hàng chưa gửi được;
// - gửi cảnh báo cho người vận hành; dọn bộ đếm cũ.
import { sendAlerts } from "./alerts";
import type { Deps } from "./deps";
import { fulfilOrder, retryUnsentEmails } from "./orders";
import { pruneRateLimits } from "./ratelimit";

/** Giờ đầu hỏi mỗi lần chạy (5 phút), sau đó mỗi giờ một lần, tới 24 giờ thì thôi và coi là hết hạn. */
const RECHECK_FIRST_HOUR = 240;
const RECHECK_LATER = 3540;
const GIVE_UP_AFTER = 86400;
const BATCH = 50;

export interface ReconcileResult {
  checked: number;
  granted: number;
  errors: number;
  emails_retried: number;
  alerts_sent: number;
}

export async function reconcile(
  env: { DB: D1Database; ENVIRONMENT: string; PLANS?: unknown; OPERATOR_EMAIL?: string },
  deps: Deps,
): Promise<ReconcileResult> {
  const now = deps.now();
  // Đơn chuyển thiếu vẫn được hỏi lại trong 24 giờ: khách có thể chuyển bù (§9).
  const { results } = await env.DB.prepare(
    `SELECT order_code FROM orders
     WHERE status IN ('pending', 'processing', 'underpaid') AND created_at >= ?1 - ?2
       AND (last_checked_at IS NULL
            OR last_checked_at <= ?1 - CASE WHEN created_at >= ?1 - 3600 THEN ?3 ELSE ?4 END)
     ORDER BY created_at LIMIT ?5`,
  )
    .bind(now, GIVE_UP_AFTER, RECHECK_FIRST_HOUR, RECHECK_LATER, BATCH)
    .all<{ order_code: number }>();
  let granted = 0;
  let errors = 0;
  for (const { order_code } of results) {
    try {
      if ((await fulfilOrder(env, deps, order_code, "reconcile")) === "granted") granted++;
    } catch (err) {
      errors++;
      console.error(JSON.stringify({ event: "reconcile_failed", order_code, error: String(err) }));
      await env.DB.prepare("UPDATE orders SET last_checked_at = ? WHERE order_code = ?").bind(now, order_code).run();
    }
  }
  await env.DB.prepare(
    "UPDATE orders SET status = 'expired' WHERE status IN ('pending', 'processing') AND created_at < ? - ?",
  )
    .bind(now, GIVE_UP_AFTER)
    .run();
  const emailsRetried = await retryUnsentEmails(env, deps);
  const alertsSent = await sendAlerts(env, deps.email, now);
  await pruneRateLimits(env.DB, now);
  return { checked: results.length, granted, errors, emails_retried: emailsRetried, alerts_sent: alertsSent };
}
