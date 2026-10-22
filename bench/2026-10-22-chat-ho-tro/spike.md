# Bước 0: thử Zalo Bot (2026-10-22)

Kế hoạch `docs/superpowers/plans/2026-10-22-chat-ho-tro-01-server.md`, Task 1. Spec `2026-10-22-chat-ho-tro-zalo-design.md` mục 6. Bot: `Bot AI Translator` (tài khoản `bot.kmiJKBfs`, `account_type` BASIC), tạo bằng Zalo Bot Manager. Token và `chat_id` chỉ nằm trong `.env.zalo-spike` trên máy dev (git bỏ qua `.env*`).

| # | Điều kiểm | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | Bot nhắn chủ động cho chủ dự án | **Đạt** | `t1`: HTTP 200, `{"ok":true,"result":{"message_id":"…","date":…},"error_code":0}`; chủ dự án xác nhận đã nhận |
| 2 | Sau ít nhất 3 ngày không ai nhắn bot, bot vẫn nhắn được | **Chưa kiểm: hẹn 2026-10-25** | Chủ dự án không nhắn bot từ 2026-10-22 tới ngày đó; rồi gửi lại `t1` với chữ "Kiểm tra điều 2 sau 3 ngày" |
| 3 | Dấu tiếng Việt, emoji, xuống dòng; đúng 2000 đơn vị | **Đạt** | `t2` (dòng `🆕 #K7Q · web · vi · /bang-gia/` + dòng tiếng Việt có dấu và emoji) hiện đúng; `"Đ"*1997+"Hết"` (2000 ký tự) và `"😀"*999+"xy"` (2000 đơn vị UTF-16) được nhận và hiện đủ (chủ dự án xác nhận) |
| 4 | Dạng sự kiện khớp tài liệu và `parseUpdate` | **Đạt** | `result` là **object**; `message.chat.id`, `message.from.id`, `message.message_id` là **chuỗi**; `event_name` `message.text.received`; `chat_type` `PRIVATE` |
| 5 | Hạn mức gói miễn phí | Chưa xem | Xem ở mục Giá gói của Zalo Bot Manager trước khi bật chat; so với trần 200 tin khách mỗi giờ của server |

**Zalo đếm 2000 theo đơn vị UTF-16**, không theo code point: `"😀"*1000+"x"*1000` (2000 code point, 3000 đơn vị UTF-16) bị từ chối; `"😀"*999+"xy"` (2000 đơn vị) được nhận; `"😀"*999+"xyz"` (2001 đơn vị) bị từ chối. Server cắt tin bằng `fitUtf16` (`server/src/support/text.ts`) trước khi gửi: đúng.

**Zalo báo lỗi bằng HTTP 200**, mã lỗi trong thân:

- Tin quá dài: HTTP 200, `{"ok":false,"description":"Bad request: The text must not exceed 2000 characters","error_code":400}`.
- Token sai (`bot0:token-sai`): HTTP 200, `{"ok":false,"description":"Unauthorized","error_code":401}`.

Mã server đã sửa theo (`f519fe92`): `HttpZaloBot` lấy `error_code` trong thân làm mã lỗi, để `isContentRejection` phân biệt từ chối nội dung (400) với token sai (401) hay Zalo lỗi.

**`getUpdates` không giữ tin**: tin chủ dự án nhắn trước khi có lệnh `getUpdates` đang chờ thì mất (hai tin `xin chào`, `kiểm tra` không bao giờ tới); chỉ tin nhắn trong lúc lệnh chờ (long polling, `timeout` 30) mới tới. Hết thời gian chờ mà không có tin thì `{"ok":false,"description":"Request timeout","error_code":408}`. Với webhook (production) không có chuyện này. Runbook `docs/release/phat-hanh.md` mục 11 bước 2: chạy `getUpdates` rồi **mới** nhắn bot trong lúc lệnh đang chờ.

`getWebhookInfo` khi chưa đặt webhook: `{"ok":false,"description":"Not Found","error_code":404}`.

Mở cuộc trò chuyện với bot: tài liệu Zalo không nói; chủ dự án tìm được bot trong Zalo (tên `Bot AI Translator`) rồi nhắn.

Dạng một sự kiện (đã che id và tên):

    {
      "ok": true,
      "result": {
        "message": {
          "chat": { "id": "…90ec", "chat_type": "PRIVATE" },
          "text": "Hi",
          "message_id": "…8c3c",
          "date": 1792686308673,
          "from": { "id": "…90ec", "is_bot": false, "display_name": "<tên>" }
        },
        "event_name": "message.text.received"
      },
      "error_code": 0
    }

**Kết luận cổng:** qua (điều 1, 3, 4 đạt). Điều 2 phải đạt trước khi bật chat (`docs/release/phat-hanh.md` mục 11, bước 13). Thân webhook thật (dạng gửi tới `/v1/webhooks/zalo`) đối chiếu ở runbook mục 11 bước 9.

## Đặt webhook trên production (2026-10-22, runbook mục 11 bước 8)

- Lần đầu `setWebhook`: URL được lưu nhưng `verification` báo `webhook.http.403`. Log của Worker không có request nào: Cloudflare chặn ở rìa. Security › Events: **Service = Browser integrity check, Action = Block** (Zalo gọi từ máy chủ với User-Agent `Java/1.8.0_192`).
- Sửa ở zone `aitranslator.io.vn`: Configuration Rule `zalo-webhook-no-bic` (`http.host eq "api.aitranslator.io.vn" and http.request.uri.path eq "/v1/webhooks/zalo"`) đặt Browser Integrity Check = Off; luật rate limit `webhook-rate-limit` đổi thành `(starts_with(http.request.uri.path, "/v1/webhooks/") and not http.request.uri.path eq "/v1/webhooks/zalo")`.
- Lần hai `setWebhook`: `"verification":{"ok":true,"outcome":"webhook.ok"}`. Request thử tới Worker, **có** header `X-Bot-Api-Secret-Token`; thân **không bọc** trong `result` và **không có** `chat`/`from`: `{"event_name": string, "message": {"date": number, "message_id": string, "text": string}}`, nên Worker ghi `zalo_webhook_unreadable` và trả 200 (đúng: không có người gửi để kiểm).
