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
| TextEdit | 12 | 12 | 12 câu khác nhau (11 tiếng Anh, 1 tiếng Việt không dấu) |
| TextEdit, tin hai dòng (Shift+Enter) | 1 | 1 | bản dịch giữ đúng hai dòng |
| TextEdit, toàn màn hình (⌃⌘F) | 3 | 3 | ô soạn nổi trên app toàn màn hình |
| Chrome, ô `contenteditable` (kiểu Messenger, Slack web) | 11 | 11 | **0 phím Enter lọt vào ô chat** (không có tin nào bị gửi nhầm) |
| Chrome, `textarea` | 6 | 6 | |
| Chrome, toàn màn hình (⌃⌘F), ô `contenteditable` | 3 | 3 | |

Thời gian dịch trong các lượt này (log `Gõ dịch: … ms`): 70–182 ms cho câu ngắn, tiến trình phụ đã nạp.

**Lỗi thật tìm thấy:** lượt thử đầu, Enter không dán: bản dịch đã xong nhưng ô soạn vẫn mở. Chụp màn hình thấy hộp gợi ý chữ của macOS ("Report ×") hiện ngay dưới con trỏ vì người gõ vừa xong từ cuối ("report") và Enter đến sớm. **Hộp gợi ý nuốt phím Enter đầu tiên**; Enter thứ hai mới dán. Người gõ nhanh rồi Enter ngay sẽ gặp lỗi này. Sửa: tắt sửa chính tả, tự sửa chữ, tự viết hoa ở ô gõ (`spellCheck={false}`, `autoCorrect="off"`, `autoCapitalize="off"`, `autoComplete="off"` ở `src/windows/compose/compose.tsx`). Sau khi sửa, 36/36 lượt ở bảng trên dán ngay ở Enter đầu tiên. Tiện thể ô gõ không còn gạch đỏ tiếng Việt, tiếng Nhật.

**Lỗi thật thứ hai (tìm thấy 2026-10-18 khi thử ở Teams):** mở lại ô soạn khi còn bản nháp (Esc rồi ⌃⌥G) thì bản nháp hiện ra nhưng **không được chọn**, con trỏ nằm ở đầu ô, nên chữ mới gõ **chèn vào trước bản nháp** thay vì đè lên (spec §1.2 nói bản nháp chọn sẵn). Tái hiện: gõ "Tomorrow I will send the report" (31 ký tự), Esc, mở lại, gõ lại đúng câu đó, ba lần liền: log ghi 62, 93, 124 ký tự, ô soạn hiện "…reportTomorrow I will send the reportTomorrow…". Mọi lượt S2 trước đều đạt vì ô luôn được dọn sau khi dán, không ai thử mở lại ô khi còn nháp. Nguyên nhân: phía Rust phát `compose://open` rồi mới hiện panel và đưa bàn phím vào WebView, nên lệnh `select()` của trang chạy khi trang chưa có focus và WebKit đặt con trỏ về đầu ô khi nhận focus. Sửa: chọn lại bản nháp khi cửa sổ trang nhận focus, chừng nào chưa gõ gì, bấm chuột hay bấm phím trong bản nháp (`untouched` ở `compose.tsx`); thử bằng bản dev đang chạy (Vite nạp lại giao diện): mở lại hai lần liền khi còn nháp, cả hai ra đúng 31 ký tự. Điều kiện mới `compose-reopen` ở `check-i18n.mjs` (sai khi bỏ bản sửa, đạt khi có; vi en ja zh ko).

**Ghi chú về cách thử (cho lần sau):**
- `cliclick` gửi tổ hợp phím (⌃⌥G) và phím Esc không ổn định (đạt vài lần rồi ngừng); System Events thì ổn. Dùng System Events.
- Gõ giả lập tiếng Việt có dấu ở nguồn ABC bị mất dấu, nên câu thử đều bằng tiếng Anh; tiếng Việt có dấu đã được chủ dự án thử tay ở S1.
- Hộp thoại "Open" của TextEdit (do phím lọt vào TextEdit khi ô soạn không mở) chặn việc mở ô soạn; đóng bằng ⌘. rồi mới thử tiếp.
- Thang toạ độ ảnh chụp màn hình gấp đôi toạ độ điểm của `cliclick` (màn hình Retina).

**Chưa thử (để GD1):** Slack, Zalo PC, khung chat Zoom, Teams, Telegram, Discord, Messenger/Gmail thật, Safari, Notes, iMessage (cần tài khoản thật của chủ dự án; tránh để lại bản nháp trong cuộc chat thật khi tự động hóa). Nếu một app thật dán hụt thì tăng `PASTE_DELAY` (200, rồi 300 ms) và thử lại nơi đó.

## S3 — quyền Trợ năng với bản ký ad-hoc

**Đã làm (chỉ ghi nhận, không có điều kiện đạt), 2026-10-18 06:25–06:37, macOS 26.6.2.** Đo bằng app thăm dò `S3Probe` (nguồn ở `bench/2026-10-17-go-dich/s3probe/`): chỉ gọi `AXIsProcessTrusted()` và `AXIsProcessTrustedWithOptions`, ký ad-hoc như bản phát hành (`codesign --sign -`, quyền gắn với cdhash), bundle id riêng `com.aitranslator.s3probe`, cùng một đường dẫn ở mọi lần dựng. Không dùng app thật để khỏi bị hỏi lại Keychain khoảng 5 lần và khỏi đụng quyền, vault của app. Mỗi lần kiểm bằng một tiến trình MỚI chạy qua `open` (chạy thẳng từ Terminal thì quyền tính cho Terminal). Chủ dự án làm các lần bật/tắt công tắc (cần Touch ID hay mật khẩu); `tccutil` và dựng lại do Claude.

| # | Việc | Kết quả |
|---|---|---|
| 1 | v1 xin quyền, chủ dự án bật công tắc | `trusted=1` |
| 2 | Dựng lại thành v2 (binary đổi nên cdhash `fd307dbc…` thành `1bc0f9b6…`), cùng đường dẫn và bundle id | `trusted=0`. Mục S3Probe **vẫn hiện, công tắc vẫn bật**: trạng thái dễ gây nhầm |
| 3 | Chủ dự án **tắt rồi bật lại** công tắc | vẫn `trusted=0`: **không sửa được** |
| 4 | `tccutil reset Accessibility com.aitranslator.s3probe`, **không `sudo`** | thoát 0, "Successfully reset". Dòng vẫn hiện trong danh sách nhưng công tắc về tắt |
| 5 | Chủ dự án bật công tắc | v2 `trusted=1` |
| 6 | Reset; chạy `check` bản v2; dựng v3; chủ dự án bật công tắc | v3 `trusted=0` dù công tắc bật |
| 7 | Reset; chạy `check` bản v3 (đăng ký); chủ dự án bật công tắc | v3 `trusted=1` |
| 8 | Thêm run loop cho probe (v4, như app thật), chạy sẵn ở 0; chủ dự án bật công tắc | tiến trình **đang chạy thấy 0→1 trong vòng 1 giây**, cả `AXIsProcessTrusted()` lẫn `…WithOptions` |
| 9 | (v1 đến v3) probe không run loop, chạy sẵn trong lúc cấp và thu hồi | không bao giờ thấy thay đổi (45 giây đến 3 phút, cả hai chiều). Chỉ là bài học về cách đo: thiếu run loop; không áp dụng cho app có run loop |
| 10 | Thu hồi bằng `tccutil reset` khi v4 (có run loop) đang chạy | tiến trình đang chạy **không nhận ra** trong 40 giây (tiến trình mới báo 0). Chưa thử thu hồi bằng công tắc của System Settings |

**Giải thích khớp các lượt:** dòng quyền của hệ thống lưu chữ ký (cdhash) của bản đã hỏi trạng thái quyền lần đầu; công tắc chỉ đổi bật/tắt, **không cập nhật chữ ký**. Ad-hoc thì mỗi bản build có cdhash khác, nên dòng cũ không còn khớp dù công tắc bật (lượt 2, 3). Xóa dòng cũ rồi để bản mới đăng ký thì bật công tắc dùng được (lượt 4, 5, 7). Lượt 6 hỏng đúng vì dòng mới do bản v2 đăng ký (lệnh `check` chạy trước khi dựng v3) nên mang chữ ký v2.

**Chưa thử tay:** nút − và + trong System Settings (đã xóa dòng bằng `tccutil reset`, kết quả tương đương việc xóa dòng). Mục S3Probe còn có thể nằm trong danh sách Trợ năng của máy anh (công tắc tắt): xóa bằng nút −.

## Kết luận cho spec §4.2

- S1 và S2 đạt: kế hoạch 04, 05 được làm tiếp (cổng spike qua).
- `PASTE_DELAY` giữ 120 ms.
- Lời hướng dẫn bật lại quyền sau khi cập nhật (**đã chốt theo S3**): "xóa app khỏi danh sách (nút −) rồi thêm lại (nút +)" như câu `settings.compose.permission.missing` đang có ở năm từ điển; **bỏ** cách "tắt rồi bật lại công tắc" vì đo thấy không sửa được. Đã sửa hai trang website (hướng dẫn Gõ dịch, vi và en).
- App đang chạy thấy quyền vừa cấp ngay (run loop chạy), nên **không cần dặn khởi động lại app** sau khi bật; app kiểm `AXIsProcessTrusted()` mỗi lần Enter nên đúng. Không đổi mã.
- `tccutil reset Accessibility <bundle id>` không cần `sudo`: dùng cho hỗ trợ kỹ thuật, không đưa vào hướng dẫn người dùng (cần Terminal).
