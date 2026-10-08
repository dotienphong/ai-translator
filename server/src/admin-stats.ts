// Số liệu của trang Tổng quan (spec Web Admin phần 2, 2026-10-08-web-admin-tong-quan-design.md). Chỉ đọc.
// Ngày và tháng theo GMT+7 (Việt Nam không có giờ mùa hè). Doanh thu chỉ tính đơn status = 'paid'.
import { DAY, type ORDER_STATUSES, VN_OFFSET, vnDayStart } from "./admin-read";
import type { PlanCode } from "./plans";

type OrderStatus = (typeof ORDER_STATUSES)[number];
export type GrantKind = "new" | "extend" | "change" | "other";

export interface Totals {
  revenue: number;
  orders: number;
}

export interface Stats {
  generated_at: number;
  currency: "VND";
  money: {
    today: number;
    last_7d: number;
    this_month: number;
    last_month: number;
    daily: { day: string; revenue: number; orders: number }[];
    monthly: ({ month: string } & Record<PlanCode, Totals>)[];
  };
  customers: {
    trials_30d: number;
    trials_30d_purchased: number;
    trials_total: number;
    trials_total_purchased: number;
    grants_30d: Record<GrantKind, Totals>;
    grants_monthly: ({ month: string } & Record<GrantKind, number>)[];
  };
  health: {
    orders_30d: Record<OrderStatus, number>;
    expiring_7d: number;
    expiring_30d: number;
    email: { paid_with_email_30d: number; sent: number };
  };
  usage: {
    active_licenses: number;
    active_devices: number;
    devices_7d: number;
    trials_active: number;
    new_trials_daily: { day: string; count: number }[];
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Khóa ngày "YYYY-MM-DD" theo GMT+7 của thời điểm `t` (giây Unix). */
export function vnDayKey(t: number): string {
  const d = new Date((t + VN_OFFSET) * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export interface DayWindow {
  /** `days` khóa ngày liền nhau, tăng dần, ngày cuối là hôm nay. */
  keys: string[];
  /** 00:00 GMT+7 của ngày đầu cửa sổ (giây Unix). */
  start: number;
}

export function dayWindow(now: number, days: number): DayWindow {
  const start = vnDayStart(now) - (days - 1) * DAY;
  return { keys: Array.from({ length: days }, (_, i) => vnDayKey(start + i * DAY)), start };
}

export interface MonthWindow {
  /** `months` khóa tháng "YYYY-MM" liền nhau, tăng dần, tháng cuối là tháng này. */
  keys: string[];
  /** 00:00 GMT+7 ngày 1 của tháng đầu cửa sổ, của tháng này, và của tháng trước. */
  start: number;
  thisStart: number;
  lastStart: number;
}

export function monthWindow(now: number, months: number): MonthWindow {
  const vn = new Date((now + VN_OFFSET) * 1000);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  // Đầu tháng lùi k tháng, theo GMT+7. Date.UTC tự cuộn tháng âm sang năm trước.
  const startOf = (k: number) => Date.UTC(y, m - k, 1) / 1000 - VN_OFFSET;
  const keys = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - (months - 1 - i), 1));
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
  });
  return { keys, start: startOf(months - 1), thisStart: startOf(0), lastStart: startOf(1) };
}
