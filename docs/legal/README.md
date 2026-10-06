# Văn bản pháp lý của AI Translator

**Phiên bản 1.0, hiệu lực từ 2026-10-06**, dùng để phát hành (chủ dự án duyệt và yêu cầu bản chính thức ngày 2026-10-06).

> **Chưa được luật sư xem.** Văn bản bám sát hành vi thật của sản phẩm nhưng **không phải tư vấn pháp lý**, và việc phát hành khi chưa có luật sư xem là rủi ro chủ dự án đã chấp nhận. Khuyến nghị: nhờ luật sư rà (các điểm ở dưới) trước khi bán công khai rộng rãi, rồi cập nhật văn bản và ngày hiệu lực.

| File | Nội dung |
|---|---|
| `eula.vi.md`, `eula.en.md` | Thỏa thuận cấp phép người dùng cuối (EULA) |
| `privacy.vi.md`, `privacy.en.md` | Chính sách quyền riêng tư |

Bản tiếng Việt là bản gốc; bản tiếng Anh dịch tương đương và ghi rõ bản tiếng Việt ưu tiên khi khác nhau. App đóng gói bốn file này và hiển thị theo ngôn ngữ giao diện (spec `2026-10-06-legal-in-app-design.md`): **sửa file ở đây là sửa nội dung trong app** ở lần build kế tiếp.

## Thông tin đã chốt và đã dùng trong văn bản
- Bên cung cấp: **Đỗ Tiến Phong** (cá nhân), email **support@aitranslator.io.vn**, thương hiệu hiển thị "AI Translator". Không công bố địa chỉ liên hệ.
- Dữ liệu cá nhân trên máy chủ giữ không thời hạn, chỉ xóa khi khách yêu cầu (chốt 2026-10-01); sau khi xóa vẫn giữ mã băm ID máy, thời điểm đồng ý, và dòng đơn hàng mức kế toán (spec §10.1).
- Bốn gói, giá và hạn mức; đơn 30 ngày trả trước, không tự gia hạn; đổi gói không hoàn tiền; 2 máy mỗi key; khóa tạm khi đổi máy quá nhiều; ngoại tuyến 14 ngày.
- Bên xử lý dữ liệu: PayOS (Việt Nam), Cloudflare, Resend (ngoài Việt Nam).
- **Mặc định đã chọn** (đổi được bằng cách sửa file): hoàn tiền "không hoàn, trừ lỗi do chúng tôi hoặc pháp luật; yêu cầu trong **7 ngày**"; độ tuổi **16 trở lên**; trần trách nhiệm bằng **số tiền đã trả trong 12 tháng**; ngày hiệu lực 2026-10-06.

## Điểm nên hỏi luật sư hay kế toán (từ spec §10.1 và §15)
- **Loại hình kinh doanh.** Bán dịch vụ có thu tiền bằng tên cá nhân thường cần xem xét đăng ký hộ kinh doanh hoặc doanh nghiệp, kèm nghĩa vụ thuế và hóa đơn (chưa làm hóa đơn điện tử trong MVP). Loại hình quyết định ai là "bên cung cấp" ghi trong văn bản.
- **Giữ dữ liệu không thời hạn** và **giữ mã băm ID máy sau khi khách yêu cầu xóa** (để chống lạm dụng): có phù hợp Luật Bảo vệ dữ liệu cá nhân 2025 không.
- **Chuyển dữ liệu ra nước ngoài** (Cloudflare, Resend): có phải lập hồ sơ đánh giá tác động và gửi cơ quan chuyên trách không; hộ kinh doanh và doanh nghiệp siêu nhỏ thường được miễn, nên liên quan loại hình ở trên.
- **Điều khoản miễn trừ và giới hạn trách nhiệm** có thể bị coi là vô hiệu nếu bất lợi cho người tiêu dùng theo pháp luật bảo vệ người tiêu dùng của Việt Nam.
- **Ghi âm và chép lời cuộc họp**: câu chuyển trách nhiệm sang người dùng (EULA mục 6) có đủ không.
- **Hạn chế dịch ngược** "trừ khi pháp luật cho phép" (EULA mục 5) và **cấm đổi thương hiệu** (spec §10.2).
- **Thời hạn lưu log thư của Resend**: spec yêu cầu ghi vào chính sách; **chưa kiểm**. Hiện chính sách ghi "theo chính sách lưu của Resend".

## Đã đối chiếu với sản phẩm thật
Âm thanh chỉ trong RAM và không gửi đi (kiểm A7: HAR và `nettop` không có luồng ngoài lúc dịch, log không chứa chữ chép lời); danh sách kết nối mạng của app (A7: chỉ `api.` và `releases.aitranslator.io.vn`); server chỉ lưu email, đơn, license, mã băm máy, `device_label`, thời điểm kiểm tra (spec §10.1); bảng giá và hạn mức (spec §2); luật quy đổi khi đổi gói (§6.8); giới hạn 2 máy và khóa tạm (§10.2); token ngoại tuyến 14 ngày (`refresh_before - issued_at = 1 209 600 s` ở bản triển khai); giấy phép Hy-MT2 Apache 2.0, Whisper và Silero MIT (§10.1).

## Cài vào sản phẩm
- **Đã làm (kế hoạch `2026-10-06-dieu-khoan-trong-app.md`):** app đóng gói bốn file; bước "Điều khoản" ở onboarding (ô tick bắt buộc); thẻ "Điều khoản và quyền riêng tư" ở màn hình Giới thiệu; mục gập "Chính sách quyền riêng tư" dưới ô đồng ý email ở màn hình mua.
- **Chưa làm:** trang giấy phép của bộ cài NSIS (Windows, làm ở đợt Windows); DMG của macOS không có trang giấy phép (đồng ý ở onboarding); website `aitranslator.io.vn` (`/terms`, `/privacy`, cần spec riêng); hỏi lại khi điều khoản đổi phiên bản; lưu bằng chứng đồng ý EULA ở máy.
- Khi hành vi sản phẩm đổi (thêm analytics, thêm bên xử lý dữ liệu, đổi giá hay gói, đổi thời gian lưu), **cập nhật văn bản này cùng lúc** và ghi ngày hiệu lực mới.
