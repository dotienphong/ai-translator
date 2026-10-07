# S2: thu âm thanh hệ thống bằng WASAPI loopback (Windows), mới làm một phần

Ngày 2026-10-06. Kế hoạch: `docs/superpowers/plans/2026-09-29-phase-0-04-s1-s2-thu-am.md`, Task 7–8.

## Máy và công cụ

- Lenovo 21HE (i5-1345U, RAM 32 GB), Windows 11 Pro 10.0.26300.
- Thiết bị phát mặc định: `Speakers (Realtek(R) Audio)`, định dạng trộn 48 000 Hz, 2 kênh. Không có tai nghe Bluetooth nào đang kết nối.
- `capture.exe` build release từ `crates/audio-capture` (rustc 1.98.1, MSVC 14.51). `cargo test -p audio-capture`: 18 test và 14 test (`edge`) đạt.

## Phạm vi đã làm

Chỉ các dòng **không cần app họp**: 1, 2, 3, và phần "một lần" của dòng 4. Nguồn phát là giọng đọc tổng hợp của Windows (SAPI, `System.Speech`, âm lượng 35) thay cho YouTube, vì tự động hóa được và không cần người điều khiển. Mỗi lượt thu 30 giây, `--role console`. Kết quả dưới đây chỉ là số đo (RMS từng giây, đếm khung, độ dài file); **chưa nghe lại bằng tai** các file WAV (`target\s2-row*.wav`).

| # | Tình huống | `--role` | Kết quả | Đạt |
|---|---|---|---|---|
| 1 | Loa máy phát giọng đọc | `console` | Giây 3–29 có tiếng, RMS từ 0,020 đến 0,108 (ngưỡng 0,0005). Giây 1–2 im lặng vì chờ khởi động giọng đọc. File 29,97 giây. 0 mẫu rơi, 0 khung bỏ. Chèn 118 056 khung im lặng (≈ 2,5 giây, khớp 2 giây im lặng đầu) | Đạt |
| 2 | Không phát gì 30 giây | `console` | Cả 29 giây đều `(im lặng)`. Chèn 1 439 353 khung im lặng, bằng 99,95% của 30 × 48 000. File 29,97 giây. 0 mẫu rơi | Đạt |
| 3 | Phát 9 giây, dừng 10 giây, phát lại 8 giây | `console` | Có tiếng ở giây 2–11, im lặng giây 12–22 (11 giây), có tiếng lại từ giây 23. Chèn 578 221 khung im lặng (≈ 12,05 giây, khớp 12 giây im lặng đếm được). File 29,95 giây. 0 mẫu rơi | Đạt về số đo; chưa nghe để kiểm tiếng sau đoạn dừng có lệch thời gian không |
| 4 | Teams, thiết bị mặc định | `both` | **Chỉ kiểm được dòng thông báo**: `Console và Communications là cùng một thiết bị, chỉ thu một lần` (máy chỉ có một thiết bị phát). Chưa thử với Teams | Một phần |

Dòng 2 và 3 xác nhận cơ chế chèn im lặng theo QPC của `GapFiller` (§6.1): khi loopback không trả gói nào, file vẫn dài đúng thời gian thật.

## Chưa làm (cần app họp hoặc thiết bị)

| # | Tình huống | Cần |
|---|---|---|
| 4 | Teams, thiết bị mặc định, nghe rõ giọng máy thứ hai | Teams và một máy thứ hai |
| 5 | Teams với tai nghe Bluetooth, micro bật (HFP), `--role both` | Tai nghe Bluetooth |
| 6 | Như dòng 5 nhưng chỉ `console` (xem có mất tiếng không) | Tai nghe Bluetooth |
| 7 | Zoom với tai nghe Bluetooth | Zoom, tai nghe Bluetooth |
| 8 | Google Meet trên Chrome rồi Edge, tai nghe có dây | Meet, tai nghe có dây |
| 8a | Zalo PC, tai nghe Bluetooth | Zalo PC, tai nghe Bluetooth |
| 9 | Rút tai nghe giữa chừng | Tai nghe |
| 10 | Windows 10 | Máy Windows 10 |

## Ghi chú của chủ dự án (2026-10-07)

Chủ dự án báo đã thử Teams, Zoom, Meet, Zalo và tai nghe Bluetooth **trên máy MacBook** và đạt. Đó là bài của macOS (S1, Core Audio tap, đã ghi ở `s1_capture.md`), **không phải** WASAPI loopback trên Windows, nên không thay được dòng 4–10 của S2 và không đổi trạng thái của giả định 2 trên Windows. Các dòng 4–10 vẫn chưa có số đo trên Windows.

## Kết luận cho giả định 2

**Vẫn chưa kiểm.** Phần cơ chế (loopback `console`, chèn im lặng, không rơi mẫu) chạy đúng trên Windows 11. Phần cốt lõi của giả định (thu được Teams, Zoom, Meet, kể cả thiết bị Communications và tai nghe Bluetooth ở chế độ đàm thoại) cần các dòng 4–9. Mục này vẫn là **chặn phát hành**.
