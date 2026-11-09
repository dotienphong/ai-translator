# Kế hoạch thiết kế: SEO & GEO cho Dịch meeting, Dịch cuộc họp, Dịch trực tuyến, Dịch YouTube, Dịch livestream, Dịch phụ đề cuộc họp

- Ngày: 2026-11-09
- Phạm vi: `website/` (5 ngôn ngữ: vi, en, ja, zh, ko).
- Mục tiêu: Tối ưu thứ hạng tìm kiếm trên Google (SEO) và tối ưu trích dẫn trên các công cụ tìm kiếm AI như ChatGPT Search, Perplexity, Gemini, Microsoft Copilot (GEO - Generative Engine Optimization).

---

## 1. Bối cảnh & Ý định tìm kiếm (Search Intent)

Chủ dự án yêu cầu nâng cao thứ hạng cho 6 cụm từ khóa tiếng Việt cốt lõi:
1. **Dịch meeting**: Từ khóa kết hợp Anh - Việt rất phổ biến của giới văn phòng, IT, doanh nghiệp làm việc từ xa (Zoom, Teams, Google Meet).
2. **Dịch cuộc họp**: Truy vấn tiếng Việt chuẩn cho nhu cầu hội họp trực tuyến với đối tác nước ngoài.
3. **Dịch trực tuyến**: Nhu cầu dịch theo thời gian thực (real-time) hoặc dịch trong các buổi họp/hội thảo trực tuyến.
4. **Dịch youtube**: Nhu cầu rất lớn từ người học trực tuyến, người xem video khoa học, công nghệ, tin tức và theo dõi YouTube Live không có phụ đề tiếng Việt sẵn.
5. **Dịch Livestream**: Đã có trang riêng, cần tối ưu liên kết nội bộ và snippet trích dẫn cho AI.
6. **Dịch phụ đề cuộc họp**: Ý định tìm kiếm công cụ hiển thị phụ đề dịch trực tiếp (floating subtitle bar) khi họp.

---

## 2. Mục tiêu, Non-goals & Anti-goals

### Mục tiêu (Goals)
1. **Tạo trang đích chuyên biệt cho YouTube**:
   - `solutions-youtube`: `/giai-phap/dich-youtube/` (bản tiếng Việt) và đối xứng 4 ngôn ngữ (`/en/solutions/youtube-translation/`, `/ja/...`, `/zh/...`, `/ko/...`).
   - Nhắm trúng 100% intent của cụm **"Dịch youtube"** và **"YouTube translation"**.
2. **Nâng cấp trang họp trực tuyến (`solutions-meetings`)**:
   - Sửa tiêu đề, H1, H2, đoạn mở đầu để bao quát tự nhiên: **Dịch meeting**, **Dịch cuộc họp**, **Dịch phụ đề cuộc họp**, **Dịch trực tuyến**.
3. **Tối ưu trang chủ (`home.mjs`) & trang giải pháp tổng (`solutions.mjs`)**:
   - Cập nhật thẻ bài viết, bảng so sánh và các câu FAQ đón đầu các câu hỏi người dùng hay hỏi Google & ChatGPT.
4. **Tối ưu hóa GEO cho AI ChatGPT / Perplexity / Copilot**:
   - Khối mở đầu (Hero lead) được viết theo cấu trúc định nghĩa thực thể rõ ràng (Entity Definition: Sản phẩm là gì - Hoạt động thế nào - Dữ liệu ở đâu - Giới hạn).
   - Schema JSON-LD `FAQPage` với các câu hỏi - trả lời trực diện.
   - Cập nhật tri thức AI trong `llms.txt`, `llms-full.txt`, `llms-full.vi.txt`.
5. **Đảm bảo chất lượng bằng kiểm thử tự động**:
   - Thêm các quy tắc kiểm tra 6 cụm từ khóa vào `website/test/seo-targets.test.mjs`.
   - Toàn bộ test suite website (bao gồm `site.test.mjs` và `seo-targets.test.mjs`) phải vượt qua 100%.

### Non-goals
- Không can thiệp vào mã nguồn ứng dụng desktop Tauri/Rust hay backend Cloudflare Worker.
- Không thêm tracker, cookie banner hay script bên ngoài vi phạm chính sách bảo mật (giữ nguyên CSP nghiêm ngặt).
- Không cam kết top 1 Google ngay lập tức vì SEO còn phụ thuộc tín hiệu tên miền và backlink; mục tiêu kỹ thuật là hoàn thiện On-page và GEO tối đa.

### Anti-goals
- Không nhồi nhét từ khóa (keyword stuffing) vô nghĩa làm giảm trải nghiệm đọc và vi phạm nguyên tắc E-E-A-T của Google / AI.
- Không nói sai sự thật về tính năng: App dịch âm thanh phát trên máy tính cho người xem, KHÔNG tải video YouTube về xử lý, KHÔNG lồng tiếng (dubbing), KHÔNG chạy trên điện thoại di động.

---

## 3. Các hướng tiếp cận (Approaches)

- **Cách 1: Chỉ sửa nội dung trên các trang hiện có (nhét YouTube vào trang Webinar & Video)**
  - *Ưu điểm*: Không cần tạo file trang mới.
  - *Nhược điểm*: Phân tán từ khóa, URL `/giai-phap/dich-webinar-va-video/` không chứa slug `dich-youtube`, rất khó cạnh tranh thứ hạng cao với từ khóa có lượng tìm kiếm lớn như "Dịch youtube".
- **Cách 2: Tạo trang đích chuyên biệt cho YouTube + Nâng cấp toàn diện trang Meeting & GEO (Được chọn)**
  - *Ưu điểm*: Mỗi trang đích giải quyết chính xác 1 nhóm nhu cầu người dùng, URL chuẩn SEO (`/giai-phap/dich-youtube/`), dễ dàng được Google và AI trích dẫn làm nguồn chuyên sâu. Đồng bộ đa ngôn ngữ và có kiểm thử tự động bảo vệ.
  - *Nhược điểm*: Cần tạo trang đối xứng cho các ngôn ngữ (vi, en, ja, zh, ko) để giữ tính nhất quán của hệ thống đa ngữ.

---

## 4. Chi tiết thiết kế kỹ thuật

### 4.1. Trang đích mới: `solutions-youtube`
- **Đường dẫn**:
  - `vi`: `/giai-phap/dich-youtube/`
  - `en`: `/en/solutions/youtube-translation/`
  - `ja`: `/ja/solutions/youtube-translation/`
  - `zh`: `/zh/solutions/youtube-translation/`
  - `ko`: `/ko/solutions/youtube-translation/`
- **Tiêu đề (vi)** (gốc 47 ký tự + ` | AI Translator` = 63 <= 70): `Dịch YouTube ra tiếng Việt: phụ đề video & live`
- **Mô tả (vi)** (154 ký tự <= 165): `Dịch video và livestream YouTube sang tiếng Việt trực tiếp trên máy tính. Phụ đề nổi, AI chạy offline, không cần tiện ích mở rộng. Dùng thử Free 10 ngày.`
- **Tiêu đề (en)**: `YouTube translation: live subtitles for video & streams`
- **Mô tả (en)**: `Translate YouTube videos and live streams with real-time subtitles on your computer. On-device AI, no browser extensions needed. Free 10-day trial.`
- **H1 (vi)**: `Dịch YouTube ra tiếng Việt bằng phụ đề trực tiếp`
- **H1 (en)**: `Live translated subtitles for YouTube videos and streams`
- **Phân định phạm vi để tránh xung đột (Cannibalization)**:
  - `solutions-youtube`: Chuyên biệt về hệ sinh thái YouTube (video bài giảng, tin tức quốc tế, podcast, phỏng vấn, YouTube Live).
  - `solutions-webinar`: Tập trung vào khóa học (Coursera, Udemy) và nền tảng hội thảo (Zoom Webinar, Teams Live Event).
  - `solutions-livestream`: Tổng thể cho phát trực tiếp đa nền tảng (Twitch, TikTok, YouTube Live). Liên kết chéo qua lại bằng linkCard và đoạn văn tự nhiên.
- **Nội dung chính**:
  1. *Hero*: Định nghĩa rõ ràng: AI Translator nghe âm thanh video/livestream YouTube đang phát trên trình duyệt và dịch thành phụ đề tiếng Việt nổi trên màn hình.
  2. *Facts*: Dùng với trình duyệt máy tính (Chrome, Edge, Safari, Firefox), độ trễ 0,76–1,03s (Mac M4 Pro), 5 ngôn ngữ, chạy offline.
  3. *Tình huống sử dụng*: Xem video bài giảng, khóa học, video công nghệ/lập trình, tin tức quốc tế, YouTube Live stream.
  4. *Khác biệt với phụ đề tự động của YouTube*: Hoạt động ngay cả khi video chưa có phụ đề của người tải lên; dịch cả livestream trực tiếp; thanh phụ đề nổi di chuyển tự do; hiển thị song ngữ câu gốc + bản dịch.
  5. *Giới hạn trung thực (NEEDS)*: Bắt buộc nêu rõ: không chạy trên điện thoại di động; không tải file video; không gắn phụ đề cứng vào video; không lồng tiếng giọng đọc vào video; số đo độ trễ 0,76–1,03 giây trên Mac M4 Pro.
  6. *FAQ Schema*: 5 câu hỏi sát truy vấn tìm kiếm thực tế:
     - "Dịch video YouTube sang tiếng Việt bằng cách nào?"
     - "AI Translator có dịch được YouTube Live (trực tiếp) không?"
     - "Có dùng được trên ứng dụng YouTube điện thoại không?"
     - "Có cần cài tiện ích (extension) vào trình duyệt không?"
     - "Dịch YouTube bằng AI Translator có miễn phí không?"

### 4.2. Nâng cấp trang `solutions-meetings`
- **Đường dẫn**: `/giai-phap/dich-hop-truc-tuyen/` (giữ nguyên URL để không gãy liên kết).
- **Tiêu đề (vi)** (50 ký tự + ` | AI Translator` = 66 <= 70): `Dịch meeting, dịch cuộc họp trực tuyến Zoom, Teams`
- **Mô tả (vi)** (153 ký tự <= 165): `Dịch meeting và cuộc họp trực tuyến Zoom, Teams, Meet, Zalo: phụ đề dịch trực tiếp, AI chạy offline trên máy tính, không cần bot. Dùng thử Free 10 ngày.`
- **H1 (vi)**: `Dịch meeting và cuộc họp trực tuyến bằng phụ đề trực tiếp`
- **Thân trang & H2**:
  - Tích hợp tự nhiên các cụm: *"Dịch meeting"*, *"Dịch cuộc họp"*, *"Dịch trực tuyến"*, *"Dịch phụ đề cuộc họp"*.
  - Nhấn mạnh tính năng "Dịch phụ đề cuộc họp không cần bot, tôn trọng quyền riêng tư".

### 4.3. Cập nhật trang chủ (`home.mjs`) & trang giải pháp tổng hợp (`solutions.mjs`)
- `home.mjs`:
  - Thêm thẻ/cụm từ liên kết đến trang YouTube.
  - Tối ưu câu hỏi FAQ thứ nhất trong bộ 6 câu: "Làm sao dịch meeting và cuộc họp Zoom, Teams, Meet sang tiếng Việt mà không cần bot?" (giữ nguyên cấu trúc 6 câu hỏi ở cả 5 ngôn ngữ, đồng bộ `i18n-content.test.mjs`).
- `solutions.mjs`:
  - Thêm card liên kết đến `/giai-phap/dich-youtube/`.
  - Cập nhật bảng "Chọn nhanh": Thêm dòng cho "Video và livestream YouTube".

### 4.4. Hệ thống điều hướng & Đồ họa
- `website/src/site.mjs`:
  - Thêm mục "Dịch YouTube" vào `NAV.vi`, `NAV.en`, `NAV.ja`, `NAV.zh`, `NAV.ko` dưới menu Giải pháp.
  - Thêm liên kết vào `FOOTER` của cả 5 ngôn ngữ.
  - Thêm `"solutions-youtube": "solutions"` vào bảng ánh xạ `OG_GROUP`.
- `website/src/content/index.mjs`:
  - Đăng ký ID `"solutions-youtube"` vào danh sách `IDS` và `FILE`.

### 4.5. Tối ưu GEO (AI ChatGPT / Perplexity / Claude)
- **`website/dist/llms.txt` & `website/src/build/llms.mjs`**:
  - Đưa `solutions-youtube` vào danh mục giải pháp.
  - Bổ sung tóm tắt nêu rõ khả năng: dịch meeting Zoom/Teams/Meet, dịch cuộc họp không cần bot, dịch phụ đề cuộc họp thời gian thực, dịch video và livestream YouTube trực tiếp.

### 4.6. Kiểm thử tự động (`seo-targets.test.mjs`)
- Mở rộng mảng `REQUESTED` và `SEO_TARGETS`:
  * `"dịch meeting"` (vi) → `solutions-meetings` (title, h1, body)
  * `"dịch cuộc họp"` (vi) → `solutions-meetings` (title, h1, body)
  * `"dịch phụ đề cuộc họp"` (vi) → `solutions-meetings` (body, h2)
  * `"dịch trực tuyến"` (vi) → `solutions-meetings` (title, body)
  * `"dịch youtube"` (vi) → `solutions-youtube` (title, h1, body)
  * `"youtube translation"` (en) → `solutions-youtube` (title, h1, body)
- Thêm kiểm tra giới hạn bắt buộc (NEEDS) cho `solutions-youtube`:
  * vi: `["không chạy trên điện thoại", "không tải video", "không lồng tiếng", "0,76–1,03 giây", "Mac M4 Pro"]`
  * en: `["not on phones", "does not download videos", "no dubbing", "0.76–1.03 seconds", "Mac M4 Pro"]`
- Đảm bảo toàn bộ test suite (`node --test website/test/seo-targets.test.mjs` và `website/test/site.test.mjs`) pass 100%.

---

## 5. Những điểm dành cho người triển khai (Builder Call)
- Bản ngữ tiếng Anh (`en`), Nhật (`ja`), Trung (`zh`), Hàn (`ko`) của trang `solutions-youtube` sẽ được dịch chuẩn xác, tự nhiên theo đúng phong cách kỹ thuật và thuật ngữ đã dùng ở các trang giải pháp khác.
- Đảm bảo thẻ Canonical, Hreflang và Open Graph của trang mới đồng bộ hoàn toàn với kiến trúc hiện có của website.
