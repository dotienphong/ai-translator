// API giả cho `pnpm dev` (apply: "serve": chỉ dev server). Không có trong bản build, không chạy trên Worker.
// Dữ liệu mẫu cố định đủ để xem mọi màn hình, hình dạng khớp hợp đồng API thật (src/api/types.ts); bộ lọc và
// phân trang của server không được giả lập. Thao tác ghi trả thành công giả. Không dùng email, key hay hash thật.
import type { Plugin } from "vite";
import type {
  Activation,
  AlertRow,
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
const summary: Summary = { revenue_today: 550000, currency: "VND", paid_orders_7d: 12, active_licenses: 87 };
const payment: PaymentStatus = { orderCode: 1000012, status: "paid", amount: 500000, amountPaid: 500000, paidAt: NOW - DAY };

const group = <T>(items: T[]): QueueGroup<T> => ({ count: items.length, items });
const page = <T>(items: T[]): Page<T> => ({ items, next_cursor: null });

const alert: AlertRow = { kind: "webhook_bad_signature", window_start: NOW - 1800, count: 3, notified_count: 0 };
const queue: Queue = {
  needs_review: group([order(1000014, "paid_needs_review")]),
  underpaid: group([order(1000015, "underpaid")]),
  email_failed: group([]),
  locked: group([]),
  conflict: group([licenseRow]),
  alerts: group([alert]),
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
