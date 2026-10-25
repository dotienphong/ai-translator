# SEO từ khóa livestream: tổng quan kế hoạch

> Ghi chú (sau V1): hằng LIVE_TESTED đã được thay bằng V1_TESTED = ["YouTube"] (xem commit b8f3c714 và website/README.md mục "SEO từ khóa"); các đoạn nhắc LIVE_TESTED bên dưới là lịch sử.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Đọc file này trước, rồi làm tuần tự các kế hoạch 01 → 06.

**Goal:** Website `aitranslator.vn` có trang đích đúng ý định cho 17 cụm từ khóa về dịch livestream, dịch live, dịch thời gian thực và dịch họp (năm ngôn ngữ), nói đúng sự thật về giới hạn của app, và có test giữ các cụm đó ở đúng trang.

**Architecture:** Hai trang giải pháp mới (`solutions-livestream`, `solutions-tiktok-live`) đi qua bộ sinh tĩnh sẵn có (`src/content/<ngôn ngữ>/<id>.mjs`, danh mục `src/content/index.mjs`, test cấu trúc sẵn có). Sửa title/description/lead của trang chủ, trang họp (chỉ en), trang webinar và video, trang Giải pháp, Tính năng, Hỏi đáp. Một file test mới `test/seo-targets.test.mjs` giữ bảng "cụm → trang đích → chỗ phải có". Không đụng app, server, giá.

**Tech Stack:** Node ≥ 24.21 (bộ sinh Node thuần, không framework), `node:test`, pnpm 12.6. Không thêm thư viện.

Spec: `docs/superpowers/specs/2026-10-25-seo-livestream-tu-khoa-design.md` (đã duyệt 2026-10-25). Đọc spec trước. Đọc thêm `website/README.md` (mục Quy tắc, Năm ngôn ngữ) và `CLAUDE.md`.

---

## Các kế hoạch và thứ tự

| # | File | Làm gì | Kết quả |
|---|---|---|---|
| 00 | file này | Quy ước chung, bản đồ file, Task 0 (worktree) | Nhánh `seo-livestream` sạch, mốc test đã đo |
| 01 | `…-01-ha-tang-va-test.md` | `test/seo-targets.test.mjs` (đỏ), đăng ký hai id mới, nhóm ảnh OG, câu nhãn hiệu năm ngôn ngữ | Test mới đỏ vì còn thiếu trang; nhãn hiệu đạt |
| 02 | `…-02-trang-vi.md` | Hai trang mới bản tiếng Việt | Test của trang vi đạt (chạy với `ALLOW_PARTIAL=1`) |
| 03 | `…-03-trang-en.md` | Hai trang mới bản tiếng Anh | Test của trang en đạt |
| 04 | `…-04-trang-co-san.md` | Sửa Trang chủ, Giải pháp, Webinar và video, Tính năng, Hỏi đáp (vi, en), trang họp (chỉ en); menu và chân trang vi, en | Mọi test vi/en của `seo-targets` đạt |
| 05 | `…-05-ja-zh-ko.md` | Dịch hai trang mới và mọi chỗ đã sửa ở 04 sang ja, zh, ko; menu và chân trang ja, zh, ko | `pnpm test` xanh không cần `ALLOW_PARTIAL` |
| 06 | `…-06-kiem-tra-va-ban-giao.md` | V1 (thử với livestream thật, cần chủ dự án), README, bảng theo dõi, chạy đủ test, ảnh kiểm tay, bàn giao | Sẵn sàng để chủ dự án duyệt và `pnpm deploy` |

## Quy ước bắt buộc

- **Không merge, không push, không deploy, không đẩy tag** khi chưa được chủ dự án cho phép (theo CLAUDE.md và các đợt trước). Kế hoạch này dừng ở "sẵn sàng deploy".
- **Làm trong worktree** `/Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream`, nhánh `seo-livestream` (Task 0). Thư mục chính `/Users/dtphong/Desktop/software_business/ai-translator` giữ ở `main`, không sửa file ở đó (kể cả khi phiên khác đang dùng).
- **Mọi lệnh bash đều bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`.** Shell không giữ thư mục làm việc giữa các lệnh; quên một lần là chạy nhầm vào thư mục chính. Chạy hai lệnh bash song song cũng có thể chồng nhau: không song song hóa các lệnh có `cd`.
- **Chạy test:** trong `website/`, `pnpm test` đúng như script, **không đặt `WEBSITE_DIST`** cho cả lượt chạy. `site.test.mjs` dựng vào `dist/`, còn `i18n-content.test.mjs` và `seo-targets.test.mjs` tự dựng vào thư mục tạm riêng; đặt `WEBSITE_DIST` chung cho mọi file thì các tiến trình dựng đè lên nhau và ba test i18n đỏ giả ("0 h2", "thiếu nhãn"). Chạy riêng một file: `cd <worktree>/website && node --test test/<tên>.test.mjs`.
- **`ALLOW_PARTIAL=1`** (README): cho phép thiếu trang ja/zh/ko khi đang viết dở. Dùng ở kế hoạch 02–04: `cd <worktree>/website && ALLOW_PARTIAL=1 pnpm test`. Các commit trung gian ở 02–04 chỉ xanh với biến này; kế hoạch 05 làm cho `pnpm test` xanh không cần biến.
- **Mốc test trước khi sửa** (đo 2026-10-25 trên `main` 2328cb3a): `ℹ tests 245`, `ℹ pass 239`, `ℹ fail 0`, `ℹ skipped 6`, khoảng 115 giây. Mốc sau cùng ở kế hoạch 06 phải là 0 lỗi; số test tăng thêm do `seo-targets.test.mjs`.
- **Commit:** tiếng Việt, tiền tố `feat(website):`, `test(website):`, `docs(website):`; cuối thông điệp có dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Một commit cho mỗi task.
- **Luật nội dung của repo** (CLAUDE.md, README): chỉ nói điều có thật; số đo kèm điều kiện đo; **không nêu tên model, engine, thư viện, khung app, ngôn ngữ lập trình, kiến trúc**. Đặc biệt trong bản en **không dùng các chữ** `engine`/`engines` (kể cả "search engine"), `metal`, `rust`, `quantization`; bản vi/en không dùng chữ `beta`. Test `không lộ công nghệ lõi` chặn các chữ này.
- **Sửa nội dung một trang thì sửa đủ năm ngôn ngữ** (README), trừ trang họp mà spec chỉ định chỉ en.

## Sự thật được phép nói (dùng cho mọi trang mới; đã đối chiếu với các trang sẵn có)

| Điều | Nói được | Nguồn trong repo |
|---|---|---|
| Cơ chế | App thu âm thanh đang phát trên máy tính nên chạy với mọi trang web/app phát tiếng, không cần tiện ích hay tài khoản nền tảng | `vi/features.mjs` mục Nguồn âm thanh; `vi/solutions-webinar.mjs` |
| macOS | Nghe cả hệ thống, hoặc chỉ một app (chọn trình duyệt; các tab khác của trình duyệt đó vẫn được nghe); danh sách chỉ có app đang phát tiếng, bấm *Làm mới danh sách* | `vi/solutions-meetings.mjs` bước "Chỉ nghe Zoom" |
| Windows | Thiết bị phát mặc định hoặc thiết bị chọn; chưa chọn được từng app | `vi/features.mjs`, `vi/solutions-webinar.mjs` |
| Ngôn ngữ | Năm ngôn ngữ; chỉ các chiều có tiếng Việt đã đo chất lượng dịch | `vi/solutions-webinar.mjs` |
| Độ trễ | Trung vị 0,76–1,03 giây, Mac M4 Pro, gói model Chuẩn; máy yếu hơn chậm hơn; Windows mới đo sơ bộ trên một laptop GPU tích hợp, chậm hơn | `vi/features.mjs` mục Hiệu năng |
| Riêng tư | Âm thanh chỉ ở RAM, không ghi đĩa, không gửi đi; dịch không cần internet | `vi/home.mjs` |
| Hạn mức | Free 10 ngày × 30 phút mỗi ngày; Monthly 50 giờ/30 ngày, 6 Months 100 giờ/30 ngày, Yearly không giới hạn; im lặng không tính | `vi/solutions-webinar.mjs` |
| Đã thử | "Đã thử với video phát trong trình duyệt" (Chrome, Safari, Edge) và **thử một lần với YouTube Live** trên Chrome, macOS (25/10/2026): phụ đề hiện ra, kể cả khi chỉ nghe Chrome. **TikTok LIVE**: chỉ có kết quả của một buổi live tiếng Việt có nhạc nền; app thu được tiếng nhưng nhận nhầm ngôn ngữ và lặp lại câu không ai nói nên phụ đề không dùng được (không khẳng định nguyên nhân là nhạc, không nói "đã thử TikTok"). **Chưa** thử Facebook Live. Không đưa số thời gian xử lý trong log lên website (V1 xong 25/10/2026) | `vi/faq.mjs`, `docs/release/seo-theo-doi.md` mục 3 |
| Giới hạn | Chỉ macOS và Windows, không điện thoại; chỉ phụ đề cho người xem, không dịch live của người phát; không ghi âm/ghi hình, không xử lý file video; bản dịch có thể sai; nhạc nền lớn, tiếng ồn, nhiều người nói chồng làm kém đi | spec mục 4 |

Cách viết câu "đã thử" (test `STALE_LIVE` ở kế hoạch 01 bắt sai): **luôn hai câu riêng**, ví dụ "Chúng tôi đã thử với video phát trong trình duyệt. Chúng tôi chưa thử Facebook Live." Đừng nối thành một câu có chữ TikTok hay Facebook sau "đã thử" (YouTube được, vì đã đạt V1).

## Bản đồ file

Tạo mới (mỗi id × năm ngôn ngữ = 10 file nội dung):
- `website/src/content/{vi,en,ja,zh,ko}/solutions-livestream.mjs`
- `website/src/content/{vi,en,ja,zh,ko}/solutions-tiktok-live.mjs`
- `website/test/seo-targets.test.mjs`
- `docs/release/seo-theo-doi.md` (bảng theo dõi thứ hạng và kết quả V1)

Sửa:
- `website/src/content/index.mjs` (IDS, FILE)
- `website/src/site.mjs` (OG_GROUP, `T[lang].trademark`, `NAV`, `FOOTER`: năm ngôn ngữ)
- `website/src/content/{vi,en,ja,zh,ko}/home.mjs`, `solutions.mjs`, `features.mjs`, `faq.mjs`, `solutions-webinar.mjs`
- `website/src/content/en/solutions-meetings.mjs`
- `website/README.md` (mục SEO từ khóa)

Không sửa: `src/build/*`, `src/assets/*`, `src/plans.mjs`, app, server, `docs/legal/*`.

## Đã chạy thử kế hoạch (2026-10-25)

Mã và các cặp Tìm / Thay bằng của kế hoạch 01–04 đã được trích tự động từ chính các file kế hoạch và áp vào một bản sao tạm của `main` 2328cb3a (không phải nhánh thật): mọi 62 chỗ sửa áp được (mỗi chuỗi "Tìm" khớp đúng một lần), `node --test test/seo-targets.test.mjs` với `ALLOW_PARTIAL=1` cho **37/37 đạt**, và `site.test.mjs`, `layout-i18n.test.mjs`, `i18n.test.mjs` với `ALLOW_PARTIAL=1` cho 108/109 đạt, **chỉ** `đủ trang (không thiếu module nào)` đỏ như kế hoạch dự báo. Kế hoạch 05 (bản dịch ja/zh/ko) chưa chạy thử vì cần dịch; lệnh in nhãn app của nó đã chạy đúng. Nếu khi thực thi gặp lỗi khác, nhiều khả năng do `main` đã đổi sau mốc trên: đọc thông báo, đừng nới test.

## Task 0: Dựng worktree và đo mốc

**Files:** không sửa mã. Chuyển các file tài liệu chưa commit từ thư mục chính sang worktree.

- [ ] **Step 1: Kiểm thư mục chính chỉ có file tài liệu chưa commit**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short`
Expected: `main`, rồi đúng các dòng `?? docs/superpowers/specs/2026-10-25-seo-livestream-tu-khoa-design.md` và `?? docs/superpowers/plans/2026-10-25-seo-livestream-0*.md` (bảy file kế hoạch 00–06). Nếu có file khác bị sửa, dừng và hỏi chủ dự án.

- [ ] **Step 2: Tạo worktree và nhánh**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git worktree add /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream -b seo-livestream main`
Expected: `Preparing worktree (new branch 'seo-livestream')` và `HEAD is now at 2328cb3a …` (hoặc commit mới hơn của `main`).

- [ ] **Step 3: Chuyển spec và kế hoạch sang worktree (move, không copy, để `main` không còn file chưa theo dõi gây xung đột khi gộp sau này)**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && \
mv docs/superpowers/specs/2026-10-25-seo-livestream-tu-khoa-design.md /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/docs/superpowers/specs/ && \
mv docs/superpowers/plans/2026-10-25-seo-livestream-0*.md /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/docs/superpowers/plans/ && \
git status --short
```
Expected: dòng cuối không in gì (thư mục chính sạch).

- [ ] **Step 4: Cài phụ thuộc của website trong worktree**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && pnpm install --frozen-lockfile`
Expected: kết thúc không lỗi (`Done in …`). Nếu test ở Step 5 báo thiếu module ở thư mục gốc repo, chạy thêm `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && pnpm install --frozen-lockfile`.

- [ ] **Step 5: Đo mốc test trong worktree**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && pnpm test 2>&1 | tail -n 12`
Expected: `ℹ tests 245`, `ℹ pass 239`, `ℹ fail 0`, `ℹ skipped 6`. Nếu khác, ghi số thật vào đầu kế hoạch 06 (mục "Mốc") rồi tiếp tục chỉ khi `fail 0`.

- [ ] **Step 6: Commit spec và kế hoạch lên nhánh**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add docs/superpowers/specs/2026-10-25-seo-livestream-tu-khoa-design.md docs/superpowers/plans/2026-10-25-seo-livestream-0*.md && \
git commit -m "docs(website): spec và kế hoạch SEO từ khóa livestream, dịch live, dịch thời gian thực

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && \
git log --oneline -1
```
Expected: `seo-livestream`, rồi một dòng commit mới.
