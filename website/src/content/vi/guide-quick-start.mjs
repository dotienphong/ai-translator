import { pageHero, callout, appShot, overlayShot, facts, keys, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Bắt đầu nhanh", path: "/huong-dan/bat-dau-nhanh/" },
];

const toc = [
  { level: 2, id: "chuan-bi", text: "Bạn cần chuẩn bị gì?" },
  { level: 2, id: "cai-va-mo", text: "Cài app và mở lần đầu" },
  { level: 2, id: "thiet-lap", text: "Thiết lập lần đầu: bảy bước" },
  { level: 2, id: "dich-dau-tien", text: "Dịch cuộc họp đầu tiên" },
  { level: 2, id: "loi-thuong-gap", text: "Lỗi thường gặp ở lần đầu" },
];

// Văn bản thuần cho dữ liệu có cấu trúc HowTo; phần hiển thị nằm trong body.
const HOWTO_STEPS = [
  { name: "Cài app và mở lần đầu", text: "Trên macOS, dán dòng lệnh cài (curl -fsSL https://aitranslator.io.vn/install.sh | bash) vào Terminal: app được tải, kiểm tra và mở thẳng, không cần Open Anyway. Trên Windows, dán lệnh cài (irm https://aitranslator.io.vn/install.ps1 | iex) vào PowerShell; nếu bạn dùng file .exe tải bằng trình duyệt và SmartScreen cảnh báo, bấm More info rồi Run anyway." },
  { name: "Chọn ngôn ngữ giao diện", text: "Chọn Tiếng Việt hoặc English rồi bấm Tiếp. Lựa chọn này cũng đặt ngôn ngữ đích mặc định." },
  { name: "Đồng ý điều khoản", text: "Đọc Thỏa thuận cấp phép (EULA) và Chính sách quyền riêng tư, tick ô đồng ý rồi bấm Tiếp. Cần mạng một lần để bắt đầu dùng thử Free." },
  { name: "Chọn và tải model", text: "Chọn gói model Chuẩn (khoảng 2,5 GB) hoặc gói model Nhẹ (khoảng 1,3 GB) theo đề xuất của app và chờ tải xong." },
  { name: "Cho phép ghi âm thanh hệ thống (chỉ macOS)", text: "Khi macOS hỏi quyền Ghi âm thanh hệ thống, chọn cho phép. App không dùng micro. Trên Windows không có bước này." },
  { name: "Chọn ngôn ngữ", text: "Chọn ngôn ngữ muốn đọc ở ô Dịch sang và các ngôn ngữ có thể được nói trong cuộc họp." },
  { name: "Nghe thử", text: "Bấm Phát câu mẫu để thấy phụ đề hiện trên thanh phụ đề." },
  { name: "Đọc ghi chú và hoàn tất", text: "Đọc ghi chú quyền riêng tư và việc app chạy ở menu bar (macOS) hoặc khay hệ thống (Windows), rồi bấm Bắt đầu dùng AI Translator." },
  { name: "Dịch cuộc họp đầu tiên", text: "Mở cuộc họp hoặc video có tiếng, bấm Bắt đầu và đọc phụ đề trên thanh nổi. Bấm Dừng khi xong, rồi mở bản chép lời nếu cần." },
];

export default {
  id: "guide-quick-start",
  lang: "vi",
  path: "/huong-dan/bat-dau-nhanh/",
  title: "Bắt đầu nhanh với AI Translator trên macOS và Windows",
  description:
    "Hướng dẫn bắt đầu nhanh AI Translator trên macOS và Windows: cài app, tải model, nghe thử rồi dịch cuộc họp đầu tiên bằng phụ đề trực tiếp.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Hướng dẫn từ lúc nhận bản cài đến phụ đề đầu tiên trên macOS và Windows: cài app, bảy bước thiết lập lần đầu, bắt đầu dịch, thanh phụ đề, bản chép lời và lỗi thường gặp.",
  llmTitle: "Bắt đầu nhanh với AI Translator",
  schema: [
    howTo({
      name: "Cài AI Translator và dịch cuộc họp đầu tiên",
      description: "Các bước từ file cài đặt tới phụ đề dịch đầu tiên: cài app, thiết lập lần đầu, bắt đầu dịch.",
      steps: HOWTO_STEPS,
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Bắt đầu nhanh với AI Translator",
  lead: "Để dùng AI Translator lần đầu, bạn cài app, đi qua bảy bước thiết lập một lần (ngôn ngữ, điều khoản, tải model, quyền ghi âm trên macOS, nghe thử), rồi bấm Bắt đầu khi cuộc họp có tiếng. Phụ đề dịch hiện trên một thanh nổi; nhận dạng giọng nói và dịch đều chạy trên máy bạn.",
  meta: "<span>Áp dụng cho macOS 14.2 trở lên (Apple Silicon) và Windows 10/11 64-bit</span> <span>Cập nhật 08/10/2026</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
<h2 id="chuan-bi">Bạn cần chuẩn bị gì?</h2>
${facts([
  ["macOS", "14.2 trở lên, Apple Silicon (M1 trở lên)<small>Chưa có bản cho Mac Intel.</small>"],
  ["Windows", "Windows 10 hoặc 11, 64-bit (x64), CPU có AVX2<small>Chưa hỗ trợ Windows ARM64.</small>"],
  ["RAM", "Tối thiểu 8 GB, khuyến nghị 16 GB"],
  ["Bản cài", "macOS: file .dmg khoảng 9 MB · Windows: file .exe khoảng 22 MB<small>Cả hai cài bằng một dòng lệnh ở trang <a href=\"/tai-xuong/\">Tải xuống</a></small>"],
  ["Ổ đĩa", "1,3 GB (gói model Nhẹ) hoặc 2,5 GB (gói model Chuẩn)<small>Cộng thêm 1 GB trống khi tải model</small>"],
  ["Mạng", "Cần để tải model và đăng ký dùng thử Free<small>Sau đó nhận dạng và dịch chạy offline</small>"],
])}
${callout({ title: "Dùng Windows?", text: "Các bước dưới đây giống nhau trên Windows, trừ vài điểm: cài bằng dòng lệnh PowerShell (hoặc file .exe, SmartScreen có thể cảnh báo vì bản Windows chưa được ký mã), không có bước cấp quyền ghi âm, app nằm ở khay hệ thống thay cho menu bar, và phím tắt dùng Ctrl+Alt thay cho ⌃⌥." })}

<h2 id="cai-va-mo">Cài app và mở lần đầu</h2>
<p><strong>Trên macOS:</strong></p>
<ol>
<li>Mở <strong>Terminal</strong> (nhấn <kbd>⌘</kbd> + <kbd>Space</kbd>, gõ Terminal, nhấn Enter).</li>
<li>Dán lệnh cài ở trang <a href="/tai-xuong/#cai-macos">Tải xuống</a> rồi nhấn Enter: <code>curl -fsSL https://aitranslator.io.vn/install.sh | bash</code>.</li>
<li>Chờ khoảng một phút. App được tải, kiểm tra, chép vào Applications và mở thẳng. Nếu macOS hỏi quyền ghi âm thanh hệ thống, chọn cho phép.</li>
</ol>
<p>Nếu bạn đã tải file <code>.dmg</code> bằng trình duyệt: kéo <strong>AI Translator</strong> vào <strong>Applications</strong>, mở app (macOS sẽ chặn lần đầu vì bản hiện tại ký ad-hoc và chưa được Apple notarize), bấm <strong>Done</strong>, rồi vào <strong>System Settings › Privacy &amp; Security</strong>, kéo xuống cuối, bấm <strong>Open Anyway</strong> và xác nhận bằng mật khẩu hoặc Touch ID.</p>
<p><strong>Trên Windows:</strong></p>
<ol>
<li>Mở <strong>PowerShell</strong> (nhấn phím <kbd>Windows</kbd>, gõ PowerShell, nhấn Enter).</li>
<li>Dán lệnh cài ở trang <a href="/tai-xuong/#cai-windows">Tải xuống</a> rồi nhấn Enter: <code>irm https://aitranslator.io.vn/install.ps1 | iex</code>. Không cần quyền quản trị.</li>
<li>Chờ khoảng một phút. Bộ cài chạy im lặng rồi AI Translator tự mở.</li>
</ol>
<p>Nếu bạn đã tải file <code>.exe</code> bằng trình duyệt: nhấp đúp để chạy; nếu Windows hiện màn hình xanh “Windows protected your PC”, bấm <strong>More info</strong>, kiểm dòng App là đúng tên file cài, rồi bấm <strong>Run anyway</strong>.</p>
<p>Chi tiết, gồm cách kiểm SHA-256: <a href="/huong-dan/cai-dat-macos/">hướng dẫn cài đặt trên macOS</a> và <a href="/huong-dan/cai-dat-windows/">hướng dẫn cài đặt trên Windows</a>.</p>

<h2 id="thiet-lap">Thiết lập lần đầu: bảy bước</h2>
<p>Lần đầu mở, app hiện trình hướng dẫn 9 màn hình (thanh trên cùng ghi “Bước 1/9”); bài này gộp thành bảy bước. Mỗi màn hình có nút <strong>Quay lại</strong> và <strong>Tiếp</strong>. Trên Windows không có màn hình quyền ghi âm nên trình hướng dẫn có 8 màn hình; số bước ghi dưới các ảnh chụp là theo macOS.</p>

<h3>Bước 1. Chọn ngôn ngữ giao diện</h3>
<p>Chọn <strong>Tiếng Việt</strong> hoặc <strong>English</strong> rồi bấm Tiếp. Lựa chọn này cũng đặt luôn ngôn ngữ bạn muốn đọc phụ đề; bạn đổi lại được ở bước 5.</p>
${appShot({ slug: "app-onboarding-1", lang: "vi", alt: "Màn hình đầu tiên của trình hướng dẫn: hai lựa chọn Tiếng Việt và English cho ngôn ngữ giao diện", caption: "Bước 1/9: ngôn ngữ giao diện." })}

<h3>Bước 2. Đồng ý điều khoản</h3>
<p>Đọc Thỏa thuận cấp phép (EULA) và Chính sách quyền riêng tư, rồi tick ô “Tôi đã đọc và đồng ý…”. Chưa tick thì nút Tiếp bị khóa. Khi bạn bấm Tiếp, app đăng ký dùng thử Free của máy với máy chủ, nên cần có mạng một lần.</p>
${appShot({ slug: "app-onboarding-2", lang: "vi", alt: "Bước Điều khoản sử dụng với hai văn bản gập được và ô tick đồng ý bắt buộc", caption: "Bước 2/9: điều khoản sử dụng." })}

<h3>Bước 3. Chọn và tải model</h3>
<p>App hiện RAM và ổ đĩa trống của máy rồi đề xuất một gói: Mac từ khoảng 16 GB RAM (hoặc máy Windows từ 16 GB RAM có card đồ họa rời từ 6 GB VRAM) được đề xuất gói <strong>Chuẩn</strong> (khoảng 2,5 GB), máy còn lại là gói <strong>Nhẹ</strong> (khoảng 1,3 GB). Chọn gói, app tự tải ở màn hình kế tiếp, có nút Tạm dừng và Tiếp tục. Bạn bấm Tiếp trong lúc tải được; model vẫn tải ở nền. Tải xong, app báo “Đã tải xong. AI Translator đã sẵn sàng để dịch.”</p>
<div class="grid grid-2">
${appShot({ slug: "app-onboarding-3", lang: "vi", alt: "Bước kiểm tra máy hiển thị RAM, ổ đĩa trống và gói model được đề xuất", caption: "Bước 3/9: kiểm tra máy, chọn gói." })}
${appShot({ slug: "app-onboarding-4", lang: "vi", alt: "Bước tải model với thanh tiến độ và nút tạm dừng", caption: "Bước 4/9: tải model." })}
</div>

<h3>Bước 4. Cho phép ghi âm thanh hệ thống (chỉ macOS)</h3>
<p>macOS hỏi quyền <strong>Ghi âm thanh hệ thống</strong> ở lần đầu AI Translator thu âm thanh. Màn hình này chỉ nói trước: hộp thoại của macOS hiện ở bước Nghe thử bên dưới hoặc lần đầu bạn bấm Bắt đầu. Hãy chọn cho phép. Lỡ từ chối thì nút <strong>Mở System Settings</strong> ở màn hình này đưa bạn tới đúng chỗ bật lại. App không dùng micro. Chi tiết: <a href="/huong-dan/cap-quyen-thu-am-macos/">cấp quyền ghi âm thanh hệ thống</a>. Trên Windows không có bước này.</p>
${appShot({ slug: "app-onboarding-5", lang: "vi", alt: "Bước Cho phép ghi âm thanh hệ thống kèm nút Mở System Settings", caption: "Bước 5/9: quyền ghi âm thanh hệ thống (chỉ có trên macOS)." })}

<h3>Bước 5. Chọn ngôn ngữ</h3>
<p>Ở ô <strong>Dịch sang</strong>, chọn ngôn ngữ bạn muốn đọc. Tick các ngôn ngữ có thể được nói trong cuộc họp (mặc định cả năm). Để <strong>Ngôn ngữ nguồn</strong> ở “Tự nhận diện”, hoặc khóa một ngôn ngữ nếu bạn biết chắc cuộc họp chỉ nói một thứ tiếng.</p>
${appShot({ slug: "app-onboarding-6", lang: "vi", alt: "Bước Chọn ngôn ngữ với ô Dịch sang, năm ô tick ngôn ngữ nói và ô Ngôn ngữ nguồn", caption: "Bước 6/9: chọn ngôn ngữ." })}

<h3>Bước 6. Nghe thử</h3>
<p>Bấm <strong>Phát câu mẫu</strong>: app phát một câu tiếng Anh qua loa, phụ đề của câu đó hiện trên thanh phụ đề, và màn hình này ghi “Đã chạy. Bản dịch: …”. Tăng âm lượng nếu máy đang tắt tiếng. Nếu macOS hỏi quyền ghi âm lúc này, chọn cho phép.</p>
${appShot({ slug: "app-onboarding-7", lang: "vi", alt: "Bước Nghe thử với nút Phát câu mẫu", caption: "Bước 7/9: nghe thử." })}

<h3>Bước 7. Đọc ghi chú và hoàn tất</h3>
<p>Âm thanh không rời khỏi máy; nếu pháp luật hoặc quy định công ty yêu cầu, bạn tự chịu trách nhiệm thông báo cho người cùng họp là bạn dùng công cụ dịch. Đóng cửa sổ chỉ ẩn app xuống menu bar (macOS) hoặc khay hệ thống (Windows). Trên Windows, biểu tượng mới có thể bị giấu sau mũi tên ^ trên taskbar; màn hình cuối chỉ cách đưa nó ra. Bấm <strong>Bắt đầu dùng AI Translator</strong> để vào màn hình chính.</p>
<div class="grid grid-2">
${appShot({ slug: "app-onboarding-8", lang: "vi", alt: "Bước Quyền riêng tư nói âm thanh không rời khỏi máy và trách nhiệm thông báo cho người cùng họp", caption: "Bước 8/9: quyền riêng tư." })}
${appShot({ slug: "app-onboarding-9", lang: "vi", alt: "Bước cuối nói AI Translator vẫn chạy ở menu bar khi bạn đóng cửa sổ", caption: "Bước 9/9: app vẫn chạy ở menu bar." })}
</div>

<h2 id="dich-dau-tien">Dịch cuộc họp đầu tiên</h2>
<ol>
<li>Ở thẻ <strong>Ngôn ngữ</strong> của màn hình chính, kiểm tra “Dịch sang” và “Ngôn ngữ nói trong cuộc họp”.</li>
<li>Thẻ <strong>Nguồn âm thanh</strong> mặc định là “Toàn hệ thống, trừ app này”; muốn chỉ dịch một app, bấm <strong>Đổi</strong>. Trên Windows, nguồn là thiết bị phát mặc định hoặc một thiết bị bạn chọn; chưa chọn được từng app.</li>
<li>Mở cuộc họp hoặc video có tiếng, rồi bấm <strong>Bắt đầu</strong> (hoặc nhấn ${keys(["⌃", "⌥", "T"])}, trên Windows là ${keys(["Ctrl", "Alt", "T"])}). Trạng thái chuyển từ “Đang khởi động” sang “Đang dịch”; vài giây đầu thanh phụ đề có thể ghi “Đang nạp model…”.</li>
<li>Đọc phụ đề trên thanh nổi. Chấm tròn nhỏ ở góc trên bên phải thanh sáng xanh khi có tiếng, và thanh “Mức âm lượng vào” ở màn hình chính nhúc nhích theo; dòng màu nhạt là phụ đề tạm, sẽ được thay bằng câu hoàn chỉnh.</li>
<li>Bấm <strong>Dừng</strong> khi xong. Thanh giữ các dòng cuối để bạn đọc nốt, và nút <strong>Mở bản chép lời</strong> hiện ra để xem giờ, câu gốc và bản dịch. <strong>Sao chép tất cả</strong> dùng được ở mọi gói.</li>
</ol>
${appShot({ slug: "app-home-running", lang: "vi", alt: "Màn hình chính khi đang dịch: trạng thái Đang dịch, nút Dừng, thẻ ngôn ngữ và thanh mức âm lượng", caption: "Màn hình chính khi đang dịch." })}
<p>Cách kéo, khóa, ẩn và đổi cỡ chữ cho thanh phụ đề có trong bài <a href="/huong-dan/thanh-phu-de-va-phim-tat/">thanh phụ đề và phím tắt</a>. Gói Free cho 30 phút dịch mỗi ngày trong 10 ngày dùng thử.</p>
${overlayShot({ slug: "overlay-default", lang: "vi", alt: "Thanh phụ đề mặc định hiện câu gốc chữ nhỏ phía trên bản dịch trên nền cuộc họp", caption: "Thanh phụ đề mặc định: câu gốc chữ nhỏ, bản dịch bên dưới." })}

<h2 id="loi-thuong-gap">Lỗi thường gặp ở lần đầu</h2>
<ul>
<li><strong>macOS không cho mở app.</strong> Chạy lệnh cài trong Terminal (app mở thẳng) hoặc làm bước Open Anyway ở trên; chi tiết trong <a href="/huong-dan/cai-dat-macos/">hướng dẫn cài đặt</a>.</li>
<li><strong>Windows hiện màn hình “Windows protected your PC”.</strong> Bấm More info rồi Run anyway; chi tiết trong <a href="/huong-dan/cai-dat-windows/">hướng dẫn cài đặt trên Windows</a>.</li>
<li><strong>Không có phụ đề, màn hình chính báo “Không nghe thấy gì dù có app đang phát tiếng…” (macOS).</strong> macOS chưa cho app ghi âm thanh hệ thống; xem <a href="/huong-dan/cap-quyen-thu-am-macos/">hướng dẫn cấp quyền</a>.</li>
<li><strong>Nghe thử không thấy phụ đề.</strong> Kiểm tra loa không bị tắt tiếng rồi bấm lại.</li>
<li><strong>Tải model dừng giữa chừng.</strong> Bấm <strong>Tiếp tục</strong> để tải tiếp từ chỗ đã dừng.</li>
<li><strong>Không thấy thanh phụ đề.</strong> Có thể nó đang ẩn: bấm <strong>Hiện</strong> ở thẻ Thanh phụ đề, hoặc nhấn ${keys(["⌃", "⌥", "H"])} (Windows: ${keys(["Ctrl", "Alt", "H"])}).</li>
<li><strong>Lần chạy đầu hơi lâu.</strong> Sau khi cài hoặc cập nhật, app có thể ghi “Đang chuẩn bị lần đầu. Việc này có thể mất vài phút.”</li>
</ul>
<p>Các lỗi khác có trong bài <a href="/huong-dan/khac-phuc-su-co/">khắc phục sự cố</a>.</p>

${docNav(
  [
    { href: "/huong-dan/", kicker: "Tất cả hướng dẫn", title: "Hướng dẫn sử dụng AI Translator" },
    { href: "/huong-dan/cai-dat-macos/", kicker: "Bài sau", title: "Cài đặt AI Translator trên macOS" },
    { href: "/huong-dan/thanh-phu-de-va-phim-tat/", kicker: "Liên quan", title: "Thanh phụ đề và phím tắt" },
  ],
  "Bài liên quan",
)}
`,
})}
</div></section>
`,
};
