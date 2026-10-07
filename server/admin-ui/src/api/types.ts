// Kiểu dữ liệu trả về của API Worker admin (server/src/admin.ts, admin-read.ts). Giữ khớp tay với server;
// test của server khóa hình dạng phản hồi.

export type PlanCode = "monthly" | "yearly";

export type OrderStatus =
  | "pending"
  | "processing"
  | "paid"
  | "underpaid"
  | "cancelled"
  | "expired"
  | "failed"
  | "paid_needs_review"
  | "refunded";

export interface OrderRow {
  order_code: number;
  provider: string;
  plan: PlanCode;
  amount: number;
  amount_paid: number;
  currency: string;
  email: string | null;
  status: OrderStatus;
  grant_kind: string | null;
  license_id: string | null;
  renew_license_id: string | null;
  created_at: number;
  paid_at: number | null;
  email_sent_at: number | null;
  email_gave_up_at: number | null;
}

export interface LicenseRow {
  id: string;
  /** Đã che: "K7Q2-…-9XMB". */
  license_key: string;
  email: string | null;
  plan: PlanCode;
  expires_at: number;
  created_at: number;
  revoked_at: number | null;
  locked_at: number | null;
  active_devices: number;
}

export interface TrialRow {
  device_id_hash: string;
  started_at: number;
  ends_at: number;
  last_seen_at: number;
  purchased: boolean;
}

export interface AuditRow {
  id: number;
  at: number;
  actor: string;
  action: string;
  license_id: string | null;
  order_code: number | null;
  detail: string | null;
}

/** Dòng nhật ký trong kết quả lookup: không có id, license_id. */
export interface LicenseAuditRow {
  at: number;
  actor: string;
  action: string;
  order_code: number | null;
  detail: string | null;
}

export interface Activation {
  id: string;
  license_id: string;
  device_id_hash: string;
  device_label: string | null;
  quota_epoch: number;
  created_at: number;
  last_validated_at: number;
  deactivated_at: number | null;
  deactivated_by: string | null;
}

export interface LicenseDetail {
  id: string;
  /** Key đầy đủ, có gạch nối. */
  license_key: string;
  email: string | null;
  plan: PlanCode;
  expires_at: number;
  created_at: number;
  revoked_at: number | null;
  locked_at: number | null;
  conflict: boolean;
  activations: Activation[];
  audit: LicenseAuditRow[];
}

export interface Trial {
  started_at: number;
  ends_at: number;
  last_seen_at: number;
}

export interface LookupResult {
  licenses: LicenseDetail[];
  orders: OrderRow[];
  /** Chỉ có khi tra theo máy; null là máy chưa đăng ký dùng thử. */
  trial?: Trial | null;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface QueueGroup<T> {
  count: number;
  items: T[];
}

export interface AlertRow {
  kind: string;
  window_start: number;
  count: number;
  notified_count: number;
}

export interface Queue {
  needs_review: QueueGroup<OrderRow>;
  underpaid: QueueGroup<OrderRow>;
  email_failed: QueueGroup<OrderRow>;
  locked: QueueGroup<LicenseRow>;
  conflict: QueueGroup<LicenseRow>;
  alerts: QueueGroup<AlertRow>;
}

export interface Summary {
  revenue_today: number;
  currency: string;
  paid_orders_7d: number;
  active_licenses: number;
}

export interface IssuedLicense {
  license_id: string;
  license_key: string;
  plan: PlanCode;
  expires_at: number;
}

/** Phản hồi của /admin/orders/:code/payment-status: trạng thái đơn do cổng thanh toán báo (PaymentStatusResult của server). */
export interface PaymentStatus {
  orderCode: number;
  status: string;
  amount: number;
  amountPaid: number;
  /** Thời điểm giao dịch gần nhất cổng báo (giây Unix); null nếu cổng không báo. */
  paidAt: number | null;
}

export interface KeyCheck {
  slot: string;
  kid: string;
  token: string;
}

export interface EraseResult {
  activations: number;
  licenses: number;
  orders: number;
}
