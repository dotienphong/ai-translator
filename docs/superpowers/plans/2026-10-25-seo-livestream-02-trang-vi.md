# SEO từ khóa livestream 02: hai trang mới bản tiếng Việt

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo `website/src/content/vi/solutions-livestream.mjs` (nhắm "dịch livestream ra tiếng Việt", "dịch livestream trực tiếp", "dịch livestream", "dịch live trực tiếp", "dịch live") và `website/src/content/vi/solutions-tiktok-live.mjs` (nhắm "dịch live tiktok").

Các khối mã dưới đây đã được đồng bộ với bản cuối sau rà soát sự thật (commit sửa của đơn vị 2); nếu có lệch, file thật là nguồn đúng.

**Architecture:** Hai module trang theo đúng khuôn `vi/solutions-webinar.mjs` (`type: "article"`, `pageHero`, `facts`, `checkList`, `steps`, `callout`, `faq`, `ctaBand`) cộng `schema: [faqPage(FAQ)]` như `vi/home.mjs`. Chưa nối menu (kế hoạch 04). Làm sau kế hoạch 01; tiền đề: nhánh `seo-livestream` trong worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream`.

**Tech Stack:** Node ESM, các khối ở `website/src/build/components.mjs`. Đọc `00-tong-quan.md` mục "Sự thật được phép nói" trước.

Mọi lệnh có `cd` tuyệt đối. Dùng biến `WT=/Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream` chỉ như viết tắt trong tài liệu này: khi chạy, viết đường dẫn đầy đủ.

---

### Task 1: Trang `solutions-livestream` (vi)

**Files:**
- Create: `WT/website/src/content/vi/solutions-livestream.mjs`

- [ ] **Step 1: Tạo file với nội dung sau**

```js
import { pageHero, sectionHead, feature, checkList, callout, ctaBand, steps, linkCard, facts, overlayShot, faq } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Giải pháp", path: "/giai-phap/" },
  { name: "Dịch livestream", path: "/giai-phap/dich-livestream/" },
];

const FAQ = [
  {
    q: "Dịch livestream ra tiếng Việt bằng cách nào?",
    a: `<p>Cài AI Translator trên máy tính, mở livestream trong trình duyệt, chọn tiếng Việt ở ô Dịch sang rồi bấm Bắt đầu. App nghe âm thanh đang phát ra từ máy và hiện phụ đề tiếng Việt trên một thanh nổi, với độ trễ trung vị 0,76–1,03 giây, tính từ lúc người nói dừng câu, khi đo trên Mac M4 Pro (gói model Chuẩn). Live có thể bằng tiếng Anh, Trung, Nhật hay Hàn; cả bốn chiều sang tiếng Việt đều đã có điểm đo chất lượng dịch (<a href="/tinh-nang/#chat-luong-theo-chieu">xem bảng</a>).</p>`,
  },
  {
    q: "Có dịch được live TikTok, YouTube và Facebook không?",
    a: `<p>App thu âm thanh hệ thống nên không phụ thuộc nền tảng: buổi live nào phát tiếng ra máy tính của bạn thì app nghe được. Chúng tôi đã thử với video phát trong trình duyệt. Chúng tôi chưa thử riêng từng nền tảng livestream. Xem thêm <a href="/giai-phap/dich-live-tiktok/">dịch live TikTok</a>.</p>`,
  },
  {
    q: "Dùng AI Translator để dịch live trên điện thoại được không?",
    a: `<p>Không. AI Translator chỉ có bản cho macOS (Apple Silicon) và Windows 10/11, nên chỉ dùng được khi bạn xem live trên máy tính.</p>`,
  },
  {
    q: "Có cần internet khi đang dịch không?",
    a: `<p>Phần dịch thì không: nhận dạng giọng nói, dịch và hiện phụ đề chạy trên máy bạn, âm thanh không gửi đi. Bạn vẫn cần internet để xem livestream.</p>`,
  },
  {
    q: "Tôi phát live thì dịch cho người xem của mình được không?",
    a: `<p>Không. AI Translator không có tính năng đưa phụ đề hay giọng dịch vào buổi live của bạn. App làm phụ đề để chính người dùng app đọc, trên thanh nổi ở máy của họ.</p>`,
  },
  {
    q: "Dịch live có miễn phí không?",
    a: `<p>Gói Free dùng thử 10 ngày, tối đa 30 phút dịch mỗi ngày, không cần thẻ hay tài khoản. Sau đó cần gói trả trước; xem <a href="/bang-gia/">bảng giá</a>. Free là dùng thử, không phải miễn phí vĩnh viễn.</p>`,
  },
];

export default {
  id: "solutions-livestream",
  lang: "vi",
  path: "/giai-phap/dich-livestream/",
  title: "Dịch livestream ra tiếng Việt: phụ đề trực tiếp",
  description:
    "Dịch livestream ra tiếng Việt khi xem trên máy tính: phụ đề trực tiếp, AI chạy ngay trên máy, không cần tiện ích trình duyệt. Không dùng được trên điện thoại.",
  type: "article",
  published: "2026-10-25",
  breadcrumbs: crumbs,
  modified: "2026-10-25",
  llm: "Cách dùng AI Translator để dịch livestream ra tiếng Việt bằng phụ đề trực tiếp khi xem live trên máy tính: bốn bước, mẹo cho live thường không tua lại được, hạn mức, giới hạn thật (không dùng trên điện thoại, không dịch buổi live của chính bạn cho người xem) và hỏi đáp.",
  llmTitle: "Dịch livestream ra tiếng Việt bằng phụ đề trực tiếp",
  schema: [faqPage(FAQ)],
  body: () => `
${pageHero({
  crumbs,
  title: "Dịch livestream ra tiếng Việt bằng phụ đề trực tiếp",
  lead: "Muốn dịch live trực tiếp một buổi livestream nước ngoài để hiểu ngay khi đang phát? AI Translator hiện phụ đề tiếng Việt khi bạn xem livestream bằng tiếng Anh, Trung, Nhật hay Hàn trên máy tính. App nghe âm thanh đang phát ra từ máy nên dùng được với live phát trong trình duyệt, không cần cài tiện ích, và việc nhận dạng cùng dịch chạy ngay trên máy bạn. App chỉ có bản cho macOS và Windows, không dùng được trên điện thoại, và chỉ làm phụ đề cho người xem: không dịch live của chính bạn cho người xem của bạn.",
  meta: "<span>Cập nhật {{updated}}</span><span>Chạy trên máy tính macOS và Windows, không chạy trên điện thoại</span>",
})}

<section class="section-tight"><div class="container">
<div class="reveal">${facts([
  ["Dùng với", "Livestream phát trong trình duyệt hoặc app trên máy tính<small>TikTok LIVE, YouTube, Facebook Live: app nghe âm thanh của máy nên không phụ thuộc nền tảng; chúng tôi chưa thử riêng từng nền tảng</small>"],
  ["Ngôn ngữ", "Tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt<small>Chỉ các chiều có tiếng Việt đã được đo chất lượng dịch</small>"],
  ["Độ trễ", "Trung vị 0,76–1,03 giây<small>Sau khi người nói dừng câu; Mac M4 Pro, gói model Chuẩn; máy yếu hơn sẽ chậm hơn</small>"],
  ["Máy", "macOS 14.2+ (Apple Silicon) và Windows 10/11 x64<small>Không có bản cho điện thoại hay máy tính bảng</small>"],
])}</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Dành cho ai", title: "Khi buổi live hay nhưng không phải tiếng của bạn", center: true })}
<div class="grid grid-3">
${feature({ icon: "play", title: "Người xem live bằng ngoại ngữ", text: "Buổi live bằng tiếng Anh, Trung, Nhật, Hàn của người sáng tạo nội dung, diễn giả hay đài truyền hình mà bạn muốn hiểu ngay khi đang phát." })}
${feature({ icon: "users", title: "Người theo dõi sự kiện trực tiếp", text: "Hội nghị, ra mắt sản phẩm hay buổi live giới thiệu hàng bằng ngoại ngữ, nơi bạn chỉ xem và nghe." })}
${feature({ icon: "book", title: "Người học qua buổi live", text: "Buổi giảng, lớp học hay hội thảo phát trực tiếp bằng ngoại ngữ mà bạn muốn theo kịp từng câu." })}
</div>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">Cách hoạt động</span>
<h2>Dịch livestream trực tiếp ngay trên máy tính</h2>
${checkList([
  "Bạn mở livestream trên trình duyệt (hoặc app) ở máy tính rồi bấm <strong>Bắt đầu</strong> trong AI Translator",
  "App nghe âm thanh đang phát ra từ máy, tách thành câu, nhận dạng và dịch ngay trên máy bạn",
  "Bản dịch hiện trên thanh phụ đề nổi nằm trên cửa sổ live, câu gốc chữ nhỏ ở trên",
  "Không cần tiện ích trình duyệt và app không cần kết nối tài khoản nền tảng; thanh phụ đề không lấy focus của cửa sổ đang mở nên bạn vẫn gõ chat bình thường",
])}
</div>
<div>
${overlayShot({ slug: "overlay-default", lang: "vi", alt: "Thanh phụ đề của AI Translator: câu gốc tiếng Trung và tiếng Anh chữ nhỏ ở trên, bản dịch tiếng Việt chữ lớn bên dưới", caption: "Thanh phụ đề thật của app: câu gốc chữ nhỏ ở trên, bản dịch ở dưới." })}
</div>
</div>
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Bắt đầu", title: "Bốn bước để xem live có phụ đề tiếng Việt" })}
${steps([
  { title: "Mở livestream trên máy tính", text: "Mở buổi live bằng trình duyệt (hoặc app) trên máy tính và cho nó phát tiếng. Trên macOS, lần đầu bấm Bắt đầu, hệ điều hành hỏi quyền <em>Ghi âm thanh hệ thống</em>: xem <a href=\"/huong-dan/cap-quyen-thu-am-macos/\">cách cấp quyền</a>." },
  { title: "Chọn ngôn ngữ", text: "Ở ô <em>Dịch sang</em>, chọn tiếng Việt. Nếu cả buổi live chỉ một ngôn ngữ, đặt <em>Ngôn ngữ nguồn</em> đúng ngôn ngữ đó thay vì <em>Tự nhận diện</em>; người nói đổi tiếng thì giữ Tự nhận diện." },
  { title: "Bấm Bắt đầu", text: "Bấm <strong>Bắt đầu</strong> (phím tắt ⌃⌥T, Windows: Ctrl+Alt+T) trước hoặc ngay khi live phát. App nạp model trong vài giây đầu; lần đầu sau khi cài hoặc cập nhật có thể lâu hơn, tới vài phút." },
  { title: "Đặt thanh phụ đề", text: "Kéo thanh tới sát dưới khung video, chỉnh cỡ chữ và màu ở Cài đặt › Phụ đề, rồi bấm <em>Khóa (click xuyên qua)</em> để chuột đi xuyên thanh." },
], true)}
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Mẹo", title: "Livestream thường không tua lại được: chỉnh thế nào cho dễ xem?" })}
${checkList([
  "<strong>Chọn nguồn Chỉ {tên app} (macOS):</strong> để thông báo của máy không bị dịch, hãy cho live phát trước, vào Cài đặt › Âm thanh, bấm <em>Làm mới danh sách</em> (danh sách chỉ có app đang phát tiếng), chọn trình duyệt đang phát live rồi mới bấm Bắt đầu. Với Safari, mục này tên là <em>Chỉ Safari và trang web trong các app khác</em>. Đổi nguồn có tác dụng từ phiên dịch sau. Các tab khác của trình duyệt đó vẫn được nghe, nên hãy tắt tiếng tab khác.",
  "<strong>Windows chưa chọn được từng app:</strong> hãy tắt tiếng thông báo của máy khi xem.",
  "<strong>Độ nhạy ngắt câu</strong> chỉnh 50–800 ms: ngắn thì phụ đề hiện sớm hơn, dài thì ít cắt câu hơn. Thấy câu bị cắt vụn giữa chừng (người nói hay ngập ngừng, ngắt hơi) thì thử tăng lên; đổi có tác dụng từ phiên dịch sau.",
  "<strong>Lỡ một câu:</strong> thanh đã khóa thì bấm ⌃⌥PageUp (Windows: Ctrl+Alt+PageUp) để xem câu cũ, ⌃⌥PageDown để về câu mới; thanh chưa khóa thì cuộn bằng con lăn, nút <em>Mới nhất</em> đưa về câu hiện tại. Ở mọi gói, bạn còn xem, tìm và sao chép được bản chép lời của phiên gần nhất; bắt đầu phiên mới thì bản cũ bị thay (<a href=\"/huong-dan/lich-su-va-xuat-file/\">lịch sử và xuất file</a>).",
])}
${callout({ title: "Hạn mức cho buổi live dài.", text: "Phút chỉ tính theo tiếng nói đã dịch, không tính im lặng; câu đã ở đúng ngôn ngữ bạn muốn đọc không bị tính. Free chỉ có 30 phút mỗi ngày trong 10 ngày dùng thử, nên một buổi live dài cần Monthly (50 giờ mỗi 30 ngày), 6 Months (100 giờ mỗi 30 ngày) hoặc Yearly (không giới hạn). Xem <a href=\"/bang-gia/\">bảng giá</a>." })}
</div></section>

<section class="section" id="chua-phu-hop"><div class="container narrow">
${sectionHead({ eyebrow: "Trung thực", title: "Khi nào AI Translator chưa phù hợp với livestream?", text: "Biết trước giới hạn sẽ giúp bạn khỏi mất công thử." })}
${checkList([
  "<strong>Bạn xem live bằng điện thoại.</strong> AI Translator chỉ có bản cho macOS và Windows, nên không hiện phụ đề trong ứng dụng điện thoại. Muốn dùng, hãy mở buổi live trên máy tính.",
  "<strong>Bạn là người phát live và muốn dịch cho người xem của mình.</strong> App làm phụ đề để chính người dùng app đọc, trên thanh nổi ở máy của họ. App không đưa phụ đề hay giọng dịch vào buổi live của bạn.",
  "<strong>Bạn cần ghi lại buổi live, tải video hoặc tạo file phụ đề từ file video.</strong> App không ghi âm hay ghi hình xuống đĩa và không xử lý file video; nó chỉ có bản chép lời bằng chữ và không có chế độ tóm tắt.",
  "<strong>Âm thanh không rõ.</strong> Nhạc nền lớn, tiếng ồn hay nhiều người nói chồng lên nhau làm nhận dạng kém đi và bản dịch dễ sai.",
  "<strong>Máy yếu hoặc cần tốc độ trên Windows.</strong> Độ trễ 0,76–1,03 giây là đo trên Mac M4 Pro với gói model Chuẩn; Windows mới đo sơ bộ trên một laptop có GPU tích hợp và chậm hơn (<a href=\"/tinh-nang/#hieu-nang\">điều kiện đo</a>).",
  "<strong>Buổi live không nói tiếng Anh, Trung, Nhật, Hàn hay Việt.</strong> App chỉ hỗ trợ năm ngôn ngữ này; live bằng tiếng Thái, tiếng Indonesia hay ngôn ngữ khác chưa dịch được.",
], true)}
${callout({ kind: "warn", title: "Bản dịch tự động có thể sai.", text: "Đừng dựa vào AI Translator cho quyết định quan trọng (mua bán, hợp đồng, y tế, pháp lý, tài chính) mà chưa kiểm tra lại với người có chuyên môn." })}
<p>Chúng tôi đã thử với video phát trong trình duyệt. Chúng tôi chưa thử riêng từng nền tảng livestream.</p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Dịch livestream: những điều hay được hỏi" })}
${faq(FAQ, { open: true })}
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Đọc tiếp", title: "Bước tiếp theo", center: true })}
<div class="grid grid-3">
${linkCard({ href: "/giai-phap/dich-live-tiktok/", icon: "play", title: "Dịch live TikTok", text: "Cách xem TikTok LIVE trên trình duyệt máy tính với phụ đề tiếng Việt, và giới hạn riêng của nó.", more: "Xem hướng dẫn" })}
${linkCard({ href: "/giai-phap/dich-webinar-va-video/", icon: "book", title: "Webinar, khóa học và video", text: "Xem nội dung đã ghi bằng ngoại ngữ, kể cả phiên dài nhiều giờ.", more: "Xem giải pháp" })}
${linkCard({ href: "/huong-dan/bat-dau-nhanh/", icon: "zap", title: "Bắt đầu nhanh", text: "Từ cài đặt tới phụ đề đầu tiên.", more: "Xem hướng dẫn" })}
</div>
<p class="center-text reveal">Cần biết nội dung của bạn có bị gửi đi đâu không? Xem <a href="/bao-mat-du-lieu/">dữ liệu và bảo mật</a>.</p>
<p class="disclaimer">TikTok, YouTube, Facebook và các tên sản phẩm khác thuộc về chủ sở hữu tương ứng; AI Translator không liên kết với họ.</p>
</div></section>

${ctaBand({ title: "Thử với buổi livestream tiếp theo", text: "Cài bằng một dòng lệnh, dùng thử Free 10 ngày, mỗi ngày 30 phút. Không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/bang-gia/", label: "Xem bảng giá" } })}
`,
};
```

- [ ] **Step 2: Kiểm riêng các test của trang này (chưa có trang TikTok và bản en nên chỉ xem các dòng `solutions-livestream` bản vi)**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/seo-targets.test.mjs 2>&1 | grep -E '^(✔|✖)' | grep -E '\(vi\)|vi:'`
Expected: các dòng của `solutions-livestream` bản vi (cụm "dịch livestream ra tiếng việt", "dịch livestream trực tiếp", "dịch livestream", "dịch live trực tiếp", "dịch live", và mục "giới hạn") là `✔`. Dòng của `solutions-tiktok-live` bản vi còn `✖` (chưa có trang). Không chạy `site.test.mjs` ở bước này: trang đang liên kết tới `/giai-phap/dich-live-tiktok/` chưa tồn tại.

- [ ] **Step 3: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/content/vi/solutions-livestream.mjs && \
git commit -m "feat(website): trang Dịch livestream ra tiếng Việt (vi)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.

---

### Task 2: Trang `solutions-tiktok-live` (vi)

**Files:**
- Create: `WT/website/src/content/vi/solutions-tiktok-live.mjs`

- [ ] **Step 1: Tạo file với nội dung sau**

```js
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
    a: `<p>Trên máy tính thì dùng được: app nghe âm thanh đang phát ra từ máy nên không phụ thuộc trang web, và hiện phụ đề tiếng Việt khi người nói dùng tiếng Anh, Trung, Nhật hay Hàn. Chúng tôi đã thử với video phát trong trình duyệt. Chúng tôi chưa thử riêng TikTok LIVE. Cách làm: mở buổi live trong trình duyệt, bấm Bắt đầu ở AI Translator và đọc phụ đề tiếng Việt trên thanh nổi.</p>`,
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
${callout({ kind: "warn", title: "Trước khi thử: chỉ dùng được trên máy tính.", text: "AI Translator không có bản cho điện thoại. Nếu bạn quen xem TikTok LIVE trên điện thoại, hãy mở buổi live đó trên trình duyệt của máy tính để có phụ đề tiếng Việt." })}
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
  "<strong>Nhạc nền lớn hoặc nhiều tiếng ồn:</strong> nhận dạng kém đi và bản dịch dễ sai; live có tiếng nói rõ cho kết quả tốt hơn.",
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
${callout({ kind: "warn", title: "Bản dịch tự động có thể sai.", text: "Đừng dựa vào AI Translator cho quyết định quan trọng (mua bán, thanh toán, hợp đồng) mà chưa kiểm tra lại. Chúng tôi chưa thử riêng TikTok LIVE. Chúng tôi đã thử với video phát trong trình duyệt." })}
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
```

Ghi chú: callout cuối mục "chưa phù hợp" viết ngay tại chỗ hai câu "chưa thử" và "đã thử" (không dẫn sang trang livestream); trang TikTok vẫn liên kết tới trang livestream bằng thẻ ở mục "Đọc tiếp".

- [ ] **Step 2: Chạy test cấu trúc chung của website với `ALLOW_PARTIAL=1` (lúc này hai trang vi đã đủ để mọi liên kết giữa chúng hợp lệ)**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/site.test.mjs 2>&1 | grep -E '^(✖|ℹ (tests|pass|fail|skipped))'`
Expected: `ℹ fail 1` và đúng một dòng `✖ đủ trang (không thiếu module nào)` (test này luôn đỏ khi còn thiếu bản en/ja/zh/ko; kế hoạch 05 làm nó xanh). Mọi `✖` khác là lỗi thật, đọc thông báo: các lỗi hay gặp là title dài quá 70 ký tự (rút gọn `title`), description ngoài 90–165 ký tự (đếm lại bằng `node -e 'console.log("…".length)'`), chữ cấm (`engine`, `metal`, `beta`), liên kết hỏng (gõ sai đường dẫn), hay nhảy cấp heading. Sửa tới khi chỉ còn đúng `đủ trang…` đỏ.

- [ ] **Step 3: Chạy test mới cho các trang vi**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream/website && ALLOW_PARTIAL=1 node --test test/seo-targets.test.mjs 2>&1 | grep -E '^(✔|✖)' | grep -E 'dịch|\(vi\)|vi:'`
Expected: mọi dòng cụm tiếng Việt (`dịch livestream ra tiếng việt`, `dịch livestream trực tiếp`, `dịch livestream`, `dịch live trực tiếp`, `dịch live`, `dịch live tiktok`) và hai dòng giới hạn của trang vi đều `✔`; dòng ngăn "đã thử" (STALE_LIVE) `✔`. Dòng liên kết menu/trang Giải pháp bản vi còn `✖` (làm ở kế hoạch 04).

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/seo-livestream && \
git branch --show-current && \
git add website/src/content/vi/solutions-tiktok-live.mjs && \
git commit -m "feat(website): trang Dịch live TikTok sang tiếng Việt (vi)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `seo-livestream` và một dòng commit mới.
