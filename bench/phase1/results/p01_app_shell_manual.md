# Giai đoạn 1 · 01 Task 24: thử tay khung app trên macOS

- Máy: MacBook Pro Apple M4 Pro, macOS 26.6.2.
- Bản chạy: như `bench/phase0/results/gd1_app_mac.md` (`main`, từ `ffaa592` tới `5925d42`), chạy bằng `scripts/run-dev-app.sh`.
- Nguồn: chủ dự án báo miệng "đạt" cho nhóm A (khay, phím tắt, thanh phụ đề, Cài đặt) và nhóm B (thoát, Force Quit, đăng xuất) ngày 2026-10-02; không ghi từng dòng. Cột "Bằng chứng" là phần đối chiếu được trong `app.log`.
- Ghi chú plan: dòng 3 và 6 của bảng gốc nói "phụ đề mẫu"; từ 02c, Bắt đầu là dịch thật.

| Dòng | Nội dung | Kết quả | Bằng chứng |
|---|---|---|---|
| 1–13 | lần đầu mở, khay, phím tắt, khóa, kéo thanh, màn hình ngoài, Cài đặt, zoom, X/`⌘W` | đạt (chủ dự án báo) | chỉ lời báo; chưa có ảnh dòng 2 (chưa lưu vào `p01/`) |
| 14 | `⌘Q`, Quit ở Dock không thoát | đạt | log: nhiều dòng `bỏ qua yêu cầu thoát không đến từ menu khay` (20:17 tới 22:03) |
| 15 | Quit ở Dock khi cửa sổ ẩn | đạt (chủ dự án báo) | chỉ lời báo |
| 16 | Khay › Thoát | chưa có bằng chứng | log không có dòng `thoát theo yêu cầu từ menu khay` |
| 17 | Log Out, Restart, Shut Down không bị chặn | một phần | Log Out: có. Log 20:56:21 `cho thoát theo yêu cầu của hệ thống` với lý do `1919706991` (`'rlgo'`). Restart (`'rrst'`) và Shut Down (`'rsdn'`): không có dòng log |
| 18 | Bản thứ hai thoát ngay | đạt (chủ dự án báo) | chỉ lời báo |
| 19–21 | Khởi động cùng hệ thống, Login Items | chưa có bằng chứng | log không có dòng về trạng thái khởi động cùng hệ thống; chưa thử theo lời báo |
| 22–23 | `settings.json` hỏng, bản mới hơn | chưa có bằng chứng | thư mục dữ liệu hiện chỉ có `settings.json`, `sidecars-live.json`, `sidecars-seen.json`, không có `settings.json.corrupt-*` |
| 24 | Mở thư mục log | đạt (chủ dự án báo) | `app.log` có tại thư mục log |
| 25 | Chặn điều hướng | một phần | log có 3 dòng `chặn điều hướng tới http://127.0.0.1:1420` (20:49, 20:53, 20:54), do bản trước khi sửa Vite (`ffaa592`). Không lặp lại sau 20:55. Chưa thử `example.com` bằng console |
| 26 | Keychain `os_keystore` | chưa thử | chưa chạy `cargo test … os_keystore -- --ignored` |
| 27–32 | phím tắt trùng app họp, S5, chứng thư, bản debug đóng gói, `⌃⌥↑`, VoiceOver | chưa thử | không có bằng chứng |

## Việc còn thiếu của Task 24
- Dòng 16, 17 (Restart, Shut Down), 19–23, 25 (console), 26 và 27–32.
- Ảnh dòng 2, 5 và 14.
