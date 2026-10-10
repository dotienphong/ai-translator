# Website marketing `aitranslator.io.vn`

Website tĩnh hai ngôn ngữ (tiếng Việt ở `/`, tiếng Anh ở `/en/`) cho AI Translator. Thiết kế: `docs/superpowers/specs/2026-10-08-marketing-website-design.md`. Không framework, không dependency chạy: bộ sinh Node thuần; chỉ `wrangler` (devDependency) để deploy.

## Lệnh (trong `website/`)

| Lệnh | Làm gì |
|---|---|
| `pnpm build` | Sinh `dist/` (HTML, CSS/JS băm nội dung, sitemap, robots, llms.txt, `_headers`) |
| `pnpm dev` | Dựng rồi phục vụ `dist/` ở http://127.0.0.1:4173 (mô phỏng Workers Static Assets, áp `_headers` kể cả CSP) |
| `pnpm test` | Test SEO/HTML/liên kết/JSON-LD/CSP và **giá khớp `server/wrangler.jsonc`** |
| `pnpm deploy` | Build, deploy Worker `ai-translator-site` (gốc) và `ai-translator-www` (www → gốc) |

Biến môi trường: `WEBSITE_DIST` (thư mục dựng khác `dist/`, để dựng song song), `ALLOW_PARTIAL=1` (cho phép thiếu trang khi đang viết dở).

## Cấu trúc

```
src/site.mjs            thông tin site, chuỗi giao diện, điều hướng, chân trang (vi/en)
src/plans.mjs           ba gói, giá, hạn mức (test đối chiếu server/wrangler.jsonc)
src/content/index.mjs   danh mục trang (id → vi/<id>.mjs, en/<id>.mjs)
src/content/{vi,en}/    mỗi trang một module: { id, lang, path, title, description, body, ... }
src/content/legal.mjs   trang điều khoản/chính sách sinh từ docs/legal/*.md (nguồn duy nhất)
src/build/              bộ sinh: build, layout (head SEO), schema (JSON-LD), components, icons, markdown, text
src/assets/             site.css, site.js, font Be Vietnam Pro (OFL), ảnh (img/, og/, app/)
src/public/             favicon, manifest, install.sh và install.ps1 (script cài macOS và Windows) (chép nguyên vào gốc dist/)
tools/og/               sinh ảnh chia sẻ 1200×630 từ template.html (cần Google Chrome)
```

## Thêm một trang
1. Tạo `src/content/vi/<id>.mjs` và `src/content/en/<id>.mjs` (xem `vi/pricing.mjs` làm mẫu), cùng `id`, đường dẫn kết thúc bằng `/`.
2. Thêm `<id>` vào `IDS` và `FILE` trong `src/content/index.mjs`; thêm liên kết ở `src/site.mjs` (NAV/FOOTER) nếu cần.
3. `pnpm test`: title ≤ 70 ký tự, description 90–165 ký tự, đúng một h1, hreflang đối xứng, liên kết nội bộ không hỏng, không `style=` nội tuyến.

## Quy tắc
- **Chỉ nói điều có thật** về sản phẩm (không số liệu, lời chứng thực hay tính năng tưởng tượng). Số đo hiệu năng luôn kèm điều kiện đo. Trạng thái (bản 0.1.5 đã phát hành chính thức, cài bằng một dòng lệnh trên macOS và Windows; macOS ký ad-hoc chưa notarize, Windows chưa ký mã nên SmartScreen có thể cảnh báo khi tải .exe bằng trình duyệt) phải đúng với repo.
- **Không công bố công nghệ lõi:** không nêu tên model (nhận dạng, dịch, phát hiện tiếng nói), tên engine/thư viện chạy model, định dạng và mức lượng tử hóa, khung ứng dụng, ngôn ngữ lập trình, kiến trúc tiến trình/cổng nội bộ, API hệ điều hành dùng để thu âm, tên model/bộ so sánh trong số đo chất lượng. Chỉ nói "model AI chạy trên máy", "nhận dạng giọng nói", "dịch". Số đo vẫn giữ (kèm điều kiện đo) nhưng không gắn tên model. Thông báo giấy phép bên thứ ba nằm trong app (Giới thiệu › Giấy phép mã nguồn mở). Ảnh chụp app phải cắt bỏ phần lộ tên thư viện (danh sách giấy phép, màn hình Model nếu hiện tên). Test `không lộ công nghệ lõi` chặn các từ khóa này.
- Đổi giá ở `server/wrangler.jsonc` thì đổi cả `src/plans.mjs` và mọi chỗ nhắc giá trong `src/content/` (test báo lệch giá/hạn mức).
- Không cookie, không analytics, không script hay font của bên thứ ba (khớp lời hứa quyền riêng tư; CSP `default-src 'self'`).
- Ảnh chụp giao diện app (`src/assets/img/app/`) chụp bằng giao diện thật chạy trong Chrome với IPC giả (`scripts/ui-preview/`: chạy `pnpm exec vite --config scripts/ui-preview/vite.config.ts` ở gốc repo, rồi `node scripts/ui-preview/shoot.mjs`; script ghi WebP và cập nhật dung lượng, kích thước trong `manifest.json`); chụp lại khi giao diện app đổi, sửa tay mô tả (alt) nếu cảnh đổi.

## Trang Tải xuống: tab hệ điều hành
`/tai-xuong/` và `/en/download/` có hai tab (macOS, Windows) do `osTabs` trong `src/build/components.mjs` dựng, `initOsTabs` trong `src/assets/site.js` điều khiển. **Không có JS:** thanh tab ẩn, cả hai hướng dẫn hiện lần lượt (đủ nội dung cho người đọc và công cụ tìm kiếm). **Có JS:** nhận diện hệ điều hành bằng `navigator.userAgentData.platform`/`platform`/UA (iPhone, iPad ở chế độ máy tính có cảm ứng, Android → lời nhắn "mở trên máy tính" kèm nút Sao chép liên kết; Linux, ChromeOS → báo chưa hỗ trợ), mở sẵn tab đúng và gắn nhãn "Máy của bạn". Thứ tự ưu tiên: neo `#` trên URL (`#cai-macos`, `#cai-windows`, `#install-macos`, `#install-windows`, các trang khác đang dùng) > lựa chọn tay trong phiên (`sessionStorage`) > nhận diện > tab đầu. Bàn phím: mũi tên, Home, End (tab tự kích hoạt, tiêu điểm đi theo). Khối lệnh `cmdBlock` là cửa sổ terminal có nút Sao chép (không dùng `.reveal`: nó nằm trong tab ẩn nên IntersectionObserver không bao giờ hiện nó). Thêm hệ điều hành thứ ba: thêm một phần tử vào `tabs` của hai trang `download.mjs`.

**Kiểm thử trình duyệt thật:** `test/download-page.test.mjs` điều khiển Chrome không đầu qua `tools/browser/cdp.mjs` (Chrome DevTools Protocol, không thêm thư viện; cần Google Chrome, đặt `CHROME=<đường dẫn>` nếu ở chỗ khác; không có thì bỏ qua). Kiểm nhận diện theo user-agent (Mac, Windows, iPhone, iPad, Android, Linux), neo, bấm tab, bàn phím, nút Sao chép, không tràn ngang ở 320/375/768/1280 px sáng và tối, và bản tắt JS. `tools/browser/cdp.mjs` còn dùng chụp ảnh kiểm giao diện (`page.screenshot(file, { full, clipSelector })`).

## Script cài macOS (`src/public/install.sh`)
Trang Tải xuống và hướng dẫn cài macOS đưa lệnh `curl -fsSL https://aitranslator.io.vn/install.sh | bash`. Script đọc `releases.aitranslator.io.vn/<kênh>/latest.json`, tải `AI Translator_<version>_aarch64.dmg` và `SHA256SUMS-macos.txt` của bản đó, đối chiếu SHA-256, kiểm chữ ký và mã định danh của app, chép vào Applications rồi mở. File tải bằng `curl` không mang cờ quarantine nên Gatekeeper không chặn bản chưa notarize. Script **phụ thuộc cấu trúc R2 do `scripts/release/publish-release.mjs` đăng** (tên file, `latest.json`); `test/install-script.test.mjs` khóa hợp đồng đó và chạy script thật (curl giả, .dmg giả; chỉ trên Mac Apple Silicon). Sửa `install.sh` thì chạy `pnpm test`, rồi `pnpm deploy`: script là file tĩnh nên có hiệu lực ngay sau deploy (cache 5 phút). Thiết kế: `docs/superpowers/specs/2026-10-09-macos-curl-install-design.md`.

## Script cài Windows (`src/public/install.ps1`)
Lệnh `irm https://aitranslator.io.vn/install.ps1 | iex` (PowerShell). Script đọc `<kênh>/latest.json`, tải `AI Translator_<version>_x64-setup.exe` và `SHA256SUMS-windows.txt`, đối chiếu SHA-256, chạy bộ cài NSIS im lặng (`/S`, cài cho riêng người dùng) rồi mở app. Tải bằng PowerShell nên file không mang dấu "tải từ internet" và SmartScreen không kiểm; Smart App Control chế độ chặn vẫn chặn bản chưa ký. Không BOM (BOM làm `iex` lỗi), không `exit`. `test/install-ps1.test.mjs` khóa hợp đồng với release và chạy các hàm thuần bằng PowerShell 7 (đặt `PWSH=<đường dẫn pwsh>` hoặc để `pwsh` trong PATH; không có thì bỏ qua). **Phần chạy thật (cài bộ NSIS) chỉ kiểm được trên Windows:** xem mục "Kiểm tay" của spec `2026-10-09-windows-iwr-install-design.md`.

## Triển khai
`pnpm deploy` bằng phiên đăng nhập wrangler của chủ dự án (`wrangler login`; cần quyền workers, routes). Tên miền gốc `aitranslator.io.vn` gắn Worker bằng `custom_domain` (tự tạo DNS và chứng chỉ). MX/SPF/DMARC của Email Routing ở gốc không bị đụng. Sau deploy kiểm: gốc 200, `www` → 301, `curl -A GPTBot` không bị chặn (Cloudflare có thể chặn bot AI mặc định ở cấp zone: tắt trong dashboard nếu cần), `api.` và `releases.` không đổi.
Đường lui: `wrangler delete` Worker `ai-translator-site` (và `ai-translator-www`): gốc trở lại không có trang, mọi thứ khác không đổi.
