import type { ReactNode } from "react";
import type { OrderStatus, PlanCode } from "../api/types";

export type Tone = "ok" | "warn" | "bad" | "muted";

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

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

const ORDER_TONES: Record<OrderStatus, Tone> = {
  pending: "muted",
  processing: "muted",
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
      {!revoked && license.locked_at !== null && <Badge tone="warn">Khóa tạm</Badge>}
      {!revoked && license.conflict && <Badge tone="warn">Xung đột máy</Badge>}
    </>
  );
}
