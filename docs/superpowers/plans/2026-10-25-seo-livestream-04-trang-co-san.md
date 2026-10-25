# SEO từ khóa livestream 04: sửa các trang đã có (vi, en), menu và chân trang

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa các cụm đích vào Trang chủ (vi, en), trang họp (chỉ en), trang Webinar và video (vi, en); dẫn tới hai trang mới từ trang Giải pháp, Tính năng, Hỏi đáp, menu và chân trang (vi, en).

**Architecture:** Chỉ sửa chữ trong các module trang sẵn có (không đổi khung), mỗi chỗ sửa là một cặp "Tìm" (chuỗi nguyên văn, duy nhất trong file) và "Thay bằng". Dùng công cụ Edit; nếu Edit báo chuỗi không duy nhất hay không thấy, mở file đọc lại chỗ đó rồi sửa đúng chỗ (đừng đoán). Tiền đề: kế hoạch 02 và 03 đã xong. `WT=/Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream` (viết đường dẫn đầy đủ khi chạy lệnh). Mọi đường dẫn "Files" dưới đây tính từ `WT/website/`.

**Tech Stack:** như trước. Bản ja/zh/ko của các chỗ sửa này làm ở kế hoạch 05, nên ở đây bản ja/zh/ko tạm lệch bản en (chưa dẫn tới trang mới): test ở kế hoạch này chạy với `ALLOW_PARTIAL=1`.

Luật chữ: không `engine`, `metal`, `beta`; câu "đã thử" luôn tách hai câu (xem kế hoạch 00).

---

### Task 1: Trang chủ (vi, en)

**Files:**
- Modify: `src/content/vi/home.mjs`
- Modify: `src/content/en/home.mjs`

- [ ] **Step 1: Sửa `src/content/vi/home.mjs`**

Sáu chỗ sửa (cặp Tìm / Thay bằng), cộng một câu hỏi đáp ở Step 2.

Tiêu đề:
Tìm:
```
  title: "Phần mềm dịch phụ đề cuộc họp trực tiếp, chạy offline | AI Translator",
```
Thay bằng:
```
  title: "Dịch livestream, họp trực tiếp bằng AI, chạy offline | AI Translator",
```

Mô tả:
Tìm:
```
    "Phụ đề dịch trực tiếp khi họp Zoom, Teams, Google Meet, Zalo: tiếng Anh, Trung, Nhật, Hàn sang tiếng Việt. AI chạy trên máy, âm thanh không lên cloud.",
```
Thay bằng:
```
    "Phụ đề tiếng Việt dịch trực tiếp cho livestream, video và họp Zoom, Teams, Meet, Zalo: từ tiếng Anh, Trung, Nhật, Hàn. AI chạy trên máy, âm thanh không lên cloud.",
```

Ngày sửa:
Tìm: `  modified: "2026-10-24",` Thay bằng: `  modified: "2026-10-25",`

Mô tả cho llms:
Tìm: `llm: "Trang chủ: AI Translator là gì, dịch cuộc họp bằng phụ đề,`
Thay bằng: `llm: "Trang chủ: AI Translator là gì, dịch cuộc họp và livestream bằng phụ đề,`

Câu dẫn của hero:
Tìm: `Dùng với Zoom, Microsoft Teams, Google Meet, Zalo PC, webinar hay video.</p>`
Thay bằng: `Dùng với Zoom, Microsoft Teams, Google Meet, Zalo PC, webinar, video hay livestream xem trên máy tính.</p>`

Gạch đầu dòng mới ở mục "Dịch cuộc họp" (thêm một dòng ngay sau dòng "Họp tại chỗ hay họp lai", trước `])}`):
Tìm:
```
  "Họp tại chỗ hay họp lai: chọn nguồn <strong>Micro</strong> hoặc <strong>Âm thanh máy + Micro</strong> để dịch cả người nói trong phòng (<a href=\"/tinh-nang/#micro\">cách dùng</a>)",
```
Thay bằng:
```
  "Họp tại chỗ hay họp lai: chọn nguồn <strong>Micro</strong> hoặc <strong>Âm thanh máy + Micro</strong> để dịch cả người nói trong phòng (<a href=\"/tinh-nang/#micro\">cách dùng</a>)",
  "Xem livestream hay video cũng được: app nghe mọi âm thanh phát trên máy, kể cả live phát trong trình duyệt (<a href=\"/giai-phap/dich-livestream/\">dịch livestream</a>)",
```

- [ ] **Step 2: Thêm câu hỏi đáp vào `HOME_FAQ` (vi)**

Tìm (đầu mục hỏi đáp thứ tư):
```
    q: "Âm thanh cuộc họp của tôi có bị gửi đi đâu không?",
```
Thay bằng (chèn một mục mới ngay trước, dòng `{` đứng trước dòng Tìm được giữ nguyên làm phần mở của mục mới):
```
    q: "Dịch livestream ra tiếng Việt được không?",
    a: "<p>Được, khi bạn xem livestream bằng tiếng Anh, Trung, Nhật hay Hàn trên máy tính. Chúng tôi chưa thử riêng từng nền tảng livestream. Chúng tôi đã thử với video phát trong trình duyệt, và app nghe âm thanh phát ra từ máy nên không phụ thuộc trang web. App không có bản cho điện thoại và chỉ làm phụ đề cho người xem, không dịch live của chính bạn cho người xem của bạn. Xem <a href=\"/giai-phap/dich-livestream/\">dịch livestream ra tiếng Việt</a>.</p>",
  },
  {
    q: "Âm thanh cuộc họp của tôi có bị gửi đi đâu không?",
```

- [ ] **Step 3: Sửa `src/content/en/home.mjs`**

Tiêu đề:
Tìm: `  title: "Live translated subtitles for meetings, offline | AI Translator",`
Thay bằng: `  title: "Real-time translator for meetings and livestreams | AI Translator",`

Mô tả:
Tìm:
```
    "Read live translated subtitles in Zoom, Teams, Google Meet or any app. English, Chinese, Japanese, Korean, Vietnamese. AI runs on your computer, no cloud.",
```
Thay bằng:
```
    "Real-time translation for livestreams, videos and meetings: subtitles in English, Chinese, Japanese, Korean, Vietnamese. AI runs on your computer, no cloud.",
```

Ngày sửa: Tìm `  modified: "2026-10-24",` Thay bằng `  modified: "2026-10-25",`

llms: Tìm `llm: "Home page: what AI Translator is, meeting translation with subtitles,` Thay bằng `llm: "Home page: what AI Translator is, meeting and livestream translation with subtitles,`

Câu dẫn của hero (hai chỗ trong cùng đoạn):
Tìm: `is a desktop app that turns the audio playing on your computer into floating translated subtitles, and translates`
Thay bằng: `is an AI live translator for macOS and Windows: a desktop app that turns the audio playing on your computer into floating translated subtitles in real time, and translates`
Tìm: `Zalo PC, webinars or videos.</p>`
Thay bằng: `Zalo PC, webinars, videos or livestreams you watch on a computer.</p>`

Gạch đầu dòng mới ở mục "Meeting translation":
Tìm:
```
  "In-person or hybrid meetings: choose the <strong>Microphone</strong> or <strong>Computer audio + Microphone</strong> source to translate people in the room too (<a href=\"/en/features/#microphone\">how it works</a>)",
```
Thay bằng:
```
  "In-person or hybrid meetings: choose the <strong>Microphone</strong> or <strong>Computer audio + Microphone</strong> source to translate people in the room too (<a href=\"/en/features/#microphone\">how it works</a>)",
  "Livestreams and videos too: the app hears any audio playing on your computer, so it works with live video in a browser (<a href=\"/en/solutions/livestream-translation/\">livestream translation</a>)",
```

Câu hỏi đáp mới (chèn trước mục "Is my meeting audio sent anywhere?"):
Tìm:
```
    q: "Is my meeting audio sent anywhere?",
```
Thay bằng:
```
    q: "Can I translate a livestream into my language?",
    a: "<p>Yes, when you watch a livestream in English, Chinese, Japanese or Korean on a computer. We have not tested each livestream platform. We have tested it with videos playing in a browser, and the app listens to the audio playing on your machine, so it does not depend on the website. There is no phone version, and the app only makes subtitles for the viewer: it does not translate your own livestream for your audience. See <a href=\"/en/solutions/livestream-translation/\">livestream translation</a>.</p>",
  },
  {
    q: "Is my meeting audio sent anywhere?",
```

- [ ] **Step 4: Kiểm các cụm của Trang chủ**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/seo-targets.test.mjs 2>&1 | grep -E '^(✔|✖)' | grep -E 'home|Trang chủ \('`
Expected: `✔` cho `dịch livestream … home`, `real-time translator … home`, `real-time translation … home`, `ai live translator … home`, `ai translator … home` và `Trang chủ (vi)`, `Trang chủ (en) có câu hỏi đáp về livestream`; dòng `Trang chủ, Tính năng, Hỏi đáp và Webinar (…) dẫn tới…` còn `✖` tới Task 3 và 4.

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/site.test.mjs 2>&1 | grep -E '^(✖|ℹ (fail))'`
Expected: `ℹ fail 1` (chỉ `đủ trang…`). Lỗi hay gặp: description vượt 165 ký tự, title vượt 70 ký tự (rút gọn), test "câu cũ" báo câu mới trùng luật.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/content/vi/home.mjs website/src/content/en/home.mjs && \
git commit -m "feat(website): Trang chủ vi và en nhắc livestream và dịch thời gian thực (title, mô tả, hero, hỏi đáp)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

---

### Task 2: Trang Giải pháp (vi, en)

**Files:**
- Modify: `src/content/vi/solutions.mjs`
- Modify: `src/content/en/solutions.mjs`

- [ ] **Step 1: Sửa `src/content/vi/solutions.mjs`**

Tiêu đề: Tìm `  title: "Giải pháp: AI Translator cho họp, webinar và video",` Thay bằng `  title: "Giải pháp: AI Translator cho họp, livestream và video",`

Mô tả:
Tìm:
```
    "AI Translator hiện phụ đề dịch trực tiếp cho họp Zoom, Teams, Meet, Zalo, webinar, khóa học và video. Xem cách dùng cho từng tình huống và khi nào app chưa phù hợp.",
```
Thay bằng:
```
    "AI Translator hiện phụ đề dịch trực tiếp cho họp Zoom, Teams, Meet, Zalo, livestream, webinar và video. Xem cách dùng từng tình huống và khi nào app chưa phù hợp.",
```

Ngày sửa: Tìm `  modified: "2026-10-14",` Thay bằng `  modified: "2026-10-25",`

llms: Tìm `(họp trực tuyến, webinar, khóa học, video), liên kết tới hai trang giải pháp chi tiết` Thay bằng `(họp trực tuyến, livestream, webinar, khóa học, video), liên kết tới các trang giải pháp chi tiết`

Lead: Tìm `Hai tình huống chính là họp trực tuyến và xem webinar, khóa học, video bằng ngoại ngữ.` Thay bằng `Các tình huống chính là họp trực tuyến, xem livestream, và xem webinar, khóa học, video bằng ngoại ngữ.`

Eyebrow: Tìm `eyebrow: "Hai cách dùng chính"` Thay bằng `eyebrow: "Các cách dùng chính"`

Hai thẻ mới (sau thẻ webinar):
Tìm: `more: "Xem giải pháp cho webinar và video" })}`
Thay bằng:
```
more: "Xem giải pháp cho webinar và video" })}
${linkCard({ href: "/giai-phap/dich-livestream/", icon: "video", title: "Livestream: TikTok, YouTube, Facebook", text: "Phụ đề dịch khi xem livestream bằng tiếng Anh, Trung, Nhật hay Hàn trên máy tính, không cài vào trình duyệt. Nói rõ giới hạn: không dùng trên điện thoại, không dịch live của người phát.", more: "Xem giải pháp cho livestream" })}
${linkCard({ href: "/giai-phap/dich-live-tiktok/", icon: "play", title: "Live TikTok", text: "Cách xem TikTok LIVE trên trình duyệt máy tính với phụ đề tiếng Việt, và giới hạn riêng của nó.", more: "Xem hướng dẫn dịch live TikTok" })}
```

Dòng mới trong bảng "Chọn nhanh":
Tìm: `<tr><th scope="row">Webinar, hội thảo</th>`
Thay bằng:
```
<tr><th scope="row">Livestream, live TikTok</th><td>Xem live trên trình duyệt máy tính, chọn nguồn chỉ nghe trình duyệt (macOS), tăng độ nhạy ngắt câu nếu người nói liền một mạch; không dùng trên điện thoại</td></tr>
<tr><th scope="row">Webinar, hội thảo</th>
```

- [ ] **Step 2: Sửa `src/content/en/solutions.mjs`**

Tiêu đề: Tìm `  title: "Solutions: AI Translator for meetings and video",` Thay bằng `  title: "Solutions: AI Translator for meetings, livestreams and video",`

Mô tả:
Tìm:
```
    "AI Translator shows translated subtitles for Zoom, Teams, Meet and Zalo calls, webinars, courses and videos. See how to use it and when it is not the right fit.",
```
Thay bằng:
```
    "AI Translator shows translated subtitles for Zoom, Teams, Meet and Zalo calls, livestreams, webinars and videos. See how to use it and when it is not the right fit.",
```

Ngày sửa: Tìm `  modified: "2026-10-14",` Thay bằng `  modified: "2026-10-25",`

llms: Tìm `(online meetings, webinars, courses, videos), links to the two detailed solution pages` Thay bằng `(online meetings, livestreams, webinars, courses, videos), links to the detailed solution pages`

Lead: Tìm `The two main uses are online meetings, and watching webinars, courses or videos in a language you do not speak.` Thay bằng `The main uses are online meetings, watching livestreams, and watching webinars, courses or videos in a language you do not speak.`

Eyebrow: Tìm `eyebrow: "Two main uses"` Thay bằng `eyebrow: "Main uses"`

Hai thẻ mới:
Tìm: `more: "See the webinar and video solution" })}`
Thay bằng:
```
more: "See the webinar and video solution" })}
${linkCard({ href: "/en/solutions/livestream-translation/", icon: "video", title: "Livestreams: TikTok, YouTube, Facebook", text: "Translated subtitles while you watch a livestream in English, Chinese, Japanese or Korean on a computer, with nothing to install in your browser. Honest limits: no phones, and no translating your own livestream.", more: "See the livestream solution" })}
${linkCard({ href: "/en/solutions/tiktok-live-translation/", icon: "play", title: "TikTok Live", text: "How to watch TikTok Live in a desktop browser with translated subtitles, and its own limits.", more: "See the TikTok Live guide" })}
```

Dòng mới trong bảng:
Tìm: `<tr><th scope="row">Webinar or conference talk</th>`
Thay bằng:
```
<tr><th scope="row">Livestream or TikTok Live</th><td>Watch in a desktop browser, listen to the browser only (macOS), raise the sentence pause if the speaker rarely stops; not for phones</td></tr>
<tr><th scope="row">Webinar or conference talk</th>
```

- [ ] **Step 3: Kiểm**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/site.test.mjs 2>&1 | grep -E '^(✖|ℹ (fail))'`
Expected: `ℹ fail 1` (chỉ `đủ trang…`). Các test sẵn có về trang Giải pháp (cụm "VietQR hoặc thẻ quốc tế", khung `#chua-phu-hop`/`#not-a-fit`, câu giới hạn thẻ) phải vẫn đạt vì ta không đụng các đoạn đó.

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/content/vi/solutions.mjs website/src/content/en/solutions.mjs && \
git commit -m "feat(website): trang Giải pháp vi và en thêm livestream và live TikTok

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

---

### Task 3: Trang họp (chỉ en) và trang Webinar và video (vi, en)

**Files:**
- Modify: `src/content/en/solutions-meetings.mjs`
- Modify: `src/content/vi/solutions-webinar.mjs`
- Modify: `src/content/en/solutions-webinar.mjs`

- [ ] **Step 1: Sửa `src/content/en/solutions-meetings.mjs`**

Tiêu đề trang:
Tìm: `  title: "Translated subtitles for Zoom, Teams, Meet, Zalo",`
Thay bằng: `  title: "AI meeting translator for Zoom, Teams and Meet",`

Mô tả:
Tìm:
```
    "Read live translated subtitles in Zoom, Teams, Google Meet and Zalo calls with AI Translator: no bot, runs offline. Setup tips and honest limits.",
```
Thay bằng:
```
    "AI Translator is an AI meeting translator: live translated subtitles for Zoom, Teams, Meet and Zalo calls, no bot, runs offline. Setup tips and honest limits.",
```

Ngày sửa: Tìm `  modified: "2026-10-24",` Thay bằng `  modified: "2026-10-25",`

llms:
Tìm: `llm: "How to use AI Translator for translated subtitles in Zoom, Teams, Google Meet and Zalo calls:`
Thay bằng: `llm: "How to use AI Translator as an AI meeting translator for live translated subtitles in Zoom, Teams, Google Meet and Zalo calls:`
Tìm: `  llmTitle: "Translated subtitles for online meetings (Zoom, Teams, Meet, Zalo)",`
Thay bằng: `  llmTitle: "AI meeting translator: subtitles for online meetings (Zoom, Teams, Meet, Zalo)",`

H1 (đối số của `pageHero`):
Tìm: `  title: "Translated subtitles for online meetings (Zoom, Teams, Meet, Zalo)",`
Thay bằng: `  title: "AI meeting translator: translated subtitles for Zoom, Teams, Meet, Zalo",`

Câu dẫn:
Tìm: `lead: "AI Translator shows live translated subtitles for Zoom, Microsoft Teams, Google Meet and Zalo PC calls by listening to the audio playing on your computer. There is no bot to invite, nothing for the host to switch on, and both speech recognition and translation run on your own machine.",`
Thay bằng: `lead: "AI Translator is a real-time translator for meetings: it shows live translated subtitles for Zoom, Microsoft Teams, Google Meet and Zalo PC calls by listening to the audio playing on your computer. It is live meeting translation without a bot: nothing to invite, nothing for the host to switch on, and both speech recognition and translation run on your own machine.",`

- [ ] **Step 2: Sửa `src/content/vi/solutions-webinar.mjs`**

Ngày sửa: Tìm `  modified: "2026-10-24",` Thay bằng `  modified: "2026-10-25",`

Đoạn "Không cần cài thêm":
Tìm: `Chúng tôi đã thử với video trên trình duyệt, nhưng chưa thử riêng từng nền tảng khóa học hay webinar.</p>`
Thay bằng: `Chúng tôi đã thử với video trên trình duyệt, nhưng chưa thử riêng từng nền tảng khóa học hay webinar. AI Translator làm việc như một công cụ dịch video theo thời gian thực cho nội dung bạn đang xem trên máy tính: nó không dịch, lồng tiếng hay tạo phụ đề cho file video, mà hiện phụ đề trên màn hình khi video đang phát. Xem livestream thì đọc <a href="/giai-phap/dich-livestream/">dịch livestream</a>.</p>`

- [ ] **Step 3: Sửa `src/content/en/solutions-webinar.mjs`**

Ngày sửa: Tìm `  modified: "2026-10-24",` Thay bằng `  modified: "2026-10-25",`

Đoạn "Nothing extra to install":
Tìm: `We have tested it with videos in a browser, but not with each individual course or webinar platform.</p>`
Thay bằng: `We have tested it with videos in a browser, but not with each individual course or webinar platform. AI Translator works as a real-time video translator for what you watch on your computer: it does not translate, dub or subtitle video files; it shows subtitles on screen while the video plays. For live video, see <a href="/en/solutions/livestream-translation/">livestream translation</a>.</p>`

- [ ] **Step 4: Kiểm**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/seo-targets.test.mjs 2>&1 | grep -E '^(✔|✖)' | grep -E 'solutions-meetings|solutions-webinar'`
Expected: bốn dòng `ai meeting translator`, `real-time translator for meetings`, `live meeting translation` (đều ở `solutions-meetings`) và `video translator` (ở `solutions-webinar`) đạt `✔`.

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/site.test.mjs 2>&1 | grep -E '^(✖|ℹ (fail))'`
Expected: `ℹ fail 1` (chỉ `đủ trang…`). Nếu `<title>` của trang họp en bị báo quá dài hay trùng, rút gọn.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/content/en/solutions-meetings.mjs website/src/content/vi/solutions-webinar.mjs website/src/content/en/solutions-webinar.mjs && \
git commit -m "feat(website): trang họp en nhắm AI meeting translator; trang webinar nói rõ là dịch video thời gian thực

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

---

### Task 4: Tính năng và Hỏi đáp (vi, en)

**Files:**
- Modify: `src/content/vi/features.mjs`, `src/content/en/features.mjs`
- Modify: `src/content/vi/faq.mjs`, `src/content/en/faq.mjs`

- [ ] **Step 1: Tính năng (vi)**

Ngày sửa: Tìm `  modified: "2026-10-24",` Thay bằng `  modified: "2026-10-25",`
Đoạn "Nguồn âm thanh":
Tìm: `<p>Vì app thu âm thanh hệ thống, AI Translator chạy với mọi thứ phát ra tiếng: Zoom, Microsoft Teams, Google Meet, Zalo PC, webinar, video, khóa học trực tuyến.</p>`
Thay bằng: `<p>Vì app thu âm thanh hệ thống, AI Translator chạy với mọi thứ phát ra tiếng: Zoom, Microsoft Teams, Google Meet, Zalo PC, webinar, video, khóa học trực tuyến và livestream xem trên máy tính (<a href="/giai-phap/dich-livestream/">dịch livestream</a>).</p>`

- [ ] **Step 2: Tính năng (en)**

Ngày sửa: Tìm `  modified: "2026-10-24",` Thay bằng `  modified: "2026-10-25",`
Tìm: `<p>Because the app captures system audio, AI Translator works with anything that makes sound: Zoom, Microsoft Teams, Google Meet, Zalo PC, webinars, videos and online courses.</p>`
Thay bằng: `<p>Because the app captures system audio, AI Translator works with anything that makes sound: Zoom, Microsoft Teams, Google Meet, Zalo PC, webinars, videos, online courses and livestreams you watch on a computer (<a href="/en/solutions/livestream-translation/">livestream translation</a>).</p>`

- [ ] **Step 3: Hỏi đáp (vi): ba câu mới trong nhóm "Tổng quan"**

Ngày sửa: Tìm `  modified: "2026-10-24",` Thay bằng `  modified: "2026-10-25",`

Chèn trước mục "Dùng được với Zoom, Teams, Google Meet, Zalo không?":
Tìm:
```
        q: "Dùng được với Zoom, Teams, Google Meet, Zalo không?",
```
Thay bằng (dòng `{` đứng trước dòng Tìm là phần mở của mục đầu tiên trong ba mục mới):
```
        q: "Dịch livestream ra tiếng Việt được không? Có dịch live TikTok không?",
        a: `<p>Được, khi bạn xem livestream bằng tiếng Anh, Trung, Nhật hay Hàn trên máy tính. Chúng tôi chưa thử riêng từng nền tảng livestream (TikTok LIVE, YouTube, Facebook Live). Chúng tôi đã thử với video phát trong trình duyệt, và app nghe âm thanh phát ra từ máy nên không phụ thuộc trang web. Xem <a href="/giai-phap/dich-livestream/">dịch livestream ra tiếng Việt</a> và <a href="/giai-phap/dich-live-tiktok/">dịch live TikTok</a>.</p>`,
      },
      {
        q: "Có dùng AI Translator trên điện thoại để dịch live được không?",
        a: `<p>Không. AI Translator chỉ có bản cho macOS (Apple Silicon) và Windows 10/11. Muốn có phụ đề cho livestream, hãy mở buổi live trên máy tính.</p>`,
      },
      {
        q: "Tôi phát livestream, dịch cho người xem của mình được không?",
        a: `<p>Không. AI Translator không có tính năng đưa phụ đề hay giọng dịch vào buổi live của bạn. Phụ đề chỉ hiện trên màn hình của người dùng app, từ âm thanh phát ra trên máy họ sang ngôn ngữ họ chọn.</p>`,
      },
      {
        q: "Dùng được với Zoom, Teams, Google Meet, Zalo không?",
```

- [ ] **Step 4: Hỏi đáp (en): ba câu mới**

Ngày sửa: Tìm `  modified: "2026-10-24",` Thay bằng `  modified: "2026-10-25",`

Tìm:
```
        q: "Does it work with Zoom, Teams, Google Meet and Zalo?",
```
Thay bằng:
```
        q: "Can I translate a livestream into my language? What about TikTok Live?",
        a: `<p>Yes, when you watch a livestream in English, Chinese, Japanese or Korean on a computer. We have not tested each livestream platform (TikTok Live, YouTube, Facebook Live). We have tested it with videos playing in a browser, and the app listens to the audio playing on your machine, so it does not depend on the website. See <a href="/en/solutions/livestream-translation/">livestream translation</a> and <a href="/en/solutions/tiktok-live-translation/">translating TikTok Live</a>.</p>`,
      },
      {
        q: "Can I use AI Translator on a phone to translate a livestream?",
        a: `<p>No. AI Translator only runs on macOS (Apple Silicon) and Windows 10/11. To get subtitles for a livestream, open it on a computer.</p>`,
      },
      {
        q: "I stream live. Can I translate for my viewers?",
        a: `<p>No. AI Translator has no feature that adds subtitles or a translated voice to your livestream. Subtitles appear only on the screen of the person using the app, translating the sound that plays on their computer into the language they choose.</p>`,
      },
      {
        q: "Does it work with Zoom, Teams, Google Meet and Zalo?",
```

- [ ] **Step 5: Kiểm và commit**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/site.test.mjs 2>&1 | grep -E '^(✖|ℹ (fail))'`
Expected: `ℹ fail 1` (chỉ `đủ trang…`). Nếu test JSON-LD báo "câu trả lời FAQ dính câu", mở câu trả lời vừa thêm và bảo đảm giữa hai câu có dấu cách.

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/content/vi/features.mjs website/src/content/en/features.mjs website/src/content/vi/faq.mjs website/src/content/en/faq.mjs && \
git commit -m "feat(website): Tính năng và Hỏi đáp (vi, en) nhắc livestream, live TikTok, điện thoại và người phát live

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

---

### Task 5: Menu Giải pháp và chân trang (vi, en)

**Files:**
- Modify: `src/site.mjs` (`NAV.vi`, `NAV.en`, `FOOTER.vi`, `FOOTER.en`)

- [ ] **Step 1: `NAV.vi`**

Tìm:
```
        { label: "Webinar và video", href: "/giai-phap/dich-webinar-va-video/", hint: "Xem nội dung tiếng nước ngoài" },
```
Thay bằng:
```
        { label: "Webinar và video", href: "/giai-phap/dich-webinar-va-video/", hint: "Xem nội dung tiếng nước ngoài" },
        { label: "Dịch livestream", href: "/giai-phap/dich-livestream/", hint: "Phụ đề cho live trên máy tính" },
        { label: "Dịch live TikTok", href: "/giai-phap/dich-live-tiktok/", hint: "Xem trên trình duyệt máy tính" },
```

- [ ] **Step 2: `NAV.en`**

Tìm:
```
        { label: "Webinars and videos", href: "/en/solutions/webinar-and-video-translation/", hint: "Follow foreign-language content" },
```
Thay bằng:
```
        { label: "Webinars and videos", href: "/en/solutions/webinar-and-video-translation/", hint: "Follow foreign-language content" },
        { label: "Livestreams", href: "/en/solutions/livestream-translation/", hint: "Translated subtitles for live video" },
        { label: "TikTok Live", href: "/en/solutions/tiktok-live-translation/", hint: "Watch in a desktop browser" },
```

- [ ] **Step 3: `FOOTER.vi` và `FOOTER.en`**

Tìm:
```
        { label: "Webinar và video", href: "/giai-phap/dich-webinar-va-video/" },
```
Thay bằng:
```
        { label: "Webinar và video", href: "/giai-phap/dich-webinar-va-video/" },
        { label: "Dịch livestream", href: "/giai-phap/dich-livestream/" },
        { label: "Dịch live TikTok", href: "/giai-phap/dich-live-tiktok/" },
```
Tìm:
```
        { label: "Webinars and videos", href: "/en/solutions/webinar-and-video-translation/" },
```
Thay bằng:
```
        { label: "Webinars and videos", href: "/en/solutions/webinar-and-video-translation/" },
        { label: "Livestreams", href: "/en/solutions/livestream-translation/" },
        { label: "TikTok Live", href: "/en/solutions/tiktok-live-translation/" },
```

- [ ] **Step 4: Kiểm toàn bộ phần vi, en**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/seo-targets.test.mjs 2>&1 | grep -E '^(✖|ℹ (tests|pass|fail))'`
Expected: không dòng `✖` nào, `ℹ fail 0`. (Ở chế độ `ALLOW_PARTIAL=1` test chỉ kiểm vi và en cho phần menu, trang Giải pháp, liên kết; riêng test nhãn hiệu kiểm cả năm ngôn ngữ và đã đạt từ kế hoạch 01.)

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/site.test.mjs test/layout-i18n.test.mjs test/i18n.test.mjs 2>&1 | grep -E '^(✖|ℹ (tests|pass|fail|skipped))'`
Expected: `ℹ fail 1` (chỉ `đủ trang…`). Lỗi `liên kết nội bộ` ở menu ja/zh/ko không xảy ra vì ta chưa thêm menu ja/zh/ko (kế hoạch 05).

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/site.mjs && \
git commit -m "feat(website): menu Giải pháp và chân trang vi, en dẫn tới trang livestream và live TikTok

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.
