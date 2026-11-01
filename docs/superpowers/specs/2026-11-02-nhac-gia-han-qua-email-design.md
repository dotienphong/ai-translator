# Thư nhắc gia hạn trước 3 ngày

Ngày 2026-11-02. Chủ dự án chọn phạm vi nhỏ: chỉ nhắc **khách đã mua gói 6 tháng hay 1 năm và có email**, đúng 3 ngày trước hạn. Không có thư cho người dùng Free và không thu email mới (bản thiết kế rộng hơn, gồm cả Free, nằm ở tài liệu thiết kế ngày 2026-11-01 và để sau).

## 1. Hành vi

- Cron `*/5` (reconcile.ts) có thêm bước `expiry_reminders`, **chỉ chạy khi `EXPIRY_REMINDERS` = `"on"`** (biến của `wrangler.jsonc`, Worker API; thiếu hay giá trị khác là tắt).
- **Xếp lịch:** license `six_months` hoặc `yearly`, chưa thu hồi, có email, còn hạn tối đa 3 ngày thì có đúng một dòng `expiry_reminders (license_id, cycle)` với `cycle` = `expires_at` lúc xếp lịch. Gia hạn xong thì hạn đổi, lần hết hạn kế tiếp là dòng mới. Gói `monthly` không được nhắc.
- **Gửi:** tối đa 20 thư mỗi lần cron, chỉ trong khung 08:00 đến 20:00 giờ Việt Nam. Ngay trước khi gửi kiểm lại license: đã thu hồi, hết email, đổi gói, đã gia hạn hay đổi hạn (`expires_at` khác `cycle`), đã hết hạn, hay email đã ngừng nhận thì dòng thành `skipped` kèm lý do, không gửi.
- **Không gửi trùng:** khóa chính (license, mốc hạn); giành chỗ bằng `UPDATE … retry_at` trước khi gửi (hai lần cron chồng nhau không cùng gửi); idempotency key `expiry-reminder-<license>-<mốc hạn>`; 409 `invalid_idempotent_request` coi là đã gửi.
- **Lỗi:** 400 và 422 là `gave_up`; lỗi khác hẹn lại sau 10 phút, 1 giờ, 6 giờ, 12 giờ; thôi sau 5 lần. Lỗi chỉ ghi log (`expiry_reminder_failed`); không tạo cảnh báo `email_failed` (chữ của cảnh báo đó nói về thư key).
- **Ngôn ngữ và giá:** ngôn ngữ và loại tiền của đơn đã trả gần nhất của license (`orders.lang`, `orders.currency`); license cấp tay (không có đơn) thì đoán như thư key (`mailLang`). Giá và số ngày lấy từ `PLANS` lúc gửi, cùng loại tiền với đơn.

## 2. Thư

`server/src/email/reminder.ts` và `reminder-strings.ts`, mẫu do chủ dự án duyệt ngày 2026-11-01 (bản xem trước vi và en). Cùng khung với thư key (`layout.ts`): bảng lồng, kiểu inline, không ảnh, không theo dõi mở thư, ngôn ngữ của khách trên và tiếng Anh dưới. Thêm: ô lịch ngày hết hạn, nhãn "Còn N ngày", thẻ gia hạn (giá, số ngày cộng thêm), nút trỏ về trang hướng dẫn trên website, ba bước gia hạn trong app (tên mục "Nâng cấp Pro" lấy đúng chữ của app, `test/node/reminder-strings.test.mjs` kiểm), và chân thư có lý do nhận và link ngừng nhận. Bản ja, zh, ko không có người bản ngữ duyệt (như thư key, spec 2026-10-23 D6). Chỉ in 4 ký tự cuối của key. `emailPage` nhận thêm tùy chọn (`extraCss`, `footerHtml`); không truyền thì thư key giống hệt trước.

## 3. Ngừng nhận

- Link trong thư: `https://api.aitranslator.vn/email/unsubscribe?t=<SHA-256 email>.<HMAC>`; HMAC khóa bằng `RATE_LIMIT_PEPPER` (không thêm secret). Đường dẫn nằm **ngoài `/v1`**: người bấm là người đọc thư, route nhận form thường, còn mọi POST dưới `/v1` bắt buộc JSON.
- `GET` chỉ hiện trang xác nhận (trình quét link của hộp thư không ngừng nhận thay khách); `POST` ghi `reminder_optouts (email_hash, at)`. Lưu mã băm, không lưu email, nên lời từ chối còn nguyên sau khi email bị ẩn danh. Chỉ chặn thư nhắc gia hạn.
- Giới hạn `unsub_ip` 30 lần mỗi giờ mỗi IP; trang có CSP `default-src 'none'`, `no-store`, `noindex`.
- Chưa có header `List-Unsubscribe` (provider hiện chỉ gửi from, to, subject, text, html, reply_to). Thêm khi đã đọc tài liệu Resend về header tùy chỉnh.

## 4. Dữ liệu

Migration `0008_expiry_reminders.sql`: bảng `expiry_reminders`, `reminder_optouts`, index `licenses_expires`. Chỉ thêm; không có REFERENCES tới `licenses`; `expiry_reminders` không chứa email (tra từ `licenses` lúc gửi). Áp trước khi deploy (`docs/release/phat-hanh.md` mục 17).

## 5. Không làm trong đợt này

Thư cho người dùng Free (hết dùng thử, sắp hết dùng thử), thu email mới, gói `monthly`, gộp nhiều license của một email vào một thư (mỗi license một thư), webhook bounce hay complaint của Resend, thẻ Web Admin, tên miền con riêng cho thư.

## 6. Pháp lý (chờ chủ dự án)

Câu đồng ý khi mua nói "lưu email này để gửi và khôi phục license key" (`upgrade.consent`); thư nhắc gia hạn là mục đích thêm. Cần cập nhật Chính sách quyền riêng tư (vi, en), và luật sư xác nhận: có cần nhãn [QC] ở tiêu đề (Nghị định 91/2020/NĐ-CP, Điều 17 và 18) hay xin đồng ý lại với khách đã mua. Mã không đổi chính sách hay câu đồng ý trong app.
