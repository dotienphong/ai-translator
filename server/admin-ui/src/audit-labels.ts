// Tên dễ đọc và tông màu của các mã hành động trong nhật ký (server ghi ở audit.ts, admin*.ts, licenses.ts, orders.ts,
// checkout.ts). Mã lạ (server thêm sau) vẫn hiện nguyên mã, tông trung tính. Tông theo nghĩa: ok là cấp hay gia hạn sau khi
// nhận tiền, info là thao tác tay của người vận hành, warn là việc cần để mắt, bad là thu hồi, lỗi, xóa dữ liệu.
import type { TimelineTone } from "./components/Timeline";

type Tone = Exclude<TimelineTone, "default">;

const LABELS: Record<string, readonly [string, Tone?]> = {
  // License theo đơn đã trả (webhook, đối soát)
  license_issued: ["Cấp license", "ok"],
  license_extended: ["Gia hạn license", "ok"],
  license_plan_changed: ["Đổi gói license", "ok"],
  // Máy
  activated: ["Kích hoạt máy"],
  reactivated: ["Kích hoạt lại máy"],
  deactivated: ["Gỡ máy trong app"],
  license_locked: ["Khóa tạm license", "warn"],
  license_conflict: ["Xung đột máy", "warn"],
  // Đơn
  order_created: ["Tạo đơn"],
  order_underpaid: ["Chuyển thiếu", "warn"],
  order_amount_mismatch: ["Số tiền không khớp", "warn"],
  order_needs_review: ["Đơn cần xử lý", "bad"],
  // Người vận hành
  license_issued_manually: ["Cấp license tay", "info"],
  license_extended_manually: ["Gia hạn tay", "info"],
  license_unlocked: ["Mở khóa license", "info"],
  license_revoked: ["Thu hồi license", "bad"],
  deactivated_by_admin: ["Gỡ máy (vận hành)", "info"],
  quota_reset: ["Reset hạn mức máy", "info"],
  key_resent: ["Gửi lại email key", "info"],
  order_granted_manually: ["Cấp tay cho đơn", "info"],
  order_review_granted: ["Cấp key mới cho đơn", "info"],
  order_refunded_outside: ["Ghi đã hoàn tiền", "info"],
  order_grant_rejected: ["Không cấp tay được", "warn"],
  order_resolve_rejected: ["Không xử lý được đơn", "warn"],
  personal_data_erased: ["Ẩn danh dữ liệu", "bad"],
  key_check_signed: ["Ký thử khóa", "info"],
  key_check_failed: ["Ký thử khóa lỗi", "bad"],
  payos_webhook_confirmed: ["Xác nhận webhook PayOS", "info"],
  payos_webhook_confirm_failed: ["Xác nhận webhook lỗi", "bad"],
  // Lượt xem và tra cứu (ẩn mặc định, server: VIEW_ACTIONS)
  lookup: ["Tra cứu"],
  list_viewed: ["Xem danh sách"],
  queue_viewed: ["Xem việc cần xử lý"],
  summary_viewed: ["Xem số nhanh"],
  stats_viewed: ["Xem tổng quan"],
  payment_status_viewed: ["Xem trạng thái thanh toán"],
  alerts_viewed: ["Xem cảnh báo"],
  releases_viewed: ["Xem phát hành"],
};

export function actionLabel(action: string): string | undefined {
  return Object.hasOwn(LABELS, action) ? LABELS[action]?.[0] : undefined;
}

export function actionTone(action: string): TimelineTone {
  return (Object.hasOwn(LABELS, action) && LABELS[action]?.[1]) || "default";
}

export type ActorKind = "admin" | "api" | "webhook" | "reconcile";

/** Nhãn ngắn của bốn loại tác nhân (cũng là bốn giá trị lọc `actor` server nhận). */
export const ACTOR_LABELS: Record<ActorKind, string> = {
  admin: "Vận hành",
  api: "App",
  webhook: "Webhook",
  reconcile: "Đối soát",
};

/** `admin:<email>` thành admin; bốn loại đã biết thì giữ; còn lại là undefined. */
export function actorKind(actor: string): ActorKind | undefined {
  const k = actor.split(":", 1)[0] ?? "";
  return Object.hasOwn(ACTOR_LABELS, k) ? (k as ActorKind) : undefined;
}

/** Mọi mã hành động đã biết (gợi ý cho ô lọc hành động). */
export const KNOWN_ACTIONS: readonly string[] = Object.keys(LABELS);
