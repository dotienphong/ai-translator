# Báo cáo lỗi 01: server và API của Web Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Worker `mt-license` nhận báo cáo lỗi đã che dữ liệu từ app (`POST /v1/diagnostics`), lưu vào D1 giữ 30 ngày, và Worker admin có API đọc, tìm, xóa báo cáo; xóa theo email xóa luôn báo cáo của máy thuộc email đó.

**Architecture:** Một migration `0004` thêm hai bảng (`error_reports` cho metadata, `error_report_logs` cho log). Logic dùng chung của hai Worker (kiểu, kiểm schema, lưu, dọn) nằm ở `src/error-reports.ts`, bộ phát hiện dữ liệu nhạy cảm ở `src/diagnostics-scan.ts` dùng chung với app qua file vector `test/vectors/scrub-v1.json`. Route API ở `src/diagnostics.ts`, route admin ở `src/admin-reports.ts` (dùng lại `listRoute` của `admin-read.ts`).

**Tech Stack:** TypeScript strict, Hono 4.13, Cloudflare Workers + D1, vitest 4 với `@cloudflare/vitest-plugin`, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-17-diagnostics-reports-design.md` (mục 2, 3, 4). Đọc spec trước khi làm.

**Quy tắc chung cho mọi task:**
- Làm trong worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports` (nhánh `diagnostics-reports`). **Mọi lệnh bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`** vì shell reset thư mục sau mỗi lệnh.
- **Không merge, không push, không deploy.**
- Mã TypeScript phải qua `tsc` với `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` (dùng `import type` hay `type` trong import cho kiểu).
- Chú thích trong mã bằng tiếng Việt, theo giọng các file kế bên.
- Hai Worker không được kéo mã của nhau (`test/node/worker-split.test.mjs`): `src/deps.ts` không nhập `./admin*`; các file dùng chung (`error-reports.ts`, `diagnostics-scan.ts`) không nhập `./admin*` hay `./app`.
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Hợp đồng (kế hoạch 02 và 03 dựa vào đây, đừng đổi khi chưa sửa cả hai)

**Báo cáo gửi từ app** (`POST /v1/diagnostics`, `Content-Type: application/json`, tối đa 80 KB):

```json
{
  "v": 1,
  "id": "R-7F3K-92QD",
  "kind": "session_error",
  "code": "sidecarFailed",
  "fingerprint": "3fa1c09be2d47a55",
  "at": 1790812740,
  "message": "tiến trình phụ không khởi động được",
  "build": "release",
  "app": { "version": "0.1.10" },
  "os": { "name": "macos", "version": "15.6.1", "arch": "aarch64" },
  "hw": { "chip": "Apple M4 Pro", "ram_mb": 24576, "gpu_backend": "metal" },
  "model_pack": "standard",
  "plan": "monthly",
  "ui_lang": "vi",
  "device_id_hash": "<64 hex>",
  "logs": { "app": "…", "asr": "…", "llama": "…" }
}
```

- `kind`: `crash`, `session_error`, `sidecar_died`, `manual`. `manual` thì `code` là `null` và `fingerprint` là `"0000000000000000"`; các loại khác thì `code` khớp `^[A-Za-z][A-Za-z0-9_]{0,63}$` và `fingerprint` là 16 hex khác toàn số 0.
- `id`: `R-` + 4 + `-` + 4 ký tự Crockford base32 hoa (`0-9A-HJKMNP-TV-Z`).
- `chip`, `ram_mb`, `gpu_backend`, `model_pack`, `plan` có thể `null`. `gpu_backend` ∈ `metal`, `vulkan`, `cpu`. `plan` ∈ `free`, `monthly`, `six_months`, `yearly`. `ui_lang` ∈ `vi`, `en`, `ja`, `zh`, `ko`. `build` ∈ `release`, `debug`.
- Trần: `message` 500 ký tự; log `app` 24 KiB, `asr` 16 KiB, `llama` 16 KiB (tính theo byte UTF-8); `at` lệch giờ server tối đa 7 ngày.
- Phản hồi: `202 {"id"}`; `400 {"error":"invalid_request","field":"<khóa cấp trên>"}`; `413`; `415`; `422 {"error":"rejected_sensitive","rule":"<quy tắc>"}`; `429` kèm `Retry-After`.
- Giới hạn theo giờ: IP 30, máy 3, toàn hệ thống 120.

**API admin** (Worker admin, sau Access; GET đọc ghi `list_viewed` hay `error_report_viewed`):

| Route | Trả về |
|---|---|
| `GET /admin/error-groups?kind=&app_version=&include_debug=1&cursor=` | `{ items: ErrorGroup[], next_cursor }` |
| `GET /admin/error-reports?kind=&fingerprint=&device=&report=&include_debug=1&cursor=` | `{ items: ErrorReport[], next_cursor }` (không có log) |
| `GET /admin/error-reports/:id` | `ErrorReportDetail` hoặc `404` |
| `POST /admin/error-reports/delete` body `{ "id" }` hoặc `{ "fingerprint" }` | `{ "deleted": n }` hoặc `404` |

```ts
interface ErrorGroup { fingerprint: string; kind: "crash" | "session_error" | "sidecar_died"; code: string | null;
  reports: number; devices: number; release_reports: number; debug_reports: number;
  first_at: number; last_at: number; versions: string[] }
interface ErrorReport { id: string; received_at: number; occurred_at: number; kind: ReportKind; code: string | null;
  fingerprint: string; build: "release" | "debug"; app_version: string; os_name: string; os_version: string; arch: string;
  chip: string | null; ram_mb: number | null; gpu_backend: "metal" | "vulkan" | "cpu" | null; model_pack: string | null;
  plan: "free" | "monthly" | "six_months" | "yearly" | null; ui_lang: string; device_id_hash: string; message: string }
interface ErrorReportDetail extends ErrorReport { logs: { app: string; asr: string; llama: string } }
```

Mặc định danh sách ẩn báo cáo `build = debug` (nhóm chỉ hiện khi có ít nhất một báo cáo release); `include_debug=1` bật lại.

## Cấu trúc file

| File | Việc |
|---|---|
| Create `server/migrations/0004_error_reports.sql` | Hai bảng và ba index |
| Create `server/src/diagnostics-scan.ts` | `findSensitive`: phát hiện key, token, Bearer, Authorization, email, đường dẫn home |
| Create `server/src/error-reports.ts` | Kiểu, `parseReport`, `findReportSensitive`, `insertReportStatements`, `pruneErrorReports` |
| Create `server/src/diagnostics.ts` | `POST /v1/diagnostics` |
| Create `server/src/admin-reports.ts` | Bốn route admin |
| Modify `server/src/app.ts` | Trần body riêng cho `/v1/diagnostics`, gắn route |
| Modify `server/src/ratelimit.ts` | Ba hạn mức `diag_*` |
| Modify `server/src/alerts.ts` | Hai `AlertKind` mới |
| Modify `server/src/http.ts` | Mã lỗi `rejected_sensitive` |
| Modify `server/src/reconcile.ts` | Bước dọn báo cáo cũ |
| Modify `server/src/admin-read.ts` | Export `listRoute`, `Filters`, `Bind`, `ListSpec`; thêm `error_report_viewed` vào `VIEW_ACTIONS` |
| Modify `server/src/admin.ts` | Gắn `registerAdminReports`; `/admin/erase` xóa báo cáo |
| Create `server/test/vectors/scrub-v1.json` | Vector dùng chung với app |
| Create `server/test/report-fixture.ts` | `validReport`, `makeReport` |
| Create `server/test/diagnostics-scan.test.ts`, `error-reports.test.ts`, `diagnostics.test.ts`, `admin-reports.test.ts` | Test mới |
| Modify `server/test/schema.test.ts`, `migrations.test.ts`, `db.ts`, `admin.test.ts`, `reconcile.test.ts` | Cập nhật theo bảng mới |

---

### Task 0: Chuẩn bị môi trường

**Files:** không sửa file.

- [ ] **Step 1: Kiểm nhánh và cài phụ thuộc**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git branch --show-current
```
Expected: `diagnostics-reports`

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm -C server install --frozen-lockfile
```
Expected: kết thúc không lỗi (cài cả `admin-ui` vì nó là workspace của `server/`).

- [ ] **Step 2: Chạy mốc xuất phát**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -8
```
Expected: `tsc` không lỗi; vitest báo mọi file test `passed` (khoảng 1.300 test, số của lần chạy 2026-10-16). Nếu có test đỏ **trước** khi sửa gì, dừng lại và báo, đừng làm tiếp.

---

### Task 1: Migration `0004` và các test theo bảng mới

**Files:**
- Create: `server/migrations/0004_error_reports.sql`
- Modify: `server/test/schema.test.ts:9-19`
- Modify: `server/test/db.ts` (hàm `resetDb`)
- Modify: `server/test/migrations.test.ts:10-12`, dòng `await applyD1Migrations(db, env.TEST_MIGRATIONS);` trong test 0003, và thêm test 0004 ở cuối file

- [ ] **Step 1: Sửa test để đòi bảng mới (test đỏ)**

Trong `server/test/schema.test.ts`, đổi danh sách bảng (giữ thứ tự bảng chữ cái):

```ts
  expect(results.map((r) => r.name)).toEqual([
    "activations",
    "audit_log",
    "d1_migrations",
    "deactivations",
    "error_report_logs",
    "error_reports",
    "licenses",
    "ops_alerts",
    "orders",
    "rate_limits",
    "trials",
  ]);
```

Trong `server/test/db.ts`, hàm `resetDb`: thêm hai bảng **đứng đầu** danh sách (bảng con xóa trước bảng cha):

```ts
export async function resetDb(): Promise<void> {
  await env.DB.batch(
    [
      "error_report_logs",
      "error_reports",
      "audit_log",
      "deactivations",
      "activations",
      "orders",
      "licenses",
      "rate_limits",
      "ops_alerts",
      "trials",
      "sqlite_sequence",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
}
```

Trong `server/test/migrations.test.ts`:

1. Đổi test đầu file:

```ts
it("có đúng bốn migration theo thứ tự", () => {
  expect(names).toEqual([
    "0001_init.sql",
    "0002_three_plans_trials.sql",
    "0003_six_months_plan.sql",
    "0004_error_reports.sql",
  ]);
});
```

2. Trong test `"0003 nới CHECK mã gói…"`, đổi đúng một dòng `await applyD1Migrations(db, env.TEST_MIGRATIONS);` (nằm ngay sau `expect(seqBefore.deactivations)…`) thành chỉ áp ba migration đầu, vì test này so sánh **toàn bộ** index trước và sau và sẽ vỡ khi 0004 thêm index:

```ts
  // Chỉ áp 0003: 0004 thêm index riêng và có test riêng ở cuối file.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 3));
```

3. Thêm vào **cuối file** test 0004:

```ts
it("0004 chỉ thêm hai bảng báo cáo lỗi và ba index; bảng cũ và dữ liệu cũ giữ nguyên", async () => {
  // D1 đang ở trạng thái sau 0003 (test trên chỉ áp ba migration đầu).
  const tables = async () =>
    (
      await db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
        )
        .all<{ name: string; sql: string }>()
    ).results;
  const indexNames = async () =>
    (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results.map(
      (r) => r.name,
    );
  const before = await tables();
  const indexesBefore = await indexNames();
  const licensesBefore = (await db.prepare("SELECT * FROM licenses ORDER BY id").all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  const after = await tables();
  expect(after.filter((t) => !t.name.startsWith("error_report"))).toEqual(before);
  expect(after.map((t) => t.name).sort()).toEqual([...before.map((t) => t.name), "error_report_logs", "error_reports"].sort());
  expect(await indexNames()).toEqual(
    [...indexesBefore, "error_reports_device", "error_reports_fingerprint", "error_reports_received"].sort(),
  );
  expect((await db.prepare("SELECT * FROM licenses ORDER BY id").all()).results).toEqual(licensesBefore);

  const report = (id: string, kind: string) =>
    db
      .prepare(
        `INSERT INTO error_reports (id, received_at, occurred_at, kind, code, fingerprint, build, app_version, os_name, os_version, arch,
                                    chip, ram_mb, gpu_backend, model_pack, plan, ui_lang, device_id_hash, message)
         VALUES (?, 1, 1, ?, 'x', '0123456789abcdef', 'release', '0.1.10', 'macos', '15.6', 'aarch64', 'Apple M4 Pro', 24576, 'metal',
                 'standard', 'free', 'vi', ?, 'm')`,
      )
      .bind(id, kind, "d".repeat(64));
  await expect(report("R-AAAA-BBBB", "khac").run()).rejects.toThrow(/CHECK/);
  await report("R-AAAA-BBBB", "crash").run();
  await db.prepare("INSERT INTO error_report_logs (id, app_log, asr_log, llama_log) VALUES ('R-AAAA-BBBB', 'a', 'b', 'c')").run();
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/schema.test.ts test/migrations.test.ts 2>&1 | tail -25
```
Expected: FAIL ở `migration tạo đủ bảng`, `có đúng bốn migration` và test 0004 (chưa có file migration).

- [ ] **Step 3: Viết migration**

Tạo `server/migrations/0004_error_reports.sql`:

```sql
-- Báo cáo lỗi gửi từ app (spec 2026-10-17-diagnostics-reports-design.md §3). Chỉ THÊM hai bảng và ba index; không đổi bảng nào đã có.
-- Giữ 30 ngày và tối đa 3.000 báo cáo (cron */5 dọn: src/error-reports.ts, pruneErrorReports). Dữ liệu kỹ thuật tự hết hạn, khác với
-- dữ liệu khách hàng giữ không thời hạn (spec gốc §10.1).
-- Tách hai bảng để trang danh sách của Web Admin chỉ đọc metadata, không đọc phần log lớn.
-- Worker cũ không biết các bảng này nên chạy đúng trên schema mới: áp migration này TRƯỚC khi deploy Worker mới.

CREATE TABLE error_reports (
  id TEXT PRIMARY KEY,                   -- mã báo cáo "R-XXXX-XXXX" do app sinh; người dùng đọc cho hỗ trợ
  received_at INTEGER NOT NULL,          -- giờ server (giây Unix); mốc để giữ 30 ngày
  occurred_at INTEGER NOT NULL,          -- giờ máy lúc xảy ra (app gửi; server đã kiểm lệch tối đa 7 ngày)
  kind TEXT NOT NULL CHECK (kind IN ('crash', 'session_error', 'sidecar_died', 'manual')),
  code TEXT,                             -- mã lỗi; NULL với 'manual'
  fingerprint TEXT NOT NULL,             -- 16 hex; 16 số 0 với 'manual'
  build TEXT NOT NULL CHECK (build IN ('release', 'debug')),
  app_version TEXT NOT NULL,
  os_name TEXT NOT NULL,
  os_version TEXT NOT NULL,
  arch TEXT NOT NULL,
  chip TEXT,
  ram_mb INTEGER,
  gpu_backend TEXT,                      -- 'metal' | 'vulkan' | 'cpu'; kiểm ở src/error-reports.ts (không CHECK để thêm giá trị không cần migration)
  model_pack TEXT,
  plan TEXT,                             -- 'free' | mã gói trả phí; không có key
  ui_lang TEXT NOT NULL,
  device_id_hash TEXT NOT NULL,          -- cùng giá trị với trials và activations; xóa theo email dùng nó để tìm báo cáo của máy
  message TEXT NOT NULL                  -- đã che dữ liệu cá nhân phía app, server kiểm lại
);
CREATE INDEX error_reports_fingerprint ON error_reports (fingerprint, received_at);
CREATE INDEX error_reports_received ON error_reports (received_at);
CREATE INDEX error_reports_device ON error_reports (device_id_hash);

CREATE TABLE error_report_logs (
  id TEXT PRIMARY KEY REFERENCES error_reports (id),
  app_log TEXT NOT NULL,
  asr_log TEXT NOT NULL,
  llama_log TEXT NOT NULL
);
```

- [ ] **Step 4: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/schema.test.ts test/migrations.test.ts 2>&1 | tail -12
```
Expected: PASS cả hai file.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/migrations/0004_error_reports.sql server/test/schema.test.ts server/test/migrations.test.ts server/test/db.ts && git commit -m "feat(server): migration 0004 bảng báo cáo lỗi" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Vector dùng chung và bộ phát hiện dữ liệu nhạy cảm

**Files:**
- Create: `server/test/vectors/scrub-v1.json`
- Create: `server/test/diagnostics-scan.test.ts`
- Create: `server/src/diagnostics-scan.ts`

File vector là **hợp đồng** với app (kế hoạch 03 dùng cùng file trong test Rust). Chỉ dùng cấu trúc regex có ở cả JavaScript và crate `regex` của Rust (không lookahead, lookbehind, backreference); mọi lượng từ phải có cận trên để không chậm theo cấp bình phương trên dòng dài.

- [ ] **Step 1: Viết vector**

Tạo `server/test/vectors/scrub-v1.json`:

```json
{
  "version": 1,
  "comment": "Hợp đồng giữa app (Rust, src-tauri/src/diagnostics/scrub.rs) và server (TypeScript, src/diagnostics-scan.ts) cho báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §2, §3). detect: chuỗi PHẢI bị bộ phát hiện báo đúng quy tắc (quy tắc đầu tiên khớp theo rule_order). clean: chuỗi KHÔNG được bị báo. scrub: hàm che của app đổi input thành đúng expected (params ghi đè scrub_defaults); mọi expected cũng phải clean. Thứ tự che: Authorization, Bearer, token, key, email, query của URL, rồi thư mục home, tên máy, tên tài khoản (tên tài khoản ngắn hơn 3 ký tự thì không che, che theo cả từ, không phân biệt hoa thường). Sửa file này thì sửa cả bản TypeScript và bản Rust.",
  "rule_order": ["license_key", "token", "bearer", "authorization", "email", "home_path"],
  "scrub_defaults": { "home": "/Users/alice", "user": "alice", "host": "alice-mbp" },
  "detect": [
    { "name": "key 7 nhóm", "text": "license 7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF bị từ chối", "rule": "license_key" },
    { "name": "key 28 ký tự liền", "text": "key=7Q2K9XMBR3TVHW4Y5ZJ68NPACDEF", "rule": "license_key" },
    { "name": "key dính sau chữ có dấu", "text": "ý7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF", "rule": "license_key" },
    { "name": "token v1", "text": "token v1.eyJraWQiOiJ0ZXN0LTEifQ.MEUCIQDabcdefghijklmnop hết hạn", "rule": "token" },
    { "name": "Bearer", "text": "Bearer abcdef0123456789xyz", "rule": "bearer" },
    { "name": "Authorization kèm Bearer: ưu tiên bearer", "text": "Authorization: Bearer abcdef0123456789", "rule": "bearer" },
    { "name": "Authorization giá trị thường", "text": "authorization=s3cr3tvalue", "rule": "authorization" },
    { "name": "email", "text": "gửi cho an.nguyen+test@example.co.uk xong", "rule": "email" },
    { "name": "đường dẫn macOS của người khác", "text": "mở /Users/bob/Library/Logs/app.log", "rule": "home_path" },
    { "name": "đường dẫn Linux", "text": "đọc /home/carol/.config/x", "rule": "home_path" },
    { "name": "đường dẫn Windows", "text": "C:\\Users\\Dave\\AppData\\Local\\x", "rule": "home_path" },
    { "name": "đường dẫn Windows dùng gạch xuôi", "text": "C:/Users/Dave/AppData", "rule": "home_path" },
    { "name": "URL file", "text": "file:///Users/erin/Desktop/a.txt", "rule": "home_path" },
    { "name": "đường dẫn ở đầu chuỗi", "text": "/Users/frank/x", "rule": "home_path" }
  ],
  "clean": [
    { "name": "dòng log app thường", "text": "[2026-10-17][05:07:12][INFO][pipeline::supervisor] tiến trình phụ: Stopped { which: Asr, idle: true }" },
    { "name": "đường dẫn macOS đã che", "text": "model '~/Library/Application Support/com.aitranslator.desktop/models/Hy-MT2-1.8B-Q4_K.gguf'" },
    { "name": "đường dẫn Windows đã che", "text": "~\\AppData\\Local\\com.aitranslator.desktop\\logs\\app.log" },
    { "name": "Bearer đã che", "text": "Bearer <redacted>" },
    { "name": "Authorization đã che", "text": "Authorization: <redacted>" },
    { "name": "chỗ giữ chỗ key, token, email", "text": "key <key> token <token> mail <email>" },
    { "name": "đường dẫn có chỗ giữ chỗ tên", "text": "/Users/<user>/Library" },
    { "name": "thư mục dùng chung macOS", "text": "/Users/Shared/Adobe/x" },
    { "name": "thư mục Public của Windows", "text": "C:\\Users\\Public\\Documents" },
    { "name": "All Users của Windows", "text": "C:\\Users\\All Users\\Microsoft" },
    { "name": "đường dẫn hệ thống", "text": "/usr/local/bin/x và /private/var/folders/zz/T/x" },
    { "name": "28 ký tự chữ thường", "text": "a3f9c2d1e0b4a3f9c2d1e0b4a3f9" },
    { "name": "SHA-256 hex", "text": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" },
    { "name": "dòng ggml", "text": "ggml_metal_library_compile_pipeline: loaded kernel_mul_mv_f16_f32_4 0x97e08c000 | th_max = 1024 | th_width = 32" },
    { "name": "dòng llama", "text": "0.00.945.797 I srv  llama_server: listening on http://127.0.0.1:62411" },
    { "name": "tên chip có dấu @", "text": "Intel(R) Core(TM) i7-1185G7 @ 3.00GHz" },
    { "name": "số phiên bản trông giống token", "text": "version v1.2.3 started" }
  ],
  "scrub": [
    {
      "name": "đường dẫn model macOS",
      "input": "loading model '/Users/alice/Library/Application Support/com.aitranslator.desktop/models/Hy-MT2.gguf'",
      "expected": "loading model '~/Library/Application Support/com.aitranslator.desktop/models/Hy-MT2.gguf'"
    },
    {
      "name": "đường dẫn log Windows",
      "params": { "home": "C:\\Users\\alice", "user": "alice", "host": "ALICE-PC" },
      "input": "C:\\Users\\alice\\AppData\\Local\\com.aitranslator.desktop\\logs\\app.log",
      "expected": "~\\AppData\\Local\\com.aitranslator.desktop\\logs\\app.log"
    },
    { "name": "tên tài khoản đứng riêng", "input": "người dùng alice mở app", "expected": "người dùng <user> mở app" },
    { "name": "tên máy", "input": "máy alice-mbp sẵn sàng", "expected": "máy <host> sẵn sàng" },
    {
      "name": "tên tài khoản ngắn không bị che (tránh phá chữ thường)",
      "params": { "home": "/Users/an", "user": "an", "host": "an-mbp" },
      "input": "an error on /Users/an/x",
      "expected": "an error on ~/x"
    },
    { "name": "key 7 nhóm", "input": "key 7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF used", "expected": "key <key> used" },
    { "name": "key liền", "input": "key=7Q2K9XMBR3TVHW4Y5ZJ68NPACDEF", "expected": "key=<key>" },
    {
      "name": "token",
      "input": "token v1.eyJraWQiOiJ0ZXN0LTEifQ.MEUCIQDabcdefghijklmnop ok",
      "expected": "token <token> ok"
    },
    { "name": "Bearer", "input": "Bearer abcdef0123456789xyz", "expected": "Bearer <redacted>" },
    { "name": "Authorization cả dòng", "input": "Authorization: Bearer abcdef0123456789", "expected": "Authorization: <redacted>" },
    { "name": "Authorization không Bearer", "input": "authorization=s3cr3tvalue", "expected": "authorization=<redacted>" },
    { "name": "email", "input": "liên hệ an.nguyen+test@example.co.uk ngay", "expected": "liên hệ <email> ngay" },
    {
      "name": "query của URL",
      "input": "GET https://api.aitranslator.io.vn/v1/orders/1000013?token=abc123&x=1 200",
      "expected": "GET https://api.aitranslator.io.vn/v1/orders/1000013?<query> 200"
    },
    {
      "name": "dòng thường không đổi",
      "input": "[2026-10-17][05:07:12][INFO][pipeline::supervisor] tiến trình phụ: Stopped { which: Asr, idle: true }",
      "expected": "[2026-10-17][05:07:12][INFO][pipeline::supervisor] tiến trình phụ: Stopped { which: Asr, idle: true }"
    },
    {
      "name": "nhiều thứ trong một dòng",
      "input": "/Users/alice/x gửi alice@example.com bằng 7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF",
      "expected": "~/x gửi <email> bằng <key>"
    }
  ]
}
```

- [ ] **Step 2: Viết test (đỏ)**

Tạo `server/test/diagnostics-scan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findSensitive, type SensitiveRule } from "../src/diagnostics-scan";
import vectors from "./vectors/scrub-v1.json";

describe("bộ phát hiện dữ liệu nhạy cảm (vector dùng chung với app)", () => {
  it.each(vectors.detect)("phát hiện: $name", ({ text, rule }) => {
    expect(findSensitive(text)).toBe(rule as SensitiveRule);
  });

  it.each(vectors.clean)("không báo nhầm: $name", ({ text }) => {
    expect(findSensitive(text)).toBeNull();
  });

  it.each(vectors.scrub)("kết quả che không còn gì nhạy cảm: $name", ({ expected }) => {
    expect(findSensitive(expected)).toBeNull();
  });

  it("nhiều quy tắc cùng khớp thì báo quy tắc đầu theo rule_order", () => {
    expect(vectors.rule_order).toEqual(["license_key", "token", "bearer", "authorization", "email", "home_path"]);
    const key = "7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF";
    expect(findSensitive(`${key} a@b.co /Users/bob/x`)).toBe("license_key");
    expect(findSensitive("a@b.co /Users/bob/x")).toBe("email");
  });

  it("đường dẫn dùng chung đứng cạnh đường dẫn của người khác vẫn bị báo", () => {
    expect(findSensitive("/Users/Shared/x và /Users/bob/y")).toBe("home_path");
    expect(findSensitive("/Users/Shared/x và /Users/Public/y")).toBeNull();
  });

  it("chuỗi dài không bị chậm theo cấp bình phương (lượng từ có cận)", () => {
    const started = performance.now();
    for (const text of ["a".repeat(60_000), "a.".repeat(30_000), "ABCD-".repeat(12_000), "v1.".repeat(20_000), "/Users/".repeat(8_000)]) {
      findSensitive(text);
    }
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/diagnostics-scan.test.ts 2>&1 | tail -10
```
Expected: FAIL (không tìm thấy `../src/diagnostics-scan`).

- [ ] **Step 4: Viết bộ phát hiện**

Tạo `server/src/diagnostics-scan.ts`:

```ts
// Bộ phát hiện dữ liệu nhạy cảm còn sót trong báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §2, §3). App đã che trước
// khi gửi; server KHÔNG tin điều đó: mọi chuỗi của báo cáo qua đây một lần nữa, khớp thì từ chối (422), không lưu.
// Bộ mẫu dùng chung với app (Rust) qua test/vectors/scrub-v1.json: sửa mẫu ở đây thì sửa vector và bản Rust cùng lúc.
// Chỉ dùng cấu trúc regex có ở cả JavaScript và crate `regex` của Rust (không lookahead, lookbehind, backreference), và mọi lượng
// từ có cận trên để chuỗi dài (một dòng log 24 KiB) không làm regex chạy theo cấp bình phương.

export type SensitiveRule = "license_key" | "token" | "bearer" | "authorization" | "email" | "home_path";

/** License key: 28 ký tự Crockford base32, hiển thị 7 nhóm 4 ký tự nối bằng "-" (src/license-key.ts). */
const KEY_GROUPED = /\b(?:[0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}\b/;
const KEY_PLAIN = /\b[0-9A-HJKMNP-TV-Z]{28}\b/;
/** Token bản quyền: `v1.<base64url>.<base64url>` (src/token.ts). */
const TOKEN = /\bv1\.[A-Za-z0-9_-]{16,2048}\.[A-Za-z0-9_-]{16,2048}/;
const BEARER = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,2048}/i;
/** Giá trị đã che bắt đầu bằng "<", nên `Authorization: <redacted>` không khớp. */
const AUTHORIZATION = /\bauthorization\s*[:=]\s*[^\s<]/i;
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/;
/** Nhóm bắt là tên thư mục người dùng: `/Users/<tên>/…` hay `/home/<tên>/…`. */
const UNIX_HOME = /(?:^|[^A-Za-z0-9_])\/(?:Users|home)\/([^/\s"'<>:*?|\\]{1,128})/g;
const WINDOWS_HOME = /[A-Za-z]:[\\/]{1,4}Users[\\/]{1,4}([^\\/\s"'<>:*?|]{1,128})/gi;
/** Thư mục không phải của một người (so không phân biệt hoa thường; `All Users` bị cắt ở khoảng trắng nên là `all`). */
const NEUTRAL_HOME_NAMES = new Set(["shared", "public", "default", "all"]);

function hasPersonalHome(text: string): boolean {
  for (const pattern of [UNIX_HOME, WINDOWS_HOME]) {
    for (const m of text.matchAll(pattern)) {
      if (!NEUTRAL_HOME_NAMES.has((m[1] ?? "").toLowerCase())) return true;
    }
  }
  return false;
}

/** Quy tắc đầu tiên khớp (thứ tự: key, token, Bearer, Authorization, email, đường dẫn home), hoặc null nếu sạch. */
export function findSensitive(text: string): SensitiveRule | null {
  if (KEY_GROUPED.test(text) || KEY_PLAIN.test(text)) return "license_key";
  if (TOKEN.test(text)) return "token";
  if (BEARER.test(text)) return "bearer";
  if (AUTHORIZATION.test(text)) return "authorization";
  if (EMAIL.test(text)) return "email";
  if (hasPersonalHome(text)) return "home_path";
  return null;
}
```

- [ ] **Step 5: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/diagnostics-scan.test.ts 2>&1 | tail -12
```
Expected: PASS toàn bộ. Nếu một ca vector đỏ, **sửa regex, không sửa vector** (vector là hợp đồng với app); riêng ca `"đường dẫn có chỗ giữ chỗ tên"` (`/Users/<user>/Library`) phải sạch vì lớp ký tự của nhóm bắt loại `<`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/test/vectors/scrub-v1.json server/test/diagnostics-scan.test.ts server/src/diagnostics-scan.ts && git commit -m "feat(server): bộ phát hiện dữ liệu nhạy cảm cho báo cáo lỗi và vector dùng chung với app" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Kiểu, kiểm schema, lưu và dọn báo cáo (`error-reports.ts`)

**Files:**
- Create: `server/src/error-reports.ts`
- Create: `server/test/report-fixture.ts`
- Create: `server/test/error-reports.test.ts`

- [ ] **Step 1: Viết fixture dùng chung**

Tạo `server/test/report-fixture.ts`:

```ts
// Báo cáo lỗi mẫu hợp lệ cho test của server (dạng JSON app gửi, hợp đồng ở kế hoạch bao-cao-loi-01).
import { sha256Hex } from "../src/crypto";
import { type ErrorReport, parseReport } from "../src/error-reports";
import { T0 } from "./world";

/** Thân request hợp lệ; `overrides` ghi đè từng khóa cấp trên (không trộn sâu). */
export async function validReport(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return {
    v: 1,
    id: "R-7F3K-92QD",
    kind: "session_error",
    code: "sidecarFailed",
    fingerprint: "3fa1c09be2d47a55",
    at: T0 - 60,
    message: "tiến trình phụ không khởi động được",
    build: "release",
    app: { version: "0.1.10" },
    os: { name: "macos", version: "15.6.1", arch: "aarch64" },
    hw: { chip: "Apple M4 Pro", ram_mb: 24576, gpu_backend: "metal" },
    model_pack: "standard",
    plan: "monthly",
    ui_lang: "vi",
    device_id_hash: await sha256Hex("report-device-1"),
    logs: {
      app: "[2026-10-17][05:07:12][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr }\n",
      asr: "ggml_metal_init: error: failed to load\n",
      llama: "0.00.289.523 W load: special_eos_id is not in special_eog_ids\n",
    },
    ...overrides,
  };
}

/** Như validReport nhưng đã qua parseReport, để dùng với insertReportStatements. */
export async function makeReport(overrides: Record<string, unknown> = {}): Promise<ErrorReport> {
  const parsed = parseReport(await validReport(overrides), T0);
  if (!parsed.ok) throw new Error(`validReport sai ở trường ${parsed.field}`);
  return parsed.report;
}
```

- [ ] **Step 2: Viết test (đỏ)**

Tạo `server/test/error-reports.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { findReportSensitive, insertReportStatements, MAX_STORED_REPORTS, parseReport, pruneErrorReports, RETENTION_SECONDS } from "../src/error-reports";
import { resetDb } from "./db";
import { makeReport, validReport } from "./report-fixture";
import { DAY, T0 } from "./world";

beforeEach(resetDb);

describe("parseReport", () => {
  it("nhận báo cáo hợp lệ và dựng bản ghi phẳng", async () => {
    const parsed = parseReport(await validReport(), T0);
    expect(parsed).toMatchObject({
      ok: true,
      report: {
        id: "R-7F3K-92QD",
        kind: "session_error",
        code: "sidecarFailed",
        fingerprint: "3fa1c09be2d47a55",
        at: T0 - 60,
        build: "release",
        app_version: "0.1.10",
        os_name: "macos",
        os_version: "15.6.1",
        arch: "aarch64",
        chip: "Apple M4 Pro",
        ram_mb: 24576,
        gpu_backend: "metal",
        model_pack: "standard",
        plan: "monthly",
        ui_lang: "vi",
      },
    });
  });

  it("chip, ram, gpu, model_pack và plan có thể là null hoặc vắng", async () => {
    const parsed = parseReport(await validReport({ hw: {}, model_pack: null, plan: undefined }), T0);
    expect(parsed).toMatchObject({ ok: true, report: { chip: null, ram_mb: null, gpu_backend: null, model_pack: null, plan: null } });
  });

  it("báo cáo manual: code null, fingerprint toàn số 0", async () => {
    const ok = parseReport(await validReport({ kind: "manual", code: null, fingerprint: "0000000000000000" }), T0);
    expect(ok).toMatchObject({ ok: true, report: { kind: "manual", code: null } });
    expect(parseReport(await validReport({ kind: "manual", code: null }), T0)).toEqual({ ok: false, field: "fingerprint" });
    expect(parseReport(await validReport({ kind: "manual", fingerprint: "0000000000000000" }), T0)).toEqual({ ok: false, field: "code" });
    expect(parseReport(await validReport({ fingerprint: "0000000000000000" }), T0)).toEqual({ ok: false, field: "fingerprint" });
  });

  it("body không phải object", () => {
    expect(parseReport(null, T0)).toEqual({ ok: false, field: "body" });
  });

  it.each([
    ["v", { v: 2 }],
    ["id", { id: "R-7f3k-92qd" }],
    ["id", { id: "R-7F3I-92QD" }],
    ["kind", { kind: "other" }],
    ["code", { code: "" }],
    ["code", { code: "9bad" }],
    ["fingerprint", { fingerprint: "XYZ" }],
    ["at", { at: T0 - 8 * DAY }],
    ["at", { at: T0 + 8 * DAY }],
    ["at", { at: 1.5 }],
    ["message", { message: "x".repeat(501) }],
    ["build", { build: "beta" }],
    ["app", { app: { version: "x" } }],
    ["app", { app: null }],
    ["os", { os: { name: "", version: "1", arch: "a" } }],
    ["os", { os: { name: "macos\n", version: "1", arch: "a" } }],
    ["hw", { hw: { chip: null, ram_mb: -1, gpu_backend: null } }],
    ["hw", { hw: { chip: null, ram_mb: null, gpu_backend: "dx12" } }],
    ["hw", null],
    ["model_pack", { model_pack: "x".repeat(65) }],
    ["plan", { plan: "gold" }],
    ["ui_lang", { ui_lang: "fr" }],
    ["device_id_hash", { device_id_hash: "abc" }],
    ["logs", { logs: { app: "x".repeat(24 * 1024 + 1), asr: "", llama: "" } }],
    ["logs", { logs: { app: "", asr: "x".repeat(16 * 1024 + 1), llama: "" } }],
    ["logs", { logs: { app: "", asr: "", llama: "x".repeat(16 * 1024 + 1) } }],
    ["logs", { logs: { app: "", asr: "" } }],
  ])("%s sai thì trả đúng tên trường", async (field, patch) => {
    const body = patch === null ? await validReport({ [field]: null }) : await validReport(patch as Record<string, unknown>);
    expect(parseReport(body, T0)).toEqual({ ok: false, field });
  });

  it("trần log tính theo byte UTF-8, không theo số ký tự", async () => {
    // 8.193 ký tự "ế" là 24.579 byte: vượt trần 24 KiB dù chưa tới 24.576 ký tự.
    const body = await validReport({ logs: { app: "ế".repeat(8_193), asr: "", llama: "" } });
    expect(parseReport(body, T0)).toEqual({ ok: false, field: "logs" });
    const fits = await validReport({ logs: { app: "ế".repeat(8_192), asr: "", llama: "" } });
    expect(parseReport(fits, T0).ok).toBe(true);
  });
});

describe("findReportSensitive", () => {
  it("báo quy tắc khớp ở message, chip, model_pack hay một log; sạch thì null", async () => {
    expect(findReportSensitive(await makeReport())).toBeNull();
    const key = "7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF";
    expect(findReportSensitive(await makeReport({ message: `key ${key}` }))).toBe("license_key");
    expect(findReportSensitive(await makeReport({ chip: "a@b.co" }))).toBe("email");
    expect(findReportSensitive(await makeReport({ model_pack: "/Users/bob/x" }))).toBe("home_path");
    expect(findReportSensitive(await makeReport({ logs: { app: "", asr: "Bearer abcdef0123456789", llama: "" } }))).toBe("bearer");
    expect(findReportSensitive(await makeReport({ logs: { app: "", asr: "", llama: "/home/carol/x" } }))).toBe("home_path");
  });
});

describe("lưu và dọn", () => {
  const ids = async () => (await env.DB.prepare("SELECT id FROM error_reports ORDER BY id").all<{ id: string }>()).results.map((r) => r.id);
  const logIds = async () => (await env.DB.prepare("SELECT id FROM error_report_logs ORDER BY id").all<{ id: string }>()).results.map((r) => r.id);
  const seed = async (id: string, receivedAt: number) => env.DB.batch(insertReportStatements(env.DB, await makeReport({ id }), receivedAt));

  it("insertReportStatements ghi metadata và log; ghi lại cùng id thì không đổi gì (một dòng mỗi bảng)", async () => {
    await seed("R-0000-0001", T0);
    await seed("R-0000-0001", T0 + 5);
    expect(await ids()).toEqual(["R-0000-0001"]);
    expect(await logIds()).toEqual(["R-0000-0001"]);
    expect(await env.DB.prepare("SELECT received_at, app_log FROM error_report_logs l JOIN error_reports r ON r.id = l.id").first()).toEqual({
      received_at: T0,
      app_log: "[2026-10-17][05:07:12][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr }\n",
    });
  });

  it("xóa báo cáo quá 30 ngày cả hai bảng, giữ báo cáo còn hạn", async () => {
    await seed("R-0000-0001", T0 - RETENTION_SECONDS - 1);
    await seed("R-0000-0002", T0 - RETENTION_SECONDS + 60);
    await pruneErrorReports(env.DB, T0);
    expect(await ids()).toEqual(["R-0000-0002"]);
    expect(await logIds()).toEqual(["R-0000-0002"]);
  });

  it("vượt trần thì xóa báo cáo cũ nhất, giữ đúng số mới nhất", async () => {
    for (let n = 1; n <= 6; n++) await seed(`R-0000-000${n}`, T0 - n * 60);
    await pruneErrorReports(env.DB, T0, 4);
    expect(await ids()).toEqual(["R-0000-0001", "R-0000-0002", "R-0000-0003", "R-0000-0004"]);
    expect(await logIds()).toEqual(["R-0000-0001", "R-0000-0002", "R-0000-0003", "R-0000-0004"]);
  });

  it("trần mặc định là 3.000 và hạn mặc định là 30 ngày", () => {
    expect(MAX_STORED_REPORTS).toBe(3000);
    expect(RETENTION_SECONDS).toBe(30 * 86400);
  });
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/error-reports.test.ts 2>&1 | tail -10
```
Expected: FAIL (không tìm thấy `../src/error-reports`).

- [ ] **Step 4: Viết `error-reports.ts`**

Tạo `server/src/error-reports.ts`:

```ts
// Báo cáo lỗi gửi từ app (spec 2026-10-17-diagnostics-reports-design.md §2, §3): kiểu, kiểm schema, lưu và dọn.
// Dùng chung giữa Worker API (POST /v1/diagnostics, cron) và Worker admin (đọc, xóa), nên không nhập gì từ ./admin* hay ./app.
import { findSensitive, type SensitiveRule } from "./diagnostics-scan";
import { isRecord, parseDeviceIdHash } from "./http";
import { PLAN_CODES } from "./plans";

export const REPORT_KINDS = ["crash", "session_error", "sidecar_died", "manual"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_PLANS = ["free", ...PLAN_CODES] as const;
export type ReportPlan = (typeof REPORT_PLANS)[number];
export const UI_LANGS = ["vi", "en", "ja", "zh", "ko"] as const;
export type UiLang = (typeof UI_LANGS)[number];
export const GPU_BACKENDS = ["metal", "vulkan", "cpu"] as const;
export type GpuBackend = (typeof GPU_BACKENDS)[number];
export const BUILDS = ["release", "debug"] as const;
export type Build = (typeof BUILDS)[number];

/** Trần thân request của /v1/diagnostics (app giữ báo cáo ≤ 64 KB; phần dư cho cách escape JSON). */
export const MAX_BODY_BYTES = 80 * 1024;
/** Trần từng log, tính theo byte UTF-8. */
export const LOG_LIMITS = { app: 24 * 1024, asr: 16 * 1024, llama: 16 * 1024 } as const;
export const MAX_MESSAGE_CHARS = 500;
/** Giờ máy (`at`) được lệch giờ server tối đa ngần này. */
export const CLOCK_SKEW_SECONDS = 7 * 86400;
/** Dấu vân tay của báo cáo `manual`: báo cáo gửi tay không thuộc nhóm lỗi nào. */
export const ZERO_FINGERPRINT = "0000000000000000";
export const REPORT_ID = /^R-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
export const FINGERPRINT = /^[0-9a-f]{16}$/;

const CODE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]{1,32})?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export interface ErrorReport {
  id: string;
  kind: ReportKind;
  code: string | null;
  fingerprint: string;
  /** Giờ máy lúc xảy ra (giây Unix). */
  at: number;
  message: string;
  build: Build;
  app_version: string;
  os_name: string;
  os_version: string;
  arch: string;
  chip: string | null;
  ram_mb: number | null;
  gpu_backend: GpuBackend | null;
  model_pack: string | null;
  plan: ReportPlan | null;
  ui_lang: UiLang;
  device_id_hash: string;
  logs: { app: string; asr: string; llama: string };
}

export type ParseResult = { ok: true; report: ErrorReport } | { ok: false; field: string };

const bad = (field: string): ParseResult => ({ ok: false, field });

function oneOf<T extends string>(v: unknown, list: readonly T[]): T | null {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;
}

/** Chuỗi thông tin máy: 1 đến `max` ký tự, không có ký tự điều khiển. */
function meta(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length >= 1 && v.length <= max && !CONTROL.test(v) ? v : null;
}

type Optional<T> = { ok: true; value: T | null } | { ok: false };

/** Trường tùy chọn: null hay vắng là hợp lệ (giá trị null); có mà sai thì không hợp lệ. */
function optional<T>(v: unknown, parse: (x: unknown) => T | null): Optional<T> {
  if (v === null || v === undefined) return { ok: true, value: null };
  const parsed = parse(v);
  return parsed === null ? { ok: false } : { ok: true, value: parsed };
}

const utf8Length = (s: string): number => new TextEncoder().encode(s).length;

/**
 * Kiểm thân request của POST /v1/diagnostics. Sai thì trả tên khóa cấp trên của trường sai (kể cả lỗi ở khóa con, ví dụ
 * `os.arch` sai thì `os`). Không chạy bộ phát hiện dữ liệu nhạy cảm: việc đó ở findReportSensitive.
 */
export function parseReport(body: Record<string, unknown> | null, now: number): ParseResult {
  if (body === null) return bad("body");
  if (body.v !== 1) return bad("v");
  const id = typeof body.id === "string" && REPORT_ID.test(body.id) ? body.id : null;
  if (id === null) return bad("id");
  const kind = oneOf(body.kind, REPORT_KINDS);
  if (kind === null) return bad("kind");
  let code: string | null = null;
  if (kind === "manual") {
    if (body.code !== null && body.code !== undefined) return bad("code");
  } else {
    code = typeof body.code === "string" && CODE.test(body.code) ? body.code : null;
    if (code === null) return bad("code");
  }
  const fingerprint = typeof body.fingerprint === "string" && FINGERPRINT.test(body.fingerprint) ? body.fingerprint : null;
  if (fingerprint === null || (kind === "manual") !== (fingerprint === ZERO_FINGERPRINT)) return bad("fingerprint");
  const at = body.at;
  if (typeof at !== "number" || !Number.isSafeInteger(at) || Math.abs(at - now) > CLOCK_SKEW_SECONDS) return bad("at");
  const message = typeof body.message === "string" && body.message.length <= MAX_MESSAGE_CHARS ? body.message : null;
  if (message === null) return bad("message");
  const build = oneOf(body.build, BUILDS);
  if (build === null) return bad("build");

  const app = isRecord(body.app) ? body.app : null;
  const versionRaw = app?.version;
  const appVersion = typeof versionRaw === "string" && versionRaw.length <= 40 && VERSION.test(versionRaw) ? versionRaw : null;
  if (appVersion === null) return bad("app");

  const os = isRecord(body.os) ? body.os : null;
  const osName = meta(os?.name, 32);
  const osVersion = meta(os?.version, 64);
  const arch = meta(os?.arch, 16);
  if (osName === null || osVersion === null || arch === null) return bad("os");

  const hw = isRecord(body.hw) ? body.hw : null;
  if (hw === null) return bad("hw");
  const chip = optional(hw.chip, (x) => meta(x, 128));
  const ram = optional(hw.ram_mb, (x) => (typeof x === "number" && Number.isSafeInteger(x) && x >= 0 && x <= 4_194_304 ? x : null));
  const gpu = optional(hw.gpu_backend, (x) => oneOf(x, GPU_BACKENDS));
  if (!chip.ok || !ram.ok || !gpu.ok) return bad("hw");

  const modelPack = optional(body.model_pack, (x) => meta(x, 64));
  if (!modelPack.ok) return bad("model_pack");
  const plan = optional(body.plan, (x) => oneOf(x, REPORT_PLANS));
  if (!plan.ok) return bad("plan");
  const uiLang = oneOf(body.ui_lang, UI_LANGS);
  if (uiLang === null) return bad("ui_lang");
  const deviceIdHash = parseDeviceIdHash(body.device_id_hash);
  if (deviceIdHash === null) return bad("device_id_hash");

  const logs = isRecord(body.logs) ? body.logs : null;
  const appLog = logs?.app;
  const asrLog = logs?.asr;
  const llamaLog = logs?.llama;
  if (
    typeof appLog !== "string" ||
    typeof asrLog !== "string" ||
    typeof llamaLog !== "string" ||
    utf8Length(appLog) > LOG_LIMITS.app ||
    utf8Length(asrLog) > LOG_LIMITS.asr ||
    utf8Length(llamaLog) > LOG_LIMITS.llama
  ) {
    return bad("logs");
  }

  return {
    ok: true,
    report: {
      id,
      kind,
      code,
      fingerprint,
      at,
      message,
      build,
      app_version: appVersion,
      os_name: osName,
      os_version: osVersion,
      arch,
      chip: chip.value,
      ram_mb: ram.value,
      gpu_backend: gpu.value,
      model_pack: modelPack.value,
      plan: plan.value,
      ui_lang: uiLang,
      device_id_hash: deviceIdHash,
      logs: { app: appLog, asr: asrLog, llama: llamaLog },
    },
  };
}

/** Quy tắc nhạy cảm đầu tiên khớp trong các chuỗi tự do của báo cáo (không tính id, dấu vân tay, mã máy đã băm), hoặc null. */
export function findReportSensitive(r: ErrorReport): SensitiveRule | null {
  const strings = [r.message, r.chip, r.model_pack, r.os_name, r.os_version, r.app_version, r.logs.app, r.logs.asr, r.logs.llama];
  for (const s of strings) {
    if (s === null) continue;
    const rule = findSensitive(s);
    if (rule !== null) return rule;
  }
  return null;
}

/**
 * Hai câu ghi của một báo cáo, để đặt trong một batch. Câu thứ hai chỉ ghi khi câu đầu thật sự thêm một dòng (`changes() = 1`),
 * nên gửi lại cùng mã báo cáo (app thử lại sau lỗi mạng) không đổi gì. Câu đầu cho `meta.changes` để biết báo cáo có mới không.
 */
export function insertReportStatements(db: D1Database, r: ErrorReport, receivedAt: number): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT OR IGNORE INTO error_reports (id, received_at, occurred_at, kind, code, fingerprint, build, app_version, os_name, os_version,
                                              arch, chip, ram_mb, gpu_backend, model_pack, plan, ui_lang, device_id_hash, message)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
      )
      .bind(
        r.id,
        receivedAt,
        r.at,
        r.kind,
        r.code,
        r.fingerprint,
        r.build,
        r.app_version,
        r.os_name,
        r.os_version,
        r.arch,
        r.chip,
        r.ram_mb,
        r.gpu_backend,
        r.model_pack,
        r.plan,
        r.ui_lang,
        r.device_id_hash,
        r.message,
      ),
    db
      .prepare("INSERT INTO error_report_logs (id, app_log, asr_log, llama_log) SELECT ?1, ?2, ?3, ?4 WHERE changes() = 1")
      .bind(r.id, r.logs.app, r.logs.asr, r.logs.llama),
  ];
}

/** Thời gian giữ một báo cáo (spec §3). */
export const RETENTION_SECONDS = 30 * 86400;
/** Số báo cáo tối đa trong D1: trần dung lượng khi bị gửi tràn (≤ 192 MB nếu mọi log đầy). */
export const MAX_STORED_REPORTS = 3000;
/** Số dòng xóa tối đa mỗi lượt cho mỗi lý do, để một lần cron không chạy quá lâu. */
export const PRUNE_BATCH = 500;

/**
 * Dọn báo cáo quá hạn, rồi báo cáo cũ nhất vượt trần `maxStored`. Mỗi lần xóa tối đa PRUNE_BATCH dòng cho mỗi lý do (cron chạy mỗi
 * 5 phút nên đuổi kịp). Bảng log xóa trước bảng cha; cả bốn câu trong một batch (một transaction).
 */
export async function pruneErrorReports(db: D1Database, now: number, maxStored: number = MAX_STORED_REPORTS): Promise<void> {
  const expired = "SELECT id FROM error_reports WHERE received_at < ?1 ORDER BY received_at, id LIMIT ?2";
  const overflow = "SELECT id FROM error_reports ORDER BY received_at DESC, id DESC LIMIT ?1 OFFSET ?2";
  const cutoff = now - RETENTION_SECONDS;
  await db.batch([
    db.prepare(`DELETE FROM error_report_logs WHERE id IN (${expired})`).bind(cutoff, PRUNE_BATCH),
    db.prepare(`DELETE FROM error_reports WHERE id IN (${expired})`).bind(cutoff, PRUNE_BATCH),
    db.prepare(`DELETE FROM error_report_logs WHERE id IN (${overflow})`).bind(PRUNE_BATCH, maxStored),
    db.prepare(`DELETE FROM error_reports WHERE id IN (${overflow})`).bind(PRUNE_BATCH, maxStored),
  ]);
}
```

- [ ] **Step 5: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/error-reports.test.ts 2>&1 | tail -15 && pnpm typecheck
```
Expected: PASS; `tsc` không lỗi. Nếu `tsc` kêu `PLAN_CODES` hay spread trong `as const`, kiểm `REPORT_PLANS` có kiểu `readonly ["free", "monthly", "six_months", "yearly"]`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/src/error-reports.ts server/test/report-fixture.ts server/test/error-reports.test.ts && git commit -m "feat(server): kiểm schema, lưu và dọn báo cáo lỗi" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Endpoint `POST /v1/diagnostics`, giới hạn tần suất và cảnh báo

**Files:**
- Modify: `server/src/ratelimit.ts` (hằng `LIMITS`)
- Modify: `server/src/alerts.ts` (`AlertKind`, `ALERT_TEXT`)
- Modify: `server/src/http.ts` (`ErrorCode`)
- Create: `server/src/diagnostics.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/diagnostics.test.ts`

- [ ] **Step 1: Viết test (đỏ)**

Tạo `server/test/diagnostics.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendAlerts } from "../src/alerts";
import { sha256Hex } from "../src/crypto";
import { hit, LIMITS } from "../src/ratelimit";
import { resetDb } from "./db";
import { validReport } from "./report-fixture";
import { makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

type World = ReturnType<typeof makeWorld>;
const send = (w: World, body: unknown, headers: Record<string, string> = {}) => w.call("POST", "/v1/diagnostics", body, headers);
const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;
const alertRows = () => env.DB.prepare("SELECT kind, count FROM ops_alerts ORDER BY kind").all().then((r) => r.results);
const rid = (n: number) => `R-0000-${String(n).padStart(4, "0")}`;
const device = (n: number) => sha256Hex(`diag-device-${n}`);

describe("POST /v1/diagnostics (spec 2026-10-17 §3)", () => {
  it("báo cáo hợp lệ: 202 kèm mã báo cáo, lưu metadata theo giờ server và log", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    const body = await validReport();
    expect(await send(w, body)).toMatchObject({ status: 202, body: { id: "R-7F3K-92QD" } });
    expect(
      await env.DB.prepare(
        "SELECT received_at, occurred_at, kind, code, fingerprint, build, app_version, os_name, os_version, arch, chip, ram_mb, gpu_backend, model_pack, plan, ui_lang, device_id_hash, message FROM error_reports",
      ).first(),
    ).toEqual({
      received_at: T0,
      occurred_at: T0 - 60,
      kind: "session_error",
      code: "sidecarFailed",
      fingerprint: "3fa1c09be2d47a55",
      build: "release",
      app_version: "0.1.10",
      os_name: "macos",
      os_version: "15.6.1",
      arch: "aarch64",
      chip: "Apple M4 Pro",
      ram_mb: 24576,
      gpu_backend: "metal",
      model_pack: "standard",
      plan: "monthly",
      ui_lang: "vi",
      device_id_hash: body.device_id_hash,
      message: "tiến trình phụ không khởi động được",
    });
    const logs = body.logs as { app: string; asr: string; llama: string };
    expect(await env.DB.prepare("SELECT id, app_log, asr_log, llama_log FROM error_report_logs").first()).toEqual({
      id: "R-7F3K-92QD",
      app_log: logs.app,
      asr_log: logs.asr,
      llama_log: logs.llama,
    });
  });

  it("gửi lại cùng mã báo cáo (app thử lại sau lỗi mạng): vẫn 202, không tạo bản trùng, không báo động lần hai", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    const body = await validReport();
    expect((await send(w, body)).status).toBe(202);
    expect((await send(w, body)).status).toBe(202);
    expect(await count("error_reports")).toBe(1);
    expect(await count("error_report_logs")).toBe(1);
    expect(await alertRows()).toEqual([{ kind: "error_report_new", count: 1 }]);
  });

  it("cảnh báo error_report_new mỗi dấu vân tay mới một lần; báo cáo manual không cảnh báo", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    await send(w, await validReport({ id: rid(1) }));
    await send(w, await validReport({ id: rid(2) }));
    expect(await alertRows()).toEqual([{ kind: "error_report_new", count: 1 }]);
    await send(w, await validReport({ id: rid(3), fingerprint: "aaaaaaaaaaaaaaaa" }));
    expect(await alertRows()).toEqual([{ kind: "error_report_new", count: 2 }]);
    await send(w, await validReport({ id: rid(4), kind: "manual", code: null, fingerprint: "0000000000000000" }));
    expect(await alertRows()).toEqual([{ kind: "error_report_new", count: 2 }]);
    expect(await count("error_reports")).toBe(4);
  });

  it("email cảnh báo chỉ có số lượng, không có nội dung log hay mã máy", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld({ OPERATOR_EMAIL: "ops@example.com" });
    const body = await validReport({ logs: { app: "dong-log-rieng-biet-123\n", asr: "", llama: "" } });
    await send(w, body);
    expect(await sendAlerts({ ...env, OPERATOR_EMAIL: "ops@example.com" }, w.deps.email, T0 + 300)).toBe(1);
    const mail = w.resend.sent.at(-1)!;
    expect(mail.subject).toBe("[license test] Cảnh báo: error_report_new (1)");
    expect(mail.text).not.toContain("dong-log-rieng-biet-123");
    expect(mail.text).not.toContain(String(body.device_id_hash));
  });

  it("Content-Type không phải JSON: 415", async () => {
    const w = makeWorld();
    const res = await send(w, JSON.stringify(await validReport()), { "content-type": "text/plain" });
    expect(res).toMatchObject({ status: 415, body: { error: "unsupported_media_type" } });
    expect(await count("error_reports")).toBe(0);
  });

  it("thân quá 80 KB: 413; route khác của /v1 vẫn giữ trần 16 KiB; báo cáo đầy log (khoảng 58 KB) vẫn nhận được", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    expect(await send(w, "x".repeat(81 * 1024))).toMatchObject({ status: 413, body: { error: "invalid_request" } });
    expect(await w.call("POST", "/v1/trial", "x".repeat(20 * 1024))).toMatchObject({ status: 413 });
    const full = await validReport({ logs: { app: "a ".repeat(12 * 1024), asr: "b ".repeat(8 * 1024), llama: "c ".repeat(8 * 1024) } });
    expect(await send(w, full)).toMatchObject({ status: 202 });
  });

  it("thân không phải object JSON: 400", async () => {
    const w = makeWorld();
    expect(await send(w, "[1,2]")).toMatchObject({ status: 400, body: { error: "invalid_request", field: "body" } });
    expect(await send(w, "không phải json")).toMatchObject({ status: 400, body: { error: "invalid_request", field: "body" } });
  });

  it.each([
    ["v", { v: 2 }],
    ["kind", { kind: "other" }],
    ["fingerprint", { fingerprint: "XYZ" }],
    ["at", { at: T0 - 8 * 86400 }],
    ["device_id_hash", { device_id_hash: "abc" }],
    ["logs", { logs: { app: "x".repeat(24 * 1024 + 1), asr: "", llama: "" } }],
  ])("%s sai: 400 kèm tên trường, không lưu gì", async (field, patch) => {
    const w = makeWorld();
    expect(await send(w, await validReport(patch))).toMatchObject({ status: 400, body: { error: "invalid_request", field } });
    expect(await count("error_reports")).toBe(0);
  });

  it("còn dữ liệu nhạy cảm sau khi app đã che: 422 kèm tên quy tắc, không lưu, log cảnh báo không chứa nội dung", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    const key = "7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF";
    const inLog = await validReport({ logs: { app: `dòng có key ${key}\n`, asr: "", llama: "" } });
    expect(await send(w, inLog)).toMatchObject({ status: 422, body: { error: "rejected_sensitive", rule: "license_key" } });
    const inMessage = await validReport({ id: rid(2), message: "lỗi ở /Users/bob/Library/x" });
    expect(await send(w, inMessage)).toMatchObject({ status: 422, body: { error: "rejected_sensitive", rule: "home_path" } });
    expect(await count("error_reports")).toBe(0);
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("diagnostics_rejected_sensitive");
    expect(logged).not.toContain(key);
    expect(logged).not.toContain("/Users/bob");
  });

  it("giới hạn theo máy: 3 báo cáo mỗi giờ, báo cáo thứ 4 bị 429 kèm Retry-After, giờ sau mở lại", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    for (let n = 1; n <= LIMITS.diag_device; n++) expect((await send(w, await validReport({ id: rid(n) }))).status).toBe(202);
    const blocked = await send(w, await validReport({ id: rid(9) }));
    expect(blocked).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(blocked.headers.get("retry-after")).toBe("3600");
    expect(await count("error_reports")).toBe(3);
    w.clock.now = T0 + 3600;
    expect((await send(w, await validReport({ id: rid(9), at: T0 + 3600 - 60 }))).status).toBe(202);
  });

  it("giới hạn theo IP: 30 báo cáo mỗi giờ (máy khác nhau), báo cáo thứ 31 bị 429; IP khác vẫn gửi được", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    for (let n = 1; n <= LIMITS.diag_ip; n++) {
      expect((await send(w, await validReport({ id: rid(n), device_id_hash: await device(n) }))).status).toBe(202);
    }
    expect((await send(w, await validReport({ id: rid(99), device_id_hash: await device(99) }))).status).toBe(429);
    const other = await send(w, await validReport({ id: rid(98), device_id_hash: await device(98) }), { "cf-connecting-ip": "198.51.100.7" });
    expect(other.status).toBe(202);
  });

  it("giới hạn toàn hệ thống: chạm ngưỡng thì 429 và đúng một cảnh báo diagnostics_flood mỗi giờ", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    for (let i = 0; i < LIMITS.diag_global; i++) await hit(env, "diag_global", "all", T0);
    expect((await send(w, await validReport())).status).toBe(429);
    expect((await send(w, await validReport({ id: rid(2) }))).status).toBe(429);
    expect(await alertRows()).toEqual([{ kind: "diagnostics_flood", count: 1 }]);
    expect(await count("error_reports")).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/diagnostics.test.ts 2>&1 | tail -15
```
Expected: FAIL (route chưa có: nhận `404`/`not_found`, và `LIMITS.diag_device` chưa có).

- [ ] **Step 3: Thêm hạn mức**

Trong `server/src/ratelimit.ts`, đổi đoạn cuối của `LIMITS`:

```ts
  failure_ip: 60,
} as const;
```
thành:

```ts
  failure_ip: 60,
  // Báo cáo lỗi từ app (spec 2026-10-17 §3). Cửa sổ cố định 1 giờ như mọi giới hạn ở đây. Theo IP, theo máy (app tự giới hạn
  // 5 báo cáo mỗi ngày), và toàn hệ thống: chạm ngưỡng cuối thì có cảnh báo diagnostics_flood.
  diag_ip: 30,
  diag_device: 3,
  diag_global: 120,
} as const;
```

- [ ] **Step 4: Thêm loại cảnh báo**

Trong `server/src/alerts.ts`, đổi `  | "order_check_failed";` thành:

```ts
  | "order_check_failed"
  | "error_report_new"
  | "diagnostics_flood";
```

và thêm hai mục vào `ALERT_TEXT`: đổi cặp dòng cuối của mục `order_check_failed`

```ts
    "tìm đơn trên dashboard của cổng; log `reconcile_failed` có mã đơn. Cảnh báo này đếm theo đơn và gộp mỗi giờ.",
};
```
thành:

```ts
    "tìm đơn trên dashboard của cổng; log `reconcile_failed` có mã đơn. Cảnh báo này đếm theo đơn và gộp mỗi giờ.",
  error_report_new:
    "Báo cáo lỗi từ app có dạng lỗi mới (dấu vân tay chưa từng thấy). Mở Web Admin, trang Báo cáo lỗi để xem nhóm và log. " +
    "Thư này chỉ có số lượng, không chứa nội dung log hay mã máy.",
  diagnostics_flood:
    "Endpoint báo cáo lỗi chạm trần toàn hệ thống (120 báo cáo mỗi giờ): có thể đang bị gửi tràn. Báo cáo bị từ chối (429) tới hết giờ. " +
    "Mở Web Admin, trang Báo cáo lỗi để xem nguồn, xóa báo cáo rác nếu cần.",
};
```

- [ ] **Step 5: Thêm mã lỗi**

Trong `server/src/http.ts`, đổi

```ts
  | "not_found"
  | "internal";
```
thành

```ts
  | "not_found"
  | "rejected_sensitive"
  | "internal";
```

- [ ] **Step 6: Viết route**

Tạo `server/src/diagnostics.ts`:

```ts
// POST /v1/diagnostics (spec 2026-10-17-diagnostics-reports-design.md §3): app gửi báo cáo lỗi đã che dữ liệu cá nhân. Không cần
// token (app có thể chưa có, ví dụ chết lúc onboarding); chống lạm dụng bằng kích thước, schema và ba hạn mức theo giờ.
// Server không tin app đã che: mọi chuỗi qua bộ phát hiện (diagnostics-scan.ts), còn dữ liệu nhạy cảm thì 422 và không lưu.
import type { Hono } from "hono";
import { raiseAlert } from "./alerts";
import type { AppEnv } from "./app";
import { findReportSensitive, insertReportStatements, parseReport } from "./error-reports";
import { clientIp, fail, readJson, tooMany } from "./http";
import { hit, LIMITS } from "./ratelimit";

export const DIAGNOSTICS_PATH = "/v1/diagnostics";

export function registerDiagnostics(app: Hono<AppEnv>) {
  app.post(DIAGNOSTICS_PATH, async (c) => {
    const db = c.env.DB;
    const now = c.get("deps").now();
    // Đếm trước khi đọc thân: request sai cũng tốn hạn mức của IP, nên không dò schema vô hạn được.
    const ip = await hit(c.env, "diag_ip", clientIp(c), now);
    if (!ip.allowed) return tooMany(c, ip.retryAfter);
    const global = await hit(c.env, "diag_global", "all", now);
    if (!global.allowed) {
      // Đúng lần từ chối đầu tiên của giờ này: một cảnh báo, không phải mỗi request.
      if (global.count === LIMITS.diag_global + 1) await raiseAlert(db, "diagnostics_flood", now);
      return tooMany(c, global.retryAfter);
    }
    const parsed = parseReport(await readJson(c), now);
    if (!parsed.ok) return fail(c, 400, "invalid_request", { field: parsed.field });
    const report = parsed.report;
    const device = await hit(c.env, "diag_device", report.device_id_hash, now);
    if (!device.allowed) return tooMany(c, device.retryAfter);
    const rule = findReportSensitive(report);
    if (rule !== null) {
      // Chỉ ghi tên quy tắc và loại báo cáo: không ghi nội dung, vì đó chính là thứ không được lưu.
      console.warn(JSON.stringify({ event: "diagnostics_rejected_sensitive", rule, kind: report.kind }));
      return fail(c, 422, "rejected_sensitive", { rule });
    }
    const seen =
      report.kind === "manual" ||
      (await db.prepare("SELECT 1 AS seen FROM error_reports WHERE fingerprint = ? LIMIT 1").bind(report.fingerprint).first()) !== null;
    const [inserted] = await db.batch(insertReportStatements(db, report, now));
    const isNew = inserted?.meta.changes === 1;
    if (isNew && !seen) await raiseAlert(db, "error_report_new", now);
    console.log(JSON.stringify({ event: "diagnostics_stored", kind: report.kind, code: report.code, fingerprint: report.fingerprint, duplicate: !isNew }));
    return c.json({ id: report.id }, 202);
  });
}
```

- [ ] **Step 7: Gắn vào `app.ts`**

Trong `server/src/app.ts`:

1. Thêm hai dòng nhập, đúng thứ tự chữ cái:

```ts
import { type Deps, type DepsFactory, realDeps } from "./deps";
import { DIAGNOSTICS_PATH, registerDiagnostics } from "./diagnostics";
import type { ApiEnv } from "./env";
import { MAX_BODY_BYTES } from "./error-reports";
import { fail, isJsonContentType } from "./http";
```
(thay cho ba dòng nhập `./deps`, `./env`, `./http` hiện có; giữ nguyên các dòng nhập khác.)

2. Thay khối `app.use("/v1/*", bodyLimit({...}))` hiện có bằng:

```ts
  const smallBody = bodyLimit({
    maxSize: 16 * 1024,
    onError: (c) => {
      // Webhook quá lớn bị từ chối thì cổng gửi lại vài lần rồi bỏ (hoàn tiền, tranh chấp không có đối soát đỡ): để lại dấu vết.
      if (c.req.path.startsWith("/v1/webhooks/")) console.warn(JSON.stringify({ event: "webhook_too_large", path: c.req.path }));
      return fail(c, 413, "invalid_request");
    },
  });
  // Báo cáo lỗi mang log nên có trần riêng (spec 2026-10-17 §3); mọi route khác của /v1 giữ 16 KiB.
  app.use("/v1/*", (c, next) => (c.req.path === DIAGNOSTICS_PATH ? next() : smallBody(c, next)));
  app.use(DIAGNOSTICS_PATH, bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => fail(c, 413, "invalid_request") }));
```

3. Sau `registerTrial(app);` thêm `registerDiagnostics(app);`.

- [ ] **Step 8: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/diagnostics.test.ts test/app.test.ts test/ratelimit.test.ts test/alerts.test.ts 2>&1 | tail -15 && pnpm typecheck
```
Expected: PASS cả bốn file; `tsc` không lỗi. Nếu test "báo cáo đầy log" trả 413, đo kích thước thân thật và so với `MAX_BODY_BYTES`; không nâng trần để test qua.

- [ ] **Step 9: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/src/ratelimit.ts server/src/alerts.ts server/src/http.ts server/src/diagnostics.ts server/src/app.ts server/test/diagnostics.test.ts && git commit -m "feat(server): POST /v1/diagnostics nhận báo cáo lỗi, giới hạn tần suất, cảnh báo dạng lỗi mới" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cron dọn báo cáo quá hạn

**Files:**
- Modify: `server/src/reconcile.ts`
- Modify: `server/test/reconcile.test.ts` (thêm một test vào cuối file `describe` ngoài cùng; không đụng test cũ)

- [ ] **Step 1: Viết test (đỏ)**

Trong `server/test/reconcile.test.ts`, thêm vào phần nhập:

```ts
import { insertReportStatements, RETENTION_SECONDS } from "../src/error-reports";
import { makeReport } from "./report-fixture";
```

và thêm test này **cuối file** (ngoài mọi `describe` hiện có):

```ts
describe("dọn báo cáo lỗi quá hạn (spec 2026-10-17 §3)", () => {
  it("cron xóa báo cáo quá 30 ngày cả hai bảng, giữ báo cáo còn hạn, và không đổi hình dạng kết quả", async () => {
    const w = makeWorld();
    w.clock.now = T0 + 300;
    const seed = async (id: string, receivedAt: number) => env.DB.batch(insertReportStatements(env.DB, await makeReport({ id }), receivedAt));
    await seed("R-0000-0001", w.clock.now - RETENTION_SECONDS - 1);
    await seed("R-0000-0002", w.clock.now - RETENTION_SECONDS + 60);
    expect(await reconcile(w.env, w.deps)).toEqual({ checked: 0, granted: 0, errors: 0, emails_retried: 0, alerts_sent: 0 });
    expect((await env.DB.prepare("SELECT id FROM error_reports").all<{ id: string }>()).results).toEqual([{ id: "R-0000-0002" }]);
    expect((await env.DB.prepare("SELECT id FROM error_report_logs").all<{ id: string }>()).results).toEqual([{ id: "R-0000-0002" }]);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/reconcile.test.ts -t "dọn báo cáo lỗi" 2>&1 | tail -12
```
Expected: FAIL (báo cáo quá hạn vẫn còn).

- [ ] **Step 3: Thêm bước dọn**

Trong `server/src/reconcile.ts`:

1. Đổi dòng chú thích đầu file `// - gửi cảnh báo cho người vận hành; dọn bộ đếm cũ.` thành:

```ts
// - gửi cảnh báo cho người vận hành; dọn bộ đếm cũ và báo cáo lỗi quá hạn (spec 2026-10-17 §3).
```

2. Thêm dòng nhập sau `import type { Deps } from "./deps";`:

```ts
import { pruneErrorReports } from "./error-reports";
```

3. Sau dòng `  await step("prune", () => pruneRateLimits(env.DB, now));` thêm:

```ts
  await step("prune_error_reports", () => pruneErrorReports(env.DB, now));
```

(Không đổi `ReconcileResult`: nhiều test so sánh `toEqual` với đúng năm trường.)

- [ ] **Step 4: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/reconcile.test.ts test/creem-orders.test.ts 2>&1 | tail -10
```
Expected: PASS (test cũ về `reconcile_step_failed` không đổi vì bước mới không lỗi).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/src/reconcile.ts server/test/reconcile.test.ts && git commit -m "feat(server): cron dọn báo cáo lỗi quá 30 ngày hay vượt trần" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: API của Web Admin cho báo cáo lỗi

**Files:**
- Modify: `server/src/admin-read.ts` (export, `VIEW_ACTIONS`)
- Create: `server/src/admin-reports.ts`
- Modify: `server/src/admin.ts` (gắn route)
- Create: `server/test/admin-reports.test.ts`

- [ ] **Step 1: Viết test (đỏ)**

Tạo `server/test/admin-reports.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto";
import { insertReportStatements } from "../src/error-reports";
import { lastAudit, makeAdmin } from "./admin-harness";
import { resetDb } from "./db";
import { makeReport } from "./report-fixture";
import { T0 } from "./world";

beforeEach(resetDb);

const FP_A = "aaaaaaaaaaaaaaaa";
const FP_B = "bbbbbbbbbbbbbbbb";
const rid = (n: number) => `R-0000-${String(n).padStart(4, "0")}`;

async function seed(overrides: Record<string, unknown>, receivedAt: number) {
  const report = await makeReport(overrides);
  await env.DB.batch(insertReportStatements(env.DB, report, receivedAt));
  return report;
}

/**
 * 1: nhóm A, máy d1, bản 0.1.9; 2: nhóm A, máy d2, bản 0.1.10; 3: nhóm B (crash, build debug); 4: báo cáo manual.
 */
async function seedBasic() {
  const d1 = await sha256Hex("admin-report-d1");
  const d2 = await sha256Hex("admin-report-d2");
  await seed({ id: rid(1), fingerprint: FP_A, device_id_hash: d1, app: { version: "0.1.9" } }, T0 - 100);
  await seed({ id: rid(2), fingerprint: FP_A, device_id_hash: d2, app: { version: "0.1.10" } }, T0 - 50);
  await seed({ id: rid(3), kind: "crash", code: "panic", fingerprint: FP_B, build: "debug", device_id_hash: d1 }, T0 - 10);
  await seed({ id: rid(4), kind: "manual", code: null, fingerprint: "0000000000000000", device_id_hash: d2 }, T0);
  return { d1, d2 };
}

const items = (body: Record<string, unknown>) => body.items as Record<string, unknown>[];

describe("GET /admin/error-groups", () => {
  it("nhóm theo dấu vân tay, bỏ báo cáo manual và nhóm chỉ có báo cáo debug; có số liệu và các phiên bản", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    const res = await adminCall("/admin/error-groups");
    expect(res.status).toBe(200);
    expect(res.body.next_cursor).toBeNull();
    expect(items(res.body)).toEqual([
      {
        fingerprint: FP_A,
        kind: "session_error",
        code: "sidecarFailed",
        reports: 2,
        devices: 2,
        release_reports: 2,
        debug_reports: 0,
        first_at: T0 - 100,
        last_at: T0 - 50,
        versions: ["0.1.10", "0.1.9"],
      },
    ]);
  });

  it("include_debug=1 hiện cả nhóm chỉ có báo cáo debug, mới nhất ở trên; lọc theo kind và app_version", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    expect(items((await adminCall("/admin/error-groups?include_debug=1")).body).map((g) => g.fingerprint)).toEqual([FP_B, FP_A]);
    expect(items((await adminCall("/admin/error-groups?include_debug=1&kind=crash")).body).map((g) => g.fingerprint)).toEqual([FP_B]);
    expect(items((await adminCall("/admin/error-groups?app_version=0.1.9")).body).map((g) => g.fingerprint)).toEqual([FP_A]);
    expect(items((await adminCall("/admin/error-groups?app_version=9.9.9")).body)).toEqual([]);
  });

  it("tham số sai: 400 kèm tên tham số", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/error-groups?kind=manual")).toMatchObject({ status: 400, body: { field: "kind" } });
    expect(await adminCall("/admin/error-groups?app_version=%24%24")).toMatchObject({ status: 400, body: { field: "app_version" } });
    expect(await adminCall("/admin/error-groups?cursor=abc")).toMatchObject({ status: 400, body: { field: "cursor" } });
  });

  it("phân trang theo con trỏ: 50 nhóm mỗi trang, trang sau không lặp", async () => {
    const { adminCall } = makeAdmin();
    for (let start = 1; start <= 51; start += 17) {
      const stmts: D1PreparedStatement[] = [];
      for (let i = start; i < start + 17 && i <= 51; i++) {
        const report = await makeReport({ id: `R-0001-${String(i).padStart(4, "0")}`, fingerprint: i.toString(16).padStart(16, "0") });
        stmts.push(...insertReportStatements(env.DB, report, T0 - i));
      }
      await env.DB.batch(stmts);
    }
    const first = await adminCall("/admin/error-groups");
    expect(items(first.body)).toHaveLength(50);
    expect(first.body.next_cursor).toEqual(expect.stringMatching(/^\d+_[0-9a-f]{16}$/));
    const second = await adminCall(`/admin/error-groups?cursor=${first.body.next_cursor as string}`);
    expect(items(second.body)).toHaveLength(1);
    expect(second.body.next_cursor).toBeNull();
    const all = [...items(first.body), ...items(second.body)].map((g) => g.fingerprint);
    expect(new Set(all).size).toBe(51);
  });
});

describe("GET /admin/error-reports", () => {
  it("mặc định hiện báo cáo release (kể cả manual), mới nhất trước, không có log", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    const res = await adminCall("/admin/error-reports");
    expect(items(res.body).map((r) => r.id)).toEqual([rid(4), rid(2), rid(1)]);
    expect(Object.keys(items(res.body)[1]!).sort()).toEqual(
      [
        "arch", "build", "chip", "code", "device_id_hash", "fingerprint", "gpu_backend", "id", "kind", "message", "model_pack", "occurred_at",
        "os_name", "os_version", "plan", "ram_mb", "received_at", "app_version", "ui_lang",
      ].sort(),
    );
    expect(items(res.body)[1]).toMatchObject({ id: rid(2), received_at: T0 - 50, occurred_at: T0 - 60, app_version: "0.1.10", kind: "session_error" });
  });

  it("lọc theo fingerprint, kind, mã báo cáo (chữ thường cũng được), máy; include_debug=1 hiện thêm báo cáo debug", async () => {
    const { adminCall } = makeAdmin();
    const { d1 } = await seedBasic();
    const ids = async (query: string) => items((await adminCall(`/admin/error-reports${query}`)).body).map((r) => r.id);
    expect(await ids(`?fingerprint=${FP_A}`)).toEqual([rid(2), rid(1)]);
    expect(await ids("?kind=manual")).toEqual([rid(4)]);
    expect(await ids(`?report=${rid(2).toLowerCase()}`)).toEqual([rid(2)]);
    expect(await ids(`?device=${d1}`)).toEqual([rid(1)]);
    expect(await ids(`?device=${d1}&include_debug=1`)).toEqual([rid(3), rid(1)]);
    expect(await ids("?include_debug=1")).toEqual([rid(4), rid(3), rid(2), rid(1)]);
  });

  it("tham số sai: 400 kèm tên tham số", async () => {
    const { adminCall } = makeAdmin();
    for (const [query, field] of [["kind=bad", "kind"], ["fingerprint=zz", "fingerprint"], ["device=short", "device"], ["report=abc", "report"]] as const) {
      expect(await adminCall(`/admin/error-reports?${query}`)).toMatchObject({ status: 400, body: { field } });
    }
  });

  it("nhật ký: mỗi lần xem ghi một dòng list_viewed không chứa mã máy", async () => {
    const { adminCall } = makeAdmin();
    const { d1 } = await seedBasic();
    await adminCall(`/admin/error-reports?device=${d1}&include_debug=1`);
    const log = (await lastAudit()) as { actor: string; action: string; detail: string };
    expect(log).toMatchObject({ actor: "admin:ops@example.com", action: "list_viewed" });
    expect(JSON.parse(log.detail)).toEqual({ resource: "error_reports", filters: { device: "1", include_debug: "1" }, count: 2 });
    expect(log.detail).not.toContain(d1);
  });
});

describe("GET /admin/error-reports/:id", () => {
  it("trả metadata và ba log, ghi nhật ký error_report_viewed chỉ có mã báo cáo", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    const res = await adminCall(`/admin/error-reports/${rid(1)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: rid(1),
      kind: "session_error",
      code: "sidecarFailed",
      fingerprint: FP_A,
      app_version: "0.1.9",
      chip: "Apple M4 Pro",
      logs: {
        app: "[2026-10-17][05:07:12][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr }\n",
        asr: "ggml_metal_init: error: failed to load\n",
        llama: "0.00.289.523 W load: special_eos_id is not in special_eog_ids\n",
      },
    });
    const log = (await lastAudit()) as { action: string; detail: string };
    expect(log.action).toBe("error_report_viewed");
    expect(JSON.parse(log.detail)).toEqual({ id: rid(1) });
  });

  it("không có báo cáo: 404; mã sai định dạng: 400", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    expect(await adminCall(`/admin/error-reports/${rid(99)}`)).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect(await adminCall("/admin/error-reports/abc")).toMatchObject({ status: 400, body: { field: "id" } });
  });
});

describe("POST /admin/error-reports/delete", () => {
  const remaining = async () => (await env.DB.prepare("SELECT id FROM error_reports ORDER BY id").all<{ id: string }>()).results.map((r) => r.id);
  const remainingLogs = async () => (await env.DB.prepare("SELECT id FROM error_report_logs ORDER BY id").all<{ id: string }>()).results.map((r) => r.id);

  it("xóa một báo cáo theo mã: cả hai bảng, có nhật ký với số lượng", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    expect(await adminCall("/admin/error-reports/delete", { body: { id: rid(1) } })).toEqual({ status: 200, body: { deleted: 1 } });
    expect(await remaining()).toEqual([rid(2), rid(3), rid(4)]);
    expect(await remainingLogs()).toEqual([rid(2), rid(3), rid(4)]);
    const log = (await lastAudit()) as { action: string; detail: string };
    expect(log.action).toBe("error_reports_deleted");
    expect(JSON.parse(log.detail)).toEqual({ id: rid(1), count: 1 });
  });

  it("xóa cả nhóm theo fingerprint (kể cả báo cáo debug của nhóm)", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    expect(await adminCall("/admin/error-reports/delete", { body: { fingerprint: FP_A } })).toEqual({ status: 200, body: { deleted: 2 } });
    expect(await remaining()).toEqual([rid(3), rid(4)]);
    expect(await remainingLogs()).toEqual([rid(3), rid(4)]);
    expect(JSON.parse(((await lastAudit()) as { detail: string }).detail)).toEqual({ fingerprint: FP_A, count: 2 });
  });

  it("không có gì để xóa: 404; thiếu hay thừa khóa, định dạng sai: 400", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    expect(await adminCall("/admin/error-reports/delete", { body: { id: rid(99) } })).toMatchObject({ status: 404 });
    expect(await adminCall("/admin/error-reports/delete", { body: {} })).toMatchObject({ status: 400 });
    expect(await adminCall("/admin/error-reports/delete", { body: { id: rid(1), fingerprint: FP_A } })).toMatchObject({ status: 400 });
    expect(await adminCall("/admin/error-reports/delete", { body: { id: "abc" } })).toMatchObject({ status: 400 });
    expect(await remaining()).toHaveLength(4);
  });
});

describe("Access và chống CSRF", () => {
  it("không qua Access: 403 ở mọi route; GET từ trang khác: 403; POST từ trang khác: 403", async () => {
    const { adminCall } = makeAdmin();
    await seedBasic();
    for (const path of ["/admin/error-groups", "/admin/error-reports", `/admin/error-reports/${rid(1)}`]) {
      expect((await adminCall(path, { operator: null })).status).toBe(403);
      expect((await adminCall(path, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    }
    expect((await adminCall("/admin/error-reports/delete", { body: { id: rid(1) }, operator: null })).status).toBe(403);
    expect((await adminCall("/admin/error-reports/delete", { body: { id: rid(1) }, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM error_reports").first()).toEqual({ n: 4 });
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/admin-reports.test.ts 2>&1 | tail -15
```
Expected: FAIL (các route trả `404 not_found`).

- [ ] **Step 3: Export phần dùng lại ở `admin-read.ts`**

Trong `server/src/admin-read.ts`:

1. `type Bind = string | number;` thành `export type Bind = string | number;`
2. `class Filters {` thành `export class Filters {`
3. `interface ListSpec {` thành `export interface ListSpec {`
4. `function listRoute(app: Hono<AdminAppEnv>, path: string, spec: ListSpec): void {` thành `export function listRoute(app: Hono<AdminAppEnv>, path: string, spec: ListSpec): void {`
5. Trong mảng `VIEW_ACTIONS`, thêm `"error_report_viewed"` vào cuối (sau `"releases_viewed"`), để lượt xem chi tiết một báo cáo ẩn mặc định ở trang Nhật ký như các lượt xem khác.

- [ ] **Step 4: Viết route admin**

Tạo `server/src/admin-reports.ts`:

```ts
// Route admin cho báo cáo lỗi của app (spec 2026-10-17-diagnostics-reports-design.md §4): nhóm theo dấu vân tay, danh sách báo cáo,
// chi tiết kèm log, xóa. Danh sách đi qua listRoute của admin-read.ts (mỗi lần xem một dòng list_viewed, bộ lọc ghi vào nhật ký
// không chứa mã máy); chi tiết ghi error_report_viewed; xóa ghi error_reports_deleted. Log trả về là văn bản thô (do app gửi, đã
// che): Web Admin phải hiện dạng văn bản, không bao giờ dựng HTML từ nó.
import type { Hono } from "hono";
import { type AdminAppEnv, crossSite } from "./admin-auth";
import { type Bind, listRoute } from "./admin-read";
import { audit, auditStatement } from "./audit";
import { FINGERPRINT, REPORT_ID, REPORT_KINDS } from "./error-reports";
import { fail, parseDeviceIdHash, readJson } from "./http";

/** Loại có nhóm: báo cáo `manual` không có dấu vân tay chung nên không nằm trong danh sách nhóm. */
const GROUP_KINDS = ["crash", "session_error", "sidecar_died"] as const;
const VERSION = /^[0-9A-Za-z.+-]{1,40}$/;

const REPORT_COLUMNS = [
  "id",
  "received_at",
  "occurred_at",
  "kind",
  "code",
  "fingerprint",
  "build",
  "app_version",
  "os_name",
  "os_version",
  "arch",
  "chip",
  "ram_mb",
  "gpu_backend",
  "model_pack",
  "plan",
  "ui_lang",
  "device_id_hash",
  "message",
] as const;

/** Mỗi nhóm một dòng; kind và code không đổi trong nhóm (dấu vân tay có cả hai). */
const GROUPS = `(
  SELECT fingerprint, MIN(kind) AS kind, MIN(code) AS code, COUNT(*) AS reports, COUNT(DISTINCT device_id_hash) AS devices,
         SUM(build = 'release') AS release_reports, SUM(build = 'debug') AS debug_reports,
         MIN(received_at) AS first_at, MAX(received_at) AS last_at, GROUP_CONCAT(DISTINCT app_version) AS versions
  FROM error_reports WHERE kind <> 'manual' GROUP BY fingerprint
) g`;

/** Con trỏ "<giây>_<khóa>" cho thứ tự (thời điểm giảm dần, khóa giảm dần); `key` là mẫu regex của khóa. */
function keyset(timeColumn: string, keyColumn: string, key: string) {
  const pattern = new RegExp(`^(\\d{1,15})_(${key})$`);
  return (raw: string): [string, ...Bind[]] | null => {
    const m = pattern.exec(raw);
    if (!m) return null;
    const t = Number(m[1]);
    return [`(${timeColumn} < ? OR (${timeColumn} = ? AND ${keyColumn} < ?))`, t, t, m[2]!];
  };
}

export function registerAdminReports(app: Hono<AdminAppEnv>): void {
  listRoute(app, "/admin/error-groups", {
    resource: "error_groups",
    filters(f) {
      if (!f.oneOf("kind", GROUP_KINDS, (k) => ["g.kind = ?", k])) return "kind";
      const version = f.get("app_version");
      if (version !== undefined) {
        if (!VERSION.test(version)) return "app_version";
        f.add("g.fingerprint IN (SELECT fingerprint FROM error_reports WHERE app_version = ?)", version);
        f.applied.app_version = version;
      }
      // Mặc định chỉ nhóm có báo cáo release: báo cáo debug là của máy dev (app debug mặc định không tự gửi).
      if (f.get("include_debug") === "1") f.applied.include_debug = "1";
      else f.add("g.release_reports > 0");
      return null;
    },
    select: `SELECT g.fingerprint, g.kind, g.code, g.reports, g.devices, g.release_reports, g.debug_reports, g.first_at, g.last_at, g.versions FROM ${GROUPS}`,
    order: "ORDER BY g.last_at DESC, g.fingerprint DESC",
    cursor: keyset("g.last_at", "g.fingerprint", "[0-9a-f]{16}"),
    next: (r) => `${r.last_at}_${r.fingerprint}`,
    map: (r) => ({ ...r, versions: String(r.versions ?? "").split(",").filter((v) => v !== "").sort() }),
  });

  listRoute(app, "/admin/error-reports", {
    resource: "error_reports",
    filters(f) {
      if (!f.oneOf("kind", REPORT_KINDS, (k) => ["kind = ?", k])) return "kind";
      const fingerprint = f.get("fingerprint");
      if (fingerprint !== undefined) {
        if (!FINGERPRINT.test(fingerprint)) return "fingerprint";
        f.add("fingerprint = ?", fingerprint);
        f.applied.fingerprint = fingerprint;
      }
      const device = f.get("device");
      if (device !== undefined) {
        const hash = parseDeviceIdHash(device);
        if (!hash) return "device";
        f.add("device_id_hash = ?", hash);
        // Mã máy không vào nhật ký: chỉ ghi là có lọc theo máy.
        f.applied.device = "1";
      }
      const report = f.get("report");
      if (report !== undefined) {
        const id = report.toUpperCase();
        if (!REPORT_ID.test(id)) return "report";
        f.add("id = ?", id);
        f.applied.report = id;
      }
      if (f.get("include_debug") === "1") f.applied.include_debug = "1";
      else f.add("build = 'release'");
      return null;
    },
    select: `SELECT ${REPORT_COLUMNS.join(", ")} FROM error_reports`,
    order: "ORDER BY received_at DESC, id DESC",
    cursor: keyset("received_at", "id", "R-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}"),
    next: (r) => `${r.received_at}_${r.id}`,
  });

  app.get("/admin/error-reports/:id", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const id = c.req.param("id");
    if (!REPORT_ID.test(id)) return fail(c, 400, "invalid_request", { field: "id" });
    const row = await c.env.DB.prepare(
      `SELECT ${REPORT_COLUMNS.map((col) => `r.${col}`).join(", ")}, l.app_log, l.asr_log, l.llama_log
       FROM error_reports r JOIN error_report_logs l ON l.id = r.id WHERE r.id = ?`,
    )
      .bind(id)
      .first<Record<string, unknown>>();
    if (!row) return fail(c, 404, "not_found");
    await audit(c.env.DB, { at: c.get("deps").now(), actor: c.get("actor"), action: "error_report_viewed", detail: { id } });
    const { app_log, asr_log, llama_log, ...meta } = row;
    return c.json({ ...meta, logs: { app: app_log, asr: asr_log, llama: llama_log } });
  });

  // Xóa một báo cáo (`id`) hay cả nhóm (`fingerprint`, kể cả báo cáo debug). Không đòi `note` như các thao tác trên license: dọn báo
  // cáo là việc thường ngày và nhật ký không chứa dữ liệu cá nhân. Bảng log xóa trước bảng cha.
  app.post("/admin/error-reports/delete", async (c) => {
    const body = await readJson(c);
    const id = typeof body?.id === "string" && REPORT_ID.test(body.id) ? body.id : null;
    const fingerprint = typeof body?.fingerprint === "string" && FINGERPRINT.test(body.fingerprint) ? body.fingerprint : null;
    if ((id === null) === (fingerprint === null)) return fail(c, 400, "invalid_request", { field: "id|fingerprint" });
    const where = id !== null ? "id = ?" : "fingerprint = ?";
    const value = (id ?? fingerprint) as string;
    const db = c.env.DB;
    const found = await db.prepare(`SELECT COUNT(*) AS n FROM error_reports WHERE ${where}`).bind(value).first<{ n: number }>();
    const n = found?.n ?? 0;
    if (n === 0) return fail(c, 404, "not_found");
    await db.batch([
      auditStatement(db, {
        at: c.get("deps").now(),
        actor: c.get("actor"),
        action: "error_reports_deleted",
        detail: id !== null ? { id, count: n } : { fingerprint, count: n },
      }),
      db.prepare(`DELETE FROM error_report_logs WHERE id IN (SELECT id FROM error_reports WHERE ${where})`).bind(value),
      db.prepare(`DELETE FROM error_reports WHERE ${where}`).bind(value),
    ]);
    return c.json({ deleted: n });
  });
}
```

- [ ] **Step 5: Gắn vào `admin.ts`**

Trong `server/src/admin.ts`:
1. Sau dòng `import { registerAdminRead } from "./admin-read";` thêm `import { registerAdminReports } from "./admin-reports";`
2. Sau dòng `  registerAdminOps(app);` (trong `createAdminApp`) thêm `  registerAdminReports(app);`

- [ ] **Step 6: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/admin-reports.test.ts test/admin-read.test.ts test/admin.test.ts 2>&1 | tail -15 && pnpm typecheck && pnpm test:scripts 2>&1 | tail -6
```
Expected: PASS; `tsc` không lỗi; test Node (`worker-split`) xanh (admin-reports.ts chỉ được `admin.ts` nhập).

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/src/admin-read.ts server/src/admin-reports.ts server/src/admin.ts server/test/admin-reports.test.ts && git commit -m "feat(server): API Web Admin cho báo cáo lỗi (nhóm, danh sách, chi tiết, xóa)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Xóa theo email xóa luôn báo cáo của các máy thuộc email đó

**Files:**
- Modify: `server/src/admin.ts` (route `/admin/erase`)
- Modify: `server/test/admin.test.ts` (nhập, test `erase` đã có, thêm một test)

- [ ] **Step 1: Sửa và thêm test (đỏ)**

Trong `server/test/admin.test.ts`:

1. Thêm hai dòng nhập: sau `import { sha256Hex } from "../src/crypto";` thêm `import { insertReportStatements } from "../src/error-reports";`; sau `import { TEST_CREEM_API_KEY } from "./fakes";` thêm `import { makeReport } from "./report-fixture";`

2. Trong test `"bỏ email và device_label, giữ số liệu kế toán, key vẫn dùng được"`, đổi đối tượng `detail` mong đợi (nhật ký bây giờ có thêm số báo cáo lỗi, ở đây là 0):

```ts
    expect(JSON.parse((log as { detail: string }).detail)).toEqual({
      activations: 1,
      licenses: 1,
      orders: 1,
      error_reports: 0,
      note: "yêu cầu xóa qua email hỗ trợ ngày 2026-10-01",
    });
```

3. Thêm test mới ngay **trước** dòng `  it("xóa dữ liệu của A giữ nguyên device_label và email của B", async () => {`:

```ts
  it("xóa luôn báo cáo lỗi của các máy thuộc email đó; giữ báo cáo của máy khác và của máy chỉ dùng thử", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ email: "erase@example.com" });
    const mine = await sha256Hex("d1");
    await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: mine, device_label: "MacBook của An" });
    const seed = async (id: string, device: string) => {
      await env.DB.batch(insertReportStatements(env.DB, await makeReport({ id, device_id_hash: device }), T0));
    };
    await seed("R-0000-0001", mine);
    await seed("R-0000-0002", mine);
    await seed("R-0000-0003", await sha256Hex("trial-only"));
    const res = await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa" } });
    expect(res.body).toEqual({ activations: 1, licenses: 1, orders: 1 });
    expect((await env.DB.prepare("SELECT id FROM error_reports ORDER BY id").all<{ id: string }>()).results).toEqual([{ id: "R-0000-0003" }]);
    expect((await env.DB.prepare("SELECT id FROM error_report_logs ORDER BY id").all<{ id: string }>()).results).toEqual([{ id: "R-0000-0003" }]);
    expect(JSON.parse(((await lastAudit()) as { detail: string }).detail)).toMatchObject({ error_reports: 2 });
  });

```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/admin.test.ts -t "Q9" 2>&1 | tail -15
```
Expected: FAIL ở hai test (chưa có `error_reports` trong `detail`, báo cáo chưa bị xóa).

- [ ] **Step 3: Sửa route erase**

Trong `server/src/admin.ts`, route `app.post("/admin/erase", …)`, thay đoạn từ dòng `const activationsOf = …` đến hết câu `db.prepare(\`UPDATE activations SET device_label = NULL …\`).bind(email),` bằng:

```ts
    const activationsOf = "device_label IS NOT NULL AND license_id IN (SELECT id FROM licenses WHERE email = ?3)";
    // Báo cáo lỗi của các máy từng kích hoạt license của email này (spec 2026-10-17 §3). Phải xóa TRƯỚC câu bỏ email của licenses, vì
    // câu tìm máy đi qua licenses.email. Máy chỉ dùng thử (không có activation) không gắn với email nên không bị chạm.
    const reportsOf = "device_id_hash IN (SELECT device_id_hash FROM activations WHERE license_id IN (SELECT id FROM licenses WHERE email = ?3))";
    // Nhật ký đứng đầu batch (cùng transaction), đếm đúng các dòng các câu sau sẽ đổi; ghi nhật ký lỗi thì không xóa gì.
    const [, , , acts, lics, ords] = await db.batch([
      db
        .prepare(
          `INSERT INTO audit_log (at, actor, action, detail)
           SELECT ?1, ?2, 'personal_data_erased', json_object(
             'activations', (SELECT COUNT(*) FROM activations WHERE ${activationsOf}),
             'licenses', (SELECT COUNT(*) FROM licenses WHERE email = ?3),
             'orders', (SELECT COUNT(*) FROM orders WHERE email = ?3),
             'error_reports', (SELECT COUNT(*) FROM error_reports WHERE ${reportsOf}),
             'note', ?4)`,
        )
        .bind(now, c.get("actor"), email, input.note),
      db
        .prepare(`DELETE FROM error_report_logs WHERE id IN (SELECT id FROM error_reports WHERE ${reportsOf.replaceAll("?3", "?")})`)
        .bind(email),
      db.prepare(`DELETE FROM error_reports WHERE ${reportsOf.replaceAll("?3", "?")}`).bind(email),
      db.prepare(`UPDATE activations SET device_label = NULL WHERE ${activationsOf.replaceAll("?3", "?")}`).bind(email),
```

(Giữ nguyên hai câu `UPDATE licenses SET email = NULL …` và `UPDATE orders SET email = NULL …` ngay sau đó, và dòng `const counts = { activations: acts?.meta.changes ?? 0, … }`. Phản hồi của route **không đổi**: vẫn `{ activations, licenses, orders }`.)

- [ ] **Step 4: Chạy để thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/server && pnpm vitest run test/admin.test.ts 2>&1 | tail -10 && pnpm typecheck
```
Expected: PASS toàn bộ `admin.test.ts` (kể cả test "ghi nhật ký lỗi thì không xóa gì": nhật ký đứng đầu batch nên lỗi ghi nhật ký quay lui cả batch, kể cả hai câu xóa báo cáo).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/src/admin.ts server/test/admin.test.ts && git commit -m "feat(server): xóa theo email xóa luôn báo cáo lỗi của các máy thuộc email đó" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Kiểm tra toàn bộ và hoàn tất

**Files:** không sửa mã (chỉ sửa nếu bước kiểm lộ lỗi, rồi commit riêng).

- [ ] **Step 1: Chạy bộ kiểm đầy đủ của server như CI**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm -C server check 2>&1 | tail -30
```
Expected: `typecheck`, `vectors:check`, `test`, `test:scripts`, `ui:check` (typecheck, test, build của `admin-ui`) và `dry-run` (`wrangler deploy --dry-run` cho cả hai Worker) đều xanh. Nếu `dry-run` đòi đăng nhập, chạy các bước trước riêng và ghi rõ trong báo cáo là `dry-run` không chạy được ở môi trường này (không tự đăng nhập, không deploy).

- [ ] **Step 2: Soát nhanh theo spec**

Với từng dòng, xác nhận bằng cách chỉ ra test hoặc mã:
- Trần body 80 KB riêng cho `/v1/diagnostics`, route khác giữ 16 KiB → `diagnostics.test.ts` ("thân quá 80 KB").
- 415 chỉ nhận JSON → "Content-Type không phải JSON".
- Ba hạn mức theo giờ và cảnh báo `diagnostics_flood` một lần mỗi giờ → ba test giới hạn.
- 422 và không ghi nội dung vào log → test "còn dữ liệu nhạy cảm".
- Gửi lại cùng mã không tạo bản trùng → test "gửi lại cùng mã báo cáo".
- Email cảnh báo chỉ có số lượng → test "email cảnh báo".
- Dọn 30 ngày và trần 3.000 → `error-reports.test.ts` và `reconcile.test.ts`.
- Xóa theo email → `admin.test.ts` (test mới).
- Vector dùng chung với app → `diagnostics-scan.test.ts` (đây là file kế hoạch 03 phải dùng lại, không sao chép).

- [ ] **Step 3: Báo cáo**

Ghi lại cho người duyệt: số test của `pnpm -C server test` (so với mốc Task 0), danh sách commit của nhánh, và nhắc rằng **chưa áp migration 0004 lên D1 production và chưa deploy** (spec mục 8: áp migration TRƯỚC khi deploy Worker mới, deploy `mt-license` rồi `mt-license-admin` liền nhau, kiểm cron sau deploy bằng `wrangler triggers deploy`; chỉ làm khi chủ dự án cho phép).
