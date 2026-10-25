# SEO từ khóa dịch livestream, dịch live và dịch thời gian thực

Ngày: 2026-10-25. Phạm vi: `website/` (năm ngôn ngữ vi/en/ja/zh/ko). Không đụng app, server, giá.

## 1. Mục tiêu và 17 cụm từ khóa

Chủ dự án muốn website xuất hiện đầu kết quả Google, Bing và trợ lý AI khi người dùng tìm 17 cụm sau. Mỗi cụm được gán **một trang đích chính** để các trang không tranh nhau.

| Cụm | Ngôn ngữ | Trang đích chính | Ghi chú về ý định tìm kiếm |
|---|---|---|---|
| dịch livestream ra tiếng việt | vi | `solutions-livestream` | Xem live nước ngoài bằng phụ đề tiếng Việt |
| dịch livestream trực tiếp | vi | `solutions-livestream` | |
| dịch livestream | vi | `solutions-livestream` | |
| dịch live trực tiếp | vi | `solutions-livestream` | |
| dịch live | vi | `solutions-livestream` | Mơ hồ (còn nghĩa phiên dịch viên); trang chủ hỗ trợ |
| dịch live tiktok | vi | `solutions-tiktok-live` | Phần lớn xem trên điện thoại: phải nói thẳng giới hạn |
| live video translator | en | `solutions-livestream` (en) | |
| real time translator, real-time translation | en | `home` (en) | Cụm chung, cạnh tranh rất cao |
| real time translation, realtime translation | en | `solutions-livestream` (en) | Cụm chung, cạnh tranh rất cao |
| real-time translator for meetings | en | `solutions-meetings` (en) | |
| ai meeting translator | en | `solutions-meetings` (en) | |
| live meeting translation | en | `solutions-meetings` (en) | |
| video translator | en | `solutions-webinar` (en) | Ý định phần lớn là dịch/lồng tiếng file video: app không làm, phải nói rõ |
| ai translator, ai live translator | en, vi | `home` | Tên trùng nhiều sản phẩm khác; không đặt mục tiêu thứ hạng |

## 2. Hiện trạng (đã kiểm 2026-10-25)

- **Kỹ thuật SEO đã đủ:** `<title>`, description, canonical, hreflang đối xứng năm ngôn ngữ, JSON-LD (SoftwareApplication, FAQPage, BreadcrumbList, Article, VideoObject), sitemap có `lastmod`, `robots.txt` cho phép bot tìm kiếm và bot AI, `llms.txt`/`llms-full.txt` tự sinh từ trường `llm` của từng trang, khóa IndexNow. Không dựng lại.
- **Khoảng trống nội dung:** `grep -riE 'livestream|live stream|tiktok|twitch|youtube|phát trực tiếp'` trên `src/content/vi`, `src/content/en`, `src/site.mjs`, `src/build` không có kết quả. Không trang nào nhắm "dịch live". Trang `/giai-phap/` chỉ có hai tình huống: họp và webinar/video.
- **Chưa xác minh được việc lập chỉ mục:** công cụ tìm kiếm không hỗ trợ `site:`; cần Search Console và Bing Webmaster Tools của chủ dự án (mục 8).
- **Đối thủ (tìm ngày 2026-10-25):** "dịch livestream ra tiếng việt" trả về tin tuyển "nhân viên livestream", bài về nghề livestream và một tiện ích Firefox: gần như không có đối thủ đúng ý định. "dịch live tiktok" trả về bài hướng dẫn live bán hàng, không có công cụ dịch. Cụm tiếng Anh chung (real time translation, ai translator, video translator) do các tên lớn và nhiều app trùng tên chiếm.

## 3. Kỳ vọng (không phải cam kết)

- Nhóm tiếng Việt về livestream (6 cụm đầu): khả thi lên trang một sau khi được lập chỉ mục, vì ít cạnh tranh đúng ý định. Kỳ vọng top 10 trong 4–8 tuần sau khi Google lập chỉ mục trang mới.
- Cụm tiếng Anh về họp (3 cụm): kỳ vọng top 30, cần backlink.
- Cụm tiếng Anh chung (`real time translation`, `ai translator`, `video translator`…): **không hứa**. Cạnh tranh với Google, DeepL, Microsoft, phần cứng dịch; tên "AI Translator" trùng aitranslator.com của Tomedes và nhiều app di động. Việc trang chủ làm được là nói đúng và rõ để được chọn khi người dùng thêm "for meetings", "desktop", "offline".
- Thứ hạng còn phụ thuộc backlink và tuổi tên miền; spec này làm phần nội dung và kỹ thuật, backlink là việc ngoài mã (mục 8).

## 4. Điều trang mới được nói và không được nói

Luật của CLAUDE.md: chỉ nói điều có thật, số đo kèm điều kiện đo, không công bố công nghệ lõi.

**Được nói (đúng với app hiện tại):**
- App thu âm thanh đang phát trên máy tính nên chạy với bất kỳ trang web hay app nào phát tiếng, kể cả livestream xem bằng trình duyệt; không cài tiện ích, không cần tài khoản nền tảng.
- macOS: chọn nghe cả hệ thống hoặc chỉ một app (chọn trình duyệt đang phát live; các tab khác của trình duyệt vẫn bị nghe). Windows: thiết bị phát mặc định hoặc thiết bị chọn.
- Năm ngôn ngữ nguồn và đích: Anh, Trung, Nhật, Hàn, Việt; tự nhận diện hoặc khóa ngôn ngữ nguồn. Live bằng tiếng Trung, Hàn, Nhật, Anh → phụ đề tiếng Việt.
- Độ trễ: trung vị 0,76–1,03 giây từ lúc người nói dừng câu đến lúc hiện phụ đề (Mac M4 Pro, gói model Chuẩn); Windows mới đo sơ bộ, chậm hơn. Dùng đúng chữ và điều kiện đang có ở trang Tính năng.
- Chạy offline khi dịch, âm thanh không rời máy, không ghi âm xuống đĩa, không tải video, không can thiệp vào nền tảng livestream.
- Thanh phụ đề nổi: kéo, đổi cỡ chữ, khóa cho chuột xuyên qua; hiện câu gốc nhỏ phía trên bản dịch.
- Bản dịch tự động có thể sai; nhạc nền lớn hoặc nhiều người nói chồng nhau làm kết quả kém hơn (nguyên tắc chung của nhận dạng giọng nói, không kèm con số).

**Phải nói thẳng ở mục "Khi nào chưa phù hợp" của mỗi trang:**
- App chỉ chạy trên máy tính (macOS 14.2+ Apple Silicon, Windows 10/11 x64). Xem live bằng ứng dụng TikTok trên điện thoại thì không dùng được.
- App chỉ làm phụ đề cho **người xem**. Không dịch live của chính người phát cho khán giả của họ, không tạo file phụ đề từ file video, không lồng tiếng.
- Không ghi lại buổi live, không có chế độ tóm tắt.

**Không được nói trước khi kiểm (xem V1 ở mục 7):**
- "Đã thử với TikTok Live / Facebook Live" (hay nói app chạy tốt với hai nền tảng này). Sau V1 (mục 7, 2026-10-25): **YouTube Live đã kiểm và đạt**, trang được nói đã thử một lần với YouTube Live (kèm ngày, Chrome, macOS); **TikTok LIVE chỉ có một buổi live tiếng Việt có nhạc nền, không đạt**, trang nói đúng như vậy, không nói "đã thử TikTok"; **Facebook Live chưa kiểm**, trang nói "chưa thử Facebook Live". Trước V1, trang ghi như trang webinar: *đã thử với video trên trình duyệt, chưa thử riêng từng nền tảng livestream*.
- Tên nền tảng chỉ dùng như tên gọi để người đọc nhận ra tình huống, kèm câu nhãn hiệu ở chân trang (mục 5.4).

## 5. Thiết kế

### 5.1 Hai trang giải pháp mới (năm ngôn ngữ, mỗi trang năm file)

| id | vi | en | ja, zh, ko |
|---|---|---|---|
| `solutions-livestream` | `/giai-phap/dich-livestream/` | `/en/solutions/livestream-translation/` | `/ja/solutions/livestream-translation/`, `/zh/solutions/livestream-translation/`, `/ko/solutions/livestream-translation/` |
| `solutions-tiktok-live` | `/giai-phap/dich-live-tiktok/` | `/en/solutions/tiktok-live-translation/` | `/ja/solutions/tiktok-live-translation/`, `/zh/solutions/tiktok-live-translation/`, `/ko/solutions/tiktok-live-translation/` |

Bản ja/zh/ko là bản en đổi tiền tố đường dẫn, dịch theo "Quy tắc dịch" của `docs/superpowers/plans/2026-10-22-website-ja-zh-ko-04-noi-dung.md`. Kiểu trang giống `solutions-meetings` và `solutions-webinar` (`type: "article"`, `pageHero`, `facts`, `checkList`, `steps`, `callout`, `ctaBand`).

**`solutions-livestream`** (nhắm sáu cụm vi và `live video translator`):
1. `pageHero`: H1 chứa đúng cụm "dịch livestream ra tiếng Việt" (en: "live video translator"); đoạn mở đầu trả lời ngay: làm được gì, trên máy nào, không làm được gì (câu trả lời tự đủ nghĩa cho trợ lý AI trích dẫn).
2. `facts`: dùng với, ngôn ngữ, độ trễ (kèm điều kiện), nền tảng.
3. "Dành cho ai": xem live nước ngoài (Anh, Trung, Hàn, Nhật), live mua sắm xuyên biên giới, hội thảo và sự kiện trực tiếp. Chỉ nêu tình huống người xem; không hứa số liệu.
4. Cách dùng bốn bước: mở livestream trên trình duyệt máy tính, bấm Bắt đầu, đặt thanh phụ đề, chọn nguồn âm thanh (macOS: chọn trình duyệt).
5. Khác gì xem webinar/video đã ghi: live không tua lại được, nên khóa ngôn ngữ nguồn, đặt Độ nhạy ngắt câu, đặt thanh phụ đề sát khung video; liên kết sang `solutions-webinar`.
6. "Khi nào chưa phù hợp" (mục 4), `callout` cảnh báo bản dịch có thể sai.
7. FAQ năm đến sáu câu viết đúng cách người ta hỏi (kèm `faqPage` JSON-LD): "Dịch livestream ra tiếng Việt bằng cách nào?", "Có dịch được live TikTok, YouTube, Facebook không?", "Dùng trên điện thoại được không?", "Có cần internet khi đang dịch không?", "Độ trễ bao nhiêu?", "Có dịch live của chính tôi cho người xem không?".

**`solutions-tiktok-live`** (nhắm "dịch live tiktok", en "TikTok Live translation"): cùng khung nhưng nội dung riêng, không sao chép: mở đầu bằng giới hạn điện thoại, cách xem TikTok LIVE trên trình duyệt máy tính rồi dùng AI Translator, mẹo cho live nói nhanh, live có nhạc nền, live nhiều người nói. Không nhắc tên công nghệ lõi, không nói "đã thử TikTok" nếu chưa qua V1.

Tránh trùng nội dung giữa hai trang: trang chung nói cơ chế và tình huống; trang TikTok nói thao tác và giới hạn riêng của TikTok. Hai trang liên kết chéo, mỗi trang có canonical riêng.

### 5.2 Chỉnh trang đã có

- **Trang chủ (năm ngôn ngữ):** đổi `title`, `description` và câu dẫn hero để nhắc livestream và dịch thời gian thực, **không thêm phần mới** (giữ đúng khung `docs/superpowers/specs/2026-10-23-trang-chu-gon-design.md`): một bullet trong "Dịch cuộc họp" nhắc livestream kèm liên kết, một câu hỏi đáp "Dịch livestream ra tiếng Việt được không?". Ví dụ tiêu đề vi: "Dịch livestream, họp trực tiếp ra tiếng Việt | AI Translator" (giới hạn độ dài do test kiểm).
- **`solutions-meetings`, chỉ bản en:** đổi `title`, `description`, H1 và câu mở đầu để có "AI meeting translator", "real-time translator for meetings", "live meeting translation". Tiêu đề en: "AI meeting translator for Zoom, Teams and Meet". Bản vi/ja/zh/ko giữ nguyên vì không cụm đích nào bằng các ngôn ngữ đó (test chỉ so khung, không so nghĩa của tiêu đề).
- **`solutions-webinar`:** thêm đoạn nói rõ app là phụ đề trực tiếp, không dịch hay lồng tiếng file video; liên kết sang trang livestream. Để cụm "video translator" khớp ý định thật.
- **`solutions` (trang tổng):** thêm hai thẻ liên kết tới trang mới (lưới đổi sang bốn thẻ), thêm dòng bảng "Chọn nhanh" cho livestream, sửa lead.
- **`features`, `faq`:** đoạn Nguồn âm thanh ở Tính năng thêm chữ livestream và liên kết; Hỏi đáp thêm ba câu (livestream, TikTok Live, dùng trên điện thoại) ở nhóm phù hợp.
- **Điều hướng:** thêm hai mục vào menu Giải pháp (`NAV`) và liên kết ở chân trang cho năm ngôn ngữ.

### 5.3 Kỹ thuật và GEO

- `llm` và `llmTitle` của hai trang mới để `llms.txt`, `llms-full*.txt` tự liệt kê; sitemap, hreflang, breadcrumb, JSON-LD (Article, FAQPage) dùng cơ chế sẵn có.
- Mỗi trang mới: cụm đích xuất hiện trong `title`, `description`, H1, 100 chữ đầu và ít nhất một H2; không nhồi cụm (không lặp quá mức tự nhiên của câu).
- Ảnh chia sẻ: hai id mới vào nhóm `solutions` của `OG_GROUP` (cùng nhóm với hai trang giải pháp sẵn có, không phải sinh ảnh mới); ảnh riêng cho từng trang là việc sau, không chặn.
- Không thêm script, font, cookie hay analytics (CSP `default-src 'self'` giữ nguyên).

### 5.4 Nhãn hiệu

Câu `trademark` ở chân trang (`T[lang].trademark` trong `src/site.mjs`, năm ngôn ngữ) hiện liệt kê Zoom, Microsoft Teams, Google Meet, Zalo. Thêm TikTok, YouTube, Facebook vào câu "tên sản phẩm thuộc về chủ sở hữu, AI Translator không liên kết".

## 6. Test

- Bảng `NEEDS` của `test/seo-targets.test.mjs`: cụm bắt buộc cho mỗi trang mới (câu giới hạn điện thoại, câu "chỉ làm phụ đề cho người xem", điều kiện của số độ trễ).
- Test mới `SEO_TARGETS`: bảng mục 1 dưới dạng dữ liệu; kiểm cụm đích có ở **mọi** chỗ ghi trong cột `where` của dòng đó (`title`, `description`, H1, H2 hay thân trang) của trang đích, đúng ngôn ngữ của cụm. Sửa trang về sau mà làm mất cụm thì test đỏ.
- Chặn câu cấm: Test STALE_LIVE (luật CLAIM, hằng V1_TESTED = ["YouTube"]) chặn câu nói đã thử hoặc chạy tốt với các nền tảng chưa đạt V1 (hiện là TikTok, Facebook) ở title, mô tả, thân trang và JSON-LD của năm ngôn ngữ. Câu nói app dịch live của người phát cho người xem chưa tự động hóa: cần luật loại trừ câu phủ định như `staleHits` của `site.test.mjs`, chưa làm; tạm thời câu đó chỉ được bảo vệ bằng các câu bắt buộc ở bảng `NEEDS` của test (hai trang mới) và kiểm bằng mắt khi sửa trang. Test "không lộ công nghệ lõi" và `test/i18n-content.test.mjs` (so khung ja/zh/ko với en) áp dụng cho trang mới như mọi trang.
- Độ dài: `title` ≤ 70 ký tự (ja/zh/ko ≤ 40 gồm đuôi), description 90–165 (ja/zh/ko 50–120).
- Chạy `pnpm test` ở `website/` sau mỗi nhóm thay đổi; deploy không nằm trong spec này.

## 7. Xác minh trước khi viết "đã thử"

**V1 (không chặn việc làm):** chạy app trên Mac với một livestream YouTube và một TikTok LIVE mở trong trình duyệt máy tính, ghi lại: app nhận được âm thanh, phụ đề hiện, độ trễ cảm nhận, chọn nguồn "chỉ trình duyệt" hoạt động. Việc này dùng loa và máy của chủ dự án nên phải báo trước khi chạy. Nếu có kết quả đạt thì thêm câu "đã thử với …" kèm ngày và điều kiện; nếu không thì giữ câu mặc định ở mục 4. Windows: chủ dự án đã thử mọi tính năng ngày 2026-10-20 nhưng chưa thử riêng livestream, giữ nguyên câu mặc định.

**Kết quả (2026-10-25)** (chi tiết ở mục 3 của `docs/release/seo-theo-doi.md`):
- **YouTube Live: đạt.** Thử một lần ngày 25/10/2026 (22:01–22:12 giờ Việt Nam) trên Chrome, macOS, kênh tin tức tiếng Anh Al Jazeera English: phụ đề tiếng Việt hiện suốt khoảng 2 phút 45 giây với nguồn âm thanh mặc định, và cả khi chọn nguồn "Chỉ Google Chrome" (khoảng 1 phút 20 giây). Bản dịch nhìn chung khớp lời, vài lỗi nhỏ.
- **TikTok LIVE trên web: không đạt, thử chưa đúng loại.** Chỉ xem được một buổi live tiếng Việt có nhạc nền (không tìm được buổi live tiếng Anh, Trung, Nhật, Hàn). App thu được tiếng, nhưng nhạc làm nhận dạng sai (nhận nhầm ngôn ngữ, câu ảo lặp lại) nên phụ đề không dùng được. Buổi thử nghe qua loa với nguồn "Âm thanh máy + Micro", nên chưa chắc nguyên nhân là nhạc: website chỉ nêu hiện tượng (nhận nhầm ngôn ngữ, lặp câu không ai nói) và điều kiện "có nhạc nền", không khẳng định nguyên nhân. Chưa có kết quả với live tiếng Anh, Trung, Nhật, Hàn.
- **Facebook Live: chưa thử.** Windows: chưa thử riêng livestream.
- Số thời gian xử lý trong log app (p50 khoảng 0,5 giây) **không** đưa lên website: không phải số đo chính thức và khác điều kiện đo của trang Tính năng.

Website đã đổi chữ theo kết quả này ở năm ngôn ngữ (hai trang mới, Trang chủ, Hỏi đáp): nói đã thử một lần với YouTube Live (kèm ngày), nói đúng kết quả không đạt của buổi TikTok LIVE có nhạc nền, nói chưa thử Facebook Live; mỗi câu "đã thử"/"chưa thử" vẫn là một câu riêng. Test `STALE_LIVE` dùng hằng `V1_TESTED = ["YouTube"]`: vẫn chặn câu nói đã thử TikTok hay Facebook.

## 8. Việc ngoài mã (của chủ dự án)

1. Xác minh `aitranslator.vn` trên Google Search Console và Bing Webmaster Tools (bản ghi DNS TXT, không phải sửa site), rồi gửi `https://aitranslator.vn/sitemap.xml`. Bing ảnh hưởng tới Copilot và tìm kiếm của một số trợ lý AI.
2. Backlink: Product Hunt, README GitHub của repo (repo công khai), danh bạ công cụ AI, nhóm cộng đồng Việt về livestream, bán hàng xuyên biên giới và dịch thuật. Dùng văn bản trung thực như trên website.
3. Sau khi deploy: dùng "Kiểm tra URL" của Search Console cho bốn trang quan trọng (hai trang mới ở bản vi, trang chủ, `solutions-meetings` en) để yêu cầu lập chỉ mục.

## 9. Đo kết quả

Website không có analytics (lời hứa quyền riêng tư). Đo bằng hai nguồn: báo cáo Hiệu suất của Search Console (truy vấn, hiển thị, vị trí trung bình theo trang) và bảng kiểm tay hàng tuần cho 17 cụm: cửa sổ ẩn danh, `hl=vi`/`hl=en`, ghi vị trí của `aitranslator.vn`. Lưu bảng ở `docs/release/seo-theo-doi.md` (tạo khi có số đầu tiên). Mốc đo: tuần 0 (trước deploy), 2, 4, 8, 12.

## 10. Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| Hai trang vi gần giống nhau (nội dung mỏng/trùng) | Mục 5.1: trang chung nói cơ chế, trang TikTok nói thao tác và giới hạn; kiểm tay khi viết |
| Người tìm "dịch live tiktok" xem trên điện thoại rồi thoát | Trả lời giới hạn điện thoại ngay ở đoạn đầu; không giấu |
| Nói quá về livestream khi chưa thử | Mục 4 và V1; test `STALE_LIVE` |
| Chạy theo cụm lệch ý định ("video translator", "ai translator") | Không ép cụm vào trang không khớp; nói rõ app không làm file/lồng tiếng |
| Bản dịch ja/zh/ko chưa có người bản ngữ duyệt | Như các trang hiện có: do Claude dịch, ghi ở README; test chỉ bắt lệch cấu trúc |
| Nhồi từ khóa làm giảm chất lượng | Cụm đích chỉ ở vị trí tự nhiên (title, H1, mở đầu, một H2); đọc lại bằng mắt |

## 11. Ngoài phạm vi

Blog hoặc chuỗi bài dài; trang riêng cho từng nền tảng khác ngoài TikTok; dịch cho người phát livestream; đổi giá hay tính năng app; deploy website (chủ dự án chạy `pnpm deploy` sau khi duyệt, theo quy trình phát hành hiện có).

## 12. Cách làm

Nhánh `seo-livestream` trong worktree riêng (thư mục chính đang ở `main`). Không merge, không push, không deploy khi chưa được cho phép.
