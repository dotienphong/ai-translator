import { pageHero, sectionHead, feature, linkCard, callout, facts, ctaBand } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Về AI Translator", path: "/ve-chung-toi/" },
];

const MAIL = `<a href="mailto:${SITE.email}">${SITE.email}</a>`;

export default {
  id: "about",
  lang: "vi",
  path: "/ve-chung-toi/",
  title: "Về AI Translator: câu chuyện, nguyên tắc và người làm",
  description:
    "AI Translator là app dịch phụ đề cuộc họp chạy offline do Đỗ Tiến Phong, một nhà phát triển cá nhân, xây dựng. Câu chuyện, nguyên tắc và trạng thái beta.",
  schemaType: "AboutPage",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "Câu chuyện hình thành, nguyên tắc sản phẩm, người làm (Đỗ Tiến Phong, nhà phát triển cá nhân), trạng thái beta, các hướng đang cân nhắc (chưa cam kết), việc dùng thành phần mã nguồn mở của bên thứ ba và thông tin pháp lý.",
  llmTitle: "Về AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Về AI Translator: dịch cuộc họp ngay trên máy bạn",
  lead: "AI Translator là ứng dụng desktop hiện phụ đề dịch trực tiếp cho âm thanh cuộc họp, chạy offline trên máy tính. Sản phẩm do Đỗ Tiến Phong, một nhà phát triển cá nhân, xây dựng và vận hành. Hiện đang ở giai đoạn beta: macOS trước, Windows sau.",
  meta: "<span>Cập nhật 08/10/2026</span><span>Bên cung cấp: Đỗ Tiến Phong</span>",
})}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["Sản phẩm", "Phụ đề dịch trực tiếp cho cuộc họp, webinar và video<small>Nhận dạng giọng nói và dịch chạy trên máy bạn</small>"],
  ["Bên cung cấp", "Đỗ Tiến Phong (cá nhân)<small>Nhà phát triển cá nhân</small>"],
  ["Trạng thái", "Beta<small>macOS 14.2+ (Apple Silicon) trước, Windows sắp có</small>"],
  ["Hỗ trợ", `${MAIL}<small>Bạn có thể viết bằng tiếng Việt hoặc English</small>`],
  ["Ngôn ngữ", "English, 中文, 日本語, 한국어, Tiếng Việt<small>Giao diện app có tiếng Việt và English</small>"],
  ["Giấy phép", "Sản phẩm thương mại, không phải mã nguồn mở<small>Có dùng các thành phần mã nguồn mở của bên thứ ba</small>"],
])}</div>
</div></section>

<section class="section" id="cau-chuyen"><div class="container narrow">
${sectionHead({ eyebrow: "Câu chuyện", title: "Vì sao có AI Translator" })}
<div class="prose">
<p>Ý tưởng ban đầu là chuyển một app dịch offline cho Android (mã nguồn mở) sang dịch cuộc gọi và cuộc họp. Chúng tôi sớm chạm vào một giới hạn của hệ điều hành. Android chỉ cho ứng dụng bên thứ ba thu âm thanh phát ra từ media và trò chơi; âm thanh của cuộc gọi và cuộc gọi VoIP thì không, và khi đang có cuộc gọi, micro của app thường chỉ nhận được im lặng.</p>
<p>Trên máy tính thì khác. Cả Windows lẫn macOS (từ bản 14.2) đều có cách cho phép một ứng dụng thu chính âm thanh đang phát ra từ máy. Hướng đi vì thế chuyển sang máy tính: một app nghe âm thanh hệ thống, nhận dạng giọng nói, dịch rồi hiện phụ đề, dùng được với bất kỳ app họp nào mà không cần bot hay plugin.</p>
<p>Khi tìm hiểu (tháng 9/2026), chúng tôi thấy phụ đề dịch của các app họp lớn thường nằm ở gói trả phí cao hơn và xử lý trên cloud; công cụ của bên thứ ba phần lớn cũng vậy. Chúng tôi muốn một lựa chọn khác: xử lý hoàn toàn trên máy bạn, dùng được với mọi app họp, chú trọng tiếng Việt, và vì không có máy chủ nào dịch hộ nên chúng tôi không phải trả thêm chi phí hạ tầng cho từng phút bạn dùng. <a href="/so-sanh/dich-offline-va-cloud/">So sánh dịch offline và dịch cloud</a>.</p>
<p>Model dịch được chọn bằng số đo. Trong thử nghiệm nội bộ ngày 29/09/2026 trên 320 câu văn bản (năm chiều dịch, chạy trên Mac M4 Pro), model được chọn đạt điểm COMET 0,837, trong khi ba model dịch khác được thử cùng điều kiện đạt từ 0,736 đến 0,833. Đó là phép thử trên văn bản chứ chưa phải giọng nói thật, và chúng tôi không so với bất kỳ dịch vụ cloud nào.</p>
</div>
</div></section>

<section class="section section-alt" id="nguyen-tac"><div class="container">
${sectionHead({ eyebrow: "Nguyên tắc", title: "Sáu điều chúng tôi giữ khi làm sản phẩm", center: true })}
<div class="grid grid-3">
${feature({ icon: "shield", title: "Riêng tư theo thiết kế", text: "Âm thanh chỉ nằm trong RAM, không ghi đĩa, không gửi đi. Máy chủ chỉ giữ dữ liệu cần cho bản quyền, đơn hàng và dùng thử. Chi tiết ở <a href=\"/bao-mat-du-lieu/\">Dữ liệu và bảo mật</a>.", accent: true })}
${feature({ icon: "wifi-off", title: "Offline khi dịch", text: "Nhận dạng giọng nói và dịch chạy trên máy. Mạng chỉ cần để tải model, đăng ký dùng thử, mua và kiểm tra bản quyền, cập nhật app." })}
${feature({ icon: "info", title: "Trung thực về trạng thái", text: "Beta thì ghi là beta. macOS chưa notarize, Windows chưa phát hành, máy nào chưa đo: chúng tôi nói thẳng, trên website và trong app." })}
${feature({ icon: "lock", title: "Không quảng cáo, không analytics", text: "App không có quảng cáo, không có analytics, không tự gửi báo cáo lỗi. Chúng tôi sống nhờ gói trả phí, không nhờ dữ liệu của bạn." })}
${feature({ icon: "video", title: "Không bot, không tài khoản", text: "Không mời bot vào cuộc họp, không cài plugin, không đăng nhập. Gói trả phí kích hoạt bằng license key gửi qua email." })}
${feature({ icon: "gauge", title: "Số đo kèm điều kiện", text: "Con số về tốc độ hay chất lượng trên website này đều ghi máy đo và điều kiện; chỗ chưa đo thì ghi là chưa đo. Xem <a href=\"/tinh-nang/#hieu-nang\">hiệu năng</a>." })}
</div>
</div></section>

<section class="section" id="nguoi-lam"><div class="container narrow">
${sectionHead({ eyebrow: "Người làm", title: "Ai đứng sau AI Translator?" })}
<div class="prose">
<p>AI Translator do <strong>Đỗ Tiến Phong</strong>, một nhà phát triển cá nhân, phát triển và vận hành: từ ứng dụng desktop đến máy chủ bản quyền. Website này viết “chúng tôi” cho gọn, nhưng đây là sản phẩm của một người.</p>
<p>Chúng tôi không đăng tiểu sử dài, lời chứng thực hay logo khách hàng ở đây. Sản phẩm đang ở giai đoạn beta và chúng tôi chỉ công bố những gì kiểm chứng được: số đo kèm điều kiện, các giới hạn đã biết, điều khoản rõ ràng. Mọi câu hỏi, góp ý hay báo lỗi xin gửi tới ${MAIL}. Xem thêm <a href="/lien-he/">trang Liên hệ</a>.</p>
</div>
</div></section>

<section class="section section-alt" id="trang-thai"><div class="container narrow">
${sectionHead({ eyebrow: "Hôm nay", title: "AI Translator đang ở đâu?" })}
<div class="table-wrap reveal" role="region" aria-label="Trạng thái hiện tại của AI Translator" tabindex="0"><table>
<thead><tr><th scope="col">Hạng mục</th><th scope="col">Trạng thái</th></tr></thead>
<tbody>
<tr><th scope="row">macOS</th><td>Beta, macOS 14.2 trở lên, Apple Silicon. Chưa có tải công khai: <a href="/tai-xuong/">đăng ký nhận bản cài qua email</a>.</td></tr>
<tr><th scope="row">Windows</th><td>Sắp có (Windows 10/11, 64-bit). Chưa có ngày phát hành.</td></tr>
<tr><th scope="row">Ký số</th><td>macOS ký ad-hoc, chưa notarize, nên lần mở đầu cần bấm Open Anyway. Windows chưa có chứng thư ký mã.</td></tr>
<tr><th scope="row">Thanh toán</th><td>VietQR bằng VND qua PayOS. Chưa có thẻ quốc tế, chưa có hóa đơn điện tử.</td></tr>
<tr><th scope="row">Gói</th><td>Free dùng thử 10 ngày, Monthly, Yearly. Xem <a href="/bang-gia/">bảng giá</a>.</td></tr>
</tbody></table></div>
</div></section>

<section class="section" id="dang-can-nhac"><div class="container narrow">
${sectionHead({ eyebrow: "Phía trước", title: "Chúng tôi đang cân nhắc" })}
${callout({ kind: "warn", title: "Đây chưa phải cam kết.", text: "Danh sách dưới đây là các hướng chúng tôi đang cân nhắc cho giai đoạn kế tiếp. Chưa có ngày, chưa có thứ tự cố định, và từng mục có thể thay đổi hoặc bị bỏ tùy phản hồi của người dùng." })}
<div class="prose">
<ul>
<li>Phân biệt ai đang nói trong phụ đề</li>
<li>Hỗ trợ Windows ARM64</li>
<li>Thu âm thanh theo từng app trên Windows</li>
<li>Dịch hai chiều bằng giọng nói, để giọng của bạn cũng được dịch cho người cùng họp</li>
<li>Tóm tắt và biên bản cuộc họp</li>
<li>Bán ra nước ngoài, kèm thanh toán quốc tế</li>
<li>Gói doanh nghiệp cho nhiều máy</li>
<li>Thêm ngôn ngữ cho âm thanh nguồn và bản dịch (ngoài năm ngôn ngữ hiện có)</li>
<li>Thêm ngôn ngữ giao diện</li>
</ul>
<p>Thứ tự tùy vào phản hồi của người dùng, nên hãy cho chúng tôi biết điều bạn cần nhất qua <a href="/lien-he/">trang Liên hệ</a>.</p>
</div>
</div></section>

<section class="section section-alt" id="cong-nghe"><div class="container narrow">
${sectionHead({ eyebrow: "Giấy phép", title: "Thành phần mã nguồn mở của bên thứ ba", text: "AI Translator là sản phẩm thương mại và không phải mã nguồn mở: Thỏa thuận cấp phép không cho sao chép, dịch ngược hay đổi tên thương hiệu. Nhưng nó dùng nhiều thành phần mở của bên thứ ba, và chúng tôi ghi nhận chúng." })}
<p class="small muted">Model gốc được phân phối lại không sửa đổi, kèm giấy phép. Danh sách thành phần và giấy phép đầy đủ nằm trong app, ở Giới thiệu › Giấy phép mã nguồn mở. Zoom, Microsoft Teams, Google Meet và Zalo chỉ được nhắc để nói về khả năng tương thích; AI Translator không liên kết với các công ty này.</p>
</div></section>

<section class="section" id="phap-ly"><div class="container narrow">
${sectionHead({ eyebrow: "Pháp lý", title: "Thông tin pháp lý ngắn gọn" })}
<div class="reveal">${facts([
  ["Bên cung cấp", "Đỗ Tiến Phong (cá nhân)"],
  ["Thương hiệu", "AI Translator"],
  ["Luật áp dụng", "Pháp luật Việt Nam<small>Tranh chấp do Tòa án có thẩm quyền tại Việt Nam giải quyết (Điều khoản sử dụng, mục 14)</small>"],
  ["Điều khoản sử dụng", `<a href="/dieu-khoan/">Thỏa thuận cấp phép (EULA)</a><small>Phiên bản 1.1, hiệu lực từ 07/10/2026</small>`],
  ["Quyền riêng tư", `<a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a><small>Phiên bản 1.1, hiệu lực từ 07/10/2026</small>`],
  ["Ngôn ngữ văn bản", "Bản tiếng Việt là bản gốc và được ưu tiên<small>Bản tiếng Anh là bản dịch để tham khảo</small>"],
  ["Liên hệ về dữ liệu cá nhân", MAIL],
])}</div>
</div></section>

<section class="section-tight"><div class="container">
<h2 class="sr-only">Đọc tiếp</h2>
<div class="grid grid-3">
${linkCard({ href: "/tinh-nang/", icon: "captions", title: "Tính năng", text: "Những gì AI Translator làm được hôm nay, đúng như trong app.", more: "Xem tính năng" })}
${linkCard({ href: "/bao-mat-du-lieu/", icon: "shield", title: "Dữ liệu và bảo mật", text: "Dữ liệu nào ở lại trên máy, app kết nối tới đâu, máy chủ lưu gì.", more: "Đọc chi tiết" })}
${linkCard({ href: "/bang-gia/", icon: "wallet", title: "Bảng giá", text: "Free dùng thử 10 ngày, Monthly 50.000 ₫, Yearly 500.000 ₫.", more: "Xem bảng giá" })}
</div>
</div></section>

${ctaBand({ title: "Thử trên cuộc họp thật của bạn", text: "Đăng ký nhận bản beta cho macOS, dùng thử Free 10 ngày. Không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Nhận bản beta" }, secondary: { href: "/lien-he/", label: "Liên hệ chúng tôi" } })}
`,
};
