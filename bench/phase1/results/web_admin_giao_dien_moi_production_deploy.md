# Web Admin: giao diện mới, deploy production

Ngày: 2026-10-08. Thiết kế: `docs/superpowers/specs/2026-10-08-web-admin-giao-dien-moi-design.md`.

- Commit đưa lên: `5aea947` trên `main` (5 commit sửa theo vòng duyệt cuối + 1 commit sửa test chập chờn; CI macOS và Windows xanh, lượt 37782323768).
- Lượt CI đầu (`0ee0a04`) đỏ ở macOS do `QueuePage.test.tsx` đọc kho số việc trước khi effect chạy; đã sửa test (không đổi mã sản phẩm), không deploy bản đỏ.
- Deploy: `pnpm ui:build` + `wrangler deploy -c wrangler.admin.jsonc`; Worker `mt-license-admin`, phiên bản `add6f523-7dcc-490b-8878-42fd4f427d6e` (trước đó `f8b48ea9-5a35-4d8f-b094-fee184c6571d`). Không migration, không đổi API Worker `mt-license`.
- Kiểm từ ngoài (chưa đăng nhập): `/`, `/overview`, `/system`, `/orders`, `/licenses`, `/trials`, `/audit`, `/tools`, `/search`, `/admin/queue`, một tệp trong `/assets/` đều 302 sang Access (kid khớp ACCESS_AUD); `workers.dev` trả 404.
- Trước khi push: tsc sạch, vitest 843/843 ba lần, `pnpm check` exit 0, `pnpm audit` sạch, CSP 0 vi phạm (12 trang, hai khổ, sáng/tối), dung lượng gzip tăng +73,3 KB so với bản cũ (ngưỡng 90 KB).
- Hoàn tác: `pnpm exec wrangler rollback -c wrangler.admin.jsonc` (về `f8b48ea9`).
- Hoãn có chủ ý: `aria-pressed` cho nút Hiện/Ẩn (trùng nhãn đổi chữ, đọc thành "Ẩn, đang nhấn"); tách CSS mô phỏng trạng thái của Gallery khỏi bản build.
