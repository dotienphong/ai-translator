// Route chỉ đọc của Worker admin cho Web Admin (spec 2026-10-07 Web Admin §3.2): danh sách, việc cần xử lý, số nhanh.
// Mỗi request ghi một dòng nhật ký (list_viewed, queue_viewed, summary_viewed) không chứa email. Vì có ghi nhật ký,
// GET ở đây chặn request mà trình duyệt báo là từ trang khác, như payment-status.
// Danh sách: 50 dòng mỗi trang, mới nhất trước, con trỏ keyset (`next_cursor` của trang trước đưa vào `cursor`).
// Email không bao giờ nằm trong URL hay trong `detail` của nhật ký: bộ lọc `actor` và `action` của /admin/audit chỉ
// nhận giá trị cố định (`actor`: api, webhook, reconcile, admin) hoặc tên action dạng [a-z][a-z0-9_]{0,63}.
import type { Context, Hono } from "hono";
import { type AdminAppEnv, crossSite } from "./admin-auth";
import { audit } from "./audit";
import { fail } from "./http";
import { maskLicenseKey } from "./license-key";
import { PLAN_CODES } from "./plans";

type Bind = string | number;
type Row = Record<string, unknown>;
type AdminContext = Context<AdminAppEnv>;

const PAGE = 50;
const QUEUE_ITEMS = 20;
export const DAY = 86400;
export const VN_OFFSET = 7 * 3600;

/** Các action xem và tra cứu: /admin/audit ẩn mặc định (spec §3.2), trừ khi lọc đúng một action trong nhóm này. */
export const VIEW_ACTIONS = ["lookup", "list_viewed", "queue_viewed", "summary_viewed", "stats_viewed", "payment_status_viewed"] as const;

export const ORDER_STATUSES = [
  "pending",
  "processing",
  "paid",
  "underpaid",
  "cancelled",
  "expired",
  "failed",
  "paid_needs_review",
  "refunded",
] as const;

/**
 * Cột đơn trả cho Web Admin: mọi cột của orders trừ order_token_hash, provider_ref, email_consent_at, expires_at,
 * last_checked_at, email_attempts, email_retry_at (hợp đồng ở kế hoạch Web Admin 00, mục "Danh sách").
 */
const ORDER_COLUMNS =
  "order_code, provider, plan, amount, amount_paid, currency, email, status, grant_kind, license_id, renew_license_id, created_at, paid_at, email_sent_at, email_gave_up_at";

/** Số máy đang kích hoạt của license `l`. */
const ACTIVE_DEVICES = "(SELECT COUNT(*) FROM activations a WHERE a.license_id = l.id AND a.deactivated_at IS NULL)";

/** Cột license cho danh sách và hàng đợi (bảng đặt bí danh `l`). Key được che ở maskLicense. */
const LICENSE_COLUMNS = `l.id, l.license_key, l.email, l.plan, l.expires_at, l.created_at, l.revoked_at, l.locked_at, ${ACTIVE_DEVICES} AS active_devices`;

const maskLicense = (r: Row): Row => ({ ...r, license_key: maskLicenseKey(String(r.license_key)) });

/** Đầu ngày (00:00 GMT+7) chứa thời điểm `t`. */
export function vnDayStart(t: number): number {
  return Math.floor((t + VN_OFFSET) / DAY) * DAY - VN_OFFSET;
}

/** "YYYY-MM-DD" theo GMT+7 thành giây Unix lúc 00:00 ngày đó; sai định dạng hay ngày không có thật thì null. */
export function parseVnDate(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return ms / 1000 - VN_OFFSET;
}

/** Giá trị cố định của bộ lọc `actor` ở /admin/audit; `admin` khớp mọi actor dạng `admin:<email>` mà không cần email. */
const AUDIT_ACTORS = ["api", "webhook", "reconcile", "admin"] as const;

/** Tên action hợp lệ ở bộ lọc `action`: email không khớp được mẫu này. */
const ACTION_NAME = /^[a-z][a-z0-9_]{0,63}$/;

/** Bộ lọc của một request danh sách: điều kiện WHERE, giá trị bind, và bộ lọc đã áp để ghi nhật ký. */
class Filters {
  readonly where: string[] = [];
  readonly binds: Bind[] = [];
  readonly applied: Record<string, string> = {};
  constructor(private readonly c: AdminContext) {}

  /** Tham số query; rỗng coi như không có. */
  get(name: string): string | undefined {
    const v = this.c.req.query(name);
    return v === undefined || v === "" ? undefined : v;
  }

  /** Thêm một điều kiện; bọc ngoặc để điều kiện có OR không phá phép AND giữa các điều kiện. */
  add(clause: string, ...binds: Bind[]): void {
    this.where.push(`(${clause})`);
    this.binds.push(...binds);
  }

  /** Tham số chỉ nhận một trong `allowed`. Trả false nếu có mà sai. */
  oneOf(name: string, allowed: readonly string[], clause: (v: string) => [string, ...Bind[]]): boolean {
    const v = this.get(name);
    if (v === undefined) return true;
    if (!allowed.includes(v)) return false;
    const [sql, ...binds] = clause(v);
    this.add(sql, ...binds);
    this.applied[name] = v;
    return true;
  }

  /**
   * `from`, `to` (YYYY-MM-DD theo GMT+7; `to` tính hết ngày) trên `column`. Trả tên tham số sai, hoặc null.
   * Cả hai hợp lệ mà `from` sau `to` thì tham số sai là `to`.
   */
  dates(column: string): string | null {
    const days: Partial<Record<"from" | "to", number>> = {};
    for (const name of ["from", "to"] as const) {
      const raw = this.get(name);
      if (raw === undefined) continue;
      const start = parseVnDate(raw);
      if (start === null) return name;
      days[name] = start;
      if (name === "from") this.add(`${column} >= ?`, start);
      else this.add(`${column} < ?`, start + DAY);
      this.applied[name] = raw;
    }
    if (days.from !== undefined && days.to !== undefined && days.from > days.to) return "to";
    return null;
  }
}

/** Con trỏ dạng "<giây>_<khóa>" cho thứ tự (thời điểm giảm dần, khóa giảm dần). */
function keysetCursor(timeColumn: string, keyColumn: string) {
  return (raw: string): [string, ...Bind[]] | null => {
    const m = /^(\d{1,15})_([0-9a-f-]{1,64})$/.exec(raw);
    if (!m) return null;
    const t = Number(m[1]);
    return [`(${timeColumn} < ? OR (${timeColumn} = ? AND ${keyColumn} < ?))`, t, t, m[2]!];
  };
}

/** Con trỏ là một số nguyên dương (thứ tự theo cột số giảm dần). */
function numberCursor(column: string) {
  return (raw: string): [string, ...Bind[]] | null => (/^\d{1,15}$/.test(raw) ? [`${column} < ?`, Number(raw)] : null);
}

interface ListSpec {
  resource: string;
  /** Đọc bộ lọc vào `f`; trả tên tham số sai, hoặc null. */
  filters(f: Filters, now: number): string | null;
  /** "SELECT … FROM …", chưa có WHERE. */
  select: string;
  order: string;
  cursor(raw: string): [string, ...Bind[]] | null;
  /** Con trỏ của dòng cuối trang (dòng chưa qua `map`). */
  next(row: Row): string;
  map?(row: Row): Row;
}

function listRoute(app: Hono<AdminAppEnv>, path: string, spec: ListSpec): void {
  app.get(path, async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const now = c.get("deps").now();
    const f = new Filters(c);
    const bad = spec.filters(f, now);
    if (bad) return fail(c, 400, "invalid_request", { field: bad });
    const rawCursor = f.get("cursor");
    if (rawCursor !== undefined) {
      const cond = spec.cursor(rawCursor);
      if (!cond) return fail(c, 400, "invalid_request", { field: "cursor" });
      f.add(...cond);
    }
    const where = f.where.length > 0 ? ` WHERE ${f.where.join(" AND ")}` : "";
    const { results } = await c.env.DB.prepare(`${spec.select}${where} ${spec.order} LIMIT ?`)
      .bind(...f.binds, PAGE + 1)
      .all<Row>();
    const rows = results.slice(0, PAGE);
    const last = rows[rows.length - 1];
    const nextCursor = results.length > PAGE && last ? spec.next(last) : null;
    const items = spec.map ? rows.map(spec.map) : rows;
    await audit(c.env.DB, {
      at: now,
      actor: c.get("actor"),
      action: "list_viewed",
      detail: { resource: spec.resource, filters: f.applied, count: items.length },
    });
    return c.json({ items, next_cursor: nextCursor });
  });
}

/** Một nhóm của hàng đợi: tổng số dòng thỏa `where`, và tối đa QUEUE_ITEMS dòng đầu theo `order`. */
async function queueGroup(
  db: D1Database,
  columns: string,
  from: string,
  where: string,
  order: string,
  binds: Bind[] = [],
  map: (r: Row) => Row = (r) => r,
) {
  const [count, rows] = await db.batch<Row>([
    db.prepare(`SELECT COUNT(*) AS n FROM ${from} WHERE ${where}`).bind(...binds),
    db.prepare(`SELECT ${columns} FROM ${from} WHERE ${where} ${order} LIMIT ?`).bind(...binds, QUEUE_ITEMS),
  ]);
  return { count: Number(count?.results[0]?.n ?? 0), items: (rows?.results ?? []).map(map) };
}

export function registerAdminRead(app: Hono<AdminAppEnv>): void {
  listRoute(app, "/admin/orders", {
    resource: "orders",
    filters(f) {
      if (!f.oneOf("status", ORDER_STATUSES, (s) => ["status = ?", s])) return "status";
      if (!f.oneOf("plan", PLAN_CODES, (p) => ["plan = ?", p])) return "plan";
      return f.dates("created_at");
    },
    select: `SELECT ${ORDER_COLUMNS} FROM orders`,
    order: "ORDER BY order_code DESC",
    cursor: numberCursor("order_code"),
    next: (r) => String(r.order_code),
  });

  listRoute(app, "/admin/audit", {
    resource: "audit",
    filters(f) {
      // Chỉ nhận giá trị cố định để email không vào URL hay `detail` (spec §3.2); chỉ có một người vận hành nên `admin` đủ dùng.
      if (!f.oneOf("actor", AUDIT_ACTORS, (a) => (a === "admin" ? ["actor LIKE 'admin:%'"] : ["actor = ?", a]))) return "actor";
      const action = f.get("action");
      if (action !== undefined) {
        if (!ACTION_NAME.test(action)) return "action";
        f.add("action = ?", action);
        f.applied.action = action;
      }
      const orderCode = f.get("order_code");
      if (orderCode !== undefined) {
        if (!/^\d{1,15}$/.test(orderCode)) return "order_code";
        f.add("order_code = ?", Number(orderCode));
        f.applied.order_code = orderCode;
      }
      // Lọc đúng một action xem thì không ẩn nhóm xem (như đã bật include_views), nếu không kết quả luôn rỗng.
      const viewOnly = action !== undefined && (VIEW_ACTIONS as readonly string[]).includes(action);
      if (f.get("include_views") === "1") f.applied.include_views = "1";
      else if (!viewOnly) f.add(`action NOT IN (${VIEW_ACTIONS.map(() => "?").join(", ")})`, ...VIEW_ACTIONS);
      return f.dates("at");
    },
    select: "SELECT id, at, actor, action, license_id, order_code, detail FROM audit_log",
    order: "ORDER BY id DESC",
    cursor: numberCursor("id"),
    next: (r) => String(r.id),
  });

  listRoute(app, "/admin/licenses", {
    resource: "licenses",
    filters(f, now) {
      const states: Record<string, [string, ...Bind[]]> = {
        active: ["l.revoked_at IS NULL AND l.expires_at > ?", now],
        expired: ["l.revoked_at IS NULL AND l.expires_at <= ?", now],
        revoked: ["l.revoked_at IS NOT NULL"],
        locked: ["l.locked_at IS NOT NULL AND l.revoked_at IS NULL"],
        conflict: [`l.revoked_at IS NULL AND ${ACTIVE_DEVICES} > 1`],
      };
      if (!f.oneOf("state", Object.keys(states), (s) => states[s]!)) return "state";
      if (!f.oneOf("plan", PLAN_CODES, (p) => ["l.plan = ?", p])) return "plan";
      return null;
    },
    select: `SELECT ${LICENSE_COLUMNS} FROM licenses l`,
    order: "ORDER BY l.created_at DESC, l.id DESC",
    cursor: keysetCursor("l.created_at", "l.id"),
    next: (r) => `${r.created_at}_${r.id}`,
    map: maskLicense,
  });

  listRoute(app, "/admin/trials", {
    resource: "trials",
    filters(f, now) {
      if (!f.oneOf("state", ["active", "ended"], (s) => [s === "active" ? "t.ends_at > ?" : "t.ends_at <= ?", now])) return "state";
      return null;
    },
    select:
      "SELECT t.device_id_hash, t.started_at, t.ends_at, t.last_seen_at, t.device_id_hash IN (SELECT device_id_hash FROM activations) AS purchased FROM trials t",
    order: "ORDER BY t.started_at DESC, t.device_id_hash DESC",
    cursor: keysetCursor("t.started_at", "t.device_id_hash"),
    next: (r) => `${r.started_at}_${r.device_id_hash}`,
    map: (r) => ({ ...r, purchased: r.purchased === 1 }),
  });

  // Việc cần xử lý (spec §3.2): sáu nhóm, mỗi nhóm count và tối đa 20 dòng.
  app.get("/admin/queue", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const db = c.env.DB;
    const now = c.get("deps").now();
    const orders = (where: string, binds: Bind[] = []) => queueGroup(db, ORDER_COLUMNS, "orders", where, "ORDER BY order_code DESC", binds);
    const licenses = (where: string, order: string) => queueGroup(db, LICENSE_COLUMNS, "licenses l", where, order, [], maskLicense);
    const queue = {
      needs_review: await orders("status = 'paid_needs_review'"),
      underpaid: await orders("status = 'underpaid' AND created_at >= ?", [now - 30 * DAY]),
      // Đơn đã trả mà khách chưa nhận thư key: cron thôi gửi (lỗi vĩnh viễn, email_gave_up_at), hoặc quá 24 giờ sau paid_at mà
      // chưa gửi được (cron chỉ thử trong 24 giờ đó và không đặt email_gave_up_at khi hết hạn thử). Hết việc khi admin gửi lại
      // thành công (key_resent với sent = true) sau lúc bỏ cuộc, hoặc sau paid_at nếu cron chưa bỏ cuộc: route resend không
      // cập nhật email_sent_at. License đã thu hồi thì rời nhóm: UI ẩn mọi nút của license đó, kể cả "Gửi lại email", nên đơn
      // sẽ đứng mãi trong hàng đợi mà không còn cách xử lý.
      email_failed: await orders(
        `status = 'paid' AND email IS NOT NULL AND email_sent_at IS NULL AND (email_gave_up_at IS NOT NULL OR paid_at < ?)
         AND NOT EXISTS (SELECT 1 FROM licenses WHERE licenses.id = orders.license_id AND licenses.revoked_at IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.license_id = orders.license_id AND a.action = 'key_resent'
                         AND json_extract(a.detail, '$.sent') = 1 AND a.at >= COALESCE(orders.email_gave_up_at, orders.paid_at))`,
        [now - DAY],
      ),
      locked: await licenses("l.locked_at IS NOT NULL AND l.revoked_at IS NULL", "ORDER BY l.locked_at DESC"),
      conflict: await licenses(`l.revoked_at IS NULL AND ${ACTIVE_DEVICES} > 1`, "ORDER BY l.created_at DESC"),
      alerts: await queueGroup(db, "kind, window_start, count, notified_count", "ops_alerts", "count > notified_count", "ORDER BY window_start DESC"),
    };
    const counts = Object.fromEntries(Object.entries(queue).map(([k, g]) => [k, g.count]));
    await audit(db, { at: now, actor: c.get("actor"), action: "queue_viewed", detail: counts });
    return c.json(queue);
  });

  // Ba số nhanh của trang Việc cần xử lý (spec §3.2). Ngày tính theo GMT+7.
  app.get("/admin/summary", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const db = c.env.DB;
    const now = c.get("deps").now();
    const row = await db
      .prepare(
        `SELECT
           (SELECT COALESCE(SUM(amount_paid), 0) FROM orders WHERE status = 'paid' AND paid_at >= ?1) AS revenue_today,
           (SELECT COUNT(*) FROM orders WHERE status = 'paid' AND paid_at >= ?2) AS paid_orders_7d,
           (SELECT COUNT(*) FROM licenses WHERE revoked_at IS NULL AND expires_at > ?3) AS active_licenses`,
      )
      .bind(vnDayStart(now), now - 7 * DAY, now)
      .first<{ revenue_today: number; paid_orders_7d: number; active_licenses: number }>();
    await audit(db, { at: now, actor: c.get("actor"), action: "summary_viewed" });
    return c.json({
      revenue_today: row?.revenue_today ?? 0,
      currency: "VND",
      paid_orders_7d: row?.paid_orders_7d ?? 0,
      active_licenses: row?.active_licenses ?? 0,
    });
  });
}
