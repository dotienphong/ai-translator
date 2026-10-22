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
  no-dev-gate <file chạy của app>` trước khi ký (macOS: trước `codesign`; kiểm lại ở cả bước build và bước sign). File có chuỗi `AI_TRANSLATOR_DEV_PRO`, `AI_TRANSLATOR_DEV_FREE`,
  `mt-dev-pro-gate-v1` hay `AI_TRANSLATOR_DEV_REPORTS` (công tắc tự gửi báo cáo lỗi của bản dev, spec 2026-10-17) thì job đỏ, không ký, không đăng (spec 2026-10-04, §3). Gặp lỗi này thì bản đang build là bản
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
(`<subdomain>` là subdomain workers.dev của tài khoản). **Từ 2026-10-08 `PADMIN=https://admin.aitranslator.io.vn`** (custom domain của Worker admin; địa chỉ `workers.dev` của admin đã tắt). Có tên miền (Q1) thì `PROD=https://<tên miền license>`: thêm
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
   pnpm exec wrangler d1 execute mt-license-production --remote --command "INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES (1000000, 'reserved', 'none', 'monthly', 0, 'VND', 0, 'failed', 0, 0); DELETE FROM orders WHERE order_code = 1000000;"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS seq, (SELECT COUNT(*) FROM orders) AS orders"
   ```

   Expected: lệnh đầu chạy không lỗi; lệnh sau in `seq` = `1000000` và `orders` = `0`.

   > **Không bao giờ đưa bộ đếm số đơn về lại 1.000.000 sau khi đã có đơn gửi lên PayOS.** PayOS nhớ mọi `orderCode` đã từng dùng của kênh thanh toán và trả `Đơn thanh toán đã tồn tại` khi gặp lại, nên mọi đơn mới sẽ lỗi `502 payment_provider_error` ("Máy chủ bản quyền chưa xử lý được yêu cầu" trong app) cho tới khi bộ đếm vượt mã cao nhất đã dùng. Xóa dữ liệu thử thì chỉ xóa dòng, **giữ nguyên** `sqlite_sequence` của `orders` (sự cố 2026-10-07: xóa dữ liệu thử rồi reset về 1.000.000, ba đơn đầu lỗi; sửa bằng `UPDATE sqlite_sequence SET seq = <mã cao nhất đã dùng>`).

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

   Từ đợt Creem, `secrets.required` của Worker API còn có `CREEM_API_KEY` và `CREEM_WEBHOOK_SECRET`: thiếu thì `wrangler deploy` ở
   bước 9 từ chối. Đã có tài khoản Creem thì đặt giá trị thật (cách lấy ở mục 9, bước 4 và 5). Chưa có thì đặt **giá trị giữ
   chỗ ngẫu nhiên**:

   ```bash
   openssl rand -hex 32 | pnpm exec wrangler secret put CREEM_API_KEY
   openssl rand -hex 32 | pnpm exec wrangler secret put CREEM_WEBHOOK_SECRET
   ```

   Giữ chỗ an toàn khi `CREEM_PRODUCT_IDS` trong `wrangler.jsonc` còn rỗng (mặc định của repo): server không bán USD
   (`GET /v1/plans` không có giá USD, `POST /v1/checkout` với `currency: "USD"` trả `503`); `/v1/webhooks/creem` vẫn có nhưng
   mọi chữ ký đều sai (`400`, cảnh báo `webhook_bad_signature`). Secret webhook giữ chỗ **phải ngẫu nhiên và dài** như lệnh trên, không
   dùng `x` hay `test`: server tin webhook hoàn tiền theo chữ ký mà không hỏi lại Creem, và server không kiểm độ dài secret.
   Khi có tài khoản Creem thì mục 9 bước 5 ghi đè cả hai bằng giá trị thật.

   Từ đợt chat hỗ trợ (mục 11), `secrets.required` của Worker API còn có `ZALO_BOT_TOKEN`, `ZALO_WEBHOOK_SECRET` và
   `ZALO_OWNER_CHAT_ID`: thiếu thì `wrangler deploy` từ chối. Cách tạo bot, lấy `chat_id` và đặt ba secret ở mục 11, bước 1 đến 3.
   Nếu phải deploy Worker API trước khi có bot (sửa gấp), đặt **giá trị giữ chỗ ngẫu nhiên** cho cả ba
   (`openssl rand -hex 32 | pnpm exec wrangler secret put ZALO_BOT_TOKEN`, tương tự `ZALO_WEBHOOK_SECRET` và `ZALO_OWNER_CHAT_ID`),
   không dùng `x` hay `test`: secret webhook yếu cộng `chat_id` đoán được thì người ngoài giả được chủ dự án. Chat vẫn tắt nên khách
   không gửi được; mục 11 ghi đè bằng giá trị thật.

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

8. **Secret của Worker admin** (chỉ sáu secret này; Worker admin gọi Worker API qua service binding `API`):

   ```bash
   pnpm exec wrangler secret put PAYOS_CLIENT_ID -c wrangler.admin.jsonc
   pnpm exec wrangler secret put PAYOS_API_KEY -c wrangler.admin.jsonc
   pnpm exec wrangler secret put PAYOS_CHECKSUM_KEY -c wrangler.admin.jsonc
   pnpm exec wrangler secret put CREEM_API_KEY -c wrangler.admin.jsonc
   pnpm exec wrangler secret put RESEND_API_KEY -c wrangler.admin.jsonc
   pnpm exec wrangler secret put ADMIN_EMAILS -c wrangler.admin.jsonc
   ```

   `ADMIN_EMAILS`: email đăng nhập Access của người vận hành, nhiều email thì cách nhau bằng dấu phẩy. Thiếu thì Worker admin
   trả 403 cho mọi request (log `admin_denied` lý do `admins_unset`), kể cả khi đã qua Access.

   `CREEM_API_KEY` (từ đợt Creem; `secrets.required` của `wrangler.admin.jsonc` đòi nó): cùng khóa với Worker API (mục 9 bước 5).
   Chưa có tài khoản Creem thì giữ chỗ như bước 5, thay dòng `CREEM_API_KEY` ở trên bằng
   `openssl rand -hex 32 | pnpm exec wrangler secret put CREEM_API_KEY -c wrangler.admin.jsonc`. Worker admin không có
   `CREEM_WEBHOOK_SECRET` (không nhận webhook).

   Expected: như bước 5, với Worker `mt-license-admin`.

9. **Deploy Worker API trước** (Worker admin có service binding tới nó):

   ```bash
   pnpm check && pnpm exec wrangler deploy
   curl -s "$PROD/v1/health"; echo
   ```

   Expected: `Uploaded mt-license`, `Deployed mt-license triggers`, `schedule: */5 * * * *`; `curl` in `{"ok":true}`. Workers
   Issues đã bật trong cấu hình; thêm automation nhận cảnh báo nếu có kênh nhận.

   Kiểm cron chạy thật, vì lịch đã đăng ký vẫn có thể không chạy: `pnpm exec wrangler tail mt-license --format pretty` qua
   một mốc 5 phút. Expected: một sự kiện cron `*/5 * * * *` có log `{"event":"reconcile",…}`. Không thấy thì chạy
   `pnpm exec wrangler triggers deploy` rồi kiểm lại. Sự cố 2026-10-07: lịch còn đăng ký từ 06/10 nhưng cron không chạy (bảng
   `ops_alerts` không được xử lý, không có thư cảnh báo, đối soát đơn và gửi lại thư cũng dừng); `triggers deploy` làm cron
   chạy lại.

10. **Deploy Worker admin, bật Access.** Worker admin phục vụ cả trang Web Admin (spec `2026-10-07-web-admin-design.md`):
    `wrangler deploy -c wrangler.admin.jsonc` đọc thư mục `server/admin-ui/dist` (khối `assets` của `wrangler.admin.jsonc`),
    nên **phải chạy `pnpm ui:build` trước** (trong `server/`); thiếu thư mục này thì lệnh báo lỗi. `pnpm check` ở bước 1 và
    bước 9 đã tự build UI trước `dry-run`.

    ```bash
    pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
    ```

    Expected: URL `https://mt-license-admin.<subdomain>.workers.dev`. Rồi:
    - Dashboard > Workers & Pages > `mt-license-admin` > tab Access > Protect this Worker behind Access > **All traffic**;
      Authentication policy: Include **Emails** = đúng email của người vận hành (không chọn "Cloudflare account" hay "Email
      domain": tài khoản Cloudflare dùng chung, và tên miền email công cộng như gmail.com mở cho mọi người) > Apply Access. Mở
      `$PADMIN/admin/whoami` trong trình duyệt, đăng nhập: trang hiện `{"error":"forbidden"}` (chưa có `ACCESS_AUD`, fail
      closed, QĐ6).
    - Zero Trust > Access controls > Applications > ứng dụng của `mt-license-admin` > Configure > Advanced settings > Cookie
      settings: **SameSite Lax** (không chọn Strict), **HttpOnly bật**, **Binding Cookie bật**; Save. Nếu
      `cloudflared access curl` hỏng sau đó thì tắt Binding Cookie và ghi là rủi ro chấp nhận (QĐ30).
    - Chép "Application Audience (AUD) Tag" của ứng dụng đó. Trong `vars` của `wrangler.admin.jsonc`: `ACCESS_AUD` là AUD tag
      vừa chép, `API_ORIGIN` là `$PROD` (không có `/` ở cuối).
    - `ACCESS_TEAM_DOMAIN` (cũng trong `vars`): tên miền team Access, dạng `<team>.cloudflareaccess.com` (đoạn đầu của địa chỉ
      trang đăng nhập Access, hay Zero Trust > Settings > Custom pages). **Bắt buộc**: Worker admin có Static Assets không nhận
      `ctx.access` (router nội bộ của Cloudflare không chuyển tiếp), nên tự xác thực JWT trong header `Cf-Access-Jwt-Assertion`
      bằng khóa công khai tải từ team này (`src/access-jwt.ts`). Sai hay trống thì mọi request bị 403 (phát hiện 2026-10-08
      khi deploy Web Admin lần đầu: trang chỉ hiện `{"error":"forbidden"}`). Chẩn đoán: `pnpm exec wrangler tail mt-license-admin`,
      mỗi lần từ chối có một dòng `{"event":"admin_denied","reason":…}` (`no_access`, `aud_unset`, `team_unset`, `aud_mismatch`,
      `jwt_*` gồm `jwt_type` cho token org, `jwks_unavailable`, `no_email`, `cross_site`); phản hồi cho trình duyệt vẫn chỉ là `forbidden`.
    - **Tên miền riêng của admin** (`admin.aitranslator.io.vn`, khối `routes` trong `wrangler.admin.jsonc`): deploy xong, Cloudflare
      tự tạo bản ghi DNS và chứng chỉ (1 đến 2 phút). Kiểm từ ngoài: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://admin.aitranslator.io.vn/`
      phải in `302` tới `<team>.cloudflareaccess.com/cdn-cgi/access/login/admin.aitranslator.io.vn?kid=<AUD>` với `kid` bằng
      `ACCESS_AUD`. In `403` (JSON `forbidden`) nghĩa là ứng dụng Access chưa phủ hostname này: Zero Trust > Access controls >
      Applications > ứng dụng của `mt-license-admin` > thêm hostname `admin.aitranslator.io.vn` vào ứng dụng (giữ cùng AUD), hoặc
      nếu ứng dụng không cho sửa thì tạo ứng dụng Self-hosted mới cho hostname đó với cùng policy và cùng Cookie settings
      (SameSite Lax, HttpOnly, Binding Cookie tắt), rồi đặt `ACCESS_AUD` bằng AUD tag của nó và deploy lại. Worker chặn mọi
      request không có JWT hợp lệ (không lộ dữ liệu), nên thứ tự làm không gây rủi ro. Khi tên miền mới chạy ổn: đặt
      `"workers_dev": false` cho admin và deploy lại (đã làm 2026-10-08). **Tắt `workers_dev` thì phải xóa luôn destination
      `mt-license-admin.<subdomain>.workers.dev` (và preview URL) khỏi ứng dụng Access** (Applications > ứng dụng của
      `mt-license-admin` > Configure > Destinations; nút "Protect this Worker behind Access" đã tạo sẵn các destination đó). Nếu còn,
      Access chuyển về địa chỉ đó sau khi đăng nhập (`/cdn-cgi/access/authorized`) và trình duyệt hiện "There is nothing here yet"
      khi phiên 24 giờ hết hạn (gặp 2026-10-09, sửa bằng cách xóa destination, giữ AUD, không phải deploy lại). Kiểm bằng cửa sổ ẩn
      danh: đăng nhập xong địa chỉ cuối phải vẫn là `admin.aitranslator.io.vn`.

    ```bash
    pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
    curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/admin/whoami"
    curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/"
    ```

    Expected: cả hai lệnh `curl` in `302`, `401` hoặc `403`, không bao giờ `200`; trong trình duyệt sau khi đăng nhập Access:
    `{"operator":"<email của bạn>"}`; `cloudflared access login "$PADMIN" && cloudflared access curl "$PADMIN/admin/whoami"`
    cũng in `{"operator":"<email của bạn>"}`; không có `ERR_TOO_MANY_REDIRECTS`.

    Mở `$PADMIN/` trong trình duyệt sau khi đăng nhập Access: trang Web Admin hiện "Việc cần xử lý" và email người vận hành
    ở góc trên (spec `2026-10-07-web-admin-design.md`). Từ đây các thao tác admin làm được trên trang; `cloudflared access curl`
    vẫn dùng được như cũ.

    Web Admin chỉ thêm API đọc và trang web: **không có migration D1 mới và không cần deploy lại Worker API**. Sau mỗi lần
    deploy bản mới, tab Web Admin đang mở có thể báo lỗi tải (tên file đã băm đổi theo bản build); tải lại trang (F5) là đủ.
    Hoàn tác một lần deploy Worker admin: `pnpm exec wrangler rollback -c wrangler.admin.jsonc`.

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
- **Cách cài khuyến nghị cho khách: một dòng lệnh** `curl -fsSL https://aitranslator.io.vn/install.sh | bash` (spec `2026-10-09-macos-curl-install-design.md`, script `website/src/public/install.sh`). File tải bằng `curl` không mang cờ quarantine nên app mở thẳng, không cần Open Anyway. Script đọc `<kênh>/latest.json` rồi tải `<version>/AI Translator_<version>_aarch64.dmg` và `<version>/SHA256SUMS-macos.txt` từ R2, nên **một bản phát hành phải đăng đủ ba thứ đó** (job `publish` đã làm vậy) và không được đổi tên file; `website/test/install-script.test.mjs` khóa hợp đồng này. Sau mỗi lần đăng bản mới, kiểm: `curl -fsSL https://aitranslator.io.vn/install.sh | AI_TRANSLATOR_NO_OPEN=1 bash` trên một Mac sạch (hay chạy với `AI_TRANSLATOR_INSTALL_DIR=/tmp/x`). Có Developer ID + notarize thì lệnh vẫn chạy, nhưng có thể thêm nút tải .dmg trực tiếp.
- File .dmg tải bằng trình duyệt (hay gửi qua email) vẫn bị Gatekeeper chặn lần mở đầu. Hướng dẫn cho khách: kéo app vào Applications, mở một lần (sẽ bị chặn), rồi vào System Settings ›
  Privacy & Security, cuối trang, bấm "Open Anyway" cạnh tên app. Từ macOS 15, bấm chuột phải › Open không còn dùng được.
- **Từ bản có kho khóa qua `/usr/bin/security` (spec `2026-10-20-macos-keychain-security-cli-design.md`) cập nhật không còn hộp thoại Keychain**; còn 1 hộp thoại quyền thu âm (quyền Trợ năng của Gõ dịch vẫn phải bật lại). Riêng lần cập nhật đầu tiên từ bản cũ lên bản có kho này còn 1 hộp thoại Keychain (app đọc mục `vault` cũ để chép sang), các lần sau không hỏi. **Cơ chế đã đo (`bench/2026-10-20-keychain-security-cli/`, mới trên macOS 26.6.2: chạy lại bộ đo ở macOS 14.x trước khi phát hành) nhưng chưa đo trên hai bản phát hành thật**: sau bản đầu tiên có thay đổi này, cập nhật bản cũ → bản đó rồi → bản kế tiếp và đếm hộp thoại; chỉ sau số đo đó mới sửa lời trên website (spec mục 7). Gạch đầu dòng ngay bên dưới mô tả các bản cũ hơn.
- **Từ bản gộp Keychain (spec `2026-10-09-macos-update-prompts-research.md`, lựa chọn B) mỗi lần cập nhật chỉ còn 1 hộp thoại Keychain** (mọi giá trị nằm trong một mục `vault`) **cộng 1 hộp thoại quyền thu âm**; lần cập nhật đầu tiên từ bản cũ (chưa gộp) lên bản gộp hỏi 5 hộp thoại vì app phải đọc từng mục riêng cũ để chép sang (đã đo 2026-10-09: 5, rồi ký lại hai lần đều chỉ còn 1). Phần dưới đây là mô tả của bản cũ (5 hộp thoại), giữ lại để hiểu nguồn gốc. **Mỗi bản cập nhật (ký ad-hoc) khiến macOS hỏi lại một lần**: 5 hộp thoại "AI Translator muốn dùng thông tin trong Keychain" (mật khẩu đăng nhập
  Mac) và 1 hộp thoại quyền thu âm thanh hệ thống. Hướng dẫn cho khách (đưa vào ghi chú phát hành): nhập mật khẩu đăng nhập
  rồi bấm **Always Allow** (không bấm Deny); bấm cho phép quyền thu âm khi được hỏi. Sau đó các lần mở sau không hỏi nữa; không mất
  dữ liệu hay gói (đã đo, `bench/phase1/results/gd1_adhoc_keychain.md`). Chỉ hết khi có Developer ID (Team ID cho danh tính ổn định). App báo trước điều này ngay trong lời mời cập nhật (chỉ khi bản build không có Team ID).
- Có Developer ID thì đặt `APPLE_TEAM_ID` và các secret `APPLE_*` (mục 3, "Chứng thư ký mã"); không phải sửa code. Biến
  `APPLE_TEAM_ID` có giá trị thì app về chế độ chặt (yêu cầu đúng Team ID). **Đặt `APPLE_TEAM_ID` mà vẫn ký ad-hoc thì bản đó
  bị coi là không chính hãng và chỉ chạy Free**, nên đặt cùng lúc với secret chứng thư.
- Tạm đặt `APPLE_TEAM_ID` sai dạng cũng khóa (không tự hạ xuống chế độ ad-hoc), để lỗi cấu hình lộ ra ngay.

## 6. Tên miền riêng `aitranslator.io.vn`

Thiết kế: `docs/superpowers/specs/2026-10-06-custom-domain-design.md`. Kế hoạch: `docs/superpowers/plans/2026-10-06-chuyen-ten-mien.md`.

| Mục đích | Tên | Gắn với |
|---|---|---|
| License server (app gọi) | `api.aitranslator.io.vn` | Worker `mt-license`, route `custom_domain` trong `server/wrangler.jsonc` |
| Bản cập nhật và model | `releases.aitranslator.io.vn` | Bucket R2 `ai-translator-releases`, custom domain |
| Gửi email | `mail.aitranslator.io.vn` | Resend; From `no-reply@mail…`, Reply-To `support@aitranslator.io.vn` |
| Nhận email hỗ trợ | `support@aitranslator.io.vn` | Cloudflare Email Routing, chuyển về Gmail |
| Admin | `admin.aitranslator.io.vn` | Worker `mt-license-admin`, route `custom_domain` trong `server/wrangler.admin.jsonc`, sau Cloudflare Access; từ 2026-10-08 `workers_dev: false` nên không còn địa chỉ `workers.dev` |

- Biến GitHub `RELEASES_BASE_URL` = `https://releases.aitranslator.io.vn` (Settings › Secrets and variables › Actions › Variables); `release-ready.mjs` kiểm khớp với `updater/source.rs`.
- Luật WAF `webhook-rate-limit` cho `/v1/webhooks/` đặt ở zone này (5 request mỗi 10 giây mỗi IP, 429).
- Webhook PayOS: `https://api.aitranslator.io.vn/v1/webhooks/payos` (đăng ký bằng `confirm-webhook`; `API_ORIGIN` của Worker admin phải là `https://api.aitranslator.io.vn`).
- Thư mới từ tên miền mới dễ vào spam lúc đầu: kiểm hộp thư thật sau mỗi thay đổi nội dung thư; DMARC đang `p=none`, siết `quarantine` sau vài tuần báo cáo sạch.
- Còn giữ `workers_dev` của Worker API và `r2.dev` của bucket làm đường lui cho bản cài cũ. Chỉ tắt khi không còn bản cài nào dùng URL cũ. Worker admin không có đường lui này: `workers_dev` của nó đã tắt từ 2026-10-08 và `preview_urls` là `false` (`server/wrangler.admin.jsonc`), chỉ còn `admin.aitranslator.io.vn`.

## 7. Bản Windows chưa ký (chưa có chứng thư ký mã)

Chưa có chứng thư ký mã Windows (T2) thì để biến `WINDOWS_SIGNER` và `MT_WINDOWS_SIGN_CMD` của repo **rỗng**. CI tự build app
với `AI_TRANSLATOR_WIN_SIGNING=unsigned` (spec `2026-10-08-windows-unsigned-design.md`), không ký tiến trình phụ và bộ cài,
và ghi dòng "Bản Windows chưa ký" vào tóm tắt của lần chạy. Chữ ký bản cập nhật (minisign) vẫn bắt buộc như mọi bản.

- App ở chế độ này không kiểm chữ ký Authenticode; gói trả phí chạy được. Lỗi `NotGenuine` thì xem log của app
  (`%LOCALAPPDATA%\com.aitranslator.desktop\logs\app.log`).
- SmartScreen có thể chặn lần chạy bộ cài ("Windows protected your PC"). Hướng dẫn cho khách (trang
  `/huong-dan/cai-dat-windows/` của website): bấm **More info**, kiểm tên file, Publisher hiện "Unknown publisher", rồi bấm
  **Run anyway**. Trình duyệt có thể cảnh báo file ít người tải (Edge: Keep › Show more › Keep anyway). Luôn gửi kèm mã
  SHA-256 (`SHA256SUMS-windows.txt`) vì khách không có tên nhà phát hành để kiểm.
- Bộ cài cài theo từng người dùng, không hỏi quyền admin.
- **Cách cài khuyến nghị cho khách: một dòng lệnh** `irm https://aitranslator.io.vn/install.ps1 | iex` (spec `2026-10-09-windows-iwr-install-design.md`, script `website/src/public/install.ps1`). File tải bằng PowerShell không mang dấu "tải từ internet" (Mark of the Web) và bộ cài được chạy từ PowerShell nên SmartScreen không kiểm. Script đọc `<kênh>/latest.json`, tải `<version>/AI Translator_<version>_x64-setup.exe` và `<version>/SHA256SUMS-windows.txt` từ R2, đối chiếu SHA-256, chạy `setup.exe /S` rồi mở app: **một bản phát hành phải đăng đủ các file đó và không đổi tên**; `website/test/install-ps1.test.mjs` khóa hợp đồng này. **Giới hạn:** Smart App Control (Windows 11) ở chế độ chặn vẫn chặn mọi bản chưa ký, không có cách bỏ qua ngoài việc tắt nó hoặc ký mã (trang cài đặt Windows có mục hướng dẫn). Sau mỗi lần đăng bản mới, kiểm trên một máy Windows sạch: `irm https://aitranslator.io.vn/install.ps1 | iex`.
- Có chứng thư thì đặt cùng lúc `WINDOWS_SIGNER` (tên chủ chứng thư, đúng như Windows hiển thị) và `MT_WINDOWS_SIGN_CMD`
  (mục 3, "Chứng thư ký mã"); không phải sửa code. `WINDOWS_SIGNER` có giá trị thì app về chế độ chặt (yêu cầu đúng người
  ký). **Đặt `WINDOWS_SIGNER` mà không có `MT_WINDOWS_SIGN_CMD` thì job bộ cài dừng**, vì bản đó sẽ bị coi là không chính
  hãng và chỉ chạy Free.
- Website: khi có chứng thư, sửa các chỗ nói "chưa có chứng thư ký mã" (trang cài đặt Windows, Tải xuống, Giới thiệu, Dữ
  liệu và bảo mật).


## 8. Đợt thêm gói 6 Months (migration D1 0003)

Spec `2026-10-13-six-months-plan-design.md` (mục 6), kế hoạch `2026-10-13-goi-6-thang-01-server-admin.md`. **Mỗi bước chỉ làm khi chủ dự án cho phép**; các lệnh ghi vào production do chủ dự án chạy (agent viết sẵn script, chủ dự án chạy bằng `! sh <script>`). Thứ tự không đổi được: migration, Worker API, Worker admin, app, website. Chạy trong `server/`; `PROD` và `PADMIN` như mục 4.

Vì sao thứ tự này: migration 0003 chỉ **nới** ràng buộc CHECK mã gói, nên Worker cũ vẫn chạy đúng trên schema mới; Worker API mới cần schema mới để ghi đơn và license `six_months`; `GET /v1/plans` chỉ đưa gói mới cho app khai báo `?plans=`, nên máy chạy bản app cũ không thấy gói chưa mua được; website chỉ được nói điều đã thật nên đi sau cùng.

**Hai Worker phải lên liền nhau (bước 5 rồi bước 6 ngay).** Worker admin không giữ bảng gói: nó lấy `PLANS` từ Worker API qua RPC rồi tự kiểm bằng danh sách mã gói của chính bản mình, và danh sách đó phải khớp đúng. Hai Worker khác phiên bản thì ba thao tác cấp license của người vận hành (cấp cho đơn đã trả, xử lý đơn rồi cấp, "Cấp license mới…") trả `503 pricing_not_configured`. Khách không bị ảnh hưởng: tạo đơn, webhook và cron đối soát chạy trong Worker API. Nên trong khoảng giữa hai bước (và khi chỉ lùi một Worker, xem **Đường lui**) không dùng ba thao tác đó.

1. **Kiểm trước khi áp (chỉ đọc), ghi lại kết quả để so sau.** Migration dựng lại bốn bảng `licenses`, `orders`, `activations`, `deactivations` đúng theo `0002_three_plans_trials.sql`: nếu production có cột hay ràng buộc ngoài 0002 (ví dụ có người sửa tay), migration sẽ làm mất chúng. Nên kiểm schema thật trước:

   ```bash
   pnpm exec wrangler d1 time-travel info mt-license-production
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('licenses', 'orders', 'activations', 'deactivations') ORDER BY name"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM licenses) AS licenses, (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM activations) AS activations, (SELECT COUNT(*) FROM deactivations) AS deactivations, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq, (SELECT seq FROM sqlite_sequence WHERE name = 'deactivations') AS deactivations_seq"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT type, name FROM sqlite_master WHERE type IN ('trigger', 'view')"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT status, COUNT(*) AS n FROM orders WHERE status IN ('pending', 'processing') GROUP BY status"
   ```

   Expected: `time-travel info` in mốc hiện tại (chép lại để so; mốc dùng để khôi phục được chụp lại ngay trước bước 3). Bốn câu `CREATE TABLE` khớp từng cột, kiểu, `NOT NULL`, `DEFAULT`, `CHECK (plan IN ('monthly', 'yearly'))` và `REFERENCES` với bảng cùng tên trong `server/migrations/0002_three_plans_trials.sql` (sau khi đổi tên bảng, SQLite ghi tên có dấu nháy kép như `"licenses"`: khác chỉ ở chỗ đó là bình thường). Câu đếm cho số dòng của bốn bảng và hai bộ đếm `orders_seq`, `deactivations_seq`. Không có trigger hay view nào (migration xóa rồi dựng lại bốn bảng, nên trigger hay view gắn vào chúng sẽ mất hoặc hỏng); `foreign_key_check` không trả dòng nào; số đơn `pending` và `processing` nên là 0 (nếu có thì vẫn áp được, vì cron đối soát `*/5` xử lý lại đơn khách trả tiền đúng lúc D1 tạm không phục vụ, nhưng chọn lúc ít khách). **Khác ở bất kỳ cột nào thì dừng và báo.**

2. **(Khuyến nghị)** Chạy thử migration trên bản sao dữ liệu thật. Đây là lần đầu 0003 dựng lại bốn bảng có dữ liệu thật trên D1 production (lần 0002 chạy khi các bảng đã trống), nên nên thử trước. Hai lưu ý: `wrangler d1 export --remote` làm D1 production **không phục vụ được** trong lúc xuất (wrangler hỏi xác nhận; chọn lúc ít khách), và bản xuất chứa **email và license key đầy đủ** của khách: để ngoài repo, không gửi đi, xóa ngay khi xong (`trap` dưới đây xóa cả khi lệnh giữa chừng lỗi). Phần `--local` của các lệnh này đã được thử ngày 2026-10-13 với wrangler 4.145.0 trên một DB giả (đã áp 0001 và 0002, có đơn lớn nhất bị xóa): chỉ `0003` được áp, bộ đếm và số dòng giữ nguyên, `foreign_key_check` rỗng. `export --remote` thì chưa thử trên production; lệnh nào không chạy được thì bỏ qua bước này (bước 1 và 4 mới là bắt buộc).

   ```bash
   W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
   pnpm exec wrangler d1 export mt-license-production --remote --output "$W/prod.sql"
   grep -c sqlite_sequence "$W/prod.sql" || true
   pnpm exec wrangler d1 execute mt-license-production --local --persist-to "$W/state" --file "$W/prod.sql"
   pnpm exec wrangler d1 migrations apply mt-license-production --local --persist-to "$W/state"
   pnpm exec wrangler d1 execute mt-license-production --local --persist-to "$W/state" --command "PRAGMA foreign_key_check"
   pnpm exec wrangler d1 execute mt-license-production --local --persist-to "$W/state" --command "SELECT name, seq FROM sqlite_sequence ORDER BY name"
   rm -rf "$W"
   ```

   Expected: `grep -c` in số lớn hơn 0 (bản xuất có dòng `sqlite_sequence`; nếu là 0 thì bộ đếm của bản sao bị dựng lại, đừng so bộ đếm ở bản sao mà chỉ so ở bước 4); chỉ migration `0003_six_months_plan.sql` được áp (0001 và 0002 đã có trong bảng `d1_migrations` của bản xuất); `foreign_key_check` không trả dòng nào; `orders` và `deactivations` ở câu cuối bằng `orders_seq` và `deactivations_seq` của bước 1.

3. **Áp migration lên production.** Chụp lại mốc Time Travel **ngay trước khi áp** (mốc ở bước 1 có thể đã cũ, và khôi phục về mốc cũ làm mất các đơn phát sinh sau đó), rồi áp:

   ```bash
   pnpm exec wrangler d1 time-travel info mt-license-production
   pnpm exec wrangler d1 migrations apply mt-license-production --remote
   ```

   Expected: `time-travel info` in mốc hiện tại (**chép lại**: đường lui nếu cần khôi phục dữ liệu). `migrations apply` liệt kê chỉ `0003_six_months_plan.sql`, hỏi xác nhận (wrangler cảnh báo D1 có thể tạm không phục vụ được trong lúc áp; migration ngắn, trả lời `y`), rồi `✅`. Migration lỗi thì wrangler hoàn tác chính migration đó (không áp dở): dừng, không deploy Worker, báo chủ dự án; không cần khôi phục.

4. **Kiểm sau khi áp:** chạy lại hai câu `SELECT` của bước 1 và `PRAGMA foreign_key_check`.

   ```bash
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"
   ```

   Expected: schema giống bước 1, chỉ khác chuỗi CHECK của `licenses` và `orders` (nay là `CHECK (plan IN ('monthly', 'six_months', 'yearly'))`); số dòng và hai bộ đếm **bằng đúng** bước 1 (số đơn không được lùi: PayOS nhớ mọi `orderCode` đã dùng và từ chối mã trùng); `foreign_key_check` không trả dòng nào. Lệch ở chỗ nào thì dừng, không deploy Worker, và hỏi chủ dự án trước khi khôi phục bằng Time Travel (mốc chụp ngay trước bước 3: `pnpm exec wrangler d1 time-travel restore mt-license-production --bookmark=<mốc>`; khôi phục xóa mọi ghi sau mốc đó, ví dụ một đơn vừa được trả tiền).

5. **Deploy Worker API** (`PLANS` có `six_months` đã nằm trong `wrangler.jsonc`); xong là làm ngay bước 6, vì từ lúc này tới khi Worker admin lên, ba thao tác cấp license của Web Admin trả `503`:

   ```bash
   pnpm check && pnpm exec wrangler deploy
   curl -s "$PROD/v1/health"; echo
   curl -s "$PROD/v1/plans"; echo
   curl -s "$PROD/v1/plans?plans=monthly,six_months,yearly"; echo
   ```

   Expected: như mục 4 bước 9 (`Uploaded mt-license`, `schedule: */5 * * * *`, `{"ok":true}`). `GET /v1/plans` không tham số trả **đúng hai gói** `monthly`, `yearly` như trước (đó là điều bản app cũ nhận). Có `?plans=monthly,six_months,yearly` trả ba gói theo thứ tự `monthly`, `six_months` (`"quota_minutes_per_cycle":6000`, `"days_per_order":180`, `"VND":269000`), `yearly`. Kiểm cron vẫn chạy như mục 4 bước 9 (`pnpm exec wrangler triggers deploy` nếu mất lịch).

6. **Deploy Worker admin** (ngay sau bước 5):

   ```bash
   pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
   curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/admin/whoami"
   ```

   Expected: như mục 4 bước 10 (khi chưa đăng nhập Access thì không phải `5xx`). Đăng nhập Web Admin: trang Tổng quan vẽ biểu đồ doanh thu theo gói với chuỗi thứ ba; ô "Cấp license mới" liệt kê `6 Months`. **Chưa cấp license `6 Months` cho khách** (kể cả bằng "Cấp license mới…") cho tới khi bản app ở bước 7 đã được đăng: bản 0.1.8 không đọc được token `six_months` nên báo lỗi token.

7. **Phát hành app** theo mục 2 (nâng phiên bản ở đó). App mới gọi `?plans=` nên thấy bốn thẻ gói; máy chạy bản cũ vẫn thấy ba thẻ (Free, Monthly, Yearly) như trước.

8. **Deploy website** sau khi bản app có gói 6 Months đã được đăng lên R2 (kiểm R2 ở mục 2): `cd ../website && pnpm deploy` (các lệnh của mục này chạy trong `server/`). Nếu ngày deploy thật khác 2026-10-13 thì sửa ngày hiệu lực EULA 1.2 trước (`docs/legal/eula.vi.md`, `eula.en.md`, `README.md`; trang Điều khoản của website nay tự lấy ngày cập nhật theo dòng phiên bản của EULA, không còn `modified` để sửa tay) để repo ghi một ngày có thật.

9. **Thử tay:** mua một đơn 6 Months thật bằng PayOS và kiểm app tự kích hoạt (hạn mới = lúc trả tiền + 180 ngày, hạn mức "100 giờ mỗi 30 ngày"); đổi gói từ Monthly sang 6 Months và xem số ngày quy đổi; một máy chạy bản app cũ vẫn thấy ba thẻ; dùng "Cấp license mới…" ở Web Admin cấp một license 6 Months cho email của chính chủ dự án rồi kích hoạt bằng key nhận được (đây là đường duy nhất qua bảng gói của Worker admin mà các bước trên chưa chạm tới), sau đó thu hồi license thử ở trang License nếu không giữ.

**Đường lui.** Quay về phiên bản trước bằng `pnpm exec wrangler rollback` (Worker API) và `pnpm exec wrangler rollback -c wrangler.admin.jsonc` (Worker admin): **lùi cả hai**, vì chỉ lùi một Worker thì ba thao tác cấp license của Web Admin trả `503` (hai bản kiểm bảng gói khác nhau). Schema mới tương thích với code cũ. Nhưng nếu đã có đơn hay license `six_months` thì Worker cũ **không đọc được** chúng (bảng `PLANS` cũ không có gói đó): chỉ lùi khi chưa có khách mua gói mới, còn không thì sửa tiến. Migration 0003 không có bước lùi vì nó chỉ nới CHECK và không đổi dữ liệu; nếu dữ liệu bị hỏng thì khôi phục bằng Time Travel (`pnpm exec wrangler d1 time-travel restore mt-license-production --bookmark=<mốc chụp ngay trước bước 3>`; mất mọi ghi sau mốc đó, nên hỏi chủ dự án trước).


## 9. Đợt thêm thanh toán thẻ quốc tế bằng Creem (không có migration)

Spec `2026-10-14-creem-international-payment-design.md` (mục 7, 9 và 11), nghiên cứu `2026-10-14-international-payment-provider-research.md`, kế hoạch `2026-10-14-creem-01-server.md` đến `2026-10-14-creem-05-legal-ops.md`. **Mỗi bước chỉ làm khi chủ dự án cho phép**; thao tác ở dashboard Creem và mọi lệnh ghi vào production do chủ dự án làm. Chạy trong `server/`; `PROD` và `PADMIN` như mục 4. **Không có migration D1** (cột `orders.provider` và `currency` không có CHECK) và **không có môi trường thử**: Worker chỉ nối Creem production (`CREEM_BASE_URL` là `https://api.creem.io`, test Node chặn `test-api.creem.io`). Test Mode (sandbox) của Creem chỉ dùng ở bước 2, từ máy bạn: `curl` tới `test-api.creem.io`, dashboard ở Test Mode và chỗ hứng webhook tạm; không bao giờ nối vào Worker.

**Khóa Creem là bí mật.** Repo này công khai: không dán khóa vào chat, vào file trong repo hay vào lệnh có thể ở lại trong lịch sử shell. Nhập bằng `read -rs` hay thẳng vào `wrangler secret put`.

**Điều kiện trước khi bắt đầu.** Bước 1 (tài khoản) và bước 2 (spike ở Test Mode) không chạm Worker hay D1 của ta: làm được ngay. Từ bước 3 trở đi chỉ làm khi đủ cả bốn điều:

- **Hardening xong.** Mọi việc trong danh sách hardening (`docs/superpowers/plans/2026-10-14-creem-06-hardening-backlog.md`) đã làm và đã rà, nhất là: C1 (hoàn đủ ở bất kỳ trạng thái nào thì đơn thành `refunded` và không bao giờ được cấp key nữa), H-I1 (Creem vẫn báo đơn `paid` sau khi hoàn, nên server dựa vào webhook hoàn tiền), H-T5 (`pnpm check` vẫn xanh khi điền mã `prod_…` thật), I3-T5 (khách trả qua link công khai của sản phẩm thì có cảnh báo `payment_unmatched`), I1-W15 và I1-W17 (website: trang Dữ liệu và bảo mật theo chính sách 1.2, ảnh màn hình Nâng cấp không còn câu "chỉ VietQR"), I-1-L (EULA 1.3: hoàn tiền thì license có thể bị thu hồi hoặc rút ngắn hạn), C-1-R (spike đo thuế bằng địa chỉ ở nước có VAT).
- **Spike xong.** Bảng "Kết quả spike → việc tiếp theo" ở cuối bước 2 đã điền đủ bằng số thật, và mọi việc ở cột "Nếu khác" (task SPn) đã làm, có test, đã gộp.
- **Một nhánh, đã gộp.** Nhánh `payment` đã gộp vào `main` (chủ dự án quyết lúc nào; nên là ngay trước bước 3, xem đoạn "Từ lúc gộp…" dưới), đã push, CI xanh. Mã `prod_…` thật (bước 3) chỉ điền và commit trên `main` sau lần gộp đó (như vậy Worker admin có Web Admin mới đi cùng bản), không điền ở nhánh nào khác.
- **Deploy từ `main` sạch.** Trước bước 7, trước bước 8 và trước khi tắt bán thẻ khẩn cấp (**Đường lui**), chạy trong `server/`:

  ```bash
  git branch --show-current
  git status --short
  ```

  Expected: lệnh đầu in `main`, lệnh sau không in gì, và mọi commit đã push. Khác thì dừng: deploy từ cây làm việc chưa commit (hay từ nhánh khác) rồi một lần deploy sau từ `main` (bản sửa gấp PayOS, hay một phiên khác dùng chung thư mục) sẽ âm thầm gỡ cổng Creem: webhook `404`, đơn thẻ đang chờ hết hạn sau 24 giờ mà không được cấp.

**Từ lúc gộp `payment` vào `main` cho tới hết bước 11: KHÔNG `pnpm deploy` website, KHÔNG phát hành app mới (không đẩy tag `v*`).** Từ lúc gộp, `main` mang các trang website hứa thẻ quốc tế (Bảng giá, Trang chủ, hướng dẫn mua), ảnh `app-upgrade*` có lựa chọn thẻ, EULA 1.3 và chính sách 1.2 ghi hiệu lực 16/10/2026, trong khi Creem chưa bán thật; không có gì trong mã chặn việc đăng chúng. `website/README.md` dặn "sau mỗi lần phát hành chỉ cần `pnpm deploy`", lệnh đó dựng và đăng nội dung `website/` của `main`; bản app ra từ `main` thì đóng gói luôn EULA và chính sách đó (`src/lib/legal.ts`). Vì vậy:

- **Chỉ gộp ngay trước bước 3**, khi spike (bước 2) xong và ba mã `prod_…` sẵn sàng để điền: khoảng nguy hiểm ngắn nhất. Đừng gộp sớm rồi để đó nhiều ngày.
- Cần phát hành bản sửa lỗi khác (app hay website): làm **trước** khi gộp. Không có đường vòng bằng nhánh khác: job cổng phát hành của workflow `Release` chỉ cho tag trỏ vào commit thuộc `main`. Đã gộp rồi mà buộc phải phát hành trước khi xong bước 11 thì bản đó mang luôn EULA 1.3, chính sách 1.2 và giao diện thẻ (giao diện thẻ chỉ hiện khi server có giá USD, tức sau bước 7): chủ dự án quyết có chấp nhận không, và tối thiểu làm dòng đầu của bước 11 (sửa ngày hiệu lực) trước khi nâng phiên bản. Website vẫn không deploy.
- Từ lúc gộp, mọi lần deploy Worker từ `main` (kể cả bản sửa gấp PayOS) đòi đủ `CREEM_API_KEY` ở cả hai Worker và `CREEM_WEBHOOK_SECRET` ở Worker API trong `secrets.required`: thiếu thì `wrangler deploy` từ chối. Chưa có khóa thật (bước 1 chưa xong) thì đặt trước giá trị giữ chỗ ngẫu nhiên, lệnh ở mục 4: **bước 5** (Worker API: `CREEM_API_KEY` và `CREEM_WEBHOOK_SECRET`) và **bước 8** (Worker admin: `CREEM_API_KEY`). Bước 5 của mục này ghi đè cả ba bằng giá trị thật.

Thứ tự không đổi được: tài khoản, spike, sản phẩm, webhook, secret, Worker API, Worker admin, nghiệm thu bằng đơn thật, webhook qua tường lửa, ngày hiệu lực của văn bản pháp lý, app, website. Vì sao:

- `secrets.required` của hai file wrangler có `CREEM_API_KEY` (và `CREEM_WEBHOOK_SECRET` ở Worker API): thiếu secret thì `wrangler deploy` từ chối. Nên làm bước 1 đến 6 trước khi deploy. Đã đặt giá trị giữ chỗ (mục 4 bước 5 và 8) thì bước 5 ghi đè bằng giá trị thật.
- Creem ở Worker API có hai vai tách nhau. **Xử lý** (webhook, đối soát, hoàn tiền và tranh chấp của đơn Creem đã có) cần `CREEM_API_KEY` và `CREEM_WEBHOOK_SECRET`; **bán** (tạo đơn USD mới) cần thêm đủ ba mã `prod_…` khác nhau trong `CREEM_PRODUCT_IDS`. Thiếu khóa hay secret: không có cổng Creem, `/v1/webhooks/creem` trả `404`. Có hai secret mà ba mã còn rỗng: cổng chỉ xử lý, không bán (`GET /v1/plans` không trả giá USD, `POST /v1/checkout` với `currency: "USD"` trả `503`, app không hiện lựa chọn cách trả). Điền dở hay hai gói trùng mã thì `pnpm check` đỏ (test `wrangler-config`), nên không deploy được.
- Server mới chạy an toàn với app cũ (app đến 0.1.9 không gửi `currency` nên chỉ đi PayOS, vẫn nhận mã VietQR) và app mới chạy được với server cũ (không có giá USD thì không có lựa chọn cách trả). Vẫn **đưa app sau server** và sau nghiệm thu, để người dùng chỉ thấy lựa chọn khi nó chạy thật.
- Website và văn bản pháp lý sau cùng: trang nói "có thẻ quốc tế" khi chưa có là lời hứa sai.
- **Hai Worker lên liền nhau** (bước 7 rồi bước 8): cả hai cùng đọc `PLANS` (có giá USD) và cổng Creem. Trong khoảng giữa hai bước đừng dùng thao tác cấp license và xem đơn Creem ở Web Admin.

1. **Tài khoản Creem** (chủ dự án; agent không đăng ký thay). Đăng ký ở creem.io. Chủ dự án đã đăng ký hộ kinh doanh cá nhân (`docs/legal/README.md`): nếu Creem hỏi loại người bán thì khai theo hộ kinh doanh, vì điều 3.4.9 của điều khoản người bán Creem đòi người bán đăng ký kinh doanh (hay làm nghề tự do) hợp lệ; hồ sơ KYC theo hộ hay theo cá nhân chủ hộ là câu hỏi cho kế toán ở README đó. Làm KYC (tên thụ hưởng của tài khoản ngân hàng phải khớp tên KYC), thêm tài khoản ngân hàng nhận chi trả (VND), chờ Creem duyệt (1 đến 2 ngày làm việc, tối đa 3). Creem xét website: có Chính sách quyền riêng tư và Điều khoản, giá hiển thị, email hỗ trợ khớp (`aitranslator.io.vn` có đủ); Creem có thể mua thử bằng mã giảm giá 100%. Lúc Creem duyệt, website có thể còn ghi chưa nhận thẻ quốc tế (website chỉ đổi ở bước 11): người duyệt có thể hỏi, cứ trả lời là đang chờ duyệt để bật thẻ. Creem có thể xếp sản phẩm vào nhóm "Generative AI" (nhóm phải xét kỹ, kèm hồ sơ bộ xử lý thanh toán trước đó), nên chuẩn bị sẵn câu trả lời: bộ xử lý trước là PayOS (VietQR, chỉ VND, chỉ trong Việt Nam); tỉ lệ hoàn tiền và chargeback đến nay (ghi số thật); lý do chuyển (bán cho khách ngoài Việt Nam bằng thẻ, USD); sản phẩm là app desktop phụ đề dịch trực tiếp, chạy offline trên máy người dùng. Creem chi trả theo tiền tệ của tài khoản ngân hàng; khác tiền tệ bán (USD) thì đối tác ngân hàng của Creem tự quy đổi và thu phí quy đổi (ngoài tầm Creem), ngân hàng nhận có thể thu thêm (đo ở lần rút đầu, điểm S8 của spec).

2. **Spike ở test mode** (S1 đến S7 của spec mục 11, cộng các phép đo thêm S10 đến S14), **trước khi deploy**. Spike đo những điều server **đang giả định** về Creem; ghi từng kết quả vào bảng "Kết quả spike → việc tiếp theo" ở cuối bước này. Một phép đo làm sai điều kiện (ví dụ trả bằng địa chỉ không có thuế rồi ghi "đạt") là phép đo chưa làm. Test Mode không tính tiền thật. Dành khoảng một giờ: S6 phải chờ hơn 35 phút, nên làm 2a và 2b trước, rồi làm 2c đến 2f trong lúc chờ. Các khối lệnh dưới không có chú thích `#` (zsh không bật `interactivecomments` sẽ báo `command not found: #`) và mỗi khối dùng khóa tự nạp lại file khóa, nên chạy được ở terminal mới.

   **2a. Chuẩn bị.** Bật **Test Mode** ở dashboard (nút ở cuối thanh bên trái), vào Developers, chép **khóa test** vào một file chỉ mình đọc được (không dán vào chat, không để trong repo). Lệnh chạy trong subshell nên `umask 077` và biến `K` không ở lại phiên shell của bạn; kiểm bằng `ls -l "$HOME/.creem-test.env"` (phải là `-rw-------`):

   ```bash
   ( umask 077; printf 'Khóa test của Creem: '; read -rs K; echo; printf 'CREEM_TEST_KEY=%s\n' "$K" > "$HOME/.creem-test.env" )
   ```

   Tạo một sản phẩm thử: loại một lần, USD, **giá catalog 9,99** (cố ý khác 3,99: nếu Creem bỏ qua `custom_price` thì trang hiện 9,99 và ta thấy ngay; với giá catalog 3,99 thì spike vẫn "đạt" dù Creem bỏ qua `custom_price`), **Tax mode: exclusive**; chép mã `prod_…` của nó.

   Chuẩn bị chỗ hứng payload webhook thật (S4, S5, S10, S14), chọn **một** trong hai cách:

   - **Cách A (nên dùng, payload không rời máy bạn):** Creem CLI. Tài liệu Creem: `creem listen --forward-to http://127.0.0.1:8788/` tự đăng ký một endpoint tạm và chuyển mỗi sự kiện tới địa chỉ đó kèm header chữ ký thật (cách cài và đăng nhập: docs.creem.io/code/cli); chạy lệnh đó ở một cửa sổ terminal riêng. Ở cửa sổ khác chạy máy hứng sau: nó ghi thân thô và header `creem-signature` của mỗi sự kiện vào `$TMPDIR/creem-wh-<n>.body` và `.sig`, in giờ nhận và số byte (Ctrl+C để dừng):

     ```bash
     TMPDIR="${TMPDIR:-/tmp}"
     export TMPDIR
     node -e '
       const http = require("http"), fs = require("fs"), path = require("path");
       let n = 0;
       http.createServer((req, res) => {
         const chunks = [];
         req.on("data", (c) => chunks.push(c));
         req.on("end", () => {
           const body = Buffer.concat(chunks);
           n += 1;
           const base = path.join(process.env.TMPDIR, "creem-wh-" + n);
           fs.writeFileSync(base + ".body", body, { mode: 0o600 });
           fs.writeFileSync(base + ".sig", String(req.headers["creem-signature"] || ""), { mode: 0o600 });
           console.log(new Date().toISOString(), req.method, req.url, body.length + " byte", "->", base + ".body");
           res.writeHead(200).end("ok");
         });
       }).listen(8788, "127.0.0.1", () => console.log("Đang nghe http://127.0.0.1:8788/"));
     '
     ```

   - **Cách B (không có CLI):** tạo endpoint ở dashboard (Test Mode: Developers > Webhooks) với ba sự kiện `checkout.completed`, `refund.created`, `dispute.created`, trỏ tới một trang hứng webhook tạm như webhook.site. Trang đó **công khai**: ai biết địa chỉ trang đều đọc được payload (có email, tên và nước người mua), nên ở cách này **chỉ dùng email và tên giả** (ví dụ `spike@example.com`, `Test Tester`) cho `customer.email` và ở trang thanh toán; xóa endpoint và trang hứng khi xong. Với mỗi sự kiện, chép **Raw Content** nguyên văn vào `"$TMPDIR/creem-wh-<n>.body"` (nút Copy của trang, rồi `pbpaste > "$TMPDIR/creem-wh-1.body"` trên macOS) và giá trị header `creem-signature` vào `"$TMPDIR/creem-wh-<n>.sig"` (`printf '%s' '<giá trị>' > "$TMPDIR/creem-wh-1.sig"`), để 2f dùng chung.

   **2b. Tạo hai phiên thanh toán.** Phiên `9000001` dùng cho S1 đến S5, S7, S10, S13, S14; phiên `9000002` dùng cho S6 (mở quá 35 phút) và D8. `TP` là mã sản phẩm thử vừa chép; `customer.email` là email thật nếu dùng Cách A, email giả nếu dùng Cách B:

   ```bash
   TMPDIR="${TMPDIR:-/tmp}"
   . "$HOME/.creem-test.env"
   TP=prod_...
   ( umask 077
     curl -s -X POST https://test-api.creem.io/v1/checkouts -H "x-api-key: $CREEM_TEST_KEY" -H 'content-type: application/json' \
       -d "{\"product_id\":\"$TP\",\"request_id\":\"9000001\",\"custom_price\":399,\"success_url\":\"https://api.aitranslator.io.vn/v1/pay/return\",\"customer\":{\"email\":\"<email>\"},\"metadata\":{\"order_code\":\"9000001\",\"plan\":\"monthly\"}}" | tee "$TMPDIR/creem-checkout.json"; echo )
   ```

   Expected (S2): JSON có `id` (`ch_…`), `status` `pending`, `checkout_url`, `request_id` `9000001` và **`custom_price` `399`**; không lỗi vì `custom_price` (tài liệu: từ 100 cent, chỉ cho sản phẩm một lần; 399 khác giá catalog 9,99 của sản phẩm thử, và đó là điểm cần đo). Ghi host và đầu đường dẫn của `checkout_url` (host test có thể khác production; host production đo lại ở bước 9):

   ```bash
   TMPDIR="${TMPDIR:-/tmp}"
   node -e 'const u = new URL(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).checkout_url); console.log(u.host, u.pathname.slice(0, 4))' "$TMPDIR/creem-checkout.json"
   ```

   Expected: `checkout.creem.io /ch_`. Rồi tạo phiên thứ hai ngay sau đó (khối này dừng nếu `TP` chưa đặt, tức là bạn đang ở terminal mới: đặt lại `TP=prod_...` như khối trên) và ghi lại giờ in ra: đó là mốc bắt đầu của S6:

   ```bash
   TMPDIR="${TMPDIR:-/tmp}"
   . "$HOME/.creem-test.env"
   : "${TP:?Chưa đặt TP: đặt lại TP=prod_... như khối tạo phiên 9000001}"
   ( umask 077
     curl -s -X POST https://test-api.creem.io/v1/checkouts -H "x-api-key: $CREEM_TEST_KEY" -H 'content-type: application/json' \
       -d "{\"product_id\":\"$TP\",\"request_id\":\"9000002\",\"custom_price\":399,\"success_url\":\"https://api.aitranslator.io.vn/v1/pay/return\",\"customer\":{\"email\":\"<email>\"},\"metadata\":{\"order_code\":\"9000002\",\"plan\":\"monthly\"}}" | tee "$TMPDIR/creem-checkout-2.json"; echo )
   date '+%F %T'
   ```

   Mở `checkout_url` của phiên `9000002`, xem trang rồi **để nguyên tab đó, không trả** (làm tiếp ở 2g khi đã qua 35 phút).

   **2c. Hỏi phiên 9000001 khi chưa trả (S2, S3).** Khối này dùng lại ba lần (trước khi trả, sau khi trả, sau khi hoàn tiền); mỗi lần ghi đè `$TMPDIR/creem-get-1.json`:

   ```bash
   TMPDIR="${TMPDIR:-/tmp}"
   . "$HOME/.creem-test.env"
   CID=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).id' "$TMPDIR/creem-checkout.json")
   ( umask 077
     curl -s "https://test-api.creem.io/v1/checkouts?checkout_id=$CID" -H "x-api-key: $CREEM_TEST_KEY" | tee "$TMPDIR/creem-get-1.json" | node -e 'const t = require("fs").readFileSync(0, "utf8"); try { console.log(JSON.stringify(JSON.parse(t), null, 1)); } catch { console.log(t); }' )
   ```

   Expected: `status` `pending`, `request_id` `9000001` (S3) và **`custom_price` `399`** (S2): server đọc `custom_price` của phiên chưa trả để biết số tiền, thiếu thì mỗi lần hỏi đều lỗi. Ghi thêm `order` có mặt hay không khi chưa trả. Thiếu `request_id` là SP13 (server không bao giờ tự cấp đơn Creem): dừng, báo lại.

   **2d. Trả phiên 9000001 bằng địa chỉ ở nước có VAT (S1, S3, S5, S7, S13).** Mở `checkout_url` của phiên `9000001` và ghi lại ngay trên trang, **trước khi trả**: (a) giá hiện là 3,99 (thuế chỉ hiện sau khi chọn nước), **không phải** 9,99 (S2); (b) có ô nhập mã giảm giá không, và nếu có thì tắt được ở đâu (S7; **đừng tạo mã giảm giá nào**); (c) trang có tự ghi Creem là bên bán (merchant of record) và có liên kết tới Buyer Terms và Privacy của Creem trước nút trả không (chép hay chụp nguyên văn: S13); (d) ô email có sẵn email ta gửi không, và có sửa được không (D8). Điền **địa chỉ thanh toán ở Hà Lan hoặc Đức** (chọn nước ở ô quốc gia, mã bưu chính hợp lệ của nước đó). **Không** dùng địa chỉ Việt Nam: nó thường cho thuế 0, khi đó S1 không đo được.

   Ngay trước khi bấm trả, chạy vòng hỏi sau ở một cửa sổ terminal khác (nó in giờ mỗi khi `status` đổi, tối đa khoảng 5 phút), rồi bấm trả bằng thẻ thử `4111 1111 1111 1111` (ngày hết hạn bất kỳ ở tương lai, CVV bất kỳ):

   ```bash
   TMPDIR="${TMPDIR:-/tmp}"
   . "$HOME/.creem-test.env"
   CID=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).id' "$TMPDIR/creem-checkout.json")
   P=
   for i in $(seq 1 150); do
     S=$(curl -s "https://test-api.creem.io/v1/checkouts?checkout_id=$CID" -H "x-api-key: $CREEM_TEST_KEY" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).status' 2>/dev/null)
     if [ "$S" != "$P" ]; then printf '%s %s\n' "$(date +%T)" "$S"; P=$S; fi
     [ "$S" = completed ] && break
     sleep 2
   done
   ```

   Sau khi trả xong, chạy lại khối ở 2c. Expected: `status` `completed`, `request_id` `9000001` (S3), `custom_price` vẫn `399` (S2), `order.status` `paid`, `order.currency` `USD`, và (S1) **ghi cả sáu số** của `order`: `amount`, `sub_total`, `tax_amount`, `discount_amount`, `amount_due`, `amount_paid`. Giả định của mã server: `tax_amount` > 0 (Hà Lan khoảng 21%, Đức 19%, tức khoảng 76 đến 84 cent trên 399), `sub_total` 399, **`amount` bằng giá niêm yết 399 chứ không gồm thuế**, `amount_paid` bằng 399 cộng thuế (OpenAPI cho ví dụ ngược lại: `amount` 2000 = `sub_total` 1800 + `tax_amount` 200). **Nếu `tax_amount` là 0 hay thiếu thì S1 CHƯA được đo: làm lại** với phiên khác và địa chỉ khác. Ghi thêm: `order` là một đối tượng chứ không phải chuỗi mã (SP13); `tax_amount` có mặt không (SP1); `discount` của phiên và `order.discount` vắng, `null` hay kiểu gì (chuỗi mã hay đối tượng: SP7); `discount_amount` có mặt (là 0 hay vắng) khi không giảm giá không (S7); `order.transaction` (mã giao dịch, dùng ở 2e). Độ trễ (S5): so giờ vòng hỏi in `completed` với giờ webhook `checkout.completed` tới (máy hứng ở 2a in giờ; webhook.site ghi giờ), ghi webhook tới trước hay sau lúc `GET` báo `completed` và chênh mấy giây.

   **2e. Hoàn tiền (S4).** Chạy khối sau để ghi trạng thái giao dịch **trước** khi hoàn, rồi hoàn tiền đủ đơn thử ở dashboard (Test Mode, mục giao dịch), chờ vài giây, chạy lại khối ở 2c (đơn) và khối dưới (giao dịch):

   ```bash
   TMPDIR="${TMPDIR:-/tmp}"
   . "$HOME/.creem-test.env"
   TX=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).order.transaction' "$TMPDIR/creem-get-1.json")
   curl -s "https://test-api.creem.io/v1/transactions?transaction_id=$TX" -H "x-api-key: $CREEM_TEST_KEY" | node -e 'const t = require("fs").readFileSync(0, "utf8"); try { console.log(JSON.stringify(JSON.parse(t), null, 1)); } catch { console.log(t); }'
   ```

   Expected (S4): `order.status` ở `GET` đơn **có thể vẫn là `paid` sau khi hoàn tiền** (OpenAPI chỉ cho đơn hai giá trị `pending` và `paid`; hoàn tiền nằm ở trạng thái của giao dịch; mẫu `refund.created` của tài liệu cũng để `order.status` là `paid`). Đó không phải lỗi của spike mà là lý do server dựa vào webhook `refund.created` để biết đơn đã hoàn. Ghi: `status` của giao dịch (OpenAPI: `refunded` hoàn đủ, `partialRefund`, `chargedBack`), `refunded_amount` (bằng `amount_paid` gồm thuế khi hoàn đủ không), `amount_paid`, `tax_amount`. Nếu Test Mode không cho hoàn tiền thì ghi "không hoàn được": S4 chỉ đo được ở đơn thật bước 9. Payload `refund.created` (qua máy hứng): ghi `id` (mã sự kiện `evt_…`), `object.status`, `object.refund_amount`, `object.checkout.id` (phải bằng `$CID`), `object.transaction.refunded_amount`, `object.transaction.amount_paid`. `dispute.created`: tài liệu không nêu cách tạo tranh chấp ở Test Mode; nếu dashboard có thì tạo và ghi `object.checkout.id`, `object.transaction.status` (mẫu tài liệu ghi `chargeback`, OpenAPI ghi `chargedBack`), không có cách thì ghi "không tạo được".

   **2f. Payload thật: chữ ký, kích thước, trường (S10, S14).** Khối sau, với mỗi thân webhook đã hứng, tính HMAC-SHA256 hex bằng `openssl` với secret của endpoint đã gửi sự kiện, so với header `creem-signature` đã lưu, in kích thước và các trường server đọc (không in email, tên hay địa chỉ). Với Cách A, secret là của endpoint tạm của `creem listen` (nếu CLI không cho biết secret đó thì dùng Cách B); với Cách B, là secret ở Developers > Webhooks:

   ```bash
   TMPDIR="${TMPDIR:-/tmp}"
   printf 'Secret ký của endpoint thử (Test Mode): '; read -rs WHS; echo
   for f in "$TMPDIR"/creem-wh-*.body; do
     want=$(tr -d ' \n' < "${f%.body}.sig" | tr 'A-F' 'a-f')
     got=$(openssl dgst -sha256 -hmac "$WHS" < "$f" | awk '{print $NF}')
     printf '%s: %s byte, chữ ký ' "$f" "$(wc -c < "$f" | tr -d ' ')"
     if [ "$want" = "$got" ]; then echo KHỚP; else echo LỆCH; fi
     node -e '
       const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
       const o = b.object || {};
       const c = o.checkout || o;
       const t = o.transaction || {};
       const r = o.order || {};
       console.log(JSON.stringify({
         event: b.eventType, id: b.id, status: o.status, request_id: o.request_id || c.request_id,
         checkout: c.id, metadata: o.metadata || c.metadata, refund_amount: o.refund_amount,
         transaction: { status: t.status, amount: t.amount, amount_paid: t.amount_paid, tax_amount: t.tax_amount, refunded_amount: t.refunded_amount },
         order: { amount: r.amount, sub_total: r.sub_total, tax_amount: r.tax_amount, discount_amount: r.discount_amount, amount_paid: r.amount_paid, status: r.status },
       }));
     ' "$f"
   done
   unset WHS
   ```

   Expected: mọi thân **KHỚP** (server kiểm đúng phép này: HMAC-SHA256 hex của thân thô, khóa là nguyên chuỗi secret; **LỆCH** ở mọi thân thì webhook của ta sẽ luôn bị từ chối, chỉ còn cron đối soát cấp license: báo lại trước khi deploy; LỆCH ở thân chép tay từ webhook.site thường là chép sai, thử lại bằng nút Copy); mỗi thân **dưới 16 KiB (16384 byte)**, vì server giới hạn thân request 16 KiB (S14); `checkout.completed` của sản phẩm một lần có `object.request_id` đúng chuỗi `9000001` (S10: mẫu của tài liệu là gói định kỳ nên chưa chắc có; nếu không có thì ghi `object.metadata` có `order_code` không và `object.id` có phải `$CID` không).

   **2g. Phiên 9000002 sau 35 phút (S6, D8).** Khi giờ đã qua **35 phút** kể từ giờ in ra ở 2b (và phiên chưa trả), chạy khối sau, rồi tải lại tab của phiên `9000002` và thử trả (cùng địa chỉ Hà Lan hay Đức):

   ```bash
   TMPDIR="${TMPDIR:-/tmp}"
   . "$HOME/.creem-test.env"
   date '+%F %T'
   CID2=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).id' "$TMPDIR/creem-checkout-2.json")
   ( umask 077
     curl -s "https://test-api.creem.io/v1/checkouts?checkout_id=$CID2" -H "x-api-key: $CREEM_TEST_KEY" | tee "$TMPDIR/creem-get-2.json" | node -e 'const t = require("fs").readFileSync(0, "utf8"); try { console.log(JSON.stringify(JSON.parse(t), null, 1)); } catch { console.log(t); }' )
   ```

   Ghi: (a) `status` của phiên lúc này (`pending` hay `expired`); (b) trang có còn cho trả không, hay báo hết hạn (chép thông báo nguyên văn, kèm thời điểm hết hạn nếu trang hay `GET` cho biết); (c) nếu trả được, chạy lại khối trên: `status` `completed`, `request_id` `9000002`, và webhook `checkout.completed` có tới không. Server giữ đơn thẻ 30 phút theo hạn của ta, còn hạn thật của phiên Creem chưa biết: nếu trang còn trả được sau 35 phút thì khách có thể trả khi đơn của ta đã quá hạn (server vẫn cấp qua webhook hay đối soát), và app phải tiếp tục hỏi đơn thẻ sau 30 phút (S6). Nếu trả được, ghi thêm giờ bạn bấm trả, `order.created_at` và `order.updated_at` của `GET` (có hay không, giá trị): SP5 cần biết trường nào là giờ trả thật (đã đo ngày 2026-10-16: `created_at` là lúc khách mở trang, `updated_at` là giờ trả). Khi trả phiên này, thử **sửa ô email** sang một email khác (nếu ô cho sửa; dùng email giả nếu Cách B còn bật) và ghi `customer.email` trong `GET` theo email nào. Ghi cả thư biên lai của Creem (có thư không, người gửi, tiêu đề, có nêu tên sản phẩm, giá, thuế không; chỉ thấy được khi nhập email của bạn, tức Cách A): đây là D8 phần biên lai. **Chữ trên sao kê thẻ không đo được ở Test Mode**: đo ở đơn thật bước 9 (xem sao kê). Tùy chọn, chỉ nếu dashboard cho hoàn **một phần**: hoàn một phần hai lần trên đơn này và ghi `refunded_amount` của hai sự kiện `refund.created` (cộng dồn hay chỉ số của từng lần).

   **2h. Các phép đo còn lại.** Khóa sai (S11): hai lệnh sau gọi API test với khóa sai và không có khóa; ghi mã HTTP, `content-type` và thân của từng lệnh (tài liệu Creem mâu thuẫn nhau giữa 401 và 403, nên số đo thật là thứ cần):

   ```bash
   curl -s -i "https://test-api.creem.io/v1/checkouts?checkout_id=x" -H 'x-api-key: sai' | head -c 2000; echo
   curl -s -i "https://test-api.creem.io/v1/checkouts?checkout_id=x" | head -c 2000; echo
   ```

   Expected: HTTP `401` hoặc `403` với thân JSON có `trace_id` dạng chuỗi (server chỉ coi `401` hay `403` là "khóa bị từ chối", tức cảnh báo `creem_auth_failed`, khi thân là JSON có `trace_id` chuỗi). Thân HTML, JSON không có `trace_id` hay mã khác là kết quả khác giả định (SP8).

   PayOS với khóa sai (tùy chọn; chỉ đọc, **không** dùng khóa PayOS thật). Ghi mã HTTP và thân: PayOS có thể trả lỗi nghiệp vụ bằng HTTP 200 kèm `code`, khi đó cảnh báo khóa API không nhận ra khóa PayOS sai:

   ```bash
   curl -s -i "https://api-merchant.payos.vn/v2/payment-requests/1" -H 'x-client-id: sai' -H 'x-api-key: sai' | head -c 2000; echo
   ```

   Ở dashboard Creem và trên giấy tờ của Creem, ghi thêm (không có lệnh):

   - **Link mua công khai (S12):** mở trang sản phẩm thử trong dashboard; ghi có nút Share hay liên kết mua công khai không (OpenAPI mô tả `product_url` dạng `https://creem.io/product/prod_…` để "mua nhanh"), có mục Storefront không, và có công tắc **tắt** chúng không (ghi tên nút và vị trí). Thử mở liên kết đó trong cửa sổ ẩn danh. Repo này công khai, nên mã `prod_…` thật sẽ lộ và ai cũng dựng được link mua trực tiếp; webhook của lần mua đó không có `request_id` của ta.
   - **Buyer Terms và Privacy (S13):** đọc https://www.creem.io/buyer-terms và https://www.creem.io/privacy. Ghi: luật hoàn tiền và quyền đổi ý của người mua (kể cả người tiêu dùng ở EU với nội dung số), điều khoản nào được ưu tiên khi khác điều khoản của ta, Creem thu dữ liệu gì của người mua (tên, địa chỉ thanh toán, nước, IP) và có tự nhận là bên kiểm soát dữ liệu độc lập không. Điều khoản bán hàng của Creem (3.7, 3.8) bắt ta báo người mua trước khi trả rằng Creem là bên bán lại (merchant of record) và đưa họ Buyer Terms mới nhất.

   **2i. Dọn dẹp** (khóa test, file có email, biến). Dừng máy hứng (Ctrl+C) và `creem listen`; xóa endpoint thử ở dashboard và trang hứng ở webhook.site; xóa sản phẩm thử nếu không giữ. Rồi chạy:

   ```bash
   TMPDIR="${TMPDIR:-/tmp}"
   rm -f "$HOME/.creem-test.env" "$TMPDIR/creem-checkout.json" "$TMPDIR/creem-checkout-2.json" "$TMPDIR/creem-get-1.json" "$TMPDIR/creem-get-2.json"
   find "$TMPDIR" -maxdepth 1 -name 'creem-wh-*' -delete
   unset CREEM_TEST_KEY TP CID CID2 TX WHS P S
   ```

   **Kết quả spike → việc tiếp theo.** Điền cột cuối bằng số và chữ thật (kể cả khi đúng giả định) rồi báo lại. Hàng nào **khác giả định** thì việc ở cột "Nếu khác" phải xong **trước bước 3** (xem **Điều kiện trước khi bắt đầu**), tức là trước mọi lần deploy; hàng chưa đo được (ví dụ S1 với thuế 0) thì làm lại phép đo, không ghi "đạt". Mã server giữ giả định ở cột "Nếu đúng", trừ SP2 (thêm kiểm `custom_price`), SP3 (đọc `refund_amount` và cộng dồn) và SP5 (giờ trả là `order.updated_at`), đã sửa theo số đo ngày 2026-10-16 (xem cột cuối).

   | Mã | Phép đo (mục) | Nếu đúng giả định | Nếu khác (việc tiếp theo) | Kết quả của bạn |
   |---|---|---|---|---|
   | SP1 | S1: `order.amount` có gồm thuế không; `sub_total` và `tax_amount` có ở `GET` không (2d) | `sub_total` = giá niêm yết 399, có `tax_amount`, `amount_paid` = 399 + thuế: giữ mã (server lấy giá là `sub_total`, thiếu thì `amount`; phần khách trả cho giá là `amount_paid` trừ `tax_amount`) | Thiếu `sub_total` mà `amount` đã gồm thuế (399 + thuế): mọi đơn ở nước có thuế thành `failed` kèm cảnh báo `order_payment_review`, không cấp key: `CreemProvider` lấy giá từ `custom_price` khi thiếu `sub_total`, sửa bộ giả lập và test cho cả hai dạng. Thiếu `tax_amount` mà `amount_paid` gồm thuế: mã giảm giá nhỏ hơn số thuế lọt qua phép so trả thiếu: sửa phép so theo trường thật | **2026-10-16, sandbox, địa chỉ NL và DE: CHƯA ĐO ĐƯỢC.** `GET` có đủ `sub_total` 399, `tax_amount` 0, `amount` 399, `amount_due` 399, `amount_paid` 399, nhưng sandbox **không tính thuế** (kể cả nước có VAT), nên chưa biết `amount` có gồm thuế. Việc: đo ở đơn thật (bước 9) nếu trả được bằng địa chỉ nước có VAT. Mã đã đúng ở cả hai cách hiểu (`sub_total ?? amount`, `amount_paid − tax_amount`). |
   | SP2 | S2: `custom_price` được tôn trọng và trả lại ở phản hồi POST **và** `GET`, trước lẫn sau khi trả (2b, 2c, 2d) | Trang hiện 3,99 (+ thuế); `custom_price` 399 có ở POST và `GET`: giữ; thêm kiểm `custom_price` trả lại phải bằng số đã gửi, khác thì đơn lỗi và không đưa link cho khách | Trang hiện 9,99, hay `GET` thiếu `custom_price`: bỏ gửi `custom_price`; bước 3 đặt giá catalog từng sản phẩm đúng giá gói (3,99, 21,99, 39,99), runbook và test Node nhắc điều đó. Riêng `GET` của phiên chưa trả thiếu `custom_price`: mỗi lượt đối soát, mỗi đơn thẻ chưa trả (kể cả đơn khách bỏ dở) đều lỗi (log `reconcile_failed`, cảnh báo `order_check_failed` ồn), nên `getPaymentStatus` phải lấy giá từ đơn của ta khi phiên chưa có `order` | **Đạt (2026-10-16).** Trang hiện 3,99 (không phải 9,99); `custom_price` 399 có ở phản hồi `POST` tạo phiên và ở `GET` trước lẫn sau khi trả. Đã thêm kiểm `custom_price` trả lại phải khớp số đã gửi (khác thì lỗi, không đưa link; vắng thì chấp nhận và ghi log). |
   | SP3 | S4: trạng thái đơn và giao dịch sau hoàn tiền; `refunded_amount` có cộng dồn không; payload `dispute.created` (2e, 2g) | `order.status` vẫn `paid`, giao dịch `refunded`, `refunded_amount` là tổng đã hoàn: giữ cách xử lý webhook hoàn tiền; tùy chọn hỏi `GET /v1/transactions` trước khi cấp | `refunded_amount` chỉ là số của từng lần hoàn: "hoàn đủ" tính bằng tổng các sự kiện hoàn của đơn; payload thiếu `checkout.id`: lưu thêm mã đơn Creem khi cấp (có thể cần cột mới, tức migration: hỏi chủ dự án trước) hay chấp nhận cảnh báo `payment_unmatched` | **2026-10-16: khác giả định ở webhook, đã sửa.** Sau hoàn đủ: `GET` phiên vẫn `completed` và `order.status` vẫn `paid`; chỉ giao dịch đổi `refunded` (`refunded_amount` 399). Webhook `refund.created` mang số hoàn ở `object.refund_amount`, còn `transaction.refunded_amount` là `null` (ảnh chụp trước khi cập nhật), nên mã cũ không bao giờ nhận hoàn đủ: đã đọc `refund_amount` và cộng dồn các lần hoàn từ nhật ký (test dùng payload thật). `dispute.created`: chưa đo (không tạo được ở sandbox). |
   | SP4 | S5: độ trễ từ lúc trả tới webhook và tới `GET` `completed` (2d) | `GET` đã `completed` khi webhook tới: giữ trả `200` `not_paid` cho webhook tới sớm | `GET` còn `pending` hay `processing` khi webhook ký đúng đã tới: trả `503` để Creem gửi lại sau 30 giây, hay đặt lại mốc để cron đối soát hỏi ngay lượt sau | 2026-10-16: webhook `checkout.completed` tới khoảng 2 giây sau lúc trả; `GET` hỏi sau đó (vài chục giây) đã `completed`. Chưa đo `GET` trong vài giây đầu: không ảnh hưởng (server có đường 503 để Creem gửi lại và cron đối soát). |
   | SP5 | S6: hạn sống của phiên Creem, phiên 9000002 sau 35 phút (2g) | Còn trả được sau 35 phút (hay không có hạn): giữ, app hỏi đơn thẻ tới khi server báo hết hạn hay 24 giờ trôi. Khách trả muộn được cấp key (webhook, đối soát); gói tính từ giờ trả: nếu một trường của đơn ghi ở 2g đúng là giờ trả (kết quả: `order.updated_at`, không phải `order.created_at`) thì dùng làm giờ thanh toán, không kẹp về hạn đơn 30 phút (xem **Điều cần biết** ở cuối mục) | Trang báo hết hạn hay `status` `expired` khi đã quá 35 phút: ghi thời điểm hết hạn; hạ hạn đơn thẻ của server cho khớp, sửa chữ ở app và website; nếu Creem có tham số hạn phiên (tài liệu đã tải không có) thì gửi | **2026-10-16: còn trả được sau 35,5 phút** (`GET` vẫn `pending`, trang vẫn nhận thẻ, webhook tới ~2 giây sau lúc trả, `GET` thành `completed`): hạn 30 phút chỉ là hạn của ta; trần của Creem chưa biết. `order.created_at` là lúc khách **mở trang**, không phải giờ trả; `order.updated_at` mới là giờ trả. Đã sửa: giờ trả của đơn Creem lấy từ `order.updated_at` và không kẹp về `expires_at`, nên khách trả muộn không mất đoạn trễ. |
   | SP6 | S10: payload `checkout.completed` của sản phẩm một lần (2f) | Có `object.request_id` đúng chuỗi `9000001`: giữ | Không có: đọc `object.metadata.order_code` hay tra theo `object.id`; dùng payload thật (che dữ liệu cá nhân) làm dữ liệu của test | **Đạt.** `checkout.completed` có `eventType`, `id` (`evt_…`), `object.request_id` đúng chuỗi mã đơn, `object.order`; 1,6 KB. `creem-signature` = HMAC-SHA256 hex của thân thô, khóa là secret của endpoint: khớp ở cả hai sự kiện đo (kiểm bằng `openssl`). |
   | SP7 | S7: ô mã giảm giá trên trang, tắt được không; tên và kiểu trường giảm giá ở `GET` và webhook (2d) | Có `discount_amount` (và `discount`) như OpenAPI; khi không giảm giá thì `order.discount` vắng hay `null`, có mặt thì là chuỗi mã; `discount` của phiên là chuỗi mã hay đối tượng: giữ luật không cấp tự động đơn có giảm giá | Tên trường khác: sửa luật theo tên thật. Kiểu khác (ví dụ `order.discount` là đối tượng, hay `{}` khi không giảm giá): server coi là dữ liệu hỏng và giữ **mọi** đơn có trường đó (`order_payment_review`): sửa luật theo kiểu thật. Ô mã giảm giá không tắt được: runbook nhấn mạnh **không** tạo mã giảm giá | Một phần. Trang thanh toán thử không có ô mã giảm giá; `order` không có `discount`/`discount_amount` khi không giảm giá (vắng). Kiểu trường khi CÓ mã giảm giá: chưa đo (không tạo mã); luật giữ đơn của ta chịu mọi kiểu. |
   | SP8 | S11: mã HTTP và thân khi khóa sai, khi thiếu khóa (2h) | `401` hay `403` kèm thân JSON có `trace_id` dạng chuỗi: giữ cảnh báo `creem_auth_failed` | Mã khác, thân không phải JSON hay thiếu `trace_id`: khóa sai sẽ **không** có cảnh báo (chỉ log); chỉnh luật nhận ra "khóa bị từ chối" theo thực tế, thêm test | **Đạt.** Khóa sai: `401`, `content-type` JSON, thân `{trace_id (chuỗi), status: 401, error: "Unauthorized", message: ["Invalid API Key"], timestamp}`. Thiếu khóa: `401` cùng dạng (`"API Key is missing"`). `POST` khóa sai: `401` cùng dạng. Khớp luật `creem_auth_failed`. |
   | SP9 | PayOS khóa sai (2h, tùy chọn) | `401` hay `403` kèm thân JSON: giữ cảnh báo `payos_auth_failed` | HTTP `200` kèm `code` khác `"00"`: hiện **không có cảnh báo** khóa PayOS (đơn VND mới lỗi `502`; chỉ thấy ở log `checkout_failed` hay khi khách báo): thêm luật theo `code` của PayOS (đổi file PayOS: cần chủ dự án duyệt) hay cảnh báo chung khi nhiều lần tạo đơn lỗi liên tiếp theo từng cổng | Chưa đo (PayOS: cần khóa sai thật của PayOS). |
   | SP10 | Host và đường dẫn của `checkout_url` (2b; đo lại ở bước 9) | `checkout.creem.io` và `/ch_…`: giữ | Host khác: đổi host được phép của server, danh sách host app được mở, cổng phát hành, website ("năm nơi" hay số nơi mới), chính sách quyền riêng tư mục 4 và test liên quan | **Đo ở production (2026-10-16, bước 9): khác tài liệu, đã sửa.** Creem production trả `https://www.creem.io/checkout/<mã sản phẩm>/<mã phiên>` (sandbox: `creem.io/test/checkout/…`; tài liệu: `checkout.creem.io/ch_…`). Mã cũ chỉ nhận `checkout.creem.io` nên đơn đầu tiên bị `502 payment_provider_error` (log `checkout_failed`: "checkout_url ngoài tên miền thanh toán"). Đã sửa: server nhận `www.creem.io` chỉ khi đường dẫn dưới `/checkout/` (vẫn nhận `checkout.creem.io`), app thêm `www.creem.io` vào `EXTERNAL_HOSTS` (cần bản app mới), trang Dữ liệu và bảo mật của website ghi `www.creem.io`. |
   | SP11 | S13: trang Creem tự ghi merchant of record và có liên kết Buyer Terms (2d) | Có: giữ câu của ta (thừa nhưng an toàn) | Không: câu của ta là nơi **duy nhất** báo trước khi trả (điều khoản Creem 3.7): kiểm lại app, EULA và website đều hiện câu đó **trước** nút trả | **Đạt.** Trang thanh toán ghi "Merchant of Record services by" kèm liên kết Terms và Privacy. Buyer Terms đã đọc: Creem là merchant of record (3.3.1); hoàn tiền: người mua liên hệ người bán trước (liên hệ in trên biên lai), Creem quyết theo điều khoản sản phẩm (9.3); người tiêu dùng EU với nội dung số đã đồng ý trước thì không có quyền rút lại (8.2); tranh chấp thẻ: liên hệ Creem trước (9.4). Việc: đặt email hỗ trợ của người bán ở dashboard. |
   | SP12 | S14: kích thước thân webhook (2f) | Mỗi thân dưới 16 KiB: giữ | Lớn hơn: nâng giới hạn thân riêng cho `/v1/webhooks/*` lên 64 KiB, thêm test | **Đạt.** 1587 byte (`checkout.completed`), 1669 byte (`refund.created`), xa dưới 16 KiB. |
   | SP13 | S3: `GET` phiên có `request_id` đúng chuỗi mã đơn, và `order` (khi đã có) là đối tượng có `status`, `currency`, `amount`, không phải chuỗi mã (2c, 2d) | Có cả hai: giữ | Thiếu `request_id` hay `order` chỉ là chuỗi mã: server **không bao giờ** tự cấp đơn Creem (mỗi lần hỏi đều lỗi; webhook trả `503`, đối soát có cảnh báo `order_check_failed`): không deploy; sửa `CreemProvider.getPaymentStatus` theo hình dạng thật (ví dụ đọc `metadata.order_code`), thêm test | **Đạt.** `GET` có `request_id` đúng chuỗi mã đơn; `order` là đối tượng có `status`, `currency`, `amount`, `sub_total`, `tax_amount`, `amount_paid`; phiên chưa trả không có `order`. Phản hồi `POST` tạo phiên **không** có `request_id` (chỉ có ở `GET` và webhook). |

   **Tình trạng spike (2026-10-16, Claude đo theo ủy quyền của chủ dự án, ở sandbox bằng khóa test, dữ liệu giả).** Đã đo xong: SP2, SP3 (đã sửa mã), SP4, SP5 (đã sửa mã), SP6, SP8, SP10 (đo ở production bước 9, đã sửa mã), SP11, SP12, SP13. **Còn lại, làm ở đơn thật (bước 9) hay bằng tay ở dashboard**: SP1 (sandbox không tính thuế nên chưa biết `amount` có gồm thuế; cần đơn thật bằng địa chỉ nước có VAT, nếu không làm được thì mã vẫn đúng ở cả hai cách hiểu nhưng phải theo dõi `order_payment_review` và `order_amount_mismatch` ở những đơn đầu có thuế), SP7 (kiểu trường khi có mã giảm giá: không tạo mã nên chưa đo; luật giữ đơn chịu mọi kiểu), SP9 (khóa sai PayOS), payload `dispute.created` thật (chỉ gặp khi có tranh chấp thật: nếu khác mẫu tài liệu thì chỉ thấy cảnh báo `payment_unmatched` hay `order_disputed` kèm `refunded_total` thiếu), và các mục 2h cần dashboard (S12 link mua công khai/Storefront có tắt được không; chữ trên sao kê; thư biên lai: người gửi và nội dung; email điền sẵn có sửa được không). Khóa test dùng cho spike đã bị lộ trong chat và file khóa đã xóa: vào Developers (Test Mode) xóa hay tạo lại khóa test.

   Điều ghi thêm (không có việc tự động; người quyết là chủ dự án và luật sư):

   | Điều ghi | Dùng vào |
   |---|---|
   | S12: link mua công khai và Storefront có tắt được không, tên nút (2h) | Bước 3 ghi cách tắt; không tắt được thì rủi ro "khách trả mà webhook không khớp đơn" còn đó, cảnh báo `payment_unmatched` là lưới an toàn |
   | D8: chữ trên sao kê (chỉ đo ở đơn thật bước 9), thư biên lai (người gửi, nội dung), email điền sẵn có sửa được không (2d, 2g) | Sửa câu nói về sao kê, biên lai và email ở app, EULA, website cho đúng thực tế (tài liệu Creem ghi sao kê "CREEM.IO* STORE"; EULA và website viết "thường ghi"; `docs/legal/README.md` xếp điều này vào "chờ đối chiếu bằng đơn thật": đối chiếu xong thì chuyển sang "Đã đối chiếu") |
   | Buyer Terms: luật hoàn tiền, quyền đổi ý, điều khoản nào thắng (2h) | Đưa luật sư đối chiếu mục hoàn tiền trong EULA và website |
   | Privacy Notice của Creem: dữ liệu Creem thu, vai trò bên kiểm soát (2h) | Đưa luật sư đối chiếu chính sách quyền riêng tư của ta |

3. **Ba sản phẩm production** (tắt Test Mode). Products > tạo ba sản phẩm: loại **một lần**, tiền tệ **USD**, **Tax mode: exclusive** (khách trả giá niêm yết cộng thuế), tên `AI Translator Monthly (30 days)`, `AI Translator 6 Months (180 days)`, `AI Translator Yearly (365 days)`, giá catalog 3,99, 21,99 và 39,99 USD (server gửi `custom_price` theo `PLANS` nên giá thật nằm ở server; giá catalog để khớp, và là giá mà người mở link công khai của sản phẩm sẽ thấy). **Danh mục thuế** (tax category) do chủ dự án chọn: Creem có `saas`, `digital-goods-service` và `ebooks`; app tải về chạy trên máy người dùng có thể hợp `digital-goods-service` hơn `saas` (chưa chắc thì hỏi kế toán). Ghi lại đã chọn gì.

   Cũng ở dashboard (tên nút và công tắc: S12 ở bước 2):

   - **Không** dùng nút Share hay Storefront; tắt link mua công khai của từng sản phẩm nếu có công tắc.
   - **Không tạo mã giảm giá nào** (đơn Creem có giảm giá không được cấp key tự động mà bị giữ chờ người vận hành, Q4); tắt affiliate và EvenDeals nếu tài khoản có.
   - Mã sản phẩm không phải bí mật, nhưng repo này công khai: ai cũng dựng được link mua trực tiếp từ mã `prod_…`. Người trả qua link như vậy không có đơn của ta: webhook đúng chữ ký mà không khớp đơn nào nên thành cảnh báo `payment_unmatched` (không cấp key; cách xử lý ở bước 12).

   Trên `main` (xem **Điều kiện trước khi bắt đầu**), chép mã `prod_…` của từng sản phẩm vào `CREEM_PRODUCT_IDS` trong `wrangler.jsonc`, rồi:

   ```bash
   git branch --show-current
   pnpm check
   ```

   Expected: `main`; `pnpm check` đạt (test `wrangler-config` đòi `CREEM_PRODUCT_IDS` có đúng ba khóa `monthly`, `six_months`, `yearly`, cả ba rỗng hay cả ba `prod_…` khác nhau; điền dở hay hai gói trùng mã thì đỏ). Rồi commit riêng file `server/wrangler.jsonc` (`chore(server): mã sản phẩm Creem production`), push lên `main`, chờ CI xanh.

4. **Webhook** ở dashboard (Test Mode tắt): Developers > Webhooks > thêm endpoint `https://api.aitranslator.io.vn/v1/webhooks/creem`, chỉ bật ba sự kiện `checkout.completed`, `refund.created`, `dispute.created`. Chép **secret ký** của endpoint (hiện khi tạo, xem lại được ở dashboard). Đừng bật sự kiện nào khác: server trả `200` và bỏ qua (log `webhook_ignored`), nhưng không cần. Sau bước 7, một sự kiện thử gửi từ dashboard (nếu bạn bấm) đúng chữ ký mà không thuộc đơn nào nên có thể thành cảnh báo `payment_unmatched`: bình thường, không cấp gì.

5. **Secret** (khóa **production** của Creem, ở Developers khi Test Mode tắt; không phải khóa test). Mỗi lệnh hỏi giá trị, không hiện ra màn hình. Đã đặt giá trị giữ chỗ (mục 4 bước 5 cho hai secret của Worker API, bước 8 cho `CREEM_API_KEY` của Worker admin) thì ba lệnh này ghi đè bằng giá trị thật:

   ```bash
   pnpm exec wrangler secret put CREEM_API_KEY
   pnpm exec wrangler secret put CREEM_WEBHOOK_SECRET
   pnpm exec wrangler secret put CREEM_API_KEY -c wrangler.admin.jsonc
   ```

   Expected: ba dòng `✨ Success! Uploaded secret …`. Hai Worker dùng cùng khóa API; Worker admin chỉ hỏi trạng thái phiên nên không có secret webhook (đừng đặt `CREEM_WEBHOOK_SECRET` cho Worker admin). Giữ cùng một khóa ở hai Worker là quyết định cho bản đầu (QĐ-2); nếu Creem cho tạo khóa chỉ đọc thì dùng khóa đó cho Worker admin. Rủi ro gốc của quyết định này: "chỉ đọc" chỉ là ràng buộc kiểu của mã, còn khóa API Creem ở Worker admin vẫn đầy quyền, theo tài liệu Creem khóa đó lấy lại được secret ký webhook, quản lý endpoint webhook và tạo được mã giảm giá; ai lấy được khóa ở Worker admin thì làm được những việc đó (tạo mã giảm giá cho chính mình, hay đọc secret để giả webhook), nên đây là bí mật nặng như khóa ở Worker API. Xem lại sau nghiệm thu (hướng khác: Worker admin hỏi trạng thái đơn qua Worker API, không giữ khóa Creem).

6. **Kiểm cấu hình trước khi deploy:**

   ```bash
   pnpm exec wrangler deploy --dry-run
   ```

   Expected: `--dry-run: exiting now.`; bảng binding có `env.CREEM_BASE_URL ("https://api.creem.io")` và `env.CREEM_PRODUCT_IDS` với ba mã `prod_…`.

7. **Deploy Worker API**, rồi làm ngay bước 8. Trước hết kiểm `main` sạch (hai lệnh `git` ở **Điều kiện trước khi bắt đầu**), rồi:

   ```bash
   pnpm check && pnpm exec wrangler deploy
   curl -s "$PROD/v1/health"; echo
   PL=$(curl -s "$PROD/v1/plans?plans=monthly,six_months,yearly"); printf '%s\n' "$PL"
   node -e 'const d = JSON.parse(process.argv[1]); console.log(d.suggested_currency, JSON.stringify(d.plans.map((p) => [p.code, p.prices])))' "$PL"
   PL0=$(curl -s "$PROD/v1/plans"); printf '%s\n' "$PL0"
   node -e 'const d = JSON.parse(process.argv[1]); console.log(JSON.stringify(d.plans.map((p) => p.code)))' "$PL0"
   ```

   Expected: như mục 4 bước 9 (`Uploaded mt-license`, `schedule: */5 * * * *`, `{"ok":true}`). Mỗi lần gọi `plans` in nguyên thân JSON trước; thân là `{"error":…}` thì lệnh `node` ngay sau nó báo lỗi: đọc thân đó. Lệnh `node` thứ nhất in `VND [["monthly",{"VND":50000,"USD":399}],["six_months",{"VND":269000,"USD":2199}],["yearly",{"VND":500000,"USD":3999}]]` (`VND` vì máy bạn ở Việt Nam; máy ở nước khác in `USD`). Lệnh thứ hai (không `?plans=`, như app đến 0.1.8 gọi) in `["monthly","yearly"]`: app đến 0.1.8 chỉ thấy hai gói, và app đến 0.1.9 chỉ đọc giá VND. `prices` không có `USD` thì Creem chưa bán: kiểm lại ba mã `prod_…` (bước 3 và 6) và hai secret của Worker API (bước 5).

   **Hồi quy PayOS** (đường VND cũng đi qua mã mới): tạo một đơn VietQR như app đến 0.1.9 tạo (không gửi `currency`). Đơn này tạo thật ở PayOS mà không ai trả: đừng quét mã; link thanh toán tự hết hạn sau 15 phút (đơn thành `expired` sau 24 giờ), không có thư nào gửi đi.

   ```bash
   printf 'Email của bạn: '; read -r EM
   R=$(curl -s -X POST "$PROD/v1/checkout" -H 'content-type: application/json' -d "{\"plan\":\"monthly\",\"email\":\"$EM\",\"consent\":true}")
   printf '%s\n' "$R"
   node -e 'const r = JSON.parse(process.argv[1]); console.log(JSON.stringify({ provider: r.provider, amount: r.amount, currency: r.currency, qr_code: typeof r.qr_code, host: new URL(r.checkout_url).host }))' "$R"
   ```

   Expected: dòng đầu là thân JSON có `order_code`; dòng cuối `{"provider":"payos","amount":50000,"currency":"VND","qr_code":"string","host":"pay.payos.vn"}`.

   **Kiểm cron chạy thật** (như mục 4 bước 9; lịch đã đăng ký vẫn có thể không chạy): mở một cửa sổ terminal khác, trong `server/` chạy `pnpm exec wrangler tail mt-license --format pretty`, rồi làm bước 8 trong lúc chờ. Expected: qua một mốc 5 phút có một sự kiện cron `*/5 * * * *` với log `{"event":"reconcile",…}`. Không thấy thì chạy `pnpm exec wrangler triggers deploy` rồi kiểm lại. Cron phải chạy trước bước 9: đối soát là đường thứ hai cấp key khi webhook trễ hay bị chặn.

8. **Deploy Worker admin** (ngay sau bước 7; kiểm `main` sạch lần nữa như **Điều kiện trước khi bắt đầu**):

   ```bash
   pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
   curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/admin/whoami"
   ```

   Expected: như mục 4 bước 10 (khi chưa đăng nhập Access thì không phải `5xx`). **Tải lại (F5) mọi tab Web Admin đang mở**: tab mở từ trước chạy giao diện cũ gặp server mới, có thể báo lỗi hay hiện thiếu. Đăng nhập Web Admin: Tổng quan và trang Đơn mở được như cũ; nút VND | USD ở Tổng quan chỉ hiện khi đã có đơn USD đã trả (kể cả đơn đã hoàn).

9. **Nghiệm thu bằng một đơn thật 3,99 USD** (chủ dự án trả bằng thẻ của mình). Phí: phí nền tảng của Creem là 3,9% + 0,40 USD, tính trên tổng đơn gồm thuế (khoảng 0,6 USD); thẻ Việt Nam trả bằng USD còn chịu phí giao dịch ngoại tệ của ngân hàng phát hành thẻ, và tiền hoàn về có thể lệch vì tỉ giá. Chưa chắc: Creem có thể soát rủi ro khi chủ cửa hàng tự mua ở cửa hàng của mình; bị hỏi thì giải thích đây là đơn nghiệm thu.

   Trước khi trả, mở một cửa sổ terminal khác, trong `server/` chạy `pnpm exec wrangler tail mt-license --format pretty` và để chạy suốt bước này (bằng chứng cho bước 10). Tạo đơn bằng `curl` như app mới sẽ làm:

   ```bash
   printf 'Email nhận key: '; read -r EM
   RESP=$(curl -s -X POST "$PROD/v1/checkout" -H 'content-type: application/json' -d "{\"plan\":\"monthly\",\"email\":\"$EM\",\"consent\":true,\"currency\":\"USD\"}")
   printf '%s\n' "$RESP"
   node -e 'const r = JSON.parse(process.argv[1]); console.log(JSON.stringify({ order_code: r.order_code, provider: r.provider, amount: r.amount, currency: r.currency, qr_code: r.qr_code, host: new URL(r.checkout_url).host, minutes: Math.round((r.expires_at - Date.now() / 1000) / 60) }))' "$RESP"
   node -p 'JSON.parse(process.argv[1]).checkout_url' "$RESP"
   ```

   Expected: dòng đầu là nguyên thân phản hồi (có `order_token`: đừng gửi cho ai). Thân là `{"error":"pricing_not_configured"}` thì Creem chưa bán (xem bước 7); `{"error":"payment_provider_error"}` thì Creem từ chối tạo phiên: đọc log `checkout_failed` trong cửa sổ `wrangler tail` (khóa sai thì còn có cảnh báo `creem_auth_failed`). Khi đó hai lệnh `node` sau báo lỗi: dừng ở đây. Đúng thì dòng thứ hai là `{"order_code":<số>,"provider":"creem","amount":399,"currency":"USD","qr_code":null,"host":"checkout.creem.io","minutes":30}` (29 hay 30), rồi địa chỉ `https://checkout.creem.io/…` (host khác là SP10). Mở địa chỉ đó, trả 3,99 USD (trang cộng thuế nếu nước của địa chỉ thanh toán có thu; ghi lại nước bạn nhập), rồi:

   ```bash
   CODE=$(node -p 'JSON.parse(process.argv[1]).order_code' "$RESP"); TOK=$(node -p 'JSON.parse(process.argv[1]).order_token' "$RESP")
   curl -s "$PROD/v1/orders/$CODE" -H "authorization: Bearer $TOK" | node -e 'const t = require("fs").readFileSync(0, "utf8"); try { const d = JSON.parse(t); console.log(JSON.stringify({ status: d.status, amount: d.amount, currency: d.currency, license_plan: d.license_plan, has_key: Boolean(d.license_key) })); } catch { console.log(t); }'
   ```

   Lệnh `curl` chạy lại bao nhiêu lần cũng được. Expected, theo `status`:

   - **`paid` vài giây sau khi trả:** `{"status":"paid","amount":399,"currency":"USD","license_plan":"monthly","has_key":true}`; thư chứa key tới `$EM` (từ `no-reply@mail.aitranslator.io.vn`); Web Admin > Đơn hiện đơn này với `$3,99` và cổng Creem; cửa sổ `wrangler tail` có `POST /v1/webhooks/creem` và không có `webhook_bad_signature`. Thành `paid` chỉ sau vài phút (ở lượt cron kế tiếp) mà không thấy `POST /v1/webhooks/creem` thì webhook bị chặn: làm bước 10 trước khi đi tiếp.
   - **Còn `pending` hay `processing`:** đối soát hỏi lại mỗi 5 phút. Vẫn vậy sau mười phút nghĩa là cả webhook lẫn đối soát đều không cấp được: đọc log `reconcile_failed` và `webhook_fulfil_failed` trong `wrangler tail` (có mã đơn và câu lỗi), xem có cảnh báo `creem_auth_failed` (khóa API bị từ chối: đặt lại như bước 5) hay `order_check_failed` (Creem trả dữ liệu server không đọc được: so với SP13 và SP2), rồi bước 10.
   - **`underpaid` hay `failed`: dừng, chưa phát hành app.** Creem báo đã thu tiền mà số tiền không như đơn (giảm giá, trả thấp hơn giá, giá gồm thuế khác giả định, hay dữ liệu tiền không đọc được): server giữ đơn, không cấp key, và có cảnh báo `order_payment_review` (thư tới `ops@` trong vòng một giờ). Xem trang Nhật ký của Web Admin, lọc theo hành động `order_underpaid` hay `order_amount_mismatch`: `detail` có `amount`, `provider_amount`, `amount_paid`, `currency` và, với Creem, `has_discount`, `provider_discount_amount`, `provider_amount_paid`, `provider_tax_amount`, `provider_malformed_fields`; trong `wrangler tail` có log `creem_malformed_paid_session` nếu có trường hỏng. Đối chiếu với S1 và các hàng SP1, SP7, SP13 của bảng spike, hoàn tiền đơn này ở dashboard Creem, báo lại để sửa mã, rồi làm lại bước 9 bằng một đơn mới.

   Khi đơn đã `paid`, xem phiên ở hai phía: server đọc phiên ra sao, và thân thật Creem trả (spike đo ở Test Mode, đây là production). Phiên `cloudflared` có thể đã hết hạn: chạy `cloudflared access login "$PADMIN"` trước. Khóa production gõ vào lúc chạy, đi vào `curl` qua đầu vào chuẩn, nên không nằm trên dòng lệnh, trong lịch sử shell hay trong danh sách tiến trình:

   ```bash
   CID=$(cloudflared access curl "$PADMIN/admin/lookup" -X POST -H 'content-type: application/json' -d "{\"order_code\":$CODE}" | node -e 'const t = require("fs").readFileSync(0, "utf8"); try { console.log(JSON.parse(t).orders[0].provider_ref); } catch { console.error(t.slice(0, 300)); }')
   printf '%s\n' "$CID"
   cloudflared access curl "$PADMIN/admin/orders/$CODE/payment-status"; echo
   ( : "${CID:?Chưa có CID: chạy lại dòng đầu của khối này}"
     printf 'Khóa API production của Creem: '; read -rs K; echo
     printf 'header = "x-api-key: %s"\n' "$K" | curl -s --config - "https://api.creem.io/v1/checkouts?checkout_id=$CID" | node -e '
       const t = require("fs").readFileSync(0, "utf8");
       let d;
       try { d = JSON.parse(t); } catch { console.log(t.slice(0, 300)); process.exit(1); }
       const kind = (v) => (v === null ? "null" : Array.isArray(v) ? "mảng" : typeof v);
       const o = d.order !== null && typeof d.order === "object" ? d.order : {};
       console.log(JSON.stringify({
         keys: Object.keys(d).sort(), same_id: d.id === process.argv[1], status: d.status, request_id: d.request_id,
         custom_price: d.custom_price, discount: kind(d.discount), order: kind(d.order), order_status: o.status, currency: o.currency,
         amount: o.amount, sub_total: o.sub_total, tax_amount: o.tax_amount, discount_amount: o.discount_amount,
         amount_paid: o.amount_paid, order_discount: kind(o.discount), created_at: o.created_at, updated_at: o.updated_at,
       }));
     ' "$CID" )
   ```

   Expected: dòng đầu là mã phiên `ch_…`. Lệnh `payment-status` in nguyên thân, là cách server đọc phiên: `{"orderCode":<số>,"status":"paid","amount":399,"amountPaid":399,"paidAt":<giây Unix>}`, với `paidAt` là `order.updated_at` của Creem (giờ trả) làm tròn xuống giây; `null` nghĩa là server không đọc được giờ đó (khi đó gói tính từ lúc xử lý). Lệnh cuối chỉ in hình dạng thân thật của Creem (tên trường, số tiền, trạng thái; không in email hay tên): `same_id` `true`, `status` `"completed"`, `request_id` đúng mã đơn dạng chuỗi (ví dụ `"1000123"`), `custom_price` `399`, `discount` `"undefined"` hay `"null"`, `order` `"object"`, `order_status` `"paid"`, `currency` `"USD"`, `sub_total` `399`, `amount_paid` bằng 399 cộng `tax_amount` (thuế có thể là 0 với địa chỉ ở Việt Nam), `discount_amount` `0` hay vắng, `order_discount` `"undefined"` hay `"null"`; ghi cả `created_at` và `updated_at` (SP5): `updated_at` là giờ trả (ISO 8601 có múi giờ; đổi ra giây Unix phải bằng `paidAt` ở dòng `payment-status`), `created_at` là lúc bạn mở trang thanh toán. Khác ở chỗ nào thì ghi lại, so với hàng SP1, SP2, SP7, SP13 của bảng spike, và báo lại trước khi phát hành app. Mấy ngày sau, xem sao kê thẻ ghi tên gì và thư biên lai Creem gửi `$EM` (D8).

   Rồi **hoàn tiền đủ đơn này ở dashboard Creem** (Transactions; Web Admin không hoàn tiền thay), chạy lại lệnh `curl … /v1/orders/$CODE` ở trên. Expected, theo `status`:

   - **`refunded` vài giây sau khi hoàn** (webhook `refund.created`; cửa sổ `wrangler tail` có thêm một `POST /v1/webhooks/creem`): Web Admin hiện đơn `refunded` kèm thẻ hoàn tiền (license còn hoạt động: server không tự thu hồi hay rút ngắn, spec D5), và trong vòng một giờ có thư cảnh báo `order_refunded` tới `ops@`. Thử làm theo thẻ ở trang đơn: với đơn mua mới này (license chỉ có đơn này) thẻ cho chọn **Rút ngắn hạn…** hay **Thu hồi**. Mở hộp Rút ngắn hạn… từ trang đơn (số ngày điền sẵn là phần của đơn, sửa được; gõ `RUT NGAN`, lý do bắt buộc; hạn mới phải sau bây giờ), rồi thu hồi license thử nếu không giữ.
   - **Vẫn `paid`, kèm cảnh báo `order_partially_refunded` hay `order_refund_unconfirmed`:** Creem báo hoàn chưa đủ, hay lần hoàn đang chờ hoặc thất bại. Xem lần hoàn ở dashboard Creem. Webhook thật mang số của **một** lần hoàn ở `object.refund_amount` (SP3), nên server cộng dồn các lần hoàn từng phần của đơn từ nhật ký (`refunded_amount` là số của lần đó, `refunded_total` là tổng; tổng ≥ số khách đã trả thì đơn thành `refunded`). Creem ghi đã hoàn đủ mà server vẫn ghi hoàn một phần: số trong payload khác giả định (SP3), báo lại. Lần hoàn còn chờ: Creem có thể không gửi thêm sự kiện khi hoàn xong, nên đơn có thể đứng `paid`: thu hồi license thử bằng tay (trang License > Thu hồi) và báo lại.
   - **Không thành `refunded`, không có cảnh báo nào sau mười phút:** webhook bị chặn, và đối soát không bao giờ biết đơn đã hoàn (đối soát chỉ hỏi đơn chưa trả). Làm bước 10, rồi gửi lại sự kiện từ dashboard Creem (Developers, nhật ký giao webhook); vẫn không được thì thu hồi license thử bằng tay. **Chưa phát hành app** khi hoàn tiền chưa tới được server.

10. **Webhook qua được tường lửa** (làm cùng bước 9; cron đã kiểm ở bước 7). Hoàn tiền và tranh chấp **chỉ** đến qua webhook: đối soát mỗi 5 phút chỉ hỏi đơn chưa trả (`pending`, `processing`, `underpaid`) để cấp key, không bao giờ biết đơn đã hoàn; Creem gửi lại webhook lỗi sau 30 giây, 5 phút, 30 phút, 6 giờ rồi thôi (không gửi sau 24 giờ). Webhook bị chặn thì khách vẫn có key (nhờ đối soát, chậm tới 5 phút), nhưng hoàn tiền và chargeback không bao giờ vào Web Admin, không có cảnh báo `order_disputed`, và có thể lỡ hạn nộp chứng cứ chargeback. Webhook chỉ được coi là qua được khi có đủ ba bằng chứng:

    - đơn ở bước 9 thành `paid` trong vài giây sau khi trả (qua cron thì mất tới 5 phút), và thành `refunded` vài giây sau khi hoàn;
    - cửa sổ `pnpm exec wrangler tail mt-license --format pretty` có các request `POST /v1/webhooks/creem`;
    - nhật ký giao webhook của endpoint ở dashboard Creem (Developers > Webhooks) báo các lần giao thành công (HTTP `200`).

    Rồi xem Cloudflare > Security > Events, lọc theo đường dẫn `/v1/webhooks/creem`, với **mọi** hành động (block, managed challenge, JS challenge, rate limit `429`), không chỉ `429`. Webhook của Creem không có IP cố định nên không allowlist theo IP được: luật WAF `webhook-rate-limit` (5 request mỗi 10 giây mỗi IP, đường dẫn `/v1/webhooks/`) áp cho cả Creem; thấy bị chặn thì nới luật riêng cho `/v1/webhooks/creem`. Kiểm **Bot Fight Mode** của zone `aitranslator.io.vn` (Security > Bots): Creem ghi rõ nó có thể chặn webhook và **không bỏ qua được bằng luật tùy chỉnh**; webhook Creem bị chặn thì tắt Bot Fight Mode cho zone. Sửa xong thì gửi lại các sự kiện bị lỡ từ dashboard Creem (Developers). Chưa đủ ba bằng chứng thì chưa sang bước 11.

11. **Pháp lý, app, rồi website.**
    - **Sửa ngày hiệu lực trước khi build app.** EULA 1.3 và chính sách 1.2 đang ghi hiệu lực 16/10/2026 (ngày chủ dự án chốt khi gộp nhánh `payment`). Ngày này hợp lệ nếu app và website phát hành từ hôm đó trở đi; chỉ đổi, trước khi nâng phiên bản app, nếu muốn khớp đúng ngày phát hành thật, theo mục "Đổi ngày hiệu lực" của `docs/legal/README.md` (dòng phiên bản ở đầu bốn file `docs/legal/{eula,privacy}.{vi,en}.md` và hai chỗ trong README đó; trang pháp lý của website tự lấy ngày cập nhật theo dòng phiên bản, không phải sửa tay), rồi commit lên `main`. Lý do: app đóng gói bốn file đó lúc build (`src/lib/legal.ts`), đổi sau thì app và website mang hai ngày khác nhau cho cùng một phiên bản. Ngày này **không được muộn hơn ngày deploy website**: trang pháp lý lấy ngày hiệu lực làm `lastmod` của sitemap, và test website ("`lastmod` không ở tương lai") đỏ khi ngày ở tương lai.
    - **App** theo mục 2 (nâng phiên bản ở đó). Bản app có Creem (sau 0.1.9) là bản mang EULA 1.3 và chính sách 1.2; người đã đồng ý EULA cũ không bị hỏi lại (chưa có cơ chế). **Nâng phiên bản app (từ 0.1.10, bản đầu có lựa chọn thẻ) thì chụp lại ảnh `app-upgrade*` ngay sau khi nâng:** chân thanh bên của ảnh ghi phiên bản thật (ảnh hiện tại ghi `0.1.9`, `shoot.mjs` đọc số từ `src-tauri/tauri.conf.json`; ảnh `app-about` cũng ghi phiên bản). Chỉ chụp được trên macOS (cần `cwebp`, `sips`, Google Chrome). Từ gốc repo, ở một cửa sổ terminal chạy `pnpm exec vite --config scripts/ui-preview/vite.config.ts --port 1431`, ở cửa sổ khác chạy `node scripts/ui-preview/shoot.mjs --port=1431 app-upgrade app-upgrade-usd app-upgrade-qr app-upgrade-card app-about`, rồi tắt Vite. Script ghi các file `.webp` và `manifest.json` ở `website/src/assets/img/app/`; commit lên `main` trước khi deploy website. Chi tiết ở `website/README.md` (mục ảnh chụp giao diện app).
    - **Thử bằng app thật**, sau khi bản app đã đăng lên R2 (kiểm R2 ở mục 2) và trước khi deploy website: (a) mua một đơn thẻ bằng app mới trên macOS (cả Windows nếu có máy): app mở trang `checkout.creem.io` trong trình duyệt và tự kích hoạt khi đơn `paid`; rồi hoàn tiền đơn đó như bước 9; (b) mua một đơn VietQR bằng app mới: vẫn có mã QR và tự kích hoạt như trước; (c) mở app 0.1.9 (máy chưa cập nhật): màn hình Nâng cấp chỉ có VietQR.
    - **Không hạ cấp app** (cài lại bản cũ hơn) khi đang có đơn thẻ chờ: bản đến 0.1.9 không đọc được đơn thẻ do bản mới ghi, nên không tự kích hoạt (khách không mất tiền: server vẫn cấp key và gửi qua email; nhập key từ email). Khi thử bằng app dev (`scripts/run-dev-app.sh`): app dev dùng chung mục Keychain với bản đã cài trên cùng máy, nên đơn chờ của app dev hiện ở bản đã cài và ngược lại.
    - **Website sau cùng**, chỉ khi: bản app có Creem đã đăng; Creem đang bán thật (bước 9 và 10 đạt); ảnh `app-upgrade*.webp` khớp giao diện Nâng cấp của bản app vừa phát hành (ảnh mới đã chụp lại ở hardening, chỉ đăng khi Creem bán thật; giao diện còn đổi thì chụp lại theo `website/README.md`). **Điều kiện cứng:** không deploy website nếu chưa có EULA 1.3 và chính sách 1.2 trong cùng lần deploy. Rồi `cd ../website && pnpm deploy` (các lệnh của mục này chạy trong `server/`).
    - **Tên trên sao kê:** `docs/legal/README.md` ghi "CREEM.IO* STORE" là đọc từ tài liệu Creem, chưa đối chiếu bằng đơn thật (EULA và website viết "thường ghi"). Khi sao kê thẻ của đơn bước 9 có, đối chiếu; khác thì sửa README pháp lý, EULA và website (đổi chữ EULA là lên phiên bản mới, kèm ngày hiệu lực mới theo README đó).

12. **Chi trả, theo dõi, hỗ trợ khách.**
    - **Chi trả.** Bấm rút (Withdraw, ở Balances) khi số dư từ 50 USD; Creem chi trả vào ngày 1 hay ngày 15 kế tiếp (rơi vào cuối tuần hay ngày lễ thì sang ngày làm việc sau). Tiền mới bán bị giữ 7 đến 12 ngày để xét rủi ro: ví dụ đợt ngày 15 chỉ gồm tiền của các đơn trước ngày 8 (S9). Phí rút là 7 USD hay 1% số rút, lấy mức cao hơn: rút dưới khoảng 700 USD thì mất đúng 7 USD (con số 700 là ta tự tính từ hai mức đó, không phải số của Creem), nên rút gộp đỡ phí; nhưng vẫn giữ số dư ở Creem thấp, vì điều khoản 10.5 cho Creem giữ, trì hoãn hay đóng băng chi trả. Tài khoản nhận không phải USD thì đối tác ngân hàng của Creem quy đổi và thu phí quy đổi (ngoài tầm Creem), ngân hàng nhận có thể thu thêm; ta chịu mọi phí nhận tiền (điều khoản 10.7). Ghi lại số thật ở **lần rút đầu tiên** (S8).
    - **Hóa đơn.** Creem lập hóa đơn ngược (self-billed invoice, tải ở trang Balances, phần lịch sử chi trả) cho mỗi lần rút: xem từng hóa đơn và phản đối bằng văn bản **trong 3 ngày làm việc** nếu sai (điều khoản 8.2; quá hạn coi như đã chấp nhận), rồi đưa kế toán. Với giao dịch qua Creem, ta **không được** tự xuất hóa đơn hay biên lai cho người mua (điều khoản 9.3.1): Creem gửi biên lai tới email khách nhập. Thuế của hộ kinh doanh với khoản Creem chi trả: hỏi kế toán (`docs/legal/README.md`, mục "Câu hỏi cho kế toán").
    - **Cảnh báo** (thư tới `ops@`): cron gửi, mỗi loại tối đa một thư mỗi giờ. Thư không mang mã đơn: tìm đơn ở trang Nhật ký của Web Admin, lọc theo hành động. Trang Hệ thống của Web Admin liệt kê cảnh báo.

      | Cảnh báo | Nghĩa | Làm gì |
      |---|---|---|
      | `order_payment_review` | Cổng báo đã trả mà số tiền không như đơn, nên đơn không được cấp tự động: đơn Creem có giảm giá, trả thấp hơn giá hay dữ liệu tiền không đọc được (`underpaid`); số tiền khác giá đơn ở mọi cổng, kể cả PayOS (`failed`) | Lọc nhật ký theo `order_underpaid` hay `order_amount_mismatch` (đơn `underpaid` còn có ở trang Việc cần xử lý, đơn `failed` thì không), rồi làm như **Đơn bị giữ** dưới |
      | `creem_auth_failed` | Creem từ chối khóa API (HTTP `401` hay `403` có thân JSON của Creem): khóa sai, bị thu hồi hay thiếu quyền. Đơn USD mới lỗi `502`. `403` dạng HTML của tường lửa, `429`, `5xx` hay lỗi mạng không tạo cảnh báo này | Thay khóa ở dashboard Creem, đặt lại `CREEM_API_KEY` cho **cả hai** Worker (lệnh dưới bảng). Cảnh báo đến từ đối soát nghĩa là có thể có đơn khách **đã trả** đang chờ: thay khóa **trong 24 giờ** (quá 24 giờ đơn thành `expired`, phải Cấp tay) |
      | `payos_auth_failed` | Như trên, với PayOS (thân JSON của PayOS). Đơn VND mới lỗi `502`. PayOS báo khóa sai bằng HTTP `200` kèm `code` lỗi thì **không** có cảnh báo này (SP9) | Đặt lại `PAYOS_CLIENT_ID` và `PAYOS_API_KEY` cho cả hai Worker (lệnh dưới bảng); cùng mốc 24 giờ |
      | `order_check_failed` | Đối soát hỏi trạng thái một đơn của cổng **khác PayOS (hiện là Creem)** mà đơn **đã có mã phiên** (`provider_ref`), và Creem trả lời mà không đọc được thành trạng thái đơn: dữ liệu mâu thuẫn hay sai dạng (không có mã HTTP, hay `2xx` mà thân không dùng được), chuyển hướng `3xx`, hoặc `404`. Mỗi lượt đối soát mỗi đơn lỗi đếm một lần, thư gộp theo giờ. Lỗi tạm (`5xx`, `429`, quá thời gian, lỗi mạng) và lỗi khóa (`401`, `403`: `creem_auth_failed`) **không** sinh cảnh báo này; đơn PayOS và đơn chưa có mã phiên cũng không (đối soát chỉ ghi log `reconcile_failed`) | Đọc log `reconcile_failed` (có `order_code` và câu lỗi), tìm đơn trên dashboard Creem; khách đã trả thì Cấp tay ở Web Admin (đơn chờ thành `expired` sau 24 giờ, vẫn Cấp tay được). Nhiều đơn cùng lúc: Creem đã đổi định dạng (so với SP2 và SP13), báo lại để sửa mã |
      | `payment_unmatched` | Webhook đúng chữ ký mà không khớp đơn nào: khách trả qua link công khai hay Storefront của sản phẩm, sản phẩm khác cùng tài khoản Creem, hay sự kiện thử gửi từ dashboard (sự kiện thử thì bình thường). Không cấp key | Lọc nhật ký theo `payment_unmatched` (có loại sự kiện và mã ở Creem: `ch_` là phiên, `ref_` lần hoàn, `disp_` tranh chấp), tra mã đó ở dashboard Creem. Khách trả thật: tạo license tay ("Cấp license mới…", ghi mã Creem vào ghi chú) hay hoàn tiền ở dashboard Creem. Hoàn tiền hay tranh chấp mà phiên là của một đơn của ta (`request_id` của phiên là mã đơn): server không tìm được đơn theo mã phiên nên đơn **không** tự thành `refunded`; mở đơn đó ở Web Admin: đơn `paid_needs_review` thì bấm Ghi đã hoàn tiền, trạng thái khác thì Web Admin chưa có nút ghi hoàn (đơn chưa cấp vẫn có thể được cấp tự động): thu hồi hay rút ngắn hạn license như **Hoàn tiền** dưới |
      | `order_refunded` | Cổng báo một đơn đã hoàn đủ: đơn thành `refunded` (ở mọi trạng thái) và không bao giờ được cấp key nữa; license đã cấp (nếu có) giữ nguyên | Lọc nhật ký theo `order_refunded`, mở đơn, làm theo thẻ (**Hoàn tiền** dưới) |
      | `order_partially_refunded` | Hoàn một phần: trạng thái đơn không đổi (thường vẫn `paid`); nhật ký có số của lần này (`refunded_amount`) và tổng đã hoàn của đơn (`refunded_total`); lần hoàn làm tổng đủ số khách đã trả là `order_refunded` | Lọc nhật ký theo `order_partially_refunded`, mở đơn (thẻ cảnh báo dẫn tới nhật ký); muốn rút ngắn tương ứng thì dùng Rút ngắn hạn… ở trang license, ghi mã đơn và số đã hoàn vào lý do |
      | `order_refund_unconfirmed` | Một lần hoàn chưa thành công (đang chờ hay thất bại): trạng thái đơn không đổi, nên đơn chưa cấp vẫn có thể được cấp tự động | Kiểm lần hoàn ở dashboard Creem (hoàn xong sau đó thì Creem có thể không báo thêm); hoàn xong thì xử lý license như hoàn đủ |
      | `order_disputed` | Khách mở tranh chấp (chargeback). Luôn có cảnh báo, kể cả khi đơn đã `refunded`; Creem báo đã lấy lại đủ tiền thì đơn thành `refunded` | **Tranh chấp** dưới |
      | `webhook_bad_signature` | Webhook sai chữ ký: giả mạo, secret webhook của Worker API khác secret ký của endpoint (Creem), hay checksum key sai (PayOS) | Vài lần lẻ: bỏ qua. Liên tục, nhất là sau khi đổi endpoint: đặt lại `CREEM_WEBHOOK_SECRET` của Worker API bằng secret ký của endpoint |

      Đặt lại khóa khi có `creem_auth_failed` (thay khóa ở dashboard Creem trước; mỗi lệnh hỏi giá trị, secret mới có hiệu lực ngay, không phải deploy lại):

      ```bash
      pnpm exec wrangler secret put CREEM_API_KEY
      pnpm exec wrangler secret put CREEM_API_KEY -c wrangler.admin.jsonc
      ```

      Khi có `payos_auth_failed` (lấy khóa ở my.payos.vn):

      ```bash
      pnpm exec wrangler secret put PAYOS_CLIENT_ID
      pnpm exec wrangler secret put PAYOS_API_KEY
      pnpm exec wrangler secret put PAYOS_CLIENT_ID -c wrangler.admin.jsonc
      pnpm exec wrangler secret put PAYOS_API_KEY -c wrangler.admin.jsonc
      ```

    - **Log cần theo dõi** (chỉ đọc): `pnpm exec wrangler tail mt-license --format pretty` khi theo dõi trực tiếp (Worker admin: `pnpm exec wrangler tail mt-license-admin --format pretty`); chuyện đã qua thì xem Workers Logs ở dashboard Cloudflare (Workers & Pages > `mt-license` > Logs, lưu có hạn). Đáng để ý:
      - `reconcile_failed` (`order_code`, `error`): đối soát hỏi cổng lỗi ở một đơn; `reconcile_alert_failed`: đối soát không ghi được cảnh báo (D1 lỗi), nên cảnh báo đó không có thư.
      - `webhook_fulfil_failed` (`order_code`): webhook thanh toán chưa xử lý được (server trả `503`; Creem gửi lại, đối soát cũng thử); `webhook_unmatched_failed`, `webhook_refund_failed`: không ghi được sự kiện không khớp đơn hay sự kiện hoàn tiền (server trả `503`, Creem gửi lại).
      - `webhook_ignored` (`event_type`): Creem gửi loại sự kiện server không xử lý (bật nhầm ở dashboard, hay Creem thêm loại mới).
      - `creem_malformed_paid_session` (`order_code`, `provider_ref` là mã phiên Creem, `fields` là tên trường hỏng như `order.discount`, `order.currency`, `checkout.status`, `order.status`): phiên đã thu tiền mà dữ liệu không đọc được; đi cùng cảnh báo `order_payment_review`.
      - `checkout_failed` (`order_code`, `provider`, `error`): tạo phiên ở cổng lỗi, khách thấy lỗi; `checkout_alert_failed`: không ghi được cảnh báo khóa.
      - `admin_no_gateway` (Worker admin, `provider`): Worker admin không có cổng của đơn, ví dụ `CREEM_API_KEY` của Worker admin rỗng: đặt lại khóa đó.
    - **Hằng tuần:** đối chiếu trên dashboard Creem với Web Admin hai thứ. (1) **Đơn Creem đã trả ↔ Web Admin:** số đơn đã trả trong tuần ở dashboard Creem (Transactions) với số đơn `paid` cổng Creem ở trang Đơn. Đơn đã trả ở Creem mà Web Admin không có `paid` thì tìm đơn đó (mã phiên `ch_…` của Creem là `provider_ref`, `request_id` của phiên là mã đơn) ở Việc cần xử lý, nhật ký và các cảnh báo `order_check_failed`, `order_payment_review`, `payment_unmatched`; khách trả muộn hơn 24 giờ mà webhook mất thì không ai được báo (xem **Trả muộn** ở **Điều cần biết**), nên bước này là lưới an toàn duy nhất; khách đã trả thì Cấp tay. (2) **Hoàn tiền và tranh chấp:** đối chiếu với trang Nhật ký của Web Admin (lọc theo `order_refunded`, `order_partially_refunded`, `order_refund_unconfirmed`, `order_disputed`, `payment_unmatched`). Sự kiện mà Creem đã thôi gửi lại chỉ còn thấy ở dashboard: gửi lại từ dashboard Creem (Developers) hay xử lý tay. Kiểm cron sau **mỗi** lần deploy (sự cố cron 2026-10-07).
    - **Hoàn tiền.** Chỉ làm ở dashboard Creem (Web Admin không hoàn tiền thay). Webhook `refund.created` hoàn đủ chuyển đơn ở **mọi** trạng thái sang `refunded` (đơn chưa cấp thì không bao giờ được cấp key nữa) và tạo cảnh báo `order_refunded`; server không tự đụng license (spec D5). Mở đơn `refunded` ở Web Admin và làm theo thẻ:
      - đơn gia hạn, hay license còn đơn đã trả khác: **Rút ngắn hạn…** đúng số ngày đơn đã cộng, đừng thu hồi (license còn thời gian khách đã trả ở đơn khác);
      - đơn mua mới mà license chỉ có đơn này: Thu hồi hay Rút ngắn hạn…, tùy bạn;
      - đơn đổi gói: khách vẫn giữ gói mới (rút ngắn không đổi lại gói); thẻ cho rút ngắn số ngày tự chọn.

      Hộp **Rút ngắn hạn…** có ở trang đơn `refunded` và trang license: gõ `RUT NGAN`, lý do bắt buộc, hạn mới luôn sau bây giờ (muốn lấy hết thì Thu hồi). Rút phần của một đơn đã hoàn thì mở hộp **từ trang đơn**, để nhật ký gắn mã đơn. EULA chỉ cho rút ngắn hay thu hồi khi đơn được hoàn tiền, nên rút từ trang license (không kèm mã đơn) thì ghi lý do thật rõ. Token đang có trên máy khách giữ hạn cũ tới lần làm mới kế tiếp (app kiểm lại mỗi 24 giờ; máy không có mạng dùng tiếp tối đa 14 ngày). Rút ngắn có thể làm khách hết hạn mức của chu kỳ ngay (chu kỳ cuối tính theo số ngày còn lại). Nút **Ghi đã hoàn tiền** (chỉ ở đơn `paid_needs_review`) là bước dự phòng khi webhook hoàn đủ trễ hay mất: bình thường webhook đã chuyển đơn sang `refunded`. Hoàn một phần: đơn giữ `paid` cho tới khi tổng các lần hoàn từng phần của đơn đủ số khách đã trả (khi đó thành `refunded`).
    - **Tranh chấp (chargeback).** Khi Creem yêu cầu, gửi chứng cứ và thông tin kịp thời (điều khoản 11.5). Người bán chịu toàn bộ chi phí chargeback, gồm cả phí (điều khoản 11.6; điều khoản 10.6 có "dispute fees" mà không ghi số: con số 25 USD mỗi vụ là của nguồn bên thứ ba, chưa kiểm). Creem báo đã lấy lại đủ tiền thì đơn thành `refunded`: xử lý license như **Hoàn tiền**. Thắng tranh chấp (tiền về lại): đơn vẫn `refunded` (Web Admin chưa có thao tác đưa đơn về `paid`, QĐ-4), nên doanh thu thống kê hụt khoản đó.
    - **Đơn bị giữ** (`underpaid` hay `failed`, kèm `order_payment_review`). Mở đơn ở Web Admin (thẻ ở trang đơn nói lý do: mã giảm giá, số đã nhận không gồm thuế so với giá, hay tên các trường hỏng), bấm "Xem trạng thái trên Creem", và tra phiên trên dashboard Creem (log `creem_malformed_paid_session` có mã phiên):
      - khách trả đủ giá (chỉ dữ liệu của Creem là lạ): **Cấp tay** ở trang đơn, ghi lý do. Cấp tay ghi doanh thu bằng `amount_paid` của đơn, mà đơn Creem bị giữ vì dữ liệu hỏng có `amount_paid` 0: doanh thu thống kê ghi thiếu (API cấp tay không nhập số tiền). Đơn `underpaid` được đối soát hỏi lại trong 24 giờ kể từ lúc tạo: nếu Creem trả lại dữ liệu đúng thì đối soát đã tự cấp key, và Cấp tay trả `409` `already_paid` (không cần làm gì nữa);
      - khách dùng mã giảm giá hay trả thiếu: chấp nhận giá đã giảm thì Cấp tay; không thì **hoàn tiền ở dashboard Creem**, webhook hoàn tiền chuyển đơn sang `refunded`;
      - đơn VietQR `underpaid` (khách chuyển thiếu) vẫn không có cảnh báo, như trước: khách chuyển bù thì server tự cấp, hay Cấp tay sau khi xác minh khoản bù.
    - **Hỗ trợ khách.** Trả lời yêu cầu của khách mua bằng thẻ trong 3 ngày làm việc (theo tài liệu hỗ trợ của Creem, không trả lời thì Creem có thể hoàn tiền thay). Biên lai là của Creem, gửi tới email khách nhập. Khách trả hai lần (ví dụ hủy đơn trong app rồi vẫn trả ở trang Creem của đơn cũ còn mở): server cấp key cho mỗi đơn đã trả và gửi qua email, nhưng app chỉ tự kích hoạt đơn đang theo dõi; khách xin thì hoàn một đơn ở dashboard Creem. Khách nói đã trả mà không có key: tra theo email ở Web Admin, xem trạng thái trên Creem; không có đơn nào thì có thể là trả qua link công khai (`payment_unmatched`).

**Điều cần biết.**

- **Trả muộn.** Phiên Creem còn trả được sau hạn 30 phút của ta (đo ngày 2026-10-16 ở sandbox: sau 35,5 phút vẫn nhận thẻ, webhook tới khoảng 2 giây sau lúc trả; trần của Creem chưa biết). Giờ thanh toán của đơn Creem là `order.updated_at` của Creem (giờ trả; `order.created_at` chỉ là lúc khách mở trang), không muộn hơn lúc xử lý và **không** kẹp về hạn của đơn (`expires_at`): khách trả muộn mà đơn còn được xử lý được tính gói **từ giờ trả thật**, không mất đoạn trễ. Webhook `checkout.completed` luôn cấp được key, kể cả đơn đã `expired` (`expired` không thuộc nhóm đơn đã xong); đối soát (lưới thứ hai khi webhook mất) chỉ hỏi đơn `pending`, `processing`, `underpaid` tạo trong 24 giờ, sau đó đơn thành `expired`. `cycle_anchor` của license mới và `paid_at` trong nhật ký `license_issued` theo giờ trả; cột `paid_at` của đơn vẫn là lúc xử lý. Không đọc được `order.updated_at` (thiếu, sai dạng, ngoài khoảng 2020 đến 2100) thì dùng lúc xử lý. PayOS giữ cách cũ (kẹp về hạn của link, vì link PayOS hết hạn thì không nhận tiền nữa). **Hai giới hạn thật còn lại:** (1) khách trả sau mốc 24 giờ chỉ được cấp nhờ webhook tới đúng lúc trả; (2) nếu webhook đó mất (Creem gửi lại sau 30 giây, 5 phút, 30 phút, 6 giờ rồi thôi) thì khách không có key và **không có cảnh báo nào**: đối soát không hỏi đơn `expired`, và đơn `expired` không nằm ở Việc cần xử lý. Đường duy nhất thấy khoản này là đối chiếu hằng tuần ở bước 12 (đơn đã trả trên dashboard Creem mà Web Admin không có `paid`); khách đã trả thì Cấp tay, và Cấp tay tính gói từ lúc bạn bấm, không từ giờ khách trả.
- **Doanh thu USD** ở Web Admin là số đã thu (không gồm thuế), chưa trừ phí Creem; hoàn một phần không được trừ; đơn đã hoàn đủ không tính (kể cả khi sau đó thắng tranh chấp); đơn cấp tay tính bằng `amount_paid` của đơn (đơn Creem bị giữ vì dữ liệu hỏng là 0). Tiền thật nhận được xem ở Balances của Creem.
- **PayOS cũng đổi một chút** (khác câu "hành vi PayOS không đổi" của spec cũ): đơn VietQR có số tiền khác giá đơn (`failed`) nay có cảnh báo `order_payment_review` (trước chỉ có nhật ký), và khóa PayOS bị từ chối có loại cảnh báo riêng `payos_auth_failed`. Đơn khách chuyển thiếu (`underpaid`) vẫn không có cảnh báo. Đối soát PayOS gặp lỗi không đọc được (404, chữ ký phản hồi sai, dữ liệu lạ, HTTP `200` kèm `code` lỗi) chỉ ghi log `reconcile_failed`, **không** có cảnh báo `order_check_failed` (loại này chỉ dành cho Creem: lỗi tạm của PayOS ra giống dữ liệu hỏng, nên cảnh báo sẽ là cảnh báo giả mỗi khi PayOS chậm).

**Đường lui.**

- **Chưa có đơn Creem thật:** `pnpm exec wrangler rollback` (Worker API) và `pnpm exec wrangler rollback -c wrangler.admin.jsonc` (Worker admin), **lùi cả hai**.
- **Đã có đơn Creem thật thì không lùi Worker**: Worker cũ không có cổng `creem` (webhook `404`, đơn pending không được cấp, Worker admin không đọc được đơn USD). Có lỗi thì sửa tiến, hay tắt bán thẻ như dưới.
- **Tắt bán thẻ khẩn cấp** (không lùi Worker, không đụng secret):
  1. Kiểm `main` sạch (hai lệnh `git` ở **Điều kiện trước khi bắt đầu**).
  2. Trong `wrangler.jsonc`, đặt **cả ba** mã của `CREEM_PRODUCT_IDS` về `""` (để lại một hay hai mã thì `pnpm check` đỏ). Commit lên `main`, push.
  3. `pnpm check && pnpm exec wrangler deploy` (chỉ Worker API; Worker admin không cần deploy lại).
  4. Kiểm: `curl -s "$PROD/v1/plans?plans=monthly,six_months,yearly"; echo` không còn `USD` trong `prices`.

  Kết quả: server thôi nhận đơn USD mới, và app thôi hiện lựa chọn cách trả khi tải lại bảng gói; màn hình Nâng cấp đang mở vẫn hiện thẻ tới khi người dùng mở lại màn hình (bấm trả bằng thẻ lúc đó thì server từ chối và app báo lỗi). Webhook Creem (thanh toán, hoàn tiền, tranh chấp) và đối soát đơn Creem đang chờ **vẫn chạy**: đơn khách đã trả vẫn được cấp key. **Không xóa** `CREEM_API_KEY` hay `CREEM_WEBHOOK_SECRET`: xóa thì webhook trả `404` (hoàn tiền và tranh chấp mất) và đơn Creem đang chờ không được cấp. Website đang hứa có thẻ (Bảng giá, Trang chủ, Câu hỏi thường gặp, hướng dẫn mua): sửa chữ cho đúng rồi deploy website (`cd ../website && pnpm deploy`; test website chặn vài câu cũ kiểu "chỉ VietQR", xem `website/README.md`). Hủy webhook ở dashboard Creem chỉ khi thôi hẳn Creem, và chỉ sau khi đã đối chiếu xong mọi hoàn tiền và tranh chấp.
- **Bật lại:** điền lại ba mã `prod_…` (như bước 3), commit lên `main`, `pnpm check && pnpm exec wrangler deploy`, kiểm `GET /v1/plans` có `USD` như bước 7, rồi sửa lại website.
- **Cổng Creem mất hẳn** (khóa hay secret của Worker API bị xóa, hay Worker bị lùi về bản không có Creem): webhook Creem trả `404`, đối soát đơn Creem lỗi ở mọi lượt (chỉ có log `reconcile_failed`, không có cảnh báo), nhưng đơn chưa bị hủy. Dựng lại cổng trong 24 giờ kể từ lúc tạo đơn thì đối soát tự cấp đơn đang chờ, không cần cấp tay. Quá 24 giờ thì đơn thành `expired`: xem trạng thái thật trước (dashboard Creem, hay Web Admin > đơn > Xem trạng thái trên Creem nếu Worker admin còn khóa), khách đã trả thì Cấp tay (ghi lý do; doanh thu của đơn ghi 0, như **Đơn bị giữ**). Hoàn tiền và tranh chấp tới trong lúc webhook `404` thì mất sau các lần gửi lại: đối chiếu ở dashboard Creem như việc **hằng tuần**.

## 10. Đợt thêm báo cáo lỗi tự động (migration D1 0004)

Spec `2026-10-17-diagnostics-reports-design.md` (mục 3, 8 và 9), kế hoạch `2026-10-17-bao-cao-loi-01-server.md` đến `2026-10-17-bao-cao-loi-05-phap-ly-website.md`. **Mỗi bước chỉ làm khi chủ dự án cho phép**; các lệnh ghi vào production do chủ dự án chạy. Thứ tự không đổi được: migration, Worker API, Worker admin, app, website cùng chính sách. Chạy trong `server/`; `PROD` và `PADMIN` như mục 4.

Vì sao thứ tự này: migration 0004 chỉ **thêm** hai bảng (`error_reports`, `error_report_logs`) và ba index, không đổi bảng nào đã có, nên Worker cũ vẫn chạy đúng trên schema mới; Worker API mới cần hai bảng để nhận báo cáo; app mới gọi `POST /v1/diagnostics`, nên server phải lên trước app (app lên trước thì nhận `404`, coi là lỗi vĩnh viễn và bỏ báo cáo: người dùng không thấy lỗi gì nhưng mất báo cáo); website và chính sách chỉ được nói điều đã thật nên đi sau cùng. Hai Worker không ràng buộc nhau chặt như ở mục 8 (Worker admin chỉ đọc và xóa hai bảng mới, Worker API chỉ ghi), nhưng nên lên liền nhau để Web Admin thấy ngay báo cáo.

**Điều kiện trước khi bắt đầu.** Chỉ làm khi đủ cả bốn điều:

- **Mã xong và đã gộp.** Kế hoạch 01 đến 05 đã làm và đã rà, đã gộp vào `main` (chủ dự án quyết lúc nào), CI xanh, `pnpm check` trong `server/` xanh trên `main`.
- **A7 đã chạy lại (XONG 2026-10-17, đạt: `bench/phase1/results/acceptance/a7-mac-reports.md`; trang Dữ liệu và bảo mật và `docs/legal/README.md` đã sửa theo số đo)** bằng proxy trên macOS với một bản build có tính năng này (cách build: `docs/huong-dan-build/build-dmg-macos.md`), có một báo cáo đang xếp hàng trên đĩa: trong lúc dịch không có request nào, và báo cáo chỉ đi tới `api.aitranslator.io.vn` sau khi phiên dừng. Ghi số đo (ngày, máy, bản dựng). Rồi sửa câu "chúng tôi chưa đo lại điều này bằng proxy" ở mục "Chúng tôi đã kiểm tra điều đó thế nào?" của trang Dữ liệu và bảo mật (`website/src/content/{vi,en}/data-security.mjs`) và đoạn "Báo cáo lỗi, chưa đối chiếu bằng số đo thật" của `docs/legal/README.md` cho khớp số đo.
- **Ngày hiệu lực chính sách 1.3 đã đặt** theo `docs/legal/README.md`, mục "Đổi ngày hiệu lực" (kế hoạch 05, Task 8), **trước khi build app**: app đóng gói chính sách lúc build.
- **Ảnh chụp của website đã được chụp lại** theo giao diện của bản app sắp phát hành (kế hoạch 05, Task 5).

1. **Kiểm trước khi áp (chỉ đọc), ghi lại kết quả để so sau.**

   ```bash
   pnpm exec wrangler d1 time-travel info mt-license-production
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT name FROM sqlite_master WHERE name LIKE 'error_report%'"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM licenses) AS licenses, (SELECT COUNT(*) FROM orders) AS orders, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"
   ```

   Expected: `time-travel info` in mốc hiện tại (chép lại); câu thứ hai không trả dòng nào (chưa có bảng báo cáo); chép lại ba số của câu thứ ba (`licenses`, `orders`, `orders_seq`); `foreign_key_check` không trả dòng nào. Đã có bảng `error_report%` thì dừng và báo: ai đó đã áp tay.

2. **Áp migration lên production.** Migration chỉ tạo bảng nên không cần khôi phục dữ liệu nếu lỗi (wrangler hoàn tác chính migration đó); vẫn chụp lại mốc:

   ```bash
   pnpm exec wrangler d1 time-travel info mt-license-production
   pnpm exec wrangler d1 migrations apply mt-license-production --remote
   ```

   Expected: `migrations apply` liệt kê chỉ `0004_error_reports.sql`, hỏi xác nhận (trả lời `y`), rồi `✅`. Lỗi thì dừng, không deploy Worker, báo chủ dự án.

3. **Kiểm sau khi áp:**

   ```bash
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT name FROM sqlite_master WHERE (type = 'table' AND name LIKE 'error_report%') OR (type = 'index' AND name LIKE 'error_reports_%') ORDER BY type, name"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM error_reports) AS reports, (SELECT COUNT(*) FROM error_report_logs) AS logs, (SELECT COUNT(*) FROM licenses) AS licenses, (SELECT COUNT(*) FROM orders) AS orders, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"
   ```

   Expected: hai bảng `error_report_logs`, `error_reports` và ba index `error_reports_device`, `error_reports_fingerprint`, `error_reports_received`; `reports` và `logs` đều `0`; `licenses`, `orders`, `orders_seq` **bằng đúng** bước 1 (số đơn không được lùi: PayOS nhớ mọi `orderCode` đã dùng); `foreign_key_check` không trả dòng nào. Lệch thì dừng, không deploy.

4. **Deploy Worker API:**

   ```bash
   pnpm check && pnpm exec wrangler deploy
   curl -s "$PROD/v1/health"; echo
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$PROD/v1/diagnostics"
   ```

   Expected: như mục 4 bước 9 (`Uploaded mt-license`, `schedule: */5 * * * *`, `{"ok":true}`); câu `curl` cuối in `415` (route có, từ chối vì thiếu `Content-Type: application/json`). **Kiểm cron chạy thật** như mục 4 bước 9: `pnpm exec wrangler tail mt-license --format pretty` qua một mốc 5 phút; Expected: sự kiện cron `*/5 * * * *` có log `{"event":"reconcile",…}` và **không có** `reconcile_step_failed` với `"step":"prune_error_reports"`. Không thấy cron thì `pnpm exec wrangler triggers deploy` rồi kiểm lại (sự cố 2026-10-07).

5. **Deploy Worker admin** (ngay sau bước 4):

   ```bash
   pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
   curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/admin/whoami"
   ```

   Expected: như mục 4 bước 10 (khi chưa đăng nhập Access thì không phải `5xx`). Đăng nhập Web Admin: thanh bên có mục **Báo cáo lỗi**, danh sách trống.

6. **Thử bằng một báo cáo giả, trước khi phát hành app.** Báo cáo mang `build: "release"` và phiên bản `0.0.0` để thấy được ở Web Admin (báo cáo `debug` bị ẩn mặc định) và nhận ra ngay là báo cáo thử. Thử ba trường hợp: hợp lệ (`202`), còn mẫu key (`422`, không lưu), sai `Content-Type` (`415`). Hai request đầu cùng một mã máy nên dùng hết 2 trong 3 lượt mỗi giờ của máy đó; đừng chạy lại quá hai lần trong một giờ.

   ```bash
   W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
   HASH=$(printf 'kiem-tra-bao-cao-loi' | shasum -a 256 | cut -d' ' -f1)
   NOW=$(date +%s)
   printf '{"v":1,"id":"R-ZZZZ-0001","kind":"session_error","code":"sidecarFailed","fingerprint":"deadbeefdeadbeef","at":%s,"message":"kiem tra sau trien khai","build":"release","app":{"version":"0.0.0"},"os":{"name":"macos","version":"0","arch":"aarch64"},"hw":{"chip":null,"ram_mb":null,"gpu_backend":null},"model_pack":null,"plan":null,"ui_lang":"vi","device_id_hash":"%s","logs":{"app":"dong log kiem tra\\n","asr":"","llama":""}}' "$NOW" "$HASH" > "$W/ok.json"
   curl -s -w '\n%{http_code}\n' -H 'content-type: application/json' --data-binary @"$W/ok.json" "$PROD/v1/diagnostics"
   sed 's/kiem tra sau trien khai/khoa 7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF/; s/R-ZZZZ-0001/R-ZZZZ-0002/' "$W/ok.json" > "$W/nhay-cam.json"
   curl -s -w '\n%{http_code}\n' -H 'content-type: application/json' --data-binary @"$W/nhay-cam.json" "$PROD/v1/diagnostics"
   curl -s -o /dev/null -w '%{http_code}\n' -H 'content-type: text/plain' --data-binary @"$W/ok.json" "$PROD/v1/diagnostics"
   ```

   Expected: `{"id":"R-ZZZZ-0001"}` rồi `202`; `{"error":"rejected_sensitive","rule":"license_key"}` rồi `422`; `415`. Ở Web Admin › Báo cáo lỗi có **một nhóm** (`session_error`, `sidecarFailed`, phiên bản `0.0.0`, 1 máy, 1 báo cáo); mở báo cáo thấy dòng log thử ở dạng văn bản. Báo cáo `R-ZZZZ-0002` **không** có (bị từ chối, không lưu). Kiểm cảnh báo: `pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT kind, count FROM ops_alerts WHERE kind = 'error_report_new'"` ra một dòng; thư cảnh báo tới `ops@aitranslator.io.vn` trong vòng khoảng một giờ (gộp theo giờ) với tiêu đề `[license production] Cảnh báo: error_report_new (1)` và **chỉ có số lượng**, không có nội dung log hay mã máy. Dọn báo cáo thử (bằng nút xóa ở Web Admin, hoặc hai lệnh dưới, bảng log trước), rồi kiểm lại:

   ```bash
   pnpm exec wrangler d1 execute mt-license-production --remote --command "DELETE FROM error_report_logs WHERE id = 'R-ZZZZ-0001'"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "DELETE FROM error_reports WHERE id = 'R-ZZZZ-0001'"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT COUNT(*) AS reports FROM error_reports"
   ```

   Expected: câu cuối in `reports` bằng `0`.

7. **Phát hành app** theo mục 2 (nâng phiên bản ở đó). Chính sách 1.3 đã đặt ngày hiệu lực từ trước khi build (điều kiện ở trên). App mới cho người dùng đã cài từ trước bật mặc định báo cáo lỗi, không hỏi và không thông báo (quyết định của chủ dự án, 2026-10-17).

8. **Deploy website cùng chính sách** sau khi bản app đã lên R2 (kiểm R2 ở mục 2): `cd ../website && pnpm deploy` (các lệnh của mục này chạy trong `server/`). Ngày hiệu lực chính sách 1.3 không được muộn hơn ngày deploy (test sitemap của website đỏ nếu `lastmod` ở tương lai, tính theo giờ Việt Nam).

9. **Thử tay với app thật** (bản vừa phát hành, trên máy chưa từng cài, hoặc sau khi xóa dữ liệu): (a) onboarding bước Điều khoản có ô báo cáo lỗi **tích sẵn**; (b) Giới thiệu › Gửi log cho hỗ trợ hiện mã báo cáo, và tìm được báo cáo đó ở Web Admin › Báo cáo lỗi bằng mã; (c) tắt công tắc ở Cài đặt › Quyền riêng tư rồi bấm lại nút gửi tay: vẫn gửi được; (d) xóa báo cáo thử ở Web Admin. Báo cáo thật đầu tiên đến từ máy người dùng: mở xem và kiểm log **không** có đường dẫn thư mục cá nhân, key, token hay email; có thì xóa ngay, và sửa bộ che dữ liệu (kế hoạch 03) trước khi để báo cáo tiếp theo vào.

**Đường lui.** Không có công tắc tắt nhận báo cáo riêng. Muốn dừng nhận khẩn cấp: `pnpm exec wrangler rollback` (Worker API) về bản trước đợt này: route `POST /v1/diagnostics` biến mất, app nhận `404` và bỏ báo cáo, người dùng không thấy lỗi gì. Worker admin lỗi thì `pnpm exec wrangler rollback -c wrangler.admin.jsonc`. Schema mới tương thích với code cũ (code cũ không biết hai bảng); sau khi lùi Worker admin, thao tác xóa theo email **không** xóa báo cáo, nên xóa tay nếu có yêu cầu. Xóa toàn bộ báo cáo: `DELETE FROM error_report_logs` rồi `DELETE FROM error_reports` (hai lệnh `wrangler d1 execute --remote --command`, bảng log trước). Migration 0004 không có bước lùi vì chỉ thêm bảng và không đổi dữ liệu cũ; không cần Time Travel.

## 11. Đợt thêm chat hỗ trợ (migration D1 0005)

Spec `2026-10-22-chat-ho-tro-zalo-design.md` (mục 1, 2, 7 và 8), kế hoạch `2026-10-22-chat-ho-tro-00-tong-quan.md` đến `2026-10-22-chat-ho-tro-04-phap-ly-noi-dung.md`. **Mỗi bước chỉ làm khi chủ dự án cho phép**; các lệnh ghi vào production và mọi lệnh có token Zalo do chủ dự án chạy (Claude không đặt secret). Thứ tự: Zalo Bot, secret, migration, Worker API (chat còn tắt), webhook, thử hai chiều, app, website, bật chat. Chạy trong `server/`; `PROD=https://api.aitranslator.io.vn`.

Vì sao thứ tự này: migration 0005 chỉ **thêm** bốn bảng (và bốn index), không đổi bảng nào đã có, nên Worker cũ chạy đúng trên schema mới; Worker mới cần bốn bảng và ba secret Zalo (thiếu secret thì `wrangler deploy` từ chối); `setWebhook` cần route đã có (Zalo thử URL ngay khi lưu); chat mặc định **tắt** (`support_settings.enabled = '0'`), nên trong lúc chờ app và website, không ai gửi được tin; app và website chỉ nói điều đã thật nên đi sau; bật chat là bước cuối, bằng lệnh `/bat` gửi cho bot.

**Điều kiện trước khi bắt đầu.**

- **Mã xong.** Kế hoạch 01 đến 04 đã làm và đã rà, `pnpm check` trong `server/` xanh trên `main`.
- **Bước 0 của kế hoạch 01 đạt** (`bench/2026-10-22-chat-ho-tro/spike.md`): điều 1, 3, 4. Điều 2 (bot vẫn nhắn được sau ít nhất 3 ngày không ai nhắn) có thể xong sau các bước server, nhưng **phải xong trước khi bật chat**.

1. **Tạo Zalo Bot** (bước 0 đã tạo thì dùng lại bot đó): Zalo › tìm OA **Zalo Bot Manager** › **Tạo bot** › tên `Bot AI Translator` (phải bắt đầu bằng "Bot"). Zalo gửi Bot Token qua tin nhắn. Không dán token vào chat với Claude, vào file trong repo hay vào lệnh có lưu lịch sử.

2. **Lấy `chat_id` của bạn.** Nhắn cho bot một tin bất kỳ, rồi (dòng `read` chờ bạn dán token, không hiện ra màn hình):

   ```bash
   read -rs ZALO_TOKEN && export ZALO_TOKEN
   curl -s -X POST "https://bot-api.zaloplatforms.com/bot${ZALO_TOKEN}/getUpdates" -H 'content-type: application/json' -d '{"timeout":"5"}'
   ```

   Expected: JSON có `"ok":true`, trong `result` có `"event_name":"message.text.received"` và `"chat":{"id":"<chat_id>",…}`. Chép `<chat_id>`. `getUpdates` không chạy khi bot đã có webhook: lúc đó gọi `deleteWebhook` (cùng dạng URL, thân `{}`) rồi chạy lại.

3. **Ba secret của Worker API** (giữ nguyên cửa sổ terminal tới bước 9, vì bước 8 cần `ZALO_HOOK`):

   ```bash
   ZALO_HOOK=$(openssl rand -hex 32)
   printf '%s' "$ZALO_TOKEN" | pnpm exec wrangler secret put ZALO_BOT_TOKEN
   printf '%s' "$ZALO_HOOK" | pnpm exec wrangler secret put ZALO_WEBHOOK_SECRET
   printf '%s' '<chat_id>' | pnpm exec wrangler secret put ZALO_OWNER_CHAT_ID
   ```

   Expected: mỗi lệnh kết thúc bằng `✨ Success! Uploaded secret <TÊN>`. Đặt secret lên Worker đang chạy bản cũ không đổi hành vi (bản cũ không đọc ba secret này).

4. **Kiểm trước khi áp (chỉ đọc), ghi lại kết quả để so sau:**

   ```bash
   pnpm exec wrangler d1 time-travel info mt-license-production
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT name FROM sqlite_master WHERE name LIKE 'support_%'"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM licenses) AS licenses, (SELECT COUNT(*) FROM orders) AS orders, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"
   ```

   Expected: `time-travel info` in mốc hiện tại (chép lại); câu thứ hai không trả dòng nào; chép lại ba số của câu thứ ba; `foreign_key_check` không trả dòng nào. Đã có bảng hay index `support_%` thì dừng và báo: ai đó đã áp tay.

5. **Áp migration lên production:**

   ```bash
   pnpm exec wrangler d1 migrations apply mt-license-production --remote
   ```

   Expected: chỉ liệt kê `0005_support_chat.sql`, hỏi xác nhận (trả lời `y`), rồi `✅`. Lỗi thì dừng, không deploy Worker, báo chủ dự án.

6. **Kiểm sau khi áp:**

   ```bash
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT type, name FROM sqlite_master WHERE name LIKE 'support_%' ORDER BY type, name"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT key, value FROM support_settings ORDER BY key"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM licenses) AS licenses, (SELECT COUNT(*) FROM orders) AS orders, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq"
   ```

   Expected: bốn index (`support_conversations_activity`, `support_conversations_customer`, `support_messages_conversation`, `support_messages_pending`) và bốn bảng (`support_conversations`, `support_messages`, `support_settings`, `support_zalo_updates`); hai dòng cài đặt `enabled = 0`, `zalo_fail_streak = 0`; ba số **bằng đúng** bước 4. Lệch thì dừng.

7. **Deploy Worker API:**

   ```bash
   pnpm check && pnpm exec wrangler deploy
   curl -s "$PROD/v1/health"; echo
   curl -s "$PROD/v1/support/status"; echo
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$PROD/v1/webhooks/zalo"
   ```

   Expected: như mục 4 bước 9 (`Uploaded mt-license`, `schedule: */5 * * * *`, binding `SUPPORT_POLL_LIMITER`); `{"ok":true}`; `{"enabled":false}`; `403` (route có, từ chối vì thiếu header secret). **Kiểm cron chạy thật**: `pnpm exec wrangler tail mt-license --format pretty` qua một mốc 5 phút; Expected: có `{"event":"reconcile",…}` và **không có** `reconcile_step_failed` với `"step":"support_forward"`, `"support_emails"` hay `"support_prune"`. Không thấy cron thì `pnpm exec wrangler triggers deploy` rồi kiểm lại (sự cố 2026-10-07).

8. **Đặt webhook.** Trước tiên `dig @8.8.8.8 api.aitranslator.io.vn +short` phải in địa chỉ IP (sự cố DNSSEC của `io.vn` ngày 2026-10-22: `SERVFAIL` thì Zalo cũng không gọi được webhook; đợi rồi làm lại). Rồi:

   ```bash
   curl -s -X POST "https://bot-api.zaloplatforms.com/bot${ZALO_TOKEN}/setWebhook" -H 'content-type: application/json' -d "{\"url\":\"$PROD/v1/webhooks/zalo\",\"secret_token\":\"$ZALO_HOOK\"}"; echo
   curl -s -X POST "https://bot-api.zaloplatforms.com/bot${ZALO_TOKEN}/getWebhookInfo" -H 'content-type: application/json' -d '{}'; echo
   ```

   Expected: lệnh đầu `"ok":true` và `"verification":{"ok":true,…,"outcome":"webhook.ok",…}`; lệnh sau có `"url":"https://api.aitranslator.io.vn/v1/webhooks/zalo"`. `verification` không `ok` thì xem `hint`, sửa, chạy lại.

9. **Thử hai chiều, rồi tắt lại.** Nhắn `/bat` cho bot (bot trả `Đã BẬT chat trên website và app.`), rồi gửi một tin như khách:

   ```bash
   R=$(curl -s -H 'content-type: application/json' -d '{"text":"Tin thử sau triển khai","lang":"vi","source":"app-debug","context":"kiểm tra runbook mục 11"}' "$PROD/v1/support/messages"); echo "$R"
   T=$(printf '%s' "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
   ```

   Expected: JSON có `token` và `message`; Zalo của bạn nhận `🆕 #<MÃ> · app (debug) · vi · kiểm tra runbook mục 11` rồi dòng `Tin thử sau triển khai`. Trả lời bot `#<MÃ> Đã nhận` (bot đáp `✓ đã gửi tới #<MÃ>`), rồi:

   ```bash
   curl -s -H "authorization: Bearer $T" "$PROD/v1/support/messages?after=0"; echo
   curl -s -X DELETE -H 'content-type: application/json' -H "authorization: Bearer $T" -d '{}' "$PROD/v1/support/conversation"; echo
   ```

   Expected: lệnh đầu có hai tin, tin thứ hai `"sender":"owner","text":"Đã nhận"`; lệnh sau `{"ok":true}` và Zalo nhận `#<MÃ> 🗑 khách đã xóa cuộc chat`. Nhắn `/ds` (bot trả `Không có cuộc chat nào trong 7 ngày qua.`), rồi `/tat` (bot trả `Đã TẮT chat…`); `curl -s "$PROD/v1/support/status"` in `{"enabled":false}`. Cuối cùng `unset ZALO_TOKEN ZALO_HOOK T R` và đóng terminal. Tin thử không về Zalo: xem `pnpm exec wrangler tail mt-license --format pretty` (sự kiện `support_forward_failed`), kiểm lại token ở bước 3. Câu trả lời không vào cuộc chat: xem sự kiện `zalo_webhook_*` trong tail; `zalo_webhook_unreadable` nghĩa là Zalo gửi dạng khác tài liệu (sửa `parseUpdate` ở `server/src/support/webhook.ts`, kèm test, rồi deploy lại).

<!-- kế hoạch 04: các bước app, website, bật chat và thử tay -->
