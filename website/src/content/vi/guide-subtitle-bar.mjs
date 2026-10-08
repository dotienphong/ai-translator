import { pageHero, callout, appShot, overlayShot, keys, docLayout, docNav } from "../../build/components.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Thanh phụ đề và phím tắt", path: "/huong-dan/thanh-phu-de-va-phim-tat/" },
];

const toc = [
  { level: 2, id: "keo-va-doi-kich-thuoc", text: "Kéo và đổi kích thước" },
  { level: 2, id: "khoa", text: "Khóa và mở khóa" },
  { level: 2, id: "an-hien", text: "Ẩn và hiện" },
  { level: 2, id: "cuon", text: "Cuộn xem câu cũ" },
  { level: 2, id: "tuy-chinh", text: "Chỉnh cỡ chữ, màu, độ mờ" },
  { level: 2, id: "chi-bao", text: "Chỉ báo trên thanh" },
  { level: 2, id: "phim-tat", text: "Phím tắt mặc định" },
  { level: 2, id: "doi-phim-tat", text: "Đổi phím tắt" },
  { level: 2, id: "menu-bar", text: "Menu ở menu bar và khay hệ thống" },
  { level: 2, id: "dong-cua-so", text: "Vì sao đóng cửa sổ không thoát app" },
];

export default {
  id: "guide-subtitle-bar",
  lang: "vi",
  path: "/huong-dan/thanh-phu-de-va-phim-tat/",
  title: "Thanh phụ đề và phím tắt của AI Translator",
  description:
    "Cách kéo, khóa, ẩn và cuộn thanh phụ đề AI Translator, chỉnh cỡ chữ, màu, độ mờ, bảng phím tắt mặc định trên macOS và Windows, cách đổi phím và menu ở menu bar.",
  type: "article",
  schemaType: "TechArticle",
  breadcrumbs: crumbs,
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Dùng thanh phụ đề: kéo, đổi kích thước, khóa click xuyên qua, ẩn/hiện, cuộn câu cũ; chỉnh cỡ chữ, màu, độ mờ; bảng phím tắt mặc định macOS và Windows; đổi phím tắt; menu menu bar.",
  llmTitle: "Thanh phụ đề và phím tắt",
  body: () => `
${pageHero({
  crumbs,
  title: "Thanh phụ đề và phím tắt",
  lead: "Thanh phụ đề là cửa sổ nổi luôn nằm trên cùng, hiện bản dịch mà không lấy focus của app họp. Bạn kéo để di chuyển, kéo cạnh để đổi kích thước, khóa để chuột xuyên qua, và điều khiển bằng năm phím tắt mặc định như ⌃⌥T (bắt đầu hoặc dừng dịch) và ⌃⌥H (ẩn hoặc hiện).",
  meta: "<span>macOS và Windows</span> <span>Cập nhật 08/10/2026</span>",
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
<h2 id="keo-va-doi-kich-thuoc">Kéo và đổi kích thước</h2>
<p>Khi thanh chưa khóa, kéo bất kỳ chỗ nào trên thanh để di chuyển nó. Kéo một cạnh hoặc góc để đổi kích thước; thanh nhỏ nhất là 320 × 80. App nhớ vị trí và kích thước riêng cho từng màn hình. Thanh mặc định nằm giữa màn hình, gần mép dưới.</p>
${overlayShot({ slug: "overlay-default", lang: "vi", alt: "Thanh phụ đề mặc định, chữ trắng trên nền đen mờ, câu gốc chữ nhỏ phía trên bản dịch", caption: "Thanh phụ đề mặc định (chưa khóa có viền nét đứt)." })}

<h2 id="khoa">Khóa và mở khóa (click xuyên qua)</h2>
<p>Khóa thanh để chuột đi xuyên qua nó, nhờ đó thanh không cản các nút và ô chat của cuộc họp. Khi khóa, thanh không còn viền và không có nút nào.</p>
<ul>
<li>Màn hình chính, thẻ <strong>Thanh phụ đề</strong>: bấm <strong>Khóa (click xuyên qua)</strong> hoặc <strong>Mở khóa</strong>.</li>
<li>Phím tắt ${keys(["⌃", "⌥", "L"])}.</li>
<li>Menu ở menu bar: <strong>Khóa phụ đề (click xuyên qua)</strong> hoặc <strong>Mở khóa phụ đề</strong>.</li>
</ul>
${overlayShot({ slug: "overlay-locked", lang: "vi", alt: "Thanh phụ đề đã khóa, không viền, không có nút nào, hiện bản dịch trên nền cuộc họp", caption: "Thanh đã khóa: sạch, không có nút, chuột đi xuyên qua." })}
${callout({ title: "Đã khóa thì không bấm được vào thanh.", text: "Muốn mở khóa hãy dùng phím tắt, menu ở menu bar hoặc nút trên màn hình chính." })}

<h2 id="an-hien">Ẩn và hiện</h2>
<p>Rê chuột vào thanh chưa khóa sẽ thấy nút <strong>✕</strong> ở góc trên bên phải (“Ẩn thanh phụ đề”). Ẩn thanh không dừng phiên dịch và không thoát app. Bạn cũng ẩn hoặc hiện bằng ${keys(["⌃", "⌥", "H"])}, nút <strong>Ẩn</strong> hoặc <strong>Hiện</strong> ở màn hình chính, hoặc menu ở menu bar. Thanh ẩn khi bạn mở app, hiện khi bạn bấm Bắt đầu, và giữ nguyên các dòng cuối khi bạn bấm Dừng.</p>

<h2 id="cuon">Cuộn xem câu cũ</h2>
<p>Thanh giữ tối đa 1000 câu gần nhất của phiên. Khi đang ở cuối, thanh tự theo câu mới. Cuộn lên bằng con lăn hoặc trackpad (khi chưa khóa) thì thanh ngừng theo và hiện nút <strong>↓ Mới nhất</strong> ở góc dưới bên phải; bấm nút này để về câu hiện tại. Khi đã khóa, chuột xuyên qua nên dùng ${keys(["⌃", "⌥", "PageUp"])} và ${keys(["⌃", "⌥", "PageDown"])}, mỗi lần cuộn khoảng 80% chiều cao thanh; lúc đó nút “Mới nhất” chỉ là nhãn báo bạn đang xem câu cũ. Bàn phím MacBook không có phím Page Up và Page Down riêng; nếu khó bấm, hãy đổi hai phím này.</p>

<h2 id="tuy-chinh">Chỉnh cỡ chữ, màu, độ mờ</h2>
<p>Mở <strong>Cài đặt › Phụ đề</strong>. Mọi thay đổi hiện ngay trên thanh; bấm <strong>Hiện</strong> ở dòng Thanh phụ đề để xem thử khi chưa dịch.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Mục</th><th scope="col">Lựa chọn</th><th scope="col">Mặc định</th></tr></thead>
<tbody>
<tr><th scope="row">Cỡ chữ</th><td>14 đến 48 px</td><td>20 px</td></tr>
<tr><th scope="row">Màu chữ</th><td>Trắng, Vàng, Xanh lá, Xanh dương nhạt, Cam</td><td>Trắng</td></tr>
<tr><th scope="row">Màu nền</th><td>Đen, Xám đậm, Xanh navy, Nâu đậm, Tím đậm</td><td>Đen</td></tr>
<tr><th scope="row">Độ mờ nền</th><td>0 đến 100% (0% là nền trong suốt, 100% là nền đặc)</td><td>60%</td></tr>
<tr><th scope="row">Hiện câu gốc phía trên bản dịch</th><td>Bật hoặc tắt</td><td>Bật</td></tr>
</tbody></table></div>
<div class="grid grid-2">
${appShot({ slug: "app-settings-subtitles", lang: "vi", alt: "Cài đặt Phụ đề với thanh cỡ chữ, hai hàng ô màu, thanh độ mờ nền và ô hiện câu gốc", caption: "Cài đặt › Phụ đề." })}
${overlayShot({ slug: "overlay-custom", lang: "vi", alt: "Thanh phụ đề đã tùy chỉnh với chữ vàng trên nền xanh navy và cỡ chữ lớn", caption: "Ví dụ: chữ vàng, nền navy, cỡ chữ lớn." })}
</div>

<h2 id="chi-bao">Chỉ báo trên thanh</h2>
<p>Ở góc trên bên phải của thanh có chấm tròn và các nhãn nhắc ngắn:</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Bạn thấy</th><th scope="col">Nghĩa là</th></tr></thead>
<tbody>
<tr><th scope="row">Chấm tròn nhỏ sáng xanh</th><td>Có tiếng đang vào. Khi chưa có tiếng, chấm là màu trắng mờ. Chấm chỉ hiện khi phiên đang chạy</td></tr>
<tr><th scope="row">Đang nạp model…</th><td>Vài giây đầu của phiên, phần xử lý AI đang khởi động</td></tr>
<tr><th scope="row">Đang trễ</th><td>Phụ đề chậm hơn lời nói</td></tr>
<tr><th scope="row">Không nghe thấy âm thanh…</th><td>Một lúc lâu không có tiếng; kiểm tra cuộc họp có đang phát không</td></tr>
<tr><th scope="row">Còn dưới 5 phút dịch</th><td>Sắp hết hạn mức dịch</td></tr>
<tr><th scope="row">Đã hết hạn mức dịch · mở lại lúc …</th><td>Phiên dừng; hạn mức mở lại vào giờ ghi trên thanh</td></tr>
</tbody></table></div>
<p>Dòng màu nhạt là phụ đề tạm, được thay bằng câu hoàn chỉnh khi người nói nói tiếp. Nhãn nhỏ “chưa dịch được” đánh dấu câu app chưa dịch được.</p>

<h2 id="phim-tat">Phím tắt mặc định</h2>
<p>Phím tắt hoạt động ở mọi app, kể cả khi AI Translator không phải cửa sổ đang mở.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Việc</th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">Bắt đầu hoặc dừng dịch</th><td>${keys(["⌃", "⌥", "T"])}</td><td>${keys(["Ctrl", "Alt", "T"])}</td></tr>
<tr><th scope="row">Hiện hoặc ẩn phụ đề</th><td>${keys(["⌃", "⌥", "H"])}</td><td>${keys(["Ctrl", "Alt", "H"])}</td></tr>
<tr><th scope="row">Khóa hoặc mở khóa phụ đề</th><td>${keys(["⌃", "⌥", "L"])}</td><td>${keys(["Ctrl", "Alt", "L"])}</td></tr>
<tr><th scope="row">Cuộn phụ đề lên (xem câu cũ)</th><td>${keys(["⌃", "⌥", "PageUp"])}</td><td>${keys(["Ctrl", "Alt", "PageUp"])}</td></tr>
<tr><th scope="row">Cuộn phụ đề xuống (câu mới hơn)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
</tbody></table></div>
<p class="small muted">Trên macOS, ⌃ là phím Control và ⌥ là phím Option (không phải Command).</p>

<h2 id="doi-phim-tat">Đổi phím tắt</h2>
<ol>
<li>Mở <strong>Cài đặt › Phím tắt</strong>.</li>
<li>Bấm <strong>Đổi</strong> cạnh việc cần đổi.</li>
<li>Bấm tổ hợp phím mới, hoặc <strong>Esc</strong> để hủy.</li>
</ol>
<p>Tổ hợp mới phải có ít nhất một phím Ctrl, Alt hoặc Cmd; chỉ có Shift thì chưa đủ. App báo “Tổ hợp này đang dùng cho việc khác.” nếu bạn đặt trùng một phím tắt của chính nó, và “Hệ thống không cho dùng tổ hợp này; có thể app khác đang giữ.” nếu hệ điều hành từ chối. Chúng tôi chưa kiểm xem phím mặc định có trùng phím tắt của Zoom, Teams hay Meet hay không; nếu bạn thấy trùng, hãy đổi ở đây.</p>
${appShot({ slug: "app-settings-hotkeys", lang: "vi", alt: "Cài đặt Phím tắt liệt kê năm việc cùng tổ hợp phím mặc định trên macOS và nút Đổi", caption: "Cài đặt › Phím tắt." })}

<h2 id="menu-bar">Menu ở menu bar và khay hệ thống</h2>
<p>Biểu tượng AI Translator (bong bóng thoại có sóng âm) ở menu bar cho bạn điều khiển mà không mở cửa sổ chính. Rê chuột vào biểu tượng để thấy trạng thái “Sẵn sàng” hoặc “Đang dịch”.</p>
<p>Trên Windows, biểu tượng (logo màu của app) nằm ở khay hệ thống, góc phải taskbar; Windows có thể giấu nó sau mũi tên <strong>^</strong>. Bấm chuột phải vào biểu tượng để mở menu dưới đây; bấm chuột trái để mở cửa sổ chính.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Mục menu</th><th scope="col">Khi nào có</th></tr></thead>
<tbody>
<tr><th scope="row">Bắt đầu dịch / Dừng dịch</th><td>Đổi theo trạng thái</td></tr>
<tr><th scope="row">Hiện phụ đề / Ẩn phụ đề</th><td>Đổi theo trạng thái</td></tr>
<tr><th scope="row">Khóa phụ đề (click xuyên qua) / Mở khóa phụ đề</th><td>Đổi theo trạng thái</td></tr>
<tr><th scope="row">Mở cửa sổ chính</th><td>Luôn có</td></tr>
<tr><th scope="row">Khởi động lại để cập nhật</th><td>Khi có bản cập nhật đã tải xong và app không đang dịch</td></tr>
<tr><th scope="row">Thoát</th><td>Luôn có; dừng phiên đang chạy rồi thoát hẳn</td></tr>
<tr><th scope="row">Có phím tắt không đăng ký được</th><td>Chỉ khi có phím tắt bị lỗi</td></tr>
</tbody></table></div>

<h2 id="dong-cua-so">Vì sao đóng cửa sổ không thoát app?</h2>
<p>AI Translator được thiết kế để nằm ở menu bar (macOS) hoặc khay hệ thống (Windows), để phím tắt và phiên dịch vẫn chạy khi cửa sổ chính đã đóng. Bấm nút đóng chỉ ẩn cửa sổ. Trên Mac, ⌘Q cũng không thoát: app hiện lại cửa sổ chính kèm lời nhắc “AI Translator vẫn chạy ở menu bar. Muốn thoát, chọn Thoát ở biểu tượng trên menu bar.” Muốn thoát hẳn, chọn <strong>Thoát</strong> ở biểu tượng trên menu bar hoặc trong khay hệ thống.</p>
<p>Gặp trục trặc? Xem <a href="/huong-dan/khac-phuc-su-co/">khắc phục sự cố</a>. Tổng quan ở trang <a href="/tinh-nang/">tính năng</a>.</p>

${docNav(
  [
    { href: "/huong-dan/cap-quyen-thu-am-macos/", kicker: "Bài trước", title: "Cấp quyền ghi âm thanh hệ thống trên macOS" },
    { href: "/huong-dan/tu-dien-thuat-ngu/", kicker: "Bài sau", title: "Dùng từ điển thuật ngữ" },
    { href: "/huong-dan/khac-phuc-su-co/", kicker: "Liên quan", title: "Khắc phục sự cố" },
  ],
  "Bài liên quan",
)}
`,
})}
</div></section>
`,
};
