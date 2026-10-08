import { pageHero, faq, keys, appShot, docLayout, docNav } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Khắc phục sự cố", path: "/huong-dan/khac-phuc-su-co/" },
];

const toc = [
  { level: 2, id: "khong-co-am-thanh", text: "Không có phụ đề hoặc âm thanh" },
  { level: 2, id: "cham-hoac-dung", text: "Phụ đề chậm, thiếu hoặc dừng" },
  { level: 2, id: "model-macos", text: "Model, cài đặt và macOS" },
  { level: 2, id: "ban-quyen", text: "Bản quyền, hạn mức, dùng thử" },
  { level: 2, id: "gui-log", text: "Gửi log và báo lỗi" },
  { level: 2, id: "hoi-nhanh", text: "Hỏi nhanh" },
];

const QUICK = [
  {
    q: "Tôi đóng cửa sổ mà app vẫn chạy. Thoát hẳn thế nào?",
    a: "<p>Đóng cửa sổ chỉ ẩn app xuống menu bar. Hãy chọn <strong>Thoát</strong> ở biểu tượng AI Translator trên menu bar; ⌘Q không thoát hẳn.</p>",
  },
  {
    q: "Cài lại app có làm mất key hoặc mở lại 10 ngày dùng thử không?",
    a: "<p>Không. Cài lại trên cùng một máy không tính là máy mới, và 10 ngày dùng thử tính theo máy nên không mở lại được.</p>",
  },
  {
    q: "Gửi log có làm lộ nội dung cuộc họp không?",
    a: "<p>Không. Log không chứa âm thanh hay nội dung chép lời, và app không tự gửi log đi đâu.</p>",
  },
];

export default {
  id: "guide-troubleshooting",
  lang: "vi",
  path: "/huong-dan/khac-phuc-su-co/",
  title: "Khắc phục sự cố: lỗi thường gặp và cách xử lý",
  description:
    "Triệu chứng, nguyên nhân và cách xử lý cho AI Translator: không có phụ đề, không nghe thấy âm thanh, lỗi tải model, key bị khóa, hết hạn mức. Cách gửi log.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-08",
  schema: [faqPage(QUICK.map((f) => ({ q: f.q, a: f.a.replace(/<[^>]+>/g, "") })))],
  llm: "Bảng triệu chứng, nguyên nhân và cách xử lý theo đúng câu báo lỗi của app (âm thanh, quyền ghi âm, model, bản quyền, hạn mức, phím tắt), cách mở và gửi log, thông tin nên kèm khi báo lỗi.",
  llmTitle: "Khắc phục sự cố AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Khắc phục sự cố",
  lead: "Hầu hết sự cố của AI Translator thuộc bốn nhóm: quyền ghi âm, nguồn âm thanh, model và bản quyền. Tìm câu báo lỗi đúng chữ như app hiển thị trong các bảng dưới đây, làm theo cách xử lý, và nếu vẫn lỗi thì gửi log cho hỗ trợ.",
  meta: `<span>Cập nhật 08/10/2026</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
<h2 id="khong-co-am-thanh">Không có phụ đề hoặc không nghe thấy âm thanh</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Bạn thấy</th><th scope="col">Nguyên nhân</th><th scope="col">Cách xử lý</th></tr></thead>
<tbody>
<tr><th scope="row">“Không nghe thấy gì dù có app đang phát tiếng: có thể AI Translator chưa được phép ghi âm thanh hệ thống.”</th><td>macOS chưa cấp quyền và không báo lỗi: app chỉ nhận âm thanh im lặng.</td><td>Bấm <strong>Mở System Settings</strong>, bật AI Translator ở Privacy &amp; Security › Screen &amp; System Audio Recording › System Audio Recording Only, rồi <strong>Bắt đầu</strong> lại. Xem <a href="/huong-dan/cap-quyen-thu-am-macos/">cấp quyền thu âm</a>.</td></tr>
<tr><th scope="row">“Không nghe thấy âm thanh. Kiểm tra âm thanh cuộc họp có đang phát không.” hoặc “Không thu được âm thanh.”</th><td>Máy không phát tiếng, nguồn âm thanh sai, hoặc app không mở được nguồn.</td><td>Bật tiếng cuộc họp. Ở Cài đặt › Âm thanh, bấm <strong>Làm mới danh sách</strong>, chọn lại nguồn rồi <strong>Bắt đầu</strong> lại. Còn lỗi thì gửi log.</td></tr>
<tr><th scope="row">“App đã chọn không phát tiếng”</th><td>Bạn chọn <strong>Chỉ {tên app}</strong> mà app đó đang im.</td><td>Cho app phát tiếng (phiên chạy tiếp ngay), hoặc chọn <strong>Toàn hệ thống, trừ app này</strong> (từ phiên sau).</td></tr>
<tr><th scope="row">Không thấy thanh phụ đề</th><td>Thanh ẩn khi mở app cho tới khi bạn bấm Bắt đầu, hoặc đã bị ẩn bằng nút ✕ hay phím tắt.</td><td>Ở Màn hình chính, mục <strong>Thanh phụ đề</strong>, bấm <strong>Hiện</strong>; hoặc nhấn ${keys(["⌃", "⌥", "H"])}; hoặc chọn “Hiện phụ đề” ở menu bar. Thanh khóa thì mở khóa bằng ${keys(["⌃", "⌥", "L"])}.</td></tr>
<tr><th scope="row">“Có phím tắt không đăng ký được. Mở Cài đặt › Phím tắt để đổi.”</th><td>App khác đang giữ tổ hợp phím đó.</td><td>Ở Cài đặt › Phím tắt, bấm <strong>Đổi</strong> và nhấn tổ hợp mới, có ít nhất một phím Ctrl, Alt hoặc Cmd/Win (chỉ Shift thì chưa đủ).</td></tr>
</tbody></table></div>

<h2 id="cham-hoac-dung">Phụ đề chậm, thiếu hoặc dừng</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Bạn thấy</th><th scope="col">Nguyên nhân</th><th scope="col">Cách xử lý</th></tr></thead>
<tbody>
<tr><th scope="row">“Đang trễ”; “Đang chạy bằng CPU (chậm hơn).”; “Máy không đủ bộ nhớ. Nên dùng gói Nhẹ.”</th><td>Máy không theo kịp tốc độ nói, hoặc GPU lỗi nên app chuyển sang CPU.</td><td>Đóng bớt app nặng. Ở Cài đặt › Model, bấm <strong>Dùng gói này</strong> cho gói Nhẹ (từ phiên sau).</td></tr>
<tr><th scope="row">“Dịch không khả dụng: chỉ hiện câu gốc”; “Phiên dịch đã dừng vì lỗi. Mở cửa sổ chính để xem chi tiết.”; “Phần nhận dạng giọng nói ngừng chạy…”</th><td>Bộ dịch hoặc bộ nhận dạng lỗi. App tự khởi động lại chúng; quá 5 lần trong 10 phút thì dừng dịch.</td><td>Bấm <strong>Dừng</strong> rồi <strong>Bắt đầu</strong>. Nếu app báo thiếu hoặc hỏng một phần của app, hãy cài lại AI Translator. Lặp lại thì gửi log.</td></tr>
</tbody></table></div>

<h2 id="model-macos">Model, cài đặt và macOS</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Bạn thấy</th><th scope="col">Nguyên nhân</th><th scope="col">Cách xử lý</th></tr></thead>
<tbody>
<tr><th scope="row">“Không kết nối được máy chủ model. Kiểm tra kết nối mạng rồi thử lại.”</th><td>Máy không có mạng, hoặc mạng chặn tải.</td><td>Kiểm tra mạng rồi bấm <strong>Thử lại</strong>.</td></tr>
<tr><th scope="row">“Tải chưa xong. Bấm Tiếp tục để tải tiếp từ chỗ đã dừng.” hoặc “Một file tải về bị hỏng…”</th><td>Mạng rớt giữa chừng, hoặc file tải về không khớp mã kiểm tra.</td><td>Bấm <strong>Tiếp tục</strong>. Nếu app báo “Model bị hỏng. Hãy tải lại model.”, bấm <strong>Kiểm tra và tải lại</strong> ở Cài đặt › Model.</td></tr>
<tr><th scope="row">“Ổ đĩa không đủ chỗ cho gói này…” hoặc “Không ghi được file model xuống ổ đĩa.”</th><td>Ổ đĩa cần trống bằng dung lượng tải cộng 1 GB (gói Chuẩn khoảng 2,5 GB, gói Nhẹ khoảng 1,3 GB).</td><td>Giải phóng ổ đĩa, hoặc chọn gói Nhẹ.</td></tr>
<tr><th scope="row">“Máy này chưa đạt cấu hình tối thiểu nên không tải được model.”</th><td>Máy dưới mức tối thiểu: Mac Apple Silicon, RAM 8 GB.</td><td>Dùng máy đạt cấu hình. Xem yêu cầu ở <a href="/tai-xuong/">trang tải xuống</a>.</td></tr>
<tr><th scope="row">macOS báo không xác minh được nhà phát triển khi mở app lần đầu</th><td>Bản macOS hiện ký ad-hoc và chưa được Apple notarize.</td><td>Bấm <strong>Done</strong>, mở System Settings › Privacy &amp; Security, kéo xuống cuối, bấm <strong>Open Anyway</strong> cạnh AI Translator. Xem <a href="/huong-dan/cai-dat-macos/">cài đặt trên macOS</a>.</td></tr>
<tr><th scope="row">Sau khi cập nhật, macOS hỏi mật khẩu vài lần</th><td>Bình thường với bản ký ad-hoc: mật khẩu vài lần và quyền thu âm một lần.</td><td>Nhập mật khẩu, bấm <strong>Always Allow</strong> và cho phép quyền thu âm.</td></tr>
</tbody></table></div>

<h2 id="ban-quyen">Bản quyền, hạn mức và dùng thử</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Bạn thấy</th><th scope="col">Nguyên nhân</th><th scope="col">Cách xử lý</th></tr></thead>
<tbody>
<tr><th scope="row">“Đã hết hạn mức dịch · mở lại lúc …”</th><td>Đã dùng hết 30 phút hôm nay (Free) hoặc 50 giờ của chu kỳ (Monthly).</td><td>Đợi tới giờ mở lại ghi trên màn hình, hoặc <a href="/huong-dan/mua-va-kich-hoat-key/">gia hạn, đổi gói</a>.</td></tr>
<tr><th scope="row">“Đã hết 10 ngày dùng thử”</th><td>Free chỉ dùng thử 10 ngày mỗi máy; gỡ cài lại không mở lại.</td><td>Mua Monthly hoặc Yearly để dịch tiếp.</td></tr>
<tr><th scope="row">“Key đang dùng trên 2 máy nên đã bị tạm khóa…”</th><td>Key đang giữ ở hai máy.</td><td>Gỡ key khỏi một máy rồi bấm <strong>Thử lại</strong>: xem <a href="/huong-dan/mua-va-kich-hoat-key/#doi-may">cách đổi máy</a>.</td></tr>
<tr><th scope="row">“Cần kết nối mạng một lần để bắt đầu dùng thử” hoặc “Đã 14 ngày chưa kiểm được gói nên đang dùng Free. Hãy kết nối mạng.”</th><td>Máy chưa đăng ký dùng thử được vì chưa có mạng, hoặc gói trả phí quá 14 ngày chưa kiểm tra bản quyền.</td><td>Kết nối mạng, rồi bấm <strong>Kiểm tra ngay</strong> ở Cài đặt › Bản quyền (gói trả phí).</td></tr>
<tr><th scope="row">“Giờ của máy có vẻ không đúng. Chỉnh lại giờ rồi thử lại.” hoặc “Giờ máy đã bị chỉnh lùi…”</th><td>Đồng hồ máy bị chỉnh lùi.</td><td>Đặt lại giờ đúng (nên bật đặt giờ tự động), kết nối mạng để app kiểm lại.</td></tr>
<tr><th scope="row">“Key này không đúng…”; “Key này đang bị khóa tạm vì đổi máy quá nhiều lần…”; “Bản cài AI Translator này không chính hãng…”</th><td>Gõ sai key; đổi máy quá nhiều; hoặc bản cài không phải bản chính thức.</td><td>Dán lại key từ email; liên hệ hỗ trợ nếu key bị khóa; tải bản chính thức từ aitranslator.io.vn.</td></tr>
</tbody></table></div>

<h2 id="gui-log">Gửi log và báo lỗi cho hỗ trợ</h2>
<p>Mở <strong>Giới thiệu › Mở thư mục log</strong> để thấy file <code>app.log</code> (trên macOS: <code>~/Library/Logs/com.aitranslator.desktop/</code>). Log chỉ nằm trên máy bạn và không chứa âm thanh, nội dung chép lời hay key đầy đủ. App không tự gửi gì: bạn tự quyết có gửi cho <a href="/lien-he/">hỗ trợ</a> (support@aitranslator.io.vn) hay không.</p>
${appShot({
  slug: "app-about",
  lang: "vi",
  alt: "Màn hình Giới thiệu: tên app, dòng Phiên bản, nút Mở thư mục log kèm lưu ý log chỉ nằm trên máy, và các mục điều khoản, giấy phép mã nguồn mở",
  caption: "Giới thiệu: phiên bản và Mở thư mục log.",
})}
<p>Hãy liên hệ khi lỗi lặp lại sau khi làm theo bảng trên, khi key bị khóa tạm hoặc thu hồi, hoặc khi thanh toán có vấn đề. Hãy kèm trong thư:</p>
<ul>
<li>Phiên bản app (Giới thiệu › “Phiên bản …”), phiên bản macOS, chip (ví dụ MacBook Air M2) và RAM.</li>
<li>Gói model (Chuẩn hoặc Nhẹ, ở Cài đặt › Model) và gói bản quyền.</li>
<li>Câu báo lỗi đúng chữ hoặc ảnh chụp, app họp đang dùng, việc bạn vừa làm.</li>
<li>Mã đơn nếu liên quan thanh toán; <code>app.log</code> nếu bạn đồng ý.</li>
</ul>

<h2 id="hoi-nhanh">Hỏi nhanh</h2>
${faq(QUICK)}
`,
})}
${docNav(
  [
    { href: "/huong-dan/mua-va-kich-hoat-key/", kicker: "Bài trước", title: "Mua gói, kích hoạt key và đổi máy" },
    { href: "/cau-hoi-thuong-gap/", kicker: "Xem thêm", title: "Câu hỏi thường gặp" },
  ],
  "Bài liên quan",
)}
</div></section>
`,
};
