# Đăng nhập bằng Google Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi người dùng Free phải đăng nhập bằng Google để dùng tiếp; email lưu ở D1 và quản lý ở Web Admin; người đã mua gói không bị chặn.

**Architecture:** License server (Worker `mt-license`) là client OAuth "Web application" của Google; app chỉ mở trình duyệt hệ thống rồi hỏi kết quả bằng `login_id` + `verifier` (PKCE giữa app và server). Server cấp token tài khoản ký Ed25519 cùng khóa với token bản quyền. Cổng đăng nhập trong app là một "hook" gắn vào `License`, **mặc định mở**, nên mọi test và hành vi hiện có giữ nguyên.

**Tech Stack:** Cloudflare Workers + Hono 4.13 + D1 + WebCrypto (server, không thêm thư viện); Rust (Tauri 2, reqwest đồng bộ, keyring); React 19 + zustand (giao diện); Vitest, `cargo test`.

**Spec:** `docs/superpowers/specs/2026-11-05-dang-nhap-google-design.md`

Làm trên nhánh `feat/dang-nhap-google` (worktree, `superpowers:using-git-worktrees`). Không merge, push, đẩy tag hay deploy khi chủ dự án chưa cho phép (CLAUDE.md, spec §11).

## Global Constraints

- **Không bí mật trong app** (CLAUDE.md, spec §10.2): `GOOGLE_OAUTH_CLIENT_SECRET` chỉ ở secret của Worker.
- **Không thêm thư viện** ở server hay app. Nếu buộc phải thêm: bản ổn định mới nhất, kiểm tương thích, build lại và chạy test (CLAUDE.md, spec §6.12).
- **App chỉ nói chuyện với `api.aitranslator.vn`** (A7); trình duyệt hệ thống mới nói chuyện với `accounts.google.com`. Trong lúc đang dịch, app **không** gọi `/v1/auth/*` hay `/v1/account/*`.
- Redirect URI **đúng** `https://api.aitranslator.vn/v1/auth/google/callback`; không dùng tên miền cũ `aitranslator.io.vn`. Scope **đúng** `openid email` (không `profile`).
- **Máy ở gói trả phí còn hiệu lực không bao giờ bị chặn** vì chưa đăng nhập. Phiên đang dịch không bị ngắt khi cổng bật.
- **Không được làm app crash** (panic hook của app abort tiến trình, spec §10.1): trong `src-tauri/src/account/` cấm `unwrap`, `expect`, `panic!`, chỉ mục mảng trực tiếp (`#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::indexing_slicing)]`); lỗi kho khóa, lỗi mạng, token hỏng đều thành trạng thái `Anonymous` kèm mã lỗi, không bao giờ panic.
- **Không đổi hành vi cũ:** cổng đăng nhập mặc định `Open`; mọi test hiện có của `license/`, `trial`, `licenses` **không được sửa** (trừ danh sách mã lỗi và danh sách tên mục kho khóa, đã nêu ở task). Token dùng thử giữ đúng 5 trường (`typ: "trial"`); `POST /v1/trial` không có header `Authorization` phải trả y như cũ khi `ACCOUNT_REQUIRED` khác `"on"`, và với máy đã có dòng trong `trials` kể cả khi `"on"`.
- Migration chỉ dùng `ALTER TABLE ... ADD COLUMN` và `CREATE`, không dựng lại bảng; áp **trước** khi deploy Worker mới.
- Nội dung website/pháp lý: chỉ nói điều có thật; **không nêu công nghệ lõi** (CLAUDE.md); sửa đủ các bản ngôn ngữ vi/en/ja/zh/ko (pháp lý chỉ vi/en). Ghi chú code viết tiếng Việt như phần còn lại của repo. Giao diện đủ vi, en, ja, zh, ko.
- Nút Google dùng bộ nút chính thức của Google (người vận hành tải từ trang hướng dẫn thương hiệu của Google, đặt ở `src/assets/google/`); không tự vẽ biểu tượng.

## Review Focus

1. Kho khóa không đọc/ghi được, hoặc token tài khoản hỏng: người dùng gói trả phí vẫn dịch bình thường; Free thấy màn đăng nhập, app không sập (Task 9b, 10).
2. Đăng nhập dở dang: đóng tab trình duyệt, bấm Từ chối, tài khoản Workspace bị chặn, tắt app giữa chừng, bấm "Đăng nhập" hai lần: app không kẹt ở "đang chờ", Hủy hoạt động, mở lại app về `Anonymous` (Task 4, 10).
3. Cùng tài khoản trên hai máy, cài lại cùng máy, xóa tài khoản rồi đăng nhập lại: không có thêm 10 ngày dùng thử (Task 5).
4. App ≤ 0.6.8 gọi `/v1/trial` không `Authorization`: kết quả không đổi với máy đã có dòng, kể cả `ACCOUNT_REQUIRED="on"` (Task 5).
5. Server tắt đăng nhập (`LOGIN_GATE="off"`, hoặc thiếu secret Google): app mở cổng, không ai bị khóa; mất mạng thì cổng giữ nguyên (Task 4, 10).
6. Xuất CSV: email bắt đầu bằng `=`, `+`, `-`, `@` không thành công thức Excel (Task 6).

---

## Phần A: License server (`server/`)

### Task 1: Migration 0010

**Files:**
- Create: `server/migrations/0010_accounts.sql`
- Modify: `server/test/migrations.test.ts`, `server/test/schema.test.ts`

**Interfaces:** Produces bảng `accounts`, `login_attempts`, cột `trials.account_id`, `licenses.account_id` đúng như spec §4 (kể cả `accounts.trial_started_at`, `accounts.trial_ends_at`).

- [ ] **Step 1: Viết test lỗi** trong `migrations.test.ts`, theo mẫu các test migration hiện có: `migration 0010 giữ nguyên dữ liệu cũ`: dựng DB tới 0009, chèn 13 `licenses` (kèm `activations`, `orders`) và 90 `trials`, áp 0010, khẳng định số dòng từng bảng không đổi, `account_id` của `trials` và `licenses` đều NULL; `migration 0010 tạo accounts.google_sub duy nhất` (chèn hai dòng cùng `google_sub` → lỗi UNIQUE); `login_attempts.status` từ chối giá trị lạ (CHECK).
- [ ] **Step 2:** Chạy `cd server && pnpm vitest run test/migrations.test.ts` → FAIL (chưa có file).
- [ ] **Step 3: Viết `0010_accounts.sql`** y hệt khối SQL ở spec §4. Cập nhật `schema.test.ts` nếu nó liệt kê bảng/cột.
- [ ] **Step 4:** Chạy lại hai file test → PASS.
- [ ] **Step 5: Commit** `feat(server): migration 0010 cho tài khoản Google`.

### Task 2: Token tài khoản (TypeScript) và vector chung

**Files:**
- Modify: `server/src/token.ts`, `server/test/token.test.ts`, `server/package.json`
- Create: `server/scripts/gen-account-token-vectors.mjs`, `server/test/vectors/token-account-v1.json`

**Interfaces:** Produces (trong `token.ts`):
```ts
export interface AccountClaims { typ: "account"; kid: string; account_id: string; device_id_hash: string; issued_at: number }
export type AccountVerifyError = "malformed" | "unknown_kid" | "bad_signature" | "wrong_device";
export async function signAccountToken(signingKey: SigningKey, claims: AccountClaims): Promise<string>
export async function verifyAccountToken(token: string, publicKeys: Record<string, string>, opts: { deviceIdHash: string }):
  Promise<{ ok: true; claims: AccountClaims } | { ok: false; error: AccountVerifyError }>
```
Thứ tự trường ký cố định: `typ, kid, account_id, device_id_hash, issued_at`.

- [ ] **Step 1: Test lỗi** trong `token.test.ts`: `account token ký rồi kiểm lại được`; `token dùng thử bị verifyAccountToken từ chối (malformed)`; `token tài khoản bị verifyTrialToken và verifyToken từ chối`; `đổi máy → wrong_device`; `thiếu account_id → malformed`; `kid lạ → unknown_kid`; `sửa 1 byte payload → bad_signature`.
- [ ] **Step 2:** `cd server && pnpm vitest run test/token.test.ts` → FAIL.
- [ ] **Step 3:** Cài `signAccountToken` / `verifyAccountToken` bằng `signClaims` / `checkSigned` sẵn có, thêm `parseAccountClaims` (đòi `typ === "account"` và đủ 5 trường đúng kiểu), theo cấu trúc của `parseTrialClaims`.
- [ ] **Step 4:** Viết `gen-account-token-vectors.mjs` (theo `gen-token-vectors.mjs`), sinh `token-account-v1.json` (mỗi vector: claims, token, public key); thêm script `vectors:account` và đưa vào `vectors:check` trong `package.json`. Chạy `pnpm vectors:account`, rồi `pnpm vectors:check` → PASS.
- [ ] **Step 5:** `pnpm vitest run test/token.test.ts` → PASS. **Commit** `feat(server): token tài khoản và vector chung`.

### Task 3: `GoogleAuth` (đổi code, kiểm id_token)

**Files:**
- Create: `server/src/google-auth.ts`, `server/test/google-auth.test.ts`
- Modify: `server/src/deps.ts`, `server/src/env.ts`, `server/test/fakes.ts`, `server/test/world.ts`, `server/test/env.d.ts`

**Interfaces:** Produces:
```ts
export interface GoogleIdentity { sub: string; email: string }
export type GoogleAuthFailure = "exchange_failed" | "bad_id_token" | "email_unverified" | "nonce_mismatch" | "jwks_unavailable";
export class GoogleAuthError extends Error { constructor(readonly reason: GoogleAuthFailure) }
export interface GoogleAuth {
  authUrl(p: { state: string; nonce: string; codeChallenge: string }): string;
  exchange(p: { code: string; codeVerifier: string; nonce: string }): Promise<GoogleIdentity>; // ném GoogleAuthError
}
export class RealGoogleAuth implements GoogleAuth { constructor(o: { clientId: string; clientSecret: string; redirectUri: string; fetch?: typeof fetch; now?: () => number }) }
export function googleFromEnv(env: Pick<ApiEnv, "GOOGLE_OAUTH_CLIENT_ID" | "GOOGLE_OAUTH_CLIENT_SECRET">): GoogleAuth | null
```
`Deps` thêm `google: GoogleAuth | null`; `ApiEnv` thêm `GOOGLE_OAUTH_CLIENT_ID?: string`, `GOOGLE_OAUTH_CLIENT_SECRET?: string`, `LOGIN_GATE?: string`, `ACCOUNT_REQUIRED?: string`, `AUTH_POLL_LIMITER?: RateLimit`. `fakes.ts` thêm `FakeGoogleAuth` (kịch bản đặt được: trả `GoogleIdentity` hoặc ném `GoogleAuthError`); `world.ts` đưa vào `deps.google`.

- [ ] **Step 1: Test lỗi** `google-auth.test.ts` (tự sinh cặp khóa RSA bằng WebCrypto, `fetch` giả phục vụ endpoint token và JWKS): `id_token hợp lệ trả sub và email`; sai `aud`, sai `iss`, hết hạn `exp`, sai `nonce` → `bad_id_token`/`nonce_mismatch`; `email_verified: false` → `email_unverified`; `kid` lạ gọi JWKS lại đúng một lần rồi mới thất bại; chữ ký sai → `bad_id_token`; JWKS trả 500 → `jwks_unavailable`; endpoint token trả 400 → `exchange_failed`; `iss` chấp nhận cả `accounts.google.com` lẫn `https://accounts.google.com`; `authUrl` chứa `scope=openid+email` (không có `profile`), `redirect_uri` đúng `https://api.aitranslator.vn/v1/auth/google/callback`, `code_challenge_method=S256`, `response_type=code`; yêu cầu đổi code gửi `client_secret` và `code_verifier`; `googleFromEnv` trả null khi thiếu client id hoặc secret.
- [ ] **Step 2:** `pnpm vitest run test/google-auth.test.ts` → FAIL.
- [ ] **Step 3:** Cài `RealGoogleAuth`: đổi code tại `https://oauth2.googleapis.com/token`; kiểm RS256 bằng `crypto.subtle` với JWKS từ `https://www.googleapis.com/oauth2/v3/certs`, cache trong bộ nhớ theo `Cache-Control: max-age`; không thêm thư viện.
- [ ] **Step 4:** Nối `deps.ts` (`realDeps` gọi `googleFromEnv`), `env.ts`, `fakes.ts`, `world.ts`. `pnpm typecheck && pnpm test` toàn bộ → PASS (test cũ không đổi).
- [ ] **Step 5: Commit** `feat(server): GoogleAuth đổi code và kiểm id_token`.

### Task 4: Route đăng nhập, công tắc khẩn cấp, giới hạn tần suất

**Files:**
- Create: `server/src/auth.ts`, `server/test/auth.test.ts`
- Modify: `server/src/app.ts` (gọi `registerAuth(app)`), `server/src/http.ts` (mã lỗi mới), `server/src/ratelimit.ts`, `server/src/reconcile.ts`, `server/wrangler.jsonc`, `server/test/node/wrangler-config.test.mjs`

**Interfaces:** Produces `registerAuth(app: Hono<AppEnv>): void` và `pruneLoginAttempts(db: D1Database, now: number): Promise<void>`. `ErrorCode` thêm `"login_unavailable" | "account_required" | "license_linked_other_account"`. `LIMITS` thêm `auth_start_ip: 20`, `auth_callback_ip: 60`, `account_ip: 30`. `wrangler.jsonc`: vars `GOOGLE_OAUTH_CLIENT_ID` (điền ID thật lúc phát hành), `LOGIN_GATE: "on"`, `ACCOUNT_REQUIRED: "off"`; `secrets.required` thêm `GOOGLE_OAUTH_CLIENT_SECRET`; `ratelimits` thêm `AUTH_POLL_LIMITER` (`namespace_id` là số tự chọn, duy nhất, ví dụ `"20261105"`; 60 lần/60 giây theo `login_id`, như `SUPPORT_POLL_LIMITER`).

Endpoint đúng spec §5.1 và §5.4b: `POST /v1/auth/google/start`, `GET /v1/auth/google/callback`, `POST /v1/auth/poll`, `GET /v1/auth/status`.

- [ ] **Step 1: Test lỗi** `auth.test.ts` với `FakeGoogleAuth`: `start thiếu consent → 400 invalid_request`; `start trả login_id và login_url bắt đầu bằng https://accounts.google.com/o/oauth2/v2/auth`; `start khi google null → 503 login_unavailable`; `callback state lạ → trang lỗi, không gọi Google`; `callback hết hạn (>10 phút) → trang lỗi`; `callback dùng hai lần → lần hai lỗi, không tạo thêm tài khoản`; `callback đúng → accounts có 1 dòng, email, consent_at, status done`; `callback email_unverified → failed, không tạo tài khoản`; `callback error=access_denied → status denied`; `đăng nhập lại cùng google_sub → cập nhật email và last_login_at, không tạo dòng mới`; `trang callback không chứa email, token; có Referrer-Policy no-referrer và Cache-Control no-store; ngôn ngữ theo lang (vi,en,ja,zh,ko)`; `poll pending`; `poll done trả token đúng định dạng account và email, lần hai trả 404`; `poll sai verifier → 404`; `poll denied/failed/expired`; `token trong poll kiểm được bằng verifyAccountToken với device_id_hash của login`; `status → {login:"off"} khi LOGIN_GATE=off, khi thiếu google, và {login:"on"} khi bình thường`; `rate limit auth_start_ip → 429`; `pruneLoginAttempts xóa bản ghi quá 1 ngày`. Test khóa cấu hình trong `wrangler-config.test.mjs`: `GOOGLE_OAUTH_CLIENT_SECRET` nằm trong `secrets.required`, `LOGIN_GATE` mặc định `"on"`, `ACCOUNT_REQUIRED` mặc định `"off"`.
- [ ] **Step 2:** `pnpm vitest run test/auth.test.ts && pnpm test:scripts` → FAIL.
- [ ] **Step 3:** Cài `auth.ts` đúng spec. `state` và `nonce` ngẫu nhiên 32 byte (`randomBytes`), lưu `sha256Hex`; kiểm `SHA-256(verifier) == challenge` bằng `timingSafeEqual`; poll trả token một lần bằng một câu `UPDATE ... WHERE status='done' RETURNING` (đổi `done` → `claimed` nguyên tử, tránh hai request cùng lấy). Callback bắt mọi lỗi và luôn trả trang HTML, không bao giờ ném 500 ra ngoài. Thêm `await step("prune_login", ...)` vào `reconcile.ts` cạnh `prune`.
- [ ] **Step 4:** `pnpm check` (typecheck, vectors, test, test:scripts, dry-run) → PASS.
- [ ] **Step 5: Commit** `feat(server): route đăng nhập Google và công tắc khẩn cấp`.

### Task 5: Route tài khoản và luật dùng thử theo tài khoản

**Files:**
- Create: `server/src/account.ts`, `server/test/account.test.ts`
- Modify: `server/src/trial.ts`, `server/src/app.ts` (gọi `registerAccount(app)`), `server/test/trial.test.ts` (chỉ **thêm** test)

**Interfaces:** Produces:
```ts
export async function authenticateAccount(c: Context<AppEnv>, deviceIdHash?: string):
  Promise<{ accountId: string; deviceIdHash: string } | Response>   // Response = 401 invalid_token
export function registerAccount(app: Hono<AppEnv>): void           // POST /v1/account/link-license, POST /v1/account/delete
```
Consumes: `verifyAccountToken` (Task 2). Tài khoản `deleted_at` khác NULL thì `authenticateAccount` trả 401.

- [ ] **Step 1: Test lỗi** `account.test.ts`: `link-license thành công đặt licenses.account_id`; `activation đã gỡ → activation_not_found`; `activation của máy khác → invalid_token (wrong_device)`; `license đã gắn tài khoản khác → 409 license_linked_other_account, không đổi`; `gắn lại cùng tài khoản idempotent`; `delete đặt email NULL, deleted_at, account_id của trials và licenses về NULL, giữ google_sub và trial_started_at, trial_ends_at`; `token của tài khoản đã xóa → 401`; `đăng nhập lại cùng google_sub sau khi xóa khôi phục dòng cũ, giữ created_at và mốc dùng thử`. Thêm vào `trial.test.ts` (các test cũ giữ nguyên): `không Bearer, ACCOUNT_REQUIRED off → như cũ`; `không Bearer, ACCOUNT_REQUIRED on, máy đã có dòng → vẫn nhận token (y hệt cũ)`; `không Bearer, on, máy mới → 401 account_required`; `Bearer, máy đã có dòng → trials.account_id được đặt, started_at và ends_at không đổi, accounts.trial_* được ghi nếu NULL`; `Bearer, máy đã có dòng gắn tài khoản khác → giữ nguyên`; `Bearer, máy mới, tài khoản chưa dùng thử → tạo dòng TRIAL_DAYS và ghi mốc vào accounts`; `Bearer, máy mới, tài khoản đã dùng thử ở máy khác → dòng mới dùng đúng started_at và ends_at của tài khoản`; `token dùng thử trả về vẫn đúng 5 trường typ trial`; `Bearer sai → 401 invalid_token`.
- [ ] **Step 2:** `pnpm vitest run test/account.test.ts test/trial.test.ts` → FAIL (các test mới).
- [ ] **Step 3:** Cài `account.ts` và sửa `trial.ts` đúng spec §5.3, §5.5. **Đường không Bearer giữ nguyên câu lệnh SQL và phản hồi hiện có**; nhánh Bearer là code mới tách riêng, đặt sau khi đọc `ACCOUNT_REQUIRED`.
- [ ] **Step 4:** `pnpm vitest run` toàn bộ → PASS.
- [ ] **Step 5: Commit** `feat(server): liên kết license, xóa tài khoản và dùng thử theo tài khoản`.

### Task 6: Web Admin: API tài khoản

**Files:**
- Create: `server/src/admin-accounts.ts`, `server/test/admin-accounts.test.ts`
- Modify: `server/src/admin.ts` (gọi `registerAdminAccounts`; mở rộng `POST /admin/erase` tại dòng ~575 để áp luật 5.5 cho `accounts.email`), `server/test/admin.test.ts`

**Interfaces:** Produces `registerAdminAccounts(app: Hono<AdminAppEnv>): void` với `GET /admin/accounts?q&filter&cursor` (dùng `listRoute` của `admin-read.ts`; `filter` ∈ `paid | trial_active | trial_ended | deleted`), `GET /admin/accounts/:id`, `POST /admin/accounts/:id/unlink-license {license_id}`, `POST /admin/accounts/:id/anonymize`, `GET /admin/accounts/export.csv`; `export function csvCell(value: string): string` (tiền tố `'` khi ký tự đầu là `=`, `+`, `-`, `@`, tab hoặc CR; bọc nháy kép và nhân đôi nháy kép khi có `,`, `"`, xuống dòng).

- [ ] **Step 1: Test lỗi**: `csvCell("=1+1") === "'=1+1"` (và `+`, `-`, `@`, tab); `csvCell('a,"b"') === '"a,""b"""'`; danh sách tìm theo email một phần; mỗi bộ lọc trả đúng nhóm; chi tiết liệt kê license, máy, dòng trials; `unlink-license` ghi `audit_log`; `anonymize` áp luật 5.5; `POST /admin/erase` theo email cũng ẩn danh `accounts` cùng email; xuất CSV ghi `audit_log` (`accounts_exported`) và có đúng cột `email,created_at,last_login_at,plan,trial_ends_at`; mọi route cần danh tính Access (test theo mẫu `admin.test.ts`).
- [ ] **Step 2:** `pnpm vitest run test/admin-accounts.test.ts test/admin.test.ts` → FAIL.
- [ ] **Step 3:** Cài theo mẫu `admin-read.ts` / `admin.ts`; nhãn `audit_log` mới thêm vào `admin-ui/src/audit-labels.ts` ở Task 7.
- [ ] **Step 4:** `pnpm vitest run` → PASS.
- [ ] **Step 5: Commit** `feat(admin): API tài khoản, xóa theo email và xuất CSV`.

### Task 7: Web Admin: trang Tài khoản

**Files:**
- Create: `server/admin-ui/src/pages/AccountsPage.tsx`, `AccountsPage.test.tsx`, `AccountPage.tsx`, `AccountPage.test.tsx`
- Modify: `server/admin-ui/src/api/endpoints.ts`, `api/types.ts`, `router.tsx`, `audit-labels.ts`, thanh điều hướng (theo `TrialsPage` được đăng ký ở đâu)

**Interfaces:** Consumes các endpoint Task 6. Produces route `/accounts`, `/accounts/:id`.

- [ ] **Step 1: Test lỗi** theo mẫu `LicensesPage.test.tsx` và `TrialsPage.test.tsx`: danh sách hiện email, ngày tạo, đăng nhập gần nhất, nhóm; ô tìm kiếm gọi API với `q`; lọc theo nhóm; nút "Xuất CSV" gọi `export.csv`; trang chi tiết có nút Gỡ gắn license và Ẩn danh kèm hộp xác nhận; nhãn audit mới có chữ tiếng Việt.
- [ ] **Step 2:** `pnpm ui:check` → FAIL.
- [ ] **Step 3:** Cài hai trang bằng `list-kit.tsx` và `detail-kit.tsx`, không thêm thư viện.
- [ ] **Step 4:** `pnpm ui:check && pnpm ui:build` → PASS.
- [ ] **Step 5: Commit** `feat(admin-ui): trang Tài khoản`.

---

## Phần B: App (`src-tauri/`)

### Task 8: Token tài khoản (Rust) và mục kho khóa

**Files:**
- Create: `src-tauri/src/account/mod.rs`, `src-tauri/src/account/token.rs`
- Modify: `src-tauri/src/lib.rs` (`pub mod account;`), `src-tauri/src/license/store.rs`

**Interfaces:** Produces:
```rust
// account/token.rs
pub struct AccountClaims { pub account_id: String, pub device_id_hash: String, pub issued_at: i64 }
pub fn verify(token: &str, keys: &PublicKeys, device_id_hash: &str) -> Result<AccountClaims, VerifyError>
// license/store.rs
pub const ACCOUNT: &str = "account-session";
#[derive(Serialize, Deserialize)] pub struct AccountRecord { pub token: String, pub email: String }
```
`account/mod.rs` bắt đầu bằng `#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::indexing_slicing)]` (khối `#[cfg(test)]` được `allow`).

- [ ] **Step 1: Test lỗi** (trong `token.rs`, theo cách `license/token.rs` đọc `server/test/vectors/token-v1.json`): `mọi vector token-account-v1.json đều kiểm được`; `token dùng thử bị từ chối`; `token bản quyền bị từ chối`; `sai máy bị từ chối`; `kid lạ, chữ ký sai bị từ chối`. Trong `store.rs`: thêm `ACCOUNT` vào danh sách `names` của test `wiping_user_data_keeps_the_license_and_the_quota_counters` (token tài khoản sống qua "Xóa toàn bộ dữ liệu"); `AccountRecord` đọc/ghi qua `FakeVault`; mục hỏng → `StoreError::Corrupt`.
- [ ] **Step 2:** `cd src-tauri && cargo test -p meeting-translator account::` và `license::store::` → FAIL.
- [ ] **Step 3:** Cài `verify` bằng cùng bộ giải phong bì và chữ ký của `license/trial.rs` (đọc file đó trước; đòi `typ == "account"`, đủ 3 trường còn lại).
- [ ] **Step 4:** `cargo test -p meeting-translator account:: license::` và `cargo clippy -p meeting-translator --all-targets -- -D warnings` → PASS.
- [ ] **Step 5: Commit** `feat(app): token tài khoản và mục kho khóa`.

### Task 9: Client API tài khoản

**Files:**
- Create: `src-tauri/src/account/client.rs`
- Modify: `src-tauri/src/license/client.rs` (đổi `HttpApi::call` thành `pub(crate)`, **không đổi hành vi**; nếu `serve` của test đang private thì đưa lên `pub(crate)` dưới `#[cfg(test)]`)

**Interfaces:** Produces:
```rust
pub struct LoginStatus { pub login_on: bool }
pub struct LoginStart { pub login_id: String, pub login_url: String, pub expires_at: i64 }
pub enum LoginPoll { Pending, Done { token: String, email: String }, Denied, Failed, Expired }
pub trait AccountApi: Send + Sync {
    fn status(&self) -> Reply<LoginStatus>;                                                        // GET /v1/auth/status
    fn start(&self, device_id_hash: &str, challenge: &str, lang: &str) -> Reply<LoginStart>;      // consent luôn true
    fn poll(&self, login_id: &str, verifier: &str) -> Reply<LoginPoll>;
    fn link_license(&self, token: &str, key: &str, activation_id: &str) -> Reply<()>;
    fn delete(&self, token: &str) -> Reply<()>;
}
pub struct HttpAccountApi; impl HttpAccountApi { pub fn for_this_build() -> Self }
```
`Reply` là kiểu của `license/client.rs`. Token đi trong header `Authorization: Bearer`, không bao giờ trong URL hay log.

- [ ] **Step 1: Test lỗi**: `start gửi device_id_hash, challenge, consent true, lang`; `poll đọc pending, done (token, email), denied, failed, expired`; `status login off → login_on false`, `không đọc được thân → Decode lỗi, không panic`; `link_license và delete gửi Authorization: Bearer`; `lỗi giữ mã server và Retry-After`; `chỉ https (accept_base) và đúng PRODUCTION_URL`.
- [ ] **Step 2:** `cargo test -p meeting-translator account::client` → FAIL.
- [ ] **Step 3:** Cài bằng `HttpApi::call`; trường lạ trong response được bỏ qua (serde mặc định).
- [ ] **Step 4:** `cargo test -p meeting-translator license::client account::client` → PASS (test cũ của `license::client` không đổi).
- [ ] **Step 5: Commit** `feat(app): client API tài khoản`.

### Task 9b: Cổng đăng nhập trong `License` (mặc định mở)

**Files:**
- Modify: `src-tauri/src/license/manager.rs`, `src-tauri/src/license/client.rs`, `src-tauri/src/errors.rs`, `src-tauri/src/license/app.rs` (`block_error`)

**Interfaces:** Produces:
```rust
// manager.rs
#[derive(Clone, Copy, Debug, PartialEq, Eq)] pub enum AccountGate { Open, LoginRequired }
pub trait AccountHook: Send + Sync { fn gate(&self) -> AccountGate; fn bearer(&self) -> Option<String>; }
impl License { pub fn set_account_hook(&self, hook: Arc<dyn AccountHook>); }   // chưa đặt = Open, bearer None
StartBlock::LoginRequired                                                      // biến thể mới
// client.rs, LicenseApi (có cài mặc định, nên FakeApi cũ không phải sửa):
fn trial_with_account(&self, device_id_hash: &str, account_token: Option<&str>) -> Reply<TrialGrant> { let _ = account_token; self.trial(device_id_hash) }
// errors.rs
pub const LOGIN_REQUIRED: &str = "loginRequired";
```
`HttpApi` ghi đè `trial_with_account` để gửi `Authorization: Bearer` khi có token.

- [ ] **Step 1: Test lỗi** (trong `manager.rs`, dùng `FakeApi`/`FakeVault` sẵn có): `không đặt hook thì mọi start_block và compose_block như cũ` (đã được bao bởi toàn bộ test cũ chạy không sửa); `Free chưa đăng nhập → start_block và compose_block trả LoginRequired, đứng trước TrialEnded và TrialMissing`; `gói trả phí còn hiệu lực không bao giờ LoginRequired dù hook báo LoginRequired`; `LoginRequired không gọi server (FakeApi đếm 0 lần)`; `dev_unlimited bỏ qua cổng`; `trial_due false khi LoginRequired`; `register_trial gửi Bearer của hook`; `hook trả Open → hành vi cũ`. Trong `errors.rs`: thêm `LOGIN_REQUIRED` vào danh sách mã lỗi của test hiện có; `block_error(StartBlock::LoginRequired)` ánh xạ sang `LOGIN_REQUIRED`.
- [ ] **Step 2:** `cargo test -p meeting-translator license::manager errors::` → FAIL (test mới).
- [ ] **Step 3:** Thêm trường `hook: Mutex<Option<Arc<dyn AccountHook>>>` vào `License` **không đổi chữ ký `License::new`**; trong `start_block` và `compose_block`, nhánh Free (nơi `quota_claims(..).is_none()`), kiểm hook **trước** bước đăng ký dùng thử; `trial_due` thêm điều kiện cổng mở; `register_trial` gọi `trial_with_account`. Poisoned mutex → coi như `Open`.
- [ ] **Step 4:** `cargo test -p meeting-translator` toàn bộ → PASS; `cargo clippy ... -D warnings` → PASS. **Mọi test cũ trong `license/` không bị sửa dòng nào** (kiểm bằng `git diff --stat` chỉ thấy phần thêm).
- [ ] **Step 5: Commit** `feat(app): cổng đăng nhập mặc định mở trong License`.

### Task 10: Luồng đăng nhập `AccountService`

**Files:**
- Create: `src-tauri/src/account/flow.rs`
- Modify: `src-tauri/src/account/mod.rs`

**Interfaces:** Produces (đều trong `account/`, cấm panic):
```rust
#[derive(Clone, Debug, PartialEq, Eq, Serialize)] #[serde(rename_all = "camelCase")]
pub struct AccountView { pub state: AccountState, pub email: Option<String>, pub gate: bool }   // gate = đang đòi đăng nhập
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)] #[serde(rename_all = "camelCase")]
pub enum AccountState { Anonymous, SigningIn, SignedIn }
pub enum AccountError { Network, Denied, Failed, Expired, Cancelled, Busy, Unavailable, Storage }   // .code() -> &'static str: accountNetwork, accountDenied, accountFailed, accountExpired, accountCancelled, accountBusy, accountUnavailable, accountStorage
pub struct AccountService;
impl AccountService {
    pub fn new(api: Box<dyn AccountApi>, vault: Arc<dyn Vault>, keys: PublicKeys, device_id_hash: String, timing: Timing) -> Self;   // Timing { poll_every: Duration, timeout: Duration }
    pub fn view(&self) -> AccountView;                                   // chỉ đọc bộ nhớ, không I/O
    pub fn refresh_status(&self);                                        // GET /v1/auth/status; chỉ "off" rõ ràng mới mở cổng
    pub fn sign_in(&self, lang: &str, open_url: &dyn Fn(&str) -> Result<(), String>) -> Result<AccountView, AccountError>;  // chặn, chạy cả vòng hỏi kết quả
    pub fn cancel(&self);
    pub fn sign_out(&self) -> Result<AccountView, AccountError>;
    pub fn delete(&self) -> Result<AccountView, AccountError>;           // gọi server trước, lỗi thì giữ nguyên token cục bộ
    pub fn link_license(&self, key: &str, activation_id: &str) -> Result<(), AccountError>;
}
impl AccountHook for AccountService { /* gate: Open khi đã đăng nhập hợp lệ cho máy này, hoặc status off; LoginRequired còn lại. bearer: token đang giữ */ }
pub fn is_google_login_url(url: &str) -> bool;   // https, host accounts.google.com, path /o/oauth2/v2/auth
```
`verifier`: 32 byte ngẫu nhiên (`getrandom`, sẵn có), base64url; `challenge` = SHA-256 base64url. Token đọc từ kho khóa lúc dựng; lỗi đọc hay token hỏng/sai máy → `Anonymous` (ghi log một lần), không panic.

- [ ] **Step 1: Test lỗi** (`FakeAccountApi` kịch bản + `FakeVault`; `Timing` mili-giây): `sign_in thành công ghi token vào kho và trả SignedIn`; `chỉ mở URL của accounts.google.com, URL khác → Failed và không mở`; `Denied, Failed, Expired của poll map đúng mã`; `cancel dừng vòng hỏi và trả Cancelled`; `sign_in lần hai khi đang chạy → Busy`; `lỗi mạng khi hỏi được thử lại tới hết timeout rồi Network`; `kho khóa đọc lỗi → Anonymous, không panic`; `token sai máy → Anonymous`; `token hỏng → Anonymous`; `ghi token lỗi → Storage nhưng phiên vẫn SignedIn trong bộ nhớ`; `sign_out xóa token và cổng đóng lại`; `gate Open khi status off; status lỗi mạng giữ LoginRequired`; `delete lỗi server giữ token`; `delete thành công xóa token`; `view không gọi api (FakeAccountApi đếm 0)`; `is_google_login_url` từ chối `http`, host lạ, `accounts.google.com.evil.com`, đường dẫn khác.
- [ ] **Step 2:** `cargo test -p meeting-translator account::flow` → FAIL.
- [ ] **Step 3:** Cài; trạng thái trong một `Mutex` ngắn, không giữ khóa khi gọi mạng hay ngủ; cờ hủy là `AtomicBool`; mọi `Result` được xử lý bằng `match`/`?`/`let ... else`.
- [ ] **Step 4:** `cargo test -p meeting-translator account::` và `cargo clippy -p meeting-translator --all-targets -- -D warnings` (lint cấm panic phải sạch) → PASS.
- [ ] **Step 5: Commit** `feat(app): luồng đăng nhập Google`.

### Task 11: Nối vào app (lệnh IPC, quyền, host, sự kiện)

**Files:**
- Modify: `src-tauri/src/commands.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json`, `src-tauri/src/acl_tests.rs`, `src-tauri/src/navigation.rs`, `src-tauri/src/events.rs`, `src-tauri/src/license/app.rs`, `src-tauri/src/license/manager.rs` (accessor `License::saved_activation(&self) -> Option<(String, String)>`: key và `activation_id` đang lưu), `src-tauri/src/app_tests.rs`

**Interfaces:** Produces lệnh (đều `async` + `blocking(app, ...)` như `validate_license`; thêm vào `MAIN_COMMANDS`, danh sách handler và `build.rs`): `get_account() -> AccountView`, `account_sign_in(lang: String) -> Result<AccountView, CommandError>`, `account_cancel_sign_in()`, `account_sign_out() -> Result<AccountView, CommandError>`, `account_delete() -> Result<AccountView, CommandError>`. Sự kiện `ACCOUNT_CHANGED = "account://changed"` phát tới cửa sổ chính. `EXTERNAL_HOSTS` thêm `"accounts.google.com"`.

Hành vi nối: dựng `AccountService` trong `license::app::install_with`, gọi `license.set_account_hook(...)`; `account_sign_in` bị từ chối (`accountBusy`) khi phiên dịch đang chạy (dùng cùng cách kiểm "đang dịch" mà `diagnostics/send.rs` dùng để không gửi báo cáo lúc dịch); sau khi đăng nhập thành công: `license.allow_trial()` + `register_trial_if_due` ở luồng nền (gắn Bearer), rồi nếu `saved_activation()` có thì `link_license` ở nền; nhịp ticker hiện có gọi `refresh_status` mỗi giờ khi `Anonymous`.

- [ ] **Step 1: Test lỗi**: `acl_tests`: cửa sổ chính gọi được năm lệnh mới; overlay, compose, hint bị chặn (`denied`); danh sách cố định `MAIN_COMMANDS` khớp; `account_sign_in` mở URL qua `SystemOpener` giả đúng một lần và chỉ với URL Google; `navigation`: `accounts.google.com` được mở bằng trình duyệt, `evil.accounts.google.com` và `google.com` bị chặn; `app_tests`: `account_sign_in` khi phiên đang chạy → `accountBusy` và không gọi api; `get_account` lúc chưa cấu hình server vẫn trả được (không panic); sau đăng nhập, `start_block` Free đổi từ `LoginRequired` sang kết quả cũ.
- [ ] **Step 2:** `cargo test -p meeting-translator acl_tests app_tests navigation` → FAIL.
- [ ] **Step 3:** Cài; `cargo build` sinh lại `permissions/autogenerated/*` (commit các file sinh ra).
- [ ] **Step 4:** `cargo test --workspace` và `cargo clippy --workspace --all-targets -- -D warnings` → PASS.
- [ ] **Step 5: Commit** `feat(app): lệnh, quyền và sự kiện tài khoản`.

---

## Phần C: Giao diện (`src/`)

### Task 12: Kiểu IPC và store tài khoản

**Files:**
- Create: `src/lib/account.ts`, `src/lib/account.test.ts`, `src/store/account.ts`, `src/store/account.test.ts`, `src/windows/main/accountStore.ts`
- Modify: `src/lib/ipc.ts`, `src/lib/fakeIpc.ts`

**Interfaces:** Produces `AccountView { state: "anonymous"|"signingIn"|"signedIn"; email: string | null; gate: boolean }`; lệnh `get_account`, `account_sign_in { lang: string }`, `account_cancel_sign_in`, `account_sign_out`, `account_delete`; sự kiện `"account://changed": AccountView`; `accountErrorKey(code: string): string` (ví dụ `accountDenied` → `error.accountDenied`, mã lạ → `error.unknown`); `createAccountStore(ipc: Ipc)` (zustand vanilla như `store/license.ts`) với `init()`, `signIn(lang)`, `cancel()`, `signOut()`, `deleteAccount()`, `view`, `error`, `busy`.

- [ ] **Step 1: Test lỗi**: `init đọc get_account và nghe account://changed`; `signIn đặt busy rồi nhận view mới`; lỗi map sang `UiError` có key đúng; `cancel` gọi `account_cancel_sign_in`; không có lệnh nào ném ra ngoài (store nuốt lỗi thành `error`); `accountErrorKey` với mọi mã trong spec.
- [ ] **Step 2:** `pnpm vitest run src/store/account.test.ts src/lib/account.test.ts` → FAIL.
- [ ] **Step 3:** Cài; cập nhật `fakeIpc.ts` để các cảnh xem trước dùng được.
- [ ] **Step 4:** `pnpm test` và `pnpm exec tsc --noEmit` ở thư mục gốc → PASS.
- [ ] **Step 5: Commit** `feat(ui): store và kiểu IPC tài khoản`.

### Task 13: Màn đăng nhập, bước Onboarding, i18n

**Files:**
- Create: `src/components/SafeBoundary.tsx`, `src/components/SafeBoundary.test.tsx`, `src/windows/main/screens/LoginGate.tsx`, `src/windows/main/screens/LoginGate.test.ts`, `src/assets/google/` (nút chính thức do người vận hành cung cấp)
- Modify: `src/windows/main/Shell.tsx`, `src/lib/onboardingSteps.ts` + `onboardingSteps.test.ts`, `src/windows/main/onboarding/Onboarding.tsx`, `src/store/app.ts` (dòng ~475 `start_trial`), `src/i18n/{vi,en,ja,zh,ko}.ts`, `scripts/ui-preview/` (cảnh `login-gate`, `check-i18n.mjs`)

**Interfaces:** `Step` thêm `"account"` ngay sau `"terms"`; `canAdvance(step: Step, termsAccepted: boolean, accountReady: boolean): boolean` (bước `account` đòi `accountReady`); `SafeBoundary` (class component, `getDerivedStateFromError`) bọc `LoginGate`: lỗi render hiện thông báo nhỏ và nút "Thử lại" thay vì trắng cửa sổ. `LoginGate` hiện thay thân của ba màn `home`, `compose`, `voice` khi `account.gate === true`; các màn còn lại (Lịch sử, Bản chép lời, Từ điển, Cài đặt, Nâng cấp, Hỗ trợ, Giới thiệu) **không** bị chặn. Từ khóa i18n: `account.gate.title`, `account.gate.body`, `account.gate.consent`, `account.gate.signIn`, `account.gate.waiting`, `account.gate.cancel`, `account.gate.upgrade`, `account.gate.support`, `onboarding.account.title`, và `error.accountNetwork|accountDenied|accountFailed|accountExpired|accountCancelled|accountBusy|accountUnavailable|accountStorage|loginRequired`.

- [ ] **Step 1: Test lỗi**: `LoginGate` nút đăng nhập tắt khi chưa tick đồng ý, bật sau khi tick; bấm gọi `signIn` với ngôn ngữ giao diện; khi `signingIn` hiện "đang chờ" và nút Hủy; lỗi hiện đúng câu theo mã; có liên kết Nâng cấp và Hỗ trợ hoạt động; `SafeBoundary` bắt lỗi con và hiện nút Thử lại; `stepsFor` có `account` ngay sau `terms` ở cả hai nền tảng; `canAdvance("account", true, false) === false`, `(.., true) === true`; khi server báo `login off` (`gate: false` và chưa đăng nhập) bước `account` cho đi tiếp; `start_trial` không còn được gọi ngay sau Điều khoản mà được gọi sau khi đăng nhập thành công hoặc khi bước `account` được bỏ qua do cổng mở; từ điển i18n đủ khóa ở năm ngôn ngữ (test từ điển sẵn có).
- [ ] **Step 2:** `pnpm vitest run` các file trên → FAIL.
- [ ] **Step 3:** Cài; `LoginGate` đặt trong `SafeBoundary`; dùng nút Google chính thức theo hướng dẫn thương hiệu của Google.
- [ ] **Step 4:** `pnpm test && pnpm exec tsc --noEmit`; chạy `scripts/ui-preview` chụp `login-gate` ở 5 ngôn ngữ, sáng/tối, cỡ 960 × 640 và 720 × 480, rồi `check-i18n.mjs` → PASS; xem ảnh bằng mắt.
- [ ] **Step 5: Commit** `feat(ui): màn đăng nhập, bước Onboarding và i18n`.

### Task 14: Cài đặt Tài khoản và banner liên kết

**Files:**
- Create: `src/windows/main/settings/AccountSettings.tsx`, `AccountSettings.test.ts`, `src/windows/main/LinkAccountBanner.tsx`, `LinkAccountBanner.test.ts`
- Modify: `src/windows/main/screens/SettingsScreen.tsx`, `src/windows/main/screens/Home.tsx`, `src/i18n/*.ts`

**Interfaces:** `AccountSettings` hiện email, nút Đăng xuất, nút Xóa tài khoản (hộp xác nhận bằng cách đã dùng cho các thao tác xóa trong Cài đặt). `LinkAccountBanner` hiện khi `plan !== "free"` và `view.state === "anonymous"`: nút "Liên kết tài khoản Google" (gọi `signIn`), nút "Để sau" (ẩn trong phiên làm việc, không lưu cài đặt). Cả hai bị tắt khi phiên đang dịch.

- [ ] **Step 1: Test lỗi**: đăng xuất gọi `account_sign_out`; xóa cần xác nhận rồi gọi `account_delete`; banner chỉ hiện cho gói trả phí chưa đăng nhập; không hiện cho Free; nút tắt khi đang dịch; banner **không** chặn bất kỳ thao tác nào.
- [ ] **Step 2:** `pnpm vitest run` → FAIL.
- [ ] **Step 3:** Cài và thêm khóa i18n năm ngôn ngữ.
- [ ] **Step 4:** `pnpm test && pnpm exec tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(ui): cài đặt tài khoản và banner liên kết`.

---

## Phần D: Pháp lý, tài liệu, phát hành

### Task 15: Pháp lý, spec chính, website

**Files:**
- Modify: `docs/legal/privacy.vi.md`, `privacy.en.md`, `eula.vi.md`, `eula.en.md` (tăng số phiên bản: đọc số hiện tại ở đầu file, chính sách đang 1.13), `src/lib/legal.ts` và `legal.test.ts` nếu giữ số phiên bản, `README.md`, `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (P2, §4.1, §6.8, §10.1, A7, dòng "Sửa ngày 2026-11-05"), `docs/superpowers/specs/2026-10-07-web-admin-design.md`, `website/src/content/{vi,en,ja,zh,ko}/*.mjs`

- [ ] **Step 1: Tìm chỗ phải sửa:** `grep -rIn -i -E "không có tài khoản|không cần tài khoản|no account|without an account|no sign-?in|アカウント(は)?不要|无需账号|无账号|계정 없|계정이 필요 없" website/src docs/legal README.md` → chỉ sửa câu nói về **chính AI Translator**; giữ nguyên câu nói về Teams, Zoom, Meet.
- [ ] **Step 2: Viết test lỗi:** `legal.test.ts` (bản đóng gói trong app khớp `docs/legal`), test website (`website/` có test chặn lộ công nghệ lõi và test nội dung năm ngôn ngữ): thêm kiểm chứng chuỗi cũ "không có tài khoản" (về AI Translator) không còn trong các trang đã sửa. Chạy → FAIL.
- [ ] **Step 3: Sửa văn bản:** chính sách nêu Google Sign-In, dữ liệu nhận (email, mã định danh), mục đích, bên xử lý (Google, Cloudflare), thời gian lưu, quyền xóa và nút Xóa tài khoản trong app; EULA nêu tài khoản; website chỉ nói "đăng nhập bằng Google", không nêu cách cài.
- [ ] **Step 4:** Chạy test pháp lý và test website (cách chạy ở `website/README.md`) → PASS.
- [ ] **Step 5: Commit** `docs: pháp lý, spec chính và website cho đăng nhập Google`.

### Task 16: Runbook phát hành và kiểm tra cuối

**Files:**
- Modify: `docs/release/phat-hanh.md` (mục mới theo spec §11: Google Cloud, secret `GOOGLE_OAUTH_CLIENT_SECRET`, biến `GOOGLE_OAUTH_CLIENT_ID`, thứ tự migration → Worker → admin → app → `ACCOUNT_REQUIRED="on"` → website, cách bật `LOGIN_GATE="off"` khi khẩn cấp)

- [ ] **Step 1:** Viết mục runbook, kèm danh sách **kiểm tay trước phát hành** (spec §9): đăng nhập thật trên Windows và macOS với Chrome, Edge, Safari, Firefox; tài khoản Workspace bị chặn; hủy giữa chừng; đóng app khi đang chờ rồi mở lại; mất mạng sau khi đăng nhập; gói trả phí chưa đăng nhập vẫn dịch; Free chưa đăng nhập bị chặn ở Home, Gõ dịch, Giọng đọc nhưng vẫn vào được Lịch sử, Cài đặt, Nâng cấp; xóa tài khoản; bật `LOGIN_GATE="off"` thì app mở cổng; xuất CSV mở được bằng Excel và Google Sheets.
- [ ] **Step 2: Kiểm tra toàn bộ:** `cargo fmt --check`; `cargo clippy --workspace --all-targets -- -D warnings`; `cargo test --workspace`; ở thư mục gốc `pnpm test`, `pnpm build` (đã gồm `tsc --noEmit`); ở `server/` `pnpm check`; test website. Mọi lệnh phải thoát 0. Dùng skill `superpowers:verification-before-completion` trước khi báo xong.
- [ ] **Step 3: Rà soát cuối:** `git diff --stat main...HEAD -- src-tauri/src/license` chỉ có phần **thêm** (không dòng test cũ nào bị sửa trừ danh sách mã lỗi và tên mục kho khóa); `grep -rn "unwrap()\|expect(" src-tauri/src/account` ngoài `#[cfg(test)]` không có kết quả.
- [ ] **Step 4: Commit** `docs(release): runbook đăng nhập Google`. Báo chủ dự án; **không** merge, push, tag hay deploy khi chưa được cho phép.
