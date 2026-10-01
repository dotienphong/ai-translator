// Bốn gói (spec §2, P1) và luật mua thêm, đổi gói (§6.8). Free không bán, chỉ có trong app.
// Mã gói và tên hiển thị là hợp đồng với app nên nằm trong code. Hạn mức, số ngày mỗi đơn và giá
// nằm trong biến PLANS của từng môi trường (wrangler*.jsonc): đổi giá hay hạn mức không cần phát hành lại app.

import { PLAN_CODES, type PlanCode } from "./token";

export { PLAN_CODES, type PlanCode };
export const PLAN_NAMES: Record<PlanCode, string> = {
  pro: "Professional",
  pro_x2: "Professional X2",
  pro_x5: "Professional X5",
};
export const DAY_SECONDS = 86400;

export interface PlanConfig {
  /** Hạn mức dịch mỗi chu kỳ 30 ngày, mỗi máy, tính bằng phút; null là không giới hạn. */
  quota_minutes_per_cycle: number | null;
  /** Số ngày mỗi đơn (30). */
  days_per_order: number;
  /** Giá theo loại tiền, số nguyên theo đơn vị nhỏ nhất (VND không có đơn vị lẻ). */
  prices: Record<string, number>;
}
export type PlanTable = Record<PlanCode, PlanConfig>;

export function isPlan(value: unknown): value is PlanCode {
  return typeof value === "string" && (PLAN_CODES as readonly string[]).includes(value);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Đọc biến PLANS. Thiếu hay sai bất kỳ chỗ nào thì trả null, để route trả 503 pricing_not_configured
 * thay vì bán sai giá hay ký token sai hạn mức. Bảng phải có đúng ba gói, và mọi gói có cùng các loại tiền
 * (luật đổi gói cần giá của cả gói cũ lẫn gói mới theo loại tiền của đơn).
 */
export function parsePlans(raw: unknown): PlanTable | null {
  if (!isRecord(raw)) return null;
  const keys = Object.keys(raw).sort();
  if (keys.join(",") !== [...PLAN_CODES].sort().join(",")) return null;
  let currencies: string | null = null;
  const table = {} as PlanTable;
  for (const code of PLAN_CODES) {
    const p = raw[code];
    if (!isRecord(p) || !isRecord(p.prices)) return null;
    const quota = p.quota_minutes_per_cycle;
    if (quota !== null && !(Number.isSafeInteger(quota) && (quota as number) > 0)) return null;
    const days = p.days_per_order;
    if (!Number.isSafeInteger(days) || (days as number) < 1 || (days as number) > 366) return null;
    const prices: Record<string, number> = {};
    for (const [currency, amount] of Object.entries(p.prices)) {
      if (!/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(amount) || (amount as number) <= 0) return null;
      prices[currency] = amount as number;
    }
    const set = Object.keys(prices).sort().join(",");
    if (!set || (currencies !== null && set !== currencies)) return null;
    currencies = set;
    table[code] = { quota_minutes_per_cycle: quota as number | null, days_per_order: days as number, prices };
  }
  return table;
}

/** Trạng thái license mà luật mua thêm và đổi gói cần. */
export interface LicenseTerms {
  plan: PlanCode;
  expires_at: number;
  cycle_anchor: number;
}

export interface GrantTerms extends LicenseTerms {
  /** new: license mới; extend: mua thêm cùng gói; change: đổi gói (kể cả license đã hết hạn mua gói khác). */
  kind: "new" | "extend" | "change";
  /** Số ngày của gói cũ đã quy sang gói mới (chỉ khác 0 khi đổi gói lúc license còn hạn). */
  converted_days: number;
}

/**
 * Luật "Mua thêm và đổi gói" (§6.8), tính tại `now`: thời điểm thanh toán (QĐ33), không làm tròn về đầu ngày.
 * - license mới: hạn = now + số ngày; cycle_anchor = now;
 * - cùng gói: hạn cộng số ngày từ max(now, hạn cũ); cycle_anchor giữ nguyên, license đã hết hạn thì = now;
 * - đổi gói khi còn hạn: ngày_quy_đổi = floor(ngày_còn_lại × giá_cũ / giá_mới), ngày_còn_lại giữ cả phần lẻ;
 *   hạn = now + số ngày + ngày_quy_đổi; cycle_anchor = now;
 * - license đã hết hạn mua gói khác: như license mới, giữ key.
 * Giá lấy theo bảng hiện hành, cùng loại tiền với đơn. Tính bằng BigInt để phép chia làm tròn xuống đúng tuyệt đối.
 */
export function computeGrant(
  plans: PlanTable,
  current: LicenseTerms | null,
  plan: PlanCode,
  currency: string,
  now: number,
): GrantTerms {
  const period = plans[plan].days_per_order * DAY_SECONDS;
  if (current === null) {
    return { plan, expires_at: now + period, cycle_anchor: now, kind: "new", converted_days: 0 };
  }
  const active = current.expires_at > now;
  if (current.plan === plan) {
    return {
      plan,
      expires_at: Math.max(now, current.expires_at) + period,
      cycle_anchor: active ? current.cycle_anchor : now,
      kind: "extend",
      converted_days: 0,
    };
  }
  let converted = 0;
  if (active) {
    const oldPrice = plans[current.plan].prices[currency];
    const newPrice = plans[plan].prices[currency];
    if (oldPrice === undefined || newPrice === undefined) throw new Error(`thiếu giá ${currency} để đổi gói`);
    const remaining = BigInt(current.expires_at - now);
    converted = Number((remaining * BigInt(oldPrice)) / (BigInt(newPrice) * BigInt(DAY_SECONDS)));
  }
  return {
    plan,
    expires_at: now + period + converted * DAY_SECONDS,
    cycle_anchor: now,
    kind: "change",
    converted_days: converted,
  };
}
