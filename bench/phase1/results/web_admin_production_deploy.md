# Triển khai và nghiệm thu Web Admin trên production

Spec: `docs/superpowers/specs/2026-10-07-web-admin-design.md`. Kế hoạch: `docs/superpowers/plans/2026-10-07-web-admin-03-tai-lieu-trien-khai.md` (Task 2–4).
Ngày: 2026-10-08 (giờ ghi theo GMT+7 trừ khi có chữ Z). Chủ dự án chạy mọi lệnh production bằng `!` (auto mode chặn agent dùng token OAuth của wrangler); agent kiểm từ ngoài và ghi biên bản. Không ghi email, key hay `device_id_hash` đầy đủ trong biên bản này.

## Trước triển khai
- Commit `main` lúc bắt đầu: `ad66242` (code Web Admin xong, cây sạch). Không có migration D1, không deploy Worker API `mt-license`, không đổi ứng dụng Access lúc đầu.
- `pnpm check` lúc đó: 461 test server, 264 test giao diện; audit sạch; reviewer cuối soi 10 route bằng Chrome headless, không vi phạm CSP.

## Sự cố: trang chỉ hiện `{"error":"forbidden"}` (08:09 đến 08:47)
- **Triệu chứng:** sau lần deploy đầu, mở `/` hay `/admin/whoami` và đăng nhập Access vẫn nhận `403 forbidden`.
- **Chẩn đoán:** thêm log lý do từ chối (`admin_denied`), `wrangler tail mt-license-admin` cho `reason: "no_access"`: Worker không có `ctx.access`. `ACCESS_AUD` đã đúng (mã audience trong địa chỉ đăng nhập Access thật bằng cấu hình).
- **Nguyên nhân gốc:** Worker có Static Assets chạy sau một router nội bộ của Cloudflare, router này không chuyển `ctx.access` (tài liệu Cloudflare "Cloudflare Access for Workers", phần giới hạn). Spec và code ban đầu giả định `ctx.access` luôn có. Test harness giả `ctx.access` trực tiếp nên không bắt được; lỗi chỉ lộ khi chạy trên nền tảng thật.
- **Sửa:** `src/access-jwt.ts`; khi không có `ctx.access`, Worker xác thực JWT trong header `Cf-Access-Jwt-Assertion` (RS256, khóa công khai tải từ `https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`, kiểm `iss`, `aud`, `exp`, `nbf`, `type`, có `email`). Biến mới `ACCESS_TEAM_DOMAIN`. Thiếu `ACCESS_AUD` hay `ACCESS_TEAM_DOMAIN` thì từ chối mọi request (đóng).
- **Review đối kháng** (reviewer opus, soi bản `e13e4ba`, 61 đột biến): không vượt được xác thực. Lỗi Important duy nhất: bộ tải khóa chia sẻ một promise I/O giữa các request nên có thể treo cả Worker khi request khởi tạo bị hủy. Đã sửa ở `d55307d` (mỗi request tự tải, timeout 5 giây, lùi 5 giây khi lỗi, không dùng khóa hết hạn), kèm thêm kiểm `type`, email chữ thường, và test cho các đột biến sống sót (16 đột biến thử lại, 16 bị bắt).
- **Chưa làm (chủ ý):** danh sách email cho phép trong Worker. Access hiện là lớp duy nhất quyết định "ai", đúng thiết kế đã duyệt; thêm lớp này cần secret vì repo public.

## Tên miền riêng của admin
- Chủ dự án yêu cầu địa chỉ gọn: `admin.aitranslator.io.vn` (trước đó chưa có bản ghi DNS nào). `wrangler.admin.jsonc` thêm `routes` kiểu custom domain; `workers_dev` giữ tạm làm đường lui.
- Lần đầu vào tên miền mới vẫn `forbidden` vì ứng dụng Access chưa phủ hostname (Worker từ chối vì không có JWT: đúng thiết kế đóng, không lộ dữ liệu). Chủ dự án thêm hostname vào Access trên dashboard; sau đó kiểm từ ngoài thấy `302` sang đăng nhập với `kid` **bằng** `ACCESS_AUD`, nên mã audience không đổi và không phải sửa cấu hình.

## Các lần deploy `mt-license-admin` (wrangler deployments list)
Mọi lần deploy từ thư mục làm việc của chủ dự án (không từ commit); nội dung `server/` và `docs/` ở cuối khớp từng byte với `main` `d55307d` (195 file, 0 khác biệt).

| Giờ (GMT+7) | Version | Nội dung |
|---|---|---|
| 08:09 | `206d3608-6666-4db0-81ad-19529eb9a1ac` | Web Admin lần đầu (`ad66242`): trang `forbidden` |
| 08:34 | `15204f68-b411-4e8d-b3f9-ef218f40e361` | thêm log lý do từ chối (`c0a282e`) |
| 08:47 | `23036737-b7e1-4fe5-bbaf-8a85b26747da` | xác thực JWT (`e13e4ba`): vào được trang |
| 08:52 | `053c059f-43fa-4135-93a9-26ef9c75d31d` | tên miền `admin.aitranslator.io.vn` (`c8d43dc`) |
| 09:11 | `5c6e9b38-19d0-42fe-9bc9-aa8cd3fb9acc` | **hiện hành**: sửa treo của reviewer, token org, email chữ thường (`d55307d`) |

Trước đó (không có trang Web Admin): `3d4d18be-65e0-476c-a228-0d709b83cde9` (2026-10-07 19:38, bản ba gói).

## Kiểm từ ngoài, không đăng nhập (khoảng 09:20, sau deploy cuối)
- `https://admin.aitranslator.io.vn` các đường `/`, `/index.html`, `/admin/whoami`, `/admin/queue`: cả bốn `302` sang trang đăng nhập Access; `kid` trong địa chỉ đăng nhập bằng `ACCESS_AUD` (`211e8ca9…1de0`).
- Header `Cf-Access-Jwt-Assertion` tự đặt (giả) vào `/admin/whoami`: vẫn `302` (bị chặn ở edge).
- Địa chỉ cũ `mt-license-admin.<subdomain>.workers.dev` `/`: `302`.
- Không có đường nào trả `200`.

## Cron của Worker API (lần kiểm 08:13, sau deploy admin đầu tiên)
Worker API không deploy trong đợt này. `wrangler tail mt-license --format pretty` thấy `"*/5 * * * *"` chạy lúc 08:15:47 với log `{"event":"reconcile","checked":0,"granted":0,"errors":0,"emails_retried":0,"alerts_sent":0}`. Đạt: sự cố cron 2026-10-07 không tái phát.

## Nghiệm thu (kế hoạch 03, Task 3)
Chủ dự án nghiệm thu trên `admin.aitranslator.io.vn` sau deploy cuối và báo **"hoạt động tốt, test pass"**. Kết quả ghi theo lời báo; không có chi tiết từng mục nên không ghi mục nào là agent đã tận mắt thấy.

| Bước | Kết quả |
|---|---|
| 1. Đăng nhập và các màn hình chỉ đọc (máy tính, Console không có `Refused to …`) | đạt (báo chung) |
| 2. Tra cứu bằng năm loại chuỗi | đạt (báo chung) |
| 3. Ba thao tác ghi trên license thử: gửi lại email, gia hạn 1 ngày, reset hạn mức; nhật ký đủ ba dòng | đạt (báo chung) |
| 4. Điện thoại | đạt (báo chung) |
| 5. Phiên hết hạn (tùy chọn) | không có thông tin |

Agent chưa đối chiếu `audit_log` (auto mode chặn đọc D1 production); chủ dự án có thể xem ba dòng `key_resent`, `license_extended_manually`, `quota_reset` trong trang Nhật ký.

## Đường lui chưa dùng
`cd server && pnpm exec wrangler rollback -c wrangler.admin.jsonc` về bản liền trước (`053c059f…`, còn route và JWT, thiếu sửa treo). Về hẳn bản không có trang Web Admin: version `3d4d18be…` (khi đó admin chỉ dùng được qua `cloudflared access curl`, không có trang). Không có migration D1 nên không có bước lùi dữ liệu.

## Việc còn lại
- Tùy chọn: tắt `workers_dev` của admin (một lần deploy) khi tên miền mới chạy ổn, để còn một địa chỉ.
- `main` chưa push (hơn `origin/main` nhiều commit).
- Phần 2 (Tổng quan, số liệu) và phần 3 (cấu hình, sửa giá) của Web Admin cần spec riêng.
- Bài học: kiểm quyền dựa vào API của runtime phải có test dựng đúng tín hiệu thật (JWT ký thật) và một request thật trên production trước khi coi là xong.
