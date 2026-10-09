import { dataFlow, pageHero, sectionHead, feature, checkList, callout, ctaBand, appShot, overlayShot, facts, keys, icon, linkCard } from "../../build/components.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Tính năng", path: "/tinh-nang/" },
];

export default {
  id: "features",
  lang: "vi",
  path: "/tinh-nang/",
  title: "Tính năng: phụ đề dịch, từ điển thuật ngữ, xuất file",
  description:
    "Phụ đề dịch trực tiếp 5 ngôn ngữ, thanh phụ đề tùy chỉnh, từ điển thuật ngữ, lịch sử, xuất TXT/SRT/Markdown, phím tắt. Tất cả chạy offline trên máy của bạn.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  llm: "Danh sách đầy đủ tính năng đã có trong app (phụ đề dịch, thanh phụ đề, từ điển thuật ngữ, lịch sử, xuất file, phím tắt, model) cùng số đo hiệu năng có ghi điều kiện.",
  llmTitle: "Tính năng của AI Translator",
  body: () => `
${pageHero({ crumbs, title: "Mọi thứ cần để hiểu một cuộc họp bằng ngoại ngữ", lead: "Dưới đây là những gì AI Translator làm được hôm nay, đúng như trong app. Tính năng nào chỉ có ở gói trả phí đều được ghi rõ." })}

<section class="section-tight"><div class="container">
<div class="grid grid-4 reveal">
<a class="card card-link" href="#dich-truc-tiep"><strong class="card-title">Dịch trực tiếp</strong><p class="muted">5 ngôn ngữ, tự nhận diện</p></a>
<a class="card card-link" href="#thanh-phu-de"><strong class="card-title">Thanh phụ đề</strong><p class="muted">Kéo, khóa, đổi cỡ chữ</p></a>
<a class="card card-link" href="#ban-chep-loi"><strong class="card-title">Bản chép lời</strong><p class="muted">Lịch sử, xuất file (Pro)</p></a>
<a class="card card-link" href="#tu-dien"><strong class="card-title">Từ điển thuật ngữ</strong><p class="muted">Tên riêng, thuật ngữ (Pro)</p></a>
<a class="card card-link" href="#nguon-am-thanh"><strong class="card-title">Nguồn âm thanh</strong><p class="muted">Mọi app họp, không bot</p></a>
<a class="card card-link" href="#phim-tat"><strong class="card-title">Phím tắt và khay</strong><p class="muted">Điều khiển không rời cuộc họp</p></a>
<a class="card card-link" href="#model"><strong class="card-title">Model và máy</strong><p class="muted">Gói model Chuẩn, gói model Nhẹ</p></a>
<a class="card card-link" href="#hieu-nang"><strong class="card-title">Hiệu năng</strong><p class="muted">Số đo có ghi điều kiện</p></a>
</div>
</div></section>

<section class="section band-dark" id="ai-tren-may"><div class="container">
${sectionHead({ eyebrow: "AI chạy trên máy", title: "Dịch bằng AI mà không đưa cuộc họp lên cloud", text: "Hai model AI, một để nhận dạng giọng nói, một để dịch, chạy trực tiếp trên máy tính của bạn. Không có bước nào gửi âm thanh hay nội dung cuộc họp tới một máy chủ hay dịch vụ AI trên cloud.", center: true })}
${dataFlow("vi")}
<div class="grid grid-3">
${feature({ icon: "cpu", title: "Hai model AI chạy tại chỗ", text: "Một model nhận dạng giọng nói, một model dịch. Cả hai tải về một lần rồi chạy trên máy bạn bằng GPU hoặc CPU.", accent: true })}
${feature({ icon: "zap", title: "Độ trễ thấp vì không đi vòng", text: "Không có chuyến đi tới máy chủ, nên bản dịch hiện ngay sau khi người nói dừng câu. Trung vị dưới 1,1 giây trên Mac M4 Pro; điều kiện đo ở mục Hiệu năng bên dưới." })}
${feature({ icon: "lock", title: "Dữ liệu cuộc hội thoại ở lại trên máy", text: "Âm thanh chỉ nằm trong RAM; bản chép lời và bản dịch ở trên máy bạn. Lịch sử mặc định tắt và, nếu bật, được mã hóa trên máy." })}
</div>
</div></section>

<section class="section" id="dich-truc-tiep"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">Dịch trực tiếp</span>
<h2>Nghe, nhận dạng, dịch và hiện phụ đề trong một vòng</h2>
<p>AI Translator thu âm thanh đang phát trên máy tính, cắt thành từng câu, nhận dạng giọng nói rồi dịch và hiện lên thanh phụ đề. Trên Mac M4 Pro, bản dịch hiện đủ sau khi người nói dừng câu trong khoảng một giây (trung vị); máy khác có thể chậm hơn, xem <a href=\"#hieu-nang\">số đo</a>.</p>
${checkList([
  "<strong>Năm ngôn ngữ</strong> cho cả âm thanh nguồn và bản dịch: English, 中文, 日本語, 한국어, Tiếng Việt. Chúng tôi dự định bổ sung thêm ngôn ngữ trong tương lai (chưa có lịch cụ thể)",
  "<strong>Tự nhận diện</strong> ngôn ngữ đang nói trong tập ngôn ngữ bạn chọn, hoặc <strong>khóa</strong> một ngôn ngữ khi bạn biết trước người nói dùng tiếng gì",
  "Câu đã ở đúng ngôn ngữ bạn muốn đọc thì hiện nguyên văn, không dịch lại",
  "Câu chưa chốt hiện màu nhạt rồi được thay bằng câu hoàn chỉnh khi người nói nói tiếp",
  "Lọc các câu \"ảo giác\" thường gặp khi chỉ có nhạc hoặc im lặng",
  "Chữ tiếng Trung nhận dạng được sẽ đổi sang giản thể",
])}
</div>
<div>
${appShot({ slug: "app-home-free", lang: "vi", alt: "Màn hình chính của AI Translator với thẻ chọn ngôn ngữ dịch và ngôn ngữ nói trong cuộc họp", caption: "Thẻ Ngôn ngữ: chọn ngôn ngữ bạn muốn đọc và các ngôn ngữ có thể được nói trong cuộc họp." })}
</div>
</div>
${callout({ title: "Một chiều, từ cuộc họp sang bạn.", text: "AI Translator dịch âm thanh phát ra từ máy tính sang ngôn ngữ của bạn. Hiện chưa dịch giọng của bạn để phát vào cuộc họp. Nếu cả hai bên cùng cài app, mỗi bên đều thấy phụ đề của phía kia." })}
</div></section>

<section class="section section-alt" id="thanh-phu-de"><div class="container">
<div class="split reverse">
<div class="stack-lg reveal">
<span class="eyebrow">Thanh phụ đề</span>
<h2>Thanh nổi tùy chỉnh, không cản app họp</h2>
<p>Thanh phụ đề là một cửa sổ riêng, không viền, nền mờ, luôn ở trên cùng và không lấy focus của app họp, nên bạn gõ chat hay bấm nút trong cuộc họp bình thường.</p>
${checkList([
  "<strong>Kéo</strong> để di chuyển, kéo cạnh hoặc góc để đổi kích thước; nhớ vị trí và kích thước riêng cho từng màn hình",
  "<strong>Cỡ chữ</strong> 14–48 px, <strong>5 màu chữ</strong> (trắng, vàng, xanh lá, xanh dương nhạt, cam), <strong>5 màu nền</strong>, độ mờ nền 0–100%",
  "<strong>Khóa</strong>: chuột xuyên qua thanh, không có nút nào cản; mở khóa bằng phím tắt hoặc menu khay",
  "Giữ tối đa 1000 câu gần nhất, <strong>cuộn xem lại</strong> bằng con lăn hoặc phím tắt, nút <em>Mới nhất</em> đưa bạn về câu hiện tại",
  "Hiện <strong>câu gốc</strong> chữ nhỏ phía trên bản dịch (mặc định bật, tắt được)",
  "Chỉ báo nhỏ ở góc: đang nghe có tiếng, đang nạp model, đang trễ, còn dưới 5 phút dịch",
])}
</div>
<div class="stack-lg">
${overlayShot({ slug: "overlay-custom", lang: "vi", alt: "Thanh phụ đề với chữ vàng trên nền xanh navy, cỡ chữ lớn", caption: "Cùng một thanh, đổi sang chữ vàng, nền navy, cỡ chữ 26." })}
${appShot({ slug: "app-settings-subtitles", lang: "vi", alt: "Cài đặt Phụ đề: cỡ chữ, màu chữ, màu nền, độ mờ nền và tùy chọn hiện câu gốc", caption: "Cài đặt › Phụ đề: mọi thay đổi hiện ngay trên thanh." })}
</div>
</div>
</div></section>

<section class="section" id="nguon-am-thanh"><div class="container">
<div class="split wide-left">
<div>
${appShot({ slug: "app-settings-audio", lang: "vi", alt: "Cài đặt Âm thanh liệt kê các app đang phát tiếng để chọn làm nguồn", caption: "Cài đặt › Âm thanh: nghe toàn hệ thống hoặc chỉ một app (macOS)." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Nguồn âm thanh</span>
<h2>Mọi app họp, không cần bot, không cần plugin</h2>
<p>Vì app thu âm thanh hệ thống, AI Translator chạy với mọi thứ phát ra tiếng: Zoom, Microsoft Teams, Google Meet, Zalo PC, webinar, video, khóa học trực tuyến.</p>
${checkList([
  "<strong>macOS:</strong> nghe toàn hệ thống (trừ chính app) hoặc chỉ một app đang phát tiếng để không dịch nhầm tiếng thông báo",
  "<strong>Windows:</strong> thiết bị phát mặc định hoặc một thiết bị bạn chọn",
  "Tự mở lại nguồn khi bạn đổi thiết bị phát (cắm tai nghe, kết nối Bluetooth)",
  "<strong>Độ nhạy ngắt câu</strong> chỉnh 50–800 ms: ngắn thì phụ đề sớm hơn, dài thì ít cắt câu hơn",
])}
<p>Trên macOS, lần đầu bạn bấm Bắt đầu, hệ điều hành sẽ hỏi quyền <em>ghi âm thanh hệ thống</em>. App không dùng micro. <a href="/huong-dan/cap-quyen-thu-am-macos/">Xem hướng dẫn cấp quyền</a>. Trên Windows không cần cấp quyền này.</p>
</div>
</div>
</div></section>

<section class="section section-alt" id="ban-chep-loi"><div class="container">
${sectionHead({ eyebrow: "Bản chép lời, lịch sử và xuất file", title: "Giữ lại những gì đã nghe, theo cách của bạn", text: "Bản chép lời của phiên đang chạy dùng được ở mọi gói. Lưu lịch sử và xuất ra file là tính năng Pro.", center: true })}
<div class="split">
<div>
${appShot({ slug: "app-transcript", lang: "vi", alt: "Bản chép lời gồm giờ, câu gốc và bản dịch, có ô tìm kiếm, nút sao chép tất cả và chọn định dạng xuất", caption: "Bản chép lời: tìm, sao chép, xuất TXT, SRT hoặc Markdown." })}
</div>
<div class="stack-lg reveal">
${checkList([
  "<strong>Bản chép lời:</strong> mỗi dòng có giờ, câu gốc và bản dịch; tìm kiếm và sao chép tất cả (mọi gói)",
  "<strong>Xuất file</strong> TXT, SRT hoặc Markdown; với SRT chọn chữ là bản dịch hay câu gốc <span class=\"badge badge-pro\">Pro</span>",
  "<strong>Lịch sử các phiên:</strong> xem lại, mở, xóa từng phiên hoặc xóa tất cả <span class=\"badge badge-pro\">Pro</span>",
  "Lịch sử <strong>mặc định tắt</strong>. Bật thì lưu trên máy, mã hóa, khóa nằm trong Keychain (macOS) hoặc Credential Manager (Windows)",
  "<strong>Xóa lịch sử và từ điển thuật ngữ</strong> trên máy bằng một nút (có nút riêng để xóa cả model), dùng được ở mọi gói",
])}
${appShot({ slug: "app-history", lang: "vi", alt: "Màn hình Lịch sử liệt kê các phiên đã lưu với ngày giờ, số phút, số câu và đoạn xem trước", caption: "Lịch sử các phiên đã lưu trên máy." })}
</div>
</div>
</div></section>

<section class="section" id="tu-dien"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-glossary", lang: "vi", alt: "Từ điển thuật ngữ với các cặp thuật ngữ nguồn và bản dịch cùng nút nhập và xuất CSV", caption: "Từ điển thuật ngữ: thêm, sửa, xóa, nhập và xuất CSV." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Từ điển thuật ngữ <span class="badge badge-pro">Pro</span></span>
<h2>Gợi ý tên riêng và thuật ngữ cho bộ dịch</h2>
<p>Thêm cặp thuật ngữ nguồn → đích cho tên sản phẩm, tên đối tác, thuật ngữ ngành. Khi câu có chứa thuật ngữ, app đưa nó cho bộ dịch như một gợi ý.</p>
${checkList([
  "Tối đa <strong>500</strong> thuật ngữ, nhập và xuất CSV (hai cột, UTF-8)",
  "Không phân biệt hoa thường; chữ Trung, Nhật, Hàn khớp cả giữa từ",
  "Mỗi câu dùng tối đa 20 mục liên quan",
])}
<p class="small muted">Thuật ngữ là gợi ý cho bộ dịch nên không bảo đảm đúng ở mọi lần. Giao diện app cũng ghi rõ điều này.</p>
</div>
</div>
</div></section>

<section class="section section-alt" id="phim-tat"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">Phím tắt và khay hệ thống</span>
<h2>Điều khiển mà không rời cuộc họp</h2>
<p>Năm phím tắt toàn cục hoạt động ngay cả khi AI Translator không phải cửa sổ đang mở. Bạn đổi được từng phím trong Cài đặt › Phím tắt.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Việc</th><th scope="col">macOS</th><th scope="col">Windows</th></tr></thead>
<tbody>
<tr><th scope="row">Bắt đầu hoặc dừng dịch</th><td>${keys(["⌃", "⌥", "T"])}</td><td>${keys(["Ctrl", "Alt", "T"])}</td></tr>
<tr><th scope="row">Hiện hoặc ẩn phụ đề</th><td>${keys(["⌃", "⌥", "H"])}</td><td>${keys(["Ctrl", "Alt", "H"])}</td></tr>
<tr><th scope="row">Khóa hoặc mở khóa phụ đề</th><td>${keys(["⌃", "⌥", "L"])}</td><td>${keys(["Ctrl", "Alt", "L"])}</td></tr>
<tr><th scope="row">Cuộn phụ đề lên (câu cũ)</th><td>${keys(["⌃", "⌥", "PageUp"])}</td><td>${keys(["Ctrl", "Alt", "PageUp"])}</td></tr>
<tr><th scope="row">Cuộn phụ đề xuống (câu mới)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
</tbody></table></div>
<p class="small muted">Trên macOS, ⌃ là Control và ⌥ là Option. Phím tắt phải có ít nhất một phím Ctrl, Alt hoặc Cmd/Win.</p>
<p>Biểu tượng trên thanh menu (macOS) hoặc khay hệ thống (Windows) cho phép bắt đầu hoặc dừng dịch, ẩn hiện và khóa phụ đề, mở cửa sổ chính. Đóng cửa sổ chỉ ẩn app xuống khay; muốn thoát hẳn thì chọn <em>Thoát</em>.</p>
</div>
<div>
${appShot({ slug: "app-settings-hotkeys", lang: "vi", alt: "Cài đặt Phím tắt hiển thị năm phím tắt mặc định trên macOS", caption: "Cài đặt › Phím tắt: bấm Đổi rồi nhấn tổ hợp phím mới." })}
</div>
</div>
</div></section>

<section class="section" id="model"><div class="container">
<div class="model-intro">
<div class="stack-lg reveal">
<span class="eyebrow">Model và cấu hình máy</span>
<h2>Hai gói model, app đề xuất gói hợp với máy bạn</h2>
<p>Model nhận dạng và dịch tải về một lần, sau đó chạy hoàn toàn trên máy. App kiểm tra RAM, ổ đĩa và card đồ họa để đề xuất gói.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col"></th><th scope="col">Gói model Chuẩn</th><th scope="col">Gói model Nhẹ</th></tr></thead>
<tbody>
<tr><th scope="row">Dung lượng tải</th><td>khoảng 2,5 GB</td><td>khoảng 1,3 GB</td></tr>
<tr><th scope="row">RAM khi chạy (Mac M4 Pro)</th><td>khoảng 2,9 GiB</td><td>khoảng 1,8–1,9 GiB</td></tr>
<tr><th scope="row">App đề xuất khi</th><td>Mac 16 GB trở lên; Windows 16 GB trở lên có card rời từ 6 GB VRAM</td><td>Máy từ 8 GB đến dưới 16 GB, hoặc Windows không có card rời đủ mạnh</td></tr>
</tbody></table></div>
<p class="small muted">Gói model Nhẹ chép lời kém rõ hơn gói model Chuẩn ở tiếng Việt, Nhật, Hàn, Trung. Nếu bạn nghe nhiều các ngôn ngữ này, nên dùng gói model Chuẩn.</p>
</div>
</div>
${facts([
  ["macOS", "macOS 14.2 trở lên, Apple Silicon (M1 trở lên)<small>Không có bản cho Mac Intel</small>"],
  ["RAM", "Tối thiểu 8 GB, khuyến nghị 16 GB"],
  ["Ổ đĩa", "Trống thêm ít nhất 1 GB so với dung lượng model cần tải"],
  ["Windows", "Windows 10/11 64-bit (x64), CPU có AVX2<small>Khuyến nghị card đồ họa rời, VRAM từ 6 GB cho gói model Chuẩn. Chưa ký mã nên SmartScreen có thể cảnh báo khi cài; độ trễ trên Windows mới đo sơ bộ trên một laptop có GPU tích hợp, chậm hơn Mac M4 Pro (xem mục Hiệu năng)</small>"],
])}
</div></section>

<section class="section section-alt" id="hieu-nang"><div class="container">
${sectionHead({ eyebrow: "Hiệu năng", title: "Số đo thật, kèm điều kiện đo", text: "Chúng tôi chỉ công bố những gì đã đo, trên đúng máy đã đo, và nói rõ máy nào chưa đo.", center: true })}
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">Số đo (Mac M4 Pro 24 GB, macOS 26, GPU Apple)</th><th scope="col">Gói model Chuẩn</th><th scope="col">Gói model Nhẹ</th></tr></thead>
<tbody>
<tr><th scope="row">Độ trễ trung vị (p50): từ lúc người nói dừng câu tới khi hiện đủ bản dịch (6 phiên, mỗi phiên khoảng 20 câu)</th><td>0,76–1,03 giây</td><td>0,61–0,84 giây</td></tr>
<tr><th scope="row">Độ trễ p90</th><td>0,94–1,34 giây</td><td>0,73–1,14 giây</td></tr>
<tr><th scope="row">Chữ dịch đầu tiên hiện (p50)</th><td>0,63–0,69 giây</td><td>0,52–0,57 giây</td></tr>
<tr><th scope="row">RAM khi chạy</th><td>2,9 GiB</td><td>1,8–1,9 GiB</td></tr>
</tbody></table></div>
<div class="grid grid-2">
${feature({ icon: "gauge", title: "Phiên dài", text: "Một phiên dịch liên tục 5 giờ 23 phút (video bài giảng tiếng Anh, bản release ký ad-hoc): 6019 đoạn, không lỗi, độ trễ trung vị 0,48 giây. Thử nghiệm ổn định 2 giờ: không thành phần nào bị khởi động lại." })}
${feature({ icon: "languages", title: "Chất lượng dịch và nhận dạng", text: "Trên bộ thử nội bộ tám chiều có tiếng Việt, đo trên đúng đường dịch của app, model dịch của gói Chuẩn đạt điểm chất lượng dịch tự động trung bình khoảng 0,84 (thang 0 đến 1, bảng bên dưới). Chúng tôi chọn model dịch bằng cách so nhiều model với nhau trên một bộ thử riêng. Với câu đọc chuẩn, tiếng Việt gói model Chuẩn có tỉ lệ lỗi từ 8,7%. Đây là câu đọc, chưa phải hội thoại họp thật." })}
</div>
<h3 class="reveal" id="chat-luong-theo-chieu">Chất lượng dịch và nhận dạng theo từng chiều</h3>
<p class="reveal">Điểm chất lượng dịch tự động đo trên đúng đường dịch của app (cùng cấu hình như khi dùng thật), mỗi chiều 100 câu (Việt → Trung, Nhật, Hàn: 40 câu). Đây là điểm tương đối từ 0 đến 1, cao hơn là tốt hơn; <strong>không phải tỉ lệ phần trăm chính xác</strong>.</p>
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">Chiều dịch (văn bản)</th><th scope="col">Gói model Chuẩn</th><th scope="col">Gói model Nhẹ</th></tr></thead>
<tbody>
<tr><th scope="row">English → Tiếng Việt</th><td>0,842</td><td>0,841</td></tr>
<tr><th scope="row">中文 → Tiếng Việt</th><td>0,829</td><td>0,831</td></tr>
<tr><th scope="row">日本語 → Tiếng Việt</th><td>0,830</td><td>0,815</td></tr>
<tr><th scope="row">한국어 → Tiếng Việt</th><td>0,834</td><td>0,822</td></tr>
<tr><th scope="row">Tiếng Việt → English</th><td>0,821</td><td>0,822</td></tr>
<tr><th scope="row">Tiếng Việt → 中文</th><td>0,836</td><td>0,821</td></tr>
<tr><th scope="row">Tiếng Việt → 日本語</th><td>0,847</td><td>0,845</td></tr>
<tr><th scope="row">Tiếng Việt → 한국어</th><td>0,851</td><td>0,842</td></tr>
</tbody></table></div>
<div class="table-wrap reveal"><table>
<thead><tr><th scope="col">Nhận dạng giọng nói (tỉ lệ lỗi, thấp hơn là tốt hơn)</th><th scope="col">Gói model Chuẩn</th><th scope="col">Gói model Nhẹ</th></tr></thead>
<tbody>
<tr><th scope="row">English (lỗi từ)</th><td>5,4%</td><td>6,6%</td></tr>
<tr><th scope="row">Tiếng Việt (lỗi từ)</th><td>8,7%</td><td>22,5%</td></tr>
<tr><th scope="row">中文 (lỗi ký tự)</th><td>5,6%</td><td>9,6%</td></tr>
<tr><th scope="row">日本語 (lỗi ký tự)</th><td>4,5%</td><td>13,1%</td></tr>
<tr><th scope="row">한국어 (lỗi ký tự)</th><td>4,1%</td><td>8,2%</td></tr>
</tbody></table></div>
<p class="small muted reveal">Cách đọc: bộ câu dịch thiên về văn nói đời thường nên chỉ đại diện gần đúng cho lời họp; nhận dạng đo trên câu đọc chuẩn (khoảng 15 phút mỗi ngôn ngữ), không phải hội thoại họp thật, và trong thử nghiệm mô phỏng âm thanh băng hẹp (kiểu tai nghe Bluetooth chế độ đàm thoại) lỗi tăng thêm; chúng tôi chưa thử với tai nghe thật. Tám chiều trên đều có tiếng Việt; 12 chiều còn lại giữa English, 中文, 日本語, 한국어 chạy được nhưng chưa có điểm chất lượng. Gói model Nhẹ kém rõ hơn ở nhận dạng tiếng Việt, Nhật, Hàn, Trung.</p>
${callout({ kind: "warn", title: "Điều chưa đo, chúng tôi không hứa", text: "Mọi số trên đo trên một máy Mac M4 Pro, với ngưỡng im lặng chốt đoạn 300 ms (mặc định hiện tại của app là 50 ms; phiên 5 giờ dùng mặc định). Chưa đo: Mac M1, máy 8 GB, card đồ họa rời của Windows, pin và điện năng, độ chính xác với hội thoại họp thật hoặc tai nghe Bluetooth, và chất lượng dịch của các chiều không có tiếng Việt (chạy được nhưng chưa có điểm đo). Thử nghiệm sơ bộ trên một laptop Windows (Core i5-1345U, GPU tích hợp, 32 GB RAM, Windows 11; mỗi cấu hình 6 phiên, 17–23 câu mỗi phiên): gói model Nhẹ có độ trễ trung vị 1,3–2,6 giây, gói model Chuẩn 2,7–5,4 giây và chưa đạt mục tiêu độ trễ. Máy này mạnh hơn máy tối thiểu nên đây không phải con số của máy yếu." })}
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Theo gói", title: "Tính năng nào ở gói nào", center: true })}
<div class="table-wrap reveal"><table class="compare">
<thead><tr><th scope="col">Tính năng</th><th scope="col">Free (dùng thử)</th><th scope="col">Monthly</th><th scope="col">Yearly</th></tr></thead>
<tbody>
<tr><th scope="row">Phụ đề dịch trực tiếp, 5 ngôn ngữ</th><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Thanh phụ đề tùy chỉnh, phím tắt, khay</th><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Xem, tìm, sao chép bản chép lời</th><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Từ điển thuật ngữ (tối đa 500)</th><td><span class="no">Không</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Lưu lịch sử các phiên</th><td><span class="no">Không</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Xuất TXT, SRT, Markdown</th><td><span class="no">Không</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Thời lượng dịch</th><td>30 phút mỗi ngày, 10 ngày</td><td>50 giờ mỗi 30 ngày</td><td>Không giới hạn, 365 ngày</td></tr>
<tr><th scope="row">Giá</th><td>0 ₫</td><td>50.000 ₫</td><td>500.000 ₫</td></tr>
</tbody></table></div>
<p class="center-text reveal"><a class="btn btn-primary" href="/bang-gia/">Xem chi tiết bảng giá ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "Thử trên cuộc họp thật của bạn", text: "Dùng thử Free 10 ngày, mỗi ngày 30 phút. Không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/huong-dan/bat-dau-nhanh/", label: "Hướng dẫn bắt đầu nhanh" } })}
`,
};
void linkCard;
