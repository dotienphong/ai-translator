import { pageHero, callout, facts, appShot, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Mua gói, kích hoạt key và đổi máy", path: "/huong-dan/mua-va-kich-hoat-key/" },
];

const toc = [
  { level: 2, id: "mua-goi", text: "Mua gói trong app" },
  { level: 2, id: "nhap-key", text: "Nhận key và nhập key" },
  { level: 3, id: "mat-key", text: "Mất key" },
  { level: 2, id: "doi-may", text: "Mỗi key một máy: đổi máy" },
  { level: 2, id: "ngoai-tuyen", text: "Ngoại tuyến và kiểm tra bản quyền" },
  { level: 2, id: "gia-han-doi-goi", text: "Gia hạn, đổi gói, hết hạn" },
  { level: 2, id: "hoan-tien", text: "Sự cố thanh toán, hoàn tiền" },
];

export default {
  id: "guide-license",
  lang: "vi",
  path: "/huong-dan/mua-va-kich-hoat-key/",
  title: "Mua gói, kích hoạt key, đổi máy: hướng dẫn",
  description:
    "Cách mua Monthly hoặc Yearly bằng VietQR trong app, nhập key từ email, đổi máy, gia hạn và đổi gói, điều kiện hoàn tiền và cách xử lý khi key bị khóa.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-08",
  llm: "Hướng dẫn mua gói Monthly hoặc Yearly bằng VietQR trong app, nhận và nhập key, mất key, mỗi key một máy và cách đổi máy, ngoại tuyến 14 ngày, gia hạn, đổi gói, điều kiện hoàn tiền.",
  llmTitle: "Mua gói, kích hoạt key và đổi máy trong AI Translator",
  schema: [
    howTo({
      name: "Mua gói và kích hoạt AI Translator",
      description: "Mua gói Monthly hoặc Yearly bằng VietQR trong app và kích hoạt key trên máy của bạn.",
      totalTime: "PT10M",
      steps: [
        { name: "Mở Nâng cấp Pro", text: "Bấm Nâng cấp Pro ở thanh bên để xem ba gói và chọn Monthly hoặc Yearly." },
        { name: "Nhập email nhận key", text: "Nhập email, tick ô đồng ý lưu email để gửi và khôi phục key, rồi bấm Tạo mã thanh toán." },
        { name: "Quét mã VietQR", text: "Quét mã bằng app ngân hàng Việt Nam trong 15 phút hoặc bấm Mở trang thanh toán." },
        { name: "Kích hoạt", text: "App tự kích hoạt khi nhận được tiền. Nếu cần, mở Cài đặt › Bản quyền, dán key trong email vào ô Nhập license key và bấm Kích hoạt." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Mua gói, kích hoạt key và đổi máy",
  lead: "Bạn mua gói AI Translator ngay trong app: chọn Monthly hoặc Yearly, quét mã VietQR, rồi nhận key qua email; app cũng tự kích hoạt gói trên máy đang dùng. Mỗi key chỉ dùng trên một máy; muốn chuyển máy, hãy gỡ kích hoạt ở máy cũ rồi nhập key ở máy mới.",
  meta: `<span>Cập nhật 08/10/2026</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
${facts([
  ["Gói", "Monthly 50.000 ₫ (30 ngày, 50 giờ)<small>Yearly 500.000 ₫ (365 ngày, không giới hạn)</small>"],
  ["Thanh toán", "VietQR, ngân hàng Việt Nam, VND<small>Không thẻ quốc tế, không tự gia hạn</small>"],
  ["Số máy", "Mỗi key một máy"],
  ["Ngoại tuyến", "Tối đa 14 ngày giữa hai lần kiểm tra bản quyền"],
  ["Hoàn tiền", "Đã thanh toán thì không hoàn lại, trừ các trường hợp trong Điều khoản<small>Gửi yêu cầu trong 7 ngày kể từ ngày thanh toán</small>"],
])}

<h2 id="mua-goi">Mua gói trong app</h2>
<ol>
<li>Bấm <strong>Nâng cấp Pro</strong> ở thanh bên. Màn hình hiện đủ ba gói, gói đang dùng có nhãn “Đang dùng”. Mua gói cần kết nối mạng.</li>
<li>Chọn <strong>Monthly</strong> hoặc <strong>Yearly</strong>.</li>
<li>Nhập <strong>Email nhận key</strong>, tick ô đồng ý để app lưu email này nhằm gửi và khôi phục key, rồi bấm <strong>Tạo mã thanh toán</strong>.</li>
<li>Quét mã VietQR bằng app ngân hàng, hoặc bấm <strong>Mở trang thanh toán</strong> (PayOS, mở trong trình duyệt). Mã dùng được 15 phút; giờ hết hạn ghi trên màn hình.</li>
<li>Chờ app xác nhận (app hỏi trạng thái đơn mỗi 3 giây): “Đã nhận tiền. Gói đã có hiệu lực trên máy này; key đã gửi vào email.”</li>
</ol>
${appShot({
  slug: "app-upgrade",
  lang: "vi",
  alt: "Màn hình Nâng cấp: ba gói Free, Monthly và Yearly với hạn mức và giá, ô Email nhận key, ô đồng ý và nút Tạo mã thanh toán",
  caption: "Màn hình Nâng cấp.",
})}
${appShot({
  slug: "app-upgrade-qr",
  lang: "vi",
  alt: "Mã VietQR hiện trong app kèm mã đơn, giờ hết hạn của mã, nút Mở trang thanh toán và dòng trạng thái đang chờ chuyển khoản",
  caption: "Mã VietQR trong app, kèm mã đơn.",
})}
<p>Chỉ nhận chuyển khoản từ ngân hàng Việt Nam, bằng VND, qua PayOS. Giá và hạn mức xem ở <a href="/bang-gia/">bảng giá</a>.</p>

<h2 id="nhap-key">Nhận key qua email và nhập key</h2>
<p>Key được gửi từ no-reply@mail.aitranslator.io.vn tới email bạn đã nhập. Hãy giữ thư này để cài lại hoặc kích hoạt máy khác; không thấy thư thì kiểm hộp thư rác. Key gồm 7 nhóm 4 ký tự: <code>XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX</code>.</p>
<ol>
<li>Mở <strong>Cài đặt › Bản quyền</strong>.</li>
<li>Ở mục <strong>Kích hoạt key</strong>, dán key vào ô <strong>Nhập license key</strong> (dấu gạch, khoảng trắng, chữ hoa hay thường đều không quan trọng).</li>
<li>Bấm <strong>Kích hoạt</strong>.</li>
</ol>
<p>App kiểm key ngay trên máy; gõ sai thì báo “Key này không đúng. Kiểm lại xem có gõ sai không.” Sau khi kích hoạt, app chỉ hiện key dạng che; key đầy đủ nằm trong email. Muốn nhập key khác, hãy bấm <strong>Gỡ kích hoạt máy này</strong> trước. Giữ key bí mật, không chia sẻ.</p>
${appShot({
  slug: "app-settings-license",
  lang: "vi",
  alt: "Nhóm Bản quyền trong Cài đặt sau khi kích hoạt: gói Monthly đang dùng, key đã che chỉ lộ nhóm cuối, ngày hết hạn, số phút còn lại, các nút Gia hạn hoặc đổi gói, Kiểm tra ngay, Gỡ kích hoạt máy này và mục Mất key?",
  caption: "Cài đặt › Bản quyền sau khi kích hoạt.",
})}
<h3 id="mat-key">Mất key</h3>
<p>Vào <strong>Cài đặt › Bản quyền › Mất key?</strong>, nhập <strong>Email đã dùng để mua</strong> rồi bấm <strong>Gửi lại key</strong>. Mọi key còn hiệu lực của email đó được gửi vào chính email đó. App luôn hiện “Nếu email này có key, thư đang được gửi.”, dù email có key hay không. Vẫn không thấy thì viết tới support@aitranslator.io.vn.</p>

<h2 id="doi-may">Mỗi key một máy: cách đổi máy</h2>
<p>Cài lại app trên cùng một máy không tính là máy mới. Hạn mức tính riêng từng máy: lượng đã dùng ở lại máy cũ.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Tình huống</th><th scope="col">Cách làm</th></tr></thead>
<tbody>
<tr><th scope="row">Bạn còn dùng được máy cũ</th><td>Ở máy cũ, mở <strong>Cài đặt › Bản quyền › Gỡ kích hoạt máy này</strong> và xác nhận bằng <strong>Gỡ kích hoạt</strong>. Máy cũ về Free. Rồi nhập key ở máy mới.</td></tr>
<tr><th scope="row">Máy cũ hỏng hoặc không với tới</th><td>Ở máy mới, nhập key. App hiện máy đang giữ key và nút <strong>Gỡ máy kia và dùng máy này</strong>.</td></tr>
<tr><th scope="row">Bạn bấm <strong>Vẫn kích hoạt trên máy này</strong></th><td>Key bị tạm khóa trên cả hai máy cho tới khi một máy gỡ key. App hỏi xác nhận trước.</td></tr>
</tbody></table></div>
<p>Khi key bị tạm khóa, nhóm Bản quyền hiện nhãn <strong>Tạm khóa</strong>, câu “Key đang dùng trên 2 máy nên đã bị tạm khóa. Gỡ key khỏi một máy để dùng tiếp.” và danh sách hai máy. Bấm <strong>Gỡ key khỏi máy này</strong> hoặc <strong>Gỡ máy kia</strong>, rồi <strong>Thử lại</strong>. Trong lúc khóa, gói trả phí không dùng được trên cả hai máy.</p>
${callout({
  kind: "warn",
  title: "Đừng đổi máy qua lại liên tục.",
  text: "Đổi máy nhiều lần trong 30 ngày có thể làm key bị khóa tạm: “Key này đang bị khóa tạm vì đổi máy quá nhiều lần. Vui lòng liên hệ hỗ trợ.”",
})}

<h2 id="ngoai-tuyen">Ngoại tuyến và kiểm tra bản quyền</h2>
<p>Nhận dạng và dịch không cần mạng. Gói trả phí chỉ cần kiểm tra bản quyền qua mạng ít nhất mỗi 14 ngày. Quá 14 ngày chưa kiểm được thì app chuyển về Free (nếu máy còn trong 10 ngày dùng thử; hết dùng thử thì chưa dịch được cho tới khi kiểm lại được bản quyền) và báo “Đã 14 ngày chưa kiểm được gói nên đang dùng Free. Hãy kết nối mạng.” Kết nối mạng rồi bấm <strong>Kiểm tra ngay</strong> ở Cài đặt › Bản quyền. Giờ máy bị chỉnh lùi cũng làm app báo lỗi; xem <a href="/huong-dan/khac-phuc-su-co/">khắc phục sự cố</a>.</p>

<h2 id="gia-han-doi-goi">Gia hạn, đổi gói và hết hạn</h2>
<ul>
<li><strong>Không tự gia hạn.</strong> App nhắc “Gói còn dưới 7 ngày. Gia hạn để tiếp tục dùng tính năng Pro.” Bấm <strong>Gia hạn hoặc đổi gói</strong> ở Cài đặt › Bản quyền.</li>
<li><strong>Gia hạn cùng gói:</strong> cộng 30 ngày (Monthly) hoặc 365 ngày (Yearly), tính từ ngày hết hạn nếu gói còn hạn.</li>
<li><strong>Đổi gói khi còn hạn:</strong> gói mới bắt đầu ngay với chu kỳ hạn mức mới; số ngày còn lại của gói cũ được quy đổi theo giá mỗi ngày và làm tròn xuống: <code>ngày quy đổi = ngày còn lại × (giá cũ ÷ ngày cũ) ÷ (giá mới ÷ ngày mới)</code>.</li>
<li><strong>Hết hạn:</strong> máy về Free nếu còn trong 10 ngày dùng thử, nếu không thì chưa dịch được cho tới khi bạn mua gói. Tính năng Pro bị khóa.</li>
</ul>
<p>Giá mỗi ngày: Monthly 50.000 ÷ 30 ≈ 1.667 ₫, Yearly 500.000 ÷ 365 ≈ 1.370 ₫. Ví dụ: Monthly còn 20 ngày, mua Yearly được cộng 20 × 1.667 ÷ 1.370 ≈ 24 ngày, nên Yearly chạy 365 + 24 = 389 ngày. Ngược lại, Yearly còn 200 ngày, mua Monthly được cộng ≈ 164 ngày, nên Monthly chạy 30 + 164 = 194 ngày. App hiện trước số ngày quy đổi và ngày hết hạn mới (ước tính), kèm “Không hoàn tiền.”</p>

<h2 id="hoan-tien">Sự cố thanh toán, hoàn tiền và hóa đơn</h2>
<ul>
<li>“Số tiền nhận được ít hơn giá gói. Chuyển bù cho đơn … trong 24 giờ, hoặc liên hệ hỗ trợ kèm mã đơn này.” Chuyển bù phần thiếu, hoặc liên hệ.</li>
<li>“Đã nhận tiền nhưng chưa kích hoạt được key trên máy này…” Nhập key trong email ở Cài đặt › Bản quyền.</li>
</ul>
<p>Đã thanh toán thì không hoàn lại, trừ khi lỗi từ phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác. Gửi yêu cầu trong 7 ngày kể từ ngày thanh toán tới support@aitranslator.io.vn kèm <strong>mã đơn</strong> (hiện ở màn hình Nâng cấp dạng “Đơn …”); đổi gói không được hoàn tiền. Chưa có hóa đơn điện tử; nếu bạn cần chứng từ, hãy liên hệ hỗ trợ để trao đổi. Chi tiết trong <a href="/dieu-khoan/">Điều khoản sử dụng</a> và <a href="/lien-he/">trang liên hệ</a>.</p>
`,
})}
${docNav(
  [
    { href: "/huong-dan/lich-su-va-xuat-file/", kicker: "Bài trước", title: "Lịch sử và xuất bản chép lời" },
    { href: "/huong-dan/khac-phuc-su-co/", kicker: "Bài tiếp theo", title: "Khắc phục sự cố" },
  ],
  "Bài liên quan",
)}
</div></section>
`,
};
