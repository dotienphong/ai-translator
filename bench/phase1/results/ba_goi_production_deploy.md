# Triển khai ba gói và mỗi key một máy lên production

Spec: `docs/superpowers/specs/2026-10-07-three-plans-single-device-design.md`. Kế hoạch: `docs/superpowers/plans/2026-10-07-ba-goi-03-tai-lieu-trien-khai.md` (Task 13–16).
Ngày: 2026-10-07. Chủ dự án chạy mọi lệnh production bằng script (auto mode chặn agent đọc và ghi D1 production: `wrangler d1 execute --remote` từ phiên agent trả lỗi 7403).

## Trước triển khai (Task 13)
- Commit `main`: `3a4c300` (code), cây sạch.
- Bộ kiểm cục bộ: server `pnpm check` 418 test; Rust lib 479, Vitest 167; `cargo fmt`, `clippy -D warnings`, `check-windows.sh`, `pnpm build` xanh.
- Migration chưa áp: chỉ `0002_three_plans_trials.sql`.
- `licenses` theo gói: `pro` 3, `pro_x2` 1.
- `orders` theo gói và trạng thái: `pro` paid 2; `pro_x2` paid 1, expired 1.
- License có từ 2 máy đang kích hoạt: có 1 (`329acf1a…`: máy `aavn-macbook042` và `DESKTOP-SVU53VN`).
- Đơn đang chờ: không có.
- Cột 4 bảng (`licenses` 13, `activations` 11, `deactivations` 5, `orders` 22): khớp đúng `0001`, không cột lạ.
- Bộ đếm: `orders` 1000004, `deactivations` 4, `audit_log` 30.
- Mốc Time Travel lúc kiểm: `00000060-00000000-000050fd-259eb7780da14ed698d17b38ba2ac218`.

## Quyết định của chủ dự án
Toàn bộ license, đơn và máy trên production là dữ liệu thử. Chủ dự án yêu cầu xóa hết và đưa bộ đếm về mốc ban đầu (đơn đầu tiên là 1.000.001), sẽ tự tạo lại license. Vì vậy không có chuyển đổi mã gói cho dữ liệu thật, và license 2 máy không cần gỡ riêng.

## Triển khai (Task 15, 16)
- Giai đoạn 1 (D1):
  - Bookmark Time Travel ngay trước khi ghi: `00000063-00000000-000050fd-7d95cadf3e0eaee7c7ba4b66d9e6118b`.
  - Xóa: `deactivations`, `activations`, `orders`, `licenses`, `rate_limits`, `ops_alerts`; thêm một dòng `audit_log` (`wipe_test_data`). `audit_log` cũ giữ nguyên.
  - Áp `0002_three_plans_trials.sql` (26 lệnh) thành công; `migrations list` báo không còn migration chưa áp.
  - Đặt lại bộ đếm: `sqlite_sequence.orders` = 1000000, xóa dòng `deactivations`. D1 production cho ghi `sqlite_sequence`.
  - Sau đó: mọi bảng 0 dòng (kể cả `trials`); `PRAGMA foreign_key_check` rỗng; `licenses` và `orders` có CHECK `('monthly', 'yearly')` và không còn `pro_x`; đủ 8 index của `0001`.
- Giai đoạn 2 (Worker):
  - `pnpm check` xanh (418 test).
  - API `mt-license`: Current Version `bce7980b-b311-4adb-b7fa-621228060d8b`, `schedule: */5 * * * *`; `triggers deploy` chạy lại, vẫn có `*/5 * * * *`; `/v1/health` trả `{"ok":true}`.
  - Admin `mt-license-admin`: Current Version `3d4d18be-65e0-476c-a228-0d709b83cde9`; `/admin/whoami` khi chưa đăng nhập: `302`.
  - `/v1/plans`: đúng hai gói `monthly` (3000, 30, 50000) và `yearly` (null, 365, 500000).
  - `/v1/trial` (máy giả, gọi hai lần): `typ: trial`, `same_device: true`, `days: 10`, `same_start: true`, `kid: prod-2026-10-1` (ô `a` đang ký); mã sai dạng trả `400`; dòng thử đã xóa (`trials` còn 0).
- Cron: đã đăng ký lại; **chưa** thấy sự kiện `reconcile` trong `wrangler tail` (cần chờ qua một mốc 5 phút).
- Admin tra cứu có đăng nhập (`cloudflared access`): chưa thử; không còn license nào để tra cứu.

## Đường lui chưa dùng
`wrangler rollback --name mt-license` và `--name mt-license-admin`; D1: `wrangler d1 time-travel restore mt-license-production --bookmark=00000063-00000000-000050fd-7d95cadf3e0eaee7c7ba4b66d9e6118b` (lùi Worker trước, D1 sau).

## Thử tay trên Mac (bản dev, 2026-10-07)
- **Cron:** `wrangler tail` thấy `"*/5 * * * *"` chạy lúc 19:40:56 với log `{"event":"reconcile","checked":0,...}`. Đạt.
- **Đăng ký dùng thử:** bản dev gọi `/v1/trial` lúc khởi động (log `POST /v1/trial - Ok`). Đạt.
- **Sự cố tạo mã thanh toán (đã sửa):** đơn đầu sau khi xóa dữ liệu thử lỗi `502 payment_provider_error`. Log: `PayOS lỗi HTTP 200: Đơn thanh toán đã tồn tại` (`checkout_failed`, order_code 1000004). Nguyên nhân: bộ đếm số đơn bị đưa về 1.000.000, trùng các `orderCode` 1000001–1000004 mà PayOS đã nhận trước đó. Ba đơn 1000001–1000003 và đơn 1000004 ở trạng thái `failed`. Bộ đếm tự vượt lên 1000004 sau các lần thử; đơn kế tiếp là 1000005. Bài học ghi ở `docs/release/phat-hanh.md` (mục giữ chỗ số đơn).
- **Mua Monthly thật qua PayOS:** hiện mã QR, thanh toán thành công, app tự kích hoạt lên gói Monthly (webhook, cấp key và `activate` qua đơn đều chạy). Đạt.
- **Chưa thử:** đổi sang Yearly (xem số ngày quy đổi), xung đột hai máy (`allow_conflict`), gỡ máy từ xa, dùng thử hết hạn, email nhận key.
