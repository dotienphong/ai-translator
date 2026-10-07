# Ba gói và mỗi key một máy · 01: Server (license server)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** License server bán hai gói `monthly` (50.000 đ, 3000 phút mỗi chu kỳ 30 ngày, 30 ngày mỗi đơn) và `yearly` (500.000 đ, không giới hạn, 365 ngày mỗi đơn), quy đổi khi đổi gói theo giá mỗi ngày, ghi dùng thử Free theo máy (`POST /v1/trial`, 10 ngày, token `typ: "trial"`), và áp luật mỗi key một máy (`409 key_in_use`, `allow_conflict`, `409 license_conflict`).

**Kiến trúc:** Mã gói nằm trong `src/token.ts` (`PLAN_CODES`) và `src/plans.ts` (`PLAN_NAMES`); giá, hạn mức, số ngày mỗi đơn nằm trong biến `PLANS` của `wrangler.jsonc`. Migration `0002` dựng lại các bảng có CHECK mã gói (và các bảng con trỏ tới chúng), đổi mã gói cũ, thêm bảng `trials`. Route mới `src/trial.ts`. Luật một máy nằm trong `src/licenses.ts`: "xung đột" là license có từ 2 máy đang kích hoạt, không thêm cột. Token dùng thử dùng chung định dạng `v1` và khóa ký với token bản quyền; hai loại phân biệt bằng trường `typ`.

**Công nghệ:** TypeScript, Hono 4.13.12, Cloudflare Workers + D1, Vitest + `@cloudflare/vitest-plugin` 1.3.4, wrangler 4.145.0, `node --test`. Không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-10-07-three-plans-single-device-design.md` mục 2, 3.1, 4.1, 5.1, 9 (phần server). **Hợp đồng server–app:** kế hoạch 00 (`2026-10-07-ba-goi-00-tong-quan.md`), mục "Hợp đồng giữa server và app".

**Cây tham chiếu:** base `d0f9b30`, nhánh `ref-bg01` (worktree `meeting-translator-work/bg01-repo`, cùng kho git với repo chính), mỗi task một commit: Task 1 `c93eb7d`, Task 2 `9014358`, Task 3 `7992242`, Task 4 `d8d4a5a`, Task 5 `01d5cd4`, Task 6 `e4bc58b`, Task 7 `b28c5d2`, Task 8 `6784824`, Task 9 `107c807`. Mọi patch trong kế hoạch lấy đúng từ các commit này; mọi lệnh test và kết quả mong đợi đã chạy thật trên cây đó.

## Điều chỉnh so với spec (đã đối chiếu code)

1. **Migration dựng lại bốn bảng, không phải hai.** `licenses` là bảng cha của `activations`, `deactivations`, `orders`. Xóa bảng cha khi còn bảng con trỏ tới là vi phạm khóa ngoại, và `PRAGMA defer_foreign_keys` không cứu được: bộ đếm vi phạm không giảm khi đổi tên bảng mới về tên cũ (đã thử, D1 báo `FOREIGN KEY constraint failed`). Vì vậy `0002` tạo `licenses_new` và các bảng con `*_new` trỏ tới bảng mới, chép dữ liệu, xóa bảng cũ theo thứ tự con trước cha, rồi đổi tên; SQLite tự sửa `REFERENCES` khi đổi tên. Bộ đếm `AUTOINCREMENT` của `orders` và `deactivations` được giữ (production bắt đầu số đơn từ 1.000.001).
2. **`/v1/trial` dùng một câu UPSERT** (`INSERT … ON CONFLICT (device_id_hash) DO UPDATE SET last_seen_at = … RETURNING started_at, ends_at`) thay cho "INSERT … DO NOTHING rồi đọc lại". Cùng kết quả (một dòng mỗi máy, `started_at` không đổi), một câu lệnh, nguyên tử.
3. **Bucket giới hạn tần suất tên `trial_ip`** (theo cách đặt tên `checkout_ip`, `activate_ip`), spec ghi `trial`. Ngưỡng vẫn 10 lần/giờ/IP.
4. **Luật khóa tạm khi hai máy gỡ qua gỡ lại, ngưỡng 2.** Luật §10.2 đếm số lần gỡ do người dùng trong 30 ngày, **trừ các lần gỡ chính máy đang xin kích hoạt**, và khóa khi số còn lại vượt `MAX_DEACTIVATIONS_IN_WINDOW`. Chủ dự án chốt ngày 2026-10-07 ngưỡng này là **2** (code cũ là 3; Task 8 hạ xuống). Hệ quả cho hai máy giành một key bằng "gỡ máy kia rồi kích hoạt" (gỡ xen kẽ A, B, A, B, A): sau 4 lần gỡ máy xin kích hoạt còn được, sau lần gỡ thứ 5 thì máy kia (B) xin kích hoạt nhận `423`, vì lúc đó máy A đã bị gỡ 3 lần (3 > 2). Nếu mỗi máy vào bằng xác nhận xung đột (`allow_conflict`), luật đếm **mọi** lần gỡ do người dùng, kể cả các lần gỡ chính máy xin (Task 9): lần vào thứ 4 thấy 3 lần gỡ nên bị khóa. Hai máy gỡ xen kẽ như vậy bị khóa sau 3 lần gỡ. Cả hai hành vi đều có test (Task 5 viết với ngưỡng 3, Task 8 viết lại với ngưỡng 2, Task 9 sửa test xác nhận xung đột).
5. **Danh sách máy nằm ở trường `devices`** đúng hợp đồng 00. Code cũ trả `409 device_limit` với trường `activations`; mã `device_limit` bỏ hẳn. App (kế hoạch 02) đọc `devices`. `409 license_conflict` của `activate` có thêm `activation_id` của chính máy gọi (hợp đồng 00 sửa ngày 2026-10-07, Task 7); của `validate` thì không.
6. **`validate` khi đang xung đột vẫn ghi `last_validated_at`**, để danh sách máy cho người dùng thấy máy nào vừa dùng. Spec không nói.
7. **`allow_conflict` không phải boolean** thì `400 invalid_request` với `field: "allow_conflict"`.
8. **Admin tra cứu:** body nhận thêm `device_id_hash`. Response có thêm `trial` (dòng `trials` hoặc `null`) chỉ khi tra theo máy; mỗi license trong mọi kiểu tra có thêm `conflict: boolean`.
9. **Bộ test đầy đủ đỏ tạm ở Task 1–2.** Task 1 đổi mã gói trong token, Task 2 đổi `PLANS`, nhưng CHECK của D1 chỉ đổi ở Task 3. Hai task đầu chỉ chạy test của phần mình (ghi rõ trong từng task); `pnpm check` xanh lại từ cuối Task 3 và giữ xanh tới hết.
10. **Luật khóa tạm khi vào bằng `allow_conflict` (review cuối).** Vào bằng `allow_conflict` đẩy key sang xung đột và khóa cả máy đang giữ key. Nếu vẫn trừ các lần gỡ chính máy xin, một máy lạ có thể vào rồi bị chủ key gỡ lại vô hạn mà không bao giờ bị khóa. Vì vậy khi `activate` có `allow_conflict: true`, luật khóa tạm đếm mọi lần gỡ `by = 'user'` trong 30 ngày kể từ `lock_cleared_at`, kể cả lần gỡ chính máy xin; không có `allow_conflict` thì giữ nguyên cách đếm cũ. Ngưỡng vẫn `> 2`. Spec mục 4.1 và kế hoạch 03 đã ghi điều này (Task 9).

## Cấu trúc file

| File | Việc |
|---|---|
| `server/src/token.ts` | `PLAN_CODES` = `monthly`, `yearly`; token bản quyền có `typ` là sai dạng; `signTrialToken`, `verifyTrialToken` |
| `server/scripts/gen-token-vectors.mjs`, `server/test/vectors/token-v1.json` | Vector mới: mã gói mới, vector `typ`, khóa gốc `trial` |
| `server/src/plans.ts` | `PLAN_NAMES` Monthly/Yearly; `computeGrant` quy đổi theo giá mỗi ngày |
| `server/wrangler.jsonc` | `PLANS` hai gói; `TRIAL_DAYS: 10` |
| `server/migrations/0002_three_plans_trials.sql` (mới) | Dựng lại bảng, đổi mã gói, bảng `trials` |
| `server/src/trial.ts` (mới) | `POST /v1/trial`, `parseTrialDays` |
| `server/src/licenses.ts` | Một máy, `key_in_use`, `allow_conflict`, `license_conflict` (có `activation_id` của máy gọi khi trả từ `activate`) |
| `server/src/admin.ts` | Tra cứu theo `device_id_hash`, cờ `conflict`; chú thích số ngày của `grant_new_license` |
| `server/src/{app,env,http,ratelimit,deps}.ts` | Đăng ký route, biến `TRIAL_DAYS`, mã lỗi, bucket `trial_ip`, gói của token ký thử |
| `server/vitest.config.ts`, `server/test/env.d.ts` | D1 trống `MIGRATION_DB` cho test migration |
| `server/test/*.test.ts`, `server/test/world.ts`, `server/test/db.ts`, `server/test/node/wrangler-config.test.mjs` | Test mới và test cũ theo mã gói mới, luật một máy |

## Quy ước

- Mọi lệnh `git apply` chạy ở gốc repo `/Users/dtphong/Desktop/software_business/ai-translator`. Mọi lệnh `pnpm` chạy trong `server/` (gọi `cd server` một lần; các khối lệnh dưới đây coi như đang ở `server/`, trừ `git`).
- Trước Task 1: `cd server && pnpm install --frozen-lockfile`.
- Patch phải áp sạch. Không áp được thì dừng và báo, không sửa tay.
- Không chạy `wrangler deploy`, `wrangler d1 … --remote`, `wrangler secret`. `pnpm dry-run` (nằm trong `pnpm check`) không chạm production.
- Commit kết thúc bằng `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`.

---

## Task 1: Token: mã gói mới, token dùng thử, vector dùng chung

**Commit tham chiếu:** `c93eb7d` (nhánh `ref-bg01`).

**Files:**
- Modify: `server/scripts/gen-token-vectors.mjs`
- Modify: `server/src/deps.ts`
- Modify: `server/src/plans.ts`
- Modify: `server/src/token.ts`
- Modify: `server/test/token.test.ts`
- Modify: `server/test/vectors/token-v1.json`

`PLAN_CODES` đổi thành `["monthly", "yearly"]`. Bộ kiểm token bản quyền từ chối payload có khóa `typ` (hợp đồng 00). Thêm `TrialClaims`, `signTrialToken` (thứ tự trường cố định `typ, kid, device_id_hash, started_at, ends_at, issued_at`) và `verifyTrialToken` (thứ tự kiểm: định dạng, kid, chữ ký, máy; không xét thời hạn). Phần kiểm định dạng/kid/chữ ký tách thành hàm chung `checkSigned`. `PLAN_NAMES` và token ký thử của `deps.ts` đổi theo mã mới để `tsc` của `src/` không lỗi.

Vector `test/vectors/token-v1.json` sinh lại bằng script (Ed25519 tất định): base dùng `plan: "monthly"`, `quota_minutes_per_cycle: 3000`; `valid_unlimited` dùng `yearly`, hạn 365 ngày; thêm `license_with_typ`, `old_plan_code` (đều `malformed`); thêm khóa gốc `trial` (`checks_order`, `claims`, `tokens`). App (kế hoạch 02) đọc file này bằng `include_str!`.

Sau task này `test/plans.test.ts` và các test chạm D1 còn đỏ (mã gói cũ trong `PLANS` và CHECK của D1); Task 2–3 sửa.

- [ ] **Step 1: Viết test (red)**

```bash
git apply <<'PATCH'
diff --git a/server/test/token.test.ts b/server/test/token.test.ts
index 1c98b32..570880b 100644
--- a/server/test/token.test.ts
+++ b/server/test/token.test.ts
@@ -1,7 +1,15 @@
 import { describe, expect, it } from "vitest";
 import { b64urlEncode } from "../src/crypto";
 import { normalizeLicenseKey } from "../src/license-key";
-import { importSigningKey, signToken, type TokenClaims, verifyToken } from "../src/token";
+import {
+  importSigningKey,
+  signToken,
+  signTrialToken,
+  type TokenClaims,
+  type TrialClaims,
+  verifyToken,
+  verifyTrialToken,
+} from "../src/token";
 import { testSigningJwk } from "./keys";
 import vectors from "./vectors/token-v1.json";
 
@@ -59,6 +67,35 @@ describe("token Ed25519 theo vector dùng chung (Đ9)", () => {
   });
 });
 
+describe("token dùng thử theo vector dùng chung (spec 2026-10-07 §3.1)", () => {
+  for (const v of vectors.trial.tokens) {
+    it(`kiểm vector dùng thử ${v.name} ra ${v.expected}`, async () => {
+      const result = await verifyTrialToken(v.token, vectors.public_keys, { deviceIdHash: v.device_id_hash });
+      if (v.expected === "ok") {
+        expect(result).toEqual({ ok: true, claims: v.claims });
+      } else {
+        expect(result).toEqual({ ok: false, error: v.expected });
+      }
+    });
+  }
+
+  it("signTrialToken sinh lại đúng từng token dùng thử hợp lệ của vector", async () => {
+    for (const v of vectors.trial.tokens.filter((t) => t.expected === "ok")) {
+      const claims = v.claims as TrialClaims;
+      const key = await importSigningKey(await testSigningJwk(claims.kid));
+      expect(await signTrialToken(key, claims)).toBe(v.token);
+    }
+  });
+
+  it("token dùng thử không qua được bộ kiểm token bản quyền", async () => {
+    const v = vectors.trial.tokens[0]!;
+    expect(await verifyToken(v.token, vectors.public_keys, { now: 0, deviceIdHash: v.device_id_hash })).toEqual({
+      ok: false,
+      error: "malformed",
+    });
+  });
+});
+
 describe("license key theo vector dùng chung", () => {
   for (const v of vectors.license_keys) {
     it(`chuẩn hóa ${JSON.stringify(v.input)}`, async () => {
PATCH
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
pnpm exec vitest run test/token.test.ts
```

Kết quả mong đợi: `FAIL test/token.test.ts`, `TypeError: Cannot read properties of undefined (reading 'tokens')` (vector chưa có khóa `trial`).

- [ ] **Step 3: Viết code**

```bash
git apply <<'PATCH'
diff --git a/server/scripts/gen-token-vectors.mjs b/server/scripts/gen-token-vectors.mjs
index 1bf3b99..8674a76 100644
--- a/server/scripts/gen-token-vectors.mjs
+++ b/server/scripts/gen-token-vectors.mjs
@@ -37,18 +37,25 @@ const base = {
   activation_id: "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60",
   activation_created_at: issuedAt - 3 * 86400,
   device_id_hash: device,
-  plan: "pro",
+  plan: "monthly",
   expires_at: issuedAt + 30 * 86400,
   cycle_anchor: issuedAt - 5 * 86400,
-  quota_minutes_per_cycle: 1800,
+  quota_minutes_per_cycle: 3000,
   quota_epoch: 0,
   quota_fresh: false,
   issued_at: issuedAt,
   refresh_before: issuedAt + 14 * 86400,
 };
-// Gói X5 không giới hạn: quota_minutes_per_cycle là null (không phải thiếu trường). Cấp ngay sau khi admin
+// Gói Yearly không giới hạn: quota_minutes_per_cycle là null (không phải thiếu trường). Cấp ngay sau khi admin
 // tăng quota_epoch lên 2 (trong 15 phút) nên quota_fresh là true.
-const unlimited = { ...base, plan: "pro_x5", quota_minutes_per_cycle: null, quota_epoch: 2, quota_fresh: true };
+const unlimited = {
+  ...base,
+  plan: "yearly",
+  expires_at: issuedAt + 365 * 86400,
+  quota_minutes_per_cycle: null,
+  quota_epoch: 2,
+  quota_fresh: true,
+};
 const valid = await sign(k1, base);
 const [, , validSig] = valid.split(".");
 const tampered = `v1.${b64url(JSON.stringify({ ...base, expires_at: base.expires_at + 365 * 86400 }))}.${validSig}`;
@@ -178,6 +185,21 @@ const tokens = [
     device_id_hash: device,
     expected: "malformed",
   },
+  // Token bản quyền không có `typ`: có `typ` (kể cả "license") là sai loại, malformed.
+  {
+    name: "license_with_typ",
+    token: await sign(k1, { typ: "license", ...base }),
+    now: issuedAt + 3600,
+    device_id_hash: device,
+    expected: "malformed",
+  },
+  {
+    name: "old_plan_code",
+    token: await sign(k1, { ...base, plan: "pro" }),
+    now: issuedAt + 3600,
+    device_id_hash: device,
+    expected: "malformed",
+  },
   {
     name: "quota_zero",
     token: await sign(k1, { ...base, quota_minutes_per_cycle: 0 }),
@@ -268,6 +290,67 @@ const tokens = [
 ];
 if (!tooBigJson.includes("9007199254740993")) throw new Error("không thay được refresh_before");
 
+// Token dùng thử của Free (spec 2026-10-07 §3.1). Thứ tự trường như signTrialToken của src/token.ts.
+const trialBase = {
+  typ: "trial",
+  kid: "test-1",
+  device_id_hash: device,
+  started_at: issuedAt - 2 * 86400,
+  ends_at: issuedAt + 28 * 86400,
+  issued_at: issuedAt,
+};
+const trialValid = await sign(k1, trialBase);
+const [, , trialSig] = trialValid.split(".");
+const { ends_at: _omitEnds, ...trialMissing } = trialBase;
+const { typ: _omitTyp, ...trialNoTyp } = trialBase;
+const trialTokens = [
+  { name: "valid", token: trialValid, device_id_hash: device, expected: "ok", claims: trialBase },
+  {
+    name: "valid_backup_key",
+    token: await sign(k2, { ...trialBase, kid: "test-2" }),
+    device_id_hash: device,
+    expected: "ok",
+    claims: { ...trialBase, kid: "test-2" },
+  },
+  // Dùng thử đã hết vẫn là token hợp lệ: bên kiểm không xét thời hạn, app tự so ends_at.
+  {
+    name: "valid_ended",
+    token: await sign(k1, { ...trialBase, started_at: issuedAt - 40 * 86400, ends_at: issuedAt - 10 * 86400 }),
+    device_id_hash: device,
+    expected: "ok",
+    claims: { ...trialBase, started_at: issuedAt - 40 * 86400, ends_at: issuedAt - 10 * 86400 },
+  },
+  { name: "wrong_device", token: trialValid, device_id_hash: otherDevice, expected: "wrong_device" },
+  {
+    name: "bad_signature",
+    token: `v1.${b64url(JSON.stringify({ ...trialBase, ends_at: trialBase.ends_at + 365 * 86400 }))}.${trialSig}`,
+    device_id_hash: device,
+    expected: "bad_signature",
+  },
+  {
+    name: "unknown_kid",
+    token: await sign(k1, { ...trialBase, kid: "test-9" }),
+    device_id_hash: device,
+    expected: "unknown_kid",
+  },
+  { name: "missing_field", token: await sign(k1, trialMissing), device_id_hash: device, expected: "malformed" },
+  {
+    name: "wrong_typ",
+    token: await sign(k1, { ...trialBase, typ: "license" }),
+    device_id_hash: device,
+    expected: "malformed",
+  },
+  { name: "no_typ", token: await sign(k1, trialNoTyp), device_id_hash: device, expected: "malformed" },
+  // Token bản quyền hợp lệ không phải token dùng thử.
+  { name: "license_token", token: valid, device_id_hash: device, expected: "malformed" },
+  {
+    name: "timestamp_not_integer",
+    token: await sign(k1, { ...trialBase, ends_at: 1.5 }),
+    device_id_hash: device,
+    expected: "malformed",
+  },
+];
+
 // Ký tự kiểm tra Luhn mod 32, viết lại độc lập với src/license-key.ts.
 const KEY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
 function luhn32(body) {
@@ -300,10 +383,16 @@ const out = {
   checks_order: ["malformed", "unknown_kid", "bad_signature", "wrong_device", "license_expired", "refresh_expired"],
   note: "Khóa test-* chỉ dùng cho test. Hết hạn khi now >= expires_at hoặc now >= refresh_before (giây Unix). Token có nhiều lỗi thì trả lỗi đứng trước trong checks_order.",
   claims:
-    "kid, license_id, activation_id, device_id_hash: chuỗi; activation_created_at, expires_at, cycle_anchor, issued_at, refresh_before: số nguyên; plan: pro | pro_x2 | pro_x5; quota_minutes_per_cycle: số nguyên dương (phút mỗi chu kỳ 30 ngày) hoặc null (không giới hạn); quota_epoch: số nguyên >= 0; quota_fresh: boolean. Mọi số nguyên phải là số nguyên an toàn (|n| <= 2^53 - 1): 1.5 hay 2^53 + 1 là malformed. Payload phải là UTF-8 hợp lệ, không có BOM. Thiếu trường hay sai kiểu là malformed.",
+    "kid, license_id, activation_id, device_id_hash: chuỗi; activation_created_at, expires_at, cycle_anchor, issued_at, refresh_before: số nguyên; plan: monthly | yearly; không có trường typ (có typ là malformed); quota_minutes_per_cycle: số nguyên dương (phút mỗi chu kỳ 30 ngày) hoặc null (không giới hạn); quota_epoch: số nguyên >= 0; quota_fresh: boolean. Mọi số nguyên phải là số nguyên an toàn (|n| <= 2^53 - 1): 1.5 hay 2^53 + 1 là malformed. Payload phải là UTF-8 hợp lệ, không có BOM. Thiếu trường hay sai kiểu là malformed.",
   test_keys: [k1, k2].map(({ kid, seed_b64url, public_b64url }) => ({ kid, seed_b64url, public_b64url })),
   public_keys: { "test-1": k1.public_b64url, "test-2": k2.public_b64url },
   tokens,
+  trial: {
+    checks_order: ["malformed", "unknown_kid", "bad_signature", "wrong_device"],
+    claims:
+      "typ: đúng chuỗi \"trial\"; kid, device_id_hash: chuỗi; started_at, ends_at, issued_at: số nguyên an toàn. Thiếu trường hay sai kiểu là malformed. Bên kiểm không xét thời hạn: app so ends_at với giờ tin được (spec 2026-10-07 §3.2).",
+    tokens: trialTokens,
+  },
   license_key_check:
     "Luhn mod 32 trên ALPHABET = 0123456789ABCDEFGHJKMNPQRSTVWXYZ: từ phải sang trái, nhân 2 các ký tự ở vị trí 1, 3, 5… của 27 ký tự đầu, cộng floor(p/32) + p%32 của mỗi tích, ký tự kiểm tra = ALPHABET[(32 - tổng % 32) % 32]",
   license_keys: licenseKeys,
diff --git a/server/src/deps.ts b/server/src/deps.ts
index cc9cfce..03eb75e 100644
--- a/server/src/deps.ts
+++ b/server/src/deps.ts
@@ -61,7 +61,7 @@ export async function signKeyCheck(env: KeyEnv, now: number): Promise<KeyCheck>
     activation_id: NO_ID,
     activation_created_at: now,
     device_id_hash: NO_DEVICE,
-    plan: "pro",
+    plan: "monthly",
     expires_at: now,
     cycle_anchor: now,
     quota_minutes_per_cycle: 1,
diff --git a/server/src/plans.ts b/server/src/plans.ts
index ae2b3b6..657a2a1 100644
--- a/server/src/plans.ts
+++ b/server/src/plans.ts
@@ -1,4 +1,5 @@
-// Bốn gói (spec §2, P1) và luật mua thêm, đổi gói (§6.8). Free không bán, chỉ có trong app.
+// Ba gói (spec 2026-10-07 §1) và luật mua thêm, đổi gói (§6.8, §2.3 spec 2026-10-07). Free không bán: là dùng thử
+// theo máy (src/trial.ts).
 // Mã gói và tên hiển thị là hợp đồng với app nên nằm trong code. Hạn mức, số ngày mỗi đơn và giá
 // nằm trong biến PLANS của từng môi trường (wrangler*.jsonc): đổi giá hay hạn mức không cần phát hành lại app.
 
@@ -6,9 +7,8 @@ import { PLAN_CODES, type PlanCode } from "./token";
 
 export { PLAN_CODES, type PlanCode };
 export const PLAN_NAMES: Record<PlanCode, string> = {
-  pro: "Professional",
-  pro_x2: "Professional X2",
-  pro_x5: "Professional X5",
+  monthly: "Monthly",
+  yearly: "Yearly",
 };
 export const DAY_SECONDS = 86400;
 
@@ -30,7 +30,7 @@ const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "obj
 
 /**
  * Đọc biến PLANS. Thiếu hay sai bất kỳ chỗ nào thì trả null, để route trả 503 pricing_not_configured
- * thay vì bán sai giá hay ký token sai hạn mức. Bảng phải có đúng ba gói, và mọi gói có cùng các loại tiền
+ * thay vì bán sai giá hay ký token sai hạn mức. Bảng phải có đúng các gói của PLAN_CODES, và mọi gói có cùng các loại tiền
  * (luật đổi gói cần giá của cả gói cũ lẫn gói mới theo loại tiền của đơn).
  */
 export function parsePlans(raw: unknown): PlanTable | null {
diff --git a/server/src/token.ts b/server/src/token.ts
index 9a03641..34bae0c 100644
--- a/server/src/token.ts
+++ b/server/src/token.ts
@@ -5,8 +5,8 @@
 import { b64urlDecode, b64urlEncode } from "./crypto";
 
 export const TOKEN_VERSION = "v1";
-/** Mã gói trả phí (spec §2). Token chỉ mang một trong ba mã này; Free không có token. */
-export const PLAN_CODES = ["pro", "pro_x2", "pro_x5"] as const;
+/** Mã gói trả phí (spec 2026-10-07 §1). Token bản quyền chỉ mang một trong hai mã này; Free có token dùng thử riêng. */
+export const PLAN_CODES = ["monthly", "yearly"] as const;
 export type PlanCode = (typeof PLAN_CODES)[number];
 export const REFRESH_WINDOW_SECONDS = 14 * 86400;
 const KID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
@@ -25,7 +25,7 @@ export interface TokenClaims {
   expires_at: number;
   /** Mốc chu kỳ hạn mức 30 ngày (§6.8). */
   cycle_anchor: number;
-  /** Hạn mức mỗi chu kỳ, tính bằng phút; null là không giới hạn (X5). */
+  /** Hạn mức mỗi chu kỳ, tính bằng phút; null là không giới hạn (Yearly). */
   quota_minutes_per_cycle: number | null;
   /** Số của bộ đếm hạn mức trên máy; admin tăng để máy bắt đầu bộ đếm mới (QĐ35). */
   quota_epoch: number;
@@ -61,6 +61,19 @@ export type VerifyError =
 
 export type VerifyResult = { ok: true; claims: TokenClaims } | { ok: false; error: VerifyError };
 
+/** Token dùng thử của Free (spec 2026-10-07 §3.1): gắn với máy, hiệu lực trong [started_at, ends_at). */
+export interface TrialClaims {
+  typ: "trial";
+  kid: string;
+  device_id_hash: string;
+  started_at: number;
+  ends_at: number;
+  issued_at: number;
+}
+
+export type TrialVerifyError = "malformed" | "unknown_kid" | "bad_signature" | "wrong_device";
+export type TrialVerifyResult = { ok: true; claims: TrialClaims } | { ok: false; error: TrialVerifyError };
+
 /** Đọc secret TOKEN_SIGNING_KEY_A hoặc _B: JWK Ed25519 có `d`, `x` và `kid`. */
 export async function importSigningKey(jwkJson: string): Promise<SigningKey> {
   let jwk: Record<string, unknown>;
@@ -78,6 +91,12 @@ export async function importSigningKey(jwkJson: string): Promise<SigningKey> {
   return { kid, key };
 }
 
+async function signClaims(signingKey: SigningKey, ordered: object): Promise<string> {
+  const signingInput = `${TOKEN_VERSION}.${b64urlEncode(encoder.encode(JSON.stringify(ordered)))}`;
+  const signature = await crypto.subtle.sign({ name: "Ed25519" }, signingKey.key, encoder.encode(signingInput));
+  return `${signingInput}.${b64urlEncode(new Uint8Array(signature))}`;
+}
+
 export async function signToken(signingKey: SigningKey, claims: TokenClaims): Promise<string> {
   // Thứ tự trường cố định để token sinh lại được y hệt vector.
   const ordered: TokenClaims = {
@@ -95,14 +114,27 @@ export async function signToken(signingKey: SigningKey, claims: TokenClaims): Pr
     issued_at: claims.issued_at,
     refresh_before: claims.refresh_before,
   };
-  const signingInput = `${TOKEN_VERSION}.${b64urlEncode(encoder.encode(JSON.stringify(ordered)))}`;
-  const signature = await crypto.subtle.sign({ name: "Ed25519" }, signingKey.key, encoder.encode(signingInput));
-  return `${signingInput}.${b64urlEncode(new Uint8Array(signature))}`;
+  return signClaims(signingKey, ordered);
+}
+
+export async function signTrialToken(signingKey: SigningKey, claims: TrialClaims): Promise<string> {
+  // Thứ tự trường cố định, như signToken.
+  const ordered: TrialClaims = {
+    typ: "trial",
+    kid: claims.kid,
+    device_id_hash: claims.device_id_hash,
+    started_at: claims.started_at,
+    ends_at: claims.ends_at,
+    issued_at: claims.issued_at,
+  };
+  return signClaims(signingKey, ordered);
 }
 
 function parseClaims(json: unknown): TokenClaims | null {
   if (typeof json !== "object" || json === null) return null;
   const c = json as Record<string, unknown>;
+  // Token bản quyền không có `typ`; có `typ` (token dùng thử hay loại sau này) là sai loại.
+  if (Object.hasOwn(c, "typ")) return null;
   const strings = ["kid", "license_id", "activation_id", "device_id_hash"] as const;
   const integers = ["activation_created_at", "expires_at", "cycle_anchor", "issued_at", "refresh_before"] as const;
   for (const k of strings) if (typeof c[k] !== "string") return null;
@@ -115,24 +147,21 @@ function parseClaims(json: unknown): TokenClaims | null {
   return c as unknown as TokenClaims;
 }
 
-/**
- * Kiểm token như app sẽ kiểm (kế hoạch 06), theo thứ tự: định dạng (đủ trường, đúng kiểu, `plan` là một
- * trong ba mã gói, `quota_minutes_per_cycle` là null hoặc số nguyên dương, `quota_fresh` là boolean), kid, chữ ký, máy,
- * `expires_at`, rồi `refresh_before`. Hết hạn khi `now >= expires_at` hoặc `now >= refresh_before`.
- * `publicKeys` ánh xạ kid sang khóa công khai (32 byte, base64url).
- */
-export async function verifyToken(
+type Checked<T> = { ok: true; claims: T } | { ok: false; error: "malformed" | "unknown_kid" | "bad_signature" };
+
+/** Phần chung của hai bộ kiểm: định dạng (theo `parse`), kid, rồi chữ ký. */
+async function checkSigned<T extends { kid: string }>(
   token: string,
   publicKeys: Record<string, string>,
-  opts: { now: number; deviceIdHash: string },
-): Promise<VerifyResult> {
+  parse: (json: unknown) => T | null,
+): Promise<Checked<T>> {
   const parts = token.split(".");
   if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return { ok: false, error: "malformed" };
   const [, payload = "", sig = ""] = parts;
-  let claims: TokenClaims | null;
+  let claims: T | null;
   let signature: Uint8Array;
   try {
-    claims = parseClaims(JSON.parse(decoder.decode(b64urlDecode(payload))));
+    claims = parse(JSON.parse(decoder.decode(b64urlDecode(payload))));
     signature = b64urlDecode(sig);
   } catch {
     return { ok: false, error: "malformed" };
@@ -148,8 +177,49 @@ export async function verifyToken(
     encoder.encode(`${TOKEN_VERSION}.${payload}`),
   );
   if (!valid) return { ok: false, error: "bad_signature" };
+  return { ok: true, claims };
+}
+
+/**
+ * Kiểm token như app sẽ kiểm (kế hoạch 06), theo thứ tự: định dạng (đủ trường, đúng kiểu, không có `typ`, `plan` là
+ * một trong các mã gói, `quota_minutes_per_cycle` là null hoặc số nguyên dương, `quota_fresh` là boolean), kid, chữ ký,
+ * máy, `expires_at`, rồi `refresh_before`. Hết hạn khi `now >= expires_at` hoặc `now >= refresh_before`.
+ * `publicKeys` ánh xạ kid sang khóa công khai (32 byte, base64url).
+ */
+export async function verifyToken(
+  token: string,
+  publicKeys: Record<string, string>,
+  opts: { now: number; deviceIdHash: string },
+): Promise<VerifyResult> {
+  const checked = await checkSigned(token, publicKeys, parseClaims);
+  if (!checked.ok) return checked;
+  const { claims } = checked;
   if (claims.device_id_hash !== opts.deviceIdHash) return { ok: false, error: "wrong_device" };
   if (opts.now >= claims.expires_at) return { ok: false, error: "license_expired" };
   if (opts.now >= claims.refresh_before) return { ok: false, error: "refresh_expired" };
   return { ok: true, claims };
 }
+
+function parseTrialClaims(json: unknown): TrialClaims | null {
+  if (typeof json !== "object" || json === null) return null;
+  const c = json as Record<string, unknown>;
+  if (c.typ !== "trial") return null;
+  if (typeof c.kid !== "string" || typeof c.device_id_hash !== "string") return null;
+  for (const k of ["started_at", "ends_at", "issued_at"] as const) if (!Number.isSafeInteger(c[k])) return null;
+  return c as unknown as TrialClaims;
+}
+
+/**
+ * Kiểm token dùng thử, theo thứ tự: định dạng (`typ` là "trial", đủ trường, đúng kiểu), kid, chữ ký, máy.
+ * Không kiểm thời hạn: app so `ends_at` với giờ tin được của nó (spec 2026-10-07 §3.2).
+ */
+export async function verifyTrialToken(
+  token: string,
+  publicKeys: Record<string, string>,
+  opts: { deviceIdHash: string },
+): Promise<TrialVerifyResult> {
+  const checked = await checkSigned(token, publicKeys, parseTrialClaims);
+  if (!checked.ok) return checked;
+  if (checked.claims.device_id_hash !== opts.deviceIdHash) return { ok: false, error: "wrong_device" };
+  return checked;
+}
PATCH
```

- [ ] **Step 4: Sinh lại vector và kiểm checksum**

```bash
pnpm vectors
shasum -a 256 test/vectors/token-v1.json
pnpm vectors:check
```

Kết quả mong đợi: `b18e7b9e961181a2a8ed94bfd2178a54d8cb921116834367c5268f9bc538faa2  test/vectors/token-v1.json`; `vectors:check` thoát mã 0.

- [ ] **Step 5: Chạy test, thấy xanh**

```bash
pnpm exec vitest run test/token.test.ts
pnpm typecheck 2>&1 | grep -c '^src/'
```

Kết quả mong đợi: `Tests  56 passed (56)`. Lệnh thứ hai in `0`: không có lỗi `tsc` nào trong `src/` (lỗi còn lại chỉ ở `test/plans.test.ts`, Task 2 sửa).

- [ ] **Step 6: Kiểm khớp cây tham chiếu rồi commit**

```bash
git add -A server
git diff --cached --stat c93eb7d -- server   # phải không in gì
git commit -m "feat(server): mã gói monthly/yearly trong token, token dùng thử, vector mới

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 2: Bảng gói Monthly/Yearly và quy đổi theo giá mỗi ngày

**Commit tham chiếu:** `9014358` (nhánh `ref-bg01`).

**Files:**
- Modify: `server/src/plans.ts`
- Modify: `server/test/node/wrangler-config.test.mjs`
- Modify: `server/test/plans.test.ts`
- Modify: `server/wrangler.jsonc`

`PLANS` trong `wrangler.jsonc` còn hai gói: `monthly` (3000 phút, 30 ngày, 50.000 đ) và `yearly` (`null`, 365 ngày, 500.000 đ). `computeGrant` quy đổi khi đổi gói còn hạn theo spec mục 2.3:

```
converted = floor( remaining_secs × giá_cũ × số_ngày_mới / (giá_mới × số_ngày_cũ × 86400) )
```

tính bằng BigInt. Ví dụ của spec: Monthly còn 20 ngày → Yearly quy đổi 24 ngày (chạy 389 ngày); Yearly còn 200 ngày → Monthly quy đổi 164 ngày (chạy 194 ngày). `test/plans.test.ts` viết lại theo bảng mới, có test biên số nguyên (60 ngày Monthly → đúng 73; 365 ngày Yearly → đúng 300; thiếu 1 giây thì làm tròn xuống) và test số ngày lấy theo bảng hiện hành. Test Node khóa cấu hình đổi theo bảng mới.

- [ ] **Step 1: Viết test (red)**

```bash
git apply <<'PATCH'
diff --git a/server/test/node/wrangler-config.test.mjs b/server/test/node/wrangler-config.test.mjs
index cecc4d2..efc8419 100644
--- a/server/test/node/wrangler-config.test.mjs
+++ b/server/test/node/wrangler-config.test.mjs
@@ -31,12 +31,11 @@ test("Worker admin gọi đúng Worker API qua service binding", () => {
   assert.deepEqual(admin.services, [{ binding: "API", service: "mt-license", entrypoint: "AdminRpc" }]);
 });
 
-test("Worker API bán đúng bảng gói chính thức (spec §2), không có giá thử", () => {
-  const { pro, pro_x2, pro_x5, ...others } = api.vars.PLANS;
+test("Worker API bán đúng bảng gói chính thức (spec 2026-10-07 §2.1), không có giá thử", () => {
+  const { monthly, yearly, ...others } = api.vars.PLANS;
   assert.deepEqual(others, {});
-  assert.deepEqual(pro, { quota_minutes_per_cycle: 1800, days_per_order: 30, prices: { VND: 50000 } });
-  assert.deepEqual(pro_x2, { quota_minutes_per_cycle: 6000, days_per_order: 30, prices: { VND: 150000 } });
-  assert.deepEqual(pro_x5, { quota_minutes_per_cycle: null, days_per_order: 30, prices: { VND: 500000 } });
+  assert.deepEqual(monthly, { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } });
+  assert.deepEqual(yearly, { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } });
 });
 
 test("secret bắt buộc có đủ và không nằm trong vars", () => {
diff --git a/server/test/plans.test.ts b/server/test/plans.test.ts
index 7414ec5..3cc93e5 100644
--- a/server/test/plans.test.ts
+++ b/server/test/plans.test.ts
@@ -3,15 +3,14 @@ import { describe, expect, it } from "vitest";
 import { computeGrant, type LicenseTerms, parsePlans, type PlanTable } from "../src/plans";
 import { DAY, T0 } from "./world";
 
-// Bảng gói của môi trường dev (wrangler.jsonc), cũng là giá chính thức của spec §2.
+// Bảng gói production (wrangler.jsonc), cũng là giá chính thức của spec 2026-10-07 §2.1.
 const plans = parsePlans(env.PLANS) as PlanTable;
 
 describe("bảng gói (biến PLANS)", () => {
-  it("dev có đủ ba gói với hạn mức và giá của spec §2", () => {
+  it("có đúng hai gói trả phí với hạn mức, số ngày và giá của spec 2026-10-07 §2.1", () => {
     expect(plans).toEqual({
-      pro: { quota_minutes_per_cycle: 1800, days_per_order: 30, prices: { VND: 50000 } },
-      pro_x2: { quota_minutes_per_cycle: 6000, days_per_order: 30, prices: { VND: 150000 } },
-      pro_x5: { quota_minutes_per_cycle: null, days_per_order: 30, prices: { VND: 500000 } },
+      monthly: { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } },
+      yearly: { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } },
     });
   });
 
@@ -23,58 +22,73 @@ describe("bảng gói (biến PLANS)", () => {
   };
   it.each([
     ["thiếu biến", undefined],
-    ["không phải object", "pro=50000"],
-    ["thiếu một gói", bad((p) => delete p.pro_x5)],
-    ["thừa gói lạ", bad((p) => (p.pro_12m = p.pro!))],
-    ["hạn mức bằng 0", bad((p) => (p.pro!.quota_minutes_per_cycle = 0))],
-    ["hạn mức là chuỗi", bad((p) => (p.pro!.quota_minutes_per_cycle = "1800"))],
-    ["số ngày lẻ", bad((p) => (p.pro!.days_per_order = 30.5))],
-    ["giá âm", bad((p) => (p.pro!.prices = { VND: -1 }))],
-    ["loại tiền sai dạng", bad((p) => (p.pro!.prices = { vnd: 50000 }))],
-    ["không có giá", bad((p) => (p.pro!.prices = {}))],
-    ["các gói khác loại tiền", bad((p) => (p.pro!.prices = { USD: 2 }))],
+    ["không phải object", "monthly=50000"],
+    ["thiếu một gói", bad((p) => delete p.yearly)],
+    ["thừa gói lạ", bad((p) => (p.pro = p.monthly!))],
+    ["hạn mức bằng 0", bad((p) => (p.monthly!.quota_minutes_per_cycle = 0))],
+    ["hạn mức là chuỗi", bad((p) => (p.monthly!.quota_minutes_per_cycle = "3000"))],
+    ["số ngày lẻ", bad((p) => (p.monthly!.days_per_order = 30.5))],
+    ["số ngày quá 366", bad((p) => (p.yearly!.days_per_order = 367))],
+    ["giá âm", bad((p) => (p.monthly!.prices = { VND: -1 }))],
+    ["loại tiền sai dạng", bad((p) => (p.monthly!.prices = { vnd: 50000 }))],
+    ["không có giá", bad((p) => (p.monthly!.prices = {}))],
+    ["các gói khác loại tiền", bad((p) => (p.monthly!.prices = { USD: 2 }))],
   ])("sai (%s) thì null", (_why, raw) => {
     expect(parsePlans(raw)).toBeNull();
   });
 });
 
-describe("luật mua thêm và đổi gói (§6.8)", () => {
+describe("luật mua thêm và đổi gói (§6.8, spec 2026-10-07 §2.3)", () => {
   const lic = (plan: LicenseTerms["plan"], daysLeft: number, anchor = T0 - 10 * DAY): LicenseTerms => ({
     plan,
     expires_at: T0 + Math.round(daysLeft * DAY),
     cycle_anchor: anchor,
   });
 
-  it("license mới: 30 ngày từ hiện tại, cycle_anchor = hiện tại", () => {
-    expect(computeGrant(plans, null, "pro_x2", "VND", T0)).toEqual({
-      plan: "pro_x2",
+  it("license mới: số ngày của gói từ hiện tại, cycle_anchor = hiện tại", () => {
+    expect(computeGrant(plans, null, "monthly", "VND", T0)).toEqual({
+      plan: "monthly",
       expires_at: T0 + 30 * DAY,
       cycle_anchor: T0,
       kind: "new",
       converted_days: 0,
     });
+    expect(computeGrant(plans, null, "yearly", "VND", T0)).toEqual({
+      plan: "yearly",
+      expires_at: T0 + 365 * DAY,
+      cycle_anchor: T0,
+      kind: "new",
+      converted_days: 0,
+    });
   });
 
-  it("mua thêm cùng gói khi còn hạn: cộng 30 ngày vào hạn cũ, giữ cycle_anchor", () => {
-    expect(computeGrant(plans, lic("pro", 12), "pro", "VND", T0)).toEqual({
-      plan: "pro",
+  it("mua thêm cùng gói khi còn hạn: cộng số ngày của gói vào hạn cũ, giữ cycle_anchor", () => {
+    expect(computeGrant(plans, lic("monthly", 12), "monthly", "VND", T0)).toEqual({
+      plan: "monthly",
       expires_at: T0 + 42 * DAY,
       cycle_anchor: T0 - 10 * DAY,
       kind: "extend",
       converted_days: 0,
     });
+    expect(computeGrant(plans, lic("yearly", 100), "yearly", "VND", T0)).toEqual({
+      plan: "yearly",
+      expires_at: T0 + 465 * DAY,
+      cycle_anchor: T0 - 10 * DAY,
+      kind: "extend",
+      converted_days: 0,
+    });
   });
 
   it("mua thêm cùng gói ở biên hết hạn: hết hạn đúng lúc này là đã hết (chu kỳ mới); còn 1 giây là còn hạn (giữ chu kỳ)", () => {
-    expect(computeGrant(plans, lic("pro", 0), "pro", "VND", T0)).toEqual({
-      plan: "pro",
+    expect(computeGrant(plans, lic("monthly", 0), "monthly", "VND", T0)).toEqual({
+      plan: "monthly",
       expires_at: T0 + 30 * DAY,
       cycle_anchor: T0,
       kind: "extend",
       converted_days: 0,
     });
-    expect(computeGrant(plans, { ...lic("pro", 0), expires_at: T0 + 1 }, "pro", "VND", T0)).toEqual({
-      plan: "pro",
+    expect(computeGrant(plans, { ...lic("monthly", 0), expires_at: T0 + 1 }, "monthly", "VND", T0)).toEqual({
+      plan: "monthly",
       expires_at: T0 + 1 + 30 * DAY,
       cycle_anchor: T0 - 10 * DAY,
       kind: "extend",
@@ -82,81 +96,73 @@ describe("luật mua thêm và đổi gói (§6.8)", () => {
     });
   });
 
-  it("mua thêm cùng gói khi đã hết hạn 10 ngày: 30 ngày từ hiện tại, không cộng nối hạn cũ", () => {
-    expect(computeGrant(plans, lic("pro_x2", -10), "pro_x2", "VND", T0)).toEqual({
-      plan: "pro_x2",
+  it("mua thêm cùng gói khi đã hết hạn: số ngày của gói từ hiện tại, cycle_anchor = hiện tại, không cộng nối hạn cũ", () => {
+    expect(computeGrant(plans, lic("monthly", -10), "monthly", "VND", T0)).toEqual({
+      plan: "monthly",
       expires_at: T0 + 30 * DAY,
       cycle_anchor: T0,
       kind: "extend",
       converted_days: 0,
     });
-  });
-
-  it("mua thêm cùng gói khi đã hết hạn: 30 ngày từ hiện tại, cycle_anchor = hiện tại", () => {
-    expect(computeGrant(plans, lic("pro_x5", -3), "pro_x5", "VND", T0)).toMatchObject({
-      expires_at: T0 + 30 * DAY,
+    expect(computeGrant(plans, lic("yearly", -3), "yearly", "VND", T0)).toMatchObject({
+      expires_at: T0 + 365 * DAY,
       cycle_anchor: T0,
       kind: "extend",
     });
   });
 
-  it("ví dụ lên gói của spec: Professional còn 20 ngày, mua X2 thì quy đổi 6 ngày, chạy 36 ngày", () => {
-    expect(computeGrant(plans, lic("pro", 20), "pro_x2", "VND", T0)).toEqual({
-      plan: "pro_x2",
-      expires_at: T0 + 36 * DAY,
+  it("ví dụ lên gói của spec: Monthly còn 20 ngày, mua Yearly thì quy đổi 24 ngày, chạy 389 ngày", () => {
+    // 20 × (50.000 / 30) / (500.000 / 365) = 24,33… → 24.
+    expect(computeGrant(plans, lic("monthly", 20), "yearly", "VND", T0)).toEqual({
+      plan: "yearly",
+      expires_at: T0 + 389 * DAY,
       cycle_anchor: T0,
       kind: "change",
-      converted_days: 6,
+      converted_days: 24,
     });
   });
 
-  it("ví dụ xuống gói của spec: X2 còn 10 ngày, mua Professional thì quy đổi 30 ngày, chạy 60 ngày", () => {
-    expect(computeGrant(plans, lic("pro_x2", 10), "pro", "VND", T0)).toMatchObject({
-      expires_at: T0 + 60 * DAY,
+  it("ví dụ xuống gói của spec: Yearly còn 200 ngày, mua Monthly thì quy đổi 164 ngày, chạy 194 ngày", () => {
+    // 200 × (500.000 / 365) / (50.000 / 30) = 164,38… → 164.
+    expect(computeGrant(plans, lic("yearly", 200), "monthly", "VND", T0)).toEqual({
+      plan: "monthly",
+      expires_at: T0 + 194 * DAY,
       cycle_anchor: T0,
-      converted_days: 30,
+      kind: "change",
+      converted_days: 164,
     });
   });
 
   it("ngày còn lại giữ phần lẻ rồi mới làm tròn xuống", () => {
-    // X2 còn 10,5 ngày → 31,5 ngày Professional → 31.
-    expect(computeGrant(plans, lic("pro_x2", 10.5), "pro", "VND", T0).converted_days).toBe(31);
-    // X2 còn 0,4 ngày → 1,2 ngày Professional → 1.
-    expect(computeGrant(plans, lic("pro_x2", 0.4), "pro", "VND", T0).converted_days).toBe(1);
-    // Professional còn 1 giây trước 3 ngày: 2,99… × 50.000 / 150.000 < 1 → 0.
-    expect(computeGrant(plans, { ...lic("pro", 3), expires_at: T0 + 3 * DAY - 1 }, "pro_x2", "VND", T0).converted_days).toBe(0);
-    // Đúng 3 ngày → đúng 1 ngày X2, không bị sai số dấu phẩy động.
-    expect(computeGrant(plans, lic("pro", 3), "pro_x2", "VND", T0).converted_days).toBe(1);
+    // Yearly còn 10,5 ngày → 10,5 × 30 × 500.000 / (365 × 50.000) = 8,63… → 8.
+    expect(computeGrant(plans, lic("yearly", 10.5), "monthly", "VND", T0).converted_days).toBe(8);
+    // Monthly còn 0,9 ngày → 0,9 × 365 × 50.000 / (30 × 500.000) = 1,095 → 1.
+    expect(computeGrant(plans, lic("monthly", 0.9), "yearly", "VND", T0).converted_days).toBe(1);
   });
 
-  it("phép tính số nguyên chính xác: X5 (500.000 đ) còn 195 ngày đổi sang gói 3.000 đ ra đúng 32.500 ngày", () => {
-    // 195 × 500.000 / 3.000 = 32.500 đúng. Tính bằng số thực (195 × (500.000 / 3.000)) ra 32.499,99… và làm tròn xuống thành 32.499.
-    const cheap = structuredClone(plans);
-    cheap.pro.prices.VND = 3000;
-    expect(computeGrant(cheap, lic("pro_x5", 195), "pro", "VND", T0)).toMatchObject({
-      converted_days: 32500,
-      expires_at: T0 + (30 + 32500) * DAY,
-    });
-  });
-
-  it("lên X5 và xuống từ X5", () => {
-    expect(computeGrant(plans, lic("pro_x2", 25), "pro_x5", "VND", T0)).toMatchObject({ converted_days: 7, expires_at: T0 + 37 * DAY });
-    expect(computeGrant(plans, lic("pro_x5", 2), "pro", "VND", T0)).toMatchObject({ converted_days: 20, expires_at: T0 + 50 * DAY });
+  it("phép tính số nguyên chính xác ở biên: kết quả đúng số nguyên không bị hụt, thiếu 1 giây thì làm tròn xuống", () => {
+    // Monthly còn đúng 60 ngày → 60 × 365 × 50.000 / (30 × 500.000) = 73 đúng.
+    expect(computeGrant(plans, lic("monthly", 60), "yearly", "VND", T0).converted_days).toBe(73);
+    expect(computeGrant(plans, { ...lic("monthly", 60), expires_at: T0 + 60 * DAY - 1 }, "yearly", "VND", T0).converted_days).toBe(72);
+    // Yearly còn đúng 365 ngày → 365 × 30 × 500.000 / (365 × 50.000) = 300 đúng. Tính bằng số thực
+    // (365 × (500.000 / 365) / (50.000 / 30)) có thể ra 299,99… và làm tròn xuống thành 299.
+    expect(computeGrant(plans, lic("yearly", 365), "monthly", "VND", T0).converted_days).toBe(300);
+    expect(computeGrant(plans, { ...lic("yearly", 365), expires_at: T0 + 365 * DAY - 1 }, "monthly", "VND", T0).converted_days).toBe(299);
   });
 
   it("license đã hết hạn mua gói khác: như license mới, không quy đổi", () => {
-    expect(computeGrant(plans, lic("pro", -1), "pro_x2", "VND", T0)).toEqual({
-      plan: "pro_x2",
-      expires_at: T0 + 30 * DAY,
+    expect(computeGrant(plans, lic("monthly", -1), "yearly", "VND", T0)).toEqual({
+      plan: "yearly",
+      expires_at: T0 + 365 * DAY,
       cycle_anchor: T0,
       kind: "change",
       converted_days: 0,
     });
     // Hết hạn đúng lúc này cũng là hết hạn.
-    expect(computeGrant(plans, lic("pro", 0), "pro_x2", "VND", T0).converted_days).toBe(0);
+    expect(computeGrant(plans, lic("monthly", 0), "yearly", "VND", T0).converted_days).toBe(0);
     // Đã hết hạn 10 ngày: không quy đổi số âm, hạn mới tính từ hiện tại.
-    expect(computeGrant(plans, lic("pro_x5", -10), "pro", "VND", T0)).toEqual({
-      plan: "pro",
+    expect(computeGrant(plans, lic("yearly", -10), "monthly", "VND", T0)).toEqual({
+      plan: "monthly",
       expires_at: T0 + 30 * DAY,
       cycle_anchor: T0,
       kind: "change",
@@ -166,11 +172,19 @@ describe("luật mua thêm và đổi gói (§6.8)", () => {
 
   it("giá lấy theo bảng hiện hành", () => {
     const cheaper = structuredClone(plans);
-    cheaper.pro_x2.prices.VND = 100000;
-    expect(computeGrant(cheaper, lic("pro", 20), "pro_x2", "VND", T0).converted_days).toBe(10);
+    cheaper.yearly.prices.VND = 365000;
+    // 20 × 365 × 50.000 / (30 × 365.000) = 33,33… → 33.
+    expect(computeGrant(cheaper, lic("monthly", 20), "yearly", "VND", T0).converted_days).toBe(33);
+  });
+
+  it("số ngày mỗi đơn lấy theo bảng hiện hành", () => {
+    const shorter = structuredClone(plans);
+    shorter.monthly.days_per_order = 15;
+    // Monthly 50.000 đ cho 15 ngày: 20 × 365 × 50.000 / (15 × 500.000) = 48,67 → 48.
+    expect(computeGrant(shorter, lic("monthly", 20), "yearly", "VND", T0).converted_days).toBe(48);
   });
 
   it("thiếu giá theo loại tiền của đơn thì báo lỗi", () => {
-    expect(() => computeGrant(plans, lic("pro", 20), "pro_x2", "USD", T0)).toThrow(/USD/);
+    expect(() => computeGrant(plans, lic("monthly", 20), "yearly", "USD", T0)).toThrow(/USD/);
   });
 });
PATCH
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
pnpm exec vitest run test/plans.test.ts
pnpm test:scripts
```

Kết quả mong đợi: Vitest: `FAIL test/plans.test.ts`, `TypeError: Cannot set properties of undefined (setting 'quota_minutes_per_cycle')` (bảng cũ không có gói `monthly`). Node: `ℹ pass 11`, `ℹ fail 1`, test đỏ là `Worker API bán đúng bảng gói chính thức (spec 2026-10-07 §2.1), không có giá thử`.

- [ ] **Step 3: Viết code**

```bash
git apply <<'PATCH'
diff --git a/server/src/plans.ts b/server/src/plans.ts
index 657a2a1..83a4e0b 100644
--- a/server/src/plans.ts
+++ b/server/src/plans.ts
@@ -77,10 +77,12 @@ export interface GrantTerms extends LicenseTerms {
  * Luật "Mua thêm và đổi gói" (§6.8), tính tại `now`: thời điểm thanh toán (QĐ33), không làm tròn về đầu ngày.
  * - license mới: hạn = now + số ngày; cycle_anchor = now;
  * - cùng gói: hạn cộng số ngày từ max(now, hạn cũ); cycle_anchor giữ nguyên, license đã hết hạn thì = now;
- * - đổi gói khi còn hạn: ngày_quy_đổi = floor(ngày_còn_lại × giá_cũ / giá_mới), ngày_còn_lại giữ cả phần lẻ;
- *   hạn = now + số ngày + ngày_quy_đổi; cycle_anchor = now;
+ * - đổi gói khi còn hạn: quy theo giá mỗi ngày (spec 2026-10-07 §2.3), vì hai gói có số ngày mỗi đơn khác nhau:
+ *   ngày_quy_đổi = floor(ngày_còn_lại × (giá_cũ / số_ngày_cũ) / (giá_mới / số_ngày_mới)), ngày_còn_lại giữ cả phần lẻ;
+ *   hạn = now + số ngày của gói mới + ngày_quy_đổi; cycle_anchor = now;
  * - license đã hết hạn mua gói khác: như license mới, giữ key.
- * Giá lấy theo bảng hiện hành, cùng loại tiền với đơn. Tính bằng BigInt để phép chia làm tròn xuống đúng tuyệt đối.
+ * Giá và số ngày lấy theo bảng hiện hành, giá cùng loại tiền với đơn. Tính bằng BigInt trên giây để phép chia làm tròn
+ * xuống đúng tuyệt đối.
  */
 export function computeGrant(
   plans: PlanTable,
@@ -109,7 +111,11 @@ export function computeGrant(
     const newPrice = plans[plan].prices[currency];
     if (oldPrice === undefined || newPrice === undefined) throw new Error(`thiếu giá ${currency} để đổi gói`);
     const remaining = BigInt(current.expires_at - now);
-    converted = Number((remaining * BigInt(oldPrice)) / (BigInt(newPrice) * BigInt(DAY_SECONDS)));
+    const oldDays = BigInt(plans[current.plan].days_per_order);
+    const newDays = BigInt(plans[plan].days_per_order);
+    converted = Number(
+      (remaining * BigInt(oldPrice) * newDays) / (BigInt(newPrice) * oldDays * BigInt(DAY_SECONDS)),
+    );
   }
   return {
     plan,
diff --git a/server/wrangler.jsonc b/server/wrangler.jsonc
index 66117de..93b6731 100644
--- a/server/wrangler.jsonc
+++ b/server/wrangler.jsonc
@@ -22,13 +22,12 @@
     // Tên miền gửi mail.aitranslator.io.vn đã xác thực ở Resend (SPF, DKIM); khách trả lời thư thì về EMAIL_REPLY_TO.
     "EMAIL_FROM": "AI Translator <no-reply@mail.aitranslator.io.vn>",
     "EMAIL_REPLY_TO": "support@aitranslator.io.vn",
-    // Giá chính thức (spec §2, chốt 2026-10-01).
+    // Giá chính thức (spec 2026-10-07 §2.1; thay bốn gói chốt 2026-10-01).
     // Không hạ hạn mức của một gói đang bán (spec §6.8, QĐ17): token lấy hạn mức từ bảng hiện hành, nên hạ ở đây là
     // hạ luôn hạn mức của khách đã trả tiền. Muốn bán hạn mức thấp hơn thì thêm gói mới (sửa src/plans.ts và app).
     "PLANS": {
-      "pro": { "quota_minutes_per_cycle": 1800, "days_per_order": 30, "prices": { "VND": 50000 } },
-      "pro_x2": { "quota_minutes_per_cycle": 6000, "days_per_order": 30, "prices": { "VND": 150000 } },
-      "pro_x5": { "quota_minutes_per_cycle": null, "days_per_order": 30, "prices": { "VND": 500000 } }
+      "monthly": { "quota_minutes_per_cycle": 3000, "days_per_order": 30, "prices": { "VND": 50000 } },
+      "yearly": { "quota_minutes_per_cycle": null, "days_per_order": 365, "prices": { "VND": 500000 } }
     },
     // Ô khóa đang ký token: secret TOKEN_SIGNING_KEY_A hay _B (QĐ29). Ô kia là khóa dự phòng.
     // Đổi khóa: đặt sang ô kia rồi deploy (Phụ lục A); giá trị khóa không đi qua máy người vận hành.
PATCH
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
pnpm exec vitest run test/plans.test.ts
pnpm test:scripts
```

Kết quả mong đợi: `Tests  25 passed (25)`; Node `ℹ pass 12`, `ℹ fail 0` (1 test bỏ qua như trước). Bộ Vitest đầy đủ vẫn đỏ ở các test chạm D1 (CHECK mã gói cũ) cho tới Task 3.

- [ ] **Step 5: Kiểm khớp cây tham chiếu rồi commit**

```bash
git add -A server
git diff --cached --stat 9014358 -- server   # phải không in gì
git commit -m "feat(server): bảng gói Monthly/Yearly, đổi gói quy theo giá mỗi ngày

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 3: Migration 0002: đổi mã gói, dựng lại bảng, bảng trials; test cũ theo Monthly/Yearly

**Commit tham chiếu:** `7992242` (nhánh `ref-bg01`).

**Files:**
- Create: `server/migrations/0002_three_plans_trials.sql`
- Modify: `server/src/admin.ts`
- Modify: `server/test/admin.test.ts`
- Modify: `server/test/checkout.test.ts`
- Modify: `server/test/db.ts`
- Modify: `server/test/email.test.ts`
- Modify: `server/test/env.d.ts`
- Modify: `server/test/licenses.test.ts`
- Create: `server/test/migrations.test.ts`
- Modify: `server/test/orders.test.ts`
- Modify: `server/test/reconcile.test.ts`
- Modify: `server/test/recover.test.ts`
- Modify: `server/test/schema.test.ts`
- Modify: `server/test/security.test.ts`
- Modify: `server/test/world.ts`
- Modify: `server/vitest.config.ts`

Migration `0002_three_plans_trials.sql` (xem "Điều chỉnh" mục 1): dựng lại `licenses`, `orders`, `activations`, `deactivations` với `CHECK (plan IN ('monthly', 'yearly'))`, đổi `pro`, `pro_x2` → `monthly`, `pro_x5` → `yearly`, giữ mọi cột, index và bộ đếm `AUTOINCREMENT`; thêm bảng `trials`. Admin chỉ sửa chú thích (mọi đường cấp đã đi qua `computeGrant`, nên số ngày lấy theo `days_per_order`).

Test mới `test/migrations.test.ts` chạy `0001` trên một D1 trống riêng (`MIGRATION_DB`, khai báo trong `vitest.config.ts` và `test/env.d.ts`), ghi dữ liệu theo ba mã cũ (có đơn đã xóa để bộ đếm lớn hơn số đơn lớn nhất), rồi chạy `0002` và kiểm: mã mới, dữ liệu giữ nguyên, số đơn kế tiếp 1.000.005, id `deactivations` kế tiếp 2, khóa ngoại trỏ về `licenses`/`activations`, `PRAGMA foreign_key_check` rỗng, đủ index, không còn bảng `*_new`.

Các test cũ đổi theo mã gói mới. Những test đổi gói dùng số mới (đã tính bằng công thức Task 2):
- lên gói Monthly còn 20 ngày → Yearly: 24 ngày, hết hạn `T0 + 399 ngày`;
- xuống gói Yearly còn 200 ngày (mua lúc `T0 + 165 ngày`) → Monthly: 164 ngày, hết hạn `T0 + 359 ngày`;
- webhook muộn 24 giờ: còn 20 ngày trừ 60 giây → 24 ngày;
- hai đơn cùng license: A = Yearly, B = Monthly (B áp trước: gia hạn tới `T0 + 60 ngày`, rồi A: 50 ngày → 60 ngày quy đổi, Yearly 425 ngày; A áp trước rồi B: Yearly 389 ngày → Monthly 319 ngày quy đổi, 349 ngày);
- đơn áp không theo thứ tự: A = Monthly (trả `t1`), B = Yearly (trả `t2 = t1 + 300`), B tới trước;
- admin cấp tay đổi gói lúc còn 18 ngày Monthly: 21 ngày, hết hạn `T0 + 398 ngày`; cấp license Yearly tặng: 365 ngày; `grant_new_license` cho đơn Yearly lúc `T0 + 1 ngày`: hết hạn `T0 + 366 ngày`.

- [ ] **Step 1: Viết test (red)**

```bash
git apply <<'PATCH'
diff --git a/server/test/admin.test.ts b/server/test/admin.test.ts
index 2cf273b..d5c2ca9 100644
--- a/server/test/admin.test.ts
+++ b/server/test/admin.test.ts
@@ -234,7 +234,7 @@ describe("tra cứu, gửi lại key", () => {
 
   it("xem trạng thái đơn trực tiếp từ cổng thanh toán của đơn, có ghi nhật ký", async () => {
     const { w, adminCall } = makeAdmin();
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "b@example.com", consent: true });
+    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true });
     const res = await adminCall(`/admin/orders/${co.body.order_code as number}/payment-status`);
     expect(res.body).toEqual({ orderCode: 1, status: "pending", amount: 50000, amountPaid: 0, paidAt: null });
     expect(await lastAudit()).toMatchObject({ action: "payment_status_viewed", order_code: 1 });
@@ -243,7 +243,7 @@ describe("tra cứu, gửi lại key", () => {
 
   it("xem trạng thái đơn có tác dụng phụ (nhật ký, gọi PayOS): Sec-Fetch-Site khác cùng origin thì 403", async () => {
     const { w, adminCall } = makeAdmin();
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "b@example.com", consent: true });
+    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true });
     const path = `/admin/orders/${co.body.order_code as number}/payment-status`;
     const asked = () => w.payos.requests.filter((r) => r.method === "GET").length;
     for (const site of ["cross-site", "same-site"]) {
@@ -299,13 +299,13 @@ describe("thay đổi license", () => {
 
   it("chuyển thiếu rồi chuyển bù: cấp tay cho đơn, gửi email, đơn thành paid", async () => {
     const { w, adminCall } = makeAdmin();
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "b@example.com", consent: true });
+    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true });
     const orderCode = co.body.order_code as number;
     w.payos.pay(orderCode, 1500);
     await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 1500));
     const res = await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "khách chuyển bù 48.500đ, mã GD FT2" } });
     expect(res.status).toBe(200);
-    expect(res.body).toMatchObject({ plan: "pro", expires_at: T0 + 30 * DAY, grant_kind: "new" });
+    expect(res.body).toMatchObject({ plan: "monthly", expires_at: T0 + 30 * DAY, grant_kind: "new" });
     const order = await env.DB.prepare("SELECT status, amount_paid FROM orders").first();
     expect(order).toEqual({ status: "paid", amount_paid: 1500 });
     expect(w.resend.sent).toHaveLength(1);
@@ -318,48 +318,49 @@ describe("thay đổi license", () => {
 
   it("cấp tay đơn gia hạn đổi gói: cùng luật với webhook, tính từ lúc thao tác", async () => {
     const { w, adminCall } = makeAdmin();
-    const { licenseKey } = await w.buy(); // Professional, hết hạn T0 + 30 ngày
+    const { licenseKey } = await w.buy(); // Monthly, hết hạn T0 + 30 ngày
     w.clock.now = T0 + 10 * DAY;
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro_x2", email: "b@example.com", consent: true, license_key: licenseKey });
+    const co = await w.call("POST", "/v1/checkout", { plan: "yearly", email: "b@example.com", consent: true, license_key: licenseKey });
     const orderCode = co.body.order_code as number;
-    w.payos.pay(orderCode, 100000);
-    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 100000));
+    w.payos.pay(orderCode, 450000);
+    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 450000));
     w.clock.now = T0 + 12 * DAY; // hai ngày sau khách mới chuyển bù, người vận hành cấp tay
     const res = await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "khách chuyển bù 50.000đ, mã GD FT2" } });
-    // Lúc thao tác còn 18 ngày Professional: floor(18 × 50.000 / 150.000) = 6.
-    expect(res.body).toMatchObject({ plan: "pro_x2", grant_kind: "change", converted_days: 6, expires_at: T0 + 48 * DAY });
-    expect(await licenseRow()).toMatchObject({ plan: "pro_x2", cycle_anchor: T0 + 12 * DAY, anchor_applied_at: T0 + 12 * DAY });
+    // Lúc thao tác còn 18 ngày Monthly: floor(18 × 365 × 50.000 / (30 × 500.000)) = floor(21,9) = 21.
+    expect(res.body).toMatchObject({ plan: "yearly", grant_kind: "change", converted_days: 21, expires_at: T0 + 398 * DAY });
+    expect(await licenseRow()).toMatchObject({ plan: "yearly", cycle_anchor: T0 + 12 * DAY, anchor_applied_at: T0 + 12 * DAY });
     const granted = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'license_plan_changed'").first<{ detail: string }>();
-    expect(JSON.parse(granted!.detail)).toMatchObject({ paid_at: T0 + 12 * DAY, converted_days: 6 });
+    expect(JSON.parse(granted!.detail)).toMatchObject({ paid_at: T0 + 12 * DAY, converted_days: 21 });
   });
 
   it("cấp tay khi không lấy được bảng gói từ Worker API thì 503, không đổi gì", async () => {
     const { w, adminCall } = makeAdmin({}, { plans: async () => null });
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "b@example.com", consent: true });
+    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true });
     const orderCode = co.body.order_code as number;
     const res = await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "x" } });
     expect(res).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
     expect(await env.DB.prepare("SELECT status FROM orders").first()).toEqual({ status: "pending" });
-    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "pro", note: "tặng" } });
+    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "monthly", note: "tặng" } });
     expect(created.status).toBe(503);
   });
 
   it("cấp license mới theo mã gói, rồi gia hạn tay", async () => {
     const { w, adminCall } = makeAdmin();
-    for (const plan of ["pro_1m", "free", "pro_12m"]) {
+    for (const plan of ["pro_1m", "free", "pro_12m", "pro", "pro_x5"]) {
       expect((await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan, note: "tặng" } })).status).toBe(400);
     }
-    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "pro_x5", note: "tặng" } });
+    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "yearly", note: "tặng" } });
     expect(created.status).toBe(201);
-    expect(created.body).toMatchObject({ plan: "pro_x5", expires_at: T0 + 30 * DAY });
-    expect(await licenseRow()).toMatchObject({ plan: "pro_x5", cycle_anchor: T0, anchor_applied_at: T0 });
+    // Số ngày theo gói (days_per_order), không cố định 30 ngày.
+    expect(created.body).toMatchObject({ plan: "yearly", expires_at: T0 + 365 * DAY });
+    expect(await licenseRow()).toMatchObject({ plan: "yearly", cycle_anchor: T0, anchor_applied_at: T0 });
     expect(w.resend.sent[0]!.to).toEqual(["gift@example.com"]);
-    expect(w.resend.sent[0]!.text).toContain("Professional X5, hết hạn");
+    expect(w.resend.sent[0]!.text).toContain("Yearly, hết hạn");
     const id = created.body.license_id as string;
     w.clock.now = T0 + DAY;
     const ext = await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 7, note: "bù sự cố" } });
     // Còn hạn: cộng vào hạn cũ, giữ cycle_anchor.
-    expect(ext.body).toEqual({ license_id: id, expires_at: T0 + 37 * DAY, cycle_anchor: T0 });
+    expect(ext.body).toEqual({ license_id: id, expires_at: T0 + 372 * DAY, cycle_anchor: T0 });
     expect((await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 0, note: "x" } })).status).toBe(400);
   });
 
@@ -480,8 +481,8 @@ describe("Q9: xóa dữ liệu cá nhân theo email", () => {
     expect(res.body).toEqual({ activations: 1, licenses: 1, orders: 1 });
     const orders = await env.DB.prepare("SELECT email, amount, plan, status FROM orders ORDER BY order_code").all();
     expect(orders.results).toEqual([
-      { email: null, amount: 50000, plan: "pro", status: "paid" },
-      { email: "keep@example.com", amount: 50000, plan: "pro", status: "paid" },
+      { email: null, amount: 50000, plan: "monthly", status: "paid" },
+      { email: "keep@example.com", amount: 50000, plan: "monthly", status: "paid" },
     ]);
     const act = await env.DB.prepare("SELECT device_label FROM activations").first();
     expect(act).toEqual({ device_label: null });
@@ -534,7 +535,7 @@ describe("đơn paid_needs_review: license đã thu hồi mà nhận được ti
     const ctx = makeAdmin();
     const { w } = ctx;
     const { licenseKey } = await w.buy({ email: "b@example.com" });
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro_x2", email: "b@example.com", consent: true, license_key: licenseKey });
+    const co = await w.call("POST", "/v1/checkout", { plan: "yearly", email: "b@example.com", consent: true, license_key: licenseKey });
     const orderCode = co.body.order_code as number;
     await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0).run();
     w.payos.pay(orderCode);
@@ -556,7 +557,7 @@ describe("đơn paid_needs_review: license đã thu hồi mà nhận được ti
   it("cấp tay một đơn gia hạn mà license đã thu hồi: đơn chuyển sang paid_needs_review, trả 409", async () => {
     const { w, adminCall } = makeAdmin();
     const { licenseKey } = await w.buy();
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "b@example.com", consent: true, license_key: licenseKey });
+    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true, license_key: licenseKey });
     const orderCode = co.body.order_code as number;
     w.payos.pay(orderCode, 1000);
     await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 1000));
@@ -579,11 +580,12 @@ describe("đơn paid_needs_review: license đã thu hồi mà nhận được ti
     expect((await adminCall(`/admin/orders/${orderCode}/resolve`, { body: { action: "grant_new_license" } })).status).toBe(400);
     expect((await adminCall(`/admin/orders/${orderCode}/resolve`, { body: { action: "x", note: "y" } })).status).toBe(400);
     const res = await adminCall(`/admin/orders/${orderCode}/resolve`, { body: { action: "grant_new_license", note: "khách đã xác minh" } });
-    expect(res).toMatchObject({ status: 200, body: { order_code: orderCode, status: "paid", plan: "pro_x2", expires_at: T0 + 31 * DAY } });
+    // Gói của đơn (Yearly), số ngày của gói tính từ lúc thao tác.
+    expect(res).toMatchObject({ status: 200, body: { order_code: orderCode, status: "paid", plan: "yearly", expires_at: T0 + 366 * DAY } });
     const lics = await env.DB.prepare("SELECT plan, revoked_at FROM licenses ORDER BY created_at").all();
     expect(lics.results).toEqual([
-      { plan: "pro", revoked_at: T0 },
-      { plan: "pro_x2", revoked_at: null },
+      { plan: "monthly", revoked_at: T0 },
+      { plan: "yearly", revoked_at: null },
     ]);
     expect(w.resend.sent).toHaveLength(1);
     expect(w.resend.sent[0]!.text).toContain(res.body.license_key as string);
@@ -795,7 +797,7 @@ describe("nhật ký cho thao tác thất bại có ý nghĩa (review cuối, N6
   it("cấp tay đơn gia hạn mà license đã thu hồi (409 needs_review): ghi order_grant_rejected", async () => {
     const { w, adminCall } = makeAdmin();
     const { licenseKey } = await w.buy();
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "b@example.com", consent: true, license_key: licenseKey });
+    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "b@example.com", consent: true, license_key: licenseKey });
     const orderCode = co.body.order_code as number;
     w.payos.pay(orderCode, 1000);
     await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 1000));
@@ -818,7 +820,7 @@ describe("nhật ký cho thao tác thất bại có ý nghĩa (review cuối, N6
   it("ba lần ghi hoàn tiền cùng lúc: một dòng order_refunded_outside, hai dòng order_resolve_rejected", async () => {
     const { w, adminCall } = makeAdmin();
     const { licenseKey } = await w.buy({ email: "b@example.com" });
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro_x2", email: "b@example.com", consent: true, license_key: licenseKey });
+    const co = await w.call("POST", "/v1/checkout", { plan: "yearly", email: "b@example.com", consent: true, license_key: licenseKey });
     const orderCode = co.body.order_code as number;
     await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0).run();
     w.payos.pay(orderCode);
diff --git a/server/test/checkout.test.ts b/server/test/checkout.test.ts
index 435d206..e65e11e 100644
--- a/server/test/checkout.test.ts
+++ b/server/test/checkout.test.ts
@@ -6,23 +6,22 @@ import { DAY, makeWorld, T0 } from "./world";
 
 beforeEach(resetDb);
 
-const valid = { plan: "pro", email: " Buyer@Example.com ", consent: true };
+const valid = { plan: "monthly", email: " Buyer@Example.com ", consent: true };
 
 /** Đúng câu lệnh giữ chỗ số đơn ở Task 21, Step 4 (`wrangler d1 execute … --command`), QĐ18. */
 const reserveSql = (n: number) =>
-  `INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES (${n}, 'reserved', 'none', 'pro', 0, 'VND', 0, 'failed', 0, 0); DELETE FROM orders WHERE order_code = ${n};`;
+  `INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES (${n}, 'reserved', 'none', 'monthly', 0, 'VND', 0, 'failed', 0, 0); DELETE FROM orders WHERE order_code = ${n};`;
 
 describe("GET /v1/plans", () => {
-  it("trả ba gói trả phí với tên, hạn mức, số ngày mỗi đơn và giá; không có Free", async () => {
+  it("trả hai gói trả phí với tên, hạn mức, số ngày mỗi đơn và giá; không có Free", async () => {
     const res = await makeWorld().call("GET", "/v1/plans");
     expect(res).toEqual({
       status: 200,
       headers: expect.anything(),
       body: {
         plans: [
-          { code: "pro", name: "Professional", quota_minutes_per_cycle: 1800, days_per_order: 30, prices: { VND: 50000 } },
-          { code: "pro_x2", name: "Professional X2", quota_minutes_per_cycle: 6000, days_per_order: 30, prices: { VND: 150000 } },
-          { code: "pro_x5", name: "Professional X5", quota_minutes_per_cycle: null, days_per_order: 30, prices: { VND: 500000 } },
+          { code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } },
+          { code: "yearly", name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } },
         ],
       },
     });
@@ -66,7 +65,7 @@ describe("POST /v1/checkout", () => {
     expect(row).toMatchObject({
       provider: "payos",
       provider_ref: "plink1",
-      plan: "pro",
+      plan: "monthly",
       amount: 50000,
       currency: "VND",
       email: "buyer@example.com",
@@ -79,9 +78,8 @@ describe("POST /v1/checkout", () => {
   });
 
   it.each([
-    ["pro", 50000],
-    ["pro_x2", 150000],
-    ["pro_x5", 500000],
+    ["monthly", 50000],
+    ["yearly", 500000],
   ])("gói %s: giá %i đ lấy từ biến PLANS", async (plan, amount) => {
     const res = await makeWorld().call("POST", "/v1/checkout", { ...valid, plan });
     expect(res).toMatchObject({ status: 201, body: { plan, amount, currency: "VND" } });
@@ -90,9 +88,9 @@ describe("POST /v1/checkout", () => {
 
   it("đổi giá trong PLANS là đổi giá bán, không cần sửa code", async () => {
     const plans = structuredClone(env.PLANS) as Record<string, { prices: Record<string, number> }>;
-    plans.pro_x2!.prices.VND = 120000;
-    const res = await makeWorld({ PLANS: plans }).call("POST", "/v1/checkout", { ...valid, plan: "pro_x2" });
-    expect(res.body.amount).toBe(120000);
+    plans.yearly!.prices.VND = 450000;
+    const res = await makeWorld({ PLANS: plans }).call("POST", "/v1/checkout", { ...valid, plan: "yearly" });
+    expect(res.body.amount).toBe(450000);
   });
 
   it.each([
@@ -118,6 +116,9 @@ describe("POST /v1/checkout", () => {
     [{ ...valid, plan: "pro_forever" }, "plan"],
     [{ ...valid, plan: "free" }, "plan"],
     [{ ...valid, plan: "pro_1m" }, "plan"],
+    // Mã gói cũ (trước spec 2026-10-07) không còn bán.
+    [{ ...valid, plan: "pro" }, "plan"],
+    [{ ...valid, plan: "pro_x5" }, "plan"],
     [{ ...valid, license_key: "SAI-KEY" }, "license_key"],
   ])("input sai (%j) thì 400", async (body, field) => {
     const res = await makeWorld().call("POST", "/v1/checkout", body);
@@ -180,7 +181,7 @@ describe("POST /v1/checkout", () => {
         action: "order_created",
         license_id: null,
         order_code: res.body.order_code,
-        detail: JSON.stringify({ plan: "pro", amount: 50000, currency: "VND" }),
+        detail: JSON.stringify({ plan: "monthly", amount: 50000, currency: "VND" }),
       },
     ]);
   });
@@ -232,21 +233,21 @@ describe("POST /v1/checkout", () => {
   });
 
   it("gia hạn hay đổi gói: trả ước tính license_expires_at và số ngày quy đổi, tính lúc tạo đơn", async () => {
-    // License Professional còn 20 ngày (spec §6.8, ví dụ lên gói).
+    // License Monthly còn 20 ngày (spec 2026-10-07 §2.3, ví dụ lên gói).
     await env.DB.prepare(
       `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at)
-       VALUES ('L1', ?, 'a@example.com', 'pro', ?, ?3, ?3, ?3)`,
+       VALUES ('L1', ?, 'a@example.com', 'monthly', ?, ?3, ?3, ?3)`,
     )
       .bind(vectors.license_keys[0]!.normalized, T0 + 20 * DAY, T0 - 10 * DAY)
       .run();
     const w = makeWorld();
     const key = vectors.license_keys[0]!.input;
-    const up = await w.call("POST", "/v1/checkout", { ...valid, plan: "pro_x2", license_key: key });
-    expect(up).toMatchObject({ status: 201, body: { plan: "pro_x2", amount: 150000, license_expires_at: T0 + 36 * DAY, converted_days: 6 } });
-    const same = await w.call("POST", "/v1/checkout", { ...valid, plan: "pro", license_key: key });
+    const up = await w.call("POST", "/v1/checkout", { ...valid, plan: "yearly", license_key: key });
+    expect(up).toMatchObject({ status: 201, body: { plan: "yearly", amount: 500000, license_expires_at: T0 + 389 * DAY, converted_days: 24 } });
+    const same = await w.call("POST", "/v1/checkout", { ...valid, plan: "monthly", license_key: key });
     expect(same.body).toMatchObject({ license_expires_at: T0 + 50 * DAY, converted_days: 0 });
     // Ước tính không đổi license.
-    expect(await env.DB.prepare("SELECT plan, expires_at FROM licenses").first()).toEqual({ plan: "pro", expires_at: T0 + 20 * DAY });
+    expect(await env.DB.prepare("SELECT plan, expires_at FROM licenses").first()).toEqual({ plan: "monthly", expires_at: T0 + 20 * DAY });
     const row = await env.DB.prepare("SELECT renew_license_id FROM orders WHERE order_code = ?").bind(up.body.order_code).first();
     expect(row).toEqual({ renew_license_id: "L1" });
   });
diff --git a/server/test/db.ts b/server/test/db.ts
index ad4b423..42e5cbb 100644
--- a/server/test/db.ts
+++ b/server/test/db.ts
@@ -13,7 +13,7 @@ export async function withFailingInsert<T>(table: string, when: string, run: ()
 /** Storage chỉ tách theo từng file test, nên mỗi test tự xóa dữ liệu (kể cả bộ đếm AUTOINCREMENT). */
 export async function resetDb(): Promise<void> {
   await env.DB.batch(
-    ["audit_log", "deactivations", "activations", "orders", "licenses", "rate_limits", "ops_alerts", "sqlite_sequence"].map((t) =>
+    ["audit_log", "deactivations", "activations", "orders", "licenses", "rate_limits", "ops_alerts", "trials", "sqlite_sequence"].map((t) =>
       env.DB.prepare(`DELETE FROM ${t}`),
     ),
   );
diff --git a/server/test/email.test.ts b/server/test/email.test.ts
index daf460a..52f38db 100644
--- a/server/test/email.test.ts
+++ b/server/test/email.test.ts
@@ -79,17 +79,17 @@ describe("nội dung email", () => {
   it("có tên sản phẩm, key đã định dạng, gói, ngày hết hạn theo giờ Việt Nam, cả vi lẫn en", () => {
     // 2026-10-31T17:30:00Z là 01/11/2026 ở Việt Nam.
     const { subject, text } = licenseEmail("purchase", [
-      { licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", planName: "Professional X2", expiresAt: Date.UTC(2026, 9, 31, 17, 30) / 1000 },
+      { licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", planName: "Yearly", expiresAt: Date.UTC(2026, 9, 31, 17, 30) / 1000 },
     ]);
     expect(subject).toBe("License key AI Translator / Your AI Translator license key");
     expect(text).toContain("Cảm ơn bạn đã dùng AI Translator.");
-    expect(text).toContain("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTR  (Professional X2, hết hạn / expires 01/11/2026)");
+    expect(text).toContain("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTR  (Yearly, hết hạn / expires 01/11/2026)");
     expect(text).toContain("Cài đặt > Bản quyền");
     expect(text).toContain("Settings > License");
   });
 
   it("thư đổi gói có tiêu đề riêng; không còn tên tạm", () => {
-    const entry = { licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", planName: "Professional", expiresAt: 0 };
+    const entry = { licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", planName: "Monthly", expiresAt: 0 };
     expect(licenseEmail("plan_change", [entry]).subject).toBe("Đã đổi gói AI Translator / AI Translator plan changed");
     for (const kind of ["purchase", "renewal", "plan_change", "recover", "resend"] as const) {
       const { subject, text } = licenseEmail(kind, [entry]);
diff --git a/server/test/env.d.ts b/server/test/env.d.ts
index b824a7d..4125bdb 100644
--- a/server/test/env.d.ts
+++ b/server/test/env.d.ts
@@ -7,5 +7,6 @@ declare namespace Cloudflare {
   }
   interface Env extends TestApiEnv {
     TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
+    MIGRATION_DB: D1Database;
   }
 }
diff --git a/server/test/licenses.test.ts b/server/test/licenses.test.ts
index d98b328..7d49428 100644
--- a/server/test/licenses.test.ts
+++ b/server/test/licenses.test.ts
@@ -12,7 +12,7 @@ const device = async (n: number) => sha256Hex(`device-${n}`);
 /** Key đúng định dạng (ký tự kiểm tra đúng) nhưng không có trong D1. */
 const UNKNOWN_KEY = "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5";
 
-async function setup(plan = "pro") {
+async function setup(plan = "monthly") {
   const w = makeWorld();
   const { licenseKey } = await w.buy({ plan });
   const activate = async (n: number, ip = `198.51.100.${n}`) =>
@@ -37,10 +37,10 @@ describe("activate", () => {
     const fields = {
       activation_id: res.body.activation_id,
       activation_created_at: T0 + 60,
-      plan: "pro",
+      plan: "monthly",
       expires_at: lic!.expires_at,
       cycle_anchor: T0,
-      quota_minutes_per_cycle: 1800,
+      quota_minutes_per_cycle: 3000,
       quota_epoch: 0,
       quota_fresh: true,
       refresh_before: T0 + 60 + 14 * DAY,
@@ -57,8 +57,8 @@ describe("activate", () => {
   });
 
   it.each([
-    ["pro_x2", 6000],
-    ["pro_x5", null],
+    ["monthly", 3000],
+    ["yearly", null],
   ])("gói %s: token mang hạn mức %s theo bảng gói", async (plan, quota) => {
     const { activate } = await setup(plan);
     expect((await activate(1)).body).toMatchObject({ plan, quota_minutes_per_cycle: quota });
@@ -318,7 +318,7 @@ describe("quota_fresh (QĐ35)", () => {
     const { w, activate, licenseKey } = await setup();
     const a = await activate(1);
     w.clock.now = T0 + 35 * DAY; // hết hạn từ T0 + 30 ngày
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "buyer@example.com", consent: true, license_key: licenseKey });
+    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "buyer@example.com", consent: true, license_key: licenseKey });
     const orderCode = co.body.order_code as number;
     w.payos.pay(orderCode);
     const body = await w.payos.webhookBody(orderCode);
@@ -327,7 +327,7 @@ describe("quota_fresh (QĐ35)", () => {
     w.clock.now = T0 + 35 * DAY + 3600 + 14 * 60;
     // Mua lại sau khi hết hạn đặt lại cycle_anchor (lúc trả tiền), nên mốc của cửa sổ là lúc server xử lý đơn.
     expect((await validate(w, licenseKey, a.body.activation_id)).body).toMatchObject({
-      plan: "pro",
+      plan: "monthly",
       cycle_anchor: T0 + 35 * DAY,
       quota_fresh: true,
     });
@@ -351,10 +351,10 @@ describe("quota_fresh (QĐ35)", () => {
     const a = await activate(1);
     w.clock.now = T0 + 10 * DAY;
     expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(false);
-    await w.buy({ licenseKey, plan: "pro_x2" });
+    await w.buy({ licenseKey, plan: "yearly" });
     w.clock.now = T0 + 10 * DAY + 14 * 60;
     const v = await validate(w, licenseKey, a.body.activation_id);
-    expect(v.body).toMatchObject({ plan: "pro_x2", cycle_anchor: T0 + 10 * DAY, quota_minutes_per_cycle: 6000, quota_fresh: true });
+    expect(v.body).toMatchObject({ plan: "yearly", cycle_anchor: T0 + 10 * DAY, quota_minutes_per_cycle: null, quota_fresh: true });
     w.clock.now = T0 + 10 * DAY + 16 * 60;
     expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(false);
   });
@@ -427,7 +427,7 @@ describe("quota_fresh (QĐ35)", () => {
     const { w, activate, licenseKey } = await setup();
     const a = await activate(1);
     w.clock.now = T0 + 10 * DAY;
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro_x2", email: "buyer@example.com", consent: true, license_key: licenseKey });
+    const co = await w.call("POST", "/v1/checkout", { plan: "yearly", email: "buyer@example.com", consent: true, license_key: licenseKey });
     const orderCode = co.body.order_code as number;
     w.payos.pay(orderCode);
     const body = await w.payos.webhookBody(orderCode);
@@ -436,7 +436,7 @@ describe("quota_fresh (QĐ35)", () => {
     w.clock.now = T0 + 10 * DAY + 3600 + 60;
     const v = await validate(w, licenseKey, a.body.activation_id);
     // cycle_anchor là lúc trả tiền (1 giờ trước), nhưng cửa sổ tính từ lúc xử lý webhook.
-    expect(v.body).toMatchObject({ plan: "pro_x2", cycle_anchor: T0 + 10 * DAY, quota_fresh: true });
+    expect(v.body).toMatchObject({ plan: "yearly", cycle_anchor: T0 + 10 * DAY, quota_fresh: true });
     w.clock.now = T0 + 10 * DAY + 3600 + 16 * 60;
     expect((await validate(w, licenseKey, a.body.activation_id)).body.quota_fresh).toBe(false);
   });
@@ -492,16 +492,16 @@ describe("validate", () => {
     expect(v.body.expires_at).toBe(T0 + 60 * DAY);
   });
 
-  it("đổi gói từ máy khác: máy này nhận gói, cycle_anchor và hạn mức mới ở lần validate kế tiếp", async () => {
+  it("đổi gói: máy đang kích hoạt nhận gói, cycle_anchor và hạn mức mới ở lần validate kế tiếp", async () => {
     const { w, activate, licenseKey } = await setup();
     const a = await activate(1);
     w.clock.now = T0 + 10 * DAY;
-    await w.buy({ licenseKey, plan: "pro_x5" });
+    await w.buy({ licenseKey, plan: "yearly" });
     const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
     expect(v.body).toMatchObject({
-      plan: "pro_x5",
+      plan: "yearly",
       cycle_anchor: T0 + 10 * DAY,
-      expires_at: T0 + 42 * DAY,
+      expires_at: T0 + 399 * DAY,
       quota_minutes_per_cycle: null,
     });
   });
diff --git a/server/test/migrations.test.ts b/server/test/migrations.test.ts
new file mode 100644
index 0000000..a9e1780
--- /dev/null
+++ b/server/test/migrations.test.ts
@@ -0,0 +1,93 @@
+import { applyD1Migrations } from "cloudflare:test";
+import { env } from "cloudflare:workers";
+import { expect, it } from "vitest";
+
+// Chạy 0001 trên D1 trống riêng (MIGRATION_DB), ghi dữ liệu theo mã gói cũ, rồi chạy 0002 (spec 2026-10-07 §5.1).
+const db = env.MIGRATION_DB;
+const names = env.TEST_MIGRATIONS.map((m) => m.name);
+
+it("có đúng hai migration theo thứ tự", () => {
+  expect(names).toEqual(["0001_init.sql", "0002_three_plans_trials.sql"]);
+});
+
+it("0002 đổi mã gói, giữ dữ liệu, khóa ngoại, index và bộ đếm số đơn", async () => {
+  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 1));
+  const lic = db.prepare(
+    `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, version, created_at)
+     VALUES (?, ?, 'a@example.com', ?, 100, 10, 10, 2, 1)`,
+  );
+  const order = db.prepare(
+    `INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, license_id, status, created_at, expires_at)
+     VALUES (?, 'h', 'payos', ?, ?, 'VND', 0, ?, 'paid', 0, 0)`,
+  );
+  await db.batch([
+    lic.bind("L1", "K1", "pro"),
+    lic.bind("L2", "K2", "pro_x2"),
+    lic.bind("L3", "K3", "pro_x5"),
+    db.prepare("INSERT INTO activations (id, license_id, device_id_hash, created_at, last_validated_at) VALUES ('A1', 'L3', 'd', 0, 0)"),
+    db.prepare("INSERT INTO deactivations (license_id, activation_id, at, by) VALUES ('L3', 'A1', 5, 'user')"),
+    order.bind(1_000_001, "pro", 50000, "L1"),
+    order.bind(1_000_002, "pro_x2", 150000, "L2"),
+    order.bind(1_000_003, "pro_x5", 500000, "L3"),
+    // Đơn lớn nhất đã bị xóa: bộ đếm (1.000.004) lớn hơn order_code lớn nhất còn lại.
+    order.bind(1_000_004, "pro", 50000, null),
+    db.prepare("DELETE FROM orders WHERE order_code = 1000004"),
+  ]);
+
+  await applyD1Migrations(db, env.TEST_MIGRATIONS);
+
+  expect((await db.prepare("SELECT id, plan, expires_at, cycle_anchor, version FROM licenses ORDER BY id").all()).results).toEqual([
+    { id: "L1", plan: "monthly", expires_at: 100, cycle_anchor: 10, version: 2 },
+    { id: "L2", plan: "monthly", expires_at: 100, cycle_anchor: 10, version: 2 },
+    { id: "L3", plan: "yearly", expires_at: 100, cycle_anchor: 10, version: 2 },
+  ]);
+  expect((await db.prepare("SELECT order_code, plan, amount, license_id FROM orders ORDER BY order_code").all()).results).toEqual([
+    { order_code: 1_000_001, plan: "monthly", amount: 50000, license_id: "L1" },
+    { order_code: 1_000_002, plan: "monthly", amount: 150000, license_id: "L2" },
+    { order_code: 1_000_003, plan: "yearly", amount: 500000, license_id: "L3" },
+  ]);
+  // Số đơn kế tiếp không lùi về 1.000.004 (đã dùng) hay 1.
+  const next = await db
+    .prepare(
+      `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at)
+       VALUES ('h', 'payos', 'monthly', 1, 'VND', 0, 'pending', 0, 0) RETURNING order_code`,
+    )
+    .first<{ order_code: number }>();
+  expect(next?.order_code).toBe(1_000_005);
+
+  expect(await db.prepare("SELECT id, license_id, device_id_hash FROM activations").all().then((r) => r.results)).toEqual([
+    { id: "A1", license_id: "L3", device_id_hash: "d" },
+  ]);
+  expect(await db.prepare("SELECT id, license_id, activation_id, at, by FROM deactivations").all().then((r) => r.results)).toEqual([
+    { id: 1, license_id: "L3", activation_id: "A1", at: 5, by: "user" },
+  ]);
+  const nextDeactivation = await db
+    .prepare("INSERT INTO deactivations (license_id, activation_id, at, by) VALUES ('L3', 'A1', 6, 'user') RETURNING id")
+    .first<{ id: number }>();
+  expect(nextDeactivation?.id).toBe(2);
+
+  // Khóa ngoại của activations, deactivations và orders vẫn trỏ về bảng licenses (không phải licenses_new hay bảng cũ).
+  const fks = async (table: string) =>
+    (await db.prepare(`SELECT "table" AS target FROM pragma_foreign_key_list('${table}')`).all<{ target: string }>()).results.map(
+      (r) => r.target,
+    );
+  expect(await fks("activations")).toEqual(["licenses"]);
+  expect((await fks("deactivations")).sort()).toEqual(["activations", "licenses"]);
+  expect(await fks("orders")).toEqual(["licenses", "licenses"]);
+  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
+
+  const indexes = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>())
+    .results.map((r) => r.name);
+  expect(indexes).toEqual([
+    "activations_device",
+    "activations_license",
+    "audit_license",
+    "audit_order",
+    "deactivations_license",
+    "licenses_email",
+    "orders_email",
+    "orders_pending",
+  ]);
+  const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_new'").all()).results;
+  expect(tables).toEqual([]);
+});
diff --git a/server/test/orders.test.ts b/server/test/orders.test.ts
index e9d811d..be414e7 100644
--- a/server/test/orders.test.ts
+++ b/server/test/orders.test.ts
@@ -14,7 +14,7 @@ beforeEach(resetDb);
 const UNKNOWN_KEY = "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5";
 
 async function checkout(w: ReturnType<typeof makeWorld>, extra: Record<string, unknown> = {}) {
-  const res = await w.call("POST", "/v1/checkout", { plan: "pro", email: "buyer@example.com", consent: true, ...extra });
+  const res = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "buyer@example.com", consent: true, ...extra });
   return { orderCode: res.body.order_code as number, token: res.body.order_token as string };
 }
 
@@ -34,7 +34,7 @@ describe("webhook PayOS", () => {
     expect(pending.body).toEqual({
       order_code: orderCode,
       status: "pending",
-      plan: "pro",
+      plan: "monthly",
       amount: 50000,
       currency: "VND",
       expires_at: T0 + 900,
@@ -51,7 +51,7 @@ describe("webhook PayOS", () => {
     expect(paid.body).toMatchObject({
       status: "paid",
       grant_kind: "new",
-      license_plan: "pro",
+      license_plan: "monthly",
       license_expires_at: T0 + 120 + 30 * DAY,
     });
     const key = paid.body.license_key as string;
@@ -63,7 +63,7 @@ describe("webhook PayOS", () => {
     const order = await env.DB.prepare("SELECT email_sent_at, amount_paid FROM orders").first();
     expect(order).toEqual({ email_sent_at: T0 + 120, amount_paid: 50000 });
     const lic = await env.DB.prepare("SELECT plan, expires_at, cycle_anchor, version, last_order_code FROM licenses").first();
-    expect(lic).toEqual({ plan: "pro", expires_at: T0 + 120 + 30 * DAY, cycle_anchor: T0 + 120, version: 0, last_order_code: orderCode });
+    expect(lic).toEqual({ plan: "monthly", expires_at: T0 + 120 + 30 * DAY, cycle_anchor: T0 + 120, version: 0, last_order_code: orderCode });
   });
 
   it("webhook gửi trùng cùng lúc: chỉ cấp một lần, một email", async () => {
@@ -228,7 +228,7 @@ describe("webhook PayOS", () => {
 });
 
 describe("checkout gia hạn", () => {
-  const valid = { plan: "pro", email: "buyer@example.com", consent: true };
+  const valid = { plan: "monthly", email: "buyer@example.com", consent: true };
 
   it("gia hạn: gắn đơn với license đang có", async () => {
     const w = makeWorld();
@@ -267,10 +267,10 @@ describe("mua thêm cùng gói (§6.8)", () => {
     const w = makeWorld();
     const { licenseKey } = await w.buy();
     w.clock.now = T0 + 20 * DAY;
-    const order = await renew(w, licenseKey, "pro");
-    expect(order).toMatchObject({ status: "paid", grant_kind: "extend", license_key: licenseKey, license_plan: "pro" });
+    const order = await renew(w, licenseKey, "monthly");
+    expect(order).toMatchObject({ status: "paid", grant_kind: "extend", license_key: licenseKey, license_plan: "monthly" });
     expect(order.license_expires_at).toBe(T0 + 60 * DAY);
-    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 60 * DAY, cycle_anchor: T0, version: 1 });
+    expect(await license()).toEqual({ plan: "monthly", expires_at: T0 + 60 * DAY, cycle_anchor: T0, version: 1 });
     expect(await licenseCount()).toBe(1);
     expect(w.resend.sent.at(-1)!.subject).toBe("Đã gia hạn AI Translator / AI Translator renewed");
   });
@@ -279,46 +279,46 @@ describe("mua thêm cùng gói (§6.8)", () => {
     const w = makeWorld();
     const { licenseKey } = await w.buy();
     w.clock.now = T0 + 35 * DAY;
-    await renew(w, licenseKey, "pro");
-    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 65 * DAY, cycle_anchor: T0 + 35 * DAY, version: 1 });
+    await renew(w, licenseKey, "monthly");
+    expect(await license()).toEqual({ plan: "monthly", expires_at: T0 + 65 * DAY, cycle_anchor: T0 + 35 * DAY, version: 1 });
   });
 });
 
 describe("đổi gói (§6.8)", () => {
-  it("lên gói: Professional còn 20 ngày mua X2, quy đổi 6 ngày, X2 chạy 36 ngày từ lúc trả tiền", async () => {
+  it("lên gói: Monthly còn 20 ngày mua Yearly, quy đổi 24 ngày, Yearly chạy 389 ngày từ lúc trả tiền", async () => {
     const w = makeWorld();
     const { licenseKey } = await w.buy();
     w.clock.now = T0 + 10 * DAY;
-    const order = await renew(w, licenseKey, "pro_x2");
-    expect(order).toMatchObject({ grant_kind: "change", license_plan: "pro_x2", license_expires_at: T0 + 46 * DAY });
-    expect(await license()).toEqual({ plan: "pro_x2", expires_at: T0 + 46 * DAY, cycle_anchor: T0 + 10 * DAY, version: 1 });
+    const order = await renew(w, licenseKey, "yearly");
+    expect(order).toMatchObject({ grant_kind: "change", license_plan: "yearly", license_expires_at: T0 + 399 * DAY });
+    expect(await license()).toEqual({ plan: "yearly", expires_at: T0 + 399 * DAY, cycle_anchor: T0 + 10 * DAY, version: 1 });
     expect(w.resend.sent.at(-1)!.subject).toBe("Đã đổi gói AI Translator / AI Translator plan changed");
-    expect(w.resend.sent.at(-1)!.text).toContain("Professional X2, hết hạn");
+    expect(w.resend.sent.at(-1)!.text).toContain("Yearly, hết hạn");
     const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'license_plan_changed'").first<{ detail: string }>();
     expect(JSON.parse(log!.detail)).toMatchObject({
-      plan: "pro_x2",
-      from_plan: "pro",
+      plan: "yearly",
+      from_plan: "monthly",
       from_expires_at: T0 + 30 * DAY,
-      converted_days: 6,
+      converted_days: 24,
       paid_at: T0 + 10 * DAY,
     });
   });
 
-  it("xuống gói: X2 còn 10 ngày mua Professional, quy đổi 30 ngày, chạy 60 ngày", async () => {
+  it("xuống gói: Yearly còn 200 ngày mua Monthly, quy đổi 164 ngày, chạy 194 ngày", async () => {
     const w = makeWorld();
-    const { licenseKey } = await w.buy({ plan: "pro_x2" });
-    w.clock.now = T0 + 20 * DAY;
-    await renew(w, licenseKey, "pro");
-    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 80 * DAY, cycle_anchor: T0 + 20 * DAY, version: 1 });
+    const { licenseKey } = await w.buy({ plan: "yearly" });
+    w.clock.now = T0 + 165 * DAY;
+    await renew(w, licenseKey, "monthly");
+    expect(await license()).toEqual({ plan: "monthly", expires_at: T0 + 359 * DAY, cycle_anchor: T0 + 165 * DAY, version: 1 });
   });
 
   it("license đã hết hạn mua gói khác: như license mới nhưng giữ key", async () => {
     const w = makeWorld();
-    const { licenseKey } = await w.buy({ plan: "pro_x5" });
-    w.clock.now = T0 + 40 * DAY;
-    const order = await renew(w, licenseKey, "pro");
+    const { licenseKey } = await w.buy({ plan: "yearly" });
+    w.clock.now = T0 + 370 * DAY;
+    const order = await renew(w, licenseKey, "monthly");
     expect(order).toMatchObject({ grant_kind: "change", license_key: licenseKey });
-    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 70 * DAY, cycle_anchor: T0 + 40 * DAY, version: 1 });
+    expect(await license()).toEqual({ plan: "monthly", expires_at: T0 + 400 * DAY, cycle_anchor: T0 + 370 * DAY, version: 1 });
     expect(await licenseCount()).toBe(1);
   });
 });
@@ -328,20 +328,20 @@ describe("thời điểm tính là lúc khách trả tiền (QĐ33)", () => {
     const w = makeWorld();
     const { licenseKey } = await w.buy();
     w.clock.now = T0 + 10 * DAY;
-    const { orderCode, token } = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
+    const { orderCode, token } = await checkout(w, { plan: "yearly", license_key: licenseKey });
     w.clock.now = T0 + 10 * DAY + 60;
     w.payos.pay(orderCode);
     const body = await w.payos.webhookBody(orderCode);
     w.clock.now = T0 + 11 * DAY;
     await w.call("POST", "/v1/webhooks/payos", body);
-    // Lúc trả tiền còn 20 ngày trừ 60 giây: floor(6,66…) = 6 ngày quy đổi. Gói mới bắt đầu lúc trả tiền.
+    // Lúc trả tiền còn 20 ngày trừ 60 giây: floor(24,32…) = 24 ngày quy đổi. Gói mới bắt đầu lúc trả tiền.
     expect(await license()).toEqual({
-      plan: "pro_x2",
-      expires_at: T0 + 10 * DAY + 60 + 36 * DAY,
+      plan: "yearly",
+      expires_at: T0 + 10 * DAY + 60 + 389 * DAY,
       cycle_anchor: T0 + 10 * DAY + 60,
       version: 1,
     });
-    expect((await w.getOrder(orderCode, token)).body.license_expires_at).toBe(T0 + 46 * DAY + 60);
+    expect((await w.getOrder(orderCode, token)).body.license_expires_at).toBe(T0 + 399 * DAY + 60);
   });
 
   it("đơn license mới mà webhook tới muộn 24 giờ: 30 ngày tính từ lúc trả tiền", async () => {
@@ -369,24 +369,24 @@ describe("thời điểm tính là lúc khách trả tiền (QĐ33)", () => {
     const body = await w.payos.webhookBody(orderCode);
     w.clock.now = T0 + 31 * DAY;
     await w.call("POST", "/v1/webhooks/payos", body);
-    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 60 * DAY, cycle_anchor: T0, version: 1 });
+    expect(await license()).toEqual({ plan: "monthly", expires_at: T0 + 60 * DAY, cycle_anchor: T0, version: 1 });
   });
 
   it("thời điểm PayOS báo bị kẹp trong thời hạn của link thanh toán", async () => {
     const w = makeWorld();
     const { licenseKey } = await w.buy();
     w.clock.now = T0 + 10 * DAY;
-    const early = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
+    const early = await checkout(w, { plan: "yearly", license_key: licenseKey });
     w.payos.pay(early.orderCode, undefined, T0); // trước lúc tạo link: kẹp về lúc tạo link
     w.clock.now = T0 + 12 * DAY;
     await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(early.orderCode));
-    expect(await license()).toMatchObject({ cycle_anchor: T0 + 10 * DAY, expires_at: T0 + 46 * DAY });
+    expect(await license()).toMatchObject({ cycle_anchor: T0 + 10 * DAY, expires_at: T0 + 399 * DAY });
 
-    const late = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
+    const late = await checkout(w, { plan: "yearly", license_key: licenseKey });
     w.payos.pay(late.orderCode, undefined, T0 + 30 * DAY); // sau lúc link hết hạn: kẹp về hạn của link
     w.clock.now = T0 + 13 * DAY;
     await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(late.orderCode));
-    expect(await license()).toMatchObject({ plan: "pro_x2", cycle_anchor: T0 + 10 * DAY, expires_at: T0 + 76 * DAY });
+    expect(await license()).toMatchObject({ plan: "yearly", cycle_anchor: T0 + 10 * DAY, expires_at: T0 + 764 * DAY });
     // Gia hạn cùng gói khi còn hạn thì hạn mới không phụ thuộc thời điểm: kiểm thời điểm đã kẹp ở nhật ký.
     const paidAt = async (orderCode: number) =>
       JSON.parse(
@@ -401,10 +401,10 @@ describe("thời điểm tính là lúc khách trả tiền (QĐ33)", () => {
 describe("hai đơn của cùng license xác nhận cùng lúc (QĐ32)", () => {
   async function twoOrders() {
     const w = makeWorld();
-    const { licenseKey } = await w.buy(); // Professional, hết hạn T0 + 30 ngày
+    const { licenseKey } = await w.buy(); // Monthly, hết hạn T0 + 30 ngày
     w.clock.now = T0 + 10 * DAY; // còn 20 ngày
-    const a = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
-    const b = await checkout(w, { plan: "pro_x5", license_key: licenseKey });
+    const a = await checkout(w, { plan: "yearly", license_key: licenseKey });
+    const b = await checkout(w, { plan: "monthly", license_key: licenseKey });
     w.payos.pay(a.orderCode);
     w.payos.pay(b.orderCode);
     return { w, a: a.orderCode, b: b.orderCode };
@@ -420,40 +420,41 @@ describe("hai đơn của cùng license xác nhận cùng lúc (QĐ32)", () => {
     const granted = await grantOrder(env.DB, plans(), (await loadOrder(env.DB, a))!, {
       now,
       paidAt: now,
-      amountPaid: 150000,
+      amountPaid: 500000,
       actor: "test",
       beforeCommit: async () => {
         if (!chen) return;
         chen = false;
-        await grantOrder(env.DB, plans(), (await loadOrder(env.DB, b))!, { now, paidAt: now, amountPaid: 500000, actor: "test" });
+        await grantOrder(env.DB, plans(), (await loadOrder(env.DB, b))!, { now, paidAt: now, amountPaid: 50000, actor: "test" });
       },
     });
-    // B trước: Professional 20 ngày → X5, quy đổi floor(20 × 50.000 / 500.000) = 2, X5 chạy 32 ngày.
-    // A sau: X5 32 ngày → X2, quy đổi floor(32 × 500.000 / 150.000) = 106, X2 chạy 136 ngày.
-    expect(granted).toMatchObject({ plan: "pro_x2", expiresAt: now + 136 * DAY, convertedDays: 106 });
-    expect(await license()).toEqual({ plan: "pro_x2", expires_at: now + 136 * DAY, cycle_anchor: now, version: 2 });
+    // B trước: Monthly còn 20 ngày, mua thêm Monthly: hết hạn T0 + 60 ngày (còn 50 ngày), giữ cycle_anchor.
+    // A sau: Monthly 50 ngày → Yearly, quy đổi floor(50 × 365 × 50.000 / (30 × 500.000)) = 60, Yearly chạy 425 ngày.
+    expect(granted).toMatchObject({ plan: "yearly", expiresAt: now + 425 * DAY, convertedDays: 60 });
+    expect(await license()).toEqual({ plan: "yearly", expires_at: now + 425 * DAY, cycle_anchor: now, version: 2 });
     expect(await statuses()).toEqual([{ status: "paid" }, { status: "paid" }]);
     // Lần ghi đầu của A bị B chen nên không có tác dụng: không để lại dòng nhật ký nào; mỗi đơn đúng một dòng.
-    expect([await auditCount("license_issued"), await auditCount("license_plan_changed"), await auditCount("license_extended")]).toEqual([1, 2, 0]);
+    expect([await auditCount("license_issued"), await auditCount("license_plan_changed"), await auditCount("license_extended")]).toEqual([1, 1, 1]);
   });
 
   it("hai webhook chạy song song: kết quả bằng đúng việc áp lần lượt hai đơn", async () => {
     const { w, a, b } = await twoOrders();
     await Promise.all([a, b].map(async (n) => w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(n))));
     const now = T0 + 10 * DAY;
-    // A rồi B: X2 36 ngày → X5 quy đổi floor(36 × 150.000 / 500.000) = 10, chạy 40 ngày. B rồi A: X2 136 ngày.
+    // A rồi B: Yearly 389 ngày → Monthly quy đổi floor(389 × 30 × 500.000 / (365 × 50.000)) = 319, chạy 349 ngày.
+    // B rồi A: Yearly 425 ngày (như test trên).
     expect([
-      { plan: "pro_x5", expires_at: now + 40 * DAY, cycle_anchor: now, version: 2 },
-      { plan: "pro_x2", expires_at: now + 136 * DAY, cycle_anchor: now, version: 2 },
+      { plan: "monthly", expires_at: now + 349 * DAY, cycle_anchor: now, version: 2 },
+      { plan: "yearly", expires_at: now + 425 * DAY, cycle_anchor: now, version: 2 },
     ]).toContainEqual(await license());
     expect(await statuses()).toEqual([{ status: "paid" }, { status: "paid" }]);
-    expect(w.resend.sent.filter((m) => m.subject.startsWith("Đã đổi gói"))).toHaveLength(2);
+    expect(w.resend.sent.filter((m) => /^Đã (đổi gói|gia hạn)/.test(m.subject))).toHaveLength(2);
   });
 
   it("đơn đã áp rồi thì grantOrder trả already_settled, không áp lần hai", async () => {
     const { w, a } = await twoOrders();
     await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(a));
-    const again = await grantOrder(env.DB, plans(), (await loadOrder(env.DB, a))!, { now: T0 + 10 * DAY, amountPaid: 150000, actor: "test" });
+    const again = await grantOrder(env.DB, plans(), (await loadOrder(env.DB, a))!, { now: T0 + 10 * DAY, amountPaid: 500000, actor: "test" });
     expect(again).toBe("already_settled");
     expect(await license()).toMatchObject({ version: 1 });
   });
@@ -464,15 +465,15 @@ describe("nhật ký đổi gói cùng batch với lệnh ghi license", () => {
     const w = makeWorld();
     const { licenseKey } = await w.buy();
     w.clock.now = T0 + 10 * DAY;
-    const { orderCode } = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
+    const { orderCode } = await checkout(w, { plan: "yearly", license_key: licenseKey });
     w.payos.pay(orderCode);
     const body = await w.payos.webhookBody(orderCode);
     const failed = await withFailingInsert("audit_log", "NEW.action = 'license_plan_changed'", () => w.call("POST", "/v1/webhooks/payos", body));
     expect(failed.status).toBe(503);
-    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 30 * DAY, cycle_anchor: T0, version: 0 });
+    expect(await license()).toEqual({ plan: "monthly", expires_at: T0 + 30 * DAY, cycle_anchor: T0, version: 0 });
     expect(await orderRow(orderCode)).toEqual({ status: "pending", amount_paid: 0 });
     expect((await w.call("POST", "/v1/webhooks/payos", body)).body).toEqual({ ok: true, result: "granted" });
-    expect(await license()).toMatchObject({ plan: "pro_x2", version: 1 });
+    expect(await license()).toMatchObject({ plan: "yearly", version: 1 });
     expect(await auditCount("license_plan_changed")).toBe(1);
   });
 });
@@ -480,10 +481,10 @@ describe("nhật ký đổi gói cùng batch với lệnh ghi license", () => {
 describe("đơn của cùng license áp không theo thứ tự thanh toán", () => {
   it("đơn trả sớm hơn mà xử lý sau: tính tại cycle_anchor đang có, để cycle_anchor không lùi", async () => {
     const w = makeWorld();
-    const { licenseKey } = await w.buy(); // Professional, hết hạn T0 + 30 ngày
+    const { licenseKey } = await w.buy(); // Monthly, hết hạn T0 + 30 ngày
     w.clock.now = T0 + 10 * DAY;
-    const a = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
-    const b = await checkout(w, { plan: "pro_x5", license_key: licenseKey });
+    const a = await checkout(w, { plan: "monthly", license_key: licenseKey });
+    const b = await checkout(w, { plan: "yearly", license_key: licenseKey });
     const t1 = T0 + 10 * DAY;
     const t2 = T0 + 10 * DAY + 300;
     w.payos.pay(a.orderCode, undefined, t1);
@@ -491,15 +492,15 @@ describe("đơn của cùng license áp không theo thứ tự thanh toán", ()
     w.clock.now = T0 + 10 * DAY + 600;
     // Webhook của B (trả muộn hơn) tới trước.
     await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(b.orderCode));
-    // B: Professional còn 20 ngày trừ 300 giây → X5, floor(1,99…) = 1 ngày quy đổi, chạy 31 ngày từ t2.
-    expect(await license()).toMatchObject({ plan: "pro_x5", cycle_anchor: t2, expires_at: t2 + 31 * DAY });
+    // B: Monthly còn 20 ngày trừ 300 giây → Yearly, floor(24,32…) = 24 ngày quy đổi, chạy 389 ngày từ t2.
+    expect(await license()).toMatchObject({ plan: "yearly", cycle_anchor: t2, expires_at: t2 + 389 * DAY });
     await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(a.orderCode));
-    // A tính tại t2, không tại t1: X5 còn đúng 31 ngày → X2, floor(103,3) = 103, chạy 133 ngày từ t2.
-    expect(await license()).toEqual({ plan: "pro_x2", expires_at: t2 + 133 * DAY, cycle_anchor: t2, version: 2 });
+    // A tính tại t2, không tại t1: Yearly còn đúng 389 ngày → Monthly, floor(319,7…) = 319, chạy 349 ngày từ t2.
+    expect(await license()).toEqual({ plan: "monthly", expires_at: t2 + 349 * DAY, cycle_anchor: t2, version: 2 });
     const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'license_plan_changed' AND order_code = ?")
       .bind(a.orderCode)
       .first<{ detail: string }>();
-    expect(JSON.parse(log!.detail)).toMatchObject({ paid_at: t2, converted_days: 103 });
+    expect(JSON.parse(log!.detail)).toMatchObject({ paid_at: t2, converted_days: 319 });
   });
 });
 
@@ -508,7 +509,7 @@ describe("license đã thu hồi mà nhận được tiền (QĐ37)", () => {
     const w = makeWorld();
     const { licenseKey } = await w.buy();
     w.clock.now = T0 + 10 * DAY;
-    const { orderCode, token } = await checkout(w, { plan: "pro_x2", license_key: licenseKey });
+    const { orderCode, token } = await checkout(w, { plan: "yearly", license_key: licenseKey });
     w.payos.pay(orderCode);
     w.resend.sent.length = 0;
     return { w, licenseKey, orderCode, token };
@@ -519,16 +520,16 @@ describe("license đã thu hồi mà nhận được tiền (QĐ37)", () => {
     await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0 + 10 * DAY).run();
     const wh = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
     expect(wh.body).toEqual({ ok: true, result: "needs_review" });
-    expect(await license()).toEqual({ plan: "pro", expires_at: T0 + 30 * DAY, cycle_anchor: T0, version: 0 });
+    expect(await license()).toEqual({ plan: "monthly", expires_at: T0 + 30 * DAY, cycle_anchor: T0, version: 0 });
     expect(await env.DB.prepare("SELECT status, amount_paid, license_id, grant_kind FROM orders WHERE order_code = ?").bind(orderCode).first())
-      .toEqual({ status: "paid_needs_review", amount_paid: 150000, license_id: null, grant_kind: null });
+      .toEqual({ status: "paid_needs_review", amount_paid: 500000, license_id: null, grant_kind: null });
     expect(w.resend.sent).toHaveLength(0);
     expect(await env.DB.prepare("SELECT kind, count FROM ops_alerts").all()).toMatchObject({ results: [{ kind: "order_needs_review", count: 1 }] });
     const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'order_needs_review'").first<{ detail: string }>();
-    expect(JSON.parse(log!.detail)).toMatchObject({ reason: "license_revoked", plan: "pro_x2", amount_paid: 150000 });
+    expect(JSON.parse(log!.detail)).toMatchObject({ reason: "license_revoked", plan: "yearly", amount_paid: 500000 });
     // App thấy trạng thái này, không có key.
     const order = await w.getOrder(orderCode, token);
-    expect(order.body).toMatchObject({ status: "paid_needs_review", plan: "pro_x2" });
+    expect(order.body).toMatchObject({ status: "paid_needs_review", plan: "yearly" });
     expect(order.body).not.toHaveProperty("license_key");
   });
 
@@ -545,11 +546,11 @@ describe("license đã thu hồi mà nhận được tiền (QĐ37)", () => {
     await env.DB.prepare("UPDATE licenses SET revoked_at = NULL").run();
     const again = await grantOrder(env.DB, parsePlans(env.PLANS) as PlanTable, (await loadOrder(env.DB, orderCode))!, {
       now: T0 + 11 * DAY,
-      amountPaid: 150000,
+      amountPaid: 500000,
       actor: "test",
     });
     expect(again).toBe("already_settled");
-    expect(await license()).toMatchObject({ plan: "pro", version: 0 });
+    expect(await license()).toMatchObject({ plan: "monthly", version: 0 });
     expect(await env.DB.prepare("SELECT SUM(count) AS n FROM ops_alerts WHERE kind = 'order_needs_review'").first()).toEqual({ n: 1 });
     expect(w.resend.sent).toHaveLength(0);
   });
@@ -558,14 +559,14 @@ describe("license đã thu hồi mà nhận được tiền (QĐ37)", () => {
     const { orderCode } = await revokedRenewal();
     const result = await grantOrder(env.DB, parsePlans(env.PLANS) as PlanTable, (await loadOrder(env.DB, orderCode))!, {
       now: T0 + 10 * DAY,
-      amountPaid: 150000,
+      amountPaid: 500000,
       actor: "test",
       beforeCommit: async () => {
         await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0 + 10 * DAY).run();
       },
     });
     expect(result).toBe("needs_review");
-    expect(await license()).toMatchObject({ plan: "pro", version: 0 });
+    expect(await license()).toMatchObject({ plan: "monthly", version: 0 });
     expect(await env.DB.prepare("SELECT status FROM orders WHERE order_code = ?").bind(orderCode).first()).toEqual({ status: "paid_needs_review" });
   });
 
@@ -580,7 +581,7 @@ describe("license đã thu hồi mà nhận được tiền (QĐ37)", () => {
     // Webhook gửi lại (hay đối soát): đơn chuyển trạng thái, có nhật ký và cảnh báo, mỗi thứ một lần.
     expect((await w.call("POST", "/v1/webhooks/payos", body)).body).toEqual({ ok: true, result: "needs_review" });
     expect((await w.call("POST", "/v1/webhooks/payos", body)).body).toEqual({ ok: true, result: "needs_review" });
-    expect(await orderRow(orderCode)).toEqual({ status: "paid_needs_review", amount_paid: 150000 });
+    expect(await orderRow(orderCode)).toEqual({ status: "paid_needs_review", amount_paid: 500000 });
     expect(await auditCount("order_needs_review")).toBe(1);
     expect(await env.DB.prepare("SELECT SUM(count) AS n FROM ops_alerts WHERE kind = 'order_needs_review'").first()).toEqual({ n: 1 });
   });
@@ -588,15 +589,15 @@ describe("license đã thu hồi mà nhận được tiền (QĐ37)", () => {
   it("đơn đã paid, license bị thu hồi sau đó, grantOrder gọi lại: đơn giữ paid, không chuyển sang chờ xử lý", async () => {
     const { w, orderCode } = await revokedRenewal();
     await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
-    expect(await orderRow(orderCode)).toEqual({ status: "paid", amount_paid: 150000 });
+    expect(await orderRow(orderCode)).toEqual({ status: "paid", amount_paid: 500000 });
     await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0 + 11 * DAY).run();
     const again = await grantOrder(env.DB, parsePlans(env.PLANS) as PlanTable, (await loadOrder(env.DB, orderCode))!, {
       now: T0 + 11 * DAY,
-      amountPaid: 150000,
+      amountPaid: 500000,
       actor: "test",
     });
     expect(again).toBe("already_settled");
-    expect(await orderRow(orderCode)).toEqual({ status: "paid", amount_paid: 150000 });
+    expect(await orderRow(orderCode)).toEqual({ status: "paid", amount_paid: 500000 });
     expect(await auditCount("order_needs_review")).toBe(0);
     expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM ops_alerts").first()).toEqual({ n: 0 });
   });
diff --git a/server/test/reconcile.test.ts b/server/test/reconcile.test.ts
index 257d693..7d2716f 100644
--- a/server/test/reconcile.test.ts
+++ b/server/test/reconcile.test.ts
@@ -15,7 +15,7 @@ afterEach(() => {
 });
 
 async function newOrder(w: ReturnType<typeof makeWorld>) {
-  const res = await w.call("POST", "/v1/checkout", { plan: "pro", email: "buyer@example.com", consent: true });
+  const res = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "buyer@example.com", consent: true });
   return res.body.order_code as number;
 }
 
@@ -157,11 +157,11 @@ describe("đối soát mỗi 5 phút", () => {
     const { licenseKey } = await w.buy();
     w.resend.sent.length = 0;
     await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0).run();
-    const res = await w.call("POST", "/v1/checkout", { plan: "pro", email: "buyer@example.com", consent: true, license_key: licenseKey });
+    const res = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "buyer@example.com", consent: true, license_key: licenseKey });
     expect(res.status).toBe(403); // checkout từ chối license đã thu hồi
     // Đơn tạo trước lúc thu hồi.
     await env.DB.prepare("UPDATE licenses SET revoked_at = NULL").run();
-    const co = await w.call("POST", "/v1/checkout", { plan: "pro", email: "buyer@example.com", consent: true, license_key: licenseKey });
+    const co = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "buyer@example.com", consent: true, license_key: licenseKey });
     const orderCode = co.body.order_code as number;
     await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0 + 60).run();
     w.payos.pay(orderCode);
diff --git a/server/test/recover.test.ts b/server/test/recover.test.ts
index b444296..b530b10 100644
--- a/server/test/recover.test.ts
+++ b/server/test/recover.test.ts
@@ -9,7 +9,7 @@ describe("POST /v1/licenses/recover", () => {
   it("gửi mọi key còn hiệu lực của email vào chính email đó", async () => {
     const w = makeWorld();
     const a = await w.buy({ email: "buyer@example.com" });
-    const b = await w.buy({ email: "buyer@example.com", plan: "pro_x2" });
+    const b = await w.buy({ email: "buyer@example.com", plan: "yearly" });
     const revoked = await w.buy({ email: "buyer@example.com" });
     await env.DB.prepare("UPDATE licenses SET revoked_at = 1 WHERE license_key = ?")
       .bind(revoked.licenseKey.replace(/-/g, ""))
diff --git a/server/test/schema.test.ts b/server/test/schema.test.ts
index 565850c..0e3abbf 100644
--- a/server/test/schema.test.ts
+++ b/server/test/schema.test.ts
@@ -17,12 +17,13 @@ it("migration tạo đủ bảng", async () => {
     "ops_alerts",
     "orders",
     "rate_limits",
+    "trials",
   ]);
 });
 
 it("mỗi máy chỉ có một dòng activation cho một license, kể cả sau khi gỡ", async () => {
   await env.DB.prepare(
-    "INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES ('L1', 'K1', NULL, 'pro', 1, 0, 0, 0)",
+    "INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES ('L1', 'K1', NULL, 'monthly', 1, 0, 0, 0)",
   ).run();
   const insert = env.DB.prepare(
     "INSERT INTO activations (id, license_id, device_id_hash, created_at, last_validated_at) VALUES (?, 'L1', 'd', 0, 0)",
@@ -43,11 +44,13 @@ it("license và đơn chỉ nhận mã gói đã biết", async () => {
     "INSERT INTO licenses (id, license_key, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES ('L2', 'K2', ?, 1, 0, 0, 0)",
   );
   await expect(lic.bind("pro_1m").run()).rejects.toThrow(/CHECK/);
-  await lic.bind("pro_x5").run();
+  await expect(lic.bind("pro_x5").run()).rejects.toThrow(/CHECK/);
+  await lic.bind("yearly").run();
   const order = env.DB.prepare(
     `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at)
      VALUES ('h', 'payos', ?, 1, 'VND', 0, 'pending', 0, 0)`,
   );
   await expect(order.bind("free").run()).rejects.toThrow(/CHECK/);
-  await order.bind("pro_x2").run();
+  await expect(order.bind("pro").run()).rejects.toThrow(/CHECK/);
+  await order.bind("monthly").run();
 });
diff --git a/server/test/security.test.ts b/server/test/security.test.ts
index 75b7a1e..7af8c6c 100644
--- a/server/test/security.test.ts
+++ b/server/test/security.test.ts
@@ -38,7 +38,7 @@ describe("bảo mật license server (§10.2, §11)", () => {
   it("lỗi của PayOS không lộ ra response", async () => {
     const w = makeWorld();
     w.payos.down = true;
-    const res = await w.call("POST", "/v1/checkout", { plan: "pro", email: "a@example.com", consent: true });
+    const res = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "a@example.com", consent: true });
     expect(res.body).toEqual({ error: "payment_provider_error" });
   });
 });
diff --git a/server/test/world.ts b/server/test/world.ts
index ca99cc8..b776699 100644
--- a/server/test/world.ts
+++ b/server/test/world.ts
@@ -66,7 +66,7 @@ export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
   /** Mua trọn một đơn: checkout, khách trả đủ tiền, PayOS gửi webhook. Trả về key đã cấp. */
   async function buy(opts: { plan?: string; email?: string; licenseKey?: string } = {}) {
     const req: Record<string, unknown> = {
-      plan: opts.plan ?? "pro",
+      plan: opts.plan ?? "monthly",
       email: opts.email ?? "buyer@example.com",
       consent: true,
     };
@@ -93,7 +93,7 @@ export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
    */
   async function customerB() {
     const email = "khach-b@example.com";
-    const { licenseKey } = await buy({ email, plan: "pro_x2" });
+    const { licenseKey } = await buy({ email, plan: "yearly" });
     const device = (n: number) => sha256Hex(`khach-b-${n}`);
     const ip = (n: number) => ({ "cf-connecting-ip": `192.0.2.${n}` });
     const activate = async (n: number) => {
diff --git a/server/vitest.config.ts b/server/vitest.config.ts
index 06b3597..6eff59d 100644
--- a/server/vitest.config.ts
+++ b/server/vitest.config.ts
@@ -23,7 +23,11 @@ export default defineConfig(async () => {
         wrangler: { configPath: "./wrangler.jsonc" },
         // ENVIRONMENT = "test" chỉ có ở đây: wrangler*.jsonc luôn đặt "production" (test/node/wrangler-config.test.mjs khóa
         // điều đó). Riêng khi test, giá trị này nới ba chỗ: không ép chỉ HTTPS, cho phép khóa ký test-*, không bắt buộc ACCESS_AUD.
-        miniflare: { bindings: { TEST_MIGRATIONS: migrations, ...FAKE_SECRETS, ENVIRONMENT: "test" } },
+        // MIGRATION_DB: D1 trống riêng cho test chuyển dữ liệu của từng migration (test/migrations.test.ts).
+        miniflare: {
+          bindings: { TEST_MIGRATIONS: migrations, ...FAKE_SECRETS, ENVIRONMENT: "test" },
+          d1Databases: ["MIGRATION_DB"],
+        },
       }),
     ],
     // test/node/: test script Node (scripts/*.mjs), chạy bằng `pnpm test:scripts`, không chạy trong workerd.
PATCH
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
pnpm exec vitest run test/migrations.test.ts test/schema.test.ts
```

Kết quả mong đợi: `Tests  5 failed (5)`: `có đúng hai migration theo thứ tự` (`expected [ '0001_init.sql' ] …`), `0002 đổi mã gói…`, và ba test của `schema.test.ts` (`no such table: trials`).

- [ ] **Step 3: Viết code**

```bash
git apply <<'PATCH'
diff --git a/server/migrations/0002_three_plans_trials.sql b/server/migrations/0002_three_plans_trials.sql
new file mode 100644
index 0000000..91ecd7b
--- /dev/null
+++ b/server/migrations/0002_three_plans_trials.sql
@@ -0,0 +1,129 @@
+-- Ba gói (spec 2026-10-07): mã gói 'pro', 'pro_x2', 'pro_x5' đổi thành 'monthly', 'yearly'; thêm bảng dùng thử theo máy.
+-- Đổi mã: 'pro', 'pro_x2' → 'monthly'; 'pro_x5' → 'yearly'. Mọi cột khác giữ nguyên giá trị.
+--
+-- SQLite không sửa được CHECK, nên phải dựng lại licenses và orders. licenses là bảng cha của activations,
+-- deactivations và orders; xóa bảng cha khi còn bảng con trỏ tới là vi phạm khóa ngoại, và PRAGMA defer_foreign_keys
+-- không cứu được (bộ đếm vi phạm không giảm khi đổi tên bảng mới về tên cũ). Vì vậy dựng lại cả bốn bảng:
+--   1. tạo licenses_new, rồi các bảng con *_new trỏ tới licenses_new / activations_new; chép dữ liệu;
+--   2. xóa bảng cũ theo thứ tự con trước cha (không còn bảng nào trỏ tới bảng đang xóa);
+--   3. đổi tên *_new về tên cũ: SQLite tự sửa REFERENCES của các bảng con theo tên mới;
+--   4. tạo lại index; giữ bộ đếm AUTOINCREMENT của orders và deactivations.
+-- Không đổi tên bảng cũ trước (ALTER TABLE … RENAME sẽ kéo REFERENCES của bảng con theo tên cũ đã đổi).
+
+CREATE TABLE licenses_new (
+  id TEXT PRIMARY KEY,
+  license_key TEXT NOT NULL UNIQUE,      -- 28 ký tự Crockford base32, không gạch nối
+  email TEXT,                            -- NULL sau khi ẩn danh theo email (Q9)
+  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),  -- mã gói (src/token.ts PLAN_CODES)
+  expires_at INTEGER NOT NULL,
+  cycle_anchor INTEGER NOT NULL,         -- mốc chu kỳ hạn mức 30 ngày (§6.8); đổi gói thì đặt lại
+  anchor_applied_at INTEGER NOT NULL,    -- lúc server đặt cycle_anchor gần nhất (lúc xử lý đơn); mốc của quota_fresh (QĐ35)
+  version INTEGER NOT NULL DEFAULT 0,    -- tăng mỗi lần đổi plan, expires_at hoặc cycle_anchor (QĐ32)
+  last_order_code INTEGER,               -- đơn gần nhất đã áp vào license (QĐ32)
+  created_at INTEGER NOT NULL,
+  revoked_at INTEGER,
+  locked_at INTEGER,                     -- khóa tạm vì gỡ rồi kích hoạt quá ngưỡng (§10.2)
+  lock_cleared_at INTEGER                -- admin mở khóa; lần gỡ trước mốc này không tính nữa
+);
+INSERT INTO licenses_new (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, version,
+                          last_order_code, created_at, revoked_at, locked_at, lock_cleared_at)
+  SELECT id, license_key, email, CASE plan WHEN 'pro_x5' THEN 'yearly' ELSE 'monthly' END, expires_at, cycle_anchor,
+         anchor_applied_at, version, last_order_code, created_at, revoked_at, locked_at, lock_cleared_at
+  FROM licenses;
+
+CREATE TABLE orders_new (
+  order_code INTEGER PRIMARY KEY AUTOINCREMENT,
+  order_token_hash TEXT NOT NULL,        -- SHA-256 của order_token; không lưu token gốc
+  provider TEXT NOT NULL,                -- 'payos'
+  provider_ref TEXT,                     -- paymentLinkId của PayOS
+  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
+  amount INTEGER NOT NULL,
+  currency TEXT NOT NULL,                -- 'VND'
+  email TEXT,                            -- NULL sau khi ẩn danh theo email (Q9)
+  email_consent_at INTEGER NOT NULL,     -- lúc người mua tick đồng ý xử lý email (§10.1)
+  renew_license_id TEXT REFERENCES licenses_new (id),
+  license_id TEXT REFERENCES licenses_new (id),
+  grant_kind TEXT,                       -- lúc cấp: 'new' | 'extend' (cùng gói) | 'change' (đổi gói), QĐ32
+  status TEXT NOT NULL,                  -- pending | processing | paid | underpaid | cancelled | expired | failed
+                                         -- | paid_needs_review (license đã thu hồi nhận được tiền, QĐ37) | refunded (admin ghi đã hoàn)
+  amount_paid INTEGER NOT NULL DEFAULT 0,
+  created_at INTEGER NOT NULL,
+  expires_at INTEGER NOT NULL,           -- hạn của link thanh toán (tạo đơn + 15 phút)
+  paid_at INTEGER,                       -- lúc server xác nhận đã trả tiền (thời điểm thanh toán của cổng: audit_log, QĐ33)
+  last_checked_at INTEGER,
+  email_sent_at INTEGER,
+  email_attempts INTEGER NOT NULL DEFAULT 0,   -- số lần đã thử gửi thư chứa key
+  email_retry_at INTEGER,                      -- lần gửi lại kế tiếp sau lỗi tạm (401, 403, 409 concurrent_…, 429, 5xx, mạng)
+  email_gave_up_at INTEGER                     -- thôi gửi sau lỗi vĩnh viễn (400, 422)
+);
+INSERT INTO orders_new (order_code, order_token_hash, provider, provider_ref, plan, amount, currency, email,
+                        email_consent_at, renew_license_id, license_id, grant_kind, status, amount_paid, created_at,
+                        expires_at, paid_at, last_checked_at, email_sent_at, email_attempts, email_retry_at,
+                        email_gave_up_at)
+  SELECT order_code, order_token_hash, provider, provider_ref, CASE plan WHEN 'pro_x5' THEN 'yearly' ELSE 'monthly' END,
+         amount, currency, email, email_consent_at, renew_license_id, license_id, grant_kind, status, amount_paid,
+         created_at, expires_at, paid_at, last_checked_at, email_sent_at, email_attempts, email_retry_at,
+         email_gave_up_at
+  FROM orders;
+
+-- Mỗi (license, máy) có đúng một dòng, giữ mãi: gỡ máy chỉ đặt deactivated_at; kích hoạt lại cùng máy
+-- dùng lại dòng đó, giữ activation_id, created_at và quota_epoch (QĐ35).
+CREATE TABLE activations_new (
+  id TEXT PRIMARY KEY,
+  license_id TEXT NOT NULL REFERENCES licenses_new (id),
+  device_id_hash TEXT NOT NULL,          -- SHA-256 hex của IOPlatformUUID hoặc MachineGuid
+  device_label TEXT,                     -- tên máy; NULL sau khi ẩn danh (Q9)
+  quota_epoch INTEGER NOT NULL DEFAULT 0,    -- admin tăng để máy bắt đầu bộ đếm hạn mức mới (QĐ35)
+  epoch_pending INTEGER NOT NULL DEFAULT 0,  -- 1: admin vừa tăng quota_epoch, token kế tiếp mở cửa sổ quota_fresh (QĐ35)
+  epoch_window_start INTEGER,                -- lúc cấp token đầu tiên sau lần tăng quota_epoch gần nhất (QĐ35)
+  created_at INTEGER NOT NULL,
+  last_validated_at INTEGER NOT NULL,
+  deactivated_at INTEGER,                -- NULL là đang kích hoạt
+  deactivated_by TEXT                    -- 'user' | 'admin', của lần gỡ gần nhất
+);
+INSERT INTO activations_new (id, license_id, device_id_hash, device_label, quota_epoch, epoch_pending,
+                             epoch_window_start, created_at, last_validated_at, deactivated_at, deactivated_by)
+  SELECT id, license_id, device_id_hash, device_label, quota_epoch, epoch_pending, epoch_window_start, created_at,
+         last_validated_at, deactivated_at, deactivated_by
+  FROM activations;
+
+-- Mọi lần gỡ máy, để đếm luật khóa tạm (§10.2) kể cả khi dòng activation đã được kích hoạt lại.
+CREATE TABLE deactivations_new (
+  id INTEGER PRIMARY KEY AUTOINCREMENT,
+  license_id TEXT NOT NULL REFERENCES licenses_new (id),
+  activation_id TEXT NOT NULL REFERENCES activations_new (id),
+  at INTEGER NOT NULL,
+  by TEXT NOT NULL                       -- 'user' (tự gỡ, gỡ từ xa) | 'admin' (không tính vào luật khóa tạm)
+);
+INSERT INTO deactivations_new (id, license_id, activation_id, at, by)
+  SELECT id, license_id, activation_id, at, by FROM deactivations;
+
+-- Giữ bộ đếm AUTOINCREMENT (orders: production bắt đầu từ 1.000.001, §6.8): số kế tiếp không bao giờ lùi,
+-- kể cả khi bộ đếm lớn hơn khóa lớn nhất còn lại.
+DELETE FROM sqlite_sequence WHERE name IN ('orders_new', 'deactivations_new');
+INSERT INTO sqlite_sequence (name, seq)
+  SELECT name || '_new', seq FROM sqlite_sequence WHERE name IN ('orders', 'deactivations');
+
+DROP TABLE deactivations;
+DROP TABLE activations;
+DROP TABLE orders;
+DROP TABLE licenses;
+ALTER TABLE licenses_new RENAME TO licenses;
+ALTER TABLE activations_new RENAME TO activations;
+ALTER TABLE deactivations_new RENAME TO deactivations;
+ALTER TABLE orders_new RENAME TO orders;
+
+CREATE INDEX licenses_email ON licenses (email);
+CREATE INDEX orders_pending ON orders (status, created_at);
+CREATE INDEX orders_email ON orders (email);
+CREATE UNIQUE INDEX activations_device ON activations (license_id, device_id_hash);
+CREATE INDEX activations_license ON activations (license_id, deactivated_at);
+CREATE INDEX deactivations_license ON deactivations (license_id, at);
+
+-- Dùng thử Free theo máy (spec 2026-10-07 §3.1). Mỗi máy một dòng, giữ mãi: cài lại app không mở lại dùng thử.
+CREATE TABLE trials (
+  device_id_hash TEXT PRIMARY KEY,   -- SHA-256 hex của IOPlatformUUID hoặc MachineGuid, như activations
+  started_at INTEGER NOT NULL,       -- lúc server ghi lần đầu (giây Unix)
+  ends_at INTEGER NOT NULL,          -- started_at + TRIAL_DAYS ngày; cố định từ lúc tạo
+  last_seen_at INTEGER NOT NULL      -- lần gọi gần nhất, để hỗ trợ
+) WITHOUT ROWID;
diff --git a/server/src/admin.ts b/server/src/admin.ts
index a3ac5f6..e8b0435 100644
--- a/server/src/admin.ts
+++ b/server/src/admin.ts
@@ -218,7 +218,8 @@ export function createAdminApp(makeDeps: (env: AdminEnv) => AdminDeps) {
   });
 
   // Xử lý đơn paid_needs_review (license đã thu hồi mà nhận được tiền, QĐ37). Hai cách:
-  // - "grant_new_license": cấp một license mới cho đơn (key mới, gói của đơn, 30 ngày từ lúc thao tác), gửi key qua email;
+  // - "grant_new_license": cấp một license mới cho đơn (key mới, gói của đơn, số ngày của gói từ lúc thao tác), gửi key
+  //   qua email;
   //   license đã thu hồi giữ nguyên;
   // - "refunded": ghi là đã hoàn tiền ngoài hệ thống; đơn thành refunded.
   app.post("/admin/orders/:orderCode/resolve", async (c) => {
PATCH
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
pnpm check
```

Kết quả mong đợi: Thoát mã 0. Trong log: `Test Files  19 passed (19)`, `Tests  378 passed (378)`; `vectors:check` không in gì; `test:scripts` `ℹ fail 0`; hai lần `--dry-run: exiting now.`

- [ ] **Step 5: Kiểm khớp cây tham chiếu rồi commit**

```bash
git add -A server
git diff --cached --stat 7992242 -- server   # phải không in gì
git commit -m "feat(server): migration 0002 đổi mã gói, dựng lại bảng, thêm bảng trials; test theo Monthly/Yearly

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 4: POST /v1/trial: dùng thử Free theo máy

**Commit tham chiếu:** `d8d4a5a` (nhánh `ref-bg01`).

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/env.ts`
- Modify: `server/src/http.ts`
- Modify: `server/src/ratelimit.ts`
- Create: `server/src/trial.ts`
- Modify: `server/test/node/wrangler-config.test.mjs`
- Modify: `server/test/security.test.ts`
- Create: `server/test/trial.test.ts`
- Modify: `server/wrangler.jsonc`

Route mới trong `src/trial.ts` (spec mục 3.1, hợp đồng 00):
- giới hạn `trial_ip` 10 lần/giờ/IP, đếm cả request sai, không tính vào bộ đếm thất bại theo IP;
- `device_id_hash` sai dạng → `400 invalid_request`, `field: "device_id_hash"`;
- `TRIAL_DAYS` (biến mới, `10` trong `wrangler.jsonc`) thiếu hay sai → `503 trial_not_configured`, không ghi gì;
- máy mới: `started_at` = giờ server, `ends_at` = `started_at + TRIAL_DAYS` ngày; máy cũ: giữ nguyên hai mốc, chỉ cập nhật `last_seen_at`;
- trả `200 {token, started_at, ends_at, issued_at}` kể cả khi dùng thử đã hết.

Test Node khóa `TRIAL_DAYS = 10` và chỉ Worker API có biến này. `security.test.ts` thêm `/v1/trial` vào vòng input độc hại.

- [ ] **Step 1: Viết test (red)**

```bash
git apply <<'PATCH'
diff --git a/server/test/node/wrangler-config.test.mjs b/server/test/node/wrangler-config.test.mjs
index efc8419..c67b89f 100644
--- a/server/test/node/wrangler-config.test.mjs
+++ b/server/test/node/wrangler-config.test.mjs
@@ -38,6 +38,11 @@ test("Worker API bán đúng bảng gói chính thức (spec 2026-10-07 §2.1),
   assert.deepEqual(yearly, { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } });
 });
 
+test("dùng thử Free 10 ngày mỗi máy (spec 2026-10-07 §3.1)", () => {
+  assert.equal(api.vars.TRIAL_DAYS, 10);
+  assert.equal("TRIAL_DAYS" in admin.vars, false, "chỉ Worker API cấp token dùng thử");
+});
+
 test("secret bắt buộc có đủ và không nằm trong vars", () => {
   assert.deepEqual(api.secrets.required, [
     "PAYOS_CLIENT_ID",
diff --git a/server/test/security.test.ts b/server/test/security.test.ts
index 7af8c6c..8e8b908 100644
--- a/server/test/security.test.ts
+++ b/server/test/security.test.ts
@@ -18,6 +18,8 @@ describe("bảo mật license server (§10.2, §11)", () => {
       expect(validate.status).toBe(400);
       const recover = await w.call("POST", "/v1/licenses/recover", { email: bad });
       expect(recover.status).toBe(400);
+      const trial = await w.call("POST", "/v1/trial", { device_id_hash: bad });
+      expect(trial.status).toBe(400);
       const checkout = await w.call("POST", "/v1/checkout", { plan: bad, email: "a@example.com", consent: true });
       expect(checkout.status).toBe(400);
       const order = await w.call("GET", `/v1/orders/${encodeURIComponent(bad)}`, undefined, {
@@ -26,9 +28,9 @@ describe("bảo mật license server (§10.2, §11)", () => {
       expect(order.status).toBe(404);
     }
     const counts = await env.DB.prepare(
-      "SELECT (SELECT COUNT(*) FROM licenses) AS l, (SELECT COUNT(*) FROM orders) AS o",
+      "SELECT (SELECT COUNT(*) FROM licenses) AS l, (SELECT COUNT(*) FROM orders) AS o, (SELECT COUNT(*) FROM trials) AS t",
     ).first();
-    expect(counts).toEqual({ l: 1, o: 1 });
+    expect(counts).toEqual({ l: 1, o: 1, t: 0 });
   });
 
   it("Worker API không có /admin", async () => {
diff --git a/server/test/trial.test.ts b/server/test/trial.test.ts
new file mode 100644
index 0000000..60fb94e
--- /dev/null
+++ b/server/test/trial.test.ts
@@ -0,0 +1,122 @@
+import { env } from "cloudflare:workers";
+import { beforeEach, describe, expect, it } from "vitest";
+import { sha256Hex } from "../src/crypto";
+import { verifyTrialToken } from "../src/token";
+import { parseTrialDays } from "../src/trial";
+import { resetDb } from "./db";
+import vectors from "./vectors/token-v1.json";
+import { DAY, makeWorld, T0 } from "./world";
+
+beforeEach(resetDb);
+
+const device = async (n: number) => sha256Hex(`trial-device-${n}`);
+const register = async (w: ReturnType<typeof makeWorld>, deviceIdHash: unknown, ip = "203.0.113.10") =>
+  w.call("POST", "/v1/trial", { device_id_hash: deviceIdHash }, { "cf-connecting-ip": ip });
+const trialRow = (deviceIdHash: string) =>
+  env.DB.prepare("SELECT started_at, ends_at, last_seen_at FROM trials WHERE device_id_hash = ?").bind(deviceIdHash).first();
+
+describe("POST /v1/trial (spec 2026-10-07 §3.1)", () => {
+  it("máy mới: ghi ngày bắt đầu theo giờ server, hết hạn sau TRIAL_DAYS (10) ngày, trả token dùng thử đã ký", async () => {
+    const w = makeWorld();
+    const d = await device(1);
+    const res = await register(w, d);
+    expect(res).toMatchObject({
+      status: 200,
+      body: { token: expect.stringMatching(/^v1\./), started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 },
+    });
+    expect(await trialRow(d)).toEqual({ started_at: T0, ends_at: T0 + 10 * DAY, last_seen_at: T0 });
+    expect(await verifyTrialToken(res.body.token as string, vectors.public_keys, { deviceIdHash: d })).toEqual({
+      ok: true,
+      claims: { typ: "trial", kid: "test-1", device_id_hash: d, started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 },
+    });
+  });
+
+  it("gọi lại (cài lại app): giữ started_at và ends_at, chỉ cập nhật last_seen_at; token mới có issued_at mới", async () => {
+    const w = makeWorld();
+    const d = await device(1);
+    await register(w, d);
+    w.clock.now = T0 + 3 * DAY;
+    const again = await register(w, d);
+    expect(again.body).toMatchObject({ started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 + 3 * DAY });
+    expect(await trialRow(d)).toEqual({ started_at: T0, ends_at: T0 + 10 * DAY, last_seen_at: T0 + 3 * DAY });
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM trials").first()).toEqual({ n: 1 });
+  });
+
+  it("dùng thử đã hết vẫn trả 200 với ends_at cũ (app cần ends_at để báo)", async () => {
+    const w = makeWorld();
+    const d = await device(1);
+    await register(w, d);
+    w.clock.now = T0 + 40 * DAY;
+    expect(await register(w, d)).toMatchObject({ status: 200, body: { started_at: T0, ends_at: T0 + 10 * DAY, issued_at: T0 + 40 * DAY } });
+  });
+
+  it("máy khác có dùng thử riêng", async () => {
+    const w = makeWorld();
+    await register(w, await device(1));
+    w.clock.now = T0 + DAY;
+    expect((await register(w, await device(2))).body).toMatchObject({ started_at: T0 + DAY, ends_at: T0 + 11 * DAY });
+  });
+
+  it("nhiều request cùng lúc của một máy: một dòng, cùng started_at", async () => {
+    const w = makeWorld();
+    const d = await device(1);
+    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => register(w, d, `198.51.100.${n}`)));
+    expect(new Set(results.map((r) => r.body.started_at))).toEqual(new Set([T0]));
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM trials").first()).toEqual({ n: 1 });
+  });
+
+  it("đổi TRIAL_DAYS chỉ áp cho máy đăng ký sau đó", async () => {
+    const d1 = await device(1);
+    await register(makeWorld(), d1);
+    const w = makeWorld({ TRIAL_DAYS: 30 });
+    expect((await register(w, d1)).body).toMatchObject({ ends_at: T0 + 10 * DAY });
+    expect((await register(w, await device(2))).body).toMatchObject({ ends_at: T0 + 30 * DAY });
+  });
+
+  it.each([
+    ["thiếu", undefined],
+    ["chữ hoa", "A".repeat(64)],
+    ["ngắn", "a".repeat(63)],
+    ["không phải chuỗi", 123],
+  ])("device_id_hash sai (%s) thì 400, không ghi gì", async (_why, value) => {
+    const res = await register(makeWorld(), value);
+    expect(res).toMatchObject({ status: 400, body: { error: "invalid_request", field: "device_id_hash" } });
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM trials").first()).toEqual({ n: 0 });
+  });
+
+  it("body không phải JSON thì 400", async () => {
+    const res = await makeWorld().call("POST", "/v1/trial", "không phải json");
+    expect(res).toMatchObject({ status: 400, body: { error: "invalid_request" } });
+  });
+
+  it.each([
+    ["thiếu", undefined],
+    ["bằng 0", 0],
+    ["quá 366", 367],
+    ["số lẻ", 10.5],
+    ["chuỗi", "10"],
+  ])("TRIAL_DAYS sai (%s) thì 503 trial_not_configured, không ghi gì", async (_why, value) => {
+    const res = await register(makeWorld({ TRIAL_DAYS: value }), await device(1));
+    expect(res).toMatchObject({ status: 503, body: { error: "trial_not_configured" } });
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM trials").first()).toEqual({ n: 0 });
+  });
+
+  it("tối đa 10 lần mỗi giờ mỗi IP, kể cả request sai; IP khác không bị ảnh hưởng; không tính vào bộ đếm thất bại", async () => {
+    const w = makeWorld();
+    const d = await device(1);
+    for (let i = 0; i < 5; i++) expect((await register(w, d)).status).toBe(200);
+    for (let i = 0; i < 5; i++) expect((await register(w, "sai")).status).toBe(400);
+    const res = await register(w, d);
+    expect(res).toMatchObject({ status: 429, body: { error: "rate_limited" } });
+    expect(res.headers.get("retry-after")).toBe("3600");
+    expect((await register(w, d, "198.51.100.7")).status).toBe(200);
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE bucket LIKE 'failure_ip:%'").first()).toEqual({ n: 0 });
+  });
+});
+
+describe("parseTrialDays", () => {
+  it("nhận số nguyên 1–366", () => {
+    expect([1, 10, 366].map(parseTrialDays)).toEqual([1, 10, 366]);
+    expect([0, 367, -1, 1.5, "10", null, undefined].map(parseTrialDays)).toEqual([null, null, null, null, null, null, null]);
+  });
+});
PATCH
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
pnpm exec vitest run test/trial.test.ts test/security.test.ts
pnpm test:scripts
```

Kết quả mong đợi: `FAIL test/trial.test.ts` (`Cannot find module '../src/trial'`), `FAIL test/security.test.ts > … input độc hại bị từ chối, bảng không đổi` (`expected 404 to be 400`). Node: `ℹ fail 1` ở `dùng thử Free 10 ngày mỗi máy (spec 2026-10-07 §3.1)`.

- [ ] **Step 3: Viết code**

```bash
git apply <<'PATCH'
diff --git a/server/src/app.ts b/server/src/app.ts
index f88d28a..22ac72d 100644
--- a/server/src/app.ts
+++ b/server/src/app.ts
@@ -7,6 +7,7 @@ import type { ApiEnv } from "./env";
 import { fail } from "./http";
 import { registerLicenses } from "./licenses";
 import { registerOrders } from "./orders";
+import { registerTrial } from "./trial";
 
 export type AppEnv = { Bindings: ApiEnv; Variables: { deps: Deps } };
 
@@ -23,6 +24,7 @@ export function createApp(makeDeps: DepsFactory = realDeps) {
   registerCheckout(app);
   registerOrders(app);
   registerLicenses(app);
+  registerTrial(app);
   app.notFound((c) => fail(c, 404, "not_found"));
   app.onError((err, c) => {
     console.error(JSON.stringify({ event: "unhandled", name: err.name, message: err.message }));
diff --git a/server/src/env.ts b/server/src/env.ts
index 64d103d..92fc0db 100644
--- a/server/src/env.ts
+++ b/server/src/env.ts
@@ -7,6 +7,8 @@ export interface ApiEnv {
   ENVIRONMENT: string;
   /** Bảng gói trả phí (src/plans.ts): hạn mức, số ngày mỗi đơn, giá theo loại tiền. Đọc bằng parsePlans. */
   PLANS?: unknown;
+  /** Số ngày dùng thử Free của mỗi máy (spec 2026-10-07 §3.1), số nguyên 1–366. Đọc bằng parseTrialDays. */
+  TRIAL_DAYS?: unknown;
   /** Ô khóa đang ký token: "a" hoặc "b" (QĐ29). Ô còn lại là khóa dự phòng. */
   TOKEN_SIGNING_SLOT: string;
   PAYOS_BASE_URL: string;
diff --git a/server/src/http.ts b/server/src/http.ts
index ef276b9..dd3f2b3 100644
--- a/server/src/http.ts
+++ b/server/src/http.ts
@@ -14,6 +14,7 @@ export type ErrorCode =
   | "invalid_signature"
   | "rate_limited"
   | "pricing_not_configured"
+  | "trial_not_configured"
   | "payment_provider_error"
   | "temporarily_unavailable"
   | "order_code_exhausted"
diff --git a/server/src/ratelimit.ts b/server/src/ratelimit.ts
index 88ff389..3746a0e 100644
--- a/server/src/ratelimit.ts
+++ b/server/src/ratelimit.ts
@@ -13,6 +13,8 @@ export const LIMITS = {
   recover_email: 3,
   recover_ip: 10,
   order_poll: 600,
+  // Đăng ký dùng thử Free (spec 2026-10-07 §3.1). Không tính vào bộ đếm thất bại.
+  trial_ip: 10,
   // Lần thất bại (key sai định dạng hay không tồn tại, activation lạ) của một IP, tính chung mọi endpoint.
   // Chạm ngưỡng thì IP đó bị chặn tới hết giờ, trừ request có key hợp lệ kèm activation đang hoạt động
   // và khớp (nhiều người dùng chung một IP qua CGNAT vẫn validate được), và có cảnh báo cho người vận hành.
diff --git a/server/src/trial.ts b/server/src/trial.ts
new file mode 100644
index 0000000..6b10b9b
--- /dev/null
+++ b/server/src/trial.ts
@@ -0,0 +1,50 @@
+// POST /v1/trial (spec 2026-10-07 §3.1): đăng ký dùng thử Free theo máy. Mỗi máy (device_id_hash) có đúng một dòng,
+// giữ mãi, nên cài lại app, xóa dữ liệu hay xóa kho khóa đều không mở lại được dùng thử.
+import type { Hono } from "hono";
+import type { AppEnv } from "./app";
+import { clientIp, fail, parseDeviceIdHash, readJson, tooMany } from "./http";
+import { DAY_SECONDS } from "./plans";
+import { hit } from "./ratelimit";
+import { signTrialToken } from "./token";
+
+/** Đọc biến TRIAL_DAYS: số nguyên 1–366. Thiếu hay sai thì null (route trả 503 trial_not_configured). */
+export function parseTrialDays(raw: unknown): number | null {
+  return Number.isSafeInteger(raw) && (raw as number) >= 1 && (raw as number) <= 366 ? (raw as number) : null;
+}
+
+export function registerTrial(app: Hono<AppEnv>) {
+  app.post("/v1/trial", async (c) => {
+    const deps = c.get("deps");
+    const db = c.env.DB;
+    const now = deps.now();
+    const rl = await hit(c.env, "trial_ip", clientIp(c), now);
+    if (!rl.allowed) return tooMany(c, rl.retryAfter);
+    const body = await readJson(c);
+    const deviceIdHash = parseDeviceIdHash(body?.device_id_hash);
+    if (!deviceIdHash) return fail(c, 400, "invalid_request", { field: "device_id_hash" });
+    const days = parseTrialDays(c.env.TRIAL_DAYS);
+    if (days === null) return fail(c, 503, "trial_not_configured");
+    // Một câu lệnh: máy mới thì tạo dòng; máy đã có thì chỉ cập nhật last_seen_at, giữ started_at và ends_at. Hai request
+    // cùng lúc của một máy vẫn ra đúng một dòng, và cả hai đọc được cùng started_at.
+    const row = await db
+      .prepare(
+        `INSERT INTO trials (device_id_hash, started_at, ends_at, last_seen_at) VALUES (?1, ?2, ?3, ?2)
+         ON CONFLICT (device_id_hash) DO UPDATE SET last_seen_at = excluded.last_seen_at
+         RETURNING started_at, ends_at`,
+      )
+      .bind(deviceIdHash, now, now + days * DAY_SECONDS)
+      .first<{ started_at: number; ends_at: number }>();
+    if (!row) throw new Error("không ghi được dòng dùng thử");
+    const key = await deps.signingKey();
+    const claims = {
+      typ: "trial" as const,
+      kid: key.kid,
+      device_id_hash: deviceIdHash,
+      started_at: row.started_at,
+      ends_at: row.ends_at,
+      issued_at: now,
+    };
+    const token = await signTrialToken(key, claims);
+    return c.json({ token, started_at: claims.started_at, ends_at: claims.ends_at, issued_at: now });
+  });
+}
diff --git a/server/wrangler.jsonc b/server/wrangler.jsonc
index 93b6731..c1bf2d6 100644
--- a/server/wrangler.jsonc
+++ b/server/wrangler.jsonc
@@ -29,6 +29,8 @@
       "monthly": { "quota_minutes_per_cycle": 3000, "days_per_order": 30, "prices": { "VND": 50000 } },
       "yearly": { "quota_minutes_per_cycle": null, "days_per_order": 365, "prices": { "VND": 500000 } }
     },
+    // Số ngày dùng thử Free của mỗi máy (spec 2026-10-07 §3.1). Đổi chỉ áp cho máy đăng ký sau đó.
+    "TRIAL_DAYS": 10,
     // Ô khóa đang ký token: secret TOKEN_SIGNING_KEY_A hay _B (QĐ29). Ô kia là khóa dự phòng.
     // Đổi khóa: đặt sang ô kia rồi deploy (Phụ lục A); giá trị khóa không đi qua máy người vận hành.
     "TOKEN_SIGNING_SLOT": "a"
PATCH
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
pnpm exec vitest run test/trial.test.ts test/security.test.ts
pnpm check
```

Kết quả mong đợi: Lệnh đầu `Tests  21 passed (21)`. `pnpm check` thoát mã 0: `Test Files  20 passed (20)`, `Tests  396 passed (396)`, Node `ℹ pass 13`, `ℹ fail 0` (1 bỏ qua).

- [ ] **Step 5: Kiểm khớp cây tham chiếu rồi commit**

```bash
git add -A server
git diff --cached --stat d8d4a5a -- server   # phải không in gì
git commit -m "feat(server): POST /v1/trial, dùng thử Free theo máy, TRIAL_DAYS = 10

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 5: Mỗi key một máy: key_in_use, allow_conflict, license_conflict

**Commit tham chiếu:** `01d5cd4` (nhánh `ref-bg01`).

**Files:**
- Modify: `server/src/http.ts`
- Modify: `server/src/licenses.ts`
- Modify: `server/test/licenses.test.ts`
- Modify: `server/test/world.ts`

Luật spec mục 4.1 trong `src/licenses.ts`:
- `MAX_DEVICES = 1`, `MAX_DEVICES_IN_CONFLICT = 2`. Điều kiện đếm suất vẫn nằm trong câu `INSERT`/`UPDATE` (giới hạn là 2 khi `allow_conflict: true`, ngược lại 1), nên kích hoạt chạy cùng lúc không vượt được.
- `activate`: máy đang kích hoạt → token, hoặc `409 license_conflict` nếu license đang có từ 2 máy; máy chưa kích hoạt → luật khóa tạm (`423`) trước, rồi: không ai giữ key → kích hoạt; có máy khác và không `allow_conflict` (hoặc đã đủ 2 máy) → `409 key_in_use` kèm `devices` (không đổi gì); có máy khác và `allow_conflict` → kích hoạt, ghi `audit_log` `license_conflict` (`{activation_id, devices: 2}`), trả `409 license_conflict` kèm `devices` của cả hai máy.
- `validate`: sau các kiểm cũ, license đang xung đột → ghi `last_validated_at` rồi `409 license_conflict`.
- `deactivate`: không đổi (đã gỡ được mọi activation đang kích hoạt của key, từ máy nào cũng được).
- `devices` = `[{activation_id, device_label, last_validated_at}]` theo thứ tự tạo.

Test: test cũ "đủ 2 máy", "máy thứ 3", xoay vòng suất, CGNAT viết lại theo một máy; "Khách B" trong `test/world.ts` giờ có hai máy đang kích hoạt nhờ `allow_conflict` (đang xung đột); thêm nhóm test "mỗi key một máy, trùng máy thì xung đột", trong đó có test hai máy gỡ qua gỡ lại bị `423` (lúc này ngưỡng khóa tạm còn là 3, nên sau 8 lần gỡ; Task 8 hạ ngưỡng xuống 2 và viết lại các test này, "Điều chỉnh" mục 4).

- [ ] **Step 1: Viết test (red)**

```bash
git apply <<'PATCH'
diff --git a/server/test/licenses.test.ts b/server/test/licenses.test.ts
index 7d49428..f537f31 100644
--- a/server/test/licenses.test.ts
+++ b/server/test/licenses.test.ts
@@ -15,16 +15,18 @@ const UNKNOWN_KEY = "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5";
 async function setup(plan = "monthly") {
   const w = makeWorld();
   const { licenseKey } = await w.buy({ plan });
-  const activate = async (n: number, ip = `198.51.100.${n}`) =>
+  const activate = async (n: number, ip = `198.51.100.${n}`, extra: Record<string, unknown> = {}) =>
     w.call(
       "POST",
       "/v1/licenses/activate",
-      { key: licenseKey, device_id_hash: await device(n), device_label: `Máy ${n}` },
+      { key: licenseKey, device_id_hash: await device(n), device_label: `Máy ${n}`, ...extra },
       { "cf-connecting-ip": ip },
     );
+  /** Kích hoạt sau khi người dùng xác nhận "Vẫn kích hoạt trên máy này" (spec 2026-10-07 §4.2). */
+  const activateAnyway = (n: number) => activate(n, `198.51.100.${n}`, { allow_conflict: true });
   const deactivate = (activationId: string) =>
     w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: activationId });
-  return { w, licenseKey, activate, deactivate };
+  return { w, licenseKey, activate, activateAnyway, deactivate };
 }
 
 describe("activate", () => {
@@ -106,40 +108,44 @@ describe("activate", () => {
     expect(log.results).toEqual([{ action: "activated" }, { action: "reactivated" }]);
   });
 
-  it("máy cũ kích hoạt lại vẫn chiếm suất: đủ 2 máy thì 409", async () => {
+  it("máy cũ kích hoạt lại khi máy khác đang giữ key: 409 key_in_use", async () => {
     const { activate, deactivate } = await setup();
     const a1 = await activate(1);
     await deactivate(a1.body.activation_id as string);
-    await activate(2);
-    await activate(3);
-    expect(await activate(1)).toMatchObject({ status: 409, body: { error: "device_limit" } });
+    expect((await activate(2)).status).toBe(200);
+    expect(await activate(1)).toMatchObject({ status: 409, body: { error: "key_in_use" } });
   });
 
-  it("máy thứ 3 bị 409 kèm danh sách máy; gỡ từ xa một máy rồi kích hoạt được", async () => {
+  it("máy thứ hai nhận 409 key_in_use kèm máy đang giữ key, không đổi gì; gỡ máy kia từ xa rồi kích hoạt được", async () => {
     const { w, activate, deactivate } = await setup();
     const a1 = await activate(1);
     w.clock.now = T0 + 100;
-    await activate(2);
-    const third = await activate(3);
-    expect(third.status).toBe(409);
-    expect(third.body).toEqual({
-      error: "device_limit",
-      activations: [
-        { activation_id: a1.body.activation_id, device_label: "Máy 1", last_validated_at: T0 },
-        { activation_id: expect.any(String), device_label: "Máy 2", last_validated_at: T0 + 100 },
-      ],
+    const second = await activate(2);
+    expect(second).toMatchObject({
+      status: 409,
+      body: { error: "key_in_use", devices: [{ activation_id: a1.body.activation_id, device_label: "Máy 1", last_validated_at: T0 }] },
     });
+    expect(Object.keys(second.body).sort()).toEqual(["devices", "error"]);
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first()).toEqual({ n: 1 });
     expect((await deactivate(a1.body.activation_id as string)).body).toEqual({ ok: true });
-    expect((await activate(3)).status).toBe(200);
+    expect((await activate(2)).status).toBe(200);
   });
 
-  it("hai máy mới kích hoạt cùng lúc khi còn một suất: chỉ một máy được", async () => {
+  it("hai máy mới kích hoạt cùng lúc khi chưa máy nào giữ key: chỉ một máy được, máy kia key_in_use", async () => {
     const { activate } = await setup();
-    await activate(1);
     const [x, y] = await Promise.all([activate(2), activate(3)]);
+    expect([x.body.error, y.body.error].sort()).toEqual(["key_in_use", undefined].sort());
     expect([x.status, y.status].sort()).toEqual([200, 409]);
   });
 
+  it("allow_conflict phải là boolean", async () => {
+    const { activate } = await setup();
+    expect(await activate(1, "198.51.100.1", { allow_conflict: "true" })).toMatchObject({
+      status: 400,
+      body: { error: "invalid_request", field: "allow_conflict" },
+    });
+  });
+
   it("gỡ hơn 3 máy trong 30 ngày rồi kích hoạt máy mới thì khóa tạm key (423) và có cảnh báo", async () => {
     const { w, activate, deactivate } = await setup();
     for (let i = 1; i <= 4; i++) {
@@ -190,42 +196,40 @@ describe("activate", () => {
     expect((await activate(2)).status).toBe(423);
   });
 
-  it("xoay vòng 2 suất giữa 5 máy: bị khóa sau vài lượt, rồi mọi máy không đang kích hoạt đều bị 423", async () => {
+  it("xoay vòng một suất giữa 5 máy: bị khóa ở lượt 4, rồi mọi máy không đang kích hoạt đều bị 423", async () => {
     const { w, activate, deactivate } = await setup();
-    const active: { n: number; id: string }[] = [];
-    for (const n of [1, 2]) active.push({ n, id: (await activate(n)).body.activation_id as string });
-    const order = [3, 4, 5, 1, 2, 3, 4, 5];
+    let active = { n: 1, id: (await activate(1)).body.activation_id as string };
+    const order = [2, 3, 4, 5, 1, 2];
     let lockedAt = -1;
     for (let i = 0; i < order.length; i++) {
       w.clock.now = T0 + (i + 1) * 3600;
-      const out = active.shift()!;
-      await deactivate(out.id);
+      await deactivate(active.id);
       const r = await activate(order[i]!);
       if (r.status === 423) {
         lockedAt = i;
         break;
       }
       expect(r.status).toBe(200);
-      active.push({ n: order[i]!, id: r.body.activation_id as string });
+      active = { n: order[i]!, id: r.body.activation_id as string };
     }
-    // Lượt 4 (máy 1 quay lại): đã gỡ máy 1, 2, 3, 4; trừ máy 1 còn 3 lần, chưa quá 3.
-    // Lượt 5 (máy 2 quay lại): đã gỡ máy 1, 2, 3, 4, 5; trừ máy 2 còn 4 lần, nên khóa.
-    expect(lockedAt).toBe(4);
-    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 5 * 3600 });
-    // Máy 1 đang kích hoạt vẫn dùng được; các máy khác (từng dùng hay mới) đều bị 423.
-    expect((await activate(1)).status).toBe(200);
-    for (const n of [2, 3, 5, 9]) expect((await activate(n)).status).toBe(423);
+    // Lượt 3 (máy 4): đã gỡ máy 1, 2, 3; trừ máy 4 còn 3 lần, chưa quá 3.
+    // Lượt 4 (máy 5): đã gỡ máy 1, 2, 3, 4; trừ máy 5 còn 4 lần, nên khóa.
+    expect(lockedAt).toBe(3);
+    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 4 * 3600 });
+    // Không còn máy nào đang kích hoạt; mọi máy (từng dùng hay mới) đều bị 423.
+    for (const n of [1, 2, 3, 4, 5, 9]) expect((await activate(n)).status).toBe(423);
   });
 
-  it("key đang bị khóa tạm: máy mới và máy từng kích hoạt đều bị 423; máy đang kích hoạt vẫn dùng được", async () => {
-    const { w, licenseKey, activate, deactivate } = await setup();
-    const a1 = await activate(1);
+  it("key đang bị khóa tạm: máy mới và máy từng kích hoạt đều bị 423, kể cả khi xác nhận xung đột; máy đang kích hoạt vẫn dùng được", async () => {
+    const { w, licenseKey, activate, activateAnyway, deactivate } = await setup();
     const a2 = await activate(2);
     await deactivate(a2.body.activation_id as string);
+    const a1 = await activate(1);
     await env.DB.prepare("UPDATE licenses SET locked_at = ?").bind(T0).run();
     w.clock.now = T0 + 60;
     expect(await activate(3)).toMatchObject({ status: 423, body: { error: "license_locked" } });
     expect(await activate(2)).toMatchObject({ status: 423, body: { error: "license_locked" } });
+    expect(await activateAnyway(3)).toMatchObject({ status: 423, body: { error: "license_locked" } });
     expect((await activate(1)).status).toBe(200);
     const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a1.body.activation_id });
     expect(v.status).toBe(200);
@@ -300,6 +304,124 @@ describe("activate", () => {
   });
 });
 
+describe("mỗi key một máy, trùng máy thì xung đột (spec 2026-10-07 §4.1)", () => {
+  const activeCount = () => env.DB.prepare("SELECT COUNT(*) AS n FROM activations WHERE deactivated_at IS NULL").first();
+  const idOf = async (n: number) =>
+    (await env.DB.prepare("SELECT id FROM activations WHERE device_id_hash = ?").bind(await device(n)).first<{ id: string }>())!.id;
+
+  it("allow_conflict khi chưa máy nào giữ key: kích hoạt bình thường, có token", async () => {
+    const { activateAnyway } = await setup();
+    const res = await activateAnyway(1);
+    expect(res.status).toBe(200);
+    expect(res.body.token).toMatch(/^v1\./);
+  });
+
+  it("allow_conflict khi máy khác giữ key: máy này vào, 409 license_conflict liệt kê cả hai máy, không cấp token, ghi nhật ký", async () => {
+    const { w, activate, activateAnyway } = await setup();
+    const a1 = await activate(1);
+    w.clock.now = T0 + 100;
+    const res = await activateAnyway(2);
+    expect(res).toEqual({
+      status: 409,
+      headers: expect.anything(),
+      body: {
+        error: "license_conflict",
+        devices: [
+          { activation_id: a1.body.activation_id, device_label: "Máy 1", last_validated_at: T0 },
+          { activation_id: await idOf(2), device_label: "Máy 2", last_validated_at: T0 + 100 },
+        ],
+      },
+    });
+    expect(await activeCount()).toEqual({ n: 2 });
+    const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'license_conflict'").all<{ detail: string }>();
+    expect(log.results.map((r) => JSON.parse(r.detail))).toEqual([{ activation_id: await idOf(2), devices: 2 }]);
+  });
+
+  it("đang xung đột: validate của cả hai máy và kích hoạt lại máy đang kích hoạt đều 409 license_conflict; lần kiểm gần nhất vẫn được ghi", async () => {
+    const { w, licenseKey, activate, activateAnyway } = await setup();
+    const a1 = await activate(1);
+    await activateAnyway(2);
+    w.clock.now = T0 + DAY;
+    for (const id of [a1.body.activation_id, await idOf(2)]) {
+      const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: id });
+      expect(v).toMatchObject({ status: 409, body: { error: "license_conflict" } });
+      expect(v.body).not.toHaveProperty("token");
+    }
+    expect((await env.DB.prepare("SELECT last_validated_at FROM activations ORDER BY created_at").all()).results).toEqual([
+      { last_validated_at: T0 + DAY },
+      { last_validated_at: T0 + DAY },
+    ]);
+    expect(await activate(1)).toMatchObject({ status: 409, body: { error: "license_conflict" } });
+    expect(await activateAnyway(2)).toMatchObject({ status: 409, body: { error: "license_conflict" } });
+    expect(await activeCount()).toEqual({ n: 2 });
+  });
+
+  it("máy thứ ba khi đang xung đột: key_in_use liệt kê 2 máy, kể cả khi xác nhận; không tạo dòng nào", async () => {
+    const { activate, activateAnyway } = await setup();
+    await activate(1);
+    await activateAnyway(2);
+    for (const res of [await activate(3), await activateAnyway(3)]) {
+      expect(res).toMatchObject({ status: 409, body: { error: "key_in_use" } });
+      expect((res.body.devices as { device_label: string }[]).map((d) => d.device_label)).toEqual(["Máy 1", "Máy 2"]);
+    }
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first()).toEqual({ n: 2 });
+  });
+
+  it("một máy tự gỡ thì hết xung đột: máy còn lại validate nhận token", async () => {
+    const { w, licenseKey, activate, activateAnyway, deactivate } = await setup();
+    const a1 = await activate(1);
+    await activateAnyway(2);
+    expect((await deactivate(await idOf(2))).body).toEqual({ ok: true });
+    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a1.body.activation_id });
+    expect(v.status).toBe(200);
+    expect(v.body.token).toMatch(/^v1\./);
+  });
+
+  it("máy mới gỡ máy cũ từ xa khi đang xung đột: máy mới validate nhận token, máy cũ về 404", async () => {
+    const { w, licenseKey, activate, activateAnyway, deactivate } = await setup();
+    const a1 = await activate(1);
+    await activateAnyway(2);
+    expect((await deactivate(a1.body.activation_id as string)).body).toEqual({ ok: true });
+    expect((await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: await idOf(2) })).status).toBe(200);
+    expect(await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a1.body.activation_id })).toMatchObject({
+      status: 404,
+      body: { error: "activation_not_found" },
+    });
+  });
+
+  it("hai người dùng chung key gỡ qua gỡ lại: luật khóa tạm chặn sau khi mỗi máy bị gỡ 4 lần trong 30 ngày", async () => {
+    const { w, activate, activateAnyway, deactivate } = await setup();
+    await activate(1);
+    // Mỗi lượt: máy `inn` xác nhận xung đột rồi gỡ máy `out` từ xa.
+    let removals = 0;
+    let lockedAfter = -1;
+    for (let i = 0; i < 10; i++) {
+      const [inn, out] = i % 2 === 0 ? [2, 1] : [1, 2];
+      w.clock.now = T0 + (i + 1) * 3600;
+      const r = await activateAnyway(inn);
+      if (r.status === 423) {
+        lockedAfter = removals;
+        break;
+      }
+      expect(r).toMatchObject({ status: 409, body: { error: "license_conflict" } });
+      await deactivate(await idOf(out));
+      removals++;
+    }
+    // Luật đếm trừ các lần gỡ chính máy đang xin kích hoạt (§10.2), nên máy xin kích hoạt bị chặn khi máy kia đã bị gỡ
+    // 4 lần: tổng 8 lần gỡ.
+    expect(lockedAfter).toBe(8);
+    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
+  });
+
+  it("hai máy cùng xác nhận xung đột một lúc khi key đang ở máy 1: tối đa 2 máy đang kích hoạt", async () => {
+    const { activate, activateAnyway } = await setup();
+    await activate(1);
+    const results = await Promise.all([activateAnyway(2), activateAnyway(3)]);
+    expect(results.map((r) => r.body.error).sort()).toEqual(["key_in_use", "license_conflict"]);
+    expect(await activeCount()).toEqual({ n: 2 });
+  });
+});
+
 describe("quota_fresh (QĐ35)", () => {
   const validate = (w: ReturnType<typeof makeWorld>, key: string, id: unknown) =>
     w.call("POST", "/v1/licenses/validate", { key, activation_id: id });
@@ -572,19 +694,23 @@ describe("validate", () => {
   });
 
   it("CGNAT: IP đang bị chặn vẫn validate và deactivate được với key hợp lệ kèm activation đang hoạt động", async () => {
-    const { w, activate, licenseKey } = await setup();
+    const { w, activate, activateAnyway, licenseKey } = await setup();
     const a = await activate(1);
-    const b = await activate(2);
+    await activateAnyway(2);
+    const b = (await env.DB.prepare("SELECT id FROM activations WHERE device_id_hash = ?").bind(await device(2)).first<{ id: string }>())!;
     const ip = { "cf-connecting-ip": "203.0.113.77" };
     for (let i = 0; i < 60; i++) await w.call("POST", "/v1/licenses/validate", { key: `SAI-${i}`, activation_id: a.body.activation_id }, ip);
     expect((await w.call("POST", "/v1/licenses/validate", { key: "SAI", activation_id: a.body.activation_id }, ip)).status).toBe(429);
+    // Qua được lớp chặn IP; key đang xung đột nên 409, không phải 429.
+    const conflicted = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id }, ip);
+    expect(conflicted).toMatchObject({ status: 409, body: { error: "license_conflict" } });
+    const off = await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: b.id }, ip);
+    expect(off).toMatchObject({ status: 200, body: { ok: true } });
     const ok = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id }, ip);
     expect(ok.status).toBe(200);
     expect(ok.body.token).toMatch(/^v1\./);
-    const off = await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: b.body.activation_id }, ip);
-    expect(off).toMatchObject({ status: 200, body: { ok: true } });
     // Activation vừa gỡ không còn hoạt động: từ IP đang bị chặn thì 429.
-    expect((await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: b.body.activation_id }, ip)).status).toBe(429);
+    expect((await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: b.id }, ip)).status).toBe(429);
     // IP khác không bị ảnh hưởng.
     expect((await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id })).status).toBe(200);
   });
@@ -606,10 +732,10 @@ describe("deactivate", () => {
 
   it("kích hoạt lại dùng lại dòng cũ nhưng các lần gỡ trước vẫn tính vào luật khóa tạm", async () => {
     const { w, activate, deactivate } = await setup();
-    // Xoay 2 suất giữa 3 máy: mỗi máy quay lại dùng lại dòng của nó.
+    // Xoay một suất giữa 3 máy: mỗi máy quay lại dùng lại dòng của nó.
     const ids = new Map<number, string>();
-    for (const n of [1, 2]) ids.set(n, (await activate(n)).body.activation_id as string);
-    const rotation: [number, number][] = [[1, 3], [2, 1], [3, 2], [1, 3]];
+    ids.set(1, (await activate(1)).body.activation_id as string);
+    const rotation: [number, number][] = [[1, 2], [2, 3], [3, 1], [1, 2]];
     const statuses: number[] = [];
     for (const [i, [out, inn]] of rotation.entries()) {
       w.clock.now = T0 + (i + 1) * 3600;
@@ -618,7 +744,7 @@ describe("deactivate", () => {
       statuses.push(r.status);
       if (r.status === 200) ids.set(inn, r.body.activation_id as string);
     }
-    // Lượt 4 (máy 3 quay lại): đã gỡ máy 1, 2, 3, 1; trừ máy 3 còn 3 lần. Chưa quá 3 nên vẫn được.
+    // Lượt 4 (máy 2 quay lại): đã gỡ máy 1, 2, 3, 1; trừ máy 2 còn 3 lần. Chưa quá 3 nên vẫn được.
     expect(statuses).toEqual([200, 200, 200, 200]);
     w.clock.now = T0 + 5 * 3600;
     await deactivate(ids.get(2)!);
@@ -663,20 +789,21 @@ describe("hai khách: không đụng license, máy hay bộ đếm của khách
       .all()
       .then((r) => r.results);
 
-  it("B có 2 máy đang kích hoạt: A vẫn kích hoạt được 2 máy; máy thứ 3 của A bị 409 chỉ liệt kê máy của A", async () => {
-    const { w, activate } = await setup();
+  it("B đang xung đột (2 máy): A vẫn kích hoạt được; máy thứ hai của A nhận key_in_use, rồi license_conflict, chỉ liệt kê máy của A", async () => {
+    const { w, activate, activateAnyway } = await setup();
     const b = await w.customerB();
     const a1 = await activate(1);
-    const a2 = await activate(2);
-    expect([a1.status, a2.status]).toEqual([200, 200]);
-    const third = await activate(3);
-    expect(third).toMatchObject({ status: 409, body: { error: "device_limit" } });
-    const listed = (third.body.activations as { activation_id: string; device_label: string }[]).map((a) => [a.activation_id, a.device_label]);
-    expect(listed).toEqual([
-      [a1.body.activation_id, "Máy 1"],
-      [a2.body.activation_id, "Máy 2"],
-    ]);
-    for (const act of [...b.active, ...b.deactivated]) expect(JSON.stringify(third.body)).not.toContain(act.id);
+    expect(a1.status).toBe(200);
+    const second = await activate(2);
+    expect(second).toMatchObject({ status: 409, body: { error: "key_in_use" } });
+    const listed = (second.body.devices as { activation_id: string; device_label: string }[]).map((a) => [a.activation_id, a.device_label]);
+    expect(listed).toEqual([[a1.body.activation_id, "Máy 1"]]);
+    const anyway = await activateAnyway(2);
+    expect(anyway).toMatchObject({ status: 409, body: { error: "license_conflict" } });
+    expect((anyway.body.devices as { device_label: string }[]).map((d) => d.device_label)).toEqual(["Máy 1", "Máy 2"]);
+    for (const res of [second, anyway]) {
+      for (const act of [...b.active, ...b.deactivated]) expect(JSON.stringify(res.body)).not.toContain(act.id);
+    }
   });
 
   it("B có 4 lần tự gỡ trong 30 ngày: A kích hoạt máy mới không bị khóa", async () => {
@@ -698,6 +825,8 @@ describe("hai khách: không đụng license, máy hay bộ đếm của khách
       expect(ids.has(res.body.activation_id as string)).toBe(false);
       const claims = await verifyToken(res.body.token as string, vectors.public_keys, { now: T0, deviceIdHash: hash });
       expect(claims).toMatchObject({ ok: true, claims: { activation_id: res.body.activation_id } });
+      // Mỗi key một máy: gỡ máy này của A trước khi thử máy kế tiếp.
+      await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: res.body.activation_id });
     }
     expect(await rowsOf(b.licenseId)).toEqual(before);
     const lic = await env.DB.prepare("SELECT id FROM licenses WHERE id <> ?").bind(b.licenseId).first<{ id: string }>();
diff --git a/server/test/world.ts b/server/test/world.ts
index b776699..bd1a1e4 100644
--- a/server/test/world.ts
+++ b/server/test/world.ts
@@ -88,18 +88,25 @@ export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
 
   /**
    * "Khách B" (review cuối, Q1): một khách khác, để test ranh giới giữa các license và email. B mua bằng email riêng, có
-   * 2 máy đang kích hoạt, 3 máy đã gỡ, và 4 lần tự gỡ trong 30 ngày (hơn ngưỡng 3 của luật khóa tạm). B không bị khóa,
-   * vì máy cuối kích hoạt lại là máy B tự gỡ. Mọi request của B đi từ IP riêng, không đụng bộ đếm của test.
+   * 2 máy đang kích hoạt (đang xung đột, spec 2026-10-07 §4.1: máy 2 xác nhận "Vẫn kích hoạt"), 3 máy đã gỡ, và 4 lần tự
+   * gỡ trong 30 ngày (hơn ngưỡng 3 của luật khóa tạm). B không bị khóa, vì máy cuối kích hoạt lại là máy B tự gỡ. Mọi
+   * request của B đi từ IP riêng, không đụng bộ đếm của test.
    */
   async function customerB() {
     const email = "khach-b@example.com";
     const { licenseKey } = await buy({ email, plan: "yearly" });
+    const lic = await testEnv.DB.prepare("SELECT id FROM licenses WHERE email = ?").bind(email).first<{ id: string }>();
     const device = (n: number) => sha256Hex(`khach-b-${n}`);
     const ip = (n: number) => ({ "cf-connecting-ip": `192.0.2.${n}` });
-    const activate = async (n: number) => {
-      const r = await call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await device(n), device_label: `Máy B${n}` }, ip(n));
-      if (r.status !== 200) throw new Error(`khách B kích hoạt máy ${n}: ${r.status} ${JSON.stringify(r.body)}`);
-      return r.body.activation_id as string;
+    const activate = async (n: number, allowConflict = false) => {
+      const body = { key: licenseKey, device_id_hash: await device(n), device_label: `Máy B${n}`, allow_conflict: allowConflict };
+      const r = await call("POST", "/v1/licenses/activate", body, ip(n));
+      const ok = allowConflict ? r.status === 409 && r.body.error === "license_conflict" : r.status === 200;
+      if (!ok) throw new Error(`khách B kích hoạt máy ${n}: ${r.status} ${JSON.stringify(r.body)}`);
+      const row = await testEnv.DB.prepare("SELECT id FROM activations WHERE license_id = ? AND device_id_hash = ?")
+        .bind(lic!.id, await device(n))
+        .first<{ id: string }>();
+      return row!.id;
     };
     const deactivate = async (id: string, n: number) => {
       const r = await call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: id }, ip(n));
@@ -112,11 +119,10 @@ export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
       deactivated.push({ id, deviceIdHash: await device(n) });
     }
     const b1 = await activate(1);
-    const b2 = await activate(2);
+    const b2 = await activate(2, true);
     // Lần gỡ thứ 4 rồi kích hoạt lại đúng máy đó: trừ chính máy này thì còn 3 lần, chưa quá ngưỡng.
     await deactivate(b2, 2);
-    if ((await activate(2)) !== b2) throw new Error("khách B: máy 2 không dùng lại activation cũ");
-    const lic = await testEnv.DB.prepare("SELECT id FROM licenses WHERE email = ?").bind(email).first<{ id: string }>();
+    if ((await activate(2, true)) !== b2) throw new Error("khách B: máy 2 không dùng lại activation cũ");
     return {
       email,
       licenseKey,
PATCH
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
pnpm exec vitest run test/licenses.test.ts
```

Kết quả mong đợi: `Tests  15 failed | 43 passed (58)` (server còn trả `device_limit` / `200` cho máy thứ hai).

- [ ] **Step 3: Viết code**

```bash
git apply <<'PATCH'
diff --git a/server/src/http.ts b/server/src/http.ts
index dd3f2b3..1792c7e 100644
--- a/server/src/http.ts
+++ b/server/src/http.ts
@@ -8,7 +8,8 @@ export type ErrorCode =
   | "license_revoked"
   | "license_expired"
   | "license_locked"
-  | "device_limit"
+  | "key_in_use"
+  | "license_conflict"
   | "activation_not_found"
   | "order_not_found"
   | "invalid_signature"
diff --git a/server/src/licenses.ts b/server/src/licenses.ts
index 863ef15..8e37676 100644
--- a/server/src/licenses.ts
+++ b/server/src/licenses.ts
@@ -1,4 +1,5 @@
-// /v1/licenses/* (§6.8, §10.2): kích hoạt tối đa 2 máy, làm mới token, gỡ máy, gửi lại key.
+// /v1/licenses/* (§6.8, §10.2, spec 2026-10-07 §4.1): mỗi key một máy, trùng máy thì xung đột; làm mới token, gỡ máy,
+// gửi lại key.
 import type { Context, Hono } from "hono";
 import { alertIfChanged } from "./alerts";
 import type { AppEnv } from "./app";
@@ -10,7 +11,12 @@ import { PLAN_NAMES, type PlanCode, type PlanTable, parsePlans } from "./plans";
 import { failureBlock, hit, noteFailure } from "./ratelimit";
 import { REFRESH_WINDOW_SECONDS, signToken } from "./token";
 
-export const MAX_DEVICES = 2;
+/**
+ * Mỗi key dùng trên 1 máy (spec 2026-10-07 §4.1). Máy thứ hai chỉ vào được khi người dùng xác nhận (`allow_conflict`),
+ * và khi đó license có 2 máy đang kích hoạt: trạng thái xung đột, không máy nào nhận token cho tới khi một máy gỡ.
+ */
+export const MAX_DEVICES = 1;
+export const MAX_DEVICES_IN_CONFLICT = 2;
 /** Trong 30 ngày có hơn 3 lần gỡ (kể cả gỡ từ xa) rồi kích hoạt máy khác thì khóa tạm key (§10.2). */
 export const DEACTIVATION_WINDOW_SECONDS = 30 * 86400;
 export const MAX_DEACTIVATIONS_IN_WINDOW = 3;
@@ -123,6 +129,17 @@ async function activeActivations(db: D1Database, licenseId: string): Promise<Act
   return results;
 }
 
+/** Danh sách máy trong `409 key_in_use` và `409 license_conflict` (hợp đồng server–app, kế hoạch 00). */
+function devicesOf(list: ActivationRow[]) {
+  return list.map((a) => ({ activation_id: a.id, device_label: a.device_label, last_validated_at: a.last_validated_at }));
+}
+
+/** Xung đột: license có từ 2 máy đang kích hoạt (spec 2026-10-07 §4.1). Trả response 409, hay null nếu không xung đột. */
+async function conflict(c: Context<AppEnv>, licenseId: string) {
+  const list = await activeActivations(c.env.DB, licenseId);
+  return list.length > MAX_DEVICES ? fail(c, 409, "license_conflict", { devices: devicesOf(list) }) : null;
+}
+
 async function activeById(db: D1Database, activationId: string, licenseId: string) {
   return db
     .prepare(`SELECT ${ACT_COLUMNS} FROM activations WHERE id = ? AND license_id = ? AND deactivated_at IS NULL`)
@@ -161,6 +178,8 @@ export function registerLicenses(app: Hono<AppEnv>) {
     const deviceIdHash = parseDeviceIdHash(body?.device_id_hash);
     const deviceLabel = parseDeviceLabel(body?.device_label);
     if (!body || !deviceIdHash || !deviceLabel) return fail(c, 400, "invalid_request");
+    const allowConflict = body.allow_conflict ?? false;
+    if (typeof allowConflict !== "boolean") return fail(c, 400, "invalid_request", { field: "allow_conflict" });
     const found = await findLicense(db, body.key);
     if (!found.ok || !found.lic) {
       await noteFailure(c.env, ip, now, "activate");
@@ -174,12 +193,12 @@ export function registerLicenses(app: Hono<AppEnv>) {
 
     const row = await rowFor(db, lic.id, deviceIdHash);
     if (row && row.deactivated_at === null) {
-      // Cài lại app trên cùng máy: dùng lại activation, không tốn suất.
+      // Cài lại app trên cùng máy: dùng lại activation, không tốn suất. Đang xung đột thì không cấp token.
       await db
         .prepare("UPDATE activations SET device_label = ?, last_validated_at = ? WHERE id = ?")
         .bind(deviceLabel, now, row.id)
         .run();
-      return c.json(await issueToken(db, deps, plans, lic, row));
+      return (await conflict(c, lic.id)) ?? c.json(await issueToken(db, deps, plans, lic, row));
     }
 
     // Mọi máy không đang kích hoạt, kể cả máy từng dùng key này, đều qua kiểm khóa tạm (QĐ10).
@@ -212,8 +231,10 @@ export function registerLicenses(app: Hono<AppEnv>) {
       return fail(c, 423, "license_locked");
     }
 
-    // Điều kiện đếm suất nằm ngay trong câu lệnh, nên hai máy kích hoạt cùng lúc không vượt được 2 suất.
-    const slotFree = `(SELECT COUNT(*) FROM activations WHERE license_id = ?2 AND deactivated_at IS NULL) < ${MAX_DEVICES}`;
+    // Điều kiện đếm suất nằm ngay trong câu lệnh, nên hai máy kích hoạt cùng lúc không vượt được số máy cho phép:
+    // 1 máy, hay 2 máy khi người dùng đã xác nhận vào trạng thái xung đột (allow_conflict).
+    const limit = allowConflict ? MAX_DEVICES_IN_CONFLICT : MAX_DEVICES;
+    const slotFree = `(SELECT COUNT(*) FROM activations WHERE license_id = ?2 AND deactivated_at IS NULL) < ${limit}`;
     let changed: D1Result;
     let action: string;
     let activationId: string;
@@ -244,17 +265,25 @@ export function registerLicenses(app: Hono<AppEnv>) {
     }
     if (changed.meta.changes !== 1) {
       const raced = await rowFor(db, lic.id, deviceIdHash);
-      if (raced && raced.deactivated_at === null) return c.json(await issueToken(db, deps, plans, lic, raced));
-      const list = await activeActivations(db, lic.id);
-      return fail(c, 409, "device_limit", {
-        activations: list.map((a) => ({
-          activation_id: a.id,
-          device_label: a.device_label,
-          last_validated_at: a.last_validated_at,
-        })),
-      });
+      if (raced && raced.deactivated_at === null) {
+        return (await conflict(c, lic.id)) ?? c.json(await issueToken(db, deps, plans, lic, raced));
+      }
+      // Key đang ở máy khác: trả các máy đang giữ key, không đổi gì.
+      return fail(c, 409, "key_in_use", { devices: devicesOf(await activeActivations(db, lic.id)) });
     }
     await audit(db, { at: now, actor: "api", action, licenseId: lic.id, detail: { activation_id: activationId } });
+    const list = await activeActivations(db, lic.id);
+    if (list.length > MAX_DEVICES) {
+      // Người dùng đã xác nhận kích hoạt khi key đang ở máy khác: cả hai máy bị tạm khóa tới khi một máy gỡ.
+      await audit(db, {
+        at: now,
+        actor: "api",
+        action: "license_conflict",
+        licenseId: lic.id,
+        detail: { activation_id: activationId, devices: list.length },
+      });
+      return fail(c, 409, "license_conflict", { devices: devicesOf(list) });
+    }
     const act = await activeById(db, activationId, lic.id);
     if (!act) throw new Error(`không thấy activation ${activationId} vừa kích hoạt`);
     return c.json(await issueToken(db, deps, plans, lic, act));
@@ -300,8 +329,9 @@ export function registerLicenses(app: Hono<AppEnv>) {
     if (problem) return problem;
     const plans = parsePlans(c.env.PLANS);
     if (!plans) return fail(c, 503, "pricing_not_configured");
+    // Ghi lần kiểm gần nhất cả khi đang xung đột: danh sách máy cho người dùng thấy máy nào vừa dùng.
     await db.prepare("UPDATE activations SET last_validated_at = ? WHERE id = ?").bind(now, act.id).run();
-    return c.json(await issueToken(db, deps, plans, lic, act));
+    return (await conflict(c, lic.id)) ?? c.json(await issueToken(db, deps, plans, lic, act));
   });
 
   app.post("/v1/licenses/deactivate", async (c) => {
PATCH
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
pnpm exec vitest run test/licenses.test.ts
pnpm check
```

Kết quả mong đợi: `Tests  58 passed (58)`. `pnpm check` thoát mã 0: `Tests  405 passed (405)`.

- [ ] **Step 5: Kiểm khớp cây tham chiếu rồi commit**

```bash
git add -A server
git diff --cached --stat 01d5cd4 -- server   # phải không in gì
git commit -m "feat(server): mỗi key một máy; key_in_use, allow_conflict và license_conflict

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 6: Admin: tra cứu theo máy, dùng thử và trạng thái xung đột

**Commit tham chiếu:** `e4bc58b` (nhánh `ref-bg01`).

**Files:**
- Modify: `server/src/admin.ts`
- Modify: `server/test/admin.test.ts`

`POST /admin/lookup` nhận thêm `{device_id_hash}` (sai dạng → `400`, `field: "device_id_hash"`): trả `trial` (dòng `trials` của máy, hay `null`), `orders: []`, và các license từng kích hoạt trên máy. Mọi kiểu tra thêm `conflict: boolean` cho từng license (từ 2 máy đang kích hoạt). Nhật ký `lookup` khi tra theo máy có `{by: "device", licenses, trial: boolean}`. Thao tác xóa theo email không chạm bảng `trials` (có test).

- [ ] **Step 1: Viết test (red)**

```bash
git apply <<'PATCH'
diff --git a/server/test/admin.test.ts b/server/test/admin.test.ts
index d5c2ca9..9f691ac 100644
--- a/server/test/admin.test.ts
+++ b/server/test/admin.test.ts
@@ -222,6 +222,40 @@ describe("tra cứu, gửi lại key", () => {
     expect((await adminCall("/admin/lookup", { body: {} })).status).toBe(400);
   });
 
+  it("tra theo máy (device_id_hash): dùng thử của máy và các license từng kích hoạt trên máy, kèm trạng thái xung đột", async () => {
+    const { w, adminCall } = makeAdmin();
+    const d1 = await sha256Hex("tra-may-1");
+    const d2 = await sha256Hex("tra-may-2");
+    await w.call("POST", "/v1/trial", { device_id_hash: d1 });
+    const { licenseKey } = await w.buy({ email: "buyer@example.com" });
+    const activate = (d: string, extra: Record<string, unknown> = {}) =>
+      w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: d, device_label: "Máy", ...extra });
+    expect((await activate(d1)).status).toBe(200);
+    const res = await adminCall("/admin/lookup", { body: { device_id_hash: d1 } });
+    expect(res.status).toBe(200);
+    expect(res.body.trial).toEqual({ started_at: T0, ends_at: T0 + 10 * DAY, last_seen_at: T0 });
+    expect(res.body.orders).toEqual([]);
+    const lics = res.body.licenses as Record<string, unknown>[];
+    expect(lics.map((l) => [l.license_key, l.conflict])).toEqual([[licenseKey, false]]);
+    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({ by: "device", licenses: 1, trial: true });
+
+    // Máy 2 xác nhận "Vẫn kích hoạt": tra theo email hay theo máy đều thấy xung đột.
+    expect((await activate(d2, { allow_conflict: true })).body.error).toBe("license_conflict");
+    const byEmail = await adminCall("/admin/lookup", { body: { email: "buyer@example.com" } });
+    expect((byEmail.body.licenses as Record<string, unknown>[])[0]).toMatchObject({ conflict: true });
+    expect(byEmail.body).not.toHaveProperty("trial");
+    const byDevice2 = await adminCall("/admin/lookup", { body: { device_id_hash: d2 } });
+    expect(byDevice2.body).toMatchObject({ trial: null, licenses: [{ conflict: true }] });
+    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({ by: "device", licenses: 1, trial: false });
+
+    const unknown = await adminCall("/admin/lookup", { body: { device_id_hash: await sha256Hex("không-có") } });
+    expect(unknown.body).toEqual({ licenses: [], orders: [], trial: null });
+    expect(await adminCall("/admin/lookup", { body: { device_id_hash: "SAI" } })).toMatchObject({
+      status: 400,
+      body: { field: "device_id_hash" },
+    });
+  });
+
   it("gửi lại key vào email của license và ghi nhật ký", async () => {
     const { w, adminCall } = makeAdmin();
     const { licenseKey } = await w.buy();
@@ -477,8 +511,11 @@ describe("Q9: xóa dữ liệu cá nhân theo email", () => {
     const { licenseKey } = await w.buy({ email: "erase@example.com" });
     await w.buy({ email: "keep@example.com" });
     await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "MacBook của An" });
+    await w.call("POST", "/v1/trial", { device_id_hash: await sha256Hex("d1") });
     const res = await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa qua email hỗ trợ ngày 2026-10-01" } });
     expect(res.body).toEqual({ activations: 1, licenses: 1, orders: 1 });
+    // Bảng trials không có email, nên xóa theo email không chạm tới (spec 2026-10-07 §7, §10.1).
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM trials").first()).toEqual({ n: 1 });
     const orders = await env.DB.prepare("SELECT email, amount, plan, status FROM orders ORDER BY order_code").all();
     expect(orders.results).toEqual([
       { email: null, amount: 50000, plan: "monthly", status: "paid" },
PATCH
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
pnpm exec vitest run test/admin.test.ts
```

Kết quả mong đợi: `Tests  1 failed | 61 passed (62)`: `tra theo máy (device_id_hash)…` (`expected 400 to be 200`).

- [ ] **Step 3: Viết code**

```bash
git apply <<'PATCH'
diff --git a/server/src/admin.ts b/server/src/admin.ts
index e8b0435..18afa39 100644
--- a/server/src/admin.ts
+++ b/server/src/admin.ts
@@ -12,7 +12,7 @@ import { audit, auditIfChanged, auditStatement } from "./audit";
 import { sendLicenseMail } from "./deps";
 import type { EmailProvider } from "./email/provider";
 import type { AdminEnv } from "./env";
-import { fail, isRecord, parseEmail, readJson } from "./http";
+import { fail, isRecord, parseDeviceIdHash, parseEmail, readJson } from "./http";
 import { formatLicenseKey, generateLicenseKey } from "./license-key";
 import { grantOrder, loadOrder, mailGranted, settledResult } from "./orders";
 import type { PayOSProvider } from "./payment/payos";
@@ -98,9 +98,21 @@ export function createAdminApp(makeDeps: (env: AdminEnv) => AdminDeps) {
     const body = await readJson(c);
     let licenseIds: string[] = [];
     let orders: Record<string, unknown>[] = [];
-    let by: "email" | "order_code";
+    let by: "email" | "order_code" | "device";
     let orderCode: number | null = null;
-    if (body?.email !== undefined) {
+    // Tra theo máy (spec 2026-10-07 §3.1): dùng thử của máy và các license từng kích hoạt trên máy. Chỉ đọc.
+    let trial: Record<string, unknown> | null | undefined;
+    if (body?.device_id_hash !== undefined) {
+      const d = parseDeviceIdHash(body.device_id_hash);
+      if (!d) return fail(c, 400, "invalid_request", { field: "device_id_hash" });
+      by = "device";
+      trial = await db.prepare("SELECT started_at, ends_at, last_seen_at FROM trials WHERE device_id_hash = ?").bind(d).first();
+      const acts = await db
+        .prepare("SELECT DISTINCT license_id FROM activations WHERE device_id_hash = ? ORDER BY license_id")
+        .bind(d)
+        .all<{ license_id: string }>();
+      licenseIds = acts.results.map((r) => r.license_id);
+    } else if (body?.email !== undefined) {
       const e = parseEmail(body.email);
       if (!e) return fail(c, 400, "invalid_request", { field: "email" });
       by = "email";
@@ -112,7 +124,7 @@ export function createAdminApp(makeDeps: (env: AdminEnv) => AdminDeps) {
       orderCode = body?.order_code as number;
       orders = (await db.prepare("SELECT * FROM orders WHERE order_code = ?").bind(orderCode).all()).results;
     } else {
-      return fail(c, 400, "invalid_request", { field: "email|order_code" });
+      return fail(c, 400, "invalid_request", { field: "email|order_code|device_id_hash" });
     }
     for (const o of orders) {
       for (const k of ["license_id", "renew_license_id"]) {
@@ -133,6 +145,8 @@ export function createAdminApp(makeDeps: (env: AdminEnv) => AdminDeps) {
       licenses.push({
         ...lic,
         license_key: formatLicenseKey(String(lic.license_key)),
+        // Xung đột: từ 2 máy đang kích hoạt (spec 2026-10-07 §4.1). Gỡ máy bằng thao tác gỡ activation sẵn có.
+        conflict: acts.results.filter((a) => a.deactivated_at === null).length > 1,
         activations: acts.results,
         audit: log.results,
       });
@@ -142,9 +156,12 @@ export function createAdminApp(makeDeps: (env: AdminEnv) => AdminDeps) {
       actor: c.get("actor"),
       action: "lookup",
       orderCode,
-      detail: { by, licenses: licenses.length, orders: orders.length },
+      detail:
+        trial === undefined
+          ? { by, licenses: licenses.length, orders: orders.length }
+          : { by, licenses: licenses.length, trial: trial !== null },
     });
-    return c.json({ licenses, orders });
+    return c.json(trial === undefined ? { licenses, orders } : { licenses, orders, trial });
   });
 
   // GET nhưng có tác dụng phụ (ghi nhật ký, gọi PayOS): chặn request mà trình duyệt báo là từ trang khác.
PATCH
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
pnpm exec vitest run test/admin.test.ts
pnpm check
```

Kết quả mong đợi: `Tests  62 passed (62)`. `pnpm check` thoát mã 0: `Test Files  20 passed (20)`, `Tests  406 passed (406)`.

- [ ] **Step 5: Kiểm khớp cây tham chiếu rồi commit**

```bash
git add -A server
git diff --cached --stat e4bc58b -- server   # phải không in gì
git commit -m "feat(server): admin tra cứu theo máy, hiện dùng thử và trạng thái xung đột

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 7: activate trả activation_id của máy gọi trong 409 license_conflict

**Commit tham chiếu:** `b28c5d2` (nhánh `ref-bg01`).

**Files:**
- Modify: `server/src/licenses.ts`
- Modify: `server/test/licenses.test.ts`

Hợp đồng 00 (sửa ngày 2026-10-07): khi `activate` trả `409 license_conflict`, body có thêm `activation_id` của chính máy gọi: `{"error": "license_conflict", "activation_id": "…", "devices": […]}`. Áp cho cả hai nhánh: máy vừa vào nhờ `allow_conflict: true`, và máy đang kích hoạt gọi lại `activate` khi đang xung đột (kể cả nhánh hai request cùng lúc của một máy). App lưu `activation_id` để sau đó `validate` hay tự gỡ. `validate` giữ nguyên, không có `activation_id`.

Hàm `conflict` nhận thêm tham số `activationId` (không truyền thì không có trường này).

- [ ] **Step 1: Viết test (red)**

```bash
git apply <<'PATCH'
diff --git a/server/test/licenses.test.ts b/server/test/licenses.test.ts
index f537f31..375cc6b 100644
--- a/server/test/licenses.test.ts
+++ b/server/test/licenses.test.ts
@@ -326,6 +326,8 @@ describe("mỗi key một máy, trùng máy thì xung đột (spec 2026-10-07 §
       headers: expect.anything(),
       body: {
         error: "license_conflict",
+        // activation của chính máy gọi, để app lưu và sau đó validate hay tự gỡ (hợp đồng 00).
+        activation_id: await idOf(2),
         devices: [
           { activation_id: a1.body.activation_id, device_label: "Máy 1", last_validated_at: T0 },
           { activation_id: await idOf(2), device_label: "Máy 2", last_validated_at: T0 + 100 },
@@ -346,13 +348,19 @@ describe("mỗi key một máy, trùng máy thì xung đột (spec 2026-10-07 §
       const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: id });
       expect(v).toMatchObject({ status: 409, body: { error: "license_conflict" } });
       expect(v.body).not.toHaveProperty("token");
+      // validate: máy đã biết activation_id của mình, response không lặp lại.
+      expect(v.body).not.toHaveProperty("activation_id");
     }
     expect((await env.DB.prepare("SELECT last_validated_at FROM activations ORDER BY created_at").all()).results).toEqual([
       { last_validated_at: T0 + DAY },
       { last_validated_at: T0 + DAY },
     ]);
-    expect(await activate(1)).toMatchObject({ status: 409, body: { error: "license_conflict" } });
-    expect(await activateAnyway(2)).toMatchObject({ status: 409, body: { error: "license_conflict" } });
+    // Máy đang kích hoạt gọi lại activate (cài lại app) khi đang xung đột: nhận lại đúng activation của mình.
+    expect(await activate(1)).toMatchObject({
+      status: 409,
+      body: { error: "license_conflict", activation_id: a1.body.activation_id },
+    });
+    expect(await activateAnyway(2)).toMatchObject({ status: 409, body: { error: "license_conflict", activation_id: await idOf(2) } });
     expect(await activeCount()).toEqual({ n: 2 });
   });
 
PATCH
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
pnpm exec vitest run test/licenses.test.ts
```

Kết quả mong đợi: `Tests  2 failed | 56 passed (58)`: `allow_conflict khi máy khác giữ key…` và `đang xung đột: validate của cả hai máy…` (body chưa có `activation_id`).

- [ ] **Step 3: Viết code**

```bash
git apply <<'PATCH'
diff --git a/server/src/licenses.ts b/server/src/licenses.ts
index 8e37676..4a65e6b 100644
--- a/server/src/licenses.ts
+++ b/server/src/licenses.ts
@@ -134,10 +134,16 @@ function devicesOf(list: ActivationRow[]) {
   return list.map((a) => ({ activation_id: a.id, device_label: a.device_label, last_validated_at: a.last_validated_at }));
 }
 
-/** Xung đột: license có từ 2 máy đang kích hoạt (spec 2026-10-07 §4.1). Trả response 409, hay null nếu không xung đột. */
-async function conflict(c: Context<AppEnv>, licenseId: string) {
+/**
+ * Xung đột: license có từ 2 máy đang kích hoạt (spec 2026-10-07 §4.1). Trả response 409, hay null nếu không xung đột.
+ * `activationId`: activation của chính máy gọi, chỉ có ở `activate` (máy chưa biết activation của mình); `validate` không
+ * truyền (hợp đồng 00).
+ */
+async function conflict(c: Context<AppEnv>, licenseId: string, activationId?: string) {
   const list = await activeActivations(c.env.DB, licenseId);
-  return list.length > MAX_DEVICES ? fail(c, 409, "license_conflict", { devices: devicesOf(list) }) : null;
+  if (list.length <= MAX_DEVICES) return null;
+  const own = activationId === undefined ? {} : { activation_id: activationId };
+  return fail(c, 409, "license_conflict", { ...own, devices: devicesOf(list) });
 }
 
 async function activeById(db: D1Database, activationId: string, licenseId: string) {
@@ -198,7 +204,7 @@ export function registerLicenses(app: Hono<AppEnv>) {
         .prepare("UPDATE activations SET device_label = ?, last_validated_at = ? WHERE id = ?")
         .bind(deviceLabel, now, row.id)
         .run();
-      return (await conflict(c, lic.id)) ?? c.json(await issueToken(db, deps, plans, lic, row));
+      return (await conflict(c, lic.id, row.id)) ?? c.json(await issueToken(db, deps, plans, lic, row));
     }
 
     // Mọi máy không đang kích hoạt, kể cả máy từng dùng key này, đều qua kiểm khóa tạm (QĐ10).
@@ -266,7 +272,7 @@ export function registerLicenses(app: Hono<AppEnv>) {
     if (changed.meta.changes !== 1) {
       const raced = await rowFor(db, lic.id, deviceIdHash);
       if (raced && raced.deactivated_at === null) {
-        return (await conflict(c, lic.id)) ?? c.json(await issueToken(db, deps, plans, lic, raced));
+        return (await conflict(c, lic.id, raced.id)) ?? c.json(await issueToken(db, deps, plans, lic, raced));
       }
       // Key đang ở máy khác: trả các máy đang giữ key, không đổi gì.
       return fail(c, 409, "key_in_use", { devices: devicesOf(await activeActivations(db, lic.id)) });
@@ -282,7 +288,7 @@ export function registerLicenses(app: Hono<AppEnv>) {
         licenseId: lic.id,
         detail: { activation_id: activationId, devices: list.length },
       });
-      return fail(c, 409, "license_conflict", { devices: devicesOf(list) });
+      return fail(c, 409, "license_conflict", { activation_id: activationId, devices: devicesOf(list) });
     }
     const act = await activeById(db, activationId, lic.id);
     if (!act) throw new Error(`không thấy activation ${activationId} vừa kích hoạt`);
PATCH
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
pnpm exec vitest run test/licenses.test.ts
pnpm check
```

Kết quả mong đợi: `Tests  58 passed (58)`. `pnpm check` thoát mã 0: `Tests  406 passed (406)`.

- [ ] **Step 5: Kiểm khớp cây tham chiếu rồi commit**

```bash
git add -A server
git diff --cached --stat b28c5d2 -- server   # phải không in gì
git commit -m "feat(server): activate trả activation_id của máy gọi trong 409 license_conflict

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 8: Hạ ngưỡng khóa tạm xuống 2 lần gỡ trong 30 ngày

**Commit tham chiếu:** `6784824` (nhánh `ref-bg01`).

**Files:**
- Modify: `server/src/admin.ts`
- Modify: `server/src/licenses.ts`
- Modify: `server/test/admin.test.ts`
- Modify: `server/test/licenses.test.ts`
- Modify: `server/test/world.ts`

Chủ dự án chốt ngày 2026-10-07: hai máy gỡ qua gỡ lại bị khóa sau khoảng 5 lần gỡ trong 30 ngày. `MAX_DEACTIVATIONS_IN_WINDOW` từ 3 xuống **2**. Cách đếm giữ nguyên: chỉ các lần gỡ do người dùng (`by = 'user'`, kể cả gỡ từ xa, không tính admin gỡ), trừ các lần gỡ chính máy đang xin kích hoạt, từ mốc `max(bây giờ − 30 ngày, lock_cleared_at)`; khóa khi số còn lại **lớn hơn 2**.

Các test đổi (số lần gỡ cần để bị khóa):
- `gỡ hơn 2 máy trong 30 ngày…`: 3 máy lần lượt kích hoạt rồi bị gỡ (mỗi máy vào khi các máy trước còn ≤ 2 lần gỡ), máy thứ 4 nhận `423`, `locked_at = T0 + 4 ngày` (trước: 4 máy, máy thứ 5).
- `hai máy mới kích hoạt cùng lúc khi vừa quá ngưỡng`: 3 máy bị gỡ, ba máy mới (4, 5, 6) cùng nhận `423`, một dòng nhật ký, một cảnh báo.
- `xoay vòng một suất giữa 5 máy`: khóa ở lượt 2 (máy 4 xin kích hoạt khi máy 1, 2, 3 đã bị gỡ), `locked_at = T0 + 3 giờ` (trước: lượt 3).
- `2 lần gỡ trong 30 ngày vẫn kích hoạt được; lần gỡ cũ hơn 30 ngày không tính`: 2 lần gỡ ở `T0`, lần thứ 3 ở `T0 + 10 ngày`, máy mới ở `T0 + 31 ngày` vẫn vào được (chỉ còn 1 lần gỡ trong 30 ngày; nếu cả 3 lần còn tính thì 3 > 2).
- `kích hoạt lại dùng lại dòng cũ…`: xoay 3 máy (3 lần gỡ) rồi gỡ máy 1 lần nữa; máy 1 quay lại (còn 2) được, máy 4 mới (4 lần) bị `423`; vẫn 3 dòng activation.
- **Mới:** `hai người dùng chung key đổi máy qua lại (gỡ máy kia rồi kích hoạt)`: gỡ xen kẽ máy 1, 2, 1, 2, 1; bốn lần kích hoạt đầu `200` (lần gỡ thứ 4 chưa khóa), lần gỡ thứ **5** rồi máy 2 xin kích hoạt thì `423` (máy 1 đã bị gỡ 3 lần). Có 5 dòng `deactivations`, `locked_at = T0 + 5 giờ`, cảnh báo `license_locked`.
- `hai người dùng chung key gỡ qua gỡ lại bằng xác nhận xung đột`: khóa sau **6** lần gỡ (mỗi máy bị gỡ 3 lần; trước: 8 lần). Nhiều hơn đổi máy một lần vì máy vào trước khi máy kia bị gỡ.
- "Khách B" trong `test/world.ts`: 2 máy đã gỡ (thay vì 3), 3 lần tự gỡ (thay vì 4) nhưng vẫn hơn ngưỡng và không bị khóa; test admin đếm nhãn `Máy B1`–`Máy B4`.
- Test mở khóa của admin: 3 máy bị gỡ, máy thứ 4 nhận `423`, mở khóa rồi máy thứ 4 vào được.

Test admin "admin gỡ 4 máy liền…" giữ nguyên: lần admin gỡ không tính vào luật khóa tạm.

- [ ] **Step 1: Viết test (red)**

```bash
git apply <<'PATCH'
diff --git a/server/test/admin.test.ts b/server/test/admin.test.ts
index 9f691ac..388ead1 100644
--- a/server/test/admin.test.ts
+++ b/server/test/admin.test.ts
@@ -409,11 +409,11 @@ describe("thay đổi license", () => {
     // Khóa thật rồi mở: lần đầu được.
     const activate = async (n: number) =>
       w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex(`d${n}`), device_label: `M${n}` }, { "cf-connecting-ip": `198.51.100.${n}` });
-    for (let i = 1; i <= 4; i++) {
+    for (let i = 1; i <= 3; i++) {
       const r = await activate(i);
       await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: r.body.activation_id });
     }
-    expect((await activate(5)).status).toBe(423);
+    expect((await activate(4)).status).toBe(423);
     w.clock.now = T0 + 5;
     expect((await adminCall(`/admin/licenses/${id}/unlock`, { body: { note: "đã xác minh" } })).status).toBe(200);
     expect(await licenseRow()).toMatchObject({ locked_at: null, lock_cleared_at: T0 + 5 });
@@ -458,15 +458,15 @@ describe("thay đổi license", () => {
     const { licenseKey } = await w.buy();
     const activate = async (n: number) =>
       w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex(`d${n}`), device_label: `M${n}` }, { "cf-connecting-ip": `198.51.100.${n}` });
-    for (let i = 1; i <= 4; i++) {
+    for (let i = 1; i <= 3; i++) {
       const r = await activate(i);
       await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: r.body.activation_id });
     }
-    expect((await activate(5)).status).toBe(423);
+    expect((await activate(4)).status).toBe(423);
     const id = (await licenseRow())!.id as string;
     expect((await adminCall(`/admin/licenses/${id}/unlock`, { body: { note: "khách đổi máy nhiều, đã xác minh" } })).status).toBe(200);
     w.clock.now = T0 + 1;
-    expect((await activate(5)).status).toBe(200);
+    expect((await activate(4)).status).toBe(200);
   });
 
   it("admin gỡ 4 máy liền rồi kích hoạt máy khác vẫn được: lần admin gỡ không tính vào luật khóa tạm", async () => {
@@ -807,7 +807,7 @@ describe("hai khách: tra cứu và xóa dữ liệu chỉ đụng đúng email
         .all()
         .then((r) => r.results.map((x) => x.device_label));
     const before = await labelsOfB();
-    expect(before).toEqual(["Máy B1", "Máy B2", "Máy B3", "Máy B4", "Máy B5"]);
+    expect(before).toEqual(["Máy B1", "Máy B2", "Máy B3", "Máy B4"]);
     const res = await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa" } });
     expect(res.body).toEqual({ activations: 1, licenses: 1, orders: 1 });
     expect(await labelsOfB()).toEqual(before);
diff --git a/server/test/licenses.test.ts b/server/test/licenses.test.ts
index 375cc6b..37733c9 100644
--- a/server/test/licenses.test.ts
+++ b/server/test/licenses.test.ts
@@ -146,18 +146,19 @@ describe("activate", () => {
     });
   });
 
-  it("gỡ hơn 3 máy trong 30 ngày rồi kích hoạt máy mới thì khóa tạm key (423) và có cảnh báo", async () => {
+  it("gỡ hơn 2 máy trong 30 ngày rồi kích hoạt máy mới thì khóa tạm key (423) và có cảnh báo", async () => {
     const { w, activate, deactivate } = await setup();
-    for (let i = 1; i <= 4; i++) {
+    for (let i = 1; i <= 3; i++) {
       w.clock.now = T0 + i * DAY;
+      // Máy thứ 3 vào khi 2 máy trước đã bị gỡ: còn trong ngưỡng.
       const r = await activate(i);
       expect(r.status).toBe(200);
       await deactivate(r.body.activation_id as string);
     }
-    w.clock.now = T0 + 5 * DAY;
-    expect(await activate(5)).toMatchObject({ status: 423, body: { error: "license_locked" } });
+    w.clock.now = T0 + 4 * DAY;
+    expect(await activate(4)).toMatchObject({ status: 423, body: { error: "license_locked" } });
     const lic = await env.DB.prepare("SELECT locked_at FROM licenses").first<{ locked_at: number }>();
-    expect(lic?.locked_at).toBe(T0 + 5 * DAY);
+    expect(lic?.locked_at).toBe(T0 + 4 * DAY);
     const log = await env.DB.prepare("SELECT action FROM audit_log WHERE action = 'license_locked'").first();
     expect(log).not.toBeNull();
     expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
@@ -165,20 +166,20 @@ describe("activate", () => {
 
   it("hai máy mới kích hoạt cùng lúc khi vừa quá ngưỡng: khóa một lần, một dòng nhật ký, một cảnh báo", async () => {
     const { w, activate, deactivate } = await setup();
-    for (let i = 1; i <= 4; i++) {
+    for (let i = 1; i <= 3; i++) {
       w.clock.now = T0 + i * DAY;
       const r = await activate(i);
       await deactivate(r.body.activation_id as string);
     }
-    w.clock.now = T0 + 5 * DAY;
-    const results = await Promise.all([activate(5), activate(6), activate(7)]);
+    w.clock.now = T0 + 4 * DAY;
+    const results = await Promise.all([activate(4), activate(5), activate(6)]);
     expect(results.map((r) => r.status)).toEqual([423, 423, 423]);
     expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'license_locked'").first()).toEqual({ n: 1 });
     expect(await env.DB.prepare("SELECT SUM(count) AS n FROM ops_alerts WHERE kind = 'license_locked'").first()).toEqual({ n: 1 });
     // Đã khóa thì lần kích hoạt sau không khóa lại, không đổi locked_at.
-    w.clock.now = T0 + 6 * DAY;
-    expect((await activate(8)).status).toBe(423);
-    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 5 * DAY });
+    w.clock.now = T0 + 5 * DAY;
+    expect((await activate(7)).status).toBe(423);
+    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 4 * DAY });
   });
 
   it("gỡ rồi kích hoạt lại cùng một máy nhiều lần: không bị khóa", async () => {
@@ -192,11 +193,11 @@ describe("activate", () => {
     w.clock.now = T0 + 7 * 3600;
     expect((await activate(1)).status).toBe(200);
     expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: null });
-    // Đúng chữ §10.2: hơn 3 lần gỡ rồi kích hoạt một máy khác thì bị khóa.
+    // Đúng chữ §10.2: hơn 2 lần gỡ rồi kích hoạt một máy khác thì bị khóa.
     expect((await activate(2)).status).toBe(423);
   });
 
-  it("xoay vòng một suất giữa 5 máy: bị khóa ở lượt 4, rồi mọi máy không đang kích hoạt đều bị 423", async () => {
+  it("xoay vòng một suất giữa 5 máy: bị khóa ở lượt 2, rồi mọi máy không đang kích hoạt đều bị 423", async () => {
     const { w, activate, deactivate } = await setup();
     let active = { n: 1, id: (await activate(1)).body.activation_id as string };
     const order = [2, 3, 4, 5, 1, 2];
@@ -212,10 +213,10 @@ describe("activate", () => {
       expect(r.status).toBe(200);
       active = { n: order[i]!, id: r.body.activation_id as string };
     }
-    // Lượt 3 (máy 4): đã gỡ máy 1, 2, 3; trừ máy 4 còn 3 lần, chưa quá 3.
-    // Lượt 4 (máy 5): đã gỡ máy 1, 2, 3, 4; trừ máy 5 còn 4 lần, nên khóa.
-    expect(lockedAt).toBe(3);
-    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 4 * 3600 });
+    // Lượt 1 (máy 3): đã gỡ máy 1, 2; trừ máy 3 còn 2 lần, chưa quá 2.
+    // Lượt 2 (máy 4): đã gỡ máy 1, 2, 3; trừ máy 4 còn 3 lần, nên khóa.
+    expect(lockedAt).toBe(2);
+    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 3 * 3600 });
     // Không còn máy nào đang kích hoạt; mọi máy (từng dùng hay mới) đều bị 423.
     for (const n of [1, 2, 3, 4, 5, 9]) expect((await activate(n)).status).toBe(423);
   });
@@ -244,20 +245,20 @@ describe("activate", () => {
     expect(n?.n).toBe(1);
   });
 
-  it("3 lần gỡ trong 30 ngày vẫn kích hoạt được; lần gỡ cũ hơn 30 ngày không tính", async () => {
+  it("2 lần gỡ trong 30 ngày vẫn kích hoạt được; lần gỡ cũ hơn 30 ngày không tính", async () => {
     const { w, activate, deactivate } = await setup();
     await env.DB.prepare("UPDATE licenses SET expires_at = ?").bind(T0 + 90 * DAY).run();
-    for (let i = 1; i <= 3; i++) {
+    for (let i = 1; i <= 2; i++) {
       const r = await activate(i);
       await deactivate(r.body.activation_id as string);
     }
-    const fourth = await activate(4);
-    expect(fourth.status).toBe(200);
+    const third = await activate(3);
+    expect(third.status).toBe(200);
     w.clock.now = T0 + 10 * DAY;
-    await deactivate(fourth.body.activation_id as string);
-    // Lần gỡ thứ 4 ở T0 + 10 ngày; ba lần đầu (ở T0) đã quá 30 ngày.
+    await deactivate(third.body.activation_id as string);
+    // Lần gỡ thứ 3 ở T0 + 10 ngày; hai lần đầu (ở T0) đã quá 30 ngày. Nếu còn tính thì máy 4 thấy 3 lần gỡ (> 2) và bị khóa.
     w.clock.now = T0 + 31 * DAY;
-    expect((await activate(5)).status).toBe(200);
+    expect((await activate(4)).status).toBe(200);
   });
 
   it("key sai định dạng 400, key không tồn tại 404, đã thu hồi 403, hết hạn 403 kèm expires_at", async () => {
@@ -397,7 +398,30 @@ describe("mỗi key một máy, trùng máy thì xung đột (spec 2026-10-07 §
     });
   });
 
-  it("hai người dùng chung key gỡ qua gỡ lại: luật khóa tạm chặn sau khi mỗi máy bị gỡ 4 lần trong 30 ngày", async () => {
+  it("hai người dùng chung key đổi máy qua lại (gỡ máy kia rồi kích hoạt): lần gỡ thứ 4 chưa khóa, lần gỡ thứ 5 thì máy xin kích hoạt bị 423", async () => {
+    const { w, activate, deactivate } = await setup();
+    let holder = (await activate(1)).body.activation_id as string;
+    // Mỗi lượt: máy `inn` gỡ máy đang giữ key (gỡ từ xa), rồi kích hoạt. Các lần gỡ lần lượt là máy 1, 2, 1, 2, 1.
+    const statuses: number[] = [];
+    for (let i = 0; i < 5; i++) {
+      const inn = i % 2 === 0 ? 2 : 1;
+      w.clock.now = T0 + (i + 1) * 3600;
+      await deactivate(holder);
+      const r = await activate(inn);
+      statuses.push(r.status);
+      if (r.status !== 200) break;
+      holder = r.body.activation_id as string;
+    }
+    // Lần gỡ thứ 4 (máy 2): máy 1 vào lại, các lần gỡ máy 2 là 2 (không quá 2), nên chưa khóa.
+    // Lần gỡ thứ 5 (máy 1): máy 2 xin kích hoạt, các lần gỡ máy 1 là 3 (quá 2), nên khóa.
+    expect(statuses).toEqual([200, 200, 200, 200, 423]);
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations WHERE by = 'user'").first()).toEqual({ n: 5 });
+    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 5 * 3600 });
+    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
+    expect((await activate(1)).status).toBe(423);
+  });
+
+  it("hai người dùng chung key gỡ qua gỡ lại bằng xác nhận xung đột: khóa sau 6 lần gỡ (mỗi máy bị gỡ 3 lần)", async () => {
     const { w, activate, activateAnyway, deactivate } = await setup();
     await activate(1);
     // Mỗi lượt: máy `inn` xác nhận xung đột rồi gỡ máy `out` từ xa.
@@ -416,8 +440,8 @@ describe("mỗi key một máy, trùng máy thì xung đột (spec 2026-10-07 §
       removals++;
     }
     // Luật đếm trừ các lần gỡ chính máy đang xin kích hoạt (§10.2), nên máy xin kích hoạt bị chặn khi máy kia đã bị gỡ
-    // 4 lần: tổng 8 lần gỡ.
-    expect(lockedAfter).toBe(8);
+    // 3 lần: tổng 6 lần gỡ (nhiều hơn đổi máy ở trên một lần, vì máy vào trước khi máy kia bị gỡ).
+    expect(lockedAfter).toBe(6);
     expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
   });
 
@@ -743,7 +767,7 @@ describe("deactivate", () => {
     // Xoay một suất giữa 3 máy: mỗi máy quay lại dùng lại dòng của nó.
     const ids = new Map<number, string>();
     ids.set(1, (await activate(1)).body.activation_id as string);
-    const rotation: [number, number][] = [[1, 2], [2, 3], [3, 1], [1, 2]];
+    const rotation: [number, number][] = [[1, 2], [2, 3], [3, 1]];
     const statuses: number[] = [];
     for (const [i, [out, inn]] of rotation.entries()) {
       w.clock.now = T0 + (i + 1) * 3600;
@@ -752,11 +776,11 @@ describe("deactivate", () => {
       statuses.push(r.status);
       if (r.status === 200) ids.set(inn, r.body.activation_id as string);
     }
-    // Lượt 4 (máy 2 quay lại): đã gỡ máy 1, 2, 3, 1; trừ máy 2 còn 3 lần. Chưa quá 3 nên vẫn được.
-    expect(statuses).toEqual([200, 200, 200, 200]);
-    w.clock.now = T0 + 5 * 3600;
-    await deactivate(ids.get(2)!);
-    // Máy 1 quay lại: đã gỡ máy 1, 2, 3, 1, 2; trừ máy 1 còn 3. Máy 4 mới: 5 lần, nên khóa.
+    // Lượt 3 (máy 1 quay lại): đã gỡ máy 1, 2, 3; trừ máy 1 còn 2 lần. Chưa quá 2 nên vẫn được.
+    expect(statuses).toEqual([200, 200, 200]);
+    w.clock.now = T0 + 4 * 3600;
+    await deactivate(ids.get(1)!);
+    // Máy 1 quay lại lần nữa: đã gỡ máy 1, 2, 3, 1; trừ máy 1 còn 2. Máy 4 mới: 4 lần, nên khóa.
     expect((await activate(1)).status).toBe(200);
     expect((await activate(4)).status).toBe(423);
     expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first()).toEqual({ n: 3 });
@@ -814,10 +838,10 @@ describe("hai khách: không đụng license, máy hay bộ đếm của khách
     }
   });
 
-  it("B có 4 lần tự gỡ trong 30 ngày: A kích hoạt máy mới không bị khóa", async () => {
+  it("B có 3 lần tự gỡ trong 30 ngày: A kích hoạt máy mới không bị khóa", async () => {
     const { w, activate } = await setup();
     const b = await w.customerB();
-    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations WHERE license_id = ? AND by = 'user'").bind(b.licenseId).first()).toEqual({ n: 4 });
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations WHERE license_id = ? AND by = 'user'").bind(b.licenseId).first()).toEqual({ n: 3 });
     expect((await activate(1)).status).toBe(200);
     expect(await env.DB.prepare("SELECT locked_at FROM licenses WHERE id <> ?").bind(b.licenseId).first()).toEqual({ locked_at: null });
   });
diff --git a/server/test/world.ts b/server/test/world.ts
index bd1a1e4..d5d5008 100644
--- a/server/test/world.ts
+++ b/server/test/world.ts
@@ -88,8 +88,8 @@ export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
 
   /**
    * "Khách B" (review cuối, Q1): một khách khác, để test ranh giới giữa các license và email. B mua bằng email riêng, có
-   * 2 máy đang kích hoạt (đang xung đột, spec 2026-10-07 §4.1: máy 2 xác nhận "Vẫn kích hoạt"), 3 máy đã gỡ, và 4 lần tự
-   * gỡ trong 30 ngày (hơn ngưỡng 3 của luật khóa tạm). B không bị khóa, vì máy cuối kích hoạt lại là máy B tự gỡ. Mọi
+   * 2 máy đang kích hoạt (đang xung đột, spec 2026-10-07 §4.1: máy 2 xác nhận "Vẫn kích hoạt"), 2 máy đã gỡ, và 3 lần tự
+   * gỡ trong 30 ngày (hơn ngưỡng 2 của luật khóa tạm). B không bị khóa, vì máy cuối kích hoạt lại là máy B tự gỡ. Mọi
    * request của B đi từ IP riêng, không đụng bộ đếm của test.
    */
   async function customerB() {
@@ -113,14 +113,14 @@ export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
       if (r.status !== 200) throw new Error(`khách B gỡ máy ${n}: ${r.status}`);
     };
     const deactivated: { id: string; deviceIdHash: string }[] = [];
-    for (const n of [3, 4, 5]) {
+    for (const n of [3, 4]) {
       const id = await activate(n);
       await deactivate(id, n);
       deactivated.push({ id, deviceIdHash: await device(n) });
     }
     const b1 = await activate(1);
     const b2 = await activate(2, true);
-    // Lần gỡ thứ 4 rồi kích hoạt lại đúng máy đó: trừ chính máy này thì còn 3 lần, chưa quá ngưỡng.
+    // Lần gỡ thứ 3 rồi kích hoạt lại đúng máy đó: trừ chính máy này thì còn 2 lần, chưa quá ngưỡng.
     await deactivate(b2, 2);
     if ((await activate(2, true)) !== b2) throw new Error("khách B: máy 2 không dùng lại activation cũ");
     return {
PATCH
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
pnpm exec vitest run test/licenses.test.ts test/admin.test.ts
```

Kết quả mong đợi: `Tests  7 failed | 114 passed (121)`: hai test mở khóa của admin (`expected 200 to be 423`), `gỡ hơn 2 máy…`, `hai máy mới kích hoạt cùng lúc…` (`[200, 409, 409]` thay vì `[423, 423, 423]`), `xoay vòng một suất…` (`expected 3 to be 2`), `hai người dùng chung key đổi máy qua lại…` (`[200, 200, 200, 200, 200]` thay vì `[…, 423]`), và `…bằng xác nhận xung đột…` (`expected 8 to be 6`).

- [ ] **Step 3: Viết code**

```bash
git apply <<'PATCH'
diff --git a/server/src/admin.ts b/server/src/admin.ts
index 18afa39..74f1ce8 100644
--- a/server/src/admin.ts
+++ b/server/src/admin.ts
@@ -385,7 +385,7 @@ export function createAdminApp(makeDeps: (env: AdminEnv) => AdminDeps) {
       return c.json({ ok: true });
     });
   }
-  // Mở khóa: các lần gỡ trước lúc mở khóa không còn tính vào ngưỡng 3 máy/30 ngày.
+  // Mở khóa: các lần gỡ trước lúc mở khóa không còn tính vào ngưỡng 2 lần gỡ/30 ngày.
   // Chỉ khi key đang bị khóa; không thì không có gì để gỡ, không đặt lại lock_cleared_at và không ghi nhật ký.
   licenseAction(
     "unlock",
diff --git a/server/src/licenses.ts b/server/src/licenses.ts
index 4a65e6b..4cec59d 100644
--- a/server/src/licenses.ts
+++ b/server/src/licenses.ts
@@ -17,9 +17,12 @@ import { REFRESH_WINDOW_SECONDS, signToken } from "./token";
  */
 export const MAX_DEVICES = 1;
 export const MAX_DEVICES_IN_CONFLICT = 2;
-/** Trong 30 ngày có hơn 3 lần gỡ (kể cả gỡ từ xa) rồi kích hoạt máy khác thì khóa tạm key (§10.2). */
+/**
+ * Trong 30 ngày có hơn 2 lần gỡ (kể cả gỡ từ xa) rồi kích hoạt máy khác thì khóa tạm key (§10.2). Chủ dự án chốt
+ * 2026-10-07: hai máy đổi qua đổi lại bị khóa sau khoảng 5 lần gỡ.
+ */
 export const DEACTIVATION_WINDOW_SECONDS = 30 * 86400;
-export const MAX_DEACTIVATIONS_IN_WINDOW = 3;
+export const MAX_DEACTIVATIONS_IN_WINDOW = 2;
 
 interface LicenseRow {
   id: string;
PATCH
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
pnpm exec vitest run test/licenses.test.ts test/admin.test.ts
pnpm check
```

Kết quả mong đợi: `Tests  121 passed (121)`. `pnpm check` thoát mã 0: `Test Files  20 passed (20)`, `Tests  407 passed (407)`.

- [ ] **Step 5: Kiểm khớp cây tham chiếu rồi commit**

```bash
git add -A server
git diff --cached --stat 6784824 -- server   # phải không in gì
git commit -m "feat(server): hạ ngưỡng khóa tạm xuống 2 lần gỡ trong 30 ngày

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 9: Sửa sau review cuối: email 1 máy, khóa tạm khi vào bằng allow_conflict, ánh xạ mã gói, allow_conflict null

**Commit tham chiếu:** `107c807` (nhánh `ref-bg01`).

**Files:**
- Modify: `server/migrations/0002_three_plans_trials.sql`
- Modify: `server/src/email/templates.ts`
- Modify: `server/src/licenses.ts`
- Modify: `server/src/plans.ts`
- Modify: `server/test/email.test.ts`
- Modify: `server/test/licenses.test.ts`
- Modify: `server/test/migrations.test.ts`
- Modify: `server/test/world.ts`

Năm việc sửa từ review cuối server:

1. **Email** (`src/email/templates.ts`): "Mỗi key dùng được trên 2 máy" → "Mỗi key dùng trên 1 máy"; "Each key works on 2 computers" → "Each key works on 1 computer". Test khẳng định hai câu mới và không còn `2 máy|2 computers`. Đã grep toàn bộ `src`, `test`, `scripts`, `migrations`, `wrangler*.jsonc`: các chỗ còn lại nhắc "2 máy"/"hai máy" đều đang nói đúng về trạng thái xung đột (tối đa 2 máy đang kích hoạt) hoặc tên test.
2. **Khóa tạm khi vào bằng `allow_conflict`** (`src/licenses.ts`, cách (a)): khi request `activate` có `allow_conflict === true`, luật khóa tạm đếm **mọi** lần gỡ `by = 'user'` trong 30 ngày kể từ `lock_cleared_at`, kể cả các lần gỡ chính máy đang xin (bỏ điều kiện `a.device_id_hash <> ?` trong nhánh này). Không có `allow_conflict` thì giữ nguyên (trừ các lần gỡ chính máy xin). Ngưỡng vẫn `> MAX_DEACTIVATIONS_IN_WINDOW` (2). Lý do: vào bằng `allow_conflict` khóa cả máy đang giữ key; một máy lạ vào rồi bị chủ key gỡ lại sẽ không bao giờ bị khóa nếu lần gỡ của chính nó không tính.
   - Test mới: máy lạ (máy 3) vào bằng `allow_conflict`, bị chủ key gỡ từ xa 3 lần → lần vào thứ 4 nhận `423` (`locked_at = T0 + 4 giờ`, một dòng nhật ký, một cảnh báo), và chủ key `validate` vẫn `200` (máy lạ không còn đang kích hoạt nên không còn xung đột); cùng máy lạ nhưng **không** `allow_conflict`: 4 lần `key_in_use`, rồi (sau khi máy lạ có 3 lần bị gỡ từ nhánh trên và chủ key tự gỡ) vào lại không `allow_conflict` vẫn `200` (lần gỡ của chính máy xin không tính); 2 lần vào bằng `allow_conflict` + 2 lần gỡ, lần vào thứ 3 vẫn được (chưa khóa, key đang xung đột, 2 máy đang kích hoạt); lần gỡ cũ hơn 30 ngày không tính.
   - Test cũ đổi: hai máy gỡ qua gỡ lại bằng xác nhận xung đột nay bị khóa sau **3** lần gỡ (trước: 6), vì lần vào thứ 4 thấy 3 lần gỡ (1, 2, 1). "Khách B" trong `test/world.ts` còn 2 máy đã gỡ và **2** lần tự gỡ (trước: 3), vì máy 2 vào bằng `allow_conflict` nên mọi lần gỡ đều tính và lần vào lại bằng `allow_conflict` thứ hai sẽ bị `423`; test cách ly "B…" đổi thành A tự gỡ 2 lần rồi kích hoạt máy thứ 3 (nếu lần gỡ của B lọt vào đếm của A thì thấy 4 > 2).
3. **Migration `0002`** (`CASE plan …` ở `licenses` và `orders`): ánh xạ đủ ba mã cũ (`pro` → `monthly`, `pro_x2` → `monthly`, `pro_x5` → `yearly`), `ELSE plan` giữ nguyên mã khác để CHECK của bảng mới chặn mã lạ (trước: `ELSE 'monthly'` gộp nhầm mọi mã khác). Không thể chạy `0002` trên dữ liệu đã là `monthly`/`yearly` (CHECK của `0001` không cho ghi), nên test mới lấy đúng biểu thức `CASE` từ file migration (có đúng hai chỗ, giống hệt nhau) và chạy trên bảng thăm dò chứa `pro`, `pro_x2`, `pro_x5`, `monthly`, `yearly`, một mã lạ: ba mã cũ đổi đúng, `monthly`/`yearly` không đổi, mã lạ giữ nguyên rồi bị CHECK từ chối.
4. **`allow_conflict`** có mặt mà không phải boolean, kể cả `null`, → `400 invalid_request`, `field: "allow_conflict"` (trước: `null` bị coi là `false`). Thiếu hoặc `false` như nhau. Test cho chuỗi, `null`, số 1, số 0, mảng; không tạo activation nào.
5. **`src/plans.ts`**: chú thích `days_per_order` "(30)" → "(30 hay 365, theo gói)".

- [ ] **Step 1: Viết test (red)**

```bash
git apply <<'PATCH'
diff --git a/server/test/email.test.ts b/server/test/email.test.ts
index 52f38db..fb81ac5 100644
--- a/server/test/email.test.ts
+++ b/server/test/email.test.ts
@@ -88,6 +88,13 @@ describe("nội dung email", () => {
     expect(text).toContain("Settings > License");
   });
 
+  it("mỗi key chỉ dùng trên 1 máy (spec 2026-10-07 §1): không còn nhắc 2 máy", () => {
+    const { text } = licenseEmail("purchase", [{ licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", planName: "Monthly", expiresAt: 0 }]);
+    expect(text).toContain("Mỗi key dùng trên 1 máy.");
+    expect(text).toContain("Each key works on 1 computer.");
+    expect(text).not.toMatch(/2 máy|2 computers/);
+  });
+
   it("thư đổi gói có tiêu đề riêng; không còn tên tạm", () => {
     const entry = { licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", planName: "Monthly", expiresAt: 0 };
     expect(licenseEmail("plan_change", [entry]).subject).toBe("Đã đổi gói AI Translator / AI Translator plan changed");
diff --git a/server/test/licenses.test.ts b/server/test/licenses.test.ts
index 37733c9..810325d 100644
--- a/server/test/licenses.test.ts
+++ b/server/test/licenses.test.ts
@@ -138,12 +138,25 @@ describe("activate", () => {
     expect([x.status, y.status].sort()).toEqual([200, 409]);
   });
 
-  it("allow_conflict phải là boolean", async () => {
+  it.each([
+    ["chuỗi", "true"],
+    ["null", null],
+    ["số 1", 1],
+    ["số 0", 0],
+    ["mảng", []],
+  ])("allow_conflict có mặt mà không phải boolean (%s) thì 400, không ghi gì", async (_why, value) => {
     const { activate } = await setup();
-    expect(await activate(1, "198.51.100.1", { allow_conflict: "true" })).toMatchObject({
+    expect(await activate(1, "198.51.100.1", { allow_conflict: value })).toMatchObject({
       status: 400,
       body: { error: "invalid_request", field: "allow_conflict" },
     });
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first()).toEqual({ n: 0 });
+  });
+
+  it("allow_conflict thiếu hay false: như nhau, không xung đột", async () => {
+    const { activate } = await setup();
+    expect((await activate(1)).status).toBe(200);
+    expect(await activate(2, "198.51.100.2", { allow_conflict: false })).toMatchObject({ status: 409, body: { error: "key_in_use" } });
   });
 
   it("gỡ hơn 2 máy trong 30 ngày rồi kích hoạt máy mới thì khóa tạm key (423) và có cảnh báo", async () => {
@@ -421,7 +434,7 @@ describe("mỗi key một máy, trùng máy thì xung đột (spec 2026-10-07 §
     expect((await activate(1)).status).toBe(423);
   });
 
-  it("hai người dùng chung key gỡ qua gỡ lại bằng xác nhận xung đột: khóa sau 6 lần gỡ (mỗi máy bị gỡ 3 lần)", async () => {
+  it("hai người dùng chung key gỡ qua gỡ lại bằng xác nhận xung đột: khóa sau 3 lần gỡ (vào bằng allow_conflict thì mọi lần gỡ đều tính)", async () => {
     const { w, activate, activateAnyway, deactivate } = await setup();
     await activate(1);
     // Mỗi lượt: máy `inn` xác nhận xung đột rồi gỡ máy `out` từ xa.
@@ -439,12 +452,91 @@ describe("mỗi key một máy, trùng máy thì xung đột (spec 2026-10-07 §
       await deactivate(await idOf(out));
       removals++;
     }
-    // Luật đếm trừ các lần gỡ chính máy đang xin kích hoạt (§10.2), nên máy xin kích hoạt bị chặn khi máy kia đã bị gỡ
-    // 3 lần: tổng 6 lần gỡ (nhiều hơn đổi máy ở trên một lần, vì máy vào trước khi máy kia bị gỡ).
-    expect(lockedAfter).toBe(6);
+    // Vào bằng allow_conflict thì luật khóa tạm đếm mọi lần gỡ, kể cả các lần gỡ chính máy xin (Task 9): lần vào thứ 4
+    // thấy 3 lần gỡ (1, 2, 1) nên bị chặn. Đổi máy bằng "gỡ máy kia rồi kích hoạt" (test ở trên) vẫn trừ lần gỡ của
+    // chính máy xin, nên cần 5 lần gỡ.
+    expect(lockedAfter).toBe(3);
     expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
   });
 
+  it("máy lạ vào bằng allow_conflict, bị chủ key gỡ từ xa 3 lần: lần allow_conflict thứ 4 nhận 423 (tính cả lần gỡ chính máy xin); chủ key vẫn validate", async () => {
+    const { w, licenseKey, activate, activateAnyway, deactivate } = await setup();
+    const owner = await activate(1);
+    const statuses: number[] = [];
+    for (let i = 0; i < 4; i++) {
+      w.clock.now = T0 + (i + 1) * 3600;
+      const r = await activateAnyway(3);
+      statuses.push(r.status);
+      if (r.status === 423) {
+        expect(r.body).toEqual({ error: "license_locked" });
+        break;
+      }
+      expect(r.body.error).toBe("license_conflict");
+      await deactivate(await idOf(3)); // chủ key gỡ máy lạ từ xa
+    }
+    // Lần vào thứ 4 thấy 3 lần gỡ (cùng của máy lạ), quá 2.
+    expect(statuses).toEqual([409, 409, 409, 423]);
+    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 4 * 3600 });
+    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'license_locked'").first()).toEqual({ n: 1 });
+    // Máy lạ không còn đang kích hoạt, nên không còn xung đột: chủ key validate bình thường, kể cả khi key đang bị khóa.
+    expect(await activeCount()).toEqual({ n: 1 });
+    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: owner.body.activation_id });
+    expect(v.status).toBe(200);
+    expect(v.body.token).toMatch(/^v1\./);
+  });
+
+  it("cùng máy lạ nhưng KHÔNG dùng allow_conflict: các lần gỡ chính máy xin vẫn không tính (giữ cách đếm cũ)", async () => {
+    const { w, activate, activateAnyway, deactivate } = await setup();
+    const owner = await activate(1);
+    // Key đang ở máy chủ: không allow_conflict thì chỉ nhận key_in_use, không có lần gỡ nào.
+    for (let i = 0; i < 4; i++) expect((await activate(3)).status).toBe(409);
+    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: null });
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations").first()).toEqual({ n: 0 });
+    // Máy lạ có 3 lần bị gỡ (từ allow_conflict, mỗi lần vẫn còn trong ngưỡng).
+    for (let i = 0; i < 3; i++) {
+      w.clock.now = T0 + (i + 1) * 3600;
+      expect((await activateAnyway(3)).body.error).toBe("license_conflict");
+      await deactivate(await idOf(3));
+    }
+    // Chủ key tự gỡ để nhường chỗ: máy lạ vào lại không allow_conflict. Lần gỡ của chính máy lạ (3) không tính, chỉ còn
+    // lần gỡ của chủ key (1), nên vào được. Cùng trạng thái này mà vào bằng allow_conflict thì thấy 4 lần gỡ và bị 423.
+    w.clock.now = T0 + 4 * 3600;
+    await deactivate(owner.body.activation_id as string);
+    const back = await activate(3);
+    expect(back.status).toBe(200);
+    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: null });
+  });
+
+  it("2 lần vào bằng allow_conflict kèm 2 lần bị gỡ: lần vào thứ 3 vẫn được (chưa quá 2)", async () => {
+    const { w, activate, activateAnyway, deactivate } = await setup();
+    await activate(1);
+    const statuses: number[] = [];
+    for (let i = 0; i < 3; i++) {
+      w.clock.now = T0 + (i + 1) * 3600;
+      const r = await activateAnyway(3);
+      statuses.push(r.status);
+      if (i < 2) await deactivate(await idOf(3));
+    }
+    expect(statuses).toEqual([409, 409, 409]);
+    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: null });
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations WHERE by = 'user'").first()).toEqual({ n: 2 });
+    expect(await activeCount()).toEqual({ n: 2 });
+  });
+
+  it("allow_conflict: lần gỡ cũ hơn 30 ngày không tính", async () => {
+    const { w, activate, activateAnyway, deactivate } = await setup();
+    await env.DB.prepare("UPDATE licenses SET expires_at = ?").bind(T0 + 90 * DAY).run();
+    await activate(1);
+    for (let i = 0; i < 3; i++) {
+      expect((await activateAnyway(3)).body.error).toBe("license_conflict");
+      await deactivate(await idOf(3));
+    }
+    // 3 lần gỡ ở T0, quá 30 ngày thì không tính nữa.
+    w.clock.now = T0 + 31 * DAY;
+    expect((await activateAnyway(3)).body.error).toBe("license_conflict");
+  });
+
   it("hai máy cùng xác nhận xung đột một lúc khi key đang ở máy 1: tối đa 2 máy đang kích hoạt", async () => {
     const { activate, activateAnyway } = await setup();
     await activate(1);
@@ -838,11 +930,17 @@ describe("hai khách: không đụng license, máy hay bộ đếm của khách
     }
   });
 
-  it("B có 3 lần tự gỡ trong 30 ngày: A kích hoạt máy mới không bị khóa", async () => {
-    const { w, activate } = await setup();
+  it("B có 2 lần tự gỡ trong 30 ngày: A đã gỡ 2 lần vẫn kích hoạt được máy thứ 3, vì không cộng lần gỡ của B", async () => {
+    const { w, activate, deactivate } = await setup();
     const b = await w.customerB();
-    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations WHERE license_id = ? AND by = 'user'").bind(b.licenseId).first()).toEqual({ n: 3 });
-    expect((await activate(1)).status).toBe(200);
+    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM deactivations WHERE license_id = ? AND by = 'user'").bind(b.licenseId).first()).toEqual({ n: 2 });
+    // Nếu lần gỡ của B lọt vào đếm của A thì máy thứ 3 của A thấy 2 + 2 = 4 lần gỡ và bị khóa.
+    for (const n of [1, 2]) {
+      const r = await activate(n);
+      expect(r.status).toBe(200);
+      await deactivate(r.body.activation_id as string);
+    }
+    expect((await activate(3)).status).toBe(200);
     expect(await env.DB.prepare("SELECT locked_at FROM licenses WHERE id <> ?").bind(b.licenseId).first()).toEqual({ locked_at: null });
   });
 
diff --git a/server/test/migrations.test.ts b/server/test/migrations.test.ts
index a9e1780..233971b 100644
--- a/server/test/migrations.test.ts
+++ b/server/test/migrations.test.ts
@@ -91,3 +91,31 @@ it("0002 đổi mã gói, giữ dữ liệu, khóa ngoại, index và bộ đế
   const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_new'").all()).results;
   expect(tables).toEqual([]);
 });
+
+it("0002 ánh xạ đủ ba mã cũ; mã khác giữ nguyên để CHECK chặn (chạy lại trên dữ liệu đã đổi không đổi gì)", async () => {
+  // Lấy đúng biểu thức CASE trong file migration (có hai chỗ: licenses và orders, phải giống hệt nhau) rồi chạy trên
+  // bảng thăm dò. Không thể chạy 0002 trên license đã là 'monthly'/'yearly': CHECK của 0001 không cho ghi mã đó.
+  const sql = env.TEST_MIGRATIONS.find((m) => m.name === "0002_three_plans_trials.sql")!.queries.join("\n");
+  const cases = sql.match(/CASE plan[\s\S]*?END/g) ?? [];
+  expect(cases).toHaveLength(2);
+  expect(cases[0]).toBe(cases[1]);
+  await db.prepare("CREATE TABLE plan_probe (plan TEXT)").run();
+  const codes = ["pro", "pro_x2", "pro_x5", "monthly", "yearly", "mã_lạ"];
+  await db.batch(codes.map((c) => db.prepare("INSERT INTO plan_probe (plan) VALUES (?)").bind(c)));
+  const mapped = await db.prepare(`SELECT plan, ${cases[0]} AS mapped FROM plan_probe`).all<{ plan: string; mapped: string }>();
+  expect(Object.fromEntries(mapped.results.map((r) => [r.plan, r.mapped]))).toEqual({
+    pro: "monthly",
+    pro_x2: "monthly",
+    pro_x5: "yearly",
+    monthly: "monthly",
+    yearly: "yearly",
+    // Mã lạ không bị gộp vào gói nào: ghi vào bảng mới thì CHECK từ chối, migration dừng thay vì tặng nhầm gói.
+    mã_lạ: "mã_lạ",
+  });
+  await db.prepare("DROP TABLE plan_probe").run();
+  await expect(
+    db
+      .prepare("INSERT INTO licenses (id, license_key, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES ('Lx', 'Kx', 'mã_lạ', 1, 0, 0, 0)")
+      .run(),
+  ).rejects.toThrow(/CHECK/);
+});
diff --git a/server/test/world.ts b/server/test/world.ts
index d5d5008..7b6082f 100644
--- a/server/test/world.ts
+++ b/server/test/world.ts
@@ -88,9 +88,9 @@ export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
 
   /**
    * "Khách B" (review cuối, Q1): một khách khác, để test ranh giới giữa các license và email. B mua bằng email riêng, có
-   * 2 máy đang kích hoạt (đang xung đột, spec 2026-10-07 §4.1: máy 2 xác nhận "Vẫn kích hoạt"), 2 máy đã gỡ, và 3 lần tự
-   * gỡ trong 30 ngày (hơn ngưỡng 2 của luật khóa tạm). B không bị khóa, vì máy cuối kích hoạt lại là máy B tự gỡ. Mọi
-   * request của B đi từ IP riêng, không đụng bộ đếm của test.
+   * 2 máy đang kích hoạt (đang xung đột, spec 2026-10-07 §4.1: máy 2 xác nhận "Vẫn kích hoạt"), 2 máy đã gỡ, và 2 lần tự
+   * gỡ trong 30 ngày (đúng ngưỡng 2 của luật khóa tạm, nên B chưa bị khóa; vào bằng allow_conflict thì mọi lần gỡ đều
+   * tính, nên B không thể có nhiều hơn). Mọi request của B đi từ IP riêng, không đụng bộ đếm của test.
    */
   async function customerB() {
     const email = "khach-b@example.com";
@@ -120,9 +120,6 @@ export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
     }
     const b1 = await activate(1);
     const b2 = await activate(2, true);
-    // Lần gỡ thứ 3 rồi kích hoạt lại đúng máy đó: trừ chính máy này thì còn 2 lần, chưa quá ngưỡng.
-    await deactivate(b2, 2);
-    if ((await activate(2, true)) !== b2) throw new Error("khách B: máy 2 không dùng lại activation cũ");
     return {
       email,
       licenseKey,
PATCH
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
pnpm exec vitest run test/licenses.test.ts test/email.test.ts test/migrations.test.ts test/admin.test.ts
```

Kết quả mong đợi: `Tests  5 failed | 137 passed (142)`: `mỗi key chỉ dùng trên 1 máy…` (email, thiếu câu mới), `allow_conflict có mặt mà không phải boolean (null)…` (`200` thay vì `400`), `hai người dùng chung key gỡ qua gỡ lại bằng xác nhận xung đột: khóa sau 3 lần gỡ…` (`expected 6 to be 3`), `máy lạ vào bằng allow_conflict, bị chủ key gỡ từ xa 3 lần…` (`[409, 409, 409, 409]` thay vì `[409, 409, 409, 423]`), `0002 ánh xạ đủ ba mã cũ…` (mã lạ bị gộp thành `monthly`).

- [ ] **Step 3: Viết code**

```bash
git apply <<'PATCH'
diff --git a/server/migrations/0002_three_plans_trials.sql b/server/migrations/0002_three_plans_trials.sql
index 91ecd7b..9e58219 100644
--- a/server/migrations/0002_three_plans_trials.sql
+++ b/server/migrations/0002_three_plans_trials.sql
@@ -1,5 +1,6 @@
 -- Ba gói (spec 2026-10-07): mã gói 'pro', 'pro_x2', 'pro_x5' đổi thành 'monthly', 'yearly'; thêm bảng dùng thử theo máy.
--- Đổi mã: 'pro', 'pro_x2' → 'monthly'; 'pro_x5' → 'yearly'. Mọi cột khác giữ nguyên giá trị.
+-- Đổi mã: 'pro', 'pro_x2' → 'monthly'; 'pro_x5' → 'yearly'. Mọi cột khác giữ nguyên giá trị. Mã khác (kể cả
+-- 'monthly', 'yearly' đã đổi sẵn) giữ nguyên: mã lạ bị CHECK của bảng mới từ chối, migration dừng thay vì gộp nhầm gói.
 --
 -- SQLite không sửa được CHECK, nên phải dựng lại licenses và orders. licenses là bảng cha của activations,
 -- deactivations và orders; xóa bảng cha khi còn bảng con trỏ tới là vi phạm khóa ngoại, và PRAGMA defer_foreign_keys
@@ -27,7 +28,9 @@ CREATE TABLE licenses_new (
 );
 INSERT INTO licenses_new (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, version,
                           last_order_code, created_at, revoked_at, locked_at, lock_cleared_at)
-  SELECT id, license_key, email, CASE plan WHEN 'pro_x5' THEN 'yearly' ELSE 'monthly' END, expires_at, cycle_anchor,
+  SELECT id, license_key, email,
+         CASE plan WHEN 'pro' THEN 'monthly' WHEN 'pro_x2' THEN 'monthly' WHEN 'pro_x5' THEN 'yearly' ELSE plan END,
+         expires_at, cycle_anchor,
          anchor_applied_at, version, last_order_code, created_at, revoked_at, locked_at, lock_cleared_at
   FROM licenses;
 
@@ -60,7 +63,8 @@ INSERT INTO orders_new (order_code, order_token_hash, provider, provider_ref, pl
                         email_consent_at, renew_license_id, license_id, grant_kind, status, amount_paid, created_at,
                         expires_at, paid_at, last_checked_at, email_sent_at, email_attempts, email_retry_at,
                         email_gave_up_at)
-  SELECT order_code, order_token_hash, provider, provider_ref, CASE plan WHEN 'pro_x5' THEN 'yearly' ELSE 'monthly' END,
+  SELECT order_code, order_token_hash, provider, provider_ref,
+         CASE plan WHEN 'pro' THEN 'monthly' WHEN 'pro_x2' THEN 'monthly' WHEN 'pro_x5' THEN 'yearly' ELSE plan END,
          amount, currency, email, email_consent_at, renew_license_id, license_id, grant_kind, status, amount_paid,
          created_at, expires_at, paid_at, last_checked_at, email_sent_at, email_attempts, email_retry_at,
          email_gave_up_at
diff --git a/server/src/email/templates.ts b/server/src/email/templates.ts
index 872d69b..18400c1 100644
--- a/server/src/email/templates.ts
+++ b/server/src/email/templates.ts
@@ -39,12 +39,12 @@ export function licenseEmail(kind: LicenseEmailKind, entries: LicenseEmailEntry[
     "License key:",
     ...lines,
     "",
-    "Mở app, vào Cài đặt > Bản quyền, dán key để kích hoạt. Mỗi key dùng được trên 2 máy.",
+    "Mở app, vào Cài đặt > Bản quyền, dán key để kích hoạt. Mỗi key dùng trên 1 máy.",
     "Giữ email này để kích hoạt máy khác hoặc cài lại máy.",
     "",
     "---",
     `Thank you for using ${PRODUCT_NAME}.`,
-    "Open the app, go to Settings > License and paste the key. Each key works on 2 computers.",
+    "Open the app, go to Settings > License and paste the key. Each key works on 1 computer.",
     "Keep this email to activate another computer or reinstall.",
   ].join("\n");
   return { subject: SUBJECTS[kind], text };
diff --git a/server/src/licenses.ts b/server/src/licenses.ts
index 4cec59d..272ac0b 100644
--- a/server/src/licenses.ts
+++ b/server/src/licenses.ts
@@ -187,7 +187,8 @@ export function registerLicenses(app: Hono<AppEnv>) {
     const deviceIdHash = parseDeviceIdHash(body?.device_id_hash);
     const deviceLabel = parseDeviceLabel(body?.device_label);
     if (!body || !deviceIdHash || !deviceLabel) return fail(c, 400, "invalid_request");
-    const allowConflict = body.allow_conflict ?? false;
+    // Thiếu là false; có mặt thì phải là boolean (null, số, chuỗi đều 400).
+    const allowConflict = body.allow_conflict === undefined ? false : body.allow_conflict;
     if (typeof allowConflict !== "boolean") return fail(c, 400, "invalid_request", { field: "allow_conflict" });
     const found = await findLicense(db, body.key);
     if (!found.ok || !found.lic) {
@@ -215,13 +216,15 @@ export function registerLicenses(app: Hono<AppEnv>) {
     const since = Math.max(now - DEACTIVATION_WINDOW_SECONDS, lic.lock_cleared_at ?? 0);
     // Số lần người dùng gỡ trong 30 ngày, trừ các lần gỡ chính máy đang xin kích hoạt:
     // gỡ rồi kích hoạt lại cùng một máy không bị khóa, còn xoay vòng giữa nhiều máy thì bị.
+    // Riêng khi máy vào bằng allow_conflict (đẩy key sang trạng thái xung đột, khóa cả máy đang giữ key) thì đếm mọi lần
+    // gỡ, kể cả của chính máy xin: một máy lạ cứ vào rồi bị chủ key gỡ lại không được tự do lặp lại.
     // Đếm trên bảng deactivations, vì kích hoạt lại dùng lại dòng activation cũ (QĐ35).
     const recent = await db
       .prepare(
         `SELECT COUNT(*) AS n FROM deactivations d JOIN activations a ON a.id = d.activation_id
-         WHERE d.license_id = ? AND d.by = 'user' AND d.at > ? AND a.device_id_hash <> ?`,
+         WHERE d.license_id = ?1 AND d.by = 'user' AND d.at > ?2 AND (?4 = 1 OR a.device_id_hash <> ?3)`,
       )
-      .bind(lic.id, since, deviceIdHash)
+      .bind(lic.id, since, deviceIdHash, allowConflict ? 1 : 0)
       .first<{ n: number }>();
     if ((recent?.n ?? 0) > MAX_DEACTIVATIONS_IN_WINDOW) {
       // Chỉ khóa khi chưa khóa: nhiều request cùng lúc thì một request khóa, một dòng nhật ký, một cảnh báo.
diff --git a/server/src/plans.ts b/server/src/plans.ts
index 83a4e0b..3db8de1 100644
--- a/server/src/plans.ts
+++ b/server/src/plans.ts
@@ -15,7 +15,7 @@ export const DAY_SECONDS = 86400;
 export interface PlanConfig {
   /** Hạn mức dịch mỗi chu kỳ 30 ngày, mỗi máy, tính bằng phút; null là không giới hạn. */
   quota_minutes_per_cycle: number | null;
-  /** Số ngày mỗi đơn (30). */
+  /** Số ngày mỗi đơn (30 hay 365, theo gói). */
   days_per_order: number;
   /** Giá theo loại tiền, số nguyên theo đơn vị nhỏ nhất (VND không có đơn vị lẻ). */
   prices: Record<string, number>;
PATCH
```

- [ ] **Step 4: Chạy test, thấy xanh**

```bash
pnpm exec vitest run test/licenses.test.ts test/email.test.ts test/migrations.test.ts test/admin.test.ts
pnpm check
```

Kết quả mong đợi: Lệnh đầu `Tests  142 passed (142)`. `pnpm check` thoát mã 0: `Test Files  20 passed (20)`, `Tests  418 passed (418)` (11 test mới so với Task 8: 4 cho `allow_conflict` không phải boolean cộng 1 cho "thiếu hay false", 4 cho khóa tạm khi vào bằng `allow_conflict`, 1 email, 1 ánh xạ migration).

- [ ] **Step 5: Kiểm khớp cây tham chiếu rồi commit**

```bash
git add -A server
git diff --cached --stat 107c807 -- server   # phải không in gì
git commit -m "fix(server): sửa sau review cuối: email 1 máy, khóa tạm khi vào bằng allow_conflict, ánh xạ mã gói đủ ba mã, allow_conflict null

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

---

## Task 10: Kiểm cuối

- [ ] **Step 1: Không còn mã gói, tên gói hay mã lỗi cũ trong code server**

```bash
grep -rnE "pro_x2|pro_x5|Professional|device_limit|MAX_DEVICES = 2|2 máy\.|2 computers" src scripts wrangler.jsonc wrangler.admin.jsonc
```

Kết quả mong đợi: không in gì. (Mã cũ chỉ còn ở `migrations/0001_init.sql` và phần ánh xạ của `0002` như lịch sử, và trong test làm dữ liệu cũ hay input bị từ chối.)

- [ ] **Step 2: Bộ kiểm đầy đủ và khớp cây tham chiếu**

```bash
pnpm check
git status --porcelain server
git diff --stat 107c807 -- server
```

Kết quả mong đợi: `pnpm check` thoát mã 0 (`Tests  418 passed (418)`); `git status` và `git diff` không in gì.

- [ ] **Step 3: Báo cho controller**

Báo: đỉnh commit, `pnpm check` xanh, và nhắc ba việc thuộc kế hoạch khác:
- kế hoạch 02 (app) dùng vector `server/test/vectors/token-v1.json` mới và trường `devices`;
- kế hoạch 03 chạy migration `0002` và deploy production (chỉ khi chủ dự án cho phép); spec và kế hoạch 03 đã ghi ngưỡng khóa tạm là 2, và (Task 9) khi vào bằng `allow_conflict` thì mọi lần gỡ đều tính ("Điều chỉnh" mục 4 và 10);
- trước khi chạy `0002` trên production, đếm license đang có 2 máy kích hoạt (spec mục 5.2).
