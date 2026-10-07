# Chính sách quyền riêng tư của AI Translator

**Phiên bản 1.1, hiệu lực từ 07/10/2026.**

## 1. Ai chịu trách nhiệm về dữ liệu của bạn

AI Translator ("ứng dụng") do **Đỗ Tiến Phong** (cá nhân) phát triển và vận hành ("chúng tôi"). Liên hệ về quyền riêng tư và dữ liệu cá nhân: **support@aitranslator.io.vn**.

## 2. Tóm tắt

- Âm thanh cuộc họp được xử lý **hoàn toàn trên máy bạn**. Âm thanh **không bao giờ** được gửi đi, và không được ghi xuống đĩa.
- Ứng dụng **không có tài khoản đăng nhập, không có quảng cáo, không có analytics, không gửi báo cáo lỗi tự động**.
- Máy chủ của chúng tôi chỉ lưu **email** (khi bạn mua gói), thông tin đơn hàng, license và mã nhận diện máy đã băm, để cấp key, kiểm tra bản quyền và bảo đảm mỗi máy chỉ dùng thử gói Free một lần.
- Dữ liệu cá nhân trên máy chủ được **giữ cho tới khi bạn yêu cầu xóa** (mục 7).

## 3. Dữ liệu ở lại trên máy bạn (không gửi cho chúng tôi)

| Dữ liệu | Cách xử lý |
|---|---|
| Âm thanh hệ thống đang thu | Chỉ nằm trong bộ nhớ RAM trong lúc dịch; không ghi xuống đĩa, không gửi qua mạng |
| Bản chép lời và bản dịch | Hiện trên màn hình. **Lịch sử mặc định tắt.** Bật thì lưu trên máy bạn, mã hóa, và xóa toàn bộ được bằng một nút |
| Từ điển thuật ngữ, cài đặt | Lưu trên máy bạn |
| Khóa mã hóa lịch sử, token bản quyền, token dùng thử, bộ đếm hạn mức | Lưu trong kho khóa của hệ điều hành (Keychain của macOS, Credential Manager của Windows) |
| Nhật ký hoạt động (log) | Lưu trên máy bạn, không chứa nội dung chép lời. Khi cần hỗ trợ, bạn tự gửi cho chúng tôi nếu muốn |
| Model nhận dạng và dịch | Tải về một lần, chạy hoàn toàn trên máy bạn |

Các công cụ phụ của ứng dụng chỉ nghe trên `127.0.0.1` (máy bạn) hoặc không mở cổng mạng nào.

## 4. Khi nào ứng dụng kết nối mạng

Ứng dụng chỉ kết nối mạng để:
1. **Tải model** và kiểm tra bản mới của model (từ `releases.aitranslator.io.vn`).
2. **Kiểm tra bản cập nhật** của ứng dụng (từ `releases.aitranslator.io.vn`).
3. **Làm việc với license server** của chúng tôi (`api.aitranslator.io.vn`): khi đăng ký dùng thử Free (lần đầu mở ứng dụng, ngay sau khi bạn đồng ý điều khoản; gửi mã băm của ID máy), khi mua gói, kích hoạt, gỡ kích hoạt, khôi phục key, kiểm tra bản quyền định kỳ, và (hiếm khi) hỏi giờ của máy chủ khi đồng hồ máy bị đặt lệch. Việc hỏi giờ không gửi dữ liệu gì của bạn.
4. **Trang thanh toán** do PayOS cung cấp, mở bằng trình duyệt của bạn khi bạn mua gói.

Không có kết nối nào khác, và không có kết nối nào mang âm thanh hay nội dung chép lời.

## 5. Dữ liệu chúng tôi lưu trên máy chủ

Máy chủ lưu các dữ liệu dưới đây. Dòng "Dùng thử Free" áp cho mọi máy đã mở ứng dụng có mạng; các dòng còn lại chỉ khi bạn mua gói hay kích hoạt key:

| Dữ liệu | Mục đích |
|---|---|
| Email bạn nhập khi mua | Gửi key, khôi phục key khi bạn mất |
| Thời điểm bạn đồng ý xử lý email | Làm bằng chứng đã có sự đồng ý |
| Đơn hàng: mã đơn, gói, số tiền, thời điểm thanh toán, trạng thái | Cấp và gia hạn license; đối soát; nghĩa vụ kế toán |
| License: key, gói, ngày hết hạn, chu kỳ hạn mức | Cấp quyền dùng gói trả phí |
| Dùng thử Free: **mã băm** của ID máy, lúc bắt đầu và lúc hết dùng thử, lần ứng dụng gọi gần nhất | Mỗi máy chỉ dùng thử 10 ngày một lần, kể cả khi cài lại ứng dụng |
| Máy đã kích hoạt: **mã băm** của ID máy, tên máy (`device_label`) và lần kiểm tra bản quyền gần nhất | Mỗi key chỉ dùng trên một máy, chống lạm dụng, giúp bạn nhận ra máy khi cần gỡ |
| Nhật ký thay đổi license (ai làm gì, lúc nào) | Hỗ trợ, chống gian lận, tra soát sự cố |
| Bộ đếm giới hạn tần suất (chỉ lưu giá trị băm HMAC của IP, key, email; tự hết hạn sau khoảng 3 giờ) | Chặn dò key và spam |

Chúng tôi **không** nhận số tài khoản ngân hàng, thẻ hay thông tin tài chính của bạn (việc chuyển tiền do ngân hàng của bạn và PayOS xử lý). Chúng tôi **không** gửi email của bạn sang PayOS. Dùng gói Free mà không mua và không kích hoạt key thì chúng tôi chỉ lưu dòng "Dùng thử Free" ở trên: không có email, tên máy hay thông tin nào khác của bạn.

## 6. Bên thứ ba xử lý dữ liệu, và việc chuyển dữ liệu ra nước ngoài

| Bên | Vai trò | Dữ liệu |
|---|---|---|
| **PayOS** (Việt Nam) | Xử lý thanh toán chuyển khoản VietQR | Mã đơn, số tiền, mô tả đơn. Không có email của bạn |
| **Cloudflare** | Máy chủ chạy license server, cơ sở dữ liệu, lưu trữ và phân phối bản cập nhật, model | Dữ liệu ở mục 5; nhật ký kỹ thuật tự hết hạn |
| **Resend** | Gửi email chứa key | Email bạn, nội dung thư (có key); theo chính sách lưu của Resend |

Cloudflare và Resend đặt máy chủ ngoài Việt Nam, nên dữ liệu ở mục 5 có thể được xử lý ở nước ngoài. Bằng việc mua gói và đồng ý xử lý email, bạn đồng ý với việc này. Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho mục đích quảng cáo.

## 7. Thời gian lưu và quyền của bạn

**Dữ liệu cá nhân trên máy chủ được giữ cho tới khi bạn yêu cầu xóa.** Chúng tôi không tự xóa.

Bạn có quyền: biết dữ liệu nào đang được lưu, yêu cầu **xóa** hoặc **ẩn danh**, rút lại sự đồng ý, và khiếu nại theo quy định của **Luật Bảo vệ dữ liệu cá nhân** của Việt Nam. Gửi yêu cầu tới **support@aitranslator.io.vn** từ email đã dùng khi mua (để chúng tôi xác nhận là bạn). Chúng tôi xử lý trong thời hạn pháp luật quy định.

Khi bạn yêu cầu xóa, chúng tôi sẽ:
- **bỏ** email và tên máy của bạn;
- **giữ lại** mã băm của ID máy (dữ liệu bí danh, chỉ để chống lạm dụng: mỗi key một máy, khóa tạm khi đổi máy quá nhiều, dùng lại đúng kích hoạt khi bạn kích hoạt lại cùng máy, mỗi máy chỉ dùng thử Free một lần);
- **giữ lại** thời điểm bạn đồng ý xử lý email (bằng chứng đã có sự đồng ý trước đó);
- **giữ lại** dòng đơn hàng ở mức kế toán cần: mã đơn, ngày, số tiền.

Sau khi xóa, license vẫn dùng được nhưng **không khôi phục qua email** được nữa. Dữ liệu trên máy bạn (lịch sử, cài đặt) do bạn tự xóa trong ứng dụng ("Xóa model và dữ liệu") hoặc khi gỡ cài đặt.

Dữ liệu kỹ thuật tự hết hạn (bộ đếm giới hạn tần suất; nhật ký của Cloudflare) và nhật ký thư của Resend nằm ngoài yêu cầu xóa của chúng tôi; thời hạn lưu theo chính sách của các bên đó.

## 8. Trẻ em

Dịch vụ dành cho người từ **16 tuổi** trở lên. Chúng tôi không chủ ý thu thập dữ liệu của trẻ dưới 16 tuổi; nếu bạn là cha mẹ hay người giám hộ và cho rằng con bạn đã cung cấp email cho chúng tôi, hãy liên hệ để chúng tôi xóa.

## 9. Bảo mật

Khóa ký token và khóa thanh toán chỉ nằm trên máy chủ (dưới dạng secret), không có trong ứng dụng. Kết nối tới máy chủ dùng HTTPS. Truy cập quản trị được bảo vệ bằng đăng nhập riêng. Không hệ thống nào an toàn tuyệt đối; nếu có sự cố ảnh hưởng đến dữ liệu cá nhân, chúng tôi sẽ thông báo theo quy định pháp luật.

## 10. Thay đổi chính sách

Khi chính sách thay đổi, chúng tôi cập nhật văn bản này và ngày hiệu lực, và thông báo trong ứng dụng hoặc trên website khi thay đổi quan trọng. Tiếp tục dùng ứng dụng sau ngày hiệu lực nghĩa là bạn chấp nhận bản mới.

## 11. Liên hệ

**Đỗ Tiến Phong**, support@aitranslator.io.vn.
