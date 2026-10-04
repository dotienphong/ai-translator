# Một môi trường production · 02: Server (license server, Cloudflare Workers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Xóa môi trường staging và môi trường "dev" khỏi cấu hình và code của license server: cấu hình gốc `wrangler.jsonc` và `wrangler.admin.jsonc` thành cấu hình production duy nhất, triển khai bằng `wrangler deploy` không còn `--env`; bỏ dải số đơn riêng của staging; đổi các nhánh "ngoài dev" thành "ngoài test".

**Kiến trúc:** Biến `ENVIRONMENT` **giữ lại** nhưng chỉ còn hai giá trị: `"production"` (đặt cố định trong file wrangler) và `"test"` (chỉ `vitest.config.ts` ghi đè). Ba nơi cần nới lỏng khi test (chỉ HTTPS, khóa ký `test-*`, `ACCESS_AUD` bắt buộc) đổi điều kiện từ `!== "dev"` thành `!== "test"`. Một test Node mới khóa cấu hình: không còn khối `env`, `ENVIRONMENT` là `production`.

**Công nghệ:** TypeScript, Hono, Cloudflare Workers, Vitest + `@cloudflare/vitest-plugin`, wrangler 4.145.0, Node `node --test`. Không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-10-04-single-production-environment-design.md` mục 4, 5.

## Điều chỉnh so với spec (đã đối chiếu code)

Spec mục 4 viết "bỏ biến `ENVIRONMENT`". Khi đọc code và test thì không làm vậy được mà không viết lại hàng chục test: ba điểm nới lỏng cho test (HTTPS, khóa `test-*`, `ACCESS_AUD`) đều dựa vào `ENVIRONMENT`, và vitest đọc `wrangler.jsonc`. Cách thay thế an toàn tương đương: `ENVIRONMENT` còn hai giá trị `production` / `test`; file wrangler luôn đặt `production`, giá trị `test` chỉ có trong `vitest.config.ts`, và một test Node khóa điều đó. Không còn `dev` hay `staging` ở đâu. Kế hoạch 03 Task 5 sửa spec cho khớp.

Hệ quả cho ai triển khai: `wrangler deploy` không có `--env`; tên Worker là `mt-license` và `mt-license-admin` (trước là `mt-license-<env>`); vì chưa deploy nên không có gì phải chuyển.

## Cấu trúc file

| File | Việc |
|---|---|
| `server/vitest.config.ts` | Ghi đè `ENVIRONMENT: "test"` |
| `server/src/{app,admin,deps,env,checkout}.ts`, `server/src/payment/payos.ts` | Đổi điều kiện `dev` → `test`; bỏ trần staging; sửa chú thích |
| `server/test/{app,admin,checkout}.test.ts` | Theo ngữ nghĩa mới |
| `server/wrangler.jsonc`, `server/wrangler.admin.jsonc` | Viết lại: một cấu hình production |
| `server/test/node/wrangler-config.test.mjs` (mới) | Khóa cấu hình |
| `server/package.json` | `dry-run` không còn `--env` |
| `server/scripts/{gen-token-key,verify-token}.mjs`, `server/test/node/gen-token-key.test.mjs`, `server/test/fixtures/*.json` | Bỏ staging khỏi script, ví dụ, test |

Mọi lệnh chạy ở `/Users/dtphong/Desktop/software_business/ai-translator/server` (gọi `cd server` một lần). Commit kết thúc bằng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

## Task 1: `ENVIRONMENT` chỉ còn `production` / `test`; bỏ trần staging

**Files:**
- Modify: `server/vitest.config.ts`
- Modify: `server/src/app.ts:16-17`, `server/src/admin.ts:53`, `server/src/deps.ts:40-41`, `server/src/env.ts:6,41`, `server/src/checkout.ts:16-21,102`, `server/src/payment/payos.ts:72`
- Modify: `server/test/app.test.ts`, `server/test/admin.test.ts`, `server/test/checkout.test.ts`

- [ ] **Step 1: Viết lại test theo ngữ nghĩa mới (red)**

`server/test/app.test.ts`:

1a. Hàm `keyEnv` (dòng 9): `environment = "dev"` → `environment = "test"`.

1b. Test HTTPS (dòng 19-24).

Cũ:
```ts
  it("ngoài dev chỉ nhận HTTPS (§10.2)", async () => {
    const w = makeWorld({ ENVIRONMENT: "staging" });
```
Mới:
```ts
  it("ở production chỉ nhận HTTPS (§10.2)", async () => {
    const w = makeWorld({ ENVIRONMENT: "production" });
```

1c. Test khóa `test-*` (dòng 33-37).

Cũ:
```ts
  it("khóa test-* không dùng được ngoài dev", async () => {
    await expect(loadSigningKey(await keyEnv("a", "staging"))).rejects.toThrow(/test-/);
    await expect(loadSigningKey(await keyEnv("a", "production"))).rejects.toThrow(/test-/);
    expect((await loadSigningKey(await keyEnv("a"))).kid).toBe("test-1");
  });
```
Mới:
```ts
  it("khóa test-* không dùng được ở production", async () => {
    await expect(loadSigningKey(await keyEnv("a", "production"))).rejects.toThrow(/test-/);
    expect((await loadSigningKey(await keyEnv("a"))).kid).toBe("test-1");
  });
```

1d. Dòng 78: `expect(env.ENVIRONMENT).toBe("dev");` → `expect(env.ENVIRONMENT).toBe("test");`

`server/test/admin.test.ts`:

1e. Test `ngoài dev, ACCESS_AUD trống…` (dòng 102-107).

Cũ:
```ts
  it("ngoài dev, ACCESS_AUD trống thì mọi request bị 403 (fail closed)", async () => {
    const { adminCall } = makeAdmin({ ENVIRONMENT: "staging", ACCESS_AUD: "" });
    expect(await adminCall("/admin/whoami")).toMatchObject({ status: 403, body: { error: "forbidden" } });
    const ok = makeAdmin({ ENVIRONMENT: "staging", ACCESS_AUD: "aud-1" });
```
Mới:
```ts
  it("ở production, ACCESS_AUD trống thì mọi request bị 403 (fail closed)", async () => {
    const { adminCall } = makeAdmin({ ENVIRONMENT: "production", ACCESS_AUD: "" });
    expect(await adminCall("/admin/whoami")).toMatchObject({ status: 403, body: { error: "forbidden" } });
    const ok = makeAdmin({ ENVIRONMENT: "production", ACCESS_AUD: "aud-1" });
```

1f. Origin giả của Worker API: đổi mọi `mt-license-staging.example.workers.dev` thành `mt-license.example.workers.dev` trong file này (dòng 21 và 723-729):

Run: `sed -i '' 's/mt-license-staging\.example\.workers\.dev/mt-license.example.workers.dev/g' test/admin.test.ts && grep -c "mt-license.example.workers.dev" test/admin.test.ts`
Expected: một số lớn hơn 0 (khoảng 7).

`server/test/checkout.test.ts`: thay hai test (dòng 162-181) `staging chỉ dùng số đơn tới 999.999…` và `production (và dev) không bị trần của staging…` bằng một test:

```ts
  it("số đơn không còn dải riêng theo môi trường: 1.000.000 vẫn tạo đơn được ở mọi giá trị ENVIRONMENT", async () => {
    await env.DB.exec(reserveSql(999_999));
    for (const ENVIRONMENT of ["production", "test"]) {
      const w = makeWorld({ ENVIRONMENT });
      const res = await w.call("POST", "/v1/checkout", valid);
      expect(res.status).toBe(201);
    }
  });
```
(Test trần 9.999.999 ở dòng 152-160 giữ nguyên: đó là trần chung của mô tả `AT<order_code>`.)

- [ ] **Step 2: Chạy test, thấy fail**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm exec vitest run test/app.test.ts test/admin.test.ts test/checkout.test.ts 2>&1 | tail -30`
Expected: FAIL. Các test dùng `keyEnv` mặc định (`"test"`) bị `loadSigningKey` từ chối vì code còn `!== "dev"`; test `env.ENVIRONMENT` còn là `"dev"` (cấu hình gốc chưa đổi).

- [ ] **Step 3: Ghi đè `ENVIRONMENT` trong vitest**

`server/vitest.config.ts`: sau khối `FAKE_SECRETS`, thêm hằng, và thêm vào `bindings`.

Cũ:
```ts
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, ...FAKE_SECRETS } },
```
Mới:
```ts
        // ENVIRONMENT = "test" chỉ có ở đây: wrangler*.jsonc luôn đặt "production" (test/node/wrangler-config.test.mjs khóa
        // điều đó). Giá trị này nới ba chỗ cho test: chỉ HTTPS, khóa ký test-*, ACCESS_AUD bắt buộc.
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, ...FAKE_SECRETS, ENVIRONMENT: "test" } },
```

- [ ] **Step 4: Sửa code**

`server/src/app.ts:16-17`:

Cũ:
```ts
    // Chỉ HTTPS (§10.2). Chạy cục bộ và test (ENVIRONMENT=dev) thì bỏ qua.
    if (c.env.ENVIRONMENT !== "dev" && new URL(c.req.url).protocol !== "https:") return fail(c, 403, "forbidden");
```
Mới:
```ts
    // Chỉ HTTPS (§10.2). Riêng test (ENVIRONMENT=test, chỉ có trong vitest.config.ts) thì bỏ qua.
    if (c.env.ENVIRONMENT !== "test" && new URL(c.req.url).protocol !== "https:") return fail(c, 403, "forbidden");
```

`server/src/admin.ts:53`: `const audRequired = c.env.ENVIRONMENT !== "dev";` → `const audRequired = c.env.ENVIRONMENT !== "test";`

`server/src/deps.ts:40-42`:

Cũ:
```ts
  if (env.ENVIRONMENT !== "dev" && key.kid.startsWith("test-")) {
    throw new Error("khóa test-* chỉ dùng được khi ENVIRONMENT=dev");
  }
```
Mới:
```ts
  if (env.ENVIRONMENT !== "test" && key.kid.startsWith("test-")) {
    throw new Error("khóa test-* chỉ dùng được khi ENVIRONMENT=test");
  }
```

`server/src/env.ts`:
- dòng 6: `/** "dev" | "staging" | "production" */` → `/** "production" (cố định trong wrangler.jsonc) | "test" (chỉ vitest.config.ts) */`
- dòng 41: `/** Audience tag của ứng dụng Access. Bắt buộc khi ENVIRONMENT khác "dev"; trống thì mọi request bị 403. */` → `/** Audience tag của ứng dụng Access. Bắt buộc khi ENVIRONMENT khác "test"; trống thì mọi request bị 403. */`

`server/src/checkout.ts`: xóa dòng 16-21 (chú thích `Staging dùng số đơn…`, hằng `MAX_STAGING_ORDER_CODE` và hàm `maxOrderCode`), tức khối:

```ts
/** Staging dùng số đơn 1 … 999.999, production từ 1.000.001 (QĐ18): staging không bao giờ lấn sang dải của production. */
export const MAX_STAGING_ORDER_CODE = 999_999;

function maxOrderCode(environment: string): number {
  return environment === "staging" ? MAX_STAGING_ORDER_CODE : MAX_ORDER_CODE;
}
```
và thay dòng 102 `if (orderCode > maxOrderCode(c.env.ENVIRONMENT)) {` bằng `if (orderCode > MAX_ORDER_CODE) {`. Sửa chú thích dòng 14-15 nếu nhắc staging (chỉ giữ giải thích trần 9 ký tự).

`server/src/payment/payos.ts:72`:

Run: `sed -i '' 's/giao dịch thử trên staging (Task 20)/giao dịch thử trên production trước phát hành (kế hoạch 05, Task 21)/' src/payment/payos.ts && grep -n "trước phát hành" src/payment/payos.ts`
Expected: một dòng khớp.

- [ ] **Step 5: Chạy test, thấy pass**

Run: `pnpm exec vitest run 2>&1 | tail -20`
Expected: toàn bộ test đạt, gồm `test chạy với secret giả…` kiểm `env.ENVIRONMENT` là `"test"`.

**Nếu `env.ENVIRONMENT` vẫn là `"production"`** (miniflare `bindings` không ghi đè `vars` của wrangler trong phiên bản plugin này): đổi `configPath` của plugin trong `vitest.config.ts` sang một bản sao dành cho test, `server/test/wrangler.test.jsonc` (chép `wrangler.jsonc`, chỉ đổi `"ENVIRONMENT": "test"` và đường dẫn `main` thành `../src/index.ts`). Task 2 khi đó phải làm thêm: test Node khóa file test này chỉ khác `wrangler.jsonc` ở `ENVIRONMENT` và `main`. Chỉ làm khi thật sự cần, và ghi lý do vào commit.

- [ ] **Step 6: Kiểm không còn tham chiếu**

Run: `git grep -nE "MAX_STAGING_ORDER_CODE|maxOrderCode|ENVIRONMENT[^\n]*\"(dev|staging)\"|=== \"staging\"" -- src test`
Expected: không dòng nào.

Run: `pnpm typecheck 2>&1 | tail -5`
Expected: không lỗi.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/app.ts src/admin.ts src/deps.ts src/env.ts src/checkout.ts src/payment/payos.ts test/app.test.ts test/admin.test.ts test/checkout.test.ts
git commit -m "$(cat <<'EOF'
refactor(server): ENVIRONMENT chỉ còn production/test, bỏ trần số đơn của staging

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Cấu hình wrangler một môi trường, kèm test khóa

**Files:**
- Create: `server/test/node/wrangler-config.test.mjs`
- Overwrite: `server/wrangler.jsonc`, `server/wrangler.admin.jsonc`
- Modify: `server/package.json` (`dry-run`)

- [ ] **Step 1: Viết test (red)**

Tạo `server/test/node/wrangler-config.test.mjs`:

```js
// Khóa cấu hình wrangler (spec 2026-10-04, §4): chỉ một môi trường, production. Chạy bằng `pnpm test:scripts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** Đọc JSONC: bỏ dòng chú thích nguyên dòng (`// …`), không đụng `//` trong URL. */
function load(name) {
  const text = readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
}

const api = load("wrangler.jsonc");
const admin = load("wrangler.admin.jsonc");

for (const [name, config] of [
  ["wrangler.jsonc", api],
  ["wrangler.admin.jsonc", admin],
]) {
  test(`${name}: một môi trường, ENVIRONMENT là production`, () => {
    assert.equal("env" in config, false, "không còn khối env (staging hay production riêng)");
    assert.equal(config.vars.ENVIRONMENT, "production");
    assert.equal(config.d1_databases.length, 1);
    assert.equal(config.d1_databases[0].database_name, "mt-license-production");
    assert.doesNotMatch(JSON.stringify(config), /staging|"dev"/i);
  });
}

test("Worker admin gọi đúng Worker API qua service binding", () => {
  assert.equal(api.name, "mt-license");
  assert.equal(admin.name, "mt-license-admin");
  assert.deepEqual(admin.services, [{ binding: "API", service: "mt-license", entrypoint: "AdminRpc" }]);
});

test("Worker API bán đúng bảng gói chính thức (spec §2), không có giá thử", () => {
  const { pro, pro_x2, pro_x5, ...others } = api.vars.PLANS;
  assert.deepEqual(others, {});
  assert.deepEqual(pro, { quota_minutes_per_cycle: 1800, days_per_order: 30, prices: { VND: 50000 } });
  assert.deepEqual(pro_x2, { quota_minutes_per_cycle: 6000, days_per_order: 30, prices: { VND: 150000 } });
  assert.deepEqual(pro_x5, { quota_minutes_per_cycle: null, days_per_order: 30, prices: { VND: 500000 } });
});

test("secret bắt buộc có đủ và không nằm trong vars", () => {
  assert.deepEqual(api.secrets.required, [
    "PAYOS_CLIENT_ID",
    "PAYOS_API_KEY",
    "PAYOS_CHECKSUM_KEY",
    "RESEND_API_KEY",
    "TOKEN_SIGNING_KEY_A",
    "TOKEN_SIGNING_KEY_B",
    "RATE_LIMIT_PEPPER",
  ]);
  for (const name of api.secrets.required) assert.equal(name in api.vars, false, name);
  assert.deepEqual(admin.secrets.required, ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY"]);
});
```

- [ ] **Step 2: Chạy, thấy fail**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && node --test test/node/wrangler-config.test.mjs 2>&1 | tail -25`
Expected: FAIL (còn khối `env`, `ENVIRONMENT` là `dev`, tên Worker, `database_name`).

- [ ] **Step 3: Ghi đè `server/wrangler.jsonc`**

```jsonc
// Worker API công khai của license server (spec §6.8). Chỉ có MỘT môi trường, production (spec 2026-10-04): triển khai bằng
// `wrangler deploy`, không có `--env`. Worker admin cấu hình riêng ở wrangler.admin.jsonc.
// Test (vitest) đọc file này nhưng ghi đè ENVIRONMENT thành "test" và mọi secret thành giá trị giả (vitest.config.ts).
// Secret (PayOS, Resend, khóa ký, pepper, email người vận hành) nhập bằng `wrangler secret put`, không bao giờ ghi vào file này.
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "mt-license",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-26",
  // Chưa có tên miền đã xác thực (spec §15, Q1): dùng *.workers.dev. Có tên miền thì đổi sang route riêng và tắt workers_dev.
  "workers_dev": true,
  "preview_urls": false,
  // Tắt invocation log (log đó lưu cả URL và query của request) và bỏ query khỏi URL trong log và trace (QĐ25).
  // Log JSON do code tự ghi vẫn giữ. Bật Workers Issues để có cảnh báo không phụ thuộc Resend (QĐ27).
  "observability": { "enabled": true, "redact_query_string": true, "logs": { "invocation_logs": false }, "issues": { "enabled": true } },
  "vars": {
    // Luôn "production" ở đây. Giá trị "test" chỉ có trong vitest.config.ts (test/node/wrangler-config.test.mjs khóa điều này).
    "ENVIRONMENT": "production",
    "PAYOS_BASE_URL": "https://api-merchant.payos.vn",
    // Đổi sang địa chỉ trên tên miền đã xác thực SPF, DKIM khi có Q1: Resend chỉ gửi được tới email của chủ tài khoản Resend.
    "EMAIL_FROM": "AI Translator <onboarding@resend.dev>",
    // Giá chính thức (spec §2, chốt 2026-10-01).
    // Không hạ hạn mức của một gói đang bán (spec §6.8, QĐ17): token lấy hạn mức từ bảng hiện hành, nên hạ ở đây là
    // hạ luôn hạn mức của khách đã trả tiền. Muốn bán hạn mức thấp hơn thì thêm gói mới (sửa src/plans.ts và app).
    "PLANS": {
      "pro": { "quota_minutes_per_cycle": 1800, "days_per_order": 30, "prices": { "VND": 50000 } },
      "pro_x2": { "quota_minutes_per_cycle": 6000, "days_per_order": 30, "prices": { "VND": 150000 } },
      "pro_x5": { "quota_minutes_per_cycle": null, "days_per_order": 30, "prices": { "VND": 500000 } }
    },
    // Ô khóa đang ký token: secret TOKEN_SIGNING_KEY_A hay _B (QĐ29). Ô kia là khóa dự phòng.
    // Đổi khóa: đặt sang ô kia rồi deploy (Phụ lục A); giá trị khóa không đi qua máy người vận hành.
    "TOKEN_SIGNING_SLOT": "a"
  },
  "secrets": {
    "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY", "TOKEN_SIGNING_KEY_A", "TOKEN_SIGNING_KEY_B", "RATE_LIMIT_PEPPER"]
  },
  "d1_databases": [
    // database_id: thay bằng ID do `wrangler d1 create mt-license-production` in ra (Task 21).
    { "binding": "DB", "database_name": "mt-license-production", "database_id": "00000000-0000-0000-0000-000000000000" }
  ],
  "triggers": { "crons": ["*/5 * * * *"] }
}
```

- [ ] **Step 4: Ghi đè `server/wrangler.admin.jsonc`**

```jsonc
// Worker admin của license server (§6.8 "Công cụ hỗ trợ"): chỉ mở qua Cloudflare Access
// (dashboard > Workers & Pages > mt-license-admin > Access > Protect this Worker behind Access > All traffic).
// Chỉ có MỘT môi trường, production (spec 2026-10-04): triển khai bằng `wrangler deploy -c wrangler.admin.jsonc`, không có `--env`.
// ACCESS_AUD bắt buộc; trống thì mọi request bị 403. Test (vitest) tự đặt giá trị riêng.
// Dùng chung D1 với Worker API: database_id phải trùng với wrangler.jsonc.
// Bảng gói và "ký thử bằng khóa dự phòng" lấy từ Worker API qua service binding API,
// tới entrypoint AdminRpc (QĐ34). Worker admin không giữ khóa ký nào.
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "mt-license-admin",
  "main": "src/admin-entry.ts",
  "compatibility_date": "2026-09-26",
  "workers_dev": true,
  "preview_urls": false,
  // Tắt invocation log (log đó lưu cả URL và query của request) và bỏ query khỏi URL trong log và trace (QĐ25).
  // Log JSON do code tự ghi vẫn giữ. Bật Workers Issues để có cảnh báo không phụ thuộc Resend (QĐ27).
  "observability": { "enabled": true, "redact_query_string": true, "logs": { "invocation_logs": false }, "issues": { "enabled": true } },
  "vars": {
    "ENVIRONMENT": "production",
    "PAYOS_BASE_URL": "https://api-merchant.payos.vn",
    "EMAIL_FROM": "AI Translator <onboarding@resend.dev>",
    // Bắt buộc (QĐ6): Audience tag của ứng dụng Access, điền ở Task 21, Step 10. Trống thì Worker trả 403 cho mọi request.
    "ACCESS_AUD": "",
    // Origin của Worker API (https://<tên miền license server>), điền ở Task 21, Step 10; confirm-webhook chỉ nhận URL trên origin này.
    "API_ORIGIN": ""
  },
  "secrets": { "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY"] },
  "d1_databases": [
    { "binding": "DB", "database_name": "mt-license-production", "database_id": "00000000-0000-0000-0000-000000000000" }
  ],
  "services": [{ "binding": "API", "service": "mt-license", "entrypoint": "AdminRpc" }]
}
```

- [ ] **Step 5: `dry-run` không còn `--env`**

`server/package.json`:

Cũ:
```json
    "dry-run": "wrangler deploy --dry-run --env staging && wrangler deploy --dry-run --env production && wrangler deploy --dry-run -c wrangler.admin.jsonc --env staging && wrangler deploy --dry-run -c wrangler.admin.jsonc --env production",
```
Mới:
```json
    "dry-run": "wrangler deploy --dry-run && wrangler deploy --dry-run -c wrangler.admin.jsonc",
```

- [ ] **Step 6: Chạy**

Run: `node --test test/node/wrangler-config.test.mjs 2>&1 | tail -15`
Expected: mọi test `pass`. (Nếu `JSON.parse` lỗi vì chú thích cuối dòng, đưa chú thích đó lên dòng riêng.)

Run: `pnpm dry-run 2>&1 | tail -15`
Expected: hai lần `--dry-run: exiting now.` (một cho API, một cho admin), không lỗi cấu hình.

Run: `pnpm exec vitest run 2>&1 | tail -8`
Expected: toàn bộ test đạt (vitest đọc `wrangler.jsonc` mới; `ENVIRONMENT` vẫn là `test`).

- [ ] **Step 7: Commit**

```bash
git add wrangler.jsonc wrangler.admin.jsonc package.json test/node/wrangler-config.test.mjs
git commit -m "$(cat <<'EOF'
refactor(server): wrangler một môi trường production, bỏ env staging, deploy không còn --env

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Script khóa token, ví dụ và fixture không còn staging

**Files:**
- Modify: `server/scripts/gen-token-key.mjs` (chú thích dòng 11, 14-15; thông báo dòng 33)
- Modify: `server/scripts/verify-token.mjs` (đầu file, dòng `envName`)
- Modify: `server/test/node/gen-token-key.test.mjs`, `server/test/fixtures/public-keys.test.json`, `server/test/fixtures/public-keys.bad-retired.test.json`

- [ ] **Step 1: Đổi test và fixture trước (red)**

Run: `sed -i '' 's/stg-2026-/prod-2026-/g' test/node/gen-token-key.test.mjs test/fixtures/public-keys.test.json test/fixtures/public-keys.bad-retired.test.json`

Run: `git grep -nE "stg-|staging" -- test/node test/fixtures`
Expected: không dòng nào. (Nếu fixture có khối `"staging"`, đổi tên khối đó thành `"production"` bằng tay; fixture `public-keys.test.json` hiện chỉ có khối `test` và `retired`.)

Run: `pnpm test:scripts 2>&1 | tail -20`
Expected: các test của `gen-token-key` còn PASS (script chỉ kiểm định dạng kid tổng quát), riêng test nào so khớp câu ví dụ trong thông báo lỗi (`Ví dụ: stg-2026-10-1`) thì FAIL. Nếu mọi test đều pass, bỏ qua ý "red" của bước này; thay đổi ở Step 2 là chú thích và thông báo.

- [ ] **Step 2: Sửa script**

`server/scripts/gen-token-key.mjs`:

- Dòng 11 `//   Quy ước: <env>-<năm>-<tháng>-<số thứ tự>; mỗi khóa mới, kể cả khóa dự phòng, lấy số thứ tự kế tiếp.` → `//   Quy ước: prod-<năm>-<tháng>-<số thứ tự>; mỗi khóa mới, kể cả khóa dự phòng, lấy số thứ tự kế tiếp.`
- Dòng 14-15:

Cũ:
```js
//   node scripts/gen-token-key.mjs stg-2026-10-1 | pnpm exec wrangler secret put TOKEN_SIGNING_KEY_A --env staging
//   node scripts/gen-token-key.mjs stg-2026-10-2 | pnpm exec wrangler secret put TOKEN_SIGNING_KEY_B --env staging
```
Mới:
```js
//   node scripts/gen-token-key.mjs prod-2026-10-1 | pnpm exec wrangler secret put TOKEN_SIGNING_KEY_A
//   node scripts/gen-token-key.mjs prod-2026-10-2 | pnpm exec wrangler secret put TOKEN_SIGNING_KEY_B
```
- Dòng 33: `Ví dụ: stg-2026-10-1` → `Ví dụ: prod-2026-10-1`.

`server/scripts/verify-token.mjs`:

- Dòng 2: `// Kiểm chữ ký một token v1 bằng khóa công khai của môi trường trong server/keys/public-keys.json (ô a hoặc b).` → `// Kiểm chữ ký một token v1 bằng khóa công khai production trong server/keys/public-keys.json (ô a hoặc b).`
- Hai dòng ví dụ (12, 15): bỏ tham số `staging`: `printf '%s' "$TOKEN" | node scripts/verify-token.mjs` và `cloudflared access curl … /admin/keys/test-sign | node scripts/verify-token.mjs`.
- Dòng 21-22:

Cũ:
```js
const args = process.argv.slice(2);
const envName = args[0];
```
Mới:
```js
const args = process.argv.slice(2);
// Chỉ có một môi trường (spec 2026-10-04): khối `production` của public-keys.json.
const envName = "production";
```

- [ ] **Step 3: Chạy**

Run: `pnpm test:scripts 2>&1 | tail -15`
Expected: mọi test `pass`.

Run: `git grep -niE "staging|\bstg\b" -- scripts test/node test/fixtures`
Expected: không dòng nào.

- [ ] **Step 4: Commit**

```bash
git add scripts/gen-token-key.mjs scripts/verify-token.mjs test/node/gen-token-key.test.mjs test/fixtures
git commit -m "$(cat <<'EOF'
chore(server): script khóa token và fixture chỉ nói production

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Kiểm toàn bộ server

**Files:** không sửa file (trừ khi có lỗi).

- [ ] **Step 1: Chạy toàn bộ kiểm của server**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm check 2>&1 | tail -30`
Expected: lần lượt `typecheck`, `vectors:check`, `test` (vitest), `test:scripts`, `dry-run` đều thành công (`pnpm check` thoát mã 0).

- [ ] **Step 2: Không còn dấu vết staging hay dev trong server**

Run: `git grep -niE "staging|\bstg\b|ENVIRONMENT[^\n]*dev|\"dev\"|mt-license-dev" -- . ':!node_modules' ':!pnpm-lock.yaml'`
Expected: không dòng nào. Dòng nào còn thì sửa (trừ `node_modules`). Tên `mt-license-dev` của D1 cũ không còn vì `wrangler.jsonc` đã đổi.

- [ ] **Step 3: Kiểm cờ an toàn của bản triển khai**

Run: `node -e "const t=require('fs').readFileSync('wrangler.jsonc','utf8').replace(/^\s*\/\/.*$/gm,''); const c=JSON.parse(t); if(c.vars.ENVIRONMENT!=='production') process.exit(1); console.log('ENVIRONMENT =', c.vars.ENVIRONMENT)"`
Expected: `ENVIRONMENT = production`.

Run: `pnpm exec wrangler deploy --dry-run --outdir /tmp/mt-license-dryrun 2>&1 | grep -iE "ENVIRONMENT|env\.ENVIRONMENT"`
Expected: dòng liệt kê binding `env.ENVIRONMENT ("production")`, không có `"test"` hay `"dev"`. (Nếu phiên bản wrangler không in bảng binding thì bỏ qua lệnh này; lệnh `node -e` ngay trên đã đủ.)

- [ ] **Step 4: Ghi kết quả**

Không commit gì thêm nếu mọi bước sạch. Báo lại: số test của vitest và `test:scripts`, kết quả `dry-run`.

---

## Tự rà soát (đối chiếu spec mục 4, 5)

| Yêu cầu của spec | Task |
|---|---|
| Xóa `env.staging`; gốc thành production; `deploy` không `--env` | 2 |
| Tên Worker `mt-license`, `mt-license-admin`; service binding và `API_ORIGIN` theo | 2 |
| Bỏ `ENVIRONMENT` (điều chỉnh: còn `production`/`test`) | 1, 2 |
| `ACCESS_AUD` luôn bắt buộc (ngoài test) | 1 (admin.ts), 2 (comment, config) |
| Bỏ dải `order_code` staging | 1 |
| HTTPS cho mọi route (bỏ ngoại lệ dev) | 1 (chỉ `test` được miễn) |
| `dry-run`, `check` một cấu hình | 2, 4 |
| Test bỏ ca staging, thêm ca khóa cấu hình | 1, 2 |
| Script khóa token và fixture | 3 |
| Kênh PayOS staging không còn cần | không có code; kế hoạch 03 Task 5 sửa spec §15 |

Phần không thuộc kế hoạch này: app (kế hoạch 01), script ký manifest, cổng CI, sửa spec và `CLAUDE.md` (kế hoạch 03).
