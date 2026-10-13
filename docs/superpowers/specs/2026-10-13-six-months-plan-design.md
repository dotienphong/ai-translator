# AI Translator: thêm gói 6 Months (269.000 ₫) — Design

**Ngày:** 2026-10-13
**Trạng thái:** Chủ dự án đã duyệt thiết kế qua hội thoại ngày 2026-10-13. Hạn mức **100 giờ mỗi 30 ngày** do chủ dự án chọn; các mặc định ở mục 1 được duyệt cùng. Làm trực tiếp trên nhánh `main` (chủ dự án chỉ định).
**Quan hệ với spec khác:** bổ sung `2026-10-07-three-plans-single-device-design.md` (§1 bảng gói, §2.1 mã gói và biến `PLANS`): thêm gói trả phí thứ ba. Mọi điều khác của spec đó (Free dùng thử, mỗi key một máy, công thức quy đổi, hạn mức theo chu kỳ 30 ngày) **giữ nguyên**. Spec gốc `2026-09-29-desktop-meeting-translator-design.md` (§2, §6.8) chỉ được thêm một dòng trỏ tới spec này.

---

## 0. Yêu cầu và ràng buộc của chủ dự án

- Thêm một mức giá nữa vào hệ thống thanh toán: **gói 6 tháng, 269.000 ₫, tính từ ngày kích hoạt**.
- Thêm vào app, hệ thống thanh toán (server và admin) và website. Giao diện làm đồng bộ với hiện tại.
- **Không được ảnh hưởng luồng logic thanh toán cũ**, và không ảnh hưởng bất kỳ tính năng nào hiện có của app. Mọi quyết định ở dưới được cân theo ràng buộc này.

## 1. Quyết định

| Mục | Giá trị |
|---|---|
| Mã gói | `six_months` |
| Tên hiển thị | **6 Months** (cùng kiểu chữ tiếng Anh của `Monthly`, `Yearly`; app hiện tên do server trả về cho mọi ngôn ngữ giao diện) |
| Giá | 269.000 ₫ (VND) |
| Số ngày mỗi đơn | **180** (đúng 6 chu kỳ hạn mức 30 ngày, nhất quán với Monthly = 30 ngày) |
| Hạn mức | **6000 phút = 100 giờ mỗi chu kỳ 30 ngày**, mỗi máy (mỗi key một máy) |
| "Tính từ ngày kích hoạt" | Như Monthly và Yearly hiện nay (§1 spec 2026-10-07, mục "Giữ nguyên"): hạn = thời điểm thanh toán thành công + 180 ngày; mua trong app thì app kích hoạt ngay, hai mốc trùng nhau. Không thêm khái niệm "kích hoạt trễ" |
| Tính năng | Đầy đủ tính năng Pro (từ điển thuật ngữ, lịch sử, xuất file), như hai gói trả phí kia |
| Thứ tự hiển thị | Free, Monthly, 6 Months, Yearly (theo thời hạn) |
| Mua thêm cùng gói | Cộng 180 ngày từ max(hiện tại, `expires_at`); `cycle_anchor` giữ nguyên (luật `computeGrant` sẵn có) |
| Đổi gói khi còn hạn | Công thức quy đổi theo giá mỗi ngày của §2.3 spec 2026-10-07, **không sửa**. Giá mỗi ngày: Monthly 1.666,7 ₫; 6 Months 269.000 ÷ 180 = 1.494,4 ₫; Yearly 1.369,9 ₫ |

Ví dụ quy đổi (cho tài liệu và test):
- Monthly còn 20 ngày, mua 6 Months: floor(20 × 1.666,7 ÷ 1.494,4) = **22 ngày**; 6 Months chạy 180 + 22 = 202 ngày.
- Yearly còn 200 ngày, mua 6 Months: floor(200 × 1.369,9 ÷ 1.494,4) = **183 ngày**; 6 Months chạy 363 ngày.
- 6 Months còn 100 ngày, mua Yearly: floor(100 × 1.494,4 ÷ 1.369,9) = **109 ngày**; Yearly chạy 474 ngày.

Giá so với mua lẻ (dùng cho trang Bảng giá, chỉ nêu số có thật): 6 đơn Monthly liên tiếp (180 ngày) tốn 300.000 ₫, gói 6 Months 269.000 ₫ cho cùng 180 ngày; quy ra mỗi tháng khoảng 44.800 ₫ (Monthly 50.000 ₫, Yearly khoảng 41.700 ₫). Hạn mức mỗi chu kỳ gấp đôi Monthly (100 giờ so với 50 giờ).

### Không làm
- Không đổi luật hạn mức, chu kỳ, `quota_epoch`, xung đột máy, dùng thử, khóa tạm, nhắc gia hạn.
- Không thêm phương thức hay tiền tệ thanh toán mới (vẫn VND qua PayOS).
- Không bán 6 Months ngoài app (website chỉ giới thiệu, không có luồng mua).
- Không hạ hạn mức hay đổi giá của Monthly và Yearly (spec §6.8, QĐ17).

---

## 2. Server (license server `mt-license`, D1)

### 2.1 Mã gói, bảng giá
- `server/src/token.ts`: `PLAN_CODES = ["monthly", "six_months", "yearly"]`. Thứ tự này quyết định thứ tự `GET /v1/plans` trả về, tức thứ tự trong app.
- `server/src/plans.ts`: `PLAN_NAMES.six_months = "6 Months"`.
- `server/wrangler.jsonc`, biến `PLANS` (giá trị đúng như mục 1):
  ```jsonc
  "monthly":    { "quota_minutes_per_cycle": 3000, "days_per_order": 30,  "prices": { "VND": 50000 } },
  "six_months": { "quota_minutes_per_cycle": 6000, "days_per_order": 180, "prices": { "VND": 269000 } },
  "yearly":     { "quota_minutes_per_cycle": null, "days_per_order": 365, "prices": { "VND": 500000 } }
  ```
- `parsePlans` vẫn đòi đúng các mã của `PLAN_CODES` và mọi gói có cùng loại tiền; `days_per_order` 180 nằm trong [1, 366]. Vì `parsePlans` đòi đủ ba mã, **code và `wrangler.jsonc` phải lên cùng một lần deploy** (đã là một Worker, một lần `wrangler deploy`).
- **Không đổi logic:** `computeGrant` (cấp mới, mua thêm, đổi gói), ký token (hạn mức lấy từ `plans[lic.plan]`), tạo đơn và webhook, cấp tay của admin (`days_per_order`), email (`PLAN_NAMES`), cổng PayOS (chỉ nhận số tiền) đều đọc theo bảng gói nên nhận gói mới mà không sửa.

### 2.2 Migration D1 `0003_six_months_plan.sql`
- Lý do: `licenses.plan` và `orders.plan` có `CHECK (plan IN ('monthly', 'yearly'))`; SQLite không sửa được CHECK, và `licenses` là bảng cha của `activations`, `deactivations`, `orders`.
- Cách làm: **đúng khuôn 0002** (đã chạy thật trên production, spec 2026-10-07 §5.1): tạo `licenses_new`, `orders_new`, `activations_new`, `deactivations_new` trỏ tới nhau; chép dữ liệu; xóa bảng cũ theo thứ tự con trước cha; đổi tên về tên cũ (SQLite tự sửa `REFERENCES`); tạo lại index; giữ `sqlite_sequence` của `orders` và `deactivations`. Không dùng `PRAGMA defer_foreign_keys`.
- Khác 0002 duy nhất ở hai điểm: CHECK thành `('monthly', 'six_months', 'yearly')`, và **không có ánh xạ mã** (mọi cột chép nguyên giá trị, `plan` không đổi). Mã gói lạ trong dữ liệu cũ vẫn làm CHECK từ chối và migration dừng (giữ lớp chặn mà 0002 cố ý có).
- Schema sau 0003 phải **giống hệt schema sau 0002 trừ chuỗi CHECK** (cùng cột, thứ tự cột, kiểu, ràng buộc, khóa ngoại, index). Có test so sánh `sqlite_master`.
- **Bộ đếm số đơn không bao giờ lùi** (PayOS nhớ mọi `orderCode` đã dùng, không cho dùng lại): `orders_new` nhận `seq` của `orders`, kể cả khi lớn hơn khóa lớn nhất còn lại (như 0002, và test 0002 đã có ca này).
- 0003 chỉ **nới** ràng buộc, nên Worker cũ (chỉ ghi `monthly`, `yearly`) vẫn chạy đúng trên schema mới. Vì vậy áp migration **trước** khi deploy Worker mới, và rollback Worker không cần rollback schema.

### 2.3 `GET /v1/plans` và app cũ
Vấn đề: app đang chạy (0.1.8) vẽ **mọi** gói server trả về, nhưng chỉ bán được `monthly`, `yearly` (`purchase::PLANS`). Nếu server thêm gói vào danh sách cho mọi người, app cũ hiện một dòng mà bấm "Tạo mã thanh toán" thì lỗi `plan`. Đó là ảnh hưởng tới luồng mua cũ.

Giải pháp: danh sách gói theo khả năng của app.
- `GET /v1/plans?plans=<mã,mã,…>` (danh sách mã gói app bán được, tách bằng dấu phẩy).
- `server/src/plans.ts` thêm `LEGACY_PLAN_CODES = ["monthly", "yearly"]`: luôn có trong kết quả. Gói khác chỉ có khi app khai báo mã của nó. Tham số thiếu, rỗng, dài hơn 200 ký tự hay rác thì chỉ có gói cũ; tham số **chỉ thêm** gói chứ không bao giờ bớt `monthly`, `yearly`. Mã lạ trong tham số bị bỏ qua.
- Thứ tự kết quả luôn theo `PLAN_CODES`, không theo thứ tự trong tham số.
- App cũ không gửi tham số nên nhận **đúng response như hôm nay** (hai gói). App mới gửi `plans=monthly,six_months,yearly`.
- `POST /v1/checkout` không cần chặn gì thêm: app cũ không thể gửi `six_months` (nó không có trong danh sách bán của app cũ) và server vẫn kiểm `isPlan`.
- Hệ quả: deploy server trước hay sau app đều không ai thấy gói chưa mua được.
- Gói thêm về sau theo cùng cơ chế (mặc định ẩn với app không khai báo); không làm cơ chế phiên bản API riêng.

### 2.4 Admin (`mt-license-admin`)
- `admin-ui`: `PlanCode` thêm `six_months`; `PLAN_LABELS`; danh sách chọn gói khi cấp tay và bộ lọc; biểu đồ doanh thu theo tháng thêm chuỗi thứ ba (cùng bộ màu tokens của các biểu đồ khác); dữ liệu giả của `dev/fake-api.ts` và `scripts/csp-check.mjs` thêm khóa `six_months`. `dev/Gallery.tsx` là trang minh họa linh kiện, không phụ thuộc mã gói nên không đổi.
- `admin-stats.ts` đã lặp theo `PLAN_CODES` nên response tự có thêm khóa `six_months` trong từng tháng. Máy khách admin cũ bỏ qua khóa lạ.
- `admin-read.ts` lọc theo `PLAN_CODES` (không sửa logic).

---

## 3. App (Rust + React)

### 3.1 Rust (`src-tauri/src/license/`)
- `token.rs`: `Plan::SixMonths` (serde `six_months`), `Plan::parse("six_months")`. Token mang mã gói lạ vẫn là `Malformed` như hiện nay.
- `manager.rs`: `plan_code(Plan::SixMonths) = "six_months"`. Dòng `(_, true) => "yearly"` của công tắc dev (`AI_TRANSLATOR_DEV_PRO`) giữ nguyên.
- `purchase.rs`: `PLANS` thêm `"six_months"` (app mới bán được gói này). `start()` vẫn từ chối mã lạ.
- `client.rs`: `HttpApi::plans()` gọi `GET /v1/plans?plans=<PLANS nối bằng dấu phẩy>` (nguồn duy nhất là hằng `PLANS`, để danh sách app khai báo luôn khớp danh sách app bán được).
- `quota.rs`: **không đổi**: hạn mức đọc từ `quota_minutes_per_cycle` của token (`u32`, 6000 vừa); chu kỳ 30 ngày từ `cycle_anchor` đã hỗ trợ license dài hơn 30 ngày (mua thêm Monthly nhiều lần). Có test riêng cho license 180 ngày với 6000 phút/chu kỳ.
- `trial.rs`, kích hoạt, xung đột, quy trình đơn (`poll`, `apply`): không đổi.

### 3.2 Giao diện (`src/`)
- `lib/ipc.ts`: `LicensePlan` thêm `"six_months"`.
- `UpgradeScreen.tsx`: **không sửa**. Màn hình vẽ thẻ từ bảng gói của server, nên thẻ 6 Months xuất hiện cùng kiểu với các thẻ khác: tên, "269.000 đ / 180 ngày", "100 giờ mỗi 30 ngày", dấu "Đang dùng" khi là gói hiện tại. Chọn sẵn, gia hạn, đổi gói, hiện số ngày quy đổi đều dùng chung mã hiện có.
- `styles/main.css`: các thẻ là một **lưới** (`ul.plans`), không phải danh sách dọc. Nội dung rộng tối đa 700px nên lưới cũ (`minmax(13rem, 1fr)`) luôn ra 3 cột và bốn thẻ thành 3 + 1 (thẻ Yearly lẻ ở hàng hai). Đổi thành `minmax(17rem, 1fr)` để bốn thẻ xếp 2×2 ở mọi cỡ cửa sổ; đây là thay đổi CSS duy nhất của app, chỉ chạm `.plans`.
- `i18n`: thêm `plan.six_months` = "6 Months" cho đủ 5 ngôn ngữ (vi, en, ja, zh, ko; các ngôn ngữ giữ tên gói bằng chữ Latin như `plan.monthly`). Test đối chiếu khóa giữa các ngôn ngữ tự bắt thiếu khóa.
- Hai câu "Mua gói Monthly hoặc Yearly để tiếp tục dịch" (`license.notice.trialEnded`, `error.trialEnded`, 5 ngôn ngữ) sửa để nêu cả ba gói; nếu không, câu này thành thông tin thiếu khi có gói thứ ba. Chỉ đổi phần liệt kê gói, giữ nguyên phần còn lại của câu.
- Giữ nguyên: luồng mua (QR, hỏi đơn mỗi 3 giây, tự kích hoạt), chọn sẵn Monthly cho người mua mới (`defaultPlan`), màn hình chính, thanh phụ đề, Cài đặt › Bản quyền.
- `scripts/ui-preview/tauri-mock.ts`: thêm tham số `plan=six_months` và gói 6 Months trong bảng gói giả, để chụp ảnh và test giao diện.

### 3.3 Vector token dùng chung
- `server/scripts/gen-token-vectors.mjs` thêm **một** vector token hợp lệ cho `six_months` (6000 phút), **ở cuối** danh sách `tokens`. Các vector cũ giữ nguyên từng byte (script tất định). `pnpm vectors` sinh lại file; `pnpm vectors:check` vẫn đỏ nếu file lệch script.
- Rust: đổi băm của `the_vector_file_is_the_agreed_one` sang băm mới (thay đổi có chủ ý của hợp đồng), cập nhật câu "32 vector" cho đúng số mới, và so claims của vector mới trong test sẵn có.
- Lý do: mã gói mới là một phần hợp đồng token giữa server và app; vector là chỗ duy nhất kiểm hai bên cùng hiểu.

---

## 4. Website (`website/`)

Nội dung về sản phẩm chỉ nói điều có thật (số đo kèm điều kiện đo); không công bố công nghệ lõi (xem `website/README.md`). Gói 6 Months chỉ có trong app từ bản phát hành có gói này, nên **deploy website sau cùng** (mục 6).

- `src/plans.mjs`: thêm gói `six_months` giữa `monthly` và `yearly` (`priceVnd: 269000`, `minutesPerCycle: 6000`, `days: 180`, tên và tóm tắt vi/en).
- **Mọi chỗ lấy gói theo vị trí mảng phải sửa thành lấy theo mã.** Cụ thể `keyFacts()` trong `src/build/build.mjs` đang viết `const [free, monthly, yearly] = PLANS;`: nếu chỉ chèn gói vào giữa, `yearly` sẽ lấy nhầm gói 6 Months và `llms.txt` ghi sai giá. Dòng `Pricing:` của `llms.txt` thêm 6 Months.
- `src/build/components.mjs`: thẻ gói thêm mô tả cho `six_months` (dòng "dành cho", "quy ra mỗi tháng", ba gạch đầu dòng). Nhãn "Tiết kiệm nhất / Best value" vẫn ở Yearly.
- `src/build/schema.mjs`: JSON-LD `Offer` tự có thêm 6 Months (lặp theo `PLANS`); `eligibleDuration` = 180 ngày.
- `src/assets/site.css`: lưới `.plans` hiện là `auto-fit, minmax(290px, 1fr)`, ra 3 cột từ khoảng 1024px nên bốn thẻ thành 3 + 1 (một thẻ lẻ ở hàng hai). Đổi thành 1 cột (dưới 700px) và 2×2 (từ 700px), **không có thẻ mồ côi ở mọi bề rộng**, cùng phong cách thẻ hiện có. Đã thử 4 cột ở màn rộng: mỗi thẻ chỉ 275px, giá cỡ lớn ("269.000 ₫") xuống dòng, nên bỏ.
- Nội dung vi và en các trang nhắc gói hay giá: Bảng giá (`pricing`, thêm cột 6 Months vào bảng so sánh, dòng "Quy ra mỗi tháng", câu so với mua lẻ ở mục 1), Trang chủ, FAQ, Tính năng (bảng so sánh gói), Hướng dẫn license (`guide-license`: bảng gói, ví dụ quy đổi thêm giá mỗi ngày của 6 Months, hướng dẫn chọn thẻ), Tải xuống, Giới thiệu, Giải pháp, và các trang khác có nhắc "Monthly hoặc Yearly" hay "ba gói" (rà bằng `grep`, mỗi chỗ xem ngữ cảnh). Chữ "ba gói" thành "bốn gói" (Free + ba gói trả phí) khi nói cả bảng.
- Ràng buộc SEO của test sẵn có (title ≤ 70 ký tự, description 90–165 ký tự, một `h1`) vẫn giữ: các tiêu đề nêu giá phải rút gọn cho vừa.
- Ảnh chụp màn hình Nâng cấp (`src/assets/img/app/`) chụp lại bằng `scripts/ui-preview` (vi và en, sáng và tối nếu có), cập nhật mô tả trong `manifest.json`.
- Test đối chiếu giá với `server/wrangler.jsonc` (`test/site.test.mjs`) mở rộng sang `six_months`; thêm kiểm "mọi chỗ giá viết tay trong `src/content/` khớp `plans.mjs`" nếu chưa có cách bắt lệch.

## 5. Tài liệu

- Spec này; một dòng trỏ tới nó ở bảng gói của spec gốc (§2, §6.8) và của spec 2026-10-07 (§1).
- `docs/legal/eula.vi.md`, `eula.en.md`: bảng gói thêm hàng 6 Months (100 giờ mỗi chu kỳ 30 ngày, 180 ngày mỗi đơn, 269.000 đ); câu "(Monthly 30 ngày, Yearly 365 ngày)" và "30 ngày với Monthly, 365 ngày với Yearly" thêm 6 Months 180 ngày. `docs/legal/README.md` cập nhật mục ba gói thành bốn gói, nâng phiên bản lên **1.2**, ngày hiệu lực ghi 2026-10-13 (theo quy ước của README: đổi gói thì cập nhật văn bản cùng lúc, ghi ngày hiệu lực mới). Trang pháp lý của website sinh từ chính các file này (`website/src/content/legal.mjs`, `published`). Nếu ngày deploy thật khác 2026-10-13 thì sửa lại ngày ở bước phát hành (mục 6), để repo luôn ghi một ngày có thật.
- App chỉ lưu cờ "đã đồng ý điều khoản" (không gắn phiên bản văn bản), nên đổi EULA **không** bắt người dùng hiện tại đồng ý lại. Nội dung pháp lý vẫn chưa qua luật sư như README đã ghi.
- `docs/release/phat-hanh.md`: thêm bước migration 0003 và thứ tự deploy ở mục 6.
- Không sửa tài liệu lịch sử (`bench/`, các kế hoạch cũ trong `docs/superpowers/plans/`).

---

## 6. Triển khai production

Mỗi bước chỉ làm khi chủ dự án cho phép ở bước đó. Các lệnh `wrangler` ghi vào production do chủ dự án chạy (ngày 2026-10-07 chế độ tự động đã chặn agent chạy `wrangler d1 execute --remote`, nên agent viết sẵn script và chủ dự án chạy).

1. **Chuẩn bị migration:** ghi mốc Time Travel của `mt-license-production` (`wrangler d1 time-travel info`). Tùy chọn nhưng khuyến nghị: xuất bản sao dữ liệu (`wrangler d1 export … --remote`) ra ngoài repo, áp 0003 lên bản sao cục bộ, so số dòng, khóa ngoại và `sqlite_sequence` trước/sau, rồi **xóa bản sao** (có email khách).
2. Áp migration 0003 lên production (nới CHECK; Worker đang chạy không bị ảnh hưởng).
3. Deploy Worker API `mt-license`; kiểm `GET /v1/plans` (không tham số: đúng hai gói như cũ; có `?plans=monthly,six_months,yearly`: ba gói), kiểm cron vẫn chạy (`wrangler triggers deploy` nếu mất, xem sự cố 2026-10-07).
4. Deploy Worker admin `mt-license-admin`.
5. Phát hành app (quy trình phát hành 5 bước, nâng phiên bản ở đó; không thuộc spec này).
6. Deploy website sau khi bản app có gói 6 Months đã được đăng.

Rollback: Worker API và admin quay về phiên bản trước bằng Cloudflare (schema mới tương thích). Nếu đã có đơn `six_months` thì dữ liệu đó vẫn hợp lệ với schema mới nhưng Worker cũ sẽ không đọc được gói đó, nên chỉ rollback Worker khi chưa có khách mua gói mới.

## 7. Rủi ro và cách giảm

| Rủi ro | Cách giảm |
|---|---|
| Migration dựng lại 4 bảng production | Đúng khuôn 0002 đã chạy thật; test dữ liệu mẫu + so schema với 0002; Time Travel; thử trên bản sao; áp trước deploy |
| Số đơn PayOS bị lùi | `sqlite_sequence` giữ nguyên, có test ca "đơn lớn nhất đã bị xóa" |
| App cũ thấy gói không mua được | `GET /v1/plans` lọc theo `plans=` (mục 2.3); có test "không tham số = hai gói" |
| Quên mã gói trong `wrangler.jsonc` làm `503 pricing_not_configured` toàn hệ thống | Code và cấu hình cùng một Worker; test `wrangler-config` và `plans.test.ts` khóa đủ ba gói; `wrangler deploy --dry-run` trong `pnpm check` |
| Website lệch giá hoặc lấy gói theo vị trí mảng | Sửa `keyFacts()`; test đối chiếu giá với `wrangler.jsonc`; test `llms.txt` |
| Chu kỳ hạn mức của license dài 180 ngày | Quota đã chạy cho license nhiều chu kỳ (mua thêm Monthly); thêm test 6 chu kỳ × 6000 phút |
| Khách chạy app cũ trên máy thứ hai với key 6 Months | Mỗi key một máy; token có mã lạ bị `Malformed` ở app cũ (đã là hành vi hiện nay); chấp nhận, app tự cập nhật |

## 8. Kiểm thử

Chạy toàn bộ bộ test hiện có làm mốc **trước khi sửa** và chạy lại **sau khi sửa**. Test cũ chỉ được sửa ở chỗ đếm số gói (ví dụ "đúng hai migration" thành ba, bảng gói hai thành ba); mọi kết quả liên quan Monthly và Yearly giữ nguyên.

- **Server (Vitest):**
  - `parsePlans`: bảng ba gói hợp lệ; thiếu `six_months` hay thừa mã lạ thì `null`.
  - `computeGrant`: mua mới, mua thêm, license hết hạn mua 6 Months, đổi gói đủ cả sáu chiều giữa ba gói (ba ví dụ ở mục 1 là các ca bắt buộc), làm tròn xuống chính xác; **hồi quy:** các ca Monthly ↔ Yearly cũ giữ nguyên.
  - `GET /v1/plans`: không tham số trả đúng hai gói như trước; `plans=monthly,six_months,yearly` trả ba gói đúng thứ tự; tham số rác hay thiếu `monthly` không làm mất `monthly`, `yearly`; mã lạ bị bỏ.
  - `POST /v1/checkout` với `six_months`: số tiền 269.000; ước tính hạn khi gia hạn và đổi gói; đơn lưu đúng gói.
  - Đơn đã trả (webhook và reconcile): license `six_months` hạn +180 ngày, token có hạn mức 6000, `validate` trả token đúng; gửi email với tên gói "6 Months".
  - Admin: cấp tay `six_months` (180 ngày), lọc theo gói, thống kê có khóa `six_months`.
  - Token và vector: vector mới được cả server lẫn app nhận.
  - Migration 0003 (mục 2.2): dữ liệu mẫu hai mã gói cũ, khóa ngoại, index, bộ đếm `orders` và `deactivations`, schema giống 0002 trừ CHECK, ghi được `six_months` sau migration, mã lạ vẫn bị CHECK chặn.
  - `test/node/wrangler-config.test.mjs`: `PLANS` có đúng ba gói với giá trị chốt.
- **App (Rust):** parse và vector `six_months`; `purchase::start` nhận `six_months` và vẫn từ chối mã lạ; `HttpApi::plans` gửi đúng tham số; license 180 ngày với 6000 phút trải qua đủ 6 chu kỳ; các test gói cũ giữ nguyên.
- **Giao diện (Vitest + Playwright, ảnh chụp):** màn hình Nâng cấp có đủ Free + ba gói, dòng 6 Months đúng kiểu và đúng số; trạng thái "Đang dùng" khi đang ở 6 Months; i18n đủ khóa 5 ngôn ngữ; câu hết dùng thử nêu đủ ba gói.
- **Website:** `pnpm test` (giá khớp `wrangler.jsonc`, SEO, liên kết, JSON-LD, CSP, `llms.txt`); trang Bảng giá không tràn ngang và không có thẻ mồ côi ở 320/768/1280 px, sáng và tối (bộ test trình duyệt sẵn có `tools/browser/cdp.mjs`).
- **Thử tay (sau khi được phép deploy):** mua một đơn 6 Months thật bằng PayOS và kiểm app tự kích hoạt, hạn +180 ngày, hạn mức hiện "100 giờ"; đổi gói từ Monthly sang 6 Months xem số ngày quy đổi; app 0.1.8 vẫn thấy đúng hai gói.
