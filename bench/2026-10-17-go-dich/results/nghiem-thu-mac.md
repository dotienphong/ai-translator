# Nghiệm thu Gõ dịch trên Mac (spec 2026-10-17-go-dich §8.2)

**Ngày:** 2026-10-18 (00:00–00:30 giờ Việt Nam)
**Máy:** MacBook Pro Apple M4 Pro, macOS 26.6.2
**Bản:** nhánh `go-dich`; bản dev chạy bằng `scripts/run-dev-app.sh` (chứng thư "AI Translator Dev") build từ commit `dd73706` cộng bản sửa ô gõ (`b118ff1`). Phần Rust của kế hoạch 04 (hai lệnh quyền Trợ năng của cửa sổ chính) chưa có trong bản đang chạy lúc đo; không ảnh hưởng đường dịch và dán
**Model:** gói Chuẩn (model nhận dạng và dịch của gói đang cài trên máy)
**Cách đo:** Claude chạy tự động trên máy của chủ dự án với sự ủy quyền (giả lập phím bằng System Events, đọc nội dung ô nhận bằng AppleScript hay Chrome DevTools Protocol). **Chưa có** lượt thử nào trong app chat thật (cần tài khoản của chủ dự án): các ô GD1, GD4 ở dưới là "chưa thử"

| # | Tiêu chí | Kết quả | Ghi chú |
|---|---|---|---|
| GD1 | Luồng chính ở 11 nơi | **Một phần**: đạt ở TextEdit và Chrome (trang thử); **chưa thử** ở 9 app chat thật | Xem bảng GD1, GD4 |
| GD2 | p50 thời gian dịch ≤ 1,0 giây (20 câu) | **Đạt**: p50 **176,5 ms**, p90 202 ms | 20/20 câu dán đúng |
| GD3 | Trễ thêm của phụ đề khi vừa họp vừa gõ (không có ngưỡng) | (ghi nhận) **+32 ms** (tổng p50 320 → 352 ms), p90 352 → 384 ms | 30 tin Gõ dịch trong 5 phút, 0 lỗi |
| GD4 | ⌃⌥G không làm app nào tự làm việc riêng | **Chưa thử** ở app thật; ở TextEdit và Chrome (trang thử) không có tác dụng phụ | |
| GD5 | Không request mạng nào do Gõ dịch | **Đạt theo `nettop`** (không luồng ngoài nào); **chưa chạy proxy HTTPS** (cần `sudo` cài chứng chỉ) | Xem mục GD5 |
| GD6 | Log không chứa chữ đã gõ hay bản dịch | **Đạt**: 0 file chứa | Xem mục GD6 |

## GD1, GD4 — luồng chính và phím tắt ở từng nơi

"Đạt" ở dòng TextEdit và Chrome nghĩa là: ⌃⌥G mở ô soạn (app có đúng 1 cửa sổ), app chat vẫn ở phía trước, Enter dán đúng bản dịch vào ô nhận (bằng đúng clipboard) và đóng ô soạn, **không phím Enter nào lọt vào ô chat** (không có tin nào bị gửi), ⌃⌥G không làm việc riêng nào của app đó. Chi tiết số lượt ở `spike.md` mục S2 (36/36 lượt đạt, sau khi sửa lỗi hộp gợi ý chữ nuốt Enter).

| Nơi | Mở ô (⌃⌥G) | Gõ Telex đúng | Enter dán đúng ô, không gửi | Enter lần 2 gửi | GD4: ⌃⌥G không gây việc khác | Ghi chú |
|---|---|---|---|---|---|---|
| Messenger web, Chrome | chưa thử | | | | | cần tài khoản |
| Gmail (soạn thư), Chrome | chưa thử | | | | | cần tài khoản |
| Trang chat trên Safari | chưa thử | | | | | |
| Slack | chưa thử | | | | | |
| Discord | chưa thử | | | | | không có trên máy |
| Teams | chưa thử | | | | | |
| Zalo PC | chưa thử | | | | | không có trên máy |
| Telegram | chưa thử | | | | | |
| iMessage hoặc Notes | chưa thử | | | | | |
| Zoom, khung chat | chưa thử | | | | | cần một cuộc họp |
| Google Meet, khung chat | chưa thử | | | | | cần một cuộc họp |
| TextEdit (thêm) | đạt | tiếng Anh (gõ giả lập) | đạt | không áp dụng | đạt | 12 lượt, thêm 3 lượt toàn màn hình và tin hai dòng |
| Chrome, ô `contenteditable` và `textarea` trên trang thử (thêm) | đạt | tiếng Anh (gõ giả lập) | đạt, 0 Enter lọt vào ô chat | không áp dụng | đạt | 17 lượt, thêm 3 lượt toàn màn hình |

Gõ Telex và bộ gõ tiếng Nhật ở ô soạn do chủ dự án thử tay (spike S1: đạt).

## GD2 — thời gian dịch

20 câu chat tiếng Việt có dấu của `bench/2026-10-17-go-dich/gd2-cau.txt` (6–28 từ), mỗi câu dán vào ô soạn bằng ⌘V rồi chờ dịch xong (gõ giả lập làm mất dấu nên không gõ từng chữ), tiến trình phụ đã nạp (một lượt làm nóng không tính), không có phiên phụ đề, đo từ dòng log `Gõ dịch: … ms, đã dịch` (từ lúc luồng dịch nhận yêu cầu tới lúc xong).

- **p50 176,5 ms**, p90 202 ms, nhỏ nhất 108 ms, lớn nhất 270 ms.
- Dãy 20 số (ms, đã sắp): 108 109 116 121 132 150 155 167 169 176 177 178 195 196 198 200 202 202 214 270.
- Dán đúng 20/20 (nội dung ô TextEdit bằng clipboard).
- Lần dịch đầu sau khi tiến trình phụ vừa nạp (làm nóng): 373 ms.

## GD3 — phụ đề khi vừa họp vừa gõ

Hai phiên 5 phút, cùng nguồn: `public/listen-test-en.wav` phát lặp bằng `afplay` (âm lượng hệ thống 6%), nguồn âm thanh của app là toàn hệ thống, bắt đầu và dừng bằng ⌃⌥T. Phiên B: cứ khoảng 10 giây dán một tin trong `gd2-cau.txt` vào ô soạn và Enter (30 tin, không lỗi).

| Phiên | Gõ dịch | Số câu dịch | dịch p50 / p90 (ms) | tổng p50 / p90 (ms) |
|---|---|---|---|---|
| A | không | 53 | 186 / 226 | 320 / 352 |
| B | một tin mỗi khoảng 10 giây | 52 | 187 / 219 | 352 / 384 |

Mức trễ thêm: **+32 ms** ở cả p50 và p90 của "tổng" (độ trễ A2); bước "dịch" gần như không đổi. Không có ngưỡng đạt (spec §8.2). Đây là số của một lượt đo trên một máy, phụ đề tiếng Anh sang tiếng Việt, câu ngắn.

## GD5 — mạng

- **`nettop`** (`-P -x -t external -L 14 -s 5`, 70 giây) trên mọi tiến trình của app (`meeting-translator`, bốn tiến trình WebKit, `asr-worker`, `llama-server`) trong lúc dùng Gõ dịch 12 lần: **chỉ có dòng tiêu đề, không luồng ngoài nào** (như kết quả `nettop` của A7 ngày 2026-10-06).
- **Chưa chạy** proxy HTTPS (`mitmdump` và `netaudit.py` của A7): cần chủ dự án nhập mật khẩu `sudo` để cài chứng chỉ vào System keychain. Làm khi tiện theo `bench/phase1/acceptance/RUNBOOK-mac.md` mục A7 (cửa sổ đo là một phiên có dùng Gõ dịch); các request chạy theo lịch (kiểm bản quyền, cập nhật) vẫn được phép.
- Về mã: Gõ dịch không có đường nào gọi mạng; luật bản quyền của nó không gọi server (`compose_never_calls_the_server`).

## GD6 — log

Câu có chữ mồi (`RIENGTU-GD6`) dùng ở ô soạn, rồi tìm chữ mồi, hai câu gốc tiếng Việt, một câu dịch và bản dịch của câu mồi ("I only want RIENGTU-GD6") trong: log của app, thư mục dữ liệu (`Application Support`), `Caches`, `WebKit`, `Saved Application State`: **0 file chứa**. Log có 128 dòng số liệu `Gõ dịch:` (số ký tự, số dòng, ms, kết quả), không có chữ.

## Lỗi tìm thấy khi nghiệm thu

- **Hộp gợi ý chữ của macOS nuốt phím Enter đầu** (tìm thấy ở spike S2, đã sửa ở `b118ff1`; có điều kiện kiểm ở `check-i18n.mjs`). Xem `spike.md`.
- Dịch tiếng Việt **không dấu** cho bản dịch kém ("Mai minh gui bao cao nhe" ra "May manh gai bao cao nha"): hạn chế đã biết của nhận diện nguồn theo chữ viết (spec §9), không phải lỗi mới.

## Windows

Chưa thử: chờ máy Windows (spec §8.2: chạy lại GD1, GD4, GD5, GD6).

## Còn lại cần chủ dự án

1. GD1 và GD4 ở các app chat thật (bảng trên). Chỉ cần ⌃⌥G, gõ một câu, Enter, xem bản dịch vào đúng ô mà chưa gửi, rồi Esc hay xóa; Enter lần hai của app chat để gửi hay không tùy anh.
2. Spike S3 (`spike.md`).
3. GD5 bằng proxy HTTPS (cần `sudo`).
