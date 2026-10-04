# S1: thu âm thanh hệ thống trên macOS bằng Core Audio process tap

> Ma trận S1 trên Mac (kế hoạch 0-04, Task 6), chạy ngày 2026-10-04.

- Máy: Mac, macOS 26.6.2 (yêu cầu tối thiểu 14.2)
- Công cụ: `target/Capture.app` build bằng `crates/audio-capture/macos/make-app.sh`
  - ký ad-hoc, `flags=0x10002(adhoc,runtime)`, không có entitlement nào (kể cả sandbox)
  - `Info.plist` có `NSAudioCaptureUsageDescription`, `LSMinimumSystemVersion` 14.2
- Không build lại giữa các dòng (build lại đổi cdhash, macOS hỏi quyền lại)

## Kết quả

| # | Tình huống | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | Lần đầu chạy, bấm Cho phép, đang phát YouTube | Đạt | 29/29 giây có tiếng (RMS thấp nhất 0,0027), WAV 29,968 giây 16 kHz mono, 47.915 khung/giây so với 48.000 Hz, 0 khung bỏ, 0 mẫu rơi, 0 lượt IO bị từ chối. Hộp thoại đúng câu trong `Info.plist`, WAV nghe rõ, đúng tốc độ |
| 2 | Từ chối quyền (sau `tccutil reset`) | Đạt | App không crash. 29/29 giây im lặng, WAV 29,989 giây toàn 0. `TCC.db`: `auth_value=0`, `auth_reason=2` (người dùng từ chối). Từ chối **không trả lỗi**: `start()` vẫn thành công, nguồn vẫn báo 48000 Hz 2 kênh, 0 lượt IO bị từ chối, dữ liệu toàn số 0. MVP (§9) chỉ phát hiện thiếu quyền bằng cách thấy im lặng kéo dài khi biết có app đang phát |
| 3 | Zoom (app), tap toàn hệ thống | Đạt | Nghe rõ giọng người nói ở máy thứ hai (người chạy xác nhận, chưa lưu log) |
| 4 | Google Meet trên Chrome | Đạt | Nghe rõ giọng người nói ở máy thứ hai (người chạy xác nhận, chưa lưu log) |
| 5 | Google Meet trên Safari | Đạt | Nghe rõ giọng người nói ở máy thứ hai (người chạy xác nhận, chưa lưu log) |
| 6 | Microsoft Teams (app mới) | Đạt | Nghe rõ giọng người nói ở máy thứ hai (người chạy xác nhận, chưa lưu log) |
| 6a | Google Meet trên Edge | Đạt | Nghe rõ giọng người nói ở máy thứ hai (người chạy xác nhận, chưa lưu log) |
| 6b | Cuộc gọi Zalo PC | Đạt | Nghe rõ giọng người nói ở máy thứ hai (người chạy xác nhận, chưa lưu log) |
| 7 | Chỉ tap Zoom (`--pid`), YouTube đang phát ở Chrome | Đạt | WAV chỉ có tiếng Zoom, không lẫn YouTube (người chạy xác nhận, chưa lưu log) |
| 8 | Tai nghe có dây, rồi AirPods | Đạt | Thu được với cả hai thiết bị phát, WAV đúng tốc độ (người chạy xác nhận, chưa lưu log) |
| 9 | Đổi thiết bị phát giữa chừng (loa → tai nghe) | Bỏ qua | Người chạy không ghi lại kết quả quan sát. MVP phải tự xử lý: phát hiện đổi thiết bị phát và khởi tạo lại tap (§6.1), rồi kiểm lại ở Giai đoạn 1 |
| 10 | Ký Developer ID | Bỏ qua | Chưa có tài khoản Apple Developer. Mới kiểm với chữ ký ad-hoc kèm hardened runtime; chữ ký Developer ID cần kiểm lại trước khi phát hành (kế hoạch 1-07a) |

## Ghi chú chung

- `tccd` ghi một dòng lỗi: `Prompting policy for hardened runtime; service: kTCCServiceMicrophone requires entitlement com.apple.security.device.audio-input but it is missing`. Dòng này nói về dịch vụ Microphone, không phải AudioCapture. Hộp thoại AudioCapture vẫn hiện và quyền vẫn cấp được (dòng 1), nên hardened runtime không chặn việc thu bằng tap. Không cần thêm entitlement `audio-input`.
- `open --stdout` ghi nối tiếp vào log. Xóa log trước mỗi lần chạy (`: > target/s1.log; : > target/s1.err`).

## Kết luận cho giả định 1 (§14)

**Đạt, kèm hai điều chưa kiểm.**

- Core Audio process tap thu được âm thanh Zoom, Google Meet (Chrome, Safari, Edge), Microsoft Teams và Zalo PC trên macOS 26.6.2, với app ký ad-hoc kèm hardened runtime và không có entitlement nào (không sandbox). Quyền `NSAudioCaptureUsageDescription` hoạt động: hộp thoại hiện đúng câu trong `Info.plist`, và sau khi cho phép thì thu được tiếng.
- Tap theo tiến trình (`--pid`) tách được tiếng Zoom khỏi YouTube. Tai nghe có dây và AirPods đều thu được, WAV đúng tốc độ.
- Chỉ dòng 1 và 2 có số đo lưu lại. Dòng 3–8 chỉ có xác nhận của người chạy bằng tai.
- Từ chối quyền không báo lỗi, chỉ cho dữ liệu toàn số 0. MVP (§9) phát hiện thiếu quyền bằng im lặng kéo dài khi biết có app đang phát.
- **Chưa kiểm:** (1) đổi thiết bị phát giữa chừng (dòng 9); (2) chữ ký Developer ID (dòng 10). Cả hai chuyển sang Giai đoạn 1.
