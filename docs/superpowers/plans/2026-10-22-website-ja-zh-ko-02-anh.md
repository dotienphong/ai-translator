# Website ja/zh/ko, phần 2: ảnh chụp app và ảnh chia sẻ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Có đủ 30 ảnh chụp app (kèm mô tả trong `manifest.json`) và 11 ảnh chia sẻ 1200×630 cho mỗi ngôn ngữ ja, zh, ko, chụp từ giao diện thật của app.

**Architecture:** `scripts/ui-preview/shoot.mjs` nhận thêm `--lang=` và chụp đủ năm ngôn ngữ (IPC giả đã có dữ liệu mẫu ja/zh/ko). Mục `manifest.json` của ja/zh/ko được chèn trước khi chụp (mô tả viết tay, đã dịch); `shoot.mjs` điền dung lượng và kích thước. `website/tools/og/render.mjs` đổi danh sách ảnh sang dạng một mục cho mỗi ngôn ngữ, thêm ja/zh/ko (trừ nhóm pháp lý) và nhận tên ảnh để chỉ dựng một phần.

**Tech Stack:** Node 24, Vite (trang xem trước của app), Chrome không đầu, `cwebp`, `sips`.

**Spec:** `docs/superpowers/specs/2026-10-22-website-ja-zh-ko-design.md` mục 6.

**Phụ thuộc:** kế hoạch phần 1 (`2026-10-22-website-ja-zh-ko-01-ha-tang.md`) đã xong (test ở Task 4 dùng `langs.mjs`).

**Quy ước cho người thực thi:**
- Worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk`, nhánh `website-cjk`. **Mọi lệnh bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`** (shell về lại thư mục chính sau mỗi lệnh). Trước mỗi commit chạy `git branch --show-current`, phải thấy `website-cjk`.
- Không push, không merge, không deploy. Commit kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tắt Vite đã mở khi xong (`kill $(lsof -tiTCP:1433 -sTCP:LISTEN)`); không đụng tiến trình không do mình mở.

---

## Bản đồ file

| File | Việc |
|---|---|
| `scripts/ui-preview/shoot.mjs` | tùy chọn `--lang=`; mặc định năm ngôn ngữ |
| `website/src/assets/img/app/manifest.json` | thêm 90 mục ja/zh/ko (mô tả đã dịch) |
| `website/src/assets/img/app/*.{ja,zh,ko}.webp` | 90 ảnh mới |
| `website/tools/og/render.mjs`, `website/tools/og/template.html` | ảnh chia sẻ năm ngôn ngữ, lọc theo tên |
| `website/src/assets/og/*-{ja,zh,ko}.jpg` | 33 ảnh mới; `pricing-{vi,en}.jpg` dựng lại (câu cũ "chỉ VietQR") |
| `website/test/site.test.mjs` | test: ảnh chia sẻ của mọi trang có trong dist; manifest có đủ ba ngôn ngữ mới |

---

### Task 1: `shoot.mjs` chụp được ja, zh, ko

**Files:**
- Modify: `scripts/ui-preview/shoot.mjs`

- [ ] **Step 1: Thêm tùy chọn ngôn ngữ.** Ngay dưới dòng `const BASE = \`http://127.0.0.1:${PORT}\`;` thêm:

```js
// Ngôn ngữ cần chụp: `--lang=ja,zh,ko`; không có thì cả năm ngôn ngữ giao diện của app.
const ALL_LANGS = ["vi", "en", "ja", "zh", "ko"];
const LANGS = (args.find((a) => a.startsWith("--lang="))?.slice("--lang=".length).split(",") ?? ALL_LANGS).filter(Boolean);
for (const l of LANGS) if (!ALL_LANGS.includes(l)) throw new Error(`ngôn ngữ không hợp lệ: ${l} (cần một trong ${ALL_LANGS.join(", ")})`);
```
Thay `for (const lang of ["vi", "en"]) {` bằng `for (const lang of LANGS) {`.

Sửa chú thích đầu file: sau dòng `//   node scripts/ui-preview/shoot.mjs --port=1431 [tên…]        # Vite ở cổng khác (hay đặt UI_PREVIEW_PORT=1431)` thêm dòng:

```js
//   node scripts/ui-preview/shoot.mjs --lang=ja,zh,ko [tên…]    # chỉ các ngôn ngữ này (mặc định cả năm: vi, en, ja, zh, ko)
```
và ở chú thích của `APP`, thay `(không có thì cả vi và en)` bằng `(không có thì mọi ngôn ngữ đang chụp)`.

- [ ] **Step 2: Kiểm cú pháp**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node --check scripts/ui-preview/shoot.mjs && echo ok
```
Expected: `ok`.

Chưa commit (chung với Task 3).

---

### Task 2: Mô tả ảnh ja/zh/ko trong `manifest.json`

**Files:**
- Modify: `website/src/assets/img/app/manifest.json`
- Tạm: `target/website-cjk/manifest-desc.json` (không commit)

Mỗi ảnh ja/zh/ko là cùng cảnh với ảnh en nhưng giao diện app bằng ngôn ngữ đó (IPC giả chọn dữ liệu mẫu theo `lang`: câu phụ đề tiếng Anh dịch sang ngôn ngữ giao diện, thuật ngữ, tên loa…). Mô tả dịch từ mô tả en của cùng `slug`, và mọi nhãn trên màn hình nhắc trong mô tả phải dùng đúng chữ của app trong `src/i18n/{ja,zh,ko}.ts` (ví dụ nút Dừng: tra khóa có giá trị `"Stop"` trong `src/i18n/en.ts` rồi lấy giá trị cùng khóa trong `ja.ts`). Tên gói giữ tiếng Anh (Monthly, 6 Months, Yearly, Free) như app. Giá USD nếu nhắc phải là giá thật của gói (US$3.99, US$21.99, US$39.99). Tiếng Trung xưng "你".

- [ ] **Step 1: In mô tả en của 30 ảnh để dịch**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node -e 'const m = require("./website/src/assets/img/app/manifest.json"); for (const e of m.filter((x) => x.lang === "en")) console.log(`${e.slug}\t${e.description}`)'
```
Expected: 30 dòng `slug<TAB>mô tả`.

- [ ] **Step 2: Viết `target/website-cjk/manifest-desc.json`** — một đối tượng, khóa là `slug`, giá trị `{ "ja": "…", "zh": "…", "ko": "…" }`, đủ 30 slug in ở Step 1. Văn phong: ja thể です・ます không cần (mô tả là cụm danh từ hay câu ngắn, giống bản en); zh giản thể; ko câu tả ngắn. Không nêu tên model, thư viện, engine (quy tắc "không công bố công nghệ lõi" của `website/README.md`).

- [ ] **Step 3: Chèn mục mới ngay sau mục en của từng slug**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node -e '
const fs = require("fs");
const file = "website/src/assets/img/app/manifest.json";
const m = JSON.parse(fs.readFileSync(file, "utf8"));
const desc = JSON.parse(fs.readFileSync("target/website-cjk/manifest-desc.json", "utf8"));
const out = [];
for (const e of m) {
  if (["ja", "zh", "ko"].includes(e.lang)) continue; // chạy lại thì thay, không nhân đôi
  out.push(e);
  if (e.lang !== "en") continue;
  for (const lang of ["ja", "zh", "ko"]) {
    const d = desc[e.slug]?.[lang];
    if (!d) throw new Error(`thiếu mô tả ${e.slug} ${lang}`);
    out.push({ file: `${e.slug}.${lang}.webp`, slug: e.slug, lang, theme: e.theme, width: e.width, height: e.height, bytes: 0, description: d });
  }
}
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(out.length, "mục");
'
```
Expected: `150 mục`.

Chưa commit (chung với Task 3).

---

### Task 3: Chụp 90 ảnh ja/zh/ko

**Files:**
- Create: `website/src/assets/img/app/*.{ja,zh,ko}.webp`
- Modify: `website/src/assets/img/app/manifest.json` (dung lượng, kích thước)

- [ ] **Step 1: Cài thư viện ở gốc worktree (Vite, React của app)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && pnpm install --frozen-lockfile 2>&1 | tail -3
```
Expected: kết thúc không lỗi (`Done in …`).

- [ ] **Step 2: Mở trang xem trước ở cổng 1433 (chạy nền)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && pnpm exec vite --config scripts/ui-preview/vite.config.ts --port 1433 --strictPort
```
Chạy bằng `run_in_background: true`. Đợi tới khi `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:1433/` trả `200` (dùng Monitor hay chờ vòng lặp ngắn, không `sleep` dài).

- [ ] **Step 3: Chụp**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node scripts/ui-preview/shoot.mjs --port=1433 --lang=ja,zh,ko 2>&1 | tail -8
```
Expected: 90 dòng `<tên>.<ngôn ngữ>.webp <số> B` (in ra 8 dòng cuối), không có lỗi. Lỗi `cửa sổ vẫn thấp hơn nội dung` ở cảnh Nâng cấp: đọc thông báo, đó là giao diện ja/zh/ko dài hơn; báo người giao việc (không tự sửa app).

- [ ] **Step 4: Tắt Vite**

```bash
kill $(lsof -tiTCP:1433 -sTCP:LISTEN)
```

- [ ] **Step 5: Xem ảnh.** Dùng công cụ Read xem ít nhất các ảnh sau cho cả ba ngôn ngữ: `app-home-running`, `app-upgrade`, `app-upgrade-card`, `app-onboarding-1`, `app-about`, `overlay-default`, `compose-done`. Kiểm:
- chữ CJK hiện đúng (không ô vuông, không lẫn tiếng Việt hay tiếng Anh ngoài dữ liệu mẫu cố ý);
- cảnh Nâng cấp chọn sẵn thẻ (USD) và nút cuối không bị cắt;
- `app-about` không lộ danh sách giấy phép hay tên thư viện;
- mô tả trong `manifest.json` khớp cảnh thật (sửa mô tả nếu lệch, sửa ở `target/website-cjk/manifest-desc.json` rồi chạy lại Task 2 Step 3 và Task 3 Step 3 cho đúng ảnh đó).

- [ ] **Step 6: Commit Task 1–3**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add scripts/ui-preview/shoot.mjs website/src/assets/img/app && git commit -q -m "feat(website): ảnh chụp app tiếng Nhật, Trung, Hàn (90 ảnh, có mô tả)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ảnh chia sẻ (OG) năm ngôn ngữ

**Files:**
- Modify: `website/tools/og/render.mjs`, `website/tools/og/template.html`
- Create: `website/src/assets/og/*-{ja,zh,ko}.jpg`
- Modify: `website/src/assets/og/pricing-{vi,en}.jpg`
- Test: `website/test/site.test.mjs`

Nhóm `legal` không có bản ja/zh/ko (trang pháp lý chỉ vi/en). Ảnh Bảng giá vi/en đang ghi "Ba gói trả trước bằng VietQR" — sai từ khi có thẻ quốc tế; sửa luôn ở bước này (phát hiện khi lập kế hoạch, ngoài spec, đã báo chủ dự án).

- [ ] **Step 1: Viết test hỏng** — thêm vào cuối `website/test/site.test.mjs`:

```js
test("ảnh chia sẻ (og:image) của mọi trang có trong dist, đúng ngôn ngữ của trang", async () => {
  const errors = [];
  for (const p of pages) {
    const url = /<meta property="og:image" content="([^"]+)"/.exec(htmlByPath.get(p.path))?.[1] ?? "";
    const file = url.replace(SITE.origin, "");
    if (!file.endsWith(`-${p.lang}.jpg`)) errors.push(`${p.path}: og:image không phải ảnh ${p.lang}: ${file}`);
    else if (!(await exists(path.join(DIST, file)))) errors.push(`${p.path}: thiếu ${file}`);
  }
  assert.deepEqual(errors, []);
});

test("manifest ảnh app: mỗi slug có đủ năm ngôn ngữ", async () => {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "src/assets/img/app/manifest.json"), "utf8"));
  const bySlug = new Map();
  for (const e of manifest) bySlug.set(e.slug, [...(bySlug.get(e.slug) ?? []), e.lang]);
  for (const [slug, langs] of bySlug) assert.deepEqual(langs.sort(), [...LANG_CODES].sort(), slug);
});
```

- [ ] **Step 2: Chạy, thấy test đầu xanh (vi/en đã có ảnh) và test thứ hai xanh (Task 2 đã thêm mục)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test test/site.test.mjs 2>&1 | grep -E "og:image|mỗi slug|^# (pass|fail)"
```
Expected: cả hai `ok`. (Test og:image chỉ thật sự bắt lỗi ở phần 4 khi trang ja/zh/ko được mở; nó ở đây để ảnh của bước này có người canh.) Thử ca âm: tạm đổi tên `src/assets/og/faq-en.jpg` thành `faq-en.bak`, chạy lại, thấy test đầu đỏ với `/en/faq/: thiếu /assets/og/faq-en.jpg`, rồi đổi tên lại.

- [ ] **Step 3: Sửa `website/tools/og/render.mjs`.** Thay từ dòng `const SRC = …` tới hết dòng `export const list = IMAGES;` bằng:

```js
// Câu phụ đề minh họa trên thẻ bên phải: [nhãn, câu gốc, bản dịch] theo ngôn ngữ của ảnh.
const SRC = {
  vi: ["EN → VI", "Let's review the timeline in the next meeting.", "Hãy xem lại tiến độ trong cuộc họp tiếp theo."],
  en: ["JA → EN", "来週までに見積書をお送りします。", "We will send the quotation by next week."],
  ja: ["EN → JA", "We will send the quotation by next week.", "来週までに見積書をお送りします。"],
  zh: ["EN → ZH", "Let's review the timeline in the next meeting.", "我们在下次会议上再看一下进度。"],
  ko: ["EN → KO", "Can you share the budget estimate by Friday?", "금요일까지 예산 견적을 공유해 주실 수 있나요?"],
};
// Thẻ BCP 47 cho <html lang> của template (Chrome chọn phông CJK theo nó).
const TAG = { vi: "vi", en: "en", ja: "ja", zh: "zh-Hans", ko: "ko" };
// [tên nhóm, { ngôn ngữ: { t: tiêu đề ngắn (hiện lớn), s: dòng phụ } }]. Nhóm "legal" chỉ có vi, en (trang pháp lý không có bản ja/zh/ko).
const SET = [
  ["default", {
    vi: { t: "Dịch cuộc họp bằng AI, chạy trên máy bạn", s: "Độ trễ thấp. Không gửi dữ liệu lên cloud." },
    en: { t: "AI meeting translation that runs on your computer", s: "Low latency. No data sent to the cloud." },
    ja: { t: "パソコン上で動く AI 会議翻訳", s: "低遅延。データをクラウドに送りません。" },
    zh: { t: "在你电脑上运行的 AI 会议翻译", s: "低延迟。不把数据发送到云端。" },
    ko: { t: "내 컴퓨터에서 실행되는 AI 회의 번역", s: "낮은 지연. 데이터를 클라우드로 보내지 않습니다." },
  }],
  ["features", {
    vi: { t: "Mọi thứ để hiểu một cuộc họp bằng ngoại ngữ", s: "Thanh phụ đề, từ điển thuật ngữ, lịch sử, xuất file, 5 ngôn ngữ." },
    en: { t: "Everything to follow a meeting in another language", s: "Subtitle bar, glossary, history, export, 5 languages." },
    ja: { t: "外国語の会議を理解するためのすべて", s: "字幕バー、用語集、履歴、書き出し、5 言語。" },
    zh: { t: "听懂外语会议所需的一切", s: "字幕栏、术语表、历史记录、导出、5 种语言。" },
    ko: { t: "외국어 회의를 이해하는 데 필요한 모든 것", s: "자막 바, 용어집, 기록, 내보내기, 5개 언어." },
  }],
  ["pricing", {
    vi: { t: "Free dùng thử · 50.000 ₫ · 500.000 ₫", s: "Ba gói trả trước bằng VietQR hoặc thẻ quốc tế, không tự gia hạn." },
    en: { t: "Free trial · 50,000 ₫ · 500,000 ₫", s: "Three prepaid plans by VietQR or international card, no auto-renewal." },
    ja: { t: "10 日間の無料お試し · US$3.99 から", s: "前払いプラン 3 種。カード（税抜）または VietQR、自動更新なし。" },
    zh: { t: "免费试用 10 天 · US$3.99 起", s: "三种预付套餐，国际银行卡（不含税）或 VietQR，不自动续费。" },
    ko: { t: "10일 무료 체험 · US$3.99부터", s: "선불 요금제 3종, 카드(세금 별도) 또는 VietQR, 자동 갱신 없음." },
  }],
  ["download", {
    vi: { t: "Tải AI Translator cho macOS và Windows", s: "Cài bằng một dòng lệnh. Dùng thử Free 10 ngày." },
    en: { t: "Get AI Translator for macOS and Windows", s: "Install with one command. 10-day free trial." },
    ja: { t: "macOS 版と Windows 版をダウンロード", s: "コマンド 1 行でインストール。10 日間の無料お試し。" },
    zh: { t: "下载 macOS 版和 Windows 版", s: "一行命令即可安装。免费试用 10 天。" },
    ko: { t: "macOS 및 Windows용 다운로드", s: "명령 한 줄로 설치. 10일 무료 체험." },
  }],
  ["guide", {
    vi: { t: "Hướng dẫn sử dụng AI Translator", s: "Cài đặt, cấp quyền, phím tắt, từ điển, khắc phục sự cố." },
    en: { t: "AI Translator user guides", s: "Install, permissions, shortcuts, glossary, troubleshooting." },
    ja: { t: "AI Translator ユーザーガイド", s: "インストール、権限、ショートカット、用語集、トラブルシューティング。" },
    zh: { t: "AI Translator 使用指南", s: "安装、权限、快捷键、术语表、故障排除。" },
    ko: { t: "AI Translator 사용 가이드", s: "설치, 권한, 단축키, 용어집, 문제 해결." },
  }],
  ["solutions", {
    vi: { t: "Phụ đề dịch cho họp, webinar và video", s: "Zoom, Teams, Meet, Zalo PC: không bot, không plugin." },
    en: { t: "Translated subtitles for meetings, webinars and video", s: "Zoom, Teams, Meet, Zalo PC: no bot, no plugin." },
    ja: { t: "会議、ウェビナー、動画に翻訳字幕", s: "Zoom、Teams、Meet、Zalo PC：ボットもプラグインも不要。" },
    zh: { t: "为会议、网络研讨会和视频提供翻译字幕", s: "Zoom、Teams、Meet、Zalo PC：无需机器人，无需插件。" },
    ko: { t: "회의, 웨비나, 동영상에 번역 자막", s: "Zoom, Teams, Meet, Zalo PC: 봇도 플러그인도 필요 없음." },
  }],
  ["compare", {
    vi: { t: "Dịch offline hay dịch cloud?", s: "So sánh cân bằng: riêng tư, internet, ngôn ngữ, phần cứng." },
    en: { t: "Offline or cloud translation?", s: "A balanced comparison: privacy, internet, languages, hardware." },
    ja: { t: "オフライン翻訳か、クラウド翻訳か", s: "プライバシー、ネット接続、言語、ハードウェアを公平に比較。" },
    zh: { t: "离线翻译还是云端翻译？", s: "从隐私、网络、语言、硬件全面比较。" },
    ko: { t: "오프라인 번역인가, 클라우드 번역인가?", s: "개인정보, 인터넷, 언어, 하드웨어를 균형 있게 비교." },
  }],
  ["about", {
    vi: { t: "Về AI Translator", s: "Xây cho người họp bằng ngoại ngữ, riêng tư theo thiết kế." },
    en: { t: "About AI Translator", s: "Built for people who meet in another language, private by design." },
    ja: { t: "AI Translator について", s: "外国語で会議をする人のために。設計段階からプライバシーを重視。" },
    zh: { t: "关于 AI Translator", s: "为用外语开会的人打造，从设计上保护隐私。" },
    ko: { t: "AI Translator 소개", s: "외국어로 회의하는 사람을 위해, 설계부터 개인정보를 보호합니다." },
  }],
  ["security", {
    vi: { t: "Dữ liệu và bảo mật", s: "Âm thanh ở lại trên máy. Đây là mọi thứ chúng tôi lưu." },
    en: { t: "Data and security", s: "Audio stays on your device. Here is everything we store." },
    ja: { t: "データとセキュリティ", s: "音声はパソコンに残ります。保存するものをすべて公開しています。" },
    zh: { t: "数据与安全", s: "音频留在你的设备上。这里列出我们存储的全部内容。" },
    ko: { t: "데이터와 보안", s: "음성은 기기에 남습니다. 저장하는 모든 것을 공개합니다." },
  }],
  ["faq", {
    vi: { t: "Câu hỏi thường gặp", s: "Offline, riêng tư, ngôn ngữ, giá, cài đặt, khắc phục sự cố." },
    en: { t: "Frequently asked questions", s: "Offline, privacy, languages, pricing, install, troubleshooting." },
    ja: { t: "よくある質問", s: "オフライン、プライバシー、言語、料金、インストール、トラブル対応。" },
    zh: { t: "常见问题", s: "离线、隐私、语言、价格、安装、故障排除。" },
    ko: { t: "자주 묻는 질문", s: "오프라인, 개인정보, 언어, 요금, 설치, 문제 해결." },
  }],
  ["contact", {
    vi: { t: "Liên hệ và hỗ trợ", s: "support@aitranslator.io.vn" },
    en: { t: "Contact and support", s: "support@aitranslator.io.vn" },
    ja: { t: "お問い合わせとサポート", s: "support@aitranslator.io.vn" },
    zh: { t: "联系与支持", s: "support@aitranslator.io.vn" },
    ko: { t: "문의 및 지원", s: "support@aitranslator.io.vn" },
  }],
  ["legal", {
    vi: { t: "Điều khoản và quyền riêng tư", s: "Văn bản đầy đủ của AI Translator." },
    en: { t: "Terms and privacy", s: "The full legal texts of AI Translator." },
  }],
];
const IMAGES = SET.flatMap(([name, byLang]) =>
  Object.entries(byLang).map(([lang, text]) => {
    const [langs, src, dst] = SRC[lang];
    return [`${name}-${lang}`, { lang: TAG[lang], tag: "macOS · Windows", langs, src, dst, ...text }];
  }),
);
export const list = IMAGES;
```

Trong khối `if (process.argv[1] === …)`, thay `for (const [name, p] of IMAGES) {` bằng:

```js
  // Lọc: `node tools/og/render.mjs pricing-vi ja` dựng ảnh tên pricing-vi và mọi ảnh tiếng Nhật; không đối số thì dựng hết.
  const only = new Set(process.argv.slice(2));
  for (const [name, p] of IMAGES.filter(([n]) => only.size === 0 || only.has(n) || only.has(n.split("-").pop()))) {
```
và sửa dòng chú thích đầu file thành:

```js
// Sinh ảnh chia sẻ 1200×630 cho website: node tools/og/render.mjs [tên-ảnh | ngôn ngữ …]   (cần Google Chrome; không cần thư viện)
```

- [ ] **Step 4: `website/tools/og/template.html`** — trong khối `<style>`, ngay sau quy tắc `h1{…}`, thêm:

```css
html:is(:lang(ja),:lang(zh-Hans),:lang(ko)) h1{letter-spacing:0;line-height:1.25}
```

- [ ] **Step 5: Dựng ảnh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node tools/og/render.mjs ja zh ko pricing-vi pricing-en 2>&1 | tail -3 && ls src/assets/og | grep -cE -- '-(ja|zh|ko)\.jpg$'
```
Expected: dòng cuối `33`.

- [ ] **Step 6: Xem ảnh** bằng Read: `default-ja.jpg`, `pricing-zh.jpg`, `guide-ko.jpg`, `pricing-vi.jpg`, `pricing-en.jpg`. Kiểm: tiêu đề không tràn ra ngoài cột trái (rộng 600 px) hay đè lên thẻ phụ đề; chữ CJK đúng phông (kanji kiểu Nhật ở ảnh ja); dòng phụ đọc hết. Tiêu đề tràn thì rút ngắn chữ ở `SET` (giữ ý), dựng lại đúng ảnh đó.

- [ ] **Step 7: Chạy toàn bộ test website**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --test "test/*.test.mjs" 2>&1 | tail -4
```
Expected: `# fail 0`.

- [ ] **Step 8: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/tools/og website/src/assets/og website/test/site.test.mjs && git commit -q -m "feat(website): ảnh chia sẻ tiếng Nhật, Trung, Hàn; ảnh Bảng giá vi/en nêu cả thẻ quốc tế

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Báo lại** cho người giao việc: số ảnh app và OG mới, đường dẫn tuyệt đối của vài ảnh đã xem, và các mô tả đã phải sửa (nếu có).
