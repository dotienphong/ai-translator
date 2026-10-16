// Hàm thuần của thẻ hoàn tiền ở trang đơn (C1-T7, quyết định Q2 của chủ dự án): đơn đã cộng bao nhiêu ngày vào license nào,
// đã rút ngắn bao nhiêu ngày cho đơn đó, và thẻ nào hợp với một đơn đã hoàn. Nguồn là nhật ký của đơn (`api.audit({order_code})`,
// không theo nhật ký 50 dòng của license): dòng cấp `license_issued` / `license_extended` / `license_plan_changed` (server ghi ở
// grantOrder, detail có `expires_at`, `paid_at`, và `from_expires_at`, `from_plan` khi áp vào license đã có) và các dòng
// `license_shortened_manually` mang mã đơn (detail.days).
import type { AuditRow, LicenseAuditRow, LicenseDetail, OrderRow } from "../api/types";

const DAY = 86400;

export type GrantKind = "new" | "extend" | "change";

const GRANT_ACTIONS: Record<string, GrantKind> = {
  license_issued: "new",
  license_extended: "extend",
  license_plan_changed: "change",
};

export interface AppliedEffect {
  applied: true;
  kind: GrantKind;
  licenseId: string | null;
  /** Gói sau đơn và trước đơn (đổi gói). */
  plan: string | null;
  fromPlan: string | null;
  /** Hạn của license trước khi đơn áp vào (không có với đơn mua mới). */
  fromExpiresAt: number | null;
  /** Hạn ngay sau khi đơn áp vào; null nếu detail hỏng. */
  toExpiresAt: number | null;
  /**
   * Số ngày đơn cộng: mua mới tính từ lúc trả; gia hạn tính từ hạn trước đơn hay từ lúc trả nếu license đã hết hạn lúc đó; đổi
   * gói là null (số ngày quy đổi đổi theo gói nên không có "phần của đơn" tính bằng ngày).
   */
  daysAdded: number | null;
  /** Tổng số ngày đã rút ngắn kèm mã đơn này, và lần rút cuối. */
  shortenedDays: number;
  lastShortenedAt: number | null;
  /** Số ngày của đơn chưa rút lại (không âm); null khi daysAdded null. */
  remainingDays: number | null;
  /** Lúc ghi dòng cấp (đơn áp vào license), và mốc "lúc trả" server dùng để tính hạn. */
  grantAt: number;
  paidBase: number;
}

export type GrantEffect = { applied: false } | AppliedEffect;

type KitAuditRow = Pick<AuditRow, "at" | "action" | "order_code" | "detail"> & { license_id?: string | null };

function parse(detail: string | null): Record<string, unknown> | null {
  if (!detail) return null;
  try {
    const o: unknown = JSON.parse(detail);
    return o !== null && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Đơn đã cộng gì vào license (theo nhật ký của đơn). Không có dòng cấp của đơn: `{ applied: false }`. */
export function orderGrantEffect(order: Pick<OrderRow, "order_code" | "paid_at">, rows: readonly KitAuditRow[]): GrantEffect {
  const mine = rows.filter((r) => r.order_code === order.order_code);
  // Mỗi đơn chỉ có một dòng cấp (grantOrder ghi nhật ký cùng batch với câu đánh dấu đơn); có nhiều thì lấy dòng mới nhất.
  const grant = mine.filter((r) => Object.hasOwn(GRANT_ACTIONS, r.action)).reduce<KitAuditRow | null>((a, r) => (a === null || r.at > a.at ? r : a), null);
  if (!grant) return { applied: false };
  let shortenedDays = 0;
  let lastShortenedAt: number | null = null;
  for (const r of mine) {
    if (r.action !== "license_shortened_manually") continue;
    const days = num(parse(r.detail)?.days);
    if (days === null || !Number.isInteger(days) || days <= 0) continue;
    shortenedDays += days;
    lastShortenedAt = lastShortenedAt === null ? r.at : Math.max(lastShortenedAt, r.at);
  }
  const kind = GRANT_ACTIONS[grant.action] as GrantKind;
  const d = parse(grant.detail);
  const to = num(d?.expires_at);
  const from = num(d?.from_expires_at);
  // Mốc "lúc trả" mà server dùng để tính hạn (detail.paid_at); bản ghi cũ thiếu thì lấy paid_at của đơn, rồi lúc ghi nhật ký.
  const base = num(d?.paid_at) ?? order.paid_at ?? grant.at;
  let daysAdded: number | null = null;
  if (to !== null && kind === "new") daysAdded = Math.round((to - base) / DAY);
  if (to !== null && kind === "extend") daysAdded = Math.round((to - Math.max(from ?? base, base)) / DAY);
  return {
    applied: true,
    kind,
    licenseId: grant.license_id ?? null,
    plan: str(d?.plan),
    fromPlan: str(d?.from_plan),
    fromExpiresAt: from,
    toExpiresAt: to,
    daysAdded,
    shortenedDays,
    lastShortenedAt,
    remainingDays: daysAdded === null ? null : Math.max(0, daysAdded - shortenedDays),
    grantAt: grant.at,
    paidBase: base,
  };
}

/**
 * Tổng số ngày đã rút ngắn KHÔNG kèm mã đơn (hộp Rút ngắn hạn… ở trang license) từ mốc `since` trở đi, theo nhật ký của license
 * (50 dòng mới nhất mà lookup trả). Thẻ đơn không biết lần rút đó có phải để lấy lại phần của đơn này không (I-2 của rà B2).
 */
export function unlinkedShortenedDays(audit: readonly Pick<LicenseAuditRow, "at" | "action" | "order_code" | "detail">[], since: number): number {
  let total = 0;
  for (const r of audit) {
    if (r.action !== "license_shortened_manually" || r.order_code !== null || r.at < since) continue;
    const days = num(parse(r.detail)?.days);
    if (days !== null && Number.isInteger(days) && days > 0) total += days;
  }
  return total;
}

/** Thao tác tay cộng thời gian vào license: không thuộc đơn này thì là nguồn thời gian khác. */
const MANUAL_GRANTS = ["license_extended_manually", "license_issued_manually", "order_granted_manually", "order_review_granted"];

/**
 * License (của một đơn mua mới) còn nguồn thời gian khác ngoài đơn này không: một đơn khác đã trả và áp vào chính license này
 * (`orders` là các đơn của license), hay nhật ký license có thao tác cấp/gia hạn tay không thuộc đơn này (M4). Không chắc thì
 * trang coi là có (khuyên rút đúng phần của đơn, đừng thu hồi).
 */
export function hasOtherTimeSource(
  orderCode: number,
  licenseId: string,
  audit: readonly Pick<LicenseAuditRow, "action" | "order_code">[],
  orders: readonly Pick<OrderRow, "order_code" | "status" | "license_id">[],
): boolean {
  if (orders.some((o) => o.order_code !== orderCode && o.status === "paid" && o.license_id === licenseId)) return true;
  return audit.some((r) => MANUAL_GRANTS.includes(r.action) && r.order_code !== orderCode);
}

/** Giới hạn số ngày của một lần rút ngắn (route /extend và /shorten nhận 1..3650). */
export const MAX_SHORTEN_DAYS = 3650;

/**
 * Số ngày nhiều nhất còn rút được mà hạn mới vẫn sau bây giờ: cùng công thức với server (`max_days` của 409 too_far), kẹp 3650.
 * Chỉ để điền sẵn và kiểm ô nhập: server vẫn quyết, và khi từ chối thì câu lỗi dùng số của server.
 */
export function maxShortenDays(expiresAt: number, now: number): number {
  return Math.min(MAX_SHORTEN_DAYS, Math.max(0, Math.floor((expiresAt - now - 1) / DAY)));
}

type LicenseState = Pick<LicenseDetail, "id" | "revoked_at" | "expires_at">;

/** Rút ngắn đúng phần còn lại của đơn, nhưng không quá số ngày license còn rút được. */
interface ShortenPlan {
  licenseId: string;
  /** Số ngày của đơn chưa rút lại. */
  remaining: number;
  /** Số ngày điền sẵn trong hộp: min(remaining, maxShortenDays); 0 là không rút được nữa. */
  shortenDays: number;
  /** remaining > số ngày còn rút được: phần khách đã dùng không lấy lại được. */
  capped: boolean;
  /**
   * License còn thời gian từ nguồn khác (đơn trước còn hạn lúc đơn này áp vào, đơn hay thao tác tay sau đó): thu hồi sẽ lấy
   * luôn phần đó. Đơn gia hạn áp vào license đã hết hạn mà sau đó không được cộng gì thì false (M3).
   */
  otherTime: boolean;
}

export type RefundCase =
  /** 1. Chưa áp: đơn chưa từng cộng thời gian vào license nào. */
  | { kind: "not_applied" }
  /** Đơn có license mà nhật ký của đơn chưa tải xong. */
  | { kind: "waiting" }
  /**
   * 2. Đã rút đủ số ngày đơn cộng. `grew`: hạn hiện tại dài hơn hạn sau đơn trừ phần đã rút (license được cộng thêm sau đó:
   * gia hạn tay trả lại, đơn khác…): thẻ nhắc kiểm tra thay vì "không cần làm gì" (M6).
   */
  | { kind: "shortened"; days: number; at: number | null; expiresAt: number | null; grew: boolean; unlinkedDays: number }
  /** 6. License đã thu hồi, đã hết hạn, hay không có trong kết quả tra cứu. */
  | { kind: "inactive" }
  /** Đơn mua mới: đang tải các đơn của license để biết license có còn đơn đã trả khác không. */
  | { kind: "checking"; licenseId: string }
  /** 3. Gia hạn (hay mua mới mà license còn đơn đã trả khác): rút đúng phần của đơn, đừng thu hồi. */
  | ({ kind: "keep_others" } & ShortenPlan)
  /** 4. Mua mới và license chỉ gồm đơn này: thu hồi hay rút ngắn, người vận hành quyết. */
  | ({ kind: "only_order" } & ShortenPlan)
  /** 5. Đổi gói: Web Admin không đổi lại gói; rút ngắn tự chọn số ngày. */
  | { kind: "change"; licenseId: string }
  /** Đơn có license mà nhật ký không có dòng cấp đọc được: không tính được số ngày; rút ngắn tự chọn. */
  | { kind: "unknown_days"; licenseId: string };

/**
 * Thẻ của một đơn `refunded`. `effect`: kết quả orderGrantEffect, null khi nhật ký của đơn chưa tải. `license`: license đích
 * (license của dòng cấp, hay license_id/renew_license_id của đơn) trong kết quả tra cứu. `otherPaid`: license còn đơn `paid`
 * khác ngoài đơn này (chỉ cần với đơn mua mới; undefined là chưa biết). `unlinked`: số ngày đã rút ngắn không kèm mã đơn sau
 * lúc đơn áp vào (unlinkedShortenedDays). "Còn hoạt động" = chưa thu hồi và hạn sau bây giờ.
 */
export function refundCase(
  order: Pick<OrderRow, "license_id">,
  effect: GrantEffect | null,
  license: LicenseState | undefined,
  now: number,
  otherPaid?: boolean,
  unlinked = 0,
): RefundCase {
  // Server ghi license_id của đơn cùng lúc với dòng cấp: đơn không có license_id thì chưa từng áp, không cần đợi nhật ký.
  if (order.license_id === null && (effect === null || !effect.applied)) return { kind: "not_applied" };
  if (effect === null) return { kind: "waiting" };
  if (effect.applied && effect.daysAdded !== null && effect.shortenedDays > 0 && effect.shortenedDays >= effect.daysAdded) {
    const after = effect.toExpiresAt === null ? null : effect.toExpiresAt - effect.shortenedDays * DAY;
    return {
      kind: "shortened",
      days: effect.shortenedDays,
      at: effect.lastShortenedAt,
      expiresAt: license?.expires_at ?? null,
      grew: license !== undefined && after !== null && license.expires_at > after,
      unlinkedDays: 0,
    };
  }
  // Các lần rút không kèm mã đơn (trang license) cộng với các lần rút của đơn đã đủ phần của đơn, và hạn hiện tại không dài hơn hạn
  // sau đơn trừ mọi lần rút đó: coi như đã rút đủ (I-1 của rà B2-fix); thẻ vẫn nói rõ phần rút ngoài đơn.
  if (effect.applied && unlinked > 0 && effect.daysAdded !== null && effect.toExpiresAt !== null && license !== undefined) {
    const total = effect.shortenedDays + unlinked;
    if (total >= effect.daysAdded && license.expires_at <= effect.toExpiresAt - total * DAY) {
      return { kind: "shortened", days: total, at: effect.lastShortenedAt, expiresAt: license.expires_at, grew: false, unlinkedDays: unlinked };
    }
  }
  if (!license || license.revoked_at !== null || license.expires_at <= now) return { kind: "inactive" };
  const licenseId = license.id;
  if (!effect.applied) return { kind: "unknown_days", licenseId };
  if (effect.kind === "change") return { kind: "change", licenseId };
  if (effect.remainingDays === null) return { kind: "unknown_days", licenseId };
  const max = maxShortenDays(license.expires_at, now);
  const plan = {
    licenseId,
    remaining: effect.remainingDays,
    shortenDays: Math.min(effect.remainingDays, max),
    capped: effect.remainingDays > max,
  };
  if (effect.kind === "extend") {
    // Thời gian của nguồn khác: đơn trước còn hạn lúc đơn này áp vào, hay license được cộng thêm sau đó (hạn hiện tại dài hơn
    // hạn sau đơn trừ phần đã rút).
    const before = effect.fromExpiresAt !== null && effect.fromExpiresAt > effect.paidBase;
    const later = effect.toExpiresAt !== null && license.expires_at > effect.toExpiresAt - effect.shortenedDays * DAY;
    return { kind: "keep_others", ...plan, otherTime: before || later };
  }
  // Đơn mua mới mà hạn hiện tại dài hơn hạn sau đơn trừ phần đã rút: license đã được cộng thêm (đơn khác, gia hạn tay; dòng nhật ký
  // của lần cộng có thể đã trôi khỏi 50 dòng mà lookup trả): còn nguồn khác, khỏi đợi tra đơn (m2).
  if (effect.toExpiresAt !== null && license.expires_at > effect.toExpiresAt - effect.shortenedDays * DAY) {
    return { kind: "keep_others", ...plan, otherTime: true };
  }
  if (otherPaid === undefined) return { kind: "checking", licenseId };
  return otherPaid ? { kind: "keep_others", ...plan, otherTime: true } : { kind: "only_order", ...plan, otherTime: false };
}
