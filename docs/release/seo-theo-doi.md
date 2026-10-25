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
| YouTube Live (Chrome, macOS) | | | | | | |
| TikTok LIVE trên web (Chrome, macOS) | | | | | | |
| Facebook Live (Chrome, macOS), không bắt buộc | | | | | | |
| Windows (bất kỳ nền tảng nào ở trên), không bắt buộc | | | | | | |
