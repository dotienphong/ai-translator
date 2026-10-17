// Một hàm có kiểu cho mỗi route của Worker admin.
import { call } from "./client";
import type {
  AlertsResponse,
  AuditRow,
  DeletedReports,
  EraseResult,
  ErrorGroup,
  ErrorReport,
  ErrorReportDetail,
  GroupKind,
  IssuedLicense,
  KeyCheck,
  LicenseRow,
  LookupResult,
  OrderRow,
  OrderCurrency,
  Page,
  PaymentStatus,
  PlanCode,
  Queue,
  ReleasesResponse,
  ReportKind,
  Stats,
  Summary,
  TrialRow,
} from "./types";

export type LookupQuery =
  | { email: string }
  | { order_code: number }
  | { license_key: string }
  | { license_id: string }
  | { device_id_hash: string };

export type Filters = Record<string, string | undefined>;

/** Bộ lọc của /admin/audit: `actor` chỉ nhận giá trị cố định (server từ chối email, spec §3.2). */
export type AuditFilters = {
  actor?: "api" | "webhook" | "reconcile" | "admin";
  action?: string;
  order_code?: string;
  from?: string;
  to?: string;
  include_views?: "1";
  cursor?: string;
};

/** Bộ lọc của /admin/error-groups: `kind` không có `manual` (báo cáo gửi tay không thuộc nhóm nào); mặc định server ẩn báo cáo debug. */
export type ErrorGroupFilters = {
  kind?: GroupKind;
  app_version?: string;
  include_debug?: "1";
  cursor?: string;
};

/** Bộ lọc của /admin/error-reports: `report` là mã báo cáo viết hoa, `device` là mã máy 64 hex, `fingerprint` là 16 hex. */
export type ErrorReportFilters = {
  kind?: ReportKind;
  fingerprint?: string;
  device?: string;
  report?: string;
  include_debug?: "1";
  cursor?: string;
};

export function queryString(params: Filters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

const seg = encodeURIComponent;

export const api = {
  whoami: () => call<{ operator: string }>("GET", "/admin/whoami"),
  lookup: (q: LookupQuery) => call<LookupResult>("POST", "/admin/lookup", q),
  queue: () => call<Queue>("GET", "/admin/queue"),
  summary: () => call<Summary>("GET", "/admin/summary"),
  stats: (currency?: OrderCurrency) => call<Stats>("GET", `/admin/stats${queryString({ currency })}`),
  alerts: () => call<AlertsResponse>("GET", "/admin/alerts"),
  releases: () => call<ReleasesResponse>("GET", "/admin/releases"),
  orders: (f: Filters) => call<Page<OrderRow>>("GET", `/admin/orders${queryString(f)}`),
  licenses: (f: Filters) => call<Page<LicenseRow>>("GET", `/admin/licenses${queryString(f)}`),
  trials: (f: Filters) => call<Page<TrialRow>>("GET", `/admin/trials${queryString(f)}`),
  audit: (f: AuditFilters) => call<Page<AuditRow>>("GET", `/admin/audit${queryString(f)}`),
  errorGroups: (f: ErrorGroupFilters) => call<Page<ErrorGroup>>("GET", `/admin/error-groups${queryString(f)}`),
  errorReports: (f: ErrorReportFilters) => call<Page<ErrorReport>>("GET", `/admin/error-reports${queryString(f)}`),
  errorReport: (id: string) => call<ErrorReportDetail>("GET", `/admin/error-reports/${seg(id)}`),
  deleteErrorReport: (id: string) => call<DeletedReports>("POST", "/admin/error-reports/delete", { id }),
  deleteErrorGroup: (fingerprint: string) => call<DeletedReports>("POST", "/admin/error-reports/delete", { fingerprint }),
  paymentStatus: (code: number) => call<PaymentStatus>("GET", `/admin/orders/${code}/payment-status`),
  grantOrder: (code: number, note: string) => call<IssuedLicense>("POST", `/admin/orders/${code}/grant`, { note }),
  resolveOrder: (code: number, action: "grant_new_license" | "refunded", note: string) =>
    call<{ order_code: number; status: string; license_key?: string }>("POST", `/admin/orders/${code}/resolve`, { action, note }),
  issueLicense: (email: string, plan: PlanCode, note: string) =>
    call<IssuedLicense>("POST", "/admin/licenses", { email, plan, note }),
  extend: (id: string, days: number, note: string) =>
    call<{ license_id: string; expires_at: number }>("POST", `/admin/licenses/${seg(id)}/extend`, { days, note }),
  /**
   * Rút ngắn hạn `days` ngày. `expectedExpiresAt`: hạn đang hiển thị; server trả 409 `conflict` nếu hạn đã đổi (giao diện cũ,
   * hay bấm gửi lại sau lỗi mạng mà lần trước đã ghi), nên không bao giờ trừ hai lần. `orderCode`: đơn đã hoàn mà lần rút này lấy
   * lại phần thời gian của nó (phải thuộc license); không có thì body không mang khóa này.
   */
  shorten: (id: string, days: number, note: string, expectedExpiresAt: number, orderCode?: number) =>
    call<{ license_id: string; expires_at: number }>("POST", `/admin/licenses/${seg(id)}/shorten`, {
      days,
      note,
      expected_expires_at: expectedExpiresAt,
      ...(orderCode === undefined ? {} : { order_code: orderCode }),
    }),
  unlock: (id: string, note: string) => call<{ ok: true }>("POST", `/admin/licenses/${seg(id)}/unlock`, { note }),
  revoke: (id: string, note: string) => call<{ ok: true }>("POST", `/admin/licenses/${seg(id)}/revoke`, { note }),
  resend: (id: string) => call<{ ok: true }>("POST", `/admin/licenses/${seg(id)}/resend`, {}),
  deactivate: (activationId: string, note: string) =>
    call<{ ok: true }>("POST", `/admin/activations/${seg(activationId)}/deactivate`, { note }),
  resetQuota: (activationId: string, note: string) =>
    call<{ activation_id: string; quota_epoch: number }>("POST", `/admin/activations/${seg(activationId)}/reset-quota`, { note }),
  testSign: () => call<KeyCheck>("POST", "/admin/keys/test-sign", {}),
  erase: (email: string, note: string) => call<EraseResult>("POST", "/admin/erase", { email, note }),
  confirmWebhook: (url: string) => call<{ ok: true; webhook_url: string }>("POST", "/admin/payos/confirm-webhook", { webhook_url: url }),
};
