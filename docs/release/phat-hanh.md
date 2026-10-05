# Phát hành AI Translator

Quy trình cho người vận hành (kế hoạch 07b; spec §6.11, §10.2, Q17). Mọi khóa riêng chỉ nằm trong secret của environment
`release` trên GitHub và trong bản sao offline đã mã hóa. Không khóa riêng nào nằm trong repo, trong app, hay trên máy dev.

Ký hiệu: `REPO=dotienphong/ai-translator`. Lệnh `gh` chạy trên máy có mạng, đã `gh auth login` bằng tài khoản có
quyền admin của repo.

## 1. Một lần: khóa production (Q17)

Chuẩn bị: một máy Mac không nối mạng (tắt Wi-Fi, rút cáp) có Node và repo đã `pnpm install`; một USB riêng đặt tên `KHOA`;
giấy và bút. Mỗi khóa một passphrase, ít nhất 6 từ ngẫu nhiên, viết ra giấy, cất riêng với USB.

### 1.1. Khóa ký bản cập nhật (tauri-plugin-updater)

Trên máy không nối mạng:

```bash
pnpm tauri signer generate -w /Volumes/KHOA/updater-<năm>-<tháng>.key
```

Lệnh hỏi passphrase (gõ hai lần). File `.key` là khóa riêng đã mã hóa bằng passphrase đó: đây cũng là bản sao offline. File
`.key.pub` là khóa công khai (một dòng base64).

- Chép nội dung `.key.pub` vào trường `production` của `src-tauri/keys/updater-public-keys.json`, commit
  (`build(release): khóa công khai production của bản cập nhật`).
- Trên máy có mạng, cắm USB:

  ```bash
  gh secret set TAURI_SIGNING_PRIVATE_KEY --env release --repo "$REPO" < /Volumes/KHOA/updater-<năm>-<tháng>.key
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --env release --repo "$REPO"   # gõ passphrase khi được hỏi
  ```

### 1.2. Khóa ký manifest model

Trên máy không nối mạng (kid lấy số thứ tự kế tiếp, không bao giờ dùng lại). Bản rõ của khóa chỉ nằm trên một ổ trong RAM,
không bao giờ ghi xuống SSD hay USB (xóa file trên APFS/SSD không xóa hẳn dữ liệu):

```bash
ram=$(hdiutil attach -nomount ram://32768)          # ổ 16 MB trong RAM
diskutil erasevolume APFS KHOA-RAM $ram
node scripts/models/gen-manifest-key.mjs prod-<năm>-<tháng>-1 --out /Volumes/KHOA-RAM/manifest.jwk
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in /Volumes/KHOA-RAM/manifest.jwk \
  -out /Volumes/KHOA/manifest-prod-<năm>-<tháng>-1.jwk.enc
hdiutil detach $ram                                  # ổ RAM mất hẳn
```

- Dòng `{ "kid", "x" }` mà lệnh đầu in ra: thêm vào mảng `production` của `src-tauri/keys/manifest-public-keys.json`, commit.
- Trên máy có mạng, cắm USB (khóa đi thẳng từ `openssl` vào `gh`, không ghi ra đĩa):

  ```bash
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in /Volumes/KHOA/manifest-prod-<năm>-<tháng>-1.jwk.enc \
    | gh secret set MANIFEST_SIGNING_KEY --env release --repo "$REPO"
  ```

- Kiểm: chạy workflow `Sign model manifest`. Job `sign` tự kiểm chữ ký bằng khóa công khai trong repo; khóa riêng không khớp
  thì job đỏ.
- Lần ký manifest **đầu tiên**: khóa công khai đã nằm trong repo (phải vậy thì job `sign` mới chạy) nhưng chưa có bản nào đã
  phát hành để so, nên tick `first_release` và để trống `previous`. Từ lần hai, `previous` là phần thân của bản đang phát hành
  và `first_release` không tick (job `check` từ chối nếu thiếu `previous`).

### 1.3. Hạ tầng phát hành (R2)

- Một bucket R2 production (ví dụ `ai-translator-releases`) có tên miền công khai (`releases.<tên miền>` khi có T7, trước
  đó là URL `r2.dev` của bucket). Không có bucket staging (spec 2026-10-04: chỉ một môi trường).
- Một API token R2 chỉ có quyền "Object Read & Write" trên đúng bucket production. Nhập vào environment `release`:
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Biến của repo (không bí mật): `RELEASES_BUCKET` (tên bucket),
  `RELEASES_BASE_URL` (URL công khai, ví dụ `https://releases.<tên miền>`).
- Điền URL build sẵn trong app, commit:
  - `src-tauri/src/updater/source.rs`: `PRODUCTION_URL` đúng bằng `RELEASES_BASE_URL`.
  - `src-tauri/src/models/source.rs`: `PRODUCTION_URL` là URL của `models.json` đã ký.
  - `src-tauri/src/license/client.rs` và khối `production` của `src-tauri/keys/license-public-keys.json`: kế hoạch 05 Task 21.
  - `src-tauri/src/navigation.rs`: thêm tên miền website vào `EXTERNAL_HOSTS`.
- Kiểm: `node scripts/release/release-ready.mjs --base-url "<RELEASES_BASE_URL>"` in `đủ cấu hình production`. Job `publish`
  chạy đúng lệnh này và dừng nếu còn thiếu.
- Cổng chống Pro trái phép: `package-macos.sh` và `package-windows.mjs` chạy `node scripts/release/release-check.mjs
  no-dev-gate <file chạy của app>` trước khi ký (macOS: trước `codesign`; kiểm lại ở cả bước build và bước sign). File có chuỗi `AI_TRANSLATOR_DEV_PRO`, `AI_TRANSLATOR_DEV_FREE`
  hay `mt-dev-pro-gate-v1` thì job đỏ, không ký, không đăng (spec 2026-10-04, §3). Gặp lỗi này thì bản đang build là bản
  debug hoặc `[profile.release]` đã bật `debug-assertions`: kiểm `Cargo.toml` rồi build lại, đừng tắt cổng.

## 2. Mỗi lần phát hành

1. Đổi `version` trong `src-tauri/tauri.conf.json`: `X.Y.Z` cho stable, `X.Y.Z-beta.N` cho beta. Commit
   (`chore(release): X.Y.Z`), tạo tag `vX.Y.Z` (hay `vX.Y.Z-beta.N`) đúng commit đó, đẩy tag.
2. Workflow `Release` chạy. Bước đầu của hai job tiến trình phụ kiểm tag khớp `version`. Sáu job có secret chờ duyệt (Review
   deployments): bốn job ký, `update-signatures`, `publish`. Duyệt từng job khi nó tới lượt, sau khi xem log của job trước.
3. Job `publish`:
   - kiểm đủ cấu hình production;
   - từ chối nếu bản này đã đăng: có dấu `<version>/published.json`, hay `latest.json` của kênh đã báo bản này (bản đã
     phát hành không bao giờ bị ghi đè, kể cả sau khi rút; sửa lỗi thì ra bản mới);
     job đứt giữa chừng (một phần file đã lên, `latest.json` chưa đổi) thì bấm "Re-run failed jobs": các file của bản được
     tải lại;
   - tải mọi file của bản lên `<version>/`, rồi mới ghi `latest.json` của kênh.
   - Bản stable vào kênh stable, và vào kênh beta nếu mới hơn bản beta đang có. Bản beta chỉ vào kênh beta.
4. Job `github-release` tạo bản nháp trên GitHub với đủ file. Viết ghi chú phát hành rồi bấm Publish.
5. Kiểm sau khi đăng:
   - `curl -s <RELEASES_BASE_URL>/<kênh>/latest.json` có đúng `version`;
   - tải `.dmg` và `.exe` từ `<RELEASES_BASE_URL>/<version>/`, so SHA-256 với `SHA256SUMS-*.txt`;
   - một máy đang chạy bản trước, cùng kênh: trong vòng 24 giờ (hay mở lại app) thấy lời mời khởi động lại để cập nhật.

### Phát hành lần lượt

Mỗi lần chỉ đẩy một tag, chờ job `publish` của tag đó xong (xanh hay đỏ) rồi mới đẩy tag kế tiếp. Job `publish` của mọi tag
dùng chung một nhóm `concurrency`: GitHub chỉ giữ **một** lần chạy chờ cho mỗi nhóm, nên ba tag đẩy gần nhau thì `publish` của
tag giữa bị hủy ("Canceled … higher priority waiting request"). Bản đó không lên R2, và chạy lại sau sẽ bị từ chối vì không
mới hơn bản đã đăng sau nó; khi đó ra một bản mới.

### Rút một bản đã đăng

Không xóa file trong `<version>/`, nhất là `<version>/published.json`: dấu này làm job `publish` của tag đó từ chối chạy lại,
nên bản đã rút không bị đăng lại dù ai bấm "Re-run" và người duyệt bấm duyệt. Một ngoại lệ: dấu được ghi sau cùng, sau `latest.json`. Nếu job `publish` đỏ đúng ở bước cuối đó thì `latest.json` đã báo bản này nhưng dấu chưa có, và nếu bản bị rút thì job chạy lại sẽ đăng lại được. Khi job `publish` đỏ ở bước cuối, hãy tải tay `<version>/published.json` (version, tag, kênh) lên R2 trước khi làm việc khác. Ghi lại `latest.json` của kênh về bản trước:

```bash
node scripts/release/update-manifest.mjs --version <bản trước> --base-url "$RELEASES_BASE_URL" --dir <file của bản trước> \
  --out /tmp/rut
pnpm -C server exec wrangler r2 object put "$RELEASES_BUCKET/<kênh>/latest.json" --file /tmp/rut/<kênh>/latest.json \
  --content-type application/json --cache-control no-cache --remote
```

Máy đã tải bản bị rút mà chưa cài thì bỏ bản đó ở lần kiểm sau. Máy đã cài thì giữ: phát hành bản sửa với số lớn hơn.

## 3. Đổi khóa và lộ khóa

### Khóa ký bản cập nhật

App chỉ tin một khóa công khai (`production` trong `updater-public-keys.json`), và mỗi kênh chỉ có một `latest.json` cho mọi
máy. Bản cài trên máy chỉ nhận bản cập nhật ký bằng khóa mà nó đang tin.

- **Đổi có kế hoạch:**
  1. Tạo khóa mới như mục 1.1, nhưng chưa đổi secret.
  2. Phát hành bản N mang khóa công khai mới, vẫn ký bằng khóa cũ. Máy cập nhật lên N thì tin khóa mới.
  3. Chờ đủ lâu để phần lớn máy đã lên N (ít nhất 30 ngày và hai lần nhắc trên website).
  4. Đổi hai secret `TAURI_SIGNING_PRIVATE_KEY*` sang khóa mới. Từ bản N+1 ký bằng khóa mới. Máy còn ở bản trước N không cập
     nhật được nữa: phải tải bộ cài mới từ website.
- **Lộ khóa:** kẻ có khóa chỉ đẩy được bản cài giả khi ghi được `latest.json` trên R2 hay chiếm được tên miền. Vẫn làm ngay:
  thu hồi API token R2, đổi token mới, rồi đi theo các bước đổi có kế hoạch với thời gian chờ ngắn nhất, kèm thông báo trên
  website. Đây là giới hạn chấp nhận ở MVP (một khóa, không có danh sách thu hồi).

### Khóa ký manifest model

Theo spec §10.2: manifest có `kid`.

- **Đổi có kế hoạch:** một bản phát hành tin cả `kid` cũ lẫn `kid` mới (hai mục trong `production`). Sau khi bản đó đăng, đổi
  secret `MANIFEST_SIGNING_KEY` sang khóa mới và ký lại manifest. Bản sau bỏ `kid` cũ.
- **Lộ khóa:** phát hành ngay bản app chỉ tin `kid` mới, đổi secret, ký lại manifest. Máy mở app lần đầu sau khi cập nhật cần
  mạng để tải manifest mới trước khi dùng gói đã tải.

### Chứng thư ký mã (Apple, Windows)

Thu hồi ở Apple hay nhà cung cấp chứng thư, lấy chứng thư mới, đổi secret. Tên chủ chứng thư Windows mới khác cũ thì đổi biến
`WINDOWS_SIGNER` và phát hành bản mới (app tự kiểm tên này, kế hoạch 06).

### Bản sao offline

USB `KHOA` giữ: `updater-*.key` (đã mã hóa bằng passphrase của nó), `manifest-*.jwk.enc`. Passphrase ở giấy, cất riêng. Mỗi năm
một lần, trên máy không nối mạng, thử giải mã cả hai (`openssl enc -d …`, `pnpm tauri signer sign` một file bất kỳ) để chắc USB
và passphrase còn dùng được.

## 4. Triển khai license server (production)

Chỉ có một môi trường, production (spec 2026-10-04): hai file cấu hình không có khối `env`, nên **không có `--env` ở lệnh nào**.
Worker API tên `mt-license` (`server/wrangler.jsonc`), Worker admin tên `mt-license-admin` (`server/wrangler.admin.jsonc`), D1
tên `mt-license-production`. Mọi lệnh chạy trong `server/`, trên máy người vận hành đã `wrangler login`; người làm tự nhập
secret, không dán secret vào chat hay file. Các bước này thay Task 21 của kế hoạch 05 (Task 19 và Task 21 cũ dùng `--env`
nên đã lỗi thời; có errata ngay dưới tiêu đề hai task đó).

Ký hiệu: `PROD` là origin của Worker API và `PADMIN` là origin của Worker admin. Khi chưa có tên miền thì
`PROD=https://mt-license.<subdomain>.workers.dev` và `PADMIN=https://mt-license-admin.<subdomain>.workers.dev`
(`<subdomain>` là subdomain workers.dev của tài khoản). Có tên miền (Q1) thì `PROD=https://<tên miền license>`: thêm
`"routes": [{ "pattern": "<tên miền license>", "custom_domain": true }]` và đặt `"workers_dev": false` trong `wrangler.jsonc`,
rồi làm bước 1 và bước 9a của Task 21 cũ (tên miền gửi email trên Resend, luật rate limit cho webhook; luật WAF cần zone nên
không đặt được trên `*.workers.dev`). Khi `EMAIL_FROM` còn là `onboarding@resend.dev` thì Resend chỉ gửi được tới email của
chủ tài khoản Resend: chưa đủ để bán.

1. **Kiểm cấu hình**, rồi tạo D1:

   ```bash
   cd server && pnpm check
   pnpm exec wrangler deploy --dry-run
   pnpm exec wrangler d1 create mt-license-production --location apac --binding DB
   ```

   Expected: `--dry-run: exiting now.` (bảng binding có `env.PLANS` với giá chính thức 50.000 đ, 150.000 đ, 500.000 đ);
   `✅ Successfully created DB 'mt-license-production' in region APAC`.

2. **Chép `database_id` vào CẢ HAI file** `wrangler.jsonc` và `wrangler.admin.jsonc` (dòng `mt-license-production`, đang là toàn
   số 0). Kiểm:

   ```bash
   grep -n '"mt-license-production"' wrangler.jsonc wrangler.admin.jsonc
   ```

   Expected: hai dòng, cùng một `database_id`, khác toàn số 0.

3. **Áp migration**:

   ```bash
   pnpm exec wrangler d1 migrations apply mt-license-production --remote
   ```

   Expected: bảng `Migrations to be applied:` có `0001_init.sql`, trả lời `y`, rồi ✅.

4. **Giữ chỗ số đơn (QĐ18)**, để đơn đầu tiên là 1.000.001:

   ```bash
   pnpm exec wrangler d1 execute mt-license-production --remote --command "INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES (1000000, 'reserved', 'none', 'pro', 0, 'VND', 0, 'failed', 0, 0); DELETE FROM orders WHERE order_code = 1000000;"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS seq, (SELECT COUNT(*) FROM orders) AS orders"
   ```

   Expected: lệnh đầu chạy không lỗi; lệnh sau in `seq` = `1000000` và `orders` = `0`.

5. **Secret của Worker API** (kênh thanh toán PayOS của production). Lệnh đầu hỏi tạo Worker `mt-license`: trả lời `y`.

   ```bash
   pnpm exec wrangler secret put PAYOS_CLIENT_ID
   pnpm exec wrangler secret put PAYOS_API_KEY
   pnpm exec wrangler secret put PAYOS_CHECKSUM_KEY
   pnpm exec wrangler secret put RESEND_API_KEY
   pnpm exec wrangler secret put OPERATOR_EMAIL
   openssl rand -base64 32 | pnpm exec wrangler secret put RATE_LIMIT_PEPPER
   ```

   Expected: mỗi lệnh kết thúc bằng `✨ Success! Uploaded secret <TÊN>`. `OPERATOR_EMAIL` không bắt buộc; thiếu thì cảnh báo
   chỉ nằm trong log.

6. **Hai khóa ký token** (khóa riêng đi thẳng vào secret, không ra terminal, không ra file; nếu đã có CI thì tạo trong một job
   CI chạy tay thay vì trên máy dev, Q11). `<năm>` và `<tháng>` là hôm nay, ví dụ `prod-2026-10-1`; số thứ tự là số kế tiếp
   chưa từng dùng (script từ chối `kid` không đúng dạng `prod-<năm>-<tháng>-<n>` hay đã có trong `keys/public-keys.json`):

   ```bash
   node scripts/gen-token-key.mjs prod-<năm>-<tháng>-1 | pnpm exec wrangler secret put TOKEN_SIGNING_KEY_A
   node scripts/gen-token-key.mjs prod-<năm>-<tháng>-2 | pnpm exec wrangler secret put TOKEN_SIGNING_KEY_B
   ```

   Expected: mỗi lệnh in một dòng khóa công khai `{"kid":"prod-…","x":"…"}` (stderr), rồi
   `✨ Success! Uploaded secret TOKEN_SIGNING_KEY_A` (rồi `_B`). Chép lại hai giá trị `x`.

7. **Khóa công khai.** Tạo `server/keys/public-keys.json` (nếu chưa có) với khối `production`:

   ```json
   {
     "production": {
       "a": { "kid": "prod-<năm>-<tháng>-1", "x": "<x của ô A>" },
       "b": { "kid": "prod-<năm>-<tháng>-2", "x": "<x của ô B>" }
     }
   }
   ```

   ```bash
   node -e 'const k=require("./keys/public-keys.json");for(const [r,v] of Object.entries(k.production))console.log(r,v.kid,Buffer.from(v.x,"base64url").length)'
   ```

   Expected: `a prod-…-1 32` và `b prod-…-2 32`. Ô B được kiểm bằng ký thử ở bước 11, ô A bằng token thật ở bước 12.

8. **Secret của Worker admin** (chỉ bốn secret này; Worker admin gọi Worker API qua service binding `API`):

   ```bash
   pnpm exec wrangler secret put PAYOS_CLIENT_ID -c wrangler.admin.jsonc
   pnpm exec wrangler secret put PAYOS_API_KEY -c wrangler.admin.jsonc
   pnpm exec wrangler secret put PAYOS_CHECKSUM_KEY -c wrangler.admin.jsonc
   pnpm exec wrangler secret put RESEND_API_KEY -c wrangler.admin.jsonc
   ```

   Expected: như bước 5, với Worker `mt-license-admin`.

9. **Deploy Worker API trước** (Worker admin có service binding tới nó):

   ```bash
   pnpm check && pnpm exec wrangler deploy
   curl -s "$PROD/v1/health"; echo
   ```

   Expected: `Uploaded mt-license`, `Deployed mt-license triggers`, `schedule: */5 * * * *`; `curl` in `{"ok":true}`. Workers
   Issues đã bật trong cấu hình; thêm automation nhận cảnh báo nếu có kênh nhận.

10. **Deploy Worker admin, bật Access.**

    ```bash
    pnpm exec wrangler deploy -c wrangler.admin.jsonc
    ```

    Expected: URL `https://mt-license-admin.<subdomain>.workers.dev`. Rồi:
    - Dashboard > Workers & Pages > `mt-license-admin` > tab Access > Protect this Worker behind Access > **All traffic**;
      Authentication policy chọn "Cloudflare account" (hoặc Email domain của người vận hành) > Apply Access. Mở
      `$PADMIN/admin/whoami` trong trình duyệt, đăng nhập: trang hiện `{"error":"forbidden"}` (chưa có `ACCESS_AUD`, fail
      closed, QĐ6).
    - Zero Trust > Access controls > Applications > ứng dụng của `mt-license-admin` > Configure > Advanced settings > Cookie
      settings: **SameSite Lax** (không chọn Strict), **HttpOnly bật**, **Binding Cookie bật**; Save. Nếu
      `cloudflared access curl` hỏng sau đó thì tắt Binding Cookie và ghi là rủi ro chấp nhận (QĐ30).
    - Chép "Application Audience (AUD) Tag" của ứng dụng đó. Trong `vars` của `wrangler.admin.jsonc`: `ACCESS_AUD` là AUD tag
      vừa chép, `API_ORIGIN` là `$PROD` (không có `/` ở cuối).

    ```bash
    pnpm exec wrangler deploy -c wrangler.admin.jsonc
    curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/admin/whoami"
    ```

    Expected: `302`, `401` hoặc `403`, không bao giờ `200`; trong trình duyệt sau khi đăng nhập Access:
    `{"operator":"<email của bạn>"}`; `cloudflared access login "$PADMIN" && cloudflared access curl "$PADMIN/admin/whoami"`
    cũng in `{"operator":"<email của bạn>"}`; không có `ERR_TOO_MANY_REDIRECTS`.

11. **Đăng ký webhook với PayOS**, rồi ký thử bằng khóa dự phòng (QĐ31):

    ```bash
    cloudflared access login "$PADMIN"
    cloudflared access curl "$PADMIN/admin/payos/confirm-webhook" -X POST -H 'content-type: application/json' \
      -d "{\"webhook_url\":\"$PROD/v1/webhooks/payos\"}"; echo
    cloudflared access curl "$PADMIN/admin/keys/test-sign" -X POST -H 'content-type: application/json' -d '{}' | node scripts/verify-token.mjs production
    ```

    Expected: `{"ok":true,"webhook_url":"…/v1/webhooks/payos"}` và kênh production trên my.payos.vn hiện đúng Webhook URL;
    `OK production b prod-<năm>-<tháng>-2`.

12. **Giao dịch thật đầu tiên**: chủ dự án mua một gói ở giá thật (Task 20, Step 1 tới 4 với `$PROD`); đơn đầu có
    `"order_code":1000001`, `"amount"` đúng giá chính thức. Kích hoạt một máy giả rồi kiểm token (lệnh ở Task 21, Step 12 cũ,
    không có `--env`). Expected: `OK production a prod-<năm>-<tháng>-1`, `kid` bắt đầu bằng `prod-`.

13. **Điền vào app, commit** (khóa công khai và URL công khai, không bí mật nào):
    - `PRODUCTION_URL` trong `src-tauri/src/license/client.rs` đúng bằng `$PROD` (https, không query, không `/` ở cuối);
    - chép nguyên `server/keys/public-keys.json` vào `src-tauri/keys/license-public-keys.json` (khối `production`, hai ô
      `a`, `b`; test `the_app_copy_matches_the_server_file_when_it_exists` đỏ nếu lệch);
    - `git add server/wrangler.jsonc server/wrangler.admin.jsonc server/keys/public-keys.json src-tauri/src/license/client.rs src-tauri/keys/license-public-keys.json`
      rồi commit. Đổi khóa ký thì app phải tin cả hai `kid` trước khi server đổi ô ký (spec §10.2).

## 5. Bản macOS ký ad-hoc (chưa có Developer ID)

Chưa có Developer ID thì để biến `APPLE_TEAM_ID` của repo **rỗng** và không nạp secret `APPLE_*`. CI tự build app với
`AI_TRANSLATOR_MAC_SIGNING=adhoc` (spec `2026-10-05-macos-adhoc-signing-design.md`), ký ad-hoc, bỏ qua notarize, và ghi dòng
"Bản macOS ký ad-hoc, chưa notarize" vào tóm tắt của lần chạy.

- App ở chế độ này chỉ kiểm chữ ký còn nguyên vẹn và bundle id; gói trả phí chạy được. Lỗi `NotGenuine` thì xem log của app.
- Gatekeeper chặn lần mở đầu. Hướng dẫn cho khách: kéo app vào Applications, mở một lần (sẽ bị chặn), rồi vào System Settings ›
  Privacy & Security, cuối trang, bấm "Open Anyway" cạnh tên app. Từ macOS 15, bấm chuột phải › Open không còn dùng được.
- **Mỗi bản cập nhật (ký ad-hoc) khiến macOS hỏi lại một lần**: 5 hộp thoại "AI Translator muốn dùng thông tin trong Keychain" (mật khẩu đăng nhập
  Mac) và 1 hộp thoại quyền thu âm thanh hệ thống. Hướng dẫn cho khách (đưa vào ghi chú phát hành): nhập mật khẩu đăng nhập
  rồi bấm **Always Allow** (không bấm Deny); bấm cho phép quyền thu âm khi được hỏi. Sau đó các lần mở sau không hỏi nữa; không mất
  dữ liệu hay gói (đã đo, `bench/phase1/results/gd1_adhoc_keychain.md`). Chỉ hết khi có Developer ID (Team ID cho danh tính ổn định).
- Có Developer ID thì đặt `APPLE_TEAM_ID` và các secret `APPLE_*` (mục 3, "Chứng thư ký mã"); không phải sửa code. Biến
  `APPLE_TEAM_ID` có giá trị thì app về chế độ chặt (yêu cầu đúng Team ID). **Đặt `APPLE_TEAM_ID` mà vẫn ký ad-hoc thì bản đó
  bị coi là không chính hãng và chỉ chạy Free**, nên đặt cùng lúc với secret chứng thư.
- Tạm đặt `APPLE_TEAM_ID` sai dạng cũng khóa (không tự hạ xuống chế độ ad-hoc), để lỗi cấu hình lộ ra ngay.
