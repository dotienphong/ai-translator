// Việc định kỳ của Cron Trigger (mỗi 5 phút, §9):
// - hỏi cổng thanh toán các đơn chưa xác nhận, phòng khi webhook đến chậm hoặc mất;
// - gửi lại email mua hàng chưa gửi được;
// - gửi cảnh báo cho người vận hành; dọn bộ đếm cũ.
// Mỗi bước chạy riêng: một bước lỗi thì ghi log, các bước sau vẫn chạy.
import { sendAlerts } from "./alerts";
import type { Deps } from "./deps";
import { fulfilOrder, retryUnsentEmails } from "./orders";
import { PaymentProviderError } from "./payment/provider";
import { pruneRateLimits } from "./ratelimit";

/** Giờ đầu hỏi mỗi lần chạy (5 phút), sau đó mỗi giờ một lần, tới 24 giờ thì thôi và coi là hết hạn. */
const RECHECK_FIRST_HOUR = 240;
const RECHECK_LATER = 3540;
const GIVE_UP_AFTER = 86400;
const BATCH = 50;
/**
 * Cổng trả 5xx hay không trả lời (lỗi mạng, quá thời gian chờ) liên tiếp từng này lần thì dừng đợt hỏi; 429 thì dừng ngay.
 * Lỗi khác (4xx, dữ liệu lạ, D1) không tính và đặt lại bộ đếm.
 */
const MAX_SERVER_ERRORS_IN_A_ROW = 3;

export interface ReconcileResult {
  /** Số đơn đã hỏi cổng thanh toán trong lần chạy này. */
  checked: number;
  granted: number;
  errors: number;
  emails_retried: number;
  alerts_sent: number;
}

async function step(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.error(JSON.stringify({ event: "reconcile_step_failed", step: name, error: String(err) }));
  }
}

export async function reconcile(
  env: { DB: D1Database; ENVIRONMENT: string; PLANS?: unknown; OPERATOR_EMAIL?: string },
  deps: Deps,
): Promise<ReconcileResult> {
  const now = deps.now();
  let checked = 0;
  let granted = 0;
  let errors = 0;
  await step("check_orders", async () => {
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
    let serverErrors = 0;
    for (const [i, { order_code }] of results.entries()) {
      checked++;
      try {
        if ((await fulfilOrder(env, deps, order_code, "reconcile")) === "granted") granted++;
        serverErrors = 0;
      } catch (err) {
        errors++;
        console.error(JSON.stringify({ event: "reconcile_failed", order_code, error: String(err) }));
        try {
          await env.DB.prepare("UPDATE orders SET last_checked_at = ? WHERE order_code = ?").bind(now, order_code).run();
        } catch (markErr) {
          console.error(JSON.stringify({ event: "reconcile_mark_failed", order_code, error: String(markErr) }));
        }
        // Cổng đang quá tải hay đang lỗi: hỏi tiếp chỉ làm nặng thêm. Các đơn còn lại để lần cron sau.
        const status = err instanceof PaymentProviderError ? err.httpStatus : undefined;
        const unavailable = err instanceof PaymentProviderError && (err.unreachable || (status !== undefined && status >= 500));
        serverErrors = unavailable ? serverErrors + 1 : 0;
        const reason = status === 429 ? "rate_limited" : serverErrors >= MAX_SERVER_ERRORS_IN_A_ROW ? "server_errors" : null;
        if (reason) {
          console.warn(JSON.stringify({ event: "reconcile_stopped_early", reason, skipped: results.length - i - 1 }));
          break;
        }
      }
    }
  });
  await step("expire_orders", async () => {
    await env.DB.prepare("UPDATE orders SET status = 'expired' WHERE status IN ('pending', 'processing') AND created_at < ? - ?")
      .bind(now, GIVE_UP_AFTER)
      .run();
  });
  let emailsRetried = 0;
  await step("retry_emails", async () => {
    emailsRetried = await retryUnsentEmails(env, deps);
  });
  let alertsSent = 0;
  await step("send_alerts", async () => {
    alertsSent = await sendAlerts(env, deps.email, now);
  });
  await step("prune", () => pruneRateLimits(env.DB, now));
  return { checked, granted, errors, emails_retried: emailsRetried, alerts_sent: alertsSent };
}
