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
    "Hướng dẫn sử dụng AI Translator từng bước: cài đặt trên macOS và Windows, cấp quyền ghi âm, thanh phụ đề và phím tắt, từ điển, lịch sử, mua key và khắc phục sự cố.",
  schemaType: "CollectionPage",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "Mục lục chín bài hướng dẫn sử dụng AI Translator: bắt đầu nhanh, cài đặt macOS, cài đặt Windows, cấp quyền ghi âm trên macOS, thanh phụ đề và phím tắt, từ điển thuật ngữ, lịch sử và xuất file, mua và kích hoạt key, khắc phục sự cố.",
  llmTitle: "Hướng dẫn sử dụng AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Hướng dẫn sử dụng AI Translator",
  lead: "Chín bài hướng dẫn từng bước cho AI Translator, từ cài đặt trên macOS và Windows tới mua key và xử lý sự cố. Mỗi bài dùng đúng tên nút và tên mục trong app; phần lớn có ảnh chụp giao diện thật.",
})}

<section class="section-tight"><div class="container">
${callout({ title: "Hướng dẫn dùng cho cả macOS và Windows.", text: "Phần lớn các bước giống nhau trên hai hệ điều hành. Khác biệt chính trên Windows: cài bằng file .exe và có thể phải qua cảnh báo SmartScreen vì bản beta chưa được ký mã, không cần cấp quyền ghi âm, biểu tượng nằm ở khay hệ thống thay cho menu bar, phím tắt dùng Ctrl+Alt thay cho ⌃⌥. Chưa có bản cài? Xem trang <a href=\"/tai-xuong/\">nhận bản beta</a>." })}
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Bắt đầu", title: "Từ file cài đặt tới phụ đề đầu tiên" })}
<div class="grid grid-2">
${linkCard({ href: "/huong-dan/bat-dau-nhanh/", icon: "play", title: "Bắt đầu nhanh", text: "Bảy bước thiết lập một lần rồi dịch cuộc họp đầu tiên, kèm ảnh các màn hình thiết lập của app.", more: MORE })}
${linkCard({ href: "/huong-dan/cai-dat-macos/", icon: "download", title: "Cài đặt trên macOS", text: "Cài bằng một dòng lệnh, hoặc từ file .dmg (kéo vào Applications, Open Anyway), kiểm mã SHA-256 và gỡ cài đặt.", more: MORE })}
${linkCard({ href: "/huong-dan/cai-dat-windows/", icon: "download", title: "Cài đặt trên Windows", text: "Yêu cầu máy, kiểm mã SHA-256, qua cảnh báo SmartScreen bằng Run anyway, mở lần đầu và gỡ cài đặt.", more: MORE })}
${linkCard({ href: "/huong-dan/cap-quyen-thu-am-macos/", icon: "mic", title: "Cấp quyền ghi âm thanh (macOS)", text: "Trả lời hộp thoại Ghi âm thanh hệ thống, bật lại trong System Settings và chọn nguồn âm thanh.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Dùng hằng ngày", title: "Làm chủ thanh phụ đề, từ điển và bản chép lời" })}
<div class="grid grid-3">
${linkCard({ href: "/huong-dan/thanh-phu-de-va-phim-tat/", icon: "captions", title: "Thanh phụ đề và phím tắt", text: "Kéo, khóa, ẩn và cuộn thanh phụ đề, chỉnh cỡ chữ và màu, bảng phím tắt và menu ở menu bar.", more: MORE })}
${linkCard({ href: "/huong-dan/tu-dien-thuat-ngu/", icon: "book", title: "Dùng từ điển thuật ngữ", text: "Thêm tên riêng và thuật ngữ, nhập xuất CSV, và hiểu vì sao từ điển chỉ là gợi ý cho bộ dịch.", more: MORE })}
${linkCard({ href: "/huong-dan/lich-su-va-xuat-file/", icon: "history", title: "Lịch sử và xuất bản chép lời", text: "Bật lưu lịch sử, xem lại các phiên, sao chép bản chép lời và xuất TXT, SRT hoặc Markdown.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Mua gói và hỗ trợ", title: "Gói, key và khi có trục trặc" })}
<div class="grid grid-2">
${linkCard({ href: "/huong-dan/mua-va-kich-hoat-key/", icon: "key", title: "Mua gói, kích hoạt key và đổi máy", text: "Mua Monthly hoặc Yearly bằng VietQR trong app, nhập key, đổi máy, gia hạn và lấy lại key đã mất.", more: MORE })}
${linkCard({ href: "/huong-dan/khac-phuc-su-co/", icon: "support", title: "Khắc phục sự cố", text: "Không có phụ đề, hết hạn mức, key bị khóa, tải model lỗi: nguyên nhân và cách xử lý từng trường hợp.", more: MORE })}
</div>
</div></section>

<section class="section-tight"><div class="container narrow">
${sectionHead({ title: "Tìm nhanh theo tình huống" })}
${facts([
  ["macOS chặn app lần đầu mở", "Xem <a href=\"/huong-dan/cai-dat-macos/\">cài đặt trên macOS</a>: cài bằng một dòng lệnh để mở thẳng, hoặc mục Mở lần đầu nếu dùng file .dmg"],
  ["Windows hiện màn hình “Windows protected your PC”", "Xem <a href=\"/huong-dan/cai-dat-windows/\">cài đặt trên Windows</a>, mục Chạy bộ cài"],
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
<p>Không thấy câu trả lời trong các bài trên? Xem <a href="/cau-hoi-thuong-gap/">câu hỏi thường gặp</a> hoặc nhắn cho chúng tôi ở trang <a href="/lien-he/">liên hệ</a>. Bạn có thể gửi thư tới <strong>support@aitranslator.io.vn</strong>.</p>
<p class="more-link"><a class="btn btn-secondary" href="/lien-he/">Liên hệ hỗ trợ ${icon("arrow-right")}</a> <a class="btn btn-ghost" href="/cau-hoi-thuong-gap/">Câu hỏi thường gặp</a></p>
</div>
</div></section>
`,
};
