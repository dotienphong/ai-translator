import { pageHero, sectionHead, checkList, callout, ctaBand, steps, linkCard, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Giải pháp", path: "/giai-phap/" },
  { name: "Dịch live TikTok", path: "/giai-phap/dich-live-tiktok/" },
];

const FAQ = [
  {
    q: "Dịch live TikTok sang tiếng Việt được không?",
    a: `<p>Được, nếu bạn xem TikTok LIVE trên máy tính: mở buổi live trong trình duyệt, bấm Bắt đầu ở AI Translator và đọc phụ đề tiếng Việt trên thanh nổi. App nghe âm thanh phát ra từ máy nên không cần cài gì vào TikTok hay trình duyệt. Chúng tôi đã thử với video phát trong trình duyệt. Chúng tôi chưa thử riêng TikTok LIVE.</p>`,
  },
  {
    q: "Dùng trên điện thoại được không?",
    a: `<p>Không. AI Translator chỉ có bản cho macOS (Apple Silicon) và Windows 10/11, không có trong ứng dụng TikTok hay trên điện thoại. Hãy mở buổi live trên trình duyệt của máy tính.</p>`,
  },
  {
    q: "Có cần cài gì vào TikTok hay trình duyệt không?",
    a: `<p>Không. Không cần tiện ích trình duyệt, plugin hay tài khoản trên nền tảng: app chỉ nghe âm thanh đang phát ra từ máy tính của bạn.</p>`,
  },
  {
    q: "Tôi bán hàng trên TikTok LIVE, dịch cho khách nước ngoài được không?",
    a: `<p>Chưa. Phụ đề chỉ hiện trên màn hình của người dùng app, từ âm thanh phát ra trên máy họ sang ngôn ngữ họ chọn. App không đưa phụ đề hay giọng dịch vào buổi live của bạn.</p>`,
  },
];

export default {
  id: "solutions-tiktok-live",
  lang: "vi",
  path: "/giai-phap/dich-live-tiktok/",
  title: "Dịch live TikTok sang tiếng Việt trên máy tính",
  description:
    "Cách dịch live TikTok sang tiếng Việt bằng phụ đề trực tiếp khi xem trên trình duyệt máy tính. AI Translator không chạy trên điện thoại; xem các bước và giới hạn.",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  llm: "Cách dịch live TikTok sang tiếng Việt bằng phụ đề trực tiếp khi xem TikTok LIVE trên trình duyệt máy tính: bốn bước, mẹo cho live nói nhanh, có nhạc và nhiều người nói, giới hạn thật (không dùng trên điện thoại, không dịch live của người phát) và hỏi đáp.",
  llmTitle: "Dịch live TikTok sang tiếng Việt khi xem trên máy tính",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "Dịch live TikTok sang tiếng Việt khi xem trên máy tính",
  lead: "Muốn đọc phụ đề tiếng Việt khi xem TikTok LIVE bằng ngoại ngữ, bạn mở buổi live trên trình duyệt máy tính rồi dùng AI Translator: app nghe âm thanh phát ra từ máy và hiện bản dịch trên một thanh nổi. App chỉ có bản cho macOS và Windows nên không dùng được trong ứng dụng TikTok trên điện thoại, và chỉ làm phụ đề cho người xem.",
  meta: "<span>Cập nhật {{updated}}</span><span>Chạy trên máy tính macOS và Windows, không chạy trên điện thoại</span>",
})}

<section class="section-tight"><div class="container narrow">
${callout({ kind: "warn", title: "Trước khi thử: chỉ dùng được trên máy tính.", text: "AI Translator không có bản cho điện thoại. Nếu bạn quen xem TikTok LIVE trên điện thoại, hãy mở buổi live đó trên trình duyệt của máy tính để có phụ đề tiếng Việt." })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Bắt đầu", title: "Xem TikTok LIVE có phụ đề tiếng Việt trong bốn bước" })}
${steps([
  { title: "Mở TikTok LIVE trên máy tính", text: "Mở buổi live trên trang web TikTok bằng trình duyệt của máy tính và cho nó phát tiếng. Việc đăng nhập và quyền xem do TikTok quyết định, không liên quan tới AI Translator." },
  { title: "Cài và mở AI Translator", text: "Dán lệnh cài ở trang <a href=\"/tai-xuong/\">Tải xuống</a> vào Terminal (macOS) hoặc PowerShell (Windows). Ở ô <em>Dịch sang</em>, chọn tiếng Việt." },
  { title: "Bấm Bắt đầu khi live đang phát", text: "Bấm <strong>Bắt đầu</strong> (phím tắt ⌃⌥T, Windows: Ctrl+Alt+T). Trên macOS, lần đầu hệ điều hành hỏi quyền <em>Ghi âm thanh hệ thống</em>: xem <a href=\"/huong-dan/cap-quyen-thu-am-macos/\">cách cấp quyền</a>." },
  { title: "Kéo thanh phụ đề tới sát khung live", text: "Kéo thanh tới sát dưới khung live, chỉnh cỡ chữ ở Cài đặt › Phụ đề và bấm <em>Khóa (click xuyên qua)</em> để chuột đi xuyên thanh." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Mẹo", title: "Mẹo cho live nói nhanh, có nhạc và nhiều người nói" })}
${checkList([
  "<strong>Người nói nhanh, ít ngừng:</strong> tăng <em>Độ nhạy ngắt câu</em> (50–800 ms) để câu ít bị cắt giữa chừng; đổi lại phụ đề hiện chậm hơn một chút.",
  "<strong>Nhạc nền lớn hoặc nhiều tiếng ồn:</strong> nhận dạng kém đi và bản dịch dễ sai; live có tiếng nói rõ cho kết quả tốt hơn.",
  "<strong>Nhiều người nói chồng lên nhau:</strong> app dịch từng câu theo âm thanh nghe được và không biết ai đang nói.",
  "<strong>Chỉ nghe trình duyệt (macOS):</strong> ở Cài đặt › Âm thanh, chọn <em>Chỉ {tên trình duyệt}</em> để thông báo của máy không bị dịch; các tab khác của trình duyệt đó vẫn được nghe.",
  "<strong>Live tiếng Trung, Hàn, Nhật hay Anh:</strong> chọn tiếng Việt ở ô Dịch sang; biết trước ngôn ngữ thì đặt <em>Ngôn ngữ nguồn</em>, người nói đổi tiếng thì giữ Tự nhận diện.",
])}
</div></section>

<section class="section" id="chua-phu-hop"><div class="container narrow">
${sectionHead({ eyebrow: "Trung thực", title: "Khi nào AI Translator chưa phù hợp với live TikTok?", text: "Biết trước giới hạn sẽ giúp bạn khỏi mất công thử." })}
${checkList([
  "<strong>Bạn xem TikTok LIVE bằng điện thoại.</strong> AI Translator chỉ có bản cho macOS và Windows, nên không hiện phụ đề trong ứng dụng TikTok trên điện thoại.",
  "<strong>Bạn là người phát live và muốn dịch cho người xem của mình.</strong> Phụ đề chỉ hiện trên màn hình người dùng app. App không đưa phụ đề hay giọng dịch vào buổi live của bạn.",
  "<strong>Bạn cần ghi lại buổi live hoặc tải video.</strong> App không ghi âm hay ghi hình xuống đĩa và không xử lý file video; nó chỉ có bản chép lời bằng chữ.",
], true)}
${callout({ kind: "warn", title: "Bản dịch tự động có thể sai.", text: "Đừng dựa vào AI Translator cho quyết định quan trọng (mua bán, thanh toán, hợp đồng) mà chưa kiểm tra lại. Chúng tôi chưa thử riêng TikTok LIVE; những gì chúng tôi đã thử được ghi ở <a href=\"/giai-phap/dich-livestream/#chua-phu-hop\">trang dịch livestream</a>." })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Dịch live TikTok: những điều hay được hỏi" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Đọc tiếp", title: "Bước tiếp theo", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/giai-phap/dich-livestream/", icon: "play", title: "Dịch livestream", text: "Cách hoạt động, mẹo cho live không tua lại được và hạn mức, cho mọi nền tảng livestream.", more: "Xem giải pháp" })}
${linkCard({ href: "/huong-dan/bat-dau-nhanh/", icon: "zap", title: "Bắt đầu nhanh", text: "Từ cài đặt tới phụ đề đầu tiên.", more: "Xem hướng dẫn" })}
${linkCard({ href: "/bang-gia/", icon: "wallet", title: "Bảng giá", text: "Free dùng thử 10 ngày; sau đó Monthly, 6 Months hoặc Yearly, trả trước.", more: "Xem bảng giá" })}
</div>
<p class="disclaimer">TikTok là nhãn hiệu của chủ sở hữu tương ứng; AI Translator không liên kết với TikTok.</p>
</div></section>

${ctaBand({ title: "Thử với buổi live TikTok tiếp theo", text: "Cài bằng một dòng lệnh, dùng thử Free 10 ngày, mỗi ngày 30 phút. Không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/huong-dan/bat-dau-nhanh/", label: "Xem hướng dẫn" } })}
`,
};
