# A7 lần hai: báo cáo lỗi tự động (macOS, 2026-10-17)

**Kết quả: A7 ĐẠT** (`a7-mac-reports.json`: `external: 3`, `in_session: 1`, không vi phạm). Chứng minh: trong lúc dịch app không gửi báo cáo lỗi dù có một báo cáo đang xếp hàng trên đĩa; báo cáo chỉ đi tới `api.aitranslator.vn` sau khi phiên dừng; thân báo cáo không có chữ chép lời hay dữ liệu cá nhân. Quy trình: `bench/phase1/acceptance/RUNBOOK-mac.md`, mục "A7 lần hai".

- **Bản đo:** bản release ký ad-hoc, không notarize, số phiên bản `0.1.10`, dựng từ `main` ở commit `24786a7` bằng `AI_TRANSLATOR_MAC_SIGNING=adhoc scripts/release/package-macos.sh` (CDHash `6d3331b5147d62b01462199dfd2bc1cbf6aece4f`), cài vào `/Applications`. Chuỗi công tắc dev không có trong file. MacBook Pro M4 Pro, macOS 26.6.2. Gói đang dùng: `six_months`.
- **Cài đặt khi đo:** file cài đặt của người dùng đã cài từ trước (bản 1, `onboardingDone`) được migrate lên bản 2 và `sendErrorReports` thành `true` mà không hỏi, đúng thiết kế.
- **Proxy:** `mitmdump 12.2.3 --mode local:meeting-translator,asr-worker,llama-server --set hardump=…`; chứng chỉ gốc mitmproxy được tin cậy ở System keychain **chỉ trong lúc đo** (gỡ sau đó, xem dưới). Đo song song bằng `nettop` (130 mẫu, mỗi 5 giây, 7 tiến trình).
- **Phiên dịch:** bắt đầu 09:21:02, dừng 09:33:33 (+07:00), bằng phím tắt `Ctrl+Alt+T`; tải là `public/listen-test-en.wav` lặp lại; 125 đoạn, 124 câu dịch, 1 lỗi (do cố ý giết `llama-server`).
- **Cách gây báo cáo:** 09:26:05 (phút thứ 5) `pkill -9 -x llama-server`; app tự khởi động lại tiến trình, 09:26:09 xếp hàng báo cáo `R-F39T-40RH` (`sidecar_died`), có tệp trong `reports/pending`.

| Kiểm tra | Kết quả |
|---|---|
| Request ra ngoài (HAR) | 3, đều tới máy chủ trong danh sách cho phép: `GET releases.aitranslator.vn/stable/latest.json` 09:20:54 (trước Bắt đầu); `POST api.aitranslator.vn/v1/licenses/validate` 09:21:02 (lúc Bắt đầu); `POST api.aitranslator.vn/v1/diagnostics` 09:33:34 (sau Dừng) trả `202` |
| Trong lúc dịch | 1: `validate` lúc bắt đầu (việc theo lịch, `during_session: true`) |
| Báo cáo trong lúc dịch | **0 request** `/v1/diagnostics` từ 09:26:09 (lúc xếp hàng) tới 09:33:33 (7 phút 24 giây); tệp vẫn nằm trong `reports/pending` suốt thời gian đó |
| Báo cáo sau khi dừng | Gửi **1 giây** sau khi phiên kết thúc (09:33:33 → 09:33:34); server ghi `received_at` 09:33:34 (+07:00), `occurred_at` 09:26:08 |
| Thân báo cáo | 49.799 byte (trần 64 KB); `kind: sidecar_died`, `code: llama`, `build: release`; không chứa `dtphong`, `/Users/`, `@`, `Bearer`, `Authorization`; đường dẫn thư mục cá nhân đã thành `~`; `device_id_hash` là 64 ký tự hex |
| Từ mồi (`plotting analysis`, `public website`, `kết quả phân tích`) | 0 trong HAR (thân và URL), 0 trong log cục bộ của app |
| Vi phạm | Không |
| `nettop` (130 mẫu, 7 tiến trình) | Chỉ `meeting-translator` có một kết nối cũ: `bytes_in` không đổi (3040) cả 130 mẫu, `bytes_out` tăng 31 byte một lần ở khoảng giây thứ 80 (không có request nào trong HAR lúc đó); `asr-worker`, `llama-server` và 4 tiến trình WebKit **không có dòng dữ liệu nào** (không luồng ngoài nào) |

## Giới hạn

- Chế độ `local:` của mitmproxy không bắt WebView và chỉ ghi luồng HTTP; phần đó được bù bằng `nettop`, như các lượt trước.
- Một máy, một bản dựng ký ad-hoc, một lần đo (12 phút 31 giây). **Windows chưa đo.**
- Từ mồi lấy từ lượt đo ngày 06/10 cho cùng file âm thanh mẫu; lượt này không xuất lại bản chép lời để xác nhận các cụm đó có trong bản dịch của phiên.
- `nettop` chạy 130 mẫu (khoảng 10 phút 50 giây từ 09:21:19) nên không phủ 1 phút cuối của phiên; phần đó được HAR phủ.
- Chứng chỉ gốc của mitmproxy phải được gỡ khỏi System keychain sau khi đo: `sudo security delete-certificate -c mitmproxy -t /Library/Keychains/System.keychain`, rồi kiểm `security find-certificate -c mitmproxy /Library/Keychains/System.keychain` báo không tìm thấy.
- Báo cáo thật `R-F39T-40RH` đã được xóa khỏi production sau khi đo (`error_reports` về 0).
