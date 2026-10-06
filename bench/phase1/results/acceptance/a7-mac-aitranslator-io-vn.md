# A7 sau khi chuyển sang tên miền riêng (macOS, 2026-10-06)

**Kết quả: A7 ĐẠT** (`a7-mac-aitranslator-io-vn.json`: `external: 3`, `in_session: 1`, không vi phạm). Lượt ngắn (5 phút dịch) để kiểm danh sách cho phép đã đổi sang tên miền mới; lượt chính thức 15 phút trước đó là `a7-mac.md` (trên `workers.dev` và `r2.dev`).

- **Bản đo:** bản release `0.1.0` ký ad-hoc dựng từ `main` sau `88a9749` (CDHash `96a8ef1dd9eb1c5fa931eab18f98cf4ada7bdedc`), URL nhúng `api.aitranslator.io.vn` và `releases.aitranslator.io.vn`; gói Professional (đơn 1000004). MacBook Pro M4 Pro, macOS 26.6.2.
- **Proxy:** `mitmdump` `--mode local:meeting-translator,asr-worker,llama-server --set hardump=…`; chứng chỉ gốc mitmproxy cài vào System keychain trong lúc đo, **đã gỡ và kiểm lại** (không còn trong System keychain hay cài đặt tin cậy admin).
- **Phiên dịch:** 12:40:31 → 12:49:22 (+07:00), 55 đoạn, 0 lỗi; tải là `public/listen-test-en.wav` lặp.

| Kiểm tra | Kết quả |
|---|---|
| Request ra ngoài (HAR) | 3, đều tới máy chủ trong danh sách cho phép: `POST api.aitranslator.io.vn/v1/licenses/validate` lúc 12:40:02 (trước Bắt đầu) và 12:49:36 (sau Dừng); `GET releases.aitranslator.io.vn/stable/latest.json` lúc 12:40:57 |
| Trong lúc dịch | 1: `GET /stable/latest.json` (kiểm tra cập nhật theo lịch, `during_session: true`) |
| Vi phạm | Không |
| `nettop` (5 phút, 60 mẫu, 7 tiến trình) | Không có dòng dữ liệu nào: không luồng ngoài nào mở ở tiến trình nào, WebView và hai tiến trình phụ kể cả |
| Từ mồi trong log của app / trong HAR | 0 / 0 |

Mọi request tới hai tên mới; không còn request nào tới `workers.dev` hay `r2.dev`. Giới hạn của chế độ `local:` (không bắt WebView và luồng không phải HTTP) được bù bằng `nettop`, như sổ tay đã nêu.
