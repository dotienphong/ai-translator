# Chuyển sang tên miền `ai-solutions.io.vn`

Ngày 2026-10-06. Chủ dự án có tên miền `ai-solutions.io.vn` (zone Cloudflare cùng tài khoản với mapsLibVN) và chọn chuyển URL ngay, trước khi phát bản beta cho người khác. Thay các chỗ "chưa có tên miền" của spec gốc §15 (Q1, T7), kế hoạch 05 (Task 19–21) và spec 2026-10-04 (§1).

## 1. Vì sao làm bây giờ

- **Email cho khách.** Resend chỉ gửi được tới email chủ tài khoản khi `EMAIL_FROM` còn là `onboarding@resend.dev`; khách mua gói sẽ không nhận được key. Cần gửi từ một tên miền đã xác thực (SPF, DKIM).
- **URL nhúng cứng trong app.** Ba hằng `PRODUCTION_URL` (license, nguồn cập nhật, manifest model) đang trỏ `workers.dev` và `r2.dev`. Đổi trước khi bản cài tới tay người thứ hai thì chỉ cần build lại; đổi sau thì máy đã cài cần một bản cầu nối trên URL cũ.
- **`r2.dev`** theo tài liệu Cloudflare dành cho phát triển (giới hạn tải, không có CDN tùy biến), không hợp cho bản cập nhật chính thức.
- **Luật rate limit của WAF** (kế hoạch 05, Task 21 Step 9a) chỉ gắn được vào zone, nên `workers.dev` không có. Có tên miền thì bật được luật chặn spam webhook.

## 2. Hiện trạng DNS của zone (đọc bằng `dig`, 2026-10-06)

- NS của Cloudflare (`anderson.ns…`, `journey.ns…`).
- MX gốc: Cloudflare Email Routing (`route1–3.mx.cloudflare.net`); TXT gốc có SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`, `google-site-verification`, một TXT mô tả; `_dmarc` là `p=none`, `rua` về Gmail của chủ dự án.
- `www` và `api` đã có bản ghi (mapsLibVN). Các tên dự kiến dưới đây **chưa có** bản ghi nào.

Nguyên tắc: **không sửa hay xóa bản ghi nào đang có.** Chỉ thêm bản ghi mới cho tên mới.

## 3. Quyết định

Chỉ dùng subdomain **một cấp** (chứng chỉ Universal SSL miễn phí của Cloudflare không phủ subdomain hai cấp). Tiền tố `translator` để không lẫn với mapsLibVN.

| Mục đích | Tên | Gắn với | Ghi chú |
|---|---|---|---|
| License server (API công khai) | `translator-api.ai-solutions.io.vn` | Worker `mt-license`, route `custom_domain` | App gọi tên này |
| Bản cập nhật và model | `translator-releases.ai-solutions.io.vn` | R2 bucket `ai-translator-releases`, custom domain | Thay `r2.dev` |
| Gửi email (Resend) | `mail.ai-solutions.io.vn` | Resend: SPF, DKIM, bản ghi bounce | From: `AI Translator <no-reply@mail.ai-solutions.io.vn>`; Reply-To: `support@ai-solutions.io.vn` |
| Email hỗ trợ | `support@ai-solutions.io.vn` | Cloudflare Email Routing (MX gốc đã có) | Thêm một quy tắc chuyển tiếp tới Gmail của chủ dự án; không đổi MX |
| Website, trang chính sách | `translator.ai-solutions.io.vn` | để dành | Website có spec riêng; chưa tạo bản ghi |

**Admin giữ nguyên `mt-license-admin.dotienphong1993.workers.dev`** sau Cloudflare Access. Admin chỉ chủ dự án dùng, không cần tên miền; chuyển nó sang tên miền buộc phải tạo lại ứng dụng Access (làm tay trên dashboard). Chỉ đổi biến `API_ORIGIN` của Worker admin sang origin mới, vì lệnh `confirm-webhook` kiểm URL webhook theo origin đó.

**Giữ tạm `workers_dev` và `r2.dev`** cho tới khi mọi bản cài (hiện chỉ máy chủ dự án) đã chuyển sang bản mới: bản cài cũ vẫn gọi được, và có đường lui. Tắt chúng là việc riêng, làm sau.

Thông tin pháp lý ghi vào EULA, chính sách quyền riêng tư, `copyright`: **Đỗ Tiến Phong**; email hỗ trợ `support@ai-solutions.io.vn`; thương hiệu hiển thị "AI Translator".

## 4. Thay đổi trong repo

| File | Thay đổi |
|---|---|
| `src-tauri/src/license/client.rs` | `PRODUCTION_URL` = `https://translator-api.ai-solutions.io.vn` |
| `src-tauri/src/updater/source.rs` | `PRODUCTION_URL` = `https://translator-releases.ai-solutions.io.vn` |
| `src-tauri/src/models/source.rs` | `PRODUCTION_URL` = `https://translator-releases.ai-solutions.io.vn/models/models.json` |
| `server/wrangler.jsonc` | thêm `routes` với `custom_domain: true` cho `translator-api…`; giữ `workers_dev: true` tạm; `EMAIL_FROM` mới; biến `EMAIL_REPLY_TO` |
| `server/wrangler.admin.jsonc` | `API_ORIGIN` = `https://translator-api.ai-solutions.io.vn` |
| `server/src` (email) | `ResendEmailProvider` gửi thêm `reply_to` từ `EMAIL_REPLY_TO` (có test) |
| `bench/phase1/results/acceptance/a7-allow.json` | thay hai máy chủ cũ bằng hai tên mới |
| `docs/release/phat-hanh.md` | `PROD`, `RELEASES_BASE_URL`, mục tên miền, Resend, WAF |
| `.github` (biến repo) | `RELEASES_BASE_URL` = `https://translator-releases.ai-solutions.io.vn` (đặt trên GitHub, không phải file); `release-ready.mjs` đã tự kiểm khớp với `source.rs` |

Test hiện có khóa các giá trị này (`release-ready.test.mjs`, test cấu hình Worker, test Rust) phải cập nhật cùng lúc.

Manifest model (`models.json`) dùng đường dẫn tương đối (`whisper/…`, đã kiểm ở `scripts/models/released/body-*.json`) và app ghép với URL của chính manifest (`models/source.rs`); `latest.json` do CI sinh từ `RELEASES_BASE_URL`. Nên đổi các giá trị trên là đủ, **không** phải ký lại manifest model.

## 5. Thay đổi hạ tầng (không nằm trong repo)

| Việc | Ai làm | Cách |
|---|---|---|
| Worker `mt-license` ra tên mới | agent hướng dẫn, chủ dự án chạy `wrangler deploy` (đã đăng nhập) | `custom_domain` tự tạo bản ghi DNS và chứng chỉ |
| R2 custom domain | chủ dự án | Dashboard: R2 › bucket › Settings › Custom Domains, hoặc `wrangler r2 bucket domain add` (cần Zone ID) |
| Cache của tên R2 | agent kiểm | Manifest đã đặt `Cache-Control: no-cache` khi đăng; kiểm lại qua tên mới |
| Resend: thêm domain `mail.ai-solutions.io.vn`, thêm bản ghi DNS, chờ xác thực | chủ dự án | Dashboard Resend; thêm bản ghi ở Cloudflare DNS (Resend có nút kết nối Cloudflare) |
| `support@` | chủ dự án | Cloudflare Email › Email Routing › Custom addresses: chuyển tiếp tới Gmail (xác thực địa chỉ đích nếu chưa) |
| Đăng ký lại webhook PayOS | chủ dự án chạy lệnh, agent soạn | `POST /admin/payos/confirm-webhook` với URL mới; phải đúng `API_ORIGIN` mới |
| Luật WAF rate limit `/v1/webhooks/` | chủ dự án | Dashboard, theo kế hoạch 05 Task 21 Step 9a, gắn cho **đúng host** `translator-api…` (zone dùng chung với mapsLibVN) |
| Biến GitHub `RELEASES_BASE_URL` | chủ dự án | Settings › Secrets and variables › Actions › Variables |

## 6. Thứ tự và đường lui

1. Hạ tầng: Worker ra tên mới, R2 custom domain, Resend, `support@`. Kiểm từng cái bằng `curl` (mục 7). App chưa đổi, mọi thứ cũ còn chạy.
2. Đăng ký lại webhook PayOS sang tên mới; thử một giao dịch thật nhỏ (Professional, 50 000 đ, chủ dự án tự hoàn tiền) để kiểm cả đường VietQR, webhook, email tới một địa chỉ **không phải** chủ tài khoản Resend, và app kích hoạt.
3. Đổi code app, test, build bản release ký ad-hoc, cài và thử kích hoạt, kiểm tra cập nhật, tải manifest model.
4. Tắt `workers_dev` và `r2.dev`: **chỉ khi** không còn bản cài nào dùng URL cũ. Việc riêng, ngoài phạm vi này.

Đường lui ở bước 1–3: bản cài cũ và `workers.dev`, `r2.dev` vẫn chạy nguyên; chỉ cần không phát bản mới. Nếu webhook mới lỗi thì đăng ký lại webhook về URL cũ bằng `confirm-webhook`.

## 7. Nghiệm thu

- `curl https://translator-api.ai-solutions.io.vn/v1/health` trả `{"ok":true}` qua TLS hợp lệ; `POST /v1/licenses/validate` trả đúng như `workers.dev`.
- `curl -I https://translator-releases.ai-solutions.io.vn/models/models.json` trả 200, `Range` trả 206, `Cache-Control` đúng; `latest.json` mới nhất không bị cache cũ.
- Email thử gửi tới một địa chỉ ngoài chủ tài khoản Resend, ở hộp thư đến (không spam), có SPF, DKIM, DMARC "pass", có `Reply-To` là `support@…`; thư gửi `support@…` về tới Gmail.
- Luật WAF chặn khi gửi quá 5 request mỗi 10 giây tới `/v1/webhooks/` (trả `429 rate_limited`), và không ảnh hưởng host khác của zone.
- Bản app mới: kích hoạt key, nhập Pro, kiểm tra cập nhật không lỗi chứng chỉ, tải manifest model; log không còn nhắc `workers.dev` hay `r2.dev`.
- A7 chạy lại một lượt ngắn trên bản mới: mọi request ra ngoài tới hai tên mới, nằm trong `a7-allow.json` đã cập nhật.
- Toàn bộ test Rust, vitest, Node, server (`pnpm check`) xanh.

## 8. Rủi ro

- **Zone dùng chung với mapsLibVN.** Không đụng bản ghi sẵn có; luật WAF và Email Routing của zone phải chỉ định đúng host hoặc địa chỉ. `_dmarc` gốc là `p=none` nên thư của `mail.` không bị chặn chỉ vì DMARC.
- **Sai chứng chỉ hoặc DNS chưa lan** làm app không gọi được: vì vậy chỉ đổi app sau khi `curl` qua tên mới đạt.
- **Webhook PayOS** đang trỏ `workers.dev`: nếu quên đăng ký lại mà tắt `workers.dev` thì mất xác nhận thanh toán. Nên đăng ký lại ở bước 2 và không tắt `workers.dev` trong phạm vi này.
- **Bản cài cũ trên máy chủ dự án** vẫn gọi URL cũ: dùng được cho tới khi tắt chúng; không ảnh hưởng người khác vì chưa ai khác cài.

## 9. Ngoài phạm vi

Website (`translator.…`), tắt `workers.dev` và `r2.dev`, đưa admin sang tên miền (cần ứng dụng Access mới), nội dung EULA và chính sách quyền riêng tư (Q8; tên pháp lý và email đã chốt), Windows.
