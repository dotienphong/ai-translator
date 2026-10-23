# Tên miền chính thức `aitranslator.vn`

Ngày 2026-10-23. Chủ dự án mua tên miền `aitranslator.vn` và chọn nó làm tên miền chính thức của cả hệ thống (website, app, server, email, văn bản pháp lý). Tên miền cũ `aitranslator.io.vn` (spec `2026-10-06-custom-domain-design.md`) chuyển hướng về tên mới. Chủ dự án duyệt thiết kế trong phiên ngày 2026-10-23, kể cả việc thay tên miền trong mọi tài liệu cũ của repo (spec, kế hoạch, kết quả đo).

## 1. Hiện trạng (2026-10-23)

- `aitranslator.vn` đã đăng ký, nameserver còn ở Mắt Bão (`ns1.matbao.vn`, `ns2.matbao.vn`), chưa có bản ghi nào. Chưa nằm trong Cloudflare.
- `aitranslator.io.vn` là zone Cloudflare (tài khoản dùng chung với mapsLibVN), mua ngày 2026-10-06, hạn một năm. Trên zone đó có: Worker `ai-translator-site` (gốc), `ai-translator-www` (www → gốc), `mt-license` (`api.`), `mt-license-admin` (`admin.`, sau Cloudflare Access), bucket R2 `ai-translator-releases` (`releases.`), Email Routing (`support@`, `ops@` về Gmail), Resend gửi từ `mail.`, DMARC, luật rate limit `/v1/webhooks/`, luật tắt Browser Integrity Check cho `/v1/webhooks/zalo`.
- App đã phát hành (tới 0.2.6) gọi cứng `https://api.aitranslator.io.vn` (license client **không theo redirect**, `src-tauri/src/license/client.rs`) và `https://releases.aitranslator.io.vn` (bản cập nhật, manifest model). Webhook PayOS, Creem, Zalo trỏ `api.aitranslator.io.vn`.

## 2. Quyết định

### 2.1 Tên mới

Giữ đúng cách chia của spec 2026-10-06 (chỉ subdomain một cấp, để chứng chỉ Universal SSL miễn phí phủ được).

| Mục đích | Tên mới | Gắn với |
|---|---|---|
| Website | `aitranslator.vn` | Worker `ai-translator-site`, custom domain |
| `www` | `www.aitranslator.vn` | Worker chuyển hướng (mục 2.3), 301 về gốc |
| License server | `api.aitranslator.vn` | Worker `mt-license`, custom domain |
| Bản cập nhật và model | `releases.aitranslator.vn` | Bucket R2 `ai-translator-releases`, custom domain |
| Admin | `admin.aitranslator.vn` | Worker `mt-license-admin`, custom domain, sau Cloudflare Access (thêm hostname vào ứng dụng Access hiện có, giữ AUD) |
| Gửi thư | `no-reply@mail.aitranslator.vn` | Resend (domain mới, SPF, DKIM) |
| Nhận thư | `support@aitranslator.vn`, `ops@aitranslator.vn` | Email Routing của zone mới, chuyển về Gmail |

DMARC ở gốc zone mới: `v=DMARC1; p=none; rua=mailto:support@aitranslator.vn`.

### 2.2 Tên cũ

| Tên cũ | Sau khi chuyển | Lý do |
|---|---|---|
| `aitranslator.io.vn`, `www.aitranslator.io.vn` | 301 tới `https://aitranslator.vn` + đường dẫn + query | Website đổi địa chỉ. `curl -fsSL` và `irm` đều theo chuyển hướng, nên lệnh cài cũ (`…/install.sh`, `…/install.ps1`) vẫn chạy |
| `admin.aitranslator.io.vn` | 301 tới `https://admin.aitranslator.vn` + đường dẫn | Dấu trang cũ của người vận hành |
| `api.aitranslator.io.vn` | **Chạy song song**, cùng Worker `mt-license` | App ≤ 0.2.6 không theo redirect; chuyển hướng là hỏng kích hoạt, kiểm license, chat, báo cáo lỗi |
| `releases.aitranslator.io.vn` | **Chạy song song**, cùng bucket R2 | App ≤ 0.2.6 đọc `latest.json` và manifest model ở đây; nhờ vậy chúng tự cập nhật lên 0.2.7 |
| `support@`, `ops@aitranslator.io.vn` | Vẫn chuyển tiếp như cũ | App cũ và thư cũ còn ghi địa chỉ này |

`latest.json` mới sinh từ `RELEASES_BASE_URL` = `https://releases.aitranslator.vn`, nên app cũ đọc manifest ở tên cũ rồi tải bộ cài ở tên mới. Plugin cập nhật không giới hạn tên máy chủ của bộ cài, chỉ kiểm chữ ký (`src-tauri/src/updater/backend.rs`), nên không sao. Manifest model dùng đường dẫn tương đối nên mỗi app tải model từ đúng tên của manifest nó đọc.

### 2.3 Chuyển hướng bằng một Worker trong repo

Worker `ai-translator-redirect` (`website/src/redirect.mjs`, `website/wrangler.redirect.jsonc`) thay Worker `ai-translator-www`. Nó phục vụ bốn tên: `www.aitranslator.vn`, `aitranslator.io.vn`, `www.aitranslator.io.vn` (về `https://aitranslator.vn`) và `admin.aitranslator.io.vn` (về `https://admin.aitranslator.vn`). Mọi phương thức trả 301, giữ đường dẫn và query, kèm `cache-control: public, max-age=3600`. Tên lạ (không nằm trong bảng) trả 404, để Worker không thành máy chuyển hướng mở. Không gửi HSTS từ Worker này: HSTS của tên cũ là việc của tên cũ, không cần thêm. Có test.

Chọn Worker thay vì Redirect Rules trên dashboard: nằm trong repo, có test, chạy trong `pnpm deploy`. Cách deploy custom domain của wrangler (đã đọc mã wrangler 4.148.0, `publishCustomDomains`): `PUT …/domains/records` với `override_scope: true` thay toàn bộ tên của Worker bằng danh sách trong cấu hình; tên đang gắn với Worker khác thì wrangler hỏi "Update them to point to this script instead?" (chạy không TTY thì tự ghi đè). Nên khi deploy site chỉ còn `aitranslator.vn`, tên cũ rời Worker site; deploy Worker chuyển hướng lấy bốn tên (trả lời có ở câu hỏi). Worker `ai-translator-www` không còn tên nào thì xóa (`wrangler delete --name ai-translator-www`).

### 2.4 Server

- `server/wrangler.jsonc`: `routes` có cả `api.aitranslator.vn` và `api.aitranslator.io.vn`. `EMAIL_FROM` = `AI Translator <no-reply@mail.aitranslator.vn>`, `EMAIL_REPLY_TO` = `support@aitranslator.vn`. Chỉ deploy sau khi Resend đã xác thực `mail.aitranslator.vn` (không thì mọi thư lỗi).
- `server/wrangler.admin.jsonc`: `routes` chỉ `admin.aitranslator.vn`; `API_ORIGIN` = `https://api.aitranslator.vn`; `RELEASES_BASE_URL` = `https://releases.aitranslator.vn`; `EMAIL_FROM`, `EMAIL_REPLY_TO` như trên.
- CORS của chat (`server/src/support/routes.ts`): nhận `https://aitranslator.vn` và `https://aitranslator.io.vn`. Tên cũ chỉ để không gãy chat trong vài phút giữa lần deploy server và lần deploy website (trước đó website cũ vẫn chạy); sau khi chuyển hướng chạy thì không trang nào ở origin cũ còn tải được, nên giữ lại không có rủi ro.
- Thư (`server/src/email/`): `SITE_URL`, chân thư, câu "mở lại khung chat trên …" ở năm ngôn ngữ.
- `returnUrl`, `cancelUrl`, `success_url` của đơn lấy theo origin của request (`checkout.ts`), nên đơn từ app cũ quay về tên cũ, đơn từ app mới về tên mới; cả hai đều chạy. Không đổi.
- Secret `OPERATOR_EMAIL` đổi sang `ops@aitranslator.vn` (chủ dự án chạy `wrangler secret put`).
- Web Admin › Công cụ: URL webhook PayOS hiển thị = `https://api.aitranslator.vn/v1/webhooks/payos`.

### 2.5 App (bản 0.2.7)

- `PRODUCTION_URL` của license (`https://api.aitranslator.vn`), cập nhật (`https://releases.aitranslator.vn`), manifest model (`https://releases.aitranslator.vn/models/models.json`).
- `EXTERNAL_HOSTS` (`navigation.rs`): `aitranslator.vn` thay `aitranslator.io.vn` (link trong app mới đều trỏ tên mới; vẫn chỉ khớp đúng tên, không nhận tên miền con).
- Chuỗi giao diện năm ngôn ngữ (`src/i18n/*.ts`): `support@aitranslator.vn`.
- Văn bản pháp lý đóng gói lúc build (mục 2.7).
- Biến GitHub `RELEASES_BASE_URL` = `https://releases.aitranslator.vn` trước khi đẩy tag (`release-ready.mjs` kiểm khớp với `updater/source.rs`).

### 2.6 Website

- `SITE.origin`, email, `RELEASES_URL`, API của chat (`chat-core.js`, cũng là `connect-src` của CSP), email trong chat (`chat-strings.js`), JSON-LD (`alternateName`, mô tả phân biệt), `llms.txt`, IndexNow (`host`), `install.sh`, `install.ps1`, nội dung năm ngôn ngữ, test.
- `wrangler.jsonc`: `routes` chỉ `aitranslator.vn`. `pnpm deploy` deploy site rồi Worker chuyển hướng (thay `wrangler.www.jsonc`).
- Ảnh OG trang Liên hệ (in email) vẽ lại bằng `tools/og/render.mjs`. Ảnh chụp app (`src/assets/img/app/`) có hiện tên miền thì chụp lại.
- **Năm video giới thiệu** (`src/assets/video/ai-translator-demo.{vi,en,ja,zh,ko}.mp4`, ảnh poster `.webp`) có chữ `aitranslator.io.vn` ở cảnh cuối: quay lại bằng `scripts/demo-video/render.mjs` với kịch bản đã sửa (bản thu giọng còn ở `target/demo-video/`, không thu lại). Kiểm khung cuối bằng mắt.

### 2.7 Văn bản pháp lý

EULA lên **1.4**, chính sách quyền riêng tư lên **1.7**. Chỉ đổi tên miền và email liên hệ, không đổi quyền, nghĩa vụ hay dữ liệu. Chính sách mục 4 (kết nối mạng) thêm một câu: các bản app trước 0.2.7 kết nối tới cùng các máy chủ đó dưới tên cũ `aitranslator.io.vn`. Đây là chỗ cố ý nhắc tên cũ, để danh sách kết nối đúng với mọi bản còn đang chạy. Ngày hiệu lực đặt theo `docs/legal/README.md` mục "Đổi ngày hiệu lực", vào ngày deploy website và phát hành 0.2.7.

### 2.8 Tài liệu

Thay tên miền ở mọi tài liệu của repo theo lựa chọn của chủ dự án, kể cả spec, kế hoạch và kết quả đo cũ (`docs/superpowers/`, `bench/`). File `bench/phase1/results/acceptance/a7-mac-aitranslator-io-vn.md` đổi tên thành `a7-mac-aitranslator-vn.md`. Fixture ghi từ dịch vụ thật (Creem) đổi chuỗi nếu test không phụ thuộc chữ ký trên thân; phụ thuộc thì giữ nguyên và ghi lý do ở đây khi làm. Runbook `docs/release/phat-hanh.md` có mục mới "Chuyển sang `aitranslator.vn`" chứa các bước ở mục 3.

Chỗ **được phép** còn nhắc `aitranslator.io.vn` sau khi làm xong (kiểm cuối bằng `git grep`): spec này và kế hoạch của nó; runbook (`docs/release/phat-hanh.md` mục 6 và 14); `CLAUDE.md` (một dòng nói vai trò của tên cũ); Worker chuyển hướng (`website/src/redirect.mjs`, `website/wrangler.redirect.jsonc`, test của nó) và chú thích ở `website/wrangler.jsonc`, `website/README.md`, `server/wrangler.admin.jsonc`; route song song của `mt-license` (`server/wrangler.jsonc`) và test cấu hình; CORS chuyển tiếp (`server/src/support/routes.ts`) và test; ca chặn tên cũ ở `src-tauri/src/navigation.rs`; câu ở chính sách mục 4 (`docs/legal/privacy.{vi,en}.md`) và đoạn 1.4/1.7 của `docs/legal/README.md`; ghi chú đổi chuỗi ở `server/test/fixtures/creem/README.md`; ghi chú lịch sử ở đầu spec 2026-10-06 và kế hoạch `2026-10-06-chuyen-ten-mien.md` (nói đợt đó thật ra làm trên tên cũ). Ngoài các chỗ này, spec 2026-10-06 cũng thay theo lựa chọn "thay hết".

## 3. Thứ tự triển khai

Chủ dự án làm các bước trên dashboard; agent soạn lệnh và kiểm. Mỗi bước deploy, push, đẩy tag chỉ làm khi chủ dự án cho phép.

0. **Đưa `aitranslator.vn` vào Cloudflare**, cùng tài khoản đang giữ `aitranslator.io.vn` (Worker chỉ gắn custom domain trong cùng tài khoản): Add a site (gói Free), đổi nameserver ở Mắt Bão sang hai nameserver Cloudflare đưa, chờ Active, bật DNSSEC (thêm bản ghi DS ở Mắt Bão). Chưa Active thì dừng.
1. **Email:** Email Routing của zone mới (`support@`, `ops@` → Gmail, xác thực địa chỉ đích); Resend thêm domain `mail.aitranslator.vn` (bản ghi DNS, chờ Verified, tắt Open/Click Tracking như domain cũ); bản ghi DMARC.
2. **Hạ tầng API và bản phát hành:** R2 custom domain `releases.aitranslator.vn`; luật rate limit `/v1/webhooks/` và luật tắt Browser Integrity Check cho `/v1/webhooks/zalo` trên zone mới (chép từ zone cũ); deploy `mt-license` (hai tên); secret `OPERATOR_EMAIL`.
3. **Admin:** thêm hostname `admin.aitranslator.vn` vào ứng dụng Access hiện có (giữ AUD); deploy `mt-license-admin`.
4. **Webhook:** PayOS (`confirm-webhook` từ Web Admin › Công cụ), Creem (Developers › Webhooks: đổi URL endpoint; nếu Creem cấp secret mới thì `wrangler secret put CREEM_WEBHOOK_SECRET`), Zalo (`setWebhook`, kiểm `getWebhookInfo`). Thử một giao dịch thật nhỏ như các đợt trước.
5. **Website và chuyển hướng:** đặt ngày hiệu lực văn bản pháp lý; `pnpm deploy` (site lên `aitranslator.vn`, Worker chuyển hướng lấy bốn tên); xóa Worker `ai-translator-www`; IndexNow; Google Search Console (thêm property `aitranslator.vn`, công cụ Change of Address từ property cũ), Bing Webmaster (Site Move).
6. **App 0.2.7:** biến GitHub `RELEASES_BASE_URL`; nâng phiên bản; đẩy tag; kiểm R2, SHA; GitHub Release. Cùng ngày với bước 5.
7. **Thông tin cửa hàng:** cập nhật website của cửa hàng ở Creem và PayOS (Creem có thể duyệt lại), và mọi tài khoản đăng ký bằng email `@aitranslator.io.vn` đổi sang email khác.

Website deploy trước app: app 0.2.6 mở link tên cũ thì được chuyển hướng, còn app 0.2.7 mở link tên mới thì website mới đã có sẵn.

## 4. Nghiệm thu

- `curl` tới `https://api.aitranslator.vn/v1/health` và `https://api.aitranslator.io.vn/v1/health` đều trả `{"ok":true}`.
- `curl -I https://releases.aitranslator.vn/stable/latest.json` và tên cũ đều 200, cùng nội dung.
- `curl -sI https://aitranslator.io.vn/tai-xuong/?a=1` trả `301` tới `https://aitranslator.vn/tai-xuong/?a=1`; tương tự `www.aitranslator.io.vn`, `www.aitranslator.vn`, `admin.aitranslator.io.vn`. `curl -fsSL https://aitranslator.io.vn/install.sh | head -1` in dòng đầu của script.
- Chat trên `https://aitranslator.vn/lien-he/` gửi và nhận được; thư thử từ `no-reply@mail.aitranslator.vn` vào hộp thư đến, SPF, DKIM, DMARC pass, `Reply-To` là `support@aitranslator.vn`; thư gửi `support@aitranslator.vn` về Gmail.
- App 0.2.7: kích hoạt, kiểm tra cập nhật, tải manifest model, chat, gửi báo cáo lỗi; log không còn `io.vn`. App 0.2.6 vẫn chạy như cũ và tự cập nhật lên 0.2.7.
- Toàn bộ test (Rust, vitest, server, Web Admin, website, script) xanh; `grep` chỉ còn các chỗ ở mục 2.8.

## 5. Trước khi bỏ tên miền cũ

Tên cũ hết hạn khoảng 2027-10-06. Chủ dự án dự định không gia hạn. Hệ thống mới không phụ thuộc tên cũ, nhưng khi tên cũ mất:

- Máy còn chạy app ≤ 0.2.6 (chưa từng mở lại app để tự cập nhật) mất kiểm license (gói trả phí còn 14 ngày ân hạn), mất tự cập nhật, cài mới bằng bộ cài cũ không tải được model. Khách phải tải lại từ `aitranslator.vn`.
- Link cũ (thư key đã gửi, kết quả tìm kiếm, link chia sẻ, lệnh cài trong bài viết hay video cũ) thành link chết; thư gửi `@aitranslator.io.vn` bị trả về.
- **Rủi ro lớn nhất là người khác đăng ký lại tên cũ:** họ nhận license key, email, tin chat, báo cáo lỗi do app cũ gửi; dựng trang lừa trên link cũ, kể cả `install.sh` mà ai chạy lệnh cài cũ sẽ chạy; nhận thư gửi tới `@aitranslator.io.vn`, nên tài khoản nào đăng ký bằng email đó có thể bị lấy lại mật khẩu. Họ **không** giả được bản cập nhật, model hay license (đều có chữ ký số app kiểm).

Khuyến nghị: gia hạn thêm một đến hai năm (phí `.io.vn` thấp). Nếu vẫn bỏ, trước ngày hết hạn: (1) Cloudflare Analytics của zone cũ cho thấy lượt gọi `api.aitranslator.io.vn` gần như bằng không; (2) không tài khoản nào còn dùng email `@aitranslator.io.vn`; (3) chuyển hướng website đã chạy ít nhất 180 ngày sau khi khai báo Change of Address với Google; (4) không chỗ nào mình quản lý còn ghi lệnh cài bằng tên cũ.

## 6. Rủi ro

- **Chuyển hướng 301 được trình duyệt nhớ lâu:** chỉ bật khi website mới đã chạy (bước 5, cùng một lệnh `pnpm deploy`, site trước).
- **Thư từ tên miền gửi mới dễ vào spam lúc đầu:** DMARC `p=none`, SPF, DKIM đúng; thử hộp thư thật trước khi phát hành 0.2.7.
- **Thứ hạng tìm kiếm dao động vài tuần** sau khi đổi địa chỉ; 301 giữ đường dẫn và Change of Address giảm thiểu.
- **Creem có thể duyệt lại cửa hàng** khi đổi website; tên cũ vẫn chuyển hướng nên link cũ của Creem không gãy.
- **Webhook đổi tên mà secret đổi theo** (Creem): làm ở bước 4 khi có người theo dõi; webhook tên cũ vẫn chạy cho tới khi đổi xong, nên không mất thanh toán.

## 7. Ngoài phạm vi

Tắt `api.` và `releases.` ở tên cũ, tắt `workers_dev` của `mt-license` và `r2.dev`, Worker của `ai-solutions.io.vn` (không có trong repo; nếu còn chạy thì nó trỏ `aitranslator.io.vn/en/` và khách bị chuyển hai lần, vẫn tới đúng trang).
