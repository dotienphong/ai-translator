import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { ORDER_CURRENCIES, ORDER_STATUSES } from "../src/admin-read";
import { dayWindow, monthWindow, type Stats, vnDayKey } from "../src/admin-stats";
import { SALE_CURRENCIES } from "../src/checkout";
import { auditCount, lastAudit, makeAdmin } from "./admin-harness";
import { resetDb, wrapDb } from "./db";
import { T0 } from "./world";

beforeEach(resetDb);

/** Giây Unix của một thời điểm theo giờ GMT+7. */
const vn = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000 - 7 * 3600;

/** "Bây giờ" của phần lớn test: 07:00 ngày 01/10/2026 GMT+7 (đúng bằng T0 của harness). */
const NOW = vn(2026, 10, 1, 7);

/** Giá gói (wrangler.jsonc) cho cột `amount` của đơn mẫu: VND, và USD tính bằng cent. */
const PRICE = { monthly: 50000, six_months: 269000, yearly: 500000 } as const;
const PRICE_USD = { monthly: 399, six_months: 2199, yearly: 3999 } as const;

interface OrderSeed {
  status?: string;
  plan?: keyof typeof PRICE;
  /** Mặc định VND (PayOS); USD là đơn Creem. */
  currency?: "VND" | "USD";
  /** Mặc định 50000 (VND) hay giá USD của gói nếu status là paid, 0 nếu không. */
  amountPaid?: number;
  /** Mặc định bằng paidAt (nếu có) hoặc NOW. */
  createdAt?: number;
  /** Mặc định bằng createdAt nếu status là paid, null nếu không. */
  paidAt?: number | null;
  /** Mặc định "new". */
  grantKind?: string | null;
  /** Mặc định có email; null là đơn đã ẩn danh. */
  email?: string | null;
  emailSentAt?: number | null;
}

/** Chèn thẳng một đơn (đủ cột NOT NULL của orders). */
function order(o: OrderSeed = {}): D1PreparedStatement {
  const status = o.status ?? "paid";
  const plan = o.plan ?? "monthly";
  const usd = o.currency === "USD";
  const createdAt = o.createdAt ?? o.paidAt ?? NOW;
  const paidAt = o.paidAt !== undefined ? o.paidAt : status === "paid" ? createdAt : null;
  const amountPaid = o.amountPaid ?? (status === "paid" ? (usd ? PRICE_USD[plan] : 50000) : 0);
  return env.DB.prepare(
    `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email, email_consent_at, status, amount_paid, grant_kind, created_at, expires_at, paid_at, email_sent_at)
     VALUES ('h', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    usd ? "creem" : "payos",
    plan,
    usd ? PRICE_USD[plan] : PRICE[plan],
    usd ? "USD" : "VND",
    o.email !== undefined ? o.email : "khach@example.com",
    createdAt,
    status,
    amountPaid,
    o.grantKind !== undefined ? o.grantKind : "new",
    createdAt,
    createdAt + 900,
    paidAt,
    o.emailSentAt !== undefined ? o.emailSentAt : null,
  );
}

const seed = (...stmts: D1PreparedStatement[]) => env.DB.batch(stmts);

let licSeq = 0;
let actSeq = 0;
beforeEach(() => {
  licSeq = 0;
  actSeq = 0;
});

interface LicenseSeed {
  expiresAt?: number;
  revokedAt?: number | null;
  plan?: "monthly" | "six_months" | "yearly";
}

/** Chèn thẳng một license (id `lic-N`); trả id và câu lệnh. */
function license(o: LicenseSeed = {}): { id: string; stmt: D1PreparedStatement } {
  const n = ++licSeq;
  const id = `lic-${n}`;
  const stmt = env.DB.prepare(
    "INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at, revoked_at) VALUES (?, ?, 'khach@example.com', ?, ?, ?, ?, ?, ?)",
  ).bind(id, `L${String(n).padStart(27, "0")}`, o.plan ?? "monthly", o.expiresAt ?? NOW + 30 * 86400, NOW, NOW, NOW, o.revokedAt ?? null);
  return { id, stmt };
}

/** Chèn thẳng một máy (activation) của license `licenseId`. */
function activation(licenseId: string, o: { device?: string; lastValidatedAt?: number; deactivatedAt?: number | null } = {}): D1PreparedStatement {
  const n = ++actSeq;
  return env.DB.prepare(
    "INSERT INTO activations (id, license_id, device_id_hash, created_at, last_validated_at, deactivated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(`act-${n}`, licenseId, o.device ?? `dev-act-${n}`, NOW, o.lastValidatedAt ?? NOW, o.deactivatedAt ?? null);
}

/** Chèn thẳng một dòng dùng thử; `endsAt` mặc định cách `startedAt` 10 ngày. */
const trial = (device: string, startedAt: number, endsAt = startedAt + 10 * 86400): D1PreparedStatement =>
  env.DB.prepare("INSERT INTO trials (device_id_hash, started_at, ends_at, last_seen_at) VALUES (?, ?, ?, ?)").bind(device, startedAt, endsAt, startedAt);

/** Gọi route với đồng hồ giả ở `now` (và `?currency=` nếu có); kiểm 200 và trả phản hồi đã gõ kiểu. */
async function getStats(now = NOW, currency?: string): Promise<Stats> {
  const { w, adminCall } = makeAdmin();
  w.clock.now = now;
  const res = await adminCall(currency === undefined ? "/admin/stats" : `/admin/stats?currency=${currency}`);
  expect(res.status).toBe(200);
  return res.body as unknown as Stats;
}

const dayOf = (s: Stats, key: string) => s.money.daily.find((d) => d.day === key);
const monthOf = (s: Stats, key: string) => s.money.monthly.find((m) => m.month === key);

describe("cửa sổ ngày và tháng GMT+7", () => {
  it("vnDayKey: 23:59:59 và 00:00:00 GMT+7 là hai ngày khác nhau, dù cùng ngày UTC", () => {
    expect(vnDayKey(vn(2026, 9, 30, 23, 59, 59))).toBe("2026-09-30");
    expect(vnDayKey(vn(2026, 10, 1, 0, 0, 0))).toBe("2026-10-01");
  });

  it("dayWindow: 30 ngày kết thúc hôm nay, tăng dần, qua ranh giới tháng và năm", () => {
    const w = dayWindow(vn(2027, 1, 5, 12), 30);
    expect(w.keys).toHaveLength(30);
    expect(w.keys[0]).toBe("2026-12-07");
    expect(w.keys[29]).toBe("2027-01-05");
    expect(w.keys).toContain("2026-12-31");
    expect(w.start).toBe(vn(2026, 12, 7));
  });

  it("dayWindow: tháng 2 năm nhuận có ngày 29", () => {
    expect(dayWindow(vn(2028, 3, 2, 8), 5).keys).toEqual(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02"]);
  });

  it("monthWindow: 12 tháng kết thúc tháng này, qua năm; mốc đầu tháng theo GMT+7", () => {
    const w = monthWindow(vn(2027, 2, 10, 9), 12);
    expect(w.keys).toEqual([
      "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
      "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02",
    ]);
    expect(w.start).toBe(vn(2026, 3, 1));
    expect(w.thisStart).toBe(vn(2027, 2, 1));
    expect(w.lastStart).toBe(vn(2027, 1, 1));
  });

  it("monthWindow: 00:30 GMT+7 ngày 1 đã là tháng mới (theo UTC vẫn là tháng trước)", () => {
    const w = monthWindow(vn(2026, 10, 1, 0, 30), 2);
    expect(w.keys).toEqual(["2026-09", "2026-10"]);
    expect(w.thisStart).toBe(vn(2026, 10, 1));
  });
});

describe("GET /admin/stats: route", () => {
  it("ghi đúng một dòng nhật ký stats_viewed, không có detail", async () => {
    const { adminCall } = makeAdmin();
    expect((await adminCall("/admin/stats")).status).toBe(200);
    expect(await lastAudit()).toMatchObject({ actor: "admin:ops@example.com", action: "stats_viewed", detail: null });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first()).toEqual({ n: 1 });
  });

  it("D1 lỗi khi tính số liệu: 500 và KHÔNG ghi stats_viewed (chỉ ghi nhật ký sau khi tính xong)", async () => {
    const { db } = wrapDb(env.DB, (q) => q.includes("trials_total"));
    const { adminFetch } = makeAdmin({ DB: db });
    const res = await adminFetch("/admin/stats");
    expect(res.status).toBe(500);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first()).toEqual({ n: 0 });
  });

  it("403 khi request từ trang khác hay không qua Access, và không ghi nhật ký", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/stats", { headers: { "sec-fetch-site": "cross-site" } })).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect((await adminCall("/admin/stats", { operator: null })).status).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first()).toEqual({ n: 0 });
  });
});

describe("GET /admin/stats: Tiền", () => {
  it("cơ sở dữ liệu trống: đủ 30 ngày và 12 tháng, mọi số bằng 0", async () => {
    expect(NOW).toBe(T0);
    const s = await getStats();
    expect(s.generated_at).toBe(NOW);
    expect(s.currency).toBe("VND");
    expect([s.money.today, s.money.last_7d, s.money.this_month, s.money.last_month]).toEqual([0, 0, 0, 0]);
    expect(s.money.daily.map((d) => d.day)).toEqual(dayWindow(NOW, 30).keys);
    expect(s.money.daily[0]?.day).toBe("2026-09-02");
    expect(s.money.daily[29]?.day).toBe("2026-10-01");
    expect(s.money.daily.every((d) => d.revenue === 0 && d.orders === 0)).toBe(true);
    expect(s.money.monthly.map((m) => m.month)).toEqual(monthWindow(NOW, 12).keys);
    expect(s.money.monthly[0]?.month).toBe("2025-11");
    expect(s.money.monthly[11]?.month).toBe("2026-10");
    expect(vnDayKey(NOW)).toBe("2026-10-01");
  });

  it("ranh giới ngày GMT+7: 23:59:59 và 00:00:00 là hai ngày khác nhau dù cùng ngày UTC", async () => {
    await seed(
      order({ paidAt: vn(2026, 9, 30, 23, 30) }),
      order({ paidAt: vn(2026, 9, 30, 23, 59, 59) }),
      order({ paidAt: vn(2026, 10, 1, 0, 0, 0) }),
      order({ paidAt: vn(2026, 10, 1, 0, 10), plan: "yearly", amountPaid: 500000 }),
    );
    const s = await getStats();
    expect(dayOf(s, "2026-09-30")).toEqual({ day: "2026-09-30", revenue: 100000, orders: 2 });
    expect(dayOf(s, "2026-10-01")).toEqual({ day: "2026-10-01", revenue: 550000, orders: 2 });
    expect(s.money.today).toBe(550000);
    expect(s.money.last_7d).toBe(650000);
  });

  it("cửa sổ 30 ngày: đơn lúc 00:00 ngày đầu cửa sổ có mặt, một giây trước thì không", async () => {
    await seed(order({ paidAt: vn(2026, 9, 2, 0, 0, 0) }), order({ paidAt: vn(2026, 9, 1, 23, 59, 59) }));
    const s = await getStats();
    expect(s.money.daily[0]).toEqual({ day: "2026-09-02", revenue: 50000, orders: 1 });
    expect(s.money.daily.reduce((n, d) => n + d.orders, 0)).toBe(1);
    expect(s.money.last_month).toBe(100000); // cả hai thuộc tháng 9
    expect(monthOf(s, "2026-09")?.monthly).toEqual({ revenue: 100000, orders: 2 });
  });

  it("7 ngày gần nhất gồm hôm nay và 6 ngày trước", async () => {
    await seed(
      order({ paidAt: vn(2026, 9, 25, 0, 0, 0) }), // đúng đầu cửa sổ 7 ngày
      order({ paidAt: vn(2026, 9, 24, 23, 59, 59) }), // một giây ngoài
    );
    expect((await getStats()).money.last_7d).toBe(50000);
  });

  it("chỉ đơn paid tính doanh thu; đơn trạng thái khác không vào ngày, tháng hay tổng", async () => {
    await seed(
      order({ paidAt: NOW - 3600 }),
      order({ status: "underpaid", createdAt: NOW - 3600, amountPaid: 20000 }),
      order({ status: "refunded", createdAt: NOW - 3600, amountPaid: 50000, paidAt: NOW - 3600 }),
      order({ status: "paid_needs_review", createdAt: NOW - 3600, amountPaid: 50000, paidAt: NOW - 3600 }),
      order({ status: "pending", createdAt: NOW - 3600 }),
    );
    const s = await getStats();
    expect(s.money.today).toBe(50000);
    expect(s.money.this_month).toBe(50000);
    expect(dayOf(s, "2026-10-01")).toEqual({ day: "2026-10-01", revenue: 50000, orders: 1 });
    expect(monthOf(s, "2026-10")?.monthly).toEqual({ revenue: 50000, orders: 1 });
  });

  it("tháng tách Monthly, 6 Months và Yearly; tháng không có đơn là 0", async () => {
    await seed(
      order({ paidAt: vn(2026, 9, 10, 12) }),
      order({ paidAt: vn(2026, 9, 11, 12), plan: "yearly", amountPaid: 500000 }),
      order({ paidAt: vn(2026, 9, 12, 12), plan: "yearly", amountPaid: 500000 }),
      order({ paidAt: vn(2026, 10, 1, 1), plan: "yearly", amountPaid: 500000 }),
    );
    const s = await getStats();
    const none = { revenue: 0, orders: 0 };
    expect(monthOf(s, "2026-09")).toEqual({ month: "2026-09", monthly: { revenue: 50000, orders: 1 }, six_months: none, yearly: { revenue: 1000000, orders: 2 } });
    expect(monthOf(s, "2026-10")).toEqual({ month: "2026-10", monthly: none, six_months: none, yearly: { revenue: 500000, orders: 1 } });
    expect(monthOf(s, "2026-08")).toEqual({ month: "2026-08", monthly: none, six_months: none, yearly: none });
  });

  it("six_months có doanh thu và số đơn riêng theo tháng, không lẫn vào Monthly hay Yearly", async () => {
    await seed(
      order({ paidAt: vn(2026, 9, 10, 12) }),
      order({ paidAt: vn(2026, 9, 11, 12), plan: "six_months", amountPaid: 269000 }),
      order({ paidAt: vn(2026, 9, 12, 12), plan: "six_months", amountPaid: 269000 }),
      order({ paidAt: vn(2026, 10, 1, 1), plan: "six_months", amountPaid: 269000 }),
      order({ paidAt: vn(2026, 10, 1, 2), plan: "yearly", amountPaid: 500000 }),
    );
    const s = await getStats();
    const none = { revenue: 0, orders: 0 };
    expect(monthOf(s, "2026-09")).toEqual({ month: "2026-09", monthly: { revenue: 50000, orders: 1 }, six_months: { revenue: 538000, orders: 2 }, yearly: none });
    expect(monthOf(s, "2026-10")).toEqual({ month: "2026-10", monthly: none, six_months: { revenue: 269000, orders: 1 }, yearly: { revenue: 500000, orders: 1 } });
    // Doanh thu tháng này gộp mọi gói.
    expect(s.money.this_month).toBe(769000);
  });

  it("ranh giới tháng: tháng 2 có 28 ngày, qua năm, đơn ngoài cửa sổ 12 tháng bị bỏ", async () => {
    await seed(
      order({ paidAt: vn(2026, 1, 31, 23, 59, 59) }), // ngoài cửa sổ (cửa sổ bắt đầu 2026-02)
      order({ paidAt: vn(2026, 2, 1, 0, 0, 0) }),
      order({ paidAt: vn(2026, 2, 28, 23, 59, 59) }),
      order({ paidAt: vn(2026, 3, 1, 0, 0, 0) }),
      order({ paidAt: vn(2026, 12, 31, 23, 59, 59) }),
      order({ paidAt: vn(2027, 1, 1, 0, 0, 0) }),
    );
    const s = await getStats(vn(2027, 1, 15, 12));
    expect(s.money.monthly.map((m) => m.month)).toEqual([
      "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
      "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01",
    ]);
    const orders = (k: string) => monthOf(s, k)?.monthly.orders;
    expect([orders("2026-02"), orders("2026-03"), orders("2026-12"), orders("2027-01")]).toEqual([2, 1, 1, 1]);
    expect(s.money.last_month).toBe(50000); // tháng 12/2026
    expect(s.money.this_month).toBe(50000); // tháng 1/2027
  });

  it("năm nhuận: 29/02 thuộc tháng 2, và last_month của tháng 3 gồm cả ngày đó", async () => {
    await seed(
      order({ paidAt: vn(2028, 2, 1, 0, 0, 0) }),
      order({ paidAt: vn(2028, 2, 29, 23, 59, 59) }),
      order({ paidAt: vn(2028, 3, 1, 0, 0, 0) }),
    );
    const s = await getStats(vn(2028, 3, 5, 10));
    expect(s.money.last_month).toBe(100000);
    expect(s.money.this_month).toBe(50000);
    expect(monthOf(s, "2028-02")?.monthly.orders).toBe(2);
  });
});

describe("GET /admin/stats: Khách hàng", () => {
  it("phễu dùng thử: máy bắt đầu trong 30 ngày và tổng, trong đó máy đã gắn vào một license (kể cả đã gỡ)", async () => {
    const lic = license();
    await seed(
      lic.stmt,
      trial("t1", NOW - 5 * 86400), // trong cửa sổ, đã mua
      trial("t2", NOW - 5 * 86400), // trong cửa sổ, chưa mua
      trial("t3", NOW - 40 * 86400), // ngoài cửa sổ, đã mua (activation đã gỡ vẫn tính)
      trial("t4", NOW - 40 * 86400), // ngoài cửa sổ, chưa mua
      trial("t5", vn(2026, 9, 2, 0, 0, 0)), // đúng đầu cửa sổ: trong, đã mua
      trial("t6", vn(2026, 9, 1, 23, 59, 59)), // một giây ngoài cửa sổ
      activation(lic.id, { device: "t1" }),
      activation(lic.id, { device: "t3", deactivatedAt: NOW - 86400 }),
      activation(lic.id, { device: "t5" }),
      activation(lic.id, { device: "may-khong-dung-thu" }),
    );
    const s = await getStats();
    expect(s.customers.trials_total).toBe(6);
    expect(s.customers.trials_total_purchased).toBe(3);
    expect(s.customers.trials_30d).toBe(3);
    expect(s.customers.trials_30d_purchased).toBe(2); // t1 và t5 (t5 đúng đầu cửa sổ)
  });

  it("mua mới, gia hạn, đổi gói: đếm và doanh thu 30 ngày; grant_kind rỗng hay lạ vào other; đơn không paid không tính", async () => {
    await seed(
      order({ paidAt: NOW - 86400, grantKind: "new", amountPaid: 50000 }),
      order({ paidAt: NOW - 2 * 86400, grantKind: "new", amountPaid: 50000 }),
      order({ paidAt: NOW - 3 * 86400, grantKind: "extend", amountPaid: 50000 }),
      order({ paidAt: NOW - 4 * 86400, grantKind: "change", plan: "yearly", amountPaid: 500000 }),
      order({ paidAt: NOW - 5 * 86400, grantKind: null, amountPaid: 50000 }),
      order({ paidAt: NOW - 6 * 86400, grantKind: "la-hoac-cu", amountPaid: 50000 }),
      order({ status: "refunded", createdAt: NOW - 86400, paidAt: NOW - 86400, grantKind: "new", amountPaid: 50000 }),
      order({ paidAt: NOW - 40 * 86400, grantKind: "new", amountPaid: 50000 }), // ngoài 30 ngày
      order({ paidAt: vn(2026, 9, 2, 0, 0, 0), grantKind: "extend", amountPaid: 50000 }), // đúng đầu cửa sổ: tính
    );
    const s = await getStats();
    expect(s.customers.grants_30d).toEqual({
      new: { orders: 2, revenue: 100000 },
      extend: { orders: 2, revenue: 100000 },
      change: { orders: 1, revenue: 500000 },
      other: { orders: 2, revenue: 100000 },
    });
  });

  it("grants_monthly: đủ 12 tháng, đếm theo tháng của paid_at, đơn 40 ngày trước nằm đúng tháng 8", async () => {
    await seed(
      order({ paidAt: NOW - 86400, grantKind: "new" }), // 30/09
      order({ paidAt: vn(2026, 10, 1, 1), grantKind: "extend" }),
      order({ paidAt: vn(2026, 10, 1, 2), grantKind: "extend" }),
      order({ paidAt: NOW - 40 * 86400, grantKind: "change" }), // 22/08
    );
    const s = await getStats();
    expect(s.customers.grants_monthly.map((m) => m.month)).toEqual(monthWindow(NOW, 12).keys);
    const m = (key: string) => s.customers.grants_monthly.find((x) => x.month === key);
    expect(m("2026-10")).toEqual({ month: "2026-10", new: 0, extend: 2, change: 0, other: 0 });
    expect(m("2026-09")).toEqual({ month: "2026-09", new: 1, extend: 0, change: 0, other: 0 });
    expect(m("2026-08")).toEqual({ month: "2026-08", new: 0, extend: 0, change: 1, other: 0 });
    expect(m("2026-07")).toEqual({ month: "2026-07", new: 0, extend: 0, change: 0, other: 0 });
  });
});

describe("GET /admin/stats: Khách hàng (theo tháng, theo số tiền thực thu)", () => {
  it("grants_monthly: một tháng có nhiều loại, đơn không paid bị bỏ, đơn đúng 00:00:00 ngày 1 của tháng đầu cửa sổ có mặt", async () => {
    await seed(
      order({ paidAt: vn(2026, 9, 5, 12), grantKind: "new" }),
      order({ paidAt: vn(2026, 9, 6, 12), grantKind: "new" }),
      order({ paidAt: vn(2026, 9, 7, 12), grantKind: "extend" }),
      order({ paidAt: vn(2026, 9, 8, 12), grantKind: "change" }),
      order({ paidAt: vn(2026, 9, 9, 12), grantKind: null }),
      order({ status: "refunded", createdAt: vn(2026, 9, 10, 12), paidAt: vn(2026, 9, 10, 12), grantKind: "new" }), // không paid: bỏ
      order({ paidAt: vn(2025, 11, 1, 0, 0, 0), grantKind: "change" }), // đúng đầu cửa sổ 12 tháng
      order({ paidAt: vn(2025, 10, 31, 23, 59, 59), grantKind: "change" }), // một giây ngoài
    );
    const g = (await getStats()).customers.grants_monthly;
    expect(g[0]).toEqual({ month: "2025-11", new: 0, extend: 0, change: 1, other: 0 });
    expect(g.find((x) => x.month === "2026-09")).toEqual({ month: "2026-09", new: 2, extend: 1, change: 1, other: 1 });
    expect(g.reduce((n, x) => n + x.new + x.extend + x.change + x.other, 0)).toBe(6);
  });

  it("doanh thu theo amount_paid (số tiền thực thu), không theo giá gói: hôm nay, ngày, tháng theo gói, 30 ngày theo loại", async () => {
    await seed(
      order({ paidAt: NOW - 3600, plan: "monthly", amountPaid: 30000, grantKind: "extend" }), // thực thu 30.000, giá gói 50.000
      order({ paidAt: NOW - 1800, plan: "yearly", amountPaid: 700000, grantKind: "new" }), // thực thu 700.000, giá gói 500.000
      order({ paidAt: vn(2026, 9, 15, 12), plan: "monthly", amountPaid: 20000, grantKind: "new" }), // tháng trước
    );
    const s = await getStats();
    expect(s.money.today).toBe(730000);
    expect(s.money.last_7d).toBe(730000);
    expect(s.money.this_month).toBe(730000);
    expect(s.money.last_month).toBe(20000);
    expect(dayOf(s, "2026-10-01")).toEqual({ day: "2026-10-01", revenue: 730000, orders: 2 });
    expect(dayOf(s, "2026-09-15")).toEqual({ day: "2026-09-15", revenue: 20000, orders: 1 });
    expect(monthOf(s, "2026-10")).toEqual({
      month: "2026-10",
      monthly: { revenue: 30000, orders: 1 },
      six_months: { revenue: 0, orders: 0 },
      yearly: { revenue: 700000, orders: 1 },
    });
    expect(monthOf(s, "2026-09")?.monthly).toEqual({ revenue: 20000, orders: 1 });
    expect(s.customers.grants_30d.new).toEqual({ orders: 2, revenue: 720000 });
    expect(s.customers.grants_30d.extend).toEqual({ orders: 1, revenue: 30000 });
  });

  it("đếm đơn không phụ thuộc cột email: đơn paid đã ẩn danh (email null) vẫn được đếm theo ngày và tháng", async () => {
    await seed(order({ paidAt: NOW - 3600, email: null }), order({ paidAt: NOW - 1800, email: "a@example.com" }));
    const s = await getStats();
    expect(dayOf(s, "2026-10-01")).toEqual({ day: "2026-10-01", revenue: 100000, orders: 2 });
    expect(monthOf(s, "2026-10")?.monthly).toEqual({ revenue: 100000, orders: 2 });
    expect(s.customers.grants_30d.new.orders).toBe(2);
  });
});

describe("GET /admin/stats: Sức khỏe", () => {
  it("đơn 30 ngày theo trạng thái (theo created_at): đủ chín khóa, đúng thứ tự, đơn ngoài cửa sổ bị bỏ", async () => {
    await seed(
      order({ status: "pending", createdAt: NOW - 3600 }),
      order({ status: "pending", createdAt: NOW - 7200 }),
      order({ paidAt: NOW - 86400 }),
      order({ paidAt: NOW - 2 * 86400 }),
      order({ paidAt: NOW - 3 * 86400 }),
      order({ status: "underpaid", createdAt: NOW - 86400 }),
      order({ status: "failed", createdAt: NOW - 86400 }),
      order({ status: "expired", createdAt: NOW - 86400 }),
      order({ status: "expired", createdAt: NOW - 86400 }),
      order({ status: "refunded", createdAt: NOW - 86400, paidAt: NOW - 86400 }),
      order({ status: "failed", createdAt: vn(2026, 9, 2, 0, 0, 0) }), // đúng đầu cửa sổ: tính
      order({ status: "failed", createdAt: vn(2026, 9, 1, 23, 59, 59) }), // một giây ngoài: bỏ
      order({ createdAt: NOW - 40 * 86400, paidAt: NOW - 86400 }), // tạo ngoài cửa sổ, trả trong cửa sổ: tính theo created_at nên bỏ
    );
    const o = (await getStats()).health.orders_30d;
    expect(Object.keys(o)).toEqual([...ORDER_STATUSES]);
    expect(o).toEqual({
      pending: 2,
      processing: 0,
      paid: 3,
      underpaid: 1,
      cancelled: 0,
      expired: 2,
      failed: 2,
      paid_needs_review: 0,
      refunded: 1,
    });
  });

  it("license sắp hết hạn: biên 7 và 30 ngày, loại license đã thu hồi và đã hết hạn", async () => {
    const D = 86400;
    await seed(
      license({ expiresAt: NOW + 7 * D }).stmt, // 7 và 30 ngày
      license({ expiresAt: NOW + 7 * D + 1 }).stmt, // chỉ 30 ngày
      license({ expiresAt: NOW + 30 * D }).stmt, // 30 ngày
      license({ expiresAt: NOW + 30 * D + 1 }).stmt, // ngoài cả hai
      license({ expiresAt: NOW }).stmt, // hết hạn đúng lúc này: không còn hiệu lực
      license({ expiresAt: NOW - D }).stmt, // đã hết hạn
      license({ expiresAt: NOW + 3 * D, revokedAt: NOW - D }).stmt, // đã thu hồi
    );
    const h = (await getStats()).health;
    expect(h.expiring_7d).toBe(1);
    expect(h.expiring_30d).toBe(3);
  });

  it("gửi key: chỉ đơn paid trong 30 ngày có email; đơn đã ẩn danh, đơn cũ, đơn chưa trả và đơn hoàn tiền không tính", async () => {
    await seed(
      order({ paidAt: NOW - 86400, email: "a@example.com", emailSentAt: NOW - 86400 + 60 }), // đã gửi
      order({ paidAt: NOW - 2 * 86400, email: "b@example.com", emailSentAt: NOW - 2 * 86400 + 60 }), // đã gửi
      order({ paidAt: NOW - 3 * 86400, email: "e@example.com", emailSentAt: null }), // chưa gửi
      order({ paidAt: vn(2026, 9, 2, 0, 0, 0), email: "f@example.com", emailSentAt: vn(2026, 9, 2, 0, 1) }), // đúng đầu cửa sổ: tính
      order({ paidAt: NOW - 4 * 86400, email: null, emailSentAt: null }), // đã ẩn danh: không tính
      order({ paidAt: NOW - 40 * 86400, email: "c@example.com", emailSentAt: null }), // ngoài 30 ngày
      order({ status: "pending", createdAt: NOW - 86400, email: "d@example.com" }), // chưa trả
      order({ status: "refunded", createdAt: NOW - 86400, paidAt: NOW - 86400, email: "g@example.com", emailSentAt: NOW - 86400 + 60 }), // hoàn tiền: không tính
    );
    expect((await getStats()).health.email).toEqual({ paid_with_email_30d: 4, sent: 3 });
  });
});

describe("GET /admin/stats: Sử dụng", () => {
  it("license đang hoạt động: chưa thu hồi và chưa hết hạn, bằng với /admin/summary", async () => {
    await seed(
      license({ expiresAt: NOW + 86400 }).stmt,
      license({ expiresAt: NOW + 365 * 86400, plan: "yearly" }).stmt,
      license({ expiresAt: NOW }).stmt, // hết hạn đúng lúc này
      license({ expiresAt: NOW - 86400 }).stmt,
      license({ expiresAt: NOW + 86400, revokedAt: NOW - 60 }).stmt,
    );
    const { w, adminCall } = makeAdmin();
    w.clock.now = NOW;
    const stats = (await adminCall("/admin/stats")).body as unknown as Stats;
    const summary = (await adminCall("/admin/summary")).body as { active_licenses: number };
    expect(stats.usage.active_licenses).toBe(2);
    expect(stats.usage.active_licenses).toBe(summary.active_licenses);
  });

  it("máy đang kích hoạt: chỉ máy chưa gỡ trên license đang hoạt động; 7 ngày tính theo last_validated_at", async () => {
    const D = 86400;
    const live = license({ expiresAt: NOW + 30 * D });
    const expired = license({ expiresAt: NOW - D });
    const revoked = license({ expiresAt: NOW + 30 * D, revokedAt: NOW - D });
    const expiredNow = license({ expiresAt: NOW }); // hết hạn đúng lúc này
    await seed(
      live.stmt,
      expired.stmt,
      revoked.stmt,
      expiredNow.stmt,
      activation(live.id, { lastValidatedAt: NOW }), // tính cả hai
      activation(live.id, { lastValidatedAt: NOW - 7 * D }), // đúng biên 7 ngày: tính vào devices_7d
      activation(live.id, { lastValidatedAt: NOW - 7 * D - 1 }), // quá 7 ngày: chỉ active_devices
      activation(live.id, { deactivatedAt: NOW - D }), // đã gỡ: không tính
      activation(expired.id), // license hết hạn: không tính
      activation(revoked.id), // license đã thu hồi: không tính
      activation(expiredNow.id), // license hết hạn đúng lúc này: không tính
    );
    const u = (await getStats()).usage;
    expect(u.active_devices).toBe(3);
    expect(u.devices_7d).toBe(2);
  });

  it("máy dùng thử còn hạn: ends_at phải lớn hơn bây giờ", async () => {
    await seed(trial("a", NOW - 86400, NOW + 1), trial("b", NOW - 86400, NOW), trial("c", NOW - 20 * 86400, NOW - 10 * 86400));
    expect((await getStats()).usage.trials_active).toBe(1);
  });

  it("máy dùng thử mới theo ngày GMT+7: 23:30 và 00:10 là hai ngày, máy ngoài 30 ngày không có trong dãy", async () => {
    await seed(
      trial("d1", vn(2026, 9, 30, 23, 30)),
      trial("d2", vn(2026, 10, 1, 0, 10)),
      trial("d3", vn(2026, 10, 1, 6, 0)),
      trial("d4", vn(2026, 9, 2, 0, 0, 0)), // đúng đầu cửa sổ
      trial("d5", vn(2026, 9, 1, 23, 59, 59)), // một giây ngoài
    );
    const s = await getStats();
    const daily = s.usage.new_trials_daily;
    expect(daily.map((d) => d.day)).toEqual(dayWindow(NOW, 30).keys);
    const count = (key: string) => daily.find((d) => d.day === key)?.count;
    expect([count("2026-09-30"), count("2026-10-01"), count("2026-09-02")]).toEqual([1, 2, 1]);
    expect(daily.reduce((n, d) => n + d.count, 0)).toBe(4);
    expect(s.customers.trials_total).toBe(5); // máy ngoài cửa sổ vẫn có trong tổng
  });
});

describe("GET /admin/stats: loại tiền (VND qua PayOS, USD qua Creem)", () => {
  /**
   * Bán cả hai loại tiền: hôm nay (01/10) mỗi loại 1 đơn Monthly mua mới; 3 ngày trước (28/09, tháng trước) 1 đơn Yearly, nhưng
   * khác loại cấp quyền: VND gia hạn (extend), USD đổi gói (change). Cơ cấu loại cấp quyền của hai loại tiền phải khác nhau để
   * câu SQL nào lọc nhầm loại tiền (hay bind cứng một loại) làm test đỏ; hai loại cùng cơ cấu thì kết quả trùng nhau và không bắt được.
   */
  async function seedBoth() {
    await seed(
      order({ paidAt: NOW - 60 }),
      order({ paidAt: NOW - 60, currency: "USD" }),
      order({ paidAt: NOW - 3 * 86400, currency: "USD", plan: "yearly", grantKind: "change" }),
      order({ paidAt: NOW - 3 * 86400, amountPaid: 500000, plan: "yearly", grantKind: "extend" }),
    );
  }

  it("mặc định là VND: đơn USD không cộng vào doanh thu VND (ngày, tháng, theo gói, 30 ngày theo loại)", async () => {
    await seedBoth();
    const s = await getStats();
    expect(s.currency).toBe("VND");
    expect(s.currencies).toEqual(["VND", "USD"]);
    expect([s.money.today, s.money.last_7d, s.money.this_month, s.money.last_month]).toEqual([50000, 550000, 50000, 500000]);
    expect(dayOf(s, "2026-10-01")).toEqual({ day: "2026-10-01", revenue: 50000, orders: 1 });
    expect(monthOf(s, "2026-10")).toMatchObject({ monthly: { revenue: 50000, orders: 1 }, yearly: { revenue: 0, orders: 0 } });
    expect(monthOf(s, "2026-09")).toMatchObject({ monthly: { revenue: 0, orders: 0 }, yearly: { revenue: 500000, orders: 1 } });
    expect(s.customers.grants_30d).toMatchObject({
      new: { revenue: 50000, orders: 1 },
      extend: { revenue: 500000, orders: 1 },
      change: { revenue: 0, orders: 0 },
    });
    expect(s.customers.grants_monthly.slice(-2)).toMatchObject([
      { extend: 1, new: 0, change: 0 },
      { new: 1, extend: 0, change: 0 },
    ]);
  });

  it("?currency=USD: chỉ đơn USD, số tiền là cent; ngày, tháng theo gói, 30 ngày theo loại và đơn theo tháng đều theo USD", async () => {
    await seedBoth();
    const s = await getStats(NOW, "USD");
    expect(s.currency).toBe("USD");
    expect(s.currencies).toEqual(["VND", "USD"]);
    expect([s.money.today, s.money.last_7d, s.money.this_month, s.money.last_month]).toEqual([399, 399 + 3999, 399, 3999]);
    expect(dayOf(s, "2026-10-01")).toEqual({ day: "2026-10-01", revenue: 399, orders: 1 });
    expect(dayOf(s, "2026-09-28")).toEqual({ day: "2026-09-28", revenue: 3999, orders: 1 });
    expect(monthOf(s, "2026-10")).toMatchObject({ monthly: { revenue: 399, orders: 1 }, six_months: { revenue: 0, orders: 0 }, yearly: { revenue: 0, orders: 0 } });
    expect(monthOf(s, "2026-09")).toMatchObject({ monthly: { revenue: 0, orders: 0 }, yearly: { revenue: 3999, orders: 1 } });
    // Khác VND ở loại cấp quyền (đổi gói, không phải gia hạn): bind cứng "VND" hay bỏ lọc loại tiền ở câu nào cũng lộ ra.
    expect(s.customers.grants_30d).toMatchObject({
      new: { revenue: 399, orders: 1 },
      extend: { revenue: 0, orders: 0 },
      change: { revenue: 3999, orders: 1 },
    });
    expect(s.customers.grants_monthly.slice(-2)).toMatchObject([
      { change: 1, extend: 0, new: 0 },
      { new: 1, extend: 0, change: 0 },
    ]);
  });

  it("6 Months bằng USD có doanh thu riêng, không lẫn vào Monthly hay Yearly", async () => {
    await seed(order({ paidAt: NOW - 60, currency: "USD", plan: "six_months" }));
    const s = await getStats(NOW, "USD");
    expect(monthOf(s, "2026-10")).toMatchObject({ monthly: { revenue: 0, orders: 0 }, six_months: { revenue: 2199, orders: 1 }, yearly: { revenue: 0, orders: 0 } });
    expect((await getStats()).money.today).toBe(0);
  });

  it("currencies: VND luôn có; USD chỉ khi đã có đơn thu tiền USD (kể cả đơn đã hoàn tiền), không phải đơn USD chưa trả", async () => {
    expect((await getStats()).currencies).toEqual(["VND"]);
    await seed(order({ currency: "USD", status: "pending" }), order({ currency: "USD", status: "expired" }));
    expect((await getStats()).currencies).toEqual(["VND"]);
    await seed(order({ currency: "USD", status: "refunded", amountPaid: 399, paidAt: NOW - 60 }));
    expect((await getStats()).currencies).toEqual(["VND", "USD"]);
    // Xem USD khi chưa có đơn USD nào đã trả vẫn hợp lệ: toàn số 0.
    await env.DB.prepare("DELETE FROM orders").run();
    const empty = await getStats(NOW, "USD");
    expect(empty).toMatchObject({ currency: "USD", currencies: ["VND"], money: { today: 0, last_7d: 0, this_month: 0, last_month: 0 } });
    expect(empty.money.daily.every((d) => d.revenue === 0 && d.orders === 0)).toBe(true);
    expect(empty.money.monthly.every((m) => m.monthly.revenue === 0 && m.six_months.revenue === 0 && m.yearly.revenue === 0)).toBe(true);
  });

  // Đơn Creem hết hạn rồi cấp tay (admin.ts dùng amount_paid của đơn, là 0), đơn paid_needs_review và đơn hoàn tiền có thể có
  // amount_paid = 0: vẫn là đơn USD đã xử lý, nên nút USD phải hiện (trang vẫn đếm đơn của chúng ở ngày và tháng).
  it.each(["paid", "paid_needs_review", "refunded"])("currencies: đơn USD %s dù amount_paid = 0 (vd cấp tay đơn hết hạn) vẫn đưa USD vào danh sách", async (status) => {
    await seed(order({ currency: "USD", status, amountPaid: 0, paidAt: NOW - 60 }));
    expect((await getStats(NOW, "USD")).currencies).toEqual(["VND", "USD"]);
    expect((await getStats()).currencies).toEqual(["VND", "USD"]);
  });

  it("đơn USD paid cấp tay (amount_paid = 0) hiện ở số đơn theo ngày với doanh thu 0, và USD có trong currencies", async () => {
    await seed(order({ currency: "USD", status: "paid", amountPaid: 0, paidAt: NOW - 60 }));
    const s = await getStats(NOW, "USD");
    expect(s.currencies).toEqual(["VND", "USD"]);
    expect(dayOf(s, "2026-10-01")).toEqual({ day: "2026-10-01", revenue: 0, orders: 1 });
    expect(s.money.today).toBe(0);
  });

  it.each(["pending", "processing", "underpaid", "cancelled", "expired", "failed"])(
    "currencies: đơn USD %s chưa thu đồng nào (amount_paid = 0) không đưa USD vào danh sách",
    async (status) => {
      await seed(order({ currency: "USD", status, amountPaid: 0, createdAt: NOW - 60 }));
      expect((await getStats()).currencies).toEqual(["VND"]);
    },
  );

  it("currencies: đơn USD chưa thành công nhưng đã ghi số tiền khách trả (underpaid, amount_paid > 0) vẫn đưa USD vào danh sách", async () => {
    await seed(order({ currency: "USD", status: "underpaid", amountPaid: 100, createdAt: NOW - 60 }));
    expect((await getStats()).currencies).toEqual(["VND", "USD"]);
  });

  it("sức khỏe, dùng thử và sử dụng không theo loại tiền: cùng một số, có nghĩa (khác 0), dù xem VND hay USD", async () => {
    const lic = license();
    await seed(
      lic.stmt,
      activation(lic.id, { device: "may-1" }),
      trial("may-1", NOW - 5 * 86400), // trong 30 ngày, đã gắn license
      trial("may-2", NOW - 3600), // trong 30 ngày, chưa mua
      order({ currency: "USD", paidAt: NOW - 60, emailSentAt: NOW - 30 }),
      order({ currency: "USD", status: "expired", createdAt: NOW - 60 }),
      order({ paidAt: NOW - 120 }), // VND đã trả, chưa gửi key
    );
    const vnd = await getStats();
    const usd = await getStats(NOW, "USD");
    const trials = (s: Stats) => ({
      total: s.customers.trials_total,
      purchased: s.customers.trials_total_purchased,
      d30: s.customers.trials_30d,
      d30_purchased: s.customers.trials_30d_purchased,
    });
    // Đơn của cả hai loại tiền nằm chung trong sức khỏe: 2 đơn paid (1 USD + 1 VND), 1 expired, 1 trong 2 đã gửi key.
    expect(vnd.health.orders_30d).toMatchObject({ paid: 2, expired: 1 });
    expect(vnd.health.email).toEqual({ paid_with_email_30d: 2, sent: 1 });
    expect(vnd.health).toMatchObject({ expiring_7d: 0, expiring_30d: 1 });
    expect(vnd.health).toEqual(usd.health);
    expect(vnd.usage).toMatchObject({ active_licenses: 1, active_devices: 1, devices_7d: 1, trials_active: 2 });
    expect(vnd.usage.new_trials_daily.reduce((n, d) => n + d.count, 0)).toBe(2);
    expect(vnd.usage).toEqual(usd.usage);
    expect(trials(vnd)).toEqual({ total: 2, purchased: 1, d30: 2, d30_purchased: 1 });
    expect(trials(usd)).toEqual(trials(vnd));
  });

  it("currency không hợp lệ: 400 invalid_request field currency, không ghi nhật ký; rỗng thì như mặc định VND", async () => {
    const { adminCall } = makeAdmin();
    for (const bad of ["EUR", "usd", "VND,USD", "USD%20", "0"]) {
      expect(await adminCall(`/admin/stats?currency=${bad}`), bad).toMatchObject({ status: 400, body: { error: "invalid_request", field: "currency" } });
    }
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first()).toEqual({ n: 0 });
    expect((await adminCall("/admin/stats?currency=")).body).toMatchObject({ currency: "VND" });
    expect((await adminCall("/admin/stats?currency=USD")).body).toMatchObject({ currency: "USD" });
  });

  it("?currency=VND tường minh cho đúng kết quả của mặc định, không lẫn đơn USD", async () => {
    await seedBoth();
    const explicit = await getStats(NOW, "VND");
    expect(explicit).toEqual(await getStats());
    expect(explicit.currency).toBe("VND");
    expect(explicit.money.today).toBe(50000);
  });

  it("mỗi lần xem hợp lệ ghi đúng một dòng stats_viewed, kể cả khi chọn loại tiền (?currency=USD, ?currency=VND)", async () => {
    const { adminCall } = makeAdmin();
    expect(await auditCount("stats_viewed")).toBe(0);
    const queries = ["?currency=USD", "?currency=USD", "?currency=VND", ""];
    for (const [i, q] of queries.entries()) {
      expect((await adminCall(`/admin/stats${q}`)).status, q).toBe(200);
      expect(await auditCount("stats_viewed"), q).toBe(i + 1);
    }
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first()).toEqual({ n: queries.length });
  });

  it("tham số lặp: Hono lấy giá trị đầu (?currency=USD&currency=EUR là USD, ?currency=EUR&currency=USD là 400)", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/stats?currency=USD&currency=EUR")).toMatchObject({ status: 200, body: { currency: "USD" } });
    expect(await adminCall("/admin/stats?currency=EUR&currency=USD")).toMatchObject({ status: 400, body: { error: "invalid_request", field: "currency" } });
    expect(await auditCount("stats_viewed")).toBe(1);
  });

  it("danh sách loại tiền chỉ có một nguồn: ORDER_CURRENCIES của Web Admin bằng SALE_CURRENCIES của checkout; loại nào bán được thì xem được", async () => {
    expect([...ORDER_CURRENCIES]).toEqual([...SALE_CURRENCIES]);
    for (const currency of SALE_CURRENCIES) expect((await getStats(NOW, currency)).currency).toBe(currency);
  });

  it("request từ trang khác vẫn 403 trước khi kiểm currency", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/stats?currency=EUR", { headers: { "sec-fetch-site": "cross-site" } })).toMatchObject({ status: 403 });
  });
});

describe("GET /admin/stats: hợp đồng", () => {
  it("cơ sở dữ liệu trống: toàn bộ phản hồi đúng từng trường", async () => {
    const zero = { revenue: 0, orders: 0 };
    expect(await getStats()).toEqual({
      generated_at: NOW,
      currency: "VND",
      currencies: ["VND"],
      money: {
        today: 0,
        last_7d: 0,
        this_month: 0,
        last_month: 0,
        daily: dayWindow(NOW, 30).keys.map((day) => ({ day, revenue: 0, orders: 0 })),
        monthly: monthWindow(NOW, 12).keys.map((month) => ({ month, monthly: zero, six_months: zero, yearly: zero })),
      },
      customers: {
        trials_30d: 0,
        trials_30d_purchased: 0,
        trials_total: 0,
        trials_total_purchased: 0,
        grants_30d: { new: zero, extend: zero, change: zero, other: zero },
        grants_monthly: monthWindow(NOW, 12).keys.map((month) => ({ month, new: 0, extend: 0, change: 0, other: 0 })),
      },
      health: {
        orders_30d: Object.fromEntries(ORDER_STATUSES.map((st) => [st, 0])),
        expiring_7d: 0,
        expiring_30d: 0,
        email: { paid_with_email_30d: 0, sent: 0 },
      },
      usage: {
        active_licenses: 0,
        active_devices: 0,
        devices_7d: 0,
        trials_active: 0,
        new_trials_daily: dayWindow(NOW, 30).keys.map((day) => ({ day, count: 0 })),
      },
    });
  });

  it("phản hồi chỉ có số: không có email, key hay mã máy của dữ liệu", async () => {
    const lic = license();
    await seed(
      lic.stmt,
      order({ paidAt: NOW - 60, email: "bi-mat@example.com", emailSentAt: NOW - 30 }),
      trial("ma-may-bi-mat", NOW - 60),
      activation(lic.id, { device: "ma-may-bi-mat" }),
    );
    const { w, adminCall } = makeAdmin();
    w.clock.now = NOW;
    const text = JSON.stringify((await adminCall("/admin/stats")).body);
    expect(text).not.toMatch(/@|example\.com|bi-mat|ma-may|L0{20}/);
  });

  it("phản hồi không được lưu đệm: Cache-Control no-store (dữ liệu kinh doanh)", async () => {
    const { adminFetch } = makeAdmin();
    const res = await adminFetch("/admin/stats");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("stats_viewed ẩn khỏi /admin/audit mặc định, hiện khi include_views=1 hay lọc đúng action đó", async () => {
    const { adminCall } = makeAdmin();
    await adminCall("/admin/stats");
    const actions = async (q = "") =>
      ((await adminCall(`/admin/audit${q}`)).body as unknown as { items: { action: string }[] }).items.map((i) => i.action);
    expect(await actions()).not.toContain("stats_viewed");
    expect(await actions("?include_views=1")).toContain("stats_viewed");
    expect(await actions("?action=stats_viewed")).toEqual(["stats_viewed"]);
  });
});
