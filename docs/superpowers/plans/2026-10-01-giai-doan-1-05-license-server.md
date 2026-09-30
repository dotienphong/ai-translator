# Giai đoạn 1 · 05: License server

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm license server của spec §6.8: nhận tiền qua PayOS, cấp và gia hạn license key, kích hoạt tối đa 2 máy, ký token Ed25519 để app dùng được khi offline, gửi key qua email (Resend), có công cụ admin đặt sau Cloudflare Access, đối soát đơn định kỳ, rồi triển khai staging trên tài khoản Cloudflare riêng của sản phẩm.

**Kiến trúc:**
- `server/` là dự án TypeScript riêng. Hai Worker dùng chung mã nguồn và dùng chung một D1 cho mỗi môi trường:
  - Worker API `mt-license-<env>`: các endpoint `/v1/*` công khai, cộng Cron Trigger đối soát (`src/index.ts`).
  - Worker admin `mt-license-admin-<env>`: các endpoint `/admin/*`; cả Worker đặt sau Cloudflare Access (`src/admin-entry.ts`).
- Route viết bằng Hono. Mọi phụ thuộc bên ngoài (đồng hồ, PayOS, Resend, khóa ký) đi qua `Deps`; test thay bằng bản giả ở mức HTTP, nên vẫn chạy đúng code `PayOSProvider` và `ResendEmailProvider`.
- Thanh toán nằm sau interface `PaymentProvider` (PayOS là cài đặt đầu tiên); email nằm sau `EmailProvider` (Resend).
- Token bản quyền có dạng `v1.<payload>.<chữ ký>`, ký Ed25519 bằng Web Crypto. Bộ vector `server/test/vectors/token-v1.json` là hợp đồng với kế hoạch 06 (Đ9).
- Cron Trigger mỗi 5 phút: đối soát đơn, gửi lại email chưa gửi được, gửi cảnh báo cho người vận hành qua `EmailProvider`.
- Test chạy trong workerd bằng `@cloudflare/vitest-plugin`, với D1 cục bộ, không gọi mạng.

**Công nghệ:** TypeScript 7.0.2 (strict), Hono 4.13.11, Wrangler 4.143.1, Cloudflare Workers + D1 + Cron Triggers + Access, `@cloudflare/vitest-plugin` 1.3.2 với Vitest 4.1.11, `@cloudflare/workers-types` 5.20260929.1, Web Crypto (Ed25519, HMAC-SHA256, SHA-256), PayOS API v2, Resend API.

Tổng quan: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 2.5). Spec: §6.8, §9, §10.1, §10.2, §11, §12 và §14 giả định 7 của `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`. Kế hoạch này chỉ đụng `server/` và `.gitignore` ở gốc repo, nên chạy song song được với 01–04 (Đ18).

---

## Cách chạy lệnh

- Mỗi khối lệnh chạy từ **gốc repo**, trong shell đã nạp môi trường:

  ```bash
  eval "$(fnm env --use-on-cd)" >/dev/null && export WRANGLER_SEND_METRICS=false
  ```

  Node là 24.21.0 (`.node-version` ở gốc và ở `server/`). Server không cần Rust.
- Lệnh `pnpm`, `node`, `wrangler` chạy trong `server/`, nên khối lệnh bắt đầu bằng `cd server &&`. Lệnh `git` chạy ở gốc repo.
- Expected ghi số đo **lúc lập kế hoạch** (2026-10-01, trên M4 Pro). Đường dẫn tuyệt đối trong output được rút gọn thành `<repo>`.
- Mọi lần chạy vitest đều in dòng `Using secrets defined in process.env` cho từng file test. Dòng này bình thường: `vitest.config.ts` đưa secret giả vào đó (Task 2).
- Test cố ý gây lỗi (PayOS sập, chữ ký sai…) in vài dòng JSON ra stderr, ví dụ `{"event":"checkout_failed",…}`. Các dòng này không phải lỗi của test.

## Phiên bản đã chốt

**Luật tuổi phát hành (thống nhất với kế hoạch 01).** pnpm 12 có `minimumReleaseAge` mặc định 1 ngày: gói mới phát hành chưa đủ 1 ngày thì `pnpm add` tự ghi mục `minimumReleaseAgeExclude` vào `pnpm-workspace.yaml`, còn `pnpm install --frozen-lockfile` báo `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`.
- **Không bao giờ commit `minimumReleaseAgeExclude`.** Nếu pnpm tự ghi mục đó, xóa đi và chọn bản đã ra được ít nhất 1 ngày.
- Vì vậy bảng dưới chốt **bản ổn định mới nhất đã ra được ít nhất 1 ngày** lúc lập kế hoạch (2026-09-30 20:27 UTC, tức 2026-10-01 giờ Việt Nam). Các bản mới hơn (hono 4.13.12, wrangler 4.145.0, `@cloudflare/vitest-plugin` 1.3.4, `@cloudflare/workers-types` 5.20260930.2) ra chưa tới 1 ngày nên không dùng. Lúc thực thi vẫn giữ đúng các bản đã chốt; nâng bản là việc chủ động quyết (§6.12).

| Thành phần | Phiên bản | Ghi chú tương thích | Ngày kiểm |
|---|---|---|---|
| Node.js | 24.21.0 | Như app. `server/.node-version` giữ cùng bản, vì fnm chỉ đọc file này ở thư mục hiện tại. Wrangler cần Node ≥ 22 | 2026-10-01 |
| pnpm | 12.6.0 | `packageManager`. pnpm 12 chặn script cài đặt theo mặc định; `server/pnpm-workspace.yaml` cho phép riêng `esbuild` và `workerd` (`allowBuilds`) | 2026-10-01 |
| TypeScript | 7.0.2 | Cùng bản với app ở gốc repo | 2026-10-01 |
| hono | 4.13.11 | Phát hành 2026-09-29. Là phụ thuộc runtime duy nhất, MIT | 2026-10-01 |
| wrangler | 4.143.1 | Phát hành 2026-09-29. Kéo theo workerd 1.20260926.1 và miniflare 5.20260926.1-alpha (dist-tag `latest` của miniflare hiện là dòng 5.x-alpha). Peer: `@cloudflare/workers-types ^5.20260926.1` | 2026-10-01 |
| @cloudflare/workers-types | 5.20260929.1 | Thỏa peer của wrangler. Có `ExecutionContext.access` (dùng cho Access, QĐ6) | 2026-10-01 |
| @cloudflare/vitest-plugin | 1.3.2 | Tên mới của `@cloudflare/vitest-pool-workers`: gói cũ dừng ở 0.22.0 (2026-08-18), tài liệu Cloudflare hướng dẫn chuyển sang gói mới. Bản 1.3.2 ghim đúng wrangler 4.143.1 và miniflare 5.20260926.1-alpha, khớp bản wrangler ở trên | 2026-10-01 |
| vitest | 4.1.11 | **Không dùng 5.0.3** (bản mới nhất), vì peer của `@cloudflare/vitest-plugin` là `vitest ^4.1.0`. Nâng lên 5 khi plugin nhận | 2026-10-01 |
| Ed25519 | Web Crypto | Workers và Node 24 đều có sẵn. Không cần `@noble/ed25519` | 2026-10-01 |
| PayOS API | v2 (`/v2/payment-requests`) | Đọc tài liệu ngày 2026-10-01. SDK `@payos/node` 2.0.5 chỉ dùng để đối chiếu cách ký, không cài | 2026-10-01 |
| Resend API | `POST /emails` | Bắt buộc có `User-Agent` | 2026-10-01 |
| `compatibility_date` | 2026-09-26 | Bằng ngày của workerd 1.20260926.1 đi kèm wrangler 4.143.1 | 2026-10-01 |

Lúc lập kế hoạch:
- `pnpm audit` và `pnpm audit --prod`: `No known vulnerabilities found`.
- `pnpm licenses list --prod`: chỉ có `hono` (MIT).
- Gói dev có `@img/sharp-libvips-darwin-arm64` (LGPL-3.0-or-later, qua miniflare). Gói này chỉ chạy khi test cục bộ, không vào bundle deploy.

## Tài liệu đã đọc (2026-10-01)

PayOS:
- https://payos.vn/docs/api/: tạo link (`POST /v2/payment-requests`), lấy thông tin (`GET /v2/payment-requests/{id}`), hủy link, hóa đơn, `POST /confirm-webhook`, schema webhook.
- https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/: cách ký HMAC-SHA256, dữ liệu mẫu và checksum key mẫu.
- https://payos.vn/docs/du-lieu-tra-ve/webhook/
- https://payos.vn/docs/du-lieu-tra-ve/return-url/
- https://payos.vn/docs/moi-truong-test/
- https://payos.vn/docs/cau-hoi-thuong-gap/
- Mã nguồn SDK chính thức `@payos/node` 2.0.5 trên npm: `lib/crypto/subtle-crypto.js`, `lib/utils/convert-obj-to-query-str.js`, `lib/client.js`, `lib/resources/v2/payment-requests/*`, `lib/resources/webhooks/*`.

Resend:
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/api-reference/introduction
- https://resend.com/docs/api-reference/errors
- https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
- https://resend.com/docs/dashboard/domains/introduction

Cloudflare:
- https://developers.cloudflare.com/workers/testing/vitest-integration/, `…/write-your-first-test/`, `…/isolation-and-concurrency/`, và ví dụ `fixtures/vitest-plugin-examples/d1` trong repo `cloudflare/workers-sdk`.
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/ (`ctx.access`, "Protect this Worker behind Access").
- https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
- https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/ (cookie `CF_Authorization`: SameSite và cảnh báo `ERR_TOO_MANY_REDIRECTS` với `Strict`, HttpOnly, Binding Cookie).
- https://developers.cloudflare.com/workers/observability/issues/ và `…/issues/automations/` (Workers Issues, miễn phí trong beta; automation tới webhook, chat, incident).
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/ (invocation log, `invocation_logs: false`, thời gian lưu).
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://developers.cloudflare.com/workers/wrangler/configuration/ (`secrets.required`, khóa không kế thừa giữa các môi trường, tự tạo tài nguyên).
- `wrangler <lệnh> --help` và mã nguồn của wrangler 4.145.0 và 4.143.1: `secret put`, `d1 create`, `d1 migrations apply`, `deploy --dry-run`; `config-schema.json` (`observability.logs.invocation_logs`).

Kho mật khẩu (khóa dự phòng, QĐ29):
- https://www.1password.dev/cli/reference/management-commands/item/ (`op item create --vault <vault> -` đọc mẫu JSON từ stdin; tham số dòng lệnh lộ giá trị).
- https://www.1password.dev/cli/item-template-json/
- https://bitwarden.com/help/cli/ (`bw encode | bw create item`, Secure Note).

### Chỗ tài liệu PayOS khác spec, hoặc chi tiết hơn spec

1. **PayOS không có sandbox.** Trang "Môi trường test" viết: "Vì payOS không có sandbox riêng, các giao dịch thử nghiệm sẽ chạy trên môi trường thực tế". Giả định 7 (§14) vì vậy đi nhánh "giao dịch số tiền nhỏ" (Task 20).
2. **Trạng thái đơn có 7 giá trị** (theo SDK): `PENDING`, `PROCESSING`, `PAID`, `UNDERPAID`, `CANCELLED`, `EXPIRED`, `FAILED`. Spec chỉ nói tới `PAID`.
   - Có hẳn trạng thái `UNDERPAID` cho trường hợp chuyển thiếu.
   - Kế hoạch chỉ cấp license khi `PAID`, `amountPaid ≥ amount` và `amount` khớp số tiền của đơn. `PAID` mà thiếu tiền thì coi như `underpaid`.
3. **Mỗi kênh thanh toán chỉ có một webhook URL**: `confirm-webhook` "thêm hoặc cập nhật webhook url cho Kênh thanh toán". Vì vậy staging và production phải là hai kênh riêng, mỗi kênh có client id, api key, checksum key riêng (P05-1).
4. **`confirm-webhook` gửi thử một webhook mẫu** tới URL, và URL phải trả 2xx. Spec không nói điều này. Webhook của server trả 200 cho `orderCode` lạ nếu chữ ký đúng.
5. **Response cũng có chữ ký.** Response của tạo link và của `GET` có `signature` tính trên `data`. SDK kiểm chữ ký này, nên server cũng kiểm.
6. **`expiredAt`** là Unix timestamp kiểu Int32, tính bằng giây.
7. **Mô tả đơn tối đa 9 ký tự**: tài liệu ghi "với tài khoản ngân hàng không phải liên kết qua payOS thì giới hạn ký tự là 9", đúng như giả định 7. Kế hoạch dùng `MT<orderCode>`, với `orderCode` tối đa 7 chữ số.
8. **Tài liệu có hai chữ ký khác nhau cho cùng dữ liệu webhook mẫu:**
   - ở phần code mẫu: `412e915d…`, khớp checksum key mẫu, nên được dùng làm vector test;
   - ở phần schema: `8d8640…`, không khớp.
   - Test ghi rõ cả hai trường hợp (Task 8).
9. **PayOS gắn thêm query** (`code`, `id`, `cancel`, `status`, `orderCode`) vào `returnUrl` và `cancelUrl`. Vì vậy URL của server không có sẵn query.
10. **Hóa đơn điện tử:** request tạo link có trường hóa đơn (`invoice`, `buyerName`, `buyerTaxCode`, `buyerEmail`…), và có API `GET /v2/payment-requests/{id}/invoices`. Phần này liên quan Q10; kế hoạch này chưa gửi các trường đó.
11. **API có thể trả `429`** khi gọi quá nhiều. Mỗi lần đối soát chỉ hỏi tối đa 50 đơn.
12. **Cách ký dữ liệu PayOS trả về** (webhook và response), theo SDK và tài liệu:
    - key xếp theo thứ tự chữ cái, dạng `key=value` nối bằng `&`;
    - `null`, `undefined`, `"null"`, `"undefined"` thành chuỗi rỗng;
    - mảng thành JSON, với key của từng phần tử đã được xếp.

    Spec chỉ ghi "kiểm tra chữ ký webhook bằng checksum key". Chữ ký khi tạo link thì đúng như spec (5 trường xếp theo chữ cái).
13. **Chữ ký của API payouts (chi hộ) khác**: có `encodeURI` từng giá trị. Kế hoạch không dùng API này.

## Dòng của bảng đối chiếu mà kế hoạch này nhận

Lấy bằng lệnh ở Task 2, Step 1 của kế hoạch 00 (cột Kế hoạch có `05`).

| Dòng | Yêu cầu (rút gọn) | Task |
|---|---|---|
| 2 | D2: tài khoản Cloudflare và merchant PayOS riêng | 19 (`wrangler whoami`), 21 |
| 11 | D11: PayOS, VietQR, VND | 8, 12 |
| 13 | P1: gói 1 và 12 tháng; giá đọc từ cấu hình | 12 (`PRICES_JSON`), 18, 21 |
| 14 | P2: key cấp sau khi PayOS xác nhận; 2 máy; token offline | 6, 13, 14 |
| 22 | F8 phía server | 6, 13, 14 |
| 83 | Server chỉ phục vụ mua, kích hoạt, kiểm tra bản quyền | 11 (route lạ 404), 17 |
| 164 | TypeScript + Hono, Workers, D1, tài khoản riêng, khóa PayOS chỉ ở server | 2, 18, 19 |
| 165 | `PaymentProvider` (`create_checkout`, `verify_webhook`, `get_payment_status`) | 8 |
| 166 | Đơn hàng có `provider`, `currency`; giá theo gói và loại tiền | 3, 12 |
| 167 | License chỉ dựa vào `expires_at`; cộng 30 hoặc 365 ngày | 13 |
| 168 | `POST /v1/checkout` | 12 |
| 169 | `POST /v1/webhooks/payos`, đăng ký qua `confirm-webhook` | 13, 16, 19 |
| 170 | `GET /v1/orders/{orderCode}?token=…` (kế hoạch này nhận token trong header, QĐ25) | 13 |
| 171 | `POST /v1/licenses/activate`, 2 máy, dùng lại activation, `409` | 14 |
| 172 | `POST /v1/licenses/validate` | 14 |
| 173 | `POST /v1/licenses/deactivate`, gỡ từ xa | 14 |
| 174 | `POST /v1/licenses/recover` luôn `200`, có giới hạn | 14 |
| 175 | Email qua Resend sau `EmailProvider`; tên miền SPF, DKIM | 9, 13 (gửi lại), 15, 21 |
| 176 | `/admin/*` sau Access, đủ thao tác, nhật ký; xóa theo email (Q9) | 16, 19, 21 |
| 177 | HMAC-SHA256 khi tạo link | 8 |
| 178 | Token Ed25519 có `kid`, `refresh_before`; vector chung (Đ9) | 6, 7, 14, 20 |
| 190 | PayOS chỉ nhận VND | 8 |
| 242 | `409` kèm danh sách máy, gỡ một máy rồi kích hoạt | 14 |
| 243 | Webhook chậm hoặc mất: đối soát | 15 |
| 244 | Webhook trùng: idempotent | 13 |
| 245 | Chuyển thiếu, link hết hạn: không cấp; cấp tay khi chuyển bù | 13, 15 (đối soát đơn chuyển thiếu), 16 |
| 251 | Khóa PayOS là secret của server | 2 (`secrets.required`), 19 |
| 253 | Dữ liệu tối thiểu, không có tài khoản đăng nhập | 3 |
| 254 | Lưu thời điểm đồng ý xử lý email | 12 (`email_consent_at`) |
| 255 | Cách yêu cầu xóa: thao tác xóa theo email (Q9) | 16 |
| 256 | Ghi rõ nơi lưu dữ liệu để làm hồ sơ | mục "Nơi lưu dữ liệu cá nhân" |
| 267 | 2 máy; khóa tạm khi gỡ quá ngưỡng; key ≥ 128 bit có ký tự kiểm tra | 5, 14 |
| 268 | Giới hạn `activate`, `validate`, `checkout`, `recover`; `429` | 10, 12, 14 |
| 274 | HTTPS, chữ ký webhook, idempotent, prepared statement, kiểm input, secret, Access, nhật ký, cảnh báo | 2, 3, 8, 10 (cảnh báo), 11, 13, 15, 16, 17, 18 |
| 275 | Token có `kid`; khóa dự phòng; đổi khóa khi lộ | 6, 7, 19, 20, 21, Phụ lục A |
| 293 | Unit test của server theo §11 | 6, 8, 13, 14 |
| 294 | Test tích hợp: giao dịch nhỏ vì không có môi trường test | 20 |
| 311 | Gỡ rồi kích hoạt quá ngưỡng thì khóa tạm | 14 |
| 316 | `429`, input độc hại, webhook sai chữ ký | 12, 13, 14, 17 |
| 318 | Cây thư mục `server/` theo §12 | 2–16 (chỗ lệch: QĐ22) |
| 321 | `.gitignore` trước khi tạo `server/` | 1 |
| 323 | §14 giả định 7 | 8, 12, 20 |

## Quyết định của kế hoạch này

- **QĐ1. `server/` là dự án pnpm riêng, không nằm trong workspace ở gốc.** Nó có `package.json`, `pnpm-lock.yaml` và `pnpm-workspace.yaml` riêng. Lý do:
  - wrangler, workerd và miniflare nặng khoảng 100 MB; app không cần chúng, CI của app cũng không nên phải cài;
  - lockfile riêng giúp kế hoạch 01 (đang sửa `package.json` và `pnpm-lock.yaml` ở gốc) chạy song song mà không đụng file chung (Đ18);
  - mục 6.1 của kế hoạch 00 đã coi "lockfile của `server/`" là một lockfile riêng;
  - app và server không dùng chung package: hợp đồng giữa hai bên là file JSON vector (Đ9).

  pnpm dừng tìm workspace ở `pnpm-workspace.yaml` gần nhất, nên `server/` vẫn là dự án riêng kể cả khi gốc repo có `pnpm-workspace.yaml` sau này. Từ gốc repo chạy được `pnpm -C server <lệnh>`.
- **QĐ2. Dùng `@cloudflare/vitest-plugin` và Vitest 4.1.11**, thay cho `@cloudflare/vitest-pool-workers`: gói cũ đã đổi tên (xem bảng phiên bản). Storage của D1 chỉ tách theo từng file test, nên mỗi file test xóa dữ liệu trong `beforeEach` (`test/db.ts`).
- **QĐ3. Ed25519, HMAC và SHA-256 đều dùng Web Crypto.** Server không cần thư viện mã hóa nào. Script tạo khóa, script sinh vector và script kiểm token chạy bằng Web Crypto của Node 24, độc lập với mã của server; nhờ vậy chúng là phép kiểm chéo.
- **QĐ4. Định dạng token `v1.<base64url(JSON)>.<base64url(chữ ký)>`.**
  - Chữ ký phủ đúng chuỗi ASCII `v1.<payload>`, nên bên kiểm không phải dựng lại JSON theo dạng chuẩn.
  - `kid` nằm trong payload, như §6.8 liệt kê.
  - Thời điểm tính bằng giây Unix; `plan` là `"pro"` (QĐ11).
  - Phía Rust (06) kiểm bằng `ed25519-dalek`, crate `base64` (`URL_SAFE_NO_PAD`) và serde_json, không cần thư viện JWT.
  - **base64url phải ở dạng chuẩn:** không padding, bit thừa ở ký tự cuối bằng 0; khác đi là `malformed`. Crate `base64` của Rust từ chối đúng các trường hợp này, nên server và app kiểm như nhau (vector `signature_with_padding`, `signature_trailing_bits`).
  - Thứ tự kiểm: định dạng, `kid`, chữ ký, máy, `expires_at`, rồi `refresh_before`. Token hết hạn khi `now ≥ expires_at` hoặc `now ≥ refresh_before`.
- **QĐ5. License key có 28 ký tự Crockford base32**, hiển thị thành 7 nhóm 4 ký tự:
  - 27 ký tự ngẫu nhiên (135 bit), cộng 1 ký tự kiểm tra **Luhn mod 32** trên bảng Crockford;
  - đo trên 20.000 key tất định (`scripts/measure-key-check.mjs`, Task 5): bắt 100% lỗi thay một ký tự (17.360.000/17.360.000) và 99,79% lỗi đảo hai ký tự kề nhau (521.919/523.019); chỉ lọt cặp 0↔Z. Cách cũ (5 bit của SHA-256) để lọt 3,13% lỗi thay một ký tự;
  - khi nhập: bỏ dấu cách và gạch nối, đổi O→0, I và L→1;
  - D1 lưu key dạng chuẩn hóa; mọi lần tra đều bằng prepared statement.
- **QĐ6. `/admin/*` chạy ở một Worker riêng (`mt-license-admin-<env>`), bật "Protect this Worker behind Access", chế độ All traffic.** Chọn cách này để giải R15:
  - chưa có tên miền (Q1), nên chưa đặt được Access theo đường dẫn trên tên miền riêng;
  - Access đặt theo Worker bảo vệ mọi URL của Worker đó (workers.dev, preview, tên miền về sau);
  - Worker API không có `/admin`.

  Worker admin tự kiểm lại, và từ chối nếu thiếu (fail closed):
  - request không có `ctx.access` thì `403`. `ctx.access` do runtime tạo sau khi Access đã kiểm JWT (https://developers.cloudflare.com/workers/configuration/cloudflare-access/);
  - ngoài `dev`, **`ACCESS_AUD` bắt buộc** và phải khớp `ctx.access.aud`; để trống thì mọi request bị `403`;
  - operator ghi vào nhật ký là email lấy từ `ctx.access.getIdentity()`.
- **QĐ7. Giới hạn tần suất đếm trong D1**, theo cửa sổ cố định 1 giờ.
  - IP, key và email chỉ lưu dưới dạng HMAC-SHA256 với secret `RATE_LIMIT_PEPPER`, nên bảng `rate_limits` bị lộ cũng không dò ngược được IP hay email. Mỗi dòng sống tối đa khoảng 3 giờ.
  - Không dùng binding Rate Limiting của Workers: binding đó chỉ có chu kỳ 10 hoặc 60 giây và đếm riêng ở từng vị trí của Cloudflare.
  - §10.2 chỉ nêu các con số "ví dụ". Ngoài 4 giới hạn của spec, kế hoạch thêm: `recover` ≤ 10 lần/giờ/IP, `deactivate` ≤ 10 lần/giờ/IP, hỏi đơn ≤ 600 lần/giờ cho mỗi cặp (IP, đơn). App hỏi mỗi 3 giây trong 15 phút là 300 lần.
  - `validate` đếm theo **key đã chuẩn hóa**, nên đổi 0↔O, 1↔I/L, chữ hoa thường hay gạch nối không tạo được bộ đếm mới.
  - **Thất bại đếm theo IP, chung mọi endpoint** (`failure_ip`): key sai định dạng, key không tồn tại, activation lạ. Chạm 60 lần trong 1 giờ thì IP đó bị chặn tới hết giờ, server ghi dòng `many_failures` và tạo cảnh báo cho người vận hành (QĐ27).
  - **Khi IP đang bị chặn** (nhiều người dùng chung một IP qua CGNAT): chỉ request có key hợp lệ kèm activation đang hoạt động và khớp (`validate`, `deactivate`) được cho qua; mọi request khác trả `429`, kể cả key thật mà activation sai, và mọi `activate` hay checkout gia hạn. Nếu cho qua mọi key hợp lệ thì kẻ dò vẫn phân biệt được key thật (200) với key giả (429). Đoán trúng một `activation_id` (UUID v4, 122 bit ngẫu nhiên) là không khả thi.
- **QĐ8. Tính idempotent bằng một batch D1**, trong đó mỗi câu lệnh đều có điều kiện "đơn chưa `paid`". Webhook gửi trùng, đối soát và admin có chạy cùng lúc thì cũng chỉ một lần có tác dụng, kèm một email. Gia hạn cộng vào `MAX(expires_at, bây giờ)`. "Hôm nay" ở §6.8 được hiểu là thời điểm hiện tại, không làm tròn về đầu ngày.
- **QĐ9. Lịch đối soát**, giãn so với chữ "mỗi 5 phút" của §9:
  - xét đơn `pending`, `processing` và `underpaid` (khách có thể chuyển bù) tạo trong 24 giờ qua;
  - trong giờ đầu kể từ khi tạo đơn: hỏi ở mỗi lần cron chạy (mỗi 5 phút), cách nhau ít nhất 4 phút;
  - sau giờ đầu: mỗi giờ một lần;
  - quá 24 giờ: đơn `pending` hay `processing` coi là hết hạn; đơn `underpaid` giữ nguyên để hỗ trợ xử lý.

  Lý do: link chỉ sống 15 phút. Nếu hỏi mọi đơn bỏ dở mỗi 5 phút suốt 24 giờ thì mỗi đơn tốn 288 lần gọi PayOS, trong khi PayOS có giới hạn `429`.
- **QĐ10. Khóa tạm (§10.2).**
  - Đếm **số lần gỡ** do người dùng (tự gỡ hoặc gỡ từ xa, không tính admin gỡ) trong 30 ngày gần nhất, bắt đầu từ lần admin mở khóa gần nhất, **trừ các lần gỡ chính máy đang kích hoạt** (`device_id_hash <> ?`). Đúng chữ §10.2: "hơn 3 lần gỡ … rồi kích hoạt máy khác".
  - Kiểm cho **mọi máy không đang kích hoạt**, kể cả máy từng dùng key này. Hơn 3 lần thì server khóa key, trả `423 license_locked` và tạo cảnh báo.
  - Gỡ rồi kích hoạt lại cùng một máy bao nhiêu lần cũng không bị khóa, vì các lần gỡ chính máy đó không được tính.
  - Xoay vòng 2 suất giữa nhiều máy thì bị khóa sau vài lượt: với 5 máy, lượt thứ 5 bị `423` (test ở Task 14).
  - Key đã khóa thì chặn mọi máy không đang kích hoạt. Các máy đang kích hoạt vẫn `validate` được, và vẫn gỡ máy được.
  - Admin mở khóa thì các lần gỡ trước lúc mở khóa không còn tính (P05-3).
- **QĐ11. Trường `plan` trong token là hạng quyền (`"pro"`)**, không phải gói đã mua (`pro_1m`, `pro_12m`). Lý do: license chỉ quan tâm `expires_at` (§6.8).
- **QĐ12. Gia hạn bằng key có sẵn** thì email của license giữ nguyên email lúc mua lần đầu. Email của đơn gia hạn chỉ nhận thư xác nhận.
- **QĐ13. `returnUrl` và `cancelUrl`** lấy theo origin của request checkout: `<origin>/v1/pay/return` và `<origin>/v1/pay/cancel`. Nhờ vậy staging trên workers.dev, và production khi có tên miền, không cần cấu hình URL. Hai trang này chỉ nhắc người dùng quay lại app.
- **QĐ14. Không dùng SDK `@payos/node`.** Server gọi REST bằng `fetch`, theo tài liệu và đối chiếu từng hàm ký với SDK. Lý do: SDK kéo thêm phụ thuộc và tự thử lại khi gặp lỗi; server chỉ cần 3 lệnh gọi.
- **QĐ15. `recover` tra và gửi thư trong `waitUntil`**, sau khi đã trả lời, để thời gian phản hồi không lộ email nào có key. Email không có key thì server không gửi gì, để không thành công cụ gửi thư rác.
- **QĐ16. Q9 làm theo kiểu ẩn danh:** bỏ email và `device_label`; giữ số tiền, gói, ngày và mã đơn ở mức kế toán cần. License vẫn dùng được, nhưng không khôi phục được qua email nữa. Nhật ký chỉ ghi số dòng đã sửa, không ghi email.
- **QĐ17. Giá nằm trong biến `PRICES_JSON` của từng môi trường.**
  - Staging: 2.000 đ (1 tháng) và 3.000 đ (12 tháng) để thử bằng tiền thật.
  - Production: để trống cho tới khi có Q2; khi đó checkout trả `503 pricing_not_configured`, không bao giờ bán sai giá.
- **QĐ18. Số đơn (`orderCode`) theo môi trường.** Mỗi môi trường có D1 và khóa ký riêng, và nên có kênh PayOS riêng (P05-1). Số đơn đánh bằng `AUTOINCREMENT` của D1:
  - staging dùng số từ 1 tới 999.999;
  - production bắt đầu từ 1.000.001: ngay sau khi tạo D1 production, chèn rồi xóa một dòng giữ chỗ số 1.000.000 (Task 21, Step 4). AUTOINCREMENT nhớ số lớn nhất đã dùng, nên đơn kế tiếp là 1.000.001, kể cả khi D1 mới dùng lại kênh PayOS của staging;
  - trần là 9.999.999, để mô tả `MT<orderCode>` không quá 9 ký tự (§14 giả định 7). Vượt trần thì checkout trả `503 order_code_exhausted`, không gọi PayOS.

  Chọn cách này thay cho biến `ORDER_CODE_OFFSET` vì không phải đổi số giữa mã trong D1 và mã gửi PayOS ở mọi chỗ (webhook, hỏi đơn, admin).
- **QĐ19. Email chỉ là văn bản thuần, song ngữ vi/en.**
  - Staging gửi từ `onboarding@resend.dev`, và địa chỉ này chỉ gửi tới email của chủ tài khoản Resend.
  - Lỗi gửi email không chặn việc cấp key: key vẫn lấy được qua `GET /v1/orders`, `recover` hay admin.
  - Email mua hàng có idempotency key `<env>-order-<orderCode>`, nên gửi lại không bao giờ thành hai thư.
  - Chỉ 400 và 422 của Resend (thư sai dạng, địa chỉ nhận không hợp lệ) là lỗi vĩnh viễn: thôi gửi. Mọi lỗi khác là lỗi tạm, gồm 401 và 403 (API key bị khóa, tên miền chưa xác thực: sửa cấu hình xong là gửi được), 409 `concurrent_idempotent_requests` (hai lượt gửi chồng nhau; tài liệu Resend ghi "Retry later"), 429, 5xx và lỗi mạng. Lỗi tạm thì cron gửi lại, giãn dần: sau 5 phút, 15 phút, 1 giờ, rồi mỗi 6 giờ, trong 24 giờ sau khi trả tiền. Cảnh báo `email_failed` chỉ tạo ở lần lỗi đầu của mỗi đơn.
  - Đơn đã cấp mà chưa thử gửi thư lần nào (Worker dừng giữa lúc cấp và gửi) thì cron gửi sau 5 phút.
- **QĐ20. Chỉ nhận HTTPS** khi `ENVIRONMENT` khác `dev`, và kiểm ngay trong Worker (§10.2). Worker không bật CORS, vì app gọi server từ phía Rust (`LicenseProvider`, §6.8), không gọi từ WebView.
- **QĐ21. D1 tạo với `--location apac`**: gần khách ở Việt Nam, và nơi lưu được ghi vào hồ sơ dữ liệu cá nhân.
- **QĐ22. Chỗ lệch với §12.** `server/src` có thêm các module sau (đề xuất thêm vào Q12):
  - `email/{provider,resend,templates}.ts`, `ratelimit.ts`, `alerts.ts`;
  - `app.ts`, `deps.ts`, `http.ts`, `audit.ts`, `plans.ts`, `crypto.ts`, `license-key.ts`, `env.ts`;
  - `admin-entry.ts`, điểm vào của Worker admin.

  Kiểu `Env` viết tay ở `src/env.ts`, không sinh bằng `wrangler types`, vì hai Worker dùng chung mã. Kiểu runtime lấy từ `@cloudflare/workers-types`.
- **QĐ23. Không gửi email người mua sang PayOS** (`buyerEmail`), để giữ dữ liệu ở mức tối thiểu, cho tới khi Q10 cần hóa đơn.
- **QĐ24. `POST /v1/checkout` nhận thêm `consent: true`**, là ô đồng ý xử lý email của §10.1; thiếu thì `400`. Server lưu thời điểm đồng ý vào `orders.email_consent_at`. Đây là trường thêm so với bảng API của §6.8.
- **QĐ25. Không để dữ liệu nhạy cảm nằm trong URL.** URL có thể lọt vào log, lịch sử trình duyệt và proxy.
  - Tắt invocation log của Workers Logs ở cả hai Worker, mọi môi trường (`observability.logs.invocation_logs: false`): invocation log lưu cả URL và query của request. Thêm `redact_query_string: true` để bỏ query khỏi URL trong log và trace còn lại. Log JSON do code tự ghi vẫn giữ.
  - `order_token` đi trong header `Authorization: Bearer <order_token>` (scheme không phân biệt hoa thường), không đi trong query như `?token=…` của §6.8.
  - Admin tra cứu bằng `POST /admin/lookup` với email trong body.
- **QĐ26. Tên trường JSON dùng `snake_case` cho toàn bộ API của server** (`order_code`, `checkout_url`, `qr_code`, `order_token`, `license_key`, `device_id_hash`…), cả request lẫn response. Chỉ khi gọi PayOS mới dùng `camelCase` của PayOS. Khác chữ trong spec (`checkoutUrl`, `qrCode`, `orderCode`), nên được thêm vào danh sách lệch nhỏ (Q12) ở Task 22.
- **QĐ27. Cảnh báo cho người vận hành (§10.2).**
  - Bốn loại sự kiện: `many_failures` (một IP chạm 60 lần thất bại), `webhook_bad_signature`, `email_failed`, `license_locked`. Mỗi sự kiện được đếm theo loại và theo giờ trong bảng `ops_alerts`.
  - Cron gửi một email mỗi loại, **tối đa một lần mỗi giờ**, tới `OPERATOR_EMAIL`, qua `EmailProvider`. Gửi lỗi thì lần cron sau thử lại.
  - `OPERATOR_EMAIL` là dữ liệu cá nhân nên là secret (`wrangler secret put`), không nằm trong repo hay `wrangler.jsonc`. Thiếu biến này thì cảnh báo chỉ ghi log.
  - **Giới hạn:** cảnh báo đi cùng kênh Resend với thư chứa key, nên khi Resend sập thì chỉ còn log. Cách giảm rủi ro: bật **Workers Issues** (`observability.issues.enabled`, miễn phí trong giai đoạn beta). Issues ghi mọi `console.error` và response `5xx`, kể cả `email_failed`, rồi gửi qua automation tới webhook, chat hay công cụ incident, không qua Resend (Task 19, Step 10). Nếu Issues hết miễn phí, hoặc chủ dự án không có kênh chat hay webhook nhận automation, thì đây là rủi ro chấp nhận: người vận hành xem trang Issues và Workers Logs định kỳ.
- **QĐ28. Cổng thanh toán chọn theo `orders.provider`.** `Deps.payments` là map tên cổng → `PaymentProvider`. Webhook là một route chung `/v1/webhooks/{provider}` (PayOS là `/v1/webhooks/payos`); `fulfilOrder` và đối soát lấy cổng theo cột `provider` của đơn. Thêm cổng chỉ cần thêm một cài đặt vào map, không sửa `orders.ts` hay `reconcile.ts`. Tên cổng lạ thì `404`.
- **QĐ29. Khóa riêng không bao giờ in ra terminal hay ghi ra file.**
  - Mọi script in khóa riêng (`gen-token-key.mjs`, và `test/fixtures/test-jwk.mjs` cho khóa test) chỉ ghi khi stdout là pipe hoặc socket (`fs.fstatSync(1).isFIFO()`, `isSocket()`); terminal và file đều bị từ chối, thoát mã 2, không ghi byte nào.
  - Khóa đang dùng pipe thẳng vào `wrangler secret put`. Khóa dự phòng pipe thẳng vào CLI của kho mật khẩu (`op` của 1Password, `bw` của Bitwarden), qua stdin, không qua tham số dòng lệnh. Không có hai CLI đó thì dùng `pbcopy`, dán vào kho mật khẩu, rồi xóa clipboard.
  - **`kid` phải là duy nhất:** quy ước `<env>-<năm>-<tháng>-<số thứ tự>`, khóa dự phòng thêm `-b` (ví dụ `stg-2026-10-1`, `stg-2026-10-1-b`). `gen-token-key.mjs` từ chối `kid` đã có trong `keys/public-keys.json`.
- **QĐ30. Chống CSRF ở Worker admin.** Mọi request không phải `GET`/`HEAD`:
  - phải có `content-type: application/json`, không thì `415`;
  - bị từ chối (`403`) khi có `Sec-Fetch-Site` mà khác `same-origin` và `none`, hoặc có `Origin` mà khác origin của Worker admin.

  Cookie `CF_Authorization` của ứng dụng Access đặt `SameSite=Lax`, `HttpOnly`, và bật Binding Cookie (Task 19, Step 11b). Không dùng `Strict`: tài liệu Cloudflare cảnh báo `Strict` có thể gây `ERR_TOO_MANY_REDIRECTS`, và CSRF đã chặn trong code. Tài liệu cũng cảnh báo Binding Cookie có thể không hợp với công cụ ngoài trình duyệt; nếu `cloudflared access curl` hỏng sau khi bật thì tắt Binding Cookie, ghi lại là rủi ro chấp nhận.

  `confirm-webhook` chỉ nhận URL `…/v1/webhooks/payos` trên đúng origin `API_ORIGIN` của môi trường.
- **QĐ31. Kiểm khóa công khai khớp khóa riêng.** `scripts/verify-token.mjs` kiểm chữ ký một token thật bằng `keys/public-keys.json`, nên chứng minh khóa đang ký khớp khóa công khai app sẽ build sẵn. `scripts/jwk-public.mjs` đọc JWK khóa dự phòng từ stdin ẩn (`read -rs`) và so với khóa công khai dự phòng, nên kiểm được bản trong kho mật khẩu mà không hiện khóa riêng.

## Điểm cần chủ dự án quyết

Nếu tới lúc làm mà chưa có quyết định, cứ làm theo đề xuất, trừ khi điểm đó ghi "phải quyết".

- **P05-1. Kênh thanh toán PayOS cho staging. Phải quyết trước Task 19.** Nên tạo kênh thứ hai trên my.payos.vn, vì mỗi kênh chỉ có một webhook URL. Nếu PayOS không cho hai kênh cùng một tài khoản ngân hàng, có hai cách:
  - dùng một tài khoản ngân hàng khác cho staging;
  - chỉ giữ staging tới trước khi production chạy, rồi dùng lại kênh đó cho production. Số đơn không trùng, vì production bắt đầu từ 1.000.001 (QĐ18).
- **P05-2. Giá thử trên staging.** Đề xuất 2.000 đ và 3.000 đ. Nếu PayOS có mức tối thiểu cao hơn thì sửa `PRICES_JSON` của `env.staging` (Task 20, Step 1).
- **P05-3. Chính sách khóa tạm (QĐ10).** Đề xuất: đếm số lần gỡ trong 30 ngày, trừ các lần gỡ chính máy đang kích hoạt; hơn 3 lần thì khóa. Key bị khóa vẫn chạy trên máy đang kích hoạt, nhưng chặn mọi máy khác, kể cả máy từng dùng, tới khi hỗ trợ mở khóa.
- **P05-4. Giao diện admin.** Kế hoạch chỉ làm JSON API: `GET /admin/whoami` xem được bằng trình duyệt; mọi thao tác khác gọi bằng `cloudflared access curl` (Phụ lục B). Có cần một trang giao diện nhỏ không?
- **P05-5. Email nhận cảnh báo (`OPERATOR_EMAIL`).** Đề xuất: một hộp thư vận hành riêng của sản phẩm. Đặt bằng `wrangler secret put` ở Task 19 và 21; thiếu thì cảnh báo chỉ nằm trong log.
- **P05-6. Kho mật khẩu cho khóa dự phòng.** Kế hoạch hỗ trợ 1Password CLI (`op`, đã có trên máy dev) và Bitwarden CLI (`bw`); không có thì dùng `pbcopy` (QĐ29). Chủ dự án chọn kho và vault.
- **Q9** (kế hoạch 00): kế hoạch làm theo kiểu ẩn danh (QĐ16). Còn chờ thời gian lưu dữ liệu, và xác nhận là giữ lại đơn hàng.
- **Q10** (kế hoạch 00): nếu phải phát hóa đơn điện tử qua PayOS, cần gửi thông tin người mua (`buyerName`, `buyerTaxCode`, `buyerEmail`…) và thêm ô nhập ở app. Đó là việc mới cho 05 và 06, phải làm trước khi bán.
- **Q11** (kế hoạch 00): kế hoạch làm theo đề xuất (Task 7, Task 19 Step 6). Xác nhận trước Task 21.

## Hợp đồng API cho kế hoạch 06

Mọi body là JSON, tên trường `snake_case` (QĐ26). Lỗi có dạng `{"error": "<mã>", …}`. Thời điểm là giây Unix. Key trả về luôn ở dạng hiển thị `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`; key gửi lên được gõ tùy ý (QĐ5).

| Endpoint | Gửi | Thành công | Lỗi |
|---|---|---|---|
| `POST /v1/checkout` | `{plan: "pro_1m"\|"pro_12m", email, consent: true, license_key?}` | `201 {order_code, order_token, checkout_url, qr_code, amount, currency, expires_at}` | `400 invalid_request {field}`, `404 invalid_key`, `403 license_revoked`, `429 rate_limited`, `502 payment_provider_error`, `503 pricing_not_configured`, `503 order_code_exhausted` |
| `GET /v1/orders/{order_code}` | header `Authorization: Bearer <order_token>` | `200 {order_code, status, plan, amount, currency, expires_at}`; khi `status = "paid"` thêm `license_key, license_expires_at, renewal` | `404 order_not_found` (sai hay thiếu token cũng vậy; token trong query không được nhận), `429` |
| `POST /v1/licenses/activate` | `{key, device_id_hash (64 hex thường), device_label}` | `200 {token, activation_id, expires_at, refresh_before}` | `400`, `404 invalid_key`, `403 license_revoked`, `403 license_expired {expires_at}`, `409 device_limit {activations: [{activation_id, device_label, last_validated_at}]}`, `423 license_locked`, `429` |
| `POST /v1/licenses/validate` | `{key, activation_id}` | như `activate` | `400`, `404 invalid_key`, `404 activation_not_found` (máy đã bị gỡ), `403 license_revoked`, `403 license_expired {expires_at}`, `429` |
| `POST /v1/licenses/deactivate` | `{key, activation_id}` | `200 {ok: true}` (gỡ lại lần nữa vẫn `200`) | `400`, `404 invalid_key`, `404 activation_not_found`, `429` |
| `POST /v1/licenses/recover` | `{email}` | `200 {ok: true}`, dù email có key hay không | `400 invalid_request {field: "email"}`, `429` |
| `POST /v1/webhooks/{provider}` | body của cổng thanh toán (PayOS: `/v1/webhooks/payos`) | `200 {ok: true, result}` | `400 invalid_signature`, `404` (cổng lạ), `503` (để cổng gửi lại) |

- `status` của đơn: `pending`, `processing`, `paid`, `underpaid`, `cancelled`, `expired`, `failed`.
- `429` luôn kèm header `Retry-After` (giây). App hiện lỗi "thử lại sau", không thử lại liên tục.
- **Hợp đồng khi IP bị chặn (QĐ7, CGNAT).** Sau 60 lần thất bại trong 1 giờ từ một IP, server chỉ cho qua `validate` và `deactivate` có key hợp lệ **kèm `activation_id` đang hoạt động và khớp**; mọi request khác từ IP đó trả `429` tới hết giờ, kể cả `activate`. Vì vậy app (06) luôn gửi `activation_id` khi `validate`, và không coi `429` ở `activate` là key sai.
- Header `Authorization` nhận scheme `Bearer` không phân biệt hoa thường.
- Mọi route trả `403 forbidden` nếu request không qua HTTPS (ngoài môi trường dev), và `413` nếu body lớn hơn 16 KiB.
- Token và khóa công khai: định dạng ở QĐ4, vector ở `server/test/vectors/token-v1.json`, khóa công khai của từng môi trường ở `server/keys/public-keys.json` (tạo ở Task 19).
- Cách tính ký tự kiểm tra của key (Luhn mod 32) có trong vector (`license_key_check`), kèm các ví dụ đúng và sai (`license_keys`).

## Nơi lưu dữ liệu cá nhân (§10.1, dòng 256)

| Nơi | Dữ liệu | Vị trí | Thời gian lưu |
|---|---|---|---|
| Cloudflare D1 `mt-license-<env>` | `licenses.email`, `orders.email`, `orders.email_consent_at`, `activations.device_id_hash`, `activations.device_label`, `activations.last_validated_at`, cùng đơn hàng và license | Gợi ý vị trí `apac` (QĐ21); Cloudflare quyết định trung tâm dữ liệu cụ thể | Chờ Q9. Xóa theo yêu cầu bằng `POST /admin/erase` |
| Cloudflare D1, bảng `rate_limits` | HMAC-SHA256 (khóa `RATE_LIMIT_PEPPER`) của IP, key, email; không dò ngược được nếu không có pepper | như trên | Khoảng 3 giờ: cửa sổ 1 giờ, cron xóa khi đã cũ hơn 2 giờ |
| Cloudflare D1, bảng `ops_alerts` | loại cảnh báo và số lần theo giờ; không có dữ liệu cá nhân | như trên | 7 ngày; cron dọn |
| Cloudflare D1, bảng `audit_log` | email của **người vận hành**; mã license, mã đơn; không có email khách | như trên | Chờ Q9 |
| Workers Logs, Workers Issues | Chỉ log JSON do code ghi: email che bớt (`b***@example.com`), mã đơn. Invocation log (có URL và query) đã tắt, query bị bỏ khỏi URL (QĐ25). Không có key, token hay khóa API | Cloudflare | Logs: 3 ngày với gói Free, 7 ngày với gói Paid. Issues: theo Cloudflare (beta) |
| Secret của Worker | `OPERATOR_EMAIL` (email người vận hành, QĐ27), cùng các khóa API | Cloudflare | Tới khi xóa secret |
| Resend | địa chỉ người nhận và nội dung thư (có key); cả thư cảnh báo gửi người vận hành | Staging: mặc định của `resend.dev`. Production: chọn vùng khi thêm tên miền; vùng gần nhất là `ap-northeast-1` (Tokyo) | Theo chính sách của Resend |
| PayOS | Không nhận email hay dữ liệu cá nhân nào từ server (QĐ23). Thông tin chuyển khoản do ngân hàng và PayOS xử lý | Việt Nam | Theo PayOS |

## Cấu trúc file

```
.gitignore                          # thêm mẫu bí mật (Task 1)
server/
├── .node-version                   # 24.21.0
├── package.json                    # phiên bản chốt, script typecheck/test/vectors/dry-run/check
├── pnpm-lock.yaml
├── pnpm-workspace.yaml             # dự án pnpm riêng; allowBuilds cho esbuild, workerd
├── tsconfig.json                   # strict, kiểu của workers-types và vitest-plugin
├── vitest.config.ts                # chạy test trong workerd; secret giả; migration D1
├── wrangler.jsonc                  # Worker API: gốc (dev, test), staging, production
├── wrangler.admin.jsonc            # Worker admin: gốc, staging, production
├── migrations/0001_init.sql        # schema D1
├── keys/public-keys.json           # khóa công khai kiểm token (Task 19)
├── scripts/
│   ├── gen-token-key.mjs           # tạo cặp khóa ký; khóa riêng chỉ đi qua pipe (Q11, QĐ29)
│   ├── jwk-public.mjs              # tính khóa công khai từ JWK trên stdin, so với public-keys.json (QĐ31)
│   ├── verify-token.mjs            # kiểm chữ ký token thật bằng public-keys.json (QĐ31)
│   ├── gen-token-vectors.mjs       # sinh vector dùng chung với 06 (Đ9)
│   └── measure-key-check.mjs       # đo tỉ lệ bắt lỗi gõ của ký tự kiểm tra (QĐ5)
├── src/
│   ├── index.ts                    # điểm vào Worker API: fetch + scheduled
│   ├── admin-entry.ts              # điểm vào Worker admin
│   ├── app.ts                      # app Hono: HTTPS, giới hạn body, gắn route
│   ├── deps.ts                     # Deps thật, nạp khóa ký, gửi email chứa key
│   ├── env.ts                      # kiểu binding, biến, secret
│   ├── http.ts                     # đọc và kiểm input, dạng lỗi chung
│   ├── audit.ts                    # nhật ký thay đổi
│   ├── crypto.ts                   # base64url, SHA-256, HMAC, so sánh an toàn
│   ├── license-key.ts              # sinh, chuẩn hóa, kiểm key
│   ├── token.ts                    # ký và kiểm token v1
│   ├── plans.ts                    # gói, số ngày, bảng giá
│   ├── ratelimit.ts                # giới hạn tần suất trong D1 (HMAC có pepper), chặn IP thất bại nhiều
│   ├── alerts.ts                   # cảnh báo cho người vận hành, gửi qua EmailProvider
│   ├── checkout.ts                 # POST /v1/checkout, trang return/cancel
│   ├── orders.ts                   # webhook theo cổng, hỏi đơn, cấp/gia hạn idempotent, gửi lại email
│   ├── licenses.ts                 # activate, validate, deactivate, recover
│   ├── reconcile.ts                # Cron Trigger: đối soát, gửi lại email, cảnh báo, dọn bộ đếm
│   ├── admin.ts                    # /admin/*
│   ├── payment/{provider,payos}.ts
│   └── email/{provider,resend,templates}.ts
└── test/
    ├── env.d.ts  apply-migrations.ts  db.ts  keys.ts  fakes.ts  world.ts
    ├── vectors/token-v1.json       # hợp đồng với 06
    ├── fixtures/                   # khóa công khai test, JWK của khóa test (cho các script)
    └── *.test.ts
```

---
## Task 1: Thêm mẫu bí mật vào `.gitignore`

Làm trước khi tạo `server/` (§12, dòng 321).

**Files:**
- Modify: `.gitignore` (thêm vào cuối file)

- [ ] **Step 1: Thêm vào cuối `.gitignore`**

```gitignore

# Bí mật (spec §10.2, §12): không commit file chứa khóa hay biến môi trường thật
.dev.vars*
.env*
*.pem
*.p12
*.pfx
*.key

# License server
/server/node_modules/
/server/.wrangler/
```

- [ ] **Step 2: Kiểm các mẫu bắt đúng file**

```bash
git check-ignore -v server/.dev.vars server/.dev.vars.staging server/.env server/.env.local server/token.pem server/cert.p12 server/cert.pfx server/signing.key server/node_modules/x server/.wrangler/state
git check-ignore server/wrangler.jsonc server/test/vectors/token-v1.json server/keys/public-keys.json; echo "exit=$?"
```

Expected (lúc lập kế hoạch):
```
.gitignore:25:.dev.vars*	server/.dev.vars
.gitignore:25:.dev.vars*	server/.dev.vars.staging
.gitignore:26:.env*	server/.env
.gitignore:26:.env*	server/.env.local
.gitignore:27:*.pem	server/token.pem
.gitignore:28:*.p12	server/cert.p12
.gitignore:29:*.pfx	server/cert.pfx
.gitignore:30:*.key	server/signing.key
.gitignore:33:/server/node_modules/	server/node_modules/x
.gitignore:34:/server/.wrangler/	server/.wrangler/state
```
```
exit=1
```
Lệnh thứ hai không in đường dẫn nào, và `exit=1`: file cấu hình, vector và khóa công khai không bị bỏ qua.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: bỏ qua file bí mật và thư mục build của server trước khi tạo server/" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: Khung `server/`

**Files:**
- Create: `server/package.json`, `server/pnpm-workspace.yaml`, `server/.node-version`, `server/tsconfig.json`, `server/wrangler.jsonc`, `server/vitest.config.ts`, `server/src/env.ts`, `server/src/index.ts`, `server/test/env.d.ts`, `server/test/health.test.ts`
- Create (sinh ra): `server/pnpm-lock.yaml`

- [ ] **Step 1: Tạo `server/package.json`**

Phiên bản chốt ở đầu kế hoạch. Task 18 thêm các script còn lại.

`server/package.json`:

```json
{
  "name": "meeting-translator-license-server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": {
    "node": ">=24.21.0"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "hono": "4.13.11"
  },
  "devDependencies": {
    "@cloudflare/vitest-plugin": "1.3.2",
    "@cloudflare/workers-types": "5.20260929.1",
    "typescript": "7.0.2",
    "vitest": "4.1.11",
    "wrangler": "4.143.1"
  }
}
```

- [ ] **Step 2: Tạo `server/pnpm-workspace.yaml` và `server/.node-version`**

`server/pnpm-workspace.yaml`:

```yaml
# server/ là dự án pnpm riêng, không thuộc workspace ở gốc repo (xem kế hoạch Giai đoạn 1 · 05).
# esbuild và workerd cần chạy script cài đặt để tải binary cho đúng nền tảng.
allowBuilds:
  esbuild: true
  workerd: true
```

`server/.node-version`:

```text
24.21.0
```

- [ ] **Step 3: Tạo `server/tsconfig.json`**

`vitest.config.ts` chạy trong Node nên không nằm trong `include`: kiểu của Node không có trong `types`.

`server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": [
      "ES2024"
    ],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "types": [
      "@cloudflare/workers-types",
      "@cloudflare/vitest-plugin/types"
    ],
    "resolveJsonModule": true
  },
  "include": [
    "src",
    "test"
  ]
}
```

- [ ] **Step 4: Tạo `server/wrangler.jsonc` (chỉ cấu hình gốc cho test và chạy cục bộ)**

`server/wrangler.jsonc`:

```jsonc
// Worker API công khai của license server (spec §6.8). Worker admin cấu hình riêng ở wrangler.admin.jsonc.
// Cấu hình gốc chỉ dùng cho test và chạy cục bộ. Môi trường staging và production thêm ở Task 18.
// Secret (PayOS, Resend, khóa ký, pepper, email người vận hành) nhập bằng `wrangler secret put`, không bao giờ ghi vào file này.
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "mt-license",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-26",
  "workers_dev": false,
  "preview_urls": false,
  // Tắt invocation log (log đó lưu cả URL và query của request) và bỏ query khỏi URL trong log và trace (QĐ25).
  // Log JSON do code tự ghi vẫn giữ. Bật Workers Issues để có cảnh báo không phụ thuộc Resend (QĐ27).
  "observability": { "enabled": true, "redact_query_string": true, "logs": { "invocation_logs": false }, "issues": { "enabled": true } },
  "vars": {
    "ENVIRONMENT": "dev",
    "PAYOS_BASE_URL": "https://api-merchant.payos.vn",
    "EMAIL_FROM": "Meeting Translator <onboarding@resend.dev>",
    "PRICES_JSON": "{\"pro_1m\":{\"VND\":2000},\"pro_12m\":{\"VND\":3000}}"
  },
  "secrets": {
    "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY", "TOKEN_SIGNING_JWK", "RATE_LIMIT_PEPPER"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "mt-license-dev", "database_id": "00000000-0000-0000-0000-000000000000" }
  ],
  "triggers": { "crons": ["*/5 * * * *"] }
}
```

- [ ] **Step 5: Tạo `server/vitest.config.ts`**

`server/vitest.config.ts`:

```ts
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Secret giả cho test. Gán cả vào process.env của tiến trình vitest để plugin không cảnh báo thiếu secret;
// binding bên dưới ghi đè mọi secret thật có thể có trong .dev.vars hay biến môi trường của máy.
const FAKE_SECRETS = {
  PAYOS_CLIENT_ID: "test-client-id",
  PAYOS_API_KEY: "test-api-key",
  PAYOS_CHECKSUM_KEY: "test-checksum-key",
  RESEND_API_KEY: "re_test",
  TOKEN_SIGNING_JWK: "{}",
  RATE_LIMIT_PEPPER: "test-pepper",
};
Object.assign(process.env, FAKE_SECRETS);

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: FAKE_SECRETS },
    }),
  ],
});
```

- [ ] **Step 6: Tạo `server/src/env.ts`: tên binding, biến, secret**

`server/src/env.ts`:

```ts
// Binding, biến và secret của hai Worker. Secret khai báo ở `secrets.required` trong wrangler*.jsonc,
// nên `wrangler deploy` báo lỗi nếu thiếu (tên biến chốt ở kế hoạch 05, theo mục 6.5 của kế hoạch 00).

export interface ApiEnv {
  DB: D1Database;
  /** "dev" | "staging" | "production" */
  ENVIRONMENT: string;
  /** Bảng giá theo gói và loại tiền (Q2), ví dụ {"pro_1m":{"VND":2000},"pro_12m":{"VND":3000}}. */
  PRICES_JSON?: string;
  PAYOS_BASE_URL: string;
  EMAIL_FROM: string;
  // Secret
  PAYOS_CLIENT_ID: string;
  PAYOS_API_KEY: string;
  PAYOS_CHECKSUM_KEY: string;
  RESEND_API_KEY: string;
  /** JWK Ed25519 khóa riêng, có `kid` (scripts/gen-token-key.mjs). */
  TOKEN_SIGNING_JWK: string;
  /** Khóa HMAC cho bộ đếm giới hạn tần suất (ngẫu nhiên, 32 byte). */
  RATE_LIMIT_PEPPER: string;
  /** Email người vận hành nhận cảnh báo. Không bắt buộc; thiếu thì cảnh báo chỉ ghi log. */
  OPERATOR_EMAIL?: string;
}

export interface AdminEnv {
  DB: D1Database;
  ENVIRONMENT: string;
  PAYOS_BASE_URL: string;
  EMAIL_FROM: string;
  /** Audience tag của ứng dụng Access. Bắt buộc khi ENVIRONMENT khác "dev"; trống thì mọi request bị 403. */
  ACCESS_AUD?: string;
  /** Origin của Worker API cùng môi trường; confirm-webhook chỉ nhận URL webhook trên origin này. */
  API_ORIGIN?: string;
  // Secret
  PAYOS_CLIENT_ID: string;
  PAYOS_API_KEY: string;
  PAYOS_CHECKSUM_KEY: string;
  RESEND_API_KEY: string;
}
```

- [ ] **Step 7: Cài gói**

```bash
cd server && pnpm install
```

Expected (lúc lập kế hoạch, phần cuối):
```
+ hono 4.13.11
devDependencies:
+ @cloudflare/vitest-plugin 1.3.2
+ @cloudflare/workers-types 5.20260929.1
+ typescript 7.0.2
+ vitest 4.1.11
+ wrangler 4.143.1
Done in 3.6s using pnpm v12.6.0
```

- Có thêm `server/pnpm-lock.yaml`.
- Không có dòng `Ignored build scripts`. Nếu có dòng này thì `allowBuilds` chưa đúng.
- `server/pnpm-workspace.yaml` vẫn đúng như Step 2: `grep -c minimumReleaseAgeExclude server/pnpm-workspace.yaml` in `0`. **Không bao giờ commit `minimumReleaseAgeExclude`.** Nếu pnpm in `Added … entries to minimumReleaseAgeExclude` và tự ghi mục đó vào file, thì:
  1. xóa mục `minimumReleaseAgeExclude` khỏi `server/pnpm-workspace.yaml`;
  2. với từng gói được liệt kê, chọn bản mới nhất đã ra được ít nhất 1 ngày (`pnpm view <gói> time --json`), sửa `server/package.json`, kiểm lại peer dependency như bảng phiên bản;
  3. xóa `server/node_modules` và `server/pnpm-lock.yaml`, chạy lại `pnpm install`;
  4. ghi bản đã đổi vào bảng "Phiên bản đã chốt" của kế hoạch này.

- [ ] **Step 8: Viết test trước: `server/test/env.d.ts` và `server/test/health.test.ts`**

`server/test/env.d.ts`:

```ts
// Kiểu của `env` và `exports` trong test (cloudflare:workers). Binding lấy từ wrangler.jsonc và vitest.config.ts.
type TestApiEnv = import("../src/env").ApiEnv;

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("../src/index");
  }
  interface Env extends TestApiEnv {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
```

`server/test/health.test.ts`:

```ts
import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("GET /v1/health trả 200", async () => {
  const res = await exports.default.fetch("https://example.com/v1/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
```

- [ ] **Step 9: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/health.test.ts
```

Expected: FAIL, vì chưa có `src/index.ts`:
```
Error: Cannot find module '<repo>/server/src/index.ts'
```
```
Test Files  1 failed (1)
Tests  1 failed (1)
```

- [ ] **Step 10: Tạo `server/src/index.ts`**

`server/src/index.ts`:

```ts
// Điểm vào của Worker API. Task 11 thay bằng app đầy đủ (src/app.ts).
import { Hono } from "hono";
import type { ApiEnv } from "./env";

const app = new Hono<{ Bindings: ApiEnv }>();
app.get("/v1/health", (c) => c.json({ ok: true }));

export default { fetch: app.fetch } satisfies ExportedHandler<ApiEnv>;
```

- [ ] **Step 11: Chạy test và typecheck**

```bash
cd server && pnpm exec vitest run test/health.test.ts && pnpm typecheck
```

Expected:
```
Test Files  1 passed (1)
Tests  1 passed (1)
```
`tsc --noEmit` không in lỗi nào.

- [ ] **Step 12: Commit**

```bash
git add server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml server/.node-version server/tsconfig.json server/wrangler.jsonc server/vitest.config.ts server/src/env.ts server/src/index.ts server/test/env.d.ts server/test/health.test.ts
git status --porcelain
git commit -m "feat(server): khung license server (Hono, Workers, vitest-plugin)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `git status --porcelain` trước khi commit chỉ liệt kê các file trên, có chữ `A` ở đầu; không có `node_modules` hay `.wrangler`.

## Task 3: Schema D1 và migration

**Files:**
- Modify: `server/vitest.config.ts` (thay toàn bộ)
- Create: `server/test/apply-migrations.ts`, `server/test/db.ts`, `server/test/schema.test.ts`, `server/migrations/0001_init.sql`

- [ ] **Step 1: Thay `server/vitest.config.ts`: đọc migration và áp trước mỗi file test**

`server/vitest.config.ts`:

```ts
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Secret giả cho test. Gán cả vào process.env của tiến trình vitest để plugin không cảnh báo thiếu secret;
// binding bên dưới ghi đè mọi secret thật có thể có trong .dev.vars hay biến môi trường của máy.
const FAKE_SECRETS = {
  PAYOS_CLIENT_ID: "test-client-id",
  PAYOS_API_KEY: "test-api-key",
  PAYOS_CHECKSUM_KEY: "test-checksum-key",
  RESEND_API_KEY: "re_test",
  TOKEN_SIGNING_JWK: "{}",
  RATE_LIMIT_PEPPER: "test-pepper",
};
Object.assign(process.env, FAKE_SECRETS);

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, ...FAKE_SECRETS } },
      }),
    ],
    test: { setupFiles: ["./test/apply-migrations.ts"] },
  };
});
```

- [ ] **Step 2: Tạo `server/test/apply-migrations.ts` và `server/test/db.ts`**

`server/test/apply-migrations.ts`:

```ts
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

`server/test/db.ts`:

```ts
import { env } from "cloudflare:workers";

/** Storage chỉ tách theo từng file test, nên mỗi test tự xóa dữ liệu (kể cả bộ đếm AUTOINCREMENT). */
export async function resetDb(): Promise<void> {
  await env.DB.batch(
    ["audit_log", "activations", "orders", "licenses", "rate_limits", "ops_alerts", "sqlite_sequence"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
}
```

- [ ] **Step 3: Viết test `server/test/schema.test.ts`**

`server/test/schema.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { resetDb } from "./db";

beforeEach(resetDb);

it("migration tạo đủ bảng", async () => {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  ).all<{ name: string }>();
  expect(results.map((r) => r.name)).toEqual([
    "activations",
    "audit_log",
    "d1_migrations",
    "licenses",
    "ops_alerts",
    "orders",
    "rate_limits",
  ]);
});

it("mỗi máy chỉ có một activation đang dùng cho một license", async () => {
  await env.DB.prepare(
    "INSERT INTO licenses (id, license_key, email, plan, expires_at, created_at) VALUES ('L1', 'K1', NULL, 'pro', 1, 0)",
  ).run();
  const insert = env.DB.prepare(
    "INSERT INTO activations (id, license_id, device_id_hash, created_at, last_validated_at) VALUES (?, 'L1', 'd', 0, 0)",
  );
  await insert.bind("A1").run();
  await expect(insert.bind("A2").run()).rejects.toThrow(/UNIQUE/);
});
```

- [ ] **Step 4: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/schema.test.ts
```

Expected: FAIL khi nạp cấu hình, vì chưa có thư mục migration:
```
Error: ENOENT: no such file or directory, scandir '<repo>/server/migrations'
```

- [ ] **Step 5: Tạo `server/migrations/0001_init.sql`**

`server/migrations/0001_init.sql`:

```sql
-- Schema của license server (spec §6.8, §10.1, §10.2).
-- Mọi thời điểm là giây Unix (UTC). Chỉ lưu dữ liệu §10.1 cho phép:
-- email, đơn hàng, license, mã băm ID máy, device_label, lần kiểm tra gần nhất.

CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  license_key TEXT NOT NULL UNIQUE,      -- 28 ký tự Crockford base32, không gạch nối
  email TEXT,                            -- NULL sau khi ẩn danh theo email (Q9)
  plan TEXT NOT NULL,                    -- 'pro'
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  locked_at INTEGER,                     -- khóa tạm vì gỡ rồi kích hoạt quá ngưỡng (§10.2)
  lock_cleared_at INTEGER                -- admin mở khóa; lần gỡ trước mốc này không tính nữa
);
CREATE INDEX licenses_email ON licenses (email);

CREATE TABLE orders (
  order_code INTEGER PRIMARY KEY AUTOINCREMENT,
  order_token_hash TEXT NOT NULL,        -- SHA-256 của order_token; không lưu token gốc
  provider TEXT NOT NULL,                -- 'payos'
  provider_ref TEXT,                     -- paymentLinkId của PayOS
  plan TEXT NOT NULL,                    -- 'pro_1m' | 'pro_12m'
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,                -- 'VND'
  email TEXT,                            -- NULL sau khi ẩn danh theo email (Q9)
  email_consent_at INTEGER NOT NULL,     -- lúc người mua tick đồng ý xử lý email (§10.1)
  renew_license_id TEXT REFERENCES licenses (id),
  license_id TEXT REFERENCES licenses (id),
  status TEXT NOT NULL,                  -- pending | processing | paid | underpaid | cancelled | expired | failed
  amount_paid INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,           -- hạn của link thanh toán (tạo đơn + 15 phút)
  paid_at INTEGER,
  last_checked_at INTEGER,
  email_sent_at INTEGER,
  email_attempts INTEGER NOT NULL DEFAULT 0,   -- số lần đã thử gửi thư chứa key
  email_retry_at INTEGER,                      -- lần gửi lại kế tiếp sau lỗi tạm (401, 403, 409, 429, 5xx, mạng)
  email_gave_up_at INTEGER                     -- thôi gửi sau lỗi vĩnh viễn (400, 422)
);
CREATE INDEX orders_pending ON orders (status, created_at);
CREATE INDEX orders_email ON orders (email);

CREATE TABLE activations (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses (id),
  device_id_hash TEXT NOT NULL,          -- SHA-256 hex của IOPlatformUUID hoặc MachineGuid
  device_label TEXT,                     -- tên máy; NULL sau khi ẩn danh (Q9)
  created_at INTEGER NOT NULL,
  last_validated_at INTEGER NOT NULL,
  deactivated_at INTEGER,
  deactivated_by TEXT                    -- 'user' | 'admin'
);
CREATE UNIQUE INDEX activations_active_device ON activations (license_id, device_id_hash) WHERE deactivated_at IS NULL;
CREATE INDEX activations_license ON activations (license_id, deactivated_at);

-- Nhật ký mọi thay đổi license và mọi thao tác admin (§6.8, §10.2).
-- detail là JSON, không chứa key đầy đủ, token, email hay khóa API.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,                   -- 'api' | 'webhook' | 'reconcile' | 'admin:<email người vận hành>'
  action TEXT NOT NULL,
  license_id TEXT,
  order_code INTEGER,
  detail TEXT
);
CREATE INDEX audit_license ON audit_log (license_id, at);
CREATE INDEX audit_order ON audit_log (order_code, at);

-- Bộ đếm giới hạn tần suất theo cửa sổ 1 giờ (§10.2). bucket = '<tên>:<HMAC-SHA256(RATE_LIMIT_PEPPER, IP, key hoặc email)>'.
CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
) WITHOUT ROWID;

-- Cảnh báo cho người vận hành (§10.2): đếm theo loại và theo giờ; cron gửi tối đa một email mỗi loại mỗi giờ.
CREATE TABLE ops_alerts (
  kind TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  notified_count INTEGER NOT NULL DEFAULT 0,   -- số sự kiện đã báo; count > notified_count là còn chưa báo
  notified_at INTEGER,
  PRIMARY KEY (kind, window_start)
) WITHOUT ROWID;
```

- [ ] **Step 6: Chạy test**

```bash
cd server && pnpm exec vitest run test/schema.test.ts
```

Expected:
```
Test Files  1 passed (1)
Tests  2 passed (2)
```

- [ ] **Step 7: Commit**

```bash
git add server/vitest.config.ts server/test/apply-migrations.ts server/test/db.ts server/test/schema.test.ts server/migrations/0001_init.sql
git commit -m "feat(server): schema D1 cho license, đơn hàng, activation, nhật ký, giới hạn tần suất" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 4: Tiện ích mã hóa (Web Crypto)

**Files:**
- Create: `server/test/crypto.test.ts`, `server/src/crypto.ts`

- [ ] **Step 1: Viết test `server/test/crypto.test.ts`**

`server/test/crypto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { b64urlDecode, b64urlEncode, hmacSha256Hex, sha256Hex, timingSafeEqual } from "../src/crypto";

describe("crypto", () => {
  it("base64url đi và về, không padding", () => {
    const bytes = Uint8Array.from([0, 250, 251, 252, 253, 254, 255]);
    const text = b64urlEncode(bytes);
    expect(text).toBe("APr7_P3-_w");
    expect(Array.from(b64urlDecode(text))).toEqual(Array.from(bytes));
  });

  it("base64url sai định dạng thì ném lỗi", () => {
    expect(() => b64urlDecode("ab+c")).toThrow();
    expect(() => b64urlDecode("abcde")).toThrow();
  });

  it("base64url không ở dạng chuẩn (có padding, bit thừa khác 0) thì ném lỗi", () => {
    expect(Array.from(b64urlDecode("AA"))).toEqual([0]);
    expect(() => b64urlDecode("AA==")).toThrow();
    // "AB": ký tự cuối mang 4 bit thừa khác 0, giải lỏng lẻo vẫn ra byte 0.
    expect(() => b64urlDecode("AB")).toThrow(/dạng chuẩn/);
  });

  it("SHA-256 khớp giá trị chuẩn", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("HMAC-SHA256 khớp RFC 4231, trường hợp 2", async () => {
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("so sánh an toàn", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/crypto.test.ts
```

Expected: FAIL:
```
Error: Cannot find module '../src/crypto' imported from <repo>/server/test/crypto.test.ts
```

- [ ] **Step 3: Tạo `server/src/crypto.ts`**

`server/src/crypto.ts`:

```ts
// Hàm mã hóa dùng chung, chỉ dựa vào Web Crypto của Workers (không cần thư viện ngoài).

const encoder = new TextEncoder();

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Giải base64url dạng chuẩn: không padding, bit thừa ở ký tự cuối phải bằng 0.
 * Chuỗi khác dạng chuẩn thì ném lỗi, khớp với crate `base64` của Rust (URL_SAFE_NO_PAD) mà app dùng (Đ9).
 */
export function b64urlDecode(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error("base64url không hợp lệ");
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  if (b64urlEncode(bytes) !== text) throw new Error("base64url không ở dạng chuẩn");
  return bytes;
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const input = typeof data === "string" ? encoder.encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  return bytesToHex(await sha256(data));
}

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message))));
}

/** So sánh hai chuỗi trong thời gian không phụ thuộc nội dung (dùng cho chữ ký và mã băm token). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.byteLength !== y.byteLength) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}
```

- [ ] **Step 4: Chạy test**

```bash
cd server && pnpm exec vitest run test/crypto.test.ts
```

Expected:
```
Test Files  1 passed (1)
Tests  6 passed (6)
```

- [ ] **Step 5: Commit**

```bash
git add server/src/crypto.ts server/test/crypto.test.ts
git commit -m "feat(server): base64url, SHA-256, HMAC-SHA256 và so sánh an toàn bằng Web Crypto" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: License key có ký tự kiểm tra Luhn mod 32

**Files:**
- Create: `server/test/license-key.test.ts`, `server/src/license-key.ts`, `server/scripts/measure-key-check.mjs`

- [ ] **Step 1: Viết test `server/test/license-key.test.ts`**

`server/test/license-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatLicenseKey, generateLicenseKey, KEY_ALPHABET, luhnCheckChar, normalizeLicenseKey } from "../src/license-key";

describe("license key", () => {
  it("sinh 28 ký tự trong bảng Crockford, ký tự kiểm tra đúng", () => {
    for (let i = 0; i < 50; i++) {
      const key = generateLicenseKey();
      expect(key).toMatch(new RegExp(`^[${KEY_ALPHABET}]{28}$`));
      expect(normalizeLicenseKey(key)).toBe(key);
    }
  });

  it("hai key sinh ra không trùng nhau", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) keys.add(generateLicenseKey());
    expect(keys.size).toBe(200);
  });

  it("nhận key có gạch nối, chữ thường, O/I/L gõ nhầm", () => {
    const key = generateLicenseKey();
    const typed = formatLicenseKey(key).toLowerCase().replace(/0/g, "o").replace(/1/g, "l");
    expect(normalizeLicenseKey(` ${typed} `)).toBe(key);
  });

  const FIXED = "0123456789ABCDEFGHJKMNPQRST5";

  it("key cố định: bắt được cả 28 × 31 lỗi thay một ký tự (kể cả ký tự kiểm tra)", () => {
    expect(normalizeLicenseKey(FIXED)).toBe(FIXED);
    let tried = 0;
    let caught = 0;
    for (let i = 0; i < 28; i++) {
      for (let d = 1; d < 32; d++) {
        const wrong = KEY_ALPHABET.charAt((KEY_ALPHABET.indexOf(FIXED.charAt(i)) + d) % 32);
        tried++;
        if (normalizeLicenseKey(FIXED.slice(0, i) + wrong + FIXED.slice(i + 1)) === null) caught++;
      }
    }
    expect([caught, tried]).toEqual([868, 868]);
  });

  it("key cố định: bắt được cả 27 lỗi đảo hai ký tự kề nhau", () => {
    let caught = 0;
    for (let i = 0; i < 27; i++) {
      const swapped = FIXED.slice(0, i) + FIXED.charAt(i + 1) + FIXED.charAt(i) + FIXED.slice(i + 2);
      if (normalizeLicenseKey(swapped) === null) caught++;
    }
    expect(caught).toBe(27);
  });

  it("giới hạn đã biết của Luhn mod 32: đảo cặp 0↔Z kề nhau không bị bắt", () => {
    const body = `${"1".repeat(25)}0Z`;
    const key = body + luhnCheckChar(body);
    expect(normalizeLicenseKey(`${"1".repeat(25)}Z0${key.charAt(27)}`)).toBe(`${"1".repeat(25)}Z0${key.charAt(27)}`);
  });

  it("từ chối sai độ dài, ký tự lạ, chuỗi quá dài", () => {
    expect(normalizeLicenseKey("ABC")).toBeNull();
    expect(normalizeLicenseKey("U".repeat(28))).toBeNull();
    expect(normalizeLicenseKey("' OR 1=1 --")).toBeNull();
    expect(normalizeLicenseKey("A".repeat(65))).toBeNull();
  });

  it("định dạng 7 nhóm 4 ký tự", () => {
    expect(formatLicenseKey("ABCDEFGHJKMNPQRSTVWXYZ012345")).toBe("ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345");
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/license-key.test.ts
```

Expected: FAIL:
```
Error: Cannot find module '../src/license-key' imported from <repo>/server/test/license-key.test.ts
```

- [ ] **Step 3: Tạo `server/src/license-key.ts`**

`server/src/license-key.ts`:

```ts
// License key (§10.2): 27 ký tự ngẫu nhiên (135 bit) theo bảng Crockford base32, cộng 1 ký tự kiểm tra.
// Ký tự kiểm tra theo thuật toán Luhn mod 32 trên bảng này: bắt mọi lỗi thay một ký tự, và mọi lỗi
// đảo hai ký tự kề nhau trừ cặp 0↔Z. App (kế hoạch 06) tính lại y hệt để báo gõ sai trước khi gọi server;
// vector mẫu ở test/vectors/token-v1.json.
// Hiển thị: 7 nhóm 4 ký tự nối bằng "-". Lưu trong D1: 28 ký tự, không gạch nối.
import { randomBytes } from "./crypto";

export const KEY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BODY_LENGTH = 27;
const N = KEY_ALPHABET.length;

/** Luhn mod N: từ phải sang trái, nhân đôi ký tự thứ 1, 3, 5…, cộng các "chữ số" cơ số N của từng tích. */
export function luhnCheckChar(body: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    const product = factor * KEY_ALPHABET.indexOf(body.charAt(i));
    sum += Math.floor(product / N) + (product % N);
    factor = factor === 2 ? 1 : 2;
  }
  return KEY_ALPHABET.charAt((N - (sum % N)) % N);
}

export function generateLicenseKey(): string {
  // 256 chia hết cho 32 nên lấy 5 bit thấp của mỗi byte vẫn phân bố đều.
  const body = Array.from(randomBytes(BODY_LENGTH), (b) => KEY_ALPHABET.charAt(b & 31)).join("");
  return body + luhnCheckChar(body);
}

export function formatLicenseKey(key: string): string {
  return key.match(/.{1,4}/g)?.join("-") ?? key;
}

/**
 * Chuẩn hóa key người dùng gõ: bỏ khoảng trắng và gạch nối, viết hoa, đổi O→0, I và L→1.
 * Trả về 28 ký tự dạng lưu trữ, hoặc null nếu sai độ dài, sai ký tự hay sai ký tự kiểm tra.
 */
export function normalizeLicenseKey(input: string): string | null {
  if (input.length > 64) return null;
  const key = input.replace(/[\s-]/g, "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
  if (key.length !== BODY_LENGTH + 1) return null;
  for (const ch of key) if (!KEY_ALPHABET.includes(ch)) return null;
  return luhnCheckChar(key.slice(0, BODY_LENGTH)) === key.slice(BODY_LENGTH) ? key : null;
}
```

- [ ] **Step 4: Chạy test**

```bash
cd server && pnpm exec vitest run test/license-key.test.ts
```

Expected:
```
Test Files  1 passed (1)
Tests  8 passed (8)
```

- [ ] **Step 5: Tạo `server/scripts/measure-key-check.mjs` và đo tỉ lệ bắt lỗi gõ**

Script viết lại Luhn mod 32 độc lập với `src/license-key.ts`, chạy trên 20.000 key tất định, nên số đo lặp lại được.

`server/scripts/measure-key-check.mjs`:

```js
#!/usr/bin/env node
// Đo tỉ lệ ký tự kiểm tra Luhn mod 32 bắt được lỗi gõ, trên 20.000 key tất định (SHA-256 của "key-<i>").
// Viết lại thuật toán độc lập với src/license-key.ts. Dùng: node scripts/measure-key-check.mjs
import { createHash } from "node:crypto";

const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function check(body) {
  let factor = 2;
  let sum = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    const p = factor * A.indexOf(body[i]);
    sum += Math.floor(p / 32) + (p % 32);
    factor = factor === 2 ? 1 : 2;
  }
  return A[(32 - (sum % 32)) % 32];
}
const valid = (k) => check(k.slice(0, 27)) === k[27];
let sub = 0;
let subCaught = 0;
let swap = 0;
let swapCaught = 0;
for (let r = 0; r < 20000; r++) {
  const body = Array.from(createHash("sha256").update(`key-${r}`).digest().subarray(0, 27), (x) => A[x & 31]).join("");
  const key = body + check(body);
  for (let i = 0; i < 28; i++) {
    for (let d = 1; d < 32; d++) {
      sub++;
      if (!valid(key.slice(0, i) + A[(A.indexOf(key[i]) + d) % 32] + key.slice(i + 1))) subCaught++;
    }
  }
  for (let i = 0; i < 27; i++) {
    if (key[i] === key[i + 1]) continue;
    swap++;
    if (!valid(key.slice(0, i) + key[i + 1] + key[i] + key.slice(i + 2))) swapCaught++;
  }
}
const pct = (a, b) => ((100 * a) / b).toFixed(2);
console.log(`thay 1 ký tự: bắt ${subCaught}/${sub} (${pct(subCaught, sub)}%)`);
console.log(`đảo 2 ký tự kề nhau: bắt ${swapCaught}/${swap} (${pct(swapCaught, swap)}%)`);
```

```bash
cd server && node scripts/measure-key-check.mjs
```

Expected (lúc lập kế hoạch):
```
thay 1 ký tự: bắt 17360000/17360000 (100.00%)
đảo 2 ký tự kề nhau: bắt 521919/523019 (99.79%)
```
Lỗi đảo còn lọt chỉ là cặp 0↔Z kề nhau, giới hạn đã biết của Luhn mod N (test `giới hạn đã biết…` ở Step 1). Cách cũ lấy 5 bit của SHA-256 để lọt khoảng 1/32 lỗi thay một ký tự (3,13% trên cùng bộ key).

- [ ] **Step 6: Commit**

```bash
git add server/src/license-key.ts server/test/license-key.test.ts server/scripts/measure-key-check.mjs
git commit -m "feat(server): license key 135 bit, Crockford base32, ký tự kiểm tra Luhn mod 32" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 6: Token Ed25519 và bộ vector dùng chung với 06

**Files:**
- Create: `server/scripts/gen-token-vectors.mjs`, `server/test/vectors/token-v1.json` (sinh ra), `server/test/keys.ts`, `server/test/token.test.ts`, `server/src/token.ts`

- [ ] **Step 1: Tạo `server/scripts/gen-token-vectors.mjs`**

Script chạy trong Node, không dùng mã của `src/`. Nhờ vậy vector là một phép kiểm chéo độc lập với code của server.

`server/scripts/gen-token-vectors.mjs`:

```js
#!/usr/bin/env node
// Sinh bộ vector test token và license key dùng chung giữa server (kế hoạch 05) và app (kế hoạch 06), Đ9.
// Chạy lại cho ra đúng file cũ: Ed25519 là chữ ký tất định, và khóa test sinh từ nhãn cố định.
// Khóa trong file này CHỈ để test; không bản build nào của app hay server được nhận kid "test-*".
// Dùng: node scripts/gen-token-vectors.mjs > test/vectors/token-v1.json
import { createHash, webcrypto } from "node:crypto";

const { subtle } = webcrypto;
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (text) => createHash("sha256").update(text).digest();
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

async function testKey(kid, label) {
  const seed = sha256(label);
  const privateKey = await subtle.importKey("pkcs8", Buffer.concat([PKCS8_ED25519_PREFIX, seed]), { name: "Ed25519" }, true, ["sign"]);
  const jwk = await subtle.exportKey("jwk", privateKey);
  return { kid, seed_b64url: b64url(seed), public_b64url: jwk.x, privateKey, jwk };
}

async function sign(key, claims) {
  const payload = b64url(JSON.stringify(claims));
  const input = `v1.${payload}`;
  const sig = await subtle.sign({ name: "Ed25519" }, key.privateKey, Buffer.from(input));
  return `${input}.${b64url(sig)}`;
}

const k1 = await testKey("test-1", "meeting-translator token test key 1");
const k2 = await testKey("test-2", "meeting-translator token test key 2");
const issuedAt = Date.UTC(2026, 9, 1) / 1000; // 2026-10-01T00:00:00Z
const device = sha256("test-device-1").toString("hex");
const otherDevice = sha256("test-device-2").toString("hex");
const base = {
  kid: "test-1",
  license_id: "0b6f2c3e-1f4a-4c1e-9a53-2d7c8e9f0a11",
  plan: "pro",
  expires_at: issuedAt + 30 * 86400,
  activation_id: "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60",
  device_id_hash: device,
  issued_at: issuedAt,
  refresh_before: issuedAt + 14 * 86400,
};
const valid = await sign(k1, base);
const [, , validSig] = valid.split(".");
const tampered = `v1.${b64url(JSON.stringify({ ...base, expires_at: base.expires_at + 365 * 86400 }))}.${validSig}`;
const shortLicense = { ...base, expires_at: issuedAt + 7 * 86400 };
const { device_id_hash: _omit, ...missingField } = base;
// base64url không ở dạng chuẩn: crate `base64` của Rust (URL_SAFE_NO_PAD) từ chối, server cũng phải từ chối.
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const [validHead, validPayload] = valid.split(".");
const lastSig = validSig.at(-1);
// Chữ ký 64 byte là 86 ký tự; ký tự cuối chỉ mang 2 bit dữ liệu, 4 bit còn lại phải bằng 0.
const trailingBitsSig = validSig.slice(0, -1) + B64URL[B64URL.indexOf(lastSig) ^ 1];

const tokens = [
  { name: "valid", token: valid, now: issuedAt + 3600, device_id_hash: device, expected: "ok", claims: base },
  {
    name: "valid_backup_key",
    token: await sign(k2, { ...base, kid: "test-2" }),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "ok",
    claims: { ...base, kid: "test-2" },
  },
  { name: "bad_signature", token: tampered, now: issuedAt + 3600, device_id_hash: device, expected: "bad_signature" },
  {
    name: "unknown_kid",
    token: await sign(k1, { ...base, kid: "test-9" }),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "unknown_kid",
  },
  { name: "wrong_device", token: valid, now: issuedAt + 3600, device_id_hash: otherDevice, expected: "wrong_device" },
  {
    name: "refresh_expired",
    token: valid,
    now: base.refresh_before,
    device_id_hash: device,
    expected: "refresh_expired",
  },
  {
    name: "refresh_ok_one_second_before",
    token: valid,
    now: base.refresh_before - 1,
    device_id_hash: device,
    expected: "ok",
    claims: base,
  },
  {
    name: "license_expired",
    token: await sign(k1, shortLicense),
    now: shortLicense.expires_at,
    device_id_hash: device,
    expected: "license_expired",
  },
  {
    name: "kid_signed_by_other_key",
    token: await sign(k2, base),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "bad_signature",
  },
  {
    name: "signature_with_padding",
    token: `${valid}==`,
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "signature_trailing_bits",
    token: `${validHead}.${validPayload}.${trailingBitsSig}`,
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  { name: "malformed_parts", token: "v1.abc", now: issuedAt, device_id_hash: device, expected: "malformed" },
  {
    name: "malformed_version",
    token: valid.replace(/^v1\./, "v2."),
    now: issuedAt,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "malformed_json",
    token: `v1.${b64url("not json")}.${validSig}`,
    now: issuedAt,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "missing_field",
    token: await sign(k1, missingField),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
];

// Ký tự kiểm tra Luhn mod 32, viết lại độc lập với src/license-key.ts.
const KEY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function luhn32(body) {
  let sum = 0;
  [...body].reverse().forEach((ch, i) => {
    const p = KEY_ALPHABET.indexOf(ch) * (i % 2 === 0 ? 2 : 1);
    sum += Math.floor(p / 32) + (p % 32);
  });
  return KEY_ALPHABET[(32 - (sum % 32)) % 32];
}
const body = "0123456789ABCDEFGHJKMNPQRST";
const key = body + luhn32(body);
const group = (k) => k.match(/.{1,4}/g).join("-");
const zBody = `${"1".repeat(25)}0Z`;
const zKey = zBody + luhn32(zBody);
const licenseKeys = [
  { input: group(key), normalized: key },
  { input: ` ${group(key).toLowerCase().replace(/-/g, " ").replace("0", "o")} `, normalized: key },
  { input: group(key.slice(0, 27) + (key[27] === "0" ? "1" : "0")), normalized: null },
  { input: group(key.slice(0, 26) + key[27] + key[26]), normalized: null },
  { input: group(key.slice(0, 27)), normalized: null },
  { input: group(key.slice(0, 26) + "U" + key[27]), normalized: null },
  // Giới hạn đã biết của Luhn mod 32: đảo 0↔Z kề nhau vẫn qua.
  { input: group(`${"1".repeat(25)}Z0${zKey[27]}`), normalized: `${"1".repeat(25)}Z0${zKey[27]}` },
];

const out = {
  format:
    "v1.<base64url(JSON claims)>.<base64url(Ed25519 signature over ASCII 'v1.' + payload segment)>; base64url không padding",
  checks_order: ["malformed", "unknown_kid", "bad_signature", "wrong_device", "license_expired", "refresh_expired"],
  note: "Khóa test-* chỉ dùng cho test. Hết hạn khi now >= expires_at hoặc now >= refresh_before (giây Unix).",
  test_keys: [k1, k2].map(({ kid, seed_b64url, public_b64url }) => ({ kid, seed_b64url, public_b64url })),
  public_keys: { "test-1": k1.public_b64url, "test-2": k2.public_b64url },
  tokens,
  license_key_check:
    "Luhn mod 32 trên ALPHABET = 0123456789ABCDEFGHJKMNPQRSTVWXYZ: từ phải sang trái, nhân 2 các ký tự ở vị trí 1, 3, 5… của 27 ký tự đầu, cộng floor(p/32) + p%32 của mỗi tích, ký tự kiểm tra = ALPHABET[(32 - tổng % 32) % 32]",
  license_keys: licenseKeys,
};
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
```

- [ ] **Step 2: Sinh vector, kiểm rằng chạy lại cho ra đúng file đó**

```bash
cd server && mkdir -p test/vectors && node scripts/gen-token-vectors.mjs > test/vectors/token-v1.json && node scripts/gen-token-vectors.mjs | cmp - test/vectors/token-v1.json && shasum -a 256 test/vectors/token-v1.json
```

Expected (lúc lập kế hoạch):
```
0c73f33920de0d7d3fb694a6dce7a03f3475cfe72182ec4644282c80296bee3a  test/vectors/token-v1.json
```
`cmp` không in gì. Nếu SHA-256 khác giá trị trên thì script đã bị gõ sai: so lại với Step 1. Vector gồm 15 token (có `kid_signed_by_other_key`, `signature_with_padding`, `signature_trailing_bits`) và 7 key mẫu (có key đảo 0↔Z vẫn qua).

- [ ] **Step 3: Tạo `server/test/keys.ts`: dựng JWK của khóa test từ seed trong vector**

`server/test/keys.ts`:

```ts
import { b64urlDecode } from "../src/crypto";
import vectors from "./vectors/token-v1.json";

/** JWK khóa riêng của khóa test trong vector (PKCS#8 cố định cho Ed25519 + 32 byte seed). Chỉ dùng trong test. */
export async function testSigningJwk(kid: string): Promise<string> {
  const k = vectors.test_keys.find((t) => t.kid === kid);
  if (!k) throw new Error(`không có khóa test ${kid}`);
  const prefix = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
  const pkcs8 = Uint8Array.from([...prefix, ...b64urlDecode(k.seed_b64url)]);
  const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  const jwk = (await crypto.subtle.exportKey("jwk", key)) as JsonWebKey;
  if (jwk.x !== k.public_b64url) throw new Error("khóa công khai không khớp vector");
  return JSON.stringify({ kty: "OKP", crv: "Ed25519", kid, d: jwk.d, x: jwk.x });
}
```

- [ ] **Step 4: Viết test `server/test/token.test.ts`**

`server/test/token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { b64urlEncode } from "../src/crypto";
import { normalizeLicenseKey } from "../src/license-key";
import { importSigningKey, signToken, type TokenClaims, verifyToken } from "../src/token";
import { testSigningJwk } from "./keys";
import vectors from "./vectors/token-v1.json";

describe("token Ed25519 theo vector dùng chung (Đ9)", () => {
  for (const v of vectors.tokens) {
    it(`kiểm vector ${v.name} ra ${v.expected}`, async () => {
      const result = await verifyToken(v.token, vectors.public_keys, { now: v.now, deviceIdHash: v.device_id_hash });
      if (v.expected === "ok") {
        expect(result).toEqual({ ok: true, claims: v.claims });
      } else {
        expect(result).toEqual({ ok: false, error: v.expected });
      }
    });
  }

  it("signToken sinh lại đúng từng token hợp lệ của vector", async () => {
    for (const v of vectors.tokens.filter((t) => t.expected === "ok")) {
      const claims = v.claims as TokenClaims;
      const key = await importSigningKey(await testSigningJwk(claims.kid));
      expect(key.kid).toBe(claims.kid);
      expect(await signToken(key, claims)).toBe(v.token);
    }
  });

  it("importSigningKey từ chối JWK thiếu kid hoặc sai loại khóa", async () => {
    const jwk = JSON.parse(await testSigningJwk("test-1")) as Record<string, string>;
    await expect(importSigningKey(JSON.stringify({ ...jwk, kid: undefined }))).rejects.toThrow(/kid/);
    await expect(importSigningKey(JSON.stringify({ ...jwk, kid: "Có dấu" }))).rejects.toThrow(/kid/);
    await expect(importSigningKey(JSON.stringify({ ...jwk, crv: "X25519" }))).rejects.toThrow(/Ed25519/);
    await expect(importSigningKey("không phải json")).rejects.toThrow(/JSON/);
  });

  it("chữ ký sai độ dài là malformed", async () => {
    const valid = vectors.tokens[0]!.token;
    const [v, payload] = valid.split(".");
    const short = `${v}.${payload}.${b64urlEncode(new Uint8Array(10))}`;
    expect(await verifyToken(short, vectors.public_keys, { now: 0, deviceIdHash: "" })).toEqual({
      ok: false,
      error: "malformed",
    });
  });

  it("kid trùng tên thuộc tính có sẵn của Object vẫn là kid lạ", async () => {
    const v = vectors.tokens[0]!;
    const key = await importSigningKey(await testSigningJwk("test-1"));
    const token = await signToken(key, { ...(v.claims as TokenClaims), kid: "constructor" });
    expect(await verifyToken(token, vectors.public_keys, { now: v.now, deviceIdHash: v.device_id_hash })).toEqual({
      ok: false,
      error: "unknown_kid",
    });
  });
});

describe("license key theo vector dùng chung", () => {
  for (const v of vectors.license_keys) {
    it(`chuẩn hóa ${JSON.stringify(v.input)}`, async () => {
      expect(await normalizeLicenseKey(v.input)).toBe(v.normalized);
    });
  }
});
```

- [ ] **Step 5: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/token.test.ts
```

Expected: FAIL:
```
Error: Cannot find module '../src/token' imported from <repo>/server/test/token.test.ts
```

- [ ] **Step 6: Tạo `server/src/token.ts`**

`server/src/token.ts`:

```ts
// Token bản quyền ký Ed25519 (spec §6.8, §10.2). Định dạng v1, dùng chung với app (kế hoạch 06, Đ9):
//   v1.<base64url(JSON claims)>.<base64url(chữ ký Ed25519 trên chuỗi ASCII "v1.<payload>")>
// Chữ ký phủ đúng chuỗi payload đã mã hóa, nên bên kiểm không cần dựng lại JSON.
// Vector mẫu: test/vectors/token-v1.json (sinh bằng scripts/gen-token-vectors.mjs).
import { b64urlDecode, b64urlEncode } from "./crypto";

export const TOKEN_VERSION = "v1";
export const REFRESH_WINDOW_SECONDS = 14 * 86400;
const KID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

export interface TokenClaims {
  kid: string;
  license_id: string;
  plan: string;
  expires_at: number;
  activation_id: string;
  device_id_hash: string;
  issued_at: number;
  refresh_before: number;
}

export interface SigningKey {
  kid: string;
  key: CryptoKey;
}

export type VerifyError =
  | "malformed"
  | "unknown_kid"
  | "bad_signature"
  | "wrong_device"
  | "license_expired"
  | "refresh_expired";

export type VerifyResult = { ok: true; claims: TokenClaims } | { ok: false; error: VerifyError };

/** Đọc secret TOKEN_SIGNING_JWK: JWK Ed25519 có `d`, `x` và `kid`. */
export async function importSigningKey(jwkJson: string): Promise<SigningKey> {
  let jwk: Record<string, unknown>;
  try {
    jwk = JSON.parse(jwkJson) as Record<string, unknown>;
  } catch {
    throw new Error("TOKEN_SIGNING_JWK không phải JSON");
  }
  const { kty, crv, d, x, kid } = jwk;
  if (kty !== "OKP" || crv !== "Ed25519" || typeof d !== "string" || typeof x !== "string") {
    throw new Error("TOKEN_SIGNING_JWK không phải khóa riêng Ed25519");
  }
  if (typeof kid !== "string" || !KID_PATTERN.test(kid)) throw new Error("TOKEN_SIGNING_JWK thiếu kid hợp lệ");
  const key = await crypto.subtle.importKey("jwk", { kty, crv, d, x }, { name: "Ed25519" }, false, ["sign"]);
  return { kid, key };
}

export async function signToken(signingKey: SigningKey, claims: TokenClaims): Promise<string> {
  // Thứ tự trường cố định để token sinh lại được y hệt vector.
  const ordered: TokenClaims = {
    kid: claims.kid,
    license_id: claims.license_id,
    plan: claims.plan,
    expires_at: claims.expires_at,
    activation_id: claims.activation_id,
    device_id_hash: claims.device_id_hash,
    issued_at: claims.issued_at,
    refresh_before: claims.refresh_before,
  };
  const signingInput = `${TOKEN_VERSION}.${b64urlEncode(encoder.encode(JSON.stringify(ordered)))}`;
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, signingKey.key, encoder.encode(signingInput));
  return `${signingInput}.${b64urlEncode(new Uint8Array(signature))}`;
}

function parseClaims(json: unknown): TokenClaims | null {
  if (typeof json !== "object" || json === null) return null;
  const c = json as Record<string, unknown>;
  const strings = ["kid", "license_id", "plan", "activation_id", "device_id_hash"] as const;
  const integers = ["expires_at", "issued_at", "refresh_before"] as const;
  for (const k of strings) if (typeof c[k] !== "string") return null;
  for (const k of integers) if (!Number.isSafeInteger(c[k])) return null;
  return c as unknown as TokenClaims;
}

/**
 * Kiểm token như app sẽ kiểm (kế hoạch 06), theo thứ tự: định dạng, kid, chữ ký, máy,
 * `expires_at`, rồi `refresh_before`. Hết hạn khi `now >= expires_at` hoặc `now >= refresh_before`.
 * `publicKeys` ánh xạ kid sang khóa công khai (32 byte, base64url).
 */
export async function verifyToken(
  token: string,
  publicKeys: Record<string, string>,
  opts: { now: number; deviceIdHash: string },
): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return { ok: false, error: "malformed" };
  const [, payload = "", sig = ""] = parts;
  let claims: TokenClaims | null;
  let signature: Uint8Array;
  try {
    claims = parseClaims(JSON.parse(decoder.decode(b64urlDecode(payload))));
    signature = b64urlDecode(sig);
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (!claims || signature.byteLength !== 64) return { ok: false, error: "malformed" };
  const publicKey = Object.hasOwn(publicKeys, claims.kid) ? publicKeys[claims.kid] : undefined;
  if (publicKey === undefined) return { ok: false, error: "unknown_kid" };
  const key = await crypto.subtle.importKey("raw", b64urlDecode(publicKey), { name: "Ed25519" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    signature,
    encoder.encode(`${TOKEN_VERSION}.${payload}`),
  );
  if (!valid) return { ok: false, error: "bad_signature" };
  if (claims.device_id_hash !== opts.deviceIdHash) return { ok: false, error: "wrong_device" };
  if (opts.now >= claims.expires_at) return { ok: false, error: "license_expired" };
  if (opts.now >= claims.refresh_before) return { ok: false, error: "refresh_expired" };
  return { ok: true, claims };
}
```

- [ ] **Step 7: Chạy test và typecheck**

```bash
cd server && pnpm exec vitest run test/token.test.ts && pnpm typecheck
```

Expected:
```
Test Files  1 passed (1)
Tests  26 passed (26)
```
Gồm 15 vector token, 7 vector license key và 4 test riêng. `tsc` không in lỗi.

- [ ] **Step 8: Commit**

```bash
git add server/scripts/gen-token-vectors.mjs server/test/vectors/token-v1.json server/test/keys.ts server/test/token.test.ts server/src/token.ts
git commit -m "feat(server): token bản quyền Ed25519 có kid và bộ vector dùng chung với app (Đ9)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 7: Script tạo khóa ký, kiểm khóa công khai, kiểm token (Q11, QĐ29, QĐ31)

Ba script chạy bằng Node trên máy người vận hành, không chạy trong Worker. Kiểm bằng lệnh shell, dùng khóa test của vector.

**Files:**
- Create: `server/scripts/gen-token-key.mjs`, `server/scripts/jwk-public.mjs`, `server/scripts/verify-token.mjs`, `server/test/fixtures/public-keys.test.json`, `server/test/fixtures/test-jwk.mjs`

- [ ] **Step 1: Tạo `server/scripts/gen-token-key.mjs`**

`server/scripts/gen-token-key.mjs`:

```js
#!/usr/bin/env node
// Tạo cặp khóa Ed25519 ký token bản quyền (spec §10.2, Q11). Không ghi file nào ra đĩa, không in khóa riêng ra terminal.
// - Khóa riêng ra stdout, và stdout phải là pipe (hoặc socket): terminal và file đều bị từ chối.
//   * Khóa đang dùng: pipe thẳng vào `wrangler secret put`.
//   * Khóa dự phòng: --vault op|bw in JSON cho CLI của kho mật khẩu (1Password `op`, Bitwarden `bw`);
//     không có hai CLI này thì pipe vào `pbcopy`, dán vào kho mật khẩu, rồi xóa clipboard.
// - Khóa công khai ra stderr, để ghi vào server/keys/public-keys.json (không phải bí mật).
// - kid phải là duy nhất: script từ chối kid đã có trong public-keys.json (--keys để chỉ file khác).
//   Quy ước: <env>-<năm>-<tháng>-<số thứ tự>, khóa dự phòng thêm "-b". Ví dụ stg-2026-10-1, stg-2026-10-1-b.
//
//   node scripts/gen-token-key.mjs stg-2026-10-1 | pnpm exec wrangler secret put TOKEN_SIGNING_JWK --env staging
//   node scripts/gen-token-key.mjs stg-2026-10-1-b --vault op | op item create --vault Private -
//   node scripts/gen-token-key.mjs stg-2026-10-1-b --vault bw | bw encode | bw create item
import { existsSync, fstatSync, readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const [kid, ...rest] = process.argv.slice(2);
let vault;
let keysFile = new URL("../keys/public-keys.json", import.meta.url);
for (let i = 0; i < rest.length; i += 2) {
  if (rest[i] === "--vault" && (rest[i + 1] === "op" || rest[i + 1] === "bw")) vault = rest[i + 1];
  else if (rest[i] === "--keys" && rest[i + 1]) keysFile = rest[i + 1];
  else fail("Tham số sau kid chỉ có thể là --vault op|bw và --keys <file>.");
}
if (!kid || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(kid) || kid.startsWith("test-")) {
  fail("Cần kid gồm chữ thường, số và '-', tối đa 32 ký tự, không bắt đầu bằng 'test-'. Ví dụ: stg-2026-10-1");
}
const out = fstatSync(1);
if (!out.isFIFO() && !out.isSocket()) {
  fail("stdout phải là pipe (không phải terminal, không phải file): pipe sang wrangler, op, bw hoặc pbcopy.");
}
if (existsSync(keysFile)) {
  for (const [envName, roles] of Object.entries(JSON.parse(readFileSync(keysFile, "utf8")))) {
    for (const [role, k] of Object.entries(roles ?? {})) {
      if (k?.kid === kid) fail(`kid ${kid} đã có trong public-keys.json (${envName}.${role}). Dùng số thứ tự mới.`);
    }
  }
}
const { privateKey } = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const jwk = await webcrypto.subtle.exportKey("jwk", privateKey);
const secret = JSON.stringify({ kty: "OKP", crv: "Ed25519", kid, d: jwk.d, x: jwk.x });
// Tên chỉ có chữ ASCII và dấu cách, để dùng được trong tham chiếu op://vault/item/field của 1Password.
const title = `Meeting Translator token key ${kid}`;
const note = "Khóa riêng Ed25519 dạng JWK, dán nguyên dòng vào `wrangler secret put TOKEN_SIGNING_JWK` khi đổi khóa (Phụ lục A).";
let text = secret;
if (vault === "op") {
  // Mẫu item của 1Password đọc qua stdin (`op item create -`): khóa không đi qua tham số dòng lệnh.
  text = JSON.stringify({
    title,
    category: "PASSWORD",
    fields: [
      { id: "password", type: "CONCEALED", purpose: "PASSWORD", label: "password", value: secret },
      { id: "notesPlain", type: "STRING", purpose: "NOTES", label: "notesPlain", value: note },
    ],
  });
} else if (vault === "bw") {
  // Secure Note của Bitwarden; `bw encode | bw create item` đọc từ stdin.
  text = JSON.stringify({ type: 2, name: title, notes: `${secret}\n\n${note}`, secureNote: { type: 0 }, favorite: false, reprompt: 1 });
}
process.stdout.write(text);
console.error(`Khóa công khai (ghi vào server/keys/public-keys.json): ${JSON.stringify({ kid, x: jwk.x })}`);
```

- [ ] **Step 2: Kiểm khóa riêng đi qua pipe mà không hiện ra màn hình**

```bash
cd server && node scripts/gen-token-key.mjs plan-check 2>/dev/null | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const j=JSON.parse(s);console.log(j.kty,j.crv,j.kid,j.d.length,j.x.length)})'
```

Expected:
```
OKP Ed25519 plan-check 43 43
```

- [ ] **Step 3: Kiểm dòng khóa công khai in ra stderr**

stdout vẫn phải là pipe, nên khóa riêng đi vào `cat >/dev/null`; stderr (khóa công khai) đi ra ngoài. Không viết `2>&1 >/dev/null`: zsh bật `MULTIOS` theo mặc định, nên với cách viết đó stdout (khóa riêng) vẫn lọt vào pipe.

```bash
cd server && { node scripts/gen-token-key.mjs plan-check | cat >/dev/null; } 2>&1 | sed -E 's/"x":"[A-Za-z0-9_-]{43}"/"x":"<43 ký tự>"/'
```

Expected:
```
Khóa công khai (ghi vào server/keys/public-keys.json): {"kid":"plan-check","x":"<43 ký tự>"}
```

- [ ] **Step 4: Kiểm JSON cho kho mật khẩu: khóa nằm trong trường ẩn, không đi qua tham số dòng lệnh**

```bash
cd server && node scripts/gen-token-key.mjs plan-check-b --vault op 2>/dev/null | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const j=JSON.parse(s);console.log(j.title,"|",j.category,"|",j.fields.map((f)=>f.id+":"+f.type).join(" "),"|",JSON.parse(j.fields[0].value).kid)})'
node scripts/gen-token-key.mjs plan-check-b --vault bw 2>/dev/null | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const j=JSON.parse(s);console.log(j.type,j.secureNote.type,j.reprompt,"|",j.name,"|",JSON.parse(j.notes.split("\n")[0]).kid)})'
```

Expected:
```
Meeting Translator token key plan-check-b | PASSWORD | password:CONCEALED notesPlain:STRING | plan-check-b
```
```
2 0 1 | Meeting Translator token key plan-check-b | plan-check-b
```
- Dòng đầu: item `PASSWORD` của 1Password, khóa nằm ở trường `password` kiểu `CONCEALED`.
- Dòng sau: Secure Note (`type` 2) của Bitwarden, `reprompt` 1 (hỏi lại master password khi mở).
- Lệnh tạo item thật (`op item create`, `bw create item`) cần tài khoản, nên là bước của người ở Task 19.

- [ ] **Step 5: Kiểm script từ chối tham số sai, terminal, file, và `kid` trùng**

```bash
cd server && node scripts/gen-token-key.mjs test-1 >/dev/null; echo "exit=$?"; node scripts/gen-token-key.mjs plan-check --print-private >/dev/null; echo "exit=$?"
script -q /dev/null node scripts/gen-token-key.mjs plan-check < /dev/null; echo "exit=$?"
F=$(mktemp) && node scripts/gen-token-key.mjs plan-check > "$F"; echo "exit=$?"; wc -c < "$F" | tr -d ' '; rm -f "$F"
K=$(mktemp) && printf '{"staging":{"active":{"kid":"stg-2026-10-1","x":"x"}}}' > "$K" && node scripts/gen-token-key.mjs stg-2026-10-1 --keys "$K" | wc -c | tr -d ' '; node scripts/gen-token-key.mjs stg-2026-10-2 --keys "$K" 2>/dev/null | wc -c | tr -d ' '; rm -f "$K"
```

`script` (có sẵn trên macOS) tạo một terminal giả, nên stdout của script là terminal.

Expected:
```
Cần kid gồm chữ thường, số và '-', tối đa 32 ký tự, không bắt đầu bằng 'test-'. Ví dụ: stg-2026-10-1
exit=2
Tham số sau kid chỉ có thể là --vault op|bw và --keys <file>.
exit=2
```
```
^Dstdout phải là pipe (không phải terminal, không phải file): pipe sang wrangler, op, bw hoặc pbcopy.
exit=2
```
Chữ `^D` ở đầu dòng do `script` in khi stdin đóng.
```
stdout phải là pipe (không phải terminal, không phải file): pipe sang wrangler, op, bw hoặc pbcopy.
exit=2
0
```
Chuyển hướng ra file: thoát mã 2 và file rỗng (0 byte).
```
kid stg-2026-10-1 đã có trong public-keys.json (staging.active). Dùng số thứ tự mới.
0
151
```
`stg-2026-10-1` đã có trong file khóa công khai nên bị từ chối (0 byte ra pipe); `stg-2026-10-2` là `kid` mới nên được tạo (151 byte JWK).

- [ ] **Step 6: Tạo `server/scripts/jwk-public.mjs` và `server/scripts/verify-token.mjs`**

`server/scripts/jwk-public.mjs`:

```js
#!/usr/bin/env node
// Đọc JWK khóa riêng Ed25519 từ stdin, tính lại khóa công khai từ `d`, kiểm khớp với `x` trong JWK,
// rồi in {"kid","x"}. Với --check <env> <active|backup>, so thêm với server/keys/public-keys.json.
// Dùng để kiểm khóa dự phòng trong kho mật khẩu mà không hiện khóa riêng:
//   read -rs JWK && printf '%s' "$JWK" | node scripts/jwk-public.mjs --check staging backup; unset JWK
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const args = process.argv.slice(2);
const keysAt = args.indexOf("--keys");
const keysFile = keysAt >= 0 ? args[keysAt + 1] : new URL("../keys/public-keys.json", import.meta.url);
const checkAt = args.indexOf("--check");
const [envName, role] = checkAt >= 0 ? args.slice(checkAt + 1, checkAt + 3) : [];

let input = "";
for await (const chunk of process.stdin) input += chunk;
let jwk;
try {
  jwk = JSON.parse(input);
} catch {
  console.error("stdin không phải JSON");
  process.exit(1);
}
if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.d !== "string" || typeof jwk.x !== "string") {
  console.error("không phải JWK khóa riêng Ed25519");
  process.exit(1);
}
const seed = Buffer.from(jwk.d, "base64url");
const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
const key = await webcrypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
const { x } = await webcrypto.subtle.exportKey("jwk", key);
if (seed.length !== 32 || x !== jwk.x) {
  console.error("KHÔNG khớp: x trong JWK không phải khóa công khai của d");
  process.exit(1);
}
console.log(JSON.stringify({ kid: jwk.kid, x }));
if (envName) {
  const expected = JSON.parse(readFileSync(keysFile, "utf8"))[envName]?.[role];
  if (!expected || expected.kid !== jwk.kid || expected.x !== x) {
    console.error(`KHÔNG khớp với ${envName}.${role} trong public-keys.json`);
    process.exit(1);
  }
  console.log(`khớp: ${envName}.${role} = ${expected.kid}`);
}
```

`server/scripts/verify-token.mjs`:

```js
#!/usr/bin/env node
// Kiểm chữ ký một token v1 bằng khóa công khai của môi trường trong server/keys/public-keys.json
// (active hoặc backup), như app sẽ kiểm (kế hoạch 06). Đọc token từ stdin, viết độc lập với src/token.ts.
//   printf '%s' "$TOKEN" | node scripts/verify-token.mjs staging
// In "OK <env> <role> <kid>" và claims; sai thì in "FAIL <lý do>" và thoát mã 1.
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const args = process.argv.slice(2);
const envName = args[0];
const keysAt = args.indexOf("--keys");
const keysFile = keysAt >= 0 ? args[keysAt + 1] : new URL("../keys/public-keys.json", import.meta.url);
const failWith = (why) => {
  console.log(`FAIL ${why}`);
  process.exit(1);
};
// base64url dạng chuẩn: không padding, bit thừa bằng 0 (giống crate base64 URL_SAFE_NO_PAD của app).
const strict = (s) => {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const b = Buffer.from(s, "base64url");
  return b.toString("base64url") === s ? b : null;
};

let token = "";
for await (const chunk of process.stdin) token += chunk;
token = token.trim();
const keys = JSON.parse(readFileSync(keysFile, "utf8"))[envName];
if (!keys) failWith(`không có môi trường ${envName} trong public-keys.json`);
const parts = token.split(".");
if (parts.length !== 3 || parts[0] !== "v1") failWith("malformed");
const payload = strict(parts[1]);
const sig = strict(parts[2]);
if (!payload || !sig || sig.length !== 64) failWith("malformed");
let claims;
try {
  claims = JSON.parse(payload.toString("utf8"));
} catch {
  failWith("malformed");
}
if (typeof claims !== "object" || claims === null || Array.isArray(claims) || typeof claims.kid !== "string") {
  failWith("malformed");
}
const found = Object.entries(keys).find(([, k]) => k.kid === claims.kid);
if (!found) failWith(`unknown_kid ${claims.kid}`);
const [role, k] = found;
const pub = await webcrypto.subtle.importKey("raw", Buffer.from(k.x, "base64url"), { name: "Ed25519" }, false, ["verify"]);
const ok = await webcrypto.subtle.verify({ name: "Ed25519" }, pub, sig, Buffer.from(`v1.${parts[1]}`));
if (!ok) failWith("bad_signature");
console.log(`OK ${envName} ${role} ${k.kid}`);
console.log(JSON.stringify(claims));
```

- [ ] **Step 7: Tạo fixture cho hai script: khóa công khai test và JWK của khóa test**

`public-keys.test.json` có cùng dạng với `server/keys/public-keys.json` (Task 19), với hai khóa test của vector.

`server/test/fixtures/public-keys.test.json`:

```json
{
  "_note": "Chỉ dùng để thử scripts/verify-token.mjs và scripts/jwk-public.mjs với khóa test của vector.",
  "test": {
    "active": {
      "kid": "test-1",
      "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"
    },
    "backup": {
      "kid": "test-2",
      "x": "q5ZECmVfbTxWLsBMSfgVBX-QhE6PToK-1TGzmPChkSg"
    }
  }
}
```

`server/test/fixtures/test-jwk.mjs`:

```js
#!/usr/bin/env node
// In JWK khóa riêng của một khóa test trong vector (test-1, test-2). CHỈ dùng để thử scripts/jwk-public.mjs.
import { fstatSync, readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

// Như gen-token-key.mjs: chỉ ghi khóa riêng vào pipe, không ra terminal hay file.
if (!fstatSync(1).isFIFO() && !fstatSync(1).isSocket()) process.exit(2);
const vectors = JSON.parse(readFileSync(new URL("../vectors/token-v1.json", import.meta.url), "utf8"));
const k = vectors.test_keys.find((t) => t.kid === process.argv[2]);
if (!k) process.exit(2);
const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(k.seed_b64url, "base64url")]);
const key = await webcrypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
const jwk = await webcrypto.subtle.exportKey("jwk", key);
process.stdout.write(JSON.stringify({ kty: "OKP", crv: "Ed25519", kid: k.kid, d: jwk.d, x: jwk.x }));
```

- [ ] **Step 8: Kiểm `jwk-public.mjs`**

```bash
cd server && { node scripts/gen-token-key.mjs plan-check | node scripts/jwk-public.mjs; } 2>&1 | grep -o '"x":"[A-Za-z0-9_-]*"' | sort -u | wc -l | tr -d ' '
node test/fixtures/test-jwk.mjs test-2 | node scripts/jwk-public.mjs --check test backup --keys test/fixtures/public-keys.test.json; echo "exit=$?"; node test/fixtures/test-jwk.mjs test-1 | node scripts/jwk-public.mjs --check test backup --keys test/fixtures/public-keys.test.json; echo "exit=$?"
```

Expected:
```
1
```
```
{"kid":"test-2","x":"q5ZECmVfbTxWLsBMSfgVBX-QhE6PToK-1TGzmPChkSg"}
khớp: test.backup = test-2
exit=0
{"kid":"test-1","x":"7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}
KHÔNG khớp với test.backup trong public-keys.json
exit=1
```
- Lệnh đầu in `1`: khóa công khai `jwk-public.mjs` tính lại từ `d` trùng với khóa công khai `gen-token-key.mjs` in ra stderr.
- Khóa `test-2` khớp mục `backup`; khóa `test-1` không khớp và thoát mã 1.

- [ ] **Step 9: Kiểm `verify-token.mjs` bằng các token của vector**

```bash
cd server && for n in valid valid_backup_key bad_signature kid_signed_by_other_key signature_trailing_bits unknown_kid; do node -e 'process.stdout.write(require("./test/vectors/token-v1.json").tokens.find((t)=>t.name===process.argv[1]).token)' $n | node scripts/verify-token.mjs test --keys test/fixtures/public-keys.test.json | head -1; done
```

Expected (mỗi dòng ứng với một vector, đúng thứ tự trong lệnh):
```
OK test active test-1
OK test backup test-2
FAIL bad_signature
FAIL bad_signature
FAIL malformed
FAIL unknown_kid test-9
```

Payload không phải object (`null`, số, mảng) hay thiếu `kid` thì in `FAIL malformed`, không ném `TypeError`:

```bash
cd server && for p in null 42 '[]' '{}'; do node -e 'const [h, , s] = require("./test/vectors/token-v1.json").tokens[0].token.split(".");process.stdout.write(h + "." + Buffer.from(process.argv[1]).toString("base64url") + "." + s)' "$p" | node scripts/verify-token.mjs test --keys test/fixtures/public-keys.test.json; echo "exit=$?"; done
```

Expected:
```
FAIL malformed
exit=1
FAIL malformed
exit=1
FAIL malformed
exit=1
FAIL malformed
exit=1
```

- [ ] **Step 10: Commit**

```bash
git add server/scripts/gen-token-key.mjs server/scripts/jwk-public.mjs server/scripts/verify-token.mjs server/test/fixtures/public-keys.test.json server/test/fixtures/test-jwk.mjs
git commit -m "feat(server): script tạo khóa ký không in khóa riêng, kiểm khóa công khai và kiểm token (Q11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 8: `PaymentProvider` và cài đặt PayOS

**Files:**
- Create: `server/test/payos.test.ts`, `server/src/payment/provider.ts`, `server/src/payment/payos.ts`

- [ ] **Step 1: Viết test `server/test/payos.test.ts`**

Test dùng dữ liệu mẫu và checksum key mẫu của tài liệu PayOS. Chữ ký khi tạo link được tính độc lập bằng `node:crypto`, để đối chiếu với code.

`server/test/payos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hmacSha256Hex } from "../src/crypto";
import { objectSignatureData, PayOSProvider } from "../src/payment/payos";
import { PaymentProviderError } from "../src/payment/provider";

// Dữ liệu mẫu và checksum key mẫu trong tài liệu PayOS
// (https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/).
const DOC_CHECKSUM_KEY = "1a54716c8f0efb2744fb28b6e38b25da7f67a925d98bc1c18bd8faaecadd7675";
const DOC_WEBHOOK = {
  code: "00",
  desc: "success",
  success: true,
  data: {
    orderCode: 123,
    amount: 3000,
    description: "VQRIO123",
    accountNumber: "12345678",
    reference: "TF230204212323",
    transactionDateTime: "2023-02-04 18:25:00",
    currency: "VND",
    paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
    code: "00",
    desc: "Thành công",
    counterAccountBankId: "",
    counterAccountBankName: "",
    counterAccountName: "",
    counterAccountNumber: "",
    virtualAccountName: "",
    virtualAccountNumber: "",
  },
  signature: "412e915d2871504ed31be63c8f62a149a4410d34c4c42affc9006ef9917eaa03",
};

async function signed(data: Record<string, unknown>) {
  return { code: "00", desc: "success", data, signature: await hmacSha256Hex(DOC_CHECKSUM_KEY, objectSignatureData(data)) };
}

function provider(fetchFn: (url: string, init?: RequestInit) => Promise<Response>) {
  return new PayOSProvider(
    { baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: DOC_CHECKSUM_KEY },
    fetchFn,
  );
}

describe("PayOS: chữ ký webhook", () => {
  it("nhận webhook mẫu của tài liệu PayOS", async () => {
    expect(await provider(fetch).verifyWebhook(DOC_WEBHOOK)).toEqual({ orderCode: 123 });
  });

  it("từ chối webhook bị sửa số tiền", async () => {
    const body = { ...DOC_WEBHOOK, data: { ...DOC_WEBHOOK.data, amount: 3_000_000 } };
    expect(await provider(fetch).verifyWebhook(body)).toBeNull();
  });

  it("chữ ký ở mục schema của tài liệu (8d8640…) không khớp dữ liệu mẫu", async () => {
    const body = { ...DOC_WEBHOOK, signature: "8d8640d802576397a1ce45ebda7f835055768ac7ad2e0bfb77f9b8f12cca4c7f" };
    expect(await provider(fetch).verifyWebhook(body)).toBeNull();
  });

  it("từ chối body sai định dạng", async () => {
    const p = provider(fetch);
    expect(await p.verifyWebhook(null)).toBeNull();
    expect(await p.verifyWebhook("x")).toBeNull();
    expect(await p.verifyWebhook({ data: [], signature: "a" })).toBeNull();
    expect(await p.verifyWebhook({ data: DOC_WEBHOOK.data })).toBeNull();
  });

  it("chuỗi ký: xếp key, null thành rỗng, mảng thành JSON có key đã xếp", () => {
    expect(objectSignatureData({ b: 1, a: null, c: [{ y: 2, x: null }], d: undefined, e: "null" })).toBe(
      'a=&b=1&c=[{"x":null,"y":2}]&e=',
    );
  });
});

describe("PayOS: tạo link thanh toán", () => {
  const req = {
    orderCode: 42,
    amount: 2000,
    currency: "VND",
    description: "MT42",
    returnUrl: "https://example.com/v1/pay/return",
    cancelUrl: "https://example.com/v1/pay/cancel",
    expiresAt: 1_790_000_900,
  };
  const linkData = {
    bin: "970422",
    accountNumber: "113366668888",
    accountName: "TEST",
    amount: 2000,
    description: "MT42",
    orderCode: 42,
    currency: "VND",
    paymentLinkId: "plink42",
    status: "PENDING",
    checkoutUrl: "https://pay.payos.vn/web/plink42",
    qrCode: "000201010212...6304ABCD",
  };

  it("gửi đúng header, body và chữ ký; đọc checkoutUrl, qrCode", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const response = await signed(linkData);
    const p = provider(async (url, init = {}) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(response));
    });
    expect(await p.createCheckout(req)).toEqual({
      providerRef: "plink42",
      checkoutUrl: "https://pay.payos.vn/web/plink42",
      qrCode: "000201010212...6304ABCD",
    });
    const call = calls[0]!;
    expect(call.url).toBe("https://payos.test/v2/payment-requests");
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["x-client-id"]).toBe("cid");
    expect(headers["x-api-key"]).toBe("akey");
    expect(headers["user-agent"]).toBe("license-server/1.0");
    expect(JSON.parse(call.init.body as string)).toEqual({
      amount: 2000,
      cancelUrl: req.cancelUrl,
      description: "MT42",
      orderCode: 42,
      returnUrl: req.returnUrl,
      expiredAt: 1_790_000_900,
      // Tính độc lập bằng node:crypto trên chuỗi amount=…&cancelUrl=…&description=…&orderCode=…&returnUrl=…
      signature: "5e7345a044930f03df4f633f53703369e68e5b0747705bdbd97d456ec6bed90c",
    });
  });

  it("response sai chữ ký thì báo lỗi", async () => {
    const response = { ...(await signed(linkData)), signature: "0".repeat(64) };
    const p = provider(async () => new Response(JSON.stringify(response)));
    await expect(p.createCheckout(req)).rejects.toThrow(/chữ ký response/);
  });

  it("PayOS trả mã lỗi thì ném PaymentProviderError kèm mã", async () => {
    const p = provider(async () => new Response(JSON.stringify({ code: "231", desc: "Đơn thanh toán đã tồn tại", data: null })));
    const err = await p.createCheckout(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect((err as PaymentProviderError).code).toBe("231");
  });

  it("không nhận tiền khác VND", async () => {
    await expect(provider(fetch).createCheckout({ ...req, currency: "USD" })).rejects.toThrow(/USD/);
  });
});

describe("PayOS: trạng thái đơn", () => {
  const info = (status: string, amountPaid: number, orderCode = 42) => ({
    id: "plink42",
    orderCode,
    amount: 2000,
    amountPaid,
    amountRemaining: 2000 - amountPaid,
    status,
    createdAt: "2026-10-01T00:00:00.000Z",
    transactions: [{ reference: "FT1", amount: amountPaid, counterAccountName: null, description: "MT42" }],
    cancellationReason: null,
    canceledAt: null,
  });

  it("gọi GET /v2/payment-requests/{orderCode} và đổi trạng thái", async () => {
    const response = await signed(info("PAID", 2000));
    const urls: string[] = [];
    const p = provider(async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(response));
    });
    expect(await p.getPaymentStatus(42)).toEqual({ orderCode: 42, status: "paid", amount: 2000, amountPaid: 2000 });
    expect(urls).toEqual(["https://payos.test/v2/payment-requests/42"]);
  });

  it("trạng thái lạ hoặc sai orderCode thì báo lỗi", async () => {
    const odd = await signed(info("WEIRD", 0));
    await expect(provider(async () => new Response(JSON.stringify(odd))).getPaymentStatus(42)).rejects.toThrow();
    const other = await signed(info("PAID", 2000, 43));
    await expect(provider(async () => new Response(JSON.stringify(other))).getPaymentStatus(42)).rejects.toThrow(
      /orderCode/,
    );
  });

  it("HTTP 401 thì báo lỗi", async () => {
    const p = provider(async () => new Response(JSON.stringify({ code: "401", desc: "Unauthorized" }), { status: 401 }));
    await expect(p.getPaymentStatus(42)).rejects.toThrow(/401/);
  });
});

describe("PayOS: confirm-webhook", () => {
  it("gửi webhookUrl", async () => {
    const bodies: unknown[] = [];
    const p = provider(async (url, init) => {
      bodies.push([url, JSON.parse(init?.body as string)]);
      return new Response(JSON.stringify({ code: "00", desc: "success", data: { webhookUrl: "https://w.test/hook" } }));
    });
    await p.confirmWebhook("https://w.test/hook");
    expect(bodies).toEqual([["https://payos.test/confirm-webhook", { webhookUrl: "https://w.test/hook" }]]);
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/payos.test.ts
```

Expected: FAIL:
```
Error: Cannot find module '../src/payment/payos' imported from <repo>/server/test/payos.test.ts
```

- [ ] **Step 3: Tạo `server/src/payment/provider.ts`**

`server/src/payment/provider.ts`:

```ts
// Interface cổng thanh toán (spec §6.8). Thêm cổng mới chỉ cần một cài đặt của interface này
// và một endpoint webhook; license, token và app không phải sửa.
// Tên hàm theo spec: create_checkout, verify_webhook, get_payment_status.

export type PaymentStatus = "pending" | "processing" | "paid" | "underpaid" | "cancelled" | "expired" | "failed";

export interface CheckoutRequest {
  orderCode: number;
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  /** Giây Unix; link thanh toán hết hạn lúc này. */
  expiresAt: number;
}

export interface CheckoutResult {
  providerRef: string;
  checkoutUrl: string;
  /** Chuỗi VietQR thô; app tự vẽ thành mã QR. */
  qrCode: string;
}

export interface PaymentStatusResult {
  orderCode: number;
  status: PaymentStatus;
  amount: number;
  amountPaid: number;
}

export interface WebhookEvent {
  orderCode: number;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Trả về null nếu body sai định dạng hoặc sai chữ ký. */
  verifyWebhook(body: unknown): Promise<WebhookEvent | null>;
  getPaymentStatus(orderCode: number): Promise<PaymentStatusResult>;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
```

- [ ] **Step 4: Tạo `server/src/payment/payos.ts`**

`server/src/payment/payos.ts`:

```ts
// Cài đặt PaymentProvider cho PayOS. Tài liệu đã đọc (2026-10-01):
// - API: https://payos.vn/docs/api/  (POST /v2/payment-requests, GET /v2/payment-requests/{id}, POST /confirm-webhook)
// - Chữ ký: https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/
// - Không có sandbox: https://payos.vn/docs/moi-truong-test/
// Cách ký theo SDK chính thức @payos/node 2.0.5 (createSignatureOfPaymentRequest, createSignatureFromObj).
import { hmacSha256Hex, timingSafeEqual } from "../crypto";
import {
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentProvider,
  PaymentProviderError,
  type PaymentStatus,
  type PaymentStatusResult,
  type WebhookEvent,
} from "./provider";

export interface PayOSConfig {
  baseUrl: string;
  clientId: string;
  apiKey: string;
  checksumKey: string;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const USER_AGENT = "license-server/1.0";
const TIMEOUT_MS = 10_000;
const STATUS_MAP: Record<string, PaymentStatus> = {
  PENDING: "pending",
  PROCESSING: "processing",
  PAID: "paid",
  UNDERPAID: "underpaid",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  FAILED: "failed",
};

/** Chuỗi ký khi tạo link: 5 trường xếp theo chữ cái, không mã hóa URL. */
export function paymentRequestSignatureData(r: {
  amount: number;
  cancelUrl: string;
  description: string;
  orderCode: number;
  returnUrl: string;
}): string {
  return `amount=${r.amount}&cancelUrl=${r.cancelUrl}&description=${r.description}&orderCode=${r.orderCode}&returnUrl=${r.returnUrl}`;
}

/**
 * Chuỗi ký cho dữ liệu PayOS trả về (webhook, response): key xếp theo chữ cái, dạng key=value nối bằng "&";
 * null, undefined, "null", "undefined" thành chuỗi rỗng; mảng thành JSON với key của từng phần tử được xếp.
 */
export function objectSignatureData(data: Record<string, unknown>): string {
  const sortKeys = (o: unknown): unknown => {
    if (typeof o !== "object" || o === null || Array.isArray(o)) return o;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, (o as Record<string, unknown>)[k]]));
  };
  return Object.keys(data)
    .sort()
    .filter((k) => data[k] !== undefined)
    .map((k) => {
      let v = data[k];
      if (Array.isArray(v)) v = JSON.stringify(v.map(sortKeys));
      if (v === null || v === "null" || v === "undefined") v = "";
      return `${k}=${String(v)}`;
    })
    .join("&");
}

interface PayOSEnvelope {
  code?: unknown;
  desc?: unknown;
  data?: unknown;
  signature?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export class PayOSProvider implements PaymentProvider {
  readonly name = "payos";

  constructor(
    private readonly cfg: PayOSConfig,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    if (req.currency !== "VND") throw new PaymentProviderError(`PayOS không nhận ${req.currency}`);
    const signed = {
      amount: req.amount,
      cancelUrl: req.cancelUrl,
      description: req.description,
      orderCode: req.orderCode,
      returnUrl: req.returnUrl,
    };
    const signature = await hmacSha256Hex(this.cfg.checksumKey, paymentRequestSignatureData(signed));
    const data = await this.call("POST", "/v2/payment-requests", { ...signed, expiredAt: req.expiresAt, signature });
    const { paymentLinkId, checkoutUrl, qrCode } = data;
    if (typeof paymentLinkId !== "string" || typeof checkoutUrl !== "string" || typeof qrCode !== "string") {
      throw new PaymentProviderError("PayOS trả thiếu paymentLinkId, checkoutUrl hoặc qrCode");
    }
    return { providerRef: paymentLinkId, checkoutUrl, qrCode };
  }

  async verifyWebhook(body: unknown): Promise<WebhookEvent | null> {
    if (!isRecord(body) || !isRecord(body.data) || typeof body.signature !== "string") return null;
    const expected = await hmacSha256Hex(this.cfg.checksumKey, objectSignatureData(body.data));
    if (!timingSafeEqual(expected, body.signature)) return null;
    const orderCode = body.data.orderCode;
    return Number.isSafeInteger(orderCode) ? { orderCode: orderCode as number } : null;
  }

  async getPaymentStatus(orderCode: number): Promise<PaymentStatusResult> {
    const data = await this.call("GET", `/v2/payment-requests/${orderCode}`);
    const status = typeof data.status === "string" ? STATUS_MAP[data.status] : undefined;
    const { amount, amountPaid } = data;
    if (status === undefined || !Number.isSafeInteger(amount) || !Number.isSafeInteger(amountPaid)) {
      throw new PaymentProviderError("PayOS trả trạng thái đơn không đọc được");
    }
    if (data.orderCode !== orderCode) throw new PaymentProviderError("PayOS trả sai orderCode");
    return { orderCode, status, amount: amount as number, amountPaid: amountPaid as number };
  }

  /** Đăng ký URL webhook cho kênh thanh toán; PayOS gửi thử một webhook mẫu tới URL này trước khi nhận. */
  async confirmWebhook(webhookUrl: string): Promise<void> {
    await this.call("POST", "/confirm-webhook", { webhookUrl }, false);
  }

  private async call(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    verifyResponse = true,
  ): Promise<Record<string, unknown>> {
    const init: RequestInit = {
      method,
      headers: {
        "x-client-id": this.cfg.clientId,
        "x-api-key": this.cfg.apiKey,
        "content-type": "application/json",
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await this.fetchFn(`${this.cfg.baseUrl}${path}`, init);
    let json: PayOSEnvelope;
    try {
      json = (await res.json()) as PayOSEnvelope;
    } catch {
      throw new PaymentProviderError(`PayOS trả HTTP ${res.status} không phải JSON`);
    }
    if (!res.ok || json.code !== "00" || !isRecord(json.data)) {
      throw new PaymentProviderError(
        `PayOS lỗi HTTP ${res.status}: ${String(json.desc ?? "")}`,
        typeof json.code === "string" ? json.code : undefined,
      );
    }
    // Như SDK chính thức: có chữ ký thì kiểm, sai thì từ chối.
    if (verifyResponse && typeof json.signature === "string") {
      const expected = await hmacSha256Hex(this.cfg.checksumKey, objectSignatureData(json.data));
      if (!timingSafeEqual(expected, json.signature)) throw new PaymentProviderError("chữ ký response của PayOS sai");
    }
    return json.data;
  }
}
```

- [ ] **Step 5: Chạy test**

```bash
cd server && pnpm exec vitest run test/payos.test.ts
```

Expected:
```
Test Files  1 passed (1)
Tests  13 passed (13)
```

- [ ] **Step 6: Commit**

```bash
git add server/src/payment/provider.ts server/src/payment/payos.ts server/test/payos.test.ts
git commit -m "feat(server): PaymentProvider và PayOS (tạo link, kiểm webhook, trạng thái đơn, confirm-webhook)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 9: `EmailProvider` và Resend

**Files:**
- Create: `server/test/email.test.ts`, `server/src/email/provider.ts`, `server/src/email/resend.ts`, `server/src/email/templates.ts`

- [ ] **Step 1: Viết test `server/test/email.test.ts`**

`server/test/email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EmailProviderError, maskEmail } from "../src/email/provider";
import { ResendEmailProvider } from "../src/email/resend";
import { licenseEmail } from "../src/email/templates";

describe("Resend", () => {
  it("gửi đúng endpoint, header, idempotency key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const p = new ResendEmailProvider({ apiKey: "re_test", from: "MT <noreply@mt.test>" }, async (url, init = {}) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }));
    });
    await p.send({ to: "buyer@mt.test", subject: "S", text: "T", idempotencyKey: "order-dev-7" });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toEqual({
      authorization: "Bearer re_test",
      "content-type": "application/json",
      "user-agent": "license-server/1.0",
      "idempotency-key": "order-dev-7",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "MT <noreply@mt.test>",
      to: ["buyer@mt.test"],
      subject: "S",
      text: "T",
    });
  });

  it("HTTP lỗi thì ném lỗi, không kèm body", async () => {
    const p = new ResendEmailProvider(
      { apiKey: "re_test", from: "a@mt.test" },
      async () => new Response('{"message":"buyer@mt.test bị chặn"}', { status: 403 }),
    );
    const err = await p.send({ to: "buyer@mt.test", subject: "S", text: "T" }).catch((e: unknown) => e);
    expect(String(err)).toBe("EmailProviderError: Resend trả HTTP 403");
    expect((err as EmailProviderError).status).toBe(403);
  });

  it("chỉ 400 và 422 là lỗi vĩnh viễn; 401, 403, 409, 429, 5xx và lỗi mạng là lỗi tạm", () => {
    for (const status of [400, 422]) expect(new EmailProviderError("x", status).permanent).toBe(true);
    for (const status of [401, 403, 409, 429, 500, 503]) expect(new EmailProviderError("x", status).permanent).toBe(false);
    expect(new EmailProviderError("x").permanent).toBe(false);
  });
});

describe("nội dung email", () => {
  it("có key đã định dạng, ngày hết hạn theo giờ Việt Nam, cả vi lẫn en", () => {
    // 2026-10-31T17:30:00Z là 01/11/2026 ở Việt Nam.
    const { subject, text } = licenseEmail("purchase", [
      { licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", expiresAt: Date.UTC(2026, 9, 31, 17, 30) / 1000 },
    ]);
    expect(subject).toContain("license key");
    expect(text).toContain("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTR  (hết hạn / expires 01/11/2026)");
    expect(text).toContain("Cài đặt > Bản quyền");
    expect(text).toContain("Settings > License");
  });

  it("che email trong log", () => {
    expect(maskEmail("buyer@example.com")).toBe("b***@example.com");
    expect(maskEmail("x")).toBe("***");
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/email.test.ts
```

Expected: FAIL:
```
Error: Cannot find module '../src/email/provider' imported from <repo>/server/test/email.test.ts
```

- [ ] **Step 3: Tạo `server/src/email/provider.ts`**

`server/src/email/provider.ts`:

```ts
// Interface gửi email (spec §6.8, "Gửi email"): đổi dịch vụ chỉ cần một cài đặt mới.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Cùng khóa thì dịch vụ chỉ gửi một lần (Resend giữ khóa 24 giờ). */
  idempotencyKey?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export class EmailProviderError extends Error {
  override name = "EmailProviderError";

  constructor(
    message: string,
    /** Mã HTTP của dịch vụ gửi thư; không có nếu lỗi mạng. */
    readonly status?: number,
  ) {
    super(message);
  }

  /**
   * Chỉ 400 và 422 là lỗi vĩnh viễn (thư sai dạng, địa chỉ nhận không hợp lệ): gửi lại cũng không được.
   * 401, 403 (API key bị khóa, tên miền chưa xác thực: sửa cấu hình xong thì gửi được), 409
   * (concurrent_idempotent_requests, Resend ghi "Retry later"), 429, 5xx và lỗi mạng là lỗi tạm.
   */
  get permanent(): boolean {
    return this.status === 400 || this.status === 422;
  }
}

/** Che email khi ghi log (§6.5 của kế hoạch 00): giữ ký tự đầu và tên miền. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.charAt(0)}***${email.slice(at)}`;
}
```

- [ ] **Step 4: Tạo `server/src/email/resend.ts`**

`server/src/email/resend.ts`:

```ts
// Gửi email qua API HTTP của Resend. Tài liệu đã đọc (2026-10-01):
// - https://resend.com/docs/api-reference/emails/send-email  (POST https://api.resend.com/emails, Idempotency-Key)
// - https://resend.com/docs/api-reference/introduction  (bắt buộc User-Agent, thiếu thì 403; 10 request/giây)
import type { FetchFn } from "../payment/payos";
import { type EmailMessage, type EmailProvider, EmailProviderError } from "./provider";

export interface ResendConfig {
  apiKey: string;
  from: string;
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly cfg: ResendConfig,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.cfg.apiKey}`,
      "content-type": "application/json",
      "user-agent": "license-server/1.0",
    };
    if (message.idempotencyKey) headers["idempotency-key"] = message.idempotencyKey;
    const res = await this.fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({ from: this.cfg.from, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Không đưa body vào lỗi: body có thể lặp lại địa chỉ người nhận.
      throw new EmailProviderError(`Resend trả HTTP ${res.status}`, res.status);
    }
  }
}
```

- [ ] **Step 5: Tạo `server/src/email/templates.ts`**

`server/src/email/templates.ts`:

```ts
// Nội dung email chứa license key, song ngữ vi/en (§4.5). Chỉ gửi văn bản thuần.
// "Meeting Translator" là tên tạm; đổi ở đây khi chốt tên (Q1).
import { formatLicenseKey } from "../license-key";

export type LicenseEmailKind = "purchase" | "renewal" | "recover" | "resend";

export interface LicenseEmailEntry {
  licenseKey: string;
  expiresAt: number;
}

function dateVi(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  // Giờ Việt Nam (UTC+7), không đổi theo mùa.
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
}

const SUBJECTS: Record<LicenseEmailKind, string> = {
  purchase: "License key Meeting Translator Pro / Your Meeting Translator Pro license key",
  renewal: "Đã gia hạn Meeting Translator Pro / Meeting Translator Pro renewed",
  recover: "License key Meeting Translator của bạn / Your Meeting Translator license keys",
  resend: "License key Meeting Translator Pro / Your Meeting Translator Pro license key",
};

export function licenseEmail(kind: LicenseEmailKind, entries: LicenseEmailEntry[]): { subject: string; text: string } {
  const lines = entries.map((e) => `  ${formatLicenseKey(e.licenseKey)}  (hết hạn / expires ${dateVi(e.expiresAt)})`);
  const text = [
    "Cảm ơn bạn đã dùng Meeting Translator.",
    "",
    "License key:",
    ...lines,
    "",
    "Mở app, vào Cài đặt > Bản quyền, dán key để kích hoạt. Mỗi key dùng được trên 2 máy.",
    "Giữ email này để kích hoạt máy khác hoặc cài lại máy.",
    "",
    "---",
    "Thank you for using Meeting Translator.",
    "Open the app, go to Settings > License and paste the key. Each key works on 2 computers.",
    "Keep this email to activate another computer or reinstall.",
  ].join("\n");
  return { subject: SUBJECTS[kind], text };
}
```

- [ ] **Step 6: Chạy test**

```bash
cd server && pnpm exec vitest run test/email.test.ts
```

Expected:
```
Test Files  1 passed (1)
Tests  5 passed (5)
```

- [ ] **Step 7: Commit**

```bash
git add server/src/email/provider.ts server/src/email/resend.ts server/src/email/templates.ts server/test/email.test.ts
git commit -m "feat(server): EmailProvider, gửi qua Resend, nội dung thư song ngữ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 10: Giới hạn tần suất trong D1 và cảnh báo cho người vận hành

**Files:**
- Create: `server/test/ratelimit.test.ts`, `server/test/alerts.test.ts`, `server/src/alerts.ts`, `server/src/ratelimit.ts`

- [ ] **Step 1: Viết test `server/test/ratelimit.test.ts`**

`server/test/ratelimit.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex, sha256Hex } from "../src/crypto";
import { failureBlock, hit, LIMITS, noteFailure, pruneRateLimits } from "../src/ratelimit";
import { resetDb } from "./db";

beforeEach(resetDb);

const T = 1_790_812_800; // đầu một giờ

describe("giới hạn tần suất", () => {
  it("activate: 10 lần mỗi giờ mỗi IP, lần thứ 11 bị chặn, giờ sau mở lại", async () => {
    for (let i = 1; i <= LIMITS.activate_ip; i++) {
      expect((await hit(env, "activate_ip", "203.0.113.7", T + i)).allowed).toBe(true);
    }
    const blocked = await hit(env, "activate_ip", "203.0.113.7", T + 100);
    expect(blocked).toEqual({ allowed: false, count: 11, retryAfter: 3500 });
    expect((await hit(env, "activate_ip", "198.51.100.1", T + 100)).allowed).toBe(true);
    expect((await hit(env, "activate_ip", "203.0.113.7", T + 3600)).allowed).toBe(true);
  });

  it("chủ thể lưu dạng HMAC với RATE_LIMIT_PEPPER, không phải IP gốc hay SHA-256 không muối", async () => {
    await hit(env, "checkout_ip", "203.0.113.7", T);
    const { results } = await env.DB.prepare("SELECT bucket FROM rate_limits").all<{ bucket: string }>();
    expect(results.map((r) => r.bucket)).toEqual([`checkout_ip:${await hmacSha256Hex("test-pepper", "203.0.113.7")}`]);
    expect(results[0]!.bucket).not.toContain(await sha256Hex("203.0.113.7"));
    await hit({ ...env, RATE_LIMIT_PEPPER: "pepper-khac" }, "checkout_ip", "203.0.113.7", T);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits").first<{ n: number }>();
    expect(n?.n).toBe(2);
  });

  it("60 lần thất bại: chặn IP tới hết giờ, ghi log và tạo đúng một cảnh báo", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 59; i++) await noteFailure(env, "203.0.113.9", T, "activate");
    expect(await failureBlock(env, "203.0.113.9", T + 10)).toBe(0);
    for (let i = 0; i < 6; i++) await noteFailure(env, "203.0.113.9", T, "activate");
    expect(await failureBlock(env, "203.0.113.9", T + 10)).toBe(3590);
    expect(await failureBlock(env, "198.51.100.1", T + 10)).toBe(0);
    expect(await failureBlock(env, "203.0.113.9", T + 3600)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toEqual({
      event: "many_failures",
      what: "activate",
      count: 60,
      window_seconds: 3600,
    });
    const alerts = await env.DB.prepare("SELECT kind, count FROM ops_alerts").all();
    expect(alerts.results).toEqual([{ kind: "many_failures", count: 1 }]);
    warn.mockRestore();
  });

  it("dọn bộ đếm cũ hơn 2 giờ và cảnh báo cũ hơn 7 ngày", async () => {
    await hit(env, "validate_key", "k", T);
    await env.DB.prepare("INSERT INTO ops_alerts (kind, window_start, count) VALUES ('email_failed', ?, 1)").bind(T).run();
    await pruneRateLimits(env.DB, T + 3 * 3600);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits").first<{ n: number }>())?.n).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM ops_alerts").first<{ n: number }>())?.n).toBe(1);
    await pruneRateLimits(env.DB, T + 8 * 86400);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM ops_alerts").first<{ n: number }>())?.n).toBe(0);
  });
});
```

- [ ] **Step 2: Viết test `server/test/alerts.test.ts`**

`server/test/alerts.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { raiseAlert, sendAlerts } from "../src/alerts";
import type { EmailMessage, EmailProvider } from "../src/email/provider";
import { resetDb } from "./db";

beforeEach(resetDb);

const T = 1_790_812_800;

function mailbox(fail = false) {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = {
    async send(m) {
      if (fail) throw new Error("down");
      sent.push(m);
    },
  };
  return { sent, provider };
}

describe("cảnh báo cho người vận hành", () => {
  const ops = { ...env, OPERATOR_EMAIL: "ops@example.com" };

  it("gộp theo loại, gửi một email mỗi loại, tối đa một lần mỗi giờ", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const box = mailbox();
    await raiseAlert(env.DB, "webhook_bad_signature", T + 10);
    await raiseAlert(env.DB, "webhook_bad_signature", T + 20);
    await raiseAlert(env.DB, "license_locked", T + 30);
    expect(await sendAlerts(ops, box.provider, T + 300)).toBe(2);
    expect(box.sent.map((m) => [m.to, m.subject])).toEqual([
      ["ops@example.com", "[license dev] Cảnh báo: license_locked (1)"],
      ["ops@example.com", "[license dev] Cảnh báo: webhook_bad_signature (2)"],
    ]);
    // Sự kiện mới trong cùng giờ: chưa gửi lại.
    await raiseAlert(env.DB, "webhook_bad_signature", T + 400);
    expect(await sendAlerts(ops, box.provider, T + 600)).toBe(0);
    // Qua 1 giờ kể từ lần báo trước: gửi phần còn lại.
    expect(await sendAlerts(ops, box.provider, T + 300 + 3601)).toBe(1);
    expect(box.sent.at(-1)!.subject).toBe("[license dev] Cảnh báo: webhook_bad_signature (1)");
    vi.restoreAllMocks();
  });

  it("thiếu OPERATOR_EMAIL thì chỉ ghi log, không gửi", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const box = mailbox();
    await raiseAlert(env.DB, "email_failed", T);
    expect(await sendAlerts(env, box.provider, T + 300)).toBe(0);
    expect(box.sent).toHaveLength(0);
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toEqual({ event: "alert", kind: "email_failed", count: 1, since: T });
    expect(await sendAlerts(env, box.provider, T + 600)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("gửi lỗi thì lần sau thử lại", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await raiseAlert(env.DB, "many_failures", T);
    expect(await sendAlerts(ops, mailbox(true).provider, T + 300)).toBe(0);
    const box = mailbox();
    expect(await sendAlerts(ops, box.provider, T + 600)).toBe(1);
    expect(box.sent[0]!.text).toContain("dò key");
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 3: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/ratelimit.test.ts test/alerts.test.ts
```

Expected: FAIL, một dòng `Cannot find module` cho mỗi file test:
```
Error: Cannot find module '../src/alerts' imported from <repo>/server/test/alerts.test.ts
Error: Cannot find module '../src/ratelimit' imported from <repo>/server/test/ratelimit.test.ts
```
```
Test Files  2 failed (2)
Tests  no tests
```

- [ ] **Step 4: Tạo `server/src/alerts.ts`**

`server/src/alerts.ts`:

```ts
// Cảnh báo cho người vận hành (§10.2 "cảnh báo khi có nhiều lần kiểm tra thất bại").
// Sự kiện được đếm theo loại và theo giờ trong D1; cron gửi email tới OPERATOR_EMAIL (secret, không nằm trong repo),
// tối đa một email mỗi loại mỗi giờ. Thiếu OPERATOR_EMAIL thì chỉ ghi log.
import type { EmailProvider } from "./email/provider";

export type AlertKind = "many_failures" | "webhook_bad_signature" | "email_failed" | "license_locked";

const ALERT_TEXT: Record<AlertKind, string> = {
  many_failures: "Một IP có từ 60 lần kiểm key hoặc activation thất bại trong 1 giờ (có thể đang dò key)",
  webhook_bad_signature: "Webhook thanh toán sai chữ ký (có thể bị giả mạo, hoặc checksum key sai)",
  email_failed: "Gửi email chứa license key thất bại (cron sẽ gửi lại)",
  license_locked: "Key bị khóa tạm vì gỡ rồi kích hoạt máy khác quá ngưỡng",
};
const HOUR = 3600;

export async function raiseAlert(db: D1Database, kind: AlertKind, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ops_alerts (kind, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (kind, window_start) DO UPDATE SET count = count + 1`,
    )
    .bind(kind, now - (now % HOUR))
    .run();
}

/**
 * Gửi các cảnh báo chưa báo, gộp theo loại. Loại nào đã báo trong 1 giờ qua thì để lần sau.
 * Gửi lỗi thì giữ nguyên để lần cron sau thử lại (không tạo cảnh báo email_failed mới, tránh vòng lặp).
 */
export async function sendAlerts(
  env: { DB: D1Database; ENVIRONMENT: string; OPERATOR_EMAIL?: string },
  email: EmailProvider,
  now: number,
): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT kind, SUM(count - notified_count) AS count, MIN(window_start) AS since FROM ops_alerts
     WHERE count > notified_count AND window_start >= ?1 - 86400
       AND kind NOT IN (SELECT kind FROM ops_alerts WHERE notified_at > ?1 - ?2)
     GROUP BY kind ORDER BY kind`,
  )
    .bind(now, HOUR)
    .all<{ kind: AlertKind; count: number; since: number }>();
  let sent = 0;
  for (const a of results) {
    console.warn(JSON.stringify({ event: "alert", kind: a.kind, count: a.count, since: a.since }));
    if (env.OPERATOR_EMAIL) {
      try {
        await email.send({
          to: env.OPERATOR_EMAIL,
          subject: `[license ${env.ENVIRONMENT}] Cảnh báo: ${a.kind} (${a.count})`,
          text: [
            ALERT_TEXT[a.kind],
            "",
            `Số lần: ${a.count}, từ ${new Date(a.since * 1000).toISOString()}.`,
            "Chi tiết ở Workers Logs và bảng audit_log (Worker admin).",
          ].join("\n"),
        });
        sent++;
      } catch (err) {
        console.error(JSON.stringify({ event: "alert_email_failed", kind: a.kind, error: String(err) }));
        continue;
      }
    }
    await env.DB.prepare(
      `UPDATE ops_alerts SET notified_count = count, notified_at = ?1
       WHERE kind = ?2 AND count > notified_count AND window_start >= ?1 - 86400`,
    )
      .bind(now, a.kind)
      .run();
  }
  return sent;
}
```

- [ ] **Step 5: Tạo `server/src/ratelimit.ts`**

`server/src/ratelimit.ts`:

```ts
// Giới hạn tần suất theo cửa sổ cố định 1 giờ, đếm trong D1 (§10.2).
// Không dùng binding Rate Limiting của Workers: binding đó chỉ có chu kỳ 10 hoặc 60 giây và đếm riêng
// từng vị trí của Cloudflare (https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
// IP, key và email chỉ lưu dạng HMAC-SHA256 với secret RATE_LIMIT_PEPPER, nên bảng bị lộ cũng không dò ngược được.
import { raiseAlert } from "./alerts";
import { hmacSha256Hex } from "./crypto";

export const LIMITS = {
  checkout_ip: 10,
  activate_ip: 10,
  deactivate_ip: 10,
  validate_key: 30,
  recover_email: 3,
  recover_ip: 10,
  order_poll: 600,
  // Lần thất bại (key sai định dạng hay không tồn tại, activation lạ) của một IP, tính chung mọi endpoint.
  // Chạm ngưỡng thì IP đó bị chặn tới hết giờ, trừ request có key hợp lệ kèm activation đang hoạt động
  // và khớp (nhiều người dùng chung một IP qua CGNAT vẫn validate được), và có cảnh báo cho người vận hành.
  failure_ip: 60,
} as const;
export type LimitName = keyof typeof LIMITS;
export const WINDOW_SECONDS = 3600;

export interface RateEnv {
  DB: D1Database;
  RATE_LIMIT_PEPPER: string;
}

export interface HitResult {
  allowed: boolean;
  count: number;
  retryAfter: number;
}

async function bucketOf(env: RateEnv, name: LimitName, subject: string): Promise<string> {
  return `${name}:${await hmacSha256Hex(env.RATE_LIMIT_PEPPER, subject)}`;
}

/** Tăng bộ đếm của (tên, chủ thể) trong cửa sổ hiện tại. */
export async function hit(env: RateEnv, name: LimitName, subject: string, now: number): Promise<HitResult> {
  const windowStart = now - (now % WINDOW_SECONDS);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(await bucketOf(env, name, subject), windowStart)
    .first<{ count: number }>();
  const count = row?.count ?? 1;
  return { allowed: count <= LIMITS[name], count, retryAfter: windowStart + WINDOW_SECONDS - now };
}

/** IP đã chạm ngưỡng thất bại trong giờ này chưa (chỉ đọc, không đếm thêm). Trả số giây phải chờ, hoặc 0. */
export async function failureBlock(env: RateEnv, ip: string, now: number): Promise<number> {
  const windowStart = now - (now % WINDOW_SECONDS);
  const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?")
    .bind(await bucketOf(env, "failure_ip", ip), windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 0) >= LIMITS.failure_ip ? windowStart + WINDOW_SECONDS - now : 0;
}

/** Đếm một lần thất bại của IP; đúng lúc chạm ngưỡng thì ghi log và tạo cảnh báo many_failures. */
export async function noteFailure(env: RateEnv, ip: string, now: number, what: string): Promise<void> {
  const { count } = await hit(env, "failure_ip", ip, now);
  if (count === LIMITS.failure_ip) {
    console.warn(JSON.stringify({ event: "many_failures", what, count, window_seconds: WINDOW_SECONDS }));
    await raiseAlert(env.DB, "many_failures", now);
  }
}

/** Dọn bộ đếm cũ: mỗi dòng sống tối đa khoảng 3 giờ (cửa sổ 1 giờ, xóa khi đã cũ hơn 2 giờ). */
export async function pruneRateLimits(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now - 2 * WINDOW_SECONDS),
    db.prepare("DELETE FROM ops_alerts WHERE window_start < ?").bind(now - 7 * 86400),
  ]);
}
```

- [ ] **Step 6: Chạy test**

```bash
cd server && pnpm exec vitest run test/ratelimit.test.ts test/alerts.test.ts
```

Expected:
```
Test Files  2 passed (2)
Tests  7 passed (7)
```

- [ ] **Step 7: Commit**

```bash
git add server/src/alerts.ts server/src/ratelimit.ts server/test/ratelimit.test.ts server/test/alerts.test.ts
git commit -m "feat(server): giới hạn tần suất theo giờ (HMAC có pepper), chặn IP thất bại nhiều, cảnh báo cho người vận hành (§10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 11: Khung app Hono, `Deps`, bản giả lập PayOS và Resend

**Files:**
- Create: `server/test/fakes.ts`, `server/test/world.ts`, `server/test/app.test.ts`, `server/src/http.ts`, `server/src/audit.ts`, `server/src/deps.ts`, `server/src/app.ts`
- Modify: `server/src/index.ts` (thay toàn bộ)

- [ ] **Step 1: Tạo `server/test/fakes.ts`: PayOS và Resend giả ở mức HTTP**

PayOS giả kiểm chữ ký của request tạo link, giữ trạng thái từng link, ký response và webhook bằng checksum key test. Nhờ vậy route chạy qua đúng code `PayOSProvider`. `FakeGateway` là cổng thanh toán giả thứ hai, để kiểm việc chọn cổng theo `orders.provider` (QĐ28).

`server/test/fakes.ts`:

```ts
// Bản giả lập PayOS và Resend ở mức HTTP: route chạy đúng code PayOSProvider và ResendEmailProvider,
// chỉ thay hàm fetch. Không test nào gọi mạng thật.
import { hmacSha256Hex } from "../src/crypto";
import { objectSignatureData, paymentRequestSignatureData } from "../src/payment/payos";
import type { CheckoutResult, PaymentProvider, PaymentStatusResult, WebhookEvent } from "../src/payment/provider";

export const TEST_CHECKSUM_KEY = "test-checksum-key-không-dùng-ở-đâu-khác";

interface FakeLink {
  orderCode: number;
  amount: number;
  amountPaid: number;
  status: string;
  description: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export class FakePayOS {
  readonly links = new Map<number, FakeLink>();
  readonly requests: { method: string; path: string; body: unknown }[] = [];
  down = false;
  confirmedWebhook: string | null = null;

  constructor(private readonly checksumKey = TEST_CHECKSUM_KEY) {}

  readonly fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const path = new URL(url).pathname;
    const method = init.method ?? "GET";
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
    this.requests.push({ method, path, body });
    if (this.down) throw new TypeError("fetch failed");
    if (method === "POST" && path === "/v2/payment-requests" && body) {
      const signed = body as { amount: number; cancelUrl: string; description: string; orderCode: number; returnUrl: string };
      const expected = await hmacSha256Hex(this.checksumKey, paymentRequestSignatureData(signed));
      if (body.signature !== expected) return json({ code: "201", desc: "Mã kiểm tra(signature) không hợp lệ", data: null });
      if (this.links.has(signed.orderCode)) return json({ code: "231", desc: "Đơn thanh toán đã tồn tại", data: null });
      this.links.set(signed.orderCode, {
        orderCode: signed.orderCode,
        amount: signed.amount,
        amountPaid: 0,
        status: "PENDING",
        description: signed.description,
      });
      return this.signed({
        bin: "970422",
        accountNumber: "113366668888",
        accountName: "TEST",
        amount: signed.amount,
        description: signed.description,
        orderCode: signed.orderCode,
        currency: "VND",
        paymentLinkId: `plink${signed.orderCode}`,
        status: "PENDING",
        checkoutUrl: `https://pay.payos.test/web/plink${signed.orderCode}`,
        qrCode: `00020101021238570010A0000007270127QR${signed.orderCode}6304ABCD`,
      });
    }
    const m = path.match(/^\/v2\/payment-requests\/(\d+)$/);
    if (method === "GET" && m) {
      const link = this.links.get(Number(m[1]));
      if (!link) return json({ code: "101", desc: "Mã thanh toán không tồn tại", data: null });
      return this.signed({
        id: `plink${link.orderCode}`,
        orderCode: link.orderCode,
        amount: link.amount,
        amountPaid: link.amountPaid,
        amountRemaining: link.amount - link.amountPaid,
        status: link.status,
        createdAt: "2026-10-01T00:00:00.000Z",
        transactions: link.amountPaid > 0 ? [{ reference: "FT1", amount: link.amountPaid, counterAccountName: null }] : [],
        cancellationReason: null,
        canceledAt: null,
      });
    }
    if (method === "POST" && path === "/confirm-webhook" && body) {
      this.confirmedWebhook = String(body.webhookUrl);
      return json({ code: "00", desc: "success", data: { webhookUrl: body.webhookUrl, name: "Test", shortName: "T" } });
    }
    return json({ code: "404", desc: "not found", data: null }, 404);
  };

  /** Khách chuyển khoản `amount` đồng cho đơn (mặc định đủ tiền). */
  pay(orderCode: number, amount?: number): void {
    const link = this.links.get(orderCode);
    if (!link) throw new Error(`không có link ${orderCode}`);
    link.amountPaid += amount ?? link.amount;
    link.status = link.amountPaid >= link.amount ? "PAID" : "UNDERPAID";
  }

  setStatus(orderCode: number, status: string): void {
    const link = this.links.get(orderCode);
    if (!link) throw new Error(`không có link ${orderCode}`);
    link.status = status;
  }

  /** Giả lập PayOS trả số tiền khác số tiền của đơn (bất thường). */
  setAmount(orderCode: number, amount: number): void {
    const link = this.links.get(orderCode);
    if (!link) throw new Error(`không có link ${orderCode}`);
    link.amount = amount;
  }

  /** Body webhook PayOS gửi khi có giao dịch, ký bằng checksum key của kênh. */
  async webhookBody(orderCode: number, amount?: number): Promise<Record<string, unknown>> {
    const link = this.links.get(orderCode);
    const data = {
      orderCode,
      amount: amount ?? link?.amount ?? 0,
      description: link?.description ?? `MT${orderCode}`,
      accountNumber: "113366668888",
      reference: "FT1",
      transactionDateTime: "2026-10-01 07:00:00",
      currency: "VND",
      paymentLinkId: `plink${orderCode}`,
      code: "00",
      desc: "Thành công",
      counterAccountBankId: "",
      counterAccountBankName: "",
      counterAccountName: "",
      counterAccountNumber: "",
      virtualAccountName: "",
      virtualAccountNumber: "",
    };
    return { code: "00", desc: "success", success: true, data, signature: await this.sign(data) };
  }

  private async sign(data: Record<string, unknown>): Promise<string> {
    return hmacSha256Hex(this.checksumKey, objectSignatureData(data));
  }

  private async signed(data: Record<string, unknown>): Promise<Response> {
    return json({ code: "00", desc: "success", data, signature: await this.sign(data) });
  }
}

export interface SentEmail {
  to: string[];
  subject: string;
  text: string;
  idempotencyKey: string | null;
}

export class FakeResend {
  readonly sent: SentEmail[] = [];
  /** Resend trả 500 (lỗi tạm). */
  down = false;
  /** Resend trả mã này, ví dụ 422 (lỗi vĩnh viễn) hay 429 (lỗi tạm). */
  failStatus: number | null = null;
  attempts = 0;

  readonly fetch = async (_url: string, init: RequestInit = {}): Promise<Response> => {
    this.attempts++;
    if (this.failStatus !== null) return json({ statusCode: this.failStatus, message: "lỗi giả", name: "error" }, this.failStatus);
    if (this.down) return json({ statusCode: 500, message: "down", name: "internal_server_error" }, 500);
    const body = JSON.parse(init.body as string) as { to: string[]; subject: string; text: string };
    const headers = init.headers as Record<string, string>;
    this.sent.push({ to: body.to, subject: body.subject, text: body.text, idempotencyKey: headers["idempotency-key"] ?? null });
    return json({ id: crypto.randomUUID() });
  };
}

/** Cổng thanh toán giả thứ hai, để kiểm webhook và đối soát chọn cổng theo orders.provider (QĐ28). */
export class FakeGateway implements PaymentProvider {
  readonly name = "fakepay";
  readonly statusCalls: number[] = [];
  paid = new Set<number>();

  async createCheckout(): Promise<CheckoutResult> {
    throw new Error("không dùng trong test");
  }

  async verifyWebhook(body: unknown): Promise<WebhookEvent | null> {
    const b = body as { secret?: string; orderCode?: number };
    return b.secret === "fakepay-ok" && typeof b.orderCode === "number" ? { orderCode: b.orderCode } : null;
  }

  async getPaymentStatus(orderCode: number): Promise<PaymentStatusResult> {
    this.statusCalls.push(orderCode);
    const paid = this.paid.has(orderCode);
    return { orderCode, status: paid ? "paid" : "pending", amount: 2000, amountPaid: paid ? 2000 : 0 };
  }
}
```

- [ ] **Step 2: Tạo `server/test/world.ts`: app với đồng hồ giả, PayOS giả, Resend giả**

`deps.payments` là map tên cổng → `PaymentProvider` (QĐ28). Task 13 thêm hàm `buy()` và `getOrder()` vào file này.

`server/test/world.ts`:

```ts
// Dựng app với đồng hồ giả, PayOS giả, Resend giả và khóa ký test-1 của vector.
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createApp } from "../src/app";
import type { Deps } from "../src/deps";
import { ResendEmailProvider } from "../src/email/resend";
import type { ApiEnv } from "../src/env";
import { PayOSProvider } from "../src/payment/payos";
import { importSigningKey } from "../src/token";
import { FakePayOS, FakeResend, TEST_CHECKSUM_KEY } from "./fakes";
import { testSigningJwk } from "./keys";

/** 2026-10-01T00:00:00Z */
export const T0 = 1_790_812_800;
export const DAY = 86400;

export interface CallResult {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
  const clock = { now: T0 };
  const payos = new FakePayOS();
  const resend = new FakeResend();
  const deps: Deps = {
    now: () => clock.now,
    payments: {
      payos: new PayOSProvider(
        { baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: TEST_CHECKSUM_KEY },
        payos.fetch,
      ),
    },
    email: new ResendEmailProvider({ apiKey: "re_test", from: "MT <noreply@mt.test>" }, resend.fetch),
    signingKey: async () => importSigningKey(await testSigningJwk("test-1")),
  };
  const app = createApp(() => deps);
  const testEnv: ApiEnv = { ...env, ...envOverride };

  async function call(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<CallResult> {
    const init: RequestInit = {
      method,
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10", ...headers },
    };
    if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`https://license.test${path}`, init), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { text };
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  return { clock, payos, resend, deps, app, env: testEnv, call };
}
```

- [ ] **Step 3: Viết test `server/test/app.test.ts`**

`server/test/app.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { loadSigningKey } from "../src/deps";
import { testSigningJwk } from "./keys";
import { makeWorld } from "./world";

describe("khung Worker API", () => {
  it("ngoài dev chỉ nhận HTTPS (§10.2)", async () => {
    const w = makeWorld({ ENVIRONMENT: "staging" });
    expect((await w.app.fetch(new Request("http://license.test/v1/health"), w.env)).status).toBe(403);
    expect((await w.app.fetch(new Request("https://license.test/v1/health"), w.env)).status).toBe(200);
  });

  it("route lạ trả 404 dạng JSON", async () => {
    expect(await makeWorld().call("GET", "/v1/nope")).toMatchObject({ status: 404, body: { error: "not_found" } });
  });

  it("body quá 16 KiB thì 413", async () => {
    const res = await makeWorld().call("POST", "/v1/nope", { pad: "x".repeat(20_000) });
    expect(res.status).toBe(413);
  });

  it("khóa test-* không dùng được ngoài dev", async () => {
    const jwk = await testSigningJwk("test-1");
    await expect(loadSigningKey({ TOKEN_SIGNING_JWK: jwk, ENVIRONMENT: "staging" })).rejects.toThrow(/test-/);
    await expect(loadSigningKey({ TOKEN_SIGNING_JWK: jwk, ENVIRONMENT: "production" })).rejects.toThrow(/test-/);
    expect((await loadSigningKey({ TOKEN_SIGNING_JWK: jwk, ENVIRONMENT: "dev" })).kid).toBe("test-1");
  });

  it("test chạy với secret giả, không bao giờ với secret thật của máy", () => {
    expect(env.PAYOS_API_KEY).toBe("test-api-key");
    expect(env.PAYOS_CHECKSUM_KEY).toBe("test-checksum-key");
    expect(env.RESEND_API_KEY).toBe("re_test");
    expect(env.ENVIRONMENT).toBe("dev");
  });
});
```

- [ ] **Step 4: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/app.test.ts
```

Expected: FAIL:
```
Error: Cannot find module '../src/deps' imported from <repo>/server/test/app.test.ts
```

- [ ] **Step 5: Tạo `server/src/http.ts`**

`server/src/http.ts`:

```ts
// Tiện ích HTTP: đọc và kiểm input (§10.2 "kiểm tra mọi input"), trả lỗi theo một dạng chung.
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "invalid_request"
  | "invalid_key"
  | "license_revoked"
  | "license_expired"
  | "license_locked"
  | "device_limit"
  | "activation_not_found"
  | "order_not_found"
  | "invalid_signature"
  | "rate_limited"
  | "pricing_not_configured"
  | "payment_provider_error"
  | "temporarily_unavailable"
  | "order_code_exhausted"
  | "unsupported_media_type"
  | "forbidden"
  | "not_found"
  | "internal";

export function fail(c: Context, status: ContentfulStatusCode, error: ErrorCode, extra: Record<string, unknown> = {}) {
  return c.json({ error, ...extra }, status);
}

export function tooMany(c: Context, retryAfter: number) {
  c.header("retry-after", String(retryAfter));
  return fail(c, 429, "rate_limited");
}

export function clientIp(c: Context): string {
  return c.req.header("cf-connecting-ip") ?? "unknown";
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Body phải là object JSON; sai thì null (route trả 400). Giới hạn kích thước do bodyLimit ở app.ts. */
export async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export function parseEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const email = v.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export function parseDeviceIdHash(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? v : null;
}

/** Tên máy: bỏ ký tự điều khiển, cắt còn 64 ký tự. Rỗng thì null. */
export function parseDeviceLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const label = Array.from(v.replace(/[\u0000-\u001f\u007f]/g, "").trim()).slice(0, 64).join("");
  return label.length > 0 ? label : null;
}

export function parseUuid(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) ? v : null;
}
```

- [ ] **Step 6: Tạo `server/src/audit.ts`**

`server/src/audit.ts`:

```ts
// Nhật ký thay đổi license và thao tác admin (§6.8, §10.2). Không ghi key đầy đủ, token hay email.

export interface AuditEntry {
  at: number;
  actor: string;
  action: string;
  licenseId?: string | null;
  orderCode?: number | null;
  detail?: Record<string, unknown>;
}

export function auditStatement(db: D1Database, e: AuditEntry): D1PreparedStatement {
  return db
    .prepare("INSERT INTO audit_log (at, actor, action, license_id, order_code, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(e.at, e.actor, e.action, e.licenseId ?? null, e.orderCode ?? null, e.detail ? JSON.stringify(e.detail) : null);
}

export async function audit(db: D1Database, e: AuditEntry): Promise<void> {
  await auditStatement(db, e).run();
}
```

- [ ] **Step 7: Tạo `server/src/deps.ts`**

`server/src/deps.ts`:

```ts
// Phụ thuộc bên ngoài của route: đồng hồ, cổng thanh toán, email, khóa ký. Test thay bằng bản giả.
import { raiseAlert } from "./alerts";
import { type EmailProvider, EmailProviderError, maskEmail } from "./email/provider";
import { ResendEmailProvider } from "./email/resend";
import { type LicenseEmailEntry, type LicenseEmailKind, licenseEmail } from "./email/templates";
import type { ApiEnv } from "./env";
import { PayOSProvider } from "./payment/payos";
import type { PaymentProvider } from "./payment/provider";
import { importSigningKey, type SigningKey } from "./token";

export interface Deps {
  now(): number;
  /** Cổng thanh toán theo tên (orders.provider). Thêm cổng mới chỉ cần thêm vào map này (§6.8). */
  payments: Record<string, PaymentProvider>;
  email: EmailProvider;
  signingKey(): Promise<SigningKey>;
}

export type DepsFactory = (env: ApiEnv) => Deps;

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function loadSigningKey(env: Pick<ApiEnv, "TOKEN_SIGNING_JWK" | "ENVIRONMENT">): Promise<SigningKey> {
  const key = await importSigningKey(env.TOKEN_SIGNING_JWK);
  if (env.ENVIRONMENT !== "dev" && key.kid.startsWith("test-")) {
    throw new Error("khóa test-* chỉ dùng được khi ENVIRONMENT=dev");
  }
  return key;
}

export function payosFromEnv(env: Pick<ApiEnv, "PAYOS_BASE_URL" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY">) {
  return new PayOSProvider({
    baseUrl: env.PAYOS_BASE_URL,
    clientId: env.PAYOS_CLIENT_ID,
    apiKey: env.PAYOS_API_KEY,
    checksumKey: env.PAYOS_CHECKSUM_KEY,
  });
}

export function realDeps(env: ApiEnv): Deps {
  let key: Promise<SigningKey> | undefined;
  return {
    now: nowSeconds,
    payments: { payos: payosFromEnv(env) },
    email: new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }),
    signingKey: () => (key ??= loadSigningKey(env)),
  };
}

export interface MailResult {
  ok: boolean;
  /** Lỗi vĩnh viễn (Resend trả 400 hoặc 422): không gửi lại. */
  permanent: boolean;
}

/**
 * Gửi email chứa key. Lỗi thì ghi log và (nếu `alert`) tạo cảnh báo email_failed; key vẫn lấy được qua
 * GET /v1/orders, recover hay admin, và cron gửi lại thư mua hàng gặp lỗi tạm (orders.ts, retryUnsentEmails).
 */
export async function sendLicenseMail(
  db: D1Database,
  deps: Pick<Deps, "email" | "now">,
  to: string,
  kind: LicenseEmailKind,
  entries: LicenseEmailEntry[],
  opts: { idempotencyKey?: string; alert?: boolean } = {},
): Promise<MailResult> {
  const { subject, text } = licenseEmail(kind, entries);
  try {
    const key = opts.idempotencyKey;
    await deps.email.send(key ? { to, subject, text, idempotencyKey: key } : { to, subject, text });
    return { ok: true, permanent: false };
  } catch (err) {
    const permanent = err instanceof EmailProviderError && err.permanent;
    console.error(JSON.stringify({ event: "email_failed", kind, to: maskEmail(to), permanent, error: String(err) }));
    if (opts.alert ?? true) await raiseAlert(db, "email_failed", deps.now());
    return { ok: false, permanent };
  }
}
```

- [ ] **Step 8: Tạo `server/src/app.ts` (chưa gắn route nghiệp vụ)**

`server/src/app.ts`:

```ts
// Worker API công khai (spec §6.8). Route nhận phụ thuộc qua `deps` để test thay được PayOS, Resend, đồng hồ.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { type Deps, type DepsFactory, realDeps } from "./deps";
import type { ApiEnv } from "./env";
import { fail } from "./http";

export type AppEnv = { Bindings: ApiEnv; Variables: { deps: Deps } };

export function createApp(makeDeps: DepsFactory = realDeps) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    // Chỉ HTTPS (§10.2). Chạy cục bộ và test (ENVIRONMENT=dev) thì bỏ qua.
    if (c.env.ENVIRONMENT !== "dev" && new URL(c.req.url).protocol !== "https:") return fail(c, 403, "forbidden");
    c.set("deps", makeDeps(c.env));
    await next();
  });
  app.use("/v1/*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => fail(c, 413, "invalid_request") }));
  app.get("/v1/health", (c) => c.json({ ok: true }));
  app.notFound((c) => fail(c, 404, "not_found"));
  app.onError((err, c) => {
    console.error(JSON.stringify({ event: "unhandled", name: err.name, message: err.message }));
    return fail(c, 500, "internal");
  });
  return app;
}
```

- [ ] **Step 9: Thay `server/src/index.ts`**

`server/src/index.ts`:

```ts
// Điểm vào của Worker API. Task 15 thêm Cron Trigger đối soát.
import { createApp } from "./app";
import type { ApiEnv } from "./env";

const app = createApp();

export default { fetch: app.fetch } satisfies ExportedHandler<ApiEnv>;
```

- [ ] **Step 10: Chạy toàn bộ test và typecheck**

```bash
cd server && pnpm exec vitest run && pnpm typecheck
```

Expected:
```
Test Files  10 passed (10)
Tests  73 passed (73)
```

- [ ] **Step 11: Commit**

```bash
git add server/src/http.ts server/src/audit.ts server/src/deps.ts server/src/app.ts server/src/index.ts server/test/fakes.ts server/test/world.ts server/test/app.test.ts
git commit -m "feat(server): app Hono chỉ nhận HTTPS, giới hạn body, Deps thay được trong test" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 12: `POST /v1/checkout`

**Files:**
- Create: `server/test/checkout.test.ts`, `server/src/plans.ts`, `server/src/checkout.ts`
- Modify: `server/src/app.ts` (thay toàn bộ)

- [ ] **Step 1: Viết test `server/test/checkout.test.ts`**

`server/test/checkout.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./db";
import { makeWorld, T0 } from "./world";

beforeEach(resetDb);

const valid = { plan: "pro_1m", email: " Buyer@Example.com ", consent: true };

/** Đúng câu lệnh giữ chỗ số đơn ở Task 21, Step 4 (`wrangler d1 execute … --command`), QĐ18. */
const reserveSql = (n: number) =>
  `INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES (${n}, 'reserved', 'none', 'pro_1m', 0, 'VND', 0, 'failed', 0, 0); DELETE FROM orders WHERE order_code = ${n};`;

describe("POST /v1/checkout", () => {
  it("tạo đơn, gọi PayOS với mô tả MT<orderCode>, hạn 15 phút, trả link và VietQR", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      order_code: 1,
      checkout_url: "https://pay.payos.test/web/plink1",
      qr_code: "00020101021238570010A0000007270127QR16304ABCD",
      amount: 2000,
      currency: "VND",
      expires_at: T0 + 900,
    });
    expect(res.body.order_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.payos.requests[0]).toMatchObject({
      method: "POST",
      path: "/v2/payment-requests",
      body: {
        orderCode: 1,
        amount: 2000,
        description: "MT1",
        returnUrl: "https://license.test/v1/pay/return",
        cancelUrl: "https://license.test/v1/pay/cancel",
        expiredAt: T0 + 900,
      },
    });
    const row = await env.DB.prepare("SELECT * FROM orders WHERE order_code = 1").first<Record<string, unknown>>();
    expect(row).toMatchObject({
      provider: "payos",
      provider_ref: "plink1",
      plan: "pro_1m",
      amount: 2000,
      currency: "VND",
      email: "buyer@example.com",
      email_consent_at: T0,
      status: "pending",
      renew_license_id: null,
    });
    // Chỉ lưu mã băm của order_token.
    expect(row?.order_token_hash).not.toBe(res.body.order_token);
  });

  it("giá lấy từ PRICES_JSON theo gói", async () => {
    const w = makeWorld({ PRICES_JSON: '{"pro_1m":{"VND":99000},"pro_12m":{"VND":990000}}' });
    const res = await w.call("POST", "/v1/checkout", { ...valid, plan: "pro_12m" });
    expect(res.body.amount).toBe(990000);
  });

  it("chưa cấu hình giá thì 503, không tạo đơn", async () => {
    const w = makeWorld({ PRICES_JSON: "" });
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res).toMatchObject({ status: 503, body: { error: "pricing_not_configured" } });
    expect(w.payos.requests).toHaveLength(0);
  });

  it.each([
    [{ ...valid, consent: false }, "consent"],
    [{ ...valid, consent: undefined }, "consent"],
    [{ ...valid, email: "không-phải-email" }, "email"],
    [{ ...valid, plan: "pro_forever" }, "plan"],
    [{ ...valid, license_key: "SAI-KEY" }, "license_key"],
  ])("input sai (%j) thì 400", async (body, field) => {
    const res = await makeWorld().call("POST", "/v1/checkout", body);
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_request", field } });
  });

  it("body không phải JSON object thì 400", async () => {
    const w = makeWorld();
    expect((await w.call("POST", "/v1/checkout", "[1,2]")).status).toBe(400);
    expect((await w.call("POST", "/v1/checkout", "{")).status).toBe(400);
  });

  it("đặt số đơn bắt đầu (QĐ18): đơn kế tiếp là 1000001, mô tả MT1000001 đủ 9 ký tự", async () => {
    // Chèn rồi xóa một dòng giữ chỗ: AUTOINCREMENT nhớ số lớn nhất đã dùng.
    await env.DB.exec(reserveSql(1_000_000));
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'orders'").first()).toEqual({ seq: 1_000_000 });
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res.body.order_code).toBe(1_000_001);
    expect(w.payos.requests[0]!.body).toMatchObject({ orderCode: 1_000_001, description: "MT1000001" });
  });

  it("vượt 9.999.999 đơn thì 503 order_code_exhausted, không gọi PayOS", async () => {
    await env.DB.exec(reserveSql(9_999_999));
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res).toMatchObject({ status: 503, body: { error: "order_code_exhausted" } });
    expect(w.payos.requests).toHaveLength(0);
    const row = await env.DB.prepare("SELECT status FROM orders WHERE order_code = 10000000").first();
    expect(row).toEqual({ status: "failed" });
  });

  it("PayOS lỗi thì 502 và đơn chuyển failed", async () => {
    const w = makeWorld();
    w.payos.down = true;
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res).toMatchObject({ status: 502, body: { error: "payment_provider_error" } });
    const row = await env.DB.prepare("SELECT status FROM orders WHERE order_code = 1").first<{ status: string }>();
    expect(row?.status).toBe("failed");
  });

  it("quá 10 lần mỗi giờ từ một IP thì 429 kèm Retry-After", async () => {
    const w = makeWorld();
    for (let i = 0; i < 10; i++) expect((await w.call("POST", "/v1/checkout", valid)).status).toBe(201);
    const res = await w.call("POST", "/v1/checkout", valid);
    expect(res).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(res.headers.get("retry-after")).toBe("3600");
    const other = await w.call("POST", "/v1/checkout", valid, { "cf-connecting-ip": "198.51.100.2" });
    expect(other.status).toBe(201);
  });

  it("trang return và cancel trả HTML", async () => {
    const w = makeWorld();
    const res = await w.app.fetch(new Request("https://license.test/v1/pay/return"), w.env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("quay lại app");
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/checkout.test.ts
```

Expected: FAIL, vì route chưa có (app trả 404):
```
Test Files  1 failed (1)
Tests  14 failed (14)
```
```
AssertionError: expected 404 to be 201 // Object.is equality
```

- [ ] **Step 3: Tạo `server/src/plans.ts`**

`server/src/plans.ts`:

```ts
// Gói Pro và giá (spec §6.8, P1). Giá không nằm trong code mà đọc từ biến PRICES_JSON (Q2).

export const PLANS = { pro_1m: 30, pro_12m: 365 } as const;
export type Plan = keyof typeof PLANS;
/** Hạng quyền trong token; license chỉ quan tâm expires_at, không quan tâm gói đã mua. */
export const LICENSE_PLAN = "pro";

export type Prices = Record<Plan, Record<string, number>>;

export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && Object.hasOwn(PLANS, value);
}

/** Đọc PRICES_JSON; thiếu hoặc sai thì trả null để checkout báo 503 thay vì bán sai giá. */
export function parsePrices(raw: string | undefined): Prices | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const table = parsed as Record<string, unknown>;
  for (const plan of Object.keys(PLANS)) {
    const perCurrency = table[plan];
    if (typeof perCurrency !== "object" || perCurrency === null) return null;
    for (const amount of Object.values(perCurrency)) {
      if (!Number.isSafeInteger(amount) || (amount as number) <= 0) return null;
    }
  }
  return parsed as Prices;
}
```

- [ ] **Step 4: Tạo `server/src/checkout.ts`**

`server/src/checkout.ts`:

```ts
// POST /v1/checkout (§6.8): tạo đơn, gọi cổng thanh toán, trả link, chuỗi VietQR và order_token.
import type { Hono } from "hono";
import type { AppEnv } from "./app";
import { audit } from "./audit";
import { b64urlEncode, randomBytes, sha256Hex } from "./crypto";
import { clientIp, fail, parseEmail, readJson, tooMany } from "./http";
import { normalizeLicenseKey } from "./license-key";
import { isPlan, parsePrices } from "./plans";
import { failureBlock, hit, noteFailure } from "./ratelimit";

/** Link thanh toán hết hạn sau 15 phút (`expiredAt` của PayOS); app hỏi trạng thái tối đa bằng thời gian này. */
export const CHECKOUT_TTL_SECONDS = 15 * 60;
/** Một số ngân hàng chỉ nhận mô tả tối đa 9 ký tự (§14 giả định 7): "MT" + tối đa 7 chữ số. */
export const MAX_ORDER_CODE = 9_999_999;
const CURRENCY = "VND";
/** MVP chỉ bán bằng VND qua PayOS; Giai đoạn 2 chọn cổng theo loại tiền. */
const CHECKOUT_PROVIDER = "payos";

export function registerCheckout(app: Hono<AppEnv>) {
  app.post("/v1/checkout", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const rl = await hit(c.env, "checkout_ip", clientIp(c), now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);

    const body = await readJson(c);
    if (!body) return fail(c, 400, "invalid_request");
    const { plan, license_key: licenseKeyInput, consent } = body;
    const email = parseEmail(body.email);
    if (!isPlan(plan)) return fail(c, 400, "invalid_request", { field: "plan" });
    if (!email) return fail(c, 400, "invalid_request", { field: "email" });
    if (consent !== true) return fail(c, 400, "invalid_request", { field: "consent" });

    const amount = parsePrices(c.env.PRICES_JSON)?.[plan]?.[CURRENCY];
    if (amount === undefined) return fail(c, 503, "pricing_not_configured");

    let renewLicenseId: string | null = null;
    if (licenseKeyInput !== undefined) {
      const wait = await failureBlock(c.env, clientIp(c), now);
      if (wait > 0) return tooMany(c, wait);
      const key = typeof licenseKeyInput === "string" ? normalizeLicenseKey(licenseKeyInput) : null;
      if (!key) {
        await noteFailure(c.env, clientIp(c), now, "checkout");
        return fail(c, 400, "invalid_request", { field: "license_key" });
      }
      const lic = await db
        .prepare("SELECT id, revoked_at FROM licenses WHERE license_key = ?")
        .bind(key)
        .first<{ id: string; revoked_at: number | null }>();
      if (!lic) {
        await noteFailure(c.env, clientIp(c), now, "checkout");
        return fail(c, 404, "invalid_key");
      }
      if (lic.revoked_at !== null) return fail(c, 403, "license_revoked");
      renewLicenseId = lic.id;
    }

    const orderToken = b64urlEncode(randomBytes(32));
    const expiresAt = now + CHECKOUT_TTL_SECONDS;
    const row = await db
      .prepare(
        `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email, email_consent_at,
                             renew_license_id, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING order_code`,
      )
      .bind(await sha256Hex(orderToken), CHECKOUT_PROVIDER, plan, amount, CURRENCY, email, now, renewLicenseId, now, expiresAt)
      .first<{ order_code: number }>();
    if (!row) throw new Error("không tạo được đơn");
    const orderCode = row.order_code;
    if (orderCode > MAX_ORDER_CODE) {
      await db.prepare("UPDATE orders SET status = 'failed' WHERE order_code = ?").bind(orderCode).run();
      console.error(JSON.stringify({ event: "order_code_exhausted", order_code: orderCode }));
      return fail(c, 503, "order_code_exhausted");
    }

    const origin = new URL(c.req.url).origin;
    let checkout;
    try {
      checkout = await deps.payments[CHECKOUT_PROVIDER]!.createCheckout({
        orderCode,
        amount,
        currency: CURRENCY,
        description: `MT${orderCode}`,
        returnUrl: `${origin}/v1/pay/return`,
        cancelUrl: `${origin}/v1/pay/cancel`,
        expiresAt,
      });
    } catch (err) {
      await db.prepare("UPDATE orders SET status = 'failed' WHERE order_code = ?").bind(orderCode).run();
      console.error(JSON.stringify({ event: "checkout_failed", order_code: orderCode, error: String(err) }));
      return fail(c, 502, "payment_provider_error");
    }
    await db.prepare("UPDATE orders SET provider_ref = ? WHERE order_code = ?").bind(checkout.providerRef, orderCode).run();
    await audit(db, {
      at: now,
      actor: "api",
      action: "order_created",
      licenseId: renewLicenseId,
      orderCode,
      detail: { plan, amount, currency: CURRENCY },
    });
    return c.json(
      {
        order_code: orderCode,
        order_token: orderToken,
        checkout_url: checkout.checkoutUrl,
        qr_code: checkout.qrCode,
        amount,
        currency: CURRENCY,
        expires_at: expiresAt,
      },
      201,
    );
  });

  // Trang PayOS chuyển về sau khi trả tiền hoặc hủy. App không dựa vào trang này mà tự hỏi trạng thái đơn.
  const page = (vi: string, en: string) =>
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Meeting Translator</title><p>${vi}</p><p>${en}</p>`;
  app.get("/v1/pay/return", (c) =>
    c.html(page("Đã nhận thanh toán. Hãy quay lại app, app sẽ tự kích hoạt.", "Payment received. Return to the app; it activates automatically.")),
  );
  app.get("/v1/pay/cancel", (c) =>
    c.html(page("Đã hủy thanh toán. Bạn có thể đóng trang này.", "Payment cancelled. You can close this page.")),
  );
}
```

- [ ] **Step 5: Thay `server/src/app.ts`: gắn `registerCheckout`**

`server/src/app.ts`:

```ts
// Worker API công khai (spec §6.8). Route nhận phụ thuộc qua `deps` để test thay được PayOS, Resend, đồng hồ.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { registerCheckout } from "./checkout";
import { type Deps, type DepsFactory, realDeps } from "./deps";
import type { ApiEnv } from "./env";
import { fail } from "./http";

export type AppEnv = { Bindings: ApiEnv; Variables: { deps: Deps } };

export function createApp(makeDeps: DepsFactory = realDeps) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    // Chỉ HTTPS (§10.2). Chạy cục bộ và test (ENVIRONMENT=dev) thì bỏ qua.
    if (c.env.ENVIRONMENT !== "dev" && new URL(c.req.url).protocol !== "https:") return fail(c, 403, "forbidden");
    c.set("deps", makeDeps(c.env));
    await next();
  });
  app.use("/v1/*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => fail(c, 413, "invalid_request") }));
  app.get("/v1/health", (c) => c.json({ ok: true }));
  registerCheckout(app);
  app.notFound((c) => fail(c, 404, "not_found"));
  app.onError((err, c) => {
    console.error(JSON.stringify({ event: "unhandled", name: err.name, message: err.message }));
    return fail(c, 500, "internal");
  });
  return app;
}
```

- [ ] **Step 6: Chạy test và typecheck**

```bash
cd server && pnpm exec vitest run test/checkout.test.ts && pnpm typecheck
```

Expected:
```
Test Files  1 passed (1)
Tests  14 passed (14)
```

- [ ] **Step 7: Commit**

```bash
git add server/src/plans.ts server/src/checkout.ts server/src/app.ts server/test/checkout.test.ts
git commit -m "feat(server): POST /v1/checkout tạo đơn và link VietQR của PayOS, giá đọc từ cấu hình, trần số đơn" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 13: Webhook, hỏi trạng thái đơn, cấp và gia hạn idempotent, gửi lại email

**Files:**
- Create: `server/test/orders.test.ts`, `server/src/orders.ts`
- Modify: `server/test/world.ts` (thay toàn bộ: thêm `buy()` và `getOrder()`), `server/src/app.ts` (thay toàn bộ)

- [ ] **Step 1: Thay `server/test/world.ts`: thêm `buy()` (checkout, khách trả đủ, webhook) và `getOrder()` (token trong header `Authorization`, QĐ25)**

`server/test/world.ts`:

```ts
// Dựng app với đồng hồ giả, PayOS giả, Resend giả và khóa ký test-1 của vector.
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createApp } from "../src/app";
import type { Deps } from "../src/deps";
import { ResendEmailProvider } from "../src/email/resend";
import type { ApiEnv } from "../src/env";
import { PayOSProvider } from "../src/payment/payos";
import { importSigningKey } from "../src/token";
import { FakePayOS, FakeResend, TEST_CHECKSUM_KEY } from "./fakes";
import { testSigningJwk } from "./keys";

/** 2026-10-01T00:00:00Z */
export const T0 = 1_790_812_800;
export const DAY = 86400;

export interface CallResult {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
  const clock = { now: T0 };
  const payos = new FakePayOS();
  const resend = new FakeResend();
  const deps: Deps = {
    now: () => clock.now,
    payments: {
      payos: new PayOSProvider(
        { baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: TEST_CHECKSUM_KEY },
        payos.fetch,
      ),
    },
    email: new ResendEmailProvider({ apiKey: "re_test", from: "MT <noreply@mt.test>" }, resend.fetch),
    signingKey: async () => importSigningKey(await testSigningJwk("test-1")),
  };
  const app = createApp(() => deps);
  const testEnv: ApiEnv = { ...env, ...envOverride };

  async function call(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<CallResult> {
    const init: RequestInit = {
      method,
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10", ...headers },
    };
    if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`https://license.test${path}`, init), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { text };
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  /** Mua trọn một đơn: checkout, khách trả đủ tiền, PayOS gửi webhook. Trả về key đã cấp. */
  async function buy(opts: { plan?: string; email?: string; licenseKey?: string } = {}) {
    const req: Record<string, unknown> = {
      plan: opts.plan ?? "pro_1m",
      email: opts.email ?? "buyer@example.com",
      consent: true,
    };
    if (opts.licenseKey) req.license_key = opts.licenseKey;
    const co = await call("POST", "/v1/checkout", req);
    if (co.status !== 201) throw new Error(`checkout ${co.status} ${JSON.stringify(co.body)}`);
    const orderCode = co.body.order_code as number;
    payos.pay(orderCode);
    const wh = await call("POST", "/v1/webhooks/payos", await payos.webhookBody(orderCode));
    if (wh.status !== 200) throw new Error(`webhook ${wh.status}`);
    const order = await getOrder(orderCode, co.body.order_token as string);
    return { orderCode, orderToken: co.body.order_token as string, licenseKey: order.body.license_key as string };
  }

  /** App hỏi trạng thái đơn: order_token trong header Authorization. */
  function getOrder(orderCode: number | string, token: string) {
    return call("GET", `/v1/orders/${orderCode}`, undefined, { authorization: `Bearer ${token}` });
  }

  return { clock, payos, resend, deps, app, env: testEnv, call, buy, getOrder };
}
```

- [ ] **Step 2: Viết test `server/test/orders.test.ts`**

`server/test/orders.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { hmacSha256Hex } from "../src/crypto";
import { objectSignatureData } from "../src/payment/payos";
import { resetDb } from "./db";
import { FakeGateway, TEST_CHECKSUM_KEY } from "./fakes";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

/** Key đúng định dạng (ký tự kiểm tra đúng) nhưng không có trong D1. */
const UNKNOWN_KEY = "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5";

async function checkout(w: ReturnType<typeof makeWorld>, extra: Record<string, unknown> = {}) {
  const res = await w.call("POST", "/v1/checkout", { plan: "pro_1m", email: "buyer@example.com", consent: true, ...extra });
  return { orderCode: res.body.order_code as number, token: res.body.order_token as string };
}

const licenseCount = async () =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses").first<{ n: number }>())?.n;
const orderRow = (orderCode: number) =>
  env.DB.prepare("SELECT status, amount_paid FROM orders WHERE order_code = ?").bind(orderCode).first();

describe("webhook PayOS", () => {
  it("đơn đã trả đủ: cấp license 30 ngày, gửi email có key, app thấy key khi hỏi đơn", async () => {
    const w = makeWorld();
    const { orderCode, token } = await checkout(w);
    const pending = await w.getOrder(orderCode, token);
    expect(pending.body).toEqual({
      order_code: orderCode,
      status: "pending",
      plan: "pro_1m",
      amount: 2000,
      currency: "VND",
      expires_at: T0 + 900,
    });

    w.clock.now = T0 + 120;
    w.payos.pay(orderCode);
    const wh = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(wh).toMatchObject({ status: 200, body: { ok: true, result: "granted" } });
    // Server hỏi lại PayOS trước khi cấp.
    expect(w.payos.requests.at(-1)).toMatchObject({ method: "GET", path: `/v2/payment-requests/${orderCode}` });

    const paid = await w.getOrder(orderCode, token);
    expect(paid.body).toMatchObject({ status: "paid", renewal: false, license_expires_at: T0 + 120 + 30 * DAY });
    const key = paid.body.license_key as string;
    expect(key).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/);

    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]).toMatchObject({ to: ["buyer@example.com"], idempotencyKey: `dev-order-${orderCode}` });
    expect(w.resend.sent[0]!.text).toContain(key);
    const order = await env.DB.prepare("SELECT email_sent_at, amount_paid FROM orders").first();
    expect(order).toEqual({ email_sent_at: T0 + 120, amount_paid: 2000 });
  });

  it("webhook gửi trùng cùng lúc: chỉ cấp một lần, một email", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    const results = await Promise.all([1, 2, 3].map(() => w.call("POST", "/v1/webhooks/payos", body)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.filter((r) => r.body.result === "granted")).toHaveLength(1);
    expect(await licenseCount()).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
    const logs = await env.DB.prepare("SELECT action FROM audit_log WHERE action = 'license_issued'").all();
    expect(logs.results).toHaveLength(1);
  });

  it("sai chữ ký thì 400, không gọi PayOS, không cấp, có cảnh báo", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    const before = w.payos.requests.length;
    const res = await w.call("POST", "/v1/webhooks/payos", { ...body, signature: "f".repeat(64) });
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_signature" } });
    expect(w.payos.requests.length).toBe(before);
    expect(await licenseCount()).toBe(0);
    const alert = await env.DB.prepare("SELECT kind, count FROM ops_alerts").first();
    expect(alert).toEqual({ kind: "webhook_bad_signature", count: 1 });
  });

  it("webhook đúng chữ ký nhưng PayOS báo chưa trả thì không cấp (chặn webhook giả mạo số tiền)", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(res.body).toEqual({ ok: true, result: "not_paid" });
    expect(await licenseCount()).toBe(0);
  });

  it("webhook mẫu khi đăng ký confirm-webhook (orderCode lạ) vẫn trả 200", async () => {
    const w = makeWorld();
    const data = { orderCode: 123, amount: 3000, description: "VQRIO123", code: "00", desc: "Thành công" };
    const body = { code: "00", desc: "success", success: true, data, signature: await hmacSha256Hex(TEST_CHECKSUM_KEY, objectSignatureData(data)) };
    const res = await w.call("POST", "/v1/webhooks/payos", body);
    expect(res).toMatchObject({ status: 200, body: { ok: true, result: "unknown_order" } });
  });

  it("chuyển thiếu (PayOS báo UNDERPAID): không cấp, đơn thành underpaid, ghi nhật ký", async () => {
    const w = makeWorld();
    const { orderCode, token } = await checkout(w);
    w.payos.pay(orderCode, 1500);
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 1500));
    expect(res.body).toEqual({ ok: true, result: "not_paid" });
    const order = await w.getOrder(orderCode, token);
    expect(order.body.status).toBe("underpaid");
    expect(order.body.license_key).toBeUndefined();
    const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'order_underpaid'").first<{ detail: string }>();
    expect(JSON.parse(log!.detail)).toEqual({ amount: 2000, provider_amount: 2000, amount_paid: 1500 });
  });

  it("PayOS báo PAID nhưng amountPaid < amount: không cấp, đơn thành underpaid", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode, 1999);
    w.payos.setStatus(orderCode, "PAID");
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(res.body).toEqual({ ok: true, result: "not_paid" });
    expect(await licenseCount()).toBe(0);
    expect(await orderRow(orderCode)).toEqual({ status: "underpaid", amount_paid: 1999 });
  });

  it("amountPaid đủ nhưng status chưa phải PAID (PROCESSING): không cấp", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode);
    w.payos.setStatus(orderCode, "PROCESSING");
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(res.body).toEqual({ ok: true, result: "not_paid" });
    expect(await licenseCount()).toBe(0);
    expect(await orderRow(orderCode)).toEqual({ status: "processing", amount_paid: 2000 });
  });

  it("amount của PayOS khác amount của đơn: không cấp, đơn thành failed, ghi nhật ký", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.setAmount(orderCode, 1000);
    w.payos.pay(orderCode);
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(res.body).toEqual({ ok: true, result: "not_paid" });
    expect(await licenseCount()).toBe(0);
    expect(await orderRow(orderCode)).toEqual({ status: "failed", amount_paid: 1000 });
    const log = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'order_amount_mismatch'").first<{ detail: string }>();
    expect(JSON.parse(log!.detail)).toEqual({ amount: 2000, provider_amount: 1000, amount_paid: 1000 });
  });

  it("PayOS không trả lời thì 503 để PayOS gửi lại", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    w.payos.down = true;
    const res = await w.call("POST", "/v1/webhooks/payos", body);
    expect(res).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
    expect(await licenseCount()).toBe(0);
  });

  it("email lỗi vẫn cấp license; email_sent_at để trống; có cảnh báo email_failed", async () => {
    const w = makeWorld();
    w.resend.down = true;
    const { orderCode } = await checkout(w);
    w.payos.pay(orderCode);
    const res = await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(res.body.result).toBe("granted");
    const row = await env.DB.prepare("SELECT email_sent_at FROM orders").first<{ email_sent_at: number | null }>();
    expect(row?.email_sent_at).toBeNull();
    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "email_failed" });
  });

  it("cổng lạ ở /v1/webhooks/{provider} thì 404", async () => {
    const w = makeWorld();
    expect((await w.call("POST", "/v1/webhooks/khongco", {})).status).toBe(404);
    expect((await w.call("POST", "/v1/webhooks/constructor", {})).status).toBe(404);
  });

  it("webhook chọn cổng theo URL; fulfil hỏi đúng cổng ghi ở orders.provider", async () => {
    const w = makeWorld();
    const gw = new FakeGateway();
    w.deps.payments.fakepay = gw;
    const { orderCode } = await checkout(w);
    await env.DB.prepare("UPDATE orders SET provider = 'fakepay' WHERE order_code = ?").bind(orderCode).run();
    gw.paid.add(orderCode);
    const res = await w.call("POST", "/v1/webhooks/fakepay", { secret: "fakepay-ok", orderCode });
    expect(res.body).toEqual({ ok: true, result: "granted" });
    expect(gw.statusCalls).toEqual([orderCode]);
    // PayOS không bị hỏi về đơn của cổng khác.
    expect(w.payos.requests.filter((r) => r.method === "GET")).toHaveLength(0);
  });
});

describe("checkout gia hạn", () => {
  const valid = { plan: "pro_1m", email: "buyer@example.com", consent: true };

  it("gia hạn: gắn đơn với license đang có", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    const res = await w.call("POST", "/v1/checkout", { ...valid, license_key: licenseKey });
    expect(res.status).toBe(201);
    const row = await env.DB.prepare("SELECT renew_license_id FROM orders WHERE order_code = ?")
      .bind(res.body.order_code)
      .first<{ renew_license_id: string }>();
    const lic = await env.DB.prepare("SELECT id FROM licenses").first<{ id: string }>();
    expect(row?.renew_license_id).toBe(lic?.id);
  });

  it("gia hạn key không tồn tại thì 404, key đã thu hồi thì 403", async () => {
    const w = makeWorld();
    const unknown = await w.call("POST", "/v1/checkout", { ...valid, license_key: UNKNOWN_KEY });
    expect(unknown).toMatchObject({ status: 404, body: { error: "invalid_key" } });
    const { licenseKey } = await w.buy();
    await env.DB.prepare("UPDATE licenses SET revoked_at = 1").run();
    const revoked = await w.call("POST", "/v1/checkout", { ...valid, license_key: licenseKey });
    expect(revoked).toMatchObject({ status: 403, body: { error: "license_revoked" } });
  });
});

describe("gia hạn tính từ max(hôm nay, ngày hết hạn)", () => {
  it("license còn hạn 10 ngày: cộng 365 ngày vào ngày hết hạn", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    const expiresAt = T0 + 30 * DAY;
    w.clock.now = expiresAt - 10 * DAY;
    const { orderCode, token } = await checkout(w, { plan: "pro_12m", license_key: licenseKey });
    w.payos.pay(orderCode);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    const order = await w.getOrder(orderCode, token);
    expect(order.body).toMatchObject({ status: "paid", renewal: true, license_key: licenseKey });
    expect(order.body.license_expires_at).toBe(expiresAt + 365 * DAY);
    expect(await licenseCount()).toBe(1);
    expect(w.resend.sent.at(-1)!.subject).toContain("gia hạn");
  });

  it("license đã hết hạn 5 ngày: cộng 30 ngày từ bây giờ", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    w.clock.now = T0 + 35 * DAY;
    const { orderCode, token } = await checkout(w, { license_key: licenseKey });
    w.payos.pay(orderCode);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    const order = await w.getOrder(orderCode, token);
    expect(order.body.license_expires_at).toBe(T0 + 35 * DAY + 30 * DAY);
  });
});

describe("GET /v1/orders/{order_code}", () => {
  it("scheme Bearer không phân biệt hoa thường", async () => {
    const w = makeWorld();
    const { orderCode, token } = await checkout(w);
    for (const scheme of ["Bearer", "bearer", "BEARER"]) {
      const res = await w.call("GET", `/v1/orders/${orderCode}`, undefined, { authorization: `${scheme} ${token}` });
      expect(res).toMatchObject({ status: 200, body: { order_code: orderCode, status: "pending" } });
    }
  });

  it("sai token, thiếu token, token trong query hay orderCode lạ đều trả 404 như nhau", async () => {
    const w = makeWorld();
    const { orderCode, token } = await checkout(w);
    const wrong = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    for (const res of [
      await w.getOrder(orderCode, wrong),
      await w.call("GET", `/v1/orders/${orderCode}`),
      await w.call("GET", `/v1/orders/${orderCode}?token=${token}`),
      await w.getOrder(999, token),
      await w.getOrder("abc", token),
    ]) {
      expect(res).toMatchObject({ status: 404, body: { error: "order_not_found" } });
    }
  });
});
```

- [ ] **Step 3: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/orders.test.ts
```

Expected: FAIL. Test duy nhất qua là `cổng lạ ở /v1/webhooks/{provider} thì 404`, vì khi chưa có route thì mọi đường dẫn đều trả 404.
```
Test Files  1 failed (1)
Tests  18 failed | 1 passed (19)
```
```
AssertionError: expected { error: 'not_found' } to deeply equal { order_code: 1, …(5) }
```

- [ ] **Step 4: Tạo `server/src/orders.ts`**

`server/src/orders.ts`:

```ts
// Vòng đời đơn hàng sau khi tạo (§6.8, §9): webhook của cổng thanh toán, app hỏi trạng thái,
// cấp hoặc gia hạn license, gửi lại email chưa gửi được.
import type { Hono } from "hono";
import { raiseAlert } from "./alerts";
import type { AppEnv } from "./app";
import { audit } from "./audit";
import { sha256Hex, timingSafeEqual } from "./crypto";
import { type Deps, sendLicenseMail } from "./deps";
import { clientIp, fail, tooMany } from "./http";
import { formatLicenseKey, generateLicenseKey } from "./license-key";
import { isPlan, LICENSE_PLAN, PLANS } from "./plans";
import { hit } from "./ratelimit";

export interface OrderRow {
  order_code: number;
  provider: string;
  status: string;
  plan: string;
  amount: number;
  amount_paid: number;
  currency: string;
  email: string | null;
  renew_license_id: string | null;
  license_id: string | null;
}

export interface Granted {
  licenseId: string;
  licenseKey: string;
  expiresAt: number;
  renewal: boolean;
}

export async function loadOrder(db: D1Database, orderCode: number): Promise<OrderRow | null> {
  return db
    .prepare(
      `SELECT order_code, provider, status, plan, amount, amount_paid, currency, email, renew_license_id, license_id
       FROM orders WHERE order_code = ?`,
    )
    .bind(orderCode)
    .first<OrderRow>();
}

/**
 * Cấp license mới, hoặc gia hạn license cũ từ max(bây giờ, ngày hết hạn), rồi đánh dấu đơn đã trả tiền.
 * Mọi câu lệnh chạy trong một batch (một transaction của D1) và đều có điều kiện "đơn chưa paid",
 * nên webhook gửi trùng, đối soát và admin chạy cùng lúc thì chỉ một lần có tác dụng.
 * Trả về null nếu đơn đã được cấp từ trước.
 */
export async function grantOrder(
  db: D1Database,
  order: OrderRow,
  opts: { now: number; amountPaid: number; actor: string },
): Promise<Granted | null> {
  if (!isPlan(order.plan)) throw new Error(`gói lạ trong đơn ${order.order_code}`);
  const addSeconds = PLANS[order.plan] * 86400;
  const unpaid = "EXISTS (SELECT 1 FROM orders WHERE order_code = ?1 AND status <> 'paid')";
  const renewal = order.renew_license_id !== null;
  const licenseId = order.renew_license_id ?? crypto.randomUUID();
  const first = renewal
    ? db
        .prepare(`UPDATE licenses SET expires_at = MAX(expires_at, ?2) + ?3 WHERE id = ?4 AND ${unpaid}`)
        .bind(order.order_code, opts.now, addSeconds, licenseId)
    : db
        .prepare(
          `INSERT INTO licenses (id, license_key, email, plan, expires_at, created_at)
           SELECT ?2, ?3, ?4, ?5, ?6 + ?7, ?6 WHERE ${unpaid}`,
        )
        .bind(order.order_code, licenseId, generateLicenseKey(), order.email, LICENSE_PLAN, opts.now, addSeconds);
  const markPaid = db
    .prepare(
      `UPDATE orders SET status = 'paid', paid_at = ?2, amount_paid = ?3, license_id = ?4, last_checked_at = ?2
       WHERE order_code = ?1 AND status <> 'paid'`,
    )
    .bind(order.order_code, opts.now, opts.amountPaid, licenseId);
  const results = await db.batch([first, markPaid]);
  if (results[1]?.meta.changes !== 1) return null;
  const lic = await db
    .prepare("SELECT license_key, expires_at FROM licenses WHERE id = ?")
    .bind(licenseId)
    .first<{ license_key: string; expires_at: number }>();
  if (!lic) throw new Error(`không thấy license ${licenseId} sau khi cấp`);
  await audit(db, {
    at: opts.now,
    actor: opts.actor,
    action: renewal ? "license_extended" : "license_issued",
    licenseId,
    orderCode: order.order_code,
    detail: { plan: order.plan, expires_at: lic.expires_at, amount_paid: opts.amountPaid },
  });
  return { licenseId, licenseKey: lic.license_key, expiresAt: lic.expires_at, renewal };
}

/** Giãn thời gian giữa các lần gửi lại sau lỗi tạm: 5 phút, 15 phút, 1 giờ, rồi mỗi 6 giờ (trong 24 giờ). */
export function emailRetryDelay(attempts: number): number {
  return [300, 900, 3600][attempts - 1] ?? 21600;
}

/**
 * Gửi email sau khi cấp; idempotency key theo đơn để Resend không gửi hai lần (kể cả khi cron gửi lại).
 * Lỗi tạm (401, 403, 409, 429, 5xx, mạng) thì hẹn lần gửi lại; lỗi vĩnh viễn (400, 422) thì thôi.
 * Cảnh báo email_failed chỉ tạo ở lần lỗi đầu của mỗi đơn.
 */
export async function mailGranted(
  db: D1Database,
  deps: Pick<Deps, "now" | "email">,
  envName: string,
  order: Pick<OrderRow, "order_code" | "email">,
  g: Granted,
) {
  if (!order.email) return;
  const prev = await db
    .prepare("SELECT email_attempts FROM orders WHERE order_code = ?")
    .bind(order.order_code)
    .first<{ email_attempts: number }>();
  const attempts = (prev?.email_attempts ?? 0) + 1;
  const res = await sendLicenseMail(
    db,
    deps,
    order.email,
    g.renewal ? "renewal" : "purchase",
    [{ licenseKey: g.licenseKey, expiresAt: g.expiresAt }],
    { idempotencyKey: `${envName}-order-${order.order_code}`, alert: attempts === 1 },
  );
  const now = deps.now();
  let update: D1PreparedStatement;
  if (res.ok) {
    update = db
      .prepare("UPDATE orders SET email_attempts = ?, email_sent_at = ?, email_retry_at = NULL WHERE order_code = ?")
      .bind(attempts, now, order.order_code);
  } else if (res.permanent) {
    update = db
      .prepare("UPDATE orders SET email_attempts = ?, email_gave_up_at = ?, email_retry_at = NULL WHERE order_code = ?")
      .bind(attempts, now, order.order_code);
  } else {
    update = db
      .prepare("UPDATE orders SET email_attempts = ?, email_retry_at = ? WHERE order_code = ?")
      .bind(attempts, now + emailRetryDelay(attempts), order.order_code);
  }
  await update.run();
}

export type FulfilResult = "granted" | "already_paid" | "not_paid" | "unknown_order";

/**
 * Hỏi cổng thanh toán của đơn (orders.provider) trạng thái thật rồi xử lý (§6.8): chỉ cấp khi status paid,
 * amountPaid ≥ amount và amount khớp đơn. Dùng chung cho webhook và đối soát. Lỗi mạng thì ném cho bên gọi.
 */
export async function fulfilOrder(
  env: { DB: D1Database; ENVIRONMENT: string },
  deps: Deps,
  orderCode: number,
  actor: string,
): Promise<FulfilResult> {
  const order = await loadOrder(env.DB, orderCode);
  if (!order) return "unknown_order";
  if (order.status === "paid") return "already_paid";
  const provider = Object.hasOwn(deps.payments, order.provider) ? deps.payments[order.provider] : undefined;
  if (!provider) throw new Error(`không có cổng thanh toán ${order.provider}`);
  const now = deps.now();
  const st = await provider.getPaymentStatus(orderCode);
  const amountMatches = st.amount === order.amount;
  if (amountMatches && st.status === "paid" && st.amountPaid >= st.amount) {
    const granted = await grantOrder(env.DB, order, { now, amountPaid: st.amountPaid, actor });
    if (!granted) return "already_paid";
    await mailGranted(env.DB, deps, env.ENVIRONMENT, order, granted);
    return "granted";
  }
  // Số tiền của cổng khác số tiền của đơn là bất thường: không cấp, để người vận hành xem (admin cấp tay nếu đúng).
  const local = !amountMatches ? "failed" : st.status === "paid" ? "underpaid" : st.status;
  const changed = await env.DB.prepare(
    "UPDATE orders SET status = ?2, amount_paid = ?3, last_checked_at = ?4 WHERE order_code = ?1 AND status <> 'paid'",
  )
    .bind(orderCode, local, st.amountPaid, now)
    .run();
  const action = !amountMatches ? "order_amount_mismatch" : local === "underpaid" ? "order_underpaid" : null;
  if (action && changed.meta.changes === 1 && (order.status !== local || order.amount_paid !== st.amountPaid)) {
    if (!amountMatches) console.warn(JSON.stringify({ event: "order_amount_mismatch", order_code: orderCode }));
    await audit(env.DB, {
      at: now,
      actor,
      action,
      orderCode,
      detail: { amount: order.amount, provider_amount: st.amount, amount_paid: st.amountPaid },
    });
  }
  return "not_paid";
}

/** Cron gửi lại email mua hàng gặp lỗi tạm, tới hạn hẹn, trong 24 giờ sau khi trả tiền, tối đa 20 đơn mỗi lần. */
export async function retryUnsentEmails(env: { DB: D1Database; ENVIRONMENT: string }, deps: Deps): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT o.order_code, o.email, o.renew_license_id, l.id AS license_id, l.license_key, l.expires_at
     FROM orders o JOIN licenses l ON l.id = o.license_id
     -- email_gave_up_at IS NULL là lớp phòng thủ: đơn đã thôi gửi luôn có email_retry_at NULL và email_attempts > 0.
     WHERE o.status = 'paid' AND o.email IS NOT NULL AND o.email_sent_at IS NULL AND o.email_gave_up_at IS NULL
       AND o.paid_at >= ?1 - 86400
       -- Đã hẹn gửi lại và tới hạn; hoặc chưa thử lần nào sau 5 phút (Worker dừng giữa lúc cấp và gửi).
       -- Không đụng đơn vừa cấp mà thư đang được gửi, để không gửi hai lần.
       AND ((o.email_retry_at IS NOT NULL AND o.email_retry_at <= ?1) OR (o.email_attempts = 0 AND o.paid_at <= ?1 - 300))
     ORDER BY o.paid_at LIMIT 20`,
  )
    .bind(deps.now())
    .all<{
      order_code: number;
      email: string;
      renew_license_id: string | null;
      license_id: string;
      license_key: string;
      expires_at: number;
    }>();
  for (const r of results) {
    await mailGranted(env.DB, deps, env.ENVIRONMENT, r, {
      licenseId: r.license_id,
      licenseKey: r.license_key,
      expiresAt: r.expires_at,
      renewal: r.renew_license_id !== null,
    });
  }
  return results.length;
}

export function registerOrders(app: Hono<AppEnv>) {
  // Một endpoint webhook cho mỗi cổng: /v1/webhooks/payos, …; thêm cổng không phải sửa file này.
  app.post("/v1/webhooks/:provider", async (c) => {
    const deps = c.get("deps");
    const name = c.req.param("provider");
    const provider = Object.hasOwn(deps.payments, name) ? deps.payments[name] : undefined;
    if (!provider) return fail(c, 404, "not_found");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 400, "invalid_request");
    }
    const event = await provider.verifyWebhook(body);
    if (!event) {
      console.warn(JSON.stringify({ event: "webhook_bad_signature", provider: provider.name }));
      await raiseAlert(c.env.DB, "webhook_bad_signature", deps.now());
      return fail(c, 400, "invalid_signature");
    }
    try {
      const result = await fulfilOrder(c.env, deps, event.orderCode, "webhook");
      return c.json({ ok: true, result });
    } catch (err) {
      // Cổng gửi lại webhook khi nhận mã khác 2xx; đối soát mỗi 5 phút cũng sẽ xử lý đơn này.
      console.error(JSON.stringify({ event: "webhook_fulfil_failed", order_code: event.orderCode, error: String(err) }));
      return fail(c, 503, "temporarily_unavailable");
    }
  });

  // order_token đi trong header Authorization, không nằm trong URL, để không lọt vào log hay lịch sử (QĐ25).
  app.get("/v1/orders/:orderCode", async (c) => {
    const deps = c.get("deps");
    const orderCode = Number(c.req.param("orderCode"));
    // Scheme "Bearer" không phân biệt hoa thường (RFC 9110, mục 11.1).
    const token = /^bearer +([A-Za-z0-9_-]{43})$/i.exec(c.req.header("authorization") ?? "")?.[1];
    if (!Number.isSafeInteger(orderCode) || orderCode <= 0 || !token) return fail(c, 404, "order_not_found");
    const rl = await hit(c.env, "order_poll", `${clientIp(c)}|${orderCode}`, deps.now());
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    const row = await c.env.DB.prepare(
      `SELECT o.order_code, o.order_token_hash, o.status, o.plan, o.amount, o.currency, o.expires_at,
              o.renew_license_id, l.license_key, l.expires_at AS license_expires_at
       FROM orders o LEFT JOIN licenses l ON l.id = o.license_id WHERE o.order_code = ?`,
    )
      .bind(orderCode)
      .first<{
        order_code: number;
        order_token_hash: string;
        status: string;
        plan: string;
        amount: number;
        currency: string;
        expires_at: number;
        renew_license_id: string | null;
        license_key: string | null;
        license_expires_at: number | null;
      }>();
    if (!row || !timingSafeEqual(row.order_token_hash, await sha256Hex(token))) return fail(c, 404, "order_not_found");
    const res: Record<string, unknown> = {
      order_code: row.order_code,
      status: row.status,
      plan: row.plan,
      amount: row.amount,
      currency: row.currency,
      expires_at: row.expires_at,
    };
    if (row.status === "paid" && row.license_key) {
      res.license_key = formatLicenseKey(row.license_key);
      res.license_expires_at = row.license_expires_at;
      res.renewal = row.renew_license_id !== null;
    }
    return c.json(res);
  });
}
```

- [ ] **Step 5: Thay `server/src/app.ts`: gắn thêm `registerOrders`**

`server/src/app.ts`:

```ts
// Worker API công khai (spec §6.8). Route nhận phụ thuộc qua `deps` để test thay được PayOS, Resend, đồng hồ.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { registerCheckout } from "./checkout";
import { type Deps, type DepsFactory, realDeps } from "./deps";
import type { ApiEnv } from "./env";
import { fail } from "./http";
import { registerOrders } from "./orders";

export type AppEnv = { Bindings: ApiEnv; Variables: { deps: Deps } };

export function createApp(makeDeps: DepsFactory = realDeps) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    // Chỉ HTTPS (§10.2). Chạy cục bộ và test (ENVIRONMENT=dev) thì bỏ qua.
    if (c.env.ENVIRONMENT !== "dev" && new URL(c.req.url).protocol !== "https:") return fail(c, 403, "forbidden");
    c.set("deps", makeDeps(c.env));
    await next();
  });
  app.use("/v1/*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => fail(c, 413, "invalid_request") }));
  app.get("/v1/health", (c) => c.json({ ok: true }));
  registerCheckout(app);
  registerOrders(app);
  app.notFound((c) => fail(c, 404, "not_found"));
  app.onError((err, c) => {
    console.error(JSON.stringify({ event: "unhandled", name: err.name, message: err.message }));
    return fail(c, 500, "internal");
  });
  return app;
}
```

- [ ] **Step 6: Chạy test và typecheck**

```bash
cd server && pnpm exec vitest run test/orders.test.ts && pnpm typecheck
```

Expected:
```
Test Files  1 passed (1)
Tests  19 passed (19)
```

- [ ] **Step 7: Commit**

```bash
git add server/src/orders.ts server/src/app.ts server/test/orders.test.ts server/test/world.ts
git commit -m "feat(server): webhook theo cổng thanh toán, hỏi trạng thái đơn, cấp và gia hạn license idempotent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 14: Kích hoạt, làm mới token, gỡ máy, khôi phục key

**Files:**
- Create: `server/test/licenses.test.ts`, `server/test/recover.test.ts`, `server/src/licenses.ts`
- Modify: `server/src/app.ts` (thay toàn bộ)

- [ ] **Step 1: Viết test `server/test/licenses.test.ts`**

`server/test/licenses.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto";
import { verifyToken } from "../src/token";
import { resetDb } from "./db";
import vectors from "./vectors/token-v1.json";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

const device = async (n: number) => sha256Hex(`device-${n}`);
/** Key đúng định dạng (ký tự kiểm tra đúng) nhưng không có trong D1. */
const UNKNOWN_KEY = "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5";

async function setup() {
  const w = makeWorld();
  const { licenseKey } = await w.buy();
  const activate = async (n: number, ip = `198.51.100.${n}`) =>
    w.call(
      "POST",
      "/v1/licenses/activate",
      { key: licenseKey, device_id_hash: await device(n), device_label: `Máy ${n}` },
      { "cf-connecting-ip": ip },
    );
  const deactivate = (activationId: string) =>
    w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: activationId });
  return { w, licenseKey, activate, deactivate };
}

describe("activate", () => {
  it("trả token Ed25519 kiểm được bằng khóa công khai, đúng các trường của §6.8", async () => {
    const { w, activate } = await setup();
    w.clock.now = T0 + 60;
    const res = await activate(1);
    expect(res.status).toBe(200);
    const lic = await env.DB.prepare("SELECT id, expires_at FROM licenses").first<{ id: string; expires_at: number }>();
    expect(res.body).toMatchObject({ expires_at: lic!.expires_at, refresh_before: T0 + 60 + 14 * DAY });
    const verified = await verifyToken(res.body.token as string, vectors.public_keys, {
      now: T0 + 120,
      deviceIdHash: await device(1),
    });
    expect(verified).toEqual({
      ok: true,
      claims: {
        kid: "test-1",
        license_id: lic!.id,
        plan: "pro",
        expires_at: lic!.expires_at,
        activation_id: res.body.activation_id,
        device_id_hash: await device(1),
        issued_at: T0 + 60,
        refresh_before: T0 + 60 + 14 * DAY,
      },
    });
  });

  it("cùng máy kích hoạt lại (cài lại app) thì dùng lại activation, không tốn suất", async () => {
    const { activate } = await setup();
    const a = await activate(1);
    const b = await activate(1);
    expect(b.body.activation_id).toBe(a.body.activation_id);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("máy thứ 3 bị 409 kèm danh sách máy; gỡ từ xa một máy rồi kích hoạt được", async () => {
    const { w, activate, deactivate } = await setup();
    const a1 = await activate(1);
    w.clock.now = T0 + 100;
    await activate(2);
    const third = await activate(3);
    expect(third.status).toBe(409);
    expect(third.body).toEqual({
      error: "device_limit",
      activations: [
        { activation_id: a1.body.activation_id, device_label: "Máy 1", last_validated_at: T0 },
        { activation_id: expect.any(String), device_label: "Máy 2", last_validated_at: T0 + 100 },
      ],
    });
    expect((await deactivate(a1.body.activation_id as string)).body).toEqual({ ok: true });
    expect((await activate(3)).status).toBe(200);
  });

  it("hai máy mới kích hoạt cùng lúc khi còn một suất: chỉ một máy được", async () => {
    const { activate } = await setup();
    await activate(1);
    const [x, y] = await Promise.all([activate(2), activate(3)]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  it("gỡ hơn 3 máy trong 30 ngày rồi kích hoạt máy mới thì khóa tạm key (423) và có cảnh báo", async () => {
    const { w, activate, deactivate } = await setup();
    for (let i = 1; i <= 4; i++) {
      w.clock.now = T0 + i * DAY;
      const r = await activate(i);
      expect(r.status).toBe(200);
      await deactivate(r.body.activation_id as string);
    }
    w.clock.now = T0 + 5 * DAY;
    expect(await activate(5)).toMatchObject({ status: 423, body: { error: "license_locked" } });
    const lic = await env.DB.prepare("SELECT locked_at FROM licenses").first<{ locked_at: number }>();
    expect(lic?.locked_at).toBe(T0 + 5 * DAY);
    const log = await env.DB.prepare("SELECT action FROM audit_log WHERE action = 'license_locked'").first();
    expect(log).not.toBeNull();
    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "license_locked" });
  });

  it("gỡ rồi kích hoạt lại cùng một máy nhiều lần: không bị khóa", async () => {
    const { w, activate, deactivate } = await setup();
    for (let i = 1; i <= 6; i++) {
      w.clock.now = T0 + i * 3600;
      const r = await activate(1);
      expect(r.status).toBe(200);
      await deactivate(r.body.activation_id as string);
    }
    w.clock.now = T0 + 7 * 3600;
    expect((await activate(1)).status).toBe(200);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: null });
    // Đúng chữ §10.2: hơn 3 lần gỡ rồi kích hoạt một máy khác thì bị khóa.
    expect((await activate(2)).status).toBe(423);
  });

  it("xoay vòng 2 suất giữa 5 máy: bị khóa sau vài lượt, rồi mọi máy không đang kích hoạt đều bị 423", async () => {
    const { w, activate, deactivate } = await setup();
    const active: { n: number; id: string }[] = [];
    for (const n of [1, 2]) active.push({ n, id: (await activate(n)).body.activation_id as string });
    const order = [3, 4, 5, 1, 2, 3, 4, 5];
    let lockedAt = -1;
    for (let i = 0; i < order.length; i++) {
      w.clock.now = T0 + (i + 1) * 3600;
      const out = active.shift()!;
      await deactivate(out.id);
      const r = await activate(order[i]!);
      if (r.status === 423) {
        lockedAt = i;
        break;
      }
      expect(r.status).toBe(200);
      active.push({ n: order[i]!, id: r.body.activation_id as string });
    }
    // Lượt 4 (máy 1 quay lại): đã gỡ máy 1, 2, 3, 4; trừ máy 1 còn 3 lần, chưa quá 3.
    // Lượt 5 (máy 2 quay lại): đã gỡ máy 1, 2, 3, 4, 5; trừ máy 2 còn 4 lần, nên khóa.
    expect(lockedAt).toBe(4);
    expect(await env.DB.prepare("SELECT locked_at FROM licenses").first()).toEqual({ locked_at: T0 + 5 * 3600 });
    // Máy 1 đang kích hoạt vẫn dùng được; các máy khác (từng dùng hay mới) đều bị 423.
    expect((await activate(1)).status).toBe(200);
    for (const n of [2, 3, 5, 9]) expect((await activate(n)).status).toBe(423);
  });

  it("key đang bị khóa tạm: máy mới và máy từng kích hoạt đều bị 423; máy đang kích hoạt vẫn dùng được", async () => {
    const { w, licenseKey, activate, deactivate } = await setup();
    const a1 = await activate(1);
    const a2 = await activate(2);
    await deactivate(a2.body.activation_id as string);
    await env.DB.prepare("UPDATE licenses SET locked_at = ?").bind(T0).run();
    w.clock.now = T0 + 60;
    expect(await activate(3)).toMatchObject({ status: 423, body: { error: "license_locked" } });
    expect(await activate(2)).toMatchObject({ status: 423, body: { error: "license_locked" } });
    expect((await activate(1)).status).toBe(200);
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a1.body.activation_id });
    expect(v.status).toBe(200);
  });

  it("cùng một máy mới gửi hai activate cùng lúc: cả hai nhận cùng activation, không lỗi 500", async () => {
    const { activate } = await setup();
    const [x, y] = await Promise.all([activate(7), activate(7)]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect(x.body.activation_id).toBe(y.body.activation_id);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM activations").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("3 lần gỡ trong 30 ngày vẫn kích hoạt được; lần gỡ cũ hơn 30 ngày không tính", async () => {
    const { w, activate, deactivate } = await setup();
    await env.DB.prepare("UPDATE licenses SET expires_at = ?").bind(T0 + 90 * DAY).run();
    for (let i = 1; i <= 3; i++) {
      const r = await activate(i);
      await deactivate(r.body.activation_id as string);
    }
    const fourth = await activate(4);
    expect(fourth.status).toBe(200);
    w.clock.now = T0 + 10 * DAY;
    await deactivate(fourth.body.activation_id as string);
    // Lần gỡ thứ 4 ở T0 + 10 ngày; ba lần đầu (ở T0) đã quá 30 ngày.
    w.clock.now = T0 + 31 * DAY;
    expect((await activate(5)).status).toBe(200);
  });

  it("key sai định dạng 400, key không tồn tại 404, đã thu hồi 403, hết hạn 403 kèm expires_at", async () => {
    const { w, activate, licenseKey } = await setup();
    const body = { device_id_hash: await device(1), device_label: "Máy 1" };
    expect((await w.call("POST", "/v1/licenses/activate", { ...body, key: "abc" })).status).toBe(400);
    const unknown = await w.call("POST", "/v1/licenses/activate", { ...body, key: UNKNOWN_KEY });
    expect(unknown).toMatchObject({ status: 404, body: { error: "invalid_key" } });
    w.clock.now = T0 + 31 * DAY;
    const expired = await activate(1);
    expect(expired).toMatchObject({ status: 403, body: { error: "license_expired", expires_at: T0 + 30 * DAY } });
    await env.DB.prepare("UPDATE licenses SET revoked_at = 1").run();
    expect((await w.call("POST", "/v1/licenses/activate", { ...body, key: licenseKey })).body.error).toBe("license_revoked");
  });

  it("device_id_hash phải là SHA-256 hex; device_label bị cắt còn 64 ký tự, bỏ ký tự điều khiển", async () => {
    const { w, licenseKey } = await setup();
    const bad = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: "abc", device_label: "x" });
    expect(bad.status).toBe(400);
    const label = `Máy\u0000 ${"ư".repeat(100)}`;
    const ok = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await device(1), device_label: label });
    expect(ok.status).toBe(200);
    const row = await env.DB.prepare("SELECT device_label FROM activations").first<{ device_label: string }>();
    expect(Array.from(row!.device_label)).toHaveLength(64);
    expect(row!.device_label.startsWith("Máy ư")).toBe(true);
  });

  it("quá 10 lần mỗi giờ mỗi IP thì 429", async () => {
    const { activate } = await setup();
    for (let i = 0; i < 10; i++) await activate(1, "203.0.113.50");
    expect((await activate(1, "203.0.113.50")).status).toBe(429);
  });
});

describe("validate", () => {
  it("trả token mới và cập nhật lần kiểm gần nhất", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    w.clock.now = T0 + 2 * DAY;
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
    expect(v.status).toBe(200);
    expect(v.body.refresh_before).toBe(T0 + 16 * DAY);
    const row = await env.DB.prepare("SELECT last_validated_at FROM activations").first<{ last_validated_at: number }>();
    expect(row?.last_validated_at).toBe(T0 + 2 * DAY);
  });

  it("máy đã bị gỡ từ xa: 404 activation_not_found (app về Free)", async () => {
    const { w, activate, deactivate, licenseKey } = await setup();
    const a = await activate(1);
    await deactivate(a.body.activation_id as string);
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
    expect(v).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
  });

  it("đã gia hạn từ máy khác: token mới mang expires_at mới", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    await w.buy({ licenseKey });
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
    expect(v.body.expires_at).toBe(T0 + 60 * DAY);
  });

  it("key bị khóa tạm vẫn validate được trên máy đã kích hoạt", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    await env.DB.prepare("UPDATE licenses SET locked_at = 1").run();
    const v = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id });
    expect(v.status).toBe(200);
  });

  it("license đã thu hồi hoặc hết hạn: validate trả 403", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    const body = { key: licenseKey, activation_id: a.body.activation_id };
    w.clock.now = T0 + 30 * DAY;
    expect(await w.call("POST", "/v1/licenses/validate", body)).toMatchObject({
      status: 403,
      body: { error: "license_expired", expires_at: T0 + 30 * DAY },
    });
    w.clock.now = T0 + DAY;
    await env.DB.prepare("UPDATE licenses SET revoked_at = ?").bind(T0 + 3600).run();
    expect(await w.call("POST", "/v1/licenses/validate", body)).toMatchObject({ status: 403, body: { error: "license_revoked" } });
  });

  it("quá 30 lần mỗi giờ mỗi key thì 429, kể cả khi đổi 0↔O, 1↔I/L, chữ hoa thường, gạch nối", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    const variants = [
      licenseKey,
      licenseKey.toLowerCase(),
      licenseKey.replace(/-/g, " "),
      licenseKey.replace(/0/g, "O").replace(/1/g, "I"),
      licenseKey.replace(/1/g, "l"),
    ];
    for (let i = 0; i < 30; i++) {
      const res = await w.call("POST", "/v1/licenses/validate", { key: variants[i % variants.length], activation_id: a.body.activation_id });
      expect(res.status).toBe(200);
    }
    const blocked = await w.call("POST", "/v1/licenses/validate", { key: variants[3], activation_id: a.body.activation_id });
    expect(blocked.status).toBe(429);
  });

  it("dò key: 60 lần thất bại từ một IP thì IP đó bị chặn, và mọi key sai hay key thật kèm activation sai đều 429", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    const ip = { "cf-connecting-ip": "203.0.113.66" };
    const call = (key: string, activationId: unknown) =>
      w.call("POST", "/v1/licenses/validate", { key, activation_id: activationId }, ip);
    for (let i = 0; i < 20; i++) expect((await call(`SAI-${i}`, a.body.activation_id)).status).toBe(400);
    for (let i = 0; i < 20; i++) expect((await call(UNKNOWN_KEY, a.body.activation_id)).status).toBe(404);
    // Activation lạ của key đúng cũng tính là thất bại.
    for (let i = 0; i < 20; i++) {
      expect(await call(licenseKey, crypto.randomUUID())).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
    }
    // IP đã bị chặn: key giả, key sai định dạng, key thật kèm activation sai, và activate đều 429 như nhau.
    for (const res of [
      await call(UNKNOWN_KEY, a.body.activation_id),
      await call("SAI", a.body.activation_id),
      await call(licenseKey, crypto.randomUUID()),
      await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await device(2), device_label: "M" }, ip),
      await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: crypto.randomUUID() }, ip),
    ]) {
      expect(res).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    }
    expect(await env.DB.prepare("SELECT kind FROM ops_alerts").first()).toEqual({ kind: "many_failures" });
  });

  it("CGNAT: IP đang bị chặn vẫn validate và deactivate được với key hợp lệ kèm activation đang hoạt động", async () => {
    const { w, activate, licenseKey } = await setup();
    const a = await activate(1);
    const b = await activate(2);
    const ip = { "cf-connecting-ip": "203.0.113.77" };
    for (let i = 0; i < 60; i++) await w.call("POST", "/v1/licenses/validate", { key: `SAI-${i}`, activation_id: a.body.activation_id }, ip);
    expect((await w.call("POST", "/v1/licenses/validate", { key: "SAI", activation_id: a.body.activation_id }, ip)).status).toBe(429);
    const ok = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id }, ip);
    expect(ok.status).toBe(200);
    expect(ok.body.token).toMatch(/^v1\./);
    const off = await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: b.body.activation_id }, ip);
    expect(off).toMatchObject({ status: 200, body: { ok: true } });
    // Activation vừa gỡ không còn hoạt động: từ IP đang bị chặn thì 429.
    expect((await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: b.body.activation_id }, ip)).status).toBe(429);
    // IP khác không bị ảnh hưởng.
    expect((await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: a.body.activation_id })).status).toBe(200);
  });
});

describe("deactivate", () => {
  it("gỡ lại activation đã gỡ vẫn 200; activation của key khác thì 404 và tính là thất bại", async () => {
    const { w, activate, deactivate } = await setup();
    const a = await activate(1);
    expect((await deactivate(a.body.activation_id as string)).status).toBe(200);
    expect((await deactivate(a.body.activation_id as string)).status).toBe(200);
    const other = await w.buy({ email: "other@example.com" });
    const res = await w.call("POST", "/v1/licenses/deactivate", { key: other.licenseKey, activation_id: a.body.activation_id });
    expect(res).toMatchObject({ status: 404, body: { error: "activation_not_found" } });
    const failures = await env.DB.prepare("SELECT SUM(count) AS n FROM rate_limits WHERE bucket LIKE 'failure_ip:%'").first();
    expect(failures).toEqual({ n: 1 });
  });
});
```

- [ ] **Step 2: Viết test `server/test/recover.test.ts`**

`server/test/recover.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./db";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

describe("POST /v1/licenses/recover", () => {
  it("gửi mọi key còn hiệu lực của email vào chính email đó", async () => {
    const w = makeWorld();
    const a = await w.buy({ email: "buyer@example.com" });
    const b = await w.buy({ email: "buyer@example.com", plan: "pro_12m" });
    const revoked = await w.buy({ email: "buyer@example.com" });
    await env.DB.prepare("UPDATE licenses SET revoked_at = 1 WHERE license_key = ?")
      .bind(revoked.licenseKey.replace(/-/g, ""))
      .run();
    w.resend.sent.length = 0;
    const res = await w.call("POST", "/v1/licenses/recover", { email: "BUYER@example.com" });
    expect(res).toMatchObject({ status: 200, body: { ok: true } });
    expect(w.resend.sent).toHaveLength(1);
    const mail = w.resend.sent[0]!;
    expect(mail.to).toEqual(["buyer@example.com"]);
    expect(mail.text).toContain(a.licenseKey);
    expect(mail.text).toContain(b.licenseKey);
    expect(mail.text).not.toContain(revoked.licenseKey);
  });

  it("email không có key: vẫn 200 với cùng body, không gửi gì", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/licenses/recover", { email: "nobody@example.com" });
    expect(res).toMatchObject({ status: 200, body: { ok: true } });
    expect(w.resend.sent).toHaveLength(0);
  });

  it("key đã hết hạn không được gửi", async () => {
    const w = makeWorld();
    await w.buy({ email: "old@example.com" });
    w.resend.sent.length = 0;
    w.clock.now = T0 + 31 * DAY;
    await w.call("POST", "/v1/licenses/recover", { email: "old@example.com" });
    expect(w.resend.sent).toHaveLength(0);
  });

  it("quá 3 lần mỗi giờ mỗi email thì 429", async () => {
    const w = makeWorld();
    for (let i = 0; i < 3; i++) {
      const r = await w.call("POST", "/v1/licenses/recover", { email: "x@example.com" }, { "cf-connecting-ip": `198.51.100.${i}` });
      expect(r.status).toBe(200);
    }
    const res = await w.call("POST", "/v1/licenses/recover", { email: "x@example.com" }, { "cf-connecting-ip": "198.51.100.9" });
    expect(res.status).toBe(429);
  });

  it("email sai định dạng thì 400", async () => {
    const res = await makeWorld().call("POST", "/v1/licenses/recover", { email: "abc" });
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_request", field: "email" } });
  });
});
```

- [ ] **Step 3: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/licenses.test.ts test/recover.test.ts
```

Expected: FAIL. Test duy nhất qua là `key đã hết hạn không được gửi`, vì khi chưa có route thì không email nào được gửi.
```
Test Files  2 failed (2)
Tests  26 failed | 1 passed (27)
```
```
AssertionError: expected 404 to be 200 // Object.is equality
```

- [ ] **Step 4: Tạo `server/src/licenses.ts`**

`server/src/licenses.ts`:

```ts
// /v1/licenses/* (§6.8, §10.2): kích hoạt tối đa 2 máy, làm mới token, gỡ máy, gửi lại key.
import type { Context, Hono } from "hono";
import { raiseAlert } from "./alerts";
import type { AppEnv } from "./app";
import { audit, auditStatement } from "./audit";
import { type Deps, sendLicenseMail } from "./deps";
import { clientIp, fail, parseDeviceIdHash, parseDeviceLabel, parseEmail, parseUuid, readJson, tooMany } from "./http";
import { normalizeLicenseKey } from "./license-key";
import { failureBlock, hit, noteFailure } from "./ratelimit";
import { REFRESH_WINDOW_SECONDS, signToken } from "./token";

export const MAX_DEVICES = 2;
/** Trong 30 ngày có hơn 3 lần gỡ (kể cả gỡ từ xa) rồi kích hoạt máy khác thì khóa tạm key (§10.2). */
export const DEACTIVATION_WINDOW_SECONDS = 30 * 86400;
export const MAX_DEACTIVATIONS_IN_WINDOW = 3;

interface LicenseRow {
  id: string;
  plan: string;
  expires_at: number;
  revoked_at: number | null;
  locked_at: number | null;
  lock_cleared_at: number | null;
}

interface ActivationRow {
  id: string;
  device_id_hash: string;
  device_label: string | null;
  last_validated_at: number;
}

type KeyLookup = { ok: true; key: string; lic: LicenseRow | null } | { ok: false };

/** Chuẩn hóa key rồi tra license. Key sai định dạng thì ok: false. */
async function findLicense(db: D1Database, rawKey: unknown): Promise<KeyLookup> {
  const key = typeof rawKey === "string" ? normalizeLicenseKey(rawKey) : null;
  if (!key) return { ok: false };
  const lic = await db
    .prepare("SELECT id, plan, expires_at, revoked_at, locked_at, lock_cleared_at FROM licenses WHERE license_key = ?")
    .bind(key)
    .first<LicenseRow>();
  return { ok: true, key, lic };
}

async function issueToken(deps: Deps, lic: LicenseRow, act: { id: string; device_id_hash: string }) {
  const key = await deps.signingKey();
  const now = deps.now();
  const token = await signToken(key, {
    kid: key.kid,
    license_id: lic.id,
    plan: lic.plan,
    expires_at: lic.expires_at,
    activation_id: act.id,
    device_id_hash: act.device_id_hash,
    issued_at: now,
    refresh_before: now + REFRESH_WINDOW_SECONDS,
  });
  return { token, activation_id: act.id, expires_at: lic.expires_at, refresh_before: now + REFRESH_WINDOW_SECONDS };
}

/** Lỗi chung khi key không dùng được; trả null nếu license còn hiệu lực. */
function licenseProblem(c: Context, lic: LicenseRow, now: number) {
  if (lic.revoked_at !== null) return fail(c, 403, "license_revoked");
  if (now >= lic.expires_at) return fail(c, 403, "license_expired", { expires_at: lic.expires_at });
  return null;
}

async function activeActivations(db: D1Database, licenseId: string): Promise<ActivationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, device_id_hash, device_label, last_validated_at FROM activations
       WHERE license_id = ? AND deactivated_at IS NULL ORDER BY created_at`,
    )
    .bind(licenseId)
    .all<ActivationRow>();
  return results;
}

async function activeById(db: D1Database, activationId: string, licenseId: string) {
  return db
    .prepare("SELECT id, device_id_hash FROM activations WHERE id = ? AND license_id = ? AND deactivated_at IS NULL")
    .bind(activationId, licenseId)
    .first<{ id: string; device_id_hash: string }>();
}

async function activeFor(db: D1Database, licenseId: string, deviceIdHash: string) {
  return db
    .prepare("SELECT id, device_id_hash FROM activations WHERE license_id = ? AND device_id_hash = ? AND deactivated_at IS NULL")
    .bind(licenseId, deviceIdHash)
    .first<{ id: string; device_id_hash: string }>();
}

/**
 * Key sai định dạng, không tồn tại, hay activation lạ: đếm vào ngưỡng thất bại của IP (QĐ7).
 * IP đã chạm ngưỡng thì mọi request có key bị 429 tới hết giờ.
 */
async function blocked(c: Context<AppEnv>, now: number) {
  const wait = await failureBlock(c.env, clientIp(c), now);
  return wait > 0 ? tooMany(c, wait) : null;
}

export function registerLicenses(app: Hono<AppEnv>) {
  app.post("/v1/licenses/activate", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const ip = clientIp(c);
    const rl = await hit(c.env, "activate_ip", ip, now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    const stop = await blocked(c, now);
    if (stop) return stop;
    const body = await readJson(c);
    const deviceIdHash = parseDeviceIdHash(body?.device_id_hash);
    const deviceLabel = parseDeviceLabel(body?.device_label);
    if (!body || !deviceIdHash || !deviceLabel) return fail(c, 400, "invalid_request");
    const found = await findLicense(db, body.key);
    if (!found.ok || !found.lic) {
      await noteFailure(c.env, ip, now, "activate");
      return found.ok ? fail(c, 404, "invalid_key") : fail(c, 400, "invalid_request", { field: "key" });
    }
    const lic = found.lic;
    const problem = licenseProblem(c, lic, now);
    if (problem) return problem;

    const existing = await activeFor(db, lic.id, deviceIdHash);
    if (existing) {
      // Cài lại app trên cùng máy: dùng lại activation, không tốn suất.
      await db
        .prepare("UPDATE activations SET device_label = ?, last_validated_at = ? WHERE id = ?")
        .bind(deviceLabel, now, existing.id)
        .run();
      return c.json(await issueToken(deps, lic, existing));
    }

    // Mọi máy không đang kích hoạt, kể cả máy từng dùng key này, đều qua kiểm khóa tạm (QĐ10).
    if (lic.locked_at !== null) return fail(c, 423, "license_locked");
    const since = Math.max(now - DEACTIVATION_WINDOW_SECONDS, lic.lock_cleared_at ?? 0);
    // Số lần người dùng gỡ trong 30 ngày, trừ các lần gỡ chính máy đang kích hoạt:
    // gỡ rồi kích hoạt lại cùng một máy không bị khóa, còn xoay vòng giữa nhiều máy thì bị.
    const recent = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM activations
         WHERE license_id = ? AND deactivated_by = 'user' AND deactivated_at > ? AND device_id_hash <> ?`,
      )
      .bind(lic.id, since, deviceIdHash)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) > MAX_DEACTIVATIONS_IN_WINDOW) {
      await db.batch([
        db.prepare("UPDATE licenses SET locked_at = ? WHERE id = ?").bind(now, lic.id),
        auditStatement(db, {
          at: now,
          actor: "api",
          action: "license_locked",
          licenseId: lic.id,
          detail: { deactivations: recent?.n },
        }),
      ]);
      console.warn(JSON.stringify({ event: "license_locked", license_id: lic.id }));
      await raiseAlert(db, "license_locked", now);
      return fail(c, 423, "license_locked");
    }

    const activationId = crypto.randomUUID();
    // Điều kiện đếm nằm ngay trong câu INSERT, nên hai máy kích hoạt cùng lúc không vượt được 2 suất.
    // ON CONFLICT DO NOTHING: cùng một máy gửi hai request cùng lúc thì request sau dùng lại activation của request trước.
    const inserted = await db
      .prepare(
        `INSERT INTO activations (id, license_id, device_id_hash, device_label, created_at, last_validated_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?5
         WHERE (SELECT COUNT(*) FROM activations WHERE license_id = ?2 AND deactivated_at IS NULL) < ?6
         ON CONFLICT DO NOTHING`,
      )
      .bind(activationId, lic.id, deviceIdHash, deviceLabel, now, MAX_DEVICES)
      .run();
    if (inserted.meta.changes !== 1) {
      const raced = await activeFor(db, lic.id, deviceIdHash);
      if (raced) return c.json(await issueToken(deps, lic, raced));
      const list = await activeActivations(db, lic.id);
      return fail(c, 409, "device_limit", {
        activations: list.map((a) => ({
          activation_id: a.id,
          device_label: a.device_label,
          last_validated_at: a.last_validated_at,
        })),
      });
    }
    await audit(db, { at: now, actor: "api", action: "activated", licenseId: lic.id, detail: { activation_id: activationId } });
    return c.json(await issueToken(deps, lic, { id: activationId, device_id_hash: deviceIdHash }));
  });

  app.post("/v1/licenses/validate", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const ip = clientIp(c);
    const blockedFor = await failureBlock(c.env, ip, now);
    const body = await readJson(c);
    const activationId = parseUuid(body?.activation_id);
    const found: KeyLookup = body ? await findLicense(db, body.key) : { ok: false };
    const lic = found.ok ? found.lic : null;
    const act = lic && activationId ? await activeById(db, activationId, lic.id) : null;
    // IP đang bị chặn vì thất bại nhiều (QĐ7): chỉ cho qua key hợp lệ kèm activation đang hoạt động và khớp.
    // Mọi request khác trả 429, kể cả key thật mà activation sai, để kẻ dò không phân biệt được key thật với key giả.
    if (blockedFor > 0 && !act) return tooMany(c, blockedFor);
    if (!body || !activationId) return fail(c, 400, "invalid_request");
    if (!found.ok) {
      await noteFailure(c.env, ip, now, "validate");
      return fail(c, 400, "invalid_request", { field: "key" });
    }
    // Đếm theo key đã chuẩn hóa, nên đổi 0↔O hay 1↔I/L không tạo được bộ đếm mới.
    const rl = await hit(c.env, "validate_key", found.key, now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    if (!lic) {
      await noteFailure(c.env, ip, now, "validate");
      return fail(c, 404, "invalid_key");
    }
    // Máy bị gỡ từ xa về Free ở lần validate kế tiếp (§6.8).
    if (!act) {
      await noteFailure(c.env, ip, now, "validate");
      return fail(c, 404, "activation_not_found");
    }
    const problem = licenseProblem(c, lic, now);
    if (problem) return problem;
    await db.prepare("UPDATE activations SET last_validated_at = ? WHERE id = ?").bind(now, act.id).run();
    return c.json(await issueToken(deps, lic, act));
  });

  app.post("/v1/licenses/deactivate", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const ip = clientIp(c);
    const rl = await hit(c.env, "deactivate_ip", ip, now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    const blockedFor = await failureBlock(c.env, ip, now);
    const body = await readJson(c);
    const activationId = parseUuid(body?.activation_id);
    const found: KeyLookup = body ? await findLicense(db, body.key) : { ok: false };
    const lic = found.ok ? found.lic : null;
    const act = lic && activationId ? await activeById(db, activationId, lic.id) : null;
    // Như validate: IP đang bị chặn chỉ gỡ được activation đang hoạt động của đúng key đó.
    if (blockedFor > 0 && !act) return tooMany(c, blockedFor);
    if (!body || !activationId) return fail(c, 400, "invalid_request");
    if (!found.ok || !lic) {
      await noteFailure(c.env, ip, now, "deactivate");
      return found.ok ? fail(c, 404, "invalid_key") : fail(c, 400, "invalid_request", { field: "key" });
    }
    if (!act) {
      const known = await db
        .prepare("SELECT 1 AS x FROM activations WHERE id = ? AND license_id = ?")
        .bind(activationId, lic.id)
        .first();
      if (known) return c.json({ ok: true });
      await noteFailure(c.env, ip, now, "deactivate");
      return fail(c, 404, "activation_not_found");
    }
    await db.batch([
      db
        .prepare("UPDATE activations SET deactivated_at = ?, deactivated_by = 'user' WHERE id = ? AND deactivated_at IS NULL")
        .bind(now, act.id),
      auditStatement(db, { at: now, actor: "api", action: "deactivated", licenseId: lic.id, detail: { activation_id: act.id } }),
    ]);
    return c.json({ ok: true });
  });

  app.post("/v1/licenses/recover", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const body = await readJson(c);
    const email = parseEmail(body?.email);
    if (!email) return fail(c, 400, "invalid_request", { field: "email" });
    const byIp = await hit(c.env, "recover_ip", clientIp(c), now);
    const byEmail = await hit(c.env, "recover_email", email, now);
    if (!byIp.allowed || !byEmail.allowed) return tooMany(c, Math.max(byIp.retryAfter, byEmail.retryAfter));
    // Tra và gửi sau khi trả lời, để thời gian phản hồi không lộ email nào có key.
    c.executionCtx.waitUntil(
      (async () => {
        const { results } = await db
          .prepare(
            "SELECT license_key, expires_at FROM licenses WHERE email = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY expires_at",
          )
          .bind(email, now)
          .all<{ license_key: string; expires_at: number }>();
        if (results.length === 0) return;
        await sendLicenseMail(
          db,
          deps,
          email,
          "recover",
          results.map((r) => ({ licenseKey: r.license_key, expiresAt: r.expires_at })),
        );
      })(),
    );
    return c.json({ ok: true });
  });
}
```

- [ ] **Step 5: Thay `server/src/app.ts`: gắn thêm `registerLicenses`**

`server/src/app.ts`:

```ts
// Worker API công khai (spec §6.8). Route nhận phụ thuộc qua `deps` để test thay được PayOS, Resend, đồng hồ.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { registerCheckout } from "./checkout";
import { type Deps, type DepsFactory, realDeps } from "./deps";
import type { ApiEnv } from "./env";
import { fail } from "./http";
import { registerLicenses } from "./licenses";
import { registerOrders } from "./orders";

export type AppEnv = { Bindings: ApiEnv; Variables: { deps: Deps } };

export function createApp(makeDeps: DepsFactory = realDeps) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    // Chỉ HTTPS (§10.2). Chạy cục bộ và test (ENVIRONMENT=dev) thì bỏ qua.
    if (c.env.ENVIRONMENT !== "dev" && new URL(c.req.url).protocol !== "https:") return fail(c, 403, "forbidden");
    c.set("deps", makeDeps(c.env));
    await next();
  });
  app.use("/v1/*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => fail(c, 413, "invalid_request") }));
  app.get("/v1/health", (c) => c.json({ ok: true }));
  registerCheckout(app);
  registerOrders(app);
  registerLicenses(app);
  app.notFound((c) => fail(c, 404, "not_found"));
  app.onError((err, c) => {
    console.error(JSON.stringify({ event: "unhandled", name: err.name, message: err.message }));
    return fail(c, 500, "internal");
  });
  return app;
}
```

- [ ] **Step 6: Chạy test và typecheck**

```bash
cd server && pnpm exec vitest run test/licenses.test.ts test/recover.test.ts && pnpm typecheck
```

Expected:
```
Test Files  2 passed (2)
Tests  27 passed (27)
```

- [ ] **Step 7: Commit**

```bash
git add server/src/licenses.ts server/src/app.ts server/test/licenses.test.ts server/test/recover.test.ts
git commit -m "feat(server): activate tối đa 2 máy, validate, gỡ từ xa, khóa tạm, chặn dò key, recover luôn 200" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 15: Cron Trigger: đối soát, gửi lại email, gửi cảnh báo

**Files:**
- Create: `server/test/reconcile.test.ts`, `server/src/reconcile.ts`
- Modify: `server/src/index.ts` (thay toàn bộ)

- [ ] **Step 1: Viết test `server/test/reconcile.test.ts`**

`server/test/reconcile.test.ts`:

```ts
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { raiseAlert } from "../src/alerts";
import worker from "../src/index";
import { reconcile } from "../src/reconcile";
import { resetDb } from "./db";
import { FakeGateway } from "./fakes";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

async function newOrder(w: ReturnType<typeof makeWorld>) {
  const res = await w.call("POST", "/v1/checkout", { plan: "pro_1m", email: "buyer@example.com", consent: true });
  return res.body.order_code as number;
}

const status = async (orderCode: number) =>
  (await env.DB.prepare("SELECT status FROM orders WHERE order_code = ?").bind(orderCode).first<{ status: string }>())?.status;

describe("đối soát mỗi 5 phút", () => {
  it("webhook bị mất: đối soát thấy PAID thì cấp license và gửi email", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toEqual({ checked: 1, granted: 1, errors: 0, emails_retried: 0, alerts_sent: 0 });
    expect(await status(orderCode)).toBe("paid");
    expect(w.resend.sent).toHaveLength(1);
  });

  it("webhook gửi trùng và đối soát chạy cùng lúc: chỉ cấp một lần, một email", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    const body = await w.payos.webhookBody(orderCode);
    const [r1, r2, rec] = await Promise.all([
      w.call("POST", "/v1/webhooks/payos", body),
      w.call("POST", "/v1/webhooks/payos", body),
      reconcile(w.env, w.deps),
    ]);
    const byWebhook = [r1, r2].filter((r) => r.body.result === "granted").length;
    expect(byWebhook + rec.granted).toBe(1);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses").first<{ n: number }>();
    expect(n?.n).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
  });

  it("trong giờ đầu hỏi lại sau mỗi 4 phút; sau đó mỗi giờ", async () => {
    const w = makeWorld();
    await newOrder(w);
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).checked).toBe(1);
    w.clock.now = T0 + 360;
    expect((await reconcile(w.env, w.deps)).checked).toBe(0);
    w.clock.now = T0 + 600;
    expect((await reconcile(w.env, w.deps)).checked).toBe(1);
    w.clock.now = T0 + 2 * 3600;
    expect((await reconcile(w.env, w.deps)).checked).toBe(1);
    w.clock.now = T0 + 2 * 3600 + 1800;
    expect((await reconcile(w.env, w.deps)).checked).toBe(0);
  });

  it("PayOS báo EXPIRED hay CANCELLED thì ghi nhận và thôi hỏi", async () => {
    const w = makeWorld();
    const a = await newOrder(w);
    const b = await newOrder(w);
    w.payos.setStatus(a, "EXPIRED");
    w.payos.setStatus(b, "CANCELLED");
    w.clock.now = T0 + 1000;
    await reconcile(w.env, w.deps);
    expect([await status(a), await status(b)]).toEqual(["expired", "cancelled"]);
    w.clock.now = T0 + 2000;
    expect((await reconcile(w.env, w.deps)).checked).toBe(0);
  });

  it("chuyển thiếu rồi chuyển bù trong 24 giờ: đối soát thấy PAID thì cấp", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode, 1500);
    w.clock.now = T0 + 300;
    await reconcile(w.env, w.deps);
    expect(await status(orderCode)).toBe("underpaid");
    w.payos.pay(orderCode, 500);
    w.clock.now = T0 + 5 * 3600;
    expect((await reconcile(w.env, w.deps)).granted).toBe(1);
    expect(await status(orderCode)).toBe("paid");
  });

  it("đơn chờ quá 24 giờ thì coi là hết hạn; đơn chuyển thiếu giữ nguyên để hỗ trợ xử lý", async () => {
    const w = makeWorld();
    const pending = await newOrder(w);
    const under = await newOrder(w);
    w.payos.pay(under, 100);
    w.clock.now = T0 + 300;
    await reconcile(w.env, w.deps);
    w.clock.now = T0 + DAY + 1;
    await reconcile(w.env, w.deps);
    expect([await status(pending), await status(under)]).toEqual(["expired", "underpaid"]);
  });

  it("đối soát hỏi đúng cổng ghi ở orders.provider", async () => {
    const w = makeWorld();
    const gw = new FakeGateway();
    w.deps.payments.fakepay = gw;
    const orderCode = await newOrder(w);
    await env.DB.prepare("UPDATE orders SET provider = 'fakepay' WHERE order_code = ?").bind(orderCode).run();
    gw.paid.add(orderCode);
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).granted).toBe(1);
    expect(gw.statusCalls).toEqual([orderCode]);
    expect(w.payos.requests.filter((r) => r.method === "GET")).toHaveLength(0);
  });

  it("PayOS lỗi thì đếm lỗi, lần sau vẫn hỏi lại", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.down = true;
    w.clock.now = T0 + 300;
    expect(await reconcile(w.env, w.deps)).toMatchObject({ checked: 1, granted: 0, errors: 1 });
    w.payos.down = false;
    w.payos.pay(orderCode);
    w.clock.now = T0 + 600;
    expect((await reconcile(w.env, w.deps)).granted).toBe(1);
  });

  it("email lỗi tạm (5xx): gửi lại sau 5 phút, 15 phút, rồi 1 giờ; cùng idempotency key; cảnh báo một lần", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.down = true;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(w.resend.attempts).toBe(1);
    const retried = async (now: number) => {
      w.clock.now = now;
      return (await reconcile(w.env, w.deps)).emails_retried;
    };
    expect(await retried(T0 + 299)).toBe(0);
    expect(await retried(T0 + 300)).toBe(1); // lần 2, lỗi: hẹn +15 phút
    expect(await retried(T0 + 300 + 899)).toBe(0);
    expect(await retried(T0 + 300 + 900)).toBe(1); // lần 3, lỗi: hẹn +1 giờ
    expect(await retried(T0 + 1200 + 3599)).toBe(0);
    w.resend.down = false;
    expect(await retried(T0 + 1200 + 3600)).toBe(1); // lần 4, thành công
    expect(w.resend.attempts).toBe(4);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]!.idempotencyKey).toBe(`dev-order-${orderCode}`);
    expect(await retried(T0 + 6 * 3600)).toBe(0);
    const alert = await env.DB.prepare("SELECT SUM(count) AS n FROM ops_alerts WHERE kind = 'email_failed'").first();
    expect(alert).toEqual({ n: 1 });
  });

  it("sau lần thứ 3 thì gửi lại mỗi 6 giờ", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.failStatus = 429;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    for (const t of [300, 1200, 4800]) {
      w.clock.now = T0 + t;
      await reconcile(w.env, w.deps);
    }
    const row = await env.DB.prepare("SELECT email_attempts, email_retry_at FROM orders").first();
    expect(row).toEqual({ email_attempts: 4, email_retry_at: T0 + 4800 + 6 * 3600 });
  });

  it.each([403, 409])("email lỗi %i (cấu hình sai, hay hai lượt gửi chồng nhau) là lỗi tạm: được gửi lại", async (status) => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.failStatus = status;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    const row = await env.DB.prepare("SELECT email_attempts, email_gave_up_at, email_retry_at FROM orders").first();
    expect(row).toEqual({ email_attempts: 1, email_gave_up_at: null, email_retry_at: T0 + 300 });
    w.resend.failStatus = null;
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]!.idempotencyKey).toBe(`dev-order-${orderCode}`);
  });

  it("email lỗi vĩnh viễn (422): thôi gửi lại, cảnh báo một lần", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.failStatus = 422;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    const row = await env.DB.prepare("SELECT email_attempts, email_gave_up_at, email_retry_at FROM orders").first();
    expect(row).toEqual({ email_attempts: 1, email_gave_up_at: T0, email_retry_at: null });
    w.resend.failStatus = null;
    w.clock.now = T0 + 3600;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(0);
    expect(w.resend.attempts).toBe(1);
    const alert = await env.DB.prepare("SELECT SUM(count) AS n FROM ops_alerts WHERE kind = 'email_failed'").first();
    expect(alert).toEqual({ n: 1 });
  });

  it("đơn đã cấp mà chưa thử gửi thư lần nào (Worker dừng giữa chừng): cron gửi sau 5 phút", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    await env.DB.prepare("UPDATE orders SET email_sent_at = NULL, email_attempts = 0").run();
    w.resend.sent.length = 0;
    w.clock.now = T0 + 299;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(0);
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
  });

  it("email chưa gửi được quá 24 giờ thì thôi gửi lại", async () => {
    const w = makeWorld();
    const orderCode = await newOrder(w);
    w.payos.pay(orderCode);
    w.resend.down = true;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    w.resend.down = false;
    w.clock.now = T0 + DAY + 1;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(0);
  });

  it("gửi cảnh báo cho OPERATOR_EMAIL", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld({ OPERATOR_EMAIL: "ops@example.com" });
    await raiseAlert(env.DB, "license_locked", T0);
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).alerts_sent).toBe(1);
    expect(w.resend.sent[0]).toMatchObject({ to: ["ops@example.com"], subject: "[license dev] Cảnh báo: license_locked (1)" });
    vi.restoreAllMocks();
  });

  it("Cron Trigger của Worker gọi đối soát (không có đơn nào thì không gọi mạng)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "*/5 * * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({ event: "reconcile", checked: 0, granted: 0, errors: 0, emails_retried: 0, alerts_sent: 0 }),
    );
    log.mockRestore();
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/reconcile.test.ts
```

Expected: FAIL:
```
Error: Cannot find module '../src/reconcile' imported from <repo>/server/test/reconcile.test.ts
```

- [ ] **Step 3: Tạo `server/src/reconcile.ts`**

`server/src/reconcile.ts`:

```ts
// Việc định kỳ của Cron Trigger (mỗi 5 phút, §9):
// - hỏi cổng thanh toán các đơn chưa xác nhận, phòng khi webhook đến chậm hoặc mất;
// - gửi lại email mua hàng chưa gửi được;
// - gửi cảnh báo cho người vận hành; dọn bộ đếm cũ.
import { sendAlerts } from "./alerts";
import type { Deps } from "./deps";
import { fulfilOrder, retryUnsentEmails } from "./orders";
import { pruneRateLimits } from "./ratelimit";

/** Giờ đầu hỏi mỗi lần chạy (5 phút), sau đó mỗi giờ một lần, tới 24 giờ thì thôi và coi là hết hạn. */
const RECHECK_FIRST_HOUR = 240;
const RECHECK_LATER = 3540;
const GIVE_UP_AFTER = 86400;
const BATCH = 50;

export interface ReconcileResult {
  checked: number;
  granted: number;
  errors: number;
  emails_retried: number;
  alerts_sent: number;
}

export async function reconcile(
  env: { DB: D1Database; ENVIRONMENT: string; OPERATOR_EMAIL?: string },
  deps: Deps,
): Promise<ReconcileResult> {
  const now = deps.now();
  // Đơn chuyển thiếu vẫn được hỏi lại trong 24 giờ: khách có thể chuyển bù (§9).
  const { results } = await env.DB.prepare(
    `SELECT order_code FROM orders
     WHERE status IN ('pending', 'processing', 'underpaid') AND created_at >= ?1 - ?2
       AND (last_checked_at IS NULL
            OR last_checked_at <= ?1 - CASE WHEN created_at >= ?1 - 3600 THEN ?3 ELSE ?4 END)
     ORDER BY created_at LIMIT ?5`,
  )
    .bind(now, GIVE_UP_AFTER, RECHECK_FIRST_HOUR, RECHECK_LATER, BATCH)
    .all<{ order_code: number }>();
  let granted = 0;
  let errors = 0;
  for (const { order_code } of results) {
    try {
      if ((await fulfilOrder(env, deps, order_code, "reconcile")) === "granted") granted++;
    } catch (err) {
      errors++;
      console.error(JSON.stringify({ event: "reconcile_failed", order_code, error: String(err) }));
      await env.DB.prepare("UPDATE orders SET last_checked_at = ? WHERE order_code = ?").bind(now, order_code).run();
    }
  }
  await env.DB.prepare(
    "UPDATE orders SET status = 'expired' WHERE status IN ('pending', 'processing') AND created_at < ? - ?",
  )
    .bind(now, GIVE_UP_AFTER)
    .run();
  const emailsRetried = await retryUnsentEmails(env, deps);
  const alertsSent = await sendAlerts(env, deps.email, now);
  await pruneRateLimits(env.DB, now);
  return { checked: results.length, granted, errors, emails_retried: emailsRetried, alerts_sent: alertsSent };
}
```

- [ ] **Step 4: Thay `server/src/index.ts`: thêm `scheduled`**

`server/src/index.ts`:

```ts
// Điểm vào của Worker API: HTTP (Hono) và Cron Trigger mỗi 5 phút (đối soát, gửi lại email, cảnh báo).
import { createApp } from "./app";
import { realDeps } from "./deps";
import type { ApiEnv } from "./env";
import { reconcile } from "./reconcile";

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      reconcile(env, realDeps(env)).then((r) => console.log(JSON.stringify({ event: "reconcile", ...r }))),
    );
  },
} satisfies ExportedHandler<ApiEnv>;
```

- [ ] **Step 5: Chạy test và typecheck**

```bash
cd server && pnpm exec vitest run test/reconcile.test.ts && pnpm typecheck
```

Expected:
```
Test Files  1 passed (1)
Tests  17 passed (17)
```

- [ ] **Step 6: Commit**

```bash
git add server/src/reconcile.ts server/src/index.ts server/test/reconcile.test.ts
git commit -m "feat(server): cron đối soát đơn (cả đơn chuyển thiếu), gửi lại email chưa gửi được, gửi cảnh báo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 16: Worker admin sau Cloudflare Access

**Files:**
- Create: `server/test/admin.test.ts`, `server/src/admin.ts`, `server/src/admin-entry.ts`

- [ ] **Step 1: Viết test `server/test/admin.test.ts`**

Test gắn `ctx.access` giả vào execution context, giống điều runtime làm khi Access đã xác thực request. Có test cho từng trường hợp chống CSRF (QĐ30), `ACCESS_AUD` bắt buộc ngoài dev, giới hạn body, ghi nhật ký cả thao tác tra cứu, và `confirm-webhook` chỉ nhận `API_ORIGIN`.

`server/test/admin.test.ts`:

```ts
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createAdminApp } from "../src/admin";
import { sha256Hex } from "../src/crypto";
import type { AdminEnv } from "../src/env";
import { PayOSProvider } from "../src/payment/payos";
import { resetDb } from "./db";
import { TEST_CHECKSUM_KEY } from "./fakes";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

const ADMIN = "https://admin.test";
const API_ORIGIN = "https://mt-license-staging.example.workers.dev";

interface AdminCall {
  method?: string;
  body?: unknown;
  /** null: request không đi qua Access (không có ctx.access). */
  operator?: string | null;
  aud?: string;
  headers?: Record<string, string>;
  rawBody?: string;
}

function makeAdmin(adminEnv: Partial<AdminEnv> = {}) {
  const w = makeWorld();
  const payos = new PayOSProvider(
    { baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: TEST_CHECKSUM_KEY },
    w.payos.fetch,
  );
  const admin = createAdminApp(() => ({ now: () => w.clock.now, payments: { payos }, payos, email: w.deps.email }));
  const fullEnv = { ...env, API_ORIGIN, ...adminEnv } as AdminEnv;
  async function adminCall(path: string, opts: AdminCall = {}) {
    const { method = opts.body === undefined && opts.rawBody === undefined ? "GET" : "POST", operator = "ops@example.com", aud = "aud-1" } = opts;
    const ctx = createExecutionContext();
    if (operator !== null) {
      Object.defineProperty(ctx, "access", { value: { aud, getIdentity: async () => ({ email: operator }) } });
    }
    const headers: Record<string, string> = method === "GET" ? {} : { "content-type": "application/json" };
    const init: RequestInit = { method, headers: { ...headers, ...opts.headers } };
    if (opts.rawBody !== undefined) init.body = opts.rawBody;
    else if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    const res = await admin.fetch(new Request(`${ADMIN}${path}`, init), fullEnv, ctx);
    await waitOnExecutionContext(ctx);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }
  return { w, adminCall };
}

const licenseRow = () => env.DB.prepare("SELECT * FROM licenses").first<Record<string, unknown>>();
const lastAudit = () => env.DB.prepare("SELECT actor, action, order_code, detail FROM audit_log ORDER BY id DESC LIMIT 1").first();

describe("Access", () => {
  it("không qua Access thì mọi route 403", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/whoami", { operator: null })).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect((await adminCall("/admin/erase", { body: {}, operator: null })).status).toBe(403);
    expect((await adminCall("/khong-co", { operator: null })).status).toBe(403);
  });

  it("qua Access: whoami trả email người vận hành", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/whoami")).toEqual({ status: 200, body: { operator: "ops@example.com" } });
  });

  it("ACCESS_AUD đã đặt thì aud phải khớp", async () => {
    const { adminCall } = makeAdmin({ ACCESS_AUD: "aud-1" });
    expect((await adminCall("/admin/whoami")).status).toBe(200);
    expect((await adminCall("/admin/whoami", { aud: "aud-khac" })).status).toBe(403);
  });

  it("ngoài dev, ACCESS_AUD trống thì mọi request bị 403 (fail closed)", async () => {
    const { adminCall } = makeAdmin({ ENVIRONMENT: "staging", ACCESS_AUD: "" });
    expect(await adminCall("/admin/whoami")).toMatchObject({ status: 403, body: { error: "forbidden" } });
    const ok = makeAdmin({ ENVIRONMENT: "staging", ACCESS_AUD: "aud-1" });
    expect((await ok.adminCall("/admin/whoami")).status).toBe(200);
  });
});

describe("chống CSRF", () => {
  async function revokeWith(opts: AdminCall) {
    await resetDb();
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const id = (await licenseRow())!.id as string;
    const res = await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "thử" }, ...opts });
    return { res, revoked: (await licenseRow())!.revoked_at };
  }

  it("POST không phải application/json thì 415, không đổi gì", async () => {
    const { res, revoked } = await revokeWith({ headers: { "content-type": "text/plain" }, rawBody: '{"note":"x"}' });
    expect(res).toMatchObject({ status: 415, body: { error: "unsupported_media_type" } });
    expect(revoked).toBeNull();
  });

  it("Origin khác origin của Worker admin thì 403", async () => {
    const { res, revoked } = await revokeWith({ headers: { origin: "https://evil.example" } });
    expect(res).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect(revoked).toBeNull();
  });

  it("Sec-Fetch-Site cross-site hay same-site thì 403", async () => {
    for (const site of ["cross-site", "same-site"]) {
      const { res, revoked } = await revokeWith({ headers: { "sec-fetch-site": site } });
      expect(res.status).toBe(403);
      expect(revoked).toBeNull();
    }
  });

  it("cùng origin, Sec-Fetch-Site same-origin hoặc none, hoặc không có hai header (cloudflared) thì được", async () => {
    for (const headers of [{ origin: ADMIN, "sec-fetch-site": "same-origin" }, { "sec-fetch-site": "none" }, {}]) {
      const { res, revoked } = await revokeWith({ headers });
      expect(res.status).toBe(200);
      expect(revoked).toBe(T0);
    }
  });

  it("body quá 16 KiB thì 413", async () => {
    const { adminCall } = makeAdmin();
    const res = await adminCall("/admin/lookup", { body: { email: "a@example.com", pad: "x".repeat(20_000) } });
    expect(res.status).toBe(413);
  });
});

describe("tra cứu, gửi lại key", () => {
  it("tra theo email và theo orderCode bằng POST; không trả order_token_hash; ghi nhật ký không có email", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode, licenseKey } = await w.buy({ email: "buyer@example.com" });
    const byEmail = await adminCall("/admin/lookup", { body: { email: "buyer@example.com" } });
    expect(byEmail.status).toBe(200);
    const lic = (byEmail.body.licenses as Record<string, unknown>[])[0]!;
    expect(lic).toMatchObject({ license_key: licenseKey, email: "buyer@example.com", activations: [] });
    expect((lic.audit as { action: string }[]).map((a) => a.action)).toEqual(["license_issued"]);
    const orders = byEmail.body.orders as Record<string, unknown>[];
    expect(orders[0]).toMatchObject({ order_code: orderCode, status: "paid" });
    expect(orders[0]).not.toHaveProperty("order_token_hash");
    const log = await lastAudit();
    expect(log).toMatchObject({ actor: "admin:ops@example.com", action: "lookup", order_code: null });
    expect(JSON.parse((log as { detail: string }).detail)).toEqual({ by: "email", licenses: 1, orders: 1 });
    const byOrder = await adminCall("/admin/lookup", { body: { order_code: orderCode } });
    expect((byOrder.body.licenses as unknown[]).length).toBe(1);
    expect(await lastAudit()).toMatchObject({ action: "lookup", order_code: orderCode });
    expect((await adminCall("/admin/lookup", { body: {} })).status).toBe(400);
  });

  it("gửi lại key vào email của license và ghi nhật ký", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    w.resend.sent.length = 0;
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/resend`, { body: {} })).body).toEqual({ ok: true });
    expect(w.resend.sent[0]!.text).toContain(licenseKey);
    expect(await lastAudit()).toMatchObject({ actor: "admin:ops@example.com", action: "key_resent" });
  });

  it("xem trạng thái đơn trực tiếp từ cổng thanh toán của đơn, có ghi nhật ký", async () => {
    const { w, adminCall } = makeAdmin();
    const co = await w.call("POST", "/v1/checkout", { plan: "pro_1m", email: "b@example.com", consent: true });
    const res = await adminCall(`/admin/orders/${co.body.order_code as number}/payment-status`);
    expect(res.body).toEqual({ orderCode: 1, status: "pending", amount: 2000, amountPaid: 0 });
    expect(await lastAudit()).toMatchObject({ action: "payment_status_viewed", order_code: 1 });
    expect((await adminCall("/admin/orders/999/payment-status")).status).toBe(404);
  });
});

describe("thay đổi license", () => {
  it("mọi thao tác thay đổi đều cần note", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: {} })).status).toBe(400);
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "  " } })).status).toBe(400);
  });

  it("chuyển thiếu rồi chuyển bù: cấp tay cho đơn, gửi email, đơn thành paid", async () => {
    const { w, adminCall } = makeAdmin();
    const co = await w.call("POST", "/v1/checkout", { plan: "pro_1m", email: "b@example.com", consent: true });
    const orderCode = co.body.order_code as number;
    w.payos.pay(orderCode, 1500);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode, 1500));
    const res = await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "khách chuyển bù 500đ, mã GD FT2" } });
    expect(res.status).toBe(200);
    expect(res.body.expires_at).toBe(T0 + 30 * DAY);
    const order = await env.DB.prepare("SELECT status, amount_paid FROM orders").first();
    expect(order).toEqual({ status: "paid", amount_paid: 1500 });
    expect(w.resend.sent).toHaveLength(1);
    expect(await lastAudit()).toMatchObject({ action: "order_granted_manually" });
    expect((await adminCall(`/admin/orders/${orderCode}/grant`, { body: { note: "lần hai" } })).status).toBe(409);
  });

  it("cấp license mới và gia hạn tay", async () => {
    const { w, adminCall } = makeAdmin();
    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "pro_12m", note: "tặng" } });
    expect(created.status).toBe(201);
    expect(created.body.expires_at).toBe(T0 + 365 * DAY);
    expect(w.resend.sent[0]!.to).toEqual(["gift@example.com"]);
    const id = created.body.license_id as string;
    const ext = await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 7, note: "bù sự cố" } });
    expect(ext.body).toEqual({ license_id: id, expires_at: T0 + 372 * DAY });
    expect((await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 0, note: "x" } })).status).toBe(400);
  });

  it("mở khóa key bị khóa tạm: lần gỡ trước đó không còn tính", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const activate = async (n: number) =>
      w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex(`d${n}`), device_label: `M${n}` }, { "cf-connecting-ip": `198.51.100.${n}` });
    for (let i = 1; i <= 4; i++) {
      const r = await activate(i);
      await w.call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: r.body.activation_id });
    }
    expect((await activate(5)).status).toBe(423);
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/unlock`, { body: { note: "khách đổi máy nhiều, đã xác minh" } })).status).toBe(200);
    w.clock.now = T0 + 1;
    expect((await activate(5)).status).toBe(200);
  });

  it("gỡ activation (không tính vào ngưỡng khóa) và thu hồi key", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy();
    const a = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "M1" });
    const off = await adminCall(`/admin/activations/${a.body.activation_id as string}/deactivate`, { body: { note: "khách mất máy" } });
    expect(off.status).toBe(200);
    const row = await env.DB.prepare("SELECT deactivated_by FROM activations").first();
    expect(row).toEqual({ deactivated_by: "admin" });
    const id = (await licenseRow())!.id as string;
    expect((await adminCall(`/admin/licenses/${id}/revoke`, { body: { note: "hoàn tiền" } })).status).toBe(200);
    const v = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d2"), device_label: "M2" });
    expect(v.body.error).toBe("license_revoked");
  });
});

describe("Q9: xóa dữ liệu cá nhân theo email", () => {
  it("bỏ email và device_label, giữ số liệu kế toán, key vẫn dùng được", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ email: "erase@example.com" });
    await w.buy({ email: "keep@example.com" });
    await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "MacBook của An" });
    const res = await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa qua email hỗ trợ ngày 2026-10-01" } });
    expect(res.body).toEqual({ activations: 1, licenses: 1, orders: 1 });
    const orders = await env.DB.prepare("SELECT email, amount, plan, status FROM orders ORDER BY order_code").all();
    expect(orders.results).toEqual([
      { email: null, amount: 2000, plan: "pro_1m", status: "paid" },
      { email: "keep@example.com", amount: 2000, plan: "pro_1m", status: "paid" },
    ]);
    const act = await env.DB.prepare("SELECT device_label FROM activations").first();
    expect(act).toEqual({ device_label: null });
    const log = await lastAudit();
    expect(log).toMatchObject({ action: "personal_data_erased" });
    expect(String((log as { detail: string }).detail)).not.toContain("erase@example.com");
    const again = await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await sha256Hex("d1"), device_label: "M" });
    expect(again.status).toBe(200);
  });
});

describe("đăng ký webhook với PayOS", () => {
  it("chỉ nhận URL webhook trên đúng API_ORIGIN", async () => {
    const { w, adminCall } = makeAdmin();
    const url = `${API_ORIGIN}/v1/webhooks/payos`;
    expect((await adminCall("/admin/payos/confirm-webhook", { body: { webhook_url: url } })).body).toEqual({ ok: true, webhook_url: url });
    expect(w.payos.confirmedWebhook).toBe(url);
    for (const bad of [
      "https://evil.example/v1/webhooks/payos",
      `${API_ORIGIN}/v1/webhooks/payos?x=1`,
      `${API_ORIGIN}/khac`,
      "http://mt-license-staging.example.workers.dev/v1/webhooks/payos",
      "không phải url",
    ]) {
      expect(await adminCall("/admin/payos/confirm-webhook", { body: { webhook_url: bad } })).toMatchObject({
        status: 400,
        body: { field: "webhook_url" },
      });
    }
    expect(w.payos.confirmedWebhook).toBe(url);
  });

  it("API_ORIGIN trống thì không đăng ký được URL nào", async () => {
    const { adminCall } = makeAdmin({ API_ORIGIN: "" });
    const res = await adminCall("/admin/payos/confirm-webhook", { body: { webhook_url: `${API_ORIGIN}/v1/webhooks/payos` } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

```bash
cd server && pnpm exec vitest run test/admin.test.ts
```

Expected: FAIL:
```
Error: Cannot find module '../src/admin' imported from <repo>/server/test/admin.test.ts
```

- [ ] **Step 3: Tạo `server/src/admin.ts`**

`server/src/admin.ts`:

```ts
// Worker admin (§6.8 "Công cụ hỗ trợ"), chạy riêng và đặt sau Cloudflare Access ("Protect this Worker").
// Worker tự kiểm lại: request không qua Access thì không có ctx.access và bị từ chối (403); ngoài dev,
// ACCESS_AUD là bắt buộc và phải khớp. Request thay đổi dữ liệu phải là JSON cùng origin (chống CSRF).
// Mọi thao tác, kể cả tra cứu, đều ghi audit_log với actor "admin:<email người vận hành>".
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { audit, auditStatement } from "./audit";
import { sendLicenseMail } from "./deps";
import type { EmailProvider } from "./email/provider";
import type { AdminEnv } from "./env";
import { fail, isRecord, parseEmail, readJson } from "./http";
import { formatLicenseKey, generateLicenseKey } from "./license-key";
import { grantOrder, loadOrder, mailGranted } from "./orders";
import type { PayOSProvider } from "./payment/payos";
import type { PaymentProvider } from "./payment/provider";
import { isPlan, LICENSE_PLAN, PLANS } from "./plans";

export interface AdminDeps {
  now(): number;
  payments: Record<string, PaymentProvider>;
  payos: Pick<PayOSProvider, "confirmWebhook">;
  email: EmailProvider;
}

type AdminAppEnv = { Bindings: AdminEnv; Variables: { deps: AdminDeps; actor: string } };

function parseNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const note = v.trim();
  return note.length > 0 && note.length <= 500 ? note : null;
}

export function createAdminApp(makeDeps: (env: AdminEnv) => AdminDeps) {
  const app = new Hono<AdminAppEnv>();

  app.use("*", async (c, next) => {
    const access = (c.executionCtx as ExecutionContext).access;
    const audRequired = c.env.ENVIRONMENT !== "dev";
    if (!access || (audRequired && !c.env.ACCESS_AUD) || (c.env.ACCESS_AUD && access.aud !== c.env.ACCESS_AUD)) {
      return fail(c, 403, "forbidden");
    }
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const site = c.req.header("sec-fetch-site");
      const origin = c.req.header("origin");
      if ((site && site !== "same-origin" && site !== "none") || (origin && origin !== new URL(c.req.url).origin)) {
        return fail(c, 403, "forbidden");
      }
      if (!/^application\/json\s*(;|$)/i.test(c.req.header("content-type") ?? "")) {
        return fail(c, 415, "unsupported_media_type");
      }
    }
    const identity = await access.getIdentity();
    c.set("actor", `admin:${identity?.email ?? "unknown"}`);
    c.set("deps", makeDeps(c.env));
    await next();
  });
  app.use("*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => fail(c, 413, "invalid_request") }));

  /** Đọc body có `note` bắt buộc (lý do thao tác, để ghi nhật ký). */
  async function noteBody(c: Context) {
    const body = await readJson(c);
    const note = parseNote(body?.note);
    return body && note ? { body, note } : null;
  }

  // Để kiểm Access bằng trình duyệt: không trả dữ liệu nào ngoài email của chính người vận hành.
  app.get("/admin/whoami", (c) => c.json({ operator: c.get("actor").slice("admin:".length) }));

  // Tra cứu bằng POST: email nằm trong body, không nằm trong URL (URL có thể lọt vào log).
  app.post("/admin/lookup", async (c) => {
    const db = c.env.DB;
    const body = await readJson(c);
    let licenseIds: string[] = [];
    let orders: Record<string, unknown>[] = [];
    let by: "email" | "order_code";
    let orderCode: number | null = null;
    if (body?.email !== undefined) {
      const e = parseEmail(body.email);
      if (!e) return fail(c, 400, "invalid_request", { field: "email" });
      by = "email";
      orders = (await db.prepare("SELECT * FROM orders WHERE email = ? ORDER BY order_code").bind(e).all()).results;
      const lic = await db.prepare("SELECT id FROM licenses WHERE email = ?").bind(e).all<{ id: string }>();
      licenseIds = lic.results.map((r) => r.id);
    } else if (Number.isSafeInteger(body?.order_code) && (body?.order_code as number) > 0) {
      by = "order_code";
      orderCode = body?.order_code as number;
      orders = (await db.prepare("SELECT * FROM orders WHERE order_code = ?").bind(orderCode).all()).results;
    } else {
      return fail(c, 400, "invalid_request", { field: "email|order_code" });
    }
    for (const o of orders) {
      for (const k of ["license_id", "renew_license_id"]) {
        const id = o[k];
        if (typeof id === "string" && !licenseIds.includes(id)) licenseIds.push(id);
      }
      delete o.order_token_hash;
    }
    const licenses = [];
    for (const id of licenseIds) {
      const lic = await db.prepare("SELECT * FROM licenses WHERE id = ?").bind(id).first<Record<string, unknown>>();
      if (!lic) continue;
      const acts = await db.prepare("SELECT * FROM activations WHERE license_id = ? ORDER BY created_at").bind(id).all();
      const log = await db
        .prepare("SELECT at, actor, action, order_code, detail FROM audit_log WHERE license_id = ? ORDER BY id DESC LIMIT 50")
        .bind(id)
        .all();
      licenses.push({
        ...lic,
        license_key: formatLicenseKey(String(lic.license_key)),
        activations: acts.results,
        audit: log.results,
      });
    }
    await audit(db, {
      at: c.get("deps").now(),
      actor: c.get("actor"),
      action: "lookup",
      orderCode,
      detail: { by, licenses: licenses.length, orders: orders.length },
    });
    return c.json({ licenses, orders });
  });

  app.get("/admin/orders/:orderCode/payment-status", async (c) => {
    const deps = c.get("deps");
    const orderCode = Number(c.req.param("orderCode"));
    if (!Number.isSafeInteger(orderCode) || orderCode <= 0) return fail(c, 400, "invalid_request");
    const order = await loadOrder(c.env.DB, orderCode);
    if (!order) return fail(c, 404, "order_not_found");
    const provider = Object.hasOwn(deps.payments, order.provider) ? deps.payments[order.provider] : undefined;
    if (!provider) return fail(c, 502, "payment_provider_error", { message: `không có cổng ${order.provider}` });
    await audit(c.env.DB, { at: deps.now(), actor: c.get("actor"), action: "payment_status_viewed", orderCode });
    try {
      return c.json(await provider.getPaymentStatus(orderCode));
    } catch (err) {
      return fail(c, 502, "payment_provider_error", { message: String(err) });
    }
  });

  // Cấp tay cho đơn đã có, ví dụ khách chuyển thiếu rồi chuyển bù (§6.8, §9).
  app.post("/admin/orders/:orderCode/grant", async (c) => {
    const deps = c.get("deps");
    const input = await noteBody(c);
    const orderCode = Number(c.req.param("orderCode"));
    if (!input || !Number.isSafeInteger(orderCode)) return fail(c, 400, "invalid_request");
    const order = await loadOrder(c.env.DB, orderCode);
    if (!order) return fail(c, 404, "order_not_found");
    const granted = await grantOrder(c.env.DB, order, { now: deps.now(), amountPaid: order.amount_paid, actor: c.get("actor") });
    if (!granted) return c.json({ error: "already_paid" }, 409);
    await audit(c.env.DB, {
      at: deps.now(),
      actor: c.get("actor"),
      action: "order_granted_manually",
      licenseId: granted.licenseId,
      orderCode,
      detail: { note: input.note },
    });
    await mailGranted(c.env.DB, deps, c.env.ENVIRONMENT, order, granted);
    return c.json({ license_id: granted.licenseId, license_key: formatLicenseKey(granted.licenseKey), expires_at: granted.expiresAt });
  });

  // Cấp license mới không qua đơn (ví dụ bù cho khách), gửi key qua email.
  app.post("/admin/licenses", async (c) => {
    const deps = c.get("deps");
    const input = await noteBody(c);
    const email = parseEmail(input?.body.email);
    const plan = input?.body.plan;
    if (!input || !email || !isPlan(plan)) return fail(c, 400, "invalid_request");
    const now = deps.now();
    const id = crypto.randomUUID();
    const key = generateLicenseKey();
    const expiresAt = now + PLANS[plan] * 86400;
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO licenses (id, license_key, email, plan, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(id, key, email, LICENSE_PLAN, expiresAt, now),
      auditStatement(c.env.DB, {
        at: now,
        actor: c.get("actor"),
        action: "license_issued_manually",
        licenseId: id,
        detail: { plan, note: input.note },
      }),
    ]);
    await sendLicenseMail(c.env.DB, deps, email, "purchase", [{ licenseKey: key, expiresAt }]);
    return c.json({ license_id: id, license_key: formatLicenseKey(key), expires_at: expiresAt }, 201);
  });

  app.post("/admin/licenses/:id/extend", async (c) => {
    const deps = c.get("deps");
    const input = await noteBody(c);
    const days = input?.body.days;
    if (!input || !Number.isSafeInteger(days) || (days as number) < 1 || (days as number) > 3650) {
      return fail(c, 400, "invalid_request");
    }
    const now = deps.now();
    const id = c.req.param("id");
    const [res] = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE licenses SET expires_at = MAX(expires_at, ?) + ? WHERE id = ?").bind(now, (days as number) * 86400, id),
      auditStatement(c.env.DB, {
        at: now,
        actor: c.get("actor"),
        action: "license_extended_manually",
        licenseId: id,
        detail: { days, note: input.note },
      }),
    ]);
    if (res?.meta.changes !== 1) return fail(c, 404, "not_found");
    const lic = await c.env.DB.prepare("SELECT expires_at FROM licenses WHERE id = ?").bind(id).first<{ expires_at: number }>();
    return c.json({ license_id: id, expires_at: lic?.expires_at });
  });

  /** Thao tác một câu UPDATE trên license kèm nhật ký: unlock, revoke. */
  function licenseAction(path: string, action: string, sql: string) {
    app.post(`/admin/licenses/:id/${path}`, async (c) => {
      const input = await noteBody(c);
      if (!input) return fail(c, 400, "invalid_request");
      const now = c.get("deps").now();
      const id = c.req.param("id");
      const [res] = await c.env.DB.batch([
        c.env.DB.prepare(sql).bind(now, id),
        auditStatement(c.env.DB, { at: now, actor: c.get("actor"), action, licenseId: id, detail: { note: input.note } }),
      ]);
      if (res?.meta.changes !== 1) return fail(c, 404, "not_found");
      return c.json({ ok: true });
    });
  }
  // Mở khóa: các lần gỡ trước lúc mở khóa không còn tính vào ngưỡng 3 máy/30 ngày.
  licenseAction("unlock", "license_unlocked", "UPDATE licenses SET locked_at = NULL, lock_cleared_at = ?1 WHERE id = ?2");
  licenseAction("revoke", "license_revoked", "UPDATE licenses SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL");

  app.post("/admin/licenses/:id/resend", async (c) => {
    const deps = c.get("deps");
    const id = c.req.param("id");
    const lic = await c.env.DB.prepare("SELECT license_key, email, expires_at FROM licenses WHERE id = ?")
      .bind(id)
      .first<{ license_key: string; email: string | null; expires_at: number }>();
    if (!lic) return fail(c, 404, "not_found");
    if (!lic.email) return fail(c, 400, "invalid_request", { field: "email" });
    const { ok: sent } = await sendLicenseMail(c.env.DB, deps, lic.email, "resend", [
      { licenseKey: lic.license_key, expiresAt: lic.expires_at },
    ]);
    await audit(c.env.DB, { at: deps.now(), actor: c.get("actor"), action: "key_resent", licenseId: id, detail: { sent } });
    return sent ? c.json({ ok: true }) : fail(c, 502, "temporarily_unavailable");
  });

  app.post("/admin/activations/:id/deactivate", async (c) => {
    const input = await noteBody(c);
    if (!input) return fail(c, 400, "invalid_request");
    const now = c.get("deps").now();
    const id = c.req.param("id");
    const act = await c.env.DB.prepare("SELECT license_id FROM activations WHERE id = ? AND deactivated_at IS NULL")
      .bind(id)
      .first<{ license_id: string }>();
    if (!act) return fail(c, 404, "activation_not_found");
    // deactivated_by = 'admin' nên không tính vào ngưỡng khóa tạm.
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE activations SET deactivated_at = ?, deactivated_by = 'admin' WHERE id = ?").bind(now, id),
      auditStatement(c.env.DB, {
        at: now,
        actor: c.get("actor"),
        action: "deactivated_by_admin",
        licenseId: act.license_id,
        detail: { activation_id: id, note: input.note },
      }),
    ]);
    return c.json({ ok: true });
  });

  // Q9: ẩn danh dữ liệu cá nhân theo email. Giữ đơn hàng ở mức kế toán cần (số tiền, ngày, gói, mã đơn),
  // bỏ email và device_label. License vẫn dùng được nhưng không khôi phục được qua email nữa.
  app.post("/admin/erase", async (c) => {
    const input = await noteBody(c);
    const email = parseEmail(input?.body.email);
    if (!input || !email) return fail(c, 400, "invalid_request");
    const now = c.get("deps").now();
    const db = c.env.DB;
    const [acts, lics, ords] = await db.batch([
      db.prepare(
        "UPDATE activations SET device_label = NULL WHERE device_label IS NOT NULL AND license_id IN (SELECT id FROM licenses WHERE email = ?)",
      ).bind(email),
      db.prepare("UPDATE licenses SET email = NULL WHERE email = ?").bind(email),
      db.prepare("UPDATE orders SET email = NULL WHERE email = ?").bind(email),
    ]);
    const counts = { activations: acts?.meta.changes ?? 0, licenses: lics?.meta.changes ?? 0, orders: ords?.meta.changes ?? 0 };
    await audit(db, { at: now, actor: c.get("actor"), action: "personal_data_erased", detail: { ...counts, note: input.note } });
    return c.json(counts);
  });

  // Chỉ nhận URL webhook trên đúng Worker API của môi trường này (API_ORIGIN), để không ai trỏ webhook đi nơi khác.
  app.post("/admin/payos/confirm-webhook", async (c) => {
    const body = await readJson(c);
    const raw = isRecord(body) && typeof body.webhook_url === "string" ? body.webhook_url : "";
    let url: URL | null = null;
    try {
      url = new URL(raw);
    } catch {
      url = null;
    }
    const apiOrigin = c.env.API_ORIGIN ?? "";
    if (!url || !apiOrigin || url.origin !== apiOrigin || url.pathname !== "/v1/webhooks/payos" || url.search || url.hash) {
      return fail(c, 400, "invalid_request", { field: "webhook_url" });
    }
    try {
      await c.get("deps").payos.confirmWebhook(url.href);
    } catch (err) {
      return fail(c, 502, "payment_provider_error", { message: String(err) });
    }
    await audit(c.env.DB, {
      at: c.get("deps").now(),
      actor: c.get("actor"),
      action: "payos_webhook_confirmed",
      detail: { url: url.href },
    });
    return c.json({ ok: true, webhook_url: url.href });
  });

  app.notFound((c) => fail(c, 404, "not_found"));
  app.onError((err, c) => {
    console.error(JSON.stringify({ event: "admin_unhandled", name: err.name, message: err.message }));
    return fail(c, 500, "internal");
  });
  return app;
}
```

- [ ] **Step 4: Tạo `server/src/admin-entry.ts`**

`server/src/admin-entry.ts`:

```ts
// Điểm vào của Worker admin (wrangler.admin.jsonc). Dùng chung D1 với Worker API.
import { createAdminApp } from "./admin";
import { nowSeconds, payosFromEnv } from "./deps";
import { ResendEmailProvider } from "./email/resend";
import type { AdminEnv } from "./env";

const app = createAdminApp((env) => {
  const payos = payosFromEnv(env);
  return {
    now: nowSeconds,
    payments: { payos },
    payos,
    email: new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }),
  };
});

export default { fetch: app.fetch } satisfies ExportedHandler<AdminEnv>;
```

- [ ] **Step 5: Chạy test và typecheck**

```bash
cd server && pnpm exec vitest run test/admin.test.ts && pnpm typecheck
```

Expected:
```
Test Files  1 passed (1)
Tests  20 passed (20)
```

- [ ] **Step 6: Commit**

```bash
git add server/src/admin.ts server/src/admin-entry.ts server/test/admin.test.ts
git commit -m "feat(server): Worker admin sau Cloudflare Access, chống CSRF, đủ thao tác của §6.8, xóa dữ liệu theo email (Q9)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 17: Test bảo mật của license server (§11)

Các test này kiểm lại hành vi đã có ở Task 11–16. Chúng phải xanh ngay khi thêm vào. Nếu đỏ thì đó là lỗi của code, không phải của test: sửa code, không sửa test.

**Files:**
- Create: `server/test/security.test.ts`

- [ ] **Step 1: Viết `server/test/security.test.ts`**

`server/test/security.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./db";
import { makeWorld } from "./world";

beforeEach(resetDb);

const INJECTIONS = ["' OR '1'='1", "1; DROP TABLE licenses; --", '"); DELETE FROM orders; --', "\u0000", "𝕏".repeat(40)];

describe("bảo mật license server (§10.2, §11)", () => {
  it("input độc hại bị từ chối, bảng không đổi", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    for (const bad of INJECTIONS) {
      const activate = await w.call("POST", "/v1/licenses/activate", { key: bad, device_id_hash: bad, device_label: bad });
      expect(activate.status).toBe(400);
      const validate = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: bad });
      expect(validate.status).toBe(400);
      const recover = await w.call("POST", "/v1/licenses/recover", { email: bad });
      expect(recover.status).toBe(400);
      const checkout = await w.call("POST", "/v1/checkout", { plan: bad, email: "a@example.com", consent: true });
      expect(checkout.status).toBe(400);
      const order = await w.call("GET", `/v1/orders/${encodeURIComponent(bad)}`, undefined, {
        authorization: `Bearer ${encodeURIComponent(bad)}`,
      });
      expect(order.status).toBe(404);
    }
    const counts = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM licenses) AS l, (SELECT COUNT(*) FROM orders) AS o",
    ).first();
    expect(counts).toEqual({ l: 1, o: 1 });
  });

  it("Worker API không có /admin", async () => {
    expect((await makeWorld().call("GET", "/admin/lookup?email=a@example.com")).status).toBe(404);
  });

  it("lỗi của PayOS không lộ ra response", async () => {
    const w = makeWorld();
    w.payos.down = true;
    const res = await w.call("POST", "/v1/checkout", { plan: "pro_1m", email: "a@example.com", consent: true });
    expect(res.body).toEqual({ error: "payment_provider_error" });
  });
});
```

- [ ] **Step 2: Chạy test**

```bash
cd server && pnpm exec vitest run test/security.test.ts
```

Expected:
```
Test Files  1 passed (1)
Tests  3 passed (3)
```

- [ ] **Step 3: Commit**

```bash
git add server/test/security.test.ts
git commit -m "test(server): input độc hại, không có /admin trên Worker API, lỗi PayOS không lộ ra ngoài" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 18: Cấu hình staging, production và kiểm tra toàn bộ

**Files:**
- Modify: `server/wrangler.jsonc` (thay toàn bộ), `server/package.json` (thay toàn bộ: thêm script)
- Create: `server/wrangler.admin.jsonc`

- [ ] **Step 1: Thay `server/wrangler.jsonc`: thêm `env.staging` và `env.production`**

`vars`, `d1_databases`, `triggers` và `secrets` không kế thừa sang từng môi trường, nên được lặp lại ở mỗi `env`; `observability` cũng được ghi rõ ở mỗi `env` cho chắc. `database_id` tạm là toàn số 0; Task 19 và Task 21 thay bằng ID thật (ID không phải bí mật).

`server/wrangler.jsonc`:

```jsonc
// Worker API công khai của license server (spec §6.8). Worker admin cấu hình riêng ở wrangler.admin.jsonc.
// Cấu hình gốc chỉ dùng cho test và chạy cục bộ. Triển khai luôn kèm --env staging hoặc --env production.
// Secret (PayOS, Resend, khóa ký, pepper, email người vận hành) nhập bằng `wrangler secret put`, không bao giờ ghi vào file này.
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "mt-license",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-26",
  "workers_dev": false,
  "preview_urls": false,
  // Tắt invocation log (log đó lưu cả URL và query của request) và bỏ query khỏi URL trong log và trace (QĐ25).
  // Log JSON do code tự ghi vẫn giữ. Bật Workers Issues để có cảnh báo không phụ thuộc Resend (QĐ27).
  "observability": { "enabled": true, "redact_query_string": true, "logs": { "invocation_logs": false }, "issues": { "enabled": true } },
  "vars": {
    "ENVIRONMENT": "dev",
    "PAYOS_BASE_URL": "https://api-merchant.payos.vn",
    "EMAIL_FROM": "Meeting Translator <onboarding@resend.dev>",
    "PRICES_JSON": "{\"pro_1m\":{\"VND\":2000},\"pro_12m\":{\"VND\":3000}}"
  },
  "secrets": {
    "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY", "TOKEN_SIGNING_JWK", "RATE_LIMIT_PEPPER"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "mt-license-dev", "database_id": "00000000-0000-0000-0000-000000000000" }
  ],
  "triggers": { "crons": ["*/5 * * * *"] },
  "env": {
    "staging": {
      "workers_dev": true,
      "preview_urls": false,
      "observability": { "enabled": true, "redact_query_string": true, "logs": { "invocation_logs": false }, "issues": { "enabled": true } },
      "vars": {
        "ENVIRONMENT": "staging",
        "PAYOS_BASE_URL": "https://api-merchant.payos.vn",
        // Chưa có tên miền đã xác thực (Q1): Resend chỉ gửi được tới email của chủ tài khoản Resend.
        "EMAIL_FROM": "Meeting Translator <onboarding@resend.dev>",
        // Giá nhỏ để thử bằng tiền thật (PayOS không có sandbox).
        "PRICES_JSON": "{\"pro_1m\":{\"VND\":2000},\"pro_12m\":{\"VND\":3000}}"
      },
      "secrets": {
        "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY", "TOKEN_SIGNING_JWK", "RATE_LIMIT_PEPPER"]
      },
      "d1_databases": [
        // database_id: thay bằng ID do `wrangler d1 create mt-license-staging` in ra (Task 19).
        { "binding": "DB", "database_name": "mt-license-staging", "database_id": "00000000-0000-0000-0000-000000000000" }
      ],
      "triggers": { "crons": ["*/5 * * * *"] }
    },
    "production": {
      "workers_dev": true,
      "preview_urls": false,
      "observability": { "enabled": true, "redact_query_string": true, "logs": { "invocation_logs": false }, "issues": { "enabled": true } },
      "vars": {
        "ENVIRONMENT": "production",
        "PAYOS_BASE_URL": "https://api-merchant.payos.vn",
        // Đổi sang địa chỉ trên tên miền đã xác thực SPF, DKIM khi có Q1.
        "EMAIL_FROM": "Meeting Translator <onboarding@resend.dev>",
        // Để trống cho tới khi chốt giá (Q2): checkout trả 503 pricing_not_configured.
        "PRICES_JSON": ""
      },
      "secrets": {
        "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY", "TOKEN_SIGNING_JWK", "RATE_LIMIT_PEPPER"]
      },
      "d1_databases": [
        // database_id: thay bằng ID do `wrangler d1 create mt-license-production` in ra (Task 21).
        { "binding": "DB", "database_name": "mt-license-production", "database_id": "00000000-0000-0000-0000-000000000000" }
      ],
      "triggers": { "crons": ["*/5 * * * *"] }
    }
  }
}
```

- [ ] **Step 2: Tạo `server/wrangler.admin.jsonc`**

`ACCESS_AUD` và `API_ORIGIN` để trống: Worker admin trả `403` cho mọi request tới khi Task 19 (staging) và Task 21 (production) điền hai giá trị này. Đó là chủ ý (fail closed).

`server/wrangler.admin.jsonc`:

```jsonc
// Worker admin của license server (§6.8 "Công cụ hỗ trợ"): chỉ mở qua Cloudflare Access
// (dashboard > Workers & Pages > mt-license-admin-<env> > Access > Protect this Worker behind Access > All traffic).
// Ngoài dev, ACCESS_AUD bắt buộc; trống thì mọi request bị 403.
// Dùng chung D1 với Worker API: database_id phải trùng với wrangler.jsonc của cùng môi trường.
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "mt-license-admin",
  "main": "src/admin-entry.ts",
  "compatibility_date": "2026-09-26",
  "workers_dev": false,
  "preview_urls": false,
  // Tắt invocation log (log đó lưu cả URL và query của request) và bỏ query khỏi URL trong log và trace (QĐ25).
  // Log JSON do code tự ghi vẫn giữ. Bật Workers Issues để có cảnh báo không phụ thuộc Resend (QĐ27).
  "observability": { "enabled": true, "redact_query_string": true, "logs": { "invocation_logs": false }, "issues": { "enabled": true } },
  "vars": {
    "ENVIRONMENT": "dev",
    "PAYOS_BASE_URL": "https://api-merchant.payos.vn",
    "EMAIL_FROM": "Meeting Translator <onboarding@resend.dev>",
    "ACCESS_AUD": "",
    "API_ORIGIN": ""
  },
  "secrets": { "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY"] },
  "d1_databases": [
    { "binding": "DB", "database_name": "mt-license-dev", "database_id": "00000000-0000-0000-0000-000000000000" }
  ],
  "env": {
    "staging": {
      "workers_dev": true,
      "preview_urls": false,
      "observability": { "enabled": true, "redact_query_string": true, "logs": { "invocation_logs": false }, "issues": { "enabled": true } },
      "vars": {
        "ENVIRONMENT": "staging",
        "PAYOS_BASE_URL": "https://api-merchant.payos.vn",
        "EMAIL_FROM": "Meeting Translator <onboarding@resend.dev>",
        // Bắt buộc (QĐ6): Audience tag của ứng dụng Access (Task 19, Step 11). Trống thì Worker trả 403 cho mọi request.
        "ACCESS_AUD": "",
        // Origin của Worker API staging (Task 19, Step 11); confirm-webhook chỉ nhận URL trên origin này.
        "API_ORIGIN": ""
      },
      "secrets": { "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY"] },
      "d1_databases": [
        { "binding": "DB", "database_name": "mt-license-staging", "database_id": "00000000-0000-0000-0000-000000000000" }
      ]
    },
    "production": {
      "workers_dev": true,
      "preview_urls": false,
      "observability": { "enabled": true, "redact_query_string": true, "logs": { "invocation_logs": false }, "issues": { "enabled": true } },
      "vars": {
        "ENVIRONMENT": "production",
        "PAYOS_BASE_URL": "https://api-merchant.payos.vn",
        "EMAIL_FROM": "Meeting Translator <onboarding@resend.dev>",
        // Bắt buộc: điền ở Task 21, Step 10.
        "ACCESS_AUD": "",
        // Origin của Worker API production (https://<tên miền license server>), điền ở Task 21, Step 10.
        "API_ORIGIN": ""
      },
      "secrets": { "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY"] },
      "d1_databases": [
        { "binding": "DB", "database_name": "mt-license-production", "database_id": "00000000-0000-0000-0000-000000000000" }
      ]
    }
  }
}
```

- [ ] **Step 3: Thay `server/package.json`: thêm script kiểm vector, dry-run, `check`**

`server/package.json`:

```json
{
  "name": "meeting-translator-license-server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": {
    "node": ">=24.21.0"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "vectors": "node scripts/gen-token-vectors.mjs > test/vectors/token-v1.json",
    "vectors:check": "node scripts/gen-token-vectors.mjs | cmp - test/vectors/token-v1.json",
    "dry-run": "wrangler deploy --dry-run --env staging && wrangler deploy --dry-run --env production && wrangler deploy --dry-run -c wrangler.admin.jsonc --env staging && wrangler deploy --dry-run -c wrangler.admin.jsonc --env production",
    "check": "pnpm typecheck && pnpm vectors:check && pnpm test && pnpm dry-run"
  },
  "dependencies": {
    "hono": "4.13.11"
  },
  "devDependencies": {
    "@cloudflare/vitest-plugin": "1.3.2",
    "@cloudflare/workers-types": "5.20260929.1",
    "typescript": "7.0.2",
    "vitest": "4.1.11",
    "wrangler": "4.143.1"
  }
}
```

- [ ] **Step 4: Chạy kiểm tra toàn bộ**

`wrangler deploy --dry-run` build bundle và kiểm cấu hình mà không cần đăng nhập.

```bash
cd server && pnpm install --frozen-lockfile && pnpm check
```

Expected (lúc lập kế hoạch):
```
$ pnpm typecheck && pnpm vectors:check && pnpm test && pnpm dry-run
$ tsc --noEmit
$ node scripts/gen-token-vectors.mjs | cmp - test/vectors/token-v1.json
$ vitest run
Test Files  17 passed (17)
Tests  173 passed (173)
$ wrangler deploy --dry-run --env staging && wrangler deploy --dry-run --env production && wrangler deploy --dry-run -c wrangler.admin.jsonc --env staging && wrangler deploy --dry-run -c wrangler.admin.jsonc --env production
Total Upload: 107.56 KiB / gzip: 28.24 KiB
--dry-run: exiting now.
Total Upload: 107.56 KiB / gzip: 28.24 KiB
--dry-run: exiting now.
Total Upload: 88.86 KiB / gzip: 23.29 KiB
--dry-run: exiting now.
Total Upload: 88.86 KiB / gzip: 23.29 KiB
--dry-run: exiting now.
```
Không có dòng `WARNING` nào của wrangler: `env.production` khai báo `PRICES_JSON` rỗng một cách rõ ràng.

- [ ] **Step 5: Kiểm lỗ hổng và giấy phép**

```bash
cd server && pnpm audit && pnpm audit --prod && pnpm licenses list --prod
```

Expected:
```
No known vulnerabilities found
No known vulnerabilities found
```
```
┌─────────┬─────────┐
│ Package │ License │
├─────────┼─────────┤
│ hono    │ MIT     │
└─────────┴─────────┘
```

- [ ] **Step 6: Kiểm đã tắt invocation log ở mọi môi trường (QĐ25)**

```bash
cd server && grep -c '"invocation_logs": false' wrangler.jsonc wrangler.admin.jsonc
```

Expected: mỗi file 3 dòng (cấu hình gốc, `staging`, `production`):
```
wrangler.jsonc:3
wrangler.admin.jsonc:3
```

- [ ] **Step 7: Kiểm không có bí mật nào sắp được commit**

```bash
git status --porcelain
grep -iE '"(d|api_?key|secret|password)"\s*:' server/wrangler.jsonc server/wrangler.admin.jsonc; echo "grep_exit=$?"
```

Expected:
```
 M server/package.json
 M server/wrangler.jsonc
?? server/wrangler.admin.jsonc
```
```
grep_exit=1
```
`grep` không in dòng nào, và `grep_exit=1`: trong cấu hình không có khóa riêng hay khóa API nào.

- [ ] **Step 8: Commit**

```bash
git add server/wrangler.jsonc server/wrangler.admin.jsonc server/package.json
git commit -m "feat(server): cấu hình staging và production cho Worker API và Worker admin, lệnh check" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 19 (người): Triển khai staging

**Cần người thao tác:** toàn bộ task này cần tài khoản thật (Cloudflare, PayOS, Resend, kho mật khẩu) và việc nhập secret từ bàn phím. Agent không tự chạy các lệnh ở đây, không đọc và không dán secret nào. Agent chỉ kiểm file sau mỗi bước khi người làm yêu cầu, và commit ở Step 13.

Trước khi làm: đã quyết P05-1, P05-2, P05-5, P05-6; Task 18 đã commit; `cd server && pnpm check` xanh.

Trong task này: `STG=https://mt-license-staging.<subdomain>.workers.dev` và `ADMIN=https://mt-license-admin-staging.<subdomain>.workers.dev`, với `<subdomain>` là subdomain workers.dev của tài khoản (biết ở Step 9).

**Files:**
- Modify: `server/wrangler.jsonc` (`database_id` của `env.staging`), `server/wrangler.admin.jsonc` (`database_id`, `ACCESS_AUD`, `API_ORIGIN` của `env.staging`)
- Create: `server/keys/public-keys.json`

- [ ] **Step 1: Chuẩn bị tài khoản**
  - Cloudflare: tài khoản riêng của sản phẩm (T4, D2). Zero Trust đã bật: dashboard > Zero Trust, chọn tên team, chọn gói Free nếu được hỏi.
  - PayOS: trên my.payos.vn, tạo một kênh thanh toán riêng cho staging (P05-1), rồi mở trang kênh để lấy Client ID, API Key, Checksum Key. Chỉ gõ các giá trị này vào prompt của `wrangler secret put`; không lưu vào file, không dán vào chat.
  - Resend (T6): tạo API key quyền Sending access. Staging gửi từ `onboarding@resend.dev`, nên chỉ gửi được tới email của chính tài khoản Resend. Vì vậy giao dịch thử ở Task 20 dùng email đó, và `OPERATOR_EMAIL` của staging cũng nên là email đó.
  - Kho mật khẩu cho khóa dự phòng (P05-6):
    - 1Password: `op whoami` in tài khoản đang đăng nhập (chưa đăng nhập thì `op signin`).
    - Bitwarden: `bw login`, rồi `export BW_SESSION="$(bw unlock --raw)"`; `bw status` phải có `"status":"unlocked"`.
    - Không có hai CLI trên: dùng `pbcopy` ở Step 6.

- [ ] **Step 2: Đăng nhập Cloudflare**

```bash
cd server && pnpm exec wrangler login && pnpm exec wrangler whoami
```

Expected:
- Trình duyệt mở trang cấp quyền; terminal in `Successfully logged in.`
- `whoami` liệt kê tài khoản riêng của sản phẩm, không phải tài khoản của AI Live Translator (D2).
- Nếu có nhiều tài khoản: thêm `"account_id": "<Account ID của tài khoản sản phẩm>"` ở cấp gốc của cả `wrangler.jsonc` lẫn `wrangler.admin.jsonc`. Account ID không phải bí mật.

- [ ] **Step 3: Tạo D1 cho staging**

```bash
cd server && pnpm exec wrangler d1 create mt-license-staging --location apac --env staging --binding DB
git diff -- wrangler.jsonc
```

Expected:
- `✅ Successfully created DB 'mt-license-staging' in region APAC`, rồi đoạn cấu hình có `database_id`.
- `--binding DB --env staging` làm wrangler tự thay binding `DB` trong `env.staging` của `wrangler.jsonc`, nên `git diff` chỉ đổi dòng `database_id` của `mt-license-staging`.
- Nếu diff đổi thêm chỗ khác (ví dụ mất comment): `git checkout -- wrangler.jsonc`, rồi tự dán ID vào đúng dòng đó.

Chép cùng ID vào dòng `mt-license-staging` trong `env.staging` của `wrangler.admin.jsonc`, rồi kiểm:

```bash
cd server && grep -n '"mt-license-staging"' wrangler.jsonc wrangler.admin.jsonc
```

Expected: hai dòng, cùng một `database_id`, khác `00000000-0000-0000-0000-000000000000`.

- [ ] **Step 4: Áp migration lên D1 thật**

```bash
cd server && pnpm exec wrangler d1 migrations apply mt-license-staging --env staging --remote
pnpm exec wrangler d1 execute mt-license-staging --env staging --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
```

Expected:
- Bảng `Migrations to be applied:` có `0001_init.sql`. Wrangler hỏi xác nhận: trả lời `y`. Bảng kết quả có ✅.
- Lệnh thứ hai liệt kê: `activations`, `audit_log`, `d1_migrations`, `licenses`, `ops_alerts`, `orders`, `rate_limits`, và các bảng nội bộ (`sqlite_sequence`, `_cf_…`).
- Staging dùng số đơn từ 1 (QĐ18), nên lần đầu không cần giữ chỗ số đơn.

**Chỉ khi phải tạo lại D1 staging trên cùng kênh PayOS** (ví dụ xóa D1 để làm lại từ đầu): số đơn của D1 mới lại bắt đầu từ 1 và sẽ trùng mã đơn cũ trên PayOS (`231 Đơn thanh toán đã tồn tại`). Sau khi áp migration, giữ chỗ số đơn:
1. Tìm số đơn staging lớn nhất đã dùng, gọi là `N`: trên my.payos.vn, mở kênh staging > danh sách link thanh toán, xem `orderCode` lớn nhất. Hoặc tìm dòng `order_created` có `order_code` lớn nhất trong Workers Logs (Logs chỉ giữ 3–7 ngày). Không chắc thì lấy một số lớn hơn hẳn, ví dụ 100000.
2. Chạy (thay `<N>` bằng số vừa tìm):

   ```bash
   cd server && pnpm exec wrangler d1 execute mt-license-staging --env staging --remote --command "INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES (<N>, 'reserved', 'none', 'pro_1m', 0, 'VND', 0, 'failed', 0, 0); DELETE FROM orders WHERE order_code = <N>;"
   pnpm exec wrangler d1 execute mt-license-staging --env staging --remote --command "SELECT (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS seq, (SELECT COUNT(*) FROM orders) AS orders"
   ```

   Expected: lệnh cuối in `seq` = `<N>` và `orders` = `0`; đơn staging kế tiếp là `<N>+1`. Giữ `<N>` dưới 1.000.000 để không đụng dải số của production (QĐ18).

- [ ] **Step 5: Secret của Worker API**

Các lệnh không có pipe sẽ hỏi giá trị (`Enter a secret value:`); gõ không hiện ra màn hình.

```bash
cd server
pnpm exec wrangler secret put PAYOS_CLIENT_ID --env staging
pnpm exec wrangler secret put PAYOS_API_KEY --env staging
pnpm exec wrangler secret put PAYOS_CHECKSUM_KEY --env staging
pnpm exec wrangler secret put RESEND_API_KEY --env staging
pnpm exec wrangler secret put OPERATOR_EMAIL --env staging
openssl rand -base64 32 | pnpm exec wrangler secret put RATE_LIMIT_PEPPER --env staging
```

Expected:
- Lệnh đầu hỏi `There doesn't seem to be a Worker called "mt-license-staging". Do you want to create a new Worker with that name and add secrets to it?`: trả lời `y`.
- Mỗi lệnh kết thúc bằng `✨ Success! Uploaded secret <TÊN>`.
- `RATE_LIMIT_PEPPER` sinh ngẫu nhiên và đi thẳng vào secret, không hiện ra, không lưu ở đâu khác. Mất pepper chỉ làm bộ đếm giới hạn tần suất bắt đầu lại, nên không cần sao lưu.

- [ ] **Step 6: Khóa ký token của staging (Q11, QĐ29)**

Khóa đang dùng đi thẳng vào secret qua pipe:

```bash
cd server && node scripts/gen-token-key.mjs stg-2026-10-1 | pnpm exec wrangler secret put TOKEN_SIGNING_JWK --env staging
```

Expected: dòng `Khóa công khai (ghi vào server/keys/public-keys.json): {"kid":"stg-2026-10-1","x":"<43 ký tự>"}`, rồi `✨ Success! Uploaded secret TOKEN_SIGNING_JWK`. Chép lại giá trị `x`.

Khóa dự phòng đi thẳng vào kho mật khẩu. Chọn **một** trong ba cách:

- 1Password (`op`):

  ```bash
  cd server && command -v op && node scripts/gen-token-key.mjs stg-2026-10-1-b --vault op | op item create --vault Private - >/dev/null && echo "đã lưu vào 1Password"
  ```

- Bitwarden (`bw`; output của `bw create item` có cả khóa nên phải bỏ đi):

  ```bash
  cd server && command -v bw && node scripts/gen-token-key.mjs stg-2026-10-1-b --vault bw | bw encode | bw create item >/dev/null && echo "đã lưu vào Bitwarden"
  ```

- Không có CLI của kho mật khẩu: qua clipboard.

  ```bash
  cd server && node scripts/gen-token-key.mjs stg-2026-10-1-b | pbcopy
  ```

  Tạo một mục mới trong kho mật khẩu, tên "Meeting Translator token key stg-2026-10-1-b", dán vào trường mật khẩu (ẩn). Xóa clipboard ngay: `printf '' | pbcopy`.

  **Cảnh báo:** app quản lý clipboard (Raycast, Alfred, Maccy, Paste…) lưu lịch sử clipboard ra đĩa. Tắt các app đó, hoặc xóa mục vừa copy khỏi lịch sử. Tắt tạm Handoff (System Settings > General > AirDrop & Handoff), để Universal Clipboard không chép khóa sang iPhone hay iPad.

Expected (mọi cách): dòng khóa công khai của `stg-2026-10-1-b` hiện ra, rồi `đã lưu vào 1Password` hoặc `đã lưu vào Bitwarden` (hai cách đầu). Chép lại giá trị `x`. Khóa riêng không hiện ra màn hình ở cách nào.

- [ ] **Step 7: Tạo `server/keys/public-keys.json` và kiểm khóa dự phòng trong kho khớp với nó**

Dán hai giá trị `x` từ Step 6 (khóa công khai, không phải bí mật). Kế hoạch 06 build sẵn cả hai khóa vào bản dev của app.

```json
{
  "_note": "Khóa công khai kiểm token bản quyền (spec §10.2). Không phải bí mật. active: khóa server đang ký; backup: khóa dự phòng, khóa riêng chỉ nằm trong kho mật khẩu ngoại tuyến.",
  "staging": {
    "active": { "kid": "stg-2026-10-1", "x": "<x của stg-2026-10-1>" },
    "backup": { "kid": "stg-2026-10-1-b", "x": "<x của stg-2026-10-1-b>" }
  }
}
```

Kiểm độ dài:

```bash
cd server && node -e 'const k=require("./keys/public-keys.json");for(const [r,v] of Object.entries(k.staging))console.log(r,v.kid,Buffer.from(v.x,"base64url").length)'
```

Expected:

```
active stg-2026-10-1 32
backup stg-2026-10-1-b 32
```

Kiểm khóa dự phòng trong kho khớp mục `backup`, mà không hiện khóa riêng. Chọn cách ứng với kho đã dùng ở Step 6:

```bash
cd server
# 1Password: op read đưa khóa thẳng vào pipe
op read "op://Private/Meeting Translator token key stg-2026-10-1-b/password" | node scripts/jwk-public.mjs --check staging backup
# Bitwarden: khóa ở dòng đầu của ghi chú
bw get notes "Meeting Translator token key stg-2026-10-1-b" | head -1 | node scripts/jwk-public.mjs --check staging backup
# Cách clipboard: mở mục trong kho, copy khóa, rồi dán vào lệnh read (không hiện ra), Enter
read -rs JWK && printf '%s' "$JWK" | node scripts/jwk-public.mjs --check staging backup; unset JWK; printf '' | pbcopy
```

Expected:

```
{"kid":"stg-2026-10-1-b","x":"<x của stg-2026-10-1-b>"}
khớp: staging.backup = stg-2026-10-1-b
```

Nếu in `KHÔNG khớp`: khóa trong kho và `x` trong file khác nhau. Sửa `x` cho đúng (dòng đầu vừa in là `x` tính từ khóa trong kho), hoặc tạo lại khóa dự phòng. Khóa đang dùng được kiểm bằng chữ ký token thật ở Task 20, Step 5.

- [ ] **Step 8: Secret của Worker admin**

```bash
cd server
pnpm exec wrangler secret put PAYOS_CLIENT_ID -c wrangler.admin.jsonc --env staging
pnpm exec wrangler secret put PAYOS_API_KEY -c wrangler.admin.jsonc --env staging
pnpm exec wrangler secret put PAYOS_CHECKSUM_KEY -c wrangler.admin.jsonc --env staging
pnpm exec wrangler secret put RESEND_API_KEY -c wrangler.admin.jsonc --env staging
```

Expected: như Step 5, với Worker `mt-license-admin-staging`.

- [ ] **Step 9: Deploy hai Worker**

```bash
cd server && pnpm check && pnpm exec wrangler deploy --env staging && pnpm exec wrangler deploy -c wrangler.admin.jsonc --env staging
```

Expected:
- `pnpm check` xanh như Task 18.
- Worker API in `Uploaded mt-license-staging`, `Deployed mt-license-staging triggers`, URL `https://mt-license-staging.<subdomain>.workers.dev`, `schedule: */5 * * * *`, `Current Version ID: …`.
- Worker admin in URL `https://mt-license-admin-staging.<subdomain>.workers.dev`.
- Ghi lại `<subdomain>`, rồi đặt `STG` và `ADMIN` như ở đầu task.
- Nếu deploy báo thiếu secret (`secrets.required`), wrangler liệt kê tên còn thiếu: quay lại Step 5 hoặc Step 8.

- [ ] **Step 10: Thử nhanh Worker API**

```bash
curl -s "$STG/v1/health"; echo
curl -s -X POST "$STG/v1/webhooks/payos" -H 'content-type: application/json' -d '{"data":{},"signature":"x"}'; echo
curl -s "$STG/admin/whoami"; echo
```

Expected:

```
{"ok":true}
{"error":"invalid_signature"}
{"error":"not_found"}
```

Webhook sai chữ ký ở lệnh thứ hai tạo một cảnh báo `webhook_bad_signature`. Trong vòng 5 phút, `OPERATOR_EMAIL` nhận thư `[license staging] Cảnh báo: webhook_bad_signature (1)` (có thể nằm trong Spam).

**Kênh cảnh báo không qua Resend (QĐ27).** `wrangler.jsonc` đã bật Workers Issues (`observability.issues.enabled`). Dashboard > Workers & Pages > `mt-license-staging` > Issues:
- Expected: trang Issues đã bật (không còn nút Enable issues).
- Nếu chủ dự án có kênh chat, webhook hay công cụ incident nhận được thông báo: Automations > Add automation, trigger "Occurrence threshold" = 1, chọn destination đó, bật Enabled, Create. Expected: automation hiện trong danh sách với trạng thái Enabled.
- Không có kênh nào như vậy: bỏ qua automation; đây là rủi ro chấp nhận (QĐ27), người vận hành xem trang Issues định kỳ.

- [ ] **Step 11: Bật Cloudflare Access cho Worker admin, đặt cookie, `ACCESS_AUD`, `API_ORIGIN`**

a. Dashboard > Workers & Pages > `mt-license-admin-staging` > tab Access > Protect this Worker behind Access > chọn **All traffic**. Ở Authentication policy, chọn "Cloudflare account" (thành viên của tài khoản), hoặc Email domain của người vận hành. Bấm Apply Access.

   Expected: mở `$ADMIN/admin/whoami` trong trình duyệt, đăng nhập Access, trang hiện `{"error":"forbidden"}`. Worker từ chối vì `ACCESS_AUD` còn trống (fail closed, QĐ6).

b. Cookie: Zero Trust > Access controls > Applications > ứng dụng Access của Worker `mt-license-admin-staging` > Configure > Advanced settings > Cookie settings:
   - **SameSite Attribute: Lax**. Không chọn Strict: tài liệu Cloudflare cảnh báo Strict có thể gây `ERR_TOO_MANY_REDIRECTS`, và CSRF đã chặn trong Worker (QĐ30);
   - **HttpOnly: bật** (mặc định đã bật);
   - **Binding Cookie: bật**.

   Bấm Save.

c. Trong ứng dụng đó, chép "Application Audience (AUD) Tag". Trong `env.staging.vars` của `wrangler.admin.jsonc`:
   - `ACCESS_AUD` là AUD tag vừa chép;
   - `API_ORIGIN` là giá trị của `$STG`: `https://mt-license-staging.<subdomain>.workers.dev`, không có `/` ở cuối.

   Deploy lại:

   ```bash
   cd server && pnpm exec wrangler deploy -c wrangler.admin.jsonc --env staging
   ```

d. Kiểm:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' "$ADMIN/admin/whoami"
   ```

   Expected:
   - `302` (chuyển tới trang đăng nhập Access) hoặc `401`/`403`, không bao giờ `200`.
   - Mở `$ADMIN/admin/whoami` trong trình duyệt (đăng nhập Access nếu được hỏi): trang hiện `{"operator":"<email của bạn>"}`.
   - Trong DevTools của trình duyệt > Application (Storage) > Cookies > `$ADMIN`: cookie `CF_Authorization` có SameSite `Lax` và có dấu HttpOnly; có thêm cookie `CF_Binding`.
   - Trình duyệt không báo `ERR_TOO_MANY_REDIRECTS`.
   - Binding Cookie có thể không hợp với công cụ ngoài trình duyệt. Chạy `cloudflared access login "$ADMIN" && cloudflared access curl "$ADMIN/admin/whoami"`: Expected `{"operator":"<email của bạn>"}`. Nếu lệnh này bị chuyển hướng hay trả 403: tắt Binding Cookie ở bước b, Save, chạy lại, và ghi vào kế hoạch 00 là rủi ro chấp nhận (QĐ30).

- [ ] **Step 12: Đăng ký webhook với PayOS qua `confirm-webhook`**

Cần `cloudflared` để gọi `POST` qua Access: `brew install cloudflared`, cài bằng Homebrew, không cần quyền admin.

```bash
cloudflared access login "$ADMIN"
cloudflared access curl "$ADMIN/admin/payos/confirm-webhook" -X POST -H 'content-type: application/json' \
  -d "{\"webhook_url\":\"$STG/v1/webhooks/payos\"}"; echo
cloudflared access curl "$ADMIN/admin/payos/confirm-webhook" -X POST -H 'content-type: application/json' \
  -d '{"webhook_url":"https://evil.example/v1/webhooks/payos"}'; echo
```

Expected:
- Lệnh thứ hai: `{"ok":true,"webhook_url":"https://mt-license-staging.<subdomain>.workers.dev/v1/webhooks/payos"}`.
- Lệnh thứ ba: `{"error":"invalid_request","field":"webhook_url"}`, vì URL không nằm trên `API_ORIGIN` (QĐ30).
- Trên my.payos.vn, kênh staging hiện đúng Webhook URL.
- Nếu nhận `payment_provider_error`, xem `message`: PayOS không gọi được URL, hoặc URL trả khác 2xx.

- [ ] **Step 13: Commit cấu hình và khóa công khai**

```bash
git add server/wrangler.jsonc server/wrangler.admin.jsonc server/keys/public-keys.json
git diff --cached | grep -E '^\+.*"d"\s*:' ; echo "grep_exit=$?"
git diff --cached | grep -iE '^\+.*minimumReleaseAge' ; echo "grep_exit=$?"
git commit -m "chore(server): D1, Access và khóa công khai của staging" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: hai lần `grep_exit=1`. Diff chỉ có `database_id`, `ACCESS_AUD`, `API_ORIGIN`, `account_id` (nếu có) và khóa công khai `x`; không có khóa riêng `d`, không có `minimumReleaseAgeExclude`.

## Task 20 (người): Giao dịch thử trên staging

**Cần người thao tác:** trả tiền thật (2.000 đ), đọc email, xem dashboard. Đây là test tích hợp của §11 (dòng 294), vì PayOS không có môi trường test. `STG` và `ADMIN` như Task 19.

- [ ] **Step 1: Tạo đơn**

Nếu PayOS từ chối số tiền 2.000 đ (P05-2): sửa `PRICES_JSON` trong `env.staging`, deploy lại, rồi làm lại bước này.

```bash
read -r BUYER_EMAIL          # gõ email của tài khoản Resend; không vào lịch sử shell
curl -s "$STG/v1/checkout" -H 'content-type: application/json' \
  -d "{\"plan\":\"pro_1m\",\"email\":\"$BUYER_EMAIL\",\"consent\":true}"; echo
```

Expected: `{"order_code":1,"order_token":"<43 ký tự>","checkout_url":"https://pay.payos.vn/web/…","qr_code":"000201…","amount":2000,"currency":"VND","expires_at":…}`.
- Nếu nhận `{"error":"payment_provider_error"}`: Logs có dòng `checkout_failed` kèm mã lỗi của PayOS. Mã `201` (sai chữ ký) nghĩa là checksum key sai.
- Đặt `ORDER=<order_code>` và `OTOKEN=<order_token>` (chỉ trong shell này).

- [ ] **Step 2: Trả tiền**

Mở `checkout_url` trong trình duyệt, quét VietQR bằng app ngân hàng, chuyển đúng 2.000 đ. Nội dung chuyển khoản là `MT1`, app ngân hàng tự điền.

Expected: trang PayOS báo thành công và chuyển về `…/v1/pay/return`, trang này có dòng "Đã nhận thanh toán".

- [ ] **Step 3: App hỏi đơn (token trong header, QĐ25)**

```bash
curl -s "$STG/v1/orders/$ORDER" -H "authorization: Bearer $OTOKEN"; echo
```

Expected: trong vài giây, `"status":"paid"`, kèm `"license_key":"XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"`, `"license_expires_at"` (khoảng bây giờ + 30 ngày) và `"renewal":false`. Nếu vẫn `pending` sau 5 phút: xem Logs (webhook có tới không). Tới lần chạy cron kế tiếp, đối soát phải tự cấp.

- [ ] **Step 4: Email**

Expected: hộp thư `BUYER_EMAIL` nhận một thư (có thể nằm trong Spam), chứa đúng key ở Step 3 và ngày hết hạn.

- [ ] **Step 5: Kích hoạt bằng một máy giả, kiểm chữ ký token bằng `keys/public-keys.json` (QĐ31)**

```bash
cd server
KEY='<license_key>'
DEV=$(printf 'staging-test-device' | shasum -a 256 | cut -d' ' -f1)
RES=$(curl -s "$STG/v1/licenses/activate" -H 'content-type: application/json' \
  -d "{\"key\":\"$KEY\",\"device_id_hash\":\"$DEV\",\"device_label\":\"Máy thử staging\"}")
TOKEN=$(printf '%s' "$RES" | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>process.stdout.write(JSON.parse(s).token))')
ACT=$(printf '%s' "$RES" | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>process.stdout.write(JSON.parse(s).activation_id))')
printf '%s' "$TOKEN" | node scripts/verify-token.mjs staging
```

Expected:
- Dòng đầu `OK staging active stg-2026-10-1`: chữ ký token khớp khóa công khai `active` trong `keys/public-keys.json`, tức khóa riêng trong secret khớp khóa app sẽ build sẵn.
- Dòng sau là claims: `"plan":"pro"`, `"device_id_hash"` bằng `$DEV`, và `refresh_before - issued_at = 1209600`.
- Nếu in `FAIL bad_signature` hay `FAIL unknown_kid`: `x` trong `keys/public-keys.json` không ứng với khóa đã đưa vào `TOKEN_SIGNING_JWK`. Tạo lại khóa đang dùng (Task 19, Step 6) và sửa file.

- [ ] **Step 6: Validate, gỡ máy, validate lại**

```bash
curl -s "$STG/v1/licenses/validate" -H 'content-type: application/json' -d "{\"key\":\"$KEY\",\"activation_id\":\"$ACT\"}" | head -c 60; echo
curl -s "$STG/v1/licenses/deactivate" -H 'content-type: application/json' -d "{\"key\":\"$KEY\",\"activation_id\":\"$ACT\"}"; echo
curl -s "$STG/v1/licenses/validate" -H 'content-type: application/json' -d "{\"key\":\"$KEY\",\"activation_id\":\"$ACT\"}"; echo
```

Expected: lần lượt `{"token":"v1.…` (token mới), `{"ok":true}`, rồi `{"error":"activation_not_found"}`.

- [ ] **Step 7: Khôi phục key**

```bash
curl -s "$STG/v1/licenses/recover" -H 'content-type: application/json' -d "{\"email\":\"$BUYER_EMAIL\"}"; echo
```

Expected: `{"ok":true}`, và hộp thư nhận thêm một thư chứa key.

- [ ] **Step 8: Xem bằng admin**

```bash
cloudflared access curl "$ADMIN/admin/lookup" -X POST -H 'content-type: application/json' -d "{\"order_code\":$ORDER}"; echo
```

Expected:
- Đơn có `status: "paid"`, `amount_paid: 2000`, `email_sent_at` có giá trị.
- License có một activation đã gỡ, với `deactivated_by: "user"`.
- `audit` của license có `license_issued`, `activated`, `deactivated`; không có dòng nào chứa email khách.

- [ ] **Step 9: Cron và log**

Workers & Pages > `mt-license-staging` > Logs, lọc `reconcile`.

Expected:
- Cứ khoảng 5 phút có một dòng `{"event":"reconcile","checked":…,"granted":…,"errors":0,"emails_retried":0,"alerts_sent":…}`.
- Không có invocation log nào (log có URL của request), vì đã tắt ở QĐ25; tìm `order` hay `token` trong Logs không ra URL nào chứa `order_token`.

- [ ] **Step 10: Ghi kết quả**

Ghi vào kế hoạch 00 (Task 22 của kế hoạch này):
- ngày thử, số tiền, `order_code`, thời gian từ lúc chuyển tiền tới khi `paid`, có email và thư cảnh báo hay không;
- dòng 294 và §14 giả định 7: "PayOS không có sandbox; giao dịch 2.000 đ trên staging đạt".

Không ghi email, key hay token.

## Task 21 (người): Lên production

**Chỉ làm khi đã có:**
- Q1: tên miền (gọi là `<tên miền license>` cho Worker API, ví dụ `license.<tên miền>`), dùng DNS của Cloudflare trên cùng tài khoản;
- Q2: giá;
- Q9: thời gian lưu dữ liệu;
- Q10: có phải phát hóa đơn không. Nếu phải phát hóa đơn qua PayOS, viết kế hoạch bổ sung và làm xong trước task này;
- Q11: xác nhận cách tạo và giữ khóa;
- kênh thanh toán PayOS cho production (P05-1).

**Cần người thao tác** như Task 19. Trong task này: `PROD=https://<tên miền license>` và `PADMIN=https://mt-license-admin-production.<subdomain>.workers.dev`.

**Files:**
- Modify: `server/wrangler.jsonc`, `server/wrangler.admin.jsonc` (khối `env.production`), `server/keys/public-keys.json` (thêm khối `production`)

- [ ] **Step 1: Kiểm điều kiện.** Mỗi mục ở trên có quyết định ghi ở mục 8 của kế hoạch 00. Staging đã qua Task 20.

- [ ] **Step 2: Tên miền gửi email trên Resend.** Resend > Domains > Add Domain: nhập tên miền gửi, chọn vùng `ap-northeast-1` (Tokyo), rồi ghi vùng đã chọn vào mục "Nơi lưu dữ liệu cá nhân". Thêm các bản ghi DNS mà Resend hiện (SPF, DKIM, bản ghi cho return path) vào Cloudflare DNS.

   Expected: trạng thái tên miền trên Resend là `Verified`.

- [ ] **Step 3: Sửa `env.production` rồi kiểm cấu hình**

   Trong `env.production` của `wrangler.jsonc`:
   - `EMAIL_FROM`: `"<tên sản phẩm> <license@<tên miền gửi>>"`;
   - `PRICES_JSON`: theo Q2, ví dụ `"{\"pro_1m\":{\"VND\":<giá 1 tháng>},\"pro_12m\":{\"VND\":<giá 12 tháng>}}"`;
   - thêm `"routes": [{ "pattern": "<tên miền license>", "custom_domain": true }]` và đặt `"workers_dev": false`.

   Trong `env.production` của `wrangler.admin.jsonc`: `EMAIL_FROM` giống trên.

   ```bash
   cd server && pnpm exec wrangler deploy --dry-run --env production
   ```

   Expected: `--dry-run: exiting now.`, và bảng binding có `env.PRICES_JSON` khác `""`, `env.EMAIL_FROM` là địa chỉ trên tên miền gửi.

- [ ] **Step 4: D1 production, migration, giữ chỗ số đơn (QĐ18)**

   ```bash
   cd server && pnpm exec wrangler d1 create mt-license-production --location apac --env production --binding DB
   git diff -- wrangler.jsonc
   ```

   Expected: `✅ Successfully created DB 'mt-license-production' in region APAC`; `git diff` chỉ đổi dòng `database_id` của `mt-license-production`. Chép cùng ID vào dòng `mt-license-production` trong `env.production` của `wrangler.admin.jsonc`, rồi kiểm:

   ```bash
   cd server && grep -n '"mt-license-production"' wrangler.jsonc wrangler.admin.jsonc
   ```

   Expected: hai dòng, cùng một `database_id`, khác toàn số 0.

   ```bash
   cd server && pnpm exec wrangler d1 migrations apply mt-license-production --env production --remote
   pnpm exec wrangler d1 execute mt-license-production --env production --remote --command "INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES (1000000, 'reserved', 'none', 'pro_1m', 0, 'VND', 0, 'failed', 0, 0); DELETE FROM orders WHERE order_code = 1000000;"
   pnpm exec wrangler d1 execute mt-license-production --env production --remote --command "SELECT (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS seq, (SELECT COUNT(*) FROM orders) AS orders"
   ```

   Expected:
   - Migration: bảng `Migrations to be applied:` có `0001_init.sql`, trả lời `y`, rồi ✅.
   - Lệnh giữ chỗ chạy không lỗi (câu lệnh đúng như test `đặt số đơn bắt đầu` ở Task 12).
   - Lệnh cuối in `seq` = `1000000` và `orders` = `0`: đơn đầu tiên của production sẽ là 1000001.

- [ ] **Step 5: Secret của Worker API production.** Dùng kênh thanh toán PayOS của production.

   ```bash
   cd server
   pnpm exec wrangler secret put PAYOS_CLIENT_ID --env production
   pnpm exec wrangler secret put PAYOS_API_KEY --env production
   pnpm exec wrangler secret put PAYOS_CHECKSUM_KEY --env production
   pnpm exec wrangler secret put RESEND_API_KEY --env production
   pnpm exec wrangler secret put OPERATOR_EMAIL --env production
   openssl rand -base64 32 | pnpm exec wrangler secret put RATE_LIMIT_PEPPER --env production
   ```

   Expected: lệnh đầu hỏi tạo Worker `mt-license-production`: trả lời `y`; mỗi lệnh kết thúc bằng `✨ Success! Uploaded secret <TÊN>`.

- [ ] **Step 6: Khóa ký production.** Nếu đã có CI (Q3), tạo khóa trong một job CI chạy tay thay vì trên máy dev (Q11), rồi bỏ qua bước này. Trên máy dev:

   ```bash
   cd server && node scripts/gen-token-key.mjs prod-<năm>-<tháng>-1 | pnpm exec wrangler secret put TOKEN_SIGNING_JWK --env production
   node scripts/gen-token-key.mjs prod-<năm>-<tháng>-1-b --vault op | op item create --vault Private - >/dev/null && echo "đã lưu vào 1Password"
   ```

   Với Bitwarden hay clipboard, thay lệnh thứ hai bằng cách tương ứng ở Task 19, Step 6.

   Expected: hai dòng khóa công khai (`prod-…` và `prod-…-b`), `✨ Success! Uploaded secret TOKEN_SIGNING_JWK`, rồi `đã lưu vào 1Password`. Chép lại hai giá trị `x`.

- [ ] **Step 7: Thêm khối `production` vào `keys/public-keys.json`, kiểm khóa dự phòng**

   ```json
   "production": {
     "active": { "kid": "prod-<năm>-<tháng>-1", "x": "<x của khóa đang dùng>" },
     "backup": { "kid": "prod-<năm>-<tháng>-1-b", "x": "<x của khóa dự phòng>" }
   }
   ```

   ```bash
   cd server && node -e 'const k=require("./keys/public-keys.json");for(const [r,v] of Object.entries(k.production))console.log(r,v.kid,Buffer.from(v.x,"base64url").length)'
   op read "op://Private/Meeting Translator token key prod-<năm>-<tháng>-1-b/password" | node scripts/jwk-public.mjs --check production backup
   ```

   Expected: `active prod-… 32`, `backup prod-…-b 32`, rồi `khớp: production.backup = prod-…-b`. Với Bitwarden hay clipboard, dùng lệnh kiểm tương ứng ở Task 19, Step 7.

- [ ] **Step 8: Secret của Worker admin production**

   ```bash
   cd server
   pnpm exec wrangler secret put PAYOS_CLIENT_ID -c wrangler.admin.jsonc --env production
   pnpm exec wrangler secret put PAYOS_API_KEY -c wrangler.admin.jsonc --env production
   pnpm exec wrangler secret put PAYOS_CHECKSUM_KEY -c wrangler.admin.jsonc --env production
   pnpm exec wrangler secret put RESEND_API_KEY -c wrangler.admin.jsonc --env production
   ```

   Expected: như Step 5, với Worker `mt-license-admin-production`.

- [ ] **Step 9: Deploy Worker API với tên miền riêng**

   ```bash
   cd server && pnpm check && pnpm exec wrangler deploy --env production
   curl -s "$PROD/v1/health"; echo
   ```

   Expected:
   - Wrangler in `Uploaded mt-license-production`, `Deployed mt-license-production triggers`, dòng `<tên miền license> (custom domain)`, `schedule: */5 * * * *`.
   - `curl` in `{"ok":true}`. Tên miền riêng có thể cần vài phút để cấp chứng chỉ; nếu lỗi TLS thì chờ rồi thử lại.
   - Workers Issues của `mt-license-production` đã bật; thêm automation như Task 19, Step 10 nếu có kênh nhận.

- [ ] **Step 10: Deploy Worker admin, bật Access, cookie, `ACCESS_AUD`, `API_ORIGIN`**

   ```bash
   cd server && pnpm exec wrangler deploy -c wrangler.admin.jsonc --env production
   ```

   Expected: URL `https://mt-license-admin-production.<subdomain>.workers.dev`.

   Rồi:
   - Bật Access cho `mt-license-admin-production` như Task 19, Step 11a. Expected: `$PADMIN/admin/whoami` trong trình duyệt trả `{"error":"forbidden"}` (chưa có `ACCESS_AUD`).
   - Đặt cookie như Task 19, Step 11b: **SameSite Lax**, **HttpOnly bật**, **Binding Cookie bật** (tắt nếu `cloudflared access curl` hỏng, như Task 19, Step 11d).
   - Trong `env.production.vars` của `wrangler.admin.jsonc`: `ACCESS_AUD` là AUD tag của ứng dụng Access này; `API_ORIGIN` là `https://<tên miền license>`.

   ```bash
   cd server && pnpm exec wrangler deploy -c wrangler.admin.jsonc --env production
   curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/admin/whoami"
   ```

   Expected:
   - `302`, `401` hoặc `403`, không bao giờ `200`.
   - Trình duyệt, sau khi đăng nhập Access: `{"operator":"<email của bạn>"}`.
   - DevTools > Cookies > `$PADMIN`: `CF_Authorization` có SameSite `Lax` và HttpOnly, có `CF_Binding` (nếu bật); trình duyệt không báo `ERR_TOO_MANY_REDIRECTS`.
   - `cloudflared access login "$PADMIN" && cloudflared access curl "$PADMIN/admin/whoami"` in `{"operator":"<email của bạn>"}`.

- [ ] **Step 11: Đăng ký webhook production với PayOS**

   ```bash
   cloudflared access login "$PADMIN"
   cloudflared access curl "$PADMIN/admin/payos/confirm-webhook" -X POST -H 'content-type: application/json' \
     -d "{\"webhook_url\":\"$PROD/v1/webhooks/payos\"}"; echo
   ```

   Expected: `{"ok":true,"webhook_url":"https://<tên miền license>/v1/webhooks/payos"}`, và kênh production trên my.payos.vn hiện đúng Webhook URL.

- [ ] **Step 12: Giao dịch thật đầu tiên, kiểm `kid` và chữ ký token**

   Chủ dự án mua một gói ở giá thật, làm như Task 20 Step 1–4 với `$PROD` thay cho `$STG`.

   Expected ở Step 1: `"order_code":1000001` và mô tả chuyển khoản `MT1000001`.

   Rồi kích hoạt một máy giả và kiểm token:

   ```bash
   cd server
   KEY='<license_key>'
   DEV=$(printf 'production-test-device' | shasum -a 256 | cut -d' ' -f1)
   RES=$(curl -s "$PROD/v1/licenses/activate" -H 'content-type: application/json' \
     -d "{\"key\":\"$KEY\",\"device_id_hash\":\"$DEV\",\"device_label\":\"Máy thử production\"}")
   TOKEN=$(printf '%s' "$RES" | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>process.stdout.write(JSON.parse(s).token))')
   ACT=$(printf '%s' "$RES" | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>process.stdout.write(JSON.parse(s).activation_id))')
   printf '%s' "$TOKEN" | node scripts/verify-token.mjs production
   curl -s "$PROD/v1/licenses/deactivate" -H 'content-type: application/json' -d "{\"key\":\"$KEY\",\"activation_id\":\"$ACT\"}"; echo
   ```

   Expected:
   - `OK production active prod-<năm>-<tháng>-1`, và claims có `"kid":"prod-…"` (không phải `stg-…` hay `test-…`).
   - Lệnh cuối in `{"ok":true}`: máy giả đã được gỡ.
   - Nếu không dùng key thử đó nữa: thu hồi bằng `/admin/licenses/<license_id>/revoke` (Phụ lục B).

- [ ] **Step 13: Commit**

   ```bash
   git add server/wrangler.jsonc server/wrangler.admin.jsonc server/keys/public-keys.json
   git diff --cached | grep -E '^\+.*"d"\s*:' ; echo "grep_exit=$?"
   git diff --cached | grep -iE '^\+.*minimumReleaseAge' ; echo "grep_exit=$?"
   git commit -m "chore(server): cấu hình production (tên miền, giá, D1, Access, khóa công khai)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
   ```

   Expected: hai lần `grep_exit=1`.

## Task 22: Cập nhật kế hoạch 00

Làm theo Task 2 của `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`.

**Files:**
- Modify: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`

- [ ] **Step 1: Cập nhật trạng thái các dòng ở mục "Dòng của bảng đối chiếu mà kế hoạch này nhận"**
  - Dòng có test chứng minh thì chuyển `xong`, kèm SHA commit.
  - Dòng 294 và dòng 169 (phần đăng ký webhook) chuyển `xong` khi Task 19–20 đạt; trước đó để `chờ`, kèm mã T4, T5, T6.
  - Dòng 175 để `chờ` (Q1), vì email production cần tên miền đã xác thực.
  - Dòng 13 và dòng 166 để `chờ` (Q2) cho phần giá production.
- [ ] **Step 2: Thêm vào mục 6.2 (kiểm tra chuẩn)**

```bash
pnpm -C server install --frozen-lockfile
pnpm -C server check
pnpm -C server audit
```

Expected: `pnpm -C server check` in `Tests  173 passed (173)` (lúc lập kế hoạch), và 4 lần `--dry-run: exiting now.`
- [ ] **Step 3: Ghi vào mục 8 của kế hoạch 00**
  - P05-1 tới P05-6.
  - Thêm vào Q12 (lệch nhỏ với spec, đề xuất sửa chữ ở lần cập nhật spec kế tiếp):
    - module thêm ở `server/src` và Worker admin riêng (QĐ22, QĐ6);
    - lịch đối soát giãn sau giờ đầu (QĐ9);
    - `GET /v1/orders/{orderCode}` nhận `order_token` trong header `Authorization`, không trong query `?token=` (QĐ25);
    - tên trường JSON `snake_case`: `checkout_url`, `qr_code`, `order_code` thay cho `checkoutUrl`, `qrCode`, `orderCode` (QĐ26);
    - webhook là route chung `/v1/webhooks/{provider}` (QĐ28);
    - `POST /v1/checkout` có thêm `consent` (QĐ24).
  - Ghi vào mục 5.3: T5 cần kênh PayOS thứ hai cho staging (P05-1).
  - Ghi vào mục 6.5 tên secret đã chốt: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `RESEND_API_KEY`, `TOKEN_SIGNING_JWK`, `RATE_LIMIT_PEPPER`, `OPERATOR_EMAIL` (không bắt buộc). Worker admin chỉ có bốn secret đầu.
  - Ghi vào mục 6.1 luật tuổi phát hành của pnpm (không commit `minimumReleaseAgeExclude`), nếu kế hoạch 01 chưa ghi.
- [ ] **Step 4: Kiểm định dạng bảng và commit**, theo Task 2, Step 5–6 của kế hoạch 00.

---

## Phụ lục A: Đổi khóa ký token khi khóa bị lộ (§10.2)

1. **Đưa khóa dự phòng lên làm khóa ký, không hiện khóa ra màn hình.** Chọn cách ứng với kho mật khẩu:

   ```bash
   cd server
   # 1Password
   op read "op://Private/Meeting Translator token key prod-<…>-b/password" | pnpm exec wrangler secret put TOKEN_SIGNING_JWK --env production
   # Bitwarden (khóa ở dòng đầu của ghi chú)
   bw get notes "Meeting Translator token key prod-<…>-b" | head -1 | pnpm exec wrangler secret put TOKEN_SIGNING_JWK --env production
   # Không có CLI: chạy lệnh dưới, copy khóa từ kho, dán vào prompt ẩn `Enter a secret value:`, rồi xóa clipboard
   pnpm exec wrangler secret put TOKEN_SIGNING_JWK --env production; printf '' | pbcopy
   ```

   `secret put` tạo và triển khai version mới ngay, không cần deploy. Từ lúc này, mọi token mới mang `kid` của khóa dự phòng; app đã có sẵn khóa công khai của nó.
2. **Kiểm server đang ký bằng khóa dự phòng:** kích hoạt một máy giả rồi kiểm token như Task 21, Step 12. Expected: `OK production backup prod-<…>-b`. Gỡ máy giả đó sau khi kiểm.
3. **Tạo khóa dự phòng mới**, đưa thẳng vào kho mật khẩu như Task 19, Step 6. `kid` mới lấy số thứ tự kế tiếp, ví dụ `prod-<năm>-<tháng>-2-b`; `gen-token-key.mjs` từ chối nếu `kid` đã có trong `keys/public-keys.json`, kể cả `kid` bị lộ (vẫn còn trong file tới bước 4).
4. **Sửa `keys/public-keys.json`:**
   - `active` là khóa dự phòng cũ;
   - `backup` là khóa vừa tạo;
   - bỏ khóa bị lộ.

   Kiểm khóa dự phòng mới trong kho khớp mục `backup` bằng `jwk-public.mjs --check production backup` (Task 19, Step 7). Commit, rồi phát hành bản cập nhật app mang hai khóa này (kế hoạch 07). Bản mới không còn nhận `kid` bị lộ.
5. Các bản app cũ vẫn nhận token ký bằng khóa bị lộ cho tới khi được cập nhật. Server không ký bằng khóa đó nữa. Vì vậy token giả chỉ dùng được trên bản app chưa cập nhật, trong phạm vi của `refresh_before` mà kẻ giả tự đặt. Đây là rủi ro còn lại, đã chấp nhận ở §10.2.
6. Ghi sự cố vào nhật ký vận hành, kèm ngày, `kid` bị lộ và `kid` mới.

## Phụ lục B: Thao tác admin

Đặt `ADMIN=https://mt-license-admin-<env>.<subdomain>.workers.dev` (hoặc tên miền admin), rồi chạy `cloudflared access login "$ADMIN"` một lần. `GET /admin/whoami` mở được thẳng bằng trình duyệt đã đăng nhập Access.
- Mọi request không phải `GET` phải có `-H 'content-type: application/json'` và một body JSON (có thể là `{}`), không thì Worker trả `415` (QĐ30).
- Mọi thao tác thay đổi đều cần `note`: lý do và mã giao dịch nếu có. Không ghi email khách vào `note`.
- Kết quả trả về dạng JSON. Mỗi thao tác, kể cả tra cứu, ghi một dòng `audit_log`, với actor `admin:<email người vận hành>`.

| Việc | Lệnh |
|---|---|
| Kiểm đăng nhập Access | `cloudflared access curl "$ADMIN/admin/whoami"` |
| Tra theo email | `… "$ADMIN/admin/lookup" -X POST … -d '{"email":"<email>"}'` |
| Tra theo đơn | `… "$ADMIN/admin/lookup" -X POST … -d '{"order_code":<n>}'` |
| Trạng thái đơn trên cổng thanh toán | `cloudflared access curl "$ADMIN/admin/orders/<n>/payment-status"` |
| Cấp tay cho đơn (chuyển thiếu rồi chuyển bù) | `… "$ADMIN/admin/orders/<n>/grant" -X POST … -d '{"note":"…"}'` |
| Cấp license mới không qua đơn | `… "$ADMIN/admin/licenses" -X POST … -d '{"email":"…","plan":"pro_1m","note":"…"}'` |
| Gia hạn tay | `… "$ADMIN/admin/licenses/<license_id>/extend" -X POST … -d '{"days":30,"note":"…"}'` |
| Gửi lại key | `… "$ADMIN/admin/licenses/<license_id>/resend" -X POST … -d '{}'` |
| Mở khóa key bị khóa tạm | `… "$ADMIN/admin/licenses/<license_id>/unlock" -X POST … -d '{"note":"…"}'` |
| Thu hồi key | `… "$ADMIN/admin/licenses/<license_id>/revoke" -X POST … -d '{"note":"…"}'` |
| Gỡ một activation | `… "$ADMIN/admin/activations/<activation_id>/deactivate" -X POST … -d '{"note":"…"}'` |
| Xóa dữ liệu cá nhân theo email (Q9) | `… "$ADMIN/admin/erase" -X POST … -d '{"email":"…","note":"…"}'` |
| Đăng ký webhook với PayOS | `… "$ADMIN/admin/payos/confirm-webhook" -X POST … -d '{"webhook_url":"<API_ORIGIN>/v1/webhooks/payos"}'` |

`…` là `cloudflared access curl` ở đầu, và `-H 'content-type: application/json'` trước `-d`.

## Tự rà soát (writing-plans)

- **Độ phủ spec.** Mỗi dòng của bảng đối chiếu có task nhận (bảng ở đầu kế hoạch). §6.8 phía server được phủ đủ: API, PayOS, token, admin, email, các quy tắc về gia hạn, máy bị gỡ từ xa, giới hạn VND. Phần quota, lịch `validate` và mua trong app là của 06.
- **Placeholder.** Không có trong code. Chỉ còn các giá trị người làm điền từ tài khoản thật: `database_id`, `<subdomain>`, `ACCESS_AUD`, `API_ORIGIN`, khóa công khai `x`, giá production, tên miền.
- **Kiểu nhất quán.** Replay 18 task (xem "Đã chạy thử") dựng lại đúng từng file của bản đã test, và `tsc --noEmit` xanh sau mỗi task có code.
- **Test bắt được lỗi thật.** Lúc lập kế hoạch đã thử bỏ từng điều kiện trong code, và mỗi lần đều có test đỏ: `status = paid`, `amountPaid ≥ amount`, `amount` khớp đơn, kiểm license thu hồi hay hết hạn ở `validate`, đếm `validate` theo key đã chuẩn hóa; khóa tạm: trừ lần gỡ chính máy đang kích hoạt, chặn mọi máy không đang kích hoạt khi đã khóa; IP bị chặn: chỉ cho qua key hợp lệ kèm activation đang hoạt động (không chặn cả trường hợp này, và không cho qua mọi key thật); gửi lại email: giãn thời gian, không gửi lại lỗi vĩnh viễn, chỉ 400 và 422 là lỗi vĩnh viễn, cảnh báo một lần mỗi đơn.

## Đã chạy thử lúc lập kế hoạch

- Làm trong worktree tách riêng, rồi chạy lại Task 1–18 trong một worktree mới, đúng thứ tự và đúng lệnh của kế hoạch. Mọi bước "thấy lỗi" đều lỗi đúng lý do; mọi bước "chạy test" đều xanh.
- Cây `server/` dựng lại giống hệt bản đã test (`diff -r`, không tính `node_modules` và `.wrangler`). `pnpm install` không ghi `minimumReleaseAgeExclude`, vì mọi bản đã chốt đều ra được ít nhất 1 ngày.
- Kết quả cuối (`pnpm check`): `Test Files  17 passed (17)`, `Tests  173 passed (173)`; `tsc` sạch; 4 lần `wrangler deploy --dry-run` qua (Worker API 107,56 KiB, gzip 28,24 KiB; Worker admin 88,86 KiB, gzip 23,29 KiB); `pnpm audit` sạch.
- **Chưa chạy được** (cần tài khoản): Task 19–21 (`wrangler login`, D1 thật, secret, deploy, Access và cookie, `confirm-webhook`, giao dịch thật), và lệnh tạo item thật bằng `op`, `bw`.
