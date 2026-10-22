# AI Translator: chat hỗ trợ trên website và app, tin nhắn về Zalo — Design

**Ngày:** 2026-10-22
**Trạng thái:** Chủ dự án đã duyệt thiết kế qua hội thoại ngày 2026-10-22 (các quyết định ở mục 0). Làm **thẳng trên nhánh `main`** theo yêu cầu của chủ dự án; **không push, không deploy khi chưa được cho phép**.
**Quan hệ với spec khác:** thêm bảng vào D1 của Worker `mt-license` (§6.8 của spec gốc `2026-09-29-desktop-meeting-translator-design.md`, bảng mới không nối với bảng license). **Đổi** danh sách kết nối mạng của A7 (§3.3 của spec gốc) và câu "kênh hỗ trợ duy nhất là email" của trang Liên hệ (`website/`, spec `2026-10-08-marketing-website-design.md`). Dùng lại: giới hạn tần suất và cảnh báo của server, gửi email qua Resend, nút "Gửi log cho hỗ trợ" (`2026-10-17-diagnostics-reports-design.md`), chính sách quyền riêng tư (`docs/legal`).

---

## 0. Yêu cầu và quyết định của chủ dự án

- **Yêu cầu gốc:** tính năng chat trực tiếp trên website và trong app; người dùng chat thì tin nhắn gửi về Zalo của chủ dự án.
- **Hai chiều.** Chủ dự án trả lời ngay trong Zalo, câu trả lời hiện trong khung chat của khách. Khách không cần có Zalo (người dùng en/ja/zh/ko thường không có).
- **Kênh Zalo: Zalo Bot** (Zalo Bot Platform, API chính thức của Zalo). Tin hiện trong Zalo cá nhân của chủ dự án dưới dạng một cuộc trò chuyện với bot. Đã loại:
  - thư viện không chính thức đăng nhập bằng tài khoản Zalo cá nhân (server phải giữ phiên đăng nhập; vi phạm điều khoản, có thể bị khóa nick);
  - Zalo OA (tin vào hộp thư OA, không vào chat cá nhân; cửa sổ trả lời 48 giờ; phải xác thực OA);
  - link `zalo.me/<số điện thoại>` (lộ số điện thoại; khách không có Zalo thì không dùng được);
  - dịch vụ chat bên thứ ba như Tawk.to hay Crisp (thêm script ngoài trên website, nội dung chat nằm ở máy chủ của họ, không có cầu Zalo).
- **Khách ẩn danh, email không bắt buộc.** Gõ được ngay; ô email hiện sau tin đầu tiên. Khách rời đi mà có email thì câu trả lời được gửi qua email.
- **Vị trí:** app có mục **"Hỗ trợ" trong thanh bên**; website có **bong bóng nổi ở mọi trang**.
- **Kỹ thuật:** chạy trong **Worker `mt-license` hiện có** (`api.aitranslator.io.vn`), lưu D1, khung chat hỏi tin mới định kỳ (polling). Không dựng Worker riêng: app chỉ nói chuyện với `api.` (danh sách host của A7 không thêm gì), chủ dự án ít việc cài đặt nhất, và báo cáo lỗi đã đi đúng đường này. Không dùng WebSocket hay Durable Object: chậm 3 giây không đáng đổi lấy thêm một công nghệ và một crate WebSocket bên Rust.
- **Giữ 90 ngày** kể từ tin cuối, rồi tự xóa. Khách tự xóa được bất cứ lúc nào.
- **Công tắc khẩn cấp là lệnh Zalo `/tat`, `/bat`**, không phải biến môi trường, để tắt chat không cần deploy.
- **Bản sao trong Zalo xóa tay theo yêu cầu** (chủ dự án chốt 2026-10-22): tự xóa sau 90 ngày và nút xóa của khách chỉ xóa dữ liệu trên máy chủ; khách muốn xóa cả tin đã chuyển sang Zalo thì gửi email, chủ dự án xóa tay trong Zalo.

## 1. Kiến trúc

```
Website (bong bóng, JS thuần) ─┐                           ┌─ sendMessage ──→ Zalo Bot ──→ Zalo của chủ dự án
                               ├─→ api.aitranslator.io.vn ─┤
App (Rust reqwest, qua IPC) ───┘   /v1/support/*  (D1)      └─← webhook ←──── chủ dự án trả lời bot
```

- **Server:** module mới `server/src/support/` trong Worker `mt-license`, gắn vào app Hono hiện có. Migration `0005_support_chat.sql`. Cron `*/5` hiện có thêm ba việc (mục 2.6).
- **Secret mới (3):** `ZALO_BOT_TOKEN`, `ZALO_WEBHOOK_SECRET` (8–256 ký tự, Zalo gửi lại trong header `X-Bot-Api-Secret-Token`), `ZALO_OWNER_CHAT_ID` (`chat_id` của chủ dự án với bot). `chat_id` để trong secret chứ không ở `wrangler.jsonc` vì repo công khai. Thêm cả ba vào `secrets.required`. Bot token không bao giờ vào app hay website.
- **Website:** gọi sang `api.` nên server bật CORS cho đúng origin `https://aitranslator.io.vn` (chỉ các đường `/v1/support/*`). CSP của website thêm `https://api.aitranslator.io.vn` vào `connect-src`. Mã khung chat là file riêng, chỉ tải khi khách bấm bong bóng.
- **App:** module Rust mới `src-tauri/src/support/`, dùng `reqwest` có sẵn theo mẫu `diagnostics/send.rs` (không theo redirect, lỗi không kèm URL, cùng `PRODUCTION_URL`). Giao diện gọi qua IPC vì CSP chặn webview gọi mạng. **Không thêm crate mới.**

## 2. Server

### 2.1 Dữ liệu (D1, migration 0005)

`support_conversations`:

| Cột | Ý nghĩa |
|---|---|
| `id` | khóa chính |
| `code` | mã 3 ký tự, duy nhất trong các cuộc chat còn lưu. Bảng chữ 32 ký tự `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (bỏ 0, 1, I, O). Trùng thì sinh lại |
| `token_hash` | SHA-256 của token bí mật (32 byte ngẫu nhiên, base64url) mà khách giữ. Server không lưu token gốc |
| `source` | `web`, `app` hay `app-debug` |
| `lang` | `vi`, `en`, `ja`, `zh`, `ko` |
| `page` | đường dẫn trang lúc mở chat (chỉ path, không query, tối đa 200 ký tự); chỉ web |
| `context` | dòng thông tin máy (tối đa 300 ký tự); chỉ app, chỉ khi khách để tích |
| `email` | email khách để lại, có thể rỗng |
| `status` | `open` hay `blocked` |
| `created_at`, `last_customer_at`, `last_owner_at`, `last_activity_at` | thời điểm (giây) |
| `delivered_owner_id` | id lớn nhất của tin chủ dự án mà khách đã nhận qua polling |
| `emailed_at` | lần cuối gửi email câu trả lời |

`support_messages`: `id` (tự tăng, làm con trỏ `after`), `conversation_id` (xóa theo cuộc chat), `sender` (`customer`, `owner`), `text`, `created_at`, `forwarded_at` (tin khách: lúc Zalo nhận), `forward_attempts`, `zalo_message_id` (tin chủ dự án, duy nhất, để chống trùng khi Zalo gửi lại webhook).

`support_settings` (khóa, giá trị): `enabled` (mặc định `0`: chat **tắt** cho tới khi chủ dự án nhắn `/bat`), `zalo_fail_streak` (số lần cron liền chuyển tin sang Zalo thất bại).

Giới hạn tần suất dùng bảng `rate_limits` có sẵn (HMAC với `RATE_LIMIT_PEPPER`).

### 2.2 Endpoint của khách

Token đi trong header `Authorization: Bearer <token>`. Mọi thân là JSON, tối đa 16 KiB (trần chung của `/v1` ở `server/src/app.ts`).

| Endpoint | Việc |
|---|---|
| `GET /v1/support/status` | `{ enabled }`. Khung chat gọi khi mở; tắt thì hiện email support@ thay ô nhập |
| `POST /v1/support/messages` | Gửi tin `{ text, lang, source, page?, context? }`. Không có token thì tạo cuộc chat mới và trả `{ token }` kèm tin vừa lưu. `text` sau khi bỏ khoảng trắng hai đầu phải dài 1–1000 ký tự; bỏ ký tự điều khiển trừ xuống dòng. `page` và `context` chỉ được nhận ở tin đầu tiên |
| `GET /v1/support/messages?after=<id>` | `{ enabled, status, messages: [{ id, sender, text, created_at }] }`, các tin có `id > after` |
| `PUT /v1/support/email` | `{ email }` (định dạng hợp lệ, tối đa 254 ký tự), hay `null` để bỏ. Báo Zalo "✉️ khách đã để lại email" (không kèm địa chỉ) |
| `DELETE /v1/support/conversation` | Xóa cuộc chat và mọi tin. Báo Zalo "🗑 khách đã xóa cuộc chat" |

Mã lỗi (thân `{ error }`): `support_disabled` (503), `conversation_closed` (403, cuộc chat bị chặn), `invalid_token` (401), `invalid_request` (400, kèm `field`), `rate_limited` (429, kèm `Retry-After`), `support_busy` (429, chạm trần toàn hệ thống).

Token sai hay không tồn tại tính là một lần thất bại của IP (`noteFailure`, bộ đếm `failure_ip` có sẵn); IP đã chạm ngưỡng thì nhận `429`. Hợp đồng chi tiết (thân, mã trạng thái, CORS) ở `docs/superpowers/plans/2026-10-22-chat-ho-tro-00-tong-quan.md`.

**Polling không ghi D1 khi không có tin mới.** Chỉ cập nhật `delivered_owner_id` khi lần hỏi trả về tin của chủ dự án. Polling không đi qua bảng `rate_limits` (mỗi lần hỏi sẽ là một lần ghi); dùng binding Rate Limiting của Workers `SUPPORT_POLL_LIMITER` (60 lần mỗi 60 giây, khóa là id cuộc chat; đã kiểm wrangler 4.145 và miniflare hỗ trợ) để chặn lạm dụng. Token sai không tới bước này mà tính vào `failure_ip` như trên.

### 2.3 Chuyển tin sang Zalo

Gọi `POST https://bot-api.zaloplatforms.com/bot<ZALO_BOT_TOKEN>/sendMessage` với `{ chat_id: ZALO_OWNER_CHAT_ID, text }`, văn bản thuần (không `parse_mode`), tối đa 2000 ký tự (cắt bớt nếu dài hơn, dấu `…`).

Định dạng:

```
🆕 #K7Q · web · vi · /bang-gia/
Gói Monthly dùng được trên 2 máy không?

🆕 #M2D · app · vi · AI Translator 0.2.3 · macOS 15.6 · Apple M4 Pro · 24 GB · Monthly · Chuẩn
Phụ đề không hiện khi họp Teams

#K7Q Cảm ơn, vậy mình mua 2 key
#K7Q ✉️ khách đã để lại email
#M2D 📎 Mã báo cáo log: R-VBXX-951X
```

- Dòng `🆕` chỉ ở tin đầu tiên của mỗi cuộc chat. `source` là `app-debug` thì ghi `app (debug)`.
- **Dữ liệu tới Zalo chỉ gồm:** nội dung tin, mã cuộc chat, nguồn, ngôn ngữ, trang (web), thông tin máy (app, khi khách để tích). **Email của khách không bao giờ gửi qua Zalo** (có test chặn).
- Server thử chuyển ngay trong request (`ctx.waitUntil`). Để giữ thứ tự, tin chỉ được chuyển ngay khi cuộc chat không còn tin nào trước nó đang chờ; ngược lại để cron chuyển theo thứ tự `id`.
- Thất bại (mạng, `5xx`, token sai) thì tin vẫn được lưu và khách vẫn thấy "Đã gửi". Cron gửi lại (mục 2.6).

### 2.4 Webhook `POST /v1/webhooks/zalo`

Đặt dưới `/v1/webhooks/` theo quy ước của `server/src/app.ts`: các đường này không bị đòi `Content-Type: application/json` (cổng ngoài đổi header cũng không làm mất tin) và có log `webhook_too_large` khi thân vượt 16 KiB. CORS không áp cho đường này.

1. Header `X-Bot-Api-Secret-Token` khác `ZALO_WEBHOOK_SECRET` (so sánh thời gian hằng): `403`.
2. Thân không đọc được: `200`, ghi log (không trả lỗi để Zalo không gửi lại liên tục).
3. `result.message.chat.id` khác `ZALO_OWNER_CHAT_ID`: `200`, bỏ qua, không trả lời. Bot có thể bị người lạ tìm thấy và nhắn vào.
4. `message_id` đã có trong `support_messages.zalo_message_id`: `200`, bỏ qua (Zalo gửi lại).
5. Sự kiện không phải `message.text.received` (ảnh, sticker, voice): bot trả lời "Chỉ gửi được chữ."
6. Tin chữ: lệnh (mục 2.5) hay câu trả lời (dưới).

**Định tuyến câu trả lời:**
- Mở đầu bằng `#` và mã 3 ký tự (không phân biệt hoa thường), rồi nội dung: gửi tới cuộc chat đó. Không trả lời gì thêm.
  - Mã không có, hay cuộc chat bị chặn: bot báo "Không có cuộc chat #XXX." hay "#XXX đang bị chặn (gõ /mo #XXX để mở)."
  - Thiếu nội dung: bot báo "Thiếu nội dung sau mã."
- Không có mã: xét các cuộc chat `open` có tin khách trong 30 phút qua.
  - Đúng một cuộc chat: gửi tới đó, bot báo "✓ đã gửi tới #XXX".
  - Không có cuộc nào: bot báo "Không có cuộc chat nào nhắn trong 30 phút qua. Ghi mã ở đầu tin, ví dụ: #K7Q nội dung".
  - Từ hai cuộc trở lên: **không đoán**; bot báo "⚠️ Có N cuộc chat vừa nhắn trong 30 phút qua (#A, #B). Ghi mã ở đầu tin, ví dụ: #A nội dung".
- Nội dung câu trả lời tối đa 2000 ký tự.

### 2.5 Lệnh trong Zalo

| Lệnh | Việc |
|---|---|
| `/ds` | Liệt kê cuộc chat có tin trong 7 ngày qua: mã, nguồn, bao lâu trước, 30 ký tự đầu của tin cuối, dấu ✉️ nếu có email, dấu ⛔ nếu bị chặn. Tối đa 20 dòng |
| `/chan #XXX` | Chặn: tin của khách không còn chuyển sang Zalo; khách thấy "Cuộc trò chuyện đã đóng" kèm email support@ |
| `/mo #XXX` | Bỏ chặn |
| `/tat`, `/bat` | Tắt hay bật chat trên toàn website và app (`support_settings.enabled`). Bot xác nhận trạng thái mới |
| `/` khác | Bot gửi danh sách lệnh |

### 2.6 Cron (`*/5` có sẵn)

1. **Chuyển lại tin chờ:** tin khách có `forwarded_at` rỗng, tạo trong 24 giờ qua, theo thứ tự `id`. Thành công thì đặt `zalo_fail_streak = 0`. Cả lần chạy thất bại thì tăng `zalo_fail_streak`; đạt 3 thì cảnh báo `support_zalo_failed`. Tin quá 24 giờ không chuyển nữa, vẫn còn trong cuộc chat của khách.
2. **Gửi email câu trả lời:** cuộc chat có `email`, có tin chủ dự án `id > delivered_owner_id` tạo từ 2 phút trước, và `emailed_at` rỗng hay cách đây hơn 1 giờ. Gộp mọi tin chủ dự án chưa nhận vào một thư, đặt `emailed_at`. Thư song ngữ vi/en theo mẫu thư hiện có (`server/src/email/templates.ts`), văn bản thuần, `Reply-To: support@aitranslator.io.vn`; nói khách có thể trả lời thư này hay mở lại khung chat trên website hay trong app. Lỗi gửi thì thử lại ở lần cron sau.
3. **Xóa hết hạn:** xóa cuộc chat có `last_activity_at` cũ hơn 90 ngày (tin xóa theo).

### 2.7 Chống spam và giới hạn

| Giới hạn (cửa sổ 1 giờ, `ratelimit.ts`) | Ngưỡng |
|---|---|
| `support_msg_ip`: tin mỗi IP | 30 |
| `support_new_ip`: cuộc chat mới mỗi IP | 5 |
| `support_msg_conv`: tin mỗi cuộc chat | 20 |
| `support_email_conv`: lần đặt email mỗi cuộc chat | 5 |
| `support_global`: tin khách được nhận, toàn hệ thống | 200; chạm ngưỡng thì trả `support_busy` và cảnh báo `support_flood` |

- CORS chỉ cho `https://aitranslator.io.vn`; app gọi không có `Origin`.
- **Chưa dùng Turnstile** ở bản đầu (thêm script và việc cài đặt). Gặp spam thật thì dùng `/chan`, `/tat` trước, rồi mới tính Turnstile.
- Hai loại cảnh báo mới trong `alerts.ts`: `support_zalo_failed` (kèm cách kiểm token và trạng thái bot), `support_flood`. Đi qua `OPERATOR_EMAIL` như các cảnh báo khác, tối đa một thư mỗi loại mỗi giờ.

## 3. Website

- **Bong bóng** góc dưới phải ở mọi trang, do `site.js` chèn vào (tắt JS thì không có bong bóng; trang Liên hệ vẫn có email). File khung chat (JS và CSS) tách riêng, có mã băm trong tên như bundle hiện có, chỉ tải khi bấm bong bóng.
- **Khung chat:**
  - Đầu khung: "Hỗ trợ AI Translator", dòng phụ "Người thật trả lời, không phải bot · chưa cam kết thời gian trả lời".
  - Lời chào theo ngôn ngữ trang. vi: "Chào bạn 👋 Bạn cần giúp gì? Bạn có thể viết bằng tiếng Việt hoặc English." en: viết tiếng Anh hay tiếng Việt. ja/zh/ko: lời chào bằng ngôn ngữ đó, nhờ khách viết tiếng Anh nếu được.
  - Enter gửi, Shift+Enter xuống dòng, đếm ký tự khi gần 1000. Mỗi tin của khách có trạng thái "Đã gửi" hay "Không gửi được, thử lại".
  - Sau tin đầu tiên: thẻ "Để lại email để nhận câu trả lời nếu bạn rời trang (không bắt buộc)".
  - Menu ⋯: "Xóa cuộc trò chuyện" (hỏi lại trước khi xóa).
  - Chân khung: "Tin nhắn được lưu 90 ngày · Quyền riêng tư" (liên kết tới chính sách của ngôn ngữ đó; ja/zh/ko dẫn tới bản en).
  - Chat tắt (`enabled = false`) hay cuộc chat bị chặn: thay ô nhập bằng email support@.
  - Điện thoại: khung chiếm toàn màn hình. Bàn phím: mở và đóng bằng phím, Esc đóng, tin mới đọc qua `aria-live`.
- **Lưu trên trình duyệt:** `localStorage` khóa `support.v1` gồm `{ token, lastId, waitingSince }`. Không có `localStorage` (chế độ riêng tư) thì cuộc chat chỉ sống trong trang hiện tại.
- **Nhịp hỏi tin mới:**

  | Lúc nào | Nhịp |
  |---|---|
  | Khung chat mở và tab đang hiện | 3 giây; sau 2 phút không có tin mới thì 15 giây |
  | Khung đóng, đang chờ trả lời (tin cuối là của khách, trong 24 giờ qua), tab đang hiện | Hỏi một lần khi tải trang, rồi 60 giây; có trả lời thì bong bóng hiện chấm đỏ |
  | Còn lại | Không gọi mạng |

- **CSP:** `connect-src 'self' https://api.aitranslator.io.vn`. Không thêm nguồn script, style hay font nào.
- **Chữ** theo năm ngôn ngữ ở `website/src/strings.mjs` (hay file riêng của khung chat), đủ cả năm bản.
- **Bản xem cục bộ** (`serve.mjs`) không gọi được API production (CORS chỉ cho domain thật). Test dùng server giả.

## 4. App

- **Màn hình "Hỗ trợ"**: thêm `support` vào `SCREENS` (`src/windows/main/Shell.tsx`), đặt giữa "Nâng cấp Pro" và "Giới thiệu", có biểu tượng riêng. Chữ năm ngôn ngữ ở `src/i18n/{vi,en,ja,zh,ko}.ts`. Dùng được với mọi người dùng, kể cả Free và chưa có license.
- **Giao diện** như khung chat của website (lời chào, trạng thái tin, thẻ email, menu ⋯ Xóa cuộc trò chuyện, chân "lưu 90 ngày · Quyền riêng tư" mở chính sách trong app), thêm hai thứ:
  - **"Gửi kèm thông tin máy"**, tích sẵn, bỏ tích được, chỉ hiện trước tin đầu tiên và chỉ gửi kèm tin đầu tiên. Nội dung hiện nguyên văn: phiên bản app, hệ điều hành và phiên bản, chip hay CPU, RAM, card đồ họa (Windows), gói (Free, Monthly, 6 Months, Yearly), gói model, ngôn ngữ giao diện. Lấy từ phần thông tin máy có sẵn của báo cáo lỗi (`diagnostics/machine.rs`). **Không bao giờ** có key, email của license, mã máy, tên máy hay tên người dùng.
  - **"Đính kèm log"**: chạy đúng luồng "Gửi log cho hỗ trợ" có sẵn; thành công thì tự gửi tin "📎 Mã báo cáo log: R-XXXX-XXXX" vào cuộc chat. Lỗi thì hiện lỗi của luồng đó.
- **Lưu trên máy:** token và con trỏ `lastId` trong file `support.json` ở thư mục dữ liệu của app (không dùng kho khóa: token chỉ mở được cuộc chat, và kho khóa trên macOS ký ad-hoc gây hỏi quyền).
- **Nhịp hỏi tin mới** (Rust điều khiển, giao diện nhận sự kiện):

  | Lúc nào | Nhịp |
  |---|---|
  | Màn hình Hỗ trợ đang mở và cửa sổ đang hiện | 3 giây; sau 2 phút không có tin mới thì 15 giây |
  | Đang chờ trả lời (tin cuối là của khách, trong 24 giờ qua), **và không đang dịch** | 60 giây; có trả lời thì mục Hỗ trợ hiện chấm đỏ |
  | Còn lại, kể cả khi chưa từng dùng chat | **Không kết nối** |

- **"Đã dùng chat" nghĩa là đã gửi ít nhất một tin** (có token). Chưa có cuộc chat thì mở màn hình Hỗ trợ **không gọi mạng**, kể cả `GET /v1/support/status`: chat đang tắt thì người dùng biết ở lần gửi đầu (`503 support_disabled`). Nhờ vậy câu "chưa từng nhắn thì app không kết nối gì cho chat" của chính sách và trang Dữ liệu và bảo mật đúng tuyệt đối. Website thì gọi `status` khi khách mở bong bóng (khách đã chủ động mở khung chat).
- **IPC mới (6 lệnh):** `support_screen` (giao diện báo màn hình Hỗ trợ mở hay đóng; Rust điều khiển nhịp hỏi tin), `support_fetch`, `support_send`, `support_set_email`, `support_delete`, `support_machine_info` (dòng thông tin máy, dựng trong Rust). Không có lệnh hỏi `status` (xem dòng trên). Thêm vào ACL và `acl_tests.rs` theo cách các lệnh hiện có. Chi tiết ở kế hoạch 03.
- Bản debug gửi `source: "app-debug"` (bản dev cũng nối production, CLAUDE.md), để chủ dự án nhận ra tin thử.

## 5. Dữ liệu, pháp lý, spec gốc, website

- **Chính sách quyền riêng tư lên 1.5** (`docs/legal/privacy.{vi,en}.md`; app và website cùng đổi theo). Theo đúng cách đã làm khi thêm "Báo cáo lỗi" (`docs/legal/README.md`): mục 1–10 giữ số để các tham chiếu "mục 5", "mục 6", "mục 7" và test của website vẫn đúng; thêm mục **"11. Chat hỗ trợ"**, nên "Thay đổi chính sách" và "Liên hệ" thành mục 12 và 13 (sửa mọi tham chiếu tới hai mục này). Sửa thêm:
  - mục 2 (tóm tắt): có chat hỗ trợ, nội dung giữ 90 ngày;
  - mục 4 (khi nào app kết nối mạng): chỉ khi người dùng dùng chat, theo nhịp ở mục 4 của spec này;
  - mục 5 (dữ liệu trên máy chủ): nội dung tin, email tự nguyện, nguồn, trang, thông tin máy nếu khách để tích, IP chỉ dạng mã băm cho giới hạn tần suất;
  - mục 6 (bên xử lý): **Zalo, Công ty Cổ phần VNG, máy chủ ở Việt Nam** (điều khoản Zalo Bot Platform, https://bot.zapps.me/docs/terms/, đọc 2026-10-22: dữ liệu lưu trên máy chủ ở Việt Nam), nhận nội dung tin và các thông tin ở mục 2.3 (không nhận email); **Resend** (đã có trong bảng) thêm việc gửi thư câu trả lời cho khách để lại email;
  - mục 7 (thời gian lưu và quyền): tự xóa sau 90 ngày, khách tự xóa bằng nút trong khung chat. Hai việc này chỉ xóa dữ liệu trên máy chủ; bản sao các tin đã chuyển sang Zalo nằm trong cuộc trò chuyện Zalo của chủ dự án cho tới khi chủ dự án xóa tay (khi khách yêu cầu qua email).
  - **EULA giữ bản 1.3.** Ngày hiệu lực của 1.5 đặt lúc phát hành bản app có chat. Cập nhật `docs/legal/README.md`.
- **Spec gốc:** sửa A7 (§3.3) thêm vào danh sách ngoại lệ: "gửi và nhận tin chat hỗ trợ (`/v1/support/*`, chỉ tới `api.aitranslator.io.vn`, chỉ khi người dùng đã dùng chat; trong lúc dịch chỉ khi màn hình Hỗ trợ đang mở hay người dùng bấm gửi; không request nào chứa âm thanh hay nội dung chép lời)".
- **Website, đủ năm ngôn ngữ** (pháp lý chỉ vi/en):
  - **Liên hệ:** bỏ "đây là kênh hỗ trợ duy nhất", "không có form trên web"; thêm chat (bong bóng ở góc trang, mục Hỗ trợ trong app) cạnh email; ô "Kênh khác" ghi đúng sự thật.
  - **Dữ liệu và bảo mật:** thêm chat hỗ trợ vào phần dữ liệu rời máy và dữ liệu trên máy chủ.
  - Không nhắc Zalo hay Zalo Bot ở các trang thường (kiến trúc nội bộ, quy tắc "không công bố công nghệ lõi" của `website/README.md`); chỉ chính sách nêu Zalo vì luật bắt buộc nêu bên xử lý. Test chặn cụm "Zalo Bot" và "zaloplatforms" ngoài trang chính sách.

## 6. Kiểm thử

- **Bước 0: thử Zalo Bot trước khi viết code** (kế hoạch 01, việc đầu). Chủ dự án tạo bot và đặt token vào `.env` cục bộ (không commit). Kiểm bằng `curl`:
  1. bot nhắn chủ động cho chủ dự án được;
  2. sau ít nhất 3 ngày không ai nhắn bot, bot vẫn nhắn được (không có cửa sổ thời gian như OA);
  3. tin có dấu tiếng Việt, emoji, đúng 2000 ký tự gửi được và hiện đúng;
  4. thân webhook thật khớp tài liệu (`event_name`, `message.chat.id`, `message_id`), header secret có mặt;
  5. hạn mức của gói miễn phí (xem ở Zalo Bot Manager).

  Ghi kết quả vào `bench/2026-10-22-chat-ho-tro/`. Điều 1, 2 hay 4 không đạt thì dừng và chọn lại hướng.
- **Server (vitest, Zalo giả như PayOS/Creem giả):**
  - tạo cuộc chat, gửi, nhận, `after`;
  - định tuyến có mã, không mã với 0/1/2 cuộc chat trong 30 phút;
  - `/ds`, `/chan`, `/mo`, `/tat`, `/bat`, lệnh lạ;
  - sai secret, người gửi khác chủ dự án, `message_id` trùng, sự kiện không phải chữ;
  - giới hạn tần suất và `support_busy`;
  - chuyển lại khi Zalo lỗi, giữ thứ tự, `support_zalo_failed` sau 3 lần;
  - email câu trả lời (2 phút, gộp, 1 giờ), xóa sau 90 ngày, khách tự xóa;
  - CORS đúng origin;
  - **email khách không bao giờ có trong thân gửi Zalo**;
  - polling không có tin mới thì không ghi D1.

  Test Node của `wrangler.jsonc` cập nhật `secrets.required`.
- **App:** test Rust cho client (API giả, như `diagnostics/send.rs`), cho luật nhịp hỏi (3 giây, 15 giây, 60 giây, dừng khi dịch, không kết nối khi chưa dùng chat), và cho dòng thông tin máy (không chứa key, email, mã máy). Test vitest cho màn hình Hỗ trợ và store. `check-i18n` năm ngôn ngữ. Chụp giao diện bằng `scripts/ui-preview` (IPC giả).
- **Website:** test header CSP, test chặn "Zalo Bot", test nội dung năm ngôn ngữ có sẵn. Playwright: mở bong bóng, gửi tin, nhận trả lời từ server giả, thẻ email, xóa cuộc chat, chế độ tắt.
- **A7 bằng proxy:** chưa dùng chat thì **0 kết nối mới**; dùng chat thì chỉ tới `api.`; đang dịch mà màn hình Hỗ trợ đóng thì không có request chat.
- **Thử tay sau deploy:** chủ dự án chat từ website và từ app, trả lời có mã và không mã, thử `/tat`, `/bat`, thư email khi rời trang.

## 7. Triển khai và kế hoạch

1. Làm thẳng trên `main` (kiểm `git branch --show-current` trước mỗi commit). Không push, không deploy khi chưa được cho phép.
2. **Server deploy trước, chat tắt** (`enabled = 0`). Việc của chủ dự án theo runbook (Claude soạn sẵn lệnh; Claude không tự đặt secret):
   1. Zalo › **Zalo Bot Manager** › Tạo bot (tên bắt đầu bằng "Bot"); token đến qua tin nhắn.
   2. Nhắn một tin cho bot; chạy `getUpdates` (khi chưa đặt webhook) để lấy `chat.id`.
   3. `wrangler secret put` ba secret; chạy migration 0005; `wrangler deploy`; kiểm cron còn chạy (bài học sự cố cron 2026-10-07).
   4. `setWebhook` tới `https://api.aitranslator.io.vn/v1/webhooks/zalo` kèm `secret_token`; `getWebhookInfo` để kiểm.
   5. Nhắn `/ds` cho bot để kiểm hai chiều.
3. **App 0.2.4** có màn hình Hỗ trợ và chính sách 1.5, theo quy trình phát hành 5 bước.
4. **Website deploy** sau khi 0.2.4 lên R2, để trang Liên hệ và chính sách khớp app.
5. Chủ dự án nhắn `/bat`, thử tay (mục 6).

**Kế hoạch:**
- **01:** bước 0 (thử Zalo Bot) và server (migration, endpoint, webhook, lệnh, cron, cảnh báo, test, runbook cài đặt).
- **02:** bong bóng chat trên website (JS, CSS, CSP, chữ năm ngôn ngữ, test).
- **03:** màn hình Hỗ trợ trong app (Rust, IPC, ACL, giao diện, i18n, test).
- **04:** chính sách 1.5, A7 trong spec gốc, nội dung website năm ngôn ngữ (Liên hệ, Dữ liệu và bảo mật), runbook phát hành.

01 làm trước; 02 và 03 làm song song sau khi API của 01 chốt; 04 cuối cùng.

## 8. Rủi ro

- **Zalo Bot Platform còn mới** (tài liệu cập nhật 2025): API, giá hay giới hạn có thể đổi; điều khoản cho Zalo quyền tạm ngưng tài khoản bot. Bước 0 kiểm trước; khi Zalo lỗi, tin vẫn được lưu và có cảnh báo email, khách thấy email support@ nếu chủ dự án `/tat`.
- **Webhook phụ thuộc DNS của `io.vn`.** Sự cố DNSSEC ngày 2026-10-22 làm mọi `*.io.vn` không phân giải được ở nhiều resolver; khi đó Zalo không gọi được webhook (câu trả lời của chủ dự án không tới khách) dù chiều khách → Zalo vẫn chạy. Chấp nhận; theo dõi bằng `getWebhookInfo` khi nghi ngờ.
- **Spam** khi chưa có Turnstile: giới hạn ở mục 2.7, `/chan`, `/tat`.
- **Gửi nhầm khách:** luật không đoán khi có từ hai cuộc chat (mục 2.4) và lời xác nhận "✓ đã gửi tới #…".
- **Chưa có luật sư xem** phần chat trong chính sách 1.5 (cùng rủi ro đã chấp nhận ở `docs/legal/README.md`). Zalo lưu dữ liệu ở Việt Nam nên không thêm việc chuyển dữ liệu ra nước ngoài; Cloudflare vẫn ở ngoài Việt Nam như hiện nay.

## 9. Không làm (bản đầu)

- Gửi ảnh hay file trong chat.
- Dịch máy tin nhắn của khách.
- Trang xem hội thoại ở Web Admin (Zalo là hộp thư; xóa theo yêu cầu bằng nút của khách, hay câu lệnh D1 trong runbook).
- Turnstile, giờ làm việc hay trả lời tự động, nhiều người trả lời.
- Thông báo hệ thống (notification của macOS hay Windows) khi có câu trả lời.
