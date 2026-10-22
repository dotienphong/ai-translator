# Chat hỗ trợ 00: tổng quan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách chat trên website (bong bóng nổi) và trong app (mục Hỗ trợ); tin nhắn tới Zalo cá nhân của chủ dự án qua Zalo Bot; chủ dự án trả lời ngay trong Zalo và câu trả lời hiện trong khung chat của khách.

**Architecture:** Module `server/src/support/` trong Worker `mt-license` (`api.aitranslator.io.vn`) lưu cuộc chat vào D1 (migration 0005), chuyển tin khách sang Zalo bằng `sendMessage` của Zalo Bot, nhận câu trả lời qua webhook `POST /v1/webhooks/zalo`. Website và app hỏi tin mới định kỳ (polling) qua `GET /v1/support/messages`. App đi qua Rust (`reqwest`) và IPC vì CSP chặn webview gọi mạng.

**Tech Stack:** Cloudflare Workers + D1, Hono 4.13, TypeScript 7 strict, vitest 4 với `@cloudflare/vitest-plugin`; website JS thuần (ES module, không framework); app Rust 2024 + Tauri 2, React 19, Zustand 5, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-chat-ho-tro-zalo-design.md`. Đọc spec trước khi làm.

---

## Các kế hoạch và thứ tự

| # | File | Làm gì | Cần trước |
|---|---|---|---|
| 01 | `2026-10-22-chat-ho-tro-01-server.md` | **Bước 0: thử Zalo Bot (cổng)**; migration 0005, endpoint của khách, webhook Zalo, lệnh, cron, cảnh báo, CORS, test, runbook cài đặt bot | — |
| 02 | `2026-10-22-chat-ho-tro-02-website.md` | Bong bóng và khung chat trên website (JS, CSS, năm ngôn ngữ), CSP, test | Hợp đồng ở dưới (không cần 01 xong) |
| 03 | `2026-10-22-chat-ho-tro-03-app.md` | Module Rust `support/`, 6 lệnh IPC (có `support_screen`; không có lệnh `status`: chưa có cuộc chat thì app không gọi mạng), ACL, màn hình Hỗ trợ, nhịp hỏi tin, i18n năm ngôn ngữ, test | Hợp đồng ở dưới (không cần 01 xong) |
| 04 | `2026-10-22-chat-ho-tro-04-phap-ly-noi-dung.md` | Chính sách quyền riêng tư 1.5, A7 trong spec gốc, trang Liên hệ và Dữ liệu và bảo mật năm ngôn ngữ, test chặn "Zalo Bot", runbook phát hành | 01, 02, 03 |

**Cổng:** Task 1 của kế hoạch 01 là bước 0 (thử Zalo Bot bằng `curl`, cần chủ dự án tạo bot). Điều 1, 2 hay 4 của bước 0 không đạt thì **dừng mọi kế hoạch**, báo chủ dự án. 02 và 03 viết theo hợp đồng nên làm song song được với 01, nhưng không deploy hay phát hành gì trước khi cổng qua.

## Quy tắc chung cho mọi kế hoạch

- Làm **thẳng trên nhánh `main`** trong thư mục `/Users/dtphong/Desktop/software_business/ai-translator` (chủ dự án yêu cầu, 2026-10-22). **Mọi lệnh bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/ai-translator &&`**: shell reset thư mục sau mỗi lệnh. Trước mỗi commit chạy `git branch --show-current` (phải ra `main`); thư mục này có thể có phiên khác cùng làm, nên chỉ `git add` đúng các file của task, không `git add -A`.
- **Không push, không deploy, không phát hành, không đặt secret.** Chủ dự án quyết và tự chạy các việc đó.
- Server: `pnpm -C server typecheck`, `pnpm -C server test`, `pnpm -C server test:scripts`. TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- Website: `cd website && pnpm test` và `pnpm build`.
- App: `cargo fmt --all -- --check`, `cargo clippy --locked --workspace --all-targets -- -D warnings`, `sh scripts/check-windows.sh --locked`, `cargo test --locked -p meeting-translator --lib`, `pnpm build`, `pnpm test`, `node scripts/ui-preview/check-i18n.mjs`.
- Chú thích trong mã bằng tiếng Việt, theo giọng các file kế bên.
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Không thêm biến môi trường ghi đè URL hay môi trường staging (CLAUDE.md). App và website luôn gọi production `https://api.aitranslator.io.vn`.
- Thư viện mới: không cần thư viện nào. Nếu thấy cần, dừng và hỏi (CLAUDE.md, spec gốc §6.12).

## Hợp đồng API (01 cài đặt; 02 và 03 dùng; đừng đổi khi chưa sửa cả ba kế hoạch)

Gốc: `https://api.aitranslator.io.vn`. Request ghi (`POST`, `PUT`, `DELETE`) phải có `Content-Type: application/json` và thân là object JSON (kể cả `DELETE`: gửi `{}`), tối đa 16 KiB (trần chung của `/v1`). Token của cuộc chat đi trong `Authorization: Bearer <token>`; token là 43 ký tự base64url (32 byte ngẫu nhiên).

```ts
type Lang = "vi" | "en" | "ja" | "zh" | "ko";
type Source = "web" | "app" | "app-debug";
interface SupportMessage {
  id: number;            // tăng dần trong toàn hệ thống; dùng làm con trỏ `after`
  sender: "customer" | "owner";
  text: string;
  created_at: number;    // giây Unix
}
```

| Request | Thành công | Lỗi |
|---|---|---|
| `GET /v1/support/status` | `200 { "enabled": boolean }` | — |
| `POST /v1/support/messages` không có `Authorization`, thân `{ "text": string, "lang": Lang, "source": Source, "page"?: string \| null, "context"?: string \| null }` | `201 { "token": string, "message": SupportMessage }` (cuộc chat mới) | `400`, `429`, `503` |
| `POST /v1/support/messages` có `Authorization`, thân `{ "text": string }` (các khóa khác bị bỏ qua) | `201 { "message": SupportMessage }` | `400`, `401`, `403`, `429`, `503` |
| `GET /v1/support/messages?after=<số nguyên ≥ 0>` có `Authorization` | `200 { "enabled": boolean, "status": "open" \| "closed", "messages": SupportMessage[] }` (tin có `id > after`, tăng dần, tối đa 200) | `400`, `401`, `429` |
| `PUT /v1/support/email` có `Authorization`, thân `{ "email": string \| null }` | `200 { "ok": true }` | `400`, `401`, `403`, `429` |
| `DELETE /v1/support/conversation` có `Authorization`, thân `{}` | `200 { "ok": true }` | `401`, `429` |

Thân lỗi luôn là `{ "error": <mã> }` (dạng chung của `server/src/http.ts`):

| Mã trạng thái | `error` | Khi nào | Khách làm gì |
|---|---|---|---|
| 400 | `invalid_request` (kèm `"field": "text" \| "lang" \| "source" \| "page" \| "context" \| "email" \| "after" \| "body"`) | thân sai | hiện lỗi chung, không thử lại |
| 401 | `invalid_token` | token sai hay cuộc chat đã bị xóa (khách tự xóa, hay hết 90 ngày) | xóa token đã lưu, bắt đầu cuộc mới ở tin kế tiếp |
| 403 | `conversation_closed` | cuộc chat bị chủ dự án chặn (`/chan`) | thay ô nhập bằng email support@ |
| 413 | `invalid_request` | thân quá 16 KiB | như 400 |
| 415 | `unsupported_media_type` | thiếu `Content-Type: application/json` | lỗi lập trình |
| 429 | `rate_limited` (kèm header `Retry-After` giây) | vượt giới hạn tần suất | hiện "gửi quá nhanh, thử lại sau", giãn nhịp hỏi |
| 429 | `support_busy` (kèm `Retry-After`) | chạm trần toàn hệ thống | hiện "đang bận, hãy gửi email tới support@" |
| 503 | `support_disabled` | chủ dự án đã `/tat` | thay ô nhập bằng email support@ |

Luật nội dung (server kiểm, khách kiểm trước để báo sớm):
- `text`: đổi `\r\n` và `\r` thành `\n`, bỏ ký tự điều khiển trừ `\n` (tab thành dấu cách), bỏ khoảng trắng hai đầu; còn **1–1000 ký tự** (đếm theo code point, `Array.from`).
- `page`: chỉ web; phải bắt đầu bằng `/`; server bỏ phần `?…` và `#…`, cắt còn 200 ký tự. Sai dạng thì coi như `null` (không lỗi).
- `context`: chỉ app; bỏ ký tự điều khiển, cắt còn 300 ký tự. Rỗng thì `null`.
- `email`: dạng của `parseEmail` trong `server/src/http.ts` (tối đa 254 ký tự, chữ thường); `null` để bỏ email.

**CORS** (chỉ các đường `/v1/support/*`): origin duy nhất `https://aitranslator.io.vn`; phương thức `GET, POST, PUT, DELETE, OPTIONS`; header `Content-Type, Authorization`; lộ header `Retry-After`; `Access-Control-Max-Age: 86400`. Origin khác không có header CORS (trình duyệt chặn). App gọi không có `Origin`.

**Giới hạn phía server** (để khách hiểu khi nào gặp 429): tin mỗi IP 30/giờ, cuộc chat mới mỗi IP 5/giờ, tin mỗi cuộc chat 20/giờ, đặt email mỗi cuộc chat 5/giờ, toàn hệ thống 200 tin khách/giờ; hỏi tin mới 60 lần/phút mỗi token. Token sai tính là thất bại của IP (bộ đếm `failure_ip` có sẵn, 60/giờ).

## Hợp đồng phía khách (02 và 03 làm giống nhau)

- **Nhịp hỏi tin mới:**

  | Lúc nào | Nhịp |
  |---|---|
  | Khung chat (website) hay màn hình Hỗ trợ (app) đang mở và đang hiện | 3 giây; sau 2 phút liền không có tin mới thì 15 giây; có tin mới hay khách gửi tin thì về 3 giây |
  | Đang chờ trả lời: tin cuối cùng là của khách, gửi trong 24 giờ qua; khung đóng nhưng trang/cửa sổ đang hiện. **App: và không đang dịch** | website: hỏi một lần khi tải trang rồi 60 giây; app: 60 giây. Có tin chủ dự án mới thì hiện chấm đỏ (bong bóng / mục Hỗ trợ) |
  | Còn lại, kể cả khi chưa từng chat | Không gọi mạng |

  Nhận `429` thì chờ đúng `Retry-After` (tối thiểu 15 giây) rồi mới hỏi lại. Lỗi mạng thì giãn dần 3 → 15 → 60 giây.
- **Lưu phía khách:** `{ token, lastId, waitingSince }` (`waitingSince`: giây Unix của tin khách cuối chưa có trả lời, hay `null`). Website: `localStorage` khóa `support.v1`. App: file `support.json` trong thư mục dữ liệu của app. Nhận `401 invalid_token` thì xóa bản lưu.
- **Lịch sử khi mở lại:** gọi `GET ?after=0` để lấy lại toàn bộ cuộc chat (tối đa 200 tin; khách hiếm khi vượt vì giới hạn 20 tin/giờ và cuộc chat hết hạn sau 90 ngày).
- **Gửi tin:** hiện ngay tin của khách với trạng thái "đang gửi"; `201` thì "Đã gửi" và lấy `id` từ `message`; lỗi thì "Không gửi được, thử lại" (bấm để gửi lại đúng nội dung đó).
- **Ô email:** hiện sau tin đầu tiên được gửi thành công, cho tới khi khách lưu email hay bấm đóng thẻ; lưu bằng `PUT /v1/support/email`. Bản đầu không có chỗ đổi email đã lưu (khách muốn đổi thì xóa cuộc trò chuyện hay gửi email support@).
- **Hỏi tin nền cũng tính là đã nhận:** lần hỏi lúc khung đóng (nhịp 60 giây, để hiện chấm đỏ) trả về câu trả lời thì server coi khách đã nhận (`delivered_owner_id`), nên không gửi email cho câu đó. Chấp nhận (chủ dự án duyệt thiết kế, Claude chốt 2026-10-22): khách đang mở website hay app thì thấy chấm đỏ; email chỉ dành cho khách đã rời đi.
- **Xóa cuộc trò chuyện:** hỏi lại trước khi xóa; `DELETE /v1/support/conversation`; `200` hay `401` thì xóa bản lưu và về trạng thái mới.
- **Khi tắt:** `enabled = false` (từ `status` hay từ thân `GET messages`) hay `503 support_disabled` thì ô nhập được thay bằng dòng "Chat đang tạm tắt. Hãy gửi email tới support@aitranslator.io.vn" (năm ngôn ngữ); lịch sử cũ vẫn hiện. `status: "closed"` hay `403` thì "Cuộc trò chuyện đã đóng. Hãy gửi email tới support@aitranslator.io.vn".
- **Lời chào** (tin hiển thị phía khách, không gửi lên server), chữ đặt ở file chữ của từng kế hoạch:
  - vi: "Chào bạn 👋 Bạn cần giúp gì? Bạn có thể viết bằng tiếng Việt hoặc English."
  - en: "Hi 👋 How can we help? You can write in English or Vietnamese."
  - ja: "こんにちは 👋 どのようなご用件でしょうか？できれば英語でお書きください。"
  - zh: "你好 👋 有什么可以帮你？如果可以，请用英文书写。"
  - ko: "안녕하세요 👋 무엇을 도와드릴까요? 가능하면 영어로 써 주세요."
- **Dòng phụ dưới tiêu đề:** vi "Người thật trả lời, không phải bot · chưa cam kết thời gian trả lời"; en "A real person replies, not a bot · no guaranteed response time"; ja "ボットではなく人が返信します · 返信時間は保証していません"; zh "由真人回复，不是机器人 · 不保证回复时间"; ko "봇이 아닌 사람이 답변합니다 · 답변 시간은 보장하지 않습니다".
- **Chân khung:** vi "Tin nhắn được lưu 90 ngày · Quyền riêng tư"; en "Messages are kept for 90 days · Privacy"; ja "メッセージは 90 日間保存されます · プライバシー"; zh "消息保存 90 天 · 隐私"; ko "메시지는 90일간 보관됩니다 · 개인정보". "Quyền riêng tư" dẫn tới chính sách (website: `/chinh-sach-quyen-rieng-tu/` cho vi, `/en/privacy/` cho các ngôn ngữ khác; app: mở chính sách trong app). Website ja/zh/ko thêm sau chữ liên kết "（英語）" / "（英文）" / "(영어)" như chân trang của website (chính sách chỉ có vi/en). Chữ ja/zh theo quy tắc dịch của website và app: một khoảng trắng giữa chữ Nhật/Hán và số hay chữ Latin; tiếng Hàn số dính đơn vị.

## Mốc số test

Đo ngày 2026-10-22 trên `main` (commit spec `01c2077a`). Mã của kế hoạch 02, 03, 04 đã chạy thật trên bản sao của repo khi viết kế hoạch; kế hoạch 01 chưa chạy thử. Số khác mốc lúc bắt đầu (phiên khác đã thêm test) thì ghi số mới ở Task 0 của kế hoạch đó và cộng đúng phần chênh.

| Bộ test | Lệnh | Mốc | Sau kế hoạch |
|---|---|---|---|
| Server (vitest) | `pnpm -C server test` | 1523 | 1625 (01) |
| Server (script Node) | `pnpm -C server test:scripts` | 43 (42 đạt, 1 bỏ qua) | 44 (01) |
| Website | `cd website && pnpm test` | 152 (150 đạt, 2 bỏ qua) | 197 (02), rồi +7 (04) |
| Giao diện app | `pnpm test` | 331 (26 file) | 359 (28 file) (03) |
| Rust app | `cargo test --locked -p meeting-translator --lib` | 753 passed, 6 ignored | 798 (03) |
