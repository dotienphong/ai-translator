import { pageHero, sectionHead, feature, linkCard, checkList, callout, ctaBand, facts } from "../../build/components.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Giải pháp", path: "/giai-phap/" },
];

export default {
  id: "solutions",
  lang: "vi",
  path: "/giai-phap/",
  title: "Giải pháp: AI Translator cho họp, livestream và video",
  description:
    "AI Translator hiện phụ đề dịch trực tiếp cho họp Zoom, Teams, Meet, Zalo, livestream, webinar và video. Xem cách dùng từng tình huống và khi nào app chưa phù hợp.",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  llm: "Tổng quan các tình huống dùng AI Translator (họp trực tuyến, livestream, webinar, khóa học, video), liên kết tới các trang giải pháp chi tiết và danh sách trường hợp app chưa phù hợp.",
  llmTitle: "Giải pháp: AI Translator dùng vào việc gì",
  body: () => `
${pageHero({ crumbs, title: "AI Translator dùng được vào những việc nào?", lead: "AI Translator hiện phụ đề dịch trực tiếp cho mọi âm thanh đang phát trên máy tính, và nhận dạng cùng dịch đều chạy trên máy bạn. Các tình huống chính là họp trực tuyến, xem livestream, và xem webinar, khóa học, video bằng ngoại ngữ. Trang này giúp bạn chọn cách dùng phù hợp, và biết khi nào app chưa phù hợp." })}

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Các cách dùng chính", title: "Chọn tình huống giống bạn nhất", center: true })}
<div class="grid grid-2">
${linkCard({ href: "/giai-phap/dich-hop-truc-tuyen/", icon: "users", title: "Họp trực tuyến: Zoom, Teams, Meet, Zalo", text: "Phụ đề dịch cho cuộc họp với đối tác nước ngoài mà không cần bot, không cần chủ họp bật gì. Có cách chuẩn bị trước họp, phím tắt khi họp và bản chép lời sau họp.", more: "Xem giải pháp cho họp trực tuyến" })}
${linkCard({ href: "/giai-phap/dich-webinar-va-video/", icon: "play", title: "Webinar, khóa học và video", text: "Đọc phụ đề dịch khi xem hội thảo, khóa học hay video bằng ngoại ngữ, kể cả phiên dài nhiều giờ, rồi sao chép hoặc xuất bản chép lời để học lại.", more: "Xem giải pháp cho webinar và video" })}
${linkCard({ href: "/giai-phap/dich-livestream/", icon: "video", title: "Livestream: TikTok, YouTube, Facebook", text: "Phụ đề dịch khi xem livestream bằng tiếng Anh, Trung, Nhật hay Hàn trên máy tính, không cần cài gì vào trình duyệt. Nói rõ giới hạn: không dùng trên điện thoại, không dịch buổi live của chính bạn cho người xem.", more: "Xem giải pháp cho livestream" })}
${linkCard({ href: "/giai-phap/dich-live-tiktok/", icon: "laptop", title: "Live TikTok", text: "Cách xem TikTok LIVE trên trình duyệt máy tính với phụ đề tiếng Việt, và giới hạn riêng của nó.", more: "Xem hướng dẫn dịch live TikTok" })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Điểm chung", title: "Điều gì giống nhau ở mọi tình huống?", text: "Dù họp hay xem video, AI Translator làm việc theo cùng một cách.", center: true })}
<div class="grid grid-2">
${feature({ icon: "speaker", title: "Nghe âm thanh hệ thống", text: "App thu âm thanh đang phát trên máy tính, nên chạy với mọi app và trang web phát tiếng. Không cần bot, plugin hay tài khoản trên nền tảng." })}
${feature({ icon: "wifi-off", title: "Offline khi dịch", text: "Nhận dạng giọng nói và dịch chạy trên máy bạn. Âm thanh chỉ nằm trong RAM, không ghi đĩa, không gửi đi. Xem <a href=\"/bao-mat-du-lieu/\">dữ liệu và bảo mật</a>." })}
${feature({ icon: "languages", title: "Năm ngôn ngữ", text: "tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어) và tiếng Việt, cho cả âm thanh nguồn lẫn bản dịch. Bạn chọn ngôn ngữ muốn đọc." })}
${feature({ icon: "captions", title: "Thanh phụ đề nổi", text: "Một thanh luôn nằm trên cùng, không lấy focus của app đang mở. Kéo, đổi cỡ chữ, khóa để chuột xuyên qua. Xem <a href=\"/tinh-nang/\">tất cả tính năng</a>." })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Trước khi bắt đầu", title: "Cần chuẩn bị gì?", center: true })}
<div class="reveal">${facts([
  ["Nền tảng", "macOS 14.2+ trên Apple Silicon và Windows 10/11 x64<small>Mac Intel và Windows ARM64: chưa hỗ trợ</small>"],
  ["Máy", "RAM tối thiểu 8 GB, khuyến nghị 16 GB<small>Tải model một lần: 1,3 GB (gói model Nhẹ) hoặc 2,5 GB (gói model Chuẩn)</small>"],
  ["Ngôn ngữ", "tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt<small>Giao diện app: Tiếng Việt, English, 日本語, 中文 (giản thể), 한국어</small>"],
  ["Giá", "Free dùng thử 10 ngày · Monthly 50.000 ₫ · 6 Months 269.000 ₫ · Yearly 500.000 ₫<small>Trả trước bằng VietQR hoặc thẻ quốc tế (USD), không tự gia hạn. Thẻ không nhận được ở một số nước, theo danh sách của Creem.</small>"],
])}</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Chọn nhanh", title: "Tình huống nào, thiết lập nào?" })}
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">Tình huống</th><th scope="col">Gợi ý nhanh</th></tr></thead>
<tbody>
<tr><th scope="row">Họp Zoom, Teams, Meet với đối tác</th><td>Khóa ngôn ngữ nguồn, thêm tên riêng vào từ điển (Pro), đặt thanh phụ đề sát dưới khung video</td></tr>
<tr><th scope="row">Cuộc gọi Zalo PC</th><td>Giữ Tự nhận diện, hoặc khóa ngôn ngữ nếu biết trước</td></tr>
<tr><th scope="row">Livestream, live TikTok</th><td>Xem live trên trình duyệt máy tính, chọn nguồn chỉ nghe trình duyệt (macOS), tăng Độ nhạy ngắt câu (số ms) nếu câu bị cắt vụn giữa chừng; không dùng trên điện thoại</td></tr>
<tr><th scope="row">Webinar, hội thảo</th><td>Giữ hiện câu gốc (mặc định bật), chọn nguồn chỉ nghe trình phát (macOS)</td></tr>
<tr><th scope="row">Khóa học, video bài giảng</th><td>Xuất bản chép lời để học lại (Pro), thêm thuật ngữ chuyên ngành vào từ điển (Pro)</td></tr>
</tbody></table></div>
</div></section>

<section class="section section-alt" id="chua-phu-hop"><div class="container narrow">
${sectionHead({ eyebrow: "Trung thực", title: "Khi nào AI Translator chưa phù hợp?", text: "Biết trước giới hạn sẽ giúp bạn khỏi mất công thử." })}
${checkList([
  "<strong>Bạn cần người cùng họp nghe giọng bạn đã được dịch.</strong> Phụ đề của AI Translator chỉ dịch một chiều, từ âm thanh phát trên máy sang ngôn ngữ của bạn. Chưa có dịch giọng bạn để phát vào cuộc họp; trả lời bằng chữ thì dùng được <a href=\"/huong-dan/go-dich/\">Gõ dịch</a>.",
  "<strong>Bạn cần ghi âm cuộc họp.</strong> App không ghi âm xuống đĩa. Nó chỉ có bản chép lời bằng chữ; lưu lịch sử là tính năng Pro và mặc định tắt.",
  "<strong>Bạn cần biên bản, tóm tắt tự động hoặc biết ai đang nói.</strong> Chưa có.",
  "<strong>Bạn dùng Mac Intel, Windows ARM64 hoặc máy Windows có CPU không hỗ trợ AVX2.</strong> AI Translator chạy trên macOS 14.2 trở lên với Apple Silicon và Windows 10/11 64-bit (x64) có CPU hỗ trợ AVX2.",
  "<strong>Máy có dưới 8 GB RAM,</strong> hoặc bạn cần ngôn ngữ ngoài năm ngôn ngữ trên: app chưa đáp ứng.",
  "<strong>Bạn không có tài khoản ngân hàng Việt Nam và ở một nước mà Creem không nhận thanh toán thẻ.</strong> Thẻ quốc tế đi qua Creem, và Creem không nhận người mua từ một số nước (theo danh sách của Creem); không có PayPal. Khi đó chưa có cách trả cho gói trả phí; gói Free dùng thử vẫn dùng được.",
  "<strong>Bạn xem hoặc phát livestream.</strong> AI Translator không dùng được trên điện thoại và không đưa phụ đề hay giọng dịch vào buổi live của bạn; xem <a href=\"/giai-phap/dich-livestream/\">dịch livestream</a>.",
], true)}
${callout({ kind: "warn", title: "Bản dịch tự động có thể sai.", text: "Đừng dựa vào AI Translator cho quyết định quan trọng (hợp đồng, y tế, pháp lý, tài chính) mà chưa kiểm tra lại với người có chuyên môn." })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Đọc tiếp", title: "Muốn hiểu sâu hơn?", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/so-sanh/dich-offline-va-cloud/", icon: "layers", title: "Dịch offline và dịch cloud", text: "So sánh cân bằng: riêng tư, chi phí, độ trễ, phần cứng và khi nào chọn cách nào.", more: "Đọc bài so sánh" })}
${linkCard({ href: "/huong-dan/bat-dau-nhanh/", icon: "zap", title: "Bắt đầu nhanh", text: "Từ cài đặt tới phụ đề đầu tiên, kèm quyền ghi âm trên macOS.", more: "Xem hướng dẫn" })}
${linkCard({ href: "/bang-gia/", icon: "wallet", title: "Bảng giá", text: "Free dùng thử 10 ngày, Monthly 50.000 ₫, 6 Months 269.000 ₫, Yearly 500.000 ₫.", more: "Xem bảng giá" })}
</div>
</div></section>

${ctaBand({ title: "Thử trên cuộc họp hoặc video thật của bạn", text: "Dùng thử Free 10 ngày, mỗi ngày 30 phút. Không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/bang-gia/", label: "Xem bảng giá" } })}
`,
};
