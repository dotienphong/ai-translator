import { pageHero, callout, facts, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Cài đặt trên macOS", path: "/huong-dan/cai-dat-macos/" },
];

const toc = [
  { level: 2, id: "yeu-cau", text: "Máy của bạn có chạy được không?" },
  { level: 2, id: "kiem-tra-file", text: "Kiểm tra file cài đặt (SHA-256)" },
  { level: 2, id: "keo-vao-applications", text: "Kéo AI Translator vào Applications" },
  { level: 2, id: "mo-lan-dau", text: "Mở lần đầu: vì sao bị chặn" },
  { level: 2, id: "cap-nhat", text: "Mỗi lần cập nhật" },
  { level: 2, id: "go-cai-dat", text: "Gỡ cài đặt đúng cách" },
  { level: 2, id: "loi-thuong-gap", text: "Lỗi thường gặp khi cài" },
];

const HOWTO_STEPS = [
  { name: "Kiểm tra mã SHA-256 của file .dmg", text: "Chạy shasum -a 256 trên file .dmg trong Terminal và so với mã SHA-256 chúng tôi gửi kèm bản cài." },
  { name: "Kéo app vào Applications", text: "Mở file .dmg rồi kéo AI Translator vào thư mục Applications." },
  { name: "Mở app và bấm Done", text: "Mở AI Translator. Khi macOS báo không xác minh được nhà phát triển, bấm Done." },
  { name: "Bấm Open Anyway", text: "Vào System Settings > Privacy & Security, kéo xuống cuối, bấm Open Anyway cạnh tên AI Translator." },
  { name: "Xác nhận", text: "Xác nhận bằng mật khẩu đăng nhập hoặc Touch ID để app mở ra." },
];

export default {
  id: "guide-install-macos",
  lang: "vi",
  path: "/huong-dan/cai-dat-macos/",
  title: "Cài đặt AI Translator trên macOS",
  description:
    "Cách cài AI Translator trên macOS: yêu cầu máy, kéo vào Applications, mở lần đầu bằng Open Anyway, kiểm tra SHA-256, việc cần làm khi cập nhật và gỡ cài đặt.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Cài AI Translator trên macOS: yêu cầu máy, kiểm SHA-256, kéo vào Applications, bấm Open Anyway vì bản ký ad-hoc chưa notarize, hộp thoại Keychain khi cập nhật và gỡ cài đặt.",
  llmTitle: "Cài đặt AI Translator trên macOS",
  schema: [
    howTo({
      name: "Cài và mở AI Translator trên macOS lần đầu",
      description: "Kiểm tra file cài, kéo AI Translator vào Applications và cho phép mở app bằng Open Anyway.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Cài đặt AI Translator trên macOS",
  lead: "Để cài AI Translator trên macOS, bạn mở file .dmg, kéo app vào thư mục Applications, rồi mở app lần đầu bằng cách cho phép nó trong System Settings › Privacy & Security (nút Open Anyway). Bước thêm này cần vì bản hiện tại được ký ad-hoc và chưa được Apple notarize.",
  meta: "<span>Áp dụng cho macOS 14.2 trở lên, Apple Silicon</span> <span>Cập nhật 08/10/2026</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
<h2 id="yeu-cau">Máy của bạn có chạy được không?</h2>
${facts([
  ["Chip", "Apple Silicon (M1 trở lên)<small>Không có bản cho Mac Intel. Xem chip ở menu Apple › About This Mac.</small>"],
  ["Hệ điều hành", "macOS 14.2 trở lên"],
  ["RAM", "Tối thiểu 8 GB, khuyến nghị 16 GB<small>Máy dưới 8 GB: app báo lý do và không cho tải model.</small>"],
  ["Bộ cài", "File .dmg khoảng 9 MB"],
  ["Ổ đĩa cho model", "1,3 GB (gói model Nhẹ) hoặc 2,5 GB (gói model Chuẩn)<small>Cộng thêm 1 GB trống khi tải.</small>"],
  ["Mạng", "Cần để tải model và đăng ký dùng thử Free<small>Sau đó dịch offline.</small>"],
])}
<p class="small muted">Chúng tôi chưa đo hiệu năng trên Mac M1 cơ bản nên chưa cam kết độ trễ ở máy đó. Với máy 8 GB, gói model Nhẹ là lựa chọn phù hợp.</p>

<h2 id="kiem-tra-file">Kiểm tra file cài đặt (SHA-256)</h2>
${callout({ kind: "warn", title: "Chỉ tải bản cài từ nguồn chính thức.", text: "File .dmg đúng là file chúng tôi gửi từ <strong>support@aitranslator.io.vn</strong> hoặc liên kết trên <strong>aitranslator.io.vn</strong>. File từ nơi khác có thể là bản giả hoặc bị sửa đổi. Đừng mở nó, dù nó mang tên AI Translator." })}
<p>Mỗi bản cài đi kèm một mã SHA-256 do chúng tôi gửi. Đối chiếu mã đó trước khi cài:</p>
<ol>
<li>Mở <strong>Terminal</strong> (trong Applications › Utilities).</li>
<li>Gõ <code>shasum -a 256</code> kèm một dấu cách, rồi kéo file .dmg từ Finder vào cửa sổ Terminal để tự điền đường dẫn (kể cả dấu cách trong tên file), rồi nhấn Enter. Hoặc gõ lệnh dưới đây; tên file có dấu cách thì phải để trong dấu nháy kép như ví dụ.</li>
</ol>
<div class="table-wrap"><pre><code>shasum -a 256 ~/Downloads/"&lt;tên-file&gt;.dmg"</code></pre></div>
<ol start="3">
<li>So chuỗi 64 ký tự hiện ra với mã chúng tôi gửi. Hai chuỗi phải giống hệt nhau.</li>
<li>Nếu khác, đừng mở file. Tải lại; nếu vẫn khác, <a href="/lien-he/">liên hệ hỗ trợ</a>.</li>
</ol>

<h2 id="keo-vao-applications">Kéo AI Translator vào Applications</h2>
<ol>
<li>Nhấp đúp file <code>.dmg</code> để mở.</li>
<li>Kéo <strong>AI Translator</strong> vào thư mục <strong>Applications</strong> trong cửa sổ vừa hiện.</li>
</ol>

<h2 id="mo-lan-dau">Mở lần đầu: vì sao macOS chặn và cách cho phép</h2>
<p>macOS dùng Gatekeeper để kiểm các app tải từ internet. Bản AI Translator hiện tại được ký ad-hoc và chưa được Apple notarize, vì chúng tôi chưa có Apple Developer ID. Vì vậy macOS chặn lần mở đầu và báo không xác minh được nhà phát triển. Với file đúng nguồn và SHA-256 khớp, đây là bước bình thường của bản này.</p>
<ol>
<li>Mở AI Translator từ Applications. Khi macOS báo không xác minh được nhà phát triển, bấm <strong>Done</strong> (nút đóng hộp thoại; tên nút có thể khác đôi chút giữa các bản macOS).</li>
<li>Mở <strong>System Settings › Privacy &amp; Security</strong>.</li>
<li>Kéo xuống cuối trang và bấm <strong>Open Anyway</strong> cạnh tên AI Translator.</li>
<li>Xác nhận bằng mật khẩu đăng nhập hoặc Touch ID.</li>
<li>App mở ra và hiện trình hướng dẫn lần đầu. Làm tiếp theo <a href="/huong-dan/bat-dau-nhanh/">hướng dẫn bắt đầu nhanh</a>.</li>
</ol>
${callout({ kind: "warn", title: "Từ macOS 15, mẹo bấm chuột phải › Open không còn dùng được.", text: "Hãy đi qua Privacy &amp; Security như các bước trên. Nút Open Anyway thường chỉ hiện sau khi macOS đã chặn một lần thử mở app; không thấy nút đó thì mở app thêm một lần rồi quay lại." })}
<p>Bước này áp dụng cho file .dmg tải về: lần đầu mở bản cài nào bạn cũng cần làm. Nếu bạn cài một file .dmg mới tải về, macOS có thể chặn lại. Khi chúng tôi có Developer ID và notarize app, bước này sẽ biến mất.</p>

<h2 id="cap-nhat">Mỗi lần cập nhật, macOS hỏi lại một số hộp thoại</h2>
<p>Đây là hệ quả của việc ký ad-hoc. Sau mỗi lần cập nhật sang bản mới, bạn thường gặp một lần:</p>
<ul>
<li><strong>Khoảng 5 hộp thoại Keychain</strong> (hỏi mật khẩu đăng nhập Mac; chúng tôi đo được 5 hộp thoại trên một Mac chạy macOS 26): nhập mật khẩu rồi chọn <strong>Always Allow</strong>. Đừng chọn Deny: app sẽ không đọc được bản quyền và hạn mức. Nếu lỡ chọn, hãy thoát hẳn app, mở lại và chọn Always Allow.</li>
<li><strong>1 hộp thoại quyền ghi âm thanh hệ thống</strong> (cũng là kết quả đo của chúng tôi): chọn cho phép.</li>
</ul>
<p>Sau đó các lần mở sau không hỏi nữa. Bạn không mất dữ liệu, gói hay hạn mức. Khi cài mới lần đầu, chúng tôi đo được không có hộp thoại Keychain (chỉ có Open Anyway và quyền ghi âm); nếu macOS vẫn hỏi, hãy chọn Always Allow. App báo trước điều này khi mời cập nhật: “Sau khi cập nhật, macOS sẽ hỏi mật khẩu đăng nhập vài lần và quyền ghi âm một lần…”. Việc này sẽ hết khi chúng tôi có Developer ID. Bản .dmg gửi tay trong giai đoạn beta có thể chưa tự cập nhật; khi đó bạn tải file .dmg mới.</p>

<h2 id="go-cai-dat">Gỡ cài đặt đúng cách</h2>
<p>macOS không có bước nào hỏi khi bạn xóa app, nên hãy xóa model và dữ liệu trước khi kéo app vào Thùng rác:</p>
<ol>
<li>Mở AI Translator, vào <strong>Cài đặt › Quyền riêng tư</strong>.</li>
<li>Bấm <strong>Xóa model và dữ liệu</strong>, rồi xác nhận <strong>Xóa hết</strong>. App xóa mọi model đã tải (1,3 hoặc 2,5 GB), lịch sử và từ điển thuật ngữ.</li>
<li>Chọn <strong>Thoát</strong> ở biểu tượng AI Translator trên menu bar.</li>
<li>Kéo <strong>AI Translator</strong> từ Applications vào Thùng rác.</li>
</ol>
<p>Bản quyền và hạn mức còn lại được giữ, nên cài lại thường không làm mất gói đã mua. Dùng thử Free tính theo máy, nên cài lại không mở lại 10 ngày dùng thử. Nếu đã xóa app mà chưa xóa model, thư mục model nằm ở <code>~/Library/Application Support/com.aitranslator.desktop/models</code>.</p>

<h2 id="loi-thuong-gap">Lỗi thường gặp khi cài</h2>
<ul>
<li><strong>Không thấy nút Open Anyway.</strong> Mở app thêm một lần để macOS ghi nhận lần chặn, rồi vào lại Privacy &amp; Security.</li>
<li><strong>Mac Intel không cài được.</strong> AI Translator chỉ có bản cho Apple Silicon.</li>
<li><strong>App báo “Máy này có RAM dưới 8 GB, AI Translator chưa hỗ trợ.”</strong> Máy dưới 8 GB RAM không tải được model.</li>
<li><strong>App báo “Bản cài AI Translator này không chính hãng nên chỉ dùng được Free.”</strong> Bản cài đã bị thay đổi hoặc không đúng nguồn. Tải lại từ nguồn chính thức.</li>
<li><strong>macOS hỏi Keychain nhiều lần sau khi cập nhật.</strong> Bình thường với bản ký ad-hoc: nhập mật khẩu, chọn Always Allow.</li>
</ul>
<p>Sau khi cài xong, nếu phụ đề không hiện, xem <a href="/huong-dan/cap-quyen-thu-am-macos/">cách cấp quyền ghi âm thanh hệ thống</a>.</p>

${docNav(
  [
    { href: "/huong-dan/bat-dau-nhanh/", kicker: "Bài trước", title: "Bắt đầu nhanh với AI Translator" },
    { href: "/huong-dan/cap-quyen-thu-am-macos/", kicker: "Bài sau", title: "Cấp quyền ghi âm thanh hệ thống trên macOS" },
    { href: "/huong-dan/khac-phuc-su-co/", kicker: "Liên quan", title: "Khắc phục sự cố" },
  ],
  "Bài liên quan",
)}
`,
})}
</div></section>
`,
};
