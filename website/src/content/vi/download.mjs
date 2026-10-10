import { RELEASE } from "../../site.mjs";
import { pageHero, sectionHead, steps, callout, facts, ctaBand, feature, icon, faq, cmdBlock, chips, flow, osTabs } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Tải xuống", path: "/tai-xuong/" },
];

const mailto = (subject, body) =>
  `mailto:support@aitranslator.io.vn?subject=${encodeURIComponent(subject)}&amp;body=${encodeURIComponent(body.join("\n"))}`;

const MAILTO_MAC = mailto("Nhận bản cài AI Translator (macOS)", [
  "Xin chào AI Translator,",
  "",
  "Tôi muốn nhận file .dmg cài đặt cho macOS.",
  "",
  "- Họ tên:",
  "- Dòng Mac và chip (ví dụ MacBook Air M2):",
  "- Phiên bản macOS:",
  "- RAM:",
  "- Tôi định dùng với (Zoom, Teams, Meet, Zalo, webinar...):",
  "- Ngôn ngữ cần dịch (Anh, Trung, Nhật, Hàn, Việt):",
  "",
  "Cảm ơn!",
]);

const MAILTO_WIN = mailto("Nhận bản cài AI Translator (Windows)", [
  "Xin chào AI Translator,",
  "",
  "Tôi muốn nhận file .exe cài đặt cho Windows.",
  "",
  "- Họ tên:",
  "- Dòng máy và CPU (ví dụ laptop Dell, Intel Core i5-1235U):",
  "- Phiên bản Windows (10 hoặc 11):",
  "- RAM:",
  "- Card đồ họa (nếu có):",
  "- Tôi định dùng với (Zoom, Teams, Meet, Zalo, webinar...):",
  "- Ngôn ngữ cần dịch (Anh, Trung, Nhật, Hàn, Việt):",
  "",
  "Cảm ơn!",
]);

const INSTALL_CMD = "curl -fsSL https://aitranslator.io.vn/install.sh | bash";
const INSTALL_CMD_BETA = "curl -fsSL https://aitranslator.io.vn/install.sh | bash -s -- --beta";
const INSTALL_CMD_REVIEW = "curl -fsSL https://aitranslator.io.vn/install.sh -o install.sh && less install.sh && bash install.sh";
const WIN_CMD = "irm https://aitranslator.io.vn/install.ps1 | iex";
const WIN_CMD_BETA = "& ([scriptblock]::Create((irm https://aitranslator.io.vn/install.ps1))) -Beta";
const WIN_CMD_REVIEW = "$s = irm https://aitranslator.io.vn/install.ps1; $s | more; iex $s";

const COPY = { copy: "Sao chép", copied: "Đã chép" };

const DL_FAQ = [
  {
    q: "Lệnh một dòng làm gì, và có an toàn không?",
    a: "<p>Lệnh tải một script nhỏ từ <strong>aitranslator.io.vn</strong>. Script kiểm máy của bạn, đọc số phiên bản mới nhất, tải bộ cài và mã SHA-256 từ <strong>releases.aitranslator.io.vn</strong>, đối chiếu mã, cài rồi mở app. Script không gửi dữ liệu đi và không cần quyền quản trị.</p><p>Chạy một lệnh dán từ internet luôn cần tin nguồn của nó. Nếu muốn đọc script trước khi chạy, mở mục “Tôi muốn đọc script trước khi chạy” trong hướng dẫn của hệ điều hành bạn. Mã SHA-256 nằm cùng máy chủ với file nên chủ yếu bảo vệ bạn khỏi file tải lỗi, không thay được việc tin nguồn.</p>",
  },
  {
    q: "Vì sao không có nút tải file .dmg hay .exe?",
    a: "<p>Bản hiện tại chưa được ký bởi Apple hay Microsoft (chúng tôi chưa có Apple Developer ID và chứng thư ký mã Windows). File tải bằng trình duyệt bị gắn nhãn “tải từ internet”, nên macOS chặn lần mở đầu của file .dmg (Open Anyway) và Windows SmartScreen có thể cảnh báo file .exe. File tải bằng lệnh trong Terminal hay PowerShell không bị gắn nhãn đó, nên app cài và mở thẳng. Khi có chứng thư, chúng tôi sẽ thêm nút tải trực tiếp.</p>",
  },
  {
    q: "Cập nhật và gỡ cài đặt thế nào?",
    a: "<p>App tự kiểm tra bản mới (Cài đặt › Chung). Bạn cũng có thể chạy lại đúng lệnh cài bất cứ lúc nào để cài bản mới nhất; script đóng app đang chạy rồi thay bản cũ. Gỡ cài đặt: xóa model và dữ liệu trong app trước, rồi gỡ app, xem hướng dẫn gỡ cài đặt trên <a href=\"/huong-dan/cai-dat-macos/#go-cai-dat\">macOS</a> và <a href=\"/huong-dan/cai-dat-windows/#go-cai-dat\">Windows</a>.</p>",
  },
  {
    q: "Máy Mac Intel có dùng được không?",
    a: "<p>Chưa. AI Translator cần Mac dùng chip Apple Silicon (M1 trở lên) và macOS 14.2 trở lên. Lệnh cài sẽ dừng và báo lý do nếu máy không đạt.</p>",
  },
  {
    q: "Máy Windows nào dùng được?",
    a: "<p>Windows 10 hoặc 11 bản 64-bit (x64), CPU có AVX2, RAM tối thiểu 8 GB. Chưa hỗ trợ Windows ARM64. Máy không có AVX2 hoặc dưới 8 GB RAM: app báo lý do và không cho tải model. Độ trễ trên Windows mới đo sơ bộ trên một laptop có GPU tích hợp và chậm hơn Mac M4 Pro, nên chúng tôi chưa cam kết con số nào.</p>",
  },
  {
    q: "App có tự cập nhật không?",
    a: "<p>Có kênh cập nhật <em>Ổn định</em> và <em>Beta</em> trong Cài đặt › Chung. App kiểm tra bản mới khi khởi động và mỗi 24 giờ; đổi kênh thì kiểm ngay. Muốn kiểm ngay, bấm <strong>Kiểm tra cập nhật</strong> ở khối đầu trang Cài đặt › Chung, cạnh dòng “Phiên bản …” (mỗi lần kiểm xong app ghi “Kiểm tra lúc HH:MM:SS”), hoặc chọn “Kiểm tra cập nhật…” ở menu của biểu tượng app. Trên macOS mỗi lần cập nhật hỏi lại 1 hộp thoại Keychain; trên Windows không hỏi gì thêm.</p>",
  },
];

const macPanel = () => `
${chips([["command", "macOS 14.2 trở lên"], ["cpu", "Apple Silicon (M1 trở lên)"], ["download", "Bộ cài khoảng 9 MB"], ["shield", "Không cần mật khẩu quản trị"]])}
${flow([
  { title: "Mở Terminal", text: "<p>Nhấn <span class='nowrap'><kbd>⌘</kbd> + <kbd>Space</kbd></span>, gõ <strong>Terminal</strong> rồi nhấn Enter.</p>" },
  {
    title: "Dán lệnh này và nhấn Enter",
    text: `<p>Bấm <strong>Sao chép</strong>, rồi dán vào Terminal bằng <span class='nowrap'><kbd>⌘</kbd> + <kbd>V</kbd></span>.</p>${cmdBlock({ cmd: INSTALL_CMD, ...COPY, label: "Lệnh cài AI Translator trên macOS", term: "Terminal" })}<p class="small">Không cần mật khẩu. Chạy lại đúng lệnh này bất cứ lúc nào để cập nhật lên bản mới nhất.</p>`,
  },
  { title: "Chờ app mở", text: "<p>Khoảng một phút: lệnh tải bản mới nhất, kiểm mã SHA-256, chép AI Translator vào Applications rồi mở app. Lần đầu bạn bấm <strong>Bắt đầu</strong>, macOS hỏi quyền ghi âm thanh hệ thống: chọn cho phép.</p>" },
])}
<div class="panel-more">
<h3>Tùy chọn và xử lý sự cố</h3>
${faq(
  [
    {
      q: "Vì sao không cần bấm Open Anyway?",
      a: "<p>Bản macOS chưa được Apple notarize (chúng tôi chưa có Apple Developer ID), nên macOS chặn file .dmg tải bằng trình duyệt ở lần mở đầu. File tải bằng lệnh trong Terminal không bị macOS gắn nhãn “tải từ internet”, nên app mở thẳng. Cái giá là bạn phải tin nguồn của lệnh: xem câu hỏi bên dưới.</p>",
    },
    {
      q: "Tôi muốn đọc script trước khi chạy",
      a: `<p>Script nằm ở <a href="/install.sh">aitranslator.io.vn/install.sh</a> (khoảng 200 dòng, có chú thích). Lệnh sau tải về, cho bạn đọc, rồi mới chạy:</p>${cmdBlock({ cmd: INSTALL_CMD_REVIEW, ...COPY, label: "Lệnh tải script về đọc trước khi chạy", term: "Terminal" })}`,
    },
    {
      q: "Thử các bản mới sớm hơn (kênh Beta)",
      a: `<p>Mặc định lệnh cài bản ổn định. Muốn thử các bản mới sớm hơn khi chúng được phát hành (kênh Beta), thêm <code>-s -- --beta</code> sau <code>bash</code>:</p>${cmdBlock({ cmd: INSTALL_CMD_BETA, ...COPY, label: "Lệnh cài kênh beta", term: "Terminal" })}`,
    },
    {
      q: "Tôi đã tải file .dmg bằng trình duyệt và macOS chặn",
      a: "<p>Cách nhanh nhất là chạy lệnh cài ở trên: nó cài bản mới nhất đè lên và app mở thẳng. Hoặc cho phép thủ công: mở <strong>System Settings › Privacy &amp; Security</strong>, kéo xuống cuối, bấm <strong>Open Anyway</strong> cạnh tên AI Translator rồi xác nhận bằng mật khẩu hoặc Touch ID. Xem <a href=\"/huong-dan/cai-dat-macos/\">hướng dẫn cài đặt trên macOS</a>.</p>",
    },
    {
      q: "Sau mỗi lần cập nhật, macOS hỏi gì?",
      a: "<p>Bản ký ad-hoc có chữ ký khác sau mỗi bản, nên macOS hỏi lại quyền truy cập Keychain: <strong>1 hộp thoại</strong> hỏi mật khẩu đăng nhập Mac (chọn <strong>Always Allow</strong>), và quyền ghi âm thanh hệ thống có thể được hỏi lại một lần. Người dùng mới cài lần đầu không gặp hộp thoại Keychain nào. Riêng lần cập nhật đầu tiên từ bản 0.1.0 lên 0.1.1 hỏi 5 hộp thoại một lần.</p>",
    },
    {
      q: "Tôi muốn nhận file .dmg qua email",
      a: `<p>Gửi cho chúng tôi một email ngắn tại <a href="${MAILTO_MAC}">support@aitranslator.io.vn</a>; chúng tôi trả lời kèm file .dmg và mã SHA-256. File .dmg tải bằng trình duyệt cần bước Open Anyway ở lần mở đầu.</p>`,
    },
  ],
  { open: false },
)}
</div>
<div class="panel-foot"><p>Cần hướng dẫn từng bước kèm cách gỡ cài đặt?</p><a class="btn btn-secondary btn-sm" href="/huong-dan/cai-dat-macos/">Hướng dẫn chi tiết cho macOS ${icon("arrow-right")}</a></div>
`;

const winPanel = () => `
${chips([["windows", "Windows 10 hoặc 11, 64-bit"], ["cpu", "CPU có AVX2"], ["download", "Bộ cài khoảng 22 MB"], ["shield", "Không cần quyền quản trị"]])}
${flow([
  { title: "Mở PowerShell", text: "<p>Nhấn phím <kbd>Windows</kbd>, gõ <strong>PowerShell</strong> rồi nhấn Enter. Không cần chạy bằng quyền quản trị.</p>" },
  {
    title: "Dán lệnh này và nhấn Enter",
    text: `<p>Bấm <strong>Sao chép</strong>, rồi dán vào PowerShell (bấm chuột phải hoặc <span class='nowrap'><kbd>Ctrl</kbd> + <kbd>V</kbd></span>).</p>${cmdBlock({ cmd: WIN_CMD, ...COPY, label: "Lệnh cài AI Translator trên Windows", term: "Windows PowerShell", prompt: "PS>" })}<p class="small">Chạy lại đúng lệnh này bất cứ lúc nào để cập nhật lên bản mới nhất (bộ cài đóng app đang chạy rồi thay bản cũ).</p>`,
  },
  { title: "Chờ app mở", text: "<p>Khoảng một phút: lệnh tải bản mới nhất, kiểm mã SHA-256, chạy bộ cài im lặng cho riêng tài khoản của bạn rồi mở AI Translator. Windows không hỏi quyền ghi âm; app tải model một lần rồi sẵn sàng dịch.</p>" },
])}
<div class="panel-more">
<h3>Tùy chọn và xử lý sự cố</h3>
${faq(
  [
    {
      q: "Vì sao Windows không cảnh báo SmartScreen?",
      a: "<p>Bản Windows chưa được ký mã (chúng tôi chưa mua chứng thư ký mã Windows). SmartScreen chỉ kiểm file mang dấu “tải từ internet”, loại dấu mà trình duyệt gắn khi bạn tải file. File tải bằng PowerShell không có dấu đó, nên bộ cài chạy thẳng. Bạn vẫn phải tin nguồn của lệnh: xem câu hỏi bên dưới.</p>",
    },
    {
      q: "Tôi muốn đọc script trước khi chạy",
      a: `<p>Script nằm ở <a href="/install.ps1">aitranslator.io.vn/install.ps1</a> (có chú thích). Lệnh sau in script ra để bạn đọc rồi mới chạy:</p>${cmdBlock({ cmd: WIN_CMD_REVIEW, ...COPY, label: "Lệnh in script ra đọc trước khi chạy", term: "Windows PowerShell", prompt: "PS>" })}`,
    },
    {
      q: "Thử các bản mới sớm hơn (kênh Beta)",
      a: `<p>Mặc định lệnh cài bản ổn định. Muốn thử các bản mới sớm hơn khi chúng được phát hành (kênh Beta), dùng lệnh sau:</p>${cmdBlock({ cmd: WIN_CMD_BETA, ...COPY, label: "Lệnh cài kênh beta trên Windows", term: "Windows PowerShell", prompt: "PS>" })}`,
    },
    {
      q: "Windows 11 báo ứng dụng bị chặn và không có nút bỏ qua",
      a: "<p>Đó là <strong>Smart App Control</strong>. Ở chế độ chặn, nó không cho chạy ứng dụng chưa ký mã và chưa có uy tín, bất kể cài bằng cách nào. Bạn có thể tắt nó: mở <strong>Windows Security › App &amp; browser control › Smart App Control settings</strong> rồi chọn <strong>Off</strong>, sau đó chạy lại lệnh cài. Khi chúng tôi có chứng thư ký mã Windows, vấn đề này sẽ hết. <a href=\"/huong-dan/cai-dat-windows/#smart-app-control\">Xem chi tiết</a>.</p>",
    },
    {
      q: "Tôi đã tải file .exe bằng trình duyệt và SmartScreen cảnh báo",
      a: "<p>Màn hình xanh “Windows protected your PC” là bình thường với bản chưa ký mã. Nếu file đúng nguồn và mã SHA-256 khớp, bấm <strong>More info</strong>, kiểm dòng App là đúng tên file cài, rồi bấm <strong>Run anyway</strong>. Hoặc chạy lệnh cài ở trên: nó cài bản mới nhất mà không qua SmartScreen. <a href=\"/huong-dan/cai-dat-windows/\">Xem hướng dẫn từng bước</a>.</p>",
    },
    {
      q: "Lệnh báo lỗi trên máy công ty hay trường học",
      a: "<p>Máy do tổ chức quản lý có thể chặn script PowerShell (Constrained Language Mode). Khi đó hãy dùng file .exe (nhận qua email) hoặc hỏi quản trị viên.</p>",
    },
    {
      q: "Tôi muốn nhận file .exe qua email",
      a: `<p>Gửi cho chúng tôi một email ngắn tại <a href="${MAILTO_WIN}">support@aitranslator.io.vn</a>; chúng tôi trả lời kèm file .exe và mã SHA-256. File .exe tải bằng trình duyệt có thể bị SmartScreen cảnh báo.</p>`,
    },
  ],
  { open: false },
)}
</div>
<div class="panel-foot"><p>Cần hướng dẫn từng bước kèm cách gỡ cài đặt?</p><a class="btn btn-secondary btn-sm" href="/huong-dan/cai-dat-windows/">Hướng dẫn chi tiết cho Windows ${icon("arrow-right")}</a></div>
`;

export default {
  id: "download",
  lang: "vi",
  path: "/tai-xuong/",
  title: "Tải AI Translator: cài macOS và Windows bằng một dòng lệnh",
  description:
    "Tải AI Translator: cài trên macOS 14.2+ (Apple Silicon) hoặc Windows 10/11 bằng một dòng lệnh, mở thẳng không cần Open Anyway. Dùng thử Free 10 ngày.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-09",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: f.a })))],
  llm: "Tải AI Translator: trang tự nhận ra hệ điều hành và mở đúng hướng dẫn. macOS cài bằng một dòng lệnh Terminal (curl ... install.sh | bash): tải bản cài, kiểm SHA-256 rồi mở app, không cần Open Anyway. Windows cài bằng một dòng lệnh PowerShell (irm ... install.ps1 | iex); file .exe tải bằng trình duyệt có thể bị SmartScreen cảnh báo vì bản chưa ký mã, Smart App Control có thể chặn. Yêu cầu máy.",
  llmTitle: "Tải AI Translator",
  body: () => `
${pageHero({
  crumbs,
  title: "Tải AI Translator cho macOS và Windows",
  lead: "Chọn hệ điều hành của bạn, dán một dòng lệnh vào Terminal hoặc PowerShell: app được tải, kiểm tra và mở lên ngay. Dùng thử Free 10 ngày, không cần thẻ.",
  meta: '<span id="os-detect" class="os-detect" hidden></span>',
})}

<section class="section-tight" id="cai-dat"><div class="container dl">
${osTabs({
  labels: {
    list: "Chọn hệ điều hành",
    mine: "Máy của bạn",
    detected: "Chúng tôi nhận ra bạn đang dùng {os}",
    mobile: "Bạn đang xem trên điện thoại hoặc máy tính bảng. AI Translator chạy trên máy tính macOS hoặc Windows: hãy mở trang này trên máy tính của bạn.",
    other: "AI Translator hiện chỉ có cho macOS và Windows, chưa có cho hệ điều hành của máy này. Bạn vẫn có thể xem hướng dẫn của cả hai bên dưới.",
    copyLink: "Sao chép liên kết trang",
    copied: "Đã chép",
  },
  tabs: [
    { key: "macos", id: "cai-macos", icon: "command", title: "macOS", sub: "Apple Silicon · 14.2+", body: macPanel() },
    { key: "windows", id: "cai-windows", icon: "windows", title: "Windows", sub: "10 / 11 · 64-bit", body: winPanel() },
  ],
})}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Thông tin nhanh", title: "Dùng thử và giá", center: true })}
<div class="reveal">${facts([
  ["Phiên bản hiện tại", RELEASE.vi],
  ["Trạng thái", "Đã phát hành. macOS và Windows đều cài bằng một dòng lệnh"],
  ["Dùng thử", "Free 10 ngày, 30 phút mỗi ngày<small>Không cần thẻ, không cần tài khoản</small>"],
  ["Giá sau đó", "Monthly 50.000 ₫ · Yearly 500.000 ₫"],
  ["Model", "Tải một lần, 1,3 hoặc 2,5 GB<small>Sau đó nhận dạng và dịch chạy offline trên máy bạn</small>"],
])}</div>
${callout({ kind: "ok", title: "Chỉ lấy bản cài từ chúng tôi", text: "Chỉ cài AI Translator bằng lệnh trên trang này, hoặc từ liên kết do <strong>support@aitranslator.io.vn</strong> hay website <strong>aitranslator.io.vn</strong> gửi cho bạn. Các bản cài từ nguồn khác có thể là bản giả." })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Yêu cầu máy", title: "Máy của bạn có chạy được không?", center: true })}
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col"></th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">Hệ điều hành</th><td>macOS 14.2 trở lên</td><td>Windows 10 hoặc 11, 64-bit (x64)</td></tr>
<tr><th scope="row">Chip</th><td>Apple Silicon (M1 trở lên). Chưa có bản cho Mac Intel</td><td>CPU có AVX2. Chưa hỗ trợ Windows ARM64</td></tr>
<tr><th scope="row">RAM</th><td>Tối thiểu 8 GB, khuyến nghị 16 GB</td><td>Tối thiểu 8 GB, khuyến nghị 16 GB</td></tr>
<tr><th scope="row">Đồ họa</th><td>GPU Apple</td><td>Khuyến nghị card đồ họa rời, VRAM từ 6 GB cho gói model Chuẩn; không có thì chạy bằng CPU</td></tr>
<tr><th scope="row">Ổ đĩa</th><td>1,3 GB (gói model Nhẹ) hoặc 2,5 GB (gói model Chuẩn), cộng 1 GB trống khi tải</td><td>Tương tự</td></tr>
<tr><th scope="row">Bộ cài</th><td>File .dmg khoảng 9 MB (lệnh cài tự tải)</td><td>File .exe khoảng 22 MB, cài cho riêng tài khoản của bạn, không cần quyền quản trị</td></tr>
<tr><th scope="row">Ký mã</th><td>Ký ad-hoc, chưa notarize: cài bằng lệnh thì mở thẳng; tải .dmg bằng trình duyệt thì lần mở đầu cần bấm Open Anyway</td><td>Chưa ký mã: cài bằng lệnh thì SmartScreen không hỏi; file .exe tải bằng trình duyệt có thể bị cảnh báo; Smart App Control chế độ chặn sẽ chặn</td></tr>
<tr><th scope="row">Quyền</th><td>Ghi âm thanh hệ thống (không dùng micro)</td><td>Không cần cấp quyền ghi âm</td></tr>
</tbody></table></div>
<p class="small muted">Máy dưới 8 GB RAM hoặc (Windows) CPU không có AVX2: app báo lý do và không cho tải model. Mac Intel không chạy được app.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Về việc cài đặt" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "Sẵn sàng thử trên cuộc họp tiếp theo?", text: "Một dòng lệnh trên Mac hoặc Windows. Dùng thử Free 10 ngày, không cần thẻ.", primary: { href: "#cai-dat", label: "Chọn hệ điều hành và cài" }, secondary: { href: "/huong-dan/bat-dau-nhanh/", label: "Xem hướng dẫn bắt đầu nhanh" } })}
`,
};
void feature;
void sectionHead;
void steps;
