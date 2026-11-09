import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Giải pháp", path: "/giai-phap/" },
  { name: "Dịch YouTube", path: "/giai-phap/dich-youtube/" },
];

const FAQ = [
  {
    q: "Dịch video YouTube sang tiếng Việt bằng cách nào?",
    a: `<p>Bạn chỉ cần cài AI Translator trên máy tính, mở video YouTube bằng trình duyệt bất kỳ (Chrome, Safari, Edge, Firefox), chọn tiếng Việt ở ô <em>Dịch sang</em> rồi bấm <strong>Bắt đầu</strong>. Ứng dụng nghe âm thanh đang phát trên máy và tự động dịch thành phụ đề tiếng Việt hiển thị trên một thanh nổi, không phụ thuộc vào việc video gốc đã có sẵn phụ đề hay chưa.</p>`,
  },
  {
    q: "AI Translator có dịch được YouTube Live (trực tiếp) không?",
    a: `<p>Có. Vì ứng dụng thu âm thanh trực tiếp phát ra từ máy tính nên các buổi phát sóng trực tiếp (YouTube Live) đều dịch được như video thường. Chúng tôi đã thử nghiệm với video phát trong trình duyệt và thử một lần với YouTube Live (kênh tin tức tiếng Anh, Chrome trên macOS, 25/10/2026): phụ đề tiếng Việt hiện liên tục suốt khoảng 4 phút xem với độ trễ thấp.</p>`,
  },
  {
    q: "Có dùng được trên ứng dụng YouTube điện thoại không?",
    a: `<p>Không. AI Translator chỉ chạy trên máy tính macOS (Apple Silicon) và Windows 10/11 x64, không có phiên bản cho điện thoại hay máy tính bảng. Để dịch phụ đề, bạn hãy mở YouTube trên trình duyệt của máy tính.</p>`,
  },
  {
    q: "Có cần cài tiện ích (extension) vào trình duyệt không?",
    a: `<p>Không. Bạn không cần cài bất kỳ tiện ích mở rộng hay plugin nào vào trình duyệt, và ứng dụng cũng không cần kết nối tài khoản YouTube của bạn. AI Translator hoạt động độc lập và thu âm thanh hệ thống an toàn ngay trên máy tính.</p>`,
  },
  {
    q: "Dịch YouTube bằng AI Translator có miễn phí không?",
    a: `<p>Gói Free cho phép bạn dùng thử miễn phí trong 10 ngày với tối đa 30 phút dịch mỗi ngày (cần đăng nhập tài khoản Google, không cần thẻ tín dụng). Sau thời gian dùng thử, bạn có thể chọn các gói trả trước linh hoạt (Monthly, 6 Months hoặc Yearly) theo nhu cầu sử dụng tại <a href="/bang-gia/">bảng giá</a>.</p>`,
  },
];

export default {
  id: "solutions-youtube",
  lang: "vi",
  path: "/giai-phap/dich-youtube/",
  title: "Dịch YouTube ra tiếng Việt: phụ đề video & live",
  description:
    "Dịch video và livestream YouTube sang tiếng Việt trực tiếp trên máy tính. Phụ đề nổi, AI chạy offline, không cần tiện ích mở rộng. Dùng thử Free 10 ngày.",
  type: "article",
  published: "2026-11-09",
  breadcrumbs: crumbs,
  modified: "2026-11-09",
  llm: "Cách dịch YouTube ra tiếng Việt bằng phụ đề trực tiếp khi xem video và YouTube Live trên máy tính: bốn bước sử dụng, so sánh với phụ đề mặc định của YouTube, mẹo xem phiên dài, giới hạn trung thực (không chạy trên điện thoại, không tải video, không lồng tiếng) và hỏi đáp thường gặp.",
  llmTitle: "Dịch YouTube ra tiếng Việt bằng phụ đề trực tiếp",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "Dịch YouTube ra tiếng Việt bằng phụ đề trực tiếp",
  lead: "Xem video bài giảng, công nghệ hay theo dõi YouTube Live nước ngoài nhưng video không có sẵn phụ đề tiếng Việt? AI Translator dịch YouTube trực tiếp từ âm thanh đang phát trên trình duyệt máy tính thành phụ đề tiếng Việt trên một thanh nổi. Ứng dụng chạy offline ngay trên máy tính của bạn, không cần tiện ích mở rộng, giữ trọn quyền riêng tư và hiển thị song ngữ trực quan.",
  meta: "<span>Cập nhật {{updated}}</span><span>Chạy trên máy tính macOS và Windows, không chạy trên điện thoại</span>",
})}

<section class="section-tight"><div class="container narrow">
${callout({ kind: "warn", title: "Trước khi dùng: chỉ hỗ trợ trên máy tính.", text: "AI Translator là ứng dụng máy tính dành cho macOS và Windows, không chạy trên điện thoại. Hãy mở video hoặc livestream YouTube trong trình duyệt trên máy tính để đọc phụ đề tiếng Việt." })}
</div></section>

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["Dùng với", "Video và YouTube Live trong trình duyệt máy tính<small>Chrome, Safari, Edge, Firefox và mọi trình phát âm thanh trên máy</small>"],
  ["Ngôn ngữ", "Tiếng Anh, tiếng Trung, tiếng Nhật, tiếng Hàn sang tiếng Việt<small>Cả bốn chiều dịch đều đã được đo kiểm chất lượng dịch độc lập</small>"],
  ["Độ trễ", "Trung vị 0,76–1,03 giây<small>Sau khi người nói dừng câu; đo trên Mac M4 Pro với gói model Chuẩn</small>"],
  ["Hoạt động", "AI xử lý offline ngay trên máy tính<small>Âm thanh không gửi ra ngoài, không cần cài tiện ích mở rộng</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Trường hợp sử dụng", title: "Khi video YouTube không có sẵn phụ đề tiếng Việt", center: true })}
<div class="grid grid-3">
${feature({ icon: "book", title: "Video bài giảng & khóa học", text: "Khóa học lập trình, kỹ thuật, khoa học và bài giảng đại học bằng tiếng Anh, Nhật, Trung, Hàn mà người đăng chưa dịch sang tiếng Việt." })}
${feature({ icon: "users", title: "Tin tức quốc tế & podcast", text: "Theo dõi các bản tin thời sự quốc tế, phỏng vấn chuyên gia, podcast công nghệ nhiều giờ liền mà không sợ lỡ ý." })}
${feature({ icon: "play", title: "YouTube Live phát trực tiếp", text: "Hiểu ngay diễn biến các sự kiện trực tiếp, ra mắt sản phẩm công nghệ hoặc buổi giao lưu phát sóng trên YouTube Live." })}
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "So sánh", title: "Khác gì so với tính năng tạo phụ đề sẵn có của YouTube?" })}
<p>YouTube có tính năng phụ đề tự động, nhưng nhiều video ngoại ngữ chưa hỗ trợ dịch sang tiếng Việt, hoặc bản dịch tự động của nền tảng bị ngắt quãng, thiếu ngữ cảnh và đặc biệt hiếm khi hoạt động mượt mà trên các luồng livestream phát trực tiếp. Dịch YouTube bằng AI Translator mang lại nhiều lợi thế rõ rệt:</p>
${checkList([
  "<strong>Hoạt động với mọi video:</strong> Dịch trực tiếp từ luồng âm thanh máy tính phát ra, không phụ thuộc vào việc chủ kênh đã bật phụ đề hay YouTube đã tạo phụ đề tự động hay chưa.",
  "<strong>Hỗ trợ cả YouTube Live:</strong> Dịch ngay khi sự kiện đang phát sóng, điều mà tính năng phụ đề tự động của YouTube thường tắt hoặc có độ trễ rất lớn.",
  "<strong>Thanh phụ đề nổi linh hoạt:</strong> Đặt thanh phụ đề ở bất kỳ vị trí nào trên màn hình, chỉnh kích thước chữ từ 14 đến 48 px, đổi màu chữ và màu nền theo ý muốn.",
  "<strong>Đọc song ngữ trực quan:</strong> Hiện câu gốc chữ nhỏ phía trên bản dịch tiếng Việt chữ lớn, giúp bạn dễ dàng đối chiếu thuật ngữ và trau dồi ngoại ngữ.",
])}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Bắt đầu", title: "Bốn bước để dịch YouTube có phụ đề tiếng Việt" })}
${steps([
  { title: "Cài và mở AI Translator", text: "Dán lệnh cài ở trang <a href=\"/tai-xuong/\">Tải xuống</a> vào Terminal (macOS) hoặc PowerShell (Windows). Ở ô <em>Dịch sang</em>, chọn tiếng Việt." },
  { title: "Mở video hoặc livestream YouTube", text: "Mở video bài giảng hoặc buổi phát sóng trực tiếp trên YouTube bằng trình duyệt bất kỳ của máy tính (Chrome, Edge, Safari, Firefox) và cho phát tiếng bình thường." },
  { title: "Bấm Bắt đầu", text: "Bấm <strong>Bắt đầu</strong> (phím tắt ⌃⌥T, Windows: Ctrl+Alt+T). Trên macOS, cấp quyền <em>Ghi âm thanh hệ thống</em> ở lần đầu (xem <a href=\"/huong-dan/cap-quyen-thu-am-macos/\">hướng dẫn cấp quyền</a>). App nạp model trong vài giây đầu." },
  { title: "Đặt thanh phụ đề dưới khung phát", text: "Kéo thanh phụ đề đặt sát dưới khung video YouTube, chỉnh cỡ chữ trong Cài đặt › Phụ đề và bấm <em>Khóa (click xuyên qua)</em> để thao tác chuột không bị vướng." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Mẹo hay", title: "Mẹo xem video YouTube và YouTube Live dễ dàng hơn" })}
${checkList([
  "<strong>Chỉ nghe trình duyệt (macOS):</strong> Để âm thanh thông báo hệ thống không bị dịch nhầm, hãy vào Cài đặt › Âm thanh, chọn nguồn <em>Chỉ Google Chrome</em> (hoặc trình duyệt bạn đang dùng) rồi mới bấm Bắt đầu.",
  "<strong>Chỉnh độ nhạy ngắt câu:</strong> Ở video nói chậm hoặc người nói hay ngập ngừng, bạn có thể tăng <em>Độ nhạy ngắt câu</em> (50–800 ms) trong Cài đặt để câu dịch liền mạch hơn.",
  "<strong>Lưu bản chép lời để xem lại:</strong> Khi học tập qua video dài, bạn có thể sao chép toàn bộ bản chép lời kèm mốc thời gian hoặc xuất file TXT, SRT để ôn tập sau buổi học (xem <a href=\"/huong-dan/lich-su-va-xuat-file/\">lịch sử và xuất file</a>).",
  "<strong>Thêm từ điển thuật ngữ:</strong> Với các video chuyên ngành công nghệ hoặc y khoa, hãy thêm thuật ngữ vào <em>Từ điển thuật ngữ</em> để bộ dịch ưu tiên đúng từ bạn cần.",
])}
</div></section>

<section class="section" id="chua-phu-hop"><div class="container narrow">
${sectionHead({ eyebrow: "Trung thực", title: "Khi nào AI Translator chưa phù hợp để dịch YouTube?", text: "Chúng tôi nêu rõ giới hạn thực tế để bạn chọn đúng công cụ phù hợp với nhu cầu." })}
${checkList([
  "<strong>Bạn xem YouTube trên điện thoại di động.</strong> AI Translator là ứng dụng máy tính dành cho macOS và Windows, không chạy trên điện thoại. Hãy xem video trên trình duyệt máy tính.",
  "<strong>Bạn muốn tải file video đã có sẵn phụ đề về máy.</strong> App không tải video, không can thiệp vào tệp gốc và không lưu video xuống ổ đĩa; ứng dụng chỉ tạo phụ đề trực tiếp khi âm thanh đang phát.",
  "<strong>Bạn cần lồng tiếng giọng đọc hoặc gắn phụ đề cứng vào video.</strong> Ứng dụng không lồng tiếng và không biên tập video; phụ đề hiển thị trên thanh nổi riêng biệt của hệ thống.",
  "<strong>Video nói ngôn ngữ ngoài 5 thứ tiếng được hỗ trợ.</strong> Hiện ứng dụng dịch giữa tiếng Anh, tiếng Trung, tiếng Nhật, tiếng Hàn và tiếng Việt. Các ngôn ngữ khác chưa được hỗ trợ.",
  "<strong>Máy tính cấu hình quá yếu.</strong> Thời gian trễ trung vị 0,76–1,03 giây được ghi nhận trên Mac M4 Pro với gói model Chuẩn. Trên máy tính Windows có cấu hình thấp hơn hoặc chỉ dùng card đồ họa tích hợp, tốc độ xử lý sẽ chậm hơn.",
], true)}
${callout({ kind: "warn", title: "Bản dịch tự động có thể có sai sót.", text: "Bản dịch AI mang tính tham khảo hỗ trợ nghe hiểu nhanh nội dung. Đừng dựa vào bản dịch cho các quyết định pháp lý, tài chính hoặc y tế quan trọng mà chưa đối chiếu lại với chuyên gia." })}
<p>Chúng tôi đã thử nghiệm với video phát trong trình duyệt và thử một lần với YouTube Live: một kênh tin tức tiếng Anh, xem trên Chrome (Mac M4 Pro, 25/10/2026). Phụ đề tiếng Việt hiện suốt khoảng 4 phút xem, kể cả khi đặt nguồn <em>Chỉ Google Chrome</em>; bản dịch nhìn chung khớp lời, có vài lỗi nhỏ. AI Translator được thiết kế tối ưu cho nhu cầu dịch YouTube và nghe hiểu video ngoại ngữ theo thời gian thực ngay trên máy tính của bạn.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Dịch YouTube: những điều hay được hỏi" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Đọc tiếp", title: "Bước tiếp theo", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/giai-phap/dich-webinar-va-video/", icon: "book", title: "Webinar và video", text: "Dịch bài giảng, khóa học trực tuyến và video đào tạo chuyên ngành phiên dài.", more: "Xem giải pháp" })}
${linkCard({ href: "/giai-phap/dich-livestream/", icon: "play", title: "Dịch livestream", text: "Xem cách dịch các luồng phát trực tiếp đa nền tảng với phụ đề nổi trực tiếp.", more: "Xem giải pháp" })}
${linkCard({ href: "/bang-gia/", icon: "wallet", title: "Bảng giá", text: "Dùng thử Free 10 ngày; các gói Monthly, 6 Months và Yearly trả trước linh hoạt.", more: "Xem bảng giá" })}
</div>
<p class="center-text reveal">Tìm hiểu về cách bảo vệ âm thanh và quyền riêng tư? Xem trang <a href="/bao-mat-du-lieu/">dữ liệu và bảo mật</a>.</p>
<p class="disclaimer">YouTube là nhãn hiệu của Google LLC; AI Translator không liên kết với Google hay YouTube.</p>
</div></section>

${ctaBand({
  title: "Bắt đầu dịch YouTube với AI Translator",
  text: "Cài đặt nhanh bằng một dòng lệnh. Dùng thử miễn phí 10 ngày trên macOS và Windows, không cần thẻ tín dụng.",
  primary: { href: "/tai-xuong/", label: "Tải xuống ngay" },
  secondary: { href: "/bang-gia/", label: "Xem bảng giá" },
})}
`,
};
