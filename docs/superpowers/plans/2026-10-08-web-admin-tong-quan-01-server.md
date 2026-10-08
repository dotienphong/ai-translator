# Web Admin phần 2 · 01: Server (`GET /admin/stats`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Route chỉ đọc `GET /admin/stats` trả số liệu Tổng quan (spec mục 2, 3), tính trong một `db.batch`, ghi đúng một dòng nhật ký `stats_viewed`.

**Kiến trúc:** Một file `server/src/admin-stats.ts` gồm: kiểu `Stats`, hàm cửa sổ ngày và tháng GMT+7, bốn "mục" (`money`, `customers`, `health`, `usage`), mỗi mục có `statements` (các câu SQL đã bind) và `build` (ghép kết quả thành phần của phản hồi); `computeStats` gom mọi câu vào một `db.batch` rồi chia kết quả lại cho từng mục; `registerAdminStats` đăng ký route. `admin.ts` gọi `registerAdminStats(app)` ngay sau `registerAdminRead(app)`.

**Công nghệ:** TypeScript, Hono 4, D1, Vitest + `@cloudflare/vitest-plugin`. Không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-10-08-web-admin-tong-quan-design.md` (mục 2, 3, 6). Hợp đồng và quy ước chung: `2026-10-08-web-admin-tong-quan-00-tong-quan.md`.

---

## Quy ước

- Làm trên `main` (xem quy ước ở file 00). Mọi lệnh chạy từ thư mục `server/`.
- Test chạy một file: `pnpm exec vitest run test/admin-stats.test.ts`.
- Kiểm kiểu: `pnpm exec tsc --noEmit`.
- `server/tsconfig.json` bật `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` và `verbatimModuleSyntax` (kiểu chỉ-kiểu phải nhập bằng `import type` hay `type` nội tuyến). Không bật `noUnusedLocals`, nên hằng số thêm trước khi dùng không làm `tsc` đỏ.
- Đọc `server/src/admin-read.ts` (route `summary`, `queue`) và `server/test/admin-read.test.ts` (phần `GET /admin/summary`) trước khi bắt đầu: route mới đi theo cùng khuôn.

---

## Task 1: Hằng số dùng chung, `stats_viewed` ẩn mặc định, hàm cửa sổ ngày và tháng

**Files:**
- Modify: `server/src/admin-read.ts` (xuất `DAY`, `VN_OFFSET`; thêm `stats_viewed` vào `VIEW_ACTIONS`)
- Create: `server/src/admin-stats.ts` (kiểu `Stats`, `vnDayKey`, `dayWindow`, `monthWindow`)
- Create: `server/test/admin-stats.test.ts`

- [ ] **Step 1: Viết test (đỏ)**

Tạo `server/test/admin-stats.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { dayWindow, monthWindow, vnDayKey } from "../src/admin-stats";
import { resetDb } from "./db";

beforeEach(resetDb);

/** Giây Unix của một thời điểm theo giờ GMT+7. */
const vn = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000 - 7 * 3600;

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
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `pnpm exec vitest run test/admin-stats.test.ts`
Expected: FAIL, lỗi không tìm thấy module `../src/admin-stats`.

- [ ] **Step 3: Xuất hằng số và thêm `stats_viewed` trong `admin-read.ts`**

Trong `server/src/admin-read.ts`, đổi hai dòng hằng số:

```ts
export const DAY = 86400;
export const VN_OFFSET = 7 * 3600;
```

(thay `const DAY = 86400;` và `const VN_OFFSET = 7 * 3600;` hiện có) và đổi dòng `VIEW_ACTIONS`:

```ts
export const VIEW_ACTIONS = ["lookup", "list_viewed", "queue_viewed", "summary_viewed", "stats_viewed", "payment_status_viewed"] as const;
```

- [ ] **Step 4: Tạo `server/src/admin-stats.ts` (kiểu và hàm cửa sổ)**

```ts
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
```

Lưu ý: `ORDER_STATUSES` được nhập bằng `import type`-style (`type ORDER_STATUSES`) vì ở Task này chỉ dùng cho kiểu; Task 2 sẽ cần nó như giá trị và đổi lại thành import thường.

- [ ] **Step 5: Chạy, thấy xanh**

Run: `pnpm exec vitest run test/admin-stats.test.ts && pnpm exec tsc --noEmit`
Expected: 5 test PASS; `tsc` không báo lỗi.

- [ ] **Step 6: Chạy lại test admin cũ (hằng số đã xuất, VIEW_ACTIONS đã đổi)**

Run: `pnpm exec vitest run test/admin-read.test.ts`
Expected: toàn bộ PASS (thêm một action vào danh sách ẩn không làm hỏng test hiện có).

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # phải ra: main
git add server/src/admin-read.ts server/src/admin-stats.ts server/test/admin-stats.test.ts
git commit -m "feat(admin): nền cho Tổng quan: kiểu Stats, cửa sổ ngày và tháng GMT+7, stats_viewed ẩn mặc định

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 2: Route `GET /admin/stats` và mục Tiền

**Files:**
- Modify: `server/src/admin-stats.ts` (mục `money`, `computeStats`, `registerAdminStats`; ba mục còn lại là hàm tạm)
- Modify: `server/src/admin.ts` (đăng ký route)
- Modify: `server/test/admin-stats.test.ts` (helper seed, test mục Tiền và route)

- [ ] **Step 1: Viết test (đỏ)**

Thay khối `import` đầu file `server/test/admin-stats.test.ts` bằng:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { dayWindow, monthWindow, type Stats, vnDayKey } from "../src/admin-stats";
import { lastAudit, makeAdmin } from "./admin-harness";
import { resetDb } from "./db";
import { T0 } from "./world";
```

Ngay sau dòng `const vn = …` thêm helper và hằng số:

```ts
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
```

Thêm vào cuối file:

```ts
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
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `pnpm exec vitest run test/admin-stats.test.ts`
Expected: các test mới FAIL (route `/admin/stats` trả 404); năm test cửa sổ của Task 1 vẫn PASS.

- [ ] **Step 3: Viết mục Tiền, `computeStats` và route trong `admin-stats.ts`**

Đổi dòng import đầu file thành (đã cần `ORDER_STATUSES` làm giá trị):

```ts
import type { Hono } from "hono";
import { type AdminAppEnv, crossSite } from "./admin-auth";
import { DAY, ORDER_STATUSES, VN_OFFSET, vnDayStart } from "./admin-read";
import { audit } from "./audit";
import { fail } from "./http";
import { PLAN_CODES, type PlanCode } from "./plans";
```

(thay hai dòng `import … "./admin-read"` và `import type { PlanCode } …` cũ; dòng `type OrderStatus = (typeof ORDER_STATUSES)[number];` giữ nguyên.)

Thêm vào cuối file:

```ts
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

const zeroTotals = (): Totals => ({ revenue: 0, orders: 0 });

// Tạm (Task 3 thay): đủ hình dạng, toàn số 0, chưa có câu SQL nào.
function customersSection(_db: D1Database, w: Windows): Section<Stats["customers"]> {
  return {
    statements: [],
    build: () => ({
      trials_30d: 0,
      trials_30d_purchased: 0,
      trials_total: 0,
      trials_total_purchased: 0,
      grants_30d: { new: zeroTotals(), extend: zeroTotals(), change: zeroTotals(), other: zeroTotals() },
      grants_monthly: w.months.keys.map((month) => ({ month, new: 0, extend: 0, change: 0, other: 0 })),
    }),
  };
}

// Tạm (Task 4 thay).
function healthSection(_db: D1Database, _w: Windows): Section<Stats["health"]> {
  return {
    statements: [],
    build: () => ({
      orders_30d: Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Stats["health"]["orders_30d"],
      expiring_7d: 0,
      expiring_30d: 0,
      email: { paid_with_email_30d: 0, sent: 0 },
    }),
  };
}

// Tạm (Task 5 thay).
function usageSection(_db: D1Database, w: Windows): Section<Stats["usage"]> {
  return {
    statements: [],
    build: () => ({
      active_licenses: 0,
      active_devices: 0,
      devices_7d: 0,
      trials_active: 0,
      new_trials_daily: w.days.keys.map((day) => ({ day, count: 0 })),
    }),
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
```

- [ ] **Step 4: Đăng ký route trong `admin.ts`**

Trong `server/src/admin.ts`, ngay sau dòng `import { registerAdminRead } from "./admin-read";` thêm:

```ts
import { registerAdminStats } from "./admin-stats";
```

và ngay sau dòng `registerAdminRead(app);` (trong `createAdminApp`) thêm:

```ts
  registerAdminStats(app);
```

- [ ] **Step 5: Chạy, thấy xanh**

Run: `pnpm exec vitest run test/admin-stats.test.ts && pnpm exec tsc --noEmit`
Expected: mọi test PASS; `tsc` không lỗi.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # main
git add server/src/admin-stats.ts server/src/admin.ts server/test/admin-stats.test.ts
git commit -m "feat(admin): GET /admin/stats với mục Tiền (doanh thu ngày, tháng, theo gói), một db.batch, ghi stats_viewed

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 3: Mục Khách hàng

**Files:**
- Modify: `server/src/admin-stats.ts` (thay hàm tạm `customersSection`)
- Modify: `server/test/admin-stats.test.ts` (helper seed license, activation, trial; test)

- [ ] **Step 1: Viết test (đỏ)**

Trong `server/test/admin-stats.test.ts`, thêm helper ngay sau `const seed = …`:

```ts
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
```

Thêm vào cuối file:

```ts
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
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `pnpm exec vitest run test/admin-stats.test.ts -t "Khách hàng"`
Expected: 3 test FAIL (mục tạm trả toàn 0).

- [ ] **Step 3: Thay `customersSection` bằng bản thật**

Trong `server/src/admin-stats.ts`, xóa hàm `customersSection` tạm (cùng dòng chú thích `// Tạm (Task 3 thay)…`) và thêm:

```ts
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
```

Nếu `zeroTotals` không còn được dùng sau khi xóa hàm tạm thì xóa luôn hàm `zeroTotals` (tránh biến thừa); nếu mục tạm khác còn dùng thì giữ.

- [ ] **Step 4: Chạy, thấy xanh**

Run: `pnpm exec vitest run test/admin-stats.test.ts && pnpm exec tsc --noEmit`
Expected: mọi test PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # main
git add server/src/admin-stats.ts server/test/admin-stats.test.ts
git commit -m "feat(admin): Tổng quan, mục Khách hàng: phễu dùng thử sang trả phí, mua mới/gia hạn/đổi gói

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 4: Mục Sức khỏe

**Files:**
- Modify: `server/src/admin-stats.ts` (thay hàm tạm `healthSection`)
- Modify: `server/test/admin-stats.test.ts`

- [ ] **Step 1: Viết test (đỏ)**

Thêm `ORDER_STATUSES` vào import đầu file test: dòng `import { dayWindow, … } from "../src/admin-stats";` giữ nguyên, thêm dòng:

```ts
import { ORDER_STATUSES } from "../src/admin-read";
```

Thêm vào cuối file test:

```ts
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
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `pnpm exec vitest run test/admin-stats.test.ts -t "Sức khỏe"`
Expected: 3 test FAIL.

- [ ] **Step 3: Thay `healthSection` bằng bản thật**

Trong `admin-stats.ts`, xóa hàm `healthSection` tạm và thêm:

```ts
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
        if (status in orders) orders[status] = num(r.n);
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
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `pnpm exec vitest run test/admin-stats.test.ts && pnpm exec tsc --noEmit`
Expected: mọi test PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # main
git add server/src/admin-stats.ts server/test/admin-stats.test.ts
git commit -m "feat(admin): Tổng quan, mục Sức khỏe: đơn 30 ngày theo trạng thái, license sắp hết hạn, tỷ lệ gửi key

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 5: Mục Sử dụng

**Files:**
- Modify: `server/src/admin-stats.ts` (thay hàm tạm `usageSection`)
- Modify: `server/test/admin-stats.test.ts`

- [ ] **Step 1: Viết test (đỏ)**

Thêm vào cuối `server/test/admin-stats.test.ts`:

```ts
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
    await seed(
      live.stmt,
      expired.stmt,
      revoked.stmt,
      activation(live.id, { lastValidatedAt: NOW }), // tính cả hai
      activation(live.id, { lastValidatedAt: NOW - 7 * D }), // đúng biên 7 ngày: tính vào devices_7d
      activation(live.id, { lastValidatedAt: NOW - 7 * D - 1 }), // quá 7 ngày: chỉ active_devices
      activation(live.id, { deactivatedAt: NOW - D }), // đã gỡ: không tính
      activation(expired.id), // license hết hạn: không tính
      activation(revoked.id), // license đã thu hồi: không tính
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
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `pnpm exec vitest run test/admin-stats.test.ts -t "Sử dụng"`
Expected: 4 test FAIL.

- [ ] **Step 3: Thay `usageSection` bằng bản thật**

Trong `admin-stats.ts`, xóa hàm `usageSection` tạm và thêm:

```ts
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
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `pnpm exec vitest run test/admin-stats.test.ts && pnpm exec tsc --noEmit`
Expected: mọi test PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # main
git add server/src/admin-stats.ts server/test/admin-stats.test.ts
git commit -m "feat(admin): Tổng quan, mục Sử dụng: license và máy đang hoạt động, dùng thử còn hạn, dùng thử mới theo ngày

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 6: Khóa hình dạng, riêng tư, hiển thị nhật ký; bộ kiểm đầy đủ

**Files:**
- Modify: `server/test/admin-stats.test.ts`
- Modify: `server/src/admin-stats.ts` (chỉ khi test lộ lỗi; sửa tối thiểu)

- [ ] **Step 1: Viết test khóa hợp đồng**

Thêm vào cuối `server/test/admin-stats.test.ts`:

```ts
describe("GET /admin/stats: hợp đồng", () => {
  it("cơ sở dữ liệu trống: toàn bộ phản hồi đúng từng trường", async () => {
    const zero = { revenue: 0, orders: 0 };
    expect(await getStats()).toEqual({
      generated_at: NOW,
      currency: "VND",
      money: {
        today: 0,
        last_7d: 0,
        this_month: 0,
        last_month: 0,
        daily: dayWindow(NOW, 30).keys.map((day) => ({ day, revenue: 0, orders: 0 })),
        monthly: monthWindow(NOW, 12).keys.map((month) => ({ month, monthly: zero, yearly: zero })),
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
```

- [ ] **Step 2: Chạy**

Run: `pnpm exec vitest run test/admin-stats.test.ts`
Expected: PASS. Nếu có test đỏ, đọc kỹ lý do: sai lệch thật giữa spec mục 3 và code thì sửa code tối thiểu (không sửa test cho khớp code); sau đó chạy lại.

- [ ] **Step 3: Kiểm một lời gọi `db.batch` duy nhất**

Run: `grep -n "batch(" src/admin-stats.ts`
Expected: đúng một dòng (`await db.batch([...])` trong `computeStats`). Nếu có thêm lời gọi `.first()`, `.all()` hay `.run()` cho số liệu thì sai thiết kế (các con số phải nhất quán): chuyển câu đó vào `statements` của mục tương ứng. (Lời gọi `audit(...)` ở route là ghi nhật ký, không phải số liệu.)

- [ ] **Step 4: Bộ kiểm đầy đủ của server**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: typecheck sạch; mọi test server PASS (số test tăng so với 514).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # main
git add server/test/admin-stats.test.ts server/src/admin-stats.ts
git commit -m "test(admin): khóa hợp đồng GET /admin/stats: hình dạng đầy đủ, không email, stats_viewed ẩn mặc định

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```
