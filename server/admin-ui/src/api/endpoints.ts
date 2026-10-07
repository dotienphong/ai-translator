// Một hàm có kiểu cho mỗi route của Worker admin.
import { call } from "./client";
import type {
  AuditRow,
  EraseResult,
  IssuedLicense,
  KeyCheck,
  LicenseRow,
  LookupResult,
  OrderRow,
  Page,
  PlanCode,
  Queue,
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
  orders: (f: Filters) => call<Page<OrderRow>>("GET", `/admin/orders${queryString(f)}`),
  licenses: (f: Filters) => call<Page<LicenseRow>>("GET", `/admin/licenses${queryString(f)}`),
  trials: (f: Filters) => call<Page<TrialRow>>("GET", `/admin/trials${queryString(f)}`),
  audit: (f: Filters) => call<Page<AuditRow>>("GET", `/admin/audit${queryString(f)}`),
  paymentStatus: (code: number) => call<Record<string, unknown>>("GET", `/admin/orders/${code}/payment-status`),
  grantOrder: (code: number, note: string) => call<IssuedLicense>("POST", `/admin/orders/${code}/grant`, { note }),
  resolveOrder: (code: number, action: "grant_new_license" | "refunded", note: string) =>
    call<{ order_code: number; status: string; license_key?: string }>("POST", `/admin/orders/${code}/resolve`, { action, note }),
  issueLicense: (email: string, plan: PlanCode, note: string) =>
    call<IssuedLicense>("POST", "/admin/licenses", { email, plan, note }),
  extend: (id: string, days: number, note: string) =>
    call<{ license_id: string; expires_at: number }>("POST", `/admin/licenses/${seg(id)}/extend`, { days, note }),
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
