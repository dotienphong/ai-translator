# Kế hoạch triển khai: SEO & GEO cho Dịch meeting, Dịch cuộc họp, Dịch trực tuyến, Dịch YouTube, Dịch livestream, Dịch phụ đề cuộc họp

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai trang đích mới cho YouTube (`solutions-youtube`) trên 5 ngôn ngữ, nâng cấp trang họp trực tuyến (`solutions-meetings`), trang chủ (`home`), hệ thống điều hướng, tệp tri thức AI (`llms.txt`) và kiểm thử tự động để tối ưu SEO Google và AI Search (ChatGPT, Perplexity, Copilot) cho 6 từ khóa cốt lõi.

**Architecture:** Bổ sung trang `solutions-youtube` đối xứng 5 ngôn ngữ (`vi`, `en`, `ja`, `zh`, `ko`), mở rộng điều hướng `NAV`/`FOOTER` trong `site.mjs`, tối ưu on-page/FAQ schema, cập nhật metadata AI và kiểm chứng 100% bằng bộ test `seo-targets.test.mjs` cùng `site.test.mjs`.

**Tech Stack:** JavaScript (ES modules, Node.js test runner), HTML/CSS tĩnh, Schema JSON-LD (FAQPage, Article), Markdown.

**Spec:** `docs/superpowers/specs/2026-11-09-seo-geo-dich-meeting-youtube-cuoc-hop-design.md`

## Global Constraints

- Độ dài tiêu đề chuẩn `fullTitle` (sau khi ghép tự động ` | AI Translator` nếu chưa có tên app) tối đa 70 ký tự (`tMax = 70`).
- Độ dài mô tả `meta description` tối đa 165 ký tự (`dMax = 165`).
- Giữ nguyên cấu trúc 6 câu hỏi ở `HOME_FAQ` trên trang chủ (`home.mjs`) đồng bộ trên cả 5 ngôn ngữ (`vi`, `en`, `ja`, `zh`, `ko`) để qua test `i18n-content.test.mjs`.
- Bắt buộc nêu rõ các giới hạn trung thực (NEEDS): không chạy trên điện thoại, không lồng tiếng, không tải video, số đo độ trễ Mac M4 Pro 0,76–1,03s.
- Không thêm thư viện ngoài, không thêm script tracking hay cookie vi phạm CSP `default-src 'self'`.

## Review Focus

1. Tiêu đề và mô tả của `solutions-youtube` và `solutions-meetings` vượt ngưỡng 70 / 165 ký tự làm gãy `site.test.mjs` $\rightarrow$ ghim test độ dài trong Task 1.
2. Thiếu trang trên 1 trong 5 ngôn ngữ dẫn đến lỗi `missing` trong `site.test.mjs` $\rightarrow$ tạo đủ 5 ngôn ngữ trong Task 3.
3. Số lượng FAQ trên trang chủ không đồng bộ giữa 5 ngôn ngữ làm gãy `i18n-content.test.mjs` $\rightarrow$ tối ưu câu hỏi số 1 thay vì thêm câu thứ 7 trong Task 5.
4. Thiếu câu giới hạn bắt buộc (NEEDS) trong trang `solutions-youtube` làm gãy `seo-targets.test.mjs` $\rightarrow$ kiểm tra từng chuỗi trong Task 1 và Task 3.
5. Thiếu liên kết điều hướng từ Menu hoặc Footer tới trang mới làm hụt link equity SEO $\rightarrow$ kiểm tra `NAV` và `FOOTER` trong Task 2.

---

### Task 1: Cập nhật kiểm thử tự động `seo-targets.test.mjs` (TDD Failing Tests)

**Files:**
- Modify: `website/test/seo-targets.test.mjs`

**Interfaces:**
- Consumes: Cấu trúc `REQUESTED`, `SEO_TARGETS`, `NEEDS` hiện tại.
- Produces: Danh sách test case mới cho 6 từ khóa (`dịch meeting`, `dịch cuộc họp`, `dịch phụ đề cuộc họp`, `dịch trực tuyến`, `dịch youtube`, `youtube translation`) và điều kiện bắt buộc cho `solutions-youtube`.

- [ ] **Step 1: Mở rộng `REQUESTED` và `SEO_TARGETS` trong `website/test/seo-targets.test.mjs`**
Thêm 6 cụm từ mới vào mảng `REQUESTED`:
```javascript
  "dịch meeting", "dịch cuộc họp", "dịch phụ đề cuộc họp", "dịch trực tuyến", "dịch youtube", "youtube translation",
```
Và thêm vào `SEO_TARGETS`:
```javascript
  { phrase: "dịch meeting", lang: "vi", id: "solutions-meetings", where: ["title", "h1", "body"] },
  { phrase: "dịch cuộc họp", lang: "vi", id: "solutions-meetings", where: ["title", "h1", "body"] },
  { phrase: "dịch phụ đề cuộc họp", lang: "vi", id: "solutions-meetings", where: ["h2", "body"] },
  { phrase: "dịch trực tuyến", lang: "vi", id: "solutions-meetings", where: ["title", "body"] },
  { phrase: "dịch youtube", lang: "vi", id: "solutions-youtube", where: ["title", "h1", "body"] },
  { phrase: "youtube translation", lang: "en", id: "solutions-youtube", where: ["title", "h1", "body"] },
```

- [ ] **Step 2: Thêm định nghĩa `NEEDS["solutions-youtube"]` và đường dẫn trang mới vào `seo-targets.test.mjs`**
```javascript
const YT_VI = "/giai-phap/dich-youtube/";
const YT_EN = "/en/solutions/youtube-translation/";
```
Và thêm vào `NEEDS`:
```javascript
  "solutions-youtube": {
    vi: ["không chạy trên điện thoại", "không tải video", "không lồng tiếng", "0,76–1,03 giây", "Mac M4 Pro"],
    en: ["not on phones", "does not download videos", "no dubbing", "0.76–1.03 seconds", "Mac M4 Pro"],
    ja: ["Mac M4 Pro", "0.76", "1.03"],
    zh: ["Mac M4 Pro", "0.76", "1.03"],
    ko: ["Mac M4 Pro", "0.76", "1.03"],
  },
```

- [ ] **Step 3: Chạy test để xác nhận test THẤT BẠI do chưa có code**
Run: `node --test website/test/seo-targets.test.mjs`
Expected: FAIL với lỗi không tìm thấy trang `solutions-youtube` hoặc thiếu từ khóa ở `solutions-meetings`.

- [ ] **Step 4: Commit**
```bash
git add website/test/seo-targets.test.mjs
git commit -m "test(seo): thêm chỉ tiêu kiểm thử cho dịch meeting, youtube và cuộc họp"
```

---

### Task 2: Đăng ký ID trang mới, cập nhật Menu điều hướng, Footer và OG Group

**Files:**
- Modify: `website/src/content/index.mjs`
- Modify: `website/src/site.mjs`

**Interfaces:**
- Consumes: Mảng `IDS`, `FILE` trong `index.mjs`, đối tượng `NAV`, `FOOTER`, `OG_GROUP` trong `site.mjs`.
- Produces: Nhận diện hệ thống cho `solutions-youtube` trên cả 5 ngôn ngữ.

- [ ] **Step 1: Đăng ký `solutions-youtube` trong `website/src/content/index.mjs`**
Thêm `"solutions-youtube"` vào danh sách `IDS` (ngay sau `solutions-tiktok-live`) và gán vào `FILE`:
```javascript
  "solutions-youtube": "solutions-youtube",
```

- [ ] **Step 2: Cập nhật `NAV` trong `website/src/site.mjs`**
Thêm mục Dịch YouTube vào danh mục `Giải pháp` ở cả 5 ngôn ngữ:
- `vi`: `{ label: "Dịch YouTube", href: "/giai-phap/dich-youtube/", hint: "Phụ đề cho video & livestream" }`
- `en`: `{ label: "YouTube translation", href: "/en/solutions/youtube-translation/", hint: "Subtitles for videos & streams" }`
- `ja`: `{ label: "YouTube 翻訳", href: "/ja/solutions/youtube-translation/", hint: "動画とライブ配信に字幕" }`
- `zh`: `{ label: "YouTube 翻译", href: "/zh/solutions/youtube-translation/", hint: "视频与直播翻译字幕" }`
- `ko`: `{ label: "YouTube 번역", href: "/ko/solutions/youtube-translation/", hint: "동영상 및 라이브 자막" }`

- [ ] **Step 3: Cập nhật `FOOTER` và `OG_GROUP` trong `website/src/site.mjs`**
- Thêm link `Dịch YouTube` vào cột `Giải pháp` của `FOOTER` ở cả 5 ngôn ngữ.
- Trong `OG_GROUP`, thêm `"solutions-youtube": "solutions"`.

- [ ] **Step 4: Commit**
```bash
git add website/src/content/index.mjs website/src/site.mjs
git commit -m "feat(website): đăng ký solutions-youtube trong index, NAV, FOOTER và OG_GROUP"
```

---

### Task 3: Tạo trang `solutions-youtube` cho 5 ngôn ngữ (`vi`, `en`, `ja`, `zh`, `ko`)

**Files:**
- Create: `website/src/content/vi/solutions-youtube.mjs`
- Create: `website/src/content/en/solutions-youtube.mjs`
- Create: `website/src/content/ja/solutions-youtube.mjs`
- Create: `website/src/content/zh/solutions-youtube.mjs`
- Create: `website/src/content/ko/solutions-youtube.mjs`

**Interfaces:**
- Consumes: Các helper components từ `../../build/components.mjs` (`pageHero`, `facts`, `sectionHead`, `feature`, `checkList`, `steps`, `callout`, `ctaBand`, `faq`).
- Produces: Nội dung bài viết giải pháp dịch YouTube hoàn chỉnh, kèm FAQPage schema và đầy đủ cụm từ khóa mục tiêu.

- [ ] **Step 1: Soạn thảo `website/src/content/vi/solutions-youtube.mjs`**
- ID: `solutions-youtube`, lang: `vi`, path: `/giai-phap/dich-youtube/`.
- Title: `Dịch YouTube ra tiếng Việt: phụ đề video & live` (47 ký tự).
- Description: `Dịch video và livestream YouTube sang tiếng Việt trực tiếp trên máy tính. Phụ đề nổi, AI chạy offline, không cần tiện ích mở rộng. Dùng thử Free 10 ngày.` (154 ký tự).
- H1: `Dịch YouTube ra tiếng Việt bằng phụ đề trực tiếp`.
- Thân trang chứa đủ: các trường hợp xem video bài giảng/tin tức, YouTube Live, 4 bước cách dùng, so sánh với phụ đề có sẵn của YouTube, các câu giới hạn trung thực (không chạy trên điện thoại, không tải video, không lồng tiếng, 0,76–1,03 giây, Mac M4 Pro), 5 câu hỏi FAQ schema.

- [ ] **Step 2: Soạn thảo bản tiếng Anh `website/src/content/en/solutions-youtube.mjs`**
- ID: `solutions-youtube`, lang: `en`, path: `/en/solutions/youtube-translation/`.
- Title: `YouTube translation: live subtitles for video & streams`.
- Description: `Translate YouTube videos and live streams with real-time subtitles on your computer. On-device AI, no browser extensions needed. Free 10-day trial.`.
- H1: `Live translated subtitles for YouTube videos and streams`.
- Thân trang chứa cụm từ `"youtube translation"`, các câu giới hạn trung thực ("not on phones", "does not download videos", "no dubbing", "0.76–1.03 seconds", "Mac M4 Pro") và FAQ tiếng Anh.

- [ ] **Step 3: Soạn thảo các bản `ja`, `zh`, `ko` của `solutions-youtube.mjs`**
- Cấu trúc đối xứng với bản tiếng Anh, dùng đường dẫn tương ứng: `/ja/solutions/youtube-translation/`, `/zh/...`, `/ko/...`.
- Đảm bảo có mặt các từ khóa đo kiểm: `"Mac M4 Pro"`, `"0.76"`, `"1.03"`.

- [ ] **Step 4: Kiểm tra build trang**
Run: `node --test website/test/seo-targets.test.mjs`
Expected: Phần kiểm tra `solutions-youtube` pass.

- [ ] **Step 5: Commit**
```bash
git add website/src/content/*/solutions-youtube.mjs
git commit -m "feat(website): tạo trang giải pháp dịch YouTube trên 5 ngôn ngữ"
```

---

### Task 4: Nâng cấp trang `solutions-meetings` phủ toàn diện các từ khóa Meeting & Cuộc họp

**Files:**
- Modify: `website/src/content/vi/solutions-meetings.mjs`

**Interfaces:**
- Consumes: Cấu trúc hiện có của `solutions-meetings.mjs`.
- Produces: Tiêu đề, H1, H2, body chứa tự nhiên: `dịch meeting`, `dịch cuộc họp`, `dịch phụ đề cuộc họp`, `dịch trực tuyến`.

- [ ] **Step 1: Cập nhật metadata `solutions-meetings.mjs`**
- Tiêu đề: `Dịch meeting, dịch cuộc họp trực tuyến Zoom, Teams` (50 ký tự + hậu tố = 66 <= 70).
- Mô tả: `Dịch meeting và cuộc họp trực tuyến Zoom, Teams, Meet, Zalo: phụ đề dịch trực tiếp, AI chạy offline trên máy tính, không cần bot. Dùng thử Free 10 ngày.` (153 ký tự <= 165).
- H1: `Dịch meeting và cuộc họp trực tuyến bằng phụ đề trực tiếp`.

- [ ] **Step 2: Cập nhật H2 và thân trang `solutions-meetings.mjs`**
- Thêm H2: `Dịch phụ đề cuộc họp ngay trên máy tính của bạn`.
- Lồng ghép tự nhiên các cụm từ trong đoạn dẫn và danh sách kiểm tra: "dịch meeting Zoom, Teams", "dịch cuộc họp", "dịch trực tuyến".

- [ ] **Step 3: Chạy test để kiểm chứng các cụm từ meeting**
Run: `node --test website/test/seo-targets.test.mjs`
Expected: Tất cả các kiểm tra từ khóa cho `solutions-meetings` PASS.

- [ ] **Step 4: Commit**
```bash
git add website/src/content/vi/solutions-meetings.mjs
git commit -m "feat(seo): tối ưu trang solutions-meetings cho dịch meeting, cuộc họp và phụ đề cuộc họp"
```

---

### Task 5: Cập nhật Trang chủ, Trang tổng hợp Giải pháp và Tệp tri thức AI (`llms.txt`)

**Files:**
- Modify: `website/src/content/vi/home.mjs`
- Modify: `website/src/content/vi/solutions.mjs` (và các bản en/ja/zh/ko nếu có liên kết)
- Modify: `website/src/build/llms.mjs`
- Modify: `website/dist/llms.txt`, `website/dist/llms-full.txt`, `website/dist/llms-full.vi.txt` (tự động sinh khi build)

**Interfaces:**
- Consumes: Cấu trúc trang chủ, trang giải pháp và build script `llms.mjs`.
- Produces: Liên kết nội bộ mạch lạc tới trang YouTube mới, tối ưu FAQ trang chủ, và làm giàu nội dung `llms.txt` cho các bot AI (ChatGPT, Perplexity).

- [ ] **Step 1: Cập nhật FAQ số 1 trên trang chủ `website/src/content/vi/home.mjs`**
Tối ưu câu hỏi số 1:
```javascript
    q: "Làm sao dịch meeting và cuộc họp Zoom, Teams, Meet mà không cần bot?",
    a: `<p>AI Translator giúp bạn dịch meeting và cuộc họp trực tuyến mà không cần bot hay plugin: app thu âm thanh hệ thống của máy tính nên không phụ thuộc ứng dụng họp. Chúng tôi đã thử thu âm thanh trên macOS với Zoom, Google Meet, Microsoft Teams và Zalo PC (thử nghiệm nội bộ, không phải chứng nhận của các bên đó). Người cùng họp không được thông báo, nên nếu quy định yêu cầu thì bạn tự báo họ. Xem thêm <a href="/giai-phap/dich-hop-truc-tuyen/">dịch meeting và cuộc họp trực tuyến</a>.</p>`,
```

- [ ] **Step 2: Cập nhật trang giải pháp tổng hợp `website/src/content/vi/solutions.mjs`**
- Thêm linkCard tới `/giai-phap/dich-youtube/` ("Dịch YouTube", "Xem video bài giảng, tin tức và livestream YouTube bằng phụ đề tiếng Việt trực tiếp.").
- Trong bảng "Chọn nhanh", thêm dòng:
`<tr><th scope="row">Video và livestream YouTube</th><td>Xem trên trình duyệt máy tính, chọn nguồn chỉ nghe trình duyệt (macOS), đặt thanh phụ đề sát dưới khung video; không dùng trên điện thoại</td></tr>`
- Cập nhật tương ứng cho các bản en, ja, zh, ko của `solutions.mjs`.

- [ ] **Step 3: Cập nhật `website/src/build/llms.mjs`**
Thêm `solutions-youtube` vào danh mục các trang giải pháp trong tệp sinh `llms.txt` để các bot AI nhận diện đầy đủ.

- [ ] **Step 4: Chạy build website để cập nhật dist**
Run: `node website/src/build/build.mjs`
Expected: Tạo thành công các tệp HTML và `llms.txt` mới trong thư mục dist.

- [ ] **Step 5: Commit**
```bash
git add website/src/content/ website/src/build/llms.mjs
git commit -m "feat(seo): cập nhật liên kết YouTube trên trang chủ, giải pháp và llms.txt"
```

---

### Task 6: Chạy toàn bộ Test Suite và Xác minh toàn diện

**Files:**
- Test: `website/test/seo-targets.test.mjs`
- Test: `website/test/site.test.mjs`
- Test: `website/test/i18n-content.test.mjs`

- [ ] **Step 1: Chạy kiểm thử mục tiêu SEO `seo-targets.test.mjs`**
Run: `node --test website/test/seo-targets.test.mjs`
Expected: PASS toàn bộ các test mục tiêu từ khóa và điều kiện giới hạn.

- [ ] **Step 2: Chạy kiểm thử tính toàn vẹn website `site.test.mjs`**
Run: `node --test website/test/site.test.mjs`
Expected: PASS toàn bộ (không vi phạm giới hạn độ dài title, description, thẻ canonical, hreflang, json-ld schema).

- [ ] **Step 3: Chạy kiểm thử đối xứng đa ngôn ngữ `i18n-content.test.mjs`**
Run: `node --test website/test/i18n-content.test.mjs`
Expected: PASS toàn bộ tính tương thích FAQ và cấu trúc giữa 5 ngôn ngữ.

- [ ] **Step 4: Commit hoàn thiện**
```bash
git commit --allow-empty -m "chore(seo): xác minh toàn bộ test suite SEO & GEO pass 100%"
```

