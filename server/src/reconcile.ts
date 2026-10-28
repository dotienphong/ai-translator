// Việc định kỳ của Cron Trigger (mỗi 5 phút, §9):
// - hỏi cổng thanh toán các đơn chưa xác nhận, phòng khi webhook đến chậm hoặc mất;
// - gửi lại email mua hàng chưa gửi được;
// - gửi cảnh báo cho người vận hành; dọn bộ đếm cũ và báo cáo lỗi quá hạn (spec 2026-10-17 §3);
// - chat hỗ trợ: gửi lại tin chưa tới Zalo, gửi email câu trả lời, xóa cuộc chat quá 90 ngày (spec 2026-10-22 §2.6).
// Mỗi bước chạy riêng: một bước lỗi thì ghi log, các bước sau vẫn chạy.
import { type AlertKind, authFailedAlert, raiseAlert, sendAlerts } from "./alerts";
import type { Deps } from "./deps";
import { pruneErrorReports } from "./error-reports";
import { fulfilOrder, retryUnsentEmails } from "./orders";
import { isProviderAuthFailure, PaymentProviderError } from "./payment/provider";
import { pruneRateLimits } from "./ratelimit";
import { evaluateSpeakerHealth, pruneSpeakerHealth } from "./speaker-health";
import { forwardPendingSupport, pruneSupport, sendSupportEmails } from "./support/cron";

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

/**
 * Cổng trả lời mà không đọc được thành trạng thái đơn (A5d): dữ liệu mâu thuẫn hay sai dạng (lỗi không có mã HTTP, hay 2xx mà thân
 * không dùng được), chuyển hướng (3xx), không thấy đơn (404). Hỏi lại không tự khỏi: đơn khách đã trả sẽ thành `expired` sau 24
 * giờ mà không ai được báo, nên phải cảnh báo. Không gồm lỗi tạm (5xx, 429, không liên lạc được: lần sau hỏi lại) và lỗi khóa
 * (401, 403: cảnh báo riêng của cổng).
 */
function unreadableStatus(err: unknown): boolean {
  if (!(err instanceof PaymentProviderError) || err.unreachable) return false;
  const status = err.httpStatus;
  return status === undefined || status < 400 || status === 404;
}

/**
 * Lỗi hỏi trạng thái của đơn này có sinh cảnh báo order_check_failed không (A5f). Chỉ khi:
 * - cổng không phải PayOS: lỗi tạm của PayOS (quá thời gian lúc đọc thân, `code` lỗi kèm HTTP 200) cũng ra HTTP 200 không
 *   `unreachable`, không phân biệt được với dữ liệu hỏng; cảnh báo sẽ là cảnh báo giả mỗi khi PayOS chậm. PayOS chỉ có log
 *   `reconcile_failed` (và cảnh báo khóa payos_auth_failed) như trước;
 * - đơn đã có mã ở cổng (`provider_ref`): đơn chưa có phiên (tạo phiên lỗi) thì không có gì để đọc, cảnh báo mỗi lượt đối soát chỉ
 *   là tiếng ồn;
 * - và lỗi là không đọc được trạng thái (unreadableStatus).
 */
function checkFailedAlert(order: { provider: string; provider_ref: string | null }, err: unknown): boolean {
  return order.provider !== "payos" && !!order.provider_ref && unreadableStatus(err);
}

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
      `SELECT order_code, provider, provider_ref FROM orders
       WHERE status IN ('pending', 'processing', 'underpaid') AND created_at >= ?1 - ?2
         AND (last_checked_at IS NULL
              OR last_checked_at <= ?1 - CASE WHEN created_at >= ?1 - 3600 THEN ?3 ELSE ?4 END)
       ORDER BY created_at LIMIT ?5`,
    )
      .bind(now, GIVE_UP_AFTER, RECHECK_FIRST_HOUR, RECHECK_LATER, BATCH)
      .all<{ order_code: number; provider: string; provider_ref: string | null }>();
    let serverErrors = 0;
    for (const [i, order] of results.entries()) {
      const { order_code, provider } = order;
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
        // Khóa API bị từ chối: đơn CŨ có thể đã được khách trả mà chưa cấp (cảnh báo nói mốc 24 giờ). Loại theo cổng của đơn. Không
        // đọc được trạng thái đơn (checkFailedAlert): order_check_failed. Mỗi đơn lỗi một lần đếm; lỗi ghi cảnh báo chỉ vào log, đối
        // soát vẫn hỏi tiếp các đơn còn lại.
        const authKind = authFailedAlert(provider);
        const kind: AlertKind | null =
          authKind !== null && isProviderAuthFailure(err) ? authKind : checkFailedAlert(order, err) ? "order_check_failed" : null;
        if (kind !== null) {
          try {
            await raiseAlert(env.DB, kind, now);
          } catch (alertErr) {
            console.error(JSON.stringify({ event: "reconcile_alert_failed", order_code, provider, kind, error: String(alertErr) }));
          }
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
  // Trước send_alerts, để cảnh báo support_zalo_failed của lần này đi luôn trong lần gửi cảnh báo này.
  await step("support_forward", () => forwardPendingSupport(env.DB, deps, now));
  await step("support_emails", async () => {
    await sendSupportEmails(env.DB, deps, now);
  });
  // Trước send_alerts, để cảnh báo bộ đọc tên của lần này đi luôn trong lần gửi cảnh báo này.
  await step("speaker_health_alerts", async () => {
    await evaluateSpeakerHealth(env.DB, now);
  });
  let alertsSent = 0;
  await step("send_alerts", async () => {
    alertsSent = await sendAlerts(env, deps.email, now);
  });
  await step("prune", () => pruneRateLimits(env.DB, now));
  await step("prune_error_reports", () => pruneErrorReports(env.DB, now));
  await step("prune_speaker_health", () => pruneSpeakerHealth(env.DB, now));
  await step("support_prune", () => pruneSupport(env.DB, now));
  return { checked, granted, errors, emails_retried: emailsRetried, alerts_sent: alertsSent };
}
