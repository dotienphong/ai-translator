# Đăng nhập bằng Google (thiết kế)

Ngày 2026-11-05. Trạng thái: **chờ chủ dự án duyệt bản viết** (thiết kế bằng lời đã được duyệt cùng ngày). Phạm vi: license server (`server/`), app (`src-tauri/src/account/` mới, `license/`, `src/`), Web Admin (`server/admin-ui/`), tài liệu pháp lý (`docs/legal/`), website.

Spec này **sửa** hai chỗ của `2026-09-29-desktop-meeting-translator-design.md`: quyết định P2 ("Không có tài khoản đăng nhập") và §10.1 ("App không có tài khoản đăng nhập"). Các chỗ cần sửa theo ở mục 10.

## 1. Vấn đề và mục tiêu

- App hiện không có tài khoản. Bản quyền gắn với license key và mã băm ID máy; dùng thử Free gắn với mã băm ID máy. Email chỉ có khi khách mua gói.
- Số liệu production ngày 2026-11-05 (chỉ đếm): 90 máy đã đăng ký dùng thử (56 còn hạn, 34 đã hết), 13 license (cả 13 có email, cả 13 đang kích hoạt), **77 máy chỉ dùng thử và chưa có email nào**.
- Chủ dự án muốn có email của mọi người dùng để quản lý được cả user cũ lẫn user mới.

**Mục tiêu:** mọi người dùng Free (mới và cũ) phải đăng nhập bằng Google để dùng tiếp; email lưu ở D1 và quản lý được ở Web Admin. Người đã mua gói không bị chặn. Đăng nhập một lần, dùng offline như cũ.

**Tiêu chí thành công:**
- Máy Free chưa đăng nhập không bắt đầu được phiên; đăng nhập xong bắt đầu được ngay, số ngày dùng thử không đổi.
- Máy đang ở gói trả phí còn hạn không bao giờ bị chặn vì chưa đăng nhập.
- Mỗi tài khoản Google chỉ có một lần dùng thử 10 ngày, kể cả khi cài trên máy khác.
- App vẫn chỉ nói chuyện với `api.aitranslator.vn` (A7); trong lúc dịch không có thêm request nào.
- Không có bí mật nào trong app (CLAUDE.md, spec §10.2).

## 2. Quyết định đã chốt

| Mã | Chủ đề | Quyết định |
| --- | --- | --- |
| L1 | Nhà cung cấp | Chỉ Google, scope `openid email` (không xin `profile`: không lấy tên, ảnh). Không Apple, Microsoft, Facebook. App phát hành ngoài Mac App Store nên không vướng yêu cầu "Đăng nhập bằng Apple" của App Store (suy luận, chưa kiểm tài liệu Apple). |
| L2 | Cách đăng nhập | **License server làm bên đăng nhập**: Worker là client OAuth loại "Web application" của Google, giữ client secret; app chỉ mở trình duyệt hệ thống rồi hỏi kết quả (cùng kiểu `order_token`). App không giữ token Google nào, không mở cổng localhost, không thêm crate hay plugin. |
| L3 | User mới | Bắt buộc đăng nhập trước khi đăng ký dùng thử (bước mới sau Điều khoản, §6). |
| L4 | User cũ | **Chính sách B (chủ dự án chốt 2026-11-05):** máy Free chưa đăng nhập phải đăng nhập ngay khi mở bản mới để tiếp tục dùng các ngày còn lại của 10 ngày dùng thử. Số ngày không đổi (`ends_at` giữ nguyên). Phiên đang dịch không bị ngắt. |
| L5 | Người đã mua | Không chặn. Banner "Liên kết tài khoản Google". Server ghép license vào tài khoản bằng key đang kích hoạt trên máy, không cần trùng email. |
| L6 | Dùng thử | Mỗi **tài khoản** một lần dùng thử (thêm vào luật mỗi máy một lần, không thay luật cũ). |
| L7 | Lưu email | Bảng `accounts` ở D1 `mt-license-production`. Không lưu tên, ảnh, token Google. |
| L8 | Quản lý | Trang **Tài khoản** ở Web Admin: danh sách, tìm theo email, lọc, xuất CSV. |
| L9 | Email quảng bá | **Ngoài phạm vi.** Ô đồng ý chỉ cho việc tạo tài khoản và liên hệ về dịch vụ (key, nhắc hết hạn, hỗ trợ). Muốn gửi quảng bá thì làm spec riêng với ô đồng ý riêng, không tích sẵn. (Chủ dự án chưa trả lời câu này; spec lấy mặc định ít rủi ro nhất.) |
| L11 | An toàn | **Công tắc khẩn cấp** (thêm ngày 2026-11-05 theo yêu cầu "không được làm hỏng tính năng cốt lõi"): biến `LOGIN_GATE` của server (`"on"` mặc định, `"off"` tắt) và endpoint `GET /v1/auth/status`. Khi server báo `off` (hoặc chưa cấu hình Google), cổng đăng nhập của app **mở**: mọi người dùng dịch như cũ. Mất mạng thì cổng giữ nguyên (cần mạng một lần, như dùng thử hiện nay). |
| L10 | Tương thích | Máy đã có dòng trong `trials` không bị server chặn khi dùng bản cũ (≤ 0.6.8). Máy mới từ bản cũ bị từ chối khi `ACCOUNT_REQUIRED=on` (§5.4). |

## 3. Kiến trúc và luồng

```
App ──(1) POST /v1/auth/google/start {device_id_hash, challenge, consent}──► Worker  (ghi login_attempts)
App ◄── {login_id, login_url} ──────────────────────────────────────────── Worker
App ──(2) mở login_url bằng trình duyệt hệ thống ──► accounts.google.com ──► người dùng chọn tài khoản
Google ──(3) 302 ► https://api.aitranslator.vn/v1/auth/google/callback?code&state ──► Worker
Worker ──(4) đổi code lấy id_token (kèm client secret + PKCE), kiểm id_token, ghi accounts, đóng login_attempts──► trang "Xong, quay lại app"
App ──(5) POST /v1/auth/poll {login_id, verifier} mỗi 3 giây, tối đa 10 phút──► Worker
App ◄── {token tài khoản} (một lần duy nhất) ──────────────────────────────── Worker
App ──(6) POST /v1/trial (kèm Bearer token tài khoản) ──► Worker (gắn account_id vào trials)
```

- `challenge` = SHA-256 (base64url) của `verifier` ngẫu nhiên 32 byte do app sinh; `verifier` chỉ ở trong RAM của app và gửi lại ở bước (5). Kẻ chặn được `login_id` không lấy được token.
- Token tài khoản chỉ đi trong phản hồi của bước (5) qua HTTPS, không bao giờ nằm trong URL. Trang callback không chứa token hay email.
- Mọi request của app tới `api.aitranslator.vn` (host đã có trong A7). Trình duyệt hệ thống mới nói chuyện với `accounts.google.com`, không phải app.
- Cloudflare đã bật `redact_query_string` và tắt invocation log (`wrangler.jsonc`), nên `code` và `state` ở URL callback không lọt vào log.

## 4. Mô hình dữ liệu (migration `0010_accounts.sql`)

Dùng `ALTER TABLE ... ADD COLUMN` (không dựng lại bảng như migration 0002, vì chỉ thêm cột cho phép NULL).

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,              -- UUID
  google_sub TEXT NOT NULL UNIQUE,  -- định danh ổn định của tài khoản Google (không dùng email làm khóa)
  email TEXT,                       -- NULL sau khi xóa tài khoản hay ẩn danh theo email
  email_verified INTEGER NOT NULL,  -- luôn 1: server từ chối id_token chưa xác minh email
  consent_at INTEGER NOT NULL,      -- lúc người dùng tick đồng ý ở màn đăng nhập (giây Unix)
  lang TEXT,                        -- ngôn ngữ giao diện lúc đăng nhập, để gửi thư đúng ngôn ngữ (như orders.lang)
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  trial_started_at INTEGER,         -- mốc dùng thử của tài khoản (luật mỗi tài khoản một lần, §5.3); NULL là chưa dùng thử
  trial_ends_at INTEGER,            -- giữ nguyên cả khi xóa tài khoản (§5.5)
  deleted_at INTEGER                -- NULL là còn hoạt động
);
CREATE INDEX accounts_email ON accounts (email);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,              -- login_id (UUID), app giữ
  state_hash TEXT NOT NULL,         -- SHA-256 của state gửi cho Google; không lưu state gốc
  nonce_hash TEXT NOT NULL,
  challenge TEXT NOT NULL,          -- challenge của app (bước 1)
  code_verifier TEXT NOT NULL,  -- PKCE phía Worker↔Google, lưu thẳng; đặt '' khi status rời pending
  device_id_hash TEXT NOT NULL,
  consent_at INTEGER NOT NULL,
  lang TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','done','denied','failed','claimed')),
  account_id TEXT REFERENCES accounts (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL       -- created_at + 10 phút
);
CREATE INDEX login_attempts_expires ON login_attempts (expires_at);

ALTER TABLE trials ADD COLUMN account_id TEXT REFERENCES accounts (id);
ALTER TABLE licenses ADD COLUMN account_id TEXT REFERENCES accounts (id);
CREATE INDEX trials_account ON trials (account_id);
CREATE INDEX licenses_account ON licenses (account_id);
```

- `login_attempts` dọn bằng cron sẵn có sau 1 ngày (cùng chỗ dọn `rate_limits`). Bản `claimed` giữ đến lúc dọn, không chứa thông tin cá nhân.
- `licenses.email` và `orders.email` giữ nguyên (email lúc mua). Email của tài khoản là cột riêng; Web Admin hiện cả hai.
- `code_verifier` là PKCE giữa Worker và Google, lưu thẳng; bản ghi sống tối đa 10 phút và chỉ Worker đọc được. Cột được đặt về `''` ngay khi `status` rời `pending` hoặc khi lượt đăng nhập hết hạn lúc có người gọi callback.

## 5. License server

### 5.1 Endpoint mới

| Endpoint | Việc |
| --- | --- |
| `POST /v1/auth/google/start` `{device_id_hash, challenge, consent: true, lang?}` | `consent` thiếu hay không phải `true` thì `400`. Tạo `login_attempts`, sinh `state`, `nonce`, PKCE. Trả `{login_id, login_url, expires_at}`. `login_url` luôn dạng `https://accounts.google.com/o/oauth2/v2/auth?...` với `redirect_uri` = `https://api.aitranslator.vn/v1/auth/google/callback`, `scope=openid email`, `response_type=code`. Giới hạn theo IP. |
| `GET /v1/auth/google/callback?code&state` (hoặc `?error=…`) | Tra `login_attempts` theo `state_hash`; không có, hết hạn hay không còn `pending` thì trang lỗi, không gọi Google. Đổi `code` tại `https://oauth2.googleapis.com/token` (client secret, PKCE). Kiểm `id_token`: chữ ký theo JWKS của Google, `iss` là `accounts.google.com` hoặc `https://accounts.google.com`, `aud` là client ID của sản phẩm, `exp`, `nonce`, `email_verified` là `true`. Sai một điều thì `failed`. Đúng thì tạo hay cập nhật `accounts` theo `google_sub` (cập nhật `email`, `last_login_at`; không tạo lại tài khoản đã `deleted_at` mà khôi phục theo luật mục 5.5), đặt `status = done`. Trả trang HTML ngắn theo `lang` (vi, en, ja, zh, ko), `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. Người dùng bấm Từ chối (`error=access_denied`) thì `denied`. |
| `POST /v1/auth/poll` `{login_id, verifier}` | Kiểm `SHA-256(verifier) == challenge`. `pending` thì `{status: "pending"}`; `done` thì ký và trả `{status: "done", token, email}` **một lần**, đặt `claimed`; `denied`, `failed`, `expired` trả mã tương ứng. Sai `verifier` thì `404` như không tồn tại. |
| `POST /v1/account/link-license` (Bearer token tài khoản) `{key, activation_id}` | Chỉ khi activation đang kích hoạt, chưa gỡ và `device_id_hash` khớp token. Đặt `licenses.account_id`. License đã gắn tài khoản **khác** thì `409 license_linked_other_account`, không đổi (người vận hành gỡ gắn ở Web Admin). Idempotent với cùng tài khoản. |
| `POST /v1/account/delete` (Bearer) | Xóa tài khoản (mục 5.5). |

`POST /v1/trial` thêm header tùy chọn `Authorization: Bearer <token tài khoản>` (mục 5.3).

### 5.2 Token tài khoản

- Cùng định dạng `v1`, cùng khóa ký và `kid` với token bản quyền và token dùng thử (`server/src/token.ts`). Claims: `typ` = `"account"`, `kid`, `account_id`, `device_id_hash`, `issued_at`. Không có hạn dùng: hiệu lực kết thúc khi tài khoản bị xóa (server kiểm ở mọi endpoint nhận token) hay người dùng đăng xuất (app xóa token).
- Bộ kiểm token bản quyền và token dùng thử hiện từ chối `typ` lạ (token bản quyền) hay `typ` khác `"trial"` (token dùng thử), nên không nhầm lẫn. Thêm `verifyAccountToken` đòi `typ === "account"` và đủ claims, kèm vector kiểm chung `server/test/vectors/token-account-v1.json` (như `token-v1.json`) để Rust và TypeScript cùng chạy.
- Token gắn `device_id_hash`: chép sang máy khác thì app từ chối (`wrong_device`), như token dùng thử.

### 5.3 Luật dùng thử theo tài khoản

Trong `POST /v1/trial`:
1. **Không có Bearer**: như hiện nay nếu `ACCOUNT_REQUIRED` không phải `on`. Khi `ACCOUNT_REQUIRED=on`: máy **đã có** dòng trong `trials` vẫn nhận token như cũ (để bản cũ ≤ 0.6.8 không gãy); máy **mới** nhận `401 account_required`.
2. **Có Bearer hợp lệ, máy đã có dòng trong `trials`**: đặt `trials.account_id` nếu đang NULL (đang gắn tài khoản khác thì giữ nguyên, không gắn đè). Không đổi `started_at`, `ends_at` của máy. Nếu `accounts.trial_started_at` đang NULL thì ghi mốc của máy này vào đó; đã có thì giữ mốc cũ (mốc của tài khoản không bao giờ dời).
3. **Có Bearer hợp lệ, máy mới**: nếu `accounts.trial_started_at` đã có (tài khoản đã dùng thử ở máy khác, kể cả đã hết hạn) thì dòng `trials` mới lấy đúng `started_at` và `ends_at` của tài khoản, không mở thêm 10 ngày. Nếu chưa có thì tạo bình thường (`TRIAL_DAYS`) và ghi mốc vào tài khoản. Cả hai trường hợp đặt `account_id`.
4. Token dùng thử trả về **không đổi định dạng** (5 trường, `typ: "trial"`), nên bản cũ vẫn đọc được.

### 5.4 Cờ phát hành

Biến `ACCOUNT_REQUIRED` ở `wrangler.jsonc`, mặc định `"off"`. Đặt `"on"` **sau khi** bản app có đăng nhập đã phát hành (cùng kiểu `CREEM_AUTO_RENEW`). Trước đó endpoint `/v1/auth/*` và `/v1/account/*` đã chạy nhưng không ai bị bắt buộc.

### 5.4b Công tắc khẩn cấp

`GET /v1/auth/status` (không cần token, không ghi D1, không giới hạn theo D1) trả `{"login": "on"}` hoặc `{"login": "off"}`. `off` khi `LOGIN_GATE === "off"` hoặc thiếu `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`. App hỏi endpoint này ở nền khi cần hiện cổng (không bao giờ trên đường bắt đầu phiên dịch); chỉ trả lời `off` rõ ràng mới mở cổng. Lỗi mạng hay `5xx` không mở cổng, để chặn mạng không thành cách lách. Muốn khẩn cấp mở cổng cho mọi người: đặt `LOGIN_GATE="off"` rồi deploy.

### 5.5 Xóa tài khoản

- Người dùng xóa trong app hoặc người vận hành xóa ở Web Admin: `email = NULL`, `deleted_at = now`, `licenses.account_id` và `trials.account_id` về NULL. **Giữ `google_sub`, `trial_started_at`, `trial_ends_at`** để chống lách "mỗi tài khoản một lần dùng thử" bằng cách xóa rồi đăng nhập lại. Đăng nhập lại cùng `google_sub` thì khôi phục dòng cũ: giữ `created_at` và mốc dùng thử, đặt lại `email`, `consent_at`, xóa `deleted_at`.
- Giữ `google_sub` giống cách spec §10.1 đã chọn cho `device_id_hash`: dữ liệu bí danh, giữ cho mục đích chống lạm dụng. **Cần luật sư xác nhận cùng mục §15** của spec chính.
- Thao tác admin "xóa hoặc ẩn danh theo email" (spec §6.8) mở rộng: tìm cả `accounts.email`, áp cùng luật này.

### 5.6 Giới hạn tần suất

Thêm vào `LIMITS` (`server/src/ratelimit.ts`), con số khởi điểm, kế hoạch chốt: `auth_start_ip: 20`, `auth_callback_ip: 60`, `account_ip: 30` mỗi giờ. Hỏi kết quả (`/v1/auth/poll`) dùng binding Rate Limiting như `SUPPORT_POLL_LIMITER` (không ghi D1 mỗi lần hỏi), theo `login_id`. Chạm trần toàn hệ thống của `auth_start` thì cảnh báo `auth_flood` (bảng `ops_alerts` sẵn có).

### 5.7 Cấu hình và secret

- Biến (không bí mật): `GOOGLE_OAUTH_CLIENT_ID`, `ACCOUNT_REQUIRED`.
- Secret mới: `GOOGLE_OAUTH_CLIENT_SECRET`; thêm vào `secrets.required` của `wrangler.jsonc` và cập nhật test khóa cấu hình (`test/node/wrangler-config.test.mjs`).
- Redirect URI đăng ký ở Google Cloud: đúng `https://api.aitranslator.vn/v1/auth/google/callback`. Không đăng ký tên miền cũ `api.aitranslator.io.vn`: đăng nhập chỉ có từ bản app mới, bản app mới gọi tên miền mới.
- JWKS của Google lấy bằng `fetch`, cache theo `Cache-Control` của phản hồi; lỗi lấy JWKS thì `failed` (khách thử lại), không bỏ qua kiểm chữ ký.
- Gọi Google qua một interface `GoogleAuth` trong `Deps` (như `PaymentProvider`), để test dùng bản giả.

## 6. App

### 6.1 Module mới `src-tauri/src/account/`

- `client.rs`: `start`, `poll`, `link_license`, `delete` (reqwest như `license/client.rs`, cùng xử lý lỗi và `Retry-After`).
- `token.rs`: kiểm token tài khoản bằng cùng khóa công khai (`license/keys.rs`), cùng vector với server.
- `manager.rs`: trạng thái `Account { Anonymous, SigningIn, SignedIn { email }, Unavailable(code) }`, vòng hỏi kết quả (3 giây một lần, tối đa 10 phút, hủy được), lưu token ở kho khóa (mục `ACCOUNT` mới trong `license/store.rs`, **giữ qua "Xóa toàn bộ dữ liệu"** như token dùng thử).
- Mở trình duyệt: `system::open_external_url`. App **chỉ mở** URL do server trả khi host là `accounts.google.com` và đường dẫn là `/o/oauth2/v2/auth` (kiểm trong Rust, như bộ kiểm link Creem); thêm `accounts.google.com` vào `EXTERNAL_HOSTS` của `navigation.rs`.
- Lệnh IPC cho cửa sổ chính: `get_account_view`, `account_sign_in`, `account_cancel_sign_in`, `account_sign_out`, `account_delete`; sự kiện `account-changed`. Cấp quyền trong `capabilities/main.json` và cập nhật `acl_tests.rs`. Không cửa sổ nào khác được cấp.

### 6.2 Cổng đăng nhập

- `License::start_block` và `compose_block`: nhánh Free, nếu chưa có token tài khoản hợp lệ cho máy này thì trả `StartBlock::LoginRequired`, **đứng trước** `TrialEnded` và `TrialMissing`. Máy ở gói trả phí còn hiệu lực không bao giờ nhận `LoginRequired`. Phiên đang chạy khi cổng bật không bị ngắt (luật "phiên đang chạy được chạy hết" sẵn có).
- Đăng ký dùng thử (`register_trial`, `trial_due`) chỉ chạy khi đã có token tài khoản; gọi kèm `Authorization: Bearer`. Sau đăng nhập, máy đã có token dùng thử vẫn gọi `POST /v1/trial` một lần để gắn `account_id` (idempotent, mục 5.3).
- Sau đăng nhập, nếu máy có license đang kích hoạt thì gọi `link-license` ngầm (lỗi mạng thì thử lại ở nhịp kiểm định kỳ).
- Không gọi server về tài khoản trong lúc đang dịch (A7): nút đăng nhập và liên kết tắt khi phiên đang chạy.

### 6.3 Giao diện

- **Màn `LoginGate`** (toàn cửa sổ chính, khi `LoginRequired`): giải thích ngắn vì sao cần đăng nhập, ô đồng ý xử lý email (bắt buộc tick), nút Đăng nhập bằng Google, trạng thái "Đang chờ bạn đăng nhập trên trình duyệt" kèm Hủy, thông báo lỗi theo mã. Hai liên kết nhỏ cho **Nâng cấp** và **Hỗ trợ** vẫn dùng được từ màn này (mua gói không cần đăng nhập). Dùng bộ nút chính thức của Google từ trang hướng dẫn thương hiệu của họ, không tự vẽ biểu tượng.
- **Onboarding** (`src/lib/onboardingSteps.ts`): thêm bước `account` ngay sau `terms`. Việc đăng ký dùng thử (`allow_trial`) chuyển từ "ngay sau Điều khoản" sang "ngay sau đăng nhập thành công". Cập nhật §4.1 của spec chính.
- **Cài đặt**: nhóm **Tài khoản** hiện email, nút Đăng xuất, nút Xóa tài khoản (có xác nhận). Banner "Liên kết tài khoản Google" cho máy có gói trả phí mà chưa đăng nhập (tắt được, không chặn gì).
- **Offline**: đã đăng nhập thì mọi thứ chạy như cũ. Chưa đăng nhập mà không có mạng thì cổng báo cần kết nối mạng một lần (giống thông báo dùng thử hiện nay).
- i18n đủ vi, en, ja, zh, ko (`src/i18n/*.ts`, test từ điển sẵn có). Như các lần trước, bản dịch chưa qua người bản ngữ duyệt.

## 7. Web Admin

Worker admin (`server/src/admin*.ts`, `server/admin-ui/`), sau Cloudflare Access như cũ:
- `GET /admin/accounts?q&filter&cursor`: danh sách, tìm theo email (một phần), lọc: *đã mua* (có license còn hạn), *đang dùng thử*, *hết dùng thử*, *đã xóa*. Mỗi dòng: email, ngày tạo, lần đăng nhập gần nhất, số license, số máy, trạng thái dùng thử.
- `GET /admin/accounts/:id`: chi tiết, gồm license đã gắn, máy, dòng `trials`; thao tác **gỡ gắn license** (khi `409 license_linked_other_account`) và **xóa/ẩn danh**.
- `GET /admin/accounts/export.csv`: xuất `email, created_at, last_login_at, plan, trial_ends_at`. Mỗi lần xuất ghi `audit_log`.
- Trang `Tra cứu` hiện sẵn tra theo email mở rộng sang `accounts.email`. Mọi thao tác ghi nhật ký kèm email người vận hành (luật sẵn có).

## 8. Quyền riêng tư và pháp lý

- Ô đồng ý ở màn đăng nhập lưu `consent_at`. Văn bản nêu rõ: lưu email Google, dùng để quản lý tài khoản, key, dùng thử và liên hệ về dịch vụ; **chưa** dùng để quảng bá (L9).
- Thời gian lưu: theo luật hiện hành của spec §10.1, giữ không thời hạn, xóa khi người dùng yêu cầu hoặc tự xóa trong app. Việc giữ `google_sub` sau khi xóa (5.5) và việc giữ không thời hạn cần luật sư xác nhận cùng các mục §15.
- Google Cloud: màn hình đồng ý OAuth loại External, tên "AI Translator", logo, trang chủ và chính sách quyền riêng tư trên `aitranslator.vn`, tên miền được xác minh, **chuyển sang "In production"** và làm **xác minh thương hiệu**. Chỉ xin scope không nhạy cảm (`openid`, `email`), nên không cần xác minh scope nhạy cảm. Các nguồn không thống nhất về việc có màn "chưa xác minh" và trần 100 người dùng áp cho app production chỉ dùng scope cơ bản hay không; kế hoạch coi xác minh thương hiệu là điều kiện trước khi phát hành, không dựa vào suy đoán.
- Chính sách quyền riêng tư và EULA (vi, en; `docs/legal/`) thêm: có tài khoản Google, dữ liệu nhận từ Google (email, mã định danh), mục đích, bên xử lý (Google, Cloudflare), thời gian lưu, quyền xóa. Tăng số phiên bản của hai tài liệu; bản đóng gói trong app và bản trên website phải trùng nhau (test `legal.test.ts` sẵn có).
- Bảng "App chỉ kết nối mạng để…" (spec §10.1, A7) thêm: các endpoint `/v1/auth/*` và `/v1/account/*` của `api.`, chỉ khi người dùng đang ở màn đăng nhập hay vừa đăng nhập, không bao giờ trong lúc dịch.

## 9. Kiểm thử

- **Server (vitest):** start (thiếu `consent`, `challenge` sai dạng); callback với `GoogleAuth` giả (id_token hợp lệ; sai `aud`, `iss`, `nonce`, `exp`; `email_verified` false; `state` lạ, hết hạn, dùng hai lần; người dùng từ chối); poll (đúng và sai `verifier`, lấy token hai lần chỉ được một); luật dùng thử 5.3 (cả bốn nhánh, kể cả tài khoản có dòng dùng thử cũ ở máy khác, và `ACCOUNT_REQUIRED` bật/tắt, máy cũ vẫn nhận token); `link-license` (activation lạ, gỡ rồi, khác máy, khác tài khoản); xóa tài khoản; migration trên DB có dữ liệu thật (13 license, 90 trial); rate limit; vector token tài khoản.
- **Rust:** kiểm token bằng vector chung; máy trạng thái `Account`; `start_block` và `compose_block` (Free chưa đăng nhập → `LoginRequired`; gói trả phí → không bao giờ; thứ tự với `TrialEnded`); chỉ mở URL `accounts.google.com`; ACL của cửa sổ chính; token tài khoản sống qua "Xóa toàn bộ dữ liệu".
- **Giao diện:** Vitest cho store và `LoginGate`; `onboardingSteps` có bước `account`; test từ điển 5 ngôn ngữ; `scripts/ui-preview/check-i18n.mjs` chụp `LoginGate` ở năm ngôn ngữ, sáng và tối, cỡ 960 × 640 và 720 × 480.
- **Web Admin:** test trang Tài khoản và xuất CSV (chuỗi bắt đầu bằng `=`, `+`, `-`, `@` phải được vô hiệu hóa để không thành công thức trong Excel).
- **Chạy tay trước phát hành** (không giả lập được): đăng nhập thật trên Windows và macOS với Chrome, Edge, Safari, Firefox; tài khoản Google Workspace do tổ chức chặn app ngoài; hủy giữa chừng; đóng app khi đang chờ rồi mở lại; mất mạng sau khi đăng nhập; xóa tài khoản; xuất CSV mở được bằng Excel và Google Sheets.
- Cuối kế hoạch: build lại toàn bộ và chạy hết test (Vitest, `cargo test`, `cargo clippy`, test server, test admin-ui, test website).

## 10. Tài liệu phải sửa theo

- Spec chính `2026-09-29-...`: P2 ("Không có tài khoản"), §4.1 (bước mới), §6.8 (thêm API và bảng; luật dùng thử), §10.1 (bảng kết nối mạng, mục Luật Bảo vệ dữ liệu cá nhân), A7. Thêm một dòng "Sửa ngày 2026-11-05" ở đầu như các lần trước.
- `docs/legal/privacy.*.md`, `docs/legal/eula.*.md`; `README.md`.
- Website: mọi chỗ nói **chính AI Translator** không cần tài khoản (không đụng các câu nói về nền tảng họp: "không cần tài khoản trên Teams, Zoom…" vẫn đúng). Tìm bằng `grep` trong `website/src/content/{vi,en,ja,zh,ko}` và sửa đủ các bản ngôn ngữ (quy tắc CLAUDE.md). Nội dung chỉ nói điều có thật, **không nêu công nghệ lõi**; được nói "đăng nhập bằng Google", không nêu cách cài đặt phía sau.
- `docs/release/phat-hanh.md`: thêm mục cấu hình Google Cloud, secret, thứ tự phát hành (mục 11).
- Admin: spec Web Admin `2026-10-07-web-admin-design.md` thêm trang Tài khoản.

## 11. Phát hành (thứ tự)

1. Google Cloud: tạo project, màn hình đồng ý, client "Web application", xác minh tên miền và thương hiệu, "In production".
2. Server: áp migration 0010 **trước** khi deploy Worker mới (như migration 0008); đặt secret `GOOGLE_OAUTH_CLIENT_SECRET`; deploy với `ACCOUNT_REQUIRED="off"`. Bản app cũ không bị ảnh hưởng.
3. Web Admin: deploy trang Tài khoản.
4. App: phát hành bản có đăng nhập (đề xuất **0.7.0**, vì thêm tính năng) theo quy trình phát hành 5 bước. Bản này cũng mang bản pháp lý mới (bản đóng gói trong app).
5. Sau khi bản mới phát hành và kiểm chạy thật với một tài khoản Google thật: đặt `ACCOUNT_REQUIRED="on"`, deploy.
6. Website và chính sách trên website: deploy **cùng ngày** với bước 4 (website chỉ nói điều đã có thật; riêng chính sách quyền riêng tư phải có trước hoặc cùng lúc, vì Google xem trang đó khi xác minh thương hiệu và vì app bắt đầu thu email).
7. Theo dõi 7 ngày: số tài khoản mới, tỉ lệ đăng nhập thất bại theo mã lỗi, phiếu hỗ trợ liên quan, rồi mới xét siết thêm.

Không merge, push, đẩy tag hay deploy khi chủ dự án chưa cho phép.

## 12. Ngoài phạm vi

- Đăng nhập bằng Apple, Microsoft, Facebook; đăng nhập bằng mã gửi qua email (cho người không dùng được Google, ví dụ tài khoản tổ chức chặn app ngoài): cân nhắc làm sau, tái dùng Resend.
- Email quảng bá (L9).
- Gắn nhiều máy vào một license (luật một key một máy không đổi) và tài khoản nhiều thiết bị.
- Đồng bộ cài đặt hay lịch sử theo tài khoản.
- Đổi giá, gói, hạn mức.

## 13. Việc còn mở

- **Luật sư:** giữ `google_sub` sau khi xóa (5.5); giữ email không thời hạn; chuyển dữ liệu ra nước ngoài (Google, Cloudflare) cho dữ liệu tài khoản (cùng mục §15 của spec chính).
- Con số rate limit (5.6): chốt trong kế hoạch (đã chốt: 20/60/30 mỗi giờ theo IP, trần toàn hệ thống `auth_start_global` 600 mỗi giờ). Cách lưu `code_verifier`: lưu thẳng (đã chốt).
- Thời gian bắt buộc cho máy cũ không có mạng: hiện cổng chỉ báo "cần mạng một lần"; nếu chủ dự án muốn nới thì xét sau khi có số liệu.
- Bản 0.6.8 trở xuống vẫn dùng được Free tới hết `ends_at` mà không đăng nhập (L10). Đề xuất chấp nhận khoảng hở này vì người dùng bản cũ sẽ nhận nhắc cập nhật (chủ dự án xác nhận khi duyệt spec); nếu muốn đóng hẳn thì cần thêm cờ từ chối `POST /v1/trial` cho mọi máy chưa gắn tài khoản, sau thời hạn do chủ dự án chọn (phá bản cũ, nên không làm mặc định).
