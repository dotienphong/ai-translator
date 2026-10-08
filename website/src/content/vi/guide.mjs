import { pageHero, sectionHead, linkCard, callout, facts, icon } from "../../build/components.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
];

const MORE = "Đọc bài hướng dẫn";

export default {
  id: "guide",
  lang: "vi",
  path: "/huong-dan/",
  title: "Hướng dẫn sử dụng AI Translator",
  description:
    "Hướng dẫn sử dụng AI Translator từng bước: cài đặt trên macOS, cấp quyền ghi âm, thanh phụ đề và phím tắt, từ điển, lịch sử, mua key và khắc phục sự cố.",
  schemaType: "CollectionPage",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "Mục lục tám bài hướng dẫn sử dụng AI Translator: bắt đầu nhanh, cài đặt macOS, cấp quyền ghi âm, thanh phụ đề và phím tắt, từ điển thuật ngữ, lịch sử và xuất file, mua và kích hoạt key, khắc phục sự cố.",
  llmTitle: "Hướng dẫn sử dụng AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Hướng dẫn sử dụng AI Translator",
  lead: "Tám bài hướng dẫn từng bước cho AI Translator, từ cài đặt trên macOS tới mua key và xử lý sự cố. Mỗi bài dùng đúng tên nút và tên mục trong app, có ảnh chụp giao diện thật.",
})}

<section class="section-tight"><div class="container">
${callout({ title: "Các hướng dẫn hiện viết cho macOS.", text: "AI Translator đang ở giai đoạn beta cho macOS 14.2 trở lên (Apple Silicon). Bản Windows 10/11 chưa phát hành nên chưa có hướng dẫn riêng. Chưa có bản cài? Xem trang <a href=\"/tai-xuong/\">nhận bản beta</a>." })}
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Bắt đầu", title: "Từ file cài đặt tới phụ đề đầu tiên" })}
<div class="grid grid-3">
${linkCard({ href: "/huong-dan/bat-dau-nhanh/", icon: "play", title: "Bắt đầu nhanh", text: "Bảy bước thiết lập một lần rồi dịch cuộc họp đầu tiên, kèm ảnh từng màn hình của app.", more: MORE })}
${linkCard({ href: "/huong-dan/cai-dat-macos/", icon: "download", title: "Cài đặt trên macOS", text: "Yêu cầu máy, kéo vào Applications, bấm Open Anyway ở lần mở đầu, kiểm mã SHA-256 và gỡ cài đặt.", more: MORE })}
${linkCard({ href: "/huong-dan/cap-quyen-thu-am-macos/", icon: "mic", title: "Cấp quyền ghi âm thanh", text: "Trả lời hộp thoại Ghi âm thanh hệ thống, bật lại trong System Settings và chọn nguồn âm thanh.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Dùng hằng ngày", title: "Làm chủ thanh phụ đề, từ điển và bản chép lời" })}
<div class="grid grid-3">
${linkCard({ href: "/huong-dan/thanh-phu-de-va-phim-tat/", icon: "captions", title: "Thanh phụ đề và phím tắt", text: "Kéo, khóa, ẩn và cuộn thanh phụ đề, chỉnh cỡ chữ và màu, bảng phím tắt và menu ở menu bar.", more: MORE })}
${linkCard({ href: "/huong-dan/tu-dien-thuat-ngu/", icon: "book", title: "Từ điển thuật ngữ", text: "Thêm tên riêng và thuật ngữ, nhập xuất CSV, và hiểu vì sao từ điển chỉ là gợi ý cho bộ dịch.", more: MORE })}
${linkCard({ href: "/huong-dan/lich-su-va-xuat-file/", icon: "history", title: "Lịch sử và xuất file", text: "Bật lưu lịch sử, xem lại các phiên, sao chép bản chép lời và xuất TXT, SRT hoặc Markdown.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Mua gói và hỗ trợ", title: "Gói, key và khi có trục trặc" })}
<div class="grid grid-2">
${linkCard({ href: "/huong-dan/mua-va-kich-hoat-key/", icon: "key", title: "Mua và kích hoạt key", text: "Mua Monthly hoặc Yearly bằng VietQR trong app, nhập key, đổi máy, gia hạn và lấy lại key đã mất.", more: MORE })}
${linkCard({ href: "/huong-dan/khac-phuc-su-co/", icon: "support", title: "Khắc phục sự cố", text: "Không có phụ đề, hết hạn mức, key bị khóa, tải model lỗi: nguyên nhân và cách xử lý từng trường hợp.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container narrow">
${sectionHead({ title: "Tìm nhanh theo tình huống" })}
${facts([
  ["macOS chặn app lần đầu mở", "Xem <a href=\"/huong-dan/cai-dat-macos/\">cài đặt trên macOS</a>, mục Mở lần đầu"],
  ["Bấm Bắt đầu mà không có phụ đề", "Xem <a href=\"/huong-dan/cap-quyen-thu-am-macos/\">cấp quyền ghi âm thanh</a> rồi <a href=\"/huong-dan/khac-phuc-su-co/\">khắc phục sự cố</a>"],
  ["Thanh phụ đề biến mất hoặc không bấm được", "Xem <a href=\"/huong-dan/thanh-phu-de-va-phim-tat/\">thanh phụ đề và phím tắt</a>, mục Ẩn và hiện, Khóa"],
  ["Muốn lưu hoặc xuất bản chép lời", "Xem <a href=\"/huong-dan/lich-su-va-xuat-file/\">lịch sử và xuất file</a>"],
  ["Cần dịch đúng tên riêng, thuật ngữ", "Xem <a href=\"/huong-dan/tu-dien-thuat-ngu/\">từ điển thuật ngữ</a>"],
  ["Đổi máy hoặc mất key", "Xem <a href=\"/huong-dan/mua-va-kich-hoat-key/\">mua và kích hoạt key</a>"],
])}
</div></section>

<section class="section-tight"><div class="container narrow">
<div class="card reveal">
<h2>Cần trợ giúp?</h2>
<p>Không thấy câu trả lời trong các bài trên? Xem <a href="/cau-hoi-thuong-gap/">câu hỏi thường gặp</a> hoặc nhắn cho chúng tôi ở trang <a href="/lien-he/">liên hệ</a>. Chúng tôi đọc và trả lời từng thư gửi tới <strong>support@aitranslator.io.vn</strong>.</p>
<p class="more-link"><a class="btn btn-secondary" href="/lien-he/">Liên hệ hỗ trợ ${icon("arrow-right")}</a> <a class="btn btn-ghost" href="/cau-hoi-thuong-gap/">Câu hỏi thường gặp</a></p>
</div>
</div></section>
`,
};
