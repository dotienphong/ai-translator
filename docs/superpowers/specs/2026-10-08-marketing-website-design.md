# Website marketing `aitranslator.io.vn` — Design

**Ngày:** 2026-10-08
**Trạng thái:** Chủ dự án giao việc và duyệt hướng ngày 2026-10-08 qua hội thoại: website là hệ thống marketing để quảng bá và bắt đầu thương mại hóa AI Translator; đạt chuẩn SEO tối đa và tìm kiếm AI; bám sát tính năng thật của app để người dùng hiểu và dùng được; UI/UX làm thật kỹ, kiểm thử tới khi hết lỗi.
**Quan hệ với spec khác:** thay chỗ "website, để dành" của `2026-10-06-custom-domain-design.md` (mục 3) và chỗ "Website: sẽ có spec riêng" của spec gốc (§15). Văn bản pháp lý lấy nguyên từ `docs/legal/` (xem mục 6).

---

## 1. Mục tiêu và ngoài phạm vi

**Mục tiêu**
1. Người truy cập hiểu trong 10 giây AI Translator làm gì, cho ai, khác gì phần mềm cloud.
2. Người dùng mới làm theo hướng dẫn là cài, cấp quyền, bật dịch được mà không cần hỏi.
3. Công cụ tìm kiếm và trợ lý AI (Google, Bing, ChatGPT, Claude, Perplexity…) trích dẫn đúng sản phẩm, giá, giới hạn.
4. Đủ tin cậy cho người duyệt (ví dụ chương trình Claude for Startups): chủ sở hữu, liên hệ, chính sách, giá, trạng thái phát hành công khai và trung thực.

**Ngoài phạm vi (làm sau, có spec riêng nếu cần):** nút tải trực tiếp (chưa có bản phát hành công khai: `latest.json` 404 ngày 2026-10-08; trang "Tải xuống" là đăng ký nhận bản beta qua email), thanh toán trên web (mua trong app qua PayOS), blog liên tục, analytics, biểu mẫu thu dữ liệu, đăng nhập.

## 2. Nguyên tắc nội dung

- **Chỉ nói điều có thật.** Mọi tính năng, số liệu, giới hạn lấy từ spec/mã/giao diện và có dẫn nguồn trong bảng dữ kiện lúc viết. Không lời chứng thực, không điểm đánh giá, không logo khách hàng, không số liệu chưa kiểm chứng. Số đo ghi rõ điều kiện đo.
- **Trung thực về trạng thái:** Beta; macOS 14.2+ trên Apple Silicon; Windows "sắp có"; bản macOS ký ad-hoc (chưa Developer ID) nên hướng dẫn mở app lần đầu phải nói rõ.
- **Không so sánh giá hay chê bên thứ ba.** Chỉ nêu khác biệt kiến trúc (offline so với cloud) theo spec §1.
- **Nhãn hiệu:** tên Zoom, Teams, Meet, Zalo chỉ là chữ thường để nói về khả năng tương thích, kèm câu miễn trừ ở chân trang.
- **Hai ngôn ngữ ngang hàng:** tiếng Việt ở `/` (ngôn ngữ chính), tiếng Anh ở `/en/`; mỗi trang có bản đôi, hreflang đối xứng. Không tự chuyển ngôn ngữ theo `Accept-Language` (hại SEO).
- Thông tin pháp lý: bên cung cấp Đỗ Tiến Phong (cá nhân), `support@aitranslator.io.vn`, không công bố địa chỉ (đã chốt). Rủi ro đăng ký kinh doanh/thông báo website bán hàng với Bộ Công Thương đã nằm ở `docs/legal/README.md` và spec gốc §15; website không giải quyết, chỉ không nói sai.

## 3. Kiến trúc kỹ thuật

- **Tĩnh, không thư viện.** `website/` có bộ sinh Node thuần (`src/build/build.mjs`), không framework, không dependency chạy (chỉ `wrangler` để deploy). Lý do: tốc độ (Core Web Vitals), bề mặt tấn công bằng không, đúng quy tắc phiên bản thư viện (CLAUDE.md): không thêm gì để phải theo dõi.
- **Nguồn nội dung:** `src/content/vi/*.mjs` và `src/content/en/*.mjs`, mỗi trang một module; khối giao diện dùng lại ở `src/build/components.mjs`; khung trang (head SEO, header, footer, JSON-LD) ở `layout.mjs` và `schema.mjs`. Giá và hạn mức ở `src/plans.mjs`, có test đối chiếu `server/wrangler.jsonc` để không bao giờ lệch.
- **Đầu ra `dist/`:** HTML từng trang, `assets/bundle/site.<hash>.css|js` (băm nội dung, cache immutable), `sitemap.xml` (có hreflang), `robots.txt`, `llms.txt`, `llms-full.txt`, `_headers`, `404.html`, `.well-known/security.txt`, `site.webmanifest`.
- **Hosting:** Cloudflare Workers Static Assets (miễn phí cho tài nguyên tĩnh), Worker `ai-translator-site`, custom domain `aitranslator.io.vn`. Worker thứ hai `ai-translator-www` chỉ chuyển hướng 301 `www.` → gốc. `html_handling: auto-trailing-slash`, `not_found_handling: 404-page`. Không đụng `mt-license` (`api.`), R2 (`releases.`), MX/SPF/DMARC.
- **Bảo mật:** CSP chặt (`default-src 'self'`; chỉ một script nội tuyến được băm SHA-256, tự sinh vào `_headers`; không `unsafe-inline`; không CSS/JS/font từ bên thứ ba), HSTS, `nosniff`, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy. Font Be Vietnam Pro (OFL) tự host. Không cookie, không analytics, không script bên thứ ba: khớp lời hứa quyền riêng tư của sản phẩm.
- **Truy cập và hiệu năng:** HTML ngữ nghĩa, WCAG 2.1 AA, sáng/tối theo hệ thống và nút đổi, `prefers-reduced-motion`, bố cục co giãn tới 320 px, ảnh có width/height (không CLS), font preload. JS chỉ để nâng cấp (nút giao diện, menu), trang đầy đủ khi tắt JS.

## 4. SEO và tìm kiếm AI

- Mỗi trang: `title` duy nhất ≤ 70 ký tự, `meta description` 90–165 ký tự, canonical tuyệt đối, hreflang vi/en/x-default đối xứng, robots `index, follow, max-image-preview:large`, Open Graph và Twitter Card với ảnh 1200×630 riêng, `lang` đúng.
- **JSON-LD** (`@graph`): `Organization` (có `founder`), `WebSite`, `WebPage`/`Article`, `BreadcrumbList`; `SoftwareApplication` (kèm `Offer` đúng ba gói, VND) ở trang chủ, tính năng, giá, tải xuống; `FAQPage` ở trang hỏi đáp; `HowTo` ở bài bắt đầu nhanh. Không có `aggregateRating` hay `Review` (không có dữ liệu thật).
- **Sitemap** có `lastmod` và `xhtml:link` hreflang; **robots.txt** cho phép mọi trình thu thập, kể cả bot AI (OAI-SearchBot, GPTBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot…) và khai `Content-Signal: search=yes, ai-input=yes, ai-train=yes`. Muốn chặn huấn luyện AI: đổi dòng đó và thêm Disallow cho các bot huấn luyện (ghi chú ngay trong file).
- **GEO (trợ lý AI):** mỗi trang mở bằng câu trả lời ngắn, tự đủ nghĩa (đoạn "tóm tắt"), thực thể rõ (tên, loại sản phẩm, nền tảng, giá, bên cung cấp), bảng và danh sách có cấu trúc, FAQ trả lời thẳng; `llms.txt` (mục lục có mô tả) và `llms-full.txt` (toàn văn các trang chính, vi + en).
- **Kiến trúc thông tin:** trang chủ → tính năng, giải pháp, hướng dẫn, giá, hỏi đáp, so sánh, về chúng tôi, dữ liệu và bảo mật, liên hệ, pháp lý; liên kết nội bộ chéo có chủ đích; breadcrumb mọi trang con.
- **Cloudflare có thể chặn bot AI theo mặc định cho tên miền mới** (cài đặt của zone, không nằm trong repo). Sau deploy phải kiểm bằng `curl -A GPTBot` và tắt chặn ở dashboard nếu cần (không có token zone trên máy: chủ dự án làm).

## 5. Danh mục trang (VI | EN)

| Nhóm | Trang |
|---|---|
| Chính | `/` · `/en/` |
| Sản phẩm | `/tinh-nang/` · `/en/features/`; `/bang-gia/` · `/en/pricing/`; `/tai-xuong/` · `/en/download/` (đăng ký bản beta) |
| Giải pháp | `/giai-phap/` hub; họp trực tuyến (Zoom/Teams/Meet); webinar và video |
| Hướng dẫn | `/huong-dan/` hub; bắt đầu nhanh; cài đặt macOS; cấp quyền thu âm; thanh phụ đề và phím tắt; từ điển thuật ngữ; lịch sử và xuất file; mua và kích hoạt key; khắc phục sự cố |
| So sánh | dịch offline và dịch cloud |
| Niềm tin | về chúng tôi; dữ liệu và bảo mật; liên hệ |
| Hỏi đáp | `/cau-hoi-thuong-gap/` · `/en/faq/` |
| Pháp lý | điều khoản (EULA) và chính sách quyền riêng tư, sinh từ `docs/legal/` |

Danh sách cuối cùng bám bảng dữ kiện (`facts`): trang nào không có đủ sự thật để viết thì không tạo.

## 6. Pháp lý trên web

`docs/legal/*.md` là nguồn duy nhất (app đóng gói chính các file đó). Bộ sinh chuyển Markdown → HTML (`src/build/markdown.mjs`, cùng tập cú pháp với `src/lib/markdown.ts`), nên sửa văn bản ở một chỗ là sửa cả app lẫn website. Văn bản chưa qua luật sư (README của `docs/legal`); trang web ghi phiên bản và ngày hiệu lực đúng như file.

## 7. Kiểm thử

- `pnpm test` (node:test): title/description/canonical/h1, hreflang đối xứng, HTML cân bằng thẻ, không `style=` hay sự kiện nội tuyến, mọi ảnh có alt/width/height, mọi liên kết nội bộ và neo tồn tại, JSON-LD hợp lệ và `@id` không trùng, sitemap/robots/llms.txt, CSP khớp băm script, **giá khớp `server/wrangler.jsonc`**, không chữ giữ chỗ, trang tiếng Việt có dấu.
- Duyệt bằng trình duyệt thật (Chrome qua Playwright, chạy ngoài repo): axe WCAG 2.1 AA, cuộn ngang, CLS/LCP, lỗi console/CSP, ảnh hỏng, ở ba khung (máy tính sáng, điện thoại, máy tính tối) cho mọi trang.
- Lighthouse và các kiểm SEO/GEO/schema/nội dung chạy trên bản dựng trước deploy; sửa tới khi sạch.
- Sau deploy: `curl` kiểm 200, `www` → 301, header bảo mật, `robots.txt`, `sitemap.xml`, bot AI không bị chặn, `api.`/`releases.`/MX không đổi.

## 8. Triển khai

`website/wrangler.jsonc` (Worker `ai-translator-site`, assets `dist`, custom domain gốc) và `website/wrangler.www.jsonc` (Worker chuyển hướng `www`). Lệnh: `pnpm build && wrangler deploy && wrangler deploy -c wrangler.www.jsonc` trong `website/` bằng phiên đăng nhập wrangler của chủ dự án (đã có quyền workers, routes, ssl, email_routing). Đường lui: `wrangler delete` Worker site thì tên miền gốc trở lại không có trang (như trước), mọi thứ khác không đổi. Cập nhật `docs/release/phat-hanh.md` thêm mục website.

## 9. Việc làm sau (không thuộc đợt này)

Nút tải xuống thật (khi có bản phát hành công khai và quyết định về ký Developer ID), nội dung blog, trang Windows, hóa đơn và thông tin doanh nghiệp theo luật thương mại điện tử, `EXTERNAL_HOSTS` của app thêm `aitranslator.io.vn` (`src-tauri/src/navigation.rs`) khi app cần mở link website, analytics không cookie nếu chủ dự án muốn đo.
