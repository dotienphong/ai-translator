# Website ja/zh/ko, phần 1: hạ tầng nhiều ngôn ngữ và nút phát video — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bộ dựng website chạy được với năm ngôn ngữ (vi, en, ja, zh, ko) qua một cấu hình `LANGS`, có menu ngôn ngữ thả xuống, phông CJK của máy, và nút phát video lớn có hiệu ứng mời xem; vi/en ra HTML như cũ ngoài các chỗ cố ý đổi; ja/zh/ko để `published: false` cho tới phần 4.

**Architecture:** `website/src/langs.mjs` giữ mọi thông tin theo ngôn ngữ (mã, thẻ BCP 47, tiền tố, og:locale, tên bản ngữ, định dạng ngày). Chuỗi của các khối dùng chung (thẻ gói, sơ đồ dữ liệu, JSON-LD của app, nút video, nhãn bảng) dồn về `website/src/strings.mjs`, khóa theo ngôn ngữ. Thời lượng video đọc từ hộp `mvhd` của file MP4 (`website/src/build/mp4.mjs`). Nút phát video là `<button hidden>` mà `site.js` mới bật, nên tắt JS vẫn còn `<video controls>`.

**Tech Stack:** Node 24 thuần (ESM, `node:test`), CSS/JS thuần, Chrome không đầu qua `website/tools/browser/cdp.mjs` cho test trình duyệt.

**Spec:** `docs/superpowers/specs/2026-10-22-website-ja-zh-ko-design.md` (mục 2, 3, 4, 8).

**Quy ước cho người thực thi:**
- Worktree: `WT=/Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk`, nhánh `website-cjk`. Shell của Claude Code về lại thư mục chính sau mỗi lệnh: **mọi lệnh bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website &&`** (hay `…/website-cjk &&` khi chạy ở gốc). Trước mỗi commit chạy `git branch --show-current` và phải thấy `website-cjk`.
- Không push, không merge, không `pnpm deploy`.
- Commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Chú thích trong mã viết tiếng Việt, đúng giọng các file xung quanh.

---

## Bản đồ file

| File | Việc |
|---|---|
| `website/src/langs.mjs` (mới) | `LANGS`, `LANG_CODES`, `PUBLISHED`, `CJK`, `VI_EN_ONLY`, `tagOf`, `homeOf`, `isHome`, `fromEn`, `formatDate` |
| `website/src/strings.mjs` (mới) | `S[lang]`: `plans`, `dataFlow`, `app`, `video`, `table` |
| `website/src/build/mp4.mjs` (mới) | `mp4DurationMs(buf)`, `videoMeta(lang)` |
| `website/src/plans.mjs` | `vnd`, `usd` theo năm ngôn ngữ; `summaryJa/Zh/Ko`; `planName`, `planSummary` |
| `website/src/site.mjs` | `T`, `NAV`, `FOOTER`, `RELEASE` thêm ja/zh/ko; bỏ `ogLocale`, `langName` khỏi `T` (đã ở `LANGS`) |
| `website/src/content/index.mjs` | nạp trang theo `PUBLISHED`, bỏ pháp lý cho ja/zh/ko, trang 404 có nút về trang chủ ja/zh/ko |
| `website/src/build/layout.mjs` | `lang`/hreflang theo thẻ, og:locale, menu ngôn ngữ, tác giả bài viết, liên kết trang chủ, nhãn bảng của `glue` |
| `website/src/build/schema.mjs` | `@id`/url theo tiền tố, `softwareApplication(lang, ctx)` đọc `S`, `videoObject` tự lấy thời lượng |
| `website/src/build/components.mjs` | `plansGrid`, `dataFlow` đọc `S`; `demoVideo` thêm nút phát |
| `website/src/build/build.mjs` | `ctx.langs`, sitemap hreflang theo thẻ, `_redirects` cho mọi trang chủ |
| `website/src/assets/site.css` | menu ngôn ngữ, phông CJK, nút phát video |
| `website/src/assets/site.js` | đóng menu ngôn ngữ khi bấm ra ngoài hay Esc, nút phát video và hiệu ứng mời |
| `website/src/serve.mjs` | kiểu `video/mp4` |
| `website/src/content/{vi,en}/home.mjs` | thời lượng video lấy từ `videoMeta` |
| `website/test/i18n.test.mjs` (mới) | test đơn vị: langs, ngày, giá, MP4, khung trang ja giả lập |
| `website/test/site.test.mjs` | tổng quát hóa cho năm ngôn ngữ |
| `website/test/video-facade.test.mjs` (mới) | test trình duyệt của nút phát |
| `website/test/layout-i18n.test.mjs` (mới) | test trình duyệt: menu ngôn ngữ, không tràn ngang ở trang chủ mọi ngôn ngữ đã mở |

---

### Task 0: Chuẩn bị và ảnh chụp đầu ra hiện tại

**Files:** không sửa file nào.

- [ ] **Step 1: Kiểm môi trường**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && node -v && git status --short | head
```
Expected: `website-cjk`, Node `v24.x` (≥ 24.21), không có thay đổi nào chưa commit.

- [ ] **Step 2: Chạy toàn bộ test website hiện có**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test "test/*.test.mjs" 2>&1 | tail -15
```
Expected: `# fail 0`. Nếu có test đỏ sẵn thì ghi lại tên, báo người giao việc, không sửa ở kế hoạch này.

- [ ] **Step 3: Dựng bản "trước" để so sánh ở Task 14**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && rm -rf ../target/website-cjk/before && WEBSITE_DIST=../target/website-cjk/before node src/build/build.mjs
```
Expected: `Đã sinh 50 trang vào ../target/website-cjk/before (…)`.

---

### Task 1: `langs.mjs`

**Files:**
- Create: `website/src/langs.mjs`
- Test: `website/test/i18n.test.mjs`

- [ ] **Step 1: Viết test hỏng**

Tạo `website/test/i18n.test.mjs`:

```js
// Test đơn vị cho phần nhiều ngôn ngữ của website (spec 2026-10-22-website-ja-zh-ko-design): cấu hình ngôn ngữ, định dạng ngày
// và giá, thời lượng MP4, khung trang của một ngôn ngữ chưa mở (trang giả, không dựng cả site).
//   node --test test/i18n.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGS, LANG_CODES, PUBLISHED, CJK, VI_EN_ONLY, tagOf, homeOf, isHome, fromEn, formatDate } from "../src/langs.mjs";

test("LANGS: năm ngôn ngữ, thẻ BCP 47 (tiếng Trung giản thể là zh-Hans), tiền tố, og:locale, tên bản ngữ", () => {
  assert.deepEqual(LANG_CODES, ["vi", "en", "ja", "zh", "ko"]);
  assert.deepEqual(LANG_CODES.map(tagOf), ["vi", "en", "ja", "zh-Hans", "ko"]);
  assert.deepEqual(LANG_CODES.map(homeOf), ["/", "/en/", "/ja/", "/zh/", "/ko/"]);
  assert.deepEqual(LANG_CODES.map((l) => LANGS[l].ogLocale), ["vi_VN", "en_US", "ja_JP", "zh_CN", "ko_KR"]);
  assert.deepEqual(LANG_CODES.map((l) => LANGS[l].name), ["Tiếng Việt", "English", "日本語", "中文", "한국어"]);
  assert.ok(PUBLISHED.includes("vi") && PUBLISHED.includes("en"));
  assert.deepEqual([...CJK], ["ja", "zh", "ko"]);
  assert.deepEqual([...VI_EN_ONLY], ["terms", "privacy"]);
});

test("isHome và fromEn", () => {
  for (const p of ["/", "/en/", "/ja/", "/zh/", "/ko/"]) assert.equal(isHome(p), true, p);
  for (const p of ["/en/pricing/", "/bang-gia/", "/ja/faq/"]) assert.equal(isHome(p), false, p);
  assert.equal(fromEn("/en/guide/quick-start/", "ja"), "/ja/guide/quick-start/");
  assert.equal(fromEn("/en/", "ko"), "/ko/");
  assert.throws(() => fromEn("/bang-gia/", "zh"), /không phải đường dẫn tiếng Anh/);
});

test("formatDate theo ngôn ngữ", () => {
  assert.equal(formatDate("2026-10-09", "vi"), "09/10/2026");
  assert.equal(formatDate("2026-10-09", "en"), "9 October 2026");
  assert.equal(formatDate("2026-10-09", "ja"), "2026年10月9日");
  assert.equal(formatDate("2026-10-09", "zh"), "2026年10月9日");
  assert.equal(formatDate("2026-10-09", "ko"), "2026년 10월 9일");
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | tail -5
```
Expected: FAIL, `Cannot find module '…/src/langs.mjs'`.

- [ ] **Step 3: Viết `website/src/langs.mjs`**

```js
// Ngôn ngữ của website (spec 2026-10-22-website-ja-zh-ko-design §2). Khóa là mã nội bộ (tên thư mục ở src/content/). Mỗi ngôn ngữ:
// thẻ BCP 47 cho `lang`, hreflang, inLanguage (tiếng Trung là chữ giản thể: zh-Hans), tiền tố đường dẫn, og:locale, tên bản ngữ
// (menu ngôn ngữ), mã ngắn (menu trên điện thoại), locale của Intl. `published: false`: chưa dựng trang của ngôn ngữ đó (đang
// dịch); bật khi đủ trang (kế hoạch 2026-10-22-website-ja-zh-ko-04).
export const LANGS = {
  vi: { tag: "vi", prefix: "/", ogLocale: "vi_VN", name: "Tiếng Việt", short: "VI", intl: "vi-VN", published: true },
  en: { tag: "en", prefix: "/en/", ogLocale: "en_US", name: "English", short: "EN", intl: "en-GB", published: true },
  ja: { tag: "ja", prefix: "/ja/", ogLocale: "ja_JP", name: "日本語", short: "JA", intl: "ja-JP", published: false },
  zh: { tag: "zh-Hans", prefix: "/zh/", ogLocale: "zh_CN", name: "中文", short: "ZH", intl: "zh-CN", published: false },
  ko: { tag: "ko", prefix: "/ko/", ogLocale: "ko_KR", name: "한국어", short: "KO", intl: "ko-KR", published: false },
};
export const LANG_CODES = Object.keys(LANGS);
/** Ngôn ngữ đang dựng trang, theo thứ tự của LANGS. */
export const PUBLISHED = LANG_CODES.filter((l) => LANGS[l].published);
/** Ngôn ngữ chữ Hán, kana, Hangul: ngưỡng SEO riêng và phông có sẵn của máy (spec §3, §5). */
export const CJK = new Set(["ja", "zh", "ko"]);
/** Trang chỉ có bản vi và en: văn bản pháp lý (ja/zh/ko dẫn sang bản tiếng Anh, spec §2). */
export const VI_EN_ONLY = new Set(["terms", "privacy"]);

export const tagOf = (lang) => LANGS[lang].tag;
export const homeOf = (lang) => LANGS[lang].prefix;
export const isHome = (urlPath) => LANG_CODES.some((l) => LANGS[l].prefix === urlPath);

/** Đường dẫn bản ja/zh/ko suy từ bản en: "/en/guide/quick-start/" → "/ja/guide/quick-start/". */
export function fromEn(enPath, lang) {
  if (!enPath.startsWith("/en/")) throw new Error(`không phải đường dẫn tiếng Anh: ${enPath}`);
  return LANGS[lang].prefix + enPath.slice("/en/".length);
}

/** Ngày cho người đọc: vi 09/10/2026, en 9 October 2026, ja/zh 2026年10月9日, ko 2026년 10월 9일. */
export function formatDate(iso, lang) {
  if (lang === "vi") return iso.split("-").reverse().join("/");
  const date = new Date(`${iso}T00:00:00Z`);
  if (lang === "en") return date.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  return new Intl.DateTimeFormat(LANGS[lang].intl, { dateStyle: "long", timeZone: "UTC" }).format(date);
}
```

- [ ] **Step 4: Chạy test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | tail -5
```
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/src/langs.mjs website/test/i18n.test.mjs && git commit -q -m "feat(website): cấu hình năm ngôn ngữ (langs.mjs)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Giá theo ngôn ngữ, tên và mô tả gói

**Files:**
- Modify: `website/src/plans.mjs`
- Test: `website/test/i18n.test.mjs`

- [ ] **Step 1: Thêm test hỏng** (cuối `website/test/i18n.test.mjs`; thêm import ở đầu file)

```js
import { PLANS, usd, vnd, planName, planSummary } from "../src/plans.mjs";

test("giá theo ngôn ngữ: VND và USD (ja/zh/ko viết US$ để không nhầm với yên, nhân dân tệ)", () => {
  assert.equal(vnd(50000, "vi"), "50.000 ₫");
  assert.equal(vnd(50000, "en"), "50,000 ₫");
  for (const l of ["ja", "zh", "ko"]) {
    assert.equal(vnd(269000, l), "269,000 ₫", l);
    assert.equal(usd(399, l), "US$3.99", l);
    assert.equal(usd(3999, l), "US$39.99", l);
  }
  assert.equal(usd(399, "vi"), "3,99 USD");
  assert.equal(usd(399, "en"), "$3.99");
  assert.equal(vnd(0, "ja"), "0 ₫");
});

test("tên gói: tiếng Việt dùng nameVi, mọi ngôn ngữ khác dùng tên tiếng Anh như app; mô tả gói có đủ năm ngôn ngữ", () => {
  const monthly = PLANS.find((p) => p.code === "monthly");
  assert.equal(planName(monthly, "vi"), monthly.nameVi);
  for (const l of ["en", "ja", "zh", "ko"]) assert.equal(planName(monthly, l), "Monthly");
  for (const p of PLANS) for (const l of ["vi", "en", "ja", "zh", "ko"]) assert.ok(planSummary(p, l)?.length > 5, `${p.code} ${l}`);
  assert.equal(planSummary(monthly, "en"), monthly.summaryEn);
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | grep -E "^not ok|planName|fail" | head
```
Expected: FAIL (`planName` không có, `usd(399, "ja")` ra `$3.99`).

- [ ] **Step 3: Sửa `website/src/plans.mjs`**

Thêm ba trường mô tả vào mỗi gói, ngay sau `summaryEn`:

```js
    summaryJa: "10 日間のお試し、1 日 30 分、1 台につき 1 回。",
    summaryZh: "试用 10 天，每天 30 分钟，每台设备一次。",
    summaryKo: "10일 체험, 하루 30분, 기기당 1회.",
```
(gói `free`)
```js
    summaryJa: "30 日ごとに 50 時間の翻訳、Pro 機能すべて。",
    summaryZh: "每 30 天 50 小时翻译，全部 Pro 功能。",
    summaryKo: "30일마다 50시간 번역, 모든 Pro 기능.",
```
(gói `monthly`)
```js
    summaryJa: "180 日間、30 日ごとに 100 時間の翻訳、Pro 機能すべて。",
    summaryZh: "180 天内每 30 天 100 小时翻译，全部 Pro 功能。",
    summaryKo: "180일 동안 30일마다 100시간 번역, 모든 Pro 기능.",
```
(gói `six_months`)
```js
    summaryJa: "365 日間、翻訳時間は無制限、Pro 機能すべて。",
    summaryZh: "365 天内翻译时长不限，全部 Pro 功能。",
    summaryKo: "365일 동안 번역 시간 무제한, 모든 Pro 기능.",
```
(gói `yearly`)

Thay hai hàm cuối file bằng:

```js
const NUMBER_LOCALE = { vi: "vi-VN", en: "en-US", ja: "ja-JP", zh: "zh-CN", ko: "ko-KR" };

export const vnd = (n, lang = "vi") => (n === 0 ? "0 ₫" : new Intl.NumberFormat(NUMBER_LOCALE[lang]).format(n) + " ₫");

/** Giá USD từ số cent, chưa gồm thuế: tiếng Việt "3,99 USD", tiếng Anh "$3.99", tiếng Nhật, Trung, Hàn "US$3.99" (không nhầm với yên, nhân dân tệ). */
export const usd = (cents, lang = "vi") => {
  const n = (cents / 100).toFixed(2);
  if (lang === "vi") return `${n.replace(".", ",")} USD`;
  return lang === "en" ? `$${n}` : `US$${n}`;
};

/** Tên gói như app hiện: tiếng Việt dùng nameVi, mọi ngôn ngữ khác dùng tên tiếng Anh (app ja/zh/ko cũng ghi "Monthly"…). */
export const planName = (plan, lang) => (lang === "vi" ? plan.nameVi : plan.nameEn);

/** Mô tả một câu của gói theo ngôn ngữ (summaryVi, summaryEn, summaryJa, summaryZh, summaryKo). */
export const planSummary = (plan, lang) => plan[`summary${lang[0].toUpperCase()}${lang.slice(1)}`];
```

- [ ] **Step 4: Chạy test đơn vị và test site**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs test/site.test.mjs 2>&1 | tail -4
```
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/src/plans.mjs website/test/i18n.test.mjs && git commit -q -m "feat(website): giá, tên và mô tả gói theo năm ngôn ngữ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Thời lượng video từ file MP4

**Files:**
- Create: `website/src/build/mp4.mjs`
- Test: `website/test/i18n.test.mjs`

- [ ] **Step 1: Thêm test hỏng** (cuối file; thêm import)

```js
import { mp4DurationMs, videoMeta } from "../src/build/mp4.mjs";

/** Một file MP4 tối giản: ftyp rồi moov chứa mvhd (phiên bản 0 hay 1) với timescale và duration cho trước. */
function fakeMp4({ version, timescale, duration }) {
  const box = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + body.length);
    head.write(type, 4, "latin1");
    return Buffer.concat([head, body]);
  };
  const mvhd = Buffer.alloc(version === 1 ? 112 : 100);
  mvhd[0] = version;
  if (version === 1) {
    mvhd.writeUInt32BE(timescale, 20);
    mvhd.writeBigUInt64BE(BigInt(duration), 24);
  } else {
    mvhd.writeUInt32BE(timescale, 12);
    mvhd.writeUInt32BE(duration, 16);
  }
  return Buffer.concat([box("ftyp", Buffer.from("isom0000", "latin1")), box("moov", box("mvhd", mvhd))]);
}

test("mp4DurationMs đọc hộp mvhd (phiên bản 0 và 1); thiếu moov hay mvhd thì báo lỗi", () => {
  assert.equal(mp4DurationMs(fakeMp4({ version: 0, timescale: 1000, duration: 40494 })), 40494);
  assert.equal(mp4DurationMs(fakeMp4({ version: 1, timescale: 90000, duration: 3486487 })), 38739);
  assert.throws(() => mp4DurationMs(Buffer.from("00000008ftyp", "latin1")), /moov/);
});

test("videoMeta: thời lượng thật của video vi và en (làm tròn giây), dạng m:ss và ISO 8601", () => {
  assert.deepEqual(videoMeta("vi"), { seconds: 40, clock: "0:40", iso: "PT40S" });
  assert.deepEqual(videoMeta("en"), { seconds: 39, clock: "0:39", iso: "PT39S" });
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | grep -E "^not ok|Cannot find" | head
```
Expected: FAIL, không thấy `mp4.mjs`.

- [ ] **Step 3: Viết `website/src/build/mp4.mjs`**

```js
// Thời lượng video demo đọc từ chính file MP4 (spec 2026-10-22-website-ja-zh-ko §4): nhãn "0:40" của nút phát, câu mô tả và
// `duration` của VideoObject không gõ tay, nên dựng lại video là số tự đúng. Không dùng thư viện: chỉ đọc hộp moov › mvhd.
import { readFileSync } from "node:fs";

/** Tìm hộp con `type` trong khoảng [start, end) của `buf`; trả { body, end } hay null. */
function findBox(buf, start, end, type) {
  for (let at = start; at + 8 <= end; ) {
    let size = buf.readUInt32BE(at);
    let head = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(at + 8));
      head = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < head) return null;
    if (buf.toString("latin1", at + 4, at + 8) === type) return { body: at + head, end: at + size };
    at += size;
  }
  return null;
}

/** Thời lượng (ms) ghi trong hộp mvhd của một file MP4. */
export function mp4DurationMs(buf) {
  const moov = findBox(buf, 0, buf.length, "moov");
  if (!moov) throw new Error("MP4 không có hộp moov");
  const mvhd = findBox(buf, moov.body, moov.end, "mvhd");
  if (!mvhd) throw new Error("MP4 không có hộp mvhd");
  const b = mvhd.body;
  const [timescale, duration] = buf[b] === 1 ? [buf.readUInt32BE(b + 20), Number(buf.readBigUInt64BE(b + 24))] : [buf.readUInt32BE(b + 12), buf.readUInt32BE(b + 16)];
  return Math.round((duration / timescale) * 1000);
}

/** Thời lượng video demo của ngôn ngữ `lang` (src/assets/video/ai-translator-demo.<lang>.mp4): số giây làm tròn, "m:ss", "PT…S". */
export function videoMeta(lang) {
  const ms = mp4DurationMs(readFileSync(new URL(`../assets/video/ai-translator-demo.${lang}.mp4`, import.meta.url)));
  const seconds = Math.round(ms / 1000);
  return { seconds, clock: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, iso: `PT${seconds}S` };
}
```

- [ ] **Step 4: Chạy test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | tail -4
```
Expected: `# fail 0`. Nếu `videoMeta("vi")` ra số khác 40 hay `"en"` khác 39: dừng, so với `ffprobe -show_entries format=duration` của file, báo lại (đừng sửa số kỳ vọng cho khớp).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/src/build/mp4.mjs website/test/i18n.test.mjs && git commit -q -m "feat(website): đọc thời lượng video demo từ hộp mvhd của MP4

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Chuỗi của khối dùng chung (`strings.mjs`)

**Files:**
- Create: `website/src/strings.mjs`
- Test: `website/test/i18n.test.mjs`

Chuỗi vi/en lấy **nguyên văn** từ mã hiện có (`plansGrid`, `dataFlow` trong `components.mjs`; `softwareApplication` trong `schema.mjs`; nhãn bảng trong `glue` của `layout.mjs`), để Task 7–9 thay mã mà HTML vi/en không đổi.

- [ ] **Step 1: Thêm test hỏng**

```js
import { S } from "../src/strings.mjs";

test("strings.mjs: mỗi ngôn ngữ có đủ khóa như bản en (cùng cấu trúc, không chuỗi rỗng)", () => {
  const shape = (v) => (typeof v === "function" ? "fn" : Array.isArray(v) ? v.map(shape) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v);
  const empty = (v, at) => (typeof v === "string" ? (v.trim() ? [] : [at]) : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => empty(x, `${at}.${k}`)) : []);
  for (const l of LANG_CODES) {
    assert.deepEqual(shape(S[l]), shape(S.en), `${l}: khác cấu trúc bản en`);
    assert.deepEqual(empty(S[l], l), []);
  }
  assert.equal(S.ja.plans.usd("US$3.99"), "またはカードで US$3.99");
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | grep -E "^not ok|Cannot find" | head -3
```
Expected: FAIL, không thấy `strings.mjs`.

- [ ] **Step 3: Viết `website/src/strings.mjs`**

```js
// Chuỗi của các khối dùng chung (thẻ gói, sơ đồ dữ liệu, JSON-LD của app, nút phát video, nhãn bảng) theo ngôn ngữ (spec
// 2026-10-22-website-ja-zh-ko §3). Chữ trong thân từng trang vẫn ở src/content/<ngôn ngữ>/. Chuỗi ja/zh/ko dùng đúng thuật ngữ của
// app (src/i18n/{ja,zh,ko}.ts): tên gói tiếng Anh, "カード" / "国际银行卡" / "카드" cho thẻ, xưng "你" ở tiếng Trung.
import { SITE } from "./site.mjs";

export const S = {
  vi: {
    plans: {
      free: "Miễn phí",
      best: "Tiết kiệm nhất",
      usd: (price) => `hoặc ${price} bằng thẻ quốc tế`,
      cards: {
        free: { for: "Dùng thử trước khi quyết định.", per: "Dùng thử 10 ngày · mỗi máy một lần", feats: ["Phụ đề dịch trực tiếp, đủ 5 ngôn ngữ", "30 phút mỗi ngày trong 10 ngày dùng thử", "Thanh phụ đề tùy chỉnh, phím tắt, sao chép bản chép lời"] },
        monthly: { for: "Cho người họp thường xuyên, dự án ngắn hạn.", per: "cho mỗi 30 ngày · trả trước", feats: ["50 giờ dịch cho mỗi chu kỳ 30 ngày", "Tính năng Pro: từ điển thuật ngữ, lịch sử, xuất TXT/SRT/Markdown", "Gia hạn khi cần, không tự động trừ tiền"] },
        six_months: { for: "Cho dự án nửa năm hoặc dùng đều đặn.", per: "cho 180 ngày · trả trước", feats: ["100 giờ dịch cho mỗi chu kỳ 30 ngày", "Đầy đủ tính năng Pro", "Trả một lần cho nửa năm, quy ra khoảng 44.800 ₫ mỗi tháng"] },
        yearly: { for: "Cho người dùng hằng ngày. Tiết kiệm nhất.", per: "cho 365 ngày · trả trước", feats: ["Không giới hạn thời lượng dịch trong 365 ngày", "Đầy đủ tính năng Pro", "Trả một lần cho cả năm, quy ra khoảng 41.700 ₫ mỗi tháng"] },
      },
    },
    dataFlow: {
      cloud: "Cách nhiều công cụ dịch qua cloud hoạt động", local: "AI Translator",
      you: "Máy bạn", audio: "âm thanh cuộc họp", net: "Internet", server: "Máy chủ nhà cung cấp", cloudAi: "cùng AI trên cloud",
      subs: "Phụ đề", backTo: "gửi về máy bạn", audioHere: "Âm thanh", onYour: "trên máy bạn", ai: "AI chạy trên máy bạn", models: "nhận dạng + dịch", screen: "Phụ đề", onScreen: "trên màn hình bạn",
      cloudNote: "Âm thanh cuộc họp rời khỏi máy bạn và được xử lý ở nơi bạn không kiểm soát.",
      localNote: "Không có chuyến đi nào lên cloud: âm thanh, bản chép lời và bản dịch ở lại trên máy bạn.",
    },
    app: {
      freeOffer: "Free (dùng thử 10 ngày)",
      cardNote: "Trả bằng thẻ quốc tế; giá chưa gồm thuế.",
      subCategory: "Dịch phụ đề cuộc họp trực tiếp",
      processor: "Apple Silicon (M1 trở lên) trên macOS; CPU x64 64-bit có AVX2 trên Windows",
      memory: "RAM tối thiểu 8 GB, khuyến nghị 16 GB",
      storage: "1,3 GB (gói model Nhẹ) hoặc 2,5 GB (gói model Chuẩn) cho model, cộng 1 GB trống khi tải",
      description: "App desktop hiện phụ đề dịch trực tiếp cho mọi âm thanh cuộc họp hoặc video trên máy tính; nhận dạng giọng nói và dịch chạy trên máy nên âm thanh không rời khỏi máy.",
      disambiguating: "AI Translator (aitranslator.vn), app phụ đề dịch cuộc họp chạy trên máy của Đỗ Tiến Phong; không liên quan tới các sản phẩm khác có tên tương tự.",
      shots: ["Thanh phụ đề của AI Translator hiện câu gốc và bản dịch", "Màn hình chính của AI Translator khi đang dịch"],
      featureList: SITE.featureListVi,
    },
    video: { cta: "Bấm để xem", sound: "có tiếng", play: "Phát video demo" },
    table: { col: "Tiêu chí", name: "Bảng dữ liệu" },
  },
  en: {
    plans: {
      free: "Free",
      best: "Best value",
      usd: (price) => `or ${price} by international card`,
      cards: {
        free: { for: "Try it before you decide.", per: "10-day trial · once per device", feats: ["Live translated subtitles in all 5 languages", "30 minutes per day during the 10-day trial", "Subtitle bar, shortcuts and copying the transcript"] },
        monthly: { for: "For regular meetings and short projects.", per: "per 30 days · prepaid", feats: ["50 hours of translation per 30-day cycle", "Pro features: glossary, history, TXT/SRT/Markdown export", "Renew when you need it, never charged automatically"] },
        six_months: { for: "For a half-year project or steady use.", per: "per 180 days · prepaid", feats: ["100 hours of translation per 30-day cycle", "All Pro features", "One payment for half a year, about 44,800 ₫ per month"] },
        yearly: { for: "For daily use. Best value.", per: "per 365 days · prepaid", feats: ["Unlimited translation time for 365 days", "All Pro features", "One payment for the whole year, about 41,700 ₫ per month"] },
      },
    },
    dataFlow: {
      cloud: "How many cloud translation tools work", local: "AI Translator",
      you: "Your computer", audio: "meeting audio", net: "Internet", server: "Provider server", cloudAi: "plus an AI on the cloud",
      subs: "Subtitles", backTo: "back to you", audioHere: "Audio", onYour: "on your computer", ai: "AI running on your computer", models: "recognition + translation", screen: "Subtitles", onScreen: "on your screen",
      cloudNote: "The meeting audio leaves your computer and is processed somewhere you do not control.",
      localNote: "No trip to the cloud: the audio, the transcript and the translation stay on your computer.",
    },
    app: {
      freeOffer: "Free trial (10 days)",
      cardNote: "Paid by international card; price excludes tax.",
      subCategory: "Real-time meeting translation and live captions",
      processor: "Apple Silicon (M1 or later) on macOS; 64-bit x64 CPU with AVX2 on Windows",
      memory: "8 GB RAM minimum, 16 GB recommended",
      storage: "1.3 GB (Lite pack) or 2.5 GB (Standard pack) for models, plus 1 GB free while downloading",
      description: "Desktop app that shows live translated subtitles for any meeting or video audio on your computer; speech recognition and translation run on-device, so audio never leaves your machine.",
      disambiguating: "AI Translator (aitranslator.vn), an on-device meeting subtitle translator by Đỗ Tiến Phong; not related to other products with similar names.",
      shots: ["The AI Translator subtitle bar showing the original sentence and its translation", "The AI Translator Home screen while translating"],
      featureList: SITE.featureListEn,
    },
    video: { cta: "Watch the demo", sound: "with sound", play: "Play the demo video" },
    table: { col: "Criteria", name: "Data table" },
  },
  ja: {
    plans: {
      free: "無料",
      best: "最もお得",
      usd: (price) => `またはカードで ${price}`,
      cards: {
        free: { for: "購入前にまずお試しください。", per: "10 日間のお試し · 1 台につき 1 回", feats: ["5 言語すべてでリアルタイム翻訳字幕", "10 日間のお試し期間中、1 日 30 分", "字幕バー、ショートカット、文字起こしのコピー"] },
        monthly: { for: "定期的な会議や短期のプロジェクトに。", per: "30 日ごと · 前払い", feats: ["30 日サイクルごとに 50 時間の翻訳", "Pro 機能：用語集、履歴、TXT/SRT/Markdown 書き出し", "必要なときに更新、自動で課金されることはありません"] },
        six_months: { for: "半年のプロジェクトや継続的な利用に。", per: "180 日間 · 前払い", feats: ["30 日サイクルごとに 100 時間の翻訳", "Pro 機能をすべて利用可能", "半年分を一括前払い、自動更新なし"] },
        yearly: { for: "毎日使う方に。最もお得です。", per: "365 日間 · 前払い", feats: ["365 日間、翻訳時間は無制限", "Pro 機能をすべて利用可能", "1 年分を一括前払い、自動更新なし"] },
      },
    },
    dataFlow: {
      cloud: "多くのクラウド翻訳ツールの仕組み", local: "AI Translator",
      you: "あなたのパソコン", audio: "会議の音声", net: "インターネット", server: "提供元のサーバー", cloudAi: "クラウド上の AI も",
      subs: "字幕", backTo: "あなたの元へ", audioHere: "音声", onYour: "あなたのパソコン上", ai: "パソコン上で動く AI", models: "音声認識 + 翻訳", screen: "字幕", onScreen: "あなたの画面に",
      cloudNote: "会議の音声があなたのパソコンを離れ、あなたが管理できない場所で処理されます。",
      localNote: "クラウドへの往復はありません。音声、文字起こし、翻訳はすべてあなたのパソコンに残ります。",
    },
    app: {
      freeOffer: "Free（10 日間の無料お試し）",
      cardNote: "カードでのお支払い。価格は税抜です。",
      subCategory: "会議のリアルタイム翻訳と字幕",
      processor: "macOS は Apple シリコン（M1 以降）、Windows は AVX2 対応の 64 ビット x64 CPU",
      memory: "RAM 8 GB 以上（16 GB 推奨）",
      storage: "モデル用に 1.3 GB（Lite モデルパック）または 2.5 GB（Standard モデルパック）、ダウンロード中はさらに 1 GB の空き容量",
      description: "パソコンで再生される会議や動画の音声に、リアルタイムの翻訳字幕を表示するデスクトップアプリ。音声認識と翻訳はデバイス上で動作するため、音声がパソコンの外に出ることはありません。",
      disambiguating: "AI Translator（aitranslator.vn）は Đỗ Tiến Phong が提供する、デバイス上で動く会議字幕翻訳アプリです。似た名前の他の製品とは関係ありません。",
      shots: ["原文と翻訳を表示する AI Translator の字幕バー", "翻訳中の AI Translator のホーム画面"],
      featureList: [
        "システム音声のリアルタイム翻訳字幕、5 言語（英語、中国語（中文）、日本語、韓国語（한국어）、ベトナム語（Tiếng Việt））",
        "音声認識と翻訳はデバイス上で動作し、音声がパソコンの外に出ない",
        "カスタマイズできるフローティング字幕バー：ドラッグ、サイズ変更、クリック透過ロック、文字サイズと色",
        "どの会議アプリ、ウェビナー、動画でも使え、ボットやプラグインは不要",
        "用語集、セッション履歴、TXT・SRT・Markdown 書き出し（有料プラン）",
        "グローバルショートカットと、メニューバー（macOS）またはシステムトレイ（Windows）のアイコン",
      ],
    },
    video: { cta: "デモを見る", sound: "音声あり", play: "デモ動画を再生" },
    table: { col: "項目", name: "データ表" },
  },
  zh: {
    plans: {
      free: "免费",
      best: "最划算",
      usd: (price) => `或用国际银行卡支付 ${price}`,
      cards: {
        free: { for: "先试用，再决定。", per: "试用 10 天 · 每台设备一次", feats: ["5 种语言的实时翻译字幕", "10 天试用期内每天 30 分钟", "字幕栏、快捷键和复制转录文本"] },
        monthly: { for: "适合经常开会和短期项目。", per: "每 30 天 · 预付", feats: ["每个 30 天周期 50 小时翻译", "Pro 功能：术语表、历史记录、TXT/SRT/Markdown 导出", "需要时再续费，绝不自动扣款"] },
        six_months: { for: "适合半年项目或长期使用。", per: "180 天 · 预付", feats: ["每个 30 天周期 100 小时翻译", "全部 Pro 功能", "一次预付半年，不自动续费"] },
        yearly: { for: "适合每天使用。最划算。", per: "365 天 · 预付", feats: ["365 天内翻译时长不限", "全部 Pro 功能", "一次预付一年，不自动续费"] },
      },
    },
    dataFlow: {
      cloud: "许多云端翻译工具的工作方式", local: "AI Translator",
      you: "你的电脑", audio: "会议音频", net: "互联网", server: "服务商的服务器", cloudAi: "以及云端 AI",
      subs: "字幕", backTo: "传回你的电脑", audioHere: "音频", onYour: "在你的电脑上", ai: "在你电脑上运行的 AI", models: "语音识别 + 翻译", screen: "字幕", onScreen: "显示在你的屏幕上",
      cloudNote: "会议音频离开你的电脑，在你无法控制的地方被处理。",
      localNote: "不经过云端：音频、转录文本和译文都留在你的电脑上。",
    },
    app: {
      freeOffer: "Free（免费试用 10 天）",
      cardNote: "使用国际银行卡支付；价格不含税。",
      subCategory: "会议实时翻译与字幕",
      processor: "macOS 需 Apple 芯片（M1 或更新）；Windows 需支持 AVX2 的 64 位 x64 CPU",
      memory: "内存至少 8 GB，建议 16 GB",
      storage: "模型需要 1.3 GB（Lite 模型包）或 2.5 GB（Standard 模型包），下载时另需 1 GB 可用空间",
      description: "为电脑上播放的任何会议或视频音频显示实时翻译字幕的桌面应用；语音识别和翻译都在设备上运行，音频不会离开你的电脑。",
      disambiguating: "AI Translator（aitranslator.vn）是 Đỗ Tiến Phong 开发的本地运行会议字幕翻译应用，与名称相似的其他产品无关。",
      shots: ["显示原句和译文的 AI Translator 字幕栏", "正在翻译时的 AI Translator 主页"],
      featureList: [
        "为系统音频提供实时翻译字幕，支持 5 种语言（英语、中文、日语（日本語）、韩语（한국어）、越南语（Tiếng Việt））",
        "语音识别和翻译在设备上运行，音频不会离开电脑",
        "可自定义的悬浮字幕栏：拖动、调整大小、点击穿透锁定、字号和颜色",
        "适用于任何会议应用、网络研讨会和视频，无需机器人或插件",
        "术语表、会话历史、TXT/SRT/Markdown 导出（付费套餐）",
        "全局快捷键，以及菜单栏（macOS）或系统托盘（Windows）图标",
      ],
    },
    video: { cta: "观看演示", sound: "有声音", play: "播放演示视频" },
    table: { col: "项目", name: "数据表" },
  },
  ko: {
    plans: {
      free: "무료",
      best: "가장 경제적",
      usd: (price) => `또는 카드로 ${price}`,
      cards: {
        free: { for: "결정하기 전에 먼저 써 보세요.", per: "10일 체험 · 기기당 1회", feats: ["5개 언어 모두 실시간 번역 자막", "10일 체험 기간 동안 하루 30분", "자막 바, 단축키, 받아쓰기 복사"] },
        monthly: { for: "정기적인 회의와 단기 프로젝트에.", per: "30일마다 · 선불", feats: ["30일 주기마다 50시간 번역", "Pro 기능: 용어집, 기록, TXT/SRT/Markdown 내보내기", "필요할 때 갱신, 자동 결제 없음"] },
        six_months: { for: "반년 프로젝트나 꾸준한 사용에.", per: "180일 · 선불", feats: ["30일 주기마다 100시간 번역", "모든 Pro 기능", "반년치를 한 번에 선불, 자동 갱신 없음"] },
        yearly: { for: "매일 쓰는 분께. 가장 경제적입니다.", per: "365일 · 선불", feats: ["365일 동안 번역 시간 무제한", "모든 Pro 기능", "1년치를 한 번에 선불, 자동 갱신 없음"] },
      },
    },
    dataFlow: {
      cloud: "많은 클라우드 번역 도구의 작동 방식", local: "AI Translator",
      you: "내 컴퓨터", audio: "회의 음성", net: "인터넷", server: "제공업체 서버", cloudAi: "클라우드 AI 포함",
      subs: "자막", backTo: "내 컴퓨터로 전송", audioHere: "음성", onYour: "내 컴퓨터에서", ai: "내 컴퓨터에서 실행되는 AI", models: "음성 인식 + 번역", screen: "자막", onScreen: "내 화면에",
      cloudNote: "회의 음성이 내 컴퓨터를 떠나, 내가 통제할 수 없는 곳에서 처리됩니다.",
      localNote: "클라우드를 거치지 않습니다. 음성, 받아쓰기, 번역이 모두 내 컴퓨터에 남습니다.",
    },
    app: {
      freeOffer: "Free(10일 무료 체험)",
      cardNote: "카드로 결제하며, 가격은 세금 별도입니다.",
      subCategory: "회의 실시간 번역과 자막",
      processor: "macOS는 Apple 실리콘(M1 이상), Windows는 AVX2를 지원하는 64비트 x64 CPU",
      memory: "RAM 최소 8GB, 권장 16GB",
      storage: "모델용 1.3GB(Lite 모델 팩) 또는 2.5GB(Standard 모델 팩), 다운로드 중에는 1GB 여유 공간이 더 필요",
      description: "컴퓨터에서 재생되는 회의나 동영상 음성에 실시간 번역 자막을 보여 주는 데스크톱 앱입니다. 음성 인식과 번역이 기기에서 실행되므로 음성이 컴퓨터 밖으로 나가지 않습니다.",
      disambiguating: "AI Translator(aitranslator.vn)는 Đỗ Tiến Phong이 만든 기기 내 실행 회의 자막 번역 앱이며, 이름이 비슷한 다른 제품과는 관련이 없습니다.",
      shots: ["원문과 번역을 보여 주는 AI Translator 자막 바", "번역 중인 AI Translator 홈 화면"],
      featureList: [
        "시스템 오디오의 실시간 번역 자막, 5개 언어(영어, 중국어(中文), 일본어(日本語), 한국어, 베트남어(Tiếng Việt))",
        "음성 인식과 번역이 기기에서 실행되어 음성이 컴퓨터 밖으로 나가지 않음",
        "사용자 지정 가능한 플로팅 자막 바: 끌기, 크기 조절, 클릭 통과 잠금, 글자 크기와 색상",
        "모든 회의 앱, 웨비나, 동영상에서 사용 가능, 봇이나 플러그인 불필요",
        "용어집, 세션 기록, TXT·SRT·Markdown 내보내기(유료 요금제)",
        "전역 단축키와 메뉴 막대(macOS) 또는 시스템 트레이(Windows) 아이콘",
      ],
    },
    video: { cta: "데모 보기", sound: "소리 있음", play: "데모 영상 재생" },
    table: { col: "항목", name: "데이터 표" },
  },
};
```

- [ ] **Step 4: Chạy test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | tail -4
```
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/src/strings.mjs website/test/i18n.test.mjs && git commit -q -m "feat(website): chuỗi khối dùng chung theo năm ngôn ngữ (strings.mjs)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Chuỗi khung trang ja/zh/ko trong `site.mjs`

**Files:**
- Modify: `website/src/site.mjs`

- [ ] **Step 1: Bỏ `ogLocale`, `langName` khỏi `T.vi` và `T.en`** (đã chuyển sang `LANGS`; Task 7 sửa `layout.mjs` đọc từ `LANGS`). Xóa bốn dòng:

```js
    ogLocale: "vi_VN",
    langName: "Tiếng Việt",
```
```js
    ogLocale: "en_US",
    langName: "English",
```

- [ ] **Step 2: Thêm `T.ja`, `T.zh`, `T.ko`** ngay sau khối `en: { … }` của `T`:

```js
  ja: {
    language: "言語",
    home: "ホーム",
    mainNav: "メインナビゲーション",
    menu: "メニューを開く",
    theme: "ライト/ダークを切り替え",
    skip: "本文へスキップ",
    cta: { label: "ダウンロード", href: "/ja/download/" },
    ogAlt: "AI Translator — 会議の音声をリアルタイムで翻訳字幕に。パソコン上で動作",
    footerAbout: "AI による翻訳字幕をあなたのパソコン上で生成します。会議のデータはクラウドに送りません。ボットもアカウントも広告もありません。",
    provider: "提供者",
    updated: "更新日",
    trademark: "Zoom、Microsoft Teams、Google Meet、Zalo などの製品名は各所有者に帰属します。AI Translator はこれらの企業と提携していません。",
  },
  zh: {
    language: "语言",
    home: "首页",
    mainNav: "主导航",
    menu: "打开菜单",
    theme: "切换浅色/深色",
    skip: "跳到主要内容",
    cta: { label: "下载", href: "/zh/download/" },
    ogAlt: "AI Translator — 在你的电脑上运行的会议实时翻译字幕",
    footerAbout: "由在你电脑上运行的 AI 生成翻译字幕，会议数据不会发送到云端。无需机器人，无需账号，没有广告。",
    provider: "提供方",
    updated: "更新于",
    trademark: "Zoom、Microsoft Teams、Google Meet、Zalo 等产品名称归各自所有者所有；AI Translator 与它们没有关联。",
  },
  ko: {
    language: "언어",
    home: "홈",
    mainNav: "주 메뉴",
    menu: "메뉴 열기",
    theme: "밝은/어두운 테마 전환",
    skip: "본문으로 건너뛰기",
    cta: { label: "다운로드", href: "/ko/download/" },
    ogAlt: "AI Translator — 내 컴퓨터에서 실행되는 회의 실시간 번역 자막",
    footerAbout: "내 컴퓨터에서 실행되는 AI로 번역 자막을 만듭니다. 회의 데이터는 클라우드로 보내지 않습니다. 봇, 계정, 광고가 없습니다.",
    provider: "제공자",
    updated: "업데이트",
    trademark: "Zoom, Microsoft Teams, Google Meet, Zalo 및 기타 제품 이름은 각 소유자의 자산이며, AI Translator는 이들과 제휴 관계가 없습니다.",
  },
```

- [ ] **Step 3: Thêm `NAV.ja`, `NAV.zh`, `NAV.ko`** ngay sau mảng `en: [ … ]` của `NAV`:

```js
  ja: [
    { label: "機能", href: "/ja/features/" },
    {
      label: "ソリューション",
      href: "/ja/solutions/",
      children: [
        { label: "Zoom・Teams・Meet の会議", href: "/ja/solutions/online-meeting-translation/", hint: "あらゆる会議アプリに翻訳字幕" },
        { label: "ウェビナーと動画", href: "/ja/solutions/webinar-and-video-translation/", hint: "外国語のコンテンツを理解する" },
      ],
    },
    {
      label: "ガイド",
      href: "/ja/guide/",
      children: [
        { label: "クイックスタート", href: "/ja/guide/quick-start/", hint: "インストールから最初の字幕まで" },
        { label: "すべてのガイド", href: "/ja/guide/", hint: "インストール、権限、ショートカット、トラブルシューティング" },
      ],
    },
    { label: "料金", href: "/ja/pricing/" },
    { label: "よくある質問", href: "/ja/faq/" },
  ],
  zh: [
    { label: "功能", href: "/zh/features/" },
    {
      label: "解决方案",
      href: "/zh/solutions/",
      children: [
        { label: "Zoom、Teams、Meet 会议", href: "/zh/solutions/online-meeting-translation/", hint: "为任何会议应用提供翻译字幕" },
        { label: "网络研讨会和视频", href: "/zh/solutions/webinar-and-video-translation/", hint: "看懂外语内容" },
      ],
    },
    {
      label: "使用指南",
      href: "/zh/guide/",
      children: [
        { label: "快速入门", href: "/zh/guide/quick-start/", hint: "从安装到第一条字幕" },
        { label: "全部指南", href: "/zh/guide/", hint: "安装、权限、快捷键、故障排除" },
      ],
    },
    { label: "价格", href: "/zh/pricing/" },
    { label: "常见问题", href: "/zh/faq/" },
  ],
  ko: [
    { label: "기능", href: "/ko/features/" },
    {
      label: "솔루션",
      href: "/ko/solutions/",
      children: [
        { label: "Zoom, Teams, Meet 회의", href: "/ko/solutions/online-meeting-translation/", hint: "모든 회의 앱에 번역 자막" },
        { label: "웨비나와 동영상", href: "/ko/solutions/webinar-and-video-translation/", hint: "외국어 콘텐츠 이해하기" },
      ],
    },
    {
      label: "가이드",
      href: "/ko/guide/",
      children: [
        { label: "빠른 시작", href: "/ko/guide/quick-start/", hint: "설치부터 첫 자막까지" },
        { label: "전체 가이드", href: "/ko/guide/", hint: "설치, 권한, 단축키, 문제 해결" },
      ],
    },
    { label: "요금", href: "/ko/pricing/" },
    { label: "자주 묻는 질문", href: "/ko/faq/" },
  ],
```

- [ ] **Step 4: Thêm `FOOTER.ja`, `FOOTER.zh`, `FOOTER.ko`** ngay sau mảng `en: [ … ]` của `FOOTER`. Hai liên kết pháp lý trỏ bản tiếng Anh (spec §2):

```js
  ja: [
    { title: "製品", links: [{ label: "機能", href: "/ja/features/" }, { label: "料金", href: "/ja/pricing/" }, { label: "ダウンロード", href: "/ja/download/" }, { label: "オフライン翻訳とクラウド翻訳", href: "/ja/compare/offline-vs-cloud-translation/" }] },
    { title: "ソリューション", links: [{ label: "Zoom・Teams・Meet の会議", href: "/ja/solutions/online-meeting-translation/" }, { label: "ウェビナーと動画", href: "/ja/solutions/webinar-and-video-translation/" }] },
    { title: "サポート", links: [{ label: "ユーザーガイド", href: "/ja/guide/" }, { label: "よくある質問", href: "/ja/faq/" }, { label: "トラブルシューティング", href: "/ja/guide/troubleshooting/" }, { label: "お問い合わせ", href: "/ja/contact/" }] },
    { title: "会社情報", links: [{ label: "AI Translator について", href: "/ja/about/" }, { label: "データとセキュリティ", href: "/ja/data-security/" }, { label: "利用規約（英語）", href: "/en/terms/" }, { label: "プライバシーポリシー（英語）", href: "/en/privacy/" }] },
  ],
  zh: [
    { title: "产品", links: [{ label: "功能", href: "/zh/features/" }, { label: "价格", href: "/zh/pricing/" }, { label: "下载", href: "/zh/download/" }, { label: "离线翻译与云端翻译", href: "/zh/compare/offline-vs-cloud-translation/" }] },
    { title: "解决方案", links: [{ label: "Zoom、Teams、Meet 会议", href: "/zh/solutions/online-meeting-translation/" }, { label: "网络研讨会和视频", href: "/zh/solutions/webinar-and-video-translation/" }] },
    { title: "支持", links: [{ label: "使用指南", href: "/zh/guide/" }, { label: "常见问题", href: "/zh/faq/" }, { label: "故障排除", href: "/zh/guide/troubleshooting/" }, { label: "联系我们", href: "/zh/contact/" }] },
    { title: "公司", links: [{ label: "关于 AI Translator", href: "/zh/about/" }, { label: "数据与安全", href: "/zh/data-security/" }, { label: "使用条款（英文）", href: "/en/terms/" }, { label: "隐私政策（英文）", href: "/en/privacy/" }] },
  ],
  ko: [
    { title: "제품", links: [{ label: "기능", href: "/ko/features/" }, { label: "요금", href: "/ko/pricing/" }, { label: "다운로드", href: "/ko/download/" }, { label: "오프라인 번역과 클라우드 번역", href: "/ko/compare/offline-vs-cloud-translation/" }] },
    { title: "솔루션", links: [{ label: "Zoom, Teams, Meet 회의", href: "/ko/solutions/online-meeting-translation/" }, { label: "웨비나와 동영상", href: "/ko/solutions/webinar-and-video-translation/" }] },
    { title: "지원", links: [{ label: "사용 가이드", href: "/ko/guide/" }, { label: "자주 묻는 질문", href: "/ko/faq/" }, { label: "문제 해결", href: "/ko/guide/troubleshooting/" }, { label: "문의하기", href: "/ko/contact/" }] },
    { title: "회사", links: [{ label: "AI Translator 소개", href: "/ko/about/" }, { label: "데이터와 보안", href: "/ko/data-security/" }, { label: "이용약관(영어)", href: "/en/terms/" }, { label: "개인정보 처리방침(영어)", href: "/en/privacy/" }] },
  ],
```

- [ ] **Step 5: `RELEASE` cho năm ngôn ngữ.** Thay khối cuối file (từ `// Dòng "phiên bản hiện tại"` tới hết) bằng:

```js
// Dòng "phiên bản hiện tại" dùng ở trang chủ, Tải xuống, Giới thiệu: sinh từ SITE để không lệch số phiên bản và ngày phát hành.
export const RELEASE = {
  vi: `Phiên bản ${SITE.version}, phát hành ${formatDate(SITE.releaseDate, "vi")} cho macOS và Windows`,
  en: `Version ${SITE.version}, released ${formatDate(SITE.releaseDate, "en")} for macOS and Windows`,
  ja: `バージョン ${SITE.version}（${formatDate(SITE.releaseDate, "ja")}リリース、macOS と Windows 向け）`,
  zh: `版本 ${SITE.version}，${formatDate(SITE.releaseDate, "zh")}发布，适用于 macOS 和 Windows`,
  ko: `버전 ${SITE.version}, ${formatDate(SITE.releaseDate, "ko")} 출시, macOS 및 Windows용`,
};
```
và thêm `import { formatDate } from "./langs.mjs";` dưới dòng `import { resolveRelease } from "./release.mjs";`.

- [ ] **Step 6: Kiểm vi/en của `RELEASE` không đổi**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --input-type=module -e 'const { RELEASE } = await import("./src/site.mjs"); console.log(RELEASE.vi); console.log(RELEASE.en); console.log(RELEASE.ja)'
```
Expected: dòng vi dạng `Phiên bản 0.2.3, phát hành dd/mm/yyyy cho macOS và Windows`, en dạng `Version 0.2.3, released 22 October 2026 for macOS and Windows` (ngày theo commit nâng bản), ja dạng `バージョン 0.2.3（2026年10月22日リリース、macOS と Windows 向け）`.

Chưa commit: `layout.mjs` vẫn đọc `t.ogLocale` (sửa ở Task 7). Commit chung với Task 7.

---

### Task 6: Danh mục trang theo `PUBLISHED`

**Files:**
- Modify: `website/src/content/index.mjs`

- [ ] **Step 1: Nạp trang theo ngôn ngữ đã mở.** Thêm import dưới `import { SITE } from "../site.mjs";`:

```js
import { PUBLISHED, CJK, VI_EN_ONLY, homeOf, tagOf } from "../langs.mjs";
```
Sửa chú thích đầu file: thay `Cặp bản vi/en cùng \`id\`.` bằng `Các bản ngôn ngữ của một trang cùng \`id\` (ngôn ngữ đã mở trong langs.mjs; pháp lý chỉ có vi, en).`; thay `(vi/<tên>.mjs, en/<tên>.mjs)` ở chú thích của `FILE` bằng `(<ngôn ngữ>/<tên>.mjs)`.

Thay dòng `export const pages = …` bằng:

```js
// Pháp lý (VI_EN_ONLY) không có bản ja/zh/ko: các trang đó dẫn sang bản tiếng Anh (spec 2026-10-22-website-ja-zh-ko §2).
const langsFor = (id) => PUBLISHED.filter((lang) => !(VI_EN_ONLY.has(id) && CJK.has(lang)));
export const pages = (await Promise.all(IDS.flatMap((id) => langsFor(id).map((lang) => load(lang, id))))).filter(Boolean);
```

- [ ] **Step 2: Trang 404 có nút về trang chủ của ngôn ngữ ja/zh/ko đã mở.** Thêm trên `export const notFound`:

```js
const HOME_404 = { ja: "ホームに戻る", zh: "返回首页", ko: "홈으로 돌아가기" };
const cjkHomes = PUBLISHED.filter((l) => CJK.has(l))
  .map((l) => ` <a class="btn btn-secondary" href="${homeOf(l)}" lang="${tagOf(l)}">${HOME_404[l]}</a>`)
  .join("");
```
và trong `body` của `notFound`, thay `<a class="btn btn-secondary" href="/en/">Back to home</a></p>` bằng `<a class="btn btn-secondary" href="/en/">Back to home</a>${cjkHomes}</p>`.

- [ ] **Step 3: Kiểm số trang không đổi**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --input-type=module -e 'const { pages } = await import("./src/content/index.mjs"); console.log(pages.length, pages.slice(0, 4).map((p) => p.path).join(" "))'
```
Expected: `50 / /en/ /tinh-nang/ /en/features/`.

Chưa commit (chung với Task 7).

---

### Task 7: Khung trang (`layout.mjs`) nhiều ngôn ngữ và menu ngôn ngữ

**Files:**
- Modify: `website/src/build/layout.mjs`
- Test: `website/test/i18n.test.mjs`

- [ ] **Step 1: Thêm test hỏng** (dựng một trang ja giả với ctx tự tạo; không cần trang ja thật)

```js
import { renderPage, glue } from "../src/build/layout.mjs";

/** ctx tối giản cho renderPage: một nhóm trang "features" đủ năm ngôn ngữ. */
function fakeCtx() {
  const group = [
    { id: "features", lang: "vi", path: "/tinh-nang/" },
    { id: "features", lang: "en", path: "/en/features/" },
    { id: "features", lang: "ja", path: "/ja/features/" },
    { id: "features", lang: "zh", path: "/zh/features/" },
    { id: "features", lang: "ko", path: "/ko/features/" },
  ].map((p) => ({ ...p, title: "機能一覧のテストページ", description: "テスト用の説明文です。".repeat(4), body: "<h1>テスト</h1><p>本文</p>" }));
  const byId = new Map([["features", group]]);
  return { page: (lang) => group.find((p) => p.lang === lang), ctx: { pages: group, byId, assets: { css: "/a.css", js: "/a.js" }, langs: ["vi", "en", "ja", "zh", "ko"] } };
}

test("renderPage của trang tiếng Trung: lang zh-Hans, hreflang theo thẻ, og:locale, menu năm ngôn ngữ trỏ đúng trang, trang chủ /zh/", () => {
  const { page, ctx } = fakeCtx();
  const html = renderPage(page("zh"), ctx);
  assert.match(html, /^<!doctype html>\n<html lang="zh-Hans">/);
  for (const [tag, href] of [["vi", "/tinh-nang/"], ["en", "/en/features/"], ["ja", "/ja/features/"], ["zh-Hans", "/zh/features/"], ["ko", "/ko/features/"]]) {
    assert.ok(html.includes(`<link rel="alternate" hreflang="${tag}" href="https://aitranslator.vn${href}">`), `thiếu hreflang ${tag}`);
    assert.ok(html.includes(`<a href="${href}" hreflang="${tag}" lang="${tag}"`), `menu thiếu ${tag}`);
  }
  assert.ok(html.includes('<meta property="og:locale" content="zh_CN">'));
  assert.ok(html.includes('<meta property="og:locale:alternate" content="ja_JP">'));
  assert.ok(html.includes('<a href="/zh/features/" hreflang="zh-Hans" lang="zh-Hans" aria-current="true">中文</a>'));
  assert.ok(html.includes('<a class="brand" href="/zh/"'), "logo phải về /zh/");
  assert.ok(html.includes('<summary aria-label="语言: 中文">'));
  assert.ok(html.includes("<time datetime="), "dòng cập nhật ở chân trang");
});

test("glue: nhãn bảng theo ngôn ngữ", () => {
  const html = glue('<div class="table-wrap"><table><tr><th scope="col"></th></tr></table></div>', "ja");
  assert.ok(html.includes('aria-label="データ表 1"'));
  assert.ok(html.includes('<span class="sr-only">項目</span>'));
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | grep -E "^not ok" | head
```
Expected: hai test mới FAIL.

- [ ] **Step 3: Sửa `website/src/build/layout.mjs`**

3a. Import: thay dòng `import { SITE, T, NAV, FOOTER, ogFor } from "../site.mjs";` bằng:

```js
import { SITE, T, NAV, FOOTER, ogFor } from "../site.mjs";
import { LANGS, tagOf, homeOf, isHome, formatDate } from "../langs.mjs";
import { S } from "../strings.mjs";

export { formatDate };
```

3b. `alternates`: thay `hreflang="${p.lang}"` bằng `hreflang="${tagOf(p.lang)}"`.

3c. `head`:
- thay `page.path === "/" || page.path === "/en/" || page.title.includes(SITE.name)` bằng `isHome(page.path) || page.title.includes(SITE.name)`;
- thay `<meta property="og:locale" content="${t.ogLocale}">` bằng `<meta property="og:locale" content="${LANGS[page.lang].ogLocale}">`;
- thay `content="${T[p.lang].ogLocale}"` bằng `content="${LANGS[p.lang].ogLocale}"`;
- thay đoạn `content="${abs(T[page.lang] && page.lang === "en" ? "/en/about/" : "/ve-chung-toi/")}"` bằng `content="${abs((ctx.byId.get("about") ?? []).find((p) => p.lang === page.lang)?.path ?? "/ve-chung-toi/")}"`.

3d. Thay cả hàm `header` bằng:

```js
/** Menu ngôn ngữ (spec 2026-10-22-website-ja-zh-ko §3): <details> chạy cả khi tắt JS; mỗi mục trỏ bản cùng trang của ngôn ngữ đó,
 *  trang không có bản ấy (pháp lý) thì trỏ trang chủ của ngôn ngữ ấy. Chỉ liệt kê ngôn ngữ đang có trang (ctx.langs). */
function langMenu(page, ctx) {
  const t = T[page.lang];
  const pair = ctx.byId.get(page.id) ?? [];
  const cur = LANGS[page.lang];
  const items = (ctx.langs ?? [page.lang]).map((l) => {
    const href = pair.find((p) => p.lang === l)?.path ?? homeOf(l);
    return `<li><a href="${href}" hreflang="${tagOf(l)}" lang="${tagOf(l)}"${l === page.lang ? ' aria-current="true"' : ""}>${esc(LANGS[l].name)}</a></li>`;
  });
  return `<nav class="lang-switch" aria-label="${esc(t.language)}"><details class="lang-menu"><summary aria-label="${esc(`${t.language}: ${cur.name}`)}">${icon("globe")}<span class="lang-cur">${esc(cur.name)}</span><span class="lang-short">${cur.short}</span>${icon("chevron-down")}</summary><ul class="lang-pop">${items.join("")}</ul></details></nav>`;
}

function header(page, ctx) {
  const t = T[page.lang];
  return `<header class="site-header">
<div class="container">
<a class="brand" href="${homeOf(page.lang)}" aria-label="${SITE.name} — ${esc(t.home)}"><img src="/assets/img/logo.svg" width="34" height="34" alt="" decoding="async"><span>${SITE.name}</span></a>
<nav class="nav" aria-label="${esc(t.mainNav)}">${NAV[page.lang].map((i) => navItem(i, page)).join("")}</nav>
<div class="header-tools">
${langMenu(page, ctx)}
<button class="icon-btn theme-toggle" type="button" aria-label="${esc(t.theme)}" data-theme-toggle>${icon("moon")}</button>
<a class="btn btn-primary btn-sm header-cta" href="${t.cta.href}">${esc(t.cta.label)}</a>
<details class="mnav"><summary class="icon-btn nav-toggle" aria-label="${esc(t.menu)}">${icon("menu")}</summary>${mobileNav(page, t)}</details>
</div>
</div>
</header>`;
}
```

3e. Xóa hàm `formatDate` cũ cùng chú thích của nó (`/** Ngày hiển thị cho người đọc: … */` và thân hàm) — giờ lấy từ `langs.mjs` và được export lại ở 3a.

3f. `footer`: thay `href="${page.lang === "vi" ? "/" : "/en/"}"` bằng `href="${homeOf(page.lang)}"`.

3g. `glue`: thay dòng `const L = lang === "vi" ? { col: "Tiêu chí", table: "Bảng dữ liệu" } : { col: "Criteria", table: "Data table" };` bằng `const L = { col: S[lang].table.col, table: S[lang].table.name };`.

3h. `renderPage`: thay `<html lang="${page.lang}">` bằng `<html lang="${tagOf(page.lang)}">`.

- [ ] **Step 4: Chạy test đơn vị**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | tail -4
```
Expected: `# fail 0`. (`site.test.mjs` sẽ đỏ tới khi Task 9 thêm `ctx.langs`; chưa chạy ở đây.)

Chưa commit (chung với Task 9).

---

### Task 8: JSON-LD (`schema.mjs`) và khối dùng chung (`components.mjs`)

**Files:**
- Modify: `website/src/build/schema.mjs`
- Modify: `website/src/build/components.mjs`
- Modify: `website/src/content/vi/home.mjs`, `website/src/content/en/home.mjs`
- Test: `website/test/i18n.test.mjs`

- [ ] **Step 1: Thêm test hỏng**

```js
import { plansGrid, dataFlow, demoVideo } from "../src/build/components.mjs";
import { softwareApplication, videoObject } from "../src/build/schema.mjs";

test("plansGrid tiếng Nhật: tên gói tiếng Anh, giá VND, dòng thẻ US$, nút tới /ja/download/", () => {
  const html = plansGrid("ja", { ctaLabel: "ダウンロード" });
  assert.deepEqual([...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1]), ["Free", "Monthly", "6 Months", "Yearly"]);
  assert.ok(html.includes("<b>無料</b>") && html.includes("<b>50,000 ₫</b>"));
  assert.ok(html.includes('<p class="usd">またはカードで US$3.99</p>'));
  assert.equal((html.match(/href="\/ja\/download\/"/g) ?? []).length, 4);
});

test("dataFlow và softwareApplication đọc chuỗi theo ngôn ngữ; app nêu đủ năm ngôn ngữ giao diện", () => {
  assert.ok(dataFlow("ko").includes("내 컴퓨터에서 실행되는 AI"));
  const ctx = { byId: new Map([["pricing", [{ lang: "ja", path: "/ja/pricing/" }]], ["download", [{ lang: "ja", path: "/ja/download/" }]], ["guide", [{ lang: "ja", path: "/ja/guide/" }]]]) };
  const app = softwareApplication("ja", ctx);
  assert.equal(app["@id"], "https://aitranslator.vn/ja/#software");
  assert.equal(app.url, "https://aitranslator.vn/ja/");
  assert.equal(app.installUrl, "https://aitranslator.vn/ja/download/");
  assert.deepEqual(app.inLanguage, ["vi", "en", "ja", "zh-Hans", "ko"]);
  assert.ok(app.offers.some((o) => o.priceCurrency === "USD" && o.description.includes("税抜")));
  assert.equal(app.screenshot[0].url, "https://aitranslator.vn/assets/img/app/overlay-default.ja.webp");
});

test("videoObject tự lấy thời lượng từ file; demoVideo có nút phát ẩn sẵn kèm nhãn và thời lượng", () => {
  const v = videoObject({ lang: "vi", name: "x", description: "y", uploadDate: "2026-10-21" });
  assert.equal(v.duration, "PT40S");
  assert.equal(v["@id"], "https://aitranslator.vn/#demo-video");
  assert.equal(v.inLanguage, "vi");
  const html = demoVideo({ lang: "en", label: "Demo", fallback: "Download" });
  assert.match(html, /<figure class="shot video reveal" data-video>/);
  assert.match(html, /<video controls preload="none" playsinline width="1920" height="1200" poster="/);
  assert.match(html, /<button class="video-play" type="button" hidden aria-label="Play the demo video \(0:39, with sound\)">/);
  assert.ok(html.includes('<span class="video-play-label" aria-hidden="true">Watch the demo · 0:39 · with sound</span>'));
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | grep -E "^not ok" | head
```
Expected: ba test mới FAIL.

- [ ] **Step 3: Sửa `website/src/build/schema.mjs`**

3a. Import: thay `import { PLANS } from "../plans.mjs";` bằng:

```js
import { PLANS, planName, planSummary } from "../plans.mjs";
import { LANGS, LANG_CODES, tagOf } from "../langs.mjs";
import { S } from "../strings.mjs";
import { videoMeta } from "./mp4.mjs";
```

3b. Thay hai dòng `siteId`, `appId` (và chú thích ngay trên chúng giữ nguyên) bằng:

```js
// Gốc của từng ngôn ngữ: "https://aitranslator.vn/" (vi), "…/en/", "…/ja/"…
const base = (lang) => SITE.origin + LANGS[lang].prefix;
const siteId = (lang) => `${base(lang)}#website`;
const appId = (lang) => `${base(lang)}#software`;
```

3c. `website(lang)`: thay `url: SITE.origin + (lang === "en" ? "/en/" : "/"),` bằng `url: base(lang),` và `inLanguage: lang,` bằng `inLanguage: tagOf(lang),`.

3d. Thay cả hàm `softwareApplication` bằng:

```js
/** Ứng dụng: dùng cho trang chủ, tính năng, giá, tải xuống. Chỉ khai những gì có thật (không đánh giá, không giá giả). Chữ theo
 *  ngôn ngữ ở strings.mjs (S[lang].app); đường dẫn Bảng giá, Tải xuống, Hướng dẫn lấy từ danh mục trang (ctx). */
export function softwareApplication(lang, ctx) {
  const a = S[lang].app;
  const href = (id) => abs((ctx?.byId.get(id) ?? []).find((p) => p.lang === lang)?.path ?? LANGS[lang].prefix);
  const offers = PLANS.map((p) => ({
    "@type": "Offer",
    name: p.priceVnd === 0 ? a.freeOffer : planName(p, lang),
    price: String(p.priceVnd),
    priceCurrency: "VND",
    availability: "https://schema.org/InStock",
    eligibleDuration: { "@type": "QuantitativeValue", value: p.days, unitCode: "DAY" },
    description: planSummary(p, lang),
    url: href("pricing"),
  }));
  // Giá USD khi trả bằng thẻ quốc tế (spec 2026-10-14): mỗi gói trả phí thêm một Offer riêng loại tiền, chưa gồm thuế.
  const usdOffers = PLANS.filter((p) => p.priceUsdCents > 0).map((p) => ({
    "@type": "Offer",
    name: `${planName(p, lang)} (USD)`,
    price: (p.priceUsdCents / 100).toFixed(2),
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    eligibleDuration: { "@type": "QuantitativeValue", value: p.days, unitCode: "DAY" },
    description: `${planSummary(p, lang)} ${a.cardNote}`,
    url: href("pricing"),
  }));
  const shot = (name, caption) => ({ "@type": "ImageObject", url: abs(`/assets/img/app/${name}.${lang}.webp`), caption });
  return {
    "@type": "SoftwareApplication",
    "@id": appId(lang),
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: a.subCategory,
    operatingSystem: ["macOS 14.2+", "Windows 10", "Windows 11"],
    processorRequirements: a.processor,
    memoryRequirements: a.memory,
    storageRequirements: a.storage,
    softwareVersion: SITE.version,
    datePublished: SITE.releaseDate,
    description: a.description,
    disambiguatingDescription: a.disambiguating,
    url: base(lang),
    installUrl: href("download"),
    softwareHelp: href("guide"),
    // Ngôn ngữ giao diện của app (năm ngôn ngữ từ 0.1.8), không phải ngôn ngữ của website.
    inLanguage: LANG_CODES.map(tagOf),
    screenshot: [shot("overlay-default", a.shots[0]), shot("app-home-running", a.shots[1])],
    publisher: { "@id": ORG_ID },
    author: { "@id": PERSON_ID },
    offers: [...offers, ...usdOffers],
    featureList: a.featureList,
  };
}
```

3e. Thay cả hàm `videoObject` (và chú thích của nó) bằng:

```js
/** Video demo của trang chủ (spec 2026-10-21-website-demo-video; thời lượng đọc từ file MP4, spec 2026-10-22 §4). `uploadDate` dạng ngày. */
export function videoObject({ lang, name, description, uploadDate }) {
  const file = `/assets/video/ai-translator-demo.${lang}`;
  return {
    "@type": "VideoObject",
    "@id": `${base(lang)}#demo-video`,
    name,
    description,
    thumbnailUrl: abs(`${file}.webp`),
    contentUrl: abs(`${file}.mp4`),
    duration: videoMeta(lang).iso,
    uploadDate,
    inLanguage: tagOf(lang),
    publisher: { "@id": ORG_ID },
  };
}
```

3f. `graph`: thay `inLanguage: page.lang,` (hai chỗ: node WebPage và node bài viết) bằng `inLanguage: tagOf(page.lang),`; thay `if (page.software) nodes.push(softwareApplication(page.lang));` bằng `if (page.software) nodes.push(softwareApplication(page.lang, ctx));`.

- [ ] **Step 4: Sửa `website/src/build/components.mjs`**

4a. Import: thay `import { PLANS, usd, vnd } from "../plans.mjs";` bằng:

```js
import { PLANS, usd, vnd, planName } from "../plans.mjs";
import { T } from "../site.mjs";
import { S } from "../strings.mjs";
import { videoMeta } from "./mp4.mjs";
```

4b. Thay khối chú thích `/** Video demo của trang chủ … */` cùng hàm `demoVideo` ngay dưới nó (sau `appImg`) bằng:

```js
/**
 * Video demo của trang chủ (spec 2026-10-21-website-demo-video): file `ai-translator-demo.<lang>.{mp4,webp}` trong
 * src/assets/video/. `preload="none"`: chỉ tải khi người xem bấm phát; ảnh bìa là khung có phụ đề. `label` là tên đọc cho
 * trình đọc màn hình, `fallback` là chữ của liên kết tải MP4 khi trình duyệt không phát được video.
 * Nút phát lớn giữa khung (spec 2026-10-22-website-ja-zh-ko §4) mặc định `hidden`: site.js bật nó và tạm bỏ `controls`, nên khi
 * tắt JS vẫn là `<video controls>` như cũ. Thời lượng trên nhãn đọc từ file MP4.
 */
export const demoVideo = ({ lang, label, fallback }) => {
  const mp4 = hashed("video", `ai-translator-demo.${lang}.mp4`);
  const { clock } = videoMeta(lang);
  const v = S[lang].video;
  return `<figure class="shot video reveal" data-video>
<video controls preload="none" playsinline width="1920" height="1200" poster="${hashed("video", `ai-translator-demo.${lang}.webp`)}" aria-label="${esc(label)}">
<source src="${mp4}" type="video/mp4">
<a href="${mp4}">${esc(fallback)}</a>
</video>
<button class="video-play" type="button" hidden aria-label="${esc(`${v.play} (${clock}, ${v.sound})`)}"><span class="video-play-btn" aria-hidden="true">${icon("play")}</span><span class="video-play-label" aria-hidden="true">${esc(`${v.cta} · ${clock} · ${v.sound}`)}</span></button>
</figure>`;
};
```

4c. Thay cả hàm `plansGrid` bằng:

```js
/** Các gói giá (Free và ba gói trả phí). Chữ theo ngôn ngữ ở strings.mjs (S[lang].plans). Trả HTML của .plans. */
export function plansGrid(lang, { ctaLabel, freeLabel, featured = "yearly", detail = true } = {}) {
  const L = S[lang].plans;
  void detail;
  return `<div class="plans">${PLANS.map((p) => {
    const f = p.code === featured;
    const card = L.cards[p.code];
    const price = p.priceVnd === 0 ? L.free : vnd(p.priceVnd, lang);
    // Giá USD khi trả bằng thẻ quốc tế (spec 2026-10-14): chỉ gói trả phí; chưa gồm thuế (nói ở chú thích dưới lưới gói).
    const usdLine = p.priceUsdCents > 0 ? `<p class="usd">${esc(L.usd(usd(p.priceUsdCents, lang)))}</p>` : "";
    return `<div class="plan${f ? " featured" : ""} reveal">
${f ? `<span class="tag">${esc(L.best)}</span>` : ""}
<h3>${esc(planName(p, lang))}</h3>
<p class="for">${esc(card.for)}</p>
<div class="price"><b>${esc(price)}</b></div>
${usdLine}
<p class="per">${esc(card.per)}</p>
${checkList(card.feats.map(esc))}
<a class="btn ${f ? "btn-primary" : "btn-secondary"} btn-lg" href="${T[lang].cta.href}">${esc(p.priceVnd === 0 ? freeLabel ?? ctaLabel : ctaLabel)}</a>
</div>`;
  }).join("")}</div>`;
}
```

4d. Trong `dataFlow`, thay cả khối `const en = lang === "en"; const L = en ? { … } : { … };` bằng `const L = S[lang].dataFlow;`.

- [ ] **Step 5: Trang chủ vi và en lấy thời lượng từ file**

`website/src/content/vi/home.mjs`:
- thêm `import { videoMeta } from "../../build/mp4.mjs";` dưới dòng import `schema.mjs`;
- trong `VIDEO_TEXT`, thay `Video 40 giây, có tiếng.` bằng `Video ${videoMeta("vi").seconds} giây, có tiếng.` (đổi dấu nháy kép của chuỗi thành backtick);
- trong lời gọi `videoObject`, xóa `duration: "PT40S", `.

`website/src/content/en/home.mjs`:
- thêm `import { videoMeta } from "../../build/mp4.mjs";`;
- trong `VIDEO_TEXT`, thay `39-second video with sound.` bằng `${videoMeta("en").seconds}-second video with sound.` (chuỗi thành backtick);
- xóa `duration: "PT39S", `.

- [ ] **Step 6: Chạy test đơn vị**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | tail -4
```
Expected: `# fail 0`.

Chưa commit (chung với Task 9).

---

### Task 9: Bộ dựng (`build.mjs`) và commit phần mã dựng

**Files:**
- Modify: `website/src/build/build.mjs`
- Modify: `website/src/serve.mjs`

- [ ] **Step 1: Sửa `website/src/build/build.mjs`**

1a. Import: thêm dưới `import { PLANS, usd, vnd } from "../plans.mjs";`:

```js
import { LANG_CODES, PUBLISHED, tagOf, homeOf, isHome } from "../langs.mjs";
```
và sửa dòng chú thích thứ 3 của file: `// Đầu ra: HTML từng trang (VI ở gốc, EN ở /en/), …` thành `// Đầu ra: HTML từng trang (VI ở gốc, các ngôn ngữ khác ở /en/, /ja/, /zh/, /ko/; xem langs.mjs), …`.

1b. `sitemap`: thay `hreflang="${a.lang}"` bằng `hreflang="${tagOf(a.lang)}"`.

1c. Trong `build()`, thay `const ctx = { pages: list, byId, assets };` bằng:

```js
  // Ngôn ngữ đang có trang (menu ngôn ngữ chỉ liệt kê những ngôn ngữ này).
  const langs = LANG_CODES.filter((l) => list.some((p) => p.lang === l));
  const ctx = { pages: list, byId, assets, langs };
```

1d. `_redirects`: thay

```js
  const rules = list
    .filter((p) => p.path.endsWith("/") && p.path !== "/" && p.path !== "/en/")
    .map((p) => `${p.path.slice(0, -1)} ${p.path} 301`);
  await writeOut("_redirects", `${base.trimEnd()}\n\n# Sinh tự động từ danh mục trang (build.mjs)\n/en /en/ 301\n${rules.join("\n")}\n`);
```
bằng
```js
  const rules = list.filter((p) => p.path.endsWith("/") && !isHome(p.path)).map((p) => `${p.path.slice(0, -1)} ${p.path} 301`);
  const homes = PUBLISHED.filter((l) => homeOf(l) !== "/").map((l) => `${homeOf(l).slice(0, -1)} ${homeOf(l)} 301`);
  await writeOut("_redirects", `${base.trimEnd()}\n\n# Sinh tự động từ danh mục trang (build.mjs)\n${homes.join("\n")}\n${rules.join("\n")}\n`);
```

- [ ] **Step 2: `website/src/serve.mjs`** — trong `TYPES`, thêm `".mp4": "video/mp4",` sau `".ico": "image/x-icon",`.

- [ ] **Step 3: Dựng và chạy toàn bộ test (site.test.mjs chưa tổng quát hóa vẫn phải xanh vì chỉ có vi/en)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test "test/*.test.mjs" 2>&1 | tail -6
```
Expected: `# fail 0`. Nếu test cũ đỏ: đọc thông báo; lỗi do HTML vi/en đổi ngoài ý (khác menu ngôn ngữ, nút video, `inLanguage` của app) là lỗi của bước trên, sửa mã chứ không sửa test.

- [ ] **Step 4: Commit Task 5–9**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/src website/test/i18n.test.mjs && git commit -q -m "feat(website): dựng trang theo cấu hình năm ngôn ngữ, menu ngôn ngữ thả xuống, nút phát video

ja/zh/ko chưa mở (published: false). Chuỗi khung trang, thẻ gói, sơ đồ dữ liệu,
JSON-LD của app có đủ năm ngôn ngữ; thời lượng video đọc từ MP4.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: CSS — menu ngôn ngữ, phông CJK, nút phát video

**Files:**
- Modify: `website/src/assets/site.css`

- [ ] **Step 1: Phông CJK.** Chèn ngay sau dòng `img { height: auto; }` (mục Reset & base):

```css
/* Trang tiếng Nhật, Trung, Hàn (spec 2026-10-22-website-ja-zh-ko §3): Be Vietnam Pro không có chữ Hán, kana, Hangul nên chữ CJK
   dùng phông có sẵn của máy (không tải phông ngoài: CSP default-src 'self'); chữ Latin trong trang vẫn là Be Vietnam Pro. */
html:lang(ja) { --font: "Be Vietnam Pro", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", Meiryo, system-ui, sans-serif; line-break: strict; }
html:lang(zh-Hans) { --font: "Be Vietnam Pro", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif; line-break: strict; }
html:lang(ko) { --font: "Be Vietnam Pro", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif; word-break: keep-all; overflow-wrap: break-word; }
html:is(:lang(ja), :lang(zh-Hans), :lang(ko)) :is(h1, h2, h3, h4) { letter-spacing: 0; }
```

- [ ] **Step 2: Menu ngôn ngữ.** Thay bốn dòng `.lang-switch …` (từ `.lang-switch { display: inline-flex; …` tới `.lang-switch a:hover { … }`) bằng:

```css
.lang-switch { display: flex; }
.lang-menu { position: relative; }
.lang-menu summary { list-style: none; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface); color: var(--ink-2); font-size: .88rem; font-weight: 600; cursor: pointer; }
.lang-menu summary::-webkit-details-marker { display: none; }
.lang-menu summary:hover, .lang-menu[open] summary { background: var(--brand-soft); color: var(--brand-ink); }
.lang-menu summary .icon { width: 18px; height: 18px; }
.lang-menu summary .icon:last-child { width: 14px; height: 14px; }
.lang-short { display: none; }
@media (max-width: 639px) { .lang-cur { display: none; } .lang-short { display: inline; } }
.lang-pop { position: absolute; right: 0; top: calc(100% + 8px); z-index: 60; min-width: 180px; margin: 0; padding: 6px; list-style: none; display: grid; gap: 2px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow-md); }
.lang-pop a { display: block; padding: 10px 12px; border-radius: var(--r-sm); color: var(--ink-2); text-decoration: none; font-weight: 500; }
.lang-pop a:hover { background: var(--brand-soft); color: var(--brand-ink); }
.lang-pop a[aria-current="true"] { color: var(--brand-ink); font-weight: 700; }
```
và xóa dòng cuối file `.lang-switch a, .lang-switch span { padding: 10px 11px; }` (mục tiêu chạm của menu mới đã đủ 40 px).

- [ ] **Step 3: Nút phát video.** Chèn ngay sau dòng `.shot.video video { … }`:

```css
/* Nút phát lớn giữa khung (spec 2026-10-22-website-ja-zh-ko §4): phủ cả khung (bấm đâu cũng phát), site.js mới bật. Máy tính
   (`.can-invite`): nhãn ẩn, khi cuộn tới (`.is-inviting`) thì nhãn trượt lên và nút đập nhịp, vòng sáng lan ra ba lần. Màn hình
   khác và người bật giảm chuyển động: nút và nhãn hiện sẵn, đứng yên. */
.video-play { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; width: 100%; padding: 0; border: 0; background: linear-gradient(to bottom, transparent 45%, rgba(5, 8, 16, .38)); color: #fff; font: inherit; cursor: pointer; }
.video-play[hidden] { display: none; }
.video-play-btn { position: relative; display: grid; place-items: center; width: 96px; height: 96px; border-radius: 50%; background: var(--brand); color: #fff; box-shadow: 0 14px 40px -10px rgba(0, 0, 0, .6), 0 0 0 8px rgba(255, 255, 255, .16); transition: transform .2s var(--ease), background .2s; }
.video-play-btn .icon { width: 40px; height: 40px; margin-left: 6px; fill: currentColor; stroke: none; }
.video-play-btn::before, .video-play-btn::after { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 2px solid #fff; opacity: 0; pointer-events: none; }
.video-play:hover .video-play-btn { transform: scale(1.08); background: var(--brand-hover); }
.video-play:focus-visible { outline: none; }
.video-play:focus-visible .video-play-btn { outline: 3px solid #fff; outline-offset: 5px; }
.video-play-label { padding: 8px 16px; border-radius: 999px; background: rgba(8, 13, 24, .74); font-weight: 600; font-size: .95rem; line-height: 1.3; }
.can-invite .video-play-label { opacity: 0; transform: translateY(10px); transition: opacity .5s var(--ease), transform .5s var(--ease); }
.can-invite.is-inviting .video-play-label { opacity: 1; transform: none; }
.is-inviting .video-play-btn { animation: video-beat 1.6s var(--ease) 3; }
.is-inviting .video-play-btn::before { animation: video-ring 1.6s var(--ease) 3; }
.is-inviting .video-play-btn::after { animation: video-ring 1.6s var(--ease) .5s 3; }
@keyframes video-beat { 0%, 100% { transform: scale(1); } 15% { transform: scale(1.1); } 30% { transform: scale(1); } }
@keyframes video-ring { from { transform: scale(1); opacity: .7; } to { transform: scale(1.9); opacity: 0; } }
@media (max-width: 640px) {
  .video-play { gap: 12px; }
  .video-play-btn { width: 72px; height: 72px; }
  .video-play-btn .icon { width: 30px; height: 30px; margin-left: 4px; }
  .video-play-label { font-size: .85rem; padding: 6px 12px; }
}
```

Và đổi dòng `.shot.video { max-width: 1100px; … }` thêm `position: relative;` (`.shot` đã có `position: relative`; giữ nguyên nếu đã có — kiểm bằng `grep -n "^\.shot {" src/assets/site.css`, thấy `position: relative` thì bỏ qua).

- [ ] **Step 4: Dựng thử, không lỗi**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node src/build/build.mjs
```
Expected: `Đã sinh 50 trang …`.

Chưa commit (chung với Task 11).

---

### Task 11: `site.js` — menu ngôn ngữ và nút phát video

**Files:**
- Modify: `website/src/assets/site.js`
- Create: `website/test/video-facade.test.mjs`
- Create: `website/test/layout-i18n.test.mjs`

- [ ] **Step 1: Viết test trình duyệt (hỏng)** — `website/test/video-facade.test.mjs`:

```js
// Kiểm nút phát video demo của trang chủ (spec 2026-10-22-website-ja-zh-ko §4) bằng Chrome không đầu, qua tools/browser/cdp.mjs.
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

và `website/test/layout-i18n.test.mjs`:

```js
// Kiểm khung trang nhiều ngôn ngữ trong Chrome không đầu (spec 2026-10-22-website-ja-zh-ko §3, §8): menu ngôn ngữ mở, đóng (Esc,
// bấm ra ngoài), trỏ đúng trang; trang chủ mọi ngôn ngữ đã mở không tràn ngang ở 320, 375, 768, 1280 px, sáng và tối.
//   node --test test/layout-i18n.test.mjs        (không có Chrome: bỏ qua)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, launch } from "../tools/browser/cdp.mjs";
import { PUBLISHED, homeOf, tagOf, LANGS } from "../src/langs.mjs";

const skip = findChrome() ? false : "cần Google Chrome (hoặc biến CHROME)";
const DIST = mkdtempSync(join(tmpdir(), "i18n-dist-"));
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

test("menu ngôn ngữ: liệt kê đúng các ngôn ngữ đã mở, mục hiện tại có aria-current; mở rồi đóng bằng Esc và bấm ra ngoài", { skip }, async () => {
  const p = await browser.newPage({ width: 1280, height: 800 });
  await p.goto(base + "/en/pricing/");
  const items = await p.eval(`[...document.querySelectorAll(".lang-pop a")].map((a) => [a.getAttribute("hreflang"), a.getAttribute("href"), a.getAttribute("aria-current")])`);
  assert.deepEqual(items.map((i) => i[0]), PUBLISHED.map(tagOf));
  assert.deepEqual(items.find((i) => i[0] === "vi"), ["vi", "/bang-gia/", null]);
  assert.deepEqual(items.find((i) => i[0] === "en"), ["en", "/en/pricing/", "true"]);
  await p.click(".lang-menu summary");
  assert.equal(await p.eval(`document.querySelector(".lang-menu").open`), true);
  await p.press("Escape");
  assert.equal(await p.eval(`document.querySelector(".lang-menu").open`), false);
  await p.click(".lang-menu summary");
  await p.click("main h1");
  assert.equal(await p.eval(`document.querySelector(".lang-menu").open`), false);
  assert.deepEqual(p.errors, []);
  await p.close();
});

test("trang chủ mọi ngôn ngữ đã mở: không tràn ngang ở 320/375/768/1280 px, sáng và tối; menu ngôn ngữ nằm trong khung", { skip }, async () => {
  const errors = [];
  for (const lang of PUBLISHED) {
    for (const width of [320, 375, 768, 1280]) {
      for (const dark of [false, true]) {
        const p = await browser.newPage({ width, height: 900, mobile: width < 768, dark });
        await p.goto(base + homeOf(lang));
        await p.click(".lang-menu summary");
        await sleep(100);
        const r = await p.eval(`(() => { const pop = document.querySelector(".lang-pop").getBoundingClientRect(); return { scroll: document.documentElement.scrollWidth, inner: innerWidth, popLeft: pop.left, popRight: pop.right, lang: document.documentElement.lang }; })()`);
        if (r.scroll > r.inner) errors.push(`${lang} ${width}px ${dark ? "tối" : "sáng"}: tràn ngang ${r.scroll} > ${r.inner}`);
        if (r.popLeft < 0 || r.popRight > r.inner) errors.push(`${lang} ${width}px: menu ngôn ngữ ra ngoài khung (${r.popLeft}–${r.popRight})`);
        if (r.lang !== LANGS[lang].tag) errors.push(`${lang}: lang="${r.lang}"`);
        errors.push(...p.errors.map((e) => `${lang} ${width}px: ${e}`));
        await p.close();
      }
    }
  }
  assert.deepEqual(errors, []);
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/video-facade.test.mjs test/layout-i18n.test.mjs 2>&1 | grep -E "^(not )?ok" 
```
Expected: các test nút phát FAIL (chưa có mã JS: `facade` false, `controls` true); test menu FAIL ở bước Esc hay bấm ra ngoài (menu chưa được đóng).

- [ ] **Step 3: Sửa `website/src/assets/site.js`**

3a. Menu ngôn ngữ đóng như menu điều hướng: thay dòng `const menus = [...document.querySelectorAll(".nav details")];` bằng:

```js
  const menus = [...document.querySelectorAll(".nav details, .lang-menu")];
```
và sửa chú thích ngay trên thành `// Menu thả xuống (điều hướng, ngôn ngữ): đóng khi bấm ra ngoài hoặc nhấn Esc`.

3b. Nút phát video: chèn ngay trước dòng `// Hiện dần khi cuộn tới`:

```js
  // Video demo (spec 2026-10-22-website-ja-zh-ko §4): nút phát lớn giữa khung thay thanh điều khiển gốc cho tới khi bấm. Trên máy
  // tính (chuột, rộng từ 900 px, không giảm chuyển động), lần đầu hơn nửa khung vào màn hình thì nút đập nhịp mời xem, một lần.
  document.querySelectorAll("[data-video]").forEach((fig) => {
    const video = fig.querySelector("video");
    const btn = fig.querySelector(".video-play");
    if (!video || !btn) return;
    video.controls = false;
    btn.hidden = false;
    fig.classList.add("is-facade");
    btn.addEventListener("click", () => {
      fig.classList.remove("is-facade", "is-inviting");
      btn.hidden = true;
      video.controls = true;
      video.focus({ preventScroll: true });
      // Phát lỗi (mạng, trình duyệt chặn): thanh điều khiển gốc đã hiện, người xem bấm lại ở đó.
      video.play()?.catch(() => {});
    });
    const desktop = matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)").matches;
    if (!desktop || matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    fig.classList.add("can-invite");
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      fig.classList.add("is-inviting");
      io.disconnect();
    }, { threshold: 0.5 });
    io.observe(fig);
  });
```

- [ ] **Step 4: Chạy test trình duyệt**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/video-facade.test.mjs test/layout-i18n.test.mjs 2>&1 | tail -6
```
Expected: `# fail 0`. Nếu "video không phát" ở Chrome không đầu: kiểm `await p.eval('document.querySelector("[data-video] video").error?.code')`; mã 4 nghĩa là máy chủ thử trả sai kiểu (xem Task 9 Step 2), không phải lỗi của nút.

- [ ] **Step 5: Commit Task 10–11**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/src/assets website/test/video-facade.test.mjs website/test/layout-i18n.test.mjs && git commit -q -m "feat(website): giao diện menu ngôn ngữ, phông CJK, nút phát video đập nhịp khi cuộn tới

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Tổng quát hóa `site.test.mjs` cho năm ngôn ngữ

**Files:**
- Modify: `website/test/site.test.mjs`

- [ ] **Step 1: Import.** Thêm dưới dòng `import { PLANS, usd, vnd } from "../src/plans.mjs";`:

```js
import { LANG_CODES, PUBLISHED, CJK, VI_EN_ONLY, tagOf, homeOf, isHome } from "../src/langs.mjs";
import { videoMeta } from "../src/build/mp4.mjs";
```

- [ ] **Step 2: Ngưỡng title/description và `lang`.** Trong test `"mỗi trang có title, description, canonical, h1 duy nhất, lang đúng"`, thay hai dòng kiểm độ dài bằng:

```js
    // Chữ CJK rộng gần gấp đôi chữ Latin trên kết quả tìm kiếm (spec 2026-10-22-website-ja-zh-ko §5).
    const [tMin, tMax, dMin, dMax] = CJK.has(p.lang) ? [10, 40, 50, 120] : [15, 70, 90, 165];
    if (title.length < tMin || title.length > tMax) errors.push(`${p.path}: title ${title.length} ký tự: ${title}`);
    if (desc.length < dMin || desc.length > dMax) errors.push(`${p.path}: description ${desc.length} ký tự`);
```
và thay `<html lang="${p.lang}">` bằng `<html lang="${tagOf(p.lang)}">`.

- [ ] **Step 3: hreflang.** Thay cả test `"hreflang đối xứng: …"` bằng:

```js
test("hreflang đối xứng: A trỏ tới B thì B trỏ lại A, và có x-default; mỗi trang có đủ bản của các ngôn ngữ đã mở (pháp lý chỉ vi, en)", () => {
  const byId = new Map();
  for (const p of pages) byId.set(p.id, [...(byId.get(p.id) ?? []), p]);
  for (const [id, group] of byId) {
    const want = PUBLISHED.filter((l) => !(VI_EN_ONLY.has(id) && CJK.has(l)));
    if (process.env.ALLOW_PARTIAL === "1" && group.length < want.length) continue;
    assert.deepEqual(group.map((g) => g.lang).sort(), [...want].sort(), `${id}: cần đúng một bản cho mỗi ngôn ngữ ${want.join(", ")}`);
    for (const p of group) {
      const html = htmlByPath.get(p.path);
      for (const q of group) assert.ok(html.includes(`hreflang="${tagOf(q.lang)}" href="${SITE.origin}${q.path}"`), `${p.path} thiếu hreflang ${q.lang}`);
      assert.ok(html.includes('hreflang="x-default"'), `${p.path}: x-default`);
    }
  }
});
```

- [ ] **Step 4: Trang chủ không chỉ là `/` và `/en/`.**
- Test JSON-LD: thay `if (p.path !== "/" && p.path !== "/en/")` bằng `if (!isHome(p.path))`.
- Test `_redirects`: thay `assert.ok(dst === "/en/" || targets.has(dst), …)` bằng `assert.ok(isHome(dst) || targets.has(dst), \`đích không tồn tại: ${dst}\`)`; thay `x.path !== "/" && x.path !== "/en/"` bằng `!isHome(x.path)`.

- [ ] **Step 5: Thuế và công nghệ lõi ở chữ CJK.**
- Thay `const TAX_PHRASE = /chưa gồm thuế|excl\. tax|excluding tax|excludes? tax/i;` bằng:

```js
const TAX_PHRASE = /chưa gồm thuế|excl\. tax|excluding tax|excludes? tax|税抜|不含税|세금 별도/i;
```
- Cuối regex `CORE_TECH` (trước `/i;`), thêm `|ウィスパー|위스퍼|混元|テンセント|腾讯|騰訊|텐센트`.

- [ ] **Step 6: Test video cho mọi ngôn ngữ đã mở.** Trong test `"trang chủ có video demo đúng ngôn ngữ: …"`, thay vòng `for (const [urlPath, lang, other] of [["/", "vi", "en"], ["/en/", "en", "vi"]]) {` bằng:

```js
  for (const lang of PUBLISHED) {
    const urlPath = homeOf(lang);
```
thay dòng `assert.ok(!html.includes(\`ai-translator-demo.${other}.\`), …)` bằng:

```js
    for (const other of LANG_CODES.filter((l) => l !== lang)) assert.ok(!html.includes(`ai-translator-demo.${other}.`), `${urlPath}: lẫn video của ngôn ngữ ${other}`);
    const meta = videoMeta(lang);
    assert.ok(html.includes(`<button class="video-play" type="button" hidden aria-label="`), `${urlPath}: thiếu nút phát`);
    assert.ok(html.includes(` · ${meta.clock} · `), `${urlPath}: nhãn nút thiếu thời lượng ${meta.clock}`);
```
thay `assert.equal(video.inLanguage, lang);` bằng `assert.equal(video.inLanguage, tagOf(lang));` và `assert.match(video.duration, /^PT\d+S$/);` bằng `assert.equal(video.duration, meta.iso);`. Đổi tên test thành `"trang chủ mọi ngôn ngữ đã mở có video demo đúng ngôn ngữ: chỉ tải khi bấm phát, nút phát có thời lượng thật, có kích thước và ảnh bìa, file có trong dist và dưới 25 MiB, có VideoObject"`.

- [ ] **Step 7: Chạy toàn bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test "test/*.test.mjs" 2>&1 | tail -6
```
Expected: `# fail 0`.

- [ ] **Step 8: Thử một ngôn ngữ chưa dịch không lọt vào bản dựng** — tạm bật ja mà không có trang thì dựng phải hỏng rõ ràng:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && sed -i '' 's/ja: { tag: "ja", prefix: "\/ja\/", ogLocale: "ja_JP", name: "日本語", short: "JA", intl: "ja-JP", published: false }/ja: { tag: "ja", prefix: "\/ja\/", ogLocale: "ja_JP", name: "日本語", short: "JA", intl: "ja-JP", published: true }/' src/langs.mjs && node src/build/build.mjs 2>&1 | tail -2; git checkout src/langs.mjs
```
Expected: lỗi `Thiếu trang: ja/<tên>.mjs` (tên file nào cũng được: các trang nạp song song); sau `git checkout` file trở lại `published: false`.

- [ ] **Step 9: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/test/site.test.mjs && git commit -q -m "test(website): kiểm SEO, hreflang, video, thuế, công nghệ lõi cho mọi ngôn ngữ đã mở

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Đối chiếu HTML vi/en trước và sau

**Files:** không sửa file nào (trừ khi thấy khác ngoài ý).

- [ ] **Step 1: Dựng bản "sau"**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && rm -rf ../target/website-cjk/after && WEBSITE_DIST=../target/website-cjk/after node src/build/build.mjs
```

- [ ] **Step 2: So sánh sau khi gỡ các chỗ cố ý đổi** (menu ngôn ngữ, tên file CSS/JS băm, nút phát video và thuộc tính `data-video`, `inLanguage` của SoftwareApplication):

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/target/website-cjk && node -e '
const fs = require("fs"), path = require("path");
const norm = (s) => s
  .replace(/<nav class="lang-switch"[\s\S]*?<\/nav>/g, "<LANG>")
  .replace(/site\.[0-9a-f]{10}\.(css|js)/g, "site.HASH.$1")
  .replace(/\n<button class="video-play"[\s\S]*?<\/button>/g, "")
  .replace(/ data-video>/g, ">")
  .replace(/"inLanguage":\["vi","en"(,"ja","zh-Hans","ko")?\]/g, "\"inLanguage\":APP");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
let diff = 0;
for (const f of walk("before").filter((f) => f.endsWith(".html") || /sitemap|_redirects|llms/.test(f))) {
  const a = norm(fs.readFileSync(f, "utf8")), b = norm(fs.readFileSync(f.replace(/^before/, "after"), "utf8"));
  if (a !== b) { diff++; let i = 0; while (a[i] === b[i]) i++; console.log(f, "\n  trước:", a.slice(i - 60, i + 80), "\n  sau:  ", b.slice(i - 60, i + 80)); }
}
console.log(diff ? `${diff} file khác` : "vi/en không đổi ngoài các chỗ cố ý");
'
```
Expected: `vi/en không đổi ngoài các chỗ cố ý`. Có file khác: đọc đoạn in ra; đó là lỗi của Task 5–9 (ví dụ chuỗi `S` chép sai một chữ), sửa nguồn rồi chạy lại Step 1–2.

---

### Task 14: Ảnh cho chủ dự án xem

**Files:** không sửa file nào.

- [ ] **Step 1: Chụp trang chủ vi ở máy tính (lúc nút đang mời) và điện thoại, menu ngôn ngữ mở**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && mkdir -p ../target/website-cjk/shots && WEBSITE_DIST=../target/website-cjk/after node --input-type=module -e '
const { start } = await import("./src/serve.mjs");
const { launch } = await import("./tools/browser/cdp.mjs");
const server = await start(4199);
const b = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [name, o] of [["desktop", { width: 1280, height: 860 }], ["mobile", { width: 375, height: 812, mobile: true }]]) {
  for (const dark of [false, true]) {
    const p = await b.newPage({ ...o, dark });
    await p.goto("http://127.0.0.1:4199/");
    await p.eval(`document.querySelector("[data-video]").scrollIntoView({ block: "center", behavior: "instant" })`);
    await sleep(700);
    await p.screenshot(`../target/website-cjk/shots/video-${name}${dark ? "-dark" : ""}.png`);
    await p.eval("scrollTo(0, 0)");
    await p.click(".lang-menu summary");
    await sleep(200);
    await p.screenshot(`../target/website-cjk/shots/lang-menu-${name}${dark ? "-dark" : ""}.png`);
    await p.close();
  }
}
await b.close(); server.close();
'
ls ../target/website-cjk/shots
```
Expected: 8 file PNG.

- [ ] **Step 2: Xem từng ảnh** bằng công cụ Read (đọc ảnh). Kiểm: nút tròn ở giữa khung video, nhãn "Bấm để xem · 0:40 · có tiếng" dưới nút, chữ không bị cắt; menu ngôn ngữ thả xuống đọc được ở cả sáng và tối, không tràn khỏi màn hình 375 px. Có lỗi thì sửa CSS (Task 10), chạy lại test của Task 11 và chụp lại.

- [ ] **Step 3: Báo lại** cho người giao việc: đường dẫn tuyệt đối của 8 ảnh, kết quả `node --test "test/*.test.mjs"`, kết quả Task 13. Không push, không deploy.
