# Video giới thiệu Dịch live + Gõ dịch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng video 1080×1920, khoảng 50 giây, có tiếng, giới thiệu Dịch live và Gõ dịch cho mạng xã hội. Hình dựng bằng giao diện thật của app; chữ và thời gian lấy từ code thật của app.

**Architecture:**
- `voice.mjs`: giọng Premium của macOS đọc kịch bản.
- `data.mjs`: `latency-bench session --streaming` và `latency-bench mt-eval` tạo chữ thật kèm thời điểm, commit vào `scripts/demo-video/data/`.
- `stage.mjs`: trang dựng cảnh phát lại các sự kiện đó trên `overlay.html` và `compose.html` thật, nhúng bằng iframe.
- `render.mjs`: chụp từng khung bằng Chrome không đầu dưới đồng hồ ảo (`vclock.js`), ghép tiếng (`audio.mjs`), rồi ffmpeg xuất MP4.

**Tech Stack:**
- Node 24 (ESM, `node:test`), Chrome qua `website/tools/browser/cdp.mjs`, Vite của `scripts/ui-preview`.
- `say` của macOS, `latency-bench` (Rust, đã có trong workspace), ffmpeg (Homebrew).
- Không thêm thư viện npm/cargo nào.

**Spec:** `docs/superpowers/specs/2026-10-21-demo-video-design.md` (đọc trước).

**Quy ước của repo phải giữ:**
- Comment và thông báo bằng tiếng Việt có dấu.
- Không sửa code app (`src/`, `src-tauri/`, `crates/`).
- Chỉ sửa `scripts/ui-preview/tauri-mock.ts` ở chỗ móc `demo=1`.
- Mỗi lệnh Bash bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/ai-translator &&` (cwd bị đặt lại sau mỗi lệnh).
- Trước mỗi commit chạy `git branch --show-current`, phải ra `demo-video`.
- **Không push, không merge vào `main`** khi chủ dự án chưa cho phép.
- Server Vite nền mở ra thì tắt khi xong.

---

## Cấu trúc file

| File | Việc |
|---|---|
| `scripts/demo-video/script.vi.json` | Kịch bản: câu nói, tin nhắn, câu trả lời, chú thích, nhịp thời gian, bố cục |
| `scripts/demo-video/wav.mjs` | Đọc/ghi WAV PCM 16-bit, hạ mẫu 48 → 16 kHz không trễ |
| `scripts/demo-video/voice.mjs` | Tạo giọng đọc, mốc câu, mức âm lượng (hàm thuần + CLI) |
| `scripts/demo-video/data.mjs` | Chạy latency-bench, kiểm, ghi dữ liệu thật (hàm thuần + CLI) |
| `scripts/demo-video/timeline.mjs` | Lịch thời gian của cả video (thuần, dùng chung Node và trình duyệt) |
| `scripts/demo-video/vclock.js` | Đồng hồ ảo nạp vào mọi frame khi quay |
| `scripts/demo-video/audio.mjs` | Ghép giọng đọc và tiếng gõ phím |
| `scripts/demo-video/stage.html`, `stage.css`, `stage.mjs` | Trang dựng cảnh 540×960 |
| `scripts/demo-video/render.mjs` | Quay, kiểm, xuất MP4 |
| `scripts/demo-video/*.test.mjs` | Test `node:test` cho các module thuần |
| `scripts/demo-video/data/voice.vi.json`, `live.vi.json`, `compose.vi.json` | Dữ liệu thật đã dùng (sinh ra, commit) |
| `scripts/ui-preview/tauri-mock.ts` | Sửa: chỗ móc `demo=1` |

Kết quả trung gian và video nằm ở `target/demo-video/` (đã bị `.gitignore` bỏ qua qua `/target/`).

Chạy mọi test của thư mục: `node --test scripts/demo-video/*.test.mjs`.

---

### Task 0: Chuẩn bị

**Files:** không có file mới.

- [ ] **Step 1: Tạo nhánh**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short && git branch --show-current && git switch -c demo-video
```
Kỳ vọng: không có dòng trạng thái nào (cây sạch), nhánh hiện tại là `main`, rồi `Switched to a new branch 'demo-video'`. Nếu cây không sạch thì dừng và hỏi chủ dự án.

- [ ] **Step 2: Kiểm giọng đọc**

```bash
say -v '?' | grep -i evan
```
Kỳ vọng: có một dòng `Evan (Premium) …` hay `Evan (Enhanced) …`. Ghi lại **đúng** tên (phần trước khoảng trắng dài) để dùng ở Task 2.
- Không có dòng nào: dừng, báo chủ dự án tải giọng (System Settings › Accessibility › Spoken Content › System Voice › Manage Voices…).
- Không tự chọn giọng khác.

- [ ] **Step 3: Cài ffmpeg (hỏi trước)**

Hỏi chủ dự án có cho chạy `brew install ffmpeg` không (công cụ máy dev, không vào app). Được cho phép thì:
```bash
brew install ffmpeg && ffmpeg -hide_banner -version | head -1 && ffprobe -hide_banner -version | head -1 && ffmpeg -hide_banner -encoders | grep -E "libx264|aac"
```
Kỳ vọng: hai dòng phiên bản, và có `libx264` cùng `aac` trong danh sách encoder.

- [ ] **Step 4: Build latency-bench và chép sidecar**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo build --release -p latency-bench && scripts/copy-sidecars.sh && ./target/release/latency-bench session --help | head -3
```
Kỳ vọng:
- build xong;
- `copy-sidecars.sh` liệt kê `asr-worker-aarch64-apple-darwin`, `llama-server-aarch64-apple-darwin` và các `.dylib`;
- `session --help` in dòng mô tả, không còn lỗi `unrecognized subcommand`.

---

### Task 1: Đọc/ghi WAV và hạ mẫu

**Files:**
- Create: `scripts/demo-video/wav.mjs`
- Test: `scripts/demo-video/wav.test.mjs`

- [ ] **Step 1: Viết test**

`scripts/demo-video/wav.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { decimate3, readWav, writeWav } from "./wav.mjs";

const sine = (hz, rate, seconds, amp = 0.5) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));
const rms = (x, from, to) => Math.sqrt(x.slice(from, to).reduce((s, v) => s + v * v, 0) / (to - from));

test("ghi rồi đọc lại WAV giữ nguyên mẫu (sai số lượng tử 16-bit)", () => {
  const x = Float32Array.from([0, 0.5, -0.5, 0.999, -1, 0.25]);
  const { rate, samples } = readWav(writeWav(x, 48_000));
  assert.equal(rate, 48_000);
  assert.equal(samples.length, x.length);
  x.forEach((v, i) => assert.ok(Math.abs(samples[i] - v) < 2 / 32768, `mẫu ${i}`));
});

test("đọc WAV hai kênh thì gộp về mono", () => {
  const buf = writeWav(Float32Array.from([0, 0]), 16_000);
  // Sửa header thành 2 kênh, 1 khung: trái 0,5, phải -0,25.
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(16_000 * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeInt16LE(16384, 44);
  buf.writeInt16LE(-8192, 46);
  const { samples } = readWav(buf);
  assert.equal(samples.length, 1);
  assert.ok(Math.abs(samples[0] - 0.125) < 1e-4);
});

test("không phải WAV PCM 16-bit thì báo lỗi", () => {
  const buf = writeWav(Float32Array.from([0]), 16_000);
  buf.writeUInt16LE(24, 34);
  assert.throws(() => readWav(buf), /16-bit/);
  assert.throws(() => readWav(Buffer.from("not a wav file at all")), /WAV/);
});

test("hạ mẫu không làm trễ: xung ở mẫu 3000 (48 kHz) thành đỉnh ở mẫu 1000 (16 kHz)", () => {
  const x = new Float32Array(9000);
  x[3000] = 1;
  const y = decimate3(x);
  assert.equal(y.length, 3000);
  const peak = y.reduce((best, v, i) => (v > y[best] ? i : best), 0);
  assert.equal(peak, 1000);
});

test("hạ mẫu giữ tiếng 1 kHz và chặn tiếng 12 kHz", () => {
  const pass = decimate3(sine(1000, 48_000, 1));
  assert.ok(Math.abs(rms(pass, 200, pass.length - 200) - 0.5 / Math.SQRT2) < 0.005);
  const stop = decimate3(sine(12_000, 48_000, 1));
  assert.ok(rms(stop, 200, stop.length - 200) < 0.005);
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/wav.test.mjs`
Kỳ vọng: FAIL, `Cannot find module …/wav.mjs`.

- [ ] **Step 3: Viết module**

`scripts/demo-video/wav.mjs`:
```js
// Đọc/ghi WAV PCM 16-bit và hạ tần số mẫu 48 kHz → 16 kHz cho công cụ dựng video (spec 2026-10-21-demo-video §2.2). Không thêm
// thư viện.

/** WAV PCM 16-bit (mọi số kênh, gộp về mono) → { rate, samples: Float32Array trong [-1, 1] }. */
export function readWav(buf) {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("không phải file WAV");
  }
  let fmt = null;
  let data = null;
  for (let p = 12; p + 8 <= buf.length; ) {
    const id = buf.toString("ascii", p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === "fmt ") {
      const tag = buf.readUInt16LE(p + 8);
      fmt = {
        // WAVE_FORMAT_EXTENSIBLE: định dạng thật nằm ở 2 byte đầu của GUID con.
        format: tag === 0xfffe ? buf.readUInt16LE(p + 32) : tag,
        channels: buf.readUInt16LE(p + 10),
        rate: buf.readUInt32LE(p + 12),
        bits: buf.readUInt16LE(p + 22),
      };
    }
    if (id === "data") data = buf.subarray(p + 8, Math.min(buf.length, p + 8 + size));
    p += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("WAV thiếu khối fmt hay data");
  if (fmt.format !== 1 || fmt.bits !== 16) {
    throw new Error(`chỉ đọc WAV PCM 16-bit (file có định dạng ${fmt.format}, ${fmt.bits} bit)`);
  }
  const frames = Math.floor(data.length / (2 * fmt.channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) sum += data.readInt16LE((i * fmt.channels + c) * 2);
    samples[i] = sum / fmt.channels / 32768;
  }
  return { rate: fmt.rate, samples };
}

/** Float32Array mono → WAV PCM 16-bit (Buffer). */
export function writeWav(samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), 44 + i * 2);
  }
  return buf;
}

// Lọc thông thấp FIR đối xứng (sinc cửa sổ Blackman, 97 hệ số, cắt ở 7,2 kHz của 48 kHz). Đối xứng quanh tâm nên không làm trễ.
const HALF = 48;
const TAPS = (() => {
  const fc = 7200 / 48_000;
  const h = new Float64Array(2 * HALF + 1);
  let sum = 0;
  for (let k = -HALF; k <= HALF; k++) {
    const sinc = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
    const w = 0.42 + 0.5 * Math.cos((Math.PI * k) / HALF) + 0.08 * Math.cos((2 * Math.PI * k) / HALF);
    h[k + HALF] = sinc * w;
    sum += h[k + HALF];
  }
  return h.map((v) => v / sum);
})();

/** 48 kHz → 16 kHz: lọc rồi lấy 1 trong 3 mẫu. Mẫu thứ n của đầu ra đúng là thời điểm của mẫu 3n đầu vào. */
export function decimate3(x) {
  const y = new Float32Array(Math.floor(x.length / 3));
  for (let j = 0; j < y.length; j++) {
    let acc = 0;
    for (let k = -HALF; k <= HALF; k++) {
      const i = 3 * j + k;
      if (i >= 0 && i < x.length) acc += TAPS[k + HALF] * x[i];
    }
    y[j] = acc;
  }
  return y;
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/wav.test.mjs`
Kỳ vọng: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/wav.mjs scripts/demo-video/wav.test.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): đọc/ghi WAV và hạ mẫu 48 → 16 kHz không trễ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Kịch bản và tạo giọng đọc

**Files:**
- Create: `scripts/demo-video/script.vi.json`
- Create: `scripts/demo-video/voice.mjs`
- Test: `scripts/demo-video/voice.test.mjs`

- [ ] **Step 1: Viết kịch bản**

`scripts/demo-video/script.vi.json`. `voice.name` thay bằng **đúng** tên ghi ở Task 0 Step 2 nếu khác `Evan (Premium)`.
```json
{
  "target": "vi",
  "voice": {
    "name": "Evan (Premium)",
    "leadMs": 600,
    "tailMs": 2000,
    "lines": [
      { "text": "Thanks for joining, everyone.", "gapAfterMs": 700 },
      { "text": "We need to move the launch date to the second week of November.", "gapAfterMs": 800 },
      { "text": "Our design team found a few issues in the checkout flow.", "gapAfterMs": 800 },
      { "text": "Could you send us an updated quote for the extra work by Friday?", "gapAfterMs": 0 }
    ]
  },
  "timing": {
    "hookMs": 3000,
    "liveHoldMs": 2500,
    "outroMs": 5000,
    "chat": {
      "sarahMsgMs": 700,
      "hotkeyMs": 2000,
      "pressMs": 200,
      "openAfterHotkeyMs": 250,
      "typingAfterOpenMs": 600,
      "pace": { "charMs": 70, "spaceMs": 110, "punctuationMs": 260 },
      "readMs": 1600,
      "pasteMs": 150,
      "reviewMs": 1200,
      "holdMs": 2200
    }
  },
  "captions": {
    "hook": { "title": "Họp với đối tác nước ngoài mà nghe không kịp?", "sub": "" },
    "live": { "title": "Phụ đề tiếng Việt hiện ra trong lúc đối tác đang nói", "sub": "Chạy trên máy, âm thanh không gửi lên cloud" },
    "chat": { "title": "Gõ tiếng Việt, gửi đi tiếng Anh", "sub": "Bấm ⌃⌥G khi đang ở ô chat" }
  },
  "call": { "title": "Weekly sync", "speaker": "Sarah", "role": "Product Lead", "initial": "S", "you": "Bạn" },
  "chat": {
    "contact": "Sarah",
    "sarahMessage": "Hi! Following up on the quote we discussed in the meeting.",
    "reply": "Dạ, em sẽ gửi báo giá mới trước thứ Sáu ạ.",
    "replyLang": "vi",
    "replyTarget": "en",
    "placeholder": "Nhắn cho Sarah…"
  },
  "outro": {
    "name": "AI Translator",
    "tagline": "Dịch live + Gõ dịch · chạy offline",
    "url": "aitranslator.io.vn",
    "fine": "Phụ đề và bản dịch do app tạo ra; đo trên MacBook Pro M4 Pro, gói Chuẩn, bật Dịch trong lúc nói."
  },
  "layout": {
    "safe": { "top": 126, "bottom": 720, "right": 486 },
    "call": { "left": 16, "top": 256, "width": 470, "height": 174 },
    "overlay": { "left": 16, "top": 438, "width": 470, "height": 278, "fontSize": 24 },
    "chat": { "left": 16, "top": 256, "width": 470, "height": 384 },
    "compose": { "top": 290, "scale": 0.84 },
    "keys": { "top": 652 }
  }
}
```

- [ ] **Step 2: Viết test cho phần thuần**

`scripts/demo-video/voice.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleVoice, rmsLevels, trimSilence, truthFor } from "./voice.mjs";

test("cắt khoảng lặng đầu cuối, chừa 20 ms mỗi bên", () => {
  const rate = 1000; // 1 mẫu = 1 ms cho dễ đọc
  const x = new Float32Array(500);
  x.fill(0.5, 100, 300);
  const y = trimSilence(x, rate);
  assert.equal(y.length, 240); // mẫu 80..319
  assert.equal(y[19], 0);
  assert.equal(y[20], 0.5);
  assert.equal(y[219], 0.5);
  assert.equal(y[220], 0);
});

test("câu toàn khoảng lặng thì báo lỗi", () => {
  assert.throws(() => trimSilence(new Float32Array(100), 1000), /khoảng lặng/);
});

test("ghép câu với khoảng nghỉ và ghi đúng mốc từng câu", () => {
  const rate = 1000;
  const a = new Float32Array(200).fill(0.1);
  const b = new Float32Array(300).fill(0.2);
  const { samples, spans } = assembleVoice([a, b], { rate, leadMs: 600, tailMs: 2000, gapsMs: [700, 0] });
  assert.equal(samples.length, 600 + 200 + 700 + 300 + 2000);
  assert.deepEqual(spans, [
    { startMs: 600, endMs: 800 },
    { startMs: 1500, endMs: 1800 },
  ]);
  assert.equal(samples[599], 0);
  assert.equal(samples[600], a[0]);
  assert.equal(samples[1500], b[0]);
  assert.equal(samples[1800], 0);
});

test("mức âm lượng là RMS của từng khung 100 ms", () => {
  const x = new Float32Array(9600); // 200 ms ở 48 kHz
  x.fill(0.5, 0, 4800);
  assert.deepEqual(rmsLevels(x, 48_000), [0.5, 0]);
});

test("mốc câu theo định dạng truth.json của bench, làm tròn ms", () => {
  const truth = truthFor([{ text: "Hello." }], [{ startMs: 600.4, endMs: 1500.6 }]);
  assert.deepEqual(truth, [{ id: "demo-1", lang: "en", start_ms: 600, end_ms: 1501, vad_end_ms: 1501, text: "Hello." }]);
});
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/voice.test.mjs`
Kỳ vọng: FAIL, không tìm thấy `voice.mjs`.

- [ ] **Step 4: Viết module**

`scripts/demo-video/voice.mjs`:
```js
// Tạo giọng đọc tiếng Anh cho video (spec 2026-10-21-demo-video §2.2): `say` đọc từng câu của kịch bản (48 kHz), cắt khoảng lặng
// đầu cuối, ghép với khoảng nghỉ đã khai; từ cùng file đó hạ mẫu ra WAV 16 kHz cho latency-bench và ghi mốc câu (truth.json).
//   node scripts/demo-video/voice.mjs [vi]
// Ra target/demo-video/voice48.<ngôn ngữ>.wav, voice16.<…>.wav, truth.<…>.json, và scripts/demo-video/data/voice.<…>.json
// (commit): độ dài, mốc câu, mức âm lượng mỗi 100 ms (chấm "đang nghe", vòng sáng người nói), mã băm của file 48 kHz để
// render.mjs kiểm đúng file đã dùng lấy chữ.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decimate3, readWav, writeWav } from "./wav.mjs";

export const VOICE_RATE = 48_000;
export const LEVEL_WINDOW_MS = 100;

/** Bỏ khoảng lặng đầu và cuối (|mẫu| ≤ `threshold`), chừa `padMs` mỗi bên. */
export function trimSilence(samples, rate, threshold = 0.01, padMs = 20) {
  const first = samples.findIndex((v) => Math.abs(v) > threshold);
  if (first < 0) throw new Error("câu đọc ra toàn khoảng lặng");
  let last = samples.length - 1;
  while (Math.abs(samples[last]) <= threshold) last--;
  const pad = Math.round((padMs / 1000) * rate);
  return samples.subarray(Math.max(0, first - pad), Math.min(samples.length, last + 1 + pad));
}

/** Ghép các câu: `leadMs` lặng, câu 1, nghỉ `gapsMs[0]`, câu 2, …, `tailMs` lặng. Trả mẫu và mốc đầu/cuối (ms) của từng câu. */
export function assembleVoice(clips, { rate, leadMs, tailMs, gapsMs }) {
  const toSamples = (ms) => Math.round((ms / 1000) * rate);
  const gap = (i) => (i < clips.length - 1 ? toSamples(gapsMs[i]) : 0);
  const total = clips.reduce((n, c, i) => n + c.length + gap(i), toSamples(leadMs) + toSamples(tailMs));
  const samples = new Float32Array(total);
  const spans = [];
  let at = toSamples(leadMs);
  clips.forEach((c, i) => {
    samples.set(c, at);
    spans.push({ startMs: (at / rate) * 1000, endMs: ((at + c.length) / rate) * 1000 });
    at += c.length + gap(i);
  });
  return { samples, spans };
}

/** RMS của từng khung `windowMs`, làm tròn 4 chữ số. */
export function rmsLevels(samples, rate, windowMs = LEVEL_WINDOW_MS) {
  const n = Math.round((windowMs / 1000) * rate);
  const out = [];
  for (let i = 0; i < samples.length; i += n) {
    const end = Math.min(samples.length, i + n);
    let sum = 0;
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    out.push(Math.round(Math.sqrt(sum / (end - i)) * 10_000) / 10_000);
  }
  return out;
}

/** Mốc câu cho `latency-bench session --truth` (định dạng `bench/phase0/data/latency/*.truth.json`). */
export function truthFor(lines, spans) {
  return lines.map((line, i) => ({
    id: `demo-${i + 1}`,
    lang: "en",
    start_ms: Math.round(spans[i].startMs),
    end_ms: Math.round(spans[i].endMs),
    vad_end_ms: Math.round(spans[i].endMs),
    text: line.text,
  }));
}

function main(lang) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.resolve(here, "../../target/demo-video");
  const script = JSON.parse(readFileSync(path.join(here, `script.${lang}.json`), "utf8"));
  const { name, leadMs, tailMs, lines } = script.voice;
  const installed = execFileSync("say", ["-v", "?"], { encoding: "utf8" })
    .split("\n")
    .some((l) => l.startsWith(`${name} `));
  if (!installed) {
    console.error(
      `Chưa có giọng "${name}". Tải trong System Settings › Accessibility › Spoken Content › System Voice › Manage Voices…, rồi chạy lại.`,
    );
    process.exit(1);
  }
  mkdirSync(path.join(out, "voice"), { recursive: true });
  const clips = lines.map((line, i) => {
    const file = path.join(out, "voice", `${lang}-${i + 1}.wav`);
    execFileSync("say", ["-v", name, "--file-format=WAVE", `--data-format=LEI16@${VOICE_RATE}`, "-o", file, line.text]);
    const { rate, samples } = readWav(readFileSync(file));
    if (rate !== VOICE_RATE) throw new Error(`${file}: ${rate} Hz, cần ${VOICE_RATE} Hz`);
    return trimSilence(samples, rate);
  });
  const gapsMs = lines.map((l) => l.gapAfterMs);
  const { samples, spans } = assembleVoice(clips, { rate: VOICE_RATE, leadMs, tailMs, gapsMs });
  const wav48 = writeWav(samples, VOICE_RATE);
  writeFileSync(path.join(out, `voice48.${lang}.wav`), wav48);
  writeFileSync(path.join(out, `voice16.${lang}.wav`), writeWav(decimate3(samples), 16_000));
  const truth = truthFor(lines, spans);
  writeFileSync(path.join(out, `truth.${lang}.json`), `${JSON.stringify(truth, null, 1)}\n`);
  const voice = {
    voice: name,
    macos: execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim(),
    rate: VOICE_RATE,
    durationMs: Math.round((samples.length / VOICE_RATE) * 1000),
    leadMs,
    sha256: createHash("sha256").update(wav48).digest("hex"),
    levelWindowMs: LEVEL_WINDOW_MS,
    levels: rmsLevels(samples, VOICE_RATE),
    truth,
  };
  mkdirSync(path.join(here, "data"), { recursive: true });
  writeFileSync(path.join(here, "data", `voice.${lang}.json`), `${JSON.stringify(voice, null, 1)}\n`);
  console.log(`${lines.length} câu, ${(voice.durationMs / 1000).toFixed(1)} giây → ${path.join(out, `voice48.${lang}.wav`)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2] ?? "vi");
```

- [ ] **Step 5: Chạy test, thấy đạt**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/voice.test.mjs`
Kỳ vọng: `# pass 5`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/script.vi.json scripts/demo-video/voice.mjs scripts/demo-video/voice.test.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): kịch bản tiếng Việt và công cụ tạo giọng đọc

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Tạo giọng đọc thật

**Files:**
- Create (sinh ra): `scripts/demo-video/data/voice.vi.json`

- [ ] **Step 1: Chạy**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node scripts/demo-video/voice.mjs vi`
Kỳ vọng: `4 câu, 1x.x giây → …/target/demo-video/voice48.vi.wav`, độ dài khoảng 14–18 giây. Có đủ các file:
- `target/demo-video/voice48.vi.wav`;
- `target/demo-video/voice16.vi.wav`;
- `target/demo-video/truth.vi.json`;
- `scripts/demo-video/data/voice.vi.json`.

- [ ] **Step 2: Kiểm định dạng và độ khớp hai file**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && afinfo target/demo-video/voice16.vi.wav | grep -E "Data format|estimated duration" && afinfo target/demo-video/voice48.vi.wav | grep -E "Data format|estimated duration"
```
Kỳ vọng:
- file 16 kHz là `1 ch, 16000 Hz, Int16`; file 48 kHz là `1 ch, 48000 Hz, Int16`;
- hai độ dài lệch nhau dưới 0,001 giây.

- [ ] **Step 3: Nghe thử**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && afplay target/demo-video/voice48.vi.wav`
Báo chủ dự án là máy sắp phát tiếng trước khi chạy. Kỳ vọng: nghe rõ 4 câu, nghỉ tự nhiên giữa các câu, đầu câu không bị cắt.

- [ ] **Step 4: Commit dữ liệu giọng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/data/voice.vi.json && git commit -m "$(cat <<'EOF'
chore(demo-video): mốc câu và mức âm lượng của giọng đọc tiếng Anh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Công cụ lấy chữ thật

**Files:**
- Create: `scripts/demo-video/data.mjs`
- Test: `scripts/demo-video/data.test.mjs`

- [ ] **Step 1: Viết test**

`scripts/demo-video/data.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { composeFrom, liveProblems, slimLive } from "./data.mjs";

const report = (events, run = {}) => ({
  args: { streaming: "true" },
  machine: { cpu: "Apple M4 Pro" },
  usage: {},
  summary: { first_token_p50_ms: 400 },
  utterances: [],
  run: { session_ms: 20_000, feed_lag_max_ms: 3, sidecar_restarts: 0, asr_busy_ms: 1, ...run },
  events,
});
const sub = (t_ms, fields = {}) => ({
  t_ms,
  kind: "subtitle",
  id: 1,
  start_ms: 0,
  end_ms: 0,
  src_lang: "en",
  src_text: "Hi.",
  tgt_text: "Chào.",
  status: "done",
  provisional: false,
  replaces: [],
  ...fields,
});
const liveEv = {
  t_ms: 900,
  kind: "live",
  id: 1,
  extends: null,
  src_lang: "en",
  src_stable: "Hi",
  src_tail: "",
  tgt_stable: "Chào",
  tgt_tail: "",
  tgt_src_units: 1,
};

test("chỉ giữ sự kiện giao diện và phần run cần dùng", () => {
  const slim = slimLive(report([sub(1000), liveEv, { t_ms: 5, kind: "level" }]));
  assert.deepEqual(Object.keys(slim), ["args", "machine", "run", "summary", "events"]);
  assert.deepEqual(slim.run, { session_ms: 20_000, feed_lag_max_ms: 3, sidecar_restarts: 0 });
  assert.deepEqual(
    slim.events.map((e) => e.kind),
    ["subtitle", "live"],
  );
});

test("lượt chạy tốt thì không có vấn đề", () => {
  assert.deepEqual(liveProblems(slimLive(report([liveEv, sub(1000)]))), []);
});

test("báo phát lại chậm, tiến trình phụ khởi động lại, thiếu dòng đang nói, engine tắt chế độ, câu lỗi, không câu nào xong", () => {
  const off = { t_ms: 2, kind: "indicators", lagging: false, noAudio: false, translationUnavailable: false, streamingUnavailable: true };
  const bad = slimLive(report([sub(1000, { status: "failed" }), off], { feed_lag_max_ms: 150, sidecar_restarts: 1 }));
  assert.equal(liveProblems(bad).length, 6);
});

test("Gõ dịch lấy bản dịch, thời gian và điều kiện chạy; câu lỗi thì dừng", () => {
  const meta = { model_file: "Hy-MT2-1.8B-Q8_0.gguf", git_head: "abc", git_dirty: false };
  const row = { status: "done", hyp: "I'll send it.", total_ms: 412.5, first_token_ms: 30.1, attempts: 1 };
  assert.deepEqual(composeFrom(row, meta, "Em gửi ạ."), {
    src: "Em gửi ạ.",
    hyp: "I'll send it.",
    total_ms: 412.5,
    first_token_ms: 30.1,
    attempts: 1,
    model_file: "Hy-MT2-1.8B-Q8_0.gguf",
    git_head: "abc",
    git_dirty: false,
  });
  assert.throws(() => composeFrom({ status: "failed", reason: "quá dài" }, meta, "x"), /quá dài/);
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/data.test.mjs`
Kỳ vọng: FAIL, không tìm thấy `data.mjs`.

- [ ] **Step 3: Viết module**

`scripts/demo-video/data.mjs`:
```js
// Lấy chữ thật cho video (spec 2026-10-21-demo-video §2.3):
// - `latency-bench session --streaming`: engine, tiến trình phụ và luật cắt/ghép câu của app (gói Chuẩn, cài đặt mặc định, bật
//   dịch trong lúc nói), chạy trên giọng đọc của voice.mjs;
// - `latency-bench mt-eval` biến thể `plain`: hàm dịch mà Gõ dịch dùng (`pipeline::translate`, không ngữ cảnh), cho câu trả lời.
// Ghi scripts/demo-video/data/live.<ngôn ngữ>.json và compose.<…>.json (commit). Không sửa tay hai file này (spec §4).
//   cargo build --release -p latency-bench && scripts/copy-sidecars.sh    # khi code engine hay sidecar đổi
//   node scripts/demo-video/data.mjs [vi]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Sự kiện engine gửi giao diện mà video dùng; `indicators` giữ để kiểm chế độ dịch trong lúc nói còn bật.
const KEEP = new Set(["subtitle", "delta", "live", "live_end", "indicators"]);
// latency-bench cảnh báo khi phát lại chậm hơn thời gian thực quá mức này (`FEED_LAG_WARN_MS` của session.rs).
const FEED_LAG_LIMIT_MS = 100;

/** Phần của báo cáo `latency-bench session` mà video cần. */
export function slimLive(report) {
  const { session_ms, feed_lag_max_ms, sidecar_restarts } = report.run;
  return {
    args: report.args,
    machine: report.machine,
    run: { session_ms, feed_lag_max_ms, sidecar_restarts },
    summary: report.summary,
    events: report.events.filter((e) => KEEP.has(e.kind)),
  };
}

/** Lý do không dùng được lượt chạy (rỗng là dùng được). */
export function liveProblems(live) {
  const problems = [];
  if (live.run.feed_lag_max_ms > FEED_LAG_LIMIT_MS) {
    problems.push(`phát lại chậm hơn thời gian thực ${live.run.feed_lag_max_ms} ms (máy đang bận?): chạy lại`);
  }
  if (live.run.sidecar_restarts > 0) problems.push(`tiến trình phụ khởi động lại ${live.run.sidecar_restarts} lần`);
  if (!live.events.some((e) => e.kind === "live")) problems.push("không có dòng đang nói nào: chế độ dịch trong lúc nói không chạy");
  if (live.events.some((e) => e.kind === "indicators" && e.streamingUnavailable)) {
    problems.push("engine tự tắt dịch trong lúc nói (máy chưa đủ nhanh)");
  }
  const finals = live.events.filter((e) => e.kind === "subtitle" && !e.provisional);
  if (finals.some((e) => e.status === "failed")) problems.push("có câu dịch lỗi");
  if (!finals.some((e) => e.status === "done")) problems.push("không có câu nào dịch xong");
  return problems;
}

/** Dòng kết quả của mt-eval → dữ liệu Gõ dịch của video, kèm điều kiện chạy. */
export function composeFrom(row, meta, src) {
  if (row.status !== "done") throw new Error(`mt-eval không dịch được câu trả lời: ${row.reason ?? row.status}`);
  return {
    src,
    hyp: row.hyp,
    total_ms: row.total_ms,
    first_token_ms: row.first_token_ms,
    attempts: row.attempts,
    model_file: meta.model_file,
    git_head: meta.git_head,
    git_dirty: meta.git_dirty,
  };
}

function main(lang) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../..");
  const out = path.join(root, "target/demo-video");
  const bin = path.join(root, "src-tauri/binaries");
  const paths = {
    bench: path.join(root, "target/release/latency-bench"),
    asrWorker: path.join(bin, "asr-worker-aarch64-apple-darwin"),
    llamaServer: path.join(bin, "llama-server-aarch64-apple-darwin"),
    asrModel: path.join(root, "models/ggml-large-v3-turbo-q5_0.bin"),
    mtModel: path.join(root, "models/Hy-MT2-1.8B-Q8_0.gguf"),
    wav: path.join(out, `voice16.${lang}.wav`),
    truth: path.join(out, `truth.${lang}.json`),
  };
  const missing = Object.values(paths).filter((p) => !existsSync(p));
  if (missing.length > 0) {
    console.error(`Thiếu: ${missing.join(", ")} (chưa chạy voice.mjs, chưa build latency-bench hay chưa chép sidecar)`);
    process.exit(1);
  }
  const script = JSON.parse(readFileSync(path.join(here, `script.${lang}.json`), "utf8"));
  mkdirSync(path.join(here, "data"), { recursive: true });

  // Dịch live: mọi tiếng nguồn và ngưỡng im lặng 50 ms như cài đặt mặc định của app; bật dịch trong lúc nói.
  const sessionOut = path.join(out, `session.${lang}.json`);
  execFileSync(
    paths.bench,
    [
      "session",
      "--wav", paths.wav,
      "--truth", paths.truth,
      "--asr-worker", paths.asrWorker,
      "--asr-model", paths.asrModel,
      "--llama-server", paths.llamaServer,
      "--mt-model", paths.mtModel,
      "--languages", "en,zh,ja,ko,vi",
      "--target", script.target,
      "--end-silence-ms", "50",
      "--streaming",
      "--out", sessionOut,
    ],
    { cwd: root, stdio: "inherit" },
  );
  const live = slimLive(JSON.parse(readFileSync(sessionOut, "utf8")));
  const problems = liveProblems(live);
  if (problems.length > 0) {
    console.error(`Không dùng được lượt chạy này:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  writeFileSync(path.join(here, "data", `live.${lang}.json`), `${JSON.stringify(live, null, 1)}\n`);
  for (const e of live.events) {
    if (e.kind === "subtitle" && e.status === "done" && !e.provisional) console.log(`  ${e.src_text}\n  → ${e.tgt_text}`);
  }

  // Gõ dịch: câu trả lời qua đúng hàm dịch của ô soạn.
  const mtDir = path.join(out, `mt.${lang}`);
  rmSync(mtDir, { recursive: true, force: true });
  mkdirSync(mtDir, { recursive: true });
  const testset = path.join(mtDir, "testset.jsonl");
  const { reply, replyLang, replyTarget } = script.chat;
  const item = { id: "reply", dir: `${replyLang}-${replyTarget}`, src_lang: replyLang, tgt_lang: replyTarget, src: reply };
  writeFileSync(testset, `${JSON.stringify(item)}\n`);
  execFileSync(
    paths.bench,
    ["mt-eval", "--testset", testset, "--llama-server", paths.llamaServer, "--model", paths.mtModel, "--out-dir", mtDir, "--variant", "plain"],
    { cwd: root, stdio: "inherit" },
  );
  const stem = path.basename(paths.mtModel, ".gguf");
  const row = JSON.parse(readFileSync(path.join(mtDir, `${stem}-plain.jsonl`), "utf8").trim());
  const meta = JSON.parse(readFileSync(path.join(mtDir, `${stem}-plain.meta.json`), "utf8"));
  const compose = composeFrom(row, meta, reply);
  writeFileSync(path.join(here, "data", `compose.${lang}.json`), `${JSON.stringify(compose, null, 1)}\n`);
  console.log(`  ${compose.src}\n  → ${compose.hyp} (${compose.total_ms} ms)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2] ?? "vi");
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/data.test.mjs`
Kỳ vọng: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/data.mjs scripts/demo-video/data.test.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): lấy chữ thật bằng latency-bench session và mt-eval

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Chạy lấy chữ thật và duyệt nội dung

**Files:**
- Create (sinh ra): `scripts/demo-video/data/live.vi.json`, `scripts/demo-video/data/compose.vi.json`
- Có thể sửa: `scripts/demo-video/script.vi.json` (chỉ câu chữ kịch bản, Step 3)

- [ ] **Step 1: Chạy khi máy rảnh**

Nhắc chủ dự án tạm không chạy việc nặng khoảng 1 phút (latency-bench phát âm thanh theo thời gian thực, máy bận thì số đo lệch). Rồi:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node scripts/demo-video/data.mjs vi
```
Kỳ vọng:
- latency-bench chạy hết session, in danh sách câu gốc kèm bản dịch, rồi câu tiếng Việt kèm bản dịch tiếng Anh và số ms;
- không có dòng `Không dùng được lượt chạy này`.

Nếu báo phát lại chậm hay tiến trình phụ khởi động lại thì chạy lại. Nếu có lỗi khác thì dừng và dùng superpowers:systematic-debugging.

Sau khi chạy (cả khi lỗi), kiểm không còn tiến trình phụ sót:
```bash
pgrep -fl "src-tauri/binaries/(asr-worker|llama-server)" || echo "không còn tiến trình phụ"
```
Nếu còn thì chỉ tắt đúng các pid có đường dẫn trong `…/ai-translator/src-tauri/binaries/`. Không đụng tiến trình của app AI Translator đã cài.

- [ ] **Step 2: Duyệt nội dung (cổng trung thực, spec §4)**

Đọc các dòng in ra ở Step 1. Đạt khi:
- câu gốc khớp nghĩa với câu trong kịch bản; khác dấu câu hay hoa thường thì được;
- mỗi bản dịch tiếng Việt đúng nghĩa và tự nhiên;
- bản dịch tiếng Anh của câu trả lời đúng nghĩa.

Kiểm máy đo, phục vụ dòng chữ nhỏ ở màn kết:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node -e 'const l=require("./scripts/demo-video/data/live.vi.json"); console.log(l.machine, l.run, l.events.filter(e=>e.kind==="live").length + " sự kiện live")'
```
Kỳ vọng: `machine` cho thấy Apple M4 Pro. Nếu là máy khác, sửa `outro.fine` trong `script.vi.json` cho đúng tên máy.

- [ ] **Step 3: Nếu chữ chưa đạt**

**Không sửa** `data/*.json`. Sửa câu trong `voice.lines` (cho câu bị nhận dạng hay dịch sai) hoặc `chat.reply`, dùng từ thông dụng hơn, rồi chạy lại Task 3 Step 1 và Task 5 Step 1. Lặp tới khi đạt.

- [ ] **Step 4: Commit dữ liệu**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/data/ scripts/demo-video/script.vi.json && git commit -m "$(cat <<'EOF'
chore(demo-video): chữ phụ đề và bản dịch Gõ dịch do code của app tạo ra

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Lịch thời gian

**Files:**
- Create: `scripts/demo-video/timeline.mjs`
- Test: `scripts/demo-video/timeline.test.mjs`

- [ ] **Step 1: Viết test**

`scripts/demo-video/timeline.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPTURE_DISPLAY_MS,
  FRAME_MS,
  buildTimeline,
  levelAt,
  revealDeltas,
  subtitleEvents,
  typingSchedule,
  visibility,
} from "./timeline.mjs";

test("sự kiện phụ đề dời theo lúc giọng bắt đầu cộng 80 ms, giữ thứ tự, bỏ t_ms và kind", () => {
  const events = [
    { t_ms: 1000, kind: "live", id: 1, src_stable: "We" },
    { t_ms: 1000, kind: "indicators", streamingUnavailable: false },
    { t_ms: 2500.5, kind: "subtitle", id: 1, status: "done" },
    { t_ms: 2600, kind: "live_end", id: 1 },
    { t_ms: 2700, kind: "delta", id: 2, text: "x" },
  ];
  assert.deepEqual(subtitleEvents(events, 3000), [
    { at: 3000 + 1000 + CAPTURE_DISPLAY_MS, event: "subtitle://live", payload: { id: 1, src_stable: "We" } },
    { at: 3000 + 2500.5 + CAPTURE_DISPLAY_MS, event: "subtitle://upsert", payload: { id: 1, status: "done" } },
    { at: 3000 + 2600 + CAPTURE_DISPLAY_MS, event: "subtitle://live-end", payload: { id: 1 } },
    { at: 3000 + 2700 + CAPTURE_DISPLAY_MS, event: "subtitle://delta", payload: { id: 2, text: "x" } },
  ]);
});

test("mức âm lượng theo khung 100 ms, ngoài phần giọng là 0", () => {
  const voice = { levelWindowMs: 100, levels: [0.1, 0.2] };
  assert.equal(levelAt(voice, 3000, 2999), 0);
  assert.equal(levelAt(voice, 3000, 3000), 0.1);
  assert.equal(levelAt(voice, 3000, 3199), 0.2);
  assert.equal(levelAt(voice, 3000, 3200), 0);
});

test("lịch gõ theo nhịp ký tự, dấu cách, dấu câu; chữ có dấu tính một ký tự", () => {
  const steps = typingSchedule("Dạ, em", 1000, { charMs: 70, spaceMs: 110, punctuationMs: 260 });
  assert.deepEqual(
    steps.map((s) => s.text),
    ["D", "Dạ", "Dạ,", "Dạ, ", "Dạ, e", "Dạ, em"],
  );
  assert.deepEqual(
    steps.map((s) => s.at),
    [1000, 1070, 1140, 1400, 1510, 1580],
  );
});

test("nhịp gõ không được chạm thời gian chờ 400 ms của ô soạn", () => {
  assert.throws(() => typingSchedule("a", 0, { charMs: 70, spaceMs: 110, punctuationMs: 400 }), /punctuationMs/);
});

test("bản dịch về dần: đủ chữ, mảnh đầu ở first_token_ms, các mảnh tăng dần và trước total_ms", () => {
  const d = revealDeltas("I'll send it by Friday.", 30, 430);
  assert.equal(d.map((x) => x.text).join(""), "I'll send it by Friday.");
  assert.equal(d[0].after, 30);
  assert.ok(d.at(-1).after < 430);
  for (let i = 1; i < d.length; i++) assert.ok(d[i].after > d[i - 1].after);
});

test("bản dịch về một lần khi thời gian dịch ngắn hơn một khung", () => {
  assert.deepEqual(revealDeltas("Hi.", 10, 20), [{ after: 10, text: "Hi." }]);
});

test("độ hiện của cảnh: mờ qua 400 ms quanh mép, cảnh bắt đầu từ 0 hiện ngay", () => {
  assert.equal(visibility(0, [0, 1000]), 1);
  assert.equal(visibility(1000, [0, 1000]), 0.5);
  assert.equal(visibility(1200, [0, 1000]), 0);
  assert.equal(visibility(800, [1000, 2000]), 0);
  assert.equal(visibility(1000, [1000, 2000]), 0.5);
  assert.equal(visibility(1300, [1000, 2000]), 1);
});

const SCRIPT = {
  timing: {
    hookMs: 3000,
    liveHoldMs: 2500,
    outroMs: 5000,
    chat: {
      sarahMsgMs: 700,
      hotkeyMs: 2000,
      pressMs: 200,
      openAfterHotkeyMs: 250,
      typingAfterOpenMs: 600,
      pace: { charMs: 70, spaceMs: 110, punctuationMs: 260 },
      readMs: 1600,
      pasteMs: 150,
      reviewMs: 1200,
      holdMs: 2200,
    },
  },
  captions: { hook: { title: "H", sub: "" }, live: { title: "L", sub: "l" }, chat: { title: "C", sub: "c" } },
  chat: { reply: "Dạ." },
};
const VOICE = { durationMs: 10_000, levelWindowMs: 100, levels: [0.1, 0, 0.3] };
const LIVE = { events: [{ t_ms: 11_000, kind: "subtitle", id: 1, status: "done" }] };
const COMPOSE = { hyp: "Yes.", total_ms: 300, first_token_ms: 20 };

test("lịch cả video: cảnh live hết sau sự kiện cuối, Gõ dịch đúng thứ tự, tổng độ dài, tiếng gõ", () => {
  const tl = buildTimeline(SCRIPT, VOICE, LIVE, COMPOSE);
  // Sự kiện cuối (3000 + 11 000 + 80) muộn hơn lúc hết giọng (3000 + 10 000).
  const liveEnd = 3000 + 11_000 + CAPTURE_DISPLAY_MS + 2500;
  assert.deepEqual(tl.scenes.live, [0, liveEnd]);
  const c = tl.chat;
  assert.equal(c.sarahAt, liveEnd + 700);
  assert.equal(c.hotkeyAt, liveEnd + 2000);
  assert.equal(c.pressAt, liveEnd + 2200);
  assert.equal(c.composeOpenAt, liveEnd + 2250);
  assert.deepEqual(
    c.typing.map((k) => k.at),
    [liveEnd + 2850, liveEnd + 2920, liveEnd + 2990],
  );
  assert.equal(c.translateAt, liveEnd + 2990 + 400);
  assert.equal(c.translatedAt, c.translateAt + 300);
  assert.equal(c.enter1At, c.translatedAt + 1600);
  assert.equal(c.pasteAt, c.enter1At + 150);
  assert.equal(c.enter2At, c.pasteAt + 1200);
  assert.deepEqual(tl.scenes.chat, [liveEnd, c.enter2At + 2200]);
  assert.equal(tl.totalMs, c.enter2At + 2200 + 5000);
  assert.equal(tl.frames, Math.ceil(tl.totalMs / FRAME_MS));
  assert.deepEqual(tl.clicks, [c.pressAt, ...c.typing.map((k) => k.at), c.enter1At, c.enter2At]);
  assert.deepEqual(
    tl.overlayEvents.map((e) => e.event),
    ["audio://level", "audio://level", "audio://level", "subtitle://upsert"],
  );
  assert.deepEqual(
    tl.captions.map((x) => [x.title, x.from, x.to]),
    [
      ["H", 0, 3000],
      ["L", 3000, liveEnd],
      ["C", liveEnd, c.enter2At + 2200],
    ],
  );
  assert.equal(tl.posterMs, liveEnd - 1250);
  assert.equal(tl.compose.text, "Yes.");
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/timeline.test.mjs`
Kỳ vọng: FAIL, không tìm thấy `timeline.mjs`.

- [ ] **Step 3: Viết module**

`scripts/demo-video/timeline.mjs`:
```js
// Lịch thời gian của video (spec 2026-10-21-demo-video §3): module thuần, dùng chung cho trang dựng cảnh (stage.mjs, trình
// duyệt) và phần âm thanh (render.mjs, Node). Mọi mốc là ms tính từ đầu video.

export const FPS = 30;
export const FRAME_MS = 1000 / FPS;
// Phần latency-bench không đo: thu âm và resample 30–60 ms, tới màn hình 10–20 ms (bench/2026-10-10-do-tre/README.md mục 0).
// Lấy cận trên để video không nhanh hơn thật.
export const CAPTURE_DISPLAY_MS = 80;
// Ô soạn chờ chừng này sau ký tự cuối rồi mới xin dịch (`DEBOUNCE_MS` của src/store/compose.ts). render.mjs kiểm lại bằng lần
// gọi thật, nên số này lệch với app thì lần quay báo lỗi.
export const COMPOSE_DEBOUNCE_MS = 400;
export const CROSSFADE_MS = 400;

// Sự kiện của latency-bench → sự kiện Tauri mà thanh phụ đề nghe (src-tauri/src/events.rs).
const EVENT_NAMES = {
  subtitle: "subtitle://upsert",
  delta: "subtitle://delta",
  live: "subtitle://live",
  live_end: "subtitle://live-end",
};

/** Sự kiện phụ đề đặt vào video: lúc giọng bắt đầu + `t_ms` + phần không đo. Giữ thứ tự và nội dung. */
export function subtitleEvents(events, voiceStartMs) {
  return events
    .filter((e) => Object.hasOwn(EVENT_NAMES, e.kind))
    .map(({ t_ms, kind, ...payload }) => ({ at: voiceStartMs + t_ms + CAPTURE_DISPLAY_MS, event: EVENT_NAMES[kind], payload }));
}

/** Mức âm lượng cho chấm "đang nghe" của thanh phụ đề (`audio://level`), mỗi khung của voice.json một lần. */
export function levelEvents(levels, windowMs, voiceStartMs) {
  return levels.map((rms, i) => ({ at: voiceStartMs + i * windowMs, event: "audio://level", payload: rms }));
}

/** Mức âm lượng của giọng ở thời điểm `t` (0 ngoài phần giọng). */
export function levelAt(voice, voiceStartMs, t) {
  const i = Math.floor((t - voiceStartMs) / voice.levelWindowMs);
  return i >= 0 && i < voice.levels.length ? voice.levels[i] : 0;
}

/** Lịch gõ từng ký tự; mỗi bước là chữ đã có trong ô. Mọi khoảng cách dưới thời gian chờ của ô soạn: chỉ một lần xin dịch. */
export function typingSchedule(text, startMs, pace) {
  for (const [k, v] of Object.entries(pace)) {
    if (v >= COMPOSE_DEBOUNCE_MS) throw new Error(`pace.${k} = ${v} ms: phải dưới ${COMPOSE_DEBOUNCE_MS} ms`);
  }
  const chars = Array.from(text.normalize("NFC"));
  const steps = [];
  let at = startMs;
  chars.forEach((ch, i) => {
    steps.push({ at, text: chars.slice(0, i + 1).join("") });
    at += /[,.!?]/.test(ch) ? pace.punctuationMs : ch === " " ? pace.spaceMs : pace.charMs;
  });
  return steps;
}

/** Bản dịch của ô soạn về dần (xấp xỉ stream từng token): mảnh đầu ở `firstMs`, rải đều mỗi khung, mảnh cuối trước `totalMs`. */
export function revealDeltas(text, firstMs, totalMs) {
  const chars = Array.from(text);
  const span = Math.max(0, totalMs - firstMs);
  const n = Math.max(1, Math.min(chars.length, Math.round(span / FRAME_MS)));
  const out = [];
  let shown = 0;
  for (let k = 0; k < n; k++) {
    const upto = Math.ceil((chars.length * (k + 1)) / n);
    if (upto > shown) out.push({ after: firstMs + (span * k) / n, text: chars.slice(shown, upto).join("") });
    shown = upto;
  }
  return out;
}

/** Độ hiện (0–1) của một cảnh [from, to): mờ dần qua `ms` quanh hai mép; cảnh bắt đầu từ 0 thì hiện ngay. */
export function visibility(t, [from, to], ms = CROSSFADE_MS) {
  const fadeIn = from <= 0 ? 1 : (t - from) / ms + 0.5;
  const fadeOut = (to - t) / ms + 0.5;
  return Math.max(0, Math.min(1, fadeIn, fadeOut));
}

/** Lịch cả video từ kịch bản và dữ liệu thật (voice.json, live.json, compose.json). */
export function buildTimeline(script, voice, live, compose) {
  const s = script.timing;
  const c = s.chat;
  const voiceStartMs = s.hookMs;
  const subtitles = subtitleEvents(live.events, voiceStartMs);
  const lastAt = subtitles.length > 0 ? subtitles.at(-1).at : voiceStartMs;
  const liveEnd = Math.max(voiceStartMs + voice.durationMs, lastAt) + s.liveHoldMs;
  const hotkeyAt = liveEnd + c.hotkeyMs;
  const pressAt = hotkeyAt + c.pressMs;
  const composeOpenAt = hotkeyAt + c.openAfterHotkeyMs;
  const typing = typingSchedule(script.chat.reply, composeOpenAt + c.typingAfterOpenMs, c.pace);
  const translateAt = typing.at(-1).at + COMPOSE_DEBOUNCE_MS;
  const translatedAt = translateAt + compose.total_ms;
  const enter1At = translatedAt + c.readMs;
  const pasteAt = enter1At + c.pasteMs;
  const enter2At = pasteAt + c.reviewMs;
  const chatEnd = enter2At + c.holdMs;
  const totalMs = chatEnd + s.outroMs;
  return {
    totalMs,
    frames: Math.ceil(totalMs / FRAME_MS),
    voiceStartMs,
    posterMs: liveEnd - s.liveHoldMs / 2,
    scenes: { live: [0, liveEnd], chat: [liveEnd, chatEnd], outro: [chatEnd, Number.POSITIVE_INFINITY] },
    captions: [
      { ...script.captions.hook, from: 0, to: voiceStartMs },
      { ...script.captions.live, from: voiceStartMs, to: liveEnd },
      { ...script.captions.chat, from: liveEnd, to: chatEnd },
    ],
    overlayEvents: [...subtitles, ...levelEvents(voice.levels, voice.levelWindowMs, voiceStartMs)].sort((a, b) => a.at - b.at),
    chat: { sarahAt: liveEnd + c.sarahMsgMs, hotkeyAt, pressAt, composeOpenAt, typing, translateAt, translatedAt, enter1At, pasteAt, enter2At },
    compose: {
      text: compose.hyp,
      deltas: revealDeltas(compose.hyp, compose.first_token_ms ?? 0, compose.total_ms),
      totalMs: compose.total_ms,
    },
    clicks: [pressAt, ...typing.map((k) => k.at), enter1At, enter2At],
  };
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/timeline.test.mjs`
Kỳ vọng: `# pass 8`, `# fail 0`.

- [ ] **Step 5: Kiểm độ dài với dữ liệu thật**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node --input-type=module -e '
import { readFileSync } from "node:fs";
import { buildTimeline } from "./scripts/demo-video/timeline.mjs";
const j = (f) => JSON.parse(readFileSync(`scripts/demo-video/${f}`, "utf8"));
const tl = buildTimeline(j("script.vi.json"), j("data/voice.vi.json"), j("data/live.vi.json"), j("data/compose.vi.json"));
console.log((tl.totalMs / 1000).toFixed(1) + " giây", tl.frames + " khung", "hết cảnh live ở " + (tl.scenes.live[1] / 1000).toFixed(1) + " giây");'
```
Kỳ vọng: trong khoảng 30–60 giây (dự kiến khoảng 45–52). Nếu quá 60 giây, giảm `liveHoldMs`, `readMs`, `holdMs` hoặc bớt một câu, rồi chạy lại Task 3 và 5.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/timeline.mjs scripts/demo-video/timeline.test.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): lịch thời gian của video từ kịch bản và dữ liệu thật

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Đồng hồ ảo

**Files:**
- Create: `scripts/demo-video/vclock.js`
- Test: `scripts/demo-video/vclock.test.mjs`

- [ ] **Step 1: Viết test**

`scripts/demo-video/vclock.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./vclock.js", import.meta.url), "utf8");
const EPOCH = Date.UTC(2026, 9, 21, 2, 0, 0);

// MessageChannel giả cho vm (bản của Node giữ tiến trình test sống): mỗi tin nhắn là một tác vụ mới, như trình duyệt.
class FakeChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => setImmediate(() => this.port1.onmessage?.({})) };
  }
}

// Một "trang" giả trong vm: `top` là chính nó, hay là trang ngoài cùng (iframe).
function page(top) {
  const sandbox = { performance: { now: () => 123 }, requestAnimationFrame: () => 0, MessageChannel: FakeChannel, console };
  sandbox.window = sandbox;
  sandbox.top = top?.ctx ?? sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(source, ctx);
  return { ctx, run: (code) => vm.runInContext(code, ctx) };
}

test("hẹn giờ chạy theo thời điểm rồi theo thứ tự đặt, chỉ khi đồng hồ tiến tới", async () => {
  const p = page();
  p.run(`globalThis.log = []; setTimeout(() => log.push("b"), 200); setTimeout(() => log.push("a"), 100); setTimeout(() => log.push("a2"), 100);`);
  await p.run("__vclock.advanceTo(99)");
  assert.deepEqual(Array.from(p.run("log")), []);
  await p.run("__vclock.advanceTo(200)");
  assert.deepEqual(Array.from(p.run("log")), ["a", "a2", "b"]);
});

test("hẹn giờ đặt trong lúc chạy hẹn giờ khác, setInterval, clearTimeout, clearInterval", async () => {
  const p = page();
  p.run(`globalThis.log = [];
    setTimeout(() => { log.push("t" + performance.now()); setTimeout(() => log.push("u" + performance.now()), 0); }, 50);
    const iv = setInterval(() => log.push("i" + performance.now()), 40);
    const x = setTimeout(() => log.push("never"), 60); clearTimeout(x);
    setTimeout(() => clearInterval(iv), 100);`);
  await p.run("__vclock.advanceTo(130)");
  assert.deepEqual(Array.from(p.run("log")), ["i40", "t50", "u50", "i80"]);
});

test("giữa hai hẹn giờ, việc dồn lại (Promise) chạy xong, như hai tác vụ riêng của trình duyệt", async () => {
  const p = page();
  p.run(`globalThis.log = [];
    setTimeout(() => { Promise.resolve().then(() => Promise.resolve()).then(() => log.push("promise")); }, 10);
    setTimeout(() => log.push("timer"), 10);`);
  await p.run("__vclock.advanceTo(10)");
  assert.deepEqual(Array.from(p.run("log")), ["promise", "timer"]);
});

test("Date và performance.now theo đồng hồ ảo", async () => {
  const p = page();
  await p.run("__vclock.advanceTo(1500)");
  assert.equal(p.run("performance.now()"), 1500);
  assert.equal(p.run("Date.now()"), EPOCH + 1500);
  assert.equal(p.run("new Date().getTime()"), EPOCH + 1500);
  assert.equal(p.run("new Date(0).getTime()"), 0);
});

test("requestAnimationFrame chạy ở mốc khung 30 hình/giây kế tiếp", async () => {
  const p = page();
  await p.run("__vclock.advanceTo(10)");
  p.run("globalThis.log = []; requestAnimationFrame((ts) => log.push(ts));");
  await p.run("__vclock.advanceTo(40)");
  const log = Array.from(p.run("log"));
  assert.equal(log.length, 1);
  assert.ok(Math.abs(log[0] - 1000 / 30) < 1e-9);
});

test("không cho đồng hồ chạy lùi", async () => {
  const p = page();
  await p.run("__vclock.advanceTo(100)");
  await assert.rejects(() => Promise.resolve(p.run("__vclock.advanceTo(50)")), /lùi/);
});

test("lỗi trong một hẹn giờ không chặn các hẹn giờ sau", async () => {
  const p = page();
  const errors = [];
  p.ctx.errs = errors;
  p.run("globalThis.console = { error: (e) => errs.push(String(e)) }");
  p.run(`globalThis.log = []; setTimeout(() => { throw new Error("hỏng"); }, 10); setTimeout(() => log.push("sau"), 20);`);
  await p.run("__vclock.advanceTo(30)");
  assert.deepEqual(Array.from(p.run("log")), ["sau"]);
  assert.equal(errors.length, 1);
});

test("iframe dùng chung đồng hồ của trang ngoài cùng", async () => {
  const top = page();
  const frame = page(top);
  frame.run("globalThis.log = []; setTimeout(() => log.push(performance.now()), 70);");
  await top.run("__vclock.advanceTo(100)");
  assert.deepEqual(Array.from(frame.run("log")), [70]);
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/vclock.test.mjs`
Kỳ vọng: FAIL, `ENOENT … vclock.js`.

- [ ] **Step 3: Viết đồng hồ ảo**

`scripts/demo-video/vclock.js`:
```js
// Đồng hồ ảo cho render.mjs (spec 2026-10-21-demo-video §2.5). render.mjs nạp file này vào mọi frame trước script của trang
// (`Page.addScriptToEvaluateOnNewDocument`: trang dựng cảnh và hai iframe overlay.html, compose.html). Mọi frame dùng chung đồng
// hồ của trang ngoài cùng; thời gian chỉ tiến khi render.mjs gọi `await __vclock.advanceTo(ms)`, nên mỗi khung hình là đúng một
// thời điểm và lần dựng nào cũng ra như nhau. Thay Date, performance.now, setTimeout/setInterval, requestAnimationFrame;
// MessageChannel, Promise, fetch vẫn là thật. Mỗi hẹn giờ chạy như một tác vụ riêng (giữa hai hẹn giờ có một lượt MessageChannel
// thật, nên Promise và lượt vẽ của React chạy xong như trên trình duyệt). Bản thật của requestAnimationFrame giữ ở
// `__vclock.realFrame` (chờ trang vẽ xong).
(() => {
  const FRAME_MS = 1000 / 30;
  const EPOCH = Date.UTC(2026, 9, 21, 2, 0, 0);
  if (window === window.top) {
    const timers = new Map();
    let seq = 0;
    let now = 0;
    // Một lượt tác vụ thật: chờ tin nhắn MessageChannel về (mọi Promise đang dồn chạy xong trước đó).
    const channel = new MessageChannel();
    const waiting = [];
    channel.port1.onmessage = () => waiting.shift()?.();
    const tick = () =>
      new Promise((resolve) => {
        waiting.push(resolve);
        channel.port2.postMessage(0);
      });
    window.__vclock = {
      now: () => now,
      realFrame: window.requestAnimationFrame.bind(window),
      add(fn, delay, args, repeat) {
        const id = ++seq;
        const ms = Math.max(0, Number(delay) || 0);
        timers.set(id, { id, at: now + ms, order: id, fn, args, every: repeat ? Math.max(1, ms) : 0 });
        return id;
      },
      clear(id) {
        timers.delete(id);
      },
      async advanceTo(t) {
        if (t < now) throw new Error(`vclock: không lùi được từ ${now} về ${t}`);
        for (;;) {
          let next = null;
          for (const timer of timers.values()) {
            if (timer.at > t) continue;
            if (!next || timer.at < next.at || (timer.at === next.at && timer.order < next.order)) next = timer;
          }
          if (!next) break;
          now = next.at;
          if (next.every) {
            next.at += next.every;
            next.order = ++seq;
          } else {
            timers.delete(next.id);
          }
          try {
            if (typeof next.fn === "function") next.fn(...next.args);
          } catch (e) {
            console.error(e);
          }
          await tick();
        }
        now = t;
      },
    };
  }
  const clock = window.top.__vclock;
  const RealDate = Date;
  class VDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(EPOCH + clock.now());
      else super(...args);
    }
    static now() {
      return EPOCH + clock.now();
    }
  }
  window.Date = VDate;
  performance.now = () => clock.now();
  window.setTimeout = (fn, delay, ...args) => clock.add(fn, delay, args, false);
  window.setInterval = (fn, delay, ...args) => clock.add(fn, delay, args, true);
  window.clearTimeout = (id) => clock.clear(id);
  window.clearInterval = (id) => clock.clear(id);
  window.requestAnimationFrame = (fn) => clock.add(() => fn(clock.now()), FRAME_MS - (clock.now() % FRAME_MS), [], false);
  window.cancelAnimationFrame = (id) => clock.clear(id);
})();
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/vclock.test.mjs`
Kỳ vọng: `# pass 8`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/vclock.js scripts/demo-video/vclock.test.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): đồng hồ ảo dùng chung cho trang và iframe khi quay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Ghép tiếng

**Files:**
- Create: `scripts/demo-video/audio.mjs`
- Test: `scripts/demo-video/audio.test.mjs`

- [ ] **Step 1: Viết test**

`scripts/demo-video/audio.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIO_RATE, clickSample, mixAudio } from "./audio.mjs";

test("tiếng gõ phím lần nào cũng như nhau, dài 14 ms, không vượt 0,35", () => {
  const a = clickSample();
  assert.deepEqual(Array.from(a), Array.from(clickSample()));
  assert.equal(a.length, Math.round(0.014 * AUDIO_RATE));
  assert.ok(a.every((v) => Math.abs(v) <= 0.35));
  assert.ok(a.some((v) => Math.abs(v) > 0.05));
});

test("giọng đặt đúng mốc, tiếng gõ ở đúng chỗ, dài đúng totalMs", () => {
  const voice = new Float32Array(480).fill(0.5);
  const out = mixAudio({ voice, voiceStartMs: 1000, clicks: [500, 1500], totalMs: 2000 });
  assert.equal(out.length, 2 * AUDIO_RATE);
  assert.equal(out[47_999], 0);
  assert.equal(out[48_000], 0.5);
  assert.equal(out[48_479], 0.5);
  assert.equal(out[48_480], 0);
  const click = clickSample();
  assert.equal(out[24_000], click[0]);
  assert.equal(out[72_010], click[10]);
});

test("cộng dồn quá 1 thì kẹp lại", () => {
  const out = mixAudio({ voice: new Float32Array(10).fill(1.5), voiceStartMs: 0, clicks: [], totalMs: 1 });
  assert.deepEqual(Array.from(out.subarray(0, 10)), new Array(10).fill(1));
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/audio.test.mjs`
Kỳ vọng: FAIL, không tìm thấy `audio.mjs`.

- [ ] **Step 3: Viết module**

`scripts/demo-video/audio.mjs`:
```js
// Ghép tiếng của video (spec 2026-10-21-demo-video §2.5): giọng đọc đặt ở `voiceStartMs`, tiếng gõ phím tự sinh ở các mốc `clicks`,
// dài đúng `totalMs`. 48 kHz mono, giá trị trong [-1, 1].

export const AUDIO_RATE = 48_000;

/** Tiếng gõ phím: xung nhiễu trắng 14 ms tắt dần, bộ sinh số giả ngẫu nhiên cố định nên lần nào cũng như nhau. */
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

/** Trộn giọng và tiếng gõ thành một track dài `totalMs`. */
export function mixAudio({ voice, voiceStartMs, clicks, totalMs, rate = AUDIO_RATE }) {
  const out = new Float32Array(Math.round((totalMs / 1000) * rate));
  const add = (src, startMs) => {
    const offset = Math.round((startMs / 1000) * rate);
    for (let i = 0; i < src.length; i++) {
      const j = offset + i;
      if (j >= 0 && j < out.length) out[j] += src[i];
    }
  };
  add(voice, voiceStartMs);
  const click = clickSample(rate);
  for (const at of clicks) add(click, at);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/audio.test.mjs`
Kỳ vọng: `# pass 3`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/audio.mjs scripts/demo-video/audio.test.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): ghép giọng đọc và tiếng gõ phím

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Chỗ móc `demo=1` trong IPC giả

**Files:**
- Modify: `scripts/ui-preview/tauri-mock.ts` (đầu file, gần dòng 25, 63, 484–493, 568, 614–618, 723)

- [ ] **Step 1: Thêm dòng mô tả tham số**

Trong khối comment đầu file, ngay sau đoạn `//     lại ô khi bản nháp đang có, như Esc rồi ⌃⌥G)  paste=0 (tắt tự dán)`, thêm:
```ts
//   video giới thiệu (scripts/demo-video, spec 2026-10-21-demo-video §2.4): demo=1 thì không tự phát mức âm lượng ngẫu nhiên và
//     không tự mở ô soạn; trang dựng cảnh (frame ngoài cùng) phát sự kiện qua `window.__demoEmit` và trả lời lệnh dịch của ô soạn
//     qua `window.top.__demo.composeTranslate(id, emit)`
```

- [ ] **Step 2: Đọc tham số**

Sau dòng `const empty = param("empty") === "1";` thêm:
```ts
const demo = param("demo") === "1";
```

- [ ] **Step 3: Phát sự kiện từ ngoài vào**

Ngay sau hàm `export async function listen(…) { … }` (kết thúc bằng `return () => set.delete(handler);\n}`), thêm:
```ts

// Video giới thiệu: trang dựng cảnh phát sự kiện vào trang này và trả lời lệnh dịch của ô soạn (thay phía Rust).
type DemoHooks = { composeTranslate?: (id: number, emit: (event: string, payload: unknown) => void) => void };
const demoHooks = (): DemoHooks => (window.top as unknown as { __demo?: DemoHooks } | null)?.__demo ?? {};
if (demo) (window as unknown as { __demoEmit: typeof emit }).__demoEmit = emit;
```

- [ ] **Step 4: Tắt mức âm lượng ngẫu nhiên khi `demo=1`**

Đổi:
```ts
if (sessionParam === "running") {
```
thành:
```ts
if (sessionParam === "running" && !demo) {
```

- [ ] **Step 5: Lệnh dịch của ô soạn**

Đổi:
```ts
  compose_translate: () => {
    const id = ++composeId;
    setTimeout(() => composeAnswer(id), 60);
    return id;
  },
```
thành:
```ts
  compose_translate: () => {
    const id = ++composeId;
    const answer = demo ? demoHooks().composeTranslate : undefined;
    if (answer) answer(id, emit);
    else setTimeout(() => composeAnswer(id), 60);
    return id;
  },
```

- [ ] **Step 6: Không tự mở ô soạn khi `demo=1`**

Đổi:
```ts
  if (location.pathname.endsWith("compose.html")) {
```
thành:
```ts
  if (location.pathname.endsWith("compose.html") && !demo) {
```

- [ ] **Step 7: Kiểm kiểu và trang xem trước cũ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec tsc --noEmit && pnpm test
```
Kỳ vọng: `tsc` không báo lỗi; vitest đạt hết như trước.

Rồi chạy bộ kiểm giao diện sẵn có, bộ này không dùng `demo`, nên phải đạt như cũ:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && (node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 > /dev/null 2>&1 &) && sleep 3 && node scripts/ui-preview/check-live.mjs; status=$?; pkill -f "vite --config scripts/ui-preview/vite.config.ts --port 1431"; exit $status
```
Kỳ vọng: in đường dẫn các ảnh PNG, thoát mã 0 (không có dòng lỗi).

- [ ] **Step 8: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/ui-preview/tauri-mock.ts && git commit -m "$(cat <<'EOF'
feat(ui-preview): chỗ móc demo=1 cho trang dựng cảnh của video

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Trang dựng cảnh

**Files:**
- Create: `scripts/demo-video/stage.html`
- Create: `scripts/demo-video/stage.css`
- Create: `scripts/demo-video/stage.mjs`

- [ ] **Step 1: HTML**

`scripts/demo-video/stage.html`:
```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <title>AI Translator · video</title>
    <link rel="stylesheet" href="./stage.css" />
  </head>
  <body>
    <div id="stage"></div>
    <script type="module" src="./stage.mjs"></script>
  </body>
</html>
```

- [ ] **Step 2: CSS**

`scripts/demo-video/stage.css`:
```css
/* Trang dựng cảnh của video (stage.mjs): khung 540×960 điểm CSS. Không transition/animation: mọi chuyển động tính theo thời điểm
   trong stage.mjs, để mỗi khung hình chỉ phụ thuộc thời điểm. */
:root {
  --bg-top: #10131a;
  --bg-bottom: #1c2130;
  --text: #ffffff;
  --muted: #c3cad8;
  --accent: #6c8cff;
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
}

html,
body {
  margin: 0;
  background: var(--bg-top);
}

#stage {
  position: relative;
  width: 540px;
  height: 960px;
  overflow: hidden;
  background: linear-gradient(180deg, var(--bg-top), var(--bg-bottom));
  color: var(--text);
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
}

#stage > * {
  position: absolute;
}

.caption {
  left: 24px;
  top: 130px;
  width: 452px;
}
.caption .title {
  font-size: 27px;
  line-height: 1.22;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.caption .sub {
  margin-top: 8px;
  font-size: 15px;
  line-height: 1.35;
  color: var(--muted);
}

.window {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
}

.call {
  background: #1b1f29;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-sizing: border-box;
}
.call .bar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  background: #222735;
}
.call .light {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.light.red {
  background: #ff5f57;
}
.light.yellow {
  background: #febc2e;
}
.light.green {
  background: #28c840;
}
.call .name {
  margin-left: 8px;
  font-size: 12px;
  color: var(--muted);
}
.call .tile {
  position: absolute;
  inset: 28px 0 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: radial-gradient(circle at 50% 40%, #2a3146, #1b1f29 70%);
}
.avatar {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6c8cff, #9b6cff);
  color: #ffffff;
  font-size: 32px;
  font-weight: 700;
}
.avatar.small {
  width: 34px;
  height: 34px;
  font-size: 15px;
}
.call .who {
  font-size: 14px;
  color: #e6e9f2;
}
.call .self {
  position: absolute;
  right: 12px;
  top: 40px;
  display: grid;
  place-items: center;
  width: 84px;
  height: 56px;
  border-radius: 10px;
  background: #2b3142;
  font-size: 12px;
  color: var(--muted);
}

.frame {
  border: 0;
  background: transparent;
}
.compose-frame {
  width: 560px;
  height: 300px;
  transform-origin: 50% 0;
  filter: drop-shadow(0 18px 36px rgba(0, 0, 0, 0.45));
}

.chat {
  display: flex;
  flex-direction: column;
  background: #f4f6fb;
  color: #1d2433;
}
.chat .head {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 54px;
  padding: 0 16px;
  background: #ffffff;
  border-bottom: 1px solid #e3e7ef;
}
.chat .contact {
  font-size: 16px;
  font-weight: 600;
}
.chat .thread {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px;
}
.bubble {
  max-width: 78%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 16px;
  line-height: 1.35;
}
.bubble.theirs {
  align-self: flex-start;
  background: #ffffff;
  border: 1px solid #e3e7ef;
  border-bottom-left-radius: 6px;
}
.bubble.mine {
  align-self: flex-end;
  background: #4f6bff;
  color: #ffffff;
  border-bottom-right-radius: 6px;
}
.chat .input {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 12px 14px;
  padding: 10px 12px 10px 16px;
  border-radius: 22px;
  background: #ffffff;
  border: 1px solid #dfe4ee;
}
.chat .input .text {
  flex: 1;
  font-size: 15px;
  line-height: 1.35;
}
.chat .input .text.placeholder {
  color: #8a93a6;
}
.chat .input .send {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #4f6bff;
  color: #ffffff;
  font-size: 14px;
}

.keys {
  left: 0;
  width: 486px;
  display: flex;
  justify-content: center;
  gap: 10px;
}
.cap {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  min-width: 58px;
  height: 58px;
  padding: 0 12px;
  border-radius: 12px;
  background: #ffffff;
  color: #1d2433;
  font-size: 26px;
  font-weight: 600;
  box-shadow:
    0 5px 0 #b9c1d3,
    0 12px 26px rgba(0, 0, 0, 0.35);
}
.cap.wide {
  font-size: 20px;
}
.cap.down {
  translate: 0 4px;
  background: #eef1f7;
  box-shadow:
    0 1px 0 #b9c1d3,
    0 6px 14px rgba(0, 0, 0, 0.3);
}

.outro {
  left: 24px;
  top: 250px;
  width: 452px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}
.outro .icon {
  width: 112px;
  height: 112px;
  margin-bottom: 8px;
  border-radius: 26px;
}
.outro .name {
  font-size: 34px;
  font-weight: 700;
}
.outro .tagline {
  font-size: 18px;
  color: #e6e9f2;
}
.outro .url {
  font-size: 18px;
  font-weight: 600;
  color: var(--accent);
}
.outro .fine {
  margin-top: 26px;
  font-size: 11.5px;
  line-height: 1.45;
  color: #9aa3b5;
}

.guide {
  z-index: 10;
  background: rgba(255, 0, 0, 0.25);
  pointer-events: none;
}

.play {
  position: fixed;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  z-index: 20;
  padding: 14px 26px;
  border: 0;
  border-radius: 12px;
  background: var(--accent);
  color: #ffffff;
  font-size: 18px;
  cursor: pointer;
}
```

- [ ] **Step 3: Script**

`scripts/demo-video/stage.mjs`:
```js
// Trang dựng cảnh của video (spec 2026-10-21-demo-video §2.4): khung 540×960 điểm CSS (render.mjs chụp ở mật độ 2 → 1080×1920).
// Cửa sổ cuộc gọi, khung chat, chú thích, phím và màn kết do trang này vẽ theo thời điểm `t` (`render(t)` không giữ trạng thái:
// cùng `t` là cùng hình). Thanh phụ đề và ô Gõ dịch là đúng overlay.html, compose.html của app (iframe, IPC giả `demo=1`); sự
// kiện tới chúng theo lịch của timeline.mjs bằng setTimeout. render.mjs thay hẹn giờ bằng đồng hồ ảo (vclock.js); mở thẳng trong
// trình duyệt thì chạy theo giờ thật (bấm ▶ để phát, kèm giọng đọc), để xem nhanh.
//   http://127.0.0.1:1432/scripts/demo-video/stage.html?script=vi        thêm &guides=1 để tô đỏ phần ngoài vùng an toàn
import { buildTimeline, levelAt, visibility } from "./timeline.mjs";

const q = new URLSearchParams(location.search);
const lang = q.get("script") ?? "vi";
const load = async (name) => {
  const r = await fetch(new URL(name, import.meta.url));
  if (!r.ok) throw new Error(`không tải được ${name} (${r.status})`);
  return r.json();
};
const [script, voice, live, compose] = await Promise.all([
  load(`./script.${lang}.json`),
  load(`./data/voice.${lang}.json`),
  load(`./data/live.${lang}.json`),
  load(`./data/compose.${lang}.json`),
]);
const tl = buildTimeline(script, voice, live, compose);
const L = script.layout;
// Phần cài đặt mà phía Rust gửi kèm `compose://open` (ComposeView của src/lib/ipc.ts).
const COMPOSE_VIEW = { uiLanguage: lang, theme: "light", target: script.chat.replyTarget, autoPaste: true, blocked: null, platform: "macos" };
// Trong hai iframe: tắt transition/animation và con trỏ nhấp nháy (chạy theo giờ thật, làm các lần dựng khác nhau).
const FREEZE_CSS =
  "*,*::before,*::after{transition:none!important;animation:none!important}textarea{caret-color:transparent!important}";

const el = (tag, cls, parent, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
};
const place = (node, box) => {
  for (const k of ["left", "top", "width", "height"]) if (box[k] !== undefined) node.style[k] = `${box[k]}px`;
};

const stage = document.getElementById("stage");

const captions = tl.captions.map((c) => {
  const box = el("div", "caption", stage);
  el("div", "title", box, c.title);
  if (c.sub) el("div", "sub", box, c.sub);
  return box;
});

const call = el("div", "window call", stage);
place(call, L.call);
const bar = el("div", "bar", call);
for (const color of ["red", "yellow", "green"]) el("span", `light ${color}`, bar);
el("span", "name", bar, script.call.title);
const tile = el("div", "tile", call);
const avatar = el("div", "avatar", tile, script.call.initial);
el("div", "who", tile, `${script.call.speaker} · ${script.call.role}`);
el("div", "self", call, script.call.you);

const overlayFrame = el("iframe", "frame overlay-frame", stage);
place(overlayFrame, L.overlay);
overlayFrame.src = `/overlay.html?demo=1&session=running&empty=1&locked=1&lang=${lang}&size=${L.overlay.fontSize}`;

const chat = el("div", "window chat", stage);
place(chat, L.chat);
const head = el("div", "head", chat);
el("div", "avatar small", head, script.call.initial);
el("div", "contact", head, script.chat.contact);
const thread = el("div", "thread", chat);
const theirs = el("div", "bubble theirs", thread, script.chat.sarahMessage);
const mine = el("div", "bubble mine", thread, tl.compose.text);
const inputBox = el("div", "input", chat);
const inputText = el("div", "text", inputBox);
el("div", "send", inputBox, "➤");

// Ô Gõ dịch: đúng bề rộng thật 560 điểm (compose::WIDTH), thu nhỏ quanh mép trên cho vừa khung chat.
const composeFrame = el("iframe", "frame compose-frame", stage);
composeFrame.src = `/compose.html?demo=1&lang=${lang}&theme=light`;
composeFrame.style.top = `${L.compose.top}px`;
composeFrame.style.left = `${L.chat.left + L.chat.width / 2 - 280}px`;
composeFrame.style.transform = `scale(${L.compose.scale})`;

const hotkey = el("div", "keys", stage);
hotkey.style.top = `${L.keys.top}px`;
const hotkeyCaps = ["⌃", "⌥", "G"].map((k) => el("span", "cap", hotkey, k));
const enterKey = el("div", "keys", stage);
enterKey.style.top = `${L.keys.top}px`;
const enterCap = el("span", "cap wide", enterKey, "⏎ Enter");

const outro = el("div", "outro", stage);
const icon = el("img", "icon", outro);
icon.alt = "";
icon.src = "/src-tauri/icons/128x128@2x.png";
el("div", "name", outro, script.outro.name);
el("div", "tagline", outro, script.outro.tagline);
el("div", "url", outro, script.outro.url);
el("div", "fine", outro, script.outro.fine);

if (q.get("guides") === "1") {
  const s = L.safe;
  for (const box of [
    { left: 0, top: 0, width: 540, height: s.top },
    { left: 0, top: s.bottom, width: 540, height: 960 - s.bottom },
    { left: s.right, top: 0, width: 540 - s.right, height: 960 },
  ]) {
    place(el("div", "guide", stage), box);
  }
}

const show = (node, opacity, shift = "") => {
  node.style.opacity = String(opacity);
  node.style.visibility = opacity > 0 ? "visible" : "hidden";
  node.style.translate = shift;
};
const within = (t, from, to) => t >= from && t < to;
// Bật lên ở `at` (rõ dần trong `ms`), tắt ở `until`.
const pop = (t, at, until = Number.POSITIVE_INFINITY, ms = 160) => (t < at || t >= until ? 0 : Math.min(1, (t - at) / ms));

/** Vẽ đúng hình của thời điểm `t` (ms từ đầu video). */
function render(t) {
  const c = tl.chat;
  tl.captions.forEach((cap, i) => show(captions[i], visibility(t, [cap.from, cap.to])));

  const liveVis = visibility(t, tl.scenes.live);
  show(call, liveVis);
  show(overlayFrame, liveVis);
  const g = Math.min(1, levelAt(voice, tl.voiceStartMs, t) / 0.08);
  avatar.style.boxShadow = `0 0 0 ${4 + 10 * g}px rgba(108, 140, 255, ${0.15 + 0.55 * g})`;

  show(chat, visibility(t, tl.scenes.chat));
  const sarah = pop(t, c.sarahAt, Number.POSITIVE_INFINITY, 200);
  show(theirs, sarah, `0 ${(1 - sarah) * 8}px`);
  const sent = pop(t, c.enter2At + 80, Number.POSITIVE_INFINITY, 200);
  show(mine, sent, `0 ${(1 - sent) * 8}px`);
  const pasted = within(t, c.pasteAt, c.enter2At + 80);
  inputText.textContent = pasted ? tl.compose.text : script.chat.placeholder;
  inputText.classList.toggle("placeholder", !pasted);
  show(composeFrame, pop(t, c.composeOpenAt, c.enter1At + 60, 120));

  show(hotkey, pop(t, c.hotkeyAt - 100, c.hotkeyAt + 900, 120));
  const pressed = within(t, c.pressAt, c.pressAt + 180);
  for (const cap of hotkeyCaps) cap.classList.toggle("down", pressed);
  show(enterKey, Math.max(pop(t, c.enter1At - 120, c.enter1At + 600, 100), pop(t, c.enter2At - 120, c.enter2At + 600, 100)));
  enterCap.classList.toggle("down", within(t, c.enter1At, c.enter1At + 150) || within(t, c.enter2At, c.enter2At + 150));

  show(outro, visibility(t, tl.scenes.outro));
}

const loaded = (node) => new Promise((resolve) => node.addEventListener("load", resolve, { once: true }));
await Promise.all([
  loaded(overlayFrame),
  loaded(composeFrame),
  icon.complete ? Promise.resolve() : loaded(icon),
]);
for (const frame of [overlayFrame, composeFrame]) {
  if (typeof frame.contentWindow.__demoEmit !== "function") throw new Error(`${frame.src}: IPC giả chưa có demo=1`);
  const style = frame.contentDocument.createElement("style");
  style.textContent = FREEZE_CSS;
  frame.contentDocument.head.append(style);
}
await Promise.all([document.fonts.ready, overlayFrame.contentDocument.fonts.ready, composeFrame.contentDocument.fonts.ready]);

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
      for (const d of tl.compose.deltas) setTimeout(() => emit("compose://delta", { id, line: 0, text: d.text, reset: false }), d.after);
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
  render(0);
  window.__stage.ready = true;
} else {
  render(0);
  const play = el("button", "play", document.body, "▶ Phát");
  play.addEventListener("click", () => {
    play.remove();
    const audio = new Audio(`/target/demo-video/voice48.${lang}.wav`);
    const t0 = performance.now();
    start(t0);
    setTimeout(() => void audio.play(), tl.voiceStartMs);
    const frame = () => {
      const t = performance.now() - t0;
      render(t);
      if (t < tl.totalMs) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
```

- [ ] **Step 4: Xem nhanh trong Chrome không đầu**

Kiểm trang chạy không lỗi JS và hai iframe nhận sự kiện (chưa cần đồng hồ ảo):
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && (node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1432 > /dev/null 2>&1 &) && sleep 3 && node --input-type=module -e '
import { launch } from "./website/tools/browser/cdp.mjs";
const b = await launch();
const p = await b.newPage({ width: 540, height: 960, dpr: 2 });
await p.goto("http://127.0.0.1:1432/scripts/demo-video/stage.html?script=vi&guides=1");
await new Promise((r) => setTimeout(r, 3000));
console.log("ready:", await p.eval("typeof window.__stage === \"object\""));
console.log("lỗi:", p.errors.filter((e) => !e.includes("status of 404")));
await p.screenshot("target/demo-video/stage-t0.png");
await b.close();'
```
Kỳ vọng: `ready: true`, `lỗi: []`.

Xem `target/demo-video/stage-t0.png` (Read tool). Kỳ vọng:
- chú thích câu mở ở trên;
- cửa sổ cuộc gọi;
- thanh phụ đề ghi dòng chờ "đang chờ tiếng nói" của app;
- nút ▶ Phát;
- dải đỏ ở mép trên, mép dưới và mép phải.
Giữ server 1432 cho Task 11.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/stage.html scripts/demo-video/stage.css scripts/demo-video/stage.mjs && git commit -m "$(cat <<'EOF'
feat(demo-video): trang dựng cảnh dùng thanh phụ đề và ô Gõ dịch thật

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Quay, kiểm, xuất MP4

**Files:**
- Create: `scripts/demo-video/render.mjs`

- [ ] **Step 1: Viết script**

`scripts/demo-video/render.mjs`:
```js
// Quay video giới thiệu (spec 2026-10-21-demo-video §2.5, §5): mở stage.html trong Chrome không đầu với đồng hồ ảo (vclock.js),
// chụp từng khung 1080×1920 (540×960 điểm CSS, mật độ 2), ghép tiếng (audio.mjs) rồi gọi ffmpeg ra MP4. Kiểm luôn:
// - mỗi phụ đề chốt đã có trên thanh phụ đề ở đúng khung của nó;
// - ô soạn xin dịch đúng một lần, đúng lúc lịch tính;
// - trang không có lỗi JS;
// - video dài 30–60 giây.
// Kết quả kiểm ghi ở target/demo-video/checks.<ngôn ngữ>.json. Cần trang xem trước ở cổng 1432 và ffmpeg (`brew install ffmpeg`):
//   node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1432 &
//   node scripts/demo-video/render.mjs [--script vi]                              # → target/demo-video/ai-translator-demo.vi.mp4
//   node scripts/demo-video/render.mjs --png-dir <thư mục> --from 120 --to 240    # chỉ ghi PNG các khung [from, to), không ffmpeg
//     thêm --guides để tô đỏ phần ngoài vùng an toàn (chỉ khi ghi PNG)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { launch } from "../../website/tools/browser/cdp.mjs";
import { AUDIO_RATE, mixAudio } from "./audio.mjs";
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
const lang = opts.script;
const json = (file) => JSON.parse(readFileSync(path.join(here, file), "utf8"));
const script = json(`script.${lang}.json`);
const voice = json(`data/voice.${lang}.json`);
const tl = buildTimeline(script, voice, json(`data/live.${lang}.json`), json(`data/compose.${lang}.json`));
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

// Khung chính để xem lại (spec §5.5): tên → thời điểm.
const c = tl.chat;
const KEYS = {
  "01-mo-dau": 1500,
  "02-dang-noi": tl.voiceStartMs + 4000,
  "03-phu-de": tl.posterMs,
  "04-tin-nhan": c.sarahAt + 600,
  "05-phim-tat": c.pressAt + 60,
  "06-dang-go": c.typing[Math.floor(c.typing.length / 2)].at + 10,
  "07-ban-dich": c.translatedAt + 300,
  "08-da-dan": c.pasteAt + 400,
  "09-da-gui": c.enter2At + 700,
  "10-ket": tl.totalMs - 1500,
};
const keyFrames = new Map(Object.entries(KEYS).map(([name, ms]) => [Math.round(ms / FRAME_MS), name]));
const posterFrame = Math.round(tl.posterMs / FRAME_MS);

let ffmpeg = null;
let ffmpegDone = null;
if (full) {
  const voiceFile = path.join(out, `voice48.${lang}.wav`);
  const bytes = readFileSync(voiceFile);
  if (createHash("sha256").update(bytes).digest("hex") !== voice.sha256) {
    console.error(`${voiceFile} khác file đã dùng để lấy chữ (data/voice.${lang}.json): chạy lại voice.mjs rồi data.mjs.`);
    process.exit(1);
  }
  const audioFile = path.join(out, `audio.${lang}.wav`);
  const mixed = mixAudio({ voice: readWav(bytes).samples, voiceStartMs: tl.voiceStartMs, clicks: tl.clicks, totalMs: tl.totalMs });
  writeFileSync(audioFile, writeWav(mixed, AUDIO_RATE));
  mkdirSync(path.join(out, `keyframes.${lang}`), { recursive: true });
  const mp4 = path.join(out, `ai-translator-demo.${lang}.mp4`);
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
  const page = await browser.newPage({ width: 540, height: 960, dpr: 2 });
  await page.s.send("Page.addScriptToEvaluateOnNewDocument", { source: readFileSync(path.join(here, "vclock.js"), "utf8") });
  await page.goto(`${BASE}/scripts/demo-video/stage.html?script=${lang}${opts.guides ? "&guides=1" : ""}`);
  for (let i = 0; !(await page.eval("window.__stage?.ready === true")); i++) {
    if (i > 200) throw new Error(`trang dựng cảnh chưa sẵn sàng sau 20 giây: ${page.errors.join(" | ")}`);
    await sleep(100);
  }
  const finals = tl.overlayEvents.filter((e) => e.event === "subtitle://upsert" && e.payload.status === "done" && !e.payload.provisional);
  for (let i = 0; i < to; i++) {
    const t = i * FRAME_MS;
    // Tiến đồng hồ tới khung này, vẽ, rồi chờ hai khung thật của Chrome để trang (và iframe) vẽ xong.
    await page.eval(
      `(async () => { await __vclock.advanceTo(${t}); __stage.render(${t}); await new Promise((r) => __vclock.realFrame(() => __vclock.realFrame(r))); })()`,
    );
    for (const e of finals.filter((f) => f.at > t - FRAME_MS && f.at <= t)) {
      const shown = await page.eval(
        `document.querySelector(".overlay-frame").contentDocument.querySelector(".overlay .lines").textContent.includes(${JSON.stringify(e.payload.tgt_text)})`,
      );
      timing.push({ id: e.payload.id, scheduledMs: e.at, frameMs: t, shown });
      if (!shown) failures.push(`phụ đề ${e.payload.id} chưa có trên thanh phụ đề ở khung ${i} (${t.toFixed(1)} ms)`);
    }
    if (i < from) continue;
    const shot = Buffer.from((await page.s.send("Page.captureScreenshot", { format: "png" })).data, "base64");
    if (full) {
      if (!ffmpeg.stdin.write(shot)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
      if (i === posterFrame) writeFileSync(path.join(out, `poster.${lang}.png`), shot);
      if (keyFrames.has(i)) writeFileSync(path.join(out, `keyframes.${lang}`, `${keyFrames.get(i)}.png`), shot);
    } else {
      writeFileSync(path.join(pngDir, `${String(i).padStart(5, "0")}.png`), shot);
    }
    if (i % 150 === 0) console.log(`  khung ${i}/${to}`);
  }
  if (to * FRAME_MS > c.translatedAt) {
    const asked = await page.eval("__stage.log.translateAt");
    if (asked.length !== 1 || Math.abs(asked[0] - c.translateAt) > 1) {
      failures.push(`ô soạn xin dịch ${asked.length} lần (ở ${asked.join(", ")} ms), lịch tính một lần ở ${c.translateAt} ms`);
    }
  }
  failures.push(...page.errors.filter((e) => !e.includes("status of 404")).map((e) => `lỗi trong trang: ${e}`));
} finally {
  await browser.close();
}
if (full) {
  ffmpeg.stdin.end();
  await ffmpegDone;
}
writeFileSync(
  path.join(out, `checks.${lang}.json`),
  `${JSON.stringify({ totalMs: tl.totalMs, frames: tl.frames, range: [from, to], timing, failures }, null, 1)}\n`,
);
if (failures.length > 0) {
  console.error(`Không đạt:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Xong: khung ${from}–${to - 1} / ${tl.frames}, video ${(tl.totalMs / 1000).toFixed(1)} giây; đã kiểm ${timing.length} phụ đề chốt.`);
```

- [ ] **Step 2: Quay thử một đoạn có phụ đề (chỉ PNG)**

Server 1432 vẫn chạy từ Task 10; nếu không thì chạy lại lệnh vite ở Task 10 Step 4. Đoạn khung 120–360 (4–12 giây) gồm lúc giọng bắt đầu và các dòng phụ đề đầu:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node scripts/demo-video/render.mjs --png-dir target/demo-video/try-a --from 120 --to 360
```
Kỳ vọng:
- dòng `Xong: khung 120–359 …` và `đã kiểm N phụ đề chốt` (N ≥ 1);
- không có dòng `Không đạt`.
Lỗi thì dùng superpowers:systematic-debugging, không đoán.

- [ ] **Step 3: Xem vài khung**

Xem bằng Read tool:
- `target/demo-video/try-a/00150.png`: giọng vừa bắt đầu, vòng sáng quanh ảnh đại diện;
- `target/demo-video/try-a/00240.png`: có dòng đang nói, phần tạm nhạt hơn;
- `target/demo-video/try-a/00359.png`: có dòng phụ đề đã chốt.

Chụp thêm khung cuối của đoạn đó kèm dải vùng an toàn:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node scripts/demo-video/render.mjs --png-dir target/demo-video/try-guides --from 359 --to 360 --guides
```
Xem `target/demo-video/try-guides/00359.png`.

Đạt khi:
- chữ phụ đề rõ, mỗi dòng phụ đề không quá 3 dòng chữ;
- không có gì bị cắt mép;
- chú thích, cửa sổ cuộc gọi và thanh phụ đề không chạm dải đỏ.

Không đạt thì sửa `layout` trong `script.vi.json` rồi quay lại Step 2. Ví dụ: chữ quá to thì `overlay.fontSize` 22; thiếu chỗ thì đổi `overlay.top`/`height`.

- [ ] **Step 4: Kiểm dựng hai lần ra y hệt (spec §5.2)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node scripts/demo-video/render.mjs --png-dir target/demo-video/try-b --from 120 --to 360 && (cd target/demo-video/try-a && shasum -a 256 *.png) > target/demo-video/try-a.sha && (cd target/demo-video/try-b && shasum -a 256 *.png) > target/demo-video/try-b.sha && diff target/demo-video/try-a.sha target/demo-video/try-b.sha && echo "GIỐNG HỆT"
```
Kỳ vọng: `GIỐNG HỆT`.
- Nếu khác: tìm khung khác đầu tiên, so hai ảnh để biết phần nào chạy theo giờ thật (ví dụ thiếu một API thời gian trong `vclock.js`).
- Sửa, rồi chạy lại Step 2 và Step 4.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add scripts/demo-video/render.mjs scripts/demo-video/script.vi.json && git commit -m "$(cat <<'EOF'
feat(demo-video): quay từng khung bằng đồng hồ ảo, kiểm thời điểm phụ đề, xuất MP4

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Quay cả video và kiểm

**Files:** không có file mới trong repo (kết quả ở `target/demo-video/`).

- [ ] **Step 1: Quay cả video**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node scripts/demo-video/render.mjs --script vi
```
Kỳ vọng:
- `→ …/target/demo-video/ai-translator-demo.vi.mp4`, rồi các dòng tiến độ, rồi `Xong: khung 0–… , video 4x.x giây; đã kiểm N phụ đề chốt.`;
- không có `Không đạt`.

- [ ] **Step 2: Kiểm file (spec §5.4)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt,sample_rate,channels -show_entries format=duration -of default=nw=1 target/demo-video/ai-translator-demo.vi.mp4
```
Kỳ vọng:
- `codec_name=h264`, `width=1080`, `height=1920`, `r_frame_rate=30/1`, `pix_fmt=yuv420p`;
- `codec_name=aac`, `sample_rate=48000`, `channels=1`;
- `duration` trong khoảng 30–60.

- [ ] **Step 3: Xem khung chính (spec §5.5)**

Xem lần lượt bằng Read tool 10 ảnh trong `target/demo-video/keyframes.vi/` (`01-mo-dau.png` … `10-ket.png`) và `target/demo-video/poster.vi.png`. Đạt khi:
- **01:** câu mở;
- **02:** có dòng đang nói, chữ dịch hiện trong lúc giọng còn nói;
- **03:** các dòng phụ đề đã chốt;
- **04:** tin nhắn của Sarah;
- **05:** phím ⌃⌥G đang nhấn;
- **06:** ô Gõ dịch đang có nửa câu tiếng Việt;
- **07:** bản dịch tiếng Anh đầy đủ trong ô;
- **08:** câu tiếng Anh trong ô nhập của chat, ô Gõ dịch đã đóng;
- **09:** tin nhắn đã gửi;
- **10:** màn kết có dòng điều kiện đo;
- mọi thứ quan trọng nằm trong vùng an toàn, không chữ nào bị cắt.

Kiểm màu sau khi mã hóa (so với `poster.vi.png`):
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && ffmpeg -v error -y -ss 20 -i target/demo-video/ai-translator-demo.vi.mp4 -frames:v 1 target/demo-video/mp4-20s.png
```
Xem `target/demo-video/mp4-20s.png`. Kỳ vọng: màu nền và chữ giống ảnh chụp (không bị nhạt hay ám màu).

- [ ] **Step 4: Nghe đồng bộ**

Báo chủ dự án trước khi phát tiếng, rồi:
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && open target/demo-video/ai-translator-demo.vi.mp4
```
Nhờ chủ dự án xem cả video. Cần xác nhận:
- vòng sáng và chấm "đang nghe" khớp tiếng;
- phụ đề hiện sau tiếng, không trước;
- tiếng gõ khớp chữ hiện ra.

- [ ] **Step 5: Chạy lại mọi test**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node --test scripts/demo-video/*.test.mjs && pnpm exec tsc --noEmit
```
Kỳ vọng: mọi test đạt (33 test), `tsc` không lỗi.

- [ ] **Step 6: Dọn**

Tắt server Vite 1432 và kiểm không còn Chrome không đầu sót:
```bash
pkill -f "vite --config scripts/ui-preview/vite.config.ts --port 1432"; pgrep -fl "remote-debugging-port=9[3-8][0-9][0-9]" || echo "không còn Chrome không đầu"
```
Xóa các thư mục thử nếu muốn: `rm -rf target/demo-video/try-a target/demo-video/try-b target/demo-video/try-guides target/demo-video/*.sha`.

---

### Task 13: Bàn giao

- [ ] **Step 1: Báo chủ dự án**

Gửi:
- đường dẫn đầy đủ của `target/demo-video/ai-translator-demo.vi.mp4` và `poster.vi.png`;
- độ dài video;
- các câu phụ đề và bản dịch có trong video;
- dòng điều kiện đo.

Nhắc rằng:
- nhánh `demo-video` chưa push, chưa merge;
- muốn đổi câu thì sửa `script.vi.json` rồi chạy lại `voice.mjs` → `data.mjs` → `render.mjs`;
- muốn chỉ sửa hình thì chạy `render.mjs`.

- [ ] **Step 2: Hỏi bước tiếp**

Hỏi chủ dự án có muốn:
- merge nhánh vào `main`;
- thêm nhạc nền (tự thêm trên TikTok/Reels, hay ghép vào file);
- làm bản tiếng Anh hay bản ngang 16:9 (ngoài phạm vi spec, làm sau).
