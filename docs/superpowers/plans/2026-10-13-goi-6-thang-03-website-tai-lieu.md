# Gói 6 Months · Kế hoạch 03: website và tài liệu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** website `aitranslator.io.vn` (vi và en) và tài liệu nói đúng về gói 6 Months (269.000 ₫, 180 ngày, 100 giờ mỗi chu kỳ 30 ngày) ở mọi chỗ nhắc gói hay giá, với giao diện đồng bộ kiểu hiện có, và có test chặn lệch giá hay sót chỗ cũ.

**Architecture:** website lấy gói và giá từ `website/src/plans.mjs` (test đối chiếu `server/wrangler.jsonc`). Thêm gói vào đó rồi sửa: thẻ gói (`plansGrid`), `llms.txt` (`keyFacts()` đang lấy gói theo vị trí mảng nên phải đổi sang lấy theo mã), lưới thẻ 2×2, hai bảng so sánh, mọi câu liệt kê gói trong 14 trang × 2 ngôn ngữ, EULA (website sinh trang điều khoản từ chính `docs/legal`), ảnh màn hình Nâng cấp, và tài liệu. Ba test mới chặn sót: cột trong bảng, câu chỉ liệt kê Monthly và Yearly, và thẻ gói khớp `plans.mjs`.

**Tech Stack:** Node (bộ sinh trang thuần, `node --test`), HTML/CSS tĩnh, Google Chrome không đầu qua CDP (`website/tools/browser/cdp.mjs`), `scripts/ui-preview/shoot.mjs` + `cwebp` để chụp ảnh app.

**Spec:** `docs/superpowers/specs/2026-10-13-six-months-plan-design.md` (§4 website, §5 tài liệu, §6 triển khai). Điều kiện: kế hoạch 01 xong Task 3 (cần `server/wrangler.jsonc` có `six_months` cho test đối chiếu giá); kế hoạch 02 xong Task 4 (cần dữ liệu giả và lưới 2×2 của app để chụp ảnh, chỉ cho Task 4 của kế hoạch này).

**Không làm ở đây:** deploy website (runbook mục 8 bước 8: sau khi bản app có gói 6 Months đã đăng, và chỉ khi chủ dự án cho phép). Website chỉ được nói điều đã thật.

---

## Quy ước chung cho mọi task (đọc trước khi làm)

- Thư mục dự án: `/Users/dtphong/Desktop/software_business/ai-translator`. **Mỗi lệnh Bash bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`** (shell không giữ thư mục giữa các lệnh).
- Làm **trực tiếp trên nhánh `main`** (chủ dự án chỉ định). Trước mỗi commit: `git branch --show-current` phải in `main`.
- **Không `git add -A`, không `git add .`.** Trong repo có file chưa theo dõi `docs/superpowers/specs/2026-10-11-doc-to-ban-dich-research.md` của việc khác: không đụng, không đưa vào commit. Luôn `git add` đúng từng đường dẫn của task.
- **Không push, không deploy.**
- Kết thúc mỗi commit message bằng đúng dòng sau (sau một dòng trống):
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- **Dựng và test website bằng thư mục dựng riêng** `WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m` (nằm trong `target/`, git bỏ qua), **không** dùng `website/dist` mặc định: có thể đang có máy chủ xem thử của việc khác phục vụ thư mục đó (cổng 4173); không đụng tiến trình đó. Lệnh test: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m pnpm test`.
- Máy chủ xem thử của kế hoạch này dùng cổng **4175** (website) và **1430** (trang xem trước của app, cổng cố định trong `shoot.mjs`). Kiểm trống bằng `lsof -nP -iTCP:<cổng> -sTCP:LISTEN` trước khi bật; **chỉ tắt tiến trình do chính mình mở**, tra PID bằng `lsof -nP -iTCP:<cổng> -sTCP:LISTEN -t`.
- Nội dung website: chỉ nói điều có thật, không công bố công nghệ lõi (`website/README.md`, test `không lộ công nghệ lõi` chặn). Các số của gói 6 Months đúng như spec §1: 269.000 ₫, 180 ngày, 100 giờ (6000 phút) mỗi chu kỳ 30 ngày, quy ra khoảng 44.800 ₫ mỗi tháng; đổi gói: Monthly còn 20 ngày → 6 Months được cộng 22 ngày (chạy 202 ngày).
- Mốc trước khi sửa (đã đo ngày 2026-10-13): website `ℹ tests 74`, `ℹ pass 72`, `ℹ fail 0`, `ℹ skipped 2` (khoảng 65 giây); gốc repo `pnpm test` **23 file, 248 test**. Số "Expected" ở các task dưới là tổng sau task đó.

## Cấu trúc file

| File | Việc |
|---|---|
| `website/src/plans.mjs`, `src/build/components.mjs`, `src/build/build.mjs`, `src/assets/site.css` | gói, thẻ gói, `llms.txt`, lưới 2×2 (Task 1) |
| `website/test/site.test.mjs` | bảy test mới (Task 1, 2, 3) |
| `docs/legal/eula.{vi,en}.md`, `docs/legal/README.md`, `website/src/content/legal.mjs`, `website/src/content/{vi,en}/terms.mjs` | EULA 1.2 (Task 2) |
| `website/src/content/{vi,en}/{about,compare-offline-cloud,download,faq,features,guide,guide-glossary,guide-history-export,guide-license,guide-troubleshooting,home,pricing,solutions,solutions-webinar}.mjs` | nội dung 28 file (Task 3) |
| `website/src/assets/img/app/app-upgrade{,-qr}.{vi,en}.webp`, `manifest.json` | ảnh màn hình Nâng cấp (Task 4) |
| `website/README.md`, hai spec cũ, `docs/release/phat-hanh.md` | tài liệu (Task 5) |

Ngày sửa của từng trang (sitemap `lastmod`, dòng "Cập nhật") tự lấy từ git (`website/src/content/index.mjs`), không phải sửa tay.

---

### Task 0: Kiểm điều kiện và ghi mốc

**Files:** không sửa file nào, không commit.

- [ ] **Step 1: Nhánh, cây làm việc, điều kiện từ kế hoạch 01 và 02**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short && grep -c '"six_months"' server/wrangler.jsonc && grep -c 'six_months' scripts/ui-preview/tauri-mock.ts`
Expected: `main`; `git status` chỉ có file chưa theo dõi nói ở trên (và các file kế hoạch nếu chưa commit); rồi `1` (kế hoạch 01 Task 3 đã xong) và một số `≥ 1` (kế hoạch 02 Task 4 đã xong). Số đầu bằng `0`: **dừng**, làm kế hoạch 01 trước. Số sau bằng `0`: làm được Task 1 đến 3 và 5, **chưa** làm được Task 4 (chụp ảnh): làm kế hoạch 02 trước khi tới Task 4.

- [ ] **Step 2: Mốc website**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && mkdir -p target/website-dist-6m && cd website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 74`, `ℹ pass 72`, `ℹ fail 0`, `ℹ skipped 2`, không dòng `✖`.

- [ ] **Step 3: Mốc gốc repo và cổng**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm test 2>&1 | grep -E "×|Test Files|Tests " && (lsof -nP -iTCP:4175 -iTCP:1430 -sTCP:LISTEN || echo "4175 và 1430 trống")`
Expected: `Test Files  23 passed (23)`, `Tests  248 passed (248)`; `4175 và 1430 trống`. Có tiến trình nghe một trong hai cổng (không phải của bạn): đừng tắt nó, báo chủ dự án (kế hoạch này cần đúng hai cổng đó).

---

### Task 1: Dữ liệu gói, thẻ gói, `llms.txt` và lưới thẻ 2×2

Hai điểm dễ sai khi thêm một gói vào **giữa** danh sách:
- `keyFacts()` ở `src/build/build.mjs` viết `const [free, monthly, yearly] = PLANS;` (lấy theo vị trí): chèn gói vào giữa thì `yearly` thành gói 6 Months và `llms.txt` ghi sai giá. Sửa thành lấy theo mã.
- Lưới `.plans` (`auto-fit, minmax(290px)`) ra **3 cột** từ khoảng 1024px, bốn thẻ thành 3 + 1 (một thẻ lẻ). Đổi thành 1 cột trên điện thoại, 2×2 từ 700px (thử 4 cột: thẻ 275px quá hẹp cho giá cỡ lớn, chữ "269.000 ₫" xuống dòng).

**Files:**
- Modify: `website/src/plans.mjs`, `website/src/build/components.mjs`, `website/src/build/build.mjs`, `website/src/assets/site.css`
- Test: `website/test/site.test.mjs`

- [ ] **Step 1: Viết test (đỏ)**

Trong `website/test/site.test.mjs`:

1) **Thay** dòng import:
```js
import { PLANS } from "../src/plans.mjs";
```
bằng
```js
import { PLANS, vnd } from "../src/plans.mjs";
```

2) Trong test `giá và hạn mức trên website khớp server/wrangler.jsonc`, **thay**
```js
  for (const code of ["monthly", "yearly"]) {
```
bằng
```js
  for (const code of ["monthly", "six_months", "yearly"]) {
```

3) **Thêm vào cuối file**:

````js

// ---- Gói 6 Months (spec 2026-10-13 §4) ----

test("bảng gói của website: Free rồi ba gói trả phí theo thứ tự thời hạn", () => {
  assert.deepEqual(PLANS.map((p) => p.code), ["free", "monthly", "six_months", "yearly"]);
  assert.deepEqual(PLANS.map((p) => p.days), [10, 30, 180, 365]);
});

test("thẻ gói ở trang chủ và Bảng giá: đủ bốn thẻ theo thứ tự, đúng giá, nhãn Tiết kiệm nhất chỉ ở Yearly", () => {
  const errors = [];
  for (const [urlPath, lang] of [["/", "vi"], ["/bang-gia/", "vi"], ["/en/", "en"], ["/en/pricing/", "en"]]) {
    const html = htmlByPath.get(urlPath);
    const start = html.indexOf('<div class="plans">');
    const end = html.indexOf('<p class="disclaimer">', start);
    if (start < 0 || end < 0) {
      errors.push(`${urlPath}: không thấy khối thẻ gói`);
      continue;
    }
    const block = html.slice(start, end);
    const names = [...block.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1]);
    const prices = [...block.matchAll(/<div class="price"><b>([^<]*)<\/b>/g)].map((m) => m[1].replaceAll("&nbsp;", " "));
    const featured = [...block.matchAll(/<div class="plan featured[^>]*>[\s\S]*?<h3>([^<]*)<\/h3>/g)].map((m) => m[1]);
    const wantNames = PLANS.map((p) => (lang === "en" ? p.nameEn : p.nameVi));
    const wantPrices = PLANS.map((p) => (p.priceVnd === 0 ? (lang === "en" ? "Free" : "Miễn phí") : vnd(p.priceVnd, lang)));
    if (JSON.stringify(names) !== JSON.stringify(wantNames)) errors.push(`${urlPath}: tên thẻ ${names.join(" | ")}`);
    if (JSON.stringify(prices) !== JSON.stringify(wantPrices)) errors.push(`${urlPath}: giá thẻ ${prices.join(" | ")}`);
    if (JSON.stringify(featured) !== JSON.stringify(["Yearly"])) errors.push(`${urlPath}: thẻ nổi bật ${featured.join(" | ")}`);
  }
  assert.deepEqual(errors, []);
});

test("JSON-LD của trang giá liệt kê đủ bốn Offer, kể cả 6 Months 269000 ₫ trong 180 ngày", () => {
  const errors = [];
  for (const urlPath of ["/bang-gia/", "/en/pricing/"]) {
    const html = htmlByPath.get(urlPath);
    const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    const app = data["@graph"].find((n) => n["@type"] === "SoftwareApplication");
    const offers = app?.offers ?? [];
    const six = offers.find((o) => /6 Months/.test(o.name));
    if (offers.length !== 4) errors.push(`${urlPath}: ${offers.length} Offer (cần 4)`);
    if (!six || six.price !== "269000" || six.priceCurrency !== "VND" || six.eligibleDuration?.value !== 180) {
      errors.push(`${urlPath}: Offer 6 Months sai: ${JSON.stringify(six)}`);
    }
  }
  assert.deepEqual(errors, []);
});

test("llms.txt nêu giá cả ba gói trả phí, lấy từ plans.mjs", async () => {
  const llms = await readFile(path.join(DIST, "llms.txt"), "utf8");
  const line = llms.split("\n").find((l) => l.startsWith("- Pricing:")) ?? "";
  for (const p of PLANS.filter((x) => x.priceVnd > 0)) {
    assert.ok(line.includes(`${p.nameEn} ${vnd(p.priceVnd)}`), `llms.txt: thiếu "${p.nameEn} ${vnd(p.priceVnd)}" trong: ${line}`);
  }
});
````

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)" | sort -u`
Expected: FAIL đúng **ba** test: `giá và hạn mức trên website khớp server/wrangler.jsonc` (website chưa có gói `six_months`), `bảng gói của website: Free rồi ba gói trả phí theo thứ tự thời hạn`, và `JSON-LD của trang giá liệt kê đủ bốn Offer…` (mới có ba Offer); `ℹ tests 78`, `ℹ fail 3`. Hai test mới còn lại (`thẻ gói ở trang chủ và Bảng giá…`, `llms.txt nêu giá…`) xanh ở bước này vì tự đối chiếu với `PLANS`: chúng canh các lỗi sinh ra khi thêm gói (render lệch dữ liệu, lấy gói theo vị trí) ở bước sau.

- [ ] **Step 3: Thêm gói, thẻ gói, sửa `keyFacts()`**

**3a. `website/src/plans.mjs`** — **thay** ba dòng đầu:
```js
// Ba gói bán (spec 2026-10-07-three-plans-single-device-design.md). Giá và hạn mức PHẢI khớp server/wrangler.jsonc;
// test/plans.test.mjs đối chiếu hai nơi nên đổi giá ở server mà quên website sẽ làm test đỏ.
export const PLANS = [
```
bằng
```js
// Gói Free dùng thử và ba gói trả phí (spec 2026-10-07-three-plans-single-device-design.md; six_months thêm ở spec
// 2026-10-13-six-months-plan-design.md). Giá và hạn mức PHẢI khớp server/wrangler.jsonc;
// test/site.test.mjs đối chiếu hai nơi nên đổi giá ở server mà quên website sẽ làm test đỏ.
export const PLANS = [
```
và **thay**
```js
  {
    code: "yearly",
```
bằng
```js
  {
    code: "six_months",
    nameVi: "6 Months",
    nameEn: "6 Months",
    priceVnd: 269000,
    minutesPerCycle: 6000,
    days: 180,
    summaryVi: "100 giờ dịch mỗi 30 ngày trong 180 ngày, đầy đủ tính năng Pro.",
    summaryEn: "100 hours of translation per 30 days for 180 days, all Pro features.",
  },
  {
    code: "yearly",
```

**3b. `website/src/build/components.mjs`** (hàm `plansGrid`):

1) **Thay** `/** Ba gói giá. lang: "vi" | "en". Trả HTML của .plans. */` bằng `/** Các gói giá (Free và ba gói trả phí). lang: "vi" | "en". Trả HTML của .plans. */`

2) **Thay** dòng `yearly: { for: …` trong `const L = {…}` (giữ nguyên dòng đó, thêm dòng mới **ngay trước** nó):
```js
    six_months: { for: en ? "For a half-year project or steady use." : "Cho dự án nửa năm hoặc dùng đều đặn.", per: en ? "per 180 days · prepaid" : "cho 180 ngày · trả trước" },
```

3) Trong `const feats = {…}`, **thêm ngay trước** khối `yearly: en` :
```js
    six_months: en
      ? ["100 hours of translation per 30-day cycle", "All Pro features", "One payment for half a year, about 44,800 ₫ per month"]
      : ["100 giờ dịch cho mỗi chu kỳ 30 ngày", "Đầy đủ tính năng Pro", "Trả một lần cho nửa năm, quy ra khoảng 44.800 ₫ mỗi tháng"],
```

**3c. `website/src/build/build.mjs`** (hàm `keyFacts`):

1) **Thay**
```js
  const [free, monthly, yearly] = PLANS;
```
bằng
```js
  const [free, monthly, sixMonths, yearly] = ["free", "monthly", "six_months", "yearly"].map((code) => PLANS.find((p) => p.code === code));
```

2) Trong dòng bắt đầu bằng `` `- Pricing: ``, **thay**
```
${monthly.nameEn} ${vnd(monthly.priceVnd)} (${monthly.minutesPerCycle / 60} h per ${monthly.days} days); ${yearly.nameEn}
```
bằng
```
${monthly.nameEn} ${vnd(monthly.priceVnd)} (${monthly.minutesPerCycle / 60} h per ${monthly.days} days); ${sixMonths.nameEn} ${vnd(sixMonths.priceVnd)} (${sixMonths.minutesPerCycle / 60} h per 30 days, ${sixMonths.days} days); ${yearly.nameEn}
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 78`, `ℹ pass 76`, `ℹ fail 0`, `ℹ skipped 2`, không dòng `✖`.

- [ ] **Step 5: Kiểm bố cục bằng Chrome, thấy ĐỎ vì CSS lưới chưa sửa**

Ghi script kiểm (nằm trong `target/`, git bỏ qua):

````bash
mkdir -p /Users/dtphong/Desktop/software_business/ai-translator/target/website-six-months && cat > /Users/dtphong/Desktop/software_business/ai-translator/target/website-six-months/verify-site-plans.mjs <<'EOF'
// Kiểm lưới thẻ gói của website (trang chủ và Bảng giá, vi và en) ở nhiều bề rộng, bằng Chrome không đầu qua CDP.
// Dùng: node verify-site-plans.mjs [địa chỉ website] [thư mục ghi ảnh]. In PASS/FAIL từng điều kiện; có FAIL thì mã thoát 1.
import { mkdirSync } from "node:fs";
import { launch } from "/Users/dtphong/Desktop/software_business/ai-translator/website/tools/browser/cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:4175";
const out = process.argv[3];
if (out) mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};

const LAYOUT = `(() => {
  const grid = document.querySelector(".plans");
  const cards = [...grid.children];
  return JSON.stringify({
    cols: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    tops: cards.map((c) => Math.round(c.getBoundingClientRect().top + scrollY)),
    n: cards.length,
    clipped: cards.filter((c) => c.scrollWidth > c.clientWidth + 1).length,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  });
})()`;

const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome (đặt CHROME=<đường dẫn>)");
for (const width of [320, 375, 699, 700, 768, 1024, 1280, 1440, 1920]) {
  for (const path of ["/bang-gia/", "/en/pricing/", "/", "/en/"]) {
    for (const dark of [false, true]) {
      if (dark && ![375, 1280].includes(width)) continue;
      const page = await browser.newPage({ width, height: 900, dpr: 1, dark });
      await page.goto(BASE + path);
      await sleep(500);
      const l = JSON.parse(await page.eval(LAYOUT));
      const where = `${path} ${width}px${dark ? " tối" : ""}`;
      const wantCols = width < 700 ? 1 : 2;
      check(l.n === 4 && l.cols === wantCols, `${where}: ${l.n} thẻ, ${l.cols} cột (cần ${wantCols})`);
      if (wantCols === 2) check(l.tops[2] === l.tops[3] && l.tops[2] > l.tops[0], `${where}: hàng hai đủ hai thẻ, không thẻ lẻ`);
      check(l.clipped === 0, `${where}: không thẻ nào bị tràn chữ`);
      check(l.scrollW <= l.clientW, `${where}: không cuộn ngang (${l.scrollW}/${l.clientW})`);
      if (out && path === "/bang-gia/" && [375, 768, 1280].includes(width)) {
        await page.eval(`document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in", "visible", "is-visible"));`);
        await sleep(300);
        await page.screenshot(`${out}/plans-${width}${dark ? "-dark" : ""}.png`, { full: true, clipSelector: ".plans" });
      }
      await page.close?.();
    }
  }
}
await browser.close();
console.log(failed === 0 ? "ĐẠT" : `CÓ ${failed} ĐIỀU KIỆN SAI`);
process.exit(failed === 0 ? 0 : 1);
EOF
````

Dựng website vào thư mục riêng, bật máy chủ xem thử cổng 4175, chạy script:

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m node src/build/build.mjs | tail -1 && (WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m node src/serve.mjs 4175 > /Users/dtphong/Desktop/software_business/ai-translator/target/website-six-months/serve.log 2>&1 &) ; for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:4175/bang-gia/ && echo "website sẵn sàng sau ${i}s" && break; sleep 1; done; cd .. && node target/website-six-months/verify-site-plans.mjs http://127.0.0.1:4175 2>&1 | grep -E "FAIL|CÓ|ĐẠT" | sed -n 1,8p
```
Expected: `Đã sinh 48 trang vào …`, `website sẵn sàng sau …s`, rồi các dòng `FAIL` ở các bề rộng từ 1024px trở lên (`4 thẻ, 3 cột (cần 2)` và `hàng hai đủ hai thẻ, không thẻ lẻ`) và dòng cuối `CÓ N ĐIỀU KIỆN SAI` (`N` > 0).

- [ ] **Step 6: Sửa CSS lưới, thấy XANH**

Trong `website/src/assets/site.css`, **thay**
```css
.plans { display: grid; gap: clamp(16px, 2vw, 26px); grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr)); align-items: stretch; }
```
bằng
```css
/* Free và ba gói trả phí là bốn thẻ: một cột trên điện thoại, 2×2 từ 700px, không bao giờ để một thẻ lẻ ở hàng cuối (lưới 3 cột sẽ để lại một thẻ). */
.plans { display: grid; gap: clamp(16px, 2vw, 26px); grid-template-columns: minmax(0, 1fr); align-items: stretch; }
@media (min-width: 700px) { .plans { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
```

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m node src/build/build.mjs | tail -1 && cd .. && node target/website-six-months/verify-site-plans.mjs http://127.0.0.1:4175 target/website-six-months/shots 2>&1 | grep -E "FAIL|CÓ|ĐẠT"`
Expected: không có dòng `FAIL`, dòng cuối `ĐẠT` (máy chủ xem thử đọc lại thư mục dựng nên không cần bật lại; script kiểm 9 bề rộng × 4 trang, thêm giao diện tối ở 375 và 1280px).

Xem ảnh bằng công cụ Read: `target/website-six-months/shots/plans-1280.png`, `plans-375.png`, `plans-1280-dark.png`. Phải thấy: ở 1280px bốn thẻ xếp 2×2 (Free, Monthly / 6 Months, Yearly), thẻ Yearly có viền xanh và nhãn "Tiết kiệm nhất"; ở 375px một cột bốn thẻ; giá lớn không xuống dòng, chữ không bị cắt; kiểu chữ, bo góc, màu giống thẻ cũ.

- [ ] **Step 7: Tắt máy chủ, chạy lại test, commit**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && PID=$(lsof -nP -iTCP:4175 -sTCP:LISTEN -t | head -1); echo "PID=$PID"; [ -n "$PID" ] && kill $PID; sleep 1; lsof -nP -iTCP:4175 -sTCP:LISTEN || echo "cổng 4175 đã đóng"; cd website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"`
Expected: `cổng 4175 đã đóng`; `ℹ tests 78`, `ℹ pass 76`, `ℹ fail 0`, `ℹ skipped 2`.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short && git add website/src/plans.mjs website/src/build/components.mjs website/src/build/build.mjs website/src/assets/site.css website/test/site.test.mjs && git commit -q -m "$(cat <<'EOF'
feat(website): gói 6 Months ở thẻ gói, llms.txt và lưới thẻ 2×2

plans.mjs thêm six_months (269.000 ₫, 180 ngày, 6000 phút mỗi chu kỳ 30 ngày); thẻ
gói có mô tả riêng; keyFacts() của llms.txt lấy gói theo mã thay vì theo vị trí mảng
(chèn gói vào giữa sẽ làm Yearly lấy nhầm giá 6 Months); lưới .plans đổi thành 1
cột, 2×2 từ 700px vì lưới cũ để thẻ thứ tư lẻ ở hàng hai. Test: giá khớp wrangler
cho cả ba gói, thứ tự gói, thẻ khớp plans.mjs, JSON-LD đủ bốn Offer, llms.txt.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

### Task 2: Điều khoản (EULA 1.2)

Trang điều khoản của website sinh từ chính `docs/legal/eula.*.md` (app cũng đóng gói các file này), nên sửa EULA ở một nơi. App chỉ lưu cờ "đã đồng ý điều khoản", không gắn phiên bản văn bản, nên EULA 1.2 **không** bắt người dùng hiện tại đồng ý lại (spec §5). Test `src/lib/markdown.test.ts` của app đọc đúng các file này và phải vẫn xanh.

**Files:**
- Modify: `docs/legal/eula.vi.md`, `docs/legal/eula.en.md`, `docs/legal/README.md`, `website/src/content/legal.mjs`, `website/src/content/vi/terms.mjs`, `website/src/content/en/terms.mjs`
- Test: `website/test/site.test.mjs`

- [ ] **Step 1: Viết test (đỏ)**

**Thêm vào cuối** `website/test/site.test.mjs`:

````js

test("điều khoản (EULA) nêu gói 6 Months đúng giá và thời hạn, phiên bản 1.2", () => {
  const vi = textOf(htmlByPath.get("/dieu-khoan/"));
  const en = textOf(htmlByPath.get("/en/terms/"));
  for (const needle of ["Phiên bản 1.2", "6 Months", "269.000 đ", "180 ngày"]) assert.ok(vi.includes(needle), `/dieu-khoan/: thiếu "${needle}"`);
  for (const needle of ["Version 1.2", "6 Months", "269,000 VND", "180 days"]) assert.ok(en.includes(needle), `/en/terms/: thiếu "${needle}"`);
});
````

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)" | sort -u`
Expected: FAIL đúng một test mới `điều khoản (EULA) nêu gói 6 Months đúng giá và thời hạn, phiên bản 1.2`; `ℹ tests 79`, `ℹ fail 1`.

- [ ] **Step 2: Sửa EULA, README pháp lý, trang điều khoản**

Chạy script (mỗi thay thế `assert` đúng một chỗ khớp; sai thì báo lỗi thay vì sửa bừa):

````bash
cd /Users/dtphong/Desktop/software_business/ai-translator && python3 - <<'EOF'
# EULA, README pháp lý và trang điều khoản của website cho gói 6 Months (spec 2026-10-13 §5).
import pathlib

REPO = pathlib.Path("/Users/dtphong/Desktop/software_business/ai-translator")


def rep(rel, pairs):
    p = REPO / rel
    s = p.read_text()
    for old, new in pairs:
        n = s.count(old)
        assert n == 1, f"{rel}: {n} chỗ khớp (cần 1): {old[:90]!r}"
        s = s.replace(old, new)
    p.write_text(s)


rep("docs/legal/eula.vi.md", [
    ("**Phiên bản 1.1, hiệu lực từ 07/10/2026.**", "**Phiên bản 1.2, hiệu lực từ 13/10/2026.**"),
    ("| Monthly | 50 giờ mỗi chu kỳ 30 ngày | 30 ngày mỗi đơn | 50.000 đ |\n",
     "| Monthly | 50 giờ mỗi chu kỳ 30 ngày | 30 ngày mỗi đơn | 50.000 đ |\n| 6 Months | 100 giờ mỗi chu kỳ 30 ngày | 180 ngày mỗi đơn | 269.000 đ |\n"),
    ("- Hai gói trả phí cùng có các tính năng Pro", "- Ba gói trả phí cùng có các tính năng Pro"),
    ("(Monthly 30 ngày, Yearly 365 ngày)", "(Monthly 30 ngày, 6 Months 180 ngày, Yearly 365 ngày)"),
    ("(30 ngày với Monthly, 365 ngày với Yearly)", "(30 ngày với Monthly, 180 ngày với 6 Months, 365 ngày với Yearly)"),
])
rep("docs/legal/eula.en.md", [
    ("**Version 1.1, effective 7 October 2026.", "**Version 1.2, effective 13 October 2026."),
    ("| Monthly | 50 hours per 30-day cycle | 30 days per order | 50,000 VND |\n",
     "| Monthly | 50 hours per 30-day cycle | 30 days per order | 50,000 VND |\n| 6 Months | 100 hours per 30-day cycle | 180 days per order | 269,000 VND |\n"),
    ("- Both paid plans have the same Pro features", "- All three paid plans have the same Pro features"),
    ("(Monthly 30 days, Yearly 365 days)", "(Monthly 30 days, 6 Months 180 days, Yearly 365 days)"),
    ("(30 days for Monthly, 365 days for Yearly)", "(30 days for Monthly, 180 days for 6 Months, 365 days for Yearly)"),
])
rep("docs/legal/README.md", [
    ("**Phiên bản 1.1, hiệu lực từ 2026-10-07**, dùng để phát hành. Bản 1.0 (2026-10-06) do chủ dự án duyệt; bản 1.1 sửa phần gói theo spec `2026-10-07-three-plans-single-device-design.md` (ba gói, dùng thử Free theo máy, mỗi key một máy).",
     "**EULA phiên bản 1.2, hiệu lực từ 2026-10-13; chính sách quyền riêng tư giữ phiên bản 1.1 (2026-10-07)**, dùng để phát hành. Bản 1.0 (2026-10-06) do chủ dự án duyệt; bản 1.1 sửa phần gói theo spec `2026-10-07-three-plans-single-device-design.md` (ba gói, dùng thử Free theo máy, mỗi key một máy); bản 1.2 của EULA thêm gói 6 Months theo spec `2026-10-13-six-months-plan-design.md` (chỉ bảng gói và các câu nêu số ngày mỗi đơn)."),
    ("- Ba gói (từ 2026-10-07): Free dùng thử 10 ngày mỗi máy, 30 phút mỗi ngày; Monthly 50.000 đ, 50 giờ mỗi chu kỳ 30 ngày; Yearly 500.000 đ, không giới hạn, 365 ngày.",
     "- Bốn gói (từ 2026-10-13; ba gói từ 2026-10-07): Free dùng thử 10 ngày mỗi máy, 30 phút mỗi ngày; Monthly 50.000 đ, 50 giờ mỗi chu kỳ 30 ngày; 6 Months 269.000 đ, 100 giờ mỗi chu kỳ 30 ngày, 180 ngày; Yearly 500.000 đ, không giới hạn, 365 ngày."),
])

# Trang điều khoản của website sinh từ chính EULA: ngày sửa riêng của trang này (chính sách quyền riêng tư không đổi).
rep("website/src/content/legal.mjs", [
    ("export function legalPage({ id, lang, path, file, title, description, crumbs, heroLead, inAppNote, versionLabel, llm }) {",
     "export function legalPage({ id, lang, path, file, title, description, crumbs, heroLead, inAppNote, versionLabel, llm, modified = \"2026-10-08\" }) {"),
    ('    modified: "2026-10-08",\n    published: "2026-10-07",', '    modified,\n    published: "2026-10-07",'),
])
rep("website/src/content/vi/terms.mjs", [('  versionLabel: "Phiên bản",\n', '  versionLabel: "Phiên bản",\n  modified: "2026-10-13",\n')])
rep("website/src/content/en/terms.mjs", [('  versionLabel: "Version",\n', '  versionLabel: "Version",\n  modified: "2026-10-13",\n')])
print("xong: tài liệu pháp lý")
EOF
````
Expected: in `xong: tài liệu pháp lý`. `git diff --stat` liệt kê sáu file nói ở đầu task. Script làm:
- `eula.vi.md`: "Phiên bản 1.2, hiệu lực từ 13/10/2026"; thêm hàng `| 6 Months | 100 giờ mỗi chu kỳ 30 ngày | 180 ngày mỗi đơn | 269.000 đ |`; "Hai gói trả phí" thành "Ba gói trả phí"; thêm 6 Months 180 ngày vào hai câu nêu số ngày mỗi đơn. `eula.en.md` tương ứng.
- `docs/legal/README.md`: ghi EULA 1.2 (2026-10-13), chính sách quyền riêng tư giữ 1.1; mục "Bốn gói".
- `legal.mjs` thêm tham số `modified` (mặc định giữ `2026-10-08`), hai trang `terms.mjs` đặt `2026-10-13`: chỉ trang điều khoản đổi ngày sửa, trang quyền riêng tư không đổi.

- [ ] **Step 3: Chạy test website và test của app (đọc EULA thật)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)" && cd .. && pnpm test 2>&1 | grep -E "×|Test Files|Tests "`
Expected: website `ℹ tests 79`, `ℹ pass 77`, `ℹ fail 0`, `ℹ skipped 2`; gốc repo `Test Files  23 passed (23)`, `Tests  248 passed (248)` (test `eula.vi.md: đủ mục, có bảng…` vẫn xanh).

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short && git add docs/legal/eula.vi.md docs/legal/eula.en.md docs/legal/README.md website/src/content/legal.mjs website/src/content/vi/terms.mjs website/src/content/en/terms.mjs website/test/site.test.mjs && git commit -q -m "$(cat <<'EOF'
docs(legal): EULA 1.2 thêm gói 6 Months (269.000 đ, 180 ngày, 100 giờ mỗi 30 ngày)

Bảng gói thêm hàng 6 Months; "hai gói trả phí" thành ba; hai câu nêu số ngày mỗi đơn
thêm 180 ngày. Hiệu lực 13/10/2026 (README pháp lý theo quy ước: đổi gói thì cập nhật
văn bản cùng lúc). Chính sách quyền riêng tư giữ 1.1. App chỉ lưu cờ đồng ý, không
gắn phiên bản văn bản, nên không ai phải đồng ý lại. Trang điều khoản của website có
ngày sửa riêng; test kiểm bản vi và en nêu đúng gói, giá và phiên bản.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

### Task 3: Nội dung các trang (vi và en)

14 trang × 2 ngôn ngữ nhắc gói hay giá: Bảng giá, Tính năng, Trang chủ, Hỏi đáp, Giới thiệu, Giải pháp (và webinar), Tải xuống, So sánh offline và cloud, và các hướng dẫn (mua gói và kích hoạt key, từ điển thuật ngữ, lịch sử và xuất file, khắc phục sự cố, trang chỉ mục hướng dẫn). Hai test mới chặn sót: bảng so sánh phải đủ ô ở mọi hàng, và không còn câu liệt kê Monthly với Yearly mà thiếu 6 Months (kể cả trong trang điều khoản, nên task này làm sau Task 2).

**Files:**
- Modify: 28 file `website/src/content/{vi,en}/<trang>.mjs` (danh sách ở "Cấu trúc file")
- Test: `website/test/site.test.mjs`

- [ ] **Step 1: Viết test (đỏ)**

**Thêm vào cuối** `website/test/site.test.mjs`:

````js

test("bảng so sánh gói: mỗi hàng có đủ số ô như hàng tiêu đề (không sót ô khi thêm một gói)", () => {
  const errors = [];
  let tables = 0;
  for (const p of pages) {
    for (const table of htmlByPath.get(p.path).matchAll(/<table class="compare">([\s\S]*?)<\/table>/g)) {
      if (!/<th scope="col">Monthly<\/th>/.test(table[1])) continue;
      tables++;
      const cells = [...table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => (r[1].match(/<t[hd][ >]/g) ?? []).length);
      if (new Set(cells).size !== 1 || cells[0] !== 5) errors.push(`${p.path}: số ô mỗi hàng ${cells.join(",")} (cần 5 ở mọi hàng)`);
      if (!/<th scope="col">6 Months<\/th>/.test(table[1])) errors.push(`${p.path}: bảng thiếu cột 6 Months`);
    }
  }
  assert.equal(tables, 4, "phải có đúng 4 bảng so sánh gói (Bảng giá và Tính năng, mỗi trang hai ngôn ngữ)");
  assert.deepEqual(errors, []);
});

test("không còn câu liệt kê chỉ Monthly và Yearly: mọi chỗ nêu cả hai gói phải nêu cả 6 Months", () => {
  // "Monthly … (hoặc|và|or|and|·|,) Yearly" trong cùng một câu mà giữa hai chữ không có "6 Months".
  const stale = /.{0,40}Monthly(?:(?!6 Months|\. )[\s\S]){0,120}?(?:hoặc|và|or|and|·|,) Yearly.{0,30}/;
  const errors = [];
  for (const p of pages) {
    const text = [textOf(htmlByPath.get(p.path)), p.title, p.description, p.llm ?? ""].join(" \n ");
    const m = text.match(stale);
    if (m) errors.push(`${p.path}: …${m[0]}…`);
  }
  assert.deepEqual(errors, []);
});
````

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)" | sort -u`
Expected: FAIL đúng hai test mới: `bảng so sánh gói: mỗi hàng có đủ số ô…` (chưa có cột 6 Months: `số ô mỗi hàng 4,4,…`) và `không còn câu liệt kê chỉ Monthly và Yearly…` (danh sách dài các trang còn câu cũ, ví dụ `/bang-gia/`, `/`, `/cau-hoi-thuong-gap/`); `ℹ tests 81`, `ℹ fail 2`.

- [ ] **Step 2: Sửa nội dung**

Chạy script (mỗi thay thế `assert` đúng một chỗ khớp; hàm `six_months_table` chèn cột 6 Months sau cột Monthly ở bảng `compare` đầu tiên của trang Bảng giá và Tính năng, chép ô Monthly cho các hàng cùng tính năng Pro và cùng số máy):

````bash
cd /Users/dtphong/Desktop/software_business/ai-translator && python3 - <<'EOF'
# Sửa nội dung website cho gói 6 Months (spec 2026-10-13 §4). Mỗi thay thế assert đúng số chỗ khớp.
import pathlib, re

ROOT = pathlib.Path("/Users/dtphong/Desktop/software_business/ai-translator/website/src/content")


def rep(rel, pairs):
    p = ROOT / rel
    s = p.read_text()
    for old, new in pairs:
        n = s.count(old)
        assert n == 1, f"{rel}: {n} chỗ khớp (cần 1): {old[:90]!r}"
        s = s.replace(old, new)
    p.write_text(s)


def six_months_table(rel, header, cells):
    """Thêm cột 6 Months vào bảng `compare` đầu tiên của trang: mỗi hàng chèn một ô sau ô Monthly. Hàng không có trong
    `cells` chép ô của Monthly (cùng tính năng Pro, cùng số máy)."""
    p = ROOT / rel
    s = p.read_text()
    start = s.index('<table class="compare">')
    end = s.index("</table>", start)
    table = s[start:end]
    head = re.search(r'(<th scope="col">Monthly</th>)(<th scope="col">Yearly</th>)', table)
    assert head, f"{rel}: không thấy tiêu đề Monthly/Yearly"
    table = table.replace(head.group(0), f'{head.group(1)}<th scope="col">{header}</th>{head.group(2)}', 1)
    rows = re.findall(r'<tr><th scope="row">(.*?)</th>(<td>.*?</td>)(<td>.*?</td>)(<td>.*?</td>)</tr>', table)
    assert len(rows) >= 8, f"{rel}: chỉ thấy {len(rows)} hàng"
    seen = set()
    for label, free, monthly, yearly in rows:
        cell = cells.get(label, monthly)
        seen.add(label)
        old = f'<tr><th scope="row">{label}</th>{free}{monthly}{yearly}</tr>'
        new = f'<tr><th scope="row">{label}</th>{free}{monthly}{cell}{yearly}</tr>'
        assert table.count(old) == 1, f"{rel}: hàng {label!r} xuất hiện {table.count(old)} lần"
        table = table.replace(old, new)
    assert set(cells) <= seen, f"{rel}: hàng không có trong bảng: {set(cells) - seen}"
    p.write_text(s[:start] + table + s[end:])


# ------------------------------------------------------------------ Bảng giá (vi)
rep("vi/pricing.mjs", [
    ("Gói trả phí (Monthly, Yearly) có thêm các tính năng Pro", "Gói trả phí (Monthly, 6 Months, Yearly) có thêm các tính năng Pro"),
    ("cần mua Monthly hoặc Yearly để tiếp tục dịch.", "cần mua Monthly, 6 Months hoặc Yearly để tiếp tục dịch."),
    ("Gia hạn cùng gói sẽ cộng thêm 30 ngày (Monthly) hoặc 365 ngày (Yearly), tính từ ngày hết hạn nếu gói còn hạn.",
     "Gia hạn cùng gói sẽ cộng thêm 30 ngày (Monthly), 180 ngày (6 Months) hoặc 365 ngày (Yearly), tính từ ngày hết hạn nếu gói còn hạn."),
    ('title: "Bảng giá AI Translator: Free, Monthly 50.000 ₫, Yearly 500.000 ₫",', 'title: "Bảng giá AI Translator: Free, Monthly, 6 Months, Yearly",'),
    ('"Ba gói AI Translator: Free dùng thử 10 ngày, Monthly 50.000 ₫ (50 giờ/30 ngày), Yearly 500.000 ₫ (không giới hạn 365 ngày). Trả trước bằng VietQR.",',
     '"Bốn gói AI Translator: Free dùng thử 10 ngày, Monthly 50.000 ₫, 6 Months 269.000 ₫ (100 giờ/30 ngày), Yearly 500.000 ₫ (không giới hạn). Trả trước bằng VietQR.",'),
    ("Bảng giá ba gói (Free dùng thử 10 ngày, Monthly 50.000 đ, Yearly 500.000 đ), cách tính", "Bảng giá bốn gói (Free dùng thử 10 ngày, Monthly 50.000 đ, 6 Months 269.000 đ, Yearly 500.000 đ), cách tính"),
    ("rồi chọn Monthly hoặc Yearly khi bạn thấy hữu ích.", "rồi chọn Monthly, 6 Months hoặc Yearly khi bạn thấy hữu ích."),
    ("Mua 12 đơn Monthly liên tiếp (360 ngày) tốn 600.000 ₫, so với 500.000 ₫ cho 365 ngày của một đơn Yearly. Monthly giới hạn 50 giờ dịch mỗi 30 ngày, Yearly không giới hạn.",
     "Mua 6 đơn Monthly liên tiếp (180 ngày) tốn 300.000 ₫, so với 269.000 ₫ cho 180 ngày của một đơn 6 Months; mua 12 đơn Monthly liên tiếp (360 ngày) tốn 600.000 ₫, so với 500.000 ₫ cho 365 ngày của một đơn Yearly. Monthly giới hạn 50 giờ dịch mỗi 30 ngày, 6 Months giới hạn 100 giờ mỗi 30 ngày, Yearly không giới hạn."),
    ('alt: "Màn hình Nâng cấp trong app hiển thị ba gói Free, Monthly và Yearly với hạn mức và giá", caption: "Màn hình Nâng cấp trong app: ba gói, giá và hạn mức."',
     'alt: "Màn hình Nâng cấp trong app hiển thị bốn gói Free, Monthly, 6 Months và Yearly với hạn mức và giá", caption: "Màn hình Nâng cấp trong app: bốn gói, giá và hạn mức."'),
    ('"<strong>Monthly:</strong> chu kỳ 30 ngày tính từ ngày thanh toán, không theo tháng dương lịch",',
     '"<strong>Monthly và 6 Months:</strong> chu kỳ 30 ngày tính từ ngày thanh toán, không theo tháng dương lịch (6 Months có sáu chu kỳ trong 180 ngày, mỗi chu kỳ 100 giờ)",'),
    ("chọn Monthly hoặc Yearly, nhập email nhận key", "chọn Monthly, 6 Months hoặc Yearly, nhập email nhận key"),
    ("Mua thêm cùng gói thì được cộng 30 ngày (Monthly) hoặc 365 ngày (Yearly), tính từ ngày hết hạn nếu gói còn hạn.",
     "Mua thêm cùng gói thì được cộng 30 ngày (Monthly), 180 ngày (6 Months) hoặc 365 ngày (Yearly), tính từ ngày hết hạn nếu gói còn hạn."),
    ("Ví dụ: Monthly còn 20 ngày, mua Yearly thì được cộng 24 ngày (Yearly chạy 389 ngày).",
     "Ví dụ: Monthly còn 20 ngày, mua Yearly thì được cộng 24 ngày (Yearly chạy 389 ngày), còn mua 6 Months thì được cộng 22 ngày (6 Months chạy 202 ngày)."),
])
six_months_table("vi/pricing.mjs", "6 Months", {
    "Giá": "<td>269.000 ₫ mỗi đơn</td>",
    "Thời hạn": "<td>180 ngày mỗi đơn</td>",
    "Thời lượng dịch": "<td>100 giờ (6000 phút) mỗi chu kỳ 30 ngày</td>",
    "Quy ra mỗi tháng": "<td>khoảng 44.800 ₫</td>",
})

# ------------------------------------------------------------------ Bảng giá (en)
rep("en/pricing.mjs", [
    ("The paid plans (Monthly and Yearly) add the Pro features", "The paid plans (Monthly, 6 Months and Yearly) add the Pro features"),
    ("needs a Monthly or Yearly plan to keep translating.", "needs a Monthly, 6 Months or Yearly plan to keep translating."),
    ("Renewing the same plan adds 30 days (Monthly) or 365 days (Yearly), counted from the expiry date if the plan is still active.",
     "Renewing the same plan adds 30 days (Monthly), 180 days (6 Months) or 365 days (Yearly), counted from the expiry date if the plan is still active."),
    ('title: "AI Translator pricing: Free trial, Monthly, Yearly",', 'title: "AI Translator pricing: Free trial, Monthly, 6 Months, Yearly",'),
    ('"AI Translator plans: 10-day Free trial, Monthly 50,000 ₫ (50 hours per 30 days), Yearly 500,000 ₫ (unlimited, 365 days). Prepaid in VND via VietQR, no auto-renewal.",',
     '"AI Translator plans: Free 10-day trial, Monthly 50,000 ₫, 6 Months 269,000 ₫ (100 hours/30 days), Yearly 500,000 ₫ (unlimited). Prepaid via VietQR, no auto-renewal.",'),
    ("Pricing for the three plans (Free 10-day trial, Monthly 50,000 VND, Yearly 500,000 VND), how",
     "Pricing for the four plans (Free 10-day trial, Monthly 50,000 VND, 6 Months 269,000 VND, Yearly 500,000 VND), how"),
    ("then choose Monthly or Yearly if it earns its place.", "then choose Monthly, 6 Months or Yearly if it earns its place."),
    ('<h2 class="sr-only">The three plans</h2>', '<h2 class="sr-only">The four plans</h2>'),
    ("Buying 12 Monthly orders back to back (360 days) would cost 600,000 ₫, compared with 500,000 ₫ for 365 days from a single Yearly order. Monthly is limited to 50 hours of translation per 30 days; Yearly is unlimited.",
     "Buying 6 Monthly orders back to back (180 days) would cost 300,000 ₫, compared with 269,000 ₫ for 180 days from a single 6 Months order; buying 12 Monthly orders back to back (360 days) would cost 600,000 ₫, compared with 500,000 ₫ for 365 days from a single Yearly order. Monthly is limited to 50 hours of translation per 30 days, 6 Months to 100 hours per 30 days; Yearly is unlimited."),
    ('alt: "The Upgrade screen in the app showing the Free, Monthly and Yearly plans with their allowances and prices", caption: "The Upgrade screen in the app: three plans, with prices and allowances."',
     'alt: "The Upgrade screen in the app showing the Free, Monthly, 6 Months and Yearly plans with their allowances and prices", caption: "The Upgrade screen in the app: four plans, with prices and allowances."'),
    ('"<strong>Monthly:</strong> a 30-day cycle that starts on the payment date, not on the calendar month",',
     '"<strong>Monthly and 6 Months:</strong> a 30-day cycle that starts on the payment date, not on the calendar month (6 Months has six cycles in its 180 days, each with its own 100 hours)",'),
    ("choose Monthly or Yearly, enter the email", "choose Monthly, 6 Months or Yearly, enter the email"),
    ("Buy the same plan again to add 30 days (Monthly) or 365 days (Yearly), counted from the expiry date",
     "Buy the same plan again to add 30 days (Monthly), 180 days (6 Months) or 365 days (Yearly), counted from the expiry date"),
    ("For example, with 20 days left on Monthly, buying Yearly adds 24 days (Yearly then runs for 389 days).",
     "For example, with 20 days left on Monthly, buying Yearly adds 24 days (Yearly then runs for 389 days), and buying 6 Months adds 22 days (6 Months then runs for 202 days)."),
])
six_months_table("en/pricing.mjs", "6 Months", {
    "Price": "<td>269,000 ₫ per order</td>",
    "Duration": "<td>180 days per order</td>",
    "Translation time": "<td>100 hours (6,000 minutes) per 30-day cycle</td>",
    "Equivalent per month": "<td>about 44,800 ₫</td>",
})

# ------------------------------------------------------------------ Tính năng (bảng theo gói)
six_months_table("vi/features.mjs", "6 Months", {
    "Thời lượng dịch": "<td>100 giờ mỗi 30 ngày, 180 ngày</td>",
    "Giá": "<td>269.000 ₫</td>",
})
six_months_table("en/features.mjs", "6 Months", {
    "Translation time": "<td>100 hours per 30 days, for 180 days</td>",
    "Price (VND)": "<td>269,000 ₫</td>",
})

# ------------------------------------------------------------------ Trang chủ
HOME_FAQ_VI = ("Sau đó cần gói trả trước: Monthly 50.000 ₫ (50 giờ mỗi 30 ngày) hoặc Yearly 500.000 ₫ (không giới hạn trong 365 ngày).",
               "Sau đó cần gói trả trước: Monthly 50.000 ₫ (50 giờ mỗi 30 ngày), 6 Months 269.000 ₫ (100 giờ mỗi 30 ngày, trong 180 ngày) hoặc Yearly 500.000 ₫ (không giới hạn trong 365 ngày).")
HOME_FAQ_EN = ("After that you need a prepaid plan: Monthly 50,000 ₫ (50 hours per 30 days) or Yearly 500,000 ₫ (unlimited for 365 days).",
               "After that you need a prepaid plan: Monthly 50,000 ₫ (50 hours per 30 days), 6 Months 269,000 ₫ (100 hours per 30 days, for 180 days) or Yearly 500,000 ₫ (unlimited for 365 days).")
rep("vi/home.mjs", [
    HOME_FAQ_VI,
    ("Free dùng thử 10 ngày · Monthly 50.000 ₫ · Yearly 500.000 ₫<small>", "Free dùng thử 10 ngày · Monthly 50.000 ₫ · 6 Months 269.000 ₫ · Yearly 500.000 ₫<small>"),
    ('title: "Ba gói đơn giản, trả trước bằng VietQR"', 'title: "Bốn gói đơn giản, trả trước bằng VietQR"'),
])
rep("en/home.mjs", [
    HOME_FAQ_EN,
    ("Free 10-day trial · Monthly 50,000 ₫ · Yearly 500,000 ₫<small>", "Free 10-day trial · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>"),
    ('title: "Three simple plans, prepaid with VietQR"', 'title: "Four simple plans, prepaid with VietQR"'),
])

# ------------------------------------------------------------------ Hỏi đáp
rep("vi/faq.mjs", [
    HOME_FAQ_VI,
    ("Hết dùng thử thì bạn cần mua Monthly (50.000 ₫, 50 giờ mỗi 30 ngày) hoặc Yearly (500.000 ₫, không giới hạn trong 365 ngày).",
     "Hết dùng thử thì bạn cần mua Monthly (50.000 ₫, 50 giờ mỗi 30 ngày), 6 Months (269.000 ₫, 100 giờ mỗi 30 ngày, trong 180 ngày) hoặc Yearly (500.000 ₫, không giới hạn trong 365 ngày)."),
    ("Gia hạn cùng gói cộng thêm 30 ngày (Monthly) hoặc 365 ngày (Yearly).", "Gia hạn cùng gói cộng thêm 30 ngày (Monthly), 180 ngày (6 Months) hoặc 365 ngày (Yearly)."),
])
rep("en/faq.mjs", [
    HOME_FAQ_EN,
    ("After the trial you need Monthly (50,000 ₫, 50 hours per 30 days) or Yearly (500,000 ₫, unlimited for 365 days).",
     "After the trial you need Monthly (50,000 ₫, 50 hours per 30 days), 6 Months (269,000 ₫, 100 hours per 30 days, for 180 days) or Yearly (500,000 ₫, unlimited for 365 days)."),
    ("Renewing the same plan adds another 30 days (Monthly) or 365 days (Yearly).", "Renewing the same plan adds another 30 days (Monthly), 180 days (6 Months) or 365 days (Yearly)."),
])

# ------------------------------------------------------------------ Giới thiệu, Giải pháp, Tải xuống, So sánh
rep("vi/about.mjs", [
    ("Free dùng thử 10 ngày, Monthly, Yearly. Xem", "Free dùng thử 10 ngày, Monthly, 6 Months, Yearly. Xem"),
    ('text: "Free dùng thử 10 ngày, Monthly 50.000 ₫, Yearly 500.000 ₫."', 'text: "Free dùng thử 10 ngày, Monthly 50.000 ₫, 6 Months 269.000 ₫, Yearly 500.000 ₫."'),
])
rep("en/about.mjs", [
    ("Free 10-day trial, Monthly, Yearly. See", "Free 10-day trial, Monthly, 6 Months, Yearly. See"),
    ('text: "Free 10-day trial, Monthly 50,000 ₫, Yearly 500,000 ₫."', 'text: "Free 10-day trial, Monthly 50,000 ₫, 6 Months 269,000 ₫, Yearly 500,000 ₫."'),
])
rep("vi/solutions.mjs", [
    ("Free dùng thử 10 ngày · Monthly 50.000 ₫ · Yearly 500.000 ₫<small>", "Free dùng thử 10 ngày · Monthly 50.000 ₫ · 6 Months 269.000 ₫ · Yearly 500.000 ₫<small>"),
    ('text: "Free dùng thử 10 ngày, Monthly 50.000 ₫, Yearly 500.000 ₫."', 'text: "Free dùng thử 10 ngày, Monthly 50.000 ₫, 6 Months 269.000 ₫, Yearly 500.000 ₫."'),
])
rep("en/solutions.mjs", [
    ("Free 10-day trial · Monthly 50,000 ₫ · Yearly 500,000 ₫<small>", "Free 10-day trial · Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>"),
    ('text: "Free 10-day trial, Monthly 50,000 ₫, Yearly 500,000 ₫."', 'text: "Free 10-day trial, Monthly 50,000 ₫, 6 Months 269,000 ₫, Yearly 500,000 ₫."'),
])
rep("vi/solutions-webinar.mjs", [
    ("nên một webinar dài cần Monthly (50 giờ mỗi 30 ngày) hoặc Yearly (không giới hạn).",
     "nên một webinar dài cần Monthly (50 giờ mỗi 30 ngày), 6 Months (100 giờ mỗi 30 ngày) hoặc Yearly (không giới hạn)."),
])
rep("en/solutions-webinar.mjs", [
    ("so a long webinar needs Monthly (50 hours per 30 days) or Yearly (unlimited).",
     "so a long webinar needs Monthly (50 hours per 30 days), 6 Months (100 hours per 30 days) or Yearly (unlimited)."),
])
rep("vi/download.mjs", [('["Giá sau đó", "Monthly 50.000 ₫ · Yearly 500.000 ₫"],', '["Giá sau đó", "Monthly 50.000 ₫ · 6 Months 269.000 ₫ · Yearly 500.000 ₫"],')])
rep("en/download.mjs", [('"Monthly 50,000 ₫ · Yearly 500,000 ₫<small>Paid in VND', '"Monthly 50,000 ₫ · 6 Months 269,000 ₫ · Yearly 500,000 ₫<small>Paid in VND')])
rep("vi/compare-offline-cloud.mjs", [
    ("50 giờ mỗi 30 ngày ở Monthly, không giới hạn ở Yearly)", "50 giờ mỗi 30 ngày ở Monthly, 100 giờ mỗi 30 ngày ở 6 Months, không giới hạn ở Yearly)"),
])
rep("en/compare-offline-cloud.mjs", [
    ("50 hours per 30 days on Monthly, unlimited on Yearly)", "50 hours per 30 days on Monthly, 100 hours per 30 days on 6 Months, unlimited on Yearly)"),
])

# ------------------------------------------------------------------ Hướng dẫn
rep("vi/guide.mjs", [("Mua Monthly hoặc Yearly bằng VietQR trong app, nhập key", "Mua Monthly, 6 Months hoặc Yearly bằng VietQR trong app, nhập key")])
rep("en/guide.mjs", [("Buy Monthly or Yearly with VietQR inside the app, enter your key", "Buy Monthly, 6 Months or Yearly with VietQR inside the app, enter your key")])
rep("vi/guide-history-export.mjs", [("Cần gói Monthly hoặc Yearly.", "Cần gói trả phí (Monthly, 6 Months hoặc Yearly).")])
rep("en/guide-history-export.mjs", [("This needs the Monthly or Yearly plan.", "This needs a paid plan (Monthly, 6 Months or Yearly).")])
rep("vi/guide-glossary.mjs", [
    ("Tính năng này cần gói Monthly hoặc Yearly.", "Tính năng này cần gói trả phí (Monthly, 6 Months hoặc Yearly)."),
    ("Đây là tính năng Pro, có trong gói Monthly và Yearly.", "Đây là tính năng Pro, có trong các gói Monthly, 6 Months và Yearly."),
    ('"Pro: Monthly và Yearly<small>', '"Pro: Monthly, 6 Months và Yearly<small>'),
    ('caption: "Màn hình Từ điển thuật ngữ khi có gói Monthly hoặc Yearly."', 'caption: "Màn hình Từ điển thuật ngữ khi có gói trả phí (Monthly, 6 Months hoặc Yearly)."'),
])
rep("en/guide-glossary.mjs", [
    ("The glossary needs the Monthly or Yearly plan.", "The glossary needs a paid plan (Monthly, 6 Months or Yearly)."),
    ("The glossary is a Pro feature, included in the Monthly and Yearly plans.", "The glossary is a Pro feature, included in the Monthly, 6 Months and Yearly plans."),
    ('"Pro: Monthly and Yearly<small>', '"Pro: Monthly, 6 Months and Yearly<small>'),
    ('caption: "The Glossary screen with a Monthly or Yearly plan."', 'caption: "The Glossary screen with a paid plan (Monthly, 6 Months or Yearly)."'),
])
rep("vi/guide-troubleshooting.mjs", [
    ("Đã dùng hết 30 phút hôm nay (Free) hoặc 50 giờ của chu kỳ (Monthly).", "Đã dùng hết 30 phút hôm nay (Free) hoặc hạn mức của chu kỳ (Monthly: 50 giờ, 6 Months: 100 giờ)."),
    ("<strong>Cách xử lý:</strong> Mua Monthly hoặc Yearly để dịch tiếp.", "<strong>Cách xử lý:</strong> Mua Monthly, 6 Months hoặc Yearly để dịch tiếp."),
])
rep("en/guide-troubleshooting.mjs", [
    ("You used the 30 minutes for today (Free) or the 50 hours of the cycle (Monthly).", "You used the 30 minutes for today (Free) or the hours of the cycle (Monthly: 50, 6 Months: 100)."),
    ("<strong>Fix:</strong> Buy Monthly or Yearly to keep translating.", "<strong>Fix:</strong> Buy Monthly, 6 Months or Yearly to keep translating."),
])

# ------------------------------------------------------------------ Hướng dẫn mua gói và kích hoạt key
rep("vi/guide-license.mjs", [
    ("Cách mua Monthly hoặc Yearly bằng VietQR trong app, nhập key từ email", "Cách mua Monthly, 6 Months hoặc Yearly bằng VietQR trong app, nhập key từ email"),
    ("Hướng dẫn mua gói Monthly hoặc Yearly bằng VietQR trong app", "Hướng dẫn mua gói Monthly, 6 Months hoặc Yearly bằng VietQR trong app"),
    ('description: "Mua gói Monthly hoặc Yearly bằng VietQR trong app và kích hoạt key', 'description: "Mua gói Monthly, 6 Months hoặc Yearly bằng VietQR trong app và kích hoạt key'),
    ("để xem ba gói và chọn Monthly hoặc Yearly.", "để xem bốn gói và chọn Monthly, 6 Months hoặc Yearly."),
    ("chọn Monthly hoặc Yearly, quét mã VietQR", "chọn Monthly, 6 Months hoặc Yearly, quét mã VietQR"),
    ('["Gói", "Monthly 50.000 ₫ (30 ngày, 50 giờ)<small>Yearly 500.000 ₫ (365 ngày, không giới hạn)</small>"],',
     '["Gói", "Monthly 50.000 ₫ (30 ngày, 50 giờ)<small>6 Months 269.000 ₫ (180 ngày, 100 giờ mỗi 30 ngày)</small><small>Yearly 500.000 ₫ (365 ngày, không giới hạn)</small>"],'),
    ("Màn hình hiện đủ ba gói, gói đang dùng", "Màn hình hiện đủ bốn gói, gói đang dùng"),
    ("Bấm vào thẻ <strong>Monthly</strong> hoặc <strong>Yearly</strong> (giá ghi chữ lớn", "Bấm vào thẻ <strong>Monthly</strong>, <strong>6 Months</strong> hoặc <strong>Yearly</strong> (giá ghi chữ lớn"),
    ('alt: "Màn hình Nâng cấp: ba gói Free, Monthly và Yearly với hạn mức và giá,', 'alt: "Màn hình Nâng cấp: bốn gói Free, Monthly, 6 Months và Yearly với hạn mức và giá,'),
    ("<strong>Gia hạn cùng gói:</strong> cộng 30 ngày (Monthly) hoặc 365 ngày (Yearly), tính từ ngày hết hạn nếu gói còn hạn.",
     "<strong>Gia hạn cùng gói:</strong> cộng 30 ngày (Monthly), 180 ngày (6 Months) hoặc 365 ngày (Yearly), tính từ ngày hết hạn nếu gói còn hạn."),
    ("Giá mỗi ngày: Monthly 50.000 ÷ 30 ≈ 1.667 ₫, Yearly 500.000 ÷ 365 ≈ 1.370 ₫. Ví dụ: Monthly còn 20 ngày, mua Yearly được cộng 20 × 1.667 ÷ 1.370 ≈ 24 ngày, nên Yearly chạy 365 + 24 = 389 ngày. Ngược lại,",
     "Giá mỗi ngày: Monthly 50.000 ÷ 30 ≈ 1.667 ₫, 6 Months 269.000 ÷ 180 ≈ 1.494 ₫, Yearly 500.000 ÷ 365 ≈ 1.370 ₫. Ví dụ: Monthly còn 20 ngày, mua Yearly được cộng 20 × 1.667 ÷ 1.370 ≈ 24 ngày, nên Yearly chạy 365 + 24 = 389 ngày; mua 6 Months thì được cộng 20 × 1.667 ÷ 1.494 ≈ 22 ngày, nên 6 Months chạy 180 + 22 = 202 ngày. Ngược lại,"),
])
rep("en/guide-license.mjs", [
    ("Buy Monthly or Yearly with VietQR in the app, enter your emailed key", "Buy Monthly, 6 Months or Yearly with VietQR in the app, enter your emailed key"),
    ("How to buy a Monthly or Yearly plan with VietQR inside the app", "How to buy a Monthly, 6 Months or Yearly plan with VietQR inside the app"),
    ('description: "Buy the Monthly or Yearly plan with VietQR inside the app', 'description: "Buy the Monthly, 6 Months or Yearly plan with VietQR inside the app'),
    ("to see the three plans, then choose Monthly or Yearly.", "to see the four plans, then choose Monthly, 6 Months or Yearly."),
    ("choose Monthly or Yearly, scan a VietQR code", "choose Monthly, 6 Months or Yearly, scan a VietQR code"),
    ('["Plans", "Monthly 50,000 ₫ (30 days, 50 hours)<small>Yearly 500,000 ₫ (365 days, unlimited)</small>"],',
     '["Plans", "Monthly 50,000 ₫ (30 days, 50 hours)<small>6 Months 269,000 ₫ (180 days, 100 hours per 30 days)</small><small>Yearly 500,000 ₫ (365 days, unlimited)</small>"],'),
    ("The screen lists all three plans; yours is marked", "The screen lists all four plans; yours is marked"),
    ("Click the <strong>Monthly</strong> or <strong>Yearly</strong> card", "Click the <strong>Monthly</strong>, <strong>6 Months</strong> or <strong>Yearly</strong> card"),
    ('alt: "The Upgrade screen: the Free, Monthly and Yearly plans with their quota and price,', 'alt: "The Upgrade screen: the Free, Monthly, 6 Months and Yearly plans with their quota and price,'),
    ("<strong>Renewing the same plan:</strong> adds 30 days (Monthly) or 365 days (Yearly), counted from the expiry date if the plan is still active.",
     "<strong>Renewing the same plan:</strong> adds 30 days (Monthly), 180 days (6 Months) or 365 days (Yearly), counted from the expiry date if the plan is still active."),
    ("Price per day: Monthly 50,000 ÷ 30 ≈ 1,667 ₫, Yearly 500,000 ÷ 365 ≈ 1,370 ₫. Example: with 20 days of Monthly left, buying Yearly adds 20 × 1,667 ÷ 1,370 ≈ 24 days, so Yearly runs 365 + 24 = 389 days. The other way,",
     "Price per day: Monthly 50,000 ÷ 30 ≈ 1,667 ₫, 6 Months 269,000 ÷ 180 ≈ 1,494 ₫, Yearly 500,000 ÷ 365 ≈ 1,370 ₫. Example: with 20 days of Monthly left, buying Yearly adds 20 × 1,667 ÷ 1,370 ≈ 24 days, so Yearly runs 365 + 24 = 389 days; buying 6 Months adds 20 × 1,667 ÷ 1,494 ≈ 22 days, so 6 Months runs 180 + 22 = 202 days. The other way,"),
])
print("xong: nội dung đã sửa")
EOF
````
Expected: in `xong: nội dung đã sửa`; `git diff --stat -- website/src/content` liệt kê đúng 28 file.

Các quyết định về chữ (để người xem lại biết vì sao):
- Mô tả và tiêu đề SEO giữ trong giới hạn của test (tiêu đề ≤ 70, mô tả 90 đến 165 ký tự): tiêu đề Bảng giá nêu tên bốn gói, giá nằm trong mô tả.
- Câu "ba gói" thành "bốn gói" khi nói cả bảng (Free và ba gói trả phí); "cần gói Monthly hoặc Yearly" thành "cần gói trả phí (Monthly, 6 Months hoặc Yearly)".
- Trang Bảng giá có thêm so sánh với mua lẻ: 6 đơn Monthly (180 ngày) tốn 300.000 ₫, so với 269.000 ₫ cho một đơn 6 Months; và ví dụ quy đổi thứ hai: Monthly còn 20 ngày, mua 6 Months được cộng 22 ngày (chạy 202 ngày).
- Hướng dẫn license: giá mỗi ngày 6 Months 269.000 ÷ 180 ≈ 1.494 ₫; 20 × 1.667 ÷ 1.494 ≈ 22 ngày.

- [ ] **Step 3: Chạy test, thấy xanh**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"`
Expected: `ℹ tests 81`, `ℹ pass 79`, `ℹ fail 0`, `ℹ skipped 2`, không dòng `✖` (kể cả test độ dài tiêu đề và mô tả).

- [ ] **Step 4: Xem bằng mắt các bảng và trang hướng dẫn**

Ghi script chụp rồi chạy (bật máy chủ cổng 4175 như Task 1 Step 5):

````bash
mkdir -p /Users/dtphong/Desktop/software_business/ai-translator/target/website-six-months && cat > /Users/dtphong/Desktop/software_business/ai-translator/target/website-six-months/shot-tables.mjs <<'EOF'
// Chụp vài vùng của website đã dựng để người kiểm xem bằng mắt: bảng so sánh gói, bảng Tính năng, đầu trang hướng dẫn license.
// Dùng: node shot-tables.mjs <địa chỉ website> <thư mục ghi ảnh>
import { mkdirSync } from "node:fs";
import { launch } from "/Users/dtphong/Desktop/software_business/ai-translator/website/tools/browser/cdp.mjs";

const BASE = process.argv[2];
const out = process.argv[3];
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome (đặt CHROME=<đường dẫn>)");
for (const [name, path, width, selector, dark] of [
  ["pricing-table-1280", "/bang-gia/", 1280, "#six-months-table", false],
  ["pricing-table-375", "/bang-gia/", 375, "#six-months-table", false],
  ["pricing-table-en-1280-dark", "/en/pricing/", 1280, "#six-months-table", true],
  ["features-table-1280", "/tinh-nang/", 1280, "#six-months-table", false],
  ["license-guide-1280", "/huong-dan/mua-va-kich-hoat-key/", 1280, ".doc-layout", false],
]) {
  const page = await browser.newPage({ width, height: 1000, dpr: 1, dark });
  await page.goto(`${BASE}${path}`);
  await sleep(800);
  await page.eval(`document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in", "visible", "is-visible"));`);
  // Đánh dấu bảng có cột 6 Months (trang Tính năng còn bảng khác, ví dụ phím tắt) để chụp đúng bảng gói.
  await page.eval(`document.querySelectorAll(".table-wrap").forEach((w) => { if (w.textContent.includes("6 Months")) w.id = "six-months-table"; })`);
  await sleep(400);
  const o = JSON.parse(await page.eval(`JSON.stringify({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })`));
  console.log(`${o.scrollW <= o.clientW ? "PASS" : "FAIL"}  ${name}: không cuộn ngang (${o.scrollW}/${o.clientW})`);
  await page.screenshot(`${out}/${name}.png`, { full: true, clipSelector: selector });
  await page.close?.();
}
await browser.close();
EOF
````

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m node src/build/build.mjs | tail -1 && (WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m node src/serve.mjs 4175 > /Users/dtphong/Desktop/software_business/ai-translator/target/website-six-months/serve.log 2>&1 &) ; for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:4175/bang-gia/ && echo "website sẵn sàng sau ${i}s" && break; sleep 1; done; cd .. && node target/website-six-months/shot-tables.mjs http://127.0.0.1:4175 target/website-six-months/shots-tables
```
Expected: năm dòng `PASS  <tên>: không cuộn ngang (…)`.

Xem ảnh bằng công cụ Read ở `target/website-six-months/shots-tables/`: `pricing-table-1280.png` (năm cột Free, Monthly, 6 Months, Yearly, hàng "Quy ra mỗi tháng" có "khoảng 44.800 ₫"), `pricing-table-375.png` (bảng cuộn ngang trong khung, không làm trang cuộn), `features-table-1280.png`, `license-guide-1280.png` (hàng "Gói" của bảng đầu trang ghi ba gói trên ba dòng; mục "Mua gói trong app" có ảnh màn hình Nâng cấp; ảnh này chụp lại ở Task 4). Có gì lệch hay chữ bị cắt thì dừng và báo kèm ảnh.

Tắt máy chủ: `cd /Users/dtphong/Desktop/software_business/ai-translator && PID=$(lsof -nP -iTCP:4175 -sTCP:LISTEN -t | head -1); echo "PID=$PID"; [ -n "$PID" ] && kill $PID; sleep 1; lsof -nP -iTCP:4175 -sTCP:LISTEN || echo "cổng 4175 đã đóng"`

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && for l in vi en; do for f in about compare-offline-cloud download faq features guide-glossary guide-history-export guide-license guide-troubleshooting guide home pricing solutions-webinar solutions; do git add website/src/content/$l/$f.mjs; done; done && git add website/test/site.test.mjs && git status --short && git commit -q -m "$(cat <<'EOF'
feat(website): nội dung nói đúng về gói 6 Months ở 14 trang vi và en

Bảng giá và Tính năng thêm cột 6 Months; trang chủ, hỏi đáp, giới thiệu, giải pháp,
tải xuống, so sánh và các hướng dẫn nêu cả ba gói trả phí (giá, 100 giờ mỗi 30 ngày,
180 ngày, gia hạn +180 ngày, ví dụ quy đổi 22 ngày). Hai test mới: mọi hàng bảng so
sánh đủ ô, và không còn câu liệt kê chỉ Monthly với Yearly (kể cả trang điều khoản).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

### Task 4: Ảnh màn hình Nâng cấp

Ảnh màn hình Nâng cấp trên website (`app-upgrade`, `app-upgrade-qr`, mỗi cái hai ngôn ngữ) chụp bằng giao diện thật của app trên trang xem trước. Sau kế hoạch 02 màn hình có bốn thẻ 2×2 nên phải chụp lại, nếu không website mô tả "bốn gói" bên cạnh một ảnh ba gói. Cần kế hoạch 02 Task 4 (dữ liệu giả có gói 6 Months và lưới 2×2).

**Files:**
- Modify (ghi bởi công cụ chụp): `website/src/assets/img/app/app-upgrade.vi.webp`, `app-upgrade.en.webp`, `app-upgrade-qr.vi.webp`, `app-upgrade-qr.en.webp`, `manifest.json`

- [ ] **Step 1: Bật trang xem trước của app (cổng 1430)**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && (lsof -nP -iTCP:1430 -sTCP:LISTEN && echo "CỔNG 1430 ĐANG DÙNG: dừng, báo chủ dự án") || (mkdir -p target/website-six-months && (node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1430 > target/website-six-months/vite-1430.log 2>&1 &) ; for i in $(seq 1 40); do curl -sf -o /dev/null "http://127.0.0.1:1430/?screen=upgrade&plan=free" && echo "trang xem trước sẵn sàng sau ${i}s" && break; sleep 1; done)`
Expected: `trang xem trước sẵn sàng sau …s`. Nếu in `CỔNG 1430 ĐANG DÙNG` thì tiến trình đó không phải của bạn: **dừng**, đừng tắt nó (`shoot.mjs` cố định cổng 1430).

- [ ] **Step 2: Chụp lại bốn ảnh**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node scripts/ui-preview/shoot.mjs app-upgrade app-upgrade-qr 2>&1 | tail -6; git status --short website/src/assets/img/app`
Expected: bốn dòng `app-upgrade.vi.webp … B`, `app-upgrade-qr.vi.webp … B`, `app-upgrade.en.webp … B`, `app-upgrade-qr.en.webp … B` (mỗi ảnh khoảng 45 đến 55 KB), không dòng lỗi; `git status` liệt kê bốn file `.webp` và `manifest.json` là `M`. (Công cụ cần `cwebp` và `sips` của macOS; ghi lại `bytes`, `width`, `height` trong manifest, giữ nguyên `description`.)

- [ ] **Step 3: Xem ảnh bằng mắt**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && for f in app-upgrade.vi app-upgrade.en app-upgrade-qr.vi; do dwebp -quiet website/src/assets/img/app/$f.webp -o target/website-six-months/$f.png; done; ls target/website-six-months/*.png`
Rồi dùng công cụ Read mở ba file PNG đó. Phải thấy: bốn thẻ xếp 2×2 (Free và Monthly hàng trên; 6 Months "269.000 đ / 180 ngày", "100 giờ mỗi 30 ngày" và Yearly hàng dưới), thẻ Free có nhãn "Đang dùng" (bản en: "Current"), ảnh `qr` còn mã VietQR và nút "Mở trang thanh toán"; chữ không bị cắt. Có gì lệch thì dừng và báo.

- [ ] **Step 4: Sửa mô tả ảnh trong manifest**

Chạy:
````bash
cd /Users/dtphong/Desktop/software_business/ai-translator && python3 - <<'EOF'
import pathlib

p = pathlib.Path("/Users/dtphong/Desktop/software_business/ai-translator/website/src/assets/img/app/manifest.json")
s = p.read_text()
pairs = [
    ("Màn hình Nâng cấp với ba gói: Free 30 phút mỗi ngày dùng thử 10 ngày, Monthly 50 giờ giá 50.000 đ, Yearly không giới hạn giá 500.000 đ.",
     "Màn hình Nâng cấp với bốn gói: Free 30 phút mỗi ngày dùng thử 10 ngày, Monthly 50 giờ giá 50.000 đ, 6 Months 100 giờ giá 269.000 đ, Yearly không giới hạn giá 500.000 đ."),
    ("The Upgrade screen with three plans: Free with 30 minutes a day for a 10-day trial, Monthly with 50 hours for 50.000 đ and Yearly with unlimited use for 500.000 đ.",
     "The Upgrade screen with four plans: Free with 30 minutes a day for a 10-day trial, Monthly with 50 hours for 50.000 đ, 6 Months with 100 hours for 269.000 đ and Yearly with unlimited use for 500.000 đ."),
]
for old, new in pairs:
    assert s.count(old) == 1, old[:60]
    s = s.replace(old, new)
p.write_text(s)
print("xong: mô tả ảnh")
EOF
````
Expected: in `xong: mô tả ảnh`. (Mô tả của `app-upgrade-qr` nói về thanh toán Monthly bằng VietQR nên vẫn đúng.)

- [ ] **Step 5: Tắt trang xem trước, chạy test, commit**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && PID=$(lsof -nP -iTCP:1430 -sTCP:LISTEN -t | head -1); echo "PID=$PID"; [ -n "$PID" ] && kill $PID; sleep 1; lsof -nP -iTCP:1430 -sTCP:LISTEN || echo "cổng 1430 đã đóng"; cd website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)"`
Expected: `cổng 1430 đã đóng`; `ℹ tests 81`, `ℹ pass 79`, `ℹ fail 0`, `ℹ skipped 2` (kể cả test `ảnh chụp app có mã băm nội dung trong đường dẫn`).

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short && git add website/src/assets/img/app/app-upgrade.vi.webp website/src/assets/img/app/app-upgrade.en.webp website/src/assets/img/app/app-upgrade-qr.vi.webp website/src/assets/img/app/app-upgrade-qr.en.webp website/src/assets/img/app/manifest.json && git commit -q -m "$(cat <<'EOF'
feat(website): chụp lại ảnh màn hình Nâng cấp (bốn thẻ, có 6 Months)

Chụp bằng scripts/ui-preview/shoot.mjs trên giao diện thật của app (kế hoạch 02):
bốn thẻ 2×2, thẻ 6 Months 269.000 đ / 180 ngày, 100 giờ mỗi 30 ngày; vi và en,
ảnh thường và ảnh có mã VietQR. Mô tả ảnh trong manifest nêu bốn gói.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

### Task 5: Tài liệu: README website, spec, runbook phát hành

**Files:**
- Modify: `website/README.md`, `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`, `docs/superpowers/specs/2026-10-07-three-plans-single-device-design.md`, `docs/release/phat-hanh.md`

- [ ] **Step 1: Chạy script tài liệu**

Script thêm: ghi chú "thêm hay bớt một gói" vào `website/README.md` (các chỗ phải sửa và test bắt sót); dòng sửa ngày 2026-10-13 và hàng `six_months` trong bảng gói của spec gốc; một dòng bổ sung ở spec ba gói; mục 8 của runbook phát hành (thứ tự migration, Worker API, Worker admin, app, website, kèm kiểm trước và sau migration, đường lui). Mỗi thay thế `assert` đúng một chỗ khớp.

````bash
cd /Users/dtphong/Desktop/software_business/ai-translator && python3 - <<'EOF'
# README website, dòng trỏ trong spec và runbook phát hành mục 8 cho gói 6 Months (spec 2026-10-13 §4, §5).
import pathlib

REPO = pathlib.Path("/Users/dtphong/Desktop/software_business/ai-translator")


def rep(rel, pairs):
    p = REPO / rel
    s = p.read_text()
    for old, new in pairs:
        n = s.count(old)
        assert n == 1, f"{rel}: {n} chỗ khớp (cần 1): {old[:90]!r}"
        s = s.replace(old, new)
    p.write_text(s)


# --- website/README.md
rep("website/README.md", [
    ("ba gói, giá, hạn mức (test đối chiếu server/wrangler.jsonc)", "các gói (Free và ba gói trả phí), giá, hạn mức (test đối chiếu server/wrangler.jsonc)"),
    ("- Đổi giá ở `server/wrangler.jsonc` thì đổi cả `src/plans.mjs` và mọi chỗ nhắc giá trong `src/content/` (test báo lệch giá/hạn mức).",
     "- Đổi giá ở `server/wrangler.jsonc` thì đổi cả `src/plans.mjs` và mọi chỗ nhắc giá trong `src/content/` (test báo lệch giá/hạn mức).\n"
     "- Thêm hay bớt một gói: `src/plans.mjs` (theo thứ tự thời hạn); mô tả và ba gạch đầu dòng của thẻ gói ở `plansGrid` (`src/build/components.mjs`; "
     "lưới `.plans` ở `src/assets/site.css` là 1 cột, 2×2 từ 700px: bốn thẻ không để thẻ lẻ, xem lại nếu số thẻ đổi); `keyFacts()` ở `src/build/build.mjs` "
     "(lấy gói theo mã, không theo vị trí); cột trong hai bảng so sánh (Bảng giá, Tính năng) và mọi câu liệt kê gói; điều khoản (`docs/legal/eula.*.md`); "
     "chụp lại ảnh màn hình Nâng cấp. Test `bảng gói của website…`, `bảng so sánh gói…` và `không còn câu liệt kê chỉ…` bắt các chỗ sót."),
])

# --- spec gốc: dòng sửa ngày 2026-10-13 và hàng 6 Months trong bảng gói (P1)
rep("docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md", [
    ("- Sửa ngày 2026-10-12: dịch trong lúc người nói chưa dừng",
     "- Sửa ngày 2026-10-13: thêm gói trả phí thứ ba 6 Months (269.000 đ, 100 giờ mỗi chu kỳ 30 ngày, 180 ngày mỗi đơn; spec `2026-10-13-six-months-plan-design.md`). "
     "Mọi chỗ của spec này nói \"ba gói\" hay \"hai gói trả phí\" nay là bốn gói (Free và ba gói trả phí); bảng gói ở §2 đã có thêm hàng 6 Months.\n"
     "- Sửa ngày 2026-10-12: dịch trong lúc người nói chưa dừng"),
    ("| `monthly` | Monthly | 50 giờ (3000 phút) mỗi chu kỳ 30 ngày | 30 ngày mỗi đơn | 50.000 đ |\n",
     "| `monthly` | Monthly | 50 giờ (3000 phút) mỗi chu kỳ 30 ngày | 30 ngày mỗi đơn | 50.000 đ |\n"
     "| `six_months` | 6 Months | 100 giờ (6000 phút) mỗi chu kỳ 30 ngày | 180 ngày mỗi đơn | 269.000 đ |\n"),
])

# --- spec ba gói: một dòng bổ sung
p = REPO / "docs/superpowers/specs/2026-10-07-three-plans-single-device-design.md"
lines = p.read_text().split("\n")
idx = [i for i, l in enumerate(lines) if l.startswith("**Quan hệ với spec gốc:**")]
assert len(idx) == 1, idx
lines[idx[0] + 1:idx[0] + 1] = ["", "**Bổ sung ngày 2026-10-13:** thêm gói trả phí thứ ba `six_months` (6 Months), xem `2026-10-13-six-months-plan-design.md`; các chỗ của spec này nói \"ba gói\" hay \"hai gói trả phí\" nay là Free và ba gói trả phí."]
p.write_text("\n".join(lines))

# --- runbook phát hành: mục 8
RUNBOOK = '''

## 8. Đợt thêm gói 6 Months (migration D1 0003)

Spec `2026-10-13-six-months-plan-design.md` (mục 6), kế hoạch `2026-10-13-goi-6-thang-01-server-admin.md`. **Mỗi bước chỉ làm khi chủ dự án cho phép**; các lệnh ghi vào production do chủ dự án chạy (agent viết sẵn script, chủ dự án chạy bằng `! sh <script>`). Thứ tự không đổi được: migration, Worker API, Worker admin, app, website. Chạy trong `server/`; `PROD` và `PADMIN` như mục 4.

Vì sao thứ tự này: migration 0003 chỉ **nới** ràng buộc CHECK mã gói, nên Worker cũ vẫn chạy đúng trên schema mới; Worker API mới cần schema mới để ghi đơn và license `six_months`; `GET /v1/plans` chỉ đưa gói mới cho app khai báo `?plans=`, nên máy chạy bản app cũ không thấy gói chưa mua được; website chỉ được nói điều đã thật nên đi sau cùng.

1. **Kiểm trước khi áp (chỉ đọc), ghi lại kết quả để so sau.** Migration dựng lại bốn bảng `licenses`, `orders`, `activations`, `deactivations` đúng theo `0002_three_plans_trials.sql`: nếu production có cột hay ràng buộc ngoài 0002 (ví dụ có người sửa tay), migration sẽ làm mất chúng. Nên kiểm schema thật trước:

   ```bash
   pnpm exec wrangler d1 time-travel info mt-license-production
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('licenses', 'orders', 'activations', 'deactivations') ORDER BY name"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM licenses) AS licenses, (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM activations) AS activations, (SELECT COUNT(*) FROM deactivations) AS deactivations, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq, (SELECT seq FROM sqlite_sequence WHERE name = 'deactivations') AS deactivations_seq"
   ```

   Expected: `time-travel info` in mốc hiện tại (**chép lại**: đường lui nếu cần khôi phục dữ liệu). Bốn câu `CREATE TABLE` khớp từng cột, kiểu, `NOT NULL`, `DEFAULT`, `CHECK (plan IN ('monthly', 'yearly'))` và `REFERENCES` với bảng cùng tên trong `server/migrations/0002_three_plans_trials.sql` (sau khi đổi tên bảng, SQLite ghi tên có dấu nháy kép như `"licenses"`: khác chỉ ở chỗ đó là bình thường). Câu đếm cho số dòng của bốn bảng và hai bộ đếm `orders_seq`, `deactivations_seq`. **Khác ở bất kỳ cột nào thì dừng và báo.**

2. **(Tùy chọn; các lệnh này chưa được thử trong repo)** Chạy thử migration trên bản sao dữ liệu thật. Bản xuất có email khách: để ngoài repo và **xóa ngay khi xong**. Lệnh nào không chạy được thì bỏ qua bước này (bước 1 và 4 mới là bắt buộc).

   ```bash
   W=$(mktemp -d)
   pnpm exec wrangler d1 export mt-license-production --remote --output "$W/prod.sql"
   pnpm exec wrangler d1 execute mt-license-production --local --persist-to "$W/state" --file "$W/prod.sql"
   pnpm exec wrangler d1 migrations apply mt-license-production --local --persist-to "$W/state"
   pnpm exec wrangler d1 execute mt-license-production --local --persist-to "$W/state" --command "PRAGMA foreign_key_check"
   rm -rf "$W"
   ```

   Expected: chỉ migration `0003_six_months_plan.sql` được áp (0001 và 0002 đã có trong bảng `d1_migrations` của bản xuất); `foreign_key_check` không trả dòng nào.

3. **Áp migration lên production:**

   ```bash
   pnpm exec wrangler d1 migrations apply mt-license-production --remote
   ```

   Expected: danh sách chỉ có `0003_six_months_plan.sql`, rồi `✅`.

4. **Kiểm sau khi áp:** chạy lại hai câu `SELECT` của bước 1 và `PRAGMA foreign_key_check`.

   ```bash
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"
   ```

   Expected: schema giống bước 1, chỉ khác chuỗi CHECK của `licenses` và `orders` (nay là `CHECK (plan IN ('monthly', 'six_months', 'yearly'))`); số dòng và hai bộ đếm **bằng đúng** bước 1 (số đơn không được lùi: PayOS nhớ mọi `orderCode` đã dùng và từ chối mã trùng); `foreign_key_check` không trả dòng nào. Lệch ở chỗ nào thì dừng, không deploy Worker, và hỏi chủ dự án trước khi khôi phục bằng Time Travel (mốc đã chép ở bước 1).

5. **Deploy Worker API** (`PLANS` có `six_months` đã nằm trong `wrangler.jsonc`):

   ```bash
   pnpm check && pnpm exec wrangler deploy
   curl -s "$PROD/v1/health"; echo
   curl -s "$PROD/v1/plans"; echo
   curl -s "$PROD/v1/plans?plans=monthly,six_months,yearly"; echo
   ```

   Expected: như mục 4 bước 9 (`Uploaded mt-license`, `schedule: */5 * * * *`, `{"ok":true}`). `GET /v1/plans` không tham số trả **đúng hai gói** `monthly`, `yearly` như trước (đó là điều bản app cũ nhận). Có `?plans=monthly,six_months,yearly` trả ba gói theo thứ tự `monthly`, `six_months` (`"quota_minutes_per_cycle":6000`, `"days_per_order":180`, `"VND":269000`), `yearly`. Kiểm cron vẫn chạy như mục 4 bước 9 (`pnpm exec wrangler triggers deploy` nếu mất lịch).

6. **Deploy Worker admin:**

   ```bash
   pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
   curl -s -o /dev/null -w '%{http_code}\\n' "$PADMIN/admin/whoami"
   ```

   Expected: như mục 4 bước 10 (khi chưa đăng nhập Access thì không phải `5xx`). Đăng nhập Web Admin: trang Tổng quan vẽ biểu đồ doanh thu theo gói với chuỗi thứ ba; ô "Cấp license mới" liệt kê `6 Months`.

7. **Phát hành app** theo mục 2 (nâng phiên bản ở đó). App mới gọi `?plans=` nên thấy bốn thẻ gói; máy chạy bản cũ vẫn thấy ba thẻ (Free, Monthly, Yearly) như trước.

8. **Deploy website** sau khi bản app có gói 6 Months đã được đăng lên R2 (kiểm R2 ở mục 2): `cd website && pnpm deploy`. Nếu ngày deploy thật khác 2026-10-13 thì sửa ngày hiệu lực EULA 1.2 trước (`docs/legal/eula.vi.md`, `eula.en.md`, `README.md`, và `modified` của `website/src/content/{vi,en}/terms.mjs`) để repo ghi một ngày có thật.

9. **Thử tay:** mua một đơn 6 Months thật bằng PayOS và kiểm app tự kích hoạt (hạn mới = lúc trả tiền + 180 ngày, hạn mức "100 giờ mỗi 30 ngày"); đổi gói từ Monthly sang 6 Months và xem số ngày quy đổi; một máy chạy bản app cũ vẫn thấy ba thẻ.

**Đường lui.** Worker API và Worker admin quay về phiên bản trước bằng `pnpm exec wrangler rollback` (schema mới tương thích với code cũ). Nhưng nếu đã có đơn hay license `six_months` thì Worker cũ **không đọc được** chúng (bảng `PLANS` cũ không có gói đó): chỉ lùi khi chưa có khách mua gói mới, còn không thì sửa tiến. Migration 0003 không có bước lùi vì nó chỉ nới CHECK và không đổi dữ liệu.
'''
rb = REPO / "docs/release/phat-hanh.md"
s = rb.read_text()
assert "## 8. Đợt thêm gói 6 Months" not in s
rb.write_text(s.rstrip("\n") + "\n" + RUNBOOK)
print("xong: tài liệu")
EOF
````
Expected: in `xong: tài liệu`.

- [ ] **Step 2: Kiểm bằng mắt kết quả**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && git diff --stat -- website/README.md docs/superpowers/specs docs/release/phat-hanh.md && grep -n "^## 8. Đợt thêm gói 6 Months" docs/release/phat-hanh.md && grep -n "six_months" docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md | cut -c1-120 && tail -c 400 docs/release/phat-hanh.md`
Expected: bốn file được sửa; một dòng `## 8. Đợt thêm gói 6 Months (migration D1 0003)`; một dòng hàng `six_months` trong bảng gói của spec gốc; cuối runbook là đoạn "Đường lui".

- [ ] **Step 3: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short && git add website/README.md docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md docs/superpowers/specs/2026-10-07-three-plans-single-device-design.md docs/release/phat-hanh.md && git commit -q -m "$(cat <<'EOF'
docs: gói 6 Months ở README website, hai spec cũ và runbook phát hành mục 8

README website ghi những chỗ phải sửa khi thêm một gói và test bắt sót. Spec gốc và
spec ba gói có dòng trỏ tới spec 2026-10-13; spec gốc thêm hàng 6 Months ở bảng gói.
Runbook mục 8: kiểm schema production trước và sau migration 0003 (số đơn không được
lùi), thứ tự migration, Worker API, Worker admin, app, website, đường lui.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

### Task 6: Kiểm toàn bộ phần website và tài liệu

**Files:** không sửa file nào, không commit.

- [ ] **Step 1: Toàn bộ test website và test gốc**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m pnpm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail|skipped)" && cd .. && pnpm test 2>&1 | grep -E "×|Test Files|Tests "`
Expected: website `ℹ tests 81`, `ℹ pass 79`, `ℹ fail 0`, `ℹ skipped 2`; gốc `Test Files  23 passed (23)`, `Tests  248 passed (248)`.

- [ ] **Step 2: Không còn chỗ cũ**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && grep -rn -E "Monthly (hoặc|or|và|and) Yearly|Monthly, Yearly|Hai gói trả phí|Both paid plans" website/src docs/legal | cut -c1-160; echo "grep xong (không có dòng nào ở trên là đạt)"`
Expected: chỉ dòng cuối `grep xong (…)`. (Một chỗ cố ý còn nhắc "Monthly và Yearly" nằm ngoài `website/src` và `docs/legal` thì không tính, ví dụ spec và kế hoạch lịch sử.)

- [ ] **Step 3: Bố cục thật trên website đã dựng, mọi bề rộng**

Run:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m node src/build/build.mjs | tail -1 && (WEBSITE_DIST=/Users/dtphong/Desktop/software_business/ai-translator/target/website-dist-6m node src/serve.mjs 4175 > /Users/dtphong/Desktop/software_business/ai-translator/target/website-six-months/serve.log 2>&1 &) ; for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:4175/bang-gia/ && echo "website sẵn sàng sau ${i}s" && break; sleep 1; done; cd .. && node target/website-six-months/verify-site-plans.mjs http://127.0.0.1:4175 2>&1 | grep -E "FAIL|CÓ|ĐẠT"; PID=$(lsof -nP -iTCP:4175 -sTCP:LISTEN -t | head -1); [ -n "$PID" ] && kill $PID; sleep 1; lsof -nP -iTCP:4175 -sTCP:LISTEN || echo "cổng 4175 đã đóng"
```
Expected: `ĐẠT` (không dòng `FAIL`); `cổng 4175 đã đóng`. (Script `verify-site-plans.mjs` đã có từ Task 1; thiếu file thì ghi lại bằng lệnh ở Task 1 Step 5.)

- [ ] **Step 4: Dọn và đối chiếu**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && rm -rf target/website-dist-6m target/website-six-months && (lsof -nP -iTCP:4175 -iTCP:1430 -sTCP:LISTEN || echo "không còn cổng nào của kế hoạch này") && git log --oneline -6 && git status --short`
Expected: `không còn cổng nào của kế hoạch này`; năm commit của Task 1 đến 5 ở đầu danh sách; `git status` chỉ còn file chưa theo dõi nói ở đầu (cổng 4173 của tiến trình khác, nếu có, không đụng).

**Việc còn lại sau kế hoạch này (không làm ở đây):** deploy website sau khi bản app có gói 6 Months đã đăng lên R2 và khi chủ dự án cho phép (`cd website && pnpm deploy`; runbook mục 8 bước 8), rồi kiểm trang sống `aitranslator.io.vn/bang-gia/` và `/en/pricing/`. Nếu ngày deploy thật khác 2026-10-13 thì sửa ngày hiệu lực EULA 1.2 trước (runbook mục 8 bước 8).
