# Theo dõi SEO: dịch livestream, dịch live, dịch thời gian thực

Spec: `docs/superpowers/specs/2026-10-25-seo-livestream-tu-khoa-design.md`. Website không có analytics (lời hứa quyền riêng tư), nên đo bằng Search Console, Bing Webmaster Tools và bảng kiểm tay dưới đây.

## 1. Việc ngoài mã (chủ dự án)

- [ ] Xác minh `aitranslator.vn` trên Google Search Console (bản ghi DNS TXT) và gửi `https://aitranslator.vn/sitemap.xml`.
- [ ] Xác minh trên Bing Webmaster Tools (có thể nhập từ Search Console) và gửi sitemap.
- [ ] Sau khi deploy: "Kiểm tra URL" rồi "Yêu cầu lập chỉ mục" cho: `/`, `/en/`, `/giai-phap/dich-livestream/`, `/giai-phap/dich-live-tiktok/`, `/en/solutions/livestream-translation/`, `/en/solutions/online-meeting-translation/`.
- [ ] Backlink trung thực (Product Hunt, README GitHub của repo, danh bạ công cụ AI, nhóm cộng đồng Việt về livestream, bán hàng xuyên biên giới và dịch thuật).

## 2. Cách kiểm tay thứ hạng

Cửa sổ ẩn danh, đăng xuất tài khoản, `hl=vi` cho cụm tiếng Việt và `hl=en` cho cụm tiếng Anh, vị trí tính theo trang kết quả đầu (không quảng cáo). Ghi vị trí của `aitranslator.vn` (hoặc "không thấy trong 50 kết quả đầu"). Mốc: tuần 0 (ngay trước deploy), 2, 4, 8, 12 sau deploy.

| Cụm | Trang đích | Tuần 0 | Tuần 2 | Tuần 4 | Tuần 8 | Tuần 12 |
|---|---|---|---|---|---|---|
| dịch livestream ra tiếng việt | `/giai-phap/dich-livestream/` | | | | | |
| dịch livestream trực tiếp | `/giai-phap/dich-livestream/` | | | | | |
| dịch livestream | `/giai-phap/dich-livestream/` | | | | | |
| dịch live trực tiếp | `/giai-phap/dich-livestream/` | | | | | |
| dịch live | `/giai-phap/dich-livestream/` | | | | | |
| dịch live tiktok | `/giai-phap/dich-live-tiktok/` | | | | | |
| live video translator | `/en/solutions/livestream-translation/` | | | | | |
| real time translator | `/en/` | | | | | |
| real-time translation | `/en/` | | | | | |
| real time translation | `/en/solutions/livestream-translation/` | | | | | |
| realtime translation | `/en/solutions/livestream-translation/` | | | | | |
| ai meeting translator | `/en/solutions/online-meeting-translation/` | | | | | |
| real-time translator for meetings | `/en/solutions/online-meeting-translation/` | | | | | |
| live meeting translation | `/en/solutions/online-meeting-translation/` | | | | | |
| video translator | `/en/solutions/webinar-and-video-translation/` | | | | | |
| ai translator | `/en/` | | | | | |
| ai live translator | `/en/` | | | | | |

Kỳ vọng (không phải cam kết): sáu cụm tiếng Việt về livestream có thể vào top 10 sau 4–8 tuần kể từ khi được lập chỉ mục; ba cụm tiếng Anh về họp top 30 nếu có backlink; các cụm tiếng Anh chung (`real time translation`, `ai translator`, `video translator`…) chưa đặt mục tiêu.

## 3. V1: thử app với livestream thật

Mục đích: biết có được nói "đã thử với YouTube Live, TikTok LIVE" trên website không (spec mục 7). Máy Mac của chủ dự án, app bản mới nhất, Chrome. Ghi trung thực; không đạt thì không ghi "đã thử".

Cách thử cho mỗi nền tảng: mở livestream tiếng nước ngoài trong Chrome trên máy tính; trong AI Translator đặt Dịch sang = tiếng Việt, bấm Bắt đầu; xem ít nhất 2 phút; sau đó thử Cài đặt › Âm thanh nguồn "Chỉ Google Chrome" (làm mới danh sách khi live đang phát).

| Nền tảng | Ngày | App (phiên bản) | Phụ đề hiện? | Độ trễ cảm nhận | Nguồn "Chỉ Chrome" chạy? | Nhận xét |
|---|---|---|---|---|---|---|
| YouTube Live (Chrome, macOS) | 2026-10-25 | 0.3.0 | Có, suốt buổi | Theo kịp lời nói (ảnh chụp cách 12 giây, không bấm giờ được bằng mắt). Log app: tổng p50 512 ms, p90 829 ms (nguồn gốc); p50 496 ms, p90 931 ms (Chỉ Chrome) | Có: phụ đề hiện bình thường suốt ~1 phút 20 giây | Đạt. Bản dịch nhìn chung khớp lời (ví dụ "Parts of Hebron are basically occupied by the military" → "Một số khu vực ở Hebron hiện đang nằm dưới sự kiểm soát của quân đội"); vài lỗi nhỏ ("shooting" → "vụ nổ"). 0 lỗi, không câu rỗng |
| TikTok LIVE trên web (Chrome, macOS) | 2026-10-25 | 0.3.0 | Có, nhưng chỉ thử được buổi live tiếng Việt có nhạc nền | Log app: tổng p50 400 ms, p90 448 ms | Không thử | Chưa đạt tiêu chí: không tìm được buổi live tiếng nước ngoài (kết quả đều thuộc vùng Việt Nam). App thu được tiếng (17 đoạn), nhưng nhạc và lời tiếng Việt bị nhận nhầm thành tiếng Anh/Trung ("She can't talk tonight" lặp nhiều lần, vài câu tiếng Trung ảo) nên bản dịch vô nghĩa |
| Facebook Live (Chrome, macOS), không bắt buộc | | | | | | Không thực hiện |
| Windows (bất kỳ nền tảng nào ở trên), không bắt buộc | | | | | | Không thực hiện |

Điều kiện thử (2026-10-25, 22:01–22:12 giờ Việt Nam): AI Translator 0.3.0 (gói 6 Months), macOS 26.6.2, Apple M4 Pro, âm lượng hệ thống 63, loa trong của máy (không tai nghe). Dịch sang Tiếng Việt, ngôn ngữ nguồn Tự nhận diện, đủ năm ngôn ngữ nói. YouTube: kênh Al Jazeera English (`/@aljazeeraenglish/live`), tin thời sự tiếng Anh, xem khoảng 2 phút 45 giây với nguồn gốc của máy ("Âm thanh máy + Micro", nguồn "Toàn hệ thống, trừ app này"; log ghi chỉ số "micro bị hạ" 0,98), rồi khoảng 1 phút 20 giây với "Âm thanh máy" + "Chỉ Google Chrome" (bỏ micro để chắc phụ đề không đến từ micro nghe loa). Trước buổi live có một quảng cáo khoảng 30 giây; chỉ bắt đầu dịch khi live đã phát. TikTok: `tiktok.com/live` mở và phát được ngay, nhưng hồ sơ Chrome của chủ dự án có vẻ đã đăng nhập TikTok sẵn, nên chưa biết khách chưa đăng nhập có xem được không; tìm "english news", "just chatting usa" trong mục LIVE chỉ ra buổi live tiếng Việt; đã thử buổi live của JML (tiếng Việt, có nhạc nền) khoảng 1 phút với nguồn gốc. Độ trễ trong log là thời gian app xử lý tính từ lúc cắt xong một đoạn nói (gồm nhận dạng và dịch), chưa gồm thời gian chờ người nói dừng câu. Trục trặc: (1) thanh phụ đề đang hiện thì che các ô trong Cài đặt › Âm thanh, phải ẩn trước khi đổi nguồn; (2) sau khi rời trang Cài đặt rồi quay lại, ô nguồn ghi "Chỉ com.google.Chrome" (mã ứng dụng) thay cho "Chỉ Google Chrome"; (3) với nhạc nền, app nhận nhầm ngôn ngữ và lặp một câu nhiều lần. Không có hộp thoại xin quyền nào của macOS. Cài đặt đã trả về như cũ sau khi thử.
