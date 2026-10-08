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
        a: `<p>AI Translator là ứng dụng desktop hiện phụ đề dịch trực tiếp cho âm thanh đang phát trên máy tính, như cuộc họp, webinar hoặc video. App nhận dạng giọng nói và dịch ngay trên máy bạn, rồi hiện bản dịch thành một thanh phụ đề nổi. Xem <a href="/tinh-nang/">đầy đủ tính năng</a>.</p>`,
      },
      {
        q: "Dùng được với Zoom, Teams, Google Meet, Zalo không?",
        a: `<p>Được. App thu âm thanh hệ thống nên chạy với mọi ứng dụng phát tiếng, không cần cấu hình riêng cho từng app họp: bạn chỉ cần bấm Bắt đầu. Trên macOS bạn có thể chọn chỉ nghe một app (Cài đặt › Âm thanh) để không dịch tiếng thông báo.</p><p>Chúng tôi đã thử trên macOS 26 với Zoom, Google Meet (Chrome, Safari, Edge), Microsoft Teams và Zalo PC; chưa thử trên mọi phiên bản macOS và mọi app. Các tên này chỉ để nói về khả năng tương thích, AI Translator không liên kết với họ. Xem <a href="/giai-phap/dich-hop-truc-tuyen/">giải pháp cho họp trực tuyến</a>.</p>`,
      },
      {
        q: "Có cần bot, plugin hay tài khoản không?",
        a: `<p>Không cần cả ba. Không có bot tham gia cuộc họp, không cài plugin vào app họp và không có đăng nhập. Gói Free chỉ cần bạn đồng ý điều khoản; gói trả phí được kích hoạt bằng license key gửi qua email.</p>`,
      },
      {
        q: "Tôi tải AI Translator ở đâu? Có bản Windows chưa?",
        a: `<p>Chưa có tải công khai. AI Translator đang ở giai đoạn beta: bạn đăng ký nhận bản cài cho macOS (14.2 trở lên, Apple Silicon) bằng email tại trang <a href="/tai-xuong/">Tải xuống</a>. Bản Windows 10/11 sắp có nhưng chưa có ngày phát hành.</p>`,
      },
      {
        q: "AI Translator có phải là mã nguồn mở không?",
        a: `<p>Không. AI Translator là sản phẩm thương mại, dùng theo giấy phép trong <a href="/dieu-khoan/">Điều khoản sử dụng</a>. Nó dùng nhiều thành phần mã nguồn mở của bên thứ ba như Whisper, whisper.cpp, llama.cpp, Hy-MT2 và Tauri. Danh sách giấy phép đầy đủ nằm trong app (Giới thiệu › Giấy phép mã nguồn mở), phần tóm tắt ở trang <a href="/ve-chung-toi/#cong-nghe">Về AI Translator</a>.</p>`,
      },
    ],
  },
  {
    id: "ngon-ngu-va-chat-luong",
    title: "Ngôn ngữ và chất lượng",
    items: [
      {
        q: "AI Translator hỗ trợ những ngôn ngữ nào?",
        a: `<p>Năm ngôn ngữ, cho cả âm thanh nguồn và bản dịch: English, 中文 (Trung), 日本語 (Nhật), 한국어 (Hàn) và Tiếng Việt. Giao diện app có tiếng Việt và English.</p><p>App tự nhận diện ngôn ngữ đang nói trong các ngôn ngữ bạn chọn, hoặc bạn khóa một ngôn ngữ cho chắc. Chất lượng dịch đã được đo cho tám chiều có tiếng Việt (Anh, Trung, Nhật, Hàn sang Việt, và Việt sang Anh, Trung, Nhật, Hàn). Các chiều không có tiếng Việt vẫn chạy được nhưng chúng tôi chưa đo điểm chất lượng.</p>`,
      },
      {
        q: "Dịch theo chiều nào? Có dịch giọng của tôi cho người khác không?",
        a: `<p>Một chiều: từ âm thanh đang phát trên máy sang ngôn ngữ của bạn. Hiện app chưa dịch giọng của bạn để phát vào cuộc họp. Nếu cả hai bên cùng cài app, mỗi bên sẽ thấy phụ đề của phía kia.</p>`,
      },
      {
        q: "Bản dịch có chính xác không?",
        a: `<p>Chưa hoàn hảo: bản dịch có thể sai, thiếu hoặc không hợp ngữ cảnh, nhất là với thuật ngữ chuyên ngành, tên riêng và tiếng nói không rõ. Đừng dựa vào nó cho quyết định quan trọng.</p><p>Từ điển thuật ngữ (tính năng Pro) giúp bộ dịch dùng đúng tên riêng và thuật ngữ, nhưng không bảo đảm mọi lần. Chúng tôi không đưa ra tỉ lệ chính xác chung vì chưa đo trên hội thoại họp thật; số đo hiện có kèm điều kiện nằm ở trang <a href="/tinh-nang/#hieu-nang">Tính năng</a>.</p>`,
      },
      {
        q: "Gói model Chuẩn và gói Nhẹ khác nhau thế nào?",
        a: `<p>Gói Chuẩn (khoảng 2,5 GB) nhận dạng giọng nói tốt hơn, nhất là tiếng Việt, Nhật, Hàn, Trung. Gói Nhẹ (khoảng 1,3 GB) nhỏ hơn, hợp máy 8 GB. App đề xuất gói theo RAM và card đồ họa của máy bạn.</p><p>Trên bộ clip đọc chuẩn, tỉ lệ lỗi từ của tiếng Việt là 8,7% ở gói Chuẩn và 22,5% ở gói Nhẹ (Mac M4 Pro, câu đọc chứ chưa phải hội thoại họp thật). Nếu bạn nghe nhiều các ngôn ngữ này, hãy dùng gói Chuẩn.</p>`,
      },
      {
        q: "Độ trễ của phụ đề là bao nhiêu?",
        a: `<p>Trên Mac M4 Pro, độ trễ trung vị dưới khoảng 1,1 giây kể từ lúc người nói dừng câu tới khi hiện đủ bản dịch; chữ dịch đầu tiên hiện sau khoảng 0,5 đến 0,7 giây. Đây là số đo trên một máy cụ thể.</p><p>Chúng tôi chưa đo Mac M1, máy 8 GB hay card đồ họa rời của Windows. Thử sơ bộ trên một laptop Windows có GPU tích hợp cho thấy gói Chuẩn chưa đạt mục tiêu độ trễ. Chi tiết và điều kiện đo ở trang <a href="/tinh-nang/#hieu-nang">Tính năng</a>.</p>`,
      },
    ],
  },
  {
    id: "rieng-tu-va-du-lieu",
    title: "Riêng tư và dữ liệu",
    items: [
      {
        q: "AI Translator có chạy offline được không?",
        a: `<p>Có: nhận dạng giọng nói và dịch chạy 100% trên máy, không cần mạng sau khi đã tải model. Bạn vẫn cần mạng thỉnh thoảng cho vài việc: tải model lần đầu (khoảng 1,3 GB hoặc 2,5 GB), đăng ký dùng thử Free lần đầu, mua gói, kiểm tra bản quyền (gói trả phí dùng offline tối đa 14 ngày giữa hai lần kiểm tra) và cập nhật app. Xem <a href="/so-sanh/dich-offline-va-cloud/">so sánh dịch offline và dịch cloud</a>.</p>`,
      },
      {
        q: "Âm thanh cuộc họp của tôi có bị gửi đi đâu không?",
        a: `<p>Không. Âm thanh chỉ nằm trong RAM, không ghi đĩa và không gửi qua mạng. Chúng tôi đã kiểm bằng proxy và nettop trên macOS: trong lúc dịch, app không gửi âm thanh hay chữ chép lời ra ngoài. Windows chưa được đo. Chi tiết ở <a href="/bao-mat-du-lieu/">Dữ liệu và bảo mật</a>.</p>`,
      },
      {
        q: "Có quảng cáo hay thu thập dữ liệu không?",
        a: `<p>Không có quảng cáo, không có analytics, và app không tự gửi báo cáo lỗi. Máy chủ chỉ lưu email (khi bạn mua), đơn hàng, license, mã băm ID máy và mốc dùng thử Free, để cấp key và bảo đảm mỗi key một máy, mỗi máy dùng thử một lần. Chúng tôi không bán hay chia sẻ dữ liệu cho mục đích quảng cáo.</p>`,
      },
      {
        q: "Bản chép lời có được lưu lại không?",
        a: `<p>Mặc định thì không lưu. Bản chép lời của phiên đang chạy nằm trong bộ nhớ; bạn xem, tìm và sao chép được ở mọi gói. Lưu lịch sử (mã hóa, chỉ trên máy bạn) và xuất ra TXT, SRT, Markdown là tính năng Pro. Xem <a href="/huong-dan/lich-su-va-xuat-file/">hướng dẫn lịch sử và xuất file</a>.</p>`,
      },
      {
        q: "Tôi có cần báo cho người cùng họp không? Dùng thế này có hợp pháp không?",
        a: `<p>Chúng tôi không đưa ra tư vấn pháp lý. Điều chúng tôi nói được: AI Translator không ghi âm cuộc họp xuống đĩa, chỉ hiện phụ đề dịch và (tùy chọn) lưu bản chép lời.</p><p>Nếu pháp luật hoặc quy định công ty của bạn yêu cầu, bạn tự chịu trách nhiệm thông báo cho người cùng họp là bạn dùng công cụ dịch. App nhắc điều này ở bước cài đặt đầu tiên, và <a href="/dieu-khoan/">Điều khoản sử dụng</a> ghi rõ.</p>`,
      },
      {
        q: "Làm sao để xóa dữ liệu của tôi?",
        a: `<p>Trên máy: Cài đặt › Quyền riêng tư › Xóa toàn bộ dữ liệu (lịch sử và từ điển), hoặc Xóa model và dữ liệu. Trên máy chủ: gửi email tới support@aitranslator.io.vn từ chính email đã dùng khi mua để yêu cầu xóa hoặc ẩn danh. Chúng tôi bỏ email và tên máy của bạn, và vẫn giữ mã băm ID máy, thời điểm đồng ý và dòng đơn hàng mức kế toán. Xem <a href="/bao-mat-du-lieu/#xoa-du-lieu">cách yêu cầu xóa dữ liệu</a>.</p>`,
      },
    ],
  },
  {
    id: "cai-dat-va-yeu-cau-may",
    title: "Cài đặt và yêu cầu máy",
    items: [
      {
        q: "Máy của tôi có chạy được AI Translator không?",
        a: `<p>Bản beta chạy trên Mac Apple Silicon (M1 trở lên) với macOS 14.2 trở lên; RAM tối thiểu 8 GB, khuyến nghị 16 GB. Chưa hỗ trợ Mac Intel. Windows 10/11 64-bit (CPU có AVX2) sắp có; chưa hỗ trợ Windows ARM64.</p><p>Máy dưới 8 GB RAM hoặc không đạt yêu cầu thì app báo lý do và không cho tải model. Riêng Mac M1 cơ bản, chúng tôi chưa có số đo.</p>`,
      },
      {
        q: "AI Translator tốn bao nhiêu RAM và ổ đĩa?",
        a: `<p>Model chiếm khoảng 2,5 GB ổ đĩa (gói Chuẩn) hoặc 1,3 GB (gói Nhẹ), và cần trống thêm 1 GB khi tải. Trên Mac M4 Pro, hai tiến trình engine dùng khoảng 2,9 GiB RAM (Chuẩn) hoặc 1,8 đến 1,9 GiB (Nhẹ), cộng ước chừng 0,3 GB cho app. Hai engine tự tắt sau 10 phút không dịch để app nằm ở thanh menu không chiếm RAM. Chúng tôi chưa đo trên máy khác.</p>`,
      },
      {
        q: "Vì sao macOS báo không xác minh được nhà phát triển?",
        a: `<p>Vì bản macOS hiện được ký ad-hoc và chưa notarize: chúng tôi chưa có Apple Developer ID. macOS vì vậy chặn lần mở đầu. Bạn vào System Settings › Privacy &amp; Security, kéo xuống cuối, bấm Open Anyway cạnh tên AI Translator rồi xác nhận bằng mật khẩu hoặc Touch ID. Từ macOS 15, mẹo bấm chuột phải rồi chọn Open không còn dùng được. Xem <a href="/huong-dan/cai-dat-macos/">hướng dẫn cài đặt trên macOS</a>.</p>`,
      },
      {
        q: "Cần cấp quyền gì trên macOS?",
        a: `<p>Chỉ quyền Ghi âm thanh hệ thống (System Audio Recording); AI Translator không dùng micro. macOS hỏi ở lần đầu bạn bấm Bắt đầu. Nếu bạn từ chối, macOS không báo lỗi mà chỉ cho app nhận im lặng; app sẽ nhắc bạn bật lại. Xem <a href="/huong-dan/cap-quyen-thu-am-macos/">hướng dẫn cấp quyền thu âm</a>.</p>`,
      },
      {
        q: "Gỡ cài đặt AI Translator như thế nào?",
        a: `<p>Trên macOS, bấm Cài đặt › Quyền riêng tư › Xóa model và dữ liệu trước, rồi kéo app vào Thùng rác (macOS không có bước hỏi khi gỡ). Trên Windows, khi phát hành, bộ gỡ có ô “xóa dữ liệu app” để xóa cả model. Xóa dữ liệu hay gỡ app đều không làm mất bản quyền và hạn mức còn lại.</p>`,
      },
    ],
  },
  {
    id: "goi-va-thanh-toan",
    title: "Gói và thanh toán",
    items: [
      {
        q: "Gói Free có thật sự miễn phí không?",
        a: `<p>Free là gói dùng thử, không phải miễn phí vĩnh viễn: 10 ngày kể từ lần máy đăng ký dùng thử đầu tiên, mỗi ngày tối đa 30 phút dịch, mỗi máy một lần. Gỡ app rồi cài lại không mở lại 10 ngày. Hết dùng thử thì bạn cần mua Monthly (50.000 ₫, 50 giờ mỗi 30 ngày) hoặc Yearly (500.000 ₫, không giới hạn trong 365 ngày). Xem <a href="/bang-gia/">bảng giá</a>.</p>`,
      },
      {
        q: "Thời lượng dịch được tính thế nào?",
        a: `<p>Chỉ tính phần tiếng nói đã được dịch xong, theo độ dài tiếng nói. Thời gian im lặng, câu đã ở đúng ngôn ngữ bạn muốn đọc và đoạn chưa dịch được không bị tính. Hạn mức tính riêng cho từng máy; app nhắc khi còn dưới 5 phút.</p>`,
      },
      {
        q: "Tôi trả tiền bằng cách nào? Có Visa hoặc PayPal không?",
        a: `<p>Chưa có Visa hay PayPal. Hiện chỉ nhận chuyển khoản từ ngân hàng Việt Nam bằng VND qua VietQR (cổng PayOS). App vẽ mã QR ngay trong màn hình Nâng cấp, mã dùng được trong 15 phút; khi PayOS xác nhận đã nhận tiền, app tự kích hoạt gói và key được gửi vào email của bạn. Chưa có thanh toán định kỳ và chưa có hóa đơn điện tử.</p>`,
      },
      {
        q: "Gói có tự gia hạn không? Hết hạn thì sao?",
        a: `<p>Không tự gia hạn: mỗi gói là một đơn trả trước, hết hạn thì dừng và bạn không bị trừ tiền thêm. App nhắc trước 7 ngày. Hết hạn thì máy quay về Free nếu còn trong 10 ngày dùng thử; hết dùng thử thì cần mua gói để dịch tiếp, và các tính năng Pro (lịch sử, từ điển, xuất file) bị khóa. Gia hạn cùng gói cộng thêm 30 ngày (Monthly) hoặc 365 ngày (Yearly).</p>`,
      },
      {
        q: "Có hoàn tiền không?",
        a: `<p>Đã thanh toán thì không hoàn lại, trừ khi lỗi do phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác. Hãy gửi yêu cầu trong 7 ngày kể từ ngày thanh toán tới support@aitranslator.io.vn kèm mã đơn. Đổi gói không được hoàn tiền. Chi tiết trong <a href="/dieu-khoan/">Điều khoản sử dụng</a>.</p>`,
      },
      {
        q: "Tôi dùng được key trên mấy máy? Chuyển sang máy khác thế nào?",
        a: `<p>Mỗi key dùng trên một máy; cài lại app trên cùng máy không tính là máy mới. Để chuyển, ở máy cũ vào Cài đặt › Bản quyền › Gỡ kích hoạt máy này; hoặc ở máy mới nhập key rồi chọn “Gỡ máy kia và dùng máy này”.</p><p>Nếu hai máy cùng kích hoạt, key bị tạm khóa trên cả hai cho tới khi một máy gỡ key. Đổi máy quá nhiều trong 30 ngày thì key bị khóa tạm và bạn cần liên hệ hỗ trợ. Dùng thử Free tính theo máy nên không chuyển được. Xem <a href="/huong-dan/mua-va-kich-hoat-key/">hướng dẫn mua và kích hoạt key</a>.</p>`,
      },
      {
        q: "Tôi bị mất key thì làm sao?",
        a: `<p>Vào Cài đặt › Bản quyền › Mất key?, nhập email đã dùng khi mua rồi bấm Gửi lại key: mọi key còn hiệu lực của email đó được gửi vào chính email đó. Nếu vẫn không được, hãy gửi email tới support@aitranslator.io.vn từ email đã dùng khi mua.</p>`,
      },
    ],
  },
  {
    id: "dung-hang-ngay",
    title: "Dùng hằng ngày",
    items: [
      {
        q: "Thanh phụ đề có che màn hình họp không? Chỉnh được không?",
        a: `<p>Chỉnh được hoàn toàn. Thanh luôn nằm trên cùng và không lấy focus của app họp. Bạn kéo để di chuyển, kéo cạnh để đổi kích thước, chọn cỡ chữ 14 đến 48 px, màu chữ, màu nền và độ mờ nền. Bật Khóa để chuột xuyên qua thanh; ẩn nhanh bằng phím tắt hoặc nút ✕ khi rê chuột vào. Xem <a href="/huong-dan/thanh-phu-de-va-phim-tat/">hướng dẫn thanh phụ đề và phím tắt</a>.</p>`,
      },
      {
        q: "Phím tắt mặc định là gì?",
        a: `<p>Trên macOS: ⌃⌥T bắt đầu hoặc dừng dịch, ⌃⌥H hiện hoặc ẩn phụ đề, ⌃⌥L khóa hoặc mở khóa, ⌃⌥PageUp và ⌃⌥PageDown cuộn xem câu cũ và mới (⌃ là Control, ⌥ là Option). Trên Windows là Ctrl+Alt cùng các phím T, H, L, PageUp, PageDown. Bạn đổi được ở Cài đặt › Phím tắt, nên nếu trùng phím của app khác thì cứ đổi.</p>`,
      },
      {
        q: "Bấm X trên cửa sổ có tắt app không?",
        a: `<p>Không. Bấm X chỉ ẩn cửa sổ xuống thanh menu (macOS) hoặc khay hệ thống (Windows); phím tắt và phiên đang dịch vẫn chạy. Muốn thoát hẳn, chọn Thoát ở biểu tượng trên thanh menu hoặc khay. Trên Mac, ⌘Q cũng không thoát app.</p>`,
      },
      {
        q: "App có tự cập nhật không?",
        a: `<p>Có, qua kênh Ổn định hoặc Beta (Cài đặt › Chung › Kênh cập nhật). App kiểm tra khi khởi động và mỗi 24 giờ, kiểm chữ ký trước khi ghi file rồi mời bạn khởi động lại khi app rảnh. Bản cài thử gửi qua email lúc đầu có thể chưa tự cập nhật. Trên macOS bản ký ad-hoc, mỗi lần cập nhật macOS hỏi lại Keychain và quyền ghi âm; app báo trước.</p>`,
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
  modified: "2026-10-08",
  schema: [faqPage(ALL.map((f) => ({ q: f.q, a: toText(f.a) })))],
  llm: "Các câu hỏi thường gặp: tổng quan, ngôn ngữ và chất lượng, riêng tư và dữ liệu, cài đặt và yêu cầu máy, gói và thanh toán, dùng hằng ngày.",
  llmTitle: "Câu hỏi thường gặp về AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Câu hỏi thường gặp về AI Translator",
  lead: "Đây là những câu hỏi chúng tôi nhận nhiều nhất, từ cách dùng với Zoom, Teams, Meet đến quyền riêng tư, yêu cầu máy và thanh toán. Mỗi câu trả lời mở đầu bằng đáp án ngắn, phần còn lại là chi tiết và điều kiện.",
  meta: `<span>${ALL.length} câu hỏi trong ${GROUPS.length} nhóm</span><span>Cập nhật 08/10/2026</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc: GROUPS.map((g) => ({ level: 2, id: g.id, text: g.title })),
  tocTitle: "Các nhóm câu hỏi",
  body: `<p>Chọn một nhóm trong mục lục, hoặc cuộn xuống và mở từng câu hỏi.</p>
${GROUPS.map((g) => `<h2 id="${g.id}">${g.title}</h2>\n${faq(g.items)}`).join("\n")}
${callout({ title: "Chưa thấy câu trả lời?", text: `Hãy gửi email tới <a href="mailto:support@aitranslator.io.vn">support@aitranslator.io.vn</a> hoặc xem <a href="/lien-he/">trang Liên hệ</a> để biết nên kèm thông tin gì. Chúng tôi đọc mọi thư.` })}`,
})}
</div></section>

${ctaBand({ title: "Còn thắc mắc? Hãy hỏi chúng tôi", text: "Gửi một email ngắn, chúng tôi đọc mọi thư. Hoặc nhận bản beta và tự thử trên cuộc họp của bạn.", primary: { href: "/lien-he/", label: "Liên hệ và hỗ trợ" }, secondary: { href: "/tai-xuong/", label: "Nhận bản beta" } })}
`,
};
