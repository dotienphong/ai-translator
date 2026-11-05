# Tự động gia hạn cho thẻ quốc tế (Creem)

Ngày 2026-11-05. Chủ dự án uỷ quyền làm trọn tính năng, yêu cầu: khi khách trả bằng thẻ quốc tế (USD, Creem), **tự động gia hạn được bật cho khách ngay lúc thanh toán**. PayOS (VietQR, VND) không đổi: vẫn đơn trả trước, vẫn thư nhắc gia hạn (spec 2026-11-02).

## 0. Giới hạn của lần làm này (đọc trước)

- Máy làm việc không gọi được `api.creem.io` (proxy chặn tên miền), nên **chưa có phép đo thật** với Creem. Payload và API dựng theo tài liệu Creem đọc ngày 2026-11-05 (`/code/webhooks`, `/features/subscriptions`, `/features/customer-portal`); mọi trường được đọc phòng thủ (sai kiểu thì giữ đơn để người vận hành xem, không đoán). Các điều chưa đo nằm ở mục 9 và là **bước nghiệm thu bắt buộc** trước khi bật công tắc bán.
- Khóa trong `.env` là khóa production (luật một môi trường, spec 2026-10-04). Không có sandbox nối vào Worker; test dùng `FakeCreem`.

## 1. Quyết định

| # | Chủ đề | Quyết định |
|---|---|---|
| D1 | Phạm vi | Chỉ đơn USD qua Creem. VND/PayOS giữ nguyên. Ba sản phẩm một lần hiện có giữ nguyên (đơn một lần vẫn bán được: app cũ, và khách bỏ tích tự gia hạn). |
| D2 | Sản phẩm | Ba sản phẩm **thuê bao** mới trong Creem (USD, `tax_mode` exclusive): Monthly mỗi tháng, 6 Months mỗi 6 tháng, Yearly mỗi năm. **Giá catalog = giá USD trong `PLANS`** (thuê bao không dùng `custom_price` theo từng đơn). Mã vào biến mới `CREEM_SUBSCRIPTION_PRODUCT_IDS`. Giá lệch thì đơn đầu `failed` (luật so tiền của `fulfilOrder`), không cấp. |
| D3 | Công tắc | `CREEM_AUTO_RENEW = "on"` mới chào thuê bao (GET /v1/plans trả `auto_renew_available`). Thiếu hay khác "on" là tắt. **Mặc định tắt** trong `wrangler.jsonc`. |
| D4 | Đồng ý | Màn Nâng cấp, khi chọn thẻ quốc tế: ô **tích sẵn** "Tự động gia hạn" (chủ dự án chọn), kèm câu nêu giá, chu kỳ, ngày trừ tiền kỳ sau và cách hủy. App gửi `auto_renew: true`; thiếu là đơn một lần. Server lưu `orders.auto_renew`, và ghi nhật ký `order_created` kèm `auto_renew`. Cần luật sư xem câu đồng ý và hình thức tích sẵn (mục 8). |
| D5 | Kỳ đầu | Đi đường đơn hiện có (`checkout.completed` rồi `fulfilOrder`, hỏi lại API trước khi cấp). Webhook mang `subscription` thì server ghi một dòng `subscriptions` gắn với license của đơn. |
| D6 | Kỳ sau | Webhook `subscription.paid` đã ký. Nếu `hết kỳ` trong payload **lớn hơn** `paid_through` đã ghi thì là kỳ mới: tạo một đơn gia hạn (`orders`, cổng creem, `provider_ref` = mã giao dịch) và áp bằng `grantOrder`. Nếu **không lớn hơn** thì là kỳ đã cấp (chính `subscription.paid` của lần trả đầu, hay gửi lại): bỏ qua. Khóa chống trùng là `paid_through`, không phụ thuộc thứ tự sự kiện. Chưa có dòng `subscriptions` (sự kiện tới trước `checkout.completed`): trả 503 để Creem gửi lại (30 giây, 5 phút, 30 phút, 6 giờ). |
| D7 | Hạn license | Kỳ sau đặt `hạn = max(hạn hiện có, hết kỳ Creem + 3 ngày ân hạn)`, không cộng `days_per_order`, vì tháng của Creem là tháng lịch (30 hay 31 ngày) còn gói của ta là 30 ngày: cộng dồn sẽ hở vài ngày mỗi vài tháng. Ân hạn 3 ngày (`SUBSCRIPTION_GRACE_DAYS`) che độ trễ webhook. Không bao giờ rút ngắn. |
| D8 | Kiểm tiền kỳ sau | Payload đã ký (như hoàn tiền: tin chữ ký, không hỏi lại API vì chưa đo được endpoint giao dịch). Cấp khi: `last_transaction.status` = paid, tiền USD, `amount_paid - tax_amount` ≥ giá `PLANS` của gói trong dòng `subscriptions`, không có dấu hiệu giảm giá. Khác thì đơn gia hạn thành `underpaid` + cảnh báo `order_payment_review`, **không cấp**; người vận hành xử lý tay. |
| D9 | Hủy | Server tạo link cổng khách hàng Creem (`POST /v1/customers/billing`) cho license; khách hủy ở đó. Creem hủy có hiệu lực ngay và không thu thêm; license **dùng tới hết hạn đã cấp**, không hoàn tiền tự động. App có mục "Quản lý tự gia hạn" (mở link bằng trình duyệt). |
| D10 | Thanh toán lỗi | Creem tự thử lại (`past_due`). Server chỉ ghi trạng thái; không cấp thêm; license tự hết hạn đúng ngày. Khi kỳ mới trả được thì `subscription.paid` kéo hạn như D6. |
| D11 | Mua khi đang có thuê bao | License có thuê bao trạng thái `active`, `trialing`, `past_due`, `unpaid` hay `paused` thì `POST /v1/checkout` trả `409 subscription_active` (mọi gói, mọi cách). Muốn đổi gói: hủy tự gia hạn trước, rồi mua. `scheduled_cancel`, `canceled`, `expired` thì mua bình thường. |
| D12 | Email nhắc | Bỏ qua license có thuê bao `active` hay `past_due` (đã tự trừ tiền; nhắc là sai). `skipped` với lý do `auto_renew`. |
| D13 | Hoàn tiền kỳ sau | Payload `refund.created` của giao dịch thuê bao có thể không mang mã phiên: thành `payment_unmatched` (nhật ký + cảnh báo), người vận hành xử lý tay như quy ước D5 của spec Creem. Chưa tự động. |
| D14 | Không làm | Tự đổi gói trong thuê bao (upgrade API), tạm dừng, dùng thử thuê bao, đối soát chủ động thuê bao bằng cron (Creem gửi lại webhook 5 lần trong 24 giờ; thiếu thì người vận hành bấm gửi lại trong dashboard Creem, an toàn vì chống trùng theo `paid_through`), khách cũ (đã mua một lần) không tự chuyển sang thuê bao. |

## 2. Dữ liệu (migration 0009, chỉ thêm)

```sql
ALTER TABLE orders ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0, 1));
CREATE TABLE subscriptions (
  provider_ref TEXT PRIMARY KEY,         -- sub_… của Creem
  license_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  customer_ref TEXT,                     -- cust_…, để tạo link cổng khách hàng
  status TEXT NOT NULL,
  paid_through INTEGER NOT NULL,         -- hết kỳ Creem đã thu tiền (giây Unix); khóa chống trùng kỳ
  last_event_at INTEGER NOT NULL,        -- created_at (ms→s) của sự kiện mới nhất đã áp; sự kiện cũ hơn không đổi trạng thái
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX subscriptions_license ON subscriptions (license_id);
```
Worker cũ không đọc cột/bảng mới nên chạy đúng trên schema mới: áp migration trước khi deploy (như 0006 và 0008).

## 3. Server

- `payment/creem-webhook.ts`: thêm `checkout.completed` mang `subscription` (id, customer, hết kỳ) vào sự kiện `payment`; thêm sự kiện `kind: "subscription"` cho `subscription.paid | active | update | scheduled_cancel | canceled | expired | past_due | unpaid | paused | trialing`. Ngày đọc được ở dạng chuỗi ISO hay số (giây hoặc mili giây).
- `payment/creem.ts`: `createCheckout` dùng sản phẩm thuê bao khi `autoRenew` (không gửi `custom_price`); `createPortalLink(customerRef)`; `getPaymentStatus` trả thêm `subscription` nếu GET phiên có.
- `subscriptions.ts` (mới): `linkSubscription`, `handleSubscriptionEvent`, `subscriptionPortal`, `activeSubscription`.
- `orders.ts`: `grantOrder` nhận `subscriptionPeriodEnd` (D7); route webhook xử lý `kind: "subscription"`; `OrderRow.auto_renew`.
- `checkout.ts`: `auto_renew`, D3, D11; `GET /v1/plans` thêm `auto_renew_available`.
- `POST /v1/subscription` `{ license_key, manage? }`: trả trạng thái (`auto_renew`, `status`, `renews_at`), có `manage: true` thì thêm `portal_url`. Giới hạn tần suất như checkout (khóa sai thì `failureBlock`).
- `reminders.ts`: D12. `alerts.ts`: loại `subscription_unlinked`. Web Admin: nhãn nhật ký mới (`audit-labels.ts`).

## 4. App

- Màn Nâng cấp (thẻ quốc tế): ô tích sẵn, câu đồng ý, ngày trừ kỳ sau; gửi `auto_renew`.
- Màn gói/Giới thiệu: dòng "Tự động gia hạn: bật, kỳ sau dd/mm" và nút "Quản lý tự gia hạn" (mở `portal_url`).
- `navigation.rs`: cho phép mở link cổng khách hàng (`creem.io` dưới `/my-orders/`), chặt như link thanh toán.
- Chuỗi giao diện đủ vi/en/ja/zh/ko (ja/zh/ko chưa có người bản ngữ duyệt, như các chuỗi trước).

## 5. Pháp lý và website

- EULA (vi, en) và chính sách quyền riêng tư: câu **có điều kiện** ("thanh toán VietQR không tự gia hạn; thuê bao thẻ quốc tế chỉ khi bạn đồng ý lúc thanh toán"), đúng cả khi công tắc còn tắt.
- Website (5 ngôn ngữ) và test khóa câu chữ: **đã sửa** (2026-11-05): đơn VietQR trả trước một lần, đơn thẻ có ô tích sẵn, cách hủy bằng đúng tên nút của app, key đang tự gia hạn chưa mua thêm hay đổi gói được; test "Tự động gia hạn" lấy tên nút từ `src/i18n`. Vì website nói thẻ có tự động gia hạn nên **chỉ deploy cùng ngày phát hành app, sau khi nghiệm thu** (runbook mục 18.5). Dòng phiên bản đã lên EULA 1.7 và chính sách 1.13 (hiệu lực 2026-11-05).

## 6. Kiểm thử

Server: `FakeCreem` thêm thuê bao; test cho webhook (đọc sự kiện), kỳ đầu, kỳ sau (đúng hạn, trùng, sai thứ tự, thiếu dòng, sai tiền), hủy, từ chối mua khi đang thuê bao, công tắc tắt, link cổng, nhắc gia hạn. Website: cập nhật `site.test.mjs`. Rust: test `navigation.rs`.

## 7. Thứ tự bật (runbook, `docs/release/phat-hanh.md` mục 18)

1. Áp migration 0009 vào D1 production.
2. Deploy Worker API và admin (công tắc **tắt**).
3. Trong Creem: tạo ba sản phẩm thuê bao; ghi mã vào `CREEM_SUBSCRIPTION_PRODUCT_IDS`; bảo đảm webhook đã đăng ký đủ sự kiện `subscription.*`.
4. Đặt `CREEM_AUTO_RENEW=on`, deploy. Chưa phát hành app: app cũ không gửi `auto_renew` nên vẫn mua một lần, chỉ bản debug của chủ dự án thấy ô tích.
5. **Nghiệm thu bằng một đơn thật Monthly** của chủ dự án (mục 9), rồi hủy và hoàn tiền. Sai mục nào thì tắt công tắc và sửa mã.
6. Đạt: phát hành app có ô tích và deploy website (đã sửa sẵn, EULA 1.7 và chính sách 1.13 đã nâng) cùng ngày; công tắc giữ `on`.

## 8. Rủi ro pháp lý cần luật sư (không chặn mã)

Ô đồng ý **tích sẵn** cho khoản trả định kỳ có thể bị coi là không đủ rõ ràng ở một số thị trường (khách EU/UK/Mỹ thường đòi hành động đồng ý chủ động, thông báo trước kỳ trừ tiền, và cách hủy dễ như cách đăng ký). Mã đã có đủ ba thứ cần để đổi sang "không tích sẵn" hay thêm thư báo trước kỳ: một hằng số trong app đổi mặc định ô tích; ngày kỳ sau đã có ở `subscriptions.paid_through`. Creem là merchant of record nên đứng tên bán và gửi biên nhận, nhưng điều khoản tự gia hạn của ta vẫn phải rõ.

## 9. Điều chưa đo (nghiệm thu bằng đơn thật)

Mỗi mục có cách xử lý nếu sai, theo kiểu spec Creem mục 11:

- U1 Sản phẩm thuê bao nhận giá catalog, không đòi `custom_price`; phản hồi tạo phiên không có `custom_price` (đã chấp nhận: chỉ log).
- U2 `checkout.completed` của thuê bao mang `object.subscription.id` và `request_id` = mã đơn. Thiếu `subscription`: kỳ đầu vẫn cấp; dòng `subscriptions` chỉ được ghi khi GET phiên hay webhook có mã thuê bao, nếu không thì `subscription.paid` đầu tiên trả 503 và có cảnh báo `subscription_unlinked`.
- U3 Dạng ngày của `current_period_end_date` (ISO hay số). Đọc cả hai; không đọc được thì sự kiện bị giữ, có cảnh báo.
- U4 `subscription.paid` có `last_transaction.amount_paid`, `tax_amount`, `currency`, `status`. Thiếu `amount_paid` thì không có phép so tiền (như `paidOrderStatus`).
- U5 Kỳ đầu có phát `subscription.paid` thứ hai hay không (đã an toàn: bỏ qua nhờ `paid_through`).
- U6 `POST /v1/customers/billing` nhận `customer_id` và trả `customer_portal_link` (tài liệu), dạng `https://creem.io/my-orders/login/…`; thời hạn của link chưa rõ (server tạo mới mỗi lần bấm).
- U7 Hủy ở cổng khách hàng phát `subscription.canceled` (hay `scheduled_cancel`).
