# SEO từ khóa livestream 06: README, bảng theo dõi, V1, kiểm tra cuối và bàn giao

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghi cách giữ SEO từ khóa vào README, tạo bảng theo dõi thứ hạng và kết quả V1, thử (nếu chủ dự án cho phép) app với livestream thật để biết có được nói "đã thử" không, kiểm giao diện bằng ảnh, chạy đủ test và bàn giao cho chủ dự án duyệt và deploy.

**Architecture:** Không đổi mã chạy. README và `docs/release/seo-theo-doi.md` là tài liệu. V1 là việc thủ công cần chủ dự án (dùng loa và máy của họ). Tiền đề: kế hoạch 01–05 xong và `pnpm test` xanh. `WT=/Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream` (viết đường dẫn đầy đủ khi chạy lệnh).

**Tech Stack:** Markdown; `tools/browser/cdp.mjs` để chụp ảnh kiểm (cần Google Chrome).

---

### Task 1: README của website

**Files:**
- Modify: `WT/website/README.md`

- [ ] **Step 1: Thêm mục "SEO từ khóa" ngay trước mục "## Trang Tải xuống: tab hệ điều hành"**

Dùng Edit. Tìm đúng dòng:
```
## Trang Tải xuống: tab hệ điều hành
```
Thay bằng:
```
## SEO từ khóa: dịch livestream, dịch live, dịch thời gian thực
Spec `docs/superpowers/specs/2026-10-25-seo-livestream-tu-khoa-design.md`. Hai trang giải pháp riêng (`solutions-livestream`, `solutions-tiktok-live`, năm ngôn ngữ) nhắm các cụm tiếng Việt về dịch livestream và dịch live; Trang chủ và trang họp bản en nhắm các cụm tiếng Anh về dịch thời gian thực và dịch họp.
- `test/seo-targets.test.mjs` giữ bảng `SEO_TARGETS` (cụm → trang đích → chỗ phải có: title, H1, H2, mô tả hay thân trang). **Sửa title, H1, mô tả hay câu dẫn của các trang đích thì chạy test này**; mất cụm thì test đỏ. Thêm cụm mới thì thêm một dòng vào `SEO_TARGETS` (và vào `REQUESTED` nếu chủ dự án yêu cầu nguyên văn). Test tự dựng vào thư mục tạm riêng: đừng đặt `WEBSITE_DIST` chung cho cả lượt `pnpm test`, các tiến trình dựng sẽ đè nhau và ba test i18n đỏ giả.
- **Không nói đã thử TikTok, YouTube hay Facebook Live** chừng nào chưa có kết quả V1 (`docs/release/seo-theo-doi.md`): trang chỉ nói "đã thử với video phát trong trình duyệt" và "chưa thử riêng từng nền tảng livestream", **luôn là hai câu riêng**. Test `STALE_LIVE` (hằng `LIVE_TESTED` đang `false`) quét title, mô tả, thân trang và JSON-LD của mọi trang năm ngôn ngữ, bắt cả câu nối bằng dấu phẩy ("đã thử …, nhưng chưa thử riêng TikTok") và các cách nói như "kiểm thử", "chạy tốt với", "tested on"; câu về người phát live chưa tự động chặn được, chỉ có câu bắt buộc ở `NEEDS` bảo vệ hai trang mới (và kiểm bằng mắt khi sửa trang). Có kết quả V1 đạt thì đổi `LIVE_TESTED` thành `true` (test quét khi đó hiện là bỏ qua), viết lại các câu "chưa thử" ở năm ngôn ngữ kèm ngày và điều kiện, và đổi các câu bắt buộc ở bảng `NEEDS` của test.
- Giới hạn phải còn nguyên ở hai trang này (bảng `NEEDS` kiểm): chỉ máy tính, không điện thoại; chỉ phụ đề cho người xem, không dịch live của người phát; không ghi âm hay ghi hình; số độ trễ kèm điều kiện đo.
- Trang chủ, Tính năng, Hỏi đáp, Webinar và video, trang Giải pháp, menu Giải pháp và chân trang đều dẫn tới trang dịch livestream (test kiểm). Câu `trademark` ở chân trang nêu TikTok, YouTube, Facebook.
- Website không có analytics: thứ hạng đo bằng Search Console, Bing Webmaster Tools và bảng kiểm tay `docs/release/seo-theo-doi.md`.

## Trang Tải xuống: tab hệ điều hành
```

- [ ] **Step 2: Cập nhật bảng cấu trúc ở đầu README**

Tìm:
```
tools/og/               sinh ảnh chia sẻ 1200×630 từ template.html (cần Google Chrome)
```
Thay bằng:
```
tools/og/               sinh ảnh chia sẻ 1200×630 từ template.html (cần Google Chrome)
test/seo-targets.test.mjs   cụm từ khóa → trang đích, giới hạn phải nói thẳng, nhãn hiệu, menu và liên kết tới trang livestream (mục "SEO từ khóa")
```

- [ ] **Step 3: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/README.md && \
git commit -m "docs(website): README mục SEO từ khóa livestream và dịch thời gian thực

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

---

### Task 2: Bảng theo dõi `docs/release/seo-theo-doi.md`

**Files:**
- Create: `WT/docs/release/seo-theo-doi.md`

- [ ] **Step 1: Tạo file với nội dung sau**

```markdown
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
```

- [ ] **Step 2: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add docs/release/seo-theo-doi.md && \
git commit -m "docs(release): bảng theo dõi SEO livestream và biểu mẫu V1

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

---

### Task 3: V1, thử với livestream thật (cần chủ dự án)

**Files:** `docs/release/seo-theo-doi.md` (điền bảng V1); nếu V1 đạt: bốn file trang của bốn... xem Step 4.

- [ ] **Step 1: Hỏi chủ dự án trước khi chạm vào máy của họ**

Nhắn: "Để website được ghi 'đã thử với YouTube Live / TikTok LIVE' thay vì 'chưa thử', cần thử app với một livestream thật khoảng 3 phút mỗi nền tảng (máy sẽ phát tiếng). Bạn muốn tự thử theo bảng V1 trong `docs/release/seo-theo-doi.md`, nhờ tôi mở app và hướng dẫn từng bước, hay bỏ qua V1 (website giữ câu 'chưa thử riêng')?" Chờ trả lời. **Không tự mở app, không tự phát tiếng khi chưa được đồng ý; đừng `pkill` app** (dấu `run.marker` của app sẽ thành báo cáo lỗi giả).

- [ ] **Step 2: Nếu chủ dự án chọn bỏ qua V1**

Ghi một dòng vào đầu mục 3 của `docs/release/seo-theo-doi.md`: `V1 chưa thực hiện (chủ dự án chọn bỏ qua, <ngày>); website giữ câu "chưa thử riêng từng nền tảng livestream".` rồi commit (`docs(release): V1 chưa thực hiện`) và nhảy sang Task 4. `LIVE_TESTED` giữ `false`.

- [ ] **Step 3: Nếu chủ dự án đồng ý, chạy V1**

Hướng dẫn họ (hoặc cùng làm) đúng cách thử ở mục 3 của bảng theo dõi, rồi điền từng ô: ngày, phiên bản app (ở Cài đặt › Giới thiệu), phụ đề hiện hay không, độ trễ cảm nhận (số giây ước lượng hay "sau khi người nói dừng câu khoảng …"), nguồn "Chỉ Google Chrome" chạy hay không, nhận xét. Điền những gì thấy, không làm đẹp.

- [ ] **Step 4: Chỉ khi một nền tảng (gọi NEN_TANG, ví dụ "YouTube Live") đạt cả hai tiêu chí "phụ đề hiện" và "nguồn Chỉ Chrome chạy" thì viết lại câu "chưa thử"**

Biến: `NEN_TANG` = tên nền tảng đạt, `NGAY` = ngày thử ở bảng V1 (định dạng của ngôn ngữ trang).

Quy tắc: chỉ nói điều đã thấy, một lần thử, một máy; vẫn tách thành hai câu riêng.
- vi: "Chúng tôi đã thử với video phát trong trình duyệt, và thử một lần với {NEN_TANG} trên Chrome (macOS, {NGAY}): phụ đề hiện ra. Chúng tôi chưa thử các nền tảng livestream còn lại."
- en: "We have tested it with videos playing in a browser, and once with {NEN_TANG} in Chrome on macOS ({NGAY}): subtitles appeared. We have not tested the other livestream platforms."
- ja, zh, ko: dịch hai câu trên, giữ đúng sự việc và ngày.

Sửa ở các chỗ sau, cả năm ngôn ngữ (bản ja/zh/ko dịch từ bản en): `solutions-livestream` (ô "Dùng với" của `facts`, `callout` cảnh báo cuối mục giới hạn, câu hỏi đáp "Có dịch được live TikTok, YouTube và Facebook không?"); `solutions-tiktok-live` (câu hỏi đáp đầu, `callout` cảnh báo; chỉ đổi nếu NEN_TANG là TikTok LIVE, nếu không thì giữ "chưa thử riêng TikTok LIVE"); câu hỏi đáp trang chủ "Dịch livestream ra tiếng Việt được không?"; câu hỏi đáp đầu của `faq` về livestream; hai câu trong `llm` nếu có nhắc. Cập nhật `meta` ở đầu `solutions-livestream` không cần (nó chỉ nói chạy trên máy tính).

Rồi sửa `test/seo-targets.test.mjs`: đổi hằng `LIVE_TESTED` thành `true` với chú thích "V1 đạt <ngày>, xem docs/release/seo-theo-doi.md"; trong bảng `NEEDS` thay các câu bắt buộc "Chúng tôi chưa thử riêng từng nền tảng livestream" bằng "Chúng tôi chưa thử các nền tảng livestream còn lại" và "We have not tested each livestream platform" bằng "We have not tested the other livestream platforms"; với trang TikTok, nếu đổi thì thay tương tự.

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && pnpm test 2>&1 | tail -n 12`
Expected: `ℹ fail 0`.

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && git add website docs/release/seo-theo-doi.md && \
git commit -m "docs(website): ghi kết quả V1 và đổi câu 'chưa thử' sau khi thử với livestream thật

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

- [ ] **Step 5: Nếu V1 không đạt (phụ đề không hiện, hoặc nguồn "Chỉ Chrome" lỗi)**

Không đổi chữ trên website. Ghi kết quả trung thực vào bảng V1, commit (`docs(release): kết quả V1 không đạt`) và báo chủ dự án: đây là phát hiện về sản phẩm (có thể là lỗi), ngoài phạm vi kế hoạch này; đừng tự sửa app.

---

### Task 4: Kiểm tra cuối: test đầy đủ và ảnh chụp

**Files:** không sửa mã (sửa nếu phát hiện lỗi).

- [ ] **Step 1: Chạy toàn bộ test, không đặt biến nào**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && pnpm test 2>&1 | tail -n 14`
Expected: `ℹ fail 0`, `ℹ skipped 6` (7 nếu V1 đã đạt và `LIVE_TESTED = true`: test quét câu "đã thử" khi đó bị bỏ qua), số `ℹ tests` lớn hơn mốc 245 (các test của `seo-targets.test.mjs` cộng thêm: khoảng 18 test cụm, 2–3 test nhãn hiệu/luật, và các test theo ngôn ngữ).

- [ ] **Step 2: Dựng và chụp ảnh kiểm tra trang mới ở máy tính và điện thoại, sáng và tối**

Tạo script trong thư mục tạm (không đưa vào repo):
```bash
S=$(mktemp -d) && cat > "$S/shoot.mjs" <<'EOF'
import { launch, findChrome } from "/Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website/tools/browser/cdp.mjs";
import { start } from "/Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website/src/serve.mjs";
import { mkdirSync } from "node:fs";
const out = process.argv[2];
mkdirSync(out, { recursive: true });
if (!findChrome()) throw new Error("không có Google Chrome (đặt CHROME=<đường dẫn>)");
const PAGES = [
  ["vi-livestream", "/giai-phap/dich-livestream/"],
  ["vi-tiktok", "/giai-phap/dich-live-tiktok/"],
  ["en-livestream", "/en/solutions/livestream-translation/"],
  ["en-tiktok", "/en/solutions/tiktok-live-translation/"],
  ["ja-livestream", "/ja/solutions/livestream-translation/"],
  ["zh-livestream", "/zh/solutions/livestream-translation/"],
  ["ko-livestream", "/ko/solutions/livestream-translation/"],
  ["vi-hub", "/giai-phap/"],
];
const VIEWS = [["d", 1280, false, false], ["m", 375, true, false], ["md", 375, true, true]];
const server = await start(0);
const base = `http://127.0.0.1:${server.address().port}`;
const b = await launch();
const problems = [];
for (const [tag, width, mobile, dark] of VIEWS) {
  const p = await b.newPage({ width, height: 900, mobile, dark });
  for (const [slug, urlPath] of PAGES) {
    await p.goto(base + urlPath);
    const over = await p.eval("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1");
    if (over) problems.push(`${slug} ${tag}: tràn ngang`);
    await p.screenshot(`${out}/${slug}-${tag}.png`, { full: true });
  }
}
await b.close();
server.close();
console.log(problems.length ? problems.join("\n") : "không trang nào tràn ngang");
EOF
echo "$S"
```
Ghi lại đường dẫn `S` in ra (ví dụ `/tmp/tmp.abc123`), rồi:

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && pnpm build 2>&1 | tail -n 3 && node "$S/shoot.mjs" "$S/shots"`  (thay `$S` bằng đường dẫn đã ghi nếu shell mới)
Expected: `không trang nào tràn ngang`. Có dòng "tràn ngang" thì mở ảnh tương ứng, tìm phần tử rộng quá (thường là chuỗi dài không ngắt dòng trong `facts` hay `callout`) và sửa nội dung cho ngắt được.

- [ ] **Step 3: Xem ảnh**

Dùng công cụ Read mở các file `…/shots/vi-livestream-d.png`, `vi-livestream-m.png`, `vi-tiktok-m.png`, `en-livestream-md.png`, `ja-livestream-d.png`, `ko-livestream-m.png`. Kiểm bằng mắt: bố cục giống `solutions-webinar` (hero, bảng dữ kiện, ba thẻ, ảnh thanh phụ đề cạnh danh sách, các bước, mục giới hạn, hỏi đáp, ba thẻ liên kết, dải CTA), chữ CJK hiển thị đủ (không ô vuông), không vỡ ở 375 px, chế độ tối đọc được. Báo cáo trung thực những gì thấy.

- [ ] **Step 4: Dọn tiến trình**

Run: `pgrep -fl 'chrome.*--remote-debugging-port' ; pgrep -fl 'node .*shoot.mjs'`
Expected: không in gì (script đã đóng Chrome và server). Nếu còn tiến trình Chrome không đầu do chính script này mở thì tắt nó (`kill <pid>`); không đụng tiến trình khác của người dùng.

---

### Task 5: Bàn giao

**Files:** không sửa mã.

- [ ] **Step 1: Kiểm tập thay đổi chỉ gồm các file đã định**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && git diff --name-only main...seo-livestream | sort`
Expected: chỉ gồm `docs/release/seo-theo-doi.md`, `docs/superpowers/plans/2026-10-25-seo-livestream-0{0..6}-*.md`, `docs/superpowers/specs/2026-10-25-seo-livestream-tu-khoa-design.md`, `website/README.md`, `website/src/content/index.mjs`, `website/src/content/{vi,en,ja,zh,ko}/{home,solutions,solutions-webinar,features,faq,solutions-livestream,solutions-tiktok-live}.mjs`, `website/src/content/en/solutions-meetings.mjs`, `website/src/site.mjs`, `website/test/seo-targets.test.mjs`. File nào ngoài danh sách (ví dụ `src/build/*`, `src-tauri/*`, `server/*`) là lỗi: xem lại và hoàn tác.

- [ ] **Step 2: Đọc danh sách commit**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && git log --oneline main..seo-livestream`
Expected: chuỗi commit của các kế hoạch 00–06, mỗi commit một việc.

- [ ] **Step 3: Báo cáo cho chủ dự án và dừng**

Báo bằng tiếng Việt, ngắn: nhánh `seo-livestream` (worktree `meeting-translator-work/seo-livestream`) có gì, `pnpm test` xanh (số test), kết quả V1 (đạt, không đạt hay bỏ qua), ảnh chụp đã xem, và việc còn lại của chủ dự án theo `docs/release/seo-theo-doi.md` mục 1. Hỏi: có cho gộp vào `main` và push không (website là bước `pnpm deploy` do chủ dự án chạy sau cùng, và nhắc rằng sau deploy cần "Kiểm tra URL" và gửi sitemap). **Không gộp, không push, không deploy khi chưa được cho phép.**

- [ ] **Step 4: Ghi nhớ cho các phiên sau**

Thêm vào bộ nhớ của dự án (`/Users/dtphong/.claude/projects/-Users-dtphong-Desktop-software-business-ai-translator/memory/`) một file `seo-livestream-2026-10-25.md` (loại `project`) tóm tắt: spec và kế hoạch ở đâu, nhánh và worktree, trạng thái (đã thực thi, chưa gộp/deploy), kết quả V1, quy tắc "hai câu riêng" và `LIVE_TESTED`, và dòng cảnh báo "không đặt `WEBSITE_DIST` chung cho `pnpm test`"; thêm một dòng vào `MEMORY.md`.
