import { pageHero, faq, callout, docLayout, ctaBand } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Câu hỏi thường gặp", path: "/cau-hoi-thuong-gap/" },
];

// Mỗi nhóm: id (neo), tiêu đề h2, danh sách câu hỏi. Câu trả lời mở đầu bằng đáp án trực tiếp.
const GROUPS = [
  {
    id: "tong-quan",
    title: "Tổng quan",
    items: [
      {
        q: "AI Translator là gì?",
        a: `<p>AI Translator là ứng dụng desktop hiện phụ đề dịch trực tiếp cho âm thanh đang phát trên máy tính, như cuộc họp, webinar hoặc video, và nếu bạn chọn, cho người nói trong phòng qua micro. App nhận dạng giọng nói và dịch ngay trên máy bạn, rồi hiện bản dịch thành một thanh phụ đề nổi. Xem <a href="/tinh-nang/">đầy đủ tính năng</a>.</p>`,
      },
      {
        q: "Có app nào dịch phụ đề cuộc họp offline, chạy ngay trên máy không?",
        a: `<p>Có. AI Translator (aitranslator.vn) là app desktop cho macOS 14.2 trở lên (Apple Silicon) và Windows 10/11 64-bit (x64), hiện phụ đề dịch trực tiếp cho âm thanh đang phát trên máy. Nhận dạng giọng nói và dịch đều chạy trên máy, nên khi dịch không cần internet và âm thanh không rời máy. Hỗ trợ tiếng Anh, tiếng Trung, tiếng Nhật, tiếng Hàn và tiếng Việt; dùng thử Free 10 ngày.</p>`,
      },
      {
        q: "Làm sao dịch cuộc họp Zoom sang tiếng Việt mà không cần bot?",
        a: `<p>Mở AI Translator, chọn tiếng Việt là ngôn ngữ muốn đọc rồi bấm Bắt đầu. App nghe âm thanh Zoom phát ra trên máy bạn và hiện phụ đề tiếng Việt trên một thanh nổi. Không có bot nào vào phòng và chủ họp không cần bật gì. Người cùng họp không được thông báo, nên nếu quy định yêu cầu thì bạn tự báo họ.</p>`,
      },
      {
        q: "Có cách dịch phụ đề họp sang tiếng Việt miễn phí không?",
        a: `<p>AI Translator có gói Free dùng thử 10 ngày, tối đa 30 phút dịch mỗi ngày, không cần thẻ hay tài khoản. Sau đó cần gói trả trước: Monthly 50.000 ₫ (50 giờ mỗi 30 ngày), 6 Months 269.000 ₫ (100 giờ mỗi 30 ngày, trong 180 ngày) hoặc Yearly 500.000 ₫ (không giới hạn trong 365 ngày). Gói Free là dùng thử, không phải miễn phí vĩnh viễn.</p>`,
      },
      {
        q: "AI Translator có phụ đề song ngữ (câu gốc và bản dịch) không?",
        a: `<p>Có. Tùy chọn “Hiện câu gốc phía trên bản dịch” trong Cài đặt › Phụ đề (mặc định bật) hiện câu gốc chữ nhỏ ngay trên bản dịch; bạn tắt được nếu chỉ muốn đọc bản dịch.</p>`,
      },
      {
        q: "Dịch video tiếng Anh trên trình duyệt sang tiếng Việt được không?",
        a: `<p>Được. App nghe âm thanh đang phát trên máy nên dùng được với video phát trong trình duyệt mà không cần tiện ích nào. Chúng tôi đã thử thu âm thanh từ Google Meet chạy trên Chrome, Safari và Edge (macOS 26.6.2), và thử một lần với YouTube Live. Chúng tôi chưa thử riêng từng nền tảng video khác.</p>`,
      },
      {
        q: "Dịch livestream ra tiếng Việt được không? Có dịch live TikTok không?",
        a: `<p>Về cơ chế thì được, nếu bạn xem trên máy tính: app nghe âm thanh đang phát ra từ máy nên không phụ thuộc trang web, và hiện phụ đề tiếng Việt cho livestream bằng tiếng Anh, Trung, Nhật hay Hàn. Chúng tôi đã thử với video phát trong trình duyệt, và thử một lần với YouTube Live (một kênh tin tức tiếng Anh, Chrome trên macOS, 25/10/2026): phụ đề tiếng Việt hiện suốt buổi thử, bản dịch nhìn chung khớp lời. Với TikTok LIVE, chúng tôi chỉ có kết quả của một buổi live tiếng Việt có nhạc nền: app thu được tiếng, nhưng nhận nhầm ngôn ngữ và lặp lại câu không ai nói nên phụ đề không dùng được. Chúng tôi chưa thử Facebook Live. App không có bản cho điện thoại và không đưa phụ đề vào buổi live của chính bạn cho khán giả của bạn. Xem <a href="/giai-phap/dich-livestream/">dịch livestream ra tiếng Việt</a> và <a href="/giai-phap/dich-live-tiktok/">dịch live TikTok</a>.</p>`,
      },
      {
        q: "Có dùng AI Translator trên điện thoại để dịch live được không?",
        a: `<p>Không. AI Translator chỉ có bản cho macOS (Apple Silicon) và Windows 10/11. Muốn có phụ đề cho livestream, hãy mở buổi live trên máy tính.</p>`,
      },
      {
        q: "Tôi phát livestream, dịch cho người xem của mình được không?",
        a: `<p>Không. AI Translator không có tính năng đưa phụ đề hay giọng dịch vào buổi live của bạn. App làm phụ đề để chính người dùng app đọc, trên thanh nổi ở máy của họ.</p>`,
      },
      {
        q: "Dùng được với Zoom, Teams, Google Meet, Zalo không?",
        a: `<p>Được. App thu âm thanh hệ thống nên không phụ thuộc app họp và không cần cấu hình riêng cho từng app: bạn chỉ cần bấm Bắt đầu. Trên macOS bạn có thể chọn chỉ nghe một app (Cài đặt › Âm thanh) để không dịch tiếng thông báo.</p><p>Chúng tôi đã kiểm tra việc thu âm thanh hệ thống trên macOS 26 với Zoom, Google Meet (Chrome, Safari, Edge), Microsoft Teams và Zalo PC: âm thanh người nói được thu rõ. Đó là kiểm tra bộ thu âm do người thử xác nhận, chưa phải kiểm thử chính thức trên bản phát hành, và chúng tôi chưa thử mọi phiên bản macOS hay mọi app. Các tên này chỉ để nói về khả năng tương thích, AI Translator không liên kết với họ. Xem <a href="/giai-phap/dich-hop-truc-tuyen/">giải pháp cho họp trực tuyến</a>.</p>`,
      },
      {
        q: "Có cần bot, plugin hay tài khoản không?",
        a: `<p>Không cần cả ba. Không có bot tham gia cuộc họp, không cài plugin vào app họp và không có đăng nhập. Gói Free chỉ cần bạn đồng ý điều khoản; gói trả phí được kích hoạt bằng license key gửi qua email.</p>`,
      },
      {
        q: "Tôi tải AI Translator ở đâu? Có bản Windows không?",
        a: `<p>Trên macOS (14.2 trở lên, Apple Silicon), bạn cài bằng một dòng lệnh dán vào Terminal; lệnh nằm ở trang <a href="/tai-xuong/">Tải xuống</a> và app mở thẳng, không cần Open Anyway. Chưa có nút tải file .dmg. Bản Windows (10/11, 64-bit) cũng cài bằng một dòng lệnh dán vào PowerShell ở cùng trang đó. Bản Windows chưa được ký mã: cài bằng lệnh thì SmartScreen không hỏi, còn file .exe tải bằng trình duyệt có thể bị cảnh báo.</p>`,
      },
      {
        q: "AI Translator có phải là mã nguồn mở không?",
        a: `<p>Không. AI Translator là sản phẩm thương mại, dùng theo giấy phép trong <a href="/dieu-khoan/">Điều khoản sử dụng</a>. Nó dùng nhiều thành phần mã nguồn mở của bên thứ ba. Danh sách giấy phép đầy đủ nằm trong app (Giới thiệu › Giấy phép mã nguồn mở), phần tóm tắt ở trang <a href="/ve-chung-toi/#cong-nghe">Về AI Translator</a>.</p>`,
      },
    ],
  },
  {
    id: "ngon-ngu-va-chat-luong",
    title: "Ngôn ngữ và chất lượng",
    items: [
      {
        q: "AI Translator hỗ trợ những ngôn ngữ nào?",
        a: `<p>Năm ngôn ngữ, cho cả âm thanh nguồn và bản dịch: English, 中文 (Trung), 日本語 (Nhật), 한국어 (Hàn) và Tiếng Việt. Giao diện app có tiếng Việt, English, 日本語, 中文 (giản thể) và 한국어; lần đầu mở app, giao diện theo ngôn ngữ của máy bạn.</p><p>App tự nhận diện ngôn ngữ đang nói trong các ngôn ngữ bạn chọn, hoặc bạn khóa một ngôn ngữ cho chắc. Chất lượng dịch đã được đo cho tám chiều có tiếng Việt (Anh, Trung, Nhật, Hàn sang Việt, và Việt sang Anh, Trung, Nhật, Hàn). Các chiều không có tiếng Việt vẫn chạy được nhưng chúng tôi chưa đo điểm chất lượng.</p>`,
      },
      {
        q: "Sẽ có thêm ngôn ngữ khác không?",
        a: `<p>Chúng tôi dự định bổ sung thêm ngôn ngữ trong tương lai. Hiện chưa có lịch hay danh sách cụ thể, và hiện app chỉ hỗ trợ năm ngôn ngữ: tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어) và tiếng Việt. Khi có ngôn ngữ mới, chúng tôi sẽ cập nhật ngay trang này và <a href="/tinh-nang/">trang Tính năng</a>.</p>`,
      },
      {
        q: "Dịch theo chiều nào? Có dịch giọng của tôi cho người khác không?",
        a: `<p>Phụ đề dịch một chiều: từ âm thanh đang phát trên máy sang ngôn ngữ của bạn. Hiện app chưa dịch giọng của bạn để phát vào cuộc họp. Muốn trả lời bằng chữ, bạn dùng <a href="/huong-dan/go-dich/">Gõ dịch</a>: gõ tin nhắn bằng tiếng của bạn, app dán bản dịch vào ô chat. Nếu cả hai bên cùng cài app, mỗi bên sẽ thấy phụ đề của phía kia.</p>`,
      },
      {
        q: "Bản dịch có chính xác không?",
        a: `<p>Chưa hoàn hảo: bản dịch có thể sai, thiếu hoặc không hợp ngữ cảnh, nhất là với thuật ngữ chuyên ngành, tên riêng và tiếng nói không rõ. Đừng dựa vào nó cho quyết định quan trọng.</p><p>Từ điển thuật ngữ (tính năng Pro) gợi ý tên riêng và thuật ngữ cho bộ dịch, nhưng không bảo đảm bộ dịch dùng đúng mọi lần. Chúng tôi không đưa ra tỉ lệ chính xác chung vì chưa đo trên hội thoại họp thật; số đo hiện có kèm điều kiện nằm ở trang <a href="/tinh-nang/#hieu-nang">Tính năng</a>.</p>`,
      },
      {
        q: "Gói model Chuẩn và gói model Nhẹ khác nhau thế nào?",
        a: `<p>Gói model Chuẩn (khoảng 2,5 GB) nhận dạng giọng nói ít lỗi hơn, nhất là tiếng Việt, Nhật, Hàn, Trung. Gói model Nhẹ (khoảng 1,3 GB) nhỏ hơn, dành cho máy có ít RAM hơn (tối thiểu 8 GB). App đề xuất gói theo RAM và card đồ họa của máy bạn.</p><p>Trên bộ clip đọc chuẩn, tỉ lệ lỗi từ của tiếng Việt là 8,7% ở gói model Chuẩn và 22,5% ở gói model Nhẹ (Mac M4 Pro, câu đọc chứ chưa phải hội thoại họp thật). Nếu bạn nghe nhiều các ngôn ngữ này và máy đủ RAM (khuyến nghị 16 GB), hãy dùng gói model Chuẩn.</p>`,
      },
      {
        q: "Độ trễ của phụ đề là bao nhiêu?",
        a: `<p>Trên Mac M4 Pro, độ trễ trung vị dưới khoảng 1,1 giây kể từ lúc người nói dừng câu tới khi hiện đủ bản dịch; chữ dịch đầu tiên hiện sau khoảng 0,5 đến 0,7 giây, ở cả hai gói model. Đây là số đo trên một máy cụ thể, bằng âm thanh phát lại theo thời gian thực.</p><p>Chúng tôi chưa đo Mac M1, máy 8 GB hay card đồ họa rời của Windows. Thử sơ bộ trên một laptop Windows có GPU tích hợp cho thấy gói model Chuẩn chưa đạt mục tiêu độ trễ. Chi tiết và điều kiện đo ở trang <a href="/tinh-nang/#hieu-nang">Tính năng</a>.</p>`,
      },
    ],
  },
  {
    id: "rieng-tu-va-du-lieu",
    title: "Riêng tư và dữ liệu",
    items: [
      {
        q: "AI Translator có dùng AI hay model trên cloud không?",
        a: `<p>Không. Cả nhận dạng giọng nói lẫn dịch đều là model AI chạy trên máy bạn. Không có dịch vụ AI nào trên cloud tham gia vào việc nhận dạng hay dịch cuộc họp, nên âm thanh, bản chép lời và bản dịch không đi qua bên thứ ba nào. Mạng chỉ dùng cho những việc ngoài việc dịch: kiểm tra bản quyền, thanh toán, tải model và cập nhật app.</p>`,
      },
      {
        q: "Dữ liệu về cuộc hội thoại của tôi nằm ở đâu?",
        a: `<p>Hoàn toàn trên máy bạn. Âm thanh chỉ nằm trong RAM khi đang dịch; bản chép lời và bản dịch hiện trên màn hình và nằm trong bộ nhớ của phiên; lịch sử mặc định tắt, nếu bạn bật thì lưu mã hóa trên máy. Máy chủ của chúng tôi không có dữ liệu cuộc hội thoại, chỉ có email (khi mua), đơn hàng, license và thông tin kích hoạt máy (mã băm ID máy, tên máy). Xem <a href="/bao-mat-du-lieu/">Dữ liệu và bảo mật</a>.</p>`,
      },
      {
        q: "AI Translator có chạy offline được không?",
        a: `<p>Có: nhận dạng giọng nói và dịch chạy 100% trên máy, không cần mạng sau khi đã tải model. Bạn vẫn cần mạng thỉnh thoảng cho vài việc: tải model lần đầu (khoảng 1,3 GB hoặc 2,5 GB), đăng ký dùng thử Free lần đầu, mua gói, kiểm tra bản quyền (gói trả phí dùng offline tối đa 14 ngày giữa hai lần kiểm tra) và cập nhật app. Xem <a href="/so-sanh/dich-offline-va-cloud/">so sánh dịch offline và dịch cloud</a>.</p>`,
      },
      {
        q: "Âm thanh cuộc họp của tôi có bị gửi đi đâu không?",
        a: `<p>Không. Âm thanh chỉ nằm trong RAM, không ghi đĩa và không gửi qua mạng. Chúng tôi đã kiểm tra bằng proxy và nettop trên macOS: trong lúc dịch, app không gửi âm thanh hay chữ chép lời ra ngoài. Chi tiết ở<a href="/bao-mat-du-lieu/">Dữ liệu và bảo mật</a>.</p>`,
      },
      {
        q: "Có quảng cáo hay thu thập dữ liệu không?",
        a: `<p>App không có quảng cáo và không có analytics. Website chỉ đo lượt truy cập bằng Google Analytics khi bạn bấm Đồng ý ở thanh thông báo; từ chối thì không có cookie đo lường nào (xem <a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a>, mục 14). Khi app gặp lỗi, nó tự gửi một báo cáo lỗi đã che dữ liệu cá nhân (không có âm thanh, chữ chép lời, key hay email); bạn tắt được ở Cài đặt › Quyền riêng tư. Máy chủ chỉ lưu email (khi bạn mua, hay khi bạn tự để lại trong chat hỗ trợ), đơn hàng, license, mã băm ID máy, tên máy (khi bạn kích hoạt key), mốc dùng thử Free, nhật ký thay đổi license, các báo cáo lỗi (giữ 30 ngày) và tin nhắn chat hỗ trợ khi bạn dùng chat (giữ 90 ngày), để cấp key, bảo đảm mỗi key một máy, mỗi máy dùng thử một lần, sửa lỗi và trả lời bạn. Chúng tôi không bán hay chia sẻ dữ liệu cho mục đích quảng cáo. Chi tiết ở <a href="/bao-mat-du-lieu/#bao-cao-loi">Dữ liệu và bảo mật</a>.</p>`,
      },
      {
        q: "Bản chép lời có được lưu lại không?",
        a: `<p>Mặc định thì không lưu. Bản chép lời của phiên đang chạy nằm trong bộ nhớ; bạn xem, tìm và sao chép được ở mọi gói. Lưu lịch sử (mã hóa, chỉ trên máy bạn) và xuất ra TXT, SRT, Markdown là tính năng Pro. Xem <a href="/huong-dan/lich-su-va-xuat-file/">hướng dẫn lịch sử và xuất file</a>.</p>`,
      },
      {
        q: "Tôi có cần báo cho người cùng họp không? Dùng thế này có hợp pháp không?",
        a: `<p>Chúng tôi không đưa ra tư vấn pháp lý. Điều chúng tôi nói được: AI Translator không ghi âm cuộc họp xuống đĩa, chỉ hiện phụ đề dịch và (tùy chọn) lưu bản chép lời.</p><p>Nếu pháp luật hoặc quy định công ty của bạn yêu cầu, bạn tự chịu trách nhiệm thông báo cho người cùng họp là bạn dùng công cụ dịch. App nhắc điều này ở bước Quyền riêng tư khi bạn thiết lập lần đầu, và <a href="/dieu-khoan/">Điều khoản sử dụng</a> ghi rõ, kèm yêu cầu tuân thủ quy định bảo mật của tổ chức bạn và không dùng app để nghe lén.</p>`,
      },
      {
        q: "Làm sao để xóa dữ liệu của tôi?",
        a: `<p>Trên máy: Cài đặt › Quyền riêng tư › Xóa toàn bộ dữ liệu (lịch sử và từ điển), hoặc Xóa model và dữ liệu. Trên máy chủ: gửi email tới support@aitranslator.vn từ chính email đã dùng khi mua để yêu cầu xóa hoặc ẩn danh. Chúng tôi bỏ email và tên máy của bạn, và vẫn giữ mã băm ID máy, thời điểm đồng ý và dòng đơn hàng mức kế toán. Xem <a href="/bao-mat-du-lieu/#xoa-du-lieu">cách yêu cầu xóa dữ liệu</a>.</p>`,
      },
    ],
  },
  {
    id: "cai-dat-va-yeu-cau-may",
    title: "Cài đặt và yêu cầu máy",
    items: [
      {
        q: "Máy của tôi có chạy được AI Translator không?",
        a: `<p>AI Translator chạy trên Mac Apple Silicon (M1 trở lên) với macOS 14.2 trở lên; RAM tối thiểu 8 GB, khuyến nghị 16 GB. Chưa hỗ trợ Mac Intel. Bản Windows chạy trên Windows 10/11 64-bit (x64) với CPU có AVX2, RAM tối thiểu 8 GB, khuyến nghị 16 GB; chưa hỗ trợ Windows ARM64.</p><p>Máy dưới 8 GB RAM hoặc không đạt yêu cầu thì app báo lý do và không cho tải model. Riêng Mac M1 cơ bản và máy Windows, chúng tôi chưa có số đo độ trễ.</p>`,
      },
      {
        q: "AI Translator tốn bao nhiêu RAM và ổ đĩa?",
        a: `<p>Model chiếm khoảng 2,5 GB ổ đĩa (gói model Chuẩn) hoặc 1,3 GB (gói model Nhẹ), và cần trống thêm 1 GB khi tải. Trên Mac M4 Pro, phần xử lý AI dùng khoảng 2,9 GiB RAM (Chuẩn) hoặc 1,8 đến 1,9 GiB (Nhẹ), cộng ước chừng 0,3 GB cho app. Phần xử lý AI tự tắt sau 10 phút không dịch để app nằm ở thanh menu không giữ vài GB RAM. Chúng tôi chưa đo trên máy khác.</p>`,
      },
      {
        q: "Vì sao macOS báo không xác minh được nhà phát triển?",
        a: `<p>Chỉ khi bạn tải file .dmg bằng trình duyệt: bản macOS hiện được ký ad-hoc và chưa notarize (chúng tôi chưa có Apple Developer ID), nên macOS chặn lần mở đầu của file tải từ internet. Cài bằng <a href="/tai-xuong/#cai-macos">dòng lệnh trong Terminal</a> thì không bị chặn. Nếu đã tải .dmg, bạn vào System Settings › Privacy &amp; Security, kéo xuống cuối, bấm Open Anyway cạnh tên AI Translator rồi xác nhận bằng mật khẩu hoặc Touch ID. Từ macOS 15, mẹo bấm chuột phải rồi chọn Open không còn dùng được. Xem <a href="/huong-dan/cai-dat-macos/">hướng dẫn cài đặt trên macOS</a>.</p>`,
      },
      {
        q: "Vì sao Windows hiện “Windows protected your PC” khi cài?",
        a: `<p>Chỉ khi bạn tải file .exe bằng trình duyệt: bản Windows hiện chưa được ký mã (chúng tôi chưa có chứng thư ký mã Windows), nên Microsoft Defender SmartScreen có thể chặn lần chạy bộ cài. Cài bằng <a href="/tai-xuong/#cai-windows">dòng lệnh trong PowerShell</a> thì không bị hỏi. Nếu bạn đã tải .exe: Nếu file đúng nguồn và mã SHA-256 khớp, bấm More info, kiểm dòng App là đúng tên file cài, rồi bấm Run anyway. Dòng Publisher hiện Unknown publisher là bình thường với bản chưa ký mã. Khi có chứng thư ký mã, cảnh báo sẽ giảm dần. Nếu Windows 11 báo ứng dụng bị chặn và không có nút bỏ qua thì đó là Smart App Control (xem hướng dẫn). Xem <a href="/huong-dan/cai-dat-windows/">hướng dẫn cài đặt trên Windows</a>.</p>`,
      },
      {
        q: "Cần cấp quyền gì trên macOS?",
        a: `<p>Để dịch âm thanh máy, chỉ cần quyền Ghi âm thanh hệ thống (System Audio Recording); macOS hỏi ở lần đầu bạn bấm Bắt đầu. Nếu bạn từ chối, macOS không báo lỗi mà chỉ cho app nhận im lặng; app sẽ nhắc bạn bật lại. Xem <a href="/huong-dan/cap-quyen-thu-am-macos/">hướng dẫn cấp quyền ghi âm</a>. Khi bạn chọn nguồn có micro (Micro, hoặc Âm thanh máy + Micro), macOS hỏi thêm quyền Micro (xem <a href="/huong-dan/cap-quyen-thu-am-macos/#quyen-micro">quyền Micro</a>). Gõ dịch có thể xin thêm quyền Trợ năng (Accessibility), chỉ để tự dán bản dịch vào ô chat; không cấp thì app chép bản dịch để bạn tự dán (xem <a href="/huong-dan/go-dich/#quyen-tro-nang">Gõ dịch</a>). Trên Windows không cần cấp quyền nào trong hai quyền này.</p>`,
      },
      {
        q: "Có dịch được người nói trong phòng họp không?",
        a: `<p>Có. Ở Cài đặt › Âm thanh, chọn nguồn <strong>Micro</strong> (chỉ người trong phòng) hoặc <strong>Âm thanh máy + Micro</strong> (họp lai). Micro của laptop hợp nhất với người nói gần, khoảng 1&nbsp;m, trong phòng yên tĩnh; phòng lớn nên dùng micro rời. Ở chế độ Âm thanh máy + Micro, người trong phòng nói chen đúng lúc người online đang nói có thể bị bỏ sót; đeo tai nghe cho kết quả tốt nhất. Khi bạn chọn nguồn có micro, app thu micro suốt phiên dịch, kể cả khi bạn đã tắt micro trong app họp; âm thanh chỉ nằm trong RAM, không ghi xuống đĩa, không gửi đi. Xem <a href="/tinh-nang/#micro">cách dùng</a>.</p>`,
      },
      {
        q: "App có hiện tên từng người nói không?",
        a: `<p>Có, trên macOS. Từ bản 0.3.2, phụ đề có thể cho mỗi giọng một màu và một nhãn (“Người 1”, “Người 2”), và khi bạn dịch một cuộc họp trong app Microsoft Teams cài trên máy, app có thể hiện <strong>tên từng người nói</strong>, đọc từ cửa sổ cuộc họp, khi đã đủ chắc; chưa chắc thì giữ nhãn chung. Tên từ Google Meet và Zoom, và Windows, chưa có. Hai người giống giọng có thể dùng chung một nhãn, và khi nhiều người nói chồng, nhãn có thể sai. Tính năng bật sẵn ở mọi gói và tắt được ở Cài đặt › Phụ đề › Người nói. <a href="/huong-dan/thanh-phu-de-va-phim-tat/#nguoi-noi">Cách hoạt động</a>.</p>`,
      },
      {
        q: "Gỡ cài đặt AI Translator như thế nào?",
        a: `<p>Trên macOS, bấm Cài đặt › Quyền riêng tư › Xóa model và dữ liệu trước, rồi kéo app vào Thùng rác (macOS không có bước hỏi khi gỡ). Trên Windows, gỡ ở Settings › Apps › Installed apps; bộ gỡ có ô xóa dữ liệu app để xóa cả model (xem <a href="/huong-dan/cai-dat-windows/#go-cai-dat">hướng dẫn</a>). Xóa dữ liệu hay gỡ app đều không làm mất bản quyền và hạn mức còn lại.</p>`,
      },
    ],
  },
  {
    id: "goi-va-thanh-toan",
    title: "Gói và thanh toán",
    items: [
      {
        q: "Gói Free có thật sự miễn phí không?",
        a: `<p>Free là gói dùng thử, không phải miễn phí vĩnh viễn: 10 ngày kể từ lần máy đăng ký dùng thử đầu tiên, mỗi ngày tối đa 30 phút dịch, mỗi máy một lần. Gỡ app rồi cài lại không mở lại 10 ngày. Hết dùng thử thì bạn cần mua Monthly (50.000 ₫, 50 giờ mỗi 30 ngày), 6 Months (269.000 ₫, 100 giờ mỗi 30 ngày, trong 180 ngày) hoặc Yearly (500.000 ₫, không giới hạn trong 365 ngày). Xem <a href="/bang-gia/">bảng giá</a>.</p>`,
      },
      {
        q: "Thời lượng dịch được tính thế nào?",
        a: `<p>Chỉ tính phần tiếng nói đã được dịch xong, theo độ dài tiếng nói. Thời gian im lặng, câu đã ở đúng ngôn ngữ bạn muốn đọc và đoạn chưa dịch được không bị tính. Hạn mức tính riêng cho từng máy; app nhắc khi còn dưới 5 phút. Tin nhắn dịch bằng Gõ dịch không tính vào thời lượng.</p>`,
      },
      {
        q: "Tôi trả tiền bằng cách nào? Trả bằng thẻ quốc tế được không?",
        a: `<p>Được. Có hai cách, chọn ở mục <strong>Cách thanh toán</strong> đầu màn hình Nâng cấp (không thấy mục này thì hãy cập nhật app lên bản mới nhất): <strong>chuyển khoản VietQR bằng VND</strong> (từ ngân hàng Việt Nam, qua cổng PayOS; mã QR vẽ ngay trong app, dùng được 15 phút) hoặc <strong>thẻ quốc tế bằng USD</strong> (trang thanh toán của Creem mở trong trình duyệt; Monthly 3,99 USD, 6 Months 21,99 USD, Yearly 39,99 USD, chưa gồm thuế). Creem là bên bán lại (merchant of record) của đơn trả bằng thẻ và xử lý thanh toán, thuế của khoản đó; điều khoản người mua của Creem: <a href="https://www.creem.io/buyer-terms" rel="noopener">https://www.creem.io/buyer-terms</a>. Khi cổng thanh toán xác nhận đã nhận tiền, app tự kích hoạt gói và key được gửi vào email của bạn. Với thẻ, hãy trả trong 30 phút kể từ lúc tạo đơn; nếu bạn đã trả mà app báo đơn không thành hay quá giờ hẹn, đừng trả lại: key vẫn gửi qua email (xem <a href="/huong-dan/mua-va-kich-hoat-key/#hoan-tien">sự cố thanh toán</a>).</p><p>Không có PayPal. Apple Pay hay Google Pay chỉ dùng được khi trang thanh toán của Creem hiện lựa chọn đó. Thẻ không nhận được ở một số nước, theo danh sách của Creem. Chưa có thanh toán định kỳ; với đơn VietQR chưa có hóa đơn điện tử, còn đơn thẻ có biên lai của Creem.</p>`,
      },
      {
        q: "Gói có tự gia hạn không? Hết hạn thì sao?",
        a: `<p>Không tự gia hạn: mỗi gói là một đơn trả trước, hết hạn thì dừng và bạn không bị trừ tiền thêm. App nhắc trước 7 ngày. Hết hạn thì máy quay về Free nếu còn trong 10 ngày dùng thử; hết dùng thử thì cần mua gói để dịch tiếp, và các tính năng Pro (lịch sử, từ điển, xuất file) bị khóa. Gia hạn cùng gói cộng thêm 30 ngày (Monthly), 180 ngày (6 Months) hoặc 365 ngày (Yearly).</p>`,
      },
      {
        q: "Có hoàn tiền không?",
        a: `<p>Đã thanh toán thì không hoàn lại, trừ khi lỗi do phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác. Hãy gửi yêu cầu cho chúng tôi trước, trong 7 ngày kể từ ngày thanh toán, tới support@aitranslator.vn kèm mã đơn. Đổi gói không được hoàn tiền. Với khoản trả bằng thẻ quốc tế, Creem là bên bán lại nên Creem cũng có thể hoàn tiền theo điều khoản của Creem. Khi một đơn được hoàn tiền (toàn bộ hay một phần, kể cả qua tranh chấp thẻ), chúng tôi có thể rút ngắn thời hạn mà đơn đó đã cộng vào license, hoặc thu hồi license nếu license chỉ gồm đơn đó; việc này không tự động: người vận hành quyết định theo từng trường hợp. Chi tiết trong <a href="/dieu-khoan/">Điều khoản sử dụng</a>.</p>`,
      },
      {
        q: "Tôi dùng được key trên mấy máy? Chuyển sang máy khác thế nào?",
        a: `<p>Mỗi key dùng trên một máy; cài lại app trên cùng máy không tính là máy mới. Để chuyển, ở máy cũ vào Cài đặt › Bản quyền › Gỡ kích hoạt máy này; hoặc ở máy mới nhập key rồi chọn “Gỡ máy kia và dùng máy này”.</p><p>Khi key đang dùng ở máy khác, máy thứ hai mặc định bị chặn; chỉ khi bạn chủ động chọn “Vẫn kích hoạt trên máy này” và xác nhận, key mới bị tạm khóa trên cả hai máy cho tới khi một máy gỡ key. Đổi máy quá nhiều trong 30 ngày thì key bị khóa tạm và bạn cần liên hệ hỗ trợ. Dùng thử Free tính theo máy nên không chuyển được. Xem <a href="/huong-dan/mua-va-kich-hoat-key/">hướng dẫn mua và kích hoạt key</a>.</p>`,
      },
      {
        q: "Tôi bị mất key thì làm sao?",
        a: `<p>Vào Cài đặt › Bản quyền › Mất key?, nhập email đã dùng khi mua rồi bấm Gửi lại key: mọi key còn hiệu lực của email đó được gửi vào chính email đó. Nếu vẫn không được, hãy gửi email tới support@aitranslator.vn từ email đã dùng khi mua.</p>`,
      },
    ],
  },
  {
    id: "dung-hang-ngay",
    title: "Dùng hằng ngày",
    items: [
      {
        q: "Thanh phụ đề có che màn hình họp không? Chỉnh được không?",
        a: `<p>Chỉnh được nhiều thứ. Thanh luôn nằm trên cùng và không lấy focus của app họp. Bạn kéo để di chuyển, kéo cạnh để đổi kích thước, chọn cỡ chữ 14 đến 48 px, màu chữ, màu nền và độ mờ nền. Bật Khóa để chuột xuyên qua thanh; ẩn nhanh bằng phím tắt (vẫn dịch), hoặc bấm nút ✕ khi rê chuột vào để tắt phụ đề và dừng dịch luôn. Xem <a href="/huong-dan/thanh-phu-de-va-phim-tat/">hướng dẫn thanh phụ đề và phím tắt</a>.</p>`,
      },
      {
        q: "Phím tắt mặc định là gì?",
        a: `<p>Trên macOS: ⌃⌥T bắt đầu hoặc dừng dịch, ⌃⌥H hiện hoặc ẩn phụ đề, ⌃⌥L khóa hoặc mở khóa, ⌃⌥PageUp và ⌃⌥PageDown cuộn xem câu cũ và mới (⌃ là Control, ⌥ là Option). Trên Windows là Ctrl+Alt cùng các phím T, H, L, PageUp, PageDown. ⌃⌥G (Ctrl+Alt+G) mở ô soạn Gõ dịch. Bạn đổi được ở Cài đặt › Phím tắt, nên nếu trùng phím của app khác thì cứ đổi.</p>`,
      },
      {
        q: "Gõ dịch là gì? Chữ tôi gõ có bị gửi đi đâu không?",
        a: `<p>Gõ dịch giúp bạn nhắn tin bằng tiếng của người bên kia ở ô chat đang dùng: bấm ⌃⌥G (Ctrl+Alt+G), gõ bằng tiếng của bạn, bấm Enter để dán bản dịch vào ô chat, rồi Enter lần nữa để gửi. Chữ bạn gõ và bản dịch được xử lý trên máy bạn, không gửi qua mạng, không ghi xuống đĩa; app chỉ chép bản dịch vào clipboard để dán. Gõ dịch có ở mọi gói còn hiệu lực và không trừ thời lượng dịch. Xem <a href="/huong-dan/go-dich/">hướng dẫn Gõ dịch</a>.</p>`,
      },
      {
        q: "Bấm X trên cửa sổ có tắt app không?",
        a: `<p>Không. Bấm X chỉ ẩn cửa sổ xuống thanh menu (macOS) hoặc khay hệ thống (Windows); phím tắt và phiên đang dịch vẫn chạy. Muốn thoát hẳn, chọn Thoát ở biểu tượng trên thanh menu hoặc khay. Trên Mac, ⌘Q cũng không thoát app.</p>`,
      },
      {
        q: "App có tự cập nhật không?",
        a: `<p>Có, qua kênh Ổn định hoặc Beta (Cài đặt › Chung › Kênh cập nhật). App kiểm tra khi khởi động và mỗi 24 giờ, kiểm chữ ký trước khi ghi file rồi mời bạn khởi động lại khi app rảnh. Muốn kiểm ngay, bấm <strong>Kiểm tra cập nhật</strong> ở khối đầu trang Cài đặt › Chung, cạnh dòng “Phiên bản …” (mỗi lần kiểm xong app ghi “Kiểm tra lúc HH:MM:SS”), hoặc chọn “Kiểm tra cập nhật…” ở menu của biểu tượng app. Bản Windows cũng có hai kênh này; bạn có thể chạy lại lệnh cài để cập nhật. Trên macOS bản ký ad-hoc, mỗi lần cập nhật macOS hỏi lại 1 hộp thoại Keychain và có thể hỏi lại quyền ghi âm; app báo trước.</p>`,
      },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

// Chữ thuần cho schema: bỏ thẻ, giải mã thực thể cơ bản.
const toText = (html) =>
  html
    .replace(/<\/p>\s*<p>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

export default {
  id: "faq",
  lang: "vi",
  path: "/cau-hoi-thuong-gap/",
  title: "Câu hỏi thường gặp về AI Translator",
  description:
    "Giải đáp ngắn gọn về AI Translator: dùng với Zoom, Teams, Meet, ngôn ngữ, chạy offline, quyền riêng tư, yêu cầu máy, các gói, thanh toán và việc dùng hằng ngày.",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  schema: [faqPage(ALL.map((f) => ({ q: f.q, a: toText(f.a) })))],
  llm: "Các câu hỏi thường gặp: tổng quan, ngôn ngữ và chất lượng, riêng tư và dữ liệu, cài đặt và yêu cầu máy, gói và thanh toán, dùng hằng ngày.",
  llmTitle: "Câu hỏi thường gặp về AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Câu hỏi thường gặp về AI Translator",
  lead: "Những câu hỏi thường đặt ra khi tìm hiểu AI Translator, từ cách dùng với Zoom, Teams, Meet đến quyền riêng tư, yêu cầu máy và thanh toán. Mỗi câu trả lời mở đầu bằng đáp án ngắn, phần còn lại là chi tiết và điều kiện.",
  meta: `<span>${ALL.length} câu hỏi trong ${GROUPS.length} nhóm</span><span>Cập nhật {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc: GROUPS.map((g) => ({ level: 2, id: g.id, text: g.title })),
  tocTitle: "Các nhóm câu hỏi",
  body: `<p>Chọn một nhóm trong mục lục, hoặc cuộn xuống và mở từng câu hỏi.</p>
${GROUPS.map((g) => `<h2 id="${g.id}">${g.title}</h2>\n${faq(g.items)}`).join("\n")}
${callout({ title: "Chưa thấy câu trả lời?", text: `Hãy gửi email tới <a href="mailto:support@aitranslator.vn">support@aitranslator.vn</a> hoặc xem <a href="/lien-he/">trang Liên hệ</a> để biết nên kèm thông tin gì.` })}`,
})}
</div></section>

${ctaBand({ title: "Còn thắc mắc? Hãy hỏi chúng tôi", text: "Gửi một email ngắn cho chúng tôi. Hoặc tải app và tự thử trên cuộc họp của bạn.", primary: { href: "/lien-he/", label: "Liên hệ và hỗ trợ" }, secondary: { href: "/tai-xuong/", label: "Tải xuống" } })}
`,
};
