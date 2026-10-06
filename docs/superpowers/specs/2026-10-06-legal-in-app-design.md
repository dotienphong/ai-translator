# EULA và chính sách quyền riêng tư trong app

Ngày 2026-10-06. Đưa Thỏa thuận cấp phép (EULA) và Chính sách quyền riêng tư (`docs/legal/`) vào sản phẩm, ở bản dùng để phát hành (không hiện "bản nháp"). Thực hiện các việc "cài vào sản phẩm" của `docs/legal/README.md` và spec gốc §10.1 ("EULA trong bộ cài và màn hình Giới thiệu; liên kết chính sách cạnh ô đồng ý"). Chủ dự án duyệt thiết kế và yêu cầu bản chính thức ngày 2026-10-06.

## 1. Quyết định

- **Đóng gói văn bản vào app, không dùng liên kết web.** Website chưa có nên liên kết sẽ 404; văn bản đóng gói chạy ngoại tuyến và luôn đúng phiên bản app. Theo mẫu của `Licenses.tsx`: `import.meta.glob(…, { query: "?raw" })`, mỗi văn bản là một chunk tải khi mở.
- **Hai ngôn ngữ**: hiện văn bản đúng ngôn ngữ giao diện (`vi` hoặc `en`); bản tiếng Việt là bản gốc, thiếu bản thì dùng tiếng Việt.
- **Bộ hiển thị Markdown nhỏ tự viết** cho đúng tập cú pháp của hai văn bản (tiêu đề, đoạn, danh sách, bảng, trích dẫn, **in đậm**, `mã`), tạo phần tử React, không dùng `innerHTML`, không thêm thư viện.
- **Văn bản chính thức:** bỏ dòng "BẢN NHÁP", ghi "Phiên bản 1.0, hiệu lực từ 06/10/2026", điền mặc định hoàn tiền 7 ngày, bỏ dòng địa chỉ liên hệ. `docs/legal/README.md` ghi rõ văn bản **chưa được luật sư xem** (rủi ro chủ dự án chấp nhận khi phát hành).

## 2. Chỗ hiển thị

| Chỗ | Thay đổi |
|---|---|
| **Onboarding, bước mới "Điều khoản"** (ngay sau chọn ngôn ngữ, trước tải model) | Hai văn bản gập được và **ô tick bắt buộc** "Tôi đã đọc và đồng ý với Thỏa thuận cấp phép (EULA) và Chính sách quyền riêng tư". Chưa tick thì nút "Tiếp" bị khóa. Đặt sớm để người dùng đồng ý trước khi tải model hay dùng app |
| **Giới thiệu** | Thẻ mới "Điều khoản và quyền riêng tư": hai văn bản gập được |
| **Màn hình mua** | Dưới ô đồng ý xử lý email, mục gập "Chính sách quyền riêng tư" |

Bước "Quyền riêng tư" cũ của onboarding giữ nguyên (nội dung ngắn về âm thanh không rời máy).

## 3. Không làm ở đợt này

- **Không lưu bằng chứng đồng ý EULA ở máy** (chúng tôi không nhận được, và ô đồng ý email đã được server ghi thời điểm). Hỏi lại khi điều khoản đổi phiên bản: để sau.
- **Bộ cài:** macOS (DMG) không có trang giấy phép; đồng ý ở onboarding là đủ. Trang giấy phép NSIS của Windows làm ở đợt Windows.
- **Website** `aitranslator.io.vn/terms` và `/privacy`: cần spec riêng.
- Người đã qua onboarding (máy đang dùng) không bị hỏi lại.

## 4. Kiểm thử

Cấu hình vitest chỉ chạy logic thuần trong Node (không DOM): test bộ phân tích Markdown (từng khối, từng dòng cú pháp, và hai văn bản thật không còn dấu `**`, `##` thô), bộ chọn văn bản theo ngôn ngữ, và điều kiện chặn nút "Tiếp". Phần hiển thị kiểm bằng `tsc`, `pnpm build` và chủ dự án nhìn trên app thật.
