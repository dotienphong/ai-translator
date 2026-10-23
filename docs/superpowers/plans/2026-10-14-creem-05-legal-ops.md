# Thanh toán quốc tế bằng Creem · Kế hoạch 05: Pháp lý và vận hành

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Văn bản pháp lý (EULA 1.3, Chính sách quyền riêng tư 1.2) nói đúng việc bán qua Creem; trang Về chúng tôi lấy phiên bản từ chính các văn bản đó thay vì ghi tay; `docs/legal/README.md` và runbook `docs/release/phat-hanh.md` (mục 9) cho chủ dự án đủ hướng dẫn để đăng ký Creem, chạy spike, tạo sản phẩm, đặt secret, deploy đúng thứ tự, nghiệm thu bằng một đơn thật và vận hành sau đó.

**Architecture:** `docs/legal/*.md` là nguồn duy nhất của văn bản pháp lý: app đóng gói chính các file đó và website dựng trang Điều khoản, Chính sách từ chúng, nên sửa ở đó là sửa cả hai nơi. Mỗi văn bản có một test của website kiểu "cần nêu" (viết trước, thấy đỏ rồi mới sửa), và trang Về chúng tôi lấy dòng phiên bản bằng `legalVersionLine`. Runbook thêm một mục 9 theo mẫu mục 8 (đợt thêm gói 6 Months), có test giữ cho runbook nêu mọi secret bắt buộc của hai Worker.

**Tech Stack:** Markdown; Node 24 (`node --test`) cho website và test script của server; Vitest cho phần pháp lý trong app; Chrome không đầu qua `website/tools/browser/cdp.mjs` (xem văn bản trong app). **Không thêm thư viện nào** (CLAUDE.md).

**Spec:** `docs/superpowers/specs/2026-10-14-creem-international-payment-design.md` (§6 ba ý cuối: EULA 1.3, chính sách 1.2, hỏi luật sư; §7 vận hành; §9 triển khai; §11 spike). Kế hoạch này là phần 05, **chạy sau cả bốn phần trước**: 01 và 02 (biến và secret Creem trong `server/wrangler.jsonc` và `server/wrangler.admin.jsonc`, test `wrangler-config`, Worker admin có cổng Creem chỉ đọc mà runbook mục 9 mô tả), 03 (trang xem trước của app) và 04 (website: `website/test/site.test.mjs`, `about.mjs`, `README.md` đã có thay đổi của phần 04, cùng các test quét giá USD và câu cũ).

---

## Quy ước chung cho mọi task (đọc trước khi làm)

- Thư mục dự án: `/Users/dtphong/Desktop/software_business/ai-translator`. **Mỗi lệnh Bash bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`** (shell không giữ thư mục giữa các lệnh). Lệnh của website chạy ở `…/ai-translator/website`, của server ở `…/ai-translator/server` (hai dự án pnpm riêng), của app ở thư mục gốc.
- Làm **trực tiếp trên nhánh `payment`** (chủ dự án chỉ định). Trước khi bắt đầu: `git branch --show-current` phải in `payment`.
- **KHÔNG commit, KHÔNG push, KHÔNG deploy** cho tới khi chủ dự án cho phép (spec D9). Vì vậy kế hoạch này **không có bước "Commit"**: cuối mỗi task chỉ có bước kiểm danh sách file đã đổi. Các lệnh trong runbook (mục 9) là hướng dẫn cho chủ dự án chạy sau này, **agent không chạy chúng** (không có khóa, không có tài khoản Creem).
- **Không** dùng `git add`, `git stash`, `git checkout -- <file>`, `git clean`, `git reset`: cây làm việc có các file chưa theo dõi của việc này và các thay đổi chưa commit của kế hoạch 01 đến 04, không được mất hay lẫn vào đâu.
- Văn bản pháp lý viết tiếng Việt có dấu; bản tiếng Anh là bản dịch tương đương và ghi rõ bản tiếng Việt được ưu tiên (đã có sẵn ở đầu file). **Chỉ nói điều có thật** (`docs/legal/README.md`: "bám sát hành vi thật của sản phẩm"). Chưa có luật sư xem các văn bản này; kế hoạch chỉ đổi những chỗ sản phẩm thật sự đổi, không viết lại.
- **Ngày hiệu lực `14/10/2026`** (EULA 1.3, chính sách 1.2) là ngày viết kế hoạch. Phát hành app có Creem vào ngày khác thì sửa ngày ở bốn file văn bản, `docs/legal/README.md` và `modified` của `website/src/content/{vi,en}/{terms,privacy}.mjs` (mục 9 bước 11 của runbook nhắc lại), để repo ghi một ngày có thật.
- **Mốc trước khi bắt đầu** (sau kế hoạch 01 đến 04): `pnpm test` của `website/` cho `ℹ tests 92`, `ℹ pass 90`, `ℹ fail 0`, `ℹ skipped 2` (hai test của `install.ps1` bỏ qua khi máy không có `pwsh`); `pnpm test:scripts` của `server/` cho `ℹ tests 21`, `ℹ pass 20`, `ℹ fail 0`, `ℹ skipped 1`; Vitest `src/lib/legal.test.ts` và `src/lib/markdown.test.ts` đạt 19 test. Số "Expected" ở các task là tổng sau task đó (hay số test đỏ/đạt của đúng file được chạy); lệch thì đọc lại nguyên nhân, đừng sửa số. Bước "thấy đỏ" của website chạy riêng `test/site.test.mjs` (dưới mười giây); test đỏ in tên hai lần (lúc chạy và ở phần `failing tests`), Expected ghi mỗi tên một lần.
- Mã và chữ trong kế hoạch là **bản đã chạy thật** trong một bản sao tạm của repo. Chép đúng như vậy; diff dùng ngữ cảnh 3 dòng, áp được bằng cách sửa tay hay `git apply` (không cần commit).
- File tạm (script xem bằng mắt, ảnh chụp) ghi vào thư mục tạm của phiên (ví dụ `$TMPDIR`), **không vào repo**. Tiến trình nền (Vite ở cổng 1431 ở Task 6) phải dừng khi xong và kiểm cổng đã trống.

## Quyết định thiết kế của phần này

| # | Quyết định | Lý do |
|---|---|---|
| L1 | Chỉ **thêm và sửa đúng chỗ** (giá USD, hai cách trả, Creem xử lý thanh toán và thuế, hoàn tiền của Creem, bên xử lý dữ liệu, email điền sẵn trang thanh toán, loại tiền của đơn); giữ nguyên cấu trúc, số mục, mọi điều khoản khác | Spec §6; văn bản chưa có luật sư xem nên không viết lại |
| L2 | EULA nói Creem "xử lý thanh toán và thuế bán hàng" của khoản trả bằng thẻ; **không** viết "Merchant of Record" trong EULA. Thuật ngữ đó chỉ ở `docs/legal/README.md`, kèm câu hỏi cho luật sư | Cách mô tả quan hệ bán hàng là kết luận pháp lý: để luật sư quyết, không tự khẳng định trong văn bản người dùng đọc |
| L3 | Giá USD viết `3,99 USD` (tiếng Việt) và `$3.99` (tiếng Anh), như website | Test quét giá USD của website (kế hoạch 04) chấp nhận đúng các dạng này |
| L4 | Trang Về chúng tôi lấy dòng phiên bản bằng `legalVersionLine(file)` (đọc dòng đầu của `docs/legal/*.md`) | Trang ghi tay "1.1, 07/10/2026" cho cả hai văn bản và đã lạc hậu từ EULA 1.2; test đối chiếu từng văn bản |
| L5 | Runbook thêm **mục 9** theo mẫu mục 8; mục 4 (dựng từ đầu) chỉ thêm hai ghi chú về secret Creem | Mục 4 là quy trình đã chạy; mục 8 là mẫu của một "đợt" thêm tính năng |
| L6 | Test (`server/test/node/wrangler-config.test.mjs`) đòi runbook nêu mọi tên trong `secrets.required` của hai Worker | `secrets.required` mới có `CREEM_*`: người dựng từ đầu theo mục 4 mà thiếu chúng thì `wrangler deploy` từ chối |
| L7 | Spike (S1 đến S7) làm bằng `curl` theo runbook, không có script trong repo | Cần khóa test của chủ dự án; sandbox không bao giờ nối vào Worker (spec D8); kết quả nào khác giả định thì làm theo cột "Nếu khác" của spec §11 |

## Cấu trúc file

| File | Việc |
|---|---|
| `docs/legal/eula.vi.md`, `docs/legal/eula.en.md` | EULA 1.3 (Task 1) |
| `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md` | Chính sách quyền riêng tư 1.2 (Task 2) |
| `website/src/content/legal.mjs`, `website/src/content/{vi,en}/about.mjs`, `website/README.md` | `legalVersionLine`; phiên bản ở trang Về chúng tôi (Task 3) |
| `docs/legal/README.md` | phiên bản, giá, bên xử lý, câu hỏi cho luật sư và kế toán (Task 4) |
| `docs/release/phat-hanh.md` | mục 9 và hai ghi chú ở mục 4 (Task 5) |
| `website/test/site.test.mjs`, `server/test/node/wrangler-config.test.mjs` | test của từng task |

---

### Task 0: Kiểm môi trường và ghi mốc

**Files:** không sửa file nào.

- [ ] **Step 1: Kiểm nhánh và cây làm việc**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short -- docs/legal docs/release | wc -l`
Expected: `payment`; `0` (phần này là phần đầu tiên chạm `docs/legal` và `docs/release`). Có file đã theo dõi bị sửa ở đó thì **dừng** và hỏi chủ dự án.

- [ ] **Step 2: Chạy ba bộ test mốc**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 92`, `ℹ pass 90`, `ℹ fail 0`, `ℹ skipped 2`. Ra `ℹ tests 81` nghĩa là kế hoạch 04 chưa áp: **dừng**.

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm test:scripts 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 21`, `ℹ pass 20`, `ℹ fail 0`, `ℹ skipped 1`.

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/lib/legal.test.ts src/lib/markdown.test.ts 2>&1 | grep -E "Test Files|Tests "`
Expected: `Test Files  2 passed (2)`, `Tests  19 passed (19)`.

---

### Task 1: EULA 1.3

**Files:**
- Modify: `docs/legal/eula.vi.md`, `docs/legal/eula.en.md`
- Test: `website/test/site.test.mjs`

Mục 3 của EULA (gói, thanh toán, hạn mức) đổi: phiên bản và ngày hiệu lực; bảng gói thêm giá USD; câu dưới bảng nói giá USD áp dụng khi trả bằng thẻ quốc tế và chưa gồm thuế (Creem cộng thuế ở trang thanh toán nếu nước khách có thu); gạch đầu dòng "đơn trả trước" nêu hai cách trả; một gạch đầu dòng mới nói Creem xử lý thanh toán thẻ và thuế, ghi tên mình trên sao kê và gửi biên lai, ta không nhận số thẻ; gạch đầu dòng hoàn tiền thêm: Creem cũng có thể hoàn tiền, đơn đã hoàn thì license của đơn đó có thể bị thu hồi (spec D5). Mọi mục khác (quyền sử dụng, key, giới hạn trách nhiệm, luật áp dụng…) giữ nguyên.

- [ ] **Step 1: Viết test**

Đổi test EULA hiện có (chỉ kiểm gói 6 Months và bản 1.2) thành test 1.3 nêu đủ bốn gói với giá VND và USD, hai cách trả, Creem, chưa gồm thuế, thu hồi license khi hoàn tiền:

**Sửa `website/test/site.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/test/site.test.mjs
+++ b/website/test/site.test.mjs
@@ -585,11 +585,16 @@
 });
 
 
-test("điều khoản (EULA) nêu gói 6 Months đúng giá và thời hạn, phiên bản 1.2", () => {
+test("điều khoản (EULA) 1.3 nêu bốn gói với giá VND và USD, hai cách trả và Creem xử lý thanh toán thẻ", () => {
   const vi = textOf(htmlByPath.get("/dieu-khoan/"));
   const en = textOf(htmlByPath.get("/en/terms/"));
-  for (const needle of ["Phiên bản 1.2", "6 Months", "269.000 đ", "180 ngày"]) assert.ok(vi.includes(needle), `/dieu-khoan/: thiếu "${needle}"`);
-  for (const needle of ["Version 1.2", "6 Months", "269,000 VND", "180 days"]) assert.ok(en.includes(needle), `/en/terms/: thiếu "${needle}"`);
+  const viNeeds = ["Phiên bản 1.3", "6 Months", "269.000 đ", "180 ngày", "3,99 USD", "21,99 USD", "39,99 USD", "VietQR", "thẻ quốc tế", "Creem", "Armitage Labs OÜ", "chưa gồm thuế", "license của đơn đó có thể bị thu hồi"];
+  const enNeeds = ["Version 1.3", "6 Months", "269,000 VND", "180 days", "$3.99", "$21.99", "$39.99", "VietQR", "international card", "Creem", "Armitage Labs OÜ", "exclude tax", "license of a refunded order may be revoked"];
+  const errors = [
+    ...viNeeds.filter((n) => !vi.includes(n)).map((n) => `/dieu-khoan/: thiếu "${n}"`),
+    ...enNeeds.filter((n) => !en.includes(n)).map((n) => `/en/terms/: thiếu "${n}"`),
+  ];
+  assert.deepEqual(errors, []);
 });
 
 
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern="điều khoản \(EULA\) 1.3" test/site.test.mjs 2>&1 | grep -E "^✖ [^f]|^\s+\+ +'|^ℹ (tests|pass|fail)"`
Expected: FAIL một test: `điều khoản (EULA) 1.3 nêu bốn gói với giá VND và USD, hai cách trả và Creem xử lý thanh toán thẻ`, 18 dòng thiếu (chín cho `/dieu-khoan/` từ `thiếu "Phiên bản 1.3"` tới `thiếu "license của đơn đó có thể bị thu hồi"`, chín cho `/en/terms/` từ `thiếu "Version 1.3"` tới `thiếu "license of a refunded order may be revoked"`); `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`.

- [ ] **Step 3: Sửa EULA tiếng Việt và tiếng Anh**

**Sửa `docs/legal/eula.vi.md`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/docs/legal/eula.vi.md
+++ b/docs/legal/eula.vi.md
@@ -1,6 +1,6 @@
 # Thỏa thuận cấp phép người dùng cuối (EULA) của AI Translator
 
-**Phiên bản 1.2, hiệu lực từ 13/10/2026.**
+**Phiên bản 1.3, hiệu lực từ 14/10/2026.**
 
 Văn bản này là thỏa thuận giữa bạn và **Đỗ Tiến Phong** ("chúng tôi") về việc dùng ứng dụng **AI Translator** ("ứng dụng"). Bằng việc cài đặt hoặc dùng ứng dụng, bạn đồng ý với thỏa thuận này. Nếu không đồng ý, xin đừng cài đặt hay dùng.
 
@@ -17,18 +17,19 @@
 | Gói | Hạn mức, mỗi máy | Thời hạn | Giá |
 |---|---|---|---|
 | Free | 30 phút mỗi ngày | dùng thử 10 ngày, mỗi máy một lần | 0 đ |
-| Monthly | 50 giờ mỗi chu kỳ 30 ngày | 30 ngày mỗi đơn | 50.000 đ |
-| 6 Months | 100 giờ mỗi chu kỳ 30 ngày | 180 ngày mỗi đơn | 269.000 đ |
-| Yearly | không giới hạn | 365 ngày mỗi đơn | 500.000 đ |
+| Monthly | 50 giờ mỗi chu kỳ 30 ngày | 30 ngày mỗi đơn | 50.000 đ hoặc 3,99 USD |
+| 6 Months | 100 giờ mỗi chu kỳ 30 ngày | 180 ngày mỗi đơn | 269.000 đ hoặc 21,99 USD |
+| Yearly | không giới hạn | 365 ngày mỗi đơn | 500.000 đ hoặc 39,99 USD |
 
-(Giá và hạn mức hiện hành do ứng dụng hiển thị khi bạn mua; chúng tôi có thể bán thêm gói mới. Chúng tôi không hạ hạn mức của gói bạn đã trả tiền trong thời hạn đã mua.)
+(Giá bằng đồng áp dụng khi trả bằng VietQR; giá bằng USD áp dụng khi trả bằng thẻ quốc tế và **chưa gồm thuế**: nếu nước của bạn có thu thuế bán hàng, Creem tính thêm ở trang thanh toán. Giá và hạn mức hiện hành do ứng dụng hiển thị khi bạn mua; chúng tôi có thể bán thêm gói mới. Chúng tôi không hạ hạn mức của gói bạn đã trả tiền trong thời hạn đã mua.)
 
 - **Free là gói dùng thử:** dùng được trong **10 ngày**, tính từ lần đầu ứng dụng đăng ký dùng thử với máy chủ của chúng tôi (thường là lần đầu mở ứng dụng có mạng). **Mỗi máy chỉ dùng thử một lần**: gỡ rồi cài lại ứng dụng, hay xóa dữ liệu, không mở lại thời gian dùng thử. Hết dùng thử thì bạn cần mua gói trả phí để tiếp tục dịch.
 - Ba gói trả phí cùng có các tính năng Pro (từ điển thuật ngữ, lưu lịch sử, xuất bản chép lời), khác hạn mức và thời hạn.
-- Gói trả phí là **đơn trả trước** (Monthly 30 ngày, 6 Months 180 ngày, Yearly 365 ngày) bằng VND qua chuyển khoản VietQR (PayOS). **Không tự gia hạn.** Hết hạn thì ứng dụng quay về gói Free nếu máy còn trong thời gian dùng thử; hết dùng thử thì không dịch được cho tới khi bạn mua tiếp.
+- Gói trả phí là **đơn trả trước** (Monthly 30 ngày, 6 Months 180 ngày, Yearly 365 ngày), trả bằng **một trong hai cách**: chuyển khoản VietQR bằng VND (qua PayOS) hoặc thẻ quốc tế bằng USD (qua Creem). **Không tự gia hạn.** Hết hạn thì ứng dụng quay về gói Free nếu máy còn trong thời gian dùng thử; hết dùng thử thì không dịch được cho tới khi bạn mua tiếp.
+- **Thanh toán bằng thẻ quốc tế do Creem xử lý.** Creem (Armitage Labs OÜ, Estonia) xử lý khoản trả và thuế bán hàng của khoản đó, ghi tên Creem trên sao kê thẻ của bạn và gửi biên lai tới email bạn nhập; điều khoản và chính sách của Creem áp dụng cho phần thanh toán đó. Chúng tôi không nhận số thẻ của bạn.
 - **Mua thêm cùng gói** cộng thêm số ngày của gói (30 ngày với Monthly, 180 ngày với 6 Months, 365 ngày với Yearly). **Đổi gói** khi còn hạn: số ngày còn lại của gói cũ được quy đổi theo giá mỗi ngày sang ngày của gói mới (làm tròn xuống), gói mới bắt đầu ngay với chu kỳ mới; ứng dụng hiện trước số ngày quy đổi và ngày hết hạn mới. **Đổi gói không được hoàn tiền.**
 - Hạn mức tính **riêng cho từng máy**, đếm theo thời gian dịch thực tế. Hết hạn mức thì dừng dịch cho tới kỳ reset hoặc khi bạn mua thêm.
-- **Hoàn tiền:** các khoản đã thanh toán **không được hoàn lại**, trừ khi (a) lỗi do chúng tôi khiến bạn không dùng được gói đã mua và chúng tôi không khắc phục được trong thời gian hợp lý, hoặc (b) pháp luật quy định khác. Gửi yêu cầu trong **7 ngày** kể từ ngày thanh toán tới support@aitranslator.vn kèm mã đơn.
+- **Hoàn tiền:** các khoản đã thanh toán **không được hoàn lại**, trừ khi (a) lỗi do chúng tôi khiến bạn không dùng được gói đã mua và chúng tôi không khắc phục được trong thời gian hợp lý, hoặc (b) pháp luật quy định khác. Gửi yêu cầu trong **7 ngày** kể từ ngày thanh toán tới support@aitranslator.vn kèm mã đơn. Khoản trả bằng thẻ quốc tế do Creem xử lý, nên Creem cũng có thể hoàn tiền theo điều khoản của họ; đơn đã được hoàn tiền thì license của đơn đó có thể bị thu hồi.
 - Chúng tôi có thể cấp hoặc gia hạn license thủ công (ví dụ khi bạn chuyển thiếu rồi chuyển bù).
 
 ## 4. License key và kích hoạt
```

**Sửa `docs/legal/eula.en.md`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/docs/legal/eula.en.md
+++ b/docs/legal/eula.en.md
@@ -1,6 +1,6 @@
 # AI Translator End User License Agreement (EULA)
 
-**Version 1.2, effective 13 October 2026. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**
+**Version 1.3, effective 14 October 2026. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**
 
 This is an agreement between you and **Do Tien Phong** ("we", "us") for your use of the **AI Translator** application (the "app"). By installing or using the app you agree to it. If you do not agree, please do not install or use the app.
 
@@ -17,18 +17,19 @@
 | Plan | Quota, per machine | Term | Price |
 |---|---|---|---|
 | Free | 30 minutes per day | 10-day trial, once per machine | 0 VND |
-| Monthly | 50 hours per 30-day cycle | 30 days per order | 50,000 VND |
-| 6 Months | 100 hours per 30-day cycle | 180 days per order | 269,000 VND |
-| Yearly | unlimited | 365 days per order | 500,000 VND |
+| Monthly | 50 hours per 30-day cycle | 30 days per order | 50,000 VND or $3.99 |
+| 6 Months | 100 hours per 30-day cycle | 180 days per order | 269,000 VND or $21.99 |
+| Yearly | unlimited | 365 days per order | 500,000 VND or $39.99 |
 
-(Current prices and quotas are shown in the app when you buy; we may add new plans. We do not reduce the quota of a plan you have already paid for during the period you bought.)
+(VND prices apply when you pay by VietQR; USD prices apply when you pay by international card and **exclude tax**: if your country charges sales tax, Creem adds it on the payment page. Current prices and quotas are shown in the app when you buy; we may add new plans. We do not reduce the quota of a plan you have already paid for during the period you bought.)
 
 - **Free is a trial plan:** it can be used for **10 days**, counted from the first time the app registers the trial with our server (usually the first time you open the app with a network connection). **Each machine gets one trial only**: uninstalling and reinstalling the app, or deleting its data, does not restart the trial. When the trial ends you need a paid plan to keep translating.
 - All three paid plans have the same Pro features (glossary, history, transcript export) and differ in quota and term.
-- A paid plan is an **order paid in advance** (Monthly 30 days, 6 Months 180 days, Yearly 365 days) in VND by VietQR bank transfer (PayOS). **It does not renew automatically.** When it expires the app returns to the Free plan if the machine is still within its trial; after the trial you cannot translate until you buy again.
+- A paid plan is an **order paid in advance** (Monthly 30 days, 6 Months 180 days, Yearly 365 days), paid in **one of two ways**: VietQR bank transfer in VND (through PayOS) or international card in USD (through Creem). **It does not renew automatically.** When it expires the app returns to the Free plan if the machine is still within its trial; after the trial you cannot translate until you buy again.
+- **International card payments are processed by Creem.** Creem (Armitage Labs OÜ, Estonia) handles the payment and the sales tax on it, shows its own name on your card statement and emails you a receipt at the address you entered; Creem's terms and policies apply to that payment. We do not receive your card number.
 - **Buying more of the same plan** adds the plan's days (30 days for Monthly, 180 days for 6 Months, 365 days for Yearly). **Changing plan** while you still have time: the remaining days of the old plan are converted by price per day into days of the new plan (rounded down), and the new plan starts immediately with a new cycle; the app shows the converted days and the new expiry date beforehand. **Plan changes are not refunded.**
 - Quota is counted **per machine**, by actual translation time. When quota runs out, translation stops until the next reset or until you buy more.
-- **Refunds:** amounts paid are **not refundable**, except (a) where our fault prevents you from using the plan you bought and we cannot fix it within a reasonable time, or (b) where the law requires otherwise. Send a request within **7 days** of payment to support@aitranslator.vn with your order code.
+- **Refunds:** amounts paid are **not refundable**, except (a) where our fault prevents you from using the plan you bought and we cannot fix it within a reasonable time, or (b) where the law requires otherwise. Send a request within **7 days** of payment to support@aitranslator.vn with your order code. Card payments are processed by Creem, so Creem may also refund them under its own terms; the license of a refunded order may be revoked.
 - We may issue or extend licenses manually (for example when you transferred too little and then topped up).
 
 ## 4. License keys and activation
```

- [ ] **Step 4: Chạy test (xanh)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern="điều khoản \(EULA\) 1.3" test/site.test.mjs 2>&1 | grep -E "^✖|^✔|^ℹ (tests|pass|fail)"`
Expected: `✔ điều khoản (EULA) 1.3 nêu bốn gói …`, `ℹ tests 1`, `ℹ pass 1`, `ℹ fail 0`.

- [ ] **Step 5: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- docs/legal docs/release website/src/content/legal.mjs | wc -l`
Expected: `2`.

---

### Task 2: Chính sách quyền riêng tư 1.2

**Files:**
- Modify: `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md`
- Test: `website/test/site.test.mjs`

Chính sách đổi ở năm chỗ: phiên bản và ngày hiệu lực; mục 4 (khi nào app kết nối mạng): trang thanh toán do PayOS (VietQR) **hoặc** Creem (thẻ quốc tế) cung cấp, mở bằng trình duyệt; mục 5 (dữ liệu trên máy chủ): đơn hàng có loại tiền, và đoạn "không nhận số thẻ" nói rõ hai trường hợp: với VietQR không gửi email sang PayOS, với thẻ quốc tế **gửi email bạn nhập cho Creem để điền sẵn trang thanh toán** và để Creem gửi biên lai; mục 6 (bên xử lý): thêm hàng Creem (Armitage Labs OÜ, Estonia) và câu về chuyển dữ liệu ra nước ngoài; mục 7: dòng đơn hàng giữ lại kèm loại tiền.

- [ ] **Step 1: Viết test**

**Sửa `website/test/site.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/test/site.test.mjs
+++ b/website/test/site.test.mjs
@@ -598,6 +598,18 @@
 });
 
 
+test("chính sách quyền riêng tư 1.2 nêu Creem là bên xử lý thanh toán thẻ, email điền sẵn trang thanh toán và số thẻ không về chúng tôi", () => {
+  const vi = textOf(htmlByPath.get("/chinh-sach-quyen-rieng-tu/"));
+  const en = textOf(htmlByPath.get("/en/privacy/"));
+  const viNeeds = ["Phiên bản 1.2", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "điền sẵn trang thanh toán", "số thẻ", "loại tiền"];
+  const enNeeds = ["Version 1.2", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "pre-fill the payment page", "card number", "currency"];
+  const errors = [
+    ...viNeeds.filter((n) => !vi.includes(n)).map((n) => `/chinh-sach-quyen-rieng-tu/: thiếu "${n}"`),
+    ...enNeeds.filter((n) => !en.includes(n)).map((n) => `/en/privacy/: thiếu "${n}"`),
+  ];
+  assert.deepEqual(errors, []);
+});
+
 test("bảng so sánh gói: mỗi hàng có đủ số ô như hàng tiêu đề (không sót ô khi thêm một gói)", () => {
   const errors = [];
   let tables = 0;
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern="chính sách quyền riêng tư 1.2" test/site.test.mjs 2>&1 | grep -E "^✖ [^f]|^\s+\+ +'|^ℹ (tests|pass|fail)"`
Expected: FAIL một test: `chính sách quyền riêng tư 1.2 nêu Creem là bên xử lý thanh toán thẻ, email điền sẵn trang thanh toán và số thẻ không về chúng tôi`, 14 dòng thiếu (bảy cho `/chinh-sach-quyen-rieng-tu/`: `thiếu "Phiên bản 1.2"`, `"Creem"`, `"Armitage Labs OÜ"`, `"Estonia"`, `"điền sẵn trang thanh toán"`, `"số thẻ"`, `"loại tiền"`; bảy cho `/en/privacy/`: `"Version 1.2"`, `"Creem"`, `"Armitage Labs OÜ"`, `"Estonia"`, `"pre-fill the payment page"`, `"card number"`, `"currency"`); `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`.

- [ ] **Step 3: Sửa chính sách tiếng Việt và tiếng Anh**

**Sửa `docs/legal/privacy.vi.md`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/docs/legal/privacy.vi.md
+++ b/docs/legal/privacy.vi.md
@@ -1,6 +1,6 @@
 # Chính sách quyền riêng tư của AI Translator
 
-**Phiên bản 1.1, hiệu lực từ 07/10/2026.**
+**Phiên bản 1.2, hiệu lực từ 14/10/2026.**
 
 ## 1. Ai chịu trách nhiệm về dữ liệu của bạn
 
@@ -32,7 +32,7 @@
 1. **Tải model** và kiểm tra bản mới của model (từ `releases.aitranslator.vn`).
 2. **Kiểm tra bản cập nhật** của ứng dụng (từ `releases.aitranslator.vn`).
 3. **Làm việc với license server** của chúng tôi (`api.aitranslator.vn`): khi đăng ký dùng thử Free (lần đầu mở ứng dụng, ngay sau khi bạn đồng ý điều khoản; gửi mã băm của ID máy), khi mua gói, kích hoạt, gỡ kích hoạt, khôi phục key, kiểm tra bản quyền định kỳ, và (hiếm khi) hỏi giờ của máy chủ khi đồng hồ máy bị đặt lệch. Việc hỏi giờ không gửi dữ liệu gì của bạn.
-4. **Trang thanh toán** do PayOS cung cấp, mở bằng trình duyệt của bạn khi bạn mua gói.
+4. **Trang thanh toán** do PayOS (chuyển khoản VietQR) hoặc Creem (thẻ quốc tế) cung cấp, mở bằng trình duyệt của bạn khi bạn mua gói.
 
 Không có kết nối nào khác, và không có kết nối nào mang âm thanh hay nội dung chép lời.
 
@@ -44,24 +44,25 @@
 |---|---|
 | Email bạn nhập khi mua | Gửi key, khôi phục key khi bạn mất |
 | Thời điểm bạn đồng ý xử lý email | Làm bằng chứng đã có sự đồng ý |
-| Đơn hàng: mã đơn, gói, số tiền, thời điểm thanh toán, trạng thái | Cấp và gia hạn license; đối soát; nghĩa vụ kế toán |
+| Đơn hàng: mã đơn, gói, số tiền và loại tiền, thời điểm thanh toán, trạng thái | Cấp và gia hạn license; đối soát; nghĩa vụ kế toán |
 | License: key, gói, ngày hết hạn, chu kỳ hạn mức | Cấp quyền dùng gói trả phí |
 | Dùng thử Free: **mã băm** của ID máy, lúc bắt đầu và lúc hết dùng thử, lần ứng dụng gọi gần nhất | Mỗi máy chỉ dùng thử 10 ngày một lần, kể cả khi cài lại ứng dụng |
 | Máy đã kích hoạt: **mã băm** của ID máy, tên máy (`device_label`) và lần kiểm tra bản quyền gần nhất | Mỗi key chỉ dùng trên một máy, chống lạm dụng, giúp bạn nhận ra máy khi cần gỡ |
 | Nhật ký thay đổi license (ai làm gì, lúc nào) | Hỗ trợ, chống gian lận, tra soát sự cố |
 | Bộ đếm giới hạn tần suất (chỉ lưu giá trị băm HMAC của IP, key, email; tự hết hạn sau khoảng 3 giờ) | Chặn dò key và spam |
 
-Chúng tôi **không** nhận số tài khoản ngân hàng, thẻ hay thông tin tài chính của bạn (việc chuyển tiền do ngân hàng của bạn và PayOS xử lý). Chúng tôi **không** gửi email của bạn sang PayOS. Dùng gói Free mà không mua và không kích hoạt key thì chúng tôi chỉ lưu dòng "Dùng thử Free" ở trên: không có email, tên máy hay thông tin nào khác của bạn.
+Chúng tôi **không** nhận số tài khoản ngân hàng, số thẻ hay thông tin tài chính của bạn (việc chuyển khoản do ngân hàng của bạn và PayOS xử lý; việc trả bằng thẻ do Creem xử lý ngay trên trang thanh toán của Creem). Với VietQR, chúng tôi **không** gửi email của bạn sang PayOS. Với thẻ quốc tế, chúng tôi gửi email bạn nhập trong ứng dụng cho Creem để điền sẵn trang thanh toán và để Creem gửi biên lai cho bạn. Dùng gói Free mà không mua và không kích hoạt key thì chúng tôi chỉ lưu dòng "Dùng thử Free" ở trên: không có email, tên máy hay thông tin nào khác của bạn.
 
 ## 6. Bên thứ ba xử lý dữ liệu, và việc chuyển dữ liệu ra nước ngoài
 
 | Bên | Vai trò | Dữ liệu |
 |---|---|---|
 | **PayOS** (Việt Nam) | Xử lý thanh toán chuyển khoản VietQR | Mã đơn, số tiền, mô tả đơn. Không có email của bạn |
+| **Creem** (Armitage Labs OÜ, Estonia) | Xử lý thanh toán bằng thẻ quốc tế và thuế bán hàng của khoản đó | Mã đơn, gói, số tiền, loại tiền và email bạn nhập trong ứng dụng (để điền sẵn trang thanh toán). Số thẻ do bạn nhập thẳng cho Creem, chúng tôi không nhận; Creem xử lý dữ liệu thanh toán đó theo chính sách riêng của Creem |
 | **Cloudflare** | Máy chủ chạy license server, cơ sở dữ liệu, lưu trữ và phân phối bản cập nhật, model | Dữ liệu ở mục 5; nhật ký kỹ thuật tự hết hạn |
 | **Resend** | Gửi email chứa key | Email bạn, nội dung thư (có key); theo chính sách lưu của Resend |
 
-Cloudflare và Resend đặt máy chủ ngoài Việt Nam, nên dữ liệu ở mục 5 có thể được xử lý ở nước ngoài. Bằng việc mua gói và đồng ý xử lý email, bạn đồng ý với việc này. Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho mục đích quảng cáo.
+Cloudflare và Resend đặt máy chủ ngoài Việt Nam, còn Creem là pháp nhân Estonia (theo pháp luật Estonia), nên dữ liệu ở mục 5 có thể được xử lý ở nước ngoài. Bằng việc mua gói và đồng ý xử lý email, bạn đồng ý với việc này. Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho mục đích quảng cáo.
 
 ## 7. Thời gian lưu và quyền của bạn
 
@@ -73,7 +74,7 @@
 - **bỏ** email và tên máy của bạn;
 - **giữ lại** mã băm của ID máy (dữ liệu bí danh, chỉ để chống lạm dụng: mỗi key một máy, khóa tạm khi đổi máy quá nhiều, dùng lại đúng kích hoạt khi bạn kích hoạt lại cùng máy, mỗi máy chỉ dùng thử Free một lần);
 - **giữ lại** thời điểm bạn đồng ý xử lý email (bằng chứng đã có sự đồng ý trước đó);
-- **giữ lại** dòng đơn hàng ở mức kế toán cần: mã đơn, ngày, số tiền.
+- **giữ lại** dòng đơn hàng ở mức kế toán cần: mã đơn, ngày, số tiền (và loại tiền).
 
 Sau khi xóa, license vẫn dùng được nhưng **không khôi phục qua email** được nữa. Dữ liệu trên máy bạn (lịch sử, cài đặt) do bạn tự xóa trong ứng dụng ("Xóa model và dữ liệu") hoặc khi gỡ cài đặt.
 
```

**Sửa `docs/legal/privacy.en.md`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/docs/legal/privacy.en.md
+++ b/docs/legal/privacy.en.md
@@ -1,6 +1,6 @@
 # AI Translator Privacy Policy
 
-**Version 1.1, effective 7 October 2026. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**
+**Version 1.2, effective 14 October 2026. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**
 
 ## 1. Who is responsible for your data
 
@@ -32,7 +32,7 @@
 1. **Download models** and check for new model versions (from `releases.aitranslator.vn`).
 2. **Check for app updates** (from `releases.aitranslator.vn`).
 3. **Talk to our license server** (`api.aitranslator.vn`): when registering the Free trial (the first time you open the app, right after you accept the terms; this sends a hash of the machine ID), when you buy a plan, activate or deactivate, recover a key, check your license periodically, and (rarely) ask for the server's time when your computer's clock looks wrong. Asking for the time sends none of your data.
-4. **The payment page** provided by PayOS, opened in your browser when you buy a plan.
+4. **The payment page** provided by PayOS (VietQR bank transfer) or Creem (international card), opened in your browser when you buy a plan.
 
 There are no other connections, and none carries audio or transcript text.
 
@@ -44,24 +44,25 @@
 |---|---|
 | The email you enter when buying | Send your key and recover it if you lose it |
 | When you consented to us processing your email | Proof that you consented |
-| Orders: order code, plan, amount, payment time, status | Issue and renew licenses; reconciliation; accounting obligations |
+| Orders: order code, plan, amount and currency, payment time, status | Issue and renew licenses; reconciliation; accounting obligations |
 | License: key, plan, expiry date, usage cycle | Grant the paid plan |
 | Free trial: a **hash** of the machine ID, when the trial started and ends, the app's last call | Each machine gets the 10-day trial only once, even after reinstalling the app |
 | Activated machines: a **hash** of the machine ID, the computer name (`device_label`) and the last license check | Enforce one machine per key, prevent abuse, help you recognize a machine to remove |
 | A change log of licenses (who did what, when) | Support, fraud prevention, incident investigation |
 | Rate-limit counters (only HMAC hashes of IP, key, email; expire after about 3 hours) | Block key guessing and spam |
 
-We do **not** receive your bank account, card or financial details (the transfer is handled by your bank and PayOS). We do **not** send your email to PayOS. If you only use the Free plan and never buy or activate a key, we store only the "Free trial" row above: no email, computer name or any other information about you.
+We do **not** receive your bank account, card number or financial details (a bank transfer is handled by your bank and PayOS; a card payment is handled by Creem on Creem's own payment page). With VietQR we do **not** send your email to PayOS. With an international card we send the email you entered in the app to Creem, to pre-fill the payment page and so that Creem can email you a receipt. If you only use the Free plan and never buy or activate a key, we store only the "Free trial" row above: no email, computer name or any other information about you.
 
 ## 6. Third parties that process data, and transfers abroad
 
 | Party | Role | Data |
 |---|---|---|
 | **PayOS** (Vietnam) | Processes VietQR bank-transfer payments | Order code, amount, order description. Not your email |
+| **Creem** (Armitage Labs OÜ, Estonia) | Processes international card payments and the sales tax on them | Order code, plan, amount, currency and the email you entered in the app (to pre-fill the payment page). You type your card number straight into Creem; we do not receive it, and Creem processes that payment data under Creem's own policy |
 | **Cloudflare** | Hosts the license server, database, and the storage and delivery of updates and models | The data in section 5; technical logs that expire on their own |
 | **Resend** | Sends the email containing your key | Your email and the message (including the key); retention per Resend's own policy |
 
-Cloudflare and Resend operate servers outside Vietnam, so the data in section 5 may be processed abroad. By buying a plan and consenting to email processing you agree to this. We do not sell your data or share it for advertising.
+Cloudflare and Resend operate servers outside Vietnam and Creem is an Estonian company (governed by Estonian law), so the data in section 5 may be processed abroad. By buying a plan and consenting to email processing you agree to this. We do not sell your data or share it for advertising.
 
 ## 7. Retention and your rights
 
@@ -73,7 +74,7 @@
 - **remove** your email and computer name;
 - **keep** the hash of the machine ID (pseudonymous data, only to prevent abuse: one machine per key, the temporary lock for excessive machine switching, reusing the correct activation when you re-activate the same machine, one Free trial per machine);
 - **keep** the time you consented to email processing (proof of earlier consent);
-- **keep** the order row at the level accounting requires: order code, date, amount.
+- **keep** the order row at the level accounting requires: order code, date, amount (and currency).
 
 After deletion your license still works but **can no longer be recovered by email**. Data on your computer (history, settings) is deleted by you in the app ("Delete models and data") or by uninstalling.
 
```

- [ ] **Step 4: Chạy test (xanh)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern="chính sách quyền riêng tư 1.2" test/site.test.mjs 2>&1 | grep -E "^✖|^✔|^ℹ (tests|pass|fail)"`
Expected: `✔ chính sách quyền riêng tư 1.2 nêu Creem …`, `ℹ tests 1`, `ℹ pass 1`, `ℹ fail 0`.

- [ ] **Step 5: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- docs/legal docs/release website/src/content/legal.mjs | wc -l`
Expected: `4`.

---

### Task 3: Trang Về chúng tôi lấy phiên bản từ chính văn bản pháp lý

**Files:**
- Modify: `website/src/content/legal.mjs`, `website/src/content/vi/about.mjs`, `website/src/content/en/about.mjs`, `website/README.md`
- Test: `website/test/site.test.mjs`

Mục "Thông tin pháp lý ngắn gọn" của trang Về chúng tôi ghi tay "Phiên bản 1.1, hiệu lực từ 07/10/2026" cho **cả** Điều khoản và Chính sách, và đã lạc hậu từ EULA 1.2 (13/10/2026). Thay bằng `legalVersionLine(file)`: đọc dòng đầu của `docs/legal/<file>` (`**Phiên bản 1.3, hiệu lực từ 14/10/2026.**`), bỏ chấm cuối. Test đối chiếu từng văn bản của từng ngôn ngữ, nên sau này đổi văn bản mà quên trang này thì không còn trôi.

- [ ] **Step 1: Viết test**

**Sửa `website/test/site.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/test/site.test.mjs
+++ b/website/test/site.test.mjs
@@ -610,6 +610,20 @@
   assert.deepEqual(errors, []);
 });
 
+test("Về chúng tôi nêu đúng phiên bản và ngày hiệu lực của Điều khoản và Chính sách, lấy từ docs/legal", async () => {
+  const errors = [];
+  for (const [urlPath, files] of [["/ve-chung-toi/", ["eula.vi.md", "privacy.vi.md"]], ["/en/about/", ["eula.en.md", "privacy.en.md"]]]) {
+    const text = textOf(htmlByPath.get(urlPath));
+    for (const file of files) {
+      const source = await readFile(path.join(ROOT, "..", "docs", "legal", file), "utf8");
+      const line = /\*\*((?:Phiên bản|Version) [0-9.]+[^.*]*?)\./.exec(source)?.[1];
+      if (!line) errors.push(`docs/legal/${file}: không thấy dòng phiên bản ở đầu văn bản`);
+      else if (!text.includes(line)) errors.push(`${urlPath}: thiếu "${line}" (dòng đầu của ${file})`);
+    }
+  }
+  assert.deepEqual(errors, []);
+});
+
 test("bảng so sánh gói: mỗi hàng có đủ số ô như hàng tiêu đề (không sót ô khi thêm một gói)", () => {
   const errors = [];
   let tables = 0;
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern="Về chúng tôi nêu đúng phiên bản" test/site.test.mjs 2>&1 | grep -E "^✖ [^f]|^\s+\+ +'|^ℹ (tests|pass|fail)"`
Expected: FAIL một test: `Về chúng tôi nêu đúng phiên bản và ngày hiệu lực của Điều khoản và Chính sách, lấy từ docs/legal`, bốn dòng: `/ve-chung-toi/: thiếu "Phiên bản 1.3, hiệu lực từ 14/10/2026" (dòng đầu của eula.vi.md)`, `/ve-chung-toi/: thiếu "Phiên bản 1.2, hiệu lực từ 14/10/2026" (dòng đầu của privacy.vi.md)`, `/en/about/: thiếu "Version 1.3, effective 14 October 2026" (dòng đầu của eula.en.md)`, `/en/about/: thiếu "Version 1.2, effective 14 October 2026" (dòng đầu của privacy.en.md)`; `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`.

- [ ] **Step 3: Thêm `legalVersionLine` và dùng ở trang Về chúng tôi**

**Sửa `website/src/content/legal.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/legal.mjs
+++ b/website/src/content/legal.mjs
@@ -4,6 +4,13 @@
 import { pageHero, docLayout, callout } from "../build/components.mjs";
 
 const read = (name) => readFileSync(new URL(`../../../docs/legal/${name}`, import.meta.url), "utf8");
+
+/** Dòng phiên bản và ngày hiệu lực ở đầu văn bản, bỏ chấm cuối ("Phiên bản 1.3, hiệu lực từ 14/10/2026"): trang Về chúng tôi lấy từ đây thay vì ghi tay. */
+export function legalVersionLine(file) {
+  const match = /\*\*((?:Phiên bản|Version) [0-9.]+[^.*]*?)\./.exec(read(file));
+  if (!match) throw new Error(`docs/legal/${file}: không thấy dòng phiên bản ở đầu văn bản`);
+  return match[1];
+}
 
 export function legalPage({ id, lang, path, file, title, description, crumbs, heroLead, inAppNote, versionLabel, llm, modified = "2026-10-08" }) {
   const source = read(file);
```

**Sửa `website/src/content/vi/about.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/about.mjs
+++ b/website/src/content/vi/about.mjs
@@ -1,6 +1,7 @@
 import { RELEASE } from "../../site.mjs";
 import { pageHero, sectionHead, feature, linkCard, callout, facts, ctaBand } from "../../build/components.mjs";
 import { SITE } from "../../site.mjs";
+import { legalVersionLine } from "../legal.mjs";
 
 const crumbs = [
   { name: "Trang chủ", path: "/" },
@@ -112,8 +113,8 @@
   ["Bên cung cấp", "Đỗ Tiến Phong (cá nhân)"],
   ["Thương hiệu", "AI Translator"],
   ["Luật áp dụng", "Pháp luật Việt Nam<small>Tranh chấp do Tòa án có thẩm quyền tại Việt Nam giải quyết (Điều khoản sử dụng, mục 14)</small>"],
-  ["Điều khoản sử dụng", `<a href="/dieu-khoan/">Thỏa thuận cấp phép (EULA)</a><small>Phiên bản 1.1, hiệu lực từ 07/10/2026</small>`],
-  ["Quyền riêng tư", `<a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a><small>Phiên bản 1.1, hiệu lực từ 07/10/2026</small>`],
+  ["Điều khoản sử dụng", `<a href="/dieu-khoan/">Thỏa thuận cấp phép (EULA)</a><small>${legalVersionLine("eula.vi.md")}</small>`],
+  ["Quyền riêng tư", `<a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a><small>${legalVersionLine("privacy.vi.md")}</small>`],
   ["Ngôn ngữ văn bản", "Bản tiếng Việt là bản gốc và được ưu tiên<small>Bản tiếng Anh là bản dịch để tham khảo</small>"],
   ["Liên hệ về dữ liệu cá nhân", MAIL],
 ])}</div>
```

**Sửa `website/src/content/en/about.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/about.mjs
+++ b/website/src/content/en/about.mjs
@@ -1,6 +1,7 @@
 import { RELEASE } from "../../site.mjs";
 import { pageHero, sectionHead, feature, linkCard, callout, facts, ctaBand } from "../../build/components.mjs";
 import { SITE } from "../../site.mjs";
+import { legalVersionLine } from "../legal.mjs";
 
 const crumbs = [
   { name: "Home", path: "/en/" },
@@ -112,8 +113,8 @@
   ["Provider", "Đỗ Tiến Phong (individual)"],
   ["Brand", "AI Translator"],
   ["Governing law", "Vietnamese law<small>Disputes go to the competent courts in Vietnam (Terms of use, section 14)</small>"],
-  ["Terms of use", `<a href="/en/terms/">License agreement (EULA)</a><small>Version 1.1, effective 7 October 2026</small>`],
-  ["Privacy", `<a href="/en/privacy/">Privacy policy</a><small>Version 1.1, effective 7 October 2026</small>`],
+  ["Terms of use", `<a href="/en/terms/">License agreement (EULA)</a><small>${legalVersionLine("eula.en.md")}</small>`],
+  ["Privacy", `<a href="/en/privacy/">Privacy policy</a><small>${legalVersionLine("privacy.en.md")}</small>`],
   ["Language of the texts", "The Vietnamese version is the original and prevails<small>The English version is a translation for reference</small>"],
   ["Contact about personal data", MAIL],
 ])}</div>
```

**Sửa `website/README.md`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/README.md
+++ b/website/README.md
@@ -20,7 +20,7 @@
 src/plans.mjs           các gói (Free và ba gói trả phí), giá VND và USD (cent), hạn mức (test đối chiếu server/wrangler.jsonc)
 src/content/index.mjs   danh mục trang (id → vi/<id>.mjs, en/<id>.mjs)
 src/content/{vi,en}/    mỗi trang một module: { id, lang, path, title, description, body, ... }
-src/content/legal.mjs   trang điều khoản/chính sách sinh từ docs/legal/*.md (nguồn duy nhất)
+src/content/legal.mjs   trang điều khoản/chính sách sinh từ docs/legal/*.md (nguồn duy nhất); legalVersionLine cho phiên bản ở trang Về chúng tôi
 src/build/              bộ sinh: build, layout (head SEO), schema (JSON-LD), components, icons, markdown, text
 src/assets/             site.css, site.js, font Be Vietnam Pro (OFL), ảnh (img/, og/, app/)
 src/public/             favicon, manifest, install.sh và install.ps1 (script cài macOS và Windows) (chép nguyên vào gốc dist/)
```

- [ ] **Step 4: Chạy toàn bộ test (xanh)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 94`, `ℹ pass 92`, `ℹ fail 0`, `ℹ skipped 2`.

- [ ] **Step 5: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- docs/legal docs/release website/src/content/legal.mjs | wc -l`
Expected: `5`.

---

### Task 4: `docs/legal/README.md`

**Files:**
- Modify: `docs/legal/README.md`

README của thư mục pháp lý ghi phiên bản đang dùng, thông tin đã chốt, câu hỏi cho luật sư và kế toán, và các điều đã đối chiếu với sản phẩm thật; cập nhật cho khớp EULA 1.3 và chính sách 1.2: phiên bản và ngày (kèm lời nhắc sửa ngày khi phát hành ngày khác), bảng giá có USD, bên xử lý có Creem, và **hai câu hỏi mới**: cách mô tả Creem là Merchant of Record (cùng thuế thu nhập và "hóa đơn ngược" hỏi kế toán), và câu đồng ý xử lý email ở màn hình mua chưa nêu thẳng việc email gửi cho Creem. Không có test cho file này; Step 2 đối chiếu số phiên bản với văn bản.

- [ ] **Step 1: Sửa README**

**Sửa `docs/legal/README.md`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/docs/legal/README.md
+++ b/docs/legal/README.md
@@ -1,6 +1,6 @@
 # Văn bản pháp lý của AI Translator
 
-**EULA phiên bản 1.2, hiệu lực từ 2026-10-13; chính sách quyền riêng tư giữ phiên bản 1.1 (2026-10-07)**, dùng để phát hành. Bản 1.0 (2026-10-06) do chủ dự án duyệt; bản 1.1 sửa phần gói theo spec `2026-10-07-three-plans-single-device-design.md` (ba gói, dùng thử Free theo máy, mỗi key một máy); bản 1.2 của EULA thêm gói 6 Months theo spec `2026-10-13-six-months-plan-design.md` (chỉ bảng gói và các câu nêu số ngày mỗi đơn).
+**EULA phiên bản 1.3 và chính sách quyền riêng tư phiên bản 1.2, cùng hiệu lực từ 2026-10-14**, dùng để phát hành. Bản 1.0 (2026-10-06) do chủ dự án duyệt; bản 1.1 sửa phần gói theo spec `2026-10-07-three-plans-single-device-design.md` (ba gói, dùng thử Free theo máy, mỗi key một máy); bản 1.2 của EULA thêm gói 6 Months theo spec `2026-10-13-six-months-plan-design.md` (chỉ bảng gói và các câu nêu số ngày mỗi đơn). EULA 1.3 và chính sách 1.2 thêm thanh toán bằng thẻ quốc tế (USD, qua Creem) theo spec `2026-10-14-creem-international-payment-design.md`: giá USD, Creem xử lý thanh toán và thuế, Creem có thể hoàn tiền, email điền sẵn trang thanh toán của Creem, Creem là bên xử lý dữ liệu. **Ngày hiệu lực 2026-10-14 là ngày viết**: phát hành app có Creem vào ngày khác thì sửa ngày ở bốn file văn bản, ở README này và ở `modified` của `website/src/content/{vi,en}/{terms,privacy}.mjs`, để repo ghi một ngày có thật.
 
 > **Chưa được luật sư xem.** Văn bản bám sát hành vi thật của sản phẩm nhưng **không phải tư vấn pháp lý**, và việc phát hành khi chưa có luật sư xem là rủi ro chủ dự án đã chấp nhận. Khuyến nghị: nhờ luật sư rà (các điểm ở dưới) trước khi bán công khai rộng rãi, rồi cập nhật văn bản và ngày hiệu lực.
 
@@ -14,21 +14,23 @@
 ## Thông tin đã chốt và đã dùng trong văn bản
 - Bên cung cấp: **Đỗ Tiến Phong** (cá nhân), email **support@aitranslator.vn**, thương hiệu hiển thị "AI Translator". Không công bố địa chỉ liên hệ.
 - Dữ liệu cá nhân trên máy chủ giữ không thời hạn, chỉ xóa khi khách yêu cầu (chốt 2026-10-01); sau khi xóa vẫn giữ mã băm ID máy, thời điểm đồng ý, và dòng đơn hàng mức kế toán (spec §10.1).
-- Bốn gói (từ 2026-10-13; ba gói từ 2026-10-07): Free dùng thử 10 ngày mỗi máy, 30 phút mỗi ngày; Monthly 50.000 đ, 50 giờ mỗi chu kỳ 30 ngày; 6 Months 269.000 đ, 100 giờ mỗi chu kỳ 30 ngày, 180 ngày; Yearly 500.000 đ, không giới hạn, 365 ngày. Đơn trả trước, không tự gia hạn; đổi gói quy đổi theo giá mỗi ngày, không hoàn tiền; mỗi key một máy, trùng máy thì tạm khóa cả hai; khóa tạm khi đổi máy quá nhiều; ngoại tuyến 14 ngày.
-- Bên xử lý dữ liệu: PayOS (Việt Nam), Cloudflare, Resend (ngoài Việt Nam).
-- **Mặc định đã chọn** (đổi được bằng cách sửa file): hoàn tiền "không hoàn, trừ lỗi do chúng tôi hoặc pháp luật; yêu cầu trong **7 ngày**"; độ tuổi **16 trở lên**; trần trách nhiệm bằng **số tiền đã trả trong 12 tháng**; ngày hiệu lực: EULA 2026-10-13 (bản 1.2), chính sách quyền riêng tư 2026-10-07 (bản 1.1).
+- Bốn gói (từ 2026-10-13; ba gói từ 2026-10-07): Free dùng thử 10 ngày mỗi máy, 30 phút mỗi ngày; Monthly 50.000 đ hoặc 3,99 USD, 50 giờ mỗi chu kỳ 30 ngày; 6 Months 269.000 đ hoặc 21,99 USD, 100 giờ mỗi chu kỳ 30 ngày, 180 ngày; Yearly 500.000 đ hoặc 39,99 USD, không giới hạn, 365 ngày. Đơn trả trước bằng VietQR (VND, qua PayOS) hoặc thẻ quốc tế (USD, qua Creem; giá USD chưa gồm thuế), không tự gia hạn; đổi gói quy đổi theo giá mỗi ngày, không hoàn tiền; mỗi key một máy, trùng máy thì tạm khóa cả hai; khóa tạm khi đổi máy quá nhiều; ngoại tuyến 14 ngày.
+- Bên xử lý dữ liệu: PayOS (Việt Nam); Cloudflare, Resend (ngoài Việt Nam); Creem (Armitage Labs OÜ, Estonia; điều khoản của Creem, mục 2.1.5).
+- **Mặc định đã chọn** (đổi được bằng cách sửa file): hoàn tiền "không hoàn, trừ lỗi do chúng tôi hoặc pháp luật; yêu cầu trong **7 ngày**"; độ tuổi **16 trở lên**; trần trách nhiệm bằng **số tiền đã trả trong 12 tháng**; ngày hiệu lực: EULA 2026-10-14 (bản 1.3), chính sách quyền riêng tư 2026-10-14 (bản 1.2).
 
 ## Điểm nên hỏi luật sư hay kế toán (từ spec §10.1 và §15)
 - **Loại hình kinh doanh.** Bán dịch vụ có thu tiền bằng tên cá nhân thường cần xem xét đăng ký hộ kinh doanh hoặc doanh nghiệp, kèm nghĩa vụ thuế và hóa đơn (chưa làm hóa đơn điện tử trong MVP). Loại hình quyết định ai là "bên cung cấp" ghi trong văn bản.
 - **Giữ dữ liệu không thời hạn** và **giữ mã băm ID máy sau khi khách yêu cầu xóa** (để chống lạm dụng): có phù hợp Luật Bảo vệ dữ liệu cá nhân 2025 không.
-- **Chuyển dữ liệu ra nước ngoài** (Cloudflare, Resend): có phải lập hồ sơ đánh giá tác động và gửi cơ quan chuyên trách không; hộ kinh doanh và doanh nghiệp siêu nhỏ thường được miễn, nên liên quan loại hình ở trên.
+- **Chuyển dữ liệu ra nước ngoài** (Cloudflare, Resend, Creem): có phải lập hồ sơ đánh giá tác động và gửi cơ quan chuyên trách không; hộ kinh doanh và doanh nghiệp siêu nhỏ thường được miễn, nên liên quan loại hình ở trên.
+- **Bán qua Creem:** EULA và chính sách chỉ nói Creem xử lý thanh toán và thuế bán hàng của khoản trả bằng thẻ, và EULA vẫn là thỏa thuận cấp phép với chúng tôi: nhờ luật sư xem cách mô tả có đủ (Creem là Merchant of Record, tức bên bán trên giao dịch thẻ). Thuế thu nhập của khoản Creem chi trả (nước ngoài, USD) và "hóa đơn ngược" Creem lập cho mỗi lần rút: hỏi kế toán.
+- **Đồng ý xử lý email:** câu đồng ý ở màn hình mua nói "lưu email để gửi và khôi phục key"; với thẻ quốc tế email còn được gửi cho Creem để điền sẵn trang thanh toán (chính sách 1.2, mục 5 và 6 đã nêu): hỏi luật sư có cần nêu thẳng ở câu đồng ý không.
 - **Điều khoản miễn trừ và giới hạn trách nhiệm** có thể bị coi là vô hiệu nếu bất lợi cho người tiêu dùng theo pháp luật bảo vệ người tiêu dùng của Việt Nam.
 - **Ghi âm và chép lời cuộc họp**: câu chuyển trách nhiệm sang người dùng (EULA mục 6) có đủ không.
 - **Hạn chế dịch ngược** "trừ khi pháp luật cho phép" (EULA mục 5) và **cấm đổi thương hiệu** (spec §10.2).
 - **Thời hạn lưu log thư của Resend**: spec yêu cầu ghi vào chính sách; **chưa kiểm**. Hiện chính sách ghi "theo chính sách lưu của Resend".
 
 ## Đã đối chiếu với sản phẩm thật
-Âm thanh chỉ trong RAM và không gửi đi (kiểm A7: HAR và `nettop` không có luồng ngoài lúc dịch, log không chứa chữ chép lời); danh sách kết nối mạng của app (A7: chỉ `api.` và `releases.aitranslator.vn`); server chỉ lưu email, đơn, license, mã băm máy, `device_label`, thời điểm kiểm tra (spec §10.1); bảng giá và hạn mức (spec §2); luật quy đổi khi đổi gói (§6.8); mỗi key một máy và khóa tạm (§6.8, §10.2); bảng `trials` của dùng thử Free (§10.1); token ngoại tuyến 14 ngày (`refresh_before - issued_at = 1 209 600 s` ở bản triển khai); giấy phép Hy-MT2 Apache 2.0, Whisper và Silero MIT (§10.1).
+Âm thanh chỉ trong RAM và không gửi đi (kiểm A7: HAR và `nettop` không có luồng ngoài lúc dịch, log không chứa chữ chép lời); danh sách kết nối mạng của app (A7: chỉ `api.` và `releases.aitranslator.vn`); server chỉ lưu email, đơn, license, mã băm máy, `device_label`, thời điểm kiểm tra (spec §10.1); bảng giá và hạn mức (spec §2); luật quy đổi khi đổi gói (§6.8); mỗi key một máy và khóa tạm (§6.8, §10.2); bảng `trials` của dùng thử Free (§10.1); token ngoại tuyến 14 ngày (`refresh_before - issued_at = 1 209 600 s` ở bản triển khai); giấy phép Hy-MT2 Apache 2.0, Whisper và Silero MIT (§10.1); giá USD và hạn mức (spec `2026-10-14-creem-international-payment-design.md`, D2); email điền sẵn trang Creem (`CreemProvider.createCheckout` gửi `customer.email`); điều khoản và tài liệu của Creem đọc ngày 2026-10-14 (Merchant of Record, tên Creem trên sao kê thẻ, biên lai gửi khách, Creem có thể hoàn tiền; pháp nhân Armitage Labs OÜ, Estonia).
 
 ## Cài vào sản phẩm
 - **Đã làm (kế hoạch `2026-10-06-dieu-khoan-trong-app.md`):** app đóng gói bốn file; bước "Điều khoản" ở onboarding (ô tick bắt buộc); thẻ "Điều khoản và quyền riêng tư" ở màn hình Giới thiệu; mục gập "Chính sách quyền riêng tư" dưới ô đồng ý email ở màn hình mua.
```

- [ ] **Step 2: Đối chiếu phiên bản trong README với văn bản**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && sed -n 3p docs/legal/eula.vi.md && sed -n 3p docs/legal/privacy.vi.md && grep -o "EULA phiên bản 1.3 và chính sách quyền riêng tư phiên bản 1.2, cùng hiệu lực từ 2026-10-14\|ngày hiệu lực: EULA 2026-10-14 (bản 1.3), chính sách quyền riêng tư 2026-10-14 (bản 1.2)" docs/legal/README.md`
Expected: `**Phiên bản 1.3, hiệu lực từ 14/10/2026.**`; `**Phiên bản 1.2, hiệu lực từ 14/10/2026.**`; rồi hai cụm của README: `EULA phiên bản 1.3 và chính sách quyền riêng tư phiên bản 1.2, cùng hiệu lực từ 2026-10-14` và `ngày hiệu lực: EULA 2026-10-14 (bản 1.3), chính sách quyền riêng tư 2026-10-14 (bản 1.2)`.

- [ ] **Step 3: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- docs/legal docs/release website/src/content/legal.mjs | wc -l`
Expected: `6`.

---

### Task 5: Runbook, mục 9 (thanh toán thẻ quốc tế bằng Creem)

> **Lịch sử; đã thay bằng** runbook `docs/release/phat-hanh.md` mục 9 hiện hành và spec 2026-10-14 §4.6, §11 (hardening 2026-10-15/16): cảnh báo `provider_auth_failed` nay là `payos_auth_failed` và `creem_auth_failed`; spike thêm S10 đến S14.

**Files:**
- Modify: `docs/release/phat-hanh.md`
- Test: `server/test/node/wrangler-config.test.mjs`

Mục 9 theo mẫu mục 8: lý do của thứ tự (tài khoản, spike, sản phẩm, webhook, secret, Worker API, Worker admin liền nhau, nghiệm thu bằng đơn thật, cron và WAF, app, website), mười hai bước có lệnh và Expected, và đường lui (đã có đơn Creem thật thì không `wrangler rollback`). Các lệnh là **hướng dẫn cho chủ dự án**: agent không chạy chúng. Bước 2 là spike S1 đến S7 của spec §11 bằng `curl` ở test mode; bước 9 là nghiệm thu bằng một đơn thật 3,99 USD rồi hoàn tiền. Mục 4 thêm hai ghi chú: dựng production từ đầu thì phải đặt cả `CREEM_API_KEY` và `CREEM_WEBHOOK_SECRET` (Worker API) và `CREEM_API_KEY` (Worker admin).

- [ ] **Step 1: Viết test**

Test đòi runbook nêu mọi tên trong `secrets.required` của hai Worker:

**Sửa `server/test/node/wrangler-config.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/server/test/node/wrangler-config.test.mjs
+++ b/server/test/node/wrangler-config.test.mjs
@@ -90,6 +90,12 @@
   for (const name of admin.secrets.required) assert.equal(name in admin.vars, false, name);
 });
 
+test("runbook docs/release/phat-hanh.md nêu mọi secret bắt buộc của hai Worker (thiếu secret thì wrangler deploy từ chối)", () => {
+  const runbook = readFileSync(new URL("../../../docs/release/phat-hanh.md", import.meta.url), "utf8");
+  const missing = [...new Set([...api.secrets.required, ...admin.secrets.required])].filter((name) => !runbook.includes(name));
+  assert.deepEqual(missing, []);
+});
+
 test("tên miền riêng aitranslator.vn (spec 2026-10-06): route, email gửi và origin của Worker admin, tên miền của admin", () => {
   assert.deepEqual(api.routes, [{ pattern: "api.aitranslator.vn", custom_domain: true }]);
   for (const config of [api, admin]) {
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && node --test --test-name-pattern="runbook docs/release" test/node/wrangler-config.test.mjs 2>&1 | grep -E "^✖ [^f]|^\s+\+ +'|^ℹ (pass|fail)"`
Expected: FAIL một test: `runbook docs/release/phat-hanh.md nêu mọi secret bắt buộc của hai Worker (thiếu secret thì wrangler deploy từ chối)`, hai dòng `+   'CREEM_API_KEY',` và `+   'CREEM_WEBHOOK_SECRET'`; `ℹ pass 0`, `ℹ fail 1`.

- [ ] **Step 3: Sửa runbook**

**Sửa `docs/release/phat-hanh.md`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

````diff
--- a/docs/release/phat-hanh.md
+++ b/docs/release/phat-hanh.md
@@ -225,6 +225,9 @@
    Expected: mỗi lệnh kết thúc bằng `✨ Success! Uploaded secret <TÊN>`. `OPERATOR_EMAIL` không bắt buộc; thiếu thì cảnh báo
    chỉ nằm trong log.
 
+   Từ đợt Creem, `secrets.required` còn có `CREEM_API_KEY` và `CREEM_WEBHOOK_SECRET`: dựng production từ đầu thì đặt cả hai ở đây
+   (cách lấy ở mục 9, bước 4 và 5), nếu không `wrangler deploy` ở bước 9 từ chối.
+
 6. **Hai khóa ký token** (khóa riêng đi thẳng vào secret, không ra terminal, không ra file; nếu đã có CI thì tạo trong một job
    CI chạy tay thay vì trên máy dev, Q11). `<năm>` và `<tháng>` là hôm nay, ví dụ `prod-2026-10-1`; số thứ tự là số kế tiếp
    chưa từng dùng (script từ chối `kid` không đúng dạng `prod-<năm>-<tháng>-<n>` hay đã có trong `keys/public-keys.json`):
@@ -267,7 +270,8 @@
    `ADMIN_EMAILS`: email đăng nhập Access của người vận hành, nhiều email thì cách nhau bằng dấu phẩy. Thiếu thì Worker admin
    trả 403 cho mọi request (log `admin_denied` lý do `admins_unset`), kể cả khi đã qua Access.
 
-   Expected: như bước 5, với Worker `mt-license-admin`.
+   Expected: như bước 5, với Worker `mt-license-admin`. Từ đợt Creem Worker admin còn có secret `CREEM_API_KEY` (cùng khóa với
+   Worker API, mục 9 bước 5; `secrets.required` của `wrangler.admin.jsonc` đòi nó).
 
 9. **Deploy Worker API trước** (Worker admin có service binding tới nó):
 
@@ -507,3 +511,118 @@
 9. **Thử tay:** mua một đơn 6 Months thật bằng PayOS và kiểm app tự kích hoạt (hạn mới = lúc trả tiền + 180 ngày, hạn mức "100 giờ mỗi 30 ngày"); đổi gói từ Monthly sang 6 Months và xem số ngày quy đổi; một máy chạy bản app cũ vẫn thấy ba thẻ; dùng "Cấp license mới…" ở Web Admin cấp một license 6 Months cho email của chính chủ dự án rồi kích hoạt bằng key nhận được (đây là đường duy nhất qua bảng gói của Worker admin mà các bước trên chưa chạm tới), sau đó thu hồi license thử ở trang License nếu không giữ.
 
 **Đường lui.** Quay về phiên bản trước bằng `pnpm exec wrangler rollback` (Worker API) và `pnpm exec wrangler rollback -c wrangler.admin.jsonc` (Worker admin): **lùi cả hai**, vì chỉ lùi một Worker thì ba thao tác cấp license của Web Admin trả `503` (hai bản kiểm bảng gói khác nhau). Schema mới tương thích với code cũ. Nhưng nếu đã có đơn hay license `six_months` thì Worker cũ **không đọc được** chúng (bảng `PLANS` cũ không có gói đó): chỉ lùi khi chưa có khách mua gói mới, còn không thì sửa tiến. Migration 0003 không có bước lùi vì nó chỉ nới CHECK và không đổi dữ liệu; nếu dữ liệu bị hỏng thì khôi phục bằng Time Travel (`pnpm exec wrangler d1 time-travel restore mt-license-production --bookmark=<mốc chụp ngay trước bước 3>`; mất mọi ghi sau mốc đó, nên hỏi chủ dự án trước).
+
+
+## 9. Đợt thêm thanh toán thẻ quốc tế bằng Creem (không có migration)
+
+Spec `2026-10-14-creem-international-payment-design.md` (mục 7, 9 và 11), nghiên cứu `2026-10-14-international-payment-provider-research.md`, kế hoạch `2026-10-14-creem-01-server.md` đến `2026-10-14-creem-05-legal-ops.md`. **Mỗi bước chỉ làm khi chủ dự án cho phép**; thao tác ở dashboard Creem và mọi lệnh ghi vào production do chủ dự án làm. Chạy trong `server/`; `PROD` và `PADMIN` như mục 4. **Không có migration D1** (cột `orders.provider` và `currency` không có CHECK) và **không có môi trường thử**: Worker chỉ nối Creem production (`CREEM_BASE_URL` là `https://api.creem.io`, test Node chặn `test-api.creem.io`); sandbox của Creem chỉ dùng ở bước 2, bằng `curl`.
+
+**Khóa Creem là bí mật.** Repo này công khai: không dán khóa vào chat, vào file trong repo hay vào lệnh có thể ở lại trong lịch sử shell. Nhập bằng `read -rs` hay thẳng vào `wrangler secret put`.
+
+Thứ tự không đổi được: tài khoản, spike, sản phẩm, webhook, secret, Worker API, Worker admin, nghiệm thu bằng đơn thật, cron và WAF, app, website. Vì sao:
+
+- `secrets.required` của hai file wrangler có `CREEM_API_KEY` (và `CREEM_WEBHOOK_SECRET` ở Worker API): thiếu secret thì `wrangler deploy` từ chối. Nên làm bước 1 đến 6 trước khi deploy.
+- Creem chỉ bật khi **cả** `CREEM_PRODUCT_IDS` (đủ ba mã `prod_…`), `CREEM_API_KEY` và `CREEM_WEBHOOK_SECRET` có. Thiếu một thứ thì Worker coi như Creem chưa bật: `GET /v1/plans` không trả giá USD, `POST /v1/checkout` với `currency: "USD"` trả `503`, `/v1/webhooks/creem` trả `404`, và app không hiện lựa chọn cách trả.
+- Server mới chạy an toàn với app cũ (app đến 0.1.9 không gửi `currency` nên chỉ đi PayOS, vẫn nhận mã VietQR) và app mới chạy được với server cũ (không có giá USD thì không có lựa chọn cách trả). Vẫn **đưa app sau server** và sau nghiệm thu, để người dùng chỉ thấy lựa chọn khi nó chạy thật.
+- Website và văn bản pháp lý sau cùng: trang nói "có thẻ quốc tế" khi chưa có là lời hứa sai.
+- **Hai Worker lên liền nhau** (bước 7 rồi bước 8): cả hai cùng đọc `PLANS` (có giá USD) và cổng Creem. Trong khoảng giữa hai bước đừng dùng thao tác cấp license và xem đơn Creem ở Web Admin.
+
+1. **Tài khoản Creem** (chủ dự án; agent không đăng ký thay). Đăng ký ở creem.io, làm KYC cá nhân (tên thụ hưởng của tài khoản ngân hàng phải khớp tên KYC), thêm tài khoản ngân hàng nhận chi trả (VND), chờ Creem duyệt (1 đến 2 ngày làm việc, tối đa 3). Creem xét website: có Chính sách quyền riêng tư và Điều khoản, giá hiển thị, email hỗ trợ khớp (`aitranslator.vn` có đủ); Creem có thể mua thử bằng mã giảm giá 100%. Creem chi trả theo tiền tệ của tài khoản ngân hàng; khác tiền tệ bán (USD) thì ngân hàng nhận tự quy đổi và thu phí (đo ở lần rút đầu, điểm S8 của spec).
+
+2. **Spike ở test mode** (S1 đến S7 của spec mục 11), trước khi deploy. Bật **Test Mode** ở dashboard (nút ở cuối thanh bên trái), vào Developers, chép **khóa test** vào một file chỉ mình đọc được (không dán vào chat, không để trong repo). Tạo một sản phẩm thử: loại một lần, USD, 3,99, **Tax mode: exclusive**; chép mã `prod_…` của nó.
+
+   ```bash
+   umask 077; printf 'Khóa test của Creem: '; read -rs K; echo; printf 'CREEM_TEST_KEY=%s\n' "$K" > "$HOME/.creem-test.env"; unset K
+   . "$HOME/.creem-test.env"
+   TP=prod_...   # mã sản phẩm thử vừa tạo
+   curl -s -X POST https://test-api.creem.io/v1/checkouts -H "x-api-key: $CREEM_TEST_KEY" -H 'content-type: application/json' \
+     -d "{\"product_id\":\"$TP\",\"request_id\":\"9000001\",\"custom_price\":399,\"success_url\":\"https://api.aitranslator.vn/v1/pay/return\",\"customer\":{\"email\":\"<email của bạn>\"},\"metadata\":{\"order_code\":\"9000001\",\"plan\":\"monthly\"}}" | tee "$TMPDIR/creem-checkout.json"; echo
+   ```
+
+   Expected (S2): JSON có `id` (`ch_…`), `status` `pending`, `checkout_url` (trang `checkout.creem.io`), `request_id` `9000001`; không lỗi vì `custom_price` (399 cent, thấp hơn mọi giá catalog). Mở `checkout_url`, ghi lại: có ô mã giảm giá không (S7). Trả bằng thẻ thử `4111 1111 1111 1111` (ngày hết hạn bất kỳ ở tương lai, CVV bất kỳ), rồi:
+
+   ```bash
+   CID=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).id' "$TMPDIR/creem-checkout.json")
+   curl -s "https://test-api.creem.io/v1/checkouts?checkout_id=$CID" -H "x-api-key: $CREEM_TEST_KEY" | node -e 'console.log(JSON.stringify(JSON.parse(require("fs").readFileSync(0, "utf8")), null, 1))'
+   ```
+
+   Expected: `status` `completed`, `request_id` `9000001` (S3), và `order` có `amount` 399 (giá niêm yết trước thuế), `amount_paid` bằng `amount` hay lớn hơn (gồm thuế; ở test mode thuế có thể bằng 0), `currency` `USD`, `status` `paid` (S1). Hoàn tiền đơn thử ở dashboard (Test Mode), chờ vài giây, chạy lại lệnh `GET`: `order.status` đổi (S4: ghi lại giá trị thật, `refunded` hay `partially_refunded`). Nếu muốn xem payload webhook thật (S4, S5), tạo endpoint thử ở Developers (Test Mode) trỏ tới một trang hứng webhook tạm (ví dụ webhook.site; chỉ dữ liệu thử, xóa endpoint sau khi xem) và đọc `refund.created` (có `checkout.id` và số tiền hoàn không), độ trễ từ lúc trả tiền tới sự kiện `checkout.completed`. Kết quả nào khác giả định thì làm theo cột "Nếu khác" của bảng ở spec mục 11 **trước khi deploy**. Xong thì xóa khóa thử: `rm "$HOME/.creem-test.env"`.
+
+3. **Ba sản phẩm production** (tắt Test Mode). Products > tạo ba sản phẩm: loại **một lần**, tiền tệ **USD**, **Tax mode: exclusive** (khách trả giá niêm yết cộng thuế; **không** bật `business_net_pricing`), danh mục thuế SaaS, tên `AI Translator Monthly (30 days)`, `AI Translator 6 Months (180 days)`, `AI Translator Yearly (365 days)`, giá catalog 3,99, 21,99 và 39,99 USD (server gửi `custom_price` theo `PLANS` nên giá thật nằm ở server; giá catalog chỉ để khớp). Chép mã `prod_…` của từng sản phẩm vào `CREEM_PRODUCT_IDS` trong `wrangler.jsonc` (mã sản phẩm chỉ là định danh, không phải bí mật), rồi:
+
+   ```bash
+   pnpm check
+   ```
+
+   Expected: `pnpm check` đạt (test `wrangler-config` đòi `CREEM_PRODUCT_IDS` có đúng ba khóa `monthly`, `six_months`, `yearly`, mỗi giá trị rỗng hay `prod_…`).
+
+4. **Webhook** ở dashboard (Test Mode tắt): Developers > Webhooks > thêm endpoint `https://api.aitranslator.vn/v1/webhooks/creem`, chỉ bật ba sự kiện `checkout.completed`, `refund.created`, `dispute.created`. Chép **secret ký** của endpoint (hiện khi tạo, xem lại được ở dashboard). Đừng bật sự kiện nào khác: server trả `200` và bỏ qua, nhưng không cần.
+
+5. **Secret** (khóa **production** của Creem, ở Developers khi Test Mode tắt; không phải khóa test). Mỗi lệnh hỏi giá trị, không hiện ra màn hình:
+
+   ```bash
+   pnpm exec wrangler secret put CREEM_API_KEY
+   pnpm exec wrangler secret put CREEM_WEBHOOK_SECRET
+   pnpm exec wrangler secret put CREEM_API_KEY -c wrangler.admin.jsonc
+   ```
+
+   Expected: ba dòng `✨ Success! Uploaded secret …` (hai Worker dùng cùng khóa API; Worker admin chỉ hỏi trạng thái phiên nên không cần secret webhook).
+
+6. **Kiểm cấu hình trước khi deploy:**
+
+   ```bash
+   pnpm exec wrangler deploy --dry-run
+   ```
+
+   Expected: `--dry-run: exiting now.`; bảng binding có `env.CREEM_BASE_URL ("https://api.creem.io")` và `env.CREEM_PRODUCT_IDS` với ba mã `prod_…`.
+
+7. **Deploy Worker API**, rồi làm ngay bước 8:
+
+   ```bash
+   pnpm check && pnpm exec wrangler deploy
+   curl -s "$PROD/v1/health"; echo
+   curl -s "$PROD/v1/plans?plans=monthly,six_months,yearly" | node -e 'const d = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log(d.suggested_currency, JSON.stringify(d.plans.map((p) => [p.code, p.prices])))'
+   curl -s "$PROD/v1/plans" | node -e 'const d = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log(JSON.stringify(d.plans.map((p) => p.code)))'
+   ```
+
+   Expected: như mục 4 bước 9 (`Uploaded mt-license`, `schedule: */5 * * * *`, `{"ok":true}`). Lệnh `plans` thứ nhất in `VND [["monthly",{"VND":50000,"USD":399}],["six_months",{"VND":269000,"USD":2199}],["yearly",{"VND":500000,"USD":3999}]]` (`VND` vì máy bạn ở Việt Nam; máy ở nước khác in `USD`). Lệnh thứ hai (không `?plans=`, như app cũ gọi) in `["monthly","yearly"]`: app cũ vẫn chỉ thấy hai gói và chỉ đọc giá VND. Có `USD` ở giá mà `GET /v1/plans` không hiện thì Creem chưa bật: kiểm lại ba thứ ở đầu mục này.
+
+8. **Deploy Worker admin** (ngay sau bước 7):
+
+   ```bash
+   pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
+   curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/admin/whoami"
+   ```
+
+   Expected: như mục 4 bước 10 (khi chưa đăng nhập Access thì không phải `5xx`). Đăng nhập Web Admin: Tổng quan và trang Đơn mở được như cũ; nút VND | USD chỉ hiện khi đã có đơn USD đã thu tiền.
+
+9. **Nghiệm thu bằng một đơn thật 3,99 USD** (chủ dự án trả bằng thẻ của mình; phí khoảng 0,6 USD). Tạo đơn bằng `curl` như app mới sẽ làm:
+
+   ```bash
+   printf 'Email nhận key: '; read -r EM
+   RESP=$(curl -s -X POST "$PROD/v1/checkout" -H 'content-type: application/json' -d "{\"plan\":\"monthly\",\"email\":\"$EM\",\"consent\":true,\"currency\":\"USD\"}")
+   node -e 'const r = JSON.parse(process.argv[1]); console.log(JSON.stringify({ order_code: r.order_code, provider: r.provider, amount: r.amount, currency: r.currency, qr_code: r.qr_code, host: new URL(r.checkout_url).host, minutes: Math.round((r.expires_at - Date.now() / 1000) / 60) }))' "$RESP"
+   node -p 'JSON.parse(process.argv[1]).checkout_url' "$RESP"
+   ```
+
+   Expected: `{"order_code":<số>,"provider":"creem","amount":399,"currency":"USD","qr_code":null,"host":"checkout.creem.io","minutes":30}` (29 hay 30), rồi địa chỉ `https://checkout.creem.io/…`. Mở địa chỉ đó, trả 3,99 USD (trang cộng thuế nếu nước bạn có thu), rồi:
+
+   ```bash
+   CODE=$(node -p 'JSON.parse(process.argv[1]).order_code' "$RESP"); TOK=$(node -p 'JSON.parse(process.argv[1]).order_token' "$RESP")
+   curl -s "$PROD/v1/orders/$CODE" -H "authorization: Bearer $TOK" | node -e 'const d = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log(JSON.stringify({ status: d.status, amount: d.amount, currency: d.currency, license_plan: d.license_plan, has_key: Boolean(d.license_key) }))'
+   ```
+
+   Expected: vài giây sau khi trả: `{"status":"paid","amount":399,"currency":"USD","license_plan":"monthly","has_key":true}`; thư chứa key tới `$EM` (từ `no-reply@mail.aitranslator.vn`); Web Admin > Đơn hiện đơn này với `$3.99` và cổng Creem; `pnpm exec wrangler tail mt-license --format pretty` không có `webhook_bad_signature`. Chưa `paid` sau vài phút thì cron đối soát (mỗi 5 phút) sẽ cấp; đơn vẫn `pending` sau mười phút nghĩa là webhook và đối soát đều không chạm được Creem: xem `provider_auth_failed` (khóa API sai) và bước 10.
+
+   Rồi **hoàn tiền đơn này ở dashboard Creem** (Transactions, hoàn đủ). Expected: vài giây đến vài phút sau `GET /v1/orders/$CODE` báo `"status":"refunded"`, Web Admin hiện đơn `refunded` kèm thẻ cảnh báo (license còn hoạt động, spec D5), và trong khoảng một giờ có thư cảnh báo `order_refunded` tới `ops@`. License của đơn thử vẫn dùng được: thu hồi nó ở trang License của Web Admin nếu không giữ.
+
+10. **Kiểm cron và luật WAF.** Cron: như mục 4 bước 9 (`wrangler tail mt-license`, một sự kiện `*/5 * * * *` có `{"event":"reconcile",…}`; không thấy thì `pnpm exec wrangler triggers deploy`). Webhook của Creem không có IP cố định nên không allowlist theo IP được: luật WAF `webhook-rate-limit` (5 request mỗi 10 giây mỗi IP, đường dẫn `/v1/webhooks/`) áp cho cả Creem; sau đơn ở bước 9 xem Cloudflare > Security > Events xem có request tới `/v1/webhooks/creem` bị chặn (429) không, và nới luật riêng cho `/v1/webhooks/creem` nếu có. Kiểm **Bot Fight Mode** của zone `aitranslator.vn` (Security > Bots): Creem ghi rõ nó có thể chặn webhook và **không bỏ qua được bằng luật tùy chỉnh**; thấy webhook Creem bị chặn thì cân nhắc tắt Bot Fight Mode cho zone. Dù webhook bị chặn, cron đối soát vẫn cấp license trong vài phút (đơn pending được hỏi lại bằng API mỗi 4 phút trong giờ đầu); webhook chỉ làm việc đó nhanh hơn.
+
+11. **Phát hành app, rồi website và pháp lý.** App theo mục 2 (nâng phiên bản ở đó). Văn bản pháp lý nằm **trong app** (`docs/legal/*.md` được đóng gói): bản app có Creem là bản mang EULA 1.3 và chính sách 1.2; người đã đồng ý EULA cũ không bị hỏi lại (chưa có cơ chế). Sau khi bản app đã đăng lên R2 (kiểm R2 ở mục 2): nếu ngày deploy thật khác 2026-10-14 thì sửa ngày hiệu lực trước (`docs/legal/eula.vi.md`, `eula.en.md`, `privacy.vi.md`, `privacy.en.md`, `docs/legal/README.md`, và `modified` của `website/src/content/{vi,en}/{terms,privacy}.mjs`), chụp lại ảnh `app-upgrade*.webp` nếu giao diện Nâng cấp còn đổi (`website/README.md`), rồi `cd website && pnpm deploy`.
+
+12. **Chi trả, theo dõi, hỗ trợ khách.**
+    - **Chi trả:** rút gộp tới khoảng 700 USD mỗi lần (phí rút 7 USD hoặc 1%, lấy mức cao hơn), chỉ rút được vào ngày 1 và 15, tối thiểu 50 USD, tiền mới bán chờ 7 đến 12 ngày mới rút được (S9). Giữ số dư ở Creem thấp: điều khoản 10.5 cho Creem giữ, trì hoãn hay đóng băng chi trả. Phí quy đổi VND và phí ngân hàng nhận do ta chịu (điều khoản 10.7): ghi lại số thật ở **lần rút đầu tiên** (S8). Creem lập "hóa đơn ngược" (self-billed invoice) cho mỗi lần rút: đưa kế toán.
+    - **Theo dõi:** email cảnh báo mới về `ops@`: `order_refunded`, `order_partially_refunded`, `order_disputed` (chargeback; Creem tính phí 25 USD mỗi vụ, người bán chịu), `provider_auth_failed` (khóa Creem bị từ chối: đơn USD mới lỗi `502` cho tới khi thay khóa: `wrangler secret put CREEM_API_KEY` cho cả hai Worker), `webhook_bad_signature`. Xem đơn Creem ở Web Admin (nút VND | USD). Kiểm cron sau **mỗi** lần deploy (sự cố cron 2026-10-07).
+    - **Hỗ trợ khách:** trả lời yêu cầu của khách Creem trong 3 ngày làm việc (không thì Creem có thể hoàn tiền thay). Hoàn tiền chỉ làm trong dashboard Creem; webhook `refund.created` ghi đơn `refunded` và cảnh báo, còn license thì ta thu hồi tay nếu cần (spec D5). Biên lai là của Creem, gửi tới email khách nhập; ta chưa xuất hóa đơn điện tử.
+
+**Đường lui.** Chưa có đơn Creem thật: `pnpm exec wrangler rollback` (Worker API) và `pnpm exec wrangler rollback -c wrangler.admin.jsonc` (Worker admin), **lùi cả hai**. **Đã có đơn Creem thật thì không lùi Worker**: Worker cũ không có cổng `creem` (webhook `404`, đơn pending không được cấp, Worker admin không đọc được đơn USD); có lỗi thì sửa tiến. Tắt bán thẻ khẩn cấp không cần lùi: đặt ba mã trong `CREEM_PRODUCT_IDS` về chuỗi rỗng rồi deploy lại Worker API: app thôi hiện lựa chọn cách trả, server thôi nhận đơn USD; đơn Creem đang chờ cấp tay ở Web Admin (Worker admin vẫn có cổng Creem chỉ đọc). Hủy webhook ở dashboard Creem là bước riêng, chỉ khi cần.
````

- [ ] **Step 4: Chạy test (xanh) và kiểm khối mã của runbook**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm test:scripts 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 22`, `ℹ pass 21`, `ℹ fail 0`, `ℹ skipped 1`.

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && python3 -c "print(open('docs/release/phat-hanh.md', encoding='utf-8').read().count(chr(96) * 3) % 2)" && grep -n '^## ' docs/release/phat-hanh.md | tail -3`
Expected: `0` (số rào khối mã chẵn: mọi khối mã đều có rào đóng); rồi ba dòng cuối là `## 7. Bản Windows chưa ký …`, `## 8. Đợt thêm gói 6 Months (migration D1 0003)`, `## 9. Đợt thêm thanh toán thẻ quốc tế bằng Creem (không có migration)`.

- [ ] **Step 5: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- docs/legal docs/release website/src/content/legal.mjs | wc -l`
Expected: `7`.

---

### Task 6: Kiểm tra toàn bộ phần pháp lý và vận hành

**Files:** không sửa file nào.

- [ ] **Step 1: Chạy mọi bộ test liên quan và dựng giao diện**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 94`, `ℹ pass 92`, `ℹ fail 0`, `ℹ skipped 2`.

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/server && pnpm test:scripts 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 22`, `ℹ pass 21`, `ℹ fail 0`, `ℹ skipped 1`.

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/lib/legal.test.ts src/lib/markdown.test.ts 2>&1 | grep -E "Test Files|Tests " && pnpm build 2>&1 | tail -1`
Expected: `Test Files  2 passed (2)`, `Tests  19 passed (19)`; rồi `✓ built in …ms`. (App đóng gói bốn file `docs/legal/*.md` bằng `import.meta.glob`, nên bản dựng này là bằng chứng hai file mới vẫn đóng gói được.)

- [ ] **Step 2: Xem văn bản pháp lý trong app (bước Điều khoản ở onboarding)**

Bảng gói của EULA nay có chữ dài hơn ("50.000 đ hoặc 3,99 USD") và có thêm một gạch đầu dòng: kiểm khung EULA trong app vẫn đọc được ở hai cỡ cửa sổ (960×640 và 720×480) và không làm trang cuộn ngang. Tạo script kiểm trong thư mục tạm (không vào repo):

**`legal-in-app-check.mjs`:**

```js
// Xem văn bản pháp lý trong app (bước Điều khoản ở onboarding): mở khung EULA, cuộn tới bảng gói và tới mục thanh toán thẻ,
// chụp ở hai cỡ cửa sổ và hai ngôn ngữ, và kiểm bảng không làm trang cuộn ngang.
// Cần trang xem trước đang chạy ở cổng 1431:  node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431
//   SHOTS_DIR=<thư mục> node legal-in-app-check.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { launch } from "/Users/dtphong/Desktop/software_business/ai-translator/website/tools/browser/cdp.mjs";

const OUT = process.env.SHOTS_DIR;
if (!OUT) throw new Error("đặt SHOTS_DIR là thư mục ghi ảnh (thư mục tạm của phiên, không phải trong repo)");
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:1431";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome (đặt CHROME=<đường dẫn>)");

const SIZES = [[960, 640], [720, 480]];
for (const lang of ["vi", "en"]) {
  for (const [width, height] of SIZES) {
    const page = await browser.newPage({ width, height, dpr: 1 });
    await page.goto(`${BASE}/?onboarding=2&lang=${lang}`);
    await page.eval(`document.querySelector("details.legal-details summary").click()`);
    await sleep(900);
    const info = await page.eval(`(() => {
      const table = document.querySelector(".legal table");
      const cell = [...document.querySelectorAll(".legal td")].find((c) => /USD|\\$3\\.99/.test(c.textContent));
      const creem = [...document.querySelectorAll(".legal li")].find((li) => li.textContent.includes("Creem"));
      return { rows: table ? table.querySelectorAll("tr").length : 0, usdCell: cell ? cell.textContent.trim() : null, creem: creem ? creem.textContent.slice(0, 60) : null,
        scrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    })()`);
    // Hai chỗ cần xem: bảng gói (có giá USD) và mục thanh toán thẻ do Creem xử lý.
    const targets = {
      "bang-goi": `document.querySelector(".legal table")`,
      creem: `[...document.querySelectorAll(".legal li")].find((li) => li.textContent.includes("Creem"))`,
    };
    for (const [name, expr] of Object.entries(targets)) {
      await page.eval(`(() => { const e = ${expr}; if (e) e.scrollIntoView({ block: "center" }); })()`);
      await sleep(200);
      const shot = await page.s.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(`${OUT}/eula-${lang}-${width}-${name}.png`, Buffer.from(shot.data, "base64"));
    }
    // Chrome tự xin /favicon.ico (trang xem trước không có): bỏ qua lỗi 404 đó.
    const errors = page.errors.filter((e) => !e.includes("status of 404"));
    console.log(`${lang} ${width}x${height}:`, JSON.stringify(info), errors.length ? `LỖI: ${errors.slice(0, 2)}` : "không lỗi");
    await page.close();
  }
}
await browser.close();
```

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && (nohup node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 > $TMPDIR/vite-legal.log 2>&1 &); sleep 4; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:1431/ && SHOTS_DIR=$TMPDIR/legal-shots node $TMPDIR/legal-in-app-check.mjs`
Expected: `200`; bốn dòng, mỗi dòng kết thúc `không lỗi` và có `"scrollsSideways":false`:
`vi 960x640: {"rows":5,"usdCell":"50.000 đ hoặc 3,99 USD","creem":"Gói trả phí là đơn trả trước (Monthly 30 ngày, 6 Months 180 ","scrollsSideways":false} không lỗi`, dòng `vi 720x480` giống hệt, và hai dòng `en` với `"usdCell":"50,000 VND or $3.99"` và `"creem":"A paid plan is an order paid in advance (Monthly 30 days, 6 "`.

Mở các ảnh PNG trong `$TMPDIR/legal-shots`: `eula-vi-720-bang-goi.png` (bảng năm hàng, cột Giá có `50.000 đ hoặc 3,99 USD` xuống dòng gọn trong ô), `eula-en-960-creem.png` (gạch đầu dòng "International card payments are processed by Creem" đọc được trong khung cuộn). Rồi dừng Vite: `kill $(lsof -nP -iTCP:1431 -sTCP:LISTEN -t); sleep 1; lsof -nP -iTCP:1431 -sTCP:LISTEN | wc -l`
Expected: `0`.

- [ ] **Step 3: Đối chiếu với spec §6, §7, §9, §11**

| Mục của spec | Task |
|---|---|
| EULA 1.3: thanh toán thẻ quốc tế (USD, Creem), Creem xử lý thanh toán và thuế, không tự gia hạn, hoàn tiền (Creem có thể hoàn), "đơn trả trước… VietQR (PayOS)" thành hai cách trả | Task 1 |
| Chính sách quyền riêng tư 1.2: Creem (Estonia) trong bảng bên xử lý; email điền sẵn trang thanh toán của Creem; số thẻ không về chúng tôi | Task 2 |
| `docs/legal/README.md`: danh sách bên xử lý, phiên bản; hỏi luật sư (hồ sơ chuyển dữ liệu ra nước ngoài nay gồm Creem), kế toán (thuế thu nhập, hóa đơn ngược) | Task 4 |
| (ngoài spec, phát hiện khi làm) trang Về chúng tôi ghi tay phiên bản đã lạc hậu từ EULA 1.2 | Task 3 |
| Runbook §7: tài khoản và KYC, ba sản phẩm, webhook và secret, WAF, chi trả, theo dõi, hỗ trợ khách | Task 5 (mục 9, bước 1, 3 đến 5, 10 đến 12) |
| Spike S1 đến S9 (§11): S1 đến S7 bằng `curl` ở test mode; S8, S9 ở lần rút đầu | Task 5 (mục 9, bước 2 và 12) |
| Triển khai §9: Worker API rồi Worker admin liền nhau, nghiệm thu bằng đơn thật rồi hoàn tiền, kiểm cron và WAF, app, website sau cùng; không `wrangler rollback` khi có đơn thật | Task 5 (mục 9, bước 7 đến 11 và đường lui) |

- [ ] **Step 4: Kiểm lần cuối cây làm việc và tiến trình nền (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short -- docs/legal docs/release website/src/content/legal.mjs | wc -l && lsof -nP -iTCP:1430 -iTCP:1431 -iTCP:4190 -sTCP:LISTEN | wc -l`
Expected: `payment`; `7`; `0`. **Dừng ở đây**: không commit, không push, không deploy; chờ chủ dự án cho phép (spec D9).

---

## Việc nối tiếp (ngoài kế hoạch này)

- **Việc của chủ dự án** (kế hoạch này không làm thay): đăng ký Creem và KYC, tài khoản ngân hàng VND, khóa test cho spike, tạo ba sản phẩm và điền `CREEM_PRODUCT_IDS`, đặt secret, rồi cho phép commit, push và deploy theo thứ tự ở runbook mục 9.
- **Hỏi luật sư và kế toán** theo `docs/legal/README.md` (cách mô tả Creem là Merchant of Record, hồ sơ chuyển dữ liệu ra nước ngoài nay gồm Creem, câu đồng ý xử lý email, thuế thu nhập và hóa đơn ngược của khoản Creem chi trả).
- **Ngày hiệu lực** của EULA 1.3 và chính sách 1.2 chỉnh lại theo ngày phát hành thật (runbook mục 9, bước 11).
- Người đã đồng ý EULA cũ **không bị hỏi lại** khi văn bản đổi phiên bản (cơ chế đó chưa có; `docs/legal/README.md`, mục "Chưa làm").
