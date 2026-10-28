# Thử thật trên macOS: quyền Trợ năng với `speaker-worker` thật (kế hoạch 04b, Task 19)

Ngày 2026-10-28, macOS (M4 Pro), bản debug `AI Translator Dev` dựng từ nhánh `phan-biet-nguoi-noi` (giao thức 3, `speaker-worker` bản release
`minos 14.2`), `AI_TRANSLATOR_DEV_SPEAKER=true`. Teams đang chạy, cuộc họp "Meet now" một mình do chủ dự án mở. Loa máy tắt tiếng suốt buổi.
Thử bằng tự động hóa (cây Trợ năng chỉ đọc, ảnh chụp cửa sổ của app) và log của app; thao tác cấp quyền (cần Touch ID) do chủ dự án làm.
`data.db` của app đã cài không đổi byte (bản dev dùng `data-dev.db`). Không có tên người trong log, ảnh và file này.

## Kết quả

| Mục | Kết quả |
|---|---|
| Chưa có quyền: dòng mời hiện sau khi bấm Bắt đầu dịch | **Đạt**: khoảng 0,5–1 s (kỳ vọng ≤ 3 s); chữ "Cho phép quyền Trợ năng để hiện tên người nói", nút "Mở cài đặt" và nút ẩn tới hết phiên |
| Khóa thanh phụ đề thì dòng mời ẩn, mở khóa thì hiện lại | **Đạt** |
| "Mở cài đặt" mở Cài đặt › Phụ đề, cuộn tới nhóm Người nói; nút ẩn có tác dụng tới hết phiên, phiên mới hiện lại | **Đạt** |
| Cài đặt › Người nói trước khi cấp quyền ghi "Chưa cấp" | **Đạt** |
| System Settings › Accessibility: dòng "AI Translator" | Đã có sẵn một dòng đang bật (của app đã cài), bản dev vẫn báo "Chưa cấp" vì chữ ký khác |
| Sau khi cấp quyền: Cài đặt › Người nói ghi "Đã cấp (dùng chung với Gõ dịch)", dòng mời mất | **Đạt** |
| Log: `giao thức phiên bản 3`; `đọc tên: NoPermission` rồi `NoNames (Teams, công thức 1, tự học 0)` | **Đạt** (họp một mình nên không có người khác, `NoNames` là đúng; `Ok` cần khách, Task 20) |
| Lượt đọc thật trên Teams (60 s): đầy đủ p50 5,1 ms, p90 7,3 ms; nhanh p50 0,1–2,2 ms, p90 3,3–3,8 ms; lệnh đọc p90 12 | **Đạt** ngân sách 30 ms ở p90; một lượt đầy đủ 128,7 ms (lượt đầu), lượt sau tối đa 10,4 ms |
| `speaker-worker` khi đọc: CPU 0,0%, RSS 12 MB (41 MB sau một phút) | Ghi nhận |
| Chế độ trợ năng của Teams (`AXEnhancedUserInterface`) khi đang đọc: `1`; file dấu `speaker-eui-dev.json` có | **Đạt** |
| Giết cùng lúc app dev và worker bằng một lệnh `kill -9`: Teams vẫn `1`, file dấu còn (chưa ai trả) | **Đạt** (đúng như thiết kế) |
| Mở lại app dev (không bấm Bắt đầu dịch): file dấu mất, Teams về `0`, log "trả chế độ trợ năng cho 1 app còn sót từ lần chạy trước" | **Đạt về hành vi**; thời gian 8,0 s kể từ lúc tiến trình app xuất hiện (kế hoạch kỳ vọng ≤ 2 s). Mã gọi `restore` ngay trong `setup` ở một luồng riêng, không có chờ chủ ý; 8 s là độ trễ khởi động của app (mở DB, kiểm tiến trình phụ) |

## Không đo được hoặc chưa thử

- **Thời gian dòng mời mất sau cú bật quyền, và "không cần khởi động lại ngay trong phiên"**: quyền được cấp giữa hai phiên dịch
  (kết thúc 08:19:33, bắt đầu 08:19:35), nên không quan sát được trong cùng một phiên. Cần cấp quyền ngay lúc một phiên đang chạy.
- **Trạng thái `Ok`** (có tên và có chỉ báo "đang nói"): cần khách thật trong họp (Task 20).
- **Bước thử thêm của kế hoạch (tắt quyền Trợ năng rồi mở lại app, file dấu phải còn nguyên và Teams vẫn `1`)**: chưa thử với quyền thật
  (cần tắt công tắc bằng Touch ID lần nữa); mã `restore` tự kiểm quyền trước khi trả và có test.
- **Nút "Mở cài đặt Trợ năng" của bản dev chạy `tccutil reset` theo bundle id** (log "đã xóa dòng quyền Trợ năng cũ"): xóa quyền của cả app đã
  cài (Gõ dịch), đúng cảnh báo của kế hoạch. Sau thử, cấp lại quyền cho app đã cài nếu báo mất.
- **Công thức tải từ xa**: lúc mở app log ghi "chưa tải được (HTTP 404)" vì chưa đăng công thức nào lên R2; app dùng công thức số 1 có sẵn
  (đúng thiết kế "hỏng thì vẫn chạy"). Cần kiểm lại sau khi đăng công thức lần đầu (kế hoạch 06, Task 18).
- Một máy, một bản macOS, một bản Teams; Windows chưa thử.

## Kết luận cho spec

- §6.2, §6.7: tiến trình con `speaker-worker` hưởng quyền Trợ năng của app cha (đọc được cửa sổ họp Teams ngay sau khi app có quyền, không cần
  cấp riêng cho worker); dòng mời hiện khi chưa có quyền và mất khi đã cấp.
- §6.8: chế độ trợ năng của Teams được app bật khi đọc và trả khi kết thúc; nếu app bị giết, lần mở sau trả lại (file dấu); bản dev và bản cài
  dùng file dấu riêng.
- Ngân sách đọc 30 ms: đạt ở p90 trên Teams khi họp một mình; chi phí khi có nhiều người tham dự đo ở Task 20.
