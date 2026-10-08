import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "../src/admin-read";
import { dayWindow, monthWindow, type Stats, vnDayKey } from "../src/admin-stats";
import { lastAudit, makeAdmin } from "./admin-harness";
import { resetDb } from "./db";
import { T0 } from "./world";

beforeEach(resetDb);

/** Giây Unix của một thời điểm theo giờ GMT+7. */
const vn = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000 - 7 * 3600;

/** "Bây giờ" của phần lớn test: 07:00 ngày 01/10/2026 GMT+7 (đúng bằng T0 của harness). */
const NOW = vn(2026, 10, 1, 7);

interface OrderSeed {
  status?: string;
  plan?: "monthly" | "yearly";
  /** Mặc định 50000 nếu status là paid, 0 nếu không. */
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
  const createdAt = o.createdAt ?? o.paidAt ?? NOW;
  const paidAt = o.paidAt !== undefined ? o.paidAt : status === "paid" ? createdAt : null;
  const amountPaid = o.amountPaid ?? (status === "paid" ? 50000 : 0);
  return env.DB.prepare(
    `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email, email_consent_at, status, amount_paid, grant_kind, created_at, expires_at, paid_at, email_sent_at)
     VALUES ('h', 'payos', ?, ?, 'VND', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    o.plan ?? "monthly",
    o.plan === "yearly" ? 500000 : 50000,
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
  plan?: "monthly" | "yearly";
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

/** Gọi route với đồng hồ giả ở `now`; kiểm 200 và trả phản hồi đã gõ kiểu. */
async function getStats(now = NOW): Promise<Stats> {
  const { w, adminCall } = makeAdmin();
  w.clock.now = now;
  const res = await adminCall("/admin/stats");
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

  it("tháng tách Monthly và Yearly; tháng không có đơn là 0", async () => {
    await seed(
      order({ paidAt: vn(2026, 9, 10, 12) }),
      order({ paidAt: vn(2026, 9, 11, 12), plan: "yearly", amountPaid: 500000 }),
      order({ paidAt: vn(2026, 9, 12, 12), plan: "yearly", amountPaid: 500000 }),
      order({ paidAt: vn(2026, 10, 1, 1), plan: "yearly", amountPaid: 500000 }),
    );
    const s = await getStats();
    expect(monthOf(s, "2026-09")).toEqual({ month: "2026-09", monthly: { revenue: 50000, orders: 1 }, yearly: { revenue: 1000000, orders: 2 } });
    expect(monthOf(s, "2026-10")).toEqual({ month: "2026-10", monthly: { revenue: 0, orders: 0 }, yearly: { revenue: 500000, orders: 1 } });
    expect(monthOf(s, "2026-08")).toEqual({ month: "2026-08", monthly: { revenue: 0, orders: 0 }, yearly: { revenue: 0, orders: 0 } });
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
      trial("t5", vn(2026, 9, 2, 0, 0, 0)), // đúng đầu cửa sổ: trong
      trial("t6", vn(2026, 9, 1, 23, 59, 59)), // một giây ngoài cửa sổ
      activation(lic.id, { device: "t1" }),
      activation(lic.id, { device: "t3", deactivatedAt: NOW - 86400 }),
      activation(lic.id, { device: "may-khong-dung-thu" }),
    );
    const s = await getStats();
    expect(s.customers.trials_total).toBe(6);
    expect(s.customers.trials_total_purchased).toBe(2);
    expect(s.customers.trials_30d).toBe(3);
    expect(s.customers.trials_30d_purchased).toBe(1);
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
    );
    const s = await getStats();
    expect(s.customers.grants_30d).toEqual({
      new: { orders: 2, revenue: 100000 },
      extend: { orders: 1, revenue: 50000 },
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

  it("gửi key: chỉ đơn paid trong 30 ngày có email; đơn đã ẩn danh, đơn cũ và đơn chưa trả không tính", async () => {
    await seed(
      order({ paidAt: NOW - 86400, email: "a@example.com", emailSentAt: NOW - 86400 + 60 }), // đã gửi
      order({ paidAt: NOW - 2 * 86400, email: "b@example.com", emailSentAt: null }), // chưa gửi
      order({ paidAt: NOW - 3 * 86400, email: null, emailSentAt: null }), // đã ẩn danh: không tính
      order({ paidAt: NOW - 40 * 86400, email: "c@example.com", emailSentAt: null }), // ngoài 30 ngày
      order({ status: "pending", createdAt: NOW - 86400, email: "d@example.com" }), // chưa trả
    );
    expect((await getStats()).health.email).toEqual({ paid_with_email_30d: 2, sent: 1 });
  });
});
