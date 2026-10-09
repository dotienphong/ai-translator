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
    q: "Vì sao Windows cảnh báo khi tôi mở bộ cài?",
    a: "<p>Bản Windows hiện chưa được ký mã vì chúng tôi chưa có chứng thư ký mã Windows. Vì vậy Microsoft Defender SmartScreen có thể hiện màn hình “Windows protected your PC”. Nếu file đúng nguồn và mã SHA-256 khớp, bấm More info rồi Run anyway. Khi có chứng thư ký mã, cảnh báo sẽ giảm dần; SmartScreen cần thời gian để ghi nhận uy tín của một file mới nên chúng tôi không hứa nó biến mất ngay. <a href=\"/huong-dan/cai-dat-windows/\">Xem hướng dẫn từng bước</a>.</p>",
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
    a: "<p>Có kênh cập nhật <em>Ổn định</em> và <em>Beta</em> trong Cài đặt › Chung. App kiểm tra bản mới khi khởi động và mỗi 24 giờ. Bản Windows gửi qua email ban đầu có thể chưa tự cập nhật; chúng tôi sẽ nói rõ khi gửi bản cài.</p>",
  },
];

export default {
  id: "download",
  lang: "vi",
  path: "/tai-xuong/",
  title: "Tải AI Translator beta: macOS bằng một dòng lệnh",
  description:
    "Cài AI Translator beta trên macOS 14.2+ (Apple Silicon) bằng một dòng lệnh Terminal, mở thẳng không cần Open Anyway. Windows nhận qua email. Dùng thử Free 10 ngày.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-09",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: f.a.replace(/<[^>]+>/g, "") })))],
  llm: "Cài AI Translator beta trên macOS bằng một dòng lệnh Terminal (curl ... install.sh | bash): tải bản cài, kiểm SHA-256 rồi mở app, không cần Open Anyway. Windows nhận bản cài qua email, More info › Run anyway nếu SmartScreen cảnh báo vì bản chưa ký mã. Yêu cầu máy.",
  llmTitle: "Tải AI Translator beta",
  body: () => `
${pageHero({ crumbs, title: "Tải AI Translator beta cho macOS và Windows", lead: "Trên macOS, bạn dán một dòng lệnh vào Terminal: app được tải, kiểm tra và mở lên ngay, không phải vào System Settings bấm Open Anyway. Bản Windows hiện nhận qua email." })}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["Trạng thái", "Beta. macOS cài bằng một dòng lệnh; Windows nhận bản cài qua email"],
  ["Phiên bản", "0.1.0 (beta)<small>Lệnh cài luôn lấy bản mới nhất của kênh</small>"],
  ["macOS", "14.2 trở lên, Apple Silicon (M1+)<small>Bộ cài .dmg khoảng 9 MB; model tải thêm 1,3 hoặc 2,5 GB</small>"],
  ["Windows", "Windows 10/11 64-bit (x64), CPU có AVX2<small>Bộ cài .exe dưới 60 MB; model tải thêm 1,3 hoặc 2,5 GB</small>"],
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
</div></section>

<section class="section" id="cai-windows"><div class="container narrow">
${sectionHead({ eyebrow: "Windows", title: "Bản Windows: nhận bản cài qua email", text: "Chúng tôi đang gửi bản beta Windows tới từng người dùng thử, kèm hướng dẫn và mã kiểm tra SHA-256." })}
${steps([
  { title: "Gửi email đăng ký", text: "Cho chúng tôi biết máy của bạn (dòng máy, CPU, phiên bản Windows, RAM) và bạn định dùng với app họp nào." },
  { title: "Nhận bộ cài và mã SHA-256", text: "Chúng tôi gửi liên kết tải file .exe kèm mã SHA-256 để bạn kiểm tra file không bị thay đổi." },
  { title: "Cài và mở", text: "Chạy bộ cài; bấm More info › Run anyway nếu SmartScreen cảnh báo. Không cần cấp quyền ghi âm. App tải model một lần rồi sẵn sàng dịch." },
])}
<div class="row center center-text reveal"><a class="btn btn-primary btn-lg" href="${MAILTO_WIN}">${icon("mail")} Đăng ký bản Windows</a> <a class="btn btn-secondary" href="/huong-dan/cai-dat-windows/">Hướng dẫn cài đặt trên Windows ${icon("arrow-right")}</a></div>
<p class="disclaimer">Nút mở ứng dụng email của bạn với nội dung có sẵn. Nếu không mở được, hãy gửi thư thủ công tới <strong>support@aitranslator.io.vn</strong>. Muốn nhận file .dmg macOS qua email thay vì dùng lệnh? <a href="${MAILTO_MAC}">Gửi email đăng ký</a>; file .dmg tải bằng trình duyệt cần bước Open Anyway ở lần mở đầu.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${callout({ kind: "warn", title: "Nếu bạn tải file .dmg bằng trình duyệt, macOS sẽ chặn ở lần mở đầu", text: "Lúc đó bạn mở <strong>System Settings › Privacy &amp; Security</strong>, kéo xuống cuối và bấm <strong>Open Anyway</strong> cạnh tên AI Translator. Cách đơn giản hơn: chạy lệnh cài ở trên. Mỗi lần cập nhật sang bản mới, macOS cũng hỏi lại 5 hộp thoại Keychain và 1 hộp thoại quyền ghi âm; app báo trước điều này khi mời cập nhật. Việc này sẽ hết khi chúng tôi có Developer ID." })}
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
<tr><th scope="row">Bộ cài</th><td>File .dmg khoảng 9 MB (lệnh cài tự tải)</td><td>File .exe dưới 60 MB, cài cho riêng tài khoản của bạn, không cần quyền quản trị</td></tr>
<tr><th scope="row">Ký mã</th><td>Ký ad-hoc, chưa notarize: cài bằng lệnh thì mở thẳng; tải .dmg bằng trình duyệt thì lần mở đầu cần bấm Open Anyway</td><td>Chưa ký mã: SmartScreen có thể cảnh báo khi mở bộ cài</td></tr>
<tr><th scope="row">Quyền</th><td>Ghi âm thanh hệ thống (không dùng micro)</td><td>Không cần cấp quyền ghi âm</td></tr>
</tbody></table></div>
<p class="small muted">Máy dưới 8 GB RAM hoặc (Windows) CPU không có AVX2: app báo lý do và không cho tải model. Mac Intel không chạy được app.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Về bản beta và việc cài đặt" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "Cài AI Translator trên Mac ngay bây giờ", text: "Một dòng lệnh trong Terminal. Dùng thử Free 10 ngày, không cần thẻ.", primary: { href: "#cai-macos", label: "Xem lệnh cài macOS" }, secondary: { href: MAILTO_WIN, label: "Đăng ký bản Windows" } })}
`,
};
void feature;
