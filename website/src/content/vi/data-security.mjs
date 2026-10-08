import { pageHero, callout, docLayout, docNav, steps, facts, ctaBand } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Dữ liệu và bảo mật", path: "/bao-mat-du-lieu/" },
];

const TOC = [
  { level: 2, id: "tren-may", text: "Dữ liệu nào ở lại trên máy bạn?" },
  { level: 2, id: "ket-noi-mang", text: "App kết nối mạng tới đâu?" },
  { level: 2, id: "da-kiem", text: "Chúng tôi đã kiểm tra điều đó thế nào?" },
  { level: 2, id: "may-chu", text: "Máy chủ lưu gì và giữ bao lâu?" },
  { level: 2, id: "xoa-du-lieu", text: "Làm sao để xóa dữ liệu của bạn?" },
  { level: 2, id: "ben-xu-ly", text: "Bên nào khác xử lý dữ liệu?" },
  { level: 2, id: "bao-ve", text: "Những lớp bảo vệ khác" },
  { level: 2, id: "ky-so", text: "Trạng thái ký số hôm nay" },
  { level: 2, id: "gioi-han", text: "Điều chúng tôi không hứa" },
];

const MAIL = `<a href="mailto:${SITE.email}">${SITE.email}</a>`;

export default {
  id: "data-security",
  lang: "vi",
  path: "/bao-mat-du-lieu/",
  title: "Dữ liệu và bảo mật của AI Translator",
  description:
    "AI Translator xử lý âm thanh trên máy bạn, không gửi đi. Xem dữ liệu nào ở lại trên máy, app kết nối tới đâu, máy chủ lưu gì, giữ bao lâu và cách yêu cầu xóa.",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "Dữ liệu ở lại trên máy, bốn nơi app kết nối mạng, cách đã kiểm tra bằng proxy trên macOS (Windows chưa đo), dữ liệu máy chủ lưu và thời gian giữ, bên xử lý, lớp bảo vệ, trạng thái ký số và cách yêu cầu xóa dữ liệu.",
  llmTitle: "Dữ liệu và bảo mật của AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Dữ liệu của bạn đi đâu khi dùng AI Translator?",
  lead: "Âm thanh cuộc họp được xử lý hoàn toàn trên máy bạn và không bị gửi đi. Trang này nêu từng loại dữ liệu: cái nào ở lại trên máy, cái nào đi qua mạng, cái nào lưu trên máy chủ của chúng tôi, kèm cách chúng tôi đã kiểm tra và những gì chưa kiểm.",
  meta: "<span>Cập nhật 08/10/2026</span><span>Khớp với Chính sách quyền riêng tư phiên bản 1.1</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc: TOC,
  tocTitle: "Trong trang này",
  body: `
${facts([
  ["Âm thanh", "Chỉ nằm trong RAM, không ghi đĩa, không gửi đi"],
  ["Kết nối mạng", "Bốn nơi; không nơi nào nhận âm thanh hay chữ chép lời"],
  ["Máy chủ lưu", "Email (khi mua), đơn hàng, license, mã băm ID máy"],
  ["Giữ bao lâu", "Cho tới khi bạn yêu cầu xóa"],
  ["Đã kiểm", "Proxy và nettop trên macOS; Windows chưa đo"],
  ["Ký số", "macOS ký ad-hoc, chưa notarize; Windows chưa ký"],
])}
<h2 id="tren-may">Dữ liệu nào ở lại trên máy bạn?</h2>
<p>Âm thanh, bản chép lời và bản dịch không bao giờ rời khỏi máy. App cũng không có tài khoản đăng nhập, không quảng cáo, không analytics và không tự gửi báo cáo lỗi.</p>
<div class="table-wrap" role="region" aria-label="Dữ liệu ở lại trên máy bạn" tabindex="0"><table>
<thead><tr><th scope="col">Dữ liệu</th><th scope="col">Cách xử lý</th></tr></thead>
<tbody>
<tr><th scope="row">Âm thanh hệ thống đang thu</th><td>Chỉ nằm trong RAM khi dịch. Không ghi đĩa, không gửi qua mạng. AI Translator cũng không ghi âm cuộc họp thành file.</td></tr>
<tr><th scope="row">Bản chép lời và bản dịch</th><td>Hiện trên màn hình và nằm trong bộ nhớ theo phiên. Lịch sử mặc định tắt; nếu bạn bật (tính năng Pro), lịch sử lưu trên máy, mã hóa bằng SQLCipher.</td></tr>
<tr><th scope="row">Khóa, token, bộ đếm hạn mức</th><td>Khóa mã hóa lịch sử, token bản quyền, token dùng thử và bộ đếm hạn mức nằm trong Keychain (macOS) hoặc Credential Manager (Windows).</td></tr>
<tr><th scope="row">Log</th><td>Nằm trên máy bạn, không chứa nội dung chép lời. Bạn tự quyết định có gửi cho chúng tôi hay không.</td></tr>
<tr><th scope="row">Từ điển, cài đặt, model</th><td>Lưu trên máy bạn. Model tải một lần rồi chạy hoàn toàn trên máy.</td></tr>
</tbody></table></div>

<h2 id="ket-noi-mang">App kết nối mạng tới đâu?</h2>
<p>Đúng bốn nơi, và không nơi nào nhận âm thanh hay nội dung chép lời. Nhận dạng giọng nói và dịch không cần mạng. Trong lúc dịch, app chỉ có thể gửi các yêu cầu định kỳ tới máy chủ của chúng tôi (kiểm tra bản cập nhật, và kiểm tra bản quyền khi đến hạn).</p>
<div class="table-wrap" role="region" aria-label="Các nơi app kết nối mạng" tabindex="0"><table>
<thead><tr><th scope="col">Nơi kết nối</th><th scope="col">Để làm gì</th><th scope="col">Gửi đi gì</th></tr></thead>
<tbody>
<tr><th scope="row">api.aitranslator.io.vn</th><td>Máy chủ bản quyền: đăng ký dùng thử Free, mua gói, kích hoạt, gỡ kích hoạt, khôi phục key, kiểm tra bản quyền; thỉnh thoảng hỏi giờ máy chủ</td><td>Mã băm ID máy, tên máy, key; thêm email khi bạn mua hoặc khôi phục key</td></tr>
<tr><th scope="row">releases.aitranslator.io.vn</th><td>Tải model và kiểm tra, tải bản cập nhật</td><td>Chỉ yêu cầu tải file</td></tr>
<tr><th scope="row">Trang thanh toán PayOS (pay.payos.vn)</th><td>Thanh toán VietQR khi bạn mua gói</td><td>Mở bằng trình duyệt của bạn, không phải trong app</td></tr>
<tr><th scope="row">aitranslator.io.vn (website này)</th><td>Liên kết ngoài (chính sách, hỗ trợ, trang tải) mở bằng trình duyệt hệ thống</td><td>App không gửi gì</td></tr>
</tbody></table></div>

<h2 id="da-kiem">Chúng tôi đã kiểm tra điều đó thế nào?</h2>
<p>Trên macOS, chúng tôi cho app chạy sau một proxy bắt lưu lượng (mitmproxy), đo song song bằng <code>nettop</code>, rồi dịch một phiên bằng câu mẫu tiếng Anh phát lặp lại. Bản đo là bản release 0.1.0 ký ad-hoc, trên MacBook Pro M4 Pro, macOS 26.6.2, ngày 06/10/2026.</p>
<ul>
<li><strong>Phiên 15 phút 42 giây</strong> (158 đoạn, 0 lỗi): 3 request ra ngoài, đều tới hai máy chủ của chúng tôi (kiểm tra bản quyền, kiểm tra bản cập nhật). Trong lúc dịch chỉ có 1 request, là kiểm tra cập nhật theo lịch. Lượt 15 phút này được đo trước khi chúng tôi chuyển sang tên miền riêng; lượt lặp lại 5 phút sau đó trên tên miền riêng cho kết quả tương tự.</li>
<li><strong>nettop</strong> theo dõi 7 tiến trình (app, WebView, hai tiến trình engine): không thấy luồng dữ liệu ra ngoài nào.</li>
<li><strong>Từ đánh dấu</strong> trong câu mẫu: không có trong log của app lẫn trong các request đã ghi.</li>
</ul>
${callout({ kind: "warn", title: "Giới hạn của phép đo", text: "Chỉ đo trên macOS, một máy, một bản dựng ký ad-hoc. <strong>Windows chưa đo.</strong> Đây là kiểm tra nội bộ, chưa qua kiểm toán độc lập; chế độ proxy không bắt được request của WebView và luồng không phải HTTP nên chúng tôi bù bằng nettop." })}

<h2 id="may-chu">Máy chủ lưu gì và giữ bao lâu?</h2>
<p>Máy chủ lưu những dữ liệu dưới đây. Dòng dùng thử Free áp cho mọi máy đã đăng ký dùng thử; các dòng còn lại chỉ có khi bạn mua gói hoặc kích hoạt key.</p>
<div class="table-wrap" role="region" aria-label="Dữ liệu máy chủ lưu" tabindex="0"><table>
<thead><tr><th scope="col">Dữ liệu</th><th scope="col">Mục đích</th></tr></thead>
<tbody>
<tr><th scope="row">Email khi mua, thời điểm đồng ý xử lý email</th><td>Gửi và khôi phục key; bằng chứng đã có sự đồng ý</td></tr>
<tr><th scope="row">Đơn hàng: mã đơn, gói, số tiền, thời điểm, trạng thái</th><td>Cấp và gia hạn license, đối soát, kế toán</td></tr>
<tr><th scope="row">License: key, gói, hạn, chu kỳ hạn mức</th><td>Cấp quyền dùng gói trả phí</td></tr>
<tr><th scope="row">Máy đã kích hoạt: mã băm ID máy, tên máy, lần kiểm tra</th><td>Mỗi key một máy, chống lạm dụng</td></tr>
<tr><th scope="row">Dùng thử Free: mã băm ID máy, mốc bắt đầu và hết, lần app gọi gần nhất</th><td>Mỗi máy dùng thử một lần. Không có email hay tên máy.</td></tr>
<tr><th scope="row">Nhật ký thay đổi license</th><td>Hỗ trợ và tra soát sự cố</td></tr>
<tr><th scope="row">Bộ đếm giới hạn tần suất (chỉ giá trị băm, tự hết hạn sau khoảng 3 giờ)</th><td>Chặn dò key và spam</td></tr>
</tbody></table></div>
<p><strong>Giữ bao lâu:</strong> cho tới khi bạn yêu cầu xóa; chúng tôi không tự xóa. Chúng tôi không nhận số thẻ hay số tài khoản ngân hàng của bạn và không gửi email của bạn sang PayOS. Nếu chỉ dùng Free, máy chủ không có email hay tên máy của bạn.</p>

<h2 id="xoa-du-lieu">Làm sao để xóa dữ liệu của bạn?</h2>
${steps(
  [
    { title: "Xóa dữ liệu trên máy", text: "Vào <strong>Cài đặt › Quyền riêng tư</strong>. <em>Xóa toàn bộ dữ liệu</em> xóa lịch sử và từ điển; <em>Xóa model và dữ liệu</em> xóa thêm model đã tải (trên macOS, bấm nút này trước khi kéo app vào Thùng rác). Bản quyền, hạn mức và cài đặt được giữ." },
    { title: "Yêu cầu xóa trên máy chủ", text: `Gửi email tới ${MAIL} <strong>từ chính email đã dùng khi mua</strong> để chúng tôi xác nhận là bạn. Chính sách quyền riêng tư cũng cho bạn quyền biết dữ liệu nào đang được lưu, rút lại sự đồng ý và khiếu nại theo quy định của Luật Bảo vệ dữ liệu cá nhân của Việt Nam. Chúng tôi xử lý trong thời hạn pháp luật quy định.` },
    { title: "Điều chúng tôi làm", text: "Bỏ email và tên máy của bạn. License vẫn dùng được, nhưng không khôi phục qua email được nữa." },
  ],
  true,
)}
<p><strong>Sau khi xóa, chúng tôi vẫn giữ:</strong> mã băm ID máy (chỉ để chống lạm dụng: mỗi key một máy, mỗi máy dùng thử Free một lần), thời điểm bạn từng đồng ý xử lý email, và dòng đơn hàng ở mức kế toán (mã đơn, ngày, số tiền). Nhật ký kỹ thuật tự hết hạn và nhật ký thư của Resend nằm ngoài yêu cầu xóa, theo chính sách của các bên đó.</p>

<h2 id="ben-xu-ly">Bên nào khác xử lý dữ liệu?</h2>
<div class="table-wrap" role="region" aria-label="Bên xử lý dữ liệu" tabindex="0"><table>
<thead><tr><th scope="col">Bên</th><th scope="col">Vai trò</th><th scope="col">Dữ liệu</th></tr></thead>
<tbody>
<tr><th scope="row">PayOS (Việt Nam)</th><td>Xử lý thanh toán VietQR</td><td>Mã đơn, số tiền, mô tả đơn. Không có email của bạn.</td></tr>
<tr><th scope="row">Cloudflare</th><td>Chạy máy chủ bản quyền, cơ sở dữ liệu; lưu và phân phối model, bản cập nhật</td><td>Dữ liệu ở bảng trên; nhật ký kỹ thuật tự hết hạn</td></tr>
<tr><th scope="row">Resend</th><td>Gửi email chứa key</td><td>Email của bạn và nội dung thư (có key); nhật ký thư theo chính sách lưu của Resend</td></tr>
</tbody></table></div>
<p>Cloudflare và Resend đặt máy chủ ngoài Việt Nam, nên dữ liệu có thể được xử lý ở nước ngoài. Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho mục đích quảng cáo.</p>

<h2 id="bao-ve">Những lớp bảo vệ khác</h2>
<ul>
<li><strong>Chữ ký số:</strong> bản cập nhật được kiểm chữ ký trước khi ghi file; manifest model ký Ed25519 và từng file kiểm SHA-256; token bản quyền ký Ed25519, kiểm được cả khi offline. App chỉ chứa khóa công khai.</li>
<li><strong>Hai engine chạy ở hai tiến trình riêng:</strong> phần nhận dạng giọng nói không mở cổng mạng; phần dịch (<code>llama-server</code>) chỉ nghe ở 127.0.0.1 và dùng API key ngẫu nhiên mỗi lần chạy.</li>
<li><strong>Khóa nhạy cảm nằm ngoài app:</strong> khóa API thanh toán và khóa ký chỉ nằm trên máy chủ; kết nối tới máy chủ dùng HTTPS.</li>
<li><strong>Phát hiện app bị sửa:</strong> trên macOS, app kiểm chữ ký ad-hoc còn nguyên và bundle id; bản có chữ ký không khớp chỉ chạy gói Free. Đây là kiểm tra tính nguyên vẹn, không thay được chữ ký Developer ID.</li>
</ul>

<h2 id="ky-so">Trạng thái ký số hôm nay</h2>
<div class="table-wrap" role="region" aria-label="Trạng thái ký số" tabindex="0"><table>
<thead><tr><th scope="col">Nền tảng</th><th scope="col">Trạng thái</th><th scope="col">Hệ quả cho bạn</th></tr></thead>
<tbody>
<tr><th scope="row">macOS</th><td>Ký ad-hoc, <strong>chưa notarize</strong> (chúng tôi chưa có Apple Developer ID)</td><td>macOS chặn lần mở đầu: bạn cần bấm Open Anyway trong System Settings › Privacy &amp; Security. Mỗi lần cập nhật, macOS hỏi lại 5 hộp thoại Keychain và 1 hộp thoại quyền ghi âm.</td></tr>
<tr><th scope="row">Windows</th><td>Chưa phát hành, <strong>chưa có chứng thư ký mã</strong></td><td>Khi phát hành, SmartScreen có thể cảnh báo lúc đầu.</td></tr>
</tbody></table></div>
<p>Chữ ký ad-hoc không cho Apple biết ai là nhà phát triển, nên hãy chỉ lấy bản cài từ chúng tôi và đối chiếu mã SHA-256 gửi kèm. Chúng tôi dự định chuyển sang Developer ID khi có điều kiện, chưa có ngày. Xem <a href="/huong-dan/cai-dat-macos/">hướng dẫn cài đặt trên macOS</a>.</p>

<h2 id="gioi-han">Điều chúng tôi không hứa</h2>
<ul>
<li>Không hệ thống nào an toàn tuyệt đối. Nếu có sự cố ảnh hưởng tới dữ liệu cá nhân, chúng tôi sẽ thông báo theo quy định pháp luật.</li>
<li>Chúng tôi chưa kiểm xem thanh phụ đề có hiện cho người xem khi bạn chia sẻ màn hình hay không. Nếu bạn lo ngại, hãy ẩn thanh bằng phím tắt trước khi chia sẻ.</li>
<li>Nếu pháp luật hoặc quy định công ty yêu cầu, bạn tự chịu trách nhiệm thông báo cho người cùng họp là bạn dùng công cụ dịch.</li>
</ul>
<p>Phát hiện lỗi bảo mật? Hãy làm theo hướng dẫn ở <a href="/lien-he/#bao-mat">trang Liên hệ</a>.</p>
`,
})}
${docNav(
  [
    { href: "/chinh-sach-quyen-rieng-tu/", kicker: "Văn bản đầy đủ", title: "Chính sách quyền riêng tư" },
    { href: "/dieu-khoan/", kicker: "Văn bản đầy đủ", title: "Điều khoản sử dụng" },
    { href: "/huong-dan/lich-su-va-xuat-file/", kicker: "Hướng dẫn", title: "Lịch sử và xuất file" },
  ],
  "Đọc tiếp",
)}
</div></section>

${ctaBand({ title: "Thử với quyền kiểm soát trong tay bạn", text: "Dịch ngay trên máy, âm thanh không rời khỏi máy. Dùng thử Free 10 ngày, không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Nhận bản beta" }, secondary: { href: "/lien-he/", label: "Hỏi chúng tôi" } })}
`,
};
