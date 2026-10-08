import { demo, feature, steps, plansGrid, faq, ctaBand, sectionHead, icon, esc } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const FAQ = [
  { q: "AI Translator có cần internet không?", a: "<p>Chỉ cần internet để tải app và các model lần đầu, và để mua hoặc kiểm tra bản quyền. Khi đang dịch, mọi thứ chạy trên máy bạn: nhận dạng giọng nói, dịch và hiện phụ đề đều offline.</p>" },
  { q: "Âm thanh cuộc họp của tôi có bị gửi đi đâu không?", a: "<p>Không. Âm thanh chỉ nằm trong bộ nhớ RAM của máy trong lúc dịch, không ghi xuống đĩa và không gửi qua mạng.</p>" },
  { q: "Dùng được với Zoom, Teams, Google Meet không?", a: "<p>Được. App thu âm thanh hệ thống của máy tính nên dùng được với mọi ứng dụng họp, webinar hay video, không cần cài bot hay plugin vào cuộc họp.</p>" },
  { q: "Tôi có cần tạo tài khoản không?", a: "<p>Không. App không có tài khoản đăng nhập. Gói trả phí được cấp bằng license key gửi qua email sau khi thanh toán.</p>" },
];

export default {
  id: "home",
  lang: "vi",
  path: "/",
  title: "AI Translator — Phụ đề dịch trực tiếp cho cuộc họp, chạy offline",
  description: "App desktop hiện phụ đề dịch trực tiếp cho Zoom, Teams, Meet và mọi âm thanh trên máy tính. Chạy offline, âm thanh không rời máy, không bot, không tài khoản.",
  software: true,
  llm: "Trang chủ: AI Translator là gì, cách hoạt động, tính năng, bảng giá và câu hỏi thường gặp.",
  llmTitle: "AI Translator — trang chủ",
  schema: [faqPage(FAQ.map((f) => ({ q: f.q, a: f.a.replace(/<[^>]+>/g, "") })))],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> Beta · macOS · Windows sắp có</p>
<h1 class="reveal">Phụ đề dịch <em>trực tiếp</em> cho mọi cuộc họp, ngay trên máy bạn</h1>
<p class="lead reveal">AI Translator nghe âm thanh đang phát trên máy tính và hiện bản dịch thành phụ đề nổi trên màn hình. Dùng với Zoom, Teams, Meet, webinar hay video: không bot, không tài khoản, âm thanh không rời khỏi máy.</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/tai-xuong/">Nhận bản beta ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="/tinh-nang/">Xem tính năng</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} 100% offline khi dịch</li>
<li>${icon("check")} Không quảng cáo</li>
<li>${icon("check")} Không cần tài khoản</li>
</ul>
</div>
<div class="reveal">
${demo({
  title: "Cuộc họp nhóm — minh họa",
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

<section class="section-tight"><div class="container">
<ul class="app-strip reveal"><li>Zoom</li><li>Microsoft Teams</li><li>Google Meet</li><li>Zalo PC</li><li>Webinar</li><li>YouTube và video</li></ul>
<p class="disclaimer">Hoạt động với mọi âm thanh phát trên máy tính. Tên sản phẩm thuộc chủ sở hữu tương ứng; AI Translator không liên kết với họ.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Cách hoạt động", title: "Từ lúc cài đặt tới phụ đề đầu tiên chỉ vài phút", text: "Không cần cấu hình phức tạp, không cần mời bot vào cuộc họp.", center: true })}
${steps([
  { title: "Cài app và tải model một lần", text: "Mở app, làm theo phần giới thiệu, cho phép thu âm thanh hệ thống và tải model dịch về máy." },
  { title: "Bật dịch khi bắt đầu họp", text: "Chọn ngôn ngữ nguồn và đích, bấm bắt đầu. App nghe âm thanh đang phát trên máy." },
  { title: "Đọc phụ đề nổi trên màn hình", text: "Thanh phụ đề hiện bản dịch gần như ngay lập tức. Kéo, đổi cỡ chữ, khóa vị trí theo ý bạn." },
])}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Vì sao AI Translator", title: "Dịch cuộc họp theo cách khác với phần mềm cloud", center: true })}
<div class="grid grid-3">
${feature({ icon: "shield", title: "Riêng tư theo thiết kế", text: "Âm thanh không rời khỏi máy và không ghi xuống đĩa. Ứng dụng không có analytics, không gửi báo cáo lỗi tự động.", accent: true })}
${feature({ icon: "wifi-off", title: "Offline hoàn toàn", text: "Nhận dạng giọng nói và dịch đều chạy trên máy, nên dùng được cả khi mạng chập chờn." })}
${feature({ icon: "video", title: "Mọi app họp, không bot", text: "Không cần mời bot hay cài plugin. Mọi âm thanh phát trên máy đều có thể thành phụ đề." })}
${feature({ icon: "captions", title: "Thanh phụ đề tùy chỉnh", text: "Kéo tới đâu tùy ý, đổi cỡ chữ và độ mờ, khóa vị trí để không bấm nhầm, điều khiển bằng phím tắt." })}
${feature({ icon: "book", title: "Từ điển thuật ngữ", text: "Thêm cách dịch cố định cho tên riêng và thuật ngữ chuyên ngành của công ty (gói trả phí)." })}
${feature({ icon: "history", title: "Lịch sử và xuất file", text: "Lưu bản chép lời và bản dịch trên máy, mã hóa, xuất ra file khi cần (gói trả phí)." })}
</div>
</div></section>

<section class="section section-alt" id="gia"><div class="container">
${sectionHead({ eyebrow: "Bảng giá", title: "Ba gói đơn giản, trả trước bằng VietQR", text: "Không tự động gia hạn, không bất ngờ trên hóa đơn.", center: true })}
${plansGrid("vi", { ctaLabel: "Nhận bản beta", freeLabel: "Dùng thử miễn phí" })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Những điều bạn có thể muốn biết trước" })}
${faq(FAQ, { open: true })}
<p class="more-link"><a href="/cau-hoi-thuong-gap/">Xem tất cả câu hỏi ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "Sẵn sàng hiểu mọi cuộc họp?", text: "Nhận bản beta cho macOS và dùng thử miễn phí 10 ngày.", primary: { href: "/tai-xuong/", label: "Nhận bản beta" }, secondary: { href: "/huong-dan/bat-dau-nhanh/", label: "Xem hướng dẫn" } })}
`,
};
void esc;
