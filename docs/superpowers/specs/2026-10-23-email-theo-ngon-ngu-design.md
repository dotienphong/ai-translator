# AI Translator: email theo ngôn ngữ app, dạng HTML — Design

**Ngày:** 2026-10-23
**Trạng thái:** Chủ dự án duyệt qua hội thoại 2026-10-23: cách A (lưu ngôn ngữ trên đơn), không biết ngôn ngữ thì đoán theo loại tiền, Web Admin tự suy (không thêm ô), thư HTML kèm bản chữ thuần theo bản mẫu đã xem (https://claude.ai/artifact/TkNhF57MUGmb6DctvdMKCj). Làm trên nhánh `email-theo-ngon-ngu` (worktree `meeting-translator-work/email-theo-ngon-ngu`); không merge, push hay deploy khi chủ dự án chưa cho phép.
**Quan hệ với spec khác:**
- Sửa spec gốc `2026-09-29-desktop-meeting-translator-design.md` §6.8, đoạn "Gửi email": câu "Email là văn bản thuần, song ngữ vi/en" thành "Email là HTML kèm bản chữ thuần; phần trên viết bằng ngôn ngữ app của khách, phần tiếng Anh ở dưới" (dẫn spec này). Các luật khác của đoạn đó (lỗi gửi không chặn cấp key, idempotency key theo đơn, phân loại lỗi Resend, lịch gửi lại) giữ nguyên.
- Sửa thư trả lời của `2026-10-22-chat-ho-tro-zalo-design.md` §2.6: thư theo `lang` của cuộc chat thay cho song ngữ vi/en cố định. Điều kiện gửi, idempotency key và Reply-To giữ nguyên.
- Chính sách quyền riêng tư lên bản 1.6 (mục 5 của spec này).

## Yêu cầu

App của khách đang ở ngôn ngữ nào thì thư gửi khách viết bằng ngôn ngữ đó, luôn kèm tiếng Anh ở dưới. Đồng thời trình bày lại thư cho đẹp.

Hiện có hai loại thư gửi khách, đều qua Resend và đều là chữ thuần song ngữ Việt trên, Anh dưới (`server/src/email/templates.ts`):
1. Thư license key, năm loại: `purchase` (mua), `renewal` (gia hạn cùng gói), `plan_change` (đổi gói), `recover` (khách tự lấy lại key), `resend` (admin gửi lại).
2. Thư trả lời chat hỗ trợ (`supportReplyEmail`).

Thư cảnh báo cho người vận hành (`alerts.ts`) không phải thư gửi khách, không đổi.

## Quyết định

- **D1. Ngôn ngữ thư lấy từ đâu.** Thư mua, gia hạn, đổi gói được gửi khi cổng thanh toán báo đã trả tiền (webhook, đối soát hay cron gửi lại), lúc đó app không có trong request. Vì vậy app gửi ngôn ngữ giao diện lúc tạo đơn và server lưu vào đơn (`orders.lang`). Không lưu ngôn ngữ trên license, không gửi ngôn ngữ ở các lần kích hoạt hay kiểm tra bản quyền.
- **D2. Không biết ngôn ngữ thì đoán theo loại tiền.** App cũ (≤ 0.2.4) không gửi ngôn ngữ: đơn USD ra tiếng Anh, đơn VND ra tiếng Việt. Không có cả ngôn ngữ lẫn loại tiền (lấy lại key từ app cũ, key cấp tay) thì ra tiếng Việt.
- **D3. Web Admin không thêm ô chọn ngôn ngữ.** "Gửi lại key" dùng đơn gần nhất của key đó; "Cấp key tay" dùng tiếng Việt.
- **D4. Thư HTML kèm bản chữ thuần.** Gửi cả `html` và `text` trong một thư (multipart/alternative); hộp thư không hiện HTML thì hiện bản chữ.
- **D5. Thứ tự hai phần.** Phần ngôn ngữ của khách ở trên, đường kẻ, phần tiếng Anh ở dưới. Ngôn ngữ của khách là tiếng Anh thì thư chỉ có tiếng Anh. Tiêu đề viết `<ngôn ngữ của khách> / <tiếng Anh>`, hay chỉ tiếng Anh. Thư tiếng Việt vẫn là Việt trên, Anh dưới như trước, chỉ đổi dạng trình bày.
- **D6. Bản dịch tiếng Nhật, Trung, Hàn** do Claude viết, không có người bản ngữ duyệt (như quyết định đã chốt cho giao diện app, spec `2026-10-12-ui-ja-zh-ko-design.md`). Tên mục và nút trong thư lấy đúng chữ của giao diện app (`src/i18n/*.ts`).

## 1. Thư nào dùng ngôn ngữ nào

Ngôn ngữ thư (`MailLang`) là một trong `vi`, `en`, `ja`, `zh`, `ko`. Một hàm duy nhất chọn ngôn ngữ thư từ ngôn ngữ đã biết và loại tiền:

```
mailLang(lang: Lang | null, currency: "VND" | "USD" | null): Lang
  lang khác null      → lang
  currency = "USD"    → "en"
  còn lại             → "vi"
```

| Thư | Ngôn ngữ | Loại tiền dùng khi không có ngôn ngữ |
|---|---|---|
| Mua, gia hạn, đổi gói (lần gửi đầu và cron gửi lại) | `orders.lang` của đơn | `orders.currency` của đơn |
| Lấy lại key (`POST /v1/licenses/recover`) | trường `lang` trong request | không có (ra `vi`) |
| Web Admin "Gửi lại key" | `orders.lang` của đơn mới nhất đã cấp cho key đó (`license_id` = key, `order_code` lớn nhất) | `orders.currency` của đơn đó; key không có đơn nào (cấp tay) ra `vi` |
| Web Admin "Cấp key tay" | không có (ra `vi`) | không có |
| Trả lời chat hỗ trợ | `support_conversations.lang` (luôn có: app gửi ngôn ngữ giao diện, website gửi ngôn ngữ trang) | không cần |

Lấy lại key có thể trả nhiều key trong một thư; mọi key dùng chung ngôn ngữ của request.

## 2. Dạng thư

Bản mẫu đã duyệt: https://claude.ai/artifact/TkNhF57MUGmb6DctvdMKCj. Chữ đầy đủ của 5 ngôn ngữ ở Phụ lục A.

### Khung chung (`layout.ts`)

- HTML dựng bằng bảng (`<table role="presentation">`), mọi kiểu đặt inline; thêm một khối `<style>` cho cỡ màn hình nhỏ và hộp thư tối. Không dùng ảnh (hầu hết hộp thư chặn ảnh từ xa, và tải ảnh là một cách theo dõi người đọc), không font web, không script, không form.
- Nền ngoài `#f1f5fb`, thẻ thư trắng rộng tối đa 560 px, viền `#dfe7f2`, bo 14 px. Màu theo website (`website/src/assets/site.css`): chữ `#0b1322`, chữ phụ `#3d4a63`, chữ mờ `#6b7891`, xanh thương hiệu `#1d63c9`, xanh đậm `#0f4aa3`, xanh nhạt `#e7f0ff`.
- Outlook cho Windows (vẽ bằng Word) bỏ qua `max-width`: thẻ thư và bảng chân thư được bọc trong một bảng "ma" rộng 560 px chỉ Outlook thấy (`<!--[if mso]>…<![endif]-->`), để thẻ không giãn hết cửa sổ.
- Font hệ thống, chọn theo ngôn ngữ của thư như website (`site.css`, `html:lang(…)`): mỗi thư chỉ có font CJK của ngôn ngữ đó, để chữ Hán tiếng Trung không vẽ theo dáng Nhật hay lẫn hai font trong một dòng. Chuỗi Latin chung `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial`, rồi:
  - `vi`, `en`: `sans-serif` (không có font CJK);
  - `ja`: `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Yu Gothic', Meiryo, sans-serif`;
  - `zh`: `'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif`;
  - `ko`: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`, và thẻ thư thêm `word-break: keep-all; overflow-wrap: break-word` (ngắt dòng theo từ, như website).

  Chuỗi font dùng cho cả thẻ thư lẫn bảng chân thư. Key dùng font đơn cách `'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`.
- Đầu thư: ô vuông xanh 10 px và chữ "AI Translator" đậm. Chân thư (ngoài thẻ): "AI Translator · aitranslator.io.vn" (link tới trang chủ).
- Màn hình hẹp (≤ 600 px): thẻ bỏ bo góc và viền hai bên, lề trong 20 px, key cỡ 14 px không giãn chữ (key 34 ký tự vừa một dòng ở 375 px).
- Hộp thư tối: khai báo `color-scheme: light dark`; khối `@media (prefers-color-scheme: dark)` đổi màu theo bộ màu tối của website (nền `#080d18`, thẻ `#111a2d`, chữ `#eef3fb`, ô key `#12274a`, key `#8fc0ff`). Gmail dùng khối `<style>` trong `<head>` (kể cả media query `max-width` của màn hình hẹp) nhưng bỏ phần `prefers-color-scheme` và tự đảo màu theo cách riêng; thiết kế sáng vẫn đọc được khi bị đảo.
- `<html lang>` theo ngôn ngữ của khách, tiếng Trung là `zh-Hans` (chữ giản thể, như app `htmlLang` và website); phần tiếng Anh nằm trong khối có `lang="en"`.
- Dòng xem trước ẩn (preheader) đặt ngay đầu `<body>`: thư key ghi gói và ngày hết hạn của key đầu tiên (không ghi key, vì dòng này hiện ở thông báo của điện thoại); thư hỗ trợ ghi câu dẫn. Hộp thư nối chữ thân thư vào sau preheader cho đủ dòng xem trước, mà key nằm gần đầu thân thư; nên ngay sau chữ preheader, trong cùng khối ẩn, có 100 lần `&zwnj;&nbsp;` (không hiện) để dòng xem trước hết chỗ trước khi tới key.
- Mọi chuỗi động (key, tên gói, ngày, câu trả lời hỗ trợ) đều qua hàm escape HTML. Link chỉ trỏ tới `https://aitranslator.io.vn` (đường cố định trong mã), không thêm tham số theo dõi. Không bật theo dõi mở thư hay bấm link của Resend.

### Thư license key

Phần ngôn ngữ của khách, từ trên xuống:
1. Nhãn nhỏ viết hoa ("License key" / "ライセンスキー" …), tiêu đề lớn theo loại thư, câu dẫn.
2. Mỗi key một ô xanh nhạt: key định dạng `XXXX-XXXX-…` (như `formatLicenseKey`), cỡ 19 px, đậm, chọn cả key bằng một lần chạm (`user-select: all`); dòng dưới key: "Gói **Monthly** · Hết hạn **22/11/2026**".
3. Thư `purchase`, `recover`, `resend`: tiêu đề "Kích hoạt trên máy của bạn" và ba bước đánh số trong vòng tròn xanh nhạt (Mở AI Translator / Vào Cài đặt › Bản quyền / Dán key rồi bấm Kích hoạt). Thư `renewal` và `plan_change` không có các bước: câu dẫn đã nói key giữ nguyên, không cần kích hoạt lại.
4. Câu lưu ý mỗi key một máy và giữ thư này; link "Hướng dẫn chi tiết →" tới trang mua và kích hoạt key của website đúng ngôn ngữ; câu "Cần giúp? Trả lời thư này" (thư có Reply-To support@).

Phần tiếng Anh (khi ngôn ngữ của khách không phải tiếng Anh), chữ 14 px: nhãn "ENGLISH", tiêu đề nhỏ, câu dẫn trỏ lên key ở trên ("Your license key is shown above."), mỗi key một dòng "Monthly · Expires 22 Nov 2026" (không lặp lại key), các bước dạng "1. … 2. … 3. …" (chỉ ba loại thư có bước), câu lưu ý, link hướng dẫn tiếng Anh, câu cần giúp.

Ngôn ngữ của khách là tiếng Anh: chỉ có phần trên, viết bằng tiếng Anh, câu dẫn dạng thường ("Here is your license key.").

Chỉ thư lấy lại key mới có thể có nhiều key. Khi thư có từ 2 key, tiếng Anh dùng số nhiều ("keys") ở tiêu đề, tiêu đề lớn và câu dẫn (luật áp theo số key, không theo loại thư). Các ngôn ngữ khác không đổi theo số lượng.

### Thư trả lời hỗ trợ

Phần ngôn ngữ của khách: nhãn "Hỗ trợ", tiêu đề "Hỗ trợ đã trả lời bạn", câu dẫn, mỗi câu trả lời một ô nền nhạt (giữ nguyên văn, escape HTML; mỗi lần xuống dòng, kể cả `\r\n`, thành một `<br>` vì Outlook cho Windows không bảo đảm `white-space: pre-wrap`; `pre-wrap` vẫn giữ để khoảng trắng liền nhau không bị gộp), rồi câu "Trả lời thư này để nhắn tiếp, hoặc mở lại khung chat…". Phần tiếng Anh: nhãn, tiêu đề nhỏ, "AI Translator support has replied to your message (above).", câu trả lời thư hay mở lại chat.

### Bản chữ thuần

Cùng nội dung, cùng thứ tự: dòng "AI Translator", tiêu đề, câu dẫn, key thụt 4 dấu cách kèm dòng gói và hạn, các bước "  1. …", lưu ý, "Hướng dẫn chi tiết: <URL đầy đủ>", câu cần giúp; rồi một dòng `────────────────────────────`, chữ "English" và phần tiếng Anh; cuối thư `--` và "AI Translator · aitranslator.io.vn". Câu trả lời hỗ trợ thụt 2 dấu cách mỗi dòng. Không quá hai dòng trống liền nhau.

### Ngày

Ngày hết hạn tính theo giờ Việt Nam (UTC+7) như hiện nay, viết theo thói quen của từng ngôn ngữ: `vi` 22/11/2026, `en` 22 Nov 2026, `ja` và `zh` 2026年11月22日, `ko` 2026년 11월 22일. Viết bằng mã, không dùng `Intl` (kết quả không phụ thuộc môi trường chạy).

### Tên gói

Giữ tên gói tiếng Anh của `PLAN_NAMES` (Monthly, 6 Months, Yearly) ở mọi ngôn ngữ, như giao diện app.

## 3. Server

### Migration 0006

```sql
ALTER TABLE orders ADD COLUMN lang TEXT CHECK (lang IN ('vi', 'en', 'ja', 'zh', 'ko'));
```

Cột cho phép NULL (đơn cũ và đơn của app cũ). Worker cũ không đọc hay ghi cột này nên chạy đúng trên schema mới: áp migration trước khi deploy Worker mới. Bộ đếm `order_code` không bị đụng (không dựng lại bảng). `test/migrations.test.ts` cập nhật schema mong đợi.

### Endpoint

- `POST /v1/checkout`: thêm trường `lang` không bắt buộc. Giá trị thuộc 5 mã thì lưu vào `orders.lang`; thiếu, sai kiểu hay mã lạ (ví dụ app sau này có thêm ngôn ngữ giao diện mà server chưa biết) thì lưu NULL, **không trả 400**: không chặn việc mua vì ngôn ngữ thư. Phản hồi không đổi.
- `POST /v1/licenses/recover`: thêm `lang` không bắt buộc, cùng luật nhận; chỉ dùng để chọn ngôn ngữ thư, không lưu. Phản hồi và thời gian phản hồi không đổi (vẫn tra và gửi trong `waitUntil`).
- Kiểu `Lang` và hàm `parseLang` của chat hỗ trợ (`support/text.ts`) chuyển ra `server/src/lang.ts` để `email/`, `checkout.ts`, `licenses.ts` và `support/` cùng dùng, không định nghĩa danh sách 5 mã thêm lần nữa. `error-reports.ts` (`UI_LANGS`) giữ nguyên.

### Gửi thư

- `EmailMessage` thêm `html?: string`; `ResendEmailProvider` gửi `html` khi có, cùng `text`. Phân loại lỗi, idempotency key, Reply-To giữ nguyên. Thư cảnh báo người vận hành vẫn chỉ có `text`.
- `licenseEmail(lang, kind, entries)` và `supportReplyEmail(lang, replies)` trả `{ subject, html, text }`.
- `sendLicenseMail(db, deps, to, kind, entries, opts)` thêm tham số ngôn ngữ thư (đã qua `mailLang`).
- `mailGranted` nhận `lang` và `currency` của đơn. Bốn chỗ gọi: xác nhận thanh toán (`orders.ts`, chung cho webhook, đối soát và `GET /v1/orders`), admin cấp cho đơn (`admin.ts`), admin `resolve` (`admin.ts`), cron gửi lại. `OrderRow` và câu đọc đơn (`loadOrder`) thêm `lang`; `retryUnsentEmails` thêm `o.lang, o.currency` vào câu `SELECT`.
- Web Admin "Gửi lại key" (`POST /admin/licenses/:id/resend`): đọc `lang, currency` của đơn có `license_id` = key, `order_code` lớn nhất.
- Web Admin "Cấp key tay" (`POST /admin/licenses`): `vi`.
- `sendSupportEmails` đọc thêm `c.lang`.

### Ẩn danh theo email

Thao tác xóa theo email ở Web Admin (`admin.ts`, đoạn `UPDATE orders SET email = NULL WHERE email = ?`) đặt luôn `lang = NULL` cho các đơn đó, để danh sách "sau khi xóa vẫn giữ" của chính sách (mục 7) không phải thêm ngôn ngữ.

### Tổ chức mã

`server/src/email/`:
- `provider.ts`, `resend.ts`: như cũ, thêm `html`.
- `strings.ts` (mới): chữ của 5 ngôn ngữ (Phụ lục A), hàm viết ngày, đường dẫn trang hướng dẫn.
- `layout.ts` (mới): escape HTML, khung thư (đầu, thẻ, chân, preheader, `<style>`), các khối dùng lại (đoạn văn, nhãn, tiêu đề, đường kẻ, ô key, danh sách bước, ô trả lời).
- `templates.ts`: `mailLang`, `licenseEmail`, `supportReplyEmail`, ráp từ `strings.ts` và `layout.ts`.

## 4. App 0.2.5

- `HttpApi::checkout` và `HttpApi::recover` (`src-tauri/src/license/client.rs`) gửi thêm `"lang": "<mã>"`, mã viết thường của `settings.ui_language` lúc khách bấm (cùng mã app đã gửi ở chat hỗ trợ và báo cáo lỗi). Trait `LicenseApi` và các bản giả trong test đổi theo.
- Không đổi giao diện, không thêm chữ, không thêm kết nối mạng.

## 5. Pháp lý và website

- **Chính sách quyền riêng tư 1.6** (`docs/legal/privacy.vi.md`, `privacy.en.md`), mục 5: dòng "Đơn hàng" thêm "ngôn ngữ giao diện của ứng dụng lúc mua"; cột mục đích thêm "gửi thư bằng ngôn ngữ của bạn". Mục 6 (Resend) không đổi. Ngày hiệu lực đặt theo mục "Đổi ngày hiệu lực" của `docs/legal/README.md`, trước khi build app 0.2.5. EULA không đổi (giữ 1.3).
- `docs/legal/README.md`: ghi chính sách 1.6 và lý do.
- Website, trang "Dữ liệu và bảo mật" ở cả 5 ngôn ngữ (`website/src/content/{vi,en,ja,zh,ko}/data-security.mjs`, dòng bảng "Đơn hàng"): thêm cùng ý. Trang Chính sách quyền riêng tư của website tự lấy từ file pháp lý.
- Website không nêu tên dịch vụ gửi thư hay công nghệ (luật hiện có của `website/README.md`).

## 6. Triển khai

Mỗi bước chờ chủ dự án cho phép.
1. Áp migration 0006 lên D1 production, rồi deploy Worker API (`mt-license`) và Worker admin (`mt-license-admin`) liền nhau. Kiểm cron sau deploy (bài học sự cố 2026-10-07). Từ lúc này mọi thư là HTML; app cũ chưa gửi ngôn ngữ nên thư theo D2.
2. Phát hành app 0.2.5 (quy trình phát hành 5 bước), đóng gói chính sách 1.6. Server chỉ lưu `orders.lang` khi app 0.2.5 gửi lên, nên việc lưu không đi trước chính sách.
3. Deploy website (chính sách 1.6, trang Dữ liệu và bảo mật).

Đơn đang chờ gửi lại lúc deploy: thư gửi lại có nội dung khác thư cũ. Nếu lần gửi trước đã được Resend nhận, Resend trả `409 invalid_idempotent_request`, server đã coi là đã gửi (luật hiện có), nên khách không nhận hai thư.

## 7. Test

Server (vitest):
- `mailLang`: đủ 4 nhánh (có lang; USD; VND; không có gì).
- `licenseEmail` cho mỗi ngôn ngữ và mỗi loại thư: tiêu đề `<ngôn ngữ> / <tiếng Anh>` (tiếng Anh: chỉ tiếng Anh); HTML có key định dạng, gói, ngày đúng dạng của ngôn ngữ, link hướng dẫn đúng ngôn ngữ, `lang` của `<html>`; có hay không có các bước theo loại thư; phần tiếng Anh có mặt trừ khi ngôn ngữ là `en`; bản chữ thuần có cùng key, ngày và URL; số nhiều tiếng Anh khi có 2 key.
- `supportReplyEmail`: câu trả lời chứa `<script>`, `&`, `"` được escape trong HTML và giữ nguyên trong bản chữ; xuống dòng giữ nguyên.
- Mọi chữ trong `strings.ts` đủ khóa ở cả 5 ngôn ngữ (test so khóa).
- Không chuỗi nào của thư chứa tên công nghệ lõi hay tên dịch vụ gửi thư.
- `ResendEmailProvider` gửi `html` khi có.
- `POST /v1/checkout`: lưu `lang` hợp lệ; mã lạ, sai kiểu hay thiếu thì lưu NULL và vẫn tạo đơn.
- `POST /v1/licenses/recover`: thư theo `lang` của request; thiếu thì `vi`.
- Cấp key qua webhook và cron gửi lại: thư theo `orders.lang`; đơn không có `lang` thì theo loại tiền.
- Web Admin gửi lại key: theo đơn mới nhất; key cấp tay thì `vi`.
- Thư hỗ trợ theo `support_conversations.lang`.
- Ẩn danh theo email đặt `orders.lang` về NULL.
- Migration 0006: schema mong đợi; dữ liệu cũ giữ nguyên, `lang` NULL.

App (Rust): body của `checkout` và `recover` có `lang` đúng mã của ngôn ngữ giao diện.

Website: các test sẵn có (ngày của văn bản pháp lý trùng nhau giữa vi và en, không nêu công nghệ lõi).

Thử tay sau bước 1 và 2: đổi giao diện app lần lượt sang 5 ngôn ngữ, bấm "Gửi lại key" với email của chủ dự án; xem thư ở Gmail (web và điện thoại), Apple Mail (sáng và tối) và Outlook cho Windows: đúng ngôn ngữ, phần tiếng Anh ở dưới (trừ tiếng Anh), key chọn được, link mở đúng trang.

## 8. Ngoài phạm vi

- Trang trả về sau thanh toán (`/v1/pay/return`, `/v1/pay/cancel`, song ngữ vi/en).
- Biên lai do Creem gửi.
- Thư cảnh báo cho người vận hành.
- Giao diện Web Admin.

## Phụ lục A: chữ của thư

`{plan}`, `{date}` là giá trị động. "›" là ký tự U+203A như giao diện app.

### vi
- Tiêu đề: purchase "License key AI Translator của bạn"; renewal "Đã gia hạn gói AI Translator"; plan_change "Đã đổi gói AI Translator"; recover, resend "License key AI Translator của bạn"; support "Trả lời từ hỗ trợ AI Translator".
- Tiêu đề lớn: purchase "Cảm ơn bạn đã mua AI Translator"; renewal "Gói của bạn đã được gia hạn"; plan_change "Gói của bạn đã được đổi"; recover, resend "License key của bạn"; support "Hỗ trợ đã trả lời bạn".
- Câu dẫn: purchase "Đây là license key của bạn."; renewal "Cảm ơn bạn đã gia hạn. Key giữ nguyên, không cần kích hoạt lại."; plan_change "Cảm ơn bạn. Key giữ nguyên, không cần kích hoạt lại."; recover "Đây là license key còn hạn của email này."; resend "Đây là license key của bạn, gửi lại theo yêu cầu."; support "Bộ phận hỗ trợ AI Translator đã trả lời tin nhắn của bạn."
- Nhãn: license "License key"; support "Hỗ trợ". Gói "Gói"; hết hạn "Hết hạn".
- Các bước: "Kích hoạt trên máy của bạn": "Mở AI Translator." / "Vào Cài đặt › Bản quyền." / "Dán key rồi bấm Kích hoạt."
- Lưu ý: "Mỗi key dùng trên 1 máy. Hãy giữ thư này để kích hoạt lại khi cài lại máy hay chuyển sang máy khác."
- Link: "Hướng dẫn chi tiết" → `/huong-dan/mua-va-kich-hoat-key/`. Cần giúp: "Cần giúp? Trả lời thư này, chúng tôi sẽ hồi âm."
- Hỗ trợ, câu cuối: "Trả lời thư này để nhắn tiếp, hoặc mở lại khung chat trên aitranslator.io.vn hay mục Hỗ trợ trong app."

### en
- Tiêu đề: purchase "Your AI Translator license key"; renewal "Your AI Translator plan is renewed"; plan_change "Your AI Translator plan has changed"; recover, resend "Your AI Translator license key" (2 key trở lên: "license keys"); support "Reply from AI Translator support".
- Tiêu đề lớn: purchase "Thank you for buying AI Translator"; renewal "Your plan is renewed"; plan_change "Your plan has changed"; recover, resend "Your license key" (số nhiều: "Your license keys"); support "Support has replied".
- Câu dẫn khi thư chỉ có tiếng Anh: purchase "Here is your license key."; renewal "Thank you for renewing. Your key stays the same; no need to activate it again."; plan_change "Thank you. Your key stays the same; no need to activate it again."; recover "Here is the active license key for this email." (số nhiều: "Here are the active license keys for this email."); resend "Here is your license key, sent again as you asked." (số nhiều: "Here are your license keys, sent again as you asked."); support "AI Translator support has replied to your message."
- Câu dẫn ở phần tiếng Anh bên dưới: purchase "Your license key is shown above." (số nhiều: "Your license keys are shown above."); renewal "Thank you for renewing. Your key (above) stays the same; no need to activate it again."; plan_change "Your plan has changed. Your key (above) stays the same; no need to activate it again."; recover "The active license key for this email is shown above." (số nhiều: "The active license keys for this email are shown above."); resend "Your license key is shown above, sent again as you asked." (số nhiều: "Your license keys are shown above, sent again as you asked."); support "AI Translator support has replied to your message (above)."
- Nhãn: license "License key"; support "Support". Gói "Plan"; hết hạn "Expires". Nhãn phần dưới: "English".
- Các bước: "Activate on your computer": "Open AI Translator." / "Go to Settings › License." / "Paste the key and click Activate."
- Lưu ý: "Each key works on 1 computer. Keep this email to activate again after reinstalling or moving to another computer."
- Link: "Step-by-step guide" → `/en/guide/buy-and-activate/`. Cần giúp: "Need help? Reply to this email."
- Hỗ trợ, câu cuối: "Reply to this email to continue, or reopen the chat on aitranslator.io.vn or in the app's Support screen."

### ja
- Tiêu đề: purchase, recover, resend "AI Translator のライセンスキー"; renewal "AI Translator のプランを更新しました"; plan_change "AI Translator のプランを変更しました"; support "AI Translator サポートからの返信".
- Tiêu đề lớn: purchase "AI Translator をご購入いただきありがとうございます"; renewal "プランを更新しました"; plan_change "プランを変更しました"; recover, resend "ライセンスキー"; support "サポートから返信がありました".
- Câu dẫn: purchase "ライセンスキーをお送りします。"; renewal "ご更新ありがとうございます。キーは変わらないため、もう一度有効化する必要はありません。"; plan_change "ありがとうございます。キーは変わらないため、もう一度有効化する必要はありません。"; recover "このメールアドレスで有効なライセンスキーをお送りします。"; resend "ご依頼により、ライセンスキーを再送します。"; support "AI Translator サポートがあなたのメッセージに返信しました。"
- Nhãn: license "ライセンスキー"; support "サポート". Gói "プラン"; hết hạn "有効期限".
- Các bước: "お使いのパソコンで有効化": "AI Translator を開きます。" / "設定 › ライセンス を開きます。" / "キーを貼り付けて「有効化」をクリックします。"
- Lưu ý: "1 つのキーは 1 台のパソコンで使えます。再インストールやパソコンの買い替えのときに有効化し直せるよう、このメールを保管してください。"
- Link: "詳しい手順" → `/ja/guide/buy-and-activate/`. Cần giúp: "ご不明な点は、このメールに返信してください。"
- Hỗ trợ, câu cuối: "このメールに返信して続けるか、aitranslator.io.vn またはアプリの「サポート」画面からチャットを再開できます。"

### zh
- Tiêu đề: purchase, recover, resend "你的 AI Translator 许可证密钥"; renewal "你的 AI Translator 套餐已续期"; plan_change "你的 AI Translator 套餐已更改"; support "AI Translator 客服的回复".
- Tiêu đề lớn: purchase "感谢你购买 AI Translator"; renewal "你的套餐已续期"; plan_change "你的套餐已更改"; recover, resend "你的许可证密钥"; support "客服已回复你".
- Câu dẫn: purchase "以下是你的许可证密钥。"; renewal "感谢续期。密钥保持不变，无需重新激活。"; plan_change "谢谢。密钥保持不变，无需重新激活。"; recover "以下是此邮箱名下仍有效的许可证密钥。"; resend "应你的要求，再次发送你的许可证密钥。"; support "AI Translator 客服已回复你的消息。"
- Nhãn: license "许可证密钥"; support "客服". Gói "套餐"; hết hạn "到期时间".
- Các bước: "在你的电脑上激活": "打开 AI Translator。" / "进入“设置 › 许可证”。" / "粘贴密钥，然后点击“激活”。"
- Lưu ý: "每个密钥只能在 1 台电脑上使用。请保留此邮件，以便重装系统或更换电脑后重新激活。"
- Link: "详细步骤" → `/zh/guide/buy-and-activate/`. Cần giúp: "需要帮助？直接回复此邮件即可。"
- Hỗ trợ, câu cuối: "你可以直接回复此邮件，或在 aitranslator.io.vn 或应用的“客服”页面重新打开聊天。"

### ko
- Tiêu đề: purchase, recover, resend "AI Translator 라이선스 키"; renewal "AI Translator 플랜이 갱신되었습니다"; plan_change "AI Translator 플랜이 변경되었습니다"; support "AI Translator 지원팀의 답변".
- Tiêu đề lớn: purchase "AI Translator를 구매해 주셔서 감사합니다"; renewal "플랜이 갱신되었습니다"; plan_change "플랜이 변경되었습니다"; recover, resend "라이선스 키"; support "지원팀이 답변했습니다".
- Câu dẫn: purchase "라이선스 키를 보내 드립니다."; renewal "갱신해 주셔서 감사합니다. 키는 그대로이므로 다시 활성화할 필요가 없습니다."; plan_change "감사합니다. 키는 그대로이므로 다시 활성화할 필요가 없습니다."; recover "이 이메일로 구매한 유효한 라이선스 키입니다."; resend "요청하신 라이선스 키를 다시 보내 드립니다."; support "AI Translator 지원팀이 메시지에 답변했습니다."
- Nhãn: license "라이선스 키"; support "지원". Gói "플랜"; hết hạn "만료일".
- Các bước: "컴퓨터에서 활성화하기": "AI Translator를 엽니다." / "설정 › 라이선스로 이동합니다." / "키를 붙여 넣고 활성화를 클릭합니다."
- Lưu ý: "키 하나는 컴퓨터 1대에서 사용할 수 있습니다. 다시 설치하거나 컴퓨터를 바꿀 때 다시 활성화할 수 있도록 이 이메일을 보관하세요."
- Link: "자세한 안내" → `/ko/guide/buy-and-activate/`. Cần giúp: "도움이 필요하면 이 이메일에 회신하세요."
- Hỗ trợ, câu cuối: "이 이메일에 회신하거나, aitranslator.io.vn 또는 앱의 지원 화면에서 채팅을 다시 열 수 있습니다."
