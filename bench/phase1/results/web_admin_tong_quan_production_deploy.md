# Triển khai và nghiệm thu Web Admin phần 2 (trang Tổng quan) trên production

Spec: `docs/superpowers/specs/2026-10-08-web-admin-tong-quan-design.md`. Kế hoạch: `docs/superpowers/plans/2026-10-08-web-admin-tong-quan-0{0,1,2,3}-*.md`.
Ngày: 2026-10-08 (giờ GMT+7). Chủ dự án chạy lệnh deploy bằng `!` (auto mode chặn agent dùng token OAuth của wrangler); agent kiểm từ ngoài và ghi biên bản. Không ghi email, key hay `device_id_hash` trong biên bản này.

## Trước triển khai
- Commit đã deploy: `d766636` trên `main`, cây làm việc sạch lúc deploy. Làm thẳng trên `main` theo yêu cầu của chủ dự án, thực thi bằng subagent (mỗi nhiệm vụ một subagent, rồi reviewer độc lập cuối).
- `cd server && pnpm check` (chạy lại ngay trước khi deploy, đầu ra do chủ dự án dán): exit 0; 547 test server, 297 test giao diện, 17 test script Node (1 bỏ qua có chủ ý), build và `dry-run` đều qua. `pnpm audit --audit-level high`: không có lỗ hổng.
- Không migration D1, không deploy Worker API, không đổi Access.

## Cổng kiểm chứng Recharts và CSP (nhiệm vụ 4 của kế hoạch giao diện)
- Recharts `3.10.1` và react-is `19.3.0`, ghim đúng phiên bản; cài không có cảnh báo peer dependency.
- Công cụ `server/admin-ui/scripts/csp-check.mjs` (Chrome headless, đúng CSP production): máy tính (sáng và tối) và điện thoại 500px: **0 vi phạm CSP, 0 lỗi console**, `recharts-surface` có trong DOM (biểu đồ thật sự được vẽ). Công cụ tự kiểm: bắt được trang cố tình vi phạm (`--probe`).
- Dung lượng: `OverviewPage-*.js` 377,87 KB (108,81 KB gzip theo Vite) trong ngưỡng 250 KB gzip; Recharts chỉ nằm trong file này, `index-*.js` không chứa Recharts. Gói chính 267,04 KB (82,42 KB gzip), nền trước phần 2 là 264,19 KB (80,39 KB gzip): tăng khoảng 2,9 KB do route, thanh bên và bộ nạp lười.
- Phát hiện về công cụ khi chụp ảnh: `preferredColorScheme` 0 là tối, 1 là sáng (không cờ thì theo hệ điều hành); Chrome headless ép độ rộng tối thiểu 500px nên khổ 390px thật chỉ kiểm được trên điện thoại.

## Rà soát cuối (reviewer độc lập, opus)
- Không có lỗi Critical; kết luận an toàn để deploy. Đối chiếu spec: khớp, trừ ba lệch nhỏ (route đặt ở `admin-stats.ts` thay `admin-read.ts` để tránh vòng import, đã ghi ở kế hoạch 00; gói chính tăng nhẹ; nhãn tóm tắt của biểu đồ chỉ là tiêu đề).
- Đột biến: 98 đột biến SQL và 44 đột biến giao diện. Các đột biến sống sót cho thấy lỗ hổng test (đảo điều kiện email đã gửi, `GROUP BY` của grants theo tháng, `amount_paid` so với `amount`, dữ liệu đưa vào biểu đồ chỉ kiểm số dòng): **đã vá hết** ở các commit `4436101` và `d766636`; mỗi test mới được chứng minh đỏ khi áp lại đúng đột biến. Kết quả: server 547 test (trước vá 543), giao diện 297 (trước 287).
- Sửa Minor: thứ tự chú giải và tooltip theo thứ tự chuỗi (`itemSorter`), trục đếm chỉ có số nguyên (`allowDecimals`), `Object.hasOwn` thay `in`, comment của `admin.ts`.
- Chưa sửa (Minor, ghi để sau): Recharts 3 có lớp `accessibilityLayer` lồng trong khung `role="img"`; dữ liệu mẫu của trang chép ở `dev/fake-api.ts` và `scripts/csp-check.mjs`; "Cập nhật lúc HH:mm" không có ngày; hiệu năng ước tính khoảng 6 lần số đơn paid mỗi lần xem (ổn cho một người vận hành; nếu `orders` vượt khoảng 100.000 dòng thì thêm chỉ mục `(status, paid_at)` bằng migration riêng).

## Deploy `mt-license-admin`
- Lệnh: `pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc` từ `server/` của thư mục chính (nhánh `main`).
- Kết quả: `Uploaded mt-license-admin`, 4 tệp tĩnh mới (`index.html`, `index-*.css`, `index-*.js`, `OverviewPage-DJRNS2t6.js`), binding `ASSETS`, `API (mt-license#AdminRpc)`, `DB`; `admin.aitranslator.io.vn (custom domain)`.
- **Current Version ID: `596d98e8-ab15-493d-9237-2d722ec419c4`** (deploy sau 11:46 giờ VN, lúc chủ dự án chạy `pnpm check` ngay trước đó). Bản liền trước (đường lui): `5c6e9b38-19d0-42fe-9bc9-aa8cd3fb9acc`.

## Kiểm từ ngoài, không đăng nhập (sau deploy)
`https://admin.aitranslator.io.vn` các đường `/`, `/overview`, `/admin/stats`, `/admin/whoami` và `/assets/OverviewPage-DJRNS2t6.js`: cả năm `302` sang trang đăng nhập Access; mã audience trong địa chỉ đăng nhập khớp `ACCESS_AUD`. Không có đường nào trả `200`.

## Nghiệm thu (kế hoạch 03, Task 3)
Chủ dự án nghiệm thu trên `https://admin.aitranslator.io.vn/overview` và báo "ok", không có lỗi nào được nêu. Kết quả ghi theo lời báo chung; không có chi tiết từng mục nên không ghi mục nào là agent đã tận mắt thấy.

| Bước | Kết quả |
|---|---|
| 1. Mở trang, Console không có `Refused to …`, tải lười của `OverviewPage-*.js` | đạt (báo chung) |
| 2. Đối chiếu số liệu với trang Đơn hàng và Việc cần xử lý | đạt (báo chung) |
| 3. Làm mới, dòng `stats_viewed` trong Nhật ký | đạt (báo chung) |
| 4. Điện thoại và giao diện tối, tooltip | đạt (báo chung) |
| 5. Phiên hết hạn (tùy chọn) | không có thông tin |

Điểm cần nhớ khi đọc số (ghi từ rà soát cuối): `last_7d` tính 7 ngày lịch còn `paid_orders_7d` của trang Việc cần xử lý tính 7×24 giờ trượt; `active_devices` đếm theo dòng kích hoạt (một máy trên hai license đếm hai); liên kết `/orders?status=` không lọc ngày nên danh sách có thể dài hơn số 30 ngày; đơn `paid_needs_review` được cấp lại giữ `paid_at` cũ nên doanh thu của tháng cũ có thể đổi sau khi đã xem; tỷ lệ phần trăm làm tròn (199/200 hiện 100%).

## Đường lui chưa dùng
`cd server && pnpm exec wrangler rollback -c wrangler.admin.jsonc` (về `5c6e9b38…`). Không có thay đổi dữ liệu nên không có bước lùi dữ liệu.

## Việc còn lại
- Phần 3 của Web Admin (xem `ops_alerts` đầy đủ, bản phát hành và model trên R2, sửa bảng giá): cần brainstorm riêng, dự kiến tách 3a chỉ đọc và 3b sửa giá (rủi ro cao nhất).
- Các Minor chưa sửa ở trên.
