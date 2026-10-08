import { pageHero, sectionHead, callout, facts, linkCard, icon } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Liên hệ và hỗ trợ", path: "/lien-he/" },
];

const EMAIL = SITE.email;
// Liên kết mailto có sẵn tiêu đề và mẫu nội dung. `&amp;` vì nằm trong thuộc tính HTML.
const mail = (subject, body) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&amp;body=${encodeURIComponent(body.join("\n"))}` : ""}`;

const M = {
  support: mail("Hỗ trợ kỹ thuật AI Translator", [
    "Phiên bản AI Translator (Giới thiệu):",
    "Hệ điều hành và máy (ví dụ macOS 15, MacBook Air M2; hoặc Windows 11, Intel Core i5-1235U):",
    "RAM:",
    "Card đồ họa (nếu là máy Windows):",
    "Gói model (Chuẩn hay Nhẹ):",
    "App họp đang dùng:",
    "Điều đã xảy ra:",
    "Các bước để lỗi xảy ra lại:",
  ]),
  key: mail("Mất license key AI Translator", ["Email đã dùng khi mua:", "Tôi đã thử Cài đặt › Bản quyền › Mất key? chưa (có/chưa):"]),
  payment: mail("Vấn đề thanh toán AI Translator", ["Mã đơn (dòng Đơn … trong màn hình Nâng cấp):", "Email đã dùng khi mua:", "Thời điểm và số tiền đã chuyển:", "Vấn đề:"]),
  refund: mail("Yêu cầu hoàn tiền AI Translator", ["Mã đơn:", "Ngày thanh toán:", "Lý do:"]),
  erase: mail("Yêu cầu xóa hoặc ẩn danh dữ liệu cá nhân", ["Tôi yêu cầu xóa/ẩn danh dữ liệu cá nhân gắn với email này.", "(Thư này được gửi từ chính email đã dùng khi mua.)"]),
  security: mail("[Bảo mật] Báo lỗi bảo mật AI Translator", ["Mô tả lỗi:", "Các bước để tái hiện:", "Phiên bản/thành phần bị ảnh hưởng:"]),
  feedback: mail("Góp ý cho AI Translator", ["Bạn cần thêm điều gì, hoặc điều gì chưa ổn:"]),
};

const btn = (href, label) => `<p><a class="btn btn-secondary btn-sm" href="${href}">${icon("mail")} ${label}</a></p>`;

export default {
  id: "contact",
  lang: "vi",
  path: "/lien-he/",
  title: "Liên hệ và hỗ trợ AI Translator",
  description:
    "Liên hệ AI Translator qua email support@aitranslator.io.vn: đăng ký beta, hỗ trợ kỹ thuật, mất key, thanh toán, hoàn tiền, xóa dữ liệu và báo lỗi bảo mật.",
  schemaType: "ContactPage",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "Cách liên hệ và nhận hỗ trợ: email support@aitranslator.io.vn, việc nên gửi tới đó (beta, kỹ thuật, mất key, thanh toán, hoàn tiền, xóa dữ liệu, bảo mật) và nên kèm thông tin gì.",
  llmTitle: "Liên hệ và hỗ trợ AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Liên hệ và hỗ trợ",
  lead: "Cách liên hệ AI Translator là gửi email tới support@aitranslator.io.vn. Đây là kênh hỗ trợ duy nhất: website này không có form liên hệ và chúng tôi không có số điện thoại hỗ trợ.",
})}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["Email", `<a href="mailto:${EMAIL}">${EMAIL}</a><small>Bạn có thể viết bằng tiếng Việt hoặc English</small>`],
  ["Kênh khác", "Không có<small>Không có form trên web, không có điện thoại</small>"],
  ["Phản hồi", "Chưa cam kết thời gian trả lời<small>Sản phẩm do một người vận hành nên chúng tôi chưa hứa một thời hạn cụ thể</small>"],
  ["Báo lỗi bảo mật", `<a href="/.well-known/security.txt">/.well-known/security.txt</a><small>Hoặc gửi email với tiêu đề bắt đầu bằng [Bảo mật]</small>`],
])}</div>
<p class="center-text reveal"><a class="btn btn-primary btn-lg" href="mailto:${EMAIL}">${icon("mail")} Gửi email cho chúng tôi</a></p>
<p class="disclaimer">Bạn không cần gửi mật khẩu, số thẻ hay số tài khoản ngân hàng cho bất kỳ yêu cầu nào dưới đây. Chúng tôi không cần và không nhận những thông tin đó.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Gửi gì, kèm gì", title: "Bạn cần gì? Gửi thư kèm những thông tin này", text: "Mỗi nút dưới đây mở app email của bạn với tiêu đề và mẫu nội dung có sẵn. Nếu không mở được, hãy soạn thư thủ công tới địa chỉ trên.", center: true })}
<div class="grid grid-2">

<div class="card reveal" id="beta">
<h3>Đăng ký nhận bản beta</h3>
<p>AI Translator chưa có tải công khai. Hãy gửi email theo mẫu ở trang Tải xuống (có mẫu riêng cho macOS và Windows): dòng máy và chip hoặc CPU, phiên bản macOS hoặc Windows, RAM, app họp bạn dùng và ngôn ngữ cần dịch. Khi có bản beta phù hợp với máy bạn, chúng tôi gửi bản cài kèm mã SHA-256 để bạn kiểm tra.</p>
<p><a class="btn btn-secondary btn-sm" href="/tai-xuong/">Mở trang Tải xuống ${icon("arrow-right")}</a></p>
</div>

<div class="card reveal" id="ho-tro-ky-thuat">
<h3>Hỗ trợ kỹ thuật</h3>
<p>Hãy kèm theo: phiên bản app (màn hình Giới thiệu), phiên bản macOS và chip (menu Apple › About This Mac) hoặc phiên bản Windows và CPU (Settings › System › About) cùng card đồ họa, dung lượng RAM, gói model đang dùng (Cài đặt › Model: Chuẩn hay Nhẹ), app họp bạn đang dùng, các bước dẫn tới lỗi và nội dung thông báo lỗi.</p>
<p>Nếu có thể, đính kèm log: vào Giới thiệu › Mở thư mục log. Log nằm trên máy bạn và không chứa nội dung chép lời; bạn tự quyết định có gửi hay không. Hãy thử <a href="/huong-dan/khac-phuc-su-co/">các bước khắc phục sự cố</a> trước, vì nhiều lỗi thường gặp có cách xử lý nhanh.</p>
${btn(M.support, "Gửi thư hỗ trợ kỹ thuật")}
</div>

<div class="card reveal" id="mat-key">
<h3>Mất license key</h3>
<p>Bạn tự khôi phục được: vào Cài đặt › Bản quyền › Mất key?, nhập email đã dùng khi mua rồi bấm Gửi lại key. Thư gửi từ no-reply@mail.aitranslator.io.vn, hãy kiểm cả thư mục thư rác. Nếu vẫn không nhận được, hãy gửi email cho chúng tôi từ chính email đã dùng khi mua. Xem thêm <a href="/huong-dan/mua-va-kich-hoat-key/">hướng dẫn mua và kích hoạt key</a>.</p>
${btn(M.key, "Gửi thư về key bị mất")}
</div>

<div class="card reveal" id="thanh-toan">
<h3>Khiếu nại về thanh toán</h3>
<p>Đã chuyển tiền mà chưa có key, chuyển thiếu hoặc đơn bị lỗi: hãy gửi mã đơn (dòng “Đơn …” trong màn hình Nâng cấp), email đã dùng khi mua, thời điểm và số tiền đã chuyển. Việc chuyển tiền do ngân hàng và PayOS xử lý; chúng tôi không nhận số tài khoản hay thẻ của bạn.</p>
${btn(M.payment, "Gửi thư về thanh toán")}
</div>

<div class="card reveal" id="hoan-tien">
<h3>Yêu cầu hoàn tiền</h3>
<p>Gửi yêu cầu trong <strong>7 ngày</strong> kể từ ngày thanh toán, kèm mã đơn và lý do. Đã thanh toán thì không hoàn lại, trừ khi lỗi do phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác; đổi gói không được hoàn tiền. Chi tiết trong <a href="/dieu-khoan/">Điều khoản sử dụng</a>.</p>
${btn(M.refund, "Gửi yêu cầu hoàn tiền")}
</div>

<div class="card reveal" id="xoa-du-lieu">
<h3>Xóa hoặc ẩn danh dữ liệu cá nhân</h3>
<p>Hãy gửi yêu cầu <strong>từ chính email đã dùng khi mua</strong> để chúng tôi xác nhận là bạn. Chúng tôi sẽ bỏ email và tên máy của bạn; một số dữ liệu tối thiểu vẫn được giữ lại (mã băm ID máy, thời điểm đồng ý, dòng đơn hàng mức kế toán), và license vẫn dùng được nhưng không khôi phục qua email nữa. Danh sách đầy đủ ở <a href="/bao-mat-du-lieu/#xoa-du-lieu">Dữ liệu và bảo mật</a>. Dữ liệu trên máy bạn thì tự xóa được ngay trong app.</p>
${btn(M.erase, "Gửi yêu cầu xóa dữ liệu")}
</div>

<div class="card reveal" id="bao-mat">
<h3>Báo lỗi bảo mật</h3>
<p>Nếu bạn nghĩ mình đã tìm thấy lỗ hổng trong app, máy chủ bản quyền hoặc website, hãy gửi email với tiêu đề bắt đầu bằng [Bảo mật], kèm mô tả, các bước tái hiện và phiên bản bị ảnh hưởng. Chúng tôi đề nghị bạn chưa công bố công khai cho tới khi hai bên đã trao đổi. Thông tin liên hệ bảo mật cũng có trong tệp <a href="/.well-known/security.txt">security.txt</a>.</p>
${btn(M.security, "Gửi báo cáo bảo mật")}
</div>

<div class="card reveal" id="gop-y">
<h3>Góp ý và nhu cầu mới</h3>
<p>Bạn cần thêm ngôn ngữ, cần dùng trên nhiều máy hay có ý tưởng khác? Thứ tự những việc chúng tôi cân nhắc ở <a href="/ve-chung-toi/#dang-can-nhac">giai đoạn kế tiếp</a> tùy vào phản hồi của người dùng (chưa phải cam kết). Hãy cho chúng tôi biết bạn dùng AI Translator vào việc gì.</p>
${btn(M.feedback, "Gửi góp ý")}
</div>

</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Trước khi gửi", title: "Có thể bạn tìm thấy câu trả lời ngay" })}
${callout({ title: "Về thông tin liên hệ.", text: "Bên cung cấp AI Translator là Đỗ Tiến Phong (cá nhân). Chúng tôi chưa công bố địa chỉ, số điện thoại hay mã số thuế trên website này; mọi liên hệ đi qua email ở trên." })}
<div class="grid grid-3">
${linkCard({ href: "/cau-hoi-thuong-gap/", icon: "message", title: "Câu hỏi thường gặp", text: "Câu trả lời ngắn về cài đặt, riêng tư, gói và thanh toán.", more: "Xem hỏi đáp" })}
${linkCard({ href: "/huong-dan/khac-phuc-su-co/", icon: "support", title: "Khắc phục sự cố", text: "Các lỗi thường gặp và cách xử lý từng bước.", more: "Xem hướng dẫn" })}
${linkCard({ href: "/bao-mat-du-lieu/", icon: "shield", title: "Dữ liệu và bảo mật", text: "Dữ liệu nào ở lại trên máy, máy chủ lưu gì và giữ bao lâu.", more: "Đọc chi tiết" })}
</div>
</div></section>
`,
};
