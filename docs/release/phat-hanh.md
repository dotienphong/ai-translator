# Phát hành AI Translator

Quy trình cho người vận hành (kế hoạch 07b; spec §6.11, §10.2, Q17). Mọi khóa riêng chỉ nằm trong secret của environment
`release` trên GitHub và trong bản sao offline đã mã hóa. Không khóa riêng nào nằm trong repo, trong app, hay trên máy dev.

Ký hiệu: `REPO=dotienphong/ai-live-translator-desktop`. Lệnh `gh` chạy trên máy có mạng, đã `gh auth login` bằng tài khoản có
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
node scripts/models/gen-manifest-key.mjs prod-<năm>-<tháng>-1 --production --out /Volumes/KHOA-RAM/manifest.jwk
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

### 1.3. Hạ tầng phát hành (R2)

- Hai bucket R2: một cho staging, một cho production (ví dụ `ai-translator-releases`), mỗi bucket có tên miền công khai
  (production: `releases.<tên miền>` khi có T7, trước đó là URL `r2.dev` của bucket).
- Một API token R2 chỉ có quyền "Object Read & Write" trên đúng bucket production. Nhập vào environment `release`:
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Biến của repo (không bí mật): `RELEASES_BUCKET` (tên bucket),
  `RELEASES_BASE_URL` (URL công khai, ví dụ `https://releases.<tên miền>`).
- Điền URL build sẵn trong app, commit:
  - `src-tauri/src/updater/source.rs`: `PRODUCTION_URL` đúng bằng `RELEASES_BASE_URL`; `STAGING_URL` là URL của bucket staging.
  - `src-tauri/src/models/source.rs`: `PRODUCTION_URL` là URL của `models.json` đã ký.
  - `src-tauri/src/license/client.rs` và khối `production` của `src-tauri/keys/license-public-keys.json`: kế hoạch 05 Task 21.
  - `src-tauri/src/navigation.rs`: thêm tên miền website vào `EXTERNAL_HOSTS`.
- Kiểm: `node scripts/release/release-ready.mjs --base-url "<RELEASES_BASE_URL>"` in `đủ cấu hình production`. Job `publish`
  chạy đúng lệnh này và dừng nếu còn thiếu.

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
nên bản đã rút không bị đăng lại dù ai bấm "Re-run" và người duyệt bấm duyệt. Ghi lại `latest.json` của kênh về bản trước:

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
