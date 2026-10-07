# Web Admin · 00: Tổng quan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Người vận hành làm mọi việc hỗ trợ khách bằng trình duyệt thay cho `cloudflared access curl`. Đợt này gồm: hàng đợi việc cần xử lý, ô tra cứu năm loại chuỗi, danh sách đơn/license/máy dùng thử/nhật ký, trang chi tiết, và giao diện cho mọi thao tác admin đã có.

**Kiến trúc:** SPA React đóng gói vào chính Worker `mt-license-admin` (Workers Static Assets, `run_worker_first: true`). Trang và API cùng origin, nên ứng dụng Cloudflare Access và lớp chống CSRF hiện có dùng được ngay. Server chỉ thêm API **chỉ đọc**. Mọi thao tác ghi đi qua API cũ, nên `audit_log`, `note` bắt buộc và luật nghiệp vụ giữ nguyên.

**Công nghệ:** Server: TypeScript, Hono 4, Cloudflare Workers, D1, Vitest + `@cloudflare/vitest-plugin`. Giao diện: React 19.3, Vite 8, TypeScript 7, Vitest 5 + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-07-web-admin-design.md` (chủ dự án duyệt 2026-10-07; trả lời P05-4).

## Các kế hoạch con và thứ tự

| # | File | Phạm vi | Phụ thuộc |
|---|---|---|---|
| 01 | `2026-10-07-web-admin-01-server.md` | `server/src`: tách `admin-auth.ts`; `lookup` theo key và id; `admin-read.ts` (orders, licenses, trials, audit, queue, summary); `admin-assets.ts` (trang qua `ASSETS`, header bảo mật) | không |
| 02 | `2026-10-07-web-admin-02-giao-dien.md` | `server/admin-ui/`: package React, lớp API, router, component, mười trang, CSS; khối `assets` của `wrangler.admin.jsonc`; `pnpm check` build và test UI | 01 |
| 03 | `2026-10-07-web-admin-03-tai-lieu-trien-khai.md` | Tài liệu (spec gốc §6.8, runbook, P05-4); deploy Worker admin (chờ chủ dự án cho phép); nghiệm thu; biên bản | 01, 02 |

Thực thi theo thứ tự 01 → 02 → 03. Task 1 (tài liệu) của 03 làm song song với 02 được.

## Hợp đồng giữa server và giao diện (khóa lại)

Mọi route dưới đây nằm sau lớp kiểm Access và ghi một dòng `audit_log`. GET từ trang khác (`Sec-Fetch-Site` khác `same-origin`/`none`) bị `403`.

**`POST /admin/lookup`**: body là đúng một trong `{email}`, `{order_code}`, `{device_id_hash}`, **`{license_key}`** (có hay không gạch nối), **`{license_id}`** (UUID). Trả `{licenses: LicenseDetail[], orders: OrderRow[], trial?}`. Tra theo key hay id thì `orders` là mọi đơn có `license_id` hoặc `renew_license_id` bằng license đó. Sai định dạng: `400 {error: "invalid_request", field: "license_key" | "license_id"}`.

**Danh sách** `GET /admin/{orders,licenses,trials,audit}`: trả `{items, next_cursor}`, 50 dòng mỗi trang, mới nhất trước; trang sau gọi lại với `cursor=<next_cursor>`.

| Route | Bộ lọc | Dòng |
|---|---|---|
| `/admin/orders` | `status`, `plan`, `from`, `to` (YYYY-MM-DD GMT+7, `to` tính hết ngày) | `OrderRow`: mọi cột của `orders` trừ `order_token_hash`, `provider_ref`, `email_consent_at`, `expires_at`, `last_checked_at`, `email_attempts`, `email_retry_at` |
| `/admin/licenses` | `state` ∈ `active`, `expired`, `revoked`, `locked`, `conflict`; `plan` | `LicenseRow`: `id`, `license_key` **đã che** (`K7Q2-…-9XMB`), `email`, `plan`, `expires_at`, `created_at`, `revoked_at`, `locked_at`, `active_devices` |
| `/admin/trials` | `state` ∈ `active`, `ended` | `device_id_hash`, `started_at`, `ends_at`, `last_seen_at`, `purchased` (boolean) |
| `/admin/audit` | `actor`, `action`, `order_code`, `from`, `to`; `include_views=1` | `id`, `at`, `actor`, `action`, `license_id`, `order_code`, `detail` (chuỗi JSON hay null). Mặc định ẩn `lookup`, `list_viewed`, `queue_viewed`, `summary_viewed`, `payment_status_viewed` |

Bộ lọc sai: `400 {error: "invalid_request", field}`. Tham số rỗng coi như không có.

**`GET /admin/queue`**: `{needs_review, underpaid, email_failed, locked, conflict, alerts}`, mỗi nhóm `{count, items}` (tối đa 20 dòng). Ba nhóm đầu là `OrderRow`, hai nhóm sau là `LicenseRow`, `alerts` là `{kind, window_start, count, notified_count}`.

**`GET /admin/summary`**: `{revenue_today, currency: "VND", paid_orders_7d, active_licenses}`.

**Trang:** mọi GET ngoài `/admin` và `/admin/*` trả trang từ `ASSETS` (route lạ trả `index.html`). Mọi phản hồi có CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.

**Nhật ký của route đọc:** `list_viewed` (`detail`: `{resource, filters, count}`), `queue_viewed` (`detail`: số dòng mỗi nhóm), `summary_viewed`. Không có email trong `detail`; bộ lọc `actor` dạng `admin:<email>` ghi là `admin:…`.

## Quy ước chung

- Commit kết thúc bằng `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`.
- Không push. Không chạy lệnh `wrangler` nào chạm production trong 01 và 02. Kế hoạch 03 hỏi chủ dự án trước bước deploy.
- Bộ kiểm đầy đủ sau mỗi kế hoạch: `cd server && pnpm check`. Từ kế hoạch 02, lệnh này gồm cả typecheck, test và build của `admin-ui`. CI (`.github/workflows/ci.yml`, job "License server") chạy đúng lệnh này và `pnpm audit --audit-level high`.
- Thư viện mới chỉ có ở `admin-ui` (bảng phiên bản ở kế hoạch 02). Server không thêm thư viện.
