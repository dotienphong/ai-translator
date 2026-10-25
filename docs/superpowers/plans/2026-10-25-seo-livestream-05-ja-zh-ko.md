# SEO từ khóa livestream 05: bản ja, zh, ko

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Có đủ năm ngôn ngữ cho hai trang mới và cho mọi chỗ đã sửa ở kế hoạch 04, để `pnpm test` xanh không cần `ALLOW_PARTIAL`.

**Architecture:** Mỗi ngôn ngữ (ja, zh, ko) độc lập: tạo hai file trang mới từ bản en của kế hoạch 03, rồi lặp lại trên các trang đã có đúng các thay đổi ở kế hoạch 04, rồi thêm menu và chân trang. Ba ngôn ngữ làm song song được (mỗi người một thư mục `src/content/<ngôn ngữ>/`; riêng `src/site.mjs` có phần của cả ba nên **commit lần lượt, không sửa dòng của ngôn ngữ khác**). Bản dịch do Claude viết, chưa có người bản ngữ duyệt (như các trang ja/zh/ko hiện có; README đã ghi).

**Tech Stack:** như trước. Tiền đề: kế hoạch 01–04 xong. `WT=/Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream` (viết đường dẫn đầy đủ khi chạy lệnh). Mọi đường dẫn "Files" tính từ `WT/website/`.

---

## Quy tắc dịch (đọc trước mọi task)

Áp nguyên mục "Quy tắc dịch" của `docs/superpowers/plans/2026-10-22-website-ja-zh-ko-04-noi-dung.md` (cách tạo trang, văn phong, thuật ngữ, thanh toán, hỗ trợ). Bổ sung cho đợt này:

1. **Nguồn dịch là bản en** đã sửa ở kế hoạch 03 và 04, không phải bản vi. Không thêm ý, không bớt ý.
2. **Bỏ `llm` và `llmTitle`** (chỉ vi/en có `llms.txt`). Giữ `schema: [faqPage(FAQ)]`, `type: "article"`, `published: "2026-10-25"`; đặt `modified: "2026-10-25"`; `lang`, `path` (đường dẫn en đổi `/en/` thành `/<ngôn ngữ>/`).
3. **Giữ nguyên:** mọi `id="…"` (`not-a-fit`), số `h2`/`h3`, thứ tự mục, số câu FAQ (6 và 4), tên slug ảnh (`overlay-default`), mọi liên kết (đổi `/en/…` thành `/<ngôn ngữ>/…`), số và điều kiện đo (`0.76–1.03`, `Mac M4 Pro`, `Standard pack` → tên gói model của app ở ngôn ngữ đó, xem cách `<ngôn ngữ>/solutions-webinar.mjs` viết).
4. **Nhãn giao diện của app** (chữ trong `<em>` hay `<strong>` của bản en) dùng đúng chữ của app. Tra bằng: `cd WT && grep -n -E '"(home.start|home.overlay.lock|languages.target|languages.lock|languages.lock.auto|settings.audio.refresh|settings.audio.pause|overlay.latest)"' src/i18n/<ja|zh|ko>.ts`. Khóa: *Start* = `home.start`, *Lock (click-through)* = `home.overlay.lock`, *Translate into* = `languages.target`, *Source language* = `languages.lock`, *Detect automatically* = `languages.lock.auto`, *Refresh list* = `settings.audio.refresh`, *Pause that ends a sentence* = `settings.audio.pause`, *Latest* = `overlay.latest`. Nhãn *Only {app name}* và tên quyền macOS *System Audio Recording*, và đường dẫn *Settings › Audio / Subtitles*: chép nguyên văn từ `src/content/<ngôn ngữ>/solutions-webinar.mjs` và `solutions-meetings.mjs` (đã dịch đúng). Test `nhãn giao diện mà bản en nhắc trong <strong>…` kiểm các nhãn nằm trong `<strong>`.
5. **Test chặn chuỗi từ năm từ Latin liền nhau** (kể cả các tên cách nhau bằng dấu phẩy và dấu cách). Với danh sách nền tảng "TikTok Live, YouTube, Facebook Live": ja và zh phân tách bằng "、" ("TikTok Live、YouTube、Facebook Live"); ko bọc trong `<span lang="en">TikTok Live, YouTube, Facebook Live</span>`. Tên `Zoom`, `Microsoft Teams`, `Google Meet`, `Zalo PC`, `Apple Silicon`, `Windows 10/11` được phép.
6. **Câu sự thật phải còn nguyên nghĩa** (xem kế hoạch 00): chỉ máy tính, không điện thoại; chỉ phụ đề cho người xem; không ghi âm ghi hình; "đã thử với video phát trong trình duyệt" và "chưa thử riêng từng nền tảng livestream" (hai câu riêng); số đo kèm điều kiện. Task 5 kiểm bằng `grep`.
7. **Độ dài:** tiêu đề tối đa 40 ký tự **kể cả** đuôi " | AI Translator" (16 ký tự; bộ dựng tự thêm khi tiêu đề chưa có "AI Translator"), mô tả 50–120 ký tự, không trùng giữa các trang.

## Hằng số theo ngôn ngữ

Dùng đúng các chuỗi này (đã đếm độ dài). Các chuỗi khác do người dịch viết theo quy tắc trên.

**ja**
- `crumbs`: `ホーム` (`/ja/`), `ソリューション` (`/ja/solutions/`), trang livestream `ライブ配信の翻訳` (`/ja/solutions/livestream-translation/`), trang TikTok `TikTok ライブの翻訳` (`/ja/solutions/tiktok-live-translation/`)
- Livestream: `title: "ライブ配信をリアルタイム翻訳字幕で"`, `description: "パソコンで YouTube や TikTok などのライブ配信を見ながら、リアルタイムの翻訳字幕を表示。AI はパソコン上で動き、スマホ版はありません。"`
- TikTok: `title: "TikTok ライブをリアルタイム翻訳"`, `description: "パソコンのブラウザーで TikTok ライブを見ながら翻訳字幕を表示する方法。AI Translator にスマホ版はありません。手順と制限を紹介します。"`
- `overlayShot`: `alt: "原文を上に小さく、その下に日本語訳を表示している AI Translator の字幕バー"`, `caption: "実際の字幕バー：上に小さく原文、下に翻訳。"`
- Chú thích nhãn hiệu: Livestream `TikTok、YouTube、Facebook などの製品名は各所有者に帰属します。AI Translator はこれらの企業と提携していません。`; TikTok `TikTok は各所有者の商標です。AI Translator は TikTok と提携していません。`
- Trang chủ: `title: "ライブ配信と会議のリアルタイム翻訳字幕 | AI Translator"`, `description: "ライブ配信、動画、Zoom・Teams・Meet の会議にリアルタイム翻訳字幕。英語・中国語・日本語・韓国語・ベトナム語に対応。AI はパソコン上で動き、クラウドは使いません。"`
- Giải pháp: `title: "会議・ライブ配信・動画のための AI Translator"`, eyebrow nghĩa "Các cách dùng chính"
- Menu: nhãn `ライブ配信` (gợi ý `ライブ映像に翻訳字幕`), `TikTok ライブ` (gợi ý `パソコンのブラウザーで視聴`)

**zh**
- `crumbs`: `首页` (`/zh/`), `解决方案` (`/zh/solutions/`), `直播翻译` (`/zh/solutions/livestream-translation/`), `TikTok 直播翻译` (`/zh/solutions/tiktok-live-translation/`)
- Livestream: `title: "直播实时翻译字幕（电脑端）"`, `description: "在电脑上观看 YouTube、TikTok 等直播时显示实时翻译字幕。AI 在你的电脑上运行；没有手机版，也不能为主播的观众翻译。"`
- TikTok: `title: "TikTok 直播实时翻译（电脑端）"`, `description: "在电脑浏览器中观看 TikTok 直播时显示翻译字幕的方法。AI Translator 没有手机版；介绍步骤与限制。"`
- `overlayShot`: `alt: "AI Translator 字幕条：原文以小字显示在上方，下方是中文译文"`, `caption: "真实的字幕条：上方是小字原文，下方是译文。"`
- Chú thích nhãn hiệu: Livestream `TikTok、YouTube、Facebook 等产品名称归各自所有者所有；AI Translator 与它们没有关联。`; TikTok `TikTok 是其各自所有者的商标；AI Translator 与 TikTok 没有关联。`
- Trang chủ: `title: "直播与会议实时翻译字幕，离线运行 | AI Translator"`, `description: "为直播、视频和 Zoom、Teams、Meet 会议提供实时翻译字幕，支持英语、中文、日语、韩语、越南语。AI 在你的电脑上运行，不经过云端。"`
- Giải pháp: `title: "解决方案：会议、直播和视频翻译字幕"`
- Menu: nhãn `直播` (gợi ý `为直播画面显示翻译字幕`), `TikTok 直播` (gợi ý `在电脑浏览器中观看`)

**ko**
- `crumbs`: `홈` (`/ko/`), `솔루션` (`/ko/solutions/`), `라이브 방송 번역` (`/ko/solutions/livestream-translation/`), `TikTok 라이브 번역` (`/ko/solutions/tiktok-live-translation/`)
- Livestream: `title: "라이브 방송 실시간 번역 자막"`, `description: "컴퓨터에서 YouTube, TikTok 등의 라이브 방송을 보며 실시간 번역 자막을 표시합니다. AI가 내 컴퓨터에서 실행되며 휴대폰 버전은 없습니다."`
- TikTok: `title: "TikTok 라이브 실시간 번역"`, `description: "컴퓨터 브라우저에서 TikTok 라이브를 보며 번역 자막을 표시하는 방법. AI Translator에는 휴대폰 버전이 없습니다. 방법과 제한을 안내합니다."`
- `overlayShot`: `alt: "원문을 위에 작은 글씨로, 그 아래 한국어 번역을 보여 주는 AI Translator 자막 바"`, `caption: "실제 자막 바: 위에는 작은 원문, 아래에는 번역."`
- Chú thích nhãn hiệu: Livestream `TikTok, YouTube, Facebook 및 기타 제품 이름은 각 소유자의 자산이며, AI Translator는 이들과 제휴 관계가 없습니다.`; TikTok `TikTok은 해당 소유자의 상표이며, AI Translator는 TikTok과 제휴 관계가 없습니다.`
- Trang chủ: `title: "라이브·회의 실시간 번역 자막, 오프라인 | AI Translator"`, `description: "라이브 방송, 동영상, Zoom·Teams·Meet 회의에 실시간 번역 자막. 영어·중국어·일본어·한국어·베트남어 지원. AI가 내 컴퓨터에서 실행되며 클라우드를 쓰지 않습니다."`
- Giải pháp: `title: "솔루션: 회의·라이브·동영상 번역 자막"`
- Menu: nhãn `라이브 방송` (gợi ý `라이브 영상에 번역 자막`), `TikTok 라이브` (gợi ý `컴퓨터 브라우저에서 시청`)

---

### Task 1: Chuẩn bị thuật ngữ

**Files:** không sửa mã.

- [ ] **Step 1: In bảng nhãn app cho hai trang mới (cần `ALLOW_PARTIAL=1` vì ja/zh/ko còn thiếu trang)**

Run:
```bash
G=$(mktemp -d) && cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && \
for l in ja zh ko; do ALLOW_PARTIAL=1 node tools/i18n/glossary.mjs $l > "$G/$l.md"; done && \
for l in ja zh ko; do echo "=== $l"; awk '/^## solutions-(livestream|tiktok-live)$/{p=1} /^## /&&!/^## solutions-(livestream|tiktok-live)$/{p=0} p' "$G/$l.md"; done
```
Expected (đã chạy thử 2026-10-25): với mỗi ngôn ngữ, bảng `## solutions-livestream` có hai dòng và bảng `## solutions-tiktok-live` có một dòng:

| en | ja | zh | ko | khóa |
|---|---|---|---|---|
| Start (cả hai trang) | 開始 | 开始 | 시작 | `home.start` |
| Pause that ends a sentence (chỉ trang livestream) | 文を区切る間の長さ | 结束一句话的停顿 | 문장을 끝내는 정지 시간 | `settings.audio.pause` |

Hai nhãn này nằm trong `<strong>` của bản en, nên test `nhãn giao diện mà bản en nhắc trong <strong>…` đòi bản ja/zh/ko chứa **đúng** các chữ trên (cho cả hai nhãn ở trang livestream, và nhãn `Start` ở trang TikTok). Giữ bảng để dùng ở các task sau.

---

### Task 2: Tiếng Nhật (ja)

**Files:**
- Create: `src/content/ja/solutions-livestream.mjs`, `src/content/ja/solutions-tiktok-live.mjs`
- Modify: `src/content/ja/home.mjs`, `solutions.mjs`, `solutions-webinar.mjs`, `features.mjs`, `faq.mjs`
- Modify: `src/site.mjs` (chỉ các dòng `ja`)

- [ ] **Step 1: Tạo hai trang mới**

Với mỗi trang, mở bản en (`src/content/en/solutions-livestream.mjs`, `solutions-tiktok-live.mjs`), tạo file cùng tên trong `src/content/ja/`, rồi áp: cùng `import` (đường dẫn giữ nguyên), `crumbs`, `title`, `description`, `overlayShot`, chú thích nhãn hiệu theo "Hằng số ja"; dịch mọi chữ khác (hằng `FAQ`, `pageHero`, `facts`, `feature`, `checkList`, `steps`, `callout`, `linkCard`, `ctaBand`, `eyebrow`, `h2`) theo "Quy tắc dịch"; đổi `lang: "ja"`, `path`, `/en/` trong liên kết thành `/ja/`; đổi `lang: "en"` của `overlayShot` thành `lang: "ja"`; bỏ `llm`, `llmTitle`. Giữ `schema: [faqPage(FAQ)]`, `type`, `published`, `breadcrumbs: crumbs`.

- [ ] **Step 2: Lặp lại các thay đổi của kế hoạch 04 trên năm trang ja đã có**

Mỗi thay đổi dưới đây phản chiếu một thay đổi en ở kế hoạch 04 (đọc đoạn en tương ứng làm nguồn dịch):
1. `home.mjs`: `title`, `description` (hằng số ja); `modified: "2026-10-25"`; câu dẫn hero thêm "livestream xem trên máy tính" vào danh sách ứng dụng (bản ja không cần cụm "AI live translator"); thêm một gạch đầu dòng sau dòng có `/ja/features/#microphone` trong mục `id="meeting-translation"`, có liên kết `/ja/solutions/livestream-translation/`; thêm một mục `HOME_FAQ` ngay trước mục có `q: "会議の音声はどこかに送信されますか？"`, bản dịch của câu hỏi đáp en "Can I translate a livestream into my language?" kèm liên kết `/ja/solutions/livestream-translation/`.
2. `solutions.mjs`: `title`, `modified`, `description` (dịch bản en mới), câu dẫn (nhắc livestream), eyebrow "Các cách dùng chính", thêm hai `linkCard` (livestream với `icon: "video"`, TikTok với `icon: "laptop"` (bản en dùng laptop để khác thẻ Webinar), liên kết `/ja/solutions/livestream-translation/` và `/ja/solutions/tiktok-live-translation/`) ngay sau thẻ có `href: "/ja/solutions/webinar-and-video-translation/"`, thêm một dòng vào bảng "Chọn nhanh" ngay trước dòng webinar.
3. `solutions-webinar.mjs`: `modified`; thêm vào cuối đoạn `<p>` thứ nhất của mục "không cần cài thêm" (mục `section-alt` thứ hai trong file, đoạn nói "đã thử với video trên trình duyệt, chưa thử riêng từng nền tảng khóa học hay webinar") hai câu dịch từ bản en: "AI Translator works as a real-time video translator …" và "For live video, see …" kèm liên kết `/ja/solutions/livestream-translation/`.
4. `features.mjs`: `modified`; câu "Because the app captures system audio…" thêm "livestreams you watch on a computer" kèm liên kết `/ja/solutions/livestream-translation/`.
5. `faq.mjs`: `modified`; ba mục Q&A mới ngay trước mục `q: "Zoom、Teams、Google Meet、Zalo で使えますか？"`, dịch từ ba mục en của Task 4 kế hoạch 04, mục đầu có hai liên kết `/ja/solutions/livestream-translation/` và `/ja/solutions/tiktok-live-translation/`.

- [ ] **Step 2b: Menu và chân trang ja**

Trong `src/site.mjs`, Edit:

Tìm:
```
        { label: "ウェビナーと動画", href: "/ja/solutions/webinar-and-video-translation/", hint: "外国語のコンテンツを理解する" },
```
Thay bằng:
```
        { label: "ウェビナーと動画", href: "/ja/solutions/webinar-and-video-translation/", hint: "外国語のコンテンツを理解する" },
        { label: "ライブ配信", href: "/ja/solutions/livestream-translation/", hint: "ライブ映像に翻訳字幕" },
        { label: "TikTok ライブ", href: "/ja/solutions/tiktok-live-translation/", hint: "パソコンのブラウザーで視聴" },
```
Tìm: `{ label: "ウェビナーと動画", href: "/ja/solutions/webinar-and-video-translation/" }] },`
Thay bằng: `{ label: "ウェビナーと動画", href: "/ja/solutions/webinar-and-video-translation/" }, { label: "ライブ配信", href: "/ja/solutions/livestream-translation/" }, { label: "TikTok ライブ", href: "/ja/solutions/tiktok-live-translation/" }] },`

- [ ] **Step 3: Kiểm riêng ja**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/i18n-content.test.mjs test/site.test.mjs 2>&1 | grep -E '/ja/'`
Expected: không in gì (mọi thông báo lỗi chi tiết đều ghi đường dẫn trang, ví dụ `'/ja/download/: …'`). Lỗi của `/zh/`, `/ko/` (và `đủ trang…`) còn là bình thường ở bước này. Lỗi hay gặp: title/description ngoài giới hạn CJK, số h2/h3 lệch bản en, liên kết lệch bản en (kiểm `thừa`/`thiếu` trong thông báo), "sót câu tiếng Anh" (chuỗi Latin ≥ 5 từ), "thiếu nhãn" (nhãn trong `<strong>` chưa đúng chữ app), `liên kết hỏng`.

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/content/ja website/src/site.mjs && \
git commit -m "feat(website): bản tiếng Nhật của trang dịch livestream, dịch live TikTok và các chỗ đã sửa

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

---

### Task 3: Tiếng Trung giản thể (zh)

Làm đúng như Task 2 với thay đổi sau; mọi `ja` đọc thành `zh`, dùng "Hằng số zh".

**Files:** như Task 2 với thư mục `src/content/zh/` và các dòng `zh` của `src/site.mjs`.

- [ ] **Step 1: Tạo hai trang mới** như Task 2 Step 1 (nguồn là bản en, đích `src/content/zh/`, `lang: "zh"`, `/en/` → `/zh/`).

- [ ] **Step 2: Lặp lại các thay đổi của kế hoạch 04 trên năm trang zh**, như Task 2 Step 2. Điểm neo trong zh: mục `HOME_FAQ` mới chèn trước `q: "我的会议音频会被发送到别处吗？"`; mục hỏi đáp mới ở `faq.mjs` chèn trước `q: "可以用于 Zoom、Teams、Google Meet 和 Zalo 吗？"`; gạch đầu dòng mới ở trang chủ chèn sau dòng có `/zh/features/#microphone`; thẻ mới ở `solutions.mjs` chèn sau thẻ có `href: "/zh/solutions/webinar-and-video-translation/"`.

- [ ] **Step 2b: Menu và chân trang zh**

Tìm:
```
        { label: "网络研讨会和视频", href: "/zh/solutions/webinar-and-video-translation/", hint: "看懂外语内容" },
```
Thay bằng:
```
        { label: "网络研讨会和视频", href: "/zh/solutions/webinar-and-video-translation/", hint: "看懂外语内容" },
        { label: "直播", href: "/zh/solutions/livestream-translation/", hint: "为直播画面显示翻译字幕" },
        { label: "TikTok 直播", href: "/zh/solutions/tiktok-live-translation/", hint: "在电脑浏览器中观看" },
```
Tìm: `{ label: "网络研讨会和视频", href: "/zh/solutions/webinar-and-video-translation/" }] },`
Thay bằng: `{ label: "网络研讨会和视频", href: "/zh/solutions/webinar-and-video-translation/" }, { label: "直播", href: "/zh/solutions/livestream-translation/" }, { label: "TikTok 直播", href: "/zh/solutions/tiktok-live-translation/" }] },`

- [ ] **Step 3: Kiểm riêng zh**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/i18n-content.test.mjs test/site.test.mjs 2>&1 | grep -E '/zh/'`
Expected: không in gì.

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/content/zh website/src/site.mjs && \
git commit -m "feat(website): bản tiếng Trung của trang dịch livestream, dịch live TikTok và các chỗ đã sửa

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

---

### Task 4: Tiếng Hàn (ko)

Làm đúng như Task 2 với "Hằng số ko"; mọi `ja` đọc thành `ko`.

**Files:** như Task 2 với thư mục `src/content/ko/` và các dòng `ko` của `src/site.mjs`.

- [ ] **Step 1: Tạo hai trang mới** như Task 2 Step 1 (đích `src/content/ko/`, `lang: "ko"`, `/en/` → `/ko/`). Nhớ bọc "TikTok Live, YouTube, Facebook Live" trong `<span lang="en">…</span>`.

- [ ] **Step 2: Lặp lại các thay đổi của kế hoạch 04 trên năm trang ko**, như Task 2 Step 2. Điểm neo trong ko: mục `HOME_FAQ` mới chèn trước `q: "회의 음성이 어딘가로 전송되나요?"`; mục hỏi đáp mới ở `faq.mjs` chèn trước `q: "Zoom, Teams, Google Meet, Zalo에서 쓸 수 있나요?"`; gạch đầu dòng mới ở trang chủ chèn sau dòng có `/ko/features/#microphone`; thẻ mới ở `solutions.mjs` chèn sau thẻ có `href: "/ko/solutions/webinar-and-video-translation/"`.

- [ ] **Step 2b: Menu và chân trang ko**

Tìm:
```
        { label: "웨비나와 동영상", href: "/ko/solutions/webinar-and-video-translation/", hint: "외국어 콘텐츠 이해하기" },
```
Thay bằng:
```
        { label: "웨비나와 동영상", href: "/ko/solutions/webinar-and-video-translation/", hint: "외국어 콘텐츠 이해하기" },
        { label: "라이브 방송", href: "/ko/solutions/livestream-translation/", hint: "라이브 영상에 번역 자막" },
        { label: "TikTok 라이브", href: "/ko/solutions/tiktok-live-translation/", hint: "컴퓨터 브라우저에서 시청" },
```
Tìm: `{ label: "웨비나와 동영상", href: "/ko/solutions/webinar-and-video-translation/" }] },`
Thay bằng: `{ label: "웨비나와 동영상", href: "/ko/solutions/webinar-and-video-translation/" }, { label: "라이브 방송", href: "/ko/solutions/livestream-translation/" }, { label: "TikTok 라이브", href: "/ko/solutions/tiktok-live-translation/" }] },`

- [ ] **Step 3: Kiểm riêng ko**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/i18n-content.test.mjs test/site.test.mjs 2>&1 | grep -E '/ko/'`
Expected: không in gì.

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/content/ko website/src/site.mjs && \
git commit -m "feat(website): bản tiếng Hàn của trang dịch livestream, dịch live TikTok và các chỗ đã sửa

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

---

### Task 5: Chạy đủ test và đọc lại câu sự thật ở ba ngôn ngữ

**Files:** không sửa mã (sửa nếu test hay đọc lại phát hiện lỗi).

- [ ] **Step 1: Chạy toàn bộ test, không đặt biến nào**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && pnpm test 2>&1 | tail -n 14`
Expected: `ℹ fail 0`, `ℹ skipped 6` (cùng sáu test bỏ qua như mốc), `ℹ tests` lớn hơn 245 (khoảng 245 cộng số test của `seo-targets.test.mjs`). Nếu có `✖`, đọc thông báo và sửa file ngôn ngữ liên quan; không nới test.

- [ ] **Step 2: Đọc lại các câu sự thật của hai trang mới ở ja, zh, ko**

Run (mỗi lệnh phải in ít nhất một dòng cho mỗi trang):
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website/src/content && \
for f in solutions-livestream solutions-tiktok-live; do \
  echo "### ja $f"; grep -c -E 'スマホ|スマートフォン|携帯' ja/$f.mjs; grep -c -E '配信者|配信する側|配信している側' ja/$f.mjs; grep -c -E '録音|録画' ja/$f.mjs; grep -c -E 'テストしていません|試していません|確認していません' ja/$f.mjs; \
  echo "### zh $f"; grep -c -E '手机' zh/$f.mjs; grep -c -E '主播|直播者' zh/$f.mjs; grep -c -E '录音|录制|录像' zh/$f.mjs; grep -c -E '没有测试|未测试|尚未测试|没有单独测试' zh/$f.mjs; \
  echo "### ko $f"; grep -c -E '휴대폰|스마트폰' ko/$f.mjs; grep -c -E '방송하는|방송자|스트리머' ko/$f.mjs; grep -c -E '녹음|녹화' ko/$f.mjs; grep -c -E '테스트하지 않았|시험하지 않았|확인하지 않았' ko/$f.mjs; \
done
```
Expected: mọi số in ra lớn hơn 0 (bốn số cho mỗi ngôn ngữ và mỗi trang: điện thoại, người phát live, ghi âm hay ghi hình, chưa thử). Số 0 nghĩa là câu sự thật đó bị rớt hoặc viết bằng chữ khác với mẫu `grep`: mở file đọc, nếu câu có mà dùng từ khác thì kiểm nghĩa và coi là đạt, nếu câu thiếu thì thêm.

- [ ] **Step 3: Kiểm hai điểm mà test không bắt được ở ja/zh/ko**

1. Không file nào trong `src/content/{ja,zh,ko}/solutions-livestream.mjs` hay `solutions-tiktok-live.mjs` nói rằng đã thử TikTok, YouTube hay Facebook. Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website/src/content && grep -n -E '(TikTok|YouTube|Facebook).{0,40}(テスト済み|試しました|测试过|试过|已测试|테스트했|시험했)|(テスト済み|試しました|测试过|试过|已测试|테스트했|시험했).{0,40}(TikTok|YouTube|Facebook)' ja/solutions-*.mjs zh/solutions-*.mjs ko/solutions-*.mjs`
   Expected: không in gì.
2. Số đo không kèm tên công nghệ lõi: đã có test `không lộ công nghệ lõi` trong Step 1.

- [ ] **Step 4: Commit nếu Step 1–3 phải sửa gì**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && git status --short
```
Nếu có thay đổi: `git add website/src/content website/src/site.mjs && git commit -m "fix(website): chỉnh bản ja/zh/ko của trang livestream sau kiểm tra

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`. Nếu không có thay đổi thì bỏ qua.
