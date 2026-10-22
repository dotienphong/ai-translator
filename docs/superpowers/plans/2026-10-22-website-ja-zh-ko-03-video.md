# Website ja/zh/ko, phần 3: video giới thiệu tiếng Nhật, Trung, Hàn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ba video 16:10 `website/src/assets/video/ai-translator-demo.{ja,zh,ko}.mp4` kèm ảnh bìa `.webp`: người nói tiếng Anh (dùng lại giọng của bản tiếng Việt), phụ đề và giao diện bằng ngôn ngữ đích lấy từ pipeline thật, Gõ dịch đổi câu trả lời sang tiếng Anh.

**Architecture:** Bộ `scripts/demo-video` hiện có, thêm khái niệm "kịch bản dùng lại bản thu của kịch bản khác" (`voiceFrom`) ở một module nhỏ `names.mjs` mà `data.mjs`, `render.mjs`, `desktop.mjs` cùng dùng. Phông CJK trong khung dựng chọn theo `lang` của trang (phông có sẵn của macOS sau Noto Sans). Nhịp gõ của chữ CJK chỉnh trong kịch bản để đoạn gõ dài tương đương bản vi; dấu câu CJK tính như dấu câu.

**Tech Stack:** Node 24 (`node:test`), Vite (trang xem trước của app, cổng 1434), Chrome không đầu, ffmpeg, `cwebp`, `latency-bench` (Rust, đã build ở thư mục chính), model trong `models/`.

**Spec:** `docs/superpowers/specs/2026-10-22-website-ja-zh-ko-design.md` mục 7. Quy tắc video cũ: `docs/superpowers/specs/2026-10-21-demo-video-desktop-design.md` (không logo, không tên Teams/Meet/Messenger/Windows/Apple, chỉ ảnh đại diện, màn kết không có chữ nhỏ, không số đo tốc độ, Ctrl + Alt + G).

**Phụ thuộc:** không phụ thuộc phần 1, 2 (chạy song song được). Phần 4 nhúng các file video này vào trang chủ ja/zh/ko.

**Quy ước cho người thực thi:**
- Worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk` (gọi tắt `WT`), nhánh `website-cjk`; thư mục chính `/Users/dtphong/Desktop/software_business/ai-translator` (gọi tắt `MAIN`, chỉ đọc model, binary, khung ảnh; không sửa gì ở đó). **Mọi lệnh bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`.** Trước commit chạy `git branch --show-current`, phải thấy `website-cjk`.
- **Không sửa tay `scripts/demo-video/data/*.json`** (spec cũ §4): chỉ `data.mjs` ghi chúng.
- **Điểm dừng bắt buộc ở Task 5:** đọc chữ phụ đề và câu Gõ dịch; câu nào dịch sai nghĩa thì dừng, báo người giao việc kèm câu gốc và bản dịch, không quay video của ngôn ngữ đó.
- Không push, không merge, không deploy. Commit kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Tắt Vite đã mở khi xong.

---

## Bản đồ file

| File | Việc |
|---|---|
| `scripts/demo-video/names.mjs` (mới) | `dataName`, `voiceName`, `htmlLang`, `fontStack` |
| `scripts/demo-video/names.test.mjs` (mới) | test cho `names.mjs` và cho ba kịch bản mới |
| `scripts/demo-video/timeline.mjs` | `typingSchedule`: dấu câu CJK (`。、，！？`) tính là dấu câu |
| `scripts/demo-video/timeline.test.mjs` | ca dấu câu CJK |
| `scripts/demo-video/data.mjs`, `render.mjs`, `desktop.mjs` | dùng `voiceName`; trang dựng đặt `lang` và phông theo ngôn ngữ |
| `scripts/demo-video/desktop.css` | phông CJK theo `:lang()` |
| `scripts/demo-video/script.desktop.{ja,zh,ko}.json` (mới) | ba kịch bản |
| `scripts/demo-video/data/{live,compose}.desktop.{ja,zh,ko}.json` (mới, do `data.mjs` ghi) | chữ thật |
| `website/src/assets/video/ai-translator-demo.{ja,zh,ko}.{mp4,webp}` (mới) | video và ảnh bìa |

---

### Task 0: Chuẩn bị worktree để chạy pipeline và trang dựng cảnh

**Files:** không có file theo dõi nào đổi (mọi thứ dưới đây nằm trong đường dẫn bị `.gitignore`: `/models/`, `/src-tauri/binaries/`, `/target/`).

- [ ] **Step 1: Kiểm binary của thư mục chính còn mới hơn mã engine**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && stat -f '%Sm' -t '%Y-%m-%dT%H:%M:%S' target/release/latency-bench src-tauri/binaries/asr-worker-aarch64-apple-darwin && git log -1 --format='%cI %h' -- crates/pipeline crates/asr-protocol crates/asr-worker crates/latency-bench
```
Expected: hai binary có giờ sửa **muộn hơn** ngày của commit in ra (lúc lập kế hoạch: binary 2026-10-21T18:44, commit cuối 2026-10-21T10:49). Nếu commit muộn hơn: dừng, báo người giao việc (cần `cargo build --release -p latency-bench && scripts/copy-sidecars.sh` ở thư mục chính, việc của chủ dự án quyết).

- [ ] **Step 2: Nối model, binary; chép khung ảnh và bản thu**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && MAIN=/Users/dtphong/Desktop/software_business/ai-translator \
&& mkdir -p models src-tauri/binaries target/release target/demo-video \
&& for f in "$MAIN"/models/*; do ln -sf "$f" models/; done \
&& for f in "$MAIN"/src-tauri/binaries/*; do ln -sf "$f" src-tauri/binaries/; done \
&& ln -sf "$MAIN/target/release/latency-bench" target/release/latency-bench \
&& cp -R "$MAIN/target/demo-video/frames" target/demo-video/ \
&& cp "$MAIN"/target/demo-video/voice48.vi.wav "$MAIN"/target/demo-video/voice16.vi.wav "$MAIN"/target/demo-video/truth.vi.json target/demo-video/ \
&& git status --short | head
```
Expected: `git status --short` không in gì (mọi thứ bị bỏ qua). `llama-server` tìm `.dylib` qua `@loader_path`: liên kết mềm trỏ về file thật trong `MAIN`, nên `@loader_path` là thư mục của file thật, vẫn đúng.

- [ ] **Step 3: Kiểm bản thu tiếng Anh khớp dữ liệu đã commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node -e 'const c = require("crypto"), fs = require("fs"); const want = require("./scripts/demo-video/data/voice.vi.json").sha256; const got = c.createHash("sha256").update(fs.readFileSync("target/demo-video/voice48.vi.wav")).digest("hex"); console.log(got === want ? "khớp" : `LỆCH ${got} ≠ ${want}`)'
```
Expected: `khớp`. Lệch: dừng, báo người giao việc.

- [ ] **Step 4: Cài thư viện ở gốc worktree** (bỏ qua nếu đã cài ở phần 2)

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && pnpm install --frozen-lockfile 2>&1 | tail -2
```

- [ ] **Step 5: Test bộ video hiện có xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node --test scripts/demo-video/ 2>&1 | tail -4
```
Expected: `# fail 0`.

---

### Task 1: `names.mjs` — dữ liệu chữ, bản thu, `lang` và phông theo kịch bản

**Files:**
- Create: `scripts/demo-video/names.mjs`
- Create: `scripts/demo-video/names.test.mjs`

- [ ] **Step 1: Viết test hỏng** — `scripts/demo-video/names.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { dataName, fontStack, htmlLang, voiceName } from "./names.mjs";

test("dataName: kịch bản tự khai `data` thì dùng nó, không thì trùng tên kịch bản", () => {
  assert.equal(dataName({ data: "vi" }, "desktop.vi"), "vi");
  assert.equal(dataName({}, "desktop.ja"), "desktop.ja");
});

test("voiceName: `voiceFrom` > `data` > tên kịch bản", () => {
  assert.equal(voiceName({ voiceFrom: "vi" }, "desktop.ja"), "vi");
  assert.equal(voiceName({ data: "vi" }, "desktop.vi"), "vi");
  assert.equal(voiceName({}, "desktop.en"), "desktop.en");
});

test("htmlLang và fontStack: vi/en giữ phông cũ; ja/zh/ko thêm phông CJK của macOS sau Noto Sans", () => {
  assert.deepEqual(["vi", "en", "ja", "zh", "ko"].map(htmlLang), ["vi", "en", "ja", "zh-Hans", "ko"]);
  assert.equal(fontStack("vi"), '"Demo UI",sans-serif');
  assert.equal(fontStack("en"), '"Demo UI",sans-serif');
  assert.equal(fontStack("ja"), '"Demo UI","Hiragino Sans",sans-serif');
  assert.equal(fontStack("zh"), '"Demo UI","PingFang SC",sans-serif');
  assert.equal(fontStack("ko"), '"Demo UI","Apple SD Gothic Neo",sans-serif');
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node --test scripts/demo-video/names.test.mjs 2>&1 | tail -3
```
Expected: FAIL, không thấy `names.mjs`.

- [ ] **Step 3: Viết `scripts/demo-video/names.mjs`**

```js
// Tên bộ dữ liệu và bản thu của một kịch bản, `lang` và phông của trang dựng cảnh theo ngôn ngữ đích (spec
// 2026-10-22-website-ja-zh-ko §7). Bản ja/zh/ko dùng lại giọng đọc tiếng Anh của bản vi (`"voiceFrom": "vi"`) nhưng có chữ phụ đề
// riêng (data/live.<kịch bản>.json), nên tên bản thu và tên bộ chữ tách nhau. data.mjs, render.mjs, desktop.mjs cùng dùng.

/** Bộ chữ thật (data/live.<…>.json, data/compose.<…>.json): kịch bản tự khai `data`, không thì trùng tên kịch bản. */
export const dataName = (script, name) => script.data ?? name;

/** Bản thu (target/demo-video/voice48.<…>.wav, voice16, truth, data/voice.<…>.json): `voiceFrom`, không thì như bộ chữ. */
export const voiceName = (script, name) => script.voiceFrom ?? dataName(script, name);

const TAGS = { vi: "vi", en: "en", ja: "ja", zh: "zh-Hans", ko: "ko" };
/** Thẻ `lang` của trang dựng cảnh: Chrome chọn phông dự phòng cho chữ Hán theo nó (kanji kiểu Nhật ở bản ja). */
export const htmlLang = (target) => TAGS[target];

// Phông có sẵn của macOS cho chữ CJK, đứng sau "Demo UI" (Noto Sans: chữ Latin và tiếng Việt). Không thêm file phông vào repo.
const CJK_FONT = { ja: "Hiragino Sans", zh: "PingFang SC", ko: "Apple SD Gothic Neo" };
/** Chuỗi font-family của trang dựng và hai iframe của app; vi, en giữ đúng như các video đã quay. */
export const fontStack = (target) => (CJK_FONT[target] ? `"Demo UI","${CJK_FONT[target]}",sans-serif` : '"Demo UI",sans-serif');
```

- [ ] **Step 4: Chạy test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node --test scripts/demo-video/names.test.mjs 2>&1 | tail -3
```
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add scripts/demo-video/names.mjs scripts/demo-video/names.test.mjs && git commit -q -m "feat(demo-video): tên bộ chữ, bản thu, lang và phông theo kịch bản (names.mjs)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Dấu câu CJK trong nhịp gõ

**Files:**
- Modify: `scripts/demo-video/timeline.mjs`
- Test: `scripts/demo-video/timeline.test.mjs`

- [ ] **Step 1: Thêm test hỏng** vào cuối `scripts/demo-video/timeline.test.mjs`:

```js
test("typingSchedule: dấu câu CJK (。、，！？) nghỉ như dấu câu", () => {
  const steps = typingSchedule("好的，我。", 0, { charMs: 100, spaceMs: 110, punctuationMs: 300 });
  assert.deepEqual(steps.map((s) => s.at), [0, 100, 200, 500, 600]);
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node --test scripts/demo-video/timeline.test.mjs 2>&1 | grep -E "^not ok|CJK" | head -3
```
Expected: FAIL (hiện tại `，` tính như chữ: `[0, 100, 200, 300, 400]`).

- [ ] **Step 3: Sửa `typingSchedule`** — thay `at += /[,.!?]/.test(ch) ? pace.punctuationMs : …` bằng:

```js
    at += /[,.!?。、，！？]/.test(ch) ? pace.punctuationMs : ch === " " ? pace.spaceMs : pace.charMs;
```

- [ ] **Step 4: Chạy toàn bộ test bộ video**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node --test scripts/demo-video/ 2>&1 | tail -3
```
Expected: `# fail 0` (chữ vi/en không có dấu câu CJK nên lịch của hai video cũ không đổi).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add scripts/demo-video/timeline.mjs scripts/demo-video/timeline.test.mjs && git commit -q -m "feat(demo-video): dấu câu CJK nghỉ như dấu câu khi gõ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `data.mjs`, `render.mjs`, `desktop.mjs`, `desktop.css` dùng `names.mjs`

**Files:**
- Modify: `scripts/demo-video/data.mjs`, `scripts/demo-video/render.mjs`, `scripts/demo-video/desktop.mjs`, `scripts/demo-video/desktop.css`

- [ ] **Step 1: `data.mjs`.** Thêm `import { voiceName } from "./names.mjs";` sau các import. Trong `main(lang)`, đưa dòng đọc kịch bản lên trước `paths` và tính tên bản thu:

```js
  const script = JSON.parse(readFileSync(path.join(here, `script.${lang}.json`), "utf8"));
  // Bản ja/zh/ko dùng lại giọng đọc của kịch bản khác (`voiceFrom`), chữ phụ đề thì ghi riêng theo tên kịch bản.
  const voice = voiceName(script, lang);
```
Trong `paths`, thay `voice16.${lang}.wav` bằng `voice16.${voice}.wav` và `truth.${lang}.json` bằng `truth.${voice}.json`; xóa dòng `const script = …` cũ (sau khối kiểm `missing`). Sửa dòng chú thích lệnh chạy ở đầu file `//   node scripts/demo-video/data.mjs [vi]` thành `//   node scripts/demo-video/data.mjs [vi|desktop.en|desktop.ja|desktop.zh|desktop.ko]`.

- [ ] **Step 2: `render.mjs`.** Thêm `import { dataName, voiceName } from "./names.mjs";`. Thay

```js
// Bộ dữ liệu chữ thật (voice/live/compose): kịch bản 16:10 dùng lại bộ của bản dọc.
const data = script.data ?? name;
```
bằng
```js
// Bộ chữ thật (live/compose) và bản thu (voice): kịch bản 16:10 tiếng Việt dùng lại bộ của bản dọc; bản ja/zh/ko dùng lại bản thu
// của bản dọc (`voiceFrom`) nhưng có chữ riêng (names.mjs).
const data = dataName(script, name);
const voiceData = voiceName(script, name);
```
Thay `json(\`data/voice.${data}.json\`)` bằng `json(\`data/voice.${voiceData}.json\`)`; trong khối `if (full)`, thay `voice48.${data}.wav` bằng `voice48.${voiceData}.wav` và trong thông báo lỗi ngay dưới, `(data/voice.${data}.json)` bằng `(data/voice.${voiceData}.json)`. Sửa dòng chú thích `//   node scripts/demo-video/render.mjs [--script vi|desktop.vi]` thành `//   node scripts/demo-video/render.mjs [--script vi|desktop.vi|desktop.en|desktop.ja|desktop.zh|desktop.ko]`.

- [ ] **Step 3: `desktop.mjs`.** Thêm `import { dataName, fontStack, htmlLang, voiceName } from "./names.mjs";` vào nhóm import. Thay

```js
// Bộ dữ liệu chữ thật: kịch bản tự khai (`data`), không thì trùng tên kịch bản.
const d = script.data ?? name;
const [voice, live, compose, frameIndex] = await Promise.all([
  load(here(`./data/voice.${d}.json`)),
```
bằng
```js
// Bộ chữ thật và bản thu: xem names.mjs (bản ja/zh/ko dùng lại bản thu tiếng Anh của bản vi).
const d = dataName(script, name);
const v = voiceName(script, name);
const [voice, live, compose, frameIndex] = await Promise.all([
  load(here(`./data/voice.${v}.json`)),
```
Ngay sau dòng `const ui = script.target;` thêm:

```js
// Chrome chọn phông dự phòng cho chữ Hán theo `lang` của trang (kanji kiểu Nhật ở bản ja); desktop.css đổi --font theo nó.
document.documentElement.lang = htmlLang(ui);
```
Thay định nghĩa `IFRAME_CSS` bằng:

```js
const IFRAME_CSS = `*,*::before,*::after{transition:none!important;animation:none!important;font-family:${fontStack(ui)}!important}textarea{caret-color:transparent!important}`;
```
Thay `new Audio(\`/target/demo-video/voice48.${d}.wav\`)` bằng `new Audio(\`/target/demo-video/voice48.${v}.wav\`)`.

- [ ] **Step 4: `desktop.css`.** Ngay sau khối `:root { … }` đầu file (khối có `--font: "Demo UI", sans-serif;`), thêm:

```css
/* Bản ja/zh/ko (spec 2026-10-22-website-ja-zh-ko §7): chữ CJK dùng phông có sẵn của macOS sau Noto Sans; khớp fontStack() của names.mjs. */
:root:lang(ja) { --font: "Demo UI", "Hiragino Sans", sans-serif; }
:root:lang(zh-Hans) { --font: "Demo UI", "PingFang SC", sans-serif; }
:root:lang(ko) { --font: "Demo UI", "Apple SD Gothic Neo", sans-serif; }
```

- [ ] **Step 5: Kiểm cú pháp và test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node --check scripts/demo-video/data.mjs && node --check scripts/demo-video/render.mjs && node --check scripts/demo-video/desktop.mjs && node --test scripts/demo-video/ 2>&1 | tail -3
```
Expected: không lỗi cú pháp, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add scripts/demo-video && git commit -q -m "feat(demo-video): kịch bản dùng lại bản thu của kịch bản khác; lang và phông CJK của trang dựng

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ba kịch bản `script.desktop.{ja,zh,ko}.json`

**Files:**
- Create: `scripts/demo-video/script.desktop.ja.json`, `script.desktop.zh.json`, `script.desktop.ko.json`
- Test: `scripts/demo-video/names.test.mjs`

Mỗi kịch bản chép từ `script.desktop.vi.json` rồi đổi các trường dưới đây; `viewport`, `layout`, `outro` và mọi trường `timing` khác giữ nguyên. Bỏ trường `"data"` (bộ chữ trùng tên kịch bản), thêm `"voiceFrom": "vi"`. Người trong cuộc họp giữ tên tiếng Anh như bản vi (Sarah Collins nói, David Park, Emma Wilson); ô "Bạn" đổi theo ngôn ngữ. Tin nhắn của Sarah giữ tiếng Anh như bản vi.

- [ ] **Step 1: Viết test hỏng** (cuối `names.test.mjs`):

```js
import { readFileSync } from "node:fs";
import { typingSchedule } from "./timeline.mjs";

const read = (name) => JSON.parse(readFileSync(new URL(`./script.${name}.json`, import.meta.url), "utf8"));
const typingMs = (s) => {
  const steps = typingSchedule(s.chat.reply, 0, s.timing.chat.pace);
  return steps.at(-1).at;
};

test("kịch bản ja/zh/ko: dùng lại bản thu tiếng Anh của bản vi, đích đúng ngôn ngữ, Gõ dịch sang tiếng Anh, ngày theo thói quen của Windows", () => {
  const vi = read("desktop.vi");
  const dates = { ja: "2026/10/21", zh: "2026/10/21", ko: "2026-10-21" };
  for (const lang of ["ja", "zh", "ko"]) {
    const s = read(`desktop.${lang}`);
    assert.equal(s.stage, "desktop", lang);
    assert.equal(s.voiceFrom, "vi", lang);
    assert.equal(s.data, undefined, `${lang}: không khai data (bộ chữ riêng)`);
    assert.equal(s.target, lang);
    assert.equal(s.chat.replyLang, lang);
    assert.equal(s.chat.replyTarget, "en");
    assert.equal(s.taskbar.date, dates[lang]);
    assert.deepEqual(s.layout, vi.layout, `${lang}: layout`);
    assert.deepEqual(s.viewport, vi.viewport, `${lang}: viewport`);
    assert.deepEqual({ ...s.timing.chat, pace: null }, { ...vi.timing.chat, pace: null }, `${lang}: timing.chat ngoài pace`);
    const ratio = typingMs(s) / typingMs(vi);
    assert.ok(ratio > 0.85 && ratio < 1.15, `${lang}: đoạn gõ dài ${typingMs(s)} ms, bản vi ${typingMs(vi)} ms`);
    assert.ok(!/Teams|Meet|Messenger|Windows|Apple|Zoom/.test(JSON.stringify({ labels: s.labels, chat: s.chat, ui: s.ui, call: s.call })), `${lang}: không tên thương hiệu`);
  }
});
```

- [ ] **Step 2: Chạy để thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node --test scripts/demo-video/names.test.mjs 2>&1 | grep -E "^not ok|ENOENT" | head -3
```
Expected: FAIL, không thấy `script.desktop.ja.json`.

- [ ] **Step 3: Tạo ba file.** Trường khác bản vi:

**`script.desktop.ja.json`**
```json
"voiceFrom": "vi",
"target": "ja",
"timing.chat.pace": { "charMs": 150, "spaceMs": 110, "punctuationMs": 260 },
"labels": {
  "meeting": { "text": "会議をリアルタイム翻訳 · パソコン上で動作" },
  "chat": { "text": "入力翻訳 · Ctrl + Alt + G · 日本語で入力、英語で送信" }
},
"call.people[3]": { "name": "あなた", "still": "self-still" },
"chat": {
  "title": "メッセージ",
  "contact": { "name": "Sarah Collins", "still": "sarah", "status": "オンライン" },
  "list": [
    { "name": "Sarah Collins", "still": "sarah", "time": "10:42", "active": true },
    { "name": "David Park", "still": "p1-still", "last": "Thanks for the update!", "time": "9:15" },
    { "name": "Emma Wilson", "still": "p2-still", "last": "See you at the sync.", "time": "昨日" },
    { "name": "チェックアウトチーム", "initials": "CT", "last": "あなた: デザインファイルを送りました", "time": "月" }
  ],
  "historyDay": "昨日",
  "history": [
    { "from": "them", "text": "Meeting link for tomorrow: weekly sync at 10:00." },
    { "from": "me", "text": "Got it, thanks!" }
  ],
  "todayDay": "今日 10:42",
  "sarahMessage": "Hi! Following up on the quote we discussed in the meeting.",
  "sarahReply": "Perfect, thank you!",
  "reply": "承知しました。金曜日までに新しい見積もりをお送りします。",
  "replyLang": "ja",
  "replyTarget": "en",
  "placeholder": "Aa"
},
"ui": { "chats": "チャット", "search": "検索", "leave": "退出", "youPrefix": "あなた: " },
"taskbar": { "time": "10:42", "date": "2026/10/21" }
```

**`script.desktop.zh.json`**
```json
"voiceFrom": "vi",
"target": "zh",
"timing.chat.pace": { "charMs": 230, "spaceMs": 110, "punctuationMs": 300 },
"labels": {
  "meeting": { "text": "会议实时翻译 · 在电脑上运行" },
  "chat": { "text": "输入翻译 · Ctrl + Alt + G · 用中文输入，以英文发送" }
},
"call.people[3]": { "name": "你", "still": "self-still" },
"chat": {
  "title": "消息",
  "contact": { "name": "Sarah Collins", "still": "sarah", "status": "在线" },
  "list": [
    { "name": "Sarah Collins", "still": "sarah", "time": "10:42", "active": true },
    { "name": "David Park", "still": "p1-still", "last": "Thanks for the update!", "time": "09:15" },
    { "name": "Emma Wilson", "still": "p2-still", "last": "See you at the sync.", "time": "昨天" },
    { "name": "结账小组", "initials": "CT", "last": "你: 已发送设计文件", "time": "周一" }
  ],
  "historyDay": "昨天",
  "history": [
    { "from": "them", "text": "Meeting link for tomorrow: weekly sync at 10:00." },
    { "from": "me", "text": "Got it, thanks!" }
  ],
  "todayDay": "今天 10:42",
  "sarahMessage": "Hi! Following up on the quote we discussed in the meeting.",
  "sarahReply": "Perfect, thank you!",
  "reply": "好的，我会在周五之前把新的报价发给您。",
  "replyLang": "zh",
  "replyTarget": "en",
  "placeholder": "Aa"
},
"ui": { "chats": "聊天", "search": "搜索", "leave": "离开", "youPrefix": "你: " },
"taskbar": { "time": "10:42", "date": "2026/10/21" }
```

**`script.desktop.ko.json`**
```json
"voiceFrom": "vi",
"target": "ko",
"timing.chat.pace": { "charMs": 170, "spaceMs": 110, "punctuationMs": 260 },
"labels": {
  "meeting": { "text": "회의 실시간 번역 · 내 컴퓨터에서 실행" },
  "chat": { "text": "입력 번역 · Ctrl + Alt + G · 한국어로 입력, 영어로 전송" }
},
"call.people[3]": { "name": "나", "still": "self-still" },
"chat": {
  "title": "메시지",
  "contact": { "name": "Sarah Collins", "still": "sarah", "status": "활동 중" },
  "list": [
    { "name": "Sarah Collins", "still": "sarah", "time": "10:42", "active": true },
    { "name": "David Park", "still": "p1-still", "last": "Thanks for the update!", "time": "09:15" },
    { "name": "Emma Wilson", "still": "p2-still", "last": "See you at the sync.", "time": "어제" },
    { "name": "체크아웃 팀", "initials": "CT", "last": "나: 디자인 파일을 보냈습니다", "time": "월" }
  ],
  "historyDay": "어제",
  "history": [
    { "from": "them", "text": "Meeting link for tomorrow: weekly sync at 10:00." },
    { "from": "me", "text": "Got it, thanks!" }
  ],
  "todayDay": "오늘 10:42",
  "sarahMessage": "Hi! Following up on the quote we discussed in the meeting.",
  "sarahReply": "Perfect, thank you!",
  "reply": "네, 금요일 전까지 새 견적서를 보내드리겠습니다.",
  "replyLang": "ko",
  "replyTarget": "en",
  "placeholder": "Aa"
},
"ui": { "chats": "채팅", "search": "검색", "leave": "나가기", "youPrefix": "나: " },
"taskbar": { "time": "10:42", "date": "2026-10-21" }
```

(`"timing.chat.pace"` và `"call.people[3]"` là cách ghi trong kế hoạch: trong file JSON thật, sửa `pace` bên trong `timing.chat` và phần tử thứ tư của `call.people`; `call.title`, `call.startClock` và ba người đầu giữ như bản vi.)

- [ ] **Step 4: Chạy test; nếu tỉ lệ đoạn gõ ngoài 0,85–1,15 thì chỉnh `charMs`** (giữ dưới 400 ms, giới hạn của `typingSchedule`) rồi chạy lại:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node --test scripts/demo-video/ 2>&1 | tail -3
```
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add scripts/demo-video/script.desktop.ja.json scripts/demo-video/script.desktop.zh.json scripts/demo-video/script.desktop.ko.json scripts/demo-video/names.test.mjs && git commit -q -m "feat(demo-video): kịch bản 16:10 tiếng Nhật, Trung, Hàn (giọng tiếng Anh của bản vi)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Lấy chữ thật và duyệt (điểm dừng)

**Files:**
- Create (do `data.mjs` ghi): `scripts/demo-video/data/live.desktop.{ja,zh,ko}.json`, `scripts/demo-video/data/compose.desktop.{ja,zh,ko}.json`

- [ ] **Step 1: Chạy pipeline cho từng ngôn ngữ, lần lượt (không chạy song song: mỗi lượt dùng GPU và kiểm độ trễ phát lại)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node scripts/demo-video/data.mjs desktop.ja 2>&1 | tail -14
```
rồi `desktop.zh`, rồi `desktop.ko` (mỗi lệnh một lần gọi, `timeout` 600000).
Expected: mỗi lượt in bốn cặp `câu tiếng Anh → bản dịch` và một dòng Gõ dịch `câu ja/zh/ko → bản tiếng Anh (… ms)`. Lỗi `phát lại chậm hơn thời gian thực` hay `tiến trình phụ khởi động lại`: máy đang bận, chạy lại đúng ngôn ngữ đó.

- [ ] **Step 2: Duyệt chữ.** Với mỗi ngôn ngữ, đọc các câu `subtitle` đã chốt (không `provisional`) và câu Gõ dịch:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && node -e '
for (const l of ["ja", "zh", "ko"]) {
  const live = require(`./scripts/demo-video/data/live.desktop.${l}.json`);
  const c = require(`./scripts/demo-video/data/compose.desktop.${l}.json`);
  console.log(`== ${l}`);
  for (const e of live.events.filter((e) => e.kind === "subtitle" && !e.provisional && e.status === "done")) console.log(`  ${e.src_text}\n  → ${e.tgt_text}`);
  console.log(`  [Gõ dịch] ${c.src}\n  → ${c.hyp}`);
}'
```
Tiêu chí: mỗi bản dịch giữ đúng nghĩa câu gốc (hoãn ra mắt sang tuần thứ hai của tháng Mười Một; đội thiết kế tìm thấy vài lỗi ở bước thanh toán; xin báo giá mới cho phần việc thêm trước thứ Sáu; câu Gõ dịch là "sẽ gửi báo giá mới trước thứ Sáu"). Ngày, tháng, thứ phải đúng (đã có tiền lệ "thứ 6" bị dịch thành Saturday). Câu chữ thiếu tự nhiên mà đúng nghĩa: chấp nhận.

**Nếu có câu sai nghĩa: DỪNG ở đây.** Báo người giao việc: ngôn ngữ, câu gốc, bản dịch, chỗ sai. Không sửa file `data/*.json`, không đổi câu tiếng Anh của bản thu (bản vi dùng chung). Chỉ tiếp tục khi được trả lời. Câu Gõ dịch sai thì có thể đề xuất đổi câu `reply` của kịch bản (chạy lại Step 1 cho ngôn ngữ đó).

- [ ] **Step 3: Commit dữ liệu chữ** (sau khi duyệt đạt)

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add scripts/demo-video/data && git commit -q -m "data(demo-video): chữ phụ đề và Gõ dịch thật cho bản tiếng Nhật, Trung, Hàn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Quay video và ảnh bìa

**Files:**
- Create: `website/src/assets/video/ai-translator-demo.{ja,zh,ko}.mp4`, `.webp`

- [ ] **Step 1: Mở trang xem trước ở cổng 1434 (chạy nền)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && pnpm exec vite --config scripts/ui-preview/vite.config.ts --port 1434 --strictPort
```
`run_in_background: true`; đợi `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:1434/scripts/demo-video/desktop.html` trả `200`. Không sửa file nào trong worktree khi đang quay (Vite tải lại trang làm hỏng lượt quay).

- [ ] **Step 2: Quay lần lượt ba bản** (mỗi bản khoảng 4,5 phút; `timeout` 600000)

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && PREVIEW_URL=http://127.0.0.1:1434 node scripts/demo-video/render.mjs --script desktop.ja 2>&1 | tail -6
```
rồi `--script desktop.zh`, `--script desktop.ko`.
Expected: mỗi lượt kết thúc không lỗi, ra `target/demo-video/ai-translator-demo.desktop.<lang>.mp4`, `target/demo-video/checks.desktop.<lang>.json` không có mục lỗi, video 30–60 giây.

- [ ] **Step 3: Tắt Vite**

```bash
kill $(lsof -tiTCP:1434 -sTCP:LISTEN)
```

- [ ] **Step 4: Xem khung chính** bằng Read: với mỗi ngôn ngữ, `target/demo-video/keyframes.desktop.<lang>/03-phu-de.png` và khung Gõ dịch (`08-dang-go` và khung sau khi dán, liệt kê bằng `ls target/demo-video/keyframes.desktop.<lang>/`). Kiểm: phụ đề bằng ngôn ngữ đích, chữ CJK đúng phông (kanji kiểu Nhật ở bản ja), không ô vuông, nhãn cảnh đọc được, ô chat và thanh tác vụ đúng chữ, không logo hay tên thương hiệu, màn kết chỉ có tên và địa chỉ website.

- [ ] **Step 5: Chép vào website, tạo ảnh bìa**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && for l in ja zh ko; do cp "target/demo-video/ai-translator-demo.desktop.$l.mp4" "website/src/assets/video/ai-translator-demo.$l.mp4" && cwebp -quiet -q 80 -resize 1440 900 "target/demo-video/keyframes.desktop.$l/03-phu-de.png" -o "website/src/assets/video/ai-translator-demo.$l.webp"; done && ls -la website/src/assets/video && for f in website/src/assets/video/*.mp4; do printf '%s ' "$f"; ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"; done
```
Expected: sáu file mới cạnh bốn file cũ; mỗi MP4 khoảng 2 MB (dưới 25 MiB), dài 30–60 giây.

- [ ] **Step 6: Kiểm `videoMeta` đọc được ba file mới**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk/website && node --input-type=module -e 'const { videoMeta } = await import("./src/build/mp4.mjs"); for (const l of ["ja", "zh", "ko"]) console.log(l, videoMeta(l))'
```
Expected: ba dòng dạng `ja { seconds: 40, clock: '0:40', iso: 'PT40S' }` (số giây có thể khác 40 một chút). (Nếu phần 1 chưa xong thì bỏ qua bước này; phần 4 kiểm lại.)

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/website-cjk && git branch --show-current && git add website/src/assets/video && git commit -q -m "feat(website): video giới thiệu tiếng Nhật, Trung, Hàn và ảnh bìa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Báo lại** cho người giao việc: bốn cặp phụ đề và câu Gõ dịch của từng ngôn ngữ (chép từ Task 5 Step 2), thời lượng và dung lượng ba video, đường dẫn tuyệt đối của ba MP4 trong `target/demo-video/` để chủ dự án xem.
