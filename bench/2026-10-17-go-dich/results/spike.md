# Spike Gõ dịch S1–S3 (spec 2026-10-17-go-dich §7)

**Ngày:** 2026-10-17 (đêm) tới 2026-10-18
**Máy:** MacBook Pro Apple M4 Pro, macOS 26.6.2
**Bản:** nhánh `go-dich`, commit `dd73706` cộng bản sửa ô gõ (`b118ff1`), `scripts/run-dev-app.sh` (chứng thư cố định "AI Translator Dev", gói model Chuẩn)
**Người thử:** S1 do chủ dự án thử tay; S2 do Claude chạy tự động (TextEdit, Chrome) trên máy của chủ dự án với sự ủy quyền; ghi biên bản: Claude

| # | Kết quả | Ghi chú |
|---|---|---|
| S1 | Đạt | Chủ dự án báo đạt cả năm bước (ô soạn hiện đúng chỗ, gõ Telex, bộ gõ thứ hai, bộ gõ Nhật, Esc rồi mở lại). Log khớp: nhiều lần dịch 70–111 ms, và một lần "hỏi quyền Trợ năng; đã có quyền: false" lúc bấm Enter lần đầu |
| S2 | Đạt ở mọi bề mặt tự thử được; **tìm ra và sửa một lỗi thật** | `PASTE_DELAY` giữ **120 ms** (đạt 100%, chưa dò ngưỡng thấp hơn). App chat thật (Slack, Zalo, Zoom, Messenger…) chưa thử: làm ở nghiệm thu GD1 (kế hoạch 05) cùng chủ dự án |
| S3 | Chưa làm | Cần chủ dự án có mặt (macOS hỏi lại Keychain khoảng 5 lần và hỏi quyền Trợ năng bằng tay khi chữ ký đổi); không có điều kiện đạt (spec §7). Xem mục S3 |

## S1 — gõ trong NSPanel không kích hoạt app

Chủ dự án báo "đạt hết" (2026-10-17, lúc thử): TextEdit vẫn là app phía trước khi ô soạn mở, gõ Telex và bộ gõ thứ hai ra đúng chữ, bộ gõ Nhật chỉ chốt chữ ở Enter đầu, Esc rồi mở lại thì bản nháp còn và được chọn sẵn, bấm ra ngoài thì đóng. Chi tiết từng bộ gõ không được ghi lại ngoài lời báo "đạt".

## S2 — bàn phím về đúng ô chat, ⌘V vào đúng chỗ

Cách thử: giả lập phím bằng System Events (`key code`, `keystroke`) cho phím tắt ⌃⌥G, gõ, Enter, Esc, bộ gõ đang chọn là ABC và không có EVKey/OpenKey chạy; đọc nội dung ô nhận bằng AppleScript (TextEdit) hay Chrome DevTools Protocol (Chrome, hồ sơ tạm, đã xóa sau khi thử). Mỗi lượt kiểm: ô soạn mở (App có 1 cửa sổ), app chat vẫn ở phía trước, bản dịch trong ô nhận **bằng đúng clipboard**, ô soạn đóng sau Enter. Ở ô kiểu chat còn đếm số phím Enter lọt vào ô để biết có tin nào bị gửi nhầm.

| Nơi | Số lượt | Đạt | Ghi chú |
|---|---|---|---|
| TextEdit | 10 | 10 | 10 câu tiếng Anh khác nhau |
| TextEdit, tin hai dòng (Shift+Enter) | 1 | 1 | bản dịch giữ đúng hai dòng |
| TextEdit, toàn màn hình (⌃⌘F) | 3 | 3 | ô soạn nổi trên app toàn màn hình |
| Chrome, ô `contenteditable` (kiểu Messenger, Slack web) | 10 + 3 | 13 | **0 phím Enter lọt vào ô chat** (không có tin nào bị gửi nhầm) |
| Chrome, `textarea` | 5 + 1 | 6 | |
| Chrome, toàn màn hình (⌃⌘F), ô `contenteditable` | 3 | 3 | |

Thời gian dịch trong các lượt này (log `Gõ dịch: … ms`): 70–182 ms cho câu ngắn, tiến trình phụ đã nạp.

**Lỗi thật tìm thấy:** lượt thử đầu, Enter không dán: bản dịch đã xong nhưng ô soạn vẫn mở. Chụp màn hình thấy hộp gợi ý chữ của macOS ("Report ×") hiện ngay dưới con trỏ vì người gõ vừa xong từ cuối ("report") và Enter đến sớm. **Hộp gợi ý nuốt phím Enter đầu tiên**; Enter thứ hai mới dán. Người gõ nhanh rồi Enter ngay sẽ gặp lỗi này. Sửa: tắt sửa chính tả, tự sửa chữ, tự viết hoa ở ô gõ (`spellCheck={false}`, `autoCorrect="off"`, `autoCapitalize="off"`, `autoComplete="off"` ở `src/windows/compose/compose.tsx`). Sau khi sửa, 41/41 lượt ở bảng trên dán ngay ở Enter đầu tiên. Tiện thể ô gõ không còn gạch đỏ tiếng Việt, tiếng Nhật.

**Ghi chú về cách thử (cho lần sau):**
- `cliclick` gửi tổ hợp phím (⌃⌥G) và phím Esc không ổn định (đạt vài lần rồi ngừng); System Events thì ổn. Dùng System Events.
- Gõ giả lập tiếng Việt có dấu ở nguồn ABC bị mất dấu, nên câu thử đều bằng tiếng Anh; tiếng Việt có dấu đã được chủ dự án thử tay ở S1.
- Hộp thoại "Open" của TextEdit (do phím lọt vào TextEdit khi ô soạn không mở) chặn việc mở ô soạn; đóng bằng ⌘. rồi mới thử tiếp.
- Thang toạ độ ảnh chụp màn hình gấp đôi toạ độ điểm của `cliclick` (màn hình Retina).

**Chưa thử (để GD1):** Slack, Zalo PC, khung chat Zoom, Teams, Telegram, Discord, Messenger/Gmail thật, Safari, Notes, iMessage (cần tài khoản thật của chủ dự án; tránh để lại bản nháp trong cuộc chat thật khi tự động hóa). Nếu một app thật dán hụt thì tăng `PASTE_DELAY` (200, rồi 300 ms) và thử lại nơi đó.

## S3 — quyền Trợ năng với bản ký ad-hoc

**Chưa làm.** Việc cần chủ dự án có mặt: chạy `MT_DEV_SIGN_IDENTITY=- scripts/run-dev-app.sh` (chữ ký ad-hoc), macOS hỏi lại Keychain khoảng 5 lần và quyền Trợ năng phải cấp tay ở System Settings; rồi build lại (chữ ký đổi) để xem quyền có mất không và cách bật lại, và thử `tccutil reset Accessibility com.aitranslator.desktop` (không `sudo`). Điều đã biết từ S1: lần đầu bấm Enter khi chưa có quyền, app hỏi quyền (`AXIsProcessTrustedWithOptions`) và giữ ô soạn mở đúng thiết kế; sau khi cấp quyền cho bản ký bằng chứng thư cố định, dán chạy.

## Kết luận cho spec §4.2

- S1 và S2 đạt: kế hoạch 04, 05 được làm tiếp (cổng spike qua).
- `PASTE_DELAY` giữ 120 ms.
- Lời hướng dẫn bật lại quyền sau khi cập nhật: giữ câu "xóa khỏi danh sách rồi thêm lại, hoặc tắt rồi bật lại công tắc" ở Cài đặt › Gõ dịch và trên website; **chốt theo kết quả S3** khi làm S3 (nếu cách bật lại khác thì sửa `settings.compose.permission.missing` ở năm từ điển và hai trang website).
