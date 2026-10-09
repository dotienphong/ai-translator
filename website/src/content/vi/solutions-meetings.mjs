import { pageHero, sectionHead, checkList, callout, ctaBand, appShot, overlayShot, facts, keys, steps, linkCard } from "../../build/components.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Giải pháp", path: "/giai-phap/" },
  { name: "Họp trực tuyến", path: "/giai-phap/dich-hop-truc-tuyen/" },
];

export default {
  id: "solutions-meetings",
  lang: "vi",
  path: "/giai-phap/dich-hop-truc-tuyen/",
  title: "Phụ đề dịch họp trực tuyến: Zoom, Teams, Meet, Zalo",
  description:
    "Dùng AI Translator để đọc phụ đề dịch khi họp Zoom, Teams, Google Meet, Zalo với đối tác nước ngoài: không bot, chạy offline. Cách chuẩn bị và giới hạn trung thực.",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "Cách dùng AI Translator để có phụ đề dịch khi họp Zoom, Teams, Google Meet, Zalo: chuẩn bị trước họp, phím tắt khi họp, bản chép lời sau họp, app đã thử, quyền riêng tư và giới hạn.",
  llmTitle: "Phụ đề dịch cho họp trực tuyến (Zoom, Teams, Meet, Zalo)",
  body: () => `
${pageHero({
  crumbs,
  title: "Phụ đề dịch cho họp trực tuyến (Zoom, Teams, Meet, Zalo)",
  lead: "AI Translator hiện phụ đề dịch trực tiếp cho cuộc họp Zoom, Microsoft Teams, Google Meet và Zalo PC bằng cách nghe âm thanh phát ra từ máy tính của bạn. Không cần bot vào phòng, không cần chủ họp bật tính năng nào, và việc nhận dạng cùng dịch chạy ngay trên máy bạn.",
  meta: "<span>Cập nhật 08/10/2026</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["Dùng với", "Zoom, Microsoft Teams, Google Meet, Zalo PC<small>Không bot, không plugin; app nào phát tiếng ra máy cũng thu được</small>"],
  ["Ngôn ngữ", "English, 中文, 日本語, 한국어, Tiếng Việt<small>Một chiều, sang ngôn ngữ bạn chọn</small>"],
  ["Độ trễ", "Trung vị 0,76–1,03 giây<small>Mac M4 Pro, gói model Chuẩn; máy yếu hơn sẽ chậm hơn</small>"],
  ["Nền tảng", "macOS 14.2+ (Apple Silicon) và Windows 10/11 x64<small>Bản Windows chưa ký mã nên SmartScreen có thể cảnh báo khi cài</small>"],
])}</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Bài toán", title: "Vì sao họp bằng ngoại ngữ vẫn mệt?" })}
<p>Họp bằng ngoại ngữ, bạn vừa nghe vừa dịch trong đầu và dễ lỡ ý khi người nói nhanh hay nhiều thuật ngữ. Các nền tảng họp lớn có phụ đề dịch tích hợp, nhưng thường chỉ ở gói trả phí cao và xử lý âm thanh trên cloud; phần lớn công cụ bên thứ ba cũng chạy cloud. Nếu gói của tổ chức bạn không có tính năng đó, hoặc bạn không muốn âm thanh rời khỏi máy, bạn cần một cách khác.</p>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-home-running", lang: "vi", alt: "Màn hình chính của AI Translator khi đang dịch: trạng thái Đang dịch, ngôn ngữ, nguồn âm thanh và số phút còn lại", caption: "Màn hình chính khi đang dịch." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Cách giải</span>
<h2>AI Translator chạy ở phía người nghe</h2>
${checkList([
  "Thu âm thanh đang phát trên máy (macOS: quyền <em>Ghi âm thanh hệ thống</em>, không dùng micro; xem <a href=\"/huong-dan/cap-quyen-thu-am-macos/\">cách cấp quyền</a>)",
  "Cắt câu, nhận dạng giọng nói và dịch bằng model chạy trên máy bạn",
  "Hiện bản dịch trên thanh phụ đề nổi, không lấy focus của app họp, nên bạn vẫn gõ chat bình thường",
  "Không ai khác phải làm gì: không bot trong phòng, không phụ đề cần chủ họp bật",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Trước cuộc họp", title: "Chuẩn bị trong năm phút", center: true })}
<div class="split wide-right">
<div>
${appShot({ slug: "app-settings-audio", lang: "vi", alt: "Cài đặt Âm thanh liệt kê các app đang phát tiếng để chọn làm nguồn", caption: "Cài đặt › Âm thanh: chọn nghe toàn hệ thống hoặc chỉ một app." })}
</div>
<div>
${steps(
  [
    { title: "Khóa ngôn ngữ nguồn nếu biết trước", text: "Ở thẻ Ngôn ngữ, đặt <em>Ngôn ngữ nguồn</em> đúng ngôn ngữ cuộc họp thay vì <em>Tự nhận diện</em>; app ít nhầm hơn ở câu ngắn. Họp nhiều thứ tiếng thì giữ Tự nhận diện và chỉ tick các ngôn ngữ có thể xuất hiện." },
    { title: "Thêm tên riêng vào từ điển (Pro)", text: "Nhập tên đối tác, sản phẩm, từ viết tắt kèm cách dịch, tối đa 500 mục. Đây là gợi ý cho bộ dịch, không bảo đảm đúng mọi lần. Xem <a href=\"/huong-dan/tu-dien-thuat-ngu/\">hướng dẫn từ điển</a>." },
    { title: "Đặt thanh phụ đề và khóa", text: "Kéo thanh tới chỗ không che người nói, thường sát dưới khung video; chỉnh cỡ chữ 14–48 px, màu, độ mờ ở Cài đặt › Phụ đề. Bấm <em>Khóa (click xuyên qua)</em> để chuột đi xuyên thanh." },
    { title: "Chỉ nghe Zoom (macOS)", text: "Danh sách ở Cài đặt › Âm thanh chỉ có app đang phát tiếng, nên vào họp rồi bấm <em>Làm mới danh sách</em>. Chọn mục của Zoom (dạng <em>Chỉ {tên app}</em>) để tiếng thông báo hay video khác không bị dịch. Meet trong trình duyệt thì chọn trình duyệt đó (các tab khác của nó vẫn được nghe). Có tác dụng từ phiên sau." },
  ],
  true,
)}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Trong cuộc họp", title: "Điều khiển mà không rời cuộc họp", text: "Bấm Bắt đầu trước khi họp bắt đầu để model nạp xong (vài giây đầu); im lặng không tính vào hạn mức.", center: true })}
${overlayShot({ slug: "overlay-default", lang: "vi", alt: "Thanh phụ đề của AI Translator trên nền tối: mỗi câu có câu gốc tiếng Anh hoặc tiếng Trung chữ nhỏ ở trên và bản dịch tiếng Việt ở dưới", caption: "Thanh phụ đề: câu gốc chữ nhỏ ở trên, bản dịch ở dưới." })}
<div class="split">
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">Việc</th><th scope="col">macOS</th></tr></thead>
<tbody>
<tr><th scope="row">Bắt đầu hoặc dừng dịch</th><td>${keys(["⌃", "⌥", "T"])}</td></tr>
<tr><th scope="row">Hiện hoặc ẩn phụ đề</th><td>${keys(["⌃", "⌥", "H"])}</td></tr>
<tr><th scope="row">Khóa hoặc mở khóa</th><td>${keys(["⌃", "⌥", "L"])}</td></tr>
<tr><th scope="row">Cuộn lên (câu cũ)</th><td>${keys(["⌃", "⌥", "PageUp"])}</td></tr>
<tr><th scope="row">Cuộn xuống (câu mới)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td></tr>
</tbody></table></div>
<div class="stack reveal">
${checkList([
  "<strong>Lỡ một câu:</strong> cuộn lên xem lại (giữ 1000 câu gần nhất), nút <em>Mới nhất</em> đưa bạn về hiện tại; phím cuộn dùng được cả khi đã khóa.",
  "<strong>Câu màu nhạt</strong> là phụ đề tạm, sẽ được thay khi người nói nói tiếp. Giữ bật <em>Hiện câu gốc phía trên bản dịch</em> (mặc định đã bật) để đối chiếu tên và số liệu.",
  "<strong>Ẩn nhanh</strong> bằng phím tắt hoặc nút ✕ khi rê chuột vào thanh chưa khóa.",
])}
</div>
</div>
<p class="small muted">Windows dùng Ctrl+Alt thay cho ⌃⌥. Đổi phím ở Cài đặt › Phím tắt nếu trùng app họp. Chúng tôi chưa kiểm xem thanh có hiện trong phần màn hình bạn chia sẻ hay không: hãy thử trước, hoặc ẩn thanh khi chia sẻ. Xem <a href="/huong-dan/thanh-phu-de-va-phim-tat/">thanh phụ đề và phím tắt</a>.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Sau cuộc họp", title: "Giữ lại những gì bạn cần" })}
<p>Sau khi bấm <strong>Dừng</strong>, bấm <strong>Mở bản chép lời</strong> để thấy từng dòng với giờ, câu gốc và bản dịch; có ô <em>Tìm</em> và nút <em>Sao chép tất cả</em> ở mọi gói.</p>
<p>Xuất TXT, SRT, Markdown và Lịch sử là tính năng Pro (xem <a href="/bang-gia/">bảng giá</a>). Lịch sử mặc định tắt; bật ở Cài đặt › Quyền riêng tư thì phiên được lưu trên máy, có mã hóa. App không tự lưu bản chép lời xuống đĩa; đây là bản chép chữ, không phải biên bản. Xem <a href="/huong-dan/lich-su-va-xuat-file/">lịch sử và xuất file</a>.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Đã thử với gì", title: "Những app và thiết bị đã thử" })}
<p>Bằng một công cụ thử thu âm riêng (chưa phải toàn bộ vòng nhận dạng và dịch của app), chúng tôi đã thử thu âm thanh hệ thống trên macOS 26.6.2 với <strong>Zoom (app)</strong>, <strong>Google Meet</strong> trên Chrome, Safari và Edge, <strong>Microsoft Teams (app mới)</strong> và <strong>Zalo PC</strong>, qua loa, tai nghe có dây và AirPods.</p>
<p>Đây là thử nghiệm nội bộ, kết quả do người thử nghe xác nhận, chưa phải kiểm thử chính thức trên bản phát hành cho từng app và phiên bản macOS (tối thiểu 14.2). Trên Windows, chúng tôi mới thử thu âm thanh hệ thống và thanh phụ đề trên Windows 11 trong thử nghiệm nội bộ; chưa thử từng app họp với bản phát hành.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Riêng tư", title: "Lưu ý quyền riêng tư và thông báo" })}
<p>AI Translator thu âm thanh phát ra từ máy bạn, trong đó có giọng người khác. Âm thanh chỉ nằm trong RAM, không ghi xuống đĩa và không gửi qua mạng (đã kiểm tra bằng proxy trên macOS). App không ghi âm cuộc họp. Xem <a href="/bao-mat-du-lieu/">dữ liệu và bảo mật</a>.</p>
${callout({ title: "Người cùng họp sẽ không được báo.", text: "Vì không có bot và app không kết nối với nền tảng họp, người cùng họp không thấy thông báo nào về việc bạn dùng AI Translator. Nếu pháp luật hoặc quy định công ty yêu cầu, bạn tự chịu trách nhiệm thông báo cho người cùng họp rằng bạn dùng công cụ dịch. <a href=\"/dieu-khoan/\">Điều khoản sử dụng</a> (mục 6) cũng nêu như vậy. Chúng tôi không đưa ra tư vấn pháp lý." })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Trung thực", title: "Giới hạn bạn nên biết" })}
${checkList([
  "<strong>Độ trễ:</strong> trung vị 0,76–1,03 giây, p90 0,94–1,34 giây, đo trên Mac M4 Pro 24 GB, gói model Chuẩn. Máy yếu hơn sẽ chậm hơn: chưa đo Mac M1; gói model Chuẩn trên một laptop Windows dùng GPU tích hợp chưa đạt mục tiêu. Xem <a href=\"/tinh-nang/#hieu-nang\">điều kiện đo</a>.",
  "<strong>Chất lượng khác nhau</strong> theo ngôn ngữ và độ rõ của âm thanh. Gói model Nhẹ chép lời kém hơn gói model Chuẩn ở tiếng Việt, Nhật, Hàn, Trung. Chưa đo qua tai nghe Bluetooth thật.",
  "<strong>Bản dịch có thể sai</strong>, nhất là thuật ngữ và tên riêng. Đừng dựa vào nó cho quyết định quan trọng khi chưa kiểm tra lại với người có chuyên môn.",
], true)}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Đọc tiếp", title: "Bước tiếp theo", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/huong-dan/bat-dau-nhanh/", icon: "zap", title: "Bắt đầu nhanh", text: "Từ cài đặt tới phụ đề đầu tiên.", more: "Xem hướng dẫn" })}
${linkCard({ href: "/so-sanh/dich-offline-va-cloud/", icon: "layers", title: "Dịch offline và dịch cloud", text: "So sánh cân bằng hai cách.", more: "Đọc bài so sánh" })}
${linkCard({ href: "/giai-phap/dich-webinar-va-video/", icon: "play", title: "Webinar và video", text: "Hội thảo, khóa học, bài giảng.", more: "Xem giải pháp" })}
</div>
</div></section>

${ctaBand({ title: "Thử trên cuộc họp thật của bạn", text: "Dùng thử Free 10 ngày, mỗi ngày 30 phút. Không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/huong-dan/bat-dau-nhanh/", label: "Hướng dẫn bắt đầu nhanh" } })}
`,
};
