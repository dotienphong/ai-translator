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
| **`changes()` trên D1 thật (05 Task 20 Step 11)** | License thử cấp tay qua admin, kích hoạt, `reset-quota`, thu hồi hai lần. `reset-quota` trả `quota_epoch: 1`; thu hồi lần 1 `{"ok":true}`, lần 2 `not_found`; audit đúng 4 dòng (`activated` 1, `license_issued_manually` 1, `license_revoked` **1**, `quota_reset` **1**): D1 thật cho `changes()` đúng như SQLite trong batch. License thử đã thu hồi |
| App dev (`scripts/run-dev-app.sh`) nhập key thật | Cài đặt › Bản quyền hiện Professional (người chạy xác nhận) |

Chưa làm: 05 Task 20 Step 9 (đổi gói, tốn tiền thật), 06b Task 6 Step 2, 4–6 (hạn mức Free, gia hạn, máy thứ hai, mất mạng, đổi giờ, Keychain). `OPERATOR_EMAIL` chưa đặt (cảnh báo chỉ nằm trong log). Chưa có tên miền: dùng `*.workers.dev`, và Resend chỉ gửi được tới email chủ tài khoản.

## Khóa, R2 và model (2026-10-05)

| Bước | Kết quả |
|---|---|
| Khóa ký bản cập nhật (minisign `704CE5507939A2FE`) | Tạo ngoại tuyến, có passphrase thật (ký bằng passphrase rỗng bị từ chối). Khóa riêng nằm trong secret `TAURI_SIGNING_PRIVATE_KEY` của environment `release` |
| Khóa ký manifest `prod-2026-10-1` | Tạo ngoại tuyến, bản rõ chỉ nằm trong ổ RAM; file mã hóa AES-256 (`pbkdf2`, 600000 vòng). Nạp lại vào `MANIFEST_SIGNING_KEY` sau khi kiểm giải mã đúng `kid` và `x` |
| Bản sao khóa | Không dùng USB: thư mục `~/ai-translator-keys` đã chép sang một máy khác, passphrase viết tay (quyết định của chủ dự án) |
| Bucket R2 `ai-translator-releases` | URL công khai `r2.dev`; token Object Read & Write chỉ cho bucket này (không liệt kê được bucket khác) |
| `sign-manifest.yml` lần đầu | Thêm cờ `first_release` (`9b1f21e`). Job `sign` lỗi "failed to be acquired" ba lần liền, kể cả sau khi chuyển sang `ubuntu-24.04` (`de86457`). **Nguyên nhân: secret `MANIFEST_SIGNING_KEY` nạp lần đầu bị hỏng** (một secret hỏng làm cả environment `release` không cấp được máy, kể cả job không dùng secret). Tách bằng workflow chẩn đoán: environment mới `diag-open` và `diag-review` xanh. Xóa rồi nạp lại secret thì xanh |
| `models.json` đã ký | Chữ ký hợp lệ với `prod-2026-10-1`, nội dung giống hệt `scripts/models/released/body-1.json`, 10/10 file đúng dung lượng |
| Upload lên R2 | `rclone`, 11/11 file, 3,55 GiB trong 1 phút 36 giây. Từ ngoài vào: `models.json` 200, `Range` 206, 10/10 dung lượng đúng |

### Thử trong app (người chạy xác nhận, không có số liệu)
Đạt: tải model từ R2 (gói Chuẩn, tạm dừng và tiếp tục, rớt mạng), đổi sang gói Nhẹ và xóa gói Chuẩn, nhập key thật hiện Professional, mất mạng, lùi giờ và tiến giờ 1 năm, xóa dữ liệu giữ bản quyền, gỡ kích hoạt, xóa model và dữ liệu.

**Chưa thử** (nên vẫn "chờ" trong bảng đối chiếu): mua gói trong app bằng VietQR, gia hạn, đổi gói, kích hoạt máy thứ hai và thứ ba, hạn mức Free (10 phút) trong app, số lần macOS hỏi Keychain.

### Quyết định của chủ dự án
Repo public (chủ ý); Cloudflare dùng chung tài khoản với mapsLibVN (chấp nhận); không dùng USB cho bản sao khóa; `OPERATOR_EMAIL` làm ở Phase 2. Quét 659 commit: không có khóa riêng, khóa API hay file `.env` nào trong lịch sử.
