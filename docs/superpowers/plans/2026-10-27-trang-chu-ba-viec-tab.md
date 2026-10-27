# Trang chủ: khối tab "Tính năng chính" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gộp bốn phần của trang chủ (Video demo, Dịch cuộc họp, Gõ dịch, Lịch sử) thành một khối ba tab, rút chữ phần Cách dùng, Dữ liệu, Hỏi đáp, ở cả năm ngôn ngữ; hero, Bảng giá và lời mời cuối trang giữ nguyên.

**Architecture:** Một thành phần dựng HTML mới `featureTabs` (components.mjs) cho khối tab, nâng cấp bằng `initFeatureTabs` (site.js) theo đúng khuôn tab của trang Tải xuống: tắt JS thì ba panel xếp dọc, bật JS thì tab đầu mở sẵn, neo `#` mở đúng tab, bàn phím, chuyển tab thì tạm dừng video. Bốn file `home.mjs` ja/zh/ko/en/vi viết lại cùng khung. Spec: `docs/superpowers/specs/2026-10-27-trang-chu-ba-viec-tab-design.md`.

**Tech Stack:** Node ≥ 24.21 (bộ sinh tĩnh thuần, không framework), `node --test`, Chrome không đầu qua `website/tools/browser/cdp.mjs`, CSS thuần.

---

## Quy ước chung (đọc trước khi làm)

- **Worktree riêng:** `/Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec`, nhánh `trang-chu-ba-viec` (từ `main` 8de55fda). Thư mục chính `/Users/dtphong/Desktop/software_business/ai-translator` ở `main`, **không đụng**.
- **Bash không giữ thư mục làm việc giữa các lệnh:** mọi lệnh bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`. Đường dẫn dưới đây viết tắt là `W` = `/Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec` (khi chạy thì viết đủ, không dùng biến).
- Trước mỗi commit: `cd W && git branch --show-current` phải in `trang-chu-ba-viec`.
- **Không push, không deploy, không `pkill`.** Chủ dự án tự quyết khi nào đẩy và `pnpm deploy`.
- Commit bằng tiếng Việt, kiểu `feat(website): …`, kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Lệnh test trong `W/website`: `node --test "test/*.test.mjs"` (tương đương `pnpm test`; không cần `pnpm install`). Test trình duyệt tự bỏ qua nếu không có Chrome; trên máy này có Chrome, nên phải **chạy thật** chứ không bỏ qua (kiểm dòng `# skipped` của kết quả).
- **Quy tắc nội dung của dự án (CLAUDE.md, `website/README.md`):** sửa nội dung một trang thì sửa đủ năm ngôn ngữ; chỉ nói điều có thật; không nêu tên model, engine, thư viện, khung app; số đo kèm điều kiện đo.
- Bản gốc của mọi `home.mjs` trước khi sửa lấy lại bằng `git show 8de55fda:website/src/content/<lang>/home.mjs` khi cần khôi phục một câu bị test bắt buộc.

### Chỗ khác với spec đã duyệt (Task 1 sửa spec cho khớp)

1. **Mục tiêu chữ:** spec ghi 1.200–1.300 chữ là ước lượng nhẩm. Soạn chữ thật cho thấy hero (192), Bảng giá (279), sơ đồ dữ liệu (98) và lời mời cuối trang (33) không đổi đã chiếm 602 chữ, nên tổng khoảng **1.700** chữ trong HTML (từ 2.162), và chữ **nhìn thấy ngay** khi mở trang (chưa bấm tab, chưa mở mục) khoảng **1.100**. Muốn xuống 1.300 phải bỏ các câu nói thẳng mà test bắt buộc.
2. **id phần:** `tinh-nang-chinh` (vi) / `main-features` (en, ja, zh, ko) thay cho `ba-viec` / `three-things`, khớp tiêu đề "Tính năng chính" hiện trên trang.
3. **Hỏi đáp:** hai câu bị ràng buộc dài hơn mức 45 chữ (livestream ≤ ~110 chữ; "ngoài Việt Nam" ≤ ~70 chữ); các câu còn lại ≤ ~60 chữ.
4. **Panel không có `tabindex="0"`** (bên trong đã có liên kết và video để Tab tới).

## Cấu trúc file

| File | Việc |
|---|---|
| `website/tools/measure-home.mjs` (tạo) | Đo số chữ từng phần, chữ nhìn thấy ngay, chiều cao trang, chụp ảnh kiểm |
| `website/src/build/components.mjs` (sửa) | Thêm `featureTabs`; Task 5 bỏ `demoVideoPair` |
| `website/src/assets/site.css` (sửa) | CSS `.ftabs*` và `.more-details`; Task 5 bỏ `.video-pair`, `.video-col` |
| `website/src/assets/site.js` (sửa) | Thêm `initFeatureTabs`; Task 5 bỏ đoạn "hai video cạnh nhau tạm dừng nhau" |
| `website/src/content/{vi,en,ja,zh,ko}/home.mjs` (viết lại) | Cùng khung mới |
| `website/test/i18n.test.mjs` (sửa) | Test đơn vị `featureTabs`; Task 5 bỏ test `demoVideoPair` |
| `website/test/feature-tabs.test.mjs` (tạo) | Test trình duyệt khối tab |
| `website/test/video-facade.test.mjs` (viết lại) | Theo bố cục tab |
| `website/README.md` (sửa) | Mục khối tab, công cụ đo, bullet video |
| `docs/superpowers/specs/2026-10-27-trang-chu-ba-viec-tab-design.md` (sửa) | Task 1 và Task 6 |

---

### Task 0: Chuẩn bị và đo nền

**Files:**
- Create: `website/tools/measure-home.mjs`

- [ ] **Step 1: Kiểm trạng thái worktree**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec && git branch --show-current && git status --short && git log --oneline -2 | cat && node -v`
Expected: `trang-chu-ba-viec`, không có dòng trạng thái, commit đầu là `docs(website): spec trang chủ khối Ba việc có tab…`, `v24.21.0` (hoặc cao hơn).

- [ ] **Step 2: Chạy toàn bộ test để có số đo nền**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node --test "test/*.test.mjs" 2>&1 | tail -12`
Expected: `# fail 0`. Ghi lại `# tests`, `# pass`, `# skipped` (số nền). Nếu `# fail` > 0 khi chưa sửa gì: **dừng và báo chủ dự án**, đừng làm tiếp.

- [ ] **Step 3: Viết công cụ đo**

Create `website/tools/measure-home.mjs`:

```js
// Đo trang chủ khi rút gọn nội dung (spec 2026-10-27-trang-chu-ba-viec-tab-design, mục Kiểm). Chạy trong website/:
//   node tools/measure-home.mjs                    số chữ từng phần của trang chủ vi và en (bản dựng)
//   node tools/measure-home.mjs --browser          thêm chữ nhìn thấy ngay (innerText của <main>, chưa bấm tab hay mở mục) và chiều
//                                                  cao trang ở 1280 và 375 px, năm ngôn ngữ (cần Chrome; chữ ja/zh/ko không tách bằng
//                                                  khoảng trắng nên con số của chúng chỉ để so trước và sau)
//   node tools/measure-home.mjs --shots=<thư mục>  như --browser, và chụp ảnh: home-<lang>-1280.png, home-<lang>-375.png (toàn
//                                                  trang), home-vi-375-dark.png, tab-vi-<id>.png (ba tab ở 1280 px)
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const shots = args.find((a) => a.startsWith("--shots="))?.slice("--shots=".length);
const withBrowser = args.includes("--browser") || Boolean(shots);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DIST = mkdtempSync(join(tmpdir(), "measure-dist-"));
process.env.WEBSITE_DIST = DIST;
const { build } = await import("../src/build/build.mjs");
await build();

const HOME = { vi: "/", en: "/en/", ja: "/ja/", zh: "/zh/", ko: "/ko/" };
const words = (html) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
const mainOf = (h) => /<main id="main">([\s\S]*)<\/main>/.exec(h)?.[1] ?? "";

for (const lang of ["vi", "en"]) {
  const main = mainOf(readFileSync(join(DIST, HOME[lang], "index.html"), "utf8"));
  console.log(`\n== ${lang}: số chữ từng phần (trong HTML, tính cả phần ẩn) ==`);
  let total = 0;
  for (const part of main.split(/(?=<section\b)/).filter((p) => p.startsWith("<section"))) {
    const attrs = /^<section\b([^>]*)>/.exec(part)[1];
    const label = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? /\bclass="([^"]+)"/.exec(attrs)?.[1] ?? "?";
    const w = words(part.slice(0, part.indexOf("</section>")));
    total += w;
    console.log(`${label.padEnd(24)}${String(w).padStart(6)}`);
  }
  console.log(`${"TỔNG".padEnd(24)}${String(total).padStart(6)}`);
}

if (withBrowser) {
  const { start } = await import("../src/serve.mjs");
  const { launch } = await import("./browser/cdp.mjs");
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch();
  try {
    if (shots) mkdirSync(shots, { recursive: true });
    console.log("\n== chữ nhìn thấy ngay (thayNgay) và chiều cao trang (px) ==");
    for (const [lang, path] of Object.entries(HOME)) {
      const row = { lang };
      for (const width of [1280, 375]) {
        const p = await browser.newPage({ width, height: 900, mobile: width < 700 });
        await p.goto(base + path);
        await sleep(300);
        row[`cao${width}`] = await p.eval("document.documentElement.scrollHeight");
        if (width === 1280) row.thayNgay = await p.eval(`document.querySelector("main").innerText.split(/\\s+/).filter(Boolean).length`);
        if (shots) await p.screenshot(join(shots, `home-${lang}-${width}.png`), { full: true });
        await p.close();
      }
      console.log(JSON.stringify(row));
    }
    if (shots) {
      const dark = await browser.newPage({ width: 375, height: 800, mobile: true, dark: true });
      await dark.goto(base + HOME.vi);
      await sleep(300);
      await dark.screenshot(join(shots, "home-vi-375-dark.png"), { full: true });
      await dark.close();
      const p = await browser.newPage({ width: 1280, height: 900 });
      await p.goto(base + HOME.vi);
      for (const id of ["dich-cuoc-hop", "go-dich", "lich-su"]) {
        const tab = `[role="tab"][aria-controls="${id}"]`;
        if (await p.eval(`Boolean(document.querySelector(${JSON.stringify(tab)}))`)) {
          await p.click(tab);
          await sleep(450);
          await p.screenshot(join(shots, `tab-vi-${id}.png`), { clipSelector: "[data-ftabs]" });
        }
      }
      await p.close();
      console.log(`\nẢnh đã lưu ở ${shots}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}
rmSync(DIST, { recursive: true, force: true });
```

- [ ] **Step 4: Chạy để lấy số đo "trước"**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node tools/measure-home.mjs --browser`
Expected: bảng từng phần của vi gồm `video-demo`, `dich-cuoc-hop`, `go-dich`, `lich-su`, `cach-dung`, `rieng-tu-tren-may`, `gia` (và các phần không có id), **TỔNG gần 2162** (lệch vài chữ là chấp nhận được), rồi năm dòng JSON có `cao1280`, `cao375`, `thayNgay`. Giữ nguyên kết quả này trong ghi chú của phiên làm việc (bảng "trước", dùng ở Task 6).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec && git branch --show-current && git add website/tools/measure-home.mjs && git commit -q -m "$(cat <<'EOF'
chore(website): công cụ đo chữ và chiều cao trang chủ

Đếm chữ từng phần, chữ nhìn thấy ngay, chiều cao ở 1280 và 375 px, và chụp ảnh kiểm
để so trước và sau khi rút gọn trang chủ.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1 | cat
```

---

### Task 1: Chỉnh spec cho khớp số đo thật

**Files:**
- Modify: `docs/superpowers/specs/2026-10-27-trang-chu-ba-viec-tab-design.md`

- [ ] **Step 1: Năm chỗ sửa (dùng Edit, mỗi chỗ `old_string` khớp đúng một lần)**

1. id của khối:
   - old: ``| 2 | **Ba việc** (tab) | `ba-viec` / `three-things`; panel giữ id cũ: ``
   - new: ``| 2 | **Ba việc** (tab; tiêu đề hiện trên trang: "Tính năng chính") | `tinh-nang-chinh` / `main-features`; panel giữ id cũ: ``
2. Mục tiêu chữ:
   - old: `Mục tiêu chữ: khoảng **1.200–1.300** (từ 2.162; hero 191 và Bảng giá 279 không đổi).`
   - new: ``Mục tiêu chữ (bản vi, đo bằng `website/tools/measure-home.mjs`): tổng khoảng **1.700** chữ trong HTML (từ 2.162), trong đó chữ **nhìn thấy ngay** khi mở trang (chưa bấm tab, chưa mở mục, câu trả lời Hỏi đáp đóng) khoảng **1.100**. Hero (192), Bảng giá (279), sơ đồ dữ liệu (98) và lời mời cuối trang (33) không đổi, nên không xuống tới 1.300 nếu không bỏ các câu nói thẳng mà test bắt buộc. Con số 1.200–1.300 trong bản duyệt đầu là ước lượng nhẩm, đã sửa sau khi soạn chữ thật.``
3. Ngân sách Hỏi đáp:
   - old: `Mỗi câu trả lời ≤ ~45 chữ, riêng livestream ≤ ~60 chữ (đúng ý V1: YouTube Live đã thử một lần, TikTok LIVE tiếng Việt có nhạc nền chưa dùng được, Facebook Live chưa thử; còn liên kết trang livestream).`
   - new: `Mỗi câu trả lời ≤ ~60 chữ, riêng câu livestream ≤ ~110 chữ (giữ nguyên các câu V1 đã rà soát: YouTube Live đã thử một lần, TikTok LIVE tiếng Việt có nhạc nền chưa dùng được, Facebook Live chưa thử; không có bản điện thoại, không đưa phụ đề vào buổi live của người phát; còn liên kết trang livestream).`
4. Câu "ngoài Việt Nam":
   - old: `Câu "ngoài Việt Nam" giữ giá USD, "chưa gồm thuế" và câu giới hạn thẻ của Creem.`
   - new: `Câu "ngoài Việt Nam" giữ giá USD, "chưa gồm thuế" và câu giới hạn thẻ của Creem, nên dài hơn mức trên (≤ ~70 chữ).`
5. `.reveal` trong panel:
   - old: ``- **Không dùng `.reveal` trong panel** (IntersectionObserver không bao giờ hiện phần tử trong panel ẩn; lỗi đã gặp ở trang Tải xuống).``
   - new: ``- **`.reveal` trong panel:** ảnh và video do `appShot`/`demoVideo` mang sẵn lớp `.reveal`, nhưng IntersectionObserver không bao giờ hiện phần tử trong panel ẩn (lỗi đã gặp ở trang Tải xuống), nên CSS ép chúng luôn hiện (`.ftabs-panel .reveal`); không thêm `.reveal` vào chính panel.``
6. Mục Kiểm:
   - old: `- Đo trước và sau: số chữ từng phần (cùng cách đo như bảng trên) và chiều cao trang ở 1280 px, năm ngôn ngữ. Mục tiêu chữ tiếng Việt ≤ ~1.300.`
   - new: ``- Đo trước và sau bằng `node tools/measure-home.mjs --browser` (trong `website/`): số chữ từng phần (cùng cách đo như bảng trên), chữ nhìn thấy ngay và chiều cao trang ở 1280 và 375 px, năm ngôn ngữ. Số đo thực ghi ở cuối mục này khi làm xong.``

- [ ] **Step 2: Kiểm các chỗ sửa đã vào**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec && grep -c "tinh-nang-chinh\|≤ ~110 chữ\|ép chúng luôn hiện\|measure-home" docs/superpowers/specs/2026-10-27-trang-chu-ba-viec-tab-design.md`
Expected: `4` hoặc nhiều hơn (mỗi mẫu xuất hiện trong dòng của nó; không được là `0`).

- [ ] **Step 3: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec && git branch --show-current && git add docs/superpowers/specs/2026-10-27-trang-chu-ba-viec-tab-design.md && git commit -q -m "$(cat <<'EOF'
docs(website): chỉnh spec trang chủ theo số đo chữ thật

Mục tiêu chữ sửa thành khoảng 1.700 chữ trong HTML và 1.100 chữ nhìn thấy ngay (ước lượng
1.200-1.300 ban đầu tính nhẩm sai); id phần, ngân sách câu Hỏi đáp và cách xử lý .reveal
trong panel ghi cho khớp với kế hoạch.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1 | cat
```

---

### Task 2: Thành phần `featureTabs`

**Files:**
- Modify: `website/src/build/components.mjs` (thêm trước dòng `/** Chip phím: keys(["⌃","⌥","T"]) */`)
- Test: `website/test/i18n.test.mjs` (dòng import, và thêm test trước test `WEBSITE_PREVIEW_LANGS…`)

- [ ] **Step 1: Viết test đơn vị (đỏ)**

Trong `website/test/i18n.test.mjs`, sửa dòng import:
- old: `import { plansGrid, dataFlow, demoVideo, demoVideoPair } from "../src/build/components.mjs";`
- new: `import { plansGrid, dataFlow, demoVideo, demoVideoPair, featureTabs } from "../src/build/components.mjs";`

Rồi thêm test sau, đặt ngay **trước** dòng `test("WEBSITE_PREVIEW_LANGS thêm ngôn ngữ đang dịch khi dựng cục bộ; lệnh deploy bỏ qua; mã lạ thì báo lỗi", () => {`:

```js
test("featureTabs: thanh tab ẩn sẵn (trong llm-skip), mỗi panel có id, h3, câu dẫn, gạch đầu dòng, nút và hình; không panel nào ẩn sẵn", () => {
  const tab = (id, n) => ({ id, icon: "captions", label: `L${n}`, title: `T${n}`, lead: `Lead${n}`, bullets: [`B${n}a`, `B${n}b`], cta: { href: `/x${n}/`, label: `Go${n}` }, media: `<i>M${n}</i>` });
  const html = featureTabs({ listLabel: 'Chọn "một"', tabs: [tab("a-1", 1), tab("b-2", 2), tab("c-3", 3)] });
  assert.match(html, /^<div class="ftabs" data-ftabs>\n<!--llm-skip--><div class="ftabs-list" role="tablist" aria-label="Chọn &quot;một&quot;" hidden>/);
  assert.match(html, /<\/div><!--\/llm-skip-->/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.match(html, /<button class="ftab" type="button" role="tab" id="tab-b-2" aria-controls="b-2" aria-selected="false" tabindex="-1"><svg[^>]*><use href="#i-captions"\/><\/svg><span>L2<\/span><\/button>/);
  const panels = html.split('<div class="ftabs-panel"').slice(1);
  assert.equal(panels.length, 3);
  assert.match(panels[1], /^ id="b-2" role="tabpanel" aria-labelledby="tab-b-2">/);
  assert.match(panels[1], /<h3>T2<\/h3>\n<p class="lead">Lead2<\/p>\n<ul class="check-list"><li>B2a<\/li><li>B2b<\/li><\/ul>\n<p><a class="btn btn-secondary" href="\/x2\/">Go2 <svg/);
  assert.match(panels[1], /<i>M2<\/i>/);
  assert.ok(!/ftabs-panel[^>]*\bhidden\b/.test(html), "không panel nào được ẩn sẵn: tắt JS thì cả ba phải hiện");
  assert.ok(!html.includes("reveal"), "khối tab không tự thêm lớp .reveal");
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node --test test/i18n.test.mjs 2>&1 | grep -E "featureTabs|not ok|# (pass|fail)" | head`
Expected: test `featureTabs` FAIL với lỗi dạng `featureTabs is not a function` (hoặc `does not provide an export named 'featureTabs'` làm cả file lỗi).

- [ ] **Step 3: Viết thành phần**

Trong `website/src/build/components.mjs`, thêm khối sau **trước** dòng `/** Chip phím: keys(["⌃","⌥","T"]) */`:

```js
/**
 * Khối tab "Tính năng chính" của trang chủ (spec 2026-10-27-trang-chu-ba-viec-tab). Không JS: thanh tab ẩn, mọi panel hiện nối nhau,
 * mỗi panel có `<h3>` của nó. Có JS (site.js, initFeatureTabs): thanh tab hiện, panel không chọn có `hidden`, hỗ trợ #hash, bàn phím,
 * và chuyển tab thì tạm dừng video của panel vừa rời. Panel không mang lớp `.reveal` (ảnh và video bên trong thì có sẵn; CSS ép
 * chúng luôn hiện vì panel ẩn không bao giờ vào IntersectionObserver). Thanh tab nằm trong `llm-skip`: nhãn tab không vào llms-full*.txt.
 * tabs: [{ id (neo của panel), icon, label, title, lead, bullets (HTML[]), cta: { href, label }, media (HTML) }]. `label`, `title`,
 * `lead`, `cta.label` là HTML (người viết tự dùng `&amp;`); `listLabel` là chữ thuần cho aria-label của thanh tab.
 */
export const featureTabs = ({ listLabel, tabs }) => `<div class="ftabs" data-ftabs>
<!--llm-skip--><div class="ftabs-list" role="tablist" aria-label="${esc(listLabel)}" hidden>
${tabs
  .map(
    (t) => `<button class="ftab" type="button" role="tab" id="tab-${t.id}" aria-controls="${t.id}" aria-selected="false" tabindex="-1">${icon(t.icon)}<span>${t.label}</span></button>`,
  )
  .join("\n")}
</div><!--/llm-skip-->
${tabs
  .map(
    (t) => `<div class="ftabs-panel" id="${t.id}" role="tabpanel" aria-labelledby="tab-${t.id}">
<div class="split wide-right">
<div class="stack-lg">
<h3>${t.title}</h3>
<p class="lead">${t.lead}</p>
${checkList(t.bullets)}
<p><a class="btn btn-secondary" href="${t.cta.href}">${t.cta.label} ${icon("arrow-right")}</a></p>
</div>
<div>
${t.media}
</div>
</div>
</div>`,
  )
  .join("\n")}
</div>`;

```

- [ ] **Step 4: Chạy lại để thấy xanh**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node --test test/i18n.test.mjs 2>&1 | grep -E "featureTabs|not ok|# (pass|fail)"`
Expected: test `featureTabs` ✔, `# fail 0`.

- [ ] **Step 5: Chạy cả bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node --test "test/*.test.mjs" 2>&1 | tail -8`
Expected: `# fail 0`; `# tests` hơn số nền đúng 1.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec && git branch --show-current && git add website/src/build/components.mjs website/test/i18n.test.mjs && git commit -q -m "$(cat <<'EOF'
feat(website): thành phần featureTabs cho khối tab của trang chủ

Dựng thanh tab (ẩn sẵn) và các panel có h3, câu dẫn, gạch đầu dòng, nút và hình. Chưa trang
nào dùng; phần nâng cấp bằng JS và CSS ở commit sau.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1 | cat
```

---

### Task 3: CSS và JS cho khối tab và mục gập

**Files:**
- Modify: `website/src/assets/site.css` (thêm trước dòng `/* Mục tiêu chạm đủ lớn trên điện thoại (WCAG 2.2 AA, khuyến nghị 44px) */`)
- Modify: `website/src/assets/site.js` (thêm trước dòng `  // Video demo (spec 2026-10-22-website-ja-zh-ko §4): nút phát lớn giữa khung`)

- [ ] **Step 1: Thêm CSS**

Dùng Edit trên `website/src/assets/site.css`:
- old: `/* Mục tiêu chạm đủ lớn trên điện thoại (WCAG 2.2 AA, khuyến nghị 44px) */`
- new (toàn bộ khối dưới đây, rồi một dòng trống, rồi đúng dòng comment cũ):

```css
/* ---------- Trang chủ: khối tab "Tính năng chính" (spec 2026-10-27-trang-chu-ba-viec-tab) ----------
   Không JS: thanh tab ẩn, ba panel xếp dọc. Có JS (site.js, initFeatureTabs): thanh tab hiện, panel không chọn có `hidden`. */
.ftabs { scroll-margin-top: calc(var(--header-h) + 16px); }
.ftabs-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; max-width: 720px; margin: 0 auto clamp(28px, 4vw, 44px); padding: 6px; background: var(--bg-alt); border: 1px solid var(--line); border-radius: calc(var(--r-lg) + 6px); }
.ftabs-list[hidden] { display: none; }
/* Có JS nhưng script chưa chạy: giữ chỗ cho thanh tab (không hiện) và chỉ hiện panel đầu, để lúc nâng cấp không đẩy trang (CLS). */
.js .ftabs:not(.is-enhanced) .ftabs-list[hidden] { display: grid; visibility: hidden; }
.js .ftabs:not(.is-enhanced) .ftabs-panel + .ftabs-panel { display: none; }
.ftab { display: flex; align-items: center; justify-content: center; gap: 10px; min-width: 0; padding: 13px 14px; border: 1px solid transparent; border-radius: var(--r-lg); background: transparent; color: var(--ink-3); font: inherit; font-weight: 600; font-size: 1.02rem; line-height: 1.25; text-align: center; cursor: pointer; transition: background .2s var(--ease), color .2s, box-shadow .2s, border-color .2s; }
.ftab .icon { flex: none; width: 22px; height: 22px; }
.ftab:hover { color: var(--ink); background: color-mix(in srgb, var(--surface) 60%, transparent); }
.ftab[aria-selected="true"] { background: var(--surface); color: var(--ink); border-color: var(--line-strong); box-shadow: var(--shadow-md); }
.ftab[aria-selected="true"] .icon { color: var(--brand); }
.ftab:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; }
.ftabs-panel[hidden] { display: none; }
.ftabs-panel + .ftabs-panel { margin-top: clamp(40px, 6vw, 72px); }
.ftabs.is-enhanced .ftabs-panel { margin-top: 0; animation: panel-in .28s var(--ease); }
/* Ảnh và video trong panel mang lớp .reveal: panel ẩn không bao giờ vào IntersectionObserver, nên ép chúng luôn hiện. */
.js .ftabs-panel .reveal { opacity: 1; transform: none; transition: none; }
.ftabs-panel .split { gap: clamp(24px, 4vw, 56px); }
.ftabs-panel h3 { margin: 0; font-size: clamp(1.35rem, 1.05rem + 1vw, 1.8rem); }
@media (max-width: 700px) {
  .ftab { flex-direction: column; gap: 6px; padding: 10px 6px; font-size: .92rem; }
}

/* Mục "Máy chủ lưu những gì?" gập sẵn trong khối tối của phần Dữ liệu (trang chủ). */
.more-details { max-width: 820px; margin: clamp(24px, 3vw, 36px) auto 0; border: 1px solid rgba(255, 255, 255, .16); border-radius: var(--r-md); background: rgba(255, 255, 255, .04); }
.more-details summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; cursor: pointer; list-style: none; font-weight: 600; color: #fff; }
.more-details summary::-webkit-details-marker { display: none; }
.more-details summary::after { content: ""; flex: none; width: .55em; height: .55em; margin-top: -.2em; border-right: 2px solid #8fc0ff; border-bottom: 2px solid #8fc0ff; transform: rotate(45deg); transition: transform .2s var(--ease); }
.more-details[open] summary::after { margin-top: .2em; transform: rotate(-135deg); }
.more-details summary:focus-visible { outline: 3px solid #8fc0ff; outline-offset: 2px; border-radius: var(--r-md); }
.more-details p { margin: 0; padding: 0 20px 18px; color: #adbcd9; }

/* Mục tiêu chạm đủ lớn trên điện thoại (WCAG 2.2 AA, khuyến nghị 44px) */
```

- [ ] **Step 2: Thêm JS**

Dùng Edit trên `website/src/assets/site.js`:
- old: `  // Video demo (spec 2026-10-22-website-ja-zh-ko §4): nút phát lớn giữa khung thay thanh điều khiển gốc cho tới khi bấm. Trên máy`
- new (khối dưới, rồi một dòng trống, rồi đúng dòng comment cũ):

```js
  // Khối tab "Tính năng chính" ở trang chủ (spec 2026-10-27-trang-chu-ba-viec-tab): tab đầu mở sẵn; neo # mở đúng tab; mũi tên,
  // Home, End đổi tab; chuyển tab thì tạm dừng video của panel vừa rời. Tắt JS: thanh tab ẩn, ba panel hiện nối nhau.
  document.querySelectorAll("[data-ftabs]").forEach((root) => {
    const list = root.querySelector('[role="tablist"]');
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
    if (!list || tabs.length === 0 || panels.some((p) => !p)) return;
    const hashId = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return ""; } };
    const byHash = () => tabs.find((t) => t.getAttribute("aria-controls") === hashId());
    const select = (tab, { focus = false, hash = false } = {}) => {
      root.classList.add("is-enhanced");
      list.hidden = false;
      tabs.forEach((t, i) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        if (!on) panels[i].querySelectorAll("video").forEach((v) => v.pause());
        panels[i].hidden = !on;
      });
      if (focus) tab.focus();
      if (hash) history.replaceState(null, "", "#" + tab.getAttribute("aria-controls"));
    };
    // Lúc trình duyệt xử lý neo, panel đích còn ẩn nên nó không tự cuộn tới: cuộn tới khối tab sau khi đã mở đúng tab.
    const toRoot = () => requestAnimationFrame(() => root.scrollIntoView({ block: "start" }));
    const first = byHash();
    select(first ?? tabs[0]);
    if (first) toRoot();
    tabs.forEach((t) => t.addEventListener("click", () => select(t, { hash: true })));
    list.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: (i + 1) % tabs.length, ArrowDown: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, ArrowUp: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[next], { focus: true, hash: true });
    });
    window.addEventListener("hashchange", () => { const t = byHash(); if (t) { select(t); toRoot(); } });
  });

  // Video demo (spec 2026-10-22-website-ja-zh-ko §4): nút phát lớn giữa khung thay thanh điều khiển gốc cho tới khi bấm. Trên máy
```

- [ ] **Step 3: Kiểm cú pháp JS và chạy cả bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node --check src/assets/site.js && echo "JS ok" && node --test "test/*.test.mjs" 2>&1 | tail -8`
Expected: `JS ok`, `# fail 0` (CSS và JS mới chưa trang nào dùng nên không đổi kết quả nào khác). Nếu có test nào về kích thước hay nội dung CSS/JS báo đỏ, đọc thông báo và chỉnh khối vừa thêm cho khớp luật đó (không nới luật).

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec && git branch --show-current && git add website/src/assets/site.css website/src/assets/site.js && git commit -q -m "$(cat <<'EOF'
feat(website): CSS và JS cho khối tab và mục gập của trang chủ

initFeatureTabs theo khuôn tab của trang Tải xuống: tab đầu mở sẵn, neo # mở đúng tab,
mũi tên/Home/End, chuyển tab thì tạm dừng video. CSS ép ảnh và video trong panel luôn hiện
(panel ẩn không vào IntersectionObserver) và giữ chỗ để lúc nâng cấp không đẩy trang.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1 | cat
```

---

### Task 4: Chuyển trang chủ sang khối tab (năm ngôn ngữ) và sửa test video

Năm `home.mjs` phải đổi **cùng một commit**: `i18n-content.test.mjs` so khung ja/zh/ko với en, nên không có trạng thái xanh nào ở giữa. Làm lần lượt vi → en → ja → zh → ko rồi mới chạy test.

**Files:**
- Create: `website/test/feature-tabs.test.mjs`
- Rewrite: `website/test/video-facade.test.mjs`
- Rewrite: `website/src/content/vi/home.mjs`, `en/home.mjs`, `ja/home.mjs`, `zh/home.mjs`, `ko/home.mjs`

- [ ] **Step 1: Viết test trình duyệt cho khối tab (sẽ đỏ)**

Create `website/test/feature-tabs.test.mjs`:

```js
// Kiểm khối tab "Tính năng chính" của trang chủ (spec 2026-10-27-trang-chu-ba-viec-tab-design) bằng Chrome không đầu, qua tools/browser/cdp.mjs.
//   node --test test/feature-tabs.test.mjs        (không có Chrome: bỏ qua; đặt CHROME=<đường dẫn> nếu Chrome ở chỗ khác)
// Dựng website vào một thư mục tạm riêng (WEBSITE_DIST) để không đụng bài test dựng chung dist/. Việc video tạm dừng khi chuyển tab
// nằm ở test/video-facade.test.mjs (cần bấm phát thật).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, launch } from "../tools/browser/cdp.mjs";

const skip = findChrome() ? false : "cần Google Chrome (hoặc biến CHROME)";
const DIST = mkdtempSync(join(tmpdir(), "ftabs-dist-"));
process.env.WEBSITE_DIST = DIST;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let browser;
let base;

before(async () => {
  if (skip) return;
  const { build } = await import("../src/build/build.mjs");
  await build();
  const { start } = await import("../src/serve.mjs");
  server = await start(0);
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await launch();
});

after(async () => {
  await browser?.close();
  server?.close();
  rmSync(DIST, { recursive: true, force: true });
});

const EN_IDS = ["meeting-translation", "type-and-translate", "history"];
const PAGES = [
  { lang: "vi", path: "/", ids: ["dich-cuoc-hop", "go-dich", "lich-su"], tabs: ["Dịch họp", "Gõ dịch", "Lịch sử"] },
  { lang: "en", path: "/en/", ids: EN_IDS, tabs: ["Meetings", "Type & Translate", "History"] },
  { lang: "ja", path: "/ja/", ids: EN_IDS, tabs: ["会議の翻訳", "入力翻訳", "履歴"] },
  { lang: "zh", path: "/zh/", ids: EN_IDS, tabs: ["会议翻译", "输入翻译", "历史记录"] },
  { lang: "ko", path: "/ko/", ids: EN_IDS, tabs: ["회의 번역", "입력 번역", "기록"] },
];

const state = (p) =>
  p.eval(`(() => {
    const tabs = [...document.querySelectorAll('[data-ftabs] [role="tab"]')];
    const panels = [...document.querySelectorAll('[data-ftabs] [role="tabpanel"]')];
    return {
      labels: tabs.map((t) => t.textContent.trim()),
      selected: tabs.filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.getAttribute("aria-controls")),
      visible: panels.filter((el) => getComputedStyle(el).display !== "none").map((el) => el.id),
      tabindex: tabs.map((t) => t.tabIndex),
      list: getComputedStyle(document.querySelector('[data-ftabs] [role="tablist"]')).display,
    };
  })()`);

for (const page of PAGES) {
  test(`${page.lang}: ba tab đủ nhãn; tab đầu mở sẵn, chỉ panel đầu hiện, chỉ tab đang chọn nằm trong thứ tự Tab`, { skip }, async () => {
    const p = await browser.newPage({ width: 1280, height: 900 });
    await p.goto(base + page.path);
    const s = await state(p);
    assert.deepEqual(s.labels, page.tabs);
    assert.deepEqual(s.selected, [page.ids[0]]);
    assert.deepEqual(s.visible, [page.ids[0]]);
    assert.deepEqual(s.tabindex, [0, -1, -1]);
    assert.notEqual(s.list, "none", "thanh tab phải hiện khi có JS");
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  test(`${page.lang}: bấm tab đổi panel và URL; ảnh, video trong panel vừa mở hiện rõ (không kẹt opacity 0)`, { skip }, async () => {
    const p = await browser.newPage({ width: 1280, height: 900 });
    await p.goto(base + page.path);
    for (const id of [page.ids[1], page.ids[2], page.ids[0]]) {
      await p.click(`[role="tab"][aria-controls="${id}"]`);
      const s = await state(p);
      assert.deepEqual(s.visible, [id]);
      assert.deepEqual(s.selected, [id]);
      assert.equal(await p.eval("location.hash"), `#${id}`);
      await sleep(400);
      const opacity = await p.eval(`[...document.querySelectorAll("#${id} .reveal")].map((e) => getComputedStyle(e).opacity)`);
      assert.ok(opacity.length > 0 && opacity.every((o) => o === "1"), `${page.lang} ${id}: opacity ${opacity}`);
    }
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  test(`${page.lang}: neo # mở đúng tab ngay khi vào trang, và đổi neo thì đổi tab`, { skip }, async () => {
    for (const id of page.ids) {
      const p = await browser.newPage({ width: 1280, height: 900 });
      await p.goto(base + page.path + `#${id}`);
      const s = await state(p);
      assert.deepEqual(s.visible, [id], `${page.path}#${id}`);
      assert.deepEqual(s.selected, [id]);
      await p.close();
    }
    const p = await browser.newPage({ width: 1280, height: 900 });
    await p.goto(base + page.path);
    await p.eval(`location.hash = "#${page.ids[2]}"`);
    await sleep(200);
    assert.deepEqual((await state(p)).visible, [page.ids[2]], "đổi neo # phải đổi tab");
    await p.eval(`location.hash = "#khong-co-tab-nay"`);
    await sleep(200);
    assert.deepEqual((await state(p)).visible, [page.ids[2]], "neo lạ không được đổi tab");
    await p.close();
  });

  test(`${page.lang}: khối tab không tràn ngang ở các cỡ màn hình, ba tab, sáng và tối`, { skip }, async () => {
    for (const [w, mobile] of [[320, true], [375, true], [768, false], [1280, false]]) {
      for (const dark of [false, true]) {
        const p = await browser.newPage({ width: w, height: 800, mobile, dark });
        await p.goto(base + page.path);
        for (const id of page.ids) {
          await p.click(`[role="tab"][aria-controls="${id}"]`);
          const over = await p.eval(`(() => {
            const w = document.documentElement.clientWidth;
            const bad = [...document.querySelectorAll("[data-ftabs] *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 1; });
            return { scroll: document.documentElement.scrollWidth - w, bad: bad.slice(0, 3).map((e) => e.tagName + "." + e.className) };
          })()`);
          const where = `${page.lang} ${w}px ${dark ? "tối" : "sáng"} ${id}`;
          assert.deepEqual(over.bad, [], `${where}: phần tử vượt mép phải`);
          if (w >= 375) assert.ok(over.scroll <= 1, `${where}: trang tràn ngang ${over.scroll}px`);
        }
        assert.deepEqual(p.errors, [], `${page.lang} ${w}px`);
        await p.close();
      }
    }
  });

  test(`${page.lang}: tắt JavaScript: cả ba panel hiện nối nhau với h3, không thanh tab, video vẫn có thanh điều khiển`, { skip }, async () => {
    const p = await browser.newPage({ width: 1280, height: 900 });
    await p.setJS(false);
    await p.goto(base + page.path);
    const r = await p.eval(`(() => ({
      panels: [...document.querySelectorAll('[data-ftabs] [role="tabpanel"]')].map((e) => getComputedStyle(e).display !== "none"),
      titles: [...document.querySelectorAll('[data-ftabs] [role="tabpanel"] h3')].map((e) => getComputedStyle(e).display !== "none"),
      list: getComputedStyle(document.querySelector('[data-ftabs] [role="tablist"]')).display,
      videos: [...document.querySelectorAll("[data-ftabs] video")].map((v) => v.controls),
    }))()`);
    assert.deepEqual(r.panels, [true, true, true]);
    assert.deepEqual(r.titles, [true, true, true]);
    assert.equal(r.list, "none");
    assert.deepEqual(r.videos, [true, true]);
    await p.close();
  });
}

for (const page of PAGES.slice(0, 2)) {
  test(`${page.lang}: bàn phím: mũi tên, Home, End đổi tab (quay vòng), tiêu điểm đi theo tab`, { skip }, async () => {
    const p = await browser.newPage({ width: 1280, height: 900 });
    await p.goto(base + page.path);
    await p.focus('[data-ftabs] [role="tab"][aria-selected="true"]');
    const focused = () => p.eval(`document.activeElement.getAttribute("aria-controls")`);
    await p.press("ArrowRight");
    assert.deepEqual((await state(p)).selected, [page.ids[1]]);
    assert.equal(await focused(), page.ids[1], "tiêu điểm đi theo tab");
    assert.deepEqual((await state(p)).tabindex, [-1, 0, -1]);
    await p.press("End");
    assert.deepEqual((await state(p)).selected, [page.ids[2]]);
    await p.press("ArrowRight");
    assert.deepEqual((await state(p)).selected, [page.ids[0]], "quay vòng về tab đầu");
    await p.press("ArrowLeft");
    assert.deepEqual((await state(p)).selected, [page.ids[2]], "quay vòng về tab cuối");
    await p.press("Home");
    assert.deepEqual((await state(p)).selected, [page.ids[0]]);
    await p.close();
  });
}
```

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node --test test/feature-tabs.test.mjs 2>&1 | grep -E "^# (tests|pass|fail|skipped)"`
Expected: `# fail` > 0 (trang chủ chưa có `[data-ftabs]`: các test báo lỗi kiểu `Cannot read properties of null` hoặc `không thấy [role="tab"]…`) và `# skipped 0`.

- [ ] **Step 2: Viết lại `website/src/content/vi/home.mjs`**

Dùng Write (nếu file chưa được Read trong phiên thì Read nó trước). Toàn bộ nội dung mới:

```js
import { dataFlow, demo, demoVideo, feature, featureTabs, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_ITEMS = [
  { kind: "meeting", text: `Một cuộc họp trực tuyến có phụ đề tiếng Việt dịch từ tiếng Anh. Video ${videoMeta("vi", "meeting").seconds} giây, có tiếng.`, label: "Video demo AI Translator: dịch cuộc họp trực tiếp", fallback: "Tải video (MP4, 1 MB)" },
  { kind: "typing", text: `Gõ dịch chuyển câu trả lời tiếng Việt thành tiếng Anh để gửi tin nhắn. Video ${videoMeta("vi", "typing").seconds} giây, có tiếng.`, label: "Video demo AI Translator: Gõ dịch", fallback: "Tải video (MP4, 1 MB)" },
];
const [MEETING_VIDEO, TYPING_VIDEO] = VIDEO_ITEMS;

export const HOME_FAQ = [
  {
    q: "Dùng được với Zoom, Teams, Google Meet, Zalo không?",
    a: `<p>Được, không cần bot hay plugin: app thu âm thanh hệ thống của máy tính nên không phụ thuộc ứng dụng họp. Chúng tôi đã thử thu âm thanh trên macOS với Zoom, Google Meet, Microsoft Teams và Zalo PC (thử nghiệm nội bộ, không phải chứng nhận của các bên đó). Người cùng họp không được thông báo, nên nếu quy định yêu cầu thì bạn tự báo họ.</p>`,
  },
  {
    q: "AI Translator có cần internet không?",
    a: `<p>Khi đang dịch thì không. Nhận dạng giọng nói, dịch và hiện phụ đề đều chạy trên máy bạn. Internet chỉ cần cho vài việc: tải app và model lần đầu (khoảng 1,3 GB hoặc 2,5 GB), đăng ký dùng thử Free, mua gói, kiểm tra bản quyền (gói trả phí dùng offline tối đa 14 ngày giữa hai lần kiểm tra) và cập nhật app.</p>`,
  },
  {
    q: "Âm thanh cuộc họp của tôi có bị gửi đi đâu không?",
    a: `<p>Không. Âm thanh chỉ nằm trong bộ nhớ RAM trong lúc dịch, không ghi xuống đĩa và không gửi qua mạng. Chúng tôi đã kiểm tra bằng proxy trên macOS: trong lúc dịch, app không gửi dữ liệu âm thanh hay chữ chép lời ra ngoài.</p>`,
  },
  {
    q: "Dịch livestream ra tiếng Việt được không?",
    a: `<p>Trên máy tính thì được: app nghe âm thanh đang phát ra từ máy nên không phụ thuộc trang web. Chúng tôi đã thử một lần với YouTube Live (một kênh tin tức tiếng Anh, Chrome trên macOS, 25/10/2026): phụ đề tiếng Việt hiện suốt buổi thử. Với TikTok LIVE, chúng tôi chỉ có kết quả của một buổi live tiếng Việt có nhạc nền: app thu được tiếng, nhưng nhận nhầm ngôn ngữ và lặp lại câu không ai nói nên phụ đề không dùng được. Chúng tôi chưa thử Facebook Live. App không có bản cho điện thoại và không đưa phụ đề vào buổi live của chính bạn cho khán giả của bạn. Xem <a href="/giai-phap/dich-livestream/">dịch livestream ra tiếng Việt</a>.</p>`,
  },
  {
    q: "Có cách dịch phụ đề họp sang tiếng Việt miễn phí không?",
    a: `<p>AI Translator có gói Free dùng thử 10 ngày, tối đa 30 phút dịch mỗi ngày, không cần thẻ hay tài khoản. Đó là dùng thử, không phải miễn phí vĩnh viễn; sau đó cần gói trả trước: Monthly 50.000 ₫, 6 Months 269.000 ₫ hoặc Yearly 500.000 ₫.</p>`,
  },
  {
    q: "Tôi ở ngoài Việt Nam có mua được không?",
    a: `<p>Được. Ngoài chuyển khoản VietQR bằng VND (từ ngân hàng Việt Nam), màn hình Nâng cấp trong app cho trả bằng thẻ quốc tế, tính bằng USD, qua trang thanh toán của Creem: Monthly 3,99 USD, 6 Months 21,99 USD, Yearly 39,99 USD, chưa gồm thuế. Thẻ không nhận được ở một số nước, theo danh sách của Creem. Gói Free dùng thử không cần phương thức thanh toán.</p>`,
  },
];

export default {
  id: "home",
  lang: "vi",
  path: "/",
  title: "Dịch livestream và họp bằng phụ đề AI, chạy offline | AI Translator",
  description:
    "Phụ đề tiếng Việt dịch trực tiếp cho livestream, video và họp Zoom, Teams, Meet, Zalo: từ tiếng Anh, Trung, Nhật, Hàn. AI chạy trên máy, âm thanh không lên cloud.",
  software: true,
  modified: "2026-10-27",
  llm: "Trang chủ: AI Translator là gì, dịch cuộc họp và livestream bằng phụ đề, Gõ dịch tin nhắn, xem lại lịch sử bản chép lời, hướng dẫn sử dụng bốn bước, dữ liệu ở lại trên máy, bảng giá và câu hỏi thường gặp.",
  llmTitle: "AI Translator: trang chủ",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    ...VIDEO_ITEMS.map((v) => videoObject({ lang: "vi", kind: v.kind, name: v.label, description: v.text, uploadDate: "2026-10-26" })),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS (Apple Silicon) · Windows 10/11 · Dùng thử Free 10 ngày</p>
<h1 class="reveal">Phụ đề dịch <em>bằng&nbsp;AI</em> cho mọi cuộc họp, chạy ngay trên máy bạn</h1>
<p class="lead reveal"><strong>AI Translator</strong> là app desktop dịch âm thanh đang phát trên máy thành phụ đề nổi trên màn hình, và dịch tin nhắn bạn gõ sang tiếng của người bên kia. AI chạy ngay trên máy, nên âm thanh và nội dung cuộc họp không lên cloud. Dùng với Zoom, Microsoft Teams, Google Meet, Zalo PC, webinar, video hay livestream xem trên máy tính.</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/tai-xuong/">Tải xuống ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#cach-dung">Xem cách dùng</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI chạy 100% trên máy</li>
<li>${icon("check")} Dữ liệu cuộc họp không lên cloud</li>
<li>${icon("check")} Không bot, không tài khoản</li>
</ul>
</div>
<div class="reveal">
${demo({
  title: "Cuộc họp nhóm (minh họa)",
  rec: "Đang dịch",
  langs: "EN → VI",
  note: "Minh họa: cuộc họp trực tuyến với thanh phụ đề dịch nổi ở phía dưới màn hình",
  names: ["Sarah", "Minh", "David", "Lan"],
  pairs: [
    { src: "We should ship the pilot to two customers first.", dst: "Chúng ta nên đưa bản thử nghiệm cho hai khách hàng trước." },
    { src: "Can you share the budget estimate by Friday?", dst: "Bạn có thể gửi bản dự toán ngân sách trước thứ Sáu không?" },
    { src: "Let's review the timeline in the next meeting.", dst: "Hãy xem lại tiến độ trong cuộc họp tiếp theo." },
  ],
  floatA: { icon: "wifi-off", text: "Chạy offline" },
  floatB: { icon: "lock", text: "Âm thanh ở lại trên máy" },
})}
</div>
</div></section>

<section class="section" id="tinh-nang-chinh"><div class="container">
${sectionHead({ eyebrow: "Tính năng chính", title: "Dịch họp, Gõ dịch, xem lại lịch sử", center: true })}
${featureTabs({
  listLabel: "Chọn tính năng",
  tabs: [
    {
      id: "dich-cuoc-hop",
      icon: "captions",
      label: "Dịch họp",
      title: "Nghe họp bằng ngoại ngữ, đọc phụ đề bằng tiếng của bạn",
      lead: "App nghe âm thanh đang phát trên máy và hiện bản dịch trên thanh phụ đề nổi. Không bot nào vào phòng họp.",
      bullets: [
        "Năm ngôn ngữ, dịch qua lại mọi chiều: Anh, Trung, Nhật, Hàn, Việt; tự nhận diện ngôn ngữ đang nói",
        `Phụ đề hiện sau khi người nói dừng câu: trung vị dưới 1,1 giây trên Mac M4 Pro (gói model Chuẩn), máy khác có thể chậm hơn (<a href="/tinh-nang/#hieu-nang">điều kiện đo</a>)`,
        `Dùng với Zoom, Teams, Meet, Zalo; họp tại chỗ qua nguồn <strong>Micro</strong> (<a href="/tinh-nang/#micro">cách dùng</a>); livestream xem trên máy tính (<a href="/giai-phap/dich-livestream/">dịch livestream</a>)`,
      ],
      cta: { href: "/tinh-nang/", label: "Xem tất cả tính năng" },
      media: demoVideo({ lang: "vi", kind: MEETING_VIDEO.kind, label: MEETING_VIDEO.label, fallback: MEETING_VIDEO.fallback }),
    },
    {
      id: "go-dich",
      icon: "keyboard",
      label: "Gõ dịch",
      title: "Trả lời bằng tiếng của người bên kia",
      lead: "Bấm ⌃⌥G (Windows: Ctrl+Alt+G) ở ô chat đang dùng, gõ bằng tiếng của bạn rồi bấm Enter: bản dịch được dán vào ô chat để bạn xem lại và gửi.",
      bullets: [
        "Dán vào ô bạn đang gõ, ở app nhận được lệnh dán (⌘V, Ctrl+V)",
        "Dịch trên máy bạn: chữ bạn gõ không rời máy",
        "Có ở mọi gói, không trừ thời lượng dịch",
      ],
      cta: { href: "/huong-dan/go-dich/", label: "Xem hướng dẫn Gõ dịch" },
      media: demoVideo({ lang: "vi", kind: TYPING_VIDEO.kind, label: TYPING_VIDEO.label, fallback: TYPING_VIDEO.fallback }),
    },
    {
      id: "lich-su",
      icon: "history",
      label: "Lịch sử",
      title: "Xem lại cuộc họp sau khi kết thúc",
      lead: "Mỗi phiên dịch có bản chép lời gồm giờ, câu gốc và bản dịch của từng câu.",
      bullets: [
        "Mọi gói: xem, tìm và sao chép bản chép lời của phiên gần nhất",
        "Tính năng Pro: lưu lịch sử các phiên, mở lại phiên cũ, xuất TXT, SRT hoặc Markdown",
        "Lưu lịch sử mặc định tắt; khi bật, dữ liệu được mã hóa và chỉ nằm trên máy bạn",
      ],
      cta: { href: "/huong-dan/lich-su-va-xuat-file/", label: "Xem hướng dẫn Lịch sử" },
      media: appShot({ slug: "app-history", lang: "vi", alt: "Màn hình Lịch sử: danh sách các phiên đã lưu với ngày giờ, số phút, số câu, đoạn xem trước và nút Mở, Xóa", caption: "Lịch sử: các phiên đã lưu trên máy bạn." }),
    },
  ],
})}
</div></section>

<section class="section section-alt" id="cach-dung"><div class="container">
${sectionHead({ eyebrow: "Hướng dẫn sử dụng", title: "Bắt đầu dùng trong bốn bước", text: "Cài và thiết lập một lần, sau đó mỗi cuộc họp chỉ cần bấm Bắt đầu.", center: true })}
<div class="split wide-left">
${steps([
  { title: "Cài bằng một dòng lệnh", text: `Dán lệnh ở trang <a href="/tai-xuong/">Tải xuống</a> vào Terminal (macOS) hoặc PowerShell (Windows).` },
  { title: "Thiết lập lần đầu", text: "Chọn ngôn ngữ, tải model (khoảng 1,3 GB hoặc 2,5 GB) và cho phép ghi âm thanh hệ thống (chỉ macOS)." },
  { title: "Bấm Bắt đầu khi họp", text: "Chọn ngôn ngữ ở ô <strong>Dịch sang</strong>, bấm <strong>Bắt đầu</strong> (⌃⌥T, Windows: Ctrl+Alt+T)." },
  { title: "Trả lời và xem lại", text: "Bấm ⌃⌥G (Windows: Ctrl+Alt+G) để Gõ dịch; họp xong mở <strong>Bản chép lời</strong> hoặc <strong>Lịch sử</strong>." },
], true)}
${appShot({ slug: "app-home-running", lang: "vi", alt: "Màn hình chính của AI Translator khi đang dịch: trạng thái Đang dịch, ngôn ngữ, nguồn âm thanh và số phút còn lại", caption: "Màn hình chính khi đang dịch (gói Monthly)." })}
</div>
<p class="disclaimer">Bản macOS ký ad-hoc, chưa notarize; bản Windows chưa ký mã. Cài bằng dòng lệnh thì macOS mở app thẳng và SmartScreen không hỏi; file tải bằng trình duyệt có thể bị chặn hoặc cảnh báo ở lần mở đầu. Xem hướng dẫn cài trên <a href="/huong-dan/cai-dat-macos/">macOS</a> và <a href="/huong-dan/cai-dat-windows/">Windows</a>.</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/huong-dan/bat-dau-nhanh/">Đọc hướng dẫn bắt đầu nhanh ${icon("arrow-right")}</a></p>
</div></section>

<section class="section band-dark" id="rieng-tu-tren-may"><div class="container">
${sectionHead({ eyebrow: "Dữ liệu ở lại trên máy bạn", title: "AI chạy ngay trên máy, nên cuộc họp không rời khỏi máy", center: true })}
${dataFlow("vi")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "Âm thanh không rời máy", text: "Âm thanh chỉ nằm trong RAM, không ghi đĩa, không gửi qua mạng (chúng tôi đã kiểm tra bằng proxy trên macOS). Mất mạng thì app vẫn dịch.", accent: true })}
${feature({ icon: "shield", title: "Máy chủ không có nội dung cuộc họp", text: "Máy chủ chỉ lưu dữ liệu để bán gói, kích hoạt máy và hỗ trợ bạn (chi tiết bên dưới), không có nội dung cuộc họp." })}
</div>
<details class="more-details reveal"><summary>Máy chủ lưu chính xác những gì?</summary><p>Máy chủ của chúng tôi chỉ lưu email (khi mua, hay khi bạn tự để lại trong chat hỗ trợ), đơn hàng, license, thông tin kích hoạt máy (mã băm ID máy, tên máy), mốc dùng thử Free (mã băm ID máy), nhật ký thay đổi license, báo cáo lỗi đã che dữ liệu cá nhân (giữ 30 ngày) và tin nhắn chat hỗ trợ khi bạn dùng chat (giữ 90 ngày), không có nội dung cuộc họp.</p></details>
<p class="center-text reveal"><a class="btn btn-secondary" href="/bao-mat-du-lieu/">Xem chính xác dữ liệu nào đi đâu ${icon("arrow-right")}</a></p>
</div></section>

<section class="section" id="gia"><div class="container">
${sectionHead({ eyebrow: "Bảng giá", title: "Bốn gói đơn giản, trả trước bằng VietQR hoặc thẻ quốc tế", text: "Không tự động gia hạn, không thanh toán định kỳ, không tự động trừ tiền.", center: true })}
${plansGrid("vi", { ctaLabel: "Tải xuống", freeLabel: "Cài và dùng thử miễn phí" })}
<p class="disclaimer">Giá VND trả bằng VietQR từ ngân hàng Việt Nam; giá USD trả bằng thẻ quốc tế, chưa gồm thuế (nếu có).</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/bang-gia/">So sánh chi tiết các gói ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Câu hỏi thường gặp", title: "Những điều bạn có thể muốn biết trước" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/cau-hoi-thuong-gap/">Xem tất cả câu hỏi ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "Thử trên cuộc họp tiếp theo của bạn", text: "Cài bằng một dòng lệnh (Terminal trên Mac, PowerShell trên Windows), dùng thử miễn phí 10 ngày, không cần thẻ.", primary: { href: "/tai-xuong/", label: "Tải xuống" }, secondary: { href: "/huong-dan/bat-dau-nhanh/", label: "Xem hướng dẫn" } })}
`,
};
```

- [ ] **Step 3: Viết lại `website/src/content/en/home.mjs`**

Toàn bộ nội dung mới (mọi đoạn `${…}` và HTML trong body dùng đúng dấu như bản vi):

```js
import { dataFlow, demo, demoVideo, feature, featureTabs, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_ITEMS = [
  { kind: "meeting", text: `A video meeting where a colleague speaks Vietnamese and English subtitles appear. ${videoMeta("en", "meeting").seconds}-second video with sound.`, label: "AI Translator demo video: live meeting translation", fallback: "Download the video (MP4, 1 MB)" },
  { kind: "typing", text: `Type & Translate turns an English reply into Vietnamese for a chat message. ${videoMeta("en", "typing").seconds}-second video with sound.`, label: "AI Translator demo video: Type & Translate", fallback: "Download the video (MP4, 1 MB)" },
];
const [MEETING_VIDEO, TYPING_VIDEO] = VIDEO_ITEMS;

export const HOME_FAQ = [
  {
    q: "Does it work with Zoom, Teams, Google Meet and Zalo?",
    a: `<p>Yes, with no bot and no plugin: the app captures your computer's system audio, so it does not depend on which meeting app you use. We tested audio capture on macOS with Zoom, Google Meet, Microsoft Teams and Zalo PC (internal testing, not a certification by those companies). Other participants are not notified, so tell them yourself if your rules require it.</p>`,
  },
  {
    q: "Does AI Translator need an internet connection?",
    a: `<p>Not while it is translating. Speech recognition, translation and subtitles all run on your computer. You only need the internet to download the app and the models the first time (about 1.3 GB or 2.5 GB), to register the free trial, to buy a plan, to verify your license (paid plans work offline for up to 14 days between checks) and to update the app.</p>`,
  },
  {
    q: "Is my meeting audio sent anywhere?",
    a: `<p>No. While you translate, audio exists only in memory (RAM). It is never written to disk and never sent over the network. We checked with a network proxy on macOS: during translation, the app sent no audio and no transcript text out.</p>`,
  },
  {
    q: "Can I translate a livestream into my language?",
    a: `<p>On a computer, yes: the app listens to the audio your computer plays, so it does not depend on the website. We tested it once with YouTube Live (an English-language news channel, Chrome on macOS, 25 October 2026): Vietnamese subtitles appeared throughout the test. For TikTok Live, we only have the result of one Vietnamese livestream with background music: the app captured the sound, but it detected the wrong language and repeated sentences nobody said, so the subtitles were not usable. We have not tested Facebook Live. There is no phone version, and the app does not add subtitles to your own livestream for your audience. See <a href="/en/solutions/livestream-translation/">livestream translation</a>.</p>`,
  },
  {
    q: "Can I get translated meeting subtitles for free?",
    a: `<p>AI Translator has a free 10-day trial with up to 30 minutes of translation a day, no card and no account. It is a trial, not a permanent free plan; after that you need a prepaid plan: Monthly 50,000 ₫, 6 Months 269,000 ₫ or Yearly 500,000 ₫.</p>`,
  },
  {
    q: "Can I pay from outside Vietnam?",
    a: `<p>Yes. Besides VietQR bank transfer in VND (from a Vietnamese bank), the Upgrade screen in the app lets you pay by international card in US dollars, on the Creem payment page: Monthly $3.99, 6 Months $21.99, Yearly $39.99, excluding tax. Cards are not accepted in some countries, per Creem's list. The Free trial needs no payment method.</p>`,
  },
];

export default {
  id: "home",
  lang: "en",
  path: "/en/",
  title: "Real-time translator for meetings and livestreams | AI Translator",
  description:
    "Real-time translation for livestreams, videos and meetings: subtitles in English, Chinese, Japanese, Korean and Vietnamese. AI runs offline on your computer.",
  software: true,
  modified: "2026-10-27",
  llm: "Home page: what AI Translator is, meeting and livestream translation with subtitles, Type & Translate for chat messages, reviewing transcript history, a four-step how-to, data that stays on your computer, pricing and frequently asked questions.",
  llmTitle: "AI Translator: home",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    ...VIDEO_ITEMS.map((v) => videoObject({ lang: "en", kind: v.kind, name: v.label, description: v.text, uploadDate: "2026-10-26" })),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS (Apple Silicon) · Windows 10/11 · 10-day free trial</p>
<h1 class="reveal">AI-translated subtitles for <em>every meeting</em>, running on your computer</h1>
<p class="lead reveal"><strong>AI Translator</strong> is an AI live translator for macOS and Windows: a desktop app that turns the audio playing on your computer into floating translated subtitles in real time, and translates the messages you type into the other person's language. The AI runs on your own machine, so your audio and meeting content never go to the cloud. Use it with Zoom, Microsoft Teams, Google Meet, Zalo PC, webinars, videos or livestreams you watch on a computer.</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/en/download/">Download ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-to-use">See how to use it</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI runs 100% on your device</li>
<li>${icon("check")} Meeting data never goes to the cloud</li>
<li>${icon("check")} No bot, no account</li>
</ul>
</div>
<div class="reveal">
${demo({
  title: "Team meeting (illustration)",
  rec: "Translating",
  langs: "JA → EN",
  note: "Illustration: an online meeting with a translated subtitle bar floating at the bottom of the screen",
  names: ["Aiko", "Wei", "Maria", "Tom"],
  pairs: [
    { src: "来週までに見積書をお送りします。", dst: "We will send the quotation by next week." },
    { src: "この仕様は来月のリリースに間に合いますか。", dst: "Will this specification be ready for next month's release?" },
    { src: "次の会議でスケジュールを確認しましょう。", dst: "Let's review the schedule in the next meeting." },
  ],
  floatA: { icon: "wifi-off", text: "Runs offline" },
  floatB: { icon: "lock", text: "Audio stays on your device" },
})}
</div>
</div></section>

<section class="section" id="main-features"><div class="container">
${sectionHead({ eyebrow: "Main features", title: "Meeting translation, Type & Translate, History", center: true })}
${featureTabs({
  listLabel: "Choose a feature",
  tabs: [
    {
      id: "meeting-translation",
      icon: "captions",
      label: "Meetings",
      title: "Hear the meeting in another language, read it in yours",
      lead: "The app listens to the audio playing on your computer and shows the translation on a floating subtitle bar. No bot joins the meeting.",
      bullets: [
        "Five languages, translated between any two of them: English, Chinese, Japanese, Korean, Vietnamese; the spoken language is detected automatically",
        `Subtitles appear after the speaker finishes a sentence: a median under 1.1 seconds on a Mac M4 Pro (Standard model pack), and other computers may be slower (<a href="/en/features/#performance">test conditions</a>)`,
        `Works with Zoom, Teams, Meet and Zalo; in-person meetings through the <strong>Microphone</strong> source (<a href="/en/features/#microphone">how it works</a>); livestreams you watch on a computer (<a href="/en/solutions/livestream-translation/">livestream translation</a>)`,
      ],
      cta: { href: "/en/features/", label: "See all features" },
      media: demoVideo({ lang: "en", kind: MEETING_VIDEO.kind, label: MEETING_VIDEO.label, fallback: MEETING_VIDEO.fallback }),
    },
    {
      id: "type-and-translate",
      icon: "keyboard",
      label: "Type &amp; Translate",
      title: "Reply in the other person's language",
      lead: "Press ⌃⌥G (Windows: Ctrl+Alt+G) in the chat box you are using, type in your own language and press Enter: the translation is pasted into the chat box for you to check and send.",
      bullets: [
        "Pastes into the box you are typing in, in any app that accepts pasting (⌘V, Ctrl+V)",
        "Translated on your computer: what you type never leaves it",
        "Included in every plan, and it does not use translation time",
      ],
      cta: { href: "/en/guide/type-and-translate/", label: "Read the Type &amp; Translate guide" },
      media: demoVideo({ lang: "en", kind: TYPING_VIDEO.kind, label: TYPING_VIDEO.label, fallback: TYPING_VIDEO.fallback }),
    },
    {
      id: "history",
      icon: "history",
      label: "History",
      title: "Look back at a meeting after it ends",
      lead: "Every session has a transcript with the time, the original and the translation of each sentence.",
      bullets: [
        "Every plan: view, search and copy the transcript of your latest session",
        "Pro feature: save the history of your sessions, reopen past ones, export as TXT, SRT or Markdown",
        "Saving history is off by default; when you turn it on, it is encrypted and stays on your computer",
      ],
      cta: { href: "/en/guide/history-and-export/", label: "Read the History guide" },
      media: appShot({ slug: "app-history", lang: "en", alt: "The History screen: a list of saved sessions with date and time, minutes, sentence count, a preview and Open and Delete buttons", caption: "History: sessions saved on your computer." }),
    },
  ],
})}
</div></section>

<section class="section section-alt" id="how-to-use"><div class="container">
${sectionHead({ eyebrow: "How to use it", title: "Get started in four steps", text: "Install and set up once; after that, every meeting only takes a press of Start.", center: true })}
<div class="split wide-left">
${steps([
  { title: "Install with one command", text: `Paste the command from the <a href="/en/download/">Download page</a> into Terminal (macOS) or PowerShell (Windows).` },
  { title: "Set it up the first time", text: "Choose your language, download the models (about 1.3 GB or 2.5 GB) and allow system audio recording (macOS only)." },
  { title: "Press Start in your meeting", text: "Choose a language in <strong>Translate into</strong> and press <strong>Start</strong> (⌃⌥T, Windows: Ctrl+Alt+T)." },
  { title: "Reply and look back", text: "Press ⌃⌥G (Windows: Ctrl+Alt+G) to Type &amp; Translate; when the meeting ends, open <strong>Transcript</strong> or <strong>History</strong>." },
], true)}
${appShot({ slug: "app-home-running", lang: "en", alt: "AI Translator main screen during a session: status Translating, languages, audio source and the translation time left", caption: "The main screen during a session (Monthly plan)." })}
</div>
<p class="disclaimer">The macOS build is signed ad-hoc and not notarized; the Windows build is not code-signed yet. Installed with the command, macOS opens the app directly and SmartScreen does not ask; a file downloaded in a browser may be blocked or warned about on first launch. See the installation guides for <a href="/en/guide/install-macos/">macOS</a> and <a href="/en/guide/install-windows/">Windows</a>.</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/en/guide/quick-start/">Read the quick-start guide ${icon("arrow-right")}</a></p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "Your data stays on your computer", title: "The AI runs on your machine, so your meeting never leaves it", center: true })}
${dataFlow("en")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "Audio never leaves your computer", text: "Audio lives only in RAM: it is never written to disk and never sent over the network, which we checked with a network proxy on macOS. Subtitles keep coming even when your connection drops.", accent: true })}
${feature({ icon: "shield", title: "No meeting content on our server", text: "Our server only stores what it needs to sell plans, activate devices and support you (details below), never meeting content." })}
</div>
<details class="more-details reveal"><summary>What exactly does the server store?</summary><p>Our server only stores your email (when you buy, or when you choose to leave it in the support chat), orders, licenses, device-activation details (a hashed machine ID and device name), the Free-trial start (a hashed machine ID), a log of license changes, error reports with personal data scrubbed out (kept for 30 days) and support chat messages if you use the chat (kept for 90 days), never meeting content.</p></details>
<p class="center-text reveal"><a class="btn btn-secondary" href="/en/data-security/">See exactly where your data goes ${icon("arrow-right")}</a></p>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "Pricing", title: "Four simple plans, prepaid by VietQR or international card", text: "No auto-renewal, no recurring billing, nothing is ever charged automatically.", center: true })}
${plansGrid("en", { ctaLabel: "Download", freeLabel: "Install and try free" })}
<p class="disclaimer">VND prices are paid by VietQR from a Vietnamese bank; USD prices are paid by international card and exclude tax (if any).</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/en/pricing/">Compare the plans in detail ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "Frequently asked questions", title: "What you may want to know first" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/en/faq/">See all questions ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "Ready to understand every meeting?", text: "Install with one command (Terminal on a Mac, PowerShell on Windows) and try it free for 10 days. No card needed.", primary: { href: "/en/download/", label: "Download" }, secondary: { href: "/en/guide/quick-start/", label: "Read the quick-start guide" } })}
`,
};
```

- [ ] **Step 4: Viết lại `website/src/content/ja/home.mjs`**

```js
import { dataFlow, demo, demoVideo, feature, featureTabs, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_ITEMS = [
  { kind: "meeting", text: `英語で話す同僚の発言に日本語の字幕が表示されます。${videoMeta("ja", "meeting").seconds} 秒、音声付きの動画です。`, label: "AI Translator デモ動画：会議のリアルタイム翻訳", fallback: "動画をダウンロード（MP4、1 MB）" },
  { kind: "typing", text: `入力翻訳が日本語の返信を英語に変えてチャットで送ります。${videoMeta("ja", "typing").seconds} 秒、音声付きの動画です。`, label: "AI Translator デモ動画：入力翻訳", fallback: "動画をダウンロード（MP4、1 MB）" },
];
const [MEETING_VIDEO, TYPING_VIDEO] = VIDEO_ITEMS;

export const HOME_FAQ = [
  {
    q: "Zoom、Teams、Google Meet、Zalo で使えますか？",
    a: `<p>はい。ボットもプラグインも不要です。アプリはパソコンのシステム音声を取り込むため、どの会議アプリを使っていても関係ありません。macOS で Zoom、Google Meet、Microsoft Teams、Zalo PC の音声取り込みを確認しました（社内テストであり、各社による認定ではありません）。ほかの参加者には通知されないため、社内規則などで必要な場合はご自身で伝えてください。</p>`,
  },
  {
    q: "AI Translator の利用にインターネット接続は必要ですか？",
    a: `<p>翻訳中は必要ありません。音声認識、翻訳、字幕の表示はすべてパソコン上で行われます。インターネットが必要なのは、初回にアプリとモデル（約 1.3 GB または 2.5 GB）をダウンロードするとき、無料お試しを登録するとき、プランを購入するとき、ライセンスを確認するとき（有料プランは確認と確認のあいだ最大 14 日間オフラインで使えます）、そしてアプリを更新するときだけです。</p>`,
  },
  {
    q: "会議の音声はどこかに送信されますか？",
    a: `<p>いいえ。翻訳中、音声はメモリ（RAM）上にだけ存在し、ディスクに書き込まれることもネットワークに送られることもありません。macOS でネットワークプロキシを使って確認したところ、翻訳中にアプリが外部に送った音声や文字起こしのテキストはありませんでした。</p>`,
  },
  {
    q: "ライブ配信を自分の言語に翻訳できますか？",
    a: `<p>パソコンでならできます。アプリはパソコンで再生されている音声を聞き取るので、ウェブサイトに左右されません。YouTube Live（英語のニュースチャンネル、macOS の Chrome、2026年10月25日）で 1 回試しました。試している間ずっとベトナム語の字幕が表示されました。TikTok ライブについては、BGM が流れるベトナム語のライブ配信 1 件の結果しかありません。アプリは音声を取り込みましたが、言語を誤認識し、誰も言っていない文を繰り返したため、字幕は実用になりませんでした。Facebook Live では試していません。スマホ版はなく、ご自身のライブ配信に視聴者向けの字幕を追加することもできません。<a href="/ja/solutions/livestream-translation/">ライブ配信の翻訳</a>をご覧ください。</p>`,
  },
  {
    q: "会議の翻訳字幕を無料で使えますか？",
    a: `<p>AI Translator には 10 日間の無料お試しがあり、1 日最大 30 分まで翻訳できます。カードもアカウントも不要です。ただしお試しであり、ずっと無料で使えるプランではありません。その後は前払いのプランが必要です：Monthly 50,000 ₫、6 Months 269,000 ₫、Yearly 500,000 ₫。</p>`,
  },
  {
    q: "ベトナム国外から支払えますか？",
    a: `<p>はい。ベトナムの銀行からの VND での VietQR 銀行振込に加えて、アプリのアップグレード画面から、Creem の支払いページで国際カードを使って米ドルで支払えます：Monthly US$3.99、6 Months US$21.99、Yearly US$39.99（税抜）。Creem の一覧にある一部の国ではカードを利用できません。Free のお試しに支払い方法は不要です。</p>`,
  },
];

export default {
  id: "home",
  lang: "ja",
  path: "/ja/",
  title: "ライブ配信と会議のリアルタイム翻訳字幕 | AI Translator",
  description:
    "ライブ配信、動画、Zoom・Teams・Meet の会議にリアルタイム翻訳字幕。英語・中国語・日本語・韓国語・ベトナム語に対応。AI はパソコン上で動き、クラウドは使いません。",
  software: true,
  modified: "2026-10-27",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    ...VIDEO_ITEMS.map((v) => videoObject({ lang: "ja", kind: v.kind, name: v.label, description: v.text, uploadDate: "2026-10-26" })),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS（Apple シリコン）· Windows 10/11 · 10 日間の無料お試し</p>
<h1 class="reveal">すべての会議に <em>AI 翻訳字幕</em> を。あなたのパソコン上で動きます</h1>
<p class="lead reveal"><strong>AI Translator</strong> は、macOS と Windows 向けの、AI によるリアルタイム翻訳デスクトップアプリです。パソコンで再生されている音声をリアルタイムで画面に浮かぶ翻訳字幕に変え、入力したメッセージを相手の言語に翻訳します。AI はあなたのパソコン上で動くため、音声や会議の内容がクラウドに送られることはありません。Zoom、Microsoft Teams、Google Meet、Zalo PC、ウェビナー、動画、パソコンで見るライブ配信で使えます。</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/ja/download/">ダウンロード ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-to-use">使い方を見る</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI は 100% デバイス上で動作</li>
<li>${icon("check")} 会議のデータはクラウドに送られません</li>
<li>${icon("check")} ボットもアカウントも不要</li>
</ul>
</div>
<div class="reveal">
${demo({
  title: "チーム会議（イメージ）",
  rec: "翻訳中",
  langs: "EN → JA",
  note: "イメージ：画面下部に翻訳字幕バーが浮かんでいるオンライン会議",
  names: ["Aiko", "Wei", "Maria", "Tom"],
  pairs: [
    { src: "We will send the quotation by next week.", dst: "来週までに見積書をお送りします。" },
    { src: "Will this specification be ready for next month's release?", dst: "この仕様は来月のリリースに間に合いますか。" },
    { src: "Let's review the schedule in the next meeting.", dst: "次の会議でスケジュールを確認しましょう。" },
  ],
  floatA: { icon: "wifi-off", text: "オフラインで動作" },
  floatB: { icon: "lock", text: "音声はデバイスに残ります" },
})}
</div>
</div></section>

<section class="section" id="main-features"><div class="container">
${sectionHead({ eyebrow: "主な機能", title: "会議の翻訳、入力翻訳、履歴", center: true })}
${featureTabs({
  listLabel: "機能を選ぶ",
  tabs: [
    {
      id: "meeting-translation",
      icon: "captions",
      label: "会議の翻訳",
      title: "外国語の会議を、自分の言語の字幕で読む",
      lead: "パソコンで再生されている音声を聞き取り、翻訳をフローティング字幕バーに表示します。会議にボットは参加しません。",
      bullets: [
        "5 つの言語のうち、どの 2 つのあいだでも翻訳：英語、中国語、日本語、韓国語、ベトナム語。話されている言語は自動で検出します",
        `話し手が文を言い終えると字幕が表示されます。Mac M4 Pro（Standard モデルパック）での中央値は 1.1 秒未満で、ほかのパソコンでは遅くなることがあります（<a href="/ja/features/#performance">測定条件</a>）`,
        `Zoom、Teams、Meet、Zalo で使えます。対面の会議は入力元を<strong>マイク</strong>にします（<a href="/ja/features/#microphone">使い方</a>）。パソコンで見るライブ配信にも使えます（<a href="/ja/solutions/livestream-translation/">ライブ配信の翻訳</a>）`,
      ],
      cta: { href: "/ja/features/", label: "すべての機能を見る" },
      media: demoVideo({ lang: "ja", kind: MEETING_VIDEO.kind, label: MEETING_VIDEO.label, fallback: MEETING_VIDEO.fallback }),
    },
    {
      id: "type-and-translate",
      icon: "keyboard",
      label: "入力翻訳",
      title: "相手の言語で返信する",
      lead: "使っているチャット欄で ⌃⌥G（Windows では Ctrl+Alt+G）を押し、自分の言語で入力して Enter を押すと、翻訳がチャット欄に貼り付けられます。確認してから送信してください。",
      bullets: [
        "貼り付け（⌘V、Ctrl+V）ができるアプリなら、入力中の欄に貼り付けます",
        "翻訳はパソコン上で行われ、入力した内容が外に出ることはありません",
        "すべてのプランで使え、翻訳時間を消費しません",
      ],
      cta: { href: "/ja/guide/type-and-translate/", label: "入力翻訳のガイドを読む" },
      media: demoVideo({ lang: "ja", kind: TYPING_VIDEO.kind, label: TYPING_VIDEO.label, fallback: TYPING_VIDEO.fallback }),
    },
    {
      id: "history",
      icon: "history",
      label: "履歴",
      title: "会議が終わったあとで振り返る",
      lead: "セッションごとに、各文の時刻、原文、翻訳をまとめた文字起こしが残ります。",
      bullets: [
        "すべてのプラン：最新のセッションの文字起こしを表示、検索、コピー",
        "Pro 機能：セッションの履歴を保存し、過去のセッションを開き直して、TXT、SRT、Markdown で書き出し",
        "履歴の保存は初期設定でオフ。オンにすると暗号化され、あなたのパソコンにだけ保存されます",
      ],
      cta: { href: "/ja/guide/history-and-export/", label: "履歴のガイドを読む" },
      media: appShot({ slug: "app-history", lang: "ja", alt: "履歴画面：保存したセッションの一覧。日時、分数、文の数、プレビュー、開くボタンと削除ボタンがあります", caption: "履歴：パソコンに保存されたセッション。" }),
    },
  ],
})}
</div></section>

<section class="section section-alt" id="how-to-use"><div class="container">
${sectionHead({ eyebrow: "使い方", title: "4 つのステップで使い始める", text: "インストールと設定は一度だけ。そのあとは会議ごとに「開始」を押すだけです。", center: true })}
<div class="split wide-left">
${steps([
  { title: "コマンド 1 行でインストール", text: `<a href="/ja/download/">ダウンロードページ</a>のコマンドを、ターミナル（macOS）または PowerShell（Windows）に貼り付けます。` },
  { title: "最初の設定", text: "言語を選び、モデルをダウンロードして（約 1.3 GB または 2.5 GB）、システムオーディオの録音を許可します（macOS のみ）。" },
  { title: "会議で「開始」を押す", text: "<strong>翻訳先の言語</strong>で言語を選び、<strong>開始</strong>を押します（⌃⌥T、Windows では Ctrl+Alt+T）。" },
  { title: "返信して、振り返る", text: "⌃⌥G（Windows では Ctrl+Alt+G）で入力翻訳を使います。会議が終わったら<strong>文字起こし</strong>または<strong>履歴</strong>を開きます。" },
], true)}
${appShot({ slug: "app-home-running", lang: "ja", alt: "セッション中の AI Translator のメイン画面：翻訳中の状態、言語、音声ソース、翻訳の残り時間", caption: "セッション中のメイン画面（Monthly プラン）。" })}
</div>
<p class="disclaimer">macOS 版はアドホック署名で、公証（notarize）を受けていません。Windows 版はまだコード署名されていません。コマンドでインストールすれば、macOS ではアプリが直接開き、SmartScreen の確認も出ません。ブラウザーでダウンロードしたファイルは初回起動時にブロックや警告が出ることがあります。<a href="/ja/guide/install-macos/">macOS</a> と <a href="/ja/guide/install-windows/">Windows</a> のインストールガイドをご覧ください。</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/ja/guide/quick-start/">クイックスタートガイドを読む ${icon("arrow-right")}</a></p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "データはあなたのパソコンに残ります", title: "AI はあなたのパソコンで動き、会議の内容は外に出ません", center: true })}
${dataFlow("ja")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "音声はパソコンから出ません", text: "音声は RAM 上にだけ存在し、ディスクに書き込まれることもネットワークに送られることもありません。macOS でネットワークプロキシを使って確認しました。接続が途切れても字幕は表示され続けます。", accent: true })}
${feature({ icon: "shield", title: "サーバーに会議の内容はありません", text: "サーバーが保存するのは、プランの販売、端末の有効化、サポートに必要なデータだけで（詳細は下記）、会議の内容は保存しません。" })}
</div>
<details class="more-details reveal"><summary>サーバーは正確には何を保存しますか？</summary><p>サーバーに保存するのは、メールアドレス（購入時、またはサポートチャットにご自身で残したとき）、注文、ライセンス、デバイスの有効化情報（ハッシュ化したマシン ID とデバイス名）、Free お試しの開始（ハッシュ化したマシン ID）、ライセンス変更の記録、個人情報を除いたエラーレポート（30 日間保存）、チャットを使った場合のサポートチャットのメッセージ（90 日間保存）だけで、会議の内容は一切保存しません。</p></details>
<p class="center-text reveal"><a class="btn btn-secondary" href="/ja/data-security/">データの行き先を詳しく見る ${icon("arrow-right")}</a></p>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "料金", title: "シンプルな 4 つのプラン。VietQR または国際カードで前払い", text: "自動更新も定期請求もなく、自動で課金されることは一切ありません。", center: true })}
${plansGrid("ja", { ctaLabel: "ダウンロード", freeLabel: "インストールして無料で試す" })}
<p class="disclaimer">VND の価格はベトナムの銀行からの VietQR でのお支払い、USD の価格は国際カードでのお支払いで、税抜です（税がかかる場合）。</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/ja/pricing/">プランを詳しく比較する ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "よくある質問", title: "最初に知っておきたいこと" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/ja/faq/">すべての質問を見る ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "すべての会議を理解する準備はできましたか？", text: "コマンド 1 行でインストールし（Mac はターミナル、Windows は PowerShell）、10 日間無料でお試しください。カードは不要です。", primary: { href: "/ja/download/", label: "ダウンロード" }, secondary: { href: "/ja/guide/quick-start/", label: "クイックスタートガイドを読む" } })}
`,
};
```

- [ ] **Step 5: Viết lại `website/src/content/zh/home.mjs`**

```js
import { dataFlow, demo, demoVideo, feature, featureTabs, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_ITEMS = [
  { kind: "meeting", text: `一场在线会议中，同事说英语，屏幕上出现中文字幕。视频时长 ${videoMeta("zh", "meeting").seconds} 秒，有声音。`, label: "AI Translator 演示视频：会议实时翻译", fallback: "下载视频（MP4，1 MB）" },
  { kind: "typing", text: `输入翻译把你用中文写的回复转成英文，发到聊天里。视频时长 ${videoMeta("zh", "typing").seconds} 秒，有声音。`, label: "AI Translator 演示视频：输入翻译", fallback: "下载视频（MP4，1 MB）" },
];
const [MEETING_VIDEO, TYPING_VIDEO] = VIDEO_ITEMS;

export const HOME_FAQ = [
  {
    q: "可以用于 Zoom、Teams、Google Meet 和 Zalo 吗？",
    a: `<p>可以，无需机器人或插件：应用采集的是电脑的系统音频，所以不受你使用哪款会议应用的影响。我们在 macOS 上测试过 Zoom、Google Meet、Microsoft Teams 和 Zalo PC 的音频采集（内部测试，不是这些公司的认证）。其他参会者不会收到通知，如果你的规定要求告知，请自行告诉他们。</p>`,
  },
  {
    q: "使用 AI Translator 需要联网吗？",
    a: `<p>翻译时不需要。语音识别、翻译和字幕显示都在你的电脑上完成。只有在以下情况下需要联网：第一次下载应用和模型（约 1.3 GB 或 2.5 GB）、登记免费试用、购买套餐、验证许可证（付费套餐在两次验证之间最多可离线使用 14 天）以及更新应用。</p>`,
  },
  {
    q: "我的会议音频会被发送到别处吗？",
    a: `<p>不会。翻译时，音频只存在于内存（RAM）中，从不写入磁盘，也从不通过网络发送。我们在 macOS 上用网络代理做过检查：翻译期间，应用没有向外发送任何音频或转写文本。</p>`,
  },
  {
    q: "能把直播翻译成我的语言吗？",
    a: `<p>在电脑上可以。应用收听的是电脑播放的音频，所以不依赖网站。我们在 macOS 的 Chrome 中用 YouTube Live 上的一个英语新闻频道测试过一次（2026年10月25日），测试期间越南语字幕一直正常显示。对于 TikTok 直播，我们只有一场带背景音乐的越南语直播的结果。应用采集到了声音，但识别错了语言，还重复了没有人说过的句子，所以字幕无法使用。我们没有测试过 Facebook Live。没有手机版，应用也不会为你自己的直播添加给观众看的字幕。请参阅<a href="/zh/solutions/livestream-translation/">直播翻译</a>。</p>`,
  },
  {
    q: "可以免费获得会议翻译字幕吗？",
    a: `<p>AI Translator 提供 10 天免费试用，每天最多翻译 30 分钟，无需银行卡，也无需账号。这是试用，不是永久免费的套餐；之后需要购买预付套餐：Monthly 50,000 ₫、6 Months 269,000 ₫ 或 Yearly 500,000 ₫。</p>`,
  },
  {
    q: "在越南境外可以付款吗？",
    a: `<p>可以。除了从越南银行用越南盾（VND）进行 VietQR 转账外，你还可以在应用的升级页面，通过 Creem 付款页面用国际银行卡以美元付款：Monthly US$3.99、6 Months US$21.99、Yearly US$39.99，价格不含税。根据 Creem 的名单，部分国家不支持银行卡付款。Free 试用不需要任何付款方式。</p>`,
  },
];

export default {
  id: "home",
  lang: "zh",
  path: "/zh/",
  title: "直播与会议实时翻译字幕，离线运行 | AI Translator",
  description:
    "为直播、视频和 Zoom、Teams、Meet 会议提供实时翻译字幕，支持英语、中文、日语、韩语、越南语。AI 在你的电脑上运行，不经过云端。",
  software: true,
  modified: "2026-10-27",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    ...VIDEO_ITEMS.map((v) => videoObject({ lang: "zh", kind: v.kind, name: v.label, description: v.text, uploadDate: "2026-10-26" })),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS（Apple 芯片）· Windows 10/11 · 免费试用 10 天</p>
<h1 class="reveal">为<em>每一场会议</em><span class="nowrap">提供</span> AI 翻译字幕，在你的电脑上运行</h1>
<p class="lead reveal"><strong>AI Translator</strong> 是一款适用于 macOS 和 Windows 的 AI 实时翻译桌面应用：把电脑上播放的音频实时变成悬浮在屏幕上的翻译字幕，并把你输入的消息翻译成对方的语言。AI 在你自己的电脑上运行，所以你的音频和会议内容不会被发送到云端。可用于 Zoom、Microsoft Teams、Google Meet、Zalo PC、网络研讨会、视频，以及你在电脑上观看的直播。</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/zh/download/">下载 ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-to-use">了解使用方法</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI 100% 在你的设备上运行</li>
<li>${icon("check")} 会议数据从不上传云端</li>
<li>${icon("check")} 无需机器人，无需账号</li>
</ul>
</div>
<div class="reveal">
${demo({
  title: "团队会议（示意）",
  rec: "翻译中",
  langs: "EN → ZH",
  note: "示意图：一场在线会议，屏幕底部浮动着翻译字幕条",
  names: ["Aiko", "Wei", "Maria", "Tom"],
  pairs: [
    { src: "We will send the quotation by next week.", dst: "我们会在下周之前把报价单发给您。" },
    { src: "Will this specification be ready for next month's release?", dst: "这个规格能赶上下个月的发布吗？" },
    { src: "Let's review the schedule in the next meeting.", dst: "我们在下次会议上再看一下进度吧。" },
  ],
  floatA: { icon: "wifi-off", text: "离线运行" },
  floatB: { icon: "lock", text: "音频留在你的设备上" },
})}
</div>
</div></section>

<section class="section" id="main-features"><div class="container">
${sectionHead({ eyebrow: "主要功能", title: "会议翻译、输入翻译、历史记录", center: true })}
${featureTabs({
  listLabel: "选择功能",
  tabs: [
    {
      id: "meeting-translation",
      icon: "captions",
      label: "会议翻译",
      title: "会议说外语，字幕用你的语言",
      lead: "应用收听电脑上正在播放的音频，把译文显示在悬浮字幕条上。不会有机器人加入会议。",
      bullets: [
        "五种语言，任意两种之间互译：英语、中文、日语、韩语、越南语；自动检测说话的语言",
        `说话人说完一句话后，字幕就会出现：在 Mac M4 Pro（Standard 模型包）上中位数低于 1.1 秒，其他电脑可能更慢（<a href="/zh/features/#performance">测试条件</a>）`,
        `可用于 Zoom、Teams、Meet 和 Zalo；线下会议把采集来源选为<strong>麦克风</strong>（<a href="/zh/features/#microphone">使用方法</a>）；也适用于你在电脑上观看的直播（<a href="/zh/solutions/livestream-translation/">直播翻译</a>）`,
      ],
      cta: { href: "/zh/features/", label: "查看全部功能" },
      media: demoVideo({ lang: "zh", kind: MEETING_VIDEO.kind, label: MEETING_VIDEO.label, fallback: MEETING_VIDEO.fallback }),
    },
    {
      id: "type-and-translate",
      icon: "keyboard",
      label: "输入翻译",
      title: "用对方的语言回复",
      lead: "在你正在使用的聊天框中按 ⌃⌥G（Windows：Ctrl+Alt+G），用自己的语言输入并按 Enter：译文会被粘贴到聊天框中，你检查后再发送。",
      bullets: [
        "在任何支持粘贴（⌘V、Ctrl+V）的应用中，粘贴到你正在输入的框里",
        "在你的电脑上翻译：你输入的内容从不离开电脑",
        "所有套餐都包含，而且不消耗翻译时间",
      ],
      cta: { href: "/zh/guide/type-and-translate/", label: "阅读输入翻译指南" },
      media: demoVideo({ lang: "zh", kind: TYPING_VIDEO.kind, label: TYPING_VIDEO.label, fallback: TYPING_VIDEO.fallback }),
    },
    {
      id: "history",
      icon: "history",
      label: "历史记录",
      title: "会议结束后回看内容",
      lead: "每次会话都有转写记录，包含每句话的时间、原文和译文。",
      bullets: [
        "所有套餐：查看、搜索和复制最近一次会话的转写记录",
        "Pro 功能：保存会话的历史记录，重新打开以前的会话，导出为 TXT、SRT 或 Markdown",
        "保存历史记录默认关闭；开启后会加密，只保存在你的电脑上",
      ],
      cta: { href: "/zh/guide/history-and-export/", label: "阅读历史记录指南" },
      media: appShot({ slug: "app-history", lang: "zh", alt: "历史记录页面：已保存会话的列表，显示日期和时间、分钟数、句子数、预览，以及打开和删除按钮", caption: "历史记录：保存在你电脑上的会话。" }),
    },
  ],
})}
</div></section>

<section class="section section-alt" id="how-to-use"><div class="container">
${sectionHead({ eyebrow: "使用方法", title: "四步开始使用", text: "安装和设置只需一次，之后每次会议只要点“开始”。", center: true })}
<div class="split wide-left">
${steps([
  { title: "一行命令安装", text: `把<a href="/zh/download/">下载页面</a>上的命令粘贴到终端（macOS）或 PowerShell（Windows）。` },
  { title: "首次设置", text: "选择语言，下载模型（约 1.3 GB 或 2.5 GB），允许录制系统音频（仅 macOS）。" },
  { title: "开会时点“开始”", text: "在<strong>目标语言</strong>中选择语言，然后点<strong>开始</strong>（⌃⌥T，Windows：Ctrl+Alt+T）。" },
  { title: "回复和回看", text: "按 ⌃⌥G（Windows：Ctrl+Alt+G）使用输入翻译；会议结束后打开<strong>转写记录</strong>或<strong>历史记录</strong>。" },
], true)}
${appShot({ slug: "app-home-running", lang: "zh", alt: "会话进行中的 AI Translator 主页：翻译中状态、语言、音频来源和剩余翻译时间", caption: "会话进行中的主页（Monthly 套餐）。" })}
</div>
<p class="disclaimer">macOS 版是临时签名（ad-hoc），尚未经过公证（notarize）；Windows 版还没有代码签名。用命令安装时，macOS 会直接打开应用，SmartScreen 也不会询问；用浏览器下载的文件在首次启动时可能被阻止或收到警告。请查看 <a href="/zh/guide/install-macos/">macOS</a> 和 <a href="/zh/guide/install-windows/">Windows</a> 安装指南。</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/zh/guide/quick-start/">阅读快速入门指南 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "你的数据留在你的电脑上", title: "AI 在你的电脑上运行，会议内容不会离开它", center: true })}
${dataFlow("zh")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "音频不离开你的电脑", text: "音频只存在于 RAM 中：从不写入磁盘，也从不通过网络发送，我们已在 macOS 上用网络代理验证过。网络断开时字幕也会继续出现。", accent: true })}
${feature({ icon: "shield", title: "服务器上没有会议内容", text: "服务器只保存销售套餐、激活设备和提供支持所需的数据（详见下方），从不保存会议内容。" })}
</div>
<details class="more-details reveal"><summary>服务器具体保存哪些数据？</summary><p>我们的服务器只保存你的电子邮箱（购买时，或你在客服聊天中自愿留下时）、订单、许可证、设备激活信息（经过哈希处理的设备 ID 和设备名称）、Free 试用的开始时间（经过哈希处理的设备 ID）、许可证变更记录、去除了个人数据的错误报告（保存 30 天），以及你使用客服聊天时的聊天消息（保存 90 天），从不保存会议内容。</p></details>
<p class="center-text reveal"><a class="btn btn-secondary" href="/zh/data-security/">详细了解你的数据去向 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "价格", title: "四种简单的套餐，通过 VietQR 或国际银行卡预付", text: "不自动续费，不定期扣费，从不自动收费。", center: true })}
${plansGrid("zh", { ctaLabel: "下载", freeLabel: "安装并免费试用" })}
<p class="disclaimer">VND 价格通过越南银行的 VietQR 支付；USD 价格通过国际银行卡支付，不含税（如有）。</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/zh/pricing/">详细比较各套餐 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "常见问题", title: "你可能最先想知道的事" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/zh/faq/">查看全部问题 ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "准备好听懂每一场会议了吗？", text: "一行命令即可安装（Mac 用终端，Windows 用 PowerShell），免费试用 10 天，无需银行卡。", primary: { href: "/zh/download/", label: "下载" }, secondary: { href: "/zh/guide/quick-start/", label: "阅读快速入门指南" } })}
`,
};
```

- [ ] **Step 6: Viết lại `website/src/content/ko/home.mjs`**

```js
import { dataFlow, demo, demoVideo, feature, featureTabs, steps, plansGrid, faq, ctaBand, sectionHead, icon, appShot } from "../../build/components.mjs";
import { faqPage, videoObject } from "../../build/schema.mjs";
import { videoMeta } from "../../build/mp4.mjs";

const VIDEO_ITEMS = [
  { kind: "meeting", text: `영어로 말하는 동료의 발언에 한국어 자막이 표시됩니다. ${videoMeta("ko", "meeting").seconds}초 분량, 소리가 있는 영상입니다.`, label: "AI Translator 데모 영상: 회의 실시간 번역", fallback: "영상 내려받기(MP4, 1MB)" },
  { kind: "typing", text: `입력 번역이 한국어로 쓴 답장을 영어로 바꿔 채팅으로 보냅니다. ${videoMeta("ko", "typing").seconds}초 분량, 소리가 있는 영상입니다.`, label: "AI Translator 데모 영상: 입력 번역", fallback: "영상 내려받기(MP4, 1MB)" },
];
const [MEETING_VIDEO, TYPING_VIDEO] = VIDEO_ITEMS;

export const HOME_FAQ = [
  {
    q: "Zoom, Teams, Google Meet, Zalo에서 쓸 수 있나요?",
    a: `<p>네. 봇이나 플러그인이 필요 없습니다. 앱이 컴퓨터의 시스템 오디오를 가져오므로 어떤 회의 앱을 쓰든 상관없습니다. macOS에서 Zoom, Google Meet, Microsoft Teams, Zalo PC의 오디오 캡처를 테스트했습니다(내부 테스트이며 해당 회사의 인증이 아닙니다). 다른 참가자에게는 알림이 가지 않으므로, 규정상 알려야 한다면 직접 알려 주세요.</p>`,
  },
  {
    q: "AI Translator를 쓰려면 인터넷 연결이 필요한가요?",
    a: `<p>번역하는 동안에는 필요 없습니다. 음성 인식, 번역, 자막 표시는 모두 내 컴퓨터에서 이루어집니다. 인터넷이 필요한 경우는 처음에 앱과 모델(약 1.3GB 또는 2.5GB)을 내려받을 때, 무료 체험을 등록할 때, 요금제를 구매할 때, 라이선스를 확인할 때(유료 요금제는 확인 사이에 최대 14일 동안 오프라인으로 사용할 수 있습니다), 그리고 앱을 업데이트할 때뿐입니다.</p>`,
  },
  {
    q: "회의 음성이 어딘가로 전송되나요?",
    a: `<p>아니요. 번역하는 동안 음성은 메모리(RAM)에만 있고, 디스크에 저장되거나 네트워크로 전송되지 않습니다. macOS에서 네트워크 프록시로 확인한 결과, 번역 중에 앱이 외부로 보낸 음성이나 받아쓰기 텍스트는 없었습니다.</p>`,
  },
  {
    q: "라이브 방송을 내 언어로 번역할 수 있나요?",
    a: `<p>컴퓨터에서는 가능합니다. 앱은 컴퓨터에서 재생되는 오디오를 들으므로 웹사이트에 좌우되지 않습니다. YouTube 라이브로 한 번 테스트했습니다(영어 뉴스 채널, macOS의 Chrome, 2026년 10월 25일). 테스트하는 동안 베트남어 자막이 계속 표시되었습니다. TikTok 라이브의 경우 배경 음악이 흐르는 베트남어 라이브 방송 한 건의 결과만 있습니다. 앱은 소리를 가져왔지만 언어를 잘못 인식하고 아무도 하지 않은 문장을 되풀이해서 자막을 쓸 만한 수준이 아니었습니다. Facebook 라이브에서는 테스트하지 않았습니다. 휴대폰 버전은 없으며, 앱이 내 라이브 방송에 시청자를 위한 자막을 더하지도 않습니다. <a href="/ko/solutions/livestream-translation/">라이브 방송 번역</a>을 참고하세요.</p>`,
  },
  {
    q: "회의 번역 자막을 무료로 받을 수 있나요?",
    a: `<p>AI Translator에는 하루 최대 30분까지 번역할 수 있는 10일 무료 체험이 있으며, 카드도 계정도 필요 없습니다. 다만 체험판이며 계속 무료로 쓰는 요금제가 아닙니다. 그 후에는 선불 요금제가 필요합니다: Monthly 50,000 ₫, 6 Months 269,000 ₫, Yearly 500,000 ₫.</p>`,
  },
  {
    q: "베트남 밖에서도 결제할 수 있나요?",
    a: `<p>네. 베트남 은행에서 VND로 하는 VietQR 계좌 이체 외에도, 앱의 업그레이드 화면에서 Creem 결제 페이지를 통해 해외 카드로 미국 달러로 결제할 수 있습니다: Monthly US$3.99, 6 Months US$21.99, Yearly US$39.99(세금 별도). Creem 목록에 있는 일부 국가에서는 카드를 사용할 수 없습니다. Free 체험에는 결제 수단이 필요 없습니다.</p>`,
  },
];

export default {
  id: "home",
  lang: "ko",
  path: "/ko/",
  title: "라이브·회의 실시간 번역 자막, 오프라인 | AI Translator",
  description:
    "라이브 방송, 동영상, Zoom·Teams·Meet 회의에 실시간 번역 자막. 영어·중국어·일본어·한국어·베트남어 지원. AI가 내 컴퓨터에서 실행되며 클라우드를 쓰지 않습니다.",
  software: true,
  modified: "2026-10-27",
  schema: [
    faqPage(HOME_FAQ.map((f) => ({ q: f.q, a: f.a }))),
    ...VIDEO_ITEMS.map((v) => videoObject({ lang: "ko", kind: v.kind, name: v.label, description: v.text, uploadDate: "2026-10-26" })),
  ],
  body: () => `
<section class="hero"><div class="container hero-grid">
<div>
<p class="pill reveal"><span class="dot"></span> macOS(Apple 실리콘) · Windows 10/11 · 10일 무료 체험</p>
<h1 class="reveal"><em>모든 회의</em>에 AI 번역 자막을, 내 컴퓨터에서</h1>
<p class="lead reveal"><strong>AI Translator</strong>는 macOS와 Windows용 AI 실시간 번역 데스크톱 앱입니다. 컴퓨터에서 재생되는 소리를 실시간으로 화면 위에 떠 있는 번역 자막으로 바꾸고, 내가 입력한 메시지를 상대방의 언어로 번역합니다. AI가 내 컴퓨터에서 실행되므로 음성과 회의 내용이 클라우드로 전송되지 않습니다. Zoom, Microsoft Teams, Google Meet, Zalo PC, 웨비나, 동영상, 컴퓨터로 보는 라이브 방송에서 쓸 수 있습니다.</p>
<div class="hero-actions reveal">
<a class="btn btn-primary btn-lg" href="/ko/download/">다운로드 ${icon("arrow-right")}</a>
<a class="btn btn-secondary btn-lg" href="#how-to-use">사용법 보기</a>
</div>
<ul class="trust reveal">
<li>${icon("check")} AI가 100% 기기에서 실행</li>
<li>${icon("check")} 회의 데이터는 클라우드로 가지 않음</li>
<li>${icon("check")} 봇도 계정도 필요 없음</li>
</ul>
</div>
<div class="reveal">
${demo({
  title: "팀 회의(예시)",
  rec: "번역 중",
  langs: "EN → KO",
  note: "예시: 화면 아래쪽에 번역 자막 바가 떠 있는 온라인 회의",
  names: ["Aiko", "Wei", "Maria", "Tom"],
  pairs: [
    { src: "We will send the quotation by next week.", dst: "다음 주까지 견적서를 보내 드리겠습니다." },
    { src: "Will this specification be ready for next month's release?", dst: "이 사양이 다음 달 출시에 맞춰 준비될까요?" },
    { src: "Let's review the schedule in the next meeting.", dst: "다음 회의에서 일정을 검토합시다." },
  ],
  floatA: { icon: "wifi-off", text: "오프라인 실행" },
  floatB: { icon: "lock", text: "음성은 기기에 남습니다" },
})}
</div>
</div></section>

<section class="section" id="main-features"><div class="container">
${sectionHead({ eyebrow: "주요 기능", title: "회의 번역, 입력 번역, 기록", center: true })}
${featureTabs({
  listLabel: "기능 선택",
  tabs: [
    {
      id: "meeting-translation",
      icon: "captions",
      label: "회의 번역",
      title: "외국어 회의를 내 언어 자막으로 읽기",
      lead: "컴퓨터에서 재생되는 소리를 듣고 번역을 떠 있는 자막 바에 보여 줍니다. 회의에 봇이 참가하지 않습니다.",
      bullets: [
        "다섯 가지 언어 중 어떤 두 언어 사이든 번역: 영어, 중국어, 일본어, 한국어, 베트남어. 말하는 언어는 자동으로 감지합니다",
        `화자가 문장을 마치면 자막이 나타납니다. Mac M4 Pro(Standard 모델 팩)에서 중앙값은 1.1초 미만이며, 다른 컴퓨터는 더 느릴 수 있습니다(<a href="/ko/features/#performance">측정 조건</a>)`,
        `Zoom, Teams, Meet, Zalo에서 쓸 수 있습니다. 대면 회의는 입력 소스를 <strong>마이크</strong>로 고르세요(<a href="/ko/features/#microphone">사용 방법</a>). 컴퓨터로 보는 라이브 방송에도 쓸 수 있습니다(<a href="/ko/solutions/livestream-translation/">라이브 방송 번역</a>)`,
      ],
      cta: { href: "/ko/features/", label: "모든 기능 보기" },
      media: demoVideo({ lang: "ko", kind: MEETING_VIDEO.kind, label: MEETING_VIDEO.label, fallback: MEETING_VIDEO.fallback }),
    },
    {
      id: "type-and-translate",
      icon: "keyboard",
      label: "입력 번역",
      title: "상대방의 언어로 답장하기",
      lead: "쓰고 있는 채팅 입력란에서 ⌃⌥G(Windows: Ctrl+Alt+G)를 누르고, 내 언어로 입력한 뒤 Enter를 누르세요. 번역이 채팅 입력란에 붙여 넣어지면 확인하고 보내면 됩니다.",
      bullets: [
        "붙여넣기(⌘V, Ctrl+V)가 되는 앱이라면 입력 중인 칸에 붙여 넣습니다",
        "번역은 내 컴퓨터에서 이루어지며, 입력한 내용이 밖으로 나가지 않습니다",
        "모든 요금제에 포함되며 번역 시간을 쓰지 않습니다",
      ],
      cta: { href: "/ko/guide/type-and-translate/", label: "입력 번역 가이드 읽기" },
      media: demoVideo({ lang: "ko", kind: TYPING_VIDEO.kind, label: TYPING_VIDEO.label, fallback: TYPING_VIDEO.fallback }),
    },
    {
      id: "history",
      icon: "history",
      label: "기록",
      title: "회의가 끝난 뒤 다시 보기",
      lead: "세션마다 각 문장의 시간, 원문, 번역이 담긴 대본이 남습니다.",
      bullets: [
        "모든 요금제: 최근 세션의 대본을 보고, 검색하고, 복사",
        "Pro 기능: 세션 기록을 저장하고, 지난 세션을 다시 열고, TXT, SRT, Markdown으로 내보내기",
        "기록 저장은 기본으로 꺼져 있으며, 켜면 암호화되어 내 컴퓨터에만 저장됩니다",
      ],
      cta: { href: "/ko/guide/history-and-export/", label: "기록 가이드 읽기" },
      media: appShot({ slug: "app-history", lang: "ko", alt: "기록 화면: 저장된 세션 목록과 날짜와 시간, 분, 문장 수, 미리보기, 열기 및 삭제 버튼", caption: "기록: 내 컴퓨터에 저장된 세션." }),
    },
  ],
})}
</div></section>

<section class="section section-alt" id="how-to-use"><div class="container">
${sectionHead({ eyebrow: "사용법", title: "네 단계로 시작하기", text: "설치와 설정은 한 번만. 그다음부터는 회의마다 '시작'만 누르면 됩니다.", center: true })}
<div class="split wide-left">
${steps([
  { title: "명령 한 줄로 설치", text: `<a href="/ko/download/">다운로드 페이지</a>의 명령을 터미널(macOS) 또는 PowerShell(Windows)에 붙여 넣으세요.` },
  { title: "처음 설정하기", text: "언어를 고르고, 모델을 내려받은 다음(약 1.3GB 또는 2.5GB), 시스템 오디오 녹음을 허용하세요(macOS만)." },
  { title: "회의에서 '시작' 누르기", text: "<strong>번역 언어</strong>에서 언어를 고르고 <strong>시작</strong>을 누르세요(단축키 ⌃⌥T, Windows: Ctrl+Alt+T)." },
  { title: "답장하고 다시 보기", text: "⌃⌥G(Windows: Ctrl+Alt+G)로 입력 번역을 쓰세요. 회의가 끝나면 <strong>대본</strong> 또는 <strong>기록</strong>을 엽니다." },
], true)}
${appShot({ slug: "app-home-running", lang: "ko", alt: "세션 중인 AI Translator 메인 화면: 번역 중 상태, 언어, 오디오 소스, 남은 번역 시간", caption: "세션 중인 메인 화면(Monthly 요금제)." })}
</div>
<p class="disclaimer">macOS 버전은 애드혹 서명이며 공증(notarize)을 받지 않았고, Windows 버전은 아직 코드 서명이 되어 있지 않습니다. 명령으로 설치하면 macOS에서는 앱이 바로 열리고 SmartScreen도 묻지 않습니다. 브라우저로 내려받은 파일은 처음 실행할 때 막히거나 경고가 나올 수 있습니다. <a href="/ko/guide/install-macos/">macOS</a>와 <a href="/ko/guide/install-windows/">Windows</a> 설치 가이드를 참조하세요.</p>
<p class="center-text reveal"><a class="btn btn-secondary" href="/ko/guide/quick-start/">빠른 시작 가이드 읽기 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section band-dark" id="private-on-device"><div class="container">
${sectionHead({ eyebrow: "데이터는 내 컴퓨터에 남습니다", title: "AI가 내 컴퓨터에서 실행되므로 회의 내용이 밖으로 나가지 않습니다", center: true })}
${dataFlow("ko")}
<div class="grid grid-2">
${feature({ icon: "lock", title: "음성은 컴퓨터 밖으로 나가지 않음", text: "음성은 RAM에만 있으며 디스크에 저장되거나 네트워크로 전송되지 않습니다. macOS에서 네트워크 프록시로 확인했습니다. 연결이 끊겨도 자막이 계속 나옵니다.", accent: true })}
${feature({ icon: "shield", title: "서버에 회의 내용 없음", text: "서버는 요금제 판매, 기기 활성화, 지원에 필요한 데이터만 저장하며(자세한 내용은 아래), 회의 내용은 저장하지 않습니다." })}
</div>
<details class="more-details reveal"><summary>서버는 정확히 무엇을 저장하나요?</summary><p>서버에는 이메일(구매 시, 또는 지원 채팅에 직접 남겼을 때), 주문, 라이선스, 기기 활성화 정보(해시 처리한 기기 ID와 기기 이름), Free 체험 시작 시점(해시 처리한 기기 ID), 라이선스 변경 기록, 개인 정보를 지운 오류 보고서(30일 보관), 채팅을 쓴 경우의 지원 채팅 메시지(90일 보관)만 저장하며, 회의 내용은 절대 저장하지 않습니다.</p></details>
<p class="center-text reveal"><a class="btn btn-secondary" href="/ko/data-security/">데이터가 어디로 가는지 자세히 보기 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section" id="pricing"><div class="container">
${sectionHead({ eyebrow: "요금", title: "간단한 요금제 네 가지, VietQR 또는 해외 카드로 선불", text: "자동 갱신도, 정기 결제도 없으며 자동으로 청구되는 일은 절대 없습니다.", center: true })}
${plansGrid("ko", { ctaLabel: "다운로드", freeLabel: "설치하고 무료로 써 보기" })}
<p class="disclaimer">VND 가격은 베트남 은행의 VietQR로, USD 가격은 해외 카드로 결제하며 세금 별도입니다(세금이 있는 경우).</p>
<p class="center-text reveal"><a class="btn btn-ghost" href="/ko/pricing/">요금제 자세히 비교하기 ${icon("arrow-right")}</a></p>
</div></section>

<section class="section section-alt"><div class="container narrow">
${sectionHead({ eyebrow: "자주 묻는 질문", title: "먼저 알고 싶으실 내용" })}
${faq(HOME_FAQ, { open: true })}
<p class="more-link"><a href="/ko/faq/">모든 질문 보기 ${icon("arrow-right")}</a></p>
</div></section>

${ctaBand({ title: "모든 회의를 이해할 준비가 되셨나요?", text: "명령 한 줄로 설치하고(Mac은 터미널, Windows는 PowerShell) 10일 동안 무료로 써 보세요. 카드가 필요 없습니다.", primary: { href: "/ko/download/", label: "다운로드" }, secondary: { href: "/ko/guide/quick-start/", label: "빠른 시작 가이드 읽기" } })}
`,
};
```

- [ ] **Step 7: Viết lại `website/test/video-facade.test.mjs` theo bố cục tab**

Đọc file hiện tại rồi Write lại toàn bộ như sau (khác bản cũ ở: ghi chú đầu file, assert khung video thứ hai ở test 1, test "hai video" và test "bố cục"; các test còn lại giữ nguyên):

```js
// Kiểm nút phát video demo của trang chủ (spec 2026-10-22-website-ja-zh-ko §4; hai video nằm trong hai tab của khối "Tính năng
// chính", spec 2026-10-27-trang-chu-ba-viec-tab) bằng Chrome không đầu, qua tools/browser/cdp.mjs.
//   node --test test/video-facade.test.mjs        (không có Chrome: bỏ qua; đặt CHROME=<đường dẫn> nếu Chrome ở chỗ khác)
// Dựng website vào một thư mục tạm riêng (WEBSITE_DIST) để không đụng bài test dựng chung dist/.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, launch } from "../tools/browser/cdp.mjs";

const skip = findChrome() ? false : "cần Google Chrome (hoặc biến CHROME)";
const DIST = mkdtempSync(join(tmpdir(), "video-dist-"));
process.env.WEBSITE_DIST = DIST;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let browser;
let base;

before(async () => {
  if (skip) return;
  const { build } = await import("../src/build/build.mjs");
  await build();
  const { start } = await import("../src/serve.mjs");
  server = await start(0);
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await launch();
});

after(async () => {
  await browser?.close();
  server?.close();
  rmSync(DIST, { recursive: true, force: true });
});

const state = (p) =>
  p.eval(`(() => {
    const f = document.querySelector("[data-video]");
    const v = f.querySelector("video");
    const b = f.querySelector(".video-play");
    const label = b.querySelector(".video-play-label");
    return {
      facade: f.classList.contains("is-facade"),
      canInvite: f.classList.contains("can-invite"),
      inviting: f.classList.contains("is-inviting"),
      button: !b.hidden && getComputedStyle(b).display !== "none",
      controls: v.controls,
      paused: v.paused,
      readyState: v.readyState,
      labelText: label.textContent,
      labelOpacity: getComputedStyle(label).opacity,
      mp4Fetched: performance.getEntriesByType("resource").some((e) => e.name.includes(".mp4")),
    };
  })()`);
const scrollToVideo = (p) => p.eval(`document.querySelector("[data-video]").scrollIntoView({ block: "center", behavior: "instant" })`);

test("máy tính: nút lớn thay thanh điều khiển; cuộn tới thì mời đúng một lần; chưa tải MP4 trước khi bấm", { skip }, async () => {
  // Cửa sổ thấp (600 px) để lúc mở trang khung video chắc chắn chưa lộ quá nửa dưới phần đầu trang.
  const p = await browser.newPage({ width: 1280, height: 600 });
  await p.goto(base + "/");
  let s = await state(p);
  assert.equal(s.facade, true);
  assert.equal(s.button, true);
  assert.equal(s.controls, false);
  assert.equal(s.canInvite, true);
  assert.equal(s.inviting, false, "chưa cuộn tới mà đã mời");
  assert.match(s.labelText, /^Bấm để xem · \d:\d\d · có tiếng$/);
  await scrollToVideo(p);
  await sleep(500);
  s = await state(p);
  assert.equal(s.inviting, true, "cuộn tới mà không mời");
  // Video Gõ dịch nằm ở tab ẩn (display: none): không vào màn hình nên không được mời.
  assert.equal(await p.eval(`document.querySelectorAll("[data-video]")[1].classList.contains("is-inviting")`), false, "video ở tab ẩn lại được mời");
  // Chỉ một lần: bỏ lớp, cuộn đi rồi cuộn lại, lớp không được gắn lại.
  await p.eval(`document.querySelector("[data-video]").classList.remove("is-inviting"); scrollTo(0, 0)`);
  await sleep(300);
  await scrollToVideo(p);
  await sleep(500);
  s = await state(p);
  assert.equal(s.inviting, false, "hiệu ứng mời chạy lại lần hai");
  assert.equal(s.readyState, 0);
  assert.equal(s.mp4Fetched, false, "đã tải MP4 trước khi bấm");
  assert.deepEqual(p.errors, []);
  await p.close();
});

test("bấm nút: phát có tiếng, hiện thanh điều khiển gốc, ẩn nút", { skip }, async () => {
  const p = await browser.newPage({ width: 1280, height: 800 });
  await p.goto(base + "/en/");
  await p.click(".video-play");
  await sleep(1500);
  const s = await state(p);
  assert.equal(s.button, false);
  assert.equal(s.facade, false);
  assert.equal(s.controls, true);
  assert.equal(s.paused, false, "video không phát");
  assert.equal(await p.eval(`document.querySelector("[data-video] video").muted`), false);
  assert.deepEqual(p.errors, []);
  await p.close();
});

test("hai video nằm ở hai tab: chuyển tab thì video đang phát tạm dừng; bấm phát ở tab Gõ dịch phát đúng file", { skip }, async () => {
  const p = await browser.newPage({ width: 1280, height: 800 });
  await p.goto(base + "/en/");
  assert.equal(await p.eval(`document.querySelectorAll("[data-video]").length`), 2);
  const info = (i) =>
    p.eval(`(() => { const v = document.querySelectorAll("[data-video] video")[${i}]; return { paused: v.paused, src: v.currentSrc || v.querySelector("source").src, controls: v.controls }; })()`);
  await p.click("#meeting-translation .video-play");
  await sleep(1200);
  let [a, b] = [await info(0), await info(1)];
  assert.equal(a.paused, false, "video họp không phát");
  assert.match(a.src, /ai-translator-meeting\.en\.mp4/);
  assert.equal(b.paused, true);
  await p.click('[role="tab"][aria-controls="type-and-translate"]');
  await sleep(300);
  a = await info(0);
  assert.equal(a.paused, true, "chuyển sang tab Gõ dịch mà video họp vẫn phát");
  await p.click("#type-and-translate .video-play");
  await sleep(1200);
  [a, b] = [await info(0), await info(1)];
  assert.equal(b.paused, false, "video Gõ dịch không phát");
  assert.match(b.src, /ai-translator-typing\.en\.mp4/);
  assert.equal(a.paused, true);
  await p.click('[role="tab"][aria-controls="meeting-translation"]');
  await sleep(300);
  b = await info(1);
  assert.equal(b.paused, true, "chuyển về tab họp mà video Gõ dịch vẫn phát");
  assert.deepEqual(p.errors, []);
  await p.close();
});

test("bố cục: 1280 px video họp rộng cạnh chữ và chỉ panel đang mở hiện; 375 px xếp dọc và trang không tràn ngang", { skip }, async () => {
  const box = (p, sel) =>
    p.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  const wide = await browser.newPage({ width: 1280, height: 800 });
  await wide.goto(base + "/");
  const v = await box(wide, "#dich-cuoc-hop [data-video]");
  const t = await box(wide, "#dich-cuoc-hop h3");
  assert.ok(v.w >= 600, `video họp quá hẹp: ${v.w} px`);
  assert.ok(v.x >= t.x + t.w, "video họp không nằm bên phải chữ");
  assert.equal(await wide.eval(`getComputedStyle(document.querySelector("#go-dich")).display`), "none", "panel Gõ dịch phải ẩn khi tab Dịch họp mở");
  await wide.close();
  const narrow = await browser.newPage({ width: 375, height: 800, mobile: true });
  await narrow.goto(base + "/");
  const nv = await box(narrow, "#dich-cuoc-hop [data-video]");
  const nt = await box(narrow, "#dich-cuoc-hop h3");
  assert.ok(nv.y > nt.y + nt.h - 1, "ở 375 px video không nằm dưới chữ");
  assert.ok(Math.abs(nv.x - nt.x) <= 1, "ở 375 px video và chữ không cùng mép trái");
  assert.ok(await narrow.eval(`document.documentElement.scrollWidth <= innerWidth`), "trang tràn ngang ở 375 px");
  await narrow.close();
});

test("điện thoại 375 px và máy tính bật giảm chuyển động: nút và nhãn hiện sẵn, không hiệu ứng mời", { skip }, async () => {
  for (const o of [{ width: 375, height: 800, mobile: true }, { width: 1280, height: 800, reduceMotion: true }]) {
    const p = await browser.newPage(o);
    await p.goto(base + "/");
    await scrollToVideo(p);
    await sleep(500);
    const s = await state(p);
    assert.equal(s.button, true, JSON.stringify(o));
    assert.equal(s.canInvite, false, JSON.stringify(o));
    assert.equal(s.inviting, false, JSON.stringify(o));
    assert.equal(s.labelOpacity, "1", JSON.stringify(o));
    await p.close();
  }
});

test("tắt JavaScript: vẫn là <video controls>, không có nút lớn", { skip }, async () => {
  const p = await browser.newPage({ width: 1280, height: 800 });
  await p.setJS(false);
  await p.goto(base + "/");
  const r = await p.eval(`(() => ({ controls: document.querySelector("[data-video] video").controls, display: getComputedStyle(document.querySelector(".video-play")).display }))()`);
  assert.deepEqual(r, { controls: true, display: "none" });
  await p.close();
});
```

- [ ] **Step 8: Chạy các test bị ảnh hưởng**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node --test test/feature-tabs.test.mjs test/video-facade.test.mjs test/i18n-content.test.mjs test/seo-targets.test.mjs 2>&1 | grep -E "^# (tests|pass|fail|skipped)|^not ok|^    not ok" | head -30`
Expected: `# fail 0`, `# skipped 0`. Nếu có test đỏ, đọc thông báo đầy đủ (`… 2>&1 | grep -B2 -A12 "not ok"`) rồi xử lý theo luật: **câu hay cụm mà test bắt buộc thì khôi phục vào bản vi/en (và ja/zh/ko tương ứng), không sửa test**; chỉ sửa test khi nó khẳng định điều về phần tử đã bị bỏ có chủ đích (khung hai video cạnh nhau, ảnh `overlay-default`/`compose-done` trên trang chủ). Lấy câu gốc từ `git show 8de55fda:website/src/content/<lang>/home.mjs`.

Các điểm hay lệch, kiểm trước:
- `i18n-content`: số `<h2>`/`<h3>`, tập id, tập liên kết, tập ảnh và số câu FAQ của ja/zh/ko phải **bằng đúng** bản en (đổi một liên kết ở bản en thì đổi cả ba).
- `i18n-content` (không sót câu tiếng Anh): không để từ năm chữ Latin liền nhau trong chữ ja/zh/ko.
- `seo-targets`: trang chủ vi có "dịch livestream" ở thân trang, liên kết `/giai-phap/dich-livestream/` trong `<main>`, câu hỏi `Dịch livestream ra tiếng Việt được không?`; luật `STALE_LIVE` quét các câu về TikTok/Facebook (giữ câu "chưa thử" riêng, không nối bằng dấu phẩy với câu "đã thử").

- [ ] **Step 9: Chạy cả bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node --test "test/*.test.mjs" 2>&1 | tail -10`
Expected: `# fail 0`, `# skipped` bằng số nền ở Task 0 (không thêm test nào bị bỏ qua).

- [ ] **Step 10: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec && git branch --show-current && git add website/src/content website/test/feature-tabs.test.mjs website/test/video-facade.test.mjs && git commit -q -m "$(cat <<'EOF'
feat(website): trang chủ gộp bốn phần thành khối tab Tính năng chính, rút chữ (5 ngôn ngữ)

Video demo, Dịch cuộc họp, Gõ dịch và Lịch sử thành ba tab (video họp, video Gõ dịch, ảnh
Lịch sử); Cách dùng còn bốn bước ngắn và một câu ký mã; Dữ liệu giữ sơ đồ, hai thẻ ngắn và
mục gập "Máy chủ lưu những gì?" (câu liệt kê giữ nguyên chữ); Hỏi đáp 7 -> 6 câu ngắn hơn.
Hero, Bảng giá và lời mời cuối trang giữ nguyên. Test trình duyệt cho khối tab, sửa test video.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1 | cat
```

---

### Task 5: Dọn mã hai video cạnh nhau và cập nhật README

**Files:**
- Modify: `website/src/build/components.mjs`, `website/src/assets/site.css`, `website/src/assets/site.js`, `website/test/i18n.test.mjs`, `website/README.md`

- [ ] **Step 1: Bỏ `demoVideoPair` và `VIDEO_KINDS` khỏi `components.mjs`**

1. Dòng import: old `import { VIDEO_KINDS, checkVideoKind, videoMeta } from "./mp4.mjs";` → new `import { checkVideoKind, videoMeta } from "./mp4.mjs";`
2. Xóa khối sau (Edit với `old_string` là toàn bộ khối, `new_string` rỗng; nếu Edit báo không khớp thì `Read` các dòng 57–72 của file rồi xóa đúng khối từ `/**` của `demoVideoPair` tới `};` của nó, cùng dòng trống theo sau):

```js
/**
 * Hai video demo cạnh nhau (hai cột từ 900 px, một cột dưới đó): mỗi cột có tiêu đề `<h3>`, một câu mô tả rồi video. `items` là
 * `[{ kind, title, text, label, fallback }]`, đúng thứ tự VIDEO_KINDS (họp rồi Gõ dịch); chữ là chữ thuần.
 */
export const demoVideoPair = ({ lang, items }) => {
  const kinds = items.map((i) => i.kind);
  if (kinds.join() !== VIDEO_KINDS.join()) throw new Error(`demoVideoPair: cần ${VIDEO_KINDS.join(" rồi ")}, nhận ${kinds.join(", ") || "không có gì"}`);
  const cols = items.map((i) => `<div class="video-col">
<h3>${esc(i.title)}</h3>
<p>${esc(i.text)}</p>
${demoVideo({ lang, kind: i.kind, label: i.label, fallback: i.fallback })}
</div>`);
  return `<div class="video-pair">\n${cols.join("\n")}\n</div>`;
};
```

3. Trong chú thích của `demoVideo` (đoạn đầu file) có nhắc "tách làm hai: spec 2026-10-26-tach-video-demo-hai-phan": giữ nguyên (vẫn đúng lịch sử).

- [ ] **Step 2: Bỏ CSS `.video-pair`, `.video-col`**

Edit `website/src/assets/site.css`: `old_string` là khối sau, `new_string` rỗng:

```css
/* Hai video cạnh nhau (spec 2026-10-26-tach-video-demo-hai-phan): dưới 1000 px xếp dọc, mỗi video rộng cả hàng (ở 900 px mỗi
   video chỉ còn khoảng 400 px); từ 1000 px chia hai cột đều nhau, nên nút phát và nhãn nhỏ lại cho vừa khung hẹp. */
.video-pair { display: grid; gap: clamp(32px, 5vw, 48px) 28px; max-width: calc(var(--maxw) - 80px); margin-inline: auto; }
.video-col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.video-col h3 { margin: 0; }
.video-col p { margin: 0 0 8px; color: var(--ink-2); }
.video-col .shot.video { width: 100%; max-width: none; margin: 0; }
@media (min-width: 1000px) {
  .video-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .video-pair .video-play { gap: 12px; }
  .video-pair .video-play-btn { width: 72px; height: 72px; }
  .video-pair .video-play-btn .icon { width: 30px; height: 30px; margin-left: 4px; }
  .video-pair .video-play-label { font-size: .85rem; padding: 6px 12px; }
}
```

- [ ] **Step 3: Bỏ đoạn "hai video cạnh nhau tạm dừng nhau" trong `site.js`**

Edit `website/src/assets/site.js`: `old_string` là đoạn sau, `new_string` rỗng (khối tab đã tự tạm dừng video khi chuyển tab, và mỗi lúc chỉ một video hiện):

```js
    // Hai video cạnh nhau (spec 2026-10-26-tach-video-demo-hai-phan): phát video này thì tạm dừng video kia, khỏi chồng tiếng.
    video.addEventListener("play", () => {
      document.querySelectorAll("[data-video] video").forEach((other) => {
        if (other !== video && !other.paused) other.pause();
      });
    });
```

- [ ] **Step 4: Bỏ test `demoVideoPair`**

Trong `website/test/i18n.test.mjs`: (a) sửa import thành `import { plansGrid, dataFlow, demoVideo, featureTabs } from "../src/build/components.mjs";`; (b) xóa nguyên test sau (từ dòng `test("demoVideoPair: …` tới `});` của nó):

```js
test("demoVideoPair: lưới hai cột, mỗi cột có tiêu đề h3, câu mô tả rồi video của đúng loại; thiếu một loại thì báo lỗi", () => {
  const item = (kind) => ({ kind, title: `T-${kind}`, text: `X-${kind}`, label: `L-${kind}`, fallback: `F-${kind}` });
  const html = demoVideoPair({ lang: "vi", items: [item("meeting"), item("typing")] });
  assert.match(html, /^<div class="video-pair">/);
  const cols = html.split('<div class="video-col">').slice(1);
  assert.equal(cols.length, 2);
  assert.match(cols[0], /<h3>T-meeting<\/h3>\s*<p>X-meeting<\/p>\s*<figure class="shot video reveal" data-video>[\s\S]*ai-translator-meeting\.vi\.mp4/);
  assert.match(cols[1], /<h3>T-typing<\/h3>\s*<p>X-typing<\/p>\s*<figure class="shot video reveal" data-video>[\s\S]*ai-translator-typing\.vi\.mp4/);
  assert.equal((html.match(/<video\b/g) ?? []).length, 2);
  assert.throws(() => demoVideoPair({ lang: "vi", items: [item("meeting")] }), /meeting.*typing/);
});

```

- [ ] **Step 5: Cập nhật `website/README.md`**

Ba chỗ sửa (Edit):
1. Cấu trúc: old `tools/i18n/             nhãn giao diện của app và bảng thuật ngữ cho người dịch (glossary.mjs <ja|zh|ko>)` → new:
```
tools/i18n/             nhãn giao diện của app và bảng thuật ngữ cho người dịch (glossary.mjs <ja|zh|ko>)
tools/measure-home.mjs  đo trang chủ: số chữ từng phần; `--browser` thêm chữ nhìn thấy ngay và chiều cao ở 1280/375 px; `--shots=<thư mục>` chụp ảnh kiểm
```
2. Bullet video: old ``(`src/assets/video/ai-translator-{meeting,typing}.<lang>.{mp4,webp}`: dịch cuộc họp, Gõ dịch). Cắt từ`` → new ``(`src/assets/video/ai-translator-{meeting,typing}.<lang>.{mp4,webp}`: dịch cuộc họp, Gõ dịch), nằm trong hai tab của khối "Tính năng chính" trên trang chủ. Cắt từ``
3. Thêm một mục mới ngay **trước** dòng `## Trang Tải xuống: tab hệ điều hành`:

```markdown
## Trang chủ: khối tab "Tính năng chính"
Spec `docs/superpowers/specs/2026-10-27-trang-chu-ba-viec-tab-design.md`. Ba tab (Dịch họp, Gõ dịch, Lịch sử) do `featureTabs` (`src/build/components.mjs`) dựng, `initFeatureTabs` (`src/assets/site.js`) điều khiển; id panel là các neo cũ của trang chủ (`dich-cuoc-hop` / `meeting-translation`, `go-dich` / `type-and-translate`, `lich-su` / `history`) và id phần là `tinh-nang-chinh` / `main-features`. **Không có JS:** thanh tab ẩn, ba panel xếp dọc. **Có JS:** tab đầu mở sẵn, neo `#` mở đúng tab (kể cả khi đổi neo), mũi tên/Home/End đổi tab, chuyển tab thì tạm dừng video của panel vừa rời. Ảnh và video trong panel mang lớp `.reveal` (do `appShot`, `demoVideo`), nhưng panel ẩn không bao giờ vào IntersectionObserver, nên CSS `.ftabs-panel .reveal` ép chúng hiện; đừng thêm `.reveal` vào chính panel. Chữ của tab (`label`, `title`, `lead`, `cta.label`) là HTML: viết `&amp;` cho dấu `&`. Thêm tab thứ tư: thêm một phần tử vào `tabs` của năm `home.mjs` và đổi `grid-template-columns` của `.ftabs-list` (đang chia ba cột đều). Phần Dữ liệu có mục gập `.more-details` giữ nguyên văn câu liệt kê dữ liệu máy chủ lưu (test chat hỗ trợ bắt nguyên văn). Test trình duyệt: `test/feature-tabs.test.mjs` (tab, neo, bàn phím, tràn ngang, tắt JS) và `test/video-facade.test.mjs` (video trong tab).

```

- [ ] **Step 6: Chạy cả bộ test**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node --check src/assets/site.js && node --test "test/*.test.mjs" 2>&1 | tail -10`
Expected: `# fail 0`; `# tests` ít hơn lần trước đúng 1 (đã bỏ test `demoVideoPair`).
Kiểm không còn tham chiếu: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec && grep -rn "demoVideoPair\|video-pair\|video-col" website/src website/test website/README.md` → không in dòng nào.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec && git branch --show-current && git add website/src website/test/i18n.test.mjs website/README.md && git commit -q -m "$(cat <<'EOF'
refactor(website): bỏ demoVideoPair, CSS và JS hai video cạnh nhau; README khối tab

Hai video giờ nằm trong hai tab nên không còn lưới hai cột, và khối tab tự tạm dừng video khi
chuyển tab. README thêm mục khối tab, công cụ đo trang chủ và sửa bullet video.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1 | cat
```

---

### Task 6: Kiểm cuối, đo sau, ảnh chụp

**Files:**
- Modify: `docs/superpowers/specs/2026-10-27-trang-chu-ba-viec-tab-design.md` (ghi số đo thực)

- [ ] **Step 1: Chạy cả bộ test lần cuối**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node --test "test/*.test.mjs" 2>&1 | tail -10`
Expected: `# fail 0`, `# skipped` bằng số nền.

- [ ] **Step 2: Đo sau và chụp ảnh**

Run: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec/website && node tools/measure-home.mjs --shots=/private/tmp/claude-502/-Users-dtphong-Desktop-software-business-ai-translator/bca4f07d-56d1-42c7-8e5c-5e7f98c410a3/scratchpad/trang-chu-shots`
(Nếu phiên làm việc khác có thư mục scratchpad khác thì dùng thư mục scratchpad của phiên đó.)
Expected: bảng chữ từng phần của vi và en (có phần `tinh-nang-chinh` / `main-features`, không còn `video-demo`, `dich-cuoc-hop`, `go-dich`, `lich-su` đứng riêng), năm dòng JSON `cao1280`, `cao375`, `thayNgay`, và dòng `Ảnh đã lưu ở …`.
So với bảng "trước" của Task 0: tổng chữ vi khoảng 1.700 (từ 2.162), `thayNgay` của vi khoảng 1.100.

- [ ] **Step 3: Xem ảnh bằng mắt**

Dùng Read để mở và nhìn các ảnh PNG đã lưu: `home-vi-1280.png`, `home-en-1280.png`, `home-ja-1280.png`, `home-vi-375.png`, `home-vi-375-dark.png`, `tab-vi-dich-cuoc-hop.png`, `tab-vi-go-dich.png`, `tab-vi-lich-su.png`. Kiểm từng điều:
- Thanh tab ba cột đều, tab đang chọn nổi (nền sáng, viền, icon màu thương hiệu), ở 375 px icon nằm trên nhãn và không cắt chữ ("Type & Translate" xuống hai dòng là chấp nhận được).
- Video họp rộng, chữ phụ đề trong khung đọc được rõ hơn bản hai video cạnh nhau; nút phát lớn nằm giữa khung.
- Panel Gõ dịch và Lịch sử không còn là khối trống hay lệch (ảnh Lịch sử có thanh tiêu đề cửa sổ).
- Phần Dữ liệu: mục gập "Máy chủ lưu những gì?" nhìn rõ trên nền tối; hai thẻ ngắn.
- Hỏi đáp: câu đầu mở sẵn, năm câu còn lại đóng.
- Không có phần nào tràn ngang hay chồng lên nhau ở 375 px sáng và tối.
Nếu thấy lỗi bố cục: sửa CSS ở `site.css` (khối `.ftabs*`) hoặc chữ rồi chạy lại Step 1–2, **commit riêng** `fix(website): …` cho từng chỗ sửa.

- [ ] **Step 4: Ghi số đo thực vào spec**

Thêm vào **cuối** mục `## Kiểm` của spec (ngay trước mục `## Ngoài phạm vi`) một đoạn có số thật lấy từ Step 2 và bảng "trước" của Task 0, đúng khuôn:

```markdown
Số đo (2026-10-27, `node tools/measure-home.mjs --browser`, trang chủ tiếng Việt): tổng chữ trong HTML <TRƯỚC> → <SAU>; chữ nhìn thấy ngay <TRƯỚC> → <SAU>; chiều cao trang ở 1280 px <TRƯỚC> → <SAU> px, ở 375 px <TRƯỚC> → <SAU> px. Tiếng Anh: tổng chữ <TRƯỚC> → <SAU>. Số test: <NỀN> → <SAU>.
```
Thay từng `<…>` bằng số đo thật (đây là bước ghi dữ liệu đo được, không để lại `<` `>` trong spec). Nếu tổng chữ hoặc chữ nhìn thấy ngay lệch quá 10% so với số trong mục tiêu của spec (1.700 và 1.100), sửa luôn số mục tiêu cho khớp số đo và nói rõ trong tin nhắn bàn giao.

Kiểm: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec && grep -n "<TRƯỚC>\|<SAU>\|<NỀN>" docs/superpowers/specs/2026-10-27-trang-chu-ba-viec-tab-design.md` → không in dòng nào.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/trang-chu-ba-viec && git branch --show-current && git add docs/superpowers/specs/2026-10-27-trang-chu-ba-viec-tab-design.md && git commit -q -m "$(cat <<'EOF'
docs(website): ghi số đo trang chủ trước và sau khi gọn

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -8 | cat && git status --short
```
Expected: danh sách commit của nhánh (từ spec tới số đo), `git status --short` trống.

- [ ] **Step 6: Bàn giao (không push, không deploy)**

Báo chủ dự án bằng tiếng Việt: nhánh `trang-chu-ba-viec` (worktree riêng) đã xong và test xanh; nêu số đo trước/sau (chữ trong HTML, chữ nhìn thấy ngay, chiều cao), các chỗ khác với spec đã duyệt (mục tiêu chữ, id phần, ngân sách Hỏi đáp), đường dẫn ảnh chụp để xem, và hỏi: gộp vào `main` bằng cách nào (fast-forward như lần `trang-chu-gon`), có push không, và khi nào `pnpm deploy` (chủ dự án tự chạy). **Không tự gộp, push hay deploy.**

---

## Tự rà soát kế hoạch so với spec

| Mục của spec | Task |
|---|---|
| Hero giữ nguyên | Task 4 (sao chép nguyên văn hero ở năm file) |
| Khối "Ba việc": tab, panel hai cột, hình từng tab, nút | Task 2 (`featureTabs`), Task 3 (CSS), Task 4 (nội dung) |
| Không JS / có JS / neo / bàn phím / tạm dừng video / không `.reveal` ở panel / không tràn ngang 320 px | Task 3 (JS, CSS), Task 4 (`feature-tabs.test.mjs`, `video-facade.test.mjs`) |
| Cách dùng: bốn bước ngắn, ký mã một câu + hai liên kết, một nút | Task 4 |
| Dữ liệu: sơ đồ, hai thẻ ngắn, `<details>` giữ nguyên văn câu liệt kê (bắt buộc bởi test) | Task 3 (CSS `.more-details`), Task 4 |
| Hỏi đáp 7 → 6, câu livestream và "ngoài Việt Nam" giữ ràng buộc | Task 4 |
| `modified` đổi 2026-10-27 | Task 4 |
| Bỏ `demoVideoPair`, CSS, JS cũ; sửa test cũ | Task 4 (video-facade), Task 5 |
| Test mới + README + spec | Task 4, 5, 1, 6 |
| Đo trước và sau, ảnh chụp 1280/375 sáng-tối | Task 0, 6 |
| Không push, không deploy | Quy ước chung, Task 6 Step 6 |

Chỗ khác spec đã nêu ở đầu kế hoạch và sửa vào spec ở Task 1.
