#!/usr/bin/env node
// Kiểm bản build của Web Admin với đúng CSP của production (spec Web Admin phần 2, mục 5).
// Phục vụ dist/ qua một server Node tạm (kèm API giả cho vài route /admin/*), mở trang bằng Chrome headless rồi:
//  - đọc console của Chrome (stderr): dòng nào nói về Content Security Policy là vi phạm; Uncaught và lỗi tải file cũng là lỗi;
//  - kiểm DOM sau khi vẽ có các chuỗi mong đợi (--expect=...);
//  - in dung lượng (byte, gzip) các file trong dist/assets (--sizes);
//  - chụp màn hình (--shot=đường-dẫn.png).
// Dùng:  pnpm build && node scripts/csp-check.mjs --path=/overview --expect=recharts-surface [--mobile] [--dark|--light] [--height=N] [--sizes] [--shot=x.png]
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
const alertsFixture = () => ({
  items: [
    { kind: "webhook_bad_signature", window_start: NOW - 1800, count: 3, notified_count: 0, notified_at: null },
    { kind: "reconcile_failed", window_start: NOW - 7200, count: 2, notified_count: 2, notified_at: NOW - 3600 },
  ],
  total: 2,
  pending: 1,
});
const releasesFixture = () => ({
  base_url: "https://releases.example.com",
  channels: {
    stable: {
      status: "ok",
      version: "0.4.2",
      pub_date: new Date((NOW - 3 * DAY) * 1000).toISOString(),
      notes: "Sửa lỗi thanh phụ đề trên macOS.",
      platforms: ["darwin-aarch64", "windows-x86_64"],
    },
    beta: { status: "missing" },
  },
  models: {
    status: "ok",
    sequence: 7,
    published_at: new Date((NOW - 10 * DAY) * 1000).toISOString(),
    kid: "2026-10-a",
    packs: ["base"],
    files: [
      { id: "whisper-small", kind: "asr", version: "1", bytes: 574041195, tier: "free", min_app_version: "0.3.0" },
      { id: "nllb-600m", kind: "mt", version: "2", bytes: 1288490188, tier: "pro", min_app_version: "0.4.0" },
    ],
  },
});
const API = {
  "/admin/whoami": () => ({ operator: "ops@aitranslator.io.vn" }),
  "/admin/stats": statsFixture,
  "/admin/alerts": alertsFixture,
  "/admin/releases": releasesFixture,
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
  // Chrome headless ép độ rộng cửa sổ tối thiểu 500px (đo thực tế: đặt 390 vẫn innerWidth=500, ảnh bị cắt). 500px vẫn thuộc
  // quy tắc điện thoại của giao diện (max-width: 800px); khổ 390px thật phải xem trên điện thoại khi nghiệm thu.
  // --height=N: chiều cao cửa sổ (mặc định 900), để chụp cả trang dài.
  const h = value("height") ?? "900";
  const size = flag("mobile") ? `500,${h}` : `1280,${h}`;
  // Không đặt cờ thì Chrome theo giao diện của hệ điều hành. Giá trị thử thực tế: 0 là tối, 1 là sáng.
  const scheme = flag("dark") ? ["--blink-settings=preferredColorScheme=0"] : flag("light") ? ["--blink-settings=preferredColorScheme=1"] : [];
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--enable-logging=stderr",
    "--v=0",
    "--virtual-time-budget=10000",
    `--window-size=${size}`,
    ...scheme,
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
  console.log(`Trang: ${url.replace(/:\d+/, ":<cổng>")}  (${flag("mobile") ? "điện thoại" : "máy tính"}${flag("dark") ? ", tối" : flag("light") ? ", sáng" : ""})`);
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
