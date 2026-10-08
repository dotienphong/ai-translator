import { demo, feature, steps, plansGrid, faq, ctaBand, sectionHead, icon, facts, linkCard, appShot, overlayShot, callout, checkList } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

export const HOME_FAQ = [
  {
    q: "AI Translator có cần internet không?",
    a: "<p>Khi đang dịch thì không. Nhận dạng giọng nói, dịch và hiện phụ đề đều chạy trên máy bạn. Internet chỉ cần cho vài việc: tải app và model lần đầu (khoảng 1,3 GB hoặc 2,5 GB), đăng ký dùng thử Free, mua gói, kiểm tra bản quyền (gói trả phí dùng offline tối đa 14 ngày giữa hai lần kiểm tra) và cập nhật app.</p>",
  },
  {
    q: "Âm thanh cuộc họp của tôi có bị gửi đi đâu không?",
    a: "<p>Không. Âm thanh chỉ nằm trong bộ nhớ RAM trong lúc dịch, không ghi xuống đĩa và không gửi qua mạng. Chúng tôi đã kiểm bằng proxy trên macOS: trong lúc dịch, app không gửi dữ liệu âm thanh hay chữ chép lời ra ngoài.</p>",
  },
  {
    q: "Dùng được với Zoom, Teams, Google Meet, Zalo không?",
    a: "<p>Được. App thu âm thanh hệ thống của máy tính nên chạy với mọi ứng dụng họp, webinar hay video, không cần bot hay plugin. Trên macOS bạn cũng có thể chọn chỉ nghe một app cụ thể.</p>",
  },
  {
    q: "AI Translator hỗ trợ những ngôn ngữ nào?",
    a: "<p>Năm ngôn ngữ cho cả âm thanh nguồn và bản dịch: English, 中文, 日本語, 한국어 và Tiếng Việt. Giao diện app có tiếng Việt và English.</p>",
  },
  {
    q: "Tôi có cần tạo tài khoản không?",
    a: "<p>Không. App không có đăng nhập. Gói Free chỉ cần đồng ý điều khoản; gói trả phí được kích hoạt bằng license key gửi qua email sau khi thanh toán.</p>",
  },
  {
    q: "Hiện tôi tải app ở đâu?",
    a: "<p>AI Translator đang ở giai đoạn beta nên chưa có nút tải công khai. Bạn đăng ký nhận bản beta cho macOS tại trang <a href=\"/tai-xuong/\">Tải xuống</a>; chúng tôi gửi bản cài và hướng dẫn qua email.</p>",
  },
];

export default {
  id: "home",
  lang: "vi",
  path: "/",
  title: "AI Translator — Phụ đề dịch trực tiếp cho cuộc họp, chạy offline",
  description:
    "App desktop hiện phụ đề dịch trực tiếp cho Zoom, Teams, Meet và mọi âm thanh trên máy tính. Chạy offline, âm thanh không rời máy, không bot, không tài khoản.",
  software: true,
  modified: "2026-10-08",
  llm: "Trang chủ: AI Translator là gì, cách hoạt động, tính năng, độ trễ đo được, bảng giá và câu hỏi thường gặp.",
  llmTitle: "AI Translator: trang chủ",
  schema: [faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a.replace(/<[^>]+>/g, "") })))],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> Beta · macOS (Apple Silicon) · Windows sắp có</p>
<h1 class="reveal">Phụ đề dịch <em>trực tiếp</em> cho mọi cuộc họp, ngay trên máy bạn</h1>
<p class="lead reveal">AI Translator nghe âm thanh đang phát trên máy tính và hiện bản dịch thành phụ đề nổi trên màn hình. Dùng với Zoom, Microsoft Teams, Google Meet, Zalo PC, webinar hay video: không bot, không tài khoản, âm thanh không rời khỏi máy.</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/tai-xuong/">Nhận bản beta cho macOS ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#cach-hoat-dong">Xem cách hoạt động</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} Xử lý 100% trên máy</li>
<li>${icon("check")} Không bot, không plugin</li>
<li>${icon("check")} Không quảng cáo</li>
<li>${icon("check")} 5 ngôn ngữ</li>
</ul>
</div>
<div class="reveal">
${demo({
  title: "Cuộc họp nhóm (minh họa)",
  rec: "Đang dịch",
  langs: "EN → VI",
  note: "Minh họa: cuộc họp trực tuyến với thanh phụ đề dịch nổi ở phía dưới màn hình",
  names: ["Sarah", "Minh", "David", "Lan"],
  pairs: [
    { src: "We should ship the pilot to two customers first.", dst: "Chúng ta nên đưa bản thử nghiệm cho hai khách hàng trước." },
    { src: "Can you share the budget estimate by Friday?", dst: "Bạn có thể gửi bản dự toán ngân sách trước thứ Sáu không?" },
    { src: "Let's review the timeline in the next meeting.", dst: "Hãy xem lại tiến độ trong cuộc họp tiếp theo." },
  ],
  floatA: { icon: "wifi-off", text: "Chạy offline" },
  floatB: { icon: "lock", text: "Âm thanh ở lại trên máy" },
})}
</div>
</div></section>

<section class="section-tight"><div class="container narrow">
<h2 class="sr-only">AI Translator là gì</h2>
<p class="lead reveal"><strong>AI Translator</strong> là ứng dụng desktop dịch phụ đề trực tiếp cho âm thanh đang phát trên máy tính. Nó nhận dạng giọng nói, dịch và hiện bản dịch thành thanh phụ đề nổi, hoàn toàn trên máy bạn, không cần bot tham gia cuộc họp và không cần tài khoản. Bản beta hiện có cho macOS (Apple Silicon); bản Windows đang hoàn thiện.</p>
<div class="reveal">${facts([
  ["Loại sản phẩm", "Ứng dụng desktop dịch phụ đề trực tiếp"],
  ["Nền tảng", "macOS 14.2 trở lên (Apple Silicon)<small>Windows 10/11 x64: sắp có</small>"],
  ["Ngôn ngữ", "English, 中文, 日本語, 한국어, Tiếng Việt<small>Cả âm thanh nguồn lẫn bản dịch</small>"],
  ["Xử lý", "100% trên máy, âm thanh không gửi đi<small>Whisper (nhận dạng) và Hy-MT2 (dịch)</small>"],
  ["Giá", "Free dùng thử 10 ngày · Monthly 50.000 ₫ · Yearly 500.000 ₫<small>Trả trước bằng VietQR, không tự gia hạn</small>"],
  ["Bên cung cấp", "Đỗ Tiến Phong<small>Hỗ trợ: support@aitranslator.io.vn</small>"],
])}</div>
</div></section>

<section class="section-tight"><div class="container">
<ul class="app-strip reveal"><li>Zoom</li><li>Microsoft Teams</li><li>Google Meet</li><li>Zalo PC</li><li>Webinar</li><li>Video trực tuyến</li></ul>
<p class="disclaimer">Hoạt động với mọi âm thanh phát trên máy tính. Zoom, Microsoft Teams, Google Meet, Zalo là tên sản phẩm của chủ sở hữu tương ứng; AI Translator không liên kết với họ.</p>
</div></section>

<section class="section section-alt" id="cach-hoat-dong"><div class="container">
${sectionHead({ eyebrow: "Cách hoạt động", title: "Từ lúc cài đặt tới phụ đề đầu tiên chỉ vài phút", text: "Không cần cấu hình phức tạp, không cần mời bot vào cuộc họp.", center: true })}
${steps([
  { title: "Cài app, tải model một lần", text: "Mở app, làm theo phần giới thiệu, cho phép ghi âm thanh hệ thống và tải model về máy (khoảng 1,3 GB hoặc 2,5 GB tùy gói). Sau đó mọi thứ chạy offline." },
  { title: "Bấm Bắt đầu khi họp", text: "Chọn ngôn ngữ bạn muốn đọc, bấm <strong>Bắt đầu</strong> hoặc dùng phím tắt. App nghe âm thanh đang phát trên máy tính, dù là Zoom, Teams, Meet hay video." },
  { title: "Đọc phụ đề nổi trên màn hình", text: "Thanh phụ đề hiện bản dịch gần như ngay khi người nói dừng câu, kèm câu gốc nếu bạn muốn. Kéo, đổi cỡ chữ, khóa vị trí theo ý mình." },
])}
<p class="center-text reveal"><a class="btn btn-ghost" href="/huong-dan/bat-dau-nhanh/">Xem hướng dẫn bắt đầu nhanh ${icon("arrow-right")}</a></p>
</div></section>

<section class="section"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">Thanh phụ đề</span>
<h2>Phụ đề nổi, đọc được trên mọi nền</h2>
<p class="lead">Một thanh luôn nằm trên cùng, không lấy focus của app họp. Bản dịch hiện dần từng chữ, câu chưa chốt có màu nhạt hơn, câu gốc hiện chữ nhỏ phía trên nếu bạn bật.</p>
${checkList([
  "Kéo để di chuyển, kéo cạnh để đổi kích thước, nhớ vị trí riêng cho từng màn hình",
  "Cỡ chữ 14–48 px, năm màu chữ, năm màu nền, độ mờ nền tùy chỉnh",
  "<strong>Khóa</strong> để chuột xuyên qua thanh, không cản thao tác trong app họp",
  "Cuộn xem lại các câu cũ bằng con lăn hoặc phím tắt",
])}
<p><a class="btn btn-secondary" href="/tinh-nang/">Xem tất cả tính năng ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "vi", alt: "Thanh phụ đề của AI Translator hiện câu tiếng Anh và bản dịch tiếng Việt bên dưới", caption: "Thanh phụ đề thật của app: câu gốc chữ nhỏ ở trên, bản dịch ở dưới." })}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-home-running", lang: "vi", alt: "Màn hình chính của AI Translator khi đang dịch: trạng thái Đang dịch, ngôn ngữ, nguồn âm thanh và số phút còn lại" , caption: "Màn hình chính khi đang dịch (gói Monthly)." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Điều khiển gọn</span>
<h2>Một màn hình, đủ mọi thứ cần thiết</h2>
<p class="lead">Chọn ngôn ngữ cần đọc, chọn nguồn âm thanh, bấm Bắt đầu. Số phút còn lại luôn hiện rõ, nên bạn không bao giờ bị bất ngờ.</p>
${checkList([
  "Năm ngôn ngữ nói và dịch: English, 中文, 日本語, 한국어, Tiếng Việt",
  "Tự nhận diện ngôn ngữ đang nói, hoặc khóa một ngôn ngữ cho chính xác hơn",
  "Phím tắt toàn cục để bắt đầu, ẩn hiện, khóa và cuộn phụ đề mà không rời app họp",
  "Biểu tượng trên thanh menu: app vẫn chạy khi bạn đóng cửa sổ",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Vì sao AI Translator", title: "Dịch cuộc họp theo cách khác với phần mềm cloud", text: "Phần lớn công cụ dịch cuộc họp gửi âm thanh lên máy chủ. AI Translator làm ngược lại: mọi thứ ở trên máy bạn.", center: true })}
<div class="grid grid-3">
${feature({ icon: "shield", title: "Riêng tư theo thiết kế", text: "Âm thanh chỉ nằm trong RAM, không ghi đĩa, không gửi đi. App không có analytics và không gửi báo cáo lỗi tự động.", accent: true })}
${feature({ icon: "wifi-off", title: "Offline khi dịch", text: "Nhận dạng giọng nói và dịch chạy trên máy, nên dùng được cả khi mạng chập chờn hoặc trong mạng nội bộ." })}
${feature({ icon: "video", title: "Mọi app họp, không bot", text: "Không cần mời bot hay cài plugin vào cuộc họp. Mọi âm thanh phát trên máy đều có thể thành phụ đề." })}
${feature({ icon: "book", title: "Từ điển thuật ngữ", text: "Thêm cách dịch cho tên riêng, tên sản phẩm và thuật ngữ chuyên ngành. Tối đa 500 thuật ngữ, nhập xuất CSV (tính năng Pro)." })}
${feature({ icon: "history", title: "Lịch sử và xuất file", text: "Lưu bản chép lời trên máy, mã hóa, xuất ra TXT, SRT hoặc Markdown. Lịch sử mặc định tắt, bạn quyết định (tính năng Pro)." })}
${feature({ icon: "languages", title: "Năm ngôn ngữ", text: "English, 中文, 日本語, 한국어 và Tiếng Việt, theo mọi chiều. Giao diện app có tiếng Việt và English." })}
</div>
<div class="stats reveal">
<div class="stat"><b>&lt; 1,1 giây</b><span>độ trễ trung vị từ lúc người nói dừng câu tới khi hiện đủ bản dịch (Mac M4 Pro, gói Chuẩn)</span></div>
<div class="stat"><b>0</b><span>dữ liệu âm thanh hay chữ chép lời rời khỏi máy khi dịch (đã kiểm bằng proxy trên macOS)</span></div>
<div class="stat"><b>5 giờ 23 phút</b><span>một phiên dịch liên tục không lỗi trong thử nghiệm nội bộ trên macOS</span></div>
</div>
<p class="disclaimer">Số đo trên một máy cụ thể (Mac M4 Pro 24 GB, macOS 26). Máy khác có thể chậm hơn; xem <a href="/tinh-nang/#hieu-nang">chi tiết hiệu năng và điều kiện đo</a>.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Dùng vào việc gì", title: "Hiểu nội dung, không bị rào cản ngôn ngữ", center: true })}
<div class="grid grid-2">
${linkCard({ href: "/giai-phap/dich-hop-truc-tuyen/", icon: "users", title: "Họp trực tuyến", text: "Phụ đề dịch cho Zoom, Teams, Google Meet và Zalo PC mà không cần ai cài thêm gì.", more: "Xem giải pháp" })}
${linkCard({ href: "/giai-phap/dich-webinar-va-video/", icon: "play", title: "Webinar và video", text: "Theo dõi hội thảo, khóa học, video bằng ngoại ngữ với phụ đề dịch ngay trên màn hình.", more: "Xem giải pháp" })}
</div>
</div></section>

<section class="section" id="gia"><div class="container">
${sectionHead({ eyebrow: "Bảng giá", title: "Ba gói đơn giản, trả trước bằng VietQR", text: "Không tự động gia hạn, không thanh toán định kỳ, không bất ngờ trên hóa đơn.", center: true })}
${plansGrid("vi", { ctaLabel: "Nhận bản beta", freeLabel: "Dùng thử miễn phí" })}
<p class="center-text reveal"><a class="btn btn-ghost" href="/bang-gia/">So sánh chi tiết các gói ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${callout({ kind: "warn", title: "Trung thực về giai đoạn beta", text: "AI Translator đang ở giai đoạn beta. Bản macOS hiện ký ad-hoc, chưa notarize, nên lần mở đầu macOS sẽ chặn app và bạn cần cho phép trong System Settings (chúng tôi có <a href=\"/huong-dan/cai-dat-macos/\">hướng dẫn từng bước</a>). Bản Windows chưa phát hành. Chúng tôi nói rõ để bạn không phải đoán." })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Những điều bạn có thể muốn biết trước" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/cau-hoi-thuong-gap/">Xem tất cả câu hỏi ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "Sẵn sàng hiểu mọi cuộc họp?", text: "Nhận bản beta cho macOS, dùng thử miễn phí 10 ngày, không cần thẻ.", primary: { href: "/tai-xuong/", label: "Nhận bản beta" }, secondary: { href: "/huong-dan/bat-dau-nhanh/", label: "Xem hướng dẫn" } })}
`,
};
