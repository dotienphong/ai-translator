# A7 chế độ Âm thanh máy + Micro (macOS, 2026-10-25)

**Kết quả: A7 ĐẠT** (`a7-mac-micro.json`: 3 request ra ngoài, 0 trong lúc dịch, không vi phạm). Khi micro mở, app không có
kết nối mới nào. Không request nào mang âm thanh. Log của app không có tên micro.

Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-04-phat-hanh.md`, Task 9. Tiêu chí: A7-mic (spec chính §3.3,
spec nguồn micro §8, §11).

- **Bản đo:**
  - bản release ký ad-hoc, không notarize, số phiên bản `0.2.7`, mã từ nhánh `nguon-micro` ở commit `b84fa86a`;
  - dựng bằng `build-sidecars-macos.sh`, `notices.mjs`, rồi `AI_TRANSLATOR_MAC_SIGNING=adhoc scripts/release/package-macos.sh`;
  - CDHash `aab693acc40f890666735f37fea15ad770c6248f`;
  - chạy thẳng từ `target/release/bundle/macos/`, không cài vào `/Applications`.
- **Máy:** MacBook Pro M4 Pro, macOS 26.6.2.
- **Cài đặt khi đo:**
  - Thu từ: Âm thanh máy + Micro; nguồn âm thanh máy "Toàn hệ thống, trừ app này";
  - micro mặc định (MacBook Pro Microphone, kết nối `builtin`), lọc tiếng ồn micro bật;
  - license thật gói 6 Months, gói model Chuẩn, dịch sang tiếng Việt, gửi báo cáo lỗi tự động bật.
  - Bản ad-hoc mới có chữ ký mới, nên macOS hỏi cả quyền Micro lẫn quyền Ghi âm thanh hệ thống; cả hai đều chọn Allow.
- **Proxy:** `mitmdump 12.2.3 --mode local:meeting-translator,asr-worker,llama-server --set hardump=…`. Chứng chỉ gốc mitmproxy
  chỉ được tin cậy ở System keychain trong lúc đo, do chủ dự án cài và gỡ bằng `sudo security`.
- **nettop:** đo song song, 120 mẫu × 5 giây (00:10:24 → 00:20:21) trên 8 tiến trình: `meeting-translator`, `asr-worker`,
  `llama-server` và 5 tiến trình WebKit (GPU, Networking, ba WebContent).
- **Phiên dịch:**
  - từ 00:09:45 tới 00:20:45 (+07:00), 11 phút;
  - tải là `public/listen-test-en.wav` phát lặp bằng `afplay` qua loa 60%, cách nhau 1 giây; tap âm thanh hệ thống và micro
    (qua loa) cùng nghe;
  - 89 đoạn (bộ lọc ảo giác bỏ 16), 73 câu dịch, 0 lỗi; tổng p50 768 ms;
  - micro mở lúc 00:10:15, sau khi bấm Allow cho hai hộp thoại quyền.

| Kiểm tra | Kết quả |
|---|---|
| Request ra ngoài (HAR) | 3, đều tới máy chủ trong danh sách cho phép: `GET releases.aitranslator.vn/stable/latest.json` lúc 00:08:59 (bấm Kiểm tra cập nhật, trước Bắt đầu); `POST api.aitranslator.vn/v1/licenses/validate` lúc 00:09:21 (Kiểm tra ngay, trước Bắt đầu) và lúc 00:21:12 (Kiểm tra ngay, sau Dừng). Thân `validate` 93 byte |
| Trong lúc dịch | **0 request.** Lần kiểm nhanh bản quyền lúc bắt đầu phiên không gọi mạng vì vừa kiểm 24 giây trước |
| `nettop` (120 mẫu, 8 tiến trình) | CSV chỉ có hàng tiêu đề: không tiến trình nào mở luồng ra ngoài trong 10 phút đo |
| Tên micro trong log | `MacBook Pro Microphone`: 0 lần trong `app.log`; log chỉ ghi "kết nối builtin" |
| Từ mồi (`plotting analysis`, `public website`, `kết quả phân tích`) | 0 trong thư mục log của app; HAR không có request nào mang nội dung |
| Vi phạm | Không |

## Giới hạn

- Chế độ `local:` của mitmproxy không bắt WebView và chỉ ghi luồng HTTP; phần đó được bù bằng `nettop`, như các lượt trước.
- Một máy, một bản dựng ký ad-hoc, một lần đo 11 phút. **Windows chưa đo.**
- `nettop` bắt đầu sau khi micro mở 9 giây, và dừng 24 giây trước khi bấm Dừng. Hai khoảng đó được HAR phủ.
- HAR đã xóa sau khi chấm, không commit.

## Phát hiện ngoài A7

Cuối phiên, thanh phụ đề có vài câu "Thank you." → "Cảm ơn bạn.", trong khi câu mẫu (một câu FLEURS) không có cụm này. Bộ
lọc ảo giác đã bỏ 16 đoạn của phiên. Các câu "Thank you." còn lọt nhiều khả năng là chữ ảo trong khoảng lặng 1 giây giữa các
lần phát, khi micro nghe đuôi tiếng vọng từ loa. Tiêu chí A-ảo hiện chỉ đo chế độ micro với tiếng ồn trong phòng (cảnh 6);
chưa đo khoảng lặng giữa các câu phát qua loa ở chế độ trộn. Cần đo riêng trước khi kết luận.
