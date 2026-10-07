# Web Admin · 03: Tài liệu, triển khai và nghiệm thu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Sửa tài liệu theo spec Web Admin §6, deploy Worker admin có trang Web Admin lên production (khi chủ dự án cho phép), và nghiệm thu theo spec §5.3.

**Kiến trúc:** Chỉ deploy Worker `mt-license-admin`. Không có migration D1 (kế hoạch 01, "Điều chỉnh so với spec" mục 1), không deploy Worker API, không đổi ứng dụng Access.

**Công nghệ:** Wrangler, Cloudflare Access, trình duyệt của chủ dự án.

**Spec:** `docs/superpowers/specs/2026-10-07-web-admin-design.md` (§5.3, §6). Phụ thuộc: kế hoạch 01 và 02 xong, `cd server && pnpm check` qua.

---

## Quy ước

- Task 1 agent làm được. Task 2 chạm production: **hỏi chủ dự án trước**. Auto mode chặn Claude deploy production và dùng token OAuth của wrangler, nên chủ dự án chạy lệnh bằng `!` hoặc cho phép rõ ràng.
- `PADMIN` là `https://mt-license-admin.dotienphong1993.workers.dev`.
- Commit kết thúc bằng `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`.

---

## Task 1: Cập nhật tài liệu

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (§6.8 "Công cụ hỗ trợ")
- Modify: `docs/release/phat-hanh.md` (mục 4, bước 10)
- Modify: `docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md` (dòng "Còn mở" và mục 8.1, P05-4)

- [ ] **Step 1: Spec gốc §6.8**

Ngay sau dòng `- Đăng ký URL webhook với PayOS (`confirm-webhook`).` (cuối danh sách "Công cụ hỗ trợ"), thêm:

```markdown
- **Giao diện web (Web Admin):** Worker admin phục vụ thêm một trang web cho người vận hành, cùng origin với `/admin/*`, sau cùng lớp Access. Trang có hàng đợi việc cần xử lý, ô tra cứu, các danh sách chỉ đọc và giao diện cho mọi thao tác trên. Thiết kế: `2026-10-07-web-admin-design.md`.
```

- [ ] **Step 2: `docs/release/phat-hanh.md`, mục 4 bước 10**

Đổi khối lệnh đầu tiên của bước 10 từ:

```bash
    pnpm exec wrangler deploy -c wrangler.admin.jsonc
```

thành:

```bash
    pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
```

Đổi khối lệnh thứ hai của bước 10 (sau khi điền `ACCESS_AUD`) thành:

```bash
    pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
    curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/admin/whoami"
    curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/"
```

Trong đoạn "Expected:" ngay sau khối đó, thay `Expected: `302`, `401` hoặc `403`, không bao giờ `200`;` bằng `Expected: cả hai lệnh `curl` in `302`, `401` hoặc `403`, không bao giờ `200`;`, và thêm vào cuối đoạn:

```markdown
    Mở `$PADMIN/` trong trình duyệt sau khi đăng nhập Access: trang Web Admin hiện "Việc cần xử lý" và email người vận hành
    ở góc trên (spec `2026-10-07-web-admin-design.md`). Từ đây các thao tác admin làm được trên trang; `cloudflared access curl`
    vẫn dùng được như cũ.
```

- [ ] **Step 3: Tổng quan Phase 1, P05-4**

Trong `docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md`:
- dòng "**Còn mở:** …": bỏ `P05-4 của kế hoạch 05` khỏi danh sách còn mở (giữ phần "(P05-5 xong 2026-10-07)" và các mục khác);
- mục 8.1, thay dòng `- **P05-4. Giao diện admin.** …` bằng:

```markdown
- **P05-4. Giao diện admin.** Đã chốt 2026-10-07: có. Trang Web Admin chạy trong chính Worker admin, sau cùng lớp Access (spec `2026-10-07-web-admin-design.md`; kế hoạch `2026-10-07-web-admin-*`). JSON API và `cloudflared access curl` vẫn giữ.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md docs/release/phat-hanh.md docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md
git commit -m "docs: Web Admin trong spec gốc §6.8, runbook deploy Worker admin, P05-4 đã chốt"
```

---

## Task 2: Deploy Worker admin lên production (cần chủ dự án cho phép)

- [ ] **Step 1: Hỏi chủ dự án**

Báo: "Sẵn sàng deploy Worker `mt-license-admin` có trang Web Admin. Không có migration, không deploy Worker API, không đổi Access. Cho phép chạy không, hay bạn tự chạy bằng `!`?" Chờ trả lời. Không deploy khi chưa được cho phép.

- [ ] **Step 2: Kiểm và build**

```bash
cd server && pnpm install --frozen-lockfile && pnpm check
```

Expected: tất cả qua; `dry-run` của Worker admin có binding `ASSETS`.

- [ ] **Step 3: Deploy**

```bash
cd server && pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
```

Expected: `Uploaded mt-license-admin`, có dòng tải file tĩnh (assets), binding `env.ASSETS`, `env.API (mt-license#AdminRpc)`, `env.DB`.

- [ ] **Step 4: Kiểm từ ngoài, không qua Access**

```bash
PADMIN=https://mt-license-admin.dotienphong1993.workers.dev
for p in / /admin/whoami /admin/queue /licenses/0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69; do
  printf "%s " "$p"; curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN$p"
done
```

Expected: mọi dòng `302`, `401` hoặc `403`; **không dòng nào `200`**. Có dòng `200` thì dừng, báo chủ dự án và rollback: `pnpm exec wrangler rollback -c wrangler.admin.jsonc`.

- [ ] **Step 5: Cron của Worker API vẫn chạy**

Lần này không deploy Worker API, nhưng theo bài học sự cố 2026-10-07 vẫn kiểm sau mỗi đợt deploy:

```bash
cd server && pnpm exec wrangler tail mt-license --format pretty
```

Để chạy qua một mốc 5 phút. Expected: một sự kiện cron `*/5 * * * *` có log `{"event":"reconcile",…}`. Không thấy thì chủ dự án chạy `pnpm exec wrangler triggers deploy` rồi kiểm lại.

---

## Task 3: Nghiệm thu với chủ dự án (spec §5.3)

Chủ dự án làm trên trình duyệt; agent ghi kết quả.

- [ ] **Step 1: Đăng nhập và các màn hình chỉ đọc, trên máy tính**

Mở `$PADMIN/`, đăng nhập Access. Kiểm:
- thanh trên có email người vận hành; trang mở đầu là "Việc cần xử lý" với ba ô số;
- Đơn hàng, License, Máy & dùng thử, Nhật ký: có dữ liệu thật, bộ lọc chạy, "Tải thêm" (nếu có) chạy;
- mục "Tổng quan" ghi "sắp có", không bấm được;
- DevTools > Console: không có lỗi vi phạm CSP (`Refused to …`) khi đi qua mọi màn hình.

- [ ] **Step 2: Tra cứu bằng năm loại chuỗi**

Trên ô tra cứu, lần lượt: email của chủ dự án; mã đơn thật (ví dụ đơn Monthly đã mua ngày 2026-10-07); license key thử của chủ dự án; license id của key đó (lấy ở URL trang license); `device_id_hash` của máy Mac (lấy ở bảng máy). Mỗi lần ra đúng trang. URL của trang kết quả tra theo email là `/search`, không chứa email.

- [ ] **Step 3: Thao tác thật trên license thử của chủ dự án**

Chỉ trên license thử của chủ dự án:
1. Gửi lại email: thư tới hộp thư của chủ dự án.
2. Gia hạn 1 ngày, lý do "nghiệm thu Web Admin": hạn tăng đúng 1 ngày.
3. Reset hạn mức một máy, lý do "nghiệm thu Web Admin": app trên máy đó nhận epoch mới ở lần kiểm tra kế tiếp.

Sau đó mở Nhật ký, lọc `actor` = `admin:<email của chủ dự án>`: có `key_resent`, `license_extended_manually`, `quota_reset` với đúng `note`.

**Không** thử thu hồi, ẩn danh hay cấp tay trên dữ liệu thật của khách.

- [ ] **Step 4: Trên điện thoại**

Mở `$PADMIN/` trên điện thoại, đăng nhập Access. Kiểm: nút ☰ mở thanh bên; ô tra cứu dùng được; bảng hiện thành thẻ, đọc được; mở một hộp xác nhận, hộp vừa màn hình.

- [ ] **Step 5: Phiên hết hạn (tùy chọn)**

Trong DevTools > Application > Cookies, xóa cookie `CF_Authorization` của `$PADMIN`, rồi bấm sang một mục khác của thanh bên. Expected: thanh báo "Phiên đăng nhập hết hạn" với nút "Tải lại trang"; bấm thì về trang đăng nhập Access.

---

## Task 4: Ghi biên bản

**Files:**
- Create: `bench/phase1/results/web_admin_production_deploy.md`

- [ ] **Step 1: Viết biên bản**

Theo mẫu của `bench/phase1/results/ba_goi_production_deploy.md`. Ghi:
- ngày giờ deploy, commit, phiên bản Worker (`wrangler deployments list -c wrangler.admin.jsonc`);
- kết quả `curl` ở Task 2 Step 4 (mã trả về của từng đường dẫn);
- kết quả kiểm cron;
- kết quả từng bước của Task 3 (đạt / không đạt, ghi chú); bước nào bỏ qua thì ghi lý do.

Không chép email, key đầy đủ hay `device_id_hash` vào biên bản: ghi dạng che (`K7Q2-…-9XMB`, `3fa1…c09e`).

- [ ] **Step 2: Commit**

```bash
git add bench/phase1/results/web_admin_production_deploy.md
git commit -m "bench(phase1): biên bản triển khai và nghiệm thu Web Admin trên production"
```
