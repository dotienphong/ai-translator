# Triển khai production của license server (2026-10-05)

Người làm: PHONG (nhập secret, bật Access, chuyển tiền); kiểm bởi agent. Quy trình: `docs/release/phat-hanh.md` mục 4. Không ghi key, email hay token.

| Bước | Kết quả |
|---|---|
| D1 `mt-license-production`, migration `0001_init.sql`, giữ chỗ số đơn | Đạt (đơn đầu là 1.000.001) |
| Worker API `mt-license` | `/v1/health` trả `{"ok":true}`; cron `*/5 * * * *` có |
| Worker admin `mt-license-admin` sau Cloudflare Access | Chưa đăng nhập thì 302 về trang đăng nhập; đăng nhập qua `cloudflared access curl` trả `whoami` đúng email người vận hành |
| Cookie Access | SameSite Lax, HttpOnly. **Binding Cookie phải tắt** (bật thì `cloudflared access login` báo `failed to verify token`; rủi ro đã chấp nhận ở QĐ30) |
| Webhook PayOS (`confirm-webhook`) | `{"ok":true}` |
| Ký thử bằng khóa dự phòng (ô B) | `OK production b prod-2026-10-2` |
| Giao dịch thật, gói `pro`, 50.000 đ, đơn 1000001 | `paid` sau khoảng 1 giây kể từ lúc chuyển; `grant_kind: new`; email gửi lần 1, không lỗi |
| Token thật ký bằng ô A | `OK production a prod-2026-10-1`; `plan: pro`, `quota_minutes_per_cycle: 1800`, `refresh_before - issued_at = 1209600` |
| Kích hoạt rồi gỡ máy giả | `activated`, `deactivated` trong audit; audit không chứa email |
| **Múi giờ `transactionDateTime` (giả định 11, QĐ33)** | `paid_at` = 11:37:40 giờ Việt Nam, người chuyển báo 11:37: **PayOS trả giờ Việt Nam, đạt** |
| App dev (`scripts/run-dev-app.sh`) nhập key thật | Cài đặt › Bản quyền hiện Professional (người chạy xác nhận) |

Chưa làm: 05 Task 20 Step 9 (đổi gói), Step 11 (kiểm `changes()` trên D1 thật), 06b Task 6 Step 2, 4–6 (hạn mức Free, gia hạn, máy thứ hai, mất mạng, đổi giờ, Keychain). `OPERATOR_EMAIL` chưa đặt (cảnh báo chỉ nằm trong log). Chưa có tên miền: dùng `*.workers.dev`, và Resend chỉ gửi được tới email chủ tài khoản.
