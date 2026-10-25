import { dataFlow, demo, demoVideo, feature, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot, overlayShot, checkList } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_TEXT = `Một cuộc họp trực tuyến có phụ đề tiếng Việt dịch từ tiếng Anh, rồi Gõ dịch chuyển câu trả lời tiếng Việt thành tiếng Anh để gửi tin nhắn. Video ${videoMeta("vi").seconds} giây, có tiếng.`;

export const HOME_FAQ = [
  {
    q: "AI Translator có cần internet không?",
    a: "<p>Khi đang dịch thì không. Nhận dạng giọng nói, dịch và hiện phụ đề đều chạy trên máy bạn. Internet chỉ cần cho vài việc: tải app và model lần đầu (khoảng 1,3 GB hoặc 2,5 GB), đăng ký dùng thử Free, mua gói, kiểm tra bản quyền (gói trả phí dùng offline tối đa 14 ngày giữa hai lần kiểm tra) và cập nhật app.</p>",
  },
  {
    q: "Làm sao dịch cuộc họp Zoom sang tiếng Việt mà không cần bot?",
    a: "<p>Mở AI Translator, chọn tiếng Việt là ngôn ngữ muốn đọc rồi bấm Bắt đầu. App nghe âm thanh Zoom phát ra trên máy bạn và hiện phụ đề tiếng Việt trên một thanh nổi. Không có bot nào vào phòng và chủ họp không cần bật gì. Người cùng họp không được thông báo, nên nếu quy định yêu cầu thì bạn tự báo họ.</p>",
  },
  {
    q: "Dùng được với Zoom, Teams, Google Meet, Zalo không?",
    a: "<p>Được. App thu âm thanh hệ thống của máy tính nên không phụ thuộc ứng dụng họp, webinar hay video bạn dùng, và không cần bot hay plugin. Chúng tôi đã thử thu âm thanh trên macOS với Zoom, Google Meet, Microsoft Teams và Zalo PC (thử nghiệm nội bộ, không phải chứng nhận của các bên đó). Trên macOS bạn cũng có thể chọn chỉ nghe một app cụ thể.</p>",
  },
  {
    q: "Dịch livestream ra tiếng Việt được không?",
    a: "<p>Được, khi bạn xem livestream bằng tiếng Anh, Trung, Nhật hay Hàn trên máy tính. Chúng tôi chưa thử riêng từng nền tảng livestream. Chúng tôi đã thử với video phát trong trình duyệt, và app nghe âm thanh phát ra từ máy nên không phụ thuộc trang web. App không có bản cho điện thoại và chỉ làm phụ đề cho người xem, không dịch live của chính bạn cho người xem của bạn. Xem <a href=\"/giai-phap/dich-livestream/\">dịch livestream ra tiếng Việt</a>.</p>",
  },
  {
    q: "Âm thanh cuộc họp của tôi có bị gửi đi đâu không?",
    a: "<p>Không. Âm thanh chỉ nằm trong bộ nhớ RAM trong lúc dịch, không ghi xuống đĩa và không gửi qua mạng. Chúng tôi đã kiểm tra bằng proxy trên macOS: trong lúc dịch, app không gửi dữ liệu âm thanh hay chữ chép lời ra ngoài.</p>",
  },
  {
    q: "Có cách dịch phụ đề họp sang tiếng Việt miễn phí không?",
    a: "<p>AI Translator có gói Free dùng thử 10 ngày, tối đa 30 phút dịch mỗi ngày, không cần thẻ hay tài khoản. Sau đó cần gói trả trước: Monthly 50.000 ₫ (50 giờ mỗi 30 ngày), 6 Months 269.000 ₫ (100 giờ mỗi 30 ngày, trong 180 ngày) hoặc Yearly 500.000 ₫ (không giới hạn trong 365 ngày). Gói Free là dùng thử, không phải miễn phí vĩnh viễn.</p>",
  },
  {
    q: "Tôi ở ngoài Việt Nam có mua được không?",
    a: "<p>Được. Ngoài chuyển khoản VietQR bằng VND (từ ngân hàng Việt Nam), màn hình Nâng cấp trong app cho trả bằng thẻ quốc tế, tính bằng USD, qua trang thanh toán của Creem: Monthly 3,99 USD, 6 Months 21,99 USD, Yearly 39,99 USD, chưa gồm thuế. Thẻ không nhận được ở một số nước, theo danh sách của Creem. Gói Free dùng thử không cần phương thức thanh toán.</p>",
  },
];

export default {
  id: "home",
  lang: "vi",
  path: "/",
  title: "Dịch livestream, họp trực tiếp bằng AI, chạy offline | AI Translator",
  description:
    "Phụ đề tiếng Việt dịch trực tiếp cho livestream, video và họp Zoom, Teams, Meet, Zalo: từ tiếng Anh, Trung, Nhật, Hàn. AI chạy trên máy, âm thanh không lên cloud.",
  software: true,
  modified: "2026-10-25",
  llm: "Trang chủ: AI Translator là gì, dịch cuộc họp và livestream bằng phụ đề, Gõ dịch tin nhắn, xem lại lịch sử bản chép lời, hướng dẫn sử dụng bốn bước, dữ liệu ở lại trên máy, bảng giá và câu hỏi thường gặp.",
  llmTitle: "AI Translator: trang chủ",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    videoObject({ lang: "vi", name: "Video demo AI Translator: phụ đề dịch cuộc họp và Gõ dịch", description: VIDEO_TEXT, uploadDate: "2026-10-21" }),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS (Apple Silicon) · Windows 10/11 · Dùng thử Free 10 ngày</p>
<h1 class="reveal">Phụ đề dịch <em>bằng&nbsp;AI</em> cho mọi cuộc họp, chạy ngay trên máy bạn</h1>
<p class="lead reveal"><strong>AI Translator</strong> là app desktop dịch âm thanh đang phát trên máy thành phụ đề nổi trên màn hình, và dịch tin nhắn bạn gõ sang tiếng của người bên kia. AI chạy ngay trên máy, nên âm thanh và nội dung cuộc họp không lên cloud. Dùng với Zoom, Microsoft Teams, Google Meet, Zalo PC, webinar, video hay livestream xem trên máy tính.</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/tai-xuong/">Tải xuống ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#cach-dung">Xem cách dùng</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI chạy 100% trên máy</li>
<li>${icon("check")} Dữ liệu cuộc họp không lên cloud</li>
<li>${icon("check")} Không bot, không tài khoản</li>
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

<section class="section-tight" id="video-demo"><div class="container">
${sectionHead({ eyebrow: "Video demo", title: "Xem AI Translator hoạt động", text: VIDEO_TEXT, center: true })}
${demoVideo({ lang: "vi", label: "Video demo AI Translator: phụ đề dịch cuộc họp và Gõ dịch", fallback: "Tải video demo (MP4, 2 MB)" })}
</div></section>

<section class="section" id="dich-cuoc-hop"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">Dịch cuộc họp</span>
<h2>Nghe họp bằng ngoại ngữ, đọc phụ đề bằng tiếng của bạn</h2>
<p class="lead">App nghe âm thanh đang phát trên máy và hiện bản dịch trên một thanh phụ đề nổi, câu gốc chữ nhỏ ở trên. Không bot nào vào phòng họp, người cùng họp không phải cài gì.</p>
${checkList([
  "Năm ngôn ngữ, dịch qua lại mọi chiều: tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt; tự nhận diện ngôn ngữ đang nói",
  "Phụ đề hiện ngay sau khi người nói dừng câu: trung vị dưới 1,1 giây trên Mac M4 Pro (gói model Chuẩn), máy khác có thể chậm hơn (<a href=\"/tinh-nang/#hieu-nang\">điều kiện đo</a>)",
  "Thanh phụ đề luôn nằm trên cùng: kéo, đổi cỡ chữ và màu, <strong>Khóa</strong> để chuột xuyên qua",
  "Từ điển thuật ngữ gợi ý cho bộ dịch cách dịch tên riêng và thuật ngữ chuyên ngành (tính năng Pro)",
  "Họp tại chỗ hay họp lai: chọn nguồn <strong>Micro</strong> hoặc <strong>Âm thanh máy + Micro</strong> để dịch cả người nói trong phòng (<a href=\"/tinh-nang/#micro\">cách dùng</a>)",
  "Xem livestream hay video cũng được: app nghe mọi âm thanh phát trên máy, kể cả live phát trong trình duyệt (<a href=\"/giai-phap/dich-livestream/\">dịch livestream</a>)",
])}
<p><a class="btn btn-secondary" href="/tinh-nang/">Xem tất cả tính năng ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "vi", alt: "Thanh phụ đề của AI Translator hiện câu tiếng Anh và bản dịch tiếng Việt bên dưới", caption: "Thanh phụ đề thật của app: câu gốc chữ nhỏ ở trên, bản dịch ở dưới." })}
</div>
</div>
</div></section>

<section class="section section-alt" id="go-dich"><div class="container">
<div class="split wide-right reverse">
<div class="stack-lg reveal">
<span class="eyebrow">Gõ dịch</span>
<h2>Trả lời bằng tiếng của người bên kia</h2>
<p class="lead">Bấm ⌃⌥G (Windows: Ctrl+Alt+G) ở ô chat đang dùng, gõ bằng tiếng của bạn rồi bấm Enter: bản dịch được dán vào ô chat để bạn xem lại và gửi.</p>
${checkList([
  "Dán vào ô bạn đang gõ, ở app nhận được lệnh dán (⌘V, Ctrl+V)",
  "Dịch trên máy bạn: chữ bạn gõ không rời máy",
  "Có ở mọi gói, không trừ thời lượng dịch",
])}
<p><a class="btn btn-secondary" href="/huong-dan/go-dich/">Xem hướng dẫn Gõ dịch ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "vi", alt: "Ô soạn Gõ dịch với một tin nhắn tiếng Việt và bản dịch tiếng Anh bên dưới", caption: "Ô soạn Gõ dịch: Enter để dán bản dịch vào ô chat." })}
</div>
</div>
</div></section>

<section class="section" id="lich-su"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">Lịch sử</span>
<h2>Xem lại cuộc họp sau khi kết thúc</h2>
<p class="lead">Mỗi phiên dịch có bản chép lời gồm giờ, câu gốc và bản dịch của từng câu. Bật lưu lịch sử để mở lại các cuộc họp cũ, tìm một câu, sao chép hay xuất ra file.</p>
${checkList([
  "Mọi gói: xem, tìm và sao chép bản chép lời của phiên gần nhất",
  "Tính năng Pro: lưu lịch sử các phiên, mở lại phiên cũ, xuất TXT, SRT hoặc Markdown",
  "Lưu lịch sử mặc định tắt; khi bật, dữ liệu được mã hóa và chỉ nằm trên máy bạn",
])}
<p><a class="btn btn-secondary" href="/huong-dan/lich-su-va-xuat-file/">Xem hướng dẫn Lịch sử ${icon("arrow-right")}</a></p>
</div>
<div>
${appShot({ slug: "app-history", lang: "vi", alt: "Màn hình Lịch sử: danh sách các phiên đã lưu với ngày giờ, số phút, số câu, đoạn xem trước và nút Mở, Xóa", caption: "Lịch sử: các phiên đã lưu trên máy bạn." })}
</div>
</div>
</div></section>

<section class="section section-alt" id="cach-dung"><div class="container">
${sectionHead({ eyebrow: "Hướng dẫn sử dụng", title: "Bắt đầu dùng trong bốn bước", text: "Cài và thiết lập một lần, sau đó mỗi cuộc họp chỉ cần bấm Bắt đầu.", center: true })}
<div class="split wide-left">
${steps([
  { title: "Cài bằng một dòng lệnh", text: "Dán lệnh cài ở trang <a href=\"/tai-xuong/\">Tải xuống</a> vào Terminal (macOS) hoặc PowerShell (Windows). App tự tải về, kiểm tra rồi mở." },
  { title: "Thiết lập lần đầu", text: "Chọn ngôn ngữ, đồng ý điều khoản, tải model (khoảng 1,3 GB hoặc 2,5 GB), cho phép ghi âm thanh hệ thống (chỉ macOS) rồi nghe thử một câu mẫu." },
  { title: "Bấm Bắt đầu khi họp", text: "Chọn ngôn ngữ muốn đọc ở ô <strong>Dịch sang</strong> rồi bấm <strong>Bắt đầu</strong> (phím tắt ⌃⌥T, Windows: Ctrl+Alt+T). Phụ đề hiện trên thanh nổi, bạn kéo nó tới chỗ dễ đọc." },
  { title: "Trả lời và xem lại", text: "Bấm ⌃⌥G (Windows: Ctrl+Alt+G) để Gõ dịch tin nhắn. Họp xong, bấm <strong>Dừng</strong> rồi mở <strong>Bản chép lời</strong> hoặc <strong>Lịch sử</strong> ở thanh bên." },
], true)}
${appShot({ slug: "app-home-running", lang: "vi", alt: "Màn hình chính của AI Translator khi đang dịch: trạng thái Đang dịch, ngôn ngữ, nguồn âm thanh và số phút còn lại", caption: "Màn hình chính khi đang dịch (gói Monthly)." })}
</div>
<p class="disclaimer">Bản macOS ký ad-hoc, chưa notarize; bản Windows chưa ký mã. Cài bằng dòng lệnh thì macOS mở app thẳng và SmartScreen không hỏi; file tải bằng trình duyệt có thể bị chặn hoặc cảnh báo ở lần mở đầu, và Smart App Control ở chế độ chặn sẽ chặn bản Windows. Xem hướng dẫn cài trên <a href="/huong-dan/cai-dat-macos/">macOS</a> và <a href="/huong-dan/cai-dat-windows/">Windows</a>.</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/huong-dan/bat-dau-nhanh/">Đọc hướng dẫn bắt đầu nhanh ${icon("arrow-right")}</a> <a class="btn btn-ghost" href="/huong-dan/">Tất cả hướng dẫn</a></p>
</div></section>

<section class="section band-dark" id="rieng-tu-tren-may"><div class="container">
${sectionHead({ eyebrow: "Dữ liệu ở lại trên máy bạn", title: "AI chạy ngay trên máy, nên cuộc họp không rời khỏi máy", text: "Nhận dạng giọng nói, dịch và hiện phụ đề đều diễn ra trên máy tính của bạn, không qua dịch vụ AI nào trên cloud.", center: true })}
${dataFlow("vi")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "Âm thanh không rời máy", text: "Âm thanh chỉ nằm trong RAM, không ghi đĩa, không gửi qua mạng; chúng tôi đã kiểm tra bằng proxy trên macOS. Không cần máy chủ để dịch, nên app vẫn dịch được khi mạng chập chờn hay mất mạng.", accent: true })}
${feature({ icon: "shield", title: "Máy chủ không có nội dung cuộc họp", text: "Máy chủ của chúng tôi chỉ lưu email (khi mua, hay khi bạn tự để lại trong chat hỗ trợ), đơn hàng, license, thông tin kích hoạt máy (mã băm ID máy, tên máy), mốc dùng thử Free (mã băm ID máy), nhật ký thay đổi license, báo cáo lỗi đã che dữ liệu cá nhân (giữ 30 ngày) và tin nhắn chat hỗ trợ khi bạn dùng chat (giữ 90 ngày), không có nội dung cuộc họp." })}
</div>
<p class="center-text reveal"><a class="btn btn-secondary" href="/bao-mat-du-lieu/">Xem chính xác dữ liệu nào đi đâu ${icon("arrow-right")}</a></p>
</div></section>

<section class="section" id="gia"><div class="container">
${sectionHead({ eyebrow: "Bảng giá", title: "Bốn gói đơn giản, trả trước bằng VietQR hoặc thẻ quốc tế", text: "Không tự động gia hạn, không thanh toán định kỳ, không tự động trừ tiền.", center: true })}
${plansGrid("vi", { ctaLabel: "Tải xuống", freeLabel: "Cài và dùng thử miễn phí" })}
<p class="disclaimer">Giá VND trả bằng VietQR từ ngân hàng Việt Nam; giá USD trả bằng thẻ quốc tế, chưa gồm thuế (nếu có).</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/bang-gia/">So sánh chi tiết các gói ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Những điều bạn có thể muốn biết trước" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/cau-hoi-thuong-gap/">Xem tất cả câu hỏi ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "Thử trên cuộc họp tiếp theo của bạn", text: "Cài bằng một dòng lệnh (Terminal trên Mac, PowerShell trên Windows), dùng thử miễn phí 10 ngày, không cần thẻ.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/huong-dan/bat-dau-nhanh/", label: "Xem hướng dẫn" } })}
`,
};
