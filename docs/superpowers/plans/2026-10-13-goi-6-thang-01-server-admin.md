# Gói 6 Months · Kế hoạch 01: server và Web Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** license server và Web Admin biết bán, cấp, tính tiền và hiển thị gói `six_months` (269.000 ₫, 180 ngày, 100 giờ mỗi chu kỳ 30 ngày), mà luồng mua của app cũ không đổi.

**Architecture:** `six_months` là gói thứ ba đi qua các cơ chế chung (`PLAN_CODES`, biến `PLANS`, `computeGrant`). Cần thêm: migration D1 `0003` nới ràng buộc CHECK mã gói (đúng khuôn 0002), cơ chế `GET /v1/plans?plans=` để app cũ không thấy gói mới, và gói thứ ba ở Web Admin. Logic thanh toán, token, hạn mức không phải sửa.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono, D1 (SQLite), Vitest + `@cloudflare/vitest-plugin` (server), React 19 + Recharts + Vitest/jsdom (Web Admin), pnpm.

**Spec:** `docs/superpowers/specs/2026-10-13-six-months-plan-design.md` (§1 quyết định, §2 server). Kế hoạch này là phần 01; phần 02 (app) thêm vector token ở Task 1 của nó, cùng commit với enum gói của Rust (để test hai bên không bao giờ đỏ giữa chừng); phần 03 (website, tài liệu) cần `server/wrangler.jsonc` ở Task 3 của phần này.

---

## Quy ước chung cho mọi task (đọc trước khi làm)

- Thư mục dự án: `/Users/dtphong/Desktop/software_business/ai-translator`. **Mỗi lệnh Bash bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`** (shell không giữ thư mục giữa các lệnh).
- Làm **trực tiếp trên nhánh `main`** (chủ dự án chỉ định). Trước mỗi commit: `git branch --show-current` phải in `main`.
- **Không `git add -A`, không `git add .`.** Trong repo có file chưa theo dõi `docs/superpowers/specs/2026-10-11-doc-to-ban-dich-research.md` của việc khác: không đụng, không đưa vào commit. Luôn `git add` đúng từng đường dẫn của task.
- **Không push, không deploy, không áp migration lên production** (`wrangler deploy`, `wrangler d1 migrations apply … --remote`, `wrangler d1 execute --remote`). `pnpm dry-run` (`wrangler deploy --dry-run`) thì được chạy vì nó không ghi gì lên Cloudflare.
- Kết thúc mỗi commit message bằng đúng dòng sau (sau một dòng trống):
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Chú thích trong code viết tiếng Việt có dấu, cùng giọng với các file xung quanh.
- Mốc test trước khi sửa (đã đo ngày 2026-10-13 ở `HEAD` `4659057`): server **25 file, 631 test**; `pnpm test:scripts` **18 pass, 1 skip**; Web Admin **40 file, 843 test**. Số "Expected" ở các task dưới là tổng sau task đó; lệch vài test thì đọc lại nguyên nhân, đừng sửa số.

## Cấu trúc file

| File | Việc |
|---|---|
| `server/src/plans.ts` | thêm `LEGACY_PLAN_CODES`, `offeredPlanCodes`; thêm tên `6 Months` (Task 1, 3) |
| `server/src/checkout.ts` | `GET /v1/plans` lọc theo `?plans=` (Task 1) |
| `server/src/token.ts` | `PLAN_CODES` thêm `six_months` (Task 3) |
| `server/wrangler.jsonc` | biến `PLANS` thêm `six_months` (Task 3) |
| `server/migrations/0003_six_months_plan.sql` | **mới**: nới CHECK mã gói (Task 2) |
| `server/admin-ui/src/…`, `dev/fake-api.ts`, `scripts/csp-check.mjs` | gói thứ ba ở Web Admin (Task 5) |
| `server/test/*.test.ts`, `server/test/node/wrangler-config.test.mjs`, `server/admin-ui/src/**/*.test.tsx` | test theo từng task |

---

### Task 0: Kiểm môi trường và ghi mốc

**Files:** không sửa file nào, không commit.

- [ ] **Step 1: Kiểm nhánh và cây làm việc**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short`
Expected: dòng đầu `main`; dòng tiếp theo chỉ có `?? docs/superpowers/specs/2026-10-11-doc-to-ban-dich-research.md` (và các file `docs/superpowers/plans/2026-10-13-goi-6-thang-*.md` nếu kế hoạch chưa được commit). Có file khác bị sửa thì **dừng** và hỏi chủ dự án.

- [ ] **Step 2: Chạy bộ test mốc của server**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm test 2>&1 | grep -E "Test Files|Tests " && pnpm test:scripts 2>&1 | grep -E "^ℹ (pass|fail|skipped)" && pnpm vectors:check && echo "vectors:check OK"`
Expected: `tsc --noEmit` không lỗi; `Test Files  25 passed (25)`, `Tests  631 passed (631)`; `ℹ pass 18`, `ℹ fail 0`, `ℹ skipped 1`; `vectors:check OK`.

- [ ] **Step 3: Chạy test mốc của Web Admin**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server/admin-ui && pnpm test 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  40 passed (40)`, `Tests  843 passed (843)`.

---

### Task 1: Danh sách gói theo khả năng của app (`offeredPlanCodes`)

Vì sao làm trước: spec §2.3. App 0.1.8 vẽ mọi gói server trả về nhưng chỉ bán được `monthly`, `yearly`. Task này thêm cơ chế lọc **trước** khi có gói mới, và với hai gói hiện có thì response không đổi một byte (test `/v1/plans` cũ giữ nguyên, phải vẫn xanh).

**Files:**
- Modify: `server/src/plans.ts` (thêm sau dòng `export const DAY_SECONDS = 86400;`)
- Modify: `server/src/checkout.ts` (dòng import `./plans` và handler `GET /v1/plans`)
- Test: `server/test/plans.test.ts`

- [ ] **Step 1: Viết test (đỏ)**

Trong `server/test/plans.test.ts` đổi dòng import:

```ts
import { computeGrant, type LicenseTerms, parsePlans, type PlanTable } from "../src/plans";
```
thành:
```ts
import { computeGrant, LEGACY_PLAN_CODES, type LicenseTerms, offeredPlanCodes, parsePlans, type PlanTable } from "../src/plans";
```

Rồi **thêm vào cuối file** (sau `describe` cuối cùng):

```ts
describe("danh sách gói theo khả năng của app (spec 2026-10-13 §2.3)", () => {
  const all = ["monthly", "six_months", "yearly"] as const;
  const legacy = ["monthly", "yearly"];
  const old = ["monthly", "yearly"];
  const full = ["monthly", "six_months", "yearly"];

  it("gói cũ của server là monthly và yearly", () => {
    expect([...LEGACY_PLAN_CODES]).toEqual(legacy);
  });

  it.each([
    ["không có tham số (app cũ)", undefined, old],
    ["tham số rỗng", "", old],
    ["app khai báo đủ ba gói", "monthly,six_months,yearly", full],
    ["chỉ khai báo gói mới: gói cũ vẫn luôn có", "six_months", full],
    ["thứ tự khai báo không đổi thứ tự kết quả", "yearly,six_months,monthly", full],
    ["khoảng trắng quanh mã", " monthly , six_months ", full],
    ["mã lạ bị bỏ qua", "six_months,pro,free,", full],
    ["khai báo thiếu gói cũ: gói cũ vẫn có", "monthly", old],
    ["rác", "%%%;;;", old],
    ["viết hoa không khớp", "SIX_MONTHS", old],
    ["dài quá 200 ký tự thì coi là rác", `six_months,${"x".repeat(200)}`, old],
  ])("%s → %j", (_why, requested, expected) => {
    expect(offeredPlanCodes(all, legacy, requested)).toEqual(expected);
  });

  it("dài đúng 200 ký tự vẫn đọc", () => {
    const requested = `six_months,${"x".repeat(189)}`;
    expect(requested).toHaveLength(200);
    expect(offeredPlanCodes(all, legacy, requested)).toEqual(full);
  });
});
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/plans.test.ts 2>&1 | grep -v "Using secrets" | grep -E "×|Test Files|Tests |not a function|is not iterable" | head`
Expected: FAIL. Các test của `describe` mới đỏ với `offeredPlanCodes is not a function` / `LEGACY_PLAN_CODES is not iterable` (hai export chưa có); các test cũ của file vẫn xanh.

- [ ] **Step 3: Cài đặt `offeredPlanCodes`**

Trong `server/src/plans.ts`, **thay** dòng:

```ts
export const DAY_SECONDS = 86400;
```
bằng:

```ts
export const DAY_SECONDS = 86400;

/**
 * Mã gói mọi bản app đều bán được (hai gói có từ trước spec 2026-10-13). Gói thêm sau đó chỉ hiện trong GET /v1/plans
 * khi app khai báo mã của nó (`?plans=`): app cũ vẽ mọi gói server trả về nhưng chỉ tạo đơn được cho gói nó biết, nên
 * không được thấy gói lạ.
 */
export const LEGACY_PLAN_CODES: readonly PlanCode[] = ["monthly", "yearly"];
const MAX_PLANS_PARAM_LENGTH = 200;

/**
 * Các mã gói đưa vào GET /v1/plans, theo thứ tự của `codes`. Gói cũ (`legacy`) luôn có; gói khác chỉ có khi `requested`
 * (giá trị của `?plans=`, các mã cách nhau bằng dấu phẩy) nêu mã đó. Thiếu, rỗng, dài quá 200 ký tự hay rác thì chỉ có gói
 * cũ; mã lạ bị bỏ qua. Tham số chỉ thêm gói, không bao giờ bớt gói cũ.
 */
export function offeredPlanCodes<T extends string>(codes: readonly T[], legacy: readonly string[], requested: string | undefined): T[] {
  const asked = new Set(
    requested !== undefined && requested.length <= MAX_PLANS_PARAM_LENGTH ? requested.split(",").map((code) => code.trim()) : [],
  );
  return codes.filter((code) => legacy.includes(code) || asked.has(code));
}
```

- [ ] **Step 4: Nối vào `GET /v1/plans`**

Trong `server/src/checkout.ts` đổi dòng import:

```ts
import { computeGrant, isPlan, PLAN_CODES, PLAN_NAMES, parsePlans, type PlanCode } from "./plans";
```
thành:
```ts
import { computeGrant, isPlan, LEGACY_PLAN_CODES, offeredPlanCodes, PLAN_CODES, PLAN_NAMES, parsePlans, type PlanCode } from "./plans";
```

và **thay** khối đầu của `registerCheckout`:

```ts
  // Bảng gói trả phí cho màn hình Nâng cấp của app (§4.3). Free không có ở đây: hạn mức Free là hằng số phía app.
  app.get("/v1/plans", (c) => {
    const plans = parsePlans(c.env.PLANS);
    if (!plans) return fail(c, 503, "pricing_not_configured");
    return c.json({
      plans: PLAN_CODES.map((code) => ({
```
bằng:
```ts
  // Bảng gói trả phí cho màn hình Nâng cấp của app (§4.3). Free không có ở đây: hạn mức Free là hằng số phía app.
  // `?plans=` là các mã gói app bán được: app cũ không gửi nên chỉ thấy gói cũ (spec 2026-10-13 §2.3).
  app.get("/v1/plans", (c) => {
    const plans = parsePlans(c.env.PLANS);
    if (!plans) return fail(c, 503, "pricing_not_configured");
    return c.json({
      plans: offeredPlanCodes(PLAN_CODES, LEGACY_PLAN_CODES, c.req.query("plans")).map((code) => ({
```
(giữ nguyên các dòng sau đó của `.map`.)

- [ ] **Step 5: Chạy lại, thấy xanh**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm test 2>&1 | grep -v "Using secrets" | grep -E "×|Test Files|Tests "`
Expected: `tsc` không lỗi; `Test Files  25 passed (25)`, `Tests  644 passed (644)` (631 + 13). Test `GET /v1/plans` cũ của `checkout.test.ts` vẫn xanh **không sửa gì**: đó là bằng chứng app cũ nhận response như cũ.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/plans.ts server/src/checkout.ts server/test/plans.test.ts && git commit -q -m "$(cat <<'EOF'
feat(server): GET /v1/plans lọc gói theo ?plans= (app cũ chỉ thấy gói cũ)

Cơ chế cho gói 6 Months (spec 2026-10-13 §2.3): gói monthly, yearly luôn có;
gói thêm sau chỉ hiện khi app khai báo mã của nó. Hai gói hiện có thì response
không đổi một byte.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

### Task 2: Migration D1 `0003_six_months_plan.sql`

Vì sao trước khi thêm mã gói: migration chỉ **nới** CHECK nên Worker cũ vẫn chạy trên schema mới; làm sớm để các test DB của Task 3 và 4 ghi được `six_months`. Khuôn: `server/migrations/0002_three_plans_trials.sql` (đã chạy thật trên production). Đây là phần rủi ro nhất của cả đợt: đừng bỏ bước kiểm đột biến ở Step 5.

**Files:**
- Create: `server/migrations/0003_six_months_plan.sql`
- Modify: `server/test/migrations.test.ts`

- [ ] **Step 1: Sửa phần đầu và test cũ của `migrations.test.ts`**

Trong `server/test/migrations.test.ts`:

1) **Thay** dòng chú thích đầu file:
```ts
// Chạy 0001 trên D1 trống riêng (MIGRATION_DB), ghi dữ liệu theo mã gói cũ, rồi chạy 0002 (spec 2026-10-07 §5.1).
```
bằng:
```ts
// Chạy 0001 trên D1 trống riêng (MIGRATION_DB), ghi dữ liệu theo mã gói cũ, rồi chạy 0002 (spec 2026-10-07 §5.1), rồi 0003
// (spec 2026-10-13 §2.2). Các test chạy lần lượt trên cùng một D1, nên thứ tự của chúng là một phần của bài kiểm.
```

2) **Thay** test đếm migration:
```ts
it("có đúng hai migration theo thứ tự", () => {
  expect(names).toEqual(["0001_init.sql", "0002_three_plans_trials.sql"]);
});
```
bằng:
```ts
it("có đúng ba migration theo thứ tự", () => {
  expect(names).toEqual(["0001_init.sql", "0002_three_plans_trials.sql", "0003_six_months_plan.sql"]);
});
```

3) Trong test `0002 đổi mã gói, giữ dữ liệu, khóa ngoại, index và bộ đếm số đơn`, **thay**:
```ts
  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  expect((await db.prepare("SELECT id, plan, expires_at, cycle_anchor, version FROM licenses ORDER BY id").all()).results).toEqual([
```
bằng:
```ts
  // Chỉ 0001 và 0002: test này kiểm riêng 0002; 0003 có test riêng ở cuối file.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 2));

  expect((await db.prepare("SELECT id, plan, expires_at, cycle_anchor, version FROM licenses ORDER BY id").all()).results).toEqual([
```

- [ ] **Step 2: Thêm test 0003 vào cuối `migrations.test.ts` (đỏ)**

**Thêm vào cuối file:**

```ts

it("0003 nới CHECK mã gói: giữ nguyên dữ liệu, khóa ngoại, index, bộ đếm; schema chỉ khác chuỗi CHECK", async () => {
  // D1 đang ở trạng thái sau 0002 (hai test trên chỉ áp hai migration đầu) và còn dữ liệu của test đầu.
  const sqlOf = async () =>
    Object.fromEntries(
      (
        await db
          .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('licenses', 'orders', 'activations', 'deactivations')")
          .all<{ name: string; sql: string }>()
      ).results.map((r) => [r.name, r.sql]),
    );
  const indexesOf = async () =>
    (await db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results;
  const dump = async () => ({
    licenses: (await db.prepare("SELECT * FROM licenses ORDER BY id").all()).results,
    orders: (await db.prepare("SELECT * FROM orders ORDER BY order_code").all()).results,
    activations: (await db.prepare("SELECT * FROM activations ORDER BY id").all()).results,
    deactivations: (await db.prepare("SELECT * FROM deactivations ORDER BY id").all()).results,
  });
  const sequences = async () =>
    Object.fromEntries(
      (await db.prepare("SELECT name, seq FROM sqlite_sequence WHERE name IN ('orders', 'deactivations')").all<{ name: string; seq: number }>()).results.map(
        (r) => [r.name, r.seq],
      ),
    );
  const insertLicense = (id: string, plan: string) =>
    db.prepare(
      `INSERT INTO licenses (id, license_key, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES ('${id}', 'K-${id}', '${plan}', 1, 0, 0, 0)`,
    );

  // Trước 0003: mã six_months chưa vào được.
  await expect(insertLicense("Lx", "six_months").run()).rejects.toThrow(/CHECK/);

  // Thêm dòng có MỌI cột khác nhau (và cả giá trị NULL) để việc chép sai cột lộ ra.
  await db.batch([
    db.prepare(
      `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, version, last_order_code, created_at, revoked_at, locked_at, lock_cleared_at)
       VALUES ('L4', 'K4', 'full@example.com', 'yearly', 101, 102, 103, 4, 1000010, 105, 106, 107, 108)`,
    ),
    db.prepare(
      `INSERT INTO orders (order_code, order_token_hash, provider, provider_ref, plan, amount, currency, email, email_consent_at, renew_license_id, license_id, grant_kind, status, amount_paid, created_at, expires_at, paid_at, last_checked_at, email_sent_at, email_attempts, email_retry_at, email_gave_up_at)
       VALUES (1000020, 'hash-20', 'payos', 'ref-20', 'monthly', 50000, 'VND', 'full@example.com', 11, 'L4', 'L4', 'change', 'paid', 49000, 12, 13, 14, 15, 16, 6, 17, 18)`,
    ),
    db.prepare(
      `INSERT INTO activations (id, license_id, device_id_hash, device_label, quota_epoch, epoch_pending, epoch_window_start, created_at, last_validated_at, deactivated_at, deactivated_by)
       VALUES ('A4', 'L4', 'device-4', 'Máy 4', 2, 1, 21, 22, 23, 24, 'admin')`,
    ),
    db.prepare("INSERT INTO deactivations (license_id, activation_id, at, by) VALUES ('L4', 'A4', 25, 'admin')"),
  ]);

  const schemaBefore = await sqlOf();
  const indexesBefore = await indexesOf();
  const dataBefore = await dump();
  const seqBefore = await sequences();
  expect(dataBefore.licenses.length).toBeGreaterThanOrEqual(4);
  expect(dataBefore.orders.length).toBeGreaterThanOrEqual(4);

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  // Dữ liệu: từng dòng, từng cột giữ nguyên (không đổi mã gói nào).
  expect(await dump()).toEqual(dataBefore);
  // Schema: giống hệt sau 0002, chỉ khác chuỗi CHECK của licenses và orders.
  const old = "CHECK (plan IN ('monthly', 'yearly'))";
  const next = "CHECK (plan IN ('monthly', 'six_months', 'yearly'))";
  const schemaAfter = await sqlOf();
  expect(schemaBefore.licenses).toContain(old);
  expect(schemaBefore.orders).toContain(old);
  expect(schemaAfter).toEqual({
    licenses: schemaBefore.licenses!.replace(old, next),
    orders: schemaBefore.orders!.replace(old, next),
    activations: schemaBefore.activations,
    deactivations: schemaBefore.deactivations,
  });
  expect(await indexesOf()).toEqual(indexesBefore);
  expect((await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_new'").all()).results).toEqual([]);

  // Khóa ngoại vẫn trỏ về bảng licenses (không phải licenses_new hay bảng cũ).
  const fks = async (table: string) =>
    (await db.prepare(`SELECT "table" AS target FROM pragma_foreign_key_list('${table}')`).all<{ target: string }>()).results.map((r) => r.target);
  expect(await fks("activations")).toEqual(["licenses"]);
  expect((await fks("deactivations")).sort()).toEqual(["activations", "licenses"]);
  expect(await fks("orders")).toEqual(["licenses", "licenses"]);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);

  // Bộ đếm số đơn và số lần gỡ không lùi: số kế tiếp là số đã dùng cộng một (PayOS không cho dùng lại orderCode).
  expect(await sequences()).toEqual(seqBefore);
  const nextOrder = await db
    .prepare(
      `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at)
       VALUES ('h', 'payos', 'six_months', 269000, 'VND', 0, 'pending', 0, 0) RETURNING order_code`,
    )
    .first<{ order_code: number }>();
  expect(nextOrder?.order_code).toBe(seqBefore.orders! + 1);
  const nextDeactivation = await db
    .prepare("INSERT INTO deactivations (license_id, activation_id, at, by) VALUES ('L4', 'A4', 26, 'user') RETURNING id")
    .first<{ id: number }>();
  expect(nextDeactivation?.id).toBe(seqBefore.deactivations! + 1);

  // Sau 0003: six_months vào được cả hai bảng; mã gói lạ (kể cả mã cũ của trước 0002) vẫn bị CHECK chặn.
  await insertLicense("L5", "six_months").run();
  expect(await db.prepare("SELECT plan FROM licenses WHERE id = 'L5'").first()).toEqual({ plan: "six_months" });
  for (const code of ["pro", "free", "Six_Months", ""]) {
    await expect(insertLicense("Ly", code).run()).rejects.toThrow(/CHECK/);
  }
  await expect(
    db
      .prepare("INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES ('h', 'payos', 'pro', 1, 'VND', 0, 'pending', 0, 0)")
      .run(),
  ).rejects.toThrow(/CHECK/);
});
```

- [ ] **Step 3: Chạy, thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/migrations.test.ts 2>&1 | grep -v "Using secrets" | grep -E "×|Test Files|Tests |AssertionError" | head`
Expected: FAIL, đúng hai test đỏ: `có đúng ba migration theo thứ tự` (chưa có file 0003) và `0003 nới CHECK mã gói…` (không có migration nào được áp thêm nên schema không đổi). Hai test còn lại xanh.

- [ ] **Step 4: Tạo migration**

Tạo `server/migrations/0003_six_months_plan.sql` với **đúng nội dung** sau:

```sql
-- Gói 6 Months (spec 2026-10-13): mã gói thứ ba 'six_months' cùng 'monthly' và 'yearly'. Chỉ NỚI ràng buộc CHECK của
-- licenses.plan và orders.plan; mọi dòng dữ liệu giữ nguyên giá trị (không đổi mã nào). Mã gói lạ trong dữ liệu cũ vẫn làm
-- CHECK của bảng mới từ chối và migration dừng, như 0002 (không gộp nhầm gói).
--
-- SQLite không sửa được CHECK, nên dựng lại bảng đúng khuôn 0002 (đã chạy trên production, spec 2026-10-07 §5.1): licenses là
-- bảng cha của activations, deactivations và orders, nên dựng lại cả bốn bảng:
--   1. tạo licenses_new, rồi các bảng con *_new trỏ tới licenses_new / activations_new; chép dữ liệu;
--   2. xóa bảng cũ theo thứ tự con trước cha (không còn bảng nào trỏ tới bảng đang xóa);
--   3. đổi tên *_new về tên cũ: SQLite tự sửa REFERENCES của các bảng con theo tên mới;
--   4. tạo lại index; giữ bộ đếm AUTOINCREMENT của orders và deactivations.
-- Schema sau 0003 giống hệt sau 0002, chỉ khác chuỗi CHECK (test/migrations.test.ts so sánh).
-- Worker cũ (chỉ ghi 'monthly', 'yearly') vẫn chạy đúng trên schema mới, nên áp migration này TRƯỚC khi deploy Worker mới.
-- Bộ đếm số đơn của orders không bao giờ lùi: PayOS nhớ mọi orderCode đã dùng và từ chối mã trùng.

CREATE TABLE licenses_new (
  id TEXT PRIMARY KEY,
  license_key TEXT NOT NULL UNIQUE,      -- 28 ký tự Crockford base32, không gạch nối
  email TEXT,                            -- NULL sau khi ẩn danh theo email (Q9)
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'six_months', 'yearly')),  -- mã gói (src/token.ts PLAN_CODES)
  expires_at INTEGER NOT NULL,
  cycle_anchor INTEGER NOT NULL,         -- mốc chu kỳ hạn mức 30 ngày (§6.8); đổi gói thì đặt lại
  anchor_applied_at INTEGER NOT NULL,    -- lúc server đặt cycle_anchor gần nhất (lúc xử lý đơn); mốc của quota_fresh (QĐ35)
  version INTEGER NOT NULL DEFAULT 0,    -- tăng mỗi lần đổi plan, expires_at hoặc cycle_anchor (QĐ32)
  last_order_code INTEGER,               -- đơn gần nhất đã áp vào license (QĐ32)
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  locked_at INTEGER,                     -- khóa tạm vì gỡ rồi kích hoạt quá ngưỡng (§10.2)
  lock_cleared_at INTEGER                -- admin mở khóa; lần gỡ trước mốc này không tính nữa
);
INSERT INTO licenses_new (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, version,
                          last_order_code, created_at, revoked_at, locked_at, lock_cleared_at)
  SELECT id, license_key, email, plan, expires_at, cycle_anchor,
         anchor_applied_at, version, last_order_code, created_at, revoked_at, locked_at, lock_cleared_at
  FROM licenses;

CREATE TABLE orders_new (
  order_code INTEGER PRIMARY KEY AUTOINCREMENT,
  order_token_hash TEXT NOT NULL,        -- SHA-256 của order_token; không lưu token gốc
  provider TEXT NOT NULL,                -- 'payos'
  provider_ref TEXT,                     -- paymentLinkId của PayOS
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'six_months', 'yearly')),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,                -- 'VND'
  email TEXT,                            -- NULL sau khi ẩn danh theo email (Q9)
  email_consent_at INTEGER NOT NULL,     -- lúc người mua tick đồng ý xử lý email (§10.1)
  renew_license_id TEXT REFERENCES licenses_new (id),
  license_id TEXT REFERENCES licenses_new (id),
  grant_kind TEXT,                       -- lúc cấp: 'new' | 'extend' (cùng gói) | 'change' (đổi gói), QĐ32
  status TEXT NOT NULL,                  -- pending | processing | paid | underpaid | cancelled | expired | failed
                                         -- | paid_needs_review (license đã thu hồi nhận được tiền, QĐ37) | refunded (admin ghi đã hoàn)
  amount_paid INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,           -- hạn của link thanh toán (tạo đơn + 15 phút)
  paid_at INTEGER,                       -- lúc server xác nhận đã trả tiền (thời điểm thanh toán của cổng: audit_log, QĐ33)
  last_checked_at INTEGER,
  email_sent_at INTEGER,
  email_attempts INTEGER NOT NULL DEFAULT 0,   -- số lần đã thử gửi thư chứa key
  email_retry_at INTEGER,                      -- lần gửi lại kế tiếp sau lỗi tạm (401, 403, 409 concurrent_…, 429, 5xx, mạng)
  email_gave_up_at INTEGER                     -- thôi gửi sau lỗi vĩnh viễn (400, 422)
);
INSERT INTO orders_new (order_code, order_token_hash, provider, provider_ref, plan, amount, currency, email,
                        email_consent_at, renew_license_id, license_id, grant_kind, status, amount_paid, created_at,
                        expires_at, paid_at, last_checked_at, email_sent_at, email_attempts, email_retry_at,
                        email_gave_up_at)
  SELECT order_code, order_token_hash, provider, provider_ref, plan,
         amount, currency, email, email_consent_at, renew_license_id, license_id, grant_kind, status, amount_paid,
         created_at, expires_at, paid_at, last_checked_at, email_sent_at, email_attempts, email_retry_at,
         email_gave_up_at
  FROM orders;

-- Mỗi (license, máy) có đúng một dòng, giữ mãi: gỡ máy chỉ đặt deactivated_at; kích hoạt lại cùng máy
-- dùng lại dòng đó, giữ activation_id, created_at và quota_epoch (QĐ35).
CREATE TABLE activations_new (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses_new (id),
  device_id_hash TEXT NOT NULL,          -- SHA-256 hex của IOPlatformUUID hoặc MachineGuid
  device_label TEXT,                     -- tên máy; NULL sau khi ẩn danh (Q9)
  quota_epoch INTEGER NOT NULL DEFAULT 0,    -- admin tăng để máy bắt đầu bộ đếm hạn mức mới (QĐ35)
  epoch_pending INTEGER NOT NULL DEFAULT 0,  -- 1: admin vừa tăng quota_epoch, token kế tiếp mở cửa sổ quota_fresh (QĐ35)
  epoch_window_start INTEGER,                -- lúc cấp token đầu tiên sau lần tăng quota_epoch gần nhất (QĐ35)
  created_at INTEGER NOT NULL,
  last_validated_at INTEGER NOT NULL,
  deactivated_at INTEGER,                -- NULL là đang kích hoạt
  deactivated_by TEXT                    -- 'user' | 'admin', của lần gỡ gần nhất
);
INSERT INTO activations_new (id, license_id, device_id_hash, device_label, quota_epoch, epoch_pending,
                             epoch_window_start, created_at, last_validated_at, deactivated_at, deactivated_by)
  SELECT id, license_id, device_id_hash, device_label, quota_epoch, epoch_pending, epoch_window_start, created_at,
         last_validated_at, deactivated_at, deactivated_by
  FROM activations;

-- Mọi lần gỡ máy, để đếm luật khóa tạm (§10.2) kể cả khi dòng activation đã được kích hoạt lại.
CREATE TABLE deactivations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL REFERENCES licenses_new (id),
  activation_id TEXT NOT NULL REFERENCES activations_new (id),
  at INTEGER NOT NULL,
  by TEXT NOT NULL                       -- 'user' (tự gỡ, gỡ từ xa) | 'admin' (không tính vào luật khóa tạm)
);
INSERT INTO deactivations_new (id, license_id, activation_id, at, by)
  SELECT id, license_id, activation_id, at, by FROM deactivations;

-- Giữ bộ đếm AUTOINCREMENT (orders: production bắt đầu từ 1.000.001, §6.8): số kế tiếp không bao giờ lùi,
-- kể cả khi bộ đếm lớn hơn khóa lớn nhất còn lại.
DELETE FROM sqlite_sequence WHERE name IN ('orders_new', 'deactivations_new');
INSERT INTO sqlite_sequence (name, seq)
  SELECT name || '_new', seq FROM sqlite_sequence WHERE name IN ('orders', 'deactivations');

DROP TABLE deactivations;
DROP TABLE activations;
DROP TABLE orders;
DROP TABLE licenses;
ALTER TABLE licenses_new RENAME TO licenses;
ALTER TABLE activations_new RENAME TO activations;
ALTER TABLE deactivations_new RENAME TO deactivations;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX licenses_email ON licenses (email);
CREATE INDEX orders_pending ON orders (status, created_at);
CREATE INDEX orders_email ON orders (email);
CREATE UNIQUE INDEX activations_device ON activations (license_id, device_id_hash);
CREATE INDEX activations_license ON activations (license_id, deactivated_at);
CREATE INDEX deactivations_license ON deactivations (license_id, at);
```

- [ ] **Step 5: Chạy, thấy xanh, rồi kiểm đột biến**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/migrations.test.ts 2>&1 | grep -v "Using secrets" | grep -E "×|Test Files|Tests "`
Expected: `Test Files  1 passed (1)`, `Tests  4 passed (4)`.

**Kiểm đột biến** (chứng minh test đủ nhạy với chính các lỗi nguy hiểm nhất; mỗi lần phải thấy đỏ rồi khôi phục). Lưu bản đúng, thử ba đột biến, khôi phục:

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/server && D=$(mktemp -d) && cp migrations/0003_six_months_plan.sql $D/0003.good.sql
# Đột biến 1: đảo hai cột email_retry_at và email_gave_up_at trong câu SELECT của orders (chép sai cột)
python3 - <<'EOF'
import pathlib
p = pathlib.Path("migrations/0003_six_months_plan.sql"); s = p.read_text()
old = "email_attempts, email_retry_at,\n         email_gave_up_at\n  FROM orders;"
assert old in s
p.write_text(s.replace(old, "email_attempts, email_gave_up_at,\n         email_retry_at\n  FROM orders;"))
EOF
pnpm vitest run test/migrations.test.ts 2>&1 | grep -E "Tests |×"; cp $D/0003.good.sql migrations/0003_six_months_plan.sql
# Đột biến 2: orders_new không nhận six_months
python3 - <<'EOF'
import pathlib
p = pathlib.Path("migrations/0003_six_months_plan.sql"); s = p.read_text()
i = s.index("CREATE TABLE orders_new"); head, tail = s[:i], s[i:]
p.write_text(head + tail.replace("CHECK (plan IN ('monthly', 'six_months', 'yearly'))", "CHECK (plan IN ('monthly', 'yearly'))", 1))
EOF
pnpm vitest run test/migrations.test.ts 2>&1 | grep -E "Tests |×"; cp $D/0003.good.sql migrations/0003_six_months_plan.sql
# Đột biến 3: quên giữ bộ đếm sqlite_sequence (số đơn PayOS sẽ lùi)
python3 - <<'EOF'
import pathlib
p = pathlib.Path("migrations/0003_six_months_plan.sql"); s = p.read_text()
old = "INSERT INTO sqlite_sequence (name, seq)\n  SELECT name || '_new', seq FROM sqlite_sequence WHERE name IN ('orders', 'deactivations');\n"
assert old in s
p.write_text(s.replace(old, ""))
EOF
pnpm vitest run test/migrations.test.ts 2>&1 | grep -E "Tests |×"; cp $D/0003.good.sql migrations/0003_six_months_plan.sql
cmp migrations/0003_six_months_plan.sql $D/0003.good.sql && echo "đã khôi phục bản đúng" && pnpm vitest run test/migrations.test.ts 2>&1 | grep -E "Tests "
```
Expected: ba lần đầu mỗi lần `Tests  1 failed | 3 passed (4)` kèm dòng `× 0003 nới CHECK mã gói…`; lần cuối `đã khôi phục bản đúng` rồi `Tests  4 passed (4)`. Nếu một đột biến **không** làm đỏ, test chưa đủ nhạy: dừng và báo.

- [ ] **Step 6: Chạy cả bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm test 2>&1 | grep -v "Using secrets" | grep -E "×|Test Files|Tests "`
Expected: `Test Files  25 passed (25)`, `Tests  645 passed (645)` (644 + 1).

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short && git add server/migrations/0003_six_months_plan.sql server/test/migrations.test.ts && git commit -q -m "$(cat <<'EOF'
feat(server): migration D1 0003 nới CHECK mã gói cho six_months

Dựng lại licenses, orders, activations, deactivations đúng khuôn 0002; không đổi
dòng dữ liệu nào, giữ khóa ngoại, index và bộ đếm số đơn (PayOS không cho dùng
lại orderCode). Worker cũ vẫn chạy trên schema mới. Test so schema với sau 0002
(chỉ khác chuỗi CHECK), dữ liệu từng cột, bộ đếm; đã kiểm đột biến.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

### Task 3: Mã gói `six_months` trong bảng gói

**Files:**
- Modify: `server/src/token.ts`, `server/src/plans.ts`, `server/wrangler.jsonc`
- Modify (test): `server/test/plans.test.ts`, `server/test/checkout.test.ts`, `server/test/node/wrangler-config.test.mjs`, `server/test/admin-stats.test.ts`

- [ ] **Step 1: Viết test mới (đỏ)**

**1a. `server/test/plans.test.ts`**

Đổi import (thêm `PLAN_CODES`):
```ts
import { computeGrant, LEGACY_PLAN_CODES, type LicenseTerms, offeredPlanCodes, parsePlans, type PlanTable } from "../src/plans";
```
thành:
```ts
import { computeGrant, LEGACY_PLAN_CODES, type LicenseTerms, offeredPlanCodes, PLAN_CODES, parsePlans, type PlanTable } from "../src/plans";
```

Thay chú thích và test bảng gói:
```ts
// Bảng gói production (wrangler.jsonc), cũng là giá chính thức của spec 2026-10-07 §2.1.
const plans = parsePlans(env.PLANS) as PlanTable;

describe("bảng gói (biến PLANS)", () => {
  it("có đúng hai gói trả phí với hạn mức, số ngày và giá của spec 2026-10-07 §2.1", () => {
    expect(plans).toEqual({
      monthly: { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } },
      yearly: { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } },
    });
  });
```
bằng:
```ts
// Bảng gói production (wrangler.jsonc), cũng là giá chính thức của spec 2026-10-07 §2.1 và spec 2026-10-13 §1.
const plans = parsePlans(env.PLANS) as PlanTable;

describe("bảng gói (biến PLANS)", () => {
  it("có đúng ba gói trả phí với hạn mức, số ngày và giá của spec 2026-10-07 §2.1 và spec 2026-10-13 §1", () => {
    expect(plans).toEqual({
      monthly: { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } },
      six_months: { quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000 } },
      yearly: { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } },
    });
    // Thứ tự mã gói là thứ tự trong màn hình Nâng cấp: theo thời hạn.
    expect([...PLAN_CODES]).toEqual(["monthly", "six_months", "yearly"]);
  });
```

Trong bảng `it.each` của `parsePlans`, thêm ba dòng: **thay**
```ts
    ["thiếu một gói", bad((p) => delete p.yearly)],
    ["thừa gói lạ", bad((p) => (p.pro = p.monthly!))],
```
bằng
```ts
    ["thiếu một gói", bad((p) => delete p.yearly)],
    ["thiếu gói six_months", bad((p) => delete p.six_months)],
    ["thừa gói lạ", bad((p) => (p.pro = p.monthly!))],
    ["six_months có hạn mức bằng 0", bad((p) => (p.six_months!.quota_minutes_per_cycle = 0))],
    ["six_months có số ngày quá 366", bad((p) => (p.six_months!.days_per_order = 367))],
```

Trong `describe("luật mua thêm và đổi gói …")`, **thay** test cuối cùng của describe đó và đóng describe:
```ts
  it("thiếu giá theo loại tiền của đơn thì báo lỗi", () => {
    expect(() => computeGrant(plans, lic("monthly", 20), "yearly", "USD", T0)).toThrow(/USD/);
  });
});
```
bằng:
```ts
  it("thiếu giá theo loại tiền của đơn thì báo lỗi", () => {
    expect(() => computeGrant(plans, lic("monthly", 20), "yearly", "USD", T0)).toThrow(/USD/);
  });

  describe("gói 6 Months (spec 2026-10-13 §1)", () => {
    it("license mới: 180 ngày từ hiện tại, cycle_anchor = hiện tại", () => {
      expect(computeGrant(plans, null, "six_months", "VND", T0)).toEqual({
        plan: "six_months",
        expires_at: T0 + 180 * DAY,
        cycle_anchor: T0,
        kind: "new",
        converted_days: 0,
      });
    });

    it("mua thêm cùng gói: còn hạn thì cộng 180 ngày vào hạn cũ và giữ cycle_anchor; đã hết hạn thì tính từ hiện tại", () => {
      expect(computeGrant(plans, lic("six_months", 100), "six_months", "VND", T0)).toEqual({
        plan: "six_months",
        expires_at: T0 + 280 * DAY,
        cycle_anchor: T0 - 10 * DAY,
        kind: "extend",
        converted_days: 0,
      });
      expect(computeGrant(plans, lic("six_months", -4), "six_months", "VND", T0)).toEqual({
        plan: "six_months",
        expires_at: T0 + 180 * DAY,
        cycle_anchor: T0,
        kind: "extend",
        converted_days: 0,
      });
    });

    it("ba ví dụ quy đổi của spec: Monthly còn 20 ngày → 22 ngày; Yearly còn 200 ngày → 183 ngày; 6 Months còn 100 ngày → Yearly 109 ngày", () => {
      // 20 × (50.000 / 30) / (269.000 / 180) = 22,30… → 22; 6 Months chạy 180 + 22 = 202 ngày.
      expect(computeGrant(plans, lic("monthly", 20), "six_months", "VND", T0)).toEqual({
        plan: "six_months",
        expires_at: T0 + 202 * DAY,
        cycle_anchor: T0,
        kind: "change",
        converted_days: 22,
      });
      // 200 × (500.000 / 365) / (269.000 / 180) = 183,33… → 183; 6 Months chạy 363 ngày.
      expect(computeGrant(plans, lic("yearly", 200), "six_months", "VND", T0)).toMatchObject({ expires_at: T0 + 363 * DAY, converted_days: 183 });
      // 100 × (269.000 / 180) / (500.000 / 365) = 109,09… → 109; Yearly chạy 365 + 109 = 474 ngày.
      expect(computeGrant(plans, lic("six_months", 100), "yearly", "VND", T0)).toMatchObject({ expires_at: T0 + 474 * DAY, converted_days: 109 });
    });

    it.each([
      ["monthly", "six_months", 111],
      ["six_months", "monthly", 89],
      ["six_months", "yearly", 109],
      ["yearly", "six_months", 91],
      ["monthly", "yearly", 121],
      ["yearly", "monthly", 82],
    ] as const)("đổi gói %s → %s khi còn 100 ngày: quy đổi %i ngày, làm tròn xuống", (from, to, converted) => {
      const grant = computeGrant(plans, lic(from, 100), to, "VND", T0);
      expect(grant).toMatchObject({ plan: to, kind: "change", cycle_anchor: T0, converted_days: converted });
      expect(grant.expires_at).toBe(T0 + (plans[to].days_per_order + converted) * DAY);
    });

    it("phép tính số nguyên chính xác ở biên với giá 269.000: đúng 269 ngày không bị hụt, thiếu 1 giây thì 268", () => {
      // 6 Months còn đúng 300 ngày → 300 × 269.000 × 30 / (50.000 × 180) = 269 đúng.
      expect(computeGrant(plans, lic("six_months", 300), "monthly", "VND", T0).converted_days).toBe(269);
      expect(computeGrant(plans, { ...lic("six_months", 300), expires_at: T0 + 300 * DAY - 1 }, "monthly", "VND", T0).converted_days).toBe(268);
    });

    it("license đã hết hạn mua 6 Months: như license mới, không quy đổi", () => {
      expect(computeGrant(plans, lic("monthly", -1), "six_months", "VND", T0)).toEqual({
        plan: "six_months",
        expires_at: T0 + 180 * DAY,
        cycle_anchor: T0,
        kind: "change",
        converted_days: 0,
      });
    });
  });
});
```

**1b. `server/test/checkout.test.ts`** — trong `describe("GET /v1/plans")`, **sau** test `bảng gói thiếu thì 503 pricing_not_configured` (trước dấu `});` đóng describe), thêm:

```ts

  // Gói 6 Months (spec 2026-10-13 §2.3): app cũ không gửi `?plans=` nên nhận đúng response ở test đầu của mục này.
  const monthly = { code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } };
  const sixMonths = { code: "six_months", name: "6 Months", quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000 } };
  const yearly = { code: "yearly", name: "Yearly", quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } };

  it("app khai báo ?plans=monthly,six_months,yearly thì nhận ba gói theo thứ tự thời hạn", async () => {
    const res = await makeWorld().call("GET", "/v1/plans?plans=monthly,six_months,yearly");
    expect(res).toEqual({ status: 200, headers: expect.anything(), body: { plans: [monthly, sixMonths, yearly] } });
  });

  it.each([
    ["chỉ khai báo gói mới: gói cũ vẫn có", "plans=six_months", [monthly, sixMonths, yearly]],
    ["tham số rỗng", "plans=", [monthly, yearly]],
    ["mã lạ bị bỏ qua", "plans=pro,free", [monthly, yearly]],
    ["tham số khác tên", "supports=six_months", [monthly, yearly]],
  ])("%s", async (_why, query, expected) => {
    const res = await makeWorld().call("GET", `/v1/plans?${query}`);
    expect(res).toMatchObject({ status: 200, body: { plans: expected } });
  });

  it("có ?plans= mà bảng gói thiếu thì vẫn 503 pricing_not_configured", async () => {
    expect(await makeWorld({ PLANS: undefined }).call("GET", "/v1/plans?plans=six_months")).toMatchObject({
      status: 503,
      body: { error: "pricing_not_configured" },
    });
  });
```

**1c. `server/test/node/wrangler-config.test.mjs`** — **thay** test bảng gói:
```js
test("Worker API bán đúng bảng gói chính thức (spec 2026-10-07 §2.1), không có giá thử", () => {
  const { monthly, yearly, ...others } = api.vars.PLANS;
  assert.deepEqual(others, {});
  assert.deepEqual(monthly, { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } });
  assert.deepEqual(yearly, { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } });
});
```
bằng:
```js
test("Worker API bán đúng bảng gói chính thức (spec 2026-10-07 §2.1, spec 2026-10-13 §1), không có giá thử", () => {
  const { monthly, six_months: sixMonths, yearly, ...others } = api.vars.PLANS;
  assert.deepEqual(others, {});
  assert.deepEqual(monthly, { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } });
  assert.deepEqual(sixMonths, { quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000 } });
  assert.deepEqual(yearly, { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } });
  assert.deepEqual(Object.keys(api.vars.PLANS), ["monthly", "six_months", "yearly"], "thứ tự gói trong cấu hình theo thời hạn");
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm test 2>&1 | grep -v "Using secrets" | grep -E "×|Test Files|Tests " | head -30; pnpm test:scripts 2>&1 | grep -E "✖|^ℹ (pass|fail)"`
Expected: FAIL. Đỏ: bảng gói (`có đúng ba gói…`), các dòng parsePlans mới (`thiếu gói six_months` trả bảng hợp lệ thay vì `null`…), toàn bộ nhóm `gói 6 Months` của `computeGrant` (gói chưa có trong bảng), nhóm `/v1/plans` mới (chưa có `six_months`), và `pnpm test:scripts` báo test bảng gói đỏ.

- [ ] **Step 3: Thêm mã gói, tên, giá**

**3a. `server/src/token.ts`** — thay
```ts
/** Mã gói trả phí (spec 2026-10-07 §1). Token bản quyền chỉ mang một trong hai mã này; Free có token dùng thử riêng. */
export const PLAN_CODES = ["monthly", "yearly"] as const;
```
bằng
```ts
/**
 * Mã gói trả phí (spec 2026-10-07 §1; `six_months` thêm ở spec 2026-10-13). Thứ tự là thứ tự `GET /v1/plans` trả về, tức
 * thứ tự trong màn hình Nâng cấp của app: theo thời hạn. Token bản quyền chỉ mang một trong các mã này; Free có token dùng
 * thử riêng.
 */
export const PLAN_CODES = ["monthly", "six_months", "yearly"] as const;
```

**3b. `server/src/plans.ts`** — thay phần đầu file:
```ts
// Ba gói (spec 2026-10-07 §1) và luật mua thêm, đổi gói (§6.8, §2.3 spec 2026-10-07). Free không bán: là dùng thử
// theo máy (src/trial.ts).
```
bằng
```ts
// Các gói trả phí (spec 2026-10-07 §1; `six_months` thêm ở spec 2026-10-13) và luật mua thêm, đổi gói (§6.8, §2.3 spec
// 2026-10-07). Free không bán: là dùng thử theo máy (src/trial.ts).
```
và thay
```ts
export const PLAN_NAMES: Record<PlanCode, string> = {
  monthly: "Monthly",
  yearly: "Yearly",
};
```
bằng
```ts
export const PLAN_NAMES: Record<PlanCode, string> = {
  monthly: "Monthly",
  six_months: "6 Months",
  yearly: "Yearly",
};
```

**3c. `server/wrangler.jsonc`** — thay
```jsonc
    // Giá chính thức (spec 2026-10-07 §2.1; thay bốn gói chốt 2026-10-01).
```
bằng
```jsonc
    // Giá chính thức (spec 2026-10-07 §2.1; thay bốn gói chốt 2026-10-01). six_months thêm theo spec 2026-10-13 §1:
    // 100 giờ mỗi chu kỳ 30 ngày, 180 ngày mỗi đơn. Thứ tự các gói là thứ tự trong màn hình Nâng cấp (theo thời hạn).
```
và thay
```jsonc
      "monthly": { "quota_minutes_per_cycle": 3000, "days_per_order": 30, "prices": { "VND": 50000 } },
      "yearly": { "quota_minutes_per_cycle": null, "days_per_order": 365, "prices": { "VND": 500000 } }
```
bằng
```jsonc
      "monthly": { "quota_minutes_per_cycle": 3000, "days_per_order": 30, "prices": { "VND": 50000 } },
      "six_months": { "quota_minutes_per_cycle": 6000, "days_per_order": 180, "prices": { "VND": 269000 } },
      "yearly": { "quota_minutes_per_cycle": null, "days_per_order": 365, "prices": { "VND": 500000 } }
```

- [ ] **Step 4: Chạy, thấy đúng các test **cũ** đếm số gói bị vỡ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm test 2>&1 | grep -v "Using secrets" | grep -E "×|Test Files|Tests "`
Expected: các test mới đã xanh; còn **đúng ba** test cũ đỏ, đều trong `server/test/admin-stats.test.ts` và đều vì `toEqual` so cả đối tượng nay có thêm khóa `six_months`:
1. `tháng tách Monthly và Yearly; tháng không có đơn là 0`
2. `doanh thu theo amount_paid (số tiền thực thu), không theo giá gói: …`
3. `cơ sở dữ liệu trống: toàn bộ phản hồi đúng từng trường`

(Test `GET /v1/plans` cũ của `checkout.test.ts` phải **vẫn xanh, không sửa**: nhờ Task 1.) Đỏ ở chỗ nào khác là có lỗi thật, dừng và điều tra.

- [ ] **Step 5: Sửa ba test cũ ở `server/test/admin-stats.test.ts` (chỉ thêm khóa `six_months`)**

1) **Thay** (test "tháng tách …"):
```ts
  it("tháng tách Monthly và Yearly; tháng không có đơn là 0", async () => {
```
bằng
```ts
  it("tháng tách Monthly, 6 Months và Yearly; tháng không có đơn là 0", async () => {
```
và thay ba dòng `expect`:
```ts
    expect(monthOf(s, "2026-09")).toEqual({ month: "2026-09", monthly: { revenue: 50000, orders: 1 }, yearly: { revenue: 1000000, orders: 2 } });
    expect(monthOf(s, "2026-10")).toEqual({ month: "2026-10", monthly: { revenue: 0, orders: 0 }, yearly: { revenue: 500000, orders: 1 } });
    expect(monthOf(s, "2026-08")).toEqual({ month: "2026-08", monthly: { revenue: 0, orders: 0 }, yearly: { revenue: 0, orders: 0 } });
```
bằng
```ts
    const none = { revenue: 0, orders: 0 };
    expect(monthOf(s, "2026-09")).toEqual({ month: "2026-09", monthly: { revenue: 50000, orders: 1 }, six_months: none, yearly: { revenue: 1000000, orders: 2 } });
    expect(monthOf(s, "2026-10")).toEqual({ month: "2026-10", monthly: none, six_months: none, yearly: { revenue: 500000, orders: 1 } });
    expect(monthOf(s, "2026-08")).toEqual({ month: "2026-08", monthly: none, six_months: none, yearly: none });
```

2) **Thay** dòng trong test "doanh thu theo amount_paid …":
```ts
    expect(monthOf(s, "2026-10")).toEqual({ month: "2026-10", monthly: { revenue: 30000, orders: 1 }, yearly: { revenue: 700000, orders: 1 } });
```
bằng
```ts
    expect(monthOf(s, "2026-10")).toEqual({
      month: "2026-10",
      monthly: { revenue: 30000, orders: 1 },
      six_months: { revenue: 0, orders: 0 },
      yearly: { revenue: 700000, orders: 1 },
    });
```

3) **Thay** dòng trong test "cơ sở dữ liệu trống …":
```ts
        monthly: monthWindow(NOW, 12).keys.map((month) => ({ month, monthly: zero, yearly: zero })),
```
bằng
```ts
        monthly: monthWindow(NOW, 12).keys.map((month) => ({ month, monthly: zero, six_months: zero, yearly: zero })),
```

- [ ] **Step 6: Chạy toàn bộ, thấy xanh**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm test 2>&1 | grep -v "Using secrets" | grep -E "×|Test Files|Tests " && pnpm test:scripts 2>&1 | grep -E "^ℹ (pass|fail|skipped)" && pnpm dry-run 2>&1 | grep -E "env.PLANS|exiting now"`
Expected: `Test Files  25 passed (25)`, `Tests  665 passed (665)` (645 + 14 của plans + 6 của `/v1/plans`); `ℹ pass 18`, `ℹ fail 0`; hai dòng `--dry-run: exiting now.` và một dòng `env.PLANS ({"monthly":{"quota_minutes_per_cycle"...)`.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/token.ts server/src/plans.ts server/wrangler.jsonc server/test/plans.test.ts server/test/checkout.test.ts server/test/node/wrangler-config.test.mjs server/test/admin-stats.test.ts && git commit -q -m "$(cat <<'EOF'
feat(server): gói six_months (269.000 đ, 180 ngày, 6000 phút mỗi chu kỳ 30 ngày)

Thêm mã gói vào PLAN_CODES, tên "6 Months" và biến PLANS (spec 2026-10-13 §1, §2.1).
GET /v1/plans chỉ trả gói này khi app khai báo ?plans=; app cũ vẫn thấy hai gói.
Test: bảng gói, sáu chiều đổi gói và biên làm tròn, ?plans=, cấu hình wrangler;
ba test thống kê cũ chỉ thêm khóa six_months.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

### Task 4: Test luồng mua, đổi gói, cấp tay, thống kê với gói `six_months`

Task này **chỉ thêm test** cho các đường đi chung (tạo đơn, webhook, mua thêm, đổi gói, kích hoạt, cấp tay, lọc, thống kê). Vì các đường đó đọc theo bảng gói, **mọi test phải xanh ngay lần chạy đầu**; đó là bằng chứng "không phải sửa logic". Một test đỏ nghĩa là có chỗ trong luồng chung đang giả định hai gói: dừng, đọc nguyên nhân, báo chủ dự án trước khi sửa code sản phẩm.

**Files (test):** `server/test/checkout.test.ts`, `orders.test.ts`, `licenses.test.ts`, `admin.test.ts`, `admin-read.test.ts`, `admin-stats.test.ts`.

- [ ] **Step 1: `checkout.test.ts`**

1) **Thay** bảng `it.each` giá:
```ts
  it.each([
    ["monthly", 50000],
    ["yearly", 500000],
  ])("gói %s: giá %i đ lấy từ biến PLANS", async (plan, amount) => {
```
bằng
```ts
  it.each([
    ["monthly", 50000],
    ["six_months", 269000],
    ["yearly", 500000],
  ])("gói %s: giá %i đ lấy từ biến PLANS", async (plan, amount) => {
```

2) **Thêm trước** test `trang return và cancel trả HTML` (cùng `describe("POST /v1/checkout")`):
```ts
  it("gói six_months: gọi PayOS đúng 269.000 đ, đơn lưu đúng gói và số tiền", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", { ...valid, plan: "six_months" });
    expect(res).toMatchObject({ status: 201, body: { order_code: 1, plan: "six_months", amount: 269000, currency: "VND" } });
    expect(w.payos.requests[0]).toMatchObject({ method: "POST", path: "/v2/payment-requests", body: { orderCode: 1, amount: 269000, description: "AT1" } });
    expect(await env.DB.prepare("SELECT plan, amount, status FROM orders WHERE order_code = 1").first()).toEqual({
      plan: "six_months",
      amount: 269000,
      status: "pending",
    });
  });

  it("gia hạn hay đổi gói sang six_months: ước tính theo spec 2026-10-13 §1 (Monthly còn 20 ngày → 22 ngày quy đổi, chạy 202 ngày)", async () => {
    await env.DB.prepare(
      `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at)
       VALUES ('L1', ?, 'a@example.com', 'monthly', ?, ?3, ?3, ?3)`,
    )
      .bind(vectors.license_keys[0]!.normalized, T0 + 20 * DAY, T0 - 10 * DAY)
      .run();
    const w = makeWorld();
    const key = vectors.license_keys[0]!.input;
    const up = await w.call("POST", "/v1/checkout", { ...valid, plan: "six_months", license_key: key });
    expect(up).toMatchObject({ status: 201, body: { plan: "six_months", amount: 269000, license_expires_at: T0 + 202 * DAY, converted_days: 22 } });
    // Ước tính không đổi license.
    expect(await env.DB.prepare("SELECT plan, expires_at FROM licenses").first()).toEqual({ plan: "monthly", expires_at: T0 + 20 * DAY });
  });
```

- [ ] **Step 2: `orders.test.ts`** — **thêm vào cuối file**:

```ts

describe("gói 6 Months (spec 2026-10-13)", () => {
  it("mua mới: cấp license 180 ngày đúng số tiền 269.000 đ, thư có tên gói", async () => {
    const w = makeWorld();
    const { orderCode, token } = await checkout(w, { plan: "six_months" });
    w.clock.now = T0 + 120;
    w.payos.pay(orderCode);
    const wh = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(wh).toMatchObject({ status: 200, body: { ok: true, result: "granted" } });
    const paid = await w.getOrder(orderCode, token);
    expect(paid.body).toMatchObject({ status: "paid", grant_kind: "new", license_plan: "six_months", license_expires_at: T0 + 120 + 180 * DAY });
    expect(await env.DB.prepare("SELECT amount, amount_paid FROM orders").first()).toEqual({ amount: 269000, amount_paid: 269000 });
    expect(await license()).toEqual({ plan: "six_months", expires_at: T0 + 120 + 180 * DAY, cycle_anchor: T0 + 120, version: 0 });
    expect(w.resend.sent[0]!.text).toContain("6 Months, hết hạn");
  });

  it("trả thiếu tiền (underpaid) thì không cấp license, như các gói khác", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w, { plan: "six_months" });
    w.payos.pay(orderCode, 100000);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(await orderRow(orderCode)).toMatchObject({ status: "underpaid", amount_paid: 100000 });
    expect(await licenseCount()).toBe(0);
  });

  it("mua thêm khi còn 100 ngày: cộng 180 ngày vào hạn cũ, giữ cycle_anchor", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy({ plan: "six_months" });
    w.clock.now = T0 + 80 * DAY;
    const order = await renew(w, licenseKey, "six_months");
    expect(order).toMatchObject({ status: "paid", grant_kind: "extend", license_plan: "six_months", license_expires_at: T0 + 360 * DAY });
    expect(await license()).toEqual({ plan: "six_months", expires_at: T0 + 360 * DAY, cycle_anchor: T0, version: 1 });
  });

  it("lên gói: Monthly còn 20 ngày mua 6 Months, quy đổi 22 ngày, chạy 202 ngày từ lúc trả tiền", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    w.clock.now = T0 + 10 * DAY;
    const order = await renew(w, licenseKey, "six_months");
    expect(order).toMatchObject({ grant_kind: "change", license_plan: "six_months", license_expires_at: T0 + 212 * DAY });
    expect(await license()).toEqual({ plan: "six_months", expires_at: T0 + 212 * DAY, cycle_anchor: T0 + 10 * DAY, version: 1 });
    expect(w.resend.sent.at(-1)!.subject).toBe("Đã đổi gói AI Translator / AI Translator plan changed");
    expect(w.resend.sent.at(-1)!.text).toContain("6 Months, hết hạn");
    const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'license_plan_changed'").first<{ detail: string }>();
    expect(JSON.parse(log!.detail)).toMatchObject({ plan: "six_months", from_plan: "monthly", from_expires_at: T0 + 30 * DAY, converted_days: 22 });
  });

  it("xuống gói: Yearly còn 200 ngày mua 6 Months, quy đổi 183 ngày, chạy 363 ngày", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy({ plan: "yearly" });
    w.clock.now = T0 + 165 * DAY;
    const order = await renew(w, licenseKey, "six_months");
    expect(order).toMatchObject({ grant_kind: "change", license_plan: "six_months", license_expires_at: T0 + 165 * DAY + 363 * DAY });
    expect(await license()).toEqual({ plan: "six_months", expires_at: T0 + 528 * DAY, cycle_anchor: T0 + 165 * DAY, version: 1 });
  });

  it("từ 6 Months lên Yearly khi còn 100 ngày: quy đổi 109 ngày, Yearly chạy 474 ngày", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy({ plan: "six_months" });
    w.clock.now = T0 + 80 * DAY;
    const order = await renew(w, licenseKey, "yearly");
    expect(order).toMatchObject({ grant_kind: "change", license_plan: "yearly", license_expires_at: T0 + 80 * DAY + 474 * DAY });
  });
});
```

- [ ] **Step 3: `licenses.test.ts`** — **thay** bảng `it.each` (kích hoạt trả token đúng hạn mức theo gói):
```ts
  it.each([
    ["monthly", 3000],
    ["yearly", null],
  ])("gói %s: token mang hạn mức %s theo bảng gói", async (plan, quota) => {
```
bằng
```ts
  it.each([
    ["monthly", 3000],
    ["six_months", 6000],
    ["yearly", null],
  ])("gói %s: token mang hạn mức %s theo bảng gói", async (plan, quota) => {
```

- [ ] **Step 4: `admin.test.ts`** — **thêm trước** test `mở khóa key không bị khóa: 404, …`:

```ts
  it("cấp tay gói six_months: 180 ngày từ lúc cấp, thư nêu tên gói 6 Months, gia hạn tay vẫn cộng đúng số ngày", async () => {
    const { w, adminCall } = makeAdmin();
    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "six_months", note: "tặng" } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ plan: "six_months", expires_at: T0 + 180 * DAY });
    expect(await licenseRow()).toMatchObject({ plan: "six_months", expires_at: T0 + 180 * DAY, cycle_anchor: T0, anchor_applied_at: T0 });
    expect(w.resend.sent[0]!.text).toContain("6 Months, hết hạn");
    const id = created.body.license_id as string;
    w.clock.now = T0 + DAY;
    const ext = await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 7, note: "bù sự cố" } });
    expect(ext.body).toEqual({ license_id: id, expires_at: T0 + 187 * DAY, cycle_anchor: T0 });
  });

```

- [ ] **Step 5: `admin-read.test.ts`** — **thêm trước** test `bộ lọc sai thì 400 kèm field, không ghi nhật ký`:

```ts
  it("lọc theo gói six_months: chỉ ra đơn của gói đó; mã gói không có thì 400", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy({ plan: "six_months" }); // đơn 1
    await w.buy({ plan: "yearly" }); // đơn 2
    await checkouts(w, 1); // đơn 3, monthly, pending
    const codes = async (q: string) => ((await adminCall(`/admin/orders?${q}`)).body as unknown as Page).items.map((o) => o.order_code);
    expect(await codes("plan=six_months")).toEqual([1]);
    expect(await codes("plan=yearly")).toEqual([2]);
    expect(await codes("plan=monthly")).toEqual([3]);
    expect((await adminCall("/admin/orders?plan=six_month")).status).toBe(400);
  });

```

- [ ] **Step 6: `admin-stats.test.ts`**

1) **Thay** phần đầu của `OrderSeed` và cột `amount` mẫu để đơn mẫu có giá theo gói:
```ts
interface OrderSeed {
  status?: string;
  plan?: "monthly" | "yearly";
```
bằng
```ts
/** Giá gói (wrangler.jsonc) cho cột `amount` của đơn mẫu. */
const PRICE = { monthly: 50000, six_months: 269000, yearly: 500000 } as const;

interface OrderSeed {
  status?: string;
  plan?: keyof typeof PRICE;
```
và thay
```ts
    o.plan ?? "monthly",
    o.plan === "yearly" ? 500000 : 50000,
```
bằng
```ts
    o.plan ?? "monthly",
    PRICE[o.plan ?? "monthly"],
```

2) **Thêm ngay sau** test `tháng tách Monthly, 6 Months và Yearly; tháng không có đơn là 0`:
```ts

  it("six_months có doanh thu và số đơn riêng theo tháng, không lẫn vào Monthly hay Yearly", async () => {
    await seed(
      order({ paidAt: vn(2026, 9, 10, 12) }),
      order({ paidAt: vn(2026, 9, 11, 12), plan: "six_months", amountPaid: 269000 }),
      order({ paidAt: vn(2026, 9, 12, 12), plan: "six_months", amountPaid: 269000 }),
      order({ paidAt: vn(2026, 10, 1, 1), plan: "six_months", amountPaid: 269000 }),
      order({ paidAt: vn(2026, 10, 1, 2), plan: "yearly", amountPaid: 500000 }),
    );
    const s = await getStats();
    const none = { revenue: 0, orders: 0 };
    expect(monthOf(s, "2026-09")).toEqual({ month: "2026-09", monthly: { revenue: 50000, orders: 1 }, six_months: { revenue: 538000, orders: 2 }, yearly: none });
    expect(monthOf(s, "2026-10")).toEqual({ month: "2026-10", monthly: none, six_months: { revenue: 269000, orders: 1 }, yearly: { revenue: 500000, orders: 1 } });
    // Doanh thu tháng này gộp mọi gói.
    expect(s.money.this_month).toBe(769000);
  });
```

- [ ] **Step 7: Chạy từng file rồi cả bộ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm vitest run test/checkout.test.ts test/orders.test.ts test/licenses.test.ts test/admin.test.ts test/admin-read.test.ts test/admin-stats.test.ts 2>&1 | grep -v "Using secrets" | grep -E "×|Test Files|Tests |AssertionError"`
Expected: toàn bộ xanh ngay lần đầu (`Test Files  6 passed (6)`).

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm typecheck && pnpm test 2>&1 | grep -v "Using secrets" | grep -E "×|Test Files|Tests "`
Expected: `Test Files  25 passed (25)`, `Tests  678 passed (678)` (665 + 3 checkout + 6 orders + 1 licenses + 1 admin + 1 admin-read + 1 admin-stats).

- [ ] **Step 8: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/test/checkout.test.ts server/test/orders.test.ts server/test/licenses.test.ts server/test/admin.test.ts server/test/admin-read.test.ts server/test/admin-stats.test.ts && git commit -q -m "$(cat <<'EOF'
test(server): luồng mua, đổi gói, kích hoạt, cấp tay, lọc, thống kê cho gói six_months

Chỉ thêm test; các đường đi chung đọc theo bảng gói nên xanh ngay, không sửa
logic. Gồm tạo đơn 269.000 đ, webhook, mua thêm +180 ngày, đổi gói ba chiều
(22, 183, 109 ngày), token hạn mức 6000, cấp tay, lọc đơn, doanh thu theo gói.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

### Task 5: Web Admin: gói thứ ba

`PLAN_OPTIONS` (bộ lọc) và ô chọn gói khi cấp license dựng từ `PLAN_LABELS` nên tự có thêm 6 Months; cần sửa: kiểu `PlanCode`, nhãn, biểu đồ doanh thu theo gói (chuỗi thứ ba; bảng màu đã có `--chart-3`), dữ liệu giả của `dev/fake-api.ts` và `scripts/csp-check.mjs` (trang Tổng quan đọc `m.six_months.revenue`, thiếu khóa này là lỗi). `dev/Gallery.tsx` là trang minh họa linh kiện, không phụ thuộc mã gói: không đổi.

**Files:**
- Modify: `server/admin-ui/src/api/types.ts`, `src/components/StatusBadge.tsx`, `src/pages/OverviewPage.tsx`, `dev/fake-api.ts`, `scripts/csp-check.mjs`
- Test: `server/admin-ui/src/pages/OverviewPage.test.tsx`, `server/admin-ui/src/pages/LicensesPage.test.tsx`

- [ ] **Step 1: Viết test (đỏ)**

**1a. `src/pages/OverviewPage.test.tsx`**

1) Dữ liệu mẫu: **thay**
```tsx
      monthly: MONTHS.map((month) => ({ month, monthly: { revenue: 50000, orders: 7 }, yearly: { revenue: 0, orders: 3 } })),
```
bằng
```tsx
      monthly: MONTHS.map((month) => ({
        month,
        monthly: { revenue: 50000, orders: 7 },
        six_months: { revenue: 269000, orders: 5 },
        yearly: { revenue: 0, orders: 3 },
      })),
```
2) Test "bốn biểu đồ…": **thay** `series: "Monthly|Yearly" }` bằng `series: "Monthly|6 Months|Yearly" }`.
3) Test biểu đồ theo gói: **thay**
```tsx
  it("biểu đồ theo gói: Monthly và Yearly lấy đúng doanh thu của gói (không tráo, không lấy số đơn)", async () => {
```
bằng
```tsx
  it("biểu đồ theo gói: Monthly, 6 Months và Yearly lấy đúng doanh thu của gói (không tráo, không lấy số đơn)", async () => {
```
và thay
```tsx
    expect(c.keys).toEqual(["monthly", "yearly"]);
    expect(c.data).toHaveLength(12);
    expect(c.data[0]).toEqual({ label: "11/2025", monthly: 50000, yearly: 0 });
    expect(c.data.every((r) => r.monthly === 50000 && r.yearly === 0)).toBe(true);
```
bằng
```tsx
    expect(c.keys).toEqual(["monthly", "six_months", "yearly"]);
    expect(c.data).toHaveLength(12);
    expect(c.data[0]).toEqual({ label: "11/2025", monthly: 50000, six_months: 269000, yearly: 0 });
    expect(c.data.every((r) => r.monthly === 50000 && r.six_months === 269000 && r.yearly === 0)).toBe(true);
```

**1b. `src/pages/LicensesPage.test.tsx`** — trong `describe("LicensesPage: cấp license mới")`, **thay** dòng cuối của test đầu tiên và đóng describe:
```tsx
    await waitFor(() => expect(calls.filter((c) => c.url === "/admin/licenses" && c.method === "GET")).toHaveLength(2));
  });
});
```
bằng
```tsx
    await waitFor(() => expect(calls.filter((c) => c.url === "/admin/licenses" && c.method === "GET")).toHaveLength(2));
  });

  it("ô chọn gói liệt kê đủ ba gói theo thời hạn và gửi mã six_months khi chọn 6 Months (spec 2026-10-13)", async () => {
    const user = userEvent.setup();
    render(<LicensesPage />);
    await user.click(await screen.findByRole("button", { name: "Cấp license mới…" }));
    const dialog = screen.getByRole("dialog");
    const select = within(dialog).getByLabelText("Gói") as HTMLSelectElement;
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ["monthly", "Monthly"],
      ["six_months", "6 Months"],
      ["yearly", "Yearly"],
    ]);
    await user.type(within(dialog).getByLabelText(/Lý do/), "tặng khách");
    await user.type(within(dialog).getByLabelText("Email của khách"), "khach@example.com");
    await user.selectOptions(select, "six_months");
    await user.click(within(dialog).getByRole("button", { name: "Cấp" }));
    expect(await screen.findByText(KEY)).toBeTruthy();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ email: "khach@example.com", plan: "six_months", note: "tặng khách" });
  });

  it("bộ lọc Gói liệt kê Tất cả và đủ ba gói", async () => {
    render(<LicensesPage />);
    const select = (await screen.findByLabelText("Gói")) as HTMLSelectElement;
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ["", "Tất cả"],
      ["monthly", "Monthly"],
      ["six_months", "6 Months"],
      ["yearly", "Yearly"],
    ]);
  });
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server/admin-ui && pnpm vitest run src/pages/OverviewPage.test.tsx src/pages/LicensesPage.test.tsx 2>&1 | grep -E "×|Test Files|Tests "`
Expected: FAIL: các test biểu đồ theo gói (chuỗi `Monthly|Yearly` chưa có `6 Months`) và hai test chọn gói mới (ô chọn chưa có `6 Months`).

- [ ] **Step 3: Cài đặt**

1) `src/api/types.ts`: **thay** `export type PlanCode = "monthly" | "yearly";` bằng:
```ts
export type PlanCode = "monthly" | "six_months" | "yearly";
```

2) `src/components/StatusBadge.tsx`: **thay**
```tsx
export const PLAN_LABELS: Record<PlanCode, string> = { monthly: "Monthly", yearly: "Yearly" };
```
bằng
```tsx
export const PLAN_LABELS: Record<PlanCode, string> = { monthly: "Monthly", six_months: "6 Months", yearly: "Yearly" };
```

3) `src/pages/OverviewPage.tsx`: **thay**
```tsx
            description="Cột chồng: Monthly và Yearly"
```
bằng
```tsx
            description="Cột chồng: Monthly, 6 Months và Yearly"
```
và thay
```tsx
              { key: "monthly", label: PLAN_LABELS.monthly },
              { key: "yearly", label: PLAN_LABELS.yearly },
            ]}
            data={money.monthly.map((m) => ({ label: fmtMonth(m.month), monthly: m.monthly.revenue, yearly: m.yearly.revenue }))}
```
bằng
```tsx
              { key: "monthly", label: PLAN_LABELS.monthly },
              { key: "six_months", label: PLAN_LABELS.six_months },
              { key: "yearly", label: PLAN_LABELS.yearly },
            ]}
            data={money.monthly.map((m) => ({
              label: fmtMonth(m.month),
              monthly: m.monthly.revenue,
              six_months: m.six_months.revenue,
              yearly: m.yearly.revenue,
            }))}
```

4) `dev/fake-api.ts`: **thay**
```ts
        monthly: { revenue: (18 + ((i * 5) % 9)) * 1000000, orders: (18 + ((i * 5) % 9)) * 20 },
        yearly:
```
bằng
```ts
        monthly: { revenue: (18 + ((i * 5) % 9)) * 1000000, orders: (18 + ((i * 5) % 9)) * 20 },
        six_months: { revenue: (6 + ((i * 3) % 7)) * 1076000, orders: (6 + ((i * 3) % 7)) * 4 },
        yearly:
```
và thay
```ts
        monthly: m.monthly.map((x) => ({ month: x.month, monthly: z(x.monthly), yearly: z(x.yearly) })),
```
bằng
```ts
        monthly: m.monthly.map((x) => ({ month: x.month, monthly: z(x.monthly), six_months: z(x.six_months), yearly: z(x.yearly) })),
```

5) `scripts/csp-check.mjs`: **thay**
```js
        monthly: { revenue: (i % 4) * 150000, orders: (i % 4) * 3 },
        yearly:
```
bằng
```js
        monthly: { revenue: (i % 4) * 150000, orders: (i % 4) * 3 },
        six_months: { revenue: (i % 5) * 269000, orders: i % 5 },
        yearly:
```

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server/admin-ui && pnpm typecheck && pnpm test 2>&1 | grep -E "×|Test Files|Tests " && pnpm build 2>&1 | tail -2`
Expected: `tsc` không lỗi; `Test Files  40 passed (40)`, `Tests  845 passed (845)` (843 + 2); `✓ built in …ms`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short && git add server/admin-ui/src/api/types.ts server/admin-ui/src/components/StatusBadge.tsx server/admin-ui/src/pages/OverviewPage.tsx server/admin-ui/src/pages/OverviewPage.test.tsx server/admin-ui/src/pages/LicensesPage.test.tsx server/admin-ui/dev/fake-api.ts server/admin-ui/scripts/csp-check.mjs && git commit -q -m "$(cat <<'EOF'
feat(admin): gói 6 Months ở Web Admin (nhãn, bộ lọc, ô cấp license, biểu đồ doanh thu)

PlanCode và PLAN_LABELS thêm six_months; biểu đồ doanh thu theo gói thêm chuỗi thứ
ba (--chart-3 có sẵn); dữ liệu giả của fake-api và csp-check thêm khóa six_months.
Bộ lọc và ô chọn gói dựng từ PLAN_LABELS nên tự có gói mới.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

### Task 6: Kiểm toàn bộ phần server và Web Admin

**Files:** `docs/superpowers/specs/2026-10-13-six-months-plan-design.md` (sửa một câu).

- [ ] **Step 1: Chạy `pnpm check` đầy đủ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm check 2>&1 | grep -v "Using secrets" | grep -E "×|Test Files|Tests |^ℹ (pass|fail|skipped)|vectors|rror|exiting now|✓ built"`
Expected: không có dòng `×` hay `rror`; `Tests  678 passed (678)`; `ℹ pass 18`, `ℹ fail 0`; `Tests  845 passed (845)` (Web Admin); `✓ built in …`; hai dòng `--dry-run: exiting now.`.

- [ ] **Step 2: Đối chiếu số commit và cây làm việc**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git log --oneline -6 && git status --short`
Expected: các commit gần nhất gồm năm commit của Task 1 đến 5 (và commit kế hoạch nếu đã commit); `git status` chỉ còn file chưa theo dõi `docs/superpowers/specs/2026-10-11-doc-to-ban-dich-research.md` (và các file kế hoạch nếu chưa commit).

- [ ] **Step 3: Sửa một câu trong spec cho khớp thực tế**

Trong `docs/superpowers/specs/2026-10-13-six-months-plan-design.md` mục 2.4, **thay**
```
tài liệu `Gallery` và dữ liệu giả cập nhật cho đúng.
```
bằng
```
dữ liệu giả của `dev/fake-api.ts` và `scripts/csp-check.mjs` thêm khóa `six_months`. `dev/Gallery.tsx` là trang minh họa linh kiện, không phụ thuộc mã gói nên không đổi.
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add docs/superpowers/specs/2026-10-13-six-months-plan-design.md && git commit -q -m "$(cat <<'EOF'
docs(specs): gói 6 Months mục 2.4 khớp thực tế (fake-api, csp-check; Gallery không đổi)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

**Việc còn lại sau kế hoạch này (không làm ở đây):** áp migration 0003 và deploy Worker API, Worker admin lên production (spec §6, chỉ khi chủ dự án cho phép từng bước); kế hoạch 02 (app, kèm vector token) và 03 (website, tài liệu).
