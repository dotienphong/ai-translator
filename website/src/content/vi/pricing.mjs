import { pageHero, sectionHead, plansGrid, steps, faq, ctaBand, callout, appShot, checkList, icon } from "../../build/components.mjs";
import { faqPage } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Bảng giá", path: "/bang-gia/" },
];

export const PRICING_FAQ = [
  {
    q: "Gói Free khác gì gói trả phí?",
    a: "<p>Free là bản dùng thử: 10 ngày kể từ lần đầu máy đăng ký dùng thử, mỗi ngày tối đa 30 phút dịch, mỗi máy một lần. Gói trả phí (Monthly, Yearly) có thêm các tính năng Pro (từ điển thuật ngữ, lịch sử, xuất file) và hạn mức dịch lớn hơn.</p>",
  },
  {
    q: "Hết 10 ngày dùng thử thì sao?",
    a: "<p>Máy đó không dùng được gói Free nữa và cần mua Monthly hoặc Yearly để tiếp tục dịch. Gỡ app rồi cài lại, xóa dữ liệu hay xóa Keychain đều không mở lại 10 ngày dùng thử, vì máy chủ ghi ngày bắt đầu theo máy.</p>",
  },
  {
    q: "Tôi có thể trả bằng thẻ Visa, PayPal không?",
    a: "<p>Chưa. Hiện chỉ nhận chuyển khoản từ ngân hàng Việt Nam bằng mã VietQR, tính bằng VND, qua cổng PayOS. Chưa có thẻ quốc tế hay thanh toán định kỳ.</p>",
  },
  {
    q: "Gói có tự động gia hạn không?",
    a: "<p>Không. Mỗi gói là một đơn trả trước, hết hạn thì dừng. App nhắc bạn trước 7 ngày; bạn gia hạn khi muốn. Gia hạn cùng gói sẽ cộng thêm 30 ngày (Monthly) hoặc 365 ngày (Yearly), tính từ ngày hết hạn nếu gói còn hạn.</p>",
  },
  {
    q: "Tôi dùng được key trên mấy máy?",
    a: "<p>Mỗi key dùng trên một máy. Muốn chuyển sang máy khác, bạn gỡ kích hoạt ở máy cũ trong Cài đặt › Bản quyền, hoặc ở máy mới chọn \"Gỡ máy kia và dùng máy này\". Nếu cùng lúc kích hoạt trên hai máy, key bị tạm khóa trên cả hai cho tới khi một máy gỡ key.</p>",
  },
  {
    q: "Có hoàn tiền không?",
    a: "<p>Đã thanh toán thì không hoàn lại, trừ khi lỗi do phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác. Hãy gửi yêu cầu trong 7 ngày kể từ ngày thanh toán tới support@aitranslator.io.vn kèm mã đơn. Đổi gói không được hoàn tiền. Chi tiết trong <a href=\"/dieu-khoan/\">Điều khoản sử dụng</a>.</p>",
  },
  {
    q: "Tôi cần hóa đơn điện tử cho doanh nghiệp?",
    a: "<p>Hiện chúng tôi chưa hỗ trợ xuất hóa đơn điện tử. Nếu bạn cần chứng từ, hãy liên hệ support@aitranslator.io.vn để trao đổi.</p>",
  },
  {
    q: "Thời lượng dịch được tính thế nào?",
    a: "<p>Chỉ tính phần tiếng nói đã được dịch xong, theo độ dài của tiếng nói. Thời gian im lặng, câu đã ở đúng ngôn ngữ bạn muốn đọc và đoạn chưa dịch được không bị tính. Hạn mức tính riêng cho từng máy.</p>",
  },
  {
    q: "Tôi bị mất key, làm sao?",
    a: "<p>Vào Cài đặt › Bản quyền › Mất key?, nhập email đã dùng khi mua và chọn Gửi lại key. Key còn hiệu lực của email đó sẽ được gửi vào chính email đó. Hoặc liên hệ support@aitranslator.io.vn.</p>",
  },
];

export default {
  id: "pricing",
  lang: "vi",
  path: "/bang-gia/",
  title: "Bảng giá AI Translator: Free, Monthly 50.000 ₫, Yearly 500.000 ₫",
  description:
    "Ba gói AI Translator: Free dùng thử 10 ngày, Monthly 50.000 ₫ (50 giờ/30 ngày), Yearly 500.000 ₫ (không giới hạn 365 ngày). Trả trước bằng VietQR.",
  software: true,
  breadcrumbs: crumbs,
  modified: "2026-10-08",
  schema: [faqPage(PRICING_FAQ.map((f) => ({ q: f.q, a: f.a.replace(/<[^>]+>/g, "") })))],
  llm: "Bảng giá ba gói (Free dùng thử 10 ngày, Monthly 50.000 đ, Yearly 500.000 đ), cách tính thời lượng, cách mua bằng VietQR, đổi gói, hoàn tiền và câu hỏi về giá.",
  llmTitle: "Bảng giá AI Translator",
  body: () => `
${pageHero({ crumbs, title: "Bảng giá đơn giản: trả trước, không tự gia hạn", lead: "Dùng thử miễn phí 10 ngày, rồi chọn Monthly hoặc Yearly khi bạn thấy hữu ích. Thanh toán bằng VietQR ngay trong app, nhận key qua email." })}

<section class="section-tight"><div class="container">
<h2 class="sr-only">Các gói và giá</h2>
${plansGrid("vi", { ctaLabel: "Nhận bản beta", freeLabel: "Đăng ký dùng thử" })}
<p class="disclaimer">Giá tính bằng đồng Việt Nam (VND) cho mỗi đơn, đúng bằng số tiền trong mã VietQR. Giá có thể thay đổi; gói bạn đã mua giữ nguyên hạn mức.</p>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "So sánh", title: "Mỗi gói gồm những gì", center: true })}
<div class="table-wrap reveal"><table class="compare">
<thead><tr><th scope="col"></th><th scope="col">Free (dùng thử)</th><th scope="col">Monthly</th><th scope="col">Yearly</th></tr></thead>
<tbody>
<tr><th scope="row">Giá</th><td>0 ₫</td><td>50.000 ₫ mỗi đơn</td><td>500.000 ₫ mỗi đơn</td></tr>
<tr><th scope="row">Thời hạn</th><td>10 ngày, mỗi máy một lần</td><td>30 ngày mỗi đơn</td><td>365 ngày mỗi đơn</td></tr>
<tr><th scope="row">Thời lượng dịch</th><td>30 phút mỗi ngày</td><td>50 giờ (3000 phút) mỗi chu kỳ 30 ngày</td><td>Không giới hạn</td></tr>
<tr><th scope="row">Phụ đề dịch trực tiếp, 5 ngôn ngữ</th><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Thanh phụ đề tùy chỉnh, phím tắt</th><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Sao chép bản chép lời</th><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Từ điển thuật ngữ (Pro)</th><td><span class="no">Không</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Lịch sử các phiên (Pro)</th><td><span class="no">Không</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Xuất TXT, SRT, Markdown (Pro)</th><td><span class="no">Không</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Số máy cho mỗi key</th><td>Không cần key</td><td>1 máy</td><td>1 máy</td></tr>
<tr><th scope="row">Quy ra mỗi tháng</th><td>0 ₫</td><td>50.000 ₫</td><td>khoảng 41.700 ₫</td></tr>
</tbody></table></div>
<p class="small muted">Mua 12 đơn Monthly liên tiếp (360 ngày) tốn 600.000 ₫, so với 500.000 ₫ cho 365 ngày của một đơn Yearly. Monthly giới hạn 50 giờ dịch mỗi 30 ngày, Yearly không giới hạn.</p>
</div></section>

<section class="section section-alt"><div class="container">
<div class="split wide-left reverse">
<div>
${appShot({ slug: "app-upgrade", lang: "vi", alt: "Màn hình Nâng cấp trong app hiển thị ba gói Free, Monthly và Yearly với hạn mức và giá", caption: "Màn hình Nâng cấp trong app: ba gói, giá và hạn mức." })}
</div>
<div class="stack-lg reveal">
<span class="eyebrow">Thời lượng dịch</span>
<h2>Hạn mức chỉ tính phần đã dịch</h2>
${checkList([
  "Thời lượng tính theo <strong>độ dài tiếng nói</strong> của các đoạn đã dịch xong, không tính đệm hay lúc im lặng",
  "Câu <strong>đã ở đúng ngôn ngữ</strong> bạn muốn đọc, đoạn bị bỏ hoặc chưa dịch được <strong>không bị tính</strong>",
  "<strong>Free:</strong> hạn mức 30 phút đặt lại mỗi ngày lúc 00:00 giờ máy",
  "<strong>Monthly:</strong> chu kỳ 30 ngày tính từ ngày thanh toán, không theo tháng dương lịch",
  "Còn dưới 5 phút thì app nhắc; hết hạn mức thì dừng phiên và báo thời điểm mở lại",
  "Hạn mức tính riêng cho từng máy",
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
${sectionHead({ eyebrow: "Cách mua", title: "Từ chọn gói tới kích hoạt, ngay trong app", center: true })}
${steps([
  { title: "Chọn gói trong app", text: "Mở <strong>Nâng cấp Pro</strong>, chọn Monthly hoặc Yearly, nhập email nhận key và đồng ý để lưu email này cho việc gửi và khôi phục key." },
  { title: "Quét mã VietQR", text: "App vẽ mã VietQR ngay trong cửa sổ, kèm nút mở trang thanh toán PayOS. Mã dùng được trong 15 phút." },
  { title: "Tự kích hoạt", text: "Khi PayOS xác nhận đã nhận tiền , gói có hiệu lực ngay trên máy bạn và key được gửi vào email." },
])}
<p class="disclaimer">Chỉ nhận chuyển khoản từ ngân hàng Việt Nam bằng VND qua PayOS. Chúng tôi không nhận số thẻ hay thông tin tài khoản ngân hàng của bạn và không gửi email của bạn sang PayOS.</p>
</div></section>

<section class="section section-alt"><div class="container">
${sectionHead({ eyebrow: "Gia hạn và đổi gói", title: "Linh hoạt, tính theo giá mỗi ngày", center: true })}
<div class="grid grid-2">
<div class="card reveal"><h3>Gia hạn cùng gói</h3><p>Mua thêm cùng gói thì được cộng 30 ngày (Monthly) hoặc 365 ngày (Yearly), tính từ ngày hết hạn nếu gói còn hạn. App nhắc bạn trước 7 ngày và khi đã hết hạn. Không có tự động trừ tiền.</p></div>
<div class="card reveal"><h3>Đổi gói khi còn hạn</h3><p>Gói mới bắt đầu ngay; số ngày còn lại của gói cũ được quy đổi theo <strong>giá mỗi ngày</strong> và làm tròn xuống. Ví dụ: Monthly còn 20 ngày, mua Yearly thì được cộng 24 ngày (Yearly chạy 389 ngày). App hiện sẵn số ngày quy đổi và ngày hết hạn mới (ước tính) trước khi bạn trả tiền. Đổi gói không hoàn tiền.</p></div>
</div>
${callout({ title: "Khi hết hạn", text: "Máy quay về Free nếu còn trong 10 ngày dùng thử; hết dùng thử thì cần mua gói để dịch tiếp. Tính năng Pro (lịch sử, từ điển, xuất file) bị khóa khi không còn gói trả phí." })}
</div></section>

<section class="section"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi về giá", title: "Điều bạn có thể muốn hỏi trước khi mua" })}
${faq(PRICING_FAQ)}
</div></section>

${ctaBand({ title: "Bắt đầu với 10 ngày dùng thử", text: "Mỗi ngày 30 phút, đủ để thử trên cuộc họp thật. Không cần thẻ, không cần tài khoản.", primary: { href: "/tai-xuong/", label: "Nhận bản beta" }, secondary: { href: "/cau-hoi-thuong-gap/", label: "Xem hỏi đáp" } })}
`,
};
void icon;
