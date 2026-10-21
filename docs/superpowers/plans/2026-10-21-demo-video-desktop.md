# Video giới thiệu bản 16:10 (màn hình Windows thật) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng video 1920×1200 (16:10), khoảng 40 giây, trông như quay màn hình Windows 11 thật: cuộc họp video 4 người có thanh phụ đề thật của AI Translator, chuyển desktop mượt sang khung chat kiểu Messenger dùng ô Gõ dịch thật.

**Architecture:**
- **Dùng lại bộ công cụ bản dọc:** dữ liệu chữ thật đã duyệt `data/*.vi.json`, đồng hồ ảo, `audio.mjs`, `render.mjs`, `demo=1` của IPC giả.
- **Trang dựng cảnh mới `desktop.html`:** chia theo phần: vỏ Windows, cửa sổ họp, cửa sổ chat. Lịch thời gian thuần riêng (`desktop-timeline.mjs`) và bố cục thuần riêng (`desktop-layout.mjs`).
- **Clip người thật:** clip Mixkit được ffmpeg tách thành ảnh JPEG, mỗi khung hình hiện đúng ảnh của thời điểm đó, cho chạy tới rồi chạy lùi khi clip ngắn hơn cảnh.
- **`render.mjs`:** đọc loại trang, kích thước khung và khung chính từ kịch bản.

**Tech Stack:**
- Node 24 (ESM, `node:test`), Chrome qua `website/tools/browser/cdp.mjs`, Vite của `scripts/ui-preview`, ffmpeg/ffprobe 9.
- Font Noto Sans (SIL OFL), clip Mixkit (Mixkit Stock Video Free License).
- Không thêm thư viện npm/cargo.

**Spec:** `docs/superpowers/specs/2026-10-21-demo-video-desktop-design.md` (đọc trước); bản dọc: `docs/superpowers/specs/2026-10-21-demo-video-design.md`.

**Quy ước:**
- Comment và thông báo bằng tiếng Việt có dấu.
- Mỗi lệnh Bash bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/ai-translator &&`.
- Trước commit chạy `git branch --show-current`, phải ra `demo-video`.
- **Không push, không merge.**
- **Server Vite:** bật `node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1432` (chạy nền). Tắt bằng `kill $(lsof -tiTCP:1432 -sTCP:LISTEN)`, vì tên tiến trình là `vite.js`, mẫu `pkill -f "vite --config"` không khớp.

**Đã kiểm khi viết kế hoạch (2026-10-21):**
- **Pexels** chặn tải bằng lệnh (403), API cần khóa.
- **Mixkit** tải được trực tiếp `https://assets.mixkit.co/videos/<id>/<id>-720.mp4`, clip dài 7–15 giây.
- **Giấy phép Mixkit Stock Video Free License** (đọc tại `https://mixkit.co/license/modal/videoFree/`): được dùng cho YouTube, mạng xã hội, quảng cáo trực tuyến, dự án thương mại; được sửa, phân phối, phát sóng; không bắt buộc ghi nguồn. Giới hạn ở User Terms mục 9: không bán lại bản gốc chưa chỉnh, không đưa file riêng lẻ cho bên thứ ba, không xóa watermark.
- **Selawik** thiếu hầu hết chữ có dấu tiếng Việt, nên dùng **Noto Sans**.

---

## Cấu trúc file

| File | Việc |
|---|---|
| `scripts/demo-video/fonts/noto-sans-latin.woff2`, `noto-sans-vietnamese.woff2`, `OFL.txt`, `demo-font.css` | Font "Demo UI" (Noto Sans) thay Segoe UI |
| `scripts/demo-video/desktop-layout.mjs` (+ test) | Bố cục thuần: ô lưới họp, chỗ thanh phụ đề, chỗ ô Gõ dịch, cỡ ảnh, chỉ số khung chạy tới-lùi |
| `scripts/demo-video/desktop-timeline.mjs` (+ test) | Lịch thời gian bản 16:10, đường đi con trỏ |
| `scripts/demo-video/assets.json` | Clip/ảnh Mixkit: nguồn, giấy phép, đoạn cắt, tâm khung |
| `scripts/demo-video/assets.mjs` (+ test) | Tải clip, cắt khung, tách ảnh JPEG |
| `scripts/demo-video/script.desktop.vi.json` | Kịch bản bản 16:10 |
| `scripts/demo-video/desktop.html`, `desktop.css` | Trang dựng cảnh 1536×960 |
| `scripts/demo-video/desktop-dom.mjs` | Hàm DOM chung, biểu tượng SVG tự vẽ, thanh tiêu đề, ảnh đại diện |
| `scripts/demo-video/desktop-shell.mjs` | Thanh tác vụ, nhãn, ô hiện phím, con trỏ, màn kết |
| `scripts/demo-video/desktop-meeting.mjs` | Cửa sổ họp |
| `scripts/demo-video/desktop-chat.mjs` | Cửa sổ chat |
| `scripts/demo-video/desktop.mjs` | Nạp dữ liệu, ghép các phần, iframe app, hẹn sự kiện, `window.__stage` |
| Sửa `timeline.mjs` (+ test) | Bản dọc trả thêm `keyTimes`, `sounds` (bỏ `clicks`) |
| Sửa `audio.mjs` (+ test) | Tiếng bấm chuột, tiếng "pop"; ghép theo `sounds` |
| Sửa `render.mjs` | Theo loại trang của kịch bản |

Chạy mọi test: `node --test scripts/demo-video/*.test.mjs`.

---

### Task 1: Mốc hồi quy của bản dọc

Trước khi sửa code chung, quay một đoạn bản dọc để sau đối chiếu (spec §6.2).

**Files:** không có file mới trong repo.

- [ ] **Step 1: Bật server xem trước**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1432
```
Chạy nền (run_in_background). Chờ server sẵn sàng:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:1432/scripts/demo-video/stage.html | grep -q 200 && echo sẵn sàng && break; sleep 1; done
```
Kỳ vọng: `sẵn sàng`.

- [ ] **Step 2: Quay và lưu mã băm**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && rm -rf target/demo-video/regress-before && node scripts/demo-video/render.mjs --png-dir target/demo-video/regress-before --from 120 --to 240 && (cd target/demo-video/regress-before && shasum -a 256 *.png) > target/demo-video/regress-before.sha && wc -l target/demo-video/regress-before.sha
```
Kỳ vọng: `Xong: khung 120–239 …`, rồi `120 target/demo-video/regress-before.sha`.

---

### Task 2: Font

**Files:**
- Create: `scripts/demo-video/fonts/noto-sans-latin.woff2`, `scripts/demo-video/fonts/noto-sans-vietnamese.woff2`, `scripts/demo-video/fonts/OFL.txt`
- Create: `scripts/demo-video/fonts/demo-font.css`

- [ ] **Step 1: Tải font và giấy phép**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && mkdir -p scripts/demo-video/fonts && curl -fsSL -o scripts/demo-video/fonts/noto-sans-latin.woff2 https://fonts.gstatic.com/s/notosans/v42/o-0bIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjc5a7du3mhPy0.woff2 && curl -fsSL -o scripts/demo-video/fonts/noto-sans-vietnamese.woff2 https://fonts.gstatic.com/s/notosans/v42/o-0bIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjc5aHdu3mhPy1Fig.woff2 && curl -fsSL -o scripts/demo-video/fonts/OFL.txt https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/OFL.txt && file scripts/demo-video/fonts/*.woff2 && head -3 scripts/demo-video/fonts/OFL.txt
```
Kỳ vọng: hai dòng `Web Open Font Format (Version 2)`, và dòng `This Font Software is licensed under the SIL Open Font License, Version 1.1.`

- [ ] **Step 2: Khai báo font**

`scripts/demo-video/fonts/demo-font.css`:
```css
/* Font "Demo UI" của bản 16:10 (spec 2026-10-21-demo-video-desktop §2.4): Noto Sans (SIL OFL 1.1, xem OFL.txt), gần giống Segoe
   UI của Windows mà có đủ dấu tiếng Việt (Selawik thiếu). Một file biến thiên cho mỗi bảng chữ, mọi độ đậm 100–900. Dải ký tự theo
   Google Fonts. */
@font-face {
  font-family: "Demo UI";
  font-style: normal;
  font-weight: 100 900;
  src: url("./noto-sans-vietnamese.woff2") format("woff2");
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304,
    U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
}
@font-face {
  font-family: "Demo UI";
  font-style: normal;
  font-weight: 100 900;
  src: url("./noto-sans-latin.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F,
    U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/fonts && git commit -m "$(cat <<'EOF'
feat(demo-video): font Noto Sans thay Segoe UI cho bản 16:10

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Bố cục thuần

**Files:**
- Create: `scripts/demo-video/desktop-layout.mjs`
- Test: `scripts/demo-video/desktop-layout.test.mjs`

- [ ] **Step 1: Viết test**

`scripts/demo-video/desktop-layout.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { composeBox, meetingTiles, overlayBox, pingPong, pixelSize } from "./desktop-layout.mjs";

const LAYOUT = {
  workArea: { width: 1536, height: 912 },
  meeting: { titleBar: 32, topBar: 48, controlBar: 72, padding: 12, gap: 10 },
  overlay: { width: 900, height: 200, fontSize: 22, bottomGap: 72 },
  compose: { width: 560, topRatio: 0.25 },
};

test("lưới 2×2 nằm giữa thanh trên và thanh điều khiển, cách nhau 10 điểm", () => {
  assert.deepEqual(meetingTiles(LAYOUT), [
    { left: 12, top: 92, width: 751, height: 363 },
    { left: 773, top: 92, width: 751, height: 363 },
    { left: 12, top: 465, width: 751, height: 363 },
    { left: 773, top: 465, width: 751, height: 363 },
  ]);
});

test("thanh phụ đề đặt như app: giữa, cách đáy vùng làm việc 72 điểm", () => {
  assert.deepEqual(overlayBox(LAYOUT), { left: 318, top: 640, width: 900, height: 200 });
});

test("ô Gõ dịch đặt như app trên Windows: giữa màn hình, mép trên ở 25% chiều cao", () => {
  assert.deepEqual(composeBox(LAYOUT, { width: 1536, height: 960 }), { left: 488, top: 240, width: 560 });
});

test("cỡ ảnh của ô ở mật độ 1,25, làm tròn số chẵn", () => {
  assert.deepEqual(pixelSize({ width: 751, height: 363 }, 1.25), { width: 938, height: 454 });
});

test("chỉ số khung chạy tới rồi lùi khi clip ngắn hơn cảnh", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => pingPong(i, 4)),
    [0, 1, 2, 3, 2, 1, 0, 1, 2, 3],
  );
  assert.equal(pingPong(5, 1), 0);
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/desktop-layout.test.mjs`
Kỳ vọng: FAIL, không tìm thấy `desktop-layout.mjs`.

- [ ] **Step 3: Viết module**

`scripts/demo-video/desktop-layout.mjs`:
```js
// Bố cục thuần của bản 16:10 (spec 2026-10-21-demo-video-desktop §2.3), dùng chung cho trang dựng cảnh và assets.mjs. Toạ độ là
// điểm CSS của màn hình 1536×960; vị trí thanh phụ đề và ô Gõ dịch theo đúng app (src-tauri/src/overlay/placement.rs,
// src-tauri/src/compose/native_windows.rs).

/** Bốn ô của lưới 2×2 trong cửa sổ họp phóng to. */
export function meetingTiles(L) {
  const M = L.meeting;
  const top = M.titleBar + M.topBar + M.padding;
  const bottom = L.workArea.height - M.controlBar - M.padding;
  const width = (L.workArea.width - 2 * M.padding - M.gap) / 2;
  const height = (bottom - top - M.gap) / 2;
  return [0, 1, 2, 3].map((i) => ({
    left: M.padding + (i % 2) * (width + M.gap),
    top: top + Math.floor(i / 2) * (height + M.gap),
    width,
    height,
  }));
}

/** Thanh phụ đề ở chỗ mặc định của app: giữa vùng làm việc, cách đáy `bottomGap`. */
export function overlayBox(L) {
  const o = L.overlay;
  return { left: (L.workArea.width - o.width) / 2, top: L.workArea.height - o.bottomGap - o.height, width: o.width, height: o.height };
}

/** Ô Gõ dịch ở chỗ app mở trên Windows: giữa màn hình, mép trên ở `topRatio` chiều cao màn hình. */
export function composeBox(L, viewport) {
  return { left: (viewport.width - L.compose.width) / 2, top: Math.round(viewport.height * L.compose.topRatio), width: L.compose.width };
}

/** Cỡ ảnh (điểm ảnh) của một ô ở mật độ `dpr`, làm tròn số chẵn cho ffmpeg. */
export function pixelSize(box, dpr) {
  const even = (v) => 2 * Math.round((v * dpr) / 2);
  return { width: even(box.width), height: even(box.height) };
}

/** Khung thứ `i` của một clip `count` khung chạy tới rồi lùi (0, 1, …, count-1, count-2, …, 1, 0, 1, …). */
export function pingPong(i, count) {
  if (count <= 1) return 0;
  const k = i % (2 * count - 2);
  return k < count ? k : 2 * count - 2 - k;
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/desktop-layout.test.mjs`
Kỳ vọng: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/desktop-layout.mjs scripts/demo-video/desktop-layout.test.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): bố cục bản 16:10 theo vị trí thật của app trên Windows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `keyTimes`, `sounds` cho bản dọc; tiếng bấm chuột và "pop"

**Files:**
- Modify: `scripts/demo-video/timeline.mjs` (hàm `buildTimeline`)
- Modify: `scripts/demo-video/timeline.test.mjs` (test cuối)
- Modify: `scripts/demo-video/audio.mjs`
- Modify: `scripts/demo-video/audio.test.mjs`

- [ ] **Step 1: Sửa test của bản dọc**

Trong `scripts/demo-video/timeline.test.mjs`, test "lịch cả video…", thay dòng:
```js
  assert.deepEqual(tl.clicks, [c.pressAt, ...c.typing.map((k) => k.at), c.enter1At, c.enter2At]);
```
bằng:
```js
  assert.deepEqual(
    tl.sounds,
    [c.pressAt, ...c.typing.map((k) => k.at), c.enter1At, c.enter2At].map((at) => ({ at, kind: "key" })),
  );
  assert.equal(tl.clicks, undefined);
  assert.deepEqual(tl.keyTimes, {
    "01-mo-dau": 1500,
    "02-dang-noi": 3000 + 4000,
    "03-phu-de": liveEnd - 1250,
    "04-tin-nhan": c.sarahAt + 600,
    "05-phim-tat": c.pressAt + 60,
    "06-dang-go": c.typing[1].at + 10,
    "07-ban-dich": c.translatedAt + 300,
    "08-da-dan": c.pasteAt + 400,
    "09-da-gui": c.enter2At + 700,
    "10-ket": tl.totalMs - 1500,
  });
```

- [ ] **Step 2: Sửa test của audio**

Thay toàn bộ `scripts/demo-video/audio.test.mjs` bằng:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIO_RATE, clickSample, mixAudio, mouseSample, popSample } from "./audio.mjs";

test("tiếng gõ phím lần nào cũng như nhau, dài 14 ms, không vượt 0,35", () => {
  const a = clickSample();
  assert.deepEqual(Array.from(a), Array.from(clickSample()));
  assert.equal(a.length, Math.round(0.014 * AUDIO_RATE));
  assert.ok(a.every((v) => Math.abs(v) <= 0.35));
  assert.ok(a.some((v) => Math.abs(v) > 0.05));
});

test("tiếng bấm chuột và tiếng pop lần nào cũng như nhau, có tiếng, không vượt 0,3", () => {
  for (const make of [mouseSample, popSample]) {
    const a = make();
    assert.deepEqual(Array.from(a), Array.from(make()));
    assert.ok(a.every((v) => Math.abs(v) <= 0.3));
    assert.ok(a.some((v) => Math.abs(v) > 0.02));
  }
  assert.equal(mouseSample().length, Math.round(0.06 * AUDIO_RATE));
  assert.equal(popSample().length, Math.round(0.09 * AUDIO_RATE));
});

test("giọng đặt đúng mốc, từng loại tiếng ở đúng chỗ, dài đúng totalMs", () => {
  const voice = new Float32Array(480).fill(0.5);
  const sounds = [
    { at: 500, kind: "key" },
    { at: 1500, kind: "key" },
    { at: 1700, kind: "mouse" },
    { at: 1900, kind: "pop" },
  ];
  const out = mixAudio({ voice, voiceStartMs: 1000, sounds, totalMs: 2000 });
  assert.equal(out.length, 2 * AUDIO_RATE);
  assert.equal(out[47_999], 0);
  assert.equal(out[48_000], 0.5);
  assert.equal(out[48_479], 0.5);
  assert.equal(out[48_480], 0);
  assert.equal(out[24_000], clickSample()[0]);
  assert.equal(out[72_010], clickSample()[10]);
  assert.equal(out[81_600 + 5], mouseSample()[5]);
  assert.equal(out[91_200 + 300], popSample()[300]);
});

test("loại tiếng lạ thì báo lỗi", () => {
  assert.throws(() => mixAudio({ voice: new Float32Array(0), voiceStartMs: 0, sounds: [{ at: 0, kind: "bell" }], totalMs: 10 }), /bell/);
});

test("cộng dồn quá 1 thì kẹp lại", () => {
  const out = mixAudio({ voice: new Float32Array(10).fill(1.5), voiceStartMs: 0, sounds: [], totalMs: 1 });
  assert.deepEqual(Array.from(out.subarray(0, 10)), new Array(10).fill(1));
});
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/timeline.test.mjs scripts/demo-video/audio.test.mjs`
Kỳ vọng: FAIL (thiếu `sounds`, `keyTimes`, `mouseSample`, `popSample`).

- [ ] **Step 4: Sửa `buildTimeline`**

Trong `scripts/demo-video/timeline.mjs`, hàm `buildTimeline`:

Thay:
```js
  const totalMs = chatEnd + s.outroMs;
  return {
```
bằng:
```js
  const totalMs = chatEnd + s.outroMs;
  const sarahAt = liveEnd + c.sarahMsgMs;
  return {
```

Thay:
```js
    chat: { sarahAt: liveEnd + c.sarahMsgMs, hotkeyAt, pressAt, composeOpenAt, typing, translateAt, translatedAt, enter1At, pasteAt, enter2At },
```
bằng:
```js
    chat: { sarahAt, hotkeyAt, pressAt, composeOpenAt, typing, translateAt, translatedAt, enter1At, pasteAt, enter2At },
```

Thay:
```js
    clicks: [pressAt, ...typing.map((k) => k.at), enter1At, enter2At],
  };
```
bằng:
```js
    sounds: [pressAt, ...typing.map((k) => k.at), enter1At, enter2At].map((at) => ({ at, kind: "key" })),
    // Khung chính để xem lại (spec §5.5): tên ảnh → thời điểm.
    keyTimes: {
      "01-mo-dau": 1500,
      "02-dang-noi": voiceStartMs + 4000,
      "03-phu-de": liveEnd - s.liveHoldMs / 2,
      "04-tin-nhan": sarahAt + 600,
      "05-phim-tat": pressAt + 60,
      "06-dang-go": typing[Math.floor(typing.length / 2)].at + 10,
      "07-ban-dich": translatedAt + 300,
      "08-da-dan": pasteAt + 400,
      "09-da-gui": enter2At + 700,
      "10-ket": totalMs - 1500,
    },
  };
```

- [ ] **Step 5: Sửa `audio.mjs`**

Thay toàn bộ `scripts/demo-video/audio.mjs` bằng:
```js
// Ghép tiếng của video (spec 2026-10-21-demo-video §2.5, bản 16:10 §5): giọng đọc đặt ở `voiceStartMs`, các tiếng tự sinh (gõ phím,
// bấm chuột, "pop" báo tin nhắn) ở các mốc `sounds`, dài đúng `totalMs`. 48 kHz mono, giá trị trong [-1, 1]. Mọi tiếng dùng bộ
// sinh số giả ngẫu nhiên cố định hay hàm sin, nên lần nào cũng như nhau.

export const AUDIO_RATE = 48_000;

/** Tiếng gõ phím: xung nhiễu trắng 14 ms tắt dần. */
export function clickSample(rate = AUDIO_RATE) {
  const out = new Float32Array(Math.round(0.014 * rate));
  let seed = 12_345;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    const noise = seed / 0x3fffffff - 1;
    out[i] = Math.max(-0.35, Math.min(0.35, noise * Math.exp(-i / (0.0025 * rate)) * 0.35));
  }
  return out;
}

/** Tiếng bấm chuột: hai xung nhiễu ngắn (nhấn, nhả cách 45 ms) qua bộ lọc thông thấp một cực, trầm hơn tiếng gõ phím. */
export function mouseSample(rate = AUDIO_RATE) {
  const out = new Float32Array(Math.round(0.06 * rate));
  let seed = 54_321;
  let low = 0;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    const noise = seed / 0x3fffffff - 1;
    const t = i / rate;
    const env = Math.exp(-t / 0.002) + (t >= 0.045 ? 0.6 * Math.exp(-(t - 0.045) / 0.002) : 0);
    low += 0.25 * (noise - low);
    out[i] = Math.max(-0.29, Math.min(0.29, low * env * 0.6));
  }
  return out;
}

/** Tiếng "pop" báo tin nhắn: sóng sin 90 ms, cao độ trượt từ 620 lên 940 Hz, vào nhanh tắt dần. */
export function popSample(rate = AUDIO_RATE) {
  const out = new Float32Array(Math.round(0.09 * rate));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    phase += (2 * Math.PI * (620 + 320 * Math.min(1, t / 0.05))) / rate;
    out[i] = Math.sin(phase) * Math.min(1, t / 0.004) * Math.exp(-t / 0.025) * 0.3;
  }
  return out;
}

const SAMPLES = { key: clickSample, mouse: mouseSample, pop: popSample };

/** Trộn giọng và các tiếng thành một track dài `totalMs`. */
export function mixAudio({ voice, voiceStartMs, sounds, totalMs, rate = AUDIO_RATE }) {
  const out = new Float32Array(Math.round((totalMs / 1000) * rate));
  const add = (src, startMs) => {
    const offset = Math.round((startMs / 1000) * rate);
    for (let i = 0; i < src.length; i++) {
      const j = offset + i;
      if (j >= 0 && j < out.length) out[j] += src[i];
    }
  };
  add(voice, voiceStartMs);
  const made = new Map();
  for (const { at, kind } of sounds) {
    const make = SAMPLES[kind];
    if (!make) throw new Error(`không có tiếng "${kind}"`);
    if (!made.has(kind)) made.set(kind, make(rate));
    add(made.get(kind), at);
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}
```

- [ ] **Step 6: Chạy test, thấy đạt**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/*.test.mjs`
Kỳ vọng: `# fail 0`. `render.mjs` chưa sửa nên còn dùng `tl.clicks`; Task 5 sửa nó trước khi quay lại.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/timeline.mjs scripts/demo-video/timeline.test.mjs scripts/demo-video/audio.mjs scripts/demo-video/audio.test.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): lịch trả keyTimes và sounds; thêm tiếng bấm chuột, tiếng pop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `render.mjs` theo loại trang của kịch bản

**Files:**
- Modify: `scripts/demo-video/render.mjs` (thay toàn bộ)

Task này cần `desktop-timeline.mjs` để import. Tạo trước một file tạm chỉ có hàm báo lỗi, Task 6 thay bằng bản thật.

- [ ] **Step 1: File tạm `desktop-timeline.mjs`**

```js
// Lịch thời gian bản 16:10: Task 6 của kế hoạch 2026-10-21-demo-video-desktop viết bản thật.
export function buildDesktopTimeline() {
  throw new Error("desktop-timeline.mjs chưa viết");
}
```

- [ ] **Step 2: Thay `render.mjs`**

Thay toàn bộ `scripts/demo-video/render.mjs` bằng:
```js
// Quay video giới thiệu (spec 2026-10-21-demo-video §2.5, §5; bản 16:10: spec 2026-10-21-demo-video-desktop §2.6). Mở trang dựng
// cảnh của kịch bản (stage.html cho bản dọc, desktop.html khi kịch bản có `"stage": "desktop"`) trong Chrome không đầu với đồng hồ
// ảo (vclock.js), chụp từng khung theo `viewport` của kịch bản (mặc định 540×960 điểm, mật độ 2), ghép tiếng (audio.mjs) rồi gọi
// ffmpeg ra MP4. Kiểm luôn:
// - mỗi phụ đề chốt đã có trên thanh phụ đề ở đúng khung của nó;
// - ô soạn xin dịch đúng một lần, đúng lúc lịch tính;
// - trang không có lỗi JS;
// - video dài 30–60 giây.
// Kết quả kiểm ghi ở target/demo-video/checks.<kịch bản>.json. Cần trang xem trước ở cổng 1432 và ffmpeg:
//   node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1432 &
//   node scripts/demo-video/render.mjs [--script vi|desktop.vi]                 # → target/demo-video/ai-translator-demo.<kịch bản>.mp4
//   node scripts/demo-video/render.mjs --png-dir <thư mục> --from 120 --to 240    # chỉ ghi PNG các khung [from, to), không ffmpeg
//     thêm --guides để tô đỏ phần ngoài vùng an toàn (bản dọc, chỉ khi ghi PNG)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { launch } from "../../website/tools/browser/cdp.mjs";
import { AUDIO_RATE, mixAudio } from "./audio.mjs";
import { buildDesktopTimeline } from "./desktop-timeline.mjs";
import { FPS, FRAME_MS, buildTimeline } from "./timeline.mjs";
import { readWav, writeWav } from "./wav.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../target/demo-video");
const BASE = process.env.PREVIEW_URL ?? "http://127.0.0.1:1432";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { values: opts } = parseArgs({
  options: {
    script: { type: "string", default: "vi" },
    "png-dir": { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    guides: { type: "boolean", default: false },
  },
});
const name = opts.script;
const json = (file) => JSON.parse(readFileSync(path.join(here, file), "utf8"));
const script = json(`script.${name}.json`);
// Bộ dữ liệu chữ thật (voice/live/compose): kịch bản 16:10 dùng lại bộ của bản dọc.
const data = script.data ?? name;
const desktop = script.stage === "desktop";
const page = desktop ? "desktop.html" : "stage.html";
const viewport = script.viewport ?? { width: 540, height: 960, dpr: 2 };
const voice = json(`data/voice.${data}.json`);
const build = desktop ? buildDesktopTimeline : buildTimeline;
const tl = build(script, voice, json(`data/live.${data}.json`), json(`data/compose.${data}.json`));
if (tl.totalMs < 30_000 || tl.totalMs > 60_000) {
  console.error(`Video dài ${(tl.totalMs / 1000).toFixed(1)} giây, ngoài khoảng 30–60 giây: sửa kịch bản.`);
  process.exit(1);
}
const pngDir = opts["png-dir"];
const full = pngDir === undefined;
if (full && opts.guides) {
  console.error("--guides chỉ dùng với --png-dir: dải đỏ không được vào video.");
  process.exit(1);
}
const from = Number(opts.from ?? 0);
const to = Math.min(tl.frames, Number(opts.to ?? tl.frames));
mkdirSync(out, { recursive: true });
if (!full) mkdirSync(pngDir, { recursive: true });

const c = tl.chat;
const keyFrames = new Map(Object.entries(tl.keyTimes).map(([key, ms]) => [Math.round(ms / FRAME_MS), key]));
const posterFrame = Math.round(tl.posterMs / FRAME_MS);

let ffmpeg = null;
let ffmpegDone = null;
if (full) {
  const voiceFile = path.join(out, `voice48.${data}.wav`);
  const bytes = readFileSync(voiceFile);
  if (createHash("sha256").update(bytes).digest("hex") !== voice.sha256) {
    console.error(`${voiceFile} khác file đã dùng để lấy chữ (data/voice.${data}.json): chạy lại voice.mjs rồi data.mjs.`);
    process.exit(1);
  }
  const audioFile = path.join(out, `audio.${name}.wav`);
  const mixed = mixAudio({ voice: readWav(bytes).samples, voiceStartMs: tl.voiceStartMs, sounds: tl.sounds, totalMs: tl.totalMs });
  writeFileSync(audioFile, writeWav(mixed, AUDIO_RATE));
  mkdirSync(path.join(out, `keyframes.${name}`), { recursive: true });
  const mp4 = path.join(out, `ai-translator-demo.${name}.mp4`);
  ffmpeg = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
      "-i", audioFile,
      "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", "-shortest", mp4,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  ffmpegDone = new Promise((resolve, reject) => {
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg thoát với mã ${code}`))));
  });
  console.log(`→ ${mp4}`);
}

const failures = [];
const timing = [];
const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome");
try {
  const tab = await browser.newPage({ width: viewport.width, height: viewport.height, dpr: viewport.dpr });
  await tab.s.send("Page.addScriptToEvaluateOnNewDocument", { source: readFileSync(path.join(here, "vclock.js"), "utf8") });
  await tab.goto(`${BASE}/scripts/demo-video/${page}?script=${name}${opts.guides ? "&guides=1" : ""}`);
  for (let i = 0; !(await tab.eval("window.__stage?.ready === true")); i++) {
    if (i > 300) throw new Error(`trang dựng cảnh chưa sẵn sàng sau 30 giây: ${tab.errors.join(" | ")}`);
    await sleep(100);
  }
  const finals = tl.overlayEvents.filter((e) => e.event === "subtitle://upsert" && e.payload.status === "done" && !e.payload.provisional);
  for (let i = 0; i < to; i++) {
    const t = i * FRAME_MS;
    // Tiến đồng hồ tới khung này, vẽ (đợi ảnh của khung đã giải mã), rồi chờ hai khung thật của Chrome để trang và iframe vẽ xong.
    await tab.eval(
      `(async () => { await __vclock.advanceTo(${t}); await __stage.render(${t}); await new Promise((r) => __vclock.realFrame(() => __vclock.realFrame(r))); })()`,
    );
    for (const e of finals.filter((f) => f.at > t - FRAME_MS && f.at <= t)) {
      const shown = await tab.eval(
        `document.querySelector(".overlay-frame").contentDocument.querySelector(".overlay .lines").textContent.includes(${JSON.stringify(e.payload.tgt_text)})`,
      );
      timing.push({ id: e.payload.id, scheduledMs: e.at, frameMs: t, shown });
      if (!shown) failures.push(`phụ đề ${e.payload.id} chưa có trên thanh phụ đề ở khung ${i} (${t.toFixed(1)} ms)`);
    }
    if (i < from) continue;
    const shot = Buffer.from((await tab.s.send("Page.captureScreenshot", { format: "png" })).data, "base64");
    if (full) {
      if (!ffmpeg.stdin.write(shot)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
      if (i === posterFrame) writeFileSync(path.join(out, `poster.${name}.png`), shot);
      if (keyFrames.has(i)) writeFileSync(path.join(out, `keyframes.${name}`, `${keyFrames.get(i)}.png`), shot);
    } else {
      writeFileSync(path.join(pngDir, `${String(i).padStart(5, "0")}.png`), shot);
    }
    if (i % 150 === 0) console.log(`  khung ${i}/${to}`);
  }
  if (to * FRAME_MS > c.translatedAt) {
    const asked = await tab.eval("__stage.log.translateAt");
    if (asked.length !== 1 || Math.abs(asked[0] - c.translateAt) > 1) {
      failures.push(`ô soạn xin dịch ${asked.length} lần (ở ${asked.join(", ")} ms), lịch tính một lần ở ${c.translateAt} ms`);
    }
  }
  failures.push(...tab.errors.filter((e) => !e.includes("status of 404")).map((e) => `lỗi trong trang: ${e}`));
} finally {
  await browser.close();
}
if (full) {
  ffmpeg.stdin.end();
  await ffmpegDone;
}
writeFileSync(
  path.join(out, `checks.${name}.json`),
  `${JSON.stringify({ totalMs: tl.totalMs, frames: tl.frames, range: [from, to], timing, failures }, null, 1)}\n`,
);
if (failures.length > 0) {
  console.error(`Không đạt:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Xong: khung ${from}–${to - 1} / ${tl.frames}, video ${(tl.totalMs / 1000).toFixed(1)} giây; đã kiểm ${timing.length} phụ đề chốt.`);
```

- [ ] **Step 3: Kiểm hồi quy bản dọc**

Server 1432 vẫn chạy từ Task 1.
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && rm -rf target/demo-video/regress-after && node scripts/demo-video/render.mjs --png-dir target/demo-video/regress-after --from 120 --to 240 && (cd target/demo-video/regress-after && shasum -a 256 *.png) > target/demo-video/regress-after.sha && diff -q target/demo-video/regress-before.sha target/demo-video/regress-after.sha && echo "BẢN DỌC GIỐNG HỆT"
```
Kỳ vọng: `BẢN DỌC GIỐNG HỆT`. Khác thì dùng superpowers:systematic-debugging trước khi đi tiếp.

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/render.mjs scripts/demo-video/desktop-timeline.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): render.mjs theo loại trang, kích thước khung và khung chính của kịch bản

Bản dọc quay lại ra y hệt (mã băm khung 120–239 không đổi).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Lịch thời gian bản 16:10

**Files:**
- Modify: `scripts/demo-video/desktop-timeline.mjs` (thay file tạm)
- Test: `scripts/demo-video/desktop-timeline.test.mjs`

- [ ] **Step 1: Viết test**

`scripts/demo-video/desktop-timeline.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { SLIDE_MS, buildDesktopTimeline, cursorAt, ease } from "./desktop-timeline.mjs";
import { CAPTURE_DISPLAY_MS, FRAME_MS } from "./timeline.mjs";

const SCRIPT = {
  timing: {
    voiceStartMs: 800,
    liveHoldMs: 2000,
    outroMs: 4000,
    meetingLabel: { from: 800, to: 3800 },
    chatLabel: { from: 500, to: 3500 },
    chat: {
      typing1StartMs: 300,
      typing1Ms: 1200,
      moveAfterMsgMs: 500,
      moveMs: 700,
      clickAfterMoveMs: 100,
      hotkeyAfterClickMs: 600,
      pressMs: 200,
      openAfterHotkeyMs: 250,
      typingAfterOpenMs: 600,
      pace: { charMs: 70, spaceMs: 110, punctuationMs: 260 },
      readMs: 1500,
      pasteMs: 150,
      reviewMs: 1000,
      typing2StartMs: 700,
      typing2Ms: 1500,
      holdMs: 1500,
    },
  },
  labels: { meeting: { text: "M" }, chat: { text: "C" } },
  chat: { reply: "Dạ." },
  layout: { cursor: { rest: { x: 1290, y: 560 }, input: { x: 860, y: 788 } } },
};
const VOICE = { durationMs: 10_000, levelWindowMs: 100, levels: [0.1] };
const LIVE = { events: [{ t_ms: 11_000, kind: "subtitle", id: 1, status: "done" }] };
const COMPOSE = { src: "Dạ.", hyp: "Yes.", total_ms: 300, first_token_ms: 20 };

test("làm mượt đầu cuối đi qua 0, 0,5 và 1", () => {
  assert.equal(ease(0), 0);
  assert.equal(ease(0.5), 0.5);
  assert.equal(ease(1), 1);
  assert.ok(ease(0.25) < 0.25);
});

test("con trỏ đứng yên ở mốc, đi mượt giữa hai mốc, đổi hình khi tới mốc sau", () => {
  const path = [
    { at: 0, x: 1290, y: 560, kind: "arrow" },
    { at: 1000, x: 1290, y: 560, kind: "arrow" },
    { at: 1700, x: 860, y: 788, kind: "text" },
  ];
  assert.deepEqual(cursorAt(path, -5), { x: 1290, y: 560, kind: "arrow" });
  assert.deepEqual(cursorAt(path, 1000), { x: 1290, y: 560, kind: "arrow" });
  assert.deepEqual(cursorAt(path, 1350), { x: 1075, y: 674, kind: "arrow" });
  assert.deepEqual(cursorAt(path, 1700), { x: 860, y: 788, kind: "text" });
  assert.deepEqual(cursorAt(path, 9000), { x: 860, y: 788, kind: "text" });
});

test("lịch bản 16:10: cảnh họp, chuyển cảnh, chat, màn kết đúng thứ tự và độ dài", () => {
  const tl = buildDesktopTimeline(SCRIPT, VOICE, LIVE, COMPOSE);
  const liveEnd = 800 + 11_000 + CAPTURE_DISPLAY_MS + 2000; // 13 880: sự kiện cuối muộn hơn lúc hết giọng
  assert.equal(liveEnd, 13_880);
  assert.deepEqual(tl.scenes.meeting, [0, liveEnd]);
  assert.deepEqual(tl.scenes.slide, [liveEnd, liveEnd + SLIDE_MS]);
  const c = tl.chat;
  assert.deepEqual(c.typing1, [15_080, 16_280]);
  assert.equal(c.sarahAt, 16_280);
  assert.equal(c.clickAt, 17_580);
  assert.equal(c.hotkeyAt, 18_180);
  assert.equal(c.pressAt, 18_380);
  assert.equal(c.composeOpenAt, 18_430);
  assert.deepEqual(
    c.typing.map((k) => k.at),
    [19_030, 19_100, 19_170],
  );
  assert.equal(c.translateAt, 19_570);
  assert.equal(c.translatedAt, 19_870);
  assert.equal(c.enter1At, 21_370);
  assert.equal(c.pasteAt, 21_520);
  assert.equal(c.enter2At, 22_520);
  assert.equal(c.sentAt, 22_600);
  assert.deepEqual(c.typing2, [23_220, 24_720]);
  assert.equal(c.replyAt, 24_720);
  assert.deepEqual(tl.scenes.chat, [14_780, 26_220]);
  assert.equal(tl.totalMs, 30_220);
  assert.equal(tl.frames, Math.ceil(30_220 / FRAME_MS));
  assert.equal(tl.posterMs, 12_880);
  assert.deepEqual(
    tl.labels.map((l) => [l.text, l.from, l.to]),
    [
      ["M", 800, 3800],
      ["C", 15_280, 18_280],
    ],
  );
  assert.deepEqual(tl.keys, [
    { keys: ["Ctrl", "Alt", "G"], from: 18_080, to: 19_280, down: [18_380, 18_560] },
    { keys: ["Enter"], from: 21_250, to: 22_070, down: [21_370, 21_520] },
    { keys: ["Enter"], from: 22_400, to: 23_220, down: [22_520, 22_670] },
  ]);
  assert.deepEqual(tl.cursorPath, [
    { at: 0, x: 1290, y: 560, kind: "arrow" },
    { at: 16_780, x: 1290, y: 560, kind: "arrow" },
    { at: 17_480, x: 860, y: 788, kind: "text" },
  ]);
  assert.deepEqual(tl.sounds, [
    { at: 16_280, kind: "pop" },
    { at: 17_580, kind: "mouse" },
    { at: 18_380, kind: "key" },
    { at: 19_030, kind: "key" },
    { at: 19_100, kind: "key" },
    { at: 19_170, kind: "key" },
    { at: 21_370, kind: "key" },
    { at: 22_520, kind: "key" },
    { at: 24_720, kind: "pop" },
  ]);
  assert.deepEqual(
    tl.overlayEvents.map((e) => [e.at, e.event]),
    [
      [800, "audio://level"],
      [11_880, "subtitle://upsert"],
    ],
  );
  assert.equal(tl.compose.text, "Yes.");
  assert.equal(Object.keys(tl.keyTimes).length, 13);
  assert.equal(tl.keyTimes["13-ket"], 29_220);
});

test("câu trả lời của kịch bản phải đúng câu đã dịch trong compose.json", () => {
  assert.throws(() => buildDesktopTimeline(SCRIPT, VOICE, LIVE, { ...COMPOSE, src: "Câu khác." }), /compose/);
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/desktop-timeline.test.mjs`
Kỳ vọng: FAIL (`SLIDE_MS`, `cursorAt`, `ease` chưa có).

- [ ] **Step 3: Viết module**

Thay toàn bộ `scripts/demo-video/desktop-timeline.mjs` bằng:
```js
// Lịch thời gian bản 16:10 (spec 2026-10-21-demo-video-desktop §3): module thuần, dùng chung cho desktop.mjs (trình duyệt) và
// render.mjs (Node). Mọi mốc là ms từ đầu video. Dùng lại các hàm của timeline.mjs (bản dọc): phụ đề cộng 80 ms, mức âm lượng, lịch
// gõ, bản dịch về dần. Trả cùng các trường render.mjs cần như lịch bản dọc.
import { COMPOSE_DEBOUNCE_MS, FRAME_MS, levelEvents, revealDeltas, subtitleEvents, typingSchedule } from "./timeline.mjs";

// Chuyển desktop ảo: cả màn hình trượt ngang.
export const SLIDE_MS = 900;

/** Làm mượt đầu cuối (easeInOutCubic) cho `p` trong [0, 1]. */
export const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/** Con trỏ ở thời điểm `t` theo các mốc `[{ at, x, y, kind }]`: đứng yên ở mốc, đi mượt giữa hai mốc, đổi hình khi tới mốc sau. */
export function cursorAt(path, t) {
  if (t <= path[0].at) return { x: path[0].x, y: path[0].y, kind: path[0].kind };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (t < b.at) {
      const p = ease((t - a.at) / (b.at - a.at));
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, kind: a.kind };
    }
  }
  const last = path.at(-1);
  return { x: last.x, y: last.y, kind: last.kind };
}

/** Lịch cả video bản 16:10 từ kịch bản và dữ liệu thật (voice.json, live.json, compose.json). */
export function buildDesktopTimeline(script, voice, live, compose) {
  if (compose.src !== script.chat.reply) {
    throw new Error(`câu trả lời của kịch bản khác câu đã dịch trong compose.json ("${compose.src}"): chạy lại data.mjs`);
  }
  const s = script.timing;
  const c = s.chat;
  const voiceStartMs = s.voiceStartMs;
  const subtitles = subtitleEvents(live.events, voiceStartMs);
  const lastAt = subtitles.length > 0 ? subtitles.at(-1).at : voiceStartMs;
  const liveEnd = Math.max(voiceStartMs + voice.durationMs, lastAt) + s.liveHoldMs;
  const slide = [liveEnd, liveEnd + SLIDE_MS];
  const chatStart = slide[1];
  const typing1 = [chatStart + c.typing1StartMs, chatStart + c.typing1StartMs + c.typing1Ms];
  const sarahAt = typing1[1];
  const moveFrom = sarahAt + c.moveAfterMsgMs;
  const arriveAt = moveFrom + c.moveMs;
  const clickAt = arriveAt + c.clickAfterMoveMs;
  const hotkeyAt = clickAt + c.hotkeyAfterClickMs;
  const pressAt = hotkeyAt + c.pressMs;
  const composeOpenAt = hotkeyAt + c.openAfterHotkeyMs;
  const typing = typingSchedule(script.chat.reply, composeOpenAt + c.typingAfterOpenMs, c.pace);
  const translateAt = typing.at(-1).at + COMPOSE_DEBOUNCE_MS;
  const translatedAt = translateAt + compose.total_ms;
  const enter1At = translatedAt + c.readMs;
  const pasteAt = enter1At + c.pasteMs;
  const enter2At = pasteAt + c.reviewMs;
  const sentAt = enter2At + 80;
  const typing2 = [enter2At + c.typing2StartMs, enter2At + c.typing2StartMs + c.typing2Ms];
  const replyAt = typing2[1];
  const chatEnd = replyAt + c.holdMs;
  const totalMs = chatEnd + s.outroMs;
  const { rest, input } = script.layout.cursor;
  return {
    totalMs,
    frames: Math.ceil(totalMs / FRAME_MS),
    voiceStartMs,
    posterMs: liveEnd - s.liveHoldMs / 2,
    scenes: { meeting: [0, liveEnd], slide, chat: [chatStart, chatEnd], outro: [chatEnd, Number.POSITIVE_INFINITY] },
    labels: [
      { ...script.labels.meeting, from: s.meetingLabel.from, to: s.meetingLabel.to },
      { ...script.labels.chat, from: chatStart + s.chatLabel.from, to: chatStart + s.chatLabel.to },
    ],
    overlayEvents: [...subtitles, ...levelEvents(voice.levels, voice.levelWindowMs, voiceStartMs)].sort((a, b) => a.at - b.at),
    chat: {
      typing1, sarahAt, clickAt, hotkeyAt, pressAt, composeOpenAt, typing, translateAt, translatedAt, enter1At, pasteAt, enter2At,
      sentAt, typing2, replyAt,
    },
    keys: [
      { keys: ["Ctrl", "Alt", "G"], from: hotkeyAt - 100, to: hotkeyAt + 1100, down: [pressAt, pressAt + 180] },
      { keys: ["Enter"], from: enter1At - 120, to: enter1At + 700, down: [enter1At, enter1At + 150] },
      { keys: ["Enter"], from: enter2At - 120, to: enter2At + 700, down: [enter2At, enter2At + 150] },
    ],
    cursorPath: [
      { at: 0, ...rest, kind: "arrow" },
      { at: moveFrom, ...rest, kind: "arrow" },
      { at: arriveAt, ...input, kind: "text" },
    ],
    compose: {
      text: compose.hyp,
      deltas: revealDeltas(compose.hyp, compose.first_token_ms ?? 0, compose.total_ms),
      totalMs: compose.total_ms,
    },
    sounds: [
      { at: sarahAt, kind: "pop" },
      { at: clickAt, kind: "mouse" },
      { at: pressAt, kind: "key" },
      ...typing.map((k) => ({ at: k.at, kind: "key" })),
      { at: enter1At, kind: "key" },
      { at: enter2At, kind: "key" },
      { at: replyAt, kind: "pop" },
    ],
    // Khung chính để xem lại (spec §6.4): tên ảnh → thời điểm.
    keyTimes: {
      "01-hop": 400,
      "02-dang-noi": voiceStartMs + 4500,
      "03-phu-de": liveEnd - s.liveHoldMs / 2,
      "04-chuyen-canh": slide[0] + SLIDE_MS / 2,
      "05-dang-nhap": typing1[0] + 600,
      "06-tin-nhan": sarahAt + 500,
      "07-phim-tat": pressAt + 60,
      "08-dang-go": typing[Math.floor(typing.length / 2)].at + 10,
      "09-ban-dich": translatedAt + 300,
      "10-da-dan": pasteAt + 400,
      "11-da-gui": sentAt + 500,
      "12-tra-loi": replyAt + 600,
      "13-ket": totalMs - 1000,
    },
  };
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/*.test.mjs`
Kỳ vọng: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/desktop-timeline.mjs scripts/demo-video/desktop-timeline.test.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): lịch thời gian bản 16:10, đường đi con trỏ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Kịch bản 16:10 và công cụ tách clip

**Files:**
- Create: `scripts/demo-video/script.desktop.vi.json`
- Create: `scripts/demo-video/assets.json`
- Create: `scripts/demo-video/assets.mjs`
- Test: `scripts/demo-video/assets.test.mjs`

- [ ] **Step 1: Kịch bản**

`scripts/demo-video/script.desktop.vi.json` (tên người có thể đổi ở Task 8 cho hợp người trong clip):
```json
{
  "stage": "desktop",
  "data": "vi",
  "target": "vi",
  "viewport": { "width": 1536, "height": 960, "dpr": 1.25 },
  "timing": {
    "voiceStartMs": 800,
    "liveHoldMs": 2000,
    "outroMs": 4000,
    "meetingLabel": { "from": 800, "to": 3800 },
    "chatLabel": { "from": 500, "to": 3500 },
    "chat": {
      "typing1StartMs": 300,
      "typing1Ms": 1200,
      "moveAfterMsgMs": 500,
      "moveMs": 700,
      "clickAfterMoveMs": 100,
      "hotkeyAfterClickMs": 600,
      "pressMs": 200,
      "openAfterHotkeyMs": 250,
      "typingAfterOpenMs": 600,
      "pace": { "charMs": 70, "spaceMs": 110, "punctuationMs": 260 },
      "readMs": 1500,
      "pasteMs": 150,
      "reviewMs": 1000,
      "typing2StartMs": 700,
      "typing2Ms": 1500,
      "holdMs": 1500
    }
  },
  "labels": {
    "meeting": { "text": "Dịch cuộc họp trực tiếp · chạy trên máy" },
    "chat": { "text": "Gõ dịch · Ctrl + Alt + G · nhắn tiếng Việt, gửi đi tiếng Anh" }
  },
  "call": {
    "title": "Weekly sync",
    "startClock": 727,
    "people": [
      { "name": "Sarah Collins", "still": "sarah" },
      { "name": "David Park", "video": "p1" },
      { "name": "Emma Wilson", "video": "p2" },
      { "name": "Bạn", "video": "self" }
    ]
  },
  "chat": {
    "title": "Tin nhắn",
    "contact": { "name": "Sarah Collins", "still": "sarah", "status": "Đang hoạt động" },
    "list": [
      { "name": "Sarah Collins", "still": "sarah", "time": "10:42", "active": true },
      { "name": "David Park", "still": "p1-still", "last": "Thanks for the update!", "time": "09:15" },
      { "name": "Emma Wilson", "still": "p2-still", "last": "See you at the sync.", "time": "Hôm qua" },
      { "name": "Nhóm Checkout", "initials": "NC", "last": "Bạn: Đã gửi file thiết kế", "time": "T2" }
    ],
    "historyDay": "Hôm qua",
    "history": [
      { "from": "them", "text": "Meeting link for tomorrow: weekly sync at 10:00." },
      { "from": "me", "text": "Got it, thanks!" }
    ],
    "todayDay": "Hôm nay 10:42",
    "sarahMessage": "Hi! Following up on the quote we discussed in the meeting.",
    "sarahReply": "Perfect, thank you!",
    "reply": "Dạ vâng, em sẽ gửi báo giá mới cho chị trước thứ Sáu.",
    "replyLang": "vi",
    "replyTarget": "en",
    "placeholder": "Aa"
  },
  "taskbar": { "time": "10:42", "date": "21/10/2026" },
  "outro": { "name": "AI Translator", "url": "aitranslator.io.vn" },
  "layout": {
    "workArea": { "width": 1536, "height": 912 },
    "meeting": { "titleBar": 32, "topBar": 48, "controlBar": 72, "padding": 12, "gap": 10 },
    "overlay": { "width": 900, "height": 200, "fontSize": 22, "bottomGap": 72 },
    "chat": { "left": 238, "top": 96, "width": 1060, "height": 720, "listWidth": 300 },
    "compose": { "width": 560, "topRatio": 0.25 },
    "cursor": { "rest": { "x": 1290, "y": 560 }, "input": { "x": 860, "y": 788 } }
  }
}
```

- [ ] **Step 2: Khung `assets.json` (Task 8 điền `items`)**

`scripts/demo-video/assets.json`:
```json
{
  "license": {
    "name": "Mixkit Stock Video Free License",
    "url": "https://mixkit.co/license/#videoFree",
    "terms": "https://mixkit.co/terms/",
    "checked": "2026-10-21",
    "summary": "Dùng được cho YouTube, mạng xã hội, quảng cáo trực tuyến, dự án thương mại; được sửa, phân phối, phát sóng; không bắt buộc ghi nguồn. Không bán lại bản gốc chưa chỉnh, không đưa file riêng lẻ cho bên thứ ba, không xóa watermark (User Terms mục 9)."
  },
  "items": []
}
```

- [ ] **Step 3: Viết test cho phần thuần**

`scripts/demo-video/assets.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { assetProblems, cropFilter } from "./assets.mjs";

const LICENSE = { name: "Mixkit Stock Video Free License", url: "https://mixkit.co/license/#videoFree", checked: "2026-10-21" };
const video = {
  name: "p1",
  kind: "video",
  page: "https://mixkit.co/free-stock-video/having-a-video-call-working-from-home-10446/",
  download: "https://assets.mixkit.co/videos/10446/10446-720.mp4",
  start: 1.5,
  duration: 12,
  focus: { x: 0.5, y: 0.4 },
};
const still = { ...video, name: "p1-still", kind: "still", at: 3, start: undefined, duration: undefined };

test("danh sách đúng thì không có vấn đề", () => {
  assert.deepEqual(assetProblems({ license: LICENSE, items: [video, still] }), []);
});

test("báo thiếu giấy phép, tên trùng, nguồn lạ, thiếu đoạn cắt, tâm khung sai", () => {
  const bad = [
    video,
    { ...video, download: "https://example.com/a.mp4", page: "https://example.com/" },
    { ...video, name: "p2", kind: "video", duration: undefined },
    { ...still, name: "s", at: undefined, focus: { x: 2, y: 0 } },
    { ...video, name: "x", kind: "gif" },
  ];
  const problems = assetProblems({ license: { name: "?" }, items: bad });
  assert.ok(problems.some((p) => p.includes("license")));
  assert.ok(problems.some((p) => p.includes("trùng")));
  assert.ok(problems.some((p) => p.includes("assets.mixkit.co")));
  assert.ok(problems.some((p) => p.includes("mixkit.co")) && problems.some((p) => p.includes("trang nguồn")));
  assert.ok(problems.some((p) => p.includes("p2") && p.includes("duration")));
  assert.ok(problems.some((p) => p.includes("s:") && p.includes("at")));
  assert.ok(problems.some((p) => p.includes("focus")));
  assert.ok(problems.some((p) => p.includes("kind")));
});

test("cắt vùng lớn nhất đúng tỉ lệ ô quanh tâm khung rồi hạ cỡ", () => {
  assert.equal(
    cropFilter({ width: 1280, height: 720 }, { width: 938, height: 454 }, { x: 0.5, y: 0.5 }),
    "crop=1280:618:0:51,scale=938:454:flags=lanczos",
  );
  assert.equal(
    cropFilter({ width: 1280, height: 720 }, { width: 320, height: 320 }, { x: 0.3, y: 0.4 }),
    "crop=720:720:24:0,scale=320:320:flags=lanczos",
  );
  // Tâm sát mép phải: vùng cắt không ra ngoài khung.
  assert.equal(
    cropFilter({ width: 1280, height: 720 }, { width: 320, height: 320 }, { x: 0.99, y: 0.5 }),
    "crop=720:720:560:0,scale=320:320:flags=lanczos",
  );
});
```

- [ ] **Step 4: Chạy test, thấy lỗi**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/assets.test.mjs`
Kỳ vọng: FAIL, không tìm thấy `assets.mjs`.

- [ ] **Step 5: Viết `assets.mjs`**

`scripts/demo-video/assets.mjs`:
```js
// Clip người thật cho bản 16:10 (spec 2026-10-21-demo-video-desktop §2.2): tải clip Mixkit ghi trong assets.json về
// target/demo-video/assets/, rồi dùng ffmpeg cắt đoạn, cắt khung đúng tỉ lệ ô của người dùng clip đó trong cuộc họp, hạ cỡ và tách
// thành ảnh JPEG 30 khung/giây (target/demo-video/frames/<tên>/00001.jpg…), hay một ảnh vuông cho ảnh đại diện
// (target/demo-video/frames/<tên>.jpg). Ghi số khung của từng clip vào target/demo-video/frames/index.json (trang dựng cảnh cho clip
// chạy tới rồi lùi khi ngắn hơn cảnh họp).
//   node scripts/demo-video/assets.mjs [desktop.vi]     # tên kịch bản: lấy cỡ ô từ layout, người dùng clip từ call.people
// Trang Mixkit chặn tải thì in đường dẫn để tải tay vào target/demo-video/assets/ (đúng tên file cuối của đường tải).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { meetingTiles, pixelSize } from "./desktop-layout.mjs";
import { buildDesktopTimeline } from "./desktop-timeline.mjs";
import { FPS } from "./timeline.mjs";

const MIXKIT_FILE = /^https:\/\/assets\.mixkit\.co\/videos\/\d+\/\d+-(360|720|1080)\.mp4$/;
const MIXKIT_PAGE = /^https:\/\/mixkit\.co\/free-stock-video\/[a-z0-9-]+\/$/;
export const STILL_PX = 320;

/** Lý do không dùng được assets.json (rỗng là dùng được). */
export function assetProblems(doc) {
  const problems = [];
  if (!doc.license?.url || !doc.license?.checked) problems.push("thiếu license.url hay license.checked");
  const names = new Set();
  for (const a of doc.items ?? []) {
    const who = a.name ?? "(không tên)";
    if (!a.name || names.has(a.name)) problems.push(`${who}: tên trống hay trùng`);
    names.add(a.name);
    if (!MIXKIT_FILE.test(a.download ?? "")) problems.push(`${who}: download phải là file mp4 của assets.mixkit.co`);
    if (!MIXKIT_PAGE.test(a.page ?? "")) problems.push(`${who}: thiếu trang nguồn trên mixkit.co`);
    if (a.kind === "video") {
      if (!(a.start >= 0) || !(a.duration > 0)) problems.push(`${who}: video cần start và duration (giây)`);
    } else if (a.kind === "still") {
      if (!(a.at >= 0)) problems.push(`${who}: ảnh cần at (giây)`);
    } else {
      problems.push(`${who}: kind phải là video hay still`);
    }
    const f = a.focus ?? {};
    if (!(f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1)) problems.push(`${who}: focus.x, focus.y phải trong [0, 1]`);
  }
  return problems;
}

/** Bộ lọc ffmpeg: cắt vùng lớn nhất có tỉ lệ của `out`, tâm gần `focus` nhất mà không ra ngoài khung, rồi hạ cỡ. */
export function cropFilter(src, out, focus) {
  const scale = Math.min(src.width / out.width, src.height / out.height);
  const w = Math.floor((out.width * scale) / 2) * 2;
  const h = Math.floor((out.height * scale) / 2) * 2;
  const x = Math.round(Math.min(src.width - w, Math.max(0, focus.x * src.width - w / 2)));
  const y = Math.round(Math.min(src.height - h, Math.max(0, focus.y * src.height - h / 2)));
  return `crop=${w}:${h}:${x}:${y},scale=${out.width}:${out.height}:flags=lanczos`;
}

function main(scriptName) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.resolve(here, "../../target/demo-video");
  const json = (file) => JSON.parse(readFileSync(path.join(here, file), "utf8"));
  const doc = json("assets.json");
  const problems = assetProblems(doc);
  if (doc.items.length === 0) problems.push("assets.json chưa có mục nào (Task 8)");
  if (problems.length > 0) {
    console.error(`assets.json chưa dùng được:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  const script = json(`script.${scriptName}.json`);
  const d = script.data;
  const tl = buildDesktopTimeline(script, json(`data/voice.${d}.json`), json(`data/live.${d}.json`), json(`data/compose.${d}.json`));

  // Tải (bỏ qua file đã có).
  mkdirSync(path.join(out, "assets"), { recursive: true });
  const fileOf = (a) => path.join(out, "assets", path.basename(new URL(a.download).pathname));
  const missing = [];
  for (const a of doc.items) {
    const file = fileOf(a);
    if (existsSync(file)) continue;
    try {
      execFileSync("curl", ["-fsSL", "-A", "Mozilla/5.0", "-o", file, a.download], { stdio: "inherit" });
    } catch {
      rmSync(file, { force: true });
      missing.push(`${a.download}  (trang: ${a.page})`);
    }
  }
  if (missing.length > 0) {
    console.error(`Không tải được, tải tay vào ${path.join(out, "assets")} rồi chạy lại:\n- ${missing.join("\n- ")}`);
    process.exit(1);
  }

  const probe = (file) => {
    const [width, height] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" })
      .trim()
      .split(",")
      .map(Number);
    return { width, height };
  };
  const tiles = meetingTiles(script.layout);
  const frames = path.join(out, "frames");
  mkdirSync(frames, { recursive: true });
  const index = {};
  for (const a of doc.items) {
    const file = fileOf(a);
    const src = probe(file);
    if (a.kind === "still") {
      const filter = cropFilter(src, { width: STILL_PX, height: STILL_PX }, a.focus);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(a.at), "-i", file, "-frames:v", "1", "-vf", filter, "-q:v", "2", path.join(frames, `${a.name}.jpg`)]);
      console.log(`  ảnh ${a.name}`);
      continue;
    }
    const seat = script.call.people.findIndex((p) => p.video === a.name);
    if (seat < 0) {
      console.log(`  bỏ qua ${a.name}: không ai trong call.people dùng clip này`);
      continue;
    }
    if (src.width < src.height) throw new Error(`${a.name}: clip quay dọc (${src.width}×${src.height}), cần clip ngang`);
    const size = pixelSize(tiles[seat], script.viewport.dpr);
    const dir = path.join(frames, a.name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    const filter = `${cropFilter(src, size, a.focus)},fps=${FPS}`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(a.start), "-t", String(a.duration), "-i", file, "-an", "-vf", filter, "-q:v", "3", path.join(dir, "%05d.jpg")]);
    index[a.name] = readdirSync(dir).filter((f) => f.endsWith(".jpg")).length;
    console.log(`  clip ${a.name}: ${index[a.name]} khung ${size.width}×${size.height} (cảnh họp cần ${Math.ceil(tl.scenes.slide[1] / (1000 / FPS))} khung, thiếu thì chạy tới rồi lùi)`);
  }
  writeFileSync(path.join(frames, "index.json"), `${JSON.stringify(index, null, 1)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2] ?? "desktop.vi");
```

- [ ] **Step 6: Chạy test, thấy đạt**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/*.test.mjs`
Kỳ vọng: `# fail 0`.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/script.desktop.vi.json scripts/demo-video/assets.json scripts/demo-video/assets.mjs scripts/demo-video/assets.test.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): kịch bản 16:10 và công cụ tách clip người thật

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Chọn clip, ảnh và tách khung

**Files:**
- Modify: `scripts/demo-video/assets.json` (`items`)
- Có thể sửa: `scripts/demo-video/script.desktop.vi.json` (tên người cho hợp người trong clip)

- [ ] **Step 1: Lấy danh sách ứng viên**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && C=target/demo-video/candidates && mkdir -p $C && for q in video-call working-from-home online-meeting webcam business office businessman businesswoman remote-work; do curl -s -A "Mozilla/5.0" "https://mixkit.co/free-stock-video/$q/" | grep -o 'href="/free-stock-video/[a-z0-9-]*-[0-9]*/"' | sed 's/href="//;s/"//'; done | sort -u > $C/list.txt && wc -l $C/list.txt
```
Kỳ vọng: vài chục đường dẫn dạng `/free-stock-video/<mô-tả>-<id>/`. Chọn ra các mục mà tên gợi ý người ngồi trước webcam hay laptop (call, laptop, desk, office, working, talking-to-camera, listening, taking-notes); bỏ cảnh điện thoại, ngoài trời, tiệc.

- [ ] **Step 2: Ảnh xem nhanh từng ứng viên**

Với mỗi id đã chọn (thay danh sách `ID…` bằng các id lấy ở Step 1):
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/target/demo-video/candidates && for id in ID1 ID2 ID3; do [ -f $id.mp4 ] || curl -fsSL -A "Mozilla/5.0" -o $id.mp4 https://assets.mixkit.co/videos/$id/$id-360.mp4; ffmpeg -v error -y -i $id.mp4 -vf "fps=1,scale=213:-2,tile=6x2" -frames:v 1 $id.jpg; echo "$id $(ffprobe -v error -show_entries format=duration:stream=width,height -of csv=p=0 $id.mp4 | tr '\n' ' ')"; done
```
Xem từng `target/demo-video/candidates/<id>.jpg` (Read tool; mỗi ô là 1 giây).

Chọn theo tiêu chí:
- **p1, p2** (hai người tham gia bật cam): clip ngang, người nhìn vào máy, đang nghe hay gật đầu (ít mấp máy môi, vì mic của họ tắt), nền văn phòng hay ở nhà gọn gàng, không chữ, logo hay nhãn hiệu lộ ra, sáng rõ.
- **self** (ô "Bạn"): như trên, ưu tiên người châu Á.
  - Mixkit gần như không có clip người châu Á ngồi trước webcam. Nếu không thấy clip hợp, **dừng và hỏi chủ dự án**: dùng clip người không phải châu Á, cho ô "Bạn" tắt cam (vòng tròn chữ "B"), hay chủ dự án tự quay khoảng 15 giây webcam.
  - Chọn ô tắt cam thì đổi `{ "name": "Bạn", "video": "self" }` thành `{ "name": "Bạn", "initials": "B" }`, và `desktop-meeting.mjs` hiện chữ thay ảnh (xem Task 10).
- **sarah** (ảnh đại diện): một khung người phụ nữ nhìn thẳng, biểu cảm tự nhiên, lấy từ một clip **khác** với p1, p2, self.
- **p1-still, p2-still** (ảnh trong danh sách chat): một khung của chính clip p1, p2.
- Giới tính người trong p1, p2 quyết định tên: sửa `call.people[1|2].name` và `chat.list[1|2].name` trong `script.desktop.vi.json` (ví dụ nữ thì "Emma Wilson", "Linh Tran"; nam thì "David Park", "Tom Becker").

- [ ] **Step 3: Điền `assets.json`**

Mỗi mục có dạng như sau (thay số liệu theo clip đã chọn; `focus` là toạ độ khuôn mặt trên khung, tỉ lệ 0–1, đọc từ ảnh xem nhanh; `start` + `duration` không vượt độ dài clip):
```json
{
  "name": "p1",
  "kind": "video",
  "role": "Người tham gia bật cam (David Park)",
  "page": "https://mixkit.co/free-stock-video/having-a-video-call-working-from-home-10446/",
  "download": "https://assets.mixkit.co/videos/10446/10446-720.mp4",
  "author": "Mixkit",
  "start": 0.5,
  "duration": 14,
  "focus": { "x": 0.5, "y": 0.42 }
}
```
Ảnh: `"kind": "still"`, thay `start`/`duration` bằng `"at": <giây>`. Cần đủ 6 mục: `p1`, `p2`, `self` (nếu bật cam), `sarah`, `p1-still`, `p2-still`.

Kiểm:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node --input-type=module -e 'import { assetProblems } from "./scripts/demo-video/assets.mjs"; import { readFileSync } from "node:fs"; const d = JSON.parse(readFileSync("scripts/demo-video/assets.json","utf8")); console.log(assetProblems(d), d.items.length + " mục")'
```
Kỳ vọng: `[] 6 mục` (hoặc 5 nếu ô "Bạn" tắt cam).

- [ ] **Step 4: Tải bản 720p và tách khung**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node scripts/demo-video/assets.mjs desktop.vi && cat target/demo-video/frames/index.json && ls target/demo-video/frames/*.jpg
```
Kỳ vọng:
- mỗi clip in dòng `clip <tên>: N khung 938×454 …`;
- các ảnh `sarah.jpg`, `p1-still.jpg`, `p2-still.jpg`;
- `index.json` có số khung của từng clip.

Xem `target/demo-video/frames/sarah.jpg` và khung đầu `target/demo-video/frames/p1/00001.jpg`: mặt nằm giữa khung, không bị cắt. Lệch thì sửa `focus` rồi chạy lại.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/assets.json scripts/demo-video/script.desktop.vi.json && git commit -m "$(cat <<'EOF'
chore(demo-video): clip và ảnh người thật từ Mixkit cho bản 16:10 (ghi nguồn, giấy phép)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: HTML, CSS và hàm DOM chung

**Files:**
- Create: `scripts/demo-video/desktop.html`
- Create: `scripts/demo-video/desktop.css`
- Create: `scripts/demo-video/desktop-dom.mjs`

- [ ] **Step 1: HTML**

`scripts/demo-video/desktop.html`:
```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <title>AI Translator · video 16:10</title>
    <link rel="stylesheet" href="./fonts/demo-font.css" />
    <link rel="stylesheet" href="./desktop.css" />
  </head>
  <body>
    <div id="screen"></div>
    <script type="module" src="./desktop.mjs"></script>
  </body>
</html>
```

- [ ] **Step 2: CSS**

`scripts/demo-video/desktop.css`:
```css
/* Trang dựng cảnh bản 16:10 (desktop.mjs): giả màn hình Windows 11, 1536×960 điểm CSS (1920×1200 ở tỉ lệ 125%). Không logo
   Windows, Teams, Meet, Messenger. Không transition/animation: mọi chuyển động tính theo thời điểm trong các file desktop-*.mjs. */
:root {
  --font: "Demo UI", sans-serif;
  --accent: #2f6bff;
}

html,
body {
  margin: 0;
  background: #000000;
}

#screen {
  position: relative;
  width: 1536px;
  height: 960px;
  overflow: hidden;
  color: #1b1b1f;
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
}
#screen > * {
  position: absolute;
}

/* Hai desktop ảo cạnh nhau; chuyển cảnh là trượt cả dải sang trái. */
.desks {
  left: 0;
  top: 0;
  width: 3072px;
  height: 912px;
}
.desk {
  position: absolute;
  top: 0;
  left: 0;
  width: 1536px;
  height: 912px;
  overflow: hidden;
  background:
    radial-gradient(60% 70% at 28% 38%, rgba(91, 140, 255, 0.85), transparent 60%),
    radial-gradient(55% 65% at 75% 65%, rgba(176, 108, 255, 0.75), transparent 60%),
    linear-gradient(135deg, #0c1a3a, #1c0f38);
}
.desk.d2 {
  left: 1536px;
}
.desk > * {
  position: absolute;
}

/* Biểu tượng tự vẽ */
.icon {
  display: inline-grid;
  place-items: center;
}
.icon svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Cửa sổ kiểu Windows 11 */
.window {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(0, 0, 0, 0.12);
}
.titlebar {
  flex: none;
  display: flex;
  align-items: center;
  height: 32px;
  padding-left: 12px;
  font-size: 12px;
}
.titlebar .app-ico {
  margin-right: 10px;
}
.titlebar .app-ico svg {
  width: 16px;
  height: 16px;
}
.titlebar .title {
  flex: 1;
}
.titlebar .wbtn {
  width: 46px;
  height: 32px;
}
.titlebar .wbtn svg {
  width: 13px;
  height: 13px;
  stroke-width: 1.3;
}
.titlebar.dark {
  background: #1f1f1f;
  color: #e8e8e8;
}
.titlebar.light {
  background: #f3f3f3;
  color: #1b1b1f;
}

/* Cửa sổ họp (phóng to: không bo góc, không bóng) */
.meeting {
  border-radius: 0;
  box-shadow: none;
  background: #1b1c1f;
  color: #e9eaee;
}
.meet-top {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  height: 48px;
  padding: 0 16px;
  font-size: 14px;
}
.meet-name {
  font-weight: 600;
}
.meet-timer {
  color: #a9adb8;
  font-variant-numeric: tabular-nums;
}
.meet-top-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #c9ccd4;
}
.tile {
  position: absolute;
  overflow: hidden;
  border-radius: 12px;
  background: #2a2c31;
}
.tile::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 12px;
  box-shadow: inset 0 0 0 3px transparent;
}
.tile.speaking::after {
  box-shadow: inset 0 0 0 3px #5b8cff;
}
.tile .feed {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tile .portrait,
.tile .initials {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 132px;
  height: 132px;
  margin: -66px 0 0 -66px;
  border-radius: 50%;
  object-fit: cover;
}
.tile .initials {
  display: grid;
  place-items: center;
  background: #5b6bd6;
  color: #ffffff;
  font-size: 52px;
  font-weight: 600;
}
.name-tag {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #ffffff;
  font-size: 13px;
}
.name-tag .icon svg {
  width: 16px;
  height: 16px;
}
.name-tag .bar {
  display: inline-block;
  width: 3px;
  height: 4px;
  border-radius: 2px;
  background: #7fb0ff;
}
.meet-controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.meet-clock {
  position: absolute;
  left: 20px;
  font-size: 14px;
  color: #c9ccd4;
}
.meet-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}
.meet-buttons .btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #34363c;
  color: #ffffff;
}
.meet-buttons .btn.muted {
  background: #d94a3d;
}
.leave {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 18px;
  border-radius: 22px;
  background: #d93a2f;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
}

/* Thanh phụ đề, ô Gõ dịch: iframe của app */
.frame {
  border: 0;
  background: transparent;
}
.compose-frame {
  filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.35));
}

/* Cửa sổ chat */
.chat {
  background: #ffffff;
}
.chat-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.chat-list {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 10px;
  border-right: 1px solid #e6e6ea;
  box-sizing: border-box;
}
.list-title {
  padding: 2px 8px 10px;
  font-size: 22px;
  font-weight: 700;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  margin-bottom: 8px;
  padding: 0 12px;
  border-radius: 18px;
  background: #f0f2f5;
  color: #65676b;
  font-size: 14px;
}
.search .icon svg {
  width: 16px;
  height: 16px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
}
.row.active {
  background: #eaf1ff;
}
.avatar {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #8a6cff;
  color: #ffffff;
  font-weight: 600;
}
.avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.avatar.md {
  width: 48px;
  height: 48px;
  font-size: 17px;
}
.avatar.sm {
  width: 40px;
  height: 40px;
  font-size: 15px;
}
.avatar.xs {
  width: 28px;
  height: 28px;
  font-size: 11px;
}
.online {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #31a24c;
  box-shadow: 0 0 0 2px #ffffff;
}
.row-text {
  flex: 1;
  min-width: 0;
}
.row-name {
  font-size: 15px;
  font-weight: 600;
}
.row-last {
  overflow: hidden;
  color: #65676b;
  font-size: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.row-time {
  align-self: flex-start;
  margin-top: 4px;
  color: #65676b;
  font-size: 12px;
}
.chat-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pane-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 64px;
  padding: 0 16px;
  border-bottom: 1px solid #e6e6ea;
}
.pane-name {
  font-size: 15px;
  font-weight: 600;
}
.pane-status {
  color: #65676b;
  font-size: 12px;
}
.pane-actions {
  margin-left: auto;
  display: flex;
  gap: 14px;
  color: var(--accent);
}
.thread {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
  overflow: hidden;
  padding: 16px 20px;
}
.day {
  align-self: center;
  margin: 10px 0 4px;
  color: #65676b;
  font-size: 12px;
}
.msg {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.msg.me {
  justify-content: flex-end;
}
.bubble {
  max-width: 62%;
  padding: 8px 12px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.35;
}
.msg.them .bubble {
  background: #f0f0f0;
  color: #050505;
}
.msg.me .bubble {
  background: var(--accent);
  color: #ffffff;
}
.typing .bubble {
  display: flex;
  gap: 4px;
  padding: 12px 14px;
}
.typing .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #90949c;
}
.composer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 14px;
  color: var(--accent);
}
.composer .input {
  flex: 1;
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 14px;
  border-radius: 18px;
  background: #f0f2f5;
  color: #050505;
  font-size: 15px;
}
.composer .input.focused {
  box-shadow: inset 0 0 0 1px #b8c7ff;
}
.composer .placeholder {
  color: #8a8d91;
}

/* Thanh tác vụ kiểu Windows 11 (không logo Windows) */
.taskbar {
  left: 0;
  bottom: 0;
  width: 1536px;
  height: 48px;
  background: rgba(238, 240, 246, 0.92);
  border-top: 1px solid rgba(255, 255, 255, 0.6);
}
.tb-apps {
  position: absolute;
  left: 50%;
  top: 4px;
  display: flex;
  gap: 4px;
  transform: translateX(-50%);
}
.tb-app {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  color: #2b2f3a;
}
.tb-app .icon svg {
  width: 22px;
  height: 22px;
}
.tb-app.active {
  background: rgba(255, 255, 255, 0.75);
}
.tb-app.active::after {
  content: "";
  position: absolute;
  bottom: 2px;
  width: 16px;
  height: 3px;
  border-radius: 2px;
  background: var(--accent);
}
.app-folder {
  color: #d29b18;
}
.app-globe {
  color: #0b8a5a;
}
.app-cam {
  color: #5b5fc7;
}
.app-chat {
  color: var(--accent);
}
.app-mail {
  color: #1f6fd1;
}
.tb-tray {
  position: absolute;
  right: 12px;
  top: 0;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.tray-ico svg {
  width: 16px;
  height: 16px;
}
.tray-app {
  width: 16px;
  height: 16px;
}
.tb-clock {
  margin-left: 4px;
  font-size: 12px;
  line-height: 1.3;
  text-align: right;
}

/* Nhãn nhỏ, ô hiện phím, con trỏ, màn kết */
.label {
  left: 20px;
  bottom: 68px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 10px 12px;
  border-radius: 12px;
  background: rgba(17, 19, 26, 0.86);
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}
.label img {
  width: 22px;
  height: 22px;
}
.keys {
  right: 24px;
  bottom: 72px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(17, 19, 26, 0.86);
  color: #ffffff;
}
.keys .cap {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  min-width: 44px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #4a4e5c;
  border-bottom-width: 3px;
  border-radius: 8px;
  background: #2c2f3a;
  font-size: 17px;
  font-weight: 600;
}
.keys .cap.down {
  border-bottom-width: 1px;
  background: #3a3e4c;
  transform: translateY(2px);
}
.keys .plus {
  color: #9aa0ae;
  font-size: 15px;
}
.cursor {
  left: 0;
  top: 0;
  z-index: 8;
  width: 1px;
  height: 1px;
}
.cursor svg {
  position: absolute;
}
.cursor .arrow {
  left: -2px;
  top: -2px;
}
.cursor .text {
  display: none;
  left: -8px;
  top: -14px;
}
.cursor[data-kind="text"] .arrow {
  display: none;
}
.cursor[data-kind="text"] .text {
  display: block;
}
.outro {
  inset: 0;
  z-index: 9;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: radial-gradient(circle at 50% 45%, #1d2440, #0b0d14 70%);
  color: #ffffff;
}
.outro img {
  width: 128px;
  height: 128px;
  border-radius: 28px;
}
.outro .name {
  font-size: 44px;
  font-weight: 700;
}
.outro .url {
  color: #8fb0ff;
  font-size: 22px;
  font-weight: 600;
}
.play {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 20;
  padding: 14px 26px;
  border: 0;
  border-radius: 12px;
  background: var(--accent);
  color: #ffffff;
  font-size: 18px;
  cursor: pointer;
  translate: -50% -50%;
}
```

- [ ] **Step 3: Hàm DOM chung**

`scripts/demo-video/desktop-dom.mjs`:
```js
// Hàm dựng DOM dùng chung của trang dựng cảnh bản 16:10 (desktop.mjs và các phần desktop-*.mjs). Biểu tượng vẽ tay bằng SVG 24×24
// (nét 1,8, xem desktop.css), không lấy từ bộ biểu tượng của hãng nào, không logo.

export const el = (tag, cls, parent, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
};

export const place = (node, box) => {
  for (const k of ["left", "top", "width", "height"]) if (box[k] !== undefined) node.style[k] = `${box[k]}px`;
};

/** Độ hiện và biến đổi của một phần tử; độ hiện 0 thì ẩn hẳn. */
export const show = (node, opacity, transform = "") => {
  node.style.opacity = String(opacity);
  node.style.visibility = opacity > 0 ? "visible" : "hidden";
  node.style.transform = transform;
};

export const within = (t, from, to) => t >= from && t < to;

/** Bật lên ở `at` (rõ dần trong `ms`), tắt ở `until`. */
export const pop = (t, at, until = Number.POSITIVE_INFINITY, ms = 160) => (t < at || t >= until ? 0 : Math.min(1, (t - at) / ms));

const dots3x3 = [6, 12, 18].flatMap((y) => [6, 12, 18].map((x) => `<circle cx="${x}" cy="${y}" r="1.7" fill="currentColor" stroke="none"/>`)).join("");

const ICONS = {
  apps: dots3x3,
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  cam: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  chevron: '<path d="M6 15l6-6 6 6"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  battery: '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4"/><rect x="4" y="9" width="11" height="6" rx="1" fill="currentColor" stroke="none"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micOff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16"/>',
  share: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 14V8M9 11l3-3 3 3M8 21h8"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.3-1.9L8 14"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  leave: '<path d="M3 14c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-7 0V15l-3 1.5z"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5 5"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 10v.01M15 10v.01"/>',
  send: '<path d="M3 11l18-8-8 18-2-8z"/>',
  winMin: '<path d="M5 12h14"/>',
  winMax: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  winClose: '<path d="M6 6l12 12M18 6L6 18"/>',
};

/** Biểu tượng `name` trong một `<span class={cls}>`. */
export function icon(name, parent, cls = "icon") {
  const svg = ICONS[name];
  if (svg === undefined) throw new Error(`không có biểu tượng ${name}`);
  const node = el("span", cls, parent);
  node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>`;
  return node;
}

/** Thanh tiêu đề kiểu Windows 11: biểu tượng app, tên cửa sổ, ba nút – □ ✕ bên phải. */
export function titleBar(win, title, theme, iconName) {
  const bar = el("div", `titlebar ${theme}`, win);
  icon(iconName, bar, "icon app-ico");
  el("span", "title", bar, title);
  for (const n of ["winMin", "winMax", "winClose"]) icon(n, bar, "icon wbtn");
  return bar;
}

/** Ảnh đại diện tròn: ảnh tách từ clip (`still`) hay chữ viết tắt (`initials`). */
export function avatar(parent, who, assets, size) {
  const box = el("div", `avatar ${size}`, parent);
  if (who.still) {
    const img = el("img", "", box);
    img.alt = "";
    img.src = assets.still(who.still);
  } else {
    box.textContent = who.initials;
  }
  return box;
}
```

- [ ] **Step 4: Kiểm cú pháp và commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node --check scripts/demo-video/desktop-dom.mjs && git branch --show-current && git add scripts/demo-video/desktop.html scripts/demo-video/desktop.css scripts/demo-video/desktop-dom.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): khung trang 16:10, CSS giả Windows 11, biểu tượng tự vẽ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Các phần của màn hình và trang dựng cảnh

**Files:**
- Create: `scripts/demo-video/desktop-shell.mjs`
- Create: `scripts/demo-video/desktop-meeting.mjs`
- Create: `scripts/demo-video/desktop-chat.mjs`
- Create: `scripts/demo-video/desktop.mjs`

- [ ] **Step 1: Vỏ Windows**

`scripts/demo-video/desktop-shell.mjs`:
```js
// Vỏ Windows của bản 16:10: thanh tác vụ (biểu tượng app chung chung, không logo Windows; khay có biểu tượng AI Translator), nhãn nhỏ,
// ô hiện phím, con trỏ chuột, màn kết. Mọi thứ theo thời điểm `t`.
import { cursorAt, SLIDE_MS } from "./desktop-timeline.mjs";
import { el, icon, pop, show, within } from "./desktop-dom.mjs";
import { visibility } from "./timeline.mjs";

const ARROW =
  '<svg class="arrow" width="20" height="28" viewBox="0 0 20 28"><path d="M2 2v20l5-5 3.5 8 3.5-1.5-3.5-8H17z" fill="#ffffff" stroke="#000000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const IBEAM =
  '<svg class="text" width="16" height="28" viewBox="0 0 16 28"><path d="M4 3h8M4 25h8M8 3v22" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/><path d="M4 3h8M4 25h8M8 3v22" stroke="#000000" stroke-width="1.6" stroke-linecap="round"/></svg>';

export function buildShell(parent, { script, tl, assets }) {
  const bar = el("div", "taskbar", parent);
  const apps = el("div", "tb-apps", bar);
  const app = {};
  for (const n of ["apps", "search", "folder", "globe", "cam", "chat", "mail"]) app[n] = icon(n, el("div", `tb-app app-${n}`, apps)).parentElement;
  const tray = el("div", "tb-tray", bar);
  icon("chevron", tray, "icon tray-ico");
  const ai = el("img", "tray-app", tray);
  ai.alt = "";
  ai.src = assets.icon;
  for (const n of ["wifi", "volume", "battery"]) icon(n, tray, "icon tray-ico");
  const clock = el("div", "tb-clock", tray);
  el("div", "", clock, script.taskbar.time);
  el("div", "", clock, script.taskbar.date);

  const labels = tl.labels.map((l) => {
    const box = el("div", "label", parent);
    const img = el("img", "", box);
    img.alt = "";
    img.src = assets.icon;
    el("span", "", box, l.text);
    return box;
  });
  const keys = tl.keys.map((k) => {
    const box = el("div", "keys", parent);
    const caps = k.keys.map((key, j) => {
      if (j > 0) el("span", "plus", box, "+");
      return el("span", "cap", box, key);
    });
    return { box, caps };
  });
  const cursor = el("div", "cursor", parent);
  cursor.innerHTML = ARROW + IBEAM;
  const outro = el("div", "outro", parent);
  const logo = el("img", "", outro);
  logo.alt = "";
  logo.src = assets.appIcon;
  el("div", "name", outro, script.outro.name);
  el("div", "url", outro, script.outro.url);

  return {
    render(t) {
      const inChat = t >= tl.scenes.slide[0] + SLIDE_MS / 2;
      app.cam.classList.toggle("active", !inChat);
      app.chat.classList.toggle("active", inChat);
      tl.labels.forEach((l, i) => show(labels[i], visibility(t, [l.from, l.to])));
      tl.keys.forEach((k, i) => {
        show(keys[i].box, pop(t, k.from, k.to, 120));
        for (const cap of keys[i].caps) cap.classList.toggle("down", within(t, k.down[0], k.down[1]));
      });
      const p = cursorAt(tl.cursorPath, t);
      cursor.style.left = `${p.x}px`;
      cursor.style.top = `${p.y}px`;
      cursor.dataset.kind = p.kind;
      show(outro, visibility(t, tl.scenes.outro));
    },
  };
}
```

- [ ] **Step 2: Cửa sổ họp**

`scripts/demo-video/desktop-meeting.mjs`:
```js
// Cửa sổ app họp phóng to trên desktop 1 (không logo, không tên Teams/Meet): thanh tiêu đề Windows, thanh thông tin (tên cuộc họp,
// thời lượng), lưới 2×2 (Sarah tắt cam với ảnh đại diện và viền sáng khi nói; người khác bật cam: ảnh JPEG của đúng khung), thanh
// điều khiển. `render(t)` đợi các ảnh của khung đã giải mã.
import { meetingTiles } from "./desktop-layout.mjs";
import { el, icon, place, titleBar } from "./desktop-dom.mjs";
import { FRAME_MS, levelAt } from "./timeline.mjs";

// Viền "đang nói" giữ thêm chừng này sau tiếng cuối, để không nháy giữa các từ.
const SPEAK_HOLD_MS = 300;

export function buildMeeting(parent, { script, tl, voice, assets }) {
  const L = script.layout;
  const win = el("div", "window meeting", parent);
  place(win, { left: 0, top: 0, width: L.workArea.width, height: L.workArea.height });
  titleBar(win, script.call.title, "dark", "cam");
  const top = el("div", "meet-top", win);
  el("span", "meet-name", top, script.call.title);
  const timer = el("span", "meet-timer", top);
  const right = el("div", "meet-top-right", top);
  icon("people", right);
  el("span", "", right, String(script.call.people.length));
  icon("chat", right);

  const feeds = [];
  let speaker = null;
  meetingTiles(L).forEach((box, i) => {
    const person = script.call.people[i];
    const tile = el("div", "tile", win);
    place(tile, box);
    if (person.video) {
      const img = el("img", "feed", tile);
      img.alt = "";
      feeds.push({ img, name: person.video });
    } else if (person.still) {
      const portrait = el("img", "portrait", tile);
      portrait.alt = "";
      portrait.src = assets.still(person.still);
      speaker = { tile, ring: portrait };
    } else {
      el("div", "initials", tile, person.initials);
    }
    const tag = el("div", "name-tag", tile);
    const isSpeaker = speaker?.tile === tile;
    icon(isSpeaker ? "mic" : "micOff", tag, "icon");
    el("span", "", tag, person.name);
    if (isSpeaker) speaker.bars = [0, 1, 2].map(() => el("i", "bar", tag));
  });

  const controls = el("div", "meet-controls", win);
  el("span", "meet-clock", controls, script.taskbar.time);
  const buttons = el("div", "meet-buttons", controls);
  icon("micOff", buttons, "icon btn muted");
  for (const n of ["cam", "share", "hand", "more"]) icon(n, buttons, "icon btn");
  const leave = el("div", "leave", buttons);
  icon("leave", leave);
  el("span", "", leave, "Rời");

  return {
    async render(t) {
      if (t >= tl.scenes.slide[1]) return; // desktop 1 đã trượt khỏi màn hình
      const secs = script.call.startClock + Math.floor(t / 1000);
      timer.textContent = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
      let level = 0;
      for (let back = 0; back <= SPEAK_HOLD_MS; back += 100) level = Math.max(level, levelAt(voice, tl.voiceStartMs, t - back));
      const g = Math.min(1, levelAt(voice, tl.voiceStartMs, t) / 0.06);
      speaker.ring.style.boxShadow = `0 0 0 ${3 + 9 * g}px rgba(91, 140, 255, ${0.25 + 0.6 * g})`;
      speaker.tile.classList.toggle("speaking", level > 0.009);
      speaker.bars.forEach((b, k) => (b.style.height = `${4 + Math.round(10 * g * [0.6, 1, 0.75][k])}px`));
      const i = Math.floor(t / FRAME_MS + 1e-6);
      const waits = [];
      for (const f of feeds) {
        const src = assets.frame(f.name, i);
        if (f.img.getAttribute("src") === src) continue;
        f.img.src = src;
        waits.push(f.img.decode().catch(() => {}));
      }
      await Promise.all(waits);
    },
  };
}
```

- [ ] **Step 3: Cửa sổ chat**

`scripts/demo-video/desktop-chat.mjs`:
```js
// Cửa sổ chat kiểu Messenger trên desktop 2 (không logo, không tên Messenger): danh sách hội thoại, hội thoại với Sarah (tin cũ, chấm
// "đang nhập…", tin mới, tin của mình gửi bằng Gõ dịch, lời đáp), ô nhập. Tin hiện ra thì đẩy tin cũ lên như app thật.
import { avatar, el, icon, place, titleBar, within } from "./desktop-dom.mjs";

function message(thread, from, text, contact, assets) {
  const row = el("div", `msg ${from}`, thread);
  if (from === "them") avatar(row, contact, assets, "xs");
  el("div", "bubble", row, text);
  return row;
}

function typingBubble(thread, contact, assets) {
  const row = el("div", "msg them typing", thread);
  avatar(row, contact, assets, "xs");
  const bubble = el("div", "bubble", row);
  return { row, dots: [0, 1, 2].map(() => el("i", "dot", bubble)) };
}

// Hiện (rõ dần 180 ms, trồi lên 6 điểm) hay ẩn hẳn khỏi luồng tin.
function appear(node, visible, since) {
  node.style.display = visible ? "" : "none";
  if (!visible) return;
  const p = Math.min(1, since / 180);
  node.style.opacity = String(p);
  node.style.transform = `translateY(${(1 - p) * 6}px)`;
}

export function buildChat(parent, { script, tl, assets }) {
  const L = script.layout.chat;
  const C = script.chat;
  const win = el("div", "window chat", parent);
  place(win, L);
  titleBar(win, C.title, "light", "chat");
  const body = el("div", "chat-body", win);

  const list = el("div", "chat-list", body);
  list.style.width = `${L.listWidth}px`;
  el("div", "list-title", list, "Đoạn chat");
  const search = el("div", "search", list);
  icon("search", search);
  el("span", "", search, "Tìm kiếm");
  let activeLast = null;
  for (const item of C.list) {
    const row = el("div", item.active ? "row active" : "row", list);
    avatar(row, item, assets, "md");
    const text = el("div", "row-text", row);
    el("div", "row-name", text, item.name);
    const last = el("div", "row-last", text, item.last ?? "");
    if (item.active) activeLast = last;
    el("div", "row-time", row, item.time);
  }

  const pane = el("div", "chat-pane", body);
  const head = el("div", "pane-head", pane);
  el("i", "online", avatar(head, C.contact, assets, "sm"));
  const who = el("div", "pane-who", head);
  el("div", "pane-name", who, C.contact.name);
  el("div", "pane-status", who, C.contact.status);
  const actions = el("div", "pane-actions", head);
  for (const n of ["phone", "cam", "info"]) icon(n, actions);

  const thread = el("div", "thread", pane);
  el("div", "day", thread, C.historyDay);
  for (const m of C.history) message(thread, m.from, m.text, C.contact, assets);
  el("div", "day", thread, C.todayDay);
  const typing1 = typingBubble(thread, C.contact, assets);
  const incoming = message(thread, "them", C.sarahMessage, C.contact, assets);
  const outgoing = message(thread, "me", tl.compose.text, C.contact, assets);
  const typing2 = typingBubble(thread, C.contact, assets);
  const reply = message(thread, "them", C.sarahReply, C.contact, assets);

  const composer = el("div", "composer", pane);
  for (const n of ["plus", "image", "smile"]) icon(n, composer);
  const input = el("div", "input", composer);
  const inputText = el("span", "", input);
  icon("send", composer);

  const lastOfHistory = C.history.at(-1);
  const lastLine = (from, text) => (from === "me" ? `Bạn: ${text}` : text);
  const dotsAt = (dots, t) =>
    dots.forEach((d, k) => {
      const wave = 0.5 + 0.5 * Math.sin((t / 1000) * 2 * Math.PI * 1.6 - k * 0.9);
      d.style.opacity = String(0.35 + 0.65 * wave);
      d.style.transform = `translateY(${-2 * wave}px)`;
    });

  return {
    render(t) {
      const c = tl.chat;
      appear(typing1.row, within(t, c.typing1[0], c.typing1[1]), t - c.typing1[0]);
      dotsAt(typing1.dots, t);
      appear(incoming, t >= c.sarahAt, t - c.sarahAt);
      appear(outgoing, t >= c.sentAt, t - c.sentAt);
      appear(typing2.row, within(t, c.typing2[0], c.typing2[1]), t - c.typing2[0]);
      dotsAt(typing2.dots, t);
      appear(reply, t >= c.replyAt, t - c.replyAt);
      const pasted = within(t, c.pasteAt, c.sentAt);
      inputText.textContent = pasted ? tl.compose.text : C.placeholder;
      inputText.className = pasted ? "" : "placeholder";
      input.classList.toggle("focused", t >= c.clickAt);
      activeLast.textContent =
        t >= c.replyAt
          ? C.sarahReply
          : t >= c.sentAt
            ? lastLine("me", tl.compose.text)
            : t >= c.sarahAt
              ? C.sarahMessage
              : lastLine(lastOfHistory.from, lastOfHistory.text);
    },
  };
}
```

- [ ] **Step 4: Trang dựng cảnh**

`scripts/demo-video/desktop.mjs`:
```js
// Trang dựng cảnh bản 16:10 (spec 2026-10-21-demo-video-desktop §2.3): màn hình Windows 11 giả 1536×960 điểm CSS (render.mjs chụp ở
// mật độ 1,25 → 1920×1200). Ghép vỏ Windows (desktop-shell.mjs), cửa sổ họp (desktop-meeting.mjs) trên desktop 1, cửa sổ chat
// (desktop-chat.mjs) trên desktop 2. Thanh phụ đề và ô Gõ dịch là đúng overlay.html, compose.html của app (iframe, IPC giả
// `demo=1`, `platform=windows`) ở đúng chỗ app đặt trên Windows, font đổi sang "Demo UI". Sự kiện tới chúng theo lịch của
// desktop-timeline.mjs bằng setTimeout: render.mjs thay hẹn giờ bằng đồng hồ ảo (vclock.js); mở thẳng trong trình duyệt thì chạy
// theo giờ thật (bấm ▶ để phát, kèm giọng đọc).
//   http://127.0.0.1:1432/scripts/demo-video/desktop.html?script=desktop.vi
import { buildChat } from "./desktop-chat.mjs";
import { el, place, pop, show } from "./desktop-dom.mjs";
import { composeBox, overlayBox, pingPong } from "./desktop-layout.mjs";
import { buildMeeting } from "./desktop-meeting.mjs";
import { buildShell } from "./desktop-shell.mjs";
import { SLIDE_MS, buildDesktopTimeline, ease } from "./desktop-timeline.mjs";

const q = new URLSearchParams(location.search);
const name = q.get("script") ?? "desktop.vi";
const load = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`không tải được ${url} (${r.status})`);
  return r.json();
};
const here = (file) => new URL(file, import.meta.url).href;
const script = await load(here(`./script.${name}.json`));
const d = script.data;
const [voice, live, compose, frameIndex] = await Promise.all([
  load(here(`./data/voice.${d}.json`)),
  load(here(`./data/live.${d}.json`)),
  load(here(`./data/compose.${d}.json`)),
  load("/target/demo-video/frames/index.json"),
]);
const tl = buildDesktopTimeline(script, voice, live, compose);
const L = script.layout;
const ui = script.target;
// Phần cài đặt mà phía Rust gửi kèm `compose://open` (ComposeView của src/lib/ipc.ts): app chạy trên Windows.
const COMPOSE_VIEW = { uiLanguage: ui, theme: "light", target: script.chat.replyTarget, autoPaste: true, blocked: null, platform: "windows" };
// Trong hai iframe: font "Demo UI" như app trên Windows (Segoe UI), tắt transition/animation và con trỏ nhấp nháy (chạy theo giờ thật).
const IFRAME_CSS =
  '*,*::before,*::after{transition:none!important;animation:none!important;font-family:"Demo UI",sans-serif!important}textarea{caret-color:transparent!important}';

const assets = {
  frame: (clip, i) => {
    const count = frameIndex[clip];
    if (!count) throw new Error(`thiếu khung của clip ${clip}: chạy assets.mjs`);
    return `/target/demo-video/frames/${clip}/${String(pingPong(i, count) + 1).padStart(5, "0")}.jpg`;
  },
  still: (still) => `/target/demo-video/frames/${still}.jpg`,
  icon: "/src-tauri/icons/32x32.png",
  appIcon: "/src-tauri/icons/128x128@2x.png",
};
const ctx = { script, tl, voice, assets };

const screen = document.getElementById("screen");
const desks = el("div", "desks", screen);
const desk1 = el("div", "desk", desks);
const desk2 = el("div", "desk d2", desks);
const meeting = buildMeeting(desk1, ctx);
const overlayFrame = el("iframe", "frame overlay-frame", desk1);
place(overlayFrame, overlayBox(L));
overlayFrame.src = `/overlay.html?demo=1&session=running&empty=1&locked=1&platform=windows&lang=${ui}&size=${L.overlay.fontSize}`;
const chat = buildChat(desk2, ctx);
const composeFrame = el("iframe", "frame compose-frame", screen);
place(composeFrame, { ...composeBox(L, script.viewport), height: 320 });
composeFrame.src = `/compose.html?demo=1&platform=windows&lang=${ui}&theme=light`;
const shell = buildShell(screen, ctx);

/** Vẽ đúng hình của thời điểm `t` (ms từ đầu video); đợi ảnh clip của khung đã giải mã. */
async function render(t) {
  const [a, b] = tl.scenes.slide;
  const p = t <= a ? 0 : t >= b ? 1 : ease((t - a) / SLIDE_MS);
  desks.style.transform = `translateX(${-script.viewport.width * p}px)`;
  chat.render(t);
  show(composeFrame, pop(t, tl.chat.composeOpenAt, tl.chat.enter1At + 60, 120));
  shell.render(t);
  await meeting.render(t);
}

const loaded = (node) => new Promise((resolve) => node.addEventListener("load", resolve, { once: true }));
await Promise.all([loaded(overlayFrame), loaded(composeFrame)]);
for (const frame of [overlayFrame, composeFrame]) {
  if (typeof frame.contentWindow.__demoEmit !== "function") throw new Error(`${frame.src}: IPC giả chưa có demo=1`);
  const doc = frame.contentDocument;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = "/scripts/demo-video/fonts/demo-font.css";
  const linkLoaded = loaded(link);
  doc.head.append(link);
  await linkLoaded;
  const style = doc.createElement("style");
  style.textContent = IFRAME_CSS;
  doc.head.append(style);
  await doc.fonts.load('16px "Demo UI"', "Aạ");
}
await document.fonts.load('16px "Demo UI"', "Aạ");
await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));

const log = { translateAt: [] };
const overlayEmit = (event, payload) => overlayFrame.contentWindow.__demoEmit(event, payload);
const composeEmit = (event, payload) => composeFrame.contentWindow.__demoEmit(event, payload);

/** Hẹn mọi sự kiện của lịch; `t0` là giờ (performance.now) của khung đầu tiên. */
function start(t0) {
  const at = (ms, fn) => setTimeout(fn, ms - (performance.now() - t0));
  const w = composeFrame.contentWindow;
  const textarea = () => composeFrame.contentDocument.querySelector("textarea");
  // Như người gõ: đặt giá trị bằng setter gốc (React theo dõi giá trị) rồi bắn `input`, cùng cách của tauri-mock.ts.
  const type = (text) => {
    const node = textarea();
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, "value").set.call(node, text);
    node.dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  // Phía Rust của Gõ dịch: trả bản dịch thật (compose.json) về dần như stream từ model, rồi báo xong.
  window.__demo = {
    composeTranslate(id, emit) {
      log.translateAt.push(performance.now() - t0);
      for (const delta of tl.compose.deltas) {
        setTimeout(() => emit("compose://delta", { id, line: 0, text: delta.text, reset: false }), delta.after);
      }
      setTimeout(() => emit("compose://done", { id, outcome: { kind: "translated", text: tl.compose.text } }), tl.compose.totalMs);
    },
  };
  for (const e of tl.overlayEvents) at(e.at, () => overlayEmit(e.event, e.payload));
  const c = tl.chat;
  at(c.composeOpenAt, () => composeEmit("compose://open", COMPOSE_VIEW));
  for (const step of c.typing) at(step.at, () => type(step.text));
  at(c.enter1At, () => textarea().dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
}

window.__stage = { ready: false, render, log, timeline: tl };
if (typeof window.__vclock === "object") {
  start(0);
  await render(0);
  window.__stage.ready = true;
} else {
  await render(0);
  const play = el("button", "play", document.body, "▶ Phát");
  play.addEventListener("click", () => {
    play.remove();
    const audio = new Audio(`/target/demo-video/voice48.${d}.wav`);
    const t0 = performance.now();
    start(t0);
    setTimeout(() => void audio.play(), tl.voiceStartMs);
    const frame = async () => {
      const t = performance.now() - t0;
      await render(t);
      if (t < tl.totalMs) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
```

- [ ] **Step 5: Kiểm cú pháp, tải thử trang**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && for f in desktop-shell desktop-meeting desktop-chat desktop; do node --check scripts/demo-video/$f.mjs || exit 1; done && node --input-type=module -e '
import { launch } from "./website/tools/browser/cdp.mjs";
const b = await launch();
const p = await b.newPage({ width: 1536, height: 960, dpr: 1.25 });
await p.goto("http://127.0.0.1:1432/scripts/demo-video/desktop.html?script=desktop.vi");
await new Promise((r) => setTimeout(r, 4000));
console.log("ready:", await p.eval("typeof window.__stage === \"object\""));
console.log("lỗi:", p.errors.filter((e) => !e.includes("status of 404")));
await p.screenshot("target/demo-video/desktop-t0.png");
await b.close();'
```
Kỳ vọng: `ready: true`, `lỗi: []`.

Xem `target/demo-video/desktop-t0.png`: cửa sổ họp 4 ô (Sarah ảnh tròn, các ô có người), thanh phụ đề "Phụ đề sẽ hiện ở đây" ở giữa phía dưới, thanh tác vụ, nút ▶. Có lỗi thì dùng superpowers:systematic-debugging.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/desktop-shell.mjs scripts/demo-video/desktop-meeting.mjs scripts/demo-video/desktop-chat.mjs scripts/demo-video/desktop.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): trang dựng cảnh 16:10: họp 4 người, chuyển desktop, chat dùng Gõ dịch thật

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Quay thử, duyệt hình, kiểm dựng lặp lại

**Files:** có thể sửa `scripts/demo-video/script.desktop.vi.json` (bố cục, nhịp) và `scripts/demo-video/desktop.css`.

- [ ] **Step 1: Quay các khung chính ra PNG**

Mỗi lần ghi PNG phải tiến đồng hồ từ khung 0, nên quay một lượt từ đầu tới hết và chỉ giữ khung chính:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && rm -rf target/demo-video/try-desktop && node scripts/demo-video/render.mjs --script desktop.vi --png-dir target/demo-video/try-desktop 2>&1 | tail -2 && node --input-type=module -e '
import { readFileSync } from "node:fs";
import { buildDesktopTimeline } from "./scripts/demo-video/desktop-timeline.mjs";
const j = (f) => JSON.parse(readFileSync(`scripts/demo-video/${f}`, "utf8"));
const tl = buildDesktopTimeline(j("script.desktop.vi.json"), j("data/voice.vi.json"), j("data/live.vi.json"), j("data/compose.vi.json"));
for (const [k, ms] of Object.entries(tl.keyTimes)) console.log(k, String(Math.round(ms / (1000 / 30))).padStart(5, "0") + ".png");'
```
Kỳ vọng: `Xong: khung 0–… , video 3x.x giây; đã kiểm N phụ đề chốt.`, rồi danh sách tên khung chính kèm tên file PNG.

- [ ] **Step 2: Xem và chỉnh**

Ghép các khung chính thành ảnh để xem (thay danh sách số khung bằng số in ở Step 1):
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/target/demo-video/try-desktop && ffmpeg -v error -y -i 00012.png -i 00180.png -i 00400.png -i 00650.png -filter_complex "[0][1][2][3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0,scale=1920:-1" ../sheet-desktop-a.png
```
Xem bằng Read tool. Đạt khi:
- họp: 4 ô, mặt người không bị cắt, Sarah có viền sáng khi nói, thời lượng họp chạy;
- thanh phụ đề đọc rõ, nằm giữa phía dưới, không che tên người;
- chuyển cảnh: hai desktop trượt ngang, thanh tác vụ đứng yên;
- chat: chấm "đang nhập…", tin của Sarah, con trỏ hình chữ I trong ô nhập, ô hiện phím **Ctrl + Alt + G**;
- ô Gõ dịch ở giữa phía trên, chữ có dấu tiếng Việt đủ, bản dịch hiện, gợi ý phím theo Windows;
- sau Enter: câu tiếng Anh trong ô nhập, rồi tin đã gửi, lời đáp của Sarah;
- màn kết: biểu tượng, tên, địa chỉ web, không dòng chữ nhỏ;
- không logo hay tên Teams, Meet, Messenger, Windows, Apple; không chữ nào bị cắt.

Không đạt thì sửa `layout`/`timing` trong `script.desktop.vi.json` hay `desktop.css`, rồi quay lại Step 1.

- [ ] **Step 3: Dựng lặp lại ra y hệt**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && rm -rf target/demo-video/det-a target/demo-video/det-b && node scripts/demo-video/render.mjs --script desktop.vi --png-dir target/demo-video/det-a --from 60 --to 180 && node scripts/demo-video/render.mjs --script desktop.vi --png-dir target/demo-video/det-b --from 60 --to 180 && (cd target/demo-video/det-a && shasum -a 256 *.png) > target/demo-video/det-a.sha && (cd target/demo-video/det-b && shasum -a 256 *.png) > target/demo-video/det-b.sha && diff -q target/demo-video/det-a.sha target/demo-video/det-b.sha && echo "GIỐNG HỆT"
```
Kỳ vọng: `GIỐNG HỆT`.

- [ ] **Step 4: Commit các chỉnh sửa (nếu có)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short && git add scripts/demo-video/script.desktop.vi.json scripts/demo-video/desktop.css && git commit -m "$(cat <<'EOF'
fix(demo-video): chỉnh bố cục, nhịp bản 16:10 sau khi xem khung chính

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
Không có thay đổi thì bỏ qua bước này.

---

### Task 12: Quay bản 16:10 và kiểm

- [ ] **Step 1: Quay cả video**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node scripts/demo-video/render.mjs --script desktop.vi 2>&1 | tail -3
```
Kỳ vọng: `→ …/ai-translator-demo.desktop.vi.mp4`, rồi `Xong: … đã kiểm N phụ đề chốt.`; không có `Không đạt`.

- [ ] **Step 2: ffprobe**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt,sample_rate -show_entries format=duration -of default=nw=1 target/demo-video/ai-translator-demo.desktop.vi.mp4
```
Kỳ vọng:
- `h264`, `1920`, `1200`, `30/1`, `yuv420p`;
- `aac`, `48000`;
- `duration` trong khoảng 30–60.

- [ ] **Step 3: Xem khung chính**

Xem 13 ảnh trong `target/demo-video/keyframes.desktop.vi/` và một khung trích từ MP4, để kiểm màu:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && ffmpeg -v error -y -ss 10 -i target/demo-video/ai-translator-demo.desktop.vi.mp4 -frames:v 1 target/demo-video/mp4-desktop-10s.png
```
Đạt theo danh sách ở Task 11 Step 2; màu khung MP4 giống ảnh chụp.

- [ ] **Step 4: Chạy lại mọi test, dọn**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)" && pnpm exec tsc --noEmit > /dev/null 2>&1; echo "tsc mã thoát: $?"; kill $(lsof -tiTCP:1432 -sTCP:LISTEN) 2>/dev/null; sleep 1; lsof -nP -iTCP:1432 -sTCP:LISTEN || echo "đã tắt vite 1432"; rm -rf target/demo-video/try-desktop target/demo-video/det-a target/demo-video/det-b target/demo-video/regress-before target/demo-video/regress-after target/demo-video/*.sha target/demo-video/sheet-*.png
```
Kỳ vọng: `ℹ fail 0`, `tsc mã thoát: 0`, `đã tắt vite 1432`.

---

### Task 13: Bàn giao

- [ ] **Step 1: Báo chủ dự án**

Gửi đường dẫn đầy đủ `target/demo-video/ai-translator-demo.desktop.vi.mp4`, độ dài, danh sách clip Mixkit đã dùng (từ `assets.json`), những gì đã chỉnh so với spec. Nhờ chủ dự án xem cả video. Nhắc: nhánh `demo-video` chưa push, chưa merge.

- [ ] **Step 2: Cập nhật bộ nhớ**

Cập nhật `memory/demo-video-2026-10-21.md`: bản 16:10 xong, đường dẫn, clip đã dùng, việc còn lại.
