# Web Admin phần 3a: trang Hệ thống (cảnh báo vận hành, bản phát hành, model)

Ngày: 2026-10-08. Trạng thái: chủ dự án yêu cầu làm ngay trên `main` (2026-10-08); thiết kế dưới đây do agent chốt theo mặc định hợp lý, chủ dự án xem lại khi nghiệm thu.
Thuộc phần 3 của lộ trình `2026-10-07-web-admin-design.md`. Phần 3b (sửa bảng giá) không nằm ở đây: rủi ro cao nhất, hoãn.

## 1. Phạm vi

Một trang `/system` ("Hệ thống") chỉ đọc, hai nguồn:

1. **Cảnh báo vận hành:** toàn bộ bảng D1 `ops_alerts` (trang "Việc cần xử lý" chỉ hiện nhóm chưa báo hết, tối đa 20).
2. **Bản phát hành và model:** đọc từ bucket R2 công khai `https://releases.aitranslator.io.vn` qua URL (không thêm binding R2, không secret): `stable/latest.json`, `beta/latest.json`, `models/models.json`.

Không làm: sửa hay xóa gì, xác minh chữ ký (app mới là nơi kiểm chữ ký), liệt kê mọi phiên bản cũ (cần binding R2; hoãn), tải file về.

## 2. API (cả hai route chỉ đọc, sau `useAdminAuth`, `crossSite` thì 403, ghi đúng một dòng nhật ký không email)

### `GET /admin/alerts` (nhật ký `alerts_viewed`)
`{ items, total, pending }`. `items`: tối đa 200 dòng `ops_alerts` mới nhất trước (`window_start` giảm dần, rồi `kind`), mỗi dòng `{ kind, window_start, count, notified_count, notified_at }`. `total` là tổng số dòng, `pending` là số dòng có `count > notified_count`.

### `GET /admin/releases` (nhật ký `releases_viewed`)
`{ base_url, channels: { stable, beta }, models }`. Worker tự gọi ba URL công khai (đầu vào cố định từ biến `RELEASES_BASE_URL`, không nhận tham số nào từ request, nên không có SSRF).
- `channels.stable|beta`: `{ status: "ok", version, pub_date, notes, platforms: string[] }` hay `{ status: "missing" }` (HTTP 404 hay 403) hay `{ status: "error", reason }`. `notes` cắt tối đa 1000 ký tự; `platforms` là tên các khóa của `platforms`.
- `models`: `{ status: "ok", sequence, published_at, kid, packs: string[], files: [{ id, kind, version, bytes, tier, min_app_version }] }`, hay `missing`, hay `error`. `body` của phong bì được giải base64url rồi JSON; chỉ chép đúng các trường trên (danh sách trắng), không chép `url`, `sha256`, `license_id`. Chữ ký không được kiểm.
- Giới hạn: mỗi lần gọi có hạn 5 giây, không theo chuyển hướng, phản hồi tối đa 1 MiB; ba lần gọi chạy song song; một nguồn lỗi không làm hỏng nguồn khác. `reason` chỉ là mã cố định (`timeout`, `http_<mã>`, `too_large`, `invalid_json`, `invalid_shape`), không chép nội dung do bucket trả về.
- Lấy dữ liệu qua `AdminDeps.fetchPublic(url)` (tiêm được trong test); mặc định gọi `fetch` với hạn 5 giây và `redirect: "manual"`.

Cấu hình: biến `RELEASES_BASE_URL` trong `wrangler.admin.jsonc` (`https://releases.aitranslator.io.vn`, không có `/` cuối); test cấu hình khóa định dạng và khớp `RELEASES_BASE_URL` đã nằm trong `src-tauri/src/updater/source.rs`. Thiếu biến thì `/admin/releases` trả `503 releases_not_configured`.

`alerts_viewed` và `releases_viewed` vào `VIEW_ACTIONS` (ẩn mặc định ở Nhật ký).

## 3. Giao diện

Trang `/system`, mục "Hệ thống" ở thanh bên (sau "Tổng quan"). Hai nguồn tải riêng bằng `useLoad` (một nguồn lỗi không che nguồn kia), nút "Làm mới" tải lại cả hai.
- **Cảnh báo vận hành:** tóm tắt "N dòng, M chưa báo"; bảng (Loại, Từ giờ, Số lần, Đã báo, Trạng thái "Chưa báo" tone cảnh báo hay "Đã báo"); rỗng thì "Chưa có cảnh báo nào". Chú thích: cron báo email mỗi giờ.
- **Bản phát hành app:** hai thẻ Stable và Beta: phiên bản, ngày phát hành (GMT+7), nền tảng, ghi chú; `missing` thì "Chưa có bản nào"; `error` thì "Không đọc được (<lý do>)".
- **Model:** dòng tóm tắt (số thứ tự bản manifest, ngày đăng, khóa ký `kid`, số file, tổng dung lượng) và bảng file (Id, Loại, Phiên bản, Dung lượng, Gói, Cần app từ bản). `missing` và `error` như trên.
- Chú thích cuối trang: "Chỉ đọc từ URL công khai, không kiểm chữ ký; chữ ký do app kiểm."
- Không style inline, không script inline (CSP giữ nguyên); không thư viện mới.

## 4. Kiểm thử và nghiệm thu
Test server (route, danh trắng trường, giới hạn kích thước, thời gian chờ, lỗi từng nguồn độc lập, nhật ký, 403), test giao diện (các trạng thái ok, missing, error, rỗng), `pnpm check`, công cụ CSP (`scripts/csp-check.mjs --path=/system`), CI xanh. Triển khai: chỉ Worker admin (thêm biến `RELEASES_BASE_URL`), không migration. Hoàn tác: `wrangler rollback -c wrangler.admin.jsonc`.
