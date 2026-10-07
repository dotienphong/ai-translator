# Web Admin · 01: Server (Worker admin)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Worker `mt-license-admin` có thêm các API chỉ đọc cho Web Admin (danh sách, việc cần xử lý, số nhanh), tra cứu theo license key và license id, và phục vụ trang SPA qua binding `ASSETS` sau lớp kiểm Access, kèm header bảo mật.

**Kiến trúc:** Tách middleware của `src/admin.ts` sang `src/admin-auth.ts`. Route đọc mới ở `src/admin-read.ts`, phục vụ trang ở `src/admin-assets.ts`; `createAdminApp` ghép cả ba. Mọi route đọc ghi một dòng `audit_log`, chặn GET từ trang khác, không chép email vào nhật ký.

**Công nghệ:** TypeScript, Hono 4 (`hono/secure-headers` có sẵn), Cloudflare Workers, D1, Vitest + `@cloudflare/vitest-plugin`. Không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-10-07-web-admin-design.md` (§2, §3). Tổng quan: `2026-10-07-web-admin-00-tong-quan.md`.

---

## Điều chỉnh so với spec (đã đối chiếu code)

1. **Không có migration `0003`.** Spec §3.3 chỉ thêm index "khi truy vấn danh sách cần". Production mới có vài chục dòng mỗi bảng (đã xóa sạch dữ liệu thử ngày 2026-10-07), quét toàn bảng không đáng kể. Bỏ migration thì đợt triển khai không phải chạy `wrangler d1 migrations apply`. Xét lại ở Phần 2 (Tổng quan).
2. **`/admin/audit` nhận thêm bộ lọc `order_code`.** Trang chi tiết đơn (spec §4.2) cần nhật ký của đơn, mà `lookup` chỉ trả nhật ký theo license; đơn chưa có license (ví dụ `underpaid`) sẽ không có nhật ký nào nếu thiếu bộ lọc này.
3. **Bộ lọc `actor` của `/admin/audit` chỉ nhận `api`, `webhook`, `reconcile`, `admin`** (`admin` khớp `actor LIKE 'admin:%'`), và `action` chỉ nhận `[a-z][a-z0-9_]{0,63}`, để email không vào URL hay `detail` của nhật ký (spec §3). Lọc `action` theo một action xem/tra cứu thì tự hiện lượt xem; `from` lớn hơn `to` là `400`. Quyết định sau review Task 5 (commit `6d32b15`); mã mẫu của Task 5 bên dưới là bản gốc, mã thật theo `6d32b15`.
4. **`/admin/trials`: cột `purchased` dùng `device_id_hash IN (SELECT device_id_hash FROM activations)`** thay cho `EXISTS` tương quan (đo trên workerd: ~100 lần ít dòng đọc hơn, ngữ nghĩa như nhau vì `device_id_hash` NOT NULL).
5. **Mọi phản hồi của Worker admin có `Cache-Control: no-store`** (Task 8): danh sách trả email khách, không để trình duyệt giữ trên đĩa.
4. **Header bảo mật gắn cho mọi phản hồi của Worker admin** (cả JSON), không chỉ phản hồi của `ASSETS`: một middleware chung, đơn giản hơn và không hại gì cho JSON.

## Cấu trúc file

| File | Việc | Trách nhiệm |
|---|---|---|
| `server/src/admin-auth.ts` | Tạo | `AdminDeps`, `AdminAppEnv`, `crossSite`, `useAdminAuth` (Access, danh tính, CSRF, giới hạn body) |
| `server/src/admin.ts` | Sửa | Bỏ phần đã tách; `lookup` thêm `license_key`, `license_id`; ghép header bảo mật, route đọc, trang |
| `server/src/admin-read.ts` | Tạo | `GET /admin/orders`, `/admin/licenses`, `/admin/trials`, `/admin/audit`, `/admin/queue`, `/admin/summary` |
| `server/src/admin-assets.ts` | Tạo | `ADMIN_SECURE_HEADERS`, `registerAssets` (phục vụ SPA qua `ASSETS`) |
| `server/src/license-key.ts` | Sửa | Thêm `maskLicenseKey` |
| `server/src/env.ts` | Sửa | `AdminEnv.ASSETS?: Fetcher` |
| `server/test/admin-harness.ts` | Tạo | `makeAdmin` (+ `adminFetch`), `apiKeyEnv`, `licenseRow`, `auditCount`, `lastAudit`, hằng `ADMIN`, `API_ORIGIN` |
| `server/test/admin.test.ts` | Sửa | Dùng harness; thêm test `lookup` theo key và id |
| `server/test/admin-read.test.ts` | Tạo | Test các route đọc |
| `server/test/admin-assets.test.ts` | Tạo | Test phục vụ trang và header |
| `server/test/license-key.test.ts` | Sửa | Test `maskLicenseKey` |

## Quy ước

- Chạy mọi lệnh trong `server/`. Test một file: `pnpm vitest run test/<file>`. Kiểm kiểu: `pnpm typecheck`.
- Commit kết thúc bằng `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`.
- Không chạy lệnh `wrangler` nào chạm production. `pnpm dry-run` không chạm production.
- Thời điểm là giây Unix. `T0` = 2026-10-01T00:00:00Z = 07:00 ngày 01/10 giờ Việt Nam (`test/world.ts`).

---

## Task 1: Tách middleware của Worker admin sang `admin-auth.ts`

Thuần tái cấu trúc, không đổi hành vi. Toàn bộ test admin hiện có phải qua mà không sửa test.

**Files:**
- Create: `server/src/admin-auth.ts`
- Modify: `server/src/admin.ts:1-91`

- [ ] **Step 1: Chạy test admin để có mốc**

Run: `pnpm vitest run test/admin.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 2: Tạo `server/src/admin-auth.ts`**

```ts
// Lớp kiểm request chung của Worker admin (§6.8 "Công cụ hỗ trợ"), dùng cho mọi route: thao tác (admin.ts), route đọc
// (admin-read.ts) và trang Web Admin (admin-assets.ts). Tách khỏi admin.ts theo spec Web Admin §3.3.
// Worker đặt sau Cloudflare Access ("Protect this Worker") và tự kiểm lại: request không qua Access thì không có
// ctx.access và bị từ chối (403); ngoài test (tức production), ACCESS_AUD là bắt buộc và phải khớp; không đọc được email
// người vận hành từ Access thì cũng 403. Request thay đổi dữ liệu phải là JSON cùng origin (chống CSRF).
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { EmailProvider } from "./email/provider";
import type { AdminEnv } from "./env";
import { fail } from "./http";
import type { PayOSProvider } from "./payment/payos";
import type { PaymentProvider } from "./payment/provider";
import type { KeyCheck } from "./token";

export interface AdminDeps {
  now(): number;
  payments: Record<string, PaymentProvider>;
  payos: Pick<PayOSProvider, "confirmWebhook">;
  email: EmailProvider;
  /** Bảng gói của Worker API cùng môi trường (qua service binding, QĐ34), chưa kiểm. */
  plans(): Promise<unknown>;
  /** Token ký thử bằng khóa dự phòng của Worker API (QĐ31). */
  keyCheck(): Promise<KeyCheck>;
}

export type AdminAppEnv = { Bindings: AdminEnv; Variables: { deps: AdminDeps; actor: string } };

/** Trình duyệt báo request đến từ trang khác (Sec-Fetch-Site không phải same-origin hay none). Không có header thì không chặn (cloudflared). */
export function crossSite(c: Context): boolean {
  const site = c.req.header("sec-fetch-site");
  return site !== undefined && site !== "same-origin" && site !== "none";
}

/** Gắn cho mọi route của `app`: kiểm Access và danh tính, chống CSRF, giới hạn body 16 KiB. */
export function useAdminAuth(app: Hono<AdminAppEnv>, makeDeps: (env: AdminEnv) => AdminDeps): void {
  app.use("*", async (c, next) => {
    const access = (c.executionCtx as ExecutionContext).access;
    const audRequired = c.env.ENVIRONMENT !== "test";
    if (!access || (audRequired && !c.env.ACCESS_AUD) || (c.env.ACCESS_AUD && access.aud !== c.env.ACCESS_AUD)) {
      return fail(c, 403, "forbidden");
    }
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (crossSite(c) || (origin && origin !== new URL(c.req.url).origin)) {
        return fail(c, 403, "forbidden");
      }
      if (!/^application\/json\s*(;|$)/i.test(c.req.header("content-type") ?? "")) {
        return fail(c, 415, "unsupported_media_type");
      }
    }
    // Không đọc được email người vận hành (Access lỗi, service token không có email…) thì từ chối: nhật ký phải có danh tính.
    let email: unknown;
    try {
      email = (await access.getIdentity())?.email;
    } catch {
      email = undefined;
    }
    if (typeof email !== "string" || email === "") return fail(c, 403, "forbidden");
    c.set("actor", `admin:${email}`);
    c.set("deps", makeDeps(c.env));
    await next();
  });
  app.use("*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => fail(c, 413, "invalid_request") }));
}
```

- [ ] **Step 3: Sửa đầu `server/src/admin.ts`**

Thay khối chú thích đầu file, khối import, `interface AdminDeps`, `type AdminAppEnv`, hàm `crossSite` và hai `app.use(...)` đầu tiên trong `createAdminApp` (dòng 1–91 hiện tại) bằng:

```ts
// Worker admin (§6.8 "Công cụ hỗ trợ"): các thao tác của người vận hành và `lookup`. Lớp kiểm Access, danh tính và chống
// CSRF ở admin-auth.ts; route chỉ đọc ở admin-read.ts; trang Web Admin ở admin-assets.ts.
// Mọi thao tác, kể cả tra cứu, đều ghi audit_log với actor "admin:<email người vận hành>". Thao tác thất bại có ý nghĩa
// (cổng thanh toán lỗi, ký thử lỗi, URL webhook bị từ chối, 409) cũng ghi, không kèm câu lỗi gốc. Không ghi: whoami
// (chỉ trả email của chính người vận hành), request không qua Access hay chống CSRF, và các request sai input hay không
// tìm thấy khác (400, 404).
import { type Context, Hono } from "hono";
import { type AdminAppEnv, type AdminDeps, crossSite, useAdminAuth } from "./admin-auth";
import { audit, auditIfChanged, auditStatement } from "./audit";
import { sendLicenseMail } from "./deps";
import type { AdminEnv } from "./env";
import { fail, isRecord, parseDeviceIdHash, parseEmail, readJson } from "./http";
import { formatLicenseKey, generateLicenseKey } from "./license-key";
import { grantOrder, loadOrder, mailGranted, settledResult } from "./orders";
import { PaymentProviderError } from "./payment/provider";
import { computeGrant, isPlan, PLAN_NAMES, type PlanTable, parsePlans } from "./plans";
import type { KeyCheck } from "./token";

export type { AdminDeps } from "./admin-auth";

function parseNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const note = v.trim();
  return note.length > 0 && note.length <= 500 ? note : null;
}

export function createAdminApp(makeDeps: (env: AdminEnv) => AdminDeps) {
  const app = new Hono<AdminAppEnv>();
  useAdminAuth(app, makeDeps);
```

Giữ nguyên mọi dòng từ `/** Bảng gói lấy từ Worker API; thiếu hay sai thì null (route trả 503 pricing_not_configured). */` trở xuống. Trong import cũ có `type PlanCode`, `bodyLimit`, `EmailProvider`, `PayOSProvider`, `type PaymentProvider`; bản mới bỏ những cái không còn dùng. Nếu `pnpm typecheck` báo thiếu tên nào (ví dụ `PlanCode`) thì thêm lại đúng tên đó vào import.

- [ ] **Step 4: Kiểm kiểu và chạy lại test**

Run: `pnpm typecheck && pnpm vitest run test/admin.test.ts`
Expected: không lỗi kiểu; PASS toàn bộ, số test như Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/admin-auth.ts src/admin.ts
git commit -m "refactor(admin): tách middleware Access, CSRF sang admin-auth.ts (Web Admin §3.3)"
```

---

## Task 2: Tách bộ dựng test admin sang `test/admin-harness.ts`

Các file test mới (Task 4–8) cần `makeAdmin`. Thêm `adminFetch` trả `Response` gốc để test trang và header.

**Files:**
- Create: `server/test/admin-harness.ts`
- Modify: `server/test/admin.test.ts:1-81`

- [ ] **Step 1: Tạo `server/test/admin-harness.ts`**

```ts
// Bộ dựng test cho Worker admin: app admin dùng đồng hồ, PayOS và Resend giả của makeWorld; Access giả qua ctx.access.
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createAdminApp } from "../src/admin";
import { signKeyCheck } from "../src/deps";
import type { AdminEnv, ApiEnv } from "../src/env";
import { PayOSProvider } from "../src/payment/payos";
import type { KeyCheck } from "../src/token";
import { TEST_CHECKSUM_KEY } from "./fakes";
import { testSigningJwk } from "./keys";
import { makeWorld } from "./world";

export const ADMIN = "https://admin.test";
export const API_ORIGIN = "https://mt-license.example.workers.dev";

export interface AdminCall {
  method?: string;
  body?: unknown;
  /** null: request không đi qua Access (không có ctx.access). */
  operator?: string | null;
  aud?: string;
  headers?: Record<string, string>;
  rawBody?: string;
  /** Thay getIdentity() của Access (mặc định trả `{ email: operator }`). */
  getIdentity?: () => Promise<unknown>;
}

/** Môi trường của Worker API với hai khóa test của vector: ô A (test-1) đang ký, ô B (test-2) dự phòng. */
export async function apiKeyEnv(): Promise<ApiEnv> {
  return { ...env, TOKEN_SIGNING_KEY_A: await testSigningJwk("test-1"), TOKEN_SIGNING_KEY_B: await testSigningJwk("test-2") };
}

export interface AdminOpts {
  /** Thay cho service binding API.plans() (mặc định: biến PLANS của Worker API trong test). */
  plans?: () => Promise<unknown>;
  keyCheck?: () => Promise<KeyCheck>;
}

export function makeAdmin(adminEnv: Partial<AdminEnv> = {}, opts: AdminOpts = {}) {
  const w = makeWorld();
  const payos = new PayOSProvider(
    { baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: TEST_CHECKSUM_KEY },
    w.payos.fetch,
  );
  const admin = createAdminApp(() => ({
    now: () => w.clock.now,
    payments: { payos },
    payos,
    email: w.deps.email,
    plans: opts.plans ?? (async () => env.PLANS),
    keyCheck: opts.keyCheck ?? (async () => signKeyCheck(await apiKeyEnv(), w.clock.now)),
  }));
  const fullEnv = { ...env, API_ORIGIN, ...adminEnv } as AdminEnv;

  /** Gọi Worker admin, trả Response gốc (để đọc header, trang HTML). */
  async function adminFetch(path: string, opts: AdminCall = {}): Promise<Response> {
    const { method = opts.body === undefined && opts.rawBody === undefined ? "GET" : "POST", operator = "ops@example.com", aud = "aud-1" } = opts;
    const ctx = createExecutionContext();
    if (operator !== null) {
      Object.defineProperty(ctx, "access", { value: { aud, getIdentity: opts.getIdentity ?? (async () => ({ email: operator })) } });
    }
    const headers: Record<string, string> = method === "GET" ? {} : { "content-type": "application/json" };
    const init: RequestInit = { method, headers: { ...headers, ...opts.headers } };
    if (opts.rawBody !== undefined) init.body = opts.rawBody;
    else if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    const res = await admin.fetch(new Request(`${ADMIN}${path}`, init), fullEnv, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }

  async function adminCall(path: string, opts: AdminCall = {}) {
    const res = await adminFetch(path, opts);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }
  return { w, adminCall, adminFetch };
}

export const licenseRow = () => env.DB.prepare("SELECT * FROM licenses").first<Record<string, unknown>>();
export const auditCount = async (action: string) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = ?").bind(action).first<{ n: number }>())?.n;
export const lastAudit = () => env.DB.prepare("SELECT actor, action, order_code, detail FROM audit_log ORDER BY id DESC LIMIT 1").first();
```

- [ ] **Step 2: Sửa đầu `server/test/admin.test.ts`**

Thay dòng 1–81 (từ các import tới hết `const lastAudit = …`) bằng:

```ts
import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { AdminRpc } from "../src/admin-rpc";
import { sha256Hex } from "../src/crypto";
import { signKeyCheck } from "../src/deps";
import { verifyToken } from "../src/token";
import { ADMIN, type AdminCall, API_ORIGIN, apiKeyEnv, auditCount, lastAudit, licenseRow, makeAdmin } from "./admin-harness";
import { resetDb, withFailingInsert } from "./db";
import vectors from "./vectors/token-v1.json";
import { DAY, T0 } from "./world";

beforeEach(resetDb);
```

- [ ] **Step 3: Kiểm kiểu và chạy test**

Run: `pnpm typecheck && pnpm vitest run test/admin.test.ts`
Expected: không lỗi kiểu; PASS, số test như Task 1.

- [ ] **Step 4: Commit**

```bash
git add test/admin-harness.ts test/admin.test.ts
git commit -m "test(admin): tách makeAdmin sang admin-harness.ts, thêm adminFetch"
```

---

## Task 3: `maskLicenseKey`

**Files:**
- Modify: `server/src/license-key.ts`
- Test: `server/test/license-key.test.ts`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `server/test/license-key.test.ts` (sửa dòng import `../src/license-key` để có thêm `maskLicenseKey`, giữ các tên đang import):

```ts
describe("maskLicenseKey (Web Admin §3.2)", () => {
  it("giữ 4 ký tự đầu và 4 ký tự cuối, che phần giữa", () => {
    const key = generateLicenseKey();
    expect(maskLicenseKey(key)).toBe(`${key.slice(0, 4)}-…-${key.slice(-4)}`);
  });

  it("nhận cả dạng có gạch nối", () => {
    const key = generateLicenseKey();
    expect(maskLicenseKey(formatLicenseKey(key))).toBe(maskLicenseKey(key));
  });
});
```

Nếu file chưa import `describe`, `generateLicenseKey` hay `formatLicenseKey` thì thêm vào import.

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run test/license-key.test.ts`
Expected: FAIL, `maskLicenseKey` không được export.

- [ ] **Step 3: Viết code**

Thêm vào cuối `server/src/license-key.ts`:

```ts
/** Key dạng che cho danh sách của Web Admin: 4 ký tự đầu, "-…-", 4 ký tự cuối. Nhận dạng lưu trữ hay dạng có gạch nối. */
export function maskLicenseKey(key: string): string {
  const raw = key.replace(/-/g, "");
  return `${raw.slice(0, 4)}-…-${raw.slice(-4)}`;
}
```

- [ ] **Step 4: Chạy test, thấy qua**

Run: `pnpm vitest run test/license-key.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/license-key.ts test/license-key.test.ts
git commit -m "feat(admin): maskLicenseKey cho danh sách Web Admin"
```

---

## Task 4: `lookup` theo `license_key` và `license_id`

**Files:**
- Modify: `server/src/admin.ts` (route `POST /admin/lookup`)
- Test: `server/test/admin.test.ts` (describe "tra cứu, gửi lại key")

- [ ] **Step 1: Viết test thất bại**

Thêm vào trong `describe("tra cứu, gửi lại key", …)` của `server/test/admin.test.ts`, và thêm `import { formatLicenseKey, generateLicenseKey } from "../src/license-key";` vào đầu file:

```ts
  it("tra theo license key (có/không gạch nối, chữ thường) và theo license id; nhật ký không có key", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode, licenseKey } = await w.buy({ email: "buyer@example.com" });
    const raw = licenseKey.replace(/-/g, "");
    for (const key of [licenseKey, raw, licenseKey.toLowerCase()]) {
      const res = await adminCall("/admin/lookup", { body: { license_key: key } });
      expect(res.status, key).toBe(200);
      expect((res.body.licenses as Record<string, unknown>[]).map((l) => l.license_key)).toEqual([licenseKey]);
      expect((res.body.orders as Record<string, unknown>[]).map((o) => o.order_code)).toEqual([orderCode]);
      const log = await lastAudit();
      expect(log).toMatchObject({ action: "lookup", order_code: null });
      expect(JSON.parse((log as { detail: string }).detail)).toEqual({ by: "license_key", licenses: 1, orders: 1 });
      expect((log as { detail: string }).detail).not.toContain(raw.slice(4, -4));
    }
    const id = (await licenseRow())!.id as string;
    const byId = await adminCall("/admin/lookup", { body: { license_id: id } });
    expect(byId.body).toMatchObject({ licenses: [{ id, license_key: licenseKey }], orders: [{ order_code: orderCode }] });
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({ by: "license_id", licenses: 1, orders: 1 });
  });

  it("tra theo license: có cả đơn gia hạn (renew_license_id); key hay id không có thì rỗng; sai định dạng thì 400", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ email: "buyer@example.com" });
    const renew = await w.call("POST", "/v1/checkout", { plan: "yearly", email: "buyer@example.com", consent: true, license_key: licenseKey });
    const res = await adminCall("/admin/lookup", { body: { license_key: licenseKey } });
    expect((res.body.orders as Record<string, unknown>[]).map((o) => o.order_code)).toEqual([1, renew.body.order_code]);
    expect(await adminCall("/admin/lookup", { body: { license_key: formatLicenseKey(generateLicenseKey()) } })).toEqual({
      status: 200,
      body: { licenses: [], orders: [] },
    });
    expect((await adminCall("/admin/lookup", { body: { license_id: crypto.randomUUID() } })).body).toEqual({ licenses: [], orders: [] });
    expect(await adminCall("/admin/lookup", { body: { license_key: "ABCD-1234" } })).toMatchObject({ status: 400, body: { field: "license_key" } });
    expect(await adminCall("/admin/lookup", { body: { license_key: 42 } })).toMatchObject({ status: 400, body: { field: "license_key" } });
    expect(await adminCall("/admin/lookup", { body: { license_id: "khong-phai-uuid" } })).toMatchObject({ status: 400, body: { field: "license_id" } });
  });
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run test/admin.test.ts -t "tra theo license"`
Expected: FAIL, nhận `400` với `field: "email|order_code|device_id_hash"`.

- [ ] **Step 3: Viết code**

Trong `server/src/admin.ts`:

1. Sửa import: `import { formatLicenseKey, generateLicenseKey, normalizeLicenseKey } from "./license-key";` và thêm `parseUuid` vào import từ `./http`.
2. Đổi khai báo `let by: "email" | "order_code" | "device";` thành `let by: "email" | "order_code" | "device" | "license_key" | "license_id";`.
3. Thêm hai nhánh ngay sau khối `if (body?.device_id_hash !== undefined) { … }`, trước `} else if (body?.email !== undefined) {`:

```ts
    } else if (body?.license_key !== undefined) {
      const key = typeof body.license_key === "string" ? normalizeLicenseKey(body.license_key) : null;
      if (!key) return fail(c, 400, "invalid_request", { field: "license_key" });
      by = "license_key";
      const found = await db.prepare("SELECT id FROM licenses WHERE license_key = ?").bind(key).first<{ id: string }>();
      if (found) ({ licenseIds, orders } = await licenseWithOrders(db, found.id));
    } else if (body?.license_id !== undefined) {
      const id = parseUuid(body.license_id);
      if (!id) return fail(c, 400, "invalid_request", { field: "license_id" });
      by = "license_id";
      const found = await db.prepare("SELECT id FROM licenses WHERE id = ?").bind(id).first<{ id: string }>();
      if (found) ({ licenseIds, orders } = await licenseWithOrders(db, found.id));
```

4. Thêm hàm này ngay trên `export function createAdminApp`:

```ts
/** Một license và mọi đơn đã áp hay đang áp vào nó (license_id hoặc renew_license_id), cho `lookup` theo key hay id. */
async function licenseWithOrders(db: D1Database, id: string) {
  const orders = (
    await db.prepare("SELECT * FROM orders WHERE license_id = ?1 OR renew_license_id = ?1 ORDER BY order_code").bind(id).all()
  ).results;
  return { licenseIds: [id], orders };
}
```

Nhánh cuối (`else { return fail(…, { field: "email|order_code|device_id_hash" }) }`) giữ nguyên chữ `field` để không đổi hợp đồng cũ. Vòng lặp sau đó đã bỏ `order_token_hash` và gom license từ các đơn, nên đơn gia hạn trỏ cùng license không bị lặp license.

- [ ] **Step 4: Chạy test, thấy qua**

Run: `pnpm typecheck && pnpm vitest run test/admin.test.ts`
Expected: PASS toàn bộ (kể cả hai test mới).

- [ ] **Step 5: Commit**

```bash
git add src/admin.ts test/admin.test.ts
git commit -m "feat(admin): lookup theo license_key và license_id (Web Admin §3.1)"
```

---

## Task 5: `admin-read.ts`: khung danh sách, `GET /admin/orders`, `GET /admin/audit`

**Files:**
- Create: `server/src/admin-read.ts`
- Modify: `server/src/admin.ts` (gọi `registerAdminRead`)
- Test: `server/test/admin-read.test.ts`

- [ ] **Step 1: Viết test thất bại**

Tạo `server/test/admin-read.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { lastAudit, makeAdmin } from "./admin-harness";
import { resetDb } from "./db";
import { DAY, T0 } from "./world";

beforeEach(resetDb);

type Page = { items: Record<string, unknown>[]; next_cursor: string | null };

/** Tạo `n` đơn pending (checkout), email khác nhau. */
async function checkouts(w: ReturnType<typeof makeAdmin>["w"], n: number, plan = "monthly") {
  for (let i = 0; i < n; i++) {
    const r = await w.call("POST", "/v1/checkout", { plan, email: `k${i}@example.com`, consent: true }, { "cf-connecting-ip": `198.51.100.${i + 1}` });
    if (r.status !== 201) throw new Error(`checkout ${r.status}`);
  }
}

/** Đọc hết mọi trang của một danh sách theo next_cursor. */
async function allPages(adminCall: ReturnType<typeof makeAdmin>["adminCall"], path: string) {
  const seen: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const res = await adminCall(cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path);
    expect(res.status).toBe(200);
    const page = res.body as unknown as Page;
    seen.push(...page.items);
    cursor = page.next_cursor;
    pages++;
  } while (cursor);
  return { seen, pages };
}

describe("GET /admin/orders", () => {
  it("mới nhất trước, 50 dòng mỗi trang, con trỏ không trùng không sót", async () => {
    const { w, adminCall } = makeAdmin();
    await checkouts(w, 55);
    const first = (await adminCall("/admin/orders")).body as unknown as Page;
    expect(first.items).toHaveLength(50);
    expect(first.items[0]).toMatchObject({ order_code: 55, status: "pending", plan: "monthly", email: "k54@example.com" });
    expect(first.items[0]).not.toHaveProperty("order_token_hash");
    expect(first.next_cursor).toBe("6");
    const { seen, pages } = await allPages(adminCall, "/admin/orders");
    expect(pages).toBe(2);
    expect(seen.map((o) => o.order_code)).toEqual(Array.from({ length: 55 }, (_, i) => 55 - i));
  });

  it("lọc theo status, plan, khoảng ngày tạo (GMT+7, `to` tính hết ngày)", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy({ plan: "yearly" }); // đơn 1, paid, 07:00 ngày 01/10 giờ VN
    w.clock.now = T0 + DAY; // 07:00 ngày 02/10
    await checkouts(w, 1); // đơn 2, pending
    const codes = async (q: string) => ((await adminCall(`/admin/orders?${q}`)).body as unknown as Page).items.map((o) => o.order_code);
    expect(await codes("status=paid")).toEqual([1]);
    expect(await codes("plan=monthly")).toEqual([2]);
    expect(await codes("from=2026-10-02")).toEqual([2]);
    expect(await codes("to=2026-10-01")).toEqual([1]);
    expect(await codes("from=2026-10-01&to=2026-10-02")).toEqual([2, 1]);
    expect(await codes("status=")).toEqual([2, 1]);
  });

  it("bộ lọc sai thì 400 kèm field, không ghi nhật ký", async () => {
    const { adminCall } = makeAdmin();
    for (const [q, field] of [
      ["status=xyz", "status"],
      ["plan=pro", "plan"],
      ["from=2026-13-01", "from"],
      ["to=2026-02-30", "to"],
      ["from=01-10-2026", "from"],
      ["cursor=abc", "cursor"],
    ]) {
      expect(await adminCall(`/admin/orders?${q}`), q).toMatchObject({ status: 400, body: { error: "invalid_request", field } });
    }
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first()).toEqual({ n: 0 });
  });

  it("ghi một dòng list_viewed, không chép email; GET từ trang khác thì 403; không qua Access thì 403", async () => {
    const { w, adminCall } = makeAdmin();
    await checkouts(w, 2);
    await adminCall("/admin/orders?status=pending");
    const log = await lastAudit();
    expect(log).toMatchObject({ actor: "admin:ops@example.com", action: "list_viewed" });
    expect(JSON.parse((log as { detail: string }).detail)).toEqual({ resource: "orders", filters: { status: "pending" }, count: 2 });
    expect((log as { detail: string }).detail).not.toContain("@");
    for (const site of ["cross-site", "same-site"]) {
      expect((await adminCall("/admin/orders", { headers: { "sec-fetch-site": site } })).status).toBe(403);
    }
    expect((await adminCall("/admin/orders", { operator: null })).status).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'list_viewed'").first()).toEqual({ n: 1 });
  });
});

describe("GET /admin/audit", () => {
  it("mới nhất trước; mặc định ẩn các dòng xem và tra cứu; include_views=1 thì hiện", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    await adminCall("/admin/lookup", { body: { email: "buyer@example.com" } });
    const actions = async (q = "") => ((await adminCall(`/admin/audit${q}`)).body as unknown as Page).items.map((a) => a.action);
    const plain = await actions();
    expect(plain).not.toContain("lookup");
    expect(plain).not.toContain("list_viewed");
    expect(plain).toContain("license_issued");
    const all = await actions("?include_views=1");
    expect(all.slice(0, 2)).toEqual(["list_viewed", "lookup"]);
  });

  it("lọc theo action, actor, order_code, ngày; actor admin ghi vào nhật ký là admin:…", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode } = await w.buy();
    const id = (await env.DB.prepare("SELECT id FROM licenses").first<{ id: string }>())!.id;
    await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 1, note: "bù" } });
    const page = async (q: string) => ((await adminCall(`/admin/audit?${q}`)).body as unknown as Page).items;
    expect((await page("action=license_extended_manually")).map((a) => a.actor)).toEqual(["admin:ops@example.com"]);
    expect((await page(`actor=${encodeURIComponent("admin:ops@example.com")}`)).map((a) => a.action)).toEqual(["license_extended_manually"]);
    expect((await page(`order_code=${orderCode}`)).every((a) => a.order_code === orderCode)).toBe(true);
    expect((await page(`order_code=${orderCode}`)).length).toBeGreaterThan(0);
    expect(await page("from=2026-10-02")).toEqual([]);
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toMatchObject({ resource: "audit", filters: { from: "2026-10-02" } });
    await adminCall(`/admin/audit?actor=${encodeURIComponent("admin:ops@example.com")}`);
    const detail = (await lastAudit() as { detail: string }).detail;
    expect(JSON.parse(detail)).toMatchObject({ filters: { actor: "admin:…" } });
    expect(detail).not.toContain("@");
    expect(await adminCall("/admin/audit?order_code=abc")).toMatchObject({ status: 400, body: { field: "order_code" } });
  });

  it("phân trang theo id", async () => {
    const { adminCall } = makeAdmin();
    await env.DB.batch(
      Array.from({ length: 60 }, (_, i) =>
        env.DB.prepare("INSERT INTO audit_log (at, actor, action) VALUES (?, 'api', 'thu')").bind(T0 + i),
      ),
    );
    const { seen, pages } = await allPages(adminCall, "/admin/audit?action=thu");
    expect(pages).toBe(2);
    expect(seen).toHaveLength(60);
    expect(new Set(seen.map((a) => a.id)).size).toBe(60);
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run test/admin-read.test.ts`
Expected: FAIL, các route trả `404`.

- [ ] **Step 3: Tạo `server/src/admin-read.ts`**

```ts
// Route chỉ đọc của Worker admin cho Web Admin (spec 2026-10-07 Web Admin §3.2): danh sách, việc cần xử lý, số nhanh.
// Mỗi request ghi một dòng nhật ký (list_viewed, queue_viewed, summary_viewed) không chứa email. Vì có ghi nhật ký,
// GET ở đây chặn request mà trình duyệt báo là từ trang khác, như payment-status.
// Danh sách: 50 dòng mỗi trang, mới nhất trước, con trỏ keyset (`next_cursor` của trang trước đưa vào `cursor`).
import type { Context, Hono } from "hono";
import { type AdminAppEnv, crossSite } from "./admin-auth";
import { audit } from "./audit";
import { fail } from "./http";
import { maskLicenseKey } from "./license-key";
import { PLAN_CODES } from "./plans";

type Bind = string | number;
type Row = Record<string, unknown>;
type AdminContext = Context<AdminAppEnv>;

const PAGE = 50;
const QUEUE_ITEMS = 20;
const DAY = 86400;
const VN_OFFSET = 7 * 3600;

/** Các action xem và tra cứu: /admin/audit ẩn mặc định (spec §3.2). */
export const VIEW_ACTIONS = ["lookup", "list_viewed", "queue_viewed", "summary_viewed", "payment_status_viewed"] as const;

export const ORDER_STATUSES = [
  "pending",
  "processing",
  "paid",
  "underpaid",
  "cancelled",
  "expired",
  "failed",
  "paid_needs_review",
  "refunded",
] as const;

/** Cột đơn trả cho Web Admin: mọi cột trừ order_token_hash, provider_ref và các cột nội bộ của việc gửi email. */
const ORDER_COLUMNS =
  "order_code, provider, plan, amount, amount_paid, currency, email, status, grant_kind, license_id, renew_license_id, created_at, paid_at, email_sent_at, email_gave_up_at";

/** Số máy đang kích hoạt của license `l`. */
const ACTIVE_DEVICES = "(SELECT COUNT(*) FROM activations a WHERE a.license_id = l.id AND a.deactivated_at IS NULL)";

/** Cột license cho danh sách và hàng đợi (bảng đặt bí danh `l`). Key được che ở maskLicense. */
const LICENSE_COLUMNS = `l.id, l.license_key, l.email, l.plan, l.expires_at, l.created_at, l.revoked_at, l.locked_at, ${ACTIVE_DEVICES} AS active_devices`;

const maskLicense = (r: Row): Row => ({ ...r, license_key: maskLicenseKey(String(r.license_key)) });

/** Đầu ngày (00:00 GMT+7) chứa thời điểm `t`. */
export function vnDayStart(t: number): number {
  return Math.floor((t + VN_OFFSET) / DAY) * DAY - VN_OFFSET;
}

/** "YYYY-MM-DD" theo GMT+7 thành giây Unix lúc 00:00 ngày đó; sai định dạng hay ngày không có thật thì null. */
export function parseVnDate(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return ms / 1000 - VN_OFFSET;
}

/** Bộ lọc của một request danh sách: điều kiện WHERE, giá trị bind, và bộ lọc đã áp để ghi nhật ký. */
class Filters {
  readonly where: string[] = [];
  readonly binds: Bind[] = [];
  readonly applied: Record<string, string> = {};
  constructor(private readonly c: AdminContext) {}

  /** Tham số query; rỗng coi như không có. */
  get(name: string): string | undefined {
    const v = this.c.req.query(name);
    return v === undefined || v === "" ? undefined : v;
  }

  add(clause: string, ...binds: Bind[]): void {
    this.where.push(clause);
    this.binds.push(...binds);
  }

  /** Tham số chỉ nhận một trong `allowed`. Trả false nếu có mà sai. */
  oneOf(name: string, allowed: readonly string[], clause: (v: string) => [string, ...Bind[]]): boolean {
    const v = this.get(name);
    if (v === undefined) return true;
    if (!allowed.includes(v)) return false;
    const [sql, ...binds] = clause(v);
    this.add(sql, ...binds);
    this.applied[name] = v;
    return true;
  }

  /** `from`, `to` (YYYY-MM-DD theo GMT+7; `to` tính hết ngày) trên `column`. Trả tên tham số sai, hoặc null. */
  dates(column: string): string | null {
    for (const name of ["from", "to"] as const) {
      const raw = this.get(name);
      if (raw === undefined) continue;
      const start = parseVnDate(raw);
      if (start === null) return name;
      if (name === "from") this.add(`${column} >= ?`, start);
      else this.add(`${column} < ?`, start + DAY);
      this.applied[name] = raw;
    }
    return null;
  }
}

/** Con trỏ dạng "<giây>_<khóa>" cho thứ tự (thời điểm giảm dần, khóa giảm dần). */
function keysetCursor(timeColumn: string, keyColumn: string) {
  return (raw: string): [string, ...Bind[]] | null => {
    const m = /^(\d{1,15})_([0-9a-f-]{1,64})$/.exec(raw);
    if (!m) return null;
    const t = Number(m[1]);
    return [`(${timeColumn} < ? OR (${timeColumn} = ? AND ${keyColumn} < ?))`, t, t, m[2]!];
  };
}

/** Con trỏ là một số nguyên dương (thứ tự theo cột số giảm dần). */
function numberCursor(column: string) {
  return (raw: string): [string, ...Bind[]] | null => (/^\d{1,15}$/.test(raw) ? [`${column} < ?`, Number(raw)] : null);
}

interface ListSpec {
  resource: string;
  /** Đọc bộ lọc vào `f`; trả tên tham số sai, hoặc null. */
  filters(f: Filters, now: number): string | null;
  /** "SELECT … FROM …", chưa có WHERE. */
  select: string;
  order: string;
  cursor(raw: string): [string, ...Bind[]] | null;
  /** Con trỏ của dòng cuối trang (dòng chưa qua `map`). */
  next(row: Row): string;
  map?(row: Row): Row;
}

function listRoute(app: Hono<AdminAppEnv>, path: string, spec: ListSpec): void {
  app.get(path, async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const now = c.get("deps").now();
    const f = new Filters(c);
    const bad = spec.filters(f, now);
    if (bad) return fail(c, 400, "invalid_request", { field: bad });
    const rawCursor = f.get("cursor");
    if (rawCursor !== undefined) {
      const cond = spec.cursor(rawCursor);
      if (!cond) return fail(c, 400, "invalid_request", { field: "cursor" });
      f.add(...cond);
    }
    const where = f.where.length > 0 ? ` WHERE ${f.where.join(" AND ")}` : "";
    const { results } = await c.env.DB.prepare(`${spec.select}${where} ${spec.order} LIMIT ?`)
      .bind(...f.binds, PAGE + 1)
      .all<Row>();
    const rows = results.slice(0, PAGE);
    const last = rows[rows.length - 1];
    const nextCursor = results.length > PAGE && last ? spec.next(last) : null;
    const items = spec.map ? rows.map(spec.map) : rows;
    await audit(c.env.DB, {
      at: now,
      actor: c.get("actor"),
      action: "list_viewed",
      detail: { resource: spec.resource, filters: f.applied, count: items.length },
    });
    return c.json({ items, next_cursor: nextCursor });
  });
}

export function registerAdminRead(app: Hono<AdminAppEnv>): void {
  listRoute(app, "/admin/orders", {
    resource: "orders",
    filters(f) {
      if (!f.oneOf("status", ORDER_STATUSES, (s) => ["status = ?", s])) return "status";
      if (!f.oneOf("plan", PLAN_CODES, (p) => ["plan = ?", p])) return "plan";
      return f.dates("created_at");
    },
    select: `SELECT ${ORDER_COLUMNS} FROM orders`,
    order: "ORDER BY order_code DESC",
    cursor: numberCursor("order_code"),
    next: (r) => String(r.order_code),
  });

  listRoute(app, "/admin/audit", {
    resource: "audit",
    filters(f) {
      for (const name of ["actor", "action"] as const) {
        const v = f.get(name);
        if (v === undefined) continue;
        if (v.length > 200) return name;
        f.add(`${name} = ?`, v);
        // Không ghi email vào nhật ký (spec §3): actor của người vận hành ghi là "admin:…".
        f.applied[name] = name === "actor" && v.startsWith("admin:") ? "admin:…" : v;
      }
      const orderCode = f.get("order_code");
      if (orderCode !== undefined) {
        if (!/^\d{1,15}$/.test(orderCode)) return "order_code";
        f.add("order_code = ?", Number(orderCode));
        f.applied.order_code = orderCode;
      }
      if (f.get("include_views") === "1") f.applied.include_views = "1";
      else f.add(`action NOT IN (${VIEW_ACTIONS.map(() => "?").join(", ")})`, ...VIEW_ACTIONS);
      return f.dates("at");
    },
    select: "SELECT id, at, actor, action, license_id, order_code, detail FROM audit_log",
    order: "ORDER BY id DESC",
    cursor: numberCursor("id"),
    next: (r) => String(r.id),
  });
}
```

`LICENSE_COLUMNS`, `maskLicense`, `QUEUE_ITEMS` và `vnDayStart` chưa dùng ở task này; Task 6 và 7 dùng. TypeScript không báo lỗi biến chưa dùng ở cấu hình hiện tại.

- [ ] **Step 4: Gọi `registerAdminRead` trong `createAdminApp`**

Trong `server/src/admin.ts`, thêm `import { registerAdminRead } from "./admin-read";` và ngay sau dòng `useAdminAuth(app, makeDeps);` thêm:

```ts
  registerAdminRead(app);
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `pnpm typecheck && pnpm vitest run test/admin-read.test.ts test/admin.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/admin-read.ts src/admin.ts test/admin-read.test.ts
git commit -m "feat(admin): GET /admin/orders, /admin/audit có bộ lọc và con trỏ (Web Admin §3.2)"
```

---

## Task 6: `GET /admin/licenses`, `GET /admin/trials`

**Files:**
- Modify: `server/src/admin-read.ts` (trong `registerAdminRead`)
- Test: `server/test/admin-read.test.ts`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `server/test/admin-read.test.ts` (thêm `import { sha256Hex } from "../src/crypto";` vào đầu file):

```ts
describe("GET /admin/licenses", () => {
  /** Ba license: A còn hạn (monthly), B yearly đang xung đột, C đã thu hồi; thêm D đã hết hạn và E đang khóa. */
  async function fiveLicenses() {
    const ctx = makeAdmin();
    const { w } = ctx;
    await w.buy({ email: "a@example.com" });
    w.clock.now = T0 + 10;
    const b = await w.customerB();
    w.clock.now = T0 + 20;
    await w.buy({ email: "c@example.com" });
    w.clock.now = T0 + 30;
    await w.buy({ email: "d@example.com" });
    w.clock.now = T0 + 40;
    await w.buy({ email: "e@example.com" });
    const id = async (email: string) => (await env.DB.prepare("SELECT id FROM licenses WHERE email = ?").bind(email).first<{ id: string }>())!.id;
    await env.DB.prepare("UPDATE licenses SET revoked_at = ? WHERE email = 'c@example.com'").bind(T0 + 50).run();
    await env.DB.prepare("UPDATE licenses SET expires_at = ? WHERE email = 'd@example.com'").bind(T0 + 50).run();
    await env.DB.prepare("UPDATE licenses SET locked_at = ? WHERE email = 'e@example.com'").bind(T0 + 50).run();
    w.clock.now = T0 + 100;
    return { ...ctx, b, id };
  }

  it("mới nhất trước, key đã che, kèm số máy đang kích hoạt", async () => {
    const { adminCall, b } = await fiveLicenses();
    const page = (await adminCall("/admin/licenses")).body as unknown as Page;
    expect(page.items.map((l) => l.email)).toEqual(["e@example.com", "d@example.com", "c@example.com", b.email, "a@example.com"]);
    const lb = page.items[3]!;
    expect(lb).toMatchObject({ plan: "yearly", active_devices: 2 });
    const raw = b.licenseKey.replace(/-/g, "");
    expect(lb.license_key).toBe(`${raw.slice(0, 4)}-…-${raw.slice(-4)}`);
    expect(JSON.stringify(page)).not.toContain(raw);
    expect(page.next_cursor).toBeNull();
  });

  it("lọc theo trạng thái và gói", async () => {
    const { adminCall, b } = await fiveLicenses();
    const emails = async (q: string) => ((await adminCall(`/admin/licenses?${q}`)).body as unknown as Page).items.map((l) => l.email);
    expect(await emails("state=active")).toEqual(["e@example.com", b.email, "a@example.com"]);
    expect(await emails("state=expired")).toEqual(["d@example.com"]);
    expect(await emails("state=revoked")).toEqual(["c@example.com"]);
    expect(await emails("state=locked")).toEqual(["e@example.com"]);
    expect(await emails("state=conflict")).toEqual([b.email]);
    expect(await emails("plan=yearly")).toEqual([b.email]);
    expect(await adminCall("/admin/licenses?state=xyz")).toMatchObject({ status: 400, body: { field: "state" } });
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({ resource: "licenses", filters: { plan: "yearly" }, count: 1 });
  });

  it("phân trang theo (created_at, id), kể cả khi nhiều license cùng created_at", async () => {
    const { adminCall } = makeAdmin();
    await env.DB.batch(
      Array.from({ length: 53 }, (_, i) =>
        env.DB.prepare(
          "INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES (?, ?, NULL, 'monthly', ?, ?, ?, ?)",
        ).bind(crypto.randomUUID(), `K${String(i).padStart(27, "0")}`, T0 + DAY, T0, T0, i < 30 ? T0 : T0 + 1),
      ),
    );
    const { seen, pages } = await allPages(adminCall, "/admin/licenses");
    expect(pages).toBe(2);
    expect(new Set(seen.map((l) => l.id)).size).toBe(53);
  });
});

describe("GET /admin/trials", () => {
  it("mới nhất trước, cờ purchased theo activation của máy, lọc đang dùng / đã hết", async () => {
    const { w, adminCall } = makeAdmin();
    const d1 = await sha256Hex("trial-1");
    const d2 = await sha256Hex("trial-2");
    await w.call("POST", "/v1/trial", { device_id_hash: d1 });
    w.clock.now = T0 + 11 * DAY;
    await w.call("POST", "/v1/trial", { device_id_hash: d2 });
    const { licenseKey } = await w.buy();
    await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: d1, device_label: "Máy 1" });
    const page = (await adminCall("/admin/trials")).body as unknown as Page;
    expect(page.items.map((t) => [t.device_id_hash, t.purchased])).toEqual([
      [d2, false],
      [d1, true],
    ]);
    expect(page.items[1]).toMatchObject({ started_at: T0, ends_at: T0 + 10 * DAY });
    const hashes = async (q: string) => ((await adminCall(`/admin/trials?${q}`)).body as unknown as Page).items.map((t) => t.device_id_hash);
    expect(await hashes("state=active")).toEqual([d2]);
    expect(await hashes("state=ended")).toEqual([d1]);
    expect(await adminCall("/admin/trials?state=x")).toMatchObject({ status: 400, body: { field: "state" } });
    expect(await adminCall("/admin/trials?cursor=khong_hop_le!")).toMatchObject({ status: 400, body: { field: "cursor" } });
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run test/admin-read.test.ts`
Expected: FAIL, `/admin/licenses` và `/admin/trials` trả `404`.

- [ ] **Step 3: Viết code**

Trong `server/src/admin-read.ts`, thêm vào cuối thân `registerAdminRead` (sau `listRoute(app, "/admin/audit", …)`):

```ts
  listRoute(app, "/admin/licenses", {
    resource: "licenses",
    filters(f, now) {
      const states: Record<string, [string, ...Bind[]]> = {
        active: ["l.revoked_at IS NULL AND l.expires_at > ?", now],
        expired: ["l.revoked_at IS NULL AND l.expires_at <= ?", now],
        revoked: ["l.revoked_at IS NOT NULL"],
        locked: ["l.locked_at IS NOT NULL AND l.revoked_at IS NULL"],
        conflict: [`l.revoked_at IS NULL AND ${ACTIVE_DEVICES} > 1`],
      };
      if (!f.oneOf("state", Object.keys(states), (s) => states[s]!)) return "state";
      if (!f.oneOf("plan", PLAN_CODES, (p) => ["l.plan = ?", p])) return "plan";
      return null;
    },
    select: `SELECT ${LICENSE_COLUMNS} FROM licenses l`,
    order: "ORDER BY l.created_at DESC, l.id DESC",
    cursor: keysetCursor("l.created_at", "l.id"),
    next: (r) => `${r.created_at}_${r.id}`,
    map: maskLicense,
  });

  listRoute(app, "/admin/trials", {
    resource: "trials",
    filters(f, now) {
      if (!f.oneOf("state", ["active", "ended"], (s) => [s === "active" ? "t.ends_at > ?" : "t.ends_at <= ?", now])) return "state";
      return null;
    },
    select:
      "SELECT t.device_id_hash, t.started_at, t.ends_at, t.last_seen_at, t.device_id_hash IN (SELECT device_id_hash FROM activations) AS purchased FROM trials t",
    order: "ORDER BY t.started_at DESC, t.device_id_hash DESC",
    cursor: keysetCursor("t.started_at", "t.device_id_hash"),
    next: (r) => `${r.started_at}_${r.device_id_hash}`,
    map: (r) => ({ ...r, purchased: r.purchased === 1 }),
  });
```

- [ ] **Step 4: Chạy test, thấy qua**

Run: `pnpm typecheck && pnpm vitest run test/admin-read.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin-read.ts test/admin-read.test.ts
git commit -m "feat(admin): GET /admin/licenses (key đã che), /admin/trials (Web Admin §3.2)"
```

---

## Task 7: `GET /admin/queue`, `GET /admin/summary`

**Files:**
- Modify: `server/src/admin-read.ts`
- Test: `server/test/admin-read.test.ts`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `server/test/admin-read.test.ts`:

```ts
describe("GET /admin/queue", () => {
  it("không có việc gì: sáu nhóm đều rỗng; ghi queue_viewed", async () => {
    const { adminCall } = makeAdmin();
    const res = await adminCall("/admin/queue");
    expect(res.status).toBe(200);
    for (const g of ["needs_review", "underpaid", "email_failed", "locked", "conflict", "alerts"]) {
      expect(res.body[g], g).toEqual({ count: 0, items: [] });
    }
    expect(await lastAudit()).toMatchObject({ action: "queue_viewed" });
  });

  it("đủ sáu nhóm, đúng điều kiện từng nhóm", async () => {
    const { w, adminCall } = makeAdmin();
    const b = await w.customerB(); // license xung đột
    await w.buy({ email: "khoa@example.com" }); // sẽ khóa tạm
    await w.buy({ email: "thu@example.com" }); // sẽ thiếu tiền (gần đây)
    await w.buy({ email: "cu@example.com" }); // sẽ thiếu tiền (quá 30 ngày)
    await w.buy({ email: "mail@example.com" }); // email key bỏ cuộc
    await w.buy({ email: "review@example.com" }); // paid_needs_review
    const db = env.DB;
    await db.prepare("UPDATE licenses SET locked_at = ? WHERE email = 'khoa@example.com'").bind(T0).run();
    await db.prepare("UPDATE orders SET status = 'underpaid', created_at = ? WHERE email = 'thu@example.com'").bind(T0).run();
    await db.prepare("UPDATE orders SET status = 'underpaid', created_at = ? WHERE email = 'cu@example.com'").bind(T0 - 31 * DAY).run();
    await db.prepare("UPDATE orders SET email_sent_at = NULL, email_gave_up_at = ? WHERE email = 'mail@example.com'").bind(T0).run();
    await db.prepare("UPDATE orders SET status = 'paid_needs_review' WHERE email = 'review@example.com'").run();
    await db.batch([
      db.prepare("INSERT INTO ops_alerts (kind, window_start, count, notified_count) VALUES ('webhook_bad_signature', ?, 3, 1)").bind(T0),
      db.prepare("INSERT INTO ops_alerts (kind, window_start, count, notified_count) VALUES ('email_failed', ?, 2, 2)").bind(T0),
    ]);
    const q = (await adminCall("/admin/queue")).body as Record<string, { count: number; items: Record<string, unknown>[] }>;
    expect(q.needs_review!.items.map((o) => o.email)).toEqual(["review@example.com"]);
    expect(q.underpaid!.items.map((o) => o.email)).toEqual(["thu@example.com"]);
    expect(q.email_failed!.items.map((o) => o.email)).toEqual(["mail@example.com"]);
    expect(q.locked!.items.map((l) => l.email)).toEqual(["khoa@example.com"]);
    expect(q.conflict!.items.map((l) => [l.email, l.active_devices])).toEqual([[b.email, 2]]);
    expect(String(q.conflict!.items[0]!.license_key)).toContain("-…-");
    expect(q.alerts!.items).toEqual([{ kind: "webhook_bad_signature", window_start: T0, count: 3, notified_count: 1 }]);
    expect(q.needs_review!.items[0]).not.toHaveProperty("order_token_hash");
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({
      needs_review: 1,
      underpaid: 1,
      email_failed: 1,
      locked: 1,
      conflict: 1,
      alerts: 1,
    });
  });

  it("mỗi nhóm tối đa 20 dòng, count là tổng thật", async () => {
    const { w, adminCall } = makeAdmin();
    await checkouts(w, 25);
    await env.DB.prepare("UPDATE orders SET status = 'paid_needs_review'").run();
    const q = (await adminCall("/admin/queue")).body as Record<string, { count: number; items: unknown[] }>;
    expect(q.needs_review!.count).toBe(25);
    expect(q.needs_review!.items).toHaveLength(20);
  });

  it("GET từ trang khác thì 403", async () => {
    const { adminCall } = makeAdmin();
    expect((await adminCall("/admin/queue", { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await adminCall("/admin/summary", { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
  });
});

describe("GET /admin/summary", () => {
  it("doanh thu hôm nay theo ngày GMT+7, đơn đã trả 7 ngày, license còn hạn; ghi summary_viewed", async () => {
    const { w, adminCall } = makeAdmin();
    w.clock.now = T0 - 8 * 3600; // 23:00 ngày 30/09 giờ VN: hôm qua
    await w.buy({ email: "homqua@example.com" });
    w.clock.now = T0 - 6 * 3600; // 01:00 ngày 01/10 giờ VN: hôm nay
    await w.buy({ email: "homnay@example.com", plan: "yearly" });
    w.clock.now = T0 - 9 * DAY; // ngoài 7 ngày
    await w.buy({ email: "cu@example.com" });
    await env.DB.prepare("UPDATE licenses SET revoked_at = ? WHERE email = 'cu@example.com'").bind(T0 - 9 * DAY).run();
    w.clock.now = T0;
    const res = await adminCall("/admin/summary");
    expect(res).toEqual({
      status: 200,
      body: { revenue_today: 500000, currency: "VND", paid_orders_7d: 2, active_licenses: 2 },
    });
    expect(await lastAudit()).toMatchObject({ action: "summary_viewed" });
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run test/admin-read.test.ts`
Expected: FAIL, `/admin/queue` và `/admin/summary` trả `404`.

- [ ] **Step 3: Viết code**

Trong `server/src/admin-read.ts`, thêm hàm này ngay trên `export function registerAdminRead`:

```ts
/** Một nhóm của hàng đợi: tổng số dòng thỏa `where`, và tối đa QUEUE_ITEMS dòng đầu theo `order`. */
async function queueGroup(
  db: D1Database,
  columns: string,
  from: string,
  where: string,
  order: string,
  binds: Bind[] = [],
  map: (r: Row) => Row = (r) => r,
) {
  const [count, rows] = await db.batch<Row>([
    db.prepare(`SELECT COUNT(*) AS n FROM ${from} WHERE ${where}`).bind(...binds),
    db.prepare(`SELECT ${columns} FROM ${from} WHERE ${where} ${order} LIMIT ?`).bind(...binds, QUEUE_ITEMS),
  ]);
  return { count: Number(count?.results[0]?.n ?? 0), items: (rows?.results ?? []).map(map) };
}
```

Thêm vào cuối thân `registerAdminRead`:

```ts
  // Việc cần xử lý (spec §3.2): sáu nhóm, mỗi nhóm count và tối đa 20 dòng.
  app.get("/admin/queue", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const db = c.env.DB;
    const now = c.get("deps").now();
    const orders = (where: string, binds: Bind[] = []) => queueGroup(db, ORDER_COLUMNS, "orders", where, "ORDER BY order_code DESC", binds);
    const licenses = (where: string, order: string) => queueGroup(db, LICENSE_COLUMNS, "licenses l", where, order, [], maskLicense);
    const queue = {
      needs_review: await orders("status = 'paid_needs_review'"),
      underpaid: await orders("status = 'underpaid' AND created_at >= ?", [now - 30 * DAY]),
      email_failed: await orders("status = 'paid' AND email_gave_up_at IS NOT NULL AND email_sent_at IS NULL"),
      locked: await licenses("l.locked_at IS NOT NULL AND l.revoked_at IS NULL", "ORDER BY l.locked_at DESC"),
      conflict: await licenses(`l.revoked_at IS NULL AND ${ACTIVE_DEVICES} > 1`, "ORDER BY l.created_at DESC"),
      alerts: await queueGroup(db, "kind, window_start, count, notified_count", "ops_alerts", "count > notified_count", "ORDER BY window_start DESC"),
    };
    const counts = Object.fromEntries(Object.entries(queue).map(([k, g]) => [k, g.count]));
    await audit(db, { at: now, actor: c.get("actor"), action: "queue_viewed", detail: counts });
    return c.json(queue);
  });

  // Ba số nhanh của trang Việc cần xử lý (spec §3.2). Ngày tính theo GMT+7.
  app.get("/admin/summary", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const db = c.env.DB;
    const now = c.get("deps").now();
    const row = await db
      .prepare(
        `SELECT
           (SELECT COALESCE(SUM(amount_paid), 0) FROM orders WHERE status = 'paid' AND paid_at >= ?1) AS revenue_today,
           (SELECT COUNT(*) FROM orders WHERE status = 'paid' AND paid_at >= ?2) AS paid_orders_7d,
           (SELECT COUNT(*) FROM licenses WHERE revoked_at IS NULL AND expires_at > ?3) AS active_licenses`,
      )
      .bind(vnDayStart(now), now - 7 * DAY, now)
      .first<{ revenue_today: number; paid_orders_7d: number; active_licenses: number }>();
    await audit(db, { at: now, actor: c.get("actor"), action: "summary_viewed" });
    return c.json({
      revenue_today: row?.revenue_today ?? 0,
      currency: "VND",
      paid_orders_7d: row?.paid_orders_7d ?? 0,
      active_licenses: row?.active_licenses ?? 0,
    });
  });
```

- [ ] **Step 4: Chạy test, thấy qua**

Run: `pnpm typecheck && pnpm vitest run test/admin-read.test.ts`
Expected: PASS.

Nếu test summary lệch `revenue_today`: kiểm giá test trong `env.PLANS` (`wrangler.jsonc`: Yearly 500.000 đ) và `paid_at` của đơn do webhook ghi (`src/orders.ts`, lúc xử lý = `w.clock.now`).

- [ ] **Step 5: Commit**

```bash
git add src/admin-read.ts test/admin-read.test.ts
git commit -m "feat(admin): GET /admin/queue (sáu nhóm việc cần xử lý), /admin/summary (Web Admin §3.2)"
```

---

## Task 8: Phục vụ trang qua `ASSETS` và header bảo mật

**Files:**
- Create: `server/src/admin-assets.ts`
- Modify: `server/src/env.ts` (`AdminEnv`), `server/src/admin.ts` (`createAdminApp`)
- Test: `server/test/admin-assets.test.ts`

- [ ] **Step 1: Viết test thất bại**

Tạo `server/test/admin-assets.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { makeAdmin } from "./admin-harness";
import { resetDb } from "./db";

beforeEach(resetDb);

/** Binding ASSETS giả: ghi lại đường dẫn được hỏi, trả trang HTML (như not_found_handling SPA trả index.html). */
function fakeAssets() {
  const paths: string[] = [];
  const fetcher = {
    fetch: async (req: Request) => {
      paths.push(new URL(req.url).pathname);
      return new Response("<!doctype html><title>AI Translator Admin</title>", {
        headers: { "content-type": "text/html; charset=utf-8", etag: '"abc"' },
      });
    },
  } as unknown as Fetcher;
  return { paths, fetcher };
}

describe("trang Web Admin (spec Web Admin §2)", () => {
  it("không qua Access thì 403 cho trang và file tĩnh, không hỏi ASSETS", async () => {
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher });
    for (const path of ["/", "/assets/index-abc.js", "/licenses/x"]) {
      expect((await adminFetch(path, { operator: null })).status, path).toBe(403);
    }
    expect(a.paths).toEqual([]);
  });

  it("qua Access: trả trang từ ASSETS, giữ header của ASSETS, gắn header bảo mật", async () => {
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher });
    const res = await adminFetch("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("AI Translator Admin");
    expect(res.headers.get("etag")).toBe('"abc"');
    const csp = res.headers.get("content-security-policy") ?? "";
    for (const part of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ]) {
      expect(csp, part).toContain(part);
    }
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("route của SPA (/licenses/:id…) chuyển nguyên cho ASSETS", async () => {
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher });
    expect((await adminFetch("/licenses/0b9e7c1e-0000-4000-8000-000000000000")).status).toBe(200);
    expect((await adminFetch("/search")).status).toBe(200);
    expect(a.paths).toEqual(["/licenses/0b9e7c1e-0000-4000-8000-000000000000", "/search"]);
  });

  it("/admin/<không có> vẫn là 404 JSON, không rơi về trang", async () => {
    const a = fakeAssets();
    const { adminCall } = makeAdmin({ ASSETS: a.fetcher });
    expect(await adminCall("/admin/khong-co")).toEqual({ status: 404, body: { error: "not_found" } });
    expect(await adminCall("/admin")).toEqual({ status: 404, body: { error: "not_found" } });
    expect(a.paths).toEqual([]);
  });

  it("phản hồi JSON và 403 cũng có header bảo mật", async () => {
    const { adminFetch } = makeAdmin();
    const ok = await adminFetch("/admin/whoami");
    expect(ok.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const denied = await adminFetch("/admin/whoami", { operator: null });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("x-frame-options")).toBe("DENY");
  });

  it("mọi phản hồi /admin/* có Cache-Control: no-store (danh sách trả email khách); trang tĩnh thì không ép", async () => {
    const a = fakeAssets();
    const { adminFetch } = makeAdmin({ ASSETS: a.fetcher });
    expect((await adminFetch("/admin/whoami")).headers.get("cache-control")).toBe("no-store");
    expect((await adminFetch("/admin/whoami", { operator: null })).headers.get("cache-control")).toBe("no-store");
    expect((await adminFetch("/admin/khong-co")).headers.get("cache-control")).toBe("no-store");
    expect((await adminFetch("/")).headers.get("cache-control")).toBeNull();
  });

  it("không có binding ASSETS thì trang là 404 JSON", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/")).toEqual({ status: 404, body: { error: "not_found" } });
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `pnpm vitest run test/admin-assets.test.ts`
Expected: FAIL (kiểu: `ASSETS` không có trong `AdminEnv`; trang trả `404`; thiếu header).

- [ ] **Step 3: Thêm `ASSETS` vào `AdminEnv`**

Trong `server/src/env.ts`, trong `interface AdminEnv`, ngay sau dòng `API: ApiRpc;` thêm:

```ts
  /** Trang Web Admin đã build (admin-ui/dist), khối `assets` của wrangler.admin.jsonc. Thiếu (test) thì trang trả 404. */
  ASSETS?: Fetcher;
```

- [ ] **Step 4: Tạo `server/src/admin-assets.ts`**

```ts
// Trang Web Admin (spec 2026-10-07 Web Admin §2): SPA build từ admin-ui/, phục vụ qua binding ASSETS. wrangler.admin.jsonc
// đặt run_worker_first: true, nên mọi request, kể cả file tĩnh, đi qua middleware kiểm Access (admin-auth.ts) trước khi tới đây.
// Header bảo mật gắn cho mọi phản hồi của Worker admin (trang, JSON, 403).
import type { Hono } from "hono";
import type { SecureHeadersOptions } from "hono/secure-headers";
import type { AdminAppEnv } from "./admin-auth";
import { fail } from "./http";

export const ADMIN_SECURE_HEADERS: Partial<SecureHeadersOptions> = {
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'self'"],
  },
  referrerPolicy: "no-referrer",
  xFrameOptions: "DENY",
};

/** Đăng ký SAU mọi route /admin/*: GET còn lại (trừ /admin…) là trang của SPA. */
export function registerAssets(app: Hono<AdminAppEnv>): void {
  app.get("*", async (c) => {
    const path = c.req.path;
    if (path === "/admin" || path.startsWith("/admin/") || !c.env.ASSETS) return fail(c, 404, "not_found");
    const res = await c.env.ASSETS.fetch(c.req.raw);
    // Header của phản hồi từ binding không sửa được; chép sang Response mới để middleware gắn header bảo mật.
    return new Response(res.body, res);
  });
}
```

Nếu `pnpm typecheck` báo `hono/secure-headers` không export `SecureHeadersOptions`, đổi kiểu thành `Parameters<typeof secureHeaders>[0]` (import `secureHeaders` từ `hono/secure-headers`).

- [ ] **Step 5: Ghép vào `createAdminApp`**

Trong `server/src/admin.ts`:

1. Thêm import:

```ts
import { secureHeaders } from "hono/secure-headers";
import { ADMIN_SECURE_HEADERS, registerAssets } from "./admin-assets";
```

2. Đầu `createAdminApp`, sửa thành:

```ts
  const app = new Hono<AdminAppEnv>();
  // Đứng trước lớp kiểm Access để cả phản hồi 403 cũng có header bảo mật.
  app.use("*", secureHeaders(ADMIN_SECURE_HEADERS));
  // Dữ liệu của /admin/* có email khách: không để trình duyệt hay proxy giữ lại (kể cả 403, 404).
  app.use("/admin/*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store");
  });
  useAdminAuth(app, makeDeps);
  registerAdminRead(app);
```

3. Ngay trước `app.notFound((c) => fail(c, 404, "not_found"));` ở cuối hàm, thêm:

```ts
  registerAssets(app);
```

- [ ] **Step 6: Chạy test, thấy qua**

Run: `pnpm typecheck && pnpm vitest run test/admin-assets.test.ts test/admin.test.ts test/admin-read.test.ts`
Expected: PASS. Test cũ "không qua Access thì mọi route 403" (gồm `/khong-co`) vẫn qua vì lớp kiểm Access chạy trước.

- [ ] **Step 7: Commit**

```bash
git add src/admin-assets.ts src/env.ts src/admin.ts test/admin-assets.test.ts
git commit -m "feat(admin): phục vụ trang Web Admin qua ASSETS sau lớp kiểm Access, header bảo mật (Web Admin §2)"
```

---

## Task 9: Kiểm cuối kế hoạch 01

- [ ] **Step 1: Bộ kiểm đầy đủ của server**

Run: `pnpm check`
Expected: typecheck, `vectors:check`, Vitest, `test:scripts`, `dry-run` đều qua. `dry-run` của Worker admin chưa có khối `assets` (thêm ở kế hoạch 02, Task 9) nên vẫn qua như trước.

- [ ] **Step 2: Rà nhanh**

```bash
grep -n "email" src/admin-read.ts | grep -i "detail\|audit"
```

Expected: không có dòng nào đưa email vào `detail` của nhật ký.

- [ ] **Step 3: Không commit gì thêm nếu Step 1 và 2 sạch.** Nếu phải sửa, commit `fix(admin): …` kèm lý do.
