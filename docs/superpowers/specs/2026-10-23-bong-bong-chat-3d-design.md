# AI Translator: bong bóng chat 3D, viền nhấp nháy — Design

**Ngày:** 2026-10-23
**Trạng thái:** Chủ dự án duyệt qua hội thoại 2026-10-23 (chọn mẫu B, hiệu ứng phương án 3, giữ "nhấp nháy rõ lại khi có trả lời mới"). Làm thẳng trên `main`.
**Quan hệ với spec khác:** sửa phần bong bóng của `2026-10-22-chat-ho-tro-zalo-design.md` mục 3 (website). Không đổi hành vi, hợp đồng API, chữ hay CSP.

## Yêu cầu

Icon mở chat trên website (hình tròn xanh phẳng 56 px, biểu tượng nét mảnh) bị chủ dự án đánh giá là xấu; muốn icon 3D thật đẹp, viền nhấp nháy để khách nhìn thấy rõ.

## Thiết kế

**Hình dáng** (mẫu B):
- Bong bóng thoại có đuôi ở góc dưới phải, 54×48 px (bản cũ tròn 56 px; bản đầu 64×56 px, chủ dự án thấy to nên thu nhỏ). Khung chat (`chat.css` `.chat-panel`) hạ `bottom` từ 84 px xuống 76 px để vẫn cách bong bóng 12 px.
- Gradient từ `--brand` sang `--accent` (chế độ tối dùng bộ màu tối có sẵn của `site.css`), điểm sáng như kính ở trên (lớp giả), bóng đổ mềm và bóng trong cho khối 3D.
- Bên trong: ba chấm trắng (gợi "đang gõ"), thay biểu tượng `#i-message`. Lớp CSS của ba chấm đặt tên riêng (không dùng `.chat-dots`, đã có trong `chat.css` cho chỉ báo đang gõ).
- Vẫn là `<button class="chat-bubble">` do `site.js` chèn: giữ `aria-label`, `aria-expanded`, `aria-controls`, `.chat-dot` (chấm đỏ) và mọi hành vi hiện có.

**Hiệu ứng viền** (phương án 3, chỉ CSS):
- 15 giây đầu mỗi lần tải trang: viền ngọc sáng lên rồi tắt, chu kỳ 1,6 giây (9 chu kỳ ≈ 14,4 giây).
- Sau đó: chu kỳ 4 giây, sáng nhẹ hơn, chạy mãi.
- Có câu trả lời mới (`.chat-dot` không `hidden`): quay lại chu kỳ 1,6 giây rõ, cho tới khi chấm đỏ tắt.
- Khung chat đang mở (`aria-expanded="true"`): không hiệu ứng.
- `prefers-reduced-motion: reduce`: không chuyển động, giữ một viền sáng tĩnh (khai báo riêng, không dựa vào luật chung của `site.css` vốn chạy animation một lần tới khung cuối).
- Rê chuột: nổi lên nhẹ (`translateY`), sáng hơn một chút. Tiêu điểm bàn phím giữ viền `:focus-visible` hiện có.

**Ràng buộc:**
- Không thêm script mới, không ảnh hay font ngoài; CSP không đổi.
- Không nhắc Zalo hay công nghệ lõi trong `src/assets/` (test chặn có sẵn).
- Khung chat (`chat.css`, `.chat-panel` `bottom: 84px`) và khoảng đệm đáy chân trang (88 px) vẫn không bị bong bóng mới che; chỉnh nếu cỡ mới cần.

## File

- `website/src/assets/site.js`: phần HTML bên trong nút.
- `website/src/assets/site.css`: kiểu bong bóng, đuôi, điểm sáng, ba chấm, hai keyframe, luật cho chấm đỏ, khung mở và giảm chuyển động.
- `website/src/assets/chat.css`: chỉ khi cần chỉnh vị trí khung chat.
- `website/test/chat-widget.test.mjs`: test dựa vào cỡ hay cấu trúc bong bóng.

## Kiểm thử

- `cd website && pnpm test` (bộ test Chrome của khung chat còn xanh; cập nhật test về cỡ bong bóng nếu có), `pnpm build`.
- Test mới: bong bóng có ba chấm và không còn `#i-message`; `getComputedStyle` cho thấy có animation khi khung đóng, không có khi `aria-expanded="true"`; khi chấm đỏ hiện thì dùng keyframe rõ.
- Ảnh chụp nền sáng và nền tối (máy tính và điện thoại 375 px) để chủ dự án xem trước khi deploy.
- Deploy website (`pnpm test && pnpm deploy`) sau khi chủ dự án đồng ý ảnh.
