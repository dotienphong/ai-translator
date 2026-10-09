import { pageHero, sectionHead, feature, checkList, callout, ctaBand, appShot, overlayShot, facts, linkCard } from "../../build/components.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Giải pháp", path: "/giai-phap/" },
  { name: "Webinar và video", path: "/giai-phap/dich-webinar-va-video/" },
];

export default {
  id: "solutions-webinar",
  lang: "vi",
  path: "/giai-phap/dich-webinar-va-video/",
  title: "Phụ đề dịch cho webinar, khóa học và video",
  description:
    "Đọc phụ đề dịch khi xem webinar, khóa học, video bằng ngoại ngữ với AI Translator: không cài gì vào trình duyệt, chạy offline, có bản chép lời để học lại.",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "Cách dùng AI Translator để đọc phụ đề dịch khi xem webinar, khóa học và video: không cần cài vào trình duyệt, phiên dài, câu gốc kèm bản dịch, xuất bản chép lời, từ điển thuật ngữ, mẹo và giới hạn.",
  llmTitle: "Phụ đề dịch cho webinar, khóa học và video",
  body: () => `
${pageHero({
  crumbs,
  title: "Phụ đề dịch cho webinar, khóa học và video",
  lead: "AI Translator hiện phụ đề dịch ngay trên màn hình khi bạn xem webinar, hội thảo trực tuyến, khóa học hay video bằng ngoại ngữ. Nó nghe âm thanh phát ra từ máy tính nên không cần cài gì vào trình duyệt hay nền tảng, và việc nhận dạng cùng dịch chạy trên máy bạn.",
  meta: "<span>Cập nhật {{updated}}</span><span>Đã thử trên macOS · Windows mới đo sơ bộ độ trễ</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["Dùng với", "Bất cứ thứ gì phát tiếng trên máy<small>Trình duyệt, app trình phát, nền tảng khóa học, webinar</small>"],
  ["Cần cài thêm", "Không gì ngoài chính app<small>Không tiện ích trình duyệt, không plugin, không tài khoản đăng nhập</small>"],
  ["Ngôn ngữ", "tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt<small>Chọn ngôn ngữ bạn muốn đọc</small>"],
  ["Phiên dài", "Đã chạy liên tục 5 giờ 23 phút không lỗi<small>Mac M4 Pro, macOS, bản release ký ad-hoc, một lần thử</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Dành cho ai", title: "Khi nội dung hay nhưng không phải tiếng của bạn", center: true })}
<div class="grid grid-3">
${feature({ icon: "book", title: "Người học trực tuyến", text: "Khóa học và video bài giảng bằng tiếng Anh, Trung, Nhật, Hàn mà bạn muốn theo kịp ngay, không chờ ai dịch." })}
${feature({ icon: "users", title: "Người theo dõi hội thảo", text: "Webinar và hội thảo trực tuyến của diễn giả nước ngoài, nơi bạn chỉ nghe chứ không nói." })}
${feature({ icon: "play", title: "Người xem video chuyên ngành", text: "Video kỹ thuật, bài nói chuyện, phỏng vấn mà phụ đề có sẵn không có ngôn ngữ của bạn." })}
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Không cần cài thêm", title: "Không phụ thuộc trình phát hay nền tảng" })}
<p>Vì AI Translator thu âm thanh đang phát trên máy tính, nó không phụ thuộc vào trang web hay nền tảng bạn xem. Bạn bấm <strong>Bắt đầu</strong>, rồi phát video; phụ đề dịch hiện trên thanh nổi phía trên cửa sổ trình phát. Chúng tôi đã thử với video trên trình duyệt, nhưng chưa thử riêng từng nền tảng khóa học hay webinar.</p>
<p>Trên macOS, bạn cấp quyền <em>Ghi âm thanh hệ thống</em> một lần; app không dùng micro. Xem <a href="/huong-dan/cap-quyen-thu-am-macos/">cách cấp quyền ghi âm</a>.</p>
</div></section>

<section class="section"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">Đọc cả hai</span>
<h2>Câu gốc và bản dịch cùng lúc</h2>
<p>Mục <em>Hiện câu gốc phía trên bản dịch</em> ở Cài đặt › Phụ đề (mặc định đã bật) cho bạn đọc câu gốc chữ nhỏ ngay trên bản dịch. Cách này hợp với người đang học ngoại ngữ hoặc muốn đối chiếu thuật ngữ.</p>
${checkList([
  "Cỡ chữ 14–48 px, 5 màu chữ, 5 màu nền, độ mờ tùy chỉnh",
  "Cuộn lên xem lại câu cũ bằng con lăn hoặc phím tắt, nút <em>Mới nhất</em> đưa về hiện tại",
  "<em>Độ nhạy ngắt câu</em> chỉnh 50–800 ms: khi xem video không cần phản hồi tức thì, bạn có thể tăng lên để câu ít bị cắt hơn",
])}
</div>
<div>
${overlayShot({ slug: "overlay-custom", lang: "vi", alt: "Thanh phụ đề tùy chỉnh: chữ vàng trên nền xanh navy, câu gốc chữ nhỏ ở trên bản dịch tiếng Việt", caption: "Cùng một thanh, đổi sang chữ vàng và nền navy." })}
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Phiên dài", title: "Xem hết một buổi dài, không gián đoạn" })}
<p>Một phiên dịch liên tục <strong>5 giờ 23 phút</strong> (video bài giảng tiếng Anh phát trên trình duyệt) đã chạy xong với 6019 đoạn, không lỗi, độ trễ trung vị 0,48 giây. Điều kiện: Mac M4 Pro, macOS, bản release ký ad-hoc, thử một lần; không phải kiểm thử chính thức. Thử nghiệm ổn định 2 giờ cũng không có tiến trình nào phải khởi động lại.</p>
${callout({ title: "Hạn mức cho buổi dài.", text: "Phút chỉ tính theo tiếng nói đã dịch, không tính im lặng; câu đã ở đúng ngôn ngữ bạn muốn đọc không bị tính, nhưng đoạn bạn tua lại nghe lần hai thì có. Free chỉ có 30 phút mỗi ngày trong 10 ngày dùng thử, nên một webinar dài cần Monthly (50 giờ mỗi 30 ngày) hoặc Yearly (không giới hạn). Xem <a href=\"/bang-gia/\">bảng giá</a>." })}
</div></section>

<section class="section"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-transcript", lang: "vi", alt: "Bản chép lời gồm giờ, câu gốc và bản dịch, có ô tìm kiếm, nút sao chép tất cả và chọn định dạng xuất", caption: "Bản chép lời: tìm, sao chép, xuất TXT, SRT hoặc Markdown." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Học lại</span>
<h2>Giữ bản chép lời để xem lại</h2>
${checkList([
  "<strong>Sao chép tất cả</strong> bản chép lời (giờ, câu gốc, bản dịch) dùng được ở mọi gói",
  "<strong>Xuất TXT, SRT, Markdown</strong> và lưu lịch sử là tính năng Pro",
  "<strong>TXT và Markdown</strong> ghi giờ đồng hồ của từng câu; <strong>SRT</strong> ghi mốc tính từ lúc bạn bấm Bắt đầu và cho chọn chữ là bản dịch hay câu gốc",
])}
<p class="small muted">SRT không tự khớp với video. Chỉ khi bạn bấm Bắt đầu đúng lúc video chạy từ giây 0, mốc mới gần khớp; nếu không, hãy chỉnh lệch thời gian bằng công cụ phụ đề của bạn. Xem <a href="/huong-dan/lich-su-va-xuat-file/">lịch sử và xuất file</a>.</p>
</div>
</div>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Khóa học chuyên ngành", title: "Từ điển thuật ngữ cho nội dung kỹ thuật" })}
<p>Khóa học y khoa, tài chính hay lập trình đầy thuật ngữ mà bộ dịch dễ dịch lệch. Thêm cặp thuật ngữ nguồn → đích vào <strong>Từ điển thuật ngữ</strong> (Pro): tối đa 500 mục, nhập và xuất CSV, không phân biệt hoa thường. App đưa thuật ngữ cho bộ dịch như một gợi ý, nên không bảo đảm đúng mọi lần. Xem <a href="/huong-dan/tu-dien-thuat-ngu/">hướng dẫn từ điển thuật ngữ</a>.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Mẹo", title: "Để xem mượt hơn" })}
${checkList([
  "<strong>Chọn nguồn Chỉ {tên app} (macOS):</strong> ở Cài đặt › Âm thanh, chọn trình duyệt hay app trình phát để thông báo và âm thanh khác không bị dịch. Danh sách chỉ có app đang phát tiếng nên hãy phát video trước rồi bấm <em>Làm mới danh sách</em>.",
  "<strong>Tắt tiếng thông báo</strong> của máy khi xem, nhất là trên Windows, nơi chưa chọn được từng app.",
  "<strong>Khóa ngôn ngữ nguồn</strong> khi cả buổi chỉ một ngôn ngữ; giữ Tự nhận diện khi diễn giả đổi tiếng.",
  "<strong>Bấm Bắt đầu trước khi phát:</strong> app nạp model trong vài giây đầu (lần đầu sau khi cài hoặc cập nhật có thể lâu hơn, tới vài phút).",
])}
<p>Năm ngôn ngữ dùng được theo mọi chiều. Chúng tôi chỉ đo chất lượng dịch cho các chiều có tiếng Việt; các cặp khác (ví dụ Anh sang Nhật) chạy được nhưng chưa có điểm đo.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Trung thực", title: "Giới hạn bạn nên biết" })}
${checkList([
  "<strong>Bản dịch có thể sai,</strong> nhất là thuật ngữ, tên riêng và tiếng nói không rõ. Đừng dựa vào nó cho quyết định quan trọng khi chưa kiểm tra lại.",
  "<strong>Độ trễ</strong> trung vị 0,76–1,03 giây khi đo trên Mac M4 Pro, gói model Chuẩn. Máy yếu hơn sẽ chậm hơn; chưa đo Mac M1. Với video bạn không cần phản hồi, độ trễ ít quan trọng hơn khi họp.",
  "<strong>Nhận dạng</strong> kém rõ hơn ở gói model Nhẹ với tiếng Việt, Nhật, Hàn, Trung, và kém hơn khi tiếng nói không rõ, ví dụ nhạc nền lớn hay tiếng ồn.",
  "<strong>Chạy trên macOS</strong> (Apple Silicon, 14.2+) <strong>và Windows 10/11</strong> (x64). Bản dịch chỉ hiện trên thanh nổi, không chèn vào video và không thay phụ đề chính thức của nhà phát hành.",
], true)}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Đọc tiếp", title: "Bước tiếp theo", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/huong-dan/bat-dau-nhanh/", icon: "zap", title: "Bắt đầu nhanh", text: "Từ cài đặt tới phụ đề đầu tiên.", more: "Xem hướng dẫn" })}
${linkCard({ href: "/giai-phap/dich-hop-truc-tuyen/", icon: "users", title: "Họp trực tuyến", text: "Dùng cho Zoom, Teams, Meet, Zalo.", more: "Xem giải pháp" })}
${linkCard({ href: "/tinh-nang/", icon: "sliders", title: "Tính năng", text: "Toàn bộ tính năng và số đo hiệu năng.", more: "Xem tính năng" })}
</div>
<p class="center-text reveal">Cần biết nội dung của bạn có bị gửi đi đâu không? Xem <a href="/bao-mat-du-lieu/">dữ liệu và bảo mật</a>.</p>
</div></section>

${ctaBand({ title: "Xem thử một video của bạn", text: "Dùng thử Free 10 ngày, mỗi ngày 30 phút. Không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/bang-gia/", label: "Xem bảng giá" } })}
`,
};
