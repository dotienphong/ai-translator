import { dataFlow, demo, demoVideo, feature, featureTabs, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_ITEMS = [
  { kind: "meeting", text: `Một cuộc họp trực tuyến có phụ đề tiếng Việt dịch từ tiếng Anh. Video ${videoMeta("vi", "meeting").seconds} giây, có tiếng.`, label: "Video demo AI Translator: dịch cuộc họp trực tiếp", fallback: "Tải video (MP4, 1 MB)" },
  { kind: "typing", text: `Gõ dịch chuyển câu trả lời tiếng Việt thành tiếng Anh để gửi tin nhắn. Video ${videoMeta("vi", "typing").seconds} giây, có tiếng.`, label: "Video demo AI Translator: Gõ dịch", fallback: "Tải video (MP4, 1 MB)" },
];
const [MEETING_VIDEO, TYPING_VIDEO] = VIDEO_ITEMS;

export const HOME_FAQ = [
  {
    q: "Dùng được với Zoom, Teams, Google Meet, Zalo không?",
    a: `<p>Được, không cần bot hay plugin: app thu âm thanh hệ thống của máy tính nên không phụ thuộc ứng dụng họp. Chúng tôi đã thử thu âm thanh trên macOS với Zoom, Google Meet, Microsoft Teams và Zalo PC (thử nghiệm nội bộ, không phải chứng nhận của các bên đó). Người cùng họp không được thông báo, nên nếu quy định yêu cầu thì bạn tự báo họ.</p>`,
  },
  {
    q: "AI Translator có cần internet không?",
    a: `<p>Khi đang dịch thì không. Nhận dạng giọng nói, dịch và hiện phụ đề đều chạy trên máy bạn. Internet chỉ cần cho vài việc: tải app và model lần đầu (khoảng 1,3 GB hoặc 2,5 GB), đăng ký dùng thử Free, mua gói, kiểm tra bản quyền (gói trả phí dùng offline tối đa 14 ngày giữa hai lần kiểm tra) và cập nhật app.</p>`,
  },
  {
    q: "Âm thanh cuộc họp của tôi có bị gửi đi đâu không?",
    a: `<p>Không. Âm thanh chỉ nằm trong bộ nhớ RAM trong lúc dịch, không ghi xuống đĩa và không gửi qua mạng. Chúng tôi đã kiểm tra bằng proxy trên macOS: trong lúc dịch, app không gửi dữ liệu âm thanh hay chữ chép lời ra ngoài.</p>`,
  },
  {
    q: "Dịch livestream ra tiếng Việt được không?",
    a: `<p>Trên máy tính thì được: app nghe âm thanh đang phát ra từ máy nên không phụ thuộc trang web. Chúng tôi đã thử một lần với YouTube Live (một kênh tin tức tiếng Anh, Chrome trên macOS, 25/10/2026): phụ đề tiếng Việt hiện suốt buổi thử. Với TikTok LIVE, chúng tôi chỉ có kết quả của một buổi live tiếng Việt có nhạc nền: app thu được tiếng, nhưng nhận nhầm ngôn ngữ và lặp lại câu không ai nói nên phụ đề không dùng được. Chúng tôi chưa thử Facebook Live. App không có bản cho điện thoại và không đưa phụ đề vào buổi live của chính bạn cho khán giả của bạn. Xem <a href="/giai-phap/dich-livestream/">dịch livestream ra tiếng Việt</a>.</p>`,
  },
  {
    q: "Có cách dịch phụ đề họp sang tiếng Việt miễn phí không?",
    a: `<p>AI Translator có gói Free dùng thử 10 ngày, tối đa 30 phút dịch mỗi ngày, không cần thẻ hay tài khoản. Đó là dùng thử, không phải miễn phí vĩnh viễn; sau đó cần gói trả trước: Monthly 50.000 ₫, 6 Months 269.000 ₫ hoặc Yearly 500.000 ₫.</p>`,
  },
  {
    q: "Tôi ở ngoài Việt Nam có mua được không?",
    a: `<p>Được. Ngoài chuyển khoản VietQR bằng VND (từ ngân hàng Việt Nam), màn hình Nâng cấp trong app cho trả bằng thẻ quốc tế, tính bằng USD, qua trang thanh toán của Creem: Monthly 3,99 USD, 6 Months 21,99 USD, Yearly 39,99 USD, chưa gồm thuế. Thẻ không nhận được ở một số nước, theo danh sách của Creem. Gói Free dùng thử không cần phương thức thanh toán.</p>`,
  },
];

export default {
  id: "home",
  lang: "vi",
  path: "/",
  title: "Dịch livestream và họp bằng phụ đề AI, chạy offline | AI Translator",
  description:
    "Phụ đề tiếng Việt dịch trực tiếp cho livestream, video và họp Zoom, Teams, Meet, Zalo: từ tiếng Anh, Trung, Nhật, Hàn. AI chạy trên máy, âm thanh không lên cloud.",
  software: true,
  modified: "2026-10-27",
  llm: "Trang chủ: AI Translator là gì, dịch cuộc họp và livestream bằng phụ đề, Gõ dịch tin nhắn, xem lại lịch sử bản chép lời, hướng dẫn sử dụng bốn bước, dữ liệu ở lại trên máy, bảng giá và câu hỏi thường gặp.",
  llmTitle: "AI Translator: trang chủ",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    ...VIDEO_ITEMS.map((v) => videoObject({ lang: "vi", kind: v.kind, name: v.label, description: v.text, uploadDate: "2026-10-26" })),
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

<section class="section" id="tinh-nang-chinh"><div class="container">
${sectionHead({ eyebrow: "Tính năng chính", title: "Dịch họp, Gõ dịch, xem lại lịch sử", center: true })}
${featureTabs({
  listLabel: "Chọn tính năng",
  tabs: [
    {
      id: "dich-cuoc-hop",
      icon: "captions",
      label: "Dịch họp",
      title: "Nghe họp bằng ngoại ngữ, đọc phụ đề bằng tiếng của bạn",
      lead: "App nghe âm thanh đang phát trên máy và hiện bản dịch trên thanh phụ đề nổi. Không bot nào vào phòng họp.",
      bullets: [
        "Năm ngôn ngữ, dịch qua lại mọi chiều: Anh, Trung, Nhật, Hàn, Việt; tự nhận diện ngôn ngữ đang nói",
        `Phụ đề hiện sau khi người nói dừng câu: trung vị dưới 1,1 giây trên Mac M4 Pro (gói model Chuẩn), máy khác có thể chậm hơn (<a href="/tinh-nang/#hieu-nang">điều kiện đo</a>)`,
        `Dùng với Zoom, Teams, Meet, Zalo; họp tại chỗ qua nguồn <strong>Micro</strong> (<a href="/tinh-nang/#micro">cách dùng</a>); livestream xem trên máy tính (<a href="/giai-phap/dich-livestream/">dịch livestream</a>)`,
      ],
      cta: { href: "/tinh-nang/", label: "Xem tất cả tính năng" },
      media: demoVideo({ lang: "vi", kind: MEETING_VIDEO.kind, label: MEETING_VIDEO.label, fallback: MEETING_VIDEO.fallback }),
    },
    {
      id: "go-dich",
      icon: "keyboard",
      label: "Gõ dịch",
      title: "Trả lời bằng tiếng của người bên kia",
      lead: "Bấm ⌃⌥G (Windows: Ctrl+Alt+G) ở ô chat đang dùng, gõ bằng tiếng của bạn rồi bấm Enter: bản dịch được dán vào ô chat để bạn xem lại và gửi.",
      bullets: [
        "Dán vào ô bạn đang gõ, ở app nhận được lệnh dán (⌘V, Ctrl+V)",
        "Dịch trên máy bạn: chữ bạn gõ không rời máy",
        "Có ở mọi gói, không trừ thời lượng dịch",
      ],
      cta: { href: "/huong-dan/go-dich/", label: "Xem hướng dẫn Gõ dịch" },
      media: demoVideo({ lang: "vi", kind: TYPING_VIDEO.kind, label: TYPING_VIDEO.label, fallback: TYPING_VIDEO.fallback }),
    },
    {
      id: "lich-su",
      icon: "history",
      label: "Lịch sử",
      title: "Xem lại cuộc họp sau khi kết thúc",
      lead: "Mỗi phiên dịch có bản chép lời gồm giờ, câu gốc và bản dịch của từng câu.",
      bullets: [
        "Mọi gói: xem, tìm và sao chép bản chép lời của phiên gần nhất",
        "Tính năng Pro: lưu lịch sử các phiên, mở lại phiên cũ, xuất TXT, SRT hoặc Markdown",
        "Lưu lịch sử mặc định tắt; khi bật, dữ liệu được mã hóa và chỉ nằm trên máy bạn",
      ],
      cta: { href: "/huong-dan/lich-su-va-xuat-file/", label: "Xem hướng dẫn Lịch sử" },
      media: appShot({ slug: "app-history", lang: "vi", alt: "Màn hình Lịch sử: danh sách các phiên đã lưu với ngày giờ, số phút, số câu, đoạn xem trước và nút Mở, Xóa", caption: "Lịch sử: các phiên đã lưu trên máy bạn." }),
    },
  ],
})}
</div></section>

<section class="section section-alt" id="cach-dung"><div class="container">
${sectionHead({ eyebrow: "Hướng dẫn sử dụng", title: "Bắt đầu dùng trong bốn bước", text: "Cài và thiết lập một lần, sau đó mỗi cuộc họp chỉ cần bấm Bắt đầu.", center: true })}
<div class="split wide-left">
${steps([
  { title: "Cài bằng một dòng lệnh", text: `Dán lệnh ở trang <a href="/tai-xuong/">Tải xuống</a> vào Terminal (macOS) hoặc PowerShell (Windows).` },
  { title: "Thiết lập lần đầu", text: "Chọn ngôn ngữ, tải model (khoảng 1,3 GB hoặc 2,5 GB) và cho phép ghi âm thanh hệ thống (chỉ macOS)." },
  { title: "Bấm Bắt đầu khi họp", text: "Chọn ngôn ngữ ở ô <strong>Dịch sang</strong>, bấm <strong>Bắt đầu</strong> (⌃⌥T, Windows: Ctrl+Alt+T)." },
  { title: "Trả lời và xem lại", text: "Bấm ⌃⌥G (Windows: Ctrl+Alt+G) để Gõ dịch; họp xong mở <strong>Bản chép lời</strong> hoặc <strong>Lịch sử</strong>." },
], true)}
${appShot({ slug: "app-home-running", lang: "vi", alt: "Màn hình chính của AI Translator khi đang dịch: trạng thái Đang dịch, ngôn ngữ, nguồn âm thanh và số phút còn lại", caption: "Màn hình chính khi đang dịch (gói Monthly)." })}
</div>
<p class="disclaimer">Bản macOS ký ad-hoc, chưa notarize; bản Windows chưa ký mã. Cài bằng dòng lệnh thì macOS mở app thẳng và SmartScreen không hỏi; file tải bằng trình duyệt có thể bị chặn hoặc cảnh báo ở lần mở đầu. Xem hướng dẫn cài trên <a href="/huong-dan/cai-dat-macos/">macOS</a> và <a href="/huong-dan/cai-dat-windows/">Windows</a>.</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/huong-dan/bat-dau-nhanh/">Đọc hướng dẫn bắt đầu nhanh ${icon("arrow-right")}</a></p>
</div></section>

<section class="section band-dark" id="rieng-tu-tren-may"><div class="container">
${sectionHead({ eyebrow: "Dữ liệu ở lại trên máy bạn", title: "AI chạy ngay trên máy, nên cuộc họp không rời khỏi máy", center: true })}
${dataFlow("vi")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "Âm thanh không rời máy", text: "Âm thanh chỉ nằm trong RAM, không ghi đĩa, không gửi qua mạng (chúng tôi đã kiểm tra bằng proxy trên macOS). Mất mạng thì app vẫn dịch.", accent: true })}
${feature({ icon: "shield", title: "Máy chủ không có nội dung cuộc họp", text: "Máy chủ chỉ lưu dữ liệu để bán gói, kích hoạt máy và hỗ trợ bạn (chi tiết bên dưới), không có nội dung cuộc họp." })}
</div>
<details class="more-details reveal"><summary>Máy chủ lưu chính xác những gì?</summary><p>Máy chủ của chúng tôi chỉ lưu email (khi mua, hay khi bạn tự để lại trong chat hỗ trợ), đơn hàng, license, thông tin kích hoạt máy (mã băm ID máy, tên máy), mốc dùng thử Free (mã băm ID máy), nhật ký thay đổi license, báo cáo lỗi đã che dữ liệu cá nhân (giữ 30 ngày) và tin nhắn chat hỗ trợ khi bạn dùng chat (giữ 90 ngày), không có nội dung cuộc họp.</p></details>
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
