import { pageHero, sectionHead, steps, callout, facts, ctaBand, feature, icon, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Tải xuống", path: "/tai-xuong/" },
];

const SUBJECT = "Đăng ký bản beta AI Translator (macOS)";
const BODY = [
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
].join("\n");
const MAILTO = `mailto:support@aitranslator.io.vn?subject=${encodeURIComponent(SUBJECT)}&amp;body=${encodeURIComponent(BODY)}`;

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
    q: "Máy Mac Intel có dùng được không?",
    a: "<p>Chưa. AI Translator cần Mac dùng chip Apple Silicon (M1 trở lên) và macOS 14.2 trở lên.</p>",
  },
  {
    q: "Khi nào có bản Windows?",
    a: "<p>Bản Windows 10/11 64-bit đang được hoàn thiện nhưng chưa có ngày phát hành. Bạn có thể ghi chú \"Windows\" trong email đăng ký để được báo khi có bản thử.</p>",
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
  title: "Nhận bản beta AI Translator cho macOS",
  description:
    "Đăng ký nhận bản beta AI Translator cho macOS 14.2+ (Apple Silicon). Dùng thử Free 10 ngày. Yêu cầu máy, hướng dẫn mở app lần đầu và tình trạng bản Windows.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: f.a.replace(/<[^>]+>/g, "") })))],
  llm: "Cách nhận bản beta macOS (chưa có tải công khai), yêu cầu máy, hướng dẫn mở app lần đầu vì bản ký ad-hoc, tình trạng bản Windows.",
  llmTitle: "Nhận bản beta AI Translator",
  body: () => `
${pageHero({ crumbs, title: "Nhận bản beta AI Translator cho macOS", lead: "Chúng tôi đang gửi bản beta cho từng người dùng thử. Gửi cho chúng tôi một email ngắn, chúng tôi trả lời kèm bản cài, hướng dẫn và mã kiểm tra SHA-256." })}

<section class="section-tight"><div class="container narrow">
<div class="reveal">${facts([
  ["Trạng thái", "Beta, chưa có tải công khai"],
  ["Phiên bản", "0.1.0 (beta)"],
  ["macOS", "14.2 trở lên, Apple Silicon (M1+)<small>Bộ cài .dmg khoảng 9 MB; model tải thêm 1,3 hoặc 2,5 GB</small>"],
  ["Windows", "Sắp có<small>Windows 10/11 64-bit, chưa có ngày phát hành</small>"],
  ["Dùng thử", "Free 10 ngày, 30 phút mỗi ngày<small>Không cần thẻ, không cần tài khoản</small>"],
  ["Giá sau đó", "Monthly 50.000 ₫ · Yearly 500.000 ₫"],
])}</div>
<p class="center-text reveal"><a class="btn btn-primary btn-lg" href="${MAILTO}">${icon("mail")} Gửi email đăng ký beta</a></p>
<p class="disclaimer">Nút trên mở ứng dụng email của bạn với nội dung có sẵn. Nếu không mở được, hãy gửi thư thủ công tới <strong>support@aitranslator.io.vn</strong>.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Các bước", title: "Từ email đăng ký tới phụ đề đầu tiên", center: true })}
${steps([
  { title: "Gửi email đăng ký", text: "Cho chúng tôi biết dòng Mac, phiên bản macOS và bạn định dùng với app họp nào." },
  { title: "Nhận bản cài và mã SHA-256", text: "Chúng tôi gửi liên kết tải file .dmg, kèm mã SHA-256 để bạn kiểm tra file không bị thay đổi." },
  { title: "Cài, cho phép mở lần đầu, cấp quyền", text: "Kéo app vào Applications, cho phép mở trong System Settings, cấp quyền ghi âm thanh hệ thống. Chúng tôi có hướng dẫn từng bước." },
  { title: "Tải model và bắt đầu dịch", text: "App tải model một lần (1,3 hoặc 2,5 GB), cho bạn nghe thử một câu mẫu, rồi sẵn sàng dịch cuộc họp." },
])}
<p class="center-text reveal"><a class="btn btn-secondary" href="/huong-dan/cai-dat-macos/">Hướng dẫn cài đặt trên macOS ${icon("arrow-right")}</a></p>
</div></section>

<section class="section"><div class="container narrow">
${callout({ kind: "warn", title: "macOS sẽ chặn app ở lần mở đầu: đó là bình thường", text: "Bản beta hiện được ký ad-hoc và chưa được Apple notarize (chúng tôi chưa mua Apple Developer ID). Lần mở đầu macOS báo không xác minh được nhà phát triển. Bạn mở <strong>System Settings › Privacy &amp; Security</strong>, kéo xuống cuối và bấm <strong>Open Anyway</strong> cạnh tên AI Translator. Mỗi lần cập nhật sang bản mới, macOS cũng hỏi lại 5 hộp thoại Keychain và 1 hộp thoại quyền ghi âm; app báo trước điều này khi mời cập nhật. Việc này sẽ hết khi chúng tôi có Developer ID." })}
${callout({ kind: "ok", title: "Chỉ lấy bản cài từ chúng tôi", text: "Chỉ tải AI Translator từ liên kết do <strong>support@aitranslator.io.vn</strong> hoặc website <strong>aitranslator.io.vn</strong> gửi cho bạn, và luôn đối chiếu mã SHA-256. Các bản cài từ nguồn khác có thể là bản giả." })}
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Yêu cầu máy", title: "Máy của bạn có chạy được không?", center: true })}
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col"></th><th scope="col">macOS (beta)</th><th scope="col">Windows (sắp có)</th></tr></thead>
<tbody>
<tr><th scope="row">Hệ điều hành</th><td>macOS 14.2 trở lên</td><td>Windows 10 hoặc 11, 64-bit (x64)</td></tr>
<tr><th scope="row">Chip</th><td>Apple Silicon (M1 trở lên). Chưa có bản cho Mac Intel</td><td>CPU có AVX2. Chưa hỗ trợ Windows ARM64</td></tr>
<tr><th scope="row">RAM</th><td>Tối thiểu 8 GB, khuyến nghị 16 GB</td><td>Tối thiểu 8 GB, khuyến nghị 16 GB</td></tr>
<tr><th scope="row">Đồ họa</th><td>GPU Apple (Metal)</td><td>Khuyến nghị card rời hỗ trợ Vulkan, VRAM từ 6 GB cho gói Chuẩn; không có thì chạy bằng CPU</td></tr>
<tr><th scope="row">Ổ đĩa</th><td>1,3 GB (gói Nhẹ) hoặc 2,5 GB (gói Chuẩn), cộng 1 GB trống khi tải</td><td>Tương tự</td></tr>
<tr><th scope="row">Quyền</th><td>Ghi âm thanh hệ thống (không dùng micro)</td><td>Không cần cấp quyền thu âm</td></tr>
</tbody></table></div>
<p class="small muted">Máy dưới 8 GB RAM hoặc (Windows) CPU không có AVX2: app báo lý do và không cho tải model. Mac Intel không chạy được app.</p>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Về bản beta và việc cài đặt" })}
${faq(DL_FAQ, { open: true })}
</div></section>

${ctaBand({ title: "Cho chúng tôi biết bạn cần gì", text: "Một email ngắn là đủ. Chúng tôi đọc và trả lời từng thư.", primary: { href: MAILTO, label: "Gửi email đăng ký beta" }, secondary: { href: "/bang-gia/", label: "Xem bảng giá" } })}
`,
};
void feature;
