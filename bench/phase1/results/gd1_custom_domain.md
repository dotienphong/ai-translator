# Chuyển URL sang tên miền riêng `aitranslator.io.vn` (2026-10-06)

Thiết kế: `docs/superpowers/specs/2026-10-06-custom-domain-design.md`. Kế hoạch: `docs/superpowers/plans/2026-10-06-chuyen-ten-mien.md`. Không ghi khóa, token hay key trong file này.

## Hạ tầng (kiểm bằng lệnh, qua DNS 1.1.1.1 và DNS mặc định)

| Mục | Kết quả |
|---|---|
| Zone `aitranslator.io.vn` (tài khoản Cloudflare chính; nameserver `anderson` và `journey`) | Active; zone mới riêng, không lẫn mapsLibVN |
| Email Routing | MX `route1–3.mx.cloudflare.net`, SPF; quy tắc `support@aitranslator.io.vn` → Gmail chủ dự án; thư thử đã nhận |
| Resend `mail.aitranslator.io.vn` (vùng ap-northeast-1) | Verified: DKIM, SPF, MX bounce, CNAME `rsend.mail`; thêm bằng API, đều DNS only |
| DMARC `_dmarc` | `v=DMARC1; p=none; rua=mailto:support@aitranslator.io.vn` |
| Worker API `mt-license` | `api.aitranslator.io.vn` (custom domain, HTTPS hợp lệ); `/v1/health` `{"ok":true}`; `/v1/plans` khớp từng byte với `workers.dev`; `workers.dev` vẫn chạy (đường lui) |
| Worker admin `mt-license-admin` | Giữ `workers.dev`; `API_ORIGIN` = `https://api.aitranslator.io.vn` |
| Email gửi khách | Thư thử tới địa chỉ ngoài tài khoản Resend vào hộp thư đến, SPF/DKIM/DMARC PASS, `Reply-To: support@…`, trả lời về được; license thử đã thu hồi |
| R2 `releases.aitranslator.io.vn` | 10/10 file model cùng dung lượng với `r2.dev`; `Range` 206; `models.json` giống hệt và `cache-control: no-cache`; SHA-256 của 6 file nhỏ khớp manifest ký |
| WAF `webhook-rate-limit` (5 request/10 giây/IP, `/v1/webhooks/`, 429 `{"error":"rate_limited"}`) | 6 lần `400` rồi `429`; `/v1/health` không bị ảnh hưởng; trả lại bình thường sau 10 giây (Cloudflare đếm gần đúng, lệch một request) |
| Webhook PayOS | `confirm-webhook` trả `{"ok":true,"webhook_url":"https://api.aitranslator.io.vn/v1/webhooks/payos"}` |
| Giao dịch thật 50.000 đ (đơn 1000004, qua API) | `paid`, `grant_kind: new`; thư có key tới hộp thư, `Reply-To` đúng, "được gửi bởi `send.mail…`, xác thực bởi `mail.aitranslator.io.vn`"; `/v1/pay/return` và `/v1/pay/cancel` 200, có thương hiệu |

## Bản app mới (`c81d9bd`, `88a9749`; bản release `0.1.0` ký ad-hoc, CDHash `96a8ef1d…`)
- Trong file thực thi: `https://api.aitranslator.io.vn` (1), `https://releases.aitranslator.io.vn` (2); không còn `workers.dev` hay `r2.dev`.
- Log chạy thật: không còn URL cũ; kiểm tra cập nhật tới `https://releases.aitranslator.io.vn/stable/latest.json` (báo không kiểm được vì chưa đăng bản nào, đúng dự kiến); không "không chính hãng".
- Server: activation tạo lúc 12:25:30 từ bản mới (audit `activated`), license gói Professional của đơn 1000004.
- Kiểm tra: 798 test Rust, 140 vitest, 81 test Node, 82 test Python, clippy sạch; `release-ready.mjs --base-url https://releases.aitranslator.io.vn` báo `đủ cấu hình production`.

## Chưa làm
A7 ngắn trên bản mới (danh sách cho phép đã đổi sang hai tên mới); tắt `workers_dev` và `r2.dev`; chuyển admin sang tên miền; website; EULA và chính sách; siết DMARC lên `quarantine`.
