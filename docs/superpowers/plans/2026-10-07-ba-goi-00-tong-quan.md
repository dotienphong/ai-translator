# Ba gói và mỗi key một máy · 00: Tổng quan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Thay bốn gói bằng ba gói (Free dùng thử 30 ngày, 20 phút/ngày; Monthly 50.000 đ, 50 giờ mỗi 30 ngày; Yearly 500.000 đ, không giới hạn, 365 ngày), chặn reset dùng thử bằng bảng `trials` trên license server, và đổi luật "mỗi key 2 máy" thành "mỗi key 1 máy, trùng máy thì khóa cả hai".

**Kiến trúc:** License server (Hono, D1) có thêm `POST /v1/trial`, bảng `trials`, token dùng thử `typ: "trial"`, mã gói mới, và luật một máy cho `activate`/`validate`/`deactivate`. App (Rust) có thêm token dùng thử trong kho khóa, luật Free bốn điều kiện, trạng thái `conflict`, và kiểm nhanh lúc bắt đầu phiên. Giao diện React hiện ba gói, số ngày dùng thử còn lại, hộp thoại `key_in_use` và trạng thái xung đột.

**Công nghệ:** TypeScript + Hono + Cloudflare Workers + D1 + Vitest (server); Rust + Tauri 2 (app); React 19 + Zustand + Vitest (giao diện). Không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-10-07-three-plans-single-device-design.md`.

## Các kế hoạch con và thứ tự

| # | File | Phạm vi | Phụ thuộc |
|---|---|---|---|
| 01 | `2026-10-07-ba-goi-01-server.md` | `server/`: mã gói, `PLANS`, `computeGrant`, migration `0002`, `/v1/trial`, token dùng thử, luật một máy, admin, vector token | không |
| 02 | `2026-10-07-ba-goi-02-app.md` | `src-tauri/` và `src/`: `Plan`, Free dùng thử, `key_in_use`/`license_conflict`, kiểm nhanh lúc bắt đầu phiên, giao diện, i18n | 01 (vector token `server/test/vectors/token-v1.json` do 01 sinh lại) |
| 03 | `2026-10-07-ba-goi-03-tai-lieu-trien-khai.md` | Sửa spec gốc, EULA; migration và deploy production (chờ chủ dự án cho phép); thử tay | 01, 02 |

Thực thi 01 xong rồi mới tới 02. 03 phần tài liệu chạy song song với 02 được; phần triển khai chạy sau cùng.

## Hợp đồng giữa server và app (khóa lại, hai kế hoạch phải theo đúng)

**Mã gói:** `monthly`, `yearly`. Tên hiển thị `Monthly`, `Yearly`. Gói Free không có mã trên server; trong app vẫn là `free`.

**`GET /v1/plans`** giữ dạng cũ; `PLANS` production:
```json
{ "monthly": { "quota_minutes_per_cycle": 3000, "days_per_order": 30,  "prices": { "VND": 50000 } },
  "yearly":  { "quota_minutes_per_cycle": null, "days_per_order": 365, "prices": { "VND": 500000 } } }
```

**`POST /v1/trial`**
- Body: `{"device_id_hash": "<64 hex thường>"}`.
- `200`: `{"token": "v1.<payload>.<sig>", "started_at": <giây>, "ends_at": <giây>, "issued_at": <giây>}`.
- Lỗi: `400 invalid_request`, `429` (header `Retry-After`), `503 trial_not_configured`.
- Claims của token dùng thử (định dạng `v1`, cùng khóa ký, cùng `kid` với token bản quyền):
  `{"typ": "trial", "kid": "…", "device_id_hash": "…", "started_at": n, "ends_at": n, "issued_at": n}`.
- Token bản quyền **không có** `typ`. Bộ kiểm token bản quyền (server `verifyToken`, app `token.rs`) từ chối payload có khóa `typ`. Bộ kiểm token dùng thử đòi `typ == "trial"` và đủ năm trường kia.

**`POST /v1/licenses/activate`**
- Body thêm `allow_conflict?: boolean` (thiếu là `false`).
- `409 key_in_use`: `{"error": "key_in_use", "devices": [Device]}`. `devices` là các máy đang kích hoạt khác.
- `409 license_conflict`: `{"error": "license_conflict", "devices": [Device]}`. `devices` là mọi máy đang kích hoạt.
- `Device` = `{"activation_id": string, "device_label": string | null, "last_validated_at": number}`, giống `device_limit` cũ.
- Mã `device_limit` bỏ hẳn.

**`POST /v1/licenses/validate`**: thêm `409 license_conflict` (cùng body như trên) khi license có từ 2 máy đang kích hoạt.

**`POST /v1/licenses/deactivate`**: gỡ được mọi máy đang kích hoạt của key, từ chính máy đó hay từ máy khác. Body không đổi.

**Vector token:** `server/test/vectors/token-v1.json` do kế hoạch 01 sinh lại (mã gói mới, thêm vector token dùng thử dưới khóa `trial`). App đọc file này bằng `include_str!` ở `src-tauri/src/license/key.rs` và `manager.rs`.

## Quy ước chung

- Commit kết thúc bằng `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`.
- Không push, không deploy, không chạy lệnh `wrangler` nào chạm production trong 01 và 02. Kế hoạch 03 hỏi chủ dự án trước bước triển khai.
- Bộ kiểm đầy đủ sau mỗi kế hoạch:
  - server: `cd server && pnpm check` (typecheck, `vectors:check`, Vitest, `test:scripts`, `dry-run` không chạm production);
  - app: `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --check`, `pnpm test` (Vitest gốc repo), `pnpm build`.
