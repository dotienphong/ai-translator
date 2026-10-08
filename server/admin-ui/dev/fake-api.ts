// API giả cho `pnpm dev` (apply: "serve": chỉ dev server). Không có trong bản build, không chạy trên Worker.
// Dữ liệu mẫu cố định đủ để xem mọi màn hình, hình dạng khớp hợp đồng API thật (src/api/types.ts); bộ lọc và
// phân trang của server không được giả lập. Thao tác ghi trả thành công giả. Không dùng email, key hay hash thật.
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

const licenseDetail: LicenseDetail = {
  id: LIC,
  license_key: KEY,
  email: EMAIL,
  plan: "yearly",
  expires_at: NOW + 365 * DAY,
  created_at: NOW - DAY,
  revoked_at: null,
  locked_at: null,
  conflict: true,
  activations: [activation("act-1", DEVICE_A, "MacBook-Phong"), activation("act-2", DEVICE_B, "DESKTOP-ABC")],
  audit: [
    { at: NOW - 3600, actor: "api", action: "license_activated", order_code: null, detail: '{"allow_conflict":true}' },
    { at: NOW - DAY, actor: "webhook", action: "license_issued", order_code: 1000012, detail: null },
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
const page = <T>(items: T[]): Page<T> => ({ items, next_cursor: null });

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

const trial: TrialRow = { device_id_hash: DEVICE_A, started_at: NOW - 12 * DAY, ends_at: NOW - 2 * DAY, last_seen_at: NOW - DAY, purchased: true };
const auditRow: AuditRow = { id: 2, at: NOW - 3600, actor: "api", action: "license_activated", license_id: LIC, order_code: null, detail: null };

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

interface Reply {
  status: number;
  body: unknown;
}
const ok = (body: unknown, status = 200): Reply => ({ status, body });

function respond(method: string, url: URL): Reply {
  const path = url.pathname;
  if (method === "POST") {
    if (path === "/admin/lookup") return ok(lookup);
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
    case "/admin/orders":
      return ok(page([order(1000015, "underpaid"), order(1000014, "paid_needs_review"), order(1000012, "paid")]));
    case "/admin/licenses":
      return ok(page([licenseRow]));
    case "/admin/trials":
      return ok(page([trial]));
    case "/admin/audit": {
      // Giả lập một lỗi lọc để xem giao diện lỗi: thử `actor=bad`.
      const actor = url.searchParams.get("actor");
      if (actor && !ACTORS.includes(actor)) return ok({ error: "invalid_request", field: "actor" }, 400);
      return ok(page([auditRow]));
    }
    default:
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
        if (!url.pathname.startsWith("/admin/")) return next();
        const { status, body } = respond(req.method ?? "GET", url);
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(body));
      });
    },
  };
}
