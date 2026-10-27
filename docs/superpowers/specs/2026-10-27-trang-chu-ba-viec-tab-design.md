# Trang chủ: khối "Ba việc" có tab, rút chữ các phần còn lại

Ngày: 2026-10-27. Nhánh `trang-chu-ba-viec` (tách từ main 8de55fda). Phạm vi: `website/src/content/{vi,en,ja,zh,ko}/home.mjs`, một thành phần tab mới ở `website/src/build/components.mjs` và `website/src/assets/{site.js,site.css}`, test, `website/README.md`.

## Vì sao

Chủ dự án (2026-10-27): trang chủ `aitranslator.vn` có quá nhiều thông tin và chữ, người đọc bị rối. Lần làm gọn 23/10 (spec `2026-10-23-trang-chu-gon-design.md`) đã bỏ khối thừa, nhưng từ đó trang có thêm hai video và các câu về livestream, nên chữ tăng lại.

Số đo trên bản đã dựng (`dist/index.html`, tiếng Việt, 2026-10-27): **2.163 chữ, 10 phần**.

| Phần | Chữ |
|---|---|
| Hero | 192 |
| Video demo | 94 |
| Dịch cuộc họp | 224 |
| Gõ dịch | 90 |
| Lịch sử | 113 |
| Cách dùng | 232 |
| Dữ liệu ở lại trên máy | 281 |
| Bảng giá | 279 |
| Hỏi đáp (7 câu) | 625 |
| Lời mời cuối trang | 33 |

Điều làm rối, theo thứ tự ảnh hưởng:

1. **Chi tiết đặt sai chỗ:** Hỏi đáp dài nhất, câu livestream một mình khoảng 160 chữ; đoạn ký ad-hoc/SmartScreen (khoảng 70 chữ) nằm dưới "4 bước"; câu liệt kê dữ liệu máy chủ (khoảng 70 chữ, một câu) nằm trong thẻ. Đều có trang riêng.
2. **Lặp ý:** "AI chạy trên máy, không lên cloud" xuất hiện ở hero, phần Dữ liệu, hai câu Hỏi đáp và một gạch đầu dòng ở phần họp; giá ở Bảng giá, hai câu Hỏi đáp và lời mời cuối; cảnh thanh phụ đề ba lần (mockup hero, video họp, ảnh overlay).
3. **Bốn phần dài và đứng riêng** (Video, Họp, Gõ dịch, Lịch sử) xếp dọc, mỗi phần một câu dẫn và 3–6 gạch dài.
4. **Gạch đầu dòng dài** chen liên kết và điều kiện đo.

## Quyết định của chủ dự án

- **Hero giữ nguyên hoàn toàn** (pill, tiêu đề, đoạn dẫn, ba dấu tích, mockup có phụ đề).
- **Gộp Video demo, Dịch cuộc họp, Gõ dịch, Lịch sử thành một khối tab** "Ba việc". Việc này thay bố cục hai video cạnh nhau đã chọn 26/10 (spec `2026-10-26-tach-video-demo-hai-phan`); mỗi video giờ nằm trong tab của nó và rộng hơn.
- Bốn trụ cột nội dung (họp, Gõ dịch, Lịch sử, hướng dẫn sử dụng) đã chốt 23/10, giữ nguyên.

## Khung mới (giống nhau ở năm ngôn ngữ): 10 phần → 7 phần

| # | Phần | id (vi / en, ja, zh, ko) | Thay đổi |
|---|---|---|---|
| 1 | Hero | | Giữ nguyên |
| 2 | **Ba việc** (tab; tiêu đề hiện trên trang: "Tính năng chính") | `tinh-nang-chinh` / `main-features`; panel giữ id cũ: `dich-cuoc-hop`, `go-dich`, `lich-su` / `meeting-translation`, `type-and-translate`, `history` | Mới, thay bốn phần cũ |
| 3 | Cách dùng | `cach-dung` / `how-to-use` | Bốn bước ngắn; đoạn ký mã còn một câu + hai liên kết |
| 4 | Dữ liệu ở lại trên máy | `rieng-tu-tren-may` / `private-on-device` | Giữ tiêu đề và sơ đồ; hai thẻ ngắn; câu liệt kê dữ liệu máy chủ vào `<details>` gập sẵn |
| 5 | Bảng giá | `gia` / `pricing` | Giữ nguyên |
| 6 | Hỏi đáp | | 7 → 6 câu, mỗi câu trả lời ngắn |
| 7 | Lời mời cuối trang | | Giữ nguyên |

Mục tiêu chữ (bản vi, đo bằng `website/tools/measure-home.mjs`): tổng khoảng **1.700** chữ trong HTML (từ 2.163), trong đó chữ **hiện sẵn** (không ẩn trong tab hay mục gập, chỉ câu Hỏi đáp đầu mở sẵn, tính cả phần dưới màn hình đầu: là `innerText` của `<main>`) khoảng **1.100** (từ 1.671). Hero (192), Bảng giá (279), sơ đồ dữ liệu (98) và lời mời cuối trang (33) không đổi, nên không xuống tới 1.300 nếu không bỏ các câu nói thẳng mà test bắt buộc.

## Khối "Ba việc"

**Bố cục.** Một `<section>` có tiêu đề (eyebrow, h2 ngắn, không đoạn dẫn), thanh tab, rồi ba panel. Tab dùng nhãn ngắn kèm icon: **Dịch họp · Gõ dịch · Lịch sử** (en: Meetings · Type & Translate · History; ja/zh/ko dùng đúng tên đã có ở trang Tính năng). Tab đầu (Dịch họp) mở sẵn.

Mỗi panel: hai cột từ 900 px (chữ trái, hình phải, hình rộng hơn chữ), một cột dưới đó. Nội dung panel: `<h3>` (giữ câu tiêu đề cũ của phần), một câu dẫn, tối đa 3 gạch đầu dòng ngắn, một nút sang trang chi tiết. Hình của panel:

| Panel | Hình | Nút |
|---|---|---|
| Dịch họp | video họp (`demoVideo`, kind `meeting`) | Xem tất cả tính năng |
| Gõ dịch | video Gõ dịch (kind `typing`) | Xem hướng dẫn Gõ dịch |
| Lịch sử | ảnh `app-history` | Xem hướng dẫn Lịch sử |

**Chữ (bản vi, bản en dịch sát; ja/zh/ko dịch từ en theo quy tắc dịch của README):**

- Dịch họp: câu dẫn "App nghe âm thanh đang phát trên máy và hiện bản dịch trên thanh phụ đề nổi. Không bot nào vào phòng họp." Ba gạch: năm ngôn ngữ dịch mọi chiều và tự nhận diện; độ trễ kèm điều kiện đo và liên kết `/tinh-nang/#hieu-nang`, máy khác có thể chậm hơn; dùng với Zoom, Teams, Meet, Zalo, họp tại chỗ (nguồn Micro) và livestream xem trên máy tính (liên kết trang dịch livestream). Chuyển sang trang Tính năng: thanh phụ đề kéo/khóa, từ điển thuật ngữ.
- Gõ dịch: giữ nguyên chữ hiện có (đã ngắn; test cần "Trả lời bằng tiếng của người bên kia" và "không trừ thời lượng dịch").
- Lịch sử: câu dẫn một câu; ba gạch hiện có (mọi gói xem phiên gần nhất, Pro lưu và xuất TXT/SRT/Markdown, mặc định tắt và mã hóa trên máy).

**Hành vi.** Dùng thành phần mới `featureTabs` + `initFeatureTabs` (không sửa `osTabs` của trang Tải xuống), theo cùng khuôn:

- **Không JS:** thanh tab ẩn, ba panel xếp dọc đủ nội dung (người đọc và công cụ tìm kiếm thấy hết).
- **Có JS:** thanh tab hiện, panel không chọn có `hidden`. `role="tablist"/"tab"/"tabpanel"`, `aria-selected`, `aria-controls`, `tabindex` luân phiên; mũi tên, Home, End chuyển tab (tab tự kích hoạt, tiêu điểm đi theo).
- **Neo:** `#dich-cuoc-hop`, `#go-dich`, `#lich-su` (và id en/ja/zh/ko) mở đúng tab khi vào trang và khi đổi `hashchange`.
- **Video:** chuyển tab thì tạm dừng video của panel vừa rời. Giữ nguyên cơ chế nút phát (`data-video`, `preload="none"`).
- **`.reveal` trong panel:** ảnh và video do `appShot`/`demoVideo` mang sẵn lớp `.reveal`, nhưng IntersectionObserver không bao giờ hiện phần tử trong panel ẩn (lỗi đã gặp ở trang Tải xuống), nên CSS ép chúng luôn hiện (`.js .ftabs-panel .reveal`, độ ưu tiên cao hơn `.js .reveal`, không phụ thuộc thứ tự trong file); không thêm `.reveal` vào chính panel.
- Dưới 900 px thanh tab nằm trọn một hàng ở 320 px (nhãn ngắn), không cuộn ngang.

## Các phần còn lại

- **Cách dùng:** bốn bước, mỗi bước một câu ≤ ~20 chữ, giữ ảnh màn hình chính. Đoạn ký mã còn một câu nói thẳng (macOS ký ad-hoc chưa notarize, Windows chưa ký mã nên hệ điều hành có thể cảnh báo ở lần mở đầu) kèm một vế nhắc Smart App Control ở chế độ chặn vẫn chặn bản Windows (bài cài Windows nói điều này bất kể cách cài), và hai liên kết tới bài cài macOS, Windows; chi tiết SmartScreen/Smart App Control đã nằm ở các bài đó. Một nút ("hướng dẫn bắt đầu nhanh").
- **Dữ liệu:** giữ `dataFlow` và hai thẻ, mỗi thẻ ≤ ~25 chữ. Câu liệt kê dữ liệu máy chủ lưu (test bắt nguyên văn "tin nhắn chat hỗ trợ khi bạn dùng chat (giữ 90 ngày)", "không có nội dung cuộc họp") đặt trong `<details>` "Máy chủ lưu những gì?" gập sẵn; chữ không đổi. Liên kết `/bao-mat-du-lieu/` giữ.
- **Hỏi đáp (6 câu):** gộp hai câu Zoom thành "Dùng được với Zoom, Teams, Google Meet, Zalo không?" (không cần bot, thử nghiệm nội bộ, không phải chứng nhận); giữ internet, âm thanh có bị gửi đi không, livestream, miễn phí, ngoài Việt Nam. Mỗi câu trả lời ≤ ~70 chữ, riêng câu livestream ≤ ~125 chữ; sáu câu cộng lại khoảng 420 chữ. Livestream giữ đủ các ý và điều kiện thử V1 (rút gọn lời, không đổi nghĩa): YouTube Live đã thử một lần, TikTok LIVE tiếng Việt có nhạc nền chưa dùng được, Facebook Live chưa thử; không có bản điện thoại, không đưa phụ đề vào buổi live của người phát; còn liên kết trang livestream. Câu "ngoài Việt Nam" giữ giá USD, "chưa gồm thuế" và câu giới hạn thẻ của Creem. JSON-LD `FAQPage` tự theo `HOME_FAQ`.
- `modified` của trang đổi thành 2026-10-27.

## Ràng buộc (test hiện có)

Mỗi chỗ cắt phải chạy `pnpm test` và, nếu test bắt một câu, giữ câu đó (đưa vào `<details>` nếu cần) thay vì xóa:

- `site.test.mjs`: cụm bắt buộc ở giá/Creem/USD (trang chủ và `/en/`), Gõ dịch ("Trả lời bằng tiếng của người bên kia", "không trừ thời lượng dịch"), câu liệt kê dữ liệu máy chủ (chat 90 ngày), câu hỏi đáp "ngoài Việt Nam" kèm giới hạn thẻ, tiêu đề phần giá "Bốn gói đơn giản, trả trước bằng VietQR hoặc thẻ quốc tế".
- `seo-targets.test.mjs`: "dịch livestream" ở title và thân trang chủ vi; cụm tiếng Anh ở title/mô tả/thân; trang chủ liên kết tới trang dịch livestream; câu hỏi livestream còn trong `summary` của Hỏi đáp; luật `STALE_LIVE` (V1).
- `i18n-content.test.mjs`: bản ja/zh/ko cùng khung (heading, id, ảnh, liên kết) với bản en; chặn câu tiếng Anh sót.
- `video-facade.test.mjs` và `i18n.test.mjs` (`demoVideoPair`): phải sửa theo bố cục tab (bấm tab trước khi bấm phát video Gõ dịch).
- Quy tắc nội dung của README: chỉ nói điều có thật, số đo kèm điều kiện đo, không nêu công nghệ lõi.

## Việc kèm theo

- Xóa `demoVideoPair` và CSS `.video-pair`, `.video-col`; đoạn "hai video cạnh nhau" trong `site.js`. Viết lại thành phần theo khối tab; `demoVideo` giữ.
- Test mới (Chrome không đầu qua `tools/browser/cdp.mjs`, theo mẫu `download-page.test.mjs`): tab mặc định, neo mở đúng tab, bàn phím, chuyển tab tạm dừng video, không tràn ngang ở 320/375/768/1280 px sáng và tối, bản tắt JS hiện đủ ba panel. Test cấu trúc: ba panel đủ id, mỗi panel có `<h3>`, thanh tab đủ nhãn ở năm ngôn ngữ.
- Cập nhật `website/README.md` (mục video trang chủ, cấu trúc trang chủ).
- Ảnh `overlay-default` và `compose-done` không còn dùng ở trang chủ; giữ file (kiểm các trang khác trước khi xóa, ngoài phạm vi lần này).

## Kiểm

- `pnpm test` (website) xanh; số test chỉ khác ở phần test thay/thêm.
- Đo trước và sau bằng `node tools/measure-home.mjs --browser` (trong `website/`): số chữ từng phần (vi và en, cùng cách đo như bảng trên), chữ hiện sẵn và chiều cao trang ở 1280 và 375 px (cả năm ngôn ngữ; chữ ja/zh/ko không tách bằng khoảng trắng nên chỉ để so trước và sau). Đạt khi số đo không lệch quá 10% so với mục tiêu chữ ở trên; lệch hơn thì sửa số mục tiêu cho khớp số đo. Số đo thực ghi ở cuối mục này khi làm xong.
- Ảnh chụp 1280 px năm ngôn ngữ và 375 px giao diện tối: không tràn ngang, tab đọc được, hình rõ.
- Chưa push, chưa deploy; chủ dự án tự quyết (quy trình `website/README.md`, `pnpm deploy`).

Số đo (2026-10-27, `node tools/measure-home.mjs --browser`, trang chủ tiếng Việt): tổng chữ trong HTML 2.163 → 1.777; chữ hiện sẵn 1.671 → 1.151; chiều cao trang ở 1280 px 11.108 → 8.231 px, ở 375 px 16.397 → 12.369 px. Tiếng Anh: tổng chữ 1.936 → 1.582. Số test: 304 (298 đạt, 6 bỏ qua) → 331 (325 đạt, 6 bỏ qua).

Bản vi lệch +4,5% (tổng) và +4,6% (hiện sẵn) so với mục tiêu 1.700 và 1.100, trong ngưỡng 10%, nên giữ nguyên số mục tiêu. Các ngôn ngữ còn lại (trước → sau): en chữ hiện sẵn 1.487 → 997, cao 1280 / 375 px 11.551 / 17.234 → 8.499 / 12.990; ja cao 11.302 / 16.699 → 8.250 / 12.532; zh cao 10.520 / 14.852 → 7.896 / 11.322; ko cao 10.541 / 15.225 → 7.895 / 11.526 (chữ hiện sẵn của ja, zh, ko không tách bằng khoảng trắng nên chỉ để so trước và sau: ja 351 → 288, zh 352 → 291, ko 1.108 → 762).

## Ngoài phạm vi

Hero, Bảng giá, lời mời cuối trang, các trang con (Tính năng, Hướng dẫn, Hỏi đáp…), nội dung hai video, ảnh app, chat hỗ trợ, header và chân trang, tên model và công nghệ lõi (vẫn không công bố).

## Rủi ro và cách giảm

- **Người lướt nhanh có thể không bấm sang Gõ dịch hay Lịch sử.** Thanh tab to, có icon, tab đầu mở sẵn; hero và nút Tải xuống không đổi; Gõ dịch còn ở bước 4 của phần Cách dùng.
- **Video trong tab ẩn:** nội dung vẫn có trong HTML (không JS thì hiện hết), nhưng không chắc Google còn chọn video làm kết quả video; trang chưa dựa vào đó. JSON-LD `VideoObject` giữ.
- **Bản ja/zh/ko do Claude viết, chưa có người bản ngữ duyệt** (đã chấp nhận từ trước); test chỉ bắt lệch cấu trúc, không bắt lệch nghĩa.
