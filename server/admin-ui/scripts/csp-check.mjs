#!/usr/bin/env node
// Kiểm bản build của Web Admin với đúng CSP của production (spec Web Admin phần 2, mục 5).
// Phục vụ dist/ qua một server Node tạm (kèm API giả cho vài route /admin/*), mở trang bằng Chrome headless rồi:
//  - đọc console của Chrome (stderr): dòng nào nói về Content Security Policy là vi phạm; Uncaught và lỗi tải file cũng là lỗi;
//  - kiểm DOM sau khi vẽ có các chuỗi mong đợi (--expect=...);
//  - in dung lượng (byte, gzip) các file trong dist/assets (--sizes);
//  - chụp màn hình (--shot=đường-dẫn.png).
// Dùng:  pnpm build && node scripts/csp-check.mjs --path=/overview --expect=recharts-surface [--mobile] [--dark|--light] [--height=N] [--sizes] [--shot=x.png] [--console]
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
// Hàng đợi có việc ở mọi kiểu dòng (đơn, email, license, cảnh báo) và một nhóm dài (gấp gọn, "và N mục khác").
function queueFixture() {
  const order = (code, ago, paid = 500000) => ({
    order_code: code,
    provider: "payos",
    plan: "yearly",
    amount: 500000,
    amount_paid: paid,
    currency: "VND",
    email: `khach${code % 7}@example.com`,
    status: paid < 500000 ? "underpaid" : "paid_needs_review",
    grant_kind: null,
    license_id: null,
    renew_license_id: null,
    created_at: NOW - ago,
    paid_at: null,
    email_sent_at: null,
    email_gave_up_at: null,
  });
  const lic = (id, locked) => ({
    id,
    license_key: "K7Q2-…-9XMB",
    email: "khach@example.com",
    plan: "yearly",
    expires_at: NOW + 300 * DAY,
    created_at: NOW - 60 * DAY,
    revoked_at: null,
    locked_at: locked ? NOW - 3600 : null,
    active_devices: 2,
  });
  return {
    needs_review: { count: 1, items: [order(1000214, 1500)] },
    underpaid: { count: 23, items: Array.from({ length: 20 }, (_, i) => order(1000200 - i, 3600 * (i + 1), 200000)) },
    email_failed: { count: 1, items: [{ ...order(1000150, 2 * DAY), license_id: "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69", email_gave_up_at: NOW - DAY }] },
    locked: { count: 1, items: [lic("1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", true)] },
    conflict: { count: 1, items: [lic("7f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2910", false)] },
    alerts: { count: 3, items: [{ kind: "webhook_bad_signature", window_start: NOW - 1800, count: 3, notified_count: 0 }] },
  };
}
// Bốn danh sách: vài dòng đủ trạng thái (chuyển thiếu, cần xử lý, khóa tạm, xung đột, hết hạn…), email dài, còn trang sau
// (next_cursor) để thấy "Tải thêm". Bộ lọc không được giả lập.
const LONG_EMAIL = "nguyen.thi.thanh.huong.phong.ke.toan@congty-xuat-nhap-khau-thanh-dat.com.vn";
const listPage = (items) => ({ items, next_cursor: "c50" });
function ordersFixture() {
  const mix = ["paid", "underpaid", "pending", "paid_needs_review", "failed", "expired", "refunded", "cancelled"];
  return listPage(
    mix.map((status, i) => ({
      order_code: 1000300 - i,
      provider: "payos",
      plan: i % 2 ? "monthly" : "yearly",
      amount: i % 2 ? 50000 : 500000,
      amount_paid: status === "underpaid" ? 20000 : ["paid", "paid_needs_review", "refunded"].includes(status) ? (i % 2 ? 50000 : 500000) : 0,
      currency: "VND",
      email: i === 2 ? LONG_EMAIL : i === 4 ? null : `khach${i}@example.com`,
      status,
      grant_kind: null,
      license_id: null,
      renew_license_id: null,
      created_at: NOW - (i + 1) * 5000,
      paid_at: null,
      email_sent_at: null,
      email_gave_up_at: null,
    })),
  );
}
function licensesFixture() {
  const lic = (i, over) => ({
    id: `0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a${String(60 + i)}`,
    license_key: "K7Q2-…-9XMB",
    email: i === 1 ? LONG_EMAIL : `khach${i}@example.com`,
    plan: i % 2 ? "monthly" : "yearly",
    expires_at: NOW + 200 * DAY,
    created_at: NOW - i * DAY,
    revoked_at: null,
    locked_at: null,
    active_devices: 1,
    ...over,
  });
  return listPage([
    lic(0, {}),
    lic(1, { expires_at: NOW + 3 * DAY }),
    lic(2, { active_devices: 2 }),
    lic(3, { locked_at: NOW - 3600 }),
    lic(4, { revoked_at: NOW - DAY }),
    lic(5, { expires_at: NOW - 2 * DAY, active_devices: 0 }),
  ]);
}
function trialsFixture() {
  return listPage(
    [0, 1, 2, 3].map((i) => ({
      device_id_hash: `${"3fa1"}${String(i).repeat(56)}c09e`,
      started_at: NOW - (i * 4 + 1) * DAY,
      ends_at: NOW + (9 - i * 4) * DAY,
      last_seen_at: NOW - 3600 * (i + 1),
      purchased: i === 1,
    })),
  );
}
function auditFixture() {
  const rows = [
    ["api", "activated", "lic", '{"activation_id":"act-1"}'],
    ["webhook", "license_issued", "both", null],
    ["admin:ops@aitranslator.io.vn", "license_revoked", "lic", '{"note":"khách yêu cầu hoàn tiền"}'],
    ["webhook", "order_underpaid", "order", '{"amount":500000,"amount_paid":200000}'],
    ["reconcile", "license_extended", "both", null],
    ["api", "license_conflict", "lic", '{"devices":2}'],
  ];
  return listPage(
    rows.map(([actor, action, rel, detail], i) => ({
      id: 900 - i,
      at: NOW - 600 - i * 9 * 3600,
      actor,
      action,
      license_id: rel === "order" ? null : "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69",
      order_code: rel === "lic" ? null : 1000300 - i,
      detail,
    })),
  );
}
// Tra cứu (POST, body không đọc): một đơn chuyển thiếu gia hạn license LIC; LIC khóa tạm và xung đột máy, có nhật ký. Đủ để
// vẽ trang đơn /orders/1000012 và trang license /licenses/<LIC> với thẻ việc cần làm, danh sách máy, khu vực nguy hiểm.
const LIC = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
function lookupFixture() {
  const act = (id, hash, label, over = {}) => ({
    id,
    license_id: LIC,
    device_id_hash: hash,
    device_label: label,
    quota_epoch: 0,
    created_at: NOW - 5 * DAY,
    last_validated_at: NOW - 300,
    deactivated_at: null,
    deactivated_by: null,
    ...over,
  });
  return {
    licenses: [
      {
        id: LIC,
        license_key: "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB",
        email: "khach@example.com",
        plan: "yearly",
        expires_at: NOW + 200 * DAY,
        created_at: NOW - 60 * DAY,
        revoked_at: null,
        locked_at: NOW - 3600,
        conflict: true,
        activations: [
          act("act-1", `3fa1${"0".repeat(56)}c09e`, "MacBook"),
          act("act-2", `91be${"0".repeat(56)}77d2`, "DESKTOP-ABC"),
          act("act-0", `c7d2${"0".repeat(56)}1a4f`, null, { deactivated_at: NOW - 9 * DAY, deactivated_by: "admin" }),
        ],
        audit: [
          { at: NOW - 3600, actor: "api", action: "license_conflict", order_code: null, detail: '{"activation_id":"act-2","devices":2}' },
          { at: NOW - 9 * DAY, actor: "admin:ops@aitranslator.io.vn", action: "deactivated_by_admin", order_code: null, detail: '{"activation_id":"act-0"}' },
          { at: NOW - 60 * DAY, actor: "webhook", action: "license_issued", order_code: 1000012, detail: null },
        ],
      },
    ],
    orders: [
      {
        order_code: 1000012,
        provider: "payos",
        plan: "yearly",
        amount: 500000,
        amount_paid: 200000,
        currency: "VND",
        email: "khach@example.com",
        status: "underpaid",
        grant_kind: null,
        license_id: null,
        renew_license_id: LIC,
        created_at: NOW - 2 * 3600,
        paid_at: null,
        email_sent_at: null,
        email_gave_up_at: null,
      },
    ],
  };
}
const API = {
  "/admin/lookup": lookupFixture,
  "/admin/orders/1000012/payment-status": () => ({ orderCode: 1000012, status: "underpaid", amount: 500000, amountPaid: 200000, paidAt: NOW - 3600 }),
  "/admin/whoami": () => ({ operator: "ops@aitranslator.io.vn" }),
  "/admin/stats": statsFixture,
  "/admin/alerts": alertsFixture,
  "/admin/releases": releasesFixture,
  "/admin/summary": () => ({ revenue_today: 0, currency: "VND", paid_orders_7d: 0, active_licenses: 0 }),
  "/admin/queue": queueFixture,
  "/admin/orders": ordersFixture,
  "/admin/licenses": licensesFixture,
  "/admin/trials": trialsFixture,
  "/admin/audit": auditFixture,
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
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
  // --console: in mọi dòng console của trang (cảnh báo như font tải trước mà không dùng, React key…), không tính là lỗi.
  if (flag("console")) {
    const rest = lines.filter((l) => !violations.includes(l) && !errors.includes(l));
    console.log(`Dòng console khác: ${rest.length}`);
    for (const l of rest) console.log(`  ${l.slice(0, 300)}`);
  }
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
