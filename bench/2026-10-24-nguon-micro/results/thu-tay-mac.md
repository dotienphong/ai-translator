# Thử tay chế độ micro trên Mac (2026-10-24)

Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-02-che-do-micro.md`, Task 17. Nhánh `nguon-micro`, HEAD 3067d921.

## Điều kiện

- MacBook Pro M4 Pro, macOS 26.6.2, micro và loa tích hợp.
- Bản dev đóng gói bằng `scripts/run-dev-app.sh`, ký chứng thư "Apple Development". Công tắc Pro của bản dev bật (`.env` của
  worktree), nên không trừ phút của key thật.
- Chủ dự án ủy quyền cho Claude điều khiển: chuột ảo (`cliclick`), chụp màn hình, phát tiếng qua loa.
- "Người nói" là giọng tiếng Việt "Linh" của macOS (`say`), phát qua loa của chính laptop, ở âm lượng 75%, 40% và 60%.
  Tiếng gõ phím là 60 giây trích từ bản thu cảnh 6 của spike, phát qua loa.
- **Hạn chế:** không có người nói thật. Loa và micro nằm trong cùng một máy, nên mức tiếng và độ vang khác hẳn người nói cách
  1 m.

## Kết quả theo bước

| Bước | Kết quả |
|---|---|
| 1. Chọn Micro thì hỏi quyền | **Đạt.** Hộp thoại hiện ngay khi chọn "Microphone", câu hỏi đúng là câu của app. Cho phép xong thì dòng báo thiếu quyền biến mất. |
| 2. Nói ở 1 m, gõ phím (lọc ồn bật) | **Đạt một phần.** Nhãn "Microphone: MacBook Pro Microphone → …" đúng. Phát ở 40%: 4/5 câu đúng hoặc gần đúng. Phát ở 75%: 2/5 câu bị nhận nhầm sang tiếng Anh. 60 giây gõ phím: **0 câu ảo**, VAD không mở đoạn nào. |
| 3. Tắt lọc ồn, câu ngắn | **Không đạt.** 0/5 câu ngắn ("OK", "Đúng rồi", "Cảm ơn", "Được", "Vâng"), cả ở 40% và 60%. Xem phát hiện 2 và 3. |
| 4. Đổi micro mặc định | Không làm: máy không có micro thứ hai. |
| 5. Từ chối quyền | **Đạt khi app vừa mở:** bấm Bắt đầu thì báo ngay "AI Translator is not allowed to use the microphone." kèm nút, không mở micro, không nạp gì thêm. Nút mở đúng trang Privacy & Security › Microphone. Xem phát hiện 4 về trường hợp đổi quyền lúc app đang chạy. |
| 6. Chế độ âm thanh máy | **Đạt.** Câu tiếng Việt phát qua loa ra đúng nguyên văn. |
| 7. Log không có tên micro | **Đạt.** Log ghi "đang thu micro: 48000 Hz, 1 kênh, kết nối builtin, lọc ồn true"; không có "MacBook Pro Microphone". |

## Phát hiện

1. **Khuếch đại cố định +20 dB kèm `tanh` bị bão hòa khi micro đã to.** Từ khoảng 21:07 có tiếng ù tần số thấp vào micro
   suốt thời gian thử: −8 đến −14 dBFS, năng lượng dưới 300 Hz, đỉnh 50–70 Hz (quạt, gió hay rung bàn; lúc spike nền chỉ −46
   đến −50 dBFS).
   - Sau +20 dB, `tanh` bão hòa (RMS 0,71) và nghiền giọng nói trong bản cho whisper ở cả hai chế độ. Cùng một câu: 20:57 ra
     "Doanh thu tháng này đang khoảng 10% so với tháng trước"; 21:07 ra "Do anh vô thân anh 10% so với tiến trường".
   - Phát ở 75%, loa sát micro, cũng làm méo theo cách này.
   - Đặt lọc 80 Hz trước khuếch đại (đúng thứ tự §5.7) chỉ giúp một phần: giọng 300 Hz cạnh tiếng ù 50 Hz ở −10 dBFS được
     +13,9 dB (thứ tự hiện nay: +3,6 dB), trong khi không bão hòa thì phải là +20 dB.
   - Bộ giới hạn mức (vẫn khuếch đại tới +20 dB khi nhỏ, tự hạ hệ số khi đường bao vượt 0,5) giữ kết quả VAD trên hai bản thu
     yên tĩnh của spike: `doc-vi-1m` 1559/4062 khung so với 1545, `s4-1m` 4297/9375 so với 4515. Chưa đo WER.
2. **Tiếng ù này che giọng nói đối với VAD kể cả khi không khuếch đại.** Trên bản thu 12 giây lúc đó, Silero thấy 0/375
   khung khi tắt lọc ồn, 1/375 khi không khuếch đại, và 97/375 khi qua RNNoise. Vì vậy tắt lọc ồn thì không có đoạn nào (bước 3);
   bật lọc ồn thì vẫn dịch được. Công tắc đang làm đúng việc; nhưng ghi chú dưới nó ("tắt nếu phòng yên tĩnh mà câu ngắn hay
   bị mất") ngầm hứa tắt lọc ồn giúp câu ngắn, mà không đúng (phát hiện 3).
3. **Câu một hai chữ đứng riêng bị bỏ ở chế độ micro dù phòng yên tĩnh.** Giọng Linh đọc "OK", "Được", "Vâng" chỉ dài 0,31–0,36
   giây, ngắn hơn `min_speech_ms` 400 của chế độ micro, nên chắc chắn bị bỏ. Ngưỡng này áp cả khi tắt lọc ồn (spec mục 16).
   Spike chỉ đo câu ngắn đứng cạnh câu dài (cảnh 7, bài đọc), chưa đo câu ngắn đứng riêng. ("Đúng rồi", "Cảm ơn" dài hơn 400 ms
   mà cũng mất ở bước 3, nhưng lúc đó có tiếng ù của phát hiện 2, nên chưa kết luận được.)
4. **Đổi quyền micro lúc app đang chạy không có tác dụng tới khi mở lại app.** Sau `tccutil reset` hay bật lại quyền trong System
   Settings, tiến trình đang chạy vẫn đọc trạng thái cũ. macOS cũng tự báo "will not have access to your microphone until it is
   quit" và đề nghị "Quit & Reopen".
   - Khi đó app không tự hỏi được; Core Audio tự hỏi trong lúc `start` (chặn khoảng 10 giây, như spike đo), người dùng từ chối
     thì micro trả số 0 và app báo "Microphone has no signal" kèm nút mở trang quyền. Đường dự phòng này chạy đúng.
   - Cần kiểm: "Quit & Reopen" của macOS có thoát được app không (app bỏ qua ⌘Q và Quit ở Dock).
5. **Nhỏ:**
   - Ở chế độ Micro, thanh trượt "Độ nhạy ngắt câu" bị khóa nhưng vẫn hiện giá trị của người dùng (50 ms), không phải 500 ms
     app đang dùng.
   - Lần bắt đầu phiên đầu tiên sau khi đổi giao diện, câu "Chào mọi người, hôm nay…" bị cắt ở dấu phẩy: "Chào mọi người" thành
     một đoạn ngắn, bị nhận thành tiếng Anh ("I'm").

## Đã xử lý (2026-10-24, theo đề xuất, chủ dự án duyệt)

- Phát hiện 1: bản cho whisper dùng bộ giới hạn mức thay `tanh`, lọc 80 Hz chạy trước khuếch đại; số đo ở `gioi-han-muc.md`.
- Phát hiện 3: tắt lọc ồn thì `min_speech_ms` 250; ghi chú dưới công tắc sửa cho đúng.
- Phát hiện 4: thử lại sau khi sửa. "Quit & Reopen" của System Settings gửi `quit` với lý do `rlgo` (người gửi
  `com.apple.settings.PrivacySecurity.extension`). Lý do này vốn đã được phép thoát, nên app thoát và macOS mở lại app (mở bản
  đã cài vì cùng bundle id). Giao diện giờ nhắc chọn "Thoát & Mở lại" sau khi bật quyền (Cài đặt › Âm thanh, lỗi
  `micPermission` ở màn hình chính).
- Phát hiện 5: thanh trượt ở chế độ Micro khóa và hiện 500 ms. Câu bị cắt ở dấu phẩy chưa xử lý (cần đo thêm, chỉ gặp một
  lần).
