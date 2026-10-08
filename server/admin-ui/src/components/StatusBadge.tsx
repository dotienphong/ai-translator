// Nhãn trạng thái theo nghiệp vụ (đơn, license) và nhãn tiếng Việt; huy hiệu chung nằm ở Badge.tsx.
import type { OrderStatus, PlanCode } from "../api/types";
import { Badge, type Tone } from "./Badge";
import { IconLock } from "./icons";

export { Badge, type Tone };

export const PLAN_LABELS: Record<PlanCode, string> = { monthly: "Monthly", yearly: "Yearly" };

export const ORDER_LABELS: Record<OrderStatus, string> = {
  pending: "Chờ trả",
  processing: "Đang xử lý",
  paid: "Đã trả",
  underpaid: "Chuyển thiếu",
  cancelled: "Đã hủy",
  expired: "Hết hạn link",
  failed: "Lỗi",
  paid_needs_review: "Cần xử lý",
  refunded: "Đã hoàn tiền",
};

export const ORDER_TONES: Record<OrderStatus, Tone> = {
  // Đang chờ tiền hay đang xử lý: việc còn dở (xanh thông tin), khác với đơn đã khép (xám).
  pending: "info",
  processing: "info",
  paid: "ok",
  underpaid: "warn",
  cancelled: "muted",
  expired: "muted",
  failed: "bad",
  paid_needs_review: "bad",
  refunded: "muted",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONES[status] ?? "muted"}>{ORDER_LABELS[status] ?? status}</Badge>;
}

export interface LicenseState {
  revoked_at: number | null;
  expires_at: number;
  locked_at: number | null;
  conflict: boolean;
}

/** Nhãn của license: thu hồi, hết hạn hay còn hạn; thêm khóa tạm và xung đột máy khi chưa thu hồi. */
export function LicenseBadges({ license, now }: { license: LicenseState; now: number }) {
  const revoked = license.revoked_at !== null;
  return (
    <>
      {revoked ? (
        <Badge tone="bad">Đã thu hồi</Badge>
      ) : license.expires_at <= now ? (
        <Badge tone="muted">Hết hạn</Badge>
      ) : (
        <Badge tone="ok">Còn hạn</Badge>
      )}
      {!revoked && license.locked_at !== null && (
        <Badge tone="warn" icon={<IconLock size={12} strokeWidth={2.25} />}>
          Khóa tạm
        </Badge>
      )}
      {!revoked && license.conflict && <Badge tone="warn">Xung đột máy</Badge>}
    </>
  );
}
