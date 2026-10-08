import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Lịch sử và xuất bản chép lời", path: "/huong-dan/lich-su-va-xuat-file/" },
];

const toc = [
  { level: 2, id: "ban-chep-loi", text: "Xem, tìm, sao chép bản chép lời" },
  { level: 2, id: "luu-lich-su", text: "Bật lưu lịch sử" },
  { level: 2, id: "xuat-file", text: "Xuất TXT, SRT, Markdown" },
  { level: 2, id: "xoa-du-lieu", text: "Xóa phiên và dữ liệu" },
];

export default {
  id: "guide-history-export",
  lang: "vi",
  path: "/huong-dan/lich-su-va-xuat-file/",
  title: "Lịch sử và xuất bản chép lời: TXT, SRT, Markdown",
  description:
    "Xem, tìm, sao chép bản chép lời ở mọi gói; bật lưu lịch sử mã hóa và xuất TXT, SRT, Markdown (Pro). Cách đọc mốc thời gian SRT và xóa dữ liệu trong AI Translator.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Hướng dẫn bản chép lời của phiên (xem, tìm, sao chép ở mọi gói), bật lưu lịch sử mã hóa, xuất TXT/SRT/Markdown (Pro), cách đọc mốc thời gian SRT và cách xóa dữ liệu.",
  llmTitle: "Lịch sử và xuất bản chép lời trong AI Translator",
  schema: [
    howTo({
      name: "Bật lưu lịch sử và xuất bản chép lời của AI Translator",
      description: "Bật lưu lịch sử, dịch một phiên rồi xuất bản chép lời ra file TXT, SRT hoặc Markdown.",
      totalTime: "PT5M",
      steps: [
        { name: "Bật lưu lịch sử", text: "Mở Cài đặt › Quyền riêng tư và bật ô Lưu lịch sử chép lời. Cần gói Monthly hoặc Yearly." },
        { name: "Dịch một phiên rồi bấm Dừng", text: "Khi bạn bấm Dừng, app lưu bản chép lời của phiên vào lịch sử, mã hóa, trên máy bạn." },
        { name: "Mở bản chép lời", text: "Mở Bản chép lời, hoặc mở một phiên đã lưu trong Lịch sử bằng nút Mở." },
        { name: "Chọn định dạng và xuất", text: "Ở mục Xuất ra chọn TXT, SRT hoặc Markdown (với SRT chọn Bản dịch hoặc Câu gốc), bấm Xuất… rồi chọn nơi lưu." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Lịch sử và xuất bản chép lời",
  lead: "Bản chép lời của AI Translator gồm giờ, câu gốc và bản dịch của từng câu trong phiên. Mọi gói đều xem, tìm và sao chép được. Lưu lịch sử các phiên (mã hóa, ngay trên máy bạn) và xuất ra TXT, SRT hoặc Markdown là tính năng Pro; lưu lịch sử mặc định tắt.",
  meta: `<span><span class="badge badge-pro">Pro</span> xuất file và lịch sử</span><span>Cập nhật 08/10/2026</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
${facts([
  ["Mọi gói", "Xem, tìm, sao chép bản chép lời của phiên"],
  ["Pro", "Lưu lịch sử, mở lại phiên cũ, xuất TXT, SRT, Markdown"],
  ["Lưu lịch sử", "Mặc định tắt<small>Bật ở Cài đặt › Quyền riêng tư</small>"],
  ["Nơi lưu", "Trên máy bạn, có mã hóa<small>Khóa nằm trong Keychain (macOS) hoặc Credential Manager (Windows)</small>"],
])}

<h2 id="ban-chep-loi">Xem, tìm và sao chép bản chép lời</h2>
<p>Mở <strong>Bản chép lời</strong> ở thanh bên, hoặc bấm <strong>Mở bản chép lời</strong> ở Màn hình chính. Mỗi dòng có giờ, câu gốc và bản dịch. Đoạn bị bỏ hiện “[bỏ qua đoạn]”, câu chưa dịch được ghi “chưa dịch được”.</p>
<ul>
<li><strong>Tìm:</strong> gõ vào ô <strong>Tìm</strong> (“Chữ trong câu gốc hoặc bản dịch”). Không có kết quả thì app báo “Không có câu nào khớp.”</li>
<li><strong>Sao chép tất cả:</strong> đưa cả bản chép lời vào clipboard dưới dạng văn bản (cùng kiểu với TXT bên dưới) và báo “Đã sao chép vào clipboard.”</li>
</ul>
${callout({
  kind: "warn",
  title: "Bản chép lời chỉ giữ phiên gần nhất.",
  text: "Nó nằm trong bộ nhớ của app; bắt đầu phiên mới thì bản cũ bị thay. Muốn giữ lại, hãy sao chép, xuất file hoặc bật lưu lịch sử trước khi bắt đầu phiên kế tiếp. Thanh phụ đề chỉ giữ 1000 câu gần nhất, còn bản chép lời giữ đủ các câu của phiên.",
})}
${appShot({
  slug: "app-transcript",
  lang: "vi",
  alt: "Màn hình Bản chép lời: ô Tìm, nút Sao chép tất cả, chọn định dạng xuất và danh sách các dòng gồm giờ, câu gốc và bản dịch",
  caption: "Bản chép lời: tìm, sao chép và chọn định dạng xuất.",
})}

<h2 id="luu-lich-su">Bật lưu lịch sử (Pro)</h2>
<ol>
<li>Mở <strong>Cài đặt › Quyền riêng tư</strong>.</li>
<li>Bật ô <strong>Lưu lịch sử chép lời</strong>. Gói Free thấy ô này bị khóa kèm câu “Lưu lịch sử là tính năng Pro.”</li>
<li>Dịch như bình thường rồi bấm <strong>Dừng</strong>. App lưu bản chép lời của phiên; phiên không có câu nào thì không lưu. Thoát app, tắt máy hay đăng xuất giữa phiên cũng được lưu như khi bấm Dừng, còn tắt đột ngột (Force Quit, mất điện) thì phiên đó mất.</li>
<li>Mở <strong>Lịch sử</strong> ở thanh bên.</li>
</ol>
${appShot({
  slug: "app-settings-privacy",
  lang: "vi",
  alt: "Cài đặt Quyền riêng tư: ô Lưu lịch sử chép lời, nút Xóa toàn bộ dữ liệu và nút Xóa model và dữ liệu",
  caption: "Cài đặt › Quyền riêng tư: bật lưu lịch sử và xóa dữ liệu.",
})}
<p>Mỗi phiên trong <strong>Lịch sử</strong> có ngày giờ, số phút và số câu (“47 phút · 186 câu”), đoạn xem trước và hai nút <strong>Mở</strong>, <strong>Xóa</strong>; phiên mới nhất ở trên. <strong>Mở</strong> cho bạn xem, tìm, sao chép và xuất như ở Bản chép lời; <strong>Về danh sách</strong> để quay lại. Nếu lưu lịch sử đang tắt, màn hình báo “Lưu lịch sử đang tắt, nên phiên mới không được lưu.”</p>
${appShot({
  slug: "app-history",
  lang: "vi",
  alt: "Màn hình Lịch sử: danh sách các phiên đã lưu với ngày giờ, số phút, số câu, đoạn xem trước và nút Mở, Xóa",
  caption: "Lịch sử: các phiên đã lưu trên máy bạn.",
})}
<p>Lịch sử và từ điển thuật ngữ nằm chung trong một cơ sở dữ liệu có mã hóa, chỉ trên máy bạn. Khóa là chuỗi ngẫu nhiên do app tạo ngay trên máy và cất trong Keychain (macOS) hoặc Credential Manager (Windows). Nếu bạn từ chối khi hệ thống hỏi quyền truy cập, app báo “Không mở được dữ liệu lịch sử và từ điển…”; hãy cho phép rồi thử lại. Chi tiết xem <a href="/bao-mat-du-lieu/">dữ liệu và bảo mật</a>.</p>

<h2 id="xuat-file">Xuất ra TXT, SRT hoặc Markdown (Pro)</h2>
<ol>
<li>Mở <strong>Bản chép lời</strong>, hoặc mở một phiên trong <strong>Lịch sử</strong>.</li>
<li>Ở mục <strong>Xuất ra</strong>, chọn <strong>TXT</strong>, <strong>SRT</strong> hoặc <strong>Markdown</strong>. Với SRT, một ô chọn thứ hai hiện ra bên cạnh để chọn chữ trong file: <strong>Bản dịch</strong> hoặc <strong>Câu gốc</strong>.</li>
<li>Bấm <strong>Xuất…</strong> và chọn nơi lưu. App gợi ý tên như <code>transcript-2026-10-02-1405.txt</code> (ngày và giờ bắt đầu phiên). Xong sẽ hiện “Đã lưu vào …”.</li>
</ol>
<p>Ở gói Free, nút <strong>Xuất…</strong> bị khóa kèm câu “Xuất ra file là tính năng Pro. Sao chép thì dùng được ở mọi gói.” và nút <strong>Nâng cấp Pro</strong>.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Định dạng</th><th scope="col">Nội dung và giờ của mỗi dòng</th></tr></thead>
<tbody>
<tr><th scope="row">TXT</th><td>Mỗi câu một khối: <code>[giờ] câu gốc</code>, dòng sau <code>→ bản dịch</code>, cách nhau một dòng trống. Giờ là giờ đồng hồ trên máy lúc câu bắt đầu (HH:MM:SS).</td></tr>
<tr><th scope="row">SRT</th><td>Số thứ tự, “bắt đầu --&gt; kết thúc”, rồi một dòng chữ: bản dịch hoặc câu gốc tùy bạn chọn. Giờ tính từ đầu phiên (HH:MM:SS,mmm).</td></tr>
<tr><th scope="row">Markdown</th><td>Tiêu đề có ngày giờ bắt đầu, rồi bảng ba cột: giờ, câu gốc, bản dịch. Giờ là giờ đồng hồ trên máy.</td></tr>
</tbody></table></div>
<h3>Dùng file SRT với video</h3>
<p>Giờ của mỗi dòng trong file SRT tính từ đầu phiên, nên mốc 00:00:00 là đầu phiên chứ không tự trùng với đầu video của bạn. AI Translator không ghi hình hay ghi âm cuộc họp, nên không biết video bắt đầu lúc nào; nếu video lệch so với phiên, hãy dời mốc thời gian trong trình phát hoặc trình chỉnh phụ đề. Với SRT bản dịch, câu không có bản dịch (câu đã ở ngôn ngữ đích hoặc chưa dịch được) hiện câu gốc.</p>

<h2 id="xoa-du-lieu">Xóa phiên và xóa toàn bộ dữ liệu</h2>
<ul>
<li><strong>Xóa</strong> (trong Lịch sử): xóa một phiên.</li>
<li><strong>Xóa tất cả các phiên:</strong> app hỏi “Xóa mọi phiên đã lưu? Không khôi phục được.” rồi bạn bấm <strong>Xóa</strong>.</li>
<li><strong>Xóa toàn bộ dữ liệu</strong> (Cài đặt › Quyền riêng tư, mọi gói): xóa lịch sử đã lưu và từ điển thuật ngữ trên máy; bản quyền, hạn mức và cài đặt được giữ nguyên. App hỏi xác nhận rồi báo “Đã xóa lịch sử và từ điển.”</li>
<li><strong>Xóa model và dữ liệu</strong> (cùng màn hình): xóa thêm các model đã tải. Trên macOS, hãy bấm nút này trước khi gỡ app.</li>
</ul>
<p>Các thao tác xóa không khôi phục được. Tiếp theo, xem <a href="/huong-dan/tu-dien-thuat-ngu/">từ điển thuật ngữ</a> hoặc <a href="/huong-dan/khac-phuc-su-co/">khắc phục sự cố</a>.</p>
`,
})}
${docNav(
  [
    { href: "/huong-dan/tu-dien-thuat-ngu/", kicker: "Bài trước", title: "Dùng từ điển thuật ngữ" },
    { href: "/huong-dan/mua-va-kich-hoat-key/", kicker: "Bài tiếp theo", title: "Mua gói, kích hoạt key và đổi máy" },
  ],
  "Bài liên quan",
)}
</div></section>
`,
};
