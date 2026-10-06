# Văn bản pháp lý của AI Translator (bản nháp)

Soạn ngày 2026-10-06. **Chưa được luật sư xem. Không phải tư vấn pháp lý.** Đây là bản nháp bám sát hành vi thật của sản phẩm để chủ dự án và luật sư rà, thay vì viết từ đầu.

| File | Nội dung |
|---|---|
| `eula.vi.md`, `eula.en.md` | Thỏa thuận cấp phép người dùng cuối (EULA) |
| `privacy.vi.md`, `privacy.en.md` | Chính sách quyền riêng tư |

Bản tiếng Việt là bản gốc, bản tiếng Anh dịch tương đương (khi khác nhau, ghi rõ bản tiếng Việt ưu tiên). Mỗi văn bản có dòng "BẢN NHÁP" ở đầu: **xóa dòng đó và điền ngày hiệu lực** khi phát hành.

## Thông tin đã chốt và đã dùng trong văn bản
- Bên cung cấp: **Đỗ Tiến Phong** (cá nhân), email **support@aitranslator.io.vn**, thương hiệu hiển thị "AI Translator".
- Dữ liệu cá nhân trên máy chủ giữ không thời hạn, chỉ xóa khi khách yêu cầu (chốt 2026-10-01); sau khi xóa vẫn giữ mã băm ID máy, thời điểm đồng ý, và dòng đơn hàng mức kế toán (spec §10.1).
- Bốn gói, giá và hạn mức; đơn 30 ngày trả trước, không tự gia hạn; đổi gói không hoàn tiền; 2 máy mỗi key; khóa tạm khi đổi máy quá nhiều; ngoại tuyến 14 ngày.
- Bên xử lý dữ liệu: PayOS (Việt Nam), Cloudflare, Resend (ngoài Việt Nam).

## Điểm cần chủ dự án quyết (đã đặt mặc định trong bản nháp)
1. **Chính sách hoàn tiền** (EULA mục 3): bản nháp ghi "không hoàn tiền, trừ lỗi do chúng tôi hoặc pháp luật yêu cầu; yêu cầu trong **7 ngày**". Đổi số ngày hoặc cách làm nếu muốn.
2. **Địa chỉ liên hệ**: có công bố không (hai file ở mục "Liên hệ", chỗ `[…]`). Nếu không, xóa dòng đó.
3. **Độ tuổi 16** (chính sách mục 8): bản nháp đặt 16 tuổi trở lên vì dữ liệu của trẻ em cần cha mẹ đồng ý; nhờ luật sư xác nhận ngưỡng.
4. **Trần trách nhiệm** (EULA mục 12): bản nháp đặt bằng số tiền khách đã trả trong 12 tháng.
5. **Ngày hiệu lực**: ngày phát hành bản beta đầu tiên.

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

## Việc cài vào sản phẩm (chưa làm)
- **Bộ cài**: trang giấy phép của NSIS (Windows) và DMG (macOS) hiện EULA (vi và en).
- **Màn hình Giới thiệu**: liên kết tới EULA, chính sách, danh sách giấy phép bên thứ ba.
- **Màn hình mua**: ô đồng ý xử lý email kèm liên kết chính sách quyền riêng tư.
- **Nút "Xóa model và dữ liệu"**: liên kết trang hỗ trợ.
- **Website**: đăng bản chính thức tại `aitranslator.io.vn` (ví dụ `/terms` và `/privacy`), thêm đường dẫn vào `EXTERNAL_HOSTS` đã có.
- Khi hành vi sản phẩm đổi (thêm analytics, thêm bên xử lý dữ liệu, đổi giá hay gói, đổi thời gian lưu), **cập nhật văn bản này cùng lúc** và ghi ngày hiệu lực mới.
