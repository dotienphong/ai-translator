# Website tiếng Nhật, Trung, Hàn; video và ảnh theo ngôn ngữ; nút phát video — Design

**Ngày:** 2026-10-22
**Trạng thái:** Chủ dự án duyệt từng phần qua hội thoại ngày 2026-10-22. Làm ở worktree `meeting-translator-work/website-cjk`, nhánh `website-cjk`. Không merge, push hay deploy khi chủ dự án chưa cho phép; website chỉ deploy sau khi chủ dự án duyệt ảnh trang, và chủ dự án tự chạy `pnpm deploy`. Kế hoạch: `docs/superpowers/plans/2026-10-22-website-ja-zh-ko-0{1,2,3,4}-*.md`; thực thi xong 2026-10-22, chờ chủ dự án duyệt ảnh trang.
**Quan hệ:** website `docs/superpowers/specs/2026-10-08-marketing-website-design.md` và `website/README.md`; giao diện app ja/zh/ko `2026-10-12-ui-ja-zh-ko-design.md`; video `2026-10-21-demo-video-desktop-design.md` và `2026-10-21-website-demo-video-design.md`.

## 1. Mục tiêu

1. Website có thêm tiếng Nhật (`/ja/`), tiếng Trung giản thể (`/zh/`) và tiếng Hàn (`/ko/`) cho mọi trang trừ hai trang pháp lý.
2. Ảnh chụp app, ảnh chia sẻ (OG) và video giới thiệu có bản ja, zh, ko.
3. Video trên trang chủ (cả năm ngôn ngữ) có nút phát lớn ở giữa; trên máy tính, khi người xem cuộn tới video, nút đập nhịp mời bấm xem.

Ngoài phạm vi: dịch Điều khoản và Chính sách quyền riêng tư; `llms.txt` và `llms-full*.txt` (giữ vi/en); tự chuyển ngôn ngữ theo trình duyệt; tiếng Trung phồn thể; người bản ngữ duyệt bản dịch.

## 2. Đường dẫn và ngôn ngữ

| Ngôn ngữ | Tiền tố | `lang`, hreflang | `og:locale` | Tên trong menu |
|---|---|---|---|---|
| Tiếng Việt | `/` | `vi` | `vi_VN` | Tiếng Việt |
| English | `/en/` | `en` | `en_US` | English |
| 日本語 | `/ja/` | `ja` | `ja_JP` | 日本語 |
| 中文（简体） | `/zh/` | `zh-Hans` | `zh_CN` | 中文 |
| 한국어 | `/ko/` | `ko` | `ko_KR` | 한국어 |

- Đường dẫn ja/zh/ko = đường dẫn bản en, chỉ thay `/en/` bằng tiền tố của ngôn ngữ đó (`/ja/features/`, `/ja/guide/quick-start/`). Test giữ quy tắc này.
- Tiếng Trung là chữ giản thể, đúng quyết định của app (mọi locale zh ra giản thể).
- `x-default` vẫn trỏ tiếng Việt.
- Không tự chuyển ngôn ngữ theo trình duyệt (hại SEO, gây khó chịu); người đọc chọn ở menu ngôn ngữ.

### Pháp lý
- Không có `/ja/terms/`, `/ja/privacy/` (tương tự zh, ko). Chân trang và mọi liên kết trong trang ja/zh/ko dẫn tới `/en/terms/`, `/en/privacy/`, nhãn ghi rõ là bản tiếng Anh (ví dụ 「利用規約（英語）」).
- hreflang của hai trang này vẫn chỉ vi/en.
- Lý do: văn bản pháp lý dịch không có luật sư hay người bản ngữ duyệt thì rủi ro; app cũng hiện EULA/Privacy tiếng Anh cho ja/zh/ko.

## 3. Bộ dựng nhiều ngôn ngữ

- **Cấu hình `LANGS`** (file mới `website/src/langs.mjs`): mỗi ngôn ngữ một mục gồm mã, hreflang, tiền tố, `og:locale`, tên bản ngữ, locale của `Intl` (ngày, số) và cách viết giá.
- Khoảng 20 chỗ đang viết `lang === "vi" ? … : …` hay `["vi", "en"]` (`layout.mjs`, `build.mjs`, `schema.mjs`, `components.mjs`, `plans.mjs`, `content/index.mjs`, `content/legal.mjs`) đổi sang đọc `LANGS`. vi và en cho ra HTML như cũ: so `dist/` trước và sau bước này, chỉ được khác ở menu ngôn ngữ, hreflang và sitemap.
- **Chuỗi khung trang:** `T`, `NAV`, `FOOTER`, `RELEASE` trong `site.mjs` thêm ja, zh, ko; nhãn bảng của `glue()` ("Tiêu chí", "Bảng dữ liệu") lấy theo ngôn ngữ. Luật nbsp tiếng Việt của `glue()` không áp cho ja/zh/ko.
- **Ngày:** ja và zh `2026年10月22日`, ko `2026년 10월 22일` (`Intl.DateTimeFormat`, `dateStyle: "long"`).
- **Giá:** ja/zh/ko viết USD là `US$3.99` (không nhầm với yên hay nhân dân tệ), VND là `269,000 ₫`. Giá vẫn lấy từ `plans.mjs`.
- **Danh mục trang:** `content/index.mjs` nạp `{vi,en}` cho mọi id và `{ja,zh,ko}` cho mọi id trừ `terms`, `privacy`.
- **Sitemap** liệt kê đủ hreflang của từng nhóm. **JSON-LD:** `inLanguage` của trang theo `lang`; `inLanguage` của WebSite và `availableLanguage` thêm ja, zh-Hans, ko ở chỗ nói về nội dung trang. `availableLanguage` của hỗ trợ khách hàng giữ vi, en (mục 5).
- **Trang 404:** thêm liên kết về trang chủ ja, zh, ko.

### Menu ngôn ngữ
- Thay "VI | EN" bằng menu thả xuống `<details>` (chạy cả khi tắt JS): nút có biểu tượng địa cầu và tên ngôn ngữ đang xem (trên điện thoại chỉ còn biểu tượng và mã, ví dụ `JA`); danh sách năm tên bản ngữ, mỗi mục có `lang` và `hreflang` đúng.
- Mục trỏ tới trang tương ứng của ngôn ngữ kia; trang không có bản đó (pháp lý) thì trỏ trang chủ ngôn ngữ ấy.
- Bấm ra ngoài hay nhấn Esc thì đóng (JS); không JS thì đóng bằng cách bấm lại nút.

### Phông chữ
- Be Vietnam Pro không có chữ Hán, kana, Hangul. Trang ja/zh/ko dùng phông có sẵn của máy qua `:lang()`: ja `"Hiragino Sans", "Yu Gothic UI", "Yu Gothic", "Meiryo"`; zh `"PingFang SC", "Microsoft YaHei"`; ko `"Apple SD Gothic Neo", "Malgun Gothic"`; chữ Latin trong trang vẫn dùng Be Vietnam Pro đứng trước.
- Không tải phông từ ngoài và không tự lưu phông CJK (quá nặng): giữ CSP `default-src 'self'` và lời hứa không dùng tài nguyên bên thứ ba.
- Tiếng Hàn thêm `word-break: keep-all`; ja/zh dùng `line-break: strict`. Không đổi cỡ chữ.

## 4. Nút phát video (cả năm trang chủ)

- **Khi chưa phát:** ảnh bìa tĩnh, nút tròn lớn ở giữa khung (khoảng 96 px trên máy tính, 72 px trên điện thoại), bên dưới là nhãn dạng viên thuốc "Bấm để xem · 0:40 · có tiếng" theo ngôn ngữ trang. Bấm vào bất kỳ đâu trên khung đều phát. Rê chuột thì nút phóng nhẹ và sáng hơn. Phím Tab tới được nút, có viền tiêu điểm.
- **Hiệu ứng khi cuộn tới**, chỉ trên máy tính (`(hover: hover) and (pointer: fine)` và rộng từ 900 px): khi hơn nửa khung video vào màn hình (IntersectionObserver), nhãn trượt lên và nút đập nhịp, vòng sáng lan ra ba lần rồi dừng. Mỗi lần mở trang chỉ chạy một lần. Người bật giảm chuyển động (`prefers-reduced-motion: reduce`) và mọi màn hình khác: nút và nhãn hiện sẵn, đứng yên.
- **Khi bấm:** bật thanh điều khiển gốc, phát có tiếng từ đầu, ẩn nút và nhãn. Video vẫn `preload="none"`: trước khi bấm không tải byte nào của MP4. `play()` lỗi thì bỏ lớp phủ, để lại thanh điều khiển gốc.
- **Không JS (hay `site.js` không chạy):** giữ nguyên `<video controls>` như hiện nay; nút lớn chỉ hiện khi `site.js` đã gắn lớp vào khung (không có nút "chết").
- **Thời lượng** ("0:40" và `duration` của `VideoObject`) đọc từ hộp `mvhd` của chính file MP4 lúc dựng, không gõ tay (hiện `PT40S`, `PT39S` đang gõ tay).
- Nút là `<button type="button">` thật, `aria-label` nói đủ "phát video demo, 0:40, có tiếng". Mã ở `site.css` và `site.js` (không script nội tuyến, CSP không đổi). Hình tam giác vẽ bằng SVG trong sprite sẵn có.

## 5. Nội dung và dịch thuật

- **Bản gốc để dịch là trang tiếng Anh** (đã viết cho khách nước ngoài: thẻ quốc tế bằng USD là cách trả mặc định, ảnh Nâng cấp là cảnh USD), đối chiếu thêm bản tiếng Việt khi cần. Mỗi trang ja/zh/ko giữ đúng khung bản en: cùng các mục, ảnh, liên kết, câu hỏi FAQ (cả trong JSON-LD), số đo kèm điều kiện đo.
- **Bảng thuật ngữ** cho mỗi ngôn ngữ, lấy từ chuỗi giao diện thật của app (`src/i18n/{ja,zh,ko}.ts`): mọi nhãn nút, tên mục cài đặt nhắc trong bài phải trùng từng chữ với app (Gõ dịch là 入力翻訳 / 输入翻译 / 입력 번역). Tên mục của macOS, Windows dùng tên chính thức theo ngôn ngữ đó (ví dụ 「システム設定」›「プライバシーとセキュリティ」). Bảng nằm trong kế hoạch thực thi, là đầu vào chung cho mọi trang của một ngôn ngữ.
- **Chỗ khác bản tiếng Anh:**
  - Hỗ trợ: Liên hệ và Hỏi đáp nói rõ email hỗ trợ trả lời bằng tiếng Anh hoặc tiếng Việt (chủ dự án chưa nói trả lời được ja/zh/ko; nếu có thì sửa).
  - Thanh toán: cách chính là thẻ quốc tế bằng USD (giá chưa gồm thuế); VietQR nhắc như bản en, cho người có tài khoản ngân hàng Việt Nam.
  - Danh sách app đã thử giữ đúng sự thật (Zoom, Teams, Meet, Zalo PC). Không thêm LINE, WeChat, KakaoTalk vì chưa thử.
- **Mọi quy tắc nội dung của `website/README.md` áp nguyên cho ja/zh/ko:** chỉ nói điều có thật, không công bố công nghệ lõi, hai cách trả, báo cáo lỗi tự động, Gõ dịch (sáu phím tắt, phụ đề dịch một chiều), không cookie hay analytics.
- **SEO cho chữ CJK:** tiêu đề tối đa 40 ký tự, mô tả 50 đến 120 ký tự (một ký tự CJK rộng gần gấp đôi chữ Latin trên kết quả tìm kiếm). vi/en giữ ngưỡng cũ (tiêu đề 15–70, mô tả 90–165).
- **Không có người bản ngữ duyệt:** Claude viết bản dịch, như lần làm giao diện app ngày 2026-10-12 (chủ dự án đã chốt bỏ qua khâu duyệt). Rủi ro: câu chữ thiếu tự nhiên hay sai sắc thái; không ảnh hưởng số liệu vì số liệu, giá, liên kết có test.
- **Giữ đồng bộ về sau:** sửa nội dung một trang vi/en thì sửa luôn ba bản ja/zh/ko (ghi vào `website/README.md`). Test đối chiếu khung (mục 8) chỉ bắt lệch cấu trúc, không bắt lệch nghĩa.

## 6. Ảnh

- **Ảnh chụp app** (`website/src/assets/img/app/`): `scripts/ui-preview/shoot.mjs` thêm ja, zh, ko vào vòng lặp ngôn ngữ và chụp bằng giao diện thật của app (IPC giả), khoảng 30 ảnh mỗi ngôn ngữ. Cảnh Nâng cấp dùng cảnh USD như trang en. Mô tả trong `manifest.json` và `alt` trong trang viết theo từng ngôn ngữ, tả đúng cảnh và dùng đúng nhãn trên màn hình của ngôn ngữ đó. Quy tắc cắt phần lộ tên thư viện vẫn áp.
- **Ảnh chia sẻ OG** (`tools/og/render.mjs`): 12 ảnh mỗi ngôn ngữ, tiêu đề và dòng phụ dịch theo ngôn ngữ; câu phụ đề minh họa là "EN → JA" (zh "EN → ZH", ko "EN → KO") với câu nguồn tiếng Anh. Template dùng phông CJK có sẵn của macOS.

## 7. Video ja, zh, ko

- Ba file `website/src/assets/video/ai-translator-demo.{ja,zh,ko}.mp4` và ảnh bìa `.webp`, khung 16:10 1920×1200, dựng bằng bộ `scripts/demo-video` hiện có (kịch bản mới `script.desktop.{ja,zh,ko}.json`).
- **Giọng:** dùng lại bản thu tiếng Anh (Ava) và bốn câu của bản tiếng Việt, không thu giọng mới. `data.mjs` được nới để một kịch bản dùng lại bản thu của kịch bản khác.
- **Phụ đề:** chạy pipeline thật với đích `ja`, `zh`, `ko` (`latency-bench session`, cài đặt như bản vi). Không sửa tay `data/*.json`.
- **Gõ dịch:** người xem gõ câu trả lời bằng tiếng của mình, dịch sang tiếng Anh bằng đúng hàm dịch của ô soạn (`mt-eval` biến thể `plain`). Câu đề xuất (chốt ở kế hoạch): ja 「承知しました。金曜日までに新しい見積もりをお送りします。」, zh 「好的，我会在周五之前把新的报价发给您。」, ko 「네, 금요일 전까지 새 견적서를 보내드리겠습니다.」
- **Màn hình:** giao diện app, nhãn cảnh, ô chat (tên nhóm, "Hôm qua", "Đang hoạt động"…), giờ và ngày trên thanh tác vụ theo từng ngôn ngữ (ja `2026/10/21`, zh `2026/10/21`, ko `2026-10-21`). Giữ các quyết định cũ: màn hình Windows 11, phím Ctrl + Alt + G, không logo hay tên Teams/Meet/Messenger/Windows/Apple, chỉ ảnh đại diện, màn kết không có dòng chữ nhỏ, không số đo tốc độ.
- **Chữ CJK trong video:** phông có sẵn của macOS (Hiragino Sans, PingFang SC, Apple SD Gothic Neo) đứng sau Noto Sans; không thêm file phông vào repo. Gõ chữ CJK từng ký tự với nhịp chỉnh sao cho đoạn gõ dài tương đương bản vi (không mô phỏng bộ gõ IME).
- **Kiểm chữ:** Claude đọc từng câu phụ đề và câu Gõ dịch ja/zh/ko. Câu dịch sai nghĩa thì báo chủ dự án trước khi dùng; không tự sửa dữ liệu.
- Trang chủ ja/zh/ko nhúng video của ngôn ngữ mình, có `VideoObject` (mô tả: đồng nghiệp nói tiếng Anh, phụ đề hiện bằng ngôn ngữ trang, rồi Gõ dịch đổi câu trả lời sang tiếng Anh).

## 8. Kiểm thử

- **Test hiện có chạy cho cả năm ngôn ngữ:** title/description (ngưỡng theo mục 5), đúng một h1, hreflang đối xứng có x-default, liên kết nội bộ, JSON-LD, CSP, không `style=` nội tuyến, không lộ công nghệ lõi, giá khớp `server/wrangler.jsonc`.
- **Không lộ công nghệ lõi:** thêm dạng phiên âm CJK phổ biến của các tên bị cấm (ví dụ ウィスパー, 위스퍼, 混元).
- **Đối chiếu khung với bản en** (mỗi trang ja/zh/ko): cùng số h2 và h3, cùng tập ảnh (chỉ khác hậu tố ngôn ngữ), cùng đích liên kết nội bộ (sau khi đổi tiền tố; liên kết pháp lý trỏ `/en/`), cùng số câu FAQ trong JSON-LD, cùng các giá.
- **Chặn chữ sót:** thân trang ja/zh/ko không còn câu tiếng Anh dài (từ năm từ Latin liền nhau trở lên ngoài `<code>`, `<kbd>`, tên sản phẩm và danh sách miễn trừ).
- **Ảnh và video:** mọi ảnh và video mà trang ja/zh/ko dùng có trong `dist`, đúng hậu tố ngôn ngữ; mỗi trang chủ có đúng một video của ngôn ngữ mình.
- **Menu ngôn ngữ:** mỗi trang có năm mục, mục hiện tại có `aria-current`, đích đúng theo nhóm trang.
- **Trình duyệt thật** (`tools/browser/cdp.mjs`, Chrome không đầu):
  - Nút phát: hiện khi có JS, ẩn khi tắt JS (còn `controls`); bấm thì video phát và có `controls`; trước khi bấm không có yêu cầu tải MP4; hiệu ứng chỉ gắn một lần khi cuộn tới, không gắn ở 375 px hay khi giảm chuyển động.
  - Năm trang chủ ở 320, 375, 768, 1280 px, sáng và tối: không tràn ngang (phông CJK, menu ngôn ngữ).
- **Bộ video:** test của `scripts/demo-video` phủ kịch bản mới (dùng lại bản thu, định dạng ngày theo ngôn ngữ).
- Trước khi gửi duyệt: `pnpm test` của website, test `scripts/demo-video`, và ảnh chụp năm trang chủ cùng một trang hướng dẫn mỗi ngôn ngữ cho chủ dự án xem.

## 9. Thứ tự làm

1. Bộ dựng nhiều ngôn ngữ, menu ngôn ngữ, phông chữ, test khung; nút phát video (dùng được ngay cho vi/en).
2. Bảng thuật ngữ ba ngôn ngữ; dịch 23 trang × 3.
3. Chụp ảnh app ja/zh/ko; sinh ảnh OG.
4. Dựng ba video và ảnh bìa; nhúng vào trang chủ.
5. Rà toàn bộ, cập nhật `website/README.md` và `CLAUDE.md` (website năm ngôn ngữ), gửi chủ dự án ảnh trang để duyệt; sau đó chờ lệnh merge, push, deploy.

## 10. Rủi ro

- **Bản dịch không có người bản ngữ duyệt** (mục 5).
- **Video:** phụ đề là kết quả thật của model; cặp Anh sang Nhật, Trung, Hàn có thể có câu kém. Xử lý theo mục 7 (báo chủ dự án, không sửa tay).
- **Lệch nội dung giữa các ngôn ngữ về sau:** mỗi lần sửa nội dung phải sửa năm bản; test chỉ bắt lệch cấu trúc.
- **Dung lượng:** thêm khoảng 6 MB video và khoảng 90 ảnh WebP; mỗi file vẫn dưới giới hạn 25 MiB của Workers Static Assets.
