# Web Admin phần 2 · 00: Tổng quan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Trang `/overview` (Tổng quan) cho người vận hành: các ô số và biểu đồ về tiền, khách hàng, sức khỏe và mức sử dụng, lấy từ một route chỉ đọc `GET /admin/stats`.

**Kiến trúc:** Server thêm một file `server/src/admin-stats.ts` (các câu SQL, hàm điền ngày và tháng GMT+7, route), chạy mọi truy vấn trong một `db.batch`. Giao diện thêm một trang tải lười (`React.lazy`) dùng Recharts sau một lớp mỏng `ChartCard`. Không migration, không bảng mới, không thao tác ghi mới, không đổi Worker API.

**Công nghệ:** Server: TypeScript, Hono 4, D1, Vitest + `@cloudflare/vitest-plugin`. Giao diện: React 19.3, Vite 8, TypeScript 7, Vitest 5 + jsdom + Testing Library, **Recharts 3.10.1** và **react-is 19.3.0** (ghim đúng phiên bản).

**Spec:** `docs/superpowers/specs/2026-10-08-web-admin-tong-quan-design.md` (chủ dự án duyệt 2026-10-08).

## Các kế hoạch con và thứ tự thực thi

| # | File | Phạm vi |
|---|---|---|
| 01 | `2026-10-08-web-admin-tong-quan-01-server.md` | `server/src/admin-stats.ts`, nối vào `admin.ts`, `stats_viewed` ẩn mặc định, test |
| 02 | `2026-10-08-web-admin-tong-quan-02-giao-dien.md` | `server/admin-ui/`: công cụ kiểm CSP (Task 1), `ChartCard` và Recharts (Task 2), route và thanh bên (Task 3), **cổng kiểm chứng Recharts + CSP (Task 4)**, kiểu và API (Task 5), trang đầy đủ (Task 6), bộ lọc `?status=` (Task 7), API giả và kiểm cuối (Task 8) |
| 03 | `2026-10-08-web-admin-tong-quan-03-trien-khai.md` | Kiểm cuối, tài liệu, deploy, nghiệm thu, biên bản |

**Thứ tự bắt buộc:** 02 Task 1 đến 4 (công cụ, `ChartCard`, khung trang, **cổng kiểm chứng**) → 01 (cả kế hoạch) → 02 Task 5 đến 8 → 03. Lý do: nếu Recharts vi phạm CSP hay quá nặng thì dừng sớm, trước khi dựng cả trang. Tuyệt đối không chạy hai kế hoạch song song (dùng chung một cây làm việc).

## Hợp đồng giữa server và giao diện (khóa lại)

`GET /admin/stats` (không tham số) trả đúng hình dạng ở spec mục 3. Tóm tắt tên trường (giao diện và server phải khớp từng chữ):

- `generated_at`, `currency` (`"VND"`)
- `money`: `today`, `last_7d`, `this_month`, `last_month`, `daily[30]` (`day`, `revenue`, `orders`), `monthly[12]` (`month`, `monthly`, `yearly`, mỗi gói `{revenue, orders}`)
- `customers`: `trials_30d`, `trials_30d_purchased`, `trials_total`, `trials_total_purchased`, `grants_30d` (`new`, `extend`, `change`, `other`, mỗi loại `{orders, revenue}`), `grants_monthly[12]` (`month`, `new`, `extend`, `change`, `other`)
- `health`: `orders_30d` (đủ chín trạng thái), `expiring_7d`, `expiring_30d`, `email` (`paid_with_email_30d`, `sent`)
- `usage`: `active_licenses`, `active_devices`, `devices_7d`, `trials_active`, `new_trials_daily[30]` (`day`, `count`)

Mảng tăng dần theo thời gian; ngày hay tháng không có dữ liệu có giá trị 0. Ngày `YYYY-MM-DD`, tháng `YYYY-MM`, theo GMT+7. Phản hồi không có email, key, hay `device_id_hash`.

## Điều chỉnh so với spec

1. **Vị trí đăng ký route.** Spec nói route đặt trong `admin-read.ts`. Kế hoạch đặt route và phần tính trong **một file `admin-stats.ts`** và đăng ký ở `admin.ts` ngay sau `registerAdminRead(app)`. Lý do: `admin-stats.ts` cần `ORDER_STATUSES`, `vnDayStart`, `DAY`, `VN_OFFSET` của `admin-read.ts`; nếu `admin-read.ts` lại import `admin-stats.ts` thì thành vòng import. Thứ tự middleware bất biến (Access trước mọi route) vẫn giữ vì `registerAdminStats` đăng ký sau `useAdminAuth`.
2. **Bộ lọc action của trang Nhật ký** là ô gõ tự do (có mẫu kiểm), không có danh sách cố định, nên không phải sửa giao diện cho `stats_viewed`.
3. **Liên kết sang Đơn hàng đã lọc.** Trang Đơn hàng hiện **không** đọc bộ lọc từ URL (trạng thái lọc khởi tạo rỗng). Kế hoạch 02 thêm việc đọc `?status=` (chỉ nhận giá trị có trong danh sách trạng thái) làm giá trị khởi tạo.
4. **Công cụ kiểm CSP.** Spec nói "Chrome headless đếm vi phạm". Kế hoạch 02 thêm `server/admin-ui/scripts/csp-check.mjs` (Node thuần, không thêm thư viện): phục vụ `dist/` với đúng CSP production, mở bằng Chrome headless, đọc vi phạm CSP từ stderr, đo dung lượng gzip.

## Quy ước chung

- **Làm thẳng trên nhánh `main`** (chủ dự án dặn 2026-10-08). Trước mỗi commit chạy `git branch --show-current` (phải ra `main`) và `git status --short`. Chỉ `git add` đúng các file của nhiệm vụ, **không** `git add -A`.
- Commit kết thúc bằng dòng `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`.
- **Không push** (chủ dự án tự bảo push). **Không chạy lệnh `wrangler` nào chạm production**; kế hoạch 03 chỉ đưa lệnh cho chủ dự án chạy bằng `!`. Không `pkill` hay `killall` theo tên (từng làm sập dev server của người dùng); nếu mở server tạm thì tự ghi PID và chỉ `kill <PID>` của chính mình.
- Chạy test server: `cd server && pnpm exec vitest run <file>`. Chạy test giao diện: `cd server/admin-ui && pnpm exec vitest run <file>`. Kiểm kiểu: `pnpm exec tsc --noEmit` ở từng thư mục. Bộ kiểm đầy đủ: `cd server && pnpm check` (gồm typecheck, test server, test giao diện, build, `dry-run`).
- Thư viện mới chỉ có ở `admin-ui` (Recharts, react-is). Server không thêm thư viện. Cài xong phải build lại toàn bộ và chạy test (spec §6.12 của dự án).
- Ghi chú về shell: dùng zsh; đừng viết `echo ====` (zsh hiểu `=cmd` thành lệnh), hãy đặt chuỗi trong dấu nháy.
