# Chính sách quyền riêng tư của AI Translator

**Phiên bản 1.2, hiệu lực từ 16/10/2026.**

## 1. Ai chịu trách nhiệm về dữ liệu của bạn

AI Translator ("ứng dụng") do **Đỗ Tiến Phong** (cá nhân) phát triển và vận hành ("chúng tôi"). Liên hệ về quyền riêng tư và dữ liệu cá nhân: **support@aitranslator.io.vn**.

## 2. Tóm tắt

- Âm thanh cuộc họp được xử lý **hoàn toàn trên máy bạn**. Âm thanh **không bao giờ** được gửi đi, và không được ghi xuống đĩa.
- Ứng dụng **không có tài khoản đăng nhập, không có quảng cáo, không có analytics**. Khi gặp lỗi, ứng dụng **tự gửi báo cáo lỗi đã che dữ liệu cá nhân** cho chúng tôi để sửa lỗi; bạn tắt được bất cứ lúc nào (mục 10).
- Máy chủ của chúng tôi chỉ lưu **email** (khi bạn mua gói), thông tin đơn hàng, license, mã nhận diện máy đã băm và báo cáo lỗi (giữ 30 ngày), để cấp key, kiểm tra bản quyền, bảo đảm mỗi máy chỉ dùng thử gói Free một lần và sửa lỗi.
- Dữ liệu cá nhân trên máy chủ được **giữ cho tới khi bạn yêu cầu xóa** (mục 7), trừ báo cáo lỗi tự xóa sau 30 ngày (mục 10).

## 3. Dữ liệu ở lại trên máy bạn

| Dữ liệu | Cách xử lý |
|---|---|
| Âm thanh hệ thống đang thu | Chỉ nằm trong bộ nhớ RAM trong lúc dịch; không ghi xuống đĩa, không gửi qua mạng |
| Bản chép lời và bản dịch | Hiện trên màn hình. **Lịch sử mặc định tắt.** Bật thì lưu trên máy bạn, mã hóa, và xóa toàn bộ được bằng một nút |
| Từ điển thuật ngữ, cài đặt | Lưu trên máy bạn |
| Khóa mã hóa lịch sử, token bản quyền, token dùng thử, bộ đếm hạn mức | Lưu trong kho khóa của hệ điều hành (Keychain của macOS, Credential Manager của Windows) |
| Nhật ký hoạt động (log) | Lưu trên máy bạn, không chứa nội dung chép lời. Chỉ phần log liên quan đến một lỗi rời máy, trong báo cáo lỗi đã che dữ liệu cá nhân (mục 10); bạn cũng có thể gửi log cho hỗ trợ bằng nút trong ứng dụng |
| Model nhận dạng và dịch | Tải về một lần, chạy hoàn toàn trên máy bạn |

Các công cụ phụ của ứng dụng chỉ nghe trên `127.0.0.1` (máy bạn) hoặc không mở cổng mạng nào.

## 4. Khi nào ứng dụng kết nối mạng

Ứng dụng chỉ kết nối mạng để:
1. **Tải model** và kiểm tra bản mới của model (từ `releases.aitranslator.io.vn`).
2. **Kiểm tra bản cập nhật** của ứng dụng (từ `releases.aitranslator.io.vn`).
3. **Làm việc với license server** của chúng tôi (`api.aitranslator.io.vn`): khi đăng ký dùng thử Free (lần đầu mở ứng dụng, ngay sau khi bạn đồng ý điều khoản; gửi mã băm của ID máy), khi mua gói, kích hoạt, gỡ kích hoạt, khôi phục key, kiểm tra bản quyền định kỳ, gửi báo cáo lỗi (mục 10) và (hiếm khi) hỏi giờ của máy chủ khi đồng hồ máy bị đặt lệch. Việc hỏi giờ không gửi dữ liệu gì của bạn.
4. **Trang thanh toán** do PayOS (chuyển khoản VietQR) hoặc Creem (thẻ quốc tế) cung cấp, mở bằng trình duyệt của bạn khi bạn mua gói.
5. **Website** `aitranslator.io.vn` của chúng tôi, mở bằng trình duyệt của bạn khi bạn bấm liên kết trong ứng dụng.

Không có kết nối nào khác, và không có kết nối nào mang âm thanh hay nội dung chép lời.

## 5. Dữ liệu chúng tôi lưu trên máy chủ

Máy chủ lưu các dữ liệu dưới đây. Dòng "Dùng thử Free" áp cho mọi máy đã mở ứng dụng có mạng; các dòng còn lại chỉ khi bạn mua gói hay kích hoạt key, trừ dòng "Báo cáo lỗi", áp cho mọi máy mà ứng dụng gửi báo cáo:

| Dữ liệu | Mục đích |
|---|---|
| Email bạn nhập khi mua | Gửi key, khôi phục key khi bạn mất, và, với đơn thẻ, điền sẵn trang thanh toán của Creem |
| Thời điểm bạn đồng ý xử lý email | Làm bằng chứng đã có sự đồng ý |
| Đơn hàng: mã đơn, gói, số tiền và loại tiền, thời điểm thanh toán, trạng thái, mã phiên thanh toán của cổng (PayOS hay Creem) | Cấp và gia hạn license; đối soát; nghĩa vụ kế toán |
| License: key, gói, ngày hết hạn, chu kỳ hạn mức | Cấp quyền dùng gói trả phí |
| Dùng thử Free: **mã băm** của ID máy, lúc bắt đầu và lúc hết dùng thử, lần ứng dụng gọi gần nhất | Mỗi máy chỉ dùng thử 10 ngày một lần, kể cả khi cài lại ứng dụng |
| Máy đã kích hoạt: **mã băm** của ID máy, tên máy (`device_label`) và lần kiểm tra bản quyền gần nhất | Mỗi key chỉ dùng trên một máy, chống lạm dụng, giúp bạn nhận ra máy khi cần gỡ |
| Nhật ký thay đổi license (ai làm gì, lúc nào) | Hỗ trợ, chống gian lận, tra soát sự cố |
| Bộ đếm giới hạn tần suất (chỉ lưu giá trị băm HMAC của IP, key, email; tự hết hạn sau khoảng 3 giờ) | Chặn dò key và spam |
| Báo cáo lỗi (mục 10): loại và mã lỗi, thông tin máy, **mã băm** của ID máy và phần log liên quan; không có email, tên máy hay nội dung cuộc họp | Tìm và sửa lỗi; tự xóa sau 30 ngày |

Chúng tôi **không** nhận số tài khoản ngân hàng, số thẻ hay thông tin tài chính của bạn (việc chuyển khoản do ngân hàng của bạn và PayOS xử lý; việc trả bằng thẻ do Creem xử lý ngay trên trang thanh toán của Creem). Với VietQR, chúng tôi **không** gửi email của bạn sang PayOS. Với thẻ quốc tế, chúng tôi gửi email bạn nhập trong ứng dụng cho Creem để điền sẵn trang thanh toán và để Creem gửi biên lai cho bạn. Máy chủ đoán nước của bạn từ địa chỉ IP (qua Cloudflare) chỉ để chọn sẵn cách trả ở màn hình Nâng cấp; nước đoán được không được lưu. Dùng gói Free mà không mua và không kích hoạt key thì chúng tôi chỉ lưu dòng "Dùng thử Free" ở trên và, nếu ứng dụng gửi báo cáo lỗi, các báo cáo đó: không có email, tên máy hay thông tin nào khác của bạn.

## 6. Bên thứ ba xử lý dữ liệu, và việc chuyển dữ liệu ra nước ngoài

| Bên | Vai trò | Dữ liệu |
|---|---|---|
| **PayOS** (Việt Nam) | Xử lý thanh toán chuyển khoản VietQR | Mã đơn, số tiền, mô tả đơn. Không có email của bạn |
| **Creem** (Armitage Labs OÜ, Estonia) | Bên bán lại (merchant of record) của đơn thẻ: xử lý thanh toán, thuế và biên lai | Chúng tôi gửi mã đơn, gói, số tiền, loại tiền và email bạn nhập, ngay khi bạn bấm thanh toán bằng thẻ (kể cả khi bạn không trả), để điền sẵn trang thanh toán và để Creem gửi biên lai. Ở trang thanh toán, Creem tự thu số thẻ, tên, địa chỉ thanh toán và nước (để tính thuế), địa chỉ IP (chống gian lận); chúng tôi không nhận số thẻ. Creem xử lý các dữ liệu đó theo chính sách riêng (https://www.creem.io/privacy). Thông báo thanh toán Creem gửi máy chủ của chúng tôi có tên và nước người mua; chúng tôi không lưu hai thông tin này |
| **Cloudflare** | Máy chủ chạy license server, cơ sở dữ liệu, lưu trữ và phân phối bản cập nhật, model | Dữ liệu ở mục 5, kể cả báo cáo lỗi (mục 10); nhật ký kỹ thuật tự hết hạn |
| **Resend** | Gửi email chứa key | Email bạn, nội dung thư (có key); theo chính sách lưu của Resend |

Cloudflare và Resend đặt máy chủ ngoài Việt Nam, còn Creem là pháp nhân Estonia, nên dữ liệu ở mục 5 và mục 10 có thể được xử lý ở nước ngoài. Bằng việc mua gói và đồng ý xử lý email, bạn đồng ý với việc này. Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho mục đích quảng cáo.

## 7. Thời gian lưu và quyền của bạn

**Dữ liệu cá nhân trên máy chủ được giữ cho tới khi bạn yêu cầu xóa.** Chúng tôi không tự xóa.

Bạn có quyền: biết dữ liệu nào đang được lưu, yêu cầu **xóa** hoặc **ẩn danh**, rút lại sự đồng ý, và khiếu nại theo quy định của **Luật Bảo vệ dữ liệu cá nhân** của Việt Nam. Gửi yêu cầu tới **support@aitranslator.io.vn** từ email đã dùng khi mua (để chúng tôi xác nhận là bạn). Chúng tôi xử lý trong thời hạn pháp luật quy định.

Khi bạn yêu cầu xóa, chúng tôi sẽ:
- **bỏ** email và tên máy của bạn;
- **xóa** các báo cáo lỗi của những máy từng kích hoạt key của email đó (mục 10);
- **giữ lại** mã băm của ID máy (dữ liệu bí danh, chỉ để chống lạm dụng: mỗi key một máy, khóa tạm khi đổi máy quá nhiều, dùng lại đúng kích hoạt khi bạn kích hoạt lại cùng máy, mỗi máy chỉ dùng thử Free một lần);
- **giữ lại** thời điểm bạn đồng ý xử lý email (bằng chứng đã có sự đồng ý trước đó);
- **giữ lại** dòng đơn hàng ở mức kế toán cần: mã đơn, ngày, số tiền (và loại tiền), mã phiên thanh toán của cổng.

Sau khi xóa, license vẫn dùng được nhưng **không khôi phục qua email** được nữa. Dữ liệu trên máy bạn (lịch sử, cài đặt) do bạn tự xóa trong ứng dụng ("Xóa model và dữ liệu") hoặc khi gỡ cài đặt.

Dữ liệu kỹ thuật tự hết hạn (bộ đếm giới hạn tần suất; nhật ký của Cloudflare) và nhật ký thư của Resend nằm ngoài yêu cầu xóa của chúng tôi; thời hạn lưu theo chính sách của các bên đó. Dữ liệu bạn nhập ở trang Creem và hồ sơ giao dịch do Creem giữ (bên bán lại phải giữ chứng từ thuế) nằm ngoài yêu cầu xóa gửi chúng tôi; muốn xóa ở Creem, hãy liên hệ Creem. Báo cáo lỗi của một máy chưa từng kích hoạt key không gắn với email nào nên không tìm theo email được; những báo cáo đó tự xóa sau 30 ngày.

## 8. Trẻ em

Dịch vụ dành cho người từ **16 tuổi** trở lên. Chúng tôi không chủ ý thu thập dữ liệu của trẻ dưới 16 tuổi; nếu bạn là cha mẹ hay người giám hộ và cho rằng con bạn đã cung cấp email cho chúng tôi, hãy liên hệ để chúng tôi xóa.

## 9. Bảo mật

Khóa ký token và khóa thanh toán chỉ nằm trên máy chủ (dưới dạng secret), không có trong ứng dụng. Kết nối tới máy chủ dùng HTTPS. Truy cập quản trị được bảo vệ bằng đăng nhập riêng. Không hệ thống nào an toàn tuyệt đối; nếu có sự cố ảnh hưởng đến dữ liệu cá nhân, chúng tôi sẽ thông báo theo quy định pháp luật.

## 10. Báo cáo lỗi

Khi ứng dụng gặp lỗi, nó **tự gửi một báo cáo lỗi** cho chúng tôi qua license server (`api.aitranslator.io.vn`) để chúng tôi biết và sửa lỗi. Tính năng này **bật mặc định**: ở bước Điều khoản khi mở ứng dụng lần đầu có một ô đã tích sẵn mà bạn bỏ tích được, và người dùng đã cài từ trước cũng được bật sau khi cập nhật lên bản có tính năng này. Bạn tắt hay bật lại bất cứ lúc nào ở **Cài đặt › Quyền riêng tư › Gửi báo cáo lỗi tự động**; tắt thì các báo cáo đang chờ gửi bị xóa. Bạn cũng tự gửi được một báo cáo bất cứ lúc nào bằng nút **Gửi log cho hỗ trợ** ở màn hình Giới thiệu: nút này gửi ngay, kể cả khi bạn đã tắt gửi tự động, và cho bạn một **mã báo cáo** để đưa cho bộ phận hỗ trợ.

| Nội dung | Chi tiết |
|---|---|
| Khi nào gửi tự động | Khi lần chạy trước của ứng dụng bị dừng đột ngột; khi một phiên dịch dừng vì lỗi của ứng dụng (không tính lỗi do bạn hay môi trường như thiếu quyền ghi âm, hết hạn mức, hết dùng thử, mất mạng, hết dung lượng); hoặc khi một công cụ phụ của ứng dụng chết rồi được tự khởi động lại. Báo cáo chỉ được gửi khi ứng dụng không đang dịch, và mỗi máy gửi tối đa 5 báo cáo mỗi ngày |
| Báo cáo gồm | Mã báo cáo, loại và mã lỗi, giờ xảy ra; phiên bản ứng dụng, hệ điều hành và phiên bản, kiến trúc, tên chip hoặc CPU, RAM, loại GPU đang dùng, gói model, tên gói bản quyền (không có key), ngôn ngữ giao diện; **mã băm của ID máy**; và phần log liên quan đến lỗi (tối đa 64 KB) |
| Báo cáo không gồm | Âm thanh, bản chép lời, bản dịch, license key, token, email, tên máy, tên tài khoản hệ điều hành, địa chỉ IP |
| Che dữ liệu | Trước khi gửi, ứng dụng che đường dẫn thư mục cá nhân, key, token và email trong log; còn sót mẫu nhạy cảm thì bỏ cả báo cáo. Máy chủ kiểm lại và từ chối báo cáo nếu còn |
| Gắn với bạn thế nào | Mã băm của ID máy trong báo cáo cũng là mã chúng tôi lưu cho bản quyền và dùng thử Free (mục 5), nên chúng tôi **có thể nối báo cáo với license và email** của máy đó khi tra cứu hỗ trợ |
| Giữ bao lâu | Tối đa **30 ngày** rồi tự xóa; máy chủ giữ tối đa 3.000 báo cáo, báo cáo cũ nhất bị xóa trước |
| Ai xem được | Chỉ người vận hành ứng dụng, qua trang quản trị có đăng nhập riêng. Dữ liệu nằm trên Cloudflare (mục 6) |

- Chúng tôi dùng báo cáo chỉ để tìm và sửa lỗi; không dùng cho quảng cáo, không bán và không chia sẻ cho bên nào ngoài các bên xử lý ở mục 6.
- Muốn xóa báo cáo của máy bạn trước hạn 30 ngày, hãy yêu cầu xóa dữ liệu theo mục 7: khi xử lý yêu cầu xóa theo email, chúng tôi xóa luôn báo cáo lỗi của các máy từng kích hoạt key của email đó.
- Nếu bạn không muốn gửi gì, hãy bỏ tích ở bước Điều khoản hoặc tắt công tắc ở Cài đặt; ứng dụng vẫn dùng đầy đủ tính năng khi tắt.

## 11. Thay đổi chính sách

Khi chính sách thay đổi, chúng tôi cập nhật văn bản này và ngày hiệu lực, và thông báo trong ứng dụng hoặc trên website khi thay đổi quan trọng. Tiếp tục dùng ứng dụng sau ngày hiệu lực nghĩa là bạn chấp nhận bản mới.

## 12. Liên hệ

**Đỗ Tiến Phong**, support@aitranslator.io.vn.
