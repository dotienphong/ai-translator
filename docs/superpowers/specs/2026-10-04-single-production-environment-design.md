# AI Translator: chỉ một môi trường production — Design

**Ngày:** 2026-10-04
**Trạng thái:** Chủ dự án đã duyệt thiết kế qua hội thoại ngày 2026-10-04. Chưa có kế hoạch thực hiện.
**Quan hệ với spec gốc:** bổ sung và **thay thế** mọi chỗ của `2026-09-29-desktop-meeting-translator-design.md` nói tới môi trường staging hoặc dev của license server, và các chỗ chọn endpoint theo kiểu build. Phần còn lại của spec gốc giữ nguyên. Các kế hoạch trong `docs/superpowers/plans/` viết trước ngày này là lịch sử, không viết lại; phần staging trong đó coi như bị thay bởi spec này.

---

## 1. Quyết định

1. **Chỉ có một môi trường: production.** Không còn staging, không còn "môi trường dev" của server. Mọi bản build của app, kể cả bản debug chạy bằng `scripts/run-dev-app.sh` trên máy dev, nối vào cùng một bộ hạ tầng production: license server, khóa công khai, manifest model, updater.
2. **Bản dev mặc định đi đường thật.** Dev phải kích hoạt Pro như người dùng thật (mua gói, hoặc nhập mã do admin cấp bằng `POST /admin/licenses`), hạn mức tính như thật.
3. **Có công tắc `AI_TRANSLATOR_DEV_PRO`** chỉ có trong bản debug. Bằng đúng `true` thì app dev coi như Pro không hạn mức, vẫn nối production cho mọi thứ khác. Công tắc phải chống được việc bị bật trên bản phát hành (mục 3).
4. **Không còn đường trỏ app sang server khác.** Bỏ `AI_TRANSLATOR_LICENSE_URL` và biến ghi đè URL manifest model. Không còn `wrangler dev` làm tính năng được hỗ trợ; server được phát triển bằng test tự động.
5. **PayOS thử trên production trước phát hành** (không có sandbox, §14 mục 10 của spec gốc): deploy production nhưng chưa nhúng URL vào app, thử bằng giao dịch giá thật rồi hoàn tiền tay, hoặc gọi API bằng script.

### Không làm
- Không dựng lại staging dưới tên khác, không thêm server local hay môi trường "preview".
- Không đổi giá, hạn mức hay danh sách gói (§2 của spec gốc).
- Không đổi `kid`, định dạng token, định dạng manifest.
- Không chống được người tự biên dịch lại app từ mã nguồn rồi sửa (xem mục 3, "Giới hạn").

## 2. App

### 2.1 Chọn endpoint
- `license/client.rs`: bỏ `STAGING_URL`, `URL_ENV` và nhánh `cfg!(debug_assertions)` trong `HttpApi::for_this_build()`. Còn một hằng `LICENSE_URL: Option<&str>` (hiện `None`, điền khi deploy production), chỉ nhận `https` và không có query. `HttpApi::new(Some(base))` vẫn nhận địa chỉ tùy ý để test dựng server giả; chỉ `for_this_build()` bị ràng buộc.
- `license/keys.rs`: bỏ `LicenseEnv` và hàm `current()`. `license-public-keys.json` chỉ còn khối production (hai ô `a`, `b`). `keys` đọc thẳng khối đó.
- `models/source.rs`, `models/signed.rs`: bỏ nhánh `tauri::is_dev()` chọn URL và khóa. URL manifest là hằng production, kiểm chữ ký bằng khóa trong `manifest-public-keys.json` (chỉ còn `production`). Bản dev tải model qua manifest production như người dùng thật. Model của Giai đoạn 0 trong `models/` (§6.7 của spec gốc) vẫn dùng được như cũ.
- `updater/source.rs`: bỏ khối `staging` của `updater-public-keys.json`; còn một khóa production. **Bản debug không tự cập nhật** (tắt bằng `cfg(debug_assertions)`), để bản release không ghi đè bản dev đang code.
- `errors.rs`: sửa thông báo nhắc "bản dev chưa cấu hình staging".

### 2.2 Cổng Pro và công tắc dev
- `pro.rs`: thay `DEV_FREE_ENV` bằng `DEV_PRO_ENV = "AI_TRANSLATOR_DEV_PRO"`. Đảo mặc định: **không đặt hay khác `true` thì là gói thật**; chỉ giá trị chính xác `true` (phân biệt hoa thường) mới cài `DevGate`.
- `DevGate`, `dev_override()`, `install_dev_gate()` và việc bỏ hạn mức ở `license::app::install` giữ vai trò cũ nhưng chỉ chạy khi công tắc bật. Tất cả nằm sau `#[cfg(debug_assertions)]`, như hiện nay.
- Công tắc đọc **một lần lúc khởi động**, từ biến môi trường của tiến trình. App không tự đọc file `.env`.
- Trạng thái app thêm trường `devPro: bool`. Bản release luôn là `false` do biên dịch. Giao diện hiện nhãn **"DEV · Pro giả lập"** khi `true`, và app ghi một dòng log mức cảnh báo lúc khởi động.
- `genuine.rs`: bản debug vẫn bỏ qua kiểm chữ ký bản cài (bản dev không có chữ ký Developer ID). Đây là khả năng của build, không phải môi trường, nên giữ.

### 2.3 Chạy bản dev
- `scripts/run-dev-app.sh` đọc `.env` ở gốc repo nếu có, **không dùng `source`** (không thực thi nội dung file). Chỉ nhận các dòng `KEY=VALUE` có `KEY` nằm trong danh sách cho phép (`AI_TRANSLATOR_DEV_PRO` và các biến `MT_*` đã được chuyển qua `open --env`). Dòng khác bị bỏ qua và báo.
- Khi `AI_TRANSLATOR_DEV_PRO=true`, script in cảnh báo to: bản này giả lập Pro, không dùng để đo hạn mức hay thử luồng mua.
- Thêm `.env.example` chứa `AI_TRANSLATOR_DEV_PRO=false` và chú thích. Thêm `!.env.example` vào `.gitignore` (hiện `.env*` chặn cả file này).

## 3. Chống bật Pro trái phép trên bản phát hành

Mối đe dọa: người dùng bản chính thức đặt biến môi trường hoặc tạo file `.env` để lấy Pro không trả tiền, hoặc một bản debug lọt vào phát hành.

| Lớp | Cách làm |
|---|---|
| 1. Loại bỏ lúc biên dịch | Mã đọc công tắc nằm sau `cfg(debug_assertions)`. Binary release không có code đọc, không có chuỗi `AI_TRANSLATOR_DEV_PRO`. Đặt biến hay tạo `.env` trên bản release không làm gì. |
| 2. Khóa cứng profile | `[profile.release]` trong `Cargo.toml` đặt tường minh `debug-assertions = false` (hiện chỉ dựa vào mặc định của cargo). Một test kiểm file cấu hình giữ giá trị này. |
| 3. Chuỗi chim hoàng yến | Mô-đun chỉ có trong bản debug chứa một hằng chuỗi cố định `mt-dev-pro-gate-v1`. Binary release mà có chuỗi này hoặc tên biến công tắc tức là mã dev đã lọt vào. |
| 4. Cổng CI trước khi ký | `scripts/release/release-check.mjs` quét binary release của macOS và Windows tìm hai chuỗi trên cùng `AI_TRANSLATOR_DEV_FREE`. Thấy một chuỗi thì job fail: không ký, không đăng. Quy tắc này có test trong `release-check.test.mjs`. |
| 5. Chỉ ở phía client | Công tắc không tạo token giả, không gửi gì lên server. Server không bao giờ đọc cờ nào từ client, nên bật công tắc không đổi dữ liệu production. |
| 6. Không đọc `.env` trong app, không `source` | Xem 2.3. Nội dung `.env` không thể chạy lệnh. |
| 7. Giá trị chặt | Chỉ `true` đúng nghĩa; `1`, `TRUE`, `yes` đều là tắt. Mặc định tắt. |
| 8. Dễ nhận ra | Nhãn trên giao diện, dòng log, cảnh báo của script (2.2, 2.3). |
| 9. Lớp có sẵn | Bản release tự kiểm chữ ký, file bị sửa thì chạy chế độ Free (§10.2 của spec gốc). |

**Giới hạn chấp nhận:** không ngăn được người tự biên dịch lại app từ mã nguồn rồi sửa cổng Pro, vì cổng Pro nằm ở client (đã chấp nhận ở §10.2 của spec gốc). Điều được đảm bảo là bản chính thức đã ký không bật Pro được bằng công tắc hay biến môi trường, và CI chặn việc lỡ phát hành bản có mã dev.

## 4. Server

- `wrangler.jsonc` và `wrangler.admin.jsonc`: xóa khối `env`. Cấu hình gốc trở thành cấu hình production: D1 `mt-license-production`, `PLANS` giá chính thức (§2 của spec gốc), `TOKEN_SIGNING_SLOT`, `observability`. Triển khai bằng `wrangler deploy`, **không còn `--env`**.
- Tên Worker đổi từ `mt-license-<env>` thành `mt-license` và `mt-license-admin` (chưa deploy nên không có gì phải chuyển). Service binding của Worker admin tới Worker API và `API_ORIGIN` sửa theo. Tên D1 `mt-license-production` giữ.
- Bỏ biến `ENVIRONMENT` khỏi `ApiEnv` và `AdminEnv`. Mọi chỗ đang rẽ nhánh theo nó (kiểm `ACCESS_AUD`, dải `order_code`, ghi log, cảnh báo) đổi thành hành vi production cố định. Kế hoạch thực hiện liệt kê từng chỗ dùng.
- `ACCESS_AUD` của Worker admin **luôn bắt buộc**: trống thì mọi request bị 403. Test tự đặt giá trị riêng trong vitest.
- `order_code` giữ khoảng bắt đầu từ 1.000.001 như production hiện nay; bỏ dải 1–999.999 và lời giải thích về hai môi trường.
- HTTPS: bỏ ngoại lệ "ngoài môi trường dev" ở §6.8 của spec gốc. Mọi route chỉ nhận HTTPS.
- `server/package.json`: `dry-run` chỉ chạy một cấu hình cho mỗi Worker; `check` cập nhật theo.
- Test (`admin.test.ts`, `checkout.test.ts`, `app.test.ts`) bỏ các ca staging, thêm ca xác nhận không còn nhánh môi trường.
- Kênh PayOS riêng cho staging (mục 15 của spec gốc, P05-1) **không còn cần**. Chỉ cần một kênh PayOS cho production.

## 5. Script, CI và tài liệu

- `scripts/models/gen-manifest-key.mjs`, `sign-manifest.mjs`, `lib.mjs`, `manifest.test.mjs`: bỏ tham số và nhánh staging. Khóa manifest còn một loại (production), ký trong CI qua environment `release` như §10.2.
- `server/scripts/gen-token-key.mjs`, `verify-token.mjs`: bỏ staging. `kid` giữ định dạng `<tiền tố>-<năm>-<tháng>-<số thứ tự>` với tiền tố cố định `prod`.
- `scripts/release/release-ready.mjs`: giữ kiểm đủ khóa production; bỏ mọi nhắc staging.
- `docs/release/phat-hanh.md`: bỏ phần staging.
- `src-tauri/keys/manifest-public-keys.json`: bỏ khối `staging` và bỏ khóa `stg-2026-10-1` đang là thay đổi chưa commit. Khóa riêng tương ứng trên máy người vận hành không còn tác dụng, nên xóa.
- Spec gốc, các chỗ cần sửa (kế hoạch thực hiện chốt số dòng chính xác): đầu tài liệu (tên Worker), §6.7 (khóa manifest), §6.8 (`PLANS` theo môi trường, HTTPS, dải `order_code`), §10.2 (tiền tố `kid`, ô khóa "theo môi trường", khóa staging của manifest), §11 (PayOS "môi trường test"), §14 mục 10 và 11 (kiểm bằng giao dịch trên production), §15 (Q1 tên miền không còn "staging dùng `*.workers.dev`"; bỏ mục kênh PayOS cho staging). Thêm ở §5 hoặc §6.12 một mục ngắn "Môi trường" trỏ về spec này.
- `CLAUDE.md`: thêm một dòng nói app chỉ có môi trường production và công tắc dev nằm ở spec này.

## 6. Kiểm thử và nghiệm thu

**Test tự động**
- Rust: `keys.rs` (chỉ khối production, không còn `LicenseEnv`), `client.rs` (`for_this_build` chỉ nhận `https`), `source.rs`, `signed.rs`, `updater/source.rs`, `pro.rs` (mặc định dev **không** Pro; `true` mới Pro; `1` và `TRUE` không).
- Node: `release-check.test.mjs` (binary có chuỗi chim hoàng yến hoặc tên biến công tắc thì fail), `manifest.test.mjs`, `signing.test.mjs`, `tools.test.mjs`.
- Server: `pnpm --dir server check` (typecheck, vectors, test, dry-run).
- Một test kiểm `Cargo.toml` giữ `debug-assertions = false` ở profile release.

**Nghiệm thu thủ công**
1. Clone sạch, `pnpm install`, `scripts/run-dev-app.sh`: chạy được, không phải nhập khóa nào; mặc định ở gói Free.
2. Tạo `.env` với `AI_TRANSLATOR_DEV_PRO=true`: app có nhãn "DEV · Pro giả lập", dùng được tính năng Pro không hạn mức.
3. Build release, `strings` trên binary: không có `AI_TRANSLATOR_DEV_PRO` và `mt-dev-pro-gate-v1`. Chạy bản release với biến này: vẫn là Free.
4. Theo CLAUDE.md: build lại toàn bộ và chạy toàn bộ test sau khi sửa.

## 7. Rủi ro và việc còn mở

- **Dev ghi vào dữ liệu production.** Mỗi lần dev kích hoạt Pro thật, đơn và thiết bị là bản ghi thật, hạn mức bị tính thật. Dùng công tắc `true` khi chỉ cần thử tính năng Pro thì không tạo bản ghi nào.
- **Bản release đầu tiên là lần đầu chạy với khóa và server production**, vì không còn bước đệm. Giảm nhẹ bằng `release-ready.mjs` chặn khi thiếu khóa production và bước thử PayOS trên production trước phát hành (quyết định 5).
- **Chưa có server production.** Hiện `LICENSE_URL` là `None` và chưa có tên miền. Tới khi deploy, bản dev chỉ chạy gói Free hoặc `DEV_PRO=true`. Thứ tự: deploy production (Task 21 của kế hoạch 05), điền URL, rồi nghiệm thu.
- **Không còn cách thử server ở local.** Đổi lại bớt một đường rẽ nhánh và một loại khóa phải quản lý. Nếu sau này cần thì thêm lại có chủ đích bằng spec riêng.
