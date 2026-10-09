import { pageHero, callout, facts, docLayout, docNav, cmdBlock } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Cài đặt trên macOS", path: "/huong-dan/cai-dat-macos/" },
];

const toc = [
  { level: 2, id: "yeu-cau", text: "Máy của bạn có chạy được không?" },
  { level: 2, id: "cai-bang-lenh", text: "Cách nhanh: cài bằng một dòng lệnh" },
  { level: 2, id: "cai-bang-dmg", text: "Cách khác: cài từ file .dmg" },
  { level: 3, id: "kiem-tra-file", text: "Kiểm tra file cài đặt (SHA-256)" },
  { level: 3, id: "keo-vao-applications", text: "Kéo AI Translator vào Applications" },
  { level: 3, id: "mo-lan-dau", text: "Mở lần đầu: vì sao bị chặn" },
  { level: 2, id: "cap-nhat", text: "Mỗi lần cập nhật" },
  { level: 2, id: "go-cai-dat", text: "Gỡ cài đặt đúng cách" },
  { level: 2, id: "loi-thuong-gap", text: "Lỗi thường gặp khi cài" },
];

const INSTALL_CMD = "curl -fsSL https://aitranslator.io.vn/install.sh | bash";

const HOWTO_STEPS = [
  { name: "Mở Terminal", text: "Nhấn Command + Space, gõ Terminal rồi nhấn Enter." },
  { name: "Dán lệnh cài và nhấn Enter", text: "Dán lệnh curl -fsSL https://aitranslator.io.vn/install.sh | bash vào Terminal rồi nhấn Enter. Không cần mật khẩu." },
  { name: "Chờ app mở", text: "Lệnh tải bản mới nhất, kiểm SHA-256, chép AI Translator vào Applications và mở app. Khi macOS hỏi quyền ghi âm thanh hệ thống, chọn cho phép." },
];

export default {
  id: "guide-install-macos",
  lang: "vi",
  path: "/huong-dan/cai-dat-macos/",
  title: "Cài đặt AI Translator trên macOS",
  description:
    "Cài AI Translator trên macOS bằng một dòng lệnh, mở thẳng không cần Open Anyway; cách cài từ file .dmg, kiểm SHA-256, việc cần làm khi cập nhật và gỡ cài đặt.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-09",
  llm: "Cài AI Translator trên macOS bằng một dòng lệnh Terminal (curl ... install.sh | bash), mở thẳng không cần Open Anyway. Cách khác: cài từ file .dmg (kiểm SHA-256, kéo vào Applications, bấm Open Anyway vì bản ký ad-hoc chưa notarize), hộp thoại Keychain khi cập nhật và gỡ cài đặt.",
  llmTitle: "Cài đặt AI Translator trên macOS",
  schema: [
    howTo({
      name: "Cài và mở AI Translator trên macOS bằng một dòng lệnh",
      description: "Dán một dòng lệnh vào Terminal để tải, kiểm tra và cài AI Translator, rồi app mở thẳng, không cần Open Anyway.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Cài đặt AI Translator trên macOS",
  lead: "Cách nhanh nhất để cài AI Translator trên macOS là dán một dòng lệnh vào Terminal: app được tải, kiểm tra và mở lên ngay, không cần vào System Settings bấm Open Anyway. Nếu bạn đã có file .dmg tải bằng trình duyệt, bạn vẫn cài được bằng cách kéo vào Applications, nhưng lần mở đầu macOS sẽ chặn vì bản hiện tại ký ad-hoc và chưa được Apple notarize.",
  meta: "<span>Áp dụng cho macOS 14.2 trở lên, Apple Silicon</span> <span>Cập nhật 09/10/2026</span>",
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

<h2 id="cai-bang-lenh">Cách nhanh: cài bằng một dòng lệnh</h2>
<ol>
<li>Mở <strong>Terminal</strong>: nhấn <kbd>⌘</kbd> + <kbd>Space</kbd>, gõ <strong>Terminal</strong>, nhấn Enter.</li>
<li>Dán lệnh dưới đây rồi nhấn Enter. Không cần mật khẩu.</li>
</ol>
${cmdBlock({ cmd: INSTALL_CMD, copy: "Sao chép lệnh", copied: "Đã chép", label: "Lệnh cài AI Translator trên macOS" })}
<ol start="3">
<li>Chờ khoảng một phút. Lệnh tải bản mới nhất của AI Translator, đối chiếu mã SHA-256, kiểm chữ ký của app, chép app vào <code>/Applications</code> (không ghi được thì vào <code>~/Applications</code>) rồi mở app.</li>
<li>Khi macOS hỏi quyền <strong>ghi âm thanh hệ thống</strong>, chọn cho phép. Rồi làm tiếp theo <a href="/huong-dan/bat-dau-nhanh/">hướng dẫn bắt đầu nhanh</a>.</li>
</ol>
<p><strong>Vì sao không phải bấm Open Anyway?</strong> macOS chỉ chặn app khi file mang nhãn “tải từ internet” (do trình duyệt gắn). File tải bằng <code>curl</code> trong Terminal không có nhãn đó, nên app mở thẳng dù chưa được Apple notarize.</p>
${callout({ kind: "warn", title: "Hãy hiểu những gì lệnh này làm.", text: "Lệnh tải một script từ <strong>aitranslator.io.vn</strong>, script tải bản cài từ <strong>releases.aitranslator.io.vn</strong>, đối chiếu SHA-256 rồi cài. Không dùng sudo, không gửi dữ liệu đi. Mã SHA-256 nằm cùng máy chủ với file nên chủ yếu chống file hỏng; bạn vẫn đang tin nguồn <strong>aitranslator.io.vn</strong>. Muốn đọc script trước: <code>curl -fsSL https://aitranslator.io.vn/install.sh -o install.sh && less install.sh && bash install.sh</code>. Chạy lại đúng lệnh cài bất cứ lúc nào để cập nhật lên bản mới nhất; script tự đóng app đang chạy." })}
<p>Gặp lỗi? Script dừng và báo lý do bằng tiếng Việt (máy không đạt yêu cầu, mất mạng, SHA-256 không khớp…). Xem thêm ở <a href="#loi-thuong-gap">lỗi thường gặp khi cài</a>.</p>

<h2 id="cai-bang-dmg">Cách khác: cài từ file .dmg</h2>
<p>Dùng cách này nếu bạn nhận file .dmg qua email hoặc không muốn dùng Terminal. File tải bằng trình duyệt bị macOS gắn nhãn “tải từ internet”, nên lần mở đầu cần thêm bước Open Anyway.</p>

<h3 id="kiem-tra-file">Kiểm tra file cài đặt (SHA-256)</h3>
${callout({ kind: "warn", title: "Chỉ tải bản cài từ nguồn chính thức.", text: "File .dmg đúng là file chúng tôi gửi từ <strong>support@aitranslator.io.vn</strong> hoặc liên kết trên <strong>aitranslator.io.vn</strong>. File từ nơi khác có thể là bản giả hoặc bị sửa đổi. Đừng mở nó, dù nó mang tên AI Translator." })}
<p>Mỗi bản cài gửi qua email đi kèm một mã SHA-256 do chúng tôi gửi. Đối chiếu mã đó trước khi cài:</p>
<ol>
<li>Mở <strong>Terminal</strong> (trong Applications › Utilities).</li>
<li>Gõ <code>shasum -a 256</code> kèm một dấu cách, rồi kéo file .dmg từ Finder vào cửa sổ Terminal để tự điền đường dẫn (kể cả dấu cách trong tên file), rồi nhấn Enter. Hoặc gõ lệnh dưới đây; tên file có dấu cách thì phải để trong dấu nháy kép như ví dụ.</li>
</ol>
<div class="table-wrap"><pre><code>shasum -a 256 ~/Downloads/"&lt;tên-file&gt;.dmg"</code></pre></div>
<ol start="3">
<li>So chuỗi 64 ký tự hiện ra với mã chúng tôi gửi. Hai chuỗi phải giống hệt nhau.</li>
<li>Nếu khác, đừng mở file. Tải lại; nếu vẫn khác, <a href="/lien-he/">liên hệ hỗ trợ</a>.</li>
</ol>

<h3 id="keo-vao-applications">Kéo AI Translator vào Applications</h3>
<ol>
<li>Nhấp đúp file <code>.dmg</code> để mở.</li>
<li>Kéo <strong>AI Translator</strong> vào thư mục <strong>Applications</strong> trong cửa sổ vừa hiện.</li>
</ol>

<h3 id="mo-lan-dau">Mở lần đầu: vì sao macOS chặn và cách cho phép</h3>
<p>macOS dùng Gatekeeper để kiểm các app tải từ internet. Bản AI Translator hiện tại được ký ad-hoc và chưa được Apple notarize, vì chúng tôi chưa có Apple Developer ID. Vì vậy macOS chặn lần mở đầu và báo không xác minh được nhà phát triển. Với file đúng nguồn và SHA-256 khớp, đây là bước bình thường của bản này.</p>
<ol>
<li>Mở AI Translator từ Applications. Khi macOS báo không xác minh được nhà phát triển, bấm <strong>Done</strong> (nút đóng hộp thoại; tên nút có thể khác đôi chút giữa các bản macOS).</li>
<li>Mở <strong>System Settings › Privacy &amp; Security</strong>.</li>
<li>Kéo xuống cuối trang và bấm <strong>Open Anyway</strong> cạnh tên AI Translator.</li>
<li>Xác nhận bằng mật khẩu đăng nhập hoặc Touch ID.</li>
<li>App mở ra và hiện trình hướng dẫn lần đầu. Làm tiếp theo <a href="/huong-dan/bat-dau-nhanh/">hướng dẫn bắt đầu nhanh</a>.</li>
</ol>
${callout({ kind: "warn", title: "Từ macOS 15, mẹo bấm chuột phải › Open không còn dùng được.", text: "Hãy đi qua Privacy &amp; Security như các bước trên. Nút Open Anyway thường chỉ hiện sau khi macOS đã chặn một lần thử mở app; không thấy nút đó thì mở app thêm một lần rồi quay lại." })}
<p>Bước này chỉ áp dụng cho file .dmg tải bằng trình duyệt; cài bằng <a href="#cai-bang-lenh">dòng lệnh</a> thì không cần. Khi chúng tôi có Developer ID và notarize app, bước này sẽ biến mất cho mọi cách cài.</p>

<h2 id="cap-nhat">Mỗi lần cập nhật, macOS hỏi lại một hộp thoại</h2>
<p>Đây là hệ quả của việc ký ad-hoc: mỗi bản mới có chữ ký khác, nên macOS hỏi lại quyền truy cập Keychain. Từ bản 0.1.1, AI Translator cất mọi dữ liệu nhạy cảm của nó (khóa mã hóa lịch sử, token bản quyền, bộ đếm hạn mức) trong <strong>một</strong> mục Keychain, nên sau mỗi lần cập nhật bạn chỉ gặp:</p>
<ul>
<li><strong>1 hộp thoại Keychain</strong> (hỏi mật khẩu đăng nhập Mac; chúng tôi đo trên một Mac chạy macOS 26, hai lần cập nhật liên tiếp đều chỉ có 1 hộp thoại): nhập mật khẩu rồi chọn <strong>Always Allow</strong>. Đừng chọn Deny: app sẽ không đọc được bản quyền và hạn mức. Nếu lỡ chọn, hãy thoát hẳn app, mở lại và chọn Always Allow.</li>
<li>Quyền <strong>ghi âm thanh hệ thống</strong> có thể được hỏi lại một lần (lần đo trước của chúng tôi ghi nhận 1 hộp thoại): chọn cho phép.</li>
</ul>
<p><strong>Riêng lần cập nhật đầu tiên từ bản 0.1.0 lên 0.1.1</strong>, app phải chép 5 mục Keychain cũ sang mục mới, nên bạn gặp 5 hộp thoại Keychain một lần (chúng tôi đo được đúng 5, kèm 1 hộp thoại cho phép ghi âm); từ các lần sau chỉ còn 1.</p>
<p>Sau khi chọn Always Allow, các lần mở sau không hỏi nữa. Bạn không mất dữ liệu, gói hay hạn mức. Khi cài mới lần đầu, chúng tôi đo được không có hộp thoại Keychain (chỉ có quyền ghi âm; thêm Open Anyway nếu cài từ file .dmg tải bằng trình duyệt); nếu macOS vẫn hỏi, hãy chọn Always Allow. App báo trước điều này khi mời cập nhật. Việc này sẽ hết khi chúng tôi có Developer ID. Bạn cũng có thể chạy lại đúng lệnh cài để cập nhật; hộp thoại Keychain vẫn hiện vì cùng lý do.</p>

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
<li><strong>Lệnh cài báo “không đọc được latest.json”.</strong> Máy mất mạng, hoặc đang đặt proxy/VPN chặn <code>releases.aitranslator.io.vn</code>. Kiểm tra mạng rồi chạy lại.</li>
<li><strong>Lệnh cài báo “SHA-256 của file tải về không khớp”.</strong> File tải bị lỗi hoặc bị can thiệp trên đường truyền. Script không cài gì; chạy lại, nếu vẫn lệch thì báo <a href="/lien-he/">hỗ trợ</a>.</li>
<li><strong>Lệnh cài báo “vẫn đang chạy”.</strong> Thoát hẳn AI Translator (menu AI Translator trên thanh menu › Thoát) rồi chạy lại lệnh.</li>
<li><strong>Lệnh cài báo cần Apple Silicon hoặc macOS 14.2.</strong> Máy chưa đạt yêu cầu; không có bản cho Mac Intel.</li>
<li><strong>Không thấy nút Open Anyway.</strong> (Chỉ gặp khi cài từ file .dmg tải bằng trình duyệt.) Mở app thêm một lần để macOS ghi nhận lần chặn, rồi vào lại Privacy &amp; Security.</li>
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
