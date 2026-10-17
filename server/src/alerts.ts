// Cảnh báo cho người vận hành (§10.2 "cảnh báo khi có nhiều lần kiểm tra thất bại").
// Sự kiện được đếm theo loại và theo giờ trong D1; cron gửi email tới OPERATOR_EMAIL (secret, không nằm trong repo),
// tối đa một email mỗi loại mỗi giờ. Thiếu OPERATOR_EMAIL thì chỉ ghi log.
import type { EmailProvider } from "./email/provider";

export type AlertKind =
  | "many_failures"
  | "webhook_bad_signature"
  | "email_failed"
  | "license_locked"
  | "order_needs_review"
  | "order_payment_review"
  | "order_refunded"
  | "order_partially_refunded"
  | "order_refund_unconfirmed"
  | "order_disputed"
  | "payment_unmatched"
  | "payos_auth_failed"
  | "creem_auth_failed"
  | "order_check_failed"
  | "error_report_new"
  | "diagnostics_flood";

/** Loại cảnh báo khi cổng (`orders.provider`) từ chối khóa API: mỗi cổng một loại, để thư chỉ đúng khóa cần thay. */
const AUTH_FAILED_ALERT = { payos: "payos_auth_failed", creem: "creem_auth_failed" } as const satisfies Record<string, AlertKind>;

/** Loại cảnh báo khóa API của cổng có tên này (`orders.provider`); null nếu cổng không có loại riêng (chỉ có log). */
export function authFailedAlert(provider: string): AlertKind | null {
  return Object.hasOwn(AUTH_FAILED_ALERT, provider) ? AUTH_FAILED_ALERT[provider as keyof typeof AUTH_FAILED_ALERT] : null;
}

/**
 * Email cảnh báo không mang mã đơn (gộp theo loại): chỉ cách tìm các đơn hoàn tiền hay tranh chấp ở Web Admin. Chỉ nhật ký tìm được
 * chúng: đơn `refunded` không có trong hàng đợi Việc cần xử lý.
 */
const FIND_REFUND_ORDERS =
  "Tìm đơn: lọc nhật ký ở Web Admin theo hành động order_refunded (hay order_partially_refunded, order_disputed, order_refund_unconfirmed).";

const ALERT_TEXT: Record<AlertKind, string> = {
  many_failures: "Một IP có từ 60 lần kiểm key hoặc activation thất bại trong 1 giờ (có thể đang dò key)",
  webhook_bad_signature: "Webhook thanh toán sai chữ ký (có thể bị giả mạo, hoặc checksum key sai)",
  email_failed: "Gửi email chứa license key thất bại (cron sẽ gửi lại)",
  license_locked: "Key bị khóa tạm vì gỡ rồi kích hoạt máy khác quá ngưỡng",
  order_needs_review: "License đã thu hồi nhận được tiền của một đơn gia hạn hay đổi gói; xử lý tay ở /admin/orders/<n>/resolve",
  order_payment_review:
    "Cổng báo đã trả nhưng số tiền khác giá đơn (lệch giá, mã giảm giá, hay thuế tính khác giả định): đơn không được cấp tự động " +
    "(failed hoặc underpaid). Mở đơn ở Web Admin, xem trạng thái trên cổng, rồi cấp tay hay hoàn tiền. " +
    "Tìm đơn: lọc nhật ký ở Web Admin theo hành động order_amount_mismatch hay order_underpaid (thư này không mang mã đơn; đơn underpaid cũng có ở trang Việc cần xử lý).",
  order_refunded:
    "Cổng thanh toán báo một đơn đã được hoàn đủ: đơn thành refunded và không bao giờ được cấp key nữa; license đã cấp (nếu có) giữ nguyên. " +
    `${FIND_REFUND_ORDERS} Với đơn gia hạn/đổi gói dùng Rút ngắn hạn ở Web Admin, với đơn mua mới thì thu hồi tay nếu cần`,
  order_partially_refunded:
    "Cổng thanh toán báo một đơn được hoàn tiền một phần (trạng thái đơn không đổi; nhật ký có số đã hoàn và lý do). " +
    `${FIND_REFUND_ORDERS} Với đơn gia hạn/đổi gói dùng Rút ngắn hạn ở Web Admin nếu cần`,
  order_refund_unconfirmed:
    "Cổng thanh toán báo một lần hoàn tiền chưa thành công (đang chờ hay thất bại); trạng thái đơn không đổi, nên đơn chưa cấp vẫn có " +
    "thể được cấp tự động khi cổng báo đã trả. Kiểm lần hoàn ở dashboard của cổng (hoàn xong sau đó thì cổng có thể không báo thêm) " +
    `và, nếu cần, thu hồi hay rút ngắn hạn license sau khi hoàn tiền xong. ${FIND_REFUND_ORDERS}`,
  order_disputed:
    "Khách mở tranh chấp (chargeback) cho một đơn; nếu cổng báo đã lấy lại đủ tiền thì đơn thành refunded. " +
    `${FIND_REFUND_ORDERS} Với đơn gia hạn/đổi gói dùng Rút ngắn hạn ở Web Admin, với đơn mua mới thì cân nhắc thu hồi license`,
  payment_unmatched:
    "Cổng thanh toán gửi một sự kiện thanh toán, hoàn tiền hay tranh chấp đúng chữ ký mà không khớp đơn nào của server (thường là " +
    "khách trả qua link công khai hay Storefront của sản phẩm, hay sản phẩm khác cùng tài khoản; cũng có thể là sự kiện thử gửi từ " +
    "dashboard; loại sự kiện null là thân đã ký mà không đọc được, cổng có thể đã đổi định dạng). Không có key nào được cấp. " +
    "Tìm: lọc nhật ký ở Web Admin theo hành động payment_unmatched (có loại sự kiện và mã ở cổng), tra mã đó ở dashboard của " +
    "cổng; khách đã trả thật thì tạo license tay ở Web Admin hay hoàn tiền. " +
    "Với hoàn tiền hay tranh chấp (event_type refund.created/dispute.created): tra request_id của phiên ở dashboard Creem; nếu là " +
    "đơn của ta thì mở đơn ở Web Admin: đơn paid_needs_review thì bấm Ghi đã hoàn tiền, đơn ở trạng thái khác thì Web Admin chưa " +
    "có nút này (đơn chưa cấp vẫn có thể được cấp tự động; thu hồi hay rút ngắn hạn license nếu cần). " +
    "provider_ref có tiền tố ch_ (phiên), ref_ (lần hoàn), disp_ (tranh chấp)",
  payos_auth_failed:
    "PayOS từ chối khóa API (HTTP 401/403 có thân JSON của PayOS): khóa sai, bị thu hồi hay thiếu quyền. Đơn VND mới lỗi 502; " +
    "nếu cảnh báo đến từ đối soát thì có thể có đơn khách ĐÃ TRẢ đang chờ cấp: thay khóa trong 24 giờ (quá 24 giờ đơn thành expired, phải cấp tay). " +
    "Đặt lại `PAYOS_CLIENT_ID` và `PAYOS_API_KEY` cho cả Worker API và Worker admin.",
  creem_auth_failed:
    "Creem từ chối khóa API (HTTP 401/403 có thân JSON của Creem): khóa sai, bị thu hồi hay thiếu quyền. Đơn USD mới lỗi 502; " +
    "nếu cảnh báo đến từ đối soát thì có thể có đơn khách ĐÃ TRẢ đang chờ cấp: thay khóa trong 24 giờ (quá 24 giờ đơn thành expired, phải cấp tay). " +
    "Đặt lại `CREEM_API_KEY` cho cả Worker API và Worker admin.",
  order_check_failed:
    "Đối soát không đọc được trạng thái đơn từ cổng thanh toán (dữ liệu mâu thuẫn, 3xx hay 404). Nếu đơn đã được khách trả thì " +
    "tìm đơn trên dashboard của cổng; log `reconcile_failed` có mã đơn. Cảnh báo này đếm theo đơn và gộp mỗi giờ.",
  error_report_new:
    "Báo cáo lỗi từ app có dạng lỗi mới (dấu vân tay chưa từng thấy). Mở Web Admin, trang Báo cáo lỗi để xem nhóm và log. " +
    "Thư này chỉ có số lượng, không chứa nội dung log hay mã máy.",
  diagnostics_flood:
    "Endpoint báo cáo lỗi chạm trần toàn hệ thống (120 báo cáo mỗi giờ): có thể đang bị gửi tràn. Báo cáo bị từ chối (429) tới hết giờ. " +
    "Mở Web Admin, trang Báo cáo lỗi để xem nguồn, xóa báo cáo rác nếu cần.",
};
const HOUR = 3600;

export async function raiseAlert(db: D1Database, kind: AlertKind, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ops_alerts (kind, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (kind, window_start) DO UPDATE SET count = count + 1`,
    )
    .bind(kind, now - (now % HOUR))
    .run();
}

/**
 * Câu tạo cảnh báo để đặt trong batch, chỉ có tác dụng khi câu đứng ngay trước đổi đúng một dòng (`changes() = 1`).
 * Đi cùng batch với lệnh ghi dữ liệu, nên không có trường hợp dữ liệu đã đổi mà cảnh báo bị mất.
 */
export function alertIfChanged(db: D1Database, kind: AlertKind, now: number): D1PreparedStatement {
  // "WHERE" trước "ON CONFLICT" là bắt buộc khi INSERT … SELECT có upsert (tài liệu SQLite, mục "Parsing Ambiguity").
  return db
    .prepare(
      `INSERT INTO ops_alerts (kind, window_start, count) SELECT ?1, ?2, 1 WHERE changes() = 1
       ON CONFLICT (kind, window_start) DO UPDATE SET count = count + 1`,
    )
    .bind(kind, now - (now % HOUR));
}

/** Cảnh báo chỉ được gửi trong 24 giờ kể từ giờ của sự kiện. */
const REPORT_WITHIN = 86400;

interface AlertRow {
  kind: AlertKind;
  window_start: number;
  count: number;
  notified_count: number;
}

/** Gộp các dòng theo loại: số sự kiện chưa báo và giờ sớm nhất. Thứ tự theo tên loại. */
function byKind(rows: AlertRow[]): { kind: AlertKind; count: number; since: number; rows: AlertRow[] }[] {
  const groups = new Map<AlertKind, AlertRow[]>();
  for (const r of rows) groups.set(r.kind, [...(groups.get(r.kind) ?? []), r]);
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([kind, rs]) => ({
      kind,
      count: rs.reduce((n, r) => n + r.count - r.notified_count, 0),
      since: Math.min(...rs.map((r) => r.window_start)),
      rows: rs,
    }));
}

/**
 * Sự kiện chưa báo mà đã quá 24 giờ (email lỗi suốt một ngày, cron không chạy): không gửi nữa, nhưng ghi log mức error
 * một lần rồi đánh dấu đã báo. Câu đánh dấu có điều kiện `notified_count` vẫn như lúc đọc, nên hai lần cron chồng nhau chỉ ghi một lần.
 */
async function logExpired(db: D1Database, now: number): Promise<void> {
  const { results } = await db
    .prepare("SELECT kind, window_start, count, notified_count FROM ops_alerts WHERE count > notified_count AND window_start < ?1 - ?2")
    .bind(now, REPORT_WITHIN)
    .all<AlertRow>();
  if (results.length === 0) return;
  const marked = await db.batch(
    results.map((r) =>
      db
        .prepare("UPDATE ops_alerts SET notified_count = ?3 WHERE kind = ?1 AND window_start = ?2 AND notified_count = ?4")
        .bind(r.kind, r.window_start, r.count, r.notified_count),
    ),
  );
  for (const g of byKind(results.filter((_, i) => marked[i]?.meta.changes === 1))) {
    console.error(JSON.stringify({ event: "alert_expired_unreported", kind: g.kind, count: g.count, since: g.since }));
  }
}

/**
 * Gửi các cảnh báo chưa báo, gộp theo loại. Loại nào đã báo trong 1 giờ qua thì để lần sau.
 * - Giữ chỗ trước khi gửi: một câu UPDATE đặt notified_at cho các dòng sẽ báo và trả lại chúng (RETURNING). Lần cron
 *   chạy chồng thấy notified_at mới nên không giữ được dòng nào, không gửi trùng.
 * - Gửi xong thì đánh dấu đúng số sự kiện đã báo (số đọc được lúc giữ chỗ). Sự kiện tới trong lúc gửi còn nguyên cho lần sau.
 * - Gửi lỗi thì trả chỗ (notified_at về NULL) để lần cron sau thử lại (không tạo cảnh báo email_failed mới, tránh vòng lặp).
 */
export async function sendAlerts(
  env: { DB: D1Database; ENVIRONMENT: string; OPERATOR_EMAIL?: string },
  email: EmailProvider,
  now: number,
): Promise<number> {
  const db = env.DB;
  await logExpired(db, now);
  const { results } = await db
    .prepare(
      `UPDATE ops_alerts SET notified_at = ?1
       WHERE count > notified_count AND window_start >= ?1 - ?3
         AND kind NOT IN (SELECT kind FROM ops_alerts WHERE notified_at > ?1 - ?2)
       RETURNING kind, window_start, count, notified_count`,
    )
    .bind(now, HOUR, REPORT_WITHIN)
    .all<AlertRow>();
  let sent = 0;
  for (const a of byKind(results)) {
    console.warn(JSON.stringify({ event: "alert", kind: a.kind, count: a.count, since: a.since }));
    if (env.OPERATOR_EMAIL) {
      try {
        await email.send({
          to: env.OPERATOR_EMAIL,
          subject: `[license ${env.ENVIRONMENT}] Cảnh báo: ${a.kind} (${a.count})`,
          text: [
            ALERT_TEXT[a.kind],
            "",
            `Số lần: ${a.count}, từ ${new Date(a.since * 1000).toISOString()}.`,
            "Chi tiết ở Workers Logs; loại có nhật ký thì xem thêm bảng audit_log ở Web Admin.",
          ].join("\n"),
        });
        sent++;
      } catch (err) {
        console.error(JSON.stringify({ event: "alert_email_failed", kind: a.kind, error: String(err) }));
        await db.prepare("UPDATE ops_alerts SET notified_at = NULL WHERE kind = ? AND notified_at = ?").bind(a.kind, now).run();
        continue;
      }
    }
    await db.batch(
      a.rows.map((r) =>
        db
          .prepare("UPDATE ops_alerts SET notified_count = MAX(notified_count, ?3) WHERE kind = ?1 AND window_start = ?2")
          .bind(r.kind, r.window_start, r.count),
      ),
    );
  }
  return sent;
}
