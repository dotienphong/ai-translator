# S-M4 trên macOS: quyền micro và nguồn micro (2026-10-24)

Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-01-spike.md`, Task 8. Spec: §3.4, §6.4.

**Điều kiện:**
- Máy và hệ điều hành: MacBook Pro M4 Pro, macOS 26.6.2.
- Công cụ: `target/MicProbe.app`, dựng bằng `crates/audio-capture/macos/make-app.sh mic-probe`:
  - bundle id `dev.meetingtranslator.micprobe`;
  - ký ad-hoc với hardened runtime và entitlement `com.apple.security.device.audio-input` (giống app thật);
  - có `NSMicrophoneUsageDescription`.
- Cách chạy: qua `open -W … --args <lệnh>`, nên quyền tính cho app này, không tính cho Terminal.
- Micro: "MacBook Pro Microphone" (tích hợp, mặc định).

## 1. Trạng thái ban đầu

`status`: `Undetermined`. App chưa từng hỏi quyền.

## 2. Xin quyền qua AVFoundation

`request`: hộp thoại xin quyền Micro **có hiện**. Chủ dự án bấm Cho phép. Kết quả: `trả lời: cho phép`, `quyền micro: Granted`.

## 3. Nghe

`listen`:
- Micro báo **48000 Hz, 1 kênh**. Mở mất 130 ms ở lần đầu, 80 ms ở các lần sau.
- **Mức nền của phòng khi không ai nói:** khoảng −50 dBFS (−48,7 đến −51,9).
- **Giọng nói cách máy khoảng 50 cm:** −38 đến −22 dBFS.
- Không rơi mẫu nào, không lượt IO nào bị từ chối, `failed = false`.
- Lần mở đầu tiên, giây thứ nhất có 10,9% mẫu bằng 0 (thiết bị đang khởi động). Từ các lần sau thì 0%.

## 4. Bị từ chối thì sao

Tắt MicProbe ở Privacy & Security › Microphone:
- `status`: `Denied`.
- `listen --seconds 8` (chủ dự án nói liên tục): **`start` vẫn thành công**, micro vẫn báo 48000 Hz 1 kênh, vẫn nhận đủ khung (384512 khung trong 8 giây), nhưng **100% mẫu bằng 0 tuyệt đối** (−180 dBFS). Không có lỗi, `failed = false`.

Hành vi này giống tap âm thanh hệ thống khi bị từ chối (S1).

## 5. Ký lại, giả lập một bản cập nhật

Bật lại quyền, `status` báo `Granted`. Thêm `CFBundleVersion` vào `Info.plist` rồi ký lại ad-hoc: CDHash đổi từ `a25f8fce…` thành `20daeb02…`. Sau đó `status` báo **`Undetermined`**: quyền đã mất, macOS sẽ hỏi lại.

## 6. Mở micro mà chưa xin quyền trước

Ở trạng thái `Undetermined`, chạy thẳng `listen`, không gọi `request`:
- **Core Audio tự hiện hộp thoại xin quyền.**
- **`start` bị chặn suốt lúc hộp thoại đang mở.** Lần này 4355 ms, tính tới lúc chủ dự án bấm Cho phép. Sau đó mới trả về và chạy bình thường.
- Sau đó `status` báo `Granted`.

## 7. Dùng chung với app họp

Chưa làm. Chủ dự án hẹn làm sau.

## 8. AirPods

Chưa làm. Chủ dự án hẹn làm sau.

## Kết luận cho kế hoạch 02

1. **Phát hiện thiếu quyền:**
   - Không dựa vào lỗi: macOS không báo lỗi gì, chỉ trả số 0.
   - Đọc `AVCaptureDevice` (`mic_permission()`): kết quả đáng tin, báo đúng cả ba trạng thái.
   - Trong phiên, thêm bộ canh "toàn số 0 tuyệt đối" (spec §5.6). Micro thật luôn có tiếng ồn nền khoảng −50 dBFS, nên số 0 tuyệt đối là dấu hiệu chắc chắn của việc bị chặn, hoặc micro bị tắt tiếng bằng phím cứng.
2. **Gọi `request` trước khi `start`:** có, và nên làm ở nơi không chặn giao diện:
   - lúc người dùng chọn chế độ có micro;
   - lúc bắt đầu phiên nếu trạng thái là `Undetermined`.
   - Nếu để Core Audio tự hỏi thì `start` chặn luồng thu (4,3 giây ở lần đo này). Luồng "capture" của app chạy riêng nên không treo giao diện, nhưng `ClockFiller` sẽ phải chèn im lặng suốt thời gian đó.
3. **Cập nhật app làm mất quyền:** có. Mỗi lần CDHash đổi (mỗi bản ký ad-hoc) thì quyền Micro về `Undetermined`. Đúng như spec §3.4 đã tính: chỉ người dùng chế độ có micro mới bị hỏi lại. Hết khi có Developer ID.
4. **Mức âm lượng micro:** giọng nói gần ở −38 đến −22 dBFS, nền ở −50 dBFS. Đây là căn cứ ban đầu cho ngưỡng; spike đo thêm ở 1 m và 3 m (Task 16).
