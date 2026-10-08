# AI Translator: Web Admin (đợt 1: hỗ trợ khách, danh sách, việc cần xử lý) — Design

**Ngày:** 2026-10-07
**Trạng thái:** Chủ dự án đã duyệt thiết kế qua hội thoại ngày 2026-10-07 (bố cục A và trang chi tiết license duyệt qua mockup).
**Quan hệ với spec gốc:** bổ sung "Công cụ hỗ trợ" của `2026-09-29-desktop-meeting-translator-design.md` §6.8 và trả lời câu hỏi mở **P05-4** ("có cần một trang giao diện nhỏ không?") của kế hoạch 05: có. Mọi luật của Worker admin trong spec gốc giữ nguyên (Cloudflare Access, tự kiểm lại danh tính, chống CSRF, nhật ký mọi thao tác, không giữ khóa). Spec chỉ có một môi trường, production (`2026-10-04-single-production-environment-design.md`).

---

## 1. Mục tiêu và phạm vi

Hiện người vận hành gọi JSON API của Worker `mt-license-admin` bằng `cloudflared access curl`. Đợt này thêm một trang web trên chính Worker đó để làm các việc hằng ngày bằng trình duyệt.

### Người dùng
- Chỉ một người vận hành (chủ dự án), toàn quyền. Không có vai trò hay phân quyền.
- Dùng chủ yếu trên máy tính; trên điện thoại vẫn tra cứu và thao tác được (thanh bên gập thành nút ☰).
- Giao diện chỉ tiếng Việt; giờ hiển thị theo GMT+7.

### Lộ trình ba phần
Web Admin được tách làm ba phần, mỗi phần một spec, một kế hoạch, một đợt triển khai:

1. **Đợt này:** nền (khung trang, phục vụ trang qua Access), hỗ trợ khách (giao diện cho mọi thao tác admin đã có), danh sách, việc cần xử lý, nhật ký.
2. **Tổng quan, số liệu** (spec sau): doanh thu theo ngày và tháng, đơn theo trạng thái, tỷ lệ dùng thử chuyển sang trả phí, gia hạn so với mua mới. Cần chọn thư viện biểu đồ.
3. **Cấu hình, phát hành** (spec sau): xem `ops_alerts` đầy đủ, bản phát hành và model trên R2, sửa bảng giá. Sửa bảng giá buộc chuyển `PLANS` từ biến của Worker API sang D1 hoặc KV và phải xét ảnh hưởng tới token đã ký và đơn đang chờ; rủi ro cao nhất nên làm cuối.

### Không làm trong đợt này
- Không trang Tổng quan (mục trên thanh bên ghi "sắp có"), không biểu đồ.
- Không sửa dữ liệu nào ngoài các thao tác admin đã có; không thêm thao tác ghi mới.
- Không chuyển admin sang tên miền riêng (giữ `mt-license-admin.dotienphong1993.workers.dev`, theo `2026-10-06-custom-domain-design.md`).
- Không dùng công cụ admin bên thứ ba (Retool, Appsmith, Directus…): chúng nối thẳng D1, đi vòng qua luật nghiệp vụ và `audit_log`, và cần đưa token D1 cho bên ngoài.

---

## 2. Kiến trúc

```
Trình duyệt ──► Cloudflare Access ──► Worker mt-license-admin (workers.dev, giữ nguyên)
                                        │  middleware hiện có: kiểm Access + AUD + email, chống CSRF
                                        ├─ /admin/*  → Hono API (cũ + API đọc mới)  ──► D1 mt-license-production
                                        └─ còn lại   → env.ASSETS (SPA React đã build)
                                                       (bảng gói, ký thử: service binding → mt-license / AdminRpc, như cũ)
```

- **SPA React đóng gói vào chính Worker admin.** Trang và API cùng origin, nên ứng dụng Access hiện có và lớp chống CSRF (`Sec-Fetch-Site`, `Origin`, chỉ nhận `application/json` cho request ghi) dùng được ngay. Không thêm ứng dụng Access, secret hay tên miền nào.
- **Mã nguồn:** package mới `server/admin-ui/` (React 19, Vite, TypeScript) trong pnpm workspace sẵn có của `server/`. Build ra `server/admin-ui/dist`.
- **Phục vụ trang:** `wrangler.admin.jsonc` thêm khối `assets`:
  - `directory: "./admin-ui/dist"`, `binding: "ASSETS"`, `not_found_handling: "single-page-application"`;
  - **`run_worker_first: true`**: mọi request, kể cả file tĩnh, đi qua middleware tự kiểm Access trước (nguyên tắc "Worker tự kiểm lại" của §6.8), rồi Worker mới gọi `env.ASSETS.fetch`.
  - Đường `/admin/*` không khớp route nào vẫn trả `404` JSON như cũ, không rơi về `index.html`.
- **Header bảo mật cho trang** (Worker gắn vào phản hồi của `ASSETS`):
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
  - Không script inline, không lấy font hay script từ CDN; mọi thứ đóng gói sẵn.
- **Thư viện:** chỉ `react`, `react-dom` cho chạy; router và lớp gọi API tự viết (khoảng 10 route). Phiên bản chốt ở bước lập kế hoạch theo §6.12: bản ổn định mới nhất, cùng dòng với app desktop (React 19, Vite, TypeScript) khi được, kiểm tương thích và peer dependency.
- **Triển khai:** `pnpm ui:build` (script của `server/package.json`) rồi `wrangler deploy -c wrangler.admin.jsonc`. `pnpm check` của `server/` thêm build và test của `admin-ui`; `dry-run` của Worker admin chạy sau khi build để kiểm cả assets.

---

## 3. API của Worker admin

Giữ quy ước hiện có:
- mọi request ghi `audit_log` với actor `admin:<email>`, trừ `whoami`;
- GET có tác dụng phụ (ghi nhật ký) chặn request mà trình duyệt báo là từ trang khác (`crossSite`);
- email không bao giờ nằm trong URL hay trong `detail` của nhật ký.

Mọi API mới đều **chỉ đọc**. Thao tác vẫn dùng các API ghi đã có.

### 3.1 Mở rộng `POST /admin/lookup`
Nhận thêm hai khóa tra cứu (đúng một khóa mỗi request, như cũ):
- `license_key`: 28 ký tự Crockford base32, có hay không có gạch nối, không phân biệt hoa thường; chuẩn hóa bằng `normalizeLicenseKey` (`src/license-key.ts`); sai định dạng trả `400 invalid_request` kèm `field`.
- `license_id`: UUID.

Kết quả giống tra theo email: danh sách license (kèm activations, `conflict`, 50 dòng nhật ký) và các đơn liên quan. Nhật ký ghi `by: "license_key"` hoặc `by: "license_id"`; không ghi key.

### 3.2 API đọc mới
Phân trang theo con trỏ (keyset): tham số `cursor` (giá trị trả về ở `next_cursor` của trang trước), 50 dòng mỗi trang, mới nhất trước. Tham số lọc sai trả `400 invalid_request` kèm `field`.

| Endpoint | Nội dung | Lọc |
|---|---|---|
| `GET /admin/queue` | Việc cần xử lý, mỗi nhóm trả `count` và tối đa 20 dòng: (1) đơn `paid_needs_review`; (2) đơn `underpaid` tạo trong 30 ngày gần đây; (3) đơn `paid` có email mà khách chưa nhận thư key: chưa có `email_sent_at`, và cron đã thôi gửi (`email_gave_up_at`) hoặc đã quá 24 giờ kể từ `paid_at`, và chưa có lần gửi lại thành công của admin (`key_resent` với `sent` đúng) sau đó; (4) license đang khóa tạm (`locked_at` khác NULL, chưa thu hồi); (5) license xung đột (từ 2 activation đang kích hoạt); (6) `ops_alerts` có `count > notified_count` | — |
| `GET /admin/summary` | Doanh thu hôm nay theo GMT+7 (tổng `amount_paid` của đơn `paid` có `paid_at` trong ngày), số đơn `paid` trong 7 ngày, số license còn hạn (`expires_at` > hiện tại, chưa thu hồi) | — |
| `GET /admin/orders` | Danh sách đơn theo `order_code` giảm dần | `status`, `plan`, `from`, `to` (ngày tạo, `YYYY-MM-DD` theo GMT+7) |
| `GET /admin/licenses` | Danh sách license theo `created_at` giảm dần, kèm số activation đang kích hoạt | `state` = `active` \| `expired` \| `revoked` \| `locked` \| `conflict`; `plan` |
| `GET /admin/trials` | Máy dùng thử theo `started_at` giảm dần, kèm cờ `purchased` (máy có ít nhất một activation) | `state` = `active` \| `ended` |
| `GET /admin/audit` | Nhật ký toàn hệ thống theo `id` giảm dần | `actor`, `action`, `from`, `to`; `include_views=1` để hiện cả các dòng xem và tra cứu (mặc định ẩn `lookup`, `list_viewed`, `queue_viewed`, `summary_viewed`, `payment_status_viewed`) |

- **Che key trong danh sách:** danh sách và hàng đợi trả key dạng che (`K7Q2-…-9XMB`, 4 ký tự đầu và 4 ký tự cuối). Key đầy đủ chỉ có trong kết quả `lookup`, vốn đã ghi nhật ký.
- **Email** trả đầy đủ trong danh sách (chỉ một người vận hành, sau Access).
- **Nhật ký của API đọc:** mỗi request ghi một dòng `list_viewed` (`detail`: `resource`, bộ lọc trừ email, số dòng trả về), `queue_viewed` hoặc `summary_viewed`.

### 3.3 Mã nguồn server
- Tách `src/admin.ts` (584 dòng): route đọc mới sang `src/admin-read.ts`; middleware (Access, chống CSRF, giới hạn body) sang `src/admin-auth.ts`, dùng chung cho cả hai; `admin.ts` giữ các thao tác ghi và `lookup`.
- **Cải chính 2026-10-08 (lỗi gặp khi deploy):** spec ban đầu giả định Worker có Static Assets vẫn nhận `ctx.access`. Sai: Cloudflare chạy Worker có assets sau một router nội bộ và router không chuyển `ctx.access` (developers.cloudflare.com/workers/configuration/cloudflare-access), nên lần deploy đầu mọi request bị `403 forbidden`. `admin-auth.ts` nay có hai đường: dùng `ctx.access` nếu có; không có thì xác thực JWT của Access trong header `Cf-Access-Jwt-Assertion` (`src/access-jwt.ts`: RS256, khóa công khai từ `https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`, kiểm `iss`, `aud`, `exp`, `nbf`, có `email`). Mỗi lần từ chối ghi một dòng log `admin_denied` kèm mã lý do (không có email hay token). Test harness giả `ctx.access` nên không bắt được lỗi này; test mới dựng JWT thật để kiểm.
- Phục vụ trang và header bảo mật trong `src/admin-entry.ts` (hoặc một file nhỏ riêng), sau middleware.
- **Migration `0003`** chỉ khi truy vấn danh sách cần: thêm index `licenses (created_at)`, `licenses (expires_at)`, `trials (started_at)`, `audit_log (at)`. Chỉ `CREATE INDEX`, không dựng lại bảng, không đụng `sqlite_sequence` (xem `docs/release` về sự cố trùng orderCode của PayOS ngày 2026-10-07).

---

## 4. Giao diện

### 4.1 Bố cục (đã duyệt: phương án A)
- Thanh trên: tên "AI Translator Admin", **ô tra cứu luôn hiện**, email người vận hành (từ `/admin/whoami`).
- Thanh bên trái: Việc cần xử lý, Tổng quan (ghi "sắp có", không bấm được), Đơn hàng, License, Máy & dùng thử, Nhật ký, Công cụ. Trên màn hình hẹp gập thành nút ☰.

### 4.2 Route

| Route | Màn hình |
|---|---|
| `/` | **Việc cần xử lý**: sáu nhóm của `/admin/queue` (nhóm rỗng thì ẩn, tất cả rỗng thì báo "Không có việc gì cần xử lý"), và 3 ô số của `/admin/summary` |
| `/search` | Kết quả tra cứu. Từ khóa chỉ giữ trong state, **không đưa lên URL**. Đúng 1 kết quả thì tự mở trang chi tiết |
| `/orders` | Danh sách đơn có bộ lọc |
| `/orders/:code` | Chi tiết đơn: thông tin đơn, license liên quan, nhật ký; nút **Cấp tay**, **Xử lý** (cấp key mới / ghi đã hoàn tiền, chỉ hiện khi `paid_needs_review`), **Xem trạng thái trên PayOS** |
| `/licenses` | Danh sách license có bộ lọc; nút **Cấp license mới** (email, gói, lý do) |
| `/licenses/:id` | Chi tiết license (mockup đã duyệt): key che + nút Hiện/Chép, nhãn gói và trạng thái, email, hạn (kèm "còn N ngày"); nút **Gia hạn…**, **Gửi lại email**, **Mở khóa** (chỉ khi đang khóa), **Thu hồi…**; bảng máy với **Reset hạn mức** và **Gỡ** cho từng máy, nhãn xung đột khi từ 2 máy đang kích hoạt; các đơn liên quan; 50 dòng nhật ký |
| `/devices/:hash` | Máy: dùng thử (bắt đầu, kết thúc, lần gọi cuối) và các license từng kích hoạt |
| `/trials` | Danh sách máy dùng thử có bộ lọc |
| `/audit` | Nhật ký toàn hệ thống có bộ lọc và công tắc "hiện cả lượt xem" |
| `/tools` | **Ký thử khóa dự phòng** (hiện token để kiểm bằng `scripts/verify-token.mjs`), **Xác nhận webhook PayOS** (URL), **Ẩn danh theo email** |

Trang chi tiết lấy dữ liệu bằng `lookup` (theo `license_id`, `order_code`, `device_id_hash`). Mỗi lần mở trang chi tiết là một lần tra cứu có ghi nhật ký.

### 4.3 Ô tra cứu
Nhận dạng chuỗi (đã bỏ khoảng trắng hai đầu), theo thứ tự:
1. có `@` → email;
2. toàn chữ số → mã đơn;
3. UUID → license id;
4. đúng 64 ký tự hex → `device_id_hash`;
5. sau khi bỏ gạch nối là đúng 28 ký tự Crockford base32 → license key;
6. còn lại: báo "Không nhận ra loại chuỗi" và không gọi server.

### 4.4 Hộp xác nhận
Mọi thao tác ghi đều qua `ConfirmDialog`, hai mức:
- **Thường** (gia hạn, mở khóa, gỡ máy, reset hạn mức, cấp tay, cấp license mới, cấp key mới cho đơn `paid_needs_review`, xác nhận webhook): câu mô tả hậu quả và ô **Lý do** khi API cần `note` (1–500 ký tự, ghi vào nhật ký). Gửi lại email, ký thử khóa và xác nhận webhook không có `note` ở API nên chỉ có nút xác nhận.
- **Không hoàn tác được** (thu hồi, ẩn danh theo email, ghi đã hoàn tiền): thêm ô gõ chữ xác nhận (`THU HOI`, `AN DANH`, `DA HOAN TIEN`). Nút chỉ bấm được khi có lý do và gõ đúng chữ.

### 4.5 Cấu trúc `server/admin-ui/src/`
- `api/`: hàm `call()` dùng chung (JSON, `content-type`, `redirect: "manual"`, đổi mã lỗi thành câu tiếng Việt) và một hàm có kiểu cho mỗi endpoint.
- `router.ts`: router tự viết trên History API.
- `pages/`: mỗi route một file.
- `components/`: `ConfirmDialog`, `MaskedKey` (che, hiện, chép), `StatusBadge`, `DataTable` (nút "Tải thêm" theo `next_cursor`), `SearchBox`.
- `format.ts`: ngày giờ GMT+7, tiền VND, "còn N ngày".
- State chỉ là state của React, không store. Không lưu dữ liệu nào vào `localStorage` hay `sessionStorage`.

### 4.6 Xử lý lỗi
- **Phiên Access hết hạn:** Access chuyển hướng request sang trang đăng nhập. `call()` dùng `redirect: "manual"`, nên nhận `opaqueredirect` (hoặc nhận HTML thay cho JSON) thì hiện "Phiên đăng nhập hết hạn" và nút **Tải lại trang**.
- **`403`** từ Worker: báo "Không có quyền", gợi ý tải lại trang.
- **`409`** (`needs_review`, `already_paid`, `already_settled`, `not_needs_review`): hiện câu giải thích kèm trạng thái hiện tại của đơn, rồi tải lại trang.
- **`502`** (PayOS, Resend): hiện câu lỗi server trả. **`503 pricing_not_configured`**: báo thiếu cấu hình bảng gói của Worker API.
- **Thành công:** thông báo ngắn và tải lại dữ liệu trang. Thao tác trả key mới (cấp tay, cấp license mới, cấp key mới cho đơn) thì hiện key đó một lần trong hộp có nút chép.
- **Chống bấm hai lần:** nút khóa trong lúc chờ phản hồi. Server đã chống lặp khi hai thao tác chạy cùng lúc.

---

## 5. Kiểm thử

### 5.1 Server (vitest + `@cloudflare/vitest-plugin`, theo mẫu `test/admin.test.ts`)
- Mỗi API đọc mới:
  - đúng dữ liệu theo từng bộ lọc;
  - phân trang theo con trỏ không trùng, không sót dòng;
  - ghi đúng một dòng nhật ký, không chứa email;
  - request không qua Access trả `403`; GET từ trang khác bị chặn.
- `/admin/queue` có đủ sáu nhóm; `/admin/summary` tính doanh thu đúng ranh giới ngày GMT+7.
- `lookup` theo `license_key` (có và không có gạch nối, chữ thường) và theo `license_id`; key không nằm trong nhật ký.
- Danh sách và hàng đợi chỉ trả key dạng che.
- Phục vụ trang:
  - request tới `/` hay file tĩnh mà không qua Access trả `403`;
  - phản hồi có CSP và các header ở mục 2;
  - route lạ ngoài `/admin/*` trả `index.html`; `/admin/khong-co` trả `404` JSON.
- Migration `0003` (nếu có) chỉ thêm index và giữ nguyên `sqlite_sequence`.
- Toàn bộ test admin cũ vẫn qua sau khi tách file.

### 5.2 Giao diện (vitest + jsdom + Testing Library)
- `SearchBox` nhận dạng đúng sáu trường hợp ở mục 4.3.
- `ConfirmDialog`: thiếu lý do thì không bấm được; thao tác không hoàn tác được thì phải gõ đúng chữ xác nhận.
- `MaskedKey` che key mặc định, chỉ hiện khi bấm.
- `call()` đổi đúng các mã lỗi thành câu tiếng Việt và nhận ra phiên Access hết hạn (`opaqueredirect`, phản hồi HTML).
- Tra cứu không đưa từ khóa lên URL.

### 5.3 Nghiệm thu trên production
1. `pnpm check` của `server/` qua toàn bộ; deploy Worker admin. Dù không deploy Worker API, vẫn kiểm cron của `mt-license` sau đợt deploy (bài học sự cố cron 2026-10-07).
2. Chủ dự án mở trang trên máy tính và điện thoại:
   - đăng nhập Access;
   - xem Việc cần xử lý, các danh sách, nhật ký;
   - tra cứu bằng cả năm loại chuỗi.
3. Thao tác thật chỉ trên **license thử của chính chủ dự án**: gửi lại email, gia hạn 1 ngày, reset hạn mức một máy; đối chiếu `audit_log` (actor `admin:<email>`, đúng `note`).
4. Không thử thu hồi, ẩn danh hay cấp tay trên dữ liệu thật của khách.
5. Kiểm CSP trong DevTools: không có lỗi vi phạm CSP khi dùng các màn hình.

---

## 6. Tài liệu cần cập nhật khi triển khai
- Spec gốc §6.8 "Công cụ hỗ trợ": thêm một dòng trỏ tới spec này (Worker admin có giao diện web).
- `docs/release/phat-hanh.md`: thêm bước build `admin-ui` trước khi deploy Worker admin.
- `docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md`: đánh dấu P05-4 đã quyết (có giao diện, theo spec này).
