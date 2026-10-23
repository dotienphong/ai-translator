import { pageHero, callout, docLayout, docNav, steps, facts, ctaBand } from "../../build/components.mjs";
import { SITE } from "../../site.mjs";
import { legalVersionLine } from "../legal.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Dữ liệu và bảo mật", path: "/bao-mat-du-lieu/" },
];

const TOC = [
  { level: 2, id: "tren-may", text: "Dữ liệu nào ở lại trên máy bạn?" },
  { level: 2, id: "ket-noi-mang", text: "App kết nối mạng tới đâu?" },
  { level: 2, id: "da-kiem", text: "Chúng tôi đã kiểm tra điều đó thế nào?" },
  { level: 2, id: "may-chu", text: "Máy chủ lưu gì và giữ bao lâu?" },
  { level: 2, id: "bao-cao-loi", text: "Báo cáo lỗi: app gửi gì khi gặp lỗi?" },
  { level: 2, id: "chat-ho-tro", text: "Chat hỗ trợ: tin nhắn đi đâu, giữ bao lâu?" },
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
  modified: "2026-10-22",
  llm: "Dữ liệu ở lại trên máy, năm nơi app kết nối mạng, cách đã kiểm tra bằng proxy trên macOS, dữ liệu máy chủ lưu và thời gian giữ, báo cáo lỗi tự động (gửi gì, tắt thế nào), chat hỗ trợ (lưu gì, giữ bao lâu), bên xử lý, lớp bảo vệ, trạng thái ký số và cách yêu cầu xóa dữ liệu.",
  llmTitle: "Dữ liệu và bảo mật của AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Dữ liệu của bạn đi đâu khi dùng AI Translator?",
  lead: "Âm thanh cuộc họp được xử lý hoàn toàn trên máy bạn và không bị gửi đi: nhận dạng giọng nói và dịch dùng model AI chạy trên máy, không có dịch vụ AI nào trên cloud tham gia. Trang này nêu từng loại dữ liệu: cái nào ở lại trên máy, cái nào đi qua mạng, cái nào lưu trên máy chủ của chúng tôi, kèm cách chúng tôi đã kiểm tra và những gì chưa kiểm.",
  meta: `<span>Cập nhật {{updated}}</span><span>Khớp với Chính sách quyền riêng tư: ${legalVersionLine("privacy.vi.md")}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc: TOC,
  tocTitle: "Trong trang này",
  body: `
${facts([
  ["Xử lý AI", "Nhận dạng và dịch bằng model AI chạy trên máy bạn; không dùng AI trên cloud"],
  ["Dữ liệu cuộc họp", "Chỉ ở trên máy bạn; máy chủ của chúng tôi không có"],
  ["Âm thanh", "Chỉ nằm trong RAM, không ghi đĩa, không gửi đi"],
  ["Kết nối mạng", "Năm nơi; không nơi nào nhận âm thanh, chữ chép lời hay chữ bạn gõ ở Gõ dịch"],
  ["Máy chủ lưu", "Email (khi mua, hay khi bạn tự để lại trong chat hỗ trợ), đơn hàng, license, mã băm ID máy, báo cáo lỗi, tin nhắn chat hỗ trợ"],
  ["Giữ bao lâu", "Cho tới khi bạn yêu cầu xóa; báo cáo lỗi 30 ngày; chat hỗ trợ 90 ngày"],
  ["Đã kiểm", "Proxy và nettop trên macOS"],
  ["Ký số", "macOS ký ad-hoc, chưa notarize; Windows chưa ký"],
])}
<h2 id="tren-may">Dữ liệu nào ở lại trên máy bạn?</h2>
<p>Âm thanh, bản chép lời, bản dịch và chữ bạn gõ ở Gõ dịch không bao giờ rời khỏi máy. App cũng không có tài khoản đăng nhập, không quảng cáo và không analytics. Khi gặp lỗi, app gửi một báo cáo lỗi đã che dữ liệu cá nhân cho chúng tôi (xem <a href="#bao-cao-loi">Báo cáo lỗi</a>); báo cáo đó không có âm thanh, chữ chép lời hay bản dịch.</p>
<div class="table-wrap" role="region" aria-label="Dữ liệu ở lại trên máy bạn" tabindex="0"><table>
<thead><tr><th scope="col">Dữ liệu</th><th scope="col">Cách xử lý</th></tr></thead>
<tbody>
<tr><th scope="row">Âm thanh hệ thống đang thu</th><td>Chỉ nằm trong RAM khi dịch. Không ghi đĩa, không gửi qua mạng. AI Translator cũng không ghi âm cuộc họp thành file.</td></tr>
<tr><th scope="row">Bản chép lời và bản dịch</th><td>Hiện trên màn hình và nằm trong bộ nhớ theo phiên. Lịch sử mặc định tắt; nếu bạn bật (tính năng Pro), lịch sử lưu trên máy, được mã hóa.</td></tr>
<tr><th scope="row">Chữ bạn gõ ở Gõ dịch và bản dịch của nó</th><td>Chỉ nằm trong bộ nhớ của app tới khi bạn dán hay thoát app. Không ghi đĩa, không gửi qua mạng, không có trong log hay báo cáo lỗi. Bản dịch được chép vào clipboard để dán và ở lại đó tới khi bạn chép thứ khác.</td></tr>
<tr><th scope="row">Khóa, token, bộ đếm hạn mức</th><td>Khóa mã hóa lịch sử, token bản quyền, token dùng thử và bộ đếm hạn mức nằm trong Keychain (macOS) hoặc Credential Manager (Windows).</td></tr>
<tr><th scope="row">Log</th><td>Nằm trên máy bạn, không chứa nội dung chép lời. Chỉ phần log liên quan đến một lỗi rời máy, trong báo cáo lỗi đã che dữ liệu cá nhân (xem <a href="#bao-cao-loi">Báo cáo lỗi</a>).</td></tr>
<tr><th scope="row">Từ điển, cài đặt, model</th><td>Lưu trên máy bạn. Model tải một lần rồi chạy hoàn toàn trên máy.</td></tr>
</tbody></table></div>
<p>Trên macOS, Gõ dịch xin quyền Trợ năng (Accessibility) chỉ để gửi tổ hợp dán ⌘V vào ô chat bạn đang gõ. App không đọc chữ, nội dung hay clipboard của app khác; không cấp quyền thì app chỉ chép bản dịch để bạn tự dán (xem <a href="/huong-dan/go-dich/#quyen-tro-nang">Gõ dịch</a>).</p>

<h2 id="ket-noi-mang">App kết nối mạng tới đâu?</h2>
<p>Đúng năm nơi, và không nơi nào nhận âm thanh, nội dung chép lời hay chữ bạn gõ ở Gõ dịch. Nhận dạng giọng nói và dịch không cần mạng. Trong lúc dịch, app chỉ có thể gửi các yêu cầu định kỳ tới máy chủ của chúng tôi (kiểm tra bản cập nhật, và kiểm tra bản quyền khi đến hạn), cùng tin chat hỗ trợ khi bạn đang mở mục Hỗ trợ hay bấm gửi. Mục 4 của <a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a> cũng liệt kê năm kết nối nhưng đếm theo mục đích (tải model và kiểm tra bản cập nhật cùng đi tới releases.aitranslator.vn; trang thanh toán của PayOS và của Creem gộp một mục), còn bảng dưới đếm theo nơi nhận.</p>
<div class="table-wrap" role="region" aria-label="Các nơi app kết nối mạng" tabindex="0"><table>
<thead><tr><th scope="col">Nơi kết nối</th><th scope="col">Để làm gì</th><th scope="col">Gửi đi gì</th></tr></thead>
<tbody>
<tr><th scope="row">api.aitranslator.vn</th><td>Máy chủ bản quyền: đăng ký dùng thử Free, mua gói, kích hoạt, gỡ kích hoạt, khôi phục key, kiểm tra bản quyền, nhận báo cáo lỗi, chat hỗ trợ; thỉnh thoảng hỏi giờ máy chủ</td><td>Mã băm ID máy, tên máy, key; thêm email và ngôn ngữ giao diện của app khi bạn mua hoặc khôi phục key; báo cáo lỗi đã che dữ liệu cá nhân (chỉ khi app không đang dịch); tin chat hỗ trợ bạn gửi, kèm dòng thông tin máy nếu bạn để tích và email nếu bạn tự để lại (chỉ khi bạn dùng chat)</td></tr>
<tr><th scope="row">releases.aitranslator.vn</th><td>Tải model và kiểm tra, tải bản cập nhật</td><td>Chỉ yêu cầu tải file</td></tr>
<tr><th scope="row">Trang thanh toán PayOS (pay.payos.vn)</th><td>Thanh toán VietQR khi bạn mua gói</td><td>Mở bằng trình duyệt của bạn, không phải trong app</td></tr>
<tr><th scope="row">Trang thanh toán Creem (www.creem.io)</th><td>Thanh toán bằng thẻ quốc tế khi bạn mua gói</td><td>Mở bằng trình duyệt của bạn, không phải trong app. Email bạn nhập đi từ máy chủ của chúng tôi sang Creem, không đi từ app (xem bảng “Bên nào khác xử lý dữ liệu?”)</td></tr>
<tr><th scope="row">aitranslator.vn (website này)</th><td>Liên kết ngoài (chính sách, hỗ trợ, trang tải) mở bằng trình duyệt hệ thống</td><td>App không gửi gì</td></tr>
</tbody></table></div>

<h2 id="da-kiem">Chúng tôi đã kiểm tra điều đó thế nào?</h2>
<p>Trên macOS, chúng tôi cho app chạy sau một proxy bắt lưu lượng (mitmproxy), đo song song bằng <code>nettop</code>, rồi dịch một phiên bằng câu mẫu tiếng Anh phát lặp lại. Bản đo là bản release 0.1.0 ký ad-hoc, trên MacBook Pro M4 Pro, macOS 26.6.2, ngày 06/10/2026.</p>
<ul>
<li><strong>Phiên 15 phút 42 giây</strong> (158 đoạn, 0 lỗi): 3 request ra ngoài, đều tới hai máy chủ của chúng tôi (kiểm tra bản quyền, kiểm tra bản cập nhật). Trong lúc dịch chỉ có 1 request, là kiểm tra cập nhật theo lịch. Lượt 15 phút này được đo trước khi chúng tôi chuyển sang tên miền riêng; lượt lặp lại sau đó trên tên miền riêng (phiên khoảng 9 phút, nettop 5 phút) cho kết quả tương tự.</li>
<li><strong>nettop</strong> theo dõi 7 tiến trình của app (gồm cả phần xử lý AI): không thấy luồng dữ liệu ra ngoài nào.</li>
<li><strong>Từ đánh dấu</strong> trong câu mẫu: không có trong log của app lẫn trong các request đã ghi.</li>
<li><strong>Báo cáo lỗi tự động</strong> (đo lại ngày 17/10/2026 với bản release ký ad-hoc có tính năng này, cùng máy): trong một phiên 12 phút 31 giây, chúng tôi cố ý làm một tiến trình phụ chết ở phút thứ 5 để app xếp một báo cáo lỗi vào hàng đợi. Suốt hơn 7 phút còn lại của phiên không có request nào gửi báo cáo; báo cáo tới máy chủ của chúng tôi 1 giây sau khi bấm Dừng. Thân báo cáo nặng 49,8 KB và không chứa tên tài khoản, đường dẫn thư mục cá nhân, email hay từ đánh dấu của câu mẫu.</li>
</ul>
${callout({ kind: "warn", title: "Giới hạn của phép đo", text: "Chỉ đo trên macOS, một máy, một bản dựng ký ad-hoc; phần báo cáo lỗi tự động chỉ đo một lượt (một phiên 12 phút, một báo cáo), còn chat hỗ trợ chưa được đo bằng proxy. Đây là kiểm tra nội bộ, chưa qua kiểm toán độc lập; chế độ proxy không bắt được request của WebView và luồng không phải HTTP nên chúng tôi bù bằng nettop." })}

<h2 id="may-chu">Máy chủ lưu gì và giữ bao lâu?</h2>
<p>Máy chủ lưu những dữ liệu dưới đây. Dòng dùng thử Free áp cho mọi máy đã đăng ký dùng thử; các dòng còn lại chỉ có khi bạn mua gói hoặc kích hoạt key, trừ dòng báo cáo lỗi (áp cho mọi máy mà app gửi báo cáo) và dòng chat hỗ trợ (áp cho mọi người đã nhắn ở chat).</p>
<div class="table-wrap" role="region" aria-label="Dữ liệu máy chủ lưu" tabindex="0"><table>
<thead><tr><th scope="col">Dữ liệu</th><th scope="col">Mục đích</th></tr></thead>
<tbody>
<tr><th scope="row">Email khi mua, thời điểm đồng ý xử lý email</th><td>Gửi và khôi phục key; với đơn thẻ, điền sẵn trang thanh toán của Creem; bằng chứng đã có sự đồng ý</td></tr>
<tr><th scope="row">Đơn hàng: mã đơn, gói, số tiền và loại tiền, thời điểm, trạng thái, mã phiên thanh toán của cổng (PayOS hay Creem), ngôn ngữ giao diện của app lúc mua</th><td>Cấp và gia hạn license, đối soát, kế toán, gửi thư bằng ngôn ngữ của bạn</td></tr>
<tr><th scope="row">License: key, gói, hạn, chu kỳ hạn mức</th><td>Cấp quyền dùng gói trả phí</td></tr>
<tr><th scope="row">Máy đã kích hoạt: mã băm ID máy, tên máy, lần kiểm tra</th><td>Mỗi key một máy, chống lạm dụng</td></tr>
<tr><th scope="row">Dùng thử Free: mã băm ID máy, mốc bắt đầu và hết, lần app gọi gần nhất</th><td>Mỗi máy dùng thử một lần. Không có email hay tên máy.</td></tr>
<tr><th scope="row">Nhật ký thay đổi license</th><td>Hỗ trợ và tra soát sự cố</td></tr>
<tr><th scope="row">Bộ đếm giới hạn tần suất (chỉ giá trị băm, tự hết hạn sau khoảng 3 giờ)</th><td>Chặn dò key và spam</td></tr>
<tr><th scope="row">Báo cáo lỗi: loại và mã lỗi, thông tin máy, mã băm ID máy, phần log liên quan</th><td>Tìm và sửa lỗi; tự xóa sau 30 ngày (xem <a href="#bao-cao-loi">Báo cáo lỗi</a>)</td></tr>
<tr><th scope="row">Chat hỗ trợ: tin nhắn của bạn và câu trả lời, nguồn, ngôn ngữ, trang bạn đang xem (website), dòng thông tin máy nếu bạn để tích (app), email nếu bạn tự để lại</th><td>Trả lời bạn; tự xóa sau 90 ngày kể từ tin cuối (xem <a href="#chat-ho-tro">Chat hỗ trợ</a>)</td></tr>
</tbody></table></div>
<p><strong>Giữ bao lâu:</strong> cho tới khi bạn yêu cầu xóa; chúng tôi không tự xóa (trừ báo cáo lỗi, tự xóa sau 30 ngày, và chat hỗ trợ, tự xóa sau 90 ngày kể từ tin cuối). Chúng tôi không nhận số thẻ hay số tài khoản ngân hàng của bạn. Với VietQR, chúng tôi không gửi email của bạn sang PayOS; với thẻ quốc tế, chúng tôi gửi email bạn nhập ở màn hình Nâng cấp cho Creem, để điền sẵn trang thanh toán và để Creem gửi biên lai cho bạn. Nếu chỉ dùng Free, máy chủ không có email hay tên máy của bạn, trừ email bạn tự để lại trong chat hỗ trợ.</p>

<h2 id="bao-cao-loi">Báo cáo lỗi: app gửi gì khi gặp lỗi?</h2>
<p>Khi app gặp lỗi, nó tự gửi một báo cáo lỗi cho chúng tôi để chúng tôi biết và sửa. Tính năng này bật mặc định (kể cả sau khi bạn cập nhật từ bản cũ hơn); bạn tắt hay bật lại ở <strong>Cài đặt › Quyền riêng tư</strong>, và bỏ tích được ngay ở bước Điều khoản khi mở app lần đầu. Ở màn hình <strong>Giới thiệu</strong>, nút <strong>Gửi log cho hỗ trợ</strong> gửi ngay một báo cáo (kể cả khi bạn đã tắt gửi tự động) và cho bạn <strong>mã báo cáo</strong> để ghi vào thư gửi hỗ trợ.</p>
<div class="table-wrap" role="region" aria-label="Báo cáo lỗi của app" tabindex="0"><table>
<thead><tr><th scope="col">Nội dung</th><th scope="col">Chi tiết</th></tr></thead>
<tbody>
<tr><th scope="row">Khi nào app gửi</th><td>Khi lần chạy trước bị dừng đột ngột; khi một phiên dịch dừng vì lỗi của app (không tính lỗi do bạn hay môi trường như thiếu quyền ghi âm, hết hạn mức, mất mạng); khi một công cụ phụ của app chết rồi tự khởi động lại. Chỉ gửi khi app không đang dịch, tối đa 5 báo cáo mỗi ngày mỗi máy.</td></tr>
<tr><th scope="row">Báo cáo gồm</th><td>Mã báo cáo, loại và mã lỗi; phiên bản app, hệ điều hành, chip hoặc CPU, RAM, loại GPU, gói model, tên gói bản quyền (không có key), ngôn ngữ giao diện; mã băm ID máy; phần log liên quan đến lỗi, tối đa 64 KB.</td></tr>
<tr><th scope="row">Báo cáo không gồm</th><td>Âm thanh, bản chép lời, bản dịch, chữ bạn gõ ở Gõ dịch, license key, token, email, tên máy, tên tài khoản hệ điều hành, địa chỉ IP. App che đường dẫn thư mục cá nhân, key, token và email trong log trước khi gửi; máy chủ kiểm lại và từ chối báo cáo nếu còn sót.</td></tr>
<tr><th scope="row">Gắn với bạn thế nào</th><td>Mã băm ID máy trong báo cáo cũng là mã chúng tôi lưu cho bản quyền và dùng thử Free, nên chúng tôi có thể nối báo cáo với license và email của máy đó khi tra cứu hỗ trợ.</td></tr>
<tr><th scope="row">Giữ bao lâu</th><td>Tối đa 30 ngày rồi tự xóa (máy chủ giữ tối đa 3.000 báo cáo). Yêu cầu xóa theo email xóa luôn báo cáo của các máy từng kích hoạt key của email đó.</td></tr>
</tbody></table></div>
<p>Chúng tôi chỉ dùng báo cáo để tìm và sửa lỗi, không dùng cho quảng cáo và không chia sẻ cho bên nào ngoài các bên xử lý ở bảng bên dưới. Văn bản đầy đủ ở mục 10 của <a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a>.</p>

<h2 id="chat-ho-tro">Chat hỗ trợ: tin nhắn đi đâu, giữ bao lâu?</h2>
<p>Bạn nhắn cho chúng tôi được bằng nút chat ở góc dưới bên phải mỗi trang của website này, hoặc ở mục <strong>Hỗ trợ</strong> trong app. Tin nhắn đi qua máy chủ của chúng tôi tới người vận hành AI Translator, và câu trả lời hiện lại trong khung chat. Dùng chat là do bạn chọn: chưa từng nhắn thì app không kết nối gì cho chat.</p>
<ul>
<li><strong>Máy chủ lưu:</strong> tin nhắn của bạn và câu trả lời, thời điểm, nguồn (website hay app), ngôn ngữ, trang bạn đang xem lúc mở chat (website), dòng thông tin máy nếu bạn để tích (app), và email nếu bạn tự để lại. Không lưu địa chỉ IP cùng cuộc chat.</li>
<li><strong>Thông tin máy (app):</strong> ô này tích sẵn, bỏ tích được, chỉ đi kèm tin đầu tiên và hiện nguyên văn trước khi gửi; không bao giờ có key, email, mã máy hay tên máy.</li>
<li><strong>Email:</strong> không bắt buộc; chỉ dùng để gửi câu trả lời qua email khi câu trả lời chưa tới được khung chat của bạn sau khoảng 2 phút (ví dụ bạn đã đóng trang hay ứng dụng).</li>
<li><strong>Giữ bao lâu:</strong> tự xóa sau 90 ngày kể từ tin cuối. Bạn xóa ngay được cuộc trò chuyện ở menu ⋯ của khung chat; bản sao tin nhắn đã tới người trả lời thì được xóa khi bạn yêu cầu qua email.</li>
</ul>
<p>Văn bản đầy đủ, kể cả bên chuyển tin nhắn, ở mục 11 của <a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a>.</p>

<h2 id="xoa-du-lieu">Làm sao để xóa dữ liệu của bạn?</h2>
${steps(
  [
    { title: "Xóa dữ liệu trên máy", text: "Vào <strong>Cài đặt › Quyền riêng tư</strong>. <em>Xóa toàn bộ dữ liệu</em> xóa lịch sử và từ điển; <em>Xóa model và dữ liệu</em> xóa thêm model đã tải (trên macOS, bấm nút này trước khi kéo app vào Thùng rác). Bản quyền, hạn mức và cài đặt được giữ." },
    { title: "Yêu cầu xóa trên máy chủ", text: `Gửi email tới ${MAIL} <strong>từ chính email đã dùng khi mua, hay email bạn đã để lại trong chat hỗ trợ</strong> để chúng tôi xác nhận là bạn. Chính sách quyền riêng tư cũng cho bạn quyền biết dữ liệu nào đang được lưu, rút lại sự đồng ý và khiếu nại theo quy định của Luật Bảo vệ dữ liệu cá nhân của Việt Nam. Chúng tôi xử lý trong thời hạn pháp luật quy định.` },
    { title: "Điều chúng tôi làm", text: "Bỏ email và tên máy của bạn, xóa báo cáo lỗi của các máy từng kích hoạt key của email đó, và xóa các cuộc chat hỗ trợ mà bạn đã để lại email đó (kể cả bản đã tới người trả lời). License vẫn dùng được, nhưng không khôi phục qua email được nữa." },
  ],
  true,
)}
<p><strong>Sau khi xóa, chúng tôi vẫn giữ:</strong> mã băm ID máy (chỉ để chống lạm dụng: mỗi key một máy, mỗi máy dùng thử Free một lần), thời điểm bạn từng đồng ý xử lý email, và dòng đơn hàng ở mức kế toán (mã đơn, ngày, số tiền và loại tiền, mã phiên thanh toán của cổng). Nhật ký kỹ thuật tự hết hạn và nhật ký thư của Resend nằm ngoài yêu cầu xóa, theo chính sách của các bên đó. Dữ liệu bạn nhập ở trang Creem và hồ sơ giao dịch do Creem giữ (bên bán lại phải giữ chứng từ thuế) nằm ngoài yêu cầu xóa gửi chúng tôi; muốn xóa ở Creem, hãy liên hệ Creem. Báo cáo lỗi của máy chưa từng kích hoạt key không gắn với email nên không xóa theo email được; chúng tự xóa sau 30 ngày.</p>

<h2 id="ben-xu-ly">Bên nào khác xử lý dữ liệu?</h2>
<div class="table-wrap" role="region" aria-label="Bên xử lý dữ liệu" tabindex="0"><table>
<thead><tr><th scope="col">Bên</th><th scope="col">Vai trò</th><th scope="col">Dữ liệu</th></tr></thead>
<tbody>
<tr><th scope="row">PayOS (Việt Nam)</th><td>Xử lý thanh toán VietQR</td><td>Mã đơn, số tiền, mô tả đơn. Không có email của bạn.</td></tr>
<tr><th scope="row">Creem (Armitage Labs OÜ, Estonia)</th><td>Bên bán lại (merchant of record) của đơn thẻ: xử lý thanh toán, thuế và biên lai</td><td>Chúng tôi gửi mã đơn, gói, số tiền, loại tiền và email bạn nhập, ngay khi bạn bấm thanh toán bằng thẻ (kể cả khi bạn không trả), để điền sẵn trang thanh toán và để Creem gửi biên lai. Ở trang thanh toán, Creem tự thu số thẻ, tên, địa chỉ thanh toán và nước (để tính thuế), địa chỉ IP (chống gian lận); chúng tôi không nhận số thẻ. Creem xử lý các dữ liệu đó theo chính sách riêng (https://www.creem.io/privacy). Thông báo thanh toán Creem gửi máy chủ của chúng tôi có tên và nước người mua; chúng tôi không lưu hai thông tin này.</td></tr>
<tr><th scope="row">Cloudflare</th><td>Chạy máy chủ bản quyền, cơ sở dữ liệu; lưu và phân phối model, bản cập nhật</td><td>Dữ liệu ở bảng trên, kể cả báo cáo lỗi và chat hỗ trợ; nhật ký kỹ thuật tự hết hạn</td></tr>
<tr><th scope="row">Resend</th><td>Gửi email chứa key, và câu trả lời chat hỗ trợ khi bạn để lại email</td><td>Email của bạn và nội dung thư (có key, hay câu trả lời chat); nhật ký thư theo chính sách lưu của Resend</td></tr>
</tbody></table></div>
<p>Cloudflare và Resend đặt máy chủ ngoài Việt Nam, còn Creem là pháp nhân Estonia, nên dữ liệu có thể được xử lý ở nước ngoài. Tin nhắn chat hỗ trợ còn đi qua một dịch vụ nhắn tin đặt máy chủ ở Việt Nam để tới người trả lời (không kèm email của bạn); tên bên này và dữ liệu họ nhận có ở mục 6 của <a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a>. Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho mục đích quảng cáo.</p>

<h2 id="bao-ve">Những lớp bảo vệ khác</h2>
<ul>
<li><strong>Chữ ký số:</strong> bản cập nhật được kiểm chữ ký trước khi ghi file; manifest model ký Ed25519 và từng file kiểm SHA-256; token bản quyền ký Ed25519, kiểm được cả khi offline. App chỉ chứa khóa công khai.</li>
<li><strong>Phần xử lý AI tách khỏi giao diện:</strong> chỉ giao tiếp nội bộ trên máy, không nhận kết nối từ bên ngoài máy và dùng khóa ngẫu nhiên mỗi lần chạy.</li>
<li><strong>Khóa nhạy cảm nằm ngoài app:</strong> khóa API thanh toán và khóa ký chỉ nằm trên máy chủ; kết nối tới máy chủ dùng HTTPS.</li>
<li><strong>Phát hiện app bị sửa:</strong> trên macOS, app kiểm chữ ký ad-hoc còn nguyên và bundle id; bản có chữ ký không khớp chỉ chạy gói Free. Đây là kiểm tra tính nguyên vẹn, không thay được chữ ký Developer ID. Trên Windows, bản hiện tại chưa ký mã nên app chưa có bước kiểm này; hãy đối chiếu mã SHA-256 của bộ cài.</li>
</ul>

<h2 id="ky-so">Trạng thái ký số hôm nay</h2>
<div class="table-wrap" role="region" aria-label="Trạng thái ký số" tabindex="0"><table>
<thead><tr><th scope="col">Nền tảng</th><th scope="col">Trạng thái</th><th scope="col">Hệ quả cho bạn</th></tr></thead>
<tbody>
<tr><th scope="row">macOS</th><td>Ký ad-hoc, <strong>chưa notarize</strong> (chúng tôi chưa có Apple Developer ID)</td><td>File .dmg tải bằng trình duyệt bị macOS chặn lần mở đầu (cần bấm Open Anyway trong System Settings › Privacy &amp; Security); cài bằng dòng lệnh trong Terminal thì mở thẳng. Mỗi lần cập nhật, macOS hỏi lại 1 hộp thoại Keychain và có thể hỏi lại quyền ghi âm.</td></tr>
<tr><th scope="row">Windows</th><td><strong>Chưa ký mã</strong> (chúng tôi chưa có chứng thư ký mã Windows)</td><td>Cài bằng dòng lệnh PowerShell thì SmartScreen không hỏi (file tải bằng PowerShell không mang dấu “tải từ internet”). File .exe tải bằng trình duyệt có thể hiện “Windows protected your PC”: bấm More info rồi Run anyway; Publisher hiện Unknown publisher. Smart App Control ở chế độ chặn sẽ chặn bản chưa ký.</td></tr>
</tbody></table></div>
<p>Chữ ký ad-hoc không cho Apple biết ai là nhà phát triển, nên hãy chỉ cài bằng lệnh trên trang <a href="/tai-xuong/">Tải xuống</a> hoặc từ file do chúng tôi gửi, và đối chiếu mã SHA-256. Bản Windows chưa ký mã cũng vậy (cài bằng lệnh trên trang Tải xuống, hoặc từ file do chúng tôi gửi): Windows không xác nhận được ai phát hành file, nên đối chiếu SHA-256 là cách để biết file không bị thay đổi. Chúng tôi dự định chuyển sang Developer ID và chứng thư ký mã Windows khi có điều kiện, chưa có ngày. Xem hướng dẫn cài đặt trên <a href="/huong-dan/cai-dat-macos/">macOS</a> và <a href="/huong-dan/cai-dat-windows/">Windows</a>.</p>

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

${ctaBand({ title: "Thử với quyền kiểm soát trong tay bạn", text: "Dịch ngay trên máy, âm thanh không rời khỏi máy. Dùng thử Free 10 ngày, không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/lien-he/", label: "Hỏi chúng tôi" } })}
`,
};
