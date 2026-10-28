# Tiến trình con và quyền Trợ năng trên bản ký ad-hoc (macOS)

Kế hoạch 01, Task 11. Câu hỏi của spec `2026-10-26-phan-biet-nguoi-noi-design.md` mục 6.2: `speaker-worker` là tiến trình con
nằm trong gói `.app` (như `asr-worker`, `llama-server`). Nếu nó đọc tên người qua Accessibility thì có hưởng quyền Trợ năng
mà chủ dự án đã cấp cho app cha không, và quyền đó còn sau khi app được cập nhật (ký lại) không?

## Điều kiện

- macOS 26.6.2 (Darwin 25.6.0), Apple Silicon (M4 Pro). Ngày 2026-10-26.
- Công cụ: `tcc-probe/` (`parent.swift`, `child.swift`, `make-app.sh`). `TccProbe.app` (bundle id `com.aitranslator.tccprobe`)
  ký ad-hoc kèm hardened runtime (`flags=0x10002(adhoc,runtime)`, không có Team ID), giống bản phát hành của app. Cha chạy
  `AXIsProcessTrusted()`, rồi chạy con (`Contents/MacOS/tcc-child`, ký riêng, trong cùng gói) bằng `Process`; con cũng gọi
  `AXIsProcessTrusted()` và đọc thật danh sách cửa sổ của Finder qua Accessibility. App chạy bằng `open -W`.
- Quyền cấp bằng System Settings › Privacy & Security › Accessibility (chạm Touch ID một lần).

## Kết quả

| Lượt | Hoàn cảnh | Cha `AXIsProcessTrusted` | Con `AXIsProcessTrusted` | Con đọc cửa sổ Finder |
|---|---|---|---|---|
| 1 | Chưa cấp quyền | false | false | mã -25211 (`kAXErrorAPIDisabled`), không đọc được |
| 2 | Đã bật công tắc cho `TccProbe` | **true** | **true** | mã 0, thấy 2 cửa sổ |
| 3 | Dựng lại và ký lại y hệt nguồn (cdhash không đổi) | true | true | mã 0, thấy 2 cửa sổ |
| 4 | Dựng lại sau khi đổi một dòng mã (cdhash đổi, như một lần cập nhật) | **false** | **false** | mã -25211, không đọc được |

Ghi chú về lượt 3 và 4: kế hoạch dự kiến lượt "ký lại" cho cả hai `false`, nhưng dựng lại cùng một nguồn ra cùng một cdhash
(bản dựng tái lập được) nên quyền còn. Chỉ khi nội dung nhị phân đổi (lượt 4, cdhash đổi từ `b0ad0a21…` sang `8be59646…`)
quyền mới mất. Lượt 4 chạy từ một bản sao ngoài repo để không đụng vào các file đã lưu.

## Kết luận cho spec

1. **Tiến trình con trong gói `.app` hưởng quyền Trợ năng của app cha** (lượt 2): giả định ở §6.2 đúng; **không cần phương án
   dự phòng** ở §14 (đọc tên trong tiến trình chính). `speaker-worker` cùng gói với app, chạy bằng `Process` như
   `asr-worker`, đọc tên bằng Accessibility được ngay khi chủ dự án đã cấp quyền cho AI Translator.
2. **Quyền vẫn mất sau mỗi bản cập nhật có mã nhị phân đổi** (lượt 4), giống lỗi Gõ dịch đã gặp (cdhash ký ad-hoc đổi mỗi
   bản; xem ghi chú phát hành 0.1.14). Cả cha lẫn con cùng mất. App đã có nút tự `tccutil reset` rồi mời cấp lại; phần
   "Người nói" nên dùng chung cơ chế và thông điệp đó (dòng mời cấp quyền trên thanh phụ đề), không tạo luồng riêng. Đây
   cũng là lý do công thức đọc tên tải từ xa (lớp 3 ở §6.6) có giá trị: sửa bộ đọc mà không phát hành app thì quyền không mất.
3. Quan sát thêm: ngay sau lượt 1 (chỉ gọi `AXIsProcessTrusted()` không kèm `prompt`), `TccProbe` đã tự xuất hiện trong danh
   sách Accessibility với công tắc tắt; chủ dự án chỉ cần bật công tắc, không phải bấm "+" rồi chọn file. Điều này giữ
   nguyên cho app thật nếu nó gọi `AXIsProcessTrusted` ít nhất một lần; cần kiểm lại với app AI Translator khi làm
   kế hoạch có giao diện mời cấp quyền (spec §6.2).
4. Giới hạn của phép thử: chỉ một máy, một bản macOS; con là tiến trình Swift nhỏ chạy bằng `Process`, chưa phải
   `speaker-worker` thật (Rust, hardened runtime, cùng cách spawn của app); đã đủ để trả lời câu hỏi về thừa kế quyền, nhưng
   khi kế hoạch 04 (bộ đọc tên trong worker) xong nên thử lại một lần với binary thật.

## Dọn

Đã `tccutil reset Accessibility com.aitranslator.tccprobe`, xóa `TccProbe.app` và log thử. Còn trong repo: mã nguồn và
`make-app.sh` của `tcc-probe/` (`TccProbe.app` nằm trong `.gitignore`).
