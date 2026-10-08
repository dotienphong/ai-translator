// Số liệu của trang Tổng quan (spec Web Admin phần 2, 2026-10-08-web-admin-tong-quan-design.md). Chỉ đọc.
// Ngày và tháng theo GMT+7 (Việt Nam không có giờ mùa hè). Doanh thu chỉ tính đơn status = 'paid'.
import type { Hono } from "hono";
import { type AdminAppEnv, crossSite } from "./admin-auth";
import { DAY, ORDER_STATUSES, VN_OFFSET, vnDayStart } from "./admin-read";
import { audit } from "./audit";
import { fail } from "./http";
import { PLAN_CODES, type PlanCode } from "./plans";

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

type Row = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

const GRANT_KINDS: readonly GrantKind[] = ["new", "extend", "change", "other"];

interface Windows {
  now: number;
  /** 00:00 GMT+7 hôm nay. */
  today: number;
  /** Đầu cửa sổ 7 ngày: hôm nay và 6 ngày trước. */
  last7Start: number;
  days: DayWindow;
  months: MonthWindow;
}

function windows(now: number): Windows {
  const today = vnDayStart(now);
  return { now, today, last7Start: today - 6 * DAY, days: dayWindow(now, 30), months: monthWindow(now, 12) };
}

/**
 * Một mục của phản hồi: các câu SQL (đã bind) và hàm ghép kết quả. `build` nhận kết quả của đúng các câu của mục này,
 * theo thứ tự `statements`, mỗi phần tử là mảng dòng.
 */
interface Section<T> {
  statements: D1PreparedStatement[];
  build(rows: Row[][]): T;
}

function moneySection(db: D1Database, w: Windows): Section<Stats["money"]> {
  return {
    statements: [
      db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN paid_at >= ?1 THEN amount_paid END), 0) AS today,
             COALESCE(SUM(CASE WHEN paid_at >= ?2 THEN amount_paid END), 0) AS last_7d,
             COALESCE(SUM(CASE WHEN paid_at >= ?3 THEN amount_paid END), 0) AS this_month,
             COALESCE(SUM(CASE WHEN paid_at >= ?4 AND paid_at < ?3 THEN amount_paid END), 0) AS last_month
           FROM orders WHERE status = 'paid' AND paid_at >= ?4`,
        )
        .bind(w.today, w.last7Start, w.months.thisStart, w.months.lastStart),
      db
        .prepare(
          `SELECT strftime('%Y-%m-%d', paid_at + ${VN_OFFSET}, 'unixepoch') AS day, COALESCE(SUM(amount_paid), 0) AS revenue, COUNT(*) AS orders
           FROM orders WHERE status = 'paid' AND paid_at >= ?1 GROUP BY day`,
        )
        .bind(w.days.start),
      db
        .prepare(
          `SELECT strftime('%Y-%m', paid_at + ${VN_OFFSET}, 'unixepoch') AS month, plan, COALESCE(SUM(amount_paid), 0) AS revenue, COUNT(*) AS orders
           FROM orders WHERE status = 'paid' AND paid_at >= ?1 GROUP BY month, plan`,
        )
        .bind(w.months.start),
    ],
    build([totals = [], daily = [], monthly = []]) {
      const t: Row = totals[0] ?? {};
      return {
        today: num(t.today),
        last_7d: num(t.last_7d),
        this_month: num(t.this_month),
        last_month: num(t.last_month),
        daily: w.days.keys.map((day) => {
          const r = daily.find((x) => x.day === day);
          return { day, revenue: num(r?.revenue), orders: num(r?.orders) };
        }),
        monthly: w.months.keys.map((month) => {
          const row = { month } as { month: string } & Record<PlanCode, Totals>;
          for (const plan of PLAN_CODES) {
            const r = monthly.find((x) => x.month === month && x.plan === plan);
            row[plan] = { revenue: num(r?.revenue), orders: num(r?.orders) };
          }
          return row;
        }),
      };
    },
  };
}

/** Loại cấp quyền; mọi giá trị ngoài ba loại đã biết (kể cả rỗng) vào "other" để không tính nhầm là mua mới. */
const KIND = "CASE WHEN grant_kind IN ('new', 'extend', 'change') THEN grant_kind ELSE 'other' END";

/** Máy dùng thử đã gắn vào một license ở bất kỳ lúc nào: cùng định nghĩa cờ `purchased` của /admin/trials. */
const PURCHASED = "device_id_hash IN (SELECT device_id_hash FROM activations)";

function customersSection(db: D1Database, w: Windows): Section<Stats["customers"]> {
  return {
    statements: [
      db
        .prepare(
          `SELECT
             COUNT(*) AS trials_total,
             COALESCE(SUM(CASE WHEN ${PURCHASED} THEN 1 ELSE 0 END), 0) AS trials_total_purchased,
             COALESCE(SUM(CASE WHEN started_at >= ?1 THEN 1 ELSE 0 END), 0) AS trials_30d,
             COALESCE(SUM(CASE WHEN started_at >= ?1 AND ${PURCHASED} THEN 1 ELSE 0 END), 0) AS trials_30d_purchased
           FROM trials`,
        )
        .bind(w.days.start),
      db
        .prepare(
          `SELECT ${KIND} AS kind, COUNT(*) AS orders, COALESCE(SUM(amount_paid), 0) AS revenue
           FROM orders WHERE status = 'paid' AND paid_at >= ?1 GROUP BY kind`,
        )
        .bind(w.days.start),
      db
        .prepare(
          `SELECT strftime('%Y-%m', paid_at + ${VN_OFFSET}, 'unixepoch') AS month, ${KIND} AS kind, COUNT(*) AS orders
           FROM orders WHERE status = 'paid' AND paid_at >= ?1 GROUP BY month, kind`,
        )
        .bind(w.months.start),
    ],
    build([trials = [], grants = [], monthly = []]) {
      const t: Row = trials[0] ?? {};
      const grants30 = {} as Record<GrantKind, Totals>;
      for (const kind of GRANT_KINDS) {
        const r = grants.find((x) => x.kind === kind);
        grants30[kind] = { orders: num(r?.orders), revenue: num(r?.revenue) };
      }
      return {
        trials_30d: num(t.trials_30d),
        trials_30d_purchased: num(t.trials_30d_purchased),
        trials_total: num(t.trials_total),
        trials_total_purchased: num(t.trials_total_purchased),
        grants_30d: grants30,
        grants_monthly: w.months.keys.map((month) => {
          const row = { month } as { month: string } & Record<GrantKind, number>;
          for (const kind of GRANT_KINDS) row[kind] = num(monthly.find((x) => x.month === month && x.kind === kind)?.orders);
          return row;
        }),
      };
    },
  };
}

function healthSection(db: D1Database, w: Windows): Section<Stats["health"]> {
  return {
    statements: [
      db.prepare("SELECT status, COUNT(*) AS n FROM orders WHERE created_at >= ?1 GROUP BY status").bind(w.days.start),
      db
        .prepare(
          `SELECT COUNT(*) AS paid_with_email, COALESCE(SUM(CASE WHEN email_sent_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS sent
           FROM orders WHERE status = 'paid' AND paid_at >= ?1 AND email IS NOT NULL`,
        )
        .bind(w.days.start),
      db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN expires_at <= ?2 THEN 1 ELSE 0 END), 0) AS expiring_7d,
             COALESCE(SUM(CASE WHEN expires_at <= ?3 THEN 1 ELSE 0 END), 0) AS expiring_30d
           FROM licenses WHERE revoked_at IS NULL AND expires_at > ?1`,
        )
        .bind(w.now, w.now + 7 * DAY, w.now + 30 * DAY),
    ],
    build([statuses = [], email = [], expiring = []]) {
      const orders = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Stats["health"]["orders_30d"];
      for (const r of statuses) {
        const status = r.status as OrderStatus;
        if (Object.hasOwn(orders, status)) orders[status] = num(r.n);
      }
      const e: Row = email[0] ?? {};
      const x: Row = expiring[0] ?? {};
      return {
        orders_30d: orders,
        expiring_7d: num(x.expiring_7d),
        expiring_30d: num(x.expiring_30d),
        email: { paid_with_email_30d: num(e.paid_with_email), sent: num(e.sent) },
      };
    },
  };
}

function usageSection(db: D1Database, w: Windows): Section<Stats["usage"]> {
  return {
    statements: [
      // Cùng định nghĩa "đang hoạt động" với /admin/summary.
      db.prepare("SELECT COUNT(*) AS n FROM licenses WHERE revoked_at IS NULL AND expires_at > ?1").bind(w.now),
      db
        .prepare(
          `SELECT COUNT(*) AS active_devices, COALESCE(SUM(CASE WHEN a.last_validated_at >= ?2 THEN 1 ELSE 0 END), 0) AS devices_7d
           FROM activations a JOIN licenses l ON l.id = a.license_id
           WHERE a.deactivated_at IS NULL AND l.revoked_at IS NULL AND l.expires_at > ?1`,
        )
        .bind(w.now, w.now - 7 * DAY),
      db.prepare("SELECT COUNT(*) AS n FROM trials WHERE ends_at > ?1").bind(w.now),
      db
        .prepare(
          `SELECT strftime('%Y-%m-%d', started_at + ${VN_OFFSET}, 'unixepoch') AS day, COUNT(*) AS n
           FROM trials WHERE started_at >= ?1 GROUP BY day`,
        )
        .bind(w.days.start),
    ],
    build([licenses = [], devices = [], trialsActive = [], newTrials = []]) {
      const d: Row = devices[0] ?? {};
      return {
        active_licenses: num(licenses[0]?.n),
        active_devices: num(d.active_devices),
        devices_7d: num(d.devices_7d),
        trials_active: num(trialsActive[0]?.n),
        new_trials_daily: w.days.keys.map((day) => ({ day, count: num(newTrials.find((x) => x.day === day)?.n) })),
      };
    },
  };
}

/** Mọi câu SQL của một lần xem chạy trong MỘT db.batch: các con số nhất quán với nhau. */
export async function computeStats(db: D1Database, now: number): Promise<Stats> {
  const w = windows(now);
  const money = moneySection(db, w);
  const customers = customersSection(db, w);
  const health = healthSection(db, w);
  const usage = usageSection(db, w);
  const results = await db.batch([...money.statements, ...customers.statements, ...health.statements, ...usage.statements]);
  let at = 0;
  const take = (s: Section<unknown>): Row[][] => {
    const part = results.slice(at, at + s.statements.length).map((r) => (r.results ?? []) as Row[]);
    at += s.statements.length;
    return part;
  };
  // Literal đánh giá từ trái sang phải: thứ tự `take` phải đúng thứ tự gom câu SQL ở trên (money, customers, health, usage).
  return {
    generated_at: now,
    currency: "VND",
    money: money.build(take(money)),
    customers: customers.build(take(customers)),
    health: health.build(take(health)),
    usage: usage.build(take(usage)),
  };
}

export function registerAdminStats(app: Hono<AdminAppEnv>): void {
  app.get("/admin/stats", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const db = c.env.DB;
    const now = c.get("deps").now();
    const stats = await computeStats(db, now);
    await audit(db, { at: now, actor: c.get("actor"), action: "stats_viewed" });
    return c.json(stats);
  });
}
