# Web Admin phần 2 · 03: Rà cuối, triển khai, nghiệm thu và biên bản

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Rà soát cuối toàn bộ thay đổi của phần 2, đưa trang Tổng quan lên production (chủ dự án chạy lệnh deploy), nghiệm thu với chủ dự án và ghi biên bản.

**Kiến trúc:** Chỉ deploy Worker `mt-license-admin`. Không migration D1, không deploy Worker API, không đổi Access. Deploy chạy từ thư mục chính của repo (đang ở nhánh `main`).

**Công nghệ:** Wrangler, Cloudflare Access, Chrome headless (công cụ `server/admin-ui/scripts/csp-check.mjs`), trình duyệt của chủ dự án.

**Spec:** `docs/superpowers/specs/2026-10-08-web-admin-tong-quan-design.md` (mục 6, 7). Phụ thuộc: kế hoạch 01 và 02 xong, đã commit trên `main`.

---

## Quy ước

- Task 1 và Task 4 agent làm được. Task 2 (deploy) chạm production: **agent không chạy**; chủ dự án chạy bằng `!` (auto mode chặn agent dùng token OAuth của wrangler và deploy production). Task 3 là việc của chủ dự án, agent ghi kết quả.
- `PADMIN` là `https://admin.aitranslator.io.vn` (địa chỉ `workers.dev` của admin đã tắt từ 2026-10-08).
- Làm trên `main`, kiểm `git branch --show-current` trước mỗi commit; chỉ `git add` file của nhiệm vụ. Commit kết thúc bằng `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`. Không push trừ khi chủ dự án bảo.
- Trước khi deploy, thư mục chính phải **sạch** (`git status --short` rỗng) và đang ở `main`: deploy lấy mã từ thư mục làm việc, nên mọi thay đổi chưa commit sẽ lên production mà không có dấu vết.

---

## Task 1: Rà soát cuối bằng reviewer độc lập

**Files:** không sửa (chỉ sửa khi reviewer tìm ra lỗi thật; khi đó sửa theo TDD ở file liên quan và commit riêng).

- [ ] **Step 1: Chạy bộ kiểm đầy đủ**

Run (từ `server/`): `pnpm check && pnpm audit --audit-level high`
Expected: exit 0; "No known vulnerabilities found".

- [ ] **Step 2: Giao reviewer đối kháng (model mạnh nhất, nhiệm vụ chỉ đọc)**

Reviewer làm việc trên **bản copy** của `HEAD` (`git archive HEAD server docs | tar -x -C <thư mục tạm>` rồi liên kết `node_modules` của `server/` và `server/admin-ui/` vào bản copy), không sửa repo, không chạy `wrangler`, không `pkill`/`killall`. Yêu cầu reviewer:

1. **Đối chiếu từng mục của spec** (mục 2 định nghĩa, mục 3 hợp đồng, mục 4 giao diện, mục 6 kiểm thử): liệt kê chỗ nào code lệch spec.
2. **Đột biến SQL của server** (`server/src/admin-stats.ts`): với mỗi điều kiện (`status = 'paid'`, các dấu `>=`, `<`, `<=`, `>` ở biên ngày/tháng/7/30 ngày, `revoked_at IS NULL`, `expires_at > now`, `deactivated_at IS NULL`, `email IS NOT NULL`, ca `CASE` của `KIND`, `PURCHASED`, `+ ${VN_OFFSET}`), đổi hay bỏ rồi chạy `pnpm exec vitest run test/admin-stats.test.ts`; báo đột biến nào **không** làm test đỏ.
3. **Đột biến giao diện** (`OverviewPage.tsx`, `ChartCard.tsx`, `OrdersPage.tsx`): đổi chuỗi, bỏ điều kiện `n > 0` của liên kết, bỏ `Object.hasOwn`, đổi `stackId`, đổi màu; báo đột biến sống.
4. **Chạy công cụ CSP** trên bản build: `pnpm build` rồi `node scripts/csp-check.mjs --path=/overview --expect=recharts-surface --sizes` ở ba khổ (máy tính, `--mobile`, `--dark`) và `--path=/ --expect="Việc cần xử lý"`; xem ảnh `--shot`; báo vi phạm CSP, lỗi console, bố cục vỡ, chữ tối trên nền tối.
5. **Riêng tư và bảo mật:** `GET /admin/stats` không chứa email, key, `device_id_hash`; vẫn nằm sau `useAdminAuth` (thử không JWT và request `cross-site`); thứ tự middleware không đổi (`registerAdminStats` đứng sau `useAdminAuth`); nhật ký chỉ có `stats_viewed` không `detail`.
6. **Tính đúng đắn số liệu:** thử tay vài kịch bản ranh giới nằm ngoài test hiện có (ví dụ `now` đúng 00:00:00 GMT+7, đúng 00:00:00 UTC, ngày 1 tháng 1, ngày 29/02), so với kết quả tính tay.
7. **Khả năng chịu lỗi:** D1 lỗi giữa chừng cho `computeStats` thì route trả lỗi chung (không nửa phản hồi, không ghi `stats_viewed` khi tính hỏng); đúng một lời gọi `db.batch` cho số liệu.

Báo cáo theo mức Critical, Important, Minor, mỗi mục có `file:dòng`, kịch bản, gợi ý sửa; nói rõ cái gì đã thử mà không phá được; kết luận có an toàn để deploy không.

- [ ] **Step 3: Xử lý phát hiện**

Mọi Critical và Important: sửa (TDD, commit riêng, chạy lại `pnpm check`), rồi cho reviewer xem lại đúng phần đã sửa. Minor: sửa nếu rẻ, nếu không ghi vào biên bản ở Task 4 là việc để sau. Đột biến sống sót là lỗ hổng của test: thêm test, không bỏ qua.

---

## Task 2: Deploy Worker admin (chủ dự án chạy)

- [ ] **Step 1: Kiểm điều kiện trước khi deploy (agent)**

Run (từ thư mục gốc repo):

```bash
git branch --show-current          # phải ra: main
git status --short                 # phải rỗng
git log --oneline -1               # ghi lại commit sẽ deploy
```

Nếu `git status` không rỗng hay nhánh khác `main`, dừng và báo chủ dự án; không deploy.

- [ ] **Step 2: Đưa lệnh cho chủ dự án (agent soạn, chủ dự án chạy)**

Báo: "Sẵn sàng deploy Worker `mt-license-admin` có trang Tổng quan. Không migration, không deploy Worker API, không đổi Access. Bạn chạy:"

```
! cd server && pnpm install --frozen-lockfile && pnpm check
! cd server && pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
```

Expected (lệnh hai): `Uploaded mt-license-admin`, có dòng tải file tĩnh (assets) gồm một file `OverviewPage-<băm>.js`, binding `env.ASSETS`, `env.API (mt-license#AdminRpc)`, `env.DB`. Chờ chủ dự án báo "xong".

- [ ] **Step 3: Kiểm từ ngoài, không đăng nhập (agent)**

```bash
for p in / /overview /admin/stats /admin/whoami; do
  printf "%-16s " "$p"; curl -sS -o /dev/null -m 20 -w '%{http_code}\n' "https://admin.aitranslator.io.vn$p"
done
```

Expected: mọi dòng `302` (sang trang đăng nhập Access); **không dòng nào `200`**. Có `200` thì dừng, báo chủ dự án và hoàn tác: `! cd server && pnpm exec wrangler rollback -c wrangler.admin.jsonc`.

Nếu `curl` báo không phân giải được tên miền dù `dig +short admin.aitranslator.io.vn` có bản ghi (resolver cục bộ nhớ kết quả cũ), dùng `curl --resolve admin.aitranslator.io.vn:443:<IP từ dig> …` thay vì kết luận tên miền hỏng.

- [ ] **Step 4: Cron của Worker API vẫn chạy (chủ dự án, tùy chọn)**

Lần này không deploy Worker API nên không bắt buộc. Nếu chủ dự án muốn chắc: `! cd server && pnpm exec wrangler tail mt-license --format pretty`, để qua một mốc 5 phút, thấy `"*/5 * * * *"` với log `{"event":"reconcile",…}`.

---

## Task 3: Nghiệm thu với chủ dự án (spec mục 7)

Chủ dự án làm trên trình duyệt tại `https://admin.aitranslator.io.vn/overview`; agent ghi kết quả từng bước (đạt, không đạt, bỏ qua và lý do).

- [ ] **Step 1: Mở trang và kiểm Console, tải lười**

Đăng nhập Access, mở `/overview`. Kiểm: trang hiện năm ô số, bốn nhóm, bốn biểu đồ; DevTools > Console không có dòng `Refused to …`. Mở DevTools > Network, vào lại trang "Việc cần xử lý" (tải lại F5): **không** có file `OverviewPage-*.js`; rồi bấm "Tổng quan": file đó tải về (chứng tỏ tải lười).

- [ ] **Step 2: Đối chiếu số liệu với dữ liệu thật**

- "Doanh thu hôm nay" bằng tổng `amount_paid` của các đơn `Đã trả` có ngày trả hôm nay (GMT+7) ở trang Đơn hàng (lọc Trạng thái = Đã trả).
- Mở "Xem bảng số" dưới biểu đồ 30 ngày: cộng cột doanh thu của các ngày bằng "Doanh thu 30 ngày" mà bạn tự cộng từ trang Đơn hàng; ngày không có đơn là `0 đ`.
- "License đang hoạt động" bằng ô "License còn hạn" ở trang "Việc cần xử lý" (cùng định nghĩa).
- Nhóm Sức khỏe: nếu có đơn Chuyển thiếu hay Lỗi thì bấm số đó, sang đúng trang Đơn hàng đã chọn sẵn trạng thái (và danh sách đúng số đơn).
- Nhóm Khách hàng: số "máy dùng thử, đã mua" khớp trang "Máy & dùng thử" (cột Đã mua) cho cửa sổ 30 ngày.

- [ ] **Step 3: Làm mới và nhật ký**

Bấm "Làm mới": giờ "Cập nhật lúc" đổi (hay giữ nếu cùng phút) và không báo lỗi. Mở Nhật ký, tick "hiện các dòng xem" (hay lọc Việc = `stats_viewed`): có các dòng `stats_viewed`, không có `detail`, actor là email của bạn.

- [ ] **Step 4: Điện thoại và giao diện tối**

Mở `/overview` trên điện thoại: không tràn ngang, ô số hai cột, biểu đồ xếp dọc, chạm vào cột hiện tooltip, "Xem bảng số" mở được. Nếu máy dùng chế độ tối: chữ và trục đọc được.

- [ ] **Step 5: Lỗi và phiên hết hạn (tùy chọn)**

Xóa cookie `CF_Authorization` của trang rồi bấm "Làm mới": thanh "Phiên đăng nhập hết hạn" hiện với nút "Tải lại trang".

---

## Task 4: Tài liệu, biên bản và ghi nhớ

**Files:**
- Create: `bench/phase1/results/web_admin_tong_quan_production_deploy.md`
- Modify: `docs/superpowers/specs/2026-10-08-web-admin-tong-quan-design.md` (dòng "Trạng thái")
- Modify: `docs/superpowers/specs/2026-10-07-web-admin-design.md` (lộ trình: đánh dấu phần 2 đã chạy)

- [ ] **Step 1: Lấy thông tin phiên bản Worker (chủ dự án chạy)**

`! cd server && pnpm exec wrangler deployments list -c wrangler.admin.jsonc`: chủ dự án dán vài dòng cuối (agent không chạy được lệnh này). Giờ trong kết quả là UTC; đổi sang GMT+7 (cộng 7 giờ) khi ghi biên bản.

- [ ] **Step 2: Viết biên bản**

Theo mẫu của `bench/phase1/results/web_admin_production_deploy.md`. Ghi:
- ngày giờ deploy (GMT+7), commit (`git log --oneline -1` lúc deploy), phiên bản Worker hiện hành và bản liền trước (đường lui `wrangler rollback`);
- kết quả `pnpm check` (số test server và giao diện) và `pnpm audit`;
- kết quả công cụ CSP trước khi deploy (ba khổ: số vi phạm, lỗi console) và dung lượng: gzip của `OverviewPage-*.js` so với ngưỡng 256000 byte, byte của `index-*.js` so với số đo nền ở kế hoạch 02 Task 1;
- kết quả reviewer cuối (Critical, Important, Minor đã xử lý hay hoãn);
- kết quả `curl` không đăng nhập ở Task 2 Step 3 (mã trả về từng đường dẫn);
- kết quả từng bước nghiệm thu ở Task 3 (đạt, không đạt, bỏ qua và lý do; không ghi mục nào là đã thấy nếu chỉ có lời báo chung của chủ dự án);
- việc để sau (phần 3 và các Minor chưa làm).

Không chép email, key đầy đủ hay `device_id_hash` vào biên bản.

- [ ] **Step 3: Cập nhật trạng thái trong spec**

Trong `docs/superpowers/specs/2026-10-08-web-admin-tong-quan-design.md` đổi dòng `Trạng thái: chủ dự án duyệt thiết kế (ba phần) ngày 2026-10-08, chờ duyệt bản viết này.` thành `Trạng thái: đã triển khai lên production ngày <ngày>, biên bản bench/phase1/results/web_admin_tong_quan_production_deploy.md.` (điền ngày thật). Trong `docs/superpowers/specs/2026-10-07-web-admin-design.md`, ở mục "Lộ trình ba phần" dòng số 2, thêm `(đã chạy trên production <ngày>)`.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # main
git add bench/phase1/results/web_admin_tong_quan_production_deploy.md docs/superpowers/specs/2026-10-08-web-admin-tong-quan-design.md docs/superpowers/specs/2026-10-07-web-admin-design.md
git commit -m "bench(phase1): biên bản triển khai và nghiệm thu Web Admin phần 2 (Tổng quan) trên production

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>"
```

- [ ] **Step 5: Ghi nhớ và báo chủ dự án**

Cập nhật memory của dự án (`web-admin-2026-10-07.md` và dòng chỉ mục trong `MEMORY.md`): phần 2 đã chạy, version Worker hiện hành, việc còn lại là phần 3 (cần brainstorm riêng, dự kiến tách 3a chỉ đọc và 3b sửa giá) và push `main` nếu chủ dự án muốn. Báo chủ dự án: `main` hơn `origin/main` bao nhiêu commit (`git rev-list --count origin/main..main`), hỏi có push không. Không push khi chưa được bảo.
