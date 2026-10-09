import { pageHero, ctaBand, callout, faq, docLayout } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

// Không có trang /so-sanh/ nên breadcrumb chỉ hai cấp (liên kết cấp giữa sẽ hỏng).
const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Dịch offline và dịch cloud", path: "/so-sanh/dich-offline-va-cloud/" },
];

export const COMPARE_FAQ = [
  {
    q: "Dịch offline có chính xác bằng dịch cloud không?",
    a: "<p>Chúng tôi chưa có phép đo so sánh trực tiếp nên không kết luận. Chất lượng phụ thuộc model, cặp ngôn ngữ và độ rõ của âm thanh. Thử nghiệm nội bộ của chúng tôi chỉ so các model mã nguồn mở với nhau, không so với dịch vụ cloud.</p>",
  },
  {
    q: "Dịch offline có thật sự không cần internet?",
    a: "<p>Khi đang dịch thì không. Internet chỉ cần để tải model lần đầu, đăng ký dùng thử, mua gói, kiểm tra bản quyền (gói trả phí dùng offline tối đa 14 ngày giữa hai lần kiểm tra) và cập nhật app.</p>",
  },
  {
    q: "Dịch offline có hợp với cuộc họp nhạy cảm không?",
    a: "<p>Âm thanh không rời máy nên không có bên thứ ba xử lý âm thanh. Nhưng mức an toàn tổng thể còn phụ thuộc máy của bạn và quy định của tổ chức, nên hãy hỏi bộ phận bảo mật. App không ghi âm cuộc họp; lịch sử chép lời mặc định tắt.</p>",
  },
  {
    q: "Máy cần cấu hình gì để dịch offline?",
    a: "<p>RAM tối thiểu 8 GB (khuyến nghị 16 GB), Mac Apple Silicon với macOS 14.2 trở lên, và khoảng 1,3 GB (gói model Nhẹ) hoặc 2,5 GB (gói model Chuẩn) ổ đĩa cho model. Bản Windows cần Windows 10/11 64-bit (x64) với CPU có AVX2; Mac Intel và Windows ARM64 chưa hỗ trợ.</p>",
  },
  {
    q: "Dịch offline có dịch giọng của tôi cho người khác nghe không?",
    a: "<p>Chưa. AI Translator dịch một chiều, từ âm thanh phát trên máy sang ngôn ngữ của bạn; chưa dịch giọng bạn cho người khác nghe.</p>",
  },
];

const toc = [
  { level: 2, id: "bang-so-sanh", text: "Bảng so sánh" },
  { level: 2, id: "rieng-tu", text: "Riêng tư" },
  { level: 2, id: "mang-va-bot", text: "Internet và bot" },
  { level: 2, id: "chi-phi", text: "Chi phí" },
  { level: 2, id: "tre-may-ngon-ngu", text: "Độ trễ, máy, ngôn ngữ" },
  { level: 2, id: "cap-nhat-tich-hop", text: "Cập nhật, tích hợp" },
  { level: 2, id: "chon", text: "Chọn cách nào" },
  { level: 2, id: "hoi-dap", text: "Hỏi đáp" },
];

export default {
  id: "compare-offline-cloud",
  lang: "vi",
  path: "/so-sanh/dich-offline-va-cloud/",
  title: "Dịch cuộc họp offline hay cloud: khác nhau thế nào?",
  description:
    "Tổng quan dịch họp offline và online (cloud): quyền riêng tư, cần mạng hay không, bot, chi phí, độ trễ, cấu hình máy, số ngôn ngữ và khi nào chọn cách nào.",
  type: "article",
  published: "2026-10-08",
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  schema: [faqPage(COMPARE_FAQ.map((f) => ({ q: f.q, a: f.a })))],
  llm: "So sánh cân bằng dịch cuộc họp offline (xử lý trên máy) và cloud (xử lý trên máy chủ): quyền riêng tư, internet, bot, chi phí, độ trễ, phần cứng, ngôn ngữ, cập nhật, tích hợp và khi nào chọn cách nào.",
  llmTitle: "Dịch offline và dịch cloud: khác nhau thế nào?",
  body: () => `
${pageHero({
  crumbs,
  title: "Dịch offline và dịch cloud: khác nhau thế nào?",
  lead: "Dịch cloud gửi âm thanh lên máy chủ của nhà cung cấp để xử lý; dịch offline xử lý ngay trên máy bạn, như AI Translator. Offline giữ âm thanh ở lại máy, chạy được khi mất mạng và không cần bot, nhưng đòi hỏi máy đủ mạnh và hiện chỉ có năm ngôn ngữ. Cloud nhẹ máy, thường nhiều ngôn ngữ hơn và có thể tích hợp sẵn trong nền tảng họp, nhưng âm thanh phải rời máy bạn.",
  meta: "<span>Cập nhật {{updated}}</span>",
})}

<section class="section"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài",
  body: `
<h2 id="bang-so-sanh">Bảng so sánh nhanh</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Tiêu chí</th><th scope="col">Dịch cloud</th><th scope="col">Dịch offline (AI Translator)</th></tr></thead>
<tbody>
<tr><th scope="row">Nơi model AI chạy</th><td>Trên cloud của nhà cung cấp</td><td>Trên máy của bạn</td></tr>
<tr><th scope="row">Nơi xử lý âm thanh</th><td>Máy chủ của nhà cung cấp</td><td>Máy của bạn</td></tr>
<tr><th scope="row">Âm thanh rời máy?</th><td>Có</td><td>Không, chỉ nằm trong RAM</td></tr>
<tr><th scope="row">Cần internet khi dịch</th><td>Có</td><td>Không</td></tr>
<tr><th scope="row">Bot hoặc plugin</th><td>Tính năng tích hợp thì không; công cụ ngoài có thể cần</td><td>Không, dùng với mọi app phát tiếng</td></tr>
<tr><th scope="row">Chi phí khi dịch thêm một phút</th><td>Tốn tài nguyên máy chủ của nhà cung cấp</td><td>Không tốn hạ tầng của nhà cung cấp; dùng máy bạn</td></tr>
<tr><th scope="row">Độ trễ</th><td>Phụ thuộc đường truyền và tải máy chủ</td><td>Phụ thuộc phần cứng của bạn</td></tr>
<tr><th scope="row">Số ngôn ngữ</th><td>Thường nhiều hơn</td><td>5 ngôn ngữ</td></tr>
<tr><th scope="row">Yêu cầu máy</th><td>Thấp</td><td>RAM từ 8 GB, tải model 1,3–2,5 GB</td></tr>
<tr><th scope="row">Cập nhật model</th><td>Nhà cung cấp cập nhật, bạn nhận ngay</td><td>Bạn tải bản mới, app hỏi trước</td></tr>
<tr><th scope="row">Tích hợp</th><td>Nằm sẵn trong nền tảng họp</td><td>App riêng, thanh phụ đề riêng</td></tr>
</tbody></table></div>

<h2 id="rieng-tu">Quyền riêng tư và nơi xử lý</h2>
<p>Với dịch cloud, âm thanh được gửi tới máy chủ của nhà cung cấp. Nhiều nhà cung cấp có hợp đồng và chứng nhận bảo mật, nên cloud không mặc nhiên kém an toàn, nhưng bạn phải tin chính sách của họ và cân với quy định của tổ chức.</p>
<p>Với AI Translator, nhận dạng giọng nói và dịch chạy trên máy: âm thanh chỉ nằm trong RAM, không ghi đĩa, không gửi đi. Kiểm bằng proxy trên macOS cho thấy khi dịch không có âm thanh hay chữ chép lời rời máy (Windows chưa đo). Xem <a href="/bao-mat-du-lieu/">dữ liệu và bảo mật</a>.</p>

<h2 id="mang-va-bot">Internet, bot và phía chủ họp</h2>
<p>Dịch cloud cần mạng ổn định khi họp. AI Translator vẫn dịch được khi mạng chập chờn hoặc mất mạng. Nó chỉ cần mạng để tải model, đăng ký dùng thử, kích hoạt, mua gói, kiểm tra bản quyền (gói trả phí cần kiểm tra ít nhất 14 ngày một lần) và cập nhật, nên một mạng nội bộ hoàn toàn không ra được internet thì chưa phù hợp.</p>
<p>Phụ đề tích hợp có thể cần chủ họp hoặc quản trị viên bật, còn công cụ bên thứ ba có thể cần bot vào phòng. AI Translator chạy ở phía bạn nên không cần ai làm gì; đổi lại, người cùng họp không được báo. Nếu quy định đòi hỏi, bạn tự thông báo (xem <a href="/giai-phap/dich-hop-truc-tuyen/">giải pháp cho họp trực tuyến</a>).</p>

<h2 id="chi-phi">Chi phí và hạn mức</h2>
<p>Với cloud, mỗi phút dịch dùng tài nguyên máy chủ của nhà cung cấp. Phụ đề dịch tích hợp trong các nền tảng họp lớn thường chỉ có ở gói trả phí cao hơn. Với dịch offline, phần tính toán chạy trên máy bạn, nên thêm một phút dịch không tốn chi phí hạ tầng cho chúng tôi. Hạn mức của AI Translator (30 phút mỗi ngày khi dùng thử, 50 giờ mỗi 30 ngày ở Monthly, không giới hạn ở Yearly) là chính sách giá, không phải giới hạn kỹ thuật.</p>
<p>Chi phí chuyển sang máy bạn: RAM, ổ đĩa, điện năng (chưa đo pin). Xem <a href="/bang-gia/">bảng giá</a>.</p>

<h2 id="tre-may-ngon-ngu">Độ trễ, yêu cầu máy và số ngôn ngữ</h2>
<p>Cloud đẩy việc nặng sang máy chủ nên chạy được cả trên máy yếu, nhưng độ trễ còn phụ thuộc đường truyền. Dịch offline cần máy đủ mạnh: AI Translator cần RAM tối thiểu 8 GB (khuyến nghị 16 GB), Mac Apple Silicon với macOS 14.2 trở lên (hoặc Windows 10/11 64-bit có CPU hỗ trợ AVX2), và tải model một lần 1,3 GB (gói model Nhẹ) hoặc 2,5 GB (gói model Chuẩn).</p>
<p>Trên Mac M4 Pro, độ trễ trung vị là 0,76–1,03 giây với gói model Chuẩn. Máy yếu hơn sẽ chậm hơn; chưa đo Mac M1. Dịch vụ cloud thường hỗ trợ nhiều ngôn ngữ hơn năm ngôn ngữ của AI Translator (tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt). Chúng tôi không so chất lượng dịch vì chưa có phép đo chung.</p>

<h2 id="cap-nhat-tich-hop">Cập nhật model và độ tích hợp</h2>
<p>Cloud được nhà cung cấp cập nhật phía máy chủ nên bạn nhận bản mới mà không phải làm gì. Model offline giữ nguyên trên máy cho tới khi bạn tải bản mới; app hỏi trước khi tải.</p>
<p>Về tích hợp, phụ đề dịch nằm sẵn trong nền tảng họp tiện hơn nếu mọi người dùng chung nền tảng và gói của bạn đã có tính năng đó: không cài thêm gì, không phải sắp xếp cửa sổ. AI Translator là app riêng với thanh phụ đề riêng, đổi lại dùng được với mọi app họp, webinar và video.</p>

<h2 id="chon">Khi nào chọn cách nào?</h2>
<h3>Cloud hợp hơn khi</h3>
<ul>
<li>Bạn cần ngôn ngữ ngoài năm ngôn ngữ của AI Translator</li>
<li>Máy của bạn yếu, dưới 8 GB RAM, hoặc bạn không muốn tải model</li>
<li>Nền tảng họp của bạn đã có phụ đề dịch trong gói và mọi người cùng dùng nó</li>
</ul>
<h3>AI Translator (offline) hợp hơn khi</h3>
<ul>
<li>Âm thanh không được rời máy vì nội dung nhạy cảm hay quy định nội bộ</li>
<li>Mạng chập chờn hoặc hay mất kết nối (app vẫn cần mạng thỉnh thoảng để kiểm tra bản quyền)</li>
<li>Bạn họp trên nhiều app khác nhau, hoặc xem webinar và video</li>
<li>Gói nền tảng không có phụ đề dịch, và bạn không muốn bot trong phòng</li>
</ul>
${callout({ title: "Hai cách không loại trừ nhau.", text: "Bạn có thể dùng phụ đề tích hợp khi có sẵn, và AI Translator cho các cuộc họp hay video còn lại. Xem <a href=\"/tinh-nang/\">tính năng</a> và <a href=\"/huong-dan/bat-dau-nhanh/\">hướng dẫn bắt đầu nhanh</a>." })}

<h2 id="hoi-dap">Câu hỏi thường gặp</h2>
${faq(COMPARE_FAQ)}
`,
})}
</div></section>

${ctaBand({ title: "Thử dịch offline trên cuộc họp của bạn", text: "Dùng thử Free 10 ngày, mỗi ngày 30 phút. Không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/bao-mat-du-lieu/", label: "Xem cách xử lý dữ liệu" } })}
`,
};
