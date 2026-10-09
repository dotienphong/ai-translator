import { pageHero, sectionHead, steps, callout, facts, ctaBand, feature, icon, faq, cmdBlock } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Tải xuống", path: "/tai-xuong/" },
];

const mailto = (subject, body) =>
  `mailto:support@aitranslator.io.vn?subject=${encodeURIComponent(subject)}&amp;body=${encodeURIComponent(body.join("\n"))}`;

const MAILTO_MAC = mailto("Đăng ký bản beta AI Translator (macOS)", [
  "Xin chào AI Translator,",
  "",
  "Tôi muốn nhận bản beta cho macOS.",
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

const MAILTO_WIN = mailto("Đăng ký bản beta AI Translator (Windows)", [
  "Xin chào AI Translator,",
  "",
  "Tôi muốn nhận bản beta cho Windows.",
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
const WIN_CMD = "irm https://aitranslator.io.vn/install.ps1 | iex";
const WIN_CMD_BETA = "& ([scriptblock]::Create((irm https://aitranslator.io.vn/install.ps1))) -Beta";
const WIN_CMD_REVIEW = "$s = irm https://aitranslator.io.vn/install.ps1; $s | more; iex $s";
const INSTALL_CMD_REVIEW = "curl -fsSL https://aitranslator.io.vn/install.sh -o install.sh && less install.sh && bash install.sh";

const DL_FAQ = [
  {
    q: "Lệnh một dòng làm gì, và có an toàn không?",
    a: "<p>Lệnh tải một script nhỏ từ <strong>aitranslator.io.vn</strong>. Script kiểm máy (macOS 14.2 trở lên, Apple Silicon), đọc số phiên bản mới nhất, tải file .dmg và mã SHA-256 từ <strong>releases.aitranslator.io.vn</strong>, đối chiếu mã, kiểm chữ ký còn nguyên của app, chép vào Applications rồi mở app. Script không dùng sudo, không đổi cài đặt nào của máy và không gửi dữ liệu đi.</p><p>Chạy một lệnh dán từ internet luôn cần tin nguồn của nó. Nếu bạn muốn đọc script trước khi chạy, dùng lệnh ở mục “Muốn đọc script trước khi chạy?” bên trên. Mã SHA-256 nằm cùng máy chủ với file nên chủ yếu bảo vệ bạn khỏi file tải lỗi, không thay được việc tin nguồn.</p>",
  },
  {
    q: "Vì sao không có nút tải file .dmg, và vì sao lệnh này không bị macOS chặn?",
    a: "<p>Bản macOS được ký ad-hoc và chưa được Apple notarize (chúng tôi chưa có Apple Developer ID). File .dmg tải bằng trình duyệt bị macOS gắn nhãn “tải từ internet” và Gatekeeper chặn lần mở đầu, bạn phải vào System Settings › Privacy &amp; Security bấm Open Anyway. File tải bằng lệnh <code>curl</code> trong Terminal không bị gắn nhãn đó, nên app mở thẳng. Khi có Developer ID, chúng tôi sẽ thêm nút tải .dmg trực tiếp.</p>",
  },
  {
    q: "Tôi đã tải file .dmg bằng trình duyệt thì sao?",
    a: "<p>Mở app lần đầu sẽ bị chặn. Cách nhanh nhất là chạy lệnh cài ở trên: nó cài bản mới nhất đè lên và app mở thẳng. Hoặc làm theo <a href=\"/huong-dan/cai-dat-macos/\">hướng dẫn cài đặt trên macOS</a> (Open Anyway).</p>",
  },
  {
    q: "Cập nhật và gỡ cài đặt thế nào?",
    a: "<p>App tự kiểm tra bản mới (Cài đặt › Chung). Bạn cũng có thể chạy lại đúng lệnh cài bất cứ lúc nào để cài bản mới nhất; script đóng app đang chạy rồi thay bản cũ. Gỡ cài đặt: xóa model và dữ liệu trong app trước rồi kéo app vào Thùng rác, xem <a href=\"/huong-dan/cai-dat-macos/#go-cai-dat\">hướng dẫn gỡ cài đặt</a>.</p>",
  },
  {
    q: "Lệnh PowerShell làm gì, và vì sao Windows không cảnh báo?",
    a: "<p>Lệnh tải một script từ <strong>aitranslator.io.vn</strong>. Script kiểm máy (Windows 10 hoặc 11, x64), đọc số phiên bản mới nhất, tải bộ cài .exe và mã SHA-256 từ <strong>releases.aitranslator.io.vn</strong>, đối chiếu mã, chạy bộ cài im lặng (cài cho riêng tài khoản của bạn, không cần quyền quản trị) rồi mở app. Script không gửi dữ liệu đi. Mã SHA-256 nằm cùng máy chủ với file nên chủ yếu chống file hỏng, bạn vẫn đang tin nguồn <strong>aitranslator.io.vn</strong>.</p><p>Bản Windows chưa được ký mã (chúng tôi chưa có chứng thư ký mã Windows). SmartScreen chỉ kiểm file mang dấu “tải từ internet”; file tải bằng PowerShell không có dấu đó nên bộ cài chạy thẳng.</p>",
  },
  {
    q: "Tôi đã tải file .exe bằng trình duyệt thì sao?",
    a: "<p>Windows Defender SmartScreen có thể hiện màn hình “Windows protected your PC”. Nếu file đúng nguồn và mã SHA-256 khớp, bấm More info rồi Run anyway. Hoặc chạy lệnh cài ở trên: nó cài bản mới nhất mà không qua SmartScreen. <a href=\"/huong-dan/cai-dat-windows/\">Xem hướng dẫn từng bước</a>.</p>",
  },
  {
    q: "Windows 11 báo ứng dụng bị chặn và không có nút bỏ qua. Làm sao?",
    a: "<p>Đó là <strong>Smart App Control</strong>. Ở chế độ chặn, nó không cho chạy ứng dụng chưa ký mã và chưa có uy tín, dù cài bằng cách nào. Bạn có thể tắt nó trong Windows Security › App &amp; browser control › Smart App Control settings. Khi chúng tôi có chứng thư ký mã Windows, vấn đề này sẽ hết. <a href=\"/huong-dan/cai-dat-windows/#smart-app-control\">Xem chi tiết</a>.</p>",
  },
  {
    q: "Máy Mac Intel có dùng được không?",
    a: "<p>Chưa. AI Translator cần Mac dùng chip Apple Silicon (M1 trở lên) và macOS 14.2 trở lên. Lệnh cài sẽ dừng và báo lý do nếu máy không đạt.</p>",
  },
  {
    q: "Máy Windows nào dùng được?",
    a: "<p>Windows 10 hoặc 11 bản 64-bit (x64), CPU có AVX2, RAM tối thiểu 8 GB. Chưa hỗ trợ Windows ARM64. Máy không có AVX2 hoặc dưới 8 GB RAM: app báo lý do và không cho tải model. Chúng tôi chưa đo độ trễ trên Windows nên chưa cam kết con số nào.</p>",
  },
  {
    q: "Bản beta có tự cập nhật không?",
    a: "<p>Có kênh cập nhật <em>Ổn định</em> và <em>Beta</em> trong Cài đặt › Chung. App kiểm tra bản mới khi khởi động và mỗi 24 giờ. Bản Windows cũng nhận kênh Ổn định và Beta; bạn cũng có thể chạy lại lệnh cài để cập nhật.</p>",
  },
];

export default {
  id: "download",
  lang: "vi",
  path: "/tai-xuong/",
  title: "Tải AI Translator beta: cài macOS và Windows bằng một dòng lệnh",
  description:
    "Cài AI Translator beta trên macOS 14.2+ (Apple Silicon) bằng một dòng lệnh Terminal, mở thẳng không cần Open Anyway. Windows bằng PowerShell. Dùng thử Free 10 ngày.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-09",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: f.a.replace(/<[^>]+>/g, "") })))],
  llm: "Cài AI Translator beta trên macOS bằng một dòng lệnh Terminal (curl ... install.sh | bash): tải bản cài, kiểm SHA-256 rồi mở app, không cần Open Anyway. Windows cài bằng một dòng lệnh PowerShell (irm ... install.ps1 | iex); file .exe tải bằng trình duyệt có thể bị SmartScreen cảnh báo vì bản chưa ký mã, Smart App Control có thể chặn. Yêu cầu máy.",
  llmTitle: "Tải AI Translator beta",
  body: () => `
${pageHero({ crumbs, title: "Tải AI Translator beta cho macOS và Windows", lead: "Trên macOS bạn dán một dòng lệnh vào Terminal, trên Windows vào PowerShell: app được tải, kiểm tra và mở lên ngay, không phải vào System Settings bấm Open Anyway hay qua màn hình SmartScreen." })}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["Trạng thái", "Beta. macOS và Windows đều cài bằng một dòng lệnh"],
  ["Phiên bản", "0.1.0 (beta)<small>Lệnh cài luôn lấy bản mới nhất của kênh</small>"],
  ["macOS", "14.2 trở lên, Apple Silicon (M1+)<small>Bộ cài .dmg khoảng 9 MB; model tải thêm 1,3 hoặc 2,5 GB</small>"],
  ["Windows", "Windows 10/11 64-bit (x64), CPU có AVX2<small>Bộ cài .exe khoảng 22 MB; model tải thêm 1,3 hoặc 2,5 GB</small>"],
  ["Dùng thử", "Free 10 ngày, 30 phút mỗi ngày<small>Không cần thẻ, không cần tài khoản</small>"],
  ["Giá sau đó", "Monthly 50.000 ₫ · Yearly 500.000 ₫"],
])}</div>
</div></section>

<section class="section section-alt" id="cai-macos"><div class="container narrow">
${sectionHead({ eyebrow: "macOS", title: "Cài trên macOS bằng một dòng lệnh", text: "Cách nhanh nhất để cài AI Translator trên Mac Apple Silicon. Mất khoảng một phút, tùy tốc độ mạng." })}
${cmdBlock({ cmd: INSTALL_CMD, copy: "Sao chép lệnh", copied: "Đã chép", label: "Lệnh cài AI Translator trên macOS" })}
${steps([
  { title: "Mở Terminal", text: "Nhấn <kbd>⌘</kbd> + <kbd>Space</kbd>, gõ <strong>Terminal</strong> rồi nhấn Enter." },
  { title: "Dán lệnh ở trên và nhấn Enter", text: "Bấm nút Sao chép lệnh rồi dán vào Terminal (<kbd>⌘</kbd> + <kbd>V</kbd>). Không cần nhập mật khẩu." },
  { title: "Chờ app mở", text: "Lệnh tải bản mới nhất, kiểm mã SHA-256, chép AI Translator vào thư mục Applications rồi mở app. macOS sẽ hỏi quyền ghi âm thanh hệ thống: chọn cho phép." },
])}
<p class="small muted">Lệnh này không dùng sudo và không cần mật khẩu. Nếu thư mục Applications không cho ghi, app được cài vào <code>~/Applications</code>. Chạy lại đúng lệnh này bất cứ lúc nào để cài bản mới nhất.</p>
${callout({ kind: "ok", title: "Vì sao không cần bấm Open Anyway?", text: "Bản macOS chưa được Apple notarize (chúng tôi chưa có Apple Developer ID), nên macOS chặn file .dmg tải bằng trình duyệt ở lần mở đầu. File tải bằng lệnh trong Terminal không bị macOS gắn nhãn “tải từ internet”, nên app mở thẳng. Cái giá của lệnh này là bạn phải tin nguồn của nó: xem phần dưới." })}

<h3>Muốn đọc script trước khi chạy?</h3>
<p>Script nằm ở <a href="/install.sh">aitranslator.io.vn/install.sh</a> (khoảng 200 dòng, có chú thích). Lệnh sau tải về, cho bạn đọc, rồi mới chạy:</p>
${cmdBlock({ cmd: INSTALL_CMD_REVIEW, copy: "Sao chép lệnh", copied: "Đã chép", label: "Lệnh tải script về đọc trước khi chạy" })}
<h3>Kênh beta</h3>
<p>Mặc định lệnh cài bản ổn định. Muốn nhận bản beta mới hơn (nếu có), thêm <code>-s -- --beta</code> sau <code>bash</code>:</p>
${cmdBlock({ cmd: INSTALL_CMD_BETA, copy: "Sao chép lệnh", copied: "Đã chép", label: "Lệnh cài kênh beta" })}
<div class="row center center-text reveal"><a class="btn btn-secondary" href="/huong-dan/cai-dat-macos/">Hướng dẫn cài đặt trên macOS ${icon("arrow-right")}</a> <a class="btn btn-secondary" href="/huong-dan/bat-dau-nhanh/">Bắt đầu nhanh ${icon("arrow-right")}</a></div>
<p class="disclaimer">Muốn nhận file .dmg macOS qua email thay vì dùng lệnh? <a href="${MAILTO_MAC}">Gửi email đăng ký</a>; file .dmg tải bằng trình duyệt cần bước Open Anyway ở lần mở đầu.</p>
</div></section>

<section class="section" id="cai-windows"><div class="container narrow">
${sectionHead({ eyebrow: "Windows", title: "Cài trên Windows bằng một dòng lệnh", text: "Dán một dòng vào PowerShell: bộ cài được tải, kiểm tra, cài cho riêng tài khoản của bạn (không cần quyền quản trị) rồi app mở lên." })}
${cmdBlock({ cmd: WIN_CMD, copy: "Sao chép lệnh", copied: "Đã chép", label: "Lệnh cài AI Translator trên Windows" })}
${steps([
  { title: "Mở PowerShell", text: "Nhấn phím <kbd>Windows</kbd>, gõ <strong>PowerShell</strong> rồi nhấn Enter. Không cần chạy bằng quyền quản trị." },
  { title: "Dán lệnh ở trên và nhấn Enter", text: "Bấm Sao chép lệnh rồi dán vào PowerShell (nhấn chuột phải hoặc <kbd>Ctrl</kbd> + <kbd>V</kbd>)." },
  { title: "Chờ app mở", text: "Lệnh tải bản mới nhất, kiểm mã SHA-256, chạy bộ cài im lặng rồi mở AI Translator. Windows không hỏi quyền ghi âm; app tải model một lần rồi sẵn sàng dịch." },
])}
<p class="small muted">Lệnh không dùng quyền quản trị. Chạy lại đúng lệnh này bất cứ lúc nào để cập nhật lên bản mới nhất (bộ cài đóng app đang chạy rồi thay bản cũ). Cần Windows 10 hoặc 11 bản 64-bit (x64).</p>
<p class="small muted"><strong>Lệnh cài Windows còn mới</strong> và chúng tôi mới thử trên ít máy. Nếu gặp lỗi, hãy gửi cho chúng tôi nội dung thông báo ở <a href="/lien-he/">trang Liên hệ</a> hoặc nhận file .exe qua email (xem cuối mục này).</p>
${callout({ kind: "ok", title: "Vì sao không bị SmartScreen cảnh báo?", text: "Bản Windows chưa được ký mã (chúng tôi chưa mua chứng thư ký mã Windows). SmartScreen chỉ kiểm file mang dấu “tải từ internet”, loại dấu mà trình duyệt gắn khi bạn tải file. File tải bằng PowerShell không có dấu đó, nên bộ cài chạy thẳng. Bạn vẫn phải tin nguồn của lệnh: xem phần dưới." })}
${callout({ kind: "warn", title: "Máy bật Smart App Control vẫn có thể chặn", text: "Windows 11 có tính năng <strong>Smart App Control</strong>. Khi nó ở chế độ chặn, nó chặn mọi ứng dụng chưa ký mã và chưa có uy tín, dù cài bằng cách nào, và không có nút bỏ qua. Nếu bạn gặp trường hợp này, bạn cần tắt Smart App Control trong Windows Security › App &amp; browser control › Smart App Control settings, hoặc chờ khi chúng tôi có chứng thư ký mã. <a href=\"/huong-dan/cai-dat-windows/#smart-app-control\">Xem chi tiết</a>." })}

<h3>Muốn đọc script trước khi chạy?</h3>
<p>Script nằm ở <a href="/install.ps1">aitranslator.io.vn/install.ps1</a> (có chú thích). Lệnh sau in script ra để bạn đọc rồi mới chạy:</p>
${cmdBlock({ cmd: WIN_CMD_REVIEW, copy: "Sao chép lệnh", copied: "Đã chép", label: "Lệnh in script ra đọc trước khi chạy" })}
<h3>Kênh beta</h3>
<p>Mặc định lệnh cài bản ổn định. Muốn nhận bản beta mới hơn (nếu có), dùng lệnh sau:</p>
${cmdBlock({ cmd: WIN_CMD_BETA, copy: "Sao chép lệnh", copied: "Đã chép", label: "Lệnh cài kênh beta trên Windows" })}
<div class="row center center-text reveal"><a class="btn btn-secondary" href="/huong-dan/cai-dat-windows/">Hướng dẫn cài đặt trên Windows ${icon("arrow-right")}</a></div>
<p class="disclaimer">Muốn nhận file .exe qua email thay vì dùng lệnh? <a href="${MAILTO_WIN}">Gửi email đăng ký</a>. File .exe tải bằng trình duyệt có thể bị SmartScreen cảnh báo: bấm More info › Run anyway.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${callout({ kind: "warn", title: "Nếu bạn tải file .dmg bằng trình duyệt, macOS sẽ chặn ở lần mở đầu", text: "Lúc đó bạn mở <strong>System Settings › Privacy &amp; Security</strong>, kéo xuống cuối và bấm <strong>Open Anyway</strong> cạnh tên AI Translator. Cách đơn giản hơn: chạy lệnh cài ở trên. Mỗi lần cập nhật sang bản mới, macOS cũng hỏi lại 1 hộp thoại Keychain (mật khẩu đăng nhập) và có thể hỏi lại quyền ghi âm; app báo trước điều này khi mời cập nhật. Việc này sẽ hết khi chúng tôi có Developer ID." })}
${callout({ kind: "warn", title: "Windows có thể cảnh báo khi mở bộ cài: đó là bình thường", text: "Bản Windows chưa được ký mã (chúng tôi chưa mua chứng thư ký mã Windows). Khi mở bộ cài, Microsoft Defender SmartScreen có thể hiện màn hình xanh “Windows protected your PC”. Bấm <strong>More info</strong>, kiểm dòng App là đúng tên file cài, rồi bấm <strong>Run anyway</strong>. Trình duyệt cũng có thể cảnh báo file ít người tải. Bộ cài không cần quyền quản trị. Khi có chứng thư ký mã, cảnh báo sẽ giảm dần. <a href=\"/huong-dan/cai-dat-windows/\">Xem hướng dẫn cài đặt trên Windows</a>." })}
${callout({ kind: "ok", title: "Chỉ lấy bản cài từ chúng tôi", text: "Chỉ cài AI Translator bằng lệnh trên trang này, hoặc từ liên kết do <strong>support@aitranslator.io.vn</strong> hay website <strong>aitranslator.io.vn</strong> gửi cho bạn. Các bản cài từ nguồn khác có thể là bản giả." })}
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Yêu cầu máy", title: "Máy của bạn có chạy được không?", center: true })}
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col"></th><th scope="col">macOS (beta)</th><th scope="col">Windows (beta)</th></tr></thead>
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

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Về bản beta và việc cài đặt" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "Cài AI Translator ngay bây giờ", text: "Một dòng lệnh trên Mac hoặc Windows. Dùng thử Free 10 ngày, không cần thẻ.", primary: { href: "#cai-macos", label: "Lệnh cài macOS" }, secondary: { href: "#cai-windows", label: "Lệnh cài Windows" } })}
`,
};
void feature;
