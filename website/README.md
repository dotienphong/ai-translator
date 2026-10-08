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
src/public/             favicon, manifest (chép nguyên vào gốc dist/)
tools/og/               sinh ảnh chia sẻ 1200×630 từ template.html (cần Google Chrome)
```

## Thêm một trang
1. Tạo `src/content/vi/<id>.mjs` và `src/content/en/<id>.mjs` (xem `vi/pricing.mjs` làm mẫu), cùng `id`, đường dẫn kết thúc bằng `/`.
2. Thêm `<id>` vào `IDS` và `FILE` trong `src/content/index.mjs`; thêm liên kết ở `src/site.mjs` (NAV/FOOTER) nếu cần.
3. `pnpm test`: title ≤ 70 ký tự, description 90–165 ký tự, đúng một h1, hreflang đối xứng, liên kết nội bộ không hỏng, không `style=` nội tuyến.

## Quy tắc
- **Chỉ nói điều có thật** về sản phẩm (không số liệu, lời chứng thực hay tính năng tưởng tượng). Số đo hiệu năng luôn kèm điều kiện đo. Trạng thái (beta, Windows chưa phát hành, macOS ký ad-hoc) phải đúng với repo.
- Đổi giá ở `server/wrangler.jsonc` thì đổi cả `src/plans.mjs` và mọi chỗ nhắc giá trong `src/content/` (test báo lệch giá/hạn mức).
- Không cookie, không analytics, không script hay font của bên thứ ba (khớp lời hứa quyền riêng tư; CSP `default-src 'self'`).
- Ảnh chụp giao diện app (`src/assets/img/app/`) chụp bằng giao diện thật chạy trong Chrome với IPC giả; chụp lại khi giao diện app đổi.

## Triển khai
`pnpm deploy` bằng phiên đăng nhập wrangler của chủ dự án (`wrangler login`; cần quyền workers, routes). Tên miền gốc `aitranslator.io.vn` gắn Worker bằng `custom_domain` (tự tạo DNS và chứng chỉ). MX/SPF/DMARC của Email Routing ở gốc không bị đụng. Sau deploy kiểm: gốc 200, `www` → 301, `curl -A GPTBot` không bị chặn (Cloudflare có thể chặn bot AI mặc định ở cấp zone: tắt trong dashboard nếu cần), `api.` và `releases.` không đổi.
Đường lui: `wrangler delete` Worker `ai-translator-site` (và `ai-translator-www`): gốc trở lại không có trang, mọi thứ khác không đổi.
