import { pageHero, callout, facts, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Cài đặt trên Windows", path: "/huong-dan/cai-dat-windows/" },
];

const toc = [
  { level: 2, id: "yeu-cau", text: "Máy của bạn có chạy được không?" },
  { level: 2, id: "kiem-tra-file", text: "Kiểm tra file cài đặt (SHA-256)" },
  { level: 2, id: "chay-bo-cai", text: "Chạy bộ cài và qua SmartScreen" },
  { level: 2, id: "mo-lan-dau", text: "Mở lần đầu" },
  { level: 2, id: "cap-nhat", text: "Cập nhật" },
  { level: 2, id: "go-cai-dat", text: "Gỡ cài đặt đúng cách" },
  { level: 2, id: "loi-thuong-gap", text: "Lỗi thường gặp khi cài" },
];

const HOWTO_STEPS = [
  { name: "Kiểm tra mã SHA-256 của file .exe", text: "Chạy Get-FileHash -Algorithm SHA256 trên file .exe trong PowerShell và so với mã SHA-256 chúng tôi gửi kèm bản cài." },
  { name: "Mở bộ cài", text: "Nhấp đúp file AI Translator_<phiên bản>_x64-setup.exe vừa tải về." },
  { name: "Bấm More info nếu SmartScreen hiện", text: "Nếu Windows hiện màn hình xanh “Windows protected your PC”, bấm More info và kiểm dòng App là đúng tên file cài." },
  { name: "Bấm Run anyway", text: "Bấm Run anyway để chạy bộ cài. Dòng Publisher hiện Unknown publisher là bình thường với bản chưa ký mã." },
  { name: "Cài xong và mở app", text: "Làm theo bộ cài tới khi xong, không cần quyền quản trị. Mở AI Translator và làm theo trình hướng dẫn lần đầu." },
];

export default {
  id: "guide-install-windows",
  lang: "vi",
  path: "/huong-dan/cai-dat-windows/",
  title: "Cài đặt AI Translator trên Windows",
  description:
    "Cách cài AI Translator trên Windows 10/11: yêu cầu máy, kiểm tra SHA-256, qua cảnh báo SmartScreen bằng Run anyway, mở lần đầu, cập nhật và gỡ cài đặt.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Cài AI Translator trên Windows 10/11 x64: yêu cầu máy, kiểm SHA-256 bằng PowerShell, bộ cài .exe không cần quyền quản trị, bấm More info › Run anyway nếu SmartScreen cảnh báo vì bản chưa ký mã, mở lần đầu, cập nhật và gỡ cài đặt.",
  llmTitle: "Cài đặt AI Translator trên Windows",
  schema: [
    howTo({
      name: "Cài và mở AI Translator trên Windows lần đầu",
      description: "Kiểm tra file cài, chạy bộ cài .exe và qua cảnh báo Microsoft Defender SmartScreen nếu nó hiện.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Cài đặt AI Translator trên Windows",
  lead: "Để cài AI Translator trên Windows, bạn kiểm mã SHA-256 của file .exe rồi nhấp đúp để chạy bộ cài. Bộ cài không cần quyền quản trị. Vì bản beta chưa được ký mã, Microsoft Defender SmartScreen có thể hiện màn hình cảnh báo: bấm More info rồi Run anyway.",
  meta: "<span>Áp dụng cho Windows 10 và 11, 64-bit (x64)</span> <span>Cập nhật 08/10/2026</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
<h2 id="yeu-cau">Máy của bạn có chạy được không?</h2>
${facts([
  ["Hệ điều hành", "Windows 10 hoặc 11, 64-bit (x64)<small>Chưa hỗ trợ Windows ARM64.</small>"],
  ["CPU", "Có AVX2<small>CPU không có AVX2: app báo lý do và không cho tải model.</small>"],
  ["RAM", "Tối thiểu 8 GB, khuyến nghị 16 GB<small>Máy dưới 8 GB: app báo lý do và không cho tải model.</small>"],
  ["Đồ họa", "Khuyến nghị card đồ họa rời, VRAM từ 6 GB cho gói model Chuẩn<small>Không có thì chạy bằng CPU.</small>"],
  ["Bộ cài", "Một file .exe dưới 60 MB<small>Cài cho riêng tài khoản Windows của bạn, không cần quyền quản trị.</small>"],
  ["Ổ đĩa cho model", "1,3 GB (gói model Nhẹ) hoặc 2,5 GB (gói model Chuẩn)<small>Cộng thêm 1 GB trống khi tải.</small>"],
  ["Mạng", "Cần để tải model và đăng ký dùng thử Free<small>Có thể cần cả lúc cài (xem bên dưới). Sau đó dịch offline.</small>"],
])}
<p class="small muted">Trong giai đoạn thử nghiệm nội bộ, chúng tôi đã thử thu âm thanh hệ thống và thanh phụ đề trên Windows 11. Chúng tôi chưa đo trên Windows: độ trễ, kiểm tra kết nối mạng bằng proxy, từng app họp cụ thể với bản phát hành, màn hình DPI cao và nhiều màn hình. Vì vậy chúng tôi chưa cam kết độ trễ nào trên Windows. Máy không có card rời đủ mạnh nên dùng gói model Nhẹ.</p>

<h2 id="kiem-tra-file">Kiểm tra file cài đặt (SHA-256)</h2>
${callout({ kind: "warn", title: "Chỉ tải bản cài từ nguồn chính thức.", text: "File .exe đúng là file chúng tôi gửi từ <strong>support@aitranslator.io.vn</strong> hoặc liên kết trên <strong>aitranslator.io.vn</strong>. File từ nơi khác có thể là bản giả hoặc bị sửa đổi. Đừng chạy nó, dù nó mang tên AI Translator." })}
<p>Mỗi bản cài đi kèm một mã SHA-256 do chúng tôi gửi. Vì bản Windows chưa được ký mã, đối chiếu mã này là cách để bạn chắc file không bị thay đổi. Làm trước khi cài:</p>
<ol>
<li>Mở <strong>PowerShell</strong>: bấm Start, gõ <code>PowerShell</code> rồi mở <strong>Windows PowerShell</strong>.</li>
<li>Gõ lệnh dưới đây, thay <code>&lt;tên-file&gt;</code> bằng tên file bạn tải về, rồi nhấn Enter. Tên file có dấu cách nên phải giữ cả đường dẫn trong dấu nháy kép như ví dụ.</li>
</ol>
<div class="table-wrap"><pre><code>Get-FileHash -Algorithm SHA256 "$env:USERPROFILE\\Downloads\\&lt;tên-file&gt;.exe"</code></pre></div>
<ol start="3">
<li>So chuỗi 64 ký tự ở cột <strong>Hash</strong> với mã chúng tôi gửi. PowerShell in chữ hoa; chữ hoa hay chữ thường không quan trọng, các ký tự phải giống hệt nhau.</li>
<li>Nếu khác, đừng chạy file. Tải lại; nếu vẫn khác, <a href="/lien-he/">liên hệ hỗ trợ</a>.</li>
</ol>

<h2 id="chay-bo-cai">Chạy bộ cài và qua cảnh báo SmartScreen</h2>
<p>Bộ cài là một file tên dạng <code>AI Translator_&lt;phiên bản&gt;_x64-setup.exe</code>. Nó cài AI Translator cho riêng tài khoản Windows của bạn, vào thư mục <code>%LOCALAPPDATA%\\AI Translator\\</code>, nên không cần quyền quản trị và không hiện hộp thoại hỏi quyền quản trị (UAC). Bộ cài hiện bằng tiếng Việt hoặc tiếng Anh theo ngôn ngữ của Windows.</p>
<p><strong>Nếu trình duyệt cảnh báo khi tải.</strong> Trình duyệt có thể báo file này ít người tải. Trên Microsoft Edge, bấm “…” cạnh file trong danh sách tải xuống › <strong>Keep</strong> › <strong>Show more</strong> › <strong>Keep anyway</strong>. Trên Chrome, bấm <strong>Keep</strong>. Chỉ làm vậy với file đúng nguồn.</p>
<ol>
<li>Nhấp đúp file <code>.exe</code> vừa tải (thường nằm trong thư mục Downloads).</li>
<li>Nếu Windows hiện màn hình xanh <strong>“Windows protected your PC”</strong> (Microsoft Defender SmartScreen), bấm <strong>More info</strong>.</li>
<li>Kiểm dòng <strong>App</strong>: phải là đúng tên file cài bạn vừa kiểm SHA-256. Dòng <strong>Publisher</strong> hiện <strong>Unknown publisher</strong>: bình thường với bản chưa ký mã.</li>
<li>Bấm <strong>Run anyway</strong>.</li>
<li>Làm theo bộ cài tới khi xong. Nếu máy thiếu một thành phần hiển thị của Windows mà app cần, bộ cài tự tải về, nên lúc này cần có mạng (Windows 11 thường đã có sẵn thành phần này).</li>
</ol>
<p>Nếu không hiện màn hình xanh, cứ cài bình thường. Tên nút có thể khác nếu Windows dùng tiếng Việt.</p>
${callout({ kind: "warn", title: "Vì sao Windows cảnh báo?", text: "SmartScreen cảnh báo các file chưa ký mã hoặc còn ít người tải. Bản Windows hiện tại chưa được ký mã vì chúng tôi chưa có chứng thư ký mã Windows (cũng như bản macOS chưa có Apple Developer ID). Với file đúng nguồn và SHA-256 khớp, đây là bước bình thường của bản này. Khi có chứng thư ký mã, cảnh báo sẽ giảm dần; SmartScreen cần thời gian để ghi nhận uy tín của một file mới, nên chúng tôi không hứa nó biến mất ngay." })}

<h2 id="mo-lan-dau">Mở lần đầu</h2>
<ol>
<li>Mở <strong>AI Translator</strong> từ menu Start.</li>
<li>App hiện trình hướng dẫn lần đầu. Trên Windows không có bước cấp quyền ghi âm: app thu âm thanh đang phát trên máy mà không cần quyền riêng, và không dùng micro.</li>
<li>Làm tiếp theo <a href="/huong-dan/bat-dau-nhanh/">hướng dẫn bắt đầu nhanh</a>.</li>
</ol>
<p>AI Translator nằm ở khay hệ thống. Đóng cửa sổ chỉ ẩn app đi; muốn thoát hẳn thì chọn <strong>Thoát</strong> ở biểu tượng trong khay. Windows có thể giấu biểu tượng mới sau mũi tên <strong>^</strong> trên taskbar: kéo biểu tượng ra taskbar, hoặc bật nó trong cài đặt Taskbar. Phím tắt trên Windows dùng Ctrl+Alt (xem <a href="/huong-dan/thanh-phu-de-va-phim-tat/">thanh phụ đề và phím tắt</a>).</p>

<h2 id="cap-nhat">Cập nhật</h2>
<p>Bản cài gửi tay trong giai đoạn beta có thể chưa tự cập nhật. Khi đó chúng tôi gửi bản cài mới qua email kèm mã SHA-256 mới: kiểm mã rồi chạy bộ cài như lần đầu. SmartScreen có thể cảnh báo lại với file mới.</p>

<h2 id="go-cai-dat">Gỡ cài đặt đúng cách</h2>
<ol>
<li>Mở AI Translator, vào <strong>Cài đặt › Quyền riêng tư</strong>.</li>
<li>Bấm <strong>Xóa model và dữ liệu</strong>, rồi xác nhận <strong>Xóa hết</strong>. App xóa mọi model đã tải (1,3 hoặc 2,5 GB), lịch sử và từ điển thuật ngữ.</li>
<li>Chọn <strong>Thoát</strong> ở biểu tượng AI Translator trong khay hệ thống.</li>
<li>Mở <strong>Settings › Apps › Installed apps</strong>, tìm <strong>AI Translator</strong>, bấm <strong>Uninstall</strong>.</li>
</ol>
<p>Bộ gỡ có ô xóa dữ liệu app: đánh dấu ô này thì model cũng bị xóa, kể cả khi bạn bỏ qua bước 1–2. Bản quyền và hạn mức còn lại được giữ, nên cài lại thường không làm mất gói đã mua. Dùng thử Free tính theo máy, nên cài lại không mở lại 10 ngày dùng thử. Dữ liệu và model nằm ở <code>%LOCALAPPDATA%\\com.aitranslator.desktop\\</code> (model ở thư mục con <code>models</code>); khóa, token và bộ đếm hạn mức nằm trong Credential Manager.</p>

<h2 id="loi-thuong-gap">Lỗi thường gặp khi cài</h2>
<ul>
<li><strong>SmartScreen không có nút Run anyway.</strong> Có thể do chính sách của máy (ví dụ máy do công ty hoặc trường học quản lý) không cho chạy app chưa ký mã. Hãy hỏi quản trị viên của máy.</li>
<li><strong>Phần mềm diệt virus chặn hoặc xóa bộ cài.</strong> Kiểm lại mã SHA-256. Nếu mã khớp mà vẫn bị chặn, <a href="/lien-he/">liên hệ hỗ trợ</a> và cho chúng tôi biết tên phần mềm diệt virus.</li>
<li><strong>App báo “Bộ xử lý của máy này không có AVX2, là tập lệnh AI Translator cần.”</strong> CPU không có AVX2 nên không tải được model.</li>
<li><strong>App báo “Máy này có RAM dưới 8 GB, AI Translator chưa hỗ trợ.”</strong> Máy dưới 8 GB RAM không tải được model.</li>
<li><strong>Máy Windows ARM64.</strong> Chưa hỗ trợ: hiện chỉ có bản cho Windows 64-bit (x64), chúng tôi chưa thử trên máy ARM64.</li>
<li><strong>App báo “Bản cài AI Translator này không chính hãng nên chỉ dùng được Free.”</strong> Bản cài đã bị thay đổi hoặc không đúng nguồn. Tải lại từ nguồn chính thức.</li>
</ul>
<p>Sau khi cài xong, nếu phụ đề không hiện, xem <a href="/huong-dan/khac-phuc-su-co/">khắc phục sự cố</a>.</p>

${docNav(
  [
    { href: "/huong-dan/bat-dau-nhanh/", kicker: "Bài trước", title: "Bắt đầu nhanh với AI Translator" },
    { href: "/huong-dan/thanh-phu-de-va-phim-tat/", kicker: "Bài sau", title: "Thanh phụ đề và phím tắt" },
    { href: "/huong-dan/khac-phuc-su-co/", kicker: "Liên quan", title: "Khắc phục sự cố" },
  ],
  "Bài liên quan",
)}
`,
})}
</div></section>
`,
};
