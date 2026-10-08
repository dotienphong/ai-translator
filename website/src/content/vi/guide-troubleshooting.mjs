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
<div class="grid grid-2">
<div class="card"><span class="card-title">“Không nghe thấy gì dù có app đang phát tiếng: có thể AI Translator chưa được phép ghi âm thanh hệ thống.”</span><p><strong>Nguyên nhân:</strong> macOS chưa cấp quyền và không báo lỗi: app chỉ nhận âm thanh im lặng.</p><p><strong>Cách xử lý:</strong> Bấm <strong>Mở System Settings</strong>, bật AI Translator ở Privacy &amp; Security › Screen &amp; System Audio Recording › System Audio Recording Only, rồi <strong>Bắt đầu</strong> lại. Xem <a href="/huong-dan/cap-quyen-thu-am-macos/">cấp quyền thu âm</a>.</p></div>
<div class="card"><span class="card-title">“Không nghe thấy âm thanh. Kiểm tra âm thanh cuộc họp có đang phát không.” hoặc “Không thu được âm thanh.”</span><p><strong>Nguyên nhân:</strong> Máy không phát tiếng, nguồn âm thanh sai, hoặc app không mở được nguồn.</p><p><strong>Cách xử lý:</strong> Bật tiếng cuộc họp. Ở Cài đặt › Âm thanh, bấm <strong>Làm mới danh sách</strong>, chọn lại nguồn rồi <strong>Bắt đầu</strong> lại. Còn lỗi thì gửi log.</p></div>
<div class="card"><span class="card-title">“App đã chọn không phát tiếng”</span><p><strong>Nguyên nhân:</strong> Bạn chọn <strong>Chỉ {tên app}</strong> mà app đó đang im.</p><p><strong>Cách xử lý:</strong> Cho app phát tiếng (phiên chạy tiếp ngay), hoặc chọn <strong>Toàn hệ thống, trừ app này</strong> (từ phiên sau).</p></div>
<div class="card"><span class="card-title">Không thấy thanh phụ đề</span><p><strong>Nguyên nhân:</strong> Thanh ẩn khi mở app cho tới khi bạn bấm Bắt đầu, hoặc đã bị ẩn bằng nút ✕ hay phím tắt.</p><p><strong>Cách xử lý:</strong> Ở Màn hình chính, mục <strong>Thanh phụ đề</strong>, bấm <strong>Hiện</strong>; hoặc nhấn ${keys(["⌃", "⌥", "H"])}; hoặc chọn “Hiện phụ đề” ở menu bar. Thanh khóa thì mở khóa bằng ${keys(["⌃", "⌥", "L"])}.</p></div>
<div class="card"><span class="card-title">“Có phím tắt không đăng ký được. Mở Cài đặt › Phím tắt để đổi.”</span><p><strong>Nguyên nhân:</strong> App khác đang giữ tổ hợp phím đó.</p><p><strong>Cách xử lý:</strong> Ở Cài đặt › Phím tắt, bấm <strong>Đổi</strong> và nhấn tổ hợp mới, có ít nhất một phím Ctrl, Alt hoặc Cmd/Win (chỉ Shift thì chưa đủ).</p></div>
</div>

<h2 id="cham-hoac-dung">Phụ đề chậm, thiếu hoặc dừng</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">“Đang trễ”; “Đang chạy bằng CPU (chậm hơn).”; “Máy không đủ bộ nhớ. Nên dùng gói Nhẹ.”</span><p><strong>Nguyên nhân:</strong> Máy không theo kịp tốc độ nói, hoặc GPU lỗi nên app chuyển sang CPU.</p><p><strong>Cách xử lý:</strong> Đóng bớt app nặng. Ở Cài đặt › Model, chọn gói Nhẹ rồi bấm <strong>Dùng gói này</strong> (nếu chưa tải gói đó thì bấm <strong>Tải và dùng</strong>); gói mới được dùng từ phiên dịch sau.</p></div>
<div class="card"><span class="card-title">“Dịch không khả dụng: chỉ hiện câu gốc”; “Phiên dịch đã dừng vì lỗi. Mở cửa sổ chính để xem chi tiết.”; “Phần nhận dạng giọng nói ngừng chạy…”</span><p><strong>Nguyên nhân:</strong> Bộ dịch hoặc bộ nhận dạng lỗi. App tự khởi động lại chúng; quá 5 lần trong 10 phút thì dừng dịch.</p><p><strong>Cách xử lý:</strong> Bấm <strong>Dừng</strong> rồi <strong>Bắt đầu</strong>. Nếu app báo thiếu hoặc hỏng một phần của app, hãy cài lại AI Translator. Lặp lại thì gửi log.</p></div>
</div>

<h2 id="model-macos">Model, cài đặt và macOS</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">“Không kết nối được máy chủ model. Kiểm tra kết nối mạng rồi thử lại.”</span><p><strong>Nguyên nhân:</strong> Máy không có mạng, hoặc mạng chặn tải.</p><p><strong>Cách xử lý:</strong> Kiểm tra mạng rồi bấm <strong>Thử lại</strong>.</p></div>
<div class="card"><span class="card-title">“Tải chưa xong. Bấm Tiếp tục để tải tiếp từ chỗ đã dừng.” hoặc “Một file tải về bị hỏng…”</span><p><strong>Nguyên nhân:</strong> Mạng rớt giữa chừng, hoặc file tải về không khớp mã kiểm tra.</p><p><strong>Cách xử lý:</strong> Bấm <strong>Tiếp tục</strong>. Nếu app báo “Model bị hỏng. Hãy tải lại model.”, bấm <strong>Kiểm tra và tải lại</strong> ở Cài đặt › Model.</p></div>
<div class="card"><span class="card-title">“Ổ đĩa không đủ chỗ cho gói này…” hoặc “Không ghi được file model xuống ổ đĩa.”</span><p><strong>Nguyên nhân:</strong> Ổ đĩa cần trống bằng dung lượng tải cộng 1 GB (gói Chuẩn khoảng 2,5 GB, gói Nhẹ khoảng 1,3 GB).</p><p><strong>Cách xử lý:</strong> Giải phóng ổ đĩa, hoặc chọn gói Nhẹ.</p></div>
<div class="card"><span class="card-title">“Máy này chưa đạt cấu hình tối thiểu nên không tải được model.”</span><p><strong>Nguyên nhân:</strong> Máy dưới mức tối thiểu: Mac Apple Silicon, RAM 8 GB.</p><p><strong>Cách xử lý:</strong> Dùng máy đạt cấu hình. Xem yêu cầu ở <a href="/tai-xuong/">trang tải xuống</a>.</p></div>
<div class="card"><span class="card-title">macOS báo không xác minh được nhà phát triển khi mở app lần đầu</span><p><strong>Nguyên nhân:</strong> Bản macOS hiện ký ad-hoc và chưa được Apple notarize.</p><p><strong>Cách xử lý:</strong> Bấm <strong>Done</strong>, mở System Settings › Privacy &amp; Security, kéo xuống cuối, bấm <strong>Open Anyway</strong> cạnh AI Translator. Xem <a href="/huong-dan/cai-dat-macos/">cài đặt trên macOS</a>.</p></div>
<div class="card"><span class="card-title">Sau khi cập nhật, macOS hỏi mật khẩu vài lần</span><p><strong>Nguyên nhân:</strong> Bình thường với bản ký ad-hoc: mật khẩu vài lần và quyền thu âm một lần.</p><p><strong>Cách xử lý:</strong> Nhập mật khẩu, bấm <strong>Always Allow</strong> và cho phép quyền thu âm.</p></div>
</div>

<h2 id="ban-quyen">Bản quyền, hạn mức và dùng thử</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">“Đã hết hạn mức dịch · mở lại lúc …”</span><p><strong>Nguyên nhân:</strong> Đã dùng hết 30 phút hôm nay (Free) hoặc 50 giờ của chu kỳ (Monthly).</p><p><strong>Cách xử lý:</strong> Đợi tới giờ mở lại ghi trên màn hình, hoặc <a href="/huong-dan/mua-va-kich-hoat-key/">gia hạn, đổi gói</a>.</p></div>
<div class="card"><span class="card-title">“Đã hết 10 ngày dùng thử”</span><p><strong>Nguyên nhân:</strong> Free chỉ dùng thử 10 ngày mỗi máy; gỡ cài lại không mở lại.</p><p><strong>Cách xử lý:</strong> Mua Monthly hoặc Yearly để dịch tiếp.</p></div>
<div class="card"><span class="card-title">“Key đang dùng trên 2 máy nên đã bị tạm khóa…”</span><p><strong>Nguyên nhân:</strong> Key đang giữ ở hai máy.</p><p><strong>Cách xử lý:</strong> Gỡ key khỏi một máy rồi bấm <strong>Thử lại</strong>: xem <a href="/huong-dan/mua-va-kich-hoat-key/#doi-may">cách đổi máy</a>.</p></div>
<div class="card"><span class="card-title">“Cần kết nối mạng một lần để bắt đầu dùng thử” hoặc “Đã 14 ngày chưa kiểm được gói nên đang dùng Free. Hãy kết nối mạng.”</span><p><strong>Nguyên nhân:</strong> Máy chưa đăng ký dùng thử được vì chưa có mạng, hoặc gói trả phí quá 14 ngày chưa kiểm tra bản quyền.</p><p><strong>Cách xử lý:</strong> Kết nối mạng. Nếu máy chưa đăng ký dùng thử, bấm <strong>Bắt đầu</strong> lại để app đăng ký. Với gói trả phí, bấm <strong>Kiểm tra ngay</strong> ở Cài đặt › Bản quyền.</p></div>
<div class="card"><span class="card-title">“Giờ của máy có vẻ không đúng. Chỉnh lại giờ rồi thử lại.” hoặc “Giờ máy đã bị chỉnh lùi…”</span><p><strong>Nguyên nhân:</strong> Đồng hồ máy bị chỉnh lùi.</p><p><strong>Cách xử lý:</strong> Đặt lại giờ đúng (nên bật đặt giờ tự động), kết nối mạng để app kiểm lại.</p></div>
<div class="card"><span class="card-title">“Key này không đúng…”; “Key này đang bị khóa tạm vì đổi máy quá nhiều lần…”; “Bản cài AI Translator này không chính hãng…”</span><p><strong>Nguyên nhân:</strong> Gõ sai key; đổi máy quá nhiều; hoặc bản cài không phải bản chính thức.</p><p><strong>Cách xử lý:</strong> Dán lại key từ email; liên hệ hỗ trợ nếu key bị khóa; tải lại bản cài chính thức từ liên kết do chúng tôi gửi hoặc từ aitranslator.io.vn.</p></div>
</div>

<h2 id="gui-log">Gửi log và báo lỗi cho hỗ trợ</h2>
<p>Mở <strong>Giới thiệu › Mở thư mục log</strong> để thấy file <code>app.log</code> (trên macOS: thư mục con <code>com.aitranslator.desktop</code> trong <code>~/Library/Logs/</code>). Log chỉ nằm trên máy bạn và không chứa âm thanh, nội dung chép lời hay key đầy đủ. App không tự gửi gì: bạn tự quyết có gửi cho <a href="/lien-he/">hỗ trợ</a> (support@aitranslator.io.vn) hay không.</p>
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
