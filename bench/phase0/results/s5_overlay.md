# S5: thanh phụ đề nổi trên app toàn màn hình

## macOS (kế hoạch 0-05, Task 2 Step 9 và Task 3)

- Máy: Mac M4 Pro, macOS 26.6.2. Ngày thử: 2026-10-04.
- Kết quả: **đạt**. Người chạy (PHONG) báo "đã test và hoạt động tốt" cho phần thử tay trên Mac (chạy thử ở Task 2 Step 9 và ma trận 13 dòng ở Task 3).
- Nguồn: lời báo của người chạy. **Không ghi từng dòng, không có ảnh chụp màn hình** (kế hoạch yêu cầu ảnh dòng 1 và 9 ở `results/s5/`). Các dòng cần "ghi lại" quan sát chưa có dữ liệu:
  - dòng 1: người xem màn hình chia sẻ có thấy thanh không (`content_protected`);
  - dòng 5: Keynote trình chiếu có hiện thanh không;
  - dòng 12: hai màn hình, thanh ở màn hình nào, kéo sang được không;
  - dòng 13: phím tắt trùng với app khác, phản ứng của thanh và app họp.

### Giới hạn đã biết (từ thử nghiệm riêng ngày 2026-10-04)

- Ma trận ở dòng 7 chỉ kiểm "gõ trong ô chat khi phụ đề cập nhật". Không kiểm "bấm vào thanh phụ đề rồi gõ".
- Đo riêng bằng TextEdit: sau khi bấm vào thanh phụ đề, chữ gõ không vào app bên dưới (0/3 ở bản gốc, 1/3 ở bản sửa `is_key_window: true`; đối chứng không bấm thì vào đủ). Vi phạm spec §4.4 "không lấy focus của app họp". Chưa tìm ra nguyên nhân, chưa sửa.
- Lỗi hover/con trỏ của thanh (panel không key nên WebKit coi trang không active) đã sửa bằng `is_key_window: true` ở `src-tauri/src/overlay/macos.rs`. Đã sửa và commit (`9ce83ab`).

## Windows (kế hoạch 0-05, Task 4)

**Chưa làm.** Cần máy Windows 11 (và Windows 10 nếu có).
