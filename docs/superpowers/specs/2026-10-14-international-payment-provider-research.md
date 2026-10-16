# Cổng thanh toán quốc tế: so sánh và chọn đơn vị rẻ nhất (nghiên cứu)

Ngày 2026-10-14. Chủ dự án đã bỏ Polar (phí 5% + 0,50 USD, cộng 1,5% thẻ ngoài Mỹ) và yêu cầu: **tìm đơn vị rẻ nhất và không thu phụ phí**. Sau khi xem tài liệu này, chủ dự án **chọn Creem**. Chưa sửa mã, chưa đăng ký tài khoản nào.

Ký hiệu: *(nguồn)* là đọc trực tiếp ở trang giá, tài liệu hay điều khoản chính thức của hãng ngày 2026-10-14; *(tính)* là tôi tính từ số liệu đã công bố; *(bên thứ ba)* là bài đánh giá hay bài của đối thủ, chưa kiểm chứng; *(suy luận)* là chưa kiểm chứng. Nguồn ở mục 9. Giá đổi liên tục, nhất là sau khi Polar và Lemon Squeezy đổi giá trong 2026, nên phải kiểm lại trang giá trước khi đăng ký.

## 1. Kết luận ngắn

- **Creem rẻ nhất** trong các Merchant of Record (MoR) đã kiểm *(nguồn)*: **3,9% + 0,40 USD** mỗi giao dịch, không phí tháng, không phí thiết lập, và trang giá ghi rõ **"No international card fees"**. Việt Nam có trong danh sách chi trả (chuyển khoản ngân hàng nội địa, không có hạn chế đối tác). Xét duyệt tài khoản 1–2 ngày làm việc.
- **"Không phụ phí" của Creem chỉ đúng với phí mỗi giao dịch.** Ngoài trang giá còn có:
  - phí chi trả **7 USD hoặc 1%, lấy mức cao hơn**, mỗi lần rút (tối thiểu 50 USD, chỉ rút vào ngày 1 và 15 hàng tháng);
  - phí tranh chấp (chargeback) **25 USD**: chủ Creem xác nhận trên AppSumo *(bên thứ ba)*, không có trên trang giá; điều khoản 11.6 ghi người bán chịu toàn bộ chi phí chargeback;
  - phí ngân hàng nhận và phí đổi tiền sang VND do người bán chịu (điều khoản 10.7).
- **Rủi ro chính của Creem không phải phí, mà là tiền bị giữ.** Điều khoản 10.5 cho Creem giữ, trì hoãn hay đóng băng chi trả (kể cả "để dự phòng chargeback"); tiền mới bán chờ 7–12 ngày mới rút được; Trustpilot có vài khiếu nại về quỹ bị chặn *(bên thứ ba, không kiểm chứng được)*. Creem là công ty mới (luật Estonia).
- **Phương án an toàn hơn nhưng đắt hơn: Paddle**, 5% + 0,50 USD "không phí ẩn", chi trả USD qua SWIFT 15 USD mỗi lần, giá dưới 10 USD phải thương lượng riêng.
- **Loại:** Polar, Dodo (+1,5% quốc tế, +0,5% thuê bao, +3% PayPal), Lemon Squeezy (+1,5% quốc tế, +1,5% PayPal, +0,5% thuê bao, chi trả 1–3%), Stripe (Việt Nam không có trong danh sách nước hỗ trợ), PayPal Việt Nam (4,4% + phí cố định, quy đổi VND thấp hơn thị trường 3–4%, rút 60.000 ₫).
- **Tích hợp Creem dễ hơn Polar** (mục 5): một kiểu chữ ký, `request_id` do mình đặt được trả lại trong webhook, một lời gọi để biết trạng thái, địa chỉ trang thanh toán đã biết, không có phiên bản API tính theo ngày.
- **Đề xuất:** chọn Creem, giữ PayOS làm kênh chính cho khách Việt Nam (nên số tiền nằm ở Creem luôn nhỏ), và rút tiền ngay khi đủ điều kiện. Việc đầu tiên: chủ dự án đăng ký và nộp hồ sơ xét duyệt (1–2 ngày), vì kết quả này quyết định mọi thứ sau.

## 2. Tiêu chí

1. Rẻ nhất, **không phụ phí** (thẻ quốc tế, thuê bao, PayPal, quy đổi tiền, phí chi trả cao).
2. **Chi trả được cho người bán ở Việt Nam** (cá nhân: Đỗ Tiến Phong, spec §15).
3. Là **Merchant of Record**: hãng lo thuế bán hàng quốc tế ở nước khách (spec §13, Phase 3).
4. Có API tạo phiên thanh toán, webhook có chữ ký, truy vấn được trạng thái đơn, để cắm vào `PaymentProvider` (`server/src/payment/provider.ts`).
5. Bán phần mềm được (không thuộc danh mục cấm).

Cổng không phải MoR (Stripe, PayPal, cổng nội địa nhận thẻ quốc tế) rẻ hơn ở một số chỗ nhưng chủ dự án phải tự lo thuế ở các nước khách: **chưa nghiên cứu sâu**, xem mục 8.

## 3. Phí công bố của từng hãng *(nguồn)*

| Hãng | Phí giao dịch | Phụ phí đã công bố | Chi trả | Việt Nam |
|---|---|---|---|---|
| **Creem** | 3,9% + 0,40 USD | không phí thẻ quốc tế; thêm 2% (chia doanh thu), 2% (affiliate), 5% (giỏ hàng bỏ dở), đều là tính năng tùy chọn | 7 USD hoặc 1%, cao hơn; tối thiểu 50 USD; ngày 1 và 15 | **có**, ngân hàng nội địa |
| Paddle | 5% + 0,50 USD | không có (ghi "all-in", "no hidden fees"); giá dưới 10 USD: liên hệ báo giá riêng | không phí của Paddle; USD/EUR/GBP/AUD/CAD; SWIFT 15 USD khi tiền tệ khác nước ngân hàng; quy đổi tối đa 1,5% | không nằm trong danh sách nước bị loại; chưa rõ cá nhân |
| Dodo Payments | 4% + 0,40 USD | **+1,5% quốc tế, +0,5% thuê bao, +3% PayPal/BNPL**; hoàn tiền 1 USD, tranh chấp 30 USD | 5 USD nếu dưới 1.000 USD (FAQ mâu thuẫn trang giá), SWIFT USD 25 USD | chưa tìm thấy |
| Polar (Starter) | 5% + 0,50 USD | **+1,5% thẻ ngoài Mỹ**; tranh chấp 15 USD | Stripe: 2 USD/tháng + 0,25% + 0,25 USD, quy đổi 0,25–1% | có (Stripe Connect Express) |
| Lemon Squeezy | 5% + 0,50 USD | **+1,5% quốc tế, +1,5% PayPal, +0,5% thuê bao**, +5% giỏ hàng bỏ dở | Stripe ngoài Mỹ 1%, PayPal ngoài Mỹ 3% (tối đa 30 USD) | chưa rõ |
| Stripe Managed Payments | phí Stripe + 3,5% *(bên thứ ba)* | | | **không**: Việt Nam không có trong danh sách nước Stripe |
| PayPal (tài khoản Việt Nam) | 4,4% + phí cố định (nhận từ nước ngoài) | quy đổi sang VND thấp hơn thị trường 3–4% *(bên thứ ba)* | rút về ngân hàng 60.000 ₫ | có; không phải MoR |

Ghi chú: Polar Early Member (tổ chức tạo trước 27/05/2026) là 4% + 0,40 USD + 1,5% quốc tế, vẫn cao hơn Creem. Các hãng khác trong bài so sánh (Fungies 4,5–5% + 0,50 USD, Whop 3% + 2,7% + 0,30 USD, FastSpring khoảng 5,9% + 0,95 USD, PayPro Global báo giá riêng) *(bên thứ ba)* đều không thấp hơn Creem. Danh sách này không đầy đủ; không có hãng nào khác tôi tìm thấy ở dưới 3,9% + 0,40 USD mà không phụ phí.

## 4. Chi phí thực tế *(tính)*

**Phí mỗi giao dịch**, đơn một lần, khách dùng thẻ ngoài Mỹ, giá chưa thuế:

| Hãng | 4,99 USD | 9,99 USD | 19,99 USD | 39,99 USD |
|---|---|---|---|---|
| **Creem** | 0,59 (11,9%) | 0,79 (7,9%) | 1,18 (5,9%) | 1,96 (4,9%) |
| Polar Early Member, Dodo | 0,67 (13,5%) | 0,95 (9,5%) | 1,50 (7,5%) | 2,60 (6,5%) |
| Paddle | 0,75 (15,0%) | 1,00 (10,0%) | 1,50 (7,5%) | 2,50 (6,3%) |
| Polar Starter, Lemon Squeezy | 0,82 (16,5%) | 1,15 (11,5%) | 1,80 (9,0%) | 3,10 (7,8%) |

Thẻ Mỹ không có phụ phí quốc tế: Creem vẫn thấp nhất nhưng chỉ hơn Dodo và Polar Early Member 0,1%. Phí tính trên tổng khách trả **gồm cả thuế** ở Creem (ví dụ trong tài liệu: 20 USD + 4 USD VAT, phí 3,9% × 24 + 0,40 = 1,33 USD).

**Phí chi trả cho một lần rút** về ngân hàng Việt Nam, chưa gồm phí ngân hàng nhận và quy đổi VND:

| Rút (USD) | Creem | Polar | Paddle | Dodo |
|---|---|---|---|---|
| 100 | 7,00 (7,0%) | 3,50 (3,5%) | 15,00 (15%) | 30,00 (30%) |
| 300 | 7,00 (2,3%) | 6,00 (2,0%) | 15,00 (5%) | 30,00 (10%) |
| 1.000 | 10,00 (1,0%) | 14,75 (1,5%) | 15,00 (1,5%) | 25,00 (2,5%) |
| 3.000 | 30,00 (1,0%) | 39,75 (1,3%) | 15,00 (0,5%) | 25,00 (0,8%) |

Creem rẻ hơn Polar khi rút từ khoảng 700 USD trở lên (mức 1%); dưới đó phí cố định 7 USD đắt hơn Polar. Vì vậy **nên rút gộp**, và quy mô nhỏ thì Creem không có lợi thế ở khâu chi trả.

**Một tháng mẫu:** 30 đơn 9,99 USD, thẻ ngoài Mỹ, một lần rút mỗi tháng: tổng phí Creem khoảng 30,7 USD (10,2%), Polar Starter khoảng 40,0 USD (13,4%), Paddle khoảng 45,0 USD (15,0%).

## 5. Creem: những điều đã đọc

### 5.1 Tài khoản, chi trả, điều khoản *(nguồn)*

- Luồng đăng ký: thông tin doanh nghiệp (hay cá nhân) → xác minh danh tính (KYC) → tài khoản chi trả → Creem xét duyệt → bật thanh toán thật. Xét duyệt 1–2 ngày làm việc, tối đa 3.
- Điều kiện duyệt: sản phẩm chạy thật, có Chính sách quyền riêng tư và Điều khoản, giá hiển thị, email hỗ trợ khớp với website, không vi phạm nhãn hiệu. Creem có thể mua thử bằng mã giảm giá 100%. Website `aitranslator.io.vn` đã có các trang này.
- Bán được phần mềm và SaaS. Quy tắc riêng về AI chỉ áp cho sản phẩm tạo ảnh hay video; "Generative AI products" (tạo ảnh, tạo video) nằm ở nhóm hạn chế *(suy luận: ứng dụng dịch giọng nói ngoại tuyến không thuộc nhóm này)*.
- Người bán cá nhân: tài khoản chi trả phải là tài khoản cá nhân, tên người thụ hưởng khớp KYC.
- Chi trả vào ngày 1 và 15; tối thiểu 50 USD; chỉ tiền phát sinh trước ngày 8 mới rút được vào ngày 15 (chờ 7–12 ngày để Creem đánh giá rủi ro). Tiền trả theo tiền tệ của tài khoản ngân hàng; khác tiền tệ bán thì đối tác ngân hàng tự quy đổi và thu phí. Creem xuất "hóa đơn ngược" cho mỗi lần rút.
- Điều khoản: Creem được giữ, trì hoãn hay đóng băng chi trả (10.5), cấn trừ phí, phí tranh chấp, hoàn tiền, chargeback vào chi trả hiện tại hay sau này (10.6), tự hoàn tiền không cần chỉ thị rồi đòi lại người bán (11.3–11.4), ngừng hay chấm dứt không báo trước trong một số trường hợp và **không mở lại** (20.4, 20.6). Đổi phí báo trước 30 ngày (19.1). Luật Estonia, tòa Harju County.
- Phải trả lời yêu cầu của khách trong 3 ngày làm việc, nếu không Creem có thể hoàn tiền thay.
- Phương thức thanh toán: thẻ, Apple Pay, Google Pay; "phương thức địa phương sắp có". **Không có PayPal.**
- Thuế: trang giá ghi thu và nộp thuế ở "50+ nước", tài liệu khác ghi "190+ nước": chưa rõ.

### 5.2 API *(nguồn)*

- REST `https://api.creem.io/v1` (không có phiên bản theo ngày), khóa API trong header `x-api-key`. Sandbox riêng `https://test-api.creem.io` (khóa riêng, dữ liệu riêng).
- Tạo phiên: `POST /v1/checkouts` với `product_id`, `request_id` (mã tham chiếu của mình), `success_url`, `metadata`, `customer` (điền sẵn email), `discount_code`, và `custom_price` (ghi đè giá mỗi đơn vị, tính bằng cent, từ 100 đến 99.999.999, **chỉ cho sản phẩm trả một lần**). Trả `id`, `status`, `checkout_url`; ví dụ trong tài liệu là `https://checkout.creem.io/ch_…`.
- Hỏi trạng thái: `GET /v1/checkouts?checkout_id=…` trả `status` (`pending`, `completed`, `expired`), `request_id` và đối tượng `order` (số tiền, loại tiền, `status` như `paid`, `refunded`, `partially_refunded`).
- Webhook: header `creem-signature` là **HMAC-SHA256 dạng hex của thân thô** với secret của endpoint; không có timestamp hay phiên bản. Sự kiện: `checkout.completed`, `refund.created`, `dispute.created` (và các sự kiện thuê bao). Payload `checkout.completed` có `object.request_id` và `object.order` (`amount`, `currency`, `status: "paid"`). Thử lại tổng cộng 5 lần (ngay, +30 giây, +5 phút, +30 phút, +6 giờ), không thử sau 24 giờ; chỉ HTTP 200 là thành công; có thể gửi lại tay. **Không có IP nguồn cố định.** Cloudflare Bot Fight Mode có thể chặn.
- Mỗi sản phẩm có `tax_mode` (`inclusive` hay `exclusive`) và `tax_category`. Hoàn tiền làm trong dashboard (điều khoản 11.1–11.2).
- Mã lỗi: 401 thiếu khóa, 403 khóa sai hay thiếu quyền, 404, 429 vượt hạn mức; mỗi lỗi có `trace_id`.

## 6. Khớp với hệ thống hiện tại

Phân tích khớp với hệ thống hiện tại dựa vào `PaymentProvider`, không phụ thuộc cổng nào; chi tiết ở spec thiết kế `2026-10-14-creem-international-payment-design.md`. Tóm tắt: không cần migration (`orders.provider` và `currency` không có CHECK); phải đổi `verifyWebhook` (nhận thân thô), `getPaymentStatus` (nhận `providerRef`), `qrCode` tùy chọn; app không có mã QR (`client.rs:106` đang bắt `qr_code` là `String`); Web Admin đang cộng lẫn VND với USD (`admin-stats.ts`, `fmtVnd`); giá USD đặt riêng; server chỉ chọn cổng mới khi app mới khai báo; luật WAF `/v1/webhooks/` (5 request mỗi 10 giây mỗi IP); EULA, chính sách quyền riêng tư, website; kiểm thử theo luật một môi trường.

Khác biệt giữa Creem và Polar (Polar là ứng viên đã loại, để so cho thấy vì sao Creem dễ tích hợp hơn):

| | Polar | Creem |
|---|---|---|
| Chữ ký webhook | Standard Webhooks, hai kiểu theo ngày tạo secret | một kiểu: HMAC-SHA256 hex của thân thô |
| Mã đơn của mình | trong `metadata`, phải chép sang đơn | `request_id` được trả lại nguyên trong webhook và khi hỏi phiên |
| Biết trạng thái | hai lời gọi (phiên rồi đơn theo `checkout_id`) | một lời gọi (`GET /v1/checkouts`), có sẵn `order` |
| Giá theo từng đơn | `prices` giá cố định cho phiên | `custom_price` (một lần, tối thiểu 1 USD) |
| Phiên bản API | theo ngày, bản bị gỡ sau khoảng 6 tháng | `v1`, chưa thấy lịch gỡ |
| Webhook tự tắt | sau 10 lần lỗi liên tiếp | chưa thấy tài liệu nói; thử lại 5 lần trong 24 giờ |
| IP nguồn webhook | cố định (có thể nới WAF theo IP) | không có (WAF phải nới theo đường dẫn) |
| Trang thanh toán | chưa biết | `checkout.creem.io` (ví dụ trong tài liệu) |
| Xét duyệt | tối đa 14 ngày | 1–2 ngày |
| Hoàn tiền | dashboard hay API | dashboard (điều khoản 11.1) |
| Token hết hạn | có | chưa thấy tài liệu nói |

Hệ quả: `PolarProvider` sẽ là `CreemProvider` nhỏ hơn (không cần chấp nhận hai kiểu chữ ký, không cần lịch nâng phiên bản API). Interface vẫn phải đổi như đã nêu.

## 7. Rủi ro và cách giảm

1. **Tiền bị giữ hay đóng băng.** Giảm: giữ PayOS làm kênh chính cho khách Việt Nam; rút ngay khi đủ điều kiện, không để số dư lớn; giữ website, EULA, email hỗ trợ đúng như hồ sơ duyệt; trả lời khách trong 3 ngày; lưu bằng chứng giao dịch. Không loại bỏ hoàn toàn được.
2. **Chargeback do người bán chịu** (điều khoản 11.6) cộng phí 25 USD *(bên thứ ba)*. Giảm: chính sách hoàn tiền 7 ngày đã có; sản phẩm giá thấp, ít rủi ro; theo dõi tỷ lệ.
3. **Chi trả kém hiệu quả ở quy mô nhỏ** (7 USD mỗi lần, tối thiểu 50 USD, chỉ hai lần mỗi tháng): rút gộp tới khoảng 700 USD.
4. **Một nhà cung cấp nhỏ và mới.** Giảm: giữ `PaymentProvider` trung lập để đổi sang Paddle hay Polar khi cần.
5. **Thuế:** phạm vi thu và nộp thuế ghi không thống nhất (50+ hay 190+ nước). Hỏi Creem bằng văn bản.
6. **Khác:** đổi phí báo trước 30 ngày; không PayPal; không IP cố định để nới WAF theo IP; tên miền `checkout.creem.io` phải đưa vào `EXTERNAL_HOSTS` của app (chỉ nhận đúng tên miền).

## 8. Chưa biết, cần đo

1. **Xét duyệt có qua không** (cá nhân, Việt Nam, tài khoản ngân hàng VND): chỉ chủ dự án biết, và là điều đầu tiên phải làm.
2. **Số tiền trên đơn ở nước có thuế** (`tax_mode` `exclusive` hay `inclusive`): `order.amount` là giá niêm yết hay đã gồm thuế; quyết định luật so khớp số tiền (`orders.ts:316-317`).
3. **Độ trễ** từ lúc khách trả tiền tới lúc có webhook và tới lúc `GET /v1/checkouts` báo `completed` (quyết định nhịp hỏi của app).
4. **`custom_price` và `request_id` chạy thật không**, kể cả giá thấp nhất.
5. **Hoàn tiền một phần và toàn phần:** payload `refund.created`, `order.status` sau đó.
6. **Phí thật ở lần rút đầu tiên:** phí quy đổi VND của đối tác ngân hàng và phí ngân hàng nhận ở Việt Nam (đều do người bán chịu); chỉ đo được ở production.
7. **Thời gian chờ thật** của tiền mới bán (7–12 ngày) với người bán mới.

Mục 1 và 6, 7 chỉ đo được ở production; mục 2–5 đo được ở sandbox `test-api.creem.io` bằng curl, **không nối vào hệ thống** (luật một môi trường, spec `2026-10-04`).

## 9. Việc tiếp theo

1. Chủ dự án chọn: **Creem** (đề xuất) hay Paddle.
2. Nếu Creem: chủ dự án đăng ký ở `creem.io`, nộp hồ sơ xét duyệt (cá nhân, Việt Nam, ngân hàng VND). Làm ngay vì chỉ tốn 1–2 ngày và quyết định mọi thứ sau.
3. Chủ dự án quyết giá USD (bảng mục 4 cho thấy cái giá của việc đặt thấp: Monthly quy theo VND khoảng 1,9 USD sẽ mất 25–30% cho phí).
4. Spike sandbox (mục 8, điểm 2–5).
5. Spec thiết kế rồi kế hoạch, triển khai theo runbook mục 8 của `docs/release/phat-hanh.md`: Worker API → Worker admin (liền nhau) → app → website và văn bản pháp lý.

## 10. Nguồn

Creem *(nguồn)*, đọc 2026-10-14: `https://www.creem.io/pricing`, `https://www.creem.io/terms` (Merchant Terms), `https://docs.creem.io/merchant-of-record/finance/payouts`, `…/finance/payout-accounts`, `…/supported-countries`, `…/account-reviews`, `…/account-reviews/ai-wrapper-compliance`, `https://docs.creem.io/api-reference/introduction`, `…/api-reference/endpoint/create-checkout`, `…/get-checkout`, `https://docs.creem.io/code/webhooks`, `https://docs.creem.io/features/one-time-payment`.

Các hãng khác *(nguồn)*: `https://www.paddle.com/pricing`, `https://www.paddle.com/help/manage/get-paid/is-there-a-fee-taken-for-payouts`, `https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle`, `https://developer.paddle.com/concepts/sell/supported-currencies/`, `https://dodopayments.com/pricing`, `https://docs.lemonsqueezy.com/help/getting-started/fees`, `https://www.lemonsqueezy.com/pricing`, `https://stripe.com/global`, `https://www.paypal.com/vn/webapps/mpp/merchant-fees`.

*(bên thứ ba)*, nhiều bài do đối thủ viết, chỉ dùng để tìm ứng viên và đối chiếu: `https://dodopayments.com/blogs/cheapest-merchant-of-record`, `https://aliteq.com/cheapest-merchant-of-record`, `https://www.creem.io/blog/stripe-managed-payments-alternative`, `https://appsumo.com/products/creem/questions/fee-comparison-chargebacks-1330697/`, `https://www.trustpilot.com/review/creem.io`, `https://fungies.io/merchant-of-record-pricing-guide-2026/`.
