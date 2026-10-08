// API giả cho `pnpm dev` (apply: "serve": chỉ dev server). Không có trong bản build, không chạy trên Worker.
// Dữ liệu mẫu cố định đủ để xem mọi màn hình, hình dạng khớp hợp đồng API thật (src/api/types.ts). Bốn danh sách (đơn,
// license, máy dùng thử, nhật ký) có vài chục dòng, lọc gần giống server và phân trang 50 dòng bằng next_cursor để thấy
// "Tải thêm". Tra cứu (/admin/lookup) trả theo body như server: đơn, license, máy có thật trong dữ liệu mẫu, còn lại rỗng.
// Vài bản ghi trình diễn cho trang chi tiết: đơn 1000012 (đã trả), 1000214 (cần xử lý), 1000210 (chuyển thiếu), 1000208
// (chưa gửi được email key); license LIC (xung đột máy), LOCKED (khóa tạm), REVOKED (đã thu hồi); máy DEVICE_A (đã mua,
// dùng thử đã hết), DEVICE_B (đã mua, không dùng thử). Email khach@example.com có hai license. Thao tác ghi trả thành
// công giả. Không dùng email, key hay hash thật.
// Xem trạng thái khó tạo: thêm `__fake=slow` (chờ 30 giây), `__fake=error` (lỗi 500) hay `__fake=empty` (danh sách rỗng)
// vào địa chỉ TRANG (ví dụ /orders?__fake=empty): API giả ghi nó vào cookie khi trả HTML, trang không biết gì. Áp cho bốn
// danh sách và cho tra cứu (empty: không tìm thấy). `__fake=bad` làm tra cứu trả 400 (từ khóa sai định dạng).
import type { Plugin } from "vite";
import type {
  Activation,
  AlertRow,
  AlertRowFull,
  AlertsResponse,
  AuditRow,
  EraseResult,
  IssuedLicense,
  KeyCheck,
  LicenseDetail,
  LicenseRow,
  LookupResult,
  OrderRow,
  OrderStatus,
  Page,
  PaymentStatus,
  Queue,
  QueueGroup,
  ReleasesResponse,
  Stats,
  Summary,
  TrialRow,
} from "../src/api/types.ts";

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;
const EMAIL = "khach@example.com";
const LIC = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";
const DEVICE_A = `3fa1${"0".repeat(56)}c09e`;
const DEVICE_B = `91be${"0".repeat(56)}77d2`;
const ACTORS = ["api", "webhook", "reconcile", "admin"];

function order(code: number, status: OrderStatus): OrderRow {
  const paid = status === "paid" || status === "paid_needs_review";
  return {
    order_code: code,
    provider: "payos",
    plan: "yearly",
    amount: 500000,
    amount_paid: paid ? 500000 : status === "underpaid" ? 200000 : 0,
    currency: "VND",
    email: EMAIL,
    status,
    grant_kind: status === "paid" ? "new" : null,
    license_id: status === "paid" ? LIC : null,
    renew_license_id: null,
    created_at: NOW - DAY,
    paid_at: paid ? NOW - DAY : null,
    email_sent_at: status === "paid" ? NOW - DAY : null,
    email_gave_up_at: null,
  };
}

const licenseRow: LicenseRow = {
  id: LIC,
  license_key: "K7Q2-…-9XMB",
  email: EMAIL,
  plan: "yearly",
  expires_at: NOW + 365 * DAY,
  created_at: NOW - DAY,
  revoked_at: null,
  locked_at: null,
  active_devices: 2,
};

const activation = (id: string, hash: string, label: string): Activation => ({
  id,
  license_id: LIC,
  device_id_hash: hash,
  device_label: label,
  quota_epoch: 0,
  created_at: NOW - DAY,
  last_validated_at: NOW - 300,
  deactivated_at: null,
  deactivated_by: null,
});

const LOCKED = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const REVOKED = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
const DEVICE_C = `c7d2${"0".repeat(56)}1a4f`;

const licenseDetail: LicenseDetail = {
  id: LIC,
  license_key: KEY,
  email: EMAIL,
  plan: "yearly",
  expires_at: NOW + 365 * DAY,
  created_at: NOW - 40 * DAY,
  revoked_at: null,
  locked_at: null,
  conflict: true,
  activations: [
    { ...activation("act-0", DEVICE_C, "Laptop-cu"), created_at: NOW - 39 * DAY, last_validated_at: NOW - 12 * DAY, deactivated_at: NOW - 11 * DAY, deactivated_by: "user" },
    { ...activation("act-1", DEVICE_A, "MacBook-Phong"), created_at: NOW - 11 * DAY },
    { ...activation("act-2", DEVICE_B, "DESKTOP-ABC"), created_at: NOW - 3700, last_validated_at: NOW - 120 },
  ],
  audit: [
    { at: NOW - 3600, actor: "api", action: "license_conflict", order_code: null, detail: '{"activation_id":"act-2","devices":2}' },
    { at: NOW - 3650, actor: "api", action: "activated", order_code: null, detail: '{"activation_id":"act-2"}' },
    { at: NOW - 2 * DAY, actor: "admin:ops@aitranslator.io.vn", action: "key_resent", order_code: null, detail: '{"sent":true}' },
    { at: NOW - 11 * DAY, actor: "api", action: "activated", order_code: null, detail: '{"activation_id":"act-1"}' },
    { at: NOW - 11 * DAY - 600, actor: "api", action: "deactivated", order_code: null, detail: '{"activation_id":"act-0"}' },
    { at: NOW - 39 * DAY, actor: "api", action: "activated", order_code: null, detail: '{"activation_id":"act-0"}' },
    { at: NOW - 40 * DAY, actor: "webhook", action: "license_issued", order_code: 1000012, detail: null },
  ],
};

const lockedDetail: LicenseDetail = {
  ...licenseDetail,
  id: LOCKED,
  license_key: "P3RT-7KQM-2WXA-9HDE-4NBC-6ZTY-Q8LZ",
  email: "linh.dang@example.com",
  plan: "monthly",
  expires_at: NOW + 18 * DAY,
  created_at: NOW - 12 * DAY,
  locked_at: NOW - 3 * 3600,
  conflict: false,
  activations: [
    { ...activation("act-7", `e81b${"0".repeat(56)}0d33`, "PC-Ke-Toan"), license_id: LOCKED, created_at: NOW - 4 * 3600 },
    { ...activation("act-6", `5a90${"0".repeat(56)}b7e1`, null as unknown as string), license_id: LOCKED, device_label: null, deactivated_at: NOW - 5 * 3600, deactivated_by: "user" },
    { ...activation("act-5", `0f4c${"0".repeat(56)}2e98`, "Laptop-Linh"), license_id: LOCKED, deactivated_at: NOW - 2 * DAY, deactivated_by: "admin" },
  ],
  audit: [
    { at: NOW - 3 * 3600, actor: "api", action: "license_locked", order_code: null, detail: '{"deactivations_30d":3}' },
    { at: NOW - 4 * 3600, actor: "api", action: "activated", order_code: null, detail: '{"activation_id":"act-7"}' },
    { at: NOW - 5 * 3600, actor: "api", action: "deactivated", order_code: null, detail: '{"activation_id":"act-6"}' },
    { at: NOW - 2 * DAY, actor: "admin:ops@aitranslator.io.vn", action: "deactivated_by_admin", order_code: null, detail: '{"activation_id":"act-5","note":"khách đổi máy"}' },
    { at: NOW - 12 * DAY, actor: "webhook", action: "license_issued", order_code: 1000190, detail: null },
  ],
};

const revokedDetail: LicenseDetail = {
  ...licenseDetail,
  id: REVOKED,
  license_key: "R9VB-2MXQ-8TKD-3HZC-7WEF-1NPA-5GHJ",
  plan: "monthly",
  expires_at: NOW + 20 * DAY,
  created_at: NOW - 10 * DAY,
  revoked_at: NOW - 2 * DAY,
  conflict: false,
  activations: [{ ...activation("act-9", DEVICE_A, "MacBook-Phong"), license_id: REVOKED, created_at: NOW - 10 * DAY, last_validated_at: NOW - 2 * DAY }],
  audit: [
    { at: NOW - 2 * DAY, actor: "admin:ops@aitranslator.io.vn", action: "license_revoked", order_code: null, detail: '{"note":"khách yêu cầu hoàn tiền, đã chuyển khoản lại"}' },
    { at: NOW - 10 * DAY, actor: "api", action: "activated", order_code: null, detail: '{"activation_id":"act-9"}' },
    { at: NOW - 10 * DAY - 300, actor: "webhook", action: "license_issued", order_code: 1000150, detail: null },
  ],
};

const lookup: LookupResult = {
  licenses: [licenseDetail],
  orders: [order(1000012, "paid")],
  trial: { started_at: NOW - 12 * DAY, ends_at: NOW - 2 * DAY, last_seen_at: NOW - DAY },
};

const issued: IssuedLicense = { license_id: LIC, license_key: KEY, plan: "yearly", expires_at: NOW + 365 * DAY };
const keyCheck: KeyCheck = { slot: "b", kid: "2026-10-b", token: "v1.eyJ0ZXN0Ijp0cnVlfQ.c2ln" };
const erased: EraseResult = { activations: 2, licenses: 1, orders: 1 };
const summary: Summary = { revenue_today: 12450000, currency: "VND", paid_orders_7d: 1204, active_licenses: 3187 };
const payment: PaymentStatus = { orderCode: 1000012, status: "paid", amount: 500000, amountPaid: 500000, paidAt: NOW - DAY };

const group = <T>(items: T[]): QueueGroup<T> => ({ count: items.length, items });

// Hàng đợi giàu dữ liệu để xem mọi nhóm: nhiều tông, thời gian tương đối khác nhau, email dài, một nhóm có hơn 20 việc
// (server chỉ trả 20 dòng mỗi nhóm) để thấy "và N mục khác".
const LONG_EMAIL = "nguyen.thi.thanh.huong.phong.ke.toan@congty-xuat-nhap-khau-thanh-dat.com.vn";
const qOrder = (code: number, status: OrderStatus, ago: number, over: Partial<OrderRow> = {}): OrderRow => ({
  ...order(code, status),
  created_at: NOW - ago,
  paid_at: status === "underpaid" ? null : NOW - ago + 60,
  ...over,
});
const qLicense = (id: string, key: string, over: Partial<LicenseRow> = {}): LicenseRow => ({ ...licenseRow, id, license_key: key, ...over });
const UNDERPAID_EMAILS = ["an.nguyen@example.com", "binh.tran@example.com", LONG_EMAIL, "chi.le@example.com", "dung.pham@example.com"];
const queue: Queue = {
  needs_review: group([
    qOrder(1000214, "paid_needs_review", 25 * 60, { email: "minh.hoang@example.com" }),
    qOrder(1000197, "paid_needs_review", 26 * 3600, { plan: "monthly", amount: 50000, amount_paid: 50000, email: null }),
  ]),
  underpaid: {
    count: 23,
    items: Array.from({ length: 20 }, (_, i) =>
      qOrder(1000210 - i * 3, "underpaid", 40 * 60 + i * 5 * 3600, {
        email: UNDERPAID_EMAILS[i % UNDERPAID_EMAILS.length] ?? EMAIL,
        plan: i % 3 === 0 ? "monthly" : "yearly",
        amount: i % 3 === 0 ? 50000 : 500000,
        amount_paid: i % 3 === 0 ? 20000 : [200000, 450000, 499000][i % 3] ?? 200000,
      }),
    ),
  },
  email_failed: group([
    qOrder(1000208, "paid", 2 * DAY + 3600, { license_id: LIC, email: "khanh.vu@example.com", email_sent_at: null }),
    qOrder(1000181, "paid", 6 * DAY, { license_id: null, email: LONG_EMAIL, email_sent_at: null, email_gave_up_at: NOW - 4 * DAY }),
  ]),
  locked: group([qLicense("1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "P3RT-…-Q8LZ", { locked_at: NOW - 3 * 3600, active_devices: 3, email: "linh.dang@example.com" })]),
  conflict: group([
    licenseRow,
    qLicense("7f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2910", "Z9WX-…-4KTB", { plan: "monthly", expires_at: NOW + 12 * DAY, active_devices: 2, email: LONG_EMAIL }),
  ]),
  alerts: {
    count: 7,
    items: [
      { kind: "webhook_bad_signature", window_start: NOW - 1800, count: 3, notified_count: 0 },
      { kind: "email_send_failed", window_start: NOW - 5 * 3600, count: 5, notified_count: 3 },
    ] satisfies AlertRow[],
  },
};

// Trang Hệ thống: cảnh báo đủ hai trạng thái; stable ok, beta chưa có; model ok với vài file (không có số hay khóa thật).
const alertsFull: AlertsResponse = {
  items: [
    { kind: "webhook_bad_signature", window_start: NOW - 1800, count: 3, notified_count: 0, notified_at: null },
    { kind: "reconcile_failed", window_start: NOW - 7200, count: 2, notified_count: 2, notified_at: NOW - 3600 },
    { kind: "email_send_failed", window_start: NOW - DAY, count: 5, notified_count: 3, notified_at: NOW - DAY + 600 },
  ] satisfies AlertRowFull[],
  total: 3,
  pending: 2,
};
const releasesFull: ReleasesResponse = {
  base_url: "https://releases.example.com",
  channels: {
    stable: {
      status: "ok",
      version: "0.4.2",
      pub_date: new Date((NOW - 3 * DAY) * 1000).toISOString(),
      notes: "Sửa lỗi thanh phụ đề trên macOS.\nTăng độ ổn định khi mất mạng.",
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
      { id: "silero-vad", kind: "vad", version: "1", bytes: 2097152, tier: "free", min_app_version: "0.3.0" },
    ],
  },
};

/* ---------- Bốn danh sách: dữ liệu đa dạng, lọc và phân trang giả ---------- */

const EMAILS = ["an.nguyen@example.com", "binh.tran@example.com", LONG_EMAIL, "chi.le@example.com", null, "dung.pham@example.com", "minh.hoang@example.com"];
const hex = (i: number, n: number) => Array.from({ length: n }, (_, k) => ((i * 7 + k * 13 + (i * k) % 5) % 16).toString(16)).join("");
const keyOf = (i: number) => {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const c = (k: number) => a[(i * 11 + k * 7) % a.length];
  return `${c(1)}${c(2)}${c(3)}${c(4)}-…-${c(5)}${c(6)}${c(7)}${c(8)}`;
};
const uuidOf = (i: number) => `${hex(i, 8)}-${hex(i + 1, 4)}-4${hex(i + 2, 3)}-8${hex(i + 3, 3)}-${hex(i + 4, 12)}`;

const ORDER_MIX: OrderStatus[] = ["paid", "paid", "pending", "underpaid", "paid", "expired", "paid_needs_review", "paid", "cancelled", "failed", "paid", "processing", "refunded", "paid"];
const orders: OrderRow[] = Array.from({ length: 73 }, (_, i) => {
  const status = ORDER_MIX[i % ORDER_MIX.length] ?? "paid";
  const monthly = i % 3 === 1;
  const amount = monthly ? 50000 : 500000;
  const paid = ["paid", "paid_needs_review", "refunded", "processing"].includes(status);
  const ago = 600 + i * 4.3 * 3600;
  return {
    ...order(1000300 - i, status),
    plan: monthly ? "monthly" : "yearly",
    amount,
    amount_paid: paid ? amount : status === "underpaid" ? [20000, 200000, 499000][i % 3] ?? 20000 : 0,
    email: EMAILS[i % EMAILS.length] ?? null,
    created_at: Math.round(NOW - ago),
    paid_at: paid ? Math.round(NOW - ago + 90) : null,
  };
});

const licenses: LicenseRow[] = Array.from({ length: 64 }, (_, i) => {
  const expiresIn = [300, 4, 25, -3, 180, 2, 340, -40, 12, 60][i % 10] ?? 30;
  return {
    id: i === 0 ? LIC : uuidOf(i),
    license_key: i === 0 ? "K7Q2-…-9XMB" : keyOf(i),
    email: EMAILS[(i + 2) % EMAILS.length] ?? null,
    plan: i % 3 === 1 ? "monthly" : "yearly",
    expires_at: NOW + expiresIn * DAY,
    created_at: NOW - (i * 1.7 + 0.2) * DAY,
    revoked_at: i % 13 === 5 ? NOW - 2 * DAY : null,
    locked_at: i % 11 === 3 ? NOW - 5 * 3600 : null,
    active_devices: [1, 1, 2, 0, 1, 1, 3, 1][i % 8] ?? 1,
  };
});

const trials: TrialRow[] = Array.from({ length: 58 }, (_, i) => {
  const started = NOW - Math.round((i * 0.9 + 0.1) * DAY);
  return {
    device_id_hash: i === 0 ? DEVICE_A : i === 1 ? DEVICE_B : hex(i * 3 + 1, 64),
    started_at: started,
    ends_at: started + 10 * DAY,
    last_seen_at: Math.min(NOW - 120, started + Math.round(((i * 37) % 11) * 0.9 * DAY) + 3600),
    purchased: i % 4 === 2,
  };
});

const AUDIT_MIX: [string, string, ("lic" | "order" | "both")?, string?][] = [
  ["api", "activated", "lic", '{"activation_id":"act-1"}'],
  ["webhook", "license_issued", "both"],
  ["admin:ops@aitranslator.io.vn", "list_viewed", undefined, '{"list":"orders"}'],
  ["api", "order_created", "order", '{"plan":"yearly","amount":500000}'],
  ["reconcile", "license_extended", "both"],
  ["admin:ops@aitranslator.io.vn", "license_revoked", "lic", '{"note":"khách yêu cầu hoàn tiền, đã chuyển khoản lại ngày 06/10"}'],
  ["webhook", "order_underpaid", "order", '{"amount":500000,"amount_paid":200000}'],
  ["api", "license_conflict", "lic", '{"activation_id":"act-2","devices":2}'],
  ["admin:ops@aitranslator.io.vn", "license_extended_manually", "lic", '{"days":30,"note":"bù 30 ngày do lỗi cập nhật"}'],
  ["api", "deactivated", "lic", '{"activation_id":"act-1"}'],
  ["admin:ops@aitranslator.io.vn", "lookup", undefined, '{"by":"email"}'],
  ["api", "license_locked", "lic", '{"deactivations_30d":3}'],
  ["webhook", "order_needs_review", "order"],
  ["admin:ops@aitranslator.io.vn", "key_resent", "lic", '{"sent":true}'],
  ["api", "reactivated", "lic", '{"activation_id":"act-3"}'],
  ["admin:ops@aitranslator.io.vn", "queue_viewed", undefined, '{"needs_review":2,"underpaid":23}'],
];
const audits: AuditRow[] = Array.from({ length: 90 }, (_, i) => {
  const [actor, action, rel, detail] = AUDIT_MIX[i % AUDIT_MIX.length] ?? ["api", "activated"];
  return {
    id: 5000 - i,
    at: Math.round(NOW - 300 - i * 2.6 * 3600),
    actor,
    action,
    license_id: rel === "lic" || rel === "both" ? (licenses[i % licenses.length]?.id ?? LIC) : null,
    order_code: rel === "order" || rel === "both" ? (orders[i % orders.length]?.order_code ?? 1000012) : null,
    detail: detail ?? null,
  };
});
/** Nhật ký của các đơn trình diễn (trang chi tiết đơn lọc theo order_code). */
const auditOf = (id: number, at: number, actor: string, action: string, order_code: number, license_id: string | null = null, detail: string | null = null): AuditRow => ({
  id,
  at,
  actor,
  action,
  license_id,
  order_code,
  detail,
});
const ORDER_AUDITS: AuditRow[] = [
  auditOf(9010, NOW - 20 * 60, "webhook", "order_needs_review", 1000214, null, '{"reason":"license_revoked"}'),
  auditOf(9009, NOW - 25 * 60, "api", "order_created", 1000214, null, '{"plan":"yearly","amount":500000,"renew":true}'),
  auditOf(9008, NOW - 40 * 60 + 200, "webhook", "order_underpaid", 1000210, null, '{"amount":50000,"amount_paid":20000}'),
  auditOf(9007, NOW - 40 * 60, "api", "order_created", 1000210, null, '{"plan":"monthly","amount":50000}'),
  auditOf(9006, NOW - 2 * DAY, "webhook", "license_issued", 1000208, LIC),
  auditOf(9005, NOW - 2 * DAY - 3600, "api", "order_created", 1000208, null, '{"plan":"yearly","amount":500000}'),
  auditOf(9003, NOW - 40 * DAY + 95, "webhook", "license_issued", 1000012, LIC),
  auditOf(9002, NOW - 40 * DAY, "api", "order_created", 1000012, null, '{"plan":"yearly","amount":500000}'),
];
const VIEW_ACTIONS = ["lookup", "list_viewed", "queue_viewed", "summary_viewed", "stats_viewed", "payment_status_viewed", "alerts_viewed", "releases_viewed"];

/** Trang 50 dòng theo con trỏ (vị trí), như server: next_cursor null ở trang cuối. */
function paged<T>(rows: T[], url: URL): Page<T> {
  const start = Number(url.searchParams.get("cursor") ?? 0) || 0;
  const items = rows.slice(start, start + 50);
  return { items, next_cursor: start + 50 < rows.length ? String(start + 50) : null };
}
/** Lọc theo ngày tạo kiểu server (from/to là ngày GMT+7, gồm cả hai đầu). */
function inRange(at: number, q: URLSearchParams): boolean {
  const d = dayKey(at);
  const from = q.get("from");
  const to = q.get("to");
  return (!from || d >= from) && (!to || d <= to);
}
function listReply(path: string, url: URL): Reply | null {
  const q = url.searchParams;
  const is = (k: string, v: string) => !q.get(k) || q.get(k) === v;
  switch (path) {
    case "/admin/orders":
      return ok(paged(orders.filter((o) => is("status", o.status) && is("plan", o.plan) && inRange(o.created_at, q)), url));
    case "/admin/licenses": {
      const state = (l: LicenseRow) =>
        l.revoked_at !== null ? ["revoked"] : [l.expires_at > NOW ? "active" : "expired", ...(l.locked_at ? ["locked"] : []), ...(l.active_devices > 1 ? ["conflict"] : [])];
      return ok(paged(licenses.filter((l) => (!q.get("state") || state(l).includes(q.get("state") ?? "")) && is("plan", l.plan)), url));
    }
    case "/admin/trials":
      return ok(paged(trials.filter((t) => !q.get("state") || (q.get("state") === "active") === t.ends_at > NOW), url));
    case "/admin/audit": {
      // Giả lập một lỗi lọc để xem giao diện lỗi: thử `actor=bad`.
      const actor = q.get("actor");
      if (actor && !ACTORS.includes(actor)) return ok({ error: "invalid_request", field: "actor" }, 400);
      const action = q.get("action");
      const views = q.get("include_views") === "1" || (action !== null && VIEW_ACTIONS.includes(action));
      return ok(
        paged(
          [...ORDER_AUDITS, ...audits].filter(
            (a) =>
              (!actor || a.actor.split(":")[0] === actor) &&
              is("action", a.action) &&
              is("order_code", String(a.order_code)) &&
              (views || !VIEW_ACTIONS.includes(a.action)) &&
              inRange(a.at, q),
          ),
          url,
        ),
      );
    }
    default:
      return null;
  }
}

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
      today: 2450000,
      last_7d: 18900000,
      this_month: 46350000,
      last_month: 52100000,
      daily: days.map((day, i) => ({ day, revenue: (2 + ((i * 7) % 5)) * 550000 + (i % 3) * 450000, orders: 4 + ((i * 7) % 5) * 2 })),
      monthly: months.map((month, i) => ({
        month,
        monthly: { revenue: (18 + ((i * 5) % 9)) * 1000000, orders: (18 + ((i * 5) % 9)) * 20 },
        yearly: { revenue: (10 + ((i * 7) % 11)) * 2500000, orders: (10 + ((i * 7) % 11)) * 5 },
      })),
    },
    customers: {
      trials_30d: 412,
      trials_30d_purchased: 87,
      trials_total: 3904,
      trials_total_purchased: 716,
      grants_30d: {
        new: { orders: 58, revenue: 19400000 },
        extend: { orders: 31, revenue: 9850000 },
        change: { orders: 6, revenue: 3000000 },
        other: { orders: 1, revenue: 0 },
      },
      grants_monthly: months.map((month, i) => ({ month, new: 40 + ((i * 7) % 23), extend: 18 + ((i * 5) % 15), change: 3 + (i % 5), other: i % 4 === 0 ? 1 : 0 })),
    },
    health: {
      orders_30d: { pending: 12, processing: 1, paid: 96, underpaid: 23, cancelled: 18, expired: 41, failed: 2, paid_needs_review: 2, refunded: 1 },
      expiring_7d: 14,
      expiring_30d: 63,
      email: { paid_with_email_30d: 96, sent: 94 },
    },
    usage: {
      active_licenses: 3187,
      active_devices: 3402,
      devices_7d: 2875,
      trials_active: 268,
      new_trials_daily: days.map((day, i) => ({ day, count: 8 + ((i * 7) % 13) })),
    },
  };
})();

/* ---------- Tra cứu: trả theo body như server ---------- */

/** License đầy đủ của một dòng danh sách (key đầy đủ dựng lại từ key che, máy theo số máy đang kích hoạt). */
function detailOf(row: LicenseRow): LicenseDetail {
  const [head, tail] = row.license_key.split("-…-");
  return {
    ...row,
    license_key: `${head}-M4XB-9TRD-0HZC-5WEF-8NPA-${tail}`,
    conflict: row.active_devices > 1,
    activations: Array.from({ length: row.active_devices }, (_, i) => ({ ...activation(`${row.id.slice(0, 4)}-${i}`, hex(i + 9, 64), `May-${i + 1}`), license_id: row.id })),
    audit: [{ at: row.created_at, actor: "webhook", action: "license_issued", order_code: null, detail: null }],
  };
}

const SHOWCASE_ORDERS: OrderRow[] = [
  { ...order(1000012, "paid"), created_at: NOW - 40 * DAY, paid_at: NOW - 40 * DAY + 95, email_sent_at: NOW - 40 * DAY + 120 },
  { ...qOrder(1000214, "paid_needs_review", 25 * 60, { email: "minh.hoang@example.com" }), renew_license_id: REVOKED },
  ...queue.underpaid.items,
  ...queue.email_failed.items,
];

function findOrder(code: number): OrderRow | undefined {
  return SHOWCASE_ORDERS.find((o) => o.order_code === code) ?? orders.find((o) => o.order_code === code);
}

function findLicense(id: string): LicenseDetail | undefined {
  if (id === LIC) return licenseDetail;
  if (id === LOCKED) return lockedDetail;
  if (id === REVOKED) return revokedDetail;
  const row = licenses.find((l) => l.id === id);
  return row ? detailOf(row) : undefined;
}

function ordersOf(id: string): OrderRow[] {
  if (id === LIC) return SHOWCASE_ORDERS.filter((o) => o.license_id === LIC);
  if (id === REVOKED) return SHOWCASE_ORDERS.filter((o) => o.renew_license_id === REVOKED);
  return [];
}

function lookupReply(body: Record<string, unknown>): Reply {
  const withOrders = (l: LicenseDetail | undefined): LookupResult => (l ? { licenses: [l], orders: ordersOf(l.id) } : { licenses: [], orders: [] });
  if (typeof body.order_code === "number") {
    const o = findOrder(body.order_code);
    if (!o) return ok({ licenses: [], orders: [] });
    const ids = [o.license_id, o.renew_license_id].filter((x): x is string => typeof x === "string");
    return ok({ licenses: ids.map(findLicense).filter((l): l is LicenseDetail => l !== undefined), orders: [o] });
  }
  if (typeof body.license_id === "string") return ok(withOrders(findLicense(body.license_id)));
  if (typeof body.license_key === "string") {
    const k = body.license_key.replace(/[\s-]/g, "").toUpperCase();
    return ok(withOrders([licenseDetail, lockedDetail, revokedDetail].find((l) => l.license_key.replace(/-/g, "") === k)));
  }
  if (typeof body.email === "string") {
    if (body.email !== EMAIL) return ok({ licenses: [], orders: [] });
    return ok({ licenses: [licenseDetail, revokedDetail], orders: [...ordersOf(LIC), ...ordersOf(REVOKED)] });
  }
  if (typeof body.device_id_hash === "string") {
    const h = body.device_id_hash;
    if (h === DEVICE_A) return ok({ licenses: [licenseDetail, revokedDetail], orders: [], trial: lookup.trial });
    if (h === DEVICE_B || h === DEVICE_C) return ok({ licenses: [licenseDetail], orders: [], trial: null });
    const t = trials.find((x) => x.device_id_hash === h);
    const lic = t?.purchased ? { ...licenseDetail, conflict: false, activations: [{ ...activation("act-t", h, "Laptop-Thu"), created_at: t.ends_at - 2 * DAY }] } : undefined;
    return ok({ licenses: lic ? [lic] : [], orders: [], trial: t ? { started_at: t.started_at, ends_at: t.ends_at, last_seen_at: t.last_seen_at } : null });
  }
  return ok({ error: "invalid_request", field: "email|order_code|device_id_hash" }, 400);
}

interface Reply {
  status: number;
  body: unknown;
}
const ok = (body: unknown, status = 200): Reply => ({ status, body });

function respond(method: string, url: URL, body: Record<string, unknown>): Reply {
  const path = url.pathname;
  if (method === "POST") {
    if (path === "/admin/lookup") return lookupReply(body);
    if (path === "/admin/keys/test-sign") return ok(keyCheck);
    if (path === "/admin/erase") return ok(erased);
    if (path === "/admin/payos/confirm-webhook") return ok({ ok: true, webhook_url: "https://api.aitranslator.io.vn/v1/webhooks/payos" });
    if (path === "/admin/licenses") return ok(issued, 201);
    if (/^\/admin\/orders\/\d+\/(grant|resolve)$/.test(path)) return ok({ ...issued, order_code: 1000014, status: "paid" });
    if (/\/extend$/.test(path)) return ok({ license_id: LIC, expires_at: NOW + 395 * DAY });
    if (/\/reset-quota$/.test(path)) return ok({ activation_id: "act-1", quota_epoch: 1 });
    return ok({ ok: true });
  }
  switch (path) {
    case "/admin/whoami":
      return ok({ operator: "ops@aitranslator.io.vn" });
    case "/admin/summary":
      return ok(summary);
    case "/admin/stats":
      return ok(stats);
    case "/admin/queue":
      return ok(queue);
    case "/admin/alerts":
      return ok(alertsFull);
    case "/admin/releases":
      return ok(releasesFull);
    default:
      if (/^\/admin\/(orders|licenses|trials|audit)$/.test(path)) return listReply(path, url) ?? ok({ error: "not_found" }, 404);
      if (/^\/admin\/orders\/\d+\/payment-status$/.test(path)) return ok(payment);
      return ok({ error: "not_found" }, 404);
  }
}

export function fakeAdminApi(): Plugin {
  return {
    name: "fake-admin-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://dev");
        if (!url.pathname.startsWith("/admin/")) {
          // Mở trang (HTML): ghi `__fake` của địa chỉ trang vào cookie để các lần gọi API sau đọc; không có thì xóa.
          if (req.headers.accept?.includes("text/html")) {
            const m = url.searchParams.get("__fake");
            res.setHeader("set-cookie", m ? `__fake=${encodeURIComponent(m)}; Path=/; SameSite=Strict` : "__fake=; Path=/; Max-Age=0");
          }
          return next();
        }
        // Trạng thái khó tạo, theo `__fake` của trang (cookie ở trên): cho GET của bốn danh sách và cho tra cứu.
        const mode = /(?:^|;\s*)__fake=([^;]*)/.exec(req.headers.cookie ?? "")?.[1];
        const isLookup = req.method === "POST" && url.pathname === "/admin/lookup";
        const list = (req.method === "GET" && /^\/admin\/(orders|licenses|trials|audit)$/.test(url.pathname)) || isLookup;
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          let body: Record<string, unknown> = {};
          try {
            body = chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>) : {};
          } catch {
            body = {};
          }
          const reply =
            list && mode === "error"
              ? ok({ error: "internal" }, 500)
              : list && mode === "empty"
                ? ok(isLookup ? { licenses: [], orders: [] } : { items: [], next_cursor: null })
                : isLookup && mode === "bad"
                  ? ok({ error: "invalid_request", field: "license_key" }, 400)
                  : respond(req.method ?? "GET", url, body);
          const send = () => {
            res.statusCode = reply.status;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(reply.body));
          };
          if (list && mode === "slow") setTimeout(send, 30_000);
          else send();
        });
      });
    },
  };
}
