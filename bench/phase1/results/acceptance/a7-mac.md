# A7: kiểm lưu lượng ra ngoài trên macOS (2026-10-06)

**Kết quả: A7 ĐẠT** (`a7-mac.json`: `external: 3`, `in_session: 1`, không vi phạm).

- **Bản đo:** bản release `0.1.0` ký ad-hoc, không notarize (cùng bản với A5, CDHash `ed2e7ecf0dc52444e9ae6bde4ae37c5610aa34d9`), cài ở `/Applications`, gói Pro X2. Máy MacBook Pro M4 Pro, macOS 26.6.2.
- **Proxy:** `mitmdump` 12.2.3, `--mode local:meeting-translator,asr-worker,llama-server --set hardump=…`; chứng chỉ gốc mitmproxy cài vào System keychain trong lúc đo, **đã gỡ và kiểm lại** sau đó (không còn trong System keychain, không còn trong cài đặt tin cậy admin).
- **Phiên dịch:** 08:08:29 → 08:24:11 (+07:00), 15 phút 42 giây; **158 đoạn, 0 lỗi**; tải là `public/listen-test-en.wav` lặp (câu mẫu có từ mồi "kết quả phân tích").
- **Công cụ:** `netaudit.py <HAR> --allow a7-allow.json --app-log app.log --start 2026-10-06T08:08:29+07:00 --stop 2026-10-06T08:24:11+07:00`; mốc đã ghi hợp với log của app.

## Kết quả

| Kiểm tra | Kết quả |
|---|---|
| Request ra ngoài (HAR) | 3, đều tới máy chủ trong danh sách cho phép: `POST mt-license…workers.dev/v1/licenses/validate` lúc 08:07:45 (trước Bắt đầu) và 08:24:19 (sau Dừng); `GET pub-….r2.dev/stable/latest.json` lúc 08:08:35 |
| Trong lúc dịch | **1**: chính là `GET /stable/latest.json` (kiểm tra bản cập nhật chạy theo lịch, `during_session: true` trong danh sách cho phép); không có `validate` hay request nào khác |
| Vi phạm | Không |
| `nettop` (15 phút, `-s 5`, 180 mẫu, 7 tiến trình: app, 4 WebKit, `asr-worker`, `llama-server`) | **Không có dòng dữ liệu nào**: không luồng ngoài nào mở ở bất kỳ tiến trình nào, WebView và hai tiến trình phụ kể cả |
| Từ mồi trong log của app | 0 file chứa chữ chép lời |
| Từ mồi trong HAR | 0 |
| Log của app (WARN/ERROR) | Không có, ngoài lỗi kiểm tra cập nhật do chưa có bản trên R2 |

## Ghi chú
- **Lần chạy đầu không hợp lệ** (06:15 → 06:33): HAR chỉ có 2 request, cả hai trước khi dịch, vì bước "Kiểm tra ngay" sau Dừng bị bỏ sót; `netaudit` báo `KHÔNG ĐẠT` đúng thiết kế (HAR phải có request cả trước và sau phiên để chứng minh proxy bắt được suốt cửa sổ). Không có request nào trong lúc dịch ở lần đó, nhưng kết quả không tính. Lần chạy lại ở trên có đủ.
- **Giới hạn đã chấp nhận của chế độ `local:`** (sổ tay): không bắt được request của tiến trình WebView và luồng không phải HTTP; phần đó được bù bằng `nettop` (không có luồng ngoài nào).
- **Mã máy không ổn định:** `host` trong `a7-mac.json` là `086fe9c54946`, khác `707254bd1029` của `a5-mac.json`. Công cụ (`soak.py`) lấy mã từ `uuid.getnode()` (địa chỉ MAC), mà máy này có nhiều giao diện mạng (Tailscale, VPN, nhiều `en*`) nên giá trị đổi giữa các lần chạy. Cùng một máy; báo cáo tổng hợp không đối chiếu mã này, nhưng nên dùng `IOPlatformUUID` ở lần sửa công cụ sau.
- Bản này không phải bản ký Developer ID đã notarize.
