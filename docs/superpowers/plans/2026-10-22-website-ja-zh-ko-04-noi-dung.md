# Website ja/zh/ko, phần 4: nội dung tiếng Nhật, Trung, Hàn và mở ba ngôn ngữ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 23 trang × 3 ngôn ngữ (`website/src/content/{ja,zh,ko}/`) dịch từ bản tiếng Anh, giữ đúng khung và sự thật; có test đối chiếu khung, chặn chữ tiếng Anh sót và kiểm nhãn giao diện khớp app; rồi mở ba ngôn ngữ (`published: true`), cập nhật tài liệu và gửi ảnh trang cho chủ dự án duyệt.

**Architecture:** Mỗi trang ja/zh/ko là một module cùng dạng bản en (cùng `id`, đường dẫn `fromEn`). Trong lúc dịch, ngôn ngữ vẫn `published: false`; biến `WEBSITE_PREVIEW_LANGS` cho dựng và test cục bộ các trang đã dịch (lệnh deploy bỏ qua biến này). Test `website/test/i18n-content.test.mjs` so từng trang ja/zh/ko với bản en (heading, id, ảnh, liên kết, câu FAQ, giá), chặn câu tiếng Anh sót, và đối chiếu nhãn giao diện với từ điển của app (`src/i18n/*.ts`) qua `website/tools/i18n/labels.mjs`.

**Tech Stack:** Node 24 (`node:test`), bộ dựng website hiện có.

**Spec:** `docs/superpowers/specs/2026-10-22-website-ja-zh-ko-design.md` mục 5, 7 (nhúng video), 8, 9.

**Phụ thuộc:** phần 1 (hạ tầng), phần 2 (ảnh), phần 3 (video) đã xong. Test liên kết của site cần ảnh `*.{ja,zh,ko}.webp`, ảnh OG và video có thật.

**Quy ước cho người thực thi:**
- Worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk`, nhánh `website-cjk`. **Mọi lệnh bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`.** Trước commit chạy `git branch --show-current`, phải thấy `website-cjk`.
- Không push, không merge, không deploy. Commit kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Không sửa trang vi/en ở kế hoạch này (trừ khi test chỉ ra lỗi có sẵn: dừng và báo).

---

## Quy tắc dịch (đọc trước mọi task dịch)

### Cách tạo một trang
1. Mở `website/src/content/en/<tên>.mjs`, tạo `website/src/content/<ngôn ngữ>/<tên>.mjs` cùng tên file, cùng các `import` (đường dẫn import giữ nguyên, ví dụ `../../build/components.mjs`).
2. Đổi trường của trang:
   - `lang: "<ja|zh|ko>"`; `path`: bản en với `/en/` thay bằng `/<ngôn ngữ>/` (ví dụ `/en/guide/quick-start/` → `/ja/guide/quick-start/`; trang chủ `/en/` → `/ja/`).
   - `title`, `description` dịch; giữ `type`, `schemaType`, `software`, `published` như bản en; `modified: "2026-10-22"`.
   - **Bỏ** `llm`, `llmTitle` (chỉ dùng cho `llms.txt`, vốn chỉ có vi/en). Giữ `full` nếu bản en có.
   - `breadcrumbs`/`crumbs`: dịch `name`, đổi `path` như trên.
3. Đổi tham số ngôn ngữ của mọi khối: `appShot({ lang: "ja" … })`, `overlayShot`, `plansGrid("ja", …)`, `dataFlow("ja")`, `demoVideo({ lang: "ja" … })`, `videoObject({ lang: "ja" … })`, `RELEASE.ja`; ảnh `shot({ src })` có `.en.` trong tên thì đổi sang `.ja.`.
4. Liên kết nội bộ: `/en/…` → `/<ngôn ngữ>/…`, **trừ** `/en/terms/` và `/en/privacy/` (pháp lý chỉ có bản tiếng Anh): giữ nguyên đường dẫn và thêm sau chữ liên kết "（英語）" / "（英文）" / "(영어)". Liên kết tới `/install.sh`, `/install.ps1`, `/assets/…`, `mailto:`, `https://…` giữ nguyên.
5. Giữ nguyên: mọi `id="…"` và neo `#…` (trang khác trỏ tới chúng), class, cấu trúc thẻ, số h2/h3, thứ tự mục, `<kbd>`, nội dung `<code>`/`<pre>` và tham số `cmd` của `cmdBlock` (lệnh người dùng chép); dịch `copy`, `copied`, `label` của `cmdBlock`, nhãn của `osTabs`, `tocTitle`, nhãn `docNav`.
6. `{{updated}}` giữ nguyên (bộ dựng thay bằng ngày theo ngôn ngữ).
7. `legalVersionLine("eula.en.md")` / `legalVersionLine("privacy.en.md")` thay cho bản `.vi.md` nếu bản en dùng `.vi.md`; dòng này là tiếng Anh nên bọc `<span lang="en">…</span>`.
8. Câu tiếng Anh cố ý giữ (ví dụ câu mẫu tiếng Anh trên thanh phụ đề, tin nhắn mẫu, câu gốc của một ví dụ dịch): bọc `<span lang="en">…</span>`. Khối minh họa `demo({ … })` ở trang chủ: đổi sang chiều "EN → JA" (câu gốc tiếng Anh, bản dịch tiếng Nhật; tương tự zh, ko), `names` giữ như bản en.

### Văn phong và sự thật
- Mọi quy tắc của `website/README.md` áp nguyên: chỉ nói điều có thật, số đo kèm điều kiện đo (giữ đúng số, máy, ngày đo của bản en), **không** nêu tên model, engine, thư viện, khung app, ngôn ngữ lập trình, kiến trúc nội bộ; không cookie hay analytics. Không thêm ý, không bớt ý so với bản en.
- Tiếng Nhật: thể です・ます; giữa chữ Nhật và số hay chữ Latin có một khoảng trắng nửa độ rộng như app ("10 日間", "Pro 機能", "macOS 版"); dấu câu toàn độ rộng (、。「」（）).
- Tiếng Trung: chữ giản thể, xưng "你" như app; khoảng trắng giữa chữ Hán và số hay chữ Latin như app ("10 天", "Pro 功能"); dấu câu toàn độ rộng (，。：（）).
- Tiếng Hàn: thể 합니다; khoảng cách theo chính tả Hàn, số dính đơn vị như app ("10일", "30분", "50시간").
- Tên gói giữ tiếng Anh như app: Free, Monthly, 6 Months, Yearly; gói model: Lite, Standard, Fast.
- **Thanh toán:** cách chính cho khách nước ngoài là thẻ quốc tế bằng USD qua Creem; VietQR nói như bản en (cho người có tài khoản ngân hàng Việt Nam). Giá USD viết `US$3.99`, `US$21.99`, `US$39.99` và đoạn nào nêu giá USD phải có cụm thuế đúng chữ: ja **税抜**, zh **不含税**, ko **세금 별도**. Tên cách trả theo app: ja「カード」, zh「国际银行卡」, ko「카드」; VietQR giữ nguyên.
- **Hỗ trợ:** trang Liên hệ và Hỏi đáp nói rõ email hỗ trợ trả lời bằng tiếng Anh hoặc tiếng Việt, đúng chữ: ja **英語またはベトナム語**, zh **英语或越南语**, ko **영어 또는 베트남어** (test kiểm cụm này).
- **App đã thử:** giữ đúng danh sách của bản en (Zoom, Google Meet, Microsoft Teams, Zalo PC); không thêm LINE, WeChat, KakaoTalk.
- **Ngôn ngữ giao diện:** app có năm ngôn ngữ giao diện; ngôn ngữ dịch là năm ngôn ngữ như bản en.
- Ngày viết theo ngôn ngữ (ja/zh `2026年10月9日`, ko `2026년 10월 9일`).
- Tiêu đề trang tối đa 40 ký tự **kể cả** đuôi " | AI Translator" (16 ký tự) mà bộ dựng thêm khi tiêu đề chưa có tên sản phẩm; mô tả 50–120 ký tự; mô tả không trùng giữa các trang.
- Chữ `alt` của ảnh tả đúng ảnh ja/zh/ko (giao diện bằng ngôn ngữ đó), dùng đúng nhãn trên màn hình; mô tả trong `manifest.json` (phần 2) là nguồn tham khảo.

### Thuật ngữ
- **Nhãn giao diện của app** (chữ trong `<strong>` của bản en mà trùng một chuỗi của app): dùng **đúng từng chữ** của app ở ngôn ngữ đích. Bảng do `node tools/i18n/glossary.mjs <ngôn ngữ>` in ra (Task 2). Test kiểm.
- **Tên mục của macOS và Windows:** dùng bảng `OS_TERMS` trong `website/tools/i18n/glossary.mjs` (in kèm cuối bảng thuật ngữ). Các tên này theo hiểu biết, chưa đối chiếu trên máy thật (như giao diện app ja/zh/ko); thấy chỗ nào không chắc thì ghi vào báo cáo cuối task.

---

## Nhóm trang

| Nhóm | Trang (id = tên file) |
|---|---|
| A | `home`, `features`, `pricing` |
| B | `download`, `faq`, `about`, `contact` |
| C | `data-security`, `compare-offline-cloud`, `solutions`, `solutions-meetings`, `solutions-webinar` |
| D | `guide`, `guide-quick-start`, `guide-install-macos`, `guide-install-windows` |
| E | `guide-audio-permission`, `guide-subtitle-bar`, `guide-type-translate`, `guide-glossary` |
| F | `guide-history-export`, `guide-license`, `guide-troubleshooting` |

---

### Task 1: Xem trước ngôn ngữ đang dịch (`WEBSITE_PREVIEW_LANGS`)

**Files:**
- Modify: `website/src/langs.mjs`
- Test: `website/test/i18n.test.mjs`

- [ ] **Step 1: Viết test hỏng** (cuối `website/test/i18n.test.mjs`; thêm `import { execFileSync } from "node:child_process";` ở đầu):

```js
test("WEBSITE_PREVIEW_LANGS thêm ngôn ngữ đang dịch khi dựng cục bộ; lệnh deploy bỏ qua; mã lạ thì báo lỗi", () => {
  const run = (env, extra = []) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", 'const { PUBLISHED } = await import("./src/langs.mjs"); console.log(PUBLISHED.join(","))', "--", ...extra], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, ...env },
      encoding: "utf8",
    }).trim();
  const base = run({ WEBSITE_PREVIEW_LANGS: "" });
  assert.equal(run({ WEBSITE_PREVIEW_LANGS: "ja,ko" }), [...new Set([...base.split(","), "ja", "ko"])].filter((l) => LANG_CODES.includes(l)).sort((a, b) => LANG_CODES.indexOf(a) - LANG_CODES.indexOf(b)).join(","));
  assert.equal(run({ WEBSITE_PREVIEW_LANGS: "ja" }, ["--deploy"]), base);
  assert.throws(() => run({ WEBSITE_PREVIEW_LANGS: "fr" }), /ngôn ngữ lạ fr/);
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | grep -E "^not ok" | head -3
```
Expected: test mới FAIL.

- [ ] **Step 3: Sửa `website/src/langs.mjs`** — thay dòng `export const PUBLISHED = …` (và chú thích ngay trên) bằng:

```js
// Xem trước ngôn ngữ đang dịch: WEBSITE_PREVIEW_LANGS=ja,zh dựng thêm các ngôn ngữ đó khi dựng cục bộ và chạy test. Lệnh deploy
// (`build.mjs --deploy`) bỏ qua biến này, nên ngôn ngữ chưa mở không lọt lên mạng.
const preview = process.argv.includes("--deploy") ? [] : (process.env.WEBSITE_PREVIEW_LANGS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
for (const l of preview) if (!Object.hasOwn(LANGS, l)) throw new Error(`WEBSITE_PREVIEW_LANGS: ngôn ngữ lạ ${l}`);
/** Ngôn ngữ đang dựng trang, theo thứ tự của LANGS. */
export const PUBLISHED = LANG_CODES.filter((l) => LANGS[l].published || preview.includes(l));
```

- [ ] **Step 4: Chạy test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | tail -3
```
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/src/langs.mjs website/test/i18n.test.mjs && git commit -q -m "feat(website): xem trước ngôn ngữ đang dịch bằng WEBSITE_PREVIEW_LANGS (deploy bỏ qua)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Nhãn giao diện và bảng thuật ngữ

**Files:**
- Create: `website/tools/i18n/labels.mjs`, `website/tools/i18n/glossary.mjs`
- Test: `website/test/i18n.test.mjs`

- [ ] **Step 1: Viết test hỏng**

```js
import { readDict, strongLabels, appLabelsIn } from "../tools/i18n/labels.mjs";

test("labels: đọc từ điển của app, nhãn trong <strong> (tách theo ›), chỉ giữ nhãn có trong app", () => {
  const en = readDict("en");
  const ja = readDict("ja");
  assert.equal(en.get("nav.glossary"), "Glossary");
  assert.equal(ja.get("settings.group.compose"), "入力翻訳");
  assert.ok(![...en.values()].some((v) => v.includes("{")), "bỏ chuỗi có biến");
  assert.deepEqual(strongLabels('<main id="main"><p><strong>Settings › Type &amp; Translate</strong> và <strong>X</strong></p></main>'), ["Settings", "Type & Translate", "X"]);
  const got = appLabelsIn('<main id="main"><strong>Glossary</strong><strong>Monthly</strong><strong>Not an app label</strong></main>', en);
  assert.deepEqual(got, [{ en: "Glossary", keys: [...en].filter(([, v]) => v === "Glossary").map(([k]) => k) }]);
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | grep -E "^not ok|Cannot find" | head -3
```
Expected: FAIL, không thấy `labels.mjs`.

- [ ] **Step 3: Viết `website/tools/i18n/labels.mjs`**

```js
// Nhãn giao diện của app mà các trang website nhắc tới (kế hoạch 2026-10-22-website-ja-zh-ko-04): từ điển i18n của app
// (src/i18n/<ngôn ngữ>.ts) và các chuỗi trong <strong> của một trang. Dùng chung cho tools/i18n/glossary.mjs và test/i18n-content.test.mjs.
import { readFileSync } from "node:fs";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, k) => ENT[k]);

/** Từ điển giao diện của app: Map khóa → chuỗi. Bỏ chuỗi có biến ({lang}, {hotkey}…) vì không trích nguyên văn được. */
export function readDict(lang) {
  const src = readFileSync(new URL(`../../../src/i18n/${lang}.ts`, import.meta.url), "utf8");
  const dict = new Map();
  for (const m of src.matchAll(/^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)) {
    let value;
    try {
      value = JSON.parse(`"${m[2]}"`);
    } catch {
      continue;
    }
    if (!value.includes("{")) dict.set(m[1], value);
  }
  return dict;
}

/** Chuỗi trong <strong>…</strong> của phần thân trang (bỏ thẻ con, giải mã, gộp khoảng trắng), tách theo "›" của đường dẫn menu. */
export function strongLabels(html) {
  const main = /<main id="main">([\s\S]*)<\/main>/.exec(html)?.[1] ?? html;
  return [...main.matchAll(/<strong>([\s\S]*?)<\/strong>/g)]
    .flatMap((m) => decode(m[1].replace(/<[^>]+>/g, "")).split("›"))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Nhãn của app mà một trang en nhắc trong <strong>: [{ en, keys }] (một chuỗi en có thể ứng với nhiều khóa). Bỏ chuỗi ngắn hơn 3 ký tự và tên gói (giống nhau ở mọi ngôn ngữ). */
export function appLabelsIn(enHtml, enDict) {
  const byValue = new Map();
  for (const [k, v] of enDict) byValue.set(v, [...(byValue.get(v) ?? []), k]);
  const SKIP = new Set(["Free", "Monthly", "6 Months", "Yearly", "Pro", "Lite", "Standard", "Fast"]);
  const seen = new Set();
  const out = [];
  for (const label of strongLabels(enHtml)) {
    if (label.length < 3 || SKIP.has(label) || seen.has(label) || !byValue.has(label)) continue;
    seen.add(label);
    out.push({ en: label, keys: byValue.get(label) });
  }
  return out;
}
```

- [ ] **Step 4: Viết `website/tools/i18n/glossary.mjs`**

```js
// Bảng thuật ngữ cho người dịch website sang ja/zh/ko (kế hoạch 2026-10-22-website-ja-zh-ko-04): với từng trang en, các nhãn giao
// diện của app nhắc trong <strong> kèm chữ của app ở ngôn ngữ đích; cuối bảng là tên mục của macOS và Windows.
//   node tools/i18n/glossary.mjs ja > ../target/website-cjk/glossary.ja.md
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appLabelsIn, readDict } from "./labels.mjs";

/** Tên mục của hệ điều hành theo ngôn ngữ (theo hiểu biết, chưa đối chiếu trên máy thật). */
export const OS_TERMS = [
  ["System Settings (macOS)", { ja: "システム設定", zh: "系统设置", ko: "시스템 설정" }],
  ["Privacy & Security (macOS)", { ja: "プライバシーとセキュリティ", zh: "隐私与安全性", ko: "개인정보 보호 및 보안" }],
  ["Screen & System Audio Recording (macOS 15 trở lên)", { ja: "画面収録とシステムオーディオ録音", zh: "录屏与系统录音", ko: "화면 및 시스템 오디오 녹음" }],
  ["Accessibility (macOS)", { ja: "アクセシビリティ", zh: "辅助功能", ko: "손쉬운 사용" }],
  ["Microphone", { ja: "マイク", zh: "麦克风", ko: "마이크" }],
  ["Open Anyway (macOS)", { ja: "このまま開く", zh: "仍要打开", ko: "확인 없이 열기" }],
  ["Login Items (macOS)", { ja: "ログイン項目", zh: "登录项", ko: "로그인 항목" }],
  ["Applications (thư mục macOS)", { ja: "アプリケーション", zh: "应用程序", ko: "응용 프로그램" }],
  ["Terminal (macOS)", { ja: "ターミナル", zh: "终端", ko: "터미널" }],
  ["Keychain Access (macOS)", { ja: "キーチェーンアクセス", zh: "钥匙串访问", ko: "키체인 접근" }],
  ["menu bar (macOS)", { ja: "メニューバー", zh: "菜单栏", ko: "메뉴 막대" }],
  ["Settings (Windows)", { ja: "設定", zh: "设置", ko: "설정" }],
  ["Privacy & security (Windows)", { ja: "プライバシーとセキュリティ", zh: "隐私和安全性", ko: "개인 정보 및 보안" }],
  ["System › Sound (Windows)", { ja: "システム › サウンド", zh: "系统 › 声音", ko: "시스템 › 소리" }],
  ["More info / Run anyway (SmartScreen)", { ja: "詳細情報 / 実行", zh: "更多信息 / 仍要运行", ko: "추가 정보 / 실행" }],
  ["system tray (Windows)", { ja: "システムトレイ（通知領域）", zh: "系统托盘（通知区域）", ko: "시스템 트레이(알림 영역)" }],
  ["Start menu (Windows)", { ja: "スタートメニュー", zh: "开始菜单", ko: "시작 메뉴" }],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lang = process.argv[2];
  if (!["ja", "zh", "ko"].includes(lang)) throw new Error("cần ngôn ngữ ja, zh hoặc ko");
  const tmp = mkdtempSync(path.join(tmpdir(), "glossary-"));
  process.env.WEBSITE_DIST = tmp;
  const { build, DIST } = await import("../../src/build/build.mjs");
  await build();
  const { pages } = await import("../../src/content/index.mjs");
  const en = readDict("en");
  const target = readDict(lang);
  const lines = [`# Thuật ngữ ${lang} (sinh bởi tools/i18n/glossary.mjs; chữ của app phải dùng nguyên văn)`, ""];
  for (const p of pages.filter((x) => x.lang === "en")) {
    const html = readFileSync(path.join(DIST, p.path, "index.html"), "utf8");
    const labels = appLabelsIn(html, en);
    if (!labels.length) continue;
    lines.push(`## ${p.id}`, "", `| en | ${lang} | khóa |`, "|---|---|---|");
    for (const { en: label, keys } of labels) lines.push(`| ${label} | ${[...new Set(keys.map((k) => target.get(k)).filter(Boolean))].join(" / ")} | ${keys.join(", ")} |`);
    lines.push("");
  }
  lines.push("## Tên mục của macOS và Windows", "", `| en | ${lang} |`, "|---|---|");
  for (const [name, t] of OS_TERMS) lines.push(`| ${name} | ${t[lang]} |`);
  console.log(lines.join("\n"));
  rmSync(tmp, { recursive: true, force: true });
}
```

- [ ] **Step 5: Chạy test, sinh ba bảng thuật ngữ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n.test.mjs 2>&1 | tail -3 && mkdir -p ../target/website-cjk && for l in ja zh ko; do node tools/i18n/glossary.mjs $l > ../target/website-cjk/glossary.$l.md; done && wc -l ../target/website-cjk/glossary.*.md && head -30 ../target/website-cjk/glossary.ja.md
```
Expected: `# fail 0`; ba file vài trăm dòng; đầu file ja có bảng của các trang (ví dụ `| Type & Translate | 入力翻訳 | settings.group.compose … |`).

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/tools/i18n website/test/i18n.test.mjs && git commit -q -m "feat(website): công cụ nhãn giao diện và bảng thuật ngữ cho bản dịch ja/zh/ko

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Test nội dung ja/zh/ko (`i18n-content.test.mjs`)

**Files:**
- Create: `website/test/i18n-content.test.mjs`

Test chạy cho mọi trang ja/zh/ko đang dựng (đã mở hay xem trước bằng `WEBSITE_PREVIEW_LANGS`); chưa có trang nào thì các test tự đạt (không có gì để so).

- [ ] **Step 0: Test liên kết của `site.test.mjs` chịu được lúc dịch dở.** Khi xem trước một ngôn ngữ chưa dịch xong (`ALLOW_PARTIAL=1`), menu và chân trang của nó trỏ tới các trang chưa có. Trong `website/test/site.test.mjs`:
  - thêm `fromEn` vào dòng import từ `../src/langs.mjs`;
  - trong test `"liên kết nội bộ và neo (#) đều tồn tại"`, ngay sau dòng `const ids = new Map();` thêm:

```js
  // Đang dịch dở (ALLOW_PARTIAL=1): bỏ qua liên kết tới trang ja/zh/ko chưa dịch (module còn thiếu); mọi liên kết khác vẫn kiểm.
  const pending = new Set(
    process.env.ALLOW_PARTIAL === "1"
      ? missing.map((m) => {
          const [lang, file] = m.split("/");
          const en = pages.find((p) => p.lang === "en" && p.id === file.replace(/\.mjs$/, ""));
          return en && lang !== "vi" && lang !== "en" ? fromEn(en.path, lang) : null;
        }).filter(Boolean)
      : [],
  );
```
  - ngay sau dòng `if (t.startsWith("#")) continue;` thêm `if (pending.has(t)) continue;`.

  Chạy `node --test test/site.test.mjs` (không biến môi trường): phải `# fail 0`.

- [ ] **Step 1: Viết test**

```js
// Kiểm nội dung bản ja/zh/ko (spec 2026-10-22-website-ja-zh-ko §5, §8): cùng khung với bản en (heading, id, ảnh, liên kết, câu FAQ,
// giá), không sót câu tiếng Anh, nhãn giao diện trùng chữ của app, nói đúng ngôn ngữ của hỗ trợ.
//   WEBSITE_PREVIEW_LANGS=ja node --test test/i18n-content.test.mjs     (xem trước ngôn ngữ đang dịch)
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CJK, VI_EN_ONLY, fromEn } from "../src/langs.mjs";
import { PLANS } from "../src/plans.mjs";
import { appLabelsIn, readDict } from "../tools/i18n/labels.mjs";

process.env.WEBSITE_DIST ??= mkdtempSync(path.join(tmpdir(), "i18n-content-"));
const { build, DIST } = await import("../src/build/build.mjs");
const { pages } = await import("../src/content/index.mjs");

const html = new Map();
before(async () => {
  await build();
  for (const p of pages) html.set(p.path, readFileSync(path.join(DIST, p.path, "index.html"), "utf8"));
});

const cjkPages = pages.filter((p) => CJK.has(p.lang));
const enOf = (p) => pages.find((q) => q.id === p.id && q.lang === "en");
const mainOf = (h) => /<main id="main">([\s\S]*)<\/main>/.exec(h)?.[1] ?? "";
const plain = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
const count = (h, re) => (h.match(re) ?? []).length;
/** Đường dẫn của bản en đổi sang ngôn ngữ `lang`: /en/… → /<lang>/…, trừ pháp lý (giữ bản tiếng Anh). */
function mapHref(href, lang) {
  if (!href.startsWith("/en/")) return href;
  const [p, hash] = href.split("#");
  if ([...VI_EN_ONLY].some((id) => p === `/en/${id}/`)) return href;
  return fromEn(p, lang) + (hash !== undefined ? `#${hash}` : "");
}
// mailto: chỉ so địa chỉ (mẫu thư trong tham số đã dịch).
const hrefs = (h) => [...new Set([...mainOf(h).matchAll(/<a\b[^>]*?\shref="([^"]+)"/g)].map((m) => (m[1].startsWith("mailto:") ? m[1].replace(/\?.*/, "") : m[1])))].sort();
const imgs = (h) => [...new Set([...mainOf(h).matchAll(/<(?:img|source|video)\b[^>]*?\s(?:src|poster)="([^"?]+)/g)].map((m) => m[1]))].sort();
const ids = (h) => [...new Set([...mainOf(h).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))].sort();
const faqCount = (h) =>
  [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((m) => JSON.parse(m[1])["@graph"])
    .filter((n) => n["@type"] === "FAQPage")
    .reduce((s, n) => s + n.mainEntity.length, 0);
// Giá của gói nêu trong trang (VND và USD), chỉ các giá có trong plans.mjs (bỏ số "khoảng 44,800 ₫ mỗi tháng" của thẻ gói en).
const PLAN_VND = new Set(PLANS.map((p) => p.priceVnd).filter(Boolean));
const PLAN_USD = new Set(PLANS.map((p) => p.priceUsdCents).filter(Boolean));
function prices(h) {
  const t = plain(mainOf(h));
  const vnd = [...t.matchAll(/(\d{1,3}(?:[.,]\d{3})+)\s?₫/g)].map((m) => Number(m[1].replace(/[.,]/g, ""))).filter((n) => PLAN_VND.has(n));
  const usd = [...t.matchAll(/(?:US)?\$\s?(\d+)[.,](\d{2})|(\d+)[.,](\d{2})\s?USD/g)].map((m) => Number(`${m[1] ?? m[3]}${m[2] ?? m[4]}`)).filter((n) => PLAN_USD.has(n));
  return { vnd: [...new Set(vnd)].sort(), usd: [...new Set(usd)].sort() };
}

test("mỗi trang ja/zh/ko cùng khung với bản en: kiểu trang, số h2/h3, id, ảnh, liên kết, câu FAQ, giá", () => {
  const errors = [];
  for (const p of cjkPages) {
    const e = enOf(p);
    const a = html.get(p.path);
    const b = html.get(e.path);
    for (const k of ["type", "schemaType", "software", "published"]) if (p[k] !== e[k]) errors.push(`${p.path}: ${k} ${p[k]} ≠ ${e[k]}`);
    if (p.path !== fromEn(e.path, p.lang)) errors.push(`${p.path}: đường dẫn phải là ${fromEn(e.path, p.lang)}`);
    for (const tag of ["h2", "h3"]) {
      const re = new RegExp(`<${tag}[ >]`, "g");
      if (count(mainOf(a), re) !== count(mainOf(b), re)) errors.push(`${p.path}: ${count(mainOf(a), re)} ${tag}, bản en ${count(mainOf(b), re)}`);
    }
    if (JSON.stringify(ids(a)) !== JSON.stringify(ids(b))) errors.push(`${p.path}: id khác bản en: ${ids(a).filter((x) => !ids(b).includes(x)).join(",")} | thiếu ${ids(b).filter((x) => !ids(a).includes(x)).join(",")}`);
    const wantImgs = imgs(b).map((s) => s.replace(/\.en\.(webp|mp4)$/, `.${p.lang}.$1`)).sort();
    if (JSON.stringify(imgs(a)) !== JSON.stringify(wantImgs)) errors.push(`${p.path}: ảnh khác bản en: ${imgs(a).filter((x) => !wantImgs.includes(x)).join(",")} | thiếu ${wantImgs.filter((x) => !imgs(a).includes(x)).join(",")}`);
    const wantHrefs = [...new Set(hrefs(b).map((h) => mapHref(h, p.lang)))].sort();
    if (JSON.stringify(hrefs(a)) !== JSON.stringify(wantHrefs)) errors.push(`${p.path}: liên kết khác bản en: thừa ${hrefs(a).filter((x) => !wantHrefs.includes(x)).join(",")} | thiếu ${wantHrefs.filter((x) => !hrefs(a).includes(x)).join(",")}`);
    if (faqCount(a) !== faqCount(b)) errors.push(`${p.path}: ${faqCount(a)} câu FAQ, bản en ${faqCount(b)}`);
    if (JSON.stringify(prices(a)) !== JSON.stringify(prices(b))) errors.push(`${p.path}: giá ${JSON.stringify(prices(a))}, bản en ${JSON.stringify(prices(b))}`);
  }
  assert.deepEqual(errors, []);
});

// Tên riêng nhiều chữ Latin được phép đứng liền nhau trong bản ja/zh/ko.
const NAMES = /AI Translator|Microsoft Teams|Google Meet|Zalo PC|Apple Silicon|Windows 10\/11|Smart App Control|Type & Translate/g;

test("bản ja/zh/ko không sót câu tiếng Anh (từ năm từ Latin liền nhau, ngoài code, kbd, khối minh họa và phần lang=\"en\")", () => {
  const errors = [];
  for (const p of cjkPages) {
    const body = mainOf(html.get(p.path))
      .replace(/<!--llm-skip-->[\s\S]*?<!--\/llm-skip-->/g, " ")
      .replace(/<(code|kbd|pre)\b[\s\S]*?<\/\1>/g, " ")
      .replace(/<([a-z]+)\b[^>]*\slang="en"[^>]*>[\s\S]*?<\/\1>/g, " ")
      .replace(/<a\b[^>]*href="mailto:[^"]*"[^>]*>[\s\S]*?<\/a>/g, " ");
    const text = plain(body).replace(NAMES, "×");
    for (const m of text.matchAll(/\b[A-Za-z][A-Za-z0-9'’.-]*(?:[ ,]+[A-Za-z][A-Za-z0-9'’.-]*){4,}/g)) errors.push(`${p.path}: "${m[0].slice(0, 80)}"`);
  }
  assert.deepEqual(errors, []);
});

test("nhãn giao diện mà bản en nhắc trong <strong> có mặt đúng chữ của app trong bản ja/zh/ko", () => {
  const en = readDict("en");
  const dicts = { ja: readDict("ja"), zh: readDict("zh"), ko: readDict("ko") };
  const errors = [];
  for (const p of cjkPages) {
    const text = plain(mainOf(html.get(p.path)));
    for (const { en: label, keys } of appLabelsIn(html.get(enOf(p).path), en)) {
      const want = [...new Set(keys.map((k) => dicts[p.lang].get(k)).filter(Boolean))];
      if (want.length && !want.some((w) => text.includes(w.replace(/\s+/g, " ")))) errors.push(`${p.path}: thiếu nhãn "${want.join(" / ")}" (en: ${label})`);
    }
  }
  assert.deepEqual(errors, []);
});

test("Liên hệ và Hỏi đáp bản ja/zh/ko nói hỗ trợ trả lời bằng tiếng Anh hoặc tiếng Việt", () => {
  const PHRASE = { ja: "英語またはベトナム語", zh: "英语或越南语", ko: "영어 또는 베트남어" };
  const errors = [];
  for (const p of cjkPages.filter((x) => x.id === "contact" || x.id === "faq")) {
    if (!plain(mainOf(html.get(p.path))).includes(PHRASE[p.lang])) errors.push(`${p.path}: thiếu "${PHRASE[p.lang]}"`);
  }
  assert.deepEqual(errors, []);
});
```

- [ ] **Step 2: Chạy (chưa có trang ja/zh/ko: test đạt vì không có gì để so)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/i18n-content.test.mjs 2>&1 | tail -3
```
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 3: Thử ca âm bằng một trang chép nguyên bản en** — tạo tạm `src/content/ja/contact.mjs` bằng cách chép bản en và chỉ đổi `lang`, `path`:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && mkdir -p src/content/ja && sed -e 's/lang: "en"/lang: "ja"/' -e 's#path: "/en/contact/"#path: "/ja/contact/"#' src/content/en/contact.mjs > src/content/ja/contact.mjs && WEBSITE_PREVIEW_LANGS=ja ALLOW_PARTIAL=1 node --test test/i18n-content.test.mjs 2>&1 | grep -E "^not ok|sót|thiếu \"英語" | head -5; rm src/content/ja/contact.mjs
```
Expected: test "không sót câu tiếng Anh" FAIL (có câu tiếng Anh), test "hỗ trợ trả lời" FAIL (thiếu "英語またはベトナム語"), test khung FAIL (liên kết `/en/…` chưa đổi). File tạm đã xóa.

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git status --short website/src/content && git add website/test/i18n-content.test.mjs website/test/site.test.mjs && git commit -q -m "test(website): bản ja/zh/ko cùng khung bản en, không sót tiếng Anh, nhãn khớp app, nói đúng ngôn ngữ hỗ trợ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: `git status --short website/src/content` không in gì (không còn file tạm).

---

### Task 4–21: Dịch theo nhóm

Mỗi task dịch **một nhóm trang cho một ngôn ngữ** theo "Quy tắc dịch" ở đầu kế hoạch. Thứ tự: ja A–F (Task 4–9), zh A–F (Task 10–15), ko A–F (Task 16–21). Các ngôn ngữ độc lập với nhau, có thể giao song song cho ba người thực thi (mỗi người một ngôn ngữ, cùng worktree nhưng khác thư mục `src/content/<ngôn ngữ>/`; commit lần lượt, không sửa file của nhau).

Các bước của một task (ví dụ Task 4 = ja, nhóm A; thay `ja` và danh sách trang theo bảng bên dưới):

- [ ] **Step 1: Đọc** bảng thuật ngữ `target/website-cjk/glossary.<ngôn ngữ>.md` (sinh ở Task 2; sinh lại nếu chưa có), phần của các trang trong nhóm, và "Quy tắc dịch".
- [ ] **Step 2: Tạo từng file** `website/src/content/<ngôn ngữ>/<tên>.mjs` của nhóm.
- [ ] **Step 3: Dựng và chạy test với ngôn ngữ đang dịch**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && WEBSITE_PREVIEW_LANGS=ja ALLOW_PARTIAL=1 node --test test/i18n-content.test.mjs test/site.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"
```
Expected: chỉ một test đỏ là `đủ trang (không thiếu module nào)` (báo các trang của nhóm sau, chưa dịch); ở nhóm cuối (F) thì `# fail 0`. Test khác đỏ: đọc thông báo, sửa trang của nhóm này (không nới test). Lỗi thường gặp: title quá 40 ký tự (nhớ đuôi " | AI Translator"), mô tả ngoài 50–120 ký tự, liên kết `/en/…` chưa đổi, quên đổi `lang` của `appShot`, giá USD thiếu cụm thuế, câu tiếng Anh chưa bọc `lang="en"`.
- [ ] **Step 4: Đọc lại trang đã dựng** bằng mắt cho một trang của nhóm: `sed -e 's/<[^>]*>/ /g' ../target/…` không cần; dùng lệnh sau rồi đọc chữ in ra, so ý với bản en đoạn nào nghi ngờ:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && WEBSITE_PREVIEW_LANGS=ja ALLOW_PARTIAL=1 WEBSITE_DIST=../target/website-cjk/preview node src/build/build.mjs >/dev/null && node -e 'const h = require("fs").readFileSync(process.argv[1], "utf8"); console.log(/<main id="main">([\s\S]*)<\/main>/.exec(h)[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").slice(0, 3000))' ../target/website-cjk/preview/ja/pricing/index.html
```
(đổi `ja/pricing` thành trang của nhóm). Kiểm: không còn chữ tiếng Anh ngoài ý, số và giá đúng, giọng văn thống nhất.
- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/src/content/ja && git commit -q -m "feat(website): bản tiếng Nhật nhóm A (trang chủ, tính năng, bảng giá)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(thông điệp theo ngôn ngữ và nhóm của task.)
- [ ] **Step 6: Báo lại** cho người giao việc: danh sách file đã tạo, kết quả test, tên mục hệ điều hành hay câu nào không chắc.

| Task | Ngôn ngữ | Nhóm | File (`website/src/content/<ngôn ngữ>/…`) | Thông điệp commit |
|---|---|---|---|---|
| 4 | ja | A | `home.mjs`, `features.mjs`, `pricing.mjs` | `feat(website): bản tiếng Nhật nhóm A (trang chủ, tính năng, bảng giá)` |
| 5 | ja | B | `download.mjs`, `faq.mjs`, `about.mjs`, `contact.mjs` | `feat(website): bản tiếng Nhật nhóm B (tải xuống, hỏi đáp, giới thiệu, liên hệ)` |
| 6 | ja | C | `data-security.mjs`, `compare-offline-cloud.mjs`, `solutions.mjs`, `solutions-meetings.mjs`, `solutions-webinar.mjs` | `feat(website): bản tiếng Nhật nhóm C (bảo mật, so sánh, giải pháp)` |
| 7 | ja | D | `guide.mjs`, `guide-quick-start.mjs`, `guide-install-macos.mjs`, `guide-install-windows.mjs` | `feat(website): bản tiếng Nhật nhóm D (mục lục hướng dẫn, bắt đầu nhanh, cài đặt)` |
| 8 | ja | E | `guide-audio-permission.mjs`, `guide-subtitle-bar.mjs`, `guide-type-translate.mjs`, `guide-glossary.mjs` | `feat(website): bản tiếng Nhật nhóm E (quyền âm thanh, thanh phụ đề, Gõ dịch, từ điển)` |
| 9 | ja | F | `guide-history-export.mjs`, `guide-license.mjs`, `guide-troubleshooting.mjs` | `feat(website): bản tiếng Nhật nhóm F (lịch sử, gói, khắc phục sự cố)` |
| 10 | zh | A | như Task 4 | `feat(website): bản tiếng Trung nhóm A (trang chủ, tính năng, bảng giá)` |
| 11 | zh | B | như Task 5 | `feat(website): bản tiếng Trung nhóm B (tải xuống, hỏi đáp, giới thiệu, liên hệ)` |
| 12 | zh | C | như Task 6 | `feat(website): bản tiếng Trung nhóm C (bảo mật, so sánh, giải pháp)` |
| 13 | zh | D | như Task 7 | `feat(website): bản tiếng Trung nhóm D (mục lục hướng dẫn, bắt đầu nhanh, cài đặt)` |
| 14 | zh | E | như Task 8 | `feat(website): bản tiếng Trung nhóm E (quyền âm thanh, thanh phụ đề, Gõ dịch, từ điển)` |
| 15 | zh | F | như Task 9 | `feat(website): bản tiếng Trung nhóm F (lịch sử, gói, khắc phục sự cố)` |
| 16 | ko | A | như Task 4 | `feat(website): bản tiếng Hàn nhóm A (trang chủ, tính năng, bảng giá)` |
| 17 | ko | B | như Task 5 | `feat(website): bản tiếng Hàn nhóm B (tải xuống, hỏi đáp, giới thiệu, liên hệ)` |
| 18 | ko | C | như Task 6 | `feat(website): bản tiếng Hàn nhóm C (bảo mật, so sánh, giải pháp)` |
| 19 | ko | D | như Task 7 | `feat(website): bản tiếng Hàn nhóm D (mục lục hướng dẫn, bắt đầu nhanh, cài đặt)` |
| 20 | ko | E | như Task 8 | `feat(website): bản tiếng Hàn nhóm E (quyền âm thanh, thanh phụ đề, Gõ dịch, từ điển)` |
| 21 | ko | F | như Task 9 | `feat(website): bản tiếng Hàn nhóm F (lịch sử, gói, khắc phục sự cố)` |

Ghi chú riêng cho trang chủ (nhóm A): mục video dùng `demoVideo({ lang: "<ngôn ngữ>", label, fallback })` và `videoObject({ lang: "<ngôn ngữ>", name, description, uploadDate: "2026-10-22" })`; `VIDEO_TEXT` tả đúng video của ngôn ngữ đó (đồng nghiệp nói tiếng Anh, phụ đề hiện bằng ngôn ngữ trang, rồi Gõ dịch đổi câu trả lời viết bằng ngôn ngữ trang sang tiếng Anh để gửi tin nhắn) và nêu thời lượng bằng `videoMeta("<ngôn ngữ>").seconds` (import từ `../../build/mp4.mjs`), không gõ số tay. Chữ `fallback` nêu dung lượng thật của file MP4 (đọc bằng `ls -la src/assets/video`), làm tròn MB như bản en.

---

### Task 22: Mở ba ngôn ngữ

**Files:**
- Modify: `website/src/langs.mjs`

- [ ] **Step 1: Đổi `published: false` thành `published: true`** ở ba dòng `ja`, `zh`, `ko` của `LANGS`; sửa chú thích đầu file bỏ câu "`published: false`: chưa dựng trang … (kế hoạch …-04)" thành "`published: false`: chưa dựng trang của ngôn ngữ đó (đang dịch); xem trước bằng WEBSITE_PREVIEW_LANGS.".

- [ ] **Step 2: Chạy toàn bộ test website** (gồm test trình duyệt: menu ngôn ngữ và tràn ngang ở cả năm trang chủ, nút phát video)

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test "test/*.test.mjs" 2>&1 | tail -6
```
Expected: `# fail 0`. Dựng ra `119` trang (`node src/build/build.mjs` in `Đã sinh 119 trang`: 25 × 2 + 23 × 3).

- [ ] **Step 3: Test bộ video và test app không bị ảnh hưởng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node --test scripts/demo-video/ 2>&1 | tail -2 && pnpm exec vitest run 2>&1 | tail -3
```
Expected: cả hai `fail 0`.

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/src/langs.mjs && git commit -q -m "feat(website): mở tiếng Nhật, Trung, Hàn (/ja/, /zh/, /ko/)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Tài liệu

**Files:**
- Modify: `website/README.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-22-website-ja-zh-ko-design.md`

- [ ] **Step 1: `website/README.md`**
- Câu mở đầu: thay `Website tĩnh hai ngôn ngữ (tiếng Việt ở \`/\`, tiếng Anh ở \`/en/\`)` bằng `Website tĩnh năm ngôn ngữ (tiếng Việt ở \`/\`, tiếng Anh ở \`/en/\`, tiếng Nhật \`/ja/\`, tiếng Trung giản thể \`/zh/\`, tiếng Hàn \`/ko/\`; Điều khoản và Chính sách chỉ có vi, en)` và thêm câu `Thiết kế phần ja/zh/ko: \`docs/superpowers/specs/2026-10-22-website-ja-zh-ko-design.md\`.`
- Bảng "Cấu trúc": thêm dòng `src/langs.mjs           ngôn ngữ (thẻ BCP 47, tiền tố, og:locale, tên bản ngữ, ngày), ngôn ngữ đã mở; WEBSITE_PREVIEW_LANGS xem trước ngôn ngữ đang dịch (deploy bỏ qua)`, dòng `src/strings.mjs         chữ của khối dùng chung theo ngôn ngữ (thẻ gói, sơ đồ dữ liệu, JSON-LD của app, nút phát video, nhãn bảng)`, dòng `tools/i18n/              nhãn giao diện của app và bảng thuật ngữ cho người dịch (glossary.mjs <ja|zh|ko>)`; sửa dòng `src/content/{vi,en}/` thành `src/content/{vi,en,ja,zh,ko}/`.
- Mục "Thêm một trang": bước 1 tạo đủ năm file (`vi`, `en`, `ja`, `zh`, `ko`; trang pháp lý chỉ `vi`, `en`); bước 3 ghi ngưỡng CJK (title ≤ 40 ký tự gồm đuôi " | AI Translator", description 50–120) và test `i18n-content.test.mjs`.
- Thêm mục mới **"Năm ngôn ngữ"** ngay sau "Thêm một trang":

```markdown
## Năm ngôn ngữ
- Bản ja/zh/ko dịch từ bản en, cùng khung (heading, id, ảnh, liên kết, câu FAQ, giá): `test/i18n-content.test.mjs` so từng trang, chặn câu tiếng Anh sót (câu tiếng Anh cố ý giữ thì bọc `lang="en"`) và kiểm nhãn giao diện trùng chữ của app (`src/i18n/*.ts`). **Sửa nội dung một trang vi/en thì sửa luôn ba bản ja/zh/ko**; test chỉ bắt lệch cấu trúc, không bắt lệch nghĩa.
- Quy tắc dịch (văn phong, khoảng trắng giữa chữ CJK và số, giá `US$` kèm 税抜 / 不含税 / 세금 별도, hỗ trợ trả lời bằng tiếng Anh hoặc tiếng Việt, tên mục hệ điều hành): `docs/superpowers/plans/2026-10-22-website-ja-zh-ko-04-noi-dung.md`, mục "Quy tắc dịch". Bản dịch do Claude viết, chưa có người bản ngữ duyệt.
- Pháp lý chỉ có vi, en: trang ja/zh/ko dẫn tới `/en/terms/`, `/en/privacy/` kèm chữ "(tiếng Anh)" của ngôn ngữ đó.
- Phông: trang ja/zh/ko dùng phông CJK có sẵn của máy (không tải phông ngoài).
- Thêm ngôn ngữ thứ sáu: một mục trong `LANGS` (`published: false`), chuỗi trong `site.mjs` (`T`, `NAV`, `FOOTER`, `RELEASE`), `strings.mjs`, `plans.mjs` (`summary…`, `vnd`/`usd`), ảnh (`shoot.mjs --lang=`, `tools/og/render.mjs`), video (`scripts/demo-video`), rồi dịch trang và đổi `published: true`.
```
- Mục ảnh chụp app: thêm `--lang=ja,zh,ko` vào câu lệnh `node scripts/ui-preview/shoot.mjs` và câu "mặc định chụp cả năm ngôn ngữ".

- [ ] **Step 2: `CLAUDE.md`** — trong dòng **Website marketing**, thay `tĩnh, hai ngôn ngữ, Worker Static Assets` bằng `tĩnh, năm ngôn ngữ vi/en/ja/zh/ko (pháp lý chỉ vi/en), Worker Static Assets`, và thêm cuối dòng câu `Sửa nội dung một trang thì sửa đủ các bản ngôn ngữ.`

- [ ] **Step 3: Spec** — dòng **Trạng thái** của `docs/superpowers/specs/2026-10-22-website-ja-zh-ko-design.md`: thêm `Kế hoạch: \`docs/superpowers/plans/2026-10-22-website-ja-zh-ko-0{1,2,3,4}-*.md\`; thực thi xong <ngày>, chờ chủ dự án duyệt ảnh trang.`

- [ ] **Step 4: Chạy lại test website** (README không có test, nhưng `CLAUDE.md` và spec không ảnh hưởng dựng)

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test "test/*.test.mjs" 2>&1 | tail -3
```
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/README.md CLAUDE.md docs/superpowers/specs/2026-10-22-website-ja-zh-ko-design.md && git commit -q -m "docs(website): năm ngôn ngữ, quy tắc dịch, thêm ngôn ngữ mới

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Ảnh trang cho chủ dự án duyệt

**Files:** không sửa file nào.

- [ ] **Step 1: Chụp** trang chủ năm ngôn ngữ (máy tính 1280 px lúc nút video đang mời và điện thoại 375 px, giao diện sáng), cùng `guide/quick-start/` và `pricing/` của ja, zh, ko (toàn trang, máy tính):

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && rm -rf ../target/website-cjk/final && WEBSITE_DIST=../target/website-cjk/final node src/build/build.mjs >/dev/null && mkdir -p ../target/website-cjk/review && WEBSITE_DIST=../target/website-cjk/final node --input-type=module -e '
const { start } = await import("./src/serve.mjs");
const { launch } = await import("./tools/browser/cdp.mjs");
const server = await start(4198);
const b = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = "http://127.0.0.1:4198";
for (const [lang, home] of [["vi", "/"], ["en", "/en/"], ["ja", "/ja/"], ["zh", "/zh/"], ["ko", "/ko/"]]) {
  for (const [name, o] of [["desktop", { width: 1280, height: 860 }], ["mobile", { width: 375, height: 812, mobile: true }]]) {
    const p = await b.newPage(o);
    await p.goto(base + home);
    await p.screenshot(`../target/website-cjk/review/${lang}-home-top-${name}.png`);
    await p.eval(`document.querySelector("[data-video]").scrollIntoView({ block: "center", behavior: "instant" })`);
    await sleep(800);
    await p.screenshot(`../target/website-cjk/review/${lang}-home-video-${name}.png`);
    await p.close();
  }
}
for (const lang of ["ja", "zh", "ko"]) {
  for (const page of ["guide/quick-start", "pricing"]) {
    const p = await b.newPage({ width: 1280, height: 900 });
    await p.goto(`${base}/${lang}/${page}/`);
    await p.eval(`document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in"))`);
    await p.screenshot(`../target/website-cjk/review/${lang}-${page.replace("/", "-")}.png`, { full: true });
    await p.close();
  }
}
await b.close(); server.close();
' && ls ../target/website-cjk/review | wc -l
```
Expected: `26`.

- [ ] **Step 2: Xem từng ảnh** bằng Read. Kiểm: chữ CJK hiện đúng phông, không chữ chồng hay tràn, menu ngôn ngữ hiện đúng tên ngôn ngữ trang, nút video có nhãn đúng ngôn ngữ và thời lượng, ảnh app trong trang là bản đúng ngôn ngữ. Lỗi thì sửa và chụp lại.

- [ ] **Step 3: Báo lại** cho người giao việc (để chuyển cho chủ dự án): đường dẫn tuyệt đối thư mục `target/website-cjk/review/`, số trang dựng, kết quả mọi bộ test, danh sách tên mục hệ điều hành hay câu dịch không chắc mà các task dịch đã báo, và nhắc: chưa merge, chưa push, chưa deploy; deploy website do chủ dự án tự chạy `pnpm deploy` sau khi duyệt và gộp vào `main`.
