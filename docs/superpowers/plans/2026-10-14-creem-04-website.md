# Thanh toán quốc tế bằng Creem · Kế hoạch 04: Website

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Website `aitranslator.vn` (tiếng Việt và tiếng Anh) nói đúng sự thật sau khi có thanh toán bằng thẻ quốc tế: mọi chỗ nhắc giá và cách trả nêu hai cách (VietQR bằng VND qua PayOS, thẻ quốc tế bằng USD qua Creem), giá USD ghi "chưa gồm thuế", các câu cũ "chưa có thẻ quốc tế" bị gỡ và có test chặn, ảnh màn hình Nâng cấp là giao diện mới.

**Architecture:** Giá USD nằm một chỗ (`website/src/plans.mjs`, đơn vị cent, test đối chiếu `server/wrangler.jsonc`); các thành phần dựng từ đó (thẻ gói, JSON-LD, `llms.txt`) tự lấy giá. Các trang nội dung (`website/src/content/{vi,en}/*.mjs`) sửa tay từng câu; mỗi nhóm trang có một test kiểu bảng `need` (đường dẫn → các cụm phải xuất hiện) viết trước, thấy đỏ rồi mới sửa. Ba test quét cả site giữ cho điều đó không trôi lại: câu cũ, giá USD lạ, số "nơi app kết nối". Ảnh màn hình Nâng cấp chụp lại từ trang xem trước của app (`scripts/ui-preview`).

**Tech Stack:** Node 24 (`node --test`), module nội dung `.mjs`, bộ sinh tĩnh có sẵn (`website/src/build`), Chrome không đầu qua `website/tools/browser/cdp.mjs` (xem bằng mắt), `cwebp` (ảnh). **Không thêm thư viện nào** (CLAUDE.md: mọi thư viện mới phải qua kiểm tương thích).

**Spec:** `docs/superpowers/specs/2026-10-14-creem-international-payment-design.md` (§6 ý "Website", §8 dòng Website). Kế hoạch này là phần 04 trong năm phần. **Cần phần 01 đã áp** (Task 1 đọc giá USD trong `server/wrangler.jsonc`) và **phần 03 đã áp** (Task 4 đọc chữ giao diện trong `src/i18n/{vi,en}.ts`; Task 7 chụp ảnh từ trang xem trước của app mới). Phần 02 (Web Admin) không liên quan. Văn bản pháp lý (`docs/legal/`) và runbook là phần 05; các trang Điều khoản và Chính sách quyền riêng tư của website sinh từ `docs/legal/*.md`, nên không sửa ở đây.

---

## Quy ước chung cho mọi task (đọc trước khi làm)

- Thư mục dự án: `/Users/dtphong/Desktop/software_business/ai-translator`. **Mỗi lệnh Bash bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`** (shell không giữ thư mục giữa các lệnh). Lệnh của website chạy ở `/Users/dtphong/Desktop/software_business/ai-translator/website` (dự án pnpm riêng).
- Làm **trực tiếp trên nhánh `payment`** (chủ dự án chỉ định). Trước khi bắt đầu: `git branch --show-current` phải in `payment`.
- **KHÔNG commit, KHÔNG push, KHÔNG deploy** cho tới khi chủ dự án cho phép (spec D9). Vì vậy kế hoạch này **không có bước "Commit"**: cuối mỗi task chỉ có bước kiểm danh sách file đã đổi. Website còn có thêm một lý do để chưa deploy: trang nói "có thẻ quốc tế" khi server hay app chưa có là lời hứa sai (thứ tự triển khai ở kế hoạch 05).
- **Không** dùng `git add`, `git stash`, `git checkout -- <file>`, `git clean`, `git reset`: cây làm việc có các file chưa theo dõi của việc này (spec, nghiên cứu, các kế hoạch `2026-10-14-creem-*.md`) và các thay đổi chưa commit của kế hoạch 01 đến 03, không được mất hay lẫn vào đâu. Chỗ cần "khôi phục sau khi thử" (Task 6) dùng script tự khôi phục từ bản giữ trong bộ nhớ, không dùng git.
- Nội dung website viết tiếng Việt có dấu, cùng giọng với các trang xung quanh; bản tiếng Anh viết tự nhiên (không dịch từng chữ). **Chỉ nói điều có thật** và **không công bố công nghệ lõi** (`website/README.md`; test `không lộ công nghệ lõi` chặn). PayOS, Creem, Cloudflare, Resend là đối tác dịch vụ đã và đang được nêu tên, không phải công nghệ lõi. "Armitage Labs OÜ" là pháp nhân của Creem (điều khoản của Creem, mục 2.1.5: đăng ký tại Estonia).
- Trường `modified` của các trang đã sửa đặt `2026-10-14` (ngày viết kế hoạch); thực thi ngày khác thì đặt đúng ngày sửa (test sitemap đòi ngày hợp lệ, không ở tương lai, khớp với trang).
- **Mốc trước khi bắt đầu (ở `HEAD` `064a8c8`):** `pnpm test` của `website/` cho `ℹ tests 81`, `ℹ pass 79`, `ℹ fail 0`, `ℹ skipped 2` (hai test của `install.ps1` bỏ qua khi máy không có `pwsh`). Số "Expected" ở các task là tổng sau task đó (hay số test đỏ/đạt của đúng file được chạy); lệch thì đọc lại nguyên nhân, đừng sửa số. Bước "thấy đỏ" chạy riêng `test/site.test.mjs` (dưới mười giây); bước "xanh" chạy cả `pnpm test` (khoảng một phút, vì các test trang Tải xuống chạy Chrome không đầu). Test đỏ in tên hai lần (lúc chạy và ở phần `failing tests`); Expected ghi mỗi tên một lần.
- Mã và chữ trong kế hoạch là **bản đã chạy thật** trong một bản sao tạm của repo. Chép đúng như vậy; diff dùng ngữ cảnh 3 dòng, áp được bằng cách sửa tay hay `git apply` (không cần commit). Mỗi task có bước "Viết test", "chạy thấy đỏ", "sửa", "chạy thấy xanh".
- File tạm (script kiểm bằng mắt, ảnh chụp) ghi vào thư mục tạm của phiên (ví dụ `$TMPDIR`), **không vào repo**. Tiến trình nền (Vite ở cổng 1430 ở Task 7, máy chủ xem thử ở cổng 4190 ở Task 8) phải dừng khi xong và kiểm cổng đã trống.

## Quyết định thiết kế của phần này

| # | Quyết định | Lý do |
|---|---|---|
| W1 | Giá USD là `priceUsdCents` (cent) trong `plans.mjs`; `usd(cents, lang)` định dạng: tiếng Việt `3,99 USD`, tiếng Anh `$3.99` | Cùng đơn vị với server (399, 2199, 3999); test đối chiếu với `server/wrangler.jsonc` nên đổi giá một nơi mà quên nơi kia thì đỏ |
| W2 | Mọi chỗ nêu giá USD ghi "chưa gồm thuế" (hay có câu giải thích ngay đó) | D3: sản phẩm Creem đặt `tax_mode: exclusive`, Creem cộng thuế ở trang thanh toán |
| W3 | Thẻ gói (trang chủ, Bảng giá) có thêm một dòng USD dưới giá VND, **chỉ ở gói trả phí**; JSON-LD thêm ba `Offer` USD (tổng bảy); dòng `Pricing` của `llms.txt` nêu cả hai cách trả | Các nơi này dựng từ `plans.mjs` nên không thể lệch giá |
| W4 | Gỡ các câu "chưa có thẻ quốc tế" và mục lộ trình "Bán ra nước ngoài, kèm thanh toán quốc tế"; callout "Thanh toán từ nước ngoài" đổi từ cảnh báo thành thông tin | Trang chỉ nói điều có thật; điều từng là hạn chế nay đã có |
| W5 | Chữ nút và nhãn trong hướng dẫn mua gói **trích đúng từ từ điển i18n của app**, có test đọc `src/i18n/{vi,en}.ts` | Người đọc tìm đúng chữ họ thấy trên màn hình; đổi chữ trong app mà quên hướng dẫn thì test đỏ |
| W6 | Trang Dữ liệu và bảo mật: "bốn nơi" thành "năm nơi" (thêm trang thanh toán Creem), thêm Creem (Armitage Labs OÜ, Estonia) vào bảng bên xử lý, nói rõ email được dùng để điền sẵn trang thanh toán Creem | Trang này hứa số nơi app kết nối và bên xử lý dữ liệu: thiếu Creem là sai sự thật; test giữ số nơi khớp bảng |
| W7 | Ba test quét cả site (câu cũ, giá USD lạ, số nơi kết nối) viết **sau** các sửa nội dung, kiểm bằng đột biến (sửa tạm một câu, thấy đỏ, tự khôi phục) | Chúng là lưới giữ về sau; "đỏ trước" không có nghĩa khi mã đã đúng, nên chứng minh chúng bắt được lỗi bằng đột biến |
| W8 | Ảnh màn hình Nâng cấp chụp lại bằng `scripts/ui-preview/shoot.mjs` (giao diện thật, IPC giả) và thêm cảnh đơn thẻ `app-upgrade-card` vào hướng dẫn mua gói | Giao diện app đổi (nhóm "Cách thanh toán"); README của website đòi chụp lại mỗi khi giao diện đổi |
| W9 | Không sửa Điều khoản và Chính sách quyền riêng tư ở đây | Hai trang sinh từ `docs/legal/*.md` (nguồn duy nhất): kế hoạch 05 |

## Cấu trúc file

| File | Việc |
|---|---|
| `website/src/plans.mjs` | `priceUsdCents`, `usd()` (Task 1) |
| `website/src/build/{components,schema,build}.mjs`, `website/src/assets/site.css` | dòng USD ở thẻ gói; Offer USD; dòng `Pricing` của `llms.txt`; kiểu ô bảng có `<small>` (Task 2, 3) |
| `website/src/content/{vi,en}/{pricing,home}.mjs` | Bảng giá và Trang chủ (Task 3) |
| `website/src/content/{vi,en}/{guide-license,guide,faq}.mjs` | hướng dẫn mua gói, mục lục hướng dẫn, hỏi đáp (Task 4) |
| `website/src/content/{vi,en}/{about,solutions,download,features,contact,data-security}.mjs` | các trang còn lại (Task 5) |
| `website/test/site.test.mjs` | test của từng task |
| `website/README.md` | quy tắc đổi giá và cách trả (Task 6) |
| `scripts/ui-preview/shoot.mjs`, `website/src/assets/img/app/{manifest.json,app-upgrade*.webp}` | cảnh và ảnh màn hình Nâng cấp (Task 7) |

---

### Task 0: Kiểm môi trường và ghi mốc

**Files:** không sửa file nào.

- [ ] **Step 1: Kiểm nhánh, cây làm việc và các phần đã áp**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short -- website | wc -l && grep -c '"USD"' server/wrangler.jsonc && cat src/i18n/vi.ts src/i18n/en.ts | grep -c '"upgrade.method.usd"' && command -v cwebp dwebp && ls "/Applications/Google Chrome.app" > /dev/null && echo chrome-ok`
Expected: `payment`; `0` (phần này là phần đầu tiên chạm `website/`); `3` (giá USD của ba gói trong `server/wrangler.jsonc`, nhờ kế hoạch 01); `2` (khóa i18n của kế hoạch 03 trong hai ngôn ngữ); hai đường dẫn của `cwebp` và `dwebp` (cài bằng `brew install webp` nếu thiếu; chỉ Task 7 cần); `chrome-ok`. Có file đã theo dõi trong `website/` bị sửa, hay số `3` và `2` sai, thì **dừng** và hỏi chủ dự án.

- [ ] **Step 2: Chạy bộ test mốc**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 81`, `ℹ pass 79`, `ℹ fail 0`, `ℹ skipped 2`.

---

### Task 1: Giá USD trong `plans.mjs`, đối chiếu với server

**Files:**
- Modify: `website/src/plans.mjs`
- Test: `website/test/site.test.mjs`

`plans.mjs` là nơi duy nhất website giữ giá; thẻ gói, JSON-LD và `llms.txt` dựng từ đó (Task 2). Giá USD tính bằng cent như server (spec D2: Monthly 399, 6 Months 2199, Yearly 3999; Free 0), và test đối chiếu với `prices.USD` của từng gói trong `server/wrangler.jsonc`.

- [ ] **Step 1: Viết test**

Import `usd`; thêm so khớp `priceUsdCents` vào test đối chiếu server hiện có; thêm test cho giá và định dạng:

**Sửa `website/test/site.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/test/site.test.mjs
+++ b/website/test/site.test.mjs
@@ -9,7 +9,7 @@
 import { pages, missing } from "../src/content/index.mjs";
 import { vnDate } from "../src/release.mjs";
 import { SITE } from "../src/site.mjs";
-import { PLANS, vnd } from "../src/plans.mjs";
+import { PLANS, usd, vnd } from "../src/plans.mjs";
 
 const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
 const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
@@ -186,6 +186,7 @@
   for (const code of ["monthly", "six_months", "yearly"]) {
     const web = PLANS.find((p) => p.code === code);
     assert.equal(web.priceVnd, server[code].prices.VND, `${code}: giá`);
+    assert.equal(web.priceUsdCents, server[code].prices.USD, `${code}: giá USD (cent)`);
     assert.equal(web.minutesPerCycle, server[code].quota_minutes_per_cycle, `${code}: hạn mức`);
     assert.equal(web.days, server[code].days_per_order, `${code}: số ngày`);
   }
@@ -334,6 +335,17 @@
   assert.deepEqual(PLANS.map((p) => p.days), [10, 30, 180, 365]);
 });
 
+// ---- Thanh toán quốc tế bằng Creem (spec 2026-10-14 D2, §6) ----
+
+test("giá USD của gói: bằng cent như server, Free là 0; định dạng theo ngôn ngữ", () => {
+  assert.deepEqual(PLANS.map((p) => p.priceUsdCents), [0, 399, 2199, 3999]);
+  assert.equal(usd(399, "en"), "$3.99");
+  assert.equal(usd(2199, "vi"), "21,99 USD");
+  assert.equal(usd(3999, "en"), "$39.99");
+  assert.equal(usd(0, "en"), "$0.00");
+  assert.equal(usd(3999, "vi"), "39,99 USD");
+});
+
 test("thẻ gói ở trang chủ và Bảng giá: đủ bốn thẻ theo thứ tự, đúng giá, nhãn Tiết kiệm nhất chỉ ở Yearly", () => {
   const errors = [];
   for (const [urlPath, lang] of [["/", "vi"], ["/bang-gia/", "vi"], ["/en/", "en"], ["/en/pricing/", "en"]]) {
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/site.test.mjs 2>&1 | grep -E "SyntaxError|^ℹ (tests|fail)"`
Expected: FAIL (file test không nạp được): `SyntaxError: The requested module '../src/plans.mjs' does not provide an export named 'usd'`, `ℹ tests 1`, `ℹ fail 1`.

- [ ] **Step 3: Thêm giá USD và `usd()`**

**Sửa `website/src/plans.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/plans.mjs
+++ b/website/src/plans.mjs
@@ -1,12 +1,14 @@
 // Gói Free dùng thử và ba gói trả phí (spec 2026-10-07-three-plans-single-device-design.md; six_months thêm ở spec
-// 2026-10-13-six-months-plan-design.md). Giá và hạn mức PHẢI khớp server/wrangler.jsonc;
-// test/site.test.mjs đối chiếu hai nơi nên đổi giá ở server mà quên website sẽ làm test đỏ.
+// 2026-10-13-six-months-plan-design.md; giá USD ở spec 2026-10-14-creem-international-payment-design.md D2). Giá VND, giá USD
+// (đơn vị cent, chưa gồm thuế) và hạn mức PHẢI khớp server/wrangler.jsonc; test/site.test.mjs đối chiếu hai nơi nên đổi giá
+// ở server mà quên website sẽ làm test đỏ.
 export const PLANS = [
   {
     code: "free",
     nameVi: "Free",
     nameEn: "Free",
     priceVnd: 0,
+    priceUsdCents: 0,
     minutesPerCycle: null,
     minutesPerDay: 30,
     days: 10,
@@ -18,6 +20,7 @@
     nameVi: "Monthly",
     nameEn: "Monthly",
     priceVnd: 50000,
+    priceUsdCents: 399,
     minutesPerCycle: 3000,
     days: 30,
     summaryVi: "50 giờ dịch mỗi 30 ngày, đầy đủ tính năng Pro.",
@@ -28,6 +31,7 @@
     nameVi: "6 Months",
     nameEn: "6 Months",
     priceVnd: 269000,
+    priceUsdCents: 2199,
     minutesPerCycle: 6000,
     days: 180,
     summaryVi: "100 giờ dịch mỗi 30 ngày trong 180 ngày, đầy đủ tính năng Pro.",
@@ -38,6 +42,7 @@
     nameVi: "Yearly",
     nameEn: "Yearly",
     priceVnd: 500000,
+    priceUsdCents: 3999,
     minutesPerCycle: null,
     days: 365,
     summaryVi: "Không giới hạn thời lượng dịch trong 365 ngày, đầy đủ tính năng Pro.",
@@ -47,3 +52,9 @@
 
 export const vnd = (n, lang = "vi") =>
   n === 0 ? "0 ₫" : new Intl.NumberFormat(lang === "vi" ? "vi-VN" : "en-US").format(n) + " ₫";
+
+/** Giá USD từ số cent, chưa gồm thuế: tiếng Việt "3,99 USD", tiếng Anh "$3.99". */
+export const usd = (cents, lang = "vi") => {
+  const n = (cents / 100).toFixed(2);
+  return lang === "vi" ? `${n.replace(".", ",")} USD` : `$${n}`;
+};
```

- [ ] **Step 4: Chạy toàn bộ test (xanh)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 82`, `ℹ pass 80`, `ℹ fail 0`, `ℹ skipped 2`.

- [ ] **Step 5: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- website | wc -l`
Expected: `2`.

---

### Task 2: Thẻ gói, JSON-LD và `llms.txt` nêu giá USD

**Files:**
- Modify: `website/src/build/components.mjs` (`plansGrid`), `website/src/assets/site.css`, `website/src/build/schema.mjs`, `website/src/build/build.mjs` (`keyFacts()`)
- Test: `website/test/site.test.mjs`

Ba chỗ dựng giá từ `plans.mjs`: (1) bốn thẻ gói ở trang chủ và Bảng giá (hai ngôn ngữ): gói trả phí thêm một dòng "hoặc 3,99 USD bằng thẻ quốc tế" / "or $3.99 by international card" dưới giá VND, gói Free không có; (2) JSON-LD của trang giá: ba `Offer` USD riêng loại tiền, tổng bảy; (3) dòng `Pricing` của `llms.txt`: bỏ câu cũ "payment only from Vietnamese bank accounts", nêu cả hai cách trả và giá USD (chưa gồm thuế).

- [ ] **Step 1: Viết test**

Ba test: dòng USD ở thẻ gói (bốn trang), bảy `Offer` trong JSON-LD (hai test cũ được mở rộng), và dòng `Pricing` của `llms.txt`:

**Sửa `website/test/site.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/test/site.test.mjs
+++ b/website/test/site.test.mjs
@@ -369,28 +369,52 @@
   assert.deepEqual(errors, []);
 });
 
-test("JSON-LD của trang giá liệt kê đủ bốn Offer, kể cả 6 Months 269000 ₫ trong 180 ngày", () => {
+test("thẻ gói ở trang chủ và Bảng giá: gói trả phí ghi thêm giá USD bằng thẻ quốc tế, gói Free thì không", () => {
+  const errors = [];
+  for (const [urlPath, lang] of [["/", "vi"], ["/bang-gia/", "vi"], ["/en/", "en"], ["/en/pricing/", "en"]]) {
+    const html = htmlByPath.get(urlPath);
+    const start = html.indexOf('<div class="plans">');
+    const block = html.slice(start, html.indexOf('<p class="disclaimer">', start));
+    const lines = [...block.matchAll(/<p class="usd">([^<]*)<\/p>/g)].map((m) => m[1].replaceAll("&nbsp;", " "));
+    const want = PLANS.filter((p) => p.priceUsdCents > 0).map((p) =>
+      lang === "en" ? `or ${usd(p.priceUsdCents, "en")} by international card` : `hoặc ${usd(p.priceUsdCents, "vi")} bằng thẻ quốc tế`,
+    );
+    if (JSON.stringify(lines) !== JSON.stringify(want)) errors.push(`${urlPath}: dòng giá USD: ${lines.join(" | ")}`);
+  }
+  assert.deepEqual(errors, []);
+});
+
+test("JSON-LD của trang giá liệt kê đủ Offer: bốn Offer VND (kể cả 6 Months 269000 ₫ trong 180 ngày) và ba Offer USD", () => {
   const errors = [];
   for (const urlPath of ["/bang-gia/", "/en/pricing/"]) {
     const html = htmlByPath.get(urlPath);
     const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
     const app = data["@graph"].find((n) => n["@type"] === "SoftwareApplication");
     const offers = app?.offers ?? [];
-    const six = offers.find((o) => /6 Months/.test(o.name));
-    if (offers.length !== 4) errors.push(`${urlPath}: ${offers.length} Offer (cần 4)`);
-    if (!six || six.price !== "269000" || six.priceCurrency !== "VND" || six.eligibleDuration?.value !== 180) {
-      errors.push(`${urlPath}: Offer 6 Months sai: ${JSON.stringify(six)}`);
-    }
-  }
-  assert.deepEqual(errors, []);
-});
-
-test("llms.txt nêu giá cả ba gói trả phí, lấy từ plans.mjs", async () => {
+    const inVnd = offers.filter((o) => o.priceCurrency === "VND");
+    const inUsd = offers.filter((o) => o.priceCurrency === "USD");
+    const six = inVnd.find((o) => /6 Months/.test(o.name));
+    const sixUsd = inUsd.find((o) => /6 Months/.test(o.name));
+    if (inVnd.length !== 4) errors.push(`${urlPath}: ${inVnd.length} Offer VND (cần 4)`);
+    if (!six || six.price !== "269000" || six.eligibleDuration?.value !== 180) errors.push(`${urlPath}: Offer 6 Months sai: ${JSON.stringify(six)}`);
+    if (JSON.stringify(inUsd.map((o) => o.price)) !== JSON.stringify(["3.99", "21.99", "39.99"])) {
+      errors.push(`${urlPath}: giá Offer USD ${inUsd.map((o) => o.price).join(", ")} (cần 3.99, 21.99, 39.99)`);
+    }
+    if (!sixUsd || sixUsd.eligibleDuration?.value !== 180) errors.push(`${urlPath}: Offer USD 6 Months sai: ${JSON.stringify(sixUsd)}`);
+    if (offers.length !== 7) errors.push(`${urlPath}: ${offers.length} Offer (cần 7)`);
+  }
+  assert.deepEqual(errors, []);
+});
+
+test("llms.txt nêu giá cả ba gói trả phí (VND và USD), lấy từ plans.mjs, và hai cách trả", async () => {
   const llms = await readFile(path.join(DIST, "llms.txt"), "utf8");
   const line = llms.split("\n").find((l) => l.startsWith("- Pricing:")) ?? "";
   for (const p of PLANS.filter((x) => x.priceVnd > 0)) {
     assert.ok(line.includes(`${p.nameEn} ${vnd(p.priceVnd)}`), `llms.txt: thiếu "${p.nameEn} ${vnd(p.priceVnd)}" trong: ${line}`);
-  }
+    assert.ok(line.includes(usd(p.priceUsdCents, "en")), `llms.txt: thiếu ${usd(p.priceUsdCents, "en")} trong: ${line}`);
+  }
+  assert.ok(/VietQR/.test(line) && /international card/.test(line), `llms.txt: phải nêu cả VietQR và thẻ quốc tế: ${line}`);
+  assert.ok(!/only from Vietnamese bank accounts|payment only/i.test(line), `llms.txt: còn câu cũ "chỉ ngân hàng Việt Nam": ${line}`);
 });
 
 
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/site.test.mjs 2>&1 | grep -E "^✖ [^f]|^ℹ (tests|pass|fail)"`
Expected: FAIL ba test: `thẻ gói ở trang chủ và Bảng giá: gói trả phí ghi thêm giá USD bằng thẻ quốc tế, gói Free thì không`, `JSON-LD của trang giá liệt kê đủ Offer: bốn Offer VND (kể cả 6 Months 269000 ₫ trong 180 ngày) và ba Offer USD`, `llms.txt nêu giá cả ba gói trả phí (VND và USD), lấy từ plans.mjs, và hai cách trả`; `ℹ tests 30`, `ℹ pass 27`, `ℹ fail 3`.

- [ ] **Step 3: Sửa bộ sinh**

Dòng USD ở thẻ gói và kiểu của nó:

**Sửa `website/src/build/components.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/build/components.mjs
+++ b/website/src/build/components.mjs
@@ -3,7 +3,7 @@
 import { readFileSync } from "node:fs";
 import { esc } from "./markdown.mjs";
 import { icon } from "./icons.mjs";
-import { PLANS, vnd } from "../plans.mjs";
+import { PLANS, usd, vnd } from "../plans.mjs";
 
 export { esc, icon };
 
@@ -208,11 +208,14 @@
   return `<div class="plans">${PLANS.map((p) => {
     const f = p.code === featured;
     const price = p.priceVnd === 0 ? (en ? "Free" : "Miễn phí") : vnd(p.priceVnd, lang);
+    // Giá USD khi trả bằng thẻ quốc tế (spec 2026-10-14): chỉ gói trả phí; chưa gồm thuế (nói ở chú thích dưới lưới gói).
+    const usdLine = p.priceUsdCents > 0 ? `<p class="usd">${esc(en ? `or ${usd(p.priceUsdCents, lang)} by international card` : `hoặc ${usd(p.priceUsdCents, lang)} bằng thẻ quốc tế`)}</p>` : "";
     return `<div class="plan${f ? " featured" : ""} reveal">
 ${f ? `<span class="tag">${en ? "Best value" : "Tiết kiệm nhất"}</span>` : ""}
 <h3>${esc(en ? p.nameEn : p.nameVi)}</h3>
 <p class="for">${esc(L[p.code].for)}</p>
 <div class="price"><b>${esc(price)}</b></div>
+${usdLine}
 <p class="per">${esc(L[p.code].per)}</p>
 ${checkList(feats[p.code].map(esc))}
 <a class="btn ${f ? "btn-primary" : "btn-secondary"} btn-lg" href="${en ? "/en/download/" : "/tai-xuong/"}">${esc(p.priceVnd === 0 ? freeLabel ?? ctaLabel : ctaLabel)}</a>
```

**Sửa `website/src/assets/site.css`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/assets/site.css
+++ b/website/src/assets/site.css
@@ -320,6 +320,7 @@
 .price { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; margin: .6rem 0 .3rem; }
 .price b { font-size: clamp(2.2rem, 1.6rem + 2vw, 3rem); color: var(--ink); letter-spacing: -.03em; line-height: 1; }
 .price span { color: var(--ink-3); }
+.plan .usd { font-size: .95rem; font-weight: 600; color: var(--ink-2); margin: 0 0 .35rem; }
 .plan .per { font-size: .9rem; color: var(--ink-3); margin-bottom: 1.2rem; }
 .plan .check-list { margin-bottom: 1.6rem; flex: 1; }
 .plan .btn { width: 100%; }
```

Ba `Offer` USD trong JSON-LD:

**Sửa `website/src/build/schema.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/build/schema.mjs
+++ b/website/src/build/schema.mjs
@@ -1,7 +1,7 @@
 // Dữ liệu có cấu trúc JSON-LD (schema.org) cho mỗi trang, gộp thành một @graph. Chỉ dùng những gì có thật: không có
 // aggregateRating, review hay giá giả; giá lấy từ plans.mjs (có test đối chiếu với server/wrangler.jsonc).
 import { SITE, ogFor } from "../site.mjs";
-import { PLANS } from "../plans.mjs";
+import { PLANS, usd } from "../plans.mjs";
 
 const abs = (p) => (p.startsWith("http") ? p : SITE.origin + p);
 const ORG_ID = `${SITE.origin}/#organization`;
@@ -74,6 +74,17 @@
     availability: "https://schema.org/InStock",
     eligibleDuration: { "@type": "QuantitativeValue", value: p.days, unitCode: "DAY" },
     description: en ? p.summaryEn : p.summaryVi,
+    url: abs(en ? "/en/pricing/" : "/bang-gia/"),
+  }));
+  // Giá USD khi trả bằng thẻ quốc tế (spec 2026-10-14): mỗi gói trả phí thêm một Offer riêng loại tiền, chưa gồm thuế.
+  const usdOffers = PLANS.filter((p) => p.priceUsdCents > 0).map((p) => ({
+    "@type": "Offer",
+    name: `${en ? p.nameEn : p.nameVi} (USD)`,
+    price: (p.priceUsdCents / 100).toFixed(2),
+    priceCurrency: "USD",
+    availability: "https://schema.org/InStock",
+    eligibleDuration: { "@type": "QuantitativeValue", value: p.days, unitCode: "DAY" },
+    description: `${en ? p.summaryEn : p.summaryVi} ${en ? "Paid by international card; price excludes tax." : "Trả bằng thẻ quốc tế; giá chưa gồm thuế."}`,
     url: abs(en ? "/en/pricing/" : "/bang-gia/"),
   }));
   const shot = (name, vi, en_) => ({ "@type": "ImageObject", url: abs(`/assets/img/app/${name}.${lang}.webp`), caption: en ? en_ : vi });
@@ -105,7 +116,7 @@
     ],
     publisher: { "@id": ORG_ID },
     author: { "@id": PERSON_ID },
-    offers,
+    offers: [...offers, ...usdOffers],
     featureList: en ? SITE.featureListEn : SITE.featureListVi,
   };
 }
```

Dòng `Pricing` của `llms.txt`:

**Sửa `website/src/build/build.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/build/build.mjs
+++ b/website/src/build/build.mjs
@@ -10,7 +10,7 @@
 import { renderPage, THEME_INIT_HASH } from "./layout.mjs";
 import { pages, notFound } from "../content/index.mjs";
 import { htmlToText } from "./text.mjs";
-import { PLANS, vnd } from "../plans.mjs";
+import { PLANS, usd, vnd } from "../plans.mjs";
 
 const SRC = fileURLToPath(new URL("..", import.meta.url));
 const ROOT = path.resolve(SRC, "..");
@@ -79,7 +79,7 @@
     `- Requirements: 8 GB RAM minimum (16 GB recommended); models download once, 1.3 GB (Lite pack) or 2.5 GB (Standard pack)`,
     `- Languages (speech and translation): English, Chinese, Japanese, Korean, Vietnamese (tiếng Anh, tiếng Trung, tiếng Nhật, tiếng Hàn, tiếng Việt); interface in Vietnamese, English, Japanese, Chinese (Simplified), Korean`,
     `- Measured latency: median 0.76–1.03 s with the Standard pack on a Mac M4 Pro 24 GB (macOS 26); preliminary Windows test on one laptop with integrated graphics: median 1.3–2.6 s (Lite), 2.7–5.4 s (Standard)`,
-    `- Pricing: ${free.nameEn} trial ${free.days} days (${free.minutesPerDay} min/day, ${vnd(0)}); ${monthly.nameEn} ${vnd(monthly.priceVnd)} (${monthly.minutesPerCycle / 60} h per ${monthly.days} days); ${sixMonths.nameEn} ${vnd(sixMonths.priceVnd)} (${sixMonths.minutesPerCycle / 60} h per 30 days, ${sixMonths.days} days); ${yearly.nameEn} ${vnd(yearly.priceVnd)} (unlimited, ${yearly.days} days); prepaid by VietQR in VND, no auto-renewal; payment only from Vietnamese bank accounts`,
+    `- Pricing: ${free.nameEn} trial ${free.days} days (${free.minutesPerDay} min/day, ${vnd(0)}); ${monthly.nameEn} ${vnd(monthly.priceVnd)} (${monthly.minutesPerCycle / 60} h per ${monthly.days} days); ${sixMonths.nameEn} ${vnd(sixMonths.priceVnd)} (${sixMonths.minutesPerCycle / 60} h per 30 days, ${sixMonths.days} days); ${yearly.nameEn} ${vnd(yearly.priceVnd)} (unlimited, ${yearly.days} days); prepaid, no auto-renewal; pay in VND by VietQR from a Vietnamese bank account, or in USD by international card (${monthly.nameEn} ${usd(monthly.priceUsdCents, "en")}, ${sixMonths.nameEn} ${usd(sixMonths.priceUsdCents, "en")}, ${yearly.nameEn} ${usd(yearly.priceUsdCents, "en")}, excluding tax)`,
     `- Install: macOS \`curl -fsSL ${SITE.origin}/install.sh | bash\`; Windows \`irm ${SITE.origin}/install.ps1 | iex\``,
     `- Privacy: no bot, no account, no ads, no analytics or cookies on the website; the app sends no audio or transcripts to any server; not open source`,
   ].join("\n");
```

- [ ] **Step 4: Chạy toàn bộ test (xanh)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 83`, `ℹ pass 81`, `ℹ fail 0`, `ℹ skipped 2`.

- [ ] **Step 5: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- website | wc -l`
Expected: `6`.

---

### Task 3: Bảng giá và Trang chủ nêu hai cách trả

**Files:**
- Modify: `website/src/content/vi/pricing.mjs`, `website/src/content/en/pricing.mjs`, `website/src/content/vi/home.mjs`, `website/src/content/en/home.mjs`, `website/src/assets/site.css`
- Test: `website/test/site.test.mjs`

Bảng giá: lời dẫn, mô tả, chú thích dưới thẻ gói (giá USD chưa gồm thuế, Creem cộng thuế nếu nước khách có thu), callout "Thanh toán từ nước ngoài" (đổi từ cảnh báo thành thông tin: nay có cách trả), bảng so sánh (dòng "Giá" thêm giá USD, thêm dòng "Cách thanh toán"), ba bước "Cách mua", hai câu hỏi (thẻ quốc tế; hoàn tiền: Creem cũng có thể hoàn, license của đơn hoàn có thể bị thu hồi theo D5). Trang chủ: câu hỏi "Tôi ở ngoài Việt Nam có mua được không?" thành "Được", dòng "Giá" của bảng thông tin, tiêu đề và chú thích của phần giá. Quy tắc CSS mới `.compare td small` cho ô bảng có dòng nhỏ (dòng "hoặc 3,99 USD" nằm dưới giá VND thay vì dính liền "mỗi đơnhoặc 3,99 USD", lỗi phát hiện khi xem bằng mắt).

- [ ] **Step 1: Viết test**

Bảng `need` (đường dẫn → cụm phải có) cho bốn trang:

**Sửa `website/test/site.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/test/site.test.mjs
+++ b/website/test/site.test.mjs
@@ -384,6 +384,21 @@
   assert.deepEqual(errors, []);
 });
 
+test("Bảng giá và trang chủ nêu hai cách trả, giá USD chưa gồm thuế và Creem là bên xử lý thanh toán thẻ", () => {
+  const need = {
+    "/bang-gia/": ["VietQR", "thẻ quốc tế", "Creem", "3,99 USD", "21,99 USD", "39,99 USD", "chưa gồm thuế"],
+    "/en/pricing/": ["VietQR", "international card", "Creem", "$3.99", "$21.99", "$39.99", "excluding tax"],
+    "/": ["VietQR", "thẻ quốc tế", "Creem", "3,99 USD", "21,99 USD", "39,99 USD", "chưa gồm thuế"],
+    "/en/": ["VietQR", "international card", "Creem", "$3.99", "$21.99", "$39.99", "excluding tax"],
+  };
+  const errors = [];
+  for (const [urlPath, needles] of Object.entries(need)) {
+    const text = textOf(htmlByPath.get(urlPath));
+    for (const n of needles) if (!text.includes(n)) errors.push(`${urlPath}: thiếu "${n}"`);
+  }
+  assert.deepEqual(errors, []);
+});
+
 test("JSON-LD của trang giá liệt kê đủ Offer: bốn Offer VND (kể cả 6 Months 269000 ₫ trong 180 ngày) và ba Offer USD", () => {
   const errors = [];
   for (const urlPath of ["/bang-gia/", "/en/pricing/"]) {
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/site.test.mjs 2>&1 | grep -E "^✖ [^f]|^\s+\+ +'|^ℹ (tests|pass|fail)"`
Expected: FAIL một test: `Bảng giá và trang chủ nêu hai cách trả, giá USD chưa gồm thuế và Creem là bên xử lý thanh toán thẻ`, tám dòng thiếu (`/bang-gia/: thiếu "Creem"`, `/bang-gia/: thiếu "chưa gồm thuế"`, `/en/pricing/: thiếu "Creem"`, `/en/pricing/: thiếu "excluding tax"`, và bốn dòng tương tự cho `/` và `/en/`); `ℹ tests 31`, `ℹ pass 30`, `ℹ fail 1`.

- [ ] **Step 3: Sửa Bảng giá**

**Sửa `website/src/content/vi/pricing.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/pricing.mjs
+++ b/website/src/content/vi/pricing.mjs
@@ -16,8 +16,8 @@
     a: "<p>Máy đó không dùng được gói Free nữa và cần mua Monthly, 6 Months hoặc Yearly để tiếp tục dịch. Gỡ app rồi cài lại, xóa dữ liệu hay xóa Keychain đều không mở lại 10 ngày dùng thử, vì máy chủ ghi ngày bắt đầu theo máy.</p>",
   },
   {
-    q: "Tôi có thể trả bằng thẻ Visa, PayPal không?",
-    a: "<p>Chưa. Hiện chỉ nhận chuyển khoản từ ngân hàng Việt Nam bằng mã VietQR, tính bằng VND, qua cổng PayOS. Chưa có thẻ quốc tế hay thanh toán định kỳ. Nếu bạn ở nước ngoài và không có tài khoản ngân hàng Việt Nam, hiện bạn chưa mua được gói trả phí; gói Free dùng thử không cần phương thức thanh toán.</p>",
+    q: "Tôi có thể trả bằng thẻ quốc tế không?",
+    a: "<p>Có. Màn hình Nâng cấp trong app có hai cách trả: <strong>chuyển khoản VietQR bằng VND</strong> (từ ngân hàng Việt Nam, qua cổng PayOS) hoặc <strong>thẻ quốc tế bằng USD</strong> (Monthly 3,99 USD, 6 Months 21,99 USD, Yearly 39,99 USD, chưa gồm thuế). Với thẻ, app mở trang thanh toán của Creem (bên xử lý thanh toán và thuế cho khoản này) trong trình duyệt của bạn; trả xong thì quay lại app, gói tự kích hoạt. Chưa có thanh toán định kỳ. Gói Free dùng thử không cần phương thức thanh toán.</p>",
   },
   {
     q: "Gói có tự động gia hạn không?",
@@ -29,7 +29,7 @@
   },
   {
     q: "Có hoàn tiền không?",
-    a: "<p>Đã thanh toán thì không hoàn lại, trừ khi lỗi do phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác. Hãy gửi yêu cầu trong 7 ngày kể từ ngày thanh toán tới support@aitranslator.vn kèm mã đơn. Đổi gói không được hoàn tiền. Chi tiết trong <a href=\"/dieu-khoan/\">Điều khoản sử dụng</a>.</p>",
+    a: "<p>Đã thanh toán thì không hoàn lại, trừ khi lỗi do phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác. Hãy gửi yêu cầu trong 7 ngày kể từ ngày thanh toán tới support@aitranslator.vn kèm mã đơn. Đổi gói không được hoàn tiền. Khoản trả bằng thẻ quốc tế do Creem xử lý, nên Creem cũng có thể hoàn tiền theo điều khoản của họ; đơn đã hoàn tiền thì license của đơn đó có thể bị thu hồi. Chi tiết trong <a href=\"/dieu-khoan/\">Điều khoản sử dụng</a>.</p>",
   },
   {
     q: "Tôi cần hóa đơn điện tử cho doanh nghiệp?",
@@ -51,21 +51,21 @@
   path: "/bang-gia/",
   title: "Bảng giá AI Translator: Free, Monthly, 6 Months, Yearly",
   description:
-    "Bốn gói AI Translator: Free dùng thử 10 ngày, Monthly 50.000 ₫, 6 Months 269.000 ₫ (100 giờ/30 ngày), Yearly 500.000 ₫ (không giới hạn). Trả trước bằng VietQR.",
+    "Bốn gói AI Translator: Free dùng thử 10 ngày, Monthly 50.000 ₫, 6 Months 269.000 ₫, Yearly 500.000 ₫. Trả trước bằng VietQR hoặc thẻ quốc tế (USD).",
   software: true,
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   schema: [faqPage(PRICING_FAQ.map((f) => ({ q: f.q, a: f.a })))],
-  llm: "Bảng giá bốn gói (Free dùng thử 10 ngày, Monthly 50.000 đ, 6 Months 269.000 đ, Yearly 500.000 đ), cách tính thời lượng, cách mua bằng VietQR, đổi gói, hoàn tiền và câu hỏi về giá.",
+  llm: "Bảng giá bốn gói (Free dùng thử 10 ngày, Monthly 50.000 đ, 6 Months 269.000 đ, Yearly 500.000 đ), cách tính thời lượng, cách mua bằng VietQR (VND) hoặc thẻ quốc tế (USD), đổi gói, hoàn tiền và câu hỏi về giá.",
   llmTitle: "Bảng giá AI Translator",
   body: () => `
-${pageHero({ crumbs, title: "Bảng giá đơn giản: trả trước, không tự gia hạn", lead: "Dùng thử miễn phí 10 ngày, rồi chọn Monthly, 6 Months hoặc Yearly khi bạn thấy hữu ích. Thanh toán bằng VietQR ngay trong app, nhận key qua email." })}
+${pageHero({ crumbs, title: "Bảng giá đơn giản: trả trước, không tự gia hạn", lead: "Dùng thử miễn phí 10 ngày, rồi chọn Monthly, 6 Months hoặc Yearly khi bạn thấy hữu ích. Thanh toán bằng VietQR hoặc thẻ quốc tế ngay trong app, nhận key qua email." })}
 
 <section class="section-tight"><div class="container">
 <h2 class="sr-only">Các gói và giá</h2>
 ${plansGrid("vi", { ctaLabel: "Tải xuống", freeLabel: "Cài và dùng thử miễn phí" })}
-<p class="disclaimer">Giá tính bằng đồng Việt Nam (VND) cho mỗi đơn, đúng bằng số tiền trong mã VietQR. Giá có thể thay đổi; gói bạn đã mua giữ nguyên hạn mức.</p>
-${callout({ kind: "warn", title: "Thanh toán từ nước ngoài", text: "Hiện chúng tôi chỉ nhận chuyển khoản từ ngân hàng Việt Nam qua VietQR, tính bằng VND. Chưa hỗ trợ thẻ quốc tế, PayPal hay tiền tệ khác, nên nếu không có tài khoản ngân hàng Việt Nam thì hiện bạn chưa mua được gói trả phí. Gói Free dùng thử không cần phương thức thanh toán. Nếu điều này cản trở bạn, hãy <a href=\"/lien-he/\">liên hệ chúng tôi</a>." })}
+<p class="disclaimer">Giá VND là số tiền trong mã VietQR cho mỗi đơn. Giá USD áp dụng khi trả bằng thẻ quốc tế và chưa gồm thuế: nếu nước của bạn có thu thuế bán hàng, Creem tính thêm ở trang thanh toán. Giá có thể thay đổi; gói bạn đã mua giữ nguyên hạn mức.</p>
+${callout({ title: "Thanh toán từ nước ngoài", text: "Không có tài khoản ngân hàng Việt Nam? Chọn <strong>Thẻ quốc tế (USD)</strong> trong màn hình Nâng cấp: bạn trả bằng thẻ trên trang thanh toán của Creem, không cần ngân hàng Việt Nam. Gói Free dùng thử vẫn không cần phương thức thanh toán. Cần giúp thì <a href=\"/lien-he/\">liên hệ chúng tôi</a>." })}
 </div></section>
 
 <section class="section"><div class="container">
@@ -73,7 +73,8 @@
 <div class="table-wrap reveal"><table class="compare">
 <thead><tr><th scope="col"></th><th scope="col">Free (dùng thử)</th><th scope="col">Monthly</th><th scope="col">6 Months</th><th scope="col">Yearly</th></tr></thead>
 <tbody>
-<tr><th scope="row">Giá</th><td>0 ₫</td><td>50.000 ₫ mỗi đơn</td><td>269.000 ₫ mỗi đơn</td><td>500.000 ₫ mỗi đơn</td></tr>
+<tr><th scope="row">Giá</th><td>0 ₫</td><td>50.000 ₫ mỗi đơn<small>hoặc 3,99 USD</small></td><td>269.000 ₫ mỗi đơn<small>hoặc 21,99 USD</small></td><td>500.000 ₫ mỗi đơn<small>hoặc 39,99 USD</small></td></tr>
+<tr><th scope="row">Cách thanh toán</th><td>Không cần</td><td>VietQR (VND) hoặc thẻ quốc tế (USD)</td><td>VietQR (VND) hoặc thẻ quốc tế (USD)</td><td>VietQR (VND) hoặc thẻ quốc tế (USD)</td></tr>
 <tr><th scope="row">Thời hạn</th><td>10 ngày, mỗi máy một lần</td><td>30 ngày mỗi đơn</td><td>180 ngày mỗi đơn</td><td>365 ngày mỗi đơn</td></tr>
 <tr><th scope="row">Thời lượng dịch</th><td>30 phút mỗi ngày</td><td>50 giờ (3000 phút) mỗi chu kỳ 30 ngày</td><td>100 giờ (6000 phút) mỗi chu kỳ 30 ngày</td><td>Không giới hạn</td></tr>
 <tr><th scope="row">Phụ đề dịch trực tiếp, 5 ngôn ngữ</th><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
@@ -111,11 +112,11 @@
 <section class="section"><div class="container">
 ${sectionHead({ eyebrow: "Cách mua", title: "Từ chọn gói tới kích hoạt, ngay trong app", center: true })}
 ${steps([
-  { title: "Chọn gói trong app", text: "Mở <strong>Nâng cấp Pro</strong>, chọn Monthly, 6 Months hoặc Yearly, nhập email nhận key và đồng ý để lưu email này cho việc gửi và khôi phục key." },
-  { title: "Quét mã VietQR", text: "App vẽ mã VietQR ngay trong cửa sổ, kèm nút mở trang thanh toán PayOS. Mã dùng được trong 15 phút." },
-  { title: "Tự kích hoạt", text: "Khi PayOS xác nhận đã nhận tiền (app hỏi trạng thái mỗi 3 giây), gói có hiệu lực ngay trên máy bạn và key được gửi vào email." },
+  { title: "Chọn gói và cách trả trong app", text: "Mở <strong>Nâng cấp Pro</strong>, chọn Monthly, 6 Months hoặc Yearly, chọn cách trả (VietQR bằng VND hoặc thẻ quốc tế bằng USD), nhập email nhận key và đồng ý để lưu email này cho việc gửi và khôi phục key." },
+  { title: "Trả tiền", text: "<strong>VietQR:</strong> app vẽ mã QR ngay trong cửa sổ, kèm nút mở trang thanh toán PayOS; mã dùng được trong 15 phút. <strong>Thẻ quốc tế:</strong> app tự mở trang thanh toán của Creem trong trình duyệt; đơn được giữ trong 30 phút." },
+  { title: "Tự kích hoạt", text: "Khi cổng thanh toán xác nhận đã nhận tiền (app hỏi trạng thái vài giây một lần), gói có hiệu lực ngay trên máy bạn và key được gửi vào email." },
 ])}
-<p class="disclaimer">Chỉ nhận chuyển khoản từ ngân hàng Việt Nam bằng VND qua PayOS. Chúng tôi không nhận số thẻ hay thông tin tài khoản ngân hàng của bạn và không gửi email của bạn sang PayOS.</p>
+<p class="disclaimer">Chúng tôi không nhận số thẻ hay thông tin tài khoản ngân hàng của bạn. Với VietQR, chúng tôi không gửi email của bạn sang PayOS. Với thẻ quốc tế, email bạn nhập trong app được dùng để điền sẵn trang thanh toán của Creem, bên xử lý thanh toán và thuế cho khoản này.</p>
 </div></section>
 
 <section class="section section-alt"><div class="container">
```

**Sửa `website/src/content/en/pricing.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/pricing.mjs
+++ b/website/src/content/en/pricing.mjs
@@ -16,8 +16,8 @@
     a: `<p>That computer can no longer use the Free plan and needs a Monthly, 6 Months or Yearly plan to keep translating. Uninstalling and reinstalling the app, deleting its data or clearing the Keychain does not restart the 10 days, because our server records the start date for each computer.</p>`,
   },
   {
-    q: "Can I pay with a credit card or PayPal?",
-    a: `<p>Not yet. We only accept bank transfers from Vietnamese banks through a VietQR code, in Vietnamese dong (VND), via the PayOS gateway. International cards, PayPal and recurring payments are not available. If you live abroad and do not have a Vietnamese bank account, you cannot buy a paid plan at the moment.</p>`,
+    q: "Can I pay with an international card?",
+    a: `<p>Yes. The Upgrade screen in the app offers two ways to pay: <strong>VietQR bank transfer in VND</strong> (from a Vietnamese bank, through the PayOS gateway) or <strong>international card in USD</strong> (Monthly $3.99, 6 Months $21.99, Yearly $39.99, excluding tax). For a card, the app opens the Creem payment page (Creem handles the payment and tax for it) in your browser; when you are done, return to the app and the plan activates itself. Recurring payments are not available. The Free trial needs no payment method.</p>`,
   },
   {
     q: "Does my plan renew automatically?",
@@ -29,7 +29,7 @@
   },
   {
     q: "Can I get a refund?",
-    a: `<p>Payments are not refundable, except when a fault on our side stops you from using the plan you bought and it cannot be fixed within a reasonable time, or when the law says otherwise. Send your request within 7 days of the payment date to support@aitranslator.vn, with your order number. Changing plans is not refundable. Details are in the <a href="/en/terms/">Terms of use</a>.</p>`,
+    a: `<p>Payments are not refundable, except when a fault on our side stops you from using the plan you bought and it cannot be fixed within a reasonable time, or when the law says otherwise. Send your request within 7 days of the payment date to support@aitranslator.vn, with your order number. Changing plans is not refundable. Card payments are handled by Creem, which may also issue refunds under its own terms; the license of a refunded order may then be revoked. Details are in the <a href="/en/terms/">Terms of use</a>.</p>`,
   },
   {
     q: "Can I get an e-invoice for my company?",
@@ -53,21 +53,21 @@
   path: "/en/pricing/",
   title: "AI Translator pricing: Free trial, Monthly, 6 Months, Yearly",
   description:
-    "AI Translator plans: Free 10-day trial, Monthly 50,000 ₫, 6 Months 269,000 ₫ (100 hours/30 days), Yearly 500,000 ₫ (unlimited). Prepaid via VietQR, no auto-renewal.",
+    "AI Translator plans: Free 10-day trial, Monthly 50,000 ₫, 6 Months 269,000 ₫, Yearly 500,000 ₫. Prepaid by VietQR or international card (USD), no auto-renewal.",
   software: true,
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   schema: [faqPage(PRICING_FAQ.map((f) => ({ q: f.q, a: f.a })))],
-  llm: "Pricing for the four plans (Free 10-day trial, Monthly 50,000 VND, 6 Months 269,000 VND, Yearly 500,000 VND), how translation time is counted, how to buy with VietQR, changing plans, refunds and pricing questions.",
+  llm: "Pricing for the four plans (Free 10-day trial, Monthly 50,000 VND, 6 Months 269,000 VND, Yearly 500,000 VND), how translation time is counted, how to buy with VietQR (VND) or an international card (USD), changing plans, refunds and pricing questions.",
   llmTitle: "AI Translator pricing",
   body: () => `
-${pageHero({ crumbs, title: "Simple pricing: prepaid, no auto-renewal", lead: "Try it free for 10 days, then choose Monthly, 6 Months or Yearly if it earns its place. You pay in Vietnamese dong (VND) by VietQR from a Vietnamese bank, right inside the app, and your key arrives by email." })}
+${pageHero({ crumbs, title: "Simple pricing: prepaid, no auto-renewal", lead: "Try it free for 10 days, then choose Monthly, 6 Months or Yearly if it earns its place. You pay inside the app, by VietQR in Vietnamese dong (VND) from a Vietnamese bank or by international card in US dollars (USD), and your key arrives by email." })}
 
 <section class="section-tight"><div class="container">
 <h2 class="sr-only">The four plans</h2>
 ${plansGrid("en", { ctaLabel: "Download", freeLabel: "Install and try free" })}
-<p class="disclaimer">Prices are in Vietnamese dong (VND) per order, and equal the amount in the VietQR code. Prices and allowances are set on our server; a plan you have already bought never has its allowance reduced.</p>
-${callout({ kind: "warn", title: "Paying from outside Vietnam", text: "For now we accept only bank transfers from Vietnamese banks, made through VietQR and charged in VND. International cards, PayPal and other currencies are not supported yet, so if you do not have a Vietnamese bank account you cannot buy a paid plan today. The Free trial needs no payment method. If this blocks you, <a href=\"/en/contact/\">contact us</a>." })}
+<p class="disclaimer">VND prices are per order and equal the amount in the VietQR code. USD prices apply when you pay by international card and exclude tax: if your country charges sales tax, Creem adds it on the payment page. Prices and allowances are set on our server; a plan you have already bought never has its allowance reduced.</p>
+${callout({ title: "Paying from outside Vietnam", text: "No Vietnamese bank account? Choose <strong>International card (USD)</strong> on the Upgrade screen: you pay by card on the Creem payment page, no Vietnamese bank needed. The Free trial still needs no payment method. If you need help, <a href=\"/en/contact/\">contact us</a>." })}
 </div></section>
 
 <section class="section"><div class="container">
@@ -75,7 +75,8 @@
 <div class="table-wrap reveal" role="region" aria-label="Plan comparison" tabindex="0"><table class="compare">
 <thead><tr><th scope="col"><span class="sr-only">Feature</span></th><th scope="col">Free (trial)</th><th scope="col">Monthly</th><th scope="col">6 Months</th><th scope="col">Yearly</th></tr></thead>
 <tbody>
-<tr><th scope="row">Price</th><td>0 ₫</td><td>50,000 ₫ per order</td><td>269,000 ₫ per order</td><td>500,000 ₫ per order</td></tr>
+<tr><th scope="row">Price</th><td>0 ₫</td><td>50,000 ₫ per order<small>or $3.99</small></td><td>269,000 ₫ per order<small>or $21.99</small></td><td>500,000 ₫ per order<small>or $39.99</small></td></tr>
+<tr><th scope="row">How to pay</th><td>No payment needed</td><td>VietQR (VND) or international card (USD)</td><td>VietQR (VND) or international card (USD)</td><td>VietQR (VND) or international card (USD)</td></tr>
 <tr><th scope="row">Duration</th><td>10 days, once per computer</td><td>30 days per order</td><td>180 days per order</td><td>365 days per order</td></tr>
 <tr><th scope="row">Translation time</th><td>30 minutes per day</td><td>50 hours (3,000 minutes) per 30-day cycle</td><td>100 hours (6,000 minutes) per 30-day cycle</td><td>Unlimited</td></tr>
 <tr><th scope="row">Live translated subtitles, 5 languages</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
@@ -113,12 +114,12 @@
 <section class="section"><div class="container">
 ${sectionHead({ eyebrow: "How to buy", title: "From choosing a plan to activation, inside the app", center: true })}
 ${steps([
-  { title: "Choose a plan in the app", text: "Open <strong>Upgrade to Pro</strong>, choose Monthly, 6 Months or Yearly, enter the email where you want to receive your key and agree to let us store it to send and recover the key." },
-  { title: "Scan the VietQR code", text: "The app draws a VietQR code right in its window, with a button to open the PayOS payment page. The code works for 15 minutes." },
-  { title: "It activates itself", text: "When PayOS confirms the payment (the app checks every 3 seconds), the plan takes effect on your computer straight away and your key is emailed to you." },
+  { title: "Choose a plan and how to pay in the app", text: "Open <strong>Upgrade to Pro</strong>, choose Monthly, 6 Months or Yearly, choose how to pay (VietQR in VND or international card in USD), enter the email where you want to receive your key and agree to let us store it to send and recover the key." },
+  { title: "Pay", text: "<strong>VietQR:</strong> the app draws a QR code right in its window, with a button to open the PayOS payment page; the code works for 15 minutes. <strong>International card:</strong> the app opens the Creem payment page in your browser by itself; the order is kept for 30 minutes." },
+  { title: "It activates itself", text: "When the payment gateway confirms the payment (the app checks every few seconds), the plan takes effect on your computer straight away and your key is emailed to you." },
 ])}
 <p class="center-text reveal"><a class="btn btn-secondary" href="/en/guide/buy-and-activate/">Read the guide to buying and activating a key ${icon("arrow-right")}</a></p>
-<p class="disclaimer">Only bank transfers from Vietnamese banks, in VND, through PayOS. We do not receive your card number or bank account details, and we do not send your email address to PayOS.</p>
+<p class="disclaimer">We do not receive your card number or bank account details. With VietQR we do not send your email address to PayOS. With an international card, the email you enter in the app is used to pre-fill the Creem payment page; Creem handles the payment and tax for it.</p>
 </div></section>
 
 <section class="section section-alt"><div class="container">
```

- [ ] **Step 4: Sửa Trang chủ**

**Sửa `website/src/content/vi/home.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/home.mjs
+++ b/website/src/content/vi/home.mjs
@@ -37,7 +37,7 @@
   },
   {
     q: "Tôi ở ngoài Việt Nam có mua được không?",
-    a: "<p>Chưa. Hiện chỉ nhận chuyển khoản từ ngân hàng Việt Nam qua VietQR, tính bằng đồng Việt Nam. Chưa hỗ trợ thẻ quốc tế hay PayPal, nên nếu không có tài khoản ngân hàng Việt Nam thì hiện bạn chưa mua được gói trả phí. Gói Free dùng thử không cần phương thức thanh toán.</p>",
+    a: "<p>Được. Ngoài chuyển khoản VietQR bằng VND (từ ngân hàng Việt Nam), màn hình Nâng cấp trong app cho trả bằng thẻ quốc tế bằng USD, qua trang thanh toán của Creem: Monthly 3,99 USD, 6 Months 21,99 USD, Yearly 39,99 USD, chưa gồm thuế. Gói Free dùng thử không cần phương thức thanh toán.</p>",
   },
   {
     q: "Hiện tôi tải app ở đâu?",
@@ -53,7 +53,7 @@
   description:
     "Phụ đề dịch trực tiếp khi họp Zoom, Teams, Google Meet, Zalo: tiếng Anh, Trung, Nhật, Hàn sang tiếng Việt. AI chạy trên máy, âm thanh không lên cloud.",
   software: true,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   llm: "Trang chủ: AI Translator là gì, cách hoạt động, tính năng, độ trễ đo được, bảng giá và câu hỏi thường gặp.",
   llmTitle: "AI Translator: trang chủ",
   schema: [faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a })))],
@@ -101,7 +101,7 @@
   ["Nền tảng", "macOS 14.2 trở lên (Apple Silicon) và Windows 10/11 x64<small>Cả hai cài bằng một dòng lệnh</small>"],
   ["Ngôn ngữ", "tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt<small>Cả âm thanh nguồn lẫn bản dịch. Dự kiến bổ sung thêm ngôn ngữ trong tương lai</small>"],
   ["Xử lý", "100% trên máy, âm thanh không gửi đi<small>Nhận dạng giọng nói và dịch đều chạy trên máy</small>"],
-  ["Giá", "Free dùng thử 10 ngày · Monthly 50.000 ₫ · 6 Months 269.000 ₫ · Yearly 500.000 ₫<small>Trả trước bằng VietQR, không tự gia hạn</small>"],
+  ["Giá", "Free dùng thử 10 ngày · Monthly 50.000 ₫ · 6 Months 269.000 ₫ · Yearly 500.000 ₫<small>Trả trước bằng VietQR (VND) hoặc thẻ quốc tế (USD), không tự gia hạn</small>"],
   ["Bên cung cấp", "Đỗ Tiến Phong<small>Hỗ trợ: support@aitranslator.vn</small>"],
 ])}</div>
 </div></section>
@@ -198,9 +198,9 @@
 </div></section>
 
 <section class="section" id="gia"><div class="container">
-${sectionHead({ eyebrow: "Bảng giá", title: "Bốn gói đơn giản, trả trước bằng VietQR", text: "Không tự động gia hạn, không thanh toán định kỳ, không bất ngờ trên hóa đơn.", center: true })}
+${sectionHead({ eyebrow: "Bảng giá", title: "Bốn gói đơn giản, trả trước bằng VietQR hoặc thẻ", text: "Không tự động gia hạn, không thanh toán định kỳ, không bất ngờ trên hóa đơn.", center: true })}
 ${plansGrid("vi", { ctaLabel: "Tải xuống", freeLabel: "Cài và dùng thử miễn phí" })}
-<p class="disclaimer">Giá tính bằng đồng Việt Nam (VND). Chỉ nhận chuyển khoản từ ngân hàng Việt Nam qua VietQR; chưa nhận thẻ quốc tế.</p>
+<p class="disclaimer">Giá VND trả bằng VietQR từ ngân hàng Việt Nam; giá USD trả bằng thẻ quốc tế, chưa gồm thuế (nếu có).</p>
 <p class="center-text reveal"><a class="btn btn-ghost" href="/bang-gia/">So sánh chi tiết các gói ${icon("arrow-right")}</a></p>
 </div></section>
 
```

**Sửa `website/src/content/en/home.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/home.mjs
+++ b/website/src/content/en/home.mjs
@@ -37,7 +37,7 @@
   },
   {
     q: "Can I pay from outside Vietnam?",
-    a: `<p>Not yet. Payment is by bank transfer from a Vietnamese bank (VietQR), in Vietnamese dong. International cards and PayPal are not supported at the moment, so without a Vietnamese bank account you cannot buy a paid plan today. The Free trial needs no payment method.</p>`,
+    a: `<p>Yes. Besides VietQR bank transfer in VND (from a Vietnamese bank), the Upgrade screen in the app lets you pay by international card in US dollars, on the Creem payment page: Monthly $3.99, 6 Months $21.99, Yearly $39.99, excluding tax. The Free trial needs no payment method.</p>`,
   },
   {
     q: "Where can I download it right now?",
@@ -55,7 +55,7 @@
   description:
     "Read live translated subtitles in Zoom, Teams, Google Meet or any app. English, Chinese, Japanese, Korean, Vietnamese. AI runs on your computer, no cloud.",
   software: true,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   llm: "Home page: what AI Translator is, how it works, features, measured latency, pricing and frequently asked questions.",
   llmTitle: "AI Translator: home",
   schema: [faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a })))],
@@ -103,7 +103,7 @@
   ["Platforms", "macOS 14.2 or later (Apple Silicon) and Windows 10/11 x64<small>Both install with one command</small>"],
   ["Languages", "English, Chinese (中文), Japanese (日本語), Korean (한국어), Vietnamese (Tiếng Việt)<small>For both the source audio and the translation. More languages are planned for the future</small>"],
   ["Processing", "100% on your device; audio is never sent out<small>Speech recognition and translation both run on your device</small>"],
-  ["Price", "Free 10-day trial · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>Prepaid in VND by VietQR from a Vietnamese bank, no auto-renewal</small>"],
+  ["Price", "Free 10-day trial · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>Prepaid by VietQR (VND) or international card (USD), no auto-renewal</small>"],
   ["Provider", "Đỗ Tiến Phong<small>Support: support@aitranslator.vn</small>"],
 ])}</div>
 </div></section>
@@ -200,9 +200,9 @@
 </div></section>
 
 <section class="section" id="pricing"><div class="container">
-${sectionHead({ eyebrow: "Pricing", title: "Four simple plans, prepaid with VietQR", text: "No auto-renewal, no recurring billing, no surprises on your bill.", center: true })}
+${sectionHead({ eyebrow: "Pricing", title: "Four simple plans, prepaid by VietQR or card", text: "No auto-renewal, no recurring billing, no surprises on your bill.", center: true })}
 ${plansGrid("en", { ctaLabel: "Download", freeLabel: "Install and try free" })}
-<p class="disclaimer">Prices are in Vietnamese dong (VND). Payment is by bank transfer from a Vietnamese bank (VietQR) only; international cards are not accepted yet.</p>
+<p class="disclaimer">VND prices are paid by VietQR from a Vietnamese bank; USD prices are paid by international card and exclude tax (if any).</p>
 <p class="center-text reveal"><a class="btn btn-ghost" href="/en/pricing/">Compare the plans in detail ${icon("arrow-right")}</a></p>
 </div></section>
 
```

- [ ] **Step 5: Thêm kiểu cho dòng nhỏ trong ô bảng so sánh**

**Sửa `website/src/assets/site.css`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/assets/site.css
+++ b/website/src/assets/site.css
@@ -334,6 +334,7 @@
 tbody th { font-weight: 600; color: var(--ink); background: transparent; }
 td .yes { color: var(--ok); font-weight: 700; } td .no { color: var(--ink-3); }
 .compare th:first-child, .compare td:first-child { position: sticky; left: 0; background: var(--surface); }
+.compare td small { display: block; color: var(--ink-3); font-weight: 400; }
 
 /* ---------- FAQ ---------- */
 .faq { display: grid; gap: 10px; }
```

- [ ] **Step 6: Chạy toàn bộ test (xanh)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 84`, `ℹ pass 82`, `ℹ fail 0`, `ℹ skipped 2`. (Xem bằng mắt các thay đổi này ở Task 8.)

- [ ] **Step 7: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- website | wc -l`
Expected: `10`.

---

### Task 4: Hướng dẫn mua gói, mục lục hướng dẫn và Hỏi đáp

**Files:**
- Modify: `website/src/content/vi/guide-license.mjs`, `website/src/content/en/guide-license.mjs`, `website/src/content/vi/guide.mjs`, `website/src/content/en/guide.mjs`, `website/src/content/vi/faq.mjs`, `website/src/content/en/faq.mjs`
- Test: `website/test/site.test.mjs`

Hướng dẫn mua gói (HowTo JSON-LD, bảng thông tin, các bước, đoạn cuối, mục sự cố) mô tả cả hai cách trả và **trích đúng chữ trên màn hình Nâng cấp của app**: "Cách thanh toán", "Chuyển khoản VietQR (VND)", "Thẻ quốc tế (USD)", "Thanh toán trong trình duyệt", "Hoàn tất thanh toán trong trình duyệt", "Mở lại trang thanh toán", "Đang chờ thanh toán…" (và bản tiếng Anh). Test thứ hai đọc các khóa i18n đó ở `src/i18n/{vi,en}.ts` (kế hoạch 03) và đòi hướng dẫn có đúng chuỗi. Mục lục hướng dẫn và Hỏi đáp nêu cả hai cách trả.

- [ ] **Step 1: Viết test**

**Sửa `website/test/site.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/test/site.test.mjs
+++ b/website/test/site.test.mjs
@@ -399,6 +399,44 @@
   assert.deepEqual(errors, []);
 });
 
+test("hướng dẫn mua gói và hỏi đáp nêu cả hai cách trả, giá USD và trang thanh toán của Creem", () => {
+  const need = {
+    "/huong-dan/mua-va-kich-hoat-key/": ["VietQR", "thẻ quốc tế", "Creem", "3,99 USD", "21,99 USD", "39,99 USD", "chưa gồm thuế"],
+    "/en/guide/buy-and-activate/": ["VietQR", "international card", "Creem", "$3.99", "$21.99", "$39.99", "excluding tax"],
+    "/cau-hoi-thuong-gap/": ["thẻ quốc tế", "Creem", "USD"],
+    "/en/faq/": ["international card", "Creem", "USD"],
+    "/huong-dan/": ["VietQR hoặc thẻ quốc tế"],
+    "/en/guide/": ["VietQR or an international card"],
+  };
+  const errors = [];
+  for (const [urlPath, needles] of Object.entries(need)) {
+    const text = textOf(htmlByPath.get(urlPath));
+    for (const n of needles) if (!text.includes(n)) errors.push(`${urlPath}: thiếu "${n}"`);
+  }
+  assert.deepEqual(errors, []);
+});
+
+test("hướng dẫn mua gói trích đúng chữ trên màn hình Nâng cấp của app (từ điển i18n vi và en)", async () => {
+  // Chữ nút và nhãn trong hướng dẫn phải khớp từ điển của app, để người đọc tìm thấy đúng thứ họ thấy trên màn hình.
+  const dict = async (lang) => {
+    const raw = await readFile(path.join(ROOT, "..", "src", "i18n", `${lang}.ts`), "utf8");
+    const out = {};
+    for (const m of raw.matchAll(/^ {2}"([\w.]+)": ("(?:[^"\\]|\\.)*"),$/gm)) out[m[1]] = JSON.parse(m[2]);
+    return out;
+  };
+  const keys = ["upgrade.method", "upgrade.method.vnd", "upgrade.method.usd", "upgrade.payCard", "upgrade.browser.title", "upgrade.reopen", "upgrade.order.waitingCard"];
+  const errors = [];
+  for (const [lang, urlPath] of [["vi", "/huong-dan/mua-va-kich-hoat-key/"], ["en", "/en/guide/buy-and-activate/"]]) {
+    const d = await dict(lang);
+    const text = textOf(htmlByPath.get(urlPath));
+    for (const k of keys) {
+      if (!d[k]) errors.push(`${lang}: không đọc được khóa ${k} của từ điển app`);
+      else if (!text.includes(d[k])) errors.push(`${urlPath}: không trích "${d[k]}" (${k})`);
+    }
+  }
+  assert.deepEqual(errors, []);
+});
+
 test("JSON-LD của trang giá liệt kê đủ Offer: bốn Offer VND (kể cả 6 Months 269000 ₫ trong 180 ngày) và ba Offer USD", () => {
   const errors = [];
   for (const urlPath of ["/bang-gia/", "/en/pricing/"]) {
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/site.test.mjs 2>&1 | grep -E "^✖ [^f]|^ℹ (tests|pass|fail)"`
Expected: FAIL hai test: `hướng dẫn mua gói và hỏi đáp nêu cả hai cách trả, giá USD và trang thanh toán của Creem` (18 dòng thiếu, như `/huong-dan/mua-va-kich-hoat-key/: thiếu "Creem"`) và `hướng dẫn mua gói trích đúng chữ trên màn hình Nâng cấp của app (từ điển i18n vi và en)` (14 dòng, như `/huong-dan/mua-va-kich-hoat-key/: không trích "Cách thanh toán" (upgrade.method)`); `ℹ tests 33`, `ℹ pass 31`, `ℹ fail 2`. Nếu dòng `không đọc được khóa upgrade.… của từ điển app` hiện ra thì kế hoạch 03 (Task 5) chưa áp đủ.

- [ ] **Step 3: Sửa hướng dẫn mua gói**

**Sửa `website/src/content/vi/guide-license.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/guide-license.mjs
+++ b/website/src/content/vi/guide-license.mjs
@@ -23,23 +23,23 @@
   path: "/huong-dan/mua-va-kich-hoat-key/",
   title: "Mua gói, kích hoạt key, đổi máy: hướng dẫn",
   description:
-    "Cách mua Monthly, 6 Months hoặc Yearly bằng VietQR trong app, nhập key từ email, đổi máy, gia hạn và đổi gói, điều kiện hoàn tiền và cách xử lý khi key bị khóa.",
+    "Cách mua Monthly, 6 Months hoặc Yearly bằng VietQR hoặc thẻ quốc tế trong app, nhập key, đổi máy, gia hạn, đổi gói, hoàn tiền và xử lý key bị khóa.",
   breadcrumbs: crumbs,
   type: "article",
   schemaType: "TechArticle",
   published: "2026-10-08",
-  modified: "2026-10-13",
-  llm: "Hướng dẫn mua gói Monthly, 6 Months hoặc Yearly bằng VietQR trong app, nhận và nhập key, mất key, mỗi key một máy và cách đổi máy, ngoại tuyến 14 ngày, gia hạn, đổi gói, điều kiện hoàn tiền.",
+  modified: "2026-10-14",
+  llm: "Hướng dẫn mua gói Monthly, 6 Months hoặc Yearly bằng VietQR hoặc thẻ quốc tế trong app, nhận và nhập key, mất key, mỗi key một máy và cách đổi máy, ngoại tuyến 14 ngày, gia hạn, đổi gói, điều kiện hoàn tiền.",
   llmTitle: "Mua gói, kích hoạt key và đổi máy trong AI Translator",
   schema: [
     howTo({
       name: "Mua gói và kích hoạt AI Translator",
-      description: "Mua gói Monthly, 6 Months hoặc Yearly bằng VietQR trong app và kích hoạt key trên máy của bạn.",
+      description: "Mua gói Monthly, 6 Months hoặc Yearly bằng VietQR hoặc thẻ quốc tế trong app và kích hoạt key trên máy của bạn.",
       totalTime: "PT10M",
       steps: [
         { name: "Mở Nâng cấp Pro", text: "Bấm Nâng cấp Pro ở thanh bên để xem bốn gói và chọn Monthly, 6 Months hoặc Yearly." },
-        { name: "Nhập email nhận key", text: "Nhập email, tick ô đồng ý lưu email để gửi và khôi phục key, rồi bấm Tạo mã thanh toán." },
-        { name: "Quét mã VietQR", text: "Quét mã bằng app ngân hàng Việt Nam trong 15 phút hoặc bấm Mở trang thanh toán." },
+        { name: "Chọn cách trả và nhập email nhận key", text: "Chọn Cách thanh toán (VietQR bằng VND hoặc thẻ quốc tế bằng USD), nhập email, tick ô đồng ý lưu email để gửi và khôi phục key, rồi bấm Tạo mã thanh toán hoặc Thanh toán trong trình duyệt." },
+        { name: "Trả tiền", text: "VietQR: quét mã bằng app ngân hàng Việt Nam trong 15 phút hoặc bấm Mở trang thanh toán. Thẻ quốc tế: trả trên trang thanh toán của Creem mà app tự mở trong trình duyệt." },
         { name: "Kích hoạt", text: "App tự kích hoạt khi nhận được tiền. Nếu cần, mở Cài đặt › Bản quyền, dán key trong email vào ô Nhập license key và bấm Kích hoạt." },
       ],
     }),
@@ -48,7 +48,7 @@
 ${pageHero({
   crumbs,
   title: "Mua gói, kích hoạt key và đổi máy",
-  lead: "Bạn mua gói AI Translator ngay trong app: chọn Monthly, 6 Months hoặc Yearly, quét mã VietQR, rồi nhận key qua email; app cũng tự kích hoạt gói trên máy đang dùng. Mỗi key chỉ dùng trên một máy; muốn chuyển máy, hãy gỡ kích hoạt ở máy cũ rồi nhập key ở máy mới.",
+  lead: "Bạn mua gói AI Translator ngay trong app: chọn Monthly, 6 Months hoặc Yearly, trả bằng VietQR hoặc thẻ quốc tế, rồi nhận key qua email; app cũng tự kích hoạt gói trên máy đang dùng. Mỗi key chỉ dùng trên một máy; muốn chuyển máy, hãy gỡ kích hoạt ở máy cũ rồi nhập key ở máy mới.",
   meta: `<span>Cập nhật {{updated}}</span>`,
 })}
 
@@ -58,8 +58,8 @@
   tocTitle: "Trong bài này",
   body: `
 ${facts([
-  ["Gói", "Monthly 50.000 ₫ (30 ngày, 50 giờ)<small>6 Months 269.000 ₫ (180 ngày, 100 giờ mỗi 30 ngày)</small><small>Yearly 500.000 ₫ (365 ngày, không giới hạn)</small>"],
-  ["Thanh toán", "VietQR, ngân hàng Việt Nam, VND<small>Không thẻ quốc tế, không tự gia hạn</small>"],
+  ["Gói", "Monthly 50.000 ₫ hoặc 3,99 USD (30 ngày, 50 giờ)<small>6 Months 269.000 ₫ hoặc 21,99 USD (180 ngày, 100 giờ mỗi 30 ngày)</small><small>Yearly 500.000 ₫ hoặc 39,99 USD (365 ngày, không giới hạn)</small>"],
+  ["Thanh toán", "VietQR (ngân hàng Việt Nam, VND) hoặc thẻ quốc tế (USD, qua Creem)<small>Giá USD chưa gồm thuế · không tự gia hạn</small>"],
   ["Số máy", "Mỗi key một máy"],
   ["Ngoại tuyến", "Tối đa 14 ngày giữa hai lần kiểm tra bản quyền"],
   ["Hoàn tiền", "Đã thanh toán thì không hoàn lại, trừ các trường hợp trong Điều khoản<small>Gửi yêu cầu trong 7 ngày kể từ ngày thanh toán</small>"],
@@ -69,14 +69,16 @@
 <ol>
 <li>Bấm <strong>Nâng cấp Pro</strong> ở thanh bên. Màn hình hiện đủ bốn gói, gói đang dùng có nhãn “Đang dùng”. Mua gói cần kết nối mạng.</li>
 <li>Bấm vào thẻ <strong>Monthly</strong>, <strong>6 Months</strong> hoặc <strong>Yearly</strong> (giá ghi chữ lớn, như “50.000 đ / 30 ngày”); thẻ đã chọn có viền xanh.</li>
-<li>Nhập <strong>Email nhận key</strong>, tick ô đồng ý để app lưu email này nhằm gửi và khôi phục key, rồi bấm <strong>Tạo mã thanh toán</strong>.</li>
-<li>Quét mã VietQR bằng app ngân hàng, hoặc bấm <strong>Mở trang thanh toán</strong> (PayOS, mở trong trình duyệt). Mã dùng được 15 phút; giờ hết hạn ghi trên màn hình.</li>
-<li>Chờ app xác nhận (app hỏi trạng thái đơn mỗi 3 giây): “Đã nhận tiền. Gói đã có hiệu lực trên máy này; key đã gửi vào email.”</li>
+<li>Chọn <strong>Cách thanh toán</strong> ở đầu màn hình: <strong>Chuyển khoản VietQR (VND)</strong> hoặc <strong>Thẻ quốc tế (USD)</strong>. App chọn sẵn theo nước của bạn và bạn đổi được; giá trên các thẻ đổi theo lựa chọn (giá USD chưa gồm thuế). Mục này chỉ hiện khi cả hai cách trả đều đang bán.</li>
+<li>Nhập <strong>Email nhận key</strong>, tick ô đồng ý để app lưu email này nhằm gửi và khôi phục key, rồi bấm <strong>Tạo mã thanh toán</strong> (VietQR) hoặc <strong>Thanh toán trong trình duyệt</strong> (thẻ quốc tế).</li>
+<li><strong>VietQR:</strong> quét mã bằng app ngân hàng, hoặc bấm <strong>Mở trang thanh toán</strong> (PayOS, mở trong trình duyệt). Mã dùng được 15 phút; giờ hết hạn ghi trên màn hình.</li>
+<li><strong>Thẻ quốc tế:</strong> app tự mở trang thanh toán của Creem trong trình duyệt và hiện thẻ <strong>Hoàn tất thanh toán trong trình duyệt</strong> kèm mã đơn. Trả bằng thẻ rồi quay lại app; nếu trình duyệt không mở, bấm <strong>Mở lại trang thanh toán</strong>. Đơn được giữ 30 phút.</li>
+<li>Chờ app xác nhận (app hỏi trạng thái đơn vài giây một lần; với thẻ, dòng trạng thái ghi “Đang chờ thanh toán…”): “Đã nhận tiền. Gói đã có hiệu lực trên máy này; key đã gửi vào email.”</li>
 </ol>
 ${appShot({
   slug: "app-upgrade",
   lang: "vi",
-  alt: "Màn hình Nâng cấp: bốn gói Free, Monthly, 6 Months và Yearly với hạn mức và giá, ô Email nhận key, ô đồng ý và nút Tạo mã thanh toán",
+  alt: "Màn hình Nâng cấp: nhóm Cách thanh toán (VietQR hoặc thẻ quốc tế), bốn gói Free, Monthly, 6 Months và Yearly với hạn mức và giá, ô Email nhận key, ô đồng ý và nút Tạo mã thanh toán",
   caption: "Màn hình Nâng cấp.",
 })}
 ${appShot({
@@ -85,7 +87,7 @@
   alt: "Mã VietQR hiện trong app kèm mã đơn, giờ hết hạn của mã, nút Mở trang thanh toán và dòng trạng thái đang chờ chuyển khoản",
   caption: "Mã VietQR trong app, kèm mã đơn.",
 })}
-<p>Chỉ nhận chuyển khoản từ ngân hàng Việt Nam, bằng VND, qua PayOS. Giá và hạn mức xem ở <a href="/bang-gia/">bảng giá</a>.</p>
+<p>VietQR chỉ nhận chuyển khoản từ ngân hàng Việt Nam, bằng VND, qua PayOS. Thẻ quốc tế tính bằng USD, chưa gồm thuế (nếu có) và do Creem xử lý: sao kê thẻ có thể ghi tên Creem. Giá và hạn mức xem ở <a href="/bang-gia/">bảng giá</a>.</p>
 
 <h2 id="nhap-key">Nhận key qua email và nhập key</h2>
 <p>Key được gửi từ no-reply@mail.aitranslator.vn tới email bạn đã nhập. Hãy giữ thư này để cài lại hoặc kích hoạt máy khác; không thấy thư thì kiểm hộp thư rác. Key gồm 7 nhóm 4 ký tự: <code>XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX</code>.</p>
@@ -136,8 +138,9 @@
 <ul>
 <li>“Số tiền nhận được ít hơn giá gói. Chuyển bù cho đơn … trong 24 giờ, hoặc liên hệ hỗ trợ kèm mã đơn này.” Chuyển bù phần thiếu, hoặc liên hệ.</li>
 <li>“Đã nhận tiền nhưng chưa kích hoạt được key trên máy này…” Nhập key trong email ở Cài đặt › Bản quyền.</li>
+<li>Đã trả bằng thẻ mà app vẫn ghi “Đang chờ thanh toán…”: chờ vài phút (máy chủ của chúng tôi hỏi lại Creem định kỳ), rồi kiểm email xem đã có key chưa. Vẫn không có thì liên hệ hỗ trợ kèm mã đơn và biên lai của Creem.</li>
 </ul>
-<p>Đã thanh toán thì không hoàn lại, trừ khi lỗi từ phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác. Gửi yêu cầu trong 7 ngày kể từ ngày thanh toán tới support@aitranslator.vn kèm <strong>mã đơn</strong> (hiện ở màn hình Nâng cấp dạng “Đơn …”); đổi gói không được hoàn tiền. Chưa có hóa đơn điện tử; nếu bạn cần chứng từ, hãy liên hệ hỗ trợ để trao đổi. Chi tiết trong <a href="/dieu-khoan/">Điều khoản sử dụng</a> và <a href="/lien-he/">trang liên hệ</a>.</p>
+<p>Đã thanh toán thì không hoàn lại, trừ khi lỗi từ phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác. Gửi yêu cầu trong 7 ngày kể từ ngày thanh toán tới support@aitranslator.vn kèm <strong>mã đơn</strong> (hiện ở màn hình Nâng cấp dạng “Đơn …”); đổi gói không được hoàn tiền. Khoản trả bằng thẻ quốc tế do Creem xử lý: Creem gửi biên lai tới email bạn nhập và cũng có thể hoàn tiền theo điều khoản của họ; đơn đã hoàn tiền thì license của đơn đó có thể bị thu hồi. Chúng tôi chưa xuất hóa đơn điện tử; nếu bạn cần chứng từ, hãy liên hệ hỗ trợ để trao đổi. Chi tiết trong <a href="/dieu-khoan/">Điều khoản sử dụng</a> và <a href="/lien-he/">trang liên hệ</a>.</p>
 `,
 })}
 ${docNav(
```

**Sửa `website/src/content/en/guide-license.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/guide-license.mjs
+++ b/website/src/content/en/guide-license.mjs
@@ -23,23 +23,23 @@
   path: "/en/guide/buy-and-activate/",
   title: "Buy a plan, activate your key, switch computers",
   description:
-    "Buy Monthly, 6 Months or Yearly with VietQR in the app, enter your emailed key, switch computers, renew or change plan, check the refund terms and fix a locked key.",
+    "Buy Monthly, 6 Months or Yearly by VietQR or international card in the app, enter your key, switch computers, renew, change plan, check refunds and fix a locked key.",
   breadcrumbs: crumbs,
   type: "article",
   schemaType: "TechArticle",
   published: "2026-10-08",
-  modified: "2026-10-13",
-  llm: "How to buy a Monthly, 6 Months or Yearly plan with VietQR inside the app, receive and enter the key, recover a lost key, one key per computer and how to switch computers, 14-day offline use, renewing, changing plan and the refund terms.",
+  modified: "2026-10-14",
+  llm: "How to buy a Monthly, 6 Months or Yearly plan with VietQR or an international card inside the app, receive and enter the key, recover a lost key, one key per computer and how to switch computers, 14-day offline use, renewing, changing plan and the refund terms.",
   llmTitle: "Buy a plan, activate your key and switch computers in AI Translator",
   schema: [
     howTo({
       name: "Buy a plan and activate AI Translator",
-      description: "Buy the Monthly, 6 Months or Yearly plan with VietQR inside the app and activate the key on your computer.",
+      description: "Buy the Monthly, 6 Months or Yearly plan with VietQR or an international card inside the app and activate the key on your computer.",
       totalTime: "PT10M",
       steps: [
         { name: "Open Upgrade to Pro", text: "Click Upgrade to Pro in the sidebar to see the four plans, then choose Monthly, 6 Months or Yearly." },
-        { name: "Enter the email for your key", text: "Enter your email, tick the box agreeing that the app stores it to send and recover your key, then click Create payment QR code." },
-        { name: "Scan the VietQR code", text: "Scan the code with a Vietnamese bank app within 15 minutes, or click Open payment page." },
+        { name: "Choose how to pay and enter the email for your key", text: "Choose the Payment method (VietQR in VND or international card in USD), enter your email, tick the box agreeing that the app stores it to send and recover your key, then click Create payment QR code or Pay in your browser." },
+        { name: "Pay", text: "VietQR: scan the code with a Vietnamese bank app within 15 minutes, or click Open payment page. International card: pay on the Creem payment page that the app opens in your browser." },
         { name: "Activate", text: "The app activates the plan when payment arrives. If needed, open Settings › License, paste the key from your email into the License key box and click Activate." },
       ],
     }),
@@ -48,7 +48,7 @@
 ${pageHero({
   crumbs,
   title: "Buy a plan, activate your key and switch computers",
-  lead: "You buy an AI Translator plan inside the app: choose Monthly, 6 Months or Yearly, scan a VietQR code, and your key arrives by email while the app activates the plan on the computer you are using. Each key works on one computer. To move to another computer, deactivate the old one and enter the key on the new one.",
+  lead: "You buy an AI Translator plan inside the app: choose Monthly, 6 Months or Yearly, pay by VietQR or international card, and your key arrives by email while the app activates the plan on the computer you are using. Each key works on one computer. To move to another computer, deactivate the old one and enter the key on the new one.",
   meta: `<span>Updated {{updated}}</span>`,
 })}
 
@@ -58,8 +58,8 @@
   tocTitle: "On this page",
   body: `
 ${facts([
-  ["Plans", "Monthly 50,000 ₫ (30 days, 50 hours)<small>6 Months 269,000 ₫ (180 days, 100 hours per 30 days)</small><small>Yearly 500,000 ₫ (365 days, unlimited)</small>"],
-  ["Payment", "VietQR, Vietnamese banks, VND<small>No international cards, no auto-renewal</small>"],
+  ["Plans", "Monthly 50,000 ₫ or $3.99 (30 days, 50 hours)<small>6 Months 269,000 ₫ or $21.99 (180 days, 100 hours per 30 days)</small><small>Yearly 500,000 ₫ or $39.99 (365 days, unlimited)</small>"],
+  ["Payment", "VietQR (Vietnamese banks, VND) or international card (USD, through Creem)<small>USD prices exclude tax · no auto-renewal</small>"],
   ["Computers", "One computer per key"],
   ["Offline", "Up to 14 days between license checks"],
   ["Refunds", "Payments are not refundable except in the cases set out in the Terms<small>Send a request within 7 days of payment</small>"],
@@ -69,14 +69,16 @@
 <ol>
 <li>Click <strong>Upgrade to Pro</strong> in the sidebar. The screen lists all four plans; yours is marked “Current”. Buying needs an internet connection.</li>
 <li>Click the <strong>Monthly</strong>, <strong>6 Months</strong> or <strong>Yearly</strong> card (the price is in large type, e.g. “50.000 đ / 30 days”); the selected card gets a blue outline.</li>
-<li>Enter your <strong>Email to receive your key</strong>, tick the box that lets the app store this email to send and recover your key, then click <strong>Create payment QR code</strong>.</li>
-<li>Scan the VietQR code with your banking app, or click <strong>Open payment page</strong> (PayOS, in your browser). The code works for 15 minutes; its expiry time is on screen.</li>
-<li>Wait for the app to confirm (it checks the order every 3 seconds): “Payment received. Your plan is active on this computer, and the key is in your email.”</li>
+<li>Choose the <strong>Payment method</strong> at the top of the screen: <strong>VietQR bank transfer (VND)</strong> or <strong>International card (USD)</strong>. The app preselects one from your country and you can change it; the prices on the cards follow your choice (USD prices exclude tax). The choice only appears when both ways to pay are on sale.</li>
+<li>Enter your <strong>Email to receive your key</strong>, tick the box that lets the app store this email to send and recover your key, then click <strong>Create payment QR code</strong> (VietQR) or <strong>Pay in your browser</strong> (international card).</li>
+<li><strong>VietQR:</strong> scan the code with your banking app, or click <strong>Open payment page</strong> (PayOS, in your browser). The code works for 15 minutes; its expiry time is on screen.</li>
+<li><strong>International card:</strong> the app opens the Creem payment page in your browser by itself and shows a <strong>Finish paying in your browser</strong> card with the order number. Pay by card, then return to the app; if the browser did not open, click <strong>Reopen payment page</strong>. The order is kept for 30 minutes.</li>
+<li>Wait for the app to confirm (it checks the order every few seconds; for a card the status line says “Waiting for your payment…”): “Payment received. Your plan is active on this computer, and the key is in your email.”</li>
 </ol>
 ${appShot({
   slug: "app-upgrade",
   lang: "en",
-  alt: "The Upgrade screen: the Free, Monthly, 6 Months and Yearly plans with their quota and price, the Email to receive your key box, the agreement tick box and the Create payment QR code button",
+  alt: "The Upgrade screen: the Payment method choice (VietQR or international card), the Free, Monthly, 6 Months and Yearly plans with their quota and price, the Email to receive your key box, the agreement tick box and the Create payment QR code button",
   caption: "The Upgrade screen.",
 })}
 ${appShot({
@@ -85,7 +87,7 @@
   alt: "A VietQR code drawn inside the app with the order number, the code’s expiry time, an Open payment page button and a status line waiting for the transfer",
   caption: "The VietQR code in the app, with the order number.",
 })}
-<p>Payment is by bank transfer from a Vietnamese bank, in VND, through PayOS only. See the <a href="/en/pricing/">pricing page</a> for prices and quotas.</p>
+<p>VietQR is bank transfer from a Vietnamese bank, in VND, through PayOS. International cards are charged in USD, excluding tax (if any), and are handled by Creem: your card statement may show Creem’s name. See the <a href="/en/pricing/">pricing page</a> for prices and quotas.</p>
 
 <h2 id="enter-key">Get your key by email and enter it</h2>
 <p>The key is sent from no-reply@mail.aitranslator.vn to the email you entered. Keep that email for reinstalling or activating another computer; if it is missing, check your spam folder. A key has 7 groups of 4 characters: <code>XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX</code>.</p>
@@ -136,8 +138,9 @@
 <ul>
 <li>“The amount received is less than the price. Transfer the rest for order … within 24 hours, or contact support with this order number.” Transfer the difference, or contact support.</li>
 <li>“Payment received, but the key could not be activated here…” Enter the key from your email in Settings › License.</li>
+<li>You paid by card but the app still says “Waiting for your payment…”: wait a few minutes (our server asks Creem again on a schedule), then check your email for the key. If there is still none, contact support with the order number and your Creem receipt.</li>
 </ul>
-<p>Payments are not refundable, except where our fault leaves you unable to use the plan you bought and we cannot fix it within a reasonable time, or where the law says otherwise. Send a request within 7 days of the payment date to support@aitranslator.vn with your <strong>order number</strong> (shown on the Upgrade screen as “Order …”); changing plan is not refundable. E-invoices are not available yet; if you need a document, contact support to discuss it. Details are in the <a href="/en/terms/">Terms of use</a> and on the <a href="/en/contact/">contact page</a>.</p>
+<p>Payments are not refundable, except where our fault leaves you unable to use the plan you bought and we cannot fix it within a reasonable time, or where the law says otherwise. Send a request within 7 days of the payment date to support@aitranslator.vn with your <strong>order number</strong> (shown on the Upgrade screen as “Order …”); changing plan is not refundable. Card payments are handled by Creem: Creem emails a receipt to the address you entered and may also refund under its own terms; the license of a refunded order may then be revoked. We do not issue e-invoices yet; if you need a document, contact support to discuss it. Details are in the <a href="/en/terms/">Terms of use</a> and on the <a href="/en/contact/">contact page</a>.</p>
 `,
 })}
 ${docNav(
```

- [ ] **Step 4: Sửa mục lục hướng dẫn và Hỏi đáp**

**Sửa `website/src/content/vi/guide.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/guide.mjs
+++ b/website/src/content/vi/guide.mjs
@@ -16,7 +16,7 @@
     "Chín bài hướng dẫn từng bước: cài trên macOS và Windows, cấp quyền ghi âm, phím tắt, từ điển thuật ngữ, xuất bản chép lời, mua key và sửa lỗi thường gặp.",
   schemaType: "CollectionPage",
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   llm: "Mục lục chín bài hướng dẫn sử dụng AI Translator: bắt đầu nhanh, cài đặt macOS, cài đặt Windows, cấp quyền ghi âm trên macOS, thanh phụ đề và phím tắt, từ điển thuật ngữ, lịch sử và xuất file, mua và kích hoạt key, khắc phục sự cố.",
   llmTitle: "Hướng dẫn sử dụng AI Translator",
   body: () => `
@@ -52,7 +52,7 @@
 <section class="section-tight"><div class="container">
 ${sectionHead({ eyebrow: "Mua gói và hỗ trợ", title: "Gói, key và khi có trục trặc" })}
 <div class="grid grid-2">
-${linkCard({ href: "/huong-dan/mua-va-kich-hoat-key/", icon: "key", title: "Mua gói, kích hoạt key và đổi máy", text: "Mua Monthly, 6 Months hoặc Yearly bằng VietQR trong app, nhập key, đổi máy, gia hạn và lấy lại key đã mất.", more: MORE })}
+${linkCard({ href: "/huong-dan/mua-va-kich-hoat-key/", icon: "key", title: "Mua gói, kích hoạt key và đổi máy", text: "Mua Monthly, 6 Months hoặc Yearly bằng VietQR hoặc thẻ quốc tế trong app, nhập key, đổi máy, gia hạn và lấy lại key đã mất.", more: MORE })}
 ${linkCard({ href: "/huong-dan/khac-phuc-su-co/", icon: "support", title: "Khắc phục sự cố", text: "Không có phụ đề, hết hạn mức, key bị khóa, tải model lỗi: nguyên nhân và cách xử lý từng trường hợp.", more: MORE })}
 </div>
 </div></section>
```

**Sửa `website/src/content/en/guide.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/guide.mjs
+++ b/website/src/content/en/guide.mjs
@@ -16,7 +16,7 @@
     "Nine step-by-step guides: install on macOS or Windows, recording permission, subtitle bar and shortcuts, glossary, history and export, buying a key, troubleshooting.",
   schemaType: "CollectionPage",
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   llm: "Index of nine AI Translator user guides: quick start, macOS installation, Windows installation, macOS audio permission, subtitle bar and shortcuts, glossary, history and export, buying and activating a key, troubleshooting.",
   llmTitle: "AI Translator user guides",
   body: () => `
@@ -52,7 +52,7 @@
 <section class="section-tight"><div class="container">
 ${sectionHead({ eyebrow: "Plans and support", title: "Plans, keys and when something goes wrong" })}
 <div class="grid grid-2">
-${linkCard({ href: "/en/guide/buy-and-activate/", icon: "key", title: "Buy a plan, activate your key and switch computers", text: "Buy Monthly, 6 Months or Yearly with VietQR inside the app, enter your key, switch computers, renew and recover a lost key.", more: MORE })}
+${linkCard({ href: "/en/guide/buy-and-activate/", icon: "key", title: "Buy a plan, activate your key and switch computers", text: "Buy Monthly, 6 Months or Yearly with VietQR or an international card inside the app, enter your key, switch computers, renew and recover a lost key.", more: MORE })}
 ${linkCard({ href: "/en/guide/troubleshooting/", icon: "support", title: "Troubleshooting", text: "No subtitles, quota used up, a locked key, a failed model download: the cause and the fix for each.", more: MORE })}
 </div>
 </div></section>
```

**Sửa `website/src/content/vi/faq.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/faq.mjs
+++ b/website/src/content/vi/faq.mjs
@@ -165,8 +165,8 @@
         a: `<p>Chỉ tính phần tiếng nói đã được dịch xong, theo độ dài tiếng nói. Thời gian im lặng, câu đã ở đúng ngôn ngữ bạn muốn đọc và đoạn chưa dịch được không bị tính. Hạn mức tính riêng cho từng máy; app nhắc khi còn dưới 5 phút.</p>`,
       },
       {
-        q: "Tôi trả tiền bằng cách nào? Có Visa hoặc PayPal không?",
-        a: `<p>Chưa có Visa hay PayPal. Hiện chỉ nhận chuyển khoản từ ngân hàng Việt Nam bằng VND qua VietQR (cổng PayOS). App vẽ mã QR ngay trong màn hình Nâng cấp, mã dùng được trong 15 phút; khi PayOS xác nhận đã nhận tiền, app tự kích hoạt gói và key được gửi vào email của bạn. Chưa có thanh toán định kỳ và chưa có hóa đơn điện tử.</p>`,
+        q: "Tôi trả tiền bằng cách nào? Có thẻ quốc tế không?",
+        a: `<p>Có hai cách, chọn ngay trong màn hình Nâng cấp: <strong>chuyển khoản VietQR bằng VND</strong> (từ ngân hàng Việt Nam, qua cổng PayOS; mã QR vẽ ngay trong app, dùng được 15 phút) hoặc <strong>thẻ quốc tế bằng USD</strong> (trang thanh toán của Creem mở trong trình duyệt; Monthly 3,99 USD, 6 Months 21,99 USD, Yearly 39,99 USD, chưa gồm thuế). Khi cổng thanh toán xác nhận đã nhận tiền, app tự kích hoạt gói và key được gửi vào email của bạn. Chưa có thanh toán định kỳ và chưa có hóa đơn điện tử do chúng tôi xuất.</p>`,
       },
       {
         q: "Gói có tự gia hạn không? Hết hạn thì sao?",
@@ -174,7 +174,7 @@
       },
       {
         q: "Có hoàn tiền không?",
-        a: `<p>Đã thanh toán thì không hoàn lại, trừ khi lỗi do phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác. Hãy gửi yêu cầu trong 7 ngày kể từ ngày thanh toán tới support@aitranslator.vn kèm mã đơn. Đổi gói không được hoàn tiền. Chi tiết trong <a href="/dieu-khoan/">Điều khoản sử dụng</a>.</p>`,
+        a: `<p>Đã thanh toán thì không hoàn lại, trừ khi lỗi do phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác. Hãy gửi yêu cầu trong 7 ngày kể từ ngày thanh toán tới support@aitranslator.vn kèm mã đơn. Đổi gói không được hoàn tiền. Khoản trả bằng thẻ quốc tế do Creem xử lý, nên Creem cũng có thể hoàn tiền theo điều khoản của họ; đơn đã hoàn tiền thì license của đơn đó có thể bị thu hồi. Chi tiết trong <a href="/dieu-khoan/">Điều khoản sử dụng</a>.</p>`,
       },
       {
         q: "Tôi dùng được key trên mấy máy? Chuyển sang máy khác thế nào?",
@@ -231,7 +231,7 @@
   description:
     "Giải đáp ngắn gọn về AI Translator: dùng với Zoom, Teams, Meet, ngôn ngữ, chạy offline, quyền riêng tư, yêu cầu máy, các gói, thanh toán và việc dùng hằng ngày.",
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   schema: [faqPage(ALL.map((f) => ({ q: f.q, a: toText(f.a) })))],
   llm: "Các câu hỏi thường gặp: tổng quan, ngôn ngữ và chất lượng, riêng tư và dữ liệu, cài đặt và yêu cầu máy, gói và thanh toán, dùng hằng ngày.",
   llmTitle: "Câu hỏi thường gặp về AI Translator",
```

**Sửa `website/src/content/en/faq.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/faq.mjs
+++ b/website/src/content/en/faq.mjs
@@ -165,8 +165,8 @@
         a: `<p>Only speech that has been translated is counted, by the length of the speech. Silence, sentences already in the language you want to read, and segments that could not be translated are not counted. The quota is per device, and the app warns you when less than 5 minutes remain.</p>`,
       },
       {
-        q: "How do I pay? Can I use Visa or PayPal?",
-        a: `<p>Not yet. For now we accept only bank transfers from a Vietnamese bank, in VND, through VietQR (the PayOS gateway). The app draws the QR code right on the Upgrade screen; the code works for 15 minutes, and when PayOS confirms the payment the app activates the plan and your key is emailed to you. There are no recurring payments and no e-invoices yet.</p>`,
+        q: "How do I pay? Can I use an international card?",
+        a: `<p>There are two ways, chosen right on the Upgrade screen: <strong>VietQR bank transfer in VND</strong> (from a Vietnamese bank, through the PayOS gateway; the QR code is drawn in the app and works for 15 minutes) or <strong>international card in USD</strong> (the Creem payment page opens in your browser; Monthly $3.99, 6 Months $21.99, Yearly $39.99, excluding tax). When the payment gateway confirms the payment, the app activates the plan and your key is emailed to you. There are no recurring payments and we do not issue e-invoices yet.</p>`,
       },
       {
         q: "Do plans renew automatically? What happens at expiry?",
@@ -174,7 +174,7 @@
       },
       {
         q: "Can I get a refund?",
-        a: `<p>Payments are not refundable, except when a fault on our side stops you from using the plan you bought and we cannot fix it within a reasonable time, or when the law says otherwise. Send the request within 7 days of the payment date to support@aitranslator.vn with the order code. Changing plans is not refundable. Details are in the <a href="/en/terms/">Terms of use</a>.</p>`,
+        a: `<p>Payments are not refundable, except when a fault on our side stops you from using the plan you bought and we cannot fix it within a reasonable time, or when the law says otherwise. Send the request within 7 days of the payment date to support@aitranslator.vn with the order code. Changing plans is not refundable. Card payments are handled by Creem, which may also issue refunds under its own terms; the license of a refunded order may then be revoked. Details are in the <a href="/en/terms/">Terms of use</a>.</p>`,
       },
       {
         q: "How many devices can I use a key on? How do I move to another one?",
@@ -231,7 +231,7 @@
   description:
     "Short answers about AI Translator: using it with Zoom, Teams and Meet, languages, working offline, privacy, system requirements, plans, payment and everyday use.",
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   schema: [faqPage(ALL.map((f) => ({ q: f.q, a: toText(f.a) })))],
   llm: "Frequently asked questions: overview, languages and quality, privacy and data, install and system requirements, plans and payment, everyday use.",
   llmTitle: "AI Translator frequently asked questions",
```

- [ ] **Step 5: Chạy toàn bộ test (xanh)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 86`, `ℹ pass 84`, `ℹ fail 0`, `ℹ skipped 2`.

- [ ] **Step 6: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- website | wc -l`
Expected: `16`.

---

### Task 5: Về chúng tôi, Giải pháp, Tải xuống, Tính năng, Liên hệ, Dữ liệu và bảo mật

**Files:**
- Modify: `website/src/content/{vi,en}/{about,solutions,download,features,contact,data-security}.mjs` (12 file)
- Test: `website/test/site.test.mjs`

- **Về chúng tôi:** dòng "Thanh toán" nêu hai cách; bỏ mục lộ trình "Bán ra nước ngoài, kèm thanh toán quốc tế" (không còn là việc phía trước).
- **Giải pháp:** dòng "Giá" nêu hai cách; bỏ mục "Bạn không có tài khoản ngân hàng Việt Nam" khỏi danh sách "khi nào chưa phù hợp" (không còn đúng).
- **Tải xuống:** dòng "Giá sau đó" nêu hai cách, không tự gia hạn.
- **Tính năng:** bảng "Tính năng nào ở gói nào" thêm hàng giá USD chưa gồm thuế, hàng VND ghi rõ "VietQR".
- **Liên hệ:** mục khiếu nại thanh toán nêu cả thẻ (kèm biên lai của Creem), mẫu thư có ô "Cách trả"; mục hoàn tiền nêu Creem xử lý khoản trả bằng thẻ.
- **Dữ liệu và bảo mật:** "bốn nơi" thành "năm nơi" (dòng tóm tắt, câu mở đầu, mô tả cho trợ lý AI), thêm hàng "Trang thanh toán Creem (checkout.creem.io)" (mở bằng trình duyệt, không phải trong app), email điền sẵn trang Creem, hàng "Creem (Armitage Labs OÜ, Estonia)" ở bảng bên xử lý, dòng đơn hàng có loại tiền.

- [ ] **Step 1: Viết test**

**Sửa `website/test/site.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/test/site.test.mjs
+++ b/website/test/site.test.mjs
@@ -437,6 +437,29 @@
   assert.deepEqual(errors, []);
 });
 
+test("Về chúng tôi, Giải pháp, Tải xuống, Tính năng, Liên hệ và Dữ liệu và bảo mật nêu đúng hai cách trả và Creem", () => {
+  const need = {
+    "/ve-chung-toi/": ["thẻ quốc tế bằng USD qua Creem"],
+    "/en/about/": ["international cards in USD through Creem"],
+    "/giai-phap/": ["VietQR hoặc thẻ quốc tế"],
+    "/en/solutions/": ["VietQR or international card"],
+    "/tai-xuong/": ["VietQR (VND) hoặc thẻ quốc tế (USD)"],
+    "/en/download/": ["VietQR (VND) or international card (USD)"],
+    "/tinh-nang/": ["3,99 USD", "21,99 USD", "39,99 USD"],
+    "/en/features/": ["$3.99", "$21.99", "$39.99"],
+    "/lien-he/": ["Creem", "biên lai"],
+    "/en/contact/": ["Creem", "receipt"],
+    "/bao-mat-du-lieu/": ["Đúng năm nơi", "checkout.creem.io", "Armitage Labs OÜ", "điền sẵn"],
+    "/en/data-security/": ["exactly five places", "checkout.creem.io", "Armitage Labs OÜ", "pre-fill"],
+  };
+  const errors = [];
+  for (const [urlPath, needles] of Object.entries(need)) {
+    const text = textOf(htmlByPath.get(urlPath));
+    for (const n of needles) if (!text.includes(n)) errors.push(`${urlPath}: thiếu "${n}"`);
+  }
+  assert.deepEqual(errors, []);
+});
+
 test("JSON-LD của trang giá liệt kê đủ Offer: bốn Offer VND (kể cả 6 Months 269000 ₫ trong 180 ngày) và ba Offer USD", () => {
   const errors = [];
   for (const urlPath of ["/bang-gia/", "/en/pricing/"]) {
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/site.test.mjs 2>&1 | grep -E "^✖ [^f]|^ℹ (tests|pass|fail)"`
Expected: FAIL một test: `Về chúng tôi, Giải pháp, Tải xuống, Tính năng, Liên hệ và Dữ liệu và bảo mật nêu đúng hai cách trả và Creem`, 24 dòng thiếu (như `/ve-chung-toi/: thiếu "thẻ quốc tế bằng USD qua Creem"`, `/bao-mat-du-lieu/: thiếu "Đúng năm nơi"`, `/en/data-security/: thiếu "pre-fill"`); `ℹ tests 34`, `ℹ pass 33`, `ℹ fail 1`.

- [ ] **Step 3: Sửa Về chúng tôi**

**Sửa `website/src/content/vi/about.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/about.mjs
+++ b/website/src/content/vi/about.mjs
@@ -18,7 +18,7 @@
     "AI Translator là app dịch phụ đề cuộc họp chạy offline do Đỗ Tiến Phong, một nhà phát triển cá nhân, xây dựng. Câu chuyện, nguyên tắc và trạng thái hiện tại.",
   schemaType: "AboutPage",
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   llm: "Câu chuyện hình thành, nguyên tắc sản phẩm, người làm (Đỗ Tiến Phong, nhà phát triển cá nhân), trạng thái hiện tại, các hướng đang cân nhắc (chưa cam kết), việc dùng thành phần mã nguồn mở của bên thứ ba và thông tin pháp lý.",
   llmTitle: "Về AI Translator",
   body: () => `
@@ -78,7 +78,7 @@
 <tr><th scope="row">macOS</th><td>macOS 14.2 trở lên, Apple Silicon. <a href="/tai-xuong/#cai-macos">Cài bằng một dòng lệnh trong Terminal</a>.</td></tr>
 <tr><th scope="row">Windows</th><td>Windows 10/11 64-bit (x64). <a href="/tai-xuong/#cai-windows">Cài bằng một dòng lệnh trong PowerShell</a>. Độ trễ trên Windows mới đo sơ bộ trên một laptop có GPU tích hợp (chậm hơn Mac M4 Pro).</td></tr>
 <tr><th scope="row">Ký số</th><td>macOS ký ad-hoc, chưa notarize: cài bằng dòng lệnh thì mở thẳng, còn file .dmg tải bằng trình duyệt thì lần mở đầu cần bấm Open Anyway. Windows chưa có chứng thư ký mã: cài bằng dòng lệnh thì SmartScreen không hỏi, còn file .exe tải bằng trình duyệt có thể bị SmartScreen cảnh báo (Smart App Control chế độ chặn sẽ chặn cả hai) (<a href="/huong-dan/cai-dat-windows/">cách xử lý</a>).</td></tr>
-<tr><th scope="row">Thanh toán</th><td>VietQR bằng VND qua PayOS. Chưa có thẻ quốc tế, chưa có hóa đơn điện tử.</td></tr>
+<tr><th scope="row">Thanh toán</th><td>VietQR bằng VND qua PayOS, hoặc thẻ quốc tế bằng USD qua Creem. Chưa có hóa đơn điện tử.</td></tr>
 <tr><th scope="row">Gói</th><td>Free dùng thử 10 ngày, Monthly, 6 Months, Yearly. Xem <a href="/bang-gia/">bảng giá</a>.</td></tr>
 </tbody></table></div>
 </div></section>
@@ -93,7 +93,6 @@
 <li>Thu âm thanh theo từng app trên Windows</li>
 <li>Dịch hai chiều bằng giọng nói, để giọng của bạn cũng được dịch cho người cùng họp</li>
 <li>Tóm tắt và biên bản cuộc họp</li>
-<li>Bán ra nước ngoài, kèm thanh toán quốc tế</li>
 <li>Gói doanh nghiệp cho nhiều máy</li>
 <li>Thêm ngôn ngữ cho âm thanh nguồn và bản dịch (ngoài năm ngôn ngữ hiện có)</li>
 <li>Thêm ngôn ngữ giao diện</li>
```

**Sửa `website/src/content/en/about.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/about.mjs
+++ b/website/src/content/en/about.mjs
@@ -18,7 +18,7 @@
     "AI Translator shows live translated subtitles for meetings and runs offline. Built by Đỗ Tiến Phong, an independent developer. Story, principles, current status.",
   schemaType: "AboutPage",
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   llm: "How AI Translator came about, the product principles, who builds it (Đỗ Tiến Phong, an independent developer), current status, directions under consideration (not commitments), its use of third-party open-source components and short legal information.",
   llmTitle: "About AI Translator",
   body: () => `
@@ -78,7 +78,7 @@
 <tr><th scope="row">macOS</th><td>macOS 14.2 or later, Apple Silicon. <a href="/en/download/#install-macos">Install with one command in Terminal</a>.</td></tr>
 <tr><th scope="row">Windows</th><td>Windows 10/11 64-bit (x64). <a href="/en/download/#install-windows">Install with one command in PowerShell</a>. Latency on Windows has not been measured.</td></tr>
 <tr><th scope="row">Code signing</th><td>macOS is ad-hoc signed and not notarized: it opens directly when installed with the command, but a .dmg downloaded in a browser needs Open Anyway on first launch. Windows has no code-signing certificate yet: installed with the command, SmartScreen does not ask, while an .exe downloaded in a browser may be warned about (Smart App Control in blocking mode blocks both) (<a href="/en/guide/install-windows/">what to do</a>).</td></tr>
-<tr><th scope="row">Payments</th><td>VietQR in VND through PayOS. No international cards and no e-invoices yet.</td></tr>
+<tr><th scope="row">Payments</th><td>VietQR in VND through PayOS, or international cards in USD through Creem. No e-invoices yet.</td></tr>
 <tr><th scope="row">Plans</th><td>Free 10-day trial, Monthly, 6 Months, Yearly. See <a href="/en/pricing/">pricing</a>.</td></tr>
 </tbody></table></div>
 </div></section>
@@ -93,7 +93,6 @@
 <li>Per-app audio capture on Windows</li>
 <li>Two-way speech translation, so your own voice can be translated for the other people in the meeting</li>
 <li>Meeting summaries and minutes</li>
-<li>Selling outside Vietnam, with international payments</li>
 <li>A business plan for multiple devices</li>
 <li>More languages for the source audio and the translation (beyond the current five)</li>
 <li>More interface languages</li>
```

- [ ] **Step 4: Sửa Giải pháp và Tải xuống**

**Sửa `website/src/content/vi/solutions.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/solutions.mjs
+++ b/website/src/content/vi/solutions.mjs
@@ -13,7 +13,7 @@
   description:
     "AI Translator hiện phụ đề dịch trực tiếp cho họp Zoom, Teams, Meet, Zalo, webinar, khóa học và video. Xem cách dùng cho từng tình huống và khi nào app chưa phù hợp.",
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   llm: "Tổng quan các tình huống dùng AI Translator (họp trực tuyến, webinar, khóa học, video), liên kết tới hai trang giải pháp chi tiết và danh sách trường hợp app chưa phù hợp.",
   llmTitle: "Giải pháp: AI Translator dùng vào việc gì",
   body: () => `
@@ -43,7 +43,7 @@
   ["Nền tảng", "macOS 14.2+ trên Apple Silicon và Windows 10/11 x64<small>Mac Intel và Windows ARM64: chưa hỗ trợ</small>"],
   ["Máy", "RAM tối thiểu 8 GB, khuyến nghị 16 GB<small>Tải model một lần: 1,3 GB (gói model Nhẹ) hoặc 2,5 GB (gói model Chuẩn)</small>"],
   ["Ngôn ngữ", "tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt<small>Giao diện app: Tiếng Việt, English, 日本語, 中文 (giản thể), 한국어</small>"],
-  ["Giá", "Free dùng thử 10 ngày · Monthly 50.000 ₫ · 6 Months 269.000 ₫ · Yearly 500.000 ₫<small>Trả trước bằng VietQR, không tự gia hạn</small>"],
+  ["Giá", "Free dùng thử 10 ngày · Monthly 50.000 ₫ · 6 Months 269.000 ₫ · Yearly 500.000 ₫<small>Trả trước bằng VietQR hoặc thẻ quốc tế (USD), không tự gia hạn</small>"],
 ])}</div>
 </div></section>
 
@@ -67,7 +67,6 @@
   "<strong>Bạn cần biên bản, tóm tắt tự động hoặc biết ai đang nói.</strong> Chưa có.",
   "<strong>Bạn dùng Mac Intel, Windows ARM64 hoặc máy Windows có CPU không hỗ trợ AVX2.</strong> AI Translator chạy trên macOS 14.2 trở lên với Apple Silicon và Windows 10/11 64-bit (x64) có CPU hỗ trợ AVX2.",
   "<strong>Máy có dưới 8 GB RAM,</strong> hoặc bạn cần ngôn ngữ ngoài năm ngôn ngữ trên: app chưa đáp ứng.",
-  "<strong>Bạn không có tài khoản ngân hàng Việt Nam.</strong> Hiện chỉ nhận VietQR bằng VND, chưa có thẻ quốc tế.",
 ], true)}
 ${callout({ kind: "warn", title: "Bản dịch tự động có thể sai.", text: "Đừng dựa vào AI Translator cho quyết định quan trọng (hợp đồng, y tế, pháp lý, tài chính) mà chưa kiểm tra lại với người có chuyên môn." })}
 </div></section>
```

**Sửa `website/src/content/en/solutions.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/solutions.mjs
+++ b/website/src/content/en/solutions.mjs
@@ -13,7 +13,7 @@
   description:
     "AI Translator shows translated subtitles for Zoom, Teams, Meet and Zalo calls, webinars, courses and videos. See how to use it and when it is not the right fit.",
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   llm: "Overview of what AI Translator is used for (online meetings, webinars, courses, videos), links to the two detailed solution pages, and a list of cases where the app is not the right fit.",
   llmTitle: "Solutions: what AI Translator is used for",
   body: () => `
@@ -43,7 +43,7 @@
   ["Platform", "macOS 14.2 or later on Apple Silicon and Windows 10/11 x64<small>Intel Macs and Windows ARM64: not supported</small>"],
   ["Computer", "At least 8 GB of RAM, 16 GB recommended<small>One-time model download: 1.3 GB (Lite) or 2.5 GB (Standard)</small>"],
   ["Languages", "English, Chinese (中文), Japanese (日本語), Korean (한국어), Vietnamese (Tiếng Việt)<small>App interface: English, Vietnamese, Japanese, Chinese (Simplified), Korean</small>"],
-  ["Price", "Free 10-day trial · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>Prepaid with VietQR, no automatic renewal</small>"],
+  ["Price", "Free 10-day trial · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>Prepaid with VietQR or international card (USD), no automatic renewal</small>"],
 ])}</div>
 </div></section>
 
@@ -67,7 +67,6 @@
   "<strong>You need automatic minutes, summaries or speaker labels.</strong> Not available.",
   "<strong>You use an Intel Mac, Windows ARM64, or a Windows PC whose CPU lacks AVX2.</strong> AI Translator runs on macOS 14.2 or later on Apple Silicon and on Windows 10/11 64-bit (x64) with a CPU that supports AVX2.",
   "<strong>Your computer has less than 8 GB of RAM,</strong> or you need a language beyond the five above: the app cannot cover that yet.",
-  "<strong>You have no Vietnamese bank account.</strong> For now we accept VietQR in VND only, with no international cards.",
 ], true)}
 ${callout({ kind: "warn", title: "Automatic translation can be wrong.", text: "Do not rely on AI Translator for important decisions (contracts, medical, legal, financial) without checking with a qualified person." })}
 </div></section>
```

**Sửa `website/src/content/vi/download.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/download.mjs
+++ b/website/src/content/vi/download.mjs
@@ -180,7 +180,7 @@
     "Tải AI Translator: cài trên macOS 14.2+ (Apple Silicon) hoặc Windows 10/11 bằng một dòng lệnh, mở thẳng không cần Open Anyway. Dùng thử Free 10 ngày.",
   software: true,
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: f.a })))],
   llm: "Tải AI Translator: trang tự nhận ra hệ điều hành và mở đúng hướng dẫn. macOS cài bằng một dòng lệnh Terminal (curl ... install.sh | bash): tải bản cài, kiểm SHA-256 rồi mở app, không cần Open Anyway. Windows cài bằng một dòng lệnh PowerShell (irm ... install.ps1 | iex); file .exe tải bằng trình duyệt có thể bị SmartScreen cảnh báo vì bản chưa ký mã, Smart App Control có thể chặn. Yêu cầu máy.",
   llmTitle: "Tải AI Translator",
@@ -216,7 +216,7 @@
   ["Phiên bản hiện tại", RELEASE.vi],
   ["Trạng thái", "Đã phát hành. macOS và Windows đều cài bằng một dòng lệnh"],
   ["Dùng thử", "Free 10 ngày, 30 phút mỗi ngày<small>Không cần thẻ, không cần tài khoản</small>"],
-  ["Giá sau đó", "Monthly 50.000 ₫ · 6 Months 269.000 ₫ · Yearly 500.000 ₫"],
+  ["Giá sau đó", "Monthly 50.000 ₫ · 6 Months 269.000 ₫ · Yearly 500.000 ₫<small>Trả trước bằng VietQR (VND) hoặc thẻ quốc tế (USD), không tự gia hạn</small>"],
   ["Model", "Tải một lần, 1,3 hoặc 2,5 GB<small>Sau đó nhận dạng và dịch chạy offline trên máy bạn</small>"],
 ])}</div>
 ${callout({ kind: "ok", title: "Chỉ lấy bản cài từ chúng tôi", text: "Chỉ cài AI Translator bằng lệnh trên trang này, hoặc từ liên kết do <strong>support@aitranslator.vn</strong> hay website <strong>aitranslator.vn</strong> gửi cho bạn. Các bản cài từ nguồn khác có thể là bản giả." })}
```

**Sửa `website/src/content/en/download.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/download.mjs
+++ b/website/src/content/en/download.mjs
@@ -182,7 +182,7 @@
     "Get AI Translator: install on macOS 14.2+ (Apple Silicon) or Windows 10/11 with one command, opens right away, no Open Anyway. 10-day free trial.",
   software: true,
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   schema: [faqPage(DL_FAQ.map((f) => ({ q: f.q, a: f.a })))],
   llm: "Get AI Translator: the page detects your operating system and opens the right guide. macOS installs with one Terminal command (curl ... install.sh | bash): it downloads the installer, checks its SHA-256 and opens the app, with no Open Anyway step. Windows installs with one PowerShell command (irm ... install.ps1 | iex); an .exe downloaded in a browser may trigger a SmartScreen warning because the build is not code-signed, and Smart App Control can block it. System requirements.",
   llmTitle: "Get AI Translator",
@@ -218,7 +218,7 @@
   ["Current version", RELEASE.en],
   ["Status", "Released. Both macOS and Windows install with one command"],
   ["Free trial", "10 days, 30 minutes per day<small>No card, no account</small>"],
-  ["Price afterwards", "Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>Paid in VND by bank transfer from a Vietnamese bank (VietQR)</small>"],
+  ["Price afterwards", "Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>Prepaid with VietQR (VND) or international card (USD), no automatic renewal</small>"],
   ["Models", "Downloaded once, 1.3 or 2.5 GB<small>After that, recognition and translation run offline on your machine</small>"],
 ])}</div>
 ${callout({ kind: "ok", title: "Only get the installer from us", text: "Install AI Translator only with the command on this page, or from a link sent by <strong>support@aitranslator.vn</strong> or from the website <strong>aitranslator.vn</strong>. Installers from any other source may be fake." })}
```

- [ ] **Step 5: Sửa Tính năng và Liên hệ**

**Sửa `website/src/content/vi/features.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/features.mjs
+++ b/website/src/content/vi/features.mjs
@@ -14,7 +14,7 @@
     "Phụ đề dịch trực tiếp 5 ngôn ngữ, thanh phụ đề tùy chỉnh, từ điển thuật ngữ, lịch sử, xuất TXT/SRT/Markdown, phím tắt. Tất cả chạy offline trên máy của bạn.",
   software: true,
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   llm: "Danh sách đầy đủ tính năng đã có trong app (phụ đề dịch, thanh phụ đề, từ điển thuật ngữ, lịch sử, xuất file, phím tắt, model) cùng số đo hiệu năng có ghi điều kiện.",
   llmTitle: "Tính năng của AI Translator",
   body: () => `
@@ -246,7 +246,8 @@
 <tr><th scope="row">Lưu lịch sử các phiên</th><td><span class="no">Không</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
 <tr><th scope="row">Xuất TXT, SRT, Markdown</th><td><span class="no">Không</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
 <tr><th scope="row">Thời lượng dịch</th><td>30 phút mỗi ngày, 10 ngày</td><td>50 giờ mỗi 30 ngày</td><td>100 giờ mỗi 30 ngày, 180 ngày</td><td>Không giới hạn, 365 ngày</td></tr>
-<tr><th scope="row">Giá</th><td>0 ₫</td><td>50.000 ₫</td><td>269.000 ₫</td><td>500.000 ₫</td></tr>
+<tr><th scope="row">Giá (VietQR, VND)</th><td>0 ₫</td><td>50.000 ₫</td><td>269.000 ₫</td><td>500.000 ₫</td></tr>
+<tr><th scope="row">Giá (thẻ quốc tế, USD, chưa gồm thuế)</th><td>0 USD</td><td>3,99 USD</td><td>21,99 USD</td><td>39,99 USD</td></tr>
 </tbody></table></div>
 <p class="center-text reveal"><a class="btn btn-primary" href="/bang-gia/">Xem chi tiết bảng giá ${icon("arrow-right")}</a></p>
 </div></section>
```

**Sửa `website/src/content/en/features.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/features.mjs
+++ b/website/src/content/en/features.mjs
@@ -14,7 +14,7 @@
     "Live translated subtitles in 5 languages, a customizable subtitle bar, glossary, history, TXT/SRT/Markdown export and shortcuts. All offline, on your computer.",
   software: true,
   breadcrumbs: crumbs,
-  modified: "2026-10-13",
+  modified: "2026-10-14",
   llm: "Complete list of what the app does today (live translated subtitles, subtitle bar, glossary, history, export, shortcuts, models), with performance figures and the conditions they were measured under.",
   llmTitle: "AI Translator features",
   body: () => `
@@ -250,7 +250,8 @@
 <tr><th scope="row">Save session history</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
 <tr><th scope="row">Export to TXT, SRT, Markdown</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
 <tr><th scope="row">Translation time</th><td>30 min per day, for 10 days</td><td>50 hours per 30 days</td><td>100 hours per 30 days, for 180 days</td><td>Unlimited, for 365 days</td></tr>
-<tr><th scope="row">Price (VND)</th><td>0 ₫</td><td>50,000 ₫</td><td>269,000 ₫</td><td>500,000 ₫</td></tr>
+<tr><th scope="row">Price (VietQR, VND)</th><td>0 ₫</td><td>50,000 ₫</td><td>269,000 ₫</td><td>500,000 ₫</td></tr>
+<tr><th scope="row">Price (international card, USD, excluding tax)</th><td>$0</td><td>$3.99</td><td>$21.99</td><td>$39.99</td></tr>
 </tbody></table></div>
 <p class="center-text reveal"><a class="btn btn-primary" href="/en/pricing/">See the full pricing details ${icon("arrow-right")}</a></p>
 </div></section>
```

**Sửa `website/src/content/vi/contact.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/contact.mjs
+++ b/website/src/content/vi/contact.mjs
@@ -22,7 +22,7 @@
     "Các bước để lỗi xảy ra lại:",
   ]),
   key: mail("Mất license key AI Translator", ["Email đã dùng khi mua:", "Tôi đã thử Cài đặt › Bản quyền › Mất key? chưa (có/chưa):"]),
-  payment: mail("Vấn đề thanh toán AI Translator", ["Mã đơn (dòng Đơn … trong màn hình Nâng cấp):", "Email đã dùng khi mua:", "Thời điểm và số tiền đã chuyển:", "Vấn đề:"]),
+  payment: mail("Vấn đề thanh toán AI Translator", ["Mã đơn (dòng Đơn … trong màn hình Nâng cấp):", "Email đã dùng khi mua:", "Cách trả (VietQR hoặc thẻ quốc tế), thời điểm và số tiền đã trả:", "Vấn đề:"]),
   refund: mail("Yêu cầu hoàn tiền AI Translator", ["Mã đơn:", "Ngày thanh toán:", "Lý do:"]),
   erase: mail("Yêu cầu xóa hoặc ẩn danh dữ liệu cá nhân", ["Tôi yêu cầu xóa/ẩn danh dữ liệu cá nhân gắn với email này.", "(Thư này được gửi từ chính email đã dùng khi mua.)"]),
   security: mail("[Bảo mật] Báo lỗi bảo mật AI Translator", ["Mô tả lỗi:", "Các bước để tái hiện:", "Phiên bản/thành phần bị ảnh hưởng:"]),
@@ -40,7 +40,7 @@
     "Liên hệ AI Translator qua email support@aitranslator.vn: nhận bản cài, hỗ trợ kỹ thuật, mất key, thanh toán, hoàn tiền, xóa dữ liệu và báo lỗi bảo mật.",
   schemaType: "ContactPage",
   breadcrumbs: crumbs,
-  modified: "2026-10-08",
+  modified: "2026-10-14",
   llm: "Cách liên hệ và nhận hỗ trợ: email support@aitranslator.vn, việc nên gửi tới đó (nhận bản cài, kỹ thuật, mất key, thanh toán, hoàn tiền, xóa dữ liệu, bảo mật) và nên kèm thông tin gì.",
   llmTitle: "Liên hệ và hỗ trợ AI Translator",
   body: () => `
@@ -86,13 +86,13 @@
 
 <div class="card reveal" id="thanh-toan">
 <h3>Khiếu nại về thanh toán</h3>
-<p>Đã chuyển tiền mà chưa có key, chuyển thiếu hoặc đơn bị lỗi: hãy gửi mã đơn (dòng “Đơn …” trong màn hình Nâng cấp), email đã dùng khi mua, thời điểm và số tiền đã chuyển. Việc chuyển tiền do ngân hàng và PayOS xử lý; chúng tôi không nhận số tài khoản hay thẻ của bạn.</p>
+<p>Đã trả tiền mà chưa có key, trả thiếu hoặc đơn bị lỗi: hãy gửi mã đơn (dòng “Đơn …” trong màn hình Nâng cấp), email đã dùng khi mua, cách trả, thời điểm và số tiền đã trả. Với thẻ quốc tế, hãy kèm biên lai Creem gửi tới email bạn nhập (nếu có). Chuyển khoản VietQR do ngân hàng và PayOS xử lý, thanh toán bằng thẻ do Creem xử lý; chúng tôi không nhận số tài khoản hay số thẻ của bạn.</p>
 ${btn(M.payment, "Gửi thư về thanh toán")}
 </div>
 
 <div class="card reveal" id="hoan-tien">
 <h3>Yêu cầu hoàn tiền</h3>
-<p>Gửi yêu cầu trong <strong>7 ngày</strong> kể từ ngày thanh toán, kèm mã đơn và lý do. Đã thanh toán thì không hoàn lại, trừ khi lỗi do phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác; đổi gói không được hoàn tiền. Chi tiết trong <a href="/dieu-khoan/">Điều khoản sử dụng</a>.</p>
+<p>Gửi yêu cầu trong <strong>7 ngày</strong> kể từ ngày thanh toán, kèm mã đơn và lý do. Đã thanh toán thì không hoàn lại, trừ khi lỗi do phía chúng tôi khiến bạn không dùng được gói đã mua và không khắc phục được trong thời gian hợp lý, hoặc khi pháp luật quy định khác; đổi gói không được hoàn tiền. Khoản trả bằng thẻ quốc tế do Creem xử lý: đơn đã hoàn tiền thì license của đơn đó có thể bị thu hồi. Chi tiết trong <a href="/dieu-khoan/">Điều khoản sử dụng</a>.</p>
 ${btn(M.refund, "Gửi yêu cầu hoàn tiền")}
 </div>
 
```

**Sửa `website/src/content/en/contact.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/contact.mjs
+++ b/website/src/content/en/contact.mjs
@@ -22,7 +22,7 @@
     "Steps to make it happen again:",
   ]),
   key: mail("Lost AI Translator license key", ["Email used to buy:", "Have I tried Settings › License › Lost your key? (yes/no):"]),
-  payment: mail("AI Translator payment problem", ["Order code (the “Order …” line on the Upgrade screen):", "Email used to buy:", "Time and amount transferred:", "Problem:"]),
+  payment: mail("AI Translator payment problem", ["Order code (the “Order …” line on the Upgrade screen):", "Email used to buy:", "Payment method (VietQR or international card), time and amount paid:", "Problem:"]),
   refund: mail("AI Translator refund request", ["Order code:", "Payment date:", "Reason:"]),
   erase: mail("Request to delete or anonymize personal data", ["I ask you to delete or anonymize the personal data linked to this email.", "(Sent from the same email I used to buy.)"]),
   security: mail("[Security] AI Translator security report", ["What I found:", "Steps to reproduce:", "Affected version or component:"]),
@@ -40,7 +40,7 @@
     "Contact AI Translator at support@aitranslator.vn: installer, technical support, lost keys, payment issues, refunds, data deletion and security reports.",
   schemaType: "ContactPage",
   breadcrumbs: crumbs,
-  modified: "2026-10-08",
+  modified: "2026-10-14",
   llm: "How to reach us and get support: email support@aitranslator.vn, what to send there (installer, technical help, lost key, payments, refunds, data deletion, security) and what to include.",
   llmTitle: "Contact and support for AI Translator",
   body: () => `
@@ -86,13 +86,13 @@
 
 <div class="card reveal" id="payment">
 <h3>Payment problems</h3>
-<p>If you paid but have no key, paid too little, or an order failed, send the order code (the “Order …” line on the Upgrade screen), the email you used to buy, and the time and amount of the transfer. Your bank and PayOS handle the transfer itself; we do not receive your bank account or card details.</p>
+<p>If you paid but have no key, paid too little, or an order failed, send the order code (the “Order …” line on the Upgrade screen), the email you used to buy, how you paid, and the time and amount. For a card payment, also attach the receipt Creem emailed to the address you entered, if you have it. Your bank and PayOS handle VietQR transfers and Creem handles card payments; we do not receive your bank account or card details.</p>
 ${btn(M.payment, "Email about a payment")}
 </div>
 
 <div class="card reveal" id="refund">
 <h3>Refund request</h3>
-<p>Send your request within <strong>7 days</strong> of the payment date, with the order code and the reason. Payments are not refundable, except when a fault on our side stops you from using the plan you bought and we cannot fix it within a reasonable time, or when the law says otherwise; changing plans is not refundable. Details are in the <a href="/en/terms/">Terms of use</a>.</p>
+<p>Send your request within <strong>7 days</strong> of the payment date, with the order code and the reason. Payments are not refundable, except when a fault on our side stops you from using the plan you bought and we cannot fix it within a reasonable time, or when the law says otherwise; changing plans is not refundable. Card payments are processed by Creem: once an order is refunded, its license may be revoked. Details are in the <a href="/en/terms/">Terms of use</a>.</p>
 ${btn(M.refund, "Send a refund request")}
 </div>
 
```

- [ ] **Step 6: Sửa Dữ liệu và bảo mật**

**Sửa `website/src/content/vi/data-security.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/data-security.mjs
+++ b/website/src/content/vi/data-security.mjs
@@ -28,8 +28,8 @@
   description:
     "AI Translator xử lý âm thanh trên máy bạn, không gửi đi. Xem dữ liệu nào ở lại trên máy, app kết nối tới đâu, máy chủ lưu gì, giữ bao lâu và cách yêu cầu xóa.",
   breadcrumbs: crumbs,
-  modified: "2026-10-08",
-  llm: "Dữ liệu ở lại trên máy, bốn nơi app kết nối mạng, cách đã kiểm tra bằng proxy trên macOS (Windows chưa đo), dữ liệu máy chủ lưu và thời gian giữ, bên xử lý, lớp bảo vệ, trạng thái ký số và cách yêu cầu xóa dữ liệu.",
+  modified: "2026-10-14",
+  llm: "Dữ liệu ở lại trên máy, năm nơi app kết nối mạng, cách đã kiểm tra bằng proxy trên macOS (Windows chưa đo), dữ liệu máy chủ lưu và thời gian giữ, bên xử lý, lớp bảo vệ, trạng thái ký số và cách yêu cầu xóa dữ liệu.",
   llmTitle: "Dữ liệu và bảo mật của AI Translator",
   body: () => `
 ${pageHero({
@@ -48,7 +48,7 @@
   ["Xử lý AI", "Nhận dạng và dịch bằng model AI chạy trên máy bạn; không dùng AI trên cloud"],
   ["Dữ liệu cuộc hội thoại", "Chỉ ở trên máy bạn; máy chủ của chúng tôi không có"],
   ["Âm thanh", "Chỉ nằm trong RAM, không ghi đĩa, không gửi đi"],
-  ["Kết nối mạng", "Bốn nơi; không nơi nào nhận âm thanh hay chữ chép lời"],
+  ["Kết nối mạng", "Năm nơi; không nơi nào nhận âm thanh hay chữ chép lời"],
   ["Máy chủ lưu", "Email (khi mua), đơn hàng, license, mã băm ID máy"],
   ["Giữ bao lâu", "Cho tới khi bạn yêu cầu xóa"],
   ["Đã kiểm", "Proxy và nettop trên macOS; Windows chưa đo"],
@@ -67,13 +67,14 @@
 </tbody></table></div>
 
 <h2 id="ket-noi-mang">App kết nối mạng tới đâu?</h2>
-<p>Đúng bốn nơi, và không nơi nào nhận âm thanh hay nội dung chép lời. Nhận dạng giọng nói và dịch không cần mạng. Trong lúc dịch, app chỉ có thể gửi các yêu cầu định kỳ tới máy chủ của chúng tôi (kiểm tra bản cập nhật, và kiểm tra bản quyền khi đến hạn).</p>
+<p>Đúng năm nơi, và không nơi nào nhận âm thanh hay nội dung chép lời. Nhận dạng giọng nói và dịch không cần mạng. Trong lúc dịch, app chỉ có thể gửi các yêu cầu định kỳ tới máy chủ của chúng tôi (kiểm tra bản cập nhật, và kiểm tra bản quyền khi đến hạn).</p>
 <div class="table-wrap" role="region" aria-label="Các nơi app kết nối mạng" tabindex="0"><table>
 <thead><tr><th scope="col">Nơi kết nối</th><th scope="col">Để làm gì</th><th scope="col">Gửi đi gì</th></tr></thead>
 <tbody>
 <tr><th scope="row">api.aitranslator.vn</th><td>Máy chủ bản quyền: đăng ký dùng thử Free, mua gói, kích hoạt, gỡ kích hoạt, khôi phục key, kiểm tra bản quyền; thỉnh thoảng hỏi giờ máy chủ</td><td>Mã băm ID máy, tên máy, key; thêm email khi bạn mua hoặc khôi phục key</td></tr>
 <tr><th scope="row">releases.aitranslator.vn</th><td>Tải model và kiểm tra, tải bản cập nhật</td><td>Chỉ yêu cầu tải file</td></tr>
 <tr><th scope="row">Trang thanh toán PayOS (pay.payos.vn)</th><td>Thanh toán VietQR khi bạn mua gói</td><td>Mở bằng trình duyệt của bạn, không phải trong app</td></tr>
+<tr><th scope="row">Trang thanh toán Creem (checkout.creem.io)</th><td>Thanh toán bằng thẻ quốc tế khi bạn mua gói</td><td>Mở bằng trình duyệt của bạn, không phải trong app</td></tr>
 <tr><th scope="row">aitranslator.vn (website này)</th><td>Liên kết ngoài (chính sách, hỗ trợ, trang tải) mở bằng trình duyệt hệ thống</td><td>App không gửi gì</td></tr>
 </tbody></table></div>
 
@@ -92,14 +93,14 @@
 <thead><tr><th scope="col">Dữ liệu</th><th scope="col">Mục đích</th></tr></thead>
 <tbody>
 <tr><th scope="row">Email khi mua, thời điểm đồng ý xử lý email</th><td>Gửi và khôi phục key; bằng chứng đã có sự đồng ý</td></tr>
-<tr><th scope="row">Đơn hàng: mã đơn, gói, số tiền, thời điểm, trạng thái</th><td>Cấp và gia hạn license, đối soát, kế toán</td></tr>
+<tr><th scope="row">Đơn hàng: mã đơn, gói, số tiền và loại tiền, thời điểm, trạng thái</th><td>Cấp và gia hạn license, đối soát, kế toán</td></tr>
 <tr><th scope="row">License: key, gói, hạn, chu kỳ hạn mức</th><td>Cấp quyền dùng gói trả phí</td></tr>
 <tr><th scope="row">Máy đã kích hoạt: mã băm ID máy, tên máy, lần kiểm tra</th><td>Mỗi key một máy, chống lạm dụng</td></tr>
 <tr><th scope="row">Dùng thử Free: mã băm ID máy, mốc bắt đầu và hết, lần app gọi gần nhất</th><td>Mỗi máy dùng thử một lần. Không có email hay tên máy.</td></tr>
 <tr><th scope="row">Nhật ký thay đổi license</th><td>Hỗ trợ và tra soát sự cố</td></tr>
 <tr><th scope="row">Bộ đếm giới hạn tần suất (chỉ giá trị băm, tự hết hạn sau khoảng 3 giờ)</th><td>Chặn dò key và spam</td></tr>
 </tbody></table></div>
-<p><strong>Giữ bao lâu:</strong> cho tới khi bạn yêu cầu xóa; chúng tôi không tự xóa. Chúng tôi không nhận số thẻ hay số tài khoản ngân hàng của bạn và không gửi email của bạn sang PayOS. Nếu chỉ dùng Free, máy chủ không có email hay tên máy của bạn.</p>
+<p><strong>Giữ bao lâu:</strong> cho tới khi bạn yêu cầu xóa; chúng tôi không tự xóa. Chúng tôi không nhận số thẻ hay số tài khoản ngân hàng của bạn. Với VietQR, chúng tôi không gửi email của bạn sang PayOS; với thẻ quốc tế, email bạn nhập ở màn hình Nâng cấp được gửi cho Creem để điền sẵn trang thanh toán. Nếu chỉ dùng Free, máy chủ không có email hay tên máy của bạn.</p>
 
 <h2 id="xoa-du-lieu">Làm sao để xóa dữ liệu của bạn?</h2>
 ${steps(
@@ -117,10 +118,11 @@
 <thead><tr><th scope="col">Bên</th><th scope="col">Vai trò</th><th scope="col">Dữ liệu</th></tr></thead>
 <tbody>
 <tr><th scope="row">PayOS (Việt Nam)</th><td>Xử lý thanh toán VietQR</td><td>Mã đơn, số tiền, mô tả đơn. Không có email của bạn.</td></tr>
+<tr><th scope="row">Creem (Armitage Labs OÜ, Estonia)</th><td>Xử lý thanh toán bằng thẻ quốc tế</td><td>Mã đơn, gói, số tiền và email của bạn (để điền sẵn trang thanh toán). Số thẻ bạn nhập thẳng trên trang của Creem; chúng tôi không nhận.</td></tr>
 <tr><th scope="row">Cloudflare</th><td>Chạy máy chủ bản quyền, cơ sở dữ liệu; lưu và phân phối model, bản cập nhật</td><td>Dữ liệu ở bảng trên; nhật ký kỹ thuật tự hết hạn</td></tr>
 <tr><th scope="row">Resend</th><td>Gửi email chứa key</td><td>Email của bạn và nội dung thư (có key); nhật ký thư theo chính sách lưu của Resend</td></tr>
 </tbody></table></div>
-<p>Cloudflare và Resend đặt máy chủ ngoài Việt Nam, nên dữ liệu có thể được xử lý ở nước ngoài. Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho mục đích quảng cáo.</p>
+<p>Cloudflare và Resend đặt máy chủ ngoài Việt Nam còn Creem là pháp nhân Estonia, nên dữ liệu có thể được xử lý ở nước ngoài. Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho mục đích quảng cáo.</p>
 
 <h2 id="bao-ve">Những lớp bảo vệ khác</h2>
 <ul>
```

**Sửa `website/src/content/en/data-security.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/data-security.mjs
+++ b/website/src/content/en/data-security.mjs
@@ -28,8 +28,8 @@
   description:
     "AI Translator processes audio on your computer and never sends it out. See what stays on your device, where it connects, what servers store, and how to delete it.",
   breadcrumbs: crumbs,
-  modified: "2026-10-08",
-  llm: "What data stays on your device, the four places the app connects to, how it was checked with a proxy on macOS (Windows not yet measured), what our servers store and for how long, processors, protections, signing status and how to request deletion.",
+  modified: "2026-10-14",
+  llm: "What data stays on your device, the five places the app connects to, how it was checked with a proxy on macOS (Windows not yet measured), what our servers store and for how long, processors, protections, signing status and how to request deletion.",
   llmTitle: "Data and security in AI Translator",
   body: () => `
 ${pageHero({
@@ -48,7 +48,7 @@
   ["AI processing", "Speech recognition and translation use AI models running on your computer; no cloud AI"],
   ["Conversation data", "Only on your computer; our server has none"],
   ["Audio", "Only in RAM, never written to disk, never sent out"],
-  ["Network", "Four places; none of them receives audio or transcripts"],
+  ["Network", "Five places; none of them receives audio or transcripts"],
   ["Servers store", "Email (when you buy), orders, licenses, hashed machine ID"],
   ["Kept for", "Until you ask us to delete it"],
   ["Checked", "Proxy and nettop on macOS; Windows not measured yet"],
@@ -67,13 +67,14 @@
 </tbody></table></div>
 
 <h2 id="network">Where does the app connect?</h2>
-<p>To exactly four places, and none of them receives audio or transcript content. Speech recognition and translation need no network. While translating, the app may only send scheduled requests to our own servers (an update check, and a license check when one is due).</p>
+<p>To exactly five places, and none of them receives audio or transcript content. Speech recognition and translation need no network. While translating, the app may only send scheduled requests to our own servers (an update check, and a license check when one is due).</p>
 <div class="table-wrap" role="region" aria-label="Places the app connects to" tabindex="0"><table>
 <thead><tr><th scope="col">Connects to</th><th scope="col">What for</th><th scope="col">What is sent</th></tr></thead>
 <tbody>
 <tr><th scope="row">api.aitranslator.vn</th><td>License server: Free trial registration, buying, activating, deactivating, recovering keys, license checks; occasionally asks the server for the time</td><td>Hashed machine ID, device name, key; plus your email when you buy or recover a key</td></tr>
 <tr><th scope="row">releases.aitranslator.vn</th><td>Downloading models, checking for and downloading app updates</td><td>File download requests only</td></tr>
 <tr><th scope="row">PayOS payment page (pay.payos.vn)</th><td>VietQR payment when you buy a plan</td><td>Opens in your browser, not inside the app</td></tr>
+<tr><th scope="row">Creem payment page (checkout.creem.io)</th><td>International card payment when you buy a plan</td><td>Opens in your browser, not inside the app</td></tr>
 <tr><th scope="row">aitranslator.vn (this website)</th><td>External links (policies, support, download page) open in your system browser</td><td>The app sends nothing</td></tr>
 </tbody></table></div>
 
@@ -92,14 +93,14 @@
 <thead><tr><th scope="col">Data</th><th scope="col">Purpose</th></tr></thead>
 <tbody>
 <tr><th scope="row">Email at purchase, time you consented to email processing</th><td>Sending and recovering keys; proof of consent</td></tr>
-<tr><th scope="row">Orders: order code, plan, amount, time, status</th><td>Issuing and renewing licenses, reconciliation, accounting</td></tr>
+<tr><th scope="row">Orders: order code, plan, amount and currency, time, status</th><td>Issuing and renewing licenses, reconciliation, accounting</td></tr>
 <tr><th scope="row">License: key, plan, expiry, quota cycle</th><td>Granting the paid plan</td></tr>
 <tr><th scope="row">Activated devices: hashed machine ID, device name, last check</th><td>One device per key, abuse prevention</td></tr>
 <tr><th scope="row">Free trial: hashed machine ID, start and end times, last time the app called</th><td>One trial per device. No email or device name.</td></tr>
 <tr><th scope="row">License change log</th><td>Support and incident investigation</td></tr>
 <tr><th scope="row">Rate-limit counters (hashed values only, expire after about 3 hours)</th><td>Blocking key guessing and spam</td></tr>
 </tbody></table></div>
-<p><strong>Kept for:</strong> until you ask us to delete it; we never delete personal data on our own. We do not receive your card or bank account numbers and we do not send your email to PayOS. If you only use Free, our servers hold no email or device name for you.</p>
+<p><strong>Kept for:</strong> until you ask us to delete it; we never delete personal data on our own. We do not receive your card or bank account numbers. For VietQR we do not send your email to PayOS; for an international card, the email you enter on the Upgrade screen is sent to Creem to pre-fill its payment page. If you only use Free, our servers hold no email or device name for you.</p>
 
 <h2 id="delete-data">How do I delete my data?</h2>
 ${steps(
@@ -117,10 +118,11 @@
 <thead><tr><th scope="col">Party</th><th scope="col">Role</th><th scope="col">Data</th></tr></thead>
 <tbody>
 <tr><th scope="row">PayOS (Vietnam)</th><td>Processes VietQR payments</td><td>Order code, amount, order description. Not your email.</td></tr>
+<tr><th scope="row">Creem (Armitage Labs OÜ, Estonia)</th><td>Processes international card payments</td><td>Order code, plan, amount and your email (to pre-fill the payment page). You type your card number straight into Creem's page; we do not receive it.</td></tr>
 <tr><th scope="row">Cloudflare</th><td>Runs the license server and database; stores and serves models and updates</td><td>The data in the table above; technical logs that expire on their own</td></tr>
 <tr><th scope="row">Resend</th><td>Sends the email that contains your key</td><td>Your email and the message (with the key); mail logs kept under Resend's own policy</td></tr>
 </tbody></table></div>
-<p>Cloudflare and Resend operate servers outside Vietnam, so data may be processed abroad. We do not sell your data and do not share it for advertising.</p>
+<p>Cloudflare and Resend operate servers outside Vietnam and Creem is an Estonian company, so data may be processed abroad. We do not sell your data and do not share it for advertising.</p>
 
 <h2 id="protections">Other protections</h2>
 <ul>
```

- [ ] **Step 7: Chạy toàn bộ test (xanh)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 87`, `ℹ pass 85`, `ℹ fail 0`, `ℹ skipped 2`.

- [ ] **Step 8: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- website | wc -l`
Expected: `28`.

---

### Task 6: Ba test giữ cho site không trôi lại, và README

**Files:**
- Modify: `website/src/content/vi/guide-license.mjs` (một câu), `website/README.md`
- Test: `website/test/site.test.mjs`

Ba test quét cả site (mọi trang đã dựng, kèm `llms.txt` và `llms-full.txt`):

1. **Câu cũ:** không còn câu nói "chưa có thẻ quốc tế", "chỉ nhận chuyển khoản/VietQR", "No international cards", "accept only bank transfers" và các câu cùng ý (danh sách bắt các câu thật đã gỡ ở Task 3 đến 5).
2. **Giá USD lạ:** mọi số tiền USD nêu trên website (`N USD`, `$N`) phải là giá của một gói trong `plans.mjs` (hay 0 của gói Free).
3. **Số nơi app kết nối:** số chữ ở câu mở đầu và dòng tóm tắt của trang Dữ liệu và bảo mật khớp số dòng của bảng.

Test 1 bắt ngay một câu vừa viết ở Task 4 (bản tiếng Việt của hướng dẫn mua gói có "VietQR chỉ nhận chuyển khoản từ ngân hàng Việt Nam", đúng nghĩa nhưng trùng cụm bị chặn): sửa thành "chỉ dùng được với tài khoản ngân hàng Việt Nam". Test 2 và 3 đạt ngay (mã đã đúng), nên chứng minh chúng bắt được lỗi bằng đột biến ở Step 4.

- [ ] **Step 1: Viết test**

**Sửa `website/test/site.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/test/site.test.mjs
+++ b/website/test/site.test.mjs
@@ -460,6 +460,66 @@
   assert.deepEqual(errors, []);
 });
 
+// Văn bản của mọi trang (đã bỏ thẻ HTML) cùng llms.txt và llms-full.txt, để các test "quét cả site" dùng chung.
+async function siteTexts() {
+  const sources = new Map([...htmlByPath].map(([p, html]) => [p, textOf(html)]));
+  for (const f of ["llms.txt", "llms-full.txt"]) if (await exists(path.join(DIST, f))) sources.set(f, await readFile(path.join(DIST, f), "utf8"));
+  return sources;
+}
+
+test("không trang nào (kể cả llms.txt) còn câu cũ nói chưa có thẻ quốc tế hay chỉ nhận chuyển khoản VietQR", async () => {
+  // Các câu này đúng cho tới khi có thẻ quốc tế qua Creem (spec 2026-10-14-creem-international-payment-design), giờ thì sai.
+  const stale = [
+    /chưa (có|nhận|hỗ trợ) thẻ quốc tế/i,
+    /chưa có Visa/i,
+    /không thẻ quốc tế/i,
+    /chỉ nhận (chuyển khoản|VietQR)/i,
+    /chưa mua được gói trả phí/i,
+    /bán ra nước ngoài, kèm thanh toán quốc tế/i,
+    /no international cards?/i,
+    /international cards?[^.]{0,60}not (accepted|supported|available)/i,
+    /accept only bank transfers/i,
+    /through PayOS only/i,
+    /\(VietQR\) only/i,
+    /cannot buy a paid plan/i,
+    /selling outside vietnam, with international payments/i,
+  ];
+  const errors = [];
+  for (const [where, text] of await siteTexts()) for (const re of stale) if (re.test(text)) errors.push(`${where}: còn câu cũ ${re}`);
+  assert.deepEqual(errors, []);
+});
+
+test("mọi giá USD nêu trên website là giá của một gói trong plans.mjs (hoặc 0 của gói Free)", async () => {
+  const allowed = new Set(PLANS.map((p) => p.priceUsdCents / 100));
+  const errors = [];
+  for (const [where, text] of await siteTexts()) {
+    for (const m of text.matchAll(/(\d+(?:,\d{1,2})?) USD/g)) if (!allowed.has(Number(m[1].replace(",", ".")))) errors.push(`${where}: giá USD lạ "${m[0]}"`);
+    for (const m of text.matchAll(/\$(\d+(?:\.\d{1,2})?)(?!\d)/g)) if (!allowed.has(Number(m[1]))) errors.push(`${where}: giá USD lạ "${m[0]}"`);
+  }
+  assert.deepEqual(errors, []);
+});
+
+test("Dữ liệu và bảo mật: số nơi app kết nối nêu ở câu mở đầu và dòng tóm tắt khớp số dòng của bảng", () => {
+  const words = { vi: ["bốn", "năm", "sáu"], en: ["four", "five", "six"] };
+  const errors = [];
+  for (const [urlPath, lang, id] of [["/bao-mat-du-lieu/", "vi", "ket-noi-mang"], ["/en/data-security/", "en", "network"]]) {
+    const html = htmlByPath.get(urlPath);
+    const from = html.indexOf(`id="${id}"`);
+    const rows = (html.slice(from, html.indexOf("</table>", from)).match(/<tr><th scope="row">/g) ?? []).length;
+    const word = words[lang][rows - 4];
+    if (!word) {
+      errors.push(`${urlPath}: bảng có ${rows} dòng, test chưa có từ chỉ số tương ứng`);
+      continue;
+    }
+    const text = textOf(html);
+    const opening = lang === "vi" ? `Đúng ${word} nơi` : `exactly ${word} places`;
+    const summary = lang === "vi" ? `Kết nối mạng ${word} nơi` : `Network ${word} places`;
+    if (!text.toLowerCase().includes(opening.toLowerCase())) errors.push(`${urlPath}: câu mở đầu phải có "${opening}" (bảng có ${rows} dòng)`);
+    if (!text.toLowerCase().includes(summary.toLowerCase())) errors.push(`${urlPath}: dòng tóm tắt phải có "${summary}" (bảng có ${rows} dòng)`);
+  }
+  assert.deepEqual(errors, []);
+});
+
 test("JSON-LD của trang giá liệt kê đủ Offer: bốn Offer VND (kể cả 6 Months 269000 ₫ trong 180 ngày) và ba Offer USD", () => {
   const errors = [];
   for (const urlPath of ["/bang-gia/", "/en/pricing/"]) {
```

- [ ] **Step 2: Chạy test để thấy kết quả**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern="câu cũ nói chưa có thẻ|giá USD nêu trên website|số nơi app kết nối" test/site.test.mjs 2>&1 | grep -E "^✖|^✔|^\s+\+ +'|^ℹ (pass|fail)"`
Expected: FAIL một test, đạt hai: `✖ không trang nào (kể cả llms.txt) còn câu cũ nói chưa có thẻ quốc tế hay chỉ nhận chuyển khoản VietQR` kèm đúng một dòng `/huong-dan/mua-va-kich-hoat-key/: còn câu cũ /chỉ nhận (chuyển khoản|VietQR)/i`; `✔ mọi giá USD nêu trên website …`; `✔ Dữ liệu và bảo mật: số nơi app kết nối …`; `ℹ pass 2`, `ℹ fail 1`.

- [ ] **Step 3: Sửa câu của hướng dẫn mua gói và cập nhật README**

**Sửa `website/src/content/vi/guide-license.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/guide-license.mjs
+++ b/website/src/content/vi/guide-license.mjs
@@ -87,7 +87,7 @@
   alt: "Mã VietQR hiện trong app kèm mã đơn, giờ hết hạn của mã, nút Mở trang thanh toán và dòng trạng thái đang chờ chuyển khoản",
   caption: "Mã VietQR trong app, kèm mã đơn.",
 })}
-<p>VietQR chỉ nhận chuyển khoản từ ngân hàng Việt Nam, bằng VND, qua PayOS. Thẻ quốc tế tính bằng USD, chưa gồm thuế (nếu có) và do Creem xử lý: sao kê thẻ có thể ghi tên Creem. Giá và hạn mức xem ở <a href="/bang-gia/">bảng giá</a>.</p>
+<p>VietQR chỉ dùng được với tài khoản ngân hàng Việt Nam, bằng VND, qua PayOS. Thẻ quốc tế tính bằng USD, chưa gồm thuế (nếu có) và do Creem xử lý: sao kê thẻ có thể ghi tên Creem. Giá và hạn mức xem ở <a href="/bang-gia/">bảng giá</a>.</p>
 
 <h2 id="nhap-key">Nhận key qua email và nhập key</h2>
 <p>Key được gửi từ no-reply@mail.aitranslator.vn tới email bạn đã nhập. Hãy giữ thư này để cài lại hoặc kích hoạt máy khác; không thấy thư thì kiểm hộp thư rác. Key gồm 7 nhóm 4 ký tự: <code>XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX</code>.</p>
```

**Sửa `website/README.md`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

````diff
--- a/website/README.md
+++ b/website/README.md
@@ -17,7 +17,7 @@
 
 ```
 src/site.mjs            thông tin site, chuỗi giao diện, điều hướng, chân trang (vi/en)
-src/plans.mjs           các gói (Free và ba gói trả phí), giá, hạn mức (test đối chiếu server/wrangler.jsonc)
+src/plans.mjs           các gói (Free và ba gói trả phí), giá VND và USD (cent), hạn mức (test đối chiếu server/wrangler.jsonc)
 src/content/index.mjs   danh mục trang (id → vi/<id>.mjs, en/<id>.mjs)
 src/content/{vi,en}/    mỗi trang một module: { id, lang, path, title, description, body, ... }
 src/content/legal.mjs   trang điều khoản/chính sách sinh từ docs/legal/*.md (nguồn duy nhất)
@@ -35,8 +35,9 @@
 ## Quy tắc
 - **Chỉ nói điều có thật** về sản phẩm (không số liệu, lời chứng thực hay tính năng tưởng tượng). Số đo hiệu năng luôn kèm điều kiện đo. Trạng thái (bản mới nhất đã phát hành chính thức, cài bằng một dòng lệnh trên macOS và Windows; macOS ký ad-hoc chưa notarize, Windows chưa ký mã nên SmartScreen có thể cảnh báo khi tải .exe bằng trình duyệt) phải đúng với repo.
 - **Không công bố công nghệ lõi:** không nêu tên model (nhận dạng, dịch, phát hiện tiếng nói), tên engine/thư viện chạy model, định dạng và mức lượng tử hóa, khung ứng dụng, ngôn ngữ lập trình, kiến trúc tiến trình/cổng nội bộ, API hệ điều hành dùng để thu âm, tên model/bộ so sánh trong số đo chất lượng. Chỉ nói "model AI chạy trên máy", "nhận dạng giọng nói", "dịch". Số đo vẫn giữ (kèm điều kiện đo) nhưng không gắn tên model. Thông báo giấy phép bên thứ ba nằm trong app (Giới thiệu › Giấy phép mã nguồn mở). Ảnh chụp app phải cắt bỏ phần lộ tên thư viện (danh sách giấy phép, màn hình Model nếu hiện tên). Test `không lộ công nghệ lõi` chặn các từ khóa này.
-- Đổi giá ở `server/wrangler.jsonc` thì đổi cả `src/plans.mjs` và mọi chỗ nhắc giá trong `src/content/` (test báo lệch giá/hạn mức).
-- Thêm hay bớt một gói: `src/plans.mjs` (theo thứ tự thời hạn); mô tả và ba gạch đầu dòng của thẻ gói ở `plansGrid` (`src/build/components.mjs`; lưới `.plans` ở `src/assets/site.css` là 1 cột, 2×2 từ 700px: bốn thẻ không để thẻ lẻ, xem lại nếu số thẻ đổi); `keyFacts()` ở `src/build/build.mjs` (lấy gói theo mã, không theo vị trí); cột trong hai bảng so sánh (Bảng giá, Tính năng) và mọi câu liệt kê gói; điều khoản (`docs/legal/eula.*.md`); chụp lại ảnh màn hình Nâng cấp. Test `bảng gói của website…`, `bảng so sánh gói…` và `không còn câu liệt kê chỉ…` bắt các chỗ sót.
+- Đổi giá (VND hay USD) ở `server/wrangler.jsonc` thì đổi cả `src/plans.mjs` (`priceVnd`, `priceUsdCents`) và mọi chỗ nhắc giá trong `src/content/` (test báo lệch giá/hạn mức, và test `mọi giá USD…` báo số USD lạ).
+- **Cách trả:** website nói đúng hai cách trả, VietQR bằng VND qua PayOS và thẻ quốc tế bằng USD qua Creem (giá USD chưa gồm thuế). Đổi cách trả thì sửa Bảng giá, Trang chủ, hướng dẫn mua gói, Hỏi đáp, Về chúng tôi, Giải pháp, Tải xuống, Tính năng, Liên hệ, Dữ liệu và bảo mật, `keyFacts()` ở `src/build/build.mjs` và `docs/legal/`; test `không trang nào … còn câu cũ` chặn các câu "chưa có thẻ quốc tế", "chỉ nhận VietQR", và test `Dữ liệu và bảo mật: số nơi app kết nối…` giữ số nơi khớp bảng.
+- Thêm hay bớt một gói: `src/plans.mjs` (theo thứ tự thời hạn); mô tả và ba gạch đầu dòng của thẻ gói ở `plansGrid` (`src/build/components.mjs`; lưới `.plans` ở `src/assets/site.css` là 1 cột, 2×2 từ 700px: bốn thẻ không để thẻ lẻ, xem lại nếu số thẻ đổi); `keyFacts()` ở `src/build/build.mjs` (lấy gói theo mã, không theo vị trí); cột trong hai bảng so sánh (Bảng giá, Tính năng; giá USD nằm ở hàng Giá của Bảng giá và ở một hàng riêng của Tính năng) và mọi câu liệt kê gói; điều khoản (`docs/legal/eula.*.md`); chụp lại ảnh màn hình Nâng cấp. Test `bảng gói của website…`, `bảng so sánh gói…` và `không còn câu liệt kê chỉ…` bắt các chỗ sót.
 - Không cookie, không analytics, không script hay font của bên thứ ba (khớp lời hứa quyền riêng tư; CSP `default-src 'self'`).
 - Ảnh chụp giao diện app (`src/assets/img/app/`) chụp bằng giao diện thật chạy trong Chrome với IPC giả (`scripts/ui-preview/`: chạy `pnpm exec vite --config scripts/ui-preview/vite.config.ts` ở gốc repo, rồi `node scripts/ui-preview/shoot.mjs`; script ghi WebP và cập nhật dung lượng, kích thước trong `manifest.json`); chụp lại khi giao diện app đổi, sửa tay mô tả (alt) nếu cảnh đổi.
 
````

- [ ] **Step 4: Kiểm đột biến cho ba test**

Script này sửa tạm một file nguồn, chạy test, in kết quả rồi **luôn khôi phục** file (giữ bản gốc trong bộ nhớ, không dùng git). Tạo nó trong thư mục tạm (không vào repo):

**`mutate-check.py`:**

```python
"""Kiểm đột biến: sửa tạm một file nguồn của website, chạy test tương ứng, in kết quả, rồi LUÔN khôi phục file.

Dùng (ở bất kỳ thư mục nào):  python3 -I mutate-check.py <file trong website/> <chuỗi cũ> <chuỗi mới> <mẫu tên test>
Chuỗi cũ phải xuất hiện đúng một lần trong file. File gốc được giữ trong bộ nhớ và ghi lại ở khối finally, nên không cần git.
"""
import os
import subprocess
import sys

ROOT = "/Users/dtphong/Desktop/software_business/ai-translator/website"
os.chdir(ROOT)
path, old, new, pattern = sys.argv[1:5]
original = open(path, encoding="utf-8").read()
if original.count(old) != 1:
    sys.exit(f"không thấy đúng một chỗ khớp trong {path}: {old!r}")
try:
    open(path, "w", encoding="utf-8").write(original.replace(old, new, 1))
    r = subprocess.run(["node", "--test", f"--test-name-pattern={pattern}", "test/site.test.mjs"], capture_output=True, text=True)
    lines = [l for l in r.stdout.splitlines() if l.startswith(("✖", "✔")) or l.lstrip().startswith("+   '") or l.startswith(("ℹ pass", "ℹ fail"))]
    print("\n".join(lines[:12]))
finally:
    open(path, "w", encoding="utf-8").write(original)
    print(f"(đã khôi phục {path})")
```

Rồi chạy ba lần (mỗi lần dựng lại site, vài giây):

Run: `T=<thư mục tạm> && python3 -I $T/mutate-check.py src/content/vi/features.mjs "<td>39,99 USD</td>" "<td>49,99 USD</td>" "giá USD nêu trên website"`
Expected: `✖ mọi giá USD nêu trên website …`, dòng `+   '/tinh-nang/: giá USD lạ "49,99 USD"'`, `(đã khôi phục src/content/vi/features.mjs)`.

Run: `T=<thư mục tạm> && python3 -I $T/mutate-check.py src/content/vi/data-security.mjs "<p>Đúng năm nơi, và không nơi nào" "<p>Đúng bốn nơi, và không nơi nào" "số nơi app kết nối"`
Expected: `✖ Dữ liệu và bảo mật: số nơi app kết nối …`, dòng `+   '/bao-mat-du-lieu/: câu mở đầu phải có "Đúng năm nơi" (bảng có 5 dòng)'`, `(đã khôi phục src/content/vi/data-security.mjs)`.

Run: `T=<thư mục tạm> && python3 -I $T/mutate-check.py src/content/en/about.mjs "No e-invoices yet.</td>" "No international cards and no e-invoices yet.</td>" "câu cũ nói chưa có thẻ"`
Expected: `✖ không trang nào (kể cả llms.txt) còn câu cũ …`, hai dòng `+   '/en/about/: còn câu cũ /no international cards?/i'` và `+   'llms-full.txt: còn câu cũ /no international cards?/i'`, `(đã khôi phục src/content/en/about.mjs)`.

- [ ] **Step 5: Chạy toàn bộ test (xanh)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 90`, `ℹ pass 88`, `ℹ fail 0`, `ℹ skipped 2`. (Ba file bị đột biến phải đúng như trước Step 4: `git status --short -- website | wc -l` ở Step 6 vẫn là số đã nêu, không thêm file nào.)

- [ ] **Step 6: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- website | wc -l`
Expected: `29`.

---

### Task 7: Chụp lại ảnh màn hình Nâng cấp và thêm cảnh đơn thẻ

**Files:**
- Modify: `scripts/ui-preview/shoot.mjs`, `website/src/assets/img/app/manifest.json`, `website/src/assets/img/app/app-upgrade.{vi,en}.webp`, `website/src/assets/img/app/app-upgrade-qr.{vi,en}.webp`, `website/src/content/{vi,en}/guide-license.mjs`, `website/src/content/{vi,en}/pricing.mjs`
- Create: `website/src/assets/img/app/app-upgrade-card.{vi,en}.webp`
- Test: `website/test/site.test.mjs`

Màn hình Nâng cấp của app nay có nhóm "Cách thanh toán" (kế hoạch 03), nên ba ảnh cần chụp lại: danh sách gói (`app-upgrade`), mã VietQR (`app-upgrade-qr`) và một ảnh mới cho đơn thẻ đang chờ (`app-upgrade-card`: thẻ "Hoàn tất thanh toán trong trình duyệt"). Ảnh chụp từ giao diện thật chạy trên trang xem trước với IPC giả (`scripts/ui-preview`, các tham số `suggest=usd` và `checkout=card` do kế hoạch 03 thêm). Mô tả (alt) trong `manifest.json` do ta sửa tay; `shoot.mjs` chỉ cập nhật dung lượng và kích thước.

- [ ] **Step 1: Viết test**

Hai test: hướng dẫn mua gói cho xem đủ ba ảnh ở cả hai ngôn ngữ; `manifest.json` nhất quán (mọi ảnh trang dùng đều có mục, mỗi mục có file thật, đúng dung lượng và có mô tả):

**Sửa `website/test/site.test.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/test/site.test.mjs
+++ b/website/test/site.test.mjs
@@ -520,6 +520,37 @@
   assert.deepEqual(errors, []);
 });
 
+test("hướng dẫn mua gói cho xem đủ ba ảnh màn hình Nâng cấp: danh sách gói, mã VietQR và đơn thẻ quốc tế", () => {
+  const errors = [];
+  for (const [urlPath, lang] of [["/huong-dan/mua-va-kich-hoat-key/", "vi"], ["/en/guide/buy-and-activate/", "en"]]) {
+    const html = htmlByPath.get(urlPath);
+    for (const slug of ["app-upgrade", "app-upgrade-qr", "app-upgrade-card"]) {
+      if (!html.includes(`/assets/img/app/${slug}.${lang}.webp`)) errors.push(`${urlPath}: thiếu ảnh ${slug}.${lang}.webp`);
+    }
+  }
+  assert.deepEqual(errors, []);
+});
+
+test("manifest ảnh app: mọi ảnh trang dùng đều có mục, mỗi mục có file thật, đúng dung lượng và có mô tả", async () => {
+  const manifest = JSON.parse(await readFile(path.join(ROOT, "src/assets/img/app/manifest.json"), "utf8"));
+  const byFile = new Map(manifest.map((e) => [e.file, e]));
+  const errors = [];
+  for (const [urlPath, html] of htmlByPath) {
+    for (const m of html.matchAll(/src="\/assets\/img\/app\/([^"?]+)/g)) if (!byFile.has(m[1])) errors.push(`${urlPath}: ${m[1]} chưa có trong manifest.json`);
+  }
+  for (const e of manifest) {
+    const file = path.join(ROOT, "src/assets/img/app", e.file);
+    if (!(await exists(file))) {
+      errors.push(`${e.file}: không có file`);
+      continue;
+    }
+    const size = (await stat(file)).size;
+    if (size !== e.bytes) errors.push(`${e.file}: manifest ghi ${e.bytes} B nhưng file có ${size} B (chạy lại scripts/ui-preview/shoot.mjs)`);
+    if (!e.description || e.description.length < 40) errors.push(`${e.file}: thiếu mô tả`);
+  }
+  assert.deepEqual(errors, []);
+});
+
 test("JSON-LD của trang giá liệt kê đủ Offer: bốn Offer VND (kể cả 6 Months 269000 ₫ trong 180 ngày) và ba Offer USD", () => {
   const errors = [];
   for (const urlPath of ["/bang-gia/", "/en/pricing/"]) {
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/site.test.mjs 2>&1 | grep -E "^✖ [^f]|^\s+\+ +'|^ℹ (tests|pass|fail)"`
Expected: FAIL một test: `hướng dẫn mua gói cho xem đủ ba ảnh màn hình Nâng cấp: danh sách gói, mã VietQR và đơn thẻ quốc tế`, hai dòng `/huong-dan/mua-va-kich-hoat-key/: thiếu ảnh app-upgrade-card.vi.webp` và `/en/guide/buy-and-activate/: thiếu ảnh app-upgrade-card.en.webp`; `ℹ tests 39`, `ℹ pass 38`, `ℹ fail 1` (test manifest đạt: chưa có trang nào dùng ảnh thiếu).

- [ ] **Step 3: Thêm cảnh `app-upgrade-card` vào công cụ chụp**

**Sửa `scripts/ui-preview/shoot.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/scripts/ui-preview/shoot.mjs
+++ b/scripts/ui-preview/shoot.mjs
@@ -34,6 +34,7 @@
   ["app-settings-privacy", "screen=settings&group=privacy&history=0"],
   ["app-upgrade", "screen=upgrade&plan=free"],
   ["app-upgrade-qr", "screen=upgrade&plan=free&checkout=1"],
+  ["app-upgrade-card", "screen=upgrade&plan=free&suggest=usd&checkout=card"],
   ["app-about", "screen=about", { height: 580 }],
   ...Array.from({ length: 9 }, (_, i) => [`app-onboarding-${i + 1}`, `onboarding=${i + 1}${i === 3 ? "&download=1" : ""}`]),
 ];
```

- [ ] **Step 4: Thêm hai mục manifest và cập nhật mô tả**

`shoot.mjs` báo lỗi nếu `manifest.json` thiếu mục của ảnh nó ghi, nên thêm mục trước (dung lượng 0, sẽ được điền ở bước chụp) và đặt lại mô tả hai ảnh `app-upgrade`:

Run:

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && python3 -I - <<'EOF'
import json

path = "website/src/assets/img/app/manifest.json"
manifest = json.load(open(path, encoding="utf-8"))
DESCRIPTIONS = {
    "app-upgrade.vi.webp": "Màn hình Nâng cấp: hai cách thanh toán (Chuyển khoản VietQR (VND) đang chọn, Thẻ quốc tế (USD)) và bốn gói: Free 30 phút mỗi ngày dùng thử 10 ngày, Monthly 50 giờ giá 50.000 đ, 6 Months 100 giờ giá 269.000 đ, Yearly không giới hạn giá 500.000 đ.",
    "app-upgrade.en.webp": "The Upgrade screen: two ways to pay (VietQR bank transfer (VND), selected, and International card (USD)) and four plans: Free with 30 minutes a day for a 10-day trial, Monthly with 50 hours for 50.000 đ, 6 Months with 100 hours for 269.000 đ and Yearly with unlimited use for 500.000 đ.",
    "app-upgrade-card.vi.webp": "Thanh toán gói Monthly bằng thẻ quốc tế: giá các gói hiện bằng USD và, sau khi app mở trang thanh toán của Creem trong trình duyệt, thẻ Hoàn tất thanh toán trong trình duyệt hiện mã đơn, số tiền $3.99, hạn của trang thanh toán, dòng Đang chờ thanh toán… và nút Mở lại trang thanh toán.",
    "app-upgrade-card.en.webp": "Paying for the Monthly plan by international card: plan prices in USD and, after the app opens the Creem payment page in the browser, a Finish paying in your browser card with the order number, the $3.99 amount, the payment page expiry, a Waiting for your payment… line and a Reopen payment page button.",
}
files = [e["file"] for e in manifest]
at = files.index("app-upgrade-qr.en.webp") + 1
for lang in ("en", "vi"):  # chèn cùng một chỗ: vi rồi en, như các cặp ảnh khác
    name = f"app-upgrade-card.{lang}.webp"
    if name not in files:
        manifest.insert(at, {"file": name, "slug": "app-upgrade-card", "lang": lang, "theme": "light", "width": 1440, "height": 960, "bytes": 0, "description": ""})
for entry in manifest:
    if entry["file"] in DESCRIPTIONS:
        entry["description"] = DESCRIPTIONS.pop(entry["file"])
assert not DESCRIPTIONS, DESCRIPTIONS
json.dump(manifest, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print([e["file"] for e in manifest if "upgrade" in e["file"]])
EOF
```
Expected: `['app-upgrade.vi.webp', 'app-upgrade.en.webp', 'app-upgrade-qr.vi.webp', 'app-upgrade-qr.en.webp', 'app-upgrade-card.vi.webp', 'app-upgrade-card.en.webp']`.

- [ ] **Step 5: Chụp ba cảnh**

Mở trang xem trước (cổng 1430, `strictPort`) ở nền, chụp, rồi dừng nó:

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && (nohup pnpm exec vite --config scripts/ui-preview/vite.config.ts > $TMPDIR/vite-shoot.log 2>&1 &) ; sleep 4; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:1430/`
Expected: `200`.

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && PATH=/opt/homebrew/bin:$PATH node scripts/ui-preview/shoot.mjs app-upgrade app-upgrade-qr app-upgrade-card`
Expected: sáu dòng `app-upgrade.vi.webp <số> B`, `app-upgrade-qr.vi.webp <số> B`, `app-upgrade-card.vi.webp <số> B` rồi ba dòng `.en.webp`, mỗi ảnh khoảng 50 đến 65 KB; không có dòng lỗi.

Run: `kill $(lsof -nP -iTCP:1430 -sTCP:LISTEN -t); sleep 1; lsof -nP -iTCP:1430 -sTCP:LISTEN | wc -l`
Expected: `0`.

- [ ] **Step 6: Xem bằng mắt sáu ảnh**

Đổi sang PNG rồi mở từng ảnh bằng công cụ xem ảnh: `cd /Users/dtphong/Desktop/software_business/ai-translator/website/src/assets/img/app && for f in app-upgrade app-upgrade-qr app-upgrade-card; do for l in vi en; do dwebp -quiet $f.$l.webp -o $TMPDIR/$f.$l.png; done; done`. Kiểm:

- `app-upgrade.*`: hai ô "Chuyển khoản VietQR (VND)" (đang chọn, viền xanh) và "Thẻ quốc tế (USD)" ở đầu màn hình; bốn thẻ gói giá bằng đồng (`50.000 đ`, `269.000 đ`, `500.000 đ`); ghi chú VietQR; ô email; nút "Tạo mã thanh toán".
- `app-upgrade-qr.*`: như trước, có mã QR mẫu, "Đơn 1000428 · 50.000 đ", nút "Mở trang thanh toán" và "Hủy", phía trên vẫn có nhóm Cách thanh toán (đang khóa).
- `app-upgrade-card.*`: "Thẻ quốc tế (USD)" đang chọn; giá `$3.99`, `$21.99`, `$39.99` (Free `$0.00`); dòng ghi chú "Giá chưa gồm thuế (nếu có)"; thẻ "Hoàn tất thanh toán trong trình duyệt" với "Đơn 1000429 · $3.99", dòng "Đang chờ thanh toán…", hai nút "Mở lại trang thanh toán" và "Hủy"; không có ô mã QR.
- Cả bản en tương ứng ("VietQR bank transfer (VND)", "International card (USD)", "Finish paying in your browser", "Reopen payment page"). Không ảnh nào lộ tên thư viện hay model.

- [ ] **Step 7: Đưa ảnh đơn thẻ vào hướng dẫn mua gói; cập nhật mô tả ảnh ở Bảng giá**

**Sửa `website/src/content/vi/guide-license.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/guide-license.mjs
+++ b/website/src/content/vi/guide-license.mjs
@@ -87,6 +87,12 @@
   alt: "Mã VietQR hiện trong app kèm mã đơn, giờ hết hạn của mã, nút Mở trang thanh toán và dòng trạng thái đang chờ chuyển khoản",
   caption: "Mã VietQR trong app, kèm mã đơn.",
 })}
+${appShot({
+  slug: "app-upgrade-card",
+  lang: "vi",
+  alt: "Thanh toán bằng thẻ quốc tế trong app: Cách thanh toán đang chọn Thẻ quốc tế (USD), giá các gói bằng USD, và thẻ Hoàn tất thanh toán trong trình duyệt với mã đơn, số tiền, dòng Đang chờ thanh toán… và nút Mở lại trang thanh toán",
+  caption: "Đơn thẻ quốc tế đang chờ: trang thanh toán của Creem mở trong trình duyệt.",
+})}
 <p>VietQR chỉ dùng được với tài khoản ngân hàng Việt Nam, bằng VND, qua PayOS. Thẻ quốc tế tính bằng USD, chưa gồm thuế (nếu có) và do Creem xử lý: sao kê thẻ có thể ghi tên Creem. Giá và hạn mức xem ở <a href="/bang-gia/">bảng giá</a>.</p>
 
 <h2 id="nhap-key">Nhận key qua email và nhập key</h2>
```

**Sửa `website/src/content/en/guide-license.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/guide-license.mjs
+++ b/website/src/content/en/guide-license.mjs
@@ -87,6 +87,12 @@
   alt: "A VietQR code drawn inside the app with the order number, the code’s expiry time, an Open payment page button and a status line waiting for the transfer",
   caption: "The VietQR code in the app, with the order number.",
 })}
+${appShot({
+  slug: "app-upgrade-card",
+  lang: "en",
+  alt: "Paying by international card in the app: the Payment method set to International card (USD), plan prices in USD, and the Finish paying in your browser card with the order number, the amount, a Waiting for your payment… line and a Reopen payment page button",
+  caption: "A pending card order: the Creem payment page opens in your browser.",
+})}
 <p>VietQR is bank transfer from a Vietnamese bank, in VND, through PayOS. International cards are charged in USD, excluding tax (if any), and are handled by Creem: your card statement may show Creem’s name. See the <a href="/en/pricing/">pricing page</a> for prices and quotas.</p>
 
 <h2 id="enter-key">Get your key by email and enter it</h2>
```

**Sửa `website/src/content/vi/pricing.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/vi/pricing.mjs
+++ b/website/src/content/vi/pricing.mjs
@@ -92,7 +92,7 @@
 <section class="section section-alt"><div class="container">
 <div class="split wide-left reverse">
 <div>
-${appShot({ slug: "app-upgrade", lang: "vi", alt: "Màn hình Nâng cấp trong app hiển thị bốn gói Free, Monthly, 6 Months và Yearly với hạn mức và giá", caption: "Màn hình Nâng cấp trong app: bốn gói, giá và hạn mức." })}
+${appShot({ slug: "app-upgrade", lang: "vi", alt: "Màn hình Nâng cấp trong app: chọn Cách thanh toán (VietQR hoặc thẻ quốc tế) và bốn gói Free, Monthly, 6 Months và Yearly với hạn mức và giá", caption: "Màn hình Nâng cấp trong app: hai cách trả, bốn gói, giá và hạn mức." })}
 </div>
 <div class="stack-lg reveal">
 <span class="eyebrow">Thời lượng dịch</span>
```

**Sửa `website/src/content/en/pricing.mjs`** (diff đã kiểm chứng; dòng `-` xóa, dòng `+` thêm):

```diff
--- a/website/src/content/en/pricing.mjs
+++ b/website/src/content/en/pricing.mjs
@@ -94,7 +94,7 @@
 <section class="section section-alt"><div class="container">
 <div class="split wide-left reverse">
 <div>
-${appShot({ slug: "app-upgrade", lang: "en", alt: "The Upgrade screen in the app showing the Free, Monthly, 6 Months and Yearly plans with their allowances and prices", caption: "The Upgrade screen in the app: four plans, with prices and allowances." })}
+${appShot({ slug: "app-upgrade", lang: "en", alt: "The Upgrade screen in the app: the payment method choice (VietQR or international card) and the Free, Monthly, 6 Months and Yearly plans with their allowances and prices", caption: "The Upgrade screen in the app: two ways to pay, four plans, with prices and allowances." })}
 </div>
 <div class="stack-lg reveal">
 <span class="eyebrow">Translation time</span>
```

- [ ] **Step 8: Chạy toàn bộ test (xanh)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 92`, `ℹ pass 90`, `ℹ fail 0`, `ℹ skipped 2`. Test manifest đạt chỉ khi `manifest.json` ghi đúng dung lượng của từng ảnh vừa chụp.

- [ ] **Step 9: Kiểm danh sách file đã đổi (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short -- website scripts/ui-preview/shoot.mjs | wc -l`
Expected: `37` (29 của các task trước, sáu ảnh `.webp`, `manifest.json`, `shoot.mjs`).

---

### Task 8: Kiểm tra toàn bộ phần website

**Files:** không sửa file nào.

- [ ] **Step 1: Test và dựng toàn bộ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)" && pnpm build 2>&1 | tail -1`
Expected: `ℹ tests 92`, `ℹ pass 90`, `ℹ fail 0`, `ℹ skipped 2`; rồi `Đã sinh 48 trang vào dist (/assets/bundle/site.<mã>.css, /assets/bundle/site.<mã>.js)`. Test `không lộ công nghệ lõi` nằm trong số đạt.

- [ ] **Step 2: Xem bằng mắt các vùng đã sửa (desktop, điện thoại, hai ngôn ngữ)**

Tạo script kiểm trong thư mục tạm (không vào repo); nó chụp chín vùng, rồi kiểm ảnh app trên bốn trang tải được (kể cả lazy-load), không lỗi console hay CSP:

**`visual-check-web.mjs`:**

```js
// Kiểm bằng mắt các vùng website đã sửa (cần `node src/serve.mjs 4190` đang chạy ở thư mục website/ sau `pnpm build`).
// Ghi ảnh vào thư mục SHOTS_DIR (thư mục tạm của phiên, KHÔNG phải trong repo) và kiểm ảnh app tải được, không lỗi console/CSP.
//   SHOTS_DIR=<thư mục> node visual-check-web.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { launch } from "/Users/dtphong/Desktop/software_business/ai-translator/website/tools/browser/cdp.mjs";

const OUT = process.env.SHOTS_DIR;
if (!OUT) throw new Error("đặt SHOTS_DIR là thư mục ghi ảnh (thư mục tạm của phiên, không phải trong repo)");
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:4190";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome (đặt CHROME=<đường dẫn>)");

// Chụp vùng từ đầu phần tử `from` tới đầu phần tử `to` (không có `to` thì hết chính `from`).
async function clip(page, file, from, to) {
  const r = await page.eval(`(() => {
    const a = document.querySelector(${JSON.stringify(from)});
    if (!a) return null;
    const top = a.getBoundingClientRect().y + scrollY;
    const b = ${to ? `document.querySelector(${JSON.stringify(to)})` : "null"};
    const bottom = b ? b.getBoundingClientRect().y + scrollY : top + a.getBoundingClientRect().height;
    return { x: 0, y: top, width: innerWidth, height: Math.min(bottom - top, 4000) };
  })()`);
  if (!r) throw new Error(`không thấy ${from}`);
  const shot = await page.s.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...r, scale: 1 } });
  writeFileSync(`${OUT}/${file}.png`, Buffer.from(shot.data, "base64"));
  console.log(`${file}.png ${Math.round(r.width)}×${Math.round(r.height)}`);
}

// [chiều rộng cửa sổ, đường dẫn, [[tên ảnh, phần tử đầu, phần tử cuối]]]
const JOBS = [
  [1280, "/bang-gia/", [["bang-gia-the", ".plans", null], ["bang-gia-so-sanh", "table.compare", null]]],
  [390, "/bang-gia/", [["bang-gia-the-dien-thoai", ".plans", null]]],
  [1280, "/en/pricing/", [["en-pricing-the", ".plans", null], ["en-pricing-so-sanh", "table.compare", null]]],
  [1280, "/tinh-nang/", [["tinh-nang-so-sanh", "table.compare", null]]],
  [1280, "/bao-mat-du-lieu/", [["bao-mat-noi-ket-noi", "#ket-noi-mang", "#da-kiem"], ["bao-mat-ben-xu-ly", "#ben-xu-ly", "#bao-ve"]]],
  [1280, "/huong-dan/mua-va-kich-hoat-key/", [["huong-dan-mua", "#mua-goi", "#nhap-key"]]],
];
for (const [width, url, clips] of JOBS) {
  // reduceMotion: các khối .reveal hiện ngay, ảnh chụp không bị mờ.
  const page = await browser.newPage({ width, height: 900, mobile: width < 600, reduceMotion: true });
  await page.goto(`${BASE}${url}`);
  for (const [file, from, to] of clips) await clip(page, file, from, to);
  if (page.errors.length) console.log(`LỖI trang ${url}:`, page.errors.slice(0, 3));
  await page.close();
}

// Ảnh app trên các trang đã sửa: cuộn tới từng ảnh (lazy-load), rồi kiểm kích thước thật.
for (const url of ["/huong-dan/mua-va-kich-hoat-key/", "/en/guide/buy-and-activate/", "/bang-gia/", "/en/pricing/"]) {
  const page = await browser.newPage({ width: 1280, height: 900, reduceMotion: true });
  await page.goto(`${BASE}${url}`);
  const n = await page.eval(`document.querySelectorAll("figure.shot img").length`);
  for (let i = 0; i < n; i++) {
    await page.eval(`document.querySelectorAll("figure.shot img")[${i}].scrollIntoView({ block: "center" })`);
    await sleep(500);
  }
  const imgs = await page.eval(`[...document.querySelectorAll("figure.shot img")].map((i) => i.src.split("/").pop().split("?")[0] + " " + i.naturalWidth + "x" + i.naturalHeight)`);
  console.log(url, JSON.stringify(imgs), page.errors.length ? `LỖI: ${page.errors.slice(0, 2)}` : "không lỗi");
  await page.close();
}
await browser.close();
```

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && (nohup node src/serve.mjs 4190 > $TMPDIR/serve-website.log 2>&1 &) ; sleep 2; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4190/bang-gia/ && SHOTS_DIR=$TMPDIR/website-shots node $TMPDIR/visual-check-web.mjs`
Expected: `200`; chín dòng ảnh (`bang-gia-the.png 1280×1041`, `bang-gia-so-sanh.png 1280×852`, `bang-gia-the-dien-thoai.png 390×2098`, `en-pricing-the.png 1280×1041`, `en-pricing-so-sanh.png 1280×852`, `tinh-nang-so-sanh.png 1280×598`, `bao-mat-noi-ket-noi.png 1280×717`, `bao-mat-ben-xu-ly.png 1280×616`, `huong-dan-mua.png 1280×2813`; chiều cao có thể lệch vài điểm ảnh); rồi bốn dòng ảnh app, mỗi dòng kết thúc `không lỗi`, ảnh đều `1440x960` (hướng dẫn mua gói: `app-upgrade`, `app-upgrade-qr`, `app-upgrade-card`, `app-settings-license`).

Mở từng ảnh PNG trong `$TMPDIR/website-shots` và kiểm:

- `bang-gia-the.png`, `en-pricing-the.png`: bốn thẻ; ba thẻ trả phí có dòng đậm "hoặc 3,99 USD bằng thẻ quốc tế" / "or $3.99 by international card" ngay dưới giá VND; thẻ Free không có dòng USD.
- `bang-gia-so-sanh.png`, `en-pricing-so-sanh.png`: hàng "Giá": số VND một dòng, "hoặc 3,99 USD" dòng nhỏ **bên dưới** (không dính liền "mỗi đơn"); có hàng "Cách thanh toán" / "How to pay".
- `bang-gia-the-dien-thoai.png`: bốn thẻ xếp một cột, không tràn ngang.
- `tinh-nang-so-sanh.png`: hai hàng giá, "Giá (VietQR, VND)" và "Giá (thẻ quốc tế, USD, chưa gồm thuế)".
- `bao-mat-noi-ket-noi.png`: câu "Đúng năm nơi…" và đúng năm dòng, có "Trang thanh toán Creem (checkout.creem.io)".
- `bao-mat-ben-xu-ly.png`: có hàng "Creem (Armitage Labs OÜ, Estonia)" và câu "…còn Creem là pháp nhân Estonia…".
- `huong-dan-mua.png`: bảy bước đánh số; ba ảnh màn hình (ảnh thứ hai và ba có thể trắng trong ảnh chụp dài, vì lazy-load; dòng kiểm ảnh ở trên đã xác nhận chúng tải được).

Rồi dừng máy chủ xem thử: `kill $(lsof -nP -iTCP:4190 -sTCP:LISTEN -t); sleep 1; lsof -nP -iTCP:4190 -sTCP:LISTEN | wc -l`
Expected: `0`.

- [ ] **Step 3: Đối chiếu với spec §6 (Website) và §8**

| Mục của spec | Task |
|---|---|
| `plans.mjs` có giá USD; test đối chiếu giá với `server/wrangler.jsonc` mở rộng cho USD (spec ghi `priceUsd`; ở đây là `priceUsdCents`, cùng đơn vị cent với server) | Task 1 |
| Trang giá (vi, en) nêu hai cách trả, giá USD "chưa gồm thuế", thanh toán quốc tế do Creem xử lý | Task 2, 3 |
| `guide-license` nêu hai cách trả, và chữ khớp màn hình Nâng cấp của app | Task 4 |
| Nội dung chỉ nói điều có thật; không nêu công nghệ lõi; test chặn từ khóa công nghệ lõi chạy lại | mọi task (test `không lộ công nghệ lõi` nằm trong mỗi lần chạy `pnpm test`), Task 8 Step 1 |
| (ngoài spec, phát hiện khi làm) JSON-LD, `llms.txt`, các trang Về chúng tôi, Giải pháp, Tải xuống, Tính năng, Liên hệ, Dữ liệu và bảo mật, README | Task 2, 5, 6 |
| (ngoài spec) ba test quét cả site; ảnh màn hình Nâng cấp mới | Task 6, 7 |
| EULA 1.3, Chính sách quyền riêng tư 1.2, `docs/legal/README.md`, runbook | kế hoạch 05 |

- [ ] **Step 4: Kiểm lần cuối cây làm việc và tiến trình nền (không commit)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short -- website scripts/ui-preview/shoot.mjs | wc -l && lsof -nP -iTCP:1430 -iTCP:4190 -sTCP:LISTEN | wc -l`
Expected: `payment`; `37`; `0`. **Dừng ở đây**: không commit, không push, không deploy; chờ chủ dự án cho phép (spec D9).

---

## Việc nối tiếp (ngoài kế hoạch này)

- **Kế hoạch 05 (pháp lý và vận hành):** EULA 1.3, Chính sách quyền riêng tư 1.2, `docs/legal/README.md` và runbook `docs/release/phat-hanh.md`. Hai trang Điều khoản và Chính sách của website sinh từ `docs/legal/*.md`, nên khi EULA lên 1.3 phải đổi test `điều khoản (EULA) nêu gói 6 Months đúng giá và thời hạn, phiên bản 1.2` (kế hoạch 05 làm).
- **Triển khai website là bước cuối** (chủ dự án chạy `pnpm deploy` ở `website/`): sau khi server (kế hoạch 01, 02) đã nghiệm thu bằng một đơn thật và app mới đã phát hành, kèm các văn bản pháp lý mới; trang nói "có thẻ quốc tế" trước đó là lời hứa sai. Ngày `modified` của các trang đã sửa (và `lastmod` trong sitemap) lấy theo ngày sửa, không theo ngày deploy.
- **Ảnh `app-upgrade*.webp`** chụp từ trang xem trước của app tại thời điểm này; nếu giao diện Nâng cấp còn đổi trước khi phát hành, chụp lại bằng `scripts/ui-preview/shoot.mjs` (`website/README.md`).
