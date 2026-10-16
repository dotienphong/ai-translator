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
    "Mua Monthly, 6 Months hoặc Yearly bằng VietQR hoặc thẻ quốc tế trong app, nhập key, đổi máy, gia hạn, đổi gói, xử lý đơn không thành, hoàn tiền, key bị khóa.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-08",
  modified: "2026-10-15",
  llm: "Hướng dẫn mua gói Monthly, 6 Months hoặc Yearly bằng VietQR hoặc thẻ quốc tế trong app (chọn Cách thanh toán), nhận và nhập key, mất key, mỗi key một máy và cách đổi máy, ngoại tuyến 14 ngày, gia hạn, đổi gói, đơn thẻ không thành hay quá giờ hẹn (đã trả thì đừng trả lại), điều kiện hoàn tiền.",
  llmTitle: "Mua gói, kích hoạt key và đổi máy trong AI Translator",
  schema: [
    howTo({
      name: "Mua gói và kích hoạt AI Translator",
      description: "Mua gói Monthly, 6 Months hoặc Yearly bằng VietQR hoặc thẻ quốc tế trong app và kích hoạt key trên máy của bạn.",
      totalTime: "PT10M",
      steps: [
        { name: "Mở Nâng cấp Pro", text: "Bấm Nâng cấp Pro ở thanh bên để xem bốn gói. Mua gói cần kết nối mạng." },
        { name: "Chọn Cách thanh toán và gói", text: "Chọn Cách thanh toán ở đầu màn hình: Chuyển khoản VietQR (VND) hoặc Thẻ quốc tế (USD); app chọn sẵn theo nước nơi bạn kết nối mạng và bạn đổi được. Rồi chọn khung Monthly, 6 Months hoặc Yearly; giá đổi theo cách trả." },
        { name: "Nhập email nhận key", text: "Nhập Email nhận key, tick ô đồng ý (với thẻ quốc tế, email cũng được gửi cho Creem để điền sẵn trang thanh toán), rồi bấm Tạo mã thanh toán (VietQR) hoặc Thanh toán trong trình duyệt (thẻ quốc tế)." },
        { name: "Trả tiền", text: "VietQR: quét mã bằng app ngân hàng Việt Nam trong 15 phút hoặc bấm Mở trang thanh toán. Thẻ quốc tế: trả trên trang thanh toán của Creem mà app tự mở trong trình duyệt, trong 30 phút (app ghi Trả trước …). Nếu bạn trả muộn hơn mà trang vẫn nhận, key vẫn gửi qua email; đã trả thì đừng trả lại." },
        { name: "Kích hoạt", text: "App tự kích hoạt khi nhận được tiền. Nếu cần, mở Cài đặt › Bản quyền, dán key trong email vào ô Nhập license key và bấm Kích hoạt." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Mua gói, kích hoạt key và đổi máy",
  lead: "Bạn mua gói AI Translator ngay trong app: chọn Monthly, 6 Months hoặc Yearly, trả bằng VietQR hoặc thẻ quốc tế, rồi nhận key qua email; app cũng tự kích hoạt gói trên máy đang dùng. Mỗi key chỉ dùng trên một máy; muốn chuyển máy, hãy gỡ kích hoạt ở máy cũ rồi nhập key ở máy mới.",
  meta: `<span>Cập nhật {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
${facts([
  ["Gói", "Monthly 50.000 ₫ hoặc 3,99 USD (30 ngày, 50 giờ)<small>6 Months 269.000 ₫ hoặc 21,99 USD (180 ngày, 100 giờ mỗi 30 ngày)</small><small>Yearly 500.000 ₫ hoặc 39,99 USD (365 ngày, không giới hạn)</small>"],
  ["Thanh toán", "VietQR (ngân hàng Việt Nam, VND) hoặc thẻ quốc tế (USD, qua Creem)<small>Giá USD chưa gồm thuế · không tự gia hạn</small>"],
  ["Số máy", "Mỗi key một máy"],
  ["Ngoại tuyến", "Tối đa 14 ngày giữa hai lần kiểm tra bản quyền"],
  ["Hoàn tiền", "Đã thanh toán thì không hoàn lại, trừ các trường hợp trong Điều khoản<small>Gửi yêu cầu trong 7 ngày kể từ ngày thanh toán</small>"],
])}

<h2 id="mua-goi">Mua gói trong app</h2>
<ol>
<li>Bấm <strong>Nâng cấp Pro</strong> ở thanh bên. Màn hình hiện đủ bốn gói, gói đang dùng có nhãn “Đang dùng”. Mua gói cần kết nối mạng.</li>
<li>Chọn <strong>Cách thanh toán</strong> ở đầu màn hình: <strong>Chuyển khoản VietQR (VND)</strong> hoặc <strong>Thẻ quốc tế (USD)</strong>. App chọn sẵn theo nước nơi bạn kết nối mạng (VietQR ở Việt Nam, thẻ quốc tế ở nước khác; dùng VPN thì có thể khác) và bạn đổi được; giá trên các khung gói đổi theo lựa chọn. Không thấy mục này: hãy cập nhật app lên bản mới nhất; nếu vẫn không có thì thẻ quốc tế chưa được bán lúc này, và app dùng VietQR.</li>
<li>Bấm vào khung <strong>Monthly</strong>, <strong>6 Months</strong> hoặc <strong>Yearly</strong> (giá ghi chữ lớn theo cách trả đã chọn, như “50.000 đ / 30 ngày” hay “$3.99 / 30 ngày”; giá USD chưa gồm thuế); khung đã chọn có viền xanh.</li>
<li>Nhập <strong>Email nhận key</strong> và tick ô đồng ý: ô này cho phép app lưu email để gửi và khôi phục key; với thẻ quốc tế, câu đồng ý còn ghi email được gửi cho Creem để điền sẵn trang thanh toán (đổi cách trả thì tick lại). Bên dưới có mục gập <strong>Chính sách quyền riêng tư</strong> và, với thẻ quốc tế, <strong>Thỏa thuận cấp phép (EULA)</strong>, để bạn đọc ngay trong app. Rồi bấm <strong>Tạo mã thanh toán</strong> (VietQR) hoặc <strong>Thanh toán trong trình duyệt</strong> (thẻ quốc tế).</li>
<li><strong>VietQR:</strong> quét mã bằng app ngân hàng, hoặc bấm <strong>Mở trang thanh toán</strong> (PayOS, mở trong trình duyệt). Mã dùng được 15 phút; giờ hết hạn ghi trên màn hình.</li>
<li><strong>Thẻ quốc tế:</strong> app tự mở trang thanh toán của Creem trong trình duyệt và hiện khung <strong>Hoàn tất thanh toán trong trình duyệt</strong> kèm mã đơn, số tiền và giờ hẹn ghi dạng “Trả trước …”. Hãy trả trong 30 phút. Nếu bạn trả muộn hơn mà trang vẫn nhận, khoản trả vẫn được ghi nhận: app vẫn chờ xác nhận và key cũng gửi qua email, nên đừng trả lại. Trả xong, quay lại app; nếu trình duyệt không mở, bấm <strong>Mở lại trang thanh toán</strong>. Khi đơn đang chờ, cách thanh toán và gói bị khóa; đã trả thì đừng bấm Hủy hay tạo đơn mới.</li>
<li>Chờ app xác nhận (app hỏi trạng thái đơn vài giây một lần; với thẻ, dòng trạng thái ghi “Đang chờ xác nhận thanh toán…”): “Đã nhận tiền. Gói đã có hiệu lực trên máy này; key đã gửi vào email.”</li>
</ol>
${appShot({
  slug: "app-upgrade",
  lang: "vi",
  alt: "Màn hình Nâng cấp khi chọn sẵn VietQR: nhóm Cách thanh toán với hai lựa chọn (Chuyển khoản VietQR (VND) đang chọn và Thẻ quốc tế (USD)), bốn gói Free, Monthly, 6 Months và Yearly với hạn mức và giá bằng VND, ô Email nhận key, ô đồng ý, mục gập Chính sách quyền riêng tư và nút Tạo mã thanh toán",
  caption: "Màn hình Nâng cấp.",
})}
${appShot({
  slug: "app-upgrade-qr",
  lang: "vi",
  alt: "Màn hình Nâng cấp khi đơn VietQR đang chờ: nhóm Cách thanh toán với VietQR đang chọn, mã VietQR hiện trong app kèm mã đơn, số tiền, giờ hết hạn của mã, dòng trạng thái đang chờ chuyển khoản, nút Mở trang thanh toán và nút Hủy",
  caption: "Mã VietQR trong app, kèm mã đơn.",
})}
${appShot({
  slug: "app-upgrade-card",
  lang: "vi",
  alt: "Màn hình Nâng cấp khi đơn thẻ quốc tế đang chờ: Thẻ quốc tế (USD) đang chọn, giá các gói bằng USD chưa gồm thuế, hai ghi chú nói trang thanh toán của Creem mở trong trình duyệt và Creem là bên bán lại (merchant of record), rồi khung Hoàn tất thanh toán trong trình duyệt với mã đơn, số tiền, giờ hẹn trả, dòng Đang chờ xác nhận thanh toán…, nút Mở lại trang thanh toán, nút Hủy và lời dặn đã trả thì đừng hủy hay tạo đơn mới",
  caption: "Đơn thẻ quốc tế đang chờ trong app.",
})}
<p>VietQR chỉ dùng được với tài khoản ngân hàng Việt Nam, bằng VND, qua PayOS; nếu thẻ quốc tế chưa được bán lúc này mà bạn không có tài khoản đó, hãy liên hệ hỗ trợ. Giá thẻ quốc tế tính bằng USD, chưa gồm thuế (nếu có thì Creem cộng thêm ở trang thanh toán). Creem là bên bán lại (merchant of record) của đơn thẻ và xử lý thanh toán, thuế, biên lai; sao kê thẻ thường ghi “CREEM.IO* STORE”. Giá và hạn mức xem ở <a href="/bang-gia/">bảng giá</a>.</p>

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
<tr><th scope="row">Bạn còn dùng được máy cũ</th><td>Ở máy cũ, mở <strong>Cài đặt › Bản quyền › Gỡ kích hoạt máy này</strong> và xác nhận bằng <strong>Gỡ kích hoạt</strong> (nút đỏ trong khung hỏi lại màu đỏ nhạt). Máy cũ về Free. Rồi nhập key ở máy mới.</td></tr>
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
<li><strong>Gia hạn cùng gói:</strong> cộng 30 ngày (Monthly), 180 ngày (6 Months) hoặc 365 ngày (Yearly), tính từ ngày hết hạn nếu gói còn hạn.</li>
<li><strong>Đổi gói khi còn hạn:</strong> gói mới bắt đầu ngay với chu kỳ hạn mức mới; số ngày còn lại của gói cũ được quy đổi theo giá mỗi ngày và làm tròn xuống: <code>ngày quy đổi = ngày còn lại × (giá cũ ÷ ngày cũ) ÷ (giá mới ÷ ngày mới)</code>, với giá cũ và giá mới là giá của hai gói tính bằng loại tiền của đơn đổi gói (VND hoặc USD).</li>
<li><strong>Hết hạn:</strong> máy về Free nếu còn trong 10 ngày dùng thử, nếu không thì chưa dịch được cho tới khi bạn mua gói. Tính năng Pro bị khóa.</li>
</ul>
<p>Giá mỗi ngày: Monthly 50.000 ÷ 30 ≈ 1.667 ₫, 6 Months 269.000 ÷ 180 ≈ 1.494 ₫, Yearly 500.000 ÷ 365 ≈ 1.370 ₫. Ví dụ tính theo giá VND: Monthly còn 20 ngày, mua Yearly được cộng 20 × 1.667 ÷ 1.370 ≈ 24 ngày, nên Yearly chạy 365 + 24 = 389 ngày; mua 6 Months thì được cộng 20 × 1.667 ÷ 1.494 ≈ 22 ngày, nên 6 Months chạy 180 + 22 = 202 ngày. Ngược lại, Yearly còn 200 ngày, mua Monthly được cộng ≈ 164 ngày, nên Monthly chạy 30 + 164 = 194 ngày. Vì công thức dùng giá của cả hai gói tính bằng loại tiền của đơn đổi gói (VND hoặc USD), trả bằng USD thì số ngày có thể khác: ở các ví dụ này chỉ lệch tối đa một ngày, nhưng với số ngày còn lại lớn hơn thì có thể lệch nhiều ngày (6 Months còn 180 ngày, mua Monthly được cộng 161 ngày khi trả bằng VND và 165 ngày khi trả bằng USD). App hiện trước số ngày quy đổi và ngày hết hạn mới (ước tính), kèm “Không hoàn tiền.”</p>

<h2 id="hoan-tien">Sự cố thanh toán, hoàn tiền và hóa đơn</h2>
<ul>
<li><strong>Đơn VietQR:</strong> “Số tiền nhận được ít hơn giá gói. Chuyển bù cho đơn … trong 24 giờ, hoặc liên hệ hỗ trợ kèm mã đơn này.” Chuyển bù phần thiếu, hoặc liên hệ.</li>
<li><strong>Đơn thẻ trả thiếu</strong> (số tiền nhận được ít hơn giá gói): app ghi “Đã nhận tiền; hỗ trợ đang xử lý đơn …. Cần thì liên hệ hỗ trợ kèm mã đơn này.” Nghĩa là cần người vận hành xem đơn này; đừng trả thêm.</li>
<li>“Đã nhận tiền nhưng chưa kích hoạt được key trên máy này…” Nhập key trong email ở Cài đặt › Bản quyền.</li>
<li>Đã trả bằng thẻ mà app vẫn ghi “Đang chờ xác nhận thanh toán…”: chờ vài phút (máy chủ của chúng tôi hỏi lại Creem định kỳ), rồi kiểm email xem đã có key chưa. Vẫn không có thì liên hệ hỗ trợ kèm mã đơn và biên lai của Creem.</li>
<li><strong>Đơn thẻ báo không thành hay quá giờ hẹn.</strong> App ghi “Đơn … không thành. Nếu bạn đã trả, key sẽ gửi qua email; đừng trả lại. Cần thì liên hệ hỗ trợ kèm mã đơn này.” hoặc “Đã quá giờ hẹn trả. Nếu bạn đã trả, app vẫn tự kích hoạt khi Creem xác nhận và key cũng gửi qua email; đừng trả lại.” Nếu bạn đã trả bằng thẻ thì đừng trả lại: key vẫn gửi qua email; nhập key ở Cài đặt › Bản quyền, hoặc liên hệ hỗ trợ kèm mã đơn và biên lai của Creem (sao kê thẻ thường ghi “CREEM.IO* STORE”; tra đơn ở creem.io/my-orders/login). Nếu bạn chưa trả thì tạo đơn mới là được.</li>
<li><strong>Hủy đơn thẻ.</strong> Khi đơn đang chờ, dưới hai nút app ghi “Đã trả ở trang thanh toán thì đừng hủy hay tạo đơn mới: key sẽ gửi qua email. Đã hủy đơn này thì đừng trả ở trang cũ.” Nghĩa là: đã trả thì đừng bấm Hủy; đã bấm Hủy thì đừng trả ở trang thanh toán của đơn đó, hãy tạo đơn mới.</li>
</ul>
<p>Đã thanh toán thì không hoàn lại, trừ khi lỗi từ phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác. Gửi yêu cầu cho chúng tôi trước, trong 7 ngày kể từ ngày thanh toán, tới support@aitranslator.io.vn kèm <strong>mã đơn</strong> (hiện ở màn hình Nâng cấp dạng “Đơn …”); đổi gói không được hoàn tiền. Đơn thẻ: Creem là bên bán lại và gửi biên lai tới email bạn nhập; Creem cũng có thể hoàn tiền theo điều khoản của Creem (nếu chúng tôi không trả lời quá 7 ngày, bạn có thể liên hệ Creem; tra đơn ở creem.io/my-orders/login). Khi một đơn được hoàn tiền (toàn bộ hay một phần, kể cả qua tranh chấp thẻ), chúng tôi có thể rút ngắn thời hạn mà đơn đó đã cộng vào license, hoặc thu hồi license nếu license chỉ gồm đơn đó; việc này không tự động: người vận hành quyết định theo từng trường hợp. Đơn VietQR chưa có hóa đơn điện tử; nếu bạn cần chứng từ, hãy liên hệ hỗ trợ để trao đổi. Chi tiết trong <a href="/dieu-khoan/">Điều khoản sử dụng</a> và <a href="/lien-he/">trang liên hệ</a>.</p>
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
