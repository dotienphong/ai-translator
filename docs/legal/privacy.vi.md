# Chính sách quyền riêng tư của AI Translator

**Phiên bản 1.8, hiệu lực từ 25/10/2026.**

## 1. Ai chịu trách nhiệm về dữ liệu của bạn

AI Translator ("ứng dụng") do **Đỗ Tiến Phong** (cá nhân) phát triển và vận hành ("chúng tôi"). Liên hệ về quyền riêng tư và dữ liệu cá nhân: **support@aitranslator.vn**.

## 2. Tóm tắt

- Âm thanh (âm thanh máy và, nếu bạn chọn, micro) được xử lý **hoàn toàn trên máy bạn**. Âm thanh **không bao giờ** được gửi đi, và không được ghi xuống đĩa. Khi bạn chọn nguồn có micro, ứng dụng thu micro suốt phiên dịch, **kể cả khi bạn đã tắt micro (mute) trong ứng dụng họp** (mục 3).
- Chữ bạn gõ ở **Gõ dịch** (ô soạn tin nhắn để dịch rồi dán vào ứng dụng khác) cũng được dịch **hoàn toàn trên máy bạn**: không được gửi đi và không được ghi xuống đĩa (mục 3).
- **Phân biệt người nói** (bật mặc định, tắt được ở Cài đặt › Phụ đề › Người nói): ứng dụng tạm thời phân tích đặc điểm giọng ngay trên máy để biết câu nào do cùng một người nói và hiện nhãn "Người 1", "Người 2". Đặc điểm giọng **chỉ nằm trong bộ nhớ RAM, tự xóa khi hết phiên, không ghi xuống đĩa, không gửi đi**, và ứng dụng không dùng nó để xác định danh tính ai (mục 3). Trên macOS, ứng dụng còn đọc **tên người tham dự hiển thị trên cửa sổ cuộc họp Microsoft Teams bản cài** để gắn tên vào phụ đề (mục 3).
- Ứng dụng **không có tài khoản đăng nhập, không có quảng cáo, không có analytics**. Khi gặp lỗi, ứng dụng **tự gửi báo cáo lỗi đã che dữ liệu cá nhân** cho chúng tôi để sửa lỗi; bạn tắt được bất cứ lúc nào (mục 10).
- Nếu bạn nhắn ở **chat hỗ trợ** (trên website hay trong ứng dụng), tin nhắn được lưu trên máy chủ của chúng tôi, chuyển tới tài khoản Zalo của người vận hành để trả lời, và **tự xóa sau 90 ngày** kể từ tin cuối; bạn tự xóa được sớm hơn (mục 11).
- Máy chủ của chúng tôi chỉ lưu **email** (khi bạn mua gói, hoặc khi bạn tự để lại trong chat hỗ trợ), thông tin đơn hàng, license, mã nhận diện máy đã băm, báo cáo lỗi (giữ 30 ngày), báo cáo tình trạng của bộ đọc tên (giữ 60 ngày, không có tên người) và tin nhắn chat hỗ trợ (giữ 90 ngày), để cấp key, kiểm tra bản quyền, bảo đảm mỗi máy chỉ dùng thử gói Free một lần, sửa lỗi và trả lời bạn.
- Dữ liệu cá nhân trên máy chủ được **giữ cho tới khi bạn yêu cầu xóa** (mục 7), trừ báo cáo lỗi tự xóa sau 30 ngày và báo cáo tình trạng của bộ đọc tên tự xóa sau 60 ngày (mục 10) và tin nhắn chat hỗ trợ tự xóa sau 90 ngày kể từ tin cuối (mục 11).

## 3. Dữ liệu ở lại trên máy bạn

| Dữ liệu | Cách xử lý |
|---|---|
| Âm thanh máy đang thu | Chỉ nằm trong bộ nhớ RAM trong lúc dịch; không ghi xuống đĩa, không gửi qua mạng |
| Âm thanh từ micro (khi bạn chọn nguồn có micro) | Chỉ nằm trong bộ nhớ RAM trong lúc dịch; không ghi xuống đĩa, không gửi qua mạng. Log không ghi tên micro, chỉ ghi loại kết nối (ví dụ tích hợp, USB, Bluetooth) |
| Bản chép lời và bản dịch | Hiện trên màn hình. **Lịch sử mặc định tắt.** Bật thì lưu trên máy bạn, mã hóa, và xóa toàn bộ được bằng một nút |
| Chữ bạn gõ ở Gõ dịch và bản dịch của nó | Chỉ nằm trong bộ nhớ RAM tới khi bạn dán hoặc thoát ứng dụng; không ghi xuống đĩa, không gửi qua mạng, không có trong log hay báo cáo lỗi. Ứng dụng chép bản dịch vào clipboard của hệ điều hành để dán; bản dịch ở lại đó tới khi bạn chép thứ khác |
| Từ điển thuật ngữ, cài đặt | Lưu trên máy bạn |
| Khóa mã hóa lịch sử, token bản quyền, token dùng thử, bộ đếm hạn mức | Lưu trong kho khóa của hệ điều hành (Keychain của macOS, Credential Manager của Windows) |
| Nhật ký hoạt động (log) | Lưu trên máy bạn, không chứa nội dung chép lời. Chỉ phần log liên quan đến một lỗi rời máy, trong báo cáo lỗi đã che dữ liệu cá nhân (mục 10); bạn cũng có thể gửi log cho hỗ trợ bằng nút trong ứng dụng |
| Model nhận dạng và dịch | Tải về một lần, chạy hoàn toàn trên máy bạn |
| Model nhận giọng người nói (khi tính năng bật) | Tải về một lần (khoảng 26 MB), chạy hoàn toàn trên máy bạn |
| Đặc điểm giọng để phân biệt người nói (khi tính năng bật) | Ứng dụng tạm thời phân tích đặc điểm giọng của âm thanh đang dịch để biết câu nào do cùng một người nói. Dữ liệu này chỉ nằm trong bộ nhớ RAM của một tiến trình phụ trên máy bạn và **tự xóa khi hết phiên**; không ghi xuống đĩa, không gửi qua mạng, không có trong log hay báo cáo lỗi. Ứng dụng không dùng nó để xác định danh tính ai và không nhớ một người qua các phiên |
| Tên người tham dự đọc từ cuộc họp (khi tính năng bật) | Ứng dụng đọc tên hiển thị, trạng thái mic và dấu "đang nói" của người tham dự trên **cửa sổ cuộc họp Microsoft Teams bản cài trên máy bạn** để gắn tên vào phụ đề. Không đọc chat, nội dung chia sẻ, địa chỉ hay cửa sổ khác; không chụp màn hình. Tên chỉ nằm trong bộ nhớ RAM trong lúc dịch; chỉ được ghi xuống đĩa khi bạn bật Lưu lịch sử (Pro), cùng bản chép lời đã mã hóa, hoặc khi bạn tự xuất bản chép lời ra file (Pro); không có trong log, báo cáo lỗi hay báo cáo tình trạng |
| Công thức đọc tên | Một tệp mô tả nhỏ (không chứa mã chạy) có chữ ký số, tải từ `releases.aitranslator.vn`, lưu trên máy bạn |

Các công cụ phụ của ứng dụng chỉ nghe trên `127.0.0.1` (máy bạn) hoặc không mở cổng mạng nào.

Trên macOS, Gõ dịch có thể xin quyền **Trợ năng** (Accessibility) để tự dán bản dịch vào ô bạn đang gõ. Ứng dụng chỉ dùng quyền này để gửi tổ hợp phím dán (⌘V); ứng dụng không đọc chữ, nội dung hay clipboard của ứng dụng khác. Nếu bạn không cấp quyền, ứng dụng chỉ chép bản dịch vào clipboard để bạn tự dán.

Cũng trên macOS, việc hiện tên người nói dùng quyền **Trợ năng** để đọc tên người tham dự trên cửa sổ cuộc họp Microsoft Teams. Ứng dụng chỉ đọc cửa sổ cuộc họp của Teams (không đọc cửa sổ hay ứng dụng khác), chỉ lấy tên hiển thị, trạng thái mic và dấu "đang nói", và không bấm hay gõ gì trong Teams. Để đọc được, ứng dụng bật chế độ trợ năng của Teams trong lúc dịch một cuộc họp; **chế độ trợ năng của Teams còn bật tới khi Teams được khởi động lại** (không tốn gì khi không ai đọc). Nếu bạn không cấp quyền, hay tắt "Lấy tên từ Teams" ở Cài đặt › Phụ đề › Người nói, ứng dụng vẫn phân biệt người nói bằng màu và nhãn "Người 1", "Người 2". Sau mỗi lần cập nhật ứng dụng, macOS có thể đòi cấp lại quyền Trợ năng. Windows chưa có việc đọc tên này.

Ứng dụng chỉ dùng micro khi bạn chọn nguồn **Micro** hoặc **Âm thanh máy + Micro** ở Cài đặt › Âm thanh; nguồn mặc định, **Âm thanh máy**, không mở micro. Khi bạn chọn nguồn có micro, macOS hỏi quyền **Micro**; trên Windows, việc ứng dụng dùng micro theo cài đặt quyền riêng tư về micro của Windows. Trong lúc phiên dịch chạy, ứng dụng thu micro liên tục, **kể cả khi bạn đã tắt micro (mute) trong ứng dụng họp**: việc đó chỉ chặn tiếng của bạn tới người cùng họp, không chặn ứng dụng này. Hệ điều hành báo khi có ứng dụng đang dùng micro (trên macOS là chấm màu cam ở thanh menu). Muốn ứng dụng ngừng thu micro, hãy bấm Dừng. Micro có thể thu giọng của người khác ở gần bạn; hãy xin phép họ khi cần (EULA mục 6).

## 4. Khi nào ứng dụng kết nối mạng

Ứng dụng chỉ kết nối mạng để:
1. **Tải model** (gồm model nhận giọng người nói, khoảng 26 MB, khi tính năng bật) và kiểm tra bản mới của model, và **tải công thức đọc tên** (một tệp mô tả nhỏ có chữ ký số; lúc mở ứng dụng và mỗi 6 giờ, chỉ khi tính năng bật), đều từ `releases.aitranslator.vn`. Đây chỉ là yêu cầu tải tệp, không gửi dữ liệu nào của bạn.
2. **Kiểm tra bản cập nhật** của ứng dụng (từ `releases.aitranslator.vn`).
3. **Làm việc với license server** của chúng tôi (`api.aitranslator.vn`): khi đăng ký dùng thử Free (lần đầu mở ứng dụng, ngay sau khi bạn đồng ý điều khoản; gửi mã băm của ID máy), khi mua gói, kích hoạt, gỡ kích hoạt, khôi phục key, kiểm tra bản quyền định kỳ, gửi báo cáo lỗi (mục 10), gửi báo cáo tình trạng của bộ đọc tên (mục 10) và (hiếm khi) hỏi giờ của máy chủ khi đồng hồ máy bị đặt lệch. Việc hỏi giờ không gửi dữ liệu gì của bạn. Khi bạn dùng **chat hỗ trợ**, ứng dụng cũng gửi và nhận tin chat qua máy chủ này (mục 11): chỉ khi màn hình Hỗ trợ đang mở, hoặc khi bạn đang chờ câu trả lời cho tin đã gửi trong 24 giờ qua và ứng dụng không đang dịch; chưa từng dùng chat thì không có kết nối nào cho chat. Trong lúc dịch, ứng dụng chỉ gửi hay nhận tin chat khi màn hình Hỗ trợ đang mở hoặc khi bạn bấm gửi.
4. **Trang thanh toán** do PayOS (chuyển khoản VietQR) hoặc Creem (thẻ quốc tế) cung cấp, mở bằng trình duyệt của bạn khi bạn mua gói.
5. **Website** `aitranslator.vn` của chúng tôi, mở bằng trình duyệt của bạn khi bạn bấm liên kết trong ứng dụng.

Các bản ứng dụng trước 0.2.7 kết nối tới cùng các máy chủ trên dưới tên miền cũ `aitranslator.io.vn` của chúng tôi; website ở tên cũ tự chuyển sang `aitranslator.vn`.

Không có kết nối nào khác, và không có kết nối nào mang âm thanh (kể cả âm thanh từ micro), nội dung chép lời hay chữ bạn gõ ở Gõ dịch.

## 5. Dữ liệu chúng tôi lưu trên máy chủ

Máy chủ lưu các dữ liệu dưới đây. Dòng "Dùng thử Free" áp cho mọi máy đã mở ứng dụng có mạng; các dòng còn lại chỉ khi bạn mua gói hay kích hoạt key, trừ dòng "Báo cáo lỗi", áp cho mọi máy mà ứng dụng gửi báo cáo, và dòng "Chat hỗ trợ", áp cho mọi người đã nhắn ở chat hỗ trợ trên website hay trong ứng dụng:

| Dữ liệu | Mục đích |
|---|---|
| Email bạn nhập khi mua | Gửi key, khôi phục key khi bạn mất, và, với đơn thẻ, điền sẵn trang thanh toán của Creem |
| Thời điểm bạn đồng ý xử lý email | Làm bằng chứng đã có sự đồng ý |
| Đơn hàng: mã đơn, gói, số tiền và loại tiền, thời điểm thanh toán, trạng thái, mã phiên thanh toán của cổng (PayOS hay Creem), ngôn ngữ giao diện của ứng dụng lúc mua | Cấp và gia hạn license; đối soát; nghĩa vụ kế toán; gửi thư bằng ngôn ngữ của bạn |
| License: key, gói, ngày hết hạn, chu kỳ hạn mức | Cấp quyền dùng gói trả phí |
| Dùng thử Free: **mã băm** của ID máy, lúc bắt đầu và lúc hết dùng thử, lần ứng dụng gọi gần nhất | Mỗi máy chỉ dùng thử 10 ngày một lần, kể cả khi cài lại ứng dụng |
| Máy đã kích hoạt: **mã băm** của ID máy, tên máy (`device_label`) và lần kiểm tra bản quyền gần nhất | Mỗi key chỉ dùng trên một máy, chống lạm dụng, giúp bạn nhận ra máy khi cần gỡ |
| Nhật ký thay đổi license (ai làm gì, lúc nào) | Hỗ trợ, chống gian lận, tra soát sự cố |
| Bộ đếm giới hạn tần suất (chỉ lưu giá trị băm HMAC của IP, key, email, cuộc chat; tự hết hạn sau khoảng 3 giờ) | Chặn dò key và spam |
| Báo cáo lỗi (mục 10): loại và mã lỗi, thông tin máy, **mã băm** của ID máy và phần log liên quan; không có email, tên máy hay nội dung cuộc họp | Tìm và sửa lỗi; tự xóa sau 30 ngày |
| Chat hỗ trợ (mục 11): nội dung tin của bạn và câu trả lời, thời điểm, nguồn (website hay ứng dụng), ngôn ngữ, trang bạn đang xem lúc mở chat (website), dòng thông tin máy nếu bạn để tích (ứng dụng), email nếu bạn tự để lại, **mã băm** của mã bí mật của cuộc chat; không lưu địa chỉ IP cùng cuộc chat | Trả lời bạn, và gửi câu trả lời qua email nếu bạn để lại email; tự xóa sau 90 ngày kể từ tin cuối |

Chúng tôi **không** nhận số tài khoản ngân hàng, số thẻ hay thông tin tài chính của bạn (việc chuyển khoản do ngân hàng của bạn và PayOS xử lý; việc trả bằng thẻ do Creem xử lý ngay trên trang thanh toán của Creem). Với VietQR, chúng tôi **không** gửi email của bạn sang PayOS. Với thẻ quốc tế, chúng tôi gửi email bạn nhập trong ứng dụng cho Creem để điền sẵn trang thanh toán và để Creem gửi biên lai cho bạn. Máy chủ đoán nước của bạn từ địa chỉ IP (qua Cloudflare) chỉ để chọn sẵn cách trả ở màn hình Nâng cấp; nước đoán được không được lưu. Dùng gói Free mà không mua và không kích hoạt key thì chúng tôi chỉ lưu dòng "Dùng thử Free" ở trên, các báo cáo lỗi nếu ứng dụng gửi, và cuộc chat hỗ trợ nếu bạn nhắn: không có email (trừ email bạn tự để lại trong chat), tên máy hay thông tin nào khác của bạn.

Máy chủ cũng lưu **báo cáo tình trạng của bộ đọc tên** (mục 10; giữ 60 ngày rồi tự xóa): mã báo cáo, ngày, phiên bản ứng dụng và hệ điều hành, ứng dụng họp và phiên bản, trạng thái, số phút, mô tả loại phần tử giao diện và mã băm ID máy; **không có tên người, không có chữ trong cuộc họp**.

## 6. Bên thứ ba xử lý dữ liệu, và việc chuyển dữ liệu ra nước ngoài

| Bên | Vai trò | Dữ liệu |
|---|---|---|
| **PayOS** (Việt Nam) | Xử lý thanh toán chuyển khoản VietQR | Mã đơn, số tiền, mô tả đơn. Không có email của bạn |
| **Creem** (Armitage Labs OÜ, Estonia) | Bên bán lại (merchant of record) của đơn thẻ: xử lý thanh toán, thuế và biên lai | Chúng tôi gửi mã đơn, gói, số tiền, loại tiền và email bạn nhập, ngay khi bạn bấm thanh toán bằng thẻ (kể cả khi bạn không trả), để điền sẵn trang thanh toán và để Creem gửi biên lai. Ở trang thanh toán, Creem tự thu số thẻ, tên, địa chỉ thanh toán và nước (để tính thuế), địa chỉ IP (chống gian lận); chúng tôi không nhận số thẻ. Creem xử lý các dữ liệu đó theo chính sách riêng (https://www.creem.io/privacy). Thông báo thanh toán Creem gửi máy chủ của chúng tôi có tên và nước người mua; chúng tôi không lưu hai thông tin này |
| **Cloudflare** | Máy chủ chạy license server, cơ sở dữ liệu, lưu trữ và phân phối bản cập nhật, model | Dữ liệu ở mục 5, kể cả báo cáo lỗi (mục 10) và chat hỗ trợ (mục 11); nhật ký kỹ thuật tự hết hạn |
| **Resend** | Gửi email chứa key, và email chứa câu trả lời chat hỗ trợ khi bạn để lại email | Email bạn, nội dung thư (có key, hay câu trả lời chat); theo chính sách lưu của Resend |
| **Zalo** (Công ty Cổ phần VNG, Việt Nam; máy chủ ở Việt Nam) | Chuyển tin nhắn chat hỗ trợ của bạn tới tài khoản Zalo của người vận hành, và chuyển câu trả lời của người vận hành về máy chủ của chúng tôi | Nội dung tin, mã cuộc chat (3 ký tự), nguồn (website hay ứng dụng), ngôn ngữ, trang bạn đang xem (website), dòng thông tin máy nếu bạn để tích (ứng dụng), và thông báo bạn đã để lại email hay đã xóa cuộc chat. **Không có email của bạn** và không có địa chỉ IP của bạn. Zalo xử lý các dữ liệu đó theo điều khoản và chính sách riêng của Zalo |

Cloudflare và Resend đặt máy chủ ngoài Việt Nam, còn Creem là pháp nhân Estonia, nên dữ liệu ở mục 5, mục 10 và mục 11 có thể được xử lý ở nước ngoài; Zalo đặt máy chủ ở Việt Nam. Bằng việc mua gói và đồng ý xử lý email, hoặc gửi tin ở chat hỗ trợ, bạn đồng ý với việc này. Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho mục đích quảng cáo.

## 7. Thời gian lưu và quyền của bạn

**Dữ liệu cá nhân trên máy chủ được giữ cho tới khi bạn yêu cầu xóa.** Chúng tôi không tự xóa, trừ báo cáo lỗi (tự xóa sau 30 ngày và báo cáo tình trạng của bộ đọc tên tự xóa sau 60 ngày, mục 10) và cuộc chat hỗ trợ (tự xóa sau 90 ngày kể từ tin cuối, mục 11).

Bạn có quyền: biết dữ liệu nào đang được lưu, yêu cầu **xóa** hoặc **ẩn danh**, rút lại sự đồng ý, và khiếu nại theo quy định của **Luật Bảo vệ dữ liệu cá nhân** của Việt Nam. Gửi yêu cầu tới **support@aitranslator.vn** từ email đã dùng khi mua, hay email bạn đã để lại trong chat hỗ trợ (để chúng tôi xác nhận là bạn). Chúng tôi xử lý trong thời hạn pháp luật quy định.

Khi bạn yêu cầu xóa, chúng tôi sẽ:
- **bỏ** email và tên máy của bạn, cùng ngôn ngữ giao diện lưu trên đơn hàng;
- **xóa** các báo cáo lỗi của những máy từng kích hoạt key của email đó (mục 10);
- **xóa** các cuộc chat hỗ trợ mà bạn đã để lại email đó, cả trên máy chủ của chúng tôi lẫn bản đã chuyển vào cuộc trò chuyện Zalo của người vận hành (mục 11);
- **giữ lại** mã băm của ID máy (dữ liệu bí danh, chỉ để chống lạm dụng: mỗi key một máy, khóa tạm khi đổi máy quá nhiều, dùng lại đúng kích hoạt khi bạn kích hoạt lại cùng máy, mỗi máy chỉ dùng thử Free một lần);
- **giữ lại** thời điểm bạn đồng ý xử lý email (bằng chứng đã có sự đồng ý trước đó);
- **giữ lại** dòng đơn hàng ở mức kế toán cần: mã đơn, ngày, số tiền (và loại tiền), mã phiên thanh toán của cổng.

Sau khi xóa, license vẫn dùng được nhưng **không khôi phục qua email** được nữa. Dữ liệu trên máy bạn (lịch sử, cài đặt) do bạn tự xóa trong ứng dụng ("Xóa model và dữ liệu") hoặc khi gỡ cài đặt.

Dữ liệu kỹ thuật tự hết hạn (bộ đếm giới hạn tần suất; nhật ký của Cloudflare) và nhật ký thư của Resend nằm ngoài yêu cầu xóa của chúng tôi; thời hạn lưu theo chính sách của các bên đó. Dữ liệu bạn nhập ở trang Creem và hồ sơ giao dịch do Creem giữ (bên bán lại phải giữ chứng từ thuế) nằm ngoài yêu cầu xóa gửi chúng tôi; muốn xóa ở Creem, hãy liên hệ Creem. Báo cáo lỗi của một máy chưa từng kích hoạt key không gắn với email nào nên không tìm theo email được; những báo cáo đó tự xóa sau 30 ngày và báo cáo tình trạng của bộ đọc tên tự xóa sau 60 ngày. Cuộc chat hỗ trợ không để lại email thì cũng không tìm theo email được: hãy tự xóa bằng nút trong khung chat, hoặc gửi yêu cầu kèm thời điểm và nội dung gần đúng của tin nhắn để chúng tôi tìm; nếu không, cuộc chat tự xóa sau 90 ngày kể từ tin cuối (bản đã chuyển vào Zalo chỉ được xóa khi bạn yêu cầu).

## 8. Trẻ em

Dịch vụ dành cho người từ **16 tuổi** trở lên. Chúng tôi không chủ ý thu thập dữ liệu của trẻ dưới 16 tuổi; nếu bạn là cha mẹ hay người giám hộ và cho rằng con bạn đã cung cấp email cho chúng tôi, hãy liên hệ để chúng tôi xóa.

## 9. Bảo mật

Khóa ký token và khóa thanh toán chỉ nằm trên máy chủ (dưới dạng secret), không có trong ứng dụng. Kết nối tới máy chủ dùng HTTPS. Truy cập quản trị được bảo vệ bằng đăng nhập riêng. Không hệ thống nào an toàn tuyệt đối; nếu có sự cố ảnh hưởng đến dữ liệu cá nhân, chúng tôi sẽ thông báo theo quy định pháp luật.

## 10. Báo cáo lỗi

Khi ứng dụng gặp lỗi, nó **tự gửi một báo cáo lỗi** cho chúng tôi qua license server (`api.aitranslator.vn`) để chúng tôi biết và sửa lỗi. Tính năng này **bật mặc định**: ở bước Điều khoản khi mở ứng dụng lần đầu có một ô đã tích sẵn mà bạn bỏ tích được, và người dùng đã cài từ trước cũng được bật sau khi cập nhật lên bản có tính năng này. Bạn tắt hay bật lại bất cứ lúc nào ở **Cài đặt › Quyền riêng tư › Gửi báo cáo lỗi tự động**; tắt thì các báo cáo đang chờ gửi bị xóa. Bạn cũng tự gửi được một báo cáo bất cứ lúc nào bằng nút **Gửi log cho hỗ trợ** ở màn hình Giới thiệu: nút này gửi ngay, kể cả khi bạn đã tắt gửi tự động, và cho bạn một **mã báo cáo** để đưa cho bộ phận hỗ trợ.

| Nội dung | Chi tiết |
|---|---|
| Khi nào gửi tự động | Khi lần chạy trước của ứng dụng bị dừng đột ngột; khi một phiên dịch dừng vì lỗi của ứng dụng (không tính lỗi do bạn hay môi trường như thiếu quyền ghi âm hay quyền micro, không mở được micro, hết hạn mức, hết dùng thử, mất mạng, hết dung lượng); hoặc khi một công cụ phụ của ứng dụng chết rồi được tự khởi động lại. Báo cáo chỉ được gửi khi ứng dụng không đang dịch, và mỗi máy gửi tối đa 5 báo cáo mỗi ngày |
| Báo cáo gồm | Mã báo cáo, loại và mã lỗi, giờ xảy ra; phiên bản ứng dụng, hệ điều hành và phiên bản, kiến trúc, tên chip hoặc CPU, RAM, loại GPU đang dùng, gói model, tên gói bản quyền (không có key), ngôn ngữ giao diện; **mã băm của ID máy**; và phần log liên quan đến lỗi (tối đa 64 KB) |
| Báo cáo không gồm | Âm thanh (kể cả âm thanh từ micro), bản chép lời, bản dịch, chữ bạn gõ ở Gõ dịch, license key, token, email, tên máy, tên micro, tên người tham dự hay tên người nói, tên tài khoản hệ điều hành, địa chỉ IP |
| Che dữ liệu | Trước khi gửi, ứng dụng che đường dẫn thư mục cá nhân, key, token và email trong log; còn sót mẫu nhạy cảm thì bỏ cả báo cáo. Máy chủ kiểm lại và từ chối báo cáo nếu còn |
| Gắn với bạn thế nào | Mã băm của ID máy trong báo cáo cũng là mã chúng tôi lưu cho bản quyền và dùng thử Free (mục 5), nên chúng tôi **có thể nối báo cáo với license và email** của máy đó khi tra cứu hỗ trợ |
| Giữ bao lâu | Tối đa **30 ngày** rồi tự xóa; máy chủ giữ tối đa 3.000 báo cáo, báo cáo cũ nhất bị xóa trước |
| Ai xem được | Chỉ người vận hành ứng dụng, qua trang quản trị có đăng nhập riêng. Dữ liệu nằm trên Cloudflare (mục 6) |

- Chúng tôi dùng báo cáo chỉ để tìm và sửa lỗi; không dùng cho quảng cáo, không bán và không chia sẻ cho bên nào ngoài các bên xử lý ở mục 6.
- Muốn xóa báo cáo của máy bạn trước hạn 30 ngày, hãy yêu cầu xóa dữ liệu theo mục 7: khi xử lý yêu cầu xóa theo email, chúng tôi xóa luôn báo cáo lỗi của các máy từng kích hoạt key của email đó.
- Nếu bạn không muốn gửi gì, hãy bỏ tích ở bước Điều khoản hoặc tắt công tắc ở Cài đặt; ứng dụng vẫn dùng đầy đủ tính năng khi tắt.
- **Báo cáo tình trạng của bộ đọc tên** (khi tính năng người nói bật và công tắc gửi báo cáo lỗi bật): mỗi ngày, mỗi máy gửi tối đa một báo cáo cho mỗi ứng dụng họp và phiên bản của nó, qua cùng máy chủ, để chúng tôi biết khi Teams đổi giao diện làm bộ đọc không đọc được nữa. Báo cáo chỉ gồm: phiên bản ứng dụng và hệ điều hành, tên và phiên bản ứng dụng họp, phiên bản công thức, trạng thái (đọc được tên, không thấy ai đang nói, thiếu quyền, bị chặn), số phút đọc được trên tổng số phút họp, mô tả loại phần tử giao diện (vai trò và lớp, không có tên người hay chữ) và mã băm ID máy như báo cáo lỗi; **không có tên người, không có chữ trong cuộc họp**. Giữ **60 ngày** rồi tự xóa; tắt công tắc gửi báo cáo lỗi thì ứng dụng xóa luôn số liệu đang chờ gửi; yêu cầu xóa theo email (mục 7) xóa luôn các báo cáo này của những máy từng kích hoạt key của email đó.

## 11. Chat hỗ trợ

Bạn có thể nhắn cho chúng tôi ở **chat hỗ trợ**: nút chat ở góc mỗi trang của website `aitranslator.vn`, hoặc màn hình **Hỗ trợ** trong ứng dụng. Không cần tài khoản, và mọi người dùng đều chat được, kể cả gói Free. Người trả lời là người vận hành ứng dụng, không phải bot. Tin của bạn đi qua máy chủ của chúng tôi (`api.aitranslator.vn`) tới tài khoản Zalo của người vận hành; người vận hành trả lời trong Zalo và câu trả lời hiện trong khung chat của bạn. Bạn không cần có Zalo.

| Nội dung | Chi tiết |
|---|---|
| Máy chủ lưu gì | Nội dung các tin của bạn và câu trả lời, thời điểm các tin; nguồn (website hay ứng dụng) và ngôn ngữ; trang bạn đang xem lúc mở chat (chỉ trên website, chỉ đường dẫn của trang); dòng thông tin máy nếu bạn để tích (chỉ trong ứng dụng); email nếu bạn tự để lại; **mã băm** của mã bí mật của cuộc chat (máy chủ không lưu mã gốc) |
| Email | Không bắt buộc. Nếu bạn để lại, chúng tôi chỉ dùng nó để gửi câu trả lời qua email (qua Resend, mục 6) khi câu trả lời chưa tới được khung chat của bạn sau khoảng 2 phút (ví dụ bạn đã đóng trang hay ứng dụng), và bạn trả lời được bằng chính thư đó. Muốn bỏ email, hãy xóa cuộc trò chuyện bằng nút trong khung chat, hoặc yêu cầu theo mục 7. Email bạn nhập ở ô email **không bao giờ được gửi sang Zalo** |
| Thông tin máy (ứng dụng) | Ô gửi kèm thông tin máy được tích sẵn, bỏ tích được, chỉ hiện trước tin đầu tiên và chỉ đi kèm tin đầu tiên. Ứng dụng hiện nguyên văn dòng này trước khi gửi: phiên bản ứng dụng, hệ điều hành và phiên bản, chip hoặc CPU, RAM, card đồ họa (Windows), tên gói bản quyền, gói model, ngôn ngữ giao diện. **Không bao giờ** có license key, email, mã máy, tên máy hay tên tài khoản hệ điều hành |
| Địa chỉ IP | Không lưu cùng cuộc chat. IP chỉ dùng để giới hạn tần suất; bộ đếm trên máy chủ chỉ lưu giá trị băm của IP (mục 5) |
| Gửi sang Zalo | Nội dung tin, mã cuộc chat (3 ký tự), nguồn, ngôn ngữ, trang (website), dòng thông tin máy nếu bạn để tích (ứng dụng), và thông báo bạn đã để lại email hay đã xóa cuộc chat (không kèm địa chỉ email). Câu trả lời của người vận hành đi từ Zalo về máy chủ của chúng tôi |
| Trên máy hay trình duyệt của bạn | Mã bí mật của cuộc chat và vị trí tin đã đọc: trên website, lưu trong bộ nhớ của trình duyệt (`localStorage`); trong ứng dụng, lưu trong một file ở thư mục dữ liệu của ứng dụng. Ai có mã này thì mở được cuộc chat. Xóa cuộc trò chuyện thì mã này cũng bị xóa |
| Khi nào có kết nối | Website: khi bạn mở khung chat, trình duyệt hỏi chat có đang bật không; đã có cuộc chat thì trình duyệt hỏi tin mới khi khung chat đang mở, hoặc khi bạn đang chờ câu trả lời cho tin đã gửi trong 24 giờ qua; chưa mở khung chat thì trình duyệt không kết nối gì cho chat. Ứng dụng: như mục 4 (chưa nhắn tin nào thì không kết nối) |
| Giữ bao lâu | Cuộc chat và mọi tin **tự xóa sau 90 ngày** kể từ tin cuối cùng. Bạn xóa ngay được bằng nút xóa cuộc trò chuyện trong khung chat |
| Ai xem được | Chỉ người vận hành ứng dụng, đọc và trả lời trong Zalo. Dữ liệu nằm trên Cloudflare và Zalo (mục 6) |

- Việc tự xóa sau 90 ngày và nút xóa chỉ xóa dữ liệu trên máy chủ của chúng tôi (nút xóa còn xóa mã trên máy bạn). Bản sao các tin đã chuyển sang Zalo vẫn nằm trong cuộc trò chuyện Zalo của người vận hành, và trên hệ thống của Zalo theo chính sách của Zalo, cho tới khi người vận hành xóa; muốn xóa cả bản đó, hãy yêu cầu theo mục 7. Thư trả lời đã gửi tới email của bạn thì nằm trong hộp thư của bạn và nhật ký thư của Resend.
- Chúng tôi dùng chat chỉ để trả lời bạn; không dùng cho quảng cáo, không bán và không chia sẻ cho bên nào ngoài các bên xử lý ở mục 6.
- Nếu trong ứng dụng bạn chọn đính kèm log, ứng dụng gửi một báo cáo lỗi như nút **Gửi log cho hỗ trợ** (mục 10) rồi gửi mã báo cáo vào cuộc chat.
- Đừng gửi mật khẩu, số thẻ hay số tài khoản ngân hàng qua chat; chúng tôi không cần những thông tin đó. Chat có thể tạm tắt; khi đó khung chat hiện địa chỉ support@aitranslator.vn.

## 12. Thay đổi chính sách

Khi chính sách thay đổi, chúng tôi cập nhật văn bản này và ngày hiệu lực, và thông báo trong ứng dụng hoặc trên website khi thay đổi quan trọng. Tiếp tục dùng ứng dụng sau ngày hiệu lực nghĩa là bạn chấp nhận bản mới.

## 13. Liên hệ

**Đỗ Tiến Phong**, support@aitranslator.vn.
