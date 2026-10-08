# Web Admin phần 2 · 02: Giao diện (trang Tổng quan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Trang `/overview` trong `server/admin-ui`: ô số và biểu đồ (Recharts) cho bốn nhóm Tiền, Khách hàng, Sức khỏe, Sử dụng, tải lười, giữ nguyên CSP của phần 1.

**Kiến trúc:** `ChartCard` là lớp mỏng duy nhất biết Recharts. `OverviewPage` gọi `api.stats()` bằng `useLoad`, dựng ô số, danh sách, bảng và bốn `ChartCard`. `App.tsx` nạp `OverviewPage` bằng `React.lazy` nên Recharts nằm trong một file riêng. Công cụ `scripts/csp-check.mjs` (Node thuần) kiểm bản build với đúng CSP production bằng Chrome headless.

**Công nghệ:** React 19.3.0, Vite 8.3.3, TypeScript 7.0.2, Vitest 5.0.3 + jsdom 30 + Testing Library, **Recharts 3.10.1**, **react-is 19.3.0**.

**Spec:** `docs/superpowers/specs/2026-10-08-web-admin-tong-quan-design.md` (mục 4, 5, 6). Hợp đồng và quy ước chung: `2026-10-08-web-admin-tong-quan-00-tong-quan.md`.

---

## Thứ tự thực thi (đã khóa)

Task 1 → 2 → 3 → **4 (cổng kiểm chứng)** → thực thi **toàn bộ** kế hoạch `01-server` → Task 5 → 6 → 7 → 8. Task 4 là cổng: nếu thất bại thì dừng, báo chủ dự án, không làm tiếp.

## Quy ước

- Làm trên `main`, mọi lệnh giao diện chạy từ `server/admin-ui/` (trừ khi ghi khác). Chạy một file test: `pnpm exec vitest run <đường dẫn>`. Kiểm kiểu: `pnpm exec tsc --noEmit`.
- `server/admin-ui/tsconfig.json`: `strict` và `noUncheckedIndexedAccess`; JSX `react-jsx`. Giao diện không dùng style inline, thẻ `<style>` hay script inline (CSP `style-src 'self'; script-src 'self'`). Thuộc tính `style` của React đặt bằng JS thì được phép (CSSOM), nhưng đừng dùng nếu CSS làm được.
- Đọc trước: `src/pages/QueuePage.tsx` (khuôn một trang dùng `useLoad`, `ErrorBox`, `Tile`), `src/hooks.ts`, `src/format.ts`, `src/components/StatusBadge.tsx` (`ORDER_LABELS`, `PLAN_LABELS`), `src/styles.css`.

---

## Task 1: Công cụ kiểm CSP và đo dung lượng (và số đo nền)

**Files:**
- Create: `server/admin-ui/scripts/csp-check.mjs`

- [ ] **Step 1: Đo nền trước khi đổi gì**

Run (từ `server/admin-ui/`): `pnpm build && ls -l dist/assets`
Ghi lại dung lượng file `index-*.js` (hiện khoảng 264 KB) vào ghi chú của nhiệm vụ; sẽ so sánh ở Task 4.

- [ ] **Step 2: Tạo `scripts/csp-check.mjs`**

```js
#!/usr/bin/env node
// Kiểm bản build của Web Admin với đúng CSP của production (spec Web Admin phần 2, mục 5).
// Phục vụ dist/ qua một server Node tạm (kèm API giả cho vài route /admin/*), mở trang bằng Chrome headless rồi:
//  - đọc console của Chrome (stderr): dòng nào nói về Content Security Policy là vi phạm; Uncaught và lỗi tải file cũng là lỗi;
//  - kiểm DOM sau khi vẽ có các chuỗi mong đợi (--expect=...);
//  - in dung lượng (byte, gzip) các file trong dist/assets (--sizes);
//  - chụp màn hình (--shot=đường-dẫn.png).
// Dùng:  pnpm build && node scripts/csp-check.mjs --path=/overview --expect=recharts-surface [--mobile] [--dark] [--sizes] [--shot=x.png]
//        node scripts/csp-check.mjs --probe     (tự kiểm công cụ: trang cố tình vi phạm CSP, phải báo lỗi)
// Thoát mã 0 khi không có vi phạm hay lỗi và mọi --expect đều thấy; mã 1 nếu ngược lại; mã 2 nếu thiếu dist/ hay Chrome.
// Cần Chrome: đường dẫn macOS mặc định hay biến môi trường CHROME_BIN. Không kiểm tooltip (chỉ hiện khi rê chuột).
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = join(ROOT, "dist");
/** Phải khớp EXPECTED_CSP của server/test/admin-assets.test.ts: CSP của Worker admin trên production. */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const CHROME = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const expects = argv.filter((a) => a.startsWith("--expect=")).map((a) => a.slice("--expect=".length));

// Dữ liệu giả cho API (hình dạng khớp hợp đồng thật; số tùy ý).
const DAY = 86400;
const NOW = Math.floor(Date.now() / 1000);
const pad2 = (n) => String(n).padStart(2, "0");
const dayKey = (t) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);
function monthKeys(n) {
  const d = new Date((NOW + 7 * 3600) * 1000);
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (n - 1 - i), 1));
    return `${x.getUTCFullYear()}-${pad2(x.getUTCMonth() + 1)}`;
  });
}
function statsFixture() {
  const days = Array.from({ length: 30 }, (_, i) => dayKey(NOW - (29 - i) * DAY));
  const months = monthKeys(12);
  return {
    generated_at: NOW,
    currency: "VND",
    money: {
      today: 100000,
      last_7d: 850000,
      this_month: 1450000,
      last_month: 2100000,
      daily: days.map((day, i) => ({ day, revenue: ((i * 7) % 5) * 50000, orders: (i * 7) % 5 })),
      monthly: months.map((month, i) => ({
        month,
        monthly: { revenue: (i % 4) * 150000, orders: (i % 4) * 3 },
        yearly: { revenue: (i % 3) * 500000, orders: i % 3 },
      })),
    },
    customers: {
      trials_30d: 12,
      trials_30d_purchased: 3,
      trials_total: 40,
      trials_total_purchased: 7,
      grants_30d: {
        new: { orders: 5, revenue: 450000 },
        extend: { orders: 2, revenue: 100000 },
        change: { orders: 1, revenue: 500000 },
        other: { orders: 0, revenue: 0 },
      },
      grants_monthly: months.map((month, i) => ({ month, new: i % 4, extend: i % 3, change: i % 2, other: 0 })),
    },
    health: {
      orders_30d: { pending: 2, processing: 0, paid: 8, underpaid: 1, cancelled: 3, expired: 5, failed: 1, paid_needs_review: 0, refunded: 0 },
      expiring_7d: 2,
      expiring_30d: 5,
      email: { paid_with_email_30d: 8, sent: 8 },
    },
    usage: {
      active_licenses: 9,
      active_devices: 11,
      devices_7d: 8,
      trials_active: 4,
      new_trials_daily: days.map((day, i) => ({ day, count: (i * 3) % 4 })),
    },
  };
}
const EMPTY = { count: 0, items: [] };
const API = {
  "/admin/whoami": () => ({ operator: "ops@aitranslator.io.vn" }),
  "/admin/stats": statsFixture,
  "/admin/summary": () => ({ revenue_today: 0, currency: "VND", paid_orders_7d: 0, active_licenses: 0 }),
  "/admin/queue": () => ({ needs_review: EMPTY, underpaid: EMPTY, email_failed: EMPTY, locked: EMPTY, conflict: EMPTY, alerts: EMPTY }),
  "/admin/orders": () => ({ items: [], next_cursor: null }),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serve(req, res) {
  const url = new URL(req.url ?? "/", "http://x");
  res.setHeader("content-security-policy", CSP);
  res.setHeader("cache-control", "no-store");
  if (flag("probe") && url.pathname === "/") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.end('<!doctype html><meta charset="utf-8"><body><div style="color:red">probe</div>');
  }
  if (url.pathname.startsWith("/admin/")) {
    const make = API[url.pathname];
    res.statusCode = make ? 200 : 404;
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify(make ? make() : { error: "not_found" }));
  }
  let file = normalize(join(DIST, url.pathname));
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) file = join(DIST, "index.html"); // SPA
  res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
}

function runChrome(url, extra) {
  const size = flag("mobile") ? "390,844" : "1280,900";
  const dark = flag("dark") ? ["--blink-settings=preferredColorScheme=1"] : [];
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--enable-logging=stderr",
    "--v=0",
    "--virtual-time-budget=10000",
    `--window-size=${size}`,
    ...dark,
    ...extra,
    url,
  ];
  return new Promise((done) => {
    const child = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      err += d;
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 90_000); // chỉ tiến trình con của chính công cụ này
    child.on("close", () => {
      clearTimeout(timer);
      done({ out, err });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      done({ out, err: `${err}\nspawn error: ${e.message}` });
    });
  });
}

function printSizes() {
  const dir = join(DIST, "assets");
  if (!existsSync(dir)) return;
  console.log("Dung lượng dist/assets (byte, gzip):");
  for (const f of readdirSync(dir).sort()) {
    const buf = readFileSync(join(dir, f));
    console.log(`  ${f.padEnd(44)} ${String(buf.length).padStart(9)} ${String(gzipSync(buf).length).padStart(9)}`);
  }
}

if (!flag("probe") && !existsSync(join(DIST, "index.html"))) {
  console.error("Chưa có dist/: chạy pnpm build trước.");
  process.exit(2);
}
if (!existsSync(CHROME)) {
  console.error(`Không thấy Chrome ở ${CHROME}; đặt biến CHROME_BIN.`);
  process.exit(2);
}

const server = http.createServer(serve);
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const url = `http://127.0.0.1:${server.address().port}${value("path") ?? "/"}`;
let failed = false;
try {
  const { out, err } = await runChrome(url, ["--dump-dom"]);
  const lines = err.split("\n").filter((l) => l.includes(":CONSOLE"));
  const violations = lines.filter((l) => /Content Security Policy|Refused to/i.test(l));
  const errors = lines.filter((l) => !violations.includes(l) && /Uncaught|TypeError|ReferenceError|Failed to load resource/i.test(l));
  console.log(`Trang: ${url.replace(/:\d+/, ":<cổng>")}  (${flag("mobile") ? "điện thoại" : "máy tính"}${flag("dark") ? ", tối" : ""})`);
  console.log(`Vi phạm CSP: ${violations.length}`);
  for (const l of violations) console.log(`  ${l.slice(0, 300)}`);
  console.log(`Lỗi console: ${errors.length}`);
  for (const l of errors) console.log(`  ${l.slice(0, 300)}`);
  for (const text of expects) {
    const found = out.includes(text);
    console.log(`Mong đợi trong DOM ${JSON.stringify(text)}: ${found ? "có" : "KHÔNG THẤY"}`);
    if (!found) failed = true;
  }
  if (violations.length > 0 || errors.length > 0) failed = true;
  const shot = value("shot");
  if (shot) {
    await runChrome(url, [`--screenshot=${resolve(shot)}`]);
    console.log(`Ảnh chụp: ${existsSync(resolve(shot)) ? resolve(shot) : "KHÔNG TẠO ĐƯỢC"}`);
  }
  if (flag("sizes")) printSizes();
} finally {
  server.close();
}
console.log(failed ? "KẾT QUẢ: KHÔNG ĐẠT" : "KẾT QUẢ: ĐẠT");
process.exitCode = failed ? 1 : 0;
```

- [ ] **Step 3: Tự kiểm công cụ: bản build hiện tại phải đạt**

Run: `node scripts/csp-check.mjs --path=/ --expect="Việc cần xử lý" --sizes`
Expected: `Vi phạm CSP: 0`, `Lỗi console: 0`, `Mong đợi trong DOM "Việc cần xử lý": có`, bảng dung lượng, `KẾT QUẢ: ĐẠT`, mã thoát 0 (`echo $?` in 0).

- [ ] **Step 4: Tự kiểm công cụ biết báo lỗi**

Run: `node scripts/csp-check.mjs --path=/ --expect=CHUOI-KHONG-TON-TAI; echo "exit=$?"`
Expected: dòng `KHÔNG THẤY` và `exit=1`.

Run: `node scripts/csp-check.mjs --probe; echo "exit=$?"`
Expected: `Vi phạm CSP: 1` hay lớn hơn (dòng chứa "violates the following Content Security Policy"), `KẾT QUẢ: KHÔNG ĐẠT`, `exit=1`.

Nếu một trong hai không ra đúng như trên thì công cụ chưa tin được: sửa trước khi đi tiếp (ví dụ định dạng dòng console của Chrome khác, hãy xem `err` thô rồi chỉnh biểu thức).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # main
git add server/admin-ui/scripts/csp-check.mjs
git commit -m "chore(admin-ui): công cụ kiểm CSP và đo dung lượng bản build bằng Chrome headless

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 2: Cài Recharts và viết `ChartCard`

**Files:**
- Modify: `server/admin-ui/package.json`, `server/pnpm-lock.yaml` (do pnpm cập nhật)
- Modify: `server/admin-ui/src/format.ts`, `server/admin-ui/src/format.test.ts` (`fmtCompact`)
- Create: `server/admin-ui/src/components/ChartCard.tsx`
- Create: `server/admin-ui/src/components/ChartCard.test.tsx`
- Modify: `server/admin-ui/src/styles.css` (biến màu biểu đồ và kiểu của `ChartCard`)

- [ ] **Step 1: Cài thư viện, ghim đúng phiên bản**

Run (từ `server/`): `pnpm --filter mt-license-admin-ui add --save-exact recharts@3.10.1 react-is@19.3.0`
Expected: cài thành công, **không có cảnh báo peer dependency** (Recharts 3.10.1 chấp nhận React 19). Mở `server/admin-ui/package.json`: `dependencies` có `"recharts": "3.10.1"` và `"react-is": "19.3.0"` (không dấu `^`). Nếu pnpm báo lỗi hay cảnh báo peer, dừng và báo cáo nguyên văn.

- [ ] **Step 2: Viết test của `fmtCompact` (đỏ)**

Trong `server/admin-ui/src/format.test.ts`, đổi dòng import đầu file thành:

```ts
import { daysLeft, fmtCompact, fmtDate, fmtDateTime, fmtDay, fmtDetail, fmtHm, fmtMonth, fmtVnd, maskKey, shortHash } from "./format";
```

và thêm vào cuối file:

```ts
describe("format cho biểu đồ", () => {
  it("nhãn ngày và tháng, giờ phút GMT+7", () => {
    expect(fmtDay("2026-10-08")).toBe("08/10");
    expect(fmtMonth("2026-10")).toBe("10/2026");
    expect(fmtHm(T0)).toBe("07:00");
    expect(fmtHm(T0 + 61 * 60)).toBe("08:01");
  });

  it("số gọn cho trục biểu đồ: nghìn là k, triệu là tr, dấu phẩy thập phân", () => {
    expect([0, 950, 1000, 1500, 50000, 1_000_000, 1_500_000, 12_000_000].map(fmtCompact)).toEqual([
      "0",
      "950",
      "1k",
      "1,5k",
      "50k",
      "1tr",
      "1,5tr",
      "12tr",
    ]);
  });
});
```

Run: `pnpm exec vitest run src/format.test.ts`
Expected: FAIL (các hàm chưa tồn tại).

- [ ] **Step 3: Thêm hàm vào `format.ts`**

Thêm vào cuối `server/admin-ui/src/format.ts`:

```ts
/** "2026-10-08" thành "08/10" (nhãn trục của biểu đồ theo ngày). */
export function fmtDay(key: string): string {
  const [, mo = "", d = ""] = key.split("-");
  return `${d}/${mo}`;
}

/** "2026-10" thành "10/2026" (nhãn trục của biểu đồ theo tháng). */
export function fmtMonth(key: string): string {
  const [y = "", mo = ""] = key.split("-");
  return `${mo}/${y}`;
}

/** Giờ và phút GMT+7, "HH:mm". */
export function fmtHm(sec: number): string {
  const p = vnParts(sec);
  return `${p.h}:${p.mi}`;
}

/** Số gọn cho trục biểu đồ: 1500 thành "1,5k", 1500000 thành "1,5tr". */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const trim = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}tr`;
  if (abs >= 1_000) return `${trim(n / 1_000)}k`;
  return String(n);
}
```

Run: `pnpm exec vitest run src/format.test.ts`
Expected: PASS.

- [ ] **Step 4: Viết test của `ChartCard` (đỏ)**

Tạo `server/admin-ui/src/components/ChartCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fmtVnd } from "../format";
import { ChartCard } from "./ChartCard";

// Recharts thật cần kích thước và ResizeObserver mà jsdom không có: thay bằng khung thử ghi lại các thuộc tính ChartCard truyền xuống.
// Chất lượng vẽ thật do công cụ scripts/csp-check.mjs (Chrome headless) kiểm.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children?: unknown }) => <div data-testid="container">{children as never}</div>,
  BarChart: ({ children, data }: { children?: unknown; data: unknown[] }) => (
    <div data-testid="bar-chart" data-rows={data.length}>
      {children as never}
    </div>
  ),
  Bar: (p: { dataKey: string; name: string; stackId?: string; fill: string }) => (
    <i data-testid="bar" data-key={p.dataKey} data-name={p.name} data-stack={p.stackId ?? ""} data-fill={p.fill} />
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => <i data-testid="legend" />,
}));

const ONE = [{ key: "revenue", label: "Doanh thu" }];
const ROWS = [
  { label: "01/10", revenue: 50000 },
  { label: "02/10", revenue: 0 },
  { label: "03/10", revenue: 1500000 },
];

describe("ChartCard", () => {
  it("tiêu đề, một cột mỗi chuỗi, không chồng, không chú giải khi chỉ có một chuỗi", () => {
    render(<ChartCard title="Doanh thu 30 ngày" data={ROWS} series={ONE} format={fmtVnd} />);
    expect(screen.getByRole("heading", { name: "Doanh thu 30 ngày" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Doanh thu 30 ngày" })).toBeTruthy();
    expect(screen.getByTestId("bar-chart").getAttribute("data-rows")).toBe("3");
    const bars = screen.getAllByTestId("bar");
    expect(bars).toHaveLength(1);
    expect(bars[0]?.getAttribute("data-key")).toBe("revenue");
    expect(bars[0]?.getAttribute("data-name")).toBe("Doanh thu");
    expect(bars[0]?.getAttribute("data-stack")).toBe("");
    expect(screen.queryByTestId("legend")).toBeNull();
  });

  it("nhiều chuỗi: có chú giải, màu theo thứ tự biến CSS; stacked thì cùng stackId", () => {
    const series = [
      { key: "monthly", label: "Monthly" },
      { key: "yearly", label: "Yearly" },
    ];
    render(<ChartCard title="Theo gói" stacked data={[{ label: "10/2026", monthly: 1, yearly: 2 }]} series={series} />);
    const bars = screen.getAllByTestId("bar");
    expect(bars.map((b) => b.getAttribute("data-fill"))).toEqual(["var(--chart-1)", "var(--chart-2)"]);
    expect(new Set(bars.map((b) => b.getAttribute("data-stack")))).toEqual(new Set(["chong"]));
    expect(screen.getByTestId("legend")).toBeTruthy();
  });

  it("không stacked thì các chuỗi không có stackId", () => {
    const series = [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ];
    render(<ChartCard title="Hai cột" data={[{ label: "x", a: 1, b: 2 }]} series={series} />);
    expect(screen.getAllByTestId("bar").map((b) => b.getAttribute("data-stack"))).toEqual(["", ""]);
  });

  it("bảng số: đủ dòng, đúng tiêu đề cột, số định dạng bằng format; giá trị thiếu thành 0", () => {
    const { container } = render(
      <ChartCard title="T" labelHeader="Ngày" data={[...ROWS, { label: "04/10" }]} series={ONE} format={fmtVnd} />,
    );
    expect(screen.getByText("Xem bảng số")).toBeTruthy();
    const headers = [...container.querySelectorAll("thead th")].map((h) => h.textContent);
    expect(headers).toEqual(["Ngày", "Doanh thu"]);
    const rows = [...container.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(rows).toEqual([
      ["01/10", "50.000 đ"],
      ["02/10", "0 đ"],
      ["03/10", "1.500.000 đ"],
      ["04/10", "0 đ"],
    ]);
  });

  it("mọi giá trị bằng 0: báo chưa có dữ liệu, không vẽ biểu đồ, không có bảng", () => {
    const { container } = render(<ChartCard title="Rỗng" data={[{ label: "01/10", revenue: 0 }]} series={ONE} />);
    expect(screen.getByText("Chưa có dữ liệu trong khoảng này")).toBeTruthy();
    expect(screen.queryByTestId("bar-chart")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });
});
```

Run: `pnpm exec vitest run src/components/ChartCard.test.tsx`
Expected: FAIL (không có `./ChartCard`).

- [ ] **Step 5: Viết `ChartCard.tsx`**

Tạo `server/admin-ui/src/components/ChartCard.tsx`:

```tsx
// Một biểu đồ cột của trang Tổng quan (spec Web Admin phần 2, mục 4 và 5). Bọc Recharts: trang không biết kiểu của Recharts,
// nên đổi sang tự vẽ SVG chỉ phải sửa file này. Mỗi biểu đồ có bảng số đọc được ngay dưới ("Xem bảng số").
// Màu lấy từ biến CSS --chart-N (styles.css, sáng hay tối theo hệ điều hành).
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompact } from "../format";

export interface ChartSeries {
  key: string;
  label: string;
}

/** Một dòng dữ liệu: `label` là nhãn trục X, các khóa còn lại là giá trị của từng chuỗi. */
export interface ChartRow {
  label: string;
  [seriesKey: string]: string | number;
}

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

const valueOf = (row: ChartRow, key: string): number => {
  const v = row[key];
  return typeof v === "number" ? v : 0;
};

export function ChartCard({
  title,
  data,
  series,
  stacked = false,
  format = String,
  labelHeader = "Mốc",
}: {
  title: string;
  data: readonly ChartRow[];
  series: readonly ChartSeries[];
  /** Cột chồng: các chuỗi xếp lên nhau. */
  stacked?: boolean;
  /** Định dạng một giá trị trong bảng số và tooltip (ví dụ fmtVnd). */
  format?: (n: number) => string;
  /** Tiêu đề cột nhãn của bảng số. */
  labelHeader?: string;
}) {
  const empty = data.every((row) => series.every((s) => valueOf(row, s.key) === 0));
  return (
    <section className="chart-card">
      <h3>{title}</h3>
      {empty ? (
        <p className="muted">Chưa có dữ liệu trong khoảng này</p>
      ) : (
        <>
          <div className="chart-box" role="img" aria-label={title}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data as ChartRow[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--line)" interval="preserveStartEnd" />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--line)" tickFormatter={(v) => fmtCompact(Number(v))} width={48} />
                <Tooltip
                  formatter={(v) => format(Number(v))}
                  contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
                />
                {series.length > 1 && <Legend />}
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId={stacked ? "chong" : undefined}
                    fill={COLORS[i % COLORS.length]}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="chart-table">
            <summary>Xem bảng số</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{labelHeader}</th>
                    {series.map((s) => (
                      <th key={s.key}>{s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.label}>
                      <td data-label={labelHeader}>{row.label}</td>
                      {series.map((s) => (
                        <td key={s.key} data-label={s.label}>
                          {format(valueOf(row, s.key))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Thêm màu biểu đồ và kiểu vào `styles.css`**

Trong `server/admin-ui/src/styles.css`:

1. Trong khối `:root { … }` đầu file, ngay sau dòng `--muted-bg: #eceff3;` thêm:

```css
  --chart-1: #2f5bd3;
  --chart-2: #d97a1f;
  --chart-3: #1f7a3d;
  --chart-4: #8a5ad3;
```

2. Trong khối `@media (prefers-color-scheme: dark) { :root { … } }`, ngay sau dòng `--muted-bg: #252b36;` thêm:

```css
    --chart-1: #6d8ff0;
    --chart-2: #f0a45a;
    --chart-3: #7fd49a;
    --chart-4: #b79af0;
```

3. Thêm vào cuối phần "Nội dung" (trước dòng `/* Hộp xác nhận */`):

```css
/* Biểu đồ (trang Tổng quan) */
.chart-card, .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 2px 14px 12px; min-width: 0; }
.chart-card h3, .panel h3 { font-size: 14px; margin: 12px 0 8px; }
.chart-box { width: 100%; }
.chart-table { margin-top: 8px; }
.chart-table summary { cursor: pointer; color: var(--accent); }
.chart-table .table-wrap { max-height: 260px; overflow: auto; margin-top: 6px; }
```

- [ ] **Step 7: Chạy test và kiểm kiểu**

Run: `pnpm exec vitest run src/components/ChartCard.test.tsx src/format.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; `tsc` không lỗi. (Nếu `tsc` kêu kiểu của `Tooltip`/`formatter`/`tickFormatter` của Recharts, chỉnh tham số cho khớp chữ ký của Recharts 3.10.1 mà không đổi hành vi.)

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # main
git add server/admin-ui/package.json server/pnpm-lock.yaml server/admin-ui/src/format.ts server/admin-ui/src/format.test.ts server/admin-ui/src/components/ChartCard.tsx server/admin-ui/src/components/ChartCard.test.tsx server/admin-ui/src/styles.css
git commit -m "feat(admin-ui): ChartCard bọc Recharts 3.10.1 (cột, cột chồng, bảng số), hàm định dạng cho biểu đồ

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 3: Khung trang: route `overview`, thanh bên, tải lười

**Files:**
- Modify: `server/admin-ui/src/router.tsx`, `server/admin-ui/src/router.test.tsx`
- Modify: `server/admin-ui/src/components/Sidebar.tsx`
- Modify: `server/admin-ui/src/App.tsx`, `server/admin-ui/src/App.test.tsx`
- Create: `server/admin-ui/src/pages/OverviewPage.tsx` (bản khung; Task 6 thay)
- Modify: `server/admin-ui/src/styles.css` (bỏ kiểu mục "sắp có")

- [ ] **Step 1: Viết test (đỏ)**

Trong `server/admin-ui/src/router.test.tsx`, trong bảng `it.each([...])` của `matchRoute`, ngay sau dòng `["/tools", { name: "tools" }],` thêm:

```ts
    ["/overview", { name: "overview" }],
    ["/overview/", { name: "overview" }],
    ["/overview/x", { name: "not_found" }],
```

Trong `server/admin-ui/src/App.test.tsx`:

1. Thêm ngay dưới các `import` (trước `const empty`):

```tsx
// Recharts thật không chạy trong jsdom; trang Tổng quan chỉ cần ChartCard giả để kiểm khung.
vi.mock("./components/ChartCard", () => ({ ChartCard: ({ title }: { title: string }) => <div>{title}</div> }));
```

2. Trong test đầu tiên (`mở đầu ở Việc cần xử lý…`), **xóa** dòng:

```tsx
    expect(screen.getByText("Tổng quan").closest("[aria-disabled]")?.getAttribute("aria-disabled")).toBe("true");
```

3. Thêm test mới trong `describe("App", …)`:

```tsx
  it("mục Tổng quan bấm được: đổi sang /overview, nạp trang tải lười và đánh dấu mục đang chọn", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Việc cần xử lý" });
    const link = screen.getByRole("link", { name: "Tổng quan" });
    expect(link.getAttribute("href")).toBe("/overview");
    expect(screen.queryByText("sắp có")).toBeNull();
    await user.click(link);
    expect(window.location.pathname).toBe("/overview");
    expect(await screen.findByRole("heading", { name: "Tổng quan" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tổng quan" }).className).toContain("active");
  });
```

Run: `pnpm exec vitest run src/router.test.tsx src/App.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Router**

Trong `server/admin-ui/src/router.tsx`: thêm `| "overview"` vào `RouteName` (sau `| "queue"`), và thêm dòng vào `ROUTES` ngay sau `["queue", /^\/$/],`:

```ts
  ["overview", /^\/overview$/],
```

- [ ] **Step 3: Thanh bên**

Thay toàn bộ nội dung `server/admin-ui/src/components/Sidebar.tsx` bằng:

```tsx
import { Link, type RouteName } from "../router";

const NAV: { to: string; label: string; routes: RouteName[] }[] = [
  { to: "/", label: "Việc cần xử lý", routes: ["queue"] },
  { to: "/overview", label: "Tổng quan", routes: ["overview"] },
  { to: "/orders", label: "Đơn hàng", routes: ["orders", "order"] },
  { to: "/licenses", label: "License", routes: ["licenses", "license"] },
  { to: "/trials", label: "Máy & dùng thử", routes: ["trials", "device"] },
  { to: "/audit", label: "Nhật ký", routes: ["audit"] },
  { to: "/tools", label: "Công cụ", routes: ["tools"] },
];

export function Sidebar({ current, open }: { current: RouteName; open: boolean }) {
  return (
    <nav className={`sidebar${open ? " open" : ""}`} aria-label="Điều hướng">
      {NAV.map((n) => (
        <Link key={n.to} to={n.to} className={`nav-item${n.routes.includes(current) ? " active" : ""}`}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Trang khung và App tải lười**

Tạo `server/admin-ui/src/pages/OverviewPage.tsx` (bản khung, Task 6 thay bằng trang đầy đủ):

```tsx
// Khung của trang Tổng quan (Task 3); Task 6 thay bằng trang đầy đủ dùng GET /admin/stats.
import { ChartCard } from "../components/ChartCard";

export function OverviewPage() {
  return (
    <>
      <h1>Tổng quan</h1>
      <ChartCard
        title="Biểu đồ mẫu"
        labelHeader="Ngày"
        series={[{ key: "revenue", label: "Doanh thu" }]}
        data={[
          { label: "01/10", revenue: 50000 },
          { label: "02/10", revenue: 100000 },
          { label: "03/10", revenue: 0 },
        ]}
      />
    </>
  );
}
```

Trong `server/admin-ui/src/App.tsx`:

1. Đổi dòng `import { useEffect, useState } from "react";` thành:

```tsx
import { lazy, Suspense, useEffect, useState } from "react";
```

2. Sau khối `import … from "./router";` (dòng cuối của các import) thêm:

```tsx
// Trang Tổng quan kéo theo Recharts: nạp lười để các trang hỗ trợ khách không nặng thêm (spec Tổng quan, mục 4).
const OverviewPage = lazy(() => import("./pages/OverviewPage").then((m) => ({ default: m.OverviewPage })));
```

3. Trong `switch (route.name)` của `Page`, ngay sau `case "queue": return <QueuePage />;` thêm:

```tsx
    case "overview":
      return (
        <Suspense fallback={<p className="muted">Đang tải…</p>}>
          <OverviewPage />
        </Suspense>
      );
```

- [ ] **Step 5: Bỏ kiểu mục "sắp có" khỏi CSS**

Trong `server/admin-ui/src/styles.css` xóa hai dòng:

```css
.nav-item.disabled { color: var(--muted); cursor: default; }
.nav-item small { font-size: 11px; }
```

- [ ] **Step 6: Chạy test và kiểm kiểu**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: toàn bộ test giao diện PASS (kể cả test cũ của các trang); `tsc` sạch.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # main
git add server/admin-ui/src/router.tsx server/admin-ui/src/router.test.tsx server/admin-ui/src/components/Sidebar.tsx server/admin-ui/src/App.tsx server/admin-ui/src/App.test.tsx server/admin-ui/src/pages/OverviewPage.tsx server/admin-ui/src/styles.css
git commit -m "feat(admin-ui): route /overview, mục Tổng quan bấm được, trang nạp lười (khung)

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 4: Cổng kiểm chứng Recharts với CSP và dung lượng

Đây là **cổng**. Không sửa code ở nhiệm vụ này trừ khi ghi rõ; kết quả quyết định có làm tiếp không.

**Files:** không sửa file nguồn (chỉ chạy công cụ và ghi kết quả). Kết quả ghi vào commit message của nhiệm vụ này (commit rỗng được phép: `git commit --allow-empty`).

- [ ] **Step 1: Build và kiểm trang Tổng quan ở khổ máy tính**

Run (từ `server/admin-ui/`):

```bash
SHOT_DIR=$(mktemp -d)
pnpm build
node scripts/csp-check.mjs --path=/overview --expect=recharts-surface --expect="Tổng quan" --sizes --shot="$SHOT_DIR/overview-light.png"
echo "exit=$?"
```

Expected: `Vi phạm CSP: 0`, `Lỗi console: 0`, `Mong đợi trong DOM "recharts-surface": có` (chứng tỏ biểu đồ **đã vẽ**, không chỉ là không có vi phạm vì không vẽ gì), `KẾT QUẢ: ĐẠT`, `exit=0`.

- [ ] **Step 2: Xem ảnh chụp**

Dùng công cụ đọc ảnh (Read) mở `$SHOT_DIR/overview-light.png`. Phải thấy: tiêu đề "Tổng quan", một biểu đồ cột có trục, ba nhãn ngày, hai cột có màu xanh, và dòng "Xem bảng số". Nếu cột không có màu (đen hay trong suốt) thì màu `var(--chart-1)` trong thuộc tính SVG không hoạt động: báo cáo, đừng tự đổi thiết kế (cách sửa dự phòng: truyền màu bằng `className` và đặt `fill: var(--chart-N)` trong CSS; hỏi lại trước khi làm).

- [ ] **Step 3: Kiểm khổ điện thoại và giao diện tối**

```bash
node scripts/csp-check.mjs --path=/overview --expect=recharts-surface --mobile --shot="$SHOT_DIR/overview-mobile.png"
node scripts/csp-check.mjs --path=/overview --expect=recharts-surface --dark --shot="$SHOT_DIR/overview-dark.png"
```

Expected: cả hai `KẾT QUẢ: ĐẠT`. Xem hai ảnh: khổ điện thoại không tràn ngang; giao diện tối có nền tối và chữ trục đọc được.

- [ ] **Step 4: Kiểm dung lượng và tách file**

```bash
grep -l "recharts" dist/assets/*.js
grep -c "recharts-surface" dist/assets/index-*.js
```

Expected: lệnh đầu in đúng **một** file, tên dạng `OverviewPage-<băm>.js` (Recharts nằm trong file tải lười); lệnh hai in `0` cho file `index-*.js` (gói chính không chứa Recharts).

Từ bảng dung lượng của Step 1, ghi lại: (a) gzip của `OverviewPage-*.js`, (b) gzip và byte của `index-*.js` so với số đo nền ở Task 1 Step 1.

**Tiêu chí qua cổng (cả bốn):**
1. 0 vi phạm CSP và 0 lỗi console ở cả ba lần chạy;
2. `recharts-surface` có trong DOM;
3. gzip của `OverviewPage-*.js` không quá **250 KB (256000 byte)**;
4. `index-*.js` không chứa Recharts và byte tăng không quá 10 KB so với số đo nền.

- [ ] **Step 5: Quyết định**

- **Qua cả bốn tiêu chí:** commit kết quả và làm tiếp.
- **Vi phạm CSP hay lỗi console do Recharts:** dừng. Báo cáo nguyên văn các dòng vi phạm. Không nới CSP (quyết định bảo mật đã duyệt). Phương án đã duyệt trong spec mục 5: tự vẽ SVG bằng cách đổi bên trong `ChartCard.tsx` (cùng giao diện props, cùng test); báo chủ dự án trước khi làm.
- **Quá 250 KB gzip:** dừng và hỏi chủ dự án (spec mục 5).

- [ ] **Step 6: Commit kết quả**

```bash
git branch --show-current   # main
git commit --allow-empty -m "chore(admin-ui): cổng kiểm chứng Recharts + CSP đạt

Chrome headless với CSP production: 0 vi phạm, 0 lỗi console, recharts-surface có trong DOM (máy tính, điện thoại, tối).
OverviewPage-*.js: <điền gzip> byte gzip (ngưỡng 256000); index-*.js: <điền byte> (nền <điền byte>), không chứa Recharts.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

(Điền các con số thật vào dấu `<điền …>` trước khi commit; không để nguyên.)

---

> **Dừng ở đây và thực thi kế hoạch `2026-10-08-web-admin-tong-quan-01-server.md` (cả sáu nhiệm vụ).** Quay lại Task 5 khi `GET /admin/stats` đã xong và đã commit.

---

## Task 5: Kiểu `Stats` và hàm `api.stats()`

**Files:**
- Modify: `server/admin-ui/src/api/types.ts`
- Modify: `server/admin-ui/src/api/endpoints.ts`, `server/admin-ui/src/api/endpoints.test.ts`

- [ ] **Step 1: Viết test (đỏ)**

Trong `server/admin-ui/src/api/endpoints.test.ts`:

1. Trong mảng `CASES`, ngay sau dòng `{ fn: "summary", … url: "/admin/summary" },` thêm:

```ts
  { fn: "stats", run: () => api.stats(), method: "GET", url: "/admin/stats" },
```

2. Đổi `expect(Object.keys(api)).toHaveLength(21);` thành `toHaveLength(22)`.

Run: `pnpm exec vitest run src/api/endpoints.test.ts`
Expected: FAIL (`api.stats` chưa có).

- [ ] **Step 2: Thêm kiểu**

Thêm vào cuối `server/admin-ui/src/api/types.ts`:

```ts
/** GET /admin/stats (server/src/admin-stats.ts): chỉ có số; mảng tăng dần; ngày YYYY-MM-DD, tháng YYYY-MM theo GMT+7. */
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
```

- [ ] **Step 3: Thêm hàm API**

Trong `server/admin-ui/src/api/endpoints.ts`: thêm `Stats,` vào danh sách `import type { … } from "./types"` (giữ thứ tự chữ cái, ngay trước `Summary,`), và thêm vào object `api`, ngay sau dòng `summary: …`:

```ts
  stats: () => call<Stats>("GET", "/admin/stats"),
```

- [ ] **Step 4: Chạy**

Run: `pnpm exec vitest run src/api/endpoints.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; `tsc` sạch.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # main
git add server/admin-ui/src/api/types.ts server/admin-ui/src/api/endpoints.ts server/admin-ui/src/api/endpoints.test.ts
git commit -m "feat(admin-ui): kiểu Stats và api.stats() cho GET /admin/stats

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 6: Trang Tổng quan đầy đủ

**Files:**
- Modify: `server/admin-ui/src/pages/OverviewPage.tsx` (thay bản khung)
- Create: `server/admin-ui/src/pages/OverviewPage.test.tsx`
- Modify: `server/admin-ui/src/styles.css`

- [ ] **Step 1: Viết test (đỏ)**

Tạo `server/admin-ui/src/pages/OverviewPage.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Stats } from "../api/types";
import { OverviewPage } from "./OverviewPage";

// Recharts thật không chạy trong jsdom: ChartCard giả ghi lại dữ liệu và cấu hình mà trang truyền xuống.
vi.mock("../components/ChartCard", () => ({
  ChartCard: (p: { title: string; data: { label: string }[]; series: { label: string }[]; stacked?: boolean }) => (
    <div
      data-testid="chart"
      data-title={p.title}
      data-rows={p.data.length}
      data-first={p.data[0]?.label}
      data-stacked={String(p.stacked === true)}
      data-series={p.series.map((s) => s.label).join("|")}
    />
  ),
}));

/** 2026-10-01T00:00:00Z = 07:00 ngày 01/10/2026 GMT+7. */
const T0 = 1_790_812_800;
const pad = (n: number) => String(n).padStart(2, "0");
const DAYS = [...Array.from({ length: 29 }, (_, i) => `2026-09-${pad(i + 2)}`), "2026-10-01"];
const MONTHS = ["2025-11", "2025-12", ...Array.from({ length: 10 }, (_, i) => `2026-${pad(i + 1)}`)];

function makeStats(): Stats {
  return {
    generated_at: T0,
    currency: "VND",
    money: {
      today: 550000,
      last_7d: 650000,
      this_month: 550000,
      last_month: 200000,
      daily: DAYS.map((day, i) => ({ day, revenue: i * 1000, orders: i })),
      monthly: MONTHS.map((month) => ({ month, monthly: { revenue: 50000, orders: 1 }, yearly: { revenue: 0, orders: 0 } })),
    },
    customers: {
      trials_30d: 3,
      trials_30d_purchased: 1,
      trials_total: 6,
      trials_total_purchased: 2,
      grants_30d: {
        new: { orders: 2, revenue: 100000 },
        extend: { orders: 1, revenue: 50000 },
        change: { orders: 1, revenue: 500000 },
        other: { orders: 0, revenue: 0 },
      },
      grants_monthly: MONTHS.map((month) => ({ month, new: 1, extend: 0, change: 0, other: 0 })),
    },
    health: {
      orders_30d: { pending: 2, processing: 0, paid: 3, underpaid: 1, cancelled: 0, expired: 2, failed: 2, paid_needs_review: 0, refunded: 1 },
      expiring_7d: 1,
      expiring_30d: 3,
      email: { paid_with_email_30d: 2, sent: 1 },
    },
    usage: {
      active_licenses: 2,
      active_devices: 3,
      devices_7d: 2,
      trials_active: 1,
      new_trials_daily: DAYS.map((day, i) => ({ day, count: i % 3 })),
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function serve(stats: Stats = makeStats()) {
  const fetchMock = vi.fn(async (_url: string) => json(stats));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const tile = (label: string) => screen.getByText(label).closest(".tile") as HTMLElement;

describe("OverviewPage", () => {
  it("năm ô số: tiền theo VND, tháng trước làm chú thích, license và máy", async () => {
    serve();
    render(<OverviewPage />);
    await screen.findByText("Doanh thu hôm nay");
    expect(within(tile("Doanh thu hôm nay")).getByText("550.000 đ")).toBeTruthy();
    expect(within(tile("Doanh thu 7 ngày")).getByText("650.000 đ")).toBeTruthy();
    expect(within(tile("Doanh thu tháng này")).getByText("550.000 đ")).toBeTruthy();
    expect(within(tile("Doanh thu tháng này")).getByText("Tháng trước: 200.000 đ")).toBeTruthy();
    expect(within(tile("License đang hoạt động")).getByText("2")).toBeTruthy();
    expect(within(tile("Máy đang kích hoạt")).getByText("3")).toBeTruthy();
  });

  it("bốn biểu đồ với đúng dữ liệu, kiểu chồng và chuỗi", async () => {
    serve();
    render(<OverviewPage />);
    const charts = await screen.findAllByTestId("chart");
    const info = charts.map((c) => ({
      title: c.getAttribute("data-title"),
      rows: c.getAttribute("data-rows"),
      first: c.getAttribute("data-first"),
      stacked: c.getAttribute("data-stacked"),
      series: c.getAttribute("data-series"),
    }));
    expect(info).toEqual([
      { title: "Doanh thu 30 ngày gần nhất", rows: "30", first: "02/09", stacked: "false", series: "Doanh thu" },
      { title: "Doanh thu 12 tháng, theo gói", rows: "12", first: "11/2025", stacked: "true", series: "Monthly|Yearly" },
      { title: "Mua mới, gia hạn, đổi gói theo tháng", rows: "12", first: "11/2025", stacked: "true", series: "Mua mới|Gia hạn|Đổi gói|Khác" },
      { title: "Máy dùng thử mới mỗi ngày", rows: "30", first: "02/09", stacked: "false", series: "Máy dùng thử mới" },
    ]);
  });

  it("phễu dùng thử: số máy, số đã mua và tỷ lệ; không chia cho 0", async () => {
    serve();
    const { unmount } = render(<OverviewPage />);
    expect(await screen.findByText("30 ngày gần nhất: 3 máy dùng thử, đã mua 1 (33%)")).toBeTruthy();
    expect(screen.getByText("Từ trước đến nay: 6 máy dùng thử, đã mua 2 (33%)")).toBeTruthy();
    unmount();
    const zero = makeStats();
    zero.customers.trials_30d = 0;
    zero.customers.trials_30d_purchased = 0;
    serve(zero);
    render(<OverviewPage />);
    expect(await screen.findByText("30 ngày gần nhất: 0 máy dùng thử, đã mua 0")).toBeTruthy();
  });

  it("bảng mua mới, gia hạn, đổi gói trong 30 ngày: số đơn và doanh thu từng loại", async () => {
    serve();
    render(<OverviewPage />);
    const row = async (kind: string) => (await screen.findByRole("cell", { name: kind })).closest("tr")?.textContent ?? "";
    expect(await row("Mua mới")).toBe("Mua mới2100.000 đ");
    expect(await row("Gia hạn")).toBe("Gia hạn150.000 đ");
    expect(await row("Đổi gói")).toBe("Đổi gói1500.000 đ");
    expect(await row("Khác")).toBe("Khác00 đ");
  });

  it("đơn theo trạng thái: đủ chín nhãn; trạng thái có vấn đề và lớn hơn 0 là liên kết sang danh sách đã lọc", async () => {
    serve();
    render(<OverviewPage />);
    const list = (await screen.findByText("Đơn 30 ngày theo trạng thái")).closest("section") as HTMLElement;
    expect(within(list).getAllByRole("listitem")).toHaveLength(9);
    expect(within(list).getByRole("link", { name: /Chuyển thiếu/ }).getAttribute("href")).toBe("/orders?status=underpaid");
    expect(within(list).getByRole("link", { name: /Lỗi/ }).getAttribute("href")).toBe("/orders?status=failed");
    expect(within(list).queryByRole("link", { name: /Cần xử lý/ })).toBeNull(); // 0 đơn: không phải liên kết
    expect(within(list).queryByRole("link", { name: /Đã trả/ })).toBeNull(); // trạng thái bình thường: không phải liên kết
    expect(within(list).getByText("Đã trả").closest("li")?.textContent).toBe("Đã trả3");
  });

  it("sức khỏe: license sắp hết hạn và tỷ lệ gửi key; không có đơn có email thì báo rõ", async () => {
    serve();
    const { unmount } = render(<OverviewPage />);
    expect(await screen.findByText("Sắp hết hạn trong 7 ngày: 1")).toBeTruthy();
    expect(screen.getByText("Sắp hết hạn trong 30 ngày: 3")).toBeTruthy();
    expect(screen.getByText("Email key đã gửi: 1/2")).toBeTruthy();
    unmount();
    const none = makeStats();
    none.health.email = { paid_with_email_30d: 0, sent: 0 };
    serve(none);
    render(<OverviewPage />);
    expect(await screen.findByText("Chưa có đơn nào có email trong 30 ngày")).toBeTruthy();
  });

  it("sử dụng: máy hoạt động 7 ngày và dùng thử còn hạn", async () => {
    serve();
    render(<OverviewPage />);
    expect(await screen.findByText("Hoạt động trong 7 ngày gần nhất: 2")).toBeTruthy();
    expect(screen.getByText("Dùng thử còn hạn: 1")).toBeTruthy();
  });

  it("giờ cập nhật theo GMT+7; đang tải thì báo; Làm mới gọi lại API", async () => {
    const fetchMock = serve();
    render(<OverviewPage />);
    expect(screen.getByText("Đang tải…")).toBeTruthy();
    expect(await screen.findByText("Cập nhật lúc 07:00")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/admin/stats");
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("lỗi: hiện thông báo kèm nút Thử lại; thử lại được thì hiện số liệu", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (n++ === 0 ? json({ error: "internal" }, 500) : json(makeStats()))),
    );
    render(<OverviewPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Lỗi máy chủ");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Doanh thu hôm nay")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
```

Run: `pnpm exec vitest run src/pages/OverviewPage.test.tsx`
Expected: FAIL (trang khung chưa gọi API, chưa có các thành phần).

- [ ] **Step 2: Viết trang đầy đủ**

Thay toàn bộ nội dung `server/admin-ui/src/pages/OverviewPage.tsx` bằng:

```tsx
// Trang Tổng quan (spec Web Admin phần 2, mục 4): số liệu từ GET /admin/stats, bốn nhóm Tiền, Khách hàng, Sức khỏe, Sử dụng.
import { api } from "../api/endpoints";
import type { GrantKind, OrderStatus, Stats } from "../api/types";
import { ChartCard } from "../components/ChartCard";
import { ErrorBox } from "../components/Feedback";
import { ORDER_LABELS, PLAN_LABELS } from "../components/StatusBadge";
import { fmtDay, fmtHm, fmtMonth, fmtVnd } from "../format";
import { useLoad } from "../hooks";
import { Link } from "../router";

/** Trạng thái đơn cần người xem khi số lớn hơn 0: nổi bật và dẫn tới danh sách đã lọc. */
const PROBLEM_STATUSES: readonly OrderStatus[] = ["underpaid", "failed", "paid_needs_review"];

const GRANT_LABELS: Record<GrantKind, string> = { new: "Mua mới", extend: "Gia hạn", change: "Đổi gói", other: "Khác" };
const GRANT_KINDS = Object.keys(GRANT_LABELS) as GrantKind[];
const STATUSES = Object.keys(ORDER_LABELS) as OrderStatus[];

/** " (33%)" khi `total` lớn hơn 0, chuỗi rỗng nếu không (tránh chia cho 0). */
const rate = (part: number, total: number) => (total > 0 ? ` (${Math.round((part * 100) / total)}%)` : "");

export function OverviewPage() {
  const stats = useLoad(() => api.stats(), []);
  return (
    <>
      <h1>Tổng quan</h1>
      <div className="overview-bar">
        <button type="button" onClick={stats.reload} disabled={stats.loading}>
          Làm mới
        </button>
        {stats.data && <span className="muted">Cập nhật lúc {fmtHm(stats.data.generated_at)}</span>}
      </div>
      {stats.error && <ErrorBox error={stats.error} onRetry={stats.reload} />}
      {stats.loading && !stats.data && <p className="muted">Đang tải…</p>}
      {stats.data && <Content s={stats.data} />}
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <strong className="tile-value">{value}</strong>
      {note && <span className="tile-note">{note}</span>}
    </div>
  );
}

function Content({ s }: { s: Stats }) {
  const { money, customers, health, usage } = s;
  return (
    <>
      <div className="tiles">
        <Tile label="Doanh thu hôm nay" value={fmtVnd(money.today)} />
        <Tile label="Doanh thu 7 ngày" value={fmtVnd(money.last_7d)} />
        <Tile label="Doanh thu tháng này" value={fmtVnd(money.this_month)} note={`Tháng trước: ${fmtVnd(money.last_month)}`} />
        <Tile label="License đang hoạt động" value={String(usage.active_licenses)} />
        <Tile label="Máy đang kích hoạt" value={String(usage.active_devices)} />
      </div>

      <h2 className="group-title">Tiền</h2>
      <div className="chart-grid">
        <ChartCard
          title="Doanh thu 30 ngày gần nhất"
          labelHeader="Ngày"
          format={fmtVnd}
          series={[{ key: "revenue", label: "Doanh thu" }]}
          data={money.daily.map((d) => ({ label: fmtDay(d.day), revenue: d.revenue }))}
        />
        <ChartCard
          title="Doanh thu 12 tháng, theo gói"
          labelHeader="Tháng"
          stacked
          format={fmtVnd}
          series={[
            { key: "monthly", label: PLAN_LABELS.monthly },
            { key: "yearly", label: PLAN_LABELS.yearly },
          ]}
          data={money.monthly.map((m) => ({ label: fmtMonth(m.month), monthly: m.monthly.revenue, yearly: m.yearly.revenue }))}
        />
      </div>

      <h2 className="group-title">Khách hàng</h2>
      <div className="chart-grid">
        <section className="panel">
          <h3>Dùng thử sang trả phí</h3>
          <ul className="plain">
            <li>{`30 ngày gần nhất: ${customers.trials_30d} máy dùng thử, đã mua ${customers.trials_30d_purchased}${rate(customers.trials_30d_purchased, customers.trials_30d)}`}</li>
            <li>{`Từ trước đến nay: ${customers.trials_total} máy dùng thử, đã mua ${customers.trials_total_purchased}${rate(customers.trials_total_purchased, customers.trials_total)}`}</li>
          </ul>
          <h3>Đơn đã trả trong 30 ngày</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Loại</th>
                  <th>Số đơn</th>
                  <th>Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {GRANT_KINDS.map((k) => (
                  <tr key={k}>
                    <td data-label="Loại">{GRANT_LABELS[k]}</td>
                    <td data-label="Số đơn">{customers.grants_30d[k].orders}</td>
                    <td data-label="Doanh thu">{fmtVnd(customers.grants_30d[k].revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <ChartCard
          title="Mua mới, gia hạn, đổi gói theo tháng"
          labelHeader="Tháng"
          stacked
          series={GRANT_KINDS.map((k) => ({ key: k, label: GRANT_LABELS[k] }))}
          data={customers.grants_monthly.map((m) => ({ label: fmtMonth(m.month), new: m.new, extend: m.extend, change: m.change, other: m.other }))}
        />
      </div>

      <h2 className="group-title">Sức khỏe</h2>
      <div className="chart-grid">
        <section className="panel">
          <h3>Đơn 30 ngày theo trạng thái</h3>
          <ul className="status-list">
            {STATUSES.map((st) => {
              const n = health.orders_30d[st];
              const body = (
                <>
                  <span>{ORDER_LABELS[st]}</span>
                  <strong>{n}</strong>
                </>
              );
              return (
                <li key={st}>
                  {PROBLEM_STATUSES.includes(st) && n > 0 ? (
                    <Link to={`/orders?status=${st}`} className="attention">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="panel">
          <h3>Cần chú ý</h3>
          <ul className="plain">
            <li>{`Sắp hết hạn trong 7 ngày: ${health.expiring_7d}`}</li>
            <li>{`Sắp hết hạn trong 30 ngày: ${health.expiring_30d}`}</li>
            <li>
              {health.email.paid_with_email_30d > 0
                ? `Email key đã gửi: ${health.email.sent}/${health.email.paid_with_email_30d}`
                : "Chưa có đơn nào có email trong 30 ngày"}
            </li>
          </ul>
        </section>
      </div>

      <h2 className="group-title">Sử dụng</h2>
      <div className="chart-grid">
        <section className="panel">
          <h3>Máy</h3>
          <ul className="plain">
            <li>{`Đang kích hoạt: ${usage.active_devices}`}</li>
            <li>{`Hoạt động trong 7 ngày gần nhất: ${usage.devices_7d}`}</li>
            <li>{`Dùng thử còn hạn: ${usage.trials_active}`}</li>
          </ul>
        </section>
        <ChartCard
          title="Máy dùng thử mới mỗi ngày"
          labelHeader="Ngày"
          series={[{ key: "count", label: "Máy dùng thử mới" }]}
          data={usage.new_trials_daily.map((d) => ({ label: fmtDay(d.day), count: d.count }))}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Thêm kiểu trang vào `styles.css`**

Thêm vào cuối phần "Nội dung" (ngay sau khối `/* Biểu đồ (trang Tổng quan) */` của Task 2):

```css
.overview-bar { display: flex; gap: 12px; align-items: center; margin: -4px 0 12px; }
.tile-note { color: var(--muted); font-size: 12px; }
.group-title { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin: 22px 0 8px; }
.chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; }
ul.plain { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.status-list { list-style: none; margin: 0; padding: 0; }
.status-list li { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid var(--line); }
.status-list li:last-child { border-bottom: none; }
.status-list a.attention { color: var(--bad); font-weight: 600; display: flex; justify-content: space-between; width: 100%; text-decoration: none; }
```

và trong khối `@media (max-width: 800px) { … }` thêm hai dòng:

```css
  .tiles { grid-template-columns: repeat(2, 1fr); }
  .chart-grid { grid-template-columns: 1fr; }
```

- [ ] **Step 4: Chạy**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: toàn bộ test giao diện PASS (trang mới và mọi trang cũ); `tsc` sạch. Nếu test "bảng mua mới…" đỏ vì `textContent` ghép ô khác với chuỗi mong đợi, đối chiếu thứ tự ô (Loại, Số đơn, Doanh thu) rồi sửa test cho khớp thiết kế, không sửa thiết kế cho khớp test.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # main
git add server/admin-ui/src/pages/OverviewPage.tsx server/admin-ui/src/pages/OverviewPage.test.tsx server/admin-ui/src/styles.css
git commit -m "feat(admin-ui): trang Tổng quan đầy đủ: ô số, bốn nhóm, biểu đồ, danh sách trạng thái, làm mới, lỗi và thử lại

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 7: Trang Đơn hàng đọc `?status=`

Trang Đơn hàng hiện khởi tạo bộ lọc trạng thái rỗng. Liên kết từ Tổng quan (`/orders?status=underpaid`) cần trang này đọc tham số đó. Chỉ nhận giá trị nằm trong danh sách trạng thái; giá trị lạ bị bỏ. (`status` không phải dữ liệu cá nhân, khác với từ khóa tra cứu vốn không bao giờ đưa vào URL.)

**Files:**
- Modify: `server/admin-ui/src/pages/OrdersPage.tsx`
- Modify: `server/admin-ui/src/pages/OrdersPage.test.tsx`

- [ ] **Step 1: Viết test (đỏ)**

Thêm vào cuối `server/admin-ui/src/pages/OrdersPage.test.tsx`:

```tsx
describe("OrdersPage: bộ lọc trạng thái từ URL", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("?status=underpaid: lần gọi đầu đã lọc và ô chọn hiện đúng trạng thái", async () => {
    window.history.replaceState(null, "", "/orders?status=underpaid");
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    expect(urls).toEqual(["/admin/orders?status=underpaid"]);
    expect((screen.getByLabelText("Trạng thái") as HTMLSelectElement).value).toBe("underpaid");
  });

  it("giá trị lạ hay rỗng thì bỏ qua, không lọc", async () => {
    for (const q of ["?status=khong-co", "?status=", "?plan=yearly", "?status=constructor", "?status=__proto__"]) {
      urls.length = 0;
      window.history.replaceState(null, "", `/orders${q}`);
      const { unmount } = render(<OrdersPage />);
      await screen.findByText("Không có đơn nào");
      expect(urls, q).toEqual(["/admin/orders"]);
      unmount();
    }
  });
});
```

Run: `pnpm exec vitest run src/pages/OrdersPage.test.tsx`
Expected: test đầu FAIL (URL gọi là `/admin/orders`); test hai PASS (trang hiện chưa đọc URL nên chưa lọc gì).

- [ ] **Step 2: Sửa trang**

Trong `server/admin-ui/src/pages/OrdersPage.tsx`, ngay sau dòng `export const PLAN_OPTIONS = …` thêm:

```tsx
/** Trạng thái lọc ban đầu từ `?status=` (liên kết từ trang Tổng quan); giá trị ngoài danh sách thì bỏ. */
function initialStatus(): string {
  const v = new URLSearchParams(window.location.search).get("status") ?? "";
  return Object.hasOwn(ORDER_LABELS, v) ? v : "";
}
```

và đổi dòng `const [f, setF] = useState({ status: "", plan: "", from: "", to: "" });` thành:

```tsx
  const [f, setF] = useState(() => ({ status: initialStatus(), plan: "", from: "", to: "" }));
```

- [ ] **Step 3: Chạy**

Run: `pnpm exec vitest run src/pages/OrdersPage.test.tsx && pnpm exec tsc --noEmit`
Expected: PASS; `tsc` sạch. (`Object.hasOwn` chứ không phải `in`: `in` chấp nhận cả thuộc tính kế thừa như `constructor`.)

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # main
git add server/admin-ui/src/pages/OrdersPage.tsx server/admin-ui/src/pages/OrdersPage.test.tsx
git commit -m "feat(admin-ui): trang Đơn hàng đọc ?status= làm bộ lọc ban đầu (liên kết từ Tổng quan)

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 8: API giả cho dev server và kiểm cuối giao diện

**Files:**
- Modify: `server/admin-ui/dev/fake-api.ts`

- [ ] **Step 1: Thêm `/admin/stats` vào API giả**

Trong `server/admin-ui/dev/fake-api.ts`:

1. Thêm `Stats,` vào danh sách `import type { … } from "../src/api/types.ts"` (sau `QueueGroup,`, trước `Summary,`).

2. Thêm ngay sau khai báo `const trial: TrialRow = …` (hay bất cứ chỗ nào trước `interface Reply`):

```ts
function dayKey(t: number): string {
  return new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);
}

/** Số liệu mẫu cho trang Tổng quan: 30 ngày, 12 tháng, giá trị tùy ý nhưng đủ để thấy mọi biểu đồ. */
const stats: Stats = (() => {
  const days = Array.from({ length: 30 }, (_, i) => dayKey(NOW - (29 - i) * DAY));
  const d0 = new Date((NOW + 7 * 3600) * 1000);
  const months = Array.from({ length: 12 }, (_, i) => {
    const x = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - (11 - i), 1));
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  return {
    generated_at: NOW,
    currency: "VND",
    money: {
      today: 100000,
      last_7d: 850000,
      this_month: 1450000,
      last_month: 2100000,
      daily: days.map((day, i) => ({ day, revenue: ((i * 7) % 5) * 50000, orders: (i * 7) % 5 })),
      monthly: months.map((month, i) => ({
        month,
        monthly: { revenue: (i % 4) * 150000, orders: (i % 4) * 3 },
        yearly: { revenue: (i % 3) * 500000, orders: i % 3 },
      })),
    },
    customers: {
      trials_30d: 12,
      trials_30d_purchased: 3,
      trials_total: 40,
      trials_total_purchased: 7,
      grants_30d: {
        new: { orders: 5, revenue: 450000 },
        extend: { orders: 2, revenue: 100000 },
        change: { orders: 1, revenue: 500000 },
        other: { orders: 0, revenue: 0 },
      },
      grants_monthly: months.map((month, i) => ({ month, new: i % 4, extend: i % 3, change: i % 2, other: 0 })),
    },
    health: {
      orders_30d: { pending: 2, processing: 0, paid: 8, underpaid: 1, cancelled: 3, expired: 5, failed: 1, paid_needs_review: 0, refunded: 0 },
      expiring_7d: 2,
      expiring_30d: 5,
      email: { paid_with_email_30d: 8, sent: 8 },
    },
    usage: {
      active_licenses: 9,
      active_devices: 11,
      devices_7d: 8,
      trials_active: 4,
      new_trials_daily: days.map((day, i) => ({ day, count: (i * 3) % 4 })),
    },
  };
})();
```

3. Trong `switch (path)` của `respond`, ngay sau `case "/admin/summary": return ok(summary);` thêm:

```ts
    case "/admin/stats":
      return ok(stats);
```

- [ ] **Step 2: Kiểm kiểu và test**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: sạch và PASS.

(Tùy chọn, nếu muốn xem tận mắt: `pnpm dev` rồi mở `http://127.0.0.1:5180/overview`. Dừng bằng Ctrl+C của chính lệnh đó; đừng `pkill`.)

- [ ] **Step 3: Build và kiểm CSP trang đầy đủ ở ba khổ**

```bash
SHOT_DIR=$(mktemp -d)
pnpm build
node scripts/csp-check.mjs --path=/overview --expect=recharts-surface --expect="Doanh thu 30 ngày gần nhất" --expect="Máy dùng thử mới mỗi ngày" --expect="Xem bảng số" --sizes --shot="$SHOT_DIR/full-light.png"
node scripts/csp-check.mjs --path=/overview --expect=recharts-surface --mobile --shot="$SHOT_DIR/full-mobile.png"
node scripts/csp-check.mjs --path=/overview --expect=recharts-surface --dark --shot="$SHOT_DIR/full-dark.png"
node scripts/csp-check.mjs --path=/ --expect="Việc cần xử lý"
```

Expected: cả bốn `KẾT QUẢ: ĐẠT` (0 vi phạm CSP, 0 lỗi console). Xem ba ảnh bằng công cụ đọc ảnh: máy tính thấy ô số, bốn nhóm, bốn biểu đồ, danh sách trạng thái; điện thoại không tràn ngang, ô số hai cột, biểu đồ xếp dọc; tối đọc được. Ghi lại gzip của `OverviewPage-*.js` (phải ≤ 256000 byte) và byte của `index-*.js`.

- [ ] **Step 4: Bộ kiểm đầy đủ**

Run (từ `server/`): `pnpm check`
Expected: exit 0 (typecheck, test server gồm `admin-stats`, test giao diện, build, `dry-run`).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # main
git add server/admin-ui/dev/fake-api.ts
git commit -m "chore(admin-ui): API giả của dev server có /admin/stats; kiểm CSP trang Tổng quan đầy đủ đạt

Chrome headless với CSP production, ba khổ (máy tính, điện thoại, tối): 0 vi phạm, 0 lỗi console.
OverviewPage-*.js: <điền gzip> byte gzip; index-*.js: <điền byte>.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

(Điền con số thật trước khi commit.)
