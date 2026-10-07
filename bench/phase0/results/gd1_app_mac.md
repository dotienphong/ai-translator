# Phase 1 · 02c Task 8: thử phiên dịch thật trên Mac

- Máy: MacBook Pro Apple M4 Pro, macOS 26.6.2.
- Bản chạy: `main`, lần mở gần nhất lúc 21:31 ngày 2026-10-02 (HEAD `5925d42`); các lần mở sớm hơn trong ngày chạy ở `ffaa592` và `84d8ad1` (đã sửa Vite và `run-dev-app.sh` giữa chừng).
- Cách chạy: `scripts/run-dev-app.sh`, gói `AI Translator Dev.app` ký bằng chứng thư "AI Translator Dev".
- Nguồn kết quả: chủ dự án tự thử và báo miệng "đạt" cho nhóm A (chạy bình thường) và nhóm B (thoát, Force Quit, đăng xuất) vào cuối ngày 2026-10-02, không ghi từng bước. Cột "Bằng chứng" là phần agent đối chiếu được trong `~/Library/Logs/com.aitranslator.desktop/app.log` (6 lần khởi động: 20:16, 20:55, 20:56, 20:59, 21:02, 21:31). "Chỉ lời báo" nghĩa là không có dòng log hay số đo nào để kiểm lại.

| Step | Nội dung | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Chuẩn bị: model, `binaries/` | đạt | agent kiểm: đủ ba model, 12 file `binaries/` |
| 2 | Mở app, tiến trình phụ chạy sẵn | đạt | log: `Starting`/`Ready` của Asr (Metal) và Llama sau mỗi lần mở; `first_run: true` ở 20:17 |
| 3 | Hủy, Bắt đầu lại, Thoát lúc đang chuẩn bị | đạt (chủ dự án báo) | chỉ lời báo |
| 4 | Bắt đầu, quyền ghi âm thanh, phụ đề tiếng Việt trong khoảng 2 giây | đạt (chủ dự án báo) | chỉ lời báo; chưa ghi lại hộp thoại xin quyền có nói "AI Translator" hay "Terminal", và trường hợp từ chối quyền (dòng 2 của C1) |
| 5 | Dừng, phím tắt, khay, tai nghe, AirPods, tạm dừng 60 giây, máy ngủ | đạt (chủ dự án báo) | chỉ lời báo; chưa ghi hai dòng `số liệu thu` lúc tạm dừng, chưa ghi kết quả máy ngủ |
| 6 | Cài đặt › Âm thanh (Chrome, Safari, app không phát tiếng, độ nhạy) | đạt (chủ dự án báo) | chỉ lời báo; chưa chép bảng `print_the_playing_apps` |
| 7 | Thiếu quyền, neo System Settings | đạt (chủ dự án báo) | chỉ lời báo; chưa ghi neo nào mở đúng trang (điểm cần quyết 3 của 02a vẫn mở) |
| 8 | Sửa byte `libggml`, đổi tên model, model rác | chưa có bằng chứng | agent kiểm sau đó: model còn nguyên tên và dung lượng, `git status` sạch; không thấy mã `sidecarTampered`, `modelMissing`, `modelBroken` trong log (lỗi chỉ hiện ở giao diện) |
| 9 | Thoát ở khay, Force Quit, tắt khi rảnh 10 phút | một phần | Force Quit: có. Log 20:59:59 `đã kill 1 tiến trình phụ còn sót từ lần chạy trước` (llama-server pid 5386). Thoát ở khay: không có dòng `thoát theo yêu cầu từ menu khay` nào trong log. Rảnh 10 phút: chỉ lời báo |
| 10 | Log không chứa chữ phụ đề | chưa thử | chưa tìm bằng `grep` |
| 11 | Phiên dài 2 giờ | không làm | tùy chọn |

## Việc còn thiếu của Task 8
- Step 3, 8, 9 (phần thoát ở khay) và 10 cần làm lại có ghi bằng chứng.
- Chưa có số liệu để điền C1 và C2.
