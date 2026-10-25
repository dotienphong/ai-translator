import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, overlayShot, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Giải pháp", path: "/giai-phap/" },
  { name: "Dịch livestream", path: "/giai-phap/dich-livestream/" },
];

const FAQ = [
  {
    q: "Dịch livestream ra tiếng Việt bằng cách nào?",
    a: `<p>Cài AI Translator trên máy tính, mở livestream trong trình duyệt, chọn tiếng Việt ở ô Dịch sang rồi bấm Bắt đầu. App nghe âm thanh đang phát ra từ máy và hiện phụ đề tiếng Việt trên một thanh nổi, với độ trễ trung vị 0,76–1,03 giây, tính từ lúc người nói dừng câu, khi đo trên Mac M4 Pro (gói model Chuẩn). Live có thể bằng tiếng Anh, Trung, Nhật hay Hàn; cả bốn chiều sang tiếng Việt đều đã có điểm đo chất lượng dịch (<a href="/tinh-nang/#chat-luong-theo-chieu">xem bảng</a>).</p>`,
  },
  {
    q: "Có dịch được live TikTok, YouTube và Facebook không?",
    a: `<p>App thu âm thanh hệ thống nên không phụ thuộc nền tảng: buổi live nào phát tiếng ra máy tính của bạn thì app nghe được. Chúng tôi đã thử với video phát trong trình duyệt, và thử một lần với YouTube Live trên Chrome (macOS, 25/10/2026): phụ đề hiện ra, kể cả khi chỉ nghe Chrome. Với TikTok LIVE, chúng tôi chỉ có kết quả của một buổi live tiếng Việt có nhạc nền: app thu được tiếng, nhưng nhạc làm nhận dạng sai nên phụ đề không dùng được. Chúng tôi chưa thử Facebook Live. Xem thêm <a href="/giai-phap/dich-live-tiktok/">dịch live TikTok</a>.</p>`,
  },
  {
    q: "Dùng AI Translator để dịch live trên điện thoại được không?",
    a: `<p>Không. AI Translator chỉ có bản cho macOS (Apple Silicon) và Windows 10/11, nên chỉ dùng được khi bạn xem live trên máy tính.</p>`,
  },
  {
    q: "Có cần internet khi đang dịch không?",
    a: `<p>Phần dịch thì không: nhận dạng giọng nói, dịch và hiện phụ đề chạy trên máy bạn, âm thanh không gửi đi. Bạn vẫn cần internet để xem livestream.</p>`,
  },
  {
    q: "Tôi phát live thì dịch cho người xem của mình được không?",
    a: `<p>Không. AI Translator không có tính năng đưa phụ đề hay giọng dịch vào buổi live của bạn. App làm phụ đề để chính người dùng app đọc, trên thanh nổi ở máy của họ.</p>`,
  },
  {
    q: "Dịch live có miễn phí không?",
    a: `<p>Gói Free dùng thử 10 ngày, tối đa 30 phút dịch mỗi ngày, không cần thẻ hay tài khoản. Sau đó cần gói trả trước; xem <a href="/bang-gia/">bảng giá</a>. Free là dùng thử, không phải miễn phí vĩnh viễn.</p>`,
  },
];

export default {
  id: "solutions-livestream",
  lang: "vi",
  path: "/giai-phap/dich-livestream/",
  title: "Dịch livestream ra tiếng Việt: phụ đề trực tiếp",
  description:
    "Dịch livestream ra tiếng Việt khi xem trên máy tính: phụ đề trực tiếp, AI chạy ngay trên máy, không cần tiện ích trình duyệt. Không dùng được trên điện thoại.",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  llm: "Cách dùng AI Translator để dịch livestream ra tiếng Việt bằng phụ đề trực tiếp khi xem live trên máy tính: bốn bước, mẹo cho live thường không tua lại được, hạn mức, giới hạn thật (không dùng trên điện thoại, không dịch buổi live của chính bạn cho người xem) và hỏi đáp.",
  llmTitle: "Dịch livestream ra tiếng Việt bằng phụ đề trực tiếp",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "Dịch livestream ra tiếng Việt bằng phụ đề trực tiếp",
  lead: "Muốn dịch live trực tiếp một buổi livestream nước ngoài để hiểu ngay khi đang phát? AI Translator hiện phụ đề tiếng Việt khi bạn xem livestream bằng tiếng Anh, Trung, Nhật hay Hàn trên máy tính. App nghe âm thanh đang phát ra từ máy nên dùng được với live phát trong trình duyệt, không cần cài tiện ích, và việc nhận dạng cùng dịch chạy ngay trên máy bạn. App chỉ có bản cho macOS và Windows, không dùng được trên điện thoại, và chỉ làm phụ đề cho người xem: không dịch live của chính bạn cho người xem của bạn.",
  meta: "<span>Cập nhật {{updated}}</span><span>Chạy trên máy tính macOS và Windows, không chạy trên điện thoại</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["Dùng với", "Livestream phát trong trình duyệt hoặc app trên máy tính<small>TikTok LIVE, YouTube, Facebook Live: app nghe âm thanh của máy nên không phụ thuộc nền tảng. Đã thử một lần với YouTube Live (25/10/2026). Một buổi TikTok LIVE tiếng Việt có nhạc nền không đạt. Chưa thử Facebook Live.</small>"],
  ["Ngôn ngữ", "Tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt<small>Chỉ các chiều có tiếng Việt đã được đo chất lượng dịch</small>"],
  ["Độ trễ", "Trung vị 0,76–1,03 giây<small>Sau khi người nói dừng câu; Mac M4 Pro, gói model Chuẩn; máy yếu hơn sẽ chậm hơn</small>"],
  ["Máy", "macOS 14.2+ (Apple Silicon) và Windows 10/11 x64<small>Không có bản cho điện thoại hay máy tính bảng</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Dành cho ai", title: "Khi buổi live hay nhưng không phải tiếng của bạn", center: true })}
<div class="grid grid-3">
${feature({ icon: "play", title: "Người xem live bằng ngoại ngữ", text: "Buổi live bằng tiếng Anh, Trung, Nhật, Hàn của người sáng tạo nội dung, diễn giả hay đài truyền hình mà bạn muốn hiểu ngay khi đang phát." })}
${feature({ icon: "users", title: "Người theo dõi sự kiện trực tiếp", text: "Hội nghị, ra mắt sản phẩm hay buổi live giới thiệu hàng bằng ngoại ngữ, nơi bạn chỉ xem và nghe." })}
${feature({ icon: "book", title: "Người học qua buổi live", text: "Buổi giảng, lớp học hay hội thảo phát trực tiếp bằng ngoại ngữ mà bạn muốn theo kịp từng câu." })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">Cách hoạt động</span>
<h2>Dịch livestream trực tiếp ngay trên máy tính</h2>
${checkList([
  "Bạn mở livestream trên trình duyệt (hoặc app) ở máy tính rồi bấm <strong>Bắt đầu</strong> trong AI Translator",
  "App nghe âm thanh đang phát ra từ máy, tách thành câu, nhận dạng và dịch ngay trên máy bạn",
  "Bản dịch hiện trên thanh phụ đề nổi nằm trên cửa sổ live, câu gốc chữ nhỏ ở trên",
  "Không cần tiện ích trình duyệt và app không cần kết nối tài khoản nền tảng; thanh phụ đề không lấy focus của cửa sổ đang mở nên bạn vẫn gõ chat bình thường",
])}
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "vi", alt: "Thanh phụ đề của AI Translator: câu gốc tiếng Trung và tiếng Anh chữ nhỏ ở trên, bản dịch tiếng Việt chữ lớn bên dưới", caption: "Thanh phụ đề thật của app: câu gốc chữ nhỏ ở trên, bản dịch ở dưới." })}
</div>
</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Bắt đầu", title: "Bốn bước để xem live có phụ đề tiếng Việt" })}
${steps([
  { title: "Mở livestream trên máy tính", text: "Mở buổi live bằng trình duyệt (hoặc app) trên máy tính và cho nó phát tiếng. Trên macOS, lần đầu bấm Bắt đầu, hệ điều hành hỏi quyền <em>Ghi âm thanh hệ thống</em>: xem <a href=\"/huong-dan/cap-quyen-thu-am-macos/\">cách cấp quyền</a>." },
  { title: "Chọn ngôn ngữ", text: "Ở ô <em>Dịch sang</em>, chọn tiếng Việt. Nếu cả buổi live chỉ một ngôn ngữ, đặt <em>Ngôn ngữ nguồn</em> đúng ngôn ngữ đó thay vì <em>Tự nhận diện</em>; người nói đổi tiếng thì giữ Tự nhận diện." },
  { title: "Bấm Bắt đầu", text: "Bấm <strong>Bắt đầu</strong> (phím tắt ⌃⌥T, Windows: Ctrl+Alt+T) trước hoặc ngay khi live phát. App nạp model trong vài giây đầu; lần đầu sau khi cài hoặc cập nhật có thể lâu hơn, tới vài phút." },
  { title: "Đặt thanh phụ đề", text: "Kéo thanh tới sát dưới khung video, chỉnh cỡ chữ và màu ở Cài đặt › Phụ đề, rồi bấm <em>Khóa (click xuyên qua)</em> để chuột đi xuyên thanh." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Mẹo", title: "Livestream thường không tua lại được: chỉnh thế nào cho dễ xem?" })}
${checkList([
  "<strong>Chọn nguồn Chỉ {tên app} (macOS):</strong> để thông báo của máy không bị dịch, hãy cho live phát trước, vào Cài đặt › Âm thanh, bấm <em>Làm mới danh sách</em> (danh sách chỉ có app đang phát tiếng), chọn trình duyệt đang phát live rồi mới bấm Bắt đầu. Với Safari, mục này tên là <em>Chỉ Safari và trang web trong các app khác</em>. Đổi nguồn có tác dụng từ phiên dịch sau. Các tab khác của trình duyệt đó vẫn được nghe, nên hãy tắt tiếng tab khác.",
  "<strong>Windows chưa chọn được từng app:</strong> hãy tắt tiếng thông báo của máy khi xem.",
  "<strong>Độ nhạy ngắt câu</strong> chỉnh 50–800 ms: ngắn thì phụ đề hiện sớm hơn, dài thì ít cắt câu hơn. Thấy câu bị cắt vụn giữa chừng (người nói hay ngập ngừng, ngắt hơi) thì thử tăng lên; đổi có tác dụng từ phiên dịch sau.",
  "<strong>Lỡ một câu:</strong> thanh đã khóa thì bấm ⌃⌥PageUp (Windows: Ctrl+Alt+PageUp) để xem câu cũ, ⌃⌥PageDown để về câu mới; thanh chưa khóa thì cuộn bằng con lăn, nút <em>Mới nhất</em> đưa về câu hiện tại. Ở mọi gói, bạn còn xem, tìm và sao chép được bản chép lời của phiên gần nhất; bắt đầu phiên mới thì bản cũ bị thay (<a href=\"/huong-dan/lich-su-va-xuat-file/\">lịch sử và xuất file</a>).",
])}
${callout({ title: "Hạn mức cho buổi live dài.", text: "Phút chỉ tính theo tiếng nói đã dịch, không tính im lặng; câu đã ở đúng ngôn ngữ bạn muốn đọc không bị tính. Free chỉ có 30 phút mỗi ngày trong 10 ngày dùng thử, nên một buổi live dài cần Monthly (50 giờ mỗi 30 ngày), 6 Months (100 giờ mỗi 30 ngày) hoặc Yearly (không giới hạn). Xem <a href=\"/bang-gia/\">bảng giá</a>." })}
</div></section>

<section class="section" id="chua-phu-hop"><div class="container narrow">
${sectionHead({ eyebrow: "Trung thực", title: "Khi nào AI Translator chưa phù hợp với livestream?", text: "Biết trước giới hạn sẽ giúp bạn khỏi mất công thử." })}
${checkList([
  "<strong>Bạn xem live bằng điện thoại.</strong> AI Translator chỉ có bản cho macOS và Windows, nên không hiện phụ đề trong ứng dụng điện thoại. Muốn dùng, hãy mở buổi live trên máy tính.",
  "<strong>Bạn là người phát live và muốn dịch cho người xem của mình.</strong> App làm phụ đề để chính người dùng app đọc, trên thanh nổi ở máy của họ. App không đưa phụ đề hay giọng dịch vào buổi live của bạn.",
  "<strong>Bạn cần ghi lại buổi live, tải video hoặc tạo file phụ đề từ file video.</strong> App không ghi âm hay ghi hình xuống đĩa và không xử lý file video; nó chỉ có bản chép lời bằng chữ và không có chế độ tóm tắt.",
  "<strong>Âm thanh không rõ.</strong> Nhạc nền lớn, tiếng ồn hay nhiều người nói chồng lên nhau làm nhận dạng kém đi và bản dịch dễ sai.",
  "<strong>Máy yếu hoặc cần tốc độ trên Windows.</strong> Độ trễ 0,76–1,03 giây là đo trên Mac M4 Pro với gói model Chuẩn; Windows mới đo sơ bộ trên một laptop có GPU tích hợp và chậm hơn (<a href=\"/tinh-nang/#hieu-nang\">điều kiện đo</a>).",
  "<strong>Buổi live không nói tiếng Anh, Trung, Nhật, Hàn hay Việt.</strong> App chỉ hỗ trợ năm ngôn ngữ này; live bằng tiếng Thái, tiếng Indonesia hay ngôn ngữ khác chưa dịch được.",
], true)}
${callout({ kind: "warn", title: "Bản dịch tự động có thể sai.", text: "Đừng dựa vào AI Translator cho quyết định quan trọng (mua bán, hợp đồng, y tế, pháp lý, tài chính) mà chưa kiểm tra lại với người có chuyên môn." })}
<p>Chúng tôi đã thử với video phát trong trình duyệt, và thử một lần với YouTube Live trên Chrome (macOS, 25/10/2026): phụ đề hiện ra, kể cả khi chỉ nghe Chrome. Với TikTok LIVE, chúng tôi chỉ có kết quả của một buổi live tiếng Việt có nhạc nền: app thu được tiếng, nhưng nhạc làm nhận dạng sai nên phụ đề không dùng được. Chúng tôi chưa thử Facebook Live.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Dịch livestream: những điều hay được hỏi" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Đọc tiếp", title: "Bước tiếp theo", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/giai-phap/dich-live-tiktok/", icon: "play", title: "Dịch live TikTok", text: "Cách xem TikTok LIVE trên trình duyệt máy tính với phụ đề tiếng Việt, và giới hạn riêng của nó.", more: "Xem hướng dẫn" })}
${linkCard({ href: "/giai-phap/dich-webinar-va-video/", icon: "book", title: "Webinar, khóa học và video", text: "Xem nội dung đã ghi bằng ngoại ngữ, kể cả phiên dài nhiều giờ.", more: "Xem giải pháp" })}
${linkCard({ href: "/huong-dan/bat-dau-nhanh/", icon: "zap", title: "Bắt đầu nhanh", text: "Từ cài đặt tới phụ đề đầu tiên.", more: "Xem hướng dẫn" })}
</div>
<p class="center-text reveal">Cần biết nội dung của bạn có bị gửi đi đâu không? Xem <a href="/bao-mat-du-lieu/">dữ liệu và bảo mật</a>.</p>
<p class="disclaimer">TikTok, YouTube, Facebook và các tên sản phẩm khác thuộc về chủ sở hữu tương ứng; AI Translator không liên kết với họ.</p>
</div></section>

${ctaBand({ title: "Thử với buổi livestream tiếp theo", text: "Cài bằng một dòng lệnh, dùng thử Free 10 ngày, mỗi ngày 30 phút. Không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/bang-gia/", label: "Xem bảng giá" } })}
`,
};
