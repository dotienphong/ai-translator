import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Dùng từ điển thuật ngữ", path: "/huong-dan/tu-dien-thuat-ngu/" },
];

const toc = [
  { level: 2, id: "cach-hoat-dong", text: "Từ điển hoạt động thế nào" },
  { level: 2, id: "them-sua-xoa", text: "Thêm, sửa và xóa thuật ngữ" },
  { level: 2, id: "nhap-xuat-csv", text: "Nhập và xuất CSV" },
  { level: 2, id: "meo-viet-thuat-ngu", text: "Viết thuật ngữ cho hiệu quả" },
  { level: 2, id: "vi-du", text: "Ví dụ" },
];

export default {
  id: "guide-glossary",
  lang: "vi",
  path: "/huong-dan/tu-dien-thuat-ngu/",
  title: "Dùng từ điển thuật ngữ: thêm, nhập CSV, mẹo viết",
  description:
    "Hướng dẫn từ điển thuật ngữ của AI Translator (tính năng Pro): thêm, sửa, xóa, nhập và xuất CSV, cách app đưa thuật ngữ cho bộ dịch và mẹo viết thuật ngữ.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Hướng dẫn dùng từ điển thuật ngữ (tính năng Pro): thêm, sửa, xóa, nhập xuất CSV, giới hạn 500 thuật ngữ, cách app đưa thuật ngữ cho bộ dịch và mẹo viết thuật ngữ.",
  llmTitle: "Dùng từ điển thuật ngữ trong AI Translator",
  schema: [
    howTo({
      name: "Thêm thuật ngữ vào từ điển của AI Translator",
      description: "Thêm một cặp thuật ngữ và bản dịch, rồi nhập thêm nhiều thuật ngữ từ file CSV.",
      totalTime: "PT5M",
      steps: [
        { name: "Mở Từ điển thuật ngữ", text: "Bấm Từ điển thuật ngữ ở thanh bên trái của cửa sổ chính. Tính năng này cần gói Monthly hoặc Yearly." },
        { name: "Nhập thuật ngữ và bản dịch", text: "Gõ thuật ngữ vào ô Thuật ngữ và bản dịch mong muốn vào ô Bản dịch. Mỗi ô tối đa 200 ký tự." },
        { name: "Bấm Thêm", text: "Cặp mới hiện trong danh sách. Các câu dịch sau đó dùng thuật ngữ ngay, kể cả khi phiên đang chạy." },
        { name: "Nhập CSV (tùy chọn)", text: "Bấm Nhập CSV… và chọn file CSV hai cột, mã UTF-8, nhỏ hơn 1 MB. App báo số thuật ngữ đã thêm, cập nhật, bỏ qua và vượt giới hạn." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Dùng từ điển thuật ngữ",
  lead: "Từ điển thuật ngữ của AI Translator lưu tối đa 500 cặp “thuật ngữ → bản dịch” cho tên riêng, từ viết tắt và thuật ngữ ngành. Khi câu đang dịch có chứa thuật ngữ, app đưa cặp đó cho bộ dịch như một gợi ý. Đây là tính năng Pro, có trong gói Monthly và Yearly.",
  meta: `<span><span class="badge badge-pro">Pro</span></span><span>Cập nhật 08/10/2026</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
${facts([
  ["Gói", "Pro: Monthly và Yearly<small>Gói Free hiện khung khóa</small>"],
  ["Dung lượng", "Tối đa 500 thuật ngữ<small>Mỗi ô tối đa 200 ký tự</small>"],
  ["File CSV", "Hai cột, mã UTF-8<small>Tối đa 1 MB</small>"],
  ["Khi dịch", "Tối đa 20 mục cho mỗi câu"],
  ["So khớp", "Không phân biệt hoa thường<small>Chữ Trung, Nhật, Hàn khớp cả giữa từ</small>"],
  ["Nơi lưu", "Trên máy bạn<small>Trong cơ sở dữ liệu được mã hóa</small>"],
])}

<h2 id="cach-hoat-dong">Từ điển thuật ngữ hoạt động thế nào?</h2>
<p>Mỗi khi một câu được nhận dạng xong, app tìm trong <strong>câu gốc</strong> (chữ mà bộ nhận dạng giọng nói chép ra) các thuật ngữ của bạn, rồi đưa những cặp tìm thấy cho bộ dịch cùng với câu đó. Bạn sửa từ điển giữa phiên thì các câu sau dùng ngay bản mới.</p>
<ul>
<li><strong>Gợi ý, không phải mệnh lệnh.</strong> App ghi rõ rằng bộ dịch “có thể không dùng đúng mọi lần”. Từ điển làm tăng khả năng bạn thấy đúng từ, không bảo đảm.</li>
<li><strong>Không phân biệt hoa thường:</strong> “api” khớp “API”.</li>
<li><strong>Chữ Latin khớp theo từ nguyên vẹn:</strong> “AI” khớp trong “AI’s” nhưng không khớp trong “said”.</li>
<li><strong>Chữ Trung, Nhật, Hàn khớp cả giữa từ,</strong> vì tiếng Trung và tiếng Nhật không có khoảng trắng giữa các từ, còn tiếng Hàn dính trợ từ vào sau từ.</li>
<li><strong>Tối đa 20 mục cho mỗi câu.</strong> Câu khớp nhiều hơn thì app giữ các mục dài hơn (cụ thể hơn) trước.</li>
</ul>
${callout({
  title: "Gói Free chưa dùng được từ điển.",
  text: "Màn hình Từ điển thuật ngữ hiện khung khóa với dòng “Từ điển thuật ngữ là tính năng Pro: thuật ngữ của bạn được dùng khi dịch.” và nút <strong>Nâng cấp Pro</strong>. Cách mua xem ở <a href=\"/huong-dan/mua-va-kich-hoat-key/\">Mua gói, kích hoạt key và đổi máy</a>; giá ở <a href=\"/bang-gia/\">bảng giá</a>.",
})}

<h2 id="them-sua-xoa">Thêm, sửa và xóa thuật ngữ</h2>
<ol>
<li>Bấm <strong>Từ điển thuật ngữ</strong> ở thanh bên trái. Dòng đầu cho biết số thuật ngữ hiện có, dạng “12/500 thuật ngữ”.</li>
<li>Gõ chữ nguồn vào ô <strong>Thuật ngữ</strong>, đúng như người nói sẽ nói, và bản dịch bạn muốn thấy vào ô <strong>Bản dịch</strong>. Mỗi ô tối đa 200 ký tự, không xuống dòng hay dùng tab.</li>
<li>Bấm <strong>Thêm</strong>. Cặp mới hiện trong danh sách dạng “thuật ngữ → bản dịch”.</li>
<li>Muốn đổi, bấm <strong>Sửa</strong>, chỉnh hai ô rồi bấm <strong>Lưu</strong> (hoặc <strong>Hủy</strong>). Muốn bỏ, bấm <strong>Xóa</strong>.</li>
</ol>
<p>Lỗi hiện ngay dưới dòng nhập: “Hãy điền cả thuật ngữ lẫn bản dịch.”, “Dùng tối đa 200 ký tự.”, “Thuật ngữ này đã có trong từ điển.” (trùng được tính không phân biệt hoa thường) hoặc “Từ điển đã đủ 500 thuật ngữ. Hãy xóa bớt trước khi thêm.”</p>
${appShot({
  slug: "app-glossary",
  lang: "vi",
  alt: "Màn hình Từ điển thuật ngữ: số thuật ngữ đã dùng trên tối đa 500, hai ô nhập Thuật ngữ và Bản dịch, nút Nhập CSV và Xuất CSV, danh sách các cặp thuật ngữ và bản dịch",
  caption: "Màn hình Từ điển thuật ngữ khi có gói Monthly hoặc Yearly.",
})}

<h2 id="nhap-xuat-csv">Nhập và xuất CSV</h2>
<p>Nhập CSV giúp đưa cả danh sách dài vào cùng lúc, còn xuất CSV để bạn sao lưu hoặc chỉnh trong bảng tính. File cần đúng các điều kiện sau.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Yêu cầu</th><th scope="col">Chi tiết</th></tr></thead>
<tbody>
<tr><th scope="row">Cột</th><td>Cột 1 là thuật ngữ, cột 2 là bản dịch. Dòng đầu <code>source,target</code> là tùy chọn và được bỏ qua khi nhập.</td></tr>
<tr><th scope="row">Mã hóa</th><td>UTF-8. Nếu bảng tính lưu theo bảng mã khác, app từ chối file. Trong Excel, hãy lưu kiểu “CSV UTF-8”.</td></tr>
<tr><th scope="row">Kích thước</th><td>Tối đa 1 MB.</td></tr>
<tr><th scope="row">Mỗi ô</th><td>Tối đa 200 ký tự, không xuống dòng.</td></tr>
</tbody></table></div>
<p>Ví dụ nội dung file:<br><code>source,target</code><br><code>API gateway,cổng API</code><br><code>burn rate,tốc độ đốt tiền</code></p>
<ol>
<li>Bấm <strong>Nhập CSV…</strong> và chọn file trong hộp thoại của hệ điều hành.</li>
<li>Đọc dòng báo cáo: “Đã nhập: thêm …, cập nhật …, bỏ qua … dòng, … dòng vượt giới hạn 500.”</li>
</ol>
<ul>
<li><strong>Thêm:</strong> thuật ngữ mới.</li>
<li><strong>Cập nhật:</strong> thuật ngữ đã có (không phân biệt hoa thường); app lấy bản dịch trong file.</li>
<li><strong>Bỏ qua:</strong> dòng thiếu cột, dòng rỗng, ô quá 200 ký tự hoặc có xuống dòng.</li>
<li><strong>Vượt giới hạn 500:</strong> dòng hợp lệ nhưng từ điển đã đủ 500 thuật ngữ.</li>
</ul>
<p>File không đọc được thì app báo “Không đọc được file CSV này. Chưa nhập gì.” và giữ nguyên từ điển; file quá 1 MB bị từ chối với câu “File này quá lớn. File từ điển tối đa 1 MB.”</p>
<p>Bấm <strong>Xuất CSV…</strong> để lưu cả từ điển ra file (nút tắt khi từ điển trống). File xuất ra có dòng đầu <code>source,target</code> và mã UTF-8 để Excel hiện đúng tiếng Việt. Ô bắt đầu bằng <code>=</code>, <code>+</code>, <code>-</code> hoặc <code>@</code> được thêm một dấu nháy đơn ở đầu để bảng tính không hiểu nhầm là công thức; khi nhập lại, app tự bỏ dấu đó.</p>

<h2 id="meo-viet-thuat-ngu">Viết thuật ngữ thế nào cho hiệu quả?</h2>
<ul>
<li><strong>Tên riêng:</strong> tên công ty, sản phẩm, người, địa danh. Ghi bản dịch bạn muốn thấy; giữ nguyên cũng được.</li>
<li><strong>Từ viết tắt:</strong> ghi dạng người nói hay dùng và thêm giải nghĩa nếu cần: “SLA” → “thỏa thuận mức dịch vụ (SLA)”.</li>
<li><strong>Thuật ngữ ngành:</strong> những từ bộ dịch hay dịch lệch nghĩa trong lĩnh vực của bạn.</li>
<li><strong>Viết đúng như được chép.</strong> Hãy chạy thử một phiên và xem <a href="/huong-dan/lich-su-va-xuat-file/">bản chép lời</a>. Nếu một tên luôn bị chép khác đi, bạn có thể thêm chính cách chép đó làm thuật ngữ.</li>
<li><strong>Một thuật ngữ, một bản dịch.</strong> Từ điển không gắn với cặp ngôn ngữ, nên bản dịch cần viết bằng ngôn ngữ bạn đang đọc. Đổi ngôn ngữ dịch ở Màn hình chính thì kiểm lại các bản dịch.</li>
<li><strong>Ngắn và cụ thể.</strong> Tránh từ quá chung như “meeting” hay “dự án”: chúng xuất hiện ở rất nhiều câu mà hiếm khi cần chỉnh.</li>
</ul>

<h2 id="vi-du">Ví dụ</h2>
<p>Các cặp dưới đây có thể nằm chung một từ điển: app chỉ dùng cặp nào có chữ nguồn xuất hiện trong câu đang dịch.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Người nói</th><th scope="col">Thuật ngữ</th><th scope="col">Bản dịch</th><th scope="col">Lý do thêm</th></tr></thead>
<tbody>
<tr><td>Tiếng Anh, bạn đọc tiếng Việt</td><td>API gateway</td><td>cổng API</td><td>Thuật ngữ kỹ thuật</td></tr>
<tr><td>Tiếng Anh, bạn đọc tiếng Việt</td><td>Acme Holdings</td><td>Acme Holdings</td><td>Giữ nguyên tên công ty</td></tr>
<tr><td>Tiếng Trung, bạn đọc tiếng Việt</td><td>增值税</td><td>thuế giá trị gia tăng</td><td>Thuật ngữ thuế</td></tr>
<tr><td>Tiếng Hàn, bạn đọc tiếng Việt</td><td>회의록</td><td>biên bản họp</td><td>Từ dùng trong công việc</td></tr>
<tr><td>Tiếng Việt, bạn đọc tiếng Anh</td><td>biên bản nghiệm thu</td><td>acceptance report</td><td>Thuật ngữ dự án</td></tr>
<tr><td>Tiếng Việt, bạn đọc tiếng Anh</td><td>Đà Nẵng</td><td>Da Nang</td><td>Địa danh</td></tr>
</tbody></table></div>
<p>Muốn xem lại những gì đã được dịch, hãy mở <a href="/huong-dan/lich-su-va-xuat-file/">bản chép lời và lịch sử</a>. Nếu từ điển không như mong đợi, xem <a href="/huong-dan/khac-phuc-su-co/">khắc phục sự cố</a>.</p>
`,
})}
${docNav(
  [
    { href: "/huong-dan/thanh-phu-de-va-phim-tat/", kicker: "Bài trước", title: "Thanh phụ đề và phím tắt" },
    { href: "/huong-dan/lich-su-va-xuat-file/", kicker: "Bài tiếp theo", title: "Lịch sử và xuất bản chép lời" },
  ],
  "Bài liên quan",
)}
</div></section>
`,
};
