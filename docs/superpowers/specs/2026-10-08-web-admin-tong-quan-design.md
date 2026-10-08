# Web Admin phần 2: trang Tổng quan (số liệu)

Ngày: 2026-10-08. Trạng thái: đã triển khai lên production ngày 2026-10-08 (Worker admin version `596d98e8-ab15-493d-9237-2d722ec419c4`), nghiệm thu đạt theo lời chủ dự án; biên bản `bench/phase1/results/web_admin_tong_quan_production_deploy.md`.
Thuộc lộ trình ba phần của `2026-10-07-web-admin-design.md` (phần 1 đã chạy trên production). Phần 3 (cấu hình, phát hành, sửa giá) là spec riêng, làm sau khi phần này lên production.

## 1. Mục tiêu và phạm vi

Một trang `/overview` cho người vận hành (một người) nhìn được sức khỏe kinh doanh trong một màn hình: tiền vào, khách hàng, những gì đang hỏng, mức sử dụng. Trang chỉ đọc dữ liệu D1 hiện có.

**Làm:**
- Route chỉ đọc `GET /admin/stats` trả mọi số liệu trong một phản hồi.
- Trang `OverviewPage` có các ô số và biểu đồ, bốn nhóm: Tiền, Khách hàng, Sức khỏe, Sử dụng.
- Mục "Tổng quan" của thanh bên hết ghi "sắp có" và bấm được.

**Không làm:**
- Không migration, không bảng mới, không cron; không thao tác ghi nào mới; không đổi Worker API `mt-license`.
- Không chọn khoảng ngày tùy ý, không xuất CSV, không biểu đồ theo email hay theo khách cụ thể, không tự làm mới theo chu kỳ.
- Không sửa `/admin/summary` (vẫn là ba ô số của trang "Việc cần xử lý").
- Phần 3 (xem `ops_alerts` đầy đủ, bản phát hành và model trên R2, sửa bảng giá) không nằm ở đây.

**Cách làm việc.** Mọi commit đi thẳng vào nhánh `main` (chủ dự án dặn 2026-10-08), không nhánh tính năng. Quy trình subagent như phần 1: mỗi nhiệm vụ có người viết, soát đúng spec, soát chất lượng; reviewer cuối soi cả thay đổi.

## 2. Định nghĩa số liệu

Mọi mốc thời gian theo GMT+7 (Việt Nam không có giờ mùa hè). "Ngày" là `[00:00, 24:00)` GMT+7, khóa `YYYY-MM-DD`; "tháng" là tháng dương lịch GMT+7, khóa `YYYY-MM`. `now` là `deps.now()`. "Cửa sổ 30 ngày" gồm hôm nay và 29 ngày trước; "cửa sổ 12 tháng" gồm tháng này và 11 tháng trước.

**Doanh thu** chỉ tính đơn `status = 'paid'`, cộng `amount_paid`, gán vào ngày hay tháng của `paid_at`. Đơn `underpaid`, `refunded`, `paid_needs_review` không vào doanh thu (có mặt ở nhóm Sức khỏe).

| Nhóm | Số liệu | Cách tính |
|---|---|---|
| Tiền | `today`, `last_7d` | tổng doanh thu hôm nay; tổng của 7 ngày gần nhất (hôm nay và 6 ngày trước) |
| | `this_month`, `last_month` | doanh thu tháng này (tính đến `now`) và cả tháng trước; giao diện chỉ hiện hai con số, không tính phần trăm (so một phần tháng với cả tháng dễ gây hiểu nhầm) |
| | `daily` | 30 phần tử, tăng dần theo ngày: `revenue`, `orders` (số đơn paid) |
| | `monthly` | 12 phần tử, tăng dần theo tháng: `monthly` và `yearly`, mỗi gói có `revenue`, `orders` |
| Khách hàng | `trials_30d`, `trials_total` | số máy trong `trials` có `started_at` trong cửa sổ 30 ngày; tổng |
| | `trials_30d_purchased`, `trials_total_purchased` | trong số đó, máy có `device_id_hash IN (SELECT device_id_hash FROM activations)`: cùng định nghĩa cờ `purchased` của trang Máy & dùng thử |
| | `grants_30d` | đơn paid trong cửa sổ 30 ngày theo `grant_kind`: `new`, `extend` (gia hạn), `change` (đổi gói), `other` (`grant_kind` rỗng); mỗi loại có `orders` và `revenue` |
| | `grants_monthly` | 12 phần tử: số đơn paid mỗi tháng theo `new`, `extend`, `change`, `other` |
| Sức khỏe | `orders_30d` | số đơn theo trạng thái, theo `created_at` trong cửa sổ 30 ngày; luôn có đủ chín trạng thái (`pending`, `processing`, `paid`, `underpaid`, `cancelled`, `expired`, `failed`, `paid_needs_review`, `refunded`), thiếu thì 0 |
| | `expiring_7d`, `expiring_30d` | license `revoked_at IS NULL` và `now < expires_at <= now + 7 hay 30 ngày` (con số 30 ngày đã gồm 7 ngày) |
| | `email.paid_with_email_30d`, `email.sent` | đơn paid trong cửa sổ 30 ngày có `email IS NOT NULL`; trong đó có `email_sent_at IS NOT NULL` |
| Sử dụng | `active_licenses` | `revoked_at IS NULL AND expires_at > now` (như `/admin/summary`) |
| | `active_devices` | `activations` có `deactivated_at IS NULL` thuộc license đang hoạt động ở trên |
| | `devices_7d` | trong số đó, `last_validated_at >= now - 7 ngày` |
| | `trials_active` | số dòng `trials` có `ends_at > now` |
| | `new_trials_daily` | 30 phần tử: số dòng `trials` theo ngày của `started_at` |

Ngày hay tháng không có dữ liệu được server điền 0, nên biểu đồ luôn đủ phần tử.

## 3. API: `GET /admin/stats`

Đặt trong `server/src/admin-read.ts`, cùng khuôn với `summary` và `queue`: sau lớp kiểm Access (`useAdminAuth`), `crossSite` thì `403 forbidden`, `Cache-Control: no-store` (đã do middleware `/admin/*`), ghi đúng một dòng `audit_log` với `action = 'stats_viewed'`, không `detail` và không email. `stats_viewed` thêm vào `VIEW_ACTIONS` (ẩn mặc định ở `/admin/audit`) và vào danh sách action của bộ lọc Nhật ký trong giao diện nếu danh sách đó liệt kê tường minh.

Mọi truy vấn chạy trong **một `db.batch`**, nên các con số của một lần mở trang nhất quán. Hình dạng phản hồi (số nguyên theo giây Unix và VND; mảng tăng dần):

```jsonc
{
  "generated_at": 1790900000,
  "currency": "VND",
  "money": {
    "today": 0, "last_7d": 0, "this_month": 0, "last_month": 0,
    "daily":   [{ "day": "2026-10-08", "revenue": 0, "orders": 0 }],
    "monthly": [{ "month": "2026-10",
                  "monthly": { "revenue": 0, "orders": 0 },
                  "yearly":  { "revenue": 0, "orders": 0 } }]
  },
  "customers": {
    "trials_30d": 0, "trials_30d_purchased": 0, "trials_total": 0, "trials_total_purchased": 0,
    "grants_30d": { "new": { "orders": 0, "revenue": 0 }, "extend": { "orders": 0, "revenue": 0 },
                    "change": { "orders": 0, "revenue": 0 }, "other": { "orders": 0, "revenue": 0 } },
    "grants_monthly": [{ "month": "2026-10", "new": 0, "extend": 0, "change": 0, "other": 0 }]
  },
  "health": {
    "orders_30d": { "pending": 0, "processing": 0, "paid": 0, "underpaid": 0, "cancelled": 0,
                    "expired": 0, "failed": 0, "paid_needs_review": 0, "refunded": 0 },
    "expiring_7d": 0, "expiring_30d": 0,
    "email": { "paid_with_email_30d": 0, "sent": 0 }
  },
  "usage": {
    "active_licenses": 0, "active_devices": 0, "devices_7d": 0, "trials_active": 0,
    "new_trials_daily": [{ "day": "2026-10-08", "count": 0 }]
  }
}
```

Phản hồi chỉ có số: không email, key hay `device_id_hash`. Lỗi D1 thì đi theo trình xử lý lỗi chung của Worker (`500`), giao diện hiện lỗi và nút thử lại.

Khối tính toán nằm trong một file riêng (`server/src/admin-stats.ts`: các câu SQL, hàm điền ngày và tháng, hàm ghép phản hồi) để `admin-read.ts` không phình; `admin-read.ts` chỉ đăng ký route và ghi nhật ký.

## 4. Giao diện

Trang `/overview`, thành phần `OverviewPage`, **tải lười** (`React.lazy` và `Suspense`): thư viện biểu đồ nằm trong một file riêng chỉ tải khi mở trang này; các trang hỗ trợ khách không nặng thêm. Kiểu dữ liệu `Stats` ở `api/types.ts`, hàm `getStats()` ở `api/endpoints.ts`, mục thanh bên bật lại và dẫn tới `/overview`.

Bố cục (máy tính):

```
Tổng quan                                   [Làm mới]  Cập nhật HH:mm
[Hôm nay] [7 ngày] [Tháng này / Tháng trước] [License đang hoạt động] [Máy đang kích hoạt]
TIỀN        Doanh thu 30 ngày (cột)           | Doanh thu 12 tháng (cột chồng Monthly / Yearly)
KHÁCH HÀNG  Dùng thử → mua: 30 ngày x/y, tổng x/y | Mua mới / Gia hạn / Đổi gói theo tháng (cột chồng)
SỨC KHỎE    Đơn 30 ngày theo trạng thái (danh sách) | Sắp hết hạn 7 ngày, 30 ngày | Gửi key thành công x/y
SỬ DỤNG     Máy hoạt động 7 ngày, dùng thử còn hạn | Máy dùng thử mới mỗi ngày (cột)
```

- **Ô số:** tiền định dạng VND bằng bộ định dạng sẵn có của `admin-ui`; ngày hiển thị `dd/MM`, tháng `MM/YYYY`.
- **Đơn theo trạng thái:** danh sách số đơn mỗi trạng thái; trạng thái có vấn đề (`underpaid`, `failed`, `paid_needs_review`) có số lớn hơn 0 thì nổi bật và là liên kết sang `/orders` đã lọc theo trạng thái đó (dùng bộ lọc URL sẵn có của trang Đơn hàng; kế hoạch phải kiểm cách trang đó nhận bộ lọc).
- **Mỗi biểu đồ** có thẻ "Xem bảng số" ngay dưới (`<details>`), liệt kê đúng số đã vẽ; biểu đồ có `role="img"` và nhãn tóm tắt; các chuỗi trong cột chồng phân biệt bằng chú giải chữ, không chỉ bằng màu. Màu lấy từ biến CSS của giao diện sáng và tối.
- **Trạng thái:** đang tải; lỗi kèm nút "Thử lại" (cùng cách xử lý `ApiError` như các trang khác, kể cả `session_expired`); chưa có dữ liệu (biểu đồ toàn 0) hiện dòng "Chưa có dữ liệu trong khoảng này" thay vì khung rỗng.
- **Làm mới:** nút "Làm mới" gọi lại `getStats()`; hiện giờ `generated_at` (GMT+7). Không tự làm mới.
- **Điện thoại:** ô số xếp hai cột, mọi biểu đồ rộng đủ màn hình xếp dọc, tooltip theo chạm.
- Không `style` nội tuyến trong HTML, không thẻ `<style>` hay script nội tuyến (CSP của phần 1 giữ nguyên, không nới).

## 5. Thư viện biểu đồ

Chủ dự án chọn dùng thư viện (không tự vẽ SVG). Chọn **Recharts `3.10.1`** (bản ổn định mới nhất lúc viết, 2026-10-03) cùng **`react-is@19.3.0`** (cùng dòng với React 19.3.0 của `admin-ui`; peer dependency của Recharts là `react`, `react-dom`, `react-is` đều chấp nhận `^19`), ghim đúng phiên bản như các thư viện khác của `admin-ui`. Theo quy tắc phiên bản của dự án (spec §6.12): cài xong build lại toàn bộ và chạy test.

Rủi ro duy nhất là **CSP** (`style-src 'self'`): thư viện không được chèn thẻ `<style>` hay đặt thuộc tính `style` trong HTML (React đặt `style` qua CSSOM thì được phép). Vì vậy nhiệm vụ đầu tiên của kế hoạch là **bước kiểm chứng** trước khi dựng cả trang:
- thêm Recharts, dựng một biểu đồ trong bản build thật, phục vụ với đúng CSP của production, mở bằng Chrome headless và đếm vi phạm CSP (sự kiện `securitypolicyviolation` và log console): phải bằng 0;
- đo dung lượng file tải lười của trang Tổng quan (gzip) và dung lượng gói chính: gói chính không được tăng; file tải lười tăng quá **250 KB gzip** thì dừng và hỏi lại chủ dự án.

Mọi biểu đồ nằm sau một lớp mỏng `ChartCard` (nhận dữ liệu và loại biểu đồ, không lộ kiểu của Recharts ra ngoài). Nếu kiểm chứng thất bại và không có cách sửa cục bộ, chuyển sang tự vẽ SVG chỉ bằng cách đổi bên trong `ChartCard`; các phần khác của trang giữ nguyên.

## 6. Kiểm thử

**Server** (`server/test/admin-stats.test.ts`, dựng dữ liệu bằng harness sẵn có):
- ranh giới ngày GMT+7: đơn lúc 23:30 và 00:10 rơi vào hai ngày khác nhau, và bài kiểm phải phân biệt được với UTC (đơn nằm đúng giữa hai cách tính);
- ranh giới tháng, kể cả tháng có 28, 30 và 31 ngày, và qua năm (tháng 1 so với tháng 12);
- `underpaid`, `refunded`, `paid_needs_review` không vào doanh thu nhưng có trong `orders_30d`; `orders_30d` luôn đủ chín khóa;
- license đã thu hồi hay hết hạn không vào `active_licenses`, `active_devices`, `expiring_*`; máy đã gỡ (`deactivated_at`) không vào `active_devices`;
- cờ máy dùng thử đã mua; `grant_kind` rỗng vào `other`;
- đủ 30 và 12 phần tử, đúng thứ tự tăng dần, khi không có dữ liệu và khi có dữ liệu thưa;
- hai gói `monthly` và `yearly` tách đúng trong `monthly`;
- đúng một dòng nhật ký `stats_viewed`, không có `detail` và không có email; phản hồi không chứa chuỗi email của dữ liệu seed;
- `403` khi không qua Access và khi `Sec-Fetch-Site` là `cross-site`;
- `stats_viewed` bị ẩn khỏi `/admin/audit` mặc định và hiện khi `include_views=1`.

**Giao diện** (jsdom, Vitest): ô số và bảng số khớp dữ liệu giả; ba trạng thái (đang tải, lỗi kèm thử lại, chưa có dữ liệu); liên kết sang `/orders` đã lọc; nút "Làm mới" gọi lại; mục thanh bên bấm được. Recharts thật không chạy trong jsdom (không có kích thước), nên test kiểm dữ liệu đưa vào `ChartCard` và bảng số; chất lượng vẽ thật do bước kiểm chứng Chrome và reviewer cuối. `dev/fake-api.ts` thêm `/admin/stats` để xem trang với dữ liệu mẫu.

**Bộ kiểm chung:** `cd server && pnpm check` (typecheck, test server, test UI, build, `dry-run`) và `pnpm audit --audit-level high` phải qua. Reviewer cuối mở trang Tổng quan trong Chrome headless với CSP thật, ở khổ máy tính và điện thoại, báo vi phạm CSP, lỗi console và bố cục vỡ.

## 7. Triển khai, nghiệm thu, hoàn tác

- Chỉ deploy Worker admin (`pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc`, chủ dự án chạy bằng `!`); không migration; không deploy Worker API; không đổi Access.
- Nghiệm thu bởi chủ dự án trên `https://admin.aitranslator.io.vn/overview`: mở trang, đối chiếu vài con số với trang Đơn hàng (lọc `paid`, đếm tay) và với thẻ "Xem bảng số"; Console không có `Refused to …`; xem trên điện thoại. Biên bản ghi vào `bench/phase1/results/` theo mẫu của phần 1.
- Hoàn tác: `pnpm exec wrangler rollback -c wrangler.admin.jsonc`. Không có thay đổi dữ liệu nên không có bước lùi dữ liệu.

## 8. Rủi ro và điều đã cân nhắc

- **Recharts và CSP, dung lượng:** có cổng kiểm chứng và đường lui ở mục 5.
- **Khối lượng dữ liệu:** các truy vấn quét `orders`, `activations`, `trials` (chưa có chỉ mục theo `paid_at`). Với cỡ vài nghìn dòng là vài mili giây; nếu bảng `orders` vượt khoảng 100.000 dòng thì xét thêm chỉ mục `(status, paid_at)` bằng migration riêng. Không làm trước.
- **`grant_kind` rỗng:** chỉ có ở đơn cũ trước khi cột này có giá trị; vào nhóm `other` để không tính nhầm là mua mới.
- **So sánh tháng:** chỉ hiện hai con số tuyệt đối, tránh phần trăm gây hiểu nhầm giữa phần tháng và cả tháng.
- **Hai nguồn của "đang hoạt động":** `active_licenses` giữ đúng định nghĩa của `/admin/summary`; `active_devices` và `devices_7d` chỉ tính máy trên license đang hoạt động, nên không bằng tổng số dòng `activations` chưa gỡ.
- **Phần 3:** gồm ba việc khác bản chất (xem `ops_alerts` đầy đủ, xem bản phát hành và model trên R2, sửa bảng giá). Sửa giá là rủi ro cao nhất (đổi `PLANS` từ biến của Worker API sang dữ liệu sửa được; ảnh hưởng token đã ký, đơn đang chờ, và trang giá tĩnh của website). Sẽ brainstorm riêng, dự kiến tách thành 3a (chỉ đọc) và 3b (sửa giá).
