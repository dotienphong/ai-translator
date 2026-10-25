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
    a: `<p>Về cơ chế thì được: app nghe âm thanh phát ra từ máy nên không phụ thuộc trang web, và hiện phụ đề tiếng Việt khi người nói dùng tiếng Anh, Trung, Nhật hay Hàn. Nhưng với TikTok LIVE, chúng tôi chỉ có kết quả của một buổi live tiếng Việt có nhạc nền: app thu được tiếng, có điều nhạc làm nhận dạng sai nên phụ đề không dùng được. Chúng tôi chưa có kết quả với TikTok LIVE bằng tiếng Anh, Trung, Nhật hay Hàn. Chúng tôi đã thử với video phát trong trình duyệt, và thử một lần với YouTube Live (kênh tin tức tiếng Anh, Chrome trên macOS, 25/10/2026). Cách làm: mở buổi live trong trình duyệt, bấm Bắt đầu ở AI Translator và đọc phụ đề tiếng Việt trên thanh nổi.</p>`,
  },
  {
    q: "Dùng trên điện thoại được không?",
    a: `<p>Không. AI Translator chỉ có bản cho macOS (Apple Silicon) và Windows 10/11, không có trong ứng dụng TikTok hay trên điện thoại. Hãy mở buổi live trên trình duyệt của máy tính.</p>`,
  },
  {
    q: "Có cần cài gì vào TikTok hay trình duyệt không?",
    a: `<p>Không. Không cần tiện ích trình duyệt hay plugin, và AI Translator không cần kết nối với tài khoản TikTok của bạn: app chỉ nghe âm thanh đang phát ra từ máy tính. Xem live có cần đăng nhập TikTok hay không là do TikTok quyết định.</p>`,
  },
  {
    q: "Tôi bán hàng trên TikTok LIVE, dịch cho khách nước ngoài được không?",
    a: `<p>Không. AI Translator không có tính năng đưa phụ đề hay giọng dịch vào buổi live của bạn. App làm phụ đề để chính người dùng app đọc, trên thanh nổi ở máy của họ.</p>`,
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
  llm: "Cách dịch live TikTok sang tiếng Việt bằng phụ đề trực tiếp khi xem TikTok LIVE trên trình duyệt máy tính: bốn bước, mẹo khi câu bị cắt giữa chừng, có nhạc nền và nhiều người nói, giới hạn thật (không dùng trên điện thoại, không dịch buổi live của chính bạn cho người xem) và hỏi đáp.",
  llmTitle: "Dịch live TikTok sang tiếng Việt khi xem trên máy tính",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "Dịch live TikTok sang tiếng Việt khi xem trên máy tính",
  lead: "Muốn đọc phụ đề tiếng Việt khi xem TikTok LIVE bằng tiếng Anh, Trung, Nhật hay Hàn, bạn mở buổi live trên trình duyệt máy tính rồi dùng AI Translator: app nghe âm thanh phát ra từ máy và hiện bản dịch trên một thanh nổi. App chỉ có bản cho macOS và Windows nên không dùng được trong ứng dụng TikTok trên điện thoại, và chỉ làm phụ đề cho người xem.",
  meta: "<span>Cập nhật {{updated}}</span><span>Chạy trên máy tính macOS và Windows, không chạy trên điện thoại</span>",
})}

<section class="section-tight"><div class="container narrow">
${callout({ kind: "warn", title: "Trước khi thử: chỉ dùng được trên máy tính.", text: "AI Translator không có bản cho điện thoại. Nếu bạn quen xem TikTok LIVE trên điện thoại, hãy mở buổi live đó trên trình duyệt của máy tính để có phụ đề tiếng Việt. Với TikTok LIVE, chúng tôi chỉ có kết quả của một buổi live tiếng Việt có nhạc nền, và phụ đề không dùng được (xem mục giới hạn bên dưới)." })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Bắt đầu", title: "Xem TikTok LIVE có phụ đề tiếng Việt trong bốn bước" })}
${steps([
  { title: "Cài và mở AI Translator", text: "Dán lệnh cài ở trang <a href=\"/tai-xuong/\">Tải xuống</a> vào Terminal (macOS) hoặc PowerShell (Windows). Ở ô <em>Dịch sang</em>, chọn tiếng Việt." },
  { title: "Mở TikTok LIVE trên máy tính", text: "Mở buổi live trên trang web TikTok bằng trình duyệt của máy tính (nếu TikTok cho xem buổi đó trên web) và cho nó phát tiếng. Việc đăng nhập và quyền xem do TikTok quyết định, không liên quan tới AI Translator." },
  { title: "Bấm Bắt đầu khi live đang phát", text: "Bấm <strong>Bắt đầu</strong> (phím tắt ⌃⌥T, Windows: Ctrl+Alt+T). Trên macOS, lần đầu hệ điều hành hỏi quyền <em>Ghi âm thanh hệ thống</em>: xem <a href=\"/huong-dan/cap-quyen-thu-am-macos/\">cách cấp quyền</a>. App nạp model trong vài giây đầu; lần đầu sau khi cài hoặc cập nhật có thể lâu hơn, tới vài phút." },
  { title: "Kéo thanh phụ đề tới sát khung live", text: "Kéo thanh tới sát dưới khung live, chỉnh cỡ chữ ở Cài đặt › Phụ đề và bấm <em>Khóa (click xuyên qua)</em> để chuột đi xuyên thanh." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Mẹo", title: "Mẹo khi câu bị cắt, live có nhạc và nhiều người nói" })}
${checkList([
  "<strong>Câu bị cắt vụn giữa chừng (người nói hay ngập ngừng, ngắt hơi):</strong> tăng <em>Độ nhạy ngắt câu</em> (50–800 ms) để câu ít bị cắt hơn; đổi lại phụ đề hiện chậm hơn một chút. Đổi có tác dụng từ phiên dịch sau.",
  "<strong>Nhạc nền lớn hoặc nhiều tiếng ồn:</strong> nhận dạng kém đi, app có thể nhận nhầm ngôn ngữ hoặc lặp đi lặp lại một câu không ai nói, nên bản dịch dễ vô nghĩa; live có tiếng nói rõ cho kết quả tốt hơn.",
  "<strong>Nhiều người nói chồng lên nhau:</strong> app dịch từng câu theo âm thanh nghe được và không biết ai đang nói.",
  "<strong>Chỉ nghe trình duyệt (macOS):</strong> để thông báo của máy không bị dịch, hãy cho live phát trước, vào Cài đặt › Âm thanh, bấm <em>Làm mới danh sách</em>, chọn <em>Chỉ {tên trình duyệt}</em> rồi mới bấm Bắt đầu. Với Safari, mục này tên là <em>Chỉ Safari và trang web trong các app khác</em>. Đổi nguồn có tác dụng từ phiên dịch sau; các tab khác của trình duyệt đó vẫn được nghe.",
  "<strong>Windows chưa chọn được từng app:</strong> tắt tiếng thông báo của máy khi xem.",
  "<strong>Live tiếng Trung, Hàn, Nhật hay Anh:</strong> chọn tiếng Việt ở ô Dịch sang; biết trước ngôn ngữ thì đặt <em>Ngôn ngữ nguồn</em>, người nói đổi tiếng thì giữ Tự nhận diện. Cả bốn chiều Anh, Trung, Nhật, Hàn sang tiếng Việt đều đã có điểm đo chất lượng dịch (<a href=\"/tinh-nang/#chat-luong-theo-chieu\">xem bảng</a>).",
])}
</div></section>

<section class="section" id="chua-phu-hop"><div class="container narrow">
${sectionHead({ eyebrow: "Trung thực", title: "Khi nào AI Translator chưa phù hợp với live TikTok?", text: "Biết trước giới hạn sẽ giúp bạn khỏi mất công thử." })}
${checkList([
  "<strong>Bạn xem TikTok LIVE bằng điện thoại.</strong> AI Translator chỉ có bản cho macOS và Windows, nên không hiện phụ đề trong ứng dụng TikTok trên điện thoại.",
  "<strong>Bạn là người phát live và muốn dịch cho người xem của mình.</strong> App làm phụ đề để chính người dùng app đọc, trên thanh nổi ở máy của họ. App không đưa phụ đề hay giọng dịch vào buổi live của bạn.",
  "<strong>Bạn cần ghi lại buổi live hoặc tải video.</strong> App không ghi âm hay ghi hình xuống đĩa và không xử lý file video; nó chỉ có bản chép lời bằng chữ.",
  "<strong>Buổi live không nói tiếng Anh, Trung, Nhật, Hàn hay Việt.</strong> App chỉ hỗ trợ năm ngôn ngữ này; live bằng tiếng Thái, tiếng Indonesia hay ngôn ngữ khác chưa dịch được.",
], true)}
${callout({ kind: "warn", title: "Bản dịch tự động có thể sai.", text: "Đừng dựa vào AI Translator cho quyết định quan trọng (mua bán, thanh toán, hợp đồng) mà chưa kiểm tra lại. Với TikTok LIVE, chúng tôi chỉ có kết quả của một buổi live tiếng Việt có nhạc nền: app thu được tiếng, nhưng nhạc làm nhận dạng sai nên phụ đề không dùng được. Chúng tôi đã thử với video phát trong trình duyệt, và thử một lần với YouTube Live (kênh tin tức tiếng Anh, Chrome trên macOS, 25/10/2026)." })}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Dịch live TikTok: những điều hay được hỏi" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Đọc tiếp", title: "Bước tiếp theo", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/giai-phap/dich-livestream/", icon: "play", title: "Dịch livestream", text: "Cách hoạt động, mẹo cho live thường không tua lại được và hạn mức, cho mọi nền tảng livestream.", more: "Xem giải pháp" })}
${linkCard({ href: "/huong-dan/bat-dau-nhanh/", icon: "zap", title: "Bắt đầu nhanh", text: "Từ cài đặt tới phụ đề đầu tiên.", more: "Xem hướng dẫn" })}
${linkCard({ href: "/bang-gia/", icon: "wallet", title: "Bảng giá", text: "Free dùng thử 10 ngày; sau đó Monthly, 6 Months hoặc Yearly, trả trước.", more: "Xem bảng giá" })}
</div>
<p class="disclaimer">TikTok là nhãn hiệu của chủ sở hữu tương ứng; AI Translator không liên kết với TikTok.</p>
</div></section>

${ctaBand({ title: "Thử với buổi live TikTok tiếp theo", text: "Cài bằng một dòng lệnh, dùng thử Free 10 ngày, mỗi ngày 30 phút. Không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/huong-dan/bat-dau-nhanh/", label: "Xem hướng dẫn" } })}
`,
};
