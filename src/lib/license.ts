import type { Device, LicenseView, OrderOutcome, PlanOffer, QuotaView, Standing } from "./ipc";

// Hiển thị bản quyền và hạn mức (kế hoạch 06; spec §4.2 bước 2, §4.3 "Bản quyền", "Nâng cấp"). Chỉ đọc kết quả phía Rust
// trả về; không tự tính gói hay hạn mức.

// Số phút còn lại, làm tròn xuống (không hứa nhiều hơn số thật).
export function minutesLeft(quota: QuotaView): number {
  return Math.floor(quota.remainingMs / 60_000);
}

// Giờ đã dùng của chu kỳ (gói trả phí), một chữ số thập phân.
export function hoursUsed(quota: QuotaView): number {
  return Math.round(quota.usedMs / 360_000) / 10;
}

// Khóa câu tóm tắt hạn mức ở màn hình chính và nhóm Bản quyền.
export type QuotaKey =
  | "quota.unlimited"
  | "quota.storageError"
  | "quota.lost"
  | "quota.needsNetwork"
  | "quota.used"
  | "quota.daily"
  | "quota.cycle";

export function quotaKey(quota: QuotaView): QuotaKey {
  if (quota.unlimited) return "quota.unlimited";
  if (quota.storageError) return "quota.storageError";
  if (quota.lost) return "quota.lost";
  if (quota.needsNetwork) return "quota.needsNetwork";
  if (quota.remainingMs === 0) return "quota.used";
  return quota.resetKind === "daily" ? "quota.daily" : "quota.cycle";
}

// Có lời nhắc nào cần hiện ở thanh báo của cửa sổ chính (thứ tự ưu tiên): bản không chính hãng, đồng hồ bị chỉnh lùi,
// lâu không làm mới được token, license hết hạn hay sắp hết hạn, bị thu hồi.
export type LicenseNoticeKey =
  | "license.notice.notGenuine"
  | "license.notice.clockRolledBack"
  | "license.notice.refreshNeeded"
  | "license.notice.expired"
  | "license.notice.revoked"
  | "license.notice.renewSoon";

export function licenseNotice(view: LicenseView | null): LicenseNoticeKey | null {
  if (!view) return null;
  const byStanding: Partial<Record<Standing, LicenseNoticeKey>> = {
    notGenuine: "license.notice.notGenuine",
    clockRolledBack: "license.notice.clockRolledBack",
    refreshNeeded: "license.notice.refreshNeeded",
    expired: "license.notice.expired",
    revoked: "license.notice.revoked",
  };
  const key = byStanding[view.standing];
  if (key) return key;
  if (view.clockRolledBack) return "license.notice.clockRolledBack";
  return view.standing === "active" && view.renewSoon ? "license.notice.renewSoon" : null;
}

// Mua mới hay gia hạn / đổi gói key đang có. License đã thu hồi thì mua mới (server từ chối gia hạn key đã thu hồi).
export function isRenewal(view: LicenseView | null): boolean {
  return view?.key != null && view.standing !== "revoked";
}

// Giá theo VND của một gói, hoặc `null` nếu server không bán gói đó bằng VND.
export function priceVnd(plan: PlanOffer): number | null {
  return plan.prices.VND ?? null;
}

// Tên hiển thị của một máy trong danh sách `409 device_limit`; `device_label` là `null` thì dùng tên thay thế.
export function deviceName(device: Device, fallback: string): string {
  return device.device_label?.trim() || fallback;
}

// Câu báo theo trạng thái đơn (bảng "App hiện gì theo `status`" của kế hoạch 05).
export function orderMessageKey(outcome: OrderOutcome) {
  switch (outcome.state) {
    case "waiting":
      return "upgrade.order.waiting" as const;
    case "paid":
      return "upgrade.order.paid" as const;
    case "underpaid":
      return "upgrade.order.underpaid" as const;
    case "needsReview":
      return "upgrade.order.needsReview" as const;
    case "refunded":
      return "upgrade.order.refunded" as const;
    case "failed":
      return "upgrade.order.failed" as const;
    case "paidButNotApplied":
      return "upgrade.order.paidButNotApplied" as const;
  }
}

// Đơn đã xong (thôi hỏi): cho tạo đơn mới. `underpaid` vẫn chờ chuyển bù.
export function orderFinished(outcome: OrderOutcome | null): boolean {
  return outcome !== null && outcome.state !== "waiting" && outcome.state !== "underpaid";
}
