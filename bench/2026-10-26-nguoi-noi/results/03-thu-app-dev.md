# Thử app dev có nhận giọng (kế hoạch 03b, Task 23)

Ngày 2026-10-27, macOS (M4 Pro), bản debug `AI Translator Dev` dựng từ nhánh `phan-biet-nguoi-noi` với `AI_TRANSLATOR_DEV_SPEAKER=true` và
`AI_TRANSLATOR_DEV_PRO=true`. Thử bằng tự động hóa (cây Trợ năng `AXPress`/đọc `AXFrame`, một số cú bấm và phím thật có kiểm phần tử dưới
điểm bấm thuộc đúng tiến trình bản dev), **loa máy tắt tiếng suốt buổi** (app vẫn thu "Âm thanh máy" qua tap hệ thống khi tắt tiếng).
Ảnh chụp theo cửa sổ của app và các file xuất ở `$DATA/out/03/` (ngoài repo). Âm thanh thử: đoạn họp AMI nhiều người (tiếng Anh).

## Dữ liệu của app đã cài không bị đụng

Bản debug dùng file DB riêng `data-dev.db` và mục khóa `db-key-dev` (Task 0b). Trước và sau mỗi lần chạy: sao lưu `data.db` của app đã cài và so
từng byte: **không đổi** ở cả hai lần chạy (`cmp`); không có `data.db.unreadable-*` mới.

## Kết quả (lần chạy 1)

| Mục | Kết quả |
|---|---|
| Thu âm thanh máy khi tắt tiếng | Đạt |
| 1. Cài đặt › Phụ đề có nhóm "Người nói", hai công tắc bật sẵn, dòng "Quyền Trợ năng" (macOS) | Đạt |
| 2. Thanh phụ đề: "Người 1–4" có màu ở dòng đầu mỗi lượt, vạch màu mọi câu; độ trễ tổng p50 512 / p90 730 ms (53 câu) so với mốc cũ chưa có nhận giọng p50 512 / p90 829 ms | Đạt, không chậm đi |
| 3. Đổi tên "Người 2" → "Minh": cả hai cửa sổ đổi dưới 0,4 s | Đạt |
| 4. Gộp "Người 3" vào "Minh": cùng tên, cùng màu | Đạt |
| 5. Tắt "Phân biệt người nói" giữa phiên: nhãn và vạch mất ngay ở cả hai cửa sổ; log có "nhận giọng: người dùng tắt, dừng worker của phiên"; tên người nói không có trong mọi log | Đạt |
| 6. Phiên mới: nhãn đánh lại từ "Người 1" | Đạt |
| 7. Lịch sử hiện tên đã đổi, chip chỉ đọc; TXT `[hh:mm:ss] Minh: …`, Markdown `**Minh:** …`; SRT có tên chỉ khi tích "Thêm tên người nói" | Đạt |
| 8. Đổi giao diện sang English giữa phiên: "Người N" → "Speaker N", tên "Minh" giữ nguyên | Đạt |
| 9a–c. Bấm lại nhãn đóng menu; Esc đóng và trả focus về nhãn; menu dòng cuối cuộn rồi bấm nhãn dòng khác: sang ngay ở cú bấm đầu | Đạt |
| 9d. Menu nhãn ở dòng gần đáy cửa sổ | **Không đạt**: mở xuống và bị cắt ở đáy (xem dưới) |
| Danh sách "Chọn người trong cuộc họp"; bộ gõ Nhật/Trung/Hàn | Không kiểm được (cần dữ liệu từ kế hoạch 04; không có bộ gõ) |

Worker: sẵn sàng sau 200–201 ms, nhúng trung bình 141–146 ms (khi máy rảnh), RSS khoảng 50 MB, không cảnh báo hay lỗi trong log, không chạy lại.

## Lỗi tìm được và đã sửa (lần chạy 2)

Menu nhãn luôn mở xuống; `scrollIntoView({block:"nearest"})` (cách sửa đầu) chỉ chạy lúc mở, không xử lý bước bung danh sách "Gộp vào người khác ▸", và `nearest` đặt đáy menu sát mép không chừa lề, nên viền và bóng như bị cắt;
bản thử bằng Chrome không đầu không lộ ra vì `check-i18n` chưa kiểm bước bung. **Cách sửa:** menu tự đo chỗ trống (`menuPlacement`) và lật lên phía trên nhãn khi dưới không đủ chỗ; cuộn dự phòng đặt `scrollTop` của khung `main.content`;
chặn cú bấm đúp ở mục Gộp. Lần chạy 2 trên app thật: menu lật lên ở dòng gần đáy và dòng cuối, bung danh sách vẫn nằm trọn khung, một lần gộp có chủ ý bằng một cú bấm đúng mục, dòng đầu/giữa vẫn mở xuống, hồi quy 9a–c đạt.

## Điều ghi nhận

- Câu đầu của phiên không có nhãn khi quá ngắn (dưới 0,5 s thì không nhúng và chưa có giọng trước để kế thừa): theo thiết kế.
- Clip 4 người (EN2002a) ra 6 giọng: hai giọng thừa mỗi giọng chỉ 1 câu (Minh 19, Người 4 14, Người 5 8, Người 3 7, hai giọng 1 câu). Clip IS1009a ra đúng 4 giọng. Phù hợp số đo ở spike (EN2002a là bản ghi khó nhất); manh mối để chỉnh sau: chặn mở giọng mới từ một đoạn đơn lẻ.
- Phiên tắt công tắc giữa chừng được lưu vào Lịch sử không có nhãn: theo thiết kế ("hết phiên thì xóa").
- Lần chạy 2, nhãn muộn nhiều hơn lần 1 (23 nhãn, 11 muộn; 31 nhãn, 6 muộn so với 0–2 muộn) và nhúng trung bình 278 ms (lần 1 khoảng 140 ms): máy đang bận việc khác; **đo lại khi máy rảnh** (kế hoạch 07, nghiệm thu A-spk4/6).
- Sau khi Dừng phiên, nhãn ở Bản chép lời thành chữ tĩnh (không mở menu được, giống Lịch sử): theo thiết kế (đổi tên, gộp chỉ khi phiên đang chạy, QĐ 10 của kế hoạch 03).
- Trong lúc thử, loa bị bật lại (âm lượng 6/100) bởi người ngoài tiến trình thử, khoảng 25 s tiếng họp phát ra loa trước khi dừng; sau đó mọi lệnh phát bị chặn theo giá trị tắt tiếng và canh mỗi 0,3 s.
