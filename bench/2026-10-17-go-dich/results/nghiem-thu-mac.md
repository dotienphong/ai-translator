# Nghiệm thu Gõ dịch trên Mac (spec 2026-10-17-go-dich §8.2)

**Ngày:** 2026-10-18 (00:00–00:30 giờ Việt Nam: TextEdit, Chrome, GD2, GD3, GD5, GD6; 05:30–06:10: Notes, Safari, Slack, Teams, Telegram, lỗi mở lại ô; 06:15–06:57: GD5 qua proxy và A7, S3)
**Máy:** MacBook Pro Apple M4 Pro, macOS 26.6.2
**Bản:** nhánh `go-dich`; bản dev chạy bằng `scripts/run-dev-app.sh` (chứng thư "AI Translator Dev") build từ commit `dd73706` cộng bản sửa ô gõ (`b118ff1`). Phần Rust của kế hoạch 04 (hai lệnh quyền Trợ năng của cửa sổ chính) chưa có trong bản đang chạy lúc đo; không ảnh hưởng đường dịch và dán. Các lượt buổi sáng chạy bản dev dựng lại từ `1bb0758` (có đủ kế hoạch 04); lượt thử lại lỗi mở lại ô chạy cùng bản đó với giao diện đã sửa nạp lại qua Vite
**Model:** gói Chuẩn (model nhận dạng và dịch của gói đang cài trên máy)
**Cách đo:** Claude chạy tự động trên máy của chủ dự án với sự ủy quyền (giả lập phím bằng System Events, đọc nội dung ô nhận bằng AppleScript hay Chrome DevTools Protocol). Ngoài TextEdit và trang thử ở Chrome, đã thử thêm Notes, Safari (trang thử), Slack, Teams và Telegram, **chỉ ở chat riêng của chính tài khoản đang đăng nhập** ("Phong (you)", "Phong Do Tien (You)", "Saved Messages"): Claude không dán vào kênh hay nhóm nào, không bấm Enter ở app chat, xóa bản nháp sau mỗi lượt. Các app còn lại (cần tài khoản hay cuộc họp, hay không có trên máy) vẫn là "chưa thử"

| # | Tiêu chí | Kết quả | Ghi chú |
|---|---|---|---|
| GD1 | Luồng chính ở 11 nơi | **Một phần**: đạt ở TextEdit, Chrome (trang thử), Notes, Safari (trang thử), Slack, Teams, Telegram; **chưa thử** ở Messenger, Gmail, Discord, Zalo, Zoom, Meet | Xem bảng GD1, GD4 |
| GD2 | p50 thời gian dịch ≤ 1,0 giây (20 câu) | **Đạt**: p50 **176,5 ms**, p90 202 ms | 20/20 câu dán đúng |
| GD3 | Trễ thêm của phụ đề khi vừa họp vừa gõ (không có ngưỡng) | (ghi nhận) **+32 ms** (tổng p50 320 → 352 ms), p90 352 → 384 ms | 30 tin Gõ dịch trong 5 phút, 0 lỗi |
| GD4 | ⌃⌥G không làm app nào tự làm việc riêng | **Một phần**: không có tác dụng phụ ở TextEdit, Chrome (trang thử), Notes, Safari (trang thử), Slack, Teams, Telegram; chưa thử ở các app còn lại | |
| GD5 | Không request mạng nào do Gõ dịch | **Đạt**: `nettop` (không luồng ngoài nào), proxy cho TLS đi thẳng (0 kết nối), và A7 đầy đủ (`netaudit.py`: `A7: ĐẠT`, 2 request ra ngoài, 0 trong lúc dịch, 17 từ mồi không thấy ở đâu) trong một phiên dịch có 21 lượt Gõ dịch | Xem mục GD5 |
| GD6 | Log không chứa chữ đã gõ hay bản dịch | **Đạt**: 0 file chứa | Xem mục GD6 |

## GD1, GD4 — luồng chính và phím tắt ở từng nơi

"Đạt" ở dòng TextEdit và Chrome nghĩa là: ⌃⌥G mở ô soạn (app có đúng 1 cửa sổ), app chat vẫn ở phía trước, Enter dán đúng bản dịch vào ô nhận (bằng đúng clipboard) và đóng ô soạn, **không phím Enter nào lọt vào ô chat** (không có tin nào bị gửi), ⌃⌥G không làm việc riêng nào của app đó. Chi tiết số lượt ở `spike.md` mục S2 (36/36 lượt đạt, sau khi sửa lỗi hộp gợi ý chữ nuốt Enter).

| Nơi | Mở ô (⌃⌥G) | Gõ Telex đúng | Enter dán đúng ô, không gửi | Enter lần 2 gửi | GD4: ⌃⌥G không gây việc khác | Ghi chú |
|---|---|---|---|---|---|---|
| Messenger web, Chrome | chưa thử | | | | | cần tài khoản |
| Gmail (soạn thư), Chrome | chưa thử | | | | | cần tài khoản |
| Trang chat trên Safari | đạt (trang thử qua máy chủ cục bộ) | tiếng Anh (gõ giả lập) | đạt | không áp dụng | đạt | chưa thử trang chat thật |
| Slack | đạt | tiếng Anh (gõ giả lập) | đạt, vào ô nhập của chat riêng, chưa gửi | chưa bấm | đạt | 1 lượt, đã xóa bản nháp |
| Discord | chưa thử | | | | | không có trên máy |
| Teams | đạt | tiếng Anh (gõ giả lập) | đạt, vào ô nhập của chat riêng, chưa gửi | chưa bấm | đạt | 2 lượt dán (một lượt gặp lỗi mở lại ô, xem dưới), đã xóa bản nháp |
| Zalo PC | chưa thử | | | | | không có trên máy |
| Telegram | đạt | tiếng Anh (gõ giả lập) | đạt, vào ô nhập của Saved Messages, chưa gửi | chưa bấm | đạt | 1 lượt, đã xóa bản nháp; Claude mở Telegram cho lượt này rồi đóng lại |
| iMessage hoặc Notes | đạt (Notes) | tiếng Anh (gõ giả lập) | đạt | không áp dụng | đạt | ghi chú tạm, đã xóa; chưa thử iMessage |
| Zoom, khung chat | chưa thử | | | | | cần một cuộc họp |
| Google Meet, khung chat | chưa thử | | | | | cần một cuộc họp |
| TextEdit (thêm) | đạt | tiếng Anh (gõ giả lập) | đạt | không áp dụng | đạt | 12 lượt, thêm 3 lượt toàn màn hình và tin hai dòng |
| Chrome, ô `contenteditable` và `textarea` trên trang thử (thêm) | đạt | tiếng Anh (gõ giả lập) | đạt, 0 Enter lọt vào ô chat | không áp dụng | đạt | 17 lượt, thêm 3 lượt toàn màn hình |

Gõ Telex và bộ gõ tiếng Nhật ở ô soạn do chủ dự án thử tay (spike S1: đạt). Các lượt tự động gõ **câu tiếng Anh**: `keystroke` của System Events làm hỏng dấu tiếng Việt khi giả lập phím (ô soạn nhận "Ngay mai tai sa gai bao cao cho anh" thay cho "Ngày mai tôi sẽ gửi báo cáo cho anh", bản dịch sai theo), đó là lỗi của cách thử, không phải của app; tiếng Việt có dấu đã đo ở GD2 (dán bằng đường khác) và do chủ dự án gõ tay ở S1.

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
- **Proxy cho TLS đi thẳng** (2026-10-18 06:15–06:24, không cần chứng chỉ hay `sudo`): `mitmdump --mode regular@8088 --ignore-hosts '.*'` (ghi mỗi kết nối, không giải mã), bản dev mở với `HTTPS_PROXY`/`HTTP_PROXY` trỏ vào đó (`reqwest` của app dùng `system-proxy`; `NO_PROXY` cho `127.0.0.1` nên các tiến trình phụ vẫn nói chuyện cục bộ; đã xác nhận biến có trong môi trường tiến trình app). Bằng chứng proxy thấy lưu lượng của app (điều kiện của A7): mở màn hình Nâng cấp thì app kết nối `api.aitranslator.vn:443` lúc 06:16:57. Cửa sổ dùng Gõ dịch 06:22:20–06:23:40 (21 lượt dịch-và-dán ở TextEdit, 20/20 dán đúng, p50 184 ms): **0 kết nối** qua proxy. Cả 06:17:20–06:21:22 (ô soạn mở đóng nhiều lần, không dịch) cũng 0. Log nguyên bản: `gd5-proxy.log` (9 dòng, chỉ có kết nối; kết nối `example.com` lúc 06:15:43 là lần `curl` tự thử proxy, không phải của app). Giới hạn: chỉ thấy đích và thời điểm, không thấy nội dung (nên không kiểm chữ mồi) và chỉ thấy lưu lượng tôn trọng proxy; phần còn lại do `nettop` ở trên lo.
- **A7 đầy đủ** (2026-10-18 06:51–06:56, chủ dự án cài rồi gỡ chứng chỉ mitmproxy bằng `sudo`): `mitmdump --mode local:meeting-translator,asr-worker,llama-server --set hardump=…` bắt lưu lượng của app và hai tiến trình phụ trên **bản dev**. Trình tự: Kiểm tra ngay (06:52:56) → Bắt đầu phiên (06:53:12) với âm thanh mẫu `public/listen-test-en.wav` phát lặp → 21 lượt dịch-và-dán Gõ dịch ngay trong phiên (06:53:31–06:54:50; 20/20 dán đúng, p50 166 ms) → Dừng (06:55:47; 26 đoạn, 26 câu dịch, 0 lỗi) → Kiểm tra ngay (06:56:01). `netaudit.py` (cửa sổ phiên 06:53:12–06:55:48): **`A7: ĐẠT`**, request ra ngoài 2 (cả hai `POST /v1/licenses/validate`, một trước và một sau phiên), trong lúc dịch 0, không vi phạm. 17 từ mồi (các câu tiếng Việt đã gõ, bản dịch tiếng Anh đã dán và câu của âm thanh mẫu) không có trong URL hay thân request nào. Log của app và thư mục dữ liệu không chứa chữ đã gõ hay bản dịch (0 file). Kết quả: `gd5-a7.json` (không có HAR, đã xóa). Giới hạn: bản **dev** và phiên dịch ngắn (2,5 phút, không phải 15 phút của A7 chính thức); chế độ local không bắt WebView (đã có `nettop` ở trên).
- Về mã: Gõ dịch không có đường nào gọi mạng; luật bản quyền của nó không gọi server (`compose_never_calls_the_server`).

## GD6 — log

Câu có chữ mồi (`RIENGTU-GD6`) dùng ở ô soạn, rồi tìm chữ mồi, hai câu gốc tiếng Việt, một câu dịch và bản dịch của câu mồi ("I only want RIENGTU-GD6") trong: log của app, thư mục dữ liệu (`Application Support`), `Caches`, `WebKit`, `Saved Application State`: **0 file chứa**. Log có 128 dòng số liệu `Gõ dịch:` (số ký tự, số dòng, ms, kết quả), không có chữ.

## Lỗi tìm thấy khi nghiệm thu

- **Hộp gợi ý chữ của macOS nuốt phím Enter đầu** (tìm thấy ở spike S2, đã sửa ở `b118ff1`; có điều kiện kiểm ở `check-i18n.mjs`). Xem `spike.md`.
- **Mở lại ô soạn khi còn bản nháp thì chữ mới chèn trước bản nháp** (tìm thấy khi thử ở Teams, 2026-10-18; đã sửa, có điều kiện kiểm `compose-reopen`). Xem `spike.md`.
- Dịch tiếng Việt **không dấu** cho bản dịch kém ("Mai minh gui bao cao nhe" ra "May manh gai bao cao nha"): hạn chế đã biết của nhận diện nguồn theo chữ viết (spec §9), không phải lỗi mới.

## Windows

Chưa thử: chờ máy Windows (spec §8.2: chạy lại GD1, GD4, GD5, GD6).

## Còn lại cần chủ dự án

1. GD1 và GD4 ở các app chat còn lại (bảng trên: Messenger, Gmail, Zoom, Meet, và Zalo, Discord nếu có). Chỉ cần ⌃⌥G, gõ một câu, Enter, xem bản dịch vào đúng ô mà chưa gửi, rồi Esc hay xóa; Enter lần hai của app chat để gửi hay không tùy anh.
2. (Tùy chọn) xóa mục S3Probe khỏi danh sách Trợ năng bằng nút − (công tắc đã tắt; app thăm dò đã xóa). Spike S3 đã làm, xem `spike.md`.
