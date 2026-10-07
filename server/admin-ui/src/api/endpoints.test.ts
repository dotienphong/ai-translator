import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./endpoints";

// Khóa hình dạng yêu cầu gửi tới Worker admin: method, URL (kể cả mã hóa id và query string) và body JSON.
// Đối chiếu với route thật ở server/src/admin.ts và server/src/admin-read.ts.

const LIC = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const ACT = "7c1d9a7e-0b9e-4f3a-8c1d-5b69a2f1d3c4";
const HASH = "a".repeat(64);
const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";
/** Id có ký tự phải mã hóa trong đường dẫn: "/", khoảng trắng, "?". */
const ODD = "a/b c?d";
const ODD_ENCODED = "a%2Fb%20c%3Fd";

interface Case {
  fn: keyof typeof api;
  run: () => Promise<unknown>;
  method: "GET" | "POST";
  url: string;
  /** Body JSON mong đợi của POST. */
  body?: unknown;
}

const CASES: Case[] = [
  { fn: "whoami", run: () => api.whoami(), method: "GET", url: "/admin/whoami" },
  { fn: "queue", run: () => api.queue(), method: "GET", url: "/admin/queue" },
  { fn: "summary", run: () => api.summary(), method: "GET", url: "/admin/summary" },

  { fn: "lookup", run: () => api.lookup({ email: "khach@example.com" }), method: "POST", url: "/admin/lookup", body: { email: "khach@example.com" } },
  { fn: "lookup", run: () => api.lookup({ order_code: 1000012 }), method: "POST", url: "/admin/lookup", body: { order_code: 1000012 } },
  { fn: "lookup", run: () => api.lookup({ license_key: KEY }), method: "POST", url: "/admin/lookup", body: { license_key: KEY } },
  { fn: "lookup", run: () => api.lookup({ license_id: LIC }), method: "POST", url: "/admin/lookup", body: { license_id: LIC } },
  { fn: "lookup", run: () => api.lookup({ device_id_hash: HASH }), method: "POST", url: "/admin/lookup", body: { device_id_hash: HASH } },

  { fn: "orders", run: () => api.orders({}), method: "GET", url: "/admin/orders" },
  {
    fn: "orders",
    run: () => api.orders({ status: "paid", plan: "", from: "2026-10-01", cursor: "1000005" }),
    method: "GET",
    url: "/admin/orders?status=paid&from=2026-10-01&cursor=1000005",
  },
  { fn: "licenses", run: () => api.licenses({ state: "active", plan: "yearly" }), method: "GET", url: "/admin/licenses?state=active&plan=yearly" },
  { fn: "trials", run: () => api.trials({ state: "ended", cursor: `1790812800_${HASH}` }), method: "GET", url: `/admin/trials?state=ended&cursor=1790812800_${HASH}` },
  {
    fn: "audit",
    run: () =>
      api.audit({
        actor: "admin",
        action: "license_revoked",
        order_code: "1000012",
        from: "2026-10-01",
        to: "2026-10-07",
        include_views: "1",
        cursor: "9",
      }),
    method: "GET",
    url: "/admin/audit?actor=admin&action=license_revoked&order_code=1000012&from=2026-10-01&to=2026-10-07&include_views=1&cursor=9",
  },
  { fn: "audit", run: () => api.audit({}), method: "GET", url: "/admin/audit" },
  { fn: "paymentStatus", run: () => api.paymentStatus(1000012), method: "GET", url: "/admin/orders/1000012/payment-status" },

  { fn: "grantOrder", run: () => api.grantOrder(1000012, "chuyển bù"), method: "POST", url: "/admin/orders/1000012/grant", body: { note: "chuyển bù" } },
  {
    fn: "resolveOrder",
    run: () => api.resolveOrder(1000012, "grant_new_license", "cấp key mới"),
    method: "POST",
    url: "/admin/orders/1000012/resolve",
    body: { action: "grant_new_license", note: "cấp key mới" },
  },
  {
    fn: "resolveOrder",
    run: () => api.resolveOrder(1000012, "refunded", "đã hoàn tiền"),
    method: "POST",
    url: "/admin/orders/1000012/resolve",
    body: { action: "refunded", note: "đã hoàn tiền" },
  },
  {
    fn: "issueLicense",
    run: () => api.issueLicense("khach@example.com", "yearly", "cấp tay"),
    method: "POST",
    url: "/admin/licenses",
    body: { email: "khach@example.com", plan: "yearly", note: "cấp tay" },
  },

  { fn: "extend", run: () => api.extend(LIC, 30, "bù ngày"), method: "POST", url: `/admin/licenses/${LIC}/extend`, body: { days: 30, note: "bù ngày" } },
  { fn: "extend", run: () => api.extend(ODD, 1, "x"), method: "POST", url: `/admin/licenses/${ODD_ENCODED}/extend`, body: { days: 1, note: "x" } },
  { fn: "unlock", run: () => api.unlock(LIC, "mở khóa"), method: "POST", url: `/admin/licenses/${LIC}/unlock`, body: { note: "mở khóa" } },
  { fn: "unlock", run: () => api.unlock(ODD, "x"), method: "POST", url: `/admin/licenses/${ODD_ENCODED}/unlock`, body: { note: "x" } },
  { fn: "revoke", run: () => api.revoke(LIC, "hoàn tiền"), method: "POST", url: `/admin/licenses/${LIC}/revoke`, body: { note: "hoàn tiền" } },
  { fn: "revoke", run: () => api.revoke(ODD, "x"), method: "POST", url: `/admin/licenses/${ODD_ENCODED}/revoke`, body: { note: "x" } },
  { fn: "resend", run: () => api.resend(LIC), method: "POST", url: `/admin/licenses/${LIC}/resend`, body: {} },
  { fn: "resend", run: () => api.resend(ODD), method: "POST", url: `/admin/licenses/${ODD_ENCODED}/resend`, body: {} },

  { fn: "deactivate", run: () => api.deactivate(ACT, "đổi máy"), method: "POST", url: `/admin/activations/${ACT}/deactivate`, body: { note: "đổi máy" } },
  { fn: "deactivate", run: () => api.deactivate(ODD, "x"), method: "POST", url: `/admin/activations/${ODD_ENCODED}/deactivate`, body: { note: "x" } },
  { fn: "resetQuota", run: () => api.resetQuota(ACT, "bù quota"), method: "POST", url: `/admin/activations/${ACT}/reset-quota`, body: { note: "bù quota" } },
  { fn: "resetQuota", run: () => api.resetQuota(ODD, "x"), method: "POST", url: `/admin/activations/${ODD_ENCODED}/reset-quota`, body: { note: "x" } },

  { fn: "testSign", run: () => api.testSign(), method: "POST", url: "/admin/keys/test-sign", body: {} },
  {
    fn: "erase",
    run: () => api.erase("khach@example.com", "yêu cầu xóa"),
    method: "POST",
    url: "/admin/erase",
    body: { email: "khach@example.com", note: "yêu cầu xóa" },
  },
  {
    fn: "confirmWebhook",
    run: () => api.confirmWebhook("https://api.aitranslator.io.vn/v1/webhooks/payos"),
    method: "POST",
    url: "/admin/payos/confirm-webhook",
    body: { webhook_url: "https://api.aitranslator.io.vn/v1/webhooks/payos" },
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api: method, URL và body gửi lên", () => {
  it.each(CASES.map((c) => [`${c.fn} ${c.method} ${c.url}`, c] as const))("%s", async (_name, c) => {
    await c.run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(c.url);
    expect(init.method).toBe(c.method);
    if (c.method === "GET") expect(init.body).toBeUndefined();
    else expect(JSON.parse(String(init.body))).toStrictEqual(c.body);
  });

  it("có test cho đủ mọi hàm của api", () => {
    expect(new Set(CASES.map((c) => c.fn))).toEqual(new Set(Object.keys(api)));
    expect(Object.keys(api)).toHaveLength(21);
  });
});
