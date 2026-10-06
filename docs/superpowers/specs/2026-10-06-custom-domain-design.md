# Tên miền riêng `aitranslator.io.vn` cho hệ thống

Ngày 2026-10-06. Chủ dự án mua tên miền riêng `aitranslator.io.vn` cho sản phẩm và chọn chuyển URL ngay, trước khi phát bản beta cho người khác. Bản này thay bản cùng tên viết sớm hơn trong ngày (dùng `ai-solutions.io.vn`, tên miền của mapsLibVN; bỏ vì chưa triển khai và nay có tên miền riêng). Thay các chỗ "chưa có tên miền" của spec gốc §15 (Q1, T7), kế hoạch 05 (Task 19–21) và spec 2026-10-04 (§1). Khớp yêu cầu D2 của spec gốc: sản phẩm tách hẳn khỏi dự án khác, kể cả tên miền.

## 1. Vì sao làm bây giờ

- **Email cho khách.** Resend chỉ gửi được tới email chủ tài khoản khi `EMAIL_FROM` còn là `onboarding@resend.dev`; khách mua gói sẽ không nhận được key. Cần gửi từ tên miền đã xác thực (SPF, DKIM).
- **URL nhúng cứng trong app.** Ba hằng `PRODUCTION_URL` (license, nguồn cập nhật, manifest model) đang trỏ `workers.dev` và `r2.dev`. Đổi trước khi bản cài tới tay người thứ hai thì chỉ cần build lại; đổi sau thì máy đã cài cần một bản cầu nối trên URL cũ.
- **`r2.dev`** theo tài liệu Cloudflare dành cho phát triển (giới hạn tải), không hợp cho bản cập nhật chính thức.
- **Luật rate limit của WAF** (kế hoạch 05, Task 21 Step 9a) chỉ gắn được vào zone, nên `workers.dev` không có. Có zone riêng thì bật được luật chặn spam webhook mà không ảnh hưởng dự án nào khác.

## 2. Hiện trạng (2026-10-06)

- `aitranslator.io.vn` **chưa được ủy quyền**: máy chủ gốc của `.vn` trả `NXDOMAIN`, không có NS. Phải hoàn tất đăng ký (xác minh danh tính với `.vn` nếu còn chờ) và đặt nameserver về Cloudflare trước (bước 0 ở mục 6).
- Tài khoản Cloudflare dùng chung với mapsLibVN (chủ dự án chấp nhận, 2026-10-05); **zone là zone mới, riêng**, nên luật WAF, Email Routing và bản ghi DNS của sản phẩm này không lẫn với dự án kia. Worker custom domain bắt buộc zone nằm cùng tài khoản với Worker.
- Chưa có bản cài nào ngoài máy của chủ dự án.

## 3. Quyết định

Chỉ dùng subdomain **một cấp** dưới `aitranslator.io.vn` (chứng chỉ Universal SSL miễn phí của Cloudflare phủ gốc và một cấp subdomain; hai cấp thì cần gói trả phí).

| Mục đích | Tên | Gắn với | Ghi chú |
|---|---|---|---|
| License server (API công khai) | `api.aitranslator.io.vn` | Worker `mt-license`, route `custom_domain` | App gọi tên này |
| Bản cập nhật và model | `releases.aitranslator.io.vn` | R2 bucket `ai-translator-releases`, custom domain | Thay `r2.dev` |
| Gửi email (Resend) | `mail.aitranslator.io.vn` | Resend: SPF, DKIM, bản ghi bounce | From: `AI Translator <no-reply@mail.aitranslator.io.vn>`; Reply-To: `support@aitranslator.io.vn` |
| Nhận email hỗ trợ | `support@aitranslator.io.vn` | Cloudflare Email Routing (MX và SPF ở gốc) | Chuyển tiếp tới Gmail của chủ dự án |
| Website, trang chính sách | `aitranslator.io.vn` (gốc) và `www` | để dành | Website có spec riêng; chưa tạo bản ghi |
| Admin | giữ `mt-license-admin.dotienphong1993.workers.dev` | Worker admin sau Cloudflare Access | Xem dưới |

Vì sao tách email gửi ra `mail.`: gốc dùng cho **nhận** thư (Email Routing đặt MX và SPF ở gốc); Resend gửi từ subdomain riêng để không phải gộp SPF của hai hệ thống vào một bản ghi và để uy tín gửi thư không ảnh hưởng thư nhận. Bản ghi DMARC đặt ở gốc: `v=DMARC1; p=none; rua=mailto:support@aitranslator.io.vn`, siết lên `quarantine` sau vài tuần báo cáo sạch.

**Admin không chuyển sang tên miền ở đợt này.** Chỉ chủ dự án dùng; chuyển nó buộc tạo lại ứng dụng Access (làm tay trên dashboard) và đổi `ACCESS_AUD`, mà không mang lại gì cho khách. Chỉ đổi biến `API_ORIGIN` của Worker admin sang origin mới, vì lệnh `confirm-webhook` kiểm URL webhook theo origin đó. Chuyển admin là việc riêng, làm sau nếu cần (khi đó tắt luôn `workers_dev` của admin).

**Giữ tạm `workers_dev` và `r2.dev`** cho tới khi mọi bản cài (hiện chỉ máy chủ dự án) đã chuyển sang bản mới: bản cài cũ vẫn gọi được, và có đường lui. Tắt chúng là việc riêng, làm sau.

Thông tin pháp lý ghi vào EULA, chính sách quyền riêng tư, `copyright`: **Đỗ Tiến Phong**; email hỗ trợ `support@aitranslator.io.vn`; thương hiệu hiển thị "AI Translator". Mọi chỗ trong tài liệu trước nhắc `support@ai-solutions.io.vn` thì thay bằng địa chỉ này.

## 4. Thay đổi trong repo

| File | Thay đổi |
|---|---|
| `src-tauri/src/license/client.rs` | `PRODUCTION_URL` = `https://api.aitranslator.io.vn` |
| `src-tauri/src/updater/source.rs` | `PRODUCTION_URL` = `https://releases.aitranslator.io.vn` |
| `src-tauri/src/models/source.rs` | `PRODUCTION_URL` = `https://releases.aitranslator.io.vn/models/models.json` |
| `server/wrangler.jsonc` | thêm `routes` với `custom_domain: true` cho `api.aitranslator.io.vn`; giữ `workers_dev: true` tạm; `EMAIL_FROM` mới; biến `EMAIL_REPLY_TO` |
| `server/wrangler.admin.jsonc` | `API_ORIGIN` = `https://api.aitranslator.io.vn` |
| `server/src` (email) | `ResendEmailProvider` gửi thêm `reply_to` từ `EMAIL_REPLY_TO` (có test) |
| `bench/phase1/results/acceptance/a7-allow.json` | thay hai máy chủ cũ bằng hai tên mới |
| `docs/release/phat-hanh.md` | `PROD`, `RELEASES_BASE_URL`, mục tên miền, Resend, Email Routing, WAF |
| Biến repo GitHub | `RELEASES_BASE_URL` = `https://releases.aitranslator.io.vn` (đặt trên GitHub, không phải file); `release-ready.mjs` đã tự kiểm khớp với `source.rs` |

Test hiện có khóa các giá trị này (`release-ready.test.mjs`, test cấu hình Worker, test Rust) phải cập nhật cùng lúc.

Manifest model (`models.json`) dùng đường dẫn tương đối (`whisper/…`, đã kiểm ở `scripts/models/released/body-*.json`) và app ghép với URL của chính manifest (`models/source.rs`); `latest.json` do CI sinh từ `RELEASES_BASE_URL`. Nên đổi các giá trị trên là đủ, **không** phải ký lại manifest model.

## 5. Thay đổi hạ tầng (không nằm trong repo)

| Việc | Ai làm | Cách |
|---|---|---|
| **Bước 0:** hoàn tất đăng ký, thêm zone vào Cloudflare, đặt nameserver, chờ trạng thái Active | chủ dự án | Nơi đăng ký `.vn`; Cloudflare › Add a site (gói Free) lấy hai nameserver; chờ lan |
| Worker `mt-license` ra tên mới | agent soạn lệnh, chủ dự án chạy `wrangler deploy` | `custom_domain` tự tạo bản ghi DNS và chứng chỉ |
| R2 custom domain | chủ dự án | Dashboard: R2 › bucket › Settings › Custom Domains, hoặc `wrangler r2 bucket domain add` (cần Zone ID) |
| Email Routing: bật, tạo `support@`, xác thực địa chỉ đích | chủ dự án | Cloudflare › Email › Email Routing; Cloudflare tự thêm MX và SPF ở gốc |
| Resend: thêm domain `mail.aitranslator.io.vn`, thêm bản ghi DNS, chờ xác thực | chủ dự án | Dashboard Resend; thêm bản ghi ở Cloudflare DNS (Resend có nút kết nối Cloudflare) |
| Bản ghi DMARC ở gốc | chủ dự án | Cloudflare DNS, TXT `_dmarc` |
| Đăng ký lại webhook PayOS | chủ dự án chạy lệnh, agent soạn | `POST /admin/payos/confirm-webhook` với URL mới; phải đúng `API_ORIGIN` mới |
| Luật WAF rate limit `/v1/webhooks/` | chủ dự án | Dashboard, theo kế hoạch 05 Task 21 Step 9a, cho zone mới (`api.aitranslator.io.vn`) |
| Biến GitHub `RELEASES_BASE_URL` | chủ dự án | Settings › Secrets and variables › Actions › Variables |
| Cập nhật cấu hình kênh PayOS nếu có trường tên miền hay website | chủ dự án | Dashboard my.payos.vn |

## 6. Thứ tự và đường lui

0. **Đưa tên miền vào Cloudflare** (mục 5, bước 0). Chưa Active thì dừng ở đây; các bước sau không làm được.
1. Hạ tầng: Worker ra tên mới, R2 custom domain, Email Routing, Resend, DMARC. Kiểm từng cái bằng `curl` (mục 7). App chưa đổi, mọi thứ cũ còn chạy.
2. Đăng ký lại webhook PayOS sang tên mới; thử một giao dịch thật nhỏ (Professional, 50 000 đ, chủ dự án tự hoàn tiền) để kiểm cả đường VietQR, webhook, email tới một địa chỉ **không phải** chủ tài khoản Resend, và app kích hoạt.
3. Đổi code app, test, build bản release ký ad-hoc, cài và thử kích hoạt, kiểm tra cập nhật, tải manifest model.
4. Tắt `workers_dev` và `r2.dev`: **chỉ khi** không còn bản cài nào dùng URL cũ. Việc riêng, ngoài phạm vi này.

Đường lui ở bước 1–3: bản cài cũ và `workers.dev`, `r2.dev` vẫn chạy nguyên; chỉ cần không phát bản mới. Nếu webhook mới lỗi thì đăng ký lại webhook về URL cũ bằng `confirm-webhook`.

## 7. Nghiệm thu

- `curl https://api.aitranslator.io.vn/v1/health` trả `{"ok":true}` qua TLS hợp lệ; `POST /v1/licenses/validate` trả đúng như `workers.dev`.
- `curl -I https://releases.aitranslator.io.vn/models/models.json` trả 200, `Range` trả 206, `Cache-Control` đúng; `latest.json` mới nhất không bị cache cũ.
- Email thử gửi tới một địa chỉ ngoài chủ tài khoản Resend, vào hộp thư đến (không spam), SPF, DKIM, DMARC "pass", có `Reply-To` là `support@aitranslator.io.vn`; thư gửi `support@aitranslator.io.vn` về tới Gmail.
- Luật WAF chặn khi gửi quá 5 request mỗi 10 giây tới `/v1/webhooks/` (trả `429 rate_limited`).
- Bản app mới: kích hoạt key, nhập Pro, kiểm tra cập nhật không lỗi chứng chỉ, tải manifest model; log không còn nhắc `workers.dev` hay `r2.dev`.
- A7 chạy lại một lượt ngắn trên bản mới: mọi request ra ngoài tới hai tên mới, nằm trong `a7-allow.json` đã cập nhật.
- Toàn bộ test Rust, vitest, Node, server (`pnpm check`) xanh.

## 8. Rủi ro

- **Đăng ký `.vn` chưa xong hoặc chưa đặt nameserver** chặn toàn bộ. Đó là lý do bước 0 đứng riêng.
- **Sai chứng chỉ hoặc DNS chưa lan** làm app không gọi được: vì vậy chỉ đổi app sau khi `curl` qua tên mới đạt.
- **Webhook PayOS** đang trỏ `workers.dev`: nếu quên đăng ký lại mà tắt `workers.dev` thì mất xác nhận thanh toán. Đăng ký lại ở bước 2 và không tắt `workers.dev` trong phạm vi này.
- **Thư mới từ tên miền mới dễ vào spam** lúc đầu (chưa có uy tín gửi). DMARC `p=none` lúc đầu, SPF và DKIM đúng, nội dung thư ngắn gọn; kiểm hộp thư thật trước khi bán.
- **Bản cài cũ trên máy chủ dự án** vẫn gọi URL cũ: dùng được cho tới khi tắt chúng; không ảnh hưởng người khác vì chưa ai khác cài.
- **Tài khoản Cloudflare dùng chung với mapsLibVN:** zone riêng tách luật WAF và DNS, nhưng quyền của `wrangler login` vẫn là cả tài khoản (quyết định đã chấp nhận ngày 2026-10-05).

## 9. Ngoài phạm vi

Website (`aitranslator.io.vn` gốc), tắt `workers.dev` và `r2.dev`, đưa admin sang tên miền (cần ứng dụng Access mới), nội dung EULA và chính sách quyền riêng tư (Q8; tên pháp lý và email đã chốt), Windows.
