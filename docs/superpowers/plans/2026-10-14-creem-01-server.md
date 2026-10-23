# Thanh toán quốc tế bằng Creem · Kế hoạch 01: Worker API (server)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Worker API (`mt-license`) bán được đơn trả trước một lần bằng USD qua Creem (khách ngoài Việt Nam), cấp license đúng như PayOS, ghi nhận hoàn tiền và tranh chấp, mà luồng PayOS và app cũ (≤ 0.1.9) không đổi.

**Architecture:** Cổng thứ hai `creem` nằm sau `PaymentProvider`. Interface đổi hai hàm (webhook nhận thân thô và header; hỏi trạng thái nhận cả `providerRef`), thêm `CreemProvider` (`fetch` thuần, chữ ký HMAC-SHA256 của thân thô), `POST /v1/checkout` chọn cổng theo `currency`, route webhook chung `/v1/webhooks/:provider` xử lý thêm sự kiện hoàn tiền. License, token, `grantOrder`, schema D1 **không đổi** (không migration).

**Tech Stack:** TypeScript, Cloudflare Workers, Hono, D1 (SQLite), Vitest + `@cloudflare/vitest-plugin`, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-14-creem-international-payment-design.md` (§4). Kế hoạch này là phần 01. Phần 02 (Web Admin) cần `creemFromEnv` (Task 5) và `PaymentStatus` có `"refunded"` (Task 4); phần 03 (app) cần hợp đồng response của `POST /v1/checkout` và `GET /v1/plans` (Task 6); phần 04 (website) cần giá USD trong `server/wrangler.jsonc` (Task 5); phần 05 (pháp lý, vận hành) cần các secret `CREEM_*` trong `secrets.required` (Task 5) và test `wrangler-config`.

---

## Quy ước chung cho mọi task (đọc trước khi làm)

- Thư mục dự án: `/Users/dtphong/Desktop/software_business/ai-translator`. **Mỗi lệnh Bash bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`** (shell không giữ thư mục giữa các lệnh).
- Làm **trực tiếp trên nhánh `payment`** (chủ dự án chỉ định). Trước khi bắt đầu: `git branch --show-current` phải in `payment`.
- **KHÔNG commit, KHÔNG push, KHÔNG deploy, KHÔNG áp migration** cho tới khi chủ dự án cho phép (spec D9). Vì vậy kế hoạch này **không có bước "Commit"**: cuối mỗi task chỉ có bước kiểm danh sách file đã đổi. `pnpm dry-run` (`wrangler deploy --dry-run`) thì được chạy, vì nó không ghi gì lên Cloudflare.
- **Không** dùng `git add`, `git stash`, `git checkout -- <file>`, `git clean`, `git reset`: cây làm việc có các file chưa theo dõi của việc này (spec, nghiên cứu, các kế hoạch `2026-10-14-creem-*.md`) không được mất hay lẫn vào đâu.
- Chú thích trong code viết tiếng Việt có dấu, cùng giọng với các file xung quanh.
- Mốc test trước khi sửa (đo 2026-10-14 ở `HEAD` `064a8c8`, nhánh `payment`): server **25 file, 679 test**; `pnpm test:scripts` **19 test (18 pass, 1 skip)**; Web Admin **40 file, 846 test**. Số "Expected" ở các task là tổng sau task đó; lệch thì đọc lại nguyên nhân, đừng sửa số.
- Mã trong kế hoạch là **bản đã chạy thật** trong một bản sao tạm của repo (typecheck sạch, mọi test đạt). Chép đúng như vậy; diff dùng ngữ cảnh 3 dòng, áp được bằng cách sửa tay hay `git apply` (không cần commit).

## Cấu trúc file

| File | Việc |
|---|---|
| `server/src/payment/provider.ts` | interface mới: `WebhookRequest`, `WebhookEvent`, `getPaymentStatus(ref)`; `PaymentStatus` thêm `"refunded"`; `isProviderAuthFailure` (Task 1, 4, 8, 9) |
| `server/src/payment/payos.ts` | theo interface mới, hành vi không đổi (Task 1) |
| `server/src/payment/creem-webhook.ts` | **mới**: kiểm chữ ký và đọc webhook Creem (Task 2, 8) |
| `server/src/payment/creem.ts` | **mới**: `CreemProvider`, `parseProductIds` (Task 3, 4, 5) |
| `server/src/deps.ts`, `src/env.ts`, `wrangler.jsonc`, `vitest.config.ts` | cấu hình Creem, giá USD (Task 5) |
| `server/src/checkout.ts` | chọn cổng theo `currency`, `GET /v1/plans` theo loại tiền bán được (Task 6, 9) |
| `server/src/orders.ts` | webhook thô, `handleRefund` (Task 1, 8) |
| `server/src/alerts.ts`, `src/reconcile.ts` | loại cảnh báo mới, cảnh báo khóa API bị từ chối (Task 8, 9) |
| `server/test/fakes.ts`, `test/world.ts` | `FakeCreem` mức HTTP, Creem trong `makeWorld`, `buyCreem` (Task 3 trở đi) |
| `server/test/creem*.test.ts` | test mới (Task 2 trở đi) |
| `server/test/{payos,plans,checkout}.test.ts`, `test/node/wrangler-config.test.mjs` | cập nhật theo interface và bảng giá mới |

---

### Task 0: Kiểm môi trường và ghi mốc

**Files:** không sửa file nào.

- [ ] **Step 1: Kiểm nhánh và cây làm việc**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short`
Expected: dòng đầu `payment`; các dòng sau chỉ có file chưa theo dõi (`?? docs/superpowers/specs/2026-10-14-creem-international-payment-design.md`, `?? docs/superpowers/specs/2026-10-14-international-payment-provider-research.md`, và các `?? docs/superpowers/plans/2026-10-14-creem-*.md`). Có file đã theo dõi bị sửa thì **dừng** và hỏi chủ dự án.

- [ ] **Step 2: Chạy bộ test mốc của server**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm test 2>&1 | grep -E "Test Files|Tests " && pnpm test:scripts 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)" && pnpm vectors:check && echo "vectors:check OK"`
Expected: `tsc --noEmit` không lỗi; `Test Files  25 passed (25)`, `Tests  679 passed (679)`; `ℹ tests 19`, `ℹ pass 18`, `ℹ fail 0`, `ℹ skipped 1`; `vectors:check OK`.

---

### Task 1: Giao diện `PaymentProvider` mới (đổi chữ ký, hành vi PayOS không đổi)

**Files:**
- Modify: `server/src/payment/provider.ts`, `server/src/payment/payos.ts`, `server/src/orders.ts`, `server/src/admin.ts`, `server/src/checkout.ts`
- Modify (test): `server/test/fakes.ts`, `server/test/payos.test.ts`

Lý do: webhook của Creem ký trên **thân thô** và ở header, nên `verifyWebhook` phải nhận thân thô và header thay vì JSON đã parse; Creem không tra được đơn theo mã đơn của ta nên `getPaymentStatus` phải nhận cả `providerRef` (`orders.provider_ref`); Creem bán theo sản phẩm nên `createCheckout` cần `plan` và `email`; và Creem không có mã QR nên `qrCode` có thể `null`. Task này chỉ đổi chữ ký, **mọi test PayOS hiện có phải qua nguyên vẹn** (chỉ đổi cách gọi).

- [ ] **Step 1: Cập nhật test PayOS và `FakeGateway` theo giao diện mới**

**Sửa `server/test/payos.test.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/payos.test.ts
+++ b/server/test/payos.test.ts
@@ -42,39 +42,49 @@
   );
 }
 
+/** Webhook thô như route đưa cho provider. PayOS ký trong thân JSON, không ở header, nên header để trống. */
+const hook = (body: unknown) => ({ rawBody: JSON.stringify(body), headers: new Headers() });
+const ref42 = { orderCode: 42, providerRef: null };
+
 describe("PayOS: chữ ký webhook", () => {
   it("nhận webhook mẫu của tài liệu PayOS", async () => {
-    expect(await provider(fetch).verifyWebhook(DOC_WEBHOOK)).toEqual({ orderCode: 123 });
+    expect(await provider(fetch).verifyWebhook(hook(DOC_WEBHOOK))).toEqual({ kind: "payment", orderCode: 123 });
+  });
+
+  it("thân không phải JSON: trả \"malformed\" (không phải sai chữ ký, không tạo cảnh báo)", async () => {
+    const p = provider(fetch);
+    expect(await p.verifyWebhook({ rawBody: "{", headers: new Headers() })).toBe("malformed");
+    expect(await p.verifyWebhook({ rawBody: "", headers: new Headers() })).toBe("malformed");
   });
 
   it("từ chối webhook bị sửa số tiền", async () => {
     const body = { ...DOC_WEBHOOK, data: { ...DOC_WEBHOOK.data, amount: 3_000_000 } };
-    expect(await provider(fetch).verifyWebhook(body)).toBeNull();
+    expect(await provider(fetch).verifyWebhook(hook(body))).toBeNull();
   });
 
   it("chữ ký ở mục schema của tài liệu (8d8640…) không khớp dữ liệu mẫu", async () => {
     const body = { ...DOC_WEBHOOK, signature: "8d8640d802576397a1ce45ebda7f835055768ac7ad2e0bfb77f9b8f12cca4c7f" };
-    expect(await provider(fetch).verifyWebhook(body)).toBeNull();
+    expect(await provider(fetch).verifyWebhook(hook(body))).toBeNull();
   });
 
   it("đúng chữ ký mà orderCode không phải số nguyên: trả \"malformed\", không phải null (sai chữ ký) (review cuối, N2)", async () => {
     const p = provider(fetch);
     for (const orderCode of ["123", 1.5, null, -0.5]) {
-      expect(await p.verifyWebhook(await signed({ ...DOC_WEBHOOK.data, orderCode }))).toBe("malformed");
+      expect(await p.verifyWebhook(hook(await signed({ ...DOC_WEBHOOK.data, orderCode })))).toBe("malformed");
     }
     const { orderCode: _drop, ...noCode } = DOC_WEBHOOK.data;
-    expect(await p.verifyWebhook(await signed(noCode))).toBe("malformed");
+    expect(await p.verifyWebhook(hook(await signed(noCode)))).toBe("malformed");
     // Sai chữ ký thì vẫn là null, dù orderCode cũng sai dạng: chưa kiểm được chữ ký thì không tin nội dung.
     // (Chuỗi ký không phân biệt "123" với 123, nên đổi giá trị chứ không chỉ đổi kiểu.)
-    expect(await p.verifyWebhook({ data: { ...DOC_WEBHOOK.data, orderCode: "124" }, signature: DOC_WEBHOOK.signature })).toBeNull();
+    expect(await p.verifyWebhook(hook({ data: { ...DOC_WEBHOOK.data, orderCode: "124" }, signature: DOC_WEBHOOK.signature }))).toBeNull();
   });
 
   it("từ chối body sai định dạng", async () => {
     const p = provider(fetch);
-    expect(await p.verifyWebhook(null)).toBeNull();
-    expect(await p.verifyWebhook("x")).toBeNull();
-    expect(await p.verifyWebhook({ data: [], signature: "a" })).toBeNull();
-    expect(await p.verifyWebhook({ data: DOC_WEBHOOK.data })).toBeNull();
+    expect(await p.verifyWebhook(hook(null))).toBeNull();
+    expect(await p.verifyWebhook(hook("x"))).toBeNull();
+    expect(await p.verifyWebhook(hook({ data: [], signature: "a" }))).toBeNull();
+    expect(await p.verifyWebhook(hook({ data: DOC_WEBHOOK.data }))).toBeNull();
   });
 
   it("chuỗi ký: xếp key, null thành rỗng, mảng thành JSON có key đã xếp", () => {
@@ -93,6 +103,8 @@
     returnUrl: "https://example.com/v1/pay/return",
     cancelUrl: "https://example.com/v1/pay/cancel",
     expiresAt: 1_790_000_900,
+    plan: "monthly" as const,
+    email: "buyer@example.com",
   };
   const linkData = {
     bin: "970422",
@@ -180,7 +192,7 @@
       urls.push(url);
       return new Response(JSON.stringify(response));
     });
-    expect(await p.getPaymentStatus(42)).toEqual({
+    expect(await p.getPaymentStatus(ref42)).toEqual({
       orderCode: 42,
       status: "paid",
       amount: 2000,
@@ -199,10 +211,10 @@
       ],
     };
     const p1 = provider(async () => new Response(JSON.stringify(await signed(twice))));
-    expect((await p1.getPaymentStatus(42)).paidAt).toBe(1_790_812_800 + 86400 + 2 * 3600);
+    expect((await p1.getPaymentStatus(ref42)).paidAt).toBe(1_790_812_800 + 86400 + 2 * 3600);
     const none = { ...info("PENDING", 0), transactions: [] };
     const p2 = provider(async () => new Response(JSON.stringify(await signed(none))));
-    expect((await p2.getPaymentStatus(42)).paidAt).toBeNull();
+    expect((await p2.getPaymentStatus(ref42)).paidAt).toBeNull();
   });
 
   it("đọc transactionDateTime: giờ Việt Nam, hoặc ISO 8601 có múi giờ", () => {
@@ -247,30 +259,30 @@
     for (const [payos, ours] of Object.entries(expected)) {
       const response = await signed(info(payos, payos === "PAID" ? 2000 : 0));
       const p = provider(async () => new Response(JSON.stringify(response)));
-      expect((await p.getPaymentStatus(42)).status, payos).toBe(ours);
+      expect((await p.getPaymentStatus(ref42)).status, payos).toBe(ours);
     }
   });
 
   it("trạng thái lạ hoặc sai orderCode thì báo lỗi", async () => {
     const odd = await signed(info("WEIRD", 0));
-    await expect(provider(async () => new Response(JSON.stringify(odd))).getPaymentStatus(42)).rejects.toThrow();
+    await expect(provider(async () => new Response(JSON.stringify(odd))).getPaymentStatus(ref42)).rejects.toThrow();
     const other = await signed(info("PAID", 2000, 43));
-    await expect(provider(async () => new Response(JSON.stringify(other))).getPaymentStatus(42)).rejects.toThrow(
+    await expect(provider(async () => new Response(JSON.stringify(other))).getPaymentStatus(ref42)).rejects.toThrow(
       /orderCode/,
     );
   });
 
   it("HTTP 401 thì báo lỗi", async () => {
     const p = provider(async () => new Response(JSON.stringify({ code: "401", desc: "Unauthorized" }), { status: 401 }));
-    await expect(p.getPaymentStatus(42)).rejects.toThrow(/401/);
+    await expect(p.getPaymentStatus(ref42)).rejects.toThrow(/401/);
   });
 
   it("lỗi mạng và quá thời gian chờ thành PaymentProviderError", async () => {
-    const down = await provider(async () => Promise.reject(new TypeError("fetch failed"))).getPaymentStatus(42).catch((e: unknown) => e);
+    const down = await provider(async () => Promise.reject(new TypeError("fetch failed"))).getPaymentStatus(ref42).catch((e: unknown) => e);
     expect(down).toBeInstanceOf(PaymentProviderError);
     expect(String(down)).toBe("PaymentProviderError: PayOS không trả lời (TypeError: fetch failed)");
     const slow = await provider(async () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")))
-      .createCheckout({ orderCode: 42, amount: 2000, currency: "VND", description: "AT42", returnUrl: "https://e.test/r", cancelUrl: "https://e.test/c", expiresAt: 1 })
+      .createCheckout({ orderCode: 42, amount: 2000, currency: "VND", description: "AT42", returnUrl: "https://e.test/r", cancelUrl: "https://e.test/c", expiresAt: 1, plan: "monthly", email: "buyer@example.com" })
       .catch((e: unknown) => e);
     expect(slow).toBeInstanceOf(PaymentProviderError);
     expect(String(slow)).toBe("PaymentProviderError: PayOS không trả lời sau 10 giây");
@@ -282,7 +294,7 @@
   it("lỗi có trả lời (HTTP lỗi, không phải JSON, sai chữ ký, dữ liệu lạ) không phải unreachable, dù không có httpStatus", async () => {
     const errOf = (body: string, status = 200): Promise<PaymentProviderError> =>
       provider(async () => new Response(body, { status }))
-        .getPaymentStatus(42)
+        .getPaymentStatus(ref42)
         .then(
           () => {
             throw new Error("phải báo lỗi");
```

**Sửa `server/test/fakes.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/fakes.ts
+++ b/server/test/fakes.ts
@@ -2,7 +2,7 @@
 // chỉ thay hàm fetch. Không test nào gọi mạng thật.
 import { hmacSha256Hex } from "../src/crypto";
 import { objectSignatureData, paymentRequestSignatureData } from "../src/payment/payos";
-import type { CheckoutResult, PaymentProvider, PaymentStatusResult, WebhookEvent } from "../src/payment/provider";
+import type { CheckoutResult, PaymentProvider, PaymentStatusResult, WebhookEvent, WebhookRequest } from "../src/payment/provider";
 
 export const TEST_CHECKSUM_KEY = "test-checksum-key-không-dùng-ở-đâu-khác";
 
@@ -198,12 +198,18 @@
     throw new Error("không dùng trong test");
   }
 
-  async verifyWebhook(body: unknown): Promise<WebhookEvent | "malformed" | null> {
-    const b = body as { secret?: string; orderCode?: number };
-    return b.secret === "fakepay-ok" && typeof b.orderCode === "number" ? { orderCode: b.orderCode } : null;
-  }
-
-  async getPaymentStatus(orderCode: number): Promise<PaymentStatusResult> {
+  async verifyWebhook(req: WebhookRequest): Promise<WebhookEvent | "malformed" | null> {
+    let b: { secret?: string; orderCode?: number };
+    try {
+      b = JSON.parse(req.rawBody) as { secret?: string; orderCode?: number };
+    } catch {
+      return "malformed";
+    }
+    return b.secret === "fakepay-ok" && typeof b.orderCode === "number" ? { kind: "payment", orderCode: b.orderCode } : null;
+  }
+
+  async getPaymentStatus(ref: { orderCode: number; providerRef: string | null }): Promise<PaymentStatusResult> {
+    const { orderCode } = ref;
     this.statusCalls.push(orderCode);
     const paid = this.paid.has(orderCode);
     return { orderCode, status: paid ? "paid" : "pending", amount: 50000, amountPaid: paid ? 50000 : 0, paidAt: null };
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/payos.test.ts 2>&1 | grep -E "Test Files|Tests "`
Expected: FAIL (các test `verifyWebhook` và `getPaymentStatus` của PayOS đỏ vì `PayOSProvider` còn nhận chữ ký cũ).

- [ ] **Step 3: Đổi interface và PayOS**

**Sửa `server/src/payment/provider.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/payment/provider.ts
+++ b/server/src/payment/provider.ts
@@ -1,6 +1,7 @@
 // Interface cổng thanh toán (spec §6.8). Thêm cổng mới chỉ cần một cài đặt của interface này
 // và một endpoint webhook; license, token và app không phải sửa.
 // Tên hàm theo spec: create_checkout, verify_webhook, get_payment_status.
+import type { PlanCode } from "../plans";
 
 export type PaymentStatus = "pending" | "processing" | "paid" | "underpaid" | "cancelled" | "expired" | "failed";
 
@@ -13,37 +14,53 @@
   cancelUrl: string;
   /** Giây Unix; link thanh toán hết hạn lúc này. */
   expiresAt: number;
+  /** Gói của đơn: cổng bán theo sản phẩm (Creem) cần biết để chọn sản phẩm. */
+  plan: PlanCode;
+  /** Email khách nhập trong app, để điền sẵn trang thanh toán nếu cổng cho phép. */
+  email: string;
 }
 
 export interface CheckoutResult {
   providerRef: string;
   checkoutUrl: string;
-  /** Chuỗi VietQR thô; app tự vẽ thành mã QR. */
-  qrCode: string;
+  /** Chuỗi VietQR thô; app tự vẽ thành mã QR. null với cổng không có mã QR (Creem): app mở trang thanh toán bằng trình duyệt. */
+  qrCode: string | null;
 }
 
 export interface PaymentStatusResult {
   orderCode: number;
   status: PaymentStatus;
   amount: number;
+  /** Phần tiền thuộc về giá, không gồm thuế (cổng không có thuế thì là số tiền đã nhận). */
   amountPaid: number;
   /** Thời điểm của giao dịch gần nhất do cổng báo (giây Unix); null nếu cổng không báo hoặc không đọc được. */
   paidAt: number | null;
 }
 
-export interface WebhookEvent {
-  orderCode: number;
+/** Webhook thô: chữ ký của một số cổng nằm ở header và tính trên đúng thân thô (Creem), nên không parse trước khi kiểm. */
+export interface WebhookRequest {
+  rawBody: string;
+  headers: Headers;
 }
+
+/** Điều route webhook cần biết sau khi đã kiểm chữ ký. */
+export type WebhookEvent =
+  /** Cò kích hoạt: server hỏi lại cổng rồi cấp license cho đơn này. */
+  | { kind: "payment"; orderCode: number }
+  /** Sự kiện đúng chữ ký nhưng server không dùng: trả 200. */
+  | { kind: "ignore" };
 
 export interface PaymentProvider {
   readonly name: string;
   createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
   /**
-   * Trả về null nếu body không kiểm được chữ ký (thiếu `data`, thiếu chữ ký) hoặc sai chữ ký; "malformed" nếu đúng chữ
-   * ký nhưng nội dung không đọc được (ví dụ `orderCode` không phải số nguyên): đúng là cổng gửi, không phải giả mạo.
+   * Trả về null nếu không kiểm được chữ ký (thiếu chữ ký, thiếu `data`) hoặc sai chữ ký; "malformed" nếu thân không phải
+   * JSON, hoặc đúng chữ ký nhưng nội dung không đọc được (ví dụ `orderCode` không phải số nguyên): đúng là cổng gửi,
+   * không phải giả mạo.
    */
-  verifyWebhook(body: unknown): Promise<WebhookEvent | "malformed" | null>;
-  getPaymentStatus(orderCode: number): Promise<PaymentStatusResult>;
+  verifyWebhook(req: WebhookRequest): Promise<WebhookEvent | "malformed" | null>;
+  /** `providerRef`: mã của đơn ở cổng (`orders.provider_ref`); null nếu cổng tra được theo `orderCode` (PayOS). */
+  getPaymentStatus(ref: { orderCode: number; providerRef: string | null }): Promise<PaymentStatusResult>;
 }
 
 export class PaymentProviderError extends Error {
```

**Sửa `server/src/payment/payos.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/payment/payos.ts
+++ b/server/src/payment/payos.ts
@@ -12,6 +12,7 @@
   type PaymentStatus,
   type PaymentStatusResult,
   type WebhookEvent,
+  type WebhookRequest,
 } from "./provider";
 
 export interface PayOSConfig {
@@ -133,15 +134,23 @@
     return { providerRef: paymentLinkId, checkoutUrl, qrCode };
   }
 
-  async verifyWebhook(body: unknown): Promise<WebhookEvent | "malformed" | null> {
+  async verifyWebhook(req: WebhookRequest): Promise<WebhookEvent | "malformed" | null> {
+    // PayOS ký trong thân JSON (trường `signature`), không ở header: parse rồi kiểm như trước.
+    let body: unknown;
+    try {
+      body = JSON.parse(req.rawBody);
+    } catch {
+      return "malformed";
+    }
     if (!isRecord(body) || !isRecord(body.data) || typeof body.signature !== "string") return null;
     const expected = await hmacSha256Hex(this.cfg.checksumKey, objectSignatureData(body.data));
     if (!timingSafeEqual(expected, body.signature)) return null;
     const orderCode = body.data.orderCode;
-    return Number.isSafeInteger(orderCode) ? { orderCode: orderCode as number } : "malformed";
-  }
-
-  async getPaymentStatus(orderCode: number): Promise<PaymentStatusResult> {
+    return Number.isSafeInteger(orderCode) ? { kind: "payment", orderCode: orderCode as number } : "malformed";
+  }
+
+  async getPaymentStatus(ref: { orderCode: number; providerRef: string | null }): Promise<PaymentStatusResult> {
+    const { orderCode } = ref;
     const data = await this.call("GET", `/v2/payment-requests/${orderCode}`);
     const status = typeof data.status === "string" ? STATUS_MAP[data.status] : undefined;
     const { amount, amountPaid } = data;
```

- [ ] **Step 4: Đổi các nơi gọi (`orders.ts`, `admin.ts`, `checkout.ts`)**

`loadOrder` đọc thêm `provider_ref`; route webhook đọc thân thô (`c.req.text()`) rồi đưa `{ rawBody, headers }` cho provider; sự kiện `ignore` trả 200 mà không làm gì.

**Sửa `server/src/orders.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/orders.ts
+++ b/server/src/orders.ts
@@ -14,6 +14,8 @@
 export interface OrderRow {
   order_code: number;
   provider: string;
+  /** Mã của đơn ở cổng (paymentLinkId của PayOS, id phiên thanh toán của Creem); NULL khi cổng chưa trả lời lúc tạo. */
+  provider_ref: string | null;
   status: string;
   plan: string;
   amount: number;
@@ -39,8 +41,8 @@
 export async function loadOrder(db: D1Database, orderCode: number): Promise<OrderRow | null> {
   return db
     .prepare(
-      `SELECT order_code, provider, status, plan, amount, amount_paid, currency, email, renew_license_id, license_id,
-              created_at, expires_at
+      `SELECT order_code, provider, provider_ref, status, plan, amount, amount_paid, currency, email, renew_license_id,
+              license_id, created_at, expires_at
        FROM orders WHERE order_code = ?`,
     )
     .bind(orderCode)
@@ -312,7 +314,7 @@
   const provider = Object.hasOwn(deps.payments, order.provider) ? deps.payments[order.provider] : undefined;
   if (!provider) throw new Error(`không có cổng thanh toán ${order.provider}`);
   const now = deps.now();
-  const st = await provider.getPaymentStatus(orderCode);
+  const st = await provider.getPaymentStatus({ orderCode, providerRef: order.provider_ref });
   const amountMatches = st.amount === order.amount;
   if (amountMatches && st.status === "paid" && st.amountPaid >= st.amount) {
     const plans = parsePlans(env.PLANS);
@@ -400,13 +402,9 @@
     const name = c.req.param("provider");
     const provider = Object.hasOwn(deps.payments, name) ? deps.payments[name] : undefined;
     if (!provider) return fail(c, 404, "not_found");
-    let body: unknown;
-    try {
-      body = await c.req.json();
-    } catch {
-      return fail(c, 400, "invalid_request");
-    }
-    const event = await provider.verifyWebhook(body);
+    // Thân thô: chữ ký của một số cổng (Creem) tính trên đúng chuỗi byte nhận được, nên không parse trước khi kiểm.
+    const rawBody = await c.req.text();
+    const event = await provider.verifyWebhook({ rawBody, headers: c.req.raw.headers });
     if (event === "malformed") {
       // Đúng chữ ký (đúng là cổng gửi) mà nội dung không đọc được: không phải giả mạo, nên không báo sai chữ ký, không
       // tạo cảnh báo webhook_bad_signature và không ghi D1 (review cuối, N2).
@@ -418,6 +416,7 @@
       await raiseAlert(c.env.DB, "webhook_bad_signature", deps.now());
       return fail(c, 400, "invalid_signature");
     }
+    if (event.kind === "ignore") return c.json({ ok: true, result: "ignored" });
     try {
       const result = await fulfilOrder(c.env, deps, event.orderCode, "webhook");
       return c.json({ ok: true, result });
```

**Sửa `server/src/admin.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/admin.ts
+++ b/server/src/admin.ts
@@ -162,7 +162,7 @@
     if (!provider) return fail(c, 502, "payment_provider_error", { message: `không có cổng ${order.provider}` });
     await audit(c.env.DB, { at: deps.now(), actor: c.get("actor"), action: "payment_status_viewed", orderCode });
     try {
-      return c.json(await provider.getPaymentStatus(orderCode));
+      return c.json(await provider.getPaymentStatus({ orderCode, providerRef: order.provider_ref }));
     } catch (err) {
       return fail(c, 502, "payment_provider_error", { message: String(err) });
     }
```

**Sửa `server/src/checkout.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/checkout.ts
+++ b/server/src/checkout.ts
@@ -111,6 +111,8 @@
         returnUrl: `${origin}/v1/pay/return`,
         cancelUrl: `${origin}/v1/pay/cancel`,
         expiresAt,
+        plan,
+        email,
       });
     } catch (err) {
       await db.prepare("UPDATE orders SET status = 'failed' WHERE order_code = ?").bind(orderCode).run();
```

- [ ] **Step 5: Chạy typecheck và toàn bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm test 2>&1 | grep -E "Test Files|Tests "`
Expected: `tsc` không lỗi; `Test Files  25 passed (25)`, `Tests  680 passed (680)` (thêm một test: thân không phải JSON thì PayOS trả `"malformed"`).

- [ ] **Step 6: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- server`
Expected: bảy dòng ` M`: `server/src/admin.ts`, `server/src/checkout.ts`, `server/src/orders.ts`, `server/src/payment/payos.ts`, `server/src/payment/provider.ts`, `server/test/fakes.ts`, `server/test/payos.test.ts`.

---

### Task 2: Kiểm chữ ký và đọc webhook của Creem

**Files:**
- Create: `server/src/payment/creem-webhook.ts`
- Create (test): `server/test/creem-webhook.test.ts`

Theo https://docs.creem.io/code/webhooks: header `creem-signature` là HMAC-SHA256 dạng hex của thân thô, khóa là secret của endpoint; không có timestamp. Webhook chỉ là cái cò (server luôn hỏi lại API Creem trước khi cấp, Task 7), nên một webhook bị phát lại không làm hại gì. `request_id` do ta đặt là `String(order_code)`.

- [ ] **Step 1: Viết test (có một đáp án biết trước tính độc lập bằng Python)**

**Tạo `server/test/creem-webhook.test.ts`:**

```ts
import { describe, expect, it } from "vitest";
import { hmacSha256Hex } from "../src/crypto";
import { CREEM_SIGNATURE_HEADER, verifyCreemWebhook } from "../src/payment/creem-webhook";

const SECRET = "whsec_test_secret_không_dùng_ở_đâu_khác";

/** Payload `checkout.completed` rút gọn theo ví dụ trong tài liệu Creem (https://docs.creem.io/code/webhooks). */
function completed(requestId: unknown) {
  return {
    id: "evt_5WHHcZPv7VS0YUsberIuOz",
    eventType: "checkout.completed",
    created_at: 1728734325927,
    object: {
      id: "ch_4l0N34kxo16AhRKUHFUuXr",
      object: "checkout",
      request_id: requestId,
      order: { id: "ord_4aDwWXjMLpes4Kj4XqNnUA", amount: 399, currency: "USD", status: "paid", type: "onetime" },
      status: "completed",
    },
  };
}

/** Webhook thô như route đưa cho provider: ký bằng SECRET trừ khi `header` hay `secret` được chỉ định. */
async function hook(body: unknown, opts: { secret?: string; header?: string | null; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const headers = new Headers();
  const signature = opts.header === undefined ? await hmacSha256Hex(opts.secret ?? SECRET, raw) : opts.header;
  if (signature !== null) headers.set(CREEM_SIGNATURE_HEADER, signature);
  return { rawBody: raw, headers };
}

describe("Creem: chữ ký webhook", () => {
  it("đúng chữ ký, request_id là mã đơn: trả cò cấp license cho đơn đó", async () => {
    expect(await verifyCreemWebhook(SECRET, await hook(completed("1000042")))).toEqual({ kind: "payment", orderCode: 1000042 });
  });

  it("đáp án biết trước: HMAC-SHA256 hex của thân thô tính độc lập bằng Python", async () => {
    const raw = '{"id":"evt_1","eventType":"checkout.completed","object":{"id":"ch_1","request_id":"42"}}';
    const headers = new Headers({ [CREEM_SIGNATURE_HEADER]: "002d694ce2ad7baa476c3a16e22206781402d023096c4f664bbac80efab5ad81" });
    expect(await verifyCreemWebhook("whsec_known_answer", { rawBody: raw, headers })).toEqual({ kind: "payment", orderCode: 42 });
    expect(await verifyCreemWebhook("whsec_khac", { rawBody: raw, headers })).toBeNull();
  });

  it("chữ ký hex viết hoa vẫn nhận (HMAC hex không phân biệt hoa thường)", async () => {
    const raw = JSON.stringify(completed("7"));
    const upper = (await hmacSha256Hex(SECRET, raw)).toUpperCase();
    expect(await verifyCreemWebhook(SECRET, await hook(null, { raw, header: ` ${upper} ` }))).toEqual({ kind: "payment", orderCode: 7 });
  });

  it("thiếu header, header rỗng, header không phải hex: null (sai chữ ký)", async () => {
    const body = completed("7");
    expect(await verifyCreemWebhook(SECRET, await hook(body, { header: null }))).toBeNull();
    expect(await verifyCreemWebhook(SECRET, await hook(body, { header: "" }))).toBeNull();
    expect(await verifyCreemWebhook(SECRET, await hook(body, { header: "zz-not-hex" }))).toBeNull();
  });

  it("sai secret: null", async () => {
    expect(await verifyCreemWebhook(SECRET, await hook(completed("7"), { secret: "secret-khac" }))).toBeNull();
  });

  it("thân bị sửa sau khi ký (đổi số tiền hay mã đơn): null", async () => {
    const original = JSON.stringify(completed("7"));
    const signature = await hmacSha256Hex(SECRET, original);
    for (const tampered of [original.replace('"amount":399', '"amount":1'), original.replace('"7"', '"8"'), `${original} `]) {
      expect(await verifyCreemWebhook(SECRET, await hook(null, { raw: tampered, header: signature }))).toBeNull();
    }
  });

  it("đúng chữ ký mà nội dung không đọc được: \"malformed\", không phải null (không phải giả mạo)", async () => {
    for (const raw of ["{", "", "null", "[]", "42", '{"object":{}}', '{"eventType":"checkout.completed"}', '{"eventType":7,"object":{}}']) {
      expect(await verifyCreemWebhook(SECRET, await hook(null, { raw })), raw).toBe("malformed");
    }
  });

  it.each([
    ["số, không phải chuỗi", 42],
    ["null", null],
    ["thiếu", undefined],
    ["không phải số (ví dụ trong tài liệu Creem)", "my-request-id"],
    ["số 0", "0"],
    ["số 0 đầu", "007"],
    ["số âm", "-5"],
    ["số lẻ", "1.5"],
    ["quá lớn", "9".repeat(17)],
    ["có khoảng trắng", " 42"],
  ])("checkout.completed mà request_id %s: \"malformed\"", async (_why, requestId) => {
    expect(await verifyCreemWebhook(SECRET, await hook(completed(requestId)))).toBe("malformed");
  });

  it("sự kiện server không dùng: ignore (route trả 200, không hỏi gì thêm)", async () => {
    for (const eventType of ["subscription.paid", "subscription.active", "credits.granted"]) {
      expect(await verifyCreemWebhook(SECRET, await hook({ ...completed("7"), eventType }))).toEqual({ kind: "ignore" });
    }
  });
});
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/creem-webhook.test.ts 2>&1 | grep -E "Cannot find module|Test Files"`
Expected: FAIL: `Cannot find module '../src/payment/creem-webhook'`.

- [ ] **Step 3: Viết `creem-webhook.ts`**

**Tạo `server/src/payment/creem-webhook.ts`:**

```ts
// Kiểm chữ ký và đọc webhook của Creem (spec 2026-10-14-creem-international-payment-design §4.2).
// https://docs.creem.io/code/webhooks: header `creem-signature` là HMAC-SHA256 dạng hex của THÂN THÔ, khóa là secret của
// endpoint; không có timestamp hay phiên bản. Webhook chỉ là cái cò: server luôn hỏi lại API Creem trước khi cấp license
// (orders.ts, fulfilOrder), nên một webhook bị phát lại hay bị chặn giữa đường không làm hại gì.
import { hmacSha256Hex, timingSafeEqual } from "../crypto";
import type { WebhookEvent, WebhookRequest } from "./provider";

export const CREEM_SIGNATURE_HEADER = "creem-signature";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `request_id` do ta đặt là `String(order_code)`: chỉ nhận số nguyên dương viết bằng chữ số, không có số 0 đầu. */
function orderCodeOf(requestId: unknown): number | null {
  if (typeof requestId !== "string" || !/^[1-9][0-9]{0,15}$/.test(requestId)) return null;
  const n = Number(requestId);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * null: thiếu hay sai chữ ký (route trả 400 và tạo cảnh báo). "malformed": đúng chữ ký (đúng là Creem gửi) nhưng nội dung
 * không đọc được. Sự kiện server không dùng thì `{ kind: "ignore" }`.
 */
export async function verifyCreemWebhook(secret: string, req: WebhookRequest): Promise<WebhookEvent | "malformed" | null> {
  const signature = req.headers.get(CREEM_SIGNATURE_HEADER);
  if (signature === null) return null;
  const expected = await hmacSha256Hex(secret, req.rawBody);
  if (!timingSafeEqual(expected, signature.trim().toLowerCase())) return null;
  let body: unknown;
  try {
    body = JSON.parse(req.rawBody);
  } catch {
    return "malformed";
  }
  if (!isRecord(body) || typeof body.eventType !== "string" || !isRecord(body.object)) return "malformed";
  if (body.eventType === "checkout.completed") {
    const orderCode = orderCodeOf(body.object.request_id);
    return orderCode === null ? "malformed" : { kind: "payment", orderCode };
  }
  return { kind: "ignore" };
}
```

- [ ] **Step 4: Chạy test và typecheck**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/creem-webhook.test.ts 2>&1 | grep -E "Test Files|Tests " && pnpm typecheck`
Expected: `Test Files  1 passed (1)`, `Tests  18 passed (18)`; `tsc` không lỗi.

- [ ] **Step 5: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- server | grep creem-webhook`
Expected: hai dòng `??`: `server/src/payment/creem-webhook.ts`, `server/test/creem-webhook.test.ts`.

---

### Task 3: `CreemProvider`: tạo phiên thanh toán

**Files:**
- Create: `server/src/payment/creem.ts`
- Modify (test): `server/test/fakes.ts` (thêm `FakeCreem`)
- Create (test): `server/test/creem.test.ts`

`POST https://api.creem.io/v1/checkouts` (header `x-api-key`) với `product_id` của gói, `request_id` là mã đơn, `custom_price` là giá tính bằng cent (ghi đè giá của sản phẩm một lần, nên giá bán nằm ở `PLANS` của server), `success_url`, `customer.email`, `metadata`. Trả `id` và `checkout_url`. Chỉ nhận `checkout_url` ở **đúng** tên miền `checkout.creem.io` (không nhận tên miền con, cổng lạ, `http`, userinfo), để không bao giờ đưa URL lạ cho app. `getPaymentStatus` tạm báo lỗi và được cài ở Task 4.

- [ ] **Step 1: Thêm `FakeCreem` (mức HTTP) và viết test**

**Sửa `server/test/fakes.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/fakes.ts
+++ b/server/test/fakes.ts
@@ -188,6 +188,77 @@
   };
 }
 
+export const TEST_CREEM_API_KEY = "ck_test_not_used_anywhere_else";
+export const TEST_CREEM_WEBHOOK_SECRET = "whsec_test_creem_not_used_anywhere_else";
+export const TEST_CREEM_PRODUCTS = { monthly: "prod_monthly", six_months: "prod_six_months", yearly: "prod_yearly" } as const;
+
+interface FakeCreemCheckout {
+  id: string;
+  productId: string;
+  requestId: string;
+  customPrice: number;
+  email: string | null;
+  successUrl: string;
+  metadata: Record<string, unknown>;
+}
+
+/**
+ * Creem giả ở mức HTTP (chỉ phần tạo phiên thanh toán ở bước này): provider chạy đúng code thật, chỉ thay hàm fetch.
+ * Hình dạng response theo https://docs.creem.io/api-reference/endpoint/create-checkout.
+ */
+export class FakeCreem {
+  readonly checkouts = new Map<string, FakeCreemCheckout>();
+  readonly requests: { method: string; path: string; apiKey: string | undefined; body: Record<string, unknown> | null }[] = [];
+  down = false;
+  private seq = 0;
+
+  readonly fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
+    const u = new URL(url);
+    const method = init.method ?? "GET";
+    const headers = new Headers(init.headers);
+    const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
+    this.requests.push({ method, path: u.pathname + u.search, apiKey: headers.get("x-api-key") ?? undefined, body });
+    if (this.down) throw new TypeError("fetch failed");
+    if (headers.get("x-api-key") !== TEST_CREEM_API_KEY) return json({ trace_id: "trace-auth", status: 403, error: "Forbidden" }, 403);
+    if (method === "POST" && u.pathname === "/v1/checkouts" && body) {
+      const productId = body.product_id;
+      const requestId = body.request_id;
+      const customPrice = body.custom_price;
+      const known = Object.values(TEST_CREEM_PRODUCTS) as string[];
+      if (typeof productId !== "string" || !known.includes(productId)) return json({ trace_id: "trace-400", status: 400, error: "product_id lạ" }, 400);
+      if (typeof requestId !== "string" || !Number.isInteger(customPrice) || (customPrice as number) < 100) {
+        return json({ trace_id: "trace-400", status: 400, error: "request_id hay custom_price sai" }, 400);
+      }
+      const id = `ch_fake${++this.seq}`;
+      const customer = body.customer as { email?: string } | undefined;
+      const checkout: FakeCreemCheckout = {
+        id,
+        productId,
+        requestId,
+        customPrice: customPrice as number,
+        email: customer?.email ?? null,
+        successUrl: String(body.success_url ?? ""),
+        metadata: (body.metadata ?? {}) as Record<string, unknown>,
+      };
+      this.checkouts.set(id, checkout);
+      return json({
+        id,
+        object: "checkout",
+        mode: "test",
+        status: "pending",
+        request_id: requestId,
+        product: productId,
+        units: 1,
+        custom_price: customPrice,
+        checkout_url: `https://checkout.creem.io/${id}`,
+        success_url: checkout.successUrl,
+        metadata: checkout.metadata,
+      });
+    }
+    return json({ trace_id: "trace-404", status: 404, error: "Not Found" }, 404);
+  };
+}
+
 /** Cổng thanh toán giả thứ hai, để kiểm webhook và đối soát chọn cổng theo orders.provider (QĐ28). */
 export class FakeGateway implements PaymentProvider {
   readonly name = "fakepay";
```

**Tạo `server/test/creem.test.ts`:**

```ts
import { describe, expect, it } from "vitest";
import { CREEM_CHECKOUT_HOST, CreemProvider } from "../src/payment/creem";
import { PaymentProviderError } from "../src/payment/provider";
import type { PlanCode } from "../src/plans";
import { FakeCreem, TEST_CREEM_API_KEY, TEST_CREEM_PRODUCTS, TEST_CREEM_WEBHOOK_SECRET } from "./fakes";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function provider(fetchFn: FetchFn, apiKey = TEST_CREEM_API_KEY) {
  return new CreemProvider(
    { baseUrl: "https://creem.test", apiKey, webhookSecret: TEST_CREEM_WEBHOOK_SECRET, productIds: { ...TEST_CREEM_PRODUCTS } },
    fetchFn,
  );
}

const req = {
  orderCode: 1000042,
  amount: 399,
  currency: "USD",
  description: "AT1000042",
  returnUrl: "https://license.test/v1/pay/return",
  cancelUrl: "https://license.test/v1/pay/cancel",
  expiresAt: 1_790_814_600,
  plan: "monthly" as PlanCode,
  email: "buyer@example.com",
};

describe("Creem: tạo phiên thanh toán", () => {
  it("gửi đúng khóa API, sản phẩm của gói, request_id là mã đơn, giá tính bằng cent; trả link và không có mã QR", async () => {
    const fake = new FakeCreem();
    const result = await provider(fake.fetch).createCheckout(req);
    expect(result).toEqual({ providerRef: "ch_fake1", checkoutUrl: "https://checkout.creem.io/ch_fake1", qrCode: null });
    expect(fake.requests).toEqual([
      {
        method: "POST",
        path: "/v1/checkouts",
        apiKey: TEST_CREEM_API_KEY,
        body: {
          product_id: "prod_monthly",
          request_id: "1000042",
          custom_price: 399,
          success_url: "https://license.test/v1/pay/return",
          customer: { email: "buyer@example.com" },
          metadata: { order_code: "1000042", plan: "monthly" },
        },
      },
    ]);
    expect(fake.checkouts.get("ch_fake1")).toMatchObject({ requestId: "1000042", customPrice: 399, email: "buyer@example.com" });
  });

  it.each([
    ["monthly", 399, "prod_monthly"],
    ["six_months", 2199, "prod_six_months"],
    ["yearly", 3999, "prod_yearly"],
  ] as const)("gói %s: sản phẩm %s theo bảng mã sản phẩm, giá %i cent", async (plan, amount, productId) => {
    const fake = new FakeCreem();
    await provider(fake.fetch).createCheckout({ ...req, plan, amount });
    expect(fake.requests[0]?.body).toMatchObject({ product_id: productId, custom_price: amount });
  });

  it("không nhận tiền khác USD, và không gọi mạng", async () => {
    const fake = new FakeCreem();
    await expect(provider(fake.fetch).createCheckout({ ...req, currency: "VND" })).rejects.toThrow(/VND/);
    expect(fake.requests).toHaveLength(0);
  });

  it("gói chưa có mã sản phẩm: lỗi rõ ràng, không gọi mạng", async () => {
    const fake = new FakeCreem();
    const p = new CreemProvider(
      { baseUrl: "https://creem.test", apiKey: TEST_CREEM_API_KEY, webhookSecret: "s", productIds: { ...TEST_CREEM_PRODUCTS, yearly: "" } },
      fake.fetch,
    );
    await expect(p.createCheckout({ ...req, plan: "yearly" })).rejects.toThrow(/yearly/);
    expect(fake.requests).toHaveLength(0);
  });

  it.each([
    ["ngoài tên miền thanh toán", "https://evil.example/ch_1"],
    ["http thay vì https", "http://checkout.creem.io/ch_1"],
    ["tên miền con đổi chỗ", "https://checkout.creem.io.evil.example/ch_1"],
    ["có userinfo", "https://user@checkout.creem.io/ch_1"],
    ["cổng lạ", "https://checkout.creem.io:8443/ch_1"],
    ["không phải URL", "không-phải-url"],
  ])("checkout_url %s: từ chối, không bao giờ đưa URL đó cho app", async (_why, url) => {
    const p = provider(async () => new Response(JSON.stringify({ id: "ch_1", checkout_url: url, status: "pending" })));
    await expect(p.createCheckout(req)).rejects.toThrow(PaymentProviderError);
  });

  it("response thiếu id hay checkout_url: lỗi", async () => {
    for (const body of [{ checkout_url: "https://checkout.creem.io/ch_1" }, { id: "ch_1" }, { id: 7, checkout_url: "https://checkout.creem.io/ch_1" }]) {
      const p = provider(async () => new Response(JSON.stringify(body)));
      await expect(p.createCheckout(req)).rejects.toThrow(/id hoặc checkout_url/);
    }
  });

  it("khóa API sai: lỗi mang mã HTTP 403 và trace_id để hỏi hỗ trợ", async () => {
    const fake = new FakeCreem();
    const err = await provider(fake.fetch, "ck_sai").createCheckout(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect((err as PaymentProviderError).httpStatus).toBe(403);
    expect((err as PaymentProviderError).unreachable).toBe(false);
    expect(String(err)).toContain("trace-auth");
  });

  it("HTTP lỗi khác và phản hồi không phải JSON: lỗi có mã HTTP, không phải unreachable", async () => {
    const bad = provider(async () => new Response(JSON.stringify({ trace_id: "t1", status: 400, error: "x" }), { status: 400 }));
    expect(((await bad.createCheckout(req).catch((e: unknown) => e)) as PaymentProviderError).httpStatus).toBe(400);
    const html = provider(async () => new Response("<html>502</html>", { status: 502 }));
    const err = (await html.createCheckout(req).catch((e: unknown) => e)) as PaymentProviderError;
    expect(err.httpStatus).toBe(502);
    expect(err.unreachable).toBe(false);
  });

  it("lỗi mạng và quá thời gian chờ: unreachable, để đối soát dừng sớm", async () => {
    const down = (await provider(async () => Promise.reject(new TypeError("fetch failed"))).createCheckout(req).catch((e: unknown) => e)) as PaymentProviderError;
    expect(String(down)).toBe("PaymentProviderError: Creem không trả lời (TypeError: fetch failed)");
    expect(down.unreachable).toBe(true);
    const slow = (await provider(async () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")))
      .createCheckout(req)
      .catch((e: unknown) => e)) as PaymentProviderError;
    expect(String(slow)).toBe("PaymentProviderError: Creem không trả lời sau 10 giây");
    expect(slow.unreachable).toBe(true);
  });

  it("tên miền trang thanh toán là hằng của provider", () => {
    expect(CREEM_CHECKOUT_HOST).toBe("checkout.creem.io");
  });
});
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/creem.test.ts 2>&1 | grep -E "Cannot find module|Test Files"`
Expected: FAIL: `Cannot find module '../src/payment/creem'`.

- [ ] **Step 3: Viết `creem.ts` (tạo phiên, chữ ký webhook; hỏi trạng thái tạm báo lỗi)**

**Tạo `server/src/payment/creem.ts`:**

```ts
// Cài đặt PaymentProvider cho Creem: Merchant of Record, bán bằng USD cho khách ngoài Việt Nam (spec
// 2026-10-14-creem-international-payment-design §4.2). Tài liệu đã đọc (2026-10-14):
// - API: https://docs.creem.io/api-reference/introduction (khóa trong header x-api-key; POST /v1/checkouts,
//   GET /v1/checkouts?checkout_id=)
// - Webhook: https://docs.creem.io/code/webhooks (creem-webhook.ts)
// Sandbox riêng (test-api.creem.io) KHÔNG bao giờ nối vào Worker: luật một môi trường (spec 2026-10-04). Test dùng
// FakeCreem (test/fakes.ts) thay hàm fetch.
import type { PlanCode } from "../plans";
import { verifyCreemWebhook } from "./creem-webhook";
import type { FetchFn } from "./payos";
import {
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentProvider,
  PaymentProviderError,
  type PaymentStatusResult,
  type WebhookEvent,
  type WebhookRequest,
} from "./provider";

export interface CreemConfig {
  /** Gốc API, không có `/v1` và không có `/` cuối. Production: https://api.creem.io. */
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  /** Mã sản phẩm Creem của từng gói (sản phẩm trả một lần, USD, tax_mode exclusive). */
  productIds: Record<PlanCode, string>;
}

const USER_AGENT = "license-server/1.0";
const TIMEOUT_MS = 10_000;
/** Trang thanh toán của Creem. Chỉ tên miền này được trả cho app, và app cũng chỉ mở đúng tên miền này (navigation.rs). */
export const CREEM_CHECKOUT_HOST = "checkout.creem.io";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isCreemCheckoutUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname === CREEM_CHECKOUT_HOST && url.port === "" && url.username === "" && url.password === "";
}

export class CreemProvider implements PaymentProvider {
  readonly name = "creem";

  constructor(
    private readonly cfg: CreemConfig,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    if (req.currency !== "USD") throw new PaymentProviderError(`Creem không nhận ${req.currency}`);
    const productId = this.cfg.productIds[req.plan];
    if (!productId) throw new PaymentProviderError(`Creem chưa có sản phẩm cho gói ${req.plan}`);
    // `custom_price` (cent, từ 100) ghi đè giá của sản phẩm một lần: giá bán nằm ở PLANS của server, không ở dashboard Creem.
    const data = await this.call("POST", "/v1/checkouts", {
      product_id: productId,
      request_id: String(req.orderCode),
      custom_price: req.amount,
      success_url: req.returnUrl,
      customer: { email: req.email },
      metadata: { order_code: String(req.orderCode), plan: req.plan },
    });
    const { id, checkout_url: checkoutUrl } = data;
    if (typeof id !== "string" || typeof checkoutUrl !== "string") {
      throw new PaymentProviderError("Creem trả thiếu id hoặc checkout_url");
    }
    if (!isCreemCheckoutUrl(checkoutUrl)) throw new PaymentProviderError("Creem trả checkout_url ngoài tên miền thanh toán");
    return { providerRef: id, checkoutUrl, qrCode: null };
  }

  verifyWebhook(req: WebhookRequest): Promise<WebhookEvent | "malformed" | null> {
    return verifyCreemWebhook(this.cfg.webhookSecret, req);
  }

  async getPaymentStatus(_ref: { orderCode: number; providerRef: string | null }): Promise<PaymentStatusResult> {
    throw new PaymentProviderError("Creem: getPaymentStatus chưa cài");
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<Record<string, unknown>> {
    const init: RequestInit = {
      method,
      headers: { "x-api-key": this.cfg.apiKey, "content-type": "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.cfg.baseUrl}${path}`, init);
    } catch (err) {
      // Lỗi mạng hay quá thời gian chờ: bên gọi chỉ cần biết là không liên lạc được với cổng.
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new PaymentProviderError(`Creem không trả lời sau ${TIMEOUT_MS / 1000} giây`, undefined, undefined, true);
      }
      throw new PaymentProviderError(`Creem không trả lời (${String(err)})`, undefined, undefined, true);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new PaymentProviderError(`Creem trả HTTP ${res.status} không phải JSON`, undefined, res.status);
    }
    if (!res.ok || !isRecord(json)) {
      // Mọi lỗi của Creem có `trace_id`: ghi lại để hỏi hỗ trợ; không ghi nội dung lỗi gốc.
      const trace = isRecord(json) && typeof json.trace_id === "string" ? ` (trace_id ${json.trace_id})` : "";
      throw new PaymentProviderError(`Creem lỗi HTTP ${res.status}${trace}`, undefined, res.status);
    }
    return json;
  }
}
```

- [ ] **Step 4: Chạy test, typecheck và toàn bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/creem.test.ts 2>&1 | grep -E "Test Files|Tests " && pnpm typecheck && pnpm test 2>&1 | grep -E "Test Files|Tests "`
Expected: `Tests  17 passed (17)` cho `creem.test.ts`; `tsc` không lỗi; toàn bộ `Test Files  27 passed (27)`, `Tests  715 passed (715)`.

- [ ] **Step 5: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- server | grep -E "creem|fakes"`
Expected: `?? server/src/payment/creem-webhook.ts`, `?? server/src/payment/creem.ts`, `?? server/test/creem-webhook.test.ts`, `?? server/test/creem.test.ts`, ` M server/test/fakes.ts`.

---

### Task 4: `CreemProvider`: hỏi trạng thái đơn

**Files:**
- Modify: `server/src/payment/provider.ts`, `server/src/payment/creem.ts`
- Modify (test): `server/test/fakes.ts`, `server/test/creem.test.ts`

`GET /v1/checkouts?checkout_id=` trả `status` của phiên (`pending`, `processing`, `completed`, `expired`), `request_id` và đối tượng `order`. Ánh xạ:

| Creem | `PaymentStatus` |
|---|---|
| `pending`, `processing`, `expired` | cùng tên |
| `completed` và `order.status` là `paid` hay `partially_refunded` | `paid` |
| `completed` và `order.status = refunded` | `refunded` (đơn trả rồi hoàn đủ trước khi ta cấp license: **không cấp**) |
| `completed` và `order.status = pending`, hay chưa có `order` | `processing` |
| trạng thái lạ | `PaymentProviderError` |

`amount` là `order.amount` (giá niêm yết, trước thuế), `amountPaid` là `order.sub_total` (không gồm thuế khách trả thêm), thiếu `sub_total` thì `order.amount`. Phiên chưa có đơn: `amount` là `custom_price` đã gửi, `amountPaid` là 0. `request_id` của phiên phải khớp mã đơn (không bao giờ cấp nhầm đơn). `paidAt` luôn `null`: Creem không báo thời điểm ở phiên.

- [ ] **Step 1: `PaymentStatus` thêm `"refunded"`; `FakeCreem` biết hỏi phiên và khách trả tiền**

**Sửa `server/src/payment/provider.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/payment/provider.ts
+++ b/server/src/payment/provider.ts
@@ -3,7 +3,8 @@
 // Tên hàm theo spec: create_checkout, verify_webhook, get_payment_status.
 import type { PlanCode } from "../plans";
 
-export type PaymentStatus = "pending" | "processing" | "paid" | "underpaid" | "cancelled" | "expired" | "failed";
+/** `refunded`: cổng báo đơn đã trả rồi hoàn đủ trước khi ta cấp license (khi đó không cấp). */
+export type PaymentStatus = "pending" | "processing" | "paid" | "underpaid" | "cancelled" | "expired" | "failed" | "refunded";
 
 export interface CheckoutRequest {
   orderCode: number;
```

**Sửa `server/test/fakes.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/fakes.ts
+++ b/server/test/fakes.ts
@@ -200,17 +200,89 @@
   email: string | null;
   successUrl: string;
   metadata: Record<string, unknown>;
+  status: "pending" | "processing" | "completed" | "expired";
+  order: { id: string; status: string; amount: number; tax: number } | null;
 }
 
 /**
- * Creem giả ở mức HTTP (chỉ phần tạo phiên thanh toán ở bước này): provider chạy đúng code thật, chỉ thay hàm fetch.
- * Hình dạng response theo https://docs.creem.io/api-reference/endpoint/create-checkout.
+ * Creem giả ở mức HTTP: provider chạy đúng code thật, chỉ thay hàm fetch. Hình dạng response theo
+ * https://docs.creem.io/api-reference/endpoint/create-checkout và get-checkout.
  */
 export class FakeCreem {
   readonly checkouts = new Map<string, FakeCreemCheckout>();
   readonly requests: { method: string; path: string; apiKey: string | undefined; body: Record<string, unknown> | null }[] = [];
   down = false;
+  /**
+   * Lỗi cho các lần hỏi phiên kế tiếp, lần lượt: mã HTTP (200 là trả bình thường), "timeout" (fetch ném TimeoutError như
+   * AbortSignal.timeout) hay "network" (fetch ném TypeError). Hết hàng đợi thì trả bình thường.
+   */
+  statusFailures: (number | "timeout" | "network")[] = [];
   private seq = 0;
+
+  private must(checkoutId: string): FakeCreemCheckout {
+    const c = this.checkouts.get(checkoutId);
+    if (!c) throw new Error(`không có phiên ${checkoutId}`);
+    return c;
+  }
+
+  /** Mã phiên của đơn (theo request_id = mã đơn của ta). */
+  checkoutIdOf(orderCode: number): string {
+    const found = [...this.checkouts.values()].find((c) => c.requestId === String(orderCode));
+    if (!found) throw new Error(`không có phiên cho đơn ${orderCode}`);
+    return found.id;
+  }
+
+  /** Khách trả đủ giá cho phiên. `tax` là thuế Creem cộng ngoài giá (sản phẩm tax_mode exclusive): khách trả giá + thuế. */
+  pay(checkoutId: string, tax = 0): void {
+    const c = this.must(checkoutId);
+    c.status = "completed";
+    c.order = { id: `ord_${c.id.slice(3)}`, status: "paid", amount: c.customPrice, tax };
+  }
+
+  setStatus(checkoutId: string, status: FakeCreemCheckout["status"]): void {
+    this.must(checkoutId).status = status;
+  }
+
+  setOrderStatus(checkoutId: string, status: string): void {
+    const c = this.must(checkoutId);
+    if (!c.order) throw new Error(`phiên ${checkoutId} chưa có đơn`);
+    c.order.status = status;
+  }
+
+  private entity(c: FakeCreemCheckout) {
+    return {
+      id: c.id,
+      object: "checkout",
+      mode: "test",
+      status: c.status,
+      request_id: c.requestId,
+      product: c.productId,
+      units: 1,
+      custom_price: c.customPrice,
+      checkout_url: `https://checkout.creem.io/${c.id}`,
+      success_url: c.successUrl,
+      metadata: c.metadata,
+      ...(c.order
+        ? {
+            order: {
+              object: "order",
+              id: c.order.id,
+              customer: "cust_fake",
+              product: c.productId,
+              amount: c.order.amount,
+              sub_total: c.order.amount,
+              tax_amount: c.order.tax,
+              amount_due: c.order.amount + c.order.tax,
+              amount_paid: c.order.amount + c.order.tax,
+              currency: "USD",
+              status: c.order.status,
+              type: "onetime",
+              mode: "test",
+            },
+          }
+        : {}),
+    };
+  }
 
   readonly fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
     const u = new URL(url);
@@ -239,6 +311,8 @@
         email: customer?.email ?? null,
         successUrl: String(body.success_url ?? ""),
         metadata: (body.metadata ?? {}) as Record<string, unknown>,
+        status: "pending",
+        order: null,
       };
       this.checkouts.set(id, checkout);
       return json({
@@ -255,6 +329,14 @@
         metadata: checkout.metadata,
       });
     }
+    if (method === "GET" && u.pathname === "/v1/checkouts") {
+      const failure = this.statusFailures.shift();
+      if (failure === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
+      if (failure === "network") throw new TypeError("fetch failed");
+      if (failure !== undefined && failure !== 200) return json({ trace_id: "trace-fail", status: failure, error: "lỗi giả" }, failure);
+      const found = this.checkouts.get(u.searchParams.get("checkout_id") ?? "");
+      return found ? json(this.entity(found)) : json({ trace_id: "trace-404", status: 404, error: "Not Found" }, 404);
+    }
     return json({ trace_id: "trace-404", status: 404, error: "Not Found" }, 404);
   };
 }
```

- [ ] **Step 2: Viết test trạng thái đơn**

**Sửa `server/test/creem.test.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/creem.test.ts
+++ b/server/test/creem.test.ts
@@ -126,3 +126,103 @@
     expect(CREEM_CHECKOUT_HOST).toBe("checkout.creem.io");
   });
 });
+
+describe("Creem: trạng thái đơn", () => {
+  /** Tạo một phiên cho đơn 1000042 (gói Monthly, 3,99 USD) và trả về provider cùng tham chiếu để hỏi lại. */
+  async function started() {
+    const fake = new FakeCreem();
+    const p = provider(fake.fetch);
+    const { providerRef } = await p.createCheckout(req);
+    return { fake, p, ref: { orderCode: req.orderCode, providerRef } };
+  }
+
+  it("hỏi đúng GET /v1/checkouts?checkout_id=…; phiên chưa trả: pending, giá là custom_price, chưa nhận đồng nào", async () => {
+    const { fake, p, ref } = await started();
+    expect(await p.getPaymentStatus(ref)).toEqual({ orderCode: 1000042, status: "pending", amount: 399, amountPaid: 0, paidAt: null });
+    expect(fake.requests.at(-1)).toMatchObject({ method: "GET", path: "/v1/checkouts?checkout_id=ch_fake1", apiKey: TEST_CREEM_API_KEY, body: null });
+  });
+
+  it("khách đã trả: paid, amount là giá niêm yết, amountPaid không gồm thuế dù khách trả thêm thuế", async () => {
+    const { fake, p, ref } = await started();
+    fake.pay(ref.providerRef!, 80);
+    expect(await p.getPaymentStatus(ref)).toEqual({ orderCode: 1000042, status: "paid", amount: 399, amountPaid: 399, paidAt: null });
+  });
+
+  it.each([
+    ["processing", "processing"],
+    ["expired", "expired"],
+  ] as const)("phiên Creem %s thành %s", async (creem, ours) => {
+    const { fake, p, ref } = await started();
+    fake.setStatus(ref.providerRef!, creem);
+    expect((await p.getPaymentStatus(ref)).status).toBe(ours);
+  });
+
+  it.each([
+    ["paid", "paid"],
+    ["partially_refunded", "paid"],
+    ["refunded", "refunded"],
+    ["pending", "processing"],
+  ])("phiên đã hoàn tất mà đơn là %s: %s", async (orderStatus, ours) => {
+    const { fake, p, ref } = await started();
+    fake.pay(ref.providerRef!);
+    fake.setOrderStatus(ref.providerRef!, orderStatus);
+    const st = await p.getPaymentStatus(ref);
+    expect(st.status).toBe(ours);
+    expect(st.amount).toBe(399);
+  });
+
+  it("phiên đã hoàn tất mà chưa có đơn: processing (hỏi lại sau), giá vẫn là custom_price", async () => {
+    const { fake, p, ref } = await started();
+    fake.setStatus(ref.providerRef!, "completed");
+    expect(await p.getPaymentStatus(ref)).toMatchObject({ status: "processing", amount: 399, amountPaid: 0 });
+  });
+
+  it("amountPaid lấy sub_total; thiếu sub_total thì lấy amount", async () => {
+    const entity = (order: Record<string, unknown>) =>
+      new Response(JSON.stringify({ id: "ch_1", status: "completed", request_id: "1000042", custom_price: 399, order: { currency: "USD", status: "paid", ...order } }));
+    const ref = { orderCode: 1000042, providerRef: "ch_1" };
+    expect(await provider(async () => entity({ amount: 399, sub_total: 399, amount_paid: 479 })).getPaymentStatus(ref)).toMatchObject({ amount: 399, amountPaid: 399 });
+    expect(await provider(async () => entity({ amount: 399, amount_paid: 479 })).getPaymentStatus(ref)).toMatchObject({ amount: 399, amountPaid: 399 });
+  });
+
+  it.each([
+    ["chưa có mã phiên", { orderCode: 1000042, providerRef: null }],
+  ])("%s: lỗi, không gọi mạng", async (_why, ref) => {
+    const fake = new FakeCreem();
+    await expect(provider(fake.fetch).getPaymentStatus(ref)).rejects.toThrow(/chưa có mã phiên/);
+    expect(fake.requests).toHaveLength(0);
+  });
+
+  it("request_id của phiên khác mã đơn: lỗi (không bao giờ cấp nhầm đơn)", async () => {
+    const { p } = await started();
+    await expect(p.getPaymentStatus({ orderCode: 1000043, providerRef: "ch_fake1" })).rejects.toThrow(/request_id/);
+  });
+
+  it.each([
+    ["trạng thái phiên lạ", { id: "ch_1", status: "chờ", request_id: "1000042", custom_price: 399 }],
+    ["trạng thái đơn lạ", { id: "ch_1", status: "completed", request_id: "1000042", custom_price: 399, order: { amount: 399, currency: "USD", status: "disputed" } }],
+    ["đơn không phải USD", { id: "ch_1", status: "completed", request_id: "1000042", custom_price: 399, order: { amount: 399, currency: "EUR", status: "paid" } }],
+    ["số tiền của đơn không phải số nguyên", { id: "ch_1", status: "completed", request_id: "1000042", custom_price: 399, order: { amount: 3.99, currency: "USD", status: "paid" } }],
+    ["phiên chưa trả mà thiếu custom_price", { id: "ch_1", status: "pending", request_id: "1000042" }],
+  ])("%s: PaymentProviderError", async (_why, body) => {
+    const p = provider(async () => new Response(JSON.stringify(body)));
+    await expect(p.getPaymentStatus({ orderCode: 1000042, providerRef: "ch_1" })).rejects.toThrow(PaymentProviderError);
+  });
+
+  it("phiên không tồn tại (404), khóa sai (403), lỗi tạm (500): PaymentProviderError mang mã HTTP", async () => {
+    const { fake, p, ref } = await started();
+    expect(((await p.getPaymentStatus({ ...ref, providerRef: "ch_khong_co" }).catch((e: unknown) => e)) as PaymentProviderError).httpStatus).toBe(404);
+    fake.statusFailures = [500];
+    expect(((await p.getPaymentStatus(ref).catch((e: unknown) => e)) as PaymentProviderError).httpStatus).toBe(500);
+    const wrongKey = provider(fake.fetch, "ck_sai");
+    expect(((await wrongKey.getPaymentStatus(ref).catch((e: unknown) => e)) as PaymentProviderError).httpStatus).toBe(403);
+  });
+
+  it("lỗi mạng và quá thời gian chờ: unreachable; hàng đợi lỗi hết thì trả lời bình thường", async () => {
+    const { fake, p, ref } = await started();
+    fake.statusFailures = ["network", "timeout"];
+    expect(((await p.getPaymentStatus(ref).catch((e: unknown) => e)) as PaymentProviderError).unreachable).toBe(true);
+    expect(((await p.getPaymentStatus(ref).catch((e: unknown) => e)) as PaymentProviderError).unreachable).toBe(true);
+    expect((await p.getPaymentStatus(ref)).status).toBe("pending");
+  });
+});
```

- [ ] **Step 3: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/creem.test.ts 2>&1 | grep -E "Test Files|Tests "`
Expected: FAIL: `Tests  14 failed | 22 passed (36)` (hàm `getPaymentStatus` còn báo "chưa cài"; 5 test lỗi mong đợi vẫn qua vì stub cũng ném `PaymentProviderError`).

- [ ] **Step 4: Cài `getPaymentStatus`**

**Sửa `server/src/payment/creem.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/payment/creem.ts
+++ b/server/src/payment/creem.ts
@@ -13,6 +13,7 @@
   type CheckoutResult,
   type PaymentProvider,
   PaymentProviderError,
+  type PaymentStatus,
   type PaymentStatusResult,
   type WebhookEvent,
   type WebhookRequest,
@@ -44,6 +45,26 @@
     return false;
   }
   return url.protocol === "https:" && url.hostname === CREEM_CHECKOUT_HOST && url.port === "" && url.username === "" && url.password === "";
+}
+
+/**
+ * Trạng thái của đơn trong phiên đã hoàn tất. OpenAPI của Creem chỉ liệt kê `pending` và `paid`; tài liệu một-lần-trả còn
+ * nhắc `refunded` và `partially_refunded`. Giá trị lạ thì báo lỗi, không đoán.
+ */
+function paymentOf(order: Record<string, unknown> | null): PaymentStatus {
+  // Phiên đã hoàn tất mà đơn chưa có hay chưa thu tiền: coi là đang xử lý, hỏi lại sau.
+  if (order === null) return "processing";
+  switch (order.status) {
+    case "paid":
+    case "partially_refunded":
+      return "paid";
+    case "refunded":
+      return "refunded";
+    case "pending":
+      return "processing";
+    default:
+      throw new PaymentProviderError("Creem trả trạng thái đơn không đọc được");
+  }
 }
 
 export class CreemProvider implements PaymentProvider {
@@ -79,8 +100,40 @@
     return verifyCreemWebhook(this.cfg.webhookSecret, req);
   }
 
-  async getPaymentStatus(_ref: { orderCode: number; providerRef: string | null }): Promise<PaymentStatusResult> {
-    throw new PaymentProviderError("Creem: getPaymentStatus chưa cài");
+  async getPaymentStatus(ref: { orderCode: number; providerRef: string | null }): Promise<PaymentStatusResult> {
+    const { orderCode, providerRef } = ref;
+    if (providerRef === null) throw new PaymentProviderError(`Đơn ${orderCode} chưa có mã phiên Creem`);
+    const data = await this.call("GET", `/v1/checkouts?checkout_id=${encodeURIComponent(providerRef)}`);
+    // request_id do ta đặt khi tạo phiên: không khớp thì không bao giờ cấp (đó là phiên của đơn khác).
+    if (data.request_id !== String(orderCode)) throw new PaymentProviderError("Creem trả sai request_id");
+    const order = isRecord(data.order) ? data.order : null;
+    let status: PaymentStatus;
+    switch (data.status) {
+      case "pending":
+      case "processing":
+      case "expired":
+        status = data.status;
+        break;
+      case "completed":
+        status = paymentOf(order);
+        break;
+      default:
+        throw new PaymentProviderError("Creem trả trạng thái phiên không đọc được");
+    }
+    if (order === null) {
+      // Chưa có đơn: giá là custom_price ta đã gửi lúc tạo phiên, và chưa nhận đồng nào.
+      const price = data.custom_price;
+      if (!Number.isSafeInteger(price)) throw new PaymentProviderError("Creem trả phiên không có custom_price");
+      return { orderCode, status, amount: price as number, amountPaid: 0, paidAt: null };
+    }
+    if (order.currency !== "USD") throw new PaymentProviderError("Creem trả đơn không phải USD");
+    const { amount, sub_total: subTotal } = order;
+    if (!Number.isSafeInteger(amount)) throw new PaymentProviderError("Creem trả số tiền đơn không đọc được");
+    // Phần tiền thuộc về giá, không gồm thuế (Creem cộng thuế ngoài giá): sub_total, thiếu thì amount.
+    const net = Number.isSafeInteger(subTotal) ? (subTotal as number) : (amount as number);
+    const received = status === "paid" || status === "refunded";
+    // Creem không báo thời điểm thanh toán ở phiên: paidAt null, paymentTime() dùng lúc xử lý (QĐ33).
+    return { orderCode, status, amount: amount as number, amountPaid: received ? net : 0, paidAt: null };
   }
 
   private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<Record<string, unknown>> {
```

- [ ] **Step 5: Chạy test, typecheck và toàn bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/creem.test.ts test/creem-webhook.test.ts 2>&1 | grep -E "Test Files|Tests " && pnpm typecheck && pnpm test 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  2 passed (2)`, `Tests  54 passed (54)`; `tsc` không lỗi; toàn bộ `Test Files  27 passed (27)`, `Tests  734 passed (734)`.

- [ ] **Step 6: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- server | wc -l`
Expected: `11`.

---

### Task 5: Cấu hình Creem và giá USD

**Files:**
- Modify: `server/src/payment/creem.ts` (`parseProductIds`), `server/src/deps.ts` (`creemFromEnv`), `server/src/env.ts`, `server/wrangler.jsonc`, `server/vitest.config.ts`
- Modify (test): `server/test/creem.test.ts`, `server/test/plans.test.ts`, `server/test/checkout.test.ts`, `server/test/node/wrangler-config.test.mjs`

Quyết định liên quan (spec D2): giá USD **399 / 2199 / 3999 cent** cho Monthly / 6 Months / Yearly, giữ tỉ lệ giá mỗi ngày gần bảng VND (6 Months lệch +2,4%, Yearly +0,2%; test đặt sai số 3%). `CREEM_PRODUCT_IDS` trong `wrangler.jsonc` để **chuỗi rỗng** cho tới khi chủ dự án tạo ba sản phẩm ở Creem và điền mã `prod_…` (Kế hoạch 04, runbook): rỗng nghĩa là Creem chưa bật, không có cổng `creem` trong `realDeps`, `GET /v1/plans` không trả giá USD (Task 6). Hai secret `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET` vào `secrets.required`: `wrangler deploy` dừng nếu thiếu secret, nên đặt secret trước khi deploy (runbook).

- [ ] **Step 1: Viết test cấu hình**

**Sửa `server/test/creem.test.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/creem.test.ts
+++ b/server/test/creem.test.ts
@@ -1,5 +1,8 @@
+import { env } from "cloudflare:workers";
 import { describe, expect, it } from "vitest";
-import { CREEM_CHECKOUT_HOST, CreemProvider } from "../src/payment/creem";
+import { creemFromEnv, realDeps } from "../src/deps";
+import type { ApiEnv } from "../src/env";
+import { CREEM_CHECKOUT_HOST, CreemProvider, parseProductIds } from "../src/payment/creem";
 import { PaymentProviderError } from "../src/payment/provider";
 import type { PlanCode } from "../src/plans";
 import { FakeCreem, TEST_CREEM_API_KEY, TEST_CREEM_PRODUCTS, TEST_CREEM_WEBHOOK_SECRET } from "./fakes";
@@ -226,3 +229,47 @@
     expect((await p.getPaymentStatus(ref)).status).toBe("pending");
   });
 });
+
+describe("Creem: cấu hình", () => {
+  const ids = { monthly: "prod_aaa111", six_months: "prod_bbb222", yearly: "prod_ccc333" };
+
+  it("CREEM_PRODUCT_IDS đúng ba gói với mã prod_… thì đọc được", () => {
+    expect(parseProductIds(ids)).toEqual(ids);
+  });
+
+  it.each([
+    ["thiếu biến", undefined],
+    ["không phải object", "prod_aaa111"],
+    ["là mảng", ["prod_aaa111"]],
+    ["chưa điền (chuỗi rỗng): Creem chưa bật", { monthly: "", six_months: "", yearly: "" }],
+    ["một gói chưa điền", { ...ids, yearly: "" }],
+    ["thiếu gói", { monthly: ids.monthly, yearly: ids.yearly }],
+    ["thừa gói lạ", { ...ids, pro: "prod_ddd444" }],
+    ["không có tiền tố prod_", { ...ids, monthly: "aaa111" }],
+    ["có ký tự lạ", { ...ids, monthly: "prod_aaa 111" }],
+    ["không phải chuỗi", { ...ids, monthly: 7 }],
+  ])("CREEM_PRODUCT_IDS %s: null (Creem chưa bật)", (_why, raw) => {
+    expect(parseProductIds(raw)).toBeNull();
+  });
+
+  const full = { CREEM_BASE_URL: "https://creem.test", CREEM_API_KEY: "ck", CREEM_WEBHOOK_SECRET: "ws", CREEM_PRODUCT_IDS: ids };
+
+  it("đủ cấu hình thì dựng được provider tên creem", () => {
+    expect(creemFromEnv(full)?.name).toBe("creem");
+  });
+
+  it.each([
+    ["thiếu khóa API", { CREEM_API_KEY: "" }],
+    ["thiếu secret webhook", { CREEM_WEBHOOK_SECRET: "" }],
+    ["chưa điền mã sản phẩm", { CREEM_PRODUCT_IDS: { monthly: "", six_months: "", yearly: "" } }],
+  ])("%s: không dựng provider", (_why, patch) => {
+    expect(creemFromEnv({ ...full, ...patch })).toBeNull();
+  });
+
+  it("realDeps: cổng creem chỉ có khi Creem đã cấu hình đủ; PayOS luôn có", () => {
+    const withCreem = realDeps({ ...env, ...full } as ApiEnv);
+    expect(Object.keys(withCreem.payments).sort()).toEqual(["creem", "payos"]);
+    // Cấu hình mặc định của repo: mã sản phẩm còn trống, Creem chưa bật.
+    expect(Object.keys(realDeps(env as ApiEnv).payments)).toEqual(["payos"]);
+  });
+});
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/creem.test.ts 2>&1 | grep -E "Test Files|Tests |is not a function" | head -5`
Expected: FAIL: `TypeError: parseProductIds is not a function` (16 test đỏ).

- [ ] **Step 3: Cài `parseProductIds`, `creemFromEnv`, biến môi trường và secret giả cho test**

**Sửa `server/src/payment/creem.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/payment/creem.ts
+++ b/server/src/payment/creem.ts
@@ -5,7 +5,7 @@
 // - Webhook: https://docs.creem.io/code/webhooks (creem-webhook.ts)
 // Sandbox riêng (test-api.creem.io) KHÔNG bao giờ nối vào Worker: luật một môi trường (spec 2026-10-04). Test dùng
 // FakeCreem (test/fakes.ts) thay hàm fetch.
-import type { PlanCode } from "../plans";
+import { PLAN_CODES, type PlanCode } from "../plans";
 import { verifyCreemWebhook } from "./creem-webhook";
 import type { FetchFn } from "./payos";
 import {
@@ -35,6 +35,21 @@
 
 function isRecord(v: unknown): v is Record<string, unknown> {
   return typeof v === "object" && v !== null && !Array.isArray(v);
+}
+
+/**
+ * Đọc biến CREEM_PRODUCT_IDS: đúng ba mã gói, mỗi gói một mã sản phẩm `prod_…`. Thiếu, sai dạng hay còn chuỗi rỗng (Creem
+ * chưa bật) thì null: server không có cổng creem, GET /v1/plans không trả giá USD, POST /v1/checkout USD trả 503.
+ */
+export function parseProductIds(raw: unknown): Record<PlanCode, string> | null {
+  if (!isRecord(raw) || Object.keys(raw).length !== PLAN_CODES.length) return null;
+  const ids = {} as Record<PlanCode, string>;
+  for (const code of PLAN_CODES) {
+    const id = raw[code];
+    if (typeof id !== "string" || !/^prod_[A-Za-z0-9_-]+$/.test(id)) return null;
+    ids[code] = id;
+  }
+  return ids;
 }
 
 function isCreemCheckoutUrl(value: string): boolean {
```

**Sửa `server/src/deps.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/deps.ts
+++ b/server/src/deps.ts
@@ -4,6 +4,7 @@
 import { ResendEmailProvider } from "./email/resend";
 import { type LicenseEmailEntry, type LicenseEmailKind, licenseEmail } from "./email/templates";
 import type { ApiEnv } from "./env";
+import { CreemProvider, parseProductIds } from "./payment/creem";
 import { PayOSProvider } from "./payment/payos";
 import type { PaymentProvider } from "./payment/provider";
 import { importSigningKey, type KeyCheck, type SigningKey, signToken } from "./token";
@@ -82,11 +83,26 @@
   });
 }
 
+/** Cổng Creem; null khi chưa cấu hình đủ (mã sản phẩm còn trống, thiếu khóa API hay secret webhook): Creem chưa bật. */
+export function creemFromEnv(
+  env: Pick<ApiEnv, "CREEM_BASE_URL" | "CREEM_API_KEY" | "CREEM_WEBHOOK_SECRET" | "CREEM_PRODUCT_IDS">,
+): CreemProvider | null {
+  const productIds = parseProductIds(env.CREEM_PRODUCT_IDS);
+  if (!productIds || !env.CREEM_API_KEY || !env.CREEM_WEBHOOK_SECRET) return null;
+  return new CreemProvider({
+    baseUrl: env.CREEM_BASE_URL,
+    apiKey: env.CREEM_API_KEY,
+    webhookSecret: env.CREEM_WEBHOOK_SECRET,
+    productIds,
+  });
+}
+
 export function realDeps(env: ApiEnv): Deps {
   let key: Promise<SigningKey> | undefined;
+  const creem = creemFromEnv(env);
   return {
     now: nowSeconds,
-    payments: { payos: payosFromEnv(env) },
+    payments: { payos: payosFromEnv(env), ...(creem ? { creem } : {}) },
     email: new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO }),
     signingKey: () => (key ??= loadSigningKey(env)),
   };
```

**Sửa `server/src/env.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/env.ts
+++ b/server/src/env.ts
@@ -12,6 +12,10 @@
   /** Ô khóa đang ký token: "a" hoặc "b" (QĐ29). Ô còn lại là khóa dự phòng. */
   TOKEN_SIGNING_SLOT: string;
   PAYOS_BASE_URL: string;
+  /** Gốc API Creem (cố định production, không sandbox: spec 2026-10-04). */
+  CREEM_BASE_URL: string;
+  /** Mã sản phẩm Creem của ba gói (src/payment/creem.ts, parseProductIds); còn rỗng thì Creem chưa bật. */
+  CREEM_PRODUCT_IDS?: unknown;
   EMAIL_FROM: string;
   /** Địa chỉ nhận trả lời của thư gửi khách (Reply-To). Không bắt buộc. */
   EMAIL_REPLY_TO?: string;
@@ -19,6 +23,8 @@
   PAYOS_CLIENT_ID: string;
   PAYOS_API_KEY: string;
   PAYOS_CHECKSUM_KEY: string;
+  CREEM_API_KEY: string;
+  CREEM_WEBHOOK_SECRET: string;
   RESEND_API_KEY: string;
   /** JWK Ed25519 khóa riêng, có `kid` (scripts/gen-token-key.mjs), ở hai ô A và B. */
   TOKEN_SIGNING_KEY_A: string;
```

**Sửa `server/vitest.config.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/vitest.config.ts
+++ b/server/vitest.config.ts
@@ -8,6 +8,8 @@
   PAYOS_CLIENT_ID: "test-client-id",
   PAYOS_API_KEY: "test-api-key",
   PAYOS_CHECKSUM_KEY: "test-checksum-key",
+  CREEM_API_KEY: "test-creem-api-key",
+  CREEM_WEBHOOK_SECRET: "test-creem-webhook-secret",
   RESEND_API_KEY: "re_test",
   TOKEN_SIGNING_KEY_A: "{}",
   TOKEN_SIGNING_KEY_B: "{}",
```

- [ ] **Step 4: `wrangler.jsonc`: biến Creem, giá USD, secret bắt buộc**

**Sửa `server/wrangler.jsonc`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/wrangler.jsonc
+++ b/server/wrangler.jsonc
@@ -19,17 +19,25 @@
     // Luôn "production" ở đây. Giá trị "test" chỉ có trong vitest.config.ts (test/node/wrangler-config.test.mjs khóa điều này).
     "ENVIRONMENT": "production",
     "PAYOS_BASE_URL": "https://api-merchant.payos.vn",
+    // Creem: cổng thanh toán quốc tế, thẻ, USD (spec 2026-10-14-creem-international-payment-design). Production cố định, không có
+    // sandbox (test Node khóa giá trị). CREEM_PRODUCT_IDS là mã sản phẩm Creem (prod_…) của ba gói, tạo ở dashboard Creem theo
+    // docs/release/phat-hanh.md; còn chuỗi rỗng thì Creem chưa bật: GET /v1/plans không trả giá USD và POST /v1/checkout với
+    // currency USD trả 503. Điền mã thật trước khi deploy bản có Creem (cùng hai secret CREEM_*).
+    "CREEM_BASE_URL": "https://api.creem.io",
+    "CREEM_PRODUCT_IDS": { "monthly": "", "six_months": "", "yearly": "" },
     // Tên miền gửi mail.aitranslator.vn đã xác thực ở Resend (SPF, DKIM); khách trả lời thư thì về EMAIL_REPLY_TO.
     "EMAIL_FROM": "AI Translator <no-reply@mail.aitranslator.vn>",
     "EMAIL_REPLY_TO": "support@aitranslator.vn",
     // Giá chính thức (spec 2026-10-07 §2.1; thay bốn gói chốt 2026-10-01). six_months thêm theo spec 2026-10-13 §1:
     // 100 giờ mỗi chu kỳ 30 ngày, 180 ngày mỗi đơn. Thứ tự các gói là thứ tự trong màn hình Nâng cấp (theo thời hạn).
+    // Giá USD (cent, bán qua Creem) thêm theo spec 2026-10-14 D2: giữ tỉ lệ giá mỗi ngày giữa các gói gần bảng VND (sai số 3%,
+    // test/node/wrangler-config.test.mjs), để luật đổi gói cho kết quả gần nhau dù khách trả bằng loại tiền nào.
     // Không hạ hạn mức của một gói đang bán (spec §6.8, QĐ17): token lấy hạn mức từ bảng hiện hành, nên hạ ở đây là
     // hạ luôn hạn mức của khách đã trả tiền. Muốn bán hạn mức thấp hơn thì thêm gói mới (sửa src/plans.ts và app).
     "PLANS": {
-      "monthly": { "quota_minutes_per_cycle": 3000, "days_per_order": 30, "prices": { "VND": 50000 } },
-      "six_months": { "quota_minutes_per_cycle": 6000, "days_per_order": 180, "prices": { "VND": 269000 } },
-      "yearly": { "quota_minutes_per_cycle": null, "days_per_order": 365, "prices": { "VND": 500000 } }
+      "monthly": { "quota_minutes_per_cycle": 3000, "days_per_order": 30, "prices": { "VND": 50000, "USD": 399 } },
+      "six_months": { "quota_minutes_per_cycle": 6000, "days_per_order": 180, "prices": { "VND": 269000, "USD": 2199 } },
+      "yearly": { "quota_minutes_per_cycle": null, "days_per_order": 365, "prices": { "VND": 500000, "USD": 3999 } }
     },
     // Số ngày dùng thử Free của mỗi máy (spec 2026-10-07 §3.1). Đổi chỉ áp cho máy đăng ký sau đó.
     "TRIAL_DAYS": 10,
@@ -38,7 +46,7 @@
     "TOKEN_SIGNING_SLOT": "a"
   },
   "secrets": {
-    "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY", "TOKEN_SIGNING_KEY_A", "TOKEN_SIGNING_KEY_B", "RATE_LIMIT_PEPPER"]
+    "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "CREEM_API_KEY", "CREEM_WEBHOOK_SECRET", "RESEND_API_KEY", "TOKEN_SIGNING_KEY_A", "TOKEN_SIGNING_KEY_B", "RATE_LIMIT_PEPPER"]
   },
   "d1_databases": [
     // database_id: thay bằng ID do `wrangler d1 create mt-license-production` in ra (Task 21).
```

- [ ] **Step 5: Cập nhật các test chạm bảng giá và cấu hình**

**Sửa `server/test/node/wrangler-config.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/node/wrangler-config.test.mjs
+++ b/server/test/node/wrangler-config.test.mjs
@@ -34,10 +34,27 @@
 test("Worker API bán đúng bảng gói chính thức (spec 2026-10-07 §2.1, spec 2026-10-13 §1), không có giá thử", () => {
   const { monthly, six_months: sixMonths, yearly, ...others } = api.vars.PLANS;
   assert.deepEqual(others, {});
-  assert.deepEqual(monthly, { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } });
-  assert.deepEqual(sixMonths, { quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000 } });
-  assert.deepEqual(yearly, { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } });
+  assert.deepEqual(monthly, { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000, USD: 399 } });
+  assert.deepEqual(sixMonths, { quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000, USD: 2199 } });
+  assert.deepEqual(yearly, { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000, USD: 3999 } });
   assert.deepEqual(Object.keys(api.vars.PLANS), ["monthly", "six_months", "yearly"], "thứ tự gói trong cấu hình theo thời hạn");
+});
+
+test("giá USD giữ tỉ lệ giá mỗi ngày giữa các gói gần bảng VND, sai số 3% (spec 2026-10-14 D2)", () => {
+  const perDay = (code, currency) => api.vars.PLANS[code].prices[currency] / api.vars.PLANS[code].days_per_order;
+  for (const code of ["six_months", "yearly"]) {
+    const vnd = perDay(code, "VND") / perDay("monthly", "VND");
+    const usd = perDay(code, "USD") / perDay("monthly", "USD");
+    assert.ok(Math.abs(usd / vnd - 1) <= 0.03, `${code}: tỉ lệ USD ${usd.toFixed(4)} lệch tỉ lệ VND ${vnd.toFixed(4)} quá 3%`);
+  }
+});
+
+test("Creem (spec 2026-10-14): production cố định, không sandbox; CREEM_PRODUCT_IDS đúng ba mã gói, rỗng (chưa bật) hay prod_…", () => {
+  assert.equal(api.vars.CREEM_BASE_URL, "https://api.creem.io");
+  assert.deepEqual(Object.keys(api.vars.CREEM_PRODUCT_IDS), ["monthly", "six_months", "yearly"]);
+  for (const id of Object.values(api.vars.CREEM_PRODUCT_IDS)) assert.match(id, /^(prod_[A-Za-z0-9_-]+)?$/);
+  assert.doesNotMatch(JSON.stringify(api), /test-api\.creem\.io/);
+  assert.equal("CREEM_BASE_URL" in admin.vars, false, "chưa dùng ở Worker admin ở bước này");
 });
 
 test("dùng thử Free 10 ngày mỗi máy (spec 2026-10-07 §3.1)", () => {
@@ -50,6 +67,8 @@
     "PAYOS_CLIENT_ID",
     "PAYOS_API_KEY",
     "PAYOS_CHECKSUM_KEY",
+    "CREEM_API_KEY",
+    "CREEM_WEBHOOK_SECRET",
     "RESEND_API_KEY",
     "TOKEN_SIGNING_KEY_A",
     "TOKEN_SIGNING_KEY_B",
```

**Sửa `server/test/plans.test.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/plans.test.ts
+++ b/server/test/plans.test.ts
@@ -9,9 +9,9 @@
 describe("bảng gói (biến PLANS)", () => {
   it("có đúng ba gói trả phí với hạn mức, số ngày và giá của spec 2026-10-07 §2.1 và spec 2026-10-13 §1", () => {
     expect(plans).toEqual({
-      monthly: { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } },
-      six_months: { quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000 } },
-      yearly: { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } },
+      monthly: { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000, USD: 399 } },
+      six_months: { quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000, USD: 2199 } },
+      yearly: { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000, USD: 3999 } },
     });
     // Thứ tự mã gói là thứ tự trong màn hình Nâng cấp: theo thời hạn.
     expect([...PLAN_CODES]).toEqual(["monthly", "six_months", "yearly"]);
@@ -191,7 +191,40 @@
   });
 
   it("thiếu giá theo loại tiền của đơn thì báo lỗi", () => {
-    expect(() => computeGrant(plans, lic("monthly", 20), "yearly", "USD", T0)).toThrow(/USD/);
+    expect(() => computeGrant(plans, lic("monthly", 20), "yearly", "EUR", T0)).toThrow(/EUR/);
+  });
+
+  describe("đơn trả bằng USD (spec 2026-10-14): luật đổi gói dùng bảng giá USD của loại tiền của đơn", () => {
+    it("license mới và mua thêm cùng gói: số ngày của gói, như VND", () => {
+      expect(computeGrant(plans, null, "monthly", "USD", T0)).toEqual({
+        plan: "monthly",
+        expires_at: T0 + 30 * DAY,
+        cycle_anchor: T0,
+        kind: "new",
+        converted_days: 0,
+      });
+      expect(computeGrant(plans, lic("yearly", 100), "yearly", "USD", T0)).toMatchObject({
+        expires_at: T0 + 100 * DAY + 365 * DAY,
+        kind: "extend",
+      });
+    });
+
+    it("Monthly còn 20 ngày, mua Yearly: 20 × (3,99 / 30) / (39,99 / 365) = 24,27… → 24 ngày (như VND)", () => {
+      expect(computeGrant(plans, lic("monthly", 20), "yearly", "USD", T0)).toMatchObject({ converted_days: 24, expires_at: T0 + 389 * DAY });
+    });
+
+    it("Yearly còn 200 ngày, mua Monthly: 200 × (39,99 / 365) / (3,99 / 30) = 164,75… → 164 ngày (như VND)", () => {
+      expect(computeGrant(plans, lic("yearly", 200), "monthly", "USD", T0)).toMatchObject({ converted_days: 164, expires_at: T0 + 194 * DAY });
+    });
+
+    it("tỉ lệ giá mỗi ngày của 6 Months lệch bảng VND khoảng 2,4% (spec 2026-10-14 D2), nên số ngày quy đổi lệch 1–2 ngày", () => {
+      // Monthly còn 20 ngày, mua 6 Months: USD 20 × (3,99 / 30) / (21,99 / 180) = 21,77… → 21 (VND: 22).
+      expect(computeGrant(plans, lic("monthly", 20), "six_months", "USD", T0).converted_days).toBe(21);
+      expect(computeGrant(plans, lic("monthly", 20), "six_months", "VND", T0).converted_days).toBe(22);
+      // 6 Months còn 100 ngày, mua Yearly: USD 111 ngày (VND: 109).
+      expect(computeGrant(plans, lic("six_months", 100), "yearly", "USD", T0).converted_days).toBe(111);
+      expect(computeGrant(plans, lic("six_months", 100), "yearly", "VND", T0).converted_days).toBe(109);
+    });
   });
 
   describe("gói 6 Months (spec 2026-10-13 §1)", () => {
```

**Sửa `server/test/checkout.test.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/checkout.test.ts
+++ b/server/test/checkout.test.ts
@@ -20,8 +20,8 @@
       headers: expect.anything(),
       body: {
         plans: [
-          { code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } },
-          { code: "yearly", name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } },
+          { code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000, USD: 399 } },
+          { code: "yearly", name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000, USD: 3999 } },
         ],
       },
     });
@@ -35,9 +35,9 @@
   });
 
   // Gói 6 Months (spec 2026-10-13 §2.3): app cũ không gửi `?plans=` nên nhận đúng response ở test đầu của mục này.
-  const monthly = { code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } };
-  const sixMonths = { code: "six_months", name: "6 Months", quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000 } };
-  const yearly = { code: "yearly", name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } };
+  const monthly = { code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000, USD: 399 } };
+  const sixMonths = { code: "six_months", name: "6 Months", quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000, USD: 2199 } };
+  const yearly = { code: "yearly", name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000, USD: 3999 } };
 
   it("app khai báo ?plans=monthly,six_months,yearly thì nhận ba gói theo thứ tự thời hạn", async () => {
     const res = await makeWorld().call("GET", "/v1/plans?plans=monthly,six_months,yearly");
```

- [ ] **Step 6: Chạy typecheck, toàn bộ test và test scripts**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm test 2>&1 | grep -E "Test Files|Tests " && pnpm test:scripts 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `tsc` không lỗi; `Test Files  27 passed (27)`, `Tests  754 passed (754)`; `ℹ tests 21`, `ℹ pass 20`, `ℹ fail 0`, `ℹ skipped 1`.

- [ ] **Step 7: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- server | wc -l`
Expected: `18`.

---

### Task 6: Checkout và danh sách gói theo loại tiền

**Files:**
- Modify: `server/src/checkout.ts`
- Modify (test): `server/test/world.ts`, `server/test/checkout.test.ts`
- Create (test): `server/test/creem-checkout.test.ts`

Hợp đồng (spec §4.3):
- `POST /v1/checkout` nhận thêm `currency` tùy chọn: `"VND"` (mặc định khi thiếu) hay `"USD"`; giá trị khác là `400 invalid_request` `field: "currency"`. Bản đồ cố định `VND → payos` (hạn 15 phút), `USD → creem` (hạn 30 phút). Thiếu cổng của loại tiền đó (Creem chưa bật) hay thiếu giá thì `503 pricing_not_configured`. Response có thêm `provider`; `qr_code` là `null` với Creem.
- **App cũ (≤ 0.1.9) không gửi `currency`**: luôn đi PayOS, vẫn nhận `qr_code` là chuỗi. Chỉ app mới khai báo `"USD"` mới nhận đơn không có mã QR.
- `GET /v1/plans` chỉ trả giá của loại tiền **bán được** (cổng của loại tiền đó có trong `deps.payments`), thêm trường `suggested_currency`: `"USD"` nếu bán được USD và nước của request (`request.cf.country` hay header `CF-IPCountry`) không phải Việt Nam và không rỗng/`XX`; còn lại `"VND"`.
- `MAX_ORDER_CODE` (9.999.999, vì mô tả đơn PayOS `AT<mã>` tối đa 9 ký tự) vẫn áp cho mọi đơn: bộ đếm số đơn dùng chung.

- [ ] **Step 1: Thêm Creem giả vào `makeWorld` và viết test**

**Sửa `server/test/world.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/world.ts
+++ b/server/test/world.ts
@@ -6,9 +6,18 @@
 import type { Deps } from "../src/deps";
 import { ResendEmailProvider } from "../src/email/resend";
 import type { ApiEnv } from "../src/env";
+import { CreemProvider } from "../src/payment/creem";
 import { PayOSProvider } from "../src/payment/payos";
 import { importSigningKey } from "../src/token";
-import { FakePayOS, FakeResend, TEST_CHECKSUM_KEY } from "./fakes";
+import {
+  FakeCreem,
+  FakePayOS,
+  FakeResend,
+  TEST_CHECKSUM_KEY,
+  TEST_CREEM_API_KEY,
+  TEST_CREEM_PRODUCTS,
+  TEST_CREEM_WEBHOOK_SECRET,
+} from "./fakes";
 import { testSigningJwk } from "./keys";
 
 /** 2026-10-01T00:00:00Z */
@@ -24,6 +33,7 @@
 export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
   const clock = { now: T0 };
   const payos = new FakePayOS(TEST_CHECKSUM_KEY, () => clock.now);
+  const creem = new FakeCreem();
   const resend = new FakeResend();
   const deps: Deps = {
     now: () => clock.now,
@@ -31,6 +41,15 @@
       payos: new PayOSProvider(
         { baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: TEST_CHECKSUM_KEY },
         payos.fetch,
+      ),
+      creem: new CreemProvider(
+        {
+          baseUrl: "https://creem.test",
+          apiKey: TEST_CREEM_API_KEY,
+          webhookSecret: TEST_CREEM_WEBHOOK_SECRET,
+          productIds: { ...TEST_CREEM_PRODUCTS },
+        },
+        creem.fetch,
       ),
     },
     email: new ResendEmailProvider({ apiKey: "re_test", from: "AI Translator <noreply@mt.test>" }, resend.fetch),
@@ -132,5 +151,5 @@
     };
   }
 
-  return { clock, payos, resend, deps, app, env: testEnv, call, buy, getOrder, customerB };
+  return { clock, payos, creem, resend, deps, app, env: testEnv, call, buy, getOrder, customerB };
 }
```

**Tạo `server/test/creem-checkout.test.ts`:**

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./db";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

const usd = { plan: "monthly", email: " Buyer@Example.com ", consent: true, currency: "USD" };
const vnd = { plan: "monthly", email: "buyer@example.com", consent: true };

describe("POST /v1/checkout với currency USD (Creem)", () => {
  it("tạo đơn Creem: request_id là mã đơn, giá 399 cent, link của Creem, không có mã QR, hạn 30 phút", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", usd);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      order_code: 1,
      provider: "creem",
      checkout_url: "https://checkout.creem.io/ch_fake1",
      qr_code: null,
      plan: "monthly",
      amount: 399,
      currency: "USD",
      expires_at: T0 + 30 * 60,
    });
    expect(res.body.order_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.creem.requests[0]?.body).toEqual({
      product_id: "prod_monthly",
      request_id: "1",
      custom_price: 399,
      success_url: "https://license.test/v1/pay/return",
      customer: { email: "buyer@example.com" },
      metadata: { order_code: "1", plan: "monthly" },
    });
    expect(w.payos.requests).toHaveLength(0);
    const row = await env.DB.prepare("SELECT * FROM orders WHERE order_code = 1").first<Record<string, unknown>>();
    expect(row).toMatchObject({
      provider: "creem",
      provider_ref: "ch_fake1",
      plan: "monthly",
      amount: 399,
      currency: "USD",
      email: "buyer@example.com",
      email_consent_at: T0,
      status: "pending",
      expires_at: T0 + 30 * 60,
    });
  });

  it.each([
    ["monthly", 399],
    ["six_months", 2199],
    ["yearly", 3999],
  ])("gói %s: giá %i cent lấy từ biến PLANS", async (plan, amount) => {
    const res = await makeWorld().call("POST", "/v1/checkout", { ...usd, plan });
    expect(res).toMatchObject({ status: 201, body: { plan, amount, currency: "USD" } });
  });

  it("app cũ không gửi currency: vẫn PayOS và VND, có mã VietQR, Creem không bị gọi", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", vnd);
    expect(res.body).toMatchObject({ provider: "payos", currency: "VND", amount: 50000, expires_at: T0 + 900 });
    expect(typeof res.body.qr_code).toBe("string");
    expect(w.creem.requests).toHaveLength(0);
    expect((await w.call("POST", "/v1/checkout", { ...vnd, currency: "VND" })).body).toMatchObject({ provider: "payos", currency: "VND" });
  });

  it.each([["EUR"], ["usd"], [""], [5], [null], [["USD"]]])("currency %j sai: 400, không tạo đơn, không gọi cổng nào", async (currency) => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", { ...usd, currency });
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_request", field: "currency" } });
    expect(w.creem.requests).toHaveLength(0);
    expect(w.payos.requests).toHaveLength(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first()).toEqual({ n: 0 });
  });

  it("Creem chưa bật (không có cổng creem): 503 pricing_not_configured, không tạo đơn; PayOS vẫn bán bình thường", async () => {
    const w = makeWorld();
    delete w.deps.payments.creem;
    expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first()).toEqual({ n: 0 });
    expect((await w.call("POST", "/v1/checkout", vnd)).status).toBe(201);
  });

  it("bảng gói không có giá USD: 503 pricing_not_configured cho USD, VND vẫn bán", async () => {
    const plans = structuredClone(env.PLANS) as Record<string, { prices: Record<string, number> }>;
    for (const p of Object.values(plans)) delete p.prices.USD;
    const w = makeWorld({ PLANS: plans });
    expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
    expect((await w.call("POST", "/v1/checkout", vnd)).status).toBe(201);
  });

  it("Creem lỗi: 502 payment_provider_error và đơn chuyển failed", async () => {
    const w = makeWorld();
    w.creem.down = true;
    expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
    const row = await env.DB.prepare("SELECT status, provider FROM orders WHERE order_code = 1").first();
    expect(row).toEqual({ status: "failed", provider: "creem" });
  });

  it("gia hạn bằng USD: ước tính theo bảng giá USD (Monthly còn 20 ngày mua Yearly: quy đổi 24 ngày)", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy({ plan: "monthly" });
    w.clock.now = T0 + 10 * DAY;
    const res = await w.call("POST", "/v1/checkout", { plan: "yearly", email: "buyer@example.com", consent: true, license_key: licenseKey, currency: "USD" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ provider: "creem", amount: 3999, currency: "USD", converted_days: 24 });
    expect(res.body.license_expires_at).toBe(T0 + 10 * DAY + 365 * DAY + 24 * DAY);
  });
});

describe("GET /v1/plans: loại tiền bán được", () => {
  const asVietnam = { "cf-ipcountry": "VN" };
  const asGermany = { "cf-ipcountry": "DE" };

  it("Creem bật: giá có cả VND và USD; gợi ý VND khi không biết nước hay ở Việt Nam, USD ở nước khác", async () => {
    const w = makeWorld();
    const unknown = await w.call("GET", "/v1/plans?plans=monthly,six_months,yearly");
    expect(unknown.body.suggested_currency).toBe("VND");
    const plans = unknown.body.plans as { code: string; prices: Record<string, number> }[];
    expect(plans.map((p) => [p.code, p.prices])).toEqual([
      ["monthly", { VND: 50000, USD: 399 }],
      ["six_months", { VND: 269000, USD: 2199 }],
      ["yearly", { VND: 500000, USD: 3999 }],
    ]);
    expect((await w.call("GET", "/v1/plans", undefined, asVietnam)).body.suggested_currency).toBe("VND");
    expect((await w.call("GET", "/v1/plans", undefined, asGermany)).body.suggested_currency).toBe("USD");
    expect((await w.call("GET", "/v1/plans", undefined, { "cf-ipcountry": "XX" })).body.suggested_currency).toBe("VND");
  });

  it("Creem chưa bật: không trả giá USD dù PLANS có, và luôn gợi ý VND", async () => {
    const w = makeWorld();
    delete w.deps.payments.creem;
    const res = await w.call("GET", "/v1/plans", undefined, asGermany);
    expect(res.body.suggested_currency).toBe("VND");
    for (const p of res.body.plans as { prices: Record<string, number> }[]) expect(Object.keys(p.prices)).toEqual(["VND"]);
  });

  it("app cũ (không có ?plans=): vẫn hai gói cũ, giá VND đọc được như trước (có thêm USD mà app cũ không đọc)", async () => {
    const res = await makeWorld().call("GET", "/v1/plans");
    const plans = res.body.plans as { code: string; prices: Record<string, number> }[];
    expect(plans.map((p) => p.code)).toEqual(["monthly", "yearly"]);
    expect(plans.map((p) => p.prices.VND)).toEqual([50000, 500000]);
  });
});
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/creem-checkout.test.ts 2>&1 | grep -E "Test Files|Tests "`
Expected: FAIL: `Tests  17 failed | 1 passed (18)`.

- [ ] **Step 3: Cài đặt trong `checkout.ts`**

**Sửa `server/src/checkout.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/checkout.ts
+++ b/server/src/checkout.ts
@@ -1,21 +1,53 @@
 // GET /v1/plans và POST /v1/checkout (§6.8): bảng gói đang bán; tạo đơn, gọi cổng thanh toán,
 // trả link, chuỗi VietQR, order_token, và ước tính hạn mới của license khi gia hạn hay đổi gói.
-import type { Hono } from "hono";
+import type { Context, Hono } from "hono";
 import type { AppEnv } from "./app";
 import { audit } from "./audit";
 import { b64urlEncode, randomBytes, sha256Hex } from "./crypto";
+import type { Deps } from "./deps";
 import { clientIp, fail, parseEmail, readJson, tooMany } from "./http";
 import { normalizeLicenseKey } from "./license-key";
 import { computeGrant, isPlan, LEGACY_PLAN_CODES, offeredPlanCodes, PLAN_CODES, PLAN_NAMES, parsePlans, type PlanCode } from "./plans";
 import { failureBlock, hit, noteFailure } from "./ratelimit";
 
-/** Link thanh toán hết hạn sau 15 phút (`expiredAt` của PayOS); app hỏi trạng thái tối đa bằng thời gian này. */
+/** Link thanh toán của PayOS hết hạn sau 15 phút (`expiredAt` của PayOS); app hỏi trạng thái tối đa bằng thời gian này. */
 export const CHECKOUT_TTL_SECONDS = 15 * 60;
+/**
+ * Đơn Creem (không có mã QR, khách mở trình duyệt) giữ 30 phút (spec 2026-10-14 D7). App hỏi mỗi 5 giây: 360 lần, nằm trong
+ * hạn `order_poll` 600 lần mỗi giờ. Phiên của Creem sống lâu hơn; khách trả muộn vẫn được cấp (webhook, đối soát) nhưng
+ * `paymentTime()` kẹp thời điểm thanh toán về hạn này.
+ */
+export const CREEM_CHECKOUT_TTL_SECONDS = 30 * 60;
 /** Một số ngân hàng chỉ nhận mô tả tối đa 9 ký tự (§14 giả định 7): "AT" + tối đa 7 chữ số. */
 export const MAX_ORDER_CODE = 9_999_999;
-const CURRENCY = "VND";
-/** MVP chỉ bán bằng VND qua PayOS; Phase 3 chọn cổng theo loại tiền. */
-const CHECKOUT_PROVIDER = "payos";
+
+/**
+ * Loại tiền khách chọn và cổng bán loại tiền đó (spec 2026-10-14 §4.3). Thiếu `currency` trong request thì là VND qua PayOS:
+ * app ≤ 0.1.9 không gửi và chỉ biết đơn có mã VietQR, nên chỉ app mới khai báo "USD" mới nhận đơn Creem.
+ */
+const SALES = {
+  VND: { provider: "payos", ttl: CHECKOUT_TTL_SECONDS },
+  USD: { provider: "creem", ttl: CREEM_CHECKOUT_TTL_SECONDS },
+} as const;
+type Currency = keyof typeof SALES;
+
+const isCurrency = (v: unknown): v is Currency => typeof v === "string" && Object.hasOwn(SALES, v);
+
+/** Các loại tiền bán được lúc này: cổng của loại tiền đó đã cấu hình (Creem chưa bật thì không có USD). */
+function offeredCurrencies(deps: Pick<Deps, "payments">): Currency[] {
+  return (Object.keys(SALES) as Currency[]).filter((c) => Object.hasOwn(deps.payments, SALES[c].provider));
+}
+
+/**
+ * Loại tiền gợi ý cho màn hình Nâng cấp: VND cho khách ở Việt Nam hay khi không biết nước; USD cho khách nước khác, nếu bán
+ * được USD. Chỉ là giá trị mặc định: người dùng chọn lại được. Nước lấy từ `request.cf` (Cloudflare), hoặc header
+ * `CF-IPCountry` do Cloudflare ghi (client không giả được, và sai cũng chỉ đổi lựa chọn mặc định).
+ */
+function suggestedCurrency(c: Context<AppEnv>, offered: Currency[]): Currency {
+  if (!offered.includes("USD")) return "VND";
+  const country = String(c.req.raw.cf?.country ?? c.req.header("cf-ipcountry") ?? "").toUpperCase();
+  return country !== "" && country !== "VN" && country !== "XX" ? "USD" : "VND";
+}
 
 /** Mô tả chuyển khoản của đơn: "AT" (AI Translator) + số đơn, tối đa 9 ký tự. */
 export function orderDescription(orderCode: number): string {
@@ -28,13 +60,16 @@
   app.get("/v1/plans", (c) => {
     const plans = parsePlans(c.env.PLANS);
     if (!plans) return fail(c, 503, "pricing_not_configured");
+    // Chỉ trả giá của loại tiền đang bán được (Creem chưa bật thì app không thấy USD). App cũ chỉ đọc `prices.VND`.
+    const offered = offeredCurrencies(c.get("deps"));
     return c.json({
+      suggested_currency: suggestedCurrency(c, offered),
       plans: offeredPlanCodes(PLAN_CODES, LEGACY_PLAN_CODES, c.req.query("plans")).map((code) => ({
         code,
         name: PLAN_NAMES[code],
         quota_minutes_per_cycle: plans[code].quota_minutes_per_cycle,
         days_per_order: plans[code].days_per_order,
-        prices: plans[code].prices,
+        prices: Object.fromEntries(Object.entries(plans[code].prices).filter(([currency]) => (offered as string[]).includes(currency))),
       })),
     });
   });
@@ -53,10 +88,14 @@
     if (!isPlan(plan)) return fail(c, 400, "invalid_request", { field: "plan" });
     if (!email) return fail(c, 400, "invalid_request", { field: "email" });
     if (consent !== true) return fail(c, 400, "invalid_request", { field: "consent" });
+    const currency = body.currency === undefined ? "VND" : body.currency;
+    if (!isCurrency(currency)) return fail(c, 400, "invalid_request", { field: "currency" });
+    const { provider, ttl } = SALES[currency];
 
     const plans = parsePlans(c.env.PLANS);
-    const amount = plans?.[plan].prices[CURRENCY];
-    if (!plans || amount === undefined) return fail(c, 503, "pricing_not_configured");
+    const amount = plans?.[plan].prices[currency];
+    const gateway = Object.hasOwn(deps.payments, provider) ? deps.payments[provider] : undefined;
+    if (!plans || amount === undefined || !gateway) return fail(c, 503, "pricing_not_configured");
 
     let renewLicenseId: string | null = null;
     let estimate: ReturnType<typeof computeGrant> | null = null;
@@ -79,18 +118,18 @@
       if (lic.revoked_at !== null) return fail(c, 403, "license_revoked");
       renewLicenseId = lic.id;
       // Ước tính theo lúc tạo đơn; số chính thức tính theo thời điểm thanh toán (QĐ33), chênh nhau tối đa 15 phút.
-      estimate = computeGrant(plans, lic, plan, CURRENCY, now);
+      estimate = computeGrant(plans, lic, plan, currency, now);
     }
 
     const orderToken = b64urlEncode(randomBytes(32));
-    const expiresAt = now + CHECKOUT_TTL_SECONDS;
+    const expiresAt = now + ttl;
     const row = await db
       .prepare(
         `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email, email_consent_at,
                              renew_license_id, status, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING order_code`,
       )
-      .bind(await sha256Hex(orderToken), CHECKOUT_PROVIDER, plan, amount, CURRENCY, email, now, renewLicenseId, now, expiresAt)
+      .bind(await sha256Hex(orderToken), provider, plan, amount, currency, email, now, renewLicenseId, now, expiresAt)
       .first<{ order_code: number }>();
     if (!row) throw new Error("không tạo được đơn");
     const orderCode = row.order_code;
@@ -103,10 +142,10 @@
     const origin = new URL(c.req.url).origin;
     let checkout;
     try {
-      checkout = await deps.payments[CHECKOUT_PROVIDER]!.createCheckout({
+      checkout = await gateway.createCheckout({
         orderCode,
         amount,
-        currency: CURRENCY,
+        currency,
         description: orderDescription(orderCode),
         returnUrl: `${origin}/v1/pay/return`,
         cancelUrl: `${origin}/v1/pay/cancel`,
@@ -116,7 +155,7 @@
       });
     } catch (err) {
       await db.prepare("UPDATE orders SET status = 'failed' WHERE order_code = ?").bind(orderCode).run();
-      console.error(JSON.stringify({ event: "checkout_failed", order_code: orderCode, error: String(err) }));
+      console.error(JSON.stringify({ event: "checkout_failed", order_code: orderCode, provider, error: String(err) }));
       return fail(c, 502, "payment_provider_error");
     }
     await db.prepare("UPDATE orders SET provider_ref = ? WHERE order_code = ?").bind(checkout.providerRef, orderCode).run();
@@ -126,16 +165,18 @@
       action: "order_created",
       licenseId: renewLicenseId,
       orderCode,
-      detail: { plan, amount, currency: CURRENCY },
+      detail: { plan, amount, currency },
     });
     const res: Record<string, unknown> = {
       order_code: orderCode,
       order_token: orderToken,
+      provider,
       checkout_url: checkout.checkoutUrl,
+      // null với cổng không có mã QR (Creem): app mở checkout_url bằng trình duyệt.
       qr_code: checkout.qrCode,
       plan,
       amount,
-      currency: CURRENCY,
+      currency,
       expires_at: expiresAt,
     };
     if (estimate) {
```

- [ ] **Step 4: Cập nhật hai test `GET /v1/plans` có sẵn (response nay có `suggested_currency`)**

**Sửa `server/test/checkout.test.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/checkout.test.ts
+++ b/server/test/checkout.test.ts
@@ -19,6 +19,7 @@
       status: 200,
       headers: expect.anything(),
       body: {
+        suggested_currency: "VND",
         plans: [
           { code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000, USD: 399 } },
           { code: "yearly", name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000, USD: 3999 } },
@@ -41,7 +42,7 @@
 
   it("app khai báo ?plans=monthly,six_months,yearly thì nhận ba gói theo thứ tự thời hạn", async () => {
     const res = await makeWorld().call("GET", "/v1/plans?plans=monthly,six_months,yearly");
-    expect(res).toEqual({ status: 200, headers: expect.anything(), body: { plans: [monthly, sixMonths, yearly] } });
+    expect(res).toEqual({ status: 200, headers: expect.anything(), body: { suggested_currency: "VND", plans: [monthly, sixMonths, yearly] } });
   });
 
   it.each([
```

- [ ] **Step 5: Chạy typecheck và toàn bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm test 2>&1 | grep -E "Test Files|Tests "`
Expected: `tsc` không lỗi; `Test Files  28 passed (28)`, `Tests  772 passed (772)`.

- [ ] **Step 6: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- server | wc -l`
Expected: `20`.

---

### Task 7: Luồng mua bằng Creem qua webhook và đối soát (chỉ thêm test)

**Files:**
- Modify (test): `server/test/fakes.ts` (sự kiện `checkout.completed` ký bằng secret), `server/test/world.ts` (`buyCreem`)
- Create (test): `server/test/creem-orders.test.ts`

Task này **không sửa mã chính**: route webhook và `fulfilOrder` đã chạy theo `orders.provider` từ Task 1 và 6. Các test ghim hành vi: webhook chỉ là cái cò (server hỏi lại Creem trước khi cấp), `amount_paid` không gồm thuế, webhook gửi trùng chỉ cấp một lần, sai chữ ký thì 400 và có cảnh báo, số tiền lạ thì `failed`, đơn đã hoàn trước khi cấp thì `refunded` và không cấp, Creem không trả lời thì 503 rồi đối soát cấp sau, và gia hạn xen kẽ VND/USD trên cùng một license.

- [ ] **Step 1: Thêm sự kiện giả, `buyCreem` và viết test**

**Sửa `server/test/fakes.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/fakes.ts
+++ b/server/test/fakes.ts
@@ -219,6 +219,8 @@
   statusFailures: (number | "timeout" | "network")[] = [];
   private seq = 0;
 
+  constructor(private readonly secret = TEST_CREEM_WEBHOOK_SECRET) {}
+
   private must(checkoutId: string): FakeCreemCheckout {
     const c = this.checkouts.get(checkoutId);
     if (!c) throw new Error(`không có phiên ${checkoutId}`);
@@ -247,6 +249,37 @@
     const c = this.must(checkoutId);
     if (!c.order) throw new Error(`phiên ${checkoutId} chưa có đơn`);
     c.order.status = status;
+  }
+
+  /** Giả lập Creem báo số tiền đơn khác giá ta đã gửi (bất thường). */
+  setOrderAmount(checkoutId: string, amount: number): void {
+    const c = this.must(checkoutId);
+    if (!c.order) throw new Error(`phiên ${checkoutId} chưa có đơn`);
+    c.order.amount = amount;
+  }
+
+  /** Webhook thô như Creem gửi, ký bằng secret của kênh (HMAC-SHA256 hex của thân thô, header creem-signature). */
+  async signedEvent(eventType: string, object: Record<string, unknown>): Promise<{ raw: string; headers: Record<string, string> }> {
+    const raw = JSON.stringify({ id: `evt_fake${++this.seq}`, eventType, created_at: 1728734325927, object });
+    return { raw, headers: { "creem-signature": await hmacSha256Hex(this.secret, raw) } };
+  }
+
+  /** Webhook `checkout.completed` của phiên (hình dạng theo ví dụ ở https://docs.creem.io/code/webhooks). */
+  completedWebhook(checkoutId: string) {
+    const c = this.must(checkoutId);
+    return this.signedEvent("checkout.completed", {
+      id: c.id,
+      object: "checkout",
+      request_id: c.requestId,
+      ...(c.order
+        ? { order: { id: c.order.id, customer: "cust_fake", product: c.productId, amount: c.order.amount, currency: "USD", status: c.order.status, type: "onetime", mode: "test" } }
+        : {}),
+      product: { id: c.productId, name: "AI Translator", price: c.customPrice, currency: "USD", billing_type: "onetime", tax_mode: "exclusive", tax_category: "saas", status: "active", mode: "test" },
+      customer: { id: "cust_fake", object: "customer", email: c.email, name: null, country: "NL", mode: "test" },
+      status: "completed",
+      metadata: c.metadata,
+      mode: "test",
+    });
   }
 
   private entity(c: FakeCreemCheckout) {
```

**Sửa `server/test/world.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/world.ts
+++ b/server/test/world.ts
@@ -100,6 +100,27 @@
     return { orderCode, orderToken: co.body.order_token as string, licenseKey: order.body.license_key as string };
   }
 
+  /** Mua trọn một đơn bằng USD qua Creem: checkout, khách trả (`tax` là thuế Creem cộng ngoài giá), Creem gửi webhook. */
+  async function buyCreem(opts: { plan?: string; email?: string; licenseKey?: string; tax?: number } = {}) {
+    const req: Record<string, unknown> = {
+      plan: opts.plan ?? "monthly",
+      email: opts.email ?? "buyer@example.com",
+      consent: true,
+      currency: "USD",
+    };
+    if (opts.licenseKey) req.license_key = opts.licenseKey;
+    const co = await call("POST", "/v1/checkout", req);
+    if (co.status !== 201) throw new Error(`checkout ${co.status} ${JSON.stringify(co.body)}`);
+    const orderCode = co.body.order_code as number;
+    const checkoutId = creem.checkoutIdOf(orderCode);
+    creem.pay(checkoutId, opts.tax ?? 0);
+    const hook = await creem.completedWebhook(checkoutId);
+    const wh = await call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
+    if (wh.status !== 200) throw new Error(`webhook ${wh.status}`);
+    const order = await getOrder(orderCode, co.body.order_token as string);
+    return { orderCode, orderToken: co.body.order_token as string, checkoutId, licenseKey: order.body.license_key as string };
+  }
+
   /** App hỏi trạng thái đơn: order_token trong header Authorization. */
   function getOrder(orderCode: number | string, token: string) {
     return call("GET", `/v1/orders/${orderCode}`, undefined, { authorization: `Bearer ${token}` });
@@ -151,5 +172,5 @@
     };
   }
 
-  return { clock, payos, creem, resend, deps, app, env: testEnv, call, buy, getOrder, customerB };
+  return { clock, payos, creem, resend, deps, app, env: testEnv, call, buy, buyCreem, getOrder, customerB };
 }
```

**Tạo `server/test/creem-orders.test.ts`:**

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcile } from "../src/reconcile";
import { resetDb } from "./db";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

const usd = { plan: "monthly", email: "buyer@example.com", consent: true, currency: "USD" };

type World = ReturnType<typeof makeWorld>;

/** Tạo đơn USD qua Creem; trả mã đơn, token và mã phiên của Creem. */
async function checkout(w: World, extra: Record<string, unknown> = {}) {
  const res = await w.call("POST", "/v1/checkout", { ...usd, ...extra });
  const orderCode = res.body.order_code as number;
  return { orderCode, token: res.body.order_token as string, checkoutId: w.creem.checkoutIdOf(orderCode) };
}

const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;
const orderRow = (orderCode: number) =>
  env.DB.prepare("SELECT status, amount_paid, currency, provider FROM orders WHERE order_code = ?").bind(orderCode).first();

describe("webhook Creem: checkout.completed", () => {
  it("khách trả đủ: server hỏi lại Creem rồi cấp license 30 ngày, gửi một email có key, app thấy key khi hỏi đơn", async () => {
    const w = makeWorld();
    const { orderCode, token, checkoutId } = await checkout(w);
    expect((await w.getOrder(orderCode, token)).body).toEqual({
      order_code: orderCode,
      status: "pending",
      plan: "monthly",
      amount: 399,
      currency: "USD",
      expires_at: T0 + 1800,
    });

    w.clock.now = T0 + 120;
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    const wh = await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
    expect(wh).toMatchObject({ status: 200, body: { ok: true, result: "granted" } });
    // Webhook chỉ là cái cò: server hỏi lại API của Creem trước khi cấp.
    expect(w.creem.requests.at(-1)).toMatchObject({ method: "GET", path: `/v1/checkouts?checkout_id=${checkoutId}` });
    expect(w.payos.requests).toHaveLength(0);

    const paid = await w.getOrder(orderCode, token);
    expect(paid.body).toMatchObject({ status: "paid", grant_kind: "new", license_plan: "monthly", license_expires_at: T0 + 120 + 30 * DAY });
    const key = paid.body.license_key as string;
    expect(key).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]).toMatchObject({ to: ["buyer@example.com"], idempotencyKey: `test-order-${orderCode}` });
    expect(w.resend.sent[0]!.text).toContain(key);
    expect(await orderRow(orderCode)).toEqual({ status: "paid", amount_paid: 399, currency: "USD", provider: "creem" });
  });

  it("khách trả thêm thuế ngoài giá: amount_paid vẫn là giá niêm yết (doanh thu không cộng thuế)", async () => {
    const w = makeWorld();
    const { orderCode } = await w.buyCreem({ tax: 80 });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid", amount_paid: 399 });
  });

  it("webhook gửi trùng cùng lúc: chỉ cấp một lần, một email", async () => {
    const w = makeWorld();
    const { checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    const results = await Promise.all([1, 2, 3].map(() => w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.filter((r) => r.body.result === "granted")).toHaveLength(1);
    expect(await count("licenses")).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
  });

  it("sai chữ ký (secret khác, thân bị sửa, thiếu header): 400 invalid_signature, không hỏi Creem, không cấp, có cảnh báo", async () => {
    const w = makeWorld();
    const { checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    const before = w.creem.requests.length;
    const bad = [
      { raw: hook.raw, headers: { "creem-signature": "f".repeat(64) } },
      { raw: hook.raw.replace('"request_id":"1"', '"request_id":"2"'), headers: hook.headers },
      { raw: hook.raw, headers: {} },
    ];
    for (const b of bad) {
      expect(await w.call("POST", "/v1/webhooks/creem", b.raw, b.headers)).toMatchObject({ status: 400, body: { error: "invalid_signature" } });
    }
    expect(w.creem.requests.length).toBe(before);
    expect(await count("licenses")).toBe(0);
    expect(await env.DB.prepare("SELECT kind, count FROM ops_alerts").first()).toEqual({ kind: "webhook_bad_signature", count: 3 });
  });

  it("đúng chữ ký mà Creem báo chưa trả tiền: không cấp (webhook không tự cấp, chỉ là cái cò)", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    const hook = await w.creem.completedWebhook(checkoutId);
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
    expect(await count("licenses")).toBe(0);
    expect(await orderRow(orderCode)).toMatchObject({ status: "pending" });
  });

  it("số tiền của Creem khác giá của đơn: không cấp, đơn thành failed, ghi nhật ký order_amount_mismatch", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    w.creem.setOrderAmount(checkoutId, 100);
    const hook = await w.creem.completedWebhook(checkoutId);
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
    expect(await orderRow(orderCode)).toMatchObject({ status: "failed" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'order_amount_mismatch'").first()).toEqual({ n: 1 });
    expect(await count("licenses")).toBe(0);
  });

  it("đơn đã trả rồi hoàn đủ trước khi server cấp: không cấp license, đơn thành refunded", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    w.creem.setOrderStatus(checkoutId, "refunded");
    const hook = await w.creem.completedWebhook(checkoutId);
    expect((await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).body).toEqual({ ok: true, result: "not_paid" });
    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
    expect(await count("licenses")).toBe(0);
  });

  it("mã đơn lạ (đúng chữ ký): 200 unknown_order, không hỏi Creem", async () => {
    const w = makeWorld();
    const hook = await w.creem.signedEvent("checkout.completed", { id: "ch_x", request_id: "777" });
    const res = await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
    expect(res).toMatchObject({ status: 200, body: { ok: true, result: "unknown_order" } });
    expect(w.creem.requests).toHaveLength(0);
  });

  it("đúng chữ ký mà nội dung sai dạng (request_id không phải mã đơn, thân không phải JSON): 400 invalid_request, không báo sai chữ ký, không cảnh báo", async () => {
    const w = makeWorld();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = await w.creem.signedEvent("checkout.completed", { id: "ch_x", request_id: "my-request-id" });
    expect(await w.call("POST", "/v1/webhooks/creem", bad.raw, bad.headers)).toMatchObject({ status: 400, body: { error: "invalid_request" } });
    expect(await count("ops_alerts")).toBe(0);
    expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toEqual(["webhook_malformed"]);
    warn.mockRestore();
  });

  it("sự kiện server không dùng (subscription.paid): 200 ignored, không hỏi Creem", async () => {
    const w = makeWorld();
    const hook = await w.creem.signedEvent("subscription.paid", { id: "sub_1" });
    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { ok: true, result: "ignored" } });
    expect(w.creem.requests).toHaveLength(0);
  });

  it("Creem không trả lời lúc cấp: 503 để Creem gửi lại; đối soát cấp sau, đúng một license", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    const hook = await w.creem.completedWebhook(checkoutId);
    w.creem.statusFailures = ["network"];
    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
    expect(await count("licenses")).toBe(0);
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 1, errors: 0 });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(await count("licenses")).toBe(1);
  });
});

describe("đối soát đơn Creem khi webhook bị mất", () => {
  it("khách đã trả mà không có webhook: đối soát 5 phút thấy completed thì cấp license và gửi email", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.creem.pay(checkoutId);
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toEqual({ checked: 1, granted: 1, errors: 0, emails_retried: 0, alerts_sent: 0 });
    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
    expect(w.resend.sent).toHaveLength(1);
  });

  it("khách chưa trả: đối soát hỏi Creem, đơn vẫn pending; phiên hết hạn thì đơn chuyển expired", async () => {
    const w = makeWorld();
    const { orderCode, checkoutId } = await checkout(w);
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 0, errors: 0 });
    expect(await orderRow(orderCode)).toMatchObject({ status: "pending" });
    w.creem.setStatus(checkoutId, "expired");
    w.clock.now = T0 + 3900;
    await reconcile(w.env, w.deps);
    expect(await orderRow(orderCode)).toMatchObject({ status: "expired" });
  });
});

describe("mua và gia hạn bằng Creem", () => {
  it("mua thêm cùng gói bằng USD: cộng 30 ngày vào hạn cũ như PayOS", async () => {
    const w = makeWorld();
    const first = await w.buyCreem();
    w.clock.now = T0 + 10 * DAY;
    const again = await w.buyCreem({ licenseKey: first.licenseKey });
    const lic = await env.DB.prepare("SELECT plan, expires_at, cycle_anchor FROM licenses").first();
    expect(lic).toEqual({ plan: "monthly", expires_at: T0 + 30 * DAY + 30 * DAY, cycle_anchor: T0 });
    expect((await w.getOrder(again.orderCode, again.orderToken)).body).toMatchObject({ status: "paid", grant_kind: "extend" });
  });

  it("khách mua bằng VND rồi gia hạn bằng USD (và ngược lại) trên cùng một license", async () => {
    const w = makeWorld();
    const first = await w.buy({ plan: "monthly" });
    const second = await w.buyCreem({ plan: "monthly", licenseKey: first.licenseKey });
    expect((await w.getOrder(second.orderCode, second.orderToken)).body).toMatchObject({ status: "paid", grant_kind: "extend" });
    const third = await w.buy({ plan: "monthly", licenseKey: first.licenseKey });
    expect((await w.getOrder(third.orderCode, third.orderToken)).body).toMatchObject({ status: "paid", grant_kind: "extend" });
    expect(await count("licenses")).toBe(1);
    expect(await env.DB.prepare("SELECT provider, currency FROM orders ORDER BY order_code").all().then((r) => r.results)).toEqual([
      { provider: "payos", currency: "VND" },
      { provider: "creem", currency: "USD" },
      { provider: "payos", currency: "VND" },
    ]);
  });
});
```

- [ ] **Step 2: Chạy test (mong đợi đạt ngay)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm vitest run test/creem-orders.test.ts 2>&1 | grep -E "Test Files|Tests "`
Expected: `tsc` không lỗi; `Test Files  1 passed (1)`, `Tests  15 passed (15)`. Nếu có test đỏ, đó là lỗi thật của Task 1 đến 6: đọc nguyên nhân, đừng sửa test cho xanh.

- [ ] **Step 3: Chạy toàn bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm test 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  29 passed (29)`, `Tests  787 passed (787)`.

- [ ] **Step 4: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- server | wc -l`
Expected: `21`.

---

### Task 8: Hoàn tiền và tranh chấp

> **Lịch sử; đã thay bằng** spec 2026-10-14 §4.4 (Q1, 2026-10-15): hoàn đủ ở mọi trạng thái chưa `refunded` thì đơn thành `refunded`, mọi sự kiện có nhật ký và cảnh báo, khử trùng theo mã sự kiện, sự kiện không khớp đơn ghi `payment_unmatched`.

**Files:**
- Modify: `server/src/payment/provider.ts`, `server/src/payment/creem-webhook.ts`, `server/src/orders.ts`, `server/src/alerts.ts`
- Modify (test): `server/test/fakes.ts`, `server/test/creem-webhook.test.ts`, `server/test/creem-orders.test.ts`

Hợp đồng (spec D5, §4.4): Creem gửi `refund.created` hay `dispute.created` (đã ký). Server **tin payload đã ký** (không hỏi lại API: `status` của đơn trong OpenAPI của Creem chỉ liệt kê `pending` và `paid`, nên chưa chắc API phản ánh hoàn tiền), tra đơn theo `(provider, provider_ref)` với `provider_ref = object.checkout.id`, rồi:
- đơn đang `paid` và hoàn **đủ** (`refund.created` có `status: "succeeded"` hay là `dispute.created`, và `transaction.refunded_amount ≥ transaction.amount_paid > 0`): đơn thành `refunded`, ghi nhật ký `order_refunded` (kèm `reason`), cảnh báo `order_refunded` (hay `order_disputed` nếu là tranh chấp), cùng một batch D1, điều kiện `status = 'paid'` nằm trong câu `UPDATE` nên hai webhook chạy chồng chỉ đổi một lần;
- hoàn một phần, hoàn chưa thành công, payload thiếu số tiền, hay tranh chấp chưa thấy hoàn đủ: chỉ nhật ký và cảnh báo (`order_partially_refunded` hay `order_disputed`), đơn giữ `paid`;
- đơn chưa trả hay đã `refunded`: không đổi gì; phiên lạ: `200 unknown_order`;
- **không đụng license** (người vận hành thu hồi tay ở Web Admin nếu cần).

- [ ] **Step 1: `FakeCreem` thêm sự kiện hoàn tiền; viết test phân tích sự kiện và test route**

**Sửa `server/test/fakes.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/fakes.ts
+++ b/server/test/fakes.ts
@@ -262,6 +262,46 @@
   async signedEvent(eventType: string, object: Record<string, unknown>): Promise<{ raw: string; headers: Record<string, string> }> {
     const raw = JSON.stringify({ id: `evt_fake${++this.seq}`, eventType, created_at: 1728734325927, object });
     return { raw, headers: { "creem-signature": await hmacSha256Hex(this.secret, raw) } };
+  }
+
+  /**
+   * Webhook `refund.created` (hay `dispute.created` nếu `dispute`) của phiên đã trả: hoàn `amount` cent trên tổng khách đã trả
+   * (mặc định hoàn đủ). Hình dạng theo ví dụ ở https://docs.creem.io/code/webhooks.
+   */
+  refundWebhook(checkoutId: string, opts: { amount?: number; dispute?: boolean; status?: string } = {}) {
+    const c = this.must(checkoutId);
+    if (!c.order) throw new Error(`phiên ${checkoutId} chưa có đơn`);
+    const amountPaid = c.order.amount + c.order.tax;
+    const refunded = opts.amount ?? amountPaid;
+    const transaction = {
+      id: "tran_fake",
+      object: "transaction",
+      amount: c.order.amount,
+      amount_paid: amountPaid,
+      currency: "USD",
+      type: "payment",
+      tax_amount: c.order.tax,
+      status: opts.dispute ? "chargeback" : "refunded",
+      refunded_amount: refunded,
+      order: c.order.id,
+      mode: "test",
+    };
+    const checkout = { id: c.id, object: "checkout", request_id: c.requestId, status: "completed", metadata: c.metadata, mode: "test" };
+    const order = { id: c.order.id, object: "order", amount: c.order.amount, currency: "USD", status: c.order.status, mode: "test" };
+    return opts.dispute
+      ? this.signedEvent("dispute.created", { id: "disp_fake", object: "dispute", amount: refunded, currency: "USD", transaction, checkout, order, mode: "test" })
+      : this.signedEvent("refund.created", {
+          id: "ref_fake",
+          object: "refund",
+          status: opts.status ?? "succeeded",
+          refund_amount: refunded,
+          refund_currency: "USD",
+          reason: "requested_by_customer",
+          transaction,
+          checkout,
+          order,
+          mode: "test",
+        });
   }
 
   /** Webhook `checkout.completed` của phiên (hình dạng theo ví dụ ở https://docs.creem.io/code/webhooks). */
```

**Sửa `server/test/creem-webhook.test.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/creem-webhook.test.ts
+++ b/server/test/creem-webhook.test.ts
@@ -92,4 +92,57 @@
       expect(await verifyCreemWebhook(SECRET, await hook({ ...completed("7"), eventType }))).toEqual({ kind: "ignore" });
     }
   });
+
+  /** Payload hoàn tiền hay tranh chấp rút gọn theo ví dụ trong tài liệu Creem. */
+  function refundEvent(eventType: string, patch: { checkout?: unknown; transaction?: unknown; status?: unknown } = {}) {
+    return {
+      id: "evt_61eTsJHUgInFw2BQKhTiPV",
+      eventType,
+      created_at: 1728734351631,
+      object: {
+        id: "ref_3DB9NQFvk18TJwSqd0N6bd",
+        status: "status" in patch ? patch.status : "succeeded",
+        refund_amount: 1210,
+        transaction: "transaction" in patch ? patch.transaction : { id: "tran_1", amount: 1000, amount_paid: 1210, status: "refunded", refunded_amount: 1210 },
+        checkout: "checkout" in patch ? patch.checkout : { id: "ch_4l0N34kxo16AhRKUHFUuXr", request_id: "1000042" },
+      },
+    };
+  }
+
+  it("refund.created hoàn đủ (đã hoàn ≥ đã trả): trả cò hoàn tiền với mã phiên và full = true", async () => {
+    expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created")))).toEqual({
+      kind: "refund",
+      providerRef: "ch_4l0N34kxo16AhRKUHFUuXr",
+      reason: "refund",
+      full: true,
+    });
+  });
+
+  it("dispute.created: reason là dispute", async () => {
+    const dispute = refundEvent("dispute.created", {
+      transaction: { amount: 1100, amount_paid: 1331, status: "chargeback", refunded_amount: 1331 },
+    });
+    expect(await verifyCreemWebhook(SECRET, await hook(dispute))).toMatchObject({ kind: "refund", reason: "dispute", full: true });
+  });
+
+  it.each([
+    ["hoàn một phần", { transaction: { amount_paid: 1210, refunded_amount: 500 } }],
+    ["hoàn chưa thành công (status khác succeeded)", { status: "failed" }],
+    ["thiếu status", { status: undefined }],
+    ["thiếu giao dịch", { transaction: undefined }],
+    ["giao dịch thiếu số tiền", { transaction: { status: "refunded" } }],
+    ["số tiền là chuỗi", { transaction: { amount_paid: "1210", refunded_amount: "1210" } }],
+    ["đơn không có tiền (amount_paid 0)", { transaction: { amount_paid: 0, refunded_amount: 0 } }],
+  ])("refund.created %s: full = false (chỉ cảnh báo, không đổi đơn)", async (_why, patch) => {
+    expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", patch)))).toMatchObject({ kind: "refund", full: false });
+  });
+
+  it.each([
+    ["thiếu checkout", { checkout: undefined }],
+    ["checkout không phải object", { checkout: "ch_1" }],
+    ["checkout.id không phải chuỗi", { checkout: { id: 7 } }],
+    ["checkout.id rỗng", { checkout: { id: "" } }],
+  ])("refund.created %s: \"malformed\" (đúng chữ ký, nội dung không đọc được)", async (_why, patch) => {
+    expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", patch)))).toBe("malformed");
+  });
 });
```

**Sửa `server/test/creem-orders.test.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/creem-orders.test.ts
+++ b/server/test/creem-orders.test.ts
@@ -212,3 +212,120 @@
     ]);
   });
 });
+
+describe("webhook Creem: hoàn tiền và tranh chấp (spec 2026-10-14 D5: ghi nhận và cảnh báo, không đụng license)", () => {
+  const alerts = () => env.DB.prepare("SELECT kind, count FROM ops_alerts ORDER BY kind").all().then((r) => r.results);
+  const audits = (action: string) =>
+    env.DB.prepare("SELECT actor, order_code, detail FROM audit_log WHERE action = ?").bind(action).all().then((r) => r.results);
+  const licenseRow = () => env.DB.prepare("SELECT plan, expires_at, revoked_at FROM licenses").first();
+
+  async function refund(w: World, checkoutId: string, opts: { amount?: number; dispute?: boolean; status?: string } = {}) {
+    const hook = await w.creem.refundWebhook(checkoutId, opts);
+    return w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers);
+  }
+
+  it("hoàn đủ một đơn đã trả: đơn thành refunded, nhật ký và cảnh báo, license giữ nguyên, app thấy refunded", async () => {
+    const w = makeWorld();
+    const { orderCode, orderToken, checkoutId } = await w.buyCreem();
+    const before = await licenseRow();
+    w.clock.now = T0 + 3600;
+    expect(await refund(w, checkoutId)).toMatchObject({ status: 200, body: { ok: true, result: "refunded" } });
+    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded", amount_paid: 399 });
+    expect(await licenseRow()).toEqual(before);
+    expect((await w.getOrder(orderCode, orderToken)).body).toMatchObject({ status: "refunded" });
+    expect(await audits("order_refunded")).toEqual([{ actor: "webhook", order_code: orderCode, detail: expect.stringContaining('"reason":"refund"') }]);
+    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 1 }]);
+  });
+
+  it("webhook hoàn tiền gửi trùng: chỉ đổi và cảnh báo một lần", async () => {
+    const w = makeWorld();
+    const { checkoutId } = await w.buyCreem();
+    const hook = await w.creem.refundWebhook(checkoutId);
+    const results = await Promise.all([1, 2, 3].map(() => w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)));
+    expect(results.filter((r) => r.body.result === "refunded")).toHaveLength(1);
+    expect(results.filter((r) => r.body.result === "ignored")).toHaveLength(2);
+    expect(await audits("order_refunded")).toHaveLength(1);
+    expect(await alerts()).toEqual([{ kind: "order_refunded", count: 1 }]);
+  });
+
+  it("hoàn một phần: đơn vẫn paid, chỉ ghi nhận và cảnh báo order_partially_refunded", async () => {
+    const w = makeWorld();
+    const { orderCode, checkoutId } = await w.buyCreem();
+    expect(await refund(w, checkoutId, { amount: 100 })).toMatchObject({ status: 200, body: { ok: true, result: "noted" } });
+    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
+    expect(await audits("order_partially_refunded")).toHaveLength(1);
+    expect(await alerts()).toEqual([{ kind: "order_partially_refunded", count: 1 }]);
+  });
+
+  it("hoàn chưa thành công (status failed): chỉ cảnh báo, không đổi đơn", async () => {
+    const w = makeWorld();
+    const { orderCode, checkoutId } = await w.buyCreem();
+    expect(await refund(w, checkoutId, { status: "failed" })).toMatchObject({ body: { result: "noted" } });
+    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
+  });
+
+  it("tranh chấp (chargeback) lấy lại đủ tiền: đơn thành refunded, cảnh báo order_disputed (không phải order_refunded)", async () => {
+    const w = makeWorld();
+    const { orderCode, checkoutId } = await w.buyCreem({ tax: 80 });
+    expect(await refund(w, checkoutId, { dispute: true })).toMatchObject({ status: 200, body: { result: "refunded" } });
+    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
+    expect(await audits("order_refunded")).toEqual([{ actor: "webhook", order_code: orderCode, detail: expect.stringContaining('"reason":"dispute"') }]);
+    expect(await alerts()).toEqual([{ kind: "order_disputed", count: 1 }]);
+  });
+
+  it("tranh chấp một phần: chỉ ghi nhận, cảnh báo order_disputed", async () => {
+    const w = makeWorld();
+    const { orderCode, checkoutId } = await w.buyCreem();
+    expect(await refund(w, checkoutId, { dispute: true, amount: 100 })).toMatchObject({ body: { result: "noted" } });
+    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
+    expect(await audits("order_disputed")).toHaveLength(1);
+    expect(await alerts()).toEqual([{ kind: "order_disputed", count: 1 }]);
+  });
+
+  it("phiên không thuộc đơn nào của ta: 200 unknown_order, không cảnh báo", async () => {
+    const w = makeWorld();
+    const { checkoutId } = await w.buyCreem();
+    await env.DB.prepare("UPDATE orders SET provider_ref = 'ch_khac'").run();
+    expect(await refund(w, checkoutId)).toMatchObject({ status: 200, body: { ok: true, result: "unknown_order" } });
+    expect(await alerts()).toEqual([]);
+  });
+
+  it("đơn chưa trả (webhook hoàn tiền tới trước webhook thanh toán): không đổi gì", async () => {
+    const w = makeWorld();
+    const { orderCode, checkoutId } = await checkout(w);
+    w.creem.pay(checkoutId);
+    expect(await refund(w, checkoutId)).toMatchObject({ status: 200, body: { result: "ignored" } });
+    expect(await orderRow(orderCode)).toMatchObject({ status: "pending" });
+    expect(await alerts()).toEqual([]);
+  });
+
+  it("đúng chữ ký mà thiếu mã phiên: 400 invalid_request; sai chữ ký: 400 invalid_signature và có cảnh báo", async () => {
+    const w = makeWorld();
+    const { checkoutId } = await w.buyCreem();
+    const noCheckout = await w.creem.signedEvent("refund.created", { id: "ref_x", status: "succeeded" });
+    expect(await w.call("POST", "/v1/webhooks/creem", noCheckout.raw, noCheckout.headers)).toMatchObject({ status: 400, body: { error: "invalid_request" } });
+    const hook = await w.creem.refundWebhook(checkoutId);
+    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, { "creem-signature": "0".repeat(64) })).toMatchObject({
+      status: 400,
+      body: { error: "invalid_signature" },
+    });
+    expect(await alerts()).toEqual([{ kind: "webhook_bad_signature", count: 1 }]);
+  });
+
+  it("D1 lỗi giữa chừng: 503 để Creem gửi lại, đơn giữ paid; gửi lại thì xử lý đủ", async () => {
+    const w = makeWorld();
+    const { orderCode, checkoutId } = await w.buyCreem();
+    const hook = await w.creem.refundWebhook(checkoutId);
+    const err = vi.spyOn(console, "error").mockImplementation(() => {});
+    await env.DB.prepare("CREATE TRIGGER test_fail BEFORE INSERT ON audit_log WHEN NEW.action = 'order_refunded' BEGIN SELECT RAISE(ABORT, 'ghi hỏng'); END").run();
+    try {
+      expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
+    } finally {
+      await env.DB.prepare("DROP TRIGGER test_fail").run();
+      err.mockRestore();
+    }
+    expect(await orderRow(orderCode)).toMatchObject({ status: "paid" });
+    expect(await w.call("POST", "/v1/webhooks/creem", hook.raw, hook.headers)).toMatchObject({ status: 200, body: { result: "refunded" } });
+    expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
+  });
+});
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/creem-webhook.test.ts test/creem-orders.test.ts 2>&1 | grep -E "Test Files|Tests "`
Expected: FAIL: `Tests  22 failed | 34 passed (56)` (13 test phân tích sự kiện và 9 test route hoàn tiền đỏ).

- [ ] **Step 3: Cài đặt**

**Sửa `server/src/payment/provider.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/payment/provider.ts
+++ b/server/src/payment/provider.ts
@@ -48,6 +48,11 @@
 export type WebhookEvent =
   /** Cò kích hoạt: server hỏi lại cổng rồi cấp license cho đơn này. */
   | { kind: "payment"; orderCode: number }
+  /**
+   * Cổng báo hoàn tiền hay tranh chấp (đã kiểm chữ ký). Tra đơn theo `orders.provider_ref`. `full`: đã hoàn đủ số khách đã trả.
+   * Server ghi nhận và cảnh báo, không đụng license (spec 2026-10-14 D5).
+   */
+  | { kind: "refund"; providerRef: string; reason: "refund" | "dispute"; full: boolean }
   /** Sự kiện đúng chữ ký nhưng server không dùng: trả 200. */
   | { kind: "ignore" };
 
```

**Sửa `server/src/payment/creem-webhook.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/payment/creem-webhook.ts
+++ b/server/src/payment/creem-webhook.ts
@@ -38,5 +38,16 @@
     const orderCode = orderCodeOf(body.object.request_id);
     return orderCode === null ? "malformed" : { kind: "payment", orderCode };
   }
+  if (body.eventType === "refund.created" || body.eventType === "dispute.created") {
+    // Tra đơn theo id phiên (orders.provider_ref); payload của tranh chấp không chắc có request_id.
+    const checkout = body.object.checkout;
+    if (!isRecord(checkout) || typeof checkout.id !== "string" || checkout.id === "") return "malformed";
+    // "Hoàn đủ" chỉ khi hoàn tiền đã thành công và số đã hoàn ≥ số khách đã trả. Thiếu số nào thì không coi là đủ: chỉ cảnh báo.
+    const transaction = isRecord(body.object.transaction) ? body.object.transaction : {};
+    const { refunded_amount: refunded, amount_paid: paid } = transaction;
+    const succeeded = body.eventType === "dispute.created" || body.object.status === "succeeded";
+    const full = succeeded && typeof refunded === "number" && typeof paid === "number" && paid > 0 && refunded >= paid;
+    return { kind: "refund", providerRef: checkout.id, reason: body.eventType === "dispute.created" ? "dispute" : "refund", full };
+  }
   return { kind: "ignore" };
 }
```

**Sửa `server/src/alerts.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/alerts.ts
+++ b/server/src/alerts.ts
@@ -3,7 +3,16 @@
 // tối đa một email mỗi loại mỗi giờ. Thiếu OPERATOR_EMAIL thì chỉ ghi log.
 import type { EmailProvider } from "./email/provider";
 
-export type AlertKind = "many_failures" | "webhook_bad_signature" | "email_failed" | "license_locked" | "order_needs_review";
+export type AlertKind =
+  | "many_failures"
+  | "webhook_bad_signature"
+  | "email_failed"
+  | "license_locked"
+  | "order_needs_review"
+  | "order_refunded"
+  | "order_partially_refunded"
+  | "order_disputed"
+  | "provider_auth_failed";
 
 const ALERT_TEXT: Record<AlertKind, string> = {
   many_failures: "Một IP có từ 60 lần kiểm key hoặc activation thất bại trong 1 giờ (có thể đang dò key)",
@@ -11,6 +20,10 @@
   email_failed: "Gửi email chứa license key thất bại (cron sẽ gửi lại)",
   license_locked: "Key bị khóa tạm vì gỡ rồi kích hoạt máy khác quá ngưỡng",
   order_needs_review: "License đã thu hồi nhận được tiền của một đơn gia hạn hay đổi gói; xử lý tay ở /admin/orders/<n>/resolve",
+  order_refunded: "Một đơn đã được hoàn tiền đủ ở cổng thanh toán (đơn thành refunded); license giữ nguyên, thu hồi tay ở Web Admin nếu cần",
+  order_partially_refunded: "Một đơn được hoàn tiền một phần ở cổng thanh toán (đơn vẫn paid); xem nhật ký order_partially_refunded",
+  order_disputed: "Khách mở tranh chấp (chargeback) cho một đơn; Creem tính phí 25 USD mỗi vụ. Xem nhật ký order_refunded hay order_disputed và cân nhắc thu hồi license",
+  provider_auth_failed: "Cổng thanh toán từ chối khóa API (HTTP 401 hay 403): khóa hết hạn, bị thu hồi hay sai. Đơn mới của cổng đó lỗi cho tới khi thay khóa",
 };
 const HOUR = 3600;
 
```

**Sửa `server/src/orders.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/orders.ts
+++ b/server/src/orders.ts
@@ -3,11 +3,12 @@
 import type { Hono } from "hono";
 import { alertIfChanged, raiseAlert } from "./alerts";
 import type { AppEnv } from "./app";
-import { audit, auditIfChanged } from "./audit";
+import { audit, auditIfChanged, auditStatement } from "./audit";
 import { sha256Hex, timingSafeEqual } from "./crypto";
 import { type Deps, sendLicenseMail } from "./deps";
 import { clientIp, fail, tooMany } from "./http";
 import { formatLicenseKey, generateLicenseKey } from "./license-key";
+import type { WebhookEvent } from "./payment/provider";
 import { computeGrant, type GrantTerms, isPlan, PLAN_NAMES, type PlanCode, type PlanTable, parsePlans } from "./plans";
 import { hit } from "./ratelimit";
 
@@ -352,6 +353,51 @@
   return "not_paid";
 }
 
+/** `refunded`: đơn đã paid được đổi sang refunded; `noted`: chỉ ghi nhận và cảnh báo; `ignored`: không đổi gì. */
+export type RefundResult = "refunded" | "noted" | "ignored" | "unknown_order";
+
+/**
+ * Webhook hoàn tiền hay tranh chấp (spec 2026-10-14 §4.4). Tin payload đã kiểm chữ ký, không hỏi lại cổng; việc ta làm chỉ là
+ * ghi nhận và cảnh báo, không đụng license (D5):
+ * - đơn đang `paid` và cổng báo hoàn đủ: đơn thành `refunded` (điều kiện `status = 'paid'` nằm ngay trong câu UPDATE, nên hai
+ *   webhook chạy chồng chỉ đổi một lần), kèm nhật ký và cảnh báo trong cùng batch;
+ * - hoàn một phần hay tranh chấp chưa thấy hoàn đủ: chỉ nhật ký và cảnh báo, đơn giữ `paid`;
+ * - đơn chưa trả (webhook hoàn tiền tới trước webhook thanh toán) hay đã `refunded`: không đổi gì.
+ */
+export async function handleRefund(
+  env: { DB: D1Database },
+  deps: Pick<Deps, "now">,
+  provider: string,
+  event: Extract<WebhookEvent, { kind: "refund" }>,
+  actor: string,
+): Promise<RefundResult> {
+  const db = env.DB;
+  const order = await db
+    .prepare("SELECT order_code, status, plan, amount, currency FROM orders WHERE provider = ? AND provider_ref = ?")
+    .bind(provider, event.providerRef)
+    .first<{ order_code: number; status: string; plan: string; amount: number; currency: string }>();
+  if (!order) return "unknown_order";
+  if (order.status !== "paid") return "ignored";
+  const now = deps.now();
+  const disputed = event.reason === "dispute";
+  const detail = { reason: event.reason, plan: order.plan, amount: order.amount, currency: order.currency };
+  if (event.full) {
+    const [res] = await db.batch([
+      db.prepare("UPDATE orders SET status = 'refunded' WHERE order_code = ? AND status = 'paid'").bind(order.order_code),
+      auditIfChanged(db, { at: now, actor, action: "order_refunded", orderCode: order.order_code, detail }),
+      alertIfChanged(db, disputed ? "order_disputed" : "order_refunded", now),
+    ]);
+    if (res?.meta.changes === 1) console.warn(JSON.stringify({ event: "order_refunded", order_code: order.order_code, reason: event.reason }));
+    return res?.meta.changes === 1 ? "refunded" : "ignored";
+  }
+  await db.batch([
+    auditStatement(db, { at: now, actor, action: disputed ? "order_disputed" : "order_partially_refunded", orderCode: order.order_code, detail }),
+    alertIfChanged(db, disputed ? "order_disputed" : "order_partially_refunded", now),
+  ]);
+  console.warn(JSON.stringify({ event: "order_not_fully_refunded", order_code: order.order_code, reason: event.reason }));
+  return "noted";
+}
+
 /**
  * Cron gửi lại email mua hàng gặp lỗi tạm, tới hạn hẹn, trong 24 giờ sau khi trả tiền, tối đa 20 đơn mỗi lần.
  * Trả về số đơn đã thử gửi.
@@ -417,6 +463,15 @@
       return fail(c, 400, "invalid_signature");
     }
     if (event.kind === "ignore") return c.json({ ok: true, result: "ignored" });
+    if (event.kind === "refund") {
+      try {
+        return c.json({ ok: true, result: await handleRefund(c.env, deps, name, event, "webhook") });
+      } catch (err) {
+        // Cổng gửi lại webhook khi nhận mã khác 2xx.
+        console.error(JSON.stringify({ event: "webhook_refund_failed", provider: name, error: String(err) }));
+        return fail(c, 503, "temporarily_unavailable");
+      }
+    }
     try {
       const result = await fulfilOrder(c.env, deps, event.orderCode, "webhook");
       return c.json({ ok: true, result });
```

- [ ] **Step 4: Chạy typecheck và toàn bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm test 2>&1 | grep -E "Test Files|Tests "`
Expected: `tsc` không lỗi; `Test Files  29 passed (29)`, `Tests  810 passed (810)`.

- [ ] **Step 5: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- server | wc -l`
Expected: `22`.

---

### Task 9: Cảnh báo khi cổng từ chối khóa API

> **Lịch sử; đã thay bằng** spec 2026-10-14 §4.1, §4.3, §4.5, §4.6 (hardening 2026-10-15/16): `provider_auth_failed` tách thành `payos_auth_failed` và `creem_auth_failed`, chỉ khi 401/403 có thân JSON của chính cổng (`PaymentProviderError.jsonBody`).

**Files:**
- Modify: `server/src/payment/provider.ts` (`isProviderAuthFailure`), `server/src/checkout.ts`, `server/src/reconcile.ts`
- Modify (test): `server/test/creem-orders.test.ts`

Khóa API hết hạn, bị thu hồi hay sai thì mọi đơn mới của cổng đó lỗi `502`. Cảnh báo `provider_auth_failed` (loại đã thêm ở Task 8) được tạo khi `POST /v1/checkout` gặp HTTP 401 hay 403 từ cổng, và khi đối soát gặp lỗi đó ở một đơn đang chờ. Lỗi khác (không trả lời, 5xx, 429) không tạo cảnh báo này.

- [ ] **Step 1: Viết test**

**Sửa `server/test/creem-orders.test.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/creem-orders.test.ts
+++ b/server/test/creem-orders.test.ts
@@ -1,7 +1,9 @@
 import { env } from "cloudflare:workers";
 import { beforeEach, describe, expect, it, vi } from "vitest";
+import { CreemProvider } from "../src/payment/creem";
 import { reconcile } from "../src/reconcile";
 import { resetDb } from "./db";
+import { TEST_CREEM_PRODUCTS, TEST_CREEM_WEBHOOK_SECRET } from "./fakes";
 import { DAY, makeWorld, T0 } from "./world";
 
 beforeEach(resetDb);
@@ -329,3 +331,50 @@
     expect(await orderRow(orderCode)).toMatchObject({ status: "refunded" });
   });
 });
+
+describe("cổng từ chối khóa API (HTTP 401, 403): cảnh báo provider_auth_failed", () => {
+  /** Thay cổng Creem của world bằng bản dùng khóa API đã bị thu hồi (FakeCreem trả 403). */
+  const revokeKey = (w: World) => {
+    w.deps.payments.creem = new CreemProvider(
+      { baseUrl: "https://creem.test", apiKey: "ck_da_thu_hoi", webhookSecret: TEST_CREEM_WEBHOOK_SECRET, productIds: { ...TEST_CREEM_PRODUCTS } },
+      w.creem.fetch,
+    );
+  };
+  const alerts = () => env.DB.prepare("SELECT kind, count FROM ops_alerts").all().then((r) => r.results);
+
+  it("tạo đơn mà Creem từ chối khóa: 502 như mọi lỗi cổng, đơn failed, có cảnh báo", async () => {
+    const w = makeWorld();
+    revokeKey(w);
+    const err = vi.spyOn(console, "error").mockImplementation(() => {});
+    expect(await w.call("POST", "/v1/checkout", usd)).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
+    err.mockRestore();
+    expect(await orderRow(1)).toMatchObject({ status: "failed" });
+    expect(await alerts()).toEqual([{ kind: "provider_auth_failed", count: 1 }]);
+  });
+
+  it("lỗi khác của cổng (không trả lời, 500) không phải lỗi khóa: không có cảnh báo provider_auth_failed", async () => {
+    const w = makeWorld();
+    w.creem.down = true;
+    const err = vi.spyOn(console, "error").mockImplementation(() => {});
+    expect((await w.call("POST", "/v1/checkout", usd)).status).toBe(502);
+    err.mockRestore();
+    expect(await alerts()).toEqual([]);
+  });
+
+  it("đối soát gặp 403 ở đơn đang chờ: tính một lỗi, đơn giữ nguyên, có cảnh báo; lần sau khóa đúng thì cấp bình thường", async () => {
+    const w = makeWorld();
+    const { orderCode, checkoutId } = await checkout(w);
+    w.creem.pay(checkoutId);
+    const good = w.deps.payments.creem!;
+    revokeKey(w);
+    const err = vi.spyOn(console, "error").mockImplementation(() => {});
+    w.clock.now = T0 + 300;
+    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 0, errors: 1 });
+    err.mockRestore();
+    expect(await orderRow(orderCode)).toMatchObject({ status: "pending" });
+    expect(await alerts()).toEqual([{ kind: "provider_auth_failed", count: 1 }]);
+    w.deps.payments.creem = good;
+    w.clock.now = T0 + 600;
+    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 1, errors: 0 });
+  });
+});
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/creem-orders.test.ts 2>&1 | grep -E "Test Files|Tests "`
Expected: FAIL: `Tests  2 failed | 26 passed (28)`.

- [ ] **Step 3: Cài đặt**

**Sửa `server/src/payment/provider.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/payment/provider.ts
+++ b/server/src/payment/provider.ts
@@ -69,6 +69,11 @@
   getPaymentStatus(ref: { orderCode: number; providerRef: string | null }): Promise<PaymentStatusResult>;
 }
 
+/** Cổng từ chối khóa API (HTTP 401 hay 403): khóa sai, hết hạn hay bị thu hồi. */
+export function isProviderAuthFailure(err: unknown): boolean {
+  return err instanceof PaymentProviderError && (err.httpStatus === 401 || err.httpStatus === 403);
+}
+
 export class PaymentProviderError extends Error {
   constructor(
     message: string,
```

**Sửa `server/src/checkout.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/checkout.ts
+++ b/server/src/checkout.ts
@@ -1,12 +1,14 @@
 // GET /v1/plans và POST /v1/checkout (§6.8): bảng gói đang bán; tạo đơn, gọi cổng thanh toán,
 // trả link, chuỗi VietQR, order_token, và ước tính hạn mới của license khi gia hạn hay đổi gói.
 import type { Context, Hono } from "hono";
+import { raiseAlert } from "./alerts";
 import type { AppEnv } from "./app";
 import { audit } from "./audit";
 import { b64urlEncode, randomBytes, sha256Hex } from "./crypto";
 import type { Deps } from "./deps";
 import { clientIp, fail, parseEmail, readJson, tooMany } from "./http";
 import { normalizeLicenseKey } from "./license-key";
+import { isProviderAuthFailure } from "./payment/provider";
 import { computeGrant, isPlan, LEGACY_PLAN_CODES, offeredPlanCodes, PLAN_CODES, PLAN_NAMES, parsePlans, type PlanCode } from "./plans";
 import { failureBlock, hit, noteFailure } from "./ratelimit";
 
@@ -156,6 +158,8 @@
     } catch (err) {
       await db.prepare("UPDATE orders SET status = 'failed' WHERE order_code = ?").bind(orderCode).run();
       console.error(JSON.stringify({ event: "checkout_failed", order_code: orderCode, provider, error: String(err) }));
+      // Khóa API bị từ chối: mọi đơn mới của cổng này sẽ lỗi cho tới khi thay khóa, nên báo người vận hành.
+      if (isProviderAuthFailure(err)) await raiseAlert(db, "provider_auth_failed", now);
       return fail(c, 502, "payment_provider_error");
     }
     await db.prepare("UPDATE orders SET provider_ref = ? WHERE order_code = ?").bind(checkout.providerRef, orderCode).run();
```

**Sửa `server/src/reconcile.ts`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/src/reconcile.ts
+++ b/server/src/reconcile.ts
@@ -3,10 +3,10 @@
 // - gửi lại email mua hàng chưa gửi được;
 // - gửi cảnh báo cho người vận hành; dọn bộ đếm cũ.
 // Mỗi bước chạy riêng: một bước lỗi thì ghi log, các bước sau vẫn chạy.
-import { sendAlerts } from "./alerts";
+import { raiseAlert, sendAlerts } from "./alerts";
 import type { Deps } from "./deps";
 import { fulfilOrder, retryUnsentEmails } from "./orders";
-import { PaymentProviderError } from "./payment/provider";
+import { isProviderAuthFailure, PaymentProviderError } from "./payment/provider";
 import { pruneRateLimits } from "./ratelimit";
 
 /** Giờ đầu hỏi mỗi lần chạy (5 phút), sau đó mỗi giờ một lần, tới 24 giờ thì thôi và coi là hết hạn. */
@@ -70,6 +70,13 @@
         } catch (markErr) {
           console.error(JSON.stringify({ event: "reconcile_mark_failed", order_code, error: String(markErr) }));
         }
+        if (isProviderAuthFailure(err)) {
+          try {
+            await raiseAlert(env.DB, "provider_auth_failed", now);
+          } catch (alertErr) {
+            console.error(JSON.stringify({ event: "reconcile_alert_failed", order_code, error: String(alertErr) }));
+          }
+        }
         // Cổng đang quá tải hay đang lỗi: hỏi tiếp chỉ làm nặng thêm. Các đơn còn lại để lần cron sau.
         const status = err instanceof PaymentProviderError ? err.httpStatus : undefined;
         const unavailable = err instanceof PaymentProviderError && (err.unreachable || (status !== undefined && status >= 500));
```

- [ ] **Step 4: Chạy typecheck và toàn bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm test 2>&1 | grep -E "Test Files|Tests "`
Expected: `tsc` không lỗi; `Test Files  29 passed (29)`, `Tests  813 passed (813)`.

---

### Task 10: Kiểm tra toàn bộ phần server

**Files:** không sửa file nào.

- [ ] **Step 1: Chạy `pnpm check` (typecheck, vector token, test, test scripts, Web Admin, dry-run hai Worker)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm check 2>&1 | grep -E "Test Files|Tests |^ℹ (tests|pass|fail|skipped)|vectors|Total Upload|dry-run: exiting"`
Expected:
- vitest server: `Test Files  29 passed (29)`, `Tests  813 passed (813)`;
- `ℹ tests 21`, `ℹ pass 20`, `ℹ fail 0`, `ℹ skipped 1`;
- vitest Web Admin (không đổi ở phần 01): `Test Files  40 passed (40)`, `Tests  846 passed (846)`;
- hai dòng `Total Upload` và hai dòng `--dry-run: exiting now.` (hai Worker đều đóng gói được).

- [ ] **Step 2: Đối chiếu với spec**

Đọc lại `docs/superpowers/specs/2026-10-14-creem-international-payment-design.md` §4.1 đến §4.5 và §4.7, §4.8: mỗi hợp đồng có test ở Task 1 đến 9 (giao diện, `CreemProvider`, chọn cổng theo `currency`, `suggested_currency`, hạn 30 phút, webhook thô, hoàn tiền và tranh chấp, cảnh báo, cấu hình, **không migration**). `git status --short -- server/migrations` phải rỗng.

- [ ] **Step 3: Kiểm lần cuối cây làm việc (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short -- server | wc -l && git log --oneline -1 | cat`
Expected: `payment`; `23` (số file đã đổi hay mới dưới `server/` sau Task 9); `064a8c8 chore(release): nâng phiên bản 0.1.8 → 0.1.9` (chưa có commit nào trên nhánh).
