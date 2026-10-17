import { pageHero, callout, facts, appShot, overlayShot, keys, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Gõ dịch tin nhắn", path: "/huong-dan/go-dich/" },
];

const toc = [
  { level: 2, id: "cach-dung", text: "Gõ dịch dùng thế nào" },
  { level: 2, id: "phim", text: "Phím trong ô soạn" },
  { level: 2, id: "ngon-ngu", text: "Dịch sang ngôn ngữ nào" },
  { level: 2, id: "quyen-tro-nang", text: "Tự dán trên macOS: quyền Trợ năng" },
  { level: 2, id: "windows", text: "Trên Windows" },
  { level: 2, id: "khi-khong-dan-duoc", text: "Giới hạn và khi không dán được" },
  { level: 2, id: "rieng-tu", text: "Chữ bạn gõ đi đâu" },
];

export default {
  id: "guide-type-translate",
  lang: "vi",
  path: "/huong-dan/go-dich/",
  title: "Gõ dịch: soạn tin bằng tiếng Việt, dán vào ô chat",
  description:
    "Hướng dẫn Gõ dịch của AI Translator: bấm ⌃⌥G hoặc Ctrl+Alt+G, gõ tin nhắn bằng tiếng của bạn, Enter để dán bản dịch vào ô chat bạn đang dùng.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-17",
  modified: "2026-10-17",
  llm: "Hướng dẫn Gõ dịch: mở ô soạn bằng ⌃⌥G (Ctrl+Alt+G), gõ tin nhắn, Enter dán bản dịch vào ô chat của app đang dùng; ngôn ngữ đích, quyền Trợ năng trên macOS, giới hạn và quyền riêng tư.",
  llmTitle: "Gõ dịch tin nhắn trong AI Translator",
  schema: [
    howTo({
      name: "Gửi tin nhắn đã dịch bằng Gõ dịch của AI Translator",
      description: "Soạn tin bằng tiếng của bạn trong ô soạn của AI Translator, dán bản dịch vào ô chat rồi gửi.",
      totalTime: "PT1M",
      steps: [
        { name: "Đặt con trỏ vào ô chat", text: "Mở app chat hay trang web bạn đang dùng và bấm vào ô nhập tin nhắn." },
        { name: "Mở ô soạn", text: "Bấm ⌃⌥G trên macOS hoặc Ctrl+Alt+G trên Windows. Ô soạn Gõ dịch hiện giữa màn hình, con trỏ nằm sẵn trong ô gõ." },
        { name: "Gõ tin nhắn", text: "Gõ bằng tiếng của bạn, Telex hay VNI đều được. Ngừng gõ một chút thì bản dịch hiện bên dưới." },
        { name: "Bấm Enter để dán", text: "Ô soạn đóng và bản dịch được dán vào ô chat. Chưa có gì được gửi đi." },
        { name: "Bấm Enter lần nữa để gửi", text: "Xem lại bản dịch trong ô chat, rồi bấm Enter của app chat để gửi." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Gõ dịch tin nhắn",
  lead: "Gõ dịch giúp bạn nhắn tin cho người nói tiếng khác ở ô chat của app bạn đang dùng. Bạn gõ bằng tiếng của mình trong một ô soạn nổi, AI Translator dịch ngay trên máy, rồi dán bản dịch vào ô chat để bạn xem lại và gửi.",
  meta: `<span>Cập nhật {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
${facts([
  ["Phím tắt", "⌃⌥G trên macOS, Ctrl+Alt+G trên Windows<small>Đổi ở Cài đặt › Phím tắt</small>"],
  ["Gói", "Mọi gói còn hiệu lực<small>Kể cả Free trong thời gian dùng thử; không trừ thời lượng dịch</small>"],
  ["Ngôn ngữ", "English, 中文, 日本語, 한국어, Tiếng Việt<small>Mặc định là tiếng của người bên kia</small>"],
  ["Độ dài", "Tối đa 4000 ký tự mỗi tin<small>Dòng quá dài thì tách ra</small>"],
  ["Mạng", "Không cần<small>Dịch trên máy bạn</small>"],
  ["Tự dán trên macOS", "Cần quyền Trợ năng<small>Chưa có quyền thì app chép bản dịch để bạn tự dán</small>"],
])}

<h2 id="cach-dung">Gõ dịch dùng thế nào?</h2>
<ol>
<li>Bấm vào ô chat của app bạn đang dùng (Messenger, Slack, Zalo, khung chat của Zoom…), như khi định gõ tin.</li>
<li>Bấm ${keys(["⌃", "⌥", "G"])} trên macOS hoặc ${keys(["Ctrl", "Alt", "G"])} trên Windows. Ô soạn <strong>Gõ dịch</strong> hiện giữa màn hình có con trỏ chuột, con trỏ nằm sẵn trong ô gõ. App chat vẫn ở phía trước, ô chat của nó không mất chữ đang có.</li>
<li>Gõ tin nhắn bằng tiếng của bạn. Bộ gõ Telex, VNI chạy như ở mọi ô nhập khác. Ngừng gõ khoảng nửa giây thì AI Translator dịch toàn bộ chữ đang có và bản dịch hiện dần bên dưới. Gõ tiếp thì app dịch lại.</li>
<li>Bấm <strong>Enter</strong>. Ô soạn đóng, con trỏ về ô chat cũ và bản dịch được dán vào đó. <strong>Chưa có gì được gửi đi.</strong></li>
<li>Xem lại bản dịch trong ô chat, sửa nếu cần, rồi bấm Enter (của app chat) để gửi.</li>
</ol>
${overlayShot({
  slug: "compose-done",
  lang: "vi",
  alt: "Ô soạn Gõ dịch: dòng đầu ghi Gõ dịch và ngôn ngữ đích English, ô gõ có một tin nhắn tiếng Việt, bên dưới là bản dịch tiếng Anh, chân ô ghi Enter: dán, Shift+Enter: xuống dòng, Esc: đóng",
  caption: "Ô soạn Gõ dịch khi bản dịch đã xong: bấm Enter để dán vào ô chat.",
})}
<p>Dòng đầu của ô soạn ghi ngôn ngữ đang dịch sang và trạng thái: “Đang nạp model…” (lần đầu dùng sau một lúc app rảnh), “Đang dịch…”, hay “Đã là English” khi tin của bạn đã ở đúng ngôn ngữ đích (Enter khi đó dán nguyên văn). Bản dịch hiện mờ khi chưa khớp chữ bạn đang có.</p>
<p>Bản nháp được giữ khi bạn đóng ô soạn bằng Esc, bằng phím tắt hay bằng cách bấm ra ngoài. Mở lại thì chữ cũ còn đó và được chọn sẵn, gõ đè được ngay. Dán xong thì ô trống; bản nháp mất khi thoát app.</p>
${callout({
  title: "Cần đã tải model, như khi dịch phụ đề.",
  text: "Gõ dịch dùng cùng model dịch với phụ đề, nên cần gói model đã tải xong (Cài đặt › Model). Dùng được cả khi đang dịch phụ đề; khi đó mỗi lần dịch tin có thể làm phụ đề hiện chậm thêm một chút. Gõ dịch không dùng từ điển thuật ngữ.",
})}

<h2 id="phim">Phím trong ô soạn</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Phím</th><th scope="col">Tác dụng</th></tr></thead>
<tbody>
<tr><th scope="row">Enter</th><td>Dán bản dịch vào ô chat. Đang dịch thì dịch xong mới dán. Dịch lỗi thì dịch lại: app <strong>không bao giờ dán câu gốc</strong> khi dịch lỗi. Ô trống thì đóng.</td></tr>
<tr><th scope="row">Shift+Enter</th><td>Xuống dòng. Mỗi dòng được dịch riêng, bản dịch giữ đúng các dòng của bạn.</td></tr>
<tr><th scope="row">Esc</th><td>Đóng ô soạn, không dán, giữ bản nháp.</td></tr>
<tr><th scope="row">${keys(["⌃", "⌥", "G"])} / ${keys(["Ctrl", "Alt", "G"])}</th><td>Khi ô soạn đang mở: đóng như Esc.</td></tr>
<tr><th scope="row">Bấm ra ngoài ô soạn</th><td>Đóng như Esc.</td></tr>
</tbody></table></div>
<p>Khi bộ gõ đang chọn chữ (bộ gõ tiếng Nhật, tiếng Trung, tiếng Hàn), Enter chỉ chốt chữ của bộ gõ, không dán. Phím tắt mở ô soạn đổi được ở <strong>Cài đặt › Phím tắt</strong>, dòng “Mở Gõ dịch” (xem <a href="/huong-dan/thanh-phu-de-va-phim-tat/">thanh phụ đề và phím tắt</a>).</p>

<h2 id="ngon-ngu">Dịch sang ngôn ngữ nào?</h2>
<p>Mặc định là <strong>tiếng của người bên kia</strong>, tính từ cài đặt phụ đề: “Tự động lấy tiếng của người bên kia theo cài đặt phụ đề: ngôn ngữ của cuộc họp nếu chỉ có một, không thì English (Tiếng Việt khi phụ đề đang dịch sang English).” Ví dụ bạn đọc phụ đề tiếng Việt và khóa ngôn ngữ nguồn là tiếng Nhật thì Gõ dịch dịch sang tiếng Nhật.</p>
<p>Muốn cố định một ngôn ngữ, mở <strong>Cài đặt › Gõ dịch</strong> và chọn ở ô <strong>Dịch sang</strong>: “Tự động (đang là …)” hoặc một trong năm ngôn ngữ. Ở đây cũng có công tắc <strong>Bật Gõ dịch</strong>: tắt thì phím tắt của ô soạn không còn tác dụng (phím đã chọn vẫn được giữ).</p>
${appShot({
  slug: "app-settings-compose",
  lang: "vi",
  alt: "Cài đặt nhóm Gõ dịch: công tắc Bật Gõ dịch, ô Dịch sang đang chọn Tự động, công tắc Tự dán vào ô đang gõ và dòng Quyền Trợ năng đã cấp kèm nút Mở cài đặt Trợ năng",
  caption: "Cài đặt › Gõ dịch trên macOS.",
})}

<h2 id="quyen-tro-nang">Tự dán trên macOS: quyền Trợ năng</h2>
<p>Để tự dán bản dịch vào app khác, macOS yêu cầu quyền <strong>Trợ năng</strong> (Accessibility). AI Translator chỉ dùng quyền này để gửi tổ hợp dán ⌘V vào ô chat bạn đang gõ; app không đọc chữ hay nội dung của app khác.</p>
<ol>
<li>Lần đầu bạn bấm Enter khi chưa có quyền, ô soạn không đóng: bản dịch đã được chép và ô soạn ghi “Đã chép bản dịch. Muốn app tự dán, hãy cấp quyền Trợ năng cho AI Translator.” Bạn có thể bấm Enter hay Esc rồi tự bấm ⌘V ở ô chat.</li>
<li>Bấm <strong>Bật tự dán</strong>. macOS mở System Settings › Quyền riêng tư &amp; Bảo mật › Trợ năng; bật công tắc của AI Translator.</li>
<li>Không muốn cấp quyền thì bấm <strong>Luôn chỉ chép</strong>: từ đó Enter chỉ chép bản dịch rồi đóng ô soạn, bạn tự dán bằng ⌘V. Đổi lại ở <strong>Cài đặt › Gõ dịch › Tự dán vào ô đang gõ</strong>.</li>
</ol>
<p>Trạng thái quyền hiện ở Cài đặt › Gõ dịch, dòng <strong>Quyền Trợ năng</strong> (“Đã cấp.” hay “Chưa cấp. …”), kèm nút <strong>Mở cài đặt Trợ năng</strong>.</p>
${callout({
  kind: "warn",
  title: "Sau khi cập nhật app, có thể phải bật lại quyền.",
  text: "Bản macOS hiện chưa được ký bằng chứng thư nhà phát triển của Apple, nên sau mỗi lần cập nhật macOS có thể coi AI Translator là app khác: mục của app trong Trợ năng vẫn bật mà app vẫn báo chưa cấp. Khi đó hãy xóa AI Translator khỏi danh sách (nút −) rồi thêm lại (nút +); chỉ tắt rồi bật lại công tắc thì không sửa được. Trong lúc chưa có quyền, Gõ dịch vẫn chép bản dịch để bạn tự dán.",
})}

<h2 id="windows">Trên Windows</h2>
<p>Windows không cần cấp quyền. Khi bạn bấm Enter, AI Translator đưa cửa sổ bạn đang chat về phía trước rồi gửi Ctrl+V. Nếu cửa sổ đó đã đóng, hay không lên được phía trước kịp, app chỉ chép bản dịch (không gửi phím vào cửa sổ khác) để bạn tự dán bằng Ctrl+V.</p>
<p class="small muted">Bản Windows có đủ tính năng này nhưng chúng tôi chưa thử nó trên máy Windows thật. Nếu gặp lỗi, hãy báo cho chúng tôi ở trang <a href="/lien-he/">liên hệ</a>.</p>

<h2 id="khi-khong-dan-duoc">Giới hạn và khi không dán được</h2>
<ul>
<li><strong>Phạm vi đã thử:</strong> trên macOS, chúng tôi đã thử ở trình duyệt Chrome và Safari, TextEdit, Notes, Slack, Teams và Telegram (ở ba app chat chỉ thử vào ô chat riêng của chính mình), chưa thử ở từng app chat còn lại. Cách dán là gửi ⌘V (Ctrl+V) vào ô bạn đang gõ nên thường dùng được ở mọi ô nhận dán; nếu một app cho kết quả lạ, hãy báo cho chúng tôi ở trang <a href="/lien-he/">liên hệ</a>.</li>
<li><strong>Bản dịch luôn ở trong clipboard.</strong> Sau khi dán, bản dịch vẫn nằm trong clipboard (nội dung cũ của clipboard bị thay). Nếu chữ không vào ô chat, hãy bấm vào ô đó rồi tự dán bằng ⌘V hay Ctrl+V.</li>
<li><strong>Một số ô không nhận dán tự động:</strong> ô mật khẩu (macOS chặn phím gửi từ app khác), app đang chạy với quyền quản trị trên Windows, và app tự chặn việc dán. App không biết được những trường hợp này.</li>
<li><strong>Tối đa 4000 ký tự mỗi tin.</strong> Một dòng quá dài thì ô soạn báo “Một dòng quá dài để dịch. Hãy tách thành nhiều dòng hay nhiều tin.”</li>
<li><strong>Dịch lỗi:</strong> ô soạn báo “Chưa dịch được. Bấm Enter để thử lại.”</li>
<li><strong>Phím tắt không mở ô soạn:</strong> kiểm Cài đặt › Gõ dịch đã bật; trên Windows, phím có thể đang bị app khác giữ (Cài đặt › Phím tắt báo phím chưa đăng ký được), hãy đổi sang phím khác. Trên macOS, nếu một app khác cũng dùng ⌃⌥G thì hãy đổi phím của một bên.</li>
</ul>
<p>Các lỗi khác (chưa tải model, hết dùng thử, key bị khóa) hiện trong ô soạn kèm nút mở đúng màn hình của app. Xem thêm <a href="/huong-dan/khac-phuc-su-co/">khắc phục sự cố</a>.</p>

<h2 id="rieng-tu">Chữ bạn gõ đi đâu?</h2>
<p>Không đi đâu cả. Chữ bạn gõ và bản dịch chỉ nằm trong bộ nhớ của AI Translator trên máy bạn: không gửi qua mạng, không ghi xuống đĩa, không có trong log hay báo cáo lỗi. App chỉ <strong>ghi</strong> bản dịch vào clipboard để dán, không đọc clipboard hay chữ của app khác. Xem <a href="/bao-mat-du-lieu/">dữ liệu và bảo mật</a>.</p>
`,
})}
${docNav(
  [
    { href: "/huong-dan/thanh-phu-de-va-phim-tat/", kicker: "Bài trước", title: "Thanh phụ đề và phím tắt" },
    { href: "/huong-dan/tu-dien-thuat-ngu/", kicker: "Bài tiếp theo", title: "Dùng từ điển thuật ngữ" },
  ],
  "Bài liên quan",
)}
</div></section>
`,
};
