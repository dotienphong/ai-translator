import { pageHero, sectionHead, steps, callout, facts, ctaBand, feature, icon, faq } from "../../build/components.mjs";
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

const DL_FAQ = [
  {
    q: "Vì sao chưa có nút tải trực tiếp?",
    a: "<p>AI Translator đang ở giai đoạn beta và chúng tôi muốn gửi bản cài cho từng người dùng thử, kèm hướng dẫn và mã kiểm tra SHA-256, để nghe phản hồi trước khi mở tải công khai.</p>",
  },
  {
    q: "Vì sao macOS chặn app lần đầu mở?",
    a: "<p>Bản macOS hiện được ký ad-hoc và chưa được Apple notarize (chúng tôi chưa có Apple Developer ID). Vì vậy Gatekeeper chặn lần mở đầu và bạn cần chọn Open Anyway trong System Settings › Privacy &amp; Security. Khi có Developer ID, bước này sẽ biến mất. <a href=\"/huong-dan/cai-dat-macos/\">Xem hướng dẫn từng bước</a>.</p>",
  },
  {
    q: "Vì sao Windows cảnh báo khi tôi mở bộ cài?",
    a: "<p>Bản Windows hiện chưa được ký mã vì chúng tôi chưa có chứng thư ký mã Windows. Vì vậy Microsoft Defender SmartScreen có thể hiện màn hình “Windows protected your PC”. Nếu file đúng nguồn và mã SHA-256 khớp, bấm More info rồi Run anyway. Khi có chứng thư ký mã, cảnh báo sẽ giảm dần; SmartScreen cần thời gian để ghi nhận uy tín của một file mới nên chúng tôi không hứa nó biến mất ngay. <a href=\"/huong-dan/cai-dat-windows/\">Xem hướng dẫn từng bước</a>.</p>",
  },
  {
    q: "Máy Mac Intel có dùng được không?",
    a: "<p>Chưa. AI Translator cần Mac dùng chip Apple Silicon (M1 trở lên) và macOS 14.2 trở lên.</p>",
  },
  {
    q: "Máy Windows nào dùng được?",
    a: "<p>Windows 10 hoặc 11 bản 64-bit (x64), CPU có AVX2, RAM tối thiểu 8 GB. Chưa hỗ trợ Windows ARM64. Máy không có AVX2 hoặc dưới 8 GB RAM: app báo lý do và không cho tải model. Chúng tôi chưa đo độ trễ trên Windows nên chưa cam kết con số nào.</p>",
  },
  {
    q: "Bản beta có tự cập nhật không?",
    a: "<p>Có kênh cập nhật <em>Ổn định</em> và <em>Beta</em> trong Cài đặt › Chung. Bản cài thử gửi qua email ban đầu có thể chưa tự cập nhật; chúng tôi sẽ nói rõ khi gửi bản cài.</p>",
  },
];

export default {
  id: "download",
  lang: "vi",
  path: "/tai-xuong/",
  title: "Nhận bản beta AI Translator cho macOS và Windows",
  description:
    "Đăng ký nhận bản beta AI Translator cho macOS 14.2+ (Apple Silicon) và Windows 10/11 x64. Dùng thử Free 10 ngày. Yêu cầu máy và cách mở app lần đầu.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: f.a.replace(/<[^>]+>/g, "") })))],
  llm: "Cách nhận bản beta cho macOS và Windows qua email (chưa có tải công khai), yêu cầu máy, cách mở app lần đầu: Open Anyway trên macOS vì bản ký ad-hoc, More info › Run anyway nếu SmartScreen cảnh báo trên Windows vì bản chưa ký mã.",
  llmTitle: "Nhận bản beta AI Translator",
  body: () => `
${pageHero({ crumbs, title: "Nhận bản beta AI Translator cho macOS và Windows", lead: "Chúng tôi đang gửi bản beta cho macOS và Windows tới từng người dùng thử. Gửi cho chúng tôi một email ngắn, chúng tôi trả lời kèm bản cài, hướng dẫn và mã kiểm tra SHA-256." })}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["Trạng thái", "Beta cho macOS và Windows, chưa có tải công khai"],
  ["Phiên bản", "0.1.0-beta<small>Số phiên bản chính xác ghi trong email gửi bản cài</small>"],
  ["macOS", "14.2 trở lên, Apple Silicon (M1+)<small>Bộ cài .dmg khoảng 9 MB; model tải thêm 1,3 hoặc 2,5 GB</small>"],
  ["Windows", "Windows 10/11 64-bit (x64), CPU có AVX2<small>Bộ cài .exe dưới 60 MB; model tải thêm 1,3 hoặc 2,5 GB</small>"],
  ["Dùng thử", "Free 10 ngày, 30 phút mỗi ngày<small>Không cần thẻ, không cần tài khoản</small>"],
  ["Giá sau đó", "Monthly 50.000 ₫ · Yearly 500.000 ₫"],
])}</div>
<div class="row center center-text reveal"><a class="btn btn-primary btn-lg" href="${MAILTO_MAC}">${icon("mail")} Đăng ký bản macOS</a> <a class="btn btn-primary btn-lg" href="${MAILTO_WIN}">${icon("mail")} Đăng ký bản Windows</a></div>
<p class="disclaimer">Mỗi nút mở ứng dụng email của bạn với nội dung có sẵn cho hệ điều hành tương ứng. Nếu không mở được, hãy gửi thư thủ công tới <strong>support@aitranslator.io.vn</strong> và ghi rõ bạn dùng macOS hay Windows.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Các bước", title: "Từ email đăng ký tới phụ đề đầu tiên", center: true })}
${steps([
  { title: "Gửi email đăng ký", text: "Cho chúng tôi biết máy của bạn (dòng máy, chip hoặc CPU, phiên bản macOS hoặc Windows, RAM) và bạn định dùng với app họp nào." },
  { title: "Nhận bản cài và mã SHA-256", text: "Chúng tôi gửi liên kết tải file .dmg (macOS) hoặc .exe (Windows), kèm mã SHA-256 để bạn kiểm tra file không bị thay đổi." },
  { title: "Cài và mở lần đầu", text: "macOS: kéo app vào Applications, cho phép mở trong System Settings, cấp quyền ghi âm thanh hệ thống. Windows: chạy bộ cài, bấm More info › Run anyway nếu SmartScreen cảnh báo; không cần cấp quyền ghi âm. Chúng tôi có hướng dẫn từng bước." },
  { title: "Tải model và bắt đầu dịch", text: "App tải model một lần (1,3 hoặc 2,5 GB), cho bạn nghe thử một câu mẫu, rồi sẵn sàng dịch cuộc họp." },
])}
<div class="row center center-text reveal"><a class="btn btn-secondary" href="/huong-dan/cai-dat-macos/">Hướng dẫn cài đặt trên macOS ${icon("arrow-right")}</a> <a class="btn btn-secondary" href="/huong-dan/cai-dat-windows/">Hướng dẫn cài đặt trên Windows ${icon("arrow-right")}</a></div>
</div></section>

<section class="section"><div class="container narrow">
${callout({ kind: "warn", title: "macOS sẽ chặn app ở lần mở đầu: đó là bình thường", text: "Bản beta hiện được ký ad-hoc và chưa được Apple notarize (chúng tôi chưa mua Apple Developer ID). Lần mở đầu macOS báo không xác minh được nhà phát triển. Bạn mở <strong>System Settings › Privacy &amp; Security</strong>, kéo xuống cuối và bấm <strong>Open Anyway</strong> cạnh tên AI Translator. Mỗi lần cập nhật sang bản mới, macOS cũng hỏi lại 5 hộp thoại Keychain và 1 hộp thoại quyền ghi âm; app báo trước điều này khi mời cập nhật. Việc này sẽ hết khi chúng tôi có Developer ID." })}
${callout({ kind: "warn", title: "Windows có thể cảnh báo khi mở bộ cài: đó là bình thường", text: "Bản Windows chưa được ký mã (chúng tôi chưa mua chứng thư ký mã Windows). Khi mở bộ cài, Microsoft Defender SmartScreen có thể hiện màn hình xanh “Windows protected your PC”. Bấm <strong>More info</strong>, kiểm dòng App là đúng tên file cài, rồi bấm <strong>Run anyway</strong>. Trình duyệt cũng có thể cảnh báo file ít người tải. Bộ cài không cần quyền quản trị. Khi có chứng thư ký mã, cảnh báo sẽ giảm dần. <a href=\"/huong-dan/cai-dat-windows/\">Xem hướng dẫn cài đặt trên Windows</a>." })}
${callout({ kind: "ok", title: "Chỉ lấy bản cài từ chúng tôi", text: "Chỉ tải AI Translator từ liên kết do <strong>support@aitranslator.io.vn</strong> hoặc website <strong>aitranslator.io.vn</strong> gửi cho bạn, và luôn đối chiếu mã SHA-256. Các bản cài từ nguồn khác có thể là bản giả." })}
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
<tr><th scope="row">Bộ cài</th><td>File .dmg khoảng 9 MB</td><td>File .exe dưới 60 MB, cài cho riêng tài khoản của bạn, không cần quyền quản trị</td></tr>
<tr><th scope="row">Ký mã</th><td>Ký ad-hoc, chưa notarize: lần mở đầu cần bấm Open Anyway</td><td>Chưa ký mã: SmartScreen có thể cảnh báo khi mở bộ cài</td></tr>
<tr><th scope="row">Quyền</th><td>Ghi âm thanh hệ thống (không dùng micro)</td><td>Không cần cấp quyền ghi âm</td></tr>
</tbody></table></div>
<p class="small muted">Máy dưới 8 GB RAM hoặc (Windows) CPU không có AVX2: app báo lý do và không cho tải model. Mac Intel không chạy được app.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Về bản beta và việc cài đặt" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "Cho chúng tôi biết bạn cần gì", text: "Một email ngắn là đủ. Chúng tôi sẽ trả lời bạn qua email.", primary: { href: MAILTO_MAC, label: "Đăng ký bản macOS" }, secondary: { href: MAILTO_WIN, label: "Đăng ký bản Windows" } })}
`,
};
void feature;
