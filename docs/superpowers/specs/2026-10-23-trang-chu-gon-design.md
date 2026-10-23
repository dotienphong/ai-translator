# Trang chủ gọn: dịch cuộc họp, Gõ dịch, lịch sử, hướng dẫn sử dụng

Ngày: 2026-10-23. Nhánh `trang-chu-gon`. Phạm vi: `website/src/content/{vi,en,ja,zh,ko}/home.mjs`, CSS bỏ khối không còn dùng.

## Vì sao

Trang chủ cũ có 14 phần, cao khoảng 14.900 px ở màn hình 1280 px. Nhiều ý lặp lại: số đo độ trễ nêu 4 lần, "không lên cloud" nêu 5 lần, hai khối thẻ tính năng (3 và 6 thẻ) cùng nói về quyền riêng tư và offline. Gõ dịch chỉ là nửa sau của một khối, Lịch sử là một thẻ nhỏ, hướng dẫn sử dụng chỉ là ba bước chữ. Chủ dự án yêu cầu trang gọn, dễ đọc, xoay quanh bốn việc: dịch cuộc họp, Gõ dịch, xem lại lịch sử và hướng dẫn sử dụng.

## Khung mới (giống nhau ở năm ngôn ngữ)

| # | Phần | id (vi / en, ja, zh, ko) | Nội dung |
|---|---|---|---|
| 1 | Hero | | Lời dẫn nói cả phụ đề lẫn Gõ dịch; nút Tải xuống và "Xem cách dùng"; ba dấu tích |
| 2 | Video demo | `video-demo` | Giữ nguyên |
| 3 | Dịch cuộc họp | `dich-cuoc-hop` / `meeting-translation` | Ảnh thanh phụ đề; năm ngôn ngữ, độ trễ (kèm liên kết điều kiện đo), thanh phụ đề, từ điển thuật ngữ |
| 4 | Gõ dịch | `go-dich` / `type-and-translate` | Giữ chữ cũ (test cần "Trả lời bằng tiếng của người bên kia", "không trừ thời lượng dịch") |
| 5 | Lịch sử | `lich-su` / `history` | Ảnh `app-history`; mọi gói xem và sao chép phiên gần nhất, Pro lưu và xuất TXT/SRT/Markdown, mặc định tắt, mã hóa trên máy |
| 6 | Hướng dẫn sử dụng | `cach-dung` / `how-to-use` | Bốn bước (cài bằng một dòng lệnh, thiết lập lần đầu, bấm Bắt đầu, Gõ dịch và xem lại) cạnh ảnh màn hình chính; một dòng chú thích về ký mã macOS/Windows; nút bắt đầu nhanh và mục lục hướng dẫn |
| 7 | Dữ liệu ở lại trên máy | `rieng-tu-tren-may` / `private-on-device` | Sơ đồ dữ liệu và hai thẻ; câu liệt kê dữ liệu máy chủ lưu giữ nguyên văn (test chat hỗ trợ) |
| 8 | Bảng giá | `gia` / `pricing` | Giữ nguyên (test thẻ gói, Creem, USD) |
| 9 | Hỏi đáp | | Sáu câu: internet, Zoom không bot, dùng với các app họp, âm thanh có bị gửi đi, miễn phí, trả từ ngoài Việt Nam |
| 10 | Lời mời cuối trang | | Giữ nguyên |

## Đã bỏ và ý được chuyển đi đâu

- Bảng "AI Translator là gì" (có dòng phiên bản): lời dẫn hero nói AI Translator là gì; phiên bản vẫn ở Tải xuống và Về chúng tôi.
- Dải tên app (Zoom, Teams…) và câu nhãn hiệu: tên app nằm trong lời dẫn hero, câu nhãn hiệu đã có ở chân trang chung.
- Khối "Điều khiển gọn": ảnh màn hình chính chuyển sang phần hướng dẫn sử dụng.
- Sáu thẻ "Vì sao AI Translator" và ba số đo: riêng tư và offline nằm ở phần dữ liệu, ngôn ngữ, độ trễ và từ điển ở phần dịch cuộc họp, lịch sử có phần riêng. Bỏ số "5 giờ 23 phút".
- Hai thẻ giải pháp: vẫn có ở menu Giải pháp.
- Khung cảnh báo "Những điều chúng tôi nói thẳng": thành một dòng chú thích dưới bốn bước hướng dẫn (ký ad-hoc, chưa notarize, Windows chưa ký mã, Smart App Control), kèm liên kết hai bài cài đặt. Độ trễ trên máy khác: bullet độ trễ có liên kết điều kiện đo.
- Bốn câu hỏi đáp (app offline nào, ngôn ngữ, tài khoản, tải ở đâu): đều còn ở trang Hỏi đáp.
- CSS `.stats`, `.stat`, `.app-strip` không còn trang nào dùng nên xóa.

## Kiểm

- `pnpm test` (website): 210 đạt, 2 bỏ qua, như trước khi đổi.
- Ảnh chụp 1280 px năm ngôn ngữ và 375 px giao diện tối: không tràn ngang. Trang vi còn khoảng 11.100 px (trước khoảng 14.900 px).
